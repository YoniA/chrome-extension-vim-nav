'use strict';

// B-15: a page restored by Back or Forward is in normal mode: no labels, and keys run normal
// commands. Following a label leaves the page in Chrome's back/forward cache, which used to
// restore it with link mode still on and its labels still drawn.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, enterLinkMode, followLabel } = require('./helpers/browser');

const LABEL_SELECTOR = '.vimnav-label';

let browser;
before(async () => {
  browser = await startBrowser();
});
after(async () => {
  await browser?.close();
});

// layout.html is tall, so j can scroll; its first label ("a") goes to target.html.
async function followFirstLabel() {
  const page = await browser.open('layout.html');
  const labels = await enterLinkMode(page);
  assert.ok(labels.length > 0, 'no labels appeared');
  const to = await followLabel(page, 'a');
  assert.ok(to && to.includes('target.html'), `label "a" did not navigate (url: ${to})`);
  return page;
}

// Restored pages don't fire "load", so navigation steps wait only for the commit.
const COMMIT = { waitUntil: 'commit' };

async function assertNormalMode(page, how) {
  await page.waitForTimeout(300);
  assert.match(page.url(), /layout\.html/, `${how} did not return to layout.html`);
  assert.equal(await page.locator(LABEL_SELECTOR).count(), 0, `labels are still shown after ${how}`);
  const y = await page.evaluate(() => scrollY);
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  assert.ok((await page.evaluate(() => scrollY)) > y, `j did not scroll after ${how} (still in link mode)`);
}

describe('B-15 back/forward always shows a page in normal mode', { timeout: 60000 }, () => {
  test("the browser's Back button returns to a page without labels, in normal mode", async () => {
    const page = await followFirstLabel();
    try {
      await page.goBack(COMMIT);
      await assertNormalMode(page, 'Back');
    } finally {
      await page.close();
    }
  });

  test('H returns to a page without labels, in normal mode', async () => {
    const page = await followFirstLabel();
    try {
      await browser.enable(page); // VimNav on the target page, so H works there
      await page.keyboard.press('H');
      await page.waitForURL(/layout\.html/, { timeout: 2500, ...COMMIT });
      await assertNormalMode(page, 'H');
    } finally {
      await page.close();
    }
  });

  test('Back then Forward then Back again still shows no labels', async () => {
    const page = await followFirstLabel();
    try {
      await page.goBack(COMMIT);
      await page.goForward(COMMIT);
      await page.goBack(COMMIT);
      await assertNormalMode(page, 'Back, Forward, Back');
    } finally {
      await page.close();
    }
  });
});
