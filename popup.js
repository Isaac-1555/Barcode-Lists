const storageKey = "barcodeData";
const autoAddStorageKey = "autoAddConfig";
const runToastStorageKey = "dontShowRunToast";

const DEFAULT_AUTO_ADD_CONFIG = {
  searchInputXPath: '//*[@id="undefined_input"]',
  searchButtonXPath: '//*[@id="undefined_rightButton"]',
  checkboxXPath: '//*[@id="ItemView-select-all"]/span',
  addButtonXPath: '//*[@id="addSign"]',
  batchCreateButtonXPath: '//*[@id="batchFilter"]/div[2]/div/div[1]/cui-toolbar/div/cui-toolbar-group[1]/div/cui-button/span/button',
  batchNameInputXPath: '//*[@id="undefined"]',
  batchCreateConfirmXPath: '//*[@id="app_container"]/ppr-batch-create/div/div/div/cui-button[1]/span/button',
  signsDropdownXPath: '//*[@id="copyId_button"]',
  itemLibraryOptionXPath: '//*[@id="actionDropDown"]/span',
  delayMs: 1500,
  timeoutMs: 8000
};

let autoAddConfig = { ...DEFAULT_AUTO_ADD_CONFIG };
let autoAddRunning = false;
let dontShowRunToast = false;
let runToastSuppressed = false;
let runTipInterval = null;

let state = {
  categoryOrder: [],
  categories: {},
  comments: {},
  active: null,
  insertedBarcodes: {},
  unopenedCategories: {},
  importantCategories: {}
};

let session = null;
let isOnlineMode = false;
let draggedItem = null;
let draggedIndex = -1;
let pendingExtraction = [];
let selectedForExtraction = [];

document.addEventListener("DOMContentLoaded", async () => {
  chrome.action.setBadgeText({ text: "" }).catch(() => {});
  session = await getSession();
  
  if (session) {
    await initApp();
  } else {
    showLoginScreen();
  }
});

function showLoginScreen() {
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("mainApp").style.display = "none";
  
  document.getElementById("loginBtn").onclick = handleLogin;
  document.getElementById("loginPassword").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  document.getElementById("loginStore").focus();
}

async function handleLogin() {
  const storeInput = document.getElementById("loginStore");
  const passwordInput = document.getElementById("loginPassword");
  const errorEl = document.getElementById("loginError");
  const btn = document.getElementById("loginBtn");
  
  const storeNumber = storeInput.value.trim();
  const password = passwordInput.value;
  
  if (!storeNumber || !password) {
    errorEl.textContent = "Please enter store number and password";
    return;
  }
  
  btn.disabled = true;
  btn.textContent = "Logging in...";
  errorEl.textContent = "";
  
  try {
    session = await login(storeNumber, password);
    await initApp();
  } catch (err) {
    errorEl.textContent = err.message;
    btn.disabled = false;
    btn.textContent = "Login";
  }
}

async function initApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("mainApp").style.display = "flex";
  document.getElementById("storeLabel").textContent = session.storeNumber;
  
  await loadState();
  setupEventListeners();
  updateSyncStatus();
  
  if (isOnlineMode) {
    try {
      const remoteState = await syncFromRemote(session);
      state.categoryOrder = remoteState.categoryOrder;
      state.categories = remoteState.categories;
      state.comments = remoteState.comments;
      state.insertedBarcodes = remoteState.insertedBarcodes;
      state.importantCategories = remoteState.importantCategories;
      state.active = remoteState.active;
      saveState();
    } catch (err) {
      console.log("Sync failed, using local data:", err);
    }
  }
  
  if (state.categoryOrder.length === 0) {
    createCategory("Default");
  }
  
  render();
}

