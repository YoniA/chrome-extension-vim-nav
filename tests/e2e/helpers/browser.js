'use strict';

// End-to-end harness: loads a sandboxed copy of the extension into headless Chromium
// (Playwright, temporary profile), serves tests/e2e/pages over local HTTP, and turns VimNav ON
// in a tab the way a first icon click does (injects vim-scroll.js from the service worker).
//
// Same approach as tools/try-extension.mjs (not imported from there). The extension copy gets
// host_permissions <all_urls> to stand in for the activeTab grant a real icon click gives.
//
// VIMNAV_EXTENSION_DIR: test another copy of the extension (e.g. to check that tests can pass).
// VIMNAV_E2E_HEADED=1: show the browser.

const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { decodePng } = require('./png');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PAGES = path.resolve(__dirname, '..', 'pages');
const EXTENSION_SRC = process.env.VIMNAV_EXTENSION_DIR ? path.resolve(process.env.VIMNAV_EXTENSION_DIR) : ROOT;
const EXTENSION_FILES = ['manifest.json', 'background.js', 'vim-scroll.js', 'images'];
const VIEWPORT = { width: 1280, height: 800 };
const LABEL_SELECTOR = '.vimnav-label';

async function startBrowser() {
  const server = http.createServer(async (req, res) => {
    const name = path.basename(new URL(req.url, 'http://x').pathname);
    if (name === 'favicon.ico') return res.writeHead(204).end();
    try {
      const body = await fs.readFile(path.join(PAGES, name));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;

  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'vimnav-e2e-'));
  const extDir = path.join(sandbox, 'extension');
  for (const file of EXTENSION_FILES) {
    await fs.cp(path.join(EXTENSION_SRC, file), path.join(extDir, file), { recursive: true });
  }
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const context = await chromium.launchPersistentContext(path.join(sandbox, 'profile'), {
    channel: 'chromium',
    headless: !process.env.VIMNAV_E2E_HEADED,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
    // Playwright turns off the back/forward cache; real Chrome has it on, and it changes what Back shows.
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  let counter = 0;

  const browser = {
    base,
    // Opens a test page in a new tab and turns VimNav ON there. `query` is appended to the URL.
    async open(name, query = '') {
      const page = await context.newPage();
      const sep = query ? '&' : '';
      await page.goto(`${base}${name}?${query}${sep}n=${++counter}`);
      await browser.enable(page);
      return page;
    },
    async enable(page) {
      const error = await worker.evaluate(async (url) => {
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find((t) => t.url === url);
        if (!tab) return `no tab with URL ${url}`;
        await chrome.action.setBadgeText({ tabId: tab.id, text: 'ON' });
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['vim-scroll.js'] });
        } catch (e) {
          return e.message;
        }
        return null;
      }, page.url());
      if (error) throw new Error(`Could not turn VimNav on: ${error}`);
    },
    async close() {
      await context.close();
      server.close();
      await fs.rm(sandbox, { recursive: true, force: true });
    },
  };
  return browser;
}

// Presses f and waits (up to 2 s) for VimNav labels to appear. Returns labelInfo().
async function enterLinkMode(page) {
  await page.keyboard.press('f');
  await page
    .waitForFunction((sel) => document.querySelectorAll(sel).length > 0, LABEL_SELECTOR, { timeout: 2000 })
    .catch(() => {});
  await page.waitForTimeout(100);
  return labelInfo(page);
}

// Every label element (class vimnav-label): its text, bounding rect, and visual properties
// read from the element that directly holds the label text.
function labelInfo(page) {
  return page.evaluate((sel) => {
    const rgba = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    return [...document.querySelectorAll(sel)].map((label) => {
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      let textNode = null;
      while (walker.nextNode()) {
        if (walker.currentNode.data.trim()) {
          textNode = walker.currentNode;
          break;
        }
      }
      const textEl = textNode ? textNode.parentElement : label;
      const ts = getComputedStyle(textEl);
      // Effective background: first non-transparent background from the text element up to the label.
      let bg = [0, 0, 0, 0];
      for (let el = textEl; el; el = el.parentElement) {
        const c = rgba(getComputedStyle(el).backgroundColor);
        if (c[3] > 0) {
          bg = c;
          break;
        }
        if (el === label) break;
      }
      const ls = getComputedStyle(label);
      const r = label.getBoundingClientRect();
      const corners = [ls.borderTopLeftRadius, ls.borderTopRightRadius, ls.borderBottomRightRadius, ls.borderBottomLeftRadius].map(parseFloat);
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(cx, cy) : null;
      return {
        text: label.textContent,
        rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        fontSize: parseFloat(ts.fontSize),
        color: rgba(ts.color),
        background: bg,
        corners,
        visible: label.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
        onTop: !!hit && (label.contains(hit) || hit === label),
      };
    });
  }, LABEL_SELECTOR);
}

