const storageKey = "barcodeData";

let state = {
  categoryOrder: [],
  categories: {},
  active: null
};

let draggedItem = null;
let draggedIndex = -1;

document.addEventListener("DOMContentLoaded", async () => {
  await loadState();

  if (state.categoryOrder.length === 0) {
    createCategory("Default");
  }

  render();
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
    state.active = saved.active || null;
  }
}

function saveState() {
  chrome.storage.local.set({
    [storageKey]: {
      categoryOrder: state.categoryOrder,
      categories: state.categories,
      active: state.active
    }
  });
}

function createCategory(name) {
  if (!name) return;
  if (state.categories[name]) return;

  state.categories[name] = [];
  state.categoryOrder.push(name);
  state.active = name;
  saveState();
  render();
}

function deleteCategory(name) {
  if (!confirm("Delete this category?")) return;

  delete state.categories[name];
  state.categoryOrder = state.categoryOrder.filter(n => n !== name);
  state.active = state.categoryOrder[0] || null;
  saveState();
  render();
}

function renameCategory(oldName, newName) {
  if (!newName || state.categories[newName]) return;

  state.categories[newName] = state.categories[oldName];
  delete state.categories[oldName];
  state.categoryOrder = state.categoryOrder.map(n => n === oldName ? newName : n);
  state.active = newName;
  saveState();
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
  saveState();
  render();
}

function removeBarcode(value) {
  const list = state.categories[state.active];
  state.categories[state.active] = list.filter(v => v !== value);
  saveState();
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
    
    saveState();
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

    actions.appendChild(copyBtn);
    actions.appendChild(del);

    li.appendChild(span);
    li.appendChild(actions);

    ul.appendChild(li);
  });
}

document.addEventListener("DOMContentLoaded", () => {
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

  document.getElementById("addBarcodeBtn").onclick = () => {
    const input = document.getElementById("barcodeInput");
    addBarcode(input.value.trim());
    input.value = "";
  };

  document.getElementById("barcodeInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      document.getElementById("addBarcodeBtn").click();
    }
  });
});

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 1500);
}
