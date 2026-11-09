'use strict';

// F-14: X reopens the most recently closed tab or window. The content script asks the service
// worker, which calls sessions.restore() with no session id (Chrome's Cmd/Ctrl+Shift+T).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv, createBackgroundEnv, flush } = require('./helpers/load');

const REOPEN = { action: 'reopenTab' };

function setup(options = {}) {
  const env = createContentEnv({ hrefs: ['https://example.test/1', 'https://example.test/2', 'https://example.test/3'], ...options });
  env.inject();
  return env;
}

describe('F-14 content script: X asks to reopen the last closed tab', () => {
  test('X (Shift+x) sends one reopenTab message', () => {
    const env = setup();
    env.keydown('X', { shiftKey: true });
    assert.deepEqual(env.sentMessages(), [REOPEN]);
  });

  test('X with Caps Lock (no Shift) also reopens', () => {
    const env = setup();
    env.keydown('X');
    assert.deepEqual(env.sentMessages(), [REOPEN]);
  });

  test('each X press asks again (reopens the next most recently closed)', () => {
    const env = setup();
    env.keydown('X');
    env.keydown('X');
    assert.deepEqual(env.sentMessages(), [REOPEN, REOPEN]);
  });

  test('a held-down X (auto-repeat keydowns) sends nothing more', () => {
    const env = setup();
    env.keydown('X');
    env.keydown('X', { repeat: true });
    env.keydown('X', { repeat: true });
    assert.deepEqual(env.sentMessages(), [REOPEN]);
  });

  test('X never closes a tab, and x never reopens one', () => {
    const env = setup();
    env.keydown('X');
    env.keydown('x');
    assert.deepEqual(env.sentMessages(), [REOPEN, { action: 'closeTab' }]);
  });

  test('while OFF, X does nothing', async () => {
    const env = setup({ storedState: 'OFF' });
    await flush();
    env.keydown('X');
    assert.deepEqual(env.sentMessages(), []);
  });

  test('typed in a text field, X does nothing (B-1)', () => {
    const env = setup();
    const input = env.document.body.appendChild(env.document.createElement('input'));
    env.keydown('X', { target: input, shiftKey: true });
    assert.deepEqual(env.sentMessages(), []);
  });

  test('Ctrl/Cmd/Alt+Shift+X does nothing (B-2)', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      const env = setup();
      env.keydown('X', { [modifier]: true, shiftKey: true });
      assert.deepEqual(env.sentMessages(), [], modifier);
    }
  });

  test('in link mode, X is neither label input nor reopen', () => {
    const env = setup();
    env.keydown('f');
    env.keydown('X');
    assert.deepEqual(env.sentMessages(), []);
    assert.equal(env.labels().length, 3, 'still in link mode');
  });

  test('the X keydown is not prevented or stopped', () => {
    const env = setup();
    const e = env.keydown('X');
    assert.equal(e.defaultPrevented, false);
    assert.equal(e.propagationStopped, false);
  });

  test('if the service worker cannot be reached, X throws nothing', async () => {
    const env = setup({ sendMessage: () => Promise.reject(new Error('Could not establish connection.')) });
    assert.doesNotThrow(() => env.keydown('X'));
    await flush();
  });
});

describe('F-14 service worker: reopens the most recently closed tab or window', () => {
  test('a reopenTab message from a tab calls sessions.restore() with no session id', async () => {
    const bg = createBackgroundEnv();
    await bg.message(REOPEN);
    assert.deepEqual(bg.callsTo('sessions.restore'), [[]]);
  });

  test('also from a pinned tab', async () => {
    const bg = createBackgroundEnv();
    await bg.message(REOPEN, { tab: { id: 3, pinned: true } });
    assert.deepEqual(bg.callsTo('sessions.restore'), [[]]);
  });

  test('nothing to reopen: the rejection is caught (no unhandled error)', async () => {
    const unhandled = [];
    const onUnhandled = (err) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      const bg = createBackgroundEnv({ restore: () => Promise.reject(new Error('There are no recently closed sessions.')) });
      await bg.message(REOPEN);
      await new Promise((r) => setImmediate(r));
      assert.deepEqual(unhandled, []);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  test('reopening closes nothing and does not touch the on/off state', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    await bg.message(REOPEN);
    assert.deepEqual(bg.callsTo('tabs.remove'), []);
    assert.deepEqual(bg.callsTo('storage.sync.set'), []);
  });

  test('a message that does not come from a tab reopens nothing', async () => {
    const bg = createBackgroundEnv();
    await bg.message(REOPEN, {});
    assert.deepEqual(bg.callsTo('sessions.restore'), []);
  });
});
