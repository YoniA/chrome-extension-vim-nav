let lastKey = null;

document.addEventListener('keydown', (e) => {
	const SCROLL_STEP = 50;
	const keyName = e.key;

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
	}

	lastKey = {
		key: e.key,
		timeStamp: e.timeStamp
	};

});
