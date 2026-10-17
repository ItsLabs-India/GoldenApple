# Golden Apple

A block-style 3D office world for workplace recognition. Coworkers log in with an email, build a pixel avatar, walk between the Work Desks, Pantry, Restroom and Lakeside, poke each other, and give apples for good work. Each person can give **10 apples a day**. Anyone who receives **more than 10 in total** becomes a **Golden Apple**, shown by a spinning gold apple above their head.

Plain HTML, CSS and JavaScript. No build step. The only dependencies are loaded from CDNs: three.js r128 and three Google Fonts.

## Run it

**Option A: VS Code Live Server (recommended)**
1. Open this folder in VS Code.
2. Install the recommended extension when prompted (Live Server).
3. Right-click `index.html` → **Open with Live Server**. It opens at `http://127.0.0.1:5500`.

**Option B: terminal**
```bash
npm start        # runs: npx serve -l 5500 .
```
Then open http://localhost:5500.

> Opening `index.html` by double-clicking it (a `file://` address) also works, but browsers don't save cookies there. The app falls back to localStorage, so you'll still be remembered. Use a local server to test the real cookie behaviour.

## Test it

```bash
npm test         # runs: node tests/smoke-test.js
```

The smoke test runs the real `js/app.js` against a fake browser and a three.js stub (Node 18+). It checks 41 things:
- email login, duplicate emails and logout / log back in
- the daily apple budget and the Golden Apple threshold
- cookies, including rebuilding a profile from its cookie alone
- that every spot-to-spot walking route avoids walls and furniture (the layout stays connected)
- that apples and pokes from the old demo coworkers are purged from saved profiles

It does **not** render graphics, so check visual changes in a browser.

## Project structure

```
golden-apple/
├── index.html          Markup for every screen: login, profile setup, HUD, card, modals
├── css/styles.css      All styling. Colour and font tokens are at the top (:root)
├── js/app.js           All game logic. A table of contents is at the top of the file
├── tests/smoke-test.js Logic test (npm test)
├── package.json        npm start / npm test
└── .vscode/            Recommends Live Server, sets port 5500
```

## Good first changes

| Want to… | Edit | Look for |
|---|---|---|
| Change the daily limit or Golden threshold | `js/app.js` | `DAILY_APPLES`, `GOLDEN_AFTER` (top of file) |
| Change recognition reasons or poke messages | `js/app.js` | `REASONS`, `POKES` |
| Add avatar colours or styles | `js/app.js` | `AV` (and the painter in `paintSkin`) |
| Move rooms or resize the map | `js/app.js` | `ZONES`, `buildLayout`, `buildFurniture` |
| Retheme the UI | `css/styles.css` | the `:root` tokens |

If you move furniture or seats, run `npm test`. The routing check tells you if a walking route between spots is now blocked.

## How data is stored

Everything stays in the user's own browser. There is no server.

- **Cookie (primary).** `ga_session` holds the logged-in email (30 days). `ga_p_<hash>` holds a compact profile: name, role, team, status, avatar and apples received. It is about 180 bytes, well under the 4,096-byte cookie limit, and lasts 180 days. On HTTPS the cookie is written as `SameSite=None; Secure; Partitioned` so it can survive inside embedded pages. Every write is read back to confirm it saved.
- **localStorage (mirror).** `ga_users` stores full profiles, including the inbox and recent apples, which are too big for a cookie. `ga_world` stores the activity feed (`{v:2,feed}`). Version 1 also held 9 demo coworkers; on first load the app strips their apples, pokes, feed items and any Golden status earned from them out of saved profiles.
- **Menu → Where your profile is saved** shows which of the two the current browser allowed.
- Emails are never shown to other users. Coworkers see only name, role and team.

## Known limits (MVP)

- **Not multiplayer.** Each browser is its own world, and there are no demo coworkers: you only see real profiles created in the same browser, shown "Away" at their desks. A fresh browser starts with an empty office.
- **Email uniqueness is per browser,** because there's no server to check against.
- **No password,** so anyone on the same browser can log in as any saved email. Fine for a demo, not for production.
- Characters pass through each other. No sound.

## Next steps

- **Real multiplayer.** Add a small backend: auth, a users table with a unique email, an apples ledger, and WebSocket presence. The functions to replace are the storage layer (`Store`, `Cookies`, `USERS`, `WORLD`) and `giveApples` / `doPoke`.
- **A per-recipient daily cap** (for example 3 apples a day to the same person), to stop two people making each other Golden.
- **Magic-link email sign-in,** if the no-password model needs hardening.