async function loadRemoteData() {
  if (!isOnlineMode || !session) return;
  try {
    const remoteState = await syncFromRemote(session);
    const oldOrder = state.categoryOrder;
    const newCategories = remoteState.categoryOrder.filter(n => !oldOrder.includes(n));

    state.categoryOrder = remoteState.categoryOrder;
    state.categories = remoteState.categories;
    state.comments = remoteState.comments;
    state.insertedBarcodes = remoteState.insertedBarcodes;
    state.importantCategories = remoteState.importantCategories;
    state.active = remoteState.active;
    saveState();

    for (const name of newCategories) {
      state.unopenedCategories[name] = true;
    }

    render();
    if (newCategories.length > 0) {
      showToast("List updated from phone");
    }
  } catch (err) {
    console.log("Auto-sync failed:", err);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "NEW_DATA") {
    loadRemoteData().then(() => sendResponse(true));
    return true;
  }
  if (msg.type === "AUTO_ADD_PROGRESS") {
    updateAutoAddStatus(`${msg.index}/${msg.total}: ${msg.barcode}`);
    if (!dontShowRunToast && !runToastSuppressed) {
      showRunToast(msg.total);
      document.getElementById("runToastProgress").textContent = `${msg.index} / ${msg.total} done`;
    }
  }
  if (msg.type === "AUTO_ADD_DONE") {
    const skipped = msg.skipped || 0;
    const summary = skipped > 0
      ? `Done: ${msg.added}/${msg.total} (${skipped} skipped)`
      : `Done: ${msg.added}/${msg.total}`;
    finishAutoAdd(summary);
    showToast(skipped > 0 ? `Auto-added ${msg.added}, skipped ${skipped}` : `Auto-added ${msg.added} barcode(s)`);
  }
  if (msg.type === "AUTO_ADD_ERROR") {
    updateAutoAddStatus(`Skipped ${msg.barcode}: ${msg.message}`);
    showToast(msg.message);
  }
  if (msg.type === "AUTO_ADD_STOPPED") {
    finishAutoAdd("Stopped by user");
    showToast("Auto-add stopped");
  }
  if (msg.type === "SEARCH_BARCODE_DONE") {
    markInserted(msg.barcode);
    showToast("Searched: " + msg.barcode);
  }
  if (msg.type === "SEARCH_BARCODE_ERROR") {
    showToast(msg.message);
  }
});

async function loadState() {
  if (!chrome.storage || !chrome.storage.local) {
    console.error("chrome.storage not available");
    return;
  }

  const result = await chrome.storage.local.get(storageKey);
  if (result[storageKey]) {
    const saved = result[storageKey];
    state.categoryOrder = saved.categoryOrder || [];
    state.categories = saved.categories || {};
    state.comments = saved.comments || {};
    state.active = saved.active || null;
    state.insertedBarcodes = saved.insertedBarcodes || {};
    state.unopenedCategories = saved.unopenedCategories || {};
    state.importantCategories = saved.importantCategories || {};
  }
  
  isOnlineMode = await isOnline();

  const runToastResult = await chrome.storage.local.get(runToastStorageKey);
  dontShowRunToast = !!runToastResult[runToastStorageKey];

  const autoAddResult = await chrome.storage.local.get(autoAddStorageKey);
  if (autoAddResult[autoAddStorageKey]) {
    autoAddConfig = { ...DEFAULT_AUTO_ADD_CONFIG, ...autoAddResult[autoAddStorageKey] };
  }
}

function saveState() {
  chrome.storage.local.set({
    [storageKey]: {
      categoryOrder: state.categoryOrder,
      categories: state.categories,
      comments: state.comments,
      active: state.active,
      insertedBarcodes: state.insertedBarcodes,
      unopenedCategories: state.unopenedCategories,
      importantCategories: state.importantCategories
    }
  });
}

async function saveAndSync() {
  saveState();
  
  if (isOnlineMode && session) {
    updateSyncStatus("online");
  }
}

function updateSyncStatus(status) {
  const el = document.getElementById("syncStatus");
  if (status) {
    el.className = "sync-status " + status;
    el.title = status === "online" ? "Connected" : 
               status === "offline" ? "Offline" : "Syncing...";
  } else {
    el.className = "sync-status " + (isOnlineMode ? "online" : "offline");
    el.title = isOnlineMode ? "Connected" : "Offline";
  }
}

function createCategory(name) {
  if (!name) return;
  const isImportant = name.startsWith('*');
  const cleanName = name.replace(/^\*+/, '').trim();
  if (!cleanName) return;
  if (state.categories[cleanName]) return;

  state.categories[cleanName] = [];
  state.categoryOrder.push(cleanName);
  state.active = cleanName;
  if (isImportant) {
    state.importantCategories[cleanName] = true;
  }
  saveAndSync();
  if (isOnlineMode && session) {
    syncCategoryOrder(session, state.categoryOrder).catch(console.error);
    if (isImportant) {
      markCategoryImportant(session, cleanName).catch(console.error);
    }
  }
  render();
}

function deleteCategory(name) {
  if (!confirm("Delete this category?")) return;

  const deletedName = name;
  delete state.categories[deletedName];
  delete state.unopenedCategories[deletedName];
  delete state.importantCategories[deletedName];
  state.categoryOrder = state.categoryOrder.filter(n => n !== deletedName);
  state.active = state.categoryOrder[0] || null;
  saveAndSync();
  if (isOnlineMode && session) {
    clearCategoryRemote(session, deletedName).catch(console.error);
    deleteCategoryOrder(session, deletedName).catch(console.error);
    unmarkCategoryImportant(session, deletedName).catch(console.error);
  }
  render();
}

