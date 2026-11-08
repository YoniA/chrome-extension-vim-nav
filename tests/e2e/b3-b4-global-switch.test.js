'use strict';

// B-3: VimNav works in every page without clicking the icon (loaded by the manifest).
// B-4: one global on/off switch; every open tab follows it at once, and one badge shows it.

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

// Presses j at the top of the page and reports whether it scrolled.
async function jScrolls(page) {
  await page.evaluate(() => scrollTo(0, 0));
  await page.keyboard.press('j');
  await page.waitForTimeout(150);
  return (await page.evaluate(() => scrollY)) > 0;
}

// A new tab, with no help from the harness: just the page as a user would open it.
async function plainTab(name) {
  const page = await browser.context.newPage();
  await page.goto(`${browser.base}${name}?plain=${Math.random()}`);
  await page.waitForTimeout(150);
  return page;
}

describe('B-3 works in every page without clicking the icon', { timeout: 60000 }, () => {
  test('fresh install: the badge says ON and a new tab responds to j', async () => {
    // The badge is set by the install event, a moment after the browser starts.
    let badge = '';
    for (let i = 0; i < 20 && badge !== 'ON'; i++) {
      badge = await browser.badge();
      if (badge !== 'ON') await new Promise((r) => setTimeout(r, 100));
    }
    assert.equal(badge, 'ON');
    const page = await plainTab('layout.html');
    try {
      assert.ok(await jScrolls(page));
    } finally {
      await page.close();
    }
  });

  test('after following a link to another page, and after a reload', async () => {
    const page = await plainTab('fields.html');
    try {
      await page.click('a[href="target.html"]');
      await page.waitForURL(/target\.html/);
      await page.goto(`${browser.base}layout.html`);
      await page.waitForTimeout(150);
      assert.ok(await jScrolls(page), 'not working after navigating');
      await page.reload();
      await page.waitForTimeout(150);
      assert.ok(await jScrolls(page), 'not working after reload');
    } finally {
      await page.close();
    }
  });
});

describe('B-4 one global switch', { timeout: 60000 }, () => {
  test('turning OFF stops every open tab at once, and ON brings them all back, without reloads', async () => {
    const a = await plainTab('layout.html');
    const b = await plainTab('layout.html');
    try {
      await browser.toggle();
      assert.equal(await browser.badge(), 'OFF');
      await a.bringToFront();
      assert.equal(await jScrolls(a), false, 'tab A still on');
      await b.bringToFront();
      assert.equal(await jScrolls(b), false, 'tab B still on');

      await browser.toggle();
      assert.equal(await browser.badge(), 'ON');
      await a.bringToFront();
      assert.ok(await jScrolls(a), 'tab A still off');
      await b.bringToFront();
      assert.ok(await jScrolls(b), 'tab B still off');
    } finally {
      await a.close();
      await b.close();
      await browser.setState('ON');
    }
  });

  test('a tab opened while OFF stays off', async () => {
    await browser.toggle();
    const page = await plainTab('layout.html');
    try {
      assert.equal(await browser.badge(), 'OFF');
      assert.equal(await jScrolls(page), false);
    } finally {
      await page.close();
      await browser.setState('ON');
    }
  });

  test('turning OFF while labels are shown removes them', async () => {
    const page = await plainTab('layout.html');
    try {
      await page.keyboard.press('f');
      await page.waitForTimeout(150);
      assert.ok((await page.locator('.vimnav-label').count()) > 0, 'no labels');
      await browser.toggle();
      assert.equal(await page.locator('.vimnav-label').count(), 0);
    } finally {
      await page.close();
      await browser.setState('ON');
    }
  });

  test('no errors from the extension or the page while switching', async () => {
    const errors = [];
    const page = await plainTab('layout.html');
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    browser.worker.on('console', (m) => m.type() === 'error' && errors.push(`worker: ${m.text()}`));
    try {
      await browser.toggle();
      await browser.toggle();
      await page.keyboard.press('j');
      await page.waitForTimeout(150);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
});
