const OPENROUTER_API_KEY_STORAGE = "openrouterApiKey";

async function getOpenRouterApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(OPENROUTER_API_KEY_STORAGE, (result) => {
      resolve(result[OPENROUTER_API_KEY_STORAGE] || null);
    });
  });
}

async function setOpenRouterApiKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [OPENROUTER_API_KEY_STORAGE]: key }, resolve);
  });
}

async function extractBarcodesFromImage(imageData, mimeType) {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured. Please add it in Settings.");
  }

  const base64Image = imageData.replace(/^data:image\/\w+;base64,/, "");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": chrome.runtime.getURL(""),
      "X-Title": "Barcode Lists Extension"
    },
    body: JSON.stringify({
      model: "nvidia/llama-3.1-nemotron-nano-12b-instruct",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert at reading 1D barcodes (UPC, EAN, Code 128, Code 39, etc.) from images.

Look at this image and extract ALL visible 1D barcode numbers. 

Rules:
1. Only return actual barcode numbers (numeric codes typically 8-14 digits for UPC/EAN)
2. Return each barcode on a separate line
3. Do not include any explanation or text other than the numbers
4. If multiple barcodes appear, list all of them
5. Only return numbers that are clearly part of a barcode pattern
6. If no barcodes are visible, return ONLY: NO_BARCODES_FOUND`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 401) {
      throw new Error("Invalid API key. Please check your OpenRouter API key in Settings.");
    }
    throw new Error(`API Error: ${response.status} - ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";

  if (content.trim() === "NO_BARCODES_FOUND") {
    return [];
  }

  const barcodes = content
    .split("\n")
    .map(line => line.trim())
    .filter(line => /^\d{3,}$/.test(line));

  return [...new Set(barcodes)];
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
