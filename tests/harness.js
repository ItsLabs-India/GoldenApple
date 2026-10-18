// Shared fake browser for the Golden Apple tests.
// createClient() runs the real js/app.js in its own vm context with a tiny DOM, a cookie jar, localStorage,
// a math-faithful three.js stub and a strict Web Audio stub. Several clients can share one clock and one
// fake PeerJS network (createPeerNet), so a host and guests can play in the same room inside one Node process.
const fs = require('fs'), path = require('path'), vm = require('vm');

const clock = { now: 1000 };
// internals exposed to tests, injected right before the app's closing `})();`
const EXPORTS = 'SLOT_STRIPS,SLOT_PAY,SLOT_WILD,slotLines,slotWallet,arcBanner:()=>arcBanner,COURTS,COURT_FX,mt,matchSwing,quitMatch,startMatch,makeShot,newBall,stepBall,inCourt,halfAt,isOver,GYM,GYM_KINDS,GYM_COOLER,gym,gymLevel,gymLabel,nearestGym,gymWho,nearCooler,gymStats,startGym,stopGym,ARCADES,GAMES,arc,arcKeys,toIn,nearestArcade,arcadeOccupants,exitArcade,useArcade,arcStart,state,giveApples,doPoke,openCard,closeCard,openBoard,openInbox,openMenu,SPOTS,routeFromTo,cellTop,topMap,idx,USERS:()=>USERS,WORLD:()=>WORLD,budgetLeft,isGolden,logout,findUser,tryInteract,nearestSeat,renderCard,giveState,zoneAt,getTile,'
  + 'AV,randomAvatar,randomDesk,arrToAvatar,avatarToArr,setTab,pv,DESK_SLOTS,DESK_DEFAULT,DK,DK_KEYS,buildDesk,placeDesk,clearDesk,deskToArr,nearestOtherDesk,openSetup,Sound,sfx,toggleMute,SND,'
  + 'FOODS,FOOD,menu,menuFor,menuBucket,refreshMenu,SLOT_Z,COFFEE_Z,buildFood,brew,nearestCounterItem,counterGroup,'
  + 'room,myKey,kOf,charOfKey,normCode,validCode,hostRoom,joinRoom,leaveRoom,openRoomModal,inviteLink,leaveWorld,'
  + 'V,STALLS,rr,nearestStall,nearestSink,nutrition,vitalSpeed,canRun,saveVitals,loadVitals,ACT,'
  + 'DN,DAY_MS,daylightAt,cyclePhase,LAMPS,LAMP_MAT,AREA_LIGHTS,hemi,stars,sunDisc,moonDisc,nightEv,'
  + 'FISH,FISH_BY,LAKE_FISH,fishing,FISH_RACK,timeBias,biteRate,fishLog,nearRack,castTarget,lakeE';
function appSource() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  if (!/\}\)\(\);\s*$/.test(src)) throw new Error('app.js must end with })();');
  return src.replace(/\}\)\(\);\s*$/, 'window.__ga={' + EXPORTS + '};\n})();');
}

/* ---------- fake PeerJS: an in-memory signalling server plus data connections ---------- */
function createPeerNet() {
  const peers = new Map(), queue = []; let seq = 0;
  const net = { peers, flush() { let n = 0; while (queue.length) { if (++n > 100000) throw new Error('peer queue runaway'); queue.shift()(); } } };
  class Emitter { constructor() { this._h = {}; } on(e, f) { (this._h[e] = this._h[e] || []).push(f); return this; } emit(e, ...a) { (this._h[e] || []).slice().forEach(f => f(...a)); } }
  class Conn extends Emitter {
    constructor(owner, remoteId, opts) { super(); this.owner = owner; this.peer = remoteId; this.open = false; this.other = null; this.serialization = opts && opts.serialization; owner.conns.add(this); }
    send(d) {
      if (!this.open) throw new Error('send() on a closed connection');
      const copy = JSON.parse(JSON.stringify(d)), o = this.other; net.sent = (net.sent || 0) + 1;
      queue.push(() => { if (o.open) o.emit('data', copy); });
    }
    close() { if (!this.open) return; this.open = false; const o = this.other; queue.push(() => { this.emit('close'); if (o.open) { o.open = false; o.emit('close'); } }); }
  }
  class Peer extends Emitter {
    constructor(id, opts) {
      super(); if (id && typeof id === 'object') { opts = id; id = null; }
      this.id = id || 'anon-' + (++seq); this.options = opts; this.destroyed = false; this.disconnected = false; this.conns = new Set();
      if (opts && opts.config && opts.config.iceServers && opts.config.iceServers.length) net.usedIceServers = true;
      if (peers.has(this.id)) { queue.push(() => this.emit('error', { type: 'unavailable-id' })); return; }
      peers.set(this.id, this); queue.push(() => { if (!this.destroyed) this.emit('open', this.id); });
    }
    connect(id, opts) {
      const c = new Conn(this, id, opts);
      queue.push(() => {
        const t = peers.get(id);
        if (!t || t.destroyed) { this.emit('error', { type: 'peer-unavailable' }); return; }
        const r = new Conn(t, this.id, opts); c.other = r; r.other = c; c.open = r.open = true;
        t.emit('connection', r); r.emit('open'); c.emit('open');
      });
      return c;
    }
    reconnect() { this.disconnected = false; }
    destroy() { if (this.destroyed) return; this.destroyed = true; if (peers.get(this.id) === this) peers.delete(this.id); for (const c of this.conns) c.close(); }
  }
  net.Peer = Peer;
  return net;
}