function renameCategory(oldName, newName) {
  if (!newName || state.categories[newName]) return;

  state.categories[newName] = state.categories[oldName];
  delete state.categories[oldName];
  if (state.unopenedCategories[oldName]) {
    state.unopenedCategories[newName] = true;
    delete state.unopenedCategories[oldName];
  }
  if (state.importantCategories[oldName]) {
    state.importantCategories[newName] = true;
    delete state.importantCategories[oldName];
  }
  state.categoryOrder = state.categoryOrder.map(n => n === oldName ? newName : n);
  state.active = newName;
  saveAndSync();
  if (isOnlineMode && session) {
    renameCategoryRemote(session, oldName, newName).catch(console.error);
  }
  render();
}

function addBarcode(value) {
  if (!/^\d+$/.test(value)) {
    showToast("Numbers only");
    return;
  }

  const list = state.categories[state.active];

  if (list.includes(value)) {
    showToast("Duplicate");
    return;
  }

  list.push(value);
  delete state.insertedBarcodes[value];
  saveAndSync();
  if (isOnlineMode && session) {
    addBarcodeRemote(session, state.active, value).catch(console.error);
    unmarkBarcodeCopied(session, value).catch(console.error);
  }
  render();
}

function removeBarcode(value) {
  const list = state.categories[state.active];
  state.categories[state.active] = list.filter(v => v !== value);
  delete state.insertedBarcodes[value];
  saveAndSync();
  if (isOnlineMode && session) {
    removeBarcodeRemote(session, state.active, value).catch(console.error);
    unmarkBarcodeCopied(session, value).catch(console.error);
  }
  render();
}

function markInserted(code) {
  state.insertedBarcodes[code] = true;
  saveState();
  if (isOnlineMode && session) {
    copyBarcodeRemote(session, code).catch(console.error);
  }
  render();
}

function render() {
  renderCategories();
  renderBarcodes();
}

function renderCategories() {
  const ul = document.getElementById("categoryList");
  ul.innerHTML = "";

  state.categoryOrder.forEach((name, index) => {
    const li = document.createElement("li");
    li.textContent = name;
    li.draggable = true;
    li.dataset.index = index;

    if (name === state.active) {
      li.classList.add("active");
    }

    if (state.unopenedCategories[name]) {
      li.classList.add("unopened");
    }

    if (state.importantCategories[name]) {
      li.classList.add("important");
    }

    li.onclick = () => {
      state.active = name;
      delete state.unopenedCategories[name];
      saveState();
      if (isOnlineMode && session) {
        markCategoryOpened(session, name).catch(console.error);
      }
      render();
    };

    li.addEventListener("dragstart", handleDragStart);
    li.addEventListener("dragover", handleDragOver);
    li.addEventListener("dragenter", handleDragEnter);
    li.addEventListener("dragleave", handleDragLeave);
    li.addEventListener("drop", handleDrop);
    li.addEventListener("dragend", handleDragEnd);

    ul.appendChild(li);
  });

  document.getElementById("categoryName").value = state.active || "";
}

function handleDragStart(e) {
  draggedItem = this;
  draggedIndex = parseInt(this.dataset.index);
  this.style.opacity = "0.5";
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/html", this.innerHTML);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = "move";
  return false;
}

function handleDragEnter(e) {
  this.classList.add("over");
}

function handleDragLeave(e) {
  this.classList.remove("over");
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }

  if (draggedItem !== this) {
    const dropIndex = parseInt(this.dataset.index);
    
    const [movedItem] = state.categoryOrder.splice(draggedIndex, 1);
    state.categoryOrder.splice(dropIndex, 0, movedItem);
    
    saveAndSync();
    if (isOnlineMode && session) {
      syncCategoryOrder(session, state.categoryOrder).catch(console.error);
    }
    renderCategories();
  }
  return false;
}

function handleDragEnd() {
  this.style.opacity = "1";
  draggedItem = null;
  draggedIndex = -1;
  
  document.querySelectorAll("#categoryList li").forEach(li => {
    li.classList.remove("over");
  });
}

