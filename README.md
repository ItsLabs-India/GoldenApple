# Golden Apple

A block-style 3D office world for workplace recognition. Coworkers log in with an email, build a pixel avatar, set up their own desk, walk between the Work Desks, Pantry, Restroom and Lakeside, poke each other, and give apples for good work. Each person can give **10 apples a day**. Anyone who receives **more than 10 in total** becomes a **Golden Apple**, shown by a spinning gold apple above their head.

**Rooms on the same Wi-Fi.** One person creates a room on the start screen and gets a 6-character invite code, a link and a QR code (Room button in the HUD). Others on the same Wi-Fi open the link or type the code, make a profile and walk into the same office: everyone sees each other move, sit and eat live, and apples, pokes, desks and the Golden Apple feed are shared. It works from any static host, including GitHub Pages. The host's browser tab *is* the room: it keeps everyone's profiles, checks the rules and relays updates, so the host keeps that tab open (the room pauses when it closes and picks up again when they reopen it; guests reconnect on their own). Browsers connect directly with WebRTC; the free PeerJS service is used only for the few-second handshake when someone joins, and no relay servers are configured, so only devices on the same network can connect. **Play on this browser only** keeps the old single-browser mode.

**Your own desk.** During profile setup (or later under Profile) everyone styles their desk: desk colour, chair style and colour, computer (monitor, two monitors, laptop, laptop + monitor), screen colour, a plant, a desk pet (cat, dog, hamster, bunny, goldfish, turtle) and up to two decor items. Skip it and you get the default desk. The desk is placed in the Work Desks room automatically (nearest the door first), marked by a gold square on the minimap, and only its owner can sit there.

**Pantry food.** The Pantry has a food counter with 8 items: 2 veg, 2 non-veg, 2 fruits and 2 drinks, picked from 25 dishes (samosa, masala dosa, chicken biryani, sushi, watermelon, mango lassi and more). The menu changes every 5 minutes on the clock, so everyone sees the same counter, and a chalkboard shows what is on and when the next menu arrives. Walk up to an item and press **E** to take it, then press **F** to eat it right there, or carry it to a table, stool, bench or your desk and sit down to eat. Eating works like Minecraft: the item goes to your mouth with crumbs and crunching, then a burp; drinks tilt back with gulps. **Q** puts the item down. The coffee machine brews a cup when you press **E** next to it.

**Playground.** A fenced sports ground south-east of the plaza: follow the path east from the lake path. It has a blue tennis court and a green badminton court, each with a net, line markings, floodlights for the night and a scoreboard beside the net, plus three-tier stands along the south fence where anyone can sit and watch.

You can't play alone. Stand in one half of a court: the score bar at the top says "No opponent" until someone stands in the other half. Then press **E** to challenge them (if several people are waiting, you choose from a list); they get a message and press **E** to accept. The challenger serves first, then the winner of each point serves. Matches are first to 10 points, win by 2.

