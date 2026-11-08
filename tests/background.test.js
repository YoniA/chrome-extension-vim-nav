'use strict';

// F-10 (toolbar icon toggle, badge, storage) and F-11 (re-apply state) — background.js.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundEnv } = require('./helpers/load');

const TAB = { id: 7 };
const INJECT = { target: { tabId: 7 }, files: ['vim-scroll.js'] };
const resolves = async () => undefined;

describe('F-10 install defaults', () => {
  test('on install, the default badge is OFF and the stored state is "OFF"', async () => {
    const bg = createBackgroundEnv();
    await bg.install();
    assert.deepEqual(bg.callsTo('action.setBadgeText'), [[{ text: 'OFF' }]]);
    assert.deepEqual(bg.callsTo('storage.sync.set'), [[{ extensionState: 'OFF' }]]);
    assert.equal(bg.globalBadge, 'OFF');
    assert.equal(bg.storage.extensionState, 'OFF');
  });

  test('loading the service worker registers exactly one listener per event', () => {
    const bg = createBackgroundEnv();
    const c = bg.chrome;
    assert.equal(c.runtime.onInstalled.listeners.length, 1);
    assert.equal(c.action.onClicked.listeners.length, 1);
    assert.equal(c.tabs.onCreated.listeners.length, 1);
    assert.equal(c.webNavigation.onDOMContentLoaded.listeners.length, 1);
  });

  test('loading the service worker makes no API calls by itself', () => {
    const bg = createBackgroundEnv();
    assert.deepEqual(bg.calls, []);
  });
});

describe('F-10 clicking the icon', () => {
  test('reads the clicked tab\'s badge', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'OFF' }, sendMessage: resolves });
    await bg.click(TAB);
    assert.deepEqual(bg.callsTo('action.getBadgeText'), [[{ tabId: 7 }]]);
  });

  for (const prev of ['OFF', '']) {
    test(`badge ${JSON.stringify(prev)} becomes ON for that tab and is saved`, async () => {
      const bg = createBackgroundEnv({ badges: { 7: prev }, sendMessage: resolves });
      await bg.click(TAB);
      assert.deepEqual(bg.callsTo('action.setBadgeText'), [[{ tabId: 7, text: 'ON' }]]);
      assert.deepEqual(bg.callsTo('storage.sync.set'), [[{ extensionState: 'ON' }]]);
      assert.equal(bg.tabBadges[7], 'ON');
    });
  }

  test('any other badge text also becomes ON', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'on' }, sendMessage: resolves });
    await bg.click(TAB);
    assert.equal(bg.tabBadges[7], 'ON');
  });

  test('badge ON becomes OFF for that tab and is saved', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'ON' }, sendMessage: resolves });
    await bg.click(TAB);
    assert.deepEqual(bg.callsTo('action.setBadgeText'), [[{ tabId: 7, text: 'OFF' }]]);
    assert.deepEqual(bg.callsTo('storage.sync.set'), [[{ extensionState: 'OFF' }]]);
    assert.equal(bg.tabBadges[7], 'OFF');
  });

  test('badge and storage are updated before the tab is messaged', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'OFF' }, sendMessage: resolves });
    await bg.click(TAB);
    assert.deepEqual(bg.calls.map((c) => c[0]), [
      'action.getBadgeText',
      'action.setBadgeText',
      'storage.sync.set',
      'tabs.sendMessage',
    ]);
  });

  test('turning ON re-enables an already-injected script and does not inject', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'OFF' }, sendMessage: resolves });
    await bg.click(TAB);
    assert.deepEqual(bg.callsTo('tabs.sendMessage'), [[7, { action: 'setEnabled', value: true }]]);
    assert.deepEqual(bg.callsTo('scripting.executeScript'), []);
  });

  test('turning ON injects vim-scroll.js when no script receives the message', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'OFF' } }); // default sendMessage rejects
    await bg.click(TAB);
    assert.deepEqual(bg.callsTo('tabs.sendMessage'), [[7, { action: 'setEnabled', value: true }]]);
    assert.deepEqual(bg.callsTo('scripting.executeScript'), [[INJECT]]);
  });

  test('turning ON injects into the top frame only (no frameIds/allFrames)', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'OFF' } });
    await bg.click(TAB);
    const [[details]] = bg.callsTo('scripting.executeScript');
    assert.deepEqual(Object.keys(details.target), ['tabId']);
  });

  test('turning OFF sends setEnabled false and never injects', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'ON' }, sendMessage: resolves });
    await bg.click(TAB);
    assert.deepEqual(bg.callsTo('tabs.sendMessage'), [[7, { action: 'setEnabled', value: false }]]);
    assert.deepEqual(bg.callsTo('scripting.executeScript'), []);
  });

  test('two clicks on the same tab toggle ON then OFF', async () => {
    const bg = createBackgroundEnv({ badges: { 7: 'OFF' }, sendMessage: resolves });
    await bg.click(TAB);
    await bg.click(TAB);
    assert.equal(bg.tabBadges[7], 'OFF');
    assert.equal(bg.storage.extensionState, 'OFF');
    assert.deepEqual(
      bg.callsTo('tabs.sendMessage').map(([, m]) => m.value),
      [true, false],
    );
  });
});

