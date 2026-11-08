'use strict';

// B-12 (which links get labels) and F-1 order on real pages, in headless Chromium.
// Labels are found by the test contract: elements with class `vimnav-label` (page DOM, no shadow
// DOM) whose text content is exactly the label. Which link a label belongs to is checked by
// typing the label and seeing where the page navigates.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser, enterLinkMode, followLabel, labelFor } = require('./helpers/browser');

let browser;
before(async () => {
  browser = await startBrowser();
});
after(async () => {
  await browser?.close();
});

const texts = (labels) => labels.map((l) => l.text).sort();
const idOf = (u) => (u ? new URL(u).searchParams.get('id') : null);

async function withPage(name, query, fn) {
  const page = await browser.open(name, query);
  try {
    await fn(page);
  } finally {
    await page.close();
  }
}

describe('B-12 visible links are labeled', { timeout: 60000 }, () => {
  test('every visible link with an href gets exactly one label: a, b, c ... (inline, flex, grid, table, image, fixed, absolute)', async () => {
    await withPage('visible.html', '', async (page) => {
      const count = await page.evaluate(() => document.querySelectorAll('a[href]:not([style*="display:none"])').length);
      const labels = await enterLinkMode(page);
      assert.deepEqual(texts(labels), Array.from({ length: count }, (_, i) => labelFor(i)).sort());
    });
  });

  test('the first visible link is "a", even after hidden and href-less links', async () => {
    await withPage('visible.html', '', async (page) => {
      await enterLinkMode(page);
      assert.equal(idOf(await followLabel(page, 'a')), 'first');
    });
  });

  test('the last visible link gets the last label (hidden and href-less links use up none)', async () => {
    await withPage('visible.html', '', async (page) => {
      const count = await page.evaluate(() => document.querySelectorAll('a[href]:not([style*="display:none"])').length);
      await enterLinkMode(page);
      assert.equal(idOf(await followLabel(page, labelFor(count - 1))), 'last');
    });
  });
});

describe('B-12 hidden and href-less links get no label and use up no label', { timeout: 60000 }, () => {
  // Each page: visible link v1, the case's link(s), visible link v2.
  const cases = [
    ['display-none', 'display: none on the link'],
    ['display-none-ancestor', 'display: none on an ancestor'],
    ['visibility-hidden', 'visibility: hidden on the link'],
    ['visibility-hidden-ancestor', 'visibility: hidden on an ancestor'],
    ['zero-width', 'zero width (the link)'],
    ['zero-height', 'zero height (the link)'],
    ['empty-link', 'zero size (empty link)'],
    ['zero-width-ancestor', 'zero width ancestor with overflow: hidden'],
    ['zero-height-ancestor', 'zero height ancestor with overflow: hidden'],
    ['no-href', '<a> without an href attribute'],
  ];
  for (const [name, what] of cases) {
    test(`${what}: only the two visible links are labeled, and "b" is the second visible link`, async () => {
      await withPage('visibility.html', `case=${name}`, async (page) => {
        const labels = await enterLinkMode(page);
        assert.deepEqual(texts(labels), ['a', 'b']);
        assert.equal(idOf(await followLabel(page, 'b')), 'v2');
      });
    });
  }
});

describe('B-12 links outside the viewport get no label', { timeout: 60000 }, () => {
  async function openScrolled() {
    const page = await browser.open('offscreen.html');
    await page.evaluate(() => window.scrollTo(1500, 1500));
    await page.waitForFunction(() => scrollX === 1500 && scrollY === 1500);
    return page;
  }

  test('links above, below, left and right of the viewport get no label', async () => {
    const page = await openScrolled();
    try {
      const labels = await enterLinkMode(page);
      assert.deepEqual(texts(labels), ['a', 'b']);
    } finally {
      await page.close();
    }
  });

  test('labels go to the in-view links in document order: a is the first in view, b the second', async () => {
    const page = await openScrolled();
    try {
      await enterLinkMode(page);
      assert.equal(idOf(await followLabel(page, 'a')), 'in1');
    } finally {
      await page.close();
    }
    const page2 = await openScrolled();
    try {
      await enterLinkMode(page2);
      assert.equal(idOf(await followLabel(page2, 'b')), 'in2');
    } finally {
      await page2.close();
    }
  });

  test('scrolling during link mode does not add labels', async () => {
    const page = await openScrolled();
    try {
      const first = await enterLinkMode(page);
      assert.deepEqual(texts(first), ['a', 'b']);
      // Bring the "below" link fully into view while link mode is on (viewport y 1950..2750).
      await page.evaluate(() => window.scrollTo(1500, 1950));
      assert.equal(await page.evaluate(() => {
        const r = document.getElementById('below').getBoundingClientRect();
        return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      }), true, 'test setup: the below link should now be in view');
      await page.waitForTimeout(400);
      const count = await page.evaluate(() => document.querySelectorAll('.vimnav-label').length);
      assert.equal(count, 2);
    } finally {
      await page.close();
    }
  });
});
