'use strict';

// F-15 search with / in real Chromium. search.html: visible "foo" in any case is in #p1 ("foo"),
// #p2 ("Foo"), #p3 ("FOO") and #far ("foo", far below). Hidden copies (display none, visibility
// hidden, closed <details>) must not match. #special tests plain-text matching, #split a match
// across elements. The page records the keys its own keydown listener receives in pageKeys.

const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser } = require('./helpers/browser');

let browser;
let page;
before(async () => {
  browser = await startBrowser();
});
beforeEach(async () => {
  page = await browser.open('search.html');
});
afterEach(async () => {
  await page?.close();
});
after(async () => {
  await browser?.close();
});

const bar = () => page.locator('vimnav-search');
const input = () => page.locator('vimnav-search input');
const counter = () => page.locator('vimnav-search .count').textContent();

// Number of highlighted matches, and the id of the element holding the current one.
function highlights() {
  return page.evaluate(() => {
    const all = CSS.highlights.get('vimnav-search');
    const current = CSS.highlights.get('vimnav-search-current');
    const [range] = current ? [...current] : [];
    return {
      total: all ? all.size : 0,
      current: range ? range.startContainer.parentElement.closest('[id]')?.id ?? null : null,
    };
  });
}

// Id of the element holding the page selection, and the selected text.
function selection() {
  return page.evaluate(() => {
    const s = getSelection();
    return { id: s.anchorNode?.parentElement?.closest('[id]')?.id ?? null, text: s.toString() };
  });
}

function inViewport(id) {
  return page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
  }, id);
}

const scrollY = () => page.evaluate(() => Math.round(window.scrollY));

async function search(query, { enter = true } = {}) {
  await page.keyboard.press('/');
  await page.keyboard.type(query);
  if (enter) await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
}

describe('F-15 the search bar', { timeout: 120000 }, () => {
  test('/ opens an empty search bar with the cursor in it; the / is not typed', async () => {
    await page.keyboard.press('/');
    await assert.doesNotReject(bar().waitFor({ timeout: 1000 }));
    assert.equal(await input().inputValue(), '');
    assert.equal(await input().evaluate((el) => el.matches(':focus')), true);
  });

  test('keys typed in the bar go into it: j does not scroll, and the page sees none of them', async () => {
    await page.keyboard.press('/');
    await page.evaluate(() => (pageKeys.length = 0));
    await page.keyboard.type('jjGf');
    assert.equal(await input().inputValue(), 'jjGf');
    assert.equal(await scrollY(), 0);
    assert.equal(await page.locator('.vimnav-label').count(), 0);
    assert.deepEqual(await page.evaluate(() => pageKeys), [], 'page shortcuts would fire while typing');
  });

  test('the bar sits at the bottom of the viewport', async () => {
    await page.keyboard.press('/');
    const box = await bar().boundingBox();
    const height = await page.evaluate(() => innerHeight);
    assert.ok(Math.abs(box.y + box.height - height) <= 1, `bar bottom ${box.y + box.height}, viewport ${height}`);
  });

  test('with VimNav OFF, / does nothing', async () => {
    await browser.setState('OFF');
    try {
      await page.waitForTimeout(100);
      await page.keyboard.press('/');
      await page.waitForTimeout(100);
      assert.equal(await bar().count(), 0);
    } finally {
      await browser.setState('ON');
    }
  });

  test('/ typed in a text field types / and opens no bar', async () => {
    await page.evaluate(() => {
      const i = document.createElement('input');
      i.id = 'field';
      document.body.prepend(i);
    });
    await page.click('#field');
    await page.keyboard.type('a/b');
    assert.equal(await page.inputValue('#field'), 'a/b');
    assert.equal(await bar().count(), 0);
  });
});

