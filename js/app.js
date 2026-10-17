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
     Pantry food ...................... food counter menu, coffee machine, eating
     personal desks ................... one desk per person: buildDesk, placeDesk, allocDesk
     Avatars .......................... 64x64 skin painter + block figure
     Characters ....................... animation, nameplates, speech
     Walk routes ...................... spot-to-spot paths (layout check)
     Effects .......................... particles, flying apples, rings
     Sound ............................ generated music, ambience and effects per place
     Health, energy and the restroom .. needs, stalls, hand washing
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
  acc:['None','Glasses','Shades','Headphones','Cap','Beanie']
};
const AV_KEYS=['skin','hairStyle','hair','eyes','top','topColor','pants','shoes','acc'];
const AV_LABEL={skin:'Skin',hairStyle:'Hair style',hair:'Hair colour',eyes:'Eyes',top:'Top',topColor:'Top colour',pants:'Trousers',shoes:'Shoes',acc:'Accessory'};
const AV_STYLE=new Set(['hairStyle','top','acc']);
function randomAvatar(){const a={};for(const k of AV_KEYS)a[k]=Math.floor(Math.random()*AV[k].length);if(Math.random()<0.45)a.acc=0;return a;}
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
(function sky(){const c=document.createElement('canvas');c.width=2;c.height=256;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#69b6ea');gr.addColorStop(0.55,'#a9d9f3');gr.addColorStop(1,'#d9eff8');g.fillStyle=gr;g.fillRect(0,0,2,256);scene.background=new THREE.CanvasTexture(c);})();
scene.add(new THREE.HemisphereLight(0xe3f3ff,0x5d7c3c,0.72));
scene.add(new THREE.AmbientLight(0xffffff,0.16));
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
const TILE_NAMES=['grassTop','grassSide','dirt','path','plaza','oak','pantry','tile','sand','logSide','logTop','leaves','plaster','brick','plank','hedge'];
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
    hedge:(ox,oy)=>fill(ox,oy,()=>R()<0.1?'#1f4a18':pk(['#2f6f26','#367c2b','#285f20','#3d8631']))
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
  log:['logTop','logSide','logTop'],leaves:['leaves','leaves','leaves'],plaster:['plaster','plaster','plaster'],brick:['brick','brick','brick'],hedge:['hedge','hedge','hedge']
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
  lake:{name:'Lakeside',inside:{x:0,z:19.6},gate:{x:0,z:15.5},spoke:4}
};
const RING=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;RING.push({x:Math.sin(a)*3.4,z:-Math.cos(a)*3.4});}
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
  rect(-2,1,-16,-5,'path');rect(5,17,-2,1,'path');rect(-19,-6,-2,1,'path');rect(-2,1,5,21,'path');
  // zones
  for(const key of ['desks','pantry','restroom']){const Z=ZONES[key];
    for(let cx=Z.x0;cx<=Z.x1;cx++)for(let cz=Z.z0;cz<=Z.z1;cz++){
      setTile(cx,cz,Z.floor);
      const edge=cx===Z.x0||cx===Z.x1||cz===Z.z0||cz===Z.z1;if(!edge)continue;
      const d=Z.door;const isDoor=(d.side==='s'&&cz===Z.z1&&cx>=d.from&&cx<=d.to)||(d.side==='w'&&cx===Z.x0&&cz>=d.from&&cz<=d.to)||(d.side==='e'&&cx===Z.x1&&cz>=d.from&&cz<=d.to);
      if(isDoor)continue;
      addBlock(Z.wall,cx+0.5,0.5,cz+0.5);
      if(Z.glass)fbox(cx+0.5,1.5,cz+0.5,1,1,1,'#cfeeff','glass');else addBlock(Z.wall,cx+0.5,1.5,cz+0.5);
      setTop(cx,cz,2);
    }}
  // lake
  for(let cx=-24;cx<24;cx++)for(let cz=18;cz<44;cz++){const e=lakeE(cx+0.5,cz+0.5);if(e<=1){setTile(cx,cz,'water');setTop(cx,cz,-1);}else if(e<=1.32&&getTile(cx,cz)!=='path')setTile(cx,cz,'sand');}
  for(let cx=-1;cx<=0;cx++)for(let cz=21;cz<=31;cz++){setTile(cx,cz,'dock');setTop(cx,cz,0);}
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

function textCanvas(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);return c;}
const SIGN_DRAWERS=[];
function sign(x,z,rot,title,sub){
  const fx=Math.sin(rot),fz=Math.cos(rot);
  fbox(x-fx*0.08,0.85,z-fz*0.08,0.14,1.7,0.14,'#6b4a2b');
  fbox(x,1.62,z,2.0,0.74,0.1,'#8c6234','noise',rot);
  solidRect(x-0.3,z-0.3,x+0.3,z+0.3,2);
  const c=textCanvas(256,96,()=>{});const tex=canvasTex(c);
  const draw=()=>{const g=c.getContext('2d');g.fillStyle='#a8793f';g.fillRect(0,0,256,96);g.fillStyle='#7a5328';for(let y=23;y<96;y+=24)g.fillRect(0,y,256,2);
    g.fillStyle='#2a1a0c';g.textAlign='center';g.font='600 34px "Pixelify Sans", "Courier New", monospace';g.fillText(title.toUpperCase(),128,46);
    g.font='500 19px "Pixelify Sans", "Courier New", monospace';g.fillStyle='#4a2f16';g.fillText(sub,128,76);tex.needsUpdate=true;};
  draw();SIGN_DRAWERS.push(draw);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1.9,0.66),new THREE.MeshBasicMaterial({map:tex}));
  m.position.set(x+fx*0.056,1.62,z+fz*0.056);m.rotation.y=rot;scene.add(m);
}