Playing: move with **WASD** (Shift to run) inside your own half; the camera starts behind you. **Space** swings (and serves when it's your turn). Hit the ball when it is within reach: a tennis ball after one bounce or on the volley, a shuttle before it touches the ground. A ring on the ground shows where the incoming ball will land. Your timing and how close you are decide how accurate the shot is; hold **A** or **D** while you swing to aim left or right, otherwise you aim away from your opponent. A high ball is smashed. A tennis ball that lands outside the lines or hits the net loses the point; a second bounce loses it for the player who missed it; a shuttle that lands inside the court wins the point. Both players see the score at the top of the screen, and everyone sees it on the court's scoreboard.

**Q** (or the Leave button) ends the match at any time; so does an opponent who walks away or disconnects. The player ahead on points wins (level scores are a draw), the result is announced to both players and to everyone at the Playground, and the winner jumps and celebrates with confetti. Playing costs energy and makes you sweat like a workout (more when you sprint), and very low energy makes your shots less accurate; below 4 energy you have to stop. Matches need a room, because the other player is another person.

**Gym.** North-west of the plaza, off the Restroom path. Cardio along the windows (2 treadmills, 2 ellipticals, 2 exercise bikes) and a punching bag; strength stations: 2 dumbbell spots at a wall mirror, a squat rack, a chest press and a lat pulldown. Walk up to a machine and press **E**: you start at the default level (jog, steady, or a middle weight) and keep going until you press **E** again. **W**/**S** change speed or weight (on a phone, push the joystick up or down). The prompt shows the level, your heart rate, the time, and distance on the treadmill or set and rep on the weights; strength work comes in sets of 10 reps with a 20-second rest. Everyone else sees you running, pedalling, punching or lifting, and two people can't use one machine.

How it works on your body: your heart rate climbs to the level's target over about half a minute, and the health and energy cost follows it, so effort builds up instead of landing at once (the first minute of a jog costs about 5 energy and 2.5 health; after that a jog costs about 6 energy and 3 health a minute, a run about 10 and 4.5). Between sets you get your breath back. The top level needs at least 20 energy (and some food in you): when you drop below that you ease off, and below 6 energy you stop by yourself. You sweat as you go (more on cardio), and sweating sends less to your bladder. Afterwards, for a while, resting recovers energy 30% faster and you get hungry sooner. There's a sofa to recover on, and a water cooler (**E** for a water bottle). Your workout totals are in the Menu.

**Showers.** Two shower cubicles along the Restroom's south wall, with glass doors and Occupied signs. They work like the stalls: press **E** at a free shower, you are hidden inside (others only see "Occupied"), and a "Showering" bar runs for 6 to 12 seconds (longer when you are sweatier). You come out with no sweat and clean hands, and you feel refreshed: about 6 energy over the next few minutes. A shower doesn't use the toilet, so your restroom bar keeps going as normal.

**Golden Reels (slot machines).** The Playroom's casino corner has ten slot machines in two rows of five, each with a stool, a lever, a coin tray and a light on top. Walk up to one and press **E**: you sit on the stool and the machine opens full screen. It is a 5-reel, 3-row video slot with 5 paylines (the three rows and two V shapes) and pixel-art symbols: cherry, lemon, bell, apple, star, BAR, 7 and the golden apple, which stands in for any symbol (five on a line is the jackpot). **Space** spins (and stops the reels early), **↑/↓** change the bet (1, 2, 5 or 10 per line, times 5 lines). Wins count three or more matching symbols from the left on a line; winning lines flash, the win counts up, and big wins and the jackpot get a banner and falling coins. Over many spins the machine pays back about 95% of what you bet and wins on about a third of spins, like a real casino machine. It uses play credits only, with no money involved: everyone gets 200 free credits each day (topped back up when you have fewer). Your credits and biggest win are saved on your browser. Other people see you sitting at the machine, the lever going down when you spin, the reels turning on its little screen and the top light flashing when you win; nobody else can use a machine while you're on it.

**Playroom.** A carpeted games room north of the Pantry (take the path that turns off the Pantry path). The five retro arcade cabinets stand in a circle, screens facing out, under a turning ARCADE banner with each game's name on a marquee above its cabinet, one game each: **Paddle Duel** (first to 7), **Snake Duel** (first to 5 rounds), **Star Orchard** (a co-op space shooter in waves), **Brick Break** (co-op, one paddle each) and **Apple Rush** (catch the most apples in 60 seconds; golden +5, rotten −3). Walk up to a cabinet and press **E** to play full screen: arrows or WASD move, Space fires or launches, Enter pauses or starts a new game after a game over, Esc leaves; the Full screen button hides the browser too, and phones get an on-screen pad. Alone, the versus games give you a computer opponent. In a room, anyone can walk up to a cabinet someone is using and press **E** to join as Player 2: the game restarts for two, Player 1's browser runs it and streams it to Player 2 (same Wi-Fi, so it's quick). A third person sees "two people are playing". Others see you standing at the cabinet working the controls, and its little screen shows who is playing. Best scores are saved per game. Playing costs about as much energy as standing. The two sofas around the coffee table are the comfiest seats outside the lake: resting there recovers energy 25% faster than on a bench.

**Fishing.** Eight species swim in the lake: Tilapia, Rohu and Common carp (common), Catla and Catfish (uncommon), Rainbow trout and Koi (rare) and the legendary Golden mahseer, each with its own size, weight range and fight. Take a rod from the stand beside the lake path (**E**), face open water from the shore or the dock and press **E** to cast. A fish swims up, nibbles and then bites: strike with **E** within about a second (strike too early and it swims off, too late and it steals the bait). Then hold **E** to reel while keeping the line tension out of the red: the fish surges, tires as it fights, and snaps the line if you pull too hard. Land it to see its species, weight and rarity, then **K** keep it (it goes in your catch log in the Menu, with your best weight per species) or **R** release it (you throw it back and it swims off). Casting costs a little energy and a tired player casts shorter (too tired, no cast at all); waiting is calm; reeling is hard work and costs more for a strong fish. Fish feed most at dusk and dawn, catfish bite at night and trout by day. **Q** puts the rod back. In a room, others see your rod, line and bobber.

**Day and night.** A real-time cycle: 30 minutes of day, then 30 minutes of night, with a few minutes of dusk and dawn in between. It follows the real clock, so everyone in a room shares the same time of day, and no clock is shown: the sky changes colour, a square sun and moon cross from east to west, stars come out, clouds dim, and crickets (and frogs at the lake) replace the birds at night. As dusk falls, 38 lamps switch on one by one (street lamps flicker as they warm up) and off again at dawn: floor lamps in the workspace and pantry, cool wall lights in the restroom, lights at every doorway, street lamps around the plaza, along every path and the lakeside, and lanterns at the end of the dock. Each lamp has a bulb, a glow and a pool of light on the ground, and a few real lights brighten the rooms, the plaza and the lake. Lamp posts are solid, and none of them block a walkway or seat.

**Health, energy and the restroom.** Three bars under your profile change with whatever you are doing, shown on the line under them ("Working at your desk · digesting"). Per minute: standing costs 1.2 health and 0.8 energy, walking 1.6 and 1.5, running 3 and 6, swimming 3.5 and 7, working at your desk 2.2 and 2.2; resting on any other seat recovers about 3–6 energy (more when you are tired, most on a lakeside bench). Nothing lands instantly: a meal goes into your stomach and digests into health over a few minutes (+34 health, +10 energy), fruit gives less, and after two meals you are too full for a third. Drinks reach your bladder over the next few minutes. Coffee's caffeine kicks in over about 3 minutes (+42 energy), each extra cup does less, it wears off with a small dip, and too much makes you jittery. The body is linked: hunger tires you up to 2× faster, and exhaustion wears on your health. Each bar shows what is still on its way as a lighter segment, plus a ▲/▼ trend. Low values have effects: tired people yawn and walk slower, exhausted or starving people can't run, hungry stomachs growl, and you can't focus at your desk when you are worn out or need the restroom (no accidents). Jumping costs a little energy. Needs are saved in this browser: a short break changes nothing, a longer one settles them towards normal (you ate and rested off-screen), and after 3 hours you come back fresh.

**Restroom.** Three private stalls with swinging doors and green/red occupied signs. Press **E** at a free stall: the door closes, you are hidden, and a "Using the restroom" label with a progress bar shows above the stall (others only see "Occupied", never who or what is inside). Several people can use different stalls at once, and anyone can use a stall once it is free again. The restroom bar empties while you are inside. Afterwards your hands need washing: press **E** at a sink to wash them (food eaten with unwashed hands gives half the health).

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

The smoke test (277 checks) covers a single browser:
- email login, duplicate emails and logout / log back in
- the daily apple budget and the Golden Apple threshold
- cookies, including rebuilding a profile from its cookie alone
- that every spot-to-spot walking route avoids walls and furniture (the layout stays connected)
- that apples and pokes from the old demo coworkers are purged from saved profiles
- desks: every option builds, one desk per person, defaults when nothing is picked, you can only sit at your own desk, desks survive a cookie-only rebuild and disappear when a profile is deleted
- playground: the courts and halves, solid nets, the stands (sitting on the top tier), "No opponent" alone, exact shot flights (tennis bounce, shuttle with drag, net), first to 10 win by 2, serving, staying in your half, leaving with the score deciding, an opponent who disappears
- gym: the room and machines, starting at the default level, staying put, heart rate and cost building up over a minute, distance, sweat, speed up and down, easing off when tired, stopping when exhausted, stepping off and walking away, bikes and ellipticals, sets and rests, the barbell on and off the rack, seated machines, totals in the Menu, faster recovery and more hunger after a workout, the water cooler
- showers: hidden inside, Occupied, the Showering label, sweat cleared and hands clean, bladder untouched, energy coming back over the next minutes
- slot machines: the payback over 200,000 spins, the golden apple standing in for other symbols, sitting down, spinning, the reels stopping, wins and saved credits, changing the bet, stopping early, running out of credits, the daily top-up
- playroom: the room, the cabinet circle and turning banner, the two rows of slot machines, the five games, every game simulated with random buttons for one and two players, each game's rules, playing at a cabinet (frozen in place, keys go to the game, pause, restart after game over, Esc), best scores, sofa rest
- fishing: species and time-of-day bites, the rod stand, casting only at open water and not when exhausted, early and missed strikes, hooking, reeling with tension, landing, keeping, releasing, snapped lines, walking off, the catch log
- day and night: the 60-minute cycle, smooth light changes, following the clock, no clock shown, lamps and area lights on at night and off by day, lamps switching on one by one at dusk, coverage of every area, night sounds, dusk and dawn notes
- needs: the cost of standing, walking, running, jumping, swimming, working and resting; digestion, fullness, drinks reaching the bladder, caffeine kicking in, wearing off and doing less per cup; hunger tiring you; time away; tiredness slowing you and stopping running, yawns and stomach growls, the full restroom visit (hidden, Occupied, progress label, can't leave early), dirty hands, hand washing and saving
- pantry food: menu makeup and 5-minute rotation, taking and swapping items, eating with F, sitting down to eat, putting food down, brewing and drinking coffee
- sound, against a strict fake Web Audio API: music and ambience switch with the place, every effect plays, and mute stops everything

The room test (91 checks) runs a host and two guests in one room: a slot machine in use (the player seen seated, nobody else can take it, the lever and reels seen by others), a tennis match between two people (challenge and accept, serve, a return after the bounce, the point called by the right player with both scores agreeing, a spectator following the ball and score, leaving with the winner celebrating and announced, opponents only from the other half), gym machines seen from other screens (someone running on a treadmill, nobody else can get on, speed changes), a guest showering behind an Occupied door, arcade cabinets shared by two (Player 2 joins, sees the game live and steers their own ship, a full cabinet turns a third person away), invite codes, joining from a link, private emails and inboxes, desk hand-out, live movement and seats, apples and pokes between guests, Golden Apple everywhere, profile edits, two people in two stalls at once (others see only Occupied), reusing a freed stall, hand washing seen by others, logging out to Away, the host dropping out and coming back, wrong codes and deleting a profile.

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
| Change tennis or badminton | `js/app.js` | `SPORT` (gravity, air drag, reach, shot speed), `WIN_AT`, court shapes in `COURTS` |
| Tune the gym | `js/app.js` | `GYM_KINDS` (per level: heart rate, cost, sweat, speed), `REPS` and `SET_REST` (Gym section) |
| Tune the slot machines | `js/app.js` | `SLOT_W` (symbol weights), `SLOT_PAY` (paytable), `SLOT_LINES`, `SLOT_BETS`, `SLOT_DAILY` (the smoke test checks the payback stays between 85% and 105%) |
| Add or change an arcade game | `js/app.js` | `GAMES` (Playroom and arcade section): `init`, `step`, `draw`, `score` |
| Move rooms or resize the map | `js/app.js` | `ZONES`, `buildLayout`, `buildFurniture` |
| Retheme the UI | `css/styles.css` | the `:root` tokens |

If you move furniture or seats, run `npm test`. The routing check tells you if a walking route between spots is now blocked.

## How data is stored

There is no server. On **this browser only**, everything stays in that browser. In a **room**, everyone's data lives in the host's browser.

- **Room (host).** `ga_room_<CODE>` holds the room: name, every profile (keyed by a private key, with the email kept only here), inboxes, budgets and the feed. `ga_hosted` lists rooms you host so you can reopen them; the Room window has **Download backup** and **Restore from file**.
- **Room (guest).** `ga_joined` remembers the rooms you joined and your email, so **Rejoin** signs you straight in. Guests receive other people's names, roles, avatars, desks and apple totals, never their emails, inboxes or budgets.

- **Cookie (primary).** `ga_session` holds the logged-in email (30 days). `ga_p_<hash>` holds a compact profile: name, role, team, status, avatar, apples received, desk options and desk spot. It is about 220 bytes, well under the 4,096-byte cookie limit, and lasts 180 days. On HTTPS the cookie is written as `SameSite=None; Secure; Partitioned` so it can survive inside embedded pages. Every write is read back to confirm it saved.
- **localStorage (mirror).** `ga_users` stores full profiles, including the inbox and recent apples, which are too big for a cookie. `ga_world` stores the activity feed (`{v:2,feed}`). `ga_sound` stores your volume and mute settings. `ga_vitals` stores each person's health, energy, restroom need and clean hands. `ga_fish` stores each person's catch log (fish kept, released and best weights). `ga_arcade` stores your best score per arcade game. `ga_slots` stores your slot machine play credits, the day of the last top-up and your biggest win. `ga_gym` stores your workout totals (cardio and strength minutes, sets, treadmill kilometres). Version 1 also held 9 demo coworkers; on first load the app strips their apples, pokes, feed items and any Golden status earned from them out of saved profiles.
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