function renderBarcodes() {
  const ul = document.getElementById("barcodeList");
  ul.innerHTML = "";

  if (!state.active) return;

  const list = state.categories[state.active];

  list.forEach(code => {
    const li = document.createElement("li");

    const span = document.createElement("span");
    span.textContent = code;
    if (state.insertedBarcodes[code]) {
      span.classList.add("inserted");
    }

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "8px";
    actions.style.alignItems = "center";

    const commentBtn = document.createElement("span");
    const hasComment = state.comments && state.comments[code];
    commentBtn.innerHTML = hasComment
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="comment-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="comment-icon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    commentBtn.style.cursor = "pointer";
    commentBtn.title = "Comment";
    commentBtn.onclick = (e) => {
      e.stopPropagation();
      toggleCommentInput(code, li);
    };

    const searchBtn = document.createElement("span");
    searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
    searchBtn.style.cursor = "pointer";
    searchBtn.title = "Search";
    searchBtn.onclick = (e) => {
      e.stopPropagation();
      searchBarcodeInSite(code);
    };

    const del = document.createElement("span");
    del.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="delete-icon"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
    del.className = "delete-btn";
    del.title = "Delete";
    del.onclick = (e) => {
      e.stopPropagation();
      removeBarcode(code);
    };

    actions.appendChild(commentBtn);
    actions.appendChild(searchBtn);
    actions.appendChild(del);

    li.appendChild(span);
    li.appendChild(actions);

    ul.appendChild(li);
  });
}

function toggleCommentInput(code, li) {
  const existing = li.querySelector('.comment-textarea');
  if (existing) {
    existing.remove();
    return;
  }

  const actions = li.querySelector('div');
  const textarea = document.createElement("textarea");
  textarea.className = "comment-textarea";
  textarea.maxLength = 250;
  textarea.value = (state.comments && state.comments[code]) || "";

  textarea.addEventListener("blur", () => {
    saveBarcodeComment(code, textarea.value);
    render();
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
  });

  li.appendChild(textarea);
  textarea.focus();
}

function saveBarcodeComment(code, comment) {
  const truncated = comment.slice(0, 250).trim();

  if (!state.comments) {
    state.comments = {};
  }

  if (truncated) {
    state.comments[code] = truncated;
  } else {
    delete state.comments[code];
  }

  saveState();

  if (isOnlineMode && session) {
    saveComment(session.storeId, code, truncated).catch(console.error);
  }
}

function setupEventListeners() {
  document.getElementById("addCategoryBtn").onclick = () => {
    const name = prompt("Category name:");
    createCategory(name);
  };

  document.getElementById("renameCategoryBtn").onclick = () => {
    const newName = prompt("New name:");
    renameCategory(state.active, newName);
  };

  document.getElementById("deleteCategoryBtn").onclick = () => {
    deleteCategory(state.active);
  };

  document.getElementById("barcodeInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const input = document.getElementById("barcodeInput");
      const list = state.categories[state.active] || [];
      const toAdd = [];
      let skipped = 0;

      input.value.split(/\r?\n/).forEach(line => {
        const cleaned = line.replace(/\s+/g, "");
        if (!cleaned) return;
        if (!/^\d+$/.test(cleaned)) {
          skipped++;
          return;
        }
        if (list.includes(cleaned) || toAdd.includes(cleaned)) {
          skipped++;
          return;
        }
        toAdd.push(cleaned);
      });

      if (toAdd.length > 0) {
        toAdd.forEach(value => {
          list.push(value);
          delete state.insertedBarcodes[value];
        });
        saveAndSync();
        if (isOnlineMode && session) {
          toAdd.forEach(value => {
            addBarcodeRemote(session, state.active, value).catch(console.error);
            unmarkBarcodeCopied(session, value).catch(console.error);
          });
        }
        render();
      }

      const added = toAdd.length;
      input.value = "";
      if (added === 0 && skipped === 0) return;
      showToast(skipped > 0 ? `Added ${added}, skipped ${skipped}` : `Added ${added} barcode(s)`);
    }
  });

  document.getElementById("logoutBtn").onclick = async () => {
    if (!confirm("Logout? Your local data will remain.")) return;
    await logout();
    session = null;
    showLoginScreen();
  };

  document.getElementById("uploadBtn").onclick = () => {
    document.getElementById("fileInput").click();
  };

  document.getElementById("fileInput").onchange = handleFileUpload;

  document.getElementById("settingsBtn").onclick = showSettingsModal;

  document.getElementById("batchAddBtn").onclick = () => {
    if (autoAddRunning) {
      stopAutoAdd();
    } else {
      startBatchAdd();
    }
  };

  document.getElementById("closeReviewModal").onclick = closeReviewModal;
  document.getElementById("cancelReviewBtn").onclick = closeReviewModal;
  document.getElementById("selectAllBtn").onclick = () => selectAllItems(true);
  document.getElementById("deselectAllBtn").onclick = () => selectAllItems(false);
  document.getElementById("addSelectedBtn").onclick = addSelectedBarcodes;

  document.getElementById("closeSettingsModal").onclick = closeSettingsModal;
  document.getElementById("cancelSettingsBtn").onclick = closeSettingsModal;
  document.getElementById("saveSettingsBtn").onclick = saveSettings;

  document.getElementById("runToastClose").onclick = () => suppressRunToast(false);
  document.getElementById("runToastDismiss").onclick = () => suppressRunToast(false);
  document.getElementById("runToastNever").onclick = () => suppressRunToast(true);
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1500);
}

