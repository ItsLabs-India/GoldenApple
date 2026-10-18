/* =========================================================================
   Golden Apple — game logic (plain JavaScript, no build step)
   Needs three.js r128 loaded first (see index.html).

   Table of contents (search for the heading text):
     Rules ............................ DAILY_APPLES / GOLDEN_AFTER
     helpers .......................... small utilities
     pixel apple icons ................ 2D pixel-art icons used in the UI
     Storage .......................... cookie (primary) + localStorage mirror
     avatar options ................... skin, hair, clothes, accessories
     desk options ..................... desk/chair colours, computer, plant, pet, decor
     Data model ....................... users, feed
     Three.js core .................... renderer, scene, camera, lights
     textures ......................... procedural block texture atlas
     World layout ..................... zones, paths, lake, furniture, trees
     Day and night .................... 30 min day / 30 min night, sky, sun, moon, stars, lamps
     Pantry food ...................... food counter menu, coffee machine, eating
     personal desks ................... one desk per person: buildDesk, placeDesk, allocDesk
     Avatars .......................... 64x64 skin painter + block figure
     Characters ....................... animation, nameplates, speech
     Walk routes ...................... spot-to-spot paths (layout check)
     Effects .......................... particles, flying apples, rings
     Sound ............................ generated music, ambience and effects per place
     Health, energy and the restroom .. needs, stalls, showers, hand washing
     Fishing .......................... lake fish, rod, cast, bite, reel, keep or release
     Playroom and arcade .............. five cabinets, full-screen games, Player 2 in rooms
     Gym .............................. cardio and strength machines, heart rate, sets, sweat
     Playground ....................... tennis and badminton for two, scoreboards, stands
     Player, camera, input ............ movement, collision, mouse/touch
     Labels ........................... nameplates + speech bubbles
     Minimap
     Recognition logic ................ giveApples, doPoke, Golden Apple
     UI rendering ..................... HUD, card, modals, toasts
     Rooms ............................ peer-to-peer rooms on the same Wi-Fi
     Login, setup, session
     Main loop
   ========================================================================= */
(function(){
'use strict';
if(!window.THREE){document.getElementById('bootErr').hidden=false;return;}

/* =========================================================
   Rules (change these two numbers to retune the economy)
   ========================================================= */
const DAILY_APPLES = 10;   // apples each person can give per day (resets at local midnight)
const GOLDEN_AFTER = 10;   // receiving MORE than this many apples in total makes you a Golden Apple
const isGolden = n => (n||0) > GOLDEN_AFTER;

/* ---------- helpers ---------- */
const $ = (s,el=document)=>el.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
const todayKey=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function timeAgo(t){const s=Math.max(1,Math.round((Date.now()-t)/1000));if(s<60)return 'just now';const m=Math.round(s/60);if(m<60)return m+' min ago';const h=Math.round(m/60);if(h<24)return h+' h ago';return Math.round(h/24)+' d ago';}
function hexToRgb(h){if(h[0]!=='#'){const m=h.match(/\d+/g);return m?m.slice(0,3).map(Number):[0,0,0];}const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];}
function shade(h,a){const c=hexToRgb(h);const f=a<0?0:255,t=Math.abs(a);return 'rgb('+c.map(v=>Math.round(v+(f-v)*t)).join(',')+')';}
function angleLerp(a,b,t){let d=((b-a+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;return a+d*t;}
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse=matchMedia('(pointer: coarse)').matches;
// phones and tablets get the touch controls; phones (short side under 600 px) also start with a compact HUD
const phoneUI=coarse&&typeof screen!=='undefined'&&Math.min(screen.width,screen.height)<600;
if(coarse&&document.documentElement){document.documentElement.classList.add('touch-ui');if(phoneUI)document.documentElement.classList.add('phone-ui');}
const plural=(n,w)=>n+' '+w+(n===1?'':'s');
function isTyping(){const a=document.activeElement;return !!a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT'||a.isContentEditable);}

/* ---------- pixel apple icons ---------- */
const APPLE_MAP=[".....bgg...",".....bggg..","..rrrbrrr..",".rhhrrrrrr.","rhhrrrrrrrd","rhrrrrrrrrd","rrrrrrrrrrd","rrrrrrrrrdd",".rrrrrrrdd.","..rrr.rdd.."];
function pixelIcon(map,pal,s){const h=map.length,w=map[0].length,c=document.createElement('canvas');c.width=w*s;c.height=h*s;const g=c.getContext('2d');for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=map[y][x];if(pal[k]){g.fillStyle=pal[k];g.fillRect(x*s,y*s,s,s);}}return c.toDataURL();}
const ICON_APPLE=pixelIcon(APPLE_MAP,{r:'#e0442e',h:'#ff8f6e',d:'#9e2416',b:'#5b3a1e',g:'#6cbf4c'},5);
const ICON_GOLD=pixelIcon(APPLE_MAP,{r:'#f2b632',h:'#fff0a8',d:'#a86f0c',b:'#5b3a1e',g:'#6cbf4c'},5);
const ICON_EMPTY=pixelIcon(APPLE_MAP,{r:'#45372a',h:'#544233',d:'#36291e',b:'#36291e',g:'#36291e'},5);
const ICON_POKE=pixelIcon(["..cc..",".cccc.","cchccc","cccccc",".cccc.","..cc.."],{c:'#6fb7e8',h:'#d7eefc'},4);
$('#brandIcon').src=ICON_GOLD;$('#ruleApple').src=ICON_APPLE;$('#ruleGold').src=ICON_GOLD;

/* =========================================================
   Storage: cookie (primary reference) + localStorage mirror
   ========================================================= */
const Store=(()=>{const mem={};let ok=false;try{localStorage.setItem('__ga','1');ok=localStorage.getItem('__ga')==='1';localStorage.removeItem('__ga');}catch(e){}
  return{ok,get(k,d){try{if(ok){const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}}catch(e){}return k in mem?mem[k]:d;},
    set(k,v){mem[k]=v;try{if(ok)localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
    del(k){delete mem[k];try{if(ok)localStorage.removeItem(k);}catch(e){}}};})();
const Cookies=(()=>{
  const secure=location.protocol==='https:';
  // Partitioned + SameSite=None + Secure lets the cookie survive inside an embedded (cross-site) frame where browsers allow it.
  const variants=b=>secure?[b+'; SameSite=None; Secure; Partitioned',b+'; SameSite=None; Secure',b+'; SameSite=Lax']:[b+'; SameSite=Lax'];
  function get(name){try{const parts=document.cookie?document.cookie.split('; '):[];for(const p of parts){const i=p.indexOf('=');if(p.slice(0,i)===name)return decodeURIComponent(p.slice(i+1));}}catch(e){}return null;}
  function set(name,val,days){const exp=new Date(Date.now()+(days||180)*864e5).toUTCString();const b=name+'='+encodeURIComponent(val)+'; Expires='+exp+'; Path=/';for(const v of variants(b)){try{document.cookie=v;if(get(name)===val)return true;}catch(e){}}return false;}
  function del(name){const b=name+'=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/';for(const v of variants(b)){try{document.cookie=v;}catch(e){}}}
  const ok=set('ga_probe','1',1);if(ok)del('ga_probe');
  return{ok,get,set,del};
})();
const b64e=s=>btoa(unescape(encodeURIComponent(s)));
const b64d=s=>{try{return decodeURIComponent(escape(atob(s)));}catch(e){return null;}};

/* ---------- avatar options ---------- */
const AV={
  skin:['#ffdbb5','#f1c27d','#e0ac69','#c68642','#a86b3c','#8d5524','#6b3e1f','#4a2a14'],
  hairStyle:['Short','Buzz','Side part','Long','Bun','Curly','Bald'],
  hair:['#1c1410','#3b2416','#6b4226','#a0522d','#d9a441','#9b9b9b','#e86fa3','#2fa5a0'],
  eyes:['#3b2416','#141414','#2f6fc2','#3f8f3f','#8a6a2f'],
  top:['Tee','Hoodie','Shirt & tie','Blazer','Sweater'],
  topColor:['#e0442e','#f2b632','#4f9a33','#2f6fc2','#6d4bb5','#2fa5a0','#ef7f2a','#e8e2d0','#3a3a44','#c9467e'],
  pants:['#2d3d63','#1f1f24','#b89a6a','#6b6b74','#5b3a1e','#55663a'],
  shoes:['#1f1f24','#f4f1ea','#7a4a26','#c23a2b','#2f6fc2'],
  acc:['None','Glasses','Shades','Headphones','Cap','Beanie'],
  gender:['Any','Female','Male']// index 0 (Any) is what older profiles get
};
const AV_KEYS=['skin','hairStyle','hair','eyes','top','topColor','pants','shoes','acc','gender'];// append only: the cookie stores these in order
const AV_LABEL={skin:'Skin',hairStyle:'Hair style',hair:'Hair colour',eyes:'Eyes',top:'Top',topColor:'Top colour',pants:'Trousers',shoes:'Shoes',acc:'Accessory',gender:'Gender'};
const AV_STYLE=new Set(['hairStyle','top','acc']);
const GENDER_ORDER=[1,2,0];// shown as Female, Male, Any
// weights per option for a gender (missing keys stay uniform); Any keeps the old fully random mix
const AV_BIAS={
  1:{hairStyle:[3,0.6,2,6,5,4,0.2],hair:[1,1,1,1,1.2,0.6,0.7,0.4],top:[3,2,0.4,2,3],topColor:[1.2,1,0.8,1,1.3,1.2,1,1,0.7,1.4],acc:[5,2,2,1.2,0.6,1.4]},
  2:{hairStyle:[6,4,4,0.5,0.2,3,1.5],hair:[1.2,1.2,1,1,0.6,0.8,0.1,0.3],top:[3,3,2,2,2],topColor:[1,0.8,1.2,1.3,0.7,1,0.8,1,1.3,0.4],acc:[5,2,2,1,2,1]}
};
const pickW=w=>{let t=w.reduce((a,b)=>a+b,0)*Math.random();for(let i=0;i<w.length;i++){t-=w[i];if(t<0)return i;}return w.length-1;};
function randomAvatar(gender){const g=clamp(gender|0,0,AV.gender.length-1),B=AV_BIAS[g]||{},a={};
  for(const k of AV_KEYS)a[k]=B[k]?pickW(B[k]):Math.floor(Math.random()*AV[k].length);if(!B.acc&&Math.random()<0.45)a.acc=0;a.gender=g;return a;}
const avatarToArr=a=>AV_KEYS.map(k=>a[k]|0);
const arrToAvatar=arr=>{const a={};AV_KEYS.forEach((k,i)=>{a[k]=clamp((arr&&arr[i])|0,0,AV[k].length-1);});return a;};

/* ---------- desk options (append new options; indexes are stored in cookies) ---------- */
const DK={
  desk:['#e2cfa6','#a8793f','#6b4a2b','#f4f1ea','#3a3a44','#9fd8c3','#f2b8c6','#9cc8ec'],
  chairStyle:['Office','Gaming','Stool','Armchair'],
  chair:['#2fa5a0','#e0442e','#f2b632','#6d4bb5','#2f6fc2','#ef7f2a','#3a3a44','#f4f1ea'],
  tech:['Monitor','Two monitors','Laptop','Laptop + monitor'],
  screen:['#7fd3ff','#9ff0c9','#ffd27f','#b9b3ff','#ff9db5','#f4f1ea'],
  plant:['None','Succulent','Fern','Cactus','Flowers','Bonsai'],
  pet:['None','Cat','Dog','Hamster','Bunny','Goldfish','Turtle'],
  decor:['Coffee mug','Desk lamp','Books','Photo frame','Trophy','Headphones','Puzzle cube','Globe']
};
const DK_KEYS=['desk','chairStyle','chair','tech','screen','plant','pet'];// decor is a separate pick-up-to-two list
const DK_LABEL={desk:'Desk colour',chairStyle:'Chair',chair:'Chair colour',tech:'Computer',screen:'Screen',plant:'Plant',pet:'Desk pet',decor:'Decor'};
const DK_STYLE=new Set(['chairStyle','tech','plant','pet']);
const DECOR_MAX=2;
const DESK_DEFAULT={desk:0,chairStyle:0,chair:0,tech:0,screen:0,plant:0,pet:0,decor:[]};
const deskToArr=d=>[...DK_KEYS.map(k=>d[k]|0),(d.decor||[]).reduce((m,i)=>m|(1<<i),0)];
const arrToDesk=arr=>{const d={};DK_KEYS.forEach((k,i)=>{d[k]=clamp((arr&&arr[i])|0,0,DK[k].length-1);});const bits=(arr&&arr[DK_KEYS.length])|0;d.decor=DK.decor.map((_,i)=>i).filter(i=>bits&(1<<i)).slice(0,DECOR_MAX);return d;};
const deskOf=rec=>arrToDesk(deskToArr(Object.assign({},DESK_DEFAULT,rec&&rec.desk)));
function randomDesk(){const d={};for(const k of DK_KEYS)d[k]=Math.floor(Math.random()*DK[k].length);const pool=DK.decor.map((_,i)=>i);d.decor=[];
  for(let n=Math.floor(Math.random()*(DECOR_MAX+1));n>0;n--)d.decor.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);return d;}

/* =========================================================
   Data model
   ========================================================= */
let USERS=Store.get('ga_users',{});
// room state (see the Rooms section). In a room, USERS and WORLD hold the room's data instead of this browser's own.
const room={mode:null,code:null,name:'',status:'off',peer:null,hostConn:null,conns:new Set(),online:new Set(),data:null,email:'',everJoined:false,awaitLogin:false,retry:null,timer:null,sendT:0,keepAlive:0,lastSent:'',waveN:0};
const kOf=u=>u?(u.key||u.email):null;// profiles are keyed by email on this browser, by a private key in a room
function saveUsers(){if(room.mode==='host'){room.data.users=USERS;saveRoomData();}else if(!room.mode)Store.set('ga_users',USERS);}
const profileCookieName=email=>'ga_p_'+hashStr(email).toString(36);
function writeProfileCookie(rec){
  const compact={e:rec.email,n:rec.name,r:rec.role,t:rec.team,s:rec.status,a:avatarToArr(rec.avatar),rc:rec.received||0,c:rec.createdAt,k:deskToArr(deskOf(rec)),ds:rec.deskSlot==null?-1:rec.deskSlot};
  return Cookies.set(profileCookieName(rec.email),b64e(JSON.stringify(compact)),180);
}
function readProfileCookie(email){const v=Cookies.get(profileCookieName(email));if(!v)return null;const j=b64d(v);if(!j)return null;try{const o=JSON.parse(j);return o&&o.e===email?o:null;}catch(e){return null;}}
function recordFromCookie(c){return{email:c.e,name:c.n,role:c.r||'',team:c.t||'',status:c.s||'available',avatar:arrToAvatar(c.a),received:c.rc||0,createdAt:c.c||Date.now(),given:null,recent:[],inbox:[],desk:arrToDesk(c.k),deskSlot:c.ds==null?-1:c.ds};}
function findUser(email){
  if(room.mode){const k=findKeyByEmail(email);return k?USERS[k]:null;}
  if(USERS[email])return USERS[email];
  const c=readProfileCookie(email);
  if(c){const rec=recordFromCookie(c);USERS[email]=rec;saveUsers();return rec;}
  return null;
}
function putUser(rec){USERS[rec.email]=rec;saveUsers();state.cookieOK=writeProfileCookie(rec);}
const budgetLeft=d=>d.given&&d.given.d===todayKey()?Math.max(0,DAILY_APPLES-d.given.n):DAILY_APPLES;
function spendBudget(d,n){const t=todayKey();if(!d.given||d.given.d!==t)d.given={d:t,n:0};d.given.n+=n;}

const REASONS=['Team player','Problem solver','Above & beyond','Helping hand','Creative spark','Customer hero','Great mentor'];
const POKES=['Hey there!','Coffee break?','Stand-up in 5','Lunch?','Nice work today','Got a minute?'];
const STATUS={available:{label:'Available',v:'--st-available'},focus:{label:'Focused',v:'--st-focus'},meeting:{label:'In a meeting',v:'--st-meeting'},break:{label:'On a break',v:'--st-break'},away:{label:'Away',v:'--st-away'}};

// v1 worlds held 9 demo coworkers. v2 holds real people only, so strip the demo apples, pokes and feed items once.
function purgeDemo(){
  const byName=new Map(Object.values(USERS).map(u=>[u.name,u]));
  for(const email in USERS){
    const u=USERS[email],demo=new Set();let minus=0;
    u.inbox=(u.inbox||[]).filter(it=>{if(!String(it.fromId||'').startsWith('npc:'))return true;demo.add(it.from);if(it.type==='apple')minus+=it.count||0;return false;});
    if(!demo.size)continue;
    u.recent=(u.recent||[]).filter(r=>!demo.has(r.from));
    u.received=Math.max(0,(u.received||0)-minus);if(!isGolden(u.received))u.goldenAt=null;
    writeProfileCookie(u);
  }
  saveUsers();
  const old=Store.get('ga_world',null),feed=old&&Array.isArray(old.feed)?old.feed:[];
  return{v:2,feed:feed.filter(f=>byName.has(f.to)&&(!f.from||byName.has(f.from))&&(f.kind!=='golden'||isGolden(byName.get(f.to).received)))};
}
let WORLD=Store.get('ga_world',null);if(!WORLD||WORLD.v!==2)WORLD=purgeDemo();
function saveWorld(){if(room.mode==='host'){room.data.feed=WORLD.feed;saveRoomData();}else if(!room.mode)Store.set('ga_world',WORLD);}
saveWorld();

const state={solo:false,mode:'login',me:null,player:null,chars:new Map(),selected:null,pokeMsg:0,cookieOK:Cookies.ok,modal:null,setup:null,hintHidden:Store.get('ga_hint_hidden',false)};

/* =========================================================
   Three.js core
   ========================================================= */
const stage=$('#stage');
const renderer=new THREE.WebGLRenderer({antialias:!coarse,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,coarse?1.5:1.75));
const SHADOWS=!coarse;
renderer.shadowMap.enabled=SHADOWS;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('tabindex','0');
renderer.domElement.setAttribute('aria-label','Office world');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(55,1,0.1,320);
scene.fog=new THREE.Fog(0xcde8f6,48,118);
// the sky is a vertical gradient we repaint as day turns to night (see Day and night)
const skyCanvas=document.createElement('canvas');skyCanvas.width=2;skyCanvas.height=256;const skyTex=new THREE.CanvasTexture(skyCanvas);scene.background=skyTex;
function drawSky(top,mid,bot){const g=skyCanvas.getContext('2d'),gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,top);gr.addColorStop(0.55,mid);gr.addColorStop(1,bot);g.fillStyle=gr;g.fillRect(0,0,2,256);skyTex.needsUpdate=true;}
drawSky('#69b6ea','#a9d9f3','#d9eff8');
const hemi=new THREE.HemisphereLight(0xe3f3ff,0x5d7c3c,0.72);scene.add(hemi);
const amb=new THREE.AmbientLight(0xffffff,0.16);scene.add(amb);
const sun=new THREE.DirectionalLight(0xfff1d8,0.82);
sun.castShadow=SHADOWS;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:110});sun.shadow.bias=-0.0006;
scene.add(sun);scene.add(sun.target);
const UNIT_BOX=new THREE.BoxGeometry(1,1,1);

/* ---------- textures ---------- */
function canvasTex(c,rep){const t=new THREE.CanvasTexture(c);t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rep[0],rep[1]);}return t;}
const noiseTex=(()=>{const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');const R=mulberry32(3);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const v=Math.round(222+R()*33);g.fillStyle='rgb('+v+','+v+','+v+')';g.fillRect(x,y,1,1);}return canvasTex(c);})();
const waterTex=(()=>{const c=document.createElement('canvas');c.width=c.height=16;const g=c.getContext('2d');const R=mulberry32(5);const p=['#3f8fd9','#3a86cf','#4a99e0','#3580c8','#5aa6e6','#3f8fd9'];for(let y=0;y<16;y++)for(let x=0;x<16;x++){g.fillStyle=p[Math.floor(R()*p.length)];g.fillRect(x,y,1,1);}return canvasTex(c,[18,9]);})();
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,230,140,1)');gr.addColorStop(0.4,'rgba(255,200,60,.45)');gr.addColorStop(1,'rgba(255,190,40,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();

const TILE=16,ATLAS_COLS=8;
const TILE_NAMES=['grassTop','grassSide','dirt','path','plaza','oak','pantry','tile','sand','logSide','logTop','leaves','plaster','brick','plank','hedge','carpet','rubber','court','court2','turf','trail','paver','meadow'];
const ATLAS_W=TILE*ATLAS_COLS,ATLAS_H=TILE*Math.ceil(TILE_NAMES.length/ATLAS_COLS);
const atlasTex=(()=>{
  const c=document.createElement('canvas');c.width=ATLAS_W;c.height=ATLAS_H;const g=c.getContext('2d');const R=mulberry32(7);
  const pk=a=>a[Math.floor(R()*a.length)];
  const fill=(ox,oy,fn)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const col=fn(x,y);if(col){g.fillStyle=col;g.fillRect(ox+x,oy+y,1,1);}}};
  const dirtP=['#8a5a33','#7a4e2c','#94643b','#6e4527','#85572f'];
  const P={
    grassTop:(ox,oy)=>fill(ox,oy,()=>pk(['#5aa83a','#63b443','#4f9a33','#6cbf4c','#58a539','#5fae3e'])),
    grassSide:(ox,oy)=>{fill(ox,oy,()=>pk(dirtP));for(let x=0;x<16;x++){const d=2+(R()<0.6?1:0)+(R()<0.25?1:0);for(let y=0;y<d;y++){g.fillStyle=pk(['#5aa83a','#4f9a33','#63b443']);g.fillRect(ox+x,oy+y,1,1);}}},
    dirt:(ox,oy)=>fill(ox,oy,()=>pk(dirtP)),
    path:(ox,oy)=>{fill(ox,oy,()=>pk(['#66615a','#6b665f','#5f5a53']));for(let row=0;row<4;row++){const off=(row%2)*3;for(let col=-1;col<4;col++){const x0=col*5+off,y0=row*4,base=pk(['#9d978e','#a8a299','#928c83','#b0aaa0']);for(let y=0;y<3;y++)for(let x=0;x<4;x++){const xx=x0+x;if(xx<0||xx>15)continue;g.fillStyle=(y===0||x===0)?shade(base,0.12):(y===2||x===3)?shade(base,-0.12):base;g.fillRect(ox+xx,oy+y0+y,1,1);}}}},
    plaza:(ox,oy)=>{fill(ox,oy,()=>'#77726a');for(let row=0;row<4;row++){const off=row%2?4:0;for(let col=-1;col<3;col++){const x0=col*8+off,y0=row*4,base=pk(['#b8b2a8','#aea89e','#c2bcb2']);for(let y=0;y<3;y++)for(let x=0;x<7;x++){const xx=x0+x;if(xx<0||xx>15)continue;g.fillStyle=y===0?shade(base,0.1):shade(base,(R()-.5)*0.08);g.fillRect(ox+xx,oy+y0+y,1,1);}}}},
    oak:(ox,oy)=>{fill(ox,oy,(x,y)=>y%4===3?'#9a774a':pk(['#caa56e','#c39d66','#d1ad76','#c8a36b']));for(let row=0;row<4;row++){const sx=(row*5+3)%16;for(let y=0;y<3;y++){g.fillStyle='#a8845a';g.fillRect(ox+sx,oy+row*4+y,1,1);}}},
    pantry:(ox,oy)=>fill(ox,oy,(x,y)=>shade(((x>>3)+(y>>3))%2===0?'#ece3cc':'#8bb86e',(R()-.5)*0.06)),
    tile:(ox,oy)=>fill(ox,oy,(x,y)=>(x%8===7||y%8===7)?'#b7c3c9':shade('#eef3f5',(R()-.5)*0.04)),
    sand:(ox,oy)=>fill(ox,oy,()=>pk(['#e3d29a','#dccb92','#e8d8a2','#d6c48a'])),
    logSide:(ox,oy)=>{const cols=[];for(let x=0;x<16;x++)cols.push(pk(['#6b4a2b','#5c3f24','#7a5634']));fill(ox,oy,(x)=>R()<0.15?shade(cols[x],-0.15):cols[x]);},
    logTop:(ox,oy)=>fill(ox,oy,(x,y)=>{const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));return d>6.5?'#5c3f24':(Math.floor(d)%2?'#b98a55':'#a87a46');}),
    leaves:(ox,oy)=>fill(ox,oy,()=>R()<0.12?'#24561c':pk(['#3f8f2f','#4a9c36','#35792a','#5aad42','#2e6a24','#43932f'])),
    plaster:(ox,oy)=>fill(ox,oy,(x,y)=>y===15?'#cfc7b8':shade('#ebe5d8',(R()-.5)*0.05)),
    brick:(ox,oy)=>{fill(ox,oy,()=>'#cfc5b3');for(let row=0;row<4;row++){const off=row%2?4:0;for(let col=-1;col<3;col++){const x0=col*8+off,base=pk(['#b5523b','#a9482f','#bf5d44']);for(let y=0;y<3;y++)for(let x=0;x<7;x++){const xx=x0+x;if(xx<0||xx>15)continue;g.fillStyle=shade(base,(R()-.5)*0.08);g.fillRect(ox+xx,oy+row*4+y,1,1);}}}},
    plank:(ox,oy)=>{fill(ox,oy,(x,y)=>y%4===3?'#7a5328':pk(['#a8793f','#9c6f38','#b0814a']));for(let row=0;row<4;row++){g.fillStyle='#5b3a1e';g.fillRect(ox+((row*7+2)%16),oy+row*4+1,1,1);}},
    hedge:(ox,oy)=>fill(ox,oy,()=>R()<0.1?'#1f4a18':pk(['#2f6f26','#367c2b','#285f20','#3d8631'])),
    carpet:(ox,oy)=>fill(ox,oy,(x,y)=>((x+y)%8===0||(x-y+16)%8===0)?'#c8a24a':pk(['#4a2a5e','#52306a','#462858','#4e2c62'])),
    rubber:(ox,oy)=>fill(ox,oy,()=>R()<0.09?pk(['#5a5f6a','#6a707c']):pk(['#2e3138','#33363e','#2a2d33'])),
    court:(ox,oy)=>fill(ox,oy,()=>pk(['#2f6fa8','#3474b0','#2b68a0','#3170ab'])),
    court2:(ox,oy)=>fill(ox,oy,()=>pk(['#3f9a5a','#43a05f','#3a9254','#41975a'])),
    turf:(ox,oy)=>fill(ox,oy,()=>pk(['#3d6b35','#41723a','#386432','#3f6e37'])),
    // eco campus: decomposed-granite trail, permeable grass pavers, wildflower meadow
    trail:(ox,oy)=>fill(ox,oy,()=>R()<0.08?pk(['#9c8158','#e2c99a']):pk(['#c9a877','#c19f6e','#d1b182','#bb9866'])),
    paver:(ox,oy)=>fill(ox,oy,(x,y)=>(x%8<6&&y%8<6)?shade(x%8===0||y%8===0?'#c9c5bb':'#b3afa5',(R()-.5)*0.06):pk(['#5aa83a','#4f9a33','#63b443'])),
    meadow:(ox,oy)=>fill(ox,oy,()=>R()<0.08?pk(['#f2b632','#f4f1ea','#9c6bd6','#ff8fb3','#e0442e']):pk(['#6aa83a','#73b443','#5f9a33','#7cbf4c','#68a539']))
  };
  TILE_NAMES.forEach((n,i)=>P[n]((i%ATLAS_COLS)*TILE,Math.floor(i/ATLAS_COLS)*TILE));
  return canvasTex(c);
})();
const atlasMat=new THREE.MeshLambertMaterial({map:atlasTex});
function blockGeo(top,side,bottom){
  const g=new THREE.BoxGeometry(1,1,1);const uv=g.attributes.uv;const faces=[side,side,top,bottom,side,side];
  for(let f=0;f<6;f++){const i=TILE_NAMES.indexOf(faces[f]);const tx=i%ATLAS_COLS,ty=Math.floor(i/ATLAS_COLS),e=0.02;
    const u0=(tx*TILE+e)/ATLAS_W,u1=((tx+1)*TILE-e)/ATLAS_W,vt=1-(ty*TILE+e)/ATLAS_H,vb=1-((ty+1)*TILE-e)/ATLAS_H;
    uv.setXY(f*4,u0,vt);uv.setXY(f*4+1,u1,vt);uv.setXY(f*4+2,u0,vb);uv.setXY(f*4+3,u1,vb);}
  uv.needsUpdate=true;return g;
}
const BLOCK_TYPES={
  grass:['grassTop','grassSide','dirt'],path:['path','dirt','dirt'],plaza:['plaza','plaza','plaza'],oak:['oak','dirt','dirt'],
  pantry:['pantry','dirt','dirt'],tile:['tile','dirt','dirt'],sand:['sand','sand','sand'],plank:['plank','plank','plank'],
  log:['logTop','logSide','logTop'],leaves:['leaves','leaves','leaves'],plaster:['plaster','plaster','plaster'],brick:['brick','brick','brick'],hedge:['hedge','hedge','hedge'],carpet:['carpet','dirt','dirt'],rubber:['rubber','dirt','dirt'],court:['court','dirt','dirt'],court2:['court2','dirt','dirt'],turf:['turf','dirt','dirt'],
  trail:['trail','dirt','dirt'],paver:['paver','dirt','dirt'],meadow:['meadow','grassSide','dirt'],soil:['dirt','dirt','dirt']
};

/* =========================================================
   World layout (1 block = 1 m). x = east, z = south.
   ========================================================= */
const N=96,HALF=48;
const tileMap=new Array(N*N).fill('grass');
const topMap=new Float32Array(N*N);
const idx=(cx,cz)=>(cx+HALF)*N+(cz+HALF);
const inGrid=(cx,cz)=>cx>=-HALF&&cx<HALF&&cz>=-HALF&&cz<HALF;
const setTile=(cx,cz,t)=>{if(inGrid(cx,cz))tileMap[idx(cx,cz)]=t;};
const getTile=(cx,cz)=>inGrid(cx,cz)?tileMap[idx(cx,cz)]:'void';
const raiseTop=(cx,cz,t)=>{if(inGrid(cx,cz)){const i=idx(cx,cz);if(t>topMap[i])topMap[i]=t;}};
const setTop=(cx,cz,t)=>{if(inGrid(cx,cz))topMap[idx(cx,cz)]=t;};
function cellTop(x,z){const cx=Math.floor(x),cz=Math.floor(z);return inGrid(cx,cz)?topMap[idx(cx,cz)]:99;}
function solidRect(x0,z0,x1,z1,t){for(let cx=Math.floor(x0);cx<Math.ceil(x1);cx++)for(let cz=Math.floor(z0);cz<Math.ceil(z1);cz++)raiseTop(cx,cz,t);}
const lakeE=(x,z)=>(x/17)*(x/17)+((z-31)/8.5)*((z-31)/8.5);

const ZONES={
  desks:{name:'Work Desks',x0:-14,x1:13,z0:-38,z1:-17,floor:'oak',wall:'plaster',glass:true,door:{side:'s',from:-2,to:1},inside:{x:0,z:-19.5},gate:{x:0,z:-15},spoke:0},
  pantry:{name:'Pantry',x0:18,x1:33,z0:-8,z1:7,floor:'pantry',wall:'brick',glass:true,door:{side:'w',from:-2,to:1},inside:{x:20.5,z:0.5},gate:{x:16.5,z:0.5},spoke:2},
  restroom:{name:'Restroom',x0:-31,x1:-20,z0:-7,z1:6,floor:'tile',wall:'plaster',glass:false,door:{side:'e',from:-2,to:1},inside:{x:-21.8,z:0},gate:{x:-17.5,z:0},spoke:6},
  lake:{name:'Lakeside',inside:{x:0,z:19.6},gate:{x:0,z:15.5},spoke:4},
  // open-air and fenced (built in buildFurniture, not by the walled-zone loop); the path runs east off the lake path
  play:{name:'Playground',x0:22,x1:44,z0:8,z1:37,inside:{x:23.5,z:9.5},gate:{x:0,z:9.5},spoke:4},
  // reached by the path that turns north off the Pantry path (walk = extra corner points between gate and door)
  playroom:{name:'Playroom',x0:16,x1:31,z0:-31,z1:-14,floor:'carpet',wall:'brick',glass:false,door:{side:'w',from:-23,to:-20},inside:{x:17.8,z:-21},gate:{x:15,z:0.5},walk:[{x:15,z:-21}],spoke:2},
  // the Playroom's mirror image: north off the Restroom path
  gym:{name:'Gym',x0:-32,x1:-17,z0:-31,z1:-14,floor:'rubber',wall:'plaster',glass:true,door:{side:'e',from:-23,to:-20},inside:{x:-18.8,z:-21},gate:{x:-15,z:0.5},walk:[{x:-15,z:-21}],spoke:6}
};
const RING=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;RING.push({x:Math.sin(a)*3.4,z:-Math.cos(a)*3.4});}
// eco campus areas outside the buildings (decoration and HUD names only; see the Eco campus block in buildFurniture)
const ECO_AREAS=[{name:'Kitchen Garden',x0:-39,x1:-18,z0:-41,z1:-32},{name:'Solar Grove',x0:17,x1:39,z0:-41,z1:-32},{name:'Wind Row',x0:33,x1:40,z0:-31,z1:-10},
  {name:'Mobility Hub',x0:34,x1:45,z0:-10,z1:7},{name:'Heritage Orchard',x0:-39,x1:-22,z0:11,z1:40},{name:'Wildflower Meadow',x0:-39,x1:-32,z0:-31,z1:8}];
function ringPath(a,b){const out=[];let d=((b-a)%8+8)%8;const step=d<=4?1:-1;if(d>4)d=8-d;for(let k=0;k<=d;k++)out.push(RING[((a+step*k)%8+8)%8]);return out;}

const BLOCKS={};for(const k in BLOCK_TYPES)BLOCKS[k]=[];
const addBlock=(type,x,y,z)=>BLOCKS[type].push(x,y,z);
const FURN={noise:[],glow:[],glass:[]};
const fbox=(x,y,z,sx,sy,sz,color,mat,rot)=>FURN[mat||'noise'].push([x,y,z,sx,sy,sz,color,rot||0]);
const SPOTS=[];
let spotSeq=0;
function addSpot(o){o.id='s'+(spotSeq++);o.occ=null;SPOTS.push(o);return o;}
const PICK_TARGETS=[];
const WR=mulberry32(20261017);
const wpick=a=>a[Math.floor(WR()*a.length)];

function buildLayout(){
  // plaza
  for(let cx=-8;cx<8;cx++)for(let cz=-8;cz<8;cz++){if((cx+0.5)**2+(cz+0.5)**2<=6.6*6.6)setTile(cx,cz,'plaza');}
  // paths
  const rect=(x0,x1,z0,z1,t)=>{for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++)if(getTile(cx,cz)==='grass')setTile(cx,cz,t);};
  rect(-2,1,-16,-5,'path');rect(5,17,-2,1,'path');rect(-19,-6,-2,1,'path');rect(-2,1,5,21,'path');rect(14,15,-23,-3,'path');rect(-16,-15,-23,-3,'path');rect(2,43,9,10,'path');
  // court surfaces: blue tennis court and green badminton court, each on a dark green surround
  for(let cx=23;cx<=32;cx++)for(let cz=11;cz<=33;cz++)setTile(cx,cz,cx>=24&&cx<=31&&cz>=13&&cz<=31?'court':'turf');
  for(let cx=36;cx<=44;cx++)for(let cz=11;cz<=32;cz++)setTile(cx,cz,cx>=37&&cx<=42&&cz>=14&&cz<=26?'court2':'turf');
  // zones
  for(const key of ['desks','pantry','restroom','playroom','gym']){const Z=ZONES[key];
    for(let cx=Z.x0;cx<=Z.x1;cx++)for(let cz=Z.z0;cz<=Z.z1;cz++){
      setTile(cx,cz,Z.floor);
      const edge=cx===Z.x0||cx===Z.x1||cz===Z.z0||cz===Z.z1;if(!edge)continue;
      const d=Z.door;const isDoor=(d.side==='s'&&cz===Z.z1&&cx>=d.from&&cx<=d.to)||(d.side==='w'&&cx===Z.x0&&cz>=d.from&&cz<=d.to)||(d.side==='e'&&cx===Z.x1&&cz>=d.from&&cz<=d.to);
      if(isDoor)continue;
      addBlock(Z.wall,cx+0.5,0.5,cz+0.5);
      if(Z.glass)fbox(cx+0.5,1.5,cz+0.5,1,1,1,'#cfeeff','glass');else addBlock(Z.wall,cx+0.5,1.5,cz+0.5);
      setTop(cx,cz,2);
      fbox(cx+0.5,2.04,cz+0.5,1.02,0.08,1.02,(cx+cz)%2?'#5aa83a':'#4f9a33');if((cx*7+cz*3)%5===0)fbox(cx+0.5,2.2,cz+0.5,0.56,0.26,0.56,(cx+cz)%3?'#3f8f2f':'#6cbf4c');// green roof edge
    }}
  // lake
  for(let cx=-24;cx<24;cx++)for(let cz=18;cz<44;cz++){const e=lakeE(cx+0.5,cz+0.5);if(e<=1){setTile(cx,cz,'water');setTop(cx,cz,-1);}else if(e<=1.32&&getTile(cx,cz)!=='path')setTile(cx,cz,'sand');}
  for(let cx=-1;cx<=0;cx++)for(let cz=21;cz<=31;cz++){setTile(cx,cz,'dock');setTop(cx,cz,0);}
  // eco campus: the Green Loop trail round the grounds (north, west, south arms and the east arm down to the Mobility Hub), a trail round the lake,
  // spurs from the Gym and Playroom paths up to the loop, the Meadow Walk west of the spawn and the orchard lane
  for(let cx=-24;cx<24;cx++)for(let cz=18;cz<44;cz++){const e=lakeE(cx+0.5,cz+0.5);if(e>1.32&&e<=1.6)rect(cx,cx,cz,cz,'trail');}
  rect(-41,41,-43,-42,'trail');rect(-41,-40,-43,42,'trail');rect(-41,41,41,42,'trail');rect(40,41,-43,6,'trail');
  rect(14,15,-41,-24,'path');rect(-16,-15,-41,-24,'path');rect(-39,-3,9,10,'path');rect(-31,-29,11,40,'trail');
  rect(17,38,-41,-33,'meadow');rect(-39,-33,-31,8,'meadow');rect(-39,-22,11,40,'meadow');rect(-44,44,43,44,'meadow');rect(-44,-42,-44,44,'meadow');
  rect(-33,-19,-40,-34,'paver');rect(34,44,-9,6,'paver');
  // border hedge
  for(let cx=-HALF;cx<HALF;cx++)for(let cz=-HALF;cz<HALF;cz++){if(cx<=-46||cx>=45||cz<=-46||cz>=45){setTile(cx,cz,'hedge');setTop(cx,cz,3);}}
  // ground blocks
  for(let cx=-HALF;cx<HALF;cx++)for(let cz=-HALF;cz<HALF;cz++){
    const t=getTile(cx,cz),x=cx+0.5,z=cz+0.5;
    if(t==='water'){addBlock('sand',x,-1.5,z);continue;}
    if(t==='dock'){addBlock('plank',x,-0.5,z);addBlock('sand',x,-1.5,z);continue;}
    if(t==='hedge'){addBlock('grass',x,-0.5,z);addBlock('hedge',x,0.5,z);addBlock('hedge',x,1.5,z);continue;}
    addBlock(t,x,-0.5,z);
  }
}

function tree(cx,cz,h,big){
  // small trees are centred on a cell; the big plaza tree is centred on a grid corner (2x2 trunk)
  const leaves=[];
  if(big){for(let dx=-1;dx<=0;dx++)for(let dz=-1;dz<=0;dz++){for(let y=0;y<h;y++)addBlock('log',cx+dx+0.5,y+0.5,cz+dz+0.5);setTop(cx+dx,cz+dz,99);}}
  else{for(let y=0;y<h;y++)addBlock('log',cx+0.5,y+0.5,cz+0.5);setTop(cx,cz,99);}
  const layers=big?[[h-1,3],[h,3],[h+1,2],[h+2,1]]:[[h-1,2],[h,2],[h+1,1],[h+2,1]];
  for(const [ly,r] of layers){
    const lo=big?-r-1:-r,R=big?r+0.5:r;
    for(let dx=lo;dx<=r;dx++)for(let dz=lo;dz<=r;dz++){
      const ox=big?dx+0.5:dx,oz=big?dz+0.5:dz,ax=Math.abs(ox),az=Math.abs(oz);
      if(big){if(ax+az>(r>=3?5.5:2*R-0.5))continue;}
      else{const corner=ax===R&&az===R;if(corner&&(r>=2||WR()<0.5))continue;}
      const inTrunk=ly<h&&(big?(dx>=-1&&dx<=0&&dz>=-1&&dz<=0):(dx===0&&dz===0));
      if(inTrunk)continue;
      const bx=cx+dx+0.5,bz=cz+dz+0.5;
      addBlock('leaves',bx,ly+0.5,bz);
      leaves.push([bx,ly+0.5,bz,(ax===R||az===R)&&r>=2]);
    }}
  return leaves;
}

function bench(cx,cz,rot,color,zone){
  const ux=Math.cos(rot),uz=-Math.sin(rot),fx=Math.sin(rot),fz=Math.cos(rot);
  fbox(cx,0.42,cz,1.9,0.1,0.55,color,'noise',rot);
  fbox(cx-fx*0.3,0.78,cz-fz*0.3,1.9,0.42,0.08,color,'noise',rot);
  for(const s of [-0.8,0.8])fbox(cx+ux*s,0.2,cz+uz*s,0.1,0.4,0.48,'#4a3a2c','noise',rot);
  for(const s of [-0.9,-0.3,0.3,0.9])raiseTop(Math.floor(cx+ux*s),Math.floor(cz+uz*s),0.9);
  const out=[];
  for(const s of [-0.5,0.5]){const x=cx+ux*s,z=cz+uz*s;out.push(addSpot({zone,x,z,y:0.47,face:rot,pose:'sit',approach:{x:x+fx*0.95,z:z+fz*0.95},via:[]}));}
  return out;
}
function plant(x,z,s){s=s||1;fbox(x,0.22*s,z,0.42*s,0.44*s,0.42*s,'#b5683e');fbox(x,0.62*s,z,0.6*s,0.5*s,0.6*s,'#3f8f2f');fbox(x,0.98*s,z,0.36*s,0.3*s,0.36*s,'#4fa33a');solidRect(x-0.3,z-0.3,x+0.3,z+0.3,1);}

// one type system for every canvas (signs, boards, screens, the arcade), matching the CSS: FONT_UI (Atkinson Hyperlegible) for
// all text, FONT_PIX (Pixelify Sans) only for big numbers and the in-game titles (its C reads as an O when small). Canvases with text draw at S x resolution (logical w x h) so text stays sharp.
const FONT_UI='"Atkinson Hyperlegible",system-ui,"Segoe UI",Roboto,sans-serif',FONT_PIX='"Pixelify Sans","Courier New",monospace';
function textCanvas(w,h,draw,S){S=S||1;const c=document.createElement('canvas');c.width=w*S;c.height=h*S;const g=c.getContext('2d');if(S!==1)g.setTransform(S,0,0,S,0,0);draw(g,w,h);return c;}
function textTex(c){const t=new THREE.CanvasTexture(c);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearFilter;t.generateMipmaps=false;return t;}// smooth text, no pixel blocks
const SIGN_DRAWERS=[];
function leafIcon(g,x,y,r){g.save();g.translate(x,y);g.rotate(-0.6);g.fillStyle='#8fd16a';g.beginPath();g.moveTo(0,-r);g.lineTo(r*0.45,-r*0.55);g.lineTo(r*0.55,0);g.lineTo(r*0.4,r*0.55);g.lineTo(0,r);g.lineTo(-r*0.4,r*0.55);g.lineTo(-r*0.55,0);g.lineTo(-r*0.45,-r*0.55);g.closePath();g.fill();g.strokeStyle='#2c5a24';g.lineWidth=Math.max(1,r*0.12);g.beginPath();g.moveTo(0,-r*0.85);g.lineTo(0,r*1.25);g.stroke();g.restore();}
function sign(x,z,rot,title,sub){
  const fx=Math.sin(rot),fz=Math.cos(rot);
  fbox(x-fx*0.08,0.85,z-fz*0.08,0.14,1.7,0.14,'#6b4a2b');
  fbox(x,1.62,z,2.0,0.74,0.1,'#5b3a1e','noise',rot);fbox(x,2.03,z,2.08,0.08,0.22,'#4f9a33','noise',rot);
  solidRect(x-0.3,z-0.3,x+0.3,z+0.3,2);
  const c=textCanvas(256,96,()=>{},2);const tex=textTex(c);
  const draw=()=>{const g=c.getContext('2d');g.fillStyle='#f3ead2';g.fillRect(0,0,256,96);g.fillStyle='#3f7d34';g.fillRect(0,0,256,54);g.fillStyle='#8fd16a';g.fillRect(0,54,256,3);
    leafIcon(g,22,27,13);g.fillStyle='#ffffff';g.textAlign='center';g.font='700 30px '+FONT_UI;g.fillText(title.toUpperCase(),136,38);
    g.font='700 20px '+FONT_UI;g.fillStyle='#3a2a1a';g.fillText(sub,128,82);tex.needsUpdate=true;};
  draw();SIGN_DRAWERS.push(draw);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1.9,0.66),new THREE.MeshBasicMaterial({map:tex}));
  m.position.set(x+fx*0.056,1.62,z+fz*0.056);m.rotation.y=rot;scene.add(m);
}

/* ---------- personal desks: one per person, built from their desk options ---------- */
/* lamps: a static post or bracket (fbox), plus a bulb, a glow and a pool of light on the ground that come on at night */
const LAMPS=[];// {kind,zone,x,z,bulb,halo,haloMat,pool,poolMat,on,fade,at,cool}
const LAMP_MAT={off:new THREE.MeshLambertMaterial({color:0xd9d4c4}),on:new THREE.MeshBasicMaterial({color:0xffe6a8}),cool:new THREE.MeshBasicMaterial({color:0xeaf6ff})};
const POOL_GEO=new THREE.PlaneGeometry(2,2),LR=mulberry32(77);// own RNG so the seeded world layout doesn't shift
const poolTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,226,170,0.9)');gr.addColorStop(0.5,'rgba(255,214,150,0.35)');gr.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
// kinds: street (outdoor post), floor (indoor floor lamp), wall (sconce; o.px/o.pz put its pool into the room), lantern (dock post), bollard (solar trail light)
function addLamp(kind,x,z,o){
  o=o||{};const y={street:2.8,floor:1.95,wall:1.9,lantern:0.42,bollard:0.86}[kind],cool=!!o.cool;
  if(kind==='street'){fbox(x,0.06,z,0.34,0.12,0.34,'#2c2c30');fbox(x,1.4,z,0.14,2.8,0.14,'#2c2c30');fbox(x,2.92,z,0.46,0.12,0.46,'#3a3a44');solidRect(x-0.2,z-0.2,x+0.2,z+0.2,3);}
  else if(kind==='floor'){fbox(x,0.03,z,0.36,0.06,0.36,'#3a3a44');fbox(x,0.9,z,0.06,1.75,0.06,'#3a3a44');solidRect(x-0.2,z-0.2,x+0.2,z+0.2,2);}
  else if(kind==='wall')fbox(x,y+0.13,z,0.22,0.06,0.22,'#9aa3aa');
  else if(kind==='bollard'){fbox(x,0.38,z,0.2,0.76,0.2,'#5b3a1e');fbox(x,0.97,z,0.3,0.04,0.3,'#1d3557');fbox(x,0.995,z,0.26,0.012,0.26,'#3f6fa8','glow');solidRect(x-0.15,z-0.15,x+0.15,z+0.15,1.1);}
  const bulb=new THREE.Mesh(UNIT_BOX,LAMP_MAT.off);bulb.position.set(x,kind==='street'?y-0.02:y,z);
  bulb.scale.set(...({street:[0.32,0.07,0.32],floor:[0.42,0.3,0.42],wall:[0.18,0.14,0.18],lantern:[0.16,0.18,0.16],bollard:[0.16,0.16,0.16]}[kind]));scene.add(bulb);
  const haloMat=new THREE.SpriteMaterial({map:glowTex,color:cool?0xeaf6ff:0xffd890,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const halo=new THREE.Sprite(haloMat);halo.scale.setScalar({street:2.2,floor:1.6,wall:1.2,lantern:1.1,bollard:1.0}[kind]);halo.position.set(x,y-0.05,z);halo.visible=false;scene.add(halo);
  const poolMat=new THREE.MeshBasicMaterial({map:poolTex,color:cool?0xdcecff:0xffffff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const pool=new THREE.Mesh(POOL_GEO,poolMat);pool.rotation.x=-Math.PI/2;pool.scale.setScalar({street:3.6,floor:2.6,wall:2.2,lantern:1.8,bollard:2.2}[kind]);
  pool.position.set(o.px!=null?o.px:x,kind==='lantern'?-0.15:0.035,o.pz!=null?o.pz:z);pool.visible=false;pool.renderOrder=3;scene.add(pool);
  LAMPS.push({kind,zone:o.zone||'path',x,z,bulb,halo,haloMat,pool,poolMat,on:false,fade:0,at:LR()*0.08,cool});
}
let arcBanner=null;// the turning ARCADE crown over the cabinet circle
const ECO_SPIN=[];// wind turbine rotors (Eco campus), turned in frame()
const ARCADES=[];// playroom cabinets, filled by buildFurniture: {i,x,z,spot,canvas,tex,screen}
// the two courts (lines x0..x1, z0..z1, net across z=net at height netH; area = where each half's player may stand)
const COURTS=[{i:0,sport:'tennis',cx:28,x0:24,x1:32,z0:13.5,z1:31.5,net:22.5,netH:0.95,area:{x0:23,x1:33,z0:11,z1:32.6},bx:22.62,brot:Math.PI/2,board:null},
  {i:1,sport:'badminton',cx:40,x0:37,x1:43,z0:14,z1:27,net:20.5,netH:1.55,area:{x0:36,x1:45,z0:11,z1:30.5},bx:44.88,brot:-Math.PI/2,board:null}];
const GYM=[],GYM_COOLER={x:-18.6,z:-15.5};// gym machines, filled by buildFurniture: {i,kind,spot,ap,face,y,sit,rig}
const STALLS=[];// restroom stalls, filled by buildFurniture: {i,zc,spot,pivot,sign,occ,ang,swing,label}
const STALL_MAT={door:new THREE.MeshLambertMaterial({color:0x6d93a8,map:noiseTex}),knob:new THREE.MeshLambertMaterial({color:0xd9e2e6}),free:new THREE.MeshBasicMaterial({color:0x6cbf4c}),occ:new THREE.MeshBasicMaterial({color:0xe0442e}),glass:new THREE.MeshLambertMaterial({color:0xcfeeff,transparent:true,opacity:0.45,depthWrite:false})};
const DESK_SLOTS=[],DESK_ORDER=[];// filled by buildFurniture; DESK_ORDER hands out the slots nearest the door first
const DMAT=new Map();
function dmat(c,kind){const k=(kind||'l')+c;if(!DMAT.has(k))DMAT.set(k,kind==='g'?new THREE.MeshBasicMaterial({color:c}):kind==='t'?new THREE.MeshLambertMaterial({color:c,transparent:true,opacity:0.35,depthWrite:false}):new THREE.MeshLambertMaterial({color:c,map:noiseTex}));return DMAT.get(k);}
function db(g,x,y,z,sx,sy,sz,c,kind,ry){const m=new THREE.Mesh(UNIT_BOX,dmat(c,kind));m.position.set(x,y,z);m.scale.set(sx,sy,sz);if(ry)m.rotation.y=ry;m.receiveShadow=kind!=='t';g.add(m);return m;}
const grp=(parent,x,y,z,ry)=>{const o=new THREE.Group();o.position.set(x,y,z);if(ry)o.rotation.y=ry;parent.add(o);return o;};
// desk-local frame: centred on the desk top, the person sits on the +z side facing -z
function buildDesk(cfg){
  const d=deskOf({desk:cfg}),g=new THREE.Group(),anim=[],T=0.795,scr=DK.screen[d.screen],dark='#18110b',metal='#2c2c30';
  db(g,0,0.76,0,1.94,0.07,0.96,DK.desk[d.desk]).castShadow=SHADOWS;
  db(g,-0.93,0.37,0,0.06,0.74,0.9,'#8c8a86');db(g,0.93,0.37,0,0.06,0.74,0.9,'#8c8a86');
  const monitor=(x,z,w,ry)=>{const m=grp(g,x,0,z,ry);db(m,0,T+0.01,0,0.24,0.02,0.16,'#3a3b40');db(m,0,0.9,-0.01,0.06,0.18,0.05,'#3a3b40');db(m,0,1.08,0,w,0.44,0.05,'#232429');db(m,0,1.08,0.03,w-0.08,0.36,0.012,scr,'g');};
  const laptop=(x,z)=>{db(g,x,T+0.012,z,0.5,0.025,0.34,'#b8bcc4');db(g,x,T+0.026,z+0.06,0.4,0.004,0.14,'#55555c');
    const lid=grp(g,x,T+0.02,z-0.17);lid.rotation.x=-0.28;db(lid,0,0.16,0,0.5,0.32,0.02,'#b8bcc4');db(lid,0,0.16,0.012,0.44,0.26,0.006,scr,'g');};
  const keyboard=()=>{db(g,0,T+0.01,0.2,0.46,0.02,0.15,'#3a3b40');db(g,0.34,T+0.012,0.22,0.06,0.025,0.09,'#3a3b40');};
  if(d.tech===1){monitor(-0.33,-0.2,0.6,0.2);monitor(0.33,-0.2,0.6,-0.2);keyboard();}
  else if(d.tech===2)laptop(0,0.05);
  else if(d.tech===3){monitor(0,-0.26,0.64);laptop(0,0.14);}
  else{monitor(0,-0.22,0.72);keyboard();}
  /* plant, back left */
  const P=grp(g,-0.78,T,-0.25),pot=(c,w,h)=>db(P,0,h/2,0,w,h,w,c);
  if(d.plant===1){pot('#c88a4a',0.16,0.1);db(P,0,0.12,0,0.14,0.05,0.14,'#7fc29b');db(P,0,0.16,0,0.08,0.04,0.08,'#9fd8b5',null,0.78);}
  else if(d.plant===2){pot('#b5683e',0.18,0.14);db(P,0,0.24,0,0.34,0.12,0.12,'#3f8f2f',null,0.4);db(P,0,0.26,0,0.12,0.15,0.34,'#4fa33a',null,0.4);db(P,0,0.33,0,0.16,0.1,0.16,'#5aad42');}
  else if(d.plant===3){pot('#c88a4a',0.16,0.1);db(P,0,0.25,0,0.09,0.3,0.09,'#4f9a33');db(P,0.07,0.22,0,0.06,0.04,0.05,'#4f9a33');db(P,0.09,0.27,0,0.04,0.1,0.04,'#4f9a33');db(P,0,0.41,0,0.05,0.03,0.05,'#e86fa3');}
  else if(d.plant===4){pot('#2f6fc2',0.12,0.16);db(P,0,0.22,0,0.02,0.14,0.02,'#3f8f2f');db(P,0.04,0.2,0,0.02,0.1,0.02,'#3f8f2f',null,0.3);
    db(P,0,0.3,0,0.07,0.06,0.07,'#e0442e');db(P,0.05,0.26,0.02,0.06,0.05,0.06,'#f2b632');db(P,-0.05,0.25,-0.01,0.06,0.05,0.06,'#c9467e');}
  else if(d.plant===5){db(P,0,0.02,0,0.26,0.04,0.18,'#6b4a2b');db(P,0.02,0.1,0,0.04,0.14,0.04,'#5c3f24');db(P,-0.02,0.2,0,0.26,0.07,0.16,'#3f8f2f');db(P,0.06,0.25,0,0.14,0.06,0.12,'#4fa33a');}
  /* pet, back right, turned towards the chair */
  const Q=grp(g,0.74,T,-0.18,-0.5),eyes=(H,y,z,s)=>{db(H,-s,y,z,0.02,0.02,0.005,dark);db(H,s,y,z,0.02,0.02,0.005,dark);};
  const head=(x,y,z)=>{const H=grp(Q,x,y,z);anim.push({o:H,y,ph:Math.random()*6,k:'bob'});return H;};
  if(d.pet===1||d.pet===2){const c=d.pet===1?'#e8a050':'#c8955a',dk=d.pet===1?'#c47a30':'#7a4a26';
    db(Q,0,0.08,-0.02,0.14,0.16,0.18,c);const H=head(0,0.2,0.05);db(H,0,0.04,0,0.14,0.12,0.12,c);eyes(H,0.05,0.061,0.03);
    if(d.pet===1){db(H,-0.045,0.12,0,0.035,0.04,0.03,dk);db(H,0.045,0.12,0,0.035,0.04,0.03,dk);db(H,0,0.02,0.062,0.02,0.015,0.005,'#f2b8c6');}
    else{db(H,0,0.02,0.08,0.07,0.06,0.05,'#e8c08a');db(H,0,0.04,0.106,0.025,0.02,0.005,dark);db(H,-0.08,0.02,0,0.025,0.09,0.06,dk);db(H,0.08,0.02,0,0.025,0.09,0.06,dk);}
    const tail=grp(Q,0,0.05,-0.11);anim.push({o:tail,ph:Math.random()*6,k:'wag'});db(tail,0,0,-0.06,0.03,0.03,0.12,dk);}
  else if(d.pet===3){db(Q,0,0.05,0,0.13,0.1,0.14,'#e8c08a');db(Q,0,0.03,0.04,0.09,0.05,0.07,'#f4f1ea');const H=head(0,0.1,0.05);db(H,0,0.02,0,0.1,0.08,0.08,'#e8c08a');eyes(H,0.03,0.041,0.025);db(H,-0.035,0.07,0,0.025,0.025,0.02,'#f2b8c6');db(H,0.035,0.07,0,0.025,0.025,0.02,'#f2b8c6');}
  else if(d.pet===4){db(Q,0,0.065,-0.01,0.13,0.13,0.16,'#f4f1ea');db(Q,0,0.06,-0.1,0.05,0.05,0.04,'#ffffff');const H=head(0,0.17,0.04);db(H,0,0.03,0,0.11,0.1,0.1,'#f4f1ea');eyes(H,0.04,0.051,0.025);
    for(const s of [-0.03,0.03]){db(H,s,0.14,0,0.03,0.13,0.02,'#f4f1ea');db(H,s,0.14,0.011,0.015,0.1,0.004,'#f2b8c6');}}
  else if(d.pet===5){db(Q,0,0.015,0,0.2,0.03,0.2,'#d6c48a');db(Q,0,0.08,0,0.2,0.14,0.2,'#5aa6e6','t');db(Q,0,0.1,0,0.23,0.2,0.23,'#cfefff','t');
    const swim=grp(Q,0,0.09,0);anim.push({o:swim,ph:Math.random()*6,k:'swim'});db(swim,0.05,0,0,0.03,0.04,0.07,'#ef7f2a');db(swim,0.05,0,-0.045,0.02,0.04,0.025,'#f2b632');}
  else if(d.pet===6){db(Q,0,0.06,0,0.16,0.07,0.2,'#4f9a33');db(Q,0,0.1,0,0.11,0.04,0.14,'#3f8f2f');for(const [x,z] of [[-0.07,0.07],[0.07,0.07],[-0.07,-0.07],[0.07,-0.07]])db(Q,x,0.02,z,0.04,0.04,0.04,'#9fbf6a');
    const H=head(0,0.05,0.13);db(H,0,0,0,0.06,0.05,0.07,'#9fbf6a');eyes(H,0.01,0.036,0.018);}
  /* decor: up to two items on the front corners */
  d.decor.forEach((it,n)=>{const D=grp(g,n?0.7:-0.68,T,n?0.26:0.24,n?-0.3:0.3);
    if(it===0){db(D,0,0.055,0,0.09,0.11,0.09,'#f4f1ea');db(D,0,0.07,0,0.092,0.03,0.092,'#e0442e');db(D,0.06,0.055,0,0.02,0.06,0.025,'#f4f1ea');db(D,0,0.108,0,0.07,0.005,0.07,'#5b3a1e');}
    else if(it===1){db(D,0,0.015,0,0.14,0.03,0.12,'#3a3a44');db(D,0,0.17,-0.03,0.025,0.3,0.025,'#3a3a44');db(D,0,0.31,0.03,0.14,0.06,0.14,'#f2b632');db(D,0,0.275,0.03,0.09,0.012,0.09,'#ffe08a','g');}
    else if(it===2){db(D,0,0.02,0,0.2,0.04,0.14,'#2f6fc2');db(D,0.01,0.06,0,0.18,0.04,0.13,'#e0442e',null,0.15);db(D,-0.005,0.098,0,0.19,0.035,0.14,'#4f9a33',null,-0.1);}
    else if(it===3){const F=grp(D,0,0,0);F.rotation.x=-0.2;db(F,0,0.08,0,0.16,0.13,0.02,'#6b4a2b');db(F,0,0.08,0.011,0.12,0.09,0.004,'#9cc8ec','g');db(F,0,0.052,0.0135,0.12,0.035,0.003,'#6cbf4c','g');db(F,0.035,0.105,0.0135,0.02,0.02,0.003,'#ffe08a','g');}
    else if(it===4){db(D,0,0.025,0,0.1,0.05,0.1,'#3a3a44');db(D,0,0.08,0,0.03,0.06,0.03,'#f2b632');db(D,0,0.15,0,0.11,0.09,0.11,'#f2b632');db(D,-0.07,0.16,0,0.025,0.05,0.02,'#f2b632');db(D,0.07,0.16,0,0.025,0.05,0.02,'#f2b632');}
    else if(it===5){db(D,0,0.01,0,0.1,0.02,0.1,'#3a3a44');db(D,0,0.12,0,0.02,0.22,0.02,'#3a3a44');db(D,0,0.24,0,0.17,0.025,0.04,dark);db(D,-0.085,0.17,0,0.035,0.09,0.07,'#e0442e');db(D,0.085,0.17,0,0.035,0.09,0.07,'#e0442e');}
    else if(it===6){const R=grp(D,0,0,0,0.5);db(R,0,0.045,0,0.09,0.09,0.09,dark);db(R,0,0.0905,0,0.08,0.002,0.08,'#e0442e');db(R,0,0.045,0.0455,0.08,0.08,0.002,'#2f6fc2');db(R,0.0455,0.045,0,0.002,0.08,0.08,'#f2b632');}
    else if(it===7){db(D,0,0.015,0,0.1,0.03,0.1,'#6b4a2b');db(D,0,0.07,0,0.02,0.1,0.02,'#a8793f');const B=grp(D,0,0.16,0);anim.push({o:B,k:'spin'});db(B,0,0,0,0.13,0.13,0.13,'#2f6fc2');db(B,0.02,0.02,0,0.135,0.05,0.06,'#4f9a33');db(B,-0.03,-0.03,0.02,0.06,0.04,0.135,'#4f9a33');}
  });
  /* chair */
  const C=grp(g,0,0,1.0),cc=DK.chair[d.chair],base=()=>{db(C,0,0.22,0,0.08,0.44,0.08,metal);db(C,0,0.04,0,0.5,0.05,0.08,metal);db(C,0,0.04,0,0.08,0.05,0.5,metal);};
  if(d.chairStyle===1){db(C,0,0.46,0,0.58,0.1,0.56,cc).castShadow=SHADOWS;db(C,0,0.98,0.29,0.58,0.96,0.08,cc);db(C,0,0.98,0.248,0.16,0.9,0.01,'#f4f1ea');
    for(const s of [-1,1]){db(C,s*0.27,1.12,0.26,0.06,0.4,0.12,cc);db(C,s*0.32,0.62,0,0.06,0.04,0.42,metal);db(C,s*0.32,0.54,0,0.04,0.14,0.04,metal);}base();}
  else if(d.chairStyle===2){db(C,0,0.46,0,0.46,0.08,0.46,cc).castShadow=SHADOWS;for(const [x,z] of [[-0.17,-0.17],[0.17,-0.17],[-0.17,0.17],[0.17,0.17]])db(C,x,0.21,z,0.05,0.42,0.05,'#a8793f');}
  else if(d.chairStyle===3){db(C,0,0.4,0,0.72,0.18,0.6,cc).castShadow=SHADOWS;db(C,0,0.78,0.28,0.72,0.62,0.12,cc);
    for(const s of [-1,1]){db(C,s*0.34,0.58,0.02,0.1,0.22,0.58,cc);db(C,s*0.3,0.07,-0.24,0.06,0.14,0.06,'#5b3a1e');db(C,s*0.3,0.07,0.24,0.06,0.14,0.06,'#5b3a1e');}}
  else{db(C,0,0.46,0,0.56,0.08,0.56,cc).castShadow=SHADOWS;db(C,0,0.84,0.27,0.56,0.62,0.07,cc);base();}
  return{root:g,anim};
}
function animateDesk(d,t,dt){if(reduceMotion)return;for(const a of d.anim){
  if(a.k==='bob'){a.o.position.y=a.y+Math.abs(Math.sin(t*2.2+a.ph))*0.012;a.o.rotation.y=Math.sin(t*0.5+a.ph)*0.4;}
  else if(a.k==='wag')a.o.rotation.y=Math.sin(t*9+a.ph)*0.5;
  else if(a.k==='swim')a.o.rotation.y=t*1.1+a.ph;
  else if(a.k==='spin')a.o.rotation.y+=dt*0.4;}}
function placeDesk(slot,cfg,owner){
  const S=DESK_SLOTS[slot];if(!S)return;clearDesk(slot);
  const d=buildDesk(cfg);d.root.position.set(S.x,0,S.dz);d.root.rotation.y=S.tw<0?Math.PI:0;scene.add(d.root);S.desk=d;S.spot.owner=owner;S.sig=owner+'|'+deskToArr(deskOf({desk:cfg})).join();
  solidRect(S.x-1,S.dz-0.5,S.x+1,S.dz+0.5,0.82);raiseTop(Math.floor(S.x),Math.floor(S.zc),0.95);
}
function clearDesk(slot){
  const S=DESK_SLOTS[slot];if(!S||!S.desk)return;scene.remove(S.desk.root);S.desk=null;S.spot.owner=null;S.sig='';
  for(let cx=Math.floor(S.x-1);cx<Math.ceil(S.x+1);cx++)for(let cz=Math.floor(S.dz-0.5);cz<Math.ceil(S.dz+0.5);cz++)setTop(cx,cz,0);
  setTop(Math.floor(S.x),Math.floor(S.zc),0);
}
// one desk per person: keep a valid slot nobody else holds, otherwise take the free slot nearest the door (-1 when all are taken)
function allocDesk(rec){
  const taken=new Set(Object.values(USERS).filter(u=>kOf(u)!==kOf(rec)).map(u=>u.deskSlot));
  if(!(rec.deskSlot>=0&&rec.deskSlot<DESK_SLOTS.length&&!taken.has(rec.deskSlot))){const s=DESK_ORDER.find(i=>!taken.has(i));rec.deskSlot=s==null?-1:s;}
  return rec.deskSlot;
}
const deskLabel=rec=>rec&&rec.deskSlot>=0&&DESK_SLOTS[rec.deskSlot]?DESK_SLOTS[rec.deskSlot].label:'';

let boardCanvas,boardTex,boardMesh;
function buildFurniture(){
  /* --- Work desks: 6 pods x 4 desk slots. Each person's own desk is built into a slot by placeDesk. --- */
  let pod=0;
  for(const cz of [-32,-24])for(const cx of [-8,0,8]){
    const letter='ABCDEF'[pod++];let seat=0;
    for(const [dx,side] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const x=cx+dx,dz=side<0?cz-0.5:cz+0.5,tw=side,zc=dz+tw*1.0;
      WR();if(WR()<0.45)WR();WR();// the old static desks drew from the seeded RNG; keep the sequence so trees and flowers stay put
      fbox(x,0.012,dz+tw*0.5,1.86,0.02,2.0,'#b89a6a');// floor mat marks the slot, empty or not
      const gap=x<cx?cx-4:cx+4,az=zc+tw*1.0;
      const spot=addSpot({zone:'desks',x,z:zc,y:0.5,face:tw<0?0:Math.PI,pose:'sit',desk:true,approach:{x,z:az},via:[{x:gap,z:-19.5},{x:gap,z:az},{x,z:az}]});
      DESK_SLOTS.push({x,dz,tw,zc,spot,label:'Pod '+letter+' · desk '+(++seat),desk:null});
    }
  }
  DESK_ORDER.push(...DESK_SLOTS.map((_,i)=>i).sort((a,b)=>{const A=DESK_SLOTS[a],B=DESK_SLOTS[b];return Math.hypot(A.x,A.zc+17)-Math.hypot(B.x,B.zc+17);}));
  // desk room extras
  fbox(0,1.25,-36.92,4.2,1.5,0.08,'#f4f6f7');fbox(0,1.25,-36.97,4.4,1.7,0.06,'#8c8a86');
  for(let i=0;i<5;i++)fbox(-1.6+i*0.8,1.1+((i*37)%5)*0.12,-36.87,0.5,0.05,0.01,wpick(['#e0442e','#2f6fc2','#3f8f3f']),'glow');
  solidRect(-2.2,-37,2.2,-36.8,2);
  plant(-12.4,-36.4,1.3);plant(12.4,-36.4,1.3);plant(-12.4,-18.6,1.1);plant(12.4,-18.6,1.1);
  fbox(10.6,0.5,-18.5,0.9,1.0,0.7,'#d9d9dc');fbox(10.6,1.02,-18.5,0.92,0.04,0.72,'#55555c');solidRect(10.1,-19,11.1,-18,1.1);

  /* --- Pantry --- */
  for(let z=-6;z<=3;z++){fbox(32.5,0.45,z+0.5,1,0.9,1,'#e9e2d3');fbox(32.5,0.93,z+0.5,1.04,0.06,1.04,'#4a4a52');setTop(32,z,1.0);}
  fbox(32.6,1.24,-4.5,0.6,0.56,0.5,'#2b2b30');fbox(32.28,1.3,-4.5,0.02,0.08,0.08,'#ff5a3c','glow');fbox(32.35,1.02,-4.5,0.14,0.12,0.14,'#f4f1ea');
  fbox(32.5,0.97,-1.5,0.7,0.03,0.6,'#9aa3aa');fbox(32.85,1.12,-1.5,0.06,0.28,0.06,'#c5ccd2');
  // food counter (items are added by refreshMenu): menu board on the back edge, cups beside the coffee machine
  fbox(32.94,1.62,1.25,0.05,0.92,4.36,'#6b4a2b');for(const z of [-0.9,3.4])fbox(32.94,1.1,z,0.06,0.3,0.06,'#6b4a2b');
  fbox(32.5,1.0,-3.8,0.11,0.08,0.11,'#f4f1ea');fbox(32.5,1.07,-3.8,0.11,0.06,0.11,'#f4f1ea');fbox(32.55,1.04,-3.35,0.1,0.14,0.1,'#cfeeff','glass');
  fbox(32.5,1.12,5.9,0.98,2.24,1.8,'#dfe5e8');fbox(32.0,1.3,5.9,0.03,0.6,0.06,'#9aa3aa');solidRect(32,5,33,7,2.3);
  fbox(19.6,0.95,-6.6,0.9,1.9,0.7,'#c23a2b');fbox(20.06,1.15,-6.6,0.02,1.1,0.55,'#ffe9b0','glow');solidRect(19,-7,20,-6,2);
  fbox(19.5,0.55,6.5,0.5,1.1,0.5,'#e8eef0');fbox(19.5,1.3,6.5,0.36,0.4,0.36,'#8fd0f5','glass');solidRect(19,6,20,7,1.5);
  const stoolCols=['#2fa5a0','#f2b632','#e0442e','#6d4bb5'];
  const pantryVia={A:{N:[{x:21.2,z:0.5},{x:21.2,z:-5.4},{x:24,z:-5.35}],S:[{x:24,z:0.5},{x:24,z:-0.65}],W:[{x:21.2,z:0.5},{x:21.2,z:-3},{x:21.65,z:-3}],E:[{x:26.8,z:0.5},{x:26.8,z:-3},{x:26.35,z:-3}]},
                   B:{N:[{x:24,z:0.5},{x:24,z:1.65}],S:[{x:21.2,z:0.5},{x:21.2,z:6.4},{x:24,z:6.35}],W:[{x:21.2,z:0.5},{x:21.2,z:4},{x:21.65,z:4}],E:[{x:26.8,z:0.5},{x:26.8,z:4},{x:26.35,z:4}]}};
  for(const [tid,tz] of [['A',-3],['B',4]]){
    const tx=24;fbox(tx,0.74,tz,1.8,0.08,1.8,'#f1ece2');fbox(tx,0.37,tz,0.14,0.74,0.14,'#4a4a52');fbox(tx,0.03,tz,0.8,0.06,0.8,'#4a4a52');solidRect(tx-0.9,tz-0.9,tx+0.9,tz+0.9,0.8);
    let k=0;
    for(const [side,ox,oz,face] of [['N',0,-1.45,0],['S',0,1.45,Math.PI],['W',-1.45,0,Math.PI/2],['E',1.45,0,-Math.PI/2]]){
      const sx=tx+ox,sz=tz+oz;fbox(sx,0.46,sz,0.44,0.08,0.44,stoolCols[k++]);fbox(sx,0.22,sz,0.08,0.44,0.08,'#4a4a52');raiseTop(Math.floor(sx),Math.floor(sz),0.9);
      const v=pantryVia[tid][side];addSpot({zone:'pantry',x:sx,z:sz,y:0.5,face,pose:'sit',approach:v[v.length-1],via:v.slice(0,-1)});
    }
  }
  addSpot({zone:'pantry',x:31.2,z:-4.5,y:0,face:Math.PI/2,pose:'coffee',via:[{x:28.5,z:0.5},{x:28.5,z:-4.5}]});
  addSpot({zone:'pantry',x:31.2,z:4.4,y:0,face:Math.PI/2,pose:'stand',via:[{x:28.5,z:0.5},{x:28.5,z:4.4}]});
  addSpot({zone:'pantry',x:31.2,z:-1.5,y:0,face:Math.PI/2,pose:'wash',via:[{x:28.5,z:0.5},{x:28.5,z:-1.5}]});

  /* --- Restroom --- */
  for(const zp of [-5,-2,1,4])fbox(-29,0.95,zp,2.0,1.9,0.08,'#8fb3c4');
  // three private stalls: front wall with a doorway, a toilet and paper roll inside (only seen through the open door)
  for(const zc of [-3.5,-0.5,2.5]){
    fbox(-28.0,0.95,zc-0.975,0.08,1.8,1.05,'#7aa0b3');fbox(-28.0,0.95,zc+0.975,0.08,1.8,1.05,'#7aa0b3');fbox(-28.0,1.83,zc,0.08,0.04,0.9,'#7aa0b3');
    fbox(-29.55,0.2,zc,0.42,0.4,0.48,'#f4f7f8');fbox(-29.55,0.43,zc,0.46,0.04,0.52,'#dfe5e8');fbox(-29.88,0.62,zc,0.2,0.5,0.52,'#f4f7f8');fbox(-29.5,0.85,zc+1.42,0.12,0.12,0.05,'#ffffff');}
  solidRect(-30,-5,-28,4,2);
  fbox(-24.5,0.42,-5.5,6,0.84,1,'#e4dcd0');fbox(-24.5,0.87,-5.5,6.04,0.06,1.04,'#5c6670');solidRect(-27.5,-6,-21.5,-5,0.9);
  for(const x of [-26.5,-24.5,-22.5]){
    fbox(x,0.91,-5.45,0.6,0.04,0.5,'#f4f7f8');fbox(x,1.02,-5.86,0.06,0.2,0.06,'#b9c1c7');fbox(x,1.66,-5.96,0.8,0.8,0.04,'#c9ecf8','glow');
    addSpot({zone:'restroom',x,z:-4.45,y:0,face:Math.PI,pose:'wash',via:[{x:-24,z:-2.4},{x,z:-3.4}]});
  }
  for(const zc of [-3.5,-0.5,2.5]){const spot=addSpot({zone:'restroom',x:-27.4,z:zc,y:0,face:-Math.PI/2,pose:'stall',via:[{x:-25.2,z:zc}]});
    const pivot=new THREE.Group();pivot.position.set(-27.95,0,zc+0.45);pivot.rotation.y=-0.35;scene.add(pivot);// hinge; the door swings out into the room
    const door=new THREE.Mesh(UNIT_BOX,STALL_MAT.door);door.scale.set(0.06,1.66,0.88);door.position.set(0,0.95,-0.45);door.castShadow=SHADOWS;pivot.add(door);
    const knob=new THREE.Mesh(UNIT_BOX,STALL_MAT.knob);knob.scale.set(0.04,0.06,0.06);knob.position.set(0.05,0.95,-0.8);pivot.add(knob);
    const sign=new THREE.Mesh(UNIT_BOX,STALL_MAT.free);sign.scale.set(0.03,0.09,0.24);sign.position.set(-27.94,1.93,zc);scene.add(sign);
    STALLS.push({i:STALLS.length,kind:'stall',zc,spot,at:spot,face:{x:spot.x-1,z:spot.z},out:{x:spot.x+0.95,z:spot.z},outH:Math.PI/2,lab:{x:-27.9,y:2.35,z:zc},hum:{x:-28.5,y:2.0,z:zc},dir:1,pivot,sign,occ:null,ang:-0.35,swing:0,label:null});}
  // two showers: tiled cubicles with a glass door; like the stalls you are hidden inside and others see "Occupied"
  for(const xw of [-27.5,-25.45,-23.4])fbox(xw,1.05,5.0,0.08,2.1,2.0,'#9fc3d3');
  for(const sx of [-26.5,-24.4]){
    fbox(sx,1.05,5.96,1.95,2.1,0.04,'#dfeef5');fbox(sx,0.03,5.0,1.95,0.06,1.95,'#e8eef0');fbox(sx,0.065,5.0,0.16,0.01,0.16,'#9aa3aa');fbox(sx,1.95,5.8,0.05,0.05,0.35,'#c5ccd2');fbox(sx,1.9,5.6,0.24,0.04,0.24,'#c5ccd2');
    fbox(sx+0.475,1.0,4.0,0.95,1.9,0.04,'#cfeeff','glass');fbox(sx,2.06,4.0,1.95,0.06,0.06,'#c5ccd2');
    const spot=addSpot({zone:'restroom',x:sx,z:5.0,y:0,face:0,pose:'stall',via:[{x:sx,z:2.6}]});
    const pivot=new THREE.Group();pivot.position.set(sx-0.95,0,4.0);pivot.rotation.y=0.35;scene.add(pivot);// hinge on the left; the door swings out (north)
    const door=new THREE.Mesh(UNIT_BOX,STALL_MAT.glass);door.scale.set(0.95,1.9,0.04);door.position.set(0.475,1.0,0);pivot.add(door);
    const knob=new THREE.Mesh(UNIT_BOX,STALL_MAT.knob);knob.scale.set(0.05,0.18,0.05);knob.position.set(0.85,1.0,-0.05);pivot.add(knob);
    const sign=new THREE.Mesh(UNIT_BOX,STALL_MAT.free);sign.scale.set(0.24,0.09,0.03);sign.position.set(sx-0.475,2.14,3.97);scene.add(sign);
    STALLS.push({i:STALLS.length,kind:'shower',zc:5.0,spot,at:{x:sx,z:3.3},face:{x:sx,z:6},out:{x:sx,z:3.2},outH:Math.PI,lab:{x:sx,y:2.45,z:4.0},hum:{x:sx,y:2.1,z:5.0},dir:-1,pivot,sign,occ:null,ang:0.35,swing:0,label:null});}
  solidRect(-27.55,4.0,-23.35,6,2.1);
  fbox(-20.15,1.25,-4.4,0.16,0.4,0.5,'#d0d6da');plant(-21.4,5.0,1);

  /* --- Plaza --- */
  // plaza benches face the apple tree
  bench(4.0,-4.0,-Math.PI/4,'#8a5a33','plaza');bench(-4.0,-4.0,Math.PI/4,'#8a5a33','plaza');bench(-4.0,4.0,Math.PI*3/4,'#8a5a33','plaza');
  // orchard board (SE)
  const br=-Math.PI/4,bx=4.3,bz=4.3,ux=Math.cos(br),uz=-Math.sin(br);
  for(const s of [-1.2,1.2])fbox(bx+ux*s,0.95,bz+uz*s,0.16,1.9,0.16,'#6b4a2b');
  fbox(bx,1.55,bz,2.8,1.75,0.12,'#7a5328','noise',br);
  solidRect(bx-1,bz-1,bx+1,bz+1,2);
  boardCanvas=textCanvas(512,320,()=>{},2);boardTex=textTex(boardCanvas);
  boardMesh=new THREE.Mesh(new THREE.PlaneGeometry(2.62,1.6),new THREE.MeshBasicMaterial({map:boardTex}));
  boardMesh.position.set(bx+Math.sin(br)*0.065,1.55,bz+Math.cos(br)*0.065);boardMesh.rotation.y=br;boardMesh.userData.board=true;scene.add(boardMesh);PICK_TARGETS.push(boardMesh);
  BOARD_POS.set(bx,0,bz);

  /* --- Lake --- */
  // fishing rod stand beside the lake path (FISH_RACK): two posts, a bar, three rods and a tackle box
  fbox(-4.1,0.6,16.2,0.08,1.2,0.08,'#6b4a2b');fbox(-3.1,0.6,16.2,0.08,1.2,0.08,'#6b4a2b');fbox(-3.6,1.15,16.2,1.1,0.06,0.08,'#6b4a2b');
  for(const o of [-0.3,0,0.3]){fbox(-3.6+o,0.8,16.1,0.03,1.6,0.03,'#5b3a1e');fbox(-3.6+o,0.35,16.13,0.06,0.06,0.05,'#3a3a44');}
  fbox(-3.6,0.12,16.6,0.42,0.24,0.26,'#2f6fc2');fbox(-3.6,0.25,16.6,0.44,0.03,0.28,'#f2b632');solidRect(-4.2,15.9,-3.0,16.5,1.3);
  bench(-8,20.5,0,'#8a5a33','lake');bench(8,20.5,0,'#8a5a33','lake');
  for(const s of SPOTS.filter(s=>s.zone==='lake'))s.via=[{x:s.x,z:21.7}];
  addSpot({zone:'lake',x:0.0,z:29.6,y:0,face:0,pose:'look',via:[{x:0,z:21.6}]});
  // shore viewpoints: walk along z=19.4 (behind the benches), then down to the water
  addSpot({zone:'lake',x:-12,z:23.4,y:0,face:0.35,pose:'look',via:[{x:-12,z:19.4}]});
  addSpot({zone:'lake',x:12,z:23.4,y:0,face:-0.35,pose:'look',via:[{x:12,z:19.4}]});
  fbox(-0.9,-0.2,31.4,0.18,1.0,0.18,'#5b3a1e');fbox(0.9,-0.2,31.4,0.18,1.0,0.18,'#5b3a1e');
  for(let i=0;i<14;i++){const a=WR()*Math.PI*2,r=0.55+WR()*0.35,x=Math.sin(a)*17*r,z=31+Math.cos(a)*8.5*r;if(Math.abs(x)<2.5)continue;fbox(x,-0.17,z,0.5,0.03,0.5,'#4f9a33');if(WR()<0.3)fbox(x+0.1,-0.12,z,0.12,0.06,0.12,'#f4a6c0');}
  for(let i=0;i<40;i++){const a=WR()*Math.PI*2,x=Math.sin(a)*17*1.08,z=31+Math.cos(a)*8.5*1.08;if(Math.abs(x)<3)continue;const cx=Math.floor(x),cz=Math.floor(z);if(getTile(cx,cz)!=='sand')continue;fbox(x,0.25,z,0.08,0.5+WR()*0.3,0.08,'#5f8f3a');}

  /* --- Playroom --- */
  // the five retro cabinets stand in a circle, screens facing out, under a turning ARCADE banner; each screen is a canvas (drawCabinetScreens)
  const cabCols=['#2f6fc2','#3f8f3f','#6d4bb5','#ef7f2a','#c23a2b'],cabLite=['#8fc4ff','#a6e88a','#d2b4ff','#ffc58a','#ff9a8a'],AC={x:20.5,z:-25.5};
  const circleVia=[[{x:23.6,z:-22.4}],[{x:18.2,z:-28.3}],[],[],[]];// walking routes round the circle from the door
  for(let i=0;i<5;i++){const a=Math.PI/2+i*Math.PI*2/5,fx=Math.sin(a),fz=Math.cos(a),rx=Math.cos(a),rz=-Math.sin(a),c=cabCols[i];
    const at=(f,sd)=>[AC.x+fx*(1.15+f)+rx*sd,AC.z+fz*(1.15+f)+rz*sd];// f forward from the cabinet centre, sd to its side
    const b=(f,sd,y,sx,sy,sz,col,mat)=>{const [x,z]=at(f,sd);fbox(x,y,z,sx,sy,sz,col,mat,a);};
    b(0,0,0.9,0.86,1.8,0.8,c);b(0.39,0,1.38,0.72,0.56,0.04,'#111118');b(0.36,0,1.74,0.8,0.2,0.12,cabLite[i],'glow');
    b(0.55,0,1.0,0.86,0.1,0.34,'#2a2a33');b(0.41,0,0.5,0.6,0.5,0.02,'#1c1c24');b(0.42,0,0.62,0.14,0.08,0.01,'#f2b632','glow');
    b(0.6,-0.18,1.11,0.04,0.12,0.04,'#222228');b(0.6,-0.18,1.19,0.08,0.08,0.08,'#e0442e');b(0.6,0.08,1.06,0.07,0.03,0.07,'#f2b632','glow');b(0.6,0.22,1.06,0.07,0.03,0.07,'#4fd3ff','glow');
    const canvas=textCanvas(96,64,(g)=>{g.fillStyle='#0b0d1f';g.fillRect(0,0,96,64);},3),tex=textTex(canvas),[sx,sz]=at(0.415,0);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(0.64,0.46),new THREE.MeshBasicMaterial({map:tex}));screen.position.set(sx,1.38,sz);screen.rotation.y=a;scene.add(screen);
    const spot=addSpot({zone:'playroom',x:AC.x+fx*2.6,z:AC.z+fz*2.6,y:0,face:a+Math.PI,pose:'arcade',via:circleVia[i]});
    ARCADES.push({i:ARCADES.length,g:i,face:a+Math.PI,sit:false,x:sx,z:sz,spot,canvas,tex,screen});}
  for(let cx=19;cx<=21;cx++)for(let cz=-27;cz<=-25;cz++)raiseTop(cx,cz,2);// the circle is one solid block; players stand 2.6 m out
  fbox(AC.x,1.05,AC.z,0.5,2.1,0.5,'#2b2d33');fbox(AC.x,2.12,AC.z,0.7,0.06,0.7,'#f2b632','glow');
  // banner: a static five-sided marquee naming each cabinet's game, and above it an eight-sided ARCADE crown that turns
  const panel=(w,h,pw,ph,draw)=>{const c=textCanvas(w,h,()=>{},2),t=textTex(c),redraw=()=>{draw(c.getContext('2d'),w,h);t.needsUpdate=true;};redraw();SIGN_DRAWERS.push(redraw);return new THREE.Mesh(new THREE.PlaneGeometry(pw,ph),new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide}));};
  const neon=(g,w,h,txt,col,size)=>{g.fillStyle='#120618';g.fillRect(0,0,w,h);g.fillStyle=col;g.fillRect(0,0,w,3);g.fillRect(0,h-3,w,3);g.textAlign='center';g.font='700 '+size+'px '+FONT_UI;g.fillStyle=col;g.fillText(txt,w/2,h/2+size*0.36);};
  ['PADDLE','SNAKE','ORCHARD','BRICKS','RUSH'].forEach((n,i)=>{const a=Math.PI/2+i*Math.PI*2/5,m=panel(128,40,1.15,0.36,(g,w,h)=>neon(g,w,h,n,cabLite[i],20));m.position.set(AC.x+Math.sin(a)*0.92,2.42,AC.z+Math.cos(a)*0.92);m.rotation.y=a;scene.add(m);});
  arcBanner=new THREE.Group();arcBanner.position.set(AC.x,3.0,AC.z);scene.add(arcBanner);
  for(let i=0;i<8;i++){const a=i*Math.PI/4,m=panel(128,48,0.86,0.34,(g,w,h)=>neon(g,w,h,'ARCADE',i%2?'#ff6fae':'#4fd3ff',24));m.position.set(Math.sin(a)*1.03,0,Math.cos(a)*1.03);m.rotation.y=a;arcBanner.add(m);}
  db(arcBanner,0,0.2,0,2.2,0.04,0.12,'#f2b632');db(arcBanner,0,0.2,0,0.12,0.04,2.2,'#f2b632');db(arcBanner,0,-0.2,0,2.2,0.04,0.12,'#f2b632');db(arcBanner,0,-0.2,0,0.12,0.04,2.2,'#f2b632');
  fbox(AC.x,2.65,AC.z,0.12,1.1,0.12,'#3a3d44');
  // casino corner: two rows of five slot machines facing south, each with a stool, a lever and a light on top (Golden Reels, full screen)
  const slotCols=['#c23a2b','#6d4bb5','#2f6fc2','#3f8f3f','#ef7f2a'];
  for(const [z,via] of [[-29.5,x=>[{x:24,z:-22.6},{x:24,z:-27.3},{x,z:-27.3}]],[-25.5,x=>[{x:24,z:-22.6},{x,z:-23.2}]]])
    [25.6,26.7,27.8,28.9,30.0].forEach((x,k)=>{const zs=z+1.32;
      fbox(x,0.45,z,0.9,0.9,0.75,'#2b2d33');fbox(x,1.35,z-0.05,0.86,0.9,0.65,slotCols[k]);fbox(x,1.32,z+0.28,0.72,0.6,0.04,'#111118');
      fbox(x,1.95,z-0.05,0.86,0.3,0.6,'#18110b');fbox(x,1.95,z+0.26,0.78,0.22,0.02,'#f2b632','glow');fbox(x,2.1,z+0.27,0.6,0.03,0.02,'#ffffff','glow');
      fbox(x,0.95,z+0.42,0.86,0.08,0.22,'#3a3d44');for(const [o,col] of [[-0.22,'#e0442e'],[0,'#f2b632'],[0.22,'#6cbf4c']])fbox(x+o,1.0,z+0.45,0.14,0.03,0.08,col,'glow');
      fbox(x,0.62,z+0.4,0.56,0.08,0.12,'#c5ccd2');fbox(x+0.46,1.2,z+0.05,0.08,0.14,0.14,'#3a3d44');
      const lever=new THREE.Group();lever.position.set(x+0.5,1.2,z+0.05);scene.add(lever);db(lever,0,0.25,0,0.04,0.5,0.04,'#c5ccd2');db(lever,0,0.52,0,0.1,0.1,0.1,'#e0442e');
      db(scene,x,2.17,z-0.05,0.22,0.1,0.22,'#7a5a20');const lamp=new THREE.Mesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0xffd34a}));lamp.scale.set(0.24,0.12,0.24);lamp.position.set(x,2.17,z-0.05);lamp.visible=false;scene.add(lamp);
      fbox(x,0.6,zs,0.42,0.06,0.42,'#e0442e');fbox(x,0.3,zs,0.07,0.6,0.07,'#9aa3aa');fbox(x,0.02,zs,0.36,0.04,0.36,'#2b2d33');
      const canvas=textCanvas(96,72,g=>{g.fillStyle='#120618';g.fillRect(0,0,96,72);},3),tex=textTex(canvas);
      const screen=new THREE.Mesh(new THREE.PlaneGeometry(0.66,0.5),new THREE.MeshBasicMaterial({map:tex}));screen.position.set(x,1.32,z+0.305);scene.add(screen);
      const spot=addSpot({zone:'playroom',x,z:zs,y:0,face:Math.PI,pose:'arcade',via:via(x)});
      ARCADES.push({i:ARCADES.length,g:5,face:Math.PI,sit:true,seatY:0.63,x,z,spot,canvas,tex,screen,lever,lamp,pull:0,flash:0,spinT:0});});
  solidRect(25.1,-29.9,30.6,-29.1,2.3);solidRect(25.1,-25.9,30.6,-25.1,2.3);
  // two sofas facing a coffee table on a rug; sofa seats give a better rest than a bench
  fbox(24,0.012,-18,6.2,0.02,5.6,'#7a3b6e');fbox(24,0.016,-18,5.6,0.02,5.0,'#94507f');
  const sofa=(cx,cz,rot,col,dk,via,zone)=>{const ux=Math.cos(rot),uz=-Math.sin(rot),fx=Math.sin(rot),fz=Math.cos(rot);
    fbox(cx,0.2,cz,2.2,0.4,0.8,dk,'noise',rot);fbox(cx-fx*0.31,0.72,cz-fz*0.31,2.2,0.64,0.18,col,'noise',rot);
    for(const s of [-1.02,1.02])fbox(cx+ux*s,0.55,cz+uz*s,0.16,0.3,0.8,dk,'noise',rot);
    for(const s of [-0.68,0,0.68])fbox(cx+ux*s+fx*0.06,0.45,cz+uz*s+fz*0.06,0.64,0.1,0.62,col,'noise',rot);
    for(const s of [-1.05,-0.35,0.35,1.05])raiseTop(Math.floor(cx+ux*s),Math.floor(cz+uz*s),0.9);
    for(const s of [-0.68,0,0.68]){const x=cx+ux*s,z=cz+uz*s,ap={x:x+fx*0.95,z:z+fz*0.95};addSpot({zone:zone||'playroom',x,z,y:0.5,face:rot,pose:'sit',sofa:true,approach:ap,via:[...via,ap]});}};
  // collision is per 1 m cell, so each sofa and the table sit inside one row (z -21, -19, -16) and the rows between them (z -20, -17) stay free to stand up into
  sofa(24,-20.45,0,'#2fa5a0','#1f7a76',[{x:21.6,z:-19.5}]);sofa(24,-15.55,Math.PI,'#e0442e','#a8301f',[{x:21.2,z:-16.5}]);
  fbox(24,0.4,-18.5,1.6,0.06,0.8,'#8c6234');for(const [dx,dz] of [[-0.7,-0.3],[0.7,-0.3],[-0.7,0.3],[0.7,0.3]])fbox(24+dx,0.19,-18.5+dz,0.08,0.38,0.08,'#5b3a1e');
  fbox(23.6,0.47,-18.55,0.3,0.08,0.3,'#f4f1ea');fbox(23.6,0.52,-18.55,0.22,0.04,0.22,'#f2b632');fbox(24.45,0.48,-18.4,0.36,0.04,0.24,'#2b2b30');fbox(24.45,0.5,-18.4,0.08,0.03,0.08,'#e0442e','glow');
  solidRect(23.2,-18.9,24.8,-18.1,0.8);
  // posters on the south wall, plants in the corners; the east side is left open
  [[18.6,'#e0442e','#f2b632'],[20.4,'#2f6fc2','#4fd3ff'],[27.6,'#6d4bb5','#ff6fae']].forEach(([x,a,b])=>{fbox(x,1.25,-14.04,0.8,1.0,0.03,a);fbox(x,1.32,-14.06,0.56,0.5,0.01,b,'glow');fbox(x,0.92,-14.06,0.56,0.08,0.01,'#f6ecd6');});
  plant(17.5,-29.6,1);plant(30.3,-22.5,1.1);

  /* --- Gym --- */
  // a machine has a spot (where you are while using it, at height y; sit = seated) and an approach point ap where you step on and off
  const gymSpot=(kind,x,z,face,ap,y,sit,via)=>{const spot=addSpot({zone:'gym',x,z,y:0,face,pose:'gym',via:[...via,ap]});const M={i:GYM.length,kind,spot,ap,face,y,sit:!!sit,rig:null};GYM.push(M);return M;};
  // cardio row along the north wall, everyone facing the windows
  for(const [kind,x] of [['treadmill',-30.5],['treadmill',-28.5],['elliptical',-26.5],['elliptical',-24.5],['bike',-22.5],['bike',-20.5]]){const ap={x,z:-27.3},via=[{x:-19.5,z:-25.5},{x,z:-26}];
    if(kind==='treadmill'){
      fbox(x,0.1,-29,0.86,0.2,1.9,'#2b2d33');for(const o of [-0.4,0.4]){fbox(x+o,0.72,-29.7,0.06,1.1,0.06,'#9aa3aa');fbox(x+o,1.05,-29.3,0.05,0.05,0.8,'#9aa3aa');}
      fbox(x,1.3,-29.72,0.8,0.1,0.32,'#3a3d44');fbox(x,1.36,-29.64,0.4,0.02,0.16,'#4fd3ff','glow');
      const bt=canvasTex(textCanvas(16,16,g=>{for(let y=0;y<16;y++){g.fillStyle=y%4===0?'#3a3d44':'#1e2025';g.fillRect(0,y,16,1);}}),[1,6]);
      const belt=new THREE.Mesh(UNIT_BOX,new THREE.MeshLambertMaterial({map:bt}));belt.scale.set(0.64,0.02,1.62);belt.position.set(x,0.205,-28.95);scene.add(belt);
      gymSpot(kind,x,-28.7,Math.PI,ap,0.21,false,via).rig={belt:bt};}
    else if(kind==='elliptical'){
      fbox(x,0.07,-29,0.5,0.14,1.8,'#2b2d33');fbox(x,0.42,-29.72,0.36,0.64,0.42,'#3a3d44');fbox(x,0.95,-29.66,0.1,1.0,0.1,'#9aa3aa');fbox(x,1.45,-29.6,0.5,0.08,0.24,'#3a3d44');fbox(x,1.5,-29.52,0.3,0.02,0.12,'#6cbf4c','glow');
      const crank=new THREE.Group();crank.position.set(x,0.28,-28.85);scene.add(crank);db(crank,-0.14,0,0.2,0.14,0.04,0.36,'#18110b');db(crank,0.14,0,-0.2,0.14,0.04,0.36,'#18110b');
      const arms=[-0.26,0.26].map(o=>{const g=new THREE.Group();g.position.set(x+o,0.55,-29.4);scene.add(g);db(g,0,0.5,0,0.05,1.0,0.05,'#9aa3aa');db(g,0,1.0,0.05,0.06,0.14,0.06,'#18110b');return g;});
      gymSpot(kind,x,-28.85,Math.PI,ap,0.3,false,via).rig={crank,armR:arms[0],armL:arms[1]};}
    else{
      fbox(x,0.04,-29.1,0.5,0.08,1.3,'#2b2d33');fbox(x,0.32,-29.1,0.1,0.42,0.9,'#3a3d44');fbox(x,0.42,-29.62,0.1,0.56,0.56,'#9aa3aa');fbox(x,0.55,-28.7,0.06,0.5,0.06,'#9aa3aa');fbox(x,0.82,-28.7,0.3,0.08,0.36,'#18110b');
      fbox(x,0.85,-29.5,0.06,0.72,0.06,'#9aa3aa');fbox(x,1.2,-29.5,0.52,0.05,0.06,'#18110b');fbox(x,1.27,-29.42,0.22,0.02,0.12,'#f2b632','glow');
      const crank=new THREE.Group();crank.position.set(x,0.38,-29.1);scene.add(crank);db(crank,-0.13,0,0.1,0.04,0.04,0.22,'#3a3d44');db(crank,-0.17,0,0.2,0.1,0.03,0.14,'#18110b');db(crank,0.13,0,-0.1,0.04,0.04,0.22,'#3a3d44');db(crank,0.17,0,-0.2,0.1,0.03,0.14,'#18110b');
      gymSpot(kind,x,-28.75,Math.PI,ap,0.86,true,via).rig={crank};}
    solidRect(x-0.45,-30,x+0.45,-28.05,1.2);}
  // squat rack against the west wall: the bar sits on the hooks until someone takes it on their shoulders
  fbox(-30.3,0.03,-22.5,1.3,0.06,2.3,'#2b2d33');
  for(const z of [-23.45,-21.55]){fbox(-30.85,1.05,z,0.1,2.1,0.1,'#3a3d44');fbox(-30.05,1.05,z,0.1,2.1,0.1,'#3a3d44');fbox(-30.45,2.08,z,0.9,0.08,0.1,'#3a3d44');fbox(-29.95,1.42,z,0.14,0.06,0.12,'#e0442e');}
  const sqBar=new THREE.Group();sqBar.position.set(-30.0,1.5,-22.5);scene.add(sqBar);db(sqBar,0,0,0,0.05,0.05,2.1,'#9aa3aa');for(const o of [-0.78,0.78])db(sqBar,0,0,o,0.34,0.34,0.08,'#18110b');
  solidRect(-31,-23.6,-29.85,-21.4,1.5);
  gymSpot('squat',-30.3,-22.5,Math.PI/2,{x:-28.6,z:-22.5},0.06,false,[{x:-25.5,z:-19},{x:-28.6,z:-19.5}]).rig={bar:sqBar};
  // chest press and lat pulldown: seated facing north; the handles or bar and the top weight plate move with each rep
  for(const [kind,x] of [['chest',-26.5],['lat',-23.5]]){
    fbox(x,0.04,-21.3,0.9,0.08,1.6,'#2b2d33');fbox(x,0.48,-21.55,0.5,0.08,0.46,'#18110b');fbox(x,0.28,-21.55,0.08,0.4,0.08,'#9aa3aa');
    fbox(x,0.92,-21.2,0.5,0.72,0.1,'#18110b');fbox(x,1.15,-20.75,0.1,2.3,0.1,'#9aa3aa');fbox(x,0.62,-20.75,0.42,1.1,0.3,'#3a3d44');
    const stack=db(scene,x,1.22,-20.75,0.4,0.1,0.28,'#9aa3aa'),grip=new THREE.Group();scene.add(grip);
    if(kind==='chest'){fbox(x,1.3,-21.45,0.1,0.08,1.3,'#9aa3aa');grip.position.set(x,0.78,-22.1);for(const o of [-0.34,0.34]){db(grip,o,0,0.25,0.05,0.05,0.5,'#9aa3aa');db(grip,o,0,0,0.06,0.18,0.06,'#18110b');}}
    else{fbox(x,2.32,-21.2,0.1,0.1,1.1,'#9aa3aa');fbox(x,0.72,-21.9,0.46,0.1,0.14,'#18110b');grip.position.set(x,1.75,-21.7);db(grip,0,0,0,1.1,0.05,0.05,'#18110b');db(grip,0,0.3,0,0.02,0.6,0.02,'#c5ccd2');}
    solidRect(x-0.45,-22.4,x+0.45,-20.3,1.4);
    gymSpot(kind,x,-21.55,Math.PI,{x:x+1.0,z:-21.6},0.52,true,kind==='chest'?[{x:-25.5,z:-19}]:[]).rig={grip,stack,y0:grip.position.y,z0:grip.position.z,s0:1.22};}
  // punching bag on a stand
  fbox(-30.4,0.03,-18,1.0,0.06,1.4,'#2b2d33');fbox(-30.8,1.2,-18,0.12,2.4,0.12,'#3a3d44');fbox(-30.45,2.36,-18,0.8,0.08,0.08,'#3a3d44');
  const bag=new THREE.Group();bag.position.set(-30.05,2.32,-18);scene.add(bag);db(bag,0,-0.18,0,0.03,0.36,0.03,'#9aa3aa');db(bag,0,-0.86,0,0.44,1.0,0.44,'#c23a2b');db(bag,0,-0.37,0,0.46,0.06,0.46,'#18110b');
  solidRect(-30.9,-18.5,-29.85,-17.5,2);
  gymSpot('bag',-28.95,-18,-Math.PI/2,{x:-28.5,z:-18},0,false,[{x:-25.5,z:-19}]).rig={bag,ang:0};
  // dumbbells: a rack and a wall mirror; two standing spots in front of it
  fbox(-27,1.15,-14.05,4.2,1.7,0.03,'#bcd9e6');
  fbox(-27,0.36,-15.4,2.4,0.05,0.5,'#2b2d33');fbox(-27,0.72,-15.45,2.4,0.05,0.4,'#2b2d33');for(const o of [-1.15,1.15])fbox(-27+o,0.38,-15.4,0.06,0.76,0.5,'#3a3d44');
  for(let k=0;k<6;k++){const x=-28+k*0.4,w=0.1+k*0.015;fbox(x,0.44,-15.4,0.3,0.03,0.03,'#9aa3aa');fbox(x,0.8,-15.45,0.26,0.03,0.03,'#9aa3aa');for(const o of [-0.12,0.12]){fbox(x+o,0.44,-15.4,0.05,w,w,'#18110b');fbox(x+o*0.85,0.8,-15.45,0.05,w*0.8,w*0.8,'#18110b');}}
  solidRect(-28.2,-15.7,-25.8,-15.1,0.8);
  for(const x of [-28.1,-25.9])gymSpot('dumbbell',x,-16.6,0,{x,z:-16.6},0,false,[{x,z:-18.5}]);
  // a sofa to recover on, a towel table and a water cooler (E for a water bottle)
  sofa(-21.5,-15.55,Math.PI,'#2f6fc2','#1f4f8f',[],'gym');
  fbox(-23.6,0.25,-15.5,0.6,0.5,0.6,'#8c6234');fbox(-23.6,0.55,-15.5,0.42,0.1,0.32,'#f4f1ea');fbox(-23.6,0.65,-15.5,0.42,0.1,0.32,'#4fd3ff');solidRect(-23.9,-15.8,-23.3,-15.2,0.7);
  fbox(GYM_COOLER.x,0.5,GYM_COOLER.z,0.4,1.0,0.4,'#e8eef0');fbox(GYM_COOLER.x,1.2,GYM_COOLER.z,0.3,0.4,0.3,'#8fd0f5','glass');fbox(GYM_COOLER.x,0.75,GYM_COOLER.z-0.21,0.08,0.06,0.04,'#2f6fc2');solidRect(GYM_COOLER.x-0.3,GYM_COOLER.z-0.3,GYM_COOLER.x+0.3,GYM_COOLER.z+0.3,1.4);

  /* --- Playground --- */
  // chain-link fence (the hedge closes the east side); the gate is where the path comes in from the west
  const fence=(x0,z0,x1,z1)=>{const len=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(len/2.3)),rot=x0===x1?Math.PI/2:0;fbox((x0+x1)/2,1.1,(z0+z1)/2,len,2.2,0.04,'#5a6068','glass',rot);fbox((x0+x1)/2,2.2,(z0+z1)/2,len,0.06,0.06,'#3a3d44','noise',rot);
    for(let i=0;i<=n;i++){const f=i/n;fbox(x0+(x1-x0)*f,1.1,z0+(z1-z0)*f,0.08,2.2,0.08,'#3a3d44');}};
  fence(22.5,8.5,45,8.5);fence(22.5,11,22.5,37.5);fence(22.5,37.5,45,37.5);solidRect(22,8,45,9,2.2);solidRect(22,11,23,38,2.2);solidRect(22,37,45,38,2.2);
  fbox(22.5,1.3,8.9,0.14,2.6,0.14,'#3a3d44');fbox(22.5,1.3,11.05,0.14,2.6,0.14,'#3a3d44');fbox(22.5,2.62,10,0.14,0.08,2.3,'#3a3d44');
  // court lines, nets (solid, so you walk round them through the gap between the courts) and a scoreboard beside each net, above head height
  const ln=(x0,z0,x1,z1)=>fbox((x0+x1)/2,0.012,(z0+z1)/2,Math.abs(x1-x0)+0.07,0.02,Math.abs(z1-z0)+0.07,'#f4f1ea');
  ln(24,13.5,32,13.5);ln(24,31.5,32,31.5);ln(24,13.5,24,31.5);ln(32,13.5,32,31.5);ln(24,17.65,32,17.65);ln(24,27.35,32,27.35);ln(28,17.65,28,27.35);ln(28,13.5,28,13.85);ln(28,31.15,28,31.5);
  ln(37,14,43,14);ln(37,27,43,27);ln(37,14,37,27);ln(43,14,43,27);ln(37,18.58,43,18.58);ln(37,22.42,43,22.42);ln(40,14,40,18.58);ln(40,22.42,40,27);
  for(const x of [23.4,32.6])fbox(x,0.55,22.5,0.1,1.1,0.1,'#2b2d33');fbox(28,0.5,22.5,9.2,0.85,0.03,'#20242a','glass');fbox(28,0.95,22.5,9.2,0.06,0.05,'#f4f1ea');solidRect(23,22,33,23,1.0);
  for(const x of [36.4,43.6])fbox(x,0.8,20.5,0.1,1.6,0.1,'#2b2d33');fbox(40,1.2,20.5,7.2,0.7,0.03,'#20242a','glass');fbox(40,1.55,20.5,7.2,0.05,0.05,'#f4f1ea');solidRect(36,20,45,21,1.6);
  for(const C of COURTS){const fx=Math.sin(C.brot);fbox(C.bx-fx*0.05,2.9,C.net,3.4,1.6,0.08,'#1e2025','noise',C.brot);const canvas=textCanvas(256,112,g=>{g.fillStyle='#16301e';g.fillRect(0,0,256,112);},2),tex=textTex(canvas);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.4),new THREE.MeshBasicMaterial({map:tex}));m.position.set(C.bx,2.9,C.net);m.rotation.y=C.brot;scene.add(m);C.board={canvas,tex};}
  // three-tier stands along the south fence: walk up the steps and sit on the edge of a tier to watch
  const tierCol=['#a9b0b6','#9aa3aa','#b5bcc2'],seatCol=['#2f6fc2','#e0442e','#f2b632'];
  for(let k=1;k<=3;k++){const H=k*0.5,z0=33+k;fbox(34,H/2,z0+0.5,22,H,1,tierCol[k-1]);fbox(34,H+0.03,z0+0.28,22,0.06,0.44,seatCol[k-1]);for(let cx=23;cx<=44;cx++)raiseTop(cx,z0,H);
    for(const x of [24.5,27,29.5,32,37.5,40,42.5]){const ap={x,z:z0+0.62};addSpot({zone:'play',x,z:z0+0.3,y:H,face:Math.PI,pose:'sit',approach:ap,via:[{x:34.5,z:9.5},{x:34.5,z:33.4},{x,z:33.4},ap]});}}
  for(const x of [23.05,44.95])fbox(x,1.25,35.5,0.06,0.06,3,'#3a3d44');fbox(34,2.0,36.95,22,0.06,0.06,'#3a3d44');

  /* --- lights: on at night, off by day (see Day and night) --- */
  for(const [x,z] of [[-10.5,-28],[-2.5,-28],[2.5,-28],[10.5,-28],[-6,-36.4],[6,-36.4]])addLamp('floor',x,z,{zone:'desks'});
  for(const [x,z] of [[19.5,-3.5],[19.5,3.5],[29.5,-6.5],[29.5,6.5]])addLamp('floor',x,z,{zone:'pantry'});
  addLamp('wall',-20.12,-4.5,{zone:'restroom',cool:true,px:-21.2});addLamp('wall',-20.12,3.5,{zone:'restroom',cool:true,px:-21.2});
  addLamp('wall',-26.5,5.88,{zone:'restroom',cool:true,pz:5.0});addLamp('wall',-24.4,5.88,{zone:'restroom',cool:true,pz:5.0});// shower lights
  for(const [x,z,px,pz] of [[-2.6,-15.88,-2.6,-15],[2.6,-15.88,2.6,-15],[17.88,-2.6,17,-2.6],[17.88,2.6,17,2.6],[-18.88,-2.6,-18,-2.6],[-18.88,2.6,-18,2.6]])addLamp('wall',x,z,{zone:'door',px,pz});
  for(const [x,z] of [[5.3,-5.3],[-5.3,-5.3],[-5.3,5.3],[6.2,2.9]])addLamp('street',x,z,{zone:'plaza'});
  for(const [x,z] of [[2.6,-8],[-2.6,-13],[9,2.6],[13.5,-2.6],[-9,-2.6],[-13.5,2.6],[2.6,7.5],[-2.6,12.5]])addLamp('street',x,z,{zone:'path'});
  for(const [x,z] of [[-4,18.3],[4,18.3],[-16,22.4],[16,22.4]])addLamp('street',x,z,{zone:'lake'});
  addLamp('lantern',-0.9,31.4,{zone:'lake'});addLamp('lantern',0.9,31.4,{zone:'lake'});
  for(const [x,z] of [[24.0,-29.6],[29.6,-15.4],[17.5,-15.4]])addLamp('floor',x,z,{zone:'playroom'});
  for(const [x,z] of [[-18.4,-29.6],[-30.6,-15.4],[-18.4,-25.2]])addLamp('floor',x,z,{zone:'gym'});
  addLamp('wall',-15.88,-23.6,{zone:'door',px:-15,pz:-23.6});addLamp('wall',-15.88,-18.4,{zone:'door',px:-15,pz:-18.4});
  for(const [x,z] of [[-17.4,-6],[-17.4,-12.5]])addLamp('street',x,z,{zone:'path'});
  for(const [x,z] of [[22.6,15],[22.6,29],[33.4,12],[33.4,31.5],[35.6,12],[35.6,31.5],[44.5,12],[44.5,30.5]])addLamp('street',x,z,{zone:'play'});// floodlights
  for(const [x,z] of [[8,8.4],[15,8.4]])addLamp('street',x,z,{zone:'path'});
  addLamp('wall',15.88,-23.6,{zone:'door',px:15,pz:-23.6});addLamp('wall',15.88,-18.4,{zone:'door',px:15,pz:-18.4});
  for(const [x,z] of [[16.6,-6],[16.6,-12.5]])addLamp('street',x,z,{zone:'path'});

  /* --- signs --- */
  sign(3.4,-14.2,0,'Work Desks','Pods · Whiteboard');
  sign(15.6,3.3,-Math.PI/2,'Pantry','Coffee · Snacks');
  sign(-15.6,3.3,Math.PI/2,'Restroom','Stalls · Showers');
  sign(3.4,14.5,Math.PI,'Lakeside','Benches · Dock');
  sign(12.6,-4.6,Math.PI/2,'Playroom','Arcade · Sofas');
  sign(-12.6,-4.6,-Math.PI/2,'Gym','Cardio · Weights');
  sign(20.6,11.8,-Math.PI/2,'Playground','Tennis · Badminton');
  /* --- Eco campus: Green Loop, solar grove, wind row, mobility hub, kitchen garden, meadow, orchard, living walls, info boards and wayfinding.
     Decoration only: everything is fbox/meshes plus solidRect collision; the only new seats are plain benches (zone plaza, outside the routing check). --- */
  const ECO_GREEN='#3f7d34',TIMBER='#5b3a1e';
  // info board on two posts facing rot: a green header and a few short lines of facts
  const info=(x,z,rot,title,lines)=>{const fx=Math.sin(rot),fz=Math.cos(rot),ux=Math.cos(rot),uz=-Math.sin(rot);
    for(const s of [-0.62,0.62])fbox(x+ux*s-fx*0.13,0.75,z+uz*s-fz*0.13,0.1,1.5,0.1,TIMBER);
    fbox(x-fx*0.05,1.42,z-fz*0.05,1.56,1.04,0.06,TIMBER,'noise',rot);fbox(x-fx*0.05,1.98,z-fz*0.05,1.66,0.08,0.26,'#4f9a33','noise',rot);
    const al=Math.abs(ux)>0.7;solidRect(x-(al?0.5:0.3),z-(al?0.3:0.5),x+(al?0.5:0.3),z+(al?0.3:0.5),2);
    const m=panel(240,160,1.48,0.98,(g,w,h)=>{g.fillStyle='#f3ead2';g.fillRect(0,0,w,h);g.fillStyle=ECO_GREEN;g.fillRect(0,0,w,38);g.fillStyle='#8fd16a';g.fillRect(0,38,w,3);leafIcon(g,18,19,10);
      g.textAlign='left';g.fillStyle='#ffffff';g.font='700 19px '+FONT_UI;g.fillText(title,34,26);
      g.fillStyle='#2a1a0c';g.font='400 14px '+FONT_UI;lines.forEach((l,i)=>g.fillText(l,12,61+i*20));
      g.fillStyle='#7a6a52';g.font='400 10px '+FONT_UI;g.fillText('Golden Apple Green Campus',12,h-7);});
    m.position.set(x,1.42,z);m.rotation.y=rot;scene.add(m);};
  // fingerpost: arms [angle,text], angle = the way the arm points (0 south, PI north, PI/2 east, -PI/2 west); text reads from both sides
  const finger=(x,z,arms)=>{fbox(x,1.35,z,0.16,2.7,0.16,TIMBER);fbox(x,2.74,z,0.3,0.1,0.3,'#4f9a33');solidRect(x-0.3,z-0.3,x+0.3,z+0.3,2.7);
    arms.forEach(([a,txt],i)=>{const y=2.46-i*0.3,dx=Math.sin(a),dz=Math.cos(a),r=a-Math.PI/2,cx=x+dx*0.66,cz=z+dz*0.66;
      fbox(cx,y,cz,1.12,0.26,0.05,'#f3ead2','noise',r);
      for(const back of [0,1]){const m=panel(176,40,1.1,0.25,(g,w,h)=>{g.fillStyle=ECO_GREEN;g.fillRect(0,0,w,h);g.fillStyle='#ffffff';const tip=back?6:w-6,base=back?22:w-22;
          g.beginPath();g.moveTo(tip,h/2);g.lineTo(base,7);g.lineTo(base,h-7);g.closePath();g.fill();g.textAlign='center';g.font='700 15px '+FONT_UI;g.fillText(txt,back?w/2+9:w/2-9,h/2+5);});
        const n=back?-1:1;m.position.set(cx+Math.sin(r)*n*0.03,y,cz+Math.cos(r)*n*0.03);m.rotation.y=r+(back?Math.PI:0);scene.add(m);}});};
  // compost / recycling / landfill bins, and a water refill station (both face south)
  const recycle=(x,z)=>{[['#3f8f3f','#2e6a24','#8fd16a'],['#2f6fc2','#24589e','#8fc4ff'],['#5a5f6a','#45484f','#c5ccd2']].forEach(([c,lid,l],i)=>{const bx=x+(i-1)*0.44;
    fbox(bx,0.4,z,0.4,0.8,0.42,c);fbox(bx,0.82,z,0.42,0.05,0.44,lid);fbox(bx,0.6,z+0.215,0.22,0.06,0.01,l,'glow');});solidRect(x-0.66,z-0.22,x+0.66,z+0.22,1);};
  const refill=(x,z)=>{fbox(x,0.55,z,0.42,1.1,0.32,'#2f6fc2');fbox(x,1.12,z,0.46,0.06,0.36,'#c5ccd2');fbox(x,0.8,z+0.165,0.24,0.3,0.01,'#8fd0f5','glow');fbox(x,0.62,z+0.2,0.08,0.04,0.08,'#c5ccd2');solidRect(x-0.25,z-0.2,x+0.25,z+0.2,1.2);};
  const planter=(x,z,w,d,flower)=>{fbox(x,0.25,z,w,0.5,d,'#8a5a33');fbox(x,0.52,z,w-0.08,0.04,d-0.08,'#5c3f24');
    for(let i=0,n=Math.round(w*d*3);i<n;i++){const px=x+((i*0.618)%1-0.5)*(w-0.2),pz=z+((i*0.382+0.19)%1-0.5)*(d-0.2);fbox(px,0.66,pz,0.16,0.24,0.16,i%3?'#3f8f2f':'#5aad42');if(i%2)fbox(px,0.81,pz,0.1,0.06,0.1,flower);}
    solidRect(x-w/2,z-d/2,x+w/2,z+d/2,0.9);};
  // living wall: a planted panel on the outside face of a building wall (x0===x1 runs north-south)
  const living=(x0,z0,x1,z1)=>{const L=Math.hypot(x1-x0,z1-z0),rot=x0===x1?Math.PI/2:0,cols=['#5aad42','#2e6a24','#6cbf4c','#4f9a33','#f2b632','#ff8fb3','#9c6bd6'];
    fbox((x0+x1)/2,1.0,(z0+z1)/2,L,1.9,0.12,'#3f8f2f','noise',rot);
    for(let i=0;i<L*5;i++){const f=(i*0.618)%1,y=0.18+((i*0.382)%1)*1.64;fbox(x0+(x1-x0)*f,y,z0+(z1-z0)*f,0.24,0.2,0.24,cols[i%7]);}};
  const pvCanvas=(()=>{const c=document.createElement('canvas');c.width=32;c.height=16;const g=c.getContext('2d');g.fillStyle='#c5ccd2';g.fillRect(0,0,32,16);
    for(let y=0;y<4;y++)for(let x=0;x<8;x++){g.fillStyle=(x+y)%2?'#1d3557':'#23406a';g.fillRect(x*4+0.5,y*4+0.5,3,3);}return c;})();
  const pvMat=new THREE.MeshLambertMaterial({map:canvasTex(pvCanvas)}),pvRoofMat=new THREE.MeshLambertMaterial({map:canvasTex(pvCanvas,[1,4])});
  // a solar array: one panel tilted about x (north edge up), so it faces the sun in the south
  const solar=(x,z,y,w,d,tilt,mat)=>{const g=grp(scene,x,y,z);g.rotation.x=tilt;const m=new THREE.Mesh(UNIT_BOX,mat||pvMat);m.scale.set(w,0.06,d);m.castShadow=SHADOWS;m.receiveShadow=true;g.add(m);};

  // Green Loop trailhead (north), with benches looking out over the loop and planters along the desk building
  info(0,-40.4,Math.PI,'Green Loop',['A 300 m walking and jogging','trail round the whole campus','Solar lights come on at dusk','Hold Shift to run']);
  bench(-7,-39.7,Math.PI,'#8a5a33','plaza');bench(7,-39.7,Math.PI,'#8a5a33','plaza');
  planter(-12,-39.6,2.2,0.8,'#9c6bd6');planter(-3,-39.6,2.0,0.8,'#f2b632');planter(3,-39.6,2.0,0.8,'#ff8fb3');planter(12,-39.6,2.2,0.8,'#9c6bd6');
  planter(-8.2,-15.6,9.6,0.7,'#ff8fb3');planter(8.4,-15.6,9.2,0.7,'#f2b632');

  // Solar Grove: two rows of tilted arrays over a wildflower meadow, kept short by two sheep
  for(const z of [-38.9,-35.4])for(const x of [20.2,23.8,27.4,31,34.6]){
    solar(x,z,1.05,3.2,1.7,0.42);for(const s of [-1.3,1.3]){fbox(x+s,0.36,z+0.62,0.08,0.72,0.08,'#9aa3aa');fbox(x+s,0.66,z-0.62,0.08,1.32,0.08,'#9aa3aa');}
    solidRect(x-1.6,z-0.85,x+1.6,z+0.85,1.5);}
  for(const [x,z,r] of [[25.6,-37.4,0],[32.6,-37.5,Math.PI]]){const fx=Math.cos(r);fbox(x,0.6,z,0.9,0.55,0.55,'#f4f1ea','noise',r);fbox(x+fx*0.5,0.72,z,0.3,0.3,0.3,'#2a2a2a','noise',r);
    for(const [a,b] of [[-0.3,-0.18],[-0.3,0.18],[0.3,-0.18],[0.3,0.18]])fbox(x+a,0.17,z+b,0.08,0.34,0.08,'#2a2a2a');solidRect(x-0.45,z-0.3,x+0.45,z+0.3,1);}
  info(27.6,-40.6,Math.PI,'Solar Grove',['10 tilted arrays face the sun','Wildflowers grow underneath','Two sheep keep the grass short','Powers the campus by day']);

  // Wind Row: three small turbines (rotors turn in frame) and two battery stores between them
  for(const [z,ph] of [[-28,0],[-20.5,1.1],[-13,2.3]]){const x=36.5;
    fbox(x,0.15,z,1.1,0.3,1.1,'#c5ccd2');fbox(x,3.6,z,0.34,7.2,0.34,'#eef2f4');fbox(x,7.25,z,1.0,0.42,0.46,'#e8eef0');fbox(x-0.55,7.25,z,0.14,0.2,0.2,'#c5ccd2');
    const R=grp(scene,x-0.66,7.25,z);R.rotation.x=ph;R.userData.w=0.9+ph*0.15;db(R,0,0,0,0.16,0.3,0.3,'#d9e2e6');
    for(let k=0;k<3;k++){const B=grp(R,0,0,0);B.rotation.x=k*Math.PI*2/3;db(B,0,1.35,0,0.05,2.5,0.26,'#f4f7f8');db(B,0,2.5,0,0.05,0.3,0.14,'#e0442e');}
    ECO_SPIN.push(R);solidRect(x-0.5,z-0.5,x+0.5,z+0.5,3);}
  for(const z of [-24.25,-16.75]){fbox(35,1.1,z,1.6,2.2,3.0,'#2f7f4a');fbox(35,1.6,z,1.62,0.3,3.02,'#f4f1ea');for(const o of [-0.9,0,0.9])fbox(35.81,0.9,z+o,0.02,0.1,0.1,'#6cff8a','glow');solidRect(34.2,z-1.5,35.8,z+1.5,2.2);}
  info(38.9,-24.25,Math.PI/2,'Wind Row',['3 small wind turbines','Battery stores save sunshine','for the 80 campus lamps,','on at dusk and off at dawn']);

  // Mobility Hub: a solar carport over the bike racks, two EV bays with chargers and the electric campus shuttle
  for(const z of [-7.5,-1,5])for(const x of [35,38.6]){fbox(x,1.4,z,0.16,2.8,0.16,'#9aa3aa');solidRect(x-0.15,z-0.15,x+0.15,z+0.15,2.8);}
  solar(36.8,-1.25,2.86,4.4,13.6,0,pvRoofMat);fbox(36.8,2.76,-1.25,4.5,0.08,13.7,'#c5ccd2');
  fbox(36.8,0.05,-1,0.1,0.1,12,'#9aa3aa');
  for(let i=0;i<11;i++){const bz=-6.5+i*1.1,bx=36.8,c=['#e0442e','#2f6fc2','#f2b632','#3f8f3f','#6d4bb5'][i%5];
    for(const s of [-0.42,0.42])fbox(bx+s,0.3,bz,0.56,0.56,0.05,'#2b2d33');fbox(bx,0.5,bz,0.8,0.06,0.05,c);fbox(bx-0.12,0.42,bz,0.06,0.3,0.05,c);
    fbox(bx-0.25,0.72,bz,0.22,0.05,0.1,'#2b2d33');fbox(bx+0.32,0.78,bz,0.05,0.05,0.42,'#2b2d33');}
  solidRect(36.2,-7,37.4,5,1);
  for(const [cz,c] of [[-6.6,'#f4f1ea'],[-3.4,'#2f6fc2']]){const cx=43.4;fbox(cx,0.011,cz,2.4,0.01,1.5,'#3f8f3f');fbox(cx,0.015,cz-0.8,2.5,0.02,0.06,'#f4f1ea');
    fbox(cx,0.5,cz,2.0,0.5,1.15,c);fbox(cx-0.1,0.98,cz,1.1,0.46,1.05,'#9cc8ec');fbox(cx-0.1,1.23,cz,1.12,0.05,1.07,c);
    for(const a of [-0.62,0.62])for(const b of [-0.6,0.6])fbox(cx+a,0.22,cz+b,0.44,0.44,0.08,'#1c1c24');fbox(cx-1.01,0.55,cz,0.02,0.1,0.9,'#ffe9b0','glow');
    fbox(44.72,0.6,cz,0.2,1.2,0.3,'#e8eef0');fbox(44.61,0.95,cz,0.02,0.16,0.16,'#6cff8a','glow');solidRect(cx-1,cz-0.6,cx+1,cz+0.6,1.4);solidRect(44.6,cz-0.15,44.85,cz+0.15,1.2);}
  fbox(43.3,1.25,2.6,1.9,1.9,5.0,'#f4f1ea');fbox(43.3,0.55,2.6,1.92,0.5,5.02,'#3f8f3f');fbox(43.3,1.55,2.6,1.94,0.6,4.6,'#9cc8ec');
  fbox(43.3,2.24,2.6,1.6,0.05,3.6,'#1d3557');fbox(43.3,1.95,5.11,1.4,0.25,0.02,'#f2b632','glow');for(const a of [-0.8,0.8])for(const b of [0.9,4.3])fbox(43.3+a,0.25,b,0.1,0.5,0.5,'#1c1c24');
  solidRect(42.35,0.1,44.25,5.1,2.4);
  info(38.9,-8.6,Math.PI/2,'Mobility Hub',['Solar carport: 11 bike racks','2 EV bays, solar charged','Electric campus shuttle','Walk, cycle or share a ride']);
  planter(34.4,-0.5,0.7,15,'#f2b632');

  // Kitchen Garden: a greenhouse, raised beds, compost bays, a tool shed with a green roof and rain barrels
  {const gx=-35.5,gz=-36.5;for(const [x,z,w,d] of [[gx,-39.6,4.6,0.06],[gx,-33.4,4.6,0.06],[-37.8,gz,0.06,6.2],[-33.2,gz,0.06,6.2]])fbox(x,1.1,z,w,2.2,d,'#cfeeff','glass');
    for(const x of [-37.8,-35.5,-33.2])for(const z of [-39.6,-36.5,-33.4])fbox(x,1.15,z,0.08,2.3,0.08,'#f4f7f8');
    fbox(gx,2.28,gz,4.8,0.06,6.4,'#cfeeff','glass');fbox(gx,2.46,gz,2.4,0.06,6.4,'#cfeeff','glass');fbox(gx,2.56,gz,0.12,0.12,6.4,'#f4f7f8');
    for(const x of [-36.9,-34.1]){fbox(x,0.7,gz,1.0,0.08,5.2,'#8a5a33');fbox(x,0.35,gz,0.08,0.7,5.0,'#8a5a33');for(let i=0;i<10;i++)fbox(x+((i%2)-0.5)*0.5,0.82,gz-2.2+i*0.48,0.16,0.16,0.16,i%3?'#5aad42':'#3f8f2f');}
    solidRect(-37.8,-39.6,-33.2,-33.4,2.3);}
  const crop=(k,x,z)=>{for(let i=0;i<8;i++){const px=x-1.2+(i%4)*0.8,pz=z+(i<4?-0.3:0.3);
    if(k===0)fbox(px,0.6,pz,0.3,0.18,0.3,i%2?'#7fc23a':'#5aad42');
    else if(k===1){fbox(px,0.85,pz,0.04,0.7,0.04,'#a8793f');fbox(px,0.8,pz,0.24,0.4,0.24,'#3f8f2f');fbox(px+0.08,0.78,pz+0.1,0.1,0.1,0.1,'#e0442e');fbox(px-0.08,0.92,pz-0.08,0.1,0.1,0.1,'#e0442e');}
    else if(k===2){fbox(px,0.54,pz,0.1,0.06,0.1,'#ef7f2a');fbox(px,0.7,pz,0.18,0.26,0.06,'#6cbf4c');}
    else if(k===3){if(i%2)continue;fbox(px,1.1,pz,0.06,1.2,0.06,'#4f9a33');fbox(px,1.75,pz+0.04,0.42,0.42,0.06,'#f2b632');fbox(px,1.75,pz+0.075,0.18,0.18,0.02,'#6b4a2b');}
    else if(k===4){fbox(px,0.66,pz,0.3,0.3,0.3,'#6d8f5a');fbox(px,0.86,pz,0.2,0.14,0.2,'#9c6bd6');}
    else{if(i%2){fbox(px,0.62,pz,0.42,0.3,0.42,'#ef7f2a');fbox(px,0.8,pz,0.06,0.08,0.06,'#4f9a33');}else fbox(px,0.58,pz,0.5,0.1,0.5,'#4f9a33');}}};
  {let k=0;for(const z of [-38.8,-35.6])for(const x of [-30.5,-26.5,-22.5]){fbox(x,0.25,z,3.0,0.5,1.3,'#8a5a33');fbox(x,0.51,z,2.86,0.04,1.16,'#5c3f24');crop(k++,x,z);solidRect(x-1.5,z-0.65,x+1.5,z+0.65,0.9);}}
  for(const z of [-39.4,-38.3,-37.2]){fbox(-20,0.45,z,1.0,0.9,1.0,'#8a5a33');fbox(-20,0.86,z,0.9,0.06,0.9,'#5c3f24');for(const y of [0.25,0.55])fbox(-19.49,y,z,0.02,0.06,0.9,'#6b4a2b');}
  solidRect(-20.5,-39.9,-19.5,-36.7,1);
  fbox(-20,1.05,-35.2,2.0,2.1,2.0,'#8a5a33');fbox(-20,2.2,-35.2,2.3,0.2,2.3,'#4f9a33');fbox(-20,2.34,-35.2,1.9,0.12,1.9,'#6cbf4c');fbox(-21.01,0.9,-35.2,0.02,1.7,0.8,'#5b3a1e');solidRect(-21,-36.2,-19,-34.2,2.5);
  for(const x of [-32.6,-31.6]){fbox(x,0.45,-33.5,0.6,0.9,0.6,'#2f6fc2');fbox(x,0.92,-33.5,0.64,0.05,0.64,'#24589e');solidRect(x-0.3,-33.8,x+0.3,-33.2,1);}
  info(-25.5,-40.6,Math.PI,'Kitchen Garden',['Herbs, salad and veg for the','Pantry, grown right here','Rain barrels water the beds','Compost turns scraps to soil']);

  // Wildflower Meadow: beehives, a bee hotel and bird boxes, by the living walls of the Gym and the Restroom
  for(const z of [-28.5,-27,-25.5]){fbox(-37.2,0.15,z,0.6,0.3,0.6,'#3a3a44');fbox(-37.2,0.62,z,0.56,0.64,0.56,'#f4f1ea');fbox(-37.2,0.98,z,0.64,0.08,0.64,'#f2b632');fbox(-37.2,0.4,z+0.29,0.2,0.04,0.01,'#2a1a0c');solidRect(-37.5,z-0.3,-36.9,z+0.3,1.1);}
  fbox(-35.5,0.7,-20,0.12,1.4,0.12,TIMBER);fbox(-35.5,1.6,-20,1.0,0.8,0.3,'#a8793f');fbox(-35.5,2.04,-20,1.1,0.08,0.4,'#4f9a33');
  for(let i=0;i<12;i++)fbox(-35.85+(i%4)*0.23,1.35+Math.floor(i/4)*0.24,-19.84,0.12,0.12,0.02,'#2a1a0c');solidRect(-35.8,-20.3,-35.2,-19.7,2);
  for(const z of [-8,2]){fbox(-35.5,1.1,z,0.1,2.2,0.1,TIMBER);fbox(-35.5,2.35,z,0.36,0.4,0.36,'#a8793f');fbox(-35.5,2.6,z,0.44,0.08,0.44,'#c23a2b');fbox(-35.5,2.38,z+0.185,0.1,0.1,0.01,'#2a1a0c');solidRect(-35.8,z-0.3,-35.2,z+0.3,2.2);}
  info(-38.6,-14,-Math.PI/2,'Wildflower Meadow',['Native flowers for bees and','butterflies, left long all','summer. Three hives and a','bee hotel feed the orchard']);
  living(-32.06,-31,-32.06,-13);living(-31.06,-7,-31.06,7);living(-31,7.06,-19,7.06);living(32.06,-31,32.06,-13);living(-14,-38.06,14,-38.06);

  // Heritage Orchard: four rows of apple trees either side of a trail, crates of apples, benches facing the lane
  {let n=0;for(const x of [-36.5,-33.5,-25.5,-22.5])for(const z of [14.5,18.5,22.5,26.5,30.5,34.5,38.5]){n++;
    fbox(x,0.7,z,0.28,1.4,0.28,'#6b4a2b');fbox(x,1.85,z,1.9,1.0,1.9,n%2?'#4a9c36':'#3f8f2f');fbox(x,2.5,z,1.3,0.5,1.3,'#5aad42');
    for(let k=0;k<5;k++){const a=k*1.26+n,px=x+Math.sin(a)*0.97,pz=z+Math.cos(a)*0.97;fbox(px,1.5+(k%3)*0.3,pz,0.18,0.18,0.18,(n%7===3&&k===0)?'#f2b632':'#e0442e');}
    solidRect(x-0.3,z-0.3,x+0.3,z+0.3,99);}}
  bench(-32.6,20,Math.PI/2,'#8a5a33','plaza');bench(-27.4,20,-Math.PI/2,'#8a5a33','plaza');bench(-32.6,32,Math.PI/2,'#8a5a33','plaza');bench(-27.4,32,-Math.PI/2,'#8a5a33','plaza');
  for(const z of [12.4,13.2]){fbox(-27.4,0.2,z,0.6,0.4,0.6,'#a8793f');for(let k=0;k<4;k++)fbox(-27.55+(k%2)*0.3,0.44,z-0.15+Math.floor(k/2)*0.3,0.2,0.18,0.2,'#e0442e');}solidRect(-27.7,12.1,-27.1,13.5,0.9);
  info(-33.2,11.6,Math.PI,'Heritage Orchard',['28 apple trees in four rows','Give up to 10 apples a day','Receive more than 10 and','you become a Golden Apple']);

  // Lake: two floating wetlands that clean the water
  for(const [x,z,w,d] of [[-11.5,35.5,2.4,1.4],[10.5,25.5,2.0,1.2]]){fbox(x,-0.16,z,w,0.1,d,'#6b4a2b');
    for(let i=0;i<9;i++){const px=x+((i*0.37)%1-0.5)*(w-0.3),pz=z+((i*0.61)%1-0.5)*(d-0.3);fbox(px,0.12,pz,0.1,0.5+(i%3)*0.12,0.1,'#5f8f3a');if(i%3===0)fbox(px,0.42+(i%3)*0.12,pz,0.16,0.1,0.16,'#f4f1ea');}}

  // what each place offers, next to its sign (facts from the game itself)
  info(-3.7,-14.4,0,'Work Desks',['24 desks in 6 pods, one each','Your desk is the gold square','on the minimap','Press E at your desk to sit']);
  info(16.4,4.8,-Math.PI/2,'Pantry',['The menu changes every 5 min','E take · F eat · Q put down','Fresh coffee at the machine','Veg, non-veg, fruit, drinks']);
  info(-16.4,4.8,Math.PI/2,'Restroom',['3 stalls and 2 showers','An Occupied sign on each door','Wash your hands at the sinks','after every visit']);
  info(-12.6,-7.2,-Math.PI/2,'Gym',['6 cardio machines and a bag','5 strength spots, sets of 10','E start · W/S level · E stop','Water cooler by the door']);
  info(12.6,-7.2,Math.PI/2,'Playroom',['5 arcade cabinets in a circle','10 Golden Reels slot machines','Player 2 can join in a room','2 sofas: the best indoor rest']);
  info(-6.2,16.4,Math.PI/2,'Lakeside',['8 fish species, some only at','night. Take a rod from the','stand, cast, wait for the bite','and reel. K keep · R release']);
  info(20.6,14.2,-Math.PI/2,'Playground',['Tennis and badminton courts','E to challenge, E to accept','First to 10, win by 2','Q leaves the match']);
  info(-7.4,3.6,Math.PI/2,'Golden Apple Tree',['Give up to 10 apples a day','More than 10 received makes','you a Golden Apple. Red on','the tree: given today. Gold:','Golden Apple members']);

  // welcome arch over the lake path by the spawn point
  for(const x of [-3.1,3.1]){fbox(x,1.75,11.4,0.3,3.5,0.3,TIMBER);fbox(x,0.15,11.4,0.6,0.3,0.6,'#9aa3aa');}solidRect(-3.3,11.2,-2.9,11.6,3.5);solidRect(2.9,11.2,3.3,11.6,3.5);
  fbox(0,3.55,11.4,6.8,0.22,0.36,TIMBER);fbox(0,3.72,11.4,7.0,0.12,0.5,'#4f9a33');fbox(0,3.1,11.4,4.7,0.7,0.12,ECO_GREEN);
  for(const back of [0,1]){const m=panel(320,48,4.5,0.66,(g,w,h)=>{g.fillStyle=ECO_GREEN;g.fillRect(0,0,w,h);g.fillStyle='#8fd16a';g.fillRect(0,h-3,w,3);leafIcon(g,22,h/2,12);leafIcon(g,w-22,h/2,12);
      g.fillStyle='#ffffff';g.textAlign='center';g.font='700 26px '+FONT_UI;g.fillText('GOLDEN APPLE CAMPUS',w/2,h/2+9);});
    m.position.set(0,3.1,11.4+(back?-0.07:0.07));m.rotation.y=back?Math.PI:0;scene.add(m);}

  // campus map with a numbered legend and "you are here", drawn from the finished layout (redrawn with the signs once fonts load)
  const MAPC={grass:'#5aa83a',path:'#9b958c',plaza:'#b3ada3',oak:'#c8a36b',pantry:'#d9cfa9',tile:'#dfe8ec',sand:'#e3d29a',water:'#3b8fd6',dock:'#a8793f',hedge:'#24561c',carpet:'#5a3470',rubber:'#3a3d44',court:'#2f6fa8',court2:'#3f9a5a',turf:'#3d6b35',trail:'#d8b37a',paver:'#a3ae95',meadow:'#7cbf4c'};
  const LEGEND=[['Work Desks',0,-27],['Pantry',25.5,-0.5],['Restroom',-25.5,-0.5],['Playroom',23.5,-22.5],['Gym',-24.5,-22.5],['Playground',33,23],['Lakeside',0,31],['Plaza',0,0],
    ['Solar Grove',27.5,-37],['Wind Row',36.5,-21],['Mobility Hub',39,-1],['Kitchen Garden',-27,-37],['Wildflower Meadow',-36,-12],['Heritage Orchard',-30,25],['Green Loop',-40.5,-20]];
  const MX=-5.6,MZ=12.4;for(const x of [MX-1.2,MX+1.2])fbox(x,1.1,MZ+0.15,0.12,2.2,0.12,TIMBER);fbox(MX,1.5,MZ+0.05,2.8,1.7,0.08,TIMBER);fbox(MX,2.4,MZ+0.05,2.9,0.08,0.3,'#4f9a33');solidRect(MX-1.3,MZ-0.2,MX+1.3,MZ+0.2,2.2);
  const mapM=panel(360,216,2.6,1.56,(g,w,h)=>{g.fillStyle='#f3ead2';g.fillRect(0,0,w,h);g.fillStyle=ECO_GREEN;g.fillRect(0,0,w,30);leafIcon(g,16,15,9);
    g.textAlign='left';g.fillStyle='#ffffff';g.font='700 18px '+FONT_UI;g.fillText('CAMPUS MAP',30,22);g.textAlign='right';g.font='400 12px '+FONT_UI;g.fillText('Golden Apple Green Campus',w-10,20);
    const ox=8,oy=36,S=1.8,at=(x,z)=>[ox+(x+HALF)*S,oy+(z+HALF)*S];
    for(let cx=-HALF;cx<HALF;cx++)for(let cz=-HALF;cz<HALF;cz++){const t=getTile(cx,cz),tp=topMap[idx(cx,cz)];g.fillStyle=tp>=99?'#2e6a24':(tp>=2&&t!=='hedge')?'#efe8da':(MAPC[t]||'#5aa83a');g.fillRect(ox+(cx+HALF)*S,oy+(cz+HALF)*S,S+0.2,S+0.2);}
    g.textAlign='center';g.font='700 9px '+FONT_UI;LEGEND.forEach(([n,x,z],i)=>{const [px,py]=at(x,z);g.fillStyle='#1d2a17';g.fillRect(px-6,py-6,12,12);g.fillStyle='#ffffff';g.fillText(String(i+1),px,py+3.5);});
    const [yx,yy]=at(MX,MZ);g.fillStyle='#e0442e';g.fillRect(yx-4,yy-4,8,8);g.strokeStyle='#ffffff';g.lineWidth=1.5;g.strokeRect(yx-4,yy-4,8,8);
    g.textAlign='left';g.font='400 10.5px '+FONT_UI;LEGEND.forEach(([n],i)=>{g.fillStyle='#1d2a17';g.fillText((i+1)+'  '+n,192,48+i*10.6);});
    g.fillStyle='#e0442e';g.fillRect(192,206,8,8);g.fillStyle='#1d2a17';g.font='700 10.5px '+FONT_UI;g.fillText('You are here',204,214);});
  mapM.position.set(MX,1.5,MZ);mapM.rotation.y=Math.PI;scene.add(mapM);

  // wayfinding, recycling and water refill points along the main paths
  finger(-3.6,7.6,[[-Math.PI/2,'Orchard'],[Math.PI/2,'Playground'],[Math.PI,'Plaza'],[0,'Lakeside']]);
  finger(16.8,-40.6,[[Math.PI/2,'Solar Grove'],[-Math.PI/2,'Green Loop'],[0,'Playroom']]);
  finger(-17.2,-40.6,[[-Math.PI/2,'Garden'],[Math.PI/2,'Green Loop'],[0,'Gym']]);
  finger(-38.6,11.6,[[Math.PI,'Meadow'],[Math.PI/2,'Plaza'],[0,'Orchard']]);
  finger(38.9,-11.4,[[0,'Mobility Hub'],[Math.PI,'Solar Grove']]);
  for(const [x,z] of [[-3.4,-10.6],[11.4,3],[-11.4,3],[3.9,16.6],[13,11.6]])recycle(x,z);
  refill(17.2,11.6);refill(-13.6,-8.6);

  // solar bollards along the Green Loop
  for(const [x,z] of [[-36.5,-40.85],[-21.5,-40.85],[-10.5,-40.85],[10.5,-40.85],[22.5,-40.85],[33.5,-40.85],[-38.85,-28],[-38.85,-2],[-38.85,18],[-38.85,30],
    [-34,40.15],[-12,40.15],[12,40.15],[30,40.15],[39,-33],[39,-17],[39,-4],[39,3.5]])addLamp('bollard',x,z,{zone:'path'});

  // rain garden: ornamental grasses round the plaza edge (no collision)
  for(let i=0;i<72;i++){const a=i*Math.PI*2/72,r=7.1+((i*13)%5)*0.28,x=Math.sin(a)*r,z=Math.cos(a)*r,cx=Math.floor(x),cz=Math.floor(z);
    if(getTile(cx,cz)!=='grass'||topMap[idx(cx,cz)]>0||LAMPS.some(l=>Math.hypot(l.x-x,l.z-z)<0.9))continue;fbox(x,0.18,z,0.3,0.36,0.3,i%4?'#7fae4a':'#a7c957');if(i%3===0)fbox(x,0.42,z,0.14,0.1,0.14,'#9c6bd6');}
}

const BOARD_POS=new THREE.Vector3();
let TREE_APPLE_SLOTS=[];
function buildTrees(){
  const leaves=tree(0,0,4,true);
  TREE_APPLE_SLOTS=leaves.filter(l=>l[3]).map(l=>{
    const len=Math.hypot(l[0],l[2])||1;return[l[0]+l[0]/len*0.56,l[1]-0.15-WR()*0.3,l[2]+l[2]/len*0.56];
  });
  for(let i=TREE_APPLE_SLOTS.length-1;i>0;i--){const j=Math.floor(WR()*(i+1));[TREE_APPLE_SLOTS[i],TREE_APPLE_SLOTS[j]]=[TREE_APPLE_SLOTS[j],TREE_APPLE_SLOTS[i]];}
  TREE_APPLE_SLOTS=TREE_APPLE_SLOTS.slice(0,40);
  const placed=[];
  const okCell=(cx,cz)=>{
    if(Math.abs(cx)>43||Math.abs(cz)>43)return false;
    if((cx+0.5)**2+(cz+0.5)**2<110)return false;
    if(Math.abs(cx)<15&&cz>13&&cz<24)return false;
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){if(getTile(cx+dx,cz+dz)!=='grass')return false;}
    for(const p of placed)if((p[0]-cx)**2+(p[1]-cz)**2<20)return false;
    for(const l of LAMPS)if((l.x-cx-0.5)**2+(l.z-cz-0.5)**2<12)return false;// keep trees clear of lamps
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(topMap[idx(cx+dx,cz+dz)]>0)return false;
    return true;
  };
  for(let i=0;i<1400&&placed.length<46;i++){const cx=Math.floor(WR()*88)-44,cz=Math.floor(WR()*88)-44;if(okCell(cx,cz)){placed.push([cx,cz]);tree(cx,cz,3+Math.floor(WR()*2),false);}}
  // flowers
  const fc=['#e0442e','#f2b632','#f4f1ea','#9c6bd6','#ff8fb3'];
  for(let i=0;i<260;i++){const cx=Math.floor(WR()*88)-44,cz=Math.floor(WR()*88)-44;if(getTile(cx,cz)!=='grass'||topMap[idx(cx,cz)]!==0)continue;const x=cx+0.2+WR()*0.6,z=cz+0.2+WR()*0.6;fbox(x,0.12,z,0.05,0.24,0.05,'#3f8f2f');fbox(x,0.27,z,0.16,0.12,0.16,wpick(fc));}
}

function finalizeMeshes(){
  const m4=new THREE.Matrix4();
  for(const k in BLOCKS){const a=BLOCKS[k];const n=a.length/3;if(!n)continue;
    const im=new THREE.InstancedMesh(blockGeo(...BLOCK_TYPES[k]),atlasMat,n);
    for(let i=0;i<n;i++){m4.makeTranslation(a[i*3],a[i*3+1],a[i*3+2]);im.setMatrixAt(i,m4);}
    im.instanceMatrix.needsUpdate=true;im.frustumCulled=false;im.receiveShadow=true;
    im.castShadow=['log','leaves','plaster','brick','hedge'].includes(k);
    scene.add(im);}
  const mats={noise:new THREE.MeshLambertMaterial({map:noiseTex}),glow:new THREE.MeshBasicMaterial({color:0xffffff}),glass:new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.3,depthWrite:false})};
  const q=new THREE.Quaternion(),e=new THREE.Euler(),pv=new THREE.Vector3(),sv=new THREE.Vector3(),col=new THREE.Color();
  for(const k in FURN){const list=FURN[k];if(!list.length)continue;
    const im=new THREE.InstancedMesh(UNIT_BOX,mats[k],list.length);
    list.forEach((b,i)=>{pv.set(b[0],b[1],b[2]);sv.set(b[3],b[4],b[5]);e.set(0,b[7],0);q.setFromEuler(e);m4.compose(pv,q,sv);im.setMatrixAt(i,m4);col.set(b[6]);im.setColorAt(i,col);});
    im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;im.frustumCulled=false;
    if(k!=='glass'){im.castShadow=k==='noise';im.receiveShadow=true;}else im.renderOrder=2;
    scene.add(im);}
  // water
  const water=new THREE.Mesh(new THREE.PlaneGeometry(36,19),new THREE.MeshLambertMaterial({map:waterTex,transparent:true,opacity:0.78,depthWrite:false}));
  water.rotation.x=-Math.PI/2;water.position.set(0,-0.18,31);water.renderOrder=1;scene.add(water);
}

/* apples on the plaza tree: red = apples given today, gold = Golden Apple members */
const treeApples=new THREE.InstancedMesh(UNIT_BOX,new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x220800}),40);
treeApples.frustumCulled=false;treeApples.castShadow=true;scene.add(treeApples);
(function(){const m=new THREE.Matrix4().makeScale(0,0,0),c=new THREE.Color('#e0442e');for(let i=0;i<40;i++){treeApples.setMatrixAt(i,m);treeApples.setColorAt(i,c);}})();
function updateTreeApples(){
  const today=todayKey();let given=0;
  for(const f of WORLD.feed){if(f.kind==='apple'){const d=new Date(f.at);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(k===today)given+=f.count;}}
  const golden=allPeople().filter(c=>isGolden(c.data.received)).length;
  const m4=new THREE.Matrix4(),col=new THREE.Color();
  for(let i=0;i<40;i++){const s=TREE_APPLE_SLOTS[i];
    const isG=i<Math.min(golden,8),isR=!isG&&i<Math.min(golden,8)+Math.min(given,32);
    if(!s||(!isG&&!isR)){m4.makeScale(0,0,0);treeApples.setMatrixAt(i,m4);continue;}
    m4.makeScale(0.32,0.32,0.32);m4.setPosition(s[0],s[1],s[2]);treeApples.setMatrixAt(i,m4);col.set(isG?'#f2b632':'#e0442e');treeApples.setColorAt(i,col);}
  treeApples.instanceMatrix.needsUpdate=true;if(treeApples.instanceColor)treeApples.instanceColor.needsUpdate=true;
  return{given,golden};
}
function drawBoard(){
  if(!boardCanvas)return;const g=boardCanvas.getContext('2d');const st=updateTreeApples();
  g.fillStyle='#3a2a1a';g.fillRect(0,0,512,320);g.fillStyle='#4a3522';for(let y=0;y<320;y+=40)g.fillRect(0,y,512,2);
  g.fillStyle='#f2b632';g.textAlign='center';g.font='700 44px '+FONT_UI;g.fillText('ORCHARD BOARD',256,64);
  g.fillStyle='#f6ecd6';g.font='700 30px '+FONT_UI;
  g.fillText('Golden Apples: '+st.golden,256,134);g.fillText('Apples given today: '+st.given,256,180);
  g.fillStyle='#c4b49a';g.font='400 24px '+FONT_UI;g.fillText(coarse?'Tap to read the board':'Click or press E to read',256,268);
  boardTex.needsUpdate=true;
}

/* clouds & ducks */
const clouds=[];
(function(){const m=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x8a9aa6});const R=mulberry32(9);
  for(let i=0;i<9;i++){const g=new THREE.Group();const n=3+Math.floor(R()*4);for(let k=0;k<n;k++){const b=new THREE.Mesh(UNIT_BOX,m);b.scale.set(3+R()*5,1.2,2+R()*3);b.position.set(k*2.6-n,R()*0.6,(R()-.5)*3);g.add(b);}
    g.position.set(-90+R()*180,30+R()*8,-80+R()*160);g.userData.v=0.6+R()*0.8;scene.add(g);clouds.push(g);}})();
const ducks=[];
(function(){const w=new THREE.MeshLambertMaterial({color:0xf4f1ea}),o=new THREE.MeshLambertMaterial({color:0xef9a2a}),gr=new THREE.MeshLambertMaterial({color:0x2f7f4a});
  for(let i=0;i<3;i++){const g=new THREE.Group();const add=(m,sx,sy,sz,x,y,z)=>{const b=new THREE.Mesh(UNIT_BOX,m);b.scale.set(sx,sy,sz);b.position.set(x,y,z);g.add(b);};
    add(w,0.4,0.28,0.6,0,0.1,0);add(i===0?gr:w,0.26,0.26,0.26,0,0.36,0.28);add(o,0.14,0.07,0.14,0,0.33,0.47);add(w,0.24,0.14,0.2,0,0.24,-0.32);
    g.userData={a:i*2.1,r:3+i*1.6,cx:(i-1)*5,cz:32+i*0.8,s:0.18+i*0.04};scene.add(g);ducks.push(g);}})();

buildLayout();buildFurniture();buildTrees();finalizeMeshes();

/* =========================================================
   Day and night
   A real-time cycle of 30 minutes of day and 30 minutes of night, taken from the clock so everyone in a room
   shares it. No clock is shown: the sky, sun, moon, stars and lights tell the time. Lamps (LAMPS) switch on at dusk
   one by one and off at dawn; a few area lights brighten the rooms, the plaza and the lake at night.
   ========================================================= */
const DAY_MS=3600000,TWI=0.05;// 30 min day + 30 min night; dusk and dawn each take ~6 minutes
const DN={force:null,level:1,prev:null,sky:'',k:0};// force: a fixed phase for tests
const cyclePhase=()=>DN.force!=null?DN.force:(Date.now()%DAY_MS)/DAY_MS;// 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight
function daylightAt(p){
  const s=x=>x*x*(3-2*x);
  if(p>=TWI&&p<=0.5-TWI)return 1;if(p>=0.5+TWI&&p<=1-TWI)return 0;
  if(p>0.5-TWI&&p<0.5+TWI)return 1-s((p-(0.5-TWI))/(2*TWI));
  return s((p>0.5?p-(1-TWI):p+TWI)/(2*TWI));
}
const LOOK={// sky top, middle, bottom, fog, hemisphere, ambient, sun/moon intensity and colour
  day:{top:'#69b6ea',mid:'#a9d9f3',bot:'#d9eff8',fog:'#cde8f6',hemi:0.72,amb:0.16,sun:0.82,sunC:'#fff1d8'},
  twi:{top:'#33467e',mid:'#b36a62',bot:'#f2a65a',fog:'#b98a76',hemi:0.4,amb:0.13,sun:0.42,sunC:'#ffb070'},
  night:{top:'#040817',mid:'#0d1530',bot:'#1b2850',fog:'#121a30',hemi:0.13,amb:0.07,sun:0.17,sunC:'#9db4ff'}
};
function mixHex(a,b,t){const A=parseInt(a.slice(1),16),B=parseInt(b.slice(1),16),c=sh=>Math.round(((A>>sh)&255)+((((B>>sh)&255)-((A>>sh)&255))*t));return '#'+((1<<24)|(c(16)<<16)|(c(8)<<8)|c(0)).toString(16).slice(1);}
function lookAt(lv){const [a,b,t]=lv<0.5?[LOOK.night,LOOK.twi,lv*2]:[LOOK.twi,LOOK.day,(lv-0.5)*2],o={};for(const k in a)o[k]=typeof a[k]==='number'?a[k]+(b[k]-a[k])*t:mixHex(a[k],b[k],t);return o;}
// sky objects follow the camera so they sit at "infinity": a square Minecraft-style sun and moon, and stars
const SUN_DIR=new THREE.Vector3(0.6,0.8,0.3);
const skyGroup=new THREE.Group();scene.add(skyGroup);
const sunDisc=new THREE.Mesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0xfff3b0,fog:false}));sunDisc.scale.setScalar(16);skyGroup.add(sunDisc);
const moonDisc=new THREE.Mesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0xe8ecf4,fog:false}));moonDisc.scale.setScalar(11);skyGroup.add(moonDisc);
const starMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,fog:false,depthWrite:false});
const stars=new THREE.InstancedMesh(UNIT_BOX,starMat,240);skyGroup.add(stars);
(function(){const R=mulberry32(31),m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3();
  for(let i=0;i<240;i++){const a=R()*Math.PI*2,e=0.12+R()*1.3,r=255;p.set(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r);sc.setScalar(0.6+R()*1.1);m.compose(p,q,sc);stars.setMatrixAt(i,m);}
  stars.instanceMatrix.needsUpdate=true;stars.frustumCulled=false;stars.visible=false;})();
// area lights: a few real point lights where people gather, on only at night
const AREA_LIGHTS=[[0,3.4,-28,24,0xffe2b0,1.1],[25.5,3,0,15,0xffe2b0,1.0],[-25.5,2.8,-0.5,12,0xeaf6ff,1.0],[0,3.6,1,15,0xffd890,0.9],[0,3,20.5,17,0xffd890,0.9],[23.5,3.2,-22.5,18,0xd8b0ff,1.0],[-24.5,3.2,-22.5,18,0xeaf6ff,1.0],[33.5,4.5,22,26,0xffffff,1.1]].map(([x,y,z,d,c,i])=>{
  const L=new THREE.PointLight(c,0,d,1.6);L.position.set(x,y,z);L.userData.max=i;scene.add(L);return L;});
const cloudMat=clouds[0]&&clouds[0].children[0]&&clouds[0].children[0].material;
function updateDayNight(dt){
  const p=cyclePhase(),lv=daylightAt(p),L=lookAt(lv),night=1-lv;DN.level=lv;
  // sun by day, moon by night, both rising in the east (+x) and setting in the west
  const day=p<0.5,a=(day?p:p-0.5)/0.5*Math.PI;SUN_DIR.set(Math.cos(a)*0.8,Math.max(0.15,Math.sin(a)),0.35).normalize();
  sunDisc.position.set(Math.cos(day?a:a+Math.PI)*240,Math.sin(day?a:a+Math.PI)*240,90);moonDisc.position.set(-sunDisc.position.x,-sunDisc.position.y,-90);
  sunDisc.visible=sunDisc.position.y>-20;moonDisc.visible=moonDisc.position.y>-20;
  stars.visible=lv<0.6;starMat.opacity=clamp((0.6-lv)/0.6,0,1)*0.9;
  hemi.intensity=L.hemi;amb.intensity=L.amb;sun.intensity=L.sun;if(sun.color&&sun.color.set)sun.color.set(L.sunC);
  if(scene.fog&&scene.fog.color&&scene.fog.color.set)scene.fog.color.set(L.fog);
  const key=L.top+L.mid+L.bot;if(key!==DN.sky){DN.sky=key;drawSky(L.top,L.mid,L.bot);}
  if(cloudMat&&cloudMat.emissive&&cloudMat.emissive.setRGB){const k=0.12+0.88*lv;cloudMat.emissive.setRGB(0.54*k,0.6*k,0.65*k);}
  const areaK=clamp((0.62-lv)/0.3,0,1);for(const A of AREA_LIGHTS)A.intensity=A.userData.max*areaK;
  // lamps switch one by one: on as dusk deepens, off once it is light again; a street lamp flickers as it warms up
  for(const l of LAMPS){
    if(!l.on&&lv<0.55+l.at){l.on=true;l.flick=l.kind==='street'?0.6:0;}else if(l.on&&lv>0.62+l.at)l.on=false;
    l.flick=Math.max(0,(l.flick||0)-dt);const want=l.on?(l.flick>0?(Math.sin(l.flick*40)>0?1:0.15):1):0;
    l.fade+=(want-l.fade)*Math.min(1,dt*(l.on?6:3));const lit=l.fade>0.5;
    l.bulb.material=lit?(l.cool?LAMP_MAT.cool:LAMP_MAT.on):LAMP_MAT.off;
    l.halo.visible=l.pool.visible=l.fade>0.02;l.haloMat.opacity=0.8*l.fade;l.poolMat.opacity=0.6*l.fade*(0.35+0.65*night);
  }
  // a word when it changes, never a clock
  if(DN.prev!=null&&state.mode==='world'){if(DN.prev>=0.5&&lv<0.5)toast('The sun is setting. Lights are coming on around the office.','',3600);else if(DN.prev<0.5&&lv>=0.5)toast('Good morning! The sun is up.','',3000);}
  DN.prev=lv;
}

/* =========================================================
   Pantry food: counter menu (changes every 5 minutes), coffee machine, holding and eating
   ========================================================= */
const MENU_MS=300000,COUNTER_X=32.35,SLOT_Z=[-0.85,-0.25,0.35,0.95,1.55,2.15,2.75,3.35],COFFEE_Z=-4.5,BREW_TIME=2.4;
const FOOD_CATS={veg:'Veg',nonveg:'Non-veg',fruit:'Fruit',drink:'Drink'};
const MENU_PLAN=['veg','nonveg','fruit','drink'];// two of each, in this order along the counter
// models are built bottom-centred, front facing +z, about 0.25 m across. snd: crunch | munch | juicy | gulp
let withPlate=true;// plates and boards stay on the counter; food in the hand is shown without them
const plate=(g,w,d)=>{if(withPlate)db(g,0,0.01,0,w||0.3,0.02,d||0.3,'#f4f1ea');};
const glass=(g,h,liq,lh)=>{db(g,0,h/2,0,0.1,h,0.1,'#cfefff','t');db(g,0,lh/2+0.005,0,0.086,lh,0.086,liq);};
const burger=(g,patty,extra)=>{db(g,0,0.03,0,0.18,0.04,0.18,'#d9a441');db(g,0,0.065,0,0.19,0.03,0.19,patty);if(extra)db(g,0,0.083,0,0.2,0.01,0.2,extra);db(g,0,0.092,0,0.2,0.015,0.2,'#6cbf4c');db(g,0,0.105,0,0.17,0.015,0.17,'#e0442e');db(g,0,0.135,0,0.18,0.05,0.18,'#d9a441');db(g,0.04,0.162,0.03,0.02,0.006,0.02,'#f4f1ea');db(g,-0.04,0.162,-0.02,0.02,0.006,0.02,'#f4f1ea');};
const FOODS=[
  {id:'salad',name:'Garden salad',cat:'veg',snd:'crunch',cols:['#6cbf4c','#e0442e','#f2b632'],b:g=>{db(g,0,0.05,0,0.24,0.1,0.24,'#f4f1ea');db(g,0,0.11,0,0.2,0.04,0.2,'#6cbf4c');db(g,0.04,0.135,0.03,0.06,0.03,0.06,'#e0442e');db(g,-0.05,0.135,-0.02,0.05,0.03,0.05,'#f2b632');db(g,-0.02,0.14,0.05,0.05,0.03,0.04,'#3f8f2f');}},
  {id:'vsandwich',name:'Veg sandwich',cat:'veg',snd:'munch',cols:['#e8c27a','#6cbf4c','#e0442e'],b:g=>{plate(g);db(g,0,0.04,0,0.2,0.03,0.18,'#e8c27a');db(g,0,0.063,0,0.21,0.015,0.19,'#6cbf4c');db(g,0,0.077,0,0.19,0.015,0.17,'#e0442e');db(g,0,0.09,0,0.2,0.012,0.18,'#f2b632');db(g,0,0.112,0,0.2,0.03,0.18,'#e8c27a');}},
  {id:'pizza',name:'Pizza slice',cat:'veg',snd:'munch',cols:['#f2b632','#e0442e','#c88a4a'],b:g=>{plate(g);db(g,0,0.035,-0.08,0.22,0.03,0.05,'#c88a4a');db(g,0,0.03,-0.02,0.18,0.02,0.08,'#f2b632');db(g,0,0.03,0.05,0.1,0.02,0.07,'#f2b632');db(g,0,0.03,0.1,0.04,0.02,0.04,'#f2b632');db(g,-0.04,0.042,-0.01,0.04,0.006,0.04,'#e0442e');db(g,0.04,0.042,0.03,0.03,0.006,0.03,'#4f9a33');}},
  {id:'samosa',name:'Samosa',cat:'veg',snd:'crunch',cols:['#d9a441','#b8862e'],b:g=>{plate(g);db(g,0,0.05,0,0.16,0.06,0.14,'#d9a441');db(g,0,0.1,0,0.1,0.05,0.09,'#d9a441');db(g,0,0.135,0,0.04,0.03,0.04,'#c99434');db(g,0.1,0.025,0.09,0.05,0.01,0.05,'#4f9a33');}},
  {id:'vburger',name:'Veg burger',cat:'veg',snd:'munch',cols:['#d9a441','#6cbf4c','#e0442e'],b:g=>burger(g,'#9a8a3a')},
  {id:'dosa',name:'Masala dosa',cat:'veg',snd:'crunch',cols:['#e0b060','#c88a4a'],b:g=>{plate(g,0.36,0.22);db(g,0,0.05,0,0.32,0.06,0.07,'#e0b060');db(g,0,0.081,0,0.3,0.004,0.02,'#c88a4a');db(g,-0.12,0.025,0.07,0.05,0.01,0.04,'#f4f1ea');db(g,0.12,0.025,0.07,0.05,0.01,0.04,'#e0442e');}},
  {id:'drumstick',name:'Chicken leg',cat:'nonveg',snd:'munch',cols:['#b8662e','#8a4a22'],b:g=>{plate(g);const L=grp(g,0,0,0,0.4);db(L,-0.03,0.06,0,0.13,0.09,0.12,'#b8662e');db(L,0.08,0.05,0,0.1,0.03,0.03,'#f4e2c8');db(L,0.135,0.05,0,0.04,0.045,0.045,'#f4e2c8');}},
  {id:'cburger',name:'Chicken burger',cat:'nonveg',snd:'munch',cols:['#d9a441','#c88a4a','#6cbf4c'],b:g=>burger(g,'#c88a4a','#f2b632')},
  {id:'egg',name:'Egg toast',cat:'nonveg',snd:'munch',cols:['#d9a441','#ffffff','#f2b632'],b:g=>{plate(g);db(g,0,0.035,0,0.18,0.03,0.18,'#d9a441');db(g,0,0.056,0,0.14,0.012,0.13,'#ffffff');db(g,0.01,0.066,0,0.05,0.015,0.05,'#f2b632');}},
  {id:'biryani',name:'Chicken biryani',cat:'nonveg',snd:'munch',cols:['#f0d27a','#a8582a','#4f9a33'],b:g=>{db(g,0,0.05,0,0.24,0.1,0.24,'#b5683e');db(g,0,0.11,0,0.2,0.04,0.2,'#f0d27a');db(g,0,0.14,0,0.12,0.03,0.12,'#f2c75c');db(g,0.04,0.15,0.02,0.05,0.04,0.05,'#a8582a');db(g,-0.05,0.14,-0.04,0.05,0.04,0.05,'#a8582a');db(g,-0.03,0.162,0.04,0.03,0.01,0.03,'#4f9a33');}},
  {id:'fish',name:'Fish fry',cat:'nonveg',snd:'crunch',cols:['#d9a441','#c99434'],b:g=>{plate(g);db(g,-0.02,0.04,0,0.2,0.04,0.1,'#d9a441');db(g,0.11,0.04,0,0.05,0.03,0.08,'#c99434');db(g,-0.1,0.04,0.09,0.05,0.04,0.03,'#f2e14a');}},
  {id:'sushi',name:'Salmon sushi',cat:'nonveg',snd:'munch',cols:['#f4f1ea','#ff8c5a','#1f2b1f'],b:g=>{if(withPlate)db(g,0,0.015,0,0.3,0.03,0.14,'#a8793f');for(const x of [-0.08,0,0.08]){db(g,x,0.06,0,0.07,0.06,0.07,'#1f2b1f');db(g,x,0.092,0,0.055,0.005,0.055,'#f4f1ea');db(g,x,0.097,0,0.026,0.006,0.026,'#ff8c5a');}}},
  {id:'apple',name:'Apple',cat:'fruit',snd:'crunch',cols:['#d8382a','#f4e2c8'],b:g=>{db(g,0,0.07,0,0.14,0.14,0.14,'#d8382a');db(g,-0.03,0.1,0.071,0.03,0.03,0.003,'#ff8f6e');db(g,0,0.16,0,0.02,0.04,0.02,'#5c3f24');db(g,0.025,0.155,0,0.04,0.015,0.02,'#4f9a33');}},
  {id:'banana',name:'Banana',cat:'fruit',snd:'munch',cols:['#f2d23a','#f4f1ea'],b:g=>{db(g,-0.08,0.05,0,0.07,0.04,0.045,'#f2d23a');db(g,0,0.03,0,0.09,0.04,0.05,'#f2d23a');db(g,0.08,0.05,0,0.07,0.04,0.045,'#f2d23a');db(g,0.125,0.065,0,0.02,0.02,0.02,'#5c3f24');}},
  {id:'watermelon',name:'Watermelon',cat:'fruit',snd:'juicy',cols:['#e84a4a','#3f8f2f'],b:g=>{db(g,0,0.015,0,0.24,0.03,0.08,'#3f8f2f');db(g,0,0.036,0,0.22,0.012,0.075,'#e8f2d0');db(g,0,0.067,0,0.2,0.05,0.07,'#e84a4a');db(g,0,0.11,0,0.12,0.04,0.065,'#e84a4a');db(g,0,0.14,0,0.05,0.025,0.06,'#e84a4a');db(g,-0.05,0.08,0.036,0.012,0.012,0.003,'#18110b');db(g,0.04,0.1,0.034,0.012,0.012,0.003,'#18110b');}},
  {id:'orange',name:'Orange',cat:'fruit',snd:'juicy',cols:['#f28c28','#ffd27f'],b:g=>{db(g,0,0.065,0,0.13,0.13,0.13,'#f28c28');db(g,0,0.135,0,0.02,0.015,0.02,'#4f9a33');}},
  {id:'grapes',name:'Grapes',cat:'fruit',snd:'juicy',cols:['#7b3fa0','#9a5ac0'],b:g=>{for(const [x,y,z] of [[-0.045,0.13,0],[0,0.13,0],[0.045,0.13,0],[-0.022,0.09,0.02],[0.022,0.09,0.02],[-0.022,0.09,-0.02],[0.022,0.09,-0.02],[0,0.05,0]])db(g,x,y,z,0.045,0.045,0.045,'#7b3fa0');db(g,0,0.17,0,0.015,0.04,0.015,'#5c3f24');}},
  {id:'strawberry',name:'Strawberries',cat:'fruit',snd:'juicy',cols:['#e03a4a','#4f9a33'],b:g=>{for(const [x,z] of [[-0.05,0],[0.05,0.02]]){db(g,x,0.05,z,0.09,0.08,0.09,'#e03a4a');db(g,x,0.015,z,0.05,0.03,0.05,'#e03a4a');db(g,x,0.095,z,0.08,0.015,0.08,'#4f9a33');db(g,x+0.02,0.06,z+0.046,0.008,0.008,0.003,'#f2e14a');}}},
  {id:'ojuice',name:'Orange juice',cat:'drink',snd:'gulp',cols:['#f2a03a'],b:g=>{glass(g,0.18,'#f2a03a',0.14);db(g,0.05,0.17,0,0.03,0.04,0.02,'#f28c28');db(g,-0.02,0.2,0,0.012,0.12,0.012,'#e0442e');}},
  {id:'lassi',name:'Mango lassi',cat:'drink',snd:'gulp',cols:['#f2c75c'],b:g=>{glass(g,0.18,'#f2c75c',0.15);db(g,0,0.165,0,0.088,0.02,0.088,'#fff2c8');}},
  {id:'lemonade',name:'Lemonade',cat:'drink',snd:'gulp',cols:['#f2e98a'],b:g=>{glass(g,0.18,'#f2e98a',0.14);db(g,0.02,0.12,0.01,0.04,0.04,0.04,'#e8f6ff','t');db(g,0.05,0.17,0,0.04,0.04,0.012,'#f2e14a');}},
  {id:'shake',name:'Milkshake',cat:'drink',snd:'gulp',cols:['#f2a0b8'],b:g=>{glass(g,0.2,'#f2a0b8',0.17);db(g,0,0.21,0,0.09,0.04,0.09,'#ffffff');db(g,0,0.24,0,0.03,0.03,0.03,'#c8203a');db(g,0.025,0.25,0,0.012,0.1,0.012,'#2f6fc2');}},
  {id:'chai',name:'Masala chai',cat:'drink',snd:'gulp',hot:true,cols:['#c8955a'],b:g=>{glass(g,0.12,'#c8955a',0.1);}},
  {id:'soda',name:'Soda can',cat:'drink',snd:'gulp',cols:['#2f6fc2'],b:g=>{db(g,0,0.08,0,0.08,0.16,0.08,'#2f6fc2');db(g,0,0.09,0,0.082,0.04,0.082,'#f4f1ea');db(g,0,0.163,0,0.06,0.006,0.06,'#c5ccd2');}},
  {id:'water',name:'Water bottle',cat:'drink',snd:'gulp',cols:['#9cc8ec'],b:g=>{db(g,0,0.1,0,0.08,0.2,0.08,'#9cc8ec','t');db(g,0,0.09,0,0.082,0.05,0.082,'#2f6fc2');db(g,0,0.215,0,0.04,0.03,0.04,'#2f6fc2');}},
  {id:'coffee',name:'Coffee',cat:'coffee',snd:'gulp',hot:true,cols:['#5b3a1e'],b:g=>{db(g,0,0.05,0,0.09,0.1,0.09,'#f4f1ea');db(g,0,0.05,0,0.092,0.035,0.092,'#8a5a36');db(g,0,0.105,0,0.096,0.014,0.096,'#3a3a44');}}
];
const FOOD=Object.fromEntries(FOODS.map(f=>[f.id,f]));
const isDrink=f=>f.cat==='drink'||f.cat==='coffee';
function buildFood(id,inHand){const g=new THREE.Group();withPlate=!inHand;try{FOOD[id].b(g);}finally{withPlate=true;}return g;}
// everyone sees the same menu at the same time: it is picked from the 5-minute clock bucket
const menu={bucket:-1,items:[],mins:-1};
const menuBucket=()=>Math.floor(Date.now()/MENU_MS);
const menuMinsLeft=()=>Math.max(1,Math.ceil((MENU_MS-Date.now()%MENU_MS)/60000));
function menuFor(b){const R=mulberry32(b*7919+17),out=[];for(const cat of MENU_PLAN){const pool=FOODS.filter(f=>f.cat===cat).map(f=>f.id);for(let k=0;k<2;k++)out.push(pool.splice(Math.floor(R()*pool.length),1)[0]);}return out;}
const counterGroup=new THREE.Group();scene.add(counterGroup);
const mbCanvas=textCanvas(640,120,()=>{},2),mbTex=textTex(mbCanvas);
const menuBoard=new THREE.Mesh(new THREE.PlaneGeometry(4.2,0.79),new THREE.MeshBasicMaterial({map:mbTex}));menuBoard.position.set(32.905,1.62,1.25);menuBoard.rotation.y=-Math.PI/2;scene.add(menuBoard);
function drawMenuBoard(){
  const g=mbCanvas.getContext('2d');menu.mins=menuMinsLeft();
  g.fillStyle='#22332a';g.fillRect(0,0,640,120);g.textAlign='left';
  g.fillStyle='#f6ecd6';g.font='700 22px '+FONT_UI;g.fillText('FOOD',16,38);g.fillText('COUNTER',16,62);
  g.fillStyle='#c4b49a';g.font='700 14px '+FONT_UI;g.fillText('New menu in',16,88);g.fillText(menu.mins+' min',16,104);
  [['veg','VEG','#7fd36a'],['nonveg','NON-VEG','#ff7d5f'],['fruit','FRUITS','#f2b632'],['drink','DRINKS','#7fc4f0']].forEach(([cat,label,c],i)=>{const x=150+i*122;
    g.fillStyle=c;g.font='700 16px '+FONT_UI;g.fillText(label,x,34);g.fillStyle='#f6ecd6';g.font='400 15px '+FONT_UI;
    menu.items.filter(id=>FOOD[id].cat===cat).forEach((id,k)=>g.fillText(FOOD[id].name,x,60+k*22));});
  mbTex.needsUpdate=true;
}
SIGN_DRAWERS.push(drawMenuBoard);
// rebuilds the counter for a clock bucket: a tray per slot, the Indian veg/non-veg mark on meals, then the item
function refreshMenu(b){
  const first=menu.bucket<0;menu.bucket=b;menu.items=menuFor(b);
  while(counterGroup.children.length)counterGroup.remove(counterGroup.children[0]);
  menu.items.forEach((id,i)=>{const f=FOOD[id],T=grp(counterGroup,COUNTER_X,0.96,SLOT_Z[i],-Math.PI/2);
    db(T,0,0.005,0,0.44,0.01,0.4,'#d9d0bf');
    if(f.cat==='veg'||f.cat==='nonveg'){const c=f.cat==='veg'?'#3f9f3f':'#a8382a';db(T,-0.15,0.012,0.15,0.06,0.006,0.06,'#f4f1ea');db(T,-0.15,0.014,0.15,0.05,0.006,0.05,c);db(T,-0.15,0.016,0.15,0.036,0.006,0.036,'#f4f1ea');db(T,-0.15,0.018,0.15,0.022,0.006,0.022,c);}
    const m=buildFood(id);m.position.y=0.01;T.add(m);});
  drawMenuBoard();
  const P=state.player;
  if(!first&&state.mode==='world'&&P&&zoneAt(P.root.position.x,P.root.position.z)==='Pantry'){toast('Fresh menu at the Pantry counter!','',3000);sfx('menu');}
}
function updateMenuClock(){const b=menuBucket();if(b!==menu.bucket)refreshMenu(b);else if(menuMinsLeft()!==menu.mins)drawMenuBoard();}
refreshMenu(menuBucket());
/* coffee machine: a green light blinks and steam rises while it brews */
const coffeeLight=new THREE.Mesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0x6cbf4c}));coffeeLight.scale.set(0.02,0.07,0.07);coffeeLight.position.set(32.28,1.3,COFFEE_Z+0.12);coffeeLight.visible=false;scene.add(coffeeLight);
const brew={on:false,t:0};
function nearestCounterItem(){const P=state.player;if(!P)return -1;const p=P.root.position;if(p.x<30.4||p.x>32.2)return -1;let best=-1,bd=0.45;SLOT_Z.forEach((z,i)=>{const d=Math.abs(p.z-z);if(d<bd){bd=d;best=i;}});return best;}
function nearCoffee(){const P=state.player;if(!P)return false;const p=P.root.position;return p.x>=30.4&&p.x<=32.2&&Math.abs(p.z-COFFEE_Z)<0.8;}
function holdFood(id){const P=state.player;if(!P)return;if(P.rodMesh){P.say('Put the rod away first (Q).',1800);return;}const had=P.held;P.hold(id);sfx('pick');P.say((had&&had!==id?'Swapped for ':'')+FOOD[id].name+(had&&had!==id?'.':'!'),1400);}
function putDownFood(){const P=state.player;if(!P||!P.held||P.eating)return;const h=handPos(P);burst(h.x,h.y,h.z,6,['#f4f1ea','#d9d0bf'],1.2,0.05);P.dropHeld();sfx('putdown');}
function startBrew(){const P=state.player;if(!P||brew.on||P.eating)return;brew.on=true;brew.t=0;P.faceTo(32.3,COFFEE_Z);P.say('Coffee time.',1200);sfx('brew');}
// eating: Minecraft style, the item goes to the mouth, crumbs fly and it crunches until eatTime() (meals take longer), then a burp (or "ahh" for drinks)
function startEat(){const P=state.player;if(!P||!P.held||P.eating||state.mode!=='world')return;const f=FOOD[P.held];if(tooFull(f)){P.say('I’m full. I’ll save it for later.',1800);sfx('deny');return;}P.eating={t:0,next:0,f};P.anim.eat=isDrink(f)?'drink':'eat';}
const mouthPos=ch=>{const p=ch.root.position,h=ch.root.rotation.y;return{x:p.x+Math.sin(h)*0.3,y:p.y+1.45,z:p.z+Math.cos(h)*0.3};};
function updateFood(dt){
  updateMenuClock();
  coffeeLight.visible=brew.on&&Math.floor(brew.t*4)%2===0;
  if(brew.on){brew.t+=dt;if(!reduceMotion&&Math.random()<dt*10)spawnP(32.32+rand(-0.04,0.04),1.15,COFFEE_Z+rand(-0.04,0.04),rand(-0.05,0.05),0.4,rand(-0.05,0.05),1.0,0.05,'#f4f6f7',-0.05);
    if(brew.t>=BREW_TIME&&!(state.player&&state.player.eating)){brew.on=false;if(state.player)holdFood('coffee');}}
  const P=state.player;if(!P)return;
  if(P.held&&FOOD[P.held].hot&&!reduceMotion){P.steamT=(P.steamT||0)-dt;if(P.steamT<=0){P.steamT=0.35;const h=handPos(P);spawnP(h.x,h.y+0.15,h.z,rand(-0.05,0.05),0.35,rand(-0.05,0.05),1.1,0.045,'#f4f6f7',-0.05);}}
  const e=P.eating;if(!e)return;e.t+=dt;const drink=isDrink(e.f);
  if(e.t>=e.next){e.next+=drink?0.4:0.22;sfx(e.f.snd);if(!drink){const m=mouthPos(P);for(let i=0;i<(reduceMotion?1:4);i++)spawnP(m.x,m.y,m.z,rand(-0.8,0.8),rand(0.2,1.2),rand(-0.8,0.8),0.6,0.045,pick(e.f.cols),9);}}
  if(e.t>=eatTime(e.f)){P.eating=null;P.anim.eat=null;P.dropHeld();sfx(drink?'ahh':'burp');const dirty=applyNutrition(e.f);P.say(dirty?'Should have washed my hands first…':e.f.id==='coffee'?'Ahh, coffee.':drink?'Refreshing!':'Yum!',1800);}
}

/* =========================================================
   Avatars: 64x64 pixel skin on a 32-pixel-tall block figure
   ========================================================= */
const PX=1.8/32;
function net(u,v,w,h,d){return{top:[u+d,v,w,d],bottom:[u+d+w,v,w,d],right:[u,v+d,d,h],front:[u+d,v+d,w,h],left:[u+d+w,v+d,d,h],back:[u+2*d+w,v+d,w,h]};}
const PARTS={head:{n:net(0,0,8,8,8),size:[8,8,8]},hat:{n:net(32,0,8,8,8),size:[8,8,8]},body:{n:net(16,16,8,12,4),size:[8,12,4]},
  armR:{n:net(40,16,4,12,4),size:[4,12,4]},armL:{n:net(32,48,4,12,4),size:[4,12,4]},legR:{n:net(0,16,4,12,4),size:[4,12,4]},legL:{n:net(16,48,4,12,4),size:[4,12,4]}};
function applyNet(geo,n){const uv=geo.attributes.uv;const order=['left','right','top','bottom','front','back'];
  for(let f=0;f<6;f++){const r=n[order[f]];const u0=r[0]/64,u1=(r[0]+r[2])/64,vt=1-r[1]/64,vb=1-(r[1]+r[3])/64;
    uv.setXY(f*4,u0,vt);uv.setXY(f*4+1,u1,vt);uv.setXY(f*4+2,u0,vb);uv.setXY(f*4+3,u1,vb);}uv.needsUpdate=true;}
function paintSkin(av){
  const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');
  const R=mulberry32(hashStr(avatarToArr(av).slice(0,9).join('.'))+11);
  const P=(x,y,col)=>{g.fillStyle=col;g.fillRect(x,y,1,1);};
  const Nz=(col,n)=>shade(col,(R()-.5)*2*n);
  const F=(r,col,n)=>{n=n==null?0.05:n;for(let j=0;j<r[3];j++)for(let i=0;i<r[2];i++)P(r[0]+i,r[1]+j,Nz(col,n));};
  const at=(r,i,j,col)=>{if(i>=0&&j>=0&&i<r[2]&&j<r[3])P(r[0]+i,r[1]+j,col);};
  const rows=(r,j0,j1,col,n)=>{n=n==null?0.06:n;for(let j=j0;j<=j1;j++)for(let i=0;i<r[2];i++)at(r,i,j,Nz(col,n));};
  const cols=(r,i0,i1,j0,j1,col,n)=>{n=n==null?0.06:n;for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)at(r,i,j,Nz(col,n));};
  const skin=AV.skin[av.skin],hair=AV.hair[av.hair],eye=AV.eyes[av.eyes],tc=AV.topColor[av.topColor],pc=AV.pants[av.pants],sc=AV.shoes[av.shoes];
  const hs=AV.hairStyle[av.hairStyle],top=AV.top[av.top],acc=AV.acc[av.acc];
  const H=PARTS.head.n,T=PARTS.hat.n,B=PARTS.body.n,FACES=['right','front','left','back','top','bottom'];
  for(const f of FACES)F(H[f],skin,0.03);
  const fr=H.front;
  const sideBack=n=>{rows(H.left,0,n-1,hair);rows(H.right,0,n-1,hair);rows(H.back,0,Math.min(7,n+1),hair);};
  if(hs!=='Bald'){
    F(H.top,hair,hs==='Buzz'?0.16:0.07);
    if(hs==='Buzz'){rows(fr,0,0,hair,0.16);sideBack(2);}
    else if(hs==='Side part'){rows(fr,0,0,hair);cols(fr,0,4,1,1,hair);at(fr,0,2,Nz(hair,0.05));sideBack(4);}
    else if(hs==='Long'){rows(fr,0,0,hair);cols(fr,0,2,1,1,hair);cols(fr,5,7,1,1,hair);cols(fr,0,0,2,7,hair);cols(fr,7,7,2,7,hair);rows(H.left,0,7,hair);rows(H.right,0,7,hair);rows(H.back,0,7,hair);}
    else{rows(fr,0,0,hair);cols(fr,0,1,1,1,hair);cols(fr,6,7,1,1,hair);sideBack(3);cols(H.left,5,7,3,3,hair);cols(H.right,0,2,3,3,hair);}
    if(acc!=='Glasses'&&acc!=='Shades'){const bc=shade(hair,-0.1);for(const i of [1,2,5,6])at(fr,i,3,bc);}
  }else{F(H.top,shade(skin,0.06),0.03);const bc=shade(skin,-0.25);for(const i of [1,2,5,6])at(fr,i,3,bc);}
  at(fr,1,4,'#f6f3ec');at(fr,2,4,eye);at(fr,5,4,eye);at(fr,6,4,'#f6f3ec');
  at(fr,3,5,shade(skin,-0.07));at(fr,4,5,shade(skin,-0.07));
  at(fr,3,6,shade(skin,-0.3));at(fr,4,6,shade(skin,-0.3));
  if(AV.gender[av.gender]==='Female'){at(fr,3,6,'#b5545c');at(fr,4,6,'#b5545c');if(acc!=='Glasses'&&acc!=='Shades'&&hs!=='Long'){at(fr,0,4,'#1c1410');at(fr,7,4,'#1c1410');}}// lips and lashes
  if(acc==='Glasses'){const k='#2a2320';for(const i of [0,3,4,7])at(fr,i,4,k);for(const i of [1,2,5,6])at(fr,i,3,k);at(H.left,0,4,k);at(H.right,7,4,k);}
  if(acc==='Shades'){const k='#141414';for(let i=0;i<8;i++)at(fr,i,4,k);for(const i of [1,2,5,6])at(fr,i,3,k);at(fr,2,4,'#45454c');at(fr,6,4,'#45454c');at(H.left,0,4,k);at(H.right,7,4,k);}
  // overlay layer (hair volume, headwear)
  if(hs==='Curly'){for(let j=0;j<8;j++)for(let i=0;i<8;i++)if(R()<0.55)at(T.top,i,j,Nz(hair,0.1));for(const f of ['left','right'])for(let j=0;j<4;j++)for(let i=0;i<8;i++)if(R()<0.5)at(T[f],i,j,Nz(hair,0.1));for(let j=0;j<6;j++)for(let i=0;i<8;i++)if(R()<0.5)at(T.back,i,j,Nz(hair,0.1));for(let i=0;i<8;i++)if(R()<0.45)at(T.front,i,0,Nz(hair,0.1));}
  if(acc==='Headphones'){const hp='#26262c';for(const f of ['left','right']){cols(T[f],2,5,3,6,hp,0.04);cols(T[f],3,4,4,5,tc,0.04);}cols(T.top,0,7,3,4,hp,0.04);}
  if(acc==='Cap'){F(T.top,tc,0.05);for(const f of ['front','left','right','back'])rows(T[f],0,1,tc);}
  if(acc==='Beanie'){const bc=shade(tc,-0.1);F(T.top,bc,0.06);for(const f of ['front','left','right','back']){rows(T[f],0,1,bc);rows(T[f],2,2,shade(tc,0.15));}}
  // torso & arms
  const shirt=top==='Shirt & tie'?'#ece8df':tc,longSleeve=top!=='Tee';
  for(const f of FACES)F(B[f],shirt,0.05);
  for(const A of [PARTS.armR.n,PARTS.armL.n]){for(const f of ['right','front','left','back']){F(A[f],skin,0.03);rows(A[f],0,longSleeve?9:3,shirt,0.05);if(top==='Hoodie'||top==='Sweater')rows(A[f],9,9,shade(shirt,-0.15),0.03);}F(A.top,shirt,0.05);F(A.bottom,skin,0.03);}
  const bf=B.front,bb=B.back;
  if(top==='Tee'){at(bf,3,0,skin);at(bf,4,0,skin);rows(bf,11,11,shade(tc,-0.15));rows(bb,11,11,shade(tc,-0.15));}
  if(top==='Hoodie'){cols(bf,1,6,7,9,shade(tc,-0.12));for(const [i,j] of [[2,1],[2,2],[5,1],[5,2]])at(bf,i,j,'#f2efe6');rows(bb,0,2,shade(tc,-0.12));rows(bf,11,11,shade(tc,-0.18));rows(bb,11,11,shade(tc,-0.18));}
  if(top==='Shirt & tie'){at(bf,2,0,'#ffffff');at(bf,5,0,'#ffffff');cols(bf,3,4,0,0,shade(tc,-0.2),0.02);cols(bf,3,4,1,8,tc,0.04);at(bf,3,9,tc);for(const f of ['front','back','left','right'])rows(B[f],11,11,'#2a1d14',0.04);}
  if(top==='Blazer'){cols(bf,2,5,0,0,'#ece8df');cols(bf,3,4,1,5,'#ece8df');at(bf,2,1,shade(tc,-0.2));at(bf,5,1,shade(tc,-0.2));at(bf,3,7,'#e9c45a');at(bf,3,9,'#e9c45a');}
  if(top==='Sweater'){for(const f of ['front','back','left','right'])rows(B[f],4,5,shade(tc,0.18));cols(bf,2,5,0,0,shade(tc,-0.2));rows(bf,11,11,shade(tc,-0.15));rows(bb,11,11,shade(tc,-0.15));}
  for(const L of [PARTS.legR.n,PARTS.legL.n]){for(const f of ['right','front','left','back']){F(L[f],pc,0.05);rows(L[f],10,11,sc,0.04);}F(L.top,pc,0.05);F(L.bottom,shade(sc,-0.2),0.03);}
  return c;
}
const PART_GEO={};
function partGeo(p,infl){const k=p+'|'+infl;if(PART_GEO[k])return PART_GEO[k];const s=PARTS[p].size;const g=new THREE.BoxGeometry((s[0]+infl)*PX,(s[1]+infl)*PX,(s[2]+infl)*PX);applyNet(g,PARTS[p].n);return(PART_GEO[k]=g);}
function buildAvatar(av){
  const canvas=paintSkin(av);const tex=canvasTex(canvas);
  const mat=new THREE.MeshLambertMaterial({map:tex});
  const over=new THREE.MeshLambertMaterial({map:tex,alphaTest:0.5,side:THREE.DoubleSide});
  const hairMat=new THREE.MeshLambertMaterial({color:AV.hair[av.hair],map:noiseTex});
  const accMat=new THREE.MeshLambertMaterial({color:AV.topColor[av.topColor],map:noiseTex});
  const root=new THREE.Group(),model=new THREE.Group();root.add(model);
  const M=(geo,m,parent,x,y,z)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=true;parent.add(o);return o;};
  const hips=new THREE.Group();hips.position.y=12*PX;model.add(hips);
  M(partGeo('body',0),mat,hips,0,6*PX,0);
  const headPivot=new THREE.Group();headPivot.position.y=12*PX;hips.add(headPivot);
  M(partGeo('head',0),mat,headPivot,0,4*PX,0);
  M(partGeo('hat',1),over,headPivot,0,4*PX,0).castShadow=false;
  const armR=new THREE.Group();armR.position.set(-6*PX,10*PX,0);hips.add(armR);M(partGeo('armR',0),mat,armR,0,-4*PX,0);
  const armL=new THREE.Group();armL.position.set(6*PX,10*PX,0);hips.add(armL);M(partGeo('armL',0),mat,armL,0,-4*PX,0);
  const legR=new THREE.Group();legR.position.set(-2*PX,12*PX,0);model.add(legR);M(partGeo('legR',0),mat,legR,0,-6*PX,0);
  const legL=new THREE.Group();legL.position.set(2*PX,12*PX,0);model.add(legL);M(partGeo('legL',0),mat,legL,0,-6*PX,0);
  const hs=AV.hairStyle[av.hairStyle],acc=AV.acc[av.acc];
  const sb=(w,h,d,m,x,y,z)=>{const o=M(UNIT_BOX,m,headPivot,x*PX,y*PX,z*PX);o.scale.set(w*PX,h*PX,d*PX);return o;};
  if(hs==='Long')sb(8.4,9,1.4,hairMat,0,1.5,-4.6);
  if(hs==='Bun'&&acc!=='Cap'&&acc!=='Beanie')sb(3.2,3.2,3.2,hairMat,0,9.4,-2.6);
  if(acc==='Cap')sb(8.6,0.8,3.4,accMat,0,7.6,5.6);
  if(acc==='Beanie')sb(2,2,2,accMat,0,9.3,0);
  return{root,model,hips,headPivot,armR,armL,legR,legL,canvas,disposables:[tex,mat,over,hairMat,accMat]};
}
function headIcon(canvas,size){const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(canvas,8,8,8,8,0,0,size,size);g.drawImage(canvas,40,8,8,8,0,0,size,size);return c.toDataURL();}

/* voxel apples */
const APPLE_MATS={red:new THREE.MeshLambertMaterial({color:0xe0442e}),gold:new THREE.MeshLambertMaterial({color:0xf2b632,emissive:0x7a4d00}),stem:new THREE.MeshLambertMaterial({color:0x5b3a1e}),leaf:new THREE.MeshLambertMaterial({color:0x6cbf4c})};
function makeApple(golden,s){
  const g=new THREE.Group(),m=golden?APPLE_MATS.gold:APPLE_MATS.red;
  const add=(w,h,d,x,y,z,mat)=>{const b=new THREE.Mesh(UNIT_BOX,mat);b.scale.set(w*s,h*s,d*s);b.position.set(x*s,y*s,z*s);g.add(b);return b;};
  add(0.5,0.4,0.5,0,0,0,m);add(0.38,0.52,0.38,0,0,0,m);add(0.6,0.28,0.34,0,0,0,m);add(0.34,0.28,0.6,0,0,0,m);
  add(0.06,0.16,0.06,0,0.32,0,APPLE_MATS.stem);add(0.2,0.04,0.11,0.11,0.36,0,APPLE_MATS.leaf).rotation.z=-0.45;
  return g;
}

/* =========================================================
   Characters
   ========================================================= */
const HIT_GEO=new THREE.BoxGeometry(0.8,1.95,0.8);const HIT_MAT=new THREE.MeshBasicMaterial({visible:false});
const labels=$('#labels');
const HIP=12*PX;
class Character{
  constructor(o){
    this.id=o.id;this.kind=o.kind;this.data=o.data;
    this.root=new THREE.Group();scene.add(this.root);
    this.anim={play:false,cast:0,reel:false,yawn:0,eat:null,phase:0,speed:0,run:false,air:false,pose:'stand',t:Math.random()*10,celebrate:0,startle:0,poke:0,give:0,wave:0};
    this.heading=0;this.baseY=0;this.hopY=0;this.hopV=0;this.vy=0;this.onGround=true;this.hiddenInStall=false;
    const hb=new THREE.Mesh(HIT_GEO,HIT_MAT);hb.position.y=0.98;hb.userData.char=this;this.root.add(hb);this.hit=hb;
    this.crown=new THREE.Group();const ap=makeApple(true,0.62);this.crown.add(ap);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffe08a,transparent:true,opacity:0.8,depthWrite:false,blending:THREE.AdditiveBlending}));glow.scale.set(1.1,1.1,1);this.crown.add(glow);
    this.crown.position.y=2.25;this.root.add(this.crown);this.sparkT=0;
    this.tag=document.createElement('div');this.tag.className='tag';labels.appendChild(this.tag);
    this.bubble=null;this.bubbleT=0;
    this.setAvatar(o.data.avatar);
  }
  setAvatar(av){
    if(this.av){this.root.remove(this.av.root);this.av.disposables.forEach(d=>d.dispose());}
    this.av=buildAvatar(av);this.root.add(this.av.root);this.headUrl=headIcon(this.av.canvas,48);this.refresh();
    if(this.heldMesh)this.av.armR.add(this.heldMesh);
    if(this.rodMesh)this.av.armR.add(this.rodMesh);
    if(this.gpKind){const k=this.gpKind;this.gpKind=null;this.gp=null;this.gymProp(k);}
    if(this.rkKind){const k=this.rkKind;this.rkKind=null;this.rk=null;this.racketProp(k);}
  }
  // a food item in the right hand, just below the fist; it tips towards the mouth when the arm comes up to eat
  hold(id){this.dropHeld();this.held=id;const m=buildFood(id,true);m.scale.setScalar(0.8);m.position.set(0,-12*PX,2.5*PX);this.heldMesh=m;this.av.armR.add(m);}
  // a fishing rod in the right hand, pointing forward and up while the arm is held out
  holdRod(){this.dropHeld();this.dropRod();const g=new THREE.Group();db(g,0,0,0.02,0.05,0.05,0.25,'#18110b');db(g,0,0,0.9,0.035,0.035,1.8,'#5b3a1e');db(g,0,0,1.85,0.02,0.02,0.3,'#e8e2d0');db(g,0,-0.06,0.15,0.08,0.08,0.06,'#3a3a44');
    g.position.set(0,-12*PX,2.5*PX);this.rodMesh=g;this.av.armR.add(g);}
  dropRod(){if(this.rodMesh)this.av.armR.remove(this.rodMesh);this.rodMesh=null;this.anim.reel=false;this.anim.cast=0;}
  dropHeld(){if(this.heldMesh)this.av.armR.remove(this.heldMesh);this.heldMesh=null;this.held=null;}
  // a tennis or badminton racket in the right hand while you play
  racketProp(kind){if(this.rkKind===kind)return;if(this.rk)this.av.armR.remove(this.rk);this.rk=null;this.rkKind=kind;if(!kind)return;const g=new THREE.Group(),fr=kind==='tennis'?'#e0442e':'#2f6fc2';db(g,0,-0.1,0,0.045,0.22,0.045,'#2b2d33');
    if(kind==='tennis'){db(g,0,-0.25,0,0.03,0.1,0.03,fr);db(g,0,-0.46,0,0.26,0.32,0.012,'#f4f1ea');for(const o of [-0.14,0.14])db(g,o,-0.46,0,0.03,0.34,0.035,fr);for(const o of [-0.3,-0.62])db(g,0,o,0,0.3,0.03,0.035,fr);}
    else{db(g,0,-0.32,0,0.016,0.26,0.016,'#9aa3aa');db(g,0,-0.57,0,0.2,0.24,0.01,'#f4f1ea');for(const o of [-0.1,0.1])db(g,o,-0.57,0,0.02,0.26,0.025,fr);for(const o of [-0.45,-0.69])db(g,0,o,0,0.22,0.02,0.025,fr);}
    g.position.set(0,-11*PX,0.5*PX);this.av.armR.add(g);this.rk=g;}
  // gym props: a dumbbell in each hand, or a barbell across the shoulders (back on the rack while resting)
  gymProp(kind){if(this.gpKind===kind)return;if(this.gp)this.gp.forEach(([par,m])=>par.remove(m));this.gp=null;this.gpKind=kind;if(!kind)return;const A=this.av;
    if(kind==='dumbbell'){this.gp=[A.armR,A.armL].map(arm=>{const g=new THREE.Group();db(g,0,0,0,0.3,0.05,0.05,'#2b2d33');for(const o of [-0.13,0.13])db(g,o,0,0,0.05,0.14,0.14,'#18110b');g.position.set(0,-11*PX,1*PX);arm.add(g);return [arm,g];});}
    else{const b=new THREE.Group();db(b,0,0,0,1.7,0.045,0.045,'#9aa3aa');for(const o of [-0.72,0.72])db(b,o,0,0,0.07,0.34,0.34,'#18110b');b.position.set(0,12.6*PX,-2.6*PX);A.hips.add(b);this.gp=[[A.hips,b]];}}
  get golden(){return isGolden(this.data.received);}
  refresh(){
    const d=this.data,st=STATUS[this.kind==='local'?'away':(d.status||'available')]||STATUS.available;
    this.crown.visible=this.golden;
    this.tag.className='tag'+(this.golden?' golden':'')+(this.kind==='local'?' away':'')+(state.selected===this?' sel':'');
    this.tag.innerHTML='<i class="dot" style="background:var('+st.v+')"></i>'+(this.golden?'<img src="'+ICON_GOLD+'" alt="Golden Apple">':'')+'<span>'+esc(d.name)+'</span>'+(this.kind==='me'?'<b class="you">YOU</b>':'');
  }
  say(text,ms,cls){
    if(!this.bubble){this.bubble=document.createElement('div');labels.appendChild(this.bubble);}
    this.bubble.className='bubble'+(cls?' '+cls:'');this.bubble.textContent=text;this.bubbleT=(ms||2800)/1000;this.bubble.hidden=false;
  }
  hop(v){if(this.kind==='me'){if(this.onGround){this.vy=v;this.onGround=false;}}else if(this.hopY<=0.001)this.hopV=v;}
  faceTo(x,z){this.heading=Math.atan2(x-this.root.position.x,z-this.root.position.z);}
  update(dt){
    const a=this.anim,A=this.av;a.t+=dt;
    if(this.kind!=='me'){if(this.hopV!==0||this.hopY>0){this.hopV-=22*dt;this.hopY+=this.hopV*dt;if(this.hopY<=0){this.hopY=0;this.hopV=0;}}this.root.position.y=this.baseY+this.hopY;a.air=this.hopY>0.02||!!this.netAir;}
    this.root.rotation.y=angleLerp(this.root.rotation.y,this.heading,1-Math.exp(-dt*12));
    const moving=a.speed>0.1&&!a.air;
    a.phase+=dt*(2+a.speed*2.5);
    const amp=moving?Math.min(0.6,a.speed*0.2)+(a.run?0.32:0):0;
    let lR=Math.sin(a.phase)*amp,lL=-lR,aRx=-lR*0.9,aLx=-lL*0.9,aRz=0,aLz=0,hipX=a.run&&moving?0.16:0,hX=0,hY=0;
    let bob=moving?Math.abs(Math.sin(a.phase))*0.06*(amp/0.6):Math.sin(a.t*1.8)*0.006;
    if(!moving){aRz=-0.05-Math.sin(a.t*1.6)*0.03;aLz=0.05+Math.sin(a.t*1.6)*0.03;hY=Math.sin(a.t*0.45)*0.16;}
    if(a.air){lR=-0.65;lL=0.35;aRz=-0.75;aLz=0.75;aRx=-0.3;aLx=-0.3;bob=0;}
    if(a.pose==='sit'){lR=lL=-Math.PI/2;aRx=-0.8+Math.sin(a.t*9)*0.05;aLx=-0.8+Math.cos(a.t*8)*0.05;aRz=aLz=0;hipX=0;bob=0;hX=0.14;hY=0;}
    else if(a.pose==='wash'){aRx=-1.0+Math.sin(a.t*6)*0.12;aLx=-1.0+Math.cos(a.t*6)*0.12;hX=0.28;}
    else if(a.pose==='coffee'){aRx=-1.25+Math.sin(a.t*1.2)*0.05;hX=0.12;}
    else if(a.pose==='look'){hX=-0.08;}
    if(a.gym&&GYM_KINDS[a.gym.k]){const g=a.gym,K=GYM_KINDS[g.k];if(!g.rest)g.ph+=dt*K.rate[g.lvl];const s=Math.sin(g.ph),q=g.rest?0:(1-Math.cos(g.ph))/2,L=g.lvl;
      this.gymProp(K.prop&&!g.rest?K.prop:null);bob=0;aRz=aLz=0;hY=0;hX=0;hipX=0;
      if(g.k==='treadmill'){const am=[0.45,0.62,0.85][L],bend=[0,0.35,0.7][L];lR=s*am;lL=-lR;aRx=-lR*0.9-bend;aLx=lR*0.9-bend;hipX=L*0.08;bob=Math.abs(s)*0.04*(1+L*0.7);}
      else if(g.k==='elliptical'){lR=s*0.38;lL=-lR;aRx=-1.0-s*0.35;aLx=-1.0+s*0.35;hipX=0.05;bob=Math.abs(Math.cos(g.ph))*0.025;}
      else if(g.k==='bike'){lR=-1.25+s*0.45;lL=-1.25-s*0.45;aRx=aLx=-1.3;hipX=0.32+L*0.06;hX=-0.15;}
      else if(g.k==='bag'){const pr=Math.max(0,s)**2,pl=Math.max(0,-s)**2;lR=0.25;lL=-0.25;aRx=-0.9-pr*0.75;aLx=-0.9-pl*0.75;aRz=0.12;aLz=-0.12;hipX=0.1;bob=Math.abs(s)*0.02;hY=s*0.12;}
      else if(g.k==='dumbbell'){lR=lL=0;aRx=g.rest?-0.05:-0.1-(0.5+0.5*s)*1.7;aLx=g.rest?-0.05:-0.1-(0.5-0.5*s)*1.7;aRz=-0.1;aLz=0.1;hX=0.12;}
      else if(g.k==='squat'){lR=lL=-1.25*q;hipX=0.55*q;bob=-0.42*q;if(!g.rest){aRx=aLx=0.4;aRz=-1.4;aLz=1.4;}else aRx=aLx=0;}
      else if(g.k==='chest'){lR=lL=-Math.PI/2;aRx=aLx=g.rest?-0.2:-1.05-q*0.5;aRz=g.rest?0:-0.25+q*0.2;aLz=-aRz;hX=0.05;}
      else if(g.k==='lat'){lR=lL=-Math.PI/2;aRx=aLx=g.rest?-0.2:-2.95+q*0.9;aRz=g.rest?0:-0.35-q*0.25;aLz=-aRz;}
      if(g.rest&&g.k!=='chest'&&g.k!=='lat')bob=Math.sin(a.t*3)*0.01;}// catching your breath between sets
    else this.gymProp(null);
    if(a.play){aRx=-1.15+Math.sin(a.t*17)*0.08;aLx=-1.15+Math.cos(a.t*13)*0.08;aRz=0.18;aLz=-0.18;hX=0.12;}
    this.racketProp(a.sport||null);
    if(a.sport&&!(a.swing>0)){aRx=Math.min(aRx,-0.45);aRz=-0.3;}// racket ready
    if(a.swing>0){a.swing-=dt;const k=clamp(1-a.swing/SWING,0,1),e=k*k*(3-2*k);if(a.swingHi){aRx=-3.0+e*1.8;aRz=-0.15;}else{aRx=0.3-e*2.0;aRz=-1.25+e*1.05;}hY=-0.5+e;}// overhead or forehand swing
    if(a.wave>0){a.wave-=dt;aRz=-2.7+Math.sin(a.t*16)*0.35;aRx=0;}
    if(a.eat==='eat'){aRx=-1.75+Math.sin(a.t*24)*0.13;aRz=0.32;hX=0.06+Math.sin(a.t*24)*0.03;}
    else if(a.eat==='drink'){aRx=-2.2+Math.sin(a.t*6)*0.05;aRz=0.3;hX=-0.35;}
    if(this.rodMesh){if(a.cast>0){a.cast-=dt;const k=1-a.cast/0.6;aRx=k<0.45?-0.75-k/0.45*1.95:-2.7+(k-0.45)/0.55*1.95;}else if(a.reel){aRx=-0.95+Math.sin(a.t*14)*0.06;aLx=-1.1+Math.sin(a.t*14)*0.4;aLz=-0.3;}else aRx=-0.75;aRz=0.1;}
    if(a.yawn>0){a.yawn-=dt;const k=Math.sin(clamp(1-a.yawn/1.6,0,1)*Math.PI);hX=-0.35*k;aLx=-2.1*k;aLz=-0.3*k;}
    if(a.poke>0){a.poke-=dt;const k=Math.sin(clamp((0.45-a.poke)/0.45,0,1)*Math.PI);aRx=-1.55*k;aRz=0;}
    if(a.give>0){a.give-=dt;const k=Math.sin(clamp((0.55-a.give)/0.55,0,1)*Math.PI);aRx=-2.3*k;aRz=0;}
    if(a.celebrate>0){a.celebrate-=dt;aRz=-2.6+Math.sin(a.t*14)*0.2;aLz=2.6-Math.sin(a.t*14)*0.2;aRx=aLx=0;}
    if(a.startle>0){a.startle-=dt;hY=Math.sin(a.t*30)*0.4*clamp(a.startle/0.8,0,1);}
    const k=1-Math.exp(-dt*18);
    const S=(o,p,v)=>{o.rotation[p]+=(v-o.rotation[p])*k;};
    S(A.legR,'x',lR);S(A.legL,'x',lL);S(A.armR,'x',aRx);S(A.armL,'x',aLx);S(A.armR,'z',aRz);S(A.armL,'z',aLz);S(A.hips,'x',hipX);S(A.headPivot,'x',hX);S(A.headPivot,'y',hY);
    A.model.position.y+=(bob-A.model.position.y)*k;
    if(this.crown.visible){this.crown.rotation.y+=dt*1.9;this.crown.position.y=2.25+Math.sin(a.t*2.3)*0.06;
      this.sparkT-=dt;if(this.sparkT<=0&&!reduceMotion){this.sparkT=0.35+Math.random()*0.4;const p=this.root.position;spawnP(p.x+rand(-0.3,0.3),p.y+this.crown.position.y+rand(-0.1,0.2),p.z+rand(-0.3,0.3),rand(-0.2,0.2),rand(0.4,0.9),rand(-0.2,0.2),0.9,0.06,Math.random()<0.5?'#ffe08a':'#f2b632',0.2);}}
    if(this.bubble&&this.bubbleT>0){this.bubbleT-=dt;if(this.bubbleT<=0)this.bubble.hidden=true;}
  }
  dispose(){clearFishGfx(this);scene.remove(this.root);this.av.disposables.forEach(d=>d.dispose());this.tag.remove();if(this.bubble)this.bubble.remove();}
}

/* ---------- walk routes ----------
   routeFromTo is no longer used in play; tests/smoke-test.js walks every spot-to-spot route to prove the
   layout stays connected through doors and gaps after furniture changes. */
function routeFromTo(a,b){
  const pts=[];
  if(a){for(let i=a.via.length-1;i>=0;i--)pts.push(a.via[i]);}
  const za=a?ZONES[a.zone]:null,zb=ZONES[b.zone];
  if(!a||a.zone!==b.zone){if(za)pts.push(za.inside,...(za.walk||[]).slice().reverse(),za.gate,...ringPath(za.spoke,zb.spoke));pts.push(zb.gate,...(zb.walk||[]),zb.inside);}
  else pts.push(zb.inside);
  for(const p of b.via)pts.push(p);
  pts.push({x:b.x,z:b.z});return pts;
}
function placeAt(ch,spot){
  ch.root.position.set(spot.x,0,spot.z);ch.heading=spot.face;ch.root.rotation.y=spot.face;
  ch.anim.pose=spot.pose==='stall'?'stand':spot.pose;ch.anim.speed=0;
  ch.baseY=spot.pose==='sit'?spot.y-HIP:0;ch.root.position.y=ch.baseY;
  const hide=spot.pose==='stall';ch.root.visible=!hide;ch.hiddenInStall=hide;
}
/* ---------- people registry ---------- */
const allPeople=()=>[...state.chars.values()];

/* =========================================================
   Effects
   ========================================================= */
const PMAX=520;
const pMesh=new THREE.InstancedMesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0xffffff}),PMAX);pMesh.frustumCulled=false;scene.add(pMesh);
const pPos=new Float32Array(PMAX*3),pVel=new Float32Array(PMAX*3),pLife=new Float32Array(PMAX),pMax=new Float32Array(PMAX),pSize=new Float32Array(PMAX),pGrav=new Float32Array(PMAX);let pNext=0;
(function(){const m=new THREE.Matrix4().makeScale(0,0,0),c=new THREE.Color(1,1,1);for(let i=0;i<PMAX;i++){pMesh.setMatrixAt(i,m);pMesh.setColorAt(i,c);}})();
const _pc=new THREE.Color();
function spawnP(x,y,z,vx,vy,vz,life,size,color,grav){const i=pNext;pNext=(pNext+1)%PMAX;pPos[i*3]=x;pPos[i*3+1]=y;pPos[i*3+2]=z;pVel[i*3]=vx;pVel[i*3+1]=vy;pVel[i*3+2]=vz;pLife[i]=pMax[i]=life;pSize[i]=size;pGrav[i]=grav==null?9:grav;_pc.set(color);pMesh.setColorAt(i,_pc);pMesh.instanceColor.needsUpdate=true;}
function burst(x,y,z,n,colors,spd,size){n=reduceMotion?Math.ceil(n/3):n;spd=spd||3;size=size||0.1;for(let i=0;i<n;i++)spawnP(x,y,z,rand(-spd,spd),rand(1,spd*1.5),rand(-spd,spd),rand(0.6,1.2),size*rand(0.7,1.3),pick(colors));}
const _m4=new THREE.Matrix4();
function updateParticles(dt){for(let i=0;i<PMAX;i++){if(pLife[i]<=0)continue;pLife[i]-=dt;const j=i*3;
  if(pLife[i]<=0){_m4.makeScale(0,0,0);pMesh.setMatrixAt(i,_m4);continue;}
  pVel[j+1]-=pGrav[i]*dt;pPos[j]+=pVel[j]*dt;pPos[j+1]+=pVel[j+1]*dt;pPos[j+2]+=pVel[j+2]*dt;
  const s=pSize[i]*Math.sqrt(pLife[i]/pMax[i]);_m4.makeScale(s,s,s);_m4.setPosition(pPos[j],pPos[j+1],pPos[j+2]);pMesh.setMatrixAt(i,_m4);}
  pMesh.instanceMatrix.needsUpdate=true;}
const flyers=[];
function fly(obj,fromFn,toFn,dur,h,onDone,trail){scene.add(obj);flyers.push({obj,fromFn,toFn,t:0,dur,h,onDone,trail});}
function updateFlyers(dt){
  for(let i=flyers.length-1;i>=0;i--){const f=flyers[i];f.t+=dt;const k=clamp(f.t/f.dur,0,1);const a=f.fromFn(),b=f.toFn();
    f.obj.position.set(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k+Math.sin(k*Math.PI)*f.h,a.z+(b.z-a.z)*k);f.obj.rotation.y+=dt*8;
    if(f.trail&&Math.random()<0.7)spawnP(f.obj.position.x,f.obj.position.y,f.obj.position.z,rand(-0.3,0.3),rand(-0.2,0.4),rand(-0.3,0.3),0.4,0.07,f.trail,2);
    if(k>=1){scene.remove(f.obj);flyers.splice(i,1);if(f.onDone)f.onDone();}}
}
const rings=[];
function ringWave(x,y,z,color){const m=new THREE.Mesh(new THREE.RingGeometry(0.42,0.56,4,1),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.9,depthWrite:false,side:THREE.DoubleSide}));m.rotation.x=-Math.PI/2;m.rotation.z=Math.PI/4;m.position.set(x,y+0.05,z);scene.add(m);rings.push({m,t:0});}
function updateRings(dt){for(let i=rings.length-1;i>=0;i--){const r=rings[i];r.t+=dt;const k=r.t/0.6;r.m.scale.setScalar(1+k*3);r.m.material.opacity=0.9*(1-k);if(k>=1){scene.remove(r.m);r.m.geometry.dispose();r.m.material.dispose();rings.splice(i,1);}}}
const selRing=new THREE.Mesh(new THREE.RingGeometry(0.5,0.62,4,1),new THREE.MeshBasicMaterial({color:0xf2b632,transparent:true,opacity:0.95,depthWrite:false,side:THREE.DoubleSide}));
selRing.rotation.x=-Math.PI/2;selRing.rotation.z=Math.PI/4;selRing.visible=false;scene.add(selRing);
// a seated character's root is lowered by the hip height, so offsets from the root stay the same
const handPos=ch=>{const p=ch.root.position,h=ch.root.rotation.y;return{x:p.x+Math.sin(h)*0.35,y:p.y+1.2,z:p.z+Math.cos(h)*0.35};};
const headPos=ch=>{const p=ch.root.position;return{x:p.x,y:p.y+1.85,z:p.z};};

/* =========================================================
   Sound: music, ambience and effects, all synthesised with Web Audio.
   No audio files, so nothing to download or license. Audio starts on the first click or key press (browser autoplay rules).
   ========================================================= */
const AudioCtx=window.AudioContext||window.webkitAudioContext;
const SND=Object.assign({music:0.5,sfx:0.7,muted:false},Store.get('ga_sound',{}));
const Sound={ctx:null,out:null,musBus:null,mus:null,lead:null,echo:null,amb:null,fx:null,noise:null,beds:{},want:null,theme:null,fading:0,step:0,next:0,ambKey:null,ambNext:0};
const mtof=m=>440*Math.pow(2,(m-69)/12);
// one generative theme per place: chords repeat every bar, the lead repeats a seeded 4-bar phrase
const THEMES={
  plaza:{bpm:96,root:55,prog:[[0,4,7],[7,11,14],[9,12,16],[5,9,12]],scale:[0,2,4,7,9,12,14],lead:'triangle',pad:'sine',bass:[0,8],dens:0.42,perc:'shaker',seed:3},
  desks:{bpm:72,root:48,prog:[[0,4,7,11],[9,12,16,19],[5,9,12,16],[7,11,14,17]],scale:[0,2,4,7,9,12],lead:'sine',pad:'triangle',bass:[0,10],dens:0.26,perc:'lofi',seed:7},
  pantry:{bpm:108,root:50,prog:[[0,3,7,10],[5,9,12,15],[-2,2,5,9],[7,11,14,17]],scale:[0,2,3,5,7,9,10,12],lead:'square',leadLp:1800,pad:'triangle',bass:[0,4,8,12],walk:true,dens:0.48,perc:'brush',swing:0.16,seed:11},
  restroom:{bpm:64,root:57,prog:[[0,3,7],[-4,0,3]],scale:[0,3,5,7,10,12],lead:'sine',pad:'sine',bass:[0],dens:0.14,perc:null,echo:0.45,seed:5},
  playroom:{bpm:112,root:52,prog:[[0,4,7],[9,12,16],[5,9,12],[7,11,14]],scale:[0,2,4,7,9,12,14],lead:'square',leadLp:2200,pad:'triangle',bass:[0,4,8,12],dens:0.36,perc:'lofi',seed:17},
  arcade:{bpm:138,root:57,prog:[[0,3,7],[-4,0,3],[-2,2,5],[-5,-1,2]],scale:[0,2,3,5,7,8,10,12],lead:'square',leadLp:3200,pad:'triangle',bass:[0,4,8,12],dens:0.3,perc:'shaker',seed:23},
  gym:{bpm:126,root:50,prog:[[0,3,7],[5,8,12],[3,7,10],[7,10,14]],scale:[0,2,3,5,7,8,10,12],lead:'square',leadLp:2400,pad:'triangle',bass:[0,4,8,12],dens:0.4,perc:'shaker',seed:29},
  play:{bpm:118,root:55,prog:[[0,4,7],[5,9,12],[7,11,14],[0,4,7]],scale:[0,2,4,7,9,12,14],lead:'triangle',pad:'sine',bass:[0,8],dens:0.4,perc:'shaker',seed:31},
  lake:{bpm:66,root:53,prog:[[0,4,7,11],[5,9,12,16],[-3,0,4,7],[7,11,14,19]],scale:[0,2,4,7,9,12,14],lead:'sine',pad:'triangle',bass:[0,8],dens:0.3,perc:null,echo:0.35,seed:13}
};
// ambience per place: steady beds (wind, water, room hum) plus an occasional event every gap[0]..gap[1] seconds
const AMB={plaza:{wind:0.5,water:0,hum:0,ev:'birds',gap:[2,6]},grounds:{wind:0.7,water:0,hum:0,ev:'birds',gap:[3,8]},lake:{wind:0.35,water:1,hum:0,ev:'lake',gap:[4,10]},
  desks:{wind:0,water:0,hum:0.35,ev:'typing',gap:[1.5,4]},pantry:{wind:0,water:0,hum:0.6,ev:'pantry',gap:[3,8]},restroom:{wind:0,water:0.12,hum:0.25,ev:'drip',gap:[0.8,2.6]},playroom:{wind:0,water:0,hum:0.3,ev:'arcade',gap:[2,5]},gym:{wind:0,water:0,hum:0.4,ev:'gym',gap:[2.5,6]},play:{wind:0.5,water:0,hum:0,ev:'birds',gap:[3,7]}};
const zoneKey=name=>({'Work Desks':'desks','Pantry':'pantry','Restroom':'restroom','Lakeside':'lake','Plaza':'plaza','Playroom':'playroom','Gym':'gym','Playground':'play'})[name]||'grounds';
function audioInit(){
  if(Sound.ctx||!AudioCtx)return;
  let c;try{c=new AudioCtx();}catch(e){return;}
  Sound.ctx=c;const G=v=>{const g=c.createGain();g.gain.value=v;return g;};
  Sound.out=G(1);Sound.out.connect(c.destination);
  Sound.musBus=G(1);Sound.musBus.connect(Sound.out);Sound.mus=G(0);Sound.mus.connect(Sound.musBus);
  Sound.lead=G(1);Sound.lead.connect(Sound.mus);
  const dl=c.createDelay(1),fb=G(0.35);dl.delayTime.value=0.33;Sound.echo=G(0);Sound.lead.connect(Sound.echo);Sound.echo.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(Sound.mus);
  Sound.amb=G(1);Sound.amb.connect(Sound.out);Sound.fx=G(1);Sound.fx.connect(Sound.out);
  const nb=c.createBuffer(1,c.sampleRate*2,c.sampleRate),ch=nb.getChannelData(0);for(let i=0;i<ch.length;i++)ch[i]=Math.random()*2-1;Sound.noise=nb;
  const bed=(type,f)=>{const s=c.createBufferSource(),fl=c.createBiquadFilter(),g=G(0);s.buffer=nb;s.loop=true;fl.type=type;fl.frequency.value=f;s.connect(fl);fl.connect(g);g.connect(Sound.amb);s.start();return{g,fl};};
  Sound.beds.wind=bed('lowpass',420);Sound.beds.water=bed('lowpass',700);
  const lfo=c.createOscillator(),lg=G(260);lfo.frequency.value=0.22;lfo.connect(lg);lg.connect(Sound.beds.water.fl.frequency);lfo.start();
  const hum=G(0);hum.connect(Sound.amb);for(const [f,v] of [[55,0.4],[110,0.6],[220,0.25]]){const o=c.createOscillator(),g=G(v*0.05);o.frequency.value=f;o.connect(g);g.connect(hum);o.start();}Sound.beds.hum={g:hum};
  applyVolumes();
  if(document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.hidden)c.suspend();else if(!SND.muted)c.resume();});
}
function applyVolumes(){
  const c=Sound.ctx;if(!c)return;const t=c.currentTime;
  Sound.out.gain.setTargetAtTime(SND.muted?0:1,t,0.05);Sound.musBus.gain.setTargetAtTime(SND.music*0.55,t,0.05);Sound.amb.gain.setTargetAtTime(SND.music*0.8,t,0.05);Sound.fx.gain.setTargetAtTime(SND.sfx*0.8,t,0.05);
  if(SND.muted)c.suspend();else if(c.state==='suspended'&&!document.hidden)c.resume();
}
function saveSound(){Store.set('ga_sound',SND);applyVolumes();renderSoundBtn();}
function toggleMute(){SND.muted=!SND.muted;audioInit();saveSound();toast(SND.muted?'Sound off. Press M or use the Sound button to turn it back on.':'Sound on.','',1800);}
function audioUnlock(){audioInit();const c=Sound.ctx;if(c&&c.state==='suspended'&&!SND.muted&&!document.hidden)c.resume();}
addEventListener('pointerdown',audioUnlock);addEventListener('keydown',audioUnlock);
function tone(dest,f,t,d,o){
  o=o||{};const c=Sound.ctx,osc=c.createOscillator(),g=c.createGain(),v=o.v||0.2,a=o.a||0.008;d=Math.max(d,a+0.02);
  osc.type=o.type||'sine';osc.frequency.setValueAtTime(f,t);if(o.to)osc.frequency.exponentialRampToValueAtTime(o.to,t+d);
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  let n=osc;if(o.lp){const fl=c.createBiquadFilter();fl.type='lowpass';fl.frequency.value=o.lp;osc.connect(fl);n=fl;}
  n.connect(g);g.connect(dest);osc.start(t);osc.stop(t+d+0.05);
}
function hiss(dest,t,d,o){
  o=o||{};const c=Sound.ctx,s=c.createBufferSource(),fl=c.createBiquadFilter(),g=c.createGain(),v=o.v||0.1,a=o.a||0.004;d=Math.max(d,a+0.01);
  s.buffer=Sound.noise;fl.type=o.type||'highpass';fl.frequency.value=o.f||3000;if(o.q)fl.Q.value=o.q;
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(v,t+a);g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  s.connect(fl);fl.connect(g);g.connect(dest);s.start(t,Math.random()*1.5,d+0.05);
}
function musicStep(th,step,t,spb){
  const s=step%16,bar=Math.floor(step/16),ch=th.prog[bar%th.prog.length],R=mulberry32(th.seed*977+(bar%4)*31+s);
  if(s===0)for(const n of ch)tone(Sound.mus,mtof(th.root+12+n),t,spb*16,{type:th.pad,v:0.035,a:spb*4,lp:1500});
  if(th.bass.includes(s))tone(Sound.mus,mtof(th.root-12+(th.walk?ch[(s/4)%ch.length]:ch[0])),t,spb*3.6,{type:'triangle',v:0.11,lp:500});
  if(R()<th.dens*(s%4===0?1.4:s%2?0.6:1)){const pool=s%4===0?ch:th.scale,n=pool[Math.floor(R()*pool.length)]+(R()<0.25?12:0);
    tone(Sound.lead,mtof(th.root+24+n),t,spb*(R()<0.3?3:1.5),{type:th.lead,v:th.lead==='square'?0.025:0.05,lp:th.leadLp||3200});}
  if(th.perc==='shaker'&&s%2===0)hiss(Sound.mus,t,0.04,{f:7000,v:s%4?0.012:0.02});
  else if(th.perc==='lofi'){if(s===0||s===10)tone(Sound.mus,110,t,0.22,{to:42,v:0.22});if(s===4||s===12)hiss(Sound.mus,t,0.08,{type:'bandpass',f:1800,v:0.05,q:0.8});if(s%2===0)hiss(Sound.mus,t,0.025,{f:8000,v:0.012});}
  else if(th.perc==='brush'&&s%4===2)hiss(Sound.mus,t,0.12,{type:'bandpass',f:3200,v:0.025,a:0.03});
}
const nightEv=ev=>DN.level<0.3?({birds:'crickets',lake:'frogs'})[ev]||ev:ev;
function ambEvent(ev,t){
  const D=Sound.amb;
  if(ev==='birds'){const n=2+Math.floor(Math.random()*3),f=rand(2400,3800);for(let i=0;i<n;i++)tone(D,f*rand(0.9,1.1),t+i*0.11,0.08,{to:f*rand(1.2,1.5),v:0.03});}
  else if(ev==='lake'){if(Math.random()<0.4){for(let i=0;i<2;i++)tone(D,620,t+i*0.16,0.12,{type:'sawtooth',to:420,v:0.035,lp:1400});}else hiss(D,t,0.25,{type:'lowpass',f:900,v:0.08,a:0.05});}
  else if(ev==='typing'){let tt=t;const n=4+Math.floor(Math.random()*10);for(let i=0;i<n;i++){hiss(D,tt,0.025,{f:2600,v:0.05});tt+=rand(0.06,0.14);}}
  else if(ev==='pantry'){if(Math.random()<0.5){tone(D,2300,t,0.25,{v:0.03});tone(D,3450,t,0.18,{v:0.015});}else for(let i=0;i<6;i++)hiss(D,t+i*0.09,0.08,{type:'bandpass',f:rand(300,600),v:0.05,q:4});}
  else if(ev==='crickets'){const f=rand(4200,4700);for(let g=0;g<2;g++)for(let i=0;i<4;i++)tone(D,f,t+g*0.45+i*0.06,0.03,{type:'square',v:0.01,lp:6500});}
  else if(ev==='frogs'){for(let i=0;i<2;i++)tone(D,rand(150,200),t+i*0.26,0.18,{type:'sawtooth',to:120,v:0.04,lp:600});}
  else if(ev==='arcade'){const b=rand(500,1100);for(let i=0;i<3;i++)tone(D,b*[1,1.25,1.5][i],t+i*0.07,0.06,{type:'square',v:0.012,lp:3000});}
  else if(ev==='gym'){tone(D,rand(160,240),t,0.09,{type:'square',v:0.025,lp:1100});tone(D,rand(900,1300),t+0.01,0.05,{type:'triangle',v:0.015});}// weights clinking somewhere
  else if(ev==='drip')tone(D,rand(1200,1700),t,0.09,{to:450,v:0.05});
}
// called every frame: switches theme and ambience with the player's place, and schedules notes 0.3 s ahead
function updateSound(){
  const c=Sound.ctx;if(!c||c.state!=='running')return;const now=c.currentTime;
  const place=state.mode==='world'?Sound.want:null,tk=arc.open?'arcade':place==='grounds'?'plaza':place;
  if(tk!==Sound.theme){
    if(Sound.theme&&!Sound.fading){Sound.fading=now+0.9;Sound.mus.gain.setTargetAtTime(0,now,0.22);}
    if(!Sound.theme||now>=Sound.fading){Sound.fading=0;Sound.theme=tk;Sound.step=0;Sound.next=now+0.06;
      const th=THEMES[tk];if(th){Sound.echo.gain.setTargetAtTime(th.echo||0,now,0.1);Sound.mus.gain.setTargetAtTime(1,now,0.5);}}
  }
  const th=THEMES[Sound.theme];
  if(th&&!Sound.fading){const spb=60/th.bpm/4,sw=th.swing||0;if(Sound.next<now-0.2)Sound.next=now+0.05;
    while(Sound.next<now+0.3){musicStep(th,Sound.step,Sound.next,spb);Sound.next+=spb*(Sound.step%2?1-sw:1+sw);Sound.step++;}}
  const A=AMB[place];
  if(place!==Sound.ambKey){Sound.ambKey=place;const lv={wind:0.16,water:0.2,hum:1};for(const k in Sound.beds)Sound.beds[k].g.gain.setTargetAtTime(A?A[k]*lv[k]:0,now,0.8);Sound.ambNext=now+1;}
  if(A&&now>=Sound.ambNext){Sound.ambNext=now+rand(A.gap[0],A.gap[1]);ambEvent(nightEv(A.ev),now);}
}
function sfx(name,o){
  const c=Sound.ctx;if(!c||c.state!=='running'||SND.muted)return;const t=c.currentTime+0.005,F=Sound.fx;o=o||{};
  switch(name){
    case 'step':{const g=o.ground;
      if(g==='water')hiss(F,t,0.16,{type:'lowpass',f:1300,v:0.09,a:0.02});
      else if(g==='grass'||g==='meadow'||g==='hedge'||g==='carpet'||g==='rubber')hiss(F,t,0.06,{type:'lowpass',f:900,v:0.07});
      else if(g==='sand'||g==='trail')hiss(F,t,0.08,{type:'lowpass',f:1800,v:0.05});
      else if(g==='oak'||g==='plank'||g==='dock'){tone(F,rand(150,190),t,0.05,{type:'triangle',v:0.06});hiss(F,t,0.03,{type:'bandpass',f:1200,v:0.03});}
      else if(g==='tile'||g==='pantry')hiss(F,t,0.035,{type:'highpass',f:2400,v:0.05});
      else hiss(F,t,0.045,{type:'bandpass',f:1700,v:0.05});break;}
    case 'jump':tone(F,300,t,0.12,{type:'square',to:620,v:0.035,lp:2000});break;
    case 'land':hiss(F,t,0.08,{type:'lowpass',f:500,v:0.1});break;
    case 'splash':hiss(F,t,0.4,{type:'lowpass',f:1600,v:0.14,a:0.01});break;
    case 'sit':hiss(F,t,0.16,{type:'lowpass',f:700,v:0.1,a:0.02});tone(F,330,t+0.04,0.1,{type:'triangle',v:0.04});break;
    case 'stand':hiss(F,t,0.1,{type:'lowpass',f:900,v:0.07});break;
    case 'give':[72,76,79,84].forEach((m,i)=>tone(F,mtof(m),t+i*0.07,0.18,{type:'triangle',v:0.07}));break;
    case 'catch':tone(F,mtof(88),t,0.22,{type:'triangle',v:0.06});tone(F,mtof(95),t+0.05,0.25,{v:0.03});break;
    case 'golden':[72,76,79,84,88,91,96].forEach((m,i)=>tone(F,mtof(m),t+i*0.08,0.5,{type:i%2?'triangle':'square',v:0.045,lp:3500}));for(let i=0;i<8;i++)tone(F,mtof(96+(i%3)*4),t+0.6+i*0.06,0.2,{v:0.025});break;
    case 'poke':tone(F,520,t,0.12,{to:880,v:0.07});break;
    case 'poked':tone(F,880,t,0.08,{type:'square',v:0.035,lp:2500});tone(F,660,t+0.11,0.1,{type:'square',v:0.035,lp:2500});break;
    case 'boop':tone(F,700,t,0.1,{to:500,v:0.04});break;
    case 'ui':tone(F,1100,t,0.03,{type:'square',v:0.018,lp:3000});break;
    case 'open':tone(F,620,t,0.09,{type:'triangle',to:930,v:0.05});break;
    case 'close':tone(F,930,t,0.09,{type:'triangle',to:620,v:0.04});break;
    case 'pick':tone(F,520,t,0.08,{to:900,v:0.05});hiss(F,t,0.03,{f:3000,v:0.03});break;
    case 'putdown':tone(F,200,t,0.06,{type:'triangle',v:0.05});hiss(F,t,0.05,{type:'lowpass',f:700,v:0.06});break;
    case 'crunch':hiss(F,t,0.07,{type:'bandpass',f:rand(1400,2600),v:0.16,q:1.5});hiss(F,t+0.03,0.05,{type:'bandpass',f:rand(900,1600),v:0.1,q:2});break;
    case 'munch':hiss(F,t,0.09,{type:'bandpass',f:rand(500,900),v:0.16,q:1.2});tone(F,rand(140,190),t,0.06,{type:'triangle',v:0.04});break;
    case 'juicy':hiss(F,t,0.08,{type:'bandpass',f:rand(1100,1800),v:0.12,q:3});tone(F,rand(700,1000),t+0.02,0.05,{to:400,v:0.03});break;
    case 'gulp':tone(F,rand(260,320),t,0.11,{to:150,v:0.12});hiss(F,t,0.06,{type:'lowpass',f:500,v:0.05});break;
    case 'burp':tone(F,130,t,0.38,{type:'sawtooth',to:70,v:0.07,lp:500});break;
    case 'ahh':tone(F,520,t,0.4,{to:330,v:0.04,a:0.05});hiss(F,t,0.35,{type:'bandpass',f:900,v:0.03,a:0.08});break;
    case 'brew':for(let i=0;i<11;i++)hiss(F,t+i*0.18,0.1,{type:'bandpass',f:rand(250,550),v:0.07,q:5});hiss(F,t+0.6,1.5,{f:4000,v:0.04,a:0.3});tone(F,1320,t+BREW_TIME,0.4,{v:0.04});tone(F,1760,t+BREW_TIME+0.1,0.5,{v:0.03});break;
    case 'menu':[84,88,91].forEach((m,i)=>tone(F,mtof(m),t+i*0.09,0.25,{type:'triangle',v:0.04}));break;
    case 'door':tone(F,170,t,0.35,{type:'sawtooth',to:240,v:0.025,lp:700});hiss(F,t+0.3,0.05,{type:'bandpass',f:900,v:0.06});break;
    case 'lock':tone(F,1400,t,0.03,{type:'square',v:0.03,lp:3000});tone(F,900,t+0.05,0.03,{type:'square',v:0.03,lp:3000});break;
    case 'flush':hiss(F,t,1.8,{type:'lowpass',f:1400,v:0.16,a:0.05});for(let i=0;i<6;i++)hiss(F,t+0.4+i*0.18,0.14,{type:'bandpass',f:rand(250,500),v:0.06,q:5});tone(F,600,t+1.5,0.5,{to:300,v:0.03});break;
    case 'water':hiss(F,t,3,{type:'bandpass',f:1300,v:0.07,a:0.15,q:0.7});hiss(F,t,3,{type:'highpass',f:4500,v:0.025,a:0.15});break;
    case 'growl':tone(F,72,t,0.7,{type:'sawtooth',to:52,v:0.07,lp:220,a:0.08});hiss(F,t+0.1,0.5,{type:'lowpass',f:300,v:0.05,a:0.1});break;
    case 'yawn':tone(F,430,t,0.9,{to:230,v:0.035,a:0.12});hiss(F,t,0.8,{type:'bandpass',f:700,v:0.025,a:0.2});break;
    case 'cast':hiss(F,t,0.35,{type:'bandpass',f:2000,v:0.06,a:0.05});tone(F,900,t,0.3,{to:300,v:0.015});break;
    case 'plop':tone(F,500,t,0.12,{to:180,v:0.06});hiss(F,t,0.12,{type:'lowpass',f:900,v:0.06});break;
    case 'nibble':tone(F,700,t,0.05,{to:400,v:0.03});break;
    case 'bite':tone(F,320,t,0.2,{to:120,v:0.09});hiss(F,t,0.25,{type:'lowpass',f:1200,v:0.1});break;
    case 'hook':tone(F,660,t,0.08,{type:'square',v:0.03,lp:2000});tone(F,990,t+0.08,0.1,{type:'square',v:0.03,lp:2000});break;
    case 'reel':hiss(F,t,0.025,{type:'highpass',f:3500,v:0.035});break;
    case 'snap':hiss(F,t,0.06,{type:'highpass',f:2500,v:0.14});tone(F,1800,t,0.12,{type:'triangle',to:600,v:0.05});break;
    case 'landfish':hiss(F,t,0.3,{type:'lowpass',f:1400,v:0.12});for(let i=0;i<3;i++)tone(F,220,t+0.25+i*0.15,0.07,{type:'triangle',to:160,v:0.05});break;
    case 'g_hit':tone(F,880,t,0.05,{type:'square',v:0.05,lp:5000});break;
    case 'g_wall':tone(F,440,t,0.04,{type:'square',v:0.035,lp:4000});break;
    case 'g_score':[523,659,784,1047].forEach((f,i)=>tone(F,f,t+i*0.07,0.08,{type:'square',v:0.045,lp:5000}));break;
    case 'g_shoot':tone(F,1400,t,0.07,{type:'square',to:500,v:0.03,lp:5000});break;
    case 'g_boom':hiss(F,t,0.22,{type:'lowpass',f:1200,v:0.12,a:0.005});tone(F,160,t,0.18,{type:'square',to:50,v:0.05,lp:900});break;
    case 'g_die':tone(F,520,t,0.35,{type:'square',to:90,v:0.05,lp:2500});break;
    case 'g_eat':tone(F,1200,t,0.05,{type:'square',to:1700,v:0.035,lp:5000});break;
    case 'g_start':[392,523,659,784,1047].forEach((f,i)=>tone(F,f,t+i*0.06,0.07,{type:'square',v:0.04,lp:5000}));break;
    case 'thwack':hiss(F,t,0.05,{type:'bandpass',f:1800,v:0.12,q:2,a:0.002});tone(F,520,t,0.06,{type:'triangle',to:300,v:0.06});break;
    case 'shuttle':hiss(F,t,0.04,{type:'highpass',f:3000,v:0.07,a:0.002});tone(F,900,t,0.04,{type:'triangle',to:600,v:0.04});break;
    case 'bounce':tone(F,180,t,0.06,{to:120,v:0.07});hiss(F,t,0.03,{type:'lowpass',f:800,v:0.05});break;
    case 'whistle':tone(F,2600,t,0.25,{to:2500,v:0.04});tone(F,2650,t+0.02,0.22,{v:0.02});break;
    case 'lever':tone(F,240,t,0.12,{type:'square',to:120,v:0.05,lp:1200});hiss(F,t+0.05,0.25,{type:'bandpass',f:900,v:0.05,q:2});break;
    case 'reelstop':tone(F,150,t,0.07,{type:'square',v:0.06,lp:900});hiss(F,t,0.04,{type:'bandpass',f:1800,v:0.05,q:3});break;
    case 'coin':tone(F,1568,t,0.05,{type:'square',v:0.025,lp:6000});tone(F,2093,t+0.05,0.07,{type:'square',v:0.02,lp:6000});break;
    case 'bigwin':[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(F,f,t+i*0.09,0.12,{type:'square',v:0.045,lp:5000}));break;
    case 'beep':tone(F,1320,t,0.06,{type:'square',v:0.03,lp:5000});break;
    case 'clank':tone(F,rand(140,190),t,0.1,{type:'square',v:0.05,lp:900});hiss(F,t,0.05,{type:'bandpass',f:2400,v:0.04,q:3});break;
    case 'punch':hiss(F,t,0.08,{type:'lowpass',f:500,v:0.14,a:0.003});tone(F,90,t,0.08,{type:'sine',to:60,v:0.08});break;
    case 'spray':hiss(F,t,0.7,{type:'bandpass',f:3200,v:0.035,q:0.7,a:0.1});break;
    case 'deny':tone(F,190,t,0.09,{type:'square',v:0.04,lp:900});tone(F,150,t+0.11,0.12,{type:'square',v:0.04,lp:900});break;
  }
}
addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('button,.sw');if(b&&!b.disabled)sfx('ui');},true);

/* =========================================================
   Health, energy and the restroom
   Three needs change in real time with whatever you are doing (ACT). Food digests into health, drinks reach the
   bladder over a few minutes, caffeine kicks in and wears off, resting recovers energy, working drains it.
   The restroom has three private stalls: you are hidden while inside, and others only see "Occupied".
   ========================================================= */
const VITAL_DEFAULT={hp:85,en:85,bl:15,clean:true,st:0,stEn:0,fl:0,caf:0,cafIn:0,sw:0,ex:0,fresh:0};// sw sweat, ex recent exercise (minutes of effort), fresh energy still coming from a shower
// what each activity costs or gives, in points per minute. Health is how well fed you are.
const ACT={
  idle:{hp:-1.2,en:-0.8,label:'Standing'},
  walking:{hp:-1.6,en:-1.5,label:'Walking'},
  running:{hp:-3,en:-6,label:'Running'},
  swimming:{hp:-3.5,en:-7,label:'Swimming'},
  working:{hp:-2.2,en:-2.2,label:'Working at your desk'},
  resting:{hp:-1,en:5,label:'Resting'},
  eating:{hp:-0.5,en:0.5,label:'Eating'},
  restroom:{hp:-1,en:0,label:'In the restroom'},
  fishing:{hp:-1,en:-0.5,label:'Fishing'},
  reeling:{hp:-2,en:-8,label:'Reeling in a fish'},
  gaming:{hp:-1.2,en:-1.4,label:'Playing a game'},
  workout:{hp:-3,en:-6,label:'Working out'},// the real cost comes from the machine and level (GYM_KINDS)
  showering:{hp:-1,en:0,label:'Showering'},
  sport:{hp:-2.6,en:-4.5,label:'Playing a match'},// × how hard you move (see updateVitals)
  washing:{hp:-1,en:-0.8,label:'Washing your hands'}
};
// the body, per minute: food digests into health (and a little energy), drinks reach the bladder, caffeine kicks in then wears off
const BL_BASE=0.8,DIGEST=12,DIGEST_EN=5,FLUID=8,CAF_IN=15,CAF_OUT=4,FULL_AT=40,JUMP_COST=0.4;
const AWAY_BASE={hp:70,en:75,bl:30};// where needs settle while you are away (you ate and rested off-screen)
const V=Object.assign({},VITAL_DEFAULT,{growl:30,yawn:25,urge:20,focus:30,save:5,ui:0,warned:{},act:'idle',trend:{hp:0,en:0,bl:0}});
const vclamp=v=>clamp(+v||0,0,100);// keep full precision: per-frame changes are tiny (rounding happens on screen)
// what each item puts into your body; nothing lands instantly
function nutrition(f){
  if(f.id==='coffee')return{hp:0,en:4,fl:14,caf:42};
  if(f.id==='chai')return{hp:3,en:4,fl:12,caf:22};
  if(f.id==='water')return{hp:2,en:3,fl:20};
  if(f.cat==='drink')return{hp:6,en:8,fl:18};
  if(f.cat==='fruit')return{hp:14,en:7,fl:f.snd==='juicy'?9:4};
  return{hp:34,en:10,fl:5};// veg and non-veg meals
}
const eatTime=f=>isDrink(f)||f.cat==='fruit'?1.6:2.6;// a meal takes longer than fruit or a drink
const tooFull=f=>!isDrink(f)&&V.st>=FULL_AT;
// eating with unwashed hands after the restroom only does half the good; caffeine works less the more you already have
function applyNutrition(f){
  const n=nutrition(f),dirty=!V.clean&&!isDrink(f);
  V.st+=n.hp*(dirty?0.5:1);V.stEn+=n.en;V.fl+=n.fl||0;
  if(n.caf)V.cafIn+=n.caf*clamp(1-(V.caf+V.cafIn)/120,0.35,1);
  renderVitals();return dirty;
}
function vitalSpeed(){let s=1;if(V.en<10)s*=0.65;else if(V.en<25)s*=0.85;if(V.hp<10)s*=0.8;if(V.bl>=95)s*=0.85;return s;}
const canRun=()=>V.en>=10&&V.hp>=10;
// pixel icons for the three bars: heart (health), bolt (energy), drop (restroom)
$('#icHp').src=pixelIcon(['.rr.rr.','rhrrrrr','rrrrrrr','.rrrrr.','..rrr..','...r...'],{r:'#e0442e',h:'#ff8f6e'},2);
$('#icEn').src=pixelIcon(['...yy.','..yy..','.yyyy.','yyyy..','..yy..','.yy...','.y....'],{y:'#f2b632'},2);
$('#icBl').src=pixelIcon(['..b..','.bbb.','.bbb.','bhbbb','bhbbb','bbbbb','.bbb.'],{b:'#6fb7e8',h:'#d7eefc'},2);
// needs are kept per person on this browser. A short break changes nothing; a longer one moves them towards
// AWAY_BASE (everything you ate has digested); after 3 hours you come back fresh
function loadVitals(rec){
  const v=Store.get('ga_vitals',{})[kOf(rec)],away=v?(Date.now()-(v.at||0))/60000:Infinity;
  Object.assign(V,VITAL_DEFAULT);V.warned={};V.trend={hp:0,en:0,bl:0};
  if(v&&away<=180){
    for(const k of ['hp','en','bl','st','stEn','fl','caf','cafIn','sw','ex','fresh'])V[k]=k==='hp'||k==='en'||k==='bl'?vclamp(v[k]):Math.max(0,+v[k]||0);V.clean=v.clean!==false;
    if(away>2){const f=1-Math.exp(-away/60);for(const k in AWAY_BASE)V[k]=vclamp(V[k]+(AWAY_BASE[k]-V[k])*f);V.st=V.stEn=V.fl=V.cafIn=V.fresh=0;V.caf=Math.max(0,V.caf-CAF_OUT*away);V.sw=Math.max(0,V.sw-1.5*away);V.ex=Math.max(0,V.ex-0.15*away);if(away>30)V.clean=true;}
  }
  renderVitals();
}
function saveVitals(){if(!state.me)return;const all=Store.get('ga_vitals',{}),o={at:Date.now()};for(const k in VITAL_DEFAULT)o[k]=V[k];all[kOf(state.me)]=o;Store.set('ga_vitals',all);}
addEventListener('beforeunload',saveVitals);
function warnOnce(k,on,clear,msg){if(on&&!V.warned[k]){V.warned[k]=true;toast(msg,'',4200);}else if(clear&&V.warned[k])V.warned[k]=false;}
function currentActivity(P){
  if(arc.open)return 'gaming';if(gym.use)return 'workout';if(mt.on)return 'sport';if(rr.use)return rr.use.S.kind==='shower'?'showering':'restroom';if(rr.wash)return 'washing';if(P.eating)return 'eating';
  if(fishing.phase==='reel')return 'reeling';if(fishing.phase)return 'fishing';
  if(P.seat)return P.seat.desk?'working':'resting';
  if(P.anim.speed>0.1)return P.inWater?'swimming':P.anim.run?'running':'walking';
  return 'idle';
}
function updateVitals(dt){
  if(state.mode!=='world'||!state.player)return;
  const P=state.player,m=dt/60,a=currentActivity(P),A=ACT[a],b0={hp:V.hp,en:V.en,bl:V.bl};V.act=a;
  // the body is linked: hunger tires you faster, exhaustion and too much caffeine wear on your health
  let hp=A.hp*(V.en<10?1.3:1)-(V.caf>70?0.5:0),en=A.en*(a==='reeling'&&fishing.fish?fishing.fish.sp.str:1);
  // a workout costs what the machine and level cost, scaled by how far your heart rate has climbed; between sets you get your breath back
  if(a==='workout'){const K=GYM_KINDS[gym.use.kind],L=gym.lvl,eff=clamp((gym.hr-HR_CALM)/(K.hr[L]-HR_CALM),0.25,1);hp=(gym.rest>0?-1.2:K.hp[L]*eff)*(V.en<10?1.3:1);en=gym.rest>0?-0.5:K.en[L]*eff;}
  if(a==='sport'){const mv=P.anim.run?1.6:P.anim.speed>0.1?1.1:0.7;hp*=mv;en=A.en*mv;}// standing still between shots is easier than sprinting for one
  if(hp<0&&V.ex>0.5)hp*=1+Math.min(0.4,V.ex*0.04);// after exercise you get hungry sooner
  if(en<0)en*=V.hp<5?2:V.hp<20?1.5:1;
  else if(a==='resting')en*=(0.5+(100-V.en)/100)*(zoneAt(P.root.position.x,P.root.position.z)==='Lakeside'?1.3:1)*(P.seat&&P.seat.sofa?1.25:1)*(V.ex>=3?1.3:1);// rest helps most when you are tired; the lake and the sofas are the most relaxing, and you recover faster after a workout
  const d=Math.min(V.st,DIGEST*m),de=Math.min(V.stEn,DIGEST_EN*m);V.st-=d;V.stEn-=de;
  const ci=Math.min(V.cafIn,CAF_IN*m);V.cafIn-=ci;V.caf+=ci;
  if(V.cafIn<0.01){if(V.caf>8)en-=0.6;V.caf=Math.max(0,V.caf-CAF_OUT*m);}// wearing off: a small dip
  const fl=Math.min(V.fl,FLUID*m);V.fl-=fl;const fr=Math.min(V.fresh,2.5*m);V.fresh-=fr;
  V.hp=vclamp(V.hp+hp*m+d);V.en=vclamp(V.en+en*m+de+ci+fr);
  if(!rr.use||rr.use.S.kind==='shower')V.bl=vclamp(V.bl+(BL_BASE*m+fl)*(a==='workout'||a==='sport'?0.6:1));// in a stall it empties instead (updateRestroom); sweating sends less to the bladder
  if(a==='workout'&&!(gym.rest>0)){const K=GYM_KINDS[gym.use.kind];V.sw=vclamp(V.sw+K.sw[gym.lvl]*m*clamp((gym.hr-HR_CALM)/60,0.2,1.2));V.ex+=[0.5,1,1.5][gym.lvl]*m;}
  else if(a==='sport'){V.sw=vclamp(V.sw+6*m*(P.anim.run?1.5:1));V.ex+=m;}
  else if(a!=='showering'){V.sw=Math.max(0,V.sw-1.5*m);V.ex=Math.max(0,V.ex-0.15*m);}
  for(const k in V.trend){const r=(V[k]-b0[k])/Math.max(m,1e-6);V.trend[k]+=(r-V.trend[k])*Math.min(1,dt*1.5);}
  V.growl-=dt;V.yawn-=dt;V.urge-=dt;V.focus-=dt;
  if(V.hp<30&&V.st<5&&V.growl<=0&&!P.eating){V.growl=V.hp<10?20:45;sfx('growl');P.say(V.hp<10?'I’m starving…':'*stomach growls*',2200);}
  if(V.en<25&&V.yawn<=0&&!rr.use){V.yawn=V.en<10?15:35;sfx('yawn');P.anim.yawn=1.6;P.say(V.en<10?'So tired…':'*yawn*',2000);}
  if(V.bl>=75&&V.urge<=0&&!rr.use){V.urge=V.bl>=95?12:40;P.say(V.bl>=95?'I really need the restroom!':'I should find the restroom.',2400);}
  if(a==='working'&&V.focus<=0&&(V.en<15||V.hp<15||V.bl>=90)){V.focus=45;P.say(V.bl>=90?'Can’t focus. Restroom first.':V.en<15?'Can’t focus… I need a break.':'Can’t focus on an empty stomach.',2400);}
  warnOnce('hp',V.hp<30&&V.st<5,V.hp>45,'You’re getting hungry. Grab something from the Pantry counter.');
  warnOnce('en',V.en<25,V.en>40,'You’re low on energy. Have a coffee in the Pantry, or rest on a bench for a while.');
  warnOnce('sw',V.sw>=60,V.sw<30,'You’re sweaty after that workout. A shower in the Restroom would feel great.');
  warnOnce('bl',V.bl>=75,V.bl<50,'Time for a restroom break. The Restroom is west of the plaza.');
  V.save-=dt;if(V.save<=0){V.save=5;saveVitals();}
  V.ui-=dt;if(V.ui<=0){V.ui=0.5;renderVitals();}
}
// bars show what is still on its way (food digesting, drinks, caffeine) as a lighter segment, plus a trend arrow
function renderVitals(){
  const arrow=t=>t>4?'▲▲':t>0.3?'▲':t<-4?'▼▼':t<-0.3?'▼':'';
  const row=(k,v,bad,pend,tr)=>{$('#v'+k+'Bar').style.width=v+'%';const p=$('#v'+k+'Pend');p.style.left=v+'%';p.style.width=clamp(pend,0,100-v)+'%';
    $('#v'+k+'Num').textContent=Math.round(v);$('#v'+k+'Tr').textContent=arrow(tr);$('#v'+k).classList.toggle('low',bad);};
  row('Hp',V.hp,V.hp<30,V.st,V.trend.hp);row('En',V.en,V.en<25,V.stEn+V.cafIn+V.fresh,V.trend.en);row('Bl',V.bl,V.bl>=75,V.fl,V.trend.bl);
  const now=[V.act==='workout'&&gym.use?gymLabel():V.act==='sport'&&mt.on?'Playing '+SPORT[COURTS[mt.c].sport].name.toLowerCase():ACT[V.act].label];if(V.st>0.5)now.push('digesting');if(V.fresh>0.5)now.push('refreshed');if(V.cafIn>0.5)now.push('caffeine kicking in');else if(V.caf>8)now.push('caffeine wearing off');
  $('#vAct').textContent=now.join(' · ');
  const w=[];if(V.hp<10)w.push('Starving');else if(V.hp<30&&V.st<5)w.push('Hungry');if(V.st>=FULL_AT)w.push('Full');if(V.en<10)w.push('Exhausted');else if(V.en<25)w.push('Tired');if(V.caf>70)w.push('Jittery');
  if(V.bl>=95)w.push('Restroom: urgent');else if(V.bl>=75)w.push('Needs the restroom');if(!V.clean)w.push('Wash your hands');if(V.sw>=60)w.push('Sweaty');
  const el=$('#vWarn');el.textContent=w.join(' · ');el.hidden=!w.length;
}
/* ---------- restroom: stalls and sinks ---------- */
const rr={use:null,wash:null};
const SINKS=()=>SPOTS.filter(s=>s.zone==='restroom'&&s.pose==='wash');
function nearestStall(){const P=state.player;if(!P)return null;const p=P.root.position;let best=null,bd=1.3;for(const S of STALLS){const d=Math.hypot(S.at.x-p.x,S.at.z-p.z);if(d<bd){bd=d;best=S;}}return best;}
function nearestSink(){const P=state.player;if(!P)return null;const p=P.root.position;if(p.x<-27.6||p.x>-21.4||p.z>-3.4)return null;let best=null,bd=0.7;for(const s of SINKS()){const d=Math.abs(s.x-p.x);if(d<bd){bd=d;best=s;}}return best;}
function startRestroom(S){
  const P=state.player;if(!P||rr.use||rr.wash||P.eating||P.seat||gym.use)return;
  if(S.occ){P.say('Occupied. I’ll try another one.',1600);sfx('deny');return;}
  if(P.held){P.dropHeld();toast('You left your food outside the '+(S.kind==='shower'?'shower':'stall')+'.','',2200);}
  if(P.rodMesh)stowRod('You put the fishing rod away.');
  S.occ='me';S.swing=0.7;rr.use={S,t:0,dur:S.kind==='shower'?clamp(6+V.sw*0.06,6,12):clamp(3+V.bl*0.05,3,8),hidden:false,bl0:V.bl,sw0:V.sw,sprayT:0};P.faceTo(S.face.x,S.face.z);sfx('door');
}
function startWash(s){
  const P=state.player;if(!P||rr.use||rr.wash||P.eating)return;
  if(P.held||P.rodMesh){P.say(P.rodMesh?'Put the rod away first (Q).':'Hands full! Put the food down first (Q).',1800);return;}
  P.root.position.x=s.x;P.heading=Math.PI;rr.wash={t:0,s};sfx('water');
}
function endRestroom(){
  const U=rr.use,P=state.player;if(!U)return;rr.use=null;U.S.occ=null;U.S.swing=0.7;
  if(P){P.root.visible=true;P.hiddenInStall=false;P.root.position.set(U.S.out.x,0,U.S.out.z);P.heading=U.S.outH;}
}
function updateRestroom(dt){
  // stall doors: wide open while someone steps in or out, shut while occupied, ajar when free
  for(const S of STALLS){S.swing=Math.max(0,S.swing-dt);const want=(S.swing>0?-1.35:S.occ?0:-0.35)*S.dir;S.ang+=(want-S.ang)*(1-Math.exp(-dt*8));S.pivot.rotation.y=S.ang;S.sign.material=S.occ?STALL_MAT.occ:STALL_MAT.free;
    if(S.occ&&!reduceMotion&&S.kind==='shower'&&Math.random()<dt*7)spawnP(S.hum.x+rand(-0.7,0.7),S.hum.y,S.hum.z+rand(-0.6,0.6),rand(-0.05,0.05),0.35,rand(-0.05,0.05),2.2,0.12,pick(['#ffffff','#e8f4fa','#d7eefc']),-0.05);// steam over the shower
    else if(S.occ&&!reduceMotion&&Math.random()<dt*1.6)spawnP(S.hum.x,S.hum.y,S.hum.z+rand(-0.3,0.3),rand(-0.08,0.08),0.45,rand(-0.08,0.08),1.6,0.08,pick(['#7fc4f0','#f2b632','#c9ecf8']),-0.15);}// a little humming from inside
  const P=state.player,U=rr.use;
  if(U&&P){U.t+=dt;
    if(!U.hidden&&U.t>0.35){U.hidden=true;P.root.visible=false;P.hiddenInStall=true;P.root.position.set(U.S.spot.x,0,U.S.spot.z);sfx('lock');if(state.selected===P)closeCard();}
    if(U.hidden&&U.S.kind==='shower'){V.sw=Math.max(0,V.sw-U.sw0/U.dur*dt);U.sprayT-=dt;if(U.sprayT<=0){U.sprayT=0.55;sfx('spray');}}
    else if(U.hidden)V.bl=Math.max(0,V.bl-U.bl0/U.dur*dt);
    if(U.S.kind==='shower'&&U.t>=U.dur+0.35){endRestroom();sfx('door');V.sw=0;V.clean=true;V.fresh+=6;renderVitals();P.say('Fresh and clean!',2000);}// a shower perks you up a little, over the next few minutes
    else if(U.t>=U.dur+0.35){endRestroom();sfx('flush');V.bl=0;V.clean=false;renderVitals();P.say('All done. Now to wash my hands.',2400);}}
  const W=rr.wash;
  if(W&&P){W.t+=dt;if(!reduceMotion&&Math.random()<dt*14)spawnP(W.s.x+rand(-0.04,0.04),1.02,-5.75,rand(-0.05,0.05),-0.4,rand(0,0.1),0.45,0.035,Math.random()<0.7?'#9fd8f5':'#ffffff',6);
    if(W.t>=3){rr.wash=null;V.clean=true;renderVitals();P.say('Squeaky clean!',1600);sfx('catch');}}
}
const _sv=new THREE.Vector3();
function updateStallLabels(){
  for(const S of STALLS){
    if(!S.label){S.label=document.createElement('div');S.label.className='stall-label';S.label.hidden=true;labels.appendChild(S.label);}
    const el=S.label,mine=S.occ==='me'&&rr.use&&rr.use.S===S;
    if(!S.occ||state.mode!=='world'){if(!el.hidden)el.hidden=true;continue;}
    _sv.set(S.lab.x,S.lab.y,S.lab.z);_sv.project(camera);
    if(_sv.z>1||_sv.z<-1||Math.abs(_sv.x)>1.1||Math.abs(_sv.y)>1.1){el.hidden=true;continue;}
    const w=stage.clientWidth,h=stage.clientHeight,html=mine?'<span>'+(S.kind==='shower'?'Showering':'Using the restroom')+'</span><i class="prog"><b style="width:'+Math.min(100,rr.use.t/(rr.use.dur+0.35)*100).toFixed(0)+'%"></b></i>':'<span>Occupied</span>';
    if(el._h!==html){el.innerHTML=html;el._h=html;}el.className='stall-label'+(mine?' mine':'');el.hidden=false;
    el.style.transform='translate('+((_sv.x*0.5+0.5)*w).toFixed(1)+'px,'+((-_sv.y*0.5+0.5)*h).toFixed(1)+'px) translate(-50%,-100%)';
  }
}
// a remote player in a stall: hidden, the stall shows Occupied; frees it when they come out or leave
function freeStallOf(ch){if(ch.inStall&&ch.inStall.occ===ch.id){ch.inStall.occ=null;ch.inStall.swing=0.7;}ch.inStall=null;}

/* =========================================================
   Fishing
   Fish of eight species swim in the lake. Take a rod from the stand by the lake path, face the water and press E
   to cast. A fish swims up, nibbles, then bites: strike (E) within about a second. Then hold E to reel while keeping
   the line tension out of the red; the fish surges and tires. Land it, then keep it or release it. Casting costs a
   little energy, waiting is calm, reeling is hard work (more for strong fish); dusk, dawn and night change the bites.
   ========================================================= */
const FISH=[// odds: how common; str: how hard it fights; night/day: when it bites most
  {id:'tilapia',name:'Tilapia',rar:'Common',w:[0.3,1.2],odds:26,str:0.6,size:0.5,cols:['#7f8f86','#a9b6ad','#5d6b63']},
  {id:'rohu',name:'Rohu',rar:'Common',w:[0.8,3.5],odds:22,str:0.8,size:0.65,cols:['#c9ccd2','#e7e9ec','#c46a5a']},
  {id:'carp',name:'Common carp',rar:'Common',w:[1,5],odds:20,str:0.9,size:0.7,cols:['#b08a4a','#d8b878','#7a5a2a']},
  {id:'catla',name:'Catla',rar:'Uncommon',w:[2,8],odds:12,str:1.1,size:0.8,cols:['#8a949e','#c9d0d6','#4f5860']},
  {id:'catfish',name:'Catfish',rar:'Uncommon',w:[1.5,9],odds:10,str:1.2,size:0.85,night:true,cols:['#4a4f52','#6d7377','#2e3133']},
  {id:'trout',name:'Rainbow trout',rar:'Rare',w:[0.8,4],odds:5,str:1.0,size:0.6,day:true,cols:['#9aa89a','#c8d2c8','#5f7060']},
  {id:'koi',name:'Koi',rar:'Rare',w:[1,6],odds:4,str:0.9,size:0.7,cols:['#f4f1ea','#ffffff','#ef7f2a']},
  {id:'mahseer',name:'Golden mahseer',rar:'Legendary',w:[5,18],odds:1,str:1.6,size:1.0,cols:['#e8b032','#ffd86a','#a8761a']}
];
const FISH_BY=Object.fromEntries(FISH.map(s=>[s.id,s]));
const FISH_RACK={x:-3.6,z:16.2};// the rod stand by the lake path (built in buildFurniture)
const FISH_MAP=['....bbbb..t','..bbbbbbbtt','bebbbbbbbtt','bbbbbbbbbtt','..llllll.tt','....llll..t'];
const fishIcon=sp=>pixelIcon(FISH_MAP,{b:sp.cols[0],l:sp.cols[1],t:sp.cols[2],e:'#18110b'},4);
// which fish bite depends on the time of day: catfish feed at night, trout by day
const timeBias=sp=>{const night=DN.level<0.3;return sp.night?(night?3:0.6):sp.day?(night?0.3:1.2):1;};
function pickSpecies(){const w=FISH.map(s=>s.odds*timeBias(s)),tot=w.reduce((a,b)=>a+b,0);let r=Math.random()*tot;for(let i=0;i<FISH.length;i++){r-=w[i];if(r<=0)return FISH[i];}return FISH[0];}
const biteRate=()=>DN.level>0.2&&DN.level<0.8?1.6:DN.level<=0.2?1.15:1;// fish feed most at dusk and dawn
function buildFish(sp){
  const g=new THREE.Group(),s=sp.size,c=sp.cols;
  db(g,0,0,0,0.12*s,0.2*s,0.5*s,c[0]);db(g,0,-0.06*s,0.02*s,0.1*s,0.07*s,0.42*s,c[1]);db(g,0,0.12*s,0,0.03*s,0.07*s,0.2*s,c[2]);
  const tail=grp(g,0,0,-0.25*s);db(tail,0,0,-0.07*s,0.04*s,0.2*s,0.14*s,c[2]);
  for(const e of [-1,1])db(g,e*0.062*s,0.04*s,0.18*s,0.006,0.04*s,0.04*s,'#18110b');
  if(sp.id==='koi'){db(g,0,0.101*s,0.06*s,0.122*s,0.006,0.14*s,'#e0442e');db(g,0,0.101*s,-0.1*s,0.122*s,0.006,0.08*s,'#ef7f2a');}
  if(sp.id==='catfish')for(const e of [-1,1])db(g,e*0.05*s,-0.03*s,0.3*s,0.01,0.01,0.14*s,'#2e3133');
  if(sp.id==='trout')db(g,0,0.02*s,0,0.124*s,0.045*s,0.44*s,'#e8a0b0');
  if(sp.id==='mahseer')db(g,0,0.05*s,0,0.124*s,0.05*s,0.4*s,'#ffd86a');
  return{root:g,tail};
}
/* ---------- fish in the lake ---------- */
const LAKE_FISH=[];
function lakeSpot(away){for(let i=0;i<60;i++){const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*0.85,x=Math.sin(a)*17*r,z=31+Math.cos(a)*8.5*r;if(lakeE(x,z)<0.85&&(!away||Math.hypot(x-away.x,z-away.z)>7))return{x,z};}return{x:8,z:31};}
function addLakeFish(sp,at){const m=buildFish(sp),p=at||lakeSpot(),f={sp,root:m.root,tail:m.tail,x:p.x,z:p.z,y:-0.32,h:Math.random()*6.3,t:lakeSpot(),spd:rand(0.5,1.1),ph:Math.random()*6,jump:0,boost:0,hooked:false,to:null};
  m.root.position.set(f.x,f.y,f.z);scene.add(m.root);LAKE_FISH.push(f);return f;}
function removeLakeFish(f){scene.remove(f.root);const i=LAKE_FISH.indexOf(f);if(i>=0)LAKE_FISH.splice(i,1);}
for(let i=0;i<12;i++)addLakeFish(pickSpecies());
function updateLakeFish(dt){
  for(const f of LAKE_FISH){
    if(f.hooked)continue;f.ph+=dt*(f.boost>0?16:7);f.tail.rotation.y=Math.sin(f.ph)*0.5;f.boost=Math.max(0,f.boost-dt);
    if(f.jump>0){f.jump-=dt;const k=1-f.jump/0.9;f.y=-0.3+Math.sin(k*Math.PI)*0.85;f.root.rotation.x=-Math.cos(k*Math.PI)*0.9;
      if(f.jump<=0){f.y=-0.32;f.root.rotation.x=0;burst(f.x,-0.15,f.z,10,['#d7eefc','#8fd0f5','#ffffff'],1.6,0.07);ringWave(f.x,-0.16,f.z,0xd7eefc);}}
    const tx=f.to?f.to.x:f.t.x,tz=f.to?f.to.z:f.t.z,dx=tx-f.x,dz=tz-f.z,d=Math.hypot(dx,dz),sp=f.spd*(f.boost>0?2.4:1)*(f.to?1.3:1);
    if(d<0.3&&!f.to)f.t=lakeSpot();
    else if(d>0.05){const st=Math.min(d,sp*dt);f.x+=dx/d*st;f.z+=dz/d*st;f.h=angleLerp(f.h,Math.atan2(dx,dz),1-Math.exp(-dt*4));}
    if(f.jump<=0)f.y=-0.32+Math.sin(f.ph*0.3)*0.04;
    if(f.jump<=0&&!f.to&&Math.random()<dt/45&&!reduceMotion){f.jump=0.9;burst(f.x,-0.15,f.z,6,['#d7eefc','#ffffff'],1.2,0.06);if(state.player&&state.player.root.position.distanceTo(f.root.position)<16)sfx('plop');}
    f.root.position.set(f.x,f.y,f.z);f.root.rotation.y=f.h;
  }
}
/* ---------- line, bobber and rod tip (for you and for other players in a room) ---------- */
const LINE_MAT=new THREE.MeshBasicMaterial({color:0xf4f1ea}),BOB_RED=new THREE.MeshLambertMaterial({color:0xe0442e}),BOB_WHITE=new THREE.MeshLambertMaterial({color:0xf4f1ea});
// where the rod tip is, worked out from the avatar's shoulder, the held-rod arm angle and the facing
function rodTip(ch){const p=ch.root.position,h=ch.root.rotation.y,x=-0.34,y=2.07,z=1.88;return{x:p.x+x*Math.cos(h)+z*Math.sin(h),y:p.y+y,z:p.z-x*Math.sin(h)+z*Math.cos(h)};}
function fishGfx(ch){
  if(ch.fishGfx)return ch.fishGfx;
  const bob=new THREE.Group();const t=new THREE.Mesh(UNIT_BOX,BOB_RED);t.scale.set(0.11,0.08,0.11);t.position.y=0.05;bob.add(t);const b=new THREE.Mesh(UNIT_BOX,BOB_WHITE);b.scale.set(0.1,0.06,0.1);bob.add(b);
  const line=new THREE.Mesh(UNIT_BOX,LINE_MAT);bob.visible=line.visible=false;scene.add(bob);scene.add(line);
  return(ch.fishGfx={bob,line});
}
// draws the line from the rod tip to (x,y,z), or hides it
function drawLine(ch,to){
  ch.lineTo=to&&ch.rodMesh?to:null;const g=fishGfx(ch);g.bob.visible=g.line.visible=!!to&&!!ch.rodMesh;if(!g.line.visible)return;
  const tip=rodTip(ch);g.bob.position.set(to.x,to.y,to.z);const dx=to.x-tip.x,dy=to.y-tip.y,dz=to.z-tip.z,len=Math.hypot(dx,dy,dz)||0.01;
  g.line.position.set((tip.x+to.x)/2,(tip.y+to.y)/2,(tip.z+to.z)/2);g.line.scale.set(0.012,0.012,len);g.line.lookAt(to.x,to.y,to.z);
}
function clearFishGfx(ch){if(!ch.fishGfx)return;scene.remove(ch.fishGfx.bob);scene.remove(ch.fishGfx.line);ch.fishGfx=null;}
/* ---------- your fishing ---------- */
const fishing={phase:null,t:0,tx:0,tz:0,from:null,dist:0,maxDist:0,waitT:0,fish:null,nib:0,nibT:0,win:1,ten:0,stam:1,surge:0,surgeT:3,slack:0,clickT:0,catch:null,hold:false};
const fishLog=()=>{const all=Store.get('ga_fish',{}),k=myKey();return(all[k]=all[k]||{kept:[],rel:0,best:{}});};
function saveFishLog(log){const all=Store.get('ga_fish',{});all[myKey()]=log;Store.set('ga_fish',all);}
const nearRack=()=>{const P=state.player;return !!P&&Math.hypot(P.root.position.x-FISH_RACK.x,P.root.position.z-FISH_RACK.z)<1.7;};
// the furthest open water in front of you, within a cast (shorter when you are tired)
function castTarget(P){const p=P.root.position,h=P.heading,max=4+3*clamp(V.en/100,0,1);
  for(let d=max;d>=2.5;d-=0.5){const x=p.x+Math.sin(h)*d,z=p.z+Math.cos(h)*d;if(lakeE(x,z)<0.9&&cellTop(x,z)<-0.5&&!(Math.abs(x)<1.3&&z<31.8))return{x,z,d};}return null;}
function takeRod(){const P=state.player;if(!P||P.rodMesh)return;if(P.held){P.say('Hands full! Put the food down first (Q).',1800);return;}P.holdRod();sfx('pick');P.say('Gone fishing.',1400);}
function stowRod(msg){const P=state.player;if(!P||!P.rodMesh)return;endFishing();P.dropRod();clearFishGfx(P);if(msg!==false)toast(msg||'You put the fishing rod back on the stand.','',2200);}
function endFishing(){const f=fishing.fish;if(f&&fishing.phase!=='caught'){f.hooked=false;f.to=null;f.boost=2;f.t=lakeSpot(f);}fishing.phase=null;fishing.fish=null;fishing.catch=null;
  if(state.player){state.player.anim.reel=false;drawLine(state.player,null);}$('#fishUI').hidden=true;$('#catchCard').hidden=true;}
function cast(){
  const P=state.player;if(!P||!P.rodMesh||fishing.phase||P.inWater)return;
  if(V.en<8){P.say('Too tired to cast…',1800);sfx('deny');return;}
  const T=castTarget(P);if(!T){P.say('I need to face open water.',1800);return;}
  fishing.phase='cast';fishing.t=0;fishing.tx=T.x;fishing.tz=T.z;fishing.maxDist=T.d+4;fishing.from={x:P.root.position.x,z:P.root.position.z};
  P.anim.cast=0.6;V.en=vclamp(V.en-0.6);sfx('cast');
}
function startWait(){fishing.phase='wait';fishing.waitT=rand(4,12)/biteRate();fishing.fish=null;fishing.nib=0;fishing.nibT=0;}
function scare(f){if(!f)return;f.to=null;f.boost=2.5;f.t=lakeSpot({x:fishing.tx,z:fishing.tz});}
// E while fishing: strike at a bite, or too early
function strike(){
  const P=state.player;
  if(fishing.phase==='bite'){const f=fishing.fish;f.hooked=true;fishing.phase='reel';fishing.ten=0.25;fishing.stam=1;fishing.slack=0;fishing.surgeT=rand(1,2.5);
    fishing.dist=Math.hypot(fishing.tx-P.root.position.x,fishing.tz-P.root.position.z);fishing.w=Math.round((f.sp.w[0]+(f.sp.w[1]-f.sp.w[0])*Math.pow(Math.random(),1.8))*10)/10;
    sfx('hook');P.say('Fish on!',1400);$('#fishUI').hidden=false;return;}
  if(fishing.phase==='wait'){if(fishing.fish&&fishing.fish.to){scare(fishing.fish);P.say('Too early! It swam off.',1800);startWait();}else P.say('Nothing yet. Patience…',1500);}
}
function fishAction(){if(!fishing.phase)cast();else if(fishing.phase==='wait'||fishing.phase==='bite')strike();}
function landFish(){
  const P=state.player,f=fishing.fish;fishing.phase='caught';P.anim.reel=false;$('#fishUI').hidden=true;
  fishing.catch={sp:f.sp,w:fishing.w};sfx('landfish');P.anim.celebrate=0.8;
  const log=fishLog(),best=log.best[f.sp.id]||0,pb=fishing.w>best;
  $('#catchBody').innerHTML='<img class="fish-ico" src="'+fishIcon(f.sp)+'" alt=""><div><div class="catch-name">'+esc(f.sp.name)+'</div><div class="catch-meta">'+fishing.w.toFixed(1)+' kg <span class="chip rar-'+f.sp.rar.toLowerCase()+'">'+f.sp.rar+'</span>'+(pb?' <span class="chip">Personal best</span>':'')+'</div></div>';
  $('#catchCard').hidden=false;
}
function keepFish(){
  if(fishing.phase!=='caught')return;const c=fishing.catch,log=fishLog();
  log.kept=[{id:c.sp.id,w:c.w,at:Date.now()},...log.kept].slice(0,50);log.best[c.sp.id]=Math.max(log.best[c.sp.id]||0,c.w);saveFishLog(log);
  removeLakeFish(fishing.fish);addLakeFish(pickSpecies(),lakeSpot({x:fishing.tx,z:fishing.tz}));
  fishing.fish=null;toast('You kept the '+esc(c.sp.name)+' ('+c.w.toFixed(1)+' kg). It’s in your catch log (Menu).','',3200,fishIcon(c.sp));endFishing();
}
function releaseFish(){
  if(fishing.phase!=='caught')return;const P=state.player,c=fishing.catch,f=fishing.fish,log=fishLog();
  log.rel++;log.best[c.sp.id]=Math.max(log.best[c.sp.id]||0,c.w);saveFishLog(log);
  const h=P.heading,tx=P.root.position.x+Math.sin(h)*3,tz=P.root.position.z+Math.cos(h)*3,ok=lakeE(tx,tz)<0.95;
  const to=ok?{x:tx,z:tz}:{x:fishing.tx,z:fishing.tz};P.anim.give=0.55;sfx('cast');
  fly(f.root,()=>rodTip(P),()=>({x:to.x,y:-0.3,z:to.z}),0.7,1.4,()=>{scene.add(f.root);f.hooked=false;f.x=to.x;f.z=to.z;f.y=-0.32;f.boost=3;f.t=lakeSpot(to);burst(to.x,-0.15,to.z,14,['#d7eefc','#8fd0f5','#ffffff'],1.8,0.07);ringWave(to.x,-0.16,to.z,0xd7eefc);sfx('splash');},null);
  fishing.fish=null;P.say('Off you go!',1400);endFishing();
}
function updateFishing(dt){
  const P=state.player;if(!P||state.mode!=='world')return;
  const F=fishing;if(!F.phase){drawLine(P,null);return;}
  F.t+=dt;const by=-0.12+Math.sin(F.t*3)*0.015;
  if(F.phase==='cast'){const k=clamp((F.t-0.3)/0.4,0,1),tip=rodTip(P);
    if(k>0)drawLine(P,{x:tip.x+(F.tx-tip.x)*k,y:tip.y+(by-tip.y)*k+Math.sin(k*Math.PI)*1.6,z:tip.z+(F.tz-tip.z)*k});
    if(k>=1){sfx('plop');ringWave(F.tx,-0.16,F.tz,0xd7eefc);startWait();}return;}
  if(F.phase==='wait'){
    let y=by;F.waitT-=dt;
    if(F.waitT<=0&&!F.fish){const sp=pickSpecies();let f=null,bd=1e9;for(const o of LAKE_FISH)if(o.sp===sp&&!o.hooked){const d=Math.hypot(o.x-F.tx,o.z-F.tz);if(d<bd){bd=d;f=o;}}
      if(!f||bd>14){const near={x:F.tx+rand(-6,6),z:F.tz+rand(-4,4)};f=addLakeFish(sp,lakeE(near.x,near.z)<0.85?near:lakeSpot());}// a fish of that kind comes in from nearby
      f.to={x:F.tx,z:F.tz};F.fish=f;F.nib=Math.floor(rand(0,3));F.nibT=0;}
    const f=F.fish;
    if(f&&Math.hypot(f.x-F.tx,f.z-F.tz)<0.45){F.nibT-=dt;
      if(F.nibT<=0){if(F.nib>0){F.nib--;F.nibT=0.8;sfx('nibble');}else{F.phase='bite';F.t=0;F.win=f.sp.rar==='Legendary'?0.7:f.sp.rar==='Rare'?0.85:1.1;sfx('bite');P.say('!',700,'alert');ringWave(F.tx,-0.16,F.tz,0xd7eefc);}}
      if(F.nibT>0.55)y-=0.05;}
    drawLine(P,{x:F.tx,y,z:F.tz});return;}
  if(F.phase==='bite'){drawLine(P,{x:F.tx,y:-0.32,z:F.tz});if(F.t>F.win){scare(F.fish);P.say('It took the bait and got away.',2000);startWait();}return;}
  if(F.phase==='reel'){
    const f=F.fish,sp=f.sp,heavy=(F.w-sp.w[0])/Math.max(0.1,sp.w[1]-sp.w[0]),str=sp.str*(0.7+0.6*heavy),hold=F.hold||keys.has('e');
    F.surgeT-=dt;if(F.surgeT<=0){F.surge=rand(0.5,1.2)*(0.4+0.6*F.stam);F.surgeT=rand(2,4.5);burst(f.x,-0.12,f.z,8,['#d7eefc','#ffffff'],1.4,0.06);sfx('splash');if(hold)V.en=vclamp(V.en-0.15);}
    F.surge=Math.max(0,F.surge-dt);const pull=str*(0.3+0.7*F.stam)*(F.surge>0?2.2:1),effort=V.en<10?0.4:V.en<25?0.7:1;
    if(hold){F.dist-=1.5*effort*(1-0.35*Math.min(1,pull))*dt;F.ten+=(0.16+pull*0.5)*dt;F.slack=0;F.clickT-=dt;if(F.clickT<=0){F.clickT=0.09;sfx('reel');}}
    else{F.ten-=0.7*dt;F.dist+=pull*0.8*dt;F.slack+=dt;}
    F.ten=clamp(F.ten,0,1.05);F.stam=Math.max(0,F.stam-dt*(0.03+F.ten*0.1)/Math.max(0.6,str*0.8));P.anim.reel=hold;
    // the fish fights at the surface along your line
    const p=P.root.position,dx=F.tx-p.x,dz=F.tz-p.z,L=Math.hypot(dx,dz)||1,wig=Math.sin(F.t*2.3)*0.9*(0.3+F.stam);
    f.x=p.x+dx/L*F.dist+(-dz/L)*wig;f.z=p.z+dz/L*F.dist+(dx/L)*wig;f.y=-0.22+(F.surge>0?Math.sin(F.t*20)*0.08:0);f.h=Math.atan2(-dx,-dz);f.tail.rotation.y=Math.sin(F.t*18)*0.6;
    f.root.position.set(f.x,f.y,f.z);f.root.rotation.y=f.h;drawLine(P,{x:f.x,y:f.y+0.1,z:f.z});
    $('#fishTen').style.width=Math.min(100,F.ten*100)+'%';$('#fishTen').className=F.ten>0.9?'red':F.ten>0.7?'amber':'';$('#fishDist').textContent=F.dist.toFixed(1)+' m';
    if(F.ten>=1){sfx('snap');P.say('Snap! The line broke.',2200);endFishing();return;}
    if(F.dist>F.maxDist||F.slack>4){P.say(F.slack>4?'The line went slack and it slipped off.':'It swam out of reach.',2200);endFishing();return;}
    if(F.dist<=1.3)landFish();
    return;}
  if(F.phase==='caught'){const tip=rodTip(P),f=F.fish;f.root.position.set(tip.x,tip.y-0.35,tip.z);f.root.rotation.set(Math.PI/2,P.root.rotation.y,0);f.tail.rotation.y=Math.sin(F.t*14)*0.5;drawLine(P,{x:tip.x,y:tip.y-0.2,z:tip.z});}
}
function fishPrompt(kh){
  const F=fishing,P=state.player;
  if(F.phase==='cast')return 'Casting…';
  if(F.phase==='wait')return 'Waiting for a bite… · '+kh+' to strike · move to reel in';
  if(F.phase==='bite')return 'A bite! '+kh+' now!';
  if(F.phase==='reel')return (coarse?'Hold <span class="key">Use</span>':'Hold <span class="key">E</span>')+' to reel · keep the tension out of the red';
  if(F.phase==='caught')return '<span class="key">K</span> keep · <span class="key">R</span> release';
  return P&&castTarget(P)?kh+' to cast'+(coarse?'':' · <span class="key">Q</span> put the rod away'):'Face the open water to cast'+(coarse?'':' · <span class="key">Q</span> put the rod away');
}
$('#cKeep').addEventListener('click',keepFish);$('#cRelease').addEventListener('click',releaseFish);

/* =========================================================
   Playroom and arcade
   Five retro cabinets (ARCADES, built in buildFurniture), one game each, played full screen on a 384x216 canvas.
   Alone, versus games give you a computer opponent. In a room a second person can join a cabinet in use as Player 2:
   Player 1's browser runs the game and streams it (sendDm 'st'); Player 2 sends their buttons ('in').
   ========================================================= */
const ARC_W=384,ARC_H=216,ARC_S=3,ARC_STEP=1/60;// games draw in 384x216 units on a canvas 3x that size, so text is sharp
const arcCanvas=$('#arcCanvas');arcCanvas.width=ARC_W*ARC_S;arcCanvas.height=ARC_H*ARC_S;const arcG=arcCanvas.getContext('2d');arcG.setTransform(ARC_S,0,0,ARC_S,0,0);arcG.imageSmoothingEnabled=false;
const AP={p1:'#4fd3ff',p2:'#ff6fae',cpu:'#c4b49a',gold:'#f2b632',red:'#e0442e',green:'#6cbf4c',ink:'#f6ecd6',dim:'#7a7f9a'};
function atxt(g,s,x,y,size,col,align){g.font='700 '+size+'px '+(size>=14?FONT_PIX:FONT_UI);g.textAlign=align||'center';g.fillStyle='#000';g.fillText(s,x+1,y+1);g.fillStyle=col||AP.ink;g.fillText(s,x,y);}
const abox=(g,x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function abg(g,top,bot){const gr=g.createLinearGradient(0,0,0,ARC_H);gr.addColorStop(0,top);gr.addColorStop(1,bot);g.fillStyle=gr;g.fillRect(0,0,ARC_W,ARC_H);}
const pcol=(s,i)=>i===0?AP.p1:s.two?AP.p2:AP.cpu;
const B_U=1,B_D=2,B_L=4,B_R=8,B_A=16;
const toIn=b=>({u:!!(b&B_U),d:!!(b&B_D),l:!!(b&B_L),r:!!(b&B_R),a:!!(b&B_A)});
/* ---------- the five games: init(two), step(s,inputs,dt), draw(g,s), score(s) ---------- */
function snakeRound(s){s.sn=[{b:[[6,9],[5,9],[4,9]],d:[1,0],n:[1,0],alive:true,g:0},{b:[[25,9],[26,9],[27,9]],d:[-1,0],n:[-1,0],alive:true,g:0}];s.ap=snakeFree(s);s.pause=1.2;}
function snakeFree(s){for(let i=0;i<200;i++){const c=[Math.floor(Math.random()*30)+1,Math.floor(Math.random()*16)+1];if(!s.sn.some(z=>z.b.some(p=>p[0]===c[0]&&p[1]===c[1])))return c;}return[16,9];}
const snakeHit=(s,c)=>c[0]<0||c[1]<0||c[0]>31||c[1]>17||s.sn.some(z=>z.alive&&z.b.some(p=>p[0]===c[0]&&p[1]===c[1]));
function orchWave(s){s.wave++;s.en=[];for(let r=0;r<3;r++)for(let c=0;c<8;c++)s.en.push({x:80+c*32,y:30+r*20,hx:80+c*32,hy:30+r*20,t:Math.random()*6,hp:r===0?2:1,k:r,dv:0});}
function brickLevel(s){s.lvl++;s.br=[];for(let r=0;r<6;r++)for(let c=0;c<12;c++)s.br.push([16+c*30,26+r*11,r<2&&s.lvl>1?2:1,r]);s.ball={x:0,y:0,vx:0,vy:0,stuck:0};}
const GAMES=[
  {id:'paddle',name:'Paddle Duel',mode:'versus',col:'#4fd3ff',goal:'First to 7 points',
    init:two=>({t:0,two,sc:[0,0],p:[108,108],b:{x:192,y:108,vx:0,vy:0},serve:1.2,dir:Math.random()<0.5?-1:1,tr:[],over:false,win:-1}),
    step(s,I,dt){s.t+=dt;if(s.over)return;
      for(let i=0;i<2;i++){const v=i===1&&!s.two?clamp(((s.b.vx>0?s.b.y:108)-s.p[1])/10,-1,1)*0.8:(I[i].d?1:0)-(I[i].u?1:0);s.p[i]=clamp(s.p[i]+v*190*dt,24,192);}
      const b=s.b;if(s.serve>0){s.serve-=dt;b.x=192;b.y=108;if(s.serve<=0){b.vx=150*s.dir;b.vy=rand(-70,70);}return;}
      b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.y<6||b.y>210){b.y=clamp(b.y,6,210);b.vy=-b.vy;sfx('g_wall');}
      for(let i=0;i<2;i++){const px=i?362:22;if((i?b.vx>0:b.vx<0)&&Math.abs(b.x-px)<7&&Math.abs(b.y-s.p[i])<21){b.vx=clamp(-b.vx*1.06,-380,380);b.vy=clamp(b.vy+(b.y-s.p[i])*7,-260,260);b.x=px+(i?-7:7);sfx('g_hit');}}
      s.tr.push([Math.round(b.x),Math.round(b.y)]);if(s.tr.length>8)s.tr.shift();
      if(b.x<-10||b.x>394){const w=b.x<0?1:0;s.sc[w]++;s.dir=w?-1:1;s.serve=1;s.tr=[];sfx('g_score');if(s.sc[w]>=7){s.over=true;s.win=w;}}},
    draw(g,s){abg(g,'#0b0d1f','#1a1440');for(let y=4;y<ARC_H;y+=14)abox(g,191,y,2,8,'#3a3f6a');
      s.tr.forEach((p,i)=>{g.globalAlpha=i/16;abox(g,p[0]-3,p[1]-3,6,6,'#ffffff');});g.globalAlpha=1;
      for(let i=0;i<2;i++)abox(g,i?359:19,s.p[i]-18,6,36,pcol(s,i));abox(g,s.b.x-3,s.b.y-3,6,6,'#ffffff');
      atxt(g,String(s.sc[0]),150,34,26,AP.p1);atxt(g,String(s.sc[1]),234,34,26,pcol(s,1));if(s.serve>0&&!s.over)atxt(g,'GET READY',192,150,14,AP.dim);},
    score:s=>s.sc[0]},
  {id:'snake',name:'Snake Duel',mode:'versus',col:'#6cbf4c',goal:'First to 5 rounds',
    init(two){const s={t:0,two,sc:[0,0],over:false,win:-1,acc:0};snakeRound(s);return s;},
    step(s,I,dt){s.t+=dt;if(s.over)return;if(s.pause>0){s.pause-=dt;return;}
      s.sn.forEach((z,i)=>{if(!z.alive)return;let n=null;
        if(i===1&&!s.two){const h=z.b[0],opts=[[1,0],[-1,0],[0,1],[0,-1]].filter(d=>!(d[0]===-z.d[0]&&d[1]===-z.d[1])&&!snakeHit(s,[h[0]+d[0],h[1]+d[1]]));
          opts.sort((a,b)=>Math.hypot(h[0]+a[0]-s.ap[0],h[1]+a[1]-s.ap[1])-Math.hypot(h[0]+b[0]-s.ap[0],h[1]+b[1]-s.ap[1]));n=opts[0]||null;}
        else n=I[i].u?[0,-1]:I[i].d?[0,1]:I[i].l?[-1,0]:I[i].r?[1,0]:null;
        if(n&&!(n[0]===-z.d[0]&&n[1]===-z.d[1]))z.n=n;});
      s.acc+=dt;while(s.acc>=0.11){s.acc-=0.11;
        const heads=s.sn.map(z=>z.alive?(z.d=z.n,[z.b[0][0]+z.d[0],z.b[0][1]+z.d[1]]):null);
        s.sn.forEach((z,i)=>{if(!z.alive)return;const h=heads[i],o=heads[1-i];if(snakeHit(s,h)||(o&&o[0]===h[0]&&o[1]===h[1])){z.alive=false;sfx('g_die');}});
        s.sn.forEach((z,i)=>{if(!z.alive)return;z.b.unshift(heads[i]);if(heads[i][0]===s.ap[0]&&heads[i][1]===s.ap[1]){z.g+=2;s.ap=snakeFree(s);sfx('g_eat');}if(z.g>0)z.g--;else z.b.pop();});
        const alive=s.sn.filter(z=>z.alive);if(alive.length<2){if(alive.length===1){const w=s.sn.indexOf(alive[0]);s.sc[w]++;sfx('g_score');if(s.sc[w]>=5){s.over=true;s.win=w;return;}}snakeRound(s);return;}}},
    draw(g,s){for(let y=0;y<18;y++)for(let x=0;x<32;x++)abox(g,x*12,y*12,12,12,(x+y)%2?'#12301a':'#163a20');
      abox(g,s.ap[0]*12+2,s.ap[1]*12+2,8,8,AP.red);abox(g,s.ap[0]*12+5,s.ap[1]*12,2,3,AP.green);
      s.sn.forEach((z,i)=>z.b.forEach((p,k)=>abox(g,p[0]*12+1,p[1]*12+1,10,10,z.alive?(k?pcol(s,i):'#ffffff'):'#444')));
      atxt(g,String(s.sc[0]),20,16,14,AP.p1,'left');atxt(g,String(s.sc[1]),364,16,14,pcol(s,1),'right');if(s.pause>0)atxt(g,'READY',192,112,18,AP.ink);},
    score:s=>s.sc[0]},
  {id:'orchard',name:'Star Orchard',mode:'coop',col:'#b98aff',goal:'Clear the waves together',
    init(two){const s={t:0,two,score:0,lives:3,wave:0,over:false,sh:[{x:two?150:192,y:196,cool:0,dead:0,inv:0}],bl:[],eb:[],en:[],fx:[]};if(two)s.sh.push({x:234,y:196,cool:0,dead:0,inv:0});orchWave(s);return s;},
    step(s,I,dt){s.t+=dt;if(s.over)return;
      s.sh.forEach((p,i)=>{if(p.dead>0){p.dead-=dt;if(p.dead<=0)p.inv=2;return;}const k=I[i]||{};p.x=clamp(p.x+((k.r?1:0)-(k.l?1:0))*150*dt,10,374);p.y=clamp(p.y+((k.d?1:0)-(k.u?1:0))*110*dt,130,204);
        p.cool-=dt;p.inv-=dt;if(k.a&&p.cool<=0){s.bl.push([p.x,p.y-8]);p.cool=0.22;sfx('g_shoot');}});
      s.bl.forEach(b=>b[1]-=260*dt);s.bl=s.bl.filter(b=>b[1]>-8);
      const off=Math.sin(s.t*0.8)*30,sp=1+s.wave*0.25;
      s.en.forEach(e=>{e.t+=dt;if(e.dv){e.y+=80*sp*dt;e.x+=Math.sin(e.t*3)*60*dt;if(e.y>226){e.dv=0;e.y=-8;}}else{e.x=e.hx+off;e.y+=(e.hy+Math.sin(s.t*2+e.t)*3-e.y)*Math.min(1,dt*4);if(Math.random()<dt*0.04*sp)e.dv=1;}});
      if(s.en.length&&Math.random()<dt*0.5*sp){const e=s.en[Math.floor(Math.random()*s.en.length)];s.eb.push([e.x,e.y+6]);}
      s.eb.forEach(b=>b[1]+=(110+s.wave*12)*dt);s.eb=s.eb.filter(b=>b[1]<224);
      s.bl=s.bl.filter(b=>{const e=s.en.find(e=>Math.abs(e.x-b[0])<9&&Math.abs(e.y-b[1])<8);if(!e)return true;if(--e.hp<=0){s.en.splice(s.en.indexOf(e),1);s.score+=e.k===0?30:10;s.fx.push([e.x,e.y,0.4]);sfx('g_boom');}return false;});
      s.sh.forEach(p=>{if(p.dead>0||p.inv>0)return;const hit=s.eb.find(b=>Math.abs(b[0]-p.x)<7&&Math.abs(b[1]-p.y)<6)||s.en.find(e=>Math.abs(e.x-p.x)<10&&Math.abs(e.y-p.y)<9);
        if(hit){s.eb=s.eb.filter(b=>b!==hit);p.dead=1.5;s.lives--;s.fx.push([p.x,p.y,0.6]);sfx('g_die');if(s.lives<0){s.over=true;s.lives=0;}}});
      s.fx.forEach(f=>f[2]-=dt);s.fx=s.fx.filter(f=>f[2]>0);if(!s.en.length)orchWave(s);},
    draw(g,s){abg(g,'#05030f','#1b1036');for(let i=0;i<60;i++){const y=(i*131+s.t*(20+i%3*20))%ARC_H;abox(g,(i*73)%ARC_W,y,i%5?1:2,i%5?1:2,i%7?'#8a8fb8':'#ffffff');}
      s.en.forEach(e=>{const c=['#ff6fae','#f2b632','#6cbf4c'][e.k];abox(g,e.x-7,e.y-4,14,8,c);abox(g,e.x-9,e.y-1,4,6,c);abox(g,e.x+5,e.y-1,4,6,c);abox(g,e.x-4,e.y-2,2,2,'#000');abox(g,e.x+2,e.y-2,2,2,'#000');});
      s.sh.forEach((p,i)=>{if(p.dead>0||(p.inv>0&&Math.floor(s.t*12)%2))return;const c=i?AP.p2:AP.p1;abox(g,p.x-2,p.y-8,4,6,c);abox(g,p.x-7,p.y-2,14,6,c);abox(g,p.x-1,p.y+4,2,3,AP.gold);});
      s.bl.forEach(b=>abox(g,b[0]-1,b[1]-4,2,6,'#ffffff'));s.eb.forEach(b=>abox(g,b[0]-2,b[1]-2,4,4,AP.red));
      s.fx.forEach(f=>{const r=(0.6-f[2])*30;abox(g,f[0]-r/2,f[1]-r/2,r,r,'rgba(255,200,80,'+f[2]+')');});
      atxt(g,'SCORE '+s.score,8,16,12,AP.ink,'left');atxt(g,'WAVE '+s.wave,192,16,12,AP.gold);atxt(g,'LIVES '+s.lives,376,16,12,AP.ink,'right');},
    drop:s=>{s.sh.length=1;},score:s=>s.score},
  {id:'brick',name:'Brick Break',mode:'coop',col:'#ef7f2a',goal:'Break every brick',
    init(two){const s={t:0,two,score:0,lives:3,lvl:0,over:false,pd:[{x:two?140:192}],br:[],ball:null};if(two)s.pd.push({x:244});brickLevel(s);return s;},
    step(s,I,dt){s.t+=dt;if(s.over)return;const w=s.two?40:52,b=s.ball;
      s.pd.forEach((p,i)=>{const k=I[i]||{};p.x=clamp(p.x+((k.r?1:0)-(k.l?1:0))*230*dt,w/2,ARC_W-w/2);});
      if(b.stuck>=0){const p=s.pd[b.stuck]||s.pd[0];b.x=p.x;b.y=190;if((I[b.stuck]||{}).a){b.vx=rand(-60,60);b.vy=-(170+s.lvl*12);b.stuck=-1;sfx('g_hit');}return;}
      b.x+=b.vx*dt;b.y+=b.vy*dt;if(b.x<4||b.x>380){b.x=clamp(b.x,4,380);b.vx=-b.vx;sfx('g_wall');}if(b.y<4){b.y=4;b.vy=Math.abs(b.vy);sfx('g_wall');}
      s.pd.forEach(p=>{if(b.vy>0&&b.y>=192&&b.y<=200&&Math.abs(b.x-p.x)<w/2+3){b.vy=-Math.abs(b.vy);b.vx=clamp(b.vx+(b.x-p.x)*5,-220,220);sfx('g_hit');}});
      const hit=s.br.find(r=>b.x>r[0]-2&&b.x<r[0]+30&&b.y>r[1]-2&&b.y<r[1]+11);
      if(hit){b.vy=-b.vy;if(--hit[2]<=0)s.br.splice(s.br.indexOf(hit),1);s.score+=10;sfx('g_eat');}
      if(b.y>220){s.lives--;sfx('g_die');if(s.lives<0){s.over=true;s.lives=0;}else b.stuck=0;}
      if(!s.br.length){brickLevel(s);sfx('g_score');}},
    draw(g,s){abg(g,'#120a1e','#2a1530');const cols=['#e0442e','#ef7f2a','#f2b632','#6cbf4c','#4fd3ff','#b98aff'];
      s.br.forEach(r=>{abox(g,r[0],r[1],28,9,cols[r[3]]);if(r[2]>1)abox(g,r[0]+2,r[1]+2,24,2,'#ffffff');});
      const w=s.two?40:52;s.pd.forEach((p,i)=>abox(g,p.x-w/2,194,w,6,i?AP.p2:AP.p1));abox(g,s.ball.x-3,s.ball.y-3,6,6,'#ffffff');
      atxt(g,'SCORE '+s.score,8,16,12,AP.ink,'left');atxt(g,'LEVEL '+s.lvl,192,16,12,AP.gold);atxt(g,'LIVES '+s.lives,376,16,12,AP.ink,'right');
      if(s.ball.stuck>=0&&!s.over)atxt(g,'SPACE TO LAUNCH',192,150,12,AP.dim);},
    drop:s=>{s.pd.length=1;if(s.ball.stuck>0)s.ball.stuck=0;},score:s=>s.score},
  {id:'rush',name:'Apple Rush',mode:'versus',col:'#e0442e',goal:'Most apples in 60 seconds',
    init:two=>({t:0,two,sc:[0,0],time:60,over:false,win:-1,bk:[{x:120},{x:264}],it:[],spawn:0}),
    step(s,I,dt){s.t+=dt;if(s.over)return;s.time-=dt;if(s.time<=0){s.time=0;s.over=true;s.win=s.sc[0]===s.sc[1]?-1:s.sc[0]>s.sc[1]?0:1;sfx('g_score');return;}
      s.bk.forEach((b,i)=>{let v;if(i===1&&!s.two){const t=s.it.filter(o=>o.k!=='bad').sort((a,c)=>c.y-a.y)[0];v=t?clamp((t.x-b.x)/12,-1,1)*0.85:0;}else v=(I[i].r?1:0)-(I[i].l?1:0);b.x=clamp(b.x+v*210*dt,14,370);});
      s.spawn-=dt;if(s.spawn<=0){s.spawn=Math.max(0.25,0.8-(60-s.time)*0.008);const r=Math.random();s.it.push({x:rand(12,372),y:-8,k:r<0.08?'gold':r<0.28?'bad':'apple',vy:rand(60,95)+(60-s.time)*0.8});}
      s.it.forEach(o=>o.y+=o.vy*dt);
      s.it=s.it.filter(o=>{if(o.y>184&&o.y<202){const i=s.bk.findIndex(b=>Math.abs(b.x-o.x)<18);if(i>=0){s.sc[i]=Math.max(0,s.sc[i]+(o.k==='gold'?5:o.k==='bad'?-3:1));sfx(o.k==='bad'?'g_die':'g_eat');return false;}}return o.y<222;});},
    draw(g,s){abg(g,'#5aa7e0','#cfe8f6');abox(g,0,200,ARC_W,16,'#4f9a33');for(let i=0;i<5;i++){abox(g,30+i*80,120,10,80,'#5c3f24');abox(g,10+i*80,96,50,34,'#3f8f2f');}
      s.it.forEach(o=>{abox(g,o.x-5,o.y-5,10,10,o.k==='gold'?AP.gold:o.k==='bad'?'#6b5a2a':AP.red);abox(g,o.x-1,o.y-8,2,3,'#5c3f24');if(o.k==='gold')abox(g,o.x-2,o.y-3,2,2,'#fff8c8');});
      s.bk.forEach((b,i)=>{abox(g,b.x-16,188,32,10,'#a8793f');abox(g,b.x-16,186,32,3,pcol(s,i));});
      atxt(g,String(s.sc[0]),20,18,16,AP.p1,'left');atxt(g,Math.ceil(s.time)+'s',192,18,16,'#18110b');atxt(g,String(s.sc[1]),364,18,16,pcol(s,1),'right');},
    score:s=>s.sc[0]}
];
/* ---------- Golden Reels: the casino slot machines (5 reels, 3 rows, 5 lines; play credits only, no money) ---------- */
// symbols: cherry, lemon, bell, apple, star, BAR, seven, golden apple (wild: stands in for anything). Weights per reel
// strip and the paytable give a return of about 95% and a win on about a third of spins (tests/smoke-test.js checks)
const SLOT_W=[8,7,5,4,2,1,1,2],SLOT_WILD=7,SLOT_DAILY=200,SLOT_BETS=[1,2,5,10];
const SLOT_PAY=[[3,10,30],[4,15,40],[6,20,60],[8,30,120],[15,60,250],[30,100,500],[50,200,1000],[80,400,4000]];// × line bet for 3, 4 or 5 in a row from the left
const SLOT_LINES=[[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2]],SLOT_LINE_COL=['#e0442e','#4fd3ff','#6cbf4c','#ff6fae','#f2b632'];
const SLOT_STRIPS=[0,1,2,3,4].map(r=>{const R=mulberry32(900+r),s=[];SLOT_W.forEach((w,i)=>{for(let k=0;k<w;k++)s.push(i);});for(let i=s.length-1;i>0;i--){const j=Math.floor(R()*(i+1));[s[i],s[j]]=[s[j],s[i]];}return s;});
const SLOT_ART=[
  [['......gg..','.....g.g..','....g...g.','...g....g.','..g.....g.','.rrr...rrr','rrhrr.rrhr','rrrrr.rrrr','drrrd.drrd','.ddd...dd.'],{r:'#e0442e',d:'#8f1d12',h:'#ff9a8a',g:'#3f8f2f'}],
  [['......gg..','...yyyyg..','..yhhyyyy.','.yhyyyyyyy','yyyyyyyyyy','yyyyyyyyyo','.yyyyyyyo.','..yyyyyoo.','...oooo...','..........'],{y:'#f6d23a',o:'#d9a514',h:'#fff6b0',g:'#4fa33a'}],
  [['....dd....','...yyyy...','..yhyyyy..','..yhyyyy..','..yyyyyy..','.yyyyyyyy.','.yyyyyyyy.','yyyyyyyyyy','dddddddddd','....kk....'],{y:'#f2b632',d:'#a8720f',h:'#ffe59a',k:'#5a3a12'}],
  [['.....s....','....sgg...','..rr.s.rr.','.rrhrrrrrr','.rhrrrrrrr','.rrrrrrrrr','.rrrrrrrrr','..rrrrrrr.','..drrrrrd.','...dd.dd..'],{r:'#d8342a',d:'#8f1d12',h:'#ff9a8a',g:'#4fa33a',s:'#5b3a1e'}],
  [['....yy....','....yy....','...yyyy...','yyyywyyyyy','.yyywyyyy.','..yyyyyy..','..yyyyyy..','.yyy..yyy.','.yy....yy.','y........y'],{y:'#ffd34a',w:'#ffffff'}],
  [['yyyyyyyyyyyyy','ykkkkkkkkkkky','ywwkkkwkkwwky','ywkwkwkwkwkwy','ywwkkwwwkwwky','ywkwkwkwkwkwy','ywwkkwkwkwkwy','ykkkkkkkkkkky','yyyyyyyyyyyyy'],{y:'#f2b632',k:'#18110b',w:'#ffffff'}],
  [['dddddddddd','drrrrrrrrd','drhhhhhrrd','dddddrrrd.','....drrd..','...drrd...','...drrd...','..drrd....','..drrd....','..dddd....'],{d:'#7a1010',r:'#e0442e',h:'#ff9a8a'}],
  [['.....s...w','....sgg...','..yy.s.yy.','.yhhyyyyyy','.yhyyyyyyy','.yyyyyyyyy','.yyyyyyyyy','..yyyyyyy.','..oyyyyyo.','...oo.oo..'],{y:'#f2b632',h:'#fff2a8',o:'#b07a10',g:'#6cbf4c',s:'#5b3a1e',w:'#ffffff'}]
];
// draw a symbol centred on (cx,cy) at pixel size k, skipping rows outside y0..y1 (the reel window)
function slotSym(g,sym,cx,cy,k,y0,y1){const [map,pal]=SLOT_ART[sym],w=map[0].length*k,h=map.length*k,x0=Math.round(cx-w/2),yy=Math.round(cy-h/2);
  for(let r=0;r<map.length;r++){const y=yy+r*k;if(y<y0||y+k>y1)continue;const row=map[r];for(let c=0;c<row.length;c++){const col=pal[row[c]];if(col){g.fillStyle=col;g.fillRect(x0+c*k,y,k,k);}}}}
// what a set of reel stops pays: each line from the left; golden apples stand in for anything (five of them is the jackpot)
function slotLines(stops){const out=[];SLOT_LINES.forEach((L,li)=>{const sy=L.map((row,c)=>SLOT_STRIPS[c][(stops[c]+row)%SLOT_STRIPS[c].length]);let base=sy.find(x=>x!==SLOT_WILD);if(base===undefined)base=SLOT_WILD;let k=0;while(k<5&&(sy[k]===base||sy[k]===SLOT_WILD))k++;if(k>=3)out.push({li,k,sym:base,mult:SLOT_PAY[base][k-3]});});return out;}
// your play credits on this browser (ga_slots per profile): topped up to 200 each day
function slotWallet(){const all=Store.get('ga_slots',{}),w=Object.assign({c:0,d:'',best:0},all[myKey()]);if(w.d!==todayKey()){w.fresh=w.c<SLOT_DAILY;w.c=Math.max(w.c,SLOT_DAILY);w.d=todayKey();}return w;}
function slotSave(s){const all=Store.get('ga_slots',{});all[myKey()]={c:s.cr,d:s.day,best:s.best};Store.set('ga_slots',all);}
const slotPos=(c,stop)=>{const L=SLOT_STRIPS[c].length;return((-stop)%L+L)%L;};// reel position that shows stop on the top row
function slotResolve(s){
  s.phase='show';s.flash=0;for(let c=0;c<5;c++){s.p[c]=slotPos(c,s.stops[c]);s.pt[c]=s.p[c];}
  const lb=SLOT_BETS[s.bet];s.lines=slotLines(s.stops);s.win=s.lines.reduce((a,l)=>a+l.mult*lb,0);s.cr+=s.win;if(s.win>s.best)s.best=s.win;slotSave(s);
  if(s.win){s.wins++;s.big=s.lines.some(l=>l.sym===SLOT_WILD&&l.k===5)?2:s.win>=lb*5*25?1:0;sfx(s.big?'bigwin':'g_score');if(s.big)for(let i=0;i<60;i++)s.coins.push({x:rand(20,364),y:rand(-140,0),vx:rand(-30,30),vy:rand(0,60)});}
}
GAMES.push({id:'slots',name:'Golden Reels',mode:'slots',col:'#f2b632',goal:'Line up symbols from the left',
  init(){const w=slotWallet(),stops=[0,1,2,3,4].map(c=>Math.floor(Math.random()*SLOT_STRIPS[c].length));
    const s={t:0,two:false,cr:w.c,day:w.d,best:w.best,bet:0,spins:0,wins:0,phase:'idle',stops,p:stops.map((st,c)=>slotPos(c,st)),p0:[0,0,0,0,0],pt:[0,0,0,0,0],T:[1,1,1,1,1],done:[true,true,true,true,true],st:0,win:0,shown:0,lines:[],big:0,flash:0,prev:0,msg:w.fresh?'Daily top-up: '+SLOT_DAILY+' free credits':'',msgT:w.fresh?3:0,coins:[],over:false};
    if(w.fresh)slotSave(s);return s;},
  step(s,I,dt){
    const k=I[0],b=(k.a?1:0)|(k.u?2:0)|(k.d?4:0),press=b&~s.prev;s.prev=b;s.t+=dt;if(s.msgT>0)s.msgT-=dt;const tb=SLOT_BETS[s.bet]*5;
    if(s.phase==='spin'){s.st+=dt;let all=true;
      if(press&1)for(let c=0;c<5;c++)s.T[c]=Math.min(s.T[c],s.st+0.12+0.08*c);// press again to stop the reels early
      for(let c=0;c<5;c++){const u=clamp(s.st/s.T[c],0,1);if(u<1)all=false;const e=u<1?1+2.70158*Math.pow(u-1,3)+1.70158*Math.pow(u-1,2):1;// ease out, overshoot, settle
        s.p[c]=s.p0[c]+(s.pt[c]-s.p0[c])*e;if(u>=1&&!s.done[c]){s.done[c]=true;s.p[c]=s.pt[c];sfx('reelstop');}}
      if(all)slotResolve(s);}
    else{
      if(press&2&&s.bet<SLOT_BETS.length-1){s.bet++;sfx('g_wall');}if(press&4&&s.bet>0){s.bet--;sfx('g_wall');}
      if(s.phase==='show'){s.flash+=dt;if(s.shown<s.win){s.shown=Math.min(s.win,s.shown+Math.max(1,s.win*dt*1.2));if(Math.floor(s.t*12)%2)sfx('coin');}}
      if(press&1){
        if(s.cr<tb){s.msg=s.cr<SLOT_BETS[0]*5?'Out of credits: '+SLOT_DAILY+' more tomorrow':'Not enough credits: lower your bet (DOWN)';s.msgT=2.5;sfx('deny');}
        else{s.cr-=tb;s.spins++;s.phase='spin';s.st=0;s.win=0;s.shown=0;s.lines=[];s.big=0;s.coins=[];
          for(let c=0;c<5;c++){const L=SLOT_STRIPS[c].length;s.stops[c]=Math.floor(Math.random()*L);s.p0[c]=s.p[c];let t=slotPos(c,s.stops[c]);while(t<s.p[c]+12+5*c)t+=L;s.pt[c]=t;s.T[c]=0.9+0.32*c;s.done[c]=false;}
          slotSave(s);sfx('lever');}}}
    for(const o of s.coins){o.x+=o.vx*dt;o.y+=o.vy*dt;o.vy+=320*dt;}s.coins=s.coins.filter(o=>o.y<230);
  },
  draw(g,s){
    abg(g,'#2a0d3a','#120618');
    for(let i=0;i<24;i++){const on=(i+Math.floor(s.t*8))%3===0;abox(g,6+i*16,4,5,3,on?'#ffd34a':'#5a3a12');}
    for(let i=0;i<9;i++){const on=(i+Math.floor(s.t*8))%3===0;abox(g,6,32+i*16,3,5,on?'#ffd34a':'#5a3a12');abox(g,375,32+i*16,3,5,on?'#ffd34a':'#5a3a12');}
    atxt(g,'GOLDEN REELS',192,23,16,AP.gold);
    const X0=34,Y0=30,CW=63,CH=46,H=CH*3;abox(g,X0-4,Y0-4,CW*5+6,H+8,'#f2b632');abox(g,X0-2,Y0-2,CW*5+2,H+4,'#5a3a12');
    for(let c=0;c<5;c++){const x=X0+c*CW,L=SLOT_STRIPS[c].length,P=Math.floor(s.p[c]),f=s.p[c]-P;abox(g,x,Y0,CW-2,H,'#f6ecd6');
      for(let r=-1;r<=2;r++){const y=Y0+(r+f)*CH;slotSym(g,SLOT_STRIPS[c][((r-P)%L+L)%L],x+CW/2-1,y+CH/2,3,Y0,Y0+H);}
      const gr=g.createLinearGradient(0,Y0,0,Y0+H);gr.addColorStop(0,'rgba(0,0,0,0.38)');gr.addColorStop(0.22,'rgba(0,0,0,0)');gr.addColorStop(0.78,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,0.38)');g.fillStyle=gr;g.fillRect(x,Y0,CW-2,H);}
    for(let li=0;li<5;li++){const L=SLOT_LINES[li];abox(g,X0-14,Y0+L[0]*CH+CH/2-4,8,8,SLOT_LINE_COL[li]);abox(g,X0+CW*5+4,Y0+L[4]*CH+CH/2-4,8,8,SLOT_LINE_COL[li]);}
    if(s.phase==='show'&&s.lines.length&&Math.floor(s.flash*4)%2===0)for(const l of s.lines){const L=SLOT_LINES[l.li],col=SLOT_LINE_COL[l.li];
      for(let c=0;c<l.k;c++){const x=X0+c*CW,y=Y0+L[c]*CH;abox(g,x,y,CW-2,3,col);abox(g,x,y+CH-3,CW-2,3,col);abox(g,x,y,3,CH,col);abox(g,x+CW-5,y,3,CH,col);}}
    abox(g,0,180,ARC_W,36,'#18110b');
    atxt(g,'CREDITS '+s.cr,12,197,11,AP.ink,'left');atxt(g,'BET '+SLOT_BETS[s.bet]+' × 5 LINES = '+SLOT_BETS[s.bet]*5,192,197,11,AP.gold);atxt(g,'WIN '+Math.floor(s.shown),372,197,11,s.win?'#6cbf4c':AP.ink,'right');
    atxt(g,s.phase==='spin'?'SPACE  stop the reels':'SPACE  spin  ·  UP/DOWN  bet  ·  play credits, not money',192,212,10,'#b9a6d6');
    if(s.big&&s.phase==='show'){abox(g,92,80,200,46,'rgba(0,0,0,0.72)');atxt(g,s.big===2?'JACKPOT!':'BIG WIN!',192,112,26,Math.floor(s.flash*6)%2?AP.gold:'#ffffff');}
    for(const o of s.coins){abox(g,o.x-3,o.y-3,7,7,'#f2b632');abox(g,o.x-1,o.y-2,2,4,'#fff8c8');}
    if(s.msgT>0){abox(g,0,160,ARC_W,18,'rgba(0,0,0,0.75)');atxt(g,s.msg,192,173,10,AP.gold);}
  },
  score:s=>s.best});
// moving parts of the slot machines (yours and other people's): the lever when someone spins, the top light on a win
function animateSlotCabinets(dt){for(const A of ARCADES){if(!A.lever)continue;A.pull=Math.max(0,A.pull-dt);A.lever.rotation.x=A.pull>0?0.9*Math.sin(Math.PI*(1-A.pull/0.5)):0;
  A.flash=Math.max(0,A.flash-dt);A.spinT=Math.max(0,(A.spinT||0)-dt);A.lamp.visible=A.flash>0&&Math.floor(arc.clock*8)%2===0;}}
/* ---------- the engine ---------- */
const ARC_KEYS=$('#arcKeys').innerHTML;// the arcade games' key hints (the slots show their own)
const arc={tap:0,open:false,c:-1,slot:1,host:null,p2:null,st:null,acc:0,frame:0,p2in:0,heard:0,inT:0,lastIn:-1,touch:0,joining:null,msg:'',msgT:0,saved:false,scrT:0,clock:0};
const arcKeys=new Set();
const sendDm=(to,d)=>{if(!room.mode||!to)return false;if(room.mode==='host'){if(to===myKey()){onDm(to,d);return true;}sendTo(to,{t:'dm',from:myKey(),d});return true;}return roomSend({t:'dm',to,d});};
const gameOf=c=>GAMES[ARCADES[c].g];
const arcName=k=>k===myKey()?'You':USERS[k]?USERS[k].name.split(' ')[0]:'Player';
function arcadeOccupants(i){const o={p1:null,p2:null};if(arc.open&&arc.c===i){if(arc.slot===1)o.p1=myKey();else{o.p1=arc.host;o.p2=myKey();}}
  for(const ch of locals)if(ch.kind==='remote'&&ch.net&&Array.isArray(ch.net.arc)&&ch.net.arc[0]===i){const k=ch.id.slice(6);if(ch.net.arc[1]===1&&!o.p1)o.p1=k;else if(ch.net.arc[1]===2&&!o.p2)o.p2=k;}return o;}
function nearestArcade(){const P=state.player;if(!P)return null;const p=P.root.position;let best=null,bd=1.2;for(const A of ARCADES){const d=Math.hypot(A.spot.x-p.x,A.spot.z-p.z);if(d<bd){bd=d;best=A;}}return best;}
const keyBit=k=>k==='arrowup'||k==='w'?B_U:k==='arrowdown'||k==='s'?B_D:k==='arrowleft'||k==='a'?B_L:k==='arrowright'||k==='d'?B_R:k===' '||k==='j'||k==='z'?B_A:0;
// held keys, plus taps since the last game step (a quick tap between two frames still counts)
function arcBits(){let b=(arc.touch&31)|arc.tap;for(const k of arcKeys)b|=keyBit(k);return b;}
function useArcade(A){
  const P=state.player;if(!P||arc.open||arc.joining)return;const o=arcadeOccupants(A.i);
  if(gameOf(A.i).mode==='slots'&&o.p1&&o.p1!==myKey()){P.say('Someone is playing this machine.',1600);sfx('deny');return;}
  if(o.p1&&o.p1!==myKey()){if(o.p2){P.say('Two people are already playing here.',1800);sfx('deny');return;}
    arc.joining={c:A.i,to:o.p1,t:0};sendDm(o.p1,{g:'join',c:A.i});P.say('Asking to join…',1400);return;}
  startArcade(A.i,1,null);
}
function startArcade(c,slot,host){
  const P=state.player,A=ARCADES[c];if(P.held)P.dropHeld();if(P.rodMesh)stowRod(false);endFishing();if(P.seat)standUp();
  Object.assign(arc,{open:true,c,slot,host,p2:null,st:slot===1?gameOf(c).init(false):null,acc:0,frame:0,p2in:0,heard:0,lastIn:-1,inT:0,saved:false,msg:'',msgT:0});
  P.root.position.set(A.spot.x,A.sit?A.seatY-HIP:0,A.spot.z);P.heading=A.face;P.root.rotation.y=A.face;P.anim.play=true;P.anim.pose=A.sit?'sit':'stand';keys.clear();arcKeys.clear();closeCard();
  $('#arcade').hidden=false;$('#arcPad').hidden=!coarse;renderArcBar();sfx('g_start');
}
function exitArcade(){
  if(!arc.open)return;if(arc.slot===1&&arc.p2)sendDm(arc.p2,{g:'end'});if(arc.slot===2&&arc.host)sendDm(arc.host,{g:'bye'});
  saveArcHigh();arc.open=false;arc.st=null;arc.p2=null;arc.host=null;arcKeys.clear();arc.touch=0;$('#arcade').hidden=true;
  if(state.player){const P=state.player;P.anim.play=false;if(P.anim.pose==='sit'){P.anim.pose='stand';P.root.position.y=0;}}try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen();}catch(e){}if(cvs.focus)cvs.focus({preventScroll:true});
}
function arcStart(){if(!arc.open||arc.slot!==1||!arc.st)return;if(arc.st.over){saveArcHigh();arc.st=gameOf(arc.c).init(!!arc.p2);arc.saved=false;sfx('g_start');}else arc.st.paused=!arc.st.paused;}
function saveArcHigh(){if(arc.slot!==1||!arc.st||arc.saved)return;const G=gameOf(arc.c),sc=G.score(arc.st),hi=Store.get('ga_arcade',{});if(sc>(hi[G.id]||0)){hi[G.id]=sc;Store.set('ga_arcade',hi);}}
const arcMsg=(m,t)=>{arc.msg=m;arc.msgT=t||2.5;};
function renderArcBar(){
  const G=gameOf(arc.c);if(!G)return;const slots=G.mode==='slots';$('#arcKeys').innerHTML=slots?'<span class="key">Space</span> spin / stop · <span class="key">↑</span>/<span class="key">↓</span> bet · <span class="key">Esc</span> leave':ARC_KEYS;
  if(slots){$('#arcTitle').textContent=G.name;$('#arcPlayers').innerHTML='<b style="color:'+AP.gold+'">Play credits only · no real money</b>';return;}const p1=arc.slot===1?myKey():arc.host,p2=arc.slot===2?myKey():arc.p2;
  $('#arcTitle').textContent=G.name;
  $('#arcPlayers').innerHTML='<b style="color:'+AP.p1+'">P1 '+esc(arcName(p1))+'</b> · <b style="color:'+(p2?AP.p2:AP.cpu)+'">P2 '+esc(p2?arcName(p2):G.mode==='versus'?'Computer':'Open')+'</b>';
}
// messages between the two players of a cabinet, relayed through the room host
function onDm(from,d){
  if(!d||typeof d!=='object')return;
  if(typeof d.g==='string'&&/^m[a-z]$/.test(d.g)){onMatchDm(from,d);return;}// tennis and badminton (Playground)
  if(d.g==='join'){if(arc.open&&arc.slot===1&&arc.c===d.c&&!arc.p2&&arc.st&&gameOf(arc.c).mode!=='slots'){arc.p2=from;arc.heard=0;arc.st=gameOf(arc.c).init(true);arc.saved=false;sendDm(from,{g:'ok',c:arc.c});arcMsg(arcName(from)+' joined as Player 2!');sfx('g_start');renderArcBar();}else sendDm(from,{g:'no',c:d.c});}
  else if(d.g==='ok'){if(arc.joining&&arc.joining.c===d.c&&arc.joining.to===from){arc.joining=null;startArcade(d.c,2,from);}}
  else if(d.g==='no'){if(arc.joining){arc.joining=null;if(state.player)state.player.say('Couldn’t join that game.',1800);}}
  else if(d.g==='in'){if(arc.open&&arc.slot===1&&arc.p2===from){arc.p2in=(d.i|0)&31;arc.heard=0;}}
  else if(d.g==='st'){if(arc.open&&arc.slot===2&&arc.host===from&&d.s&&typeof d.s==='object'){arc.st=d.s;arc.heard=0;}}
  else if(d.g==='bye'){if(arc.open&&arc.p2===from){arc.p2=null;arc.st.two=false;if(gameOf(arc.c).drop)gameOf(arc.c).drop(arc.st);arcMsg('Player 2 left'+(gameOf(arc.c).mode==='versus'?'. The computer takes over.':'.'));renderArcBar();}}
  else if(d.g==='end'){if(arc.open&&arc.slot===2&&arc.host===from){arcMsg('Player 1 left the game.');setTimeout(()=>{if(arc.open&&arc.slot===2)exitArcade();},1600);}}
}
function updateArcade(dt){
  arc.clock+=dt;arc.scrT-=dt;if(arc.scrT<=0){arc.scrT=0.25;drawCabinetScreens();}
  if(arcBanner)arcBanner.rotation.y+=dt*0.45;animateSlotCabinets(dt);
  if(arc.open&&arc.st&&ARCADES[arc.c].lever){const A=ARCADES[arc.c];if(arc.st.spins!==A.mySpins){if(A.mySpins!=null){A.pull=0.5;A.spinT=1.6;}A.mySpins=arc.st.spins;}if(arc.st.wins!==A.myWins){if(A.myWins!=null)A.flash=arc.st.big?5:2.5;A.myWins=arc.st.wins;}}
  if(arc.joining){arc.joining.t+=dt;if(arc.joining.t>6){arc.joining=null;if(state.player)state.player.say('No answer from that cabinet.',1800);}}
  if(!arc.open)return;
  const G=gameOf(arc.c),mine=arcBits();
  if(arc.slot===1){
    // if someone else started this cabinet at the same moment, the lower key keeps it
    for(const ch of locals)if(ch.kind==='remote'&&ch.net&&Array.isArray(ch.net.arc)&&ch.net.arc[0]===arc.c&&ch.net.arc[1]===1&&ch.id.slice(6)<myKey()){toast('Someone else just started this cabinet.','',2400);exitArcade();return;}
    arc.acc+=dt;let n=0;while(arc.acc>=ARC_STEP&&n<6){arc.acc-=ARC_STEP;n++;if(!arc.st.paused)G.step(arc.st,[toIn(mine),toIn(arc.p2?arc.p2in:0)],ARC_STEP);arc.frame++;if(arc.p2&&arc.frame%3===0)sendDm(arc.p2,{g:'st',s:arc.st});}if(n)arc.tap=0;
    if(arc.p2){arc.heard+=dt;if(arc.heard>6){const k=arc.p2;onDm(k,{g:'bye'});}}
    if(arc.st.over&&!arc.saved){saveArcHigh();arc.saved=true;}
  }else{arc.inT-=dt;if(mine!==arc.lastIn||arc.inT<=0){arc.lastIn=mine;arc.inT=0.5;sendDm(arc.host,{g:'in',i:mine});}arc.tap=0;arc.heard+=dt;if(arc.heard>6){arcMsg('Lost the connection to Player 1.');exitArcade();return;}}
  const g=arcG;let drawn=false;if(arc.st){try{G.draw(g,arc.st);drawn=true;}catch(e){if(arc.slot===2)arc.st=null;else throw e;}}if(!drawn){abg(g,'#0b0d1f','#1a1440');atxt(g,'CONNECTING…',192,112,16,AP.ink);}
  const s=arc.st;
  if(s&&s.over){abox(g,72,70,240,76,'rgba(0,0,0,0.75)');const w=G.mode==='versus'?(s.win===-1?'DRAW':(s.win===0?'P1':'P2')+' WINS'):'GAME OVER';atxt(g,w,192,100,22,AP.gold);
    const hi=Store.get('ga_arcade',{})[G.id]||0;atxt(g,'BEST '+hi+(arc.slot===1?' · ENTER TO PLAY AGAIN':''),192,126,10,AP.ink);}
  else if(s&&s.paused){abox(g,120,90,144,36,'rgba(0,0,0,0.7)');atxt(g,'PAUSED',192,114,18,AP.ink);}
  if(arc.msgT>0){arc.msgT-=dt;abox(g,0,ARC_H-22,ARC_W,22,'rgba(0,0,0,0.7)');atxt(g,arc.msg,192,ARC_H-7,11,AP.gold);}
}
// the small screens on the cabinets: attract mode, or who is playing
function drawCabinetScreens(){
  for(const A of ARCADES){const G=gameOf(A.i),c=A.canvas,g=c.getContext('2d'),o=arcadeOccupants(A.i),blink=Math.floor(arc.clock*2)%2;
    if(G.mode==='slots'){// attract mode, or the reels turning while someone plays
      g.fillStyle=A.flash>0&&blink?'#5a3a12':'#120618';g.fillRect(0,0,96,72);g.fillStyle='#f2b632';g.fillRect(0,0,96,3);g.fillRect(0,69,96,3);g.textAlign='center';g.font='700 10px '+FONT_UI;g.fillStyle='#f2b632';g.fillText('GOLDEN REELS',48,15);
      const spin=A.spinT>0,tick=Math.floor(arc.clock*(spin?14:1.5));for(let r=0;r<3;r++){g.fillStyle='#f6ecd6';g.fillRect(9+r*27,22,24,24);slotSym(g,spin||!o.p1?(tick*3+r*5+A.i)%8:[6,6,6][r],21+r*27,34,2,22,46);}
      g.font='500 9px '+FONT_UI;g.fillStyle=A.flash>0?'#ffd34a':'#f6ecd6';g.fillText(o.p1?(A.flash>0?'WIN! ':'')+arcName(o.p1):(blink?'PRESS E':'PLAY CREDITS'),48,62);A.tex.needsUpdate=true;continue;}
    g.fillStyle='#0b0d1f';g.fillRect(0,0,96,64);g.fillStyle=G.col;g.fillRect(0,0,96,3);g.fillRect(0,61,96,3);
    g.textAlign='center';g.font='700 11px '+FONT_UI;g.fillStyle=G.col;g.fillText(G.name.toUpperCase(),48,18);
    g.font='500 9px '+FONT_UI;g.fillStyle='#f6ecd6';
    if(o.p1){g.fillText('P1 '+arcName(o.p1),48,36);g.fillText('P2 '+(o.p2?arcName(o.p2):'OPEN'),48,50);}
    else{const hi=Store.get('ga_arcade',{})[G.id]||0;g.fillText(blink?'PRESS E':'',48,38);g.fillStyle='#7a7f9a';g.fillText('BEST '+hi,48,52);}
    A.tex.needsUpdate=true;}
}
function arcPrompt(A,kh){const G=gameOf(A.i),o=arcadeOccupants(A.i);if(arc.joining)return 'Asking to join…';
  if(G.mode==='slots')return o.p1&&o.p1!==myKey()?'Someone is playing this slot machine':kh+' to play '+esc(G.name)+' <span class="cat fruit">Slots</span> · '+slotWallet().c+' credits';
  if(o.p1&&o.p1!==myKey())return o.p2?esc(G.name)+' · two people are playing':kh+' to join '+esc(arcName(o.p1))+' as Player 2 · '+esc(G.name);
  return kh+' to play '+esc(G.name)+' <span class="cat fruit">'+(G.mode==='versus'?'Versus':'Co-op')+'</span>';}
$('#arcExit').addEventListener('click',exitArcade);
$('#arcFull').addEventListener('click',()=>{const el=$('#arcade');try{if(document.fullscreenElement)document.exitFullscreen();else if(el.requestFullscreen)el.requestFullscreen();}catch(e){}});
document.querySelectorAll('#arcPad [data-b]').forEach(b=>{const v=+b.dataset.b;
  b.addEventListener('pointerdown',e=>{e.preventDefault();if(v===32)arcStart();else arc.touch|=v;});
  ['pointerup','pointercancel','pointerleave'].forEach(t=>b.addEventListener(t,()=>{arc.touch&=~v;}));});
function arcKey(e,down){
  const k=e.key.toLowerCase();
  if(!down){arcKeys.delete(k);return;}
  if(k==='escape'){exitArcade();return;}
  if(k==='enter'){if(!e.repeat)arcStart();return;}
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)&&e.preventDefault)e.preventDefault();
  arcKeys.add(k);arc.tap|=keyBit(k);
}

/* =========================================================
   Gym
   Cardio machines (treadmill, elliptical, bike, punching bag) and strength stations (dumbbells, squat rack, chest
   press, lat pulldown), built in buildFurniture (GYM). E on a machine starts it at the default level and you keep
   going until you press E again; W/S change speed or weight. Your heart rate climbs towards the level's target and
   the health and energy cost follows it, so effort builds up instead of landing at once. Strength work comes in
   sets of 10 reps with a short rest. Afterwards you are sweaty (shower in the Restroom), hungrier for a while, and
   rest recovers you faster (see updateVitals).
   ========================================================= */
// per level (0..2): rate = movement cycles per second (radians), hr = target heart rate, hp/en = cost per minute at
// that heart rate, sw = sweat per minute
const GYM_KINDS={
  treadmill:{name:'Treadmill',cat:'cardio',lv:['Walk','Jog','Run'],sub:['5 km/h','8.5 km/h','12 km/h'],kmh:[5,8.5,12],rate:[5.5,8.5,11.5],hr:[105,135,165],hp:[-2.2,-3.2,-4.5],en:[-2.5,-6,-10],sw:[3,7,12]},
  elliptical:{name:'Elliptical',cat:'cardio',lv:['Easy','Steady','Hard'],rate:[4,5.5,7],hr:[100,128,155],hp:[-2,-3,-4],en:[-3,-5.5,-8.5],sw:[3,6,10]},
  bike:{name:'Exercise bike',cat:'cardio',lv:['Easy','Steady','Sprint'],rate:[5,7,10],hr:[98,125,160],hp:[-1.8,-2.8,-4],en:[-2.5,-5,-9],sw:[3,6,11]},
  bag:{name:'Punching bag',cat:'cardio',lv:['Light','Combos','Power'],rate:[4,6,8],hr:[110,138,160],hp:[-2.5,-3.5,-4.5],en:[-4,-7,-10],sw:[4,8,12]},
  dumbbell:{name:'Dumbbells',cat:'strength',move:'Curls',prop:'dumbbell',lv:['5 kg','10 kg','15 kg'],rate:[2.6,2.3,2],hr:[95,108,120],hp:[-1.8,-2.4,-3],en:[-3,-4.5,-6.5],sw:[1,2,3]},
  squat:{name:'Squat rack',cat:'strength',move:'Squats',prop:'barbell',lv:['20 kg','40 kg','60 kg'],rate:[1.7,1.5,1.3],hr:[105,118,132],hp:[-2.2,-3,-3.8],en:[-4,-6,-8.5],sw:[2,3,4]},
  chest:{name:'Chest press',cat:'strength',move:'Chest press',lv:['20 kg','35 kg','50 kg'],rate:[2.2,2,1.8],hr:[98,110,122],hp:[-1.8,-2.4,-3],en:[-3,-4.5,-6.5],sw:[1,2,3]},
  lat:{name:'Lat pulldown',cat:'strength',move:'Pulldowns',lv:['20 kg','35 kg','50 kg'],rate:[2.2,2,1.8],hr:[98,110,122],hp:[-1.8,-2.4,-3],en:[-3,-4.5,-6.5],sw:[1,2,3]}
};
const REPS=10,SET_REST=20,REST_HR=92,HR_CALM=72,TAU=Math.PI*2;
const gym={use:null,lvl:1,t:0,hr:HR_CALM,reps:0,set:1,sets:0,rest:0,km:0,stepN:0,pk:0,joyT:0,tip:false};
const canPush=()=>V.en>=20&&V.hp>=10;// the top level needs some energy and food in you
// who is on a machine: you, or a remote player whose state says so
function gymWho(M){if(gym.use===M)return state.player;for(const ch of locals)if(ch.kind==='remote'&&ch.net&&Array.isArray(ch.net.gym)&&ch.net.gym[0]===M.i)return ch;return null;}
function nearestGym(){const P=state.player;if(!P)return null;const p=P.root.position;let best=null,bd=1.25;for(const M of GYM){const d=Math.min(Math.hypot(M.ap.x-p.x,M.ap.z-p.z),Math.hypot(M.spot.x-p.x,M.spot.z-p.z));if(d<bd){bd=d;best=M;}}return best;}
function nearCooler(){const P=state.player;if(!P)return false;const p=P.root.position;return Math.hypot(p.x-GYM_COOLER.x,p.z-(GYM_COOLER.z-0.9))<0.9;}
function startGym(M){
  const P=state.player,K=GYM_KINDS[M.kind];if(!P||gym.use||rr.use||rr.wash||P.eating)return;
  if(gymWho(M)){P.say('Someone is using the '+K.name.toLowerCase()+'.',1600);sfx('deny');return;}
  if(V.en<8){P.say('Too tired to work out. Rest first.',2000);sfx('deny');return;}
  if(P.held)putDownFood();if(P.rodMesh)stowRod(false);if(P.seat)standUp();
  Object.assign(gym,{use:M,lvl:canPush()?1:0,t:0,reps:0,set:1,sets:0,rest:0,km:0});
  P.root.position.set(M.spot.x,M.sit?M.y-HIP:M.y,M.spot.z);P.heading=M.face;P.root.rotation.y=M.face;P.vy=0;P.onGround=true;P.anim.speed=0;
  P.anim.gym={k:M.kind,lvl:gym.lvl,ph:0,rest:false};V.act='workout';renderVitals();closeCard();sfx('beep');P.say(K.cat==='cardio'?'Let’s go!':'Let’s lift.',1200);
}
function stopGym(msg){
  const M=gym.use,P=state.player;if(!M)return;saveGymStats(M);gym.use=null;
  if(P){P.anim.gym=null;P.anim.pose='stand';P.root.position.set(M.ap.x,0,M.ap.z);P.heading=M.face;P.vy=0;P.onGround=true;if(msg)P.say(msg,2200);}
  sfx('beep');
  if(V.ex>=3&&!gym.tip){gym.tip=true;toast('Good workout! Rest now recovers you faster, and you’ll get hungry sooner. A shower in the Restroom will freshen you up.','',5200);}
}
function gymLevel(d){
  if(!gym.use)return;const n=clamp(gym.lvl+d,0,2);if(n===gym.lvl)return;
  if(n===2&&!canPush()){state.player.say('Too tired to push harder.',1600);sfx('deny');return;}
  gym.lvl=n;state.player.anim.gym.lvl=n;sfx('beep');
}
function updateGym(dt){
  for(const M of GYM){const w=gymWho(M);animateMachine(M,w&&w.anim.gym,dt);}
  const P=state.player,M=gym.use;
  if(!M||!P){gym.hr+=(HR_CALM-gym.hr)*(1-Math.exp(-dt/20));return;}
  const K=GYM_KINDS[M.kind],a=P.anim.gym;gym.t+=dt;
  // two people got on the same machine at once: the lower key keeps it
  for(const ch of locals)if(ch.kind==='remote'&&ch.net&&Array.isArray(ch.net.gym)&&ch.net.gym[0]===M.i&&ch.id.slice(6)<myKey()){stopGym('Someone else got on first.');return;}
  if(coarse){gym.joyT-=dt;if(gym.joyT<=0&&Math.abs(joy.y)>0.7){gymLevel(joy.y<0?1:-1);gym.joyT=0.6;}}// touch: push the joystick up or down
  if(gym.lvl===2&&!canPush()){gym.lvl=1;a.lvl=1;P.say('Can’t keep this pace. Easing off.',2000);}
  if(V.en<6){stopGym('I’m exhausted. Time to rest.');return;}
  const target=gym.rest>0?REST_HR:K.hr[gym.lvl];gym.hr+=(target-gym.hr)*(1-Math.exp(-dt/(target>gym.hr?14:9)));
  if(K.cat==='strength'){
    if(gym.rest>0){gym.rest-=dt;a.rest=true;if(gym.rest<=0){gym.rest=0;gym.set++;gym.reps=0;a.ph=0;a.rest=false;P.say('Set '+gym.set+'.',1000);}}
    else{const r=Math.floor(a.ph/TAU);if(r>gym.reps){gym.reps=r;sfx('clank');if(r>=REPS){gym.rest=SET_REST;gym.sets++;a.rest=true;P.say('Set done. Catch your breath.',1600);}}}
  }else{
    if(M.kind==='treadmill'){gym.km+=K.kmh[gym.lvl]*dt/3600;const s=Math.floor(a.ph/Math.PI);if(s!==gym.stepN){gym.stepN=s;sfx('step',{ground:'plank'});}}
    if(M.kind==='bag'){const pk=Math.floor((a.ph+Math.PI/2)/Math.PI);if(pk!==gym.pk){gym.pk=pk;sfx('punch');}}
  }
  if(V.sw>35&&!reduceMotion&&Math.random()<dt*(0.6+gym.lvl)){const h=headPos(P);spawnP(h.x+rand(-0.15,0.15),h.y+0.1,h.z+rand(-0.15,0.15),rand(-0.2,0.2),0.6,rand(-0.2,0.2),0.6,0.035,'#9fd8f5',9);}// sweat
}
// moving parts follow whoever is on the machine (you or a remote player): belt, cranks, handles, weight stack, bag
function animateMachine(M,a,dt){
  const R=M.rig;if(!R)return;const ph=a?a.ph:0,on=!!a&&!a.rest,k=on?(1-Math.cos(ph))/2:0;
  if(M.kind==='treadmill'){if(a)R.belt.offset.y-=GYM_KINDS.treadmill.kmh[a.lvl]/3.6*dt*0.6;}
  else if(M.kind==='elliptical'||M.kind==='bike'){R.crank.rotation.x=-ph;if(R.armR){R.armR.rotation.x=Math.sin(ph)*0.35;R.armL.rotation.x=-Math.sin(ph)*0.35;}}
  else if(M.kind==='squat')R.bar.visible=!on;
  else if(M.kind==='chest'){R.grip.position.set(R.grip.position.x,R.y0+k*0.25,R.z0-k*0.12);R.stack.position.y=R.s0+k*0.22;}
  else if(M.kind==='lat'){R.grip.position.set(R.grip.position.x,R.y0-k*0.38,R.z0-k*0.47);R.stack.position.y=R.s0+k*0.22;}
  else if(M.kind==='bag'){const want=on?-0.16*Math.abs(Math.sin(ph))**3:0;R.ang+=(want-R.ang)*(1-Math.exp(-dt*10));R.bag.rotation.z=R.ang;}
}
const gymLabel=()=>{const K=GYM_KINDS[gym.use.kind];return (K.cat==='cardio'?K.name:K.move)+' · '+K.lv[gym.lvl];};
function gymPrompt(kh){
  const M=gym.use,K=GYM_KINDS[M.kind],L=gym.lvl,t=Math.floor(gym.t),mm=Math.floor(t/60)+':'+String(t%60).padStart(2,'0'),what=K.cat==='cardio'?'speed':'weight';
  let s=esc(gymLabel()+(K.sub?' '+K.sub[L]:''));
  if(K.cat==='strength')s+=gym.rest>0?' · resting '+Math.ceil(gym.rest)+' s before set '+(gym.set+1):' · set '+gym.set+' · rep '+Math.min(REPS,gym.reps+1)+'/'+REPS;
  else if(M.kind==='treadmill')s+=' · '+gym.km.toFixed(2)+' km';
  return s+' · ♥ '+Math.round(gym.hr)+' bpm · '+mm+' · '+(coarse?'joystick up/down for '+what+' · '+kh+' to stop':'<span class="key">W</span>/<span class="key">S</span> '+what+' · <span class="key">E</span> stop');
}
function gymNearPrompt(M,kh){const K=GYM_KINDS[M.kind],n=esc(K.name.toLowerCase());return gymWho(M)?'Someone is using the '+n:kh+' to use the '+n+' <span class="cat '+(K.cat==='cardio'?'drink':'veg')+'">'+(K.cat==='cardio'?'Cardio':'Strength')+'</span>';}
// your workout totals on this browser (ga_gym per profile key), shown in the Menu
function gymStats(){return Store.get('ga_gym',{})[myKey()]||{cmin:0,smin:0,sets:0,km:0};}
function saveGymStats(M){const all=Store.get('ga_gym',{}),s=Object.assign({cmin:0,smin:0,sets:0,km:0},all[myKey()]);if(GYM_KINDS[M.kind].cat==='cardio')s.cmin+=gym.t/60;else s.smin+=gym.t/60;s.sets+=gym.sets;s.km+=gym.km;all[myKey()]=s;Store.set('ga_gym',all);}
function gymStatsHtml(){const s=gymStats();if(s.cmin+s.smin<0.05)return '<div class="fine">No workouts yet. The Gym is north-west of the plaza.</div>';
  return '<div style="font-size:15px">'+Math.round(s.cmin)+' min cardio · '+Math.round(s.smin)+' min strength ('+s.sets+' sets) · '+s.km.toFixed(1)+' km on the treadmill</div>';}

/* =========================================================
   Playground: tennis and badminton
   Two courts (COURTS, built in buildFurniture) with nets, scoreboards and stands. You need an opponent: stand in
   one half, and when someone stands in the other half press E to challenge them (they press E to accept). First to
   10 points, win by 2. Space swings, Q leaves (the score so far decides the winner). The ball follows exact flight
   formulas, so both screens agree: whoever the ball is flying towards hits it or calls the point (in, out, net, a
   second bounce) and tells the other player with a DM; spectators follow the players' shared state (ct, cb).
   ========================================================= */
// g gravity, k air drag (a shuttle slows down fast; a tennis ball barely), reach and lo..hi the height you can hit
// at, spd shot speed, home how far inside the baseline you start a point (negative: behind it)
const SPORT={
  tennis:{name:'Tennis',g:9.8,k:0,reach:1.6,lo:0.12,hi:2.3,spd:15,serveY:2.2,home:-0.4,col:'#d7f04a'},
  badminton:{name:'Badminton',g:9.8,k:1.1,reach:1.85,lo:0.35,hi:2.9,spd:9,serveY:1.0,home:1.4,col:'#ffffff'}
};
const WIN_AT=10,SWING=0.35,POINT_PAUSE=1.8,SERVE_WAIT=7,OPP_GRACE=4,INVITE_TIME=12;
const mt={on:false,c:0,side:0,opp:null,sc:[0,0],server:0,phase:'idle',ball:null,seq:0,pseq:0,pause:0,swing:0,hitThis:false,serveT:0,lost:0,over:false,end:null,inv:null,out:null,outT:0,myHit:null,note:'',barSig:''};
const isOver=sc=>Math.max(sc[0],sc[1])>=WIN_AT&&Math.abs(sc[0]-sc[1])>=2;
const sportOf=C=>SPORT[C.sport];
const nameOfKey=k=>k===myKey()?'You':USERS[k]?USERS[k].name.split(' ')[0]:'Player';
// which half of a court a point is in (0 north, 1 south), or null outside the court area or right at the net
function halfAt(C,x,z){const A=C.area;if(x<A.x0||x>A.x1||z<A.z0||z>A.z1)return null;return z<C.net-0.3?0:z>C.net+0.3?1:null;}
function courtHere(){const P=state.player;if(!P||P.seat||state.mode!=='world')return null;const p=P.root.position;for(const C of COURTS){const s=halfAt(C,p.x,p.z);if(s!==null)return{C,side:s};}return null;}
function inCourt(C,side,x,z){return x>=C.x0-0.05&&x<=C.x1+0.05&&(side===0?z>=C.z0-0.05&&z<=C.net:z>=C.net&&z<=C.z1+0.05);}
// online players standing in a half and not already playing
function playersIn(C,side){const out=[];for(const ch of locals){if(ch.kind!=='remote'||!ch.net||Array.isArray(ch.net.ct))continue;const p=ch.root.position;if(halfAt(C,p.x,p.z)===side)out.push(ch);}return out;}
/* ---------- the ball: one flight segment at a time, from p0 with velocity v0 ---------- */
function newBall(C,p,v,by,seq){const S=sportOf(C);return{p0:{x:p.x,y:p.y,z:p.z},v0:{x:v.x,y:v.y,z:v.z},t:0,g:S.g,k:S.k,by,to:1-by,b:0,live:true,rest:false,seq,pos:{x:p.x,y:p.y,z:p.z}};}
function ballAt(B,t){const k=B.k,g=B.g;
  if(k>0){const e=(1-Math.exp(-k*t))/k,vt=-g/k;return{x:B.p0.x+B.v0.x*e,y:B.p0.y+vt*t+(B.v0.y-vt)*e,z:B.p0.z+B.v0.z*e};}
  return{x:B.p0.x+B.v0.x*t,y:B.p0.y+B.v0.y*t-0.5*g*t*t,z:B.p0.z+B.v0.z*t};}
function ballVel(B,t){const k=B.k,g=B.g;if(k>0){const e=Math.exp(-k*t),vt=-g/k;return{x:B.v0.x*e,y:vt+(B.v0.y-vt)*e,z:B.v0.z*e};}return{x:B.v0.x,y:B.v0.y-g*t,z:B.v0.z};}
// the velocity that takes the ball from p to ground point q in tau seconds (exact, with or without drag)
function solveShot(C,p,q,tau){const S=sportOf(C),k=S.k,g=S.g;
  if(k>0){const e=(1-Math.exp(-k*tau))/k,vt=-g/k;return{x:(q.x-p.x)/e,z:(q.z-p.z)/e,y:(-p.y-vt*tau)/e+vt};}
  return{x:(q.x-p.x)/tau,z:(q.z-p.z)/tau,y:(-p.y+0.5*g*tau*tau)/tau};}
// height above the net tape when the shot crosses the net (negative: into the net)
function netClear(C,p,v){const S=sportOf(C),k=S.k,d=(C.net-p.z)/v.z;if(!(d>0))return 9;let t=d;if(k>0){const a=1-k*d;if(a<=0)return -9;t=-Math.log(a)/k;}return ballAt({p0:p,v0:v,g:S.g,k},t).y-C.netH;}
// a shot: an aim point in the other half, spread by how well you hit it (q 0..1); the flight is raised until it clears the net
function makeShot(C,from,toSide,aimX,depth,q,hard){
  const S=sportOf(C),half=toSide===0?C.net-C.z0:C.z1-C.net,dir=toSide===0?-1:1,err=(1-q)*2.4,a=Math.random()*TAU,r=Math.sqrt(Math.random())*err;
  const tgt={x:aimX+Math.cos(a)*r,z:C.net+dir*depth*half+Math.sin(a)*r},d=Math.hypot(tgt.x-from.x,tgt.z-from.z);
  let tau=C.sport==='tennis'?d/(S.spd*(0.8+0.45*q)*(hard?1.25:1)):(0.55+d/S.spd)*(hard?0.6:1),v=solveShot(C,from,tgt,tau);
  if((tgt.z-C.net)*dir>0)for(let i=0;i<10&&netClear(C,from,v)<0.08;i++){tau*=1.12;v=solveShot(C,from,tgt,tau);}
  return{v,tgt};
}
// move the ball on; the player it is flying towards (judge) calls the point: net, out, in, or a second bounce
function stepBall(C,B,dt,judge){
  if(B.rest)return;const t1=B.t+dt,a=B.pos,b=ballAt(B,t1);
  if(B.live&&(a.z-C.net)*(b.z-C.net)<0){const f=(C.net-a.z)/(b.z-a.z),y=a.y+(b.y-a.y)*f;
    if(y<C.netH){const x=a.x+(b.x-a.x)*f,back=Math.sign(a.z-C.net)*0.1;B.live=false;Object.assign(B,{p0:{x,y,z:C.net+back},v0:{x:0,y:0,z:0},t:0,pos:{x,y,z:C.net+back}});courtSound(C,'net');if(judge)awardPoint(B.to,'net');return;}}
  if(b.y<=0){
    let lo=B.t,hi=t1;for(let i=0;i<14;i++){const m=(lo+hi)/2;if(ballAt(B,m).y>0)lo=m;else hi=m;}const p=ballAt(B,hi);p.y=0;
    if(B.k>0){B.rest=true;B.pos=p;courtSound(C,'land');if(B.live){B.live=false;const inn=inCourt(C,B.to,p.x,p.z);if(judge)awardPoint(inn?B.by:B.to,inn?'in':'out');}return;}// a shuttle lands and stays
    const v=ballVel(B,hi);B.p0=p;B.v0={x:v.x*0.8,y:-v.y*0.72,z:v.z*0.8};B.t=t1-hi;B.pos=ballAt(B,B.t);courtSound(C,'bounce');
    if(B.v0.y<0.6){B.rest=true;B.pos=p;}
    if(B.live){B.b++;if(B.b===1&&!inCourt(C,B.to,p.x,p.z)){B.live=false;if(judge)awardPoint(B.to,'out');}else if(B.b>=2){B.live=false;if(judge)awardPoint(B.by,'in');}}
    return;}
  B.t=t1;B.pos=b;if(B.live&&B.t>8){B.live=false;if(judge)awardPoint(B.by,'in');}
}
// where the incoming ball will first touch the ground (shown as a ring to the player it is flying towards)
function landingOf(B){let t=B.t;for(let i=0;i<160;i++){t+=0.05;if(ballAt(B,t).y<=0)break;}let lo=t-0.05,hi=t;for(let i=0;i<10;i++){const m=(lo+hi)/2;if(ballAt(B,m).y>0)lo=m;else hi=m;}return ballAt(B,hi);}
/* ---------- challenges ---------- */
function challenge(key){const here=courtHere(),P=state.player;if(!here||mt.on)return;mt.out=key;mt.outT=0;sendDm(key,{g:'mi',c:here.C.i,side:here.side});P.say('Challenging '+nameOfKey(key)+'…',1600);sfx('ui');}
function acceptInvite(){const I=mt.inv,here=courtHere();if(!I||!here||here.C!==COURTS[I.c])return;sendDm(I.from,{g:'ma',c:I.c});startMatch(I.c,here.side,I.from,1-here.side);}// the challenger serves first
function courtInteract(cv){
  const P=state.player;if(mt.inv&&COURTS[mt.inv.c]===cv.C){acceptInvite();return;}
  const o=playersIn(cv.C,1-cv.side);
  if(!o.length){P.say('No opponent yet. Someone has to stand in the other half.',2200);sfx('deny');return;}
  if(o.length===1){challenge(o[0].id.slice(6));return;}
  showModal('match','<h2 id="modalTitle">Choose your opponent</h2><p class="fine">'+esc(SPORT[cv.C.sport].name)+', first to '+WIN_AT+' points (win by 2). They have to accept.</p><div class="opp-list">'
    +o.map(ch=>'<button class="btn" type="button" data-k="'+esc(ch.id.slice(6))+'">'+esc(ch.data.name)+'</button>').join('')+'</div>');
  $('#modalBody').querySelectorAll('[data-k]').forEach(b=>b.addEventListener('click',()=>{closeModal();challenge(b.dataset.k);}));
}
function onMatchDm(from,d){
  const C=COURTS[d.c];if(!C)return;const here=courtHere();
  if(d.g==='mi'){if(mt.on||!here||here.C!==C||here.side===d.side){sendDm(from,{g:'mn',c:d.c});return;}if(mt.out===from&&myKey()>from)return;// crossed challenges: the lower key's stands
    mt.inv={from,c:d.c,t:0};toast(esc(nameOfKey(from))+' challenges you to '+esc(SPORT[C.sport].name.toLowerCase())+'! Press <span class="key">'+(coarse?'Use':'E')+'</span> to accept.','',5000);sfx('ui');}
  else if(d.g==='ma'){if(mt.out!==from||mt.on||!here||here.C!==C){sendDm(from,{g:'mq',c:d.c});return;}mt.out=null;startMatch(d.c,here.side,from,here.side);}
  else if(d.g==='mn'){if(mt.out===from){mt.out=null;if(state.player)state.player.say(nameOfKey(from)+' can’t play right now.',1800);}}
  else if(!mt.on||mt.opp!==from||mt.c!==d.c)return;
  else if(d.g==='mh'){if(!(d.seq>mt.seq)||!Array.isArray(d.p)||!Array.isArray(d.v))return;mt.seq=d.seq;mt.ball=newBall(C,{x:+d.p[0]||0,y:+d.p[1]||0,z:+d.p[2]||0},{x:+d.v[0]||0,y:+d.v[1]||0,z:+d.v[2]||0},d.by===1?1:0,d.seq);mt.phase='rally';courtSound(C,'hit');}
  else if(d.g==='mp'&&Array.isArray(d.sc))applyPoint(d);
  else if(d.g==='mq')endMatch('oppquit');
}
/* ---------- the match ---------- */
function startMatch(c,side,opp,server){
  const P=state.player,C=COURTS[c];if(!P)return;if(P.held&&!P.eating)putDownFood();if(P.rodMesh)stowRod(false);
  Object.assign(mt,{on:true,c,side,opp,sc:[0,0],server,phase:'serve',ball:null,seq:0,pseq:0,pause:0,swing:0,hitThis:false,serveT:0,lost:0,over:false,end:null,inv:null,out:null,myHit:null});
  P.anim.sport=C.sport;cam.yaw=side===0?Math.PI:0;cam.pitch=0.42;cam.dist=9;startPoint();sfx('whistle');closeCard();
  toast('Match on: you vs '+esc(nameOfKey(opp))+' · '+SPORT[C.sport].name+', first to '+WIN_AT+' (win by 2). '+(coarse?'Swing to hit, Leave to stop.':'Space swings, Q leaves.'),'',4500);
}
// each point starts with both players at home, cross-court from each other; the server serves
function startPoint(){
  const P=state.player,C=COURTS[mt.c],S=sportOf(C),me=mt.side,off=((mt.sc[0]+mt.sc[1])%2?-1:1)*(C.x1-C.x0)*0.2;
  mt.phase='serve';mt.ball=null;mt.serveT=0;mt.myHit=null;
  P.root.position.set(C.cx+(mt.server===me?off:-off),0,me===0?C.z0+S.home:C.z1-S.home);P.heading=me===0?0:Math.PI;P.vy=0;P.onGround=true;
  mt.note=mt.server===me?'Your serve':nameOfKey(mt.opp)+' to serve';
}
function launch(C,from,v){
  const P=state.player;mt.seq++;mt.ball=newBall(C,from,v,mt.side,mt.seq);mt.phase='rally';
  const r=x=>Math.round(x*1000)/1000,pa=[r(from.x),r(from.y),r(from.z)],va=[r(v.x),r(v.y),r(v.z)];
  mt.myHit=[mt.seq,...pa,...va,mt.side];sendDm(mt.opp,{g:'mh',c:mt.c,seq:mt.seq,p:pa,v:va,by:mt.side});courtSound(C,'hit');
  V.en=vclamp(V.en-0.25);P.swN=(P.swN||0)+1;
}
function serve(){
  const P=state.player,C=COURTS[mt.c],S=sportOf(C),p=P.root.position,dir=mt.side===0?1:-1;if(mt.phase!=='serve'||mt.server!==mt.side)return;
  P.anim.swing=SWING;P.anim.swingHi=C.sport==='tennis';P.swh=P.anim.swingHi;
  const from={x:p.x,y:S.serveY,z:p.z+dir*0.4},w=C.x1-C.x0,shot=makeShot(C,from,1-mt.side,C.cx+rand(-0.3,0.3)*w,rand(0.55,0.85),0.9,false);
  if(C.sport==='badminton')shot.v=makeShot(C,from,1-mt.side,shot.tgt.x,0.8,1,false).v;// a high, deep serve
  launch(C,from,shot.v);mt.note='Rally';
}
function matchSwing(){
  if(!mt.on)return;const P=state.player;if(mt.phase==='serve'){if(mt.server===mt.side)serve();return;}
  if(mt.swing>0)return;mt.swing=SWING;mt.hitThis=false;const B=mt.ball;P.anim.swing=SWING;P.anim.swingHi=!!(B&&B.pos.y>1.8);P.swh=P.anim.swingHi;P.swN=(P.swN||0)+1;V.en=vclamp(V.en-0.1);
}
// a hit: aim with A/D (left and right on screen), otherwise away from your opponent; timing and distance set the accuracy
function returnShot(C,B,q){
  const P=state.player,w=C.x1-C.x0,lx=-Math.cos(cam.yaw),left=keys.has('a')||keys.has('arrowleft'),right=keys.has('d')||keys.has('arrowright');
  let aimX;if(left!==right)aimX=C.cx+(left?1:-1)*Math.sign(lx||1)*0.35*w;else{const o=state.chars.get('local:'+mt.opp),ox=o?o.root.position.x:C.cx;aimX=C.cx+(ox>C.cx?-1:1)*rand(0.15,0.38)*w;}
  aimX=clamp(aimX,C.x0+0.4,C.x1-0.4);if(V.en<20)q*=0.75;if(P.anim.run)q*=0.9;
  const from={x:B.pos.x,y:B.pos.y,z:B.pos.z},shot=makeShot(C,from,1-mt.side,aimX,rand(0.45,0.9),q,B.pos.y>1.6);
  launch(C,from,shot.v);
}
function awardPoint(w,why){
  if(!mt.on||mt.phase!=='rally')return;const sc=mt.sc.slice();sc[w]++;
  const d={g:'mp',c:mt.c,sc,w,why,server:w,pseq:mt.pseq+1,over:isOver(sc)};sendDm(mt.opp,d);applyPoint(d);
}
function applyPoint(d){
  if(!(d.pseq>mt.pseq))return;mt.pseq=d.pseq;mt.sc=[d.sc[0]|0,d.sc[1]|0];mt.server=d.server===1?1:0;mt.phase='point';mt.pause=POINT_PAUSE;mt.over=!!d.over;
  if(mt.ball)mt.ball.live=false;const mine=d.w===mt.side;
  mt.note=(mine?'Your point':nameOfKey(mt.opp)+'’s point')+({out:' · out',net:' · into the net'}[d.why]||'');
  sfx('whistle');if(mine)sfx('catch');
}
// the match ends at 10 (win by 2), when someone leaves, or when the other player is gone; the score decides
function endMatch(reason){
  if(!mt.on)return;const s=mt.sc.slice(),me=mt.side,w=s[0]>s[1]?0:s[1]>s[0]?1:-1,C=COURTS[mt.c],opp=nameOfKey(mt.opp),P=state.player,game=SPORT[C.sport].name.toLowerCase();
  mt.on=false;mt.phase='idle';mt.ball=null;mt.swing=0;mt.end={t:0,sc:s,side:me,w,c:mt.c};COURT_FX[mt.c].mine=8;if(P){P.anim.sport=null;P.anim.swing=0;}
  const why={left:opp+' left the court. ',quit:'You left the match. ',oppquit:opp+' left the match. '}[reason]||'';
  if(w===-1){toast(esc(why)+'It’s a draw, '+s[me]+'–'+s[1-me]+'.','',5000);sfx('ui');}
  else if(w===me){toast(esc(why)+'You win the '+game+' match '+s[me]+'–'+s[1-me]+'!','gold',5500,ICON_GOLD);celebrate(P);P.celN=(P.celN||0)+1;}
  else{toast(esc(why)+esc(opp)+' wins the '+game+' match '+s[1-me]+'–'+s[me]+'.','',5000);if(P)P.say('Good game!',2200);sfx('ui');}
}
function quitMatch(msg){if(!mt.on)return;sendDm(mt.opp,{g:'mq',c:mt.c});if(msg&&state.player)state.player.say(msg,2000);endMatch('quit');}
function celebrate(ch){if(!ch)return;ch.anim.celebrate=3;ch.hop(6);const p=ch.root.position;burst(p.x,p.y+1.9,p.z,36,['#f2b632','#e0442e','#6cbf4c','#4fd3ff','#ffffff'],3.2,0.08);if(ch.kind==='me'||zoneAt(state.player.root.position.x,state.player.root.position.z)==='Playground')sfx('golden');}
// during a match you stay in your half
function clampToHalf(p){const C=COURTS[mt.c],A=C.area;p.x=clamp(p.x,A.x0+0.35,A.x1-0.35);if(mt.side===0)p.z=clamp(p.z,A.z0+0.35,C.net-0.8);else p.z=clamp(p.z,C.net+0.8,A.z1-0.35);}
function updateMatch(dt){
  const P=state.player;
  if(mt.inv){mt.inv.t+=dt;if(mt.inv.t>INVITE_TIME)mt.inv=null;}
  if(mt.out){mt.outT+=dt;if(mt.outT>INVITE_TIME){mt.out=null;if(P)P.say('No answer.',1400);}}
  if(mt.end){mt.end.t+=dt;if(mt.end.t>4)mt.end=null;}
  if(mt.on&&P){
    const C=COURTS[mt.c],S=sportOf(C),o=state.chars.get('local:'+mt.opp),here=o&&o.kind==='remote'&&o.net&&Array.isArray(o.net.ct)&&o.net.ct[0]===mt.c;
    mt.lost=here?0:mt.lost+dt;
    if(mt.lost>OPP_GRACE)endMatch('left');
    else if(V.en<4)quitMatch('I’m too tired to play on.');
    else{
      if(mt.phase==='point'){mt.pause-=dt;if(mt.pause<=0){if(mt.over)endMatch('won');else startPoint();}}
      else if(mt.phase==='serve'&&mt.server===mt.side){mt.serveT+=dt;if(mt.serveT>SERVE_WAIT)serve();}
      if(mt.ball)stepBall(C,mt.ball,dt,mt.ball.to===mt.side);
      if(mt.on&&mt.swing>0){mt.swing-=dt;const B=mt.ball,ts=SWING-mt.swing,p=P.root.position;
        if(B&&B.live&&B.to===mt.side&&!mt.hitThis&&ts>0.02&&(mt.side===0?B.pos.z<C.net:B.pos.z>C.net)&&(C.sport!=='tennis'||B.b<=1)){
          const d=Math.hypot(B.pos.x-p.x,B.pos.z-p.z);
          if(d<=S.reach&&B.pos.y>=S.lo&&B.pos.y<=S.hi){mt.hitThis=true;returnShot(C,B,clamp(1-Math.abs(ts-0.15)/0.2,0,1)*0.5+clamp(1-Math.abs(d-0.9)/1.2,0,1)*0.5);}}}
    }
  }
  updateCourtViews(dt);renderMatchBar();
}
/* ---------- what everyone sees: ball, shadow, landing ring, scoreboards, results ---------- */
const COURT_FX=COURTS.map(C=>{
  const ball=new THREE.Group();if(C.sport==='tennis')db(ball,0,0,0,0.14,0.14,0.14,'#d7f04a');else{db(ball,0,0,0.05,0.07,0.07,0.07,'#e8e2d0');db(ball,0,0,-0.05,0.13,0.13,0.12,'#ffffff');}
  ball.visible=false;scene.add(ball);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(0.3,0.3),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.3,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.visible=false;scene.add(shadow);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.28,0.42,20),new THREE.MeshBasicMaterial({color:0xfff2a8,transparent:true,opacity:0.65,depthWrite:false,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
  return{ball,shadow,ring,spec:null,seq:-1,sig:'',ann:'',info:null,mine:0};});
function courtSound(C,what){const P=state.player;if(!P||zoneAt(P.root.position.x,P.root.position.z)!=='Playground')return;sfx(what==='hit'?(C.sport==='tennis'?'thwack':'shuttle'):what==='net'?'putdown':'bounce');}
function updateCourtViews(dt){
  const P=state.player,inPlay=!!P&&zoneAt(P.root.position.x,P.root.position.z)==='Playground';
  COURTS.forEach((C,i)=>{
    const F=COURT_FX[i];let B=null,info=null;if(F.mine>0)F.mine-=dt;
    if(mt.on&&mt.c===i){const mk=myKey(),k0=mt.side===0?mk:mt.opp,k1=mt.side===1?mk:mt.opp;B=mt.ball;info={names:[USERS[k0]?USERS[k0].name.split(' ')[0]:'—',USERS[k1]?USERS[k1].name.split(' ')[0]:'—'],sc:mt.sc,server:mt.server,phase:mt.phase};}
    else{// watching: the players share their match (ct) and their last hit (cb)
      let best=null,cb=null;const names=[null,null];
      for(const ch of locals){const n=ch.net;if(ch.kind!=='remote'||!n||!Array.isArray(n.ct)||n.ct[0]!==i)continue;names[n.ct[1]===1?1:0]=ch.data.name.split(' ')[0];if(!best||(n.ct[4]|0)>(best[4]|0))best=n.ct;if(Array.isArray(n.cb)&&(!cb||n.cb[0]>cb[0]))cb=n.cb;}
      if(mt.end&&mt.end.c===i&&!names[mt.end.side])names[mt.end.side]=state.me.name.split(' ')[0];// your own just-finished match
      if(best){const ph=['serve','rally','point','over'][best[6]|0]||'rally';info={names:[names[0]||'—',names[1]||'—'],sc:[best[2]|0,best[3]|0],server:best[5]===1?1:0,phase:ph,w:best[7]};
        if(cb&&cb[0]!==F.seq){F.seq=cb[0];F.spec=newBall(C,{x:+cb[1]||0,y:+cb[2]||0,z:+cb[3]||0},{x:+cb[4]||0,y:+cb[5]||0,z:+cb[6]||0},cb[7]===1?1:0,cb[0]);courtSound(C,'hit');}
        if(F.spec&&ph!=='serve'){stepBall(C,F.spec,dt,false);B=F.spec;}
        if(ph==='over'){const key=info.names.join()+info.sc.join();if(F.ann!==key){F.ann=key;if(inPlay&&!(F.mine>0)){const w=info.w;toast(w===0||w===1?esc(info.names[w])+' beat '+esc(info.names[1-w])+' '+info.sc[w]+'–'+info.sc[1-w]+' at '+esc(SPORT[C.sport].name.toLowerCase())+'!':'The '+esc(SPORT[C.sport].name.toLowerCase())+' match ended in a draw, '+info.sc[0]+'–'+info.sc[1]+'.','',5000);}}}
      }else{F.spec=null;F.seq=-1;}
    }
    F.info=info;
    if(B){F.ball.visible=true;F.ball.position.set(B.pos.x,B.pos.y+(C.sport==='tennis'?0.07:0.06),B.pos.z);
      if(C.sport==='badminton'&&!B.rest){const v=ballVel(B,B.t);F.ball.lookAt(B.pos.x+v.x,B.pos.y+v.y,B.pos.z+v.z);}
      F.shadow.visible=true;F.shadow.position.set(B.pos.x,0.03,B.pos.z);F.shadow.material.opacity=clamp(0.35-B.pos.y*0.06,0.08,0.35);}
    else{F.ball.visible=false;F.shadow.visible=false;}
    const showRing=mt.on&&mt.c===i&&B&&B.live&&B.to===mt.side;F.ring.visible=!!showRing;if(showRing){const L=landingOf(B);F.ring.position.set(L.x,0.04,L.z);}
    drawScoreboard(C,info);
  });
}
function drawScoreboard(C,info){
  const F=COURT_FX[C.i],sig=info?info.names.join()+info.sc.join()+info.server+info.phase:'-';if(F.sig===sig||!C.board)return;F.sig=sig;
  const g=C.board.canvas.getContext('2d'),W=256,H=112;g.fillStyle='#16301e';g.fillRect(0,0,W,H);g.fillStyle='#f2b632';g.fillRect(0,0,W,4);g.fillRect(0,H-4,W,4);
  g.textAlign='center';g.font='700 15px '+FONT_UI;g.fillStyle='#f2b632';g.fillText(SPORT[C.sport].name.toUpperCase(),W/2,22);
  if(!info){g.font='700 16px '+FONT_UI;g.fillStyle='#f6ecd6';g.fillText('Waiting for players',W/2,66);g.fillStyle='#9fc89a';g.font='400 13px '+FONT_UI;g.fillText('One in each half, then press E',W/2,90);}
  else{for(const s of [0,1]){const x=s?192:64;g.font='700 15px '+FONT_UI;g.fillStyle='#f6ecd6';g.fillText((info.server===s&&info.phase!=='over'?'● ':'')+info.names[s],x,44);g.font='700 40px '+FONT_PIX;g.fillStyle=s?'#ff8f6e':'#4fd3ff';g.fillText(String(info.sc[s]),x,88);}
    g.fillStyle='#f6ecd6';g.font='700 28px '+FONT_PIX;g.fillText('–',W/2,84);
    if(info.phase==='over'){g.fillStyle='#f2b632';g.font='700 13px '+FONT_UI;g.fillText(info.w===0||info.w===1?info.names[info.w]+' wins!':'Draw',W/2,104);}}
  C.board.tex.needsUpdate=true;
}
// the HUD scoreboard: shown while you stand in a court half (waiting) or play
function renderMatchBar(){
  const cv=mt.on?null:courtHere(),show=mt.on||!!cv,bar=$('#matchBar');
  let sig='-';if(show){const C=mt.on?COURTS[mt.c]:cv.C,o=mt.on?mt.opp:null;sig=[C.i,mt.on,mt.sc.join(),mt.server,mt.note,o,mt.inv&&mt.inv.from,mt.out,cv&&playersIn(cv.C,1-cv.side).length].join('|');}
  if(sig===mt.barSig)return;mt.barSig=sig;bar.hidden=!show;$('#hud').classList.toggle('in-court',show);$('#tJump').textContent=mt.on?'Swing':'Jump';if(!show)return;
  const C=mt.on?COURTS[mt.c]:cv.C,me=mt.side;$('#mTitle').textContent=SPORT[C.sport].name+(mt.on?' · first to '+WIN_AT:'');
  $('#mP0').textContent=(mt.on&&mt.server===me?'● ':'')+'You';$('#mP1').textContent=mt.on?(mt.server!==me?'● ':'')+nameOfKey(mt.opp):'—';
  $('#mS0').textContent=mt.on?mt.sc[me]:'0';$('#mS1').textContent=mt.on?mt.sc[1-me]:'0';$('#mLeave').hidden=!mt.on;
  let note=mt.note;if(!mt.on){const n=playersIn(C,1-cv.side).length;note=mt.inv&&COURTS[mt.inv.c]===C?nameOfKey(mt.inv.from)+' challenged you':mt.out?'Waiting for '+nameOfKey(mt.out)+'…':n?n+' player'+(n>1?'s':'')+' ready on the other side':'No opponent';}
  $('#mNote').textContent=note;
}
function matchPrompt(){return esc(mt.note)+(coarse?'':' · <span class="key">Space</span> '+(mt.phase==='serve'&&mt.server===mt.side?'serve':'swing')+' · <span class="key">A</span>/<span class="key">D</span> aim · <span class="key">Q</span> leave');}
function courtPrompt(cv,kh){
  const n=SPORT[cv.C.sport].name;if(mt.inv&&COURTS[mt.inv.c]===cv.C)return kh+' to accept '+esc(nameOfKey(mt.inv.from))+'’s challenge';
  if(mt.out)return 'Waiting for '+esc(nameOfKey(mt.out))+' to accept…';const o=playersIn(cv.C,1-cv.side);
  return !o.length?esc(n)+' court · No opponent yet: someone has to stand in the other half':o.length===1?kh+' to challenge '+esc(nameOfKey(o[0].id.slice(6)))+' to '+esc(n.toLowerCase()):kh+' to choose your opponent ('+o.length+' players)';
}
$('#mLeave').addEventListener('click',()=>quitMatch());

/* =========================================================
   Player, camera, input
   ========================================================= */
const cam={yaw:0,pitch:0.55,dist:10.5,target:new THREE.Vector3(0,0,-4),attract:0};
const keys=new Set();const joy={x:0,y:0,run:false,active:false};let jumpQueued=false;
const SPAWN={x:0,z:9.5};
function updatePlayer(dt){
  const P=state.player;if(!P)return;const p=P.root.position;
  let ix=0,iz=0;
  if(!isTyping()&&!state.modal){if(keys.has('w')||keys.has('arrowup'))iz-=1;if(keys.has('s')||keys.has('arrowdown'))iz+=1;if(keys.has('a')||keys.has('arrowleft'))ix-=1;if(keys.has('d')||keys.has('arrowright'))ix+=1;}
  ix+=joy.x;iz+=joy.y;const len=Math.hypot(ix,iz);if(len>1){ix/=len;iz/=len;}
  const moving=len>0.08;
  if(rr.use||arc.open||gym.use){jumpQueued=false;P.anim.speed=0;P.anim.run=false;return;}
  if(fishing.phase==='cast'||fishing.phase==='reel'||fishing.phase==='caught'){jumpQueued=false;P.anim.speed=0;return;}
  if((fishing.phase==='wait'||fishing.phase==='bite')&&(moving||jumpQueued)){endFishing();P.say('Reeled in.',1000);}
  if(rr.wash&&(moving||jumpQueued))rr.wash=null;
  if(P.seat){if(moving||jumpQueued){standUp();}else{jumpQueued=false;P.anim.speed=0;return;}}
  const run=(keys.has('shift')||joy.run)&&canRun();
  const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
  let mx=rx*ix+fx*(-iz),mz=rz*ix+fz*(-iz);const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  const inWater=cellTop(p.x,p.z)<-0.5&&p.y<-0.4;P.inWater=inWater;
  const spd=(run?5.6:3.0)*(inWater?0.55:1)*vitalSpeed();
  const dx=mx*spd*dt,dz=mz*spd*dt,ox=p.x,oz=p.z;
  if(dx&&!blocked(p.x+dx,p.z,p.y))p.x+=dx;
  if(dz&&!blocked(p.x,p.z+dz,p.y))p.z+=dz;
  if(mt.on)clampToHalf(p);
  if(moving)P.heading=Math.atan2(mx,mz);
  if(P.onGround){P.stepAcc=(P.stepAcc||0)+Math.hypot(p.x-ox,p.z-oz);if(P.stepAcc>(run?0.95:0.7)){P.stepAcc=0;sfx('step',{ground:inWater?'water':getTile(Math.floor(p.x),Math.floor(p.z))});}}
  if(jumpQueued&&P.onGround){P.vy=inWater?5.4:7.0;P.onGround=false;sfx('jump');V.en=vclamp(V.en-JUMP_COST);}
  jumpQueued=false;
  P.vy-=22*dt;p.y+=P.vy*dt;const g=supportY(p.x,p.z);
  if(p.y<=g){if(!P.onGround){if(g<-0.5&&P.vy<-3){burst(p.x,-0.2,p.z,14,['#d7eefc','#8fd0f5','#ffffff'],2,0.08);sfx('splash');}else if(P.vy<-4)sfx('land');}p.y=g;P.vy=0;P.onGround=true;}else if(p.y-g>0.05)P.onGround=false;
  P.anim.speed=moving?spd*Math.min(1,len):0;P.anim.run=run&&moving;P.anim.air=!P.onGround;P.anim.pose=rr.wash?'wash':'stand';
}
function blocked(x,z,y){const r=0.28;for(const o of [[-r,-r],[r,-r],[-r,r],[r,r]]){if(cellTop(x+o[0],z+o[1])>y+0.55)return true;}return false;}
function supportY(x,z){const r=0.2;let m=-99;for(const o of [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]])m=Math.max(m,cellTop(x+o[0],z+o[1]));return m;}
// desk seats belong to one person: only the owner can sit there, and a slot without a desk has no chair
const myKey=()=>kOf(state.me);
function nearestSeat(){const p=state.player.root.position;let best=null,bd=1.9;for(const s of SPOTS){if(s.pose!=='sit'||s.occ||(s.desk&&s.owner!==myKey()))continue;const d=Math.hypot(s.x-p.x,s.z-p.z);if(d<bd){bd=d;best=s;}}return best;}
function nearestOtherDesk(){const p=state.player.root.position;let best=null,bd=1.9;for(const S of DESK_SLOTS){const s=S.spot;if(!S.desk||s.owner===myKey())continue;const d=Math.hypot(s.x-p.x,s.z-p.z);if(d<bd){bd=d;best=s;}}return best;}
const deskOwnerName=s=>{const u=s&&USERS[s.owner];return u?u.name.split(' ')[0]:'someone';};
function sitOn(s){const P=state.player;if(P.rodMesh)stowRod();s.occ='me';P.seat=s;placeAt(P,s);P.vy=0;P.onGround=true;P.say(s.desk?'My desk!':'Comfy.',1200);sfx('sit');if(P.held&&!P.eating&&!tooFull(FOOD[P.held]))startEat();}
function standUp(){const P=state.player,s=P.seat;if(!s)return;s.occ=null;P.seat=null;const a=s.approach||{x:s.x,z:s.z+1};P.root.position.set(a.x,0,a.z);P.baseY=0;P.anim.pose='stand';P.root.visible=true;sfx('stand');}
function tryInteract(){
  if(state.mode!=='world'||state.modal)return;const P=state.player;if(!P)return;
  if(arc.open)return;
  if(gym.use){stopGym();return;}
  if(mt.on)return;
  if(P.seat){standUp();return;}
  if(rr.use||rr.wash)return;
  if(!P.eating){const ac=nearestArcade();if(ac){useArcade(ac);return;}const gm=nearestGym();if(gm){startGym(gm);return;}}
  const cv=courtHere();if(cv){courtInteract(cv);return;}
  if(P.rodMesh){fishAction();return;}
  if(nearRack()){takeRod();return;}
  if(P.root.position.distanceTo(BOARD_POS)<3.2){openBoard();return;}
  if(P.eating)return;
  const ci=nearestCounterItem();if(ci>=0){holdFood(menu.items[ci]);return;}
  if(nearCoffee()){startBrew();return;}
  if(nearCooler()){holdFood('water');return;}
  const sk=nearestSink();if(sk){startWash(sk);return;}
  const st=nearestStall();if(st){startRestroom(st);return;}
  const s=nearestSeat();if(s){sitOn(s);return;}
  const o=nearestOtherDesk();if(o){P.say('That’s '+deskOwnerName(o)+'’s desk.',1800);sfx('deny');}
}
addEventListener('keydown',e=>{
  if(arc.open){arcKey(e,true);return;}
  if(e.key==='Escape'){if(state.modal)closeModal();else if(state.selected)closeCard();return;}
  if(isTyping()||state.mode!=='world'||state.modal)return;
  const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
  keys.add(k);
  if(gym.use&&!e.repeat&&['w','arrowup','s','arrowdown'].includes(k))gymLevel(k==='w'||k==='arrowup'?1:-1);
  if(k===' '&&!e.repeat){if(mt.on)matchSwing();else jumpQueued=true;}
  if(k==='e'&&!e.repeat)tryInteract();
  if(k==='m'&&!e.repeat)toggleMute();
  if(k==='f'&&!e.repeat)startEat();
  if(k==='q'&&!e.repeat)dropAction();
  if(k==='k'&&!e.repeat)keepFish();
  if(k==='r'&&!e.repeat)releaseFish();
  if(!state.hintHidden&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k))scheduleHintHide();
});
addEventListener('keyup',e=>{const k=e.key.toLowerCase();keys.delete(k);arcKeys.delete(k);});
addEventListener('blur',()=>{keys.clear();arcKeys.clear();});

const cvs=renderer.domElement;const raycaster=new THREE.Raycaster();const ndc=new THREE.Vector2();
let drag=null,lastClick={id:null,t:0};const ptrs=new Map();let pinch=null;// two fingers on the view pinch to zoom
cvs.addEventListener('pointerdown',e=>{if(state.mode!=='world')return;ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});try{cvs.setPointerCapture(e.pointerId);}catch(_){}
  if(ptrs.size>=2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,dist:cam.dist};drag=null;return;}
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:false};});
cvs.addEventListener('pointermove',e=>{if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&ptrs.size>=2){const [a,b]=[...ptrs.values()];cam.dist=clamp(pinch.dist*pinch.d/(Math.hypot(a.x-b.x,a.y-b.y)||1),4,24);return;}
  if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.lx,dy=e.clientY-drag.ly;drag.lx=e.clientX;drag.ly=e.clientY;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;
  if(drag.moved){cam.yaw-=dx*0.0065;cam.pitch=clamp(cam.pitch+dy*0.0045,0.16,1.25);}});
const ptrEnd=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;};
cvs.addEventListener('pointerup',e=>{ptrEnd(e);if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(!d.moved)handlePick(e.clientX,e.clientY);});
cvs.addEventListener('pointercancel',e=>{ptrEnd(e);drag=null;});
cvs.addEventListener('wheel',e=>{if(state.mode!=='world')return;e.preventDefault();cam.dist=clamp(cam.dist*(e.deltaY>0?1.1:0.9),4,24);},{passive:false});
function handlePick(cx,cy){
  const r=cvs.getBoundingClientRect();ndc.set(((cx-r.left)/r.width)*2-1,-((cy-r.top)/r.height)*2+1);raycaster.setFromCamera(ndc,camera);
  const targets=[...PICK_TARGETS];for(const ch of state.chars.values())if(ch.root.visible)targets.push(ch.hit);
  const hits=raycaster.intersectObjects(targets,false);
  if(!hits.length){if(state.selected)closeCard();return;}
  const o=hits[0].object;
  if(o.userData.board){openBoard();return;}
  const ch=o.userData.char;if(!ch)return;
  const now=performance.now();
  if(lastClick.id===ch.id&&now-lastClick.t<400){lastClick={id:null,t:0};if(ch!==state.player)doPoke(state.player,ch,POKES[state.pokeMsg]);else{ch.anim.wave=1.2;room.waveN++;}}
  else{lastClick={id:ch.id,t:now};openCard(ch);}
}

/* touch controls, Minecraft-style: the left thumb walks with a stick that appears where it lands, and pushing past the ring runs
   (a quick tap there still picks a coworker); the right side drags to look and pinches to zoom; Use, Jump, Eat and Drop sit bottom right */
const joyEl=$('#joy'),knob=$('#knob'),moveZone=$('#moveZone'),JOY_R=50,JOY_RUN=JOY_R+20;
if(coarse){$('#touch').hidden=false;}
moveZone.addEventListener('pointerdown',e=>{if(joy.active!==false||state.mode!=='world')return;if(e.preventDefault)e.preventDefault();
  joy.active=e.pointerId;joy.cx=e.clientX;joy.cy=e.clientY;joy.t0=performance.now();joy.moved=false;try{moveZone.setPointerCapture(e.pointerId);}catch(_){}
  joyEl.style.left=e.clientX+'px';joyEl.style.top=e.clientY+'px';joyEl.style.bottom='auto';joyEl.classList.add('on');moveJoy(e);scheduleHintHide();});
moveZone.addEventListener('pointermove',e=>{if(joy.active===e.pointerId)moveJoy(e);});
function endJoy(e){if(joy.active!==e.pointerId)return;const tap=!joy.moved&&performance.now()-joy.t0<350;joy.active=false;joy.x=joy.y=0;joy.run=false;
  knob.style.transform='';joyEl.style.left=joyEl.style.top=joyEl.style.bottom='';joyEl.classList.remove('on');joyEl.classList.remove('run');if(tap&&state.mode==='world')handlePick(e.clientX,e.clientY);}
moveZone.addEventListener('pointerup',endJoy);moveZone.addEventListener('pointercancel',endJoy);
function moveJoy(e){let dx=e.clientX-joy.cx,dy=e.clientY-joy.cy;const l=Math.hypot(dx,dy);if(l>8)joy.moved=true;joy.run=l>JOY_RUN;joyEl.classList.toggle('run',joy.run);
  if(l>JOY_R){dx*=JOY_R/l;dy*=JOY_R/l;}joy.x=dx/JOY_R;joy.y=dy/JOY_R;knob.style.transform='translate('+dx+'px,'+dy+'px)';}
$('#tJump').addEventListener('pointerdown',e=>{e.preventDefault();if(mt.on)matchSwing();else jumpQueued=true;});// Swing during a match
$('#tUse').addEventListener('click',tryInteract);
['pointerdown','pointerup','pointercancel','pointerleave'].forEach(t=>$('#tUse').addEventListener(t,()=>{fishing.hold=t==='pointerdown';}));// hold Use to reel
$('#tEat').addEventListener('click',startEat);
$('#tDrop').addEventListener('click',dropAction);
// Q / Drop: leave a match, put the rod back, or put your food down
function dropAction(){if(mt.on)quitMatch();else if(state.player&&state.player.rodMesh&&fishing.phase!=='reel')stowRod();else putDownFood();}
// the Use button names what it will do here (same order as tryInteract); Drop shows while you hold food or a rod
function useVerb(){const P=state.player;if(!P||state.mode!=='world'||state.modal||arc.open||mt.on||rr.use||rr.wash)return '';
  if(gym.use)return 'Stop';if(P.seat)return 'Stand';
  if(!P.eating){if(nearestArcade())return 'Play';if(nearestGym())return 'Start';}
  if(courtHere())return 'Play';
  if(P.rodMesh)return fishing.phase==='reel'?'Reel':(fishing.phase==='wait'||fishing.phase==='bite')?'Strike':fishing.phase?'':'Cast';
  if(nearRack())return 'Rod';if(P.root.position.distanceTo(BOARD_POS)<3.2)return 'Read';if(P.eating)return '';
  if(nearestCounterItem()>=0||nearCooler())return 'Take';if(nearCoffee())return brew.on?'':'Coffee';if(nearestSink())return 'Wash';
  const st=nearestStall();if(st)return st.occ?'':st.kind==='shower'?'Shower':'Enter';
  return nearestSeat()?'Sit':'';}
function updateTouchButtons(){const P=state.player,v=useVerb(),u=$('#tUse');$('#tUseV').textContent=v||'Use';u.classList.toggle('idle',!v);u.setAttribute('aria-label',v?v+' (Use)':'Use');
  const d=$('#tDrop'),rod=!!(P&&P.rodMesh&&fishing.phase!=='reel'&&fishing.phase!=='caught'),food=!!(P&&P.held&&!P.eating);d.hidden=!(rod||food);if(!d.hidden)d.textContent=rod?'Stow':'Drop';}

/* landscape only on phones and tablets: going full screen lets Android lock the orientation; elsewhere the rotate screen asks */
const fsEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
function goLandscape(){const el=document.documentElement,req=el&&(el.requestFullscreen||el.webkitRequestFullscreen);
  const lock=()=>{try{const o=screen.orientation;if(o&&o.lock)o.lock('landscape').catch(()=>{});}catch(_){}};
  if(!fsEl()&&req){try{const r=req.call(el,{navigationUI:'hide'});if(r&&r.then)r.then(lock,()=>{});else lock();}catch(_){lock();}}else lock();}
function toggleFull(){if(fsEl())(document.exitFullscreen||document.webkitExitFullscreen).call(document);else goLandscape();}
if(coarse){const canFs=!!(document.fullscreenEnabled||document.webkitFullscreenEnabled);$('#rotateFull').hidden=!canFs;$('#bFull').hidden=!canFs;
  $('#rotateFull').addEventListener('click',goLandscape);$('#bFull').addEventListener('click',toggleFull);
  if(document.addEventListener)document.addEventListener('fullscreenchange',()=>{$('#bFull').textContent=fsEl()?'Exit full screen':'Full screen';});
  if(canFs)addEventListener('pointerdown',goLandscape,{once:true});}// the first tap goes full screen and locks landscape

/* phone HUD: starts compact; tap your panel for all your stats, the map to enlarge it, and ☰ for the buttons */
if(phoneUI){const mp=$('#mePanel'),tr=$('#hudTr'),acts=$('#hudActions'),more=$('#bMore');
  const flip=(el,a)=>{const o=!el.classList.contains('open');el.classList.toggle('open',o);(a||el).setAttribute('aria-expanded',String(o));return o;},
    shut=(el,a)=>{el.classList.remove('open');(a||el).setAttribute('aria-expanded','false');};// your stats and the button tray share the left edge: one at a time
  for(const [el,label] of [[mp,'Your stats'],[tr,'Map']]){el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-expanded','false');el.setAttribute('aria-label',label);
    const tap=()=>{if(flip(el)&&el===mp)shut(acts,more);};el.addEventListener('click',tap);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();tap();}});}
  more.addEventListener('click',()=>{if(flip(acts,more))shut(mp);});
  acts.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button');if(b&&b!==more)shut(acts,more);});}

function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();applyViewOffset();}
function applyViewOffset(){const w=stage.clientWidth,h=stage.clientHeight;if(state.mode==='login'&&w>900)camera.setViewOffset(w,h,-w*0.17,0,w,h);else camera.clearViewOffset();}
addEventListener('resize',resize);
const _tv=new THREE.Vector3();
function updateCamera(dt){
  if(state.mode==='world'&&state.player){const p=state.player.root.position;_tv.set(p.x,p.y+1.3,p.z);cam.target.lerp(_tv,1-Math.exp(-dt*9));}
  else{cam.attract+=dt*(reduceMotion?0.012:0.045);cam.yaw=0.6+cam.attract;cam.pitch=0.6;cam.dist=state.mode==='setup'?28:36;_tv.set(0,0,-3);cam.target.lerp(_tv,1-Math.exp(-dt*2));}
  const cp=Math.cos(cam.pitch);
  camera.position.set(cam.target.x+Math.sin(cam.yaw)*cp*cam.dist,cam.target.y+Math.sin(cam.pitch)*cam.dist,cam.target.z+Math.cos(cam.yaw)*cp*cam.dist);
  camera.lookAt(cam.target);
  sun.position.set(cam.target.x+SUN_DIR.x*40,cam.target.y+SUN_DIR.y*40,cam.target.z+SUN_DIR.z*40);sun.target.position.copy(cam.target);sun.target.updateMatrixWorld();
  skyGroup.position.copy(camera.position);
}

/* =========================================================
   Labels (nameplates + speech bubbles)
   ========================================================= */
const _lv=new THREE.Vector3();
function placeEl(el,ch,yOff,extraPx){
  _lv.copy(ch.root.position);_lv.y+=yOff;_lv.project(camera);
  if(_lv.z>1||_lv.z<-1||Math.abs(_lv.x)>1.15||Math.abs(_lv.y)>1.15){if(!el.hidden)el.hidden=true;return false;}
  const w=stage.clientWidth,h=stage.clientHeight,x=(_lv.x*0.5+0.5)*w,y=(-_lv.y*0.5+0.5)*h;
  if(el.hidden)el.hidden=false;el.style.transform='translate('+x.toFixed(1)+'px,'+(y-(extraPx||0)).toFixed(1)+'px) translate(-50%,-100%)';return true;
}
function updateLabels(){
  for(const ch of state.chars.values()){
    const far=camera.position.distanceTo(ch.root.position)>(state.mode==='world'?40:60);
    const show=ch.root.visible&&!(far&&ch!==state.selected);
    const y=2.05+(ch.golden?0.55:0);
    if(show)placeEl(ch.tag,ch,y,0);else if(!ch.tag.hidden)ch.tag.hidden=true;
    if(ch.bubble&&!ch.bubble.hidden){if(show)placeEl(ch.bubble,ch,y,26);else ch.bubble.hidden=true;}
  }
}

/* =========================================================
   Minimap
   ========================================================= */
const mm=$('#minimap'),mmg=mm.getContext('2d');const MM=168,MS=MM/N;
const mmBase=(()=>{const c=document.createElement('canvas');c.width=c.height=MM;const g=c.getContext('2d');
  const C={grass:'#4f9a33',path:'#9b958c',plaza:'#b3ada3',oak:'#c8a36b',pantry:'#d9cfa9',tile:'#dfe8ec',sand:'#e3d29a',water:'#3b8fd6',dock:'#a8793f',hedge:'#24561c',carpet:'#5a3470',rubber:'#3a3d44',court:'#2f6fa8',court2:'#3f9a5a',turf:'#3d6b35',trail:'#c9a877',paver:'#a3ae95',meadow:'#6aa84a',plank:'#a8793f'};
  for(let cx=-HALF;cx<HALF;cx++)for(let cz=-HALF;cz<HALF;cz++){const t=getTile(cx,cz),tp=topMap[idx(cx,cz)];g.fillStyle=tp>=99?'#2e6a24':(tp>=2&&t!=='hedge')?'#efe8da':(C[t]||'#4f9a33');g.fillRect((cx+HALF)*MS,(cz+HALF)*MS,Math.ceil(MS),Math.ceil(MS));}
  return c;})();
const toMM=(x,z)=>[(x+HALF)*MS,(z+HALF)*MS];
function drawMinimap(){
  mmg.clearRect(0,0,MM,MM);mmg.drawImage(mmBase,0,0);
  const D=state.me&&DESK_SLOTS[state.me.deskSlot];if(D){const [x,y]=toMM(D.x,D.dz+D.tw*0.5);mmg.strokeStyle='#f2b632';mmg.lineWidth=2;mmg.strokeRect(x-4,y-4,8,8);}
  for(const ch of state.chars.values()){if(ch===state.player||!ch.root.visible)continue;const [x,y]=toMM(ch.root.position.x,ch.root.position.z);
    mmg.fillStyle=ch.golden?'#f2b632':ch.kind==='local'?'#948470':'#f6ecd6';const s=ch.golden?4:3;mmg.fillRect(x-s/2,y-s/2,s,s);mmg.strokeStyle='#110b07';mmg.lineWidth=1;mmg.strokeRect(x-s/2-0.5,y-s/2-0.5,s+1,s+1);}
  if(state.player){const p=state.player.root.position,[x,y]=toMM(p.x,p.z),h=state.player.root.rotation.y;
    mmg.save();mmg.translate(x,y);mmg.rotate(-h+Math.PI);mmg.fillStyle='#e0442e';mmg.strokeStyle='#110b07';mmg.lineWidth=1.5;mmg.beginPath();mmg.moveTo(0,-6);mmg.lineTo(4.5,5);mmg.lineTo(-4.5,5);mmg.closePath();mmg.fill();mmg.stroke();mmg.restore();}
}
function zoneAt(x,z){
  for(const k of ['desks','pantry','restroom','playroom','gym','play']){const Z=ZONES[k];if(x>=Z.x0&&x<Z.x1+1&&z>=Z.z0&&z<Z.z1+1)return Z.name;}
  if(x*x+z*z<56)return 'Plaza';
  if(lakeE(x,z)<1.7||(z>13&&Math.abs(x)<22))return 'Lakeside';
  const t=getTile(Math.floor(x),Math.floor(z));
  const E=ECO_AREAS.find(a=>x>=a.x0&&x<a.x1&&z>=a.z0&&z<a.z1);if(E)return E.name;
  if(t==='trail')return 'Green Loop';
  if(t==='path'&&x<-3&&z>8&&z<11.5)return 'Meadow Walk';
  if(t==='path'){if(z<-4)return 'Path to Work Desks';if(x>4)return 'Path to Pantry';if(x<-4)return 'Path to Restroom';return 'Path to Lakeside';}
  return 'Office grounds';
}

/* =========================================================
   Recognition logic: apples, pokes, Golden Apple
   ========================================================= */
function persistRec(rec){USERS[kOf(rec)]=rec;saveUsers();if(!room.mode&&rec===state.me)state.cookieOK=writeProfileCookie(rec);}
function persistData(ch){persistRec(ch.data);}
function pushFeed(item){WORLD.feed.unshift(item);WORLD.feed=WORLD.feed.slice(0,40);saveWorld();renderFeed();}
function pushInbox(rec,item){rec.inbox=[Object.assign({at:Date.now(),read:false},item),...(rec.inbox||[])].slice(0,50);}
function giveApples(from,to,count,reason,note){
  if(!from||!to||from===to)return false;
  if(room.mode==='guest'){// the host checks and applies it; spend locally so the card updates straight away
    if(from!==state.player||count<1||count>budgetLeft(from.data))return false;
    if(!roomSend({t:'give',to:kOf(to.data),count,reason,note:note||''})){toast('Not connected to the room right now. Try again in a moment.','',2600);return false;}
    spendBudget(from.data,count);renderMe();return{became:false,pending:true};}
  const r=applyGift(from.data,to.data,count,reason,note);if(r)afterGift(from.data,to.data,count,reason,note,r.became);return r;
}
// the rules and the data change: run by this browser when playing alone, or by the room host
function applyGift(fd,td,count,reason,note){
  if(!fd||!td||fd===td||count<1||count>budgetLeft(fd))return false;
  spendBudget(fd,count);
  const before=td.received||0;td.received=before+count;
  const became=!isGolden(before)&&isGolden(td.received);if(became)td.goldenAt=Date.now();
  td.recent=[{from:fd.name,count,reason,note:note||'',at:Date.now()},...(td.recent||[])].slice(0,6);
  pushInbox(td,{type:'apple',from:fd.name,fromKey:kOf(fd),count,reason,note:note||''});
  persistRec(fd);persistRec(td);
  pushFeed({kind:'apple',from:fd.name,to:td.name,count,reason,at:Date.now()});
  if(became)pushFeed({kind:'golden',to:td.name,at:Date.now()+1});
  return{became};
}
// what everyone sees: flying apples, toasts, board and HUD. The host also tells the room.
function afterGift(fd,td,count,reason,note,became){
  const from=charOfKey(kOf(fd)),to=charOfKey(kOf(td));
  if(state.mode==='world'&&from&&to)animateGift(from,to,count,became);
  if(td===state.me&&fd!==state.me)toast('<b>'+esc(fd.name)+'</b> gave you '+plural(count,'apple')+' · '+esc(reason),'',4200,ICON_APPLE);
  drawBoard();renderMe();renderFeed();
  if(state.selected&&(state.selected===to||state.selected===from))renderCard();
  if(state.modal==='board')openBoard();
  if(room.mode==='host'){broadcast({t:'gift',from:kOf(fd),to:kOf(td),count,reason,note:note||'',became,recs:[pubRec(fd),pubRec(td)],feed:WORLD.feed});sendTo(kOf(fd),{t:'me',rec:fd});sendTo(kOf(td),{t:'me',rec:td});}
}
function animateGift(from,to,count,became){
  const vis=from.root.visible&&to.root.visible&&from.root.position.distanceTo(to.root.position)<48;
  if(from===state.player&&!from.seat)from.faceTo(to.root.position.x,to.root.position.z);
  from.anim.give=0.55;sfx('give');
  const finish=()=>{
    const hp=headPos(to);burst(hp.x,hp.y,hp.z,18,['#e0442e','#ff8f6e','#f2b632','#6cbf4c'],2.6,0.1);
    to.anim.celebrate=1.3;to.hop(5.2);sfx(became?'golden':'catch');
    to.refresh();
    if(became){
      burst(hp.x,hp.y+0.4,hp.z,60,['#f2b632','#ffe08a','#fff6c8'],4,0.13);
      to.crown.scale.setScalar(0.01);growCrown(to);
      to.say('Golden Apple!',3000,'gold');
      toast((to===state.player?'You are now a <b>Golden Apple</b>! You have received more than '+GOLDEN_AFTER+' apples.':'<b>'+esc(to.data.name)+'</b> just became a Golden Apple!'),'gold',5200,ICON_GOLD);
    }
  };
  if(!vis){finish();return;}
  for(let i=0;i<count;i++){
    setTimeout(()=>{const ap=makeApple(false,0.75);const d=from.root.position.distanceTo(to.root.position);
      fly(ap,()=>handPos(from),()=>headPos(to),clamp(0.55+d*0.04,0.6,1.3),1.2+d*0.08,i===count-1?finish:()=>{const hp=headPos(to);burst(hp.x,hp.y,hp.z,5,['#e0442e','#ff8f6e'],1.5,0.08);},null);},i*140);
  }
}
function growCrown(ch){let t=0;const step=()=>{t+=0.05;ch.crown.scale.setScalar(Math.min(1,0.01+t*t*1.8));if(t<0.75)requestAnimationFrame(step);else ch.crown.scale.setScalar(1);};step();}
const pokeCooldown=new Map();
// net: undefined for your own poke; true for a poke the host told us about; on the host, the guest connection it came from
function doPoke(from,to,msg,net){
  if(!from||!to||from===to)return;
  if(!net){const key=from.id+'>'+to.id,now=performance.now();if(now-(pokeCooldown.get(key)||0)<2500){if(from===state.player)toast('Give '+esc(to.data.name.split(' ')[0])+' a second before poking again.','',1800);return;}
    pokeCooldown.set(key,now);
    if(room.mode==='guest'&&!roomSend({t:'poke',to:kOf(to.data),msg})){toast('Not connected to the room right now. Try again in a moment.','',2600);return;}}
  if(from===state.player&&!from.seat)from.faceTo(to.root.position.x,to.root.position.z);
  from.anim.poke=0.45;sfx('poke');
  const arrive=()=>{
    const p=to.root.position;ringWave(p.x,p.y,p.z,0x6fb7e8);const hp=headPos(to);burst(hp.x,hp.y,hp.z,10,['#6fb7e8','#d7eefc','#ffffff'],2,0.08);
    to.anim.startle=0.8;to.hop(4.2);sfx(to===state.player?'poked':'boop');to.say('!',700,'alert');
    setTimeout(()=>to.say(from.data.name.split(' ')[0]+': '+msg,3000),650);
    if(to===state.player){renderMe();toast('<b>'+esc(from.data.name)+'</b> poked you: '+esc(msg),'',3600,ICON_POKE);}
  };
  const vis=from.root.visible&&to.root.visible&&from.root.position.distanceTo(to.root.position)<48;
  if(!vis){arrive();}else{const o=new THREE.Mesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0x6fb7e8}));o.scale.setScalar(0.16);const d=from.root.position.distanceTo(to.root.position);fly(o,()=>handPos(from),()=>headPos(to),clamp(0.35+d*0.03,0.4,0.9),0.6+d*0.04,()=>{o.material.dispose();arrive();},'#6fb7e8');}
  if(from===state.player&&!net)toast('You poked <b>'+esc(to.data.name)+'</b>: '+esc(msg),'',2200,ICON_POKE);
  if(room.mode!=='guest')pokeData(from.data,to.data,msg,net&&net!==true?net:null);
}
// the poke lands in the inbox (solo browser or room host); the host tells the room and the person poked
function pokeData(fd,td,msg,origin){
  pushInbox(td,{type:'poke',from:fd.name,fromKey:kOf(fd),msg});persistRec(td);if(td===state.me)renderMe();
  if(room.mode==='host'){broadcast({t:'poke',from:kOf(fd),to:kOf(td),msg},origin);sendTo(kOf(td),{t:'me',rec:td});}
}
/* =========================================================
   UI rendering
   ========================================================= */
const toastsEl=$('#toasts');
function toast(html,kind,ms,icon){const t=document.createElement('div');t.className='toast'+(kind?' '+kind:'');t.innerHTML=(icon?'<img src="'+icon+'" alt="">':'')+'<span>'+html+'</span>';toastsEl.appendChild(t);while(toastsEl.children.length>3)toastsEl.firstChild.remove();setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),320);},ms||3200);}
function statusChip(d,kind){const st=STATUS[kind==='local'?'away':(d.status||'available')]||STATUS.available;return '<span class="chip"><i class="dot" style="background:var('+st.v+')"></i>'+st.label+'</span>';}
function goalText(n){return isGolden(n)?'Golden Apple · '+plural(n,'apple')+' received':plural(GOLDEN_AFTER+1-n,'more apple')+' to become a Golden Apple';}
function pipsHtml(left,total){let s='';for(let i=0;i<total;i++)s+='<img src="'+(i<left?ICON_APPLE:ICON_EMPTY)+'" alt="">';return s;}
function renderMe(){
  const me=state.me,P=state.player;if(!me||!P)return;
  $('#meHead').src=P.headUrl;$('#meName').textContent=me.name;
  const g=$('#meGold');g.hidden=!isGolden(me.received);g.innerHTML='<img src="'+ICON_GOLD+'" alt="">Golden';
  const left=budgetLeft(me);$('#meLeft').textContent=left+'/'+DAILY_APPLES;$('#mePips').innerHTML=pipsHtml(left,DAILY_APPLES);
  $('#meRecv').textContent=me.received||0;$('#meBar').style.width=Math.min(100,(me.received||0)/(GOLDEN_AFTER+1)*100)+'%';
  $('#meBarWrap').classList.toggle('full',isGolden(me.received));$('#meGoal').textContent=goalText(me.received||0);
  const unread=(me.inbox||[]).filter(i=>!i.read).length;const b=$('#inboxBadge');b.hidden=!unread;b.textContent=unread;
  const mb=$('#moreBadge');mb.hidden=!unread;mb.textContent=unread;$('#meMini').innerHTML='<img src="'+ICON_APPLE+'" alt="">'+left;// phone HUD
  P.refresh();
}
let lastZone='';
function renderZone(){if(!state.player)return;const p=state.player.root.position;const z=zoneAt(p.x,p.z);if(z!==lastZone){lastZone=z;Sound.want=zoneKey(z);$('#mapZone').textContent=z;$('#meSub').textContent=[state.me.role,z].filter(Boolean).join(' · ');}}
function renderFeed(){
  const el=$('#feed');if(!el)return;
  el.innerHTML=WORLD.feed.slice(0,5).map(f=>f.kind==='golden'
    ?'<li><img src="'+ICON_GOLD+'" alt=""><span><b>'+esc(f.to)+'</b> became a Golden Apple<span class="t">'+timeAgo(f.at)+'</span></span></li>'
    :'<li><img src="'+ICON_APPLE+'" alt=""><span><b>'+esc(f.from.split(' ')[0])+'</b> gave <b>'+esc(f.to.split(' ')[0])+'</b> '+plural(f.count,'apple')+' · '+esc(f.reason)+'<span class="t">'+timeAgo(f.at)+'</span></span></li>').join('')||'<li><span class="t">No apples given yet.</span></li>';
}

/* ---------- coworker card ---------- */
const card=$('#card'),cardBody=$('#cardBody');
const giveState={open:false,reason:null,count:1,note:''};
function openCard(ch){
  const prev=state.selected;state.selected=ch;if(prev&&prev!==ch)prev.refresh();ch.refresh();
  if(prev!==ch){giveState.open=false;giveState.reason=null;giveState.count=1;giveState.note='';}
  card.hidden=false;$('#hud').classList.add('card-open');renderCard();
}
function closeCard(){const s=state.selected;state.selected=null;if(s)s.refresh();card.hidden=true;$('#hud').classList.remove('card-open');}
function renderCard(){
  const ch=state.selected;if(!ch)return;const d=ch.data,self=ch===state.player,n=d.received||0,left=state.me?budgetLeft(state.me):0;
  const kindChip=ch.kind==='remote'?'<span class="chip">Online now</span>':ch.kind==='local'?'<span class="chip">'+(room.mode?'Away · offline':'Away · same browser')+'</span>':'<span class="chip">This is you</span>';
  const recent=(d.recent||[]).slice(0,3);
  let h='<div class="card-head"><img class="head xl" src="'+ch.headUrl+'" alt=""><div style="min-width:0"><div class="card-name">'+esc(d.name)+'</div><div class="card-role">'+esc([d.role,d.team].filter(Boolean).join(' · ')||'No role set')+'</div><div class="chips">'+statusChip(d,ch.kind)+(ch.golden?'<span class="gold-chip"><img src="'+ICON_GOLD+'" alt="">Golden Apple</span>':'')+kindChip+'</div></div></div>';
  h+='<div class="fine" id="cardZone">'+(ch.hiddenInStall?'In the Restroom':'At '+esc(zoneAt(ch.root.position.x,ch.root.position.z)))+'</div>';
  h+='<div class="card-stat"><div class="row"><span class="num">'+n+'</span><span class="lbl">apples received</span></div><div class="bar'+(ch.golden?' full':'')+'"><i style="width:'+Math.min(100,n/(GOLDEN_AFTER+1)*100)+'%"></i></div><div class="goal">'+goalText(n)+'</div></div>';
  if(self){
    h+='<div class="card-actions"><button class="btn" id="cEdit" type="button">Edit profile</button><button class="btn" id="cWave" type="button">Wave</button></div><p class="fine">You can’t give apples to yourself. You have '+plural(left,'apple')+' left to give today; they refill at midnight.</p>';
  }else{
    h+='<div class="card-actions"><button class="btn btn-gold" id="cGive" type="button" aria-expanded="'+giveState.open+'"'+(left?'':' disabled')+'>Give apples</button><button class="btn btn-apple" id="cPoke" type="button">Poke</button></div>';
    if(!left)h+='<p class="fine">You’ve given all '+DAILY_APPLES+' apples today. They refill at midnight.</p>';
    if(giveState.open&&left){
      const max=Math.min(left,DAILY_APPLES);giveState.count=clamp(giveState.count,1,max);
      h+='<form class="give" id="giveForm" novalidate><h3>Give '+esc(d.name.split(' ')[0])+' apples</h3>'
        +'<div class="field"><span class="lbl">What for?</span><div class="chip-row" role="group" aria-label="Reason">'+REASONS.map(r=>'<button type="button" class="chip-btn g" data-reason="'+esc(r)+'" aria-pressed="'+(giveState.reason===r)+'">'+esc(r)+'</button>').join('')+'</div></div>'
        +'<div class="field"><span class="lbl">How many? <span style="text-transform:none;letter-spacing:0">('+plural(left,'apple')+' left today)</span></span><div class="count-row"><button type="button" class="btn sm" id="gMinus" aria-label="One fewer apple">−</button><span class="num" id="gCount">'+giveState.count+'</span><button type="button" class="btn sm" id="gPlus" aria-label="One more apple">+</button><div class="pips" id="gPips">'+pipsHtml(giveState.count,giveState.count)+'</div></div></div>'
        +'<div class="field"><label for="gNote">Note <span style="text-transform:none;letter-spacing:0">(optional)</span></label><textarea id="gNote" maxlength="120" placeholder="What did they do? Specific thanks lands best.">'+esc(giveState.note)+'</textarea></div>'
        +'<p class="err" id="gErr" role="alert"></p><button class="btn btn-gold wide" type="submit">Send '+plural(giveState.count,'apple')+'</button></form>';
    }
    h+='<div class="poke-pick"><span class="lbl">Poke message</span><div class="chip-row">'+POKES.map((p,i)=>'<button type="button" class="chip-btn" data-poke="'+i+'" aria-pressed="'+(i===state.pokeMsg)+'">'+esc(p)+'</button>').join('')+'</div><p class="fine">'+(coarse?'Double-tap':'Double-click')+' anyone in the world to poke them with this message.</p></div>';
  }
  h+='<div class="recent"><h3>Recent apples</h3>'+(recent.length?'<ol>'+recent.map(r=>'<li><b>'+esc(r.from)+'</b> · '+plural(r.count,'apple')+' · '+esc(r.reason)+(r.note?'<q>'+esc(r.note)+'</q>':'')+'<div class="meta">'+timeAgo(r.at)+'</div></li>').join('')+'</ol>':'<p class="empty">No apples yet. Be the first.</p>')+'</div>';
  cardBody.innerHTML=h;
  const on=(id,fn)=>{const el=$('#'+id,cardBody);if(el)el.addEventListener('click',fn);};
  on('cEdit',()=>openSetup('edit'));on('cWave',()=>{state.player.anim.wave=1.4;room.waveN++;});
  on('cGive',()=>{giveState.open=!giveState.open;renderCard();if(giveState.open){const f=$('[data-reason]',cardBody);if(f)f.focus();}});
  on('cPoke',()=>doPoke(state.player,ch,POKES[state.pokeMsg]));
  cardBody.querySelectorAll('[data-poke]').forEach(b=>b.addEventListener('click',()=>{state.pokeMsg=+b.dataset.poke;cardBody.querySelectorAll('[data-poke]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));}));
  cardBody.querySelectorAll('[data-reason]').forEach(b=>b.addEventListener('click',()=>{giveState.reason=b.dataset.reason;cardBody.querySelectorAll('[data-reason]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const e=$('#gErr',cardBody);if(e)e.textContent='';}));
  const note=$('#gNote',cardBody);if(note)note.addEventListener('input',()=>{giveState.note=note.value;});
  const setCount=v=>{const max=Math.min(left,DAILY_APPLES);giveState.count=clamp(v,1,max);$('#gCount',cardBody).textContent=giveState.count;$('#gPips',cardBody).innerHTML=pipsHtml(giveState.count,giveState.count);$('#giveForm button[type=submit]',cardBody).textContent='Send '+plural(giveState.count,'apple');};
  on('gMinus',()=>setCount(giveState.count-1));on('gPlus',()=>setCount(giveState.count+1));
  const gf=$('#giveForm',cardBody);
  if(gf)gf.addEventListener('submit',e=>{e.preventDefault();
    if(!giveState.reason){$('#gErr',cardBody).textContent='Pick a reason so '+d.name.split(' ')[0]+' knows what the apples are for.';return;}
    const c=giveState.count,r=giveState.reason,nt=giveState.note.trim();
    const res=giveApples(state.player,ch,c,r,nt);
    if(!res){$('#gErr',cardBody).textContent='You don’t have enough apples left today.';return;}
    giveState.open=false;giveState.reason=null;giveState.count=1;giveState.note='';
    toast('You gave <b>'+esc(d.name)+'</b> '+plural(c,'apple')+' · '+esc(r),'',2800,ICON_APPLE);
    if(ch.kind==='local')toast(esc(d.name.split(' ')[0])+(room.mode?' will see this in their inbox next time they join the room.':' will see this in their inbox next time they log in on this browser.'),'',3600);
    renderCard();
  });
}
$('#cardClose').addEventListener('click',closeCard);

/* ---------- modals ---------- */
const modal=$('#modal'),modalBody=$('#modalBody');
function showModal(name,html){if(!state.modal)sfx('open');state.modal=name;keys.clear();modalBody.innerHTML=html;modal.hidden=false;setTimeout(()=>{const f=$('#modalClose');if(f)f.focus();},10);}
function closeModal(){if(state.modal)sfx('close');state.modal=null;modal.hidden=true;cvs.focus({preventScroll:true});}
$('#modalClose').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
function openBoard(){
  const people=allPeople();const golden=people.filter(c=>c.golden).sort((a,b)=>a.data.name.localeCompare(b.data.name));
  const items=WORLD.feed.slice(0,14);
  showModal('board','<h2 id="modalTitle">Orchard Board</h2>'
    +'<p class="fine">Recognition from around the office. There is no ranking here: anyone who receives more than '+GOLDEN_AFTER+' apples in total joins the Golden Apples.</p>'
    +'<section style="display:grid;gap:10px"><h3>Golden Apples ('+golden.length+')</h3>'+(golden.length?'<div class="golden-grid">'+golden.map(c=>'<div class="gcard"><img class="head" src="'+c.headUrl+'" alt=""><div style="min-width:0"><div class="nm">'+esc(c.data.name)+'</div><div class="rl">'+plural(c.data.received,'apple')+'</div></div></div>').join('')+'</div>':'<p class="empty">Nobody yet.</p>')+'</section>'
    +'<section style="display:grid;gap:10px"><h3>Recent apples</h3><ol class="list">'+items.map(f=>f.kind==='golden'?'<li style="border-left-color:var(--gold)"><b>'+esc(f.to)+'</b> became a Golden Apple<div class="meta">'+timeAgo(f.at)+'</div></li>':'<li><b>'+esc(f.from)+'</b> gave <b>'+esc(f.to)+'</b> '+plural(f.count,'apple')+' · '+esc(f.reason)+'<div class="meta">'+timeAgo(f.at)+'</div></li>').join('')+'</ol></section>'
    +'<section style="display:grid;gap:6px"><h3>How it works</h3><p class="fine">Everyone can give up to '+DAILY_APPLES+' apples a day. Pick a reason and add a note so the thanks is specific. The red apples on the plaza tree are today’s gifts; the gold ones are Golden Apple members.</p></section>');
}
const pokeTarget=it=>it.fromKey!=null?charOfKey(it.fromKey):state.chars.get(it.fromId);
function openInbox(){
  const me=state.me;const items=me.inbox||[];
  showModal('inbox','<h2 id="modalTitle">Inbox</h2>'+(items.length?'<ol class="list">'+items.map((it,i)=>it.type==='apple'
    ?'<li><b>'+esc(it.from)+'</b> gave you '+plural(it.count,'apple')+' · '+esc(it.reason)+(it.note?'<q>'+esc(it.note)+'</q>':'')+'<div class="meta">'+timeAgo(it.at)+(it.read?'':' · new')+'</div></li>'
    :'<li class="poke"><b>'+esc(it.from)+'</b> poked you: '+esc(it.msg)+'<div class="meta">'+timeAgo(it.at)+(it.read?'':' · new')+'</div>'+(pokeTarget(it)?'<button class="btn sm" style="margin-top:6px" data-pokeback="'+i+'" type="button">Poke back</button>':'')+'</li>').join('')+'</ol>':'<p class="empty">Nothing yet. Apples and pokes you receive will show up here.</p>'));
  modalBody.querySelectorAll('[data-pokeback]').forEach(b=>b.addEventListener('click',()=>{const it=items[+b.dataset.pokeback];const t=pokeTarget(it);if(t){closeModal();doPoke(state.player,t,POKES[state.pokeMsg]);}}));
  items.forEach(i=>i.read=true);persistData(state.player);if(room.mode==='guest')roomSend({t:'read'});renderMe();
}
function fishStatsHtml(){const log=fishLog(),best=Object.entries(log.best).filter(([id])=>FISH_BY[id]).sort((a,b)=>b[1]-a[1]);
  return '<div style="font-size:15px">'+plural(log.kept.length,'fish')+' kept · '+log.rel+' released</div>'+(best.length?'<ul class="online">'+best.map(([id,w])=>'<li><img class="fish-ico sm" src="'+fishIcon(FISH_BY[id])+'" alt="">'+esc(FISH_BY[id].name)+' · best '+w.toFixed(1)+' kg</li>').join('')+'</ul>':'<p class="fine">Nothing yet. Take a rod from the stand by the lake path.</p>');}
function openMenu(confirmDelete){
  const me=state.me;
  showModal('menu','<h2 id="modalTitle">Menu</h2>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Signed in as</span><div style="font-size:15px;word-break:break-all">'+esc(me.email)+'</div><p class="fine">Only you see your email. Coworkers see your name, role and team.</p></div>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Your catches</span>'+fishStatsHtml()+'</div>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Your workouts</span>'+gymStatsHtml()+'</div>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Your desk</span><div style="font-size:15px">'+(deskLabel(me)?esc(deskLabel(me))+' in the Work Desks room. Only you can sit there. Change its look under Edit profile.':'No desk yet: all '+DESK_SLOTS.length+' desks are taken.')+'</div></div>'
    +'<div style="display:grid;gap:8px"><span class="lbl">Sound</span>'+(AudioCtx
      ?'<label class="slider" for="mMusic"><span>Music &amp; ambience</span><input type="range" id="mMusic" min="0" max="100" step="5" value="'+Math.round(SND.music*100)+'"></label>'
      +'<label class="slider" for="mSfx"><span>Effects</span><input type="range" id="mSfx" min="0" max="100" step="5" value="'+Math.round(SND.sfx*100)+'"></label>'
      +'<label class="check"><input type="checkbox" id="mMute"'+(SND.muted?' checked':'')+'> Mute everything <span class="key">M</span></label>'
      +'<p class="fine">The music and background sounds change with where you are. Everything is generated in your browser, so there are no files to download.</p>'
      :'<p class="fine">This browser can’t play sound.</p>')+'</div>'
    +(room.mode?'<div style="display:grid;gap:6px"><span class="lbl">Room</span><div style="font-size:15px">'+esc(room.name)+' <span class="code-chip">'+esc(room.code)+'</span></div><p class="fine">'+(room.mode==='host'?'You host this room, so everyone’s profiles and apples are saved in this browser. Keep this tab open while people play.':'Your profile and apples are saved by the host of this room.')+'</p><div class="menu-actions"><button class="btn" id="mRoom" type="button">Invite &amp; room details</button></div></div>':'')
    +(room.mode?'':'<div style="display:grid;gap:6px"><span class="lbl">Where your profile is saved</span>'
    +'<div class="storage-row"><span>Cookie</span><span class="'+(state.cookieOK?'ok':'bad')+'">'+(state.cookieOK?'Saved':'Blocked by browser')+'</span></div>'
    +'<div class="storage-row"><span>Local storage</span><span class="'+(Store.ok?'ok':'bad')+'">'+(Store.ok?'Saved':'Blocked by browser')+'</span></div>'
    +'<p class="fine">'+(state.cookieOK?'Next time you open this page on this browser, you’ll be logged straight back in.':Store.ok?'This browser blocks cookies in embedded pages, so your profile is kept in local storage instead. You’ll still be remembered here.':'This browser blocks both, so your profile lasts only until you close the page.')+'</p></div>')
    +'<div class="menu-actions"><button class="btn" id="mEdit" type="button">Edit profile, avatar &amp; desk</button><button class="btn" id="mLogout" type="button">Log out</button></div>'
    +(confirmDelete?'<div style="display:grid;gap:8px;padding:12px;border:2px solid var(--apple)"><p style="margin:0">Delete your profile, apples and inbox from '+(room.mode?'this room':'this browser')+'? This can’t be undone.</p><div class="menu-actions"><button class="btn btn-apple" id="mDelYes" type="button">Yes, delete my profile</button><button class="btn" id="mDelNo" type="button">Keep it</button></div></div>':'<button class="btn btn-ghost" id="mDel" type="button" style="justify-self:start">Delete my profile</button>'));
  const on=(id,fn)=>{const el=$('#'+id,modalBody);if(el)el.addEventListener('click',fn);};
  on('mEdit',()=>{closeModal();openSetup('edit');});on('mLogout',logout);on('mRoom',openRoomModal);
  on('mDel',()=>openMenu(true));on('mDelNo',()=>openMenu(false));
  const mMus=$('#mMusic',modalBody),mFx=$('#mSfx',modalBody),mMu=$('#mMute',modalBody);
  if(mMus)mMus.addEventListener('input',()=>{SND.music=mMus.value/100;saveSound();});
  if(mFx){mFx.addEventListener('input',()=>{SND.sfx=mFx.value/100;saveSound();});mFx.addEventListener('change',()=>sfx('catch'));}
  if(mMu)mMu.addEventListener('change',()=>{SND.muted=mMu.checked;audioInit();saveSound();});
  on('mDelYes',()=>{const k=kOf(me),email=me.email;if(room.mode==='guest')roomSend({t:'delete'});deleteUser(k);
    if(!room.mode){Cookies.del(profileCookieName(email));Cookies.del('ga_session');Store.del('ga_last');}
    else{rememberRoom(room.mode==='host'?'ga_hosted':'ga_joined',{code:room.code,name:room.name,email:''});room.email='';}
    closeModal();leaveWorld();toast('Your profile was deleted from '+(room.mode?'this room.':'this browser.'),'',3200);});
}
$('#bBoard').addEventListener('click',openBoard);$('#bInbox').addEventListener('click',openInbox);$('#bEdit').addEventListener('click',()=>openSetup('edit'));$('#bMenu').addEventListener('click',()=>openMenu(false));$('#bRoom').addEventListener('click',openRoomModal);
function renderSoundBtn(){const b=$('#bSound');b.setAttribute('aria-pressed',String(!SND.muted));b.title=SND.muted?'Sound is off (M)':'Sound is on (M)';}
$('#bSound').addEventListener('click',toggleMute);renderSoundBtn();

/* ---------- hint ---------- */
let hintTimer=null;
function scheduleHintHide(){if(hintTimer||state.hintHidden)return;hintTimer=setTimeout(()=>{$('#hint').hidden=true;},9000);}
$('#hintClose').addEventListener('click',()=>{$('#hint').hidden=true;state.hintHidden=true;Store.set('ga_hint_hidden',true);});
if(coarse){$('#hint').innerHTML='<span>Left thumb: walk · push past the ring to run</span><span>Right side: drag to look · pinch to zoom</span><span>Tap a coworker · double-tap to poke</span><button class="x" id="hintClose2" type="button" aria-label="Hide controls">×</button>';$('#hintClose2').addEventListener('click',()=>{$('#hint').hidden=true;state.hintHidden=true;Store.set('ga_hint_hidden',true);});}

/* =========================================================
   Rooms: peer-to-peer over the same Wi-Fi
   The host's tab is the room. It keeps every profile, the feed and the rules, and relays live positions.
   Guests connect straight to the host with WebRTC; PeerJS only does the joining handshake. No STUN or TURN
   servers are configured, so only devices on the same network can connect.
   ========================================================= */
const PROTO=1,ROOM_PREFIX='golden-apple-room-',CODE_CHARS='ABCDEFGHJKMNPQRSTUVWXYZ23456789',PEER_OPTS={debug:0,config:{iceServers:[]}};
const newRoomCode=()=>Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');
const normCode=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const validCode=c=>c.length===6&&[...c].every(ch=>CODE_CHARS.includes(ch));
const roomPeerId=code=>ROOM_PREFIX+code.toLowerCase();
const inviteLink=()=>location.origin+location.pathname+'?room='+room.code;
// what other people may see of a profile: no email, inbox or daily budget
const pubRec=u=>({key:u.key,name:u.name,role:u.role,team:u.team,status:u.status,avatar:u.avatar,desk:u.desk,deskSlot:u.deskSlot,received:u.received,recent:u.recent,goldenAt:u.goldenAt,createdAt:u.createdAt});
const pubUsers=()=>{const o={};for(const k in USERS)o[k]=pubRec(USERS[k]);return o;};
const charOfKey=k=>k!=null&&k===myKey()?state.player:state.chars.get('local:'+k);
const str=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
function saveRoomData(){if(room.mode==='host'&&room.data)Store.set('ga_room_'+room.code,room.data);}
function rememberRoom(list,entry){const old=Store.get(list,[]).find(x=>x.code===entry.code)||{};const a=Store.get(list,[]).filter(x=>x.code!==entry.code);a.unshift(Object.assign(old,entry));Store.set(list,a.slice(0,6));}
const roomEmail=(list,code)=>(Store.get(list,[]).find(x=>x.code===code)||{}).email||'';
function useSoloData(){USERS=Store.get('ga_users',{});WORLD=Store.get('ga_world',null)||{v:2,feed:[]};}
function roomSend(m){const c=room.hostConn;if(c&&c.open){try{c.send(m);return true;}catch(e){}}return false;}
function broadcast(m,except){for(const c of room.conns)if(c!==except&&c.conn.open){try{c.conn.send(m);}catch(e){}}}
function sendTo(k,m){for(const c of room.conns)if(c.key===k&&c.conn.open){try{c.conn.send(m);}catch(e){}}}
function setRoomStatus(s){
  const was=room.status;room.status=s;
  if(state.mode==='world'&&was!==s){if(s==='reconnecting')toast(room.mode==='host'?'Lost the internet handshake service. People already here stay connected; new people can join once it’s back.':'Lost the connection to the room. Reconnecting…','',4200);else if(s==='live'&&was==='reconnecting')toast('Back in the room.','',2200);}
  renderRoomBtn();if(state.mode==='login')showLogin();if(state.modal==='room')openRoomModal();
}
function roomError(msg){$('#roomErr').textContent=msg;if(state.mode==='login')showLogin();}
function leaveRoom(){
  clearTimeout(room.retry);clearTimeout(room.timer);const p=room.peer;room.peer=null;room.hostConn=null;
  for(const c of room.conns){try{c.conn.close();}catch(e){}}room.conns.clear();if(p){try{p.destroy();}catch(e){}}
  Object.assign(room,{mode:null,code:null,name:'',status:'off',data:null,email:'',everJoined:false,awaitLogin:false,online:new Set(),lastSent:''});
  useSoloData();renderRoomBtn();
}
/* ---------- host ---------- */
function hostRoom(code,name,fresh){
  $('#roomErr').textContent='';
  if(!window.Peer){roomError('Rooms need the internet to start. Check your connection and reload the page.');return;}
  leaveRoom();state.solo=false;
  room.mode='host';room.code=code;room.data=Store.get('ga_room_'+code,null)||{v:1,code,name,createdAt:Date.now(),users:{},feed:[]};
  room.name=room.data.name;USERS=room.data.users;WORLD={v:2,feed:room.data.feed||[]};
  setRoomStatus('connecting');
  const p=new window.Peer(roomPeerId(code),PEER_OPTS);room.peer=p;
  p.on('open',()=>{if(room.peer!==p)return;saveRoomData();rememberRoom('ga_hosted',{code,name:room.name});setRoomStatus('live');});
  p.on('connection',conn=>{if(room.peer===p)hostAccept(conn);});
  p.on('disconnected',()=>{if(room.peer!==p||p.destroyed)return;setRoomStatus('reconnecting');setTimeout(()=>{if(room.peer===p&&!p.destroyed&&p.disconnected)p.reconnect();},3000);});
  p.on('error',err=>{if(room.peer!==p)return;const t=err&&err.type;
    if(t==='unavailable-id'){if(fresh)hostRoom(newRoomCode(),name,true);else{leaveRoom();roomError('That room is already open in another tab or on another computer.');}return;}
    if(t==='browser-incompatible'){leaveRoom();roomError('This browser can’t host rooms. Try a recent Chrome, Edge, Firefox or Safari.');return;}
    if(room.status==='connecting'&&(t==='network'||t==='server-error'||t==='socket-error'||t==='socket-closed')){leaveRoom();roomError('Couldn’t start the room. Rooms need the internet for a moment to start; check your connection.');}});
}
function hostAccept(conn){
  const c={conn,key:null};
  conn.on('open',()=>room.conns.add(c));
  conn.on('data',m=>{try{hostOnMsg(c,m);}catch(e){console.error(e);}});
  const drop=()=>{if(!room.conns.delete(c))return;if(c.key)setOnline(c.key,[...room.conns].some(o=>o.key===c.key));};
  conn.on('close',drop);conn.on('error',drop);
}
function setOnline(k,on){
  const was=room.online.has(k);if(on)room.online.add(k);else room.online.delete(k);if(was===on)return;
  if(room.mode==='host')broadcast({t:'presence',k,on});
  onPresence(k,on);
}
function onPresence(k,on){
  const u=USERS[k];
  if(state.mode==='world'){syncPeople();if(u&&k!==myKey())toast('<b>'+esc(u.name)+'</b> '+(on?'joined the room.':'left the room.'),'',2400);}
  renderRoomBtn();if(state.modal==='room')openRoomModal();
}
function cleanProfile(p){return{name:str(p.name,24).replace(/\s+/g,' '),role:str(p.role,32),team:str(p.team,24),status:STATUS[p.status]&&p.status!=='away'?p.status:'available',avatar:arrToAvatar(avatarToArr(p.avatar||{})),desk:deskOf({desk:p.desk})};}
function findKeyByEmail(email){for(const k in USERS)if(USERS[k].email===email)return k;return null;}
function newUserKey(email){let k='p'+hashStr(email).toString(36);while(USERS[k])k+='x';return k;}
function hostBind(c,k,created){c.key=k;c.conn.send({t:'login',ok:true,rec:USERS[k],created:!!created});setOnline(k,true);}
function hostOnMsg(c,m){
  if(!m||typeof m!=='object')return;
  switch(m.t){
    case 'hello':if(m.v!==PROTO){c.conn.send({t:'bye',why:'version'});return;}
      c.conn.send({t:'welcome',v:PROTO,room:{code:room.code,name:room.name},users:pubUsers(),feed:WORLD.feed,online:[...room.online]});return;
    case 'login':{const email=str(m.email,120).toLowerCase();if(!EMAIL_RE.test(email))return;const k=findKeyByEmail(email);
      if(k)hostBind(c,k);else c.conn.send({t:'login',ok:false,email});return;}
    case 'create':{const email=str(m.email,120).toLowerCase(),p=cleanProfile(m.profile||{});
      if(!EMAIL_RE.test(email)||p.name.length<2){c.conn.send({t:'err',msg:'That profile couldn’t be created.'});return;}
      if(findKeyByEmail(email)){c.conn.send({t:'login',ok:false,exists:true,email});return;}
      const rec=Object.assign({key:newUserKey(email),email},p,{deskSlot:-1,received:0,createdAt:Date.now(),given:null,recent:[],inbox:[]});
      allocDesk(rec);USERS[rec.key]=rec;saveUsers();broadcast({t:'user',rec:pubRec(rec)});onUserChanged(rec.key);
      hostBind(c,rec.key,true);return;}
    case 'dm':if(c.key&&typeof m.to==='string'&&m.d&&typeof m.d==='object'){if(m.to===myKey())onDm(c.key,m.d);else if(USERS[m.to])sendTo(m.to,{t:'dm',from:c.key,d:m.d});}return;
    case 'logout':if(c.key){const k=c.key;c.key=null;setOnline(k,[...room.conns].some(o=>o.key===k));}return;
  }
  const k=c.key,me=k?USERS[k]:null;if(!me)return;// everything below needs a signed-in guest
  switch(m.t){
    case 'st':if(m.s&&typeof m.s==='object'){broadcast({t:'st',k,s:m.s},c);applyNetState(k,m.s);}return;
    case 'update':{const p=cleanProfile(m.profile||{});if(p.name.length<2)return;Object.assign(me,p);allocDesk(me);saveUsers();broadcast({t:'user',rec:pubRec(me)});sendTo(k,{t:'me',rec:me});onUserChanged(k);return;}
    case 'give':{const td=USERS[m.to],count=m.count|0,reason=REASONS.includes(m.reason)?m.reason:null,note=str(m.note,120);
      const r=td&&reason?applyGift(me,td,count,reason,note):false;
      if(r)afterGift(me,td,count,reason,note,r.became);else{c.conn.send({t:'err',msg:'Those apples couldn’t be sent.'});c.conn.send({t:'me',rec:me});}return;}
    case 'poke':{const td=USERS[m.to];if(!td||!POKES.includes(m.msg)||td===me)return;const f=charOfKey(k),t=charOfKey(m.to);
      if(state.mode==='world'&&f&&t)doPoke(f,t,m.msg,c);else pokeData(me,td,m.msg,c);return;}
    case 'read':(me.inbox||[]).forEach(i=>i.read=true);saveUsers();return;
    case 'delete':c.key=null;deleteUser(k);setOnline(k,false);return;
  }
}
/* ---------- guest ---------- */
function joinRoom(code,email){
  $('#roomErr').textContent='';
  if(!window.Peer){roomError('Rooms need the internet to connect. Check your connection and reload the page.');return;}
  leaveRoom();state.solo=false;
  room.mode='guest';room.code=code;room.email=email||'';USERS={};WORLD={v:2,feed:[]};
  setRoomStatus('connecting');
  const p=new window.Peer(PEER_OPTS);room.peer=p;
  p.on('open',()=>{if(room.peer===p)connectHost();});
  p.on('disconnected',()=>{if(room.peer===p&&!p.destroyed)setTimeout(()=>{if(room.peer===p&&!p.destroyed&&p.disconnected)p.reconnect();},3000);});
  p.on('error',err=>{if(room.peer!==p)return;const t=err&&err.type;
    if(t==='peer-unavailable'){room.hostConn=null;if(room.everJoined)guestLost();else{leaveRoom();roomError('No room with code '+code+' is open right now. Check the code, and ask the host to open the room.');}return;}
    if(t==='browser-incompatible'){leaveRoom();roomError('This browser can’t join rooms. Try a recent Chrome, Edge, Firefox or Safari.');return;}
    if(!room.everJoined&&(t==='network'||t==='server-error'||t==='socket-error'||t==='socket-closed')){leaveRoom();roomError('Couldn’t connect. Joining needs the internet for a moment; check your connection.');}});
}
function connectHost(){
  const p=room.peer;if(!p||p.destroyed)return;clearTimeout(room.timer);
  const c=p.connect(roomPeerId(room.code),{reliable:true,serialization:'json'});room.hostConn=c;
  room.timer=setTimeout(()=>{if(room.hostConn!==c||c.open)return;room.hostConn=null;try{c.close();}catch(e){}
    if(room.everJoined)guestLost();else{leaveRoom();roomError('Couldn’t reach the room. Make sure you’re on the same Wi-Fi as the host.');}},15000);
  c.on('open',()=>{if(room.hostConn!==c)return;clearTimeout(room.timer);c.send({t:'hello',v:PROTO});});
  c.on('data',m=>{if(room.hostConn===c){try{guestOnMsg(m);}catch(e){console.error(e);}}});
  const lost=()=>{if(room.hostConn!==c)return;room.hostConn=null;guestLost();};c.on('close',lost);c.on('error',lost);
}
function guestLost(){
  if(room.mode!=='guest')return;room.awaitLogin=false;setRoomStatus('reconnecting');
  clearTimeout(room.retry);room.retry=setTimeout(()=>{if(room.mode==='guest'&&!room.hostConn)connectHost();},4000);
}
function mergeRec(r){if(!r||!r.key)return null;const cur=USERS[r.key];if(cur)Object.assign(cur,r);else USERS[r.key]=r;return USERS[r.key];}
function guestLogin(email){room.email=email;room.awaitLogin=true;if(!roomSend({t:'login',email}))room.awaitLogin=false;if(state.mode==='login')showLogin();}
function guestOnMsg(m){
  if(!m||typeof m!=='object')return;
  switch(m.t){
    case 'welcome':{
      room.name=str(m.room&&m.room.name,28)||'Room';const mine=state.me;USERS=m.users||{};if(mine)USERS[kOf(mine)]=Object.assign(mine,USERS[kOf(mine)]||{});
      WORLD={v:2,feed:Array.isArray(m.feed)?m.feed:[]};room.online=new Set(m.online||[]);room.everJoined=true;
      rememberRoom('ga_joined',{code:room.code,name:room.name});setRoomStatus('live');
      if(state.mode==='world'&&mine){guestLogin(mine.email);syncDesks();syncPeople();renderFeed();drawBoard();}
      else if(room.email)guestLogin(room.email);
      return;}
    case 'login':{
      room.awaitLogin=false;
      if(!m.ok){if(m.exists){if(state.mode==='setup')$('#setupErr').textContent='A profile with this email already exists in this room. Go back and sign in with it.';else toast('A profile with this email already exists in this room.','',3200);}
        else if(state.mode!=='world'){room.email='';openSetup('create',m.email);}return;}
      const rec=mergeRec(m.rec);if(!rec)return;room.email=rec.email;startSession(rec);
      if(state.mode==='world'&&state.me===rec){renderMe();return;}
      state.setup=null;enterWorld(rec);
      if(m.created){toast('Welcome to <b>'+esc(room.name)+'</b>, '+esc(rec.name)+'. You have '+DAILY_APPLES+' apples to give today.','',4200,ICON_APPLE);
        if(rec.deskSlot>=0)setTimeout(()=>toast('Your desk is ready in the Work Desks room: <b>'+esc(deskLabel(rec))+'</b>. It’s the gold square on your map.','',5200),1400);}
      else toast('Welcome back to <b>'+esc(room.name)+'</b>, '+esc(rec.name)+'.','',3200);
      return;}
    case 'user':{const r=mergeRec(m.rec);if(r)onUserChanged(r.key);return;}
    case 'me':{mergeRec(m.rec);renderMe();if(state.selected)renderCard();return;}
    case 'gone':{const k=m.k;if(k===myKey()){deleteUser(k);leaveWorld();toast('Your profile was removed from this room.','',3200);}else deleteUser(k);return;}
    case 'presence':{if(m.on)room.online.add(m.k);else room.online.delete(m.k);onPresence(m.k,!!m.on);return;}
    case 'st':applyNetState(m.k,m.s);return;
    case 'gift':{(m.recs||[]).forEach(mergeRec);if(Array.isArray(m.feed))WORLD.feed=m.feed;const fd=USERS[m.from],td=USERS[m.to];if(fd&&td)afterGift(fd,td,m.count|0,str(m.reason,40),str(m.note,120),!!m.became);return;}
    case 'poke':{const f=charOfKey(m.from),t=charOfKey(m.to);if(state.mode==='world'&&f&&t&&POKES.includes(m.msg))doPoke(f,t,m.msg,true);return;}
    case 'dm':if(typeof m.from==='string')onDm(m.from,m.d);return;
    case 'err':toast(esc(str(m.msg,140)||'Something went wrong.'),'',3000);return;
    case 'bye':{const why=m.why;if(state.mode!=='login')leaveWorld();leaveRoom();roomError(why==='version'?'This room runs a different version of Golden Apple. Reload the page and try again.':'The room was closed.');return;}
  }
}
/* ---------- shared: people, desks and live movement ---------- */
function deleteUser(k){
  const u=USERS[k];if(!u)return;if(u.deskSlot>=0)clearDesk(u.deskSlot);delete USERS[k];saveUsers();
  if(room.mode==='host'){broadcast({t:'gone',k});sendTo(k,{t:'gone',k});}
  if(state.mode==='world'&&k!==myKey())syncPeople();
}
function onUserChanged(k){
  if(state.mode==='world'){syncDesks();syncPeople();if(k===myKey())renderMe();}
  if(state.selected&&kOf(state.selected.data)===k)renderCard();
  drawBoard();if(state.modal==='room')openRoomModal();
}
function syncDesks(){
  const want=new Map();for(const k in USERS){const u=USERS[k];if(u.deskSlot>=0&&u.deskSlot<DESK_SLOTS.length)want.set(u.deskSlot,{k,cfg:deskOf(u)});}
  DESK_SLOTS.forEach((S,i)=>{const w=want.get(i),sig=w?w.k+'|'+deskToArr(w.cfg).join():'';if(S.sig===sig)return;if(w)placeDesk(i,w.cfg,w.k);else clearDesk(i);});
}
function removeLocal(ch){freeStallOf(ch);ch.dispose();state.chars.delete(ch.id);if(ch.spot&&ch.spot.occ===ch.id)ch.spot.occ=null;const i=locals.indexOf(ch);if(i>=0)locals.splice(i,1);if(state.selected===ch)closeCard();}
// offline people sit Away at their own desk (or a free bench when they have none)
function seatAway(ch){
  if(ch.spot&&ch.spot.occ===ch.id)ch.spot.occ=null;ch.spot=null;
  const D=DESK_SLOTS[ch.data.deskSlot],s=D?D.spot:SPOTS.find(b=>!b.desk&&b.pose==='sit'&&!b.occ);
  if(!s){ch.root.position.set(SPAWN.x,0,SPAWN.z-4);return;}s.occ=ch.id;ch.spot=s;placeAt(ch,s);
}
// keeps one character per other profile: 'remote' while they are online in the room, 'local' (Away) otherwise
function syncPeople(){
  const mk=myKey();
  for(const ch of locals.slice()){const k=ch.id.slice(6);if(!USERS[k]||k===mk)removeLocal(ch);}
  for(const k in USERS){
    if(k===mk)continue;const u=USERS[k],kind=room.online.has(k)?'remote':'local';let ch=state.chars.get('local:'+k);
    if(!ch){ch=new Character({id:'local:'+k,kind,data:u});ch.avSig=avatarToArr(u.avatar).join();state.chars.set(ch.id,ch);locals.push(ch);
      if(kind==='local')seatAway(ch);else ch.root.position.set(SPAWN.x,0,SPAWN.z);continue;}
    ch.data=u;const sig=avatarToArr(u.avatar).join();if(sig!==ch.avSig){ch.avSig=sig;ch.setAvatar(u.avatar);}
    if(kind!==ch.kind){ch.kind=kind;if(kind==='local'){ch.net=null;ch.netAir=false;ch.dropHeld();ch.anim.eat=null;ch.dropRod();clearFishGfx(ch);ch.anim.gym=null;ch.anim.sport=null;if(ch.inStall){freeStallOf(ch);ch.hiddenInStall=false;}seatAway(ch);}}
    else if(kind==='local'){const D=DESK_SLOTS[u.deskSlot];if(D&&ch.spot!==D.spot)seatAway(ch);}
    ch.refresh();
  }
}
function applyNetState(k,s){if(k===myKey()||!s||typeof s!=='object')return;const ch=state.chars.get('local:'+k);if(ch&&ch.kind==='remote')ch.net=s;}
// remote players glide towards their last reported position; seats, held food, eating and waves are mirrored
function stepRemote(ch,dt){
  const n=ch.net,p=ch.root.position,seat=n.seat?SPOTS.find(s=>s.id===n.seat):null,stall=Number.isInteger(n.stall)?STALLS[n.stall]:null;
  if(stall){if(ch.inStall!==stall){freeStallOf(ch);ch.inStall=stall;if(!stall.occ)stall.occ=ch.id;stall.swing=0.7;if(ch.spot&&ch.spot.occ===ch.id)ch.spot.occ=null;ch.spot=null;}
    ch.root.visible=false;ch.hiddenInStall=true;ch.anim.speed=0;p.x=stall.spot.x;p.z=stall.spot.z;ch.dropHeld();if(state.selected===ch)closeCard();return;}
  if(ch.inStall){freeStallOf(ch);ch.root.visible=true;ch.hiddenInStall=false;}
  if(seat){if(ch.spot!==seat){if(ch.spot&&ch.spot.occ===ch.id)ch.spot.occ=null;ch.spot=seat;if(!seat.occ)seat.occ=ch.id;placeAt(ch,seat);}ch.anim.speed=0;}
  else{
    if(ch.spot){if(ch.spot.occ===ch.id)ch.spot.occ=null;ch.spot=null;ch.anim.pose='stand';ch.root.visible=true;ch.hiddenInStall=false;}
    const x=+n.x||0,z=+n.z||0,dx=x-p.x,dz=z-p.z;if(Math.hypot(dx,dz)>8){p.x=x;p.z=z;}else{const f=1-Math.exp(-dt*10);p.x+=dx*f;p.z+=dz*f;}
    ch.baseY=+n.y||0;ch.heading=+n.h||0;ch.anim.speed=clamp(+n.spd||0,0,8);ch.anim.run=!!n.run;ch.netAir=!!n.air;ch.anim.pose=n.act==='wash'?'wash':'stand';
  }
  ch.anim.play=Array.isArray(n.arc);
  const ac=ch.anim.play?ARCADES[n.arc[0]]:null;if(ac){if(ac.sit)ch.anim.pose='sit';if(ac.lever){if(n.arc[2]!==ch.netSpin){if(ch.netSpin!=null){ac.pull=0.5;ac.spinT=1.6;}ch.netSpin=n.arc[2];}if(n.arc[3]!==ch.netWin){if(ch.netWin!=null)ac.flash=2.5;ch.netWin=n.arc[3];}}}
  const ct=Array.isArray(n.ct)&&COURTS[n.ct[0]]&&(n.ct[6]|0)!==3?n.ct:null;ch.anim.sport=ct?COURTS[ct[0]].sport:null;
  if(n.sw!==ch.netSw){if(ch.netSw!=null&&ch.anim.sport){ch.anim.swing=SWING;ch.anim.swingHi=!!n.swh;}ch.netSw=n.sw;}
  if(n.cel!==ch.netCel){if(ch.netCel!=null)celebrate(ch);ch.netCel=n.cel;}
  const gm=Array.isArray(n.gym)?GYM[n.gym[0]]:null;
  if(gm){const L=clamp(n.gym[1]|0,0,2),g=ch.anim.gym;if(!g||g.k!==gm.kind)ch.anim.gym={k:gm.kind,lvl:L,ph:0,rest:!!n.gym[2]};else{g.lvl=L;g.rest=!!n.gym[2];}}else ch.anim.gym=null;
  if(!!n.rod!==!!ch.rodMesh){if(n.rod)ch.holdRod();else{ch.dropRod();clearFishGfx(ch);}}
  if(n.fph==='cast'&&ch.netFph!=='cast')ch.anim.cast=0.6;ch.netFph=n.fph;ch.anim.reel=n.fph==='reel';
  drawLine(ch,Array.isArray(n.bob)&&ch.rodMesh?{x:+n.bob[0]||0,y:+n.bob[1]||0,z:+n.bob[2]||0}:null);
  const held=FOOD[n.held]?n.held:null;if(held!==(ch.held||null)){if(held)ch.hold(held);else ch.dropHeld();}
  ch.anim.eat=n.eat==='eat'||n.eat==='drink'?n.eat:null;
  if(n.wave!==ch.netWave){if(ch.netWave!=null)ch.anim.wave=1.4;ch.netWave=n.wave;}
}
function myNetState(){const P=state.player,p=P.root.position,r=v=>Math.round(v*100)/100;
  return{x:r(p.x),y:r(p.y),z:r(p.z),h:r(P.heading),spd:r(P.anim.speed),run:!!P.anim.run,air:!P.onGround,seat:P.seat?P.seat.id:null,held:P.held||null,eat:P.anim.eat||null,wave:room.waveN,stall:rr.use?rr.use.S.i:null,act:rr.wash?'wash':null,rod:!!P.rodMesh,bob:P.lineTo?[r(P.lineTo.x),r(P.lineTo.y),r(P.lineTo.z)]:null,fph:fishing.phase==='cast'||fishing.phase==='reel'?fishing.phase:null,arc:arc.open?[arc.c,arc.slot,arc.st&&arc.st.spins|0,arc.st&&arc.st.wins|0]:null,gym:gym.use?[gym.use.i,gym.lvl,gym.rest>0?1:0]:null,
    ct:mt.on?[mt.c,mt.side,mt.sc[0],mt.sc[1],mt.pseq,mt.server,{serve:0,rally:1,point:2}[mt.phase]|0,-1]:mt.end?[mt.end.c,mt.end.side,mt.end.sc[0],mt.end.sc[1],999,0,3,mt.end.w]:null,cb:mt.on?mt.myHit:null,sw:P.swN|0,swh:!!P.swh,cel:P.celN|0};}
function updateRoom(dt){
  if(!room.mode||state.mode!=='world'||!state.player)return;
  room.sendT-=dt;room.keepAlive-=dt;
  if(room.sendT<=0){room.sendT=0.12;const s=myNetState(),j=JSON.stringify(s);
    if(j!==room.lastSent||room.keepAlive<=0){room.lastSent=j;room.keepAlive=2;if(room.mode==='host')broadcast({t:'st',k:myKey(),s});else roomSend({t:'st',s});}}
  for(const ch of locals)if(ch.kind==='remote'&&ch.net)stepRemote(ch,dt);
}
addEventListener('beforeunload',e=>{if(room.mode==='host'&&room.online.size>1){e.preventDefault();e.returnValue='';}});
/* ---------- room UI: start-screen bar, HUD button, invite modal ---------- */
function renderRecentRooms(){
  const el=$('#roomRecent'),hosted=Store.get('ga_hosted',[]),joined=Store.get('ga_joined',[]).filter(j=>!hosted.some(h=>h.code===j.code));
  el.hidden=!hosted.length&&!joined.length;
  el.innerHTML=hosted.map(r=>'<button class="btn" type="button" data-reopen="'+esc(r.code)+'">Reopen <b>'+esc(r.name)+'</b> <span class="code-chip">'+esc(r.code)+'</span></button>').join('')
    +joined.map(r=>'<button class="btn" type="button" data-rejoin="'+esc(r.code)+'">Rejoin <b>'+esc(r.name||r.code)+'</b> <span class="code-chip">'+esc(r.code)+'</span></button>').join('');
  el.querySelectorAll('[data-reopen]').forEach(b=>b.addEventListener('click',()=>{const r=hosted.find(x=>x.code===b.dataset.reopen);if(r)hostRoom(r.code,r.name,false);}));
  el.querySelectorAll('[data-rejoin]').forEach(b=>b.addEventListener('click',()=>joinRoom(b.dataset.rejoin,roomEmail('ga_joined',b.dataset.rejoin))));
}
function renderRoomBar(){
  const t=$('#roomBarText'),b=$('#roomLeave'),code='<span class="code-chip">'+esc(room.code||'')+'</span>',nm='<b>'+esc(room.name||'')+'</b>';
  if(!room.mode){t.innerHTML='Playing on <b>this browser only</b>';b.textContent='Use a room';return;}
  b.textContent='Leave';const s=room.status;
  if(room.mode==='host')t.innerHTML=s==='connecting'?'Opening your room…':s==='reconnecting'?'Hosting '+nm+' '+code+' · reconnecting…':'You’re hosting '+nm+' '+code;
  else t.innerHTML=s==='connecting'?'Connecting to room '+code+'…':s==='reconnecting'?'Lost the host. Reconnecting to '+code+'…':room.awaitLogin?'Signing you in to '+nm+'…':'Room '+nm+' '+code;
}
function renderRoomBtn(){const b=$('#bRoom');if(!b)return;b.hidden=!room.mode;if(room.mode)b.textContent=room.status==='live'?'Room · '+room.online.size+' online':'Room · reconnecting';}
function openRoomModal(){
  if(!room.mode)return;const link=inviteLink(),host=room.mode==='host';
  const online=[...room.online].map(k=>USERS[k]).filter(Boolean).sort((a,b)=>a.name.localeCompare(b.name));
  showModal('room','<h2 id="modalTitle">Room: '+esc(room.name)+'</h2>'
    +'<div class="invite"><span class="lbl">Invite code</span><div class="invite-code">'+esc(room.code.slice(0,3))+' '+esc(room.code.slice(3))+'</div>'
    +'<div class="invite-row"><input id="rLink" type="text" readonly value="'+esc(link)+'" aria-label="Invite link"><button class="btn btn-gold" id="rCopy" type="button">Copy link</button></div>'
    +'<div id="rQR" class="qr" aria-label="QR code for the invite link"></div>'
    +'<p class="fine">People on the same Wi-Fi open the link (or type the code on the start screen), make a profile and walk in.'+(host?' <b>You are the host:</b> keep this tab open, or the room pauses until you reopen it.':'')+'</p></div>'
    +'<section style="display:grid;gap:8px"><h3>Online now ('+online.length+')</h3>'+(online.length?'<ul class="online">'+online.map(u=>'<li><img class="head" src="'+(charOfKey(u.key)?charOfKey(u.key).headUrl:'')+'" alt="">'+esc(u.name)+(u.key===myKey()?' <span class="chip">You</span>':'')+'</li>').join('')+'</ul>':'<p class="empty">Nobody yet.</p>')+'</section>'
    +(host?'<section style="display:grid;gap:8px"><h3>Backup</h3><p class="fine">The room lives in this browser. Download a backup now and then, or to move the room to another computer.</p><div class="menu-actions"><button class="btn" id="rExport" type="button">Download backup</button><label class="btn" for="rImport">Restore from file</label><input id="rImport" type="file" accept="application/json,.json" hidden></div></section>':'')
    +'<div class="menu-actions"><button class="btn btn-ghost" id="rLeave" type="button">Leave room</button></div>');
  if(window.QRCode){try{new window.QRCode($('#rQR',modalBody),{text:link,width:168,height:168,colorDark:'#18110b',colorLight:'#f6ecd6'});}catch(e){}}
  const on=(id,ev,fn)=>{const el=$('#'+id,modalBody);if(el)el.addEventListener(ev,fn);};
  on('rCopy','click',()=>{const inp=$('#rLink',modalBody);const done=()=>toast('Invite link copied.','',1800);
    if(typeof navigator!=='undefined'&&navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(link).then(done,()=>{inp.select();});else{inp.focus();inp.select();try{document.execCommand('copy');done();}catch(e){}}});
  on('rExport','click',()=>{const blob=new Blob([JSON.stringify(room.data,null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='golden-apple-room-'+room.code+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);});
  on('rImport','change',e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{try{const d=JSON.parse(rd.result);if(!d||typeof d.users!=='object')throw 0;restoreRoom(d);}catch(err){toast('That file isn’t a Golden Apple room backup.','',3000);}};rd.readAsText(f);});
  on('rLeave','click',()=>{closeModal();if(state.mode==='world')leaveWorld();leaveRoom();showLogin();toast('You left the room.','',2200);});
}
function restoreRoom(d){
  room.data={v:1,code:room.code,name:str(d.name,28)||room.name,createdAt:d.createdAt||Date.now(),users:d.users,feed:Array.isArray(d.feed)?d.feed:[]};
  room.name=room.data.name;const email=state.me&&state.me.email;if(state.mode==='world')leaveWorld();
  USERS=room.data.users;WORLD={v:2,feed:room.data.feed};saveRoomData();
  for(const c of room.conns){c.key=null;c.conn.send({t:'welcome',v:PROTO,room:{code:room.code,name:room.name},users:pubUsers(),feed:WORLD.feed,online:[]});}
  room.online=new Set();closeModal();const rec=email&&findUser(email);if(rec)enterWorld(rec);else showLogin();toast('Room restored from the backup.','',3000);
}

/* =========================================================
   Login, setup, session
   ========================================================= */
const loginForm=$('#loginForm'),emailIn=$('#email'),emailErr=$('#emailErr');
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function returningUser(){
  if(room.mode==='guest')return null;
  const email=room.mode==='host'?roomEmail('ga_hosted',room.code):(Cookies.get('ga_session')||Store.get('ga_last',null));
  return email?findUser(email):null;
}
// step 1: join or create a room (or play on this browser only); step 2: sign in with an email
function showLogin(){
  state.mode='login';applyViewOffset();
  $('#screen-login').hidden=false;$('#screen-setup').hidden=true;$('#hud').hidden=true;
  const ret=$('#returning'),pick=!room.mode&&!state.solo;
  $('#roomStep').hidden=!pick;$('#roomBar').hidden=pick;ret.hidden=true;loginForm.hidden=true;
  if(pick){renderRecentRooms();return;}
  renderRoomBar();
  const ready=!room.mode||room.status==='live'||(room.mode==='host'&&room.status==='reconnecting');
  if(!ready||room.awaitLogin)return;
  const rec=returningUser();
  if(rec){ret.hidden=false;$('#retName').textContent=rec.name;$('#retMail').textContent=rec.email;$('#retHead').src=headIcon(paintSkin(rec.avatar),56);}
  else loginForm.hidden=false;
}
$('#retEnter').addEventListener('click',()=>{const rec=returningUser();if(rec){startSession(rec);enterWorld(rec);}});
$('#retSwitch').addEventListener('click',()=>{$('#returning').hidden=true;loginForm.hidden=false;emailIn.value='';emailIn.focus();});
loginForm.addEventListener('submit',e=>{
  e.preventDefault();const email=emailIn.value.trim().toLowerCase();
  if(!EMAIL_RE.test(email)){emailErr.textContent='Enter a valid email, like name@company.com.';emailIn.focus();return;}
  emailErr.textContent='';
  if(room.mode==='guest'){guestLogin(email);return;}// only the host knows whether this email has a profile
  const rec=findUser(email);
  if(rec){startSession(rec);enterWorld(rec);toast('Welcome back, <b>'+esc(rec.name)+'</b>. This email already has a profile, so we logged you in.','',3600);}
  else openSetup('create',email);
});
emailIn.addEventListener('input',()=>{emailErr.textContent='';});
function startSession(rec){
  if(room.mode){rememberRoom(room.mode==='host'?'ga_hosted':'ga_joined',{code:room.code,name:room.name,email:rec.email});return;}
  const a=Cookies.set('ga_session',rec.email,30);const b=writeProfileCookie(rec);state.cookieOK=a&&b;Store.set('ga_last',rec.email);
}
const roomCodeIn=$('#roomCode'),roomNameIn=$('#roomName');
$('#joinForm').addEventListener('submit',e=>{e.preventDefault();const code=normCode(roomCodeIn.value);
  if(!validCode(code)){$('#roomErr').textContent='Invite codes are 6 letters and numbers, like K7X2MQ.';roomCodeIn.focus();return;}
  const own=Store.get('ga_hosted',[]).find(r=>r.code===code);if(own)hostRoom(code,own.name,false);else joinRoom(code,roomEmail('ga_joined',code));});
$('#hostForm').addEventListener('submit',e=>{e.preventDefault();const name=roomNameIn.value.trim().replace(/\s+/g,' ').slice(0,28);
  if(name.length<2){$('#roomErr').textContent='Give your room a name with at least 2 characters.';roomNameIn.focus();return;}
  hostRoom(newRoomCode(),name,true);});
$('#soloBtn').addEventListener('click',()=>{state.solo=true;$('#roomErr').textContent='';showLogin();});
$('#roomLeave').addEventListener('click',()=>{if(room.mode)leaveRoom();state.solo=false;showLogin();});
[roomCodeIn,roomNameIn].forEach(i=>i.addEventListener('input',()=>{$('#roomErr').textContent='';}));

/* setup screen */
const avControls=$('#avControls');
function openSetup(mode,email){
  const editing=mode==='edit';const me=state.me;
  state.setup={mode,email:editing?me.email:email,av:editing?Object.assign({},me.avatar):randomAvatar(),desk:editing?deskOf(me):deskOf(null),returnTo:state.mode,avTouched:editing};
  if(state.selected)closeCard();if(state.modal)closeModal();
  state.mode='setup';applyViewOffset();
  $('#screen-login').hidden=true;$('#hud').hidden=true;$('#screen-setup').hidden=false;
  $('#setupTitle').textContent=editing?'Edit your profile':'Set up your profile';
  $('#setupSub').innerHTML=editing?'Signed in as <b>'+esc(me.email)+'</b>':'Creating a profile for <b>'+esc(email)+'</b>';
  $('#setupSave').textContent=editing?'Save changes':'Enter workspace';$('#setupBack').textContent=editing?'Cancel':'Back';
  $('#pName').value=editing?me.name:'';$('#pRole').value=editing?(me.role||''):'';$('#pTeam').value=editing?(me.team||''):'';$('#pStatus').value=editing?(me.status||'available'):'available';
  $('#pNameErr').textContent='';$('#setupErr').textContent='';
  // the spot is assigned automatically (allocDesk on a throwaway record only previews it); the options default to DESK_DEFAULT
  const spot=editing?deskLabel(me):deskLabel({deskSlot:allocDesk({email,deskSlot:-1})});
  $('#deskNote').innerHTML='Only you can sit at your desk. Leave these alone to get the default desk. '+(spot?'Your spot: <b>'+esc(spot)+'</b>, assigned automatically.':'All '+DESK_SLOTS.length+' desks are taken right now.');
  buildAvControls();buildDkControls();updatePreview();updateDeskPreview();setTab('profile');updatePvTag();
  setTimeout(()=>$('#pName').focus(),30);
}
const dkControls=$('#dkControls');
function buildDkControls(){
  const dk=state.setup.desk,full=dk.decor.length>=DECOR_MAX;
  dkControls.innerHTML=DK_KEYS.map(k=>{
    if(DK_STYLE.has(k))return '<div class="av-row"><span class="lbl" id="ld-'+k+'">'+DK_LABEL[k]+'</span><div class="stepper" role="group" aria-labelledby="ld-'+k+'"><button type="button" class="btn" data-dstep="'+k+'" data-d="-1" aria-label="Previous '+DK_LABEL[k].toLowerCase()+'">‹</button><output id="od-'+k+'">'+esc(DK[k][dk[k]])+'</output><button type="button" class="btn" data-dstep="'+k+'" data-d="1" aria-label="Next '+DK_LABEL[k].toLowerCase()+'">›</button></div></div>';
    return '<div class="av-row"><span class="lbl" id="ld-'+k+'">'+DK_LABEL[k]+'</span><div class="swatches" role="radiogroup" aria-labelledby="ld-'+k+'">'+DK[k].map((c,i)=>'<button type="button" class="sw" role="radio" aria-checked="'+(dk[k]===i)+'" aria-label="'+DK_LABEL[k]+' '+(i+1)+'" data-dsw="'+k+'" data-i="'+i+'" style="background:'+c+'"></button>').join('')+'</div></div>';
  }).join('')+'<div class="av-row"><span class="lbl" id="ld-decor">'+DK_LABEL.decor+' <span class="opt">(up to '+DECOR_MAX+')</span></span><div class="chip-row" role="group" aria-labelledby="ld-decor">'
    +DK.decor.map((n,i)=>{const on=dk.decor.includes(i);return '<button type="button" class="chip-btn g" data-decor="'+i+'" aria-pressed="'+on+'"'+(full&&!on?' disabled':'')+'>'+esc(n)+'</button>';}).join('')+'</div></div>';
  const changed=()=>{setPvView('desk');updateDeskPreview();};
  dkControls.querySelectorAll('[data-dstep]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.dstep,n=DK[k].length;dk[k]=(dk[k]+(+b.dataset.d)+n)%n;$('#od-'+k).textContent=DK[k][dk[k]];changed();}));
  dkControls.querySelectorAll('[data-dsw]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.dsw;dk[k]=+b.dataset.i;dkControls.querySelectorAll('[data-dsw="'+k+'"]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));changed();}));
  dkControls.querySelectorAll('[data-decor]').forEach(b=>b.addEventListener('click',()=>{const i=+b.dataset.decor;dk.decor=dk.decor.includes(i)?dk.decor.filter(x=>x!==i):dk.decor.concat(i).slice(0,DECOR_MAX);
    buildDkControls();changed();const f=$('[data-decor="'+i+'"]',dkControls);if(f)f.focus();}));
}
// tabs: Profile and Character show the avatar preview, Desk shows the desk; arrow keys, Home and End move between tabs
const SETUP_TABS=['profile','avatar','desk'],tabEl=t=>$('#tab'+t[0].toUpperCase()+t.slice(1)),panelEl=t=>$('#panel'+t[0].toUpperCase()+t.slice(1));
function setTab(t,focus){
  for(const x of SETUP_TABS){const on=x===t,b=tabEl(x);b.setAttribute('aria-selected',String(on));b.setAttribute('tabindex',on?'0':'-1');panelEl(x).hidden=!on;}
  if(state.setup)state.setup.tab=t;setPvView(t==='desk'?'desk':'avatar');if(focus)tabEl(t).focus();
}
SETUP_TABS.forEach((t,i)=>{const b=tabEl(t);b.addEventListener('click',()=>setTab(t));
  b.addEventListener('keydown',e=>{const n=SETUP_TABS.length,j={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:n-1}[e.key];if(j==null)return;e.preventDefault();setTab(SETUP_TABS[(j+n)%n],true);});});
function buildGender(){
  const g=state.setup.av.gender|0;
  $('#genderRow').innerHTML=GENDER_ORDER.map(i=>'<button type="button" class="chip-btn g" role="radio" aria-checked="'+(g===i)+'" aria-pressed="'+(g===i)+'" data-gender="'+i+'">'+esc(AV.gender[i])+'</button>').join('');
  $('#genderNote').textContent=g?'Randomise picks hair, clothes and accessories that suit '+AV.gender[g].toLowerCase()+' characters.':'Randomise mixes every style.';
  $('#genderRow').querySelectorAll('[data-gender]').forEach(b=>b.addEventListener('click',()=>pickGender(+b.dataset.gender)));
}
// choosing a gender re-rolls the look until you start customising it; after that it keeps your choices
function pickGender(g){const s=state.setup;if(!s)return;if(s.avTouched){s.av.gender=g;buildGender();updatePreview();}else rollAvatar(g);}
function rollAvatar(g){state.setup.av=randomAvatar(g==null?state.setup.av.gender:g);buildAvControls();updatePreview();pv.spin=Math.PI*2;}
function buildAvControls(){
  const av=state.setup.av;buildGender();
  avControls.innerHTML=AV_KEYS.filter(k=>k!=='gender').map(k=>{
    if(AV_STYLE.has(k))return '<div class="av-row"><span class="lbl" id="l-'+k+'">'+AV_LABEL[k]+'</span><div class="stepper" role="group" aria-labelledby="l-'+k+'"><button type="button" class="btn" data-step="'+k+'" data-d="-1" aria-label="Previous '+AV_LABEL[k].toLowerCase()+'">‹</button><output id="o-'+k+'">'+esc(AV[k][av[k]])+'</output><button type="button" class="btn" data-step="'+k+'" data-d="1" aria-label="Next '+AV_LABEL[k].toLowerCase()+'">›</button></div></div>';
    return '<div class="av-row"><span class="lbl" id="l-'+k+'">'+AV_LABEL[k]+'</span><div class="swatches" role="radiogroup" aria-labelledby="l-'+k+'">'+AV[k].map((c,i)=>'<button type="button" class="sw" role="radio" aria-checked="'+(av[k]===i)+'" aria-label="'+AV_LABEL[k]+' '+(i+1)+'" data-sw="'+k+'" data-i="'+i+'" style="background:'+c+'"></button>').join('')+'</div></div>';
  }).join('');
  avControls.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.step,n=AV[k].length;av[k]=(av[k]+(+b.dataset.d)+n)%n;$('#o-'+k).textContent=AV[k][av[k]];state.setup.avTouched=true;updatePreview();}));
  avControls.querySelectorAll('[data-sw]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.sw;av[k]=+b.dataset.i;avControls.querySelectorAll('[data-sw="'+k+'"]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));state.setup.avTouched=true;updatePreview();}));
}
$('#randomBtn').addEventListener('click',()=>rollAvatar());
$('#randomDeskBtn').addEventListener('click',()=>{state.setup.desk=randomDesk();buildDkControls();updateDeskPreview();pv.spin=Math.PI*2;});
$('#resetDeskBtn').addEventListener('click',()=>{state.setup.desk=deskOf(null);buildDkControls();updateDeskPreview();});
function updatePvTag(){const nm=$('#pName').value.trim()||'Your name';const st=STATUS[$('#pStatus').value]||STATUS.available;$('#pvTag').innerHTML='<i class="dot" style="background:var('+st.v+')"></i><span>'+esc(nm)+'</span>';}
$('#pName').addEventListener('input',()=>{$('#pNameErr').textContent='';updatePvTag();});$('#pStatus').addEventListener('change',updatePvTag);
$('#setupBack').addEventListener('click',()=>{const s=state.setup;state.setup=null;if(s&&s.mode==='edit'&&state.me){$('#screen-setup').hidden=true;resumeWorld();}else showLogin();});
$('#setupForm').addEventListener('submit',e=>{
  e.preventDefault();const s=state.setup;if(!s)return;
  const name=$('#pName').value.trim().replace(/\s+/g,' ');
  if(name.length<2){$('#pNameErr').textContent='Add a display name with at least 2 characters.';setTab('profile');$('#pName').focus();return;}
  const role=$('#pRole').value.trim(),team=$('#pTeam').value.trim(),status=$('#pStatus').value;
  if(s.mode==='create'){
    if(room.mode==='guest'){$('#setupErr').textContent='Joining the room…';if(!roomSend({t:'create',email:s.email,profile:{name,role,team,status,avatar:s.av,desk:s.desk}}))$('#setupErr').textContent='Not connected to the room. Check your Wi-Fi and try again.';return;}
    if(findUser(s.email)){$('#setupErr').textContent='A profile with this email already exists. Go back and log in with it instead.';return;}
    const rec={email:s.email,name,role,team,status,avatar:Object.assign({},s.av),desk:deskOf({desk:s.desk}),deskSlot:-1,received:0,createdAt:Date.now(),given:null,recent:[],inbox:[]};
    if(room.mode==='host')rec.key=newUserKey(rec.email);
    allocDesk(rec);USERS[kOf(rec)]=rec;saveUsers();if(room.mode==='host')broadcast({t:'user',rec:pubRec(rec)});
    startSession(rec);state.setup=null;enterWorld(rec);
    toast('Welcome to Golden Apple, <b>'+esc(name)+'</b>. You have '+DAILY_APPLES+' apples to give today.','',4200,ICON_APPLE);
    if(rec.deskSlot>=0)setTimeout(()=>toast('Your desk is ready in the Work Desks room: <b>'+esc(deskLabel(rec))+'</b>. It’s the gold square on your map.','',5200),1400);
  }else{
    const me=state.me;Object.assign(me,{name,role,team,status,avatar:Object.assign({},s.av),desk:deskOf({desk:s.desk})});saveProfile(me);
    state.player.setAvatar(me.avatar);state.setup=null;$('#screen-setup').hidden=true;resumeWorld();renderMe();lastZone='';
    toast('Profile saved.','',2000);
  }
});

// saving your own edited profile: guests send it to the host, which checks it and tells the room
function saveProfile(me){
  if(room.mode==='guest')roomSend({t:'update',profile:{name:me.name,role:me.role,team:me.team,status:me.status,avatar:me.avatar,desk:me.desk}});
  else{allocDesk(me);persistRec(me);if(room.mode==='host')broadcast({t:'user',rec:pubRec(me)});}
  syncDesks();
}

/* avatar + desk preview (second renderer) */
const pv={renderer:null,scene:null,camera:null,av:null,desk:null,rig:null,ped:null,view:'avatar',rot:0.5,spin:0,drag:null,t:0};
function ensurePreview(){
  if(pv.renderer)return;
  pv.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});pv.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  $('#previewMount').appendChild(pv.renderer.domElement);
  pv.scene=new THREE.Scene();pv.scene.add(new THREE.HemisphereLight(0xfff6e6,0x3a2a1a,0.95));const dl=new THREE.DirectionalLight(0xffffff,0.6);dl.position.set(2,4,3);pv.scene.add(dl);
  const ped=new THREE.Mesh(blockGeo('grassTop','grassSide','dirt'),atlasMat);ped.scale.set(1.3,0.5,1.3);ped.position.y=-0.25;pv.scene.add(ped);pv.ped=ped;
  pv.rig=new THREE.Group();pv.rig.visible=false;pv.scene.add(pv.rig);
  const floor=new THREE.Mesh(blockGeo('oak','dirt','dirt'),atlasMat);floor.scale.set(2.6,0.3,3.0);floor.position.set(0,-0.15,0.45);pv.rig.add(floor);
  pv.camera=new THREE.PerspectiveCamera(32,1,0.1,50);pv.camera.position.set(0,1.35,5.2);pv.camera.lookAt(0,0.92,0);
  const m=$('#previewMount');
  m.addEventListener('pointerdown',e=>{pv.drag={x:e.clientX};try{m.setPointerCapture(e.pointerId);}catch(_){}});
  m.addEventListener('pointermove',e=>{if(!pv.drag)return;pv.rot+=(e.clientX-pv.drag.x)*0.012;pv.drag.x=e.clientX;});
  m.addEventListener('pointerup',()=>{pv.drag=null;});m.addEventListener('pointercancel',()=>{pv.drag=null;});
}
function updatePreview(){ensurePreview();if(pv.av){pv.scene.remove(pv.av.root);pv.rig.remove(pv.av.root);pv.av.disposables.forEach(d=>d.dispose());}pv.av=buildAvatar(state.setup.av);placePvAvatar();}
function updateDeskPreview(){ensurePreview();if(pv.desk)pv.rig.remove(pv.desk.root);pv.desk=buildDesk(state.setup.desk);pv.rig.add(pv.desk.root);}
// avatar view: standing on the grass block; desk view: seated in the chair, facing the desk
function placePvAvatar(){
  const A=pv.av;if(!A)return;const desk=pv.view==='desk';
  pv.scene.remove(A.root);pv.rig.remove(A.root);(desk?pv.rig:pv.scene).add(A.root);pv.ped.visible=!desk;pv.rig.visible=desk;
  A.root.position.set(0,desk?0.5-HIP:0,desk?1.0:0);A.root.rotation.y=desk?Math.PI:pv.rot;
  A.legR.rotation.x=A.legL.rotation.x=desk?-Math.PI/2:0;A.armR.rotation.x=A.armL.rotation.x=desk?-0.8:0;A.headPivot.rotation.x=desk?0.14:0;
}
function setPvView(v){
  ensurePreview();if(pv.view!==v)pv.rot=v==='desk'?0.95:0.5;pv.view=v;
  $('#pvHint').textContent=v==='desk'?'Drag to turn · Only you can sit at this desk':'Drag to turn · Your character is 32 skin pixels tall';
  if(v==='desk'){pv.camera.position.set(0,2.5,5.6);pv.camera.lookAt(0,0.75,0.35);}else{pv.camera.position.set(0,1.35,5.2);pv.camera.lookAt(0,0.92,0);}
  placePvAvatar();
}
function renderPreview(dt){
  const m=$('#previewMount');const w=m.clientWidth,h=m.clientHeight;if(!w||!h)return;
  const c=pv.renderer.domElement;if(c.width!==Math.round(w*pv.renderer.getPixelRatio())||c.height!==Math.round(h*pv.renderer.getPixelRatio())){pv.renderer.setSize(w,h,false);pv.camera.aspect=w/h;pv.camera.updateProjectionMatrix();}
  pv.t+=dt;if(pv.spin>0){const s=Math.min(pv.spin,dt*9);pv.spin-=s;pv.rot+=s;}else if(!pv.drag&&!reduceMotion)pv.rot+=dt*(pv.view==='desk'?0.2:0.35);
  const A=pv.av;if(pv.view==='desk'){pv.rig.rotation.y=pv.rot;if(pv.desk)animateDesk(pv.desk,pv.t,dt);}else A.root.rotation.y=pv.rot;
  A.armR.rotation.z=-0.06-Math.sin(pv.t*1.6)*0.04;A.armL.rotation.z=0.06+Math.sin(pv.t*1.6)*0.04;A.headPivot.rotation.y=Math.sin(pv.t*0.6)*0.2;
  pv.renderer.render(pv.scene,pv.camera);
}

/* world entry / exit */
const locals=[];
function enterWorld(rec){
  state.me=rec;
  if(state.player)state.player.dispose(),state.chars.delete(state.player.id);
  const old=state.chars.get('local:'+kOf(rec));if(old)removeLocal(old);
  const P=new Character({id:'me',kind:'me',data:rec});state.player=P;state.chars.set('me',P);
  P.root.position.set(SPAWN.x,0,SPAWN.z);P.heading=Math.PI;P.root.rotation.y=Math.PI;
  cam.yaw=0;cam.pitch=0.55;cam.dist=10.5;cam.target.set(SPAWN.x,1.3,SPAWN.z);
  // every profile keeps one desk; other people sit Away at their desk until they are online in the room
  const myHad=rec.deskSlot;
  if(room.mode!=='guest'){let changed=false;for(const k in USERS){const u=USERS[k],had=u.deskSlot;allocDesk(u);if(u.deskSlot!==had)changed=true;}if(changed){saveUsers();if(!room.mode)state.cookieOK=writeProfileCookie(rec);}}
  if(room.mode==='host')setOnline(kOf(rec),true);
  rr.use=null;rr.wash=null;fishing.phase=null;fishing.fish=null;arc.joining=null;gym.use=null;gym.hr=HR_CALM;gym.tip=false;Object.assign(mt,{on:false,phase:'idle',ball:null,inv:null,out:null,end:null});loadVitals(rec);
  syncDesks();syncPeople();
  resumeWorld();renderMe();renderFeed();drawBoard();renderRoomBtn();lastZone='';
  if(rec.deskSlot!==myHad)setTimeout(()=>toast(rec.deskSlot>=0?'Your desk is in the Work Desks room: <b>'+esc(deskLabel(rec))+'</b>. It’s the gold square on your map.':'All '+DESK_SLOTS.length+' desks are taken, so you don’t have a desk yet.','',5200),1400);
  const unread=(rec.inbox||[]).filter(x=>!x.read);
  if(unread.length){const ap=unread.filter(x=>x.type==='apple').reduce((a,x)=>a+x.count,0),pk=unread.filter(x=>x.type==='poke').length;
    setTimeout(()=>toast('While you were away: '+[ap?plural(ap,'apple'):'',pk?plural(pk,'poke'):''].filter(Boolean).join(' and ')+'. Open your inbox to read them.','gold',5200,ap?ICON_APPLE:ICON_POKE),900);}
  setTimeout(()=>{if(state.player)state.player.say('Hi, I’m '+rec.name.split(' ')[0]+'!',2400);},500);
}
function resumeWorld(){state.mode='world';applyViewOffset();$('#screen-login').hidden=true;$('#screen-setup').hidden=true;$('#hud').hidden=false;$('#hint').hidden=state.hintHidden;cvs.focus({preventScroll:true});}
function leaveWorld(){
  const k=myKey();if(room.mode==='host'&&k)setOnline(k,false);else if(room.mode==='guest')roomSend({t:'logout'});
  exitArcade();arc.joining=null;stopGym();quitMatch();saveVitals();endRestroom();rr.wash=null;endFishing();
  closeCard();if(state.player){if(state.player.seat)state.player.seat.occ=null;state.player.dispose();state.chars.delete('me');state.player=null;}
  for(const l of locals.splice(0)){freeStallOf(l);l.dispose();state.chars.delete(l.id);if(l.spot)l.spot.occ=null;}
  state.me=null;keys.clear();showLogin();
}
function logout(){
  if(!room.mode){Cookies.del('ga_session');Store.del('ga_last');}else{rememberRoom(room.mode==='host'?'ga_hosted':'ga_joined',{code:room.code,name:room.name,email:''});room.email='';}
  closeModal();leaveWorld();emailIn.value='';toast(room.mode?'Logged out. You’re still in the room: sign in again, or leave it.':'Logged out. Your profile is still saved on this browser.','',3000);
}

/* =========================================================
   Main loop
   ========================================================= */
let last=performance.now(),frameN=0,uiT=0;
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;frameN++;
  if(state.mode==='world')updatePlayer(dt);
  for(const ch of state.chars.values())ch.update(dt);
  updateParticles(dt);updateFlyers(dt);updateRings(dt);updateSound(dt);updateFood(dt);updateRoom(dt);updateVitals(dt);updateRestroom(dt);updateDayNight(dt);updateFishing(dt);updateLakeFish(dt);updateArcade(dt);updateGym(dt);updateMatch(dt);
  for(const S of DESK_SLOTS)if(S.desk)animateDesk(S.desk,now/1000,dt);
  waterTex.offset.x+=dt*0.015;waterTex.offset.y+=dt*0.008;
  for(const c of clouds){c.position.x+=c.userData.v*dt;if(c.position.x>100)c.position.x=-100;}
  if(!reduceMotion)for(const r of ECO_SPIN)r.rotation.x+=dt*r.userData.w;
  for(const d of ducks){const u=d.userData;u.a+=dt*u.s;d.position.set(u.cx+Math.sin(u.a)*u.r,-0.2+Math.sin(u.a*6)*0.02,u.cz+Math.cos(u.a)*u.r*0.6);d.rotation.y=u.a+Math.PI/2;}
  if(state.selected){const s=state.selected,p=s.root.position;
    const gy=s.anim.pose==='sit'?0:(s.kind==='me'?supportY(p.x,p.z):p.y-s.hopY);
    selRing.visible=s.root.visible;selRing.position.set(p.x,gy+0.04,p.z);selRing.rotation.z+=dt*0.8;}else selRing.visible=false;
  updateCamera(dt);
  if(!arc.open){renderer.render(scene,camera);updateLabels();updateStallLabels();}// the arcade covers the screen
  if(state.mode==='world'){
    if(frameN%3===0)drawMinimap();
    uiT+=dt;if(uiT>0.4){uiT=0;renderZone();
      if(state.selected){const z=$('#cardZone');if(z)z.textContent=state.selected.hiddenInStall?'In the Restroom':'At '+zoneAt(state.selected.root.position.x,state.selected.root.position.z);}
      const P=state.player,pr=$('#prompt');let msg='';
      const kh=coarse?'Tap <span class="key">Use</span>':'Press <span class="key">E</span>';
      const fk=coarse?'Tap <span class="key">Eat</span>':'Press <span class="key">F</span>';
      if(P&&!state.modal){let s,o,ci;const hf=P.held&&FOOD[P.held],eatMsg=hf?fk+' to '+(isDrink(hf)?'drink':'eat')+' '+esc(hf.name):'';
        let sk,st,ac,gm,cv;
        if(rr.use)msg=rr.use.S.kind==='shower'?'Showering…':'In the restroom…';
        else if(rr.wash)msg='Washing your hands…';
        else if(gym.use)msg=gymPrompt(kh);
        else if(mt.on)msg=matchPrompt();
        else if(P.rodMesh||fishing.phase)msg=fishPrompt(kh);
        else if(P.eating)msg=isDrink(P.eating.f)?'Drinking…':'Eating…';
        else if(P.seat)msg=(P.seat.desk?'Working · ':'Resting · ')+kh+' or move to stand up'+(hf?' · '+eatMsg:'');
        else if(P.root.position.distanceTo(BOARD_POS)<3.2)msg=kh+' to read the Orchard Board';
        else if((ac=nearestArcade()))msg=arcPrompt(ac,kh);
        else if((ci=nearestCounterItem())>=0){const f=FOOD[menu.items[ci]];msg=kh+' to take '+esc(f.name)+' <span class="cat '+f.cat+'">'+FOOD_CATS[f.cat]+'</span>';}
        else if((gm=nearestGym()))msg=gymNearPrompt(gm,kh);
        else if((cv=courtHere()))msg=courtPrompt(cv,kh);
        else if(nearCooler())msg=kh+' to grab a water bottle';
        else if(nearCoffee())msg=brew.on?'Brewing your coffee…':kh+' to grab a cup of coffee';
        else if(nearRack())msg=kh+' to take a fishing rod';
        else if((sk=nearestSink()))msg=kh+' to wash your hands'+(V.clean?'':' <span class="cat drink">Needed</span>');
        else if((st=nearestStall()))msg=st.occ?(st.kind==='shower'?'Shower in use · try the other one':'Occupied · try another stall'):kh+(st.kind==='shower'?' to take a shower':' to use the restroom');
        else if((s=nearestSeat()))msg=kh+(s.desk?' to sit at your desk':' to sit')+(hf?' and '+(isDrink(hf)?'drink':'eat'):'');
        else if((o=nearestOtherDesk()))msg=esc(deskOwnerName(o))+'’s desk · only they can sit here';
        else if(hf)msg=eatMsg+(coarse?'':' · <span class="key">Q</span> put it down');}
      $('#tEat').hidden=!(P&&P.held&&!P.eating);if(coarse)updateTouchButtons();
      pr.hidden=!msg;if(msg&&pr.innerHTML!==msg)pr.innerHTML=msg;
    }
  }
  if(state.mode==='setup'&&pv.renderer)renderPreview(dt);
  requestAnimationFrame(frame);
}
setInterval(()=>{if(state.mode==='world'){renderFeed();renderMe();}},20000);

/* boot */
resize();drawBoard();showLogin();renderRoomBtn();
// an invite link (?room=CODE) joins straight away; the host's own link reopens the room
(function(){if(typeof URLSearchParams==='undefined'||!location.search)return;const code=normCode(new URLSearchParams(location.search).get('room'));if(!validCode(code))return;
  roomCodeIn.value=code;const own=Store.get('ga_hosted',[]).find(r=>r.code===code);if(own)hostRoom(code,own.name,false);else joinRoom(code,roomEmail('ga_joined',code));})();
if(document.fonts&&document.fonts.load){Promise.all(['700 34px "Pixelify Sans"','700 16px "Atkinson Hyperlegible"','400 16px "Atkinson Hyperlegible"'].map(f=>document.fonts.load(f))).then(()=>{SIGN_DRAWERS.forEach(f=>f());drawBoard();drawCabinetScreens();}).catch(()=>{});}// redraw canvas text once both fonts are in
requestAnimationFrame(frame);
})();
