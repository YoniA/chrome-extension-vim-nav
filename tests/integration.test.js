'use strict';

// F-10 / F-11 end to end: background.js wired to one tab running vim-scroll.js.
// tabs.sendMessage delivers to the tab's onMessage listeners (rejects if there are none);
// scripting.executeScript runs vim-scroll.js in the tab. Assumption: like Chrome, an error
// thrown by the injected file is reported in the page and executeScript still resolves.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createBackgroundEnv, createContentEnv } = require('./helpers/load');

function setup(bgOptions = {}) {
  const tab = createContentEnv({ hrefs: ['https://example.test/a'] });
  const injectErrors = [];
  const bg = createBackgroundEnv({
    ...bgOptions,
    async sendMessage(tabId, msg) {
      if (!tab.message(msg)) throw new Error('Could not establish connection. Receiving end does not exist.');
    },
    async executeScript() {
      try {
        tab.inject();
      } catch (err) {
        injectErrors.push(err);
      }
      return [];
    },
  });
  return { tab, bg, injectErrors, id: { id: 1 } };
}

describe('F-10 toggle end to end', () => {
  test('first click on a tab without the script injects it and keys work', async () => {
    const { tab, bg, id } = setup();
    await bg.click(id);
    assert.equal(bg.callsTo('scripting.executeScript').length, 1);
    tab.keydown('j');
    assert.deepEqual(tab.scrollCalls, [[0, 50]]);
  });

  test('second click turns OFF: keys are ignored', async () => {
    const { tab, bg, id } = setup();
    await bg.click(id);
    await bg.click(id);
    tab.keydown('j');
    assert.deepEqual(tab.scrollCalls, []);
    assert.equal(bg.tabBadges[1], 'OFF');
  });

  test('third click re-enables the existing script without injecting again', async () => {
    const { tab, bg, id, injectErrors } = setup();
    await bg.click(id);
    await bg.click(id);
    await bg.click(id);
    assert.equal(bg.callsTo('scripting.executeScript').length, 1);
    assert.deepEqual(injectErrors, []);
    tab.keydown('j');
    assert.deepEqual(tab.scrollCalls, [[0, 50]]);
    assert.equal(tab.document.keydownListeners().length, 1);
  });

  test('stored ON re-applied to an already-injected tab does not add a second handler', async () => {
    const { tab, bg, id, injectErrors } = setup();
    await bg.click(id); // inject
    await bg.domContentLoaded({ tabId: 1, frameId: 0 }); // stored ON -> inject again
    assert.equal(bg.callsTo('scripting.executeScript').length, 2);
    assert.equal(injectErrors.length, 1);
    assert.equal(tab.document.keydownListeners().length, 1);
    tab.keydown('j');
    assert.deepEqual(tab.scrollCalls, [[0, 50]]);
  });
});

describe('F-11 end to end', () => {
  test('stored ON on a new page: script is injected enabled', async () => {
    const { tab, bg } = setup({ storedState: 'ON' });
    await bg.domContentLoaded({ tabId: 1, frameId: 0 });
    tab.keydown('k');
    assert.deepEqual(tab.scrollCalls, [[0, -50]]);
    assert.equal(bg.tabBadges[1], 'ON');
  });

  test('stored OFF on a new page: no script, keys do nothing', async () => {
    const { tab, bg } = setup({ storedState: 'OFF' });
    await bg.domContentLoaded({ tabId: 1, frameId: 0 });
    tab.keydown('k');
    assert.deepEqual(tab.scrollCalls, []);
    assert.equal(tab.document.keydownListeners().length, 0);
  });
});
