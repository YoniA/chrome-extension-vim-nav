let lastKey = null;

// link mode state
let linkMode = false;
let linkHash = {}
let linkModeBuffer = '';

document.addEventListener('keydown', (e) => {
	const SCROLL_STEP = 50;
	const keyName = e.key;

  if (linkMode) {
    linkModeBuffer += keyName;
    setTimeout(() => {
      const url = linkHash[linkModeBuffer];
      if (url && url.length > 0) {
        window.location.href = url;
        resetLinkModeStat();
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
        lableAllLinks();
      }
      break;
    case 'Escape':
      if(linkMode != false) {
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



function lableAllLinks() {
    const links = document.querySelector('a');

    Array.from(document.getElementsByTagName('a')).forEach((link, index) => {
          const url = link.href;
          linkHash[index] = url;

        
          
          const label = document.createElement('span');
          label.classList.add(`link-label`);
          label.textContent = `${index}`;
          label.style='background-color: yellow; border: 1px solid black; border-radius: 5px';
          link.parentNode.insertBefore(label, link.nextSibling);
          
        });

    console.table(linkHash);
}


function hideAllLinkLabels() {
  Array.from(document.getElementsByClassName('link-label')).forEach(label => label.style = 'display: none');
}


function resetLinkModeState() {
  linkModeBuffer = '';
  linkHash = {};
}
