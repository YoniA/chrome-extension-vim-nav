if (window.__vimNavActive) throw new Error('VimNav already active');
window.__vimNavActive = true;

// One global on/off switch: extensionState in sync storage, followed live in every tab.
// Not stored (fresh install) means ON. Starts ON until storage has been read.
let enabled = true;
let lastKey = null;

// link mode state
let linkMode = false;
let linkHash = {};
let linkLabels = [];
let linkModeBuffer = '';
let linkModeTimeout = null;

function setEnabled(value) {
  enabled = value;
  if (enabled) return;
  if (linkMode) exitLinkMode();
  if (searchBar) cancelSearch();
  hideSearchHighlights();
}

let stateChanged = false; // a change that arrives before the first read wins over it
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !('extensionState' in changes)) return;
  stateChanged = true;
  setEnabled(changes.extensionState.newValue !== 'OFF');
});
chrome.storage.sync.get('extensionState').then(({ extensionState }) => {
  if (!stateChanged) setEnabled(extensionState !== 'OFF');
});

document.addEventListener('keydown', (e) => {
  if (!enabled) return;

  // Leave browser/page shortcuts (Ctrl, Cmd, Alt) and typing in fields alone. Shift is fine: G, H, L.
  if (e.ctrlKey || e.metaKey || e.altKey) {
    lastKey = null; // so a g here and a g after it are not gg
    return;
  }
  const field = typingTarget(e);
  if (field) {
    lastKey = null;
    // Escape leaves the field, so navigation keys work again without the mouse.
    // Not prevented: the page still sees it (e.g. to close its autocomplete menu).
    if (e.key === 'Escape') field.blur();
    return;
  }

	const SCROLL_STEP = 50;
	const keyName = e.key;

  if (linkMode) {
    handleLinkModeKey(e);
  } else {
		switch (keyName) {
			case 'j':
				window.scrollBy(0, SCROLL_STEP);
				break;
			case 'k':
				window.scrollBy(0, -SCROLL_STEP);
				break;
			case 'h':
				window.scrollBy(-SCROLL_STEP, 0);
				break;
			case 'l':
				window.scrollBy(SCROLL_STEP, 0);
				break;
			case 'G':
				window.scrollBy({
					top: document.body.scrollHeight,
					behavior: "instant",
				});
				break;
			case 'g':
				// 'gg' within one second
				if (lastKey && lastKey.key === 'g' && (e.timeStamp - lastKey.timeStamp < 1000)) {
					window.scrollBy({
						top: -document.body.scrollHeight,
						behavior: "instant",
					});
				}
				break;
			case 'H':
				history.back();
				break;
			case 'L':
				history.forward();
				break;
			case 'f':
				linkMode = true;
				labelAllLinks();
				break;
			case '/':
				// Focus moves into the search bar during this keydown; don't type the / into it.
				e.preventDefault();
				openSearchBar();
				break;
			case 'n':
				stepSearch(1);
				break;
			case 'N':
				stepSearch(-1);
				break;
			case 'Escape':
				hideSearchHighlights();
				break;
			case 'x':
				// Holding x closes one tab: auto-repeat keydowns (also in the next active tab) are ignored.
				if (!e.repeat) askBackground({ action: 'closeTab' });
				break;
		}
  }

	lastKey = {
		key: e.key,
		timeStamp: e.timeStamp
	};

});


// Tab actions need the service worker. Fails quietly if it can't be reached (e.g. this page's
// script is left over from before the extension was reloaded).
function askBackground(msg) {
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {}
}


// Input types that don't take typed text; any other <input> type does.
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden']);

// The text field, <select> or contenteditable element the key was typed in, or null.
// composedPath()[0] is the real target, even inside a shadow root (e.target is then the host).
function typingTarget(e) {
  const el = (e.composedPath && e.composedPath()[0]) || e.target;
  return el && el.nodeType === 1 && isField(el) ? el : null;
}

// Text-like <input>, <textarea>, <select> or contenteditable element.
function isField(el) {
  if (el.isContentEditable) return true;
  switch (el.tagName) {
    case 'TEXTAREA':
    case 'SELECT':
      return true;
    case 'INPUT':
      return !NON_TEXT_INPUT_TYPES.has(el.type);
  }
  return false;
}