describe('F-15 matching as you type', { timeout: 120000 }, () => {
  test('all visible matches are highlighted and counted; hidden and collapsed text is not', async () => {
    await search('foo', { enter: false });
    assert.equal((await highlights()).total, 4);
    assert.equal(await counter(), '1 / 4');
  });

  test('smartcase: lowercase matches any case, a capital makes it case-sensitive', async () => {
    await search('Foo', { enter: false });
    assert.equal(await counter(), '1 / 1');
    assert.equal((await highlights()).current, 'p2');
    await input().fill('');
    await page.keyboard.type('FOO');
    assert.equal(await counter(), '1 / 1');
    assert.equal((await highlights()).current, 'p3');
  });

  test('the query is plain text: . and ( match themselves', async () => {
    await search('a.b', { enter: false });
    assert.equal(await counter(), '1 / 1');
    await input().fill('');
    await page.keyboard.type('a(b)');
    assert.equal(await counter(), '1 / 1');
  });

  test('a match can span elements ("hel<b>lo</b>")', async () => {
    await search('hello', { enter: false });
    assert.equal(await counter(), '1 / 1');
    assert.equal((await highlights()).current, 'split');
  });

  test('the first match after the scroll position becomes current, and is scrolled into view', async () => {
    await page.evaluate(() => scrollTo(0, 1500));
    await search('foo', { enter: false });
    assert.equal(await counter(), '4 / 4');
    assert.equal((await highlights()).current, 'far');
    assert.ok(await inViewport('far'), '#far not scrolled into view');
  });

  test('with no match the bar says "no match" and the page does not move', async () => {
    await page.evaluate(() => scrollTo(0, 200));
    await search('zzzq', { enter: false });
    assert.equal(await counter(), 'no match');
    assert.equal((await highlights()).total, 0);
    assert.equal(await scrollY(), 200);
  });
});

describe('F-15 Enter, n and N', { timeout: 120000 }, () => {
  test('Enter closes the bar and keeps the current match selected and highlighted', async () => {
    await search('foo');
    assert.equal(await bar().count(), 0);
    assert.deepEqual(await selection(), { id: 'p1', text: 'foo' });
    assert.equal((await highlights()).total, 4);
  });

  test('after Enter, keys are commands again: j scrolls', async () => {
    await search('foo');
    await page.keyboard.press('j');
    await page.waitForTimeout(100);
    assert.ok((await scrollY()) > 0);
  });

  test('n goes to the next match and wraps after the last; N goes back and wraps before the first', async () => {
    await search('foo');
    const order = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('n');
      order.push((await highlights()).current);
    }
    assert.deepEqual(order, ['p2', 'p3', 'far', 'p1']);
    assert.ok(await inViewport('p1'));
    await page.keyboard.press('Shift+N');
    assert.equal((await highlights()).current, 'far');
    assert.ok(await inViewport('far'), 'N did not scroll to #far');
    assert.equal((await selection()).id, 'far');
  });

  test('before any search, n and N do nothing', async () => {
    await page.keyboard.press('n');
    await page.keyboard.press('Shift+N');
    assert.equal(await scrollY(), 0);
    assert.equal((await highlights()).total, 0);
  });

  test('a search with no match: n does nothing', async () => {
    await search('zzzq');
    await page.keyboard.press('n');
    assert.equal(await scrollY(), 0);
  });
});

describe('F-15 Escape and history', { timeout: 120000 }, () => {
  test('Escape in the bar cancels: bar closed, no highlights, back to the scroll position at /', async () => {
    await page.evaluate(() => scrollTo(0, 1500));
    await search('foo', { enter: false }); // scrolls to #far
    assert.notEqual(await scrollY(), 1500);
    await page.keyboard.press('Escape');
    assert.equal(await bar().count(), 0);
    assert.equal((await highlights()).total, 0);
    assert.equal(await scrollY(), 1500);
  });

  test('Escape after a search clears the highlights; n brings them back and goes to the next match', async () => {
    await search('foo');
    await page.keyboard.press('Escape');
    assert.equal((await highlights()).total, 0);
    await page.keyboard.press('n');
    const h = await highlights();
    assert.equal(h.total, 4);
    assert.equal(h.current, 'p2');
  });

  test('each / opens empty; Up recalls the previous query', async () => {
    await search('hello');
    await page.keyboard.press('/');
    assert.equal(await input().inputValue(), '');
    await page.keyboard.press('ArrowUp');
    assert.equal(await input().inputValue(), 'hello');
    assert.equal(await counter(), '1 / 1');
  });

  test('a cancelled search does not replace the last one: n still uses the earlier query', async () => {
    await search('hello');
    await page.keyboard.press('/');
    await page.keyboard.type('foo');
    await page.keyboard.press('Escape');
    await page.keyboard.press('n');
    assert.equal((await highlights()).current, 'split');
    assert.equal((await highlights()).total, 1);
  });

  test('turning VimNav OFF closes an open bar and clears highlights', async () => {
    await search('foo', { enter: false });
    await browser.setState('OFF');
    try {
      await page.waitForTimeout(100);
      assert.equal(await bar().count(), 0);
      assert.equal((await highlights()).total, 0);
    } finally {
      await browser.setState('ON');
    }
  });

  test('Cmd/Ctrl+F still opens nothing of VimNav (the browser handles it)', async () => {
    await page.keyboard.press('Control+f');
    await page.keyboard.press('Meta+f');
    assert.equal(await bar().count(), 0);
    assert.equal(await page.locator('.vimnav-label').count(), 0);
  });
});
