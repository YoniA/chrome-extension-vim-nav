'use strict';

// F-3 (j/k/h/l), F-4 (G), F-5 (gg), F-6 (H/L) — vim-scroll.js keydown handler.

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv } = require('./helpers/load');

const HEIGHT = 4321;
let env;

beforeEach(() => {
  env = createContentEnv({ scrollHeight: HEIGHT });
  env.inject();
});

const TOP = [{ top: -HEIGHT, behavior: 'instant' }];
const BOTTOM = [{ top: HEIGHT, behavior: 'instant' }];

describe('F-3 scroll with j/k/h/l', () => {
  test('j scrolls the window down by 50 px', () => {
    env.keydown('j');
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('k scrolls the window up by 50 px', () => {
    env.keydown('k');
    assert.deepEqual(env.scrollCalls, [[0, -50]]);
  });

  test('l scrolls the window right by 50 px', () => {
    env.keydown('l');
    assert.deepEqual(env.scrollCalls, [[50, 0]]);
  });

  test('h scrolls the window left by 50 px', () => {
    env.keydown('h');
    assert.deepEqual(env.scrollCalls, [[-50, 0]]);
  });

  test('each keydown scrolls once, including auto-repeat keydowns', () => {
    env.keydown('j');
    env.keydown('j', { repeat: true });
    env.keydown('j', { repeat: true });
    assert.deepEqual(env.scrollCalls, [[0, 50], [0, 50], [0, 50]]);
  });

  test('uppercase J and K do not scroll', () => {
    env.keydown('J');
    env.keydown('K');
    assert.deepEqual(env.scrollCalls, []);
  });

  test('uppercase H and L do not scroll (they navigate history instead)', () => {
    env.keydown('H');
    env.keydown('L');
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, ['back', 'forward']);
  });

  test('scrolls pass only x/y numbers, so the browser default (possibly smooth) behavior applies', () => {
    for (const k of ['j', 'k', 'h', 'l']) env.keydown(k);
    for (const args of env.scrollCalls) {
      assert.equal(args.length, 2);
      assert.ok(args.every((a) => typeof a === 'number'));
    }
  });

  test('the keydown is not prevented or stopped', () => {
    for (const k of ['j', 'k', 'h', 'l']) {
      const e = env.keydown(k);
      assert.equal(e.defaultPrevented, false, k);
      assert.equal(e.propagationStopped, false, k);
    }
  });

  test('unrelated keys do nothing', () => {
    for (const k of ['x', 'J', 'Enter', 'ArrowDown', ' ', 'Shift']) env.keydown(k);
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, []);
  });
});

describe('F-4 jump to bottom with G', () => {
  test('G scrolls down by document.body.scrollHeight, instantly', () => {
    env.keydown('G');
    assert.deepEqual(env.scrollCalls, [BOTTOM]);
  });

  test('G uses the body height at the time of the keydown', () => {
    env.document.body.scrollHeight = 10;
    env.keydown('G');
    assert.deepEqual(env.scrollCalls, [[{ top: 10, behavior: 'instant' }]]);
  });

  test('G followed by g does not scroll to the top', () => {
    env.keydown('G', { timeStamp: 0 });
    env.keydown('g', { timeStamp: 10 });
    assert.deepEqual(env.scrollCalls, [BOTTOM]);
  });

  test('G followed by G scrolls down twice (no combination)', () => {
    env.keydown('G', { timeStamp: 0 });
    env.keydown('G', { timeStamp: 10 });
    assert.deepEqual(env.scrollCalls, [BOTTOM, BOTTOM]);
  });

  test('the G keydown is not prevented or stopped', () => {
    const e = env.keydown('G');
    assert.equal(e.defaultPrevented, false);
    assert.equal(e.propagationStopped, false);
  });
});

describe('F-5 jump to top with gg', () => {
  test('gg within 1000 ms scrolls up by document.body.scrollHeight, instantly', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, [TOP]);
  });

  test('a single g does nothing', () => {
    env.keydown('g', { timeStamp: 0 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('second g at 999 ms triggers', () => {
    env.keydown('g', { timeStamp: 5000 });
    env.keydown('g', { timeStamp: 5999 });
    assert.deepEqual(env.scrollCalls, [TOP]);
  });

  test('second g at exactly 1000 ms does nothing', () => {
    env.keydown('g', { timeStamp: 5000 });
    env.keydown('g', { timeStamp: 6000 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('second g more than 1000 ms later does nothing', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('g', { timeStamp: 2500 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('a late second g can start a new pair with a following quick g', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('g', { timeStamp: 2000 });
    env.keydown('g', { timeStamp: 2100 });
    assert.deepEqual(env.scrollCalls, [TOP]);
  });

  test('Shift between the two g presses breaks the pair', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('Shift', { timeStamp: 50 });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('a non-command key between the two g presses breaks the pair', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('x', { timeStamp: 50 });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('a command key between the two g presses breaks the pair', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('j', { timeStamp: 50 });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, [[0, 50]]);
  });

  test('Escape outside link mode between the two g presses breaks the pair', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('Escape', { timeStamp: 50 });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('matching is case-sensitive: g then G is not gg', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('G', { timeStamp: 50 });
    assert.deepEqual(env.scrollCalls, [BOTTOM]);
  });

  test('ggg triggers twice (pair is not reset after a jump)', () => {
    env.keydown('g', { timeStamp: 0 });
    env.keydown('g', { timeStamp: 100 });
    env.keydown('g', { timeStamp: 200 });
    assert.deepEqual(env.scrollCalls, [TOP, TOP]);
  });

  test('keydowns while disabled are not recorded: they do not break a pair', () => {
    env.keydown('g', { timeStamp: 0 });
    env.message({ action: 'setEnabled', value: false });
    env.keydown('x', { timeStamp: 50 });
    env.message({ action: 'setEnabled', value: true });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, [TOP]);
  });

  test('keydowns while disabled are not recorded: they do not complete a pair', () => {
    env.message({ action: 'setEnabled', value: false });
    env.keydown('g', { timeStamp: 0 });
    env.message({ action: 'setEnabled', value: true });
    env.keydown('g', { timeStamp: 100 });
    assert.deepEqual(env.scrollCalls, []);
  });

  test('the g keydowns are not prevented or stopped', () => {
    const e1 = env.keydown('g', { timeStamp: 0 });
    const e2 = env.keydown('g', { timeStamp: 1 });
    for (const e of [e1, e2]) {
      assert.equal(e.defaultPrevented, false);
      assert.equal(e.propagationStopped, false);
    }
  });
});

describe('F-6 history back/forward with H/L', () => {
  test('H calls history.back()', () => {
    env.keydown('H');
    assert.deepEqual(env.historyCalls, ['back']);
  });

  test('L calls history.forward()', () => {
    env.keydown('L');
    assert.deepEqual(env.historyCalls, ['forward']);
  });

  test('lowercase h and l scroll instead of navigating', () => {
    env.keydown('h');
    env.keydown('l');
    assert.deepEqual(env.historyCalls, []);
    assert.deepEqual(env.scrollCalls, [[-50, 0], [50, 0]]);
  });

  test('H and L keydowns are not prevented or stopped', () => {
    for (const k of ['H', 'L']) {
      const e = env.keydown(k);
      assert.equal(e.defaultPrevented, false);
      assert.equal(e.propagationStopped, false);
    }
  });
});

describe('known bugs, not yet covered', () => {
  test.todo('B-13 scroll commands scroll an inner scrolling element / G reaches the true bottom');
  test.todo('B-14 decided priority between page shortcuts and VimNav keys');
});
