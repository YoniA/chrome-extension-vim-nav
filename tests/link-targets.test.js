'use strict';

// F-16: f labels buttons and form fields as well as links. Typing a label:
//   link -> follows it (as before); text field, textarea, select, contenteditable -> focuses it;
//   anything else (button, checkbox, radio, submit, role=button) -> clicks it.
// Disabled controls, hidden inputs and non-editable / nested editable elements get no label.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv } = require('./helpers/load');

// Builds a page from [tag, attrs] pairs (attrs.href makes a link), in document order.
function page(spec) {
  const env = createContentEnv();
  env.inject();
  const els = spec.map(([tag, attrs = {}]) => {
    const el = env.document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return env.document.body.appendChild(el);
  });
  return { env, els };
}

describe('F-16 which elements get labels', () => {
  test('links, buttons and fields are labeled together, in document order', () => {
    const { env } = page([
      ['a', { href: 'https://example.test/1' }],
      ['button'],
      ['input', { type: 'text' }],
      ['textarea'],
      ['select'],
      ['div', { contenteditable: 'true' }],
      ['div', { role: 'button' }],
      ['input', { type: 'checkbox' }],
      ['a', { href: 'https://example.test/2' }],
    ]);
    env.keydown('f');
    assert.deepEqual(env.labelTexts(), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  });

  for (const [name, tag, attrs] of [
    ['disabled button', 'button', { disabled: '' }],
    ['disabled input', 'input', { disabled: '' }],
    ['disabled select', 'select', { disabled: '' }],
    ['disabled textarea', 'textarea', { disabled: '' }],
    ['hidden input', 'input', { type: 'hidden' }],
    ['contenteditable="false" element', 'div', { contenteditable: 'false' }],
    ['link without href', 'a', {}],
    ['plain div', 'div', {}],
  ]) {
    test(`a ${name} gets no label`, () => {
      const { env } = page([[tag, attrs], ['button']]);
      env.keydown('f');
      assert.deepEqual(env.labelTexts(), ['a'], 'only the button after it is labeled');
    });
  }

  test('inside a rich-text editor only the editor itself is labeled, not its paragraphs', () => {
    const { env, els } = page([['div', { contenteditable: 'true' }]]);
    const p = els[0].appendChild(env.document.createElement('p'));
    p.setAttribute('contenteditable', 'true');
    env.keydown('f');
    assert.equal(env.labelTexts().length, 1);
  });

  test('a button that is not visible gets no label', () => {
    const { env, els } = page([['button'], ['button']]);
    els[0].rect = { x: 0, y: 0, width: 0, height: 0 };
    env.keydown('f');
    assert.deepEqual(env.labelTexts(), ['a']);
    env.keydown('a');
    assert.equal(els[1].clickCalls, 1);
  });
});

describe('F-16 typing a label', () => {
  for (const [name, tag, attrs] of [
    ['button', 'button', {}],
    ['submit input', 'input', { type: 'submit' }],
    ['button input', 'input', { type: 'button' }],
    ['checkbox', 'input', { type: 'checkbox' }],
    ['radio button', 'input', { type: 'radio' }],
    ['role=button element', 'div', { role: 'button' }],
  ]) {
    test(`on a ${name} clicks it, does not focus or navigate, and leaves link mode`, () => {
      const { env, els } = page([[tag, attrs]]);
      env.keydown('f');
      env.keydown('a');
      assert.equal(els[0].clickCalls, 1);
      assert.equal(els[0].focusCalls, undefined);
      assert.deepEqual(env.navigations(), []);
      assert.equal(env.labels().length, 0);
    });
  }

  for (const [name, tag, attrs] of [
    ['text input', 'input', { type: 'text' }],
    ['search input', 'input', { type: 'search' }],
    ['input with no type', 'input', {}],
    ['textarea', 'textarea', {}],
    ['select', 'select', {}],
    ['contenteditable element', 'div', { contenteditable: 'true' }],
  ]) {
    test(`on a ${name} focuses it, does not click it, and leaves link mode`, () => {
      const { env, els } = page([[tag, attrs]]);
      env.keydown('f');
      env.keydown('a');
      assert.equal(els[0].focusCalls, 1);
      assert.equal(els[0].clickCalls, undefined);
      assert.deepEqual(env.navigations(), []);
      assert.equal(env.labels().length, 0);
    });
  }

  test('the label letter that focuses a field is prevented, so it is not typed into the field', () => {
    const { env } = page([['input']]);
    env.keydown('f');
    const e = env.keydown('a');
    assert.equal(e.defaultPrevented, true);
  });

  test('a label letter that clicks a button is not prevented', () => {
    const { env } = page([['button']]);
    env.keydown('f');
    assert.equal(env.keydown('a').defaultPrevented, false);
  });

  test('a field whose label waits for a longer one is focused 1000 ms later', () => {
    const spec = Array.from({ length: 26 }, () => ['button']);
    const { env, els } = page([['input'], ...spec]); // labels a..z, aa: "a" waits
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(999);
    assert.equal(els[0].focusCalls, undefined);
    env.clock.advance(1);
    assert.equal(els[0].focusCalls, 1);
  });

  test('after a label focuses a field, keys type into it: j does not scroll', () => {
    const { env, els } = page([['input']]);
    env.keydown('f');
    env.keydown('a');
    env.keydown('j', { target: els[0] });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('a link label still navigates and does not click the link', () => {
    const { env, els } = page([['a', { href: 'https://example.test/1' }], ['button']]);
    env.keydown('f');
    env.keydown('a');
    assert.deepEqual(env.navigations(), ['https://example.test/1']);
    assert.equal(els[0].clickCalls, undefined);
    assert.equal(els[1].clickCalls, undefined);
  });
});
