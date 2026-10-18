// Golden Apple room test: a host and two guests in one peer-to-peer room, each running the real js/app.js
// in its own fake browser (tests/harness.js), connected through an in-memory PeerJS stand-in.
// Usage: node tests/room-test.js   (npm test runs it after the smoke test)
const H = require('./harness');
const { ok, done } = H.makeChecker();
const net = H.createPeerNet();
const host = H.createClient({ net }), a = H.createClient({ net }), b = H.createClient({ net });
const all = [host, a, b];
const run = (n, dt = 16, who = all) => H.step(who, n, dt, net);
const sleep = ms => new Promise(r => setTimeout(r, ms));
// sign in on the start screen: email, then (for a new profile) the setup form
function signIn(c, email, name) {
  c.getEl('#email').value = email; c.getEl('#loginForm').dispatch('submit'); run(4);
  if (name && c.G.state.mode === 'setup') { c.getEl('#pName').value = name; c.getEl('#setupForm').dispatch('submit'); run(4); }
}

(async () => {
  try { all.forEach(c => c.boot()); } catch (e) { console.log('BOOT ERROR', e.stack); process.exit(1); }
  run(3);

  console.log('Host creates a room');
  host.getEl('#roomName').value = '  Design   Team '; host.getEl('#hostForm').dispatch('submit'); run(3);
  const R = host.G.room, code = R.code;
  ok(R.mode === 'host' && R.status === 'live' && host.G.validCode(code), 'room is live with invite code ' + code);
  ok(R.name === 'Design Team' && host.G.inviteLink() === 'https://golden.test/?room=' + code, 'room name is tidied and the invite link carries the code');
  ok(!net.usedIceServers, 'no STUN/TURN servers are configured, so only devices on the same network can connect');
  ok(!host.getEl('#loginForm').hidden && host.getEl('#roomStep').hidden, 'the host goes on to sign in');
  signIn(host, 'hana@example.com', 'Hana Host');
  const H_ = host.G, hk = H_.myKey();
  ok(H_.state.mode === 'world' && /^p/.test(hk) && H_.USERS()[hk].email === 'hana@example.com', 'host is in the office; profiles are keyed by a private key, not the email');
  ok(JSON.parse(host.store['ga_room_' + code]).users[hk].name === 'Hana Host', 'the room (with everyone’s profiles) is saved in the host’s browser');

  console.log('Guests join with the invite code');
  a.getEl('#roomCode').value = code.slice(0, 3).toLowerCase() + '-' + code.slice(3).toLowerCase(); a.getEl('#joinForm').dispatch('submit'); run(4);
  ok(a.G.room.mode === 'guest' && a.G.room.status === 'live' && a.G.room.name === 'Design Team', 'guest A connects; the code is accepted in lower case with a dash');
  const hostSeenByA = a.G.USERS()[hk];
  ok(hostSeenByA && hostSeenByA.name === 'Hana Host' && !('email' in hostSeenByA) && !('inbox' in hostSeenByA) && !('given' in hostSeenByA), 'guests see names, not emails, inboxes or budgets');
  signIn(a, 'arjun@example.com', 'Arjun A');
  const ak = a.G.myKey(), A = a.G;
  ok(A.state.mode === 'world' && A.state.me.email === 'arjun@example.com' && H_.USERS()[ak] && H_.USERS()[ak].email === 'arjun@example.com', 'guest A creates a profile; the host stores it');
  ok(A.state.me.deskSlot >= 0 && A.state.me.deskSlot !== H_.state.me.deskSlot, 'the host hands guest A their own desk');
  ok(H_.state.chars.get('local:' + ak).kind === 'remote' && A.state.chars.get('local:' + hk).kind === 'remote', 'host and guest see each other as online players');
  ok(!!A.DESK_SLOTS[H_.state.me.deskSlot].desk && !!H_.DESK_SLOTS[A.state.me.deskSlot].desk, 'both desks are built on both screens');

  b.getEl('#roomCode').value = code; b.getEl('#joinForm').dispatch('submit'); run(4);
  signIn(b, 'bea@example.com', 'Bea B');
  const bk = b.G.myKey(), B = b.G;
  ok(B.state.mode === 'world' && A.state.chars.get('local:' + bk) && A.state.chars.get('local:' + bk).kind === 'remote', 'guest B joins and guest A sees them appear');
  ok(H_.room.online.size === 3 && A.room.online.size === 3 && B.room.online.size === 3, 'everyone counts 3 people online');
  ok(new Set([H_.state.me.deskSlot, A.state.me.deskSlot, B.state.me.deskSlot]).size === 3, 'three people, three different desks');

  console.log('Live movement');
  A.state.player.root.position.set(6, 0, 6); run(40);
  const aOnB = B.state.chars.get('local:' + ak).root.position, aOnHost = H_.state.chars.get('local:' + ak).root.position;
  ok(Math.hypot(aOnB.x - 6, aOnB.z - 6) < 0.3 && Math.hypot(aOnHost.x - 6, aOnHost.z - 6) < 0.3, 'guest A walks; the host and guest B see A at the same spot (relayed by the host)');
  const hp = H_.state.player, hs = H_.DESK_SLOTS[H_.state.me.deskSlot].spot;
  hp.root.position.set(hs.approach.x, 0, hs.approach.z); H_.tryInteract(); run(20);
  ok(hp.seat === hs && A.state.chars.get('local:' + hk).spot === A.SPOTS.find(s => s.id === hs.id), 'the host sits at their desk and guests see them seated there');
  H_.tryInteract(); run(20);
  ok(!A.state.chars.get('local:' + hk).spot, 'and see them stand up again');
  B.state.player.hold('apple'); run(20);
  ok(A.state.chars.get('local:' + bk).held === 'apple', 'food in hand shows on other screens');
  B.state.player.dropHeld(); run(10);

  console.log('Apples across the room');
  const r1 = A.giveApples(A.state.player, A.charOfKey(hk), 3, 'Team player', 'Thanks for the review');
  ok(r1 && r1.pending, 'guest A’s gift goes to the host');
  run(10);
  ok(H_.state.me.received === 3 && H_.state.me.inbox[0].type === 'apple' && H_.state.me.inbox[0].from === 'Arjun A', 'the host receives 3 apples with a note in their inbox');
  ok(A.budgetLeft(A.state.me) === 7 && H_.budgetLeft(H_.USERS()[ak]) === 7, 'guest A’s budget is 7/10 on both screens (the host keeps the real count)');
  ok(B.USERS()[hk].received === 3 && B.WORLD().feed[0].from === 'Arjun A', 'guest B sees the host’s new total and the feed entry');
  ok(A.giveApples(A.state.player, A.charOfKey(bk), 8, 'Team player', '') === false, 'guest A can’t give more than they have left');
  A.giveApples(A.state.player, A.charOfKey(bk), 2, 'Helping hand', ''); run(10);
  ok(B.state.me.received === 2 && B.state.me.inbox.some(i => i.type === 'apple' && i.count === 2), 'guest-to-guest apples land in guest B’s inbox');
  ok(!('inbox' in A.USERS()[bk]) && A.USERS()[bk].received === 2, 'guest A sees B’s total but not B’s inbox');
  H_.giveApples(H_.state.player, H_.charOfKey(bk), 10, 'Great mentor', ''); run(10);
  ok(B.state.me.received === 12 && A.charOfKey(bk).golden && B.state.player.golden, 'the host’s 10 apples make guest B a Golden Apple on every screen');
  ok(A.WORLD().feed.some(f => f.kind === 'golden' && f.to === 'Bea B'), 'and the Golden Apple shows in everyone’s feed');

  console.log('Pokes');
  B.doPoke(B.state.player, B.charOfKey(ak), 'Coffee break?'); run(10);
  ok(A.state.me.inbox.some(i => i.type === 'poke' && i.msg === 'Coffee break?' && i.from === 'Bea B'), 'guest B pokes guest A; it lands in A’s inbox');
  ok(H_.USERS()[ak].inbox.some(i => i.type === 'poke'), 'the host keeps the poke in A’s saved inbox');
  A.openInbox(); run(5);
  ok(H_.USERS()[ak].inbox.every(i => i.read), 'opening the inbox marks it read on the host too');

  console.log('Profile and desk changes');
  A.openSetup('edit'); A.state.setup.desk.pet = 2; A.state.setup.desk.plant = 3; a.getEl('#pName').value = 'Arjun Mehta'; a.getEl('#setupForm').dispatch('submit'); run(10);
  const aSlot = A.state.me.deskSlot;
  ok(H_.USERS()[ak].name === 'Arjun Mehta' && H_.USERS()[ak].desk.pet === 2 && B.USERS()[ak].name === 'Arjun Mehta', 'guest A’s new name reaches the host and guest B');
  ok(/\|.*/.test(B.DESK_SLOTS[aSlot].sig) && B.DESK_SLOTS[aSlot].sig.endsWith(B.deskToArr(B.USERS()[ak].desk).join()), 'guest B’s screen rebuilds A’s desk with the dog and cactus');

  console.log('Restroom in a room');
  A.V.bl = 0; B.V.bl = 0;
  const st0 = A.STALLS[0], st1 = B.STALLS[1];
  A.state.player.root.position.set(st0.spot.x, 0, st0.spot.z); A.tryInteract();
  B.state.player.root.position.set(st1.spot.x, 0, st1.spot.z); B.tryInteract(); run(40);
  const aOnHost2 = H_.state.chars.get('local:' + ak), bOnHost2 = H_.state.chars.get('local:' + bk);
  ok(!aOnHost2.root.visible && !bOnHost2.root.visible && H_.STALLS[0].occ === 'local:' + ak && H_.STALLS[1].occ === 'local:' + bk, 'two guests use two stalls at once; the host sees both stalls Occupied and nobody inside');
  ok(B.STALLS[0].occ === 'local:' + ak && /Occupied/.test(H_.STALLS[0].label.innerHTML) && !/Arjun/.test(H_.STALLS[0].label.innerHTML), 'others see only “Occupied”, not who is inside');
  H_.state.player.root.position.set(H_.STALLS[0].spot.x, 0, H_.STALLS[0].spot.z); H_.tryInteract();
  ok(!H_.rr.use, 'the host can’t walk into a stall someone else is using');
  run(220, 16);
  ok(aOnHost2.root.visible && H_.STALLS[0].occ === null && H_.STALLS[1].occ === null, 'when they are done the stalls free up and they reappear');
  H_.tryInteract(); run(40); ok(H_.rr.use && A.STALLS[0].occ === 'local:' + hk, 'now the host can use the same stall, and guests see it Occupied');
  run(220, 16);
  A.state.player.root.position.set(-24.5, 0, -4.4); A.tryInteract(); run(20);
  ok(H_.state.chars.get('local:' + ak).anim.pose === 'wash', 'hand washing shows on other screens');
  run(200, 16);
  console.log('Day and night in a room');
  ok(Math.abs(H_.cyclePhase() - A.cyclePhase()) < 0.001 && Math.abs(A.cyclePhase() - B.cyclePhase()) < 0.001, 'host and guests share the same time of day');
  console.log('Fishing in a room');
  A.state.player.root.position.set(A.FISH_RACK.x + 1.1, 0, A.FISH_RACK.z); A.tryInteract();
  A.state.player.root.position.set(0, 0, 30.4); A.state.player.heading = 0; run(10); A.tryInteract(); run(70); // the cast takes 0.7 s
  const aFisher = H_.state.chars.get('local:' + ak);
  ok(!!aFisher.rodMesh && !!aFisher.lineTo && Math.abs(aFisher.lineTo.z - A.fishing.tz) < 0.5, 'others see you holding a rod, with your line and bobber in the water');
  A.tryInteract(); run(5); const pre = A.fishing.phase; A.state.player.dropRod(); run(10);
  ok(!aFisher.rodMesh && !aFisher.lineTo, 'and see it go when you put it away');
  console.log('Arcade in a room');
  A.state.player.root.position.set(A.ARCADES[2].spot.x, 0, A.ARCADES[2].spot.z); A.tryInteract(); run(20);
  const aGamer = H_.state.chars.get('local:' + ak);
  ok(A.arc.open && A.arc.slot === 1 && aGamer.anim.play && H_.arcadeOccupants(2).p1 === ak && B.arcadeOccupants(2).p1 === ak, 'guest A plays Star Orchard; the host and guest B see who is at the cabinet');
  hp.root.position.set(H_.ARCADES[2].spot.x, 0, H_.ARCADES[2].spot.z); H_.tryInteract(); run(30);
  ok(H_.arc.open && H_.arc.slot === 2 && H_.arc.host === ak && A.arc.p2 === hk && A.arc.st.two && A.arc.st.sh.length === 2, 'the host joins the same cabinet as Player 2 and the game restarts for two');
  ok(H_.arc.st && H_.arc.st.sh && H_.arc.st.sh.length === 2 && Math.abs(H_.arc.st.t - A.arc.st.t) < 0.3, 'Player 2 sees Player 1’s game live');
  const x2 = A.arc.st.sh[1].x; H_.arcKeys.add('arrowright'); run(30); H_.arcKeys.delete('arrowright'); run(5);
  ok(A.arc.st.sh[1].x > x2 + 10, 'Player 2’s buttons move their own ship in Player 1’s game');
  B.state.player.root.position.set(B.ARCADES[2].spot.x + 0.3, 0, B.ARCADES[2].spot.z); B.tryInteract(); run(20);
  ok(!B.arc.open && !B.arc.joining, 'a third person can’t join a full cabinet');
  B.state.player.root.position.set(6, 0, 6);
  H_.exitArcade(); run(20);
  ok(!H_.arc.open && A.arc.open && A.arc.p2 === null && A.arc.st.sh.length === 1, 'when Player 2 leaves, Player 1 keeps playing alone');
  A.exitArcade(); run(20);
  ok(!aGamer.anim.play && H_.arcadeOccupants(2).p1 === null, 'and when A leaves, the cabinet is free again');
  const smA = A.ARCADES.find(X => X.g === 5); A.state.player.root.position.set(smA.spot.x, 0, smA.spot.z); A.tryInteract(); run(20);
  const smH = H_.ARCADES[smA.i], slotSitter = H_.state.chars.get('local:' + ak);
  ok(A.arc.open && slotSitter.anim.pose === 'sit' && slotSitter.anim.play && H_.arcadeOccupants(smA.i).p1 === ak, 'guest A sits at a slot machine; the host sees A on the stool playing');
  hp.root.position.set(smH.spot.x, 0, smH.spot.z + 0.2); H_.tryInteract(); run(5);
  ok(!H_.arc.open && !H_.arc.joining, 'nobody else can take a slot machine that is in use');
  A.arcKeys.add(' '); run(2); A.arcKeys.delete(' '); run(15);
  ok(smH.spinT > 0 && A.arc.st.spins === 1, 'when A pulls the lever, the host sees the reels spin on that machine');
  A.exitArcade(); run(15); ok(slotSitter.anim.pose === 'stand' && !slotSitter.anim.play, 'and sees A get up');
  hp.root.position.set(0, 0, 9.5); A.state.player.root.position.set(6, 0, 6); run(10);
  console.log('Gym and showers in a room');
  const tmB = B.GYM[0]; B.state.player.root.position.set(tmB.ap.x, 0, tmB.ap.z); B.tryInteract(); run(20);
  const bOnHost = H_.state.chars.get('local:' + bk);
  ok(B.gym.use === tmB && bOnHost.anim.gym && bOnHost.anim.gym.k === 'treadmill' && H_.gymWho(H_.GYM[0]) === bOnHost && Math.abs(bOnHost.root.position.y - 0.21) < 0.05, 'guest B jogs on a treadmill; the host sees B on it, running');
  hp.root.position.set(H_.GYM[0].ap.x, 0, H_.GYM[0].ap.z); H_.tryInteract(); run(5);
  ok(!H_.gym.use, 'the host can’t get on a treadmill someone is using');
  B.gymLevel(1); run(20); ok(bOnHost.anim.gym.lvl === 2, 'a speed change shows on other screens');
  B.tryInteract(); run(20); ok(!bOnHost.anim.gym && !H_.gymWho(H_.GYM[0]), 'when B steps off, the treadmill is free again');
  const shA = A.STALLS.find(S => S.kind === 'shower'); A.state.player.root.position.set(shA.at.x, 0, shA.at.z); A.tryInteract(); run(40);
  ok(H_.STALLS[shA.i].occ === 'local:' + ak && !H_.state.chars.get('local:' + ak).root.visible && /Occupied/.test(H_.STALLS[shA.i].label.innerHTML), 'guest A takes a shower: others see it Occupied and nobody inside');
  run(450, 16);
  ok(H_.STALLS[shA.i].occ === null && H_.state.chars.get('local:' + ak).root.visible, 'and see A come out when done');
  hp.root.position.set(0, 0, 9.5); A.state.player.root.position.set(6, 0, 6); B.state.player.root.position.set(6, 0, 6); run(10);
  console.log('Tennis and badminton in a room');
  hp.root.position.set(28, 0, 16); A.state.player.root.position.set(28, 0, 29); B.state.player.root.position.set(34.5, 0, 33.4); run(25);
  ok(/challenge Arjun/.test(host.getEl('#prompt').innerHTML) && /1 player ready/.test(host.getEl('#mNote').textContent), 'the host stands in one half of the tennis court and sees Arjun ready in the other');
  H_.tryInteract(); run(30);
  ok(A.mt.inv && A.mt.inv.from === hk && /accept Hana/.test(a.getEl('#prompt').innerHTML), 'the host challenges Arjun, who is asked to accept');
  A.tryInteract(); run(10);
  ok(H_.mt.on && A.mt.on && H_.mt.side === 0 && A.mt.side === 1 && H_.mt.server === 0 && A.mt.server === 0 && H_.mt.opp === ak && A.mt.opp === hk, 'Arjun accepts: the match is on and the challenger serves');
  ok(B.COURT_FX[0].info && B.COURT_FX[0].info.names.join() === 'Hana,Arjun' && B.state.chars.get('local:' + hk).rkKind === 'tennis', 'Bea, by the stands, sees the match on the scoreboard and the players holding rackets');
  H_.matchSwing(); run(3);
  ok(H_.mt.phase === 'rally' && A.mt.ball && A.mt.ball.seq === 1 && A.mt.ball.to === 1, 'the host serves; the ball flies to Arjun on both screens');
  let swung = false, specSaw = false;
  for (let i = 0; i < 300 && !swung; i++) { run(1); const Bl = A.mt.ball; if (B.COURT_FX[0].ball.visible) specSaw = true;
    if (Bl && Bl.live && Bl.to === 1 && Bl.b === 1 && Bl.pos.y > 0.25 && Bl.pos.y < 1.6) { A.state.player.root.position.set(Bl.pos.x + 0.8, 0, Bl.pos.z); A.matchSwing(); run(2); swung = A.mt.ball.by === 1; } }
  ok(swung && A.mt.ball.to === 0, 'Arjun gets to the ball after its bounce and hits it back');
  run(3); ok(H_.mt.ball && H_.mt.ball.seq === 2 && H_.mt.ball.by === 1, 'the host sees the return');
  run(220);
  const s1 = H_.mt.sc.join(); ok(s1 === A.mt.sc.join() && H_.mt.sc[0] + H_.mt.sc[1] === 1, 'the host misses: the point is called on the host’s side and both screens agree (' + s1 + ')');
  run(20); ok(B.COURT_FX[0].info && B.COURT_FX[0].info.sc.join() === s1 && specSaw, 'Bea watched the ball fly and sees the same score');
  A.quitMatch(); run(25);
  const wk = H_.mt.sc[0] > H_.mt.sc[1] ? hk : ak, wc = wk === hk ? host : a, lc = wk === hk ? a : host, wn = wk === hk ? 'Hana' : 'Arjun';
  ok(!H_.mt.on && !A.mt.on && wc.getEl('#toasts').children.some(t => /You win the tennis match 1–0/.test(t.innerHTML)) && lc.getEl('#toasts').children.some(t => /wins the tennis match/.test(t.innerHTML)), 'Arjun leaves the match: the leader on points wins, and both are told');
  ok(lc.G.state.chars.get('local:' + wk).anim.celebrate > 0 && wc.G.state.player.anim.celebrate > 0, 'the winner celebrates, and the other player sees it');
  ok(b.getEl('#toasts').children.some(t => new RegExp(wn + ' beat').test(t.innerHTML)) && !host.getEl('#toasts').children.some(t => / beat /.test(t.innerHTML)) && !a.getEl('#toasts').children.some(t => / beat /.test(t.innerHTML)), 'the audience is told who won (the players just get their own result)');
  run(260);
  B.state.player.root.position.set(40, 0, 16); A.state.player.root.position.set(41, 0, 17); run(30);
  ok(/No opponent/.test(b.getEl('#prompt').innerHTML) && b.getEl('#mNote').textContent === 'No opponent', 'on the badminton court, someone in your own half isn’t an opponent');
  A.state.player.root.position.set(40, 0, 25); run(30);
  ok(/challenge Arjun to badminton/.test(b.getEl('#prompt').innerHTML), 'once Arjun crosses to the other half, Bea can challenge him');
  hp.root.position.set(0, 0, 9.5); A.state.player.root.position.set(6, 0, 6); B.state.player.root.position.set(6, 0, 6); run(10);
  console.log('Campus bikes in a room');
  const behind = (D, d) => ({ x: D.x - Math.sin(D.h) * d, z: D.z - Math.cos(D.h) * d });
  let qb = behind(H_.DOCKS[0], 1.5); A.state.player.root.position.set(qb.x, 0, qb.z); run(3); A.tryInteract(); run(8);
  ok(H_.bikes()[0].r === ak && B.bikes()[0].r === ak && B.bikes()[0].d === -1 && A.ride.b === 0, 'guest A takes a bike: the host and guest B see its dock empty and A riding it');
  run(10); ok(B.state.chars.get('local:' + ak).anim.ride && host.G.state.chars.get('local:' + ak).anim.ride, 'everyone sees A on the bike, pedalling');
  qb = behind(H_.DOCKS[1], 1.5); B.state.player.root.position.set(qb.x, 0, qb.z); run(3); B.tryInteract(); run(8);
  ok(H_.bikes()[1].r === bk && A.bikes()[1].r === bk && B.ride.b === 1, 'guest B takes the other bike at the same stand');
  ok(H_.bikeDo('take', 0) === false && H_.bikes()[0].r === ak, 'nobody can take a bike someone is riding (the host checks)');
  A.state.player.root.position.set(-6, 0, 9.5); run(3); A.tryInteract(); run(8);
  const lbr = H_.bikes()[0];
  ok(!lbr.r && lbr.d === -1 && Math.abs(lbr.x + 6.25) < 0.05 && !B.bikes()[0].r && B.bikes()[0].d === -1 && A.ride.b === null, 'A gets off on the Meadow Walk: everyone sees the bike left there on its kickstand');
  B.state.player.root.position.set(-10, 0, 9.5); run(10); B.leaveWorld(); run(10);
  const bbr = H_.bikes()[1];
  ok(!bbr.r && bbr.d === -1 && Math.hypot(bbr.x + 10.25, bbr.z - 9.5) < 0.1 && A.bikes()[1].d === -1, 'guest B leaves while riding: the bike stays where B was, for everyone');
  signIn(b, 'bea@example.com'); run(4);
  ok(B.state.mode === 'world' && B.bikes()[1].d === -1 && B.ride.b === null, 'B comes back and sees the bike still there (not riding it)');
  hp.root.position.set(0, 0, 9.5); A.state.player.root.position.set(6, 0, 6); B.state.player.root.position.set(6, 0, 6); run(10);
  console.log('Leaving and coming back');
  A.logout(); run(10);
  ok(B.state.chars.get('local:' + ak).kind === 'local' && B.state.chars.get('local:' + ak).spot === B.DESK_SLOTS[aSlot].spot, 'when guest A logs out, others see them Away at their desk');
  ok(H_.room.online.size === 2, 'the host counts 2 online');
  run(160); // past the 2.5 s poke cooldown from B's last poke
  B.doPoke(B.state.player, B.charOfKey(ak), 'Lunch?'); run(10);
  ok(H_.USERS()[ak].inbox.some(i => i.msg === 'Lunch?' && !i.read), 'a poke to someone Away waits in their inbox on the host');
  signIn(a, 'arjun@example.com');
  ok(A.state.mode === 'world' && A.state.me.name === 'Arjun Mehta' && A.state.me.inbox.some(i => i.msg === 'Lunch?'), 'guest A signs back in with just the email and finds the poke');
  ok(JSON.parse(a.store.ga_joined)[0].code === code && JSON.parse(a.store.ga_joined)[0].email === 'arjun@example.com', 'guest A’s browser remembers the room and email for next time');

  console.log('Host drops out and comes back');
  H_.room.peer.destroy(); run(10, 16, [a, b]);
  ok(A.room.status === 'reconnecting' && B.room.status === 'reconnecting', 'when the host’s tab goes away, guests show “reconnecting”');
  ok(A.state.mode === 'world', 'guests stay in the office while they wait');
  H_.hostRoom(code, 'Design Team', false); run(5);
  ok(H_.room.status === 'live' && H_.room.code === code, 'the host reopens the same room code');
  await sleep(4300); run(10);
  ok(A.room.status === 'live' && B.room.status === 'live', 'guests reconnect on their own');
  ok(H_.room.online.has(ak) && H_.room.online.has(bk), 'and are signed back in without doing anything');
  ok(H_.USERS()[bk].received === 12 && H_.USERS()[ak].name === 'Arjun Mehta', 'nothing was lost: the room data came back from the host’s browser');

  console.log('Wrong codes and other mistakes');
  const c4 = H.createClient({ net }); c4.boot(); run(2, 16, [c4]);
  c4.getEl('#roomCode').value = 'ABC'; c4.getEl('#joinForm').dispatch('submit');
  ok(/6 letters/.test(c4.getEl('#roomErr').textContent) && !c4.G.room.mode, 'a too-short code is rejected before connecting');
  c4.getEl('#roomCode').value = 'ZZZZZZ'; c4.getEl('#joinForm').dispatch('submit'); run(4, 16, [c4]);
  ok(/No room with code ZZZZZZ/.test(c4.getEl('#roomErr').textContent) && !c4.G.room.mode, 'a code with no open room says so');
  const c5 = H.createClient({ net, search: '?room=' + code }); c5.boot(); run(4, 16, [c5]);
  ok(c5.G.room.mode === 'guest' && c5.G.room.status === 'live', 'opening an invite link joins the room straight away');
  c5.getEl('#email').value = 'bea@example.com'; c5.getEl('#loginForm').dispatch('submit'); run(4, 16, [c5, host]);
  ok(c5.G.state.mode === 'world' && c5.G.state.me.name === 'Bea B', 'an existing email signs straight in from a second device');
  c5.G.leaveWorld(); c5.G.leaveRoom(); run(4, 16, [c5, host, a, b]);
  c5.getEl('#soloBtn').dispatch('click');
  ok(!c5.G.room.mode && c5.G.state.solo && !c5.getEl('#loginForm').hidden, 'leaving the room returns to the start screen; this-browser-only still works');

  console.log('Deleting a profile');
  B.openMenu(true); b.getEl('#mDelYes@modalBody').dispatch('click'); run(10);
  ok(!H_.USERS()[bk] && !A.USERS()[bk] && !A.state.chars.get('local:' + bk), 'guest B deletes their profile; it disappears from the host and guest A');
  ok(!H_.DESK_SLOTS.some(S => S.spot.owner === bk) && !A.DESK_SLOTS.some(S => S.spot.owner === bk), 'and B’s desk is freed everywhere');

  done();
})().catch(e => { console.log('RUNTIME ERROR', e.stack); process.exit(1); });
process.on('uncaughtException', e => { console.log('UNCAUGHT', e.stack); process.exit(1); });