describe('F-11 re-apply saved state', () => {
  const sources = [
    ['tab created', (bg) => bg.createTab({ id: 7 })],
    ['DOMContentLoaded (top frame)', (bg) => bg.domContentLoaded({ tabId: 7, frameId: 0 })],
    ['DOMContentLoaded (subframe)', (bg) => bg.domContentLoaded({ tabId: 7, frameId: 3 })],
  ];

  for (const [name, fire] of sources) {
    describe(name, () => {
      test('reads the stored state', async () => {
        const bg = createBackgroundEnv({ storedState: 'OFF' });
        await fire(bg);
        assert.deepEqual(bg.callsTo('storage.sync.get'), [['extensionState']]);
      });

      test('no stored state: nothing else happens', async () => {
        const bg = createBackgroundEnv();
        await fire(bg);
        assert.deepEqual(bg.calls.map((c) => c[0]), ['storage.sync.get']);
      });

      test('stored ON: sets the tab badge to ON and injects into the top frame', async () => {
        const bg = createBackgroundEnv({ storedState: 'ON' });
        await fire(bg);
        assert.deepEqual(bg.callsTo('action.setBadgeText'), [[{ tabId: 7, text: 'ON' }]]);
        assert.deepEqual(bg.callsTo('scripting.executeScript'), [[INJECT]]);
      });

      test('stored OFF: sets the tab badge to OFF and injects nothing', async () => {
        const bg = createBackgroundEnv({ storedState: 'OFF' });
        await fire(bg);
        assert.deepEqual(bg.callsTo('action.setBadgeText'), [[{ tabId: 7, text: 'OFF' }]]);
        assert.deepEqual(bg.callsTo('scripting.executeScript'), []);
      });

      test('does not message the tab', async () => {
        const bg = createBackgroundEnv({ storedState: 'ON' });
        await fire(bg);
        assert.deepEqual(bg.callsTo('tabs.sendMessage'), []);
      });
    });
  }

  test('a created tab without an id is ignored (storage is not read)', async () => {
    const bg = createBackgroundEnv({ storedState: 'ON' });
    await bg.createTab({});
    assert.deepEqual(bg.calls, []);
  });
});

describe('known bugs, not yet covered', () => {
  test.todo('B-3 badge never says ON where injection failed; injection errors are caught');
  test.todo('B-4 badge in every tab matches the decided global/per-tab model');
  test.todo('B-5 no uncaught errors on restricted pages; badge not ON there; OFF without receiver');
  test.todo('B-6 onInstalled resets state only when reason is "install"');
});