// In link mode only lowercase letters are label input; other keys except Escape are ignored.
function handleLinkModeKey(e) {
  const keyName = e.key;
  if (keyName === 'Escape') {
    exitLinkMode();
    return;
  }
  if (!/^[a-z]$/.test(keyName)) return;

  linkModeBuffer += keyName;
  clearTimeout(linkModeTimeout);

  // Follow at once unless a longer label starts with the typed text (e.g. "a" while "aa" exists);
  // then wait a second for more letters.
  const typed = linkModeBuffer;
  const longerLabelExists = Object.keys(linkHash).some(name => name.length > typed.length && name.startsWith(typed));
  if (longerLabelExists) {
    linkModeTimeout = setTimeout(followTypedLabel, 1000);
  } else if (followTypedLabel() === 'focused') {
    // Focus moved into a field during this keydown; don't let the label letter be typed into it.
    e.preventDefault();
  }
}


// Link: follow it. Field: put the cursor in it. Anything else (button, checkbox, ...): click it.
function followTypedLabel() {
  const target = linkHash[linkModeBuffer];
  if (!target) return null;
  if (target.tagName === 'A') {
    if (!target.href) return null;
    exitLinkMode();
    window.location.href = target.href;
    return 'followed';
  }
  exitLinkMode();
  if (isField(target)) {
    target.focus();
    return 'focused';
  }
  target.click();
  return 'clicked';
}


function exitLinkMode() {
  linkMode = false;
  removeAllLinkLabels();
  resetLinkModeState();
}


// A page left in link mode would come back from the back/forward cache with its labels still
// drawn; leave it in normal mode whenever it is hidden.
window.addEventListener('pagehide', () => {
  if (linkMode) exitLinkMode();
  if (searchBar) cancelSearch();
});


// What f labels: links, buttons and form fields.
const TARGET_SELECTOR = 'a[href], button, input, textarea, select, [contenteditable], [role=button]';

function isLabelTarget(el) {
  if (el.disabled) return false;
  if (el.tagName === 'INPUT' && el.type === 'hidden') return false;
  if (el.hasAttribute('contenteditable')) {
    // Only the editor itself, not editable elements nested inside it.
    if (!el.isContentEditable) return false;
    if (el.parentElement && el.parentElement.isContentEditable) return false;
  }
  return isVisibleLink(el);
}


// Labels float above the page (absolutely positioned in <html>), so the page layout never moves.
function labelAllLinks() {
  const links = Array.from(document.querySelectorAll(TARGET_SELECTOR)).filter(isLabelTarget);

  linkLabels = links.map((link, index) => {
    const name = labelName(index);
    linkHash[name] = link;
    return createLinkLabel(name, link);
  });
  linkLabels.forEach(label => document.documentElement.appendChild(label));

  // Place each label above and after the end of its link, like a superscript, kept inside
  // the viewport. Measured after appending, since a label's size depends on its text.
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const sizes = linkLabels.map(label => ({ width: label.offsetWidth, height: label.offsetHeight }));
  linkLabels.forEach((label, i) => {
    const end = linkContentEnd(links[i]);
    const { width, height } = sizes[i];
    const left = Math.max(0, Math.min(end.right, viewportWidth - width));
    const top = Math.max(0, end.top - height * 0.75);
    label.style.setProperty('left', `${left + window.scrollX}px`, 'important');
    label.style.setProperty('top', `${top + window.scrollY}px`, 'important');
  });
}


// Rect of the last line of the link's content. A block link (e.g. in a grid cell) can be much
// wider than its text, so its own box would put the label next to the following link.
// Buttons and fields use their own box (a field's contents aren't laid out as page text).
function linkContentEnd(link) {
  const rects = link.getClientRects();
  const fallback = rects[rects.length - 1] || link.getBoundingClientRect();
  if (link.tagName !== 'A' || !document.createRange) return fallback;
  const range = document.createRange();
  range.selectNodeContents(link);
  const contentRects = range.getClientRects();
  return contentRects[contentRects.length - 1] || fallback;
}


// a ... z, aa ... zz, aaa ... (bijective base 26)
function labelName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(97 + (n - 1) % 26) + name;
  }
  return name;
}


// Rendered, non-empty, not clipped away by an ancestor, and at least partly in the viewport.
function isVisibleLink(link) {
  const rect = link.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (!link.checkVisibility({ visibilityProperty: true })) return false;
  if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return false;

  for (let el = link.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const clip = el.getBoundingClientRect();
    if (rect.right <= clip.left || rect.left >= clip.right || rect.bottom <= clip.top || rect.top >= clip.bottom) return false;
  }
  return true;
}


