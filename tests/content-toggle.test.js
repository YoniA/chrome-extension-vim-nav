'use strict';

// F-10 / B-4, content-script side: every tab follows the one global switch (extensionState in
// sync storage) at load and live, without a reload. Not stored means ON. The script starts ON
// and corrects itself once storage has been read, so a stored OFF takes effect a moment after load.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv, flush } = require('./helpers/load');

const url = (i) => `https://example.test/page-${i}`;

async function setup({ count = 3, storedState } = {}) {
  const env = createContentEnv({ hrefs: Array.from({ length: count }, (_, i) => url(i)), storedState });
  env.inject();
  await flush();
  return env;
}

function commandsWork(env) {
  const before = env.scrollCalls.length;
  env.keydown('j');
  return env.scrollCalls.length > before;
}

describe('F-10 / B-4 state at page load', () => {
  test('nothing stored (fresh install): commands work', async () => {
    const env = await setup();
    assert.ok(commandsWork(env));
  });

  test('stored ON: commands work', async () => {
    const env = await setup({ storedState: 'ON' });
    assert.ok(commandsWork(env));
  });

  test('stored OFF: every command key is ignored', async () => {
    const env = await setup({ storedState: 'OFF' });
    for (const k of ['j', 'k', 'h', 'l', 'G', 'g', 'g', 'H', 'L', 'f']) env.keydown(k);
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, []);
    assert.equal(env.labels().length, 0);
  });

  test('a switch flipped while storage is still being read wins over the value read', async () => {
    const env = createContentEnv({ hrefs: [url(0)], storedState: 'ON' });
    env.inject();
    await env.setStoredState('OFF'); // arrives before the initial read resolves
    await flush();
    assert.equal(commandsWork(env), false);
  });

  test('injection registers exactly one keydown handler and one storage listener', async () => {
    const env = await setup();
    assert.equal(env.document.keydownListeners().length, 1);
    assert.equal(env.chrome.storage.onChanged.listeners.length, 1);
  });
});

describe('F-10 / B-4 switching live, without a reload', () => {
  test('switching OFF: keys are ignored at once', async () => {
    const env = await setup();
    await env.setStoredState('OFF');
    assert.equal(commandsWork(env), false);
  });

  test('switching back ON: commands work again', async () => {
    const env = await setup({ storedState: 'OFF' });
    await env.setStoredState('ON');
    assert.ok(commandsWork(env));
  });

  test('switching OFF in link mode leaves link mode: labels removed, a pending label never opens', async () => {
    const env = await setup({ count: 27 });
    env.keydown('f');
    env.keydown('a'); // waits for a possible "aa"
    assert.equal(env.labels().length, 27);
    await env.setStoredState('OFF');
    assert.equal(env.labels().length, 0);
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('after OFF in link mode and back ON, j scrolls and f shows one fresh set of labels', async () => {
    const env = await setup({ count: 5 });
    env.keydown('f');
    await env.setStoredState('OFF');
    await env.setStoredState('ON');
    assert.ok(commandsWork(env));
    env.keydown('f');
    assert.equal(env.labels().length, 5);
  });

  test('while OFF, Escape and label letters do nothing', async () => {
    const env = await setup({ storedState: 'OFF' });
    env.keydown('f');
    env.keydown('a');
    env.keydown('Escape');
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
    assert.equal(env.clock.pendingCount(), 0);
  });

  test('changes to other keys or storage areas do not change the state', async () => {
    const env = await setup();
    const listener = env.chrome.storage.onChanged.listeners[0];
    listener({ other: { newValue: 'OFF' } }, 'sync');
    listener({ extensionState: { newValue: 'OFF' } }, 'local');
    assert.ok(commandsWork(env));
  });

  test('extensionState removed from storage (no new value) means ON', async () => {
    const env = await setup({ storedState: 'OFF' });
    env.chrome.storage.onChanged.listeners[0]({ extensionState: { oldValue: 'OFF' } }, 'sync');
    assert.ok(commandsWork(env));
  });
});

describe('loading the script twice into one page', () => {
  test('a second copy throws and does not add a second handler', async () => {
    const env = await setup();
    assert.throws(() => env.inject());
    assert.equal(env.document.keydownListeners().length, 1);
  });

  test('the __vimNavActive guard stops a copy loaded into a window already marked active', () => {
    const env = createContentEnv();
    env.window.__vimNavActive = true;
    assert.throws(() => env.inject(), /VimNav already active/);
    assert.equal(env.document.keydownListeners().length, 0);
  });
});
