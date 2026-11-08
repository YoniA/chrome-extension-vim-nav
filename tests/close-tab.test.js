'use strict';

// F-13: x closes the current tab. The content script asks the service worker, which closes the
// tab the message came from, unless it is pinned.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv, createBackgroundEnv, flush } = require('./helpers/load');

const CLOSE = { action: 'closeTab' };

function setup(options = {}) {
  const env = createContentEnv({ hrefs: ['https://example.test/1', 'https://example.test/2', 'https://example.test/3'], ...options });
  env.inject();
  return env;
}

describe('F-13 content script: x asks to close the tab', () => {
  test('x sends one closeTab message', () => {
    const env = setup();
    env.keydown('x');
    assert.deepEqual(env.sentMessages(), [CLOSE]);
  });

  test('a held-down x (auto-repeat keydowns) sends nothing, also in the tab that becomes active next', () => {
    const env = setup();
    env.keydown('x', { repeat: true });
    env.keydown('x', { repeat: true });
    assert.deepEqual(env.sentMessages(), []);
  });

  test('uppercase X does not close the tab', () => {
    const env = setup();
    env.keydown('X', { shiftKey: true });
    env.keydown('X');
    assert.deepEqual(env.sentMessages(), []);
  });

  test('while OFF, x does nothing', async () => {
    const env = setup({ storedState: 'OFF' });
    await flush();
    env.keydown('x');
    assert.deepEqual(env.sentMessages(), []);
  });

  test('typed in a text field, x does nothing (B-1)', () => {
    const env = setup();
    const input = env.document.body.appendChild(env.document.createElement('input'));
    env.keydown('x', { target: input });
    assert.deepEqual(env.sentMessages(), []);
  });

  test('Ctrl/Cmd/Alt+x (e.g. cut) does nothing (B-2)', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      const env = setup();
      env.keydown('x', { [modifier]: true });
      assert.deepEqual(env.sentMessages(), [], modifier);
    }
  });

  test('in link mode, x is label input, not close', () => {
    const env = setup();
    env.keydown('f');
    env.keydown('x'); // no label x among 3 links
    assert.deepEqual(env.sentMessages(), []);
  });

  test('in link mode with a label x, x follows that link and does not close the tab', () => {
    const hrefs = Array.from({ length: 24 }, (_, i) => `https://example.test/${i}`);
    const env = createContentEnv({ hrefs });
    env.inject();
    env.keydown('f');
    env.keydown('x');
    assert.deepEqual(env.navigations(), ['https://example.test/23']);
    assert.deepEqual(env.sentMessages(), []);
  });

  test('the x keydown is not prevented or stopped', () => {
    const env = setup();
    const e = env.keydown('x');
    assert.equal(e.defaultPrevented, false);
    assert.equal(e.propagationStopped, false);
  });

  test('x after g is not part of gg, and g x g is not gg', () => {
    const env = setup();
    env.keydown('g');
    env.keydown('x');
    env.keydown('g');
    assert.deepEqual(env.scrollCalls, []);
  });

  test('if the service worker cannot be reached (e.g. the extension was reloaded), x throws nothing', async () => {
    const rejecting = setup({ sendMessage: () => Promise.reject(new Error('Could not establish connection.')) });
    assert.doesNotThrow(() => rejecting.keydown('x'));
    const throwing = setup({
      sendMessage: () => {
        throw new Error('Extension context invalidated.');
      },
    });
    assert.doesNotThrow(() => throwing.keydown('x'));
    await flush();
  });
});

describe('F-13 service worker: closes the tab that asked', () => {
  test('a closeTab message from an unpinned tab closes that tab, and only that tab', async () => {
    const bg = createBackgroundEnv();
    await bg.message(CLOSE, { tab: { id: 42, pinned: false } });
    assert.deepEqual(bg.callsTo('tabs.remove'), [[42]]);
  });

  test('a pinned tab is not closed', async () => {
    const bg = createBackgroundEnv();
    await bg.message(CLOSE, { tab: { id: 42, pinned: true } });
    assert.deepEqual(bg.callsTo('tabs.remove'), []);
  });

  test('a message that does not come from a tab closes nothing', async () => {
    const bg = createBackgroundEnv();
    await bg.message(CLOSE, {});
    assert.deepEqual(bg.callsTo('tabs.remove'), []);
  });

  test('other messages close nothing', async () => {
    const bg = createBackgroundEnv();
    await bg.message({ action: 'somethingElse' });
    await bg.message('closeTab');
    await bg.message(null);
    assert.deepEqual(bg.callsTo('tabs.remove'), []);
  });

  test('closing does not touch the on/off state or the badge', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    await bg.message(CLOSE);
    assert.deepEqual(bg.callsTo('storage.sync.set'), []);
    assert.deepEqual(bg.callsTo('action.setBadgeText'), []);
  });
});