// Visible <a href> links of the page in document order (as decided by each test page's design),
// with the first line box rect, the rect where the link's content ends (`last`: the last line
// of its text, not the end of its box), and computed font size.
function linkInfo(page, selector = 'a[href]') {
  return page.evaluate((selector) => {
    return [...document.querySelectorAll(selector)].map((a) => {
      const first = a.getClientRects()[0] || a.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(a);
      const contentRects = range.getClientRects();
      const last = contentRects[contentRects.length - 1] || first;
      return {
        id: a.id,
        href: a.getAttribute('href'),
        first: { left: first.left, top: first.top, right: first.right, bottom: first.bottom, height: first.height },
        last: { left: last.left, top: last.top, right: last.right, bottom: last.bottom, height: last.height },
        fontSize: parseFloat(getComputedStyle(a).fontSize),
      };
    });
  }, selector);
}

// Types a label and returns the URL the page navigates to (or null if none within 2.5 s).
async function followLabel(page, label) {
  const before = page.url();
  for (const ch of label) await page.keyboard.press(ch);
  try {
    await page.waitForURL((u) => u.href !== before, { timeout: 2500 });
    return page.url();
  } catch {
    return null;
  }
}

// Snapshot of layout: page-relative rects of html, body and every element in body (rendered
// content) that existed when snapshot() was first called (`init`), plus document scroll size and position.
async function layoutSnapshot(page, { init = false } = {}) {
  return page.evaluate((init) => {
    if (init || !window.__e2eElements) window.__e2eElements = [...document.querySelectorAll('html, body, body *')];
    const se = document.scrollingElement;
    return {
      elements: window.__e2eElements.map((el) => {
        const r = el.getBoundingClientRect();
        const name = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');
        // Elements without a layout box (script, display:none) report a 0x0 rect at the viewport
        // origin; keep that as 0,0 instead of adding the scroll offset.
        const rendered = el.getClientRects().length > 0;
        const x = rendered ? r.left + scrollX : 0;
        const y = rendered ? r.top + scrollY : 0;
        return { name, x, y, w: r.width, h: r.height, rendered, connected: el.isConnected };
      }),
      scrollWidth: se.scrollWidth,
      scrollHeight: se.scrollHeight,
      scrollX,
      scrollY,
    };
  }, init);
}

// Lists elements whose page position or size changed by more than `tol` px.
function layoutDiff(before, after, tol = 0.5) {
  const out = [];
  before.elements.forEach((b, i) => {
    const a = after.elements[i];
    if (!a.connected) {
      out.push(`${b.name} removed`);
      return;
    }
    if (a.rendered !== b.rendered) {
      out.push(`${b.name} ${b.rendered ? 'stopped' : 'started'} being rendered`);
      return;
    }
    const d = ['x', 'y', 'w', 'h'].filter((k) => Math.abs(a[k] - b[k]) > tol);
    if (d.length) out.push(`${b.name}: ${d.map((k) => `${k} ${b[k].toFixed(1)} -> ${a[k].toFixed(1)}`).join(', ')}`);
  });
  return out;
}

// Pixel statistics of a label's area on screen: share of yellow pixels and number of dark
// (text-like) pixels. Measures what is actually rendered (filters, transforms, overlap).
async function labelPixels(page, rect) {
  const x = Math.max(0, Math.floor(rect.left));
  const y = Math.max(0, Math.floor(rect.top));
  const width = Math.min(VIEWPORT.width, Math.ceil(rect.right)) - x;
  const height = Math.min(VIEWPORT.height, Math.ceil(rect.bottom)) - y;
  if (width < 2 || height < 2) return { yellowShare: 0, darkPixels: 0, size: `${width}x${height}` };
  const png = decodePng(await page.screenshot({ clip: { x, y, width, height } }));
  let yellow = 0;
  let dark = 0;
  for (let j = 0; j < png.height; j++) {
    for (let i = 0; i < png.width; i++) {
      const [r, g, b] = png.pixel(i, j);
      if (isYellow([r, g, b, 1])) yellow++;
      if (0.299 * r + 0.587 * g + 0.114 * b < 110) dark++;
    }
  }
  return { yellowShare: yellow / (png.width * png.height), darkPixels: dark, size: `${png.width}x${png.height}` };
}

// "Yellow": strong red and green, little blue (covers yellow, #ffeb3b, gold, #ff0 ...), mostly opaque.
function isYellow([r, g, b, a = 1]) {
  return r >= 200 && g >= 180 && b <= 130 && a >= 0.8;
}

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(c1, c2) {
  const [l1, l2] = [luminance(c1), luminance(c2)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

// Bijective base-26 label for a 0-based index (0 -> a, 26 -> aa).
function labelFor(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

module.exports = {
  startBrowser,
  enterLinkMode,
  labelInfo,
  linkInfo,
  followLabel,
  layoutSnapshot,
  layoutDiff,
  labelPixels,
  isYellow,
  contrast,
  labelFor,
  VIEWPORT,
  LABEL_SELECTOR,
};
