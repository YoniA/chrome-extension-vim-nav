'use strict';

// F-15, key routing only (the fake DOM can't lay out or highlight text; searching itself is
// tested in real Chromium in tests/e2e/f15-search.test.js). Here: when / opens no search bar,
// and that n, N and Escape are harmless before any search.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv, flush } = require('./helpers/load');

function setup(options = {}) {
  const env = createContentEnv({ hrefs: ['https://example.test/1', 'https://example.test/2'], ...options });
  env.inject();
  return env;
}

const searchBars = (env) => env.document.getElementsByTagName('vimnav-search').length;

describe('F-15 / opens no search bar when it should not', () => {
  test('while OFF', async () => {
    const env = setup({ storedState: 'OFF' });
    await flush();
    env.keydown('/');
    assert.equal(searchBars(env), 0);
  });

  test('typed in a text field (the / is typed, not prevented)', () => {
    const env = setup();
    const input = env.document.body.appendChild(env.document.createElement('input'));
    const e = env.keydown('/', { target: input });
    assert.equal(searchBars(env), 0);
    assert.equal(e.defaultPrevented, false);
  });

  test('with Ctrl, Cmd or Alt held', () => {
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      const env = setup();
      env.keydown('/', { [modifier]: true });
      assert.equal(searchBars(env), 0, modifier);
    }
  });

  test('in link mode (/ is not label input either)', () => {
    const env = setup();
    env.keydown('f');
    env.keydown('/');
    assert.equal(searchBars(env), 0);
    assert.equal(env.labels().length, 2, 'link mode was left');
  });
});

describe('F-15 n, N and Escape before any search', () => {
  test('n and N do nothing: no scroll, no navigation, no error', () => {
    const env = setup();
    assert.doesNotThrow(() => {
      env.keydown('n');
      env.keydown('N', { shiftKey: true });
    });
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, []);
    assert.deepEqual(env.navigations(), []);
  });

  test('Escape in normal mode does nothing and throws nothing', () => {
    const env = setup();
    assert.doesNotThrow(() => env.keydown('Escape'));
    assert.deepEqual(env.scrollCalls, []);
  });

  test('n in link mode is label input', () => {
    const hrefs = Array.from({ length: 14 }, (_, i) => `https://example.test/${i}`);
    const env = createContentEnv({ hrefs });
    env.inject();
    env.keydown('f');
    env.keydown('n');
    assert.deepEqual(env.navigations(), ['https://example.test/13']);
  });
});
