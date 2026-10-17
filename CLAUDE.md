# Golden Apple — Codebase Mind Map (for Claude)

Read this map before you open any files. Line numbers are approximate (map updated 2026-10-17, app.js = 1654 lines). If they have drifted, run `grep -n "^/\* ===\|^   [A-Z]" js/app.js` to re-locate sections.

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
    Files
      index.html - all screens and DOM ids
      css/styles.css - root tokens
      js/app.js - everything else, one IIFE
      tests/smoke-test.js - fake DOM, THREE and Web Audio stubs
    Rules
      DAILY_APPLES 10 per day
      GOLDEN_AFTER more than 10 received
    Storage
      Cookie ga_session 30d
      Cookie ga_p_hash compact profile 180d
      localStorage ga_users ga_world ga_last ga_hint_hidden ga_sound
    World
      96x96 grid, 1 block = 1 m
      tileMap and topMap collision heights
      ZONES desks pantry restroom lake plus plaza
      SPOTS seats and poses
      DESK_SLOTS 24, one personal desk each
    Pantry food
      counter menu changes every 5 min
      E take, F eat, Q put down, coffee machine
      Ring path routing, test only
    Characters
      kinds me local
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
| `index.html` | 213 | Every screen as static markup: `#screen-login`, `#screen-setup`, `#hud` (with `#card`, `#touch`, `#minimap`, `#feed`), `#modal`, `#toasts`, `#bootErr`. It loads three.js r128 from cdnjs, then `js/app.js`. |
| `css/styles.css` | 275 | `:root` tokens (bark, cream, gold, apple, the `--st-*` status colours and the `--f-display/body/num` fonts), then components (`.panel .btn .tag .bubble .chip .bar .pips`) and per-screen styles. Pixel look: hard inset box-shadows, `image-rendering:pixelated`. |
| `js/app.js` | 1654 | All logic in one `(function(){'use strict'; ... })();` IIFE. Lines are dense one-liners: read by range, not whole. |
| `tests/smoke-test.js` | 350 | `eval`s app.js with a fake DOM, cookie jar, localStorage, a math-faithful THREE stub and a strict Web Audio stub (throws on bad node types, non-finite values, exponential ramps to 0). It injects `window.__ga={...}` by regex-replacing the final `})();`, so **keep `})();` as the last line of app.js**. |
| `package.json` | — | `npm start` runs `npx serve -l 5500 .`; `npm test` runs `node tests/smoke-test.js`. No dependencies. |
| `README.md` | — | User-facing docs, "Good first changes" table, storage notes, known limits. |
| `.vscode/` | — | Live Server recommendation, port 5500, 2-space tabs, LF line endings. |

There is no git repo, no bundler, no framework and no server.

## js/app.js section index (line ≈)

