'use strict';

// F-16 in real Chromium: f labels buttons and fields too. Typing a label clicks a button or
// checkbox, and puts the cursor in a field without typing the label letter into it.
// targets.html labels, in order: a link, b button, c text field, d checkbox, e textarea,
// f select, g role=button span. The disabled button gets none.

const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, enterLinkMode } = require('./helpers/browser');

let browser;
let page;
before(async () => {
  browser = await startBrowser();
});
beforeEach(async () => {
  page = await browser.open('targets.html');
});
afterEach(async () => {
  await page?.close();
});
after(async () => {
  await browser?.close();
});

const focusedId = () => page.evaluate(() => document.activeElement?.id || null);

describe('F-16 f labels buttons and fields', { timeout: 60000 }, () => {
  test('seven labels: the link, button, field, checkbox, textarea, select and role=button; not the disabled button', async () => {
    const labels = await enterLinkMode(page);
    assert.deepEqual(labels.map((l) => l.text), ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  test('every label sits next to its element, inside the viewport', async () => {
    const labels = await enterLinkMode(page);
    assert.equal(labels.length, 7);
    const boxes = await page.evaluate(() =>
      ['link', 'btn', 'name', 'check', 'notes', 'fruit', 'fake'].map((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }),
    );
    labels.forEach((l, i) => {
      const box = boxes[i];
      assert.ok(Math.abs(l.rect.left - box.right) <= 4, `label ${l.text} is not at the end of its element`);
      assert.ok(l.rect.bottom >= box.top && l.rect.top <= box.bottom, `label ${l.text} is not level with its element`);
    });
  });

  test('b clicks the button once and leaves link mode', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('b');
    await page.waitForTimeout(100);
    assert.equal(await page.getAttribute('#btn', 'data-clicks'), '1');
    assert.equal(await page.locator('.vimnav-label').count(), 0);
    assert.match(page.url(), /targets\.html/);
  });

  test('c puts the cursor in the text field, without typing "c" into it; then typing goes into the field', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('c');
    await page.waitForTimeout(100);
    assert.equal(await focusedId(), 'name');
    assert.equal(await page.inputValue('#name'), '');
    await page.keyboard.type('jk');
    assert.equal(await page.inputValue('#name'), 'jk');
    assert.equal(await page.evaluate(() => scrollY), 0, 'j scrolled instead of typing');
  });

  test('d ticks the checkbox', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('d');
    await page.waitForTimeout(100);
    assert.equal(await page.isChecked('#check'), true);
  });

  test('e focuses the textarea without typing "e"', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    assert.equal(await focusedId(), 'notes');
    assert.equal(await page.inputValue('#notes'), '');
  });

  test('f focuses the select', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('f');
    await page.waitForTimeout(100);
    assert.equal(await focusedId(), 'fruit');
  });

  test('g clicks the role=button element', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    assert.equal(await page.getAttribute('#fake', 'data-clicks'), '1');
  });

  test('a still follows the link', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('a');
    await page.waitForURL(/target\.html/, { timeout: 2500 });
  });

  test('after focusing a field with its label, Escape leaves it and j scrolls', async () => {
    await enterLinkMode(page);
    await page.keyboard.press('c');
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    assert.ok((await page.evaluate(() => scrollY)) > 0);
  });
});
