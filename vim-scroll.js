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
        hideAllLinkLabels();
        window.location.href = url;
        resetLinkModeState();
      }
    }, 400);
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



ALPHABET = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"]

function maxLabelLength(numLinks) {
    let i = 1;
    keyspace = ALPHABET.length;
    while(numLinks > Math.pow(ALPHABET.length, i)) {
        i += 1;
        keyspace += Math.pow(ALPHABET.length, i);
    }

    return i;
}


function enumerateKeyspace(keyLength) {
    const labels = [];
    const keyspace = Math.pow(ALPHABET.length, keyLength);

    for(let k=0; k < keyspace; k++) {
        let key = ALPHABET[k % ALPHABET.length];
        for(let i=1; i < keyLength; i++) {
            key = ALPHABET[Math.floor(k / Math.pow(ALPHABET.length, i)) % ALPHABET.length] + key
        }

        labels.push(key);
    }
    return labels;
}


function generateLabels(numLinks) {
    let labels = [];
    const maxLength = maxLabelLength(numLinks);

    for(let i = 1; i<= maxLength; i++) {
        labels = labels.concat(enumerateKeyspace(i));
    }

    return labels;
}


function lableAllLinks() {
    const links = Array.from(document.getElementsByTagName('a'));
	  const labels = generateLabels(links.length);

    Array.from(document.getElementsByTagName('a')).forEach((link, index) => {
          const url = link.href;
          // linkHash[index] = {url:url, label: labels[index]};
          linkHash[labels[index]] = url;

        
          
          const label = document.createElement('span');
          label.classList.add(`link-label`);
          label.textContent = `${labels[index]}`;
          label.style='font-size: 0.7em; vertical-align: super; color: black !important; background-color: yellow; padding: 0 2px; border: 1px solid black';
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
