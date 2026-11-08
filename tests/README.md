# Tests

Unit tests for the current behavior in BACKLOG.md items F-3 to F-11. They use Node's built-in test runner and have no dependencies (Node 22+).

Run from the repository root:

```sh
node --test "tests/*.test.js"
```

With coverage:

```sh
node --test --experimental-test-coverage "tests/*.test.js"
```

Keep the quotes so Node expands the glob. Node 22 does not accept a bare directory such as `tests/`.

How it works: `tests/helpers/load.js` loads the real, unmodified `vim-scroll.js` and `background.js` with `node:vm` into a new context for each test, using small fakes that record calls: `window`, `document`, `history` and `chrome` in `tests/helpers/fake-*.js`. A fake clock (`fake-clock.js`) replaces `setTimeout`/`clearTimeout`, and each keydown's `timeStamp` defaults to the fake clock's time.

Known bugs (B-*) are listed as `test.todo` entries, not as tests that pass.
