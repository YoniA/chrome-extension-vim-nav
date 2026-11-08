# Backlog

Statuses: proposed · ready · in-progress · done
Priorities: P1 (now) · P2 (next) · P3 (later)

Current focus (branch `stabilize`): stabilize the project, fix bugs, test existing features, and prepare for incremental improvements. Priorities marked "(proposed)" await approval; the others are approved.

Branch `fix-labels` (in scope, per project owner decisions): F-1 (letter label sequence), F-12 (label appearance), B-12 (label only visible links, without shifting layout).

## In progress

## Ready

### F-1 Letter link labels
Type: feature · Priority: P2 · Status: ready

As a keyboard user, I want link labels made of letters instead of numbers, so that I can type them without leaving the home row.

Acceptance criteria:
- [ ] Labels use lowercase letters only (`a`–`z`); no digits, uppercase letters or other characters.
- [ ] Labels are assigned to labeled links in document order, in the sequence a…z, then aa, ab … zz, then aaa, aab … zzz, and so on (bijective base-26).
- [ ] Examples: link 1 is `a`, 26 is `z`, 27 is `aa`, 52 is `az`, 53 is `ba`, 702 is `zz`, 703 is `aaa`, 18278 is `zzz`, 18279 is `aaaa`.
- [ ] The sequence has no upper limit: past `zzz` it continues `aaaa`, `aaab` … and longer as needed, so every labeled link gets a label however many links the page has.
- [ ] Labels are unique within one link-mode session for any number of links (e.g. a test with tens of thousands of links finds no duplicates).
- [ ] When the typed letters match a label and no longer label starts with them, that link is followed immediately (e.g. on a page with 26 or fewer labels, every label opens at once).
- [ ] When the typed letters match a label that also starts a longer label (e.g. `a` while `aa` exists), the link is followed 1000 ms after the last letter unless another letter is typed first.
- [ ] Typing `a` then `a` less than 1000 ms apart follows the link labeled `aa` (immediately, if no longer label starts with `aa`), not the one labeled `a`.
- [ ] Only lowercase input matches labels. An uppercase letter typed in link mode (with Shift or Caps Lock) is ignored: it does not match a label and is not added to the typed label.
- [ ] With label `a` present, typing `A` and waiting 1000 ms follows nothing; typing `A` then `a` follows the link labeled `a`.
- [ ] Label letters do not trigger normal commands while in link mode.
- [ ] Label sequence generation is covered by automated tests, including the examples above.

Notes: Sequence and lowercase-only matching decided by the project owner (branch `fix-labels`). Because `a` is a prefix of `aa`, a 1 s wait remains only for labels that start a longer label; the project owner chose to open all other labels immediately. F-2 (prefix-free labels) was not chosen. Depends on B-10 and C-4 (not yet done). Which links are labeled (visible links only, so the first visible link is `a`): B-12. Appearance of labels: F-12.

### F-12 Link label appearance
Type: feature · Priority: P2 · Status: ready

As a keyboard user, I want each link label to look like a small, highlighted tag above its link, so that I can spot labels quickly and see which link each belongs to.

Acceptance criteria:
- [ ] Each label is shown above and after its link like a superscript: its left edge is at the right end of the link's last line, and it is raised so that at most 25% of its height overlaps the link's text.
- [ ] Labels stay fully inside the viewport: near the top or right edge a label moves inward (and only then may cover part of its link).
- [ ] Label text is smaller than the text of its link.
- [ ] Each label has a yellow background.
- [ ] Each label has rounded corners.
- [ ] Labels are readable on any page: on a page with a dark background, a page with a light/yellow background, and a page whose CSS restyles generic elements (e.g. all `span`s), labels still show legible text on a yellow background with rounded corners.

Notes: Project owner requirement (branch `fix-labels`). Labels must not shift the page layout; that is tracked in B-12 and should be checked together. The current 1px black border (F-7) is neither required nor forbidden by this item. Related: F-1.

### B-12 Label only visible links, without shifting layout
Type: bug · Priority: P2 (proposed) · Status: ready

Current behavior: Labels are inserted into the page next to each link, which pushes content around and can break layouts. Every `<a>` element is labeled, including hidden, off-screen and href-less ones, so labels grow long and many are useless.
Expected behavior: When link mode starts, only links visible in the viewport get labels, and showing or removing labels never moves page content.

Acceptance criteria:
- [ ] When link mode starts, a link fully inside the viewport and visible gets a label.
- [ ] Links with `display: none`, `visibility: hidden`, or zero width or height (themselves or through an ancestor) get no label.
- [ ] `<a>` elements without an `href` attribute get no label.
- [ ] Links fully outside the viewport (scrolled out of view above, below, left or right) get no label.
- [ ] Which links are labeled is decided when link mode starts. Scrolling during link mode does not add labels.
- [ ] F-1 labels go to the labeled (visible) links only, in document order: the first visible link is `a`, the second `b`, and so on. Hidden, href-less and off-screen links do not use up labels.
- [ ] While labels are shown, every page element keeps the position and size it had before link mode started.
- [ ] The page's scrollable width and height and the scroll position are the same before link mode, while labels are shown, and after the labels are removed (Escape or following a same-page link).