// Every property is set inline with !important so page CSS can't hide or restyle the label.
function createLinkLabel(name, link) {
  const linkFontSize = parseFloat(getComputedStyle(link).fontSize) || 16;
  const fontSize = Math.max(8, Math.min(14, Math.round(linkFontSize * 0.75)));

  const label = document.createElement('vimnav-label');
  label.classList.add('vimnav-label');
  label.textContent = name;
  label.style.cssText = [
    'all: initial',
    'display: block',
    'position: absolute',
    'left: 0px',
    'top: 0px',
    'z-index: 2147483647',
    'margin: 0',
    'padding: 1px 3px',
    'border: 1px solid black',
    'border-radius: 4px',
    'background: yellow',
    'color: black',
    `font: bold ${fontSize}px/1 sans-serif`,
    'white-space: nowrap',
    'visibility: visible',
    'opacity: 1',
  ].map(declaration => `${declaration} !important`).join('; ');
  return label;
}


function removeAllLinkLabels() {
  linkLabels.forEach(label => label.remove());
  linkLabels = [];
}


function resetLinkModeState() {
  clearTimeout(linkModeTimeout);
  linkModeTimeout = null;
  linkModeBuffer = '';
  linkHash = {};
}


// ---- Search with / (F-15) ----
// Matches are painted with the CSS Custom Highlight API, so the page's DOM is never changed.
// The bar lives in a shadow root (page CSS can't restyle it) and keeps the keys typed into it
// away from the page's own shortcuts.

const MAX_MATCHES = 10000;
const SKIPPED_TEXT_PARENTS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION', 'VIMNAV-LABEL', 'VIMNAV-SEARCH']);

let searchBar = null; // { host, input, count, origin, previous } while the bar is open
let lastQuery = ''; // last submitted query, recalled with Up
let searchMatches = []; // Ranges of the last search
let searchIndex = -1; // current match


function openSearchBar() {
  if (searchBar) {
    searchBar.input.focus();
    return;
  }
  const host = document.createElement('vimnav-search');
  host.style.cssText = ['all: initial', 'display: block', 'position: fixed', 'left: 0', 'right: 0', 'bottom: 0', 'z-index: 2147483647']
    .map(declaration => `${declaration} !important`).join('; ');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .bar { display: flex; align-items: center; gap: 8px; padding: 4px 8px; background: #222; color: #eee;
           font: 14px/1.4 sans-serif; border-top: 1px solid #555; }
    .slash { font-weight: bold; }
    input { flex: 1; min-width: 0; margin: 0; padding: 2px 6px; background: #111; color: #fff;
            border: 1px solid #555; border-radius: 3px; font: inherit; outline: none; }
    .count { white-space: nowrap; color: #bbb; }`;
  const barEl = document.createElement('div');
  barEl.className = 'bar';
  const slash = document.createElement('span');
  slash.className = 'slash';
  slash.textContent = '/';
  const input = document.createElement('input');
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search the page');
  const count = document.createElement('span');
  count.className = 'count';
  barEl.append(slash, input, count);
  root.append(style, barEl);

  // Stop keys here so neither the page's shortcuts nor VimNav's own commands see them.
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submitSearch();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelSearch();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (lastQuery) {
        input.value = lastQuery;
        runSearch();
      }
    }
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
  input.addEventListener('keypress', (e) => e.stopPropagation());
  input.addEventListener('input', runSearch);

  searchBar = {
    host,
    input,
    count,
    origin: { x: window.scrollX, y: window.scrollY },
    previous: { matches: searchMatches, index: searchIndex },
  };
  hideSearchHighlights();
  document.documentElement.appendChild(host);
  input.focus();
}


function closeSearchBar() {
  searchBar.host.remove();
  searchBar = null;
}


// Escape in the bar: back to how things were before /, including the previous search for n/N.
function cancelSearch() {
  const { origin, previous } = searchBar;
  closeSearchBar();
  hideSearchHighlights();
  searchMatches = previous.matches;
  searchIndex = previous.index;
  window.scrollTo({ left: origin.x, top: origin.y, behavior: 'instant' });
}


// Enter: keep the current match highlighted and selected; n/N continue from it.
function submitSearch() {
  const query = searchBar.input.value;
  if (!query) {
    cancelSearch();
    return;
  }
  lastQuery = query;
  closeSearchBar();
  if (searchMatches.length) selectCurrentMatch();
}


function runSearch() {
  const query = searchBar.input.value;
  searchMatches = query ? findMatches(query) : [];
  if (!searchMatches.length) {
    searchIndex = -1;
    hideSearchHighlights();
    searchBar.count.textContent = query ? 'no match' : '';
    return;
  }
  searchIndex = firstMatchAfter(searchBar.origin.y);
  showSearchHighlights();
  scrollToCurrentMatch();
  updateSearchCount();
}


function stepSearch(direction) {
  if (!searchMatches.length) return;
  const n = searchMatches.length;
  searchIndex = (searchIndex + direction + n) % n;
  showSearchHighlights();
  scrollToCurrentMatch();
  selectCurrentMatch();
}


function updateSearchCount() {
  if (searchBar) searchBar.count.textContent = `${searchIndex + 1} / ${searchMatches.length}`;
}


// Plain text; smartcase: case-insensitive unless the query has an uppercase letter.
function findMatches(query) {
  const caseSensitive = query !== query.toLowerCase();
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
  const nodes = visibleTextNodes();
  const starts = [];
  let text = '';
  for (const node of nodes) {
    starts.push(text.length);
    text += node.data;
  }

  // Text position -> (text node, offset); a match may span several nodes.
  const locate = (pos, isEnd) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] < pos || (!isEnd && starts[mid] === pos)) lo = mid;
      else hi = mid - 1;
    }
    return { node: nodes[lo], offset: pos - starts[lo] };
  };

  const matches = [];
  let m;
  while ((m = pattern.exec(text)) && matches.length < MAX_MATCHES) {
    const start = locate(m.index, false);
    const end = locate(m.index + m[0].length, true);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    matches.push(range);
  }
  return matches;
}


