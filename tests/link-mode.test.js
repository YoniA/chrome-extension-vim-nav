'use strict';

// F-7 (enter link mode with f), F-8 (follow a link by typing its label), F-9 (Escape),
// updated for F-1 (letter labels) and B-12 (only links with an href are labeled).
// Label sequence details for F-1 are in link-labels.test.js; real layout/CSS in tests/e2e.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv, FakeAnchor, FakeElement } = require('./helpers/load');

const url = (i) => `https://example.test/page-${i}`;

function setup(count = 3) {
  const env = createContentEnv({ hrefs: Array.from({ length: count }, (_, i) => url(i)) });
  env.inject();
  return env;
}

// Types `label` (letters 100 ms apart), waits 1000 ms, and returns the navigations so far.
function follow(env, label) {
  env.type(label.split(''));
  env.clock.advance(1000);
  return env.navigations();
}

describe('F-7 enter link mode with f', () => {
  test('f adds one label per visible <a> with an href', () => {
    const env = setup(3);
    env.keydown('f');
    assert.equal(env.labels().length, 3);
  });

  test('labels are a, b, c ... assigned in document order', () => {
    const env = createContentEnv();
    const { document } = env;
    // Nested structure: div > [a0, p > a1], a2
    const div = document.body.appendChild(new FakeElement('div'));
    div.appendChild(new FakeAnchor(url(0)));
    const p = div.appendChild(new FakeElement('p'));
    p.appendChild(new FakeAnchor(url(1)));
    document.body.appendChild(new FakeAnchor(url(2)));
    env.inject();

    for (const [label, expected] of [['a', url(0)], ['b', url(1)], ['c', url(2)]]) {
      env.keydown('Escape');
      env.keydown('f');
      assert.equal(follow(env, label).at(-1), expected, `label ${label}`);
    }
  });

  test('each label is an element with class vimnav-label whose text is exactly its label', () => {
    const env = setup(2);
    env.keydown('f');
    assert.deepEqual(env.labels().map((l) => l.textContent).sort(), ['a', 'b']);
  });

  test('<a> without href gets no label and does not use up a label', () => {
    const env = createContentEnv({ hrefs: [url(0), null, url(2)] });
    env.inject();
    env.keydown('f');
    assert.equal(env.labels().length, 2);
    assert.deepEqual(follow(env, 'b'), [url(2)]);
  });

  test('links added after f do not get labels', () => {
    const env = setup(2);
    env.keydown('f');
    env.document.body.appendChild(new FakeAnchor(url(99)));
    assert.equal(env.labels().length, 2);
  });

  test('a page with no links enters link mode without error', () => {
    const env = setup(0);
    env.keydown('f');
    assert.equal(env.labels().length, 0);
  });

  test('the f that enters link mode is not label input', () => {
    const env = setup(3);
    env.keydown('f');
    assert.deepEqual(follow(env, 'a'), [url(0)]);
  });

  test('f alone does not start a label timer', () => {
    const env = setup(3);
    env.keydown('f');
    assert.equal(env.clock.pendingCount(), 0);
  });

  test('f again in link mode does not add labels', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('f');
    assert.equal(env.labels().length, 3);
  });

  test('f again in link mode is label input: it follows the link labeled f', () => {
    const env = setup(8);
    env.keydown('f');
    assert.deepEqual(follow(env, 'f'), [url(5)]);
  });

  test('the f keydown is not prevented or stopped', () => {
    const env = setup(1);
    const e = env.keydown('f');
    assert.equal(e.defaultPrevented, false);
    assert.equal(e.propagationStopped, false);
  });

  test('uppercase F does not enter link mode', () => {
    const env = setup(2);
    env.keydown('F');
    assert.equal(env.labels().length, 0);
  });
});

