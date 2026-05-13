importScripts('supabase.js');

const POLL_INTERVAL = 10000;
let pollTimer = null;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

chrome.runtime.onInstalled.addListener(() => {
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

    const storage = await chrome.storage.local.get(['lastBarcodeCount', 'lastTimestamp']);
    const prevCount = storage.lastBarcodeCount || 0;
    const prevTimestamp = storage.lastTimestamp || null;

    const isFirstRun = prevCount === 0;
    const countIncreased = count > prevCount;
    const timestampChanged = timestamp && timestamp !== prevTimestamp;

    if (!isFirstRun && (countIncreased || timestampChanged)) {
      const newCount = count - prevCount;
      await notifyNewData(session, Math.max(newCount, 1));
    }

    await chrome.storage.local.set({
      lastBarcodeCount: count,
      lastTimestamp: timestamp
    });
  } catch (err) {
    console.error("Poll error:", err);
  }
}

async function notifyNewData(session, newCount) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "NEW_DATA",
      storeNumber: session.storeNumber
    });
    if (!response) sendNotification(session, newCount);
  } catch {
    sendNotification(session, newCount);
  }
}

function sendNotification(session, newCount) {
  const message = `${newCount} new barcode(s) for store ${session.storeNumber}`;
  
  // 1. Set Badge
  chrome.action.setBadgeText({ text: "NEW" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color: "#FF0000" }).catch(() => {});
  
  // 2. Native Notification (fixed iconUrl)
  const notificationId = "new-data-" + Date.now();
  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icon48.png",
    title: "New Barcode List",
    message: message,
    contextMessage: "Tap to open side panel"
  }, (id) => {
    if (chrome.runtime.lastError) {
      console.error("Notification error:", chrome.runtime.lastError);
    }
  });

  // 3. Overlay Notification on active tabs
  chrome.tabs.query({active: true}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: "SHOW_OVERLAY",
        message: message
      }).catch(() => {});
    });
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


chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CLEAR_BADGE") {
    chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }
});
