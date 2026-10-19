# Contributing to Golden Apple

Thanks for helping! Every change goes through a pull request that the maintainer reviews. Nobody pushes to `main`.

## How to send a change

1. **Fork** the repository and make a branch in your fork. (If the maintainer gave you write access instead, create a branch named `contrib/<short-description>`, for example `contrib/alice-new-sign`. Other branch names are blocked.)
2. Make **one focused change** per pull request.
3. Run the tests (below) and make sure they pass.
4. Open a pull request into `main` and describe what you changed and why. Screenshots help for anything visual.
5. The maintainer reviews it, may ask for changes, and merges it (usually as a single squashed commit).

## Running it

- `npm start` serves the game at http://localhost:5500/play/ (the home page is at http://localhost:5500/).
- `npm test` runs the smoke test and the room test. There are no dependencies to install, only Node 18 or newer. The tests don't render anything, so check visual changes in a browser.

## What a good pull request has

- **Tests** for new behaviour (`tests/smoke-test.js` for one player, `tests/room-test.js` for rooms), and a green `npm test`.
- **Matching style**: plain JavaScript, no build step, no dependencies, dense one-line statements, 2-space indent, semicolons. `CLAUDE.md` has a map of `js/app.js` and the conventions.
- **Safe text handling**: anything a player types goes through `esc()` before it is put into HTML.
- **Careful room code**: anything received from another player is untrusted. Check the `ownProp` and `cleanNet` helpers in `js/app.js`, and add a check to the "Hostile guests" tests for any new message type. Never send emails, inboxes or budgets to other guests.
- **No new outside scripts or services** without discussing it first: the game page has a Content Security Policy and pinned script hashes.
- **Readable text**: Atkinson Hyperlegible for all text, the pixel font only for big headings and numbers.

## Security problems

Please don't open a public issue or pull request for a security problem. Report it privately through **Security → Report a vulnerability** on the repository (see `SECURITY.md`).
