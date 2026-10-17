# Golden Apple

A block-style 3D office world for workplace recognition. Coworkers log in with an email, build a pixel avatar, set up their own desk, walk between the Work Desks, Pantry, Restroom and Lakeside, poke each other, and give apples for good work. Each person can give **10 apples a day**. Anyone who receives **more than 10 in total** becomes a **Golden Apple**, shown by a spinning gold apple above their head.

**Rooms on the same Wi-Fi.** One person creates a room on the start screen and gets a 6-character invite code, a link and a QR code (Room button in the HUD). Others on the same Wi-Fi open the link or type the code, make a profile and walk into the same office: everyone sees each other move, sit and eat live, and apples, pokes, desks and the Golden Apple feed are shared. It works from any static host, including GitHub Pages. The host's browser tab *is* the room: it keeps everyone's profiles, checks the rules and relays updates, so the host keeps that tab open (the room pauses when it closes and picks up again when they reopen it; guests reconnect on their own). Browsers connect directly with WebRTC; the free PeerJS service is used only for the few-second handshake when someone joins, and no relay servers are configured, so only devices on the same network can connect. **Play on this browser only** keeps the old single-browser mode.

**Your own desk.** During profile setup (or later under Profile) everyone styles their desk: desk colour, chair style and colour, computer (monitor, two monitors, laptop, laptop + monitor), screen colour, a plant, a desk pet (cat, dog, hamster, bunny, goldfish, turtle) and up to two decor items. Skip it and you get the default desk. The desk is placed in the Work Desks room automatically (nearest the door first), marked by a gold square on the minimap, and only its owner can sit there.

**Pantry food.** The Pantry has a food counter with 8 items: 2 veg, 2 non-veg, 2 fruits and 2 drinks, picked from 25 dishes (samosa, masala dosa, chicken biryani, sushi, watermelon, mango lassi and more). The menu changes every 5 minutes on the clock, so everyone sees the same counter, and a chalkboard shows what is on and when the next menu arrives. Walk up to an item and press **E** to take it, then press **F** to eat it right there, or carry it to a table, stool, bench or your desk and sit down to eat. Eating works like Minecraft: the item goes to your mouth with crumbs and crunching, then a burp; drinks tilt back with gulps. **Q** puts the item down. The coffee machine brews a cup when you press **E** next to it.

**Health, energy and the restroom.** Three bars under your profile drift in real time: health drops about 1.8 points a minute, energy about 1.3 (2.8 when you run), and the restroom need rises about 1.2. Working at your desk is tiring: while you sit there, energy drops 2.4 and health 3 a minute. Pantry meals fill health (+35) and a little energy; fruit gives less; drinks fill the restroom need most; coffee fills energy (+45). Sitting anywhere other than your desk (benches, pantry stools, the lake) is a break: +5 energy a minute. Low values have effects: when tired you yawn and walk slower, and when exhausted or starving you can't run; a hungry stomach growls; a full bladder gets you hurrying to the Restroom (no accidents). Your needs are saved in this browser and reset after 3 hours away.

**Restroom.** Three private stalls with swinging doors and green/red occupied signs. Press **E** at a free stall: the door closes, you are hidden, and a "Using the restroom" label with a progress bar shows above the stall (others only see "Occupied", never who or what is inside). Several people can use different stalls at once, and anyone can use a stall once it is free again. Afterwards your restroom need is 0 and your hands need washing: press **E** at a sink to wash them (food eaten with unwashed hands gives half the health).

**Music and sound.** Each place has its own background music and ambience (birds on the plaza, water and ducks at the lake, typing at the desks, cups in the pantry, drips in the restroom), plus sounds for footsteps, jumping, sitting, apples, Golden Apple and pokes. Everything is generated in the browser with the Web Audio API, so there are no audio files to download or license. Sound starts on your first click or key press; press **M** or use the **Sound** button to mute, and set volumes in the Menu.

