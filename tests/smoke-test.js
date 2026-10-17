// Golden Apple smoke test — runs the real js/app.js against a fake browser and a three.js stub.
// Usage: npm test   (or: node tests/smoke-test.js)
// It checks logic only (login, apples, Golden Apple, routes, cookies). It does not render graphics.
const fs = require('fs');
let src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'app.js'), 'utf8');
// test-only instrumentation: expose internals right before the IIFE closes
src = src.replace(/\}\)\(\);\s*$/, 'window.__ga={state,giveApples,doPoke,openCard,closeCard,openBoard,openInbox,openMenu,SPOTS,routeFromTo,cellTop,topMap,idx,USERS:()=>USERS,WORLD:()=>WORLD,budgetLeft,isGolden,logout,findUser,tryInteract,nearestSeat,renderCard,giveState,zoneAt,getTile};\n})();');

const errors = [];
// ---------- tiny DOM ----------
const listeners = new Map();
function el(tag, id) {
  const e = {
    tagName: (tag || 'div').toUpperCase(), id: id || '', style: {}, dataset: {}, hidden: false, value: '', textContent: '', _html: '',
    children: [], className: '', clientWidth: 1280, clientHeight: 800, width: 0, height: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
    get firstChild() { return this.children[0]; },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } },
    addEventListener(t, fn) { const k = this.id + '|' + t; if (!listeners.has(k)) listeners.set(k, []); listeners.get(k).push(fn); (this._l || (this._l = {}))[t] = (this._l[t] || []).concat(fn); },
    dispatch(t, ev) { (this._l && this._l[t] || []).forEach(fn => fn(Object.assign({ preventDefault() {}, currentTarget: this, target: this }, ev || {}))); },
    setAttribute(k, v) { this['attr_' + k] = v; }, getAttribute(k) { return this['attr_' + k]; },
    querySelector(s) { return getEl(s + '@' + this.id); }, querySelectorAll() { return []; },
    focus() { document.activeElement = this; }, blur() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 800 }; },
    getContext() { return ctx2d; }, toDataURL() { return 'data:image/png;base64,AA'; }
  };
  return e;
}
const ctx2d = new Proxy({}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (typeof k === 'string' && /^(fill|stroke|clear|draw|save|restore|translate|rotate|beginPath|moveTo|lineTo|closePath|fillText|measureText)/.test(k) ? () => ({ width: 10 }) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
const els = new Map();
function getEl(sel) { if (!els.has(sel)) els.set(sel, el('div', sel.replace(/^#/, '').split('@')[0])); return els.get(sel); }
let cookieJar = {};
const document = {
  activeElement: null,
  getElementById: id => getEl('#' + id),
  querySelector: s => getEl(s),
  querySelectorAll: () => [],
  createElement: t => el(t),
  get cookie() { return Object.entries(cookieJar).map(([k, v]) => k + '=' + v).join('; '); },
  set cookie(str) {
    const parts = str.split(';').map(s => s.trim()); const [nv, ...attrs] = parts; const i = nv.indexOf('='); const name = nv.slice(0, i), val = nv.slice(i + 1);
    const exp = attrs.find(a => /^expires=/i.test(a)); if (exp && new Date(exp.slice(8)) < new Date()) { delete cookieJar[name]; return; }
    if (val.length > 4096) throw new Error('cookie too big: ' + name);
    cookieJar[name] = val;
  },
  fonts: { load: () => Promise.resolve() }
};
const store = {};
const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
let rafCb = null;
const win = {
  THREE: null, document, localStorage, devicePixelRatio: 2, location: { protocol: 'https:' },
  matchMedia: () => ({ matches: false }), addEventListener: (t, fn) => { (win._l[t] = win._l[t] || []).push(fn); }, _l: {},
  requestAnimationFrame: cb => { rafCb = cb; }, performance: { now: () => now }, setInterval: () => 0
};
let now = 1000;

// ---------- THREE stub (math-faithful where the app relies on it) ----------
class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); } setScalar(s) { this.x = this.y = this.z = s; return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  project() { this.x = 0; this.y = 0; this.z = 0.5; return this; } }
class Obj { constructor() { this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }; this.scale = new V3(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.matrixWorld = {}; }
  add(...o) { o.forEach(c => { if (!c || typeof c !== 'object') throw new Error('add() bad child'); this.children.push(c); }); return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } lookAt() {} updateMatrixWorld() {} }
class Geo { constructor(...a) { this.args = a; const n = 24; this.attributes = { uv: { count: n, setXY(i, u, v) { if (i < 0 || i >= n) throw new Error('uv index out of range ' + i); if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) throw new Error('uv out of [0,1]: ' + u + ',' + v); }, needsUpdate: false } }; } dispose() {} }
class Mat { constructor(o) { Object.assign(this, o || {}); } dispose() {} }
class Tex { constructor(c) { this.image = c; this.offset = { x: 0, y: 0 }; this.repeat = { set() {} }; } dispose() {} }
class InstancedMesh extends Obj { constructor(g, m, n) { super(); if (!(n > 0)) throw new Error('InstancedMesh count ' + n); this.count = n; this.instanceMatrix = {}; this.instanceColor = null; }
  setMatrixAt(i) { if (i < 0 || i >= this.count) throw new Error('matrix index ' + i); } setColorAt(i, c) { if (i < 0 || i >= this.count) throw new Error('color index ' + i); if (!this.instanceColor) this.instanceColor = {}; } }
const M4 = class { makeTranslation() { return this; } makeScale() { return this; } setPosition() { return this; } compose() { return this; } };
const THREE = {
  Vector3: V3, Vector2: class { set() { return this; } }, Matrix4: M4, Quaternion: class { setFromEuler() { return this; } }, Euler: class { set() { return this; } },
  Color: class { constructor(c) { this.c = c; } set(c) { if (typeof c === 'string' && !/^#[0-9a-f]{6}$/i.test(c)) throw new Error('bad color ' + c); this.c = c; return this; } },
  Group: Obj, Scene: Obj, Mesh: class extends Obj { constructor(g, m) { super(); if (!g || !m) throw new Error('Mesh needs geo+mat'); this.geometry = g; this.material = m; } }, Sprite: Obj, InstancedMesh,
  BoxGeometry: Geo, PlaneGeometry: Geo, RingGeometry: Geo,
  MeshLambertMaterial: Mat, MeshBasicMaterial: Mat, SpriteMaterial: Mat, CanvasTexture: Tex,
  HemisphereLight: Obj, AmbientLight: Obj, DirectionalLight: class extends Obj { constructor() { super(); this.shadow = { mapSize: { set() {} }, camera: {} }; this.target = new Obj(); } },
  PerspectiveCamera: class extends Obj { setViewOffset() {} clearViewOffset() {} updateProjectionMatrix() {} },
  WebGLRenderer: class { constructor() { this.domElement = el('canvas', 'glcanvas'); this.shadowMap = {}; } setPixelRatio() {} getPixelRatio() { return 1; } setSize() {} render() {} },
  Raycaster: class { setFromCamera() {} intersectObjects() { return []; } }, Fog: class {},
  NearestFilter: 1, RepeatWrapping: 2, PCFSoftShadowMap: 3, DoubleSide: 4, AdditiveBlending: 5
};
win.THREE = THREE;
global.window = win; global.document = document; global.localStorage = localStorage; global.THREE = THREE;
global.matchMedia = win.matchMedia; global.requestAnimationFrame = win.requestAnimationFrame; global.addEventListener = win.addEventListener;
global.location = win.location; global.devicePixelRatio = 2; global.btoa = s => Buffer.from(s, 'binary').toString('base64'); global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.escape = escape; global.unescape = unescape;
const realPerf = performance; Object.defineProperty(global, 'performance', { value: { now: () => now } });

function frames(n, dtMs) { for (let i = 0; i < n; i++) { now += dtMs; const cb = rafCb; rafCb = null; if (!cb) throw new Error('loop stopped (no rAF scheduled)'); cb(now); } }
const ok = (cond, msg) => { if (!cond) { errors.push('FAIL: ' + msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };

// a profile saved by the old build, still holding apples and pokes from the removed demo coworkers
const t0 = Date.now();
store.ga_users = JSON.stringify({ 'old@example.com': { email: 'old@example.com', name: 'Old Timer', role: 'Ops', team: 'Ops', status: 'available', avatar: { skin: 0, hairStyle: 0, hair: 0, eyes: 0, top: 0, topColor: 0, pants: 0, shoes: 0, acc: 0 },
  received: 12, goldenAt: t0, createdAt: t0, given: null,
  recent: [{ from: 'Priya Nair', count: 3, reason: 'Helping hand', note: '', at: t0 }, { from: 'Real Person', count: 1, reason: 'Team player', note: '', at: t0 }],
  inbox: [{ type: 'apple', from: 'Priya Nair', fromId: 'npc:priya', count: 3, reason: 'Helping hand', at: t0, read: false }, { type: 'poke', from: 'Kenji Watanabe', fromId: 'npc:kenji', msg: 'Lunch?', at: t0, read: false },
    { type: 'apple', from: 'Real Person', fromId: 'local:real@example.com', count: 1, reason: 'Team player', at: t0, read: true }] } });
store.ga_world = JSON.stringify({ v: 1, npc: { priya: { received: 14 } }, feed: [{ kind: 'golden', to: 'Old Timer', at: t0 }, { kind: 'apple', from: 'Priya Nair', to: 'Old Timer', count: 3, reason: 'Helping hand', at: t0 }, { kind: 'apple', from: 'Arjun Mehta', to: 'Fatima Zahra', count: 1, reason: 'Problem solver', at: t0 }] });

(async () => {
  try {
    eval(src);
  } catch (e) { console.log('BOOT ERROR', e.stack); process.exit(1); }
  const G = window.__ga;
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

  console.log('Routing (every spot-to-spot walk avoids walls and furniture)');
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

  console.log('Login → profile setup → world');
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
  getEl('#pName').value = 'Second'; getEl('#setupForm').dispatch('submit');
  const away = [...G.state.chars.values()].filter(c => c.kind === 'local');
  const tester = away.find(c => c.data.name === 'Test User');
  ok(away.length === 2 && !!tester && G.state.chars.size === 3, 'other profiles on this browser appear as Away, and nobody else');
  G.state.me.given = null; G.giveApples(G.state.player, tester, 2, 'Helping hand', 'Thanks!');
  ok((G.USERS()['tester@example.com'].inbox || []).some(i => i.type === 'apple' && i.count === 2), 'apples to an Away user land in their inbox');
  // cookie-only recovery: wipe localStorage, keep cookies
  for (const k of Object.keys(store)) delete store[k];
  const rec = G.findUser('tester@example.com');
  ok(!!rec && rec.name === 'Test User', 'profile can be rebuilt from its cookie alone');

  await new Promise(r => setTimeout(r, 300));
  console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.log('RUNTIME ERROR', e.stack); process.exit(1); });
process.on('uncaughtException', e => { console.log('UNCAUGHT', e.stack); process.exit(1); });
