chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SHOW_OVERLAY") {
    showOverlay(msg.message);
  }
  if (msg.type === "AUTO_ADD_START") {
    startAutoAdd(msg.barcodes, msg.config, msg.category);
  }
  if (msg.type === "AUTO_ADD_STOP") {
    stopAutoAdd();
  }
});

let autoAddState = null;

function getByXPath(xpath) {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    );
    return result.singleNodeValue;
  } catch (err) {
    return null;
  }
}

function setInputValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  if (descriptor && descriptor.set) {
    descriptor.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function waitForElement(xpath, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = getByXPath(xpath);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendToExtension(msg) {
  try {
    chrome.runtime.sendMessage(msg);
  } catch (err) {
    // extension context may be gone
  }
}

async function startAutoAdd(barcodes, config, category) {
  if (autoAddState) return;
  autoAddState = { stopped: false };

  let added = 0;

  try {
    for (let i = 0; i < barcodes.length; i++) {
      if (autoAddState.stopped) break;
      const barcode = barcodes[i];

      sendToExtension({ type: "AUTO_ADD_PROGRESS", index: i + 1, total: barcodes.length, barcode });

      const inputEl = getByXPath(config.searchInputXPath);
      if (!inputEl) {
        sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Search box not found: ${barcode}` });
        return;
      }
      setInputValue(inputEl, barcode);
      await sleep(config.delayMs);

      const searchBtn = getByXPath(config.searchButtonXPath);
      if (!searchBtn) {
        sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Search button not found: ${barcode}` });
        return;
      }
      searchBtn.click();
      await sleep(config.delayMs);

      const checkboxEl = await waitForElement(config.checkboxXPath, config.timeoutMs);
      if (!checkboxEl) {
        sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Result not found for: ${barcode}` });
        return;
      }
      checkboxEl.click();
      await sleep(config.delayMs);

      const addBtn = getByXPath(config.addButtonXPath);
      if (!addBtn) {
        sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Add button not found: ${barcode}` });
        return;
      }
      addBtn.click();

      added++;

      if (i < barcodes.length - 1 && !autoAddState.stopped) {
        await sleep(config.delayMs);
      }
    }
  } finally {
    const stopped = autoAddState.stopped;
    autoAddState = null;
    if (stopped) {
      sendToExtension({ type: "AUTO_ADD_STOPPED" });
    } else {
      sendToExtension({ type: "AUTO_ADD_DONE", added, total: barcodes.length });
    }
  }
}

function stopAutoAdd() {
  if (autoAddState) {
    autoAddState.stopped = true;
  }
}

function showOverlay(message) {
  const div = document.createElement("div");
  div.style.position = "fixed";
  div.style.top = "20px";
  div.style.right = "20px";
  div.style.backgroundColor = "#4CAF50";
  div.style.color = "white";
  div.style.padding = "16px";
  div.style.borderRadius = "8px";
  div.style.zIndex = "999999";
  div.style.fontFamily = "sans-serif";
  div.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
  div.style.cursor = "pointer";
  div.style.transition = "opacity 0.3s";
  
  div.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 4px;">Barcode Lists</div>
    <div>${message}</div>
    <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">Click to dismiss</div>
  `;
  
  div.onclick = () => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  };
  
  document.body.appendChild(div);
  
  setTimeout(() => {
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 300);
  }, 10000);
}