describe('F-8 follow a link by typing its label', () => {
  test('typing a label and waiting 1000 ms navigates to that link in the same tab', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('c');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(2)]);
  });

  test('no navigation at 999 ms after the last keydown', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('b');
    env.clock.advance(999);
    assert.deepEqual(env.navigations(), []);
    env.clock.advance(1);
    assert.deepEqual(env.navigations(), [url(1)]);
  });

  test('each keydown restarts the 1000 ms timer', () => {
    const env = setup(28);
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(600);
    env.keydown('b');
    env.clock.advance(600); // 1200 ms after "a", 600 ms after "b"
    assert.deepEqual(env.navigations(), []);
    env.clock.advance(400);
    assert.deepEqual(env.navigations(), [url(27)]); // "ab" is link 28
  });

  test('only one label timer is pending at a time', () => {
    const env = setup(28);
    env.keydown('f');
    env.keydown('a');
    env.keydown('b');
    assert.equal(env.clock.pendingCount(), 1);
  });

  test('multi-letter labels work when letters are typed less than 1000 ms apart', () => {
    const env = setup(28);
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(999);
    env.keydown('b');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(27)]);
  });

  test('a letter typed 1000 ms after the previous one is not joined to it', () => {
    const env = setup(28);
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(0)]);
  });

  test('typed text must match a label exactly: "aab" does not match label "ab"', () => {
    const env = setup(28);
    env.keydown('f');
    env.type(['a', 'a', 'b']);
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), []);
  });

  test('letters with no label do not navigate', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('z');
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('digits are not labels: typing 0 or 1 in link mode navigates nowhere', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(1000);
    env.keydown('0');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), []);
  });

  test('after navigating, the typed text and label list are cleared', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('b');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(1)]);
    // A new "a" is not appended to "b", and does not follow link a.
    env.keydown('a');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(1)]);
  });

  test('label letters are not prevented or stopped', () => {
    const env = setup(3);
    env.keydown('f');
    const e = env.keydown('b');
    assert.equal(e.defaultPrevented, false);
    assert.equal(e.propagationStopped, false);
  });

  test('outside link mode, digit keys start no timer and never navigate', () => {
    const env = setup(3);
    env.keydown('1');
    assert.equal(env.clock.pendingCount(), 0);
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });
});

describe('F-9 exit link mode with Escape', () => {
  test('after Escape, no label is visible (hidden or removed)', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    assert.equal(env.visibleLabels().length, 0);
  });

  test('f and Escape leave page elements with the old class link-label alone', () => {
    const env = setup(1);
    const own = env.document.body.appendChild(new FakeElement('div'));
    own.classList.add('link-label');
    env.keydown('f');
    env.keydown('Escape');
    assert.deepEqual(own.styleAssignments, []);
    assert.equal(own.cssText, '');
    assert.equal(own.parentNode, env.document.body);
  });

  test('Escape cancels a pending label timer', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('a');
    env.keydown('Escape');
    assert.equal(env.clock.pendingCount(), 0);
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('Escape turns link mode off: letters no longer start a timer', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    env.keydown('a');
    assert.equal(env.clock.pendingCount(), 0);
  });

  test('Escape clears the typed text: the next label is matched on its own', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('b');
    env.keydown('Escape');
    env.keydown('f');
    env.keydown('a');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(0)]);
  });

  test('after Escape, f enters link mode again with a new visible set of labels', () => {
    const env = setup(3);
    env.keydown('f');
    const first = env.labels();
    env.keydown('Escape');
    env.keydown('f');
    const visible = env.visibleLabels();
    assert.equal(visible.length, 3);
    for (const label of visible) assert.equal(first.includes(label), false);
    assert.deepEqual(visible.map((l) => l.textContent).sort(), ['a', 'b', 'c']);
  });

  test('after Escape and f, labels map to links again', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    env.keydown('f');
    env.keydown('c');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(2)]);
  });

  test('Escape outside link mode does nothing', () => {
    const env = setup(2);
    const own = env.document.body.appendChild(new FakeElement('div'));
    own.classList.add('link-label');
    env.keydown('Escape');
    assert.deepEqual(own.styleAssignments, []);
    assert.deepEqual(env.scrollCalls, []);
    assert.deepEqual(env.historyCalls, []);
    assert.deepEqual(env.navigations(), []);
    assert.equal(env.clock.pendingCount(), 0);
    assert.equal(env.labels().length, 0);
  });

  test('Escape outside link mode leaves f working normally', () => {
    const env = setup(2);
    env.keydown('Escape');
    env.keydown('f');
    assert.equal(env.labels().length, 2);
  });

  test('the Escape keydown is not prevented or stopped', () => {
    const env = setup(1);
    env.keydown('f');
    const e = env.keydown('Escape');
    assert.equal(e.defaultPrevented, false);
    assert.equal(e.propagationStopped, false);
  });
});

describe('known bugs, not yet covered', () => {
  test.todo('B-7 after an unmatched label times out, the next label is matched on its own');
  test.todo('B-8 following a link exits link mode and removes labels');
  test.todo('B-9 Escape removes labels; repeated f/Escape shows one label per link');
  test.todo('B-10 in link mode, non-character keys (Tab, arrows) are not label input');
  test.todo('B-11 following a link behaves like a click (target=_blank, click handlers)');
  // B-12 (visibility, layout) is tested in real Chromium: tests/e2e/b12-*.test.js.
  test.todo('B-15 no stale labels or link mode after a back/forward cache restore');
  test.todo('F-10 open question: should a label timer started before OFF still navigate after OFF');
});