/* ---------- personal desks: one per person, built from their desk options ---------- */
const STALLS=[];// restroom stalls, filled by buildFurniture: {i,zc,spot,pivot,sign,occ,ang,swing,label}
const STALL_MAT={door:new THREE.MeshLambertMaterial({color:0x6d93a8,map:noiseTex}),knob:new THREE.MeshLambertMaterial({color:0xd9e2e6}),free:new THREE.MeshBasicMaterial({color:0x6cbf4c}),occ:new THREE.MeshBasicMaterial({color:0xe0442e})};
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
    STALLS.push({i:STALLS.length,zc,spot,pivot,sign,occ:null,ang:-0.35,swing:0,label:null});}
  fbox(-20.15,1.25,-4.4,0.16,0.4,0.5,'#d0d6da');plant(-21.4,5.0,1);

  /* --- Plaza --- */
  // plaza benches face the apple tree
  bench(4.0,-4.0,-Math.PI/4,'#8a5a33','plaza');bench(-4.0,-4.0,Math.PI/4,'#8a5a33','plaza');bench(-4.0,4.0,Math.PI*3/4,'#8a5a33','plaza');
  // orchard board (SE)
  const br=-Math.PI/4,bx=4.3,bz=4.3,ux=Math.cos(br),uz=-Math.sin(br);
  for(const s of [-1.2,1.2])fbox(bx+ux*s,0.95,bz+uz*s,0.16,1.9,0.16,'#6b4a2b');
  fbox(bx,1.55,bz,2.8,1.75,0.12,'#7a5328','noise',br);
  solidRect(bx-1,bz-1,bx+1,bz+1,2);
  boardCanvas=textCanvas(512,320,()=>{});boardTex=canvasTex(boardCanvas);
  boardMesh=new THREE.Mesh(new THREE.PlaneGeometry(2.62,1.6),new THREE.MeshBasicMaterial({map:boardTex}));
  boardMesh.position.set(bx+Math.sin(br)*0.065,1.55,bz+Math.cos(br)*0.065);boardMesh.rotation.y=br;boardMesh.userData.board=true;scene.add(boardMesh);PICK_TARGETS.push(boardMesh);
  BOARD_POS.set(bx,0,bz);

  /* --- Lake --- */
  bench(-8,20.5,0,'#8a5a33','lake');bench(8,20.5,0,'#8a5a33','lake');
  for(const s of SPOTS.filter(s=>s.zone==='lake'))s.via=[{x:s.x,z:21.7}];
  addSpot({zone:'lake',x:0.0,z:29.6,y:0,face:0,pose:'look',via:[{x:0,z:21.6}]});
  // shore viewpoints: walk along z=19.4 (behind the benches), then down to the water
  addSpot({zone:'lake',x:-12,z:23.4,y:0,face:0.35,pose:'look',via:[{x:-12,z:19.4}]});
  addSpot({zone:'lake',x:12,z:23.4,y:0,face:-0.35,pose:'look',via:[{x:12,z:19.4}]});
  fbox(-0.9,-0.2,31.4,0.18,1.0,0.18,'#5b3a1e');fbox(0.9,-0.2,31.4,0.18,1.0,0.18,'#5b3a1e');
  for(let i=0;i<14;i++){const a=WR()*Math.PI*2,r=0.55+WR()*0.35,x=Math.sin(a)*17*r,z=31+Math.cos(a)*8.5*r;if(Math.abs(x)<2.5)continue;fbox(x,-0.17,z,0.5,0.03,0.5,'#4f9a33');if(WR()<0.3)fbox(x+0.1,-0.12,z,0.12,0.06,0.12,'#f4a6c0');}
  for(let i=0;i<40;i++){const a=WR()*Math.PI*2,x=Math.sin(a)*17*1.08,z=31+Math.cos(a)*8.5*1.08;if(Math.abs(x)<3)continue;const cx=Math.floor(x),cz=Math.floor(z);if(getTile(cx,cz)!=='sand')continue;fbox(x,0.25,z,0.08,0.5+WR()*0.3,0.08,'#5f8f3a');}

  /* --- signs --- */
  sign(3.4,-14.2,0,'Work Desks','Pods · Whiteboard');
  sign(15.6,3.3,-Math.PI/2,'Pantry','Coffee · Snacks');
  sign(-15.6,3.3,Math.PI/2,'Restroom','Sinks · Stalls');
  sign(3.4,14.5,Math.PI,'Lakeside','Benches · Dock');
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
  g.fillStyle='#f2b632';g.textAlign='center';g.font='700 46px "Pixelify Sans", "Courier New", monospace';g.fillText('ORCHARD BOARD',256,64);
  g.fillStyle='#f6ecd6';g.font='500 30px "Pixelify Sans", "Courier New", monospace';
  g.fillText('Golden Apples: '+st.golden,256,134);g.fillText('Apples given today: '+st.given,256,180);
  g.fillStyle='#c4b49a';g.font='400 24px "Pixelify Sans", "Courier New", monospace';g.fillText(coarse?'Tap to read the board':'Click or press E to read',256,268);
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
   Pantry food: counter menu (changes every 5 minutes), coffee machine, holding and eating
   ========================================================= */