Notes: Project owner decision (branch `fix-labels`). Split from the original B-12. Partial visibility, covered links, placeholder hrefs and non-link elements are in B-16. Label look: F-12. Removing labels relies on B-8/B-9 (currently Escape only hides them). The criterion that scrolling adds no labels follows from "at the moment link mode starts" in the owner's decision.

### F-13 Close the current tab with x
Type: feature · Priority: P3 · Status: done

As a user, I want to close the current (active) tab by pressing `x`, so that I can close pages without the mouse or browser shortcuts.

Acceptance criteria:
- [x] While VimNav is ON in the active tab, pressing lowercase `x` closes that tab, with no confirmation prompt.
- [x] Only the active tab closes; other tabs and windows are unchanged.
- [x] If it is the last tab in its window, `x` closes it, which closes the window (same as Cmd/Ctrl+W).
- [x] On a pinned tab, `x` does nothing and the tab stays open.
- [x] Holding `x` down closes only one tab: repeated keydowns from key auto-repeat are ignored, including in the tab that becomes active next.
- [x] While VimNav is OFF, pressing `x` does nothing and the tab stays open.
- [x] Uppercase `X` (Shift or Caps Lock) does not close the tab; it reopens the last closed tab (F-14).

Notes: Requested by the project owner, who also answered its open questions. Not part of branch `fix-labels`. Must not ship before B-1, B-2 and B-10: `x` must not close the tab while typing in text fields (B-1), with Ctrl/Cmd/Alt held, e.g. Cmd/Ctrl+X cut (B-2), or when typed as label input in link mode (B-10, F-1). "ON" means commands actually work in that tab (B-3, B-4). Reopen with `X`: F-14.

Done: `x` asks the service worker, which closes the tab the key was pressed in with `tabs.remove` (no new permission), unless it is pinned. Auto-repeat keydowns are ignored. Tests: `tests/close-tab.test.js`, `tests/e2e/f13-close-tab.test.js`. Closing a window's last tab is Chrome's own `tabs.remove` behavior and is not tested separately.

### F-14 Reopen the last closed tab with X
Type: feature · Priority: P3 (proposed) · Status: ready

As a user, I want to reopen the most recently closed tab by pressing `X`, so that I can undo closing a tab (including with `x`, F-13).

Acceptance criteria:
- [ ] While VimNav is ON in the active tab, pressing uppercase `X` (Shift+x or Caps Lock) reopens the most recently closed tab, as in Vimium.
- [ ] "Most recently closed" covers any tab the user closed, however it was closed (`x`, Cmd/Ctrl+W, mouse), not only tabs closed with `x`.
- [ ] If the most recent thing closed was a whole window (e.g. `x` on its last tab), `X` reopens that window, same as Chrome's Cmd/Ctrl+Shift+T.
- [ ] Pressing `X` again reopens the next most recently closed tab or window, and so on.
- [ ] Holding `X` down reopens only one tab or window: repeated keydowns from key auto-repeat are ignored, as in F-13.
- [ ] With nothing to reopen, `X` does nothing.
- [ ] While VimNav is OFF, `X` does nothing.
- [ ] `X` never closes a tab.

Notes: Project owner decisions; split from F-13 to keep both items small. Not part of branch `fix-labels`. Same constraints as F-13: must not ship before B-1, B-2 and B-10.

### F-15 Search the page with /
Type: feature · Priority: P3 · Status: done

As a keyboard-only user, I want to press `/`, type text and jump between its matches on the page, so that I can find things without the mouse or Chrome's find bar.

