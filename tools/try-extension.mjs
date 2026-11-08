// Runs a scripted browsing session with VimNav loaded in a sandboxed Chromium
// (temporary profile and extension copy, deleted afterwards).
//
// Usage: node tools/try-extension.mjs <session.json> [--out <dir>] [--headed] [--slow <ms>] [--no-host-access]
//
// --headed shows the browser window; --slow pauses after every step (and between key presses)
// so a person can follow along, e.g. --headed --slow 800.
//
// session.json is { "steps": [ ... ] }, each step an object with one action:
//   { "goto": "local:long.html" }   local test page (tools/pages), served from localhost
//   { "goto": "local2:links.html" } same pages from 127.0.0.1, a different origin
//   { "goto": "https://example.com" }
//   { "toggle": true }              simulate clicking the VimNav toolbar icon
//   { "press": "j", "times": 3 }    press a key; Playwright key names, e.g. "G", "Escape", "Meta+l"
//   { "type": "hello" }             type text into whatever has focus
//   { "click": "#search" }          click an element (CSS selector)
//   { "wait": 1100 }                wait in ms (link labels open after 1000 ms)
//   { "newTab": "local2:long.html" } open a new tab and switch to it
//   { "switchTab": 0 }              switch to an open tab by index
//   { "browserBack": true }         the browser's own Back button
//   { "screenshot": "name", "fullPage": false }
//   { "note": "text" }              copied to the log
//
// After every step it prints one JSON line with the page state: URL, scroll position,
// link labels, focus, badge text, and any errors from the page or the extension.
//
// The toolbar icon can't be clicked by automation, so "toggle" runs the same steps as the
// icon's click handler in background.js, from inside the extension. A real click also grants
// activeTab access to the page; to stand in for that, the extension copy is given access to all
// sites. That also lets automatic injection on new tabs and page loads work everywhere, which may
// not match real use (backlog B-3). Pass --no-host-access to keep the original permissions.

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = path.join(ROOT, 'tools', 'pages');
const EXTENSION_FILES = ['manifest.json', 'background.js', 'vim-scroll.js', 'images'];
const SETTLE_MS = 200;

const args = process.argv.slice(2);
const sessionFile = args.find(a => !a.startsWith('--') && !['--out', '--slow'].includes(args[args.indexOf(a) - 1]));
if (!sessionFile) {
  console.error('Usage: node tools/try-extension.mjs <session.json> [--out <dir>] [--headed] [--slow <ms>] [--no-host-access]');
  process.exit(2);
}
const headed = args.includes('--headed');
const slowMs = args.includes('--slow') ? Number(args[args.indexOf('--slow') + 1]) : 0;
const hostAccess = !args.includes('--no-host-access');
const outDir = args.includes('--out')
  ? path.resolve(args[args.indexOf('--out') + 1])
  : await fs.mkdtemp(path.join(os.tmpdir(), 'vimnav-try-'));

const { steps } = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
await fs.mkdir(outDir, { recursive: true });
const logFile = path.join(outDir, 'session.log');

function log(entry) {
  const line = JSON.stringify(entry);
  console.log(line);
  return fs.appendFile(logFile, line + '\n');
}

