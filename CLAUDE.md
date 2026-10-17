# Golden Apple — Codebase Mind Map (for Claude)

Read this map before you open any files. Line numbers are approximate (map updated 2026-10-17, app.js = 1992 lines). If they have drifted, run `grep -n "^/\* ===\|^   [A-Z]" js/app.js` to re-locate sections.

## Mind map

```mermaid
mindmap
  root((Golden Apple))
    Stack
      Plain HTML CSS JS
      No build step
      three.js r128 via CDN
      Google Fonts Pixelify VT323 Atkinson
      Node 18 only for tests
      PeerJS 1.5.4 and qrcodejs 1.0.0 via CDN
    Files
      index.html - all screens and DOM ids
      css/styles.css - root tokens
      js/app.js - everything else, one IIFE
      tests/harness.js - fake browser and fake PeerJS net
      tests/smoke-test.js - one browser
      tests/room-test.js - host and two guests
    Rules
      DAILY_APPLES 10 per day
      GOLDEN_AFTER more than 10 received
    Storage
      Cookie ga_session 30d
      Cookie ga_p_hash compact profile 180d
      localStorage ga_users ga_world ga_last ga_hint_hidden ga_sound
      rooms: ga_room_CODE on the host, ga_hosted, ga_joined
    Rooms
      host tab is the room, guests mirror it
      WebRTC via PeerJS, no ICE servers so same Wi-Fi only
      6-char invite code, ?room=CODE link, QR
    World
      96x96 grid, 1 block = 1 m
      tileMap and topMap collision heights
      ZONES desks pantry restroom lake plus plaza
      SPOTS seats and poses
      DESK_SLOTS 24, one personal desk each
      Ring path routing, test only
    Pantry food
      counter menu changes every 5 min
      E take, F eat, Q put down, coffee machine
    Characters
      kinds me, local (Away), remote (online in a room)
      real profiles only, no demo NPCs
      Avatar 64x64 skin painter
    Recognition
      giveApples
      doPoke
    Sound
      generated music per place
      ambience and effects, no files
    UI
      HUD, card, modals Board Inbox Menu
      toasts, minimap, labels
    Flow
      login, setup, world
      main loop frame
```

## Files

| File | Lines | What it holds |
|---|---|---|
| `index.html` | 243 | Every screen as static markup: `#screen-login`, `#screen-setup`, `#hud` (with `#card`, `#touch`, `#minimap`, `#feed`), `#modal`, `#toasts`, `#bootErr`. The start screen has `#roomStep` (join/create forms, `#roomRecent`, `#soloBtn`) and `#roomBar`; the HUD has `#bRoom`. It loads three.js r128, PeerJS 1.5.4 and qrcodejs 1.0.0 from cdnjs, then `js/app.js`. |
| `css/styles.css` | 300 | `:root` tokens (bark, cream, gold, apple, the `--st-*` status colours and the `--f-display/body/num` fonts), then components (`.panel .btn .tag .bubble .chip .bar .pips`) and per-screen styles. Pixel look: hard inset box-shadows, `image-rendering:pixelated`. |
| `js/app.js` | 1992 | All logic in one `(function(){'use strict'; ... })();` IIFE. Lines are dense one-liners: read by range, not whole. |
| `tests/harness.js` | 176 | `createClient({net,search})` runs app.js in its own `vm` context (fake DOM, cookie jar, localStorage, math-faithful THREE stub, strict Web Audio stub) and exposes internals as `client.G` by regex-replacing the final `})();`, so **keep `})();` as the last line of app.js**. `createPeerNet()` is an in-memory PeerJS stand-in (signalling + data connections, JSON-cloned messages, flushed every frame). `step(clients,n,dt,net)` advances several clients on one shared clock. |
| `tests/room-test.js` | 137 | Host + two guests in one room (51 checks). |
| `tests/smoke-test.js` | 239 | One browser on the harness (104 checks). |
| `package.json` | — | `npm start` runs `npx serve -l 5500 .`; `npm test` runs `node tests/smoke-test.js && node tests/room-test.js`. No dependencies. |
| `README.md` | — | User-facing docs, "Good first changes" table, storage notes, known limits. |
| `.vscode/` | — | Live Server recommendation, port 5500, 2-space tabs, LF line endings. |

There is no bundler, no framework and no server: rooms are peer-to-peer between browsers.