Acceptance criteria:
- [x] With VimNav ON, `/` opens a small search bar at the bottom of the page with the cursor in it; the `/` itself is not typed into the bar.
- [x] With VimNav OFF, `/` does nothing.
- [x] Each `/` opens the bar empty. Pressing the Up arrow in the bar fills in the previous query.
- [x] While the bar is open, typed keys go into the bar and run no VimNav command (e.g. typing `j` does not scroll).
- [x] As the user types, all matches are highlighted, and the page scrolls to the first match after the scroll position when `/` was pressed.
- [x] The bar shows a "current / total" counter (e.g. "3 / 17") while there are matches.
- [x] With no match, the bar shows "no match" and the page does not move.
- [x] Smartcase: a query with no uppercase letter matches case-insensitively ("foo" matches "Foo" and "FOO"); a query with an uppercase letter matches case-sensitively ("Foo" matches "Foo" only).
- [x] The query is plain text: characters such as `.`, `*` or `(` match themselves, not as regular-expression syntax.
- [x] Only visible text is searched: text in hidden elements (e.g. `display: none`) or collapsed content (e.g. a closed `<details>`) is not matched.
- [x] Enter closes the bar and keeps the current match selected and highlighted.
- [x] After a search, `n` jumps to the next match and `N` to the previous one; after the last match `n` wraps to the first, and before the first `N` wraps to the last.
- [x] Before any search, `n` and `N` do nothing.
- [x] Escape in the bar cancels: the bar closes, highlights are removed, and the page returns to the scroll position it had when `/` was pressed.
- [x] Escape after a search (bar closed) clears the highlights.
- [x] After Escape has cleared the highlights, `n`/`N` still jump to matches of the last search and bring the highlights back (like Vim's `:noh`).
- [x] Chrome's own Cmd/Ctrl+F find bar is unaffected.

Notes: Owner-approved behavior, including answers to its open questions; not part of branch `fix-labels`. Depends on B-1 (keys typed in the search bar must not trigger commands) and B-2 (modifier combos, including Cmd/Ctrl+F). `n`/`N` are currently unused. In link mode `/`, `n` and `N` count as label input (B-10). On sites that use `/` themselves (e.g. GitHub, YouTube), the conflict is B-14. Up arrow recalls only the previous query; a longer query history is not part of this item.

## Proposed

Done: matches are painted with the CSS Custom Highlight API (the page's DOM is not changed); the bar is in a shadow root at the bottom of the viewport and keeps typed keys from the page's shortcuts. A match may span elements. A cancelled search keeps the previous one for `n`/`N`; turning VimNav OFF or leaving the page closes the bar. Not covered: text inside other shadow roots, iframes and form field values; at most 10000 matches. Tests: `tests/search.test.js`, `tests/e2e/f15-search.test.js`.

### B-1 Commands fire while typing in text fields
Type: bug · Priority: P1 · Status: done

Current behavior: The keydown handler does not check where the key was typed. Typing in an input, textarea or contenteditable element scrolls the page (`j`/`k`/`h`/`l`), `f` enters link mode, and `H`/`L` navigate history, which can lose what the user typed.
Expected behavior: While focus is in an editable element, VimNav ignores keys and the user types normally.
Steps to reproduce: Enable VimNav, focus a search box, type "hello" (the `h` and `l` scroll), or type "H" (the page goes back).

Acceptance criteria:
- [x] Typing in `<input>` (text-like types), `<textarea>`, `<select>` and contenteditable elements triggers no VimNav command.
- [x] Typed characters appear in the field unchanged.
- [x] After focus leaves the field (e.g. click on the page body), commands work again.

- [x] Escape in a field takes focus out of it (blur), so navigation keys work again without the mouse. The Escape still reaches the page (e.g. to close its autocomplete). Ctrl/Cmd/Alt+Escape does not blur.

Notes: Escape-to-leave-the-field decided by the project owner.
Done: keys are ignored when typed in a text-like `<input>` (all types except checkbox, radio, button, submit, reset, range, color, file, image, hidden), `<textarea>`, `<select>` or a contenteditable element, including inputs inside shadow roots. A `g` in a field never pairs with a `g` outside it as `gg`. Escape blurs the field. Tests: `tests/key-filtering.test.js`, `tests/e2e/b1-b2-key-filtering.test.js`.

### B-2 Modifier shortcuts trigger VimNav commands
Type: bug · Priority: P1 · Status: done

Current behavior: The handler matches only `e.key` and ignores Ctrl/Cmd/Alt. Cmd/Ctrl+L (focus address bar) also scrolls right; Cmd/Ctrl+F (find) also enters link mode; Ctrl+J/K etc. also scroll.
Expected behavior: Key combinations with Ctrl, Cmd (Meta) or Alt are left to the browser/page and do not run VimNav commands.
Steps to reproduce: Enable VimNav on a wide page, press Cmd+F: link labels appear alongside the find bar.

Acceptance criteria:
- [x] With Ctrl, Meta or Alt held, no VimNav command runs (including during link mode).
- [x] Shift-based commands (`G`, `H`, `L`) still work.
- [x] Browser shortcuts such as Cmd/Ctrl+F and Cmd/Ctrl+L behave as they do without the extension.

Done: with Ctrl, Meta or Alt held, keys run nothing, in normal and link mode (a modifier+letter is not label input), and are not prevented. Tests: `tests/key-filtering.test.js`, `tests/e2e/b1-b2-key-filtering.test.js`.

### B-3 Auto-enable on new tabs and navigation probably does not work
Type: bug · Priority: P1 · Status: done

Current behavior: background.js injects the content script on `tabs.onCreated` and on every `webNavigation.onDOMContentLoaded` when the stored state is ON. The manifest grants only `activeTab` (no host permissions), which applies only to a tab after the user clicks the icon, so these injections are expected to fail on most pages. Rejections are not caught, so failures show up only in the service worker console; the badge may say ON while keys do nothing.
Expected behavior: Not yet defined — see open questions. At minimum, the badge must never say ON for a tab where commands do not work.
Steps to reproduce (needs manual verification): Turn VimNav ON in one tab, open a new tab and load a different site, press `j`.

Acceptance criteria:
- [x] Verified by hand and documented: whether commands work after (a) opening a new tab, (b) navigating the current tab to another origin, (c) navigating within the same origin, (d) reloading.
- [x] For each case, the badge matches whether commands actually work.
- [x] No uncaught errors from injection appear in the service worker console.

Notes: `onDOMContentLoaded` also fires for iframes and the handler does not check `frameId`, so it may try to inject into the main frame repeatedly (the script then throws "VimNav already active"); include this in the verification. Open questions: Should VimNav run automatically on all sites (which requires broader site access that users must accept at install), or only on tabs where the user clicked the icon? Related: B-4, C-5.

Done: Project owner decision: VimNav runs on all sites with one global on/off switch, ON after a fresh install. The manifest loads vim-scroll.js into every page (`content_scripts`, `<all_urls>`, `document_start`); each page follows `extensionState` in sync storage, at load and live through `storage.onChanged`. The service worker only flips the state on an icon click and shows it on one global badge. No injection, so `activeTab`, `scripting`, `tabs` and `webNavigation` were removed. Commands work in new tabs, after navigation and after reload without clicking the icon. Limit: Chrome blocks extensions on `chrome://` pages and the Web Store, where the global badge still says ON (B-5). Tabs open before VimNav is installed or reloaded need one page reload. Tests: `tests/integration.test.js`, `tests/e2e/b3-b4-global-switch.test.js`.

### B-4 On/off state is inconsistent across tabs
Type: bug · Priority: P1 · Status: done

Current behavior: The state is saved globally in `storage.sync`, but clicking the icon reads and sets only the current tab's badge and messages only the current tab. Other open tabs keep their old badge and behavior, and the next click in another tab toggles based on that tab's badge, not the stored state.
Expected behavior: Not yet defined — see open questions. Whatever the model, the badge in every tab shows the state that actually applies there, and a click always produces the opposite of what the badge showed.
Steps to reproduce: Open tabs A and B, enable in A (A shows ON), switch to B (badge OFF, but storage says ON), click: B turns ON and storage stays ON; return to A and click: A turns OFF and storage is OFF while B still shows ON.

Acceptance criteria:
- [x] Behavior matches the decided model (global or per-tab) in every open tab, without reloading.
- [x] The badge in each tab always matches whether commands work in that tab.
- [x] Toggling in one tab never leaves another tab showing a state that differs from its actual behavior.

Notes: Open question: should on/off be a single global switch (all tabs) or per tab? Depends on the B-3 decision.

Done: See B-3 for the design. A click in any tab flips the one switch; every open tab follows at once without reloading, and turning OFF also leaves link mode. Tests: `tests/background.test.js`, `tests/content-toggle.test.js`, `tests/integration.test.js`, `tests/e2e/b3-b4-global-switch.test.js`.

### C-4 Automated test setup for pure logic
Type: chore · Priority: P1 (proposed) · Status: proposed

As a developer, I want automated tests for key handling and label generation, so that bug fixes and new features can be verified and do not regress.

Acceptance criteria:
- [ ] Tests run with Node's built-in test runner and no installed dependencies, using one documented command.
- [ ] Key-handling logic (which key/modifier/target combinations trigger which command, `gg` timing, link-mode input) is testable without a browser and has tests.
- [ ] Link-label generation is testable without a browser and has tests.
- [ ] The extension still loads unpacked and behaves the same after the logic is separated out.

Notes: Enables test-first fixes for B-1, B-2, B-7, B-10 and F-1. Command documented in C-2. Current behavior to cover is specified in Done items F-3 to F-9 (key handling, labels) and F-10/F-11 (toggle, state).

### B-5 Errors when clicking the icon where the script cannot run
Type: bug · Priority: P2 (proposed) · Status: proposed

Current behavior: On pages where content scripts cannot run (e.g. `chrome://` pages, Chrome Web Store), clicking the icon to turn ON sets the badge to ON, then injection throws an uncaught error. Turning OFF on a tab where the script was never loaded calls `sendMessage` without handling the "no receiver" rejection.
Expected behavior: No uncaught errors; the badge never claims ON on a page where VimNav cannot run.
Steps to reproduce: Open `chrome://extensions`, click the VimNav icon, check the service worker console.

Acceptance criteria:
- [ ] Clicking the icon on a restricted page produces no uncaught errors in the service worker console.
- [ ] On a restricted page the badge does not show ON after the click.
- [ ] Turning OFF on a tab where the script was never loaded produces no uncaught errors.

Notes: Open question: should the user get any indication that VimNav cannot run on this page beyond the badge? Related: B-4.

### B-6 Extension resets to OFF on every update or reload
Type: bug · Priority: P2 · Status: done

Current behavior: `runtime.onInstalled` sets the state to OFF without checking the reason, so it also runs on extension updates, unpacked reloads and Chrome updates.
Expected behavior: The state is set to OFF only on first install; after an update or reload the user's saved state is kept.

Acceptance criteria:
- [x] On first install the state is OFF.
- [x] After reloading the unpacked extension (or an update), the previously saved state is unchanged.

Notes: Whether the badge/script in already-open tabs reflects the kept state after a reload depends on B-3/B-4.

Done: Install and update keep the stored state; nothing stored means ON. Tests: `tests/background.test.js`.

### B-7 Link mode: a mistyped label blocks later attempts
Type: bug · Priority: P2 (proposed) · Status: proposed

Current behavior: If the typed label matches no link, the 1 s timeout does nothing and the buffer is never cleared. Every later keystroke is appended to the wrong text, so no link can be followed until Escape.
Expected behavior: After a label that matches nothing, the input is cleared and the user can type a label again.
Steps to reproduce: Press `f`, type a number that is not a label, wait 1 s, type a valid label: nothing happens.

Acceptance criteria:
- [ ] After an unmatched label times out, the next typed label is matched on its own.
- [ ] Typing a valid label after a mistake follows the correct link.

Notes: Open question: after a mistake, stay in link mode (labels visible) or exit link mode?

### B-8 Link mode stays on after following a same-page link
Type: bug · Priority: P2 · Status: done

Fixed (branch `fix-back-forward-link-mode`): following a label leaves link mode and removes its labels before navigating.

Current behavior: After a link is followed, only the buffer and link list are cleared; link mode stays on and labels stay visible. If the page does not reload (`#anchor` links, single-page app routes), the user is left with visible labels that no longer work, and `f` does nothing until Escape is pressed.
Expected behavior: Following a link always exits link mode and removes the labels.
Steps to reproduce: On a page with a `#section` link, press `f`, type its label, wait: the page jumps but labels remain.

Acceptance criteria:
- [ ] After following any link, no labels remain and link mode is off.
- [ ] Normal commands (`j`, `k`, `f`, ...) work immediately afterwards.

Notes: Related: B-9, B-15.

### B-9 Link mode: labels accumulate in the page
Type: bug · Priority: P2 (proposed) · Status: proposed

Current behavior: Escape only hides labels (`display: none`) and never removes them; each `f` adds a new set. Repeated `f`/Escape keeps growing the page.
Expected behavior: Leaving link mode removes all labels; each `f` shows exactly one label per labeled link.

Acceptance criteria:
- [ ] After `f` then Escape, no VimNav label elements remain in the page.
- [ ] After repeating `f`/Escape N times, entering link mode shows one label per link (not N).

### B-10 Link mode: other commands and non-label keys interfere
Type: bug · Priority: P2 (proposed) · Status: proposed

Current behavior: In link mode, every key still runs its normal command (`j`/`k` scroll, `H` goes back, etc.) as well as being added to the label input. Non-character keys like Shift, Tab or arrow keys are also appended to the label input, so a label typed with them never matches.
Expected behavior: In link mode, keys are used only for typing labels or leaving link mode; normal commands do not run.

Acceptance criteria:
- [ ] In link mode, `j`, `k`, `h`, `l`, `G`, `gg`, `H`, `L` do not scroll or navigate.
- [ ] Pressing Shift, Tab, arrows or other non-character keys does not change the typed label.
- [ ] Escape exits link mode.

Notes: Required before F-1 (letter labels would collide with command keys). Open question: what should keys that cannot be part of any label do in link mode (ignore, or exit link mode)?

### B-11 Link mode ignores target=_blank and site click handlers
Type: bug · Priority: P2 (proposed) · Status: proposed

Current behavior: Links are followed by setting `location.href` to the link's URL, so `target="_blank"` links open in the same tab, and sites that handle clicks with scripts (SPA routers, tracking, buttons styled as links) behave differently from a real click.
Expected behavior: Following a link behaves as if the user clicked it.

Acceptance criteria:
- [ ] A `target="_blank"` link followed in link mode opens in a new tab, as a click would.
- [ ] A link with a script click handler triggers that handler (e.g. an SPA route changes without a full reload).
- [ ] A normal link navigates as before.

Notes: Open question: should there be a way to deliberately open a link in a new tab (e.g. a separate key)? If yes, that is a new feature item.

### B-16 Link mode: labeling edge cases not covered by B-12
Type: bug · Priority: P3 (proposed) · Status: proposed

Split from B-12. B-12 (branch `fix-labels`) labels only visible links with an href and stops labels from shifting layout. These remaining cases are undecided.

Acceptance criteria:
- [ ] To be written once the open questions are decided.

Notes: Open questions: Does a link only partly inside the viewport get a label? Does a link that is in the viewport but covered by another element (e.g. an overlay or sticky header) get a label? Do links with a placeholder destination (`href=""`, `href="#"`, `javascript:` URLs) get labels? Clickable non-link elements: buttons and fields are labeled since F-16. Depends on B-12.

### B-13 Scroll commands don't work on pages with an inner scrolling element
Type: bug · Priority: P3 (proposed) · Status: proposed

Current behavior: All scroll commands scroll the window only, and `G`/`gg` use `document.body.scrollHeight` as the distance. On pages where the main content scrolls inside another element (many web apps), `j`/`k`/`G`/`gg` do nothing; on pages whose body height is constrained, `G` may not reach the bottom.
Expected behavior: Scroll commands scroll the content the user is looking at, and `G`/`gg` reach the very bottom/top.

Acceptance criteria:
- [ ] On a normal document page, `G` reaches the bottom and `gg` the top.
- [ ] On a page whose body height is set to 100% with the document scrolling, `G` reaches the bottom.
- [ ] On a page where the main content scrolls in an inner element, `j`/`k`/`G`/`gg` scroll that element.

Notes: Needs a list of real example sites for manual verification (C-5). Open question: when several elements scroll, which one should be scrolled?

### B-14 Keys trigger both the page's and VimNav's shortcuts
Type: bug · Priority: P3 (proposed) · Status: proposed

Current behavior: VimNav does not stop keys from reaching the page, so on sites with their own shortcuts both act (e.g. YouTube: `f` toggles fullscreen and enters link mode; `j`/`l` seek and scroll).
Expected behavior: Not yet defined — see open questions.

Acceptance criteria:
- [ ] To be written once the desired behavior is decided.

Notes: Open questions: Should VimNav keys take priority over page shortcuts, should the page win, or should it be configurable per site? Is a per-site disable list wanted?

### B-15 State and labels not handled when a page is restored via Back/Forward
Type: bug · Priority: P2 · Status: done

Reported by the project owner: Back with `H` sometimes showed the previous page still in link mode. Fixed (branch `fix-back-forward-link-mode`): link mode is left before following a label and whenever the page is hidden (`pagehide`), so Back/Forward always restore a page in normal mode. Covered by unit tests and tests/e2e/b15-back-forward.test.js (with Chrome's back/forward cache on).

Current behavior (from code reading, needs manual verification): When a page is restored from the back/forward cache, the old script state is kept and the background does not re-apply the on/off state (no DOMContentLoaded fires). Because following a link leaves link mode on with labels visible (B-8), going Back to that page likely shows stale labels and link mode still on. If the state was toggled while the page was in the cache, the restored page may still use the old state.
Expected behavior: A page restored via Back/Forward has no leftover labels, is not in link mode, and follows the current on/off state.
Steps to reproduce: Enable, press `f`, follow a link to another page, press `H`.

Acceptance criteria:
- [ ] After Back/Forward to a page where link mode was used, no labels are visible and link mode is off.
- [ ] After toggling VimNav in another page and going Back, the restored page follows the current state.

Notes: Partly resolved by B-8; recheck after it. Second criterion depends on B-4.

### F-2 Follow links immediately with prefix-free labels
Type: feature · Priority: P3 (proposed) · Status: proposed

As a keyboard user, I want a link to open as soon as I finish typing its label, so that I don't wait 1 second each time.

Acceptance criteria:
- [ ] No label is the beginning of another label.
- [ ] The link opens as soon as a complete label is typed, with no delay.

Notes: Not chosen: the project owner chose F-1's a…z, aa… sequence instead, which has shared prefixes and keeps the 1 s wait. Kept for possible future reconsideration (e.g. as an option); not planned.

### C-1 Add .gitignore
Type: chore · Priority: P2 (proposed) · Status: proposed

As a developer, I want OS clutter files ignored, so that they never get committed.

Acceptance criteria:
- [ ] A `.gitignore` at the root ignores `.DS_Store` and `*.textClipping`.

Notes: Open question: should `.claude/` (currently untracked, contains `settings.local.json`) be ignored, partly ignored, or committed?

### C-2 Add CLAUDE.md
Type: chore · Priority: P2 (proposed) · Status: proposed

As a contributor, I want a short project guide, so that I can set up, load and test the extension quickly.

Acceptance criteria:
- [ ] CLAUDE.md describes the project, its files and their roles.
- [ ] It explains how to load the extension unpacked in Chrome and reload it after changes.
- [ ] It gives the command to run the automated tests (from C-4) and points to the manual checklist (C-5).

Notes: Test sections depend on C-4 and C-5.

### C-3 Restore normal file modes
Type: chore · Priority: P2 (proposed) · Status: proposed

As a developer, I want source files to have standard permissions, so that diffs stay clean and files aren't marked executable.

Acceptance criteria:
- [ ] `background.js`, `manifest.json` and `vim-scroll.js` have mode 644 in git.

Notes: Reported in code review as changed to 755 in commit 922fdab; not independently verified by PM.

### C-5 Manual test checklist for browser-only behavior
Type: chore · Priority: P2 (proposed) · Status: proposed

As a developer, I want a written manual checklist, so that behavior that can't be tested automatically is checked the same way before each change ships.

Acceptance criteria:
- [ ] The checklist covers: loading unpacked, toggling via the icon and badge, every README command, link mode (enter, follow, mistype, Escape), typing in fields, modifier shortcuts, new tab / navigation / reload, restricted pages, Back/Forward.
- [ ] Each step states the expected result.
- [ ] It names concrete test pages (including a page with an inner scrolling element and a site with its own shortcuts).

Notes: Needed to verify B-3, B-5, B-13, B-15.

### C-6 Remove unused `tabs` permission
Type: chore · Priority: P3 · Status: done

As a user, I want the extension to request only the permissions it needs, so that I can trust it.

Acceptance criteria:
- [x] `tabs` is removed from the manifest permissions.
- [x] Toggling, messaging and new-tab handling behave the same as before (per C-5).

Notes: Code reading confirms it is unused: only `tab.id`, `tabs.sendMessage` and `tabs.onCreated` are used, none of which need it. Recheck if B-3/B-4 decisions add tab URL access.

Done: Removed with `activeTab`, `scripting` and `webNavigation` (B-3).

### C-7 Document link mode in README
Type: chore · Priority: P3 (proposed) · Status: proposed

As a user, I want the README to list all commands, so that I know link mode exists and how to use it.

Acceptance criteria:
- [ ] README lists `f` (enter link mode), typing a label to follow a link, and Escape to exit.
- [ ] README explains how to turn VimNav on/off with the toolbar icon.

Notes: Not in the review list; added because README currently omits `f` and Escape. Update again after F-1/F-2. Undocumented shipped behavior is recorded in F-7 to F-11.

## Done

Items F-3 to F-11 record shipped behavior as of commit 922fdab. They were written from reading the code and are not yet verified by tests (C-4, C-5). Their acceptance criteria are the spec for tests of current behavior. Known bugs are referenced in Notes and are not part of the criteria.

### F-16 Label buttons and form fields in link mode
Type: feature · Priority: P2 · Status: done

As a keyboard-only user, I want `f` to label buttons and form fields as well as links, so that I can press buttons and type into fields without the mouse.

Acceptance criteria:
- [x] `f` labels, in document order with links: `<button>`, `<input>` (except `type=hidden`), `<textarea>`, `<select>`, contenteditable editors and `role=button` elements, when visible (same rules as B-12).
- [x] Disabled controls, `contenteditable="false"` elements and editable elements nested inside an editor get no label.
- [x] Typing a link's label follows it, as before.
- [x] Typing the label of a text field, textarea, select or editor puts the cursor in it; the label letter is not typed into it, and later keys type normally (B-1). Escape leaves it.
- [x] Typing the label of a button, checkbox, radio button, submit or `role=button` element clicks it.
- [x] Each label is placed above and after its element (F-12).

Notes: Requested by the project owner. Partly answers a B-16 question (clickable non-link elements). Not covered: inputs inside shadow roots and other clickable elements (`onclick` handlers, `role=link`, `<summary>`), which could be follow-ups. Tests: `tests/link-targets.test.js`, `tests/e2e/f16-label-buttons-fields.test.js`.

### F-3 Scroll with j/k/h/l
Type: feature · Priority: — · Status: done

As a keyboard user, I want to scroll the page with `j`/`k`/`h`/`l`, so that I can read without the mouse or arrow keys.

Acceptance criteria:
- [x] While VimNav is enabled, a keydown with `key === "j"` scrolls the window down by 50 px; `k` scrolls up 50 px; `l` scrolls right 50 px; `h` scrolls left 50 px.
- [x] Each keydown event counts once, including auto-repeat keydowns, so holding the key keeps scrolling.
- [x] Matching is case-sensitive: `J`, `K` and uppercase `H`/`L` do not scroll (`H`/`L` navigate history, see F-6).
- [x] These scrolls use the browser's default scroll behavior, so pages that set CSS `scroll-behavior: smooth` scroll smoothly. They are not forced to be instant.
- [x] Only the window scrolls. Inner scrolling elements do not.
- [x] The keydown is not prevented or stopped, so the page also receives it.

Notes: README lists these keys without the 50 px step. Known bugs: also fire in text fields (B-1), with Ctrl/Cmd/Alt held (B-2) and in link mode (B-10); no effect on pages with an inner scroller (B-13); the page's own shortcuts also run (B-14).

### F-4 Jump to bottom with G
Type: feature · Priority: — · Status: done

As a keyboard user, I want `G` to take me to the bottom of the page, so that I can reach the end quickly.

Acceptance criteria:
- [x] While enabled, a keydown with `key === "G"` (Shift+g, or g with Caps Lock) scrolls the window down by `document.body.scrollHeight` px, instantly (no smooth scrolling).
- [x] On a normal document page this reaches the bottom of the page.
- [x] `G` does not set up a combination with any following key.

Notes: Discrepancy: README says "scroll to bottom of page", but the code scrolls down by the body's height relative to the current position rather than to an absolute position. On normal pages the result is the same. On pages where the body height does not match the scrollable height, it may not reach the bottom (B-13).

### F-5 Jump to top with gg
Type: feature · Priority: — · Status: done

As a keyboard user, I want `gg` to take me to the top of the page, so that I can return to the start quickly.

Acceptance criteria:
- [x] While enabled, a `g` keydown scrolls the window up by `document.body.scrollHeight` px, instantly, only when the keydown just before it was also `g` and the time between the two keydowns (`event.timeStamp`) is less than 1000 ms.
- [x] A single `g` does nothing.
- [x] Two `g` presses 1000 ms or more apart do nothing.
- [x] Any other keydown in between (including Shift alone, or any non-command key) breaks the pair. For example, `g`, Shift, `g` does nothing.
- [x] A third quick `g` (`ggg`) triggers again, because the pair is checked against the key just before it and is not reset after a jump.
- [x] Keydowns while VimNav is disabled are not recorded, so they neither complete nor break a pair.

Notes: Discrepancy: same as F-4. README says "scroll to Top of page", but the code scrolls up by the body's height (B-13). Also fires in link mode (B-10).

### F-6 History back/forward with H/L
Type: feature · Priority: — · Status: done

As a keyboard user, I want `H` and `L` to go back and forward in history, so that I can move between pages without the mouse.

Acceptance criteria:
- [x] While enabled, a keydown with `key === "H"` calls history back; `L` calls history forward.
- [x] Lowercase `h`/`l` scroll instead (F-3).
- [x] When there is no history entry in that direction, nothing happens.

Notes: README calls `L` "Next (history)". Known bugs: fire in text fields (B-1) and in link mode (B-10). On pages restored by Back/Forward, labels and link mode can be stale (B-15).

### F-7 Enter link mode with f (numbered labels)
Type: feature · Priority: — · Status: done

As a keyboard user, I want `f` to show a label next to every link, so that I can pick a link by typing its label.

Acceptance criteria:
- [x] While enabled and not in link mode, a keydown with `key === "f"` turns link mode on and labels links.
- [x] Every `<a>` element in the page's document gets a label, in document order, at the time `f` is pressed. Links inside iframes and links added later do not get labels.
- [x] Labels are decimal numbers starting at `0` (first link `0`, second `1`, ...).
- [x] Each label is a `<span class="link-label">` with a yellow background, a 1px solid black border and a 5px border radius. It is inserted into the page directly after its link, as the link's next sibling.
- [x] Each label number is linked to that link's resolved `href`, which is empty for an `<a>` without an href.
- [x] The `f` keydown that enters link mode is not counted as label input.
- [x] Pressing `f` again while in link mode does not add labels. The `f` is counted as label input (F-8).

Notes: Not in README (C-7). Known bugs: labels shift layout and hidden or href-less links are labeled (B-12); labels pile up after repeated `f`/Escape (B-9); `f` also fires with Cmd/Ctrl+F (B-2) and in text fields (B-1). F-1 proposes letter labels.

### F-8 Follow a link by typing its label
Type: feature · Priority: — · Status: done

As a keyboard user, I want to type a link's label to open it, so that I can follow links without the mouse.

Acceptance criteria:
- [x] In link mode, the `key` value of every keydown is added to the typed label, and a 1000 ms timer starts over.
- [x] When 1000 ms pass with no further keydown, if the typed text exactly matches a label number (e.g. `"12"`, not `"012"`) and that link's URL is not empty, the page navigates to that URL in the same tab. The typed text and the label-to-link list are then cleared.
- [x] Multi-digit labels work if each digit is typed less than 1000 ms after the previous one.
- [x] A label for a link with an empty href does not navigate.

Notes: Not in README (C-7). Known bugs: link mode and labels stay after following a link (B-8); a mismatch blocks later attempts until Escape (B-7); non-character keys are added to the typed text and label digits/keys also run normal commands (B-10); `target="_blank"` and script click handlers are ignored (B-11). F-1 changes labels to letters and keeps the 1000 ms wait (F-2 not chosen).

### F-9 Exit link mode with Escape
Type: feature · Priority: — · Status: done

As a keyboard user, I want Escape to cancel link mode, so that I can go back to normal navigation.

Acceptance criteria:
- [x] In link mode, Escape turns link mode off, cancels any pending label timer, and clears the typed text and the label-to-link list.
- [x] Every element in the document with class `link-label` is hidden (`display: none`).
- [x] After Escape, `f` enters link mode again and creates a new set of labels.
- [x] Outside link mode, Escape does nothing.

Notes: Not in README (C-7). Known bug: labels are hidden, not removed, and pile up (B-9). Hiding targets any element with class `link-label`, including the page's own elements with that class. Open question: is this intended or a side effect?

### F-10 Toggle VimNav from the toolbar icon (ON/OFF badge)
Type: feature · Priority: — · Status: done

As a user, I want to turn VimNav on and off by clicking its toolbar icon, with a badge that shows the state, so that I control when keys are captured.

Acceptance criteria:
- [x] On install, the default badge text is `OFF` and the stored state (`extensionState` in sync storage) is `"OFF"`.
- [x] Clicking the icon reads the current tab's badge: `ON` becomes `OFF`, and anything else (`OFF` or empty) becomes `ON`. The new value is set as that tab's badge and saved as the stored state.
- [x] Turning ON: if the content script is already in the tab, it is re-enabled. Otherwise, the script is injected into the tab and starts enabled.
- [x] Turning OFF: the tab's content script is disabled and ignores all keydowns, including in link mode, until re-enabled.
- [x] Disabling does not change link-mode state: visible labels stay visible, and on re-enable link mode carries on as before.
- [x] Injecting into a tab that already has the script does not add a second key handler (the second copy stops at once with "VimNav already active").

Notes: Not in README (C-7). Known bugs: the state is stored globally but the badge and messages are per tab (B-4); errors on restricted pages (B-5); reset to OFF on every update or reload (B-6). Ambiguous: a label timer started before OFF still fires after OFF and may navigate.

Superseded by B-3/B-4/B-6: the switch is now global, starts ON, and turning OFF leaves link mode.

### F-11 Re-apply saved state on new tabs and page loads
Type: feature · Priority: — · Status: done

As a user, I want VimNav to remember whether it is on when I open tabs or load pages, so that I don't have to re-enable it every time.

Acceptance criteria:
- [x] When a tab is created, and on every DOMContentLoaded in a tab (any frame), the stored state is read. If no state is stored, nothing happens.
- [x] The tab's badge is set to the stored state (`ON` or `OFF`).
- [x] If the stored state is `ON`, the content script is injected into the tab's top frame.
- [x] If the stored state is `OFF`, nothing is injected.

Notes: Not in README. Shipped in code, but it probably does not work in practice because the extension only has `activeTab` access (B-3). Repeated injection on iframe loads (B-3). Not re-applied on Back/Forward cache restores (B-15). Interacts with B-4.

Superseded by B-3: the manifest loads VimNav into every page; the service worker no longer injects it.
