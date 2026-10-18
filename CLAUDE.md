# Golden Apple — Codebase Mind Map (for Claude)

Read this map before you open any files. Line numbers are approximate (map updated 2026-10-18, app.js = 3371 lines). If they have drifted, run `grep -n "^/\* ===\|^   [A-Z]" js/app.js` to re-locate sections.

## Mind map

```mermaid
mindmap
  root((Golden Apple))
    Stack
      Plain HTML CSS JS
      No build step
      three.js r128 via CDN
      Google Fonts Atkinson Hyperlegible for text, Pixelify Sans for big headings
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
      localStorage ga_users ga_world ga_last ga_hint_hidden ga_sound ga_vitals ga_fish ga_arcade ga_gym ga_slots
      rooms: ga_room_CODE on the host, ga_hosted, ga_joined
    Rooms
      host tab is the room, guests mirror it
      WebRTC via PeerJS, no ICE servers so same Wi-Fi only
      6-char invite code, ?room=CODE link, QR
    World
      96x96 grid, 1 block = 1 m
      tileMap and topMap collision heights
      ZONES desks pantry restroom playroom gym play lake plus plaza
      SPOTS seats and poses
      DESK_SLOTS 24, one personal desk each
      Ring path routing, test only
      Eco campus: Green Loop trail, solar, wind, mobility hub, garden, meadow, orchard
      info boards, fingerposts, campus map, decoration only
    Day and night
      30 min day, 30 min night, from the clock
      sky, sun, moon, stars; no clock shown
      80 lamps on at dusk, off at dawn, incl. solar bollards
    Playground
      tennis and badminton courts, stands, scoreboards
      two players only: challenge with E, accept with E
      exact ball flights; the receiver calls each point
      first to 10 win by 2, Q leaves, winner celebrates
    Gym
      6 cardio machines plus a punching bag, 5 strength spots
      E start at default level, W/S level, E stop
      heart rate drives the cost; sets of 10 with rests
      sweat, post-workout recovery and hunger, sofa, water cooler
    Playroom
      5 arcade cabinets in a circle under a turning ARCADE banner
      10 Golden Reels slot machines in two rows, play credits only
      Player 2 joins in a room, P1 runs the game
      2 sofas and a coffee table, best rest indoors
    Fishing
      8 species, rod stand by the lake path
      cast, nibble, bite, strike, reel with tension
      keep or release, catch log in the Menu
    Needs
      health, energy, restroom bars
      food, coffee and rest refill; low values slow you
    Restroom
      3 stalls and 2 showers, hidden inside, Occupied sign and label
      wash hands at the sinks
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
| `index.html` | 276 | Every screen as static markup: `#screen-login`, `#screen-setup`, `#hud` (with `#card`, `#touch`, `#minimap`, `#feed`), `#modal`, `#toasts`, `#bootErr`. The start screen has `#roomStep` (join/create forms, `#roomRecent`, `#soloBtn`) and `#roomBar`; the HUD has `#bRoom`. It loads three.js r128, PeerJS 1.5.4 and qrcodejs 1.0.0 from cdnjs, then `js/app.js`. |
| `css/styles.css` | 362 | `:root` tokens (bark, cream, gold, apple, the `--st-*` status colours and the `--f-body` (Atkinson Hyperlegible, all text) and `--f-display` (Pixelify Sans, 24px+ headings and numbers only) fonts), then components (`.panel .btn .tag .bubble .chip .bar .pips`) and per-screen styles. Pixel look: hard inset box-shadows, `image-rendering:pixelated`. |
| `js/app.js` | 3561 | All logic in one `(function(){'use strict'; ... })();` IIFE. Lines are dense one-liners: read by range, not whole. |
| `tests/harness.js` | 181 | `createClient({net,search})` runs app.js in its own `vm` context (fake DOM, cookie jar, localStorage, math-faithful THREE stub, strict Web Audio stub) and exposes internals as `client.G` by regex-replacing the final `})();`, so **keep `})();` as the last line of app.js**. `createPeerNet()` is an in-memory PeerJS stand-in (signalling + data connections, JSON-cloned messages, flushed every frame). `step(clients,n,dt,net)` advances several clients on one shared clock. |
| `tests/room-test.js` | 230 | Host + two guests in one room (91 checks). |
| `tests/smoke-test.js` | 610 | One browser on the harness, plus a touch phone client (296 checks). `createClient({coarse:true})` fakes a phone held sideways. |
| `package.json` | — | `npm start` runs `npx serve -l 5500 .`; `npm test` runs `node tests/smoke-test.js && node tests/room-test.js`. No dependencies. |
| `README.md` | — | User-facing docs, "Good first changes" table, storage notes, known limits. |
| `.vscode/` | — | Live Server recommendation, port 5500, 2-space tabs, LF line endings. |

There is no bundler, no framework and no server: rooms are peer-to-peer between browsers.

## js/app.js section index (line ≈)

