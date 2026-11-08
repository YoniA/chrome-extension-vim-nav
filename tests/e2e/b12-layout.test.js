'use strict';

// B-12: showing or removing labels never moves page content, and the page's scroll size and
// position stay the same. Compares page-relative rects of every element that existed before
// link mode (labels and anything else VimNav adds are ignored), plus document scrollWidth,
// scrollHeight, scrollX and scrollY.
//
// "After removal": Escape is tested (today it hides labels, B-9 will remove them; either way
// the layout must match). After following a same-page link, labels currently stay (B-8), so
// that test checks layout and scroll size only; the scroll position changes by design (the jump).

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, enterLinkMode, followLabel, layoutSnapshot, layoutDiff, labelFor } = require('./helpers/browser');

let browser;
before(async () => {
  browser = await startBrowser();
});
after(async () => {
  await browser?.close();
});

// Number of links fully in view (on layout.html at scroll 0 that is every link).
async function linkCountInView(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    }).length,
  );
}

function assertSameLayout(before, after, when, { scrollPosition = true } = {}) {
  const diff = layoutDiff(before, after);
  assert.deepEqual(diff.slice(0, 10), [], `elements moved or resized ${when} (${diff.length} total)`);
  assert.equal(after.scrollWidth, before.scrollWidth, `scrollWidth ${when}`);
  assert.equal(after.scrollHeight, before.scrollHeight, `scrollHeight ${when}`);
  if (scrollPosition) {
    assert.equal(after.scrollX, before.scrollX, `scrollX ${when}`);
    assert.equal(after.scrollY, before.scrollY, `scrollY ${when}`);
  }
}

describe('B-12 labels do not shift layout', { timeout: 60000 }, () => {
  test('test page check: links are labeled, so layout comparisons are meaningful', async () => {
    const page = await browser.open('layout.html');
    try {
      const inView = await linkCountInView(page);
      const labels = await enterLinkMode(page);
      assert.equal(labels.length, inView);
    } finally {
      await page.close();
    }
  });

  test('while labels are shown, every element keeps its position and size, and scroll size/position are unchanged', async () => {
    const page = await browser.open('layout.html');
    try {
      const before = await layoutSnapshot(page, { init: true });
      const labels = await enterLinkMode(page);
      assert.ok(labels.length > 0, 'no labels appeared');
      assertSameLayout(before, await layoutSnapshot(page), 'while labels are shown');
    } finally {
      await page.close();
    }
  });

  test('on a scrolled page, the scroll position and layout are unchanged while labels are shown', async () => {
    const page = await browser.open('layout.html');
    try {
      await page.evaluate(() => window.scrollTo(0, 120));
      await page.waitForFunction(() => scrollY === 120);
      const before = await layoutSnapshot(page, { init: true });
      const labels = await enterLinkMode(page);
      assert.ok(labels.length > 0, 'no labels appeared');
      assertSameLayout(before, await layoutSnapshot(page), 'while labels are shown (scrolled)');
    } finally {
      await page.close();
    }
  });

  test('after Escape, every element keeps its position and size, and scroll size/position are unchanged', async () => {
    const page = await browser.open('layout.html');
    try {
      const before = await layoutSnapshot(page, { init: true });
      const labels = await enterLinkMode(page);
      assert.ok(labels.length > 0, 'no labels appeared');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
      assertSameLayout(before, await layoutSnapshot(page), 'after Escape');
    } finally {
      await page.close();
    }
  });

  test('after following a same-page link, layout and scroll size are unchanged', async () => {
    const page = await browser.open('layout.html');
    try {
      const jumpIndex = await page.evaluate(() => [...document.querySelectorAll('a[href]')].findIndex((a) => a.id === 'jump'));
      const before = await layoutSnapshot(page, { init: true });
      const labels = await enterLinkMode(page);
      assert.ok(labels.length > 0, 'no labels appeared');
      const url = await followLabel(page, labelFor(jumpIndex));
      assert.ok(url && url.endsWith('#section'), `expected to follow #section, got ${url}`);
      await page.waitForTimeout(100);
      assertSameLayout(before, await layoutSnapshot(page), 'after following #section', { scrollPosition: false });
    } finally {
      await page.close();
    }
  });
});
