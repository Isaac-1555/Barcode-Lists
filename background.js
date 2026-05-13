importScripts('supabase.js');

const POLL_INTERVAL = 10000;
let pollTimer = null;
let lastBarcodeCount = 0;
let lastTimestamp = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  setupAlarm();
  startBackground();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  startBackground();
});

function setupAlarm() {
  chrome.alarms.create("barcodePoll", { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "barcodePoll") {
    stopPoll();
    startBackground();
  }
});

async function startBackground() {
  const session = await getSession();
  if (session) {
    await doPoll(session);
    startPoll(session);
  } else {
    stopPoll();
  }
}

function startPoll(session) {
  stopPoll();
  pollTimer = setInterval(() => doPoll(session), POLL_INTERVAL);
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function doPoll(session) {
  try {
    const count = await getBarcodeCount(session.storeId);
    const timestamp = await getLatestBarcodeTimestamp(session.storeId);

    const isFirstRun = lastBarcodeCount === 0;
    const countIncreased = count > lastBarcodeCount;
    const timestampChanged = timestamp && timestamp !== lastTimestamp;

    if (!isFirstRun && (countIncreased || timestampChanged)) {
      const newCount = count - lastBarcodeCount;
      await notifyNewData(session, Math.max(newCount, 1));
    }

    lastBarcodeCount = count;
    if (timestamp) lastTimestamp = timestamp;
  } catch (err) {
    console.error("Poll error:", err);
  }
}

async function notifyNewData(session, newCount) {
  try {
    await chrome.runtime.sendMessage({
      type: "NEW_DATA",
      storeNumber: session.storeNumber
    });
  } catch {
    sendNotification(session, newCount);
  }
}

function sendNotification(session, newCount) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon48.png",
    title: "New Barcode List",
    message: `${newCount} new barcode(s) for store ${session.storeNumber}`,
    contextMessage: `Tap to open side panel`
  });
}

chrome.notifications.onClicked.addListener(() => {
  chrome.windows.getAll({ populate: false }, (windows) => {
    if (windows.length > 0) {
      chrome.sidePanel.open({ windowId: windows[0].id }).catch(console.error);
    } else {
      chrome.windows.create({}, (win) => {
        chrome.sidePanel.open({ windowId: win.id }).catch(console.error);
      });
    }
  });
});
