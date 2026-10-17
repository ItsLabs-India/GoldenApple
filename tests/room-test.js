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
