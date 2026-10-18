// Golden Apple smoke test: runs the real js/app.js in one fake browser (see tests/harness.js) and checks the logic.
// Usage: npm test   (or: node tests/smoke-test.js)
// It covers login, apples, Golden Apple, routes, cookies, desks, sound and food. It does not render graphics.
const H = require('./harness');
const c = H.createClient(), { getEl, store, cookieJar } = c, window = c.win;
const frames = (n, dtMs) => c.frames(n, dtMs);
const { ok, done } = H.makeChecker();

// a profile saved by the old build, still holding apples and pokes from the removed demo coworkers
const t0 = Date.now();
store.ga_users = JSON.stringify({ 'old@example.com': { email: 'old@example.com', name: 'Old Timer', role: 'Ops', team: 'Ops', status: 'available', avatar: { skin: 0, hairStyle: 0, hair: 0, eyes: 0, top: 0, topColor: 0, pants: 0, shoes: 0, acc: 0 },
  received: 12, goldenAt: t0, createdAt: t0, given: null,
  recent: [{ from: 'Priya Nair', count: 3, reason: 'Helping hand', note: '', at: t0 }, { from: 'Real Person', count: 1, reason: 'Team player', note: '', at: t0 }],
  inbox: [{ type: 'apple', from: 'Priya Nair', fromId: 'npc:priya', count: 3, reason: 'Helping hand', at: t0, read: false }, { type: 'poke', from: 'Kenji Watanabe', fromId: 'npc:kenji', msg: 'Lunch?', at: t0, read: false },
    { type: 'apple', from: 'Real Person', fromId: 'local:real@example.com', count: 1, reason: 'Team player', at: t0, read: true }] } });
store.ga_world = JSON.stringify({ v: 1, npc: { priya: { received: 14 } }, feed: [{ kind: 'golden', to: 'Old Timer', at: t0 }, { kind: 'apple', from: 'Priya Nair', to: 'Old Timer', count: 3, reason: 'Helping hand', at: t0 }, { kind: 'apple', from: 'Arjun Mehta', to: 'Fatima Zahra', count: 1, reason: 'Problem solver', at: t0 }] });

