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
  const solidAt = (x, z) => G.cellTop(x, z) > 0.55;
  const NS = G.SPOTS.filter(s => s.zone !== "plaza"); for (const a of NS) for (const b of NS) {
    if (a === b) continue; const pts = G.routeFromTo(a, b); const all = [{ x: a.x, z: a.z }, ...pts];
    for (let i = 1; i < all.length - 1; i++) { // skip leaving the start spot and arriving into the final spot
      if (i === 1) continue;
      const p = all[i - 1], q = all[i]; const d = Math.hypot(q.x - p.x, q.z - p.z); const n = Math.max(1, Math.ceil(d / 0.1));
      for (let k = 0; k <= n; k++) { const x = p.x + (q.x - p.x) * k / n, z = p.z + (q.z - p.z) * k / n; checked++; if (solidAt(x, z)) { bad++; if (badEx.length < 8) badEx.push(`${a.zone}:${a.pose}(${a.x.toFixed(1)},${a.z.toFixed(1)}) -> ${b.zone}:${b.pose} seg ${i} at (${x.toFixed(2)},${z.toFixed(2)}) top=${G.cellTop(x, z)}`); break; } }
    }
  }
  console.log('  samples checked:', checked, 'blocked segments:', bad); badEx.forEach(s => console.log('   ', s));
  ok(bad === 0, 'no spot-to-spot route crosses a solid cell');
  // seats must have a walkable approach point for the player to stand up onto
  const badApproach = seats.filter(s => s.approach && G.cellTop(s.approach.x, s.approach.z) > 0.55);
  badApproach.slice(0, 5).forEach(s => console.log('   approach blocked', s.zone, s.x, s.z, '->', s.approach.x, s.approach.z, G.cellTop(s.approach.x, s.approach.z)));
  ok(badApproach.length === 0, 'every seat has a free stand-up point');
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
  frames(40, 50); ok(!Pf.held && !Pf.eating, 'and is eaten after 1.6 s');
  Pf.root.position.set(31.5, 0, G.SLOT_Z[3]); G.tryInteract();
  const stool = G.SPOTS.find(x => x.zone === 'pantry' && x.pose === 'sit'); Pf.root.position.set(stool.approach.x, 0, stool.approach.z);
  G.tryInteract(); ok(Pf.seat && Pf.eating && Pf.anim.eat === 'eat', 'walking to a pantry stool and sitting down starts eating');
  frames(40, 50); ok(!Pf.held && Pf.seat, 'you finish eating while seated'); G.tryInteract(); ok(!Pf.seat, 'E stands you up again');
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
  ok(rec.deskSlot === testerSlot && rec.desk.pet === 1 && rec.desk.decor.length === 2, 'desk spot and desk choices are rebuilt from the cookie too');

  await new Promise(r => setTimeout(r, 300));
  done();
})().catch(e => { console.log('RUNTIME ERROR', e.stack); process.exit(1); });
process.on('uncaughtException', e => { console.log('UNCAUGHT', e.stack); process.exit(1); });
