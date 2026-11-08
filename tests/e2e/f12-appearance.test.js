'use strict';

// F-12 label appearance, in headless Chromium: raised above its link like a superscript, smaller
// text, yellow background, rounded corners, and readable on dark, yellow and hostile-CSS pages.
//
// Pairing: on these pages every <a href> is visible, so the i-th link in document order has the
// i-th F-1 label (a, b, c ...; checked by b12-visibility.test.js). Positions are compared with the
// link's first line box, with tolerances rather than exact pixels. Readability is checked twice:
// computed styles (colors, contrast) and the rendered pixels of the label's area in a screenshot.

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  startBrowser,
  enterLinkMode,
  linkInfo,
  labelPixels,
  isYellow,
  contrast,
  labelFor,
} = require('./helpers/browser');

let browser;
before(async () => {
  browser = await startBrowser();
});
after(async () => {
  await browser?.close();
});

// Opens a page, enters link mode, and returns [{ label, link }] pairs plus the page.
async function openPairs(name) {
  const page = await browser.open(name);
  const links = await linkInfo(page);
  const labels = await enterLinkMode(page);
  assert.equal(labels.length, links.length, `expected one label per link on ${name}`);
  const pairs = links.map((link, i) => {
    const label = labels.find((l) => l.text === labelFor(i));
    assert.ok(label, `no label "${labelFor(i)}" for link ${link.href}`);
    return { label, link };
  });
  return { page, pairs };
}

async function withPairs(name, fn) {
  const { page, pairs } = await openPairs(name);
  try {
    await fn(pairs, page);
  } finally {
    await page.close();
  }
}

describe('F-12 label appearance', { timeout: 60000 }, () => {
  test('each label is raised above the end of its link: its bottom overlaps at most 25% of it with the link text', async () => {
    await withPairs('appearance.html', (pairs) => {
      for (const { label, link } of pairs) {
        const limit = link.last.top + label.rect.height * 0.25;
        assert.ok(
          label.rect.bottom <= limit + 1,
          `label ${label.text}: bottom ${label.rect.bottom.toFixed(1)} should be <= ${limit.toFixed(1)} (link's last line top + 25% of label)`,
        );
        assert.ok(
          label.rect.top < link.last.top,
          `label ${label.text}: top ${label.rect.top.toFixed(1)} should be above link top ${link.last.top.toFixed(1)}`,
        );
      }
    });
  });

  test("each label comes after its link: its left edge is at the right end of the link's last line", async () => {
    await withPairs('appearance.html', (pairs) => {
      for (const { label, link } of pairs) {
        const dx = label.rect.left - link.last.right;
        assert.ok(dx >= -1 && dx <= 4, `label ${label.text}: left is ${dx.toFixed(1)} px from the link's end`);
      }
    });
  });

  test('labels stay inside the viewport for links at its top-left corner and right edge', async () => {
    const page = await browser.open('layout.html');
    try {
      const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
      const labels = await enterLinkMode(page);
      assert.ok(labels.length > 0, 'no labels appeared');
      for (const label of labels) {
        assert.ok(label.rect.top >= 0, `label ${label.text}: top ${label.rect.top.toFixed(1)} is above the viewport`);
        assert.ok(label.rect.left >= 0, `label ${label.text}: left ${label.rect.left.toFixed(1)} is left of the viewport`);
        assert.ok(
          label.rect.right <= viewportWidth + 0.5,
          `label ${label.text}: right ${label.rect.right.toFixed(1)} is past the viewport width ${viewportWidth}`,
        );
      }
    } finally {
      await page.close();
    }
  });

  test('label text is smaller than the text of its link (16 px, 32 px heading and 12 px links)', async () => {
    await withPairs('appearance.html', (pairs) => {
      for (const { label, link } of pairs) {
        assert.ok(label.fontSize < link.fontSize, `label ${label.text}: ${label.fontSize}px is not smaller than ${link.fontSize}px`);
      }
    });
  });

  test('each label has a yellow background', async () => {
    await withPairs('appearance.html', (pairs) => {
      for (const { label } of pairs) {
        assert.ok(isYellow(label.background), `label ${label.text}: background rgba(${label.background}) is not yellow`);
      }
    });
  });

  test('each label has rounded corners (all four)', async () => {
    await withPairs('appearance.html', (pairs) => {
      for (const { label } of pairs) {
        assert.ok(label.corners.every((r) => r > 0), `label ${label.text}: corner radii ${label.corners.join(', ')}`);
      }
    });
  });
});

describe('F-12 labels are readable on any page', { timeout: 90000 }, () => {
  const pages = [
    ['dark.html', 'a dark page'],
    ['yellow.html', 'a yellow page'],
    ['hostile.html', 'a page whose CSS restyles span, div and all elements'],
    ['hostile-important.html', 'a page whose generic CSS rules are !important'],
  ];

  for (const [name, what] of pages) {
    test(`on ${what}: labels are displayed, on top, yellow, rounded, with legible text`, async () => {
      await withPairs(name, (pairs) => {
        for (const { label, link } of pairs) {
          const id = `label ${label.text} (${link.href})`;
          assert.equal(label.visible, true, `${id}: not visible (display/visibility/opacity)`);
          assert.ok(label.rect.width >= 4 && label.rect.height >= 6, `${id}: too small (${label.rect.width}x${label.rect.height})`);
          assert.equal(label.onTop, true, `${id}: covered by another element`);
          assert.ok(isYellow(label.background), `${id}: background rgba(${label.background}) is not yellow`);
          assert.ok(label.corners.every((r) => r > 0), `${id}: corner radii ${label.corners.join(', ')}`);
          assert.ok(label.color[3] >= 0.9, `${id}: text color is transparent`);
          const ratio = contrast(label.color, label.background);
          assert.ok(ratio >= 4.5, `${id}: text/background contrast ${ratio.toFixed(2)} < 4.5`);
          assert.ok(label.fontSize >= 8, `${id}: font size ${label.fontSize}px is too small to read`);
          assert.ok(label.fontSize < link.fontSize, `${id}: ${label.fontSize}px is not smaller than the link's ${link.fontSize}px`);
        }
      });
    });

    test(`on ${what}: the rendered label area is mostly yellow with dark text pixels`, async () => {
      await withPairs(name, async (pairs, page) => {
        for (const { label } of pairs) {
          const px = await labelPixels(page, label.rect);
          assert.ok(px.yellowShare >= 0.35, `label ${label.text}: only ${(px.yellowShare * 100).toFixed(0)}% yellow pixels (${px.size})`);
          assert.ok(px.darkPixels >= 3, `label ${label.text}: no visible text pixels (${px.size})`);
        }
      });
    });
  }
});
