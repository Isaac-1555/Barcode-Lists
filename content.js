chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SHOW_OVERLAY") {
    showOverlay(msg.message);
  }
  if (msg.type === "AUTO_ADD_BATCH_START") {
    startAutoAddBatch(msg.batches, msg.config);
  }
  if (msg.type === "AUTO_TCO_BATCH_START") {
    startTcoBatches(msg.batches, msg.config);
  }
  if (msg.type === "SEARCH_BARCODE") {
    searchBarcode(msg.barcode, msg.config);
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

function closestEnabled(el) {
  let node = el;
  while (node && node.nodeType === 1) {
    if (!node.disabled && !node.hasAttribute("disabled")) return node;
    node = node.parentElement;
  }
  return el;
}

function waitForElementClickable(xpath, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(() => {
      const el = getByXPath(xpath);
      const clickable = el ? closestEnabled(el) : null;
      if (clickable) {
        clearInterval(interval);
        resolve(clickable);
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

function startAutoAddBatch(batches, config) {
  runAutoAddBatches(batches, config);
}

function startTcoBatches(batches, config) {
  runTcoBatches(batches, config);
}

async function runTcoBatches(batches, config) {
  if (autoAddState) return;
  autoAddState = { stopped: false, skipLoop: false, totalAdded: 0, totalSkipped: 0, totalEdited: 0, totalEditSkipped: 0 };

  let grandTotal = 0;
  batches.forEach(b => { grandTotal += b.barcodes.length; });

  try {
    for (let b = 0; b < batches.length; b++) {
      if (autoAddState.stopped) break;
      const batch = batches[b];
      autoAddState.skipLoop = false;

      sendToExtension({
        type: "AUTO_ADD_BATCH_STARTING",
        batchName: batch.name,
        batchIndex: b + 1,
        batchCount: batches.length
      });

      await doBatchSetup(config, batch.name);

      if (!autoAddState.skipLoop && !autoAddState.stopped) {
        await runAutoAddLoop(batch.barcodes, config, batch.name, b + 1, batches.length);
      }

      let editSkipped = 0;
      if (!autoAddState.skipLoop && !autoAddState.stopped) {
        const opened = await openBatchAndSelectAll(config);
        if (opened) {
          const editResult = await runTcoEditLoop(batch, config, b + 1, batches.length);
          editSkipped = editResult.skipped;
        }
      }

      if (!autoAddState.stopped) {
        sendToExtension({
          type: "AUTO_ADD_BATCH_DONE",
          batchName: batch.name,
          added: autoAddState.curAdded || 0,
          skipped: (autoAddState.curSkipped || 0) + editSkipped,
          total: batch.barcodes.length
        });
      }
    }
  } finally {
    const stopped = autoAddState.stopped;
    const added = autoAddState.totalAdded || 0;
    const edited = autoAddState.totalEdited || 0;
    const skipped = (autoAddState.totalSkipped || 0) + (autoAddState.totalEditSkipped || 0);
    autoAddState = null;
    if (stopped) {
      sendToExtension({ type: "AUTO_ADD_STOPPED" });
    } else {
      sendToExtension({ type: "AUTO_TCO_DONE", added, edited, skipped, total: grandTotal, batches: batches.length });
    }
  }
}

async function runAutoAddBatches(batches, config) {
  if (autoAddState) return;
  autoAddState = { stopped: false, skipLoop: false, totalAdded: 0, totalSkipped: 0 };

  let grandTotal = 0;
  batches.forEach(b => { grandTotal += b.barcodes.length; });

  try {
    for (let b = 0; b < batches.length; b++) {
      if (autoAddState.stopped) break;
      const batch = batches[b];
      autoAddState.skipLoop = false;

      sendToExtension({
        type: "AUTO_ADD_BATCH_STARTING",
        batchName: batch.name,
        batchIndex: b + 1,
        batchCount: batches.length
      });

      await doBatchSetup(config, batch.name);

      if (!autoAddState.skipLoop && !autoAddState.stopped) {
        await runAutoAddLoop(batch.barcodes, config, batch.name, b + 1, batches.length);
      }

      if (!autoAddState.stopped && config.endStepXPath) {
        const endEl = await waitForElementClickable(config.endStepXPath, config.timeoutMs);
        if (endEl) {
          endEl.click();
          console.log("[BarcodeLists] clicked end step breadcrumb");
        } else {
          sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: `End step (breadcrumb) not found after: ${batch.name}` });
        }
        await sleep(config.delayMs);
      }

      if (!autoAddState.stopped) {
        sendToExtension({
          type: "AUTO_ADD_BATCH_DONE",
          batchName: batch.name,
          added: autoAddState.curAdded || 0,
          skipped: autoAddState.curSkipped || 0,
          total: batch.barcodes.length
        });
      }
    }
  } finally {
    const stopped = autoAddState.stopped;
    const added = autoAddState.totalAdded || 0;
    const skipped = autoAddState.totalSkipped || 0;
    autoAddState = null;
    if (stopped) {
      sendToExtension({ type: "AUTO_ADD_STOPPED" });
    } else {
      sendToExtension({ type: "AUTO_ADD_DONE", added, skipped, total: grandTotal, batches: batches.length });
    }
  }
}

async function openBatchAndSigns(config, batchName) {
  const batchBtn = await waitForElement(config.batchCreateButtonXPath, config.timeoutMs);
  if (!batchBtn) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Create batch button not found" });
    autoAddState.skipLoop = true;
    return false;
  }
  batchBtn.click();
  await sleep(config.delayMs);
  console.log("[BarcodeLists] clicked create batch button");

  const nameInput = await waitForElement(config.batchNameInputXPath, config.timeoutMs);
  if (!nameInput) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Batch name box not found" });
    autoAddState.skipLoop = true;
    return false;
  }
  setInputValue(nameInput, batchName);
  await sleep(config.delayMs);
  console.log("[BarcodeLists] typed batch name:", batchName);

  const confirmBtn = await waitForElementClickable(config.batchCreateConfirmXPath, config.timeoutMs);
  if (!confirmBtn) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Create (confirm) button not found or disabled" });
    autoAddState.skipLoop = true;
    return false;
  }
  confirmBtn.click();
  console.log("[BarcodeLists] clicked create (confirm) button");
  await sleep(config.delayMs);

  const signsBtn = await waitForElement(config.signsDropdownXPath, config.timeoutMs);
  if (!signsBtn) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Add signs dropdown not found" });
    autoAddState.skipLoop = true;
    return false;
  }
  signsBtn.click();
  await sleep(config.delayMs);
  return true;
}