// Local test pages
const server = http.createServer(async (req, res) => {
  const name = path.basename(new URL(req.url, 'http://x').pathname) || 'links.html';
  if (name === 'favicon.ico') return res.writeHead(204).end();
  try {
    const body = await fs.readFile(path.join(PAGES, name));
    res.writeHead(200, { 'Content-Type': 'text/html' }).end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;

function resolveUrl(url) {
  if (url.startsWith('local:')) return `http://localhost:${port}/${url.slice(6)}`;
  if (url.startsWith('local2:')) return `http://127.0.0.1:${port}/${url.slice(7)}`;
  return url;
}

// Sandboxed copy of the extension and a throwaway profile
const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'vimnav-sandbox-'));
const extDir = path.join(sandbox, 'extension');
for (const file of EXTENSION_FILES) {
  await fs.cp(path.join(ROOT, file), path.join(extDir, file), { recursive: true });
}
if (hostAccess) {
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  manifest.host_permissions = ['<all_urls>'];
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

const context = await chromium.launchPersistentContext(path.join(sandbox, 'profile'), {
  channel: 'chromium',
  headless: !headed,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
});

const errors = [];
function watchPage(page) {
  page.on('pageerror', err => errors.push(`page: ${err.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
}

async function getWorker() {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  if (!worker.__watched) {
    worker.__watched = true;
    worker.on('console', msg => { if (msg.type() === 'error') errors.push(`extension: ${msg.text()}`); });
  }
  return worker;
}

const pages = [...context.pages()];
pages.forEach(watchPage);
context.on('page', page => {
  if (!pages.includes(page)) pages.push(page);
  watchPage(page);
});
let page = pages[0] ?? await context.newPage();
await getWorker();

async function tabIdOf(p) {
  const worker = await getWorker();
  return worker.evaluate(async url => {
    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter(t => t.url === url);
    return (matches.find(t => t.active) ?? matches.at(-1))?.id ?? null;
  }, p.url());
}

// Same steps as chrome.action.onClicked in background.js
async function simulateIconClick(tabId) {
  const worker = await getWorker();
  return worker.evaluate(async tabId => {
    const prevState = await chrome.action.getBadgeText({ tabId });
    const nextState = prevState === 'ON' ? 'OFF' : 'ON';
    await chrome.action.setBadgeText({ tabId, text: nextState });
    await chrome.storage.sync.set({ extensionState: nextState });
    let error = null;
    if (nextState === 'ON') {
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'setEnabled', value: true });
      } catch {
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ['vim-scroll.js'] });
        } catch (e) {
          error = e.message;
        }
      }
    } else {
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'setEnabled', value: false });
      } catch (e) {
        error = e.message;
      }
    }
    return { state: nextState, error };
  }, tabId);
}

async function pageState() {
  const state = await page.evaluate(() => {
    const se = document.scrollingElement || document.documentElement;
    const labels = [...document.querySelectorAll('.vimnav-label')];
    const visible = labels.filter(l => getComputedStyle(l).display !== 'none');
    const active = document.activeElement;
    const scrolledElements = [...document.querySelectorAll('body *')]
      .filter(el => el.scrollTop > 0 || el.scrollLeft > 0)
      .slice(0, 5)
      .map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} top=${el.scrollTop} left=${el.scrollLeft}`);
    return {
      url: location.href,
      title: document.title,
      scroll: { x: Math.round(scrollX), y: Math.round(scrollY), maxY: se.scrollHeight - innerHeight },
      scrolledElements,
      labels: { total: labels.length, visible: visible.length, sample: visible.slice(0, 10).map(l => l.textContent) },
      focus: active && active !== document.body
        ? `${active.tagName.toLowerCase()}${active.id ? '#' + active.id : ''}`
        : 'page',
      focusedValue: active && 'value' in active ? active.value : active?.isContentEditable ? active.textContent : undefined,
    };
  }).catch(e => ({ unavailable: e.message }));
  const tabId = await tabIdOf(page).catch(() => null);
  const worker = await getWorker();
  state.badge = tabId == null ? null : await worker.evaluate(id => chrome.action.getBadgeText({ tabId: id }), tabId).catch(() => null);
  state.tabs = pages.filter(p => !p.isClosed()).length;
  state.currentTab = pages.indexOf(page);
  return state;
}

async function settle() {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(SETTLE_MS + slowMs);
}

await log({ session: sessionFile, outDir, hostAccess, headed, slowMs });

try {
  for (const [index, step] of steps.entries()) {
    const result = {};
    if ('goto' in step) {
      await page.goto(resolveUrl(step.goto));
    } else if ('toggle' in step) {
      Object.assign(result, await simulateIconClick(await tabIdOf(page)));
    } else if ('press' in step) {
      for (let i = 0; i < (step.times ?? 1); i++) {
        await page.keyboard.press(step.press, { delay: step.delay ?? 20 });
        if (slowMs && i < (step.times ?? 1) - 1) await page.waitForTimeout(Math.min(slowMs, 300));
      }
    } else if ('type' in step) {
      await page.keyboard.type(step.type, { delay: 30 });
    } else if ('click' in step) {
      await page.click(step.click);
    } else if ('wait' in step) {
      await page.waitForTimeout(step.wait);
    } else if ('newTab' in step) {
      page = await context.newPage();
      await page.goto(resolveUrl(step.newTab));
    } else if ('switchTab' in step) {
      page = pages[step.switchTab];
      await page.bringToFront();
    } else if ('browserBack' in step) {
      await page.goBack().catch(() => {});
    } else if ('screenshot' in step) {
      const file = path.join(outDir, `${String(index).padStart(2, '0')}-${step.screenshot}.png`);
      await page.screenshot({ path: file, fullPage: step.fullPage ?? false });
      result.screenshot = file;
    } else if (!('note' in step)) {
      throw new Error(`Unknown step: ${JSON.stringify(step)}`);
    }
    await settle();
    const newErrors = errors.splice(0);
    await log({ step: index, action: step, ...result, state: await pageState(), errors: newErrors.length ? newErrors : undefined });
  }
} catch (e) {
  await log({ failed: e.message });
  process.exitCode = 1;
} finally {
  await context.close();
  server.close();
  await fs.rm(sandbox, { recursive: true, force: true });
}