const autoRunTips = [
  "Upload an Excel file to import hundreds of barcodes at once.",
  "Prices from a TCO Price column are saved as automatic comments.",
  "The check-digit option strips the last digit on import.",
  "Categories named with a leading * glow red as important.",
  "Your lists sync to the phone app when you're online.",
  "Drag categories to reorder them.",
  "Barcodes already in a list are flagged as duplicates on import.",
  "Searched barcodes show purple after they've been added."
];

function showRunToast(total) {
  const el = document.getElementById("runToast");
  runToastSuppressed = false;
  if (total > 0) {
    document.getElementById("runToastProgress").textContent = `0 / ${total} done`;
  }
  rotateRunTip();
  if (runTipInterval) clearInterval(runTipInterval);
  runTipInterval = setInterval(rotateRunTip, 4000);
  el.style.display = "flex";
}

function rotateRunTip() {
  const tip = autoRunTips[Math.floor(Math.random() * autoRunTips.length)];
  document.getElementById("runToastTip").textContent = "\u2728 " + tip;
}

function hideRunToast() {
  const el = document.getElementById("runToast");
  el.style.display = "none";
  if (runTipInterval) {
    clearInterval(runTipInterval);
    runTipInterval = null;
  }
}

async function suppressRunToast(forever) {
  runToastSuppressed = true;
  hideRunToast();
  if (forever) {
    dontShowRunToast = true;
    await chrome.storage.local.set({ [runToastStorageKey]: true });
  }
}

function showLoadingOverlay(msg) {
  const overlay = document.getElementById("loadingOverlay");
  const message = document.getElementById("loadingMessage");
  message.textContent = msg || "Processing...";
  overlay.style.display = "flex";
}

function hideLoadingOverlay() {
  document.getElementById("loadingOverlay").style.display = "none";
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const extension = file.name.split(".").pop().toLowerCase();

  if (["xlsx", "xls"].includes(extension)) {
    await processExcelFile(file);
  } else {
    showToast("Unsupported file type");
  }

  event.target.value = "";
}

function cleanUPCValue(val) {
  const cleaned = String(val).replace(/\D+/g, "");
  return cleaned.length >= 5 ? cleaned : null;
}

function findUPCColumn(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return null;

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const maxHeaderRow = Math.min(range.e.r, 9);

  for (let row = range.s.r; row <= maxHeaderRow; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && cell.v !== undefined && cell.v !== null) {
        const header = String(cell.v).trim().toLowerCase();
        if (/\bupc\b/.test(header)) {
          return { headerRow: row, col: col };
        }
      }
    }
  }
  return null;
}

function hasNoChangeComment(sheet, row) {
  const cell = sheet[XLSX.utils.encode_cell({ r: row, c: 7 })];
  if (cell && cell.v !== undefined && cell.v !== null) {
    const comment = String(cell.v).trim().toLowerCase();
    return /\b(?:no|change)\b/.test(comment);
  }
  return false;
}

function findPriceColumn(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return null;

  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const maxHeaderRow = Math.min(range.e.r, 9);

  for (let row = range.s.r; row <= maxHeaderRow; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && cell.v !== undefined && cell.v !== null) {
        const header = String(cell.v).trim().toLowerCase();
        if (header.includes("tco") && header.includes("price")) {
          return { headerRow: row, col: col };
        }
      }
    }
  }
  return null;
}