const MENU_MS=300000,COUNTER_X=32.35,SLOT_Z=[-0.85,-0.25,0.35,0.95,1.55,2.15,2.75,3.35],COFFEE_Z=-4.5,EAT_TIME=1.6,BREW_TIME=2.4;
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
const mbCanvas=textCanvas(640,120,()=>{}),mbTex=canvasTex(mbCanvas);
const menuBoard=new THREE.Mesh(new THREE.PlaneGeometry(4.2,0.79),new THREE.MeshBasicMaterial({map:mbTex}));menuBoard.position.set(32.905,1.62,1.25);menuBoard.rotation.y=-Math.PI/2;scene.add(menuBoard);
function drawMenuBoard(){
  const g=mbCanvas.getContext('2d'),F='"Pixelify Sans", "Courier New", monospace';menu.mins=menuMinsLeft();
  g.fillStyle='#22332a';g.fillRect(0,0,640,120);g.textAlign='left';
  g.fillStyle='#f6ecd6';g.font='700 22px '+F;g.fillText('FOOD',16,38);g.fillText('COUNTER',16,62);
  g.fillStyle='#c4b49a';g.font='500 13px '+F;g.fillText('New menu in',16,88);g.fillText(menu.mins+' min',16,104);
  [['veg','VEG','#7fd36a'],['nonveg','NON-VEG','#ff7d5f'],['fruit','FRUITS','#f2b632'],['drink','DRINKS','#7fc4f0']].forEach(([cat,label,c],i)=>{const x=150+i*122;
    g.fillStyle=c;g.font='700 15px '+F;g.fillText(label,x,34);g.fillStyle='#f6ecd6';g.font='500 13px '+F;
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
function holdFood(id){const P=state.player;if(!P)return;const had=P.held;P.hold(id);sfx('pick');P.say((had&&had!==id?'Swapped for ':'')+FOOD[id].name+(had&&had!==id?'.':'!'),1400);}
function putDownFood(){const P=state.player;if(!P||!P.held||P.eating)return;const h=handPos(P);burst(h.x,h.y,h.z,6,['#f4f1ea','#d9d0bf'],1.2,0.05);P.dropHeld();sfx('putdown');}
function startBrew(){const P=state.player;if(!P||brew.on||P.eating)return;brew.on=true;brew.t=0;P.faceTo(32.3,COFFEE_Z);P.say('Coffee time.',1200);sfx('brew');}
// eating: Minecraft style, the item goes to the mouth, crumbs fly and it crunches until EAT_TIME, then a burp (or "ahh" for drinks)
function startEat(){const P=state.player;if(!P||!P.held||P.eating||state.mode!=='world')return;const f=FOOD[P.held];P.eating={t:0,next:0,f};P.anim.eat=isDrink(f)?'drink':'eat';}
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
  if(e.t>=EAT_TIME){P.eating=null;P.anim.eat=null;P.dropHeld();sfx(drink?'ahh':'burp');const dirty=applyNutrition(e.f);P.say(dirty?'Should have washed my hands first…':e.f.id==='coffee'?'Ahh, coffee.':drink?'Refreshing!':'Yum!',1800);}
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
  const R=mulberry32(hashStr(avatarToArr(av).join('.'))+11);
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
    this.anim={yawn:0,eat:null,phase:0,speed:0,run:false,air:false,pose:'stand',t:Math.random()*10,celebrate:0,startle:0,poke:0,give:0,wave:0};
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
  }
  // a food item in the right hand, just below the fist; it tips towards the mouth when the arm comes up to eat
  hold(id){this.dropHeld();this.held=id;const m=buildFood(id,true);m.scale.setScalar(0.8);m.position.set(0,-12*PX,2.5*PX);this.heldMesh=m;this.av.armR.add(m);}
  dropHeld(){if(this.heldMesh)this.av.armR.remove(this.heldMesh);this.heldMesh=null;this.held=null;}
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
    if(a.wave>0){a.wave-=dt;aRz=-2.7+Math.sin(a.t*16)*0.35;aRx=0;}
    if(a.eat==='eat'){aRx=-1.75+Math.sin(a.t*24)*0.13;aRz=0.32;hX=0.06+Math.sin(a.t*24)*0.03;}
    else if(a.eat==='drink'){aRx=-2.2+Math.sin(a.t*6)*0.05;aRz=0.3;hX=-0.35;}
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
  dispose(){scene.remove(this.root);this.av.disposables.forEach(d=>d.dispose());this.tag.remove();if(this.bubble)this.bubble.remove();}
}

/* ---------- walk routes ----------
   routeFromTo is no longer used in play; tests/smoke-test.js walks every spot-to-spot route to prove the
   layout stays connected through doors and gaps after furniture changes. */
function routeFromTo(a,b){
  const pts=[];
  if(a){for(let i=a.via.length-1;i>=0;i--)pts.push(a.via[i]);}
  const za=a?ZONES[a.zone]:null,zb=ZONES[b.zone];
  if(!a||a.zone!==b.zone){if(za)pts.push(za.inside,za.gate,...ringPath(za.spoke,zb.spoke));pts.push(zb.gate,zb.inside);}
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
  lake:{bpm:66,root:53,prog:[[0,4,7,11],[5,9,12,16],[-3,0,4,7],[7,11,14,19]],scale:[0,2,4,7,9,12,14],lead:'sine',pad:'triangle',bass:[0,8],dens:0.3,perc:null,echo:0.35,seed:13}
};
// ambience per place: steady beds (wind, water, room hum) plus an occasional event every gap[0]..gap[1] seconds
const AMB={plaza:{wind:0.5,water:0,hum:0,ev:'birds',gap:[2,6]},grounds:{wind:0.7,water:0,hum:0,ev:'birds',gap:[3,8]},lake:{wind:0.35,water:1,hum:0,ev:'lake',gap:[4,10]},
  desks:{wind:0,water:0,hum:0.35,ev:'typing',gap:[1.5,4]},pantry:{wind:0,water:0,hum:0.6,ev:'pantry',gap:[3,8]},restroom:{wind:0,water:0.12,hum:0.25,ev:'drip',gap:[0.8,2.6]}};
const zoneKey=name=>({'Work Desks':'desks','Pantry':'pantry','Restroom':'restroom','Lakeside':'lake','Plaza':'plaza'})[name]||'grounds';
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
function ambEvent(ev,t){
  const D=Sound.amb;
  if(ev==='birds'){const n=2+Math.floor(Math.random()*3),f=rand(2400,3800);for(let i=0;i<n;i++)tone(D,f*rand(0.9,1.1),t+i*0.11,0.08,{to:f*rand(1.2,1.5),v:0.03});}
  else if(ev==='lake'){if(Math.random()<0.4){for(let i=0;i<2;i++)tone(D,620,t+i*0.16,0.12,{type:'sawtooth',to:420,v:0.035,lp:1400});}else hiss(D,t,0.25,{type:'lowpass',f:900,v:0.08,a:0.05});}
  else if(ev==='typing'){let tt=t;const n=4+Math.floor(Math.random()*10);for(let i=0;i<n;i++){hiss(D,tt,0.025,{f:2600,v:0.05});tt+=rand(0.06,0.14);}}
  else if(ev==='pantry'){if(Math.random()<0.5){tone(D,2300,t,0.25,{v:0.03});tone(D,3450,t,0.18,{v:0.015});}else for(let i=0;i<6;i++)hiss(D,t+i*0.09,0.08,{type:'bandpass',f:rand(300,600),v:0.05,q:4});}
  else if(ev==='drip')tone(D,rand(1200,1700),t,0.09,{to:450,v:0.05});
}
// called every frame: switches theme and ambience with the player's place, and schedules notes 0.3 s ahead
function updateSound(){
  const c=Sound.ctx;if(!c||c.state!=='running')return;const now=c.currentTime;
  const place=state.mode==='world'?Sound.want:null,tk=place==='grounds'?'plaza':place;
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
  if(A&&now>=Sound.ambNext){Sound.ambNext=now+rand(A.gap[0],A.gap[1]);ambEvent(A.ev,now);}
}
function sfx(name,o){
  const c=Sound.ctx;if(!c||c.state!=='running'||SND.muted)return;const t=c.currentTime+0.005,F=Sound.fx;o=o||{};
  switch(name){
    case 'step':{const g=o.ground;
      if(g==='water')hiss(F,t,0.16,{type:'lowpass',f:1300,v:0.09,a:0.02});
      else if(g==='grass'||g==='hedge')hiss(F,t,0.06,{type:'lowpass',f:900,v:0.07});
      else if(g==='sand')hiss(F,t,0.08,{type:'lowpass',f:1800,v:0.05});
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
    case 'deny':tone(F,190,t,0.09,{type:'square',v:0.04,lp:900});tone(F,150,t+0.11,0.12,{type:'square',v:0.04,lp:900});break;
  }
}
addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('button,.sw');if(b&&!b.disabled)sfx('ui');},true);

