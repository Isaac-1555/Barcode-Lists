const storageKey = "barcodeData";

let state = {
  categoryOrder: [],
  categories: {},
  comments: {},
  active: null
};

let session = null;
let isOnlineMode = false;
let draggedItem = null;
let draggedIndex = -1;
let pendingExtraction = [];
let selectedForExtraction = [];
let currentDisplayPlanFile = null;
let currentWorkbook = null;
let selectedSheets = [];

document.addEventListener("DOMContentLoaded", async () => {
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
      state = remoteState;
      saveState();
      render();
    } catch (err) {
      console.log("Sync failed, using local data:", err);
    }
  }
  
  if (state.categoryOrder.length === 0) {
    createCategory("Default");
  }
  
  render();
}

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
  }
  
  isOnlineMode = await isOnline();
}

function saveState() {
  chrome.storage.local.set({
    [storageKey]: {
      categoryOrder: state.categoryOrder,
      categories: state.categories,
      comments: state.comments,
      active: state.active
    }
  });
}

async function saveAndSync() {
  saveState();
  
  if (isOnlineMode && session) {
    updateSyncStatus("syncing");
    try {
      await syncToRemote(session, state);
      updateSyncStatus("online");
    } catch (err) {
      console.error("Sync failed:", err);
      updateSyncStatus("offline");
    }
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
  if (state.categories[name]) return;

  state.categories[name] = [];
  state.categoryOrder.push(name);
  state.active = name;
  saveAndSync();
  render();
}

function deleteCategory(name) {
  if (!confirm("Delete this category?")) return;

  delete state.categories[name];
  state.categoryOrder = state.categoryOrder.filter(n => n !== name);
  state.active = state.categoryOrder[0] || null;
  saveAndSync();
  render();
}

function renameCategory(oldName, newName) {
  if (!newName || state.categories[newName]) return;

  state.categories[newName] = state.categories[oldName];
  delete state.categories[oldName];
  state.categoryOrder = state.categoryOrder.map(n => n === oldName ? newName : n);
  state.active = newName;
  saveAndSync();
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
  saveAndSync();
  render();
}

function removeBarcode(value) {
  const list = state.categories[state.active];
  state.categories[state.active] = list.filter(v => v !== value);
  saveAndSync();
  render();
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  showToast("Copied");
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

    li.onclick = () => {
      state.active = name;
      saveState();
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

    const copyBtn = document.createElement("span");
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
    copyBtn.style.cursor = "pointer";
    copyBtn.title = "Copy";
    copyBtn.onclick = (e) => {
      e.stopPropagation();
      copyToClipboard(code);
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
    actions.appendChild(copyBtn);
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

  document.getElementById("barcodeInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const input = document.getElementById("barcodeInput");
      addBarcode(input.value.trim());
      input.value = "";
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

  document.getElementById("closeReviewModal").onclick = closeReviewModal;
  document.getElementById("cancelReviewBtn").onclick = closeReviewModal;
  document.getElementById("selectAllBtn").onclick = () => selectAllItems(true);
  document.getElementById("deselectAllBtn").onclick = () => selectAllItems(false);
  document.getElementById("addSelectedBtn").onclick = addSelectedBarcodes;

  document.getElementById("closeSettingsModal").onclick = closeSettingsModal;
  document.getElementById("cancelSettingsBtn").onclick = closeSettingsModal;
  document.getElementById("saveSettingsBtn").onclick = saveSettings;
  document.getElementById("openrouterLink").onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "https://openrouter.ai/" });
  };
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1500);
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
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: "array" });
    
    if (detectDisplayPlanFile(workbook, file.name)) {
      await processDisplayPlanFile(file, workbook);
    } else {
      await processExcelFile(file);
    }
  } else if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(extension)) {
    await processImageFile(file);
  } else {
    showToast("Unsupported file type");
  }

  event.target.value = "";
}

function isBarcodeLike(val) {
  if (/^\d{3,}$/.test(val)) return "clean";
  if (/^[\d\s\-]{5,}$/.test(val) && (val.replace(/[^\d]/g, "").length >= 5)) return "raw";
  return false;
}

function detectDisplayPlanFile(workbook, fileName) {
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.includes('display') || lowerFileName.includes('plan')) {
    return true;
  }
  
  const weekPattern = /^(wk\s*\d+|wk\d+|\d+)$/i;
  const displayPlanIndicators = ['FRONT END', 'BACK END', 'SHOP ONLINE', 'APP SIGNAGE', 'COCA COLA', 'BFTW'];
  
  for (const sheetName of workbook.SheetNames) {
    if (weekPattern.test(sheetName.trim())) {
      return true;
    }
  }
  
  return false;
}