async function processExcelFile(file) {
  showToast("Processing Excel...");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const workbook = XLSX.read(data, { type: "array" });
    const tableName = file.name.replace(/\.(xlsx|xls)$/i, "");
    const barcodes = [];
    const prices = {};

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) continue;

      const upcCol = findUPCColumn(workbook, sheetName);
      if (!upcCol) continue;

      const priceCol = findPriceColumn(workbook, sheetName);

      const range = XLSX.utils.decode_range(sheet["!ref"]);
      for (let row = upcCol.headerRow + 1; row <= range.e.r; row++) {
        if (priceCol && hasNoChangeComment(sheet, row)) continue;
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: upcCol.col })];
        if (cell && cell.v !== undefined && cell.v !== null) {
          const cleaned = cleanUPCValue(cell.v);
          if (cleaned) {
            barcodes.push(cleaned);
            if (priceCol && prices[cleaned] === undefined) {
              const priceCell = sheet[XLSX.utils.encode_cell({ r: row, c: priceCol.col })];
              if (priceCell && priceCell.v !== undefined && priceCell.v !== null && priceCell.v !== "") {
                const priceVal = typeof priceCell.v === "number"
                  ? priceCell.v.toFixed(2)
                  : String(priceCell.v).trim();
                if (priceVal) {
                  prices[cleaned] = priceVal;
                }
              }
            }
          }
        }
      }
    }

    const uniqueBarcodes = [...new Set(barcodes)];

    if (uniqueBarcodes.length === 0) {
      showToast("No UPC column found in this file");
      return;
    }

    pendingExtraction = [{
      tableName: tableName,
      barcodes: uniqueBarcodes,
      prices: prices
    }];
    showReviewModal();

  } catch (err) {
    console.error("Excel processing error:", err);
    showToast("Error processing file");
  }
}

function showReviewModal() {
  const modal = document.getElementById("reviewModal");
  const content = document.getElementById("reviewContent");
  const removeCheckDigitToggle = document.getElementById("removeCheckDigitToggle");
  content.innerHTML = "";
  removeCheckDigitToggle.checked = true;

  selectedForExtraction = [];

  pendingExtraction.forEach((group, groupIndex) => {
    const groupDiv = document.createElement("div");
    groupDiv.className = "table-group";

    const nameRow = document.createElement("div");
    nameRow.className = "table-name-row";

    const groupCheckbox = document.createElement("input");
    groupCheckbox.type = "checkbox";
    groupCheckbox.checked = true;
    groupCheckbox.dataset.group = groupIndex;

    const nameLabel = document.createElement("span");
    nameLabel.className = "table-name-label";
    nameLabel.textContent = group.tableName;
    nameLabel.onclick = () => { groupCheckbox.click(); };

    nameRow.appendChild(groupCheckbox);
    nameRow.appendChild(nameLabel);
    groupDiv.appendChild(nameRow);

    const startIndex = selectedForExtraction.length;

    group.barcodes.forEach((barcode, barcodeIndex) => {
      const index = selectedForExtraction.length;
      const price = group.prices ? group.prices[barcode] : undefined;
      selectedForExtraction.push({ selected: true, groupIndex, barcode, tableName: group.tableName, price });

      const existingCategories = Object.values(state.categories);
      const isDuplicate = existingCategories.some(cat => cat.includes(barcode));
      const isInCurrentCategory = state.categories[state.active]?.includes(barcode);

      const itemDiv = document.createElement("div");
      itemDiv.className = "barcode-item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.index = index;
      checkbox.onchange = (e) => {
        selectedForExtraction[index].selected = e.target.checked;
        updateGroupCheckbox(groupIndex);
      };

      const valueSpan = document.createElement("span");
      valueSpan.className = "barcode-value";
      valueSpan.textContent = barcode;

      itemDiv.appendChild(checkbox);
      itemDiv.appendChild(valueSpan);

      if (price) {
        const priceBadge = document.createElement("span");
        priceBadge.className = "price-badge";
        priceBadge.textContent = `TCO ${price}`;
        itemDiv.appendChild(priceBadge);
      }

      if (isDuplicate || isInCurrentCategory) {
        const badge = document.createElement("span");
        badge.className = "duplicate-badge";
        badge.textContent = isInCurrentCategory ? "Already in list" : "Exists";
        itemDiv.appendChild(badge);
      }

      groupDiv.appendChild(itemDiv);
    });

    const endIndex = selectedForExtraction.length;

    groupCheckbox.onchange = (e) => {
      const checked = e.target.checked;
      for (let i = startIndex; i < endIndex; i++) {
        selectedForExtraction[i].selected = checked;
        const cb = document.querySelector(`input[data-index="${i}"]`);
        if (cb) cb.checked = checked;
      }
    };

    content.appendChild(groupDiv);
  });

  modal.style.display = "flex";
}

function updateGroupCheckbox(groupIndex) {
  const groupItems = selectedForExtraction.filter(item => item.groupIndex === groupIndex);
  const allSelected = groupItems.every(item => item.selected);
  const noneSelected = groupItems.every(item => !item.selected);
  const groupCb = document.querySelector(`input[data-group="${groupIndex}"]`);
  if (groupCb) {
    groupCb.checked = allSelected;
    groupCb.indeterminate = !allSelected && !noneSelected;
  }
}