| Line | Section | Key names |
|---|---|---|
| 1 | TOC comment | — |
| 40 | Boot guard | if `!window.THREE`, shows `#bootErr` and returns |
| 45 | **Rules** | `DAILY_APPLES=10`, `GOLDEN_AFTER=10`, `isGolden(n)` (n > 10) |
| 49 | helpers | `$`, `clamp`, `rand`, `pick`, `mulberry32` (seeded RNG), `hashStr`, `todayKey`, `esc` (HTML escape, use it for all innerHTML), `timeAgo`, `shade`, `angleLerp`, `reduceMotion`, `coarse` (touch), `isTyping` |
| 67 | Pixel icons | `APPLE_MAP`, `pixelIcon`, `ICON_APPLE/GOLD/EMPTY/POKE` (data URLs) |
| 79 | **Storage** | `Store` (localStorage with in-memory fallback, JSON), `Cookies` (tries the `Partitioned; SameSite=None; Secure` variants in turn, verifies by read-back), `b64e/b64d` |
| 96 | Avatar options | `AV` (palettes and styles), `AV_KEYS` order (skin, hairStyle, hair, eyes, top, topColor, pants, shoes, acc, gender; gender is last so old 9-number cookies load as 0 = Any), `AV_STYLE` (stepper rather than swatch), `GENDER_ORDER` (UI order), `AV_BIAS` (per-gender option weights), `pickW`, **`randomAvatar(gender)`**, `avatarToArr/arrToAvatar`. `paintSkin` hashes only the first 9 keys so gender never reshuffles an existing look; Female adds lips and lashes |
| 115 | **Desk options** | `DK` (desk, chairStyle, chair, tech, screen, plant, pet, decor), `DK_KEYS` order, `DK_STYLE` (steppers), `DECOR_MAX=2`, `DESK_DEFAULT` (all index 0, no decor; used when the user picks nothing), `deskToArr/arrToDesk` (8 numbers, decor as a bitmask), `deskOf(rec)` (normalised copy), `randomDesk()` (any options, 0-2 different decor items) |
| 138 | **Data model** | `USERS` (from `ga_users`, or the room's profiles), `room` (mode null/'host'/'guest', code, name, status, peer, hostConn, conns, online Set, data), `kOf(u)` (profile key: email on this browser, `u.key` in a room), `saveUsers`/`saveWorld` (solo localStorage, host room data, guests never save), `findUser` (localStorage first, then rebuild from cookie), `putUser`, `writeProfileCookie` (compact keys e,n,r,t,s,a,rc,c, plus k = desk array and ds = desk slot), `budgetLeft`, `spendBudget` (`given={d:todayKey,n}`) |
| 161 | Content tables | `REASONS`, `POKES`, `STATUS` |
| 166 | World / demo purge | `WORLD={v:2,feed:[]}` stored under `ga_world`. `purgeDemo()` runs once when an old v1 world is found: it removes inbox items whose `fromId` starts with `npc:`, the matching `recent` entries and apple counts (revoking Golden status if needed), and feed items that don't involve real users |
| 184 | **state** | `{mode:'login'|'setup'|'world', me, player, chars:Map, selected, pokeMsg, cookieOK, modal, setup, hintHidden}`; `state.setup` holds `{mode,email,av,desk}` while the setup screen is open |
| 190 | Three.js core | `renderer`, `scene`, `camera`, fog, sky, lights, `sun` shadows (`SHADOWS`, off when `coarse`), `UNIT_BOX` |
| 212 | Textures | `canvasTex`, `noiseTex`, `waterTex`, `glowTex`, 16px **atlas** `TILE_NAMES` (16 tiles), `blockGeo`, `BLOCK_TYPES` |
| 269 | **World layout** | `N=96, HALF=48`, `tileMap`, `topMap` (collision height per cell: 0 ground, -1 water, 2 walls, 99 trunks), `idx`, `cellTop`, `solidRect`, `raiseTop/setTop` |
| 282 | **ZONES** | desks (N, z -38..-17), pantry (E, x 18..33), restroom (W, x -31..-20), playroom (NE, x 16..31, z -31..-14, carpet, door on the west side), gym (NW, x -32..-17, z -31..-14, rubber floor, door on the east side), play (SE, x 22..44, z 8..37: open air and fenced, built in `buildFurniture`, not by the walled-zone loop), lake (S, z≈18..44). `ECO_AREAS` (just after) names the outdoor eco areas for `zoneAt`; they are not zones. Each zone has `inside`, `gate` and `spoke` (index into `RING`, 8 points r=3.4 around the plaza); the playroom and gym also have `walk` (corner points between its gate on the Pantry path and its door) |
| 301 | Spots | `SPOTS[]`, `addSpot({zone,x,z,y,face,pose,approach,via,desk})`; poses are sit, stand, coffee, wash, stall (also the showers), look, arcade, gym (sofa seats also carry `sofa:true`). Desk spots also get `owner` (email) while a desk is built there |
| 308 | `buildLayout()` | plaza disc, paths, zone floors and walls (glass for desks and pantry), lake ellipse `lakeE`, dock, Green Loop and lake trails, Meadow Walk, meadow and paver grounds (tiles `trail`, `paver`, `meadow`), green roof edges on every walled zone, hedge border |
| 343 | `tree`, `bench`, `plant`, `sign` | furniture helpers; `fbox(...)` queues boxes into `FURN.noise/glow/glass` |
| 396 | **Personal desks** | `DESK_SLOTS[]` (`{x,dz,tw,zc,spot,label:'Pod E · desk 3',desk}`), `DESK_ORDER` (slots nearest the door first), `dmat` (cached materials), `db`/`grp` box helpers, **`buildDesk(cfg)`** returns `{root,anim}` in desk-local space (sitter on +z facing -z; plant back-left, pet back-right, decor front corners, chair at z=1), `animateDesk` (pet bob/wag/swim, globe spin), **`placeDesk(slot,cfg,owner)`** / **`clearDesk(slot)`** (also set and reset `topMap` for the desk and chair), **`allocDesk(rec)`** (keeps a valid unshared slot or takes the next free one, -1 when full), `deskLabel` |
| 511 | `buildFurniture()` | 6 desk pods x 4 = 24 **empty desk slots** with floor mats and desk spots (`desk:true`), pantry tables A/B with `pantryVia`, lights (`addLamp` for every area; see Day and night), the fishing rod stand by the lake path, restroom: 3 stalls (front walls with doorways, toilets inside) plus `STALLS[]` entries with a hinged door `pivot` and an Occupied `sign` (`STALL_MAT`), sinks with wash spots, plaza benches, **Orchard Board** (`boardMesh`, `BOARD_POS`), lake benches and viewpoints, signs, then the **Eco campus** block: helpers `info` (fact board), `finger` (signpost), `recycle`, `refill`, `planter`, `living` (living wall), `solar`; Solar Grove, Wind Row (rotors in `ECO_SPIN`, turned in `frame`), Mobility Hub, Kitchen Garden, Wildflower Meadow, Heritage Orchard (benches are `zone:'plaza'` seats), floating wetlands, an info board per place, welcome arch, campus map (drawn from `tileMap`), fingerposts, bins, refill points, `bollard` lamps, plaza grasses |
| 779 | `buildTrees()` | big plaza apple tree, so `TREE_APPLE_SLOTS`; random small trees and flowers |
| 803 | `finalizeMeshes()` | turns the `BLOCKS` and `FURN` queues into InstancedMeshes |
| 825 | Tree apples / board | `treeApples` InstancedMesh(40), `updateTreeApples`, `drawBoard()` (canvas texture), `clouds`, `ducks` |
| 864 | **Day and night** | `DAY_MS` (60 min), `TWI` (dusk/dawn width), `DN{force,level,prev,sky}` (`force` pins a phase for tests), `cyclePhase()` (clock-based: 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight), `daylightAt(p)` (1 day, 0 night, smooth twilight), `LOOK` day/twi/night palettes (sky, fog, hemisphere, ambient, sun), `mixHex`, `lookAt`, `SUN_DIR` (used by `updateCamera` for the sun/moon light), `skyGroup` (follows the camera: `sunDisc`, `moonDisc`, `stars` InstancedMesh), `AREA_LIGHTS` (5 PointLights: desks, pantry, restroom, plaza, lake), **`updateDayNight(dt)`** (sky repaint, lights, fog, clouds, area lights, lamps on/off one by one with warm-up flicker, dusk/dawn toasts). Lamps live with the desks code: `LAMPS[]`, `LAMP_MAT` (off/on/cool), `POOL_GEO`, `poolTex`, `LR` (own RNG), **`addLamp(kind,x,z,{zone,cool,px,pz})`** (street, floor, wall, lantern) |
| 925 | **Pantry food** | `MENU_MS=300000`, `COUNTER_X`, `SLOT_Z` (8 counter slots), `COFFEE_Z`, `BREW_TIME=2.4`, `FOOD_CATS`, `MENU_PLAN` (veg, nonveg, fruit, drink, two each), **`FOODS`** (`{id,name,cat,snd:'crunch'|'munch'|'juicy'|'gulp',hot?,cols,b:g=>model}`; 6 per category plus `coffee`), `FOOD` map, `isDrink`, `buildFood(id,inHand)` (in the hand, plates and boards are left out), `menu{bucket,items,mins}`, `menuBucket()` (clock / 5 min, so every browser shows the same menu), `menuFor(bucket)` (seeded pick), `counterGroup`, `drawMenuBoard` (chalkboard texture with a countdown), **`refreshMenu(b)`** (rebuilds trays, veg/non-veg marks and items; toasts people in the Pantry), `coffeeLight`, `brew{on,t}`, `nearestCounterItem`, `nearCoffee`, `holdFood`, `putDownFood`, `startBrew`, **`startEat`**, `mouthPos`, **`updateFood(dt)`** (menu clock, brewing steam, hot-drink steam, crumbs and eat sounds until `eatTime`, finishing with a burp or ahh) |
| 1023 | **Avatars** | `PX=1.8/32`, `PARTS` UV nets (Minecraft-style 64x64 skin), `paintSkin(av)` returns a canvas, `buildAvatar(av)` returns `{root,model,hips,legR/L,armR/L,headPivot,canvas,disposables}`, `headIcon`, `makeApple` |
| 1123 | **class Character** | `{id, kind:'me'|'local', data, root, anim{pose,speed,run,air,celebrate,startle,poke,give,wave,play,gym,sport,swing,swingHi}, crown, tag, bubble}` plus `held`/`heldMesh`, `rodMesh` and methods `setAvatar` (keeps the held item and rod), `hold(id)`, `dropHeld()`, `holdRod()`, `dropRod()`, `golden` (getter), `refresh` (nameplate), `say`, `hop`, `faceTo`, `update(dt)` (procedural limb animation; `anim.eat` 'eat' raises the arm to the mouth and jiggles it, 'drink' tilts the head back; with a rod: held-out arm, `anim.cast` swing and `anim.reel` cranking; `anim.play` holds the arcade controls; `anim.gym` `{k,lvl,ph,rest}` drives every workout pose and `gymProp` adds dumbbells or a barbell; `anim.sport` holds a racket (`racketProp`) ready and `anim.swing` plays a forehand or overhead swing), `dispose` (also clears fishing line graphics) |
| 1225 | Walk routes | `routeFromTo(a,b)` (reverse a.via, then inside, gate, ring arc, gate, inside, b.via, spot). Not used in play; the test uses it to prove the layout is connected. `placeAt` (puts Away users at their desk) |
| 1243 | People registry | `allPeople()` |
| 1247 | Effects | particles `spawnP/burst` (PMAX 520), `fly()` projectiles, `ringWave`, `selRing`, `handPos/headPos` |
| 1280 | **Sound** | Web Audio only, no files. `SND` (`ga_sound`: music, sfx, muted), `Sound` (ctx, gain buses out/musBus/mus/lead/echo/amb/fx, noise buffer, beds wind/water/hum), `THEMES` (per place: bpm, root, chord `prog`, `scale`, `lead`/`pad` waves, `bass` steps, `dens`, `perc`, `echo`, `seed`), `AMB` (bed levels plus event type and gap), `zoneKey`, `audioInit` (on first pointerdown/keydown), `applyVolumes`, `toggleMute` (M), `tone`/`hiss` (note and noise helpers), `musicStep` (one 16th note; the lead repeats a seeded 4-bar phrase), `ambEvent`, **`updateSound()`** (every frame: crossfades the theme on a place change, schedules 0.3 s ahead), **`sfx(name,{ground})`** (step, jump, land, splash, sit, stand, give, catch, golden, poke, poked, boop, ui, open, close, deny, pick, putdown, crunch, munch, juicy, gulp, burp, ahh, brew, menu) |
| 1455 | **Health, energy and the restroom** | `VITAL_DEFAULT` (hp 85, en 85, bl 15, clean, plus hidden `st` stomach, `stEn`, `fl` fluid on its way, `caf` active caffeine, `cafIn` caffeine still kicking in), **`ACT`** (per-minute health/energy cost of idle, walking, running, swimming, working, resting, eating, restroom, washing, fishing, reeling — reeling × the fish’s strength — and gaming, workout (cost from `GYM_KINDS` × how far the heart rate has climbed) showering and sport (× how hard you move); sofas rest ×1.25, ×1.3 more after a workout; hidden `sw` sweat, `ex` recent exercise (more hunger, faster rest), `fresh` energy still coming from a shower), body rates `BL_BASE`, `DIGEST` 12/min, `DIGEST_EN`, `FLUID` 8/min, `CAF_IN` 15/min, `CAF_OUT`, `FULL_AT` 40, `JUMP_COST`, `AWAY_BASE`, `V` (live values, `act`, smoothed `trend`, throttles), `nutrition(food)` ({hp,en,fl,caf}), `eatTime` (meals 2.6 s, fruit/drinks 1.6 s), `tooFull`, `applyNutrition` (queues into the stomach/fluid/caffeine; half with unwashed hands; caffeine tolerance), `vitalSpeed`, `canRun`, `loadVitals` (short break: unchanged; up to 3 h: settles towards `AWAY_BASE`; longer: fresh)/`saveVitals` (`ga_vitals`), `currentActivity(P)`, **`updateVitals(dt)`** (activity cost, hunger↔energy links, digestion, caffeine in/out with a dip, fluid to bladder, trends, growls, yawns, urgency, "can't focus" at the desk, one-time tips), `renderVitals` (bars, lighter pending segments `#vXxPend`, trend arrows `#vXxTr`, `#vAct`, `#vWarn`), **restroom:** `STALLS` hold 3 stalls and 2 showers (`kind`, and their own `at`/`face`/`out`/`lab`/`hum` points and door `dir`), `rr{use,wash}`, `SINKS()`, `nearestStall`, `nearestSink`, `startRestroom` (puts food down, closes you in), `startWash`, `endRestroom`, **`updateRestroom(dt)`** (door angles, Occupied/Vacant sign materials, humming notes, hides you, bladder empties over the visit, flush, washing water), `updateStallLabels`, `freeStallOf(ch)` |
| 1628 | **Fishing** | `FISH` (8 species: `{id,name,rar,w:[min,max] kg,odds,str,size,night?,day?,cols}`), `FISH_BY`, `FISH_RACK`, `fishIcon`, `timeBias` (catfish ×3 at night, trout by day), `pickSpecies`, `biteRate` (×1.6 at dusk/dawn), `buildFish`, **lake fish:** `LAKE_FISH`, `lakeSpot`, `addLakeFish`, `removeLakeFish`, `updateLakeFish` (wander, tail wag, jumps with splashes), **line:** `rodTip(ch)` (analytic from shoulder, arm angle and facing), `fishGfx`/`drawLine(ch,to)` (bobber + line for you and remote players; sets `ch.lineTo`), `clearFishGfx`, **your fishing:** `fishing{phase:null|cast|wait|bite|reel|caught,…,ten,stam,dist,catch,hold}`, `fishLog`/`saveFishLog` (`ga_fish` per key: kept, rel, best), `nearRack`, `castTarget` (open water ahead, shorter when tired), `takeRod`, `stowRod`, `endFishing`, `cast` (costs energy; not when exhausted), `startWait`, `scare`, `strike` (hook, or too early), `fishAction`, `landFish` (catch card), `keepFish`, `releaseFish` (throw back), **`updateFishing(dt)`** (cast arc, fish approach, nibbles, bite window, reel physics: pull, surges, tension, stamina, slack, snap), `fishPrompt` |
| 1799 | **Playroom and arcade** | Cabinets are built in `buildFurniture` next to the `sofa()` helper: the five retro cabinets in a circle round `AC` (solid 3x3 cells in the middle, players 2.6 m out) under `arcBanner` (the turning ARCADE crown), and ten slot machines in two rows facing south. `ARCADES[]`: `{i,g (index into GAMES),face,sit,seatY?,x,z,spot,canvas,tex,screen,lever?,lamp?,pull,flash,spinT}`; `gameOf(c)`. Seated cabinets put you on the stool (`anim.pose` sit). **Golden Reels** (`GAMES[5]`, mode `slots`, single player): `SLOT_W`, `SLOT_PAY`, `SLOT_LINES`, `SLOT_BETS`, `SLOT_DAILY`, `SLOT_STRIPS` (seeded), `SLOT_ART` (pixel symbols) + `slotSym`, **`slotLines(stops)`** (pays per line from the left, wild 7), `slotWallet`/`slotSave` (`ga_slots`), `slotPos`, `slotResolve`, `animateSlotCabinets` (levers, top lights). Here: `ARC_W/ARC_H` 384x216, `ARC_STEP` 1/60, button bits `B_U/B_D/B_L/B_R/B_A`, `toIn`, drawing helpers `atxt`/`abox`/`abg`, **`GAMES`** (paddle, snake, orchard, brick, rush: `{id,name,mode:'versus'|'coop',col,goal,init(two),step(s,inputs,dt),draw(g,s),drop?(s),score(s)}`; states are plain JSON so they can be streamed), **`arc`** (`open,c,slot` 1 or 2, `host` (P1 key when you are P2), `p2`, `st`, `joining`, `saved`), `arcKeys`, `sendDm`/**`onDm`** (join, ok, no, in = P2 buttons every change or 0.5 s, st = P1 state every 3rd step, bye, end; 6 s timeouts), `arcadeOccupants(i)` (from your own state and remote `net.arc`), `nearestArcade`, `useArcade` (start, or ask P1 to join), `startArcade`, `exitArcade`, `arcStart` (Enter: pause, or a new game after game over), `saveArcHigh` (`ga_arcade`), **`updateArcade(dt)`** (fixed-step game loop for P1, inputs for P2, overlay text, cabinet screens every 0.25 s via `drawCabinetScreens`), `arcKey`, `arcPrompt` |
| 2084 | **Gym** | Machines are built in `buildFurniture` (`gymSpot` → `GYM[]`: `{i,kind,spot,ap,face,y,sit,rig}`; `rig` holds the moving parts), with `GYM_COOLER`. Here: **`GYM_KINDS`** (treadmill, elliptical, bike, bag, dumbbell, squat, chest, lat: `{name,cat:'cardio'|'strength',move?,prop?,lv,sub?,kmh?,rate,hr,hp,en,sw}` per level), `REPS` 10, `SET_REST` 20 s, `REST_HR`, `HR_CALM`, **`gym`** (`use` (the machine), `lvl`, `t`, `hr`, `reps`, `set`, `sets`, `rest`, `km`), `canPush`, `gymWho(M)` (you or a remote player from `net.gym`), `nearestGym`, `nearCooler`, **`startGym`**, **`stopGym`**, `gymLevel`, **`updateGym(dt)`** (machine parts for every occupant, heart rate, reps and rests, distance, easing off and exhaustion, treadmill steps and punches, sweat drops), `animateMachine`, `gymLabel`, `gymPrompt`, `gymNearPrompt`, stats `gymStats`/`saveGymStats`/`gymStatsHtml` (`ga_gym`) |
| 2177 | **Playground** | Courts are data in `COURTS` (lines, net, `netH`, `area` per half, scoreboard spot) and are built in `buildFurniture` (fence, lines, nets, scoreboards, stands with seat spots). Here: **`SPORT`** (tennis, badminton: `g`, drag `k`, `reach`, `lo`/`hi`, `spd`, `serveY`, `home`), `WIN_AT` 10, `isOver` (win by 2), `halfAt`, `courtHere`, `inCourt`, `playersIn`, **ball:** `newBall`, `ballAt`/`ballVel` (exact formulas), `solveShot`, `netClear`, **`makeShot`** (aim point + error from quality, flight raised to clear the net), **`stepBall`** (net, bounce, landing; the judge calls `awardPoint`), `landingOf`, **challenges:** `challenge`, `acceptInvite`, `courtInteract` (chooser modal), **`onMatchDm`** (mi invite, ma accept, mn no, mh hit, mp point, mq quit), **match:** **`mt`** (`on,c,side,opp,sc,server,phase:serve|rally|point,ball,seq,pseq,…`), `startMatch`, `startPoint`, `launch`, `serve`, `matchSwing`, `returnShot`, `awardPoint`/`applyPoint`, **`endMatch`** (winner by score, toasts, `celebrate`), `quitMatch`, `clampToHalf`, **`updateMatch(dt)`**, **views:** `COURT_FX` (ball, shadow, landing ring, spectator ball, announcements), `updateCourtViews`, `drawScoreboard`, `renderMatchBar` (`#matchBar`), `matchPrompt`, `courtPrompt` |
| 2406 | **Player / input** | `cam{yaw,pitch,dist,target}`, `keys` Set, `joy`, `SPAWN {0, 9.5}`, `updatePlayer` (WASD relative to camera, Shift runs 5.6 vs walk 3.0, water slows by .55, jump vy 7, gravity 22, footstep sounds by tile), `blocked`, `supportY` (frozen while in a stall, at an arcade or on a gym machine; speed × `vitalSpeed()`, no running unless `canRun()`; wash pose at a sink), `nearestSeat` (skips desks you don't own), `nearestOtherDesk`, `deskOwnerName`, `sitOn` (starts eating if you hold food and aren't full), `standUp`, `tryInteract` (E key: stand, read board, with a rod cast/strike, take a rod at the stand, take food, brew coffee, wash hands, use a stall, sit, or "That's X's desk"); frozen while casting, reeling or holding a catch; walking off reels the line in |
| 2469 | Keyboard | while the arcade is open every key goes to `arcKey`; otherwise Esc closes modal or card; Space jumps; E interacts (hold E to reel; starts and stops gym machines); W/S change the level on a gym machine; in a match Space swings and Q leaves; F eats or drinks; Q puts food down or the rod back; K keeps / R releases a catch; M mutes |
| 2489 | Pointer | drag to orbit, wheel to zoom 4..24, `handlePick` raycast (single click opens card, double click within 400 ms pokes, clicking the board opens it) |
| 2511 | Touch | `coarse` → `html.touch-ui`, plus `html.phone-ui` when `phoneUI` (short screen side < 600 px; both set near `coarse` at the top). Floating stick: `#moveZone` (left 42%) places `#joy` where the thumb lands; `JOY_R` walk radius, past `JOY_RUN` sets `joy.run`; a quick tap there calls `handlePick`. Canvas: one finger looks, two fingers pinch (`ptrs`, `pinch`). Buttons `#tJump` (Swing in a match), `#tUse` (label from **`useVerb()`**, which mirrors `tryInteract`; hold to reel), `#tEat`, `#tDrop` (`dropAction` = Q); `updateTouchButtons` runs with the 0.4 s prompt refresh. Landscape only: `#rotate` overlay in portrait (CSS), `goLandscape` (fullscreen + `screen.orientation.lock`, first tap), `toggleFull` (`#bFull`). Phone HUD: `#mePanel`, `#hudTr`, `#hudActions` + `#bMore` toggle `.open` (stats and tray one at a time). Then `resize`, `applyViewOffset`, `updateCamera` |
| 2540 | Labels | `placeEl`, `updateLabels` (projects nameplates and bubbles to screen) |
| 2560 | Minimap | `mmBase` (prerendered), `drawMinimap` (your desk is a gold square), `zoneAt(x,z)` |
| 2586 | **Recognition logic** | `persistRec`/`persistData` (saves USERS, plus the cookie for me on this browser), `pushFeed` (max 40), `pushInbox(rec,item)` (max 50; items carry `fromKey`), **`giveApples(from,to,count,reason,note)`** returns `false`, `{became}` or (guests) `{pending:true}`, **`applyGift`** (the rules; solo or host only), **`afterGift`** (animation, toasts, HUD; the host broadcasts `gift` and sends private `me` updates), `animateGift`, `growCrown`, **`doPoke(from,to,msg,net)`** (2.5 s cooldown for your own pokes; guests send `poke`), `pokeData` (inbox; host broadcasts) |
| 2671 | UI rendering | `toast(html,kind,ms,icon)` (max 3), `statusChip`, `goalText`, `pipsHtml`, `renderMe` (HUD), `renderZone` (also sets `Sound.want`), `renderFeed` |
| 2697 | Coworker card | `giveState{open,reason,count,note}`, `openCard`, `closeCard`, `renderCard` (give-apples form and poke) |
| 2753 | Modals | `showModal(name,html)`, `closeModal`, `openBoard` (Golden Apples list and recent feed), `openInbox` (marks items read, Poke back), `openMenu(confirmDelete)` (your catches via `fishStatsHtml`, your desk, sound sliders and mute, storage status, logout, delete), `renderSoundBtn` (`#bSound`) |
| 2815 | Hint | `scheduleHintHide` |
| 2822 | **Rooms** | `PROTO`, `ROOM_PREFIX`, `CODE_CHARS` (no 0/O/1/I/L), `PEER_OPTS` (`iceServers:[]` = same network only), `newRoomCode`, `normCode`/`validCode`, `inviteLink`, `pubRec`/`pubUsers` (strip email, inbox, given), `charOfKey`, `rememberRoom` (`ga_hosted`/`ga_joined`), `useSoloData`, `roomSend`/`broadcast`/`sendTo`, `setRoomStatus` ('connecting'/'live'/'reconnecting'), **host:** `hostRoom(code,name,fresh)`, `hostAccept`, `setOnline`, `cleanProfile` (validates everything guests send), `findKeyByEmail`, `newUserKey`, **`hostOnMsg`** (relays every `dm`, including the match messages; hello, login, create, logout, st, update, give, poke, read, delete, dm), **guest:** `joinRoom(code,email)`, `connectHost` (15 s timeout), `guestLost` (retries every 4 s), `mergeRec`, `guestLogin`, **`guestOnMsg`** (welcome, login, user, me, gone, presence, st, gift, poke, err, bye, dm), **shared:** `deleteUser`, `onUserChanged`, **`syncDesks`** (rebuilds only slots whose `S.sig` changed), `removeLocal`, `seatAway`, **`syncPeople`** (one character per other profile, kind remote/local), `applyNetState`, `stepRemote` (interpolates position, mirrors seat/held food/eating/wave, arcade play pose, gym workout, sport stance and racket, swings and celebrations, rod, cast/reel pose and line/bobber; `stall` hides them and marks that stall Occupied; `act:'wash'` plays the wash pose), `myNetState` (adds `stall`, `act`, `rod`, `bob`, `fph`, `arc` = [cabinet, slot, spins, wins], `gym` = [machine, level, resting], `ct` = [court, side, score0, score1, pointSeq, server, phase, winner], `cb` = your last hit, `sw`/`swh` swing counter, `cel` celebration counter), **`updateRoom(dt)`** (sends your state every 0.12 s when it changes, at least every 2 s), UI: `renderRecentRooms`, `renderRoomBar`, `renderRoomBtn`, `openRoomModal` (code, link, copy, QR, online list, host backup/restore), `restoreRoom` |
| 3106 | **Login / setup / session** | `EMAIL_RE`, `returningUser` (solo: `ga_session`/`ga_last`; host: the email saved in `ga_hosted`), `showLogin` (step 1 `#roomStep` unless in a room or `state.solo`; step 2 `#roomBar` + email), login submit (lowercases and trims; an existing email logs straight in; guests ask the host), `startSession` (solo cookies, or remembers the room + email), join/host/solo/leave handlers, `openSetup('create'|'edit',email)` (opens on the Profile tab; shows the auto-assigned desk spot in `#deskNote`), **tabs** `SETUP_TABS` profile/avatar/desk with `setTab(t,focus)` (`#tabX` buttons, `#panelX` fieldsets, arrow/Home/End keys; desk tab = desk preview), `buildGender`/`pickGender` (re-rolls until `state.setup.avTouched`), `rollAvatar`, `buildAvControls` (skips gender), `buildDkControls` (desk steppers, swatches, decor chips capped at 2), `#randomBtn` / `#randomDeskBtn` / `#resetDeskBtn`, setup submit (name error jumps to the Profile tab), setup submit (name of 2+ chars; saves `desk`, allocates `deskSlot`; guests send `create`), `saveProfile` (guests send `update`; host broadcasts) |
| 3231 | Avatar + desk preview | a second WebGLRenderer `pv` (`view:'avatar'|'desk'`; `rig` holds the desk, floor and the seated avatar), `ensurePreview`, `updatePreview`, `updateDeskPreview`, `placePvAvatar`, `setPvView` (driven by `setTab`), `renderPreview` |
| 3273 | Enter / leave | `enterWorld(rec)` (creates the `me` Character, allocates desks unless a guest, marks the host online, `syncDesks` + `syncPeople`; toasts unread inbox items), `resumeWorld`, `leaveWorld` (host goes offline / guest sends logout), `logout` |
| 3309 | **Main loop** | `frame(now)`: dt is capped at 0.05; runs player, chars, effects, `updateSound`, `updateFood`, `updateRoom`, `updateVitals`, `updateRestroom`, `updateDayNight`, `updateFishing`, `updateLakeFish`, `updateArcade`, `updateGym`, `updateMatch`, desk animations, water/clouds/ducks, selRing, camera, render, labels and stall labels; minimap every 3 frames; zone, prompt (food, coffee and eating messages too) and card refresh every 0.4 s, and the touch Eat button shows while you hold food; the setup preview renders in setup mode |
| 3364 | Boot | `resize(); drawBoard(); showLogin();`, redraws signs once fonts load, `requestAnimationFrame(frame)` |

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
| Pantry food | Add dishes to `FOODS` (~935): `cat` veg/nonveg/fruit/drink, `snd`, `cols` (crumb colours) and a `b` builder using `db`; use `plate()` for plates so they disappear in the hand. Keep at least 2 per category. `MENU_MS` sets the rotation. |
| Needs and restroom | Activity costs in `ACT`, body rates (digestion, fluid, caffeine) in the constants after it, food values in `nutrition`, thresholds in `updateVitals`/`vitalSpeed`/`renderVitals`. Effects should build up over time, never land instantly. Stall geometry is in `buildFurniture` (restroom); stall behaviour in `updateRestroom`. Never show anyone inside a stall: they are hidden and others see only "Occupied". |
| Day and night, lamps | Cycle length `DAY_MS`, palettes `LOOK`, switch thresholds in `updateDayNight`. Add a lamp with `addLamp` in `buildFurniture` (the lights block); keep posts off walking routes and seat approaches and run `npm test` (the routing check catches it). |
| Fishing | Species in `FISH` (rarity `odds`, `str` for how hard they fight, weights); bite timing in `startWait`/`biteRate`; fight feel in the reel block of `updateFishing` (reel speed, tension rates, surges, stamina); energy costs in `ACT.fishing`/`ACT.reeling` and `cast`. |
| Tennis and badminton | Ball feel in `SPORT`; shot accuracy and aim in `returnShot`/`makeShot`; rules in `stepBall` (who wins a point) and `isOver`; court shapes in `COURTS` (keep the nets on whole cells: collision is per cell). Match messages are `onMatchDm`; add room-test checks for any rule change. |
| Gym | Machine feel in `GYM_KINDS` (per level: `rate` animation speed, `hr` target, `hp`/`en` cost per minute at that heart rate, `sw` sweat); sets in `REPS`/`SET_REST`; after-effects in `updateVitals` (`V.ex`, `V.sw`). New machines: add a kind, a pose case in `Character.update`, moving parts in `animateMachine`, and place it with `gymSpot` in `buildFurniture`, then run `npm test`. |
| Arcade games | Add a game to `GAMES` (keep the state JSON-friendly; read inputs as `{u,d,l,r,a}` for both players; versus games play the CPU when `!s.two`), then add a cabinet in the Playroom block of `buildFurniture` with `g` set to the game's index (mode `slots` games are single-player and can be seated). Arcade keys are latched (`arc.tap`), so a quick tap still reaches `step`; detect presses yourself (see Golden Reels' `s.prev`). Every game is fuzzed by the smoke test. The Player 2 protocol lives in `onDm`. |
| Music and ambience | `THEMES`, `AMB` (~849). Sound effects are cases in `sfx` (~933). |
| Avatar options | `AV` (~88) and the painter `paintSkin` (~548). Indexes are stored in cookies, so append new options rather than reordering. |
| Campus scenery | The Eco campus block at the end of `buildFurniture`; new outdoor area names in `ECO_AREAS`. Keep it off paths, seat approaches and `via` points, use `zone:'plaza'` for any new bench (the routing check skips plaza seats), and run `npm test`. |
| Move rooms or furniture | `ZONES` (~262), `buildLayout`, `buildFurniture`. After any change **run `npm test`**: the routing check catches spot-to-spot paths through solids and blocked seat approaches. |
| HUD, card, modals | `renderMe`, `renderCard`, `openBoard/openInbox/openMenu` (~1180–1310) plus the matching markup in index.html |
| Theme | `:root` in css/styles.css (lines 9–36) |
| Rooms | Messages are handled in `hostOnMsg` and `guestOnMsg` (~Rooms section). Anything that changes shared data must go through the host: guests send a message, the host validates (`cleanProfile`, budget checks), saves, then broadcasts public data (`pubRec`) and sends private data (`me`) only to its owner. Add a check to `tests/room-test.js`. |
| A server instead of the host tab | Keep the message protocol and replace `hostRoom`/`hostOnMsg` with a server (for example a Cloudflare Durable Object); guests barely change. |

## Conventions and gotchas

- Code style: dense one-line statements, 2-space indent, `const` arrow helpers, semicolons everywhere, no modules. Match it.
- Always pass user text through `esc()` before it goes into innerHTML.
- One type system: Atkinson Hyperlegible (`--f-body`, `FONT_UI`) for all text, including signs, boards and names; Pixelify Sans (`--f-display`, `FONT_PIX`) only for big headings and numbers (24px and up in CSS, the logo, scores, and game titles of 14+ logical px inside the arcade canvas), because below that its C reads as an O. Canvases with text are made with `textCanvas(w,h,draw,S)` at 2-3x resolution and `textTex` (smooth filtering); the arcade canvas is 3x (`ARC_S`) and games still draw in 384x216 units.
- World randomness uses the seeded `WR = mulberry32(20261017)` so the layout is deterministic. Gameplay uses `Math.random`.
- Coordinates: x is east, z is south, 1 unit is 1 block. `topMap > 0.55` above the feet counts as solid (`blocked`).
- Desks are not `fbox` furniture: they are per-person Groups added by `placeDesk`, which also writes their collision into `topMap` (`clearDesk` resets it to 0). Empty slots have no collision and no chair.
- `buildFurniture` still calls `WR()` where the old static desks did, so the seeded trees and flowers stay where they were. Keep those calls if you touch the desk loop.
- Audio may only start after a user gesture (`audioInit` on the first pointerdown/keydown). `sfx` is a silent no-op until then and while muted.
- New `fbox` furniture must also call `solidRect`/`raiseTop` or it won't collide, and you may need to update spot `via` paths.
- The sky is a repainted canvas (`drawSky`); `hemi`, `amb` and `sun` intensities are driven by `updateDayNight`, so don't hard-code them elsewhere. Night sounds swap ambience events through `nightEv`.
- The test's THREE stub throws on bad colours (anything other than `#rrggbb` passed to `Color.set`), on UVs outside [0,1], and on InstancedMesh index overflow. Keep those valid.
- Cookies hold only the compact profile (~220 B with the desk). Inbox and recent stay in localStorage only.
- The test doesn't render. Check visual changes in a browser (`npm start`, then http://localhost:5500).
- Rooms: never send emails, inboxes or budgets to other guests (use `pubRec`). Guests must not change shared data locally except for instant feedback that the host's reply overwrites (the budget after a gift).
- Rooms only connect on the same network because `PEER_OPTS` has `iceServers:[]`. Adding STUN/TURN servers would let rooms work across networks.
- The test harness runs each client in its own `vm` context, so objects passed between clients are JSON-cloned like real messages.

## Commands

```bash
npm test     # smoke test (296 checks) + room test (91 checks), Node 18+
npm start    # static server on :5500
```

## Navigation protocol (token-saving; follow every session)
@.claude/map/TREE.md

1. The mind-tree above is the map of this repo. Trust it; don't `ls`/`find`/glob to rediscover structure.
2. Symbol, line number, or importers → `grep -n "<name>" .claude/map/SYMBOLS.md`, then Read only that range (offset/limit).
3. Start from Hubs / Entry points / Routes and follow `→` import edges instead of broad searches.
4. Map refreshes automatically (SessionStart + Stop hooks). Mid-turn after adding/moving files: `python3 ~/.claude/tools/mindtree.py`.
5. Never hand-edit `.claude/map/*`; if it disagrees with disk, rerun the tool.
