'use strict';

// Minimal chrome.* fakes. Every call is recorded in `calls` as [name, ...args]
// (arguments are deep-copied into this realm so tests can deepStrictEqual them).

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener(fn) {
      listeners.push(fn);
    },
  };
}

// Sync storage shared by the service worker and every tab: set() notifies storage.onChanged
// listeners everywhere, like Chrome. `data` is the stored items.
function createFakeStorage(data = {}, calls = null) {
  const onChanged = createEvent();
  const sync = {
    async get(keys) {
      if (calls) calls.push(['storage.sync.get', copy(keys)]);
      const names = typeof keys === 'string' ? [keys] : keys;
      const out = {};
      for (const k of names) if (k in data) out[k] = data[k];
      return out;
    },
    async set(items) {
      if (calls) calls.push(['storage.sync.set', copy(items)]);
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = v;
      }
      onChanged.listeners.forEach((l) => l(changes, 'sync'));
    },
  };
  return { data, sync, onChanged };
}

// chrome object as seen by the content script.
//   storage: a createFakeStorage() to share with the service worker / other tabs (default: own, empty)
//   sendMessage(msg): what runtime.sendMessage does (default: resolves); every message is also
//     recorded in `sentMessages`
function createContentChrome({ storage = createFakeStorage(), sendMessage } = {}) {
  const sentMessages = [];
  return {
    sentMessages,
    runtime: {
      onMessage: createEvent(),
      sendMessage(msg) {
        sentMessages.push(copy(msg));
        return sendMessage ? sendMessage(msg) : Promise.resolve();
      },
    },
    storage: { sync: storage.sync, onChanged: storage.onChanged },
  };
}

// chrome object as seen by the service worker.
//   storedState: initial value of extensionState in sync storage (undefined = not stored)
//   globalBadge: initial badge text
// It has no scripting or webNavigation API and only tabs.remove: the extension uses nothing else,
// so any other call fails.
function createBackgroundChrome({ storedState, globalBadge = '' } = {}) {
  const calls = [];
  const data = {};
  if (storedState !== undefined) data.extensionState = storedState;
  const storage = createFakeStorage(data, calls);
  const tabBadges = {};
  const state = { globalBadge };

  const chrome = {
    runtime: { onInstalled: createEvent(), onStartup: createEvent(), onMessage: createEvent() },
    tabs: {
      async remove(tabId) {
        calls.push(['tabs.remove', copy(tabId)]);
      },
    },
    action: {
      onClicked: createEvent(),
      async setBadgeText(details) {
        calls.push(['action.setBadgeText', copy(details)]);
        if (details.tabId === undefined) state.globalBadge = details.text;
        else tabBadges[details.tabId] = details.text;
      },
      async getBadgeText(details) {
        calls.push(['action.getBadgeText', copy(details)]);
        if (details.tabId !== undefined && details.tabId in tabBadges) return tabBadges[details.tabId];
        return state.globalBadge;
      },
    },
    storage: { sync: storage.sync, onChanged: storage.onChanged },
  };

  return {
    chrome,
    calls,
    storage: data,
    sharedStorage: storage,
    tabBadges,
    get globalBadge() {
      return state.globalBadge;
    },
    callsTo(name) {
      return calls.filter((c) => c[0] === name).map((c) => c.slice(1));
    },
  };
}

module.exports = { createEvent, createFakeStorage, createContentChrome, createBackgroundChrome };
