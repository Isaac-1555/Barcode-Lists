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
      model: "openrouter/free",
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

async function extractBarcodesFromExcelText(rawValues) {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured. Please add it in Settings.");
  }

  const numberedList = rawValues.map((v, i) => `${i + 1}. ${v}`).join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": chrome.runtime.getURL(""),
      "X-Title": "Barcode Lists Extension"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b:free",
      messages: [
        {
          role: "user",
          content: `You are an expert at reading UPC/barcode numbers from spreadsheet data.

Below is a list of raw values from a spreadsheet UPC column. These values may contain spaces, dashes, or other formatting.

For each value:
1. Remove ALL spaces, dashes, and non-numeric characters
2. Return the full cleaned number with ALL digits intact

Rules:
- Return EXACTLY one cleaned number per line, in the same order as the input
- Do NOT include any explanation, numbering, labels, or text other than the numbers
- If a value does not contain a valid barcode (less than 5 digits after cleaning), skip it entirely
- Do NOT return empty lines
- Return ONLY the numeric results, nothing else

Raw values:
${numberedList}`
        }
      ],
      max_tokens: 2000,
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

  const barcodes = content
    .split("\n")
    .map(line => line.trim())
    .filter(line => /^\d{4,}$/.test(line));

  return [...new Set(barcodes)];
}

async function extractBarcodesFromDisplayPlan(rawValues, tableName) {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OpenRouter API key not configured. Please add it in Settings.");
  }

  const numberedList = rawValues.map((v, i) => `${i + 1}. ${v}`).join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": chrome.runtime.getURL(""),
      "X-Title": "Barcode Lists Extension"
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages: [
        {
          role: "user",
          content: `You are an expert at reading UPC/barcode numbers from a retail Display Plan spreadsheet.

This data comes from a store Display Plan file where each cell contains a product name followed by its UPC code. For example:
- "Kettle Chips 156-198g" has no UPC
- "Phil & Sebastian Coffee 62817644323" contains UPC: 62817644323
- "Smuckers Jams 5150002591" contains UPC: 5150002591
- "GM Cheerios 725 6563313414" contains UPC: 6563313414 (ignore the "725" prefix)

Your task:
1. For each value, identify if it contains a UPC/barcode number (10-14 digits)
2. UPC codes are often embedded within product names with sizes
3. Common patterns: "Product Name SIZE CODE" or "Brand Product CODE"
4. Extract ONLY the UPC code portion (10-14 consecutive digits that form a valid UPC)
5. If a cell contains multiple potential codes, extract the one that looks like a valid UPC (10-14 digits)
6. Do NOT include size numbers (like "156" in "156-198g") unless they are part of a 10-14 digit UPC

Rules:
- Return EXACTLY one UPC number per line, in the same order as the input
- Return ONLY the numeric UPC codes, nothing else
- Do NOT include any explanation, labels, or text other than the numbers
- If a value has no UPC code, return "NONE" on that line
- Valid UPC codes are 8, 12, 13, or 14 digits
- When you see numbers like "725 6563313414", extract "6563313414" (the 10-digit UPC)
- Remove spaces from multi-part UPCs like "515 000 2591" -> "5150002591"

Raw values from "${tableName}":
${numberedList}`
        }
      ],
      max_tokens: 3000,
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

  const barcodes = content
    .split("\n")
    .map(line => line.trim())
    .filter(line => /^\d{8,14}$/.test(line));

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