(async () => {
  try { c.boot(); } catch (e) { console.log('BOOT ERROR', e.stack); process.exit(1); }
  const G = c.G;
  console.log('Boot');
  ok(G.state.mode === 'login', 'starts on login screen');
  ok(G.state.chars.size === 0, 'no demo coworkers spawned (world is empty until real people log in)');

  console.log('Old demo data is purged from saved profiles');
  const old = G.USERS()['old@example.com'];
  ok(G.WORLD().v === 2 && !G.WORLD().npc, 'world upgraded to v2 without demo coworkers');
  ok(G.WORLD().feed.length === 0, 'feed items involving demo coworkers removed (and the golden entry they earned)');
  ok(old.received === 9 && !G.isGolden(old.received) && old.goldenAt === null, 'demo apples subtracted (12→9), Golden status earned from them revoked');
  ok(old.inbox.length === 1 && old.inbox[0].from === 'Real Person', 'demo apples and pokes removed from inbox, real ones kept');
  ok(old.recent.length === 1 && old.recent[0].from === 'Real Person', 'demo entries removed from recent apples');
  ok(JSON.parse(store.ga_users)['old@example.com'].received === 9, 'purge is saved to localStorage');
  const seats = G.SPOTS.filter(s => s.pose === 'sit');
  console.log('  spots:', G.SPOTS.length, 'seats:', seats.length, 'desk seats:', G.SPOTS.filter(s => s.desk).length);
  frames(120, 16);
  ok(true, 'attract mode ran 120 frames');

  console.log('Desk slots and desk models');
  ok(G.DESK_SLOTS.length === 24 && G.DESK_SLOTS.every(S => !S.desk), '24 desk slots, all empty before anyone logs in');
  const S0 = G.DESK_SLOTS[0];
  ok(G.cellTop(S0.x, S0.dz) === 0, 'an empty slot has no collision (no invisible desk)');
  let built = 0;
  for (const k of G.DK_KEYS) for (let i = 0; i < G.DK[k].length; i++) { G.buildDesk(Object.assign({}, G.DESK_DEFAULT, { [k]: i })); built++; }
  for (let i = 0; i < G.DK.decor.length; i++) { G.buildDesk(Object.assign({}, G.DESK_DEFAULT, { decor: [i, (i + 1) % G.DK.decor.length] })); built++; }
  ok(built > 40, 'every desk colour, chair, computer, screen, plant, pet and decor item builds (' + built + ' models)');
  ok(G.buildDesk(Object.assign({}, G.DESK_DEFAULT, { decor: [0, 1, 2, 3] })) && G.deskToArr({ ...G.DESK_DEFAULT, decor: [0, 1, 2] }).length === 8, 'decor is capped and the desk packs into 8 numbers for the cookie');
  G.DESK_SLOTS.forEach((S, i) => G.placeDesk(i, G.DESK_DEFAULT, 'routing@test'));
  ok(G.cellTop(S0.x, S0.dz) > 0.55, 'a placed desk is solid');

  console.log('Routing (every spot-to-spot walk avoids walls and furniture, with every desk built)');
  let bad = 0, checked = 0; const badEx = [];
  // height-aware, like the game: you can step up 0.55 m at a time (stands, steps) and step down any amount
  const topAt = (x, z) => Math.max(0, G.cellTop(x, z));
  const NS = G.SPOTS.filter(s => s.zone !== "plaza"); for (const a of NS) for (const b of NS) {
    if (a === b) continue; const pts = G.routeFromTo(a, b); const all = [{ x: a.x, z: a.z }, ...pts];
    for (let i = 1; i < all.length - 1; i++) { // skip leaving the start spot and arriving into the final spot
      if (i === 1) continue;
      const p = all[i - 1], q = all[i]; const d = Math.hypot(q.x - p.x, q.z - p.z); const n = Math.max(1, Math.ceil(d / 0.1)); let prev = topAt(p.x, p.z);
      for (let k = 0; k <= n; k++) { const x = p.x + (q.x - p.x) * k / n, z = p.z + (q.z - p.z) * k / n, t = topAt(x, z); checked++; const up = t - prev > 0.55; prev = t; if (up) { bad++; if (badEx.length < 8) badEx.push(`${a.zone}:${a.pose}(${a.x.toFixed(1)},${a.z.toFixed(1)}) -> ${b.zone}:${b.pose} seg ${i} at (${x.toFixed(2)},${z.toFixed(2)}) top=${G.cellTop(x, z)}`); break; } }
    }
  }
  console.log('  samples checked:', checked, 'blocked segments:', bad); badEx.forEach(s => console.log('   ', s));
  ok(bad === 0, 'no spot-to-spot route crosses a solid cell');
  // seats must have a walkable approach point for the player to stand up onto
  // the whole player box (±0.28 m, as in blocked()) must fit, or standing up leaves you wedged in furniture
  const boxBlocked = (x, z) => { const base = topAt(x, z); return [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]].some(o => G.cellTop(x + o[0], z + o[1]) > base + 0.55); };
  const badApproach = seats.filter(s => s.approach && boxBlocked(s.approach.x, s.approach.z));
  badApproach.slice(0, 5).forEach(s => console.log('   approach blocked', s.zone, s.x, s.z, '->', s.approach.x, s.approach.z, G.cellTop(s.approach.x, s.approach.z)));
  ok(badApproach.length === 0, 'every seat has a stand-up point your whole body fits into');
  ok(G.cellTop(0, 9.5) === 0, 'spawn point is open ground');
  G.DESK_SLOTS.forEach((S, i) => G.clearDesk(i));
  ok(G.cellTop(S0.x, S0.dz) === 0 && G.DESK_SLOTS.every(S => !S.desk && !S.spot.owner), 'clearing a desk removes it and its collision');

  console.log('Sound');
  ok(G.Sound.ctx === null, 'no audio before the first click or key press (autoplay rules)');
  G.sfx('give'); ok(true, 'sound effects are silent no-ops before audio starts');
  window._l.pointerdown.forEach(fn => fn({}));
  ok(!!G.Sound.ctx && c.audioNodes > 0, 'first pointer press starts the audio engine (' + c.audioNodes + ' nodes)');

  console.log('Login → profile setup → world');
  ok(!getEl('#roomStep').hidden && getEl('#loginForm').hidden, 'the start screen asks to join or create a room first');
  getEl('#soloBtn').dispatch('click');
  ok(getEl('#roomStep').hidden && !getEl('#loginForm').hidden, '"Play on this browser only" goes straight to sign-in');
  const email = getEl('#email'); email.value = 'not-an-email'; getEl('#loginForm').dispatch('submit');
  ok(G.state.mode === 'login', 'invalid email is rejected');
  email.value = '  Tester@Example.com '; getEl('#loginForm').dispatch('submit');
  ok(G.state.mode === 'setup' && G.state.setup.email === 'tester@example.com', 'new email opens setup (normalised to lower case)');
  getEl('#pName').value = 'T'; getEl('#setupForm').dispatch('submit');
  ok(G.state.mode === 'setup', 'name shorter than 2 chars is rejected');
  getEl('#pName').value = 'Test User'; getEl('#pRole').value = 'Designer'; getEl('#pTeam').value = 'Design'; getEl('#pStatus').value = 'available';
  frames(10, 16);
  getEl('#setupForm').dispatch('submit');
  ok(G.state.mode === 'world' && G.state.player, 'profile created, player in world');
  ok(!!cookieJar.ga_session, 'session cookie written');
  const pc = Object.keys(cookieJar).find(k => k.startsWith('ga_p_'));
  ok(!!pc, 'profile cookie written (' + (pc ? cookieJar[pc].length : 0) + ' bytes, limit 4096)');
  ok(G.state.cookieOK === true, 'cookie write verified by read-back');

  console.log('Your own desk');
  const me0 = G.state.me, testerSlot = me0.deskSlot, mySlot = G.DESK_SLOTS[testerSlot];
  ok(testerSlot >= 0 && !!mySlot.desk && mySlot.spot.owner === 'tester@example.com', 'new profile gets its own desk in the Work Desks room (' + (mySlot && mySlot.label) + ')');
  ok(JSON.stringify(G.deskToArr(me0.desk)) === JSON.stringify(G.deskToArr(G.DESK_DEFAULT)), 'no desk choices made, so the default desk is used');
  const oldSlot = G.USERS()['old@example.com'].deskSlot;
  ok(oldSlot >= 0 && oldSlot !== testerSlot && !!G.DESK_SLOTS[oldSlot].desk, 'the older profile without a desk is given a different one');
  ok(G.state.chars.get('local:old@example.com').spot === G.DESK_SLOTS[oldSlot].spot, 'Away people sit at their own desk');
  ok(G.DESK_SLOTS.filter(S => S.desk).length === 2, 'only real people have desks (2 of 24 built)');
  const P = G.state.player, ap = mySlot.spot.approach;
  P.root.position.set(ap.x, 0, ap.z);
  ok(G.nearestSeat() === mySlot.spot, 'standing by your desk offers your chair');
  G.tryInteract(); ok(P.seat === mySlot.spot, 'E sits you down at your own desk');
  G.tryInteract(); ok(!P.seat, 'E again stands you up');
  const oSpot = G.DESK_SLOTS[oldSlot].spot; P.root.position.set(oSpot.approach.x, 0, oSpot.approach.z);
  ok(G.nearestSeat() !== oSpot && G.nearestOtherDesk() === oSpot, 'someone else’s desk is never offered as a seat');
  G.tryInteract(); ok(!P.seat, 'E at someone else’s desk does not sit you down');
  const empty = G.DESK_SLOTS.find(S => !S.desk); P.root.position.set(empty.spot.approach.x, 0, empty.spot.approach.z);
  ok(G.nearestSeat() !== empty.spot, 'an empty slot has no chair to sit on');
  P.root.position.set(0, 0, 9.5);

  console.log('Simulate 4 minutes of world time');
  const keysDown = name => window._l.keydown.forEach(fn => fn({ key: name, repeat: false, preventDefault() {} }));
  const keysUp = name => window._l.keyup.forEach(fn => fn({ key: name }));
  keysDown('w'); frames(90, 16); keysUp('w');
  ok(G.state.player.root.position.z < 9.5, 'W walks the player north (z ' + G.state.player.root.position.z.toFixed(2) + ')');
  keysDown(' '); frames(5, 16); ok(G.state.player.root.position.y > 0, 'Space makes the player jump'); frames(80, 16);
  ok(Math.abs(G.state.player.root.position.y) < 1e-6, 'player lands back on the ground');
  for (let i = 0; i < 4 * 60 * 20; i++) frames(1, 50);
  ok(true, 'ran 4800 frames');
  ok((G.state.me.inbox || []).length === 0 && G.WORLD().feed.length === 0, 'nobody fake gifted or poked you while idle');

  console.log('Music and sounds follow you around');
  ok(G.Sound.theme === 'plaza' && G.Sound.ambKey !== null, 'outdoors plays the plaza theme and ambience');
  const goTo = (x, z) => { G.state.player.root.position.set(x, 0, z); frames(130, 16); };
  goTo(25, 0.5); ok(G.Sound.theme === 'pantry' && G.Sound.ambKey === 'pantry', 'walking into the Pantry switches music and ambience');
  goTo(-25, 0); ok(G.Sound.theme === 'restroom', 'the Restroom has its own theme');
  goTo(0, 20); ok(G.Sound.theme === 'lake', 'so does Lakeside');
  goTo(ap.x, ap.z); ok(G.Sound.theme === 'desks', 'and the Work Desks');
  const n0 = c.audioNodes; frames(120, 16); ok(c.audioNodes > n0, 'notes keep being scheduled while you stand still');
  for (const n of ['step', 'jump', 'land', 'splash', 'sit', 'stand', 'give', 'catch', 'golden', 'poke', 'poked', 'boop', 'ui', 'open', 'close', 'deny']) G.sfx(n, {});
  for (const g of ['grass', 'path', 'plaza', 'oak', 'pantry', 'tile', 'sand', 'water', 'dock']) G.sfx('step', { ground: g });
  ok(true, 'every sound effect and footstep surface plays without errors');
  G.toggleMute(); const n1 = c.audioNodes; frames(60, 16);
  ok(G.SND.muted && G.Sound.ctx.state === 'suspended' && c.audioNodes === n1, 'mute (M) suspends audio and schedules nothing');
  G.toggleMute(); ok(!G.SND.muted && G.Sound.ctx.state === 'running' && JSON.parse(store.ga_sound).muted === false, 'unmute resumes, and the setting is saved');
  G.state.player.root.position.set(0, 0, 9.5); frames(5, 16);

  console.log('Edit your desk');
  G.openSetup('edit'); const sd = G.state.setup.desk; sd.pet = 1; sd.decor = [0, 1]; sd.tech = 1; sd.chairStyle = 1;
  getEl('#setupForm').dispatch('submit');
  ok(G.state.mode === 'world' && G.state.me.desk.pet === 1 && G.state.me.desk.tech === 1 && G.state.me.desk.decor.length === 2, 'desk changes are saved (cat, two monitors, two decor items)');
  ok(G.state.me.deskSlot === testerSlot && !!mySlot.desk && mySlot.spot.owner === 'tester@example.com', 'your desk is rebuilt in the same spot, still yours');

  console.log('Profile tabs, gender and randomise');
  G.openSetup('edit'); const savedDesk = JSON.parse(JSON.stringify(G.state.setup.desk));
  ok(!getEl('#panelProfile').hidden && getEl('#panelAvatar').hidden && getEl('#panelDesk').hidden && getEl('#tabProfile').getAttribute('aria-selected') === 'true', 'the setup opens on the Profile tab, with Character and Desk hidden');
  G.setTab('desk'); ok(getEl('#panelProfile').hidden && !getEl('#panelDesk').hidden && G.pv.view === 'desk' && getEl('#tabDesk').getAttribute('tabindex') === '0', 'the Desk tab shows the desk fields and the desk preview');
  G.setTab('avatar'); ok(!getEl('#panelAvatar').hidden && G.pv.view === 'avatar', 'the Character tab shows the character fields and the avatar preview');
  const share = (g, k, set) => { let n = 0; for (let i = 0; i < 600; i++) if (set.includes(G.randomAvatar(g)[k])) n++; return n / 600; };
  const LONG = [3, 4], SHORT = [0, 1, 6];// Long + Bun; Short, Buzz, Bald
  ok(share(1, 'hairStyle', LONG) > 0.4 && share(2, 'hairStyle', LONG) < 0.1 && share(2, 'hairStyle', SHORT) > 0.55 && share(1, 'hairStyle', SHORT) < 0.25, 'randomise follows the gender: mostly long hair and buns for Female, short cuts for Male');
  ok([0, 1, 2].every(g => { for (let i = 0; i < 200; i++) { const a = G.randomAvatar(g); if (a.gender !== g || Object.keys(a).some(k => a[k] < 0 || a[k] >= G.AV[k].length)) return false; } return true; }), 'every randomised character keeps its gender and valid options');
  const old9 = G.arrToAvatar([1, 2, 3, 1, 2, 3, 1, 2, 1]);
  ok(old9.gender === 0 && G.avatarToArr(old9).length === 10, 'older profiles (9 numbers in the cookie) load with gender Any');
  getEl('#randomBtn').dispatch('click'); ok(G.state.setup.av.gender === G.state.me.avatar.gender, 'Randomise character keeps the chosen gender');
  let deskOk = true, decorSeen = new Set();
  for (let i = 0; i < 300; i++) { const d = G.randomDesk(); if (G.DK_KEYS.some(k => d[k] < 0 || d[k] >= G.DK[k].length) || d.decor.length > 2 || new Set(d.decor).size !== d.decor.length) deskOk = false; d.decor.forEach(x => decorSeen.add(x)); G.buildDesk(d); }
  ok(deskOk && decorSeen.size === G.DK.decor.length, 'Randomise desk gives valid desks (up to 2 different decor items) that all build');
  getEl('#randomDeskBtn').dispatch('click'); const rd = G.state.setup.desk; getEl('#resetDeskBtn').dispatch('click');
  ok(G.DK_KEYS.every(k => G.state.setup.desk[k] === 0) && G.state.setup.desk.decor.length === 0 && !!rd, 'Default desk resets every desk option');
  G.state.setup.av = G.randomAvatar(1); G.state.setup.desk = savedDesk; getEl('#setupForm').dispatch('submit');
  ok(G.state.mode === 'world' && G.state.me.avatar.gender === 1 && JSON.parse(store.ga_users)[G.state.me.email].avatar.gender === 1, 'saving keeps the gender');

  console.log('Pantry food counter');
  const nCat = c => G.FOODS.filter(x => x.cat === c).length;
  ok(['veg', 'nonveg', 'fruit', 'drink'].every(c => nCat(c) >= 6), 'at least 6 veg, non-veg, fruit and drink items (' + G.FOODS.length + ' foods)');
  G.FOODS.forEach(x => { G.buildFood(x.id); G.buildFood(x.id, true); }); ok(G.buildFood('egg', true).children.length < G.buildFood('egg').children.length, 'every food model builds, on the counter and plate-free in the hand');
  const m0 = G.menuFor(1000);
  ok(m0.length === 8 && ['veg', 'veg', 'nonveg', 'nonveg', 'fruit', 'fruit', 'drink', 'drink'].every((c, i) => G.FOOD[m0[i]].cat === c) && new Set(m0).size === 8, 'a menu is 2 veg, 2 non-veg, 2 fruits and 2 drinks, no repeats');
  ok(JSON.stringify(G.menuFor(1000)) === JSON.stringify(m0), 'same 5-minute slot, same menu (everyone sees the same counter)');
  let changed = 0; for (let b = 1001; b < 1013; b++) if (JSON.stringify(G.menuFor(b)) !== JSON.stringify(m0)) changed++;
  ok(changed >= 11, 'the menu changes from one 5-minute slot to the next (' + changed + '/12)');
  ok(G.menu.bucket === G.menuBucket() && G.counterGroup.children.length === 8, 'the counter shows the current menu on 8 trays');
  const Pf = G.state.player, keyTap = k => { keysDown(k); keysUp(k); };
  Pf.root.position.set(31.5, 0, G.SLOT_Z[2]);
  ok(G.nearestCounterItem() === 2, 'standing at the counter selects the item in front of you');
  G.tryInteract(); ok(Pf.held === G.menu.items[2] && !!Pf.heldMesh && Pf.av.armR.children.includes(Pf.heldMesh), 'E takes it (' + G.FOOD[G.menu.items[2]].name + ') into your right hand');
  Pf.root.position.set(31.5, 0, G.SLOT_Z[6]); G.tryInteract(); ok(Pf.held === G.menu.items[6], 'taking another item swaps it');
  Pf.setAvatar(G.state.me.avatar); ok(Pf.av.armR.children.includes(Pf.heldMesh), 'the item stays in your hand when your avatar is rebuilt');
  keyTap('f'); ok(!!Pf.eating && Pf.anim.eat === 'drink', 'F starts drinking straight away (slot 7 is a drink)');
  let n2 = c.audioNodes; frames(40, 50);
  ok(!Pf.eating && !Pf.held && Pf.anim.eat === null && c.audioNodes > n2, 'after 1.6 s the drink is gone, with gulp sounds and an "ahh"');
  Pf.root.position.set(31.5, 0, G.SLOT_Z[0]); G.tryInteract(); keyTap('f');
  ok(Pf.eating && Pf.anim.eat === 'eat', 'food uses the eating animation (arm to mouth, crumbs, crunching)');
  frames(60, 50); ok(!Pf.held && !Pf.eating, 'and is eaten after 2.6 s (a meal takes longer than a drink)');
  Pf.root.position.set(31.5, 0, G.SLOT_Z[3]); G.tryInteract();
  const stool = G.SPOTS.find(x => x.zone === 'pantry' && x.pose === 'sit'); Pf.root.position.set(stool.approach.x, 0, stool.approach.z);
  G.tryInteract(); ok(Pf.seat && Pf.eating && Pf.anim.eat === 'eat', 'walking to a pantry stool and sitting down starts eating');
  frames(60, 50); ok(!Pf.held && Pf.seat, 'you finish eating while seated'); G.tryInteract(); ok(!Pf.seat, 'E stands you up again');
  Pf.root.position.set(31.5, 0, G.SLOT_Z[4]); G.tryInteract(); keyTap('q'); ok(!Pf.held, 'Q puts the item down without eating it');
  Pf.root.position.set(31.5, 0, G.COFFEE_Z); G.tryInteract();
  ok(G.brew.on && !Pf.held, 'E at the coffee machine starts brewing');
  frames(60, 50); ok(!G.brew.on && Pf.held === 'coffee', 'after the brew you are holding a cup of coffee');
  keyTap('f'); ok(Pf.anim.eat === 'drink', 'F drinks the coffee'); frames(40, 50); ok(!Pf.held, 'coffee finished');
  const tEl = getEl('#toasts'), t0 = tEl.children.length; G.refreshMenu(G.menu.bucket + 1);
  ok(JSON.stringify(G.menu.items) === JSON.stringify(G.menuFor(G.menuBucket() + 1)) && tEl.children.some(c => /Fresh menu/.test(c.innerHTML)), 'when the 5 minutes are up the counter restocks and people in the Pantry are told');
  G.refreshMenu(G.menuBucket()); frames(5, 16); ok(G.menu.bucket === G.menuBucket(), 'the menu follows the clock');
  for (const n of ['pick', 'putdown', 'crunch', 'munch', 'juicy', 'gulp', 'burp', 'ahh', 'brew', 'menu']) G.sfx(n, {});
  ok(true, 'every food sound plays without errors');
  Pf.root.position.set(0, 0, 9.5); frames(5, 16);

  console.log('Health, energy and the restroom: every activity counts');
  const Vt = G.V, near = (x, y, d = 0.6) => Math.abs(x - y) <= d, f1 = v => v.toFixed(1);
  const fresh = o => Object.assign(Vt, { hp: 80, en: 80, bl: 10, clean: true, st: 0, stEn: 0, fl: 0, caf: 0, cafIn: 0 }, o || {});
  const MIN = 1200; // frames of 50 ms in a minute
  ok(getEl('#vHpNum').textContent !== '' && getEl('#vEnNum').textContent !== '' && getEl('#vBlNum').textContent !== '' && getEl('#vAct').textContent !== '', 'health, energy and restroom bars, plus what you are doing, are in the HUD');
  fresh(); Pf.root.position.set(0, 0, 9.5); frames(MIN, 50);
  ok(Vt.act === 'idle' && near(Vt.hp, 78.8) && near(Vt.en, 79.2) && near(Vt.bl, 10.8), 'standing for a minute: health −1.2, energy −0.8, restroom +0.8 (' + [Vt.hp, Vt.en, Vt.bl].map(f1).join(' / ') + ')');
  fresh(); Pf.root.position.set(0, 0, 9.5); keysDown('w'); frames(100, 50); const walkAct = Vt.act, walkDrop = 80 - Vt.en; keysUp('w');
  fresh(); Pf.root.position.set(0, 0, 9.5); keysDown('shift'); keysDown('w'); frames(100, 50); const runAct = Vt.act, runDrop = 80 - Vt.en; keysUp('w'); keysUp('shift');
  ok(walkAct === 'walking' && runAct === 'running' && walkDrop > 0.09 && runDrop > 3 * walkDrop, 'walking tires you more than standing, running about 4× more than walking (' + walkDrop.toFixed(2) + ' vs ' + runDrop.toFixed(2) + ' in 5 s)');
  fresh(); frames(5, 16); const e0 = Vt.en; keyTap(' '); frames(3, 16); ok(near(e0 - Vt.en, 0.4, 0.05), 'each jump costs a little energy'); frames(60, 16);
  fresh(); Pf.root.position.set(6, -0.6, 31); keysDown('w'); frames(10, 50); const swimAct = Vt.act; keysUp('w');
  ok(swimAct === 'swimming' && Vt.en < 80, 'swimming in the lake is the most tiring activity');
  const myDesk = G.DESK_SLOTS[G.state.me.deskSlot].spot; Pf.root.position.set(myDesk.approach.x, 0, myDesk.approach.z); G.tryInteract();
  fresh({ en: 60 }); frames(MIN, 50);
  ok(Pf.seat === myDesk && Vt.act === 'working' && near(Vt.en, 57.8) && near(Vt.hp, 77.8), 'working at your desk for a minute: energy −2.2, health −2.2 (' + f1(Vt.en) + ' / ' + f1(Vt.hp) + ')');
  ok(getEl('#vEnTr').textContent === '▼' && /Working at your desk/.test(getEl('#vAct').textContent), 'the energy bar shows a falling arrow and the HUD says “Working at your desk”');
  fresh({ hp: 15, en: 60 }); frames(MIN, 50);
  ok(near(Vt.en, 56.7), 'when you are hungry, work tires you 1.5× faster (' + f1(Vt.en) + ')'); G.tryInteract();
  const bench = G.SPOTS.find(x => x.zone === 'plaza' && x.pose === 'sit'); Pf.root.position.set(bench.approach.x, 0, bench.approach.z); G.tryInteract();
  fresh({ en: 30 }); frames(MIN, 50); const tiredGain = Vt.en - 30;
  fresh({ en: 90 }); frames(MIN, 50); const restedGain = Vt.en - 90; G.tryInteract();
  ok(Vt.act !== 'working' && near(tiredGain, 5.9, 0.5) && near(restedGain, 3, 0.4), 'resting on a bench recovers ~6 energy a minute when tired, ~3 when fresh (' + f1(tiredGain) + ' / ' + f1(restedGain) + ')');
  const lakeSeat = G.SPOTS.find(x => x.zone === 'lake' && x.pose === 'sit'); Pf.root.position.set(lakeSeat.approach.x, 0, lakeSeat.approach.z); G.tryInteract();
  fresh({ en: 30 }); frames(MIN, 50); const lakeGain = Vt.en - 30; G.tryInteract();
  ok(Pf.seat === null && lakeGain > tiredGain * 1.2, 'a lakeside bench is the most relaxing (' + f1(lakeGain) + ' a minute)');
  fresh({ hp: 40, en: 40, bl: 10 }); Pf.root.position.set(31.5, 0, G.SLOT_Z[0]); G.tryInteract(); keyTap('f'); frames(5, 50); const eatAct = Vt.act; frames(55, 50);
  ok(eatAct === 'eating' && near(Vt.hp, 40, 1) && near(Vt.st, 34, 1), 'right after a meal your health has barely moved: the food is still in your stomach');
  ok(getEl('#vHpPend').style.width !== '0%' && /digesting/.test(getEl('#vAct').textContent), 'the health bar shows the meal still to come, and the HUD says “digesting”');
  frames(3 * MIN, 50);
  ok(near(Vt.hp, 70.4, 1.2) && near(Vt.en, 47.6, 1.2) && near(Vt.bl, 17.4, 1) && Vt.st < 0.1, 'over 3 minutes it digests: health +34, energy +10, restroom +5 (' + [Vt.hp, Vt.en, Vt.bl].map(f1).join(' / ') + ')');
  fresh(); Pf.root.position.set(31.5, 0, G.SLOT_Z[0]); G.tryInteract(); keyTap('f'); frames(60, 50);
  Pf.root.position.set(31.5, 0, G.SLOT_Z[1]); G.tryInteract(); keyTap('f'); frames(60, 50);
  Pf.root.position.set(31.5, 0, G.SLOT_Z[2]); G.tryInteract(); keyTap('f'); frames(5, 50);
  ok(!Pf.eating && Pf.held === G.menu.items[2] && /Full/.test(getEl('#vWarn').textContent), 'after two meals you are full and can’t eat a third'); keyTap('q');
  const drink = G.FOOD[G.menu.items[6]], dfl = G.nutrition(drink).fl;
  fresh({ bl: 10 }); Pf.root.position.set(31.5, 0, G.SLOT_Z[6]); G.tryInteract(); keyTap('f'); frames(40, 50);
  ok(Vt.bl < 11 && near(Vt.fl, dfl, 0.5), 'a drink doesn’t hit the restroom bar straight away (' + drink.name + ')');
  frames(3 * MIN, 50); ok(near(Vt.bl, 10 + dfl + 2.4, 1), 'it reaches your bladder over the next few minutes (' + f1(Vt.bl) + ')');
  fresh({ en: 30 }); Pf.root.position.set(31.5, 0, G.COFFEE_Z); G.tryInteract(); frames(60, 50); keyTap('f'); frames(40, 50);
  ok(Vt.en < 32 && near(Vt.cafIn, 42, 1) && /caffeine kicking in/.test(getEl('#vAct').textContent), 'coffee doesn’t work instantly: the caffeine is still kicking in');
  frames(3 * MIN, 50); ok(near(Vt.en, 73.5, 1.8), 'over ~3 minutes it lifts energy by ~45 (' + f1(Vt.en) + ')');
  const cafNow = Vt.caf; G.tryInteract(); frames(60, 50); const before2 = Vt.cafIn; keyTap('f'); frames(40, 50); const boost2 = Vt.cafIn - before2;
  ok(boost2 < 42 * 0.8 && near(boost2, 42 * (1 - cafNow / 120), 2.5), 'a second coffee does less (' + f1(boost2) + ' instead of 42)');
  fresh({ en: 60, caf: 30 }); frames(MIN, 50); ok(near(Vt.en, 58.6) && /wearing off/.test(getEl('#vAct').textContent), 'when caffeine wears off there is a small dip in energy');
  fresh({ caf: 80 }); frames(12, 50); ok(/Jittery/.test(getEl('#vWarn').textContent), 'too much coffee makes you jittery');
  fresh({ en: 5 }); Pf.root.position.set(0, 0, 9.5); keysDown('shift'); keysDown('w'); frames(10, 16); const tiredRun = Pf.anim.run; keysUp('w'); keysUp('shift');
  ok(!tiredRun && !G.canRun() && G.vitalSpeed() < 0.7, 'when exhausted you can’t run and walk slower');
  Vt.yawn = 0; frames(2, 16); ok(Pf.anim.yawn > 0, 'tired people yawn');
  fresh({ hp: 20 }); Vt.growl = 0; frames(12, 50); ok(Vt.growl > 0 && getEl('#vWarn').textContent.includes('Hungry'), 'hungry people’s stomachs growl and the HUD says Hungry');
  ok(getEl('#toasts').children.some(t => /low on energy/.test(t.innerHTML)), 'a one-time tip points to coffee when energy runs low');
  Object.assign(Vt, { hp: 70, en: 70, bl: 80 });
  const Rs0 = G.STALLS[0]; ok(G.STALLS.filter(S => S.kind === 'stall').length === 3 && G.STALLS.filter(S => S.kind === 'shower').length === 2, 'the restroom has three stalls and two showers');
  G.STALLS[2].occ = 'local:someone'; Pf.root.position.set(G.STALLS[2].spot.x, 0, G.STALLS[2].spot.z); G.tryInteract();
  ok(!G.rr.use, 'an occupied stall can’t be entered'); G.STALLS[2].occ = null;
  Pf.root.position.set(Rs0.spot.x, 0, Rs0.spot.z); ok(G.nearestStall() === Rs0, 'standing at a stall door offers it');
  G.tryInteract(); frames(30, 16);
  ok(G.rr.use && !Pf.root.visible && Rs0.occ === 'me' && G.STALLS[1].occ === null, 'using the restroom hides you, marks that stall Occupied and leaves the others free');
  ok(Rs0.label && !Rs0.label.hidden && /Using the restroom/.test(Rs0.label.innerHTML) && /prog/.test(Rs0.label.innerHTML), 'a label with a progress bar shows above the stall');
  const inX = Pf.root.position.x; keysDown('w'); frames(20, 16); keysUp('w');
  ok(Pf.root.position.x === inX && G.rr.use, 'you stay put until you are done');
  frames(60, 50); ok(Vt.bl > 25 && Vt.bl < 65, 'the restroom bar empties while you are in there (' + f1(Vt.bl) + ')');
  frames(110, 50);
  ok(!G.rr.use && Pf.root.visible && Rs0.occ === null && Vt.bl < 0.2 && Vt.clean === false, 'afterwards the restroom need is 0, you step out, and your hands need washing');
  ok(getEl('#vWarn').textContent.includes('Wash your hands') && Rs0.label.hidden, 'the HUD reminds you to wash your hands; the stall label is gone');
  Object.assign(Vt, { st: 0 }); Pf.root.position.set(31.5, 0, G.SLOT_Z[4]); G.tryInteract(); keyTap('f'); frames(40, 50);
  ok(near(Vt.st, G.nutrition(G.FOOD[G.menu.items[4]]).hp / 2, 0.4), 'fruit eaten with unwashed hands only does half the good');
  Pf.root.position.set(-24.5, 0, -4.4); ok(!!G.nearestSink(), 'the sinks are in front of the mirrors');
  Object.assign(Vt, { st: 0, stEn: 0 }); const hpWash = Vt.hp;
  G.tryInteract(); frames(10, 16); ok(G.rr.wash && Pf.anim.pose === 'wash' && Vt.act === 'washing', 'E at a sink washes your hands (washing animation)');
  frames(70, 50); ok(Vt.hp <= hpWash, 'washing cleans your hands; it doesn’t give health'); ok(!G.rr.wash && Vt.clean && !getEl('#vWarn').textContent.includes('Wash'), 'after 3 seconds your hands are clean');
  frames(110, 50); ok(JSON.parse(store.ga_vitals)['tester@example.com'].clean === true, 'your needs are saved in this browser');
  const saved = JSON.parse(store.ga_vitals), setAway = (mins, o) => { saved['tester@example.com'] = Object.assign({ hp: 20, en: 20, bl: 80, clean: false, st: 0, stEn: 0, fl: 0, caf: 0, cafIn: 0 }, o || {}, { at: Date.now() - mins * 60000 }); store.ga_vitals = JSON.stringify(saved); G.loadVitals(G.state.me); };
  setAway(1); ok(near(Vt.hp, 20) && near(Vt.en, 20) && Vt.clean === false, 'a one-minute break changes nothing');
  setAway(90); ok(near(Vt.hp, 58.8, 1) && near(Vt.en, 62.7, 1) && near(Vt.bl, 41.1, 1) && Vt.clean, 'after 90 minutes away your needs have settled towards normal (you ate and rested off-screen)');
  setAway(240); ok(Vt.hp === 85 && Vt.en === 85 && Vt.bl === 15, 'after more than 3 hours you come back fresh');
  Object.assign(Vt, { hp: 85, en: 85, bl: 15, clean: true }); Pf.root.position.set(0, 0, 9.5); frames(5, 16);

  console.log('Day and night');
  ok(G.DAY_MS === 3600000 && G.daylightAt(0.25) === 1 && G.daylightAt(0.75) === 0 && near(G.daylightAt(0.5), 0.5, 0.01) && near(G.daylightAt(0), 0.5, 0.01), 'a 60-minute cycle: 30 minutes of day, 30 of night, with dusk and dawn in between');
  let jumpsDN = 0; for (let p = 0; p < 1; p += 0.001) if (Math.abs(G.daylightAt((p + 0.001) % 1) - G.daylightAt(p)) > 0.02) jumpsDN++;
  ok(jumpsDN === 0, 'the light changes smoothly, with no sudden jumps');
  ok(G.DN.force === null && near(G.cyclePhase(), (Date.now() % 3600000) / 3600000, 0.001), 'the cycle follows the real clock, so everyone in a room shares it');
  ok(!/\d{1,2}:\d{2}/.test(getEl('#hud').innerHTML + getEl('#mapZone').textContent), 'no clock is shown');
  G.DN.force = 0.25; frames(30, 50); const daySky = G.DN.sky;
  ok(G.LAMPS.every(l => !l.on && !l.halo.visible && l.bulb.material === G.LAMP_MAT.off) && G.AREA_LIGHTS.every(a => a.intensity === 0) && !G.stars.visible && G.sunDisc.visible && G.hemi.intensity > 0.7, 'at noon the lamps are off, there are no stars, the sun is up and it is bright');
  G.DN.force = 0.75; frames(40, 50);
  ok(G.LAMPS.every(l => l.on && l.halo.visible && l.pool.visible && l.bulb.material !== G.LAMP_MAT.off), 'at night every lamp is on: bulb, glow and a pool of light on the ground');
  ok(G.hemi.intensity < 0.2 && G.stars.visible && G.moonDisc.visible && G.AREA_LIGHTS.every(a => a.intensity > 0.5) && G.DN.sky !== daySky, 'at night it is dark, the sky changes, and the stars, moon and room lights come out');
  ok(getEl('#toasts').children.some(t => /sun is setting/.test(t.innerHTML)), 'a short note says the sun is setting (no time shown)');
  const lampZones = {}; G.LAMPS.forEach(l => lampZones[l.zone] = (lampZones[l.zone] || 0) + 1);
  ok(lampZones.desks >= 6 && lampZones.pantry >= 4 && lampZones.restroom >= 4 && lampZones.plaza >= 4 && lampZones.lake >= 6 && lampZones.path >= 8 && lampZones.door >= 6, 'lights cover the workspace, pantry, restroom, plaza, lakeside, paths and doorways (' + Object.entries(lampZones).map(e => e.join(' ')).join(', ') + ')');
  ok(G.LAMPS.filter(l => l.kind === 'street' || l.kind === 'floor').every(l => G.cellTop(l.x, l.z) >= 2), 'lamp posts are solid: you walk around them');
  ok(G.nightEv('birds') === 'crickets' && G.nightEv('lake') === 'frogs', 'at night the birds give way to crickets, and frogs at the lake');
  G.Sound.ambNext = 0; Pf.root.position.set(0, 0, 9.5); frames(30, 50); ok(true, 'night sounds play without errors');
  let pDusk = 0.45; while (G.daylightAt(pDusk) > 0.585) pDusk += 0.0005;
  G.DN.force = 0.25; frames(20, 50); G.DN.force = pDusk; frames(20, 50);
  const litNow = G.LAMPS.filter(l => l.on).length;
  ok(litNow > 0 && litNow < G.LAMPS.length, 'at dusk the lamps come on one by one (' + litNow + ' of ' + G.LAMPS.length + ' so far)');
  G.DN.force = 0.75; frames(20, 50); G.DN.force = 0.25; frames(30, 50);
  ok(G.LAMPS.every(l => !l.on) && G.nightEv('birds') === 'birds' && getEl('#toasts').children.some(t => /Good morning/.test(t.innerHTML)), 'at dawn the lamps switch off, the birds return, and a note says good morning');
  G.DN.force = null; frames(5, 16);
  console.log('Fishing');
  const Fz = G.fishing;
  ok(G.FISH.length >= 8 && ['Common', 'Uncommon', 'Rare', 'Legendary'].every(r => G.FISH.some(x => x.rar === r)), G.FISH.length + ' species, from common to legendary');
  ok(G.LAKE_FISH.length >= 10 && G.LAKE_FISH.every(x => G.lakeE(x.x, x.z) < 1), 'fish swim inside the lake');
  const fishBefore = G.LAKE_FISH.map(x => x.x + x.z).join(); frames(40, 50); ok(G.LAKE_FISH.map(x => x.x + x.z).join() !== fishBefore, 'and swim about');
  G.DN.force = 0.25; frames(2, 50); const catDay = G.timeBias(G.FISH_BY.catfish), troutDay = G.timeBias(G.FISH_BY.trout), rateDay = G.biteRate();
  G.DN.force = 0.75; frames(2, 50); const catNight = G.timeBias(G.FISH_BY.catfish), troutNight = G.timeBias(G.FISH_BY.trout);
  G.DN.force = 0.5; frames(2, 50); const rateDusk = G.biteRate(); G.DN.force = 0.25; frames(2, 50);
  ok(catNight > catDay * 3 && troutNight < troutDay && rateDusk > rateDay, 'catfish bite at night, trout by day, and everything bites more at dusk and dawn');
  fresh({ en: 80 }); Pf.root.position.set(0, 0, 30.4); Pf.heading = 0; G.tryInteract(); ok(!Pf.rodMesh && Fz.phase === null, 'you need a rod first');
  Pf.root.position.set(G.FISH_RACK.x + 1.1, 0, G.FISH_RACK.z); ok(G.nearRack(), 'the rod stand is by the lake path');
  G.tryInteract(); ok(!!Pf.rodMesh, 'E at the stand takes a fishing rod');
  Pf.root.position.set(0, 0, 9.5); Pf.heading = 0; G.tryInteract(); ok(Fz.phase === null, 'you can only cast when facing open water');
  Pf.root.position.set(0, 0, 30.4); Pf.heading = 0; frames(5, 16);
  Vt.en = 5; G.tryInteract(); ok(Fz.phase === null, 'too tired to cast when exhausted'); Vt.en = 80;
  const enCast = Vt.en; G.tryInteract(); ok(Fz.phase === 'cast' && Pf.anim.cast > 0, 'E casts the line (casting animation)');
  frames(20, 50); ok(Fz.phase === 'wait' && G.cellTop(Fz.tx, Fz.tz) < -0.5 && enCast - Vt.en >= 0.55 && Vt.act === 'fishing', 'the bobber lands in open water; the cast costs energy, waiting is calm fishing');
  Fz.waitT = 0; frames(2, 50); const early = Fz.fish; G.tryInteract();
  ok(early && Fz.fish === null && Fz.phase === 'wait', 'striking before the bite scares the fish off');
  const toBite = () => { Fz.waitT = 0; for (let i = 0; i < 1600 && Fz.phase === 'wait'; i++) frames(1, 50); return Fz.phase === 'bite'; };
  ok(toBite() && Fz.fish && Fz.fish.to, 'a fish swims up to the bobber, nibbles, then bites');
  frames(30, 50); ok(Fz.phase === 'wait' && !Fz.fish, 'miss the bite and it takes the bait and swims off');
  const reelIn = smart => { for (let i = 0; i < 3000 && Fz.phase === 'reel'; i++) { if (!smart || Fz.ten < 0.6) keysDown('e'); else keysUp('e'); frames(1, 50); } keysUp('e'); };
  ok(toBite(), 'another bite'); Fz.fish.sp = G.FISH_BY.tilapia; G.tryInteract();
  ok(Fz.phase === 'reel' && !getEl('#fishUI').hidden, 'striking in time hooks it: the tension meter appears');
  const enReel = Vt.en; keysDown('e'); frames(4, 50); const reelAct = Vt.act, reelPose = Pf.anim.reel; reelIn(true);
  ok(reelAct === 'reeling' && reelPose && Fz.phase === 'caught' && enReel - Vt.en > 0.3, 'holding E reels it in (reeling animation, hard work for your energy) until it is landed');
  ok(!getEl('#catchCard').hidden && /Tilapia/.test(getEl('#catchBody').innerHTML) && / kg/.test(getEl('#catchBody').innerHTML), 'a card shows the catch: species, weight and rarity');
  const nFish = G.LAKE_FISH.length, w1 = Fz.catch.w; keyTap('k');
  const log1 = G.fishLog();
  ok(Fz.phase === null && log1.kept.length === 1 && log1.kept[0].id === 'tilapia' && w1 >= 0.3 && w1 <= 1.2 && G.LAKE_FISH.length === nFish, 'K keeps it in your catch log; a new fish takes its place in the lake');
  G.tryInteract(); frames(20, 50); ok(toBite(), 'cast again and get a bite'); const relFish = Fz.fish; relFish.sp = G.FISH_BY.tilapia; G.tryInteract(); reelIn(true);
  ok(Fz.phase === 'caught', 'landed another'); keyTap('r'); frames(30, 50);
  ok(Fz.phase === null && G.fishLog().rel === 1 && G.LAKE_FISH.includes(relFish) && !relFish.hooked && G.lakeE(relFish.x, relFish.z) < 1, 'R throws it back: it swims off in the lake');
  G.tryInteract(); frames(20, 50); ok(toBite(), 'a big one bites'); Fz.fish.sp = G.FISH_BY.mahseer; G.tryInteract(); reelIn(false);
  ok(Fz.phase === null && G.fishLog().kept.length === 1, 'reeling a strong fish without easing off snaps the line');
  G.tryInteract(); frames(20, 50); keysDown('w'); frames(3, 50); keysUp('w'); ok(Fz.phase === null, 'walking off reels the line in');
  Pf.root.position.set(31.5, 0, G.SLOT_Z[0]); G.tryInteract(); ok(!Pf.held, 'with a rod in hand you can’t pick up food');
  keyTap('q'); ok(!Pf.rodMesh && Fz.phase === null, 'Q puts the rod back');
  G.openMenu(false); ok(/Your catches/.test(getEl('#modalBody').innerHTML) && /Tilapia/.test(getEl('#modalBody').innerHTML), 'the Menu shows your catches and best weights'); G.closeModal?.();
  G.DN.force = null; Pf.root.position.set(0, 0, 9.5); frames(5, 16);
  { // Playroom (own block scope)
  console.log('Playroom and arcade');
  if (G.state.modal) { keysDown('Escape'); keysUp('Escape'); }
  const ARC = G.arc, I0 = () => [G.toIn(0), G.toIn(0)], dt60 = 1 / 60;
  ok(G.zoneAt(24, -22) === 'Playroom' && G.getTile(24, -22) === 'carpet', 'the Playroom is a carpeted room north of the Pantry');
  const retro = G.ARCADES.filter(A => A.g < 5), slotsM = G.ARCADES.filter(A => A.g === 5);
  ok(retro.length === 5 && G.GAMES.length === 6 && new Set(retro.map(A => A.g)).size === 5, 'five retro cabinets, each with its own game: ' + G.GAMES.slice(0, 5).map(g => g.name).join(', '));
  ok(retro.every(A => Math.abs(Math.hypot(A.spot.x - 20.5, A.spot.z + 25.5) - 2.6) < 0.01), 'the retro cabinets stand in a circle, players around the outside');
  const rot0 = G.arcBanner().rotation.y; frames(4, 50); ok(G.arcBanner().rotation.y > rot0, 'the ARCADE banner above the circle turns');
  const rows = [...new Set(slotsM.map(A => A.z))]; ok(slotsM.length === 10 && rows.length === 2 && rows.every(z => slotsM.filter(A => A.z === z).length === 5) && slotsM.every(A => A.sit && A.face === Math.PI), 'ten slot machines in two rows of five, each with a stool');
  const sofaSeats = G.SPOTS.filter(s => s.sofa && s.zone === 'playroom');
  ok(sofaSeats.length === 6 && sofaSeats.every(s => s.zone === 'playroom' && s.pose === 'sit'), 'two sofas with three seats each around a coffee table');
  let gameErr = null; const g2d = getEl('#arcTest').getContext('2d');
  for (const Gm of G.GAMES) for (const two of [false, true]) {
    try { const s = Gm.init(two); for (let i = 0; i < 3600; i++) { const r = () => G.toIn(Math.floor(Math.random() * 32)); Gm.step(s, [r(), r()], dt60); if (i % 120 === 0) Gm.draw(g2d, s); } JSON.parse(JSON.stringify(s)); Gm.score(s); }
    catch (e) { gameErr = Gm.id + (two ? ' (2P)' : '') + ': ' + e.message; }
  }
  ok(!gameErr, 'every game runs a minute of random button mashing, alone and with two players, and its state can be sent over the network' + (gameErr ? ' — ' + gameErr : '')); delete store.ga_slots;// the fuzzing spent the slot credits
  const [GP, GS, GO, GB, GR] = G.GAMES;
  let s = GP.init(false); s.serve = 0; s.b = { x: -20, y: 100, vx: -100, vy: 0 }; GP.step(s, I0(), dt60);
  const pdl1 = s.sc[1] === 1; s.sc = [6, 0]; s.serve = 0; s.b = { x: 400, y: 100, vx: 100, vy: 0 }; GP.step(s, I0(), dt60);
  ok(pdl1 && s.over && s.win === 0, 'Paddle Duel: a missed ball scores for the other side; first to 7 wins');
  s = GS.init(true); s.pause = 0; s.ap = [7, 9]; GS.step(s, I0(), 0.12); const grew = s.sn[0].b.length === 4;
  s = GS.init(true); s.pause = 0; s.sn[0].b = [[31, 5], [30, 5], [29, 5]]; GS.step(s, I0(), 0.12);
  ok(grew && s.sc[1] === 1 && s.sn[0].alive && s.sn[0].b.length === 3, 'Snake Duel: apples make you longer; hit the wall and the other snake takes the round');
  s = GO.init(false); s.t = 0; s.en = [{ x: 192, y: 150, hx: 192, hy: 150, t: 0, hp: 1, k: 1, dv: 0 }, { x: 40, y: 40, hx: 40, hy: 40, t: 0, hp: 1, k: 1, dv: 0 }]; s.bl = [[192, 155]]; GO.step(s, I0(), dt60);
  const shot = s.score === 10 && s.en.length === 1; s.sh[0].inv = 0; s.eb = [[s.sh[0].x, s.sh[0].y]]; GO.step(s, I0(), dt60); const hit = s.lives === 2; s.en = []; GO.step(s, I0(), dt60);
  ok(shot && hit && s.wave === 2 && s.en.length === 24, 'Star Orchard: shots knock out invaders, enemy fire costs a life, a cleared wave brings the next');
  s = GB.init(false); GB.step(s, [G.toIn(16), G.toIn(0)], dt60); const launched = s.ball.stuck === -1 && s.ball.vy < 0;
  s.ball = { x: 20, y: 30, vx: 0, vy: -100, stuck: -1 }; const nb = s.br.length; GB.step(s, I0(), dt60); const broke = s.br.length === nb - 1 && s.score === 10;
  s.ball = { x: 100, y: 230, vx: 0, vy: 100, stuck: -1 }; GB.step(s, I0(), dt60);
  ok(launched && broke && s.lives === 2 && s.ball.stuck === 0, 'Brick Break: Space launches, bricks break for points, a dropped ball costs a life');
  s = GR.init(false); s.spawn = 9; s.it = [{ x: s.bk[0].x, y: 190, k: 'gold', vy: 0 }]; GR.step(s, I0(), dt60); const gold = s.sc[0] === 5;
  s.it = [{ x: s.bk[0].x, y: 190, k: 'bad', vy: 0 }]; GR.step(s, I0(), dt60); const bad = s.sc[0] === 2; s.time = 0.01; GR.step(s, I0(), dt60);
  ok(gold && bad && s.over, 'Apple Rush: golden apples +5, rotten ones −3, and the round ends after 60 seconds');
  const cab = G.ARCADES[1]; Pf.root.position.set(cab.spot.x, 0, cab.spot.z + 0.3); frames(10, 50);
  ok(G.nearestArcade() === cab && /to play Snake Duel/.test(getEl('#prompt').innerHTML), 'standing at a cabinet: “Press E to play Snake Duel”');
  fresh(); G.tryInteract(); frames(3, 50);
  ok(ARC.open && ARC.c === 1 && ARC.slot === 1 && !getEl('#arcade').hidden && Pf.anim.play && Vt.act === 'gaming', 'E opens the game full screen; you hold the controls and the HUD says “Playing a game”');
  ok(G.arcadeOccupants(1).p1 === G.myKey(), 'the cabinet knows you are playing (its screen shows your name to others)');
  const posA = Pf.root.position.clone(); keysDown('w'); frames(30, 50);
  ok(Pf.root.position.distanceTo(posA) < 0.01 && ARC.st.sn[0].d[1] === -1, 'W steers the snake, not your character'); keysUp('w');
  keysDown('Enter'); keysUp('Enter'); const paused = ARC.st.paused, tP = ARC.st.t; frames(10, 50);
  ok(paused && ARC.st.t === tP, 'Enter pauses'); keysDown('Enter'); keysUp('Enter'); frames(2, 50); ok(!ARC.st.paused && ARC.st.t > tP, 'and resumes');
  keysDown('Escape'); keysUp('Escape');
  ok(!ARC.open && getEl('#arcade').hidden && !Pf.anim.play, 'Esc leaves the cabinet');
  Pf.root.position.set(G.ARCADES[0].spot.x, 0, G.ARCADES[0].spot.z); G.tryInteract(); ARC.st.sc = [6, 0]; ARC.st.serve = 0; ARC.st.b = { x: 400, y: 100, vx: 100, vy: 0 }; frames(1, 50);
  const over = ARC.st.over; keysDown('Enter'); keysUp('Enter');
  ok(over && !ARC.st.over && ARC.st.sc[0] === 0, 'after a game over, Enter starts a new game');
  G.exitArcade(); Pf.root.position.set(G.ARCADES[2].spot.x, 0, G.ARCADES[2].spot.z); G.tryInteract(); ARC.st.score = 120; G.exitArcade();
  ok(JSON.parse(store.ga_arcade).orchard === 120 && JSON.parse(store.ga_arcade).paddle === 7, 'best scores are saved per game');
  const freeLane = sofaSeats.every(st => !boxBlocked(st.approach.x, st.approach.z) && !boxBlocked(st.approach.x - 1, st.approach.z) && !boxBlocked(st.approach.x + 1, st.approach.z));
  let walkedOff = true; for (const st of sofaSeats) { Pf.root.position.set(st.approach.x, 0, st.approach.z); G.tryInteract(); const sat = Pf.seat === st; G.tryInteract(); const x0 = Pf.root.position.x; keysDown('d'); frames(15, 50); keysUp('d'); const x1 = Pf.root.position.x; keysDown('a'); frames(30, 50); keysUp('a'); if (!sat || Pf.seat || (Math.abs(Pf.root.position.x - x1) < 0.5 && Math.abs(x1 - x0) < 0.5)) walkedOff = false; }
  ok(freeLane && walkedOff, 'after sitting on any sofa seat you can stand up and walk away along the gap between the sofa and the table');
  console.log('Golden Reels (slot machines)');
  let paid = 0, hits = 0; const NSPIN = 200000; for (let i = 0; i < NSPIN; i++) { const w = G.slotLines(G.SLOT_STRIPS.map(st => Math.floor(Math.random() * st.length))).reduce((a, l) => a + l.mult, 0); paid += w; if (w) hits++; }
  const rtp = paid / (NSPIN * 5); ok(rtp > 0.85 && rtp < 1.05 && hits / NSPIN > 0.25 && hits / NSPIN < 0.45, 'over 200,000 spins the machine pays back ' + (rtp * 100).toFixed(1) + '% of bets and wins on ' + (hits / NSPIN * 100).toFixed(0) + '% of spins');
  const stopFor = (c, sym) => G.SLOT_STRIPS[c].findIndex((x, i, a) => a[(i + 1) % a.length] === sym);// a stop showing sym on the middle row
  const ln = G.slotLines([stopFor(0, 3), stopFor(1, G.SLOT_WILD), stopFor(2, 3), stopFor(3, 3), stopFor(4, 0)]).find(l => l.li === 0);
  ok(ln && ln.sym === 3 && ln.k === 4 && ln.mult === G.SLOT_PAY[3][1], 'a golden apple stands in for any symbol (apple, golden apple, apple, apple pays as four apples)');
  const sm = slotsM[0]; Pf.root.position.set(sm.spot.x, 0, sm.spot.z); frames(10, 50);
  ok(/to play Golden Reels/.test(getEl('#prompt').innerHTML) && /200 credits/.test(getEl('#prompt').innerHTML), 'at a slot machine: “Press E to play Golden Reels · 200 credits” (a daily top-up of play credits)');
  G.tryInteract(); frames(2, 50); const SR = ARC.st;
  ok(ARC.open && G.GAMES[sm.g].mode === 'slots' && SR.cr === 200 && Pf.anim.pose === 'sit' && Pf.root.position.y < 0 && /no real money/.test(getEl('#arcPlayers').innerHTML), 'E sits you on the stool and opens the machine full screen; play credits only');
  keysDown(' '); keysUp(' '); frames(2, 50);
  ok(SR.phase === 'spin' && SR.cr === 195 && sm.pull > 0, 'Space spins (5 credits for 5 lines) and the lever goes down');
  keysDown('arrowup'); keysUp('arrowup'); ok(SR.bet === 0, 'the bet can’t change while the reels turn');
  let g2 = 0; while (SR.phase === 'spin' && g2++ < 200) frames(1, 50);
  const won = SR.win; ok(SR.phase === 'show' && SR.done.every(Boolean) && SR.cr === 195 + won && JSON.parse(store.ga_slots)[G.myKey()].c === SR.cr, 'the reels stop one by one; wins are paid and your credits are saved (' + (won ? 'won ' + won : 'no win') + ')');
  keysDown('arrowup'); keysUp('arrowup'); frames(1, 50); ok(SR.bet === 1, '↑ raises the bet');
  keysDown(' '); keysUp(' '); frames(2, 50); keysDown(' '); keysUp(' '); g2 = 0; while (SR.phase === 'spin' && g2++ < 40) frames(1, 50);
  ok(SR.phase === 'show' && g2 < 20 && SR.spins === 2, 'pressing Space again stops the reels early');
  SR.cr = 3; keysDown(' '); keysUp(' '); frames(1, 50); ok(SR.phase !== 'spin' && /Out of credits/.test(SR.msg), 'out of credits: no spin, and a note that more come tomorrow');
  keysDown('Escape'); keysUp('Escape'); frames(1, 50); ok(!ARC.open && Pf.anim.pose === 'stand' && Pf.root.position.y === 0, 'Esc gets you off the stool');
  const wal = JSON.parse(store.ga_slots); wal[G.myKey()].d = '2000-01-01'; wal[G.myKey()].c = 3; store.ga_slots = JSON.stringify(wal);
  ok(G.slotWallet().c === 200, 'the next day your credits are topped back up to 200');
  const sofa = sofaSeats[0]; Pf.root.position.set(sofa.approach.x, 0, sofa.approach.z); G.tryInteract();
  fresh({ en: 30 }); frames(MIN, 50); const sofaGain = Vt.en - 30; G.tryInteract();
  ok(Pf.seat === null && sofaGain > tiredGain * 1.15, 'a sofa is comfier than a bench (' + f1(sofaGain) + ' energy a minute when tired)');
  Pf.root.position.set(0, 0, 9.5); frames(5, 16);
  }
  { // Gym and showers (own block scope)
  console.log('Gym');
  if (G.state.modal) { keysDown('Escape'); keysUp('Escape'); }
  const GY = G.gym, kinds = k => G.GYM.filter(M => M.kind === k).length, at = M => Pf.root.position.set(M.ap.x, 0, M.ap.z);
  ok(G.zoneAt(-24, -22) === 'Gym' && G.getTile(-24, -22) === 'rubber', 'the Gym is north-west of the plaza, with a rubber floor');
  ok(kinds('treadmill') === 2 && kinds('elliptical') === 2 && kinds('bike') === 2 && kinds('bag') === 1 && kinds('dumbbell') === 2 && kinds('squat') === 1 && kinds('chest') === 1 && kinds('lat') === 1, 'cardio (2 treadmills, 2 ellipticals, 2 bikes, a punching bag) and strength (2 dumbbell spots, squat rack, chest press, lat pulldown)');
  ok(G.SPOTS.filter(s => s.sofa && s.zone === 'gym').length === 3, 'a sofa to recover on');
  const tm = G.GYM.find(M => M.kind === 'treadmill'); at(tm); frames(10, 50);
  ok(G.nearestGym() === tm && /to use the treadmill/.test(getEl('#prompt').innerHTML), 'standing behind a treadmill: “Press E to use the treadmill”');
  fresh({ en: 80, hp: 80 }); Vt.sw = 0; Vt.ex = 0; G.tryInteract(); frames(2, 50);
  ok(GY.use === tm && GY.lvl === 1 && Pf.anim.gym && Pf.anim.gym.k === 'treadmill' && Math.abs(Pf.root.position.y - 0.21) < 0.01 && Vt.act === 'workout' && /Treadmill · Jog/.test(getEl('#vAct').textContent), 'E steps onto the belt and starts at a jog (the default level); the HUD says “Treadmill · Jog”');
  const posT = Pf.root.position.clone(); keysDown('a'); frames(10, 50); keysUp('a');
  ok(Pf.root.position.distanceTo(posT) < 0.01, 'you stay on the machine until you stop');
  const hr0 = GY.hr; frames(MIN, 50); const enDrop = 80 - Vt.en, hpDrop = 80 - Vt.hp;
  ok(GY.hr > 125 && GY.hr > hr0 + 40 && enDrop > 4 && enDrop < 6.2 && hpDrop > 2, 'a minute of jogging: heart rate climbs to ' + Math.round(GY.hr) + ' bpm, energy −' + f1(enDrop) + ' (building up as you warm up), health −' + f1(hpDrop));
  ok(GY.km > 0.13 && GY.km < 0.155 && Vt.sw > 2 && Vt.ex > 0.8 && /km/.test(getEl('#prompt').innerHTML) && /bpm/.test(getEl('#prompt').innerHTML), 'the treadmill counts your distance (' + GY.km.toFixed(2) + ' km) and you start to sweat; the prompt shows speed, distance and heart rate');
  keysDown('w'); keysUp('w'); ok(GY.lvl === 2 && /Run/.test(G.gymLabel()), 'W speeds up to a run');
  keysDown('s'); keysUp('s'); keysDown('s'); keysUp('s'); ok(GY.lvl === 0 && /Walk/.test(G.gymLabel()), 'S slows down to a walk');
  keysDown('w'); keysUp('w'); keysDown('w'); keysUp('w'); Vt.en = 15; frames(2, 50);
  ok(GY.lvl === 1, 'too tired for the top speed: you ease off to a jog');
  keysDown('w'); keysUp('w'); ok(GY.lvl === 1, 'and can’t speed up again until you have more energy');
  Vt.en = 5.5; frames(2, 50);
  ok(!GY.use && !Pf.anim.gym && Pf.root.position.y === 0 && Math.abs(Pf.root.position.z - tm.ap.z) < 0.01, 'exhausted, you stop and step off by yourself');
  fresh({ en: 80 }); G.tryInteract(); frames(5, 50); G.tryInteract(); frames(2, 50);
  const off = Pf.root.position.clone(); keysDown('d'); frames(10, 50); keysUp('d');
  ok(!GY.use && Math.hypot(off.x - tm.ap.x, off.z - tm.ap.z) < 0.01 && Pf.root.position.distanceTo(off) > 0.3, 'E again stops the machine; you step off behind it and can walk away');
  const bk = G.GYM.find(M => M.kind === 'bike'); at(bk); G.tryInteract(); frames(20, 50);
  ok(GY.use === bk && Pf.root.position.y < 0.3 && Math.abs(bk.rig.crank.rotation.x) > 1, 'the exercise bike: you sit on the saddle and the pedals turn'); G.tryInteract(); frames(2, 50);
  const el = G.GYM.find(M => M.kind === 'elliptical'); at(el); G.tryInteract(); frames(20, 50);
  ok(GY.use === el && Math.abs(el.rig.armR.rotation.x) > 0.01, 'the elliptical: the handles swing with your stride'); G.tryInteract(); frames(2, 50);
  const d1 = G.GYM.find(M => M.kind === 'dumbbell'); at(d1); fresh({ en: 80 }); G.tryInteract(); frames(3, 50);
  ok(GY.use === d1 && Pf.gpKind === 'dumbbell' && Pf.gp.length === 2 && /Curls · 10 kg/.test(G.gymLabel()), 'dumbbells: one in each hand, curls at 10 kg');
  let guard = 0; while (GY.rest <= 0 && guard++ < 2000) frames(1, 50); frames(10, 50);
  ok(GY.reps === 10 && GY.rest > 0 && GY.sets === 1 && Pf.anim.gym.rest && /resting/.test(getEl('#prompt').innerHTML), 'a set is 10 reps, then a rest between sets');
  const enRest = Vt.en; frames(200, 50);
  ok(Vt.en > enRest - 0.3, 'resting between sets costs almost nothing'); frames(250, 50);
  ok(GY.set === 2 && !Pf.anim.gym.rest && GY.reps <= 1, 'after the rest, set 2 starts');
  G.tryInteract(); frames(2, 50);
  const sq = G.GYM.find(M => M.kind === 'squat'); at(sq); G.tryInteract(); frames(3, 50);
  ok(GY.use === sq && Pf.gpKind === 'barbell' && !sq.rig.bar.visible, 'squat rack: the bar comes off the hooks onto your shoulders');
  Pf.anim.gym.ph = Math.PI; frames(4, 50);
  ok(Pf.av.legR.rotation.x < -0.8 && Pf.av.model.position.y < -0.2, 'you squat down and up: legs bend, hips drop');
  G.tryInteract(); frames(2, 50); ok(!GY.use && sq.rig.bar.visible && !Pf.gpKind, 'stepping out puts the bar back on the rack');
  const lat = G.GYM.find(M => M.kind === 'lat'); at(lat); G.tryInteract(); frames(3, 50);
  ok(GY.use === lat && Pf.root.position.y < 0 && Pf.av.legR.rotation.x < -1.2, 'lat pulldown: you sit at the machine');
  const gy0 = lat.rig.y0; Pf.anim.gym.ph = Math.PI; frames(1, 50);
  ok(lat.rig.grip.position.y < gy0 - 0.3, 'and the bar comes down with each rep'); G.tryInteract(); frames(2, 50);
  ok(G.gymStats().cmin > 1 && G.gymStats().sets >= 1, 'your workout totals are saved');
  G.openMenu(false); ok(/Your workouts/.test(getEl('#modalBody').innerHTML) && /min cardio/.test(getEl('#modalBody').innerHTML), 'the Menu shows your workouts'); keysDown('Escape'); keysUp('Escape');
  const gs = G.SPOTS.find(x => x.sofa && x.zone === 'gym'); Pf.root.position.set(gs.approach.x, 0, gs.approach.z); G.tryInteract();
  fresh({ en: 30 }); Vt.ex = 0; frames(MIN, 50); const calm = Vt.en - 30, hpCalm = 80 - Vt.hp;
  fresh({ en: 30 }); Vt.ex = 6; frames(MIN, 50); const glow = Vt.en - 30, hpGlow = 80 - Vt.hp; G.tryInteract();
  ok(Pf.seat === null && glow > calm * 1.2 && hpGlow > hpCalm * 1.15, 'after a workout, resting recovers you faster (' + f1(glow) + ' vs ' + f1(calm) + ' energy a minute) and you get hungry sooner');
  Pf.root.position.set(G.GYM_COOLER.x, 0, G.GYM_COOLER.z - 0.9); frames(10, 50);
  ok(G.nearCooler() && /water bottle/.test(getEl('#prompt').innerHTML), 'a water cooler by the sofa'); G.tryInteract();
  ok(Pf.held === 'water', 'E grabs a water bottle'); keyTap('q');
  console.log('Showers');
  const sh = G.STALLS.find(S => S.kind === 'shower'); Pf.root.position.set(sh.at.x, 0, sh.at.z); frames(10, 50);
  ok(G.nearestStall() === sh && /take a shower/.test(getEl('#prompt').innerHTML), 'standing at a shower: “Press E to take a shower”');
  fresh({ en: 50, bl: 40 }); Vt.sw = 70; Vt.clean = false; Vt.fresh = 0; G.tryInteract(); frames(20, 50);
  ok(G.rr.use && G.rr.use.S === sh && !Pf.root.visible && sh.occ === 'me' && Vt.act === 'showering' && /Showering/.test(sh.label.innerHTML), 'the shower hides you, marks it Occupied, and your label says “Showering”');
  const swMid = Vt.sw; frames(300, 50);
  ok(swMid < 70 && !G.rr.use && Pf.root.visible && Vt.sw === 0 && Vt.clean && Vt.bl >= 40 && Vt.fresh > 3, 'you come out clean and no longer sweaty; a shower doesn’t empty your bladder');
  const enS = Vt.en; frames(MIN, 50);
  ok(Vt.en > enS + 1, 'over the next few minutes the shower perks you up (+' + f1(Vt.en - enS) + ' energy while standing)');
  Object.assign(Vt, { sw: 0, ex: 0, fresh: 0 }); Pf.root.position.set(0, 0, 9.5); frames(5, 16);
  }
  { // Playground (own block scope)
  console.log('Playground');
  if (G.state.modal) { keysDown('Escape'); keysUp('Escape'); }
  const [TC, BC] = G.COURTS, MT = G.mt;
  ok(G.zoneAt(28, 20) === 'Playground' && G.getTile(28, 20) === 'court' && G.getTile(40, 16) === 'court2', 'the Playground has a blue tennis court and a green badminton court');
  ok(G.halfAt(TC, 28, 16) === 0 && G.halfAt(TC, 28, 29) === 1 && G.halfAt(TC, 28, 22.5) === null && G.halfAt(BC, 40, 25) === 1 && G.halfAt(TC, 40, 25) === null, 'each court has two halves, one each side of the net');
  ok(G.cellTop(28, 22.5) > 0.55 && G.cellTop(40, 20.5) > 0.55 && G.cellTop(34.5, 22) === 0, 'the nets are solid; you walk round them through the gap between the courts');
  const stand = G.SPOTS.filter(s => s.zone === 'play' && s.pose === 'sit');
  ok(stand.length === 21 && new Set(stand.map(s => s.y)).size === 3, 'three-tier stands with 21 seats for the audience');
  const topSeat = stand.find(s => s.y === 1.5); Pf.root.position.set(topSeat.approach.x, 1.5, topSeat.approach.z); frames(5, 50); G.tryInteract();
  ok(Pf.seat === topSeat, 'you can sit on the top tier to watch'); G.tryInteract(); frames(10, 50);
  ok(!Pf.seat && Math.abs(Pf.root.position.y - 1.5) < 0.01, 'and stand up on it again');
  Pf.root.position.set(28, 0, 16); frames(10, 50);
  ok(!getEl('#matchBar').hidden && getEl('#mNote').textContent === 'No opponent' && /No opponent/.test(getEl('#prompt').innerHTML), 'alone in a court half, the score bar says “No opponent”');
  G.tryInteract(); ok(!MT.on && !MT.out, 'you can’t start a match on your own');
  Pf.root.position.set(34.5, 0, 22); frames(10, 50); ok(getEl('#matchBar').hidden, 'the bar goes away when you leave the court');
  const flyTo = (C, B) => { for (let i = 0; i < 2000 && B.live && !B.b && !B.rest; i++) G.stepBall(C, B, 1 / 60, false); return B; };
  let shot = G.makeShot(TC, { x: 28, y: 1.1, z: 15 }, 1, 26, 0.7, 1, false), Bl = flyTo(TC, G.newBall(TC, { x: 28, y: 1.1, z: 15 }, shot.v, 0, 1));
  ok(Bl.live && Bl.b === 1 && Math.hypot(Bl.p0.x - shot.tgt.x, Bl.p0.z - shot.tgt.z) < 0.1 && G.inCourt(TC, 1, Bl.p0.x, Bl.p0.z), 'a tennis shot clears the net and bounces where it was aimed');
  shot = G.makeShot(BC, { x: 40, y: 1.2, z: 16 }, 1, 41, 0.6, 1, false); Bl = flyTo(BC, G.newBall(BC, { x: 40, y: 1.2, z: 16 }, shot.v, 0, 1));
  ok(Bl.rest && Math.hypot(Bl.pos.x - shot.tgt.x, Bl.pos.z - shot.tgt.z) < 0.1, 'a shuttle slows down in the air and lands where it was aimed');
  Bl = G.newBall(TC, { x: 28, y: 0.5, z: 18 }, { x: 0, y: 1, z: 12 }, 0, 1); for (let i = 0; i < 120 && Bl.live; i++) G.stepBall(TC, Bl, 1 / 60, false);
  ok(!Bl.live && Math.abs(Bl.pos.z - 22.5) < 0.2, 'a low shot stops dead in the net');
  ok(G.isOver([10, 8]) && !G.isOver([10, 9]) && !G.isOver([11, 10]) && G.isOver([12, 10]) && !G.isOver([9, 0]), 'first to 10 points, and you must win by 2');
  Pf.root.position.set(28, 0, 16); fresh({ en: 80 }); G.startMatch(0, 0, 'nobody', 0); frames(2, 50);
  ok(MT.on && MT.phase === 'serve' && Pf.anim.sport === 'tennis' && Pf.rkKind === 'tennis' && Math.abs(Pf.root.position.z - 13.1) < 0.01 && /Your serve/.test(getEl('#mNote').textContent) && Vt.act === 'sport', 'a match puts a racket in your hand and you behind the baseline to serve');
  keysDown('shift'); keysDown('w'); frames(40, 50); keysUp('w'); keysUp('shift'); ok(Pf.root.position.z <= 21.71 && Pf.root.position.z > 20, 'you can run up to the net but not past it');
  keysDown(' '); keysUp(' '); ok(MT.phase === 'rally' && MT.ball && MT.ball.by === 0 && Pf.anim.swing > 0 && MT.myHit && MT.myHit[0] === 1, 'Space serves (swing animation, the ball is in play)');
  MT.sc = [3, 1]; keysDown('q'); keysUp('q');
  ok(!MT.on && MT.end && MT.end.w === 0 && Pf.anim.celebrate > 0 && getEl('#toasts').children.some(t => /You win the tennis match 3–1/.test(t.innerHTML)), 'Q leaves the match any time; the score decides the winner, who celebrates');
  frames(4, 50); ok(!Pf.rkKind, 'the racket goes away');
  G.startMatch(0, 0, 'nobody', 0); frames(100, 50); ok(!MT.on && getEl('#toasts').children.some(t => /left the court/.test(t.innerHTML)), 'if your opponent disappears, the match ends');
  Object.assign(Vt, { sw: 0, ex: 0 }); Pf.root.position.set(0, 0, 9.5); frames(5, 16);
  }
  console.log('Apples & Golden Apple');
  const oldCh = G.state.chars.get('local:old@example.com');
  ok(!!oldCh && oldCh.kind === 'local', 'the other real profile on this browser is in the world as Away');
  const me = G.state.me; me.given = null; // reset budget for a deterministic test
  oldCh.data.received = 10;
  ok(!G.isGolden(10) && G.isGolden(11), 'threshold: 10 is not golden, 11 is');
  const r1 = G.giveApples(G.state.player, oldCh, 3, 'Problem solver', 'Great catch');
  ok(r1 && r1.became === true && oldCh.data.received === 13, 'giving 3 apples to Old Timer (10→13) makes them a Golden Apple');
  ok(G.budgetLeft(me) === 7, 'giver budget drops to 7/10');
  ok(G.giveApples(G.state.player, oldCh, 8, 'Team player', '') === false, 'cannot give 8 when only 7 left');
  ok(G.giveApples(G.state.player, G.state.player, 1, 'Team player', '') === false, 'cannot give apples to yourself');
  ok(!!G.giveApples(G.state.player, oldCh, 7, 'Team player', ''), 'can give the remaining 7');
  ok(G.budgetLeft(me) === 0, 'budget is now 0/10');
  me.given = { d: '2000-01-01', n: 10 }; ok(G.budgetLeft(me) === 10, 'budget refills on a new day');
  ok(G.WORLD().feed[0].kind === 'apple' || G.WORLD().feed[0].kind === 'golden', 'feed records the gift');
  G.openCard(oldCh); G.renderCard(); G.openBoard(); G.openInbox(); G.openMenu(false); G.openMenu(true);
  ok(true, 'card, board, inbox and menu render without errors');
  G.doPoke(G.state.player, oldCh, 'Coffee break?');
  await new Promise(r => setTimeout(r, 2500)); frames(60, 16);
  ok(G.USERS()['old@example.com'].inbox.some(i => i.type === 'poke' && i.msg === 'Coffee break?'), 'poke to an Away user lands in their inbox');

  console.log('Physics and real-world sizes');
  const P0 = G.state.player, pos = P0.root.position; G.cam.yaw = 0; G.closeCard(); if (G.state.modal) G.closeModal();
  pos.set(0, 0, 9.5); fresh(); frames(3, 16); keysDown('w'); frames(40, 50); keysUp('w'); const walked = 9.5 - pos.z;
  pos.set(0, 0, 9.5); fresh(); frames(3, 16); keysDown('shift'); keysDown('w'); frames(20, 50); keysUp('w'); keysUp('shift'); const ran = 9.5 - pos.z;
  ok(near(walked / 2, G.MOVE.walk, 0.12) && near(ran, G.MOVE.run, 0.4), 'people walk at a real 1.6 m/s and run at 5.6 m/s (' + (walked / 2).toFixed(2) + ' and ' + ran.toFixed(2) + ' m/s)');
  pos.set(0, 0, 9.5); frames(5, 16); let top = 0, air = 0; keysDown(' '); keysUp(' ');
  for (let i = 0; i < 90; i++) { frames(1, 10); top = Math.max(top, pos.y); if (pos.y > 0) air += 0.01; }
  ok(near(top, 1.11, 0.06) && near(air, 0.64, 0.08), 'Space jumps about 1.1 m high for about 0.64 s, as before (' + top.toFixed(2) + ' m, ' + air.toFixed(2) + ' s)');
  const ox = oldCh.root.position.x, oz = oldCh.root.position.z; oldCh.root.position.x = 0; oldCh.root.position.z = 7;
  pos.set(0, 0, 9.5); fresh(); frames(3, 16); keysDown('w'); frames(60, 50); keysUp('w'); const stopAt = pos.z;
  keysDown('s'); frames(5, 50); keysUp('s'); const backAt = pos.z; oldCh.root.position.x = ox; oldCh.root.position.z = oz;
  ok(stopAt > 7.45 && stopAt < 7.6 && backAt > stopAt + 0.2, 'you can’t walk through a coworker: you stop when your shoulders meet, and can always step back (' + stopAt.toFixed(2) + ')');
  const lamp = G.LAMPS.find(l => l.kind === 'street' && l.x === 2.6 && l.z === -8);
  ok(G.cellTop(lamp.x, lamp.z) >= 3 && G.cellTop(lamp.x + 0.45, lamp.z) === 0 && G.cellTop(lamp.x, lamp.z + 0.45) === 0, 'collision follows each prop’s real shape (0.25 m grid): a lamp post blocks its own 0.4 m, not the whole metre round it');
  let benchArea = 0; for (let x = 2.5; x < 5; x += 0.25) for (let z = -5; z < -2.5; z += 0.25) if (G.cellTop(x + 0.125, z + 0.125) > 0.55) benchArea += 0.0625;
  ok(benchArea > 0.9 && benchArea < 1.8, 'a diagonal plaza bench blocks about its own 1.2 m² (' + benchArea.toFixed(2) + ' m²), not four whole tiles');
  let ghosts = [];
  for (const mat of ['noise', 'glow', 'glass']) for (const b of G.FURN[mat]) {
    const [x, y, z, sx, sy, sz, , rot] = b; if (y + sy / 2 < 0.6 || y - sy / 2 > 1.75 || (Math.max(sx, sz) < 0.3 && Math.min(sx, sz) < 0.1)) continue;// below the knee, above the head, or a thin stem
    const c0 = Math.cos(rot), s0 = Math.sin(rot), at = (u, v) => G.cellTop(x + u * c0 + v * s0, z - u * s0 + v * c0);
    if (Math.min(sx, sz) <= 0.05 && (sx < sz ? at(-0.15, 0) > 0.55 || at(0.15, 0) > 0.55 : at(0, -0.15) > 0.55 || at(0, 0.15) > 0.55)) continue;// flat on a wall
    let n = 0, k = 0; for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) { n++; if (at((i / 6 - 0.5) * sx * 0.96, (j / 6 - 0.5) * sz * 0.96) > 0.55) k++; }
    if (k / n < 0.6) ghosts.push(x.toFixed(1) + ',' + z.toFixed(1));
  }
  ok(ghosts.length === 0, 'nothing between knee and head height can be walked through: every prop is solid where it stands' + (ghosts.length ? ' — not solid: ' + ghosts.slice(0, 6).join(' ') : ''));
  ok(G.cellTop(5.2, 31.2) === -1 && G.cellTop(-16.6, 31.2) === -0.5, 'the lake is 1 m deep with a shallow shelf at the edge, like a real shore');
  pos.set(-12, -1, 31); fresh(); frames(3, 16); keysDown('a'); frames(200, 50); keysUp('a');
  ok(pos.x < -17.2 && Math.abs(pos.y) < 1e-6, 'you swim to the shore and wade out without having to jump (' + pos.x.toFixed(1) + ')');
  let dryEdge = 0; for (let cx = -24; cx < 24; cx++) for (let cz = 18; cz < 44; cz++) { if (G.getTile(cx, cz) !== 'water') continue; let shore = false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const t = G.getTile(cx + dx, cz + dz); if (t !== 'water' && t !== 'dock') shore = true; }
    if (shore && G.cellTop(cx + 0.5, cz + 0.5) !== -0.5) dryEdge++; }
  ok(dryEdge === 0, 'the shallow shelf runs all the way round: every bit of water touching the shore is wadeable');
  pos.set(2.5, -1, 24.5); fresh(); frames(3, 16); keysDown('w'); frames(150, 50); keysUp('w');
  ok(pos.z < 22.5 && Math.abs(pos.y) < 1e-6, 'from deep water by the dock you wade out on the north shore too (' + pos.z.toFixed(1) + ')');
  pos.set(1.6, -1, 26); fresh(); frames(3, 16); keysDown('a'); keyTap(' '); frames(30, 16); keyTap(' '); frames(30, 16); keysUp('a');
  ok(pos.x < 1 && Math.abs(pos.y) < 1e-6, 'and you can jump out of deep water up onto the dock, as before (' + pos.x.toFixed(2) + ', ' + pos.y.toFixed(2) + ')');
  const dd = G.DOORS.find(d => d.key === 'desks'); pos.set(0, 0, -14.6); frames(20, 50); const opened = dd.open;
  pos.set(0, 0, -8); frames(40, 50);
  ok(G.DOORS.length === 5 && opened > 0.9 && dd.open < 0.05, 'automatic sliding doors open as someone walks up and close behind them');
  const pst = G.SPOTS.filter(s => s.zone === 'pantry' && s.pose === 'sit');
  ok(pst.length === 8 && pst.every(s => { const e = Math.max(Math.abs(s.x - 24), Math.abs(s.z - (s.z < 0.5 ? -3 : 4))) - 0.6; return e > 0.2 && e < 0.45; }), 'pantry stools sit 0.35 m from a 1.2 m cafe table, close enough to eat at it');
  const REAL = { // real-world sizes in metres, [min, max]: the long and short side of the footprint and the height
    bench: { long: [1.5, 2.0], h: [0.75, 1.0] }, pantryTable: { long: [0.8, 1.2], h: [0.72, 0.78] }, stool: { h: [0.43, 0.52] }, sofa: { long: [1.8, 2.4], short: [0.75, 1.0], h: [0.8, 1.0] },
    coffeeTable: { h: [0.38, 0.48] }, fridge: { h: [1.75, 2.1] }, vending: { h: [1.75, 1.95], long: [0.8, 1.0] }, slotMachine: { h: [1.6, 2.2] }, tennisNet: { h: [0.9, 1.07] },
    streetLamp: { h: [3, 5] }, bollard: { h: [0.8, 1.1] }, sign: { h: [1.8, 2.4] }, infoBoard: { h: [1.8, 2.2] }, fingerpost: { h: [2.4, 3.2] }, recycleBin: { h: [0.85, 1.1], long: [0.4, 0.65] },
    refill: { h: [1.0, 1.25] }, car: { long: [4.0, 4.8], short: [1.7, 1.9], h: [1.35, 1.6] }, bike: { long: [1.6, 1.9], h: [0.95, 1.15] }, evCharger: { h: [1.1, 1.6] },
    shuttle: { long: [3.2, 4.6], h: [1.8, 2.2] }, sheep: { long: [1.2, 1.6], h: [0.75, 1.1] }, beehive: { h: [0.8, 1.2] }, raisedBed: { h: [0.3, 0.8] }, rainBarrel: { h: [0.8, 1.1] },
    shed: { h: [2.0, 2.6] }, greenhouse: { h: [2.2, 3.2] }, appleTree: { h: [2.2, 4.0] }, windTurbine: { h: [9, 30] } };
  const offSize = []; for (const [name, want] of Object.entries(REAL)) { const got = G.PROPS[name]; if (!got) { offSize.push(name + ' missing'); continue; } for (const [k, [lo, hi]] of Object.entries(want)) if (got[k] < lo || got[k] > hi) offSize.push(name + '.' + k + '=' + got[k]); }
  ok(offSize.length === 0, Object.keys(REAL).length + ' props match real-world sizes (furniture, lamps, signs, bins, cars, bikes, animals, trees…)' + (offSize.length ? ' — off: ' + offSize.join(', ') : ''));
  ok(near(G.PX * 32, 1.8, 0.05), 'people are 1.8 m tall: the scale everything is built to');
  pos.set(0, 0, 9.5); frames(5, 16);

  console.log('Campus bikes');
  const BK = G.bikes, meK = G.myKey(), behind = (D, d) => ({ x: D.x - Math.sin(D.h) * d, z: D.z - Math.cos(D.h) * d });
  ok(G.BIKE_STANDS.length === 5 && G.DOCKS.length === 10 && BK().every((b, i) => b.d === i && !b.r), 'five bike stands across the campus, with two bikes docked at each');
  let spread = true; G.BIKE_STANDS.forEach((a, i) => G.BIKE_STANDS.forEach((c, j) => { if (i !== j && Math.hypot(a.x - c.x, a.z - c.z) < 20) spread = false; }));
  ok(spread && G.DOCKS.every(D => { const q = behind(D, 1.5); return G.cellTop(q.x, q.z) === 0 && !G.bikeHits(q.x, q.z, 0.28); }), 'the stands are spread round the grounds (20 m or more apart), each with room to wheel a bike out');
  const D0 = G.DOCKS[0]; G.cam.yaw = 0; fresh(); let q0 = behind(D0, 1.5); pos.set(q0.x, 0, q0.z); frames(2, 16);
  frames(30, 16); ok(G.useVerb() === 'Ride' && G.bikeHits(D0.x, D0.z, 0.1) && /take a bike · Welcome Arch stand, 2 bikes here/.test(getEl('#prompt').innerHTML), 'by a stand E takes a bike (the prompt names the stand and its bikes), and a docked bike is solid: you walk round it');
  G.tryInteract(); frames(2, 16);
  ok(G.ride.b === 0 && BK()[0].r === meK && BK()[0].d === -1 && P0.anim.ride && G.useVerb() === 'Return', 'E takes the bike: you sit on it, its dock is free, and Use now says Return');
  pos.set(-30, 0, 41.5); P0.heading = Math.PI / 2; P0.root.rotation.y = Math.PI / 2; G.ride.v = 0; fresh();
  keysDown('d'); frames(60, 50); const cruise = G.ride.v; keysDown('shift'); frames(40, 50); const fast = G.ride.v; const hardAct = Vt.act; keysUp('shift'); keysUp('d');
  ok(near(cruise, 4.5, 0.05) && near(fast, 7, 0.05) && hardAct === 'cyclingHard', 'on the Green Loop you cruise at 16 km/h and pedal hard at 25 km/h, picking up speed like a real bike');
  const h0 = P0.heading; keysDown('w'); frames(4, 50); keysUp('w'); const turned = Math.abs(G.angDiff(P0.heading, h0));
  ok(turned > 0.35 && turned < 0.55, 'a bike steers into a turn instead of spinning on the spot (' + turned.toFixed(2) + ' rad in 0.2 s)');
  keyTap(' '); frames(5, 16); ok(Math.abs(pos.y) < 1e-6 && G.ride.b === 0, 'Space rings the bell instead of jumping');
  pos.set(5, 0, 19); P0.heading = 0; P0.root.rotation.y = 0; G.ride.v = 0; keysDown('s'); frames(50, 50); keysUp('s');
  ok(pos.z > 20 && pos.z < 22.2 && G.cellTop(pos.x, pos.z) > -0.25, 'bikes stay on dry land: you stop at the lake shore (' + pos.z.toFixed(1) + ')');
  pos.set(14, 0, 0.5); P0.heading = Math.PI / 2; P0.root.rotation.y = Math.PI / 2; G.ride.v = 0; keysDown('d'); frames(40, 50); keysUp('d');
  ok(pos.x > 15.5 && pos.x < 17.2 && G.zoneAt(pos.x, pos.z) !== 'Pantry', 'no bikes indoors: you stop at the Pantry door (' + pos.x.toFixed(1) + ')');
  frames(10, 50); G.tryInteract(); frames(1, 16); const lb = BK()[0];
  ok(G.ride.b === null && lb.d === -1 && !lb.r && Math.hypot(lb.x - pos.x, lb.z - pos.z) > 0.6 && G.bikeHits(lb.x, lb.z, 0.1) && !P0.anim.ride, 'E away from a stand: you get off and the bike stays on its kickstand where you left it, solid');
  ok(JSON.parse(store.ga_world).bikes[0].d === -1, 'where every bike is gets saved on this browser');
  G.tryInteract(); frames(2, 16); ok(G.ride.b === 0, 'and E by that bike gets you back on');
  G.tryInteract(); frames(2, 16);
  const D4 = G.DOCKS[4]; q0 = behind(D4, 1.5); pos.set(q0.x, 0, q0.z); frames(2, 16); G.tryInteract(); frames(2, 16);
  ok(G.ride.b === 4 && BK()[4].d === -1, 'at the Mobility Hub stand you take another bike');
  q0 = behind(D0, 1.6); pos.set(q0.x, 0, q0.z); frames(2, 16); G.tryInteract(); frames(2, 16);
  ok(G.ride.b === null && BK()[4].d === 0 && G.bikeHits(D0.x, D0.z, 0.1) && !G.bikeHits(pos.x, pos.z, 0.28), 'and return it to the Welcome Arch stand: any stand with a free dock takes any bike');
  BK()[0].t = Date.now() - 11 * 60000; frames(50, 50);
  ok(BK()[0].d === 4 && BK().every(b => b.d >= 0), 'a bike left out for 10 minutes is taken back to the nearest free dock');
  pos.set(0, 0, 9.5); frames(5, 16);

  console.log('Mouse look');
  const doc = window.document, cv = G.cvs; let asked = 0;
  cv.requestPointerLock = () => { asked++; doc.pointerLockElement = cv; }; doc.exitPointerLock = () => { doc.pointerLockElement = null; };
  ok(!G.mouseLook.on, 'mouse look is off unless you turn it on (drag to look, as before)');
  G.openMenu(false); const mLook = /id="mLook"/.test(getEl('#modalBody').innerHTML); G.closeModal();
  G.setMouseLook(true); ok(mLook && G.mouseLook.on && JSON.parse(store.ga_mouselook) === true, 'the Menu has a Mouse look switch, and the choice is remembered on this browser');
  cv.dispatch('pointerdown', { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 }); cv.dispatch('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 300, clientY: 300 });
  ok(asked === 1 && G.mouseLocked(), 'one click on the world captures the mouse');
  const yaw0 = G.cam.yaw, pit0 = G.cam.pitch; window._l.mousemove.forEach(fn => fn({ movementX: 100, movementY: 20 }));
  ok(near(G.cam.yaw, yaw0 - 0.65, 1e-6) && G.cam.pitch > pit0, 'then moving the mouse turns the camera, with no button held');
  frames(30, 16); ok(!getEl('#crosshair').hidden, 'a crosshair marks the middle of the screen while the mouse is captured');
  G.openMenu(false); ok(!G.mouseLocked(), 'opening a menu gives the cursor back for its buttons'); G.closeModal(); frames(30, 16);
  const yaw1 = G.cam.yaw; window._l.mousemove.forEach(fn => fn({ movementX: 100, movementY: 0 }));
  ok(G.cam.yaw === yaw1 && getEl('#crosshair').hidden, 'with the cursor back, moving the mouse doesn’t turn the camera and the crosshair hides');
  G.setMouseLook(false); ok(!G.mouseLook.on && JSON.parse(store.ga_mouselook) === false, 'and the option turns off again');

  console.log('Duplicate email & returning user');
  G.logout();
  ok(G.state.mode === 'login' && !cookieJar.ga_session, 'logout clears session cookie');
  email.value = 'tester@example.com'; getEl('#loginForm').dispatch('submit');
  ok(G.state.mode === 'world' && G.state.me.name === 'Test User', 'same email logs straight back in (no duplicate profile)');
  ok(Object.keys(G.USERS()).filter(k => k === 'tester@example.com').length === 1 && Object.keys(G.USERS()).length === 2, 'still exactly one profile for that email');
  // second user on the same browser shows up as Away
  G.logout(); email.value = 'second@example.com'; getEl('#loginForm').dispatch('submit');
  getEl('#pName').value = 'Second'; G.state.setup.desk.plant = 3; getEl('#setupForm').dispatch('submit');
  const away = [...G.state.chars.values()].filter(c => c.kind === 'local');
  const tester = away.find(c => c.data.name === 'Test User');
  ok(away.length === 2 && !!tester && G.state.chars.size === 3, 'other profiles on this browser appear as Away, and nobody else');
  const sec = G.state.me;
  ok(sec.desk.plant === 3 && sec.deskSlot >= 0 && ![testerSlot, oldSlot].includes(sec.deskSlot), 'desk picked during sign-up (cactus) is saved, in a third spot');
  ok(tester.spot === mySlot.spot && G.DESK_SLOTS.filter(S => S.desk).length === 3, 'Test User now sits Away at their own desk; three desks built');
  G.state.me.given = null; G.giveApples(G.state.player, tester, 2, 'Helping hand', 'Thanks!');
  ok((G.USERS()['tester@example.com'].inbox || []).some(i => i.type === 'apple' && i.count === 2), 'apples to an Away user land in their inbox');
  // deleting a profile frees its desk (drop listeners left by earlier menus so only this one runs)
  const secSlot = sec.deskSlot; getEl('#mDelYes@modalBody')._l = {};
  G.openMenu(true); getEl('#mDelYes@modalBody').dispatch('click');
  ok(!G.USERS()['second@example.com'] && !G.DESK_SLOTS[secSlot].desk, 'deleting a profile removes its desk');
  // cookie-only recovery: wipe localStorage, keep cookies
  for (const k of Object.keys(store)) delete store[k];
  const rec = G.findUser('tester@example.com');
  ok(!!rec && rec.name === 'Test User', 'profile can be rebuilt from its cookie alone');
  ok(rec.deskSlot === testerSlot && rec.desk.pet === 1 && rec.desk.decor.length === 2 && rec.avatar.gender === 1, 'desk spot, desk choices and gender are rebuilt from the cookie too');

  console.log('Touch controls (a phone held sideways)');
  const t = H.createClient({ coarse: true }); t.boot(); const T = t.G;
  t.getEl('#soloBtn').dispatch('click'); t.getEl('#email').value = 'thumb@example.com'; t.getEl('#loginForm').dispatch('submit');
  t.getEl('#pName').value = 'Thumb'; t.getEl('#setupForm').dispatch('submit'); t.frames(5, 16);
  const TP = T.state.player, mz = t.getEl('#moveZone'), tz0 = TP.root.position.z;
  ok(T.state.mode === 'world' && !t.getEl('#touch').hidden, 'phones and tablets get the touch controls');
  mz.dispatch('pointerdown', { pointerId: 3, clientX: 150, clientY: 300 }); mz.dispatch('pointermove', { pointerId: 3, clientX: 150, clientY: 260 });
  ok(T.joy.y < -0.7 && !T.joy.run, 'the stick appears where the left thumb lands; pushing up walks forward');
  t.frames(30, 16); ok(TP.root.position.z < tz0 - 0.5, 'and you walk');
  mz.dispatch('pointermove', { pointerId: 3, clientX: 150, clientY: 200 }); ok(T.joy.run, 'pushing past the ring runs');
  mz.dispatch('pointerup', { pointerId: 3, clientX: 150, clientY: 200 }); ok(T.joy.x === 0 && T.joy.y === 0 && !T.joy.run && T.joy.active === false, 'letting go stops you');
  const tBench = T.SPOTS.find(s => s.pose === 'sit' && s.zone === 'plaza' && !s.desk);
  TP.root.position.set(tBench.approach.x, 0, tBench.approach.z); t.frames(30, 16);
  ok(T.useVerb() === 'Sit' && t.getEl('#tUseV').textContent === 'Sit', 'the Use button names what it will do (Sit by a bench)');
  t.getEl('#tUse').dispatch('click'); t.frames(30, 16); ok(!!TP.seat && t.getEl('#tUseV').textContent === 'Stand', 'tapping it sits you down, and it now says Stand');
  t.getEl('#tUse').dispatch('click'); TP.hold(T.FOODS[0].id); t.frames(30, 16);
  ok(!t.getEl('#tDrop').hidden && t.getEl('#tDrop').textContent === 'Drop' && !t.getEl('#tEat').hidden, 'holding food shows Eat and Drop');
  t.getEl('#tDrop').dispatch('click'); t.frames(30, 16); ok(!TP.held && t.getEl('#tDrop').hidden, 'Drop puts it down (same as Q)');
  const TD = T.DOCKS[2]; TP.root.position.set(TD.x - Math.sin(TD.h) * 1.5, 0, TD.z - Math.cos(TD.h) * 1.5); t.frames(30, 16);
  ok(t.getEl('#tUseV').textContent === 'Ride', 'by a bike stand the Use button says Ride');
  t.getEl('#tUse').dispatch('click'); t.frames(30, 16);
  ok(T.ride.b === 2 && t.getEl('#tJump').textContent === 'Bell' && t.getEl('#tUseV').textContent === 'Return', 'on a bike Jump becomes Bell, and Use says Return by a stand');
  T.setMouseLook(true); ok(!T.mouseLook.on, 'mouse look is a desktop option: phones and tablets keep drag to look');

  await new Promise(r => setTimeout(r, 300));
  done();
})().catch(e => { console.log('RUNTIME ERROR', e.stack); process.exit(1); });
process.on('uncaughtException', e => { console.log('UNCAUGHT', e.stack); process.exit(1); });