function getSheetDate(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return null;
  
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let row = Math.min(range.s.r, 3); row <= Math.min(range.e.r, 5); row++) {
    for (let col = Math.min(range.s.c, 2); col <= Math.min(range.e.c, 5); col++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && cell.v) {
        const val = String(cell.v);
        if (/\d{4}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(val)) {
          return val.trim();
        }
      }
    }
  }
  return null;
}

function showSheetSelectorModal(workbook, fileName) {
  return new Promise((resolve) => {
    const modal = document.getElementById("sheetSelectorModal");
    const list = document.getElementById("sheetSelectorList");
    list.innerHTML = "";
    selectedSheets = [];
    currentWorkbook = workbook;
    currentDisplayPlanFile = fileName;
    
    const selectAllRow = document.createElement("div");
    selectAllRow.className = "select-all-row";
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.id = "selectAllSheets";
    const selectAllLabel = document.createElement("span");
    selectAllLabel.textContent = "Select All";
    selectAllCheckbox.onchange = () => {
      const checkboxes = list.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    };
    selectAllRow.appendChild(selectAllCheckbox);
    selectAllRow.appendChild(selectAllLabel);
    list.appendChild(selectAllRow);
    
    const weekPattern = /^wk\s*(\d+)/i;
    
    workbook.SheetNames.forEach((sheetName) => {
      const item = document.createElement("div");
      item.className = "sheet-selector-item";
      
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.sheet = sheetName;
      
      const info = document.createElement("div");
      info.className = "sheet-info";
      
      const match = sheetName.match(weekPattern);
      const date = getSheetDate(workbook, sheetName);
      let displayName = sheetName;
      if (match) {
        const weekNum = match[1].padStart(2, '0');
        displayName = `Week ${weekNum}`;
        if (date) {
          displayName += ` - ${date}`;
        }
      } else {
        displayName = date || sheetName;
      }
      
      const nameSpan = document.createElement("div");
      nameSpan.className = "sheet-name";
      nameSpan.textContent = displayName;
      
      info.appendChild(nameSpan);
      
      item.appendChild(checkbox);
      item.appendChild(info);
      
      checkbox.onchange = () => {
        if (checkbox.checked) {
          item.classList.add("selected");
        } else {
          item.classList.remove("selected");
        }
        const allChecked = Array.from(list.querySelectorAll('.sheet-selector-item input'))
          .every(cb => cb.checked);
        const noneChecked = Array.from(list.querySelectorAll('.sheet-selector-item input'))
          .every(cb => !cb.checked);
        selectAllCheckbox.checked = allChecked && !noneChecked;
        selectAllCheckbox.indeterminate = !allChecked && !noneChecked;
      };
      
      item.onclick = (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event("change"));
        }
      };
      
      list.appendChild(item);
    });
    
    const confirmBtn = document.getElementById("confirmSheetSelectorBtn");
    const cancelBtn = document.getElementById("cancelSheetSelectorBtn");
    const closeBtn = document.getElementById("closeSheetSelectorModal");
    
    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
    };
    
    confirmBtn.onclick = () => {
      const checked = Array.from(list.querySelectorAll('.sheet-selector-item input:checked'))
        .map(cb => cb.dataset.sheet);
      cleanup();
      resolve(checked);
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    
    closeBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    
    modal.style.display = "flex";
  });
}

function parseDisplayPlanSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) return [];
  
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const date = getSheetDate(workbook, sheetName);
  const tables = {};
  
  const FRONT_END_HEADER_ROW = 3;
  const FRONT_END_DATA_START = 5;
  const FRONT_END_DATA_END = 20;
  
  for (let col = 1; col <= range.e.c; col += 2) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: FRONT_END_HEADER_ROW, c: col })];
    const headerVal = headerCell?.v ? String(headerCell.v).trim() : "";
    
    if (headerVal && !/^\d+\.?\d*$/.test(headerVal) && headerVal.length > 1) {
      const cleanHeader = headerVal.replace(/[#.]/g, '').trim();
      if (cleanHeader && !tables[cleanHeader]) {
        tables[cleanHeader] = [];
        
        for (let row = FRONT_END_DATA_START; row <= FRONT_END_DATA_END; row++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell && cell.v !== undefined && cell.v !== null) {
            const val = String(cell.v).trim();
            if (val && val !== "0" && val !== "0.0") {
              tables[cleanHeader].push(val);
            }
          }
        }
      }
    }
  }
  
  const BACK_END_HEADER_ROW = 23;
  const BACK_END_DATA_START = 25;
  const BACK_END_DATA_END = 40;
  
  for (let col = 1; col <= range.e.c; col += 2) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: BACK_END_HEADER_ROW, c: col })];
    const headerVal = headerCell?.v ? String(headerCell.v).trim() : "";
    
    if (headerVal && !/^\d+\.?\d*$/.test(headerVal) && headerVal.length > 1) {
      const cleanHeader = headerVal.replace(/[#.]/g, '').trim();
      if (cleanHeader && !tables[cleanHeader]) {
        tables[cleanHeader] = [];
        
        for (let row = BACK_END_DATA_START; row <= BACK_END_DATA_END; row++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell && cell.v !== undefined && cell.v !== null) {
            const val = String(cell.v).trim();
            if (val && val !== "0" && val !== "0.0") {
              tables[cleanHeader].push(val);
            }
          }
        }
      }
    }
  }
  
  const SEASONAL_HEADER_ROW = 45;
  const SEASONAL_DATA_START = 46;
  const SEASONAL_DATA_END = 55;
  
  for (let col = 0; col <= range.e.c; col++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: SEASONAL_HEADER_ROW, c: col })];
    const headerVal = headerCell?.v ? String(headerCell.v).trim() : "";
    
    const isSectionLabel = ['SEASONAL', 'STAYS', 'FRONT END', 'BACK END', 'CHANGE', 'FLYER END', 'DETAIL', '4 WAY'].some(
      s => headerVal.toUpperCase().includes(s)
    );
    
    if (headerVal && !isSectionLabel && headerVal.length > 2) {
      const cleanHeader = headerVal.replace(/[#.]/g, '').trim();
      if (cleanHeader && !tables[cleanHeader]) {
        tables[cleanHeader] = [];
        
        for (let row = SEASONAL_DATA_START; row <= SEASONAL_DATA_END; row++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          if (cell && cell.v !== undefined && cell.v !== null) {
            const val = String(cell.v).trim();
            if (val && val !== "0" && val !== "0.0") {
              tables[cleanHeader].push(val);
            }
          }
        }
      }
    }
  }
  
  const weekMatch = sheetName.match(/wk\s*(\d+)/i);
  const weekNum = weekMatch ? `WK${weekMatch[1].padStart(2, '0')}` : sheetName;
  const prefix = date ? `${weekNum} - ${date}` : weekNum;
  
  const results = [];
  for (const tableName in tables) {
    const fullTableName = `${prefix} - ${tableName}`;
    results.push({
      tableName: fullTableName,
      rawValues: tables[tableName],
      sheetName: sheetName
    });
  }
  
  return results;
}

async function processDisplayPlanFile(file, workbook) {
  const selectedSheetNames = await showSheetSelectorModal(workbook, file.name);
  
  if (!selectedSheetNames || selectedSheetNames.length === 0) {
    return;
  }
  
  showLoadingOverlay("Extracting table data...");
  
  try {
    const allTableData = [];
    
    for (const sheetName of selectedSheetNames) {
      const tableData = parseDisplayPlanSheet(workbook, sheetName);
      allTableData.push(...tableData);
    }
    
    if (allTableData.length === 0) {
      hideLoadingOverlay();
      showToast("No data found in selected sheets");
      return;
    }
    
    showLoadingOverlay("AI is processing UPC values...");
    
    const results = [];
    
    for (const table of allTableData) {
      if (table.rawValues.length > 0) {
        try {
          const aiBarcodes = await extractBarcodesFromDisplayPlan(table.rawValues, table.tableName);
          results.push({
            tableName: table.tableName,
            barcodes: [...new Set(aiBarcodes)]
          });
        } catch (aiErr) {
          console.error("AI extraction error:", aiErr);
          showToast(aiErr.message || "AI processing failed");
        }
      }
    }
    
    hideLoadingOverlay();
    
    if (results.length === 0) {
      showToast("No barcodes found");
      return;
    }
    
    pendingExtraction = results;
    currentDisplayPlanFile = file.name;
    showReviewModal(true);
    
  } catch (err) {
    hideLoadingOverlay();
    console.error("Display Plan processing error:", err);
    showToast("Error processing Display Plan file");
  }
}

