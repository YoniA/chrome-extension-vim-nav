'use strict';

// F-14 in real Chromium: X reopens the most recently closed tab or window (Chrome's own
// "recently closed" list, so tabs closed any way count), one per press; holding X reopens one.

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

// Presses x to close the tab. The tab can close between key down and key up, which makes
// Playwright report the unfinished key press as an error; that's expected here.
async function pressCloseKey(page) {
  await page.keyboard.press('x').catch((e) => {
    if (!page.isClosed() && !/closed/.test(e.message)) throw e;
  });
}

async function closedSoon(page) {
  for (let i = 0; i < 40 && !page.isClosed(); i++) await new Promise((r) => setTimeout(r, 50));
  return page.isClosed();
}

// Presses a key in `page` and returns the URL of the tab that opens because of it (or null).
async function reopenedBy(page, key) {
  const opened = browser.context.waitForEvent('page', { timeout: 2000 }).catch(() => null);
  await page.keyboard.press(key);
  const tab = await opened;
  if (!tab) return null;
  await tab.waitForURL(/http/, { timeout: 2000 }).catch(() => {});
  return tab;
}

const pathOf = (page) => new URL(page.url()).pathname + new URL(page.url()).search;

// A keydown that Chrome marks as auto-repeat, as when the key is held down.
async function pressRepeat(page, key) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key, modifiers: 8, autoRepeat: true });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, modifiers: 8 });
}

describe('F-14 X reopens the last closed tab', { timeout: 60000 }, () => {
  test('X brings back the tab just closed with x, at the same address', async () => {
    const home = await browser.open('layout.html');
    const gone = await browser.open('target.html', 'gone=1');
    const goneUrl = pathOf(gone);
    await pressCloseKey(gone);
    assert.ok(await closedSoon(gone));
    const back = await reopenedBy(home, 'Shift+X');
    assert.ok(back, 'no tab was reopened');
    assert.equal(pathOf(back), goneUrl);
    await back.close();
    await home.close();
  });

  test('pressing X again reopens the one closed before it (most recent first)', async () => {
    const home = await browser.open('layout.html');
    const first = await browser.open('target.html', 'order=first');
    const second = await browser.open('target.html', 'order=second');
    await pressCloseKey(first);
    await closedSoon(first);
    await pressCloseKey(second);
    await closedSoon(second);
    const a = await reopenedBy(home, 'Shift+X');
    await home.bringToFront();
    const b = await reopenedBy(home, 'Shift+X');
    assert.match(a.url(), /order=second/);
    assert.match(b.url(), /order=first/);
    await a.close();
    await b.close();
    await home.close();
  });

  test('a tab closed some other way (not with x) is reopened too', async () => {
    const home = await browser.open('layout.html');
    const other = await browser.open('target.html', 'closed=by-chrome');
    await other.bringToFront();
    await browser.worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.remove(tab.id);
    });
    await closedSoon(other);
    await home.bringToFront();
    const back = await reopenedBy(home, 'Shift+X');
    assert.match(back.url(), /closed=by-chrome/);
    await back.close();
    await home.close();
  });

  test('holding X down (auto-repeat) reopens nothing extra', async () => {
    const home = await browser.open('layout.html');
    const gone = await browser.open('target.html', 'held=1');
    await pressCloseKey(gone);
    await closedSoon(gone);
    const opened = browser.context.waitForEvent('page', { timeout: 1000 }).catch(() => null);
    await pressRepeat(home, 'X');
    assert.equal(await opened, null, 'an auto-repeat X reopened a tab');
    await home.close();
  });

  test('X does not close the current tab', async () => {
    const home = await browser.open('layout.html');
    await home.keyboard.press('Shift+X');
    assert.equal(await closedSoon(home), false);
    await home.close();
  });

  test('if the last closed thing was a window, X reopens the window', async () => {
    const home = await browser.open('layout.html');
    const opened = browser.context.waitForEvent('page');
    await browser.worker.evaluate((url) => chrome.windows.create({ url }), `${browser.base}target.html?window=1`);
    const lone = await opened;
    await lone.waitForLoadState();
    await lone.waitForTimeout(150);
    const windowsBefore = await browser.worker.evaluate(async () => (await chrome.windows.getAll()).length);
    await pressCloseKey(lone); // last tab of its window: closes the window
    assert.ok(await closedSoon(lone));
    assert.equal(await browser.worker.evaluate(async () => (await chrome.windows.getAll()).length), windowsBefore - 1);
    await home.bringToFront();
    const back = await reopenedBy(home, 'Shift+X');
    assert.ok(back, 'nothing reopened');
    assert.match(back.url(), /window=1/);
    assert.equal(await browser.worker.evaluate(async () => (await chrome.windows.getAll()).length), windowsBefore, 'the window was not reopened');
    await back.close();
    await home.close();
  });
});