async function doBatchSetup(config, batchName) {
  const opened = await openBatchAndSigns(config, batchName);
  if (!opened) return;

  const itemLibrary = await waitForElement(config.itemLibraryOptionXPath, config.timeoutMs);
  if (!itemLibrary) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Item Library option not found" });
    autoAddState.skipLoop = true;
    return;
  }
  itemLibrary.click();
  await sleep(config.delayMs);
}

async function openBatchAndSelectAll(config) {
  sendToExtension({ type: "AUTO_STATUS", message: "Opening batch..." });
  const openEl = await waitForElementClickable(config.tcoOpenBatchXPath, config.timeoutMs);
  if (!openEl) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Open batch (breadcrumb) not found" });
    autoAddState.skipLoop = true;
    return false;
  }
  openEl.click();
  console.log("[BarcodeLists] opened the created batch");
  await sleep(config.delayMs);

  sendToExtension({ type: "AUTO_STATUS", message: "Selecting all signs..." });
  const selectAllEl = await waitForElementClickable(config.tcoSelectAllXPath, config.timeoutMs);
  if (!selectAllEl) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Select all (checkbox) not found in batch" });
    autoAddState.skipLoop = true;
    return false;
  }
  selectAllEl.click();
  console.log("[BarcodeLists] selected all signs in batch");
  await sleep(config.delayMs);

  const applied = await applyTcoTemplate(config);
  if (!applied) return false;
  return true;
}

async function applyTcoTemplate(config) {
  sendToExtension({ type: "AUTO_STATUS", message: "Applying template..." });

  const changeTemplateBtn = await waitForElementClickable(config.tcoChangeTemplateXPath, config.timeoutMs);
  if (!changeTemplateBtn) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Change template button not found" });
    autoAddState.skipLoop = true;
    return false;
  }
  changeTemplateBtn.click();
  console.log("[BarcodeLists] clicked change template");
  await sleep(config.delayMs);

  const templateCard = await waitForElementClickable(config.tcoTemplateOptionXPath, config.timeoutMs);
  if (!templateCard) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Template card (12up Managers' Special) not found" });
    autoAddState.skipLoop = true;
    return false;
  }
  templateCard.click();
  console.log("[BarcodeLists] selected template");
  await sleep(config.delayMs);

  const applyBtn = await waitForElementClickable(config.tcoApplyTemplateXPath, config.timeoutMs);
  if (!applyBtn) {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Apply template button not found or disabled" });
    autoAddState.skipLoop = true;
    return false;
  }
  applyBtn.click();
  console.log("[BarcodeLists] applied template");
  await sleep(config.delayMs);
  return true;
}

async function goBackToBatchList(config) {
  const backEl = await waitForElementClickable(config.tcoBackToBatchXPath, config.timeoutMs);
  if (backEl) {
    backEl.click();
    await sleep(config.delayMs);
  } else {
    sendToExtension({ type: "AUTO_ADD_ERROR", barcode: "-", message: "Back-to-batch breadcrumb not found" });
  }
}

