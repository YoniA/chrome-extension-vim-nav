'use strict';

// B-1: keys typed in fields reach the field and run no VimNav command, in real Chromium.
// B-2: Ctrl/Cmd/Alt shortcuts run no VimNav command; Shift commands still work.

const { describe, test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startBrowser } = require('./helpers/browser');

const LABEL_SELECTOR = '.vimnav-label';

let browser;
let page;
before(async () => {
  browser = await startBrowser();
});
// A fresh page per test, so a key that slipped through (e.g. f entering link mode) can't hide later failures.
beforeEach(async () => {
  page = await browser.open('fields.html');
});
afterEach(async () => {
  await page?.close();
});
after(async () => {
  await browser?.close();
});

async function reset() {
  await page.evaluate(() => {
    document.activeElement?.blur();
    scrollTo(0, 0);
  });
}

function state() {
  return page.evaluate((sel) => ({ x: scrollX, y: scrollY, labels: document.querySelectorAll(sel).length, url: location.href }), LABEL_SELECTOR);
}

async function assertNothingRan(before, what) {
  await page.waitForTimeout(150);
  const now = await state();
  assert.deepEqual(now, before, `${what}: page scrolled, navigated or showed labels`);
}

describe('B-1 typing in fields', { timeout: 60000 }, () => {
  for (const [selector, valueOf] of [
    ['#text', (el) => el.value],
    ['#search', (el) => el.value],
    ['#area', (el) => el.value],
    ['#para', (el) => el.textContent],
  ]) {
    test(`typing "hjklfgg" in ${selector} reaches the field and runs no command`, async () => {
      await reset();
      const before = await state();
      await page.click(selector);
      await page.keyboard.type('hjklfgg');
      await assertNothingRan(before, selector);
      const text = await page.$eval(selector, valueOf);
      assert.ok(text.includes('hjklfgg'), `${selector} holds "${text}"`);
    });
  }

  test('typing G and H in a text field neither jumps nor goes back', async () => {
    await reset();
    const before = await state();
    await page.click('#text');
    await page.keyboard.type('GHL');
    await assertNothingRan(before, '#text');
  });

  test('keys in a <select> run no command', async () => {
    await reset();
    await page.focus('#choice');
    const before = await state();
    await page.keyboard.press('j');
    await page.keyboard.press('f');
    await assertNothingRan(before, '#choice');
  });

  test('typing in an input inside a shadow root runs no command', async () => {
    await reset();
    const before = await state();
    await page.click('#shadow-host');
    await page.locator('#shadow-host input').click();
    await page.keyboard.type('jjf');
    await assertNothingRan(before, 'shadow input');
    assert.equal(await page.locator('#shadow-host input').inputValue(), 'jjf');
  });

  test('a checkbox takes no text: j still scrolls', async () => {
    await reset();
    await page.focus('#check');
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    assert.ok((await state()).y > 0);
  });

  test('after leaving the field, j scrolls again', async () => {
    await reset();
    await page.click('#text');
    await page.keyboard.type('j');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    assert.ok((await state()).y > 0);
  });
});

describe('B-2 modifier shortcuts', { timeout: 60000 }, () => {
  for (const modifier of ['Control', 'Meta', 'Alt']) {
    // Each key checked on its own (j then k would cancel out). f last: on failure it enters link mode.
    test(`${modifier}+j/k/h/l/G/gg/f run no command`, async () => {
      for (const keys of [['j'], ['k'], ['h'], ['l'], ['Shift+G'], ['g', 'g'], ['f']]) {
        await reset();
        await page.evaluate(() => scrollTo(100, 100));
        const before = await state();
        for (const k of keys) await page.keyboard.press(`${modifier}+${k}`);
        await assertNothingRan(before, `${modifier}+${keys.join(' ')}`);
      }
    });
  }

  test('Shift+G still jumps to the bottom', async () => {
    await reset();
    await page.keyboard.press('Shift+G');
    await page.waitForTimeout(150);
    assert.ok((await state()).y > 1000);
  });

  test('in link mode, Ctrl+a is not label input; a then picks the first label', async () => {
    await reset();
    await page.keyboard.press('f');
    await page.waitForTimeout(150);
    const shown = (await state()).labels;
    assert.ok(shown > 0, 'no labels');
    await page.keyboard.press('Control+a');
    await page.waitForTimeout(1200);
    assert.equal((await state()).labels, shown, 'Ctrl+a left link mode');
    assert.match(page.url(), /fields\.html/);
    await page.keyboard.press('a'); // label a is the first text field (F-16)
    await page.waitForTimeout(100);
    assert.equal((await state()).labels, 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'text');
  });
});

describe('B-1 Escape leaves the field', { timeout: 60000 }, () => {
  for (const [name, focus, valueOf] of [
    ['text input', (p) => p.click('#text'), (p) => p.inputValue('#text')],
    ['textarea', (p) => p.click('#area'), (p) => p.inputValue('#area')],
    ['contenteditable editor', (p) => p.click('#para'), (p) => p.textContent('#para')],
    ['shadow-root input', (p) => p.locator('#shadow-host input').click(), (p) => p.locator('#shadow-host input').inputValue()],
  ]) {
    test(`Escape in a ${name} takes focus out; then j scrolls and the typed text is kept`, async () => {
      await focus(page);
      await page.keyboard.type('hi');
      await page.keyboard.press('Escape');
      const focused = await page.evaluate(() => document.activeElement === document.body || document.activeElement === null);
      assert.ok(focused, `${name} still has focus`);
      assert.ok((await valueOf(page)).includes('hi'), 'typed text lost');
      await page.keyboard.press('j');
      await page.waitForTimeout(150);
      assert.ok((await state()).y > 0, 'j did not scroll after Escape');
    });
  }

  test('Escape in a <select> takes focus out; then j scrolls', async () => {
    await page.focus('#choice');
    await page.keyboard.press('Escape');
    await page.keyboard.press('j');
    await page.waitForTimeout(150);
    assert.ok((await state()).y > 0);
  });

  test('a second Escape (now on the page) does nothing; f still enters link mode', async () => {
    await page.click('#text');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('f');
    await page.waitForTimeout(150);
    assert.ok((await state()).labels > 0, 'f did not enter link mode');
  });
});
