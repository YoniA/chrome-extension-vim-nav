'use strict';

// Loads the real, unmodified extension scripts into fresh vm contexts with fake globals.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createFakeDocument, FakeAnchor, FakeElement } = require('./fake-dom');
const { createFakeClock } = require('./fake-clock');
const { createContentChrome, createBackgroundChrome } = require('./fake-chrome');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_FILE = path.join(ROOT, 'vim-scroll.js');
const BACKGROUND_FILE = path.join(ROOT, 'background.js');

function runFile(file, context) {
  // Using the real path as filename lets --experimental-test-coverage attribute coverage.
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(context);
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

// Content-script environment (one browser tab).
//   hrefs: list of href values for <a> elements appended to <body>; null/undefined = no href attribute
function createContentEnv({ hrefs = [], scrollHeight = 5000 } = {}) {
  const document = createFakeDocument({ scrollHeight });
  const links = hrefs.map((href) => document.body.appendChild(new FakeAnchor(href)));
  const clock = createFakeClock();
  const chrome = createContentChrome();

  const scrollCalls = [];
  const historyCalls = [];
  const window = {
    location: { href: 'https://example.test/start' },
    scrollBy(...args) {
      scrollCalls.push(copy(args));
    },
    addEventListener() {},
  };
  const history = {
    back() {
      historyCalls.push('back');
    },
    forward() {
      historyCalls.push('forward');
    },
  };

  const context = vm.createContext({
    window,
    document,
    history,
    chrome,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
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
    keydown(key, { timeStamp = clock.now, repeat = false } = {}) {
      const event = {
        type: 'keydown',
        key,
        timeStamp,
        repeat,
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
    // Presses each key in order, `gap` ms apart (advancing the clock between keys).
    type(keys, { gap = 100 } = {}) {
      keys.forEach((k, i) => {
        if (i > 0) clock.advance(gap);
        env.keydown(k);
      });
    },
    // Delivers a runtime message like chrome.tabs.sendMessage would. Returns false if no receiver.
    message(msg) {
      const ls = chrome.runtime.onMessage.listeners;
      for (const l of ls) l(msg, {}, () => {});
      return ls.length > 0;
    },
    labels() {
      return document.getElementsByClassName('link-label');
    },
    visibleLabels() {
      return env.labels().filter((l) => !/display:\s*none/.test(l.cssText));
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
    install(details = { reason: 'install' }) {
      return Promise.all(c.runtime.onInstalled.listeners.map((l) => l(details)));
    },
    click(tab) {
      return Promise.all(c.action.onClicked.listeners.map((l) => l(tab)));
    },
    createTab(tab) {
      c.tabs.onCreated.listeners.forEach((l) => l(tab));
      return flush();
    },
    domContentLoaded(details) {
      c.webNavigation.onDOMContentLoaded.listeners.forEach((l) => l(details));
      return flush();
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
  CONTENT_FILE,
  BACKGROUND_FILE,
};
