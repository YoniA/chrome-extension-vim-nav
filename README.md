# VimNav

Navigate web pages with Vim-style keys in Chrome: scroll, follow links, press buttons, search
the page and close tabs without touching the mouse.

## Install

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this folder.

VimNav runs on every site and is ON right after installing. Click its toolbar icon to turn it
OFF or ON again. This one switch applies to all tabs at once, and the badge on the icon shows
the current state. The setting is kept when the extension is updated.

After changing the code, click the reload button on VimNav's card in `chrome://extensions`,
then reload open tabs (tabs that were already open keep running the old version).

## Commands

### Scrolling

| Key  | Action                 |
| ---- | ---------------------- |
| `j`  | Scroll down            |
| `k`  | Scroll up              |
| `h`  | Scroll left            |
| `l`  | Scroll right           |
| `gg` | Jump to the top        |
| `G`  | Jump to the bottom     |

### History and tabs

| Key | Action                                                          |
| --- | --------------------------------------------------------------- |
| `H` | Back                                                            |
| `L` | Forward                                                         |
| `x` | Close the current tab (not pinned tabs; holding `x` closes one) |
| `X` | Reopen the last closed tab or window (like Cmd/Ctrl+Shift+T)  |

### Link mode

| Key      | Action                                                        |
| -------- | ------------------------------------------------------------- |
| `f`      | Show a letter label on every visible link, button and field   |
| a label  | Open the link, click the button or checkbox, or put the cursor in the field |
| `Escape` | Leave link mode                                               |

Labels are lowercase letters: `a` … `z`, then `aa`, `ab` … and so on. A label opens as soon
as you finish typing it. If a longer label starts with the same letters (for example `a`
while `aa` exists), VimNav waits one second for more letters before opening it. Only links
visible when you press `f` are labeled; to label others, press `Escape`, scroll, and press
`f` again.

### Search

| Key      | Action                                                                  |
| -------- | ----------------------------------------------------------------------- |
| `/`      | Open the search bar; matches are highlighted as you type               |
| `Enter`  | Close the bar and select the current match                              |
| `n`      | Next match (wraps around)                                               |
| `N`      | Previous match (wraps around)                                           |
| `Escape` | In the bar: cancel the search. After a search: clear the highlights     |
| `↑`      | In the bar: recall the previous search                                  |

The search is plain text (characters like `.` or `(` are matched literally) and uses
smartcase: all-lowercase queries ignore case, queries with a capital letter don't. Hidden
text is not searched. The bar shows the current match and the total, e.g. `3 / 17`.

### Typing in fields

- Keys typed in text fields, text areas, dropdowns and rich-text editors are left alone, so
  you type normally.
- `Escape` in a field takes the cursor out of it, so the keys above work again.
- Key combinations with Ctrl, Cmd or Alt (such as Cmd+F or Cmd+L) are left to the browser
  and the page.

## Limitations

- Chrome doesn't let extensions run on `chrome://` pages, the New Tab page or the Chrome Web
  Store, so VimNav does nothing there.
- Scrolling moves the whole page; on sites whose content scrolls inside a panel, `j`/`k` may
  do nothing.
- Sites with their own single-key shortcuts (e.g. YouTube) may react to the same keys.

## Development

```sh
npm install          # Playwright, for the browser tests
npm test             # unit tests (Node's built-in test runner, no browser)
npm run test:e2e     # end-to-end tests in a sandboxed Chromium with the extension loaded
npm run coverage     # unit tests with coverage
npm run try -- <session.json> [--headed] [--slow 800]   # scripted browsing session, see tools/try-extension.mjs
```

The work plan and known bugs are in [BACKLOG.md](BACKLOG.md).
