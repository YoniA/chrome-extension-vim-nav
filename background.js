// One global on/off switch for every tab. The manifest loads vim-scroll.js into every page, and
// each page follows extensionState in sync storage, so this worker only flips the state and shows
// it on the badge. Not stored (fresh install) means ON.

async function currentState() {
  const { extensionState } = await chrome.storage.sync.get('extensionState');
  return extensionState === 'OFF' ? 'OFF' : 'ON';
}

async function showState() {
  await chrome.action.setBadgeText({ text: await currentState() });
}

// Clicking the icon in any tab; also callable from automation (tools/, tests/e2e/).
async function toggleExtension() {
  const next = (await currentState()) === 'ON' ? 'OFF' : 'ON';
  await chrome.storage.sync.set({ extensionState: next });
  // The badge follows through storage.onChanged below.
}

// Install and update keep the stored state; the badge is per browser session, so set it again.
chrome.runtime.onInstalled.addListener(showState);
chrome.runtime.onStartup.addListener(showState);

chrome.action.onClicked.addListener(toggleExtension);

// x in a page (F-13): close the tab it was pressed in, unless it is pinned. Closing a window's
// last tab closes the window, as Cmd/Ctrl+W does.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.action === 'closeTab' && sender.tab && !sender.tab.pinned) chrome.tabs.remove(sender.tab.id);
});

// Also covers a change synced from another device.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && 'extensionState' in changes) showState();
});