Plain HTML, CSS and JavaScript. No build step. The only dependencies are loaded from CDNs: three.js r128, PeerJS 1.5.4 (room handshakes), qrcodejs 1.0.0 (invite QR codes) and three Google Fonts. Opening the page and joining a room need the internet; play inside a room then stays on your Wi-Fi.

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
npm test         # runs: node tests/smoke-test.js && node tests/room-test.js
```

Both tests run the real `js/app.js` in fake browsers (`tests/harness.js`: a tiny DOM, cookies, localStorage, a three.js stub, a strict Web Audio stub and an in-memory PeerJS stand-in), Node 18+.

The smoke test (128 checks) covers a single browser:
- email login, duplicate emails and logout / log back in
- the daily apple budget and the Golden Apple threshold
- cookies, including rebuilding a profile from its cookie alone
- that every spot-to-spot walking route avoids walls and furniture (the layout stays connected)
- that apples and pokes from the old demo coworkers are purged from saved profiles
- desks: every option builds, one desk per person, defaults when nothing is picked, you can only sit at your own desk, desks survive a cookie-only rebuild and disappear when a profile is deleted
- needs: drift rates, resting, what meals, fruit, drinks and coffee give, tiredness slowing you and stopping running, yawns and stomach growls, the full restroom visit (hidden, Occupied, progress label, can't leave early), dirty hands, hand washing and saving
- pantry food: menu makeup and 5-minute rotation, taking and swapping items, eating with F, sitting down to eat, putting food down, brewing and drinking coffee
- sound, against a strict fake Web Audio API: music and ambience switch with the place, every effect plays, and mute stops everything

The room test (57 checks) runs a host and two guests in one room: invite codes, joining from a link, private emails and inboxes, desk hand-out, live movement and seats, apples and pokes between guests, Golden Apple everywhere, profile edits, two people in two stalls at once (others see only Occupied), reusing a freed stall, hand washing seen by others, logging out to Away, the host dropping out and coming back, wrong codes and deleting a profile.

It does **not** render graphics, so check visual changes in a browser.

## Project structure

```
golden-apple/
├── index.html          Markup for every screen: login, profile setup, HUD, card, modals
├── css/styles.css      All styling. Colour and font tokens are at the top (:root)
├── js/app.js           All game logic. A table of contents is at the top of the file
├── tests/harness.js    Fake browser + fake PeerJS network shared by the tests
├── tests/smoke-test.js Single-browser logic test
├── tests/room-test.js  Host + two guests in one room
├── package.json        npm start / npm test
└── .vscode/            Recommends Live Server, sets port 5500
```

## Good first changes

| Want to… | Edit | Look for |
|---|---|---|
| Change the daily limit or Golden threshold | `js/app.js` | `DAILY_APPLES`, `GOLDEN_AFTER` (top of file) |
| Change recognition reasons or poke messages | `js/app.js` | `REASONS`, `POKES` |
| Add avatar colours or styles | `js/app.js` | `AV` (and the painter in `paintSkin`) |
| Add desk colours, computers, plants, pets or decor | `js/app.js` | `DK` (append only), then draw it in `buildDesk` |
| Add a dish or drink to the Pantry | `js/app.js` | `FOODS` (give it a `cat`, a `snd` and a `b` model builder) |
| Change how often the menu changes | `js/app.js` | `MENU_MS` |
| Change the music or ambience of a place | `js/app.js` | `THEMES` and `AMB` (Sound section) |
| Move rooms or resize the map | `js/app.js` | `ZONES`, `buildLayout`, `buildFurniture` |
| Retheme the UI | `css/styles.css` | the `:root` tokens |

If you move furniture or seats, run `npm test`. The routing check tells you if a walking route between spots is now blocked.

## How data is stored

There is no server. On **this browser only**, everything stays in that browser. In a **room**, everyone's data lives in the host's browser.

- **Room (host).** `ga_room_<CODE>` holds the room: name, every profile (keyed by a private key, with the email kept only here), inboxes, budgets and the feed. `ga_hosted` lists rooms you host so you can reopen them; the Room window has **Download backup** and **Restore from file**.
- **Room (guest).** `ga_joined` remembers the rooms you joined and your email, so **Rejoin** signs you straight in. Guests receive other people's names, roles, avatars, desks and apple totals, never their emails, inboxes or budgets.

- **Cookie (primary).** `ga_session` holds the logged-in email (30 days). `ga_p_<hash>` holds a compact profile: name, role, team, status, avatar, apples received, desk options and desk spot. It is about 220 bytes, well under the 4,096-byte cookie limit, and lasts 180 days. On HTTPS the cookie is written as `SameSite=None; Secure; Partitioned` so it can survive inside embedded pages. Every write is read back to confirm it saved.
- **localStorage (mirror).** `ga_users` stores full profiles, including the inbox and recent apples, which are too big for a cookie. `ga_world` stores the activity feed (`{v:2,feed}`). `ga_sound` stores your volume and mute settings. `ga_vitals` stores each person's health, energy, restroom need and clean hands. Version 1 also held 9 demo coworkers; on first load the app strips their apples, pokes, feed items and any Golden status earned from them out of saved profiles.
- **Menu → Where your profile is saved** shows which of the two the current browser allowed.
- Emails are never shown to other users. Coworkers see only name, role and team.

## Known limits (MVP)

- **The host must stay online.** A room lives in the host's tab. If it closes, the room pauses (guests see "reconnecting") until the host reopens it. Back it up from the Room window.
- **Same network only, and some networks block it.** Guest or corporate Wi-Fi with "client isolation" stops devices seeing each other, so rooms can't connect there. The joining handshake also relies on the free PeerJS service, which has no uptime guarantee.
- **Rooms of about 10–20 people.** The host relays every update.
- **No password,** so anyone with the invite code can sign in with any email in that room, and anyone on the same browser can use any saved email. Fine for a team you trust, not for production.
- **24 desks.** The Work Desks room has 24 desk spots. When all are taken, new profiles have no desk until someone deletes theirs.
- Characters pass through each other.

## Next steps

- **Rooms over the internet.** Point the same room messages at a small always-on server (for example Cloudflare Workers + Durable Objects on the free plan) so rooms work across networks and don't depend on the host's tab.
- **A per-recipient daily cap** (for example 3 apples a day to the same person), to stop two people making each other Golden.
- **Magic-link email sign-in,** if the no-password model needs hardening.