async function processExcelFile(file) {
  showToast("Processing Excel...");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    
    const workbook = XLSX.read(data, { type: "array" });
    const results = [];
    let needsAI = false;

    const allRawBySheet = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) continue;

      const range = XLSX.utils.decode_range(sheet["!ref"]);
      const headers = [];
      const hasHeaders = range.e.r >= 0 && range.e.c >= 0;

      if (hasHeaders) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
          const headerVal = cell?.v ? String(cell.v).trim() : `Column ${col + 1}`;
          headers.push(headerVal);
        }
      }

      const hasHeaderRow = headers.some(h => h && !/^\d{3,}$/.test(h));

      if (hasHeaderRow && headers.length > 0) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cleanBarcodes = [];
          const rawValues = [];
          const headerName = headers[col - range.s.c];

          for (let row = range.s.r + 1; row <= range.e.r; row++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.v !== undefined && cell.v !== null) {
              const val = String(cell.v).trim();
              const type = isBarcodeLike(val);
              if (type === "clean") {
                cleanBarcodes.push(val);
              } else if (type === "raw") {
                rawValues.push(val);
              }
            }
          }

          if (rawValues.length > 0) {
            needsAI = true;
          }

          allRawBySheet.push({ headerName, cleanBarcodes, rawValues, isHeaderMode: true });
        }
      } else {
        const cleanBarcodes = [];
        const rawValues = [];
        for (let row = range.s.r; row <= range.e.r; row++) {
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.v) {
              const val = String(cell.v).trim();
              const type = isBarcodeLike(val);
              if (type === "clean") {
                cleanBarcodes.push(val);
              } else if (type === "raw") {
                rawValues.push(val);
              }
            }
          }
        }

        if (rawValues.length > 0) {
          needsAI = true;
        }

        allRawBySheet.push({ headerName: sheetName, cleanBarcodes, rawValues, isHeaderMode: false });
      }
    }

    if (needsAI) {
      showLoadingOverlay("AI is processing UPC values...");
    }

    try {
      for (const entry of allRawBySheet) {
        if (entry.rawValues.length > 0) {
          try {
            const aiBarcodes = await extractBarcodesFromExcelText(entry.rawValues);
            entry.cleanBarcodes.push(...aiBarcodes);
          } catch (aiErr) {
            console.error("AI extraction error:", aiErr);
            showToast(aiErr.message || "AI processing failed");
          }
        }

        if (entry.cleanBarcodes.length > 0) {
          results.push({
            tableName: entry.headerName,
            barcodes: [...new Set(entry.cleanBarcodes)]
          });
        }
      }
    } finally {
      hideLoadingOverlay();
    }

    if (results.length === 0) {
      showToast("No barcodes found");
      return;
    }

    pendingExtraction = results;
    showReviewModal(false);

  } catch (err) {
    hideLoadingOverlay();
    console.error("Excel processing error:", err);
    showToast("Error processing file");
  }
}

async function processImageFile(file) {
  showLoadingOverlay("Analyzing image...");

  try {
    const base64 = await fileToBase64(file);
    const mimeType = file.type || "image/png";
    const barcodes = await extractBarcodesFromImage(base64, mimeType);

    hideLoadingOverlay();

    if (barcodes.length === 0) {
      showToast("No barcodes found");
      return;
    }

    pendingExtraction = [{
      tableName: file.name.replace(/\.[^.]+$/, ""),
      barcodes: barcodes
    }];
    showReviewModal(false);

  } catch (err) {
    hideLoadingOverlay();
    console.error("Image processing error:", err);
    showToast(err.message || "Error processing image");
  }
}

function showReviewModal(isDisplayPlan = false) {
  const modal = document.getElementById("reviewModal");
  const content = document.getElementById("reviewContent");
  const removeCheckDigitToggle = document.getElementById("removeCheckDigitToggle");
  content.innerHTML = "";

  if (isDisplayPlan) {
    removeCheckDigitToggle.checked = false;
  } else {
    removeCheckDigitToggle.checked = true;
  }

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
      selectedForExtraction.push({ selected: true, groupIndex, barcode, tableName: group.tableName });

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
    }
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
  const apiKeyInput = document.getElementById("apiKeyInput");
  const statusEl = document.getElementById("apiKeyStatus");

  getOpenRouterApiKey().then((key) => {
    apiKeyInput.value = key || "";
    statusEl.textContent = "";
    statusEl.className = "api-key-status";
  });

  modal.style.display = "flex";
}

function closeSettingsModal() {
  document.getElementById("settingsModal").style.display = "none";
}

async function saveSettings() {
  const apiKeyInput = document.getElementById("apiKeyInput");
  const statusEl = document.getElementById("apiKeyStatus");
  const apiKey = apiKeyInput.value.trim();

  statusEl.innerHTML = '<span class="loading-spinner"></span> Testing...';
  statusEl.className = "api-key-status";

  if (apiKey) {
    try {
      const testResponse = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });

      if (testResponse.ok) {
        await setOpenRouterApiKey(apiKey);
        statusEl.textContent = "API key saved successfully!";
        statusEl.className = "api-key-status success";
        setTimeout(closeSettingsModal, 1000);
      } else {
        statusEl.textContent = "Invalid API key";
        statusEl.className = "api-key-status error";
      }
    } catch (err) {
      statusEl.textContent = "Error testing API key";
      statusEl.className = "api-key-status error";
    }
  } else {
    await setOpenRouterApiKey("");
    statusEl.textContent = "API key cleared";
    statusEl.className = "api-key-status success";
    setTimeout(closeSettingsModal, 1000);
  }
}
