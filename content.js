chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SHOW_OVERLAY") {
    showOverlay(msg.message);
  }
});

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