function closeReviewModal() {
  document.getElementById("reviewModal").style.display = "none";
  pendingExtraction = [];
  selectedForExtraction = [];
}

function selectAllItems(select) {
  selectedForExtraction.forEach((item, index) => {
    item.selected = select;
    const checkbox = document.querySelector(`input[data-index="${index}"]`);
    if (checkbox) checkbox.checked = select;
  });

  document.querySelectorAll('input[data-group]').forEach(gcb => {
    gcb.checked = select;
    gcb.indeterminate = false;
  });
}

function addSelectedBarcodes() {
  const removeCheckDigit = document.getElementById("removeCheckDigitToggle")?.checked || false;
  const toAdd = [];
  const categoriesToCreate = [];

  selectedForExtraction.forEach((item) => {
    if (!item.selected) return;

    let barcode = item.barcode;
    if (removeCheckDigit && barcode.length > 1) {
      barcode = barcode.slice(0, -1);
    }

    const existingInCategory = state.categories[state.active]?.includes(barcode);
    if (existingInCategory) return;

    const existingAnywhere = Object.values(state.categories).some(cat => cat.includes(barcode));
    if (!existingAnywhere) {
      toAdd.push({ ...item, barcode });
    }
  });

  selectedForExtraction.forEach((item) => {
    if (!item.selected || !item.price) return;

    let barcode = item.barcode;
    if (removeCheckDigit && barcode.length > 1) {
      barcode = barcode.slice(0, -1);
    }

    if (!state.comments) {
      state.comments = {};
    }
    const comment = `TCO Price: ${item.price}`;
    state.comments[barcode] = comment;
    if (isOnlineMode && session) {
      saveComment(session.storeId, barcode, comment).catch(console.error);
    }
  });

  if (toAdd.length === 0) {
    showToast("No new barcodes to add");
    closeReviewModal();
    return;
  }
  const grouped = {};
  toAdd.forEach((item) => {
    if (!grouped[item.tableName]) {
      grouped[item.tableName] = [];
    }
    grouped[item.tableName].push(item.barcode);
  });

  Object.entries(grouped).forEach(([tableName, barcodes]) => {
    if (!state.categories[tableName]) {
      categoriesToCreate.push(tableName);
      state.categories[tableName] = [];
      state.categoryOrder.push(tableName);
      if (isOnlineMode && session) {
        syncCategoryOrder(session, state.categoryOrder).catch(console.error);
      }
    }
    barcodes.forEach(b => {
      delete state.insertedBarcodes[b];
      if (isOnlineMode && session) {
        addBarcodeRemote(session, tableName, b).catch(console.error);
        unmarkBarcodeCopied(session, b).catch(console.error);
      }
    });
    state.categories[tableName].push(...barcodes);
  });

  if (state.active && !categoriesToCreate.includes(state.active)) {
    if (categoriesToCreate.length > 0) {
      state.active = categoriesToCreate[0];
    }
  } else if (categoriesToCreate.length > 0) {
    state.active = categoriesToCreate[0];
  }

  saveAndSync();
  closeReviewModal();
  render();
  showToast(`Added ${toAdd.length} barcode(s)`);
}

function showSettingsModal() {
  const modal = document.getElementById("settingsModal");

  document.getElementById("showRunToastToggle").checked = !dontShowRunToast;

  document.getElementById("autoAddSearchInput").value = autoAddConfig.searchInputXPath || "";
  document.getElementById("autoAddSearchButton").value = autoAddConfig.searchButtonXPath || "";
  document.getElementById("autoAddCheckbox").value = autoAddConfig.checkboxXPath || "";
  document.getElementById("autoAddAddButton").value = autoAddConfig.addButtonXPath || "";
  document.getElementById("batchCreateInput").value = autoAddConfig.batchCreateButtonXPath || "";
  document.getElementById("batchNameInput").value = autoAddConfig.batchNameInputXPath || "";
  document.getElementById("batchConfirmCreate").value = autoAddConfig.batchCreateConfirmXPath || "";
  document.getElementById("batchSignsDropdown").value = autoAddConfig.signsDropdownXPath || "";
  document.getElementById("batchItemLibrary").value = autoAddConfig.itemLibraryOptionXPath || "";
  document.getElementById("autoAddDelay").value = autoAddConfig.delayMs || "";
  document.getElementById("autoAddTimeout").value = autoAddConfig.timeoutMs || "";

  modal.style.display = "flex";
}