// Text nodes the user can see: not in hidden elements, collapsed <details>, scripts or styles.
function visibleTextNodes() {
  const visible = new Map();
  const isVisible = (el) => {
    if (!visible.has(el)) visible.set(el, el.checkVisibility({ visibilityProperty: true }));
    return visible.get(el);
  };
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement;
      if (!el || SKIPPED_TEXT_PARENTS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
      return isVisible(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}


// Index of the first match at or below page position y; the first match if none is.
function firstMatchAfter(y) {
  const i = searchMatches.findIndex(range => range.getBoundingClientRect().top + window.scrollY >= y);
  return i === -1 ? 0 : i;
}


function scrollToCurrentMatch() {
  const range = searchMatches[searchIndex];
  const bottom = window.innerHeight - (searchBar ? searchBar.host.offsetHeight : 0);
  const inView = (r) => r.top >= 0 && r.bottom <= bottom && r.left >= 0 && r.right <= window.innerWidth;
  let rect = range.getBoundingClientRect();
  if (inView(rect)) return;
  const dx = rect.left < 0 || rect.right > window.innerWidth ? rect.left - window.innerWidth / 2 : 0;
  window.scrollBy({ left: dx, top: rect.top - bottom / 2, behavior: 'instant' });
  rect = range.getBoundingClientRect();
  // Still out of view: it's inside an element that scrolls on its own.
  if (!inView(rect)) range.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
}


function selectCurrentMatch() {
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(searchMatches[searchIndex].cloneRange());
}


function showSearchHighlights() {
  if (!window.CSS?.highlights || typeof Highlight === 'undefined') return;
  addSearchHighlightStyle();
  const all = new Highlight();
  for (const range of searchMatches) all.add(range);
  const current = new Highlight(searchMatches[searchIndex]);
  current.priority = 1;
  CSS.highlights.set('vimnav-search', all);
  CSS.highlights.set('vimnav-search-current', current);
}


function hideSearchHighlights() {
  if (!window.CSS?.highlights) return;
  CSS.highlights.delete('vimnav-search');
  CSS.highlights.delete('vimnav-search-current');
}


function addSearchHighlightStyle() {
  if (document.getElementById('vimnav-search-style')) return;
  const style = document.createElement('style');
  style.id = 'vimnav-search-style';
  style.textContent = `
    ::highlight(vimnav-search) { background-color: #ffeb3b; color: black; }
    ::highlight(vimnav-search-current) { background-color: #ff9632; color: black; }`;
  document.documentElement.appendChild(style);
}
