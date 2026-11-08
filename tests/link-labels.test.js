'use strict';

// F-1 letter link labels: sequence (bijective base-26), uniqueness, the 1000 ms follow,
// lowercase-only input, and label letters not running normal commands in link mode.
// Labels are found by the test contract: elements with class `vimnav-label` whose text is the label.
// Which link has which label is checked by behavior: typing the label follows that link.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv } = require('./helpers/load');

const url = (i) => `https://example.test/page-${i}`;

function setup(count) {
  const env = createContentEnv({
    hrefs: Array.from({ length: count }, (_, i) => url(i)),
    groupSize: count > 200 ? 100 : undefined,
  });
  env.inject();
  return env;
}

// Independent reference for the expected sequence: n is 1-based (1 -> a, 27 -> aa).
function expectedLabel(n) {
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function typeLabel(env, label) {
  env.type(label.split(''));
  env.clock.advance(1000);
  return env.navigations();
}

describe('F-1 label sequence', () => {
  test('reference sequence used by these tests matches the backlog examples', () => {
    const examples = { 1: 'a', 26: 'z', 27: 'aa', 52: 'az', 53: 'ba', 702: 'zz', 703: 'aaa', 18278: 'zzz', 18279: 'aaaa' };
    for (const [n, label] of Object.entries(examples)) assert.equal(expectedLabel(Number(n)), label);
  });

  // Each example: the page has exactly n links, and the n-th (last) one gets the example label.
  const examples = [
    [1, 'a'],
    [26, 'z'],
    [27, 'aa'],
    [52, 'az'],
    [53, 'ba'],
    [702, 'zz'],
    [703, 'aaa'],
    [18278, 'zzz'],
    [18279, 'aaaa'],
  ];
  for (const [n, label] of examples) {
    test(`link ${n} is labeled "${label}": typing it follows link ${n}`, () => {
      const env = setup(n);
      env.keydown('f');
      assert.equal(env.labels().length, n);
      assert.ok(env.labelTexts().includes(label), `no label "${label}" among ${n} labels`);
      assert.deepEqual(typeLabel(env, label), [url(n - 1)]);
    });
  }

  test('the labels of 703 links are exactly a ... zz, aaa (no gaps, no extras)', () => {
    const env = setup(703);
    env.keydown('f');
    const expected = Array.from({ length: 703 }, (_, i) => expectedLabel(i + 1)).sort();
    assert.deepEqual(env.labelTexts().sort(), expected);
  });

  test('labels map to links in document order (sampled across 1-, 2- and 3-letter labels)', () => {
    for (const n of [2, 13, 26, 28, 100, 351, 677, 704]) {
      const env = setup(704);
      env.keydown('f');
      assert.deepEqual(typeLabel(env, expectedLabel(n)), [url(n - 1)], `link ${n}`);
    }
  });

  test('tens of thousands of links: every link gets a lowercase-letter label, no duplicates, no limit', () => {
    const count = 30000; // past zzz (18278), so 4-letter labels are needed
    const env = setup(count);
    env.keydown('f');
    const texts = env.labelTexts();
    assert.equal(texts.length, count);
    assert.equal(new Set(texts).size, count, 'duplicate labels');
    const bad = texts.filter((t) => !/^[a-z]+$/.test(t));
    assert.deepEqual(bad.slice(0, 5), [], 'labels must use only a-z');
    const expected = Array.from({ length: count }, (_, i) => expectedLabel(i + 1)).sort();
    assert.deepEqual(texts.slice().sort(), expected);
  });

  test('the last of 30000 links is followed by its 4-letter label', () => {
    const count = 30000;
    const env = setup(count);
    env.keydown('f');
    assert.deepEqual(typeLabel(env, expectedLabel(count)), [url(count - 1)]);
  });
});

describe('F-1 following a letter label', () => {
  test('a label that no longer label starts with is followed immediately, with no wait', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('c');
    assert.deepEqual(env.navigations(), [url(2)]);
    assert.equal(env.clock.pendingCount(), 0);
  });

  test('every label opens immediately when there are 26 links or fewer', () => {
    for (const n of [1, 13, 26]) {
      const env = setup(26);
      env.keydown('f');
      env.keydown(expectedLabel(n));
      assert.deepEqual(env.navigations(), [url(n - 1)], `label ${expectedLabel(n)}`);
    }
  });

  test('a label that starts a longer label is followed 1000 ms after its last letter, not at 999 ms', () => {
    const env = setup(27); // "a" and "aa" both exist
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(999);
    assert.deepEqual(env.navigations(), []);
    env.clock.advance(1);
    assert.deepEqual(env.navigations(), [url(0)]);
  });

  test('with 27 links, "z" (no "za") opens immediately while "a" waits for "aa"', () => {
    const env = setup(27);
    env.keydown('f');
    env.keydown('z');
    assert.deepEqual(env.navigations(), [url(25)]);
  });

  test('a then a less than 1000 ms apart follows "aa" immediately, never "a"', () => {
    const env = setup(27);
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(999);
    assert.deepEqual(env.navigations(), []);
    env.keydown('a');
    assert.deepEqual(env.navigations(), [url(26)]);
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), [url(26)]);
  });

  test('a then a 1000 ms apart follows "a" (the second a is not joined)', () => {
    const env = setup(27);
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(0)]);
  });
});