/* =========================================================
   Health, energy and the restroom
   Three needs drift in real time. Food fills health and some energy, coffee fills energy, everything you
   eat or drink fills the restroom need, and sitting down rests you. Low values slow you down.
   The restroom has three private stalls: you are hidden while inside, and others only see "Occupied".
   ========================================================= */
const VITAL_DEFAULT={hp:85,en:85,bl:15,clean:true};
// points per second. Sitting at your own desk is working: it drains energy and health faster; any other seat is a rest
const VRATE={hp:-1.8/60,en:-1.3/60,run:-2.8/60,rest:5/60,workEn:-2.4/60,workHp:-3/60,bl:1.2/60};
const V=Object.assign({},VITAL_DEFAULT,{growl:30,yawn:25,urge:20,save:5,ui:0,warned:{}});
const vclamp=v=>clamp(+v||0,0,100);// keep full precision: per-frame changes are tiny (rounding happens on screen)
// what each item gives: health, energy, restroom need
function nutrition(f){
  if(f.id==='coffee')return{hp:0,en:45,bl:22};
  if(f.id==='chai')return{hp:2,en:25,bl:16};
  if(f.id==='water')return{hp:4,en:4,bl:18};
  if(f.cat==='drink')return{hp:6,en:8,bl:20};
  if(f.cat==='fruit')return{hp:15,en:8,bl:f.snd==='juicy'?10:6};
  return{hp:35,en:10,bl:8};// veg and non-veg meals
}
// eating with unwashed hands after the restroom only does half the good
function applyNutrition(f){const n=nutrition(f),dirty=!V.clean&&!isDrink(f);V.hp=vclamp(V.hp+n.hp*(dirty?0.5:1));V.en=vclamp(V.en+n.en);V.bl=vclamp(V.bl+n.bl);renderVitals();return dirty;}
function vitalSpeed(){let s=1;if(V.en<10)s*=0.65;else if(V.en<25)s*=0.85;if(V.hp<10)s*=0.8;if(V.bl>=95)s*=0.85;return s;}
const canRun=()=>V.en>=10&&V.hp>=10;
// pixel icons for the three bars: heart (health), bolt (energy), drop (restroom)
$('#icHp').src=pixelIcon(['.rr.rr.','rhrrrrr','rrrrrrr','.rrrrr.','..rrr..','...r...'],{r:'#e0442e',h:'#ff8f6e'},2);
$('#icEn').src=pixelIcon(['...yy.','..yy..','.yyyy.','yyyy..','..yy..','.yy...','.y....'],{y:'#f2b632'},2);
$('#icBl').src=pixelIcon(['..b..','.bbb.','.bbb.','bhbbb','bhbbb','bbbbb','.bbb.'],{b:'#6fb7e8',h:'#d7eefc'},2);
// needs are kept per person on this browser; after 3 hours away you come back fresh
function loadVitals(rec){const v=Store.get('ga_vitals',{})[kOf(rec)],fresh=!v||Date.now()-(v.at||0)>3*3600e3;
  Object.assign(V,fresh?VITAL_DEFAULT:{hp:vclamp(v.hp),en:vclamp(v.en),bl:vclamp(v.bl),clean:v.clean!==false});V.warned={};renderVitals();}
