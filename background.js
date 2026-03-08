chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "OFF" });
  chrome.storage.sync.set({ extensionState: "OFF" }); // Initialize state
});

async function injectScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["vim-scroll.js"],
  });
}

async function applyStateToTab(tabId) {
  const { extensionState } = await chrome.storage.sync.get("extensionState");
  if (!extensionState) return;

  await chrome.action.setBadgeText({ tabId, text: extensionState });

  if (extensionState === "ON") {
    await injectScript(tabId);
  }
}

// On clicking the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  const prevState = await chrome.action.getBadgeText({ tabId: tab.id });
  const nextState = prevState === "ON" ? "OFF" : "ON";

  await chrome.action.setBadgeText({ tabId: tab.id, text: nextState });
  await chrome.storage.sync.set({ extensionState: nextState });

  if (nextState === "ON") {
    // Try to re-enable an already-injected script, inject fresh if not present
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'setEnabled', value: true });
    } catch {
      await injectScript(tab.id);
    }
  } else {
    chrome.tabs.sendMessage(tab.id, { action: 'setEnabled', value: false });
  }
});

// Apply state to new tabs
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id) applyStateToTab(tab.id);
});

// Apply state when navigating to a new URL on the same tab
chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
  applyStateToTab(details.tabId);
});