describe('F-1 only lowercase input matches labels', () => {
  test('with label a present, typing A and waiting follows nothing', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('A');
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('typing A then a (Caps Lock style) follows the link labeled a', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('A');
    env.clock.advance(100);
    env.keydown('a');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(0)]);
  });

  test('typing Shift+A then a follows the link labeled a', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Shift');
    env.keydown('A');
    env.clock.advance(100);
    env.keydown('a');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(0)]);
  });

  test('an uppercase letter is not added to the typed label: a, A, a follows "aa"', () => {
    const env = setup(27);
    env.keydown('f');
    env.type(['a', 'A', 'a']);
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(26)]);
  });

  test('uppercase B does not follow the link labeled b', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('B');
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });
});

describe('F-1 label letters do not run normal commands in link mode', () => {
  test('j, k, h and l typed as label input do not scroll', () => {
    const env = setup(30);
    env.keydown('f');
    for (const k of ['j', 'k', 'h', 'l']) env.keydown(k);
    assert.deepEqual(env.scrollCalls, []);
  });

  test('g g typed quickly in link mode does not jump to the top, it follows "gg"', () => {
    const env = setup(189); // "gg" is link 189
    env.keydown('f');
    env.keydown('g');
    env.clock.advance(100);
    env.keydown('g');
    assert.deepEqual(env.scrollCalls, []);
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(188)]);
  });

  test('G in link mode does not jump to the bottom', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('G');
    assert.deepEqual(env.scrollCalls, []);
  });

  test('H and L in link mode do not navigate history', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('H');
    env.keydown('L');
    assert.deepEqual(env.historyCalls, []);
  });

  test('a label made of command letters ("jk") follows its link without scrolling', () => {
    const env = setup(271); // "jk" is link 10*26 + 11 = 271
    env.keydown('f');
    assert.deepEqual(typeLabel(env, 'jk'), [url(270)]);
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, []);
  });

  test('typing l follows the link labeled l without scrolling right', () => {
    const env = setup(12);
    env.keydown('f');
    assert.deepEqual(typeLabel(env, 'l'), [url(11)]);
    assert.deepEqual(env.scrollCalls, []);
  });

  test('f in link mode follows the link labeled f and adds no labels', () => {
    const env = setup(6);
    env.keydown('f');
    env.keydown('f');
    assert.equal(env.labels().length, 6);
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(5)]);
  });

  test('after Escape, j scrolls again', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });
});
