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

// chrome object as seen by the content script.
function createContentChrome() {
  return {
    runtime: { onMessage: createEvent() },
  };
}

// chrome object as seen by the service worker.
//   storedState: initial value of extensionState in sync storage (undefined = not stored)
//   badges: { [tabId]: text } initial per-tab badge text; globalBadge: default badge text
//   sendMessage(tabId, msg): implementation; default rejects like Chrome with no receiver
//   executeScript(details): implementation; default resolves
function createBackgroundChrome({
  storedState,
  badges = {},
  globalBadge = '',
  sendMessage,
  executeScript,
} = {}) {
  const calls = [];
  const storage = {};
  if (storedState !== undefined) storage.extensionState = storedState;
  const tabBadges = { ...badges };
  const state = { globalBadge };

  const chrome = {
    runtime: { onInstalled: createEvent() },
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
    storage: {
      sync: {
        async get(keys) {
          calls.push(['storage.sync.get', copy(keys)]);
          const names = typeof keys === 'string' ? [keys] : keys;
          const out = {};
          for (const k of names) if (k in storage) out[k] = storage[k];
          return out;
        },
        async set(items) {
          calls.push(['storage.sync.set', copy(items)]);
          Object.assign(storage, items);
        },
      },
    },
    scripting: {
      async executeScript(details) {
        calls.push(['scripting.executeScript', copy(details)]);
        if (executeScript) return executeScript(details);
        return [];
      },
    },
    tabs: {
      onCreated: createEvent(),
      async sendMessage(tabId, msg) {
        calls.push(['tabs.sendMessage', tabId, copy(msg)]);
        if (sendMessage) return sendMessage(tabId, msg);
        throw new Error('Could not establish connection. Receiving end does not exist.');
      },
    },
    webNavigation: { onDOMContentLoaded: createEvent() },
  };

  return {
    chrome,
    calls,
    storage,
    tabBadges,
    get globalBadge() {
      return state.globalBadge;
    },
    callsTo(name) {
      return calls.filter((c) => c[0] === name).map((c) => c.slice(1));
    },
  };
}

module.exports = { createEvent, createContentChrome, createBackgroundChrome };
