# Tests

Two layers:

- **Unit tests** (`tests/*.test.js`): BACKLOG.md items F-1 and F-3 to F-11, the link-mode parts of B-12 that don't depend on layout (href-less links). Node's built-in test runner, no dependencies (Node 22+).
- **End-to-end tests** (`tests/e2e/*.test.js`): B-12 and F-12, which depend on real layout and CSS. They load the extension into headless Chromium with Playwright (devDependency).

## Running

From the repository root:

```sh
npm test            # unit: node --test "tests/*.test.js"
npm run coverage    # unit with coverage
npm run test:e2e    # e2e: node --test --test-concurrency=1 "tests/e2e/*.test.js"
```

Keep the quotes so Node expands the glob. Node 22 does not accept a bare directory such as `tests/`. The unit glob does not include `tests/e2e`.

The e2e tests need Playwright's Chromium (`npx playwright install chromium`). Set `VIMNAV_E2E_HEADED=1` to watch the browser.

## Label contract

Tests find link labels like this (decided by the coordinator for branch `fix-labels`):

- Each label is an element with class `vimnav-label` whose text content is exactly the label string (for example `a`, `ab`).
- Labels are in the page's DOM, reachable with `document.querySelectorAll('.vimnav-label')`. No shadow DOM.
- The old `link-label` class is no longer used.
- Which link a label belongs to is checked by behavior: typing the label and waiting 1000 ms follows that link. In e2e appearance tests, where every link on the page is visible, the i-th link in document order is paired with the i-th F-1 label.
- Position is checked relative to the link's first line box, with tolerances: the label's bottom is at or above the middle of the link text, its top is above the link's top, and its left edge is within 16 px of the link's start.

Where in the DOM labels are inserted, and how they are styled (inline styles, a stylesheet, a custom element), is up to the implementation.

## Unit tests: how they work

`tests/helpers/load.js` loads the real, unmodified `vim-scroll.js` and `background.js` with `node:vm` into a new context for each test, using small fakes that record calls: `window`, `document`, `history` and `chrome` in `tests/helpers/fake-*.js`. A fake clock (`fake-clock.js`) replaces `setTimeout`/`clearTimeout`, and each keydown's `timeStamp` defaults to the fake clock's time.

The fake DOM has no real layout. Every link counts as visible and inside the viewport through the common APIs: `getBoundingClientRect()`/`getClientRects()` (in-viewport rect), `offsetWidth`/`offsetHeight`/`offsetParent`, `checkVisibility()`, `getComputedStyle()` (visible defaults), and `innerWidth`/`innerHeight` (1280x800). Override per element with `el.rect = { x, y, width, height }` or `el.computed = { display: 'none' }`. `style` behaves like a `CSSStyleDeclaration` (`cssText`, `setProperty`, camelCase properties). Selectors support simple compound forms only (`a[href]`, `.cls`, `#id`, comma lists); others throw so the gap is visible.

Known bugs (B-*) not yet being fixed are listed as `test.todo` entries, not as tests that pass.

## End-to-end tests: how they work

`tests/e2e/helpers/browser.js` copies the extension to a temporary directory, adds `host_permissions: <all_urls>` (standing in for the activeTab grant of a real icon click), and launches Chromium with a throwaway profile (`channel: 'chromium'`, `--load-extension`). Test pages in `tests/e2e/pages/` are served from `127.0.0.1`. VimNav is turned ON in a tab the way a first icon click does: the service worker injects `vim-scroll.js` with `chrome.scripting.executeScript`.

- `b12-visibility.test.js`: which links are labeled (visible, hidden in each way, href-less, off-screen, scrolling during link mode), and F-1 order on real pages.
- `b12-layout.test.js`: page-relative rects of every pre-existing element, and document `scrollWidth`/`scrollHeight`/`scrollX`/`scrollY`, before link mode vs. while labels show, after Escape, and after following a same-page link (scroll position not compared there: the jump is intended).
- `f12-appearance.test.js`: position, smaller font, yellow background, rounded corners; readability on dark, yellow and hostile-CSS pages, checked by computed styles (contrast >= 4.5, visible, on top via `elementFromPoint`) and by the rendered pixels of each label (screenshot, decoded by `helpers/png.js`).

## Checking the tests themselves

`VIMNAV_CONTENT_FILE=<path>` (unit) and `VIMNAV_EXTENSION_DIR=<dir>` (e2e) run the same tests against another copy of the script or extension, for example to confirm that new tests can pass with a candidate implementation. Leave them unset for normal runs.