function saveVitals(){if(!state.me)return;const all=Store.get('ga_vitals',{});all[kOf(state.me)]={hp:V.hp,en:V.en,bl:V.bl,clean:V.clean,at:Date.now()};Store.set('ga_vitals',all);}
addEventListener('beforeunload',saveVitals);
function warnOnce(k,on,clear,msg){if(on&&!V.warned[k]){V.warned[k]=true;toast(msg,'',4200);}else if(clear&&V.warned[k])V.warned[k]=false;}
function updateVitals(dt){
  if(state.mode!=='world'||!state.player)return;const P=state.player;
  if(!rr.use){// needs pause while you are in the restroom
    const running=P.anim.speed>0.1&&P.anim.run,working=!!(P.seat&&P.seat.desk),starving=V.hp<10?2:1;
    V.hp=vclamp(V.hp+(working?VRATE.workHp:VRATE.hp*(running?1.5:1))*dt);
    V.en=vclamp(V.en+(working?VRATE.workEn*starving:P.seat?VRATE.rest:(running?VRATE.run:VRATE.en)*starving)*dt);
    V.bl=vclamp(V.bl+VRATE.bl*dt);
  }
  V.growl-=dt;V.yawn-=dt;V.urge-=dt;
  if(V.hp<30&&V.growl<=0&&!P.eating){V.growl=V.hp<10?20:45;sfx('growl');P.say(V.hp<10?'I’m starving…':'*stomach growls*',2200);}
  if(V.en<25&&V.yawn<=0&&!rr.use){V.yawn=V.en<10?15:35;sfx('yawn');P.anim.yawn=1.6;P.say(V.en<10?'So tired…':'*yawn*',2000);}
  if(V.bl>=75&&V.urge<=0&&!rr.use){V.urge=V.bl>=95?12:40;P.say(V.bl>=95?'I really need the restroom!':'I should find the restroom.',2400);}
  warnOnce('hp',V.hp<30,V.hp>45,'You’re getting hungry. Grab something from the Pantry counter.');
  warnOnce('en',V.en<25,V.en>40,'You’re low on energy. Have a coffee in the Pantry, or sit down for a while.');
  warnOnce('bl',V.bl>=75,V.bl<50,'Time for a restroom break. The Restroom is west of the plaza.');
  V.save-=dt;if(V.save<=0){V.save=5;saveVitals();}
  V.ui-=dt;if(V.ui<=0){V.ui=0.5;renderVitals();}
}
function renderVitals(){
  const row=(k,v,bad)=>{$('#v'+k+'Bar').style.width=v+'%';$('#v'+k+'Num').textContent=Math.round(v);$('#v'+k).classList.toggle('low',bad);};
  row('Hp',V.hp,V.hp<30);row('En',V.en,V.en<25);row('Bl',V.bl,V.bl>=75);
  const w=[];if(V.hp<10)w.push('Starving');else if(V.hp<30)w.push('Hungry');if(V.en<10)w.push('Exhausted');else if(V.en<25)w.push('Tired');
  if(V.bl>=95)w.push('Restroom: urgent');else if(V.bl>=75)w.push('Needs the restroom');if(!V.clean)w.push('Wash your hands');
  const el=$('#vWarn');el.textContent=w.join(' · ');el.hidden=!w.length;
}
/* ---------- restroom: stalls and sinks ---------- */
const rr={use:null,wash:null};
const SINKS=()=>SPOTS.filter(s=>s.zone==='restroom'&&s.pose==='wash');
function nearestStall(){const P=state.player;if(!P)return null;const p=P.root.position;let best=null,bd=1.3;for(const S of STALLS){const d=Math.hypot(S.spot.x-p.x,S.spot.z-p.z);if(d<bd){bd=d;best=S;}}return best;}
function nearestSink(){const P=state.player;if(!P)return null;const p=P.root.position;if(p.x<-27.6||p.x>-21.4||p.z>-3.4)return null;let best=null,bd=0.7;for(const s of SINKS()){const d=Math.abs(s.x-p.x);if(d<bd){bd=d;best=s;}}return best;}
function startRestroom(S){
  const P=state.player;if(!P||rr.use||rr.wash||P.eating||P.seat)return;
  if(S.occ){P.say('Occupied. I’ll try another one.',1600);sfx('deny');return;}
  if(P.held){P.dropHeld();toast('You left your food outside the stall.','',2200);}
  S.occ='me';S.swing=0.7;rr.use={S,t:0,dur:clamp(3+V.bl*0.05,3,8),hidden:false};P.faceTo(S.spot.x-1,S.spot.z);sfx('door');
}
function startWash(s){
  const P=state.player;if(!P||rr.use||rr.wash||P.eating)return;
  if(P.held){P.say('Hands full! Put the food down first (Q).',1800);return;}
  P.root.position.x=s.x;P.heading=Math.PI;rr.wash={t:0,s};sfx('water');
}
function endRestroom(){
  const U=rr.use,P=state.player;if(!U)return;rr.use=null;U.S.occ=null;U.S.swing=0.7;
  if(P){P.root.visible=true;P.hiddenInStall=false;P.root.position.set(U.S.spot.x+0.95,0,U.S.spot.z);P.heading=Math.PI/2;}
}
function updateRestroom(dt){
  // stall doors: wide open while someone steps in or out, shut while occupied, ajar when free
  for(const S of STALLS){S.swing=Math.max(0,S.swing-dt);const want=S.swing>0?-1.35:S.occ?0:-0.35;S.ang+=(want-S.ang)*(1-Math.exp(-dt*8));S.pivot.rotation.y=S.ang;S.sign.material=S.occ?STALL_MAT.occ:STALL_MAT.free;
    if(S.occ&&!reduceMotion&&Math.random()<dt*1.6)spawnP(-28.5,2.0,S.zc+rand(-0.3,0.3),rand(-0.08,0.08),0.45,rand(-0.08,0.08),1.6,0.08,pick(['#7fc4f0','#f2b632','#c9ecf8']),-0.15);}// a little humming from inside
  const P=state.player,U=rr.use;
  if(U&&P){U.t+=dt;
    if(!U.hidden&&U.t>0.35){U.hidden=true;P.root.visible=false;P.hiddenInStall=true;P.root.position.set(U.S.spot.x,0,U.S.spot.z);sfx('lock');if(state.selected===P)closeCard();}
    if(U.t>=U.dur+0.35){endRestroom();sfx('flush');V.bl=0;V.clean=false;renderVitals();P.say('All done. Now to wash my hands.',2400);}}
  const W=rr.wash;
  if(W&&P){W.t+=dt;if(!reduceMotion&&Math.random()<dt*14)spawnP(W.s.x+rand(-0.04,0.04),1.02,-5.75,rand(-0.05,0.05),-0.4,rand(0,0.1),0.45,0.035,Math.random()<0.7?'#9fd8f5':'#ffffff',6);
    if(W.t>=3){rr.wash=null;V.clean=true;V.hp=vclamp(V.hp+2);renderVitals();P.say('Squeaky clean!',1600);sfx('catch');}}
}
const _sv=new THREE.Vector3();
function updateStallLabels(){
  for(const S of STALLS){
    if(!S.label){S.label=document.createElement('div');S.label.className='stall-label';S.label.hidden=true;labels.appendChild(S.label);}
    const el=S.label,mine=S.occ==='me'&&rr.use&&rr.use.S===S;
    if(!S.occ||state.mode!=='world'){if(!el.hidden)el.hidden=true;continue;}
    _sv.set(-27.9,2.35,S.zc);_sv.project(camera);
    if(_sv.z>1||_sv.z<-1||Math.abs(_sv.x)>1.1||Math.abs(_sv.y)>1.1){el.hidden=true;continue;}
    const w=stage.clientWidth,h=stage.clientHeight,html=mine?'<span>Using the restroom</span><i class="prog"><b style="width:'+Math.min(100,rr.use.t/(rr.use.dur+0.35)*100).toFixed(0)+'%"></b></i>':'<span>Occupied</span>';
    if(el._h!==html){el.innerHTML=html;el._h=html;}el.className='stall-label'+(mine?' mine':'');el.hidden=false;
    el.style.transform='translate('+((_sv.x*0.5+0.5)*w).toFixed(1)+'px,'+((-_sv.y*0.5+0.5)*h).toFixed(1)+'px) translate(-50%,-100%)';
  }
}
// a remote player in a stall: hidden, the stall shows Occupied; frees it when they come out or leave
function freeStallOf(ch){if(ch.inStall&&ch.inStall.occ===ch.id){ch.inStall.occ=null;ch.inStall.swing=0.7;}ch.inStall=null;}

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
  if(rr.use){jumpQueued=false;P.anim.speed=0;return;}
  if(rr.wash&&(moving||jumpQueued))rr.wash=null;
  if(P.seat){if(moving||jumpQueued){standUp();}else{jumpQueued=false;P.anim.speed=0;return;}}
  const run=(keys.has('shift')||joy.run)&&canRun();
  const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
  let mx=rx*ix+fx*(-iz),mz=rz*ix+fz*(-iz);const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  const inWater=cellTop(p.x,p.z)<-0.5&&p.y<-0.4;
  const spd=(run?5.6:3.0)*(inWater?0.55:1)*vitalSpeed();
  const dx=mx*spd*dt,dz=mz*spd*dt,ox=p.x,oz=p.z;
  if(dx&&!blocked(p.x+dx,p.z,p.y))p.x+=dx;
  if(dz&&!blocked(p.x,p.z+dz,p.y))p.z+=dz;
  if(moving)P.heading=Math.atan2(mx,mz);
  if(P.onGround){P.stepAcc=(P.stepAcc||0)+Math.hypot(p.x-ox,p.z-oz);if(P.stepAcc>(run?0.95:0.7)){P.stepAcc=0;sfx('step',{ground:inWater?'water':getTile(Math.floor(p.x),Math.floor(p.z))});}}
  if(jumpQueued&&P.onGround){P.vy=inWater?5.4:7.0;P.onGround=false;sfx('jump');}
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
function sitOn(s){const P=state.player;s.occ='me';P.seat=s;placeAt(P,s);P.vy=0;P.onGround=true;P.say(s.desk?'My desk!':'Comfy.',1200);sfx('sit');if(P.held&&!P.eating)startEat();}
function standUp(){const P=state.player,s=P.seat;if(!s)return;s.occ=null;P.seat=null;const a=s.approach||{x:s.x,z:s.z+1};P.root.position.set(a.x,0,a.z);P.baseY=0;P.anim.pose='stand';P.root.visible=true;sfx('stand');}
function tryInteract(){
  if(state.mode!=='world'||state.modal)return;const P=state.player;if(!P)return;
  if(P.seat){standUp();return;}
  if(rr.use||rr.wash)return;
  if(P.root.position.distanceTo(BOARD_POS)<3.2){openBoard();return;}
  if(P.eating)return;
  const ci=nearestCounterItem();if(ci>=0){holdFood(menu.items[ci]);return;}
  if(nearCoffee()){startBrew();return;}
  const sk=nearestSink();if(sk){startWash(sk);return;}
  const st=nearestStall();if(st){startRestroom(st);return;}
  const s=nearestSeat();if(s){sitOn(s);return;}
  const o=nearestOtherDesk();if(o){P.say('That’s '+deskOwnerName(o)+'’s desk.',1800);sfx('deny');}
}
addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(state.modal)closeModal();else if(state.selected)closeCard();return;}
  if(isTyping()||state.mode!=='world'||state.modal)return;
  const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
  keys.add(k);
  if(k===' '&&!e.repeat)jumpQueued=true;
  if(k==='e'&&!e.repeat)tryInteract();
  if(k==='m'&&!e.repeat)toggleMute();
  if(k==='f'&&!e.repeat)startEat();
  if(k==='q'&&!e.repeat)putDownFood();
  if(!state.hintHidden&&['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k))scheduleHintHide();
});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>keys.clear());

