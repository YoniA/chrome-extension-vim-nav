'use strict';

// F-7 (enter link mode with f), F-8 (follow a link by typing its label), F-9 (Escape).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createContentEnv, FakeAnchor, FakeElement } = require('./helpers/load');

const url = (i) => `https://example.test/page-${i}`;

function setup(count = 3) {
  const env = createContentEnv({ hrefs: Array.from({ length: count }, (_, i) => url(i)) });
  env.inject();
  return env;
}

describe('F-7 enter link mode with f', () => {
  test('f adds one label per <a> element', () => {
    const env = setup(3);
    env.keydown('f');
    assert.equal(env.labels().length, 3);
  });

  test('labels are decimal numbers starting at 0, in document order', () => {
    const env = createContentEnv();
    const { document } = env;
    // Nested structure: div > [a0, p > a1], a2
    const div = document.body.appendChild(new FakeElement('div'));
    const a0 = div.appendChild(new FakeAnchor(url(0)));
    const p = div.appendChild(new FakeElement('p'));
    const a1 = p.appendChild(new FakeAnchor(url(1)));
    const a2 = document.body.appendChild(new FakeAnchor(url(2)));
    env.inject();

    env.keydown('f');

    assert.equal(a0.nextSibling.textContent, '0');
    assert.equal(a1.nextSibling.textContent, '1');
    assert.equal(a2.nextSibling.textContent, '2');
  });

  test('each label is a span.link-label inserted directly after its link', () => {
    const env = setup(2);
    const [a0, a1] = env.links;
    env.keydown('f');
    for (const link of [a0, a1]) {
      const label = link.nextSibling;
      assert.equal(label.tagName, 'SPAN');
      assert.equal(label.className, 'link-label');
      assert.equal(label.parentNode, link.parentNode);
    }
    // body: a0, label0, a1, label1
    assert.deepEqual(
      env.document.body.children.map((el) => el.tagName + ':' + el.textContent),
      ['A:', 'SPAN:0', 'A:', 'SPAN:1'],
    );
  });

  test('a label is inserted after the last child correctly (no next sibling)', () => {
    const env = setup(1);
    env.keydown('f');
    assert.equal(env.document.body.children.at(-1).textContent, '0');
  });

  test('labels have a yellow background, 1px solid black border and 5px radius', () => {
    const env = setup(1);
    env.keydown('f');
    const css = env.labels()[0].cssText;
    assert.match(css, /background-color:\s*yellow/);
    assert.match(css, /border:\s*1px solid black/);
    assert.match(css, /border-radius:\s*5px/);
  });

  test('<a> without href still gets a label', () => {
    const env = createContentEnv({ hrefs: [url(0), null, url(2)] });
    env.inject();
    env.keydown('f');
    assert.equal(env.labels().length, 3);
    assert.equal(env.links[1].nextSibling.textContent, '1');
  });

  test('links added after f do not get labels', () => {
    const env = setup(2);
    env.keydown('f');
    const late = env.document.body.appendChild(new FakeAnchor(url(99)));
    assert.equal(env.labels().length, 2);
    assert.equal(late.nextSibling, null);
  });

  test('a page with no links enters link mode without error', () => {
    const env = setup(0);
    env.keydown('f');
    assert.equal(env.labels().length, 0);
  });

  test('the f that enters link mode is not label input', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('0');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(0)]);
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

  test('f again in link mode is counted as label input', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('f');
    env.keydown('0'); // typed text is "f0", which matches no label
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), []);
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
    env.keydown('2');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(2)]);
  });

  test('no navigation at 999 ms after the last keydown', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(999);
    assert.deepEqual(env.navigations(), []);
    env.clock.advance(1);
    assert.deepEqual(env.navigations(), [url(1)]);
  });

  test('each keydown restarts the 1000 ms timer', () => {
    const env = setup(13);
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(600);
    env.keydown('2');
    env.clock.advance(600); // 1200 ms after "1", 600 ms after "2"
    assert.deepEqual(env.navigations(), []);
    env.clock.advance(400);
    assert.deepEqual(env.navigations(), [url(12)]);
  });

  test('only one label timer is pending at a time', () => {
    const env = setup(13);
    env.keydown('f');
    env.keydown('1');
    env.keydown('2');
    assert.equal(env.clock.pendingCount(), 1);
  });

  test('multi-digit labels work when digits are typed less than 1000 ms apart', () => {
    const env = setup(13);
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(999);
    env.keydown('2');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(12)]);
  });

  test('a digit typed 1000 ms after the previous one is not joined to it', () => {
    const env = setup(13);
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(1)]);
  });

  test('typed text must match a label exactly: "012" does not match label 12', () => {
    const env = setup(13);
    env.keydown('f');
    env.type(['0', '1', '2']);
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), []);
  });

  test('a label for a link with an empty href does not navigate', () => {
    const env = createContentEnv({ hrefs: [url(0), null] });
    env.inject();
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), []);
  });

  test('a number with no label does not navigate', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('7');
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('after navigating, the typed text and label list are cleared', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('1');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(1)]);
    // Cleared text: a new "0" is not appended to "1". Cleared list: "0" no longer maps to a link.
    env.keydown('0');
    env.clock.advance(1000);
    assert.deepEqual(env.navigations(), [url(1)]);
  });

  test('label digits are not prevented or stopped', () => {
    const env = setup(3);
    env.keydown('f');
    const e = env.keydown('1');
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
  test('Escape hides every label with display: none', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    assert.equal(env.labels().length > 0, true);
    for (const label of env.labels()) assert.equal(label.cssText, 'display: none');
  });

  test('Escape also hides page elements that have class link-label', () => {
    const env = setup(1);
    const own = env.document.body.appendChild(new FakeElement('div'));
    own.classList.add('link-label');
    env.keydown('f');
    env.keydown('Escape');
    assert.equal(own.cssText, 'display: none');
  });

  test('Escape cancels a pending label timer', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('0');
    env.keydown('Escape');
    assert.equal(env.clock.pendingCount(), 0);
    env.clock.advance(5000);
    assert.deepEqual(env.navigations(), []);
  });

  test('Escape turns link mode off: digits no longer start a timer', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    env.keydown('0');
    assert.equal(env.clock.pendingCount(), 0);
  });

  test('Escape clears the typed text: the next label is matched on its own', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('1');
    env.keydown('Escape');
    env.keydown('f');
    env.keydown('0');
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
    assert.deepEqual(visible.map((l) => l.textContent), ['0', '1', '2']);
  });

  test('after Escape and f, labels map to links again', () => {
    const env = setup(3);
    env.keydown('f');
    env.keydown('Escape');
    env.keydown('f');
    env.keydown('2');
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
    assert.equal(env.labels().length, 1);
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
  test.todo('B-10 in link mode, normal commands do not run and non-character keys are not label input');
  test.todo('B-11 following a link behaves like a click (target=_blank, click handlers)');
  test.todo('B-12 labels do not shift layout; hidden/off-screen/href-less links get no label');
  test.todo('B-15 no stale labels or link mode after a back/forward cache restore');
  test.todo('F-10 open question: should a label timer started before OFF still navigate after OFF');
});
