if (window.__vimNavActive) throw new Error('VimNav already active');
window.__vimNavActive = true;

let enabled = true;
let lastKey = null;

// link mode state
let linkMode = false;
let linkHash = {};
let linkLabels = [];
let linkModeBuffer = '';
let linkModeTimeout = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'setEnabled') enabled = msg.value;
});

document.addEventListener('keydown', (e) => {
  if (!enabled) return;

  // Leave typing in fields and browser/page shortcuts (Ctrl, Cmd, Alt) alone. Shift is fine: G, H, L.
  if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e)) {
    lastKey = null; // so a g here and a g after it are not gg
    return;
  }

	const SCROLL_STEP = 50;
	const keyName = e.key;

  if (linkMode) {
    handleLinkModeKey(keyName);
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
		}
  }

	lastKey = {
		key: e.key,
		timeStamp: e.timeStamp
	};

});


// Input types that don't take typed text; any other <input> type does.
const NON_TEXT_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image', 'hidden']);

// True when the key was typed in a text field, <select> or contenteditable element.
// composedPath()[0] is the real target, even inside a shadow root (e.target is then the host).
function isTypingTarget(e) {
  const el = (e.composedPath && e.composedPath()[0]) || e.target;
  if (!el || el.nodeType !== 1) return false;
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
function handleLinkModeKey(keyName) {
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
  } else {
    followTypedLabel();
  }
}


function followTypedLabel() {
  const url = linkHash[linkModeBuffer];
  if (url && url.length > 0) {
    exitLinkMode();
    window.location.href = url;
  }
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
});


// Labels float above the page (absolutely positioned in <html>), so the page layout never moves.
function labelAllLinks() {
  const links = Array.from(document.querySelectorAll('a[href]')).filter(isVisibleLink);

  linkLabels = links.map((link, index) => {
    const name = labelName(index);
    linkHash[name] = link.href;
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
function linkContentEnd(link) {
  const rects = link.getClientRects();
  const fallback = rects[rects.length - 1] || link.getBoundingClientRect();
  if (!document.createRange) return fallback;
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