| Line | Section | Key names |
|---|---|---|
| 1 | TOC comment | — |
| 32 | Boot guard | if `!window.THREE`, shows `#bootErr` and returns |
| 37 | **Rules** | `DAILY_APPLES=10`, `GOLDEN_AFTER=10`, `isGolden(n)` (n > 10) |
| 41 | helpers | `$`, `clamp`, `rand`, `pick`, `mulberry32` (seeded RNG), `hashStr`, `todayKey`, `esc` (HTML escape, use it for all innerHTML), `timeAgo`, `shade`, `angleLerp`, `reduceMotion`, `coarse` (touch), `isTyping` |
| 59 | Pixel icons | `APPLE_MAP`, `pixelIcon`, `ICON_APPLE/GOLD/EMPTY/POKE` (data URLs) |
| 71 | **Storage** | `Store` (localStorage with in-memory fallback, JSON), `Cookies` (tries the `Partitioned; SameSite=None; Secure` variants in turn, verifies by read-back), `b64e/b64d` |
| 88 | Avatar options | `AV` (palettes and styles), `AV_KEYS` order (skin, hairStyle, hair, eyes, top, topColor, pants, shoes, acc), `AV_STYLE` (stepper rather than swatch), `randomAvatar`, `avatarToArr/arrToAvatar` |
| 107 | **Desk options** | `DK` (desk, chairStyle, chair, tech, screen, plant, pet, decor), `DK_KEYS` order, `DK_STYLE` (steppers), `DECOR_MAX=2`, `DESK_DEFAULT` (all index 0, no decor; used when the user picks nothing), `deskToArr/arrToDesk` (8 numbers, decor as a bitmask), `deskOf(rec)` (normalised copy) |
| 130 | **Data model** | `USERS` (from `ga_users`), `findUser` (localStorage first, then rebuild from cookie), `putUser`, `writeProfileCookie` (compact keys e,n,r,t,s,a,rc,c, plus k = desk array and ds = desk slot), `budgetLeft`, `spendBudget` (`given={d:todayKey,n}`) |
| 149 | Content tables | `REASONS`, `POKES`, `STATUS` |
| 154 | World / demo purge | `WORLD={v:2,feed:[]}` stored under `ga_world`. `purgeDemo()` runs once when an old v1 world is found: it removes inbox items whose `fromId` starts with `npc:`, the matching `recent` entries and apple counts (revoking Golden status if needed), and feed items that don't involve real users |
| 172 | **state** | `{mode:'login'|'setup'|'world', me, player, chars:Map, selected, pokeMsg, cookieOK, modal, setup, hintHidden}`; `state.setup` holds `{mode,email,av,desk}` while the setup screen is open |
| 178 | Three.js core | `renderer`, `scene`, `camera`, fog, sky, lights, `sun` shadows (`SHADOWS`, off when `coarse`), `UNIT_BOX` |
| 197 | Textures | `canvasTex`, `noiseTex`, `waterTex`, `glowTex`, 16px **atlas** `TILE_NAMES` (16 tiles), `blockGeo`, `BLOCK_TYPES` |
| 249 | **World layout** | `N=96, HALF=48`, `tileMap`, `topMap` (collision height per cell: 0 ground, -1 water, 2 walls, 99 trunks), `idx`, `cellTop`, `solidRect`, `raiseTop/setTop` |
| 262 | **ZONES** | desks (N, z -38..-17), pantry (E, x 18..33), restroom (W, x -31..-20), lake (S, z≈18..44). Each has `inside`, `gate` and `spoke` (index into `RING`, 8 points r=3.4 around the plaza) |
| 275 | Spots | `SPOTS[]`, `addSpot({zone,x,z,y,face,pose,approach,via,desk})`; poses are sit, stand, coffee, wash, stall, look. Desk spots also get `owner` (email) while a desk is built there |
| 282 | `buildLayout()` | plaza disc, paths, zone floors and walls (glass for desks and pantry), lake ellipse `lakeE`, dock, hedge border |
| 314 | `tree`, `bench`, `plant`, `sign` | furniture helpers; `fbox(...)` queues boxes into `FURN.noise/glow/glass` |
| 363 | **Personal desks** | `DESK_SLOTS[]` (`{x,dz,tw,zc,spot,label:'Pod E · desk 3',desk}`), `DESK_ORDER` (slots nearest the door first), `dmat` (cached materials), `db`/`grp` box helpers, **`buildDesk(cfg)`** returns `{root,anim}` in desk-local space (sitter on +z facing -z; plant back-left, pet back-right, decor front corners, chair at z=1), `animateDesk` (pet bob/wag/swim, globe spin), **`placeDesk(slot,cfg,owner)`** / **`clearDesk(slot)`** (also set and reset `topMap` for the desk and chair), **`allocDesk(rec)`** (keeps a valid unshared slot or takes the next free one, -1 when full), `deskLabel` |
| 450 | `buildFurniture()` | 6 desk pods x 4 = 24 **empty desk slots** with floor mats and desk spots (`desk:true`), pantry tables A/B with `pantryVia`, restroom sinks and stalls, plaza benches, **Orchard Board** (`boardMesh`, `BOARD_POS`), lake benches and viewpoints, signs |
| 542 | `buildTrees()` | big plaza apple tree, so `TREE_APPLE_SLOTS`; random small trees and flowers |
| 564 | `finalizeMeshes()` | turns the `BLOCKS` and `FURN` queues into InstancedMeshes |
| 586 | Tree apples / board | `treeApples` InstancedMesh(40), `updateTreeApples`, `drawBoard()` (canvas texture), `clouds`, `ducks` |
| 625 | **Pantry food** | `MENU_MS=300000`, `COUNTER_X`, `SLOT_Z` (8 counter slots), `COFFEE_Z`, `EAT_TIME=1.6`, `BREW_TIME=2.4`, `FOOD_CATS`, `MENU_PLAN` (veg, nonveg, fruit, drink, two each), **`FOODS`** (`{id,name,cat,snd:'crunch'|'munch'|'juicy'|'gulp',hot?,cols,b:g=>model}`; 6 per category plus `coffee`), `FOOD` map, `isDrink`, `buildFood(id,inHand)` (in the hand, plates and boards are left out), `menu{bucket,items,mins}`, `menuBucket()` (clock / 5 min, so every browser shows the same menu), `menuFor(bucket)` (seeded pick), `counterGroup`, `drawMenuBoard` (chalkboard texture with a countdown), **`refreshMenu(b)`** (rebuilds trays, veg/non-veg marks and items; toasts people in the Pantry), `coffeeLight`, `brew{on,t}`, `nearestCounterItem`, `nearCoffee`, `holdFood`, `putDownFood`, `startBrew`, **`startEat`**, `mouthPos`, **`updateFood(dt)`** (menu clock, brewing steam, hot-drink steam, crumbs and eat sounds, finishing with a burp or ahh) |
| 723 | **Avatars** | `PX=1.8/32`, `PARTS` UV nets (Minecraft-style 64x64 skin), `paintSkin(av)` returns a canvas, `buildAvatar(av)` returns `{root,model,hips,legR/L,armR/L,headPivot,canvas,disposables}`, `headIcon`, `makeApple` |
| 823 | **class Character** | `{id, kind:'me'|'local', data, root, anim{pose,speed,run,air,celebrate,startle,poke,give,wave}, crown, tag, bubble}` plus `held`/`heldMesh` and methods `setAvatar` (keeps the held item), `hold(id)`, `dropHeld()`, `golden` (getter), `refresh` (nameplate), `say`, `hop`, `faceTo`, `update(dt)` (procedural limb animation; `anim.eat` 'eat' raises the arm to the mouth and jiggles it, 'drink' tilts the head back), `dispose` |
| 891 | Walk routes | `routeFromTo(a,b)` (reverse a.via, then inside, gate, ring arc, gate, inside, b.via, spot). Not used in play; the test uses it to prove the layout is connected. `placeAt` (puts Away users at their desk) |
| 909 | People registry | `allPeople()` |
| 913 | Effects | particles `spawnP/burst` (PMAX 520), `fly()` projectiles, `ringWave`, `selRing`, `handPos/headPos` |
| 946 | **Sound** | Web Audio only, no files. `SND` (`ga_sound`: music, sfx, muted), `Sound` (ctx, gain buses out/musBus/mus/lead/echo/amb/fx, noise buffer, beds wind/water/hum), `THEMES` (per place: bpm, root, chord `prog`, `scale`, `lead`/`pad` waves, `bass` steps, `dens`, `perc`, `echo`, `seed`), `AMB` (bed levels plus event type and gap), `zoneKey`, `audioInit` (on first pointerdown/keydown), `applyVolumes`, `toggleMute` (M), `tone`/`hiss` (note and noise helpers), `musicStep` (one 16th note; the lead repeats a seeded 4-bar phrase), `ambEvent`, **`updateSound()`** (every frame: crossfades the theme on a place change, schedules 0.3 s ahead), **`sfx(name,{ground})`** (step, jump, land, splash, sit, stand, give, catch, golden, poke, poked, boop, ui, open, close, deny, pick, putdown, crunch, munch, juicy, gulp, burp, ahh, brew, menu) |
| 1078 | **Player / input** | `cam{yaw,pitch,dist,target}`, `keys` Set, `joy`, `SPAWN {0, 9.5}`, `updatePlayer` (WASD relative to camera, Shift runs 5.6 vs walk 3.0, water slows by .55, jump vy 7, gravity 22, footstep sounds by tile), `blocked`, `supportY`, `nearestSeat` (skips desks you don't own), `nearestOtherDesk`, `deskOwnerName`, `sitOn` (starts eating if you hold food), `standUp`, `tryInteract` (E key: stand, read board, take food from the counter, brew coffee, sit, or "That's X's desk") |
| 1125 | Keyboard | Esc closes modal or card; Space jumps; E interacts; F eats or drinks; Q puts food down; M mutes |
| 1141 | Pointer | drag to orbit, wheel to zoom 4..24, `handlePick` raycast (single click opens card, double click within 400 ms pokes, clicking the board opens it) |
| 1163 | Touch | joystick `#joy`, `#tUse/#tRun/#tJump`; `resize`, `applyViewOffset` (shifts the view when the card is open), `updateCamera` |
| 1189 | Labels | `placeEl`, `updateLabels` (projects nameplates and bubbles to screen) |
| 1209 | Minimap | `mmBase` (prerendered), `drawMinimap` (your desk is a gold square), `zoneAt(x,z)` |
| 1235 | **Recognition logic** | `persistData(ch)` (saves USERS, plus the cookie for me), `pushFeed` (max 40), `pushInbox` (max 50), **`giveApples(from,to,count,reason,note)`** returns `false` or `{became}`, `animateGift`, `growCrown`, **`doPoke(from,to,msg)`** (2.5 s cooldown per pair) |
| 1299 | UI rendering | `toast(html,kind,ms,icon)` (max 3), `statusChip`, `goalText`, `pipsHtml`, `renderMe` (HUD), `renderZone` (also sets `Sound.want`), `renderFeed` |
| 1325 | Coworker card | `giveState{open,reason,count,note}`, `openCard`, `closeCard`, `renderCard` (give-apples form and poke) |
| 1381 | Modals | `showModal(name,html)`, `closeModal`, `openBoard` (Golden Apples list and recent feed), `openInbox` (marks items read, Poke back), `openMenu(confirmDelete)` (your desk, sound sliders and mute, storage status, logout, delete), `renderSoundBtn` (`#bSound`) |
| 1434 | Hint | `scheduleHintHide` |
| 1441 | **Login / setup / session** | `EMAIL_RE`, `returningUser` (`ga_session` cookie or `ga_last`), `showLogin`, login submit (lowercases and trims; an existing email logs straight in), `startSession`, `openSetup('create'|'edit',email)` (shows the auto-assigned desk spot in `#deskNote`), `buildAvControls`, `buildDkControls` (desk steppers, swatches, decor chips capped at 2; any change switches the preview to Desk), setup submit (name of 2+ chars; saves `desk`, allocates `deskSlot`) |
| 1532 | Avatar + desk preview | a second WebGLRenderer `pv` (`view:'avatar'|'desk'`; `rig` holds the desk, floor and the seated avatar), `ensurePreview`, `updatePreview`, `updateDeskPreview`, `placePvAvatar`, `setPvView` (`#pvAvatar/#pvDesk`; Randomise is avatar-only), `renderPreview` |
| 1574 | Enter / leave | `enterWorld(rec)` (creates the `me` Character, clears and rebuilds every desk, allocates desks for profiles that lack one, spawns the other `USERS` as `local` "Away" characters sitting at their own desk; toasts unread inbox items), `resumeWorld`, `leaveWorld`, `logout` |
| 1607 | **Main loop** | `frame(now)`: dt is capped at 0.05; runs player, chars, effects, `updateSound`, `updateFood`, desk animations, water/clouds/ducks, selRing, camera, render, labels; minimap every 3 frames; zone, prompt (food, coffee and eating messages too) and card refresh every 0.4 s, and the touch Eat button shows while you hold food; the setup preview renders in setup mode |
| 1650 | Boot | `resize(); drawBoard(); showLogin();`, redraws signs once fonts load, `requestAnimationFrame(frame)` |

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

Character ids are `'me'` and `'local:<email>'`, all held in `state.chars`. There are no NPCs: only real profiles appear. Don't add fake people or ambient fake gifts/pokes back. Each person has exactly one desk and only the owner may sit at it.

## Common tasks: where to edit

| Task | Where |
|---|---|
| Change the economy | `DAILY_APPLES` / `GOLDEN_AFTER` (app.js ~37). Test expectations (`isGolden(10/11)`, budget 7/10) are in smoke-test.js ~163–171. |
| Text for reasons and pokes | `REASONS`, `POKES` (~149) |
| Desk options | Append to `DK` (~107), then draw the new option in `buildDesk` (~370) at its anchor. The test builds every option, so stub errors (bad colour, missing geometry) show up in `npm test`. |
| Pantry food | Add dishes to `FOODS` (~635): `cat` veg/nonveg/fruit/drink, `snd`, `cols` (crumb colours) and a `b` builder using `db`; use `plate()` for plates so they disappear in the hand. Keep at least 2 per category. `MENU_MS` sets the rotation. |
| Music and ambience | `THEMES`, `AMB` (~849). Sound effects are cases in `sfx` (~933). |
| Avatar options | `AV` (~88) and the painter `paintSkin` (~548). Indexes are stored in cookies, so append new options rather than reordering. |
| Move rooms or furniture | `ZONES` (~262), `buildLayout`, `buildFurniture`. After any change **run `npm test`**: the routing check catches spot-to-spot paths through solids and blocked seat approaches. |
| HUD, card, modals | `renderMe`, `renderCard`, `openBoard/openInbox/openMenu` (~1180–1310) plus the matching markup in index.html |
| Theme | `:root` in css/styles.css (lines 9–36) |
| Storage or a future backend | Swap out `Store`, `Cookies`, `USERS`, `WORLD`, `persistData`, `giveApples`, `doPoke` |

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
- Not multiplayer: each browser is its own world. Emails are never shown to other users.

## Commands

```bash
npm test     # logic smoke test (102 checks), Node 18+
npm start    # static server on :5500
```