## js/app.js section index (line ≈)

| Line | Section | Key names |
|---|---|---|
| 1 | TOC comment | — |
| 34 | Boot guard | if `!window.THREE`, shows `#bootErr` and returns |
| 39 | **Rules** | `DAILY_APPLES=10`, `GOLDEN_AFTER=10`, `isGolden(n)` (n > 10) |
| 43 | helpers | `$`, `clamp`, `rand`, `pick`, `mulberry32` (seeded RNG), `hashStr`, `todayKey`, `esc` (HTML escape, use it for all innerHTML), `timeAgo`, `shade`, `angleLerp`, `reduceMotion`, `coarse` (touch), `isTyping` |
| 61 | Pixel icons | `APPLE_MAP`, `pixelIcon`, `ICON_APPLE/GOLD/EMPTY/POKE` (data URLs) |
| 73 | **Storage** | `Store` (localStorage with in-memory fallback, JSON), `Cookies` (tries the `Partitioned; SameSite=None; Secure` variants in turn, verifies by read-back), `b64e/b64d` |
| 90 | Avatar options | `AV` (palettes and styles), `AV_KEYS` order (skin, hairStyle, hair, eyes, top, topColor, pants, shoes, acc), `AV_STYLE` (stepper rather than swatch), `randomAvatar`, `avatarToArr/arrToAvatar` |
| 109 | **Desk options** | `DK` (desk, chairStyle, chair, tech, screen, plant, pet, decor), `DK_KEYS` order, `DK_STYLE` (steppers), `DECOR_MAX=2`, `DESK_DEFAULT` (all index 0, no decor; used when the user picks nothing), `deskToArr/arrToDesk` (8 numbers, decor as a bitmask), `deskOf(rec)` (normalised copy) |
| 132 | **Data model** | `USERS` (from `ga_users`, or the room's profiles), `room` (mode null/'host'/'guest', code, name, status, peer, hostConn, conns, online Set, data), `kOf(u)` (profile key: email on this browser, `u.key` in a room), `saveUsers`/`saveWorld` (solo localStorage, host room data, guests never save), `findUser` (localStorage first, then rebuild from cookie), `putUser`, `writeProfileCookie` (compact keys e,n,r,t,s,a,rc,c, plus k = desk array and ds = desk slot), `budgetLeft`, `spendBudget` (`given={d:todayKey,n}`) |
| 155 | Content tables | `REASONS`, `POKES`, `STATUS` |
| 160 | World / demo purge | `WORLD={v:2,feed:[]}` stored under `ga_world`. `purgeDemo()` runs once when an old v1 world is found: it removes inbox items whose `fromId` starts with `npc:`, the matching `recent` entries and apple counts (revoking Golden status if needed), and feed items that don't involve real users |
| 178 | **state** | `{mode:'login'|'setup'|'world', me, player, chars:Map, selected, pokeMsg, cookieOK, modal, setup, hintHidden}`; `state.setup` holds `{mode,email,av,desk}` while the setup screen is open |
| 184 | Three.js core | `renderer`, `scene`, `camera`, fog, sky, lights, `sun` shadows (`SHADOWS`, off when `coarse`), `UNIT_BOX` |
| 203 | Textures | `canvasTex`, `noiseTex`, `waterTex`, `glowTex`, 16px **atlas** `TILE_NAMES` (16 tiles), `blockGeo`, `BLOCK_TYPES` |
| 255 | **World layout** | `N=96, HALF=48`, `tileMap`, `topMap` (collision height per cell: 0 ground, -1 water, 2 walls, 99 trunks), `idx`, `cellTop`, `solidRect`, `raiseTop/setTop` |
| 268 | **ZONES** | desks (N, z -38..-17), pantry (E, x 18..33), restroom (W, x -31..-20), lake (S, z≈18..44). Each has `inside`, `gate` and `spoke` (index into `RING`, 8 points r=3.4 around the plaza) |
| 281 | Spots | `SPOTS[]`, `addSpot({zone,x,z,y,face,pose,approach,via,desk})`; poses are sit, stand, coffee, wash, stall, look. Desk spots also get `owner` (email) while a desk is built there |
| 288 | `buildLayout()` | plaza disc, paths, zone floors and walls (glass for desks and pantry), lake ellipse `lakeE`, dock, hedge border |
| 320 | `tree`, `bench`, `plant`, `sign` | furniture helpers; `fbox(...)` queues boxes into `FURN.noise/glow/glass` |
| 369 | **Personal desks** | `DESK_SLOTS[]` (`{x,dz,tw,zc,spot,label:'Pod E · desk 3',desk}`), `DESK_ORDER` (slots nearest the door first), `dmat` (cached materials), `db`/`grp` box helpers, **`buildDesk(cfg)`** returns `{root,anim}` in desk-local space (sitter on +z facing -z; plant back-left, pet back-right, decor front corners, chair at z=1), `animateDesk` (pet bob/wag/swim, globe spin), **`placeDesk(slot,cfg,owner)`** / **`clearDesk(slot)`** (also set and reset `topMap` for the desk and chair), **`allocDesk(rec)`** (keeps a valid unshared slot or takes the next free one, -1 when full), `deskLabel` |
| 456 | `buildFurniture()` | 6 desk pods x 4 = 24 **empty desk slots** with floor mats and desk spots (`desk:true`), pantry tables A/B with `pantryVia`, restroom sinks and stalls, plaza benches, **Orchard Board** (`boardMesh`, `BOARD_POS`), lake benches and viewpoints, signs |
| 548 | `buildTrees()` | big plaza apple tree, so `TREE_APPLE_SLOTS`; random small trees and flowers |
| 570 | `finalizeMeshes()` | turns the `BLOCKS` and `FURN` queues into InstancedMeshes |
| 592 | Tree apples / board | `treeApples` InstancedMesh(40), `updateTreeApples`, `drawBoard()` (canvas texture), `clouds`, `ducks` |
| 631 | **Pantry food** | `MENU_MS=300000`, `COUNTER_X`, `SLOT_Z` (8 counter slots), `COFFEE_Z`, `EAT_TIME=1.6`, `BREW_TIME=2.4`, `FOOD_CATS`, `MENU_PLAN` (veg, nonveg, fruit, drink, two each), **`FOODS`** (`{id,name,cat,snd:'crunch'|'munch'|'juicy'|'gulp',hot?,cols,b:g=>model}`; 6 per category plus `coffee`), `FOOD` map, `isDrink`, `buildFood(id,inHand)` (in the hand, plates and boards are left out), `menu{bucket,items,mins}`, `menuBucket()` (clock / 5 min, so every browser shows the same menu), `menuFor(bucket)` (seeded pick), `counterGroup`, `drawMenuBoard` (chalkboard texture with a countdown), **`refreshMenu(b)`** (rebuilds trays, veg/non-veg marks and items; toasts people in the Pantry), `coffeeLight`, `brew{on,t}`, `nearestCounterItem`, `nearCoffee`, `holdFood`, `putDownFood`, `startBrew`, **`startEat`**, `mouthPos`, **`updateFood(dt)`** (menu clock, brewing steam, hot-drink steam, crumbs and eat sounds, finishing with a burp or ahh) |
| 729 | **Avatars** | `PX=1.8/32`, `PARTS` UV nets (Minecraft-style 64x64 skin), `paintSkin(av)` returns a canvas, `buildAvatar(av)` returns `{root,model,hips,legR/L,armR/L,headPivot,canvas,disposables}`, `headIcon`, `makeApple` |
| 829 | **class Character** | `{id, kind:'me'|'local', data, root, anim{pose,speed,run,air,celebrate,startle,poke,give,wave}, crown, tag, bubble}` plus `held`/`heldMesh` and methods `setAvatar` (keeps the held item), `hold(id)`, `dropHeld()`, `golden` (getter), `refresh` (nameplate), `say`, `hop`, `faceTo`, `update(dt)` (procedural limb animation; `anim.eat` 'eat' raises the arm to the mouth and jiggles it, 'drink' tilts the head back), `dispose` |
| 897 | Walk routes | `routeFromTo(a,b)` (reverse a.via, then inside, gate, ring arc, gate, inside, b.via, spot). Not used in play; the test uses it to prove the layout is connected. `placeAt` (puts Away users at their desk) |
| 915 | People registry | `allPeople()` |
| 919 | Effects | particles `spawnP/burst` (PMAX 520), `fly()` projectiles, `ringWave`, `selRing`, `handPos/headPos` |
| 952 | **Sound** | Web Audio only, no files. `SND` (`ga_sound`: music, sfx, muted), `Sound` (ctx, gain buses out/musBus/mus/lead/echo/amb/fx, noise buffer, beds wind/water/hum), `THEMES` (per place: bpm, root, chord `prog`, `scale`, `lead`/`pad` waves, `bass` steps, `dens`, `perc`, `echo`, `seed`), `AMB` (bed levels plus event type and gap), `zoneKey`, `audioInit` (on first pointerdown/keydown), `applyVolumes`, `toggleMute` (M), `tone`/`hiss` (note and noise helpers), `musicStep` (one 16th note; the lead repeats a seeded 4-bar phrase), `ambEvent`, **`updateSound()`** (every frame: crossfades the theme on a place change, schedules 0.3 s ahead), **`sfx(name,{ground})`** (step, jump, land, splash, sit, stand, give, catch, golden, poke, poked, boop, ui, open, close, deny, pick, putdown, crunch, munch, juicy, gulp, burp, ahh, brew, menu) |
| 1084 | **Player / input** | `cam{yaw,pitch,dist,target}`, `keys` Set, `joy`, `SPAWN {0, 9.5}`, `updatePlayer` (WASD relative to camera, Shift runs 5.6 vs walk 3.0, water slows by .55, jump vy 7, gravity 22, footstep sounds by tile), `blocked`, `supportY`, `nearestSeat` (skips desks you don't own), `nearestOtherDesk`, `deskOwnerName`, `sitOn` (starts eating if you hold food), `standUp`, `tryInteract` (E key: stand, read board, take food from the counter, brew coffee, sit, or "That's X's desk") |
| 1131 | Keyboard | Esc closes modal or card; Space jumps; E interacts; F eats or drinks; Q puts food down; M mutes |
| 1147 | Pointer | drag to orbit, wheel to zoom 4..24, `handlePick` raycast (single click opens card, double click within 400 ms pokes, clicking the board opens it) |
| 1169 | Touch | joystick `#joy`, `#tUse/#tRun/#tJump`; `resize`, `applyViewOffset` (shifts the view when the card is open), `updateCamera` |
| 1195 | Labels | `placeEl`, `updateLabels` (projects nameplates and bubbles to screen) |
| 1215 | Minimap | `mmBase` (prerendered), `drawMinimap` (your desk is a gold square), `zoneAt(x,z)` |
| 1241 | **Recognition logic** | `persistRec`/`persistData` (saves USERS, plus the cookie for me on this browser), `pushFeed` (max 40), `pushInbox(rec,item)` (max 50; items carry `fromKey`), **`giveApples(from,to,count,reason,note)`** returns `false`, `{became}` or (guests) `{pending:true}`, **`applyGift`** (the rules; solo or host only), **`afterGift`** (animation, toasts, HUD; the host broadcasts `gift` and sends private `me` updates), `animateGift`, `growCrown`, **`doPoke(from,to,msg,net)`** (2.5 s cooldown for your own pokes; guests send `poke`), `pokeData` (inbox; host broadcasts) |
| 1326 | UI rendering | `toast(html,kind,ms,icon)` (max 3), `statusChip`, `goalText`, `pipsHtml`, `renderMe` (HUD), `renderZone` (also sets `Sound.want`), `renderFeed` |
| 1352 | Coworker card | `giveState{open,reason,count,note}`, `openCard`, `closeCard`, `renderCard` (give-apples form and poke) |
| 1408 | Modals | `showModal(name,html)`, `closeModal`, `openBoard` (Golden Apples list and recent feed), `openInbox` (marks items read, Poke back), `openMenu(confirmDelete)` (your desk, sound sliders and mute, storage status, logout, delete), `renderSoundBtn` (`#bSound`) |
| 1466 | Hint | `scheduleHintHide` |
| 1473 | **Rooms** | `PROTO`, `ROOM_PREFIX`, `CODE_CHARS` (no 0/O/1/I/L), `PEER_OPTS` (`iceServers:[]` = same network only), `newRoomCode`, `normCode`/`validCode`, `inviteLink`, `pubRec`/`pubUsers` (strip email, inbox, given), `charOfKey`, `rememberRoom` (`ga_hosted`/`ga_joined`), `useSoloData`, `roomSend`/`broadcast`/`sendTo`, `setRoomStatus` ('connecting'/'live'/'reconnecting'), **host:** `hostRoom(code,name,fresh)`, `hostAccept`, `setOnline`, `cleanProfile` (validates everything guests send), `findKeyByEmail`, `newUserKey`, **`hostOnMsg`** (hello, login, create, logout, st, update, give, poke, read, delete), **guest:** `joinRoom(code,email)`, `connectHost` (15 s timeout), `guestLost` (retries every 4 s), `mergeRec`, `guestLogin`, **`guestOnMsg`** (welcome, login, user, me, gone, presence, st, gift, poke, err, bye), **shared:** `deleteUser`, `onUserChanged`, **`syncDesks`** (rebuilds only slots whose `S.sig` changed), `removeLocal`, `seatAway`, **`syncPeople`** (one character per other profile, kind remote/local), `applyNetState`, `stepRemote` (interpolates position, mirrors seat/held food/eating/wave), `myNetState`, **`updateRoom(dt)`** (sends your state every 0.12 s when it changes, at least every 2 s), UI: `renderRecentRooms`, `renderRoomBar`, `renderRoomBtn`, `openRoomModal` (code, link, copy, QR, online list, host backup/restore), `restoreRoom` |
| 1741 | **Login / setup / session** | `EMAIL_RE`, `returningUser` (solo: `ga_session`/`ga_last`; host: the email saved in `ga_hosted`), `showLogin` (step 1 `#roomStep` unless in a room or `state.solo`; step 2 `#roomBar` + email), login submit (lowercases and trims; an existing email logs straight in; guests ask the host), `startSession` (solo cookies, or remembers the room + email), join/host/solo/leave handlers, `openSetup('create'|'edit',email)` (shows the auto-assigned desk spot in `#deskNote`), `buildAvControls`, `buildDkControls` (desk steppers, swatches, decor chips capped at 2; any change switches the preview to Desk), setup submit (name of 2+ chars; saves `desk`, allocates `deskSlot`; guests send `create`), `saveProfile` (guests send `update`; host broadcasts) |
| 1866 | Avatar + desk preview | a second WebGLRenderer `pv` (`view:'avatar'|'desk'`; `rig` holds the desk, floor and the seated avatar), `ensurePreview`, `updatePreview`, `updateDeskPreview`, `placePvAvatar`, `setPvView` (`#pvAvatar/#pvDesk`; Randomise is avatar-only), `renderPreview` |
| 1908 | Enter / leave | `enterWorld(rec)` (creates the `me` Character, allocates desks unless a guest, marks the host online, `syncDesks` + `syncPeople`; toasts unread inbox items), `resumeWorld`, `leaveWorld` (host goes offline / guest sends logout), `logout` |
| 1942 | **Main loop** | `frame(now)`: dt is capped at 0.05; runs player, chars, effects, `updateSound`, `updateFood`, desk animations, water/clouds/ducks, selRing, camera, render, labels; minimap every 3 frames; zone, prompt (food, coffee and eating messages too) and card refresh every 0.4 s, and the touch Eat button shows while you hold food; the setup preview renders in setup mode |
| 1985 | Boot | `resize(); drawBoard(); showLogin();`, redraws signs once fonts load, `requestAnimationFrame(frame)` |

## Core data shapes

```js
// User record (USERS[email], localStorage ga_users)
{email, name, role, team, status:'available'|'focus'|'meeting'|'break',
 avatar:{skin,hairStyle,hair,eyes,top,topColor,pants,shoes,acc}, // indexes into AV
 desk:{desk,chairStyle,chair,tech,screen,plant,pet,decor:[]}, // indexes into DK, decor max 2
 deskSlot, // index into DESK_SLOTS, -1 = no desk (all taken)
 received, createdAt, given:{d:'YYYY-MM-DD', n}|null,
 recent:[{from,count,reason,note,at}] /*max 6*/, inbox:[{type:'apple'|'poke',from,fromId,count?,reason?,note?,msg?,at,read}] /*max 50*/}
// Feed item (WORLD.feed, max 40)
{kind:'apple'|'golden', from?, to, count?, reason?, at}
// Spot
{id:'sN', zone, x, z, y, face, pose, approach?, via:[{x,z}], desk?, owner?:email, occ:null|ownerId}
```

Character ids are `'me'` and `'local:<key>'` (key = email on this browser, private key in a room), all held in `state.chars`; `kind` is 'local' (Away) or 'remote' (online in the room). There are no NPCs: only real profiles appear. Don't add fake people or ambient fake gifts/pokes back. Each person has exactly one desk and only the owner may sit at it.

## Common tasks: where to edit

| Task | Where |
|---|---|
| Change the economy | `DAILY_APPLES` / `GOLDEN_AFTER` (app.js ~37). Test expectations (`isGolden(10/11)`, budget 7/10) are in smoke-test.js ~163–171. |
| Text for reasons and pokes | `REASONS`, `POKES` (~149) |
| Desk options | Append to `DK` (~107), then draw the new option in `buildDesk` (~370) at its anchor. The test builds every option, so stub errors (bad colour, missing geometry) show up in `npm test`. |
| Pantry food | Add dishes to `FOODS` (~641): `cat` veg/nonveg/fruit/drink, `snd`, `cols` (crumb colours) and a `b` builder using `db`; use `plate()` for plates so they disappear in the hand. Keep at least 2 per category. `MENU_MS` sets the rotation. |
| Music and ambience | `THEMES`, `AMB` (~849). Sound effects are cases in `sfx` (~933). |
| Avatar options | `AV` (~88) and the painter `paintSkin` (~548). Indexes are stored in cookies, so append new options rather than reordering. |
| Move rooms or furniture | `ZONES` (~262), `buildLayout`, `buildFurniture`. After any change **run `npm test`**: the routing check catches spot-to-spot paths through solids and blocked seat approaches. |
| HUD, card, modals | `renderMe`, `renderCard`, `openBoard/openInbox/openMenu` (~1180–1310) plus the matching markup in index.html |
| Theme | `:root` in css/styles.css (lines 9–36) |
| Rooms | Messages are handled in `hostOnMsg` and `guestOnMsg` (~Rooms section). Anything that changes shared data must go through the host: guests send a message, the host validates (`cleanProfile`, budget checks), saves, then broadcasts public data (`pubRec`) and sends private data (`me`) only to its owner. Add a check to `tests/room-test.js`. |
| A server instead of the host tab | Keep the message protocol and replace `hostRoom`/`hostOnMsg` with a server (for example a Cloudflare Durable Object); guests barely change. |

## Conventions and gotchas

- Code style: dense one-line statements, 2-space indent, `const` arrow helpers, semicolons everywhere, no modules. Match it.
- Always pass user text through `esc()` before it goes into innerHTML.
- World randomness uses the seeded `WR = mulberry32(20261017)` so the layout is deterministic. Gameplay uses `Math.random`.
- Coordinates: x is east, z is south, 1 unit is 1 block. `topMap > 0.55` above the feet counts as solid (`blocked`).
- Desks are not `fbox` furniture: they are per-person Groups added by `placeDesk`, which also writes their collision into `topMap` (`clearDesk` resets it to 0). Empty slots have no collision and no chair.
- `buildFurniture` still calls `WR()` where the old static desks did, so the seeded trees and flowers stay where they were. Keep those calls if you touch the desk loop.
- Audio may only start after a user gesture (`audioInit` on the first pointerdown/keydown). `sfx` is a silent no-op until then and while muted.
- New `fbox` furniture must also call `solidRect`/`raiseTop` or it won't collide, and you may need to update spot `via` paths.
- The test's THREE stub throws on bad colours (anything other than `#rrggbb` passed to `Color.set`), on UVs outside [0,1], and on InstancedMesh index overflow. Keep those valid.
- Cookies hold only the compact profile (~220 B with the desk). Inbox and recent stay in localStorage only.
- The test doesn't render. Check visual changes in a browser (`npm start`, then http://localhost:5500).
- Rooms: never send emails, inboxes or budgets to other guests (use `pubRec`). Guests must not change shared data locally except for instant feedback that the host's reply overwrites (the budget after a gift).
- Rooms only connect on the same network because `PEER_OPTS` has `iceServers:[]`. Adding STUN/TURN servers would let rooms work across networks.
- The test harness runs each client in its own `vm` context, so objects passed between clients are JSON-cloned like real messages.

## Commands

```bash
npm test     # smoke test (104 checks) + room test (51 checks), Node 18+
npm start    # static server on :5500
```