/* ---------- one fake browser ---------- */
function createClient(opts = {}) {
  const els = new Map(), store = {}, cookieJar = {}, win = { _l: {} };
  let rafCb = null, audioNodes = 0;
  function el(tag, id) {
    return {
      tagName: (tag || 'div').toUpperCase(), id: id || '', style: {}, dataset: {}, hidden: false, value: '', textContent: '', _html: '',
      children: [], className: '', clientWidth: 1280, clientHeight: 800, width: 0, height: 0,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      get innerHTML() { return this._html; }, set innerHTML(v) { this._html = String(v); },
      get firstChild() { return this.children[0]; },
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); } },
      addEventListener(t, fn) { (this._l || (this._l = {}))[t] = (this._l[t] || []).concat(fn); },
      dispatch(t, ev) { (this._l && this._l[t] || []).forEach(fn => fn(Object.assign({ preventDefault() {}, currentTarget: this, target: this }, ev || {}))); },
      setAttribute(k, v) { this['attr_' + k] = v; }, getAttribute(k) { return this['attr_' + k]; },
      querySelector(s) { return getEl(s + '@' + this.id); }, querySelectorAll() { return []; },
      focus() { document.activeElement = this; }, blur() {}, select() {}, click() {}, setPointerCapture() {},
      getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 800 }; },
      getContext() { return ctx2d; }, toDataURL() { return 'data:image/png;base64,AA'; }
    };
  }
  const ctx2d = new Proxy({}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (typeof k === 'string' && /^(fill|stroke|clear|draw|save|restore|translate|rotate|setTransform|scale|beginPath|moveTo|lineTo|closePath|fillText|measureText)/.test(k) ? () => ({ width: 10 }) : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  function getEl(sel) { if (!els.has(sel)) els.set(sel, el('div', sel.replace(/^#/, '').split('@')[0])); return els.get(sel); }
  const document = {
    activeElement: null, hidden: false,
    getElementById: id => getEl('#' + id), querySelector: s => getEl(s), querySelectorAll: () => [], createElement: t => el(t),
    get cookie() { return Object.entries(cookieJar).map(([k, v]) => k + '=' + v).join('; '); },
    set cookie(str) {
      const parts = str.split(';').map(s => s.trim()); const [nv, ...attrs] = parts; const i = nv.indexOf('='); const name = nv.slice(0, i), val = nv.slice(i + 1);
      const exp = attrs.find(a => /^expires=/i.test(a)); if (exp && new Date(exp.slice(8)) < new Date()) { delete cookieJar[name]; return; }
      if (val.length > 4096) throw new Error('cookie too big: ' + name);
      cookieJar[name] = val;
    },
    fonts: { load: () => Promise.resolve() }, execCommand: () => true
  };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

  // three.js stub (math-faithful where the app relies on it); throws on bad colours, UVs and instance indexes
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new V3(this.x, this.y, this.z); } setScalar(s) { this.x = this.y = this.z = s; return this; }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    normalize() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    project() { this.x = 0; this.y = 0; this.z = 0.5; return this; } }
  class Obj { constructor() { this.position = new V3(); this.rotation = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } }; this.scale = new V3(1, 1, 1); this.children = []; this.visible = true; this.userData = {}; this.matrixWorld = {}; }
    add(...o) { o.forEach(c => { if (!c || typeof c !== 'object') throw new Error('add() bad child'); this.children.push(c); }); return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } lookAt() {} updateMatrixWorld() {} }
  class Geo { constructor(...a) { this.args = a; const n = 24; this.attributes = { uv: { count: n, setXY(i, u, v) { if (i < 0 || i >= n) throw new Error('uv index out of range ' + i); if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) throw new Error('uv out of [0,1]: ' + u + ',' + v); }, needsUpdate: false } }; } dispose() {} }
  class Mat { constructor(o) { Object.assign(this, o || {}); } dispose() {} }
  class Tex { constructor(c) { this.image = c; this.offset = { x: 0, y: 0 }; this.repeat = { set() {} }; } dispose() {} }
  class InstancedMesh extends Obj { constructor(g, m, n) { super(); if (!(n > 0)) throw new Error('InstancedMesh count ' + n); this.count = n; this.instanceMatrix = {}; this.instanceColor = null; }
    setMatrixAt(i) { if (i < 0 || i >= this.count) throw new Error('matrix index ' + i); } setColorAt(i) { if (i < 0 || i >= this.count) throw new Error('color index ' + i); if (!this.instanceColor) this.instanceColor = {}; } }
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
    PointLight: class extends Obj { constructor(c, i, d, k) { super(); this.intensity = i; this.distance = d; this.decay = k; } },
    NearestFilter: 1, LinearFilter: 6, RepeatWrapping: 2, PCFSoftShadowMap: 3, DoubleSide: 4, AdditiveBlending: 5
  };

  // strict Web Audio stub: throws on anything a real browser would reject
  const finite = (...a) => a.forEach(x => { if (typeof x !== 'number' || !isFinite(x)) throw new Error('audio value not finite: ' + x); });
  class AParam { constructor(v) { this.value = v; }
    setValueAtTime(v, t) { finite(v, t); return this; } linearRampToValueAtTime(v, t) { finite(v, t); return this; }
    exponentialRampToValueAtTime(v, t) { finite(v, t); if (!(v > 0)) throw new Error('exponential ramp to ' + v); return this; }
    setTargetAtTime(v, t, c) { finite(v, t, c); return this; } cancelScheduledValues() { return this; } }
  class ANode { constructor(ctx) { this.ctx = ctx; audioNodes++; } disconnect() {}
    connect(n) { if (!(n instanceof ANode || n instanceof AParam || n === this.ctx.destination)) throw new Error('connect() to a non-node'); return n; } }
  const typed = (cls, ok) => Object.defineProperty(cls.prototype, 'type', { get() { return this._t; }, set(v) { if (!ok.includes(v)) throw new Error('bad type ' + v); this._t = v; } });
  class AOsc extends ANode { constructor(c) { super(c); this.frequency = new AParam(440); this._t = 'sine'; } start(t) { finite(t || 0); } stop(t) { finite(t || 0); } }
  typed(AOsc, ['sine', 'square', 'sawtooth', 'triangle']);
  class AFilter extends ANode { constructor(c) { super(c); this.frequency = new AParam(350); this.Q = new AParam(1); this._t = 'lowpass'; } }
  typed(AFilter, ['lowpass', 'highpass', 'bandpass']);
  class AGain extends ANode { constructor(c) { super(c); this.gain = new AParam(1); } }
  class ADelay extends ANode { constructor(c) { super(c); this.delayTime = new AParam(0); } }
  class ASrc extends ANode { constructor(c) { super(c); this.buffer = null; this.loop = false; } start(t, o, d) { finite(t || 0, o || 0, d || 0); if (!this.buffer) throw new Error('buffer source started without a buffer'); } stop() {} }
  class AudioContext { constructor() { this.state = 'running'; this.sampleRate = 8000; this.destination = {}; } get currentTime() { return clock.now / 1000; }
    createGain() { return new AGain(this); } createOscillator() { return new AOsc(this); } createBiquadFilter() { return new AFilter(this); } createDelay() { return new ADelay(this); }
    createBufferSource() { return new ASrc(this); } createBuffer(ch, len) { const d = new Float32Array(len); return { getChannelData: () => d, length: len }; }
    suspend() { this.state = 'suspended'; return Promise.resolve(); } resume() { this.state = 'running'; return Promise.resolve(); } }

  Object.assign(win, {
    document, localStorage, THREE, AudioContext, Peer: opts.net ? opts.net.Peer : undefined,
    location: { protocol: 'https:', origin: 'https://golden.test', pathname: '/', search: opts.search || '' }, isSecureContext: true,
    devicePixelRatio: 2, matchMedia: () => ({ matches: false }), addEventListener: (t, fn) => { (win._l[t] = win._l[t] || []).push(fn); },
    requestAnimationFrame: cb => { rafCb = cb; }, performance: { now: () => clock.now },
    setTimeout, clearTimeout, setInterval: () => 0, console, URLSearchParams,
    btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'), escape, unescape
  });
  win.window = win;
  const context = vm.createContext(win);
  const client = {
    win, store, cookieJar, getEl, get G() { return win.__ga; }, get audioNodes() { return audioNodes; },
    boot() { vm.runInContext(appSource(), context, { filename: 'app.js' }); return this; },
    // one animation frame for this client only, advancing the shared clock
    frames(n, dtMs) { for (let i = 0; i < n; i++) { clock.now += dtMs; if (opts.net) opts.net.flush(); this.tick(); } },
    tick() { const cb = rafCb; rafCb = null; if (!cb) throw new Error('loop stopped (no rAF scheduled)'); cb(clock.now); },
    key(name, type) { (win._l[type] || []).forEach(fn => fn({ key: name, repeat: false, preventDefault() {} })); },
    tap(name) { this.key(name, 'keydown'); this.key(name, 'keyup'); }
  };
  return client;
}
// advance several clients together: the network is flushed every frame, so messages arrive within a frame or two
function step(clients, n, dtMs, net) { for (let i = 0; i < n; i++) { clock.now += dtMs; if (net) net.flush(); for (const c of clients) c.tick(); if (net) net.flush(); } }
function makeChecker() {
  const errors = [];
  const ok = (cond, msg) => { if (!cond) { errors.push('FAIL: ' + msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };
  const done = () => { console.log(errors.length ? `\n${errors.length} FAILURE(S)` : '\nALL CHECKS PASSED'); process.exit(errors.length ? 1 : 0); };
  return { ok, done, errors };
}
module.exports = { createClient, createPeerNet, step, clock, makeChecker };
