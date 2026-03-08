if (window.__vimNavActive) throw new Error('VimNav already active');
window.__vimNavActive = true;

let enabled = true;
let lastKey = null;

// link mode state
let linkMode = false;
let linkHash = {};
let linkModeBuffer = '';
let linkModeTimeout = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'setEnabled') enabled = msg.value;
});

document.addEventListener('keydown', (e) => {
  if (!enabled) return;

	const SCROLL_STEP = 50;
	const keyName = e.key;

  if (linkMode) {
    linkModeBuffer += keyName;
    clearTimeout(linkModeTimeout);
    linkModeTimeout = setTimeout(() => {
      const url = linkHash[linkModeBuffer];
      if (url && url.length > 0) {
        window.location.href = url;
        resetLinkModeState();
      }
    }, 1000);
  }

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
      if (!linkMode) {
        linkMode = true;
        labelAllLinks();
      }
      break;
    case 'Escape':
      if (linkMode) {
        linkMode = false;
        hideAllLinkLabels();
        resetLinkModeState();
      }
      break;
	}

	lastKey = {
		key: e.key,
		timeStamp: e.timeStamp
	};

});



function labelAllLinks() {
    Array.from(document.getElementsByTagName('a')).forEach((link, index) => {
      const url = link.href;
      linkHash[index] = url;

      const label = document.createElement('span');
      label.classList.add('link-label');
      label.textContent = `${index}`;
      label.style = 'background-color: yellow; border: 1px solid black; border-radius: 5px';
      link.parentNode.insertBefore(label, link.nextSibling);
    });
}


function hideAllLinkLabels() {
  Array.from(document.getElementsByClassName('link-label')).forEach(label => label.style = 'display: none');
}


function resetLinkModeState() {
  clearTimeout(linkModeTimeout);
  linkModeTimeout = null;
  linkModeBuffer = '';
  linkHash = {};
}
