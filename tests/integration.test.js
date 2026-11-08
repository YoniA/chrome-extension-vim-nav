'use strict';

// B-3 / B-4 end to end: background.js and several tabs running vim-scroll.js, sharing one sync
// storage. The manifest loads the script into every page, so tabs just open (no injection).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundEnv, flush } = require('./helpers/load');

function commandsWork(tab) {
  const before = tab.scrollCalls.length;
  tab.keydown('j');
  return tab.scrollCalls.length > before;
}

describe('B-3 / B-4 one global switch for every tab', () => {
  test('fresh install: a new tab works without clicking the icon, and the badge says ON', async () => {
    const bg = createBackgroundEnv();
    await bg.install({ reason: 'install' });
    const tab = bg.openTab();
    await flush();
    assert.ok(commandsWork(tab));
    assert.equal(bg.globalBadge, 'ON');
  });

  test('a click in one tab turns VimNav OFF in every open tab, and back ON', async () => {
    const bg = createBackgroundEnv();
    await bg.install();
    const a = bg.openTab();
    const b = bg.openTab();
    await flush();
    await bg.click({ id: 1 });
    assert.equal(commandsWork(a), false, 'tab A still on');
    assert.equal(commandsWork(b), false, 'tab B still on');
    assert.equal(bg.globalBadge, 'OFF');
    await bg.click({ id: 2 }); // from the other tab
    assert.ok(commandsWork(a), 'tab A still off');
    assert.ok(commandsWork(b), 'tab B still off');
    assert.equal(bg.globalBadge, 'ON');
  });

  test('a tab opened while OFF starts OFF', async () => {
    const bg = createBackgroundEnv();
    await bg.install();
    await bg.click();
    const tab = bg.openTab();
    await flush();
    assert.equal(commandsWork(tab), false);
  });

  test('after an extension update, a stored OFF stays OFF in new tabs and on the badge (B-6)', async () => {
    const bg = createBackgroundEnv({ storedState: 'OFF' });
    await bg.install({ reason: 'update' });
    const tab = bg.openTab();
    await flush();
    assert.equal(commandsWork(tab), false);
    assert.equal(bg.globalBadge, 'OFF');
  });
});
