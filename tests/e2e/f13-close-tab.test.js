'use strict';

// F-13 in real Chromium: x closes the current tab, not others; pinned tabs stay; holding x
// (auto-repeat) closes only one tab; x typed in a field or with VimNav OFF closes nothing.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser } = require('./helpers/browser');

let browser;
before(async () => {
  browser = await startBrowser();
});
after(async () => {
  await browser?.close();
});

async function closedSoon(page) {
  for (let i = 0; i < 20 && !page.isClosed(); i++) await new Promise((r) => setTimeout(r, 50));
  return page.isClosed();
}

// Pins or unpins the page's tab. Without the tabs permission the extension can't see tab URLs,
// so the page is brought to the front and the active tab is used.
async function setPinned(page, pinned) {
  await page.bringToFront();
  const error = await browser.worker.evaluate(async (pinned) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab) return 'no active tab';
    await chrome.tabs.update(tab.id, { pinned });
    return null;
  }, pinned);
  if (error) throw new Error(error);
}

// A keydown that Chrome marks as auto-repeat, as when the key is held down.
async function pressRepeat(page, key) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, autoRepeat: true });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key });
}

describe('F-13 x closes the current tab', { timeout: 60000 }, () => {
  test('x closes the tab it was pressed in; the other tab stays open', async () => {
    const keep = await browser.open('layout.html');
    const close = await browser.open('layout.html');
    try {
      await close.keyboard.press('x');
      assert.ok(await closedSoon(close), 'tab was not closed');
      assert.equal(keep.isClosed(), false, 'the other tab was closed');
    } finally {
      await keep.close();
    }
  });

  test('x on a pinned tab does nothing', async () => {
    const page = await browser.open('layout.html');
    try {
      await setPinned(page, true);
      await page.keyboard.press('x');
      assert.equal(await closedSoon(page), false, 'pinned tab was closed');
    } finally {
      if (!page.isClosed()) {
        await setPinned(page, false);
        await page.close();
      }
    }
  });

  test('an auto-repeat x (key held down) does not close the tab', async () => {
    const page = await browser.open('layout.html');
    try {
      await pressRepeat(page, 'x');
      assert.equal(await closedSoon(page), false);
    } finally {
      if (!page.isClosed()) await page.close();
    }
  });

  test('x typed in a text field types x and closes nothing', async () => {
    const page = await browser.open('fields.html');
    try {
      await page.click('#text');
      await page.keyboard.type('xx');
      assert.equal(await closedSoon(page), false);
      assert.equal(await page.inputValue('#text'), 'xx');
    } finally {
      if (!page.isClosed()) await page.close();
    }
  });

  test('with VimNav OFF, x closes nothing', async () => {
    const page = await browser.open('layout.html');
    try {
      await browser.setState('OFF');
      await page.waitForTimeout(100);
      await page.keyboard.press('x');
      assert.equal(await closedSoon(page), false);
    } finally {
      await browser.setState('ON');
      if (!page.isClosed()) await page.close();
    }
  });
});