async function runTcoEditLoop(batch, config, batchIndex, batchCount) {
  const barcodes = batch.barcodes;
  const prices = batch.prices || {};
  let edited = 0;
  let skipped = 0;

  for (let i = 0; i < barcodes.length; i++) {
    if (autoAddState.stopped) break;
    const barcode = barcodes[i];

    if (!prices[barcode]) {
      skipped++;
      autoAddState.totalEditSkipped++;
      continue;
    }

    sendToExtension({
      type: "AUTO_TCO_EDIT_PROGRESS",
      index: i + 1,
      total: barcodes.length,
      barcode,
      batchName: batch.name,
      batchIndex,
      batchCount
    });

    const inputEl = getByXPath(config.searchInputXPath);
    if (!inputEl) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Search box not found: ${barcode}` });
      skipped++;
      autoAddState.totalEditSkipped++;
      continue;
    }
    setInputValue(inputEl, "");
    setInputValue(inputEl, barcode);
    await sleep(config.delayMs);

    const searchBtn = getByXPath(config.searchButtonXPath);
    if (!searchBtn) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Search button not found: ${barcode}` });
      skipped++;
      autoAddState.totalEditSkipped++;
      continue;
    }
    searchBtn.click();
    await sleep(config.delayMs);

    const editLink = await waitForElementClickable(config.tcoEditSignXPath, config.timeoutMs);
    if (!editLink) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Sign not found for: ${barcode}` });
      skipped++;
      autoAddState.totalEditSkipped++;
      continue;
    }
    editLink.click();
    await sleep(config.delayMs);

    const priceField = await waitForElement(config.tcoPriceFieldXPath, config.timeoutMs);
    if (!priceField) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Price field not found for: ${barcode}` });
      skipped++;
      autoAddState.totalEditSkipped++;
      await goBackToBatchList(config);
      continue;
    }
    setInputValue(priceField, "");
    setInputValue(priceField, prices[barcode]);
    await sleep(config.delayMs);

    const saveBtn = await waitForElementClickable(config.tcoSaveButtonXPath, config.timeoutMs);
    if (!saveBtn) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Save button not found for: ${barcode}` });
      skipped++;
      autoAddState.totalEditSkipped++;
      await goBackToBatchList(config);
      continue;
    }
    saveBtn.click();
    console.log("[BarcodeLists] saved TCO price for:", barcode, "=", prices[barcode]);
    await sleep(config.delayMs);

    await goBackToBatchList(config);

    edited++;
    autoAddState.totalEdited++;
  }

  return { edited, skipped };
}

async function runAutoAddLoop(barcodes, config, batchName, batchIndex, batchCount) {
  let added = 0;
  let skipped = 0;

  for (let i = 0; i < barcodes.length; i++) {
    if (autoAddState.stopped) break;
    const barcode = barcodes[i];

    sendToExtension({
      type: "AUTO_ADD_PROGRESS",
      index: i + 1,
      total: barcodes.length,
      barcode,
      batchName,
      batchIndex,
      batchCount
    });

    const inputEl = getByXPath(config.searchInputXPath);
    if (!inputEl) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Search box not found: ${barcode}` });
      skipped++;
      continue;
    }
    setInputValue(inputEl, barcode);
    await sleep(config.delayMs);

    const searchBtn = getByXPath(config.searchButtonXPath);
    if (!searchBtn) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Search button not found: ${barcode}` });
      skipped++;
      continue;
    }
    searchBtn.click();
    await sleep(config.delayMs);

    const checkboxEl = await waitForElement(config.checkboxXPath, config.timeoutMs);
    if (!checkboxEl) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Result not found for: ${barcode}` });
      skipped++;
      continue;
    }
    checkboxEl.click();
    await sleep(config.delayMs);

    const addBtn = getByXPath(config.addButtonXPath);
    if (!addBtn) {
      sendToExtension({ type: "AUTO_ADD_ERROR", barcode, message: `Add button not found: ${barcode}` });
      skipped++;
      continue;
    }
    addBtn.click();

    added++;

    if (i < barcodes.length - 1 && !autoAddState.stopped) {
      await sleep(config.delayMs);
    }
  }

  autoAddState.curAdded = added;
  autoAddState.curSkipped = skipped;
  autoAddState.totalAdded += added;
  autoAddState.totalSkipped += skipped;
}

async function searchBarcode(barcode, config) {
  const inputEl = getByXPath(config.searchInputXPath);
  if (!inputEl) {
    sendToExtension({ type: "SEARCH_BARCODE_ERROR", barcode, message: "Search box not found" });
    return;
  }
  setInputValue(inputEl, "");
  setInputValue(inputEl, barcode);

  const searchBtn = getByXPath(config.searchButtonXPath);
  if (!searchBtn) {
    sendToExtension({ type: "SEARCH_BARCODE_ERROR", barcode, message: "Search button not found" });
    return;
  }
  searchBtn.click();

  sendToExtension({ type: "SEARCH_BARCODE_DONE", barcode });
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