const cvs=renderer.domElement;const raycaster=new THREE.Raycaster();const ndc=new THREE.Vector2();
let drag=null,lastClick={id:null,t:0};
cvs.addEventListener('pointerdown',e=>{if(state.mode!=='world')return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,moved:false};try{cvs.setPointerCapture(e.pointerId);}catch(_){}});
cvs.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.lx,dy=e.clientY-drag.ly;drag.lx=e.clientX;drag.ly=e.clientY;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;
  if(drag.moved){cam.yaw-=dx*0.0065;cam.pitch=clamp(cam.pitch+dy*0.0045,0.16,1.25);}});
cvs.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;if(!d.moved)handlePick(e.clientX,e.clientY);});
cvs.addEventListener('pointercancel',()=>{drag=null;});
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

/* touch joystick */
const joyEl=$('#joy'),knob=$('#knob');
if(coarse){$('#touch').hidden=false;}
joyEl.addEventListener('pointerdown',e=>{joy.active=e.pointerId;try{joyEl.setPointerCapture(e.pointerId);}catch(_){}moveJoy(e);scheduleHintHide();});
joyEl.addEventListener('pointermove',e=>{if(joy.active===e.pointerId)moveJoy(e);});
const endJoy=()=>{joy.active=false;joy.x=joy.y=0;knob.style.transform='';};
joyEl.addEventListener('pointerup',endJoy);joyEl.addEventListener('pointercancel',endJoy);
function moveJoy(e){const r=joyEl.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);const m=r.width/2-14,l=Math.hypot(dx,dy);if(l>m){dx*=m/l;dy*=m/l;}joy.x=dx/m;joy.y=dy/m;knob.style.transform='translate('+dx+'px,'+dy+'px)';}
$('#tJump').addEventListener('pointerdown',e=>{e.preventDefault();jumpQueued=true;});
$('#tUse').addEventListener('click',tryInteract);$('#tEat').addEventListener('click',startEat);
$('#tRun').addEventListener('click',e=>{joy.run=!joy.run;e.currentTarget.setAttribute('aria-pressed',String(joy.run));});

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
  sun.position.set(cam.target.x+18,cam.target.y+32,cam.target.z+12);sun.target.position.copy(cam.target);sun.target.updateMatrixWorld();
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
  const C={grass:'#4f9a33',path:'#9b958c',plaza:'#b3ada3',oak:'#c8a36b',pantry:'#d9cfa9',tile:'#dfe8ec',sand:'#e3d29a',water:'#3b8fd6',dock:'#a8793f',hedge:'#24561c'};
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
  for(const k of ['desks','pantry','restroom']){const Z=ZONES[k];if(x>=Z.x0&&x<Z.x1+1&&z>=Z.z0&&z<Z.z1+1)return Z.name;}
  if(x*x+z*z<56)return 'Plaza';
  if(lakeE(x,z)<1.7||(z>13&&Math.abs(x)<22))return 'Lakeside';
  const t=getTile(Math.floor(x),Math.floor(z));
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
function openMenu(confirmDelete){
  const me=state.me;
  showModal('menu','<h2 id="modalTitle">Menu</h2>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Signed in as</span><div style="font-size:15px;word-break:break-all">'+esc(me.email)+'</div><p class="fine">Only you see your email. Coworkers see your name, role and team.</p></div>'
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
if(coarse){$('#hint').innerHTML='<span>Joystick to walk</span><span>Tap a coworker</span><span>Double-tap to poke</span><span>Drag to look</span><button class="x" id="hintClose2" type="button" aria-label="Hide controls">×</button>';$('#hintClose2').addEventListener('click',()=>{$('#hint').hidden=true;state.hintHidden=true;Store.set('ga_hint_hidden',true);});}

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
    if(kind!==ch.kind){ch.kind=kind;if(kind==='local'){ch.net=null;ch.netAir=false;ch.dropHeld();ch.anim.eat=null;if(ch.inStall){freeStallOf(ch);ch.hiddenInStall=false;}seatAway(ch);}}
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
  const held=FOOD[n.held]?n.held:null;if(held!==(ch.held||null)){if(held)ch.hold(held);else ch.dropHeld();}
  ch.anim.eat=n.eat==='eat'||n.eat==='drink'?n.eat:null;
  if(n.wave!==ch.netWave){if(ch.netWave!=null)ch.anim.wave=1.4;ch.netWave=n.wave;}
}
function myNetState(){const P=state.player,p=P.root.position,r=v=>Math.round(v*100)/100;
  return{x:r(p.x),y:r(p.y),z:r(p.z),h:r(P.heading),spd:r(P.anim.speed),run:!!P.anim.run,air:!P.onGround,seat:P.seat?P.seat.id:null,held:P.held||null,eat:P.anim.eat||null,wave:room.waveN,stall:rr.use?rr.use.S.i:null,act:rr.wash?'wash':null};}
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
  state.setup={mode,email:editing?me.email:email,av:editing?Object.assign({},me.avatar):randomAvatar(),desk:editing?deskOf(me):deskOf(null),returnTo:state.mode};
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
  buildAvControls();buildDkControls();updatePreview();updateDeskPreview();setPvView('avatar');updatePvTag();
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
$('#pvAvatar').addEventListener('click',()=>setPvView('avatar'));$('#pvDesk').addEventListener('click',()=>setPvView('desk'));
function buildAvControls(){
  const av=state.setup.av;
  avControls.innerHTML=AV_KEYS.map(k=>{
    if(AV_STYLE.has(k))return '<div class="av-row"><span class="lbl" id="l-'+k+'">'+AV_LABEL[k]+'</span><div class="stepper" role="group" aria-labelledby="l-'+k+'"><button type="button" class="btn" data-step="'+k+'" data-d="-1" aria-label="Previous '+AV_LABEL[k].toLowerCase()+'">‹</button><output id="o-'+k+'">'+esc(AV[k][av[k]])+'</output><button type="button" class="btn" data-step="'+k+'" data-d="1" aria-label="Next '+AV_LABEL[k].toLowerCase()+'">›</button></div></div>';
    return '<div class="av-row"><span class="lbl" id="l-'+k+'">'+AV_LABEL[k]+'</span><div class="swatches" role="radiogroup" aria-labelledby="l-'+k+'">'+AV[k].map((c,i)=>'<button type="button" class="sw" role="radio" aria-checked="'+(av[k]===i)+'" aria-label="'+AV_LABEL[k]+' '+(i+1)+'" data-sw="'+k+'" data-i="'+i+'" style="background:'+c+'"></button>').join('')+'</div></div>';
  }).join('');
  avControls.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.step,n=AV[k].length;av[k]=(av[k]+(+b.dataset.d)+n)%n;$('#o-'+k).textContent=AV[k][av[k]];updatePreview();}));
  avControls.querySelectorAll('[data-sw]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.sw;av[k]=+b.dataset.i;avControls.querySelectorAll('[data-sw="'+k+'"]').forEach(x=>x.setAttribute('aria-checked',String(x===b)));updatePreview();}));
}
$('#randomBtn').addEventListener('click',()=>{state.setup.av=randomAvatar();buildAvControls();updatePreview();pv.spin=Math.PI*2;});
function updatePvTag(){const nm=$('#pName').value.trim()||'Your name';const st=STATUS[$('#pStatus').value]||STATUS.available;$('#pvTag').innerHTML='<i class="dot" style="background:var('+st.v+')"></i><span>'+esc(nm)+'</span>';}
$('#pName').addEventListener('input',()=>{$('#pNameErr').textContent='';updatePvTag();});$('#pStatus').addEventListener('change',updatePvTag);
$('#setupBack').addEventListener('click',()=>{const s=state.setup;state.setup=null;if(s&&s.mode==='edit'&&state.me){$('#screen-setup').hidden=true;resumeWorld();}else showLogin();});
$('#setupForm').addEventListener('submit',e=>{
  e.preventDefault();const s=state.setup;if(!s)return;
  const name=$('#pName').value.trim().replace(/\s+/g,' ');
  if(name.length<2){$('#pNameErr').textContent='Add a display name with at least 2 characters.';$('#pName').focus();return;}
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
  $('#pvAvatar').setAttribute('aria-pressed',String(v==='avatar'));$('#pvDesk').setAttribute('aria-pressed',String(v==='desk'));
  $('#randomBtn').hidden=v==='desk';
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
  rr.use=null;rr.wash=null;loadVitals(rec);
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
  saveVitals();endRestroom();rr.wash=null;
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
  updateParticles(dt);updateFlyers(dt);updateRings(dt);updateSound(dt);updateFood(dt);updateRoom(dt);updateVitals(dt);updateRestroom(dt);
  for(const S of DESK_SLOTS)if(S.desk)animateDesk(S.desk,now/1000,dt);
  waterTex.offset.x+=dt*0.015;waterTex.offset.y+=dt*0.008;
  for(const c of clouds){c.position.x+=c.userData.v*dt;if(c.position.x>100)c.position.x=-100;}
  for(const d of ducks){const u=d.userData;u.a+=dt*u.s;d.position.set(u.cx+Math.sin(u.a)*u.r,-0.2+Math.sin(u.a*6)*0.02,u.cz+Math.cos(u.a)*u.r*0.6);d.rotation.y=u.a+Math.PI/2;}
  if(state.selected){const s=state.selected,p=s.root.position;
    const gy=s.anim.pose==='sit'?0:(s.kind==='me'?supportY(p.x,p.z):p.y-s.hopY);
    selRing.visible=s.root.visible;selRing.position.set(p.x,gy+0.04,p.z);selRing.rotation.z+=dt*0.8;}else selRing.visible=false;
  updateCamera(dt);
  renderer.render(scene,camera);
  updateLabels();updateStallLabels();
  if(state.mode==='world'){
    if(frameN%3===0)drawMinimap();
    uiT+=dt;if(uiT>0.4){uiT=0;renderZone();
      if(state.selected){const z=$('#cardZone');if(z)z.textContent=state.selected.hiddenInStall?'In the Restroom':'At '+zoneAt(state.selected.root.position.x,state.selected.root.position.z);}
      const P=state.player,pr=$('#prompt');let msg='';
      const kh=coarse?'Tap <span class="key">Use</span>':'Press <span class="key">E</span>';
      const fk=coarse?'Tap <span class="key">Eat</span>':'Press <span class="key">F</span>';
      if(P&&!state.modal){let s,o,ci;const hf=P.held&&FOOD[P.held],eatMsg=hf?fk+' to '+(isDrink(hf)?'drink':'eat')+' '+esc(hf.name):'';
        let sk,st;
        if(rr.use)msg='In the restroom…';
        else if(rr.wash)msg='Washing your hands…';
        else if(P.eating)msg=isDrink(P.eating.f)?'Drinking…':'Eating…';
        else if(P.seat)msg=(P.seat.desk?'Working · ':'Resting · ')+kh+' or move to stand up'+(hf?' · '+eatMsg:'');
        else if(P.root.position.distanceTo(BOARD_POS)<3.2)msg=kh+' to read the Orchard Board';
        else if((ci=nearestCounterItem())>=0){const f=FOOD[menu.items[ci]];msg=kh+' to take '+esc(f.name)+' <span class="cat '+f.cat+'">'+FOOD_CATS[f.cat]+'</span>';}
        else if(nearCoffee())msg=brew.on?'Brewing your coffee…':kh+' to grab a cup of coffee';
        else if((sk=nearestSink()))msg=kh+' to wash your hands'+(V.clean?'':' <span class="cat drink">Needed</span>');
        else if((st=nearestStall()))msg=st.occ?'Occupied · try another stall':kh+' to use the restroom';
        else if((s=nearestSeat()))msg=kh+(s.desk?' to sit at your desk':' to sit')+(hf?' and '+(isDrink(hf)?'drink':'eat'):'');
        else if((o=nearestOtherDesk()))msg=esc(deskOwnerName(o))+'’s desk · only they can sit here';
        else if(hf)msg=eatMsg+(coarse?'':' · <span class="key">Q</span> put it down');}
      $('#tEat').hidden=!(P&&P.held&&!P.eating);
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
if(document.fonts&&document.fonts.load){Promise.all([document.fonts.load('600 34px "Pixelify Sans"'),document.fonts.load('700 46px "Pixelify Sans"')]).then(()=>{SIGN_DRAWERS.forEach(f=>f());drawBoard();}).catch(()=>{});}
requestAnimationFrame(frame);
})();