function closeSettingsModal() {
  document.getElementById("settingsModal").style.display = "none";
}

async function saveSettings() {
  const newConfig = {
    searchInputXPath: document.getElementById("autoAddSearchInput").value.trim(),
    searchButtonXPath: document.getElementById("autoAddSearchButton").value.trim(),
    checkboxXPath: document.getElementById("autoAddCheckbox").value.trim(),
    addButtonXPath: document.getElementById("autoAddAddButton").value.trim(),
    batchCreateButtonXPath: document.getElementById("batchCreateInput").value.trim(),
    batchNameInputXPath: document.getElementById("batchNameInput").value.trim(),
    batchCreateConfirmXPath: document.getElementById("batchConfirmCreate").value.trim(),
    signsDropdownXPath: document.getElementById("batchSignsDropdown").value.trim(),
    itemLibraryOptionXPath: document.getElementById("batchItemLibrary").value.trim(),
    delayMs: parseInt(document.getElementById("autoAddDelay").value) || 1500,
    timeoutMs: parseInt(document.getElementById("autoAddTimeout").value) || 8000
  };
  autoAddConfig = newConfig;
  chrome.storage.local.set({ [autoAddStorageKey]: autoAddConfig });

  const showRunToast = document.getElementById("showRunToastToggle").checked;
  dontShowRunToast = !showRunToast;
  chrome.storage.local.set({ [runToastStorageKey]: !showRunToast });

  closeSettingsModal();
}

async function searchBarcodeInSite(code) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id === undefined) {
    showToast("No active tab found");
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "SEARCH_BARCODE",
      barcode: code,
      config: autoAddConfig
    });
  } catch (err) {
    showToast("Open the target site tab first");
  }
}

async function startBatchAdd() {
  const barcodes = state.active ? (state.categories[state.active] || []) : [];

  if (barcodes.length === 0) {
    showToast("No barcodes in this list");
    return;
  }

  const missing = [];
  if (!autoAddConfig.batchCreateButtonXPath) missing.push("create batch");
  if (!autoAddConfig.batchNameInputXPath) missing.push("batch name box");
  if (!autoAddConfig.batchCreateConfirmXPath) missing.push("create confirm");
  if (!autoAddConfig.signsDropdownXPath) missing.push("add signs dropdown");
  if (!autoAddConfig.itemLibraryOptionXPath) missing.push("item library");
  if (!autoAddConfig.searchInputXPath) missing.push("search box");
  if (!autoAddConfig.searchButtonXPath) missing.push("search button");
  if (!autoAddConfig.checkboxXPath) missing.push("checkbox");
  if (!autoAddConfig.addButtonXPath) missing.push("add button");
  if (missing.length > 0) {
    showToast("Missing XPath: " + missing.join(", ") + ". Check Settings");
    return;
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || tab.id === undefined) {
    showToast("No active tab found");
    return;
  }

  setAutoAddRunning(true);

  if (!dontShowRunToast) {
    showRunToast(barcodes.length);
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "AUTO_ADD_BATCH_START",
      barcodes: barcodes,
      config: autoAddConfig,
      category: state.active,
      batchName: state.active
    });
  } catch (err) {
    setAutoAddRunning(false);
    hideRunToast();
    updateAutoAddStatus("No content script on this page");
    showToast("Open the target site tab first");
  }
}

async function stopAutoAdd() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab && tab.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "AUTO_ADD_STOP" }).catch(() => {});
  }
}

function setAutoAddRunning(running) {
  autoAddRunning = running;

  const stopIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>';
  const sparklesIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H8"/><path d="m15.007 5.008 3.987 3.986"/><path d="M20 15v4"/><path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="M22 17h-4"/><path d="M4 5v4"/><path d="M6 7H2"/><path d="M9 2v2"/></svg>';

  const batchBtn = document.getElementById("batchAddBtn");

  batchBtn.classList.toggle("running", running);
  batchBtn.title = running ? "Stop batch add" : "Create batch and auto-add";
  batchBtn.innerHTML = running ? stopIcon : sparklesIcon;
}

function updateAutoAddStatus(text) {
  const el = document.getElementById("autoAddStatus");
  el.textContent = text;
  el.style.display = "flex";
}

function finishAutoAdd(text) {
  setAutoAddRunning(false);
  hideRunToast();
  updateAutoAddStatus(text);
  setTimeout(() => {
    if (!autoAddRunning) {
      document.getElementById("autoAddStatus").style.display = "none";
    }
  }, 4000);
}
