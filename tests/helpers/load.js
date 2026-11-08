'use strict';

// Loads the real, unmodified extension scripts into fresh vm contexts with fake globals.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createFakeDocument, computedStyleOf, FakeAnchor, FakeElement, VIEWPORT } = require('./fake-dom');
const { createFakeClock } = require('./fake-clock');
const { createContentChrome, createBackgroundChrome, createFakeStorage } = require('./fake-chrome');

const ROOT = path.join(__dirname, '..', '..');
// VIMNAV_CONTENT_FILE / VIMNAV_BACKGROUND_FILE let QA run the same tests against another copy of a
// script (e.g. to check that new tests can pass). Normally unset: the real files are tested.
const CONTENT_FILE = process.env.VIMNAV_CONTENT_FILE
  ? path.resolve(process.env.VIMNAV_CONTENT_FILE)
  : path.join(ROOT, 'vim-scroll.js');
const BACKGROUND_FILE = process.env.VIMNAV_BACKGROUND_FILE
  ? path.resolve(process.env.VIMNAV_BACKGROUND_FILE)
  : path.join(ROOT, 'background.js');

// Test contract: a link label is an element with this class whose text content is the label.
const LABEL_CLASS = 'vimnav-label';

function runFile(file, context) {
  // Using the real path as filename lets --experimental-test-coverage attribute coverage.
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

// Content-script environment (one browser tab).
//   hrefs: list of href values for <a> elements appended to <body>; null/undefined = no href attribute
//   groupSize: if set, links are put in <div>s of this many links each (still in document order),
//     which keeps DOM insertions cheap in the fake for pages with tens of thousands of links.
//   storedState: extensionState in sync storage when the tab loads (undefined = not stored)
//   storage: a createFakeStorage() shared with the service worker or other tabs (overrides storedState)
// Every link is visible and inside the viewport by default (see fake-dom.js).
//   sendMessage: implementation of chrome.runtime.sendMessage (default resolves)
function createContentEnv({ hrefs = [], scrollHeight = 5000, groupSize, storedState, storage, sendMessage } = {}) {
  const document = createFakeDocument({ scrollHeight });
  let parent = document.body;
  const links = hrefs.map((href, i) => {
    if (groupSize && i % groupSize === 0) parent = document.body.appendChild(new FakeElement('div'));
    return parent.appendChild(new FakeAnchor(href));
  });
  const clock = createFakeClock();
  if (!storage) storage = createFakeStorage(storedState === undefined ? {} : { extensionState: storedState });
  const chrome = createContentChrome({ storage, sendMessage });

  const scrollCalls = [];
  const historyCalls = [];
  const windowListeners = [];
  const getComputedStyle = (el) => computedStyleOf(el);
  const window = {
    location: { href: 'https://example.test/start' },
    scrollBy(...args) {
      scrollCalls.push(copy(args));
    },
    addEventListener(type, handler) {
      windowListeners.push({ type, handler });
    },
    removeEventListener(type, handler) {
      const i = windowListeners.findIndex((l) => l.type === type && l.handler === handler);
      if (i >= 0) windowListeners.splice(i, 1);
    },
    innerWidth: VIEWPORT.width,
    innerHeight: VIEWPORT.height,
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    devicePixelRatio: 1,
    getComputedStyle,
  };
  document.defaultView = window;
  const history = {
    back() {
      historyCalls.push('back');
    },
    forward() {
      historyCalls.push('forward');
    },
  };

  // Bare globals that a browser resolves on window (innerHeight, getComputedStyle, ...).
  const context = vm.createContext({
    window,
    document,
    history,
    chrome,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    getComputedStyle,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    devicePixelRatio: 1,
  });

  const env = {
    context,
    window,
    document,
    history,
    chrome,
    clock,
    links,
    scrollCalls,
    historyCalls,
    // Runs vim-scroll.js in this tab (like scripting.executeScript). Throws what the script throws.
    inject() {
      runFile(CONTENT_FILE, context);
    },
    // Dispatches a keydown to every registered keydown listener. timeStamp defaults to clock.now.
    // target is the element the key was typed in (default <body>, i.e. nothing focused).
    keydown(
      key,
      { timeStamp = clock.now, repeat = false, target = document.body, path, ctrlKey = false, metaKey = false, altKey = false, shiftKey = false } = {},
    ) {
      // path overrides composedPath(), e.g. for an input inside a shadow root (target = its host).
      const event = {
        type: 'keydown',
        key,
        timeStamp,
        repeat,
        target,
        ctrlKey,
        metaKey,
        altKey,
        shiftKey,
        composedPath() {
          if (path) return path.slice();
          const nodes = [];
          for (let n = target; n; n = n.parentNode) nodes.push(n);
          return nodes;
        },
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopPropagation() {
          this.propagationStopped = true;
        },
        stopImmediatePropagation() {
          this.propagationStopped = true;
        },
      };
      for (const l of document.keydownListeners()) l.handler(event);
      return event;
    },
    // Dispatches a window event (e.g. 'pagehide', 'pageshow') to the listeners registered for it.
    windowEvent(type, props = {}) {
      const event = { type, ...props };
      for (const l of windowListeners.filter((l) => l.type === type)) l.handler(event);
      return event;
    },
    // Presses each key in order, `gap` ms apart (advancing the clock between keys).
    type(keys, { gap = 100 } = {}) {
      keys.forEach((k, i) => {
        if (i > 0) clock.advance(gap);
        env.keydown(k);
      });
    },
    // Messages the script sent to the service worker (chrome.runtime.sendMessage), in order.
    sentMessages() {
      return chrome.sentMessages.slice();
    },
    // Changes extensionState in sync storage, as the icon (or another device) would.
    // Every tab sharing this storage is notified.
    setStoredState(value) {
      return storage.sync.set({ extensionState: value });
    },
    // Delivers a runtime message like chrome.tabs.sendMessage would. Returns false if no receiver.
    message(msg) {
      const ls = chrome.runtime.onMessage.listeners;
      for (const l of ls) l(msg, {}, () => {});
      return ls.length > 0;
    },
    // All VimNav label elements in the page (class vimnav-label), in DOM order.
    labels() {
      return document.getElementsByClassName(LABEL_CLASS);
    },
    // Labels not hidden by inline display:none / visibility:hidden / the hidden attribute
    // on themselves or an ancestor. Removed labels are not in labels() at all.
    visibleLabels() {
      return env.labels().filter((l) => {
        for (let n = l; n && n.nodeType === 1; n = n.parentNode) {
          const d = n.style.getPropertyValue('display');
          const v = n.style.getPropertyValue('visibility');
          if (d === 'none' || v === 'hidden' || n.hidden) return false;
        }
        return true;
      });
    },
    // Text of each visible label.
    labelTexts() {
      return env.visibleLabels().map((l) => l.textContent);
    },
  };

  // Record every assignment to location.href; env.navigations() returns them in order.
  const assigned = [];
  let href = window.location.href;
  Object.defineProperty(window.location, 'href', {
    get: () => href,
    set: (v) => {
      assigned.push(v);
      href = v;
    },
  });
  env.navigations = () => assigned.slice();

  return env;
}

// Service-worker environment. Options are passed to createBackgroundChrome.
function createBackgroundEnv(options = {}) {
  const fake = createBackgroundChrome(options);
  const context = vm.createContext({ chrome: fake.chrome });
  runFile(BACKGROUND_FILE, context);
  const c = fake.chrome;
  const env = {
    ...fake,
    context,
    async install(details = { reason: 'install' }) {
      await Promise.all(c.runtime.onInstalled.listeners.map((l) => l(details)));
      return flush();
    },
    async startup() {
      await Promise.all(c.runtime.onStartup.listeners.map((l) => l()));
      return flush();
    },
    // A message from a tab's content script; sender.tab is that tab.
    async message(msg, sender = { tab: { id: 1, pinned: false } }) {
      await Promise.all(c.runtime.onMessage.listeners.map((l) => l(msg, sender, () => {})));
      return flush();
    },
    async click(tab = { id: 1 }) {
      await Promise.all(c.action.onClicked.listeners.map((l) => l(tab)));
      return flush();
    },
    // A tab running vim-scroll.js that shares this service worker's sync storage.
    openTab(contentOptions = {}) {
      const tab = createContentEnv({ hrefs: ['https://example.test/a'], ...contentOptions, storage: fake.sharedStorage });
      tab.inject();
      return tab;
    },
  };
  // Spread copies getters as values; keep globalBadge live.
  Object.defineProperty(env, 'globalBadge', { get: () => fake.globalBadge });
  return env;
}

// Lets pending promise chains (from listeners that don't return their promise) settle.
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

module.exports = {
  createContentEnv,
  createBackgroundEnv,
  flush,
  FakeAnchor,
  FakeElement,
  LABEL_CLASS,
  CONTENT_FILE,
  BACKGROUND_FILE,
};
