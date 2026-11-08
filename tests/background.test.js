'use strict';

// Service worker (background.js): one global on/off switch (B-4), kept across updates (B-6).
// VimNav is loaded into every page by the manifest (B-3), so the service worker never injects
// scripts or messages tabs; it only flips the stored state and shows it on the badge.
// State: extensionState in sync storage, "ON" or "OFF"; not stored means ON (fresh install).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundEnv } = require('./helpers/load');

// Every badge update is global: no tabId, so all tabs show the same badge.
function assertBadgesGlobal(bg) {
  for (const [details] of bg.callsTo('action.setBadgeText')) {
    assert.equal(details.tabId, undefined, `badge set for one tab: ${JSON.stringify(details)}`);
  }
}

describe('loading the service worker', () => {
  test('registers exactly one listener for install, startup, icon click and storage change', () => {
    const bg = createBackgroundEnv();
    const c = bg.chrome;
    assert.equal(c.runtime.onInstalled.listeners.length, 1);
    assert.equal(c.runtime.onStartup.listeners.length, 1);
    assert.equal(c.action.onClicked.listeners.length, 1);
    assert.equal(c.storage.onChanged.listeners.length, 1);
  });

  test('makes no API calls by itself', () => {
    const bg = createBackgroundEnv({ storedState: 'OFF' });
    assert.deepEqual(bg.calls, []);
  });
});

describe('F-10 / B-6 install, update and browser start', () => {
  test('fresh install (nothing stored): the badge shows ON', async () => {
    const bg = createBackgroundEnv();
    await bg.install({ reason: 'install' });
    assert.equal(bg.globalBadge, 'ON');
    assert.notEqual(bg.storage.extensionState, 'OFF');
    assertBadgesGlobal(bg);
  });

  for (const reason of ['update', 'chrome_update', 'shared_module_update']) {
    test(`${reason} keeps a stored OFF: badge OFF, state still OFF`, async () => {
      const bg = createBackgroundEnv({ storedState: 'OFF' });
      await bg.install({ reason });
      assert.equal(bg.globalBadge, 'OFF');
      assert.equal(bg.storage.extensionState, 'OFF');
    });

    test(`${reason} keeps a stored ON: badge ON`, async () => {
      const bg = createBackgroundEnv({ storedState: 'ON' });
      await bg.install({ reason });
      assert.equal(bg.globalBadge, 'ON');
      assert.equal(bg.storage.extensionState, 'ON');
    });
  }

  test('install with a state already synced from another device keeps it (OFF stays OFF)', async () => {
    const bg = createBackgroundEnv({ storedState: 'OFF' });
    await bg.install({ reason: 'install' });
    assert.equal(bg.globalBadge, 'OFF');
    assert.equal(bg.storage.extensionState, 'OFF');
  });

  for (const [stored, badge] of [['ON', 'ON'], ['OFF', 'OFF'], [undefined, 'ON']]) {
    test(`browser start with stored ${stored}: the badge shows ${badge}`, async () => {
      const bg = createBackgroundEnv({ storedState: stored });
      await bg.startup();
      assert.equal(bg.globalBadge, badge);
      assertBadgesGlobal(bg);
    });
  }
});

describe('F-10 / B-4 clicking the icon flips the one global switch', () => {
  for (const [stored, next] of [['ON', 'OFF'], ['OFF', 'ON'], [undefined, 'OFF']]) {
    test(`stored ${stored} becomes ${next}: saved, and the badge shows ${next} for all tabs`, async () => {
      const bg = createBackgroundEnv({ storedState: stored });
      await bg.click({ id: 7 });
      assert.equal(bg.storage.extensionState, next);
      assert.equal(bg.globalBadge, next);
      assertBadgesGlobal(bg);
    });
  }

  test('the clicked tab makes no difference: clicks in different tabs flip the same switch', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    await bg.click({ id: 1 });
    await bg.click({ id: 2 });
    await bg.click({ id: 3 });
    assert.equal(bg.storage.extensionState, 'OFF');
    assert.equal(bg.globalBadge, 'OFF');
  });

  test('the next state comes from storage, not from a badge that may be stale', async () => {
    const bg = createBackgroundEnv({ storedState: 'OFF', globalBadge: 'ON' });
    await bg.click();
    assert.equal(bg.storage.extensionState, 'ON');
    assert.equal(bg.globalBadge, 'ON');
  });

  test('two clicks: OFF then back ON', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    await bg.click();
    assert.equal(bg.globalBadge, 'OFF');
    await bg.click();
    assert.equal(bg.storage.extensionState, 'ON');
    assert.equal(bg.globalBadge, 'ON');
  });
});

describe('B-4 the badge follows the stored state', () => {
  test('a change synced from another device updates the badge', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    await bg.install({ reason: 'update' });
    await bg.sharedStorage.sync.set({ extensionState: 'OFF' });
    await new Promise((r) => setImmediate(r));
    assert.equal(bg.globalBadge, 'OFF');
  });

  test('changes to other keys or storage areas do not touch the badge', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    const listener = bg.chrome.storage.onChanged.listeners[0];
    listener({ other: { newValue: 1 } }, 'sync');
    listener({ extensionState: { newValue: 'OFF' } }, 'local');
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(bg.callsTo('action.setBadgeText'), []);
  });
});

describe('known bugs, not yet covered', () => {
  test.todo('B-5 restricted pages (chrome://, Web Store): decide what the global badge shows there');
});
