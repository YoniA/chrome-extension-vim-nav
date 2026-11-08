'use strict';

// F-10, content-script side: setEnabled messages, disabled state, re-injection guard.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv } = require('./helpers/load');

const url = (i) => `https://example.test/page-${i}`;

function setup(count = 3) {
  const env = createContentEnv({ hrefs: Array.from({ length: count }, (_, i) => url(i)) });
  env.inject();
  return env;
}

const off = { action: 'setEnabled', value: false };
const on = { action: 'setEnabled', value: true };

describe('F-10 content script enable/disable', () => {
  test('a freshly injected script starts enabled', () => {
    const env = setup();
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('injection registers exactly one keydown handler and one message listener', () => {
    const env = setup();
    assert.equal(env.document.keydownListeners().length, 1);
    assert.equal(env.chrome.runtime.onMessage.listeners.length, 1);
    assert.equal(env.window.__vimNavActive, true);
  });

  test('when disabled, every command key is ignored', () => {
    const env = setup();
    env.message(off);
    for (const k of ['j', 'k', 'h', 'l', 'G', 'g', 'g', 'H', 'L', 'f', 'Escape']) env.keydown(k);
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, []);
    assert.equal(env.labels().length, 0);
  });

  test('when disabled in link mode, label keys are ignored and no timer starts', () => {
    const env = setup();
    env.keydown('f');
    env.message(off);
    env.keydown('a');
    assert.equal(env.clock.pendingCount(), 0);
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('when disabled in link mode, Escape is ignored and labels stay visible', () => {
    const env = setup();
    env.keydown('f');
    env.message(off);
    env.keydown('Escape');
    assert.equal(env.visibleLabels().length, 3);
  });

  test('disabling does not hide labels', () => {
    const env = setup();
    env.keydown('f');
    env.message(off);
    assert.equal(env.visibleLabels().length, 3);
  });

  test('after re-enable, link mode carries on: typing a label follows it', () => {
    const env = setup();
    env.keydown('f');
    env.message(off);
    env.message(on);
    env.keydown('b');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(1)]);
  });

  test('after re-enable, f does not add a second set of labels (still in link mode)', () => {
    const env = setup();
    env.keydown('f');
    env.message(off);
    env.message(on);
    env.keydown('f');
    assert.equal(env.labels().length, 3);
  });

  test('re-enabling restores normal commands', () => {
    const env = setup();
    env.message(off);
    env.keydown('j');
    env.message(on);
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('messages with another action do not change the enabled state', () => {
    const env = setup();
    env.message({ action: 'somethingElse', value: false });
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('injecting again into the same tab throws and does not add a second handler', () => {
    const env = setup();
    assert.throws(() => env.inject());
    assert.equal(env.document.keydownListeners().length, 1);
    assert.equal(env.chrome.runtime.onMessage.listeners.length, 1);
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('re-injection fails with a let-redeclaration SyntaxError, not the "VimNav already active" guard', () => {
    // Top-level `let` bindings persist in the shared global scope of a vm context (and of
    // Chrome's isolated world), so the second copy fails before its first line runs.
    const env = setup();
    assert.throws(() => env.inject(), (err) => {
      assert.equal(err.name, 'SyntaxError');
      assert.match(err.message, /already been declared/);
      return true;
    });
  });

  test('re-injection keeps the existing state (disabled stays disabled)', () => {
    const env = setup();
    env.message(off);
    assert.throws(() => env.inject());
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, []);
  });

  test('the __vimNavActive guard stops a copy loaded into a window already marked active', () => {
    const env = createContentEnv();
    env.window.__vimNavActive = true;
    assert.throws(() => env.inject(), /VimNav already active/);
    assert.equal(env.document.keydownListeners().length, 0);
    assert.equal(env.chrome.runtime.onMessage.listeners.length, 0);
  });
});
