'use strict';

// B-1: keys typed in an editable element run no VimNav command.
// B-2: keys with Ctrl, Meta (Cmd) or Alt held run no VimNav command; Shift commands still work.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv } = require('./helpers/load');

const url = (i) => `https://example.test/page-${i}`;

function setup(linkCount = 3) {
  const env = createContentEnv({ hrefs: Array.from({ length: linkCount }, (_, i) => url(i)) });
  env.inject();
  return env;
}

function element(env, tag, attrs = {}) {
  const el = env.document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  return env.document.body.appendChild(el);
}

// Every normal-mode command key, plus f (link mode).
const COMMAND_KEYS = ['j', 'k', 'h', 'l', 'G', 'g', 'g', 'H', 'L', 'f'];

function pressAll(env, keys, options) {
  keys.forEach((k, i) => {
    if (i > 0) env.clock.advance(50);
    env.keydown(k, options);
  });
}

function assertNothingRan(env, what) {
  assert.deepEqual(env.scrollCalls, [], `${what}: scrolled`);
  assert.deepEqual(env.historyCalls, [], `${what}: navigated history`);
  assert.equal(env.labels().length, 0, `${what}: entered link mode`);
  assert.deepEqual(env.navigations(), [], `${what}: followed a link`);
}

describe('B-1 keys typed in editable elements run no command', () => {
  const editable = [
    ['input with no type', 'input', {}],
    ['input type=text', 'input', { type: 'text' }],
    ['input type=search', 'input', { type: 'search' }],
    ['input type=email', 'input', { type: 'email' }],
    ['input type=url', 'input', { type: 'url' }],
    ['input type=password', 'input', { type: 'password' }],
    ['input type=number', 'input', { type: 'number' }],
    ['input type=tel', 'input', { type: 'tel' }],
    ['input type=date', 'input', { type: 'date' }],
    ['input type=TEXT (uppercase)', 'input', { type: 'TEXT' }],
    ['textarea', 'textarea', {}],
    ['select', 'select', {}],
    ['contenteditable element', 'div', { contenteditable: 'true' }],
    ['contenteditable="" element', 'div', { contenteditable: '' }],
    ['contenteditable=plaintext-only element', 'div', { contenteditable: 'plaintext-only' }],
  ];
  for (const [name, tag, attrs] of editable) {
    test(`${name}: no command runs`, () => {
      const env = setup();
      const target = element(env, tag, attrs);
      pressAll(env, COMMAND_KEYS, { target });
      assertNothingRan(env, name);
    });
  }

  test('a child of a contenteditable element (e.g. a <p> in a rich editor): no command runs', () => {
    const env = setup();
    const editor = element(env, 'div', { contenteditable: 'true' });
    const paragraph = editor.appendChild(env.document.createElement('p'));
    pressAll(env, COMMAND_KEYS, { target: paragraph });
    assertNothingRan(env, 'child of contenteditable');
  });

  test('typing "hello" in a search box neither scrolls nor goes back', () => {
    const env = setup();
    const target = element(env, 'input', { type: 'search' });
    pressAll(env, ['h', 'e', 'l', 'l', 'o', 'H'], { target });
    assertNothingRan(env, 'search box');
  });

  test('VimNav does not prevent or stop keys typed in a field (the characters reach it)', () => {
    const env = setup();
    const target = element(env, 'textarea');
    for (const k of COMMAND_KEYS) {
      const e = env.keydown(k, { target });
      assert.equal(e.defaultPrevented, false, `${k} prevented`);
      assert.equal(e.propagationStopped, false, `${k} stopped`);
    }
  });

  test('after focus leaves the field, commands work again', () => {
    const env = setup();
    const target = element(env, 'input');
    env.keydown('j', { target });
    env.keydown('j'); // typed on the page body
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('a g in a field followed by a g on the page is not gg', () => {
    const env = setup();
    const target = element(env, 'input');
    env.keydown('g', { target });
    env.clock.advance(100);
    env.keydown('g');
    assert.deepEqual(env.scrollCalls, []);
  });

  test('g on the page, g in a field, g on the page: not gg', () => {
    const env = setup();
    const target = element(env, 'input');
    env.keydown('g');
    env.clock.advance(100);
    env.keydown('g', { target });
    env.clock.advance(100);
    env.keydown('g');
    assert.deepEqual(env.scrollCalls, []);
  });

  const notEditable = [
    ['checkbox', { type: 'checkbox' }],
    ['radio', { type: 'radio' }],
    ['button', { type: 'button' }],
    ['submit', { type: 'submit' }],
    ['reset', { type: 'reset' }],
    ['range', { type: 'range' }],
    ['color', { type: 'color' }],
    ['file', { type: 'file' }],
    ['image', { type: 'image' }],
  ];
  for (const [name, attrs] of notEditable) {
    test(`input type=${name} takes no text: commands still run`, () => {
      const env = setup();
      const target = element(env, 'input', attrs);
      env.keydown('j', { target });
      assert.deepEqual(env.scrollCalls, [[0, 50]]);
    });
  }

  test('contenteditable="false" is not editable: commands still run', () => {
    const env = setup();
    const target = element(env, 'div', { contenteditable: 'false' });
    env.keydown('j', { target });
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('keys on a link, button or plain element still run commands', () => {
    for (const tag of ['a', 'button', 'div']) {
      const env = setup();
      const target = element(env, tag);
      env.keydown('j', { target });
      assert.deepEqual(env.scrollCalls, [[0, 50]], tag);
    }
  });

  test('an input inside a shadow root (seen from the document as its host) is still a field', () => {
    const env = setup();
    const host = element(env, 'my-search');
    const input = env.document.createElement('input');
    // Retargeted: e.target is the host, composedPath()[0] is the real input.
    env.keydown('j', { target: host, path: [input, host, env.document.body] });
    assert.deepEqual(env.scrollCalls, []);
  });
});

describe('B-2 keys with Ctrl, Meta or Alt run no command', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    test(`${modifier}: no normal-mode command runs`, () => {
      const env = setup();
      pressAll(env, COMMAND_KEYS, { [modifier]: true });
      assertNothingRan(env, modifier);
    });

    test(`${modifier}: in link mode, a letter is not label input`, () => {
      const env = setup(3);
      env.keydown('f');
      env.keydown('a', { [modifier]: true });
      env.clock.advance(5000);
      assert.deepEqual(env.navigations(), []);
      assert.equal(env.labels().length, 3, 'still in link mode');
      env.keydown('a');
      assert.deepEqual(env.navigations(), [url(0)]);
    });

    test(`${modifier}: keys are not prevented or stopped`, () => {
      const env = setup();
      const e = env.keydown('f', { [modifier]: true });
      assert.equal(e.defaultPrevented, false);
      assert.equal(e.propagationStopped, false);
    });
  }

  test('Cmd/Ctrl+F (find) does not enter link mode; Cmd/Ctrl+L does not scroll', () => {
    for (const modifier of ['ctrlKey', 'metaKey']) {
      const env = setup();
      env.keydown('f', { [modifier]: true });
      env.keydown('l', { [modifier]: true });
      assertNothingRan(env, modifier);
    }
  });

  test('Shift commands still work: G, H and L', () => {
    const env = setup();
    env.keydown('G', { shiftKey: true });
    env.keydown('H', { shiftKey: true });
    env.keydown('L', { shiftKey: true });
    assert.equal(env.scrollCalls.length, 1);
    assert.deepEqual(env.historyCalls, ['back', 'forward']);
  });

  test('a Ctrl+g followed by g is not gg', () => {
    const env = setup();
    env.keydown('g', { ctrlKey: true });
    env.clock.advance(100);
    env.keydown('g');
    assert.deepEqual(env.scrollCalls, []);
  });

  test('pressing the modifier key itself (Control, Meta, Alt) runs nothing and keeps link mode', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Control', { ctrlKey: true });
    env.keydown('Meta', { metaKey: true });
    env.keydown('Alt', { altKey: true });
    assert.equal(env.labels().length, 3);
    env.keydown('b');
    assert.deepEqual(env.navigations(), [url(1)]);
  });
});
