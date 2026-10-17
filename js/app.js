/* =========================================================================
   Golden Apple — game logic (plain JavaScript, no build step)
   Needs three.js r128 loaded first (see index.html).

   Table of contents (search for the heading text):
     Rules ............................ DAILY_APPLES / GOLDEN_AFTER
     helpers .......................... small utilities
     pixel apple icons ................ 2D pixel-art icons used in the UI
     Storage .......................... cookie (primary) + localStorage mirror
     avatar options ................... skin, hair, clothes, accessories
     Data model ....................... users, demo coworkers, feed
     Three.js core .................... renderer, scene, camera, lights
     textures ......................... procedural block texture atlas
     World layout ..................... zones, paths, lake, furniture, trees
     Avatars .......................... 64x64 skin painter + block figure
     Characters ....................... animation, nameplates, speech
     NPC brains ....................... where demo coworkers walk next
     Effects .......................... particles, flying apples, rings
     Player, camera, input ............ movement, collision, mouse/touch
     Labels ........................... nameplates + speech bubbles
     Minimap
     Recognition logic ................ giveApples, doPoke, Golden Apple
     UI rendering ..................... HUD, card, modals, toasts
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

/* =========================================================
   Data model
   ========================================================= */
let USERS=Store.get('ga_users',{});
const saveUsers=()=>Store.set('ga_users',USERS);
const profileCookieName=email=>'ga_p_'+hashStr(email).toString(36);
function writeProfileCookie(rec){
  const compact={e:rec.email,n:rec.name,r:rec.role,t:rec.team,s:rec.status,a:avatarToArr(rec.avatar),rc:rec.received||0,c:rec.createdAt};
  return Cookies.set(profileCookieName(rec.email),b64e(JSON.stringify(compact)),180);
}
function readProfileCookie(email){const v=Cookies.get(profileCookieName(email));if(!v)return null;const j=b64d(v);if(!j)return null;try{const o=JSON.parse(j);return o&&o.e===email?o:null;}catch(e){return null;}}
function recordFromCookie(c){return{email:c.e,name:c.n,role:c.r||'',team:c.t||'',status:c.s||'available',avatar:arrToAvatar(c.a),received:c.rc||0,createdAt:c.c||Date.now(),given:null,recent:[],inbox:[]};}
function findUser(email){
  if(USERS[email])return USERS[email];
  const c=readProfileCookie(email);
  if(c){const rec=recordFromCookie(c);USERS[email]=rec;saveUsers();return rec;}
  return null;
}
function putUser(rec){USERS[rec.email]=rec;saveUsers();state.cookieOK=writeProfileCookie(rec);}
const budgetLeft=d=>d.given&&d.given.d===todayKey()?Math.max(0,DAILY_APPLES-d.given.n):DAILY_APPLES;
function spendBudget(d,n){const t=todayKey();if(!d.given||d.given.d!==t)d.given={d:t,n:0};d.given.n+=n;}

const NPC_SEEDS=[
  {id:'priya',name:'Priya Nair',role:'Product Manager',team:'Payments',status:'meeting',av:[2,3,0,0,3,4,1,0,0],rc:14},
  {id:'arjun',name:'Arjun Mehta',role:'Frontend Engineer',team:'Web Platform',status:'focus',av:[3,0,0,1,1,5,0,1,3],rc:6},
  {id:'meera',name:'Meera Iyer',role:'QA Lead',team:'Quality',status:'available',av:[4,4,1,0,4,1,3,2,1],rc:10},
  {id:'daniel',name:'Daniel Okafor',role:'Data Analyst',team:'Insights',status:'available',av:[6,1,0,1,2,0,0,0,0],rc:4},
  {id:'sofia',name:'Sofia Lindqvist',role:'UX Researcher',team:'Design',status:'break',av:[0,3,4,2,0,2,2,1,0],rc:7},
  {id:'kenji',name:'Kenji Watanabe',role:'Backend Engineer',team:'Core Services',status:'focus',av:[1,2,0,1,1,8,1,3,1],rc:2},
  {id:'fatima',name:'Fatima Zahra',role:'Customer Success',team:'Support',status:'available',av:[3,5,1,0,3,6,5,2,0],rc:12},
  {id:'rahul',name:'Rahul Krishnan',role:'DevOps Engineer',team:'Infrastructure',status:'meeting',av:[5,0,0,0,0,3,0,0,4],rc:5},
  {id:'lena',name:'Lena Brooks',role:'People Partner',team:'People',status:'available',av:[1,5,3,3,4,9,4,0,0],rc:3}
];
const REASONS=['Team player','Problem solver','Above & beyond','Helping hand','Creative spark','Customer hero','Great mentor'];
const POKES=['Hey there!','Coffee break?','Stand-up in 5','Lunch?','Nice work today','Got a minute?'];
const REPLIES={'Hey there!':['Hey {n}!','Oh hi {n}!'],'Coffee break?':['Coffee sounds great.','Give me five minutes!'],'Stand-up in 5':['On my way.','Thanks for the nudge!'],'Lunch?':['Yes! 1 pm?','Biryani again?'],'Nice work today':['Thanks, you too!','That means a lot.'],'Got a minute?':['Sure, what’s up?','After this call?']};
const THANKS=['Thank you, {n}!','Aw, thanks {n}!','That made my day.','Thanks {n}, appreciated!'];
const NOTES={'Team player':['Covered for me on the release.','Always jumps in when we are stuck.'],'Problem solver':['Found the root cause in minutes.','Untangled that flaky test.'],'Above & beyond':['Stayed late to ship the fix.','Turned the demo around overnight.'],'Helping hand':['Walked me through the new setup.','Saved my afternoon with that review.'],'Creative spark':['Loved the new onboarding flow.','That workshop idea was brilliant.'],'Customer hero':['Calmed down a very upset client.','Great customer call today.'],'Great mentor':['Patient, clear feedback every time.','Helped me prep for my first talk.']};
const STATUS={available:{label:'Available',v:'--st-available'},focus:{label:'Focused',v:'--st-focus'},meeting:{label:'In a meeting',v:'--st-meeting'},break:{label:'On a break',v:'--st-break'},away:{label:'Away',v:'--st-away'}};

function seedWorld(){
  const now=Date.now(),m=60000;
  const npc={};NPC_SEEDS.forEach(s=>{npc[s.id]={received:s.rc,given:null,recent:[],goldenAt:isGolden(s.rc)?now-864e5*3:null};});
  npc.meera.recent=[{from:'Priya Nair',count:1,reason:'Helping hand',note:'Walked me through the new setup.',at:now-6*m}];
  npc.daniel.recent=[{from:'Fatima Zahra',count:2,reason:'Customer hero',note:'Great customer call today.',at:now-14*m}];
  npc.priya.recent=[{from:'Sofia Lindqvist',count:1,reason:'Creative spark',note:'Loved the new onboarding flow.',at:now-31*m}];
  npc.fatima.recent=[{from:'Arjun Mehta',count:1,reason:'Problem solver',note:'Untangled that flaky test.',at:now-52*m}];
  return{v:1,npc,feed:[
    {kind:'apple',from:'Priya Nair',to:'Meera Iyer',count:1,reason:'Helping hand',at:now-6*m},
    {kind:'apple',from:'Fatima Zahra',to:'Daniel Okafor',count:2,reason:'Customer hero',at:now-14*m},
    {kind:'apple',from:'Sofia Lindqvist',to:'Priya Nair',count:1,reason:'Creative spark',at:now-31*m},
    {kind:'apple',from:'Arjun Mehta',to:'Fatima Zahra',count:1,reason:'Problem solver',at:now-52*m}
  ]};
}
let WORLD=Store.get('ga_world',null);if(!WORLD||WORLD.v!==1)WORLD=seedWorld();
const saveWorld=()=>Store.set('ga_world',WORLD);
saveWorld();

const state={mode:'login',me:null,player:null,chars:new Map(),selected:null,pokeMsg:0,cookieOK:Cookies.ok,modal:null,setup:null,hintHidden:Store.get('ga_hint_hidden',false)};

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

let boardCanvas,boardTex,boardMesh;
function buildFurniture(){
  /* --- Work desks: 6 pods x 4 desks --- */
  const chairCols=['#2fa5a0','#e0442e','#f2b632','#6d4bb5','#2f6fc2','#ef7f2a'];
  let pod=0;
  for(const cz of [-32,-24])for(const cx of [-8,0,8]){
    const chair=chairCols[pod++%chairCols.length];
    for(const [dx,side] of [[-1,-1],[1,-1],[-1,1],[1,1]]){
      const x=cx+dx,dz=side<0?cz-0.5:cz+0.5,tw=side;
      fbox(x,0.76,dz,1.94,0.07,0.96,'#e2cfa6');
      fbox(x-0.93,0.37,dz,0.06,0.74,0.9,'#8c8a86');fbox(x+0.93,0.37,dz,0.06,0.74,0.9,'#8c8a86');
      const mz=dz-tw*0.22;
      fbox(x,1.08,mz,0.72,0.44,0.05,'#232429');
      fbox(x,1.08,mz+tw*0.03,0.64,0.36,0.012,wpick(['#7fd3ff','#9ff0c9','#ffd27f','#b9b3ff']),'glow');
      fbox(x,0.88,mz-tw*0.01,0.08,0.18,0.06,'#3a3b40');
      fbox(x,0.805,dz+tw*0.2,0.46,0.02,0.15,'#3a3b40');
      if(WR()<0.45)fbox(x+0.62,0.86,dz+tw*0.12,0.1,0.13,0.1,wpick(['#f4f1ea','#e0442e','#2f6fc2','#f2b632']));
      if(WR()<0.2){fbox(x-0.66,0.87,mz,0.16,0.16,0.16,'#b5683e');fbox(x-0.66,1.02,mz,0.2,0.16,0.2,'#4fa33a');}
      solidRect(x-1,dz-0.5,x+1,dz+0.5,0.82);
      const zc=dz+tw*1.0;
      fbox(x,0.46,zc,0.56,0.08,0.56,chair);fbox(x,0.84,zc+tw*0.27,0.56,0.62,0.07,chair);
      fbox(x,0.22,zc,0.08,0.44,0.08,'#2c2c30');fbox(x,0.04,zc,0.5,0.05,0.08,'#2c2c30');fbox(x,0.04,zc,0.08,0.05,0.5,'#2c2c30');
      raiseTop(Math.floor(x),Math.floor(zc),0.95);
      const gap=x<cx?cx-4:cx+4,az=zc+tw*1.0;
      addSpot({zone:'desks',x,z:zc,y:0.5,face:tw<0?0:Math.PI,pose:'sit',desk:true,approach:{x,z:az},via:[{x:gap,z:-19.5},{x:gap,z:az},{x,z:az}]});
    }
  }
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
  fbox(32.5,1.0,1.5,0.5,0.1,0.5,'#c88a4a');
  for(const [ax,az] of [[32.4,1.4],[32.6,1.6],[32.5,1.45]])fbox(ax,1.12,az,0.14,0.14,0.14,'#e0442e');
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
  for(const zc of [-3.5,-0.5,2.5]){fbox(-28.0,0.95,zc,0.08,1.8,2.7,'#7aa0b3');fbox(-27.93,0.95,zc+0.9,0.04,0.08,0.18,'#d9e2e6');}
  solidRect(-30,-5,-28,4,2);
  fbox(-24.5,0.42,-5.5,6,0.84,1,'#e4dcd0');fbox(-24.5,0.87,-5.5,6.04,0.06,1.04,'#5c6670');solidRect(-27.5,-6,-21.5,-5,0.9);
  for(const x of [-26.5,-24.5,-22.5]){
    fbox(x,0.91,-5.45,0.6,0.04,0.5,'#f4f7f8');fbox(x,1.02,-5.86,0.06,0.2,0.06,'#b9c1c7');fbox(x,1.66,-5.96,0.8,0.8,0.04,'#c9ecf8','glow');
    addSpot({zone:'restroom',x,z:-4.45,y:0,face:Math.PI,pose:'wash',via:[{x:-24,z:-2.4},{x,z:-3.4}]});
  }
  for(const zc of [-3.5,-0.5,2.5])addSpot({zone:'restroom',x:-27.4,z:zc,y:0,face:-Math.PI/2,pose:'stall',via:[{x:-25.2,z:zc}]});
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
    this.anim={phase:0,speed:0,run:false,air:false,pose:'stand',t:Math.random()*10,celebrate:0,startle:0,poke:0,give:0,wave:0};
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
  }
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
    if(this.kind!=='me'){if(this.hopV!==0||this.hopY>0){this.hopV-=22*dt;this.hopY+=this.hopV*dt;if(this.hopY<=0){this.hopY=0;this.hopV=0;}}this.root.position.y=this.baseY+this.hopY;a.air=this.hopY>0.02;}
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

/* ---------- NPC brains ---------- */
const NPC_WEIGHTS=[['desks',0.5],['pantry',0.22],['lake',0.18],['restroom',0.1]];
const NPC_DUR={desks:[25,60],pantry:[12,26],lake:[15,34],restroom:[6,12]};
const npcs=[];
function routeFromTo(a,b){
  const pts=[];
  if(a){for(let i=a.via.length-1;i>=0;i--)pts.push(a.via[i]);}
  const za=a?ZONES[a.zone]:null,zb=ZONES[b.zone];
  if(!a||a.zone!==b.zone){if(za)pts.push(za.inside,za.gate,...ringPath(za.spoke,zb.spoke));pts.push(zb.gate,zb.inside);}
  else pts.push(zb.inside);
  for(const p of b.via)pts.push(p);
  pts.push({x:b.x,z:b.z});return pts;
}
function freeSpot(zone,exclude){const list=SPOTS.filter(s=>s.zone===zone&&!s.occ&&s!==exclude&&!(s.desk&&s.reserved));return list.length?pick(list):null;}
function placeAt(ch,spot){
  ch.root.position.set(spot.x,0,spot.z);ch.heading=spot.face;ch.root.rotation.y=spot.face;
  ch.anim.pose=spot.pose==='stall'?'stand':spot.pose;ch.anim.speed=0;
  ch.baseY=spot.pose==='sit'?spot.y-HIP:0;ch.root.position.y=ch.baseY;
  const hide=spot.pose==='stall';ch.root.visible=!hide;ch.hiddenInStall=hide;
}
function npcPickNext(n){
  const from=n.spot;let to=null;
  // after a stall visit, wash hands
  if(from&&from.pose==='stall')to=SPOTS.find(s=>s.zone==='restroom'&&s.pose==='wash'&&!s.occ)||null;
  if(!to){
    let zone='desks';const r=Math.random();let acc=0;for(const [z,w] of NPC_WEIGHTS){acc+=w;if(r<=acc){zone=z;break;}}
    if(zone==='desks'&&n.home&&n.home!==from&&!n.home.occ)to=n.home;
    if(!to)to=freeSpot(zone,from);
  }
  if(!to||to===from){n.timer=rand(5,12);return;}
  if(from)from.occ=null;to.occ=n.id;
  n.route=routeFromTo(from,to);n.wp=0;n.target=to;n.spot=null;n.state='walk';
  n.speed=Math.random()<0.12?4.2:rand(1.9,2.4);
  const ch=n.ch;ch.anim.pose='stand';ch.baseY=0;ch.root.visible=true;ch.hiddenInStall=false;
}
function npcArrive(n){const s=n.target;n.spot=s;n.state='idle';placeAt(n.ch,s);const d=NPC_DUR[s.zone]||[10,20];n.timer=rand(d[0],d[1]);}
function npcThink(n,dt){
  const ch=n.ch;
  if(n.pauseT>0){n.pauseT-=dt;ch.anim.speed=0;return;}
  if(n.state==='walk'){
    const wp=n.route[n.wp],p=ch.root.position;const dx=wp.x-p.x,dz=wp.z-p.z,d=Math.hypot(dx,dz),step=n.speed*dt;
    if(d<=step){p.x=wp.x;p.z=wp.z;n.wp++;if(n.wp>=n.route.length){npcArrive(n);return;}}
    else{p.x+=dx/d*step;p.z+=dz/d*step;ch.heading=Math.atan2(dx,dz);}
    ch.anim.speed=n.speed;ch.anim.run=n.speed>3;
  }else{ch.anim.speed=0;ch.anim.run=false;n.timer-=dt;if(n.timer<=0)npcPickNext(n);}
}

/* ---------- people registry ---------- */
const allPeople=()=>[...state.chars.values()];
function spawnNPCs(){
  const desks=SPOTS.filter(s=>s.desk);
  NPC_SEEDS.forEach((s,i)=>{
    const w=WORLD.npc[s.id]||(WORLD.npc[s.id]={received:s.rc,given:null,recent:[],goldenAt:null});
    const data={id:s.id,name:s.name,role:s.role,team:s.team,status:s.status,avatar:arrToAvatar(s.av),get received(){return w.received;},set received(v){w.received=v;},get given(){return w.given;},set given(v){w.given=v;},get recent(){return w.recent;},set recent(v){w.recent=v;},get goldenAt(){return w.goldenAt;},set goldenAt(v){w.goldenAt=v;}};
    const ch=new Character({id:'npc:'+s.id,kind:'npc',data});
    state.chars.set(ch.id,ch);
    const home=desks[(i*5+2)%desks.length];home.reserved=true;
    const n={ch,home,spot:null,target:null,route:[],wp:0,state:'idle',timer:rand(3,26),speed:2,pauseT:0,id:s.id};
    let start=home;
    if(Math.random()<0.4){const z=pick(['pantry','lake','restroom']);const fs=freeSpot(z);if(fs&&fs.pose!=='stall')start=fs;}
    start.occ=s.id;n.spot=start;placeAt(ch,start);npcs.push(n);ch.npc=n;
  });
}
spawnNPCs();

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
  if(P.seat){if(moving||jumpQueued){standUp();}else{jumpQueued=false;P.anim.speed=0;return;}}
  const run=keys.has('shift')||joy.run;
  const fx=-Math.sin(cam.yaw),fz=-Math.cos(cam.yaw),rx=Math.cos(cam.yaw),rz=-Math.sin(cam.yaw);
  let mx=rx*ix+fx*(-iz),mz=rz*ix+fz*(-iz);const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  const inWater=cellTop(p.x,p.z)<-0.5&&p.y<-0.4;
  const spd=(run?5.6:3.0)*(inWater?0.55:1);
  const dx=mx*spd*dt,dz=mz*spd*dt;
  if(dx&&!blocked(p.x+dx,p.z,p.y))p.x+=dx;
  if(dz&&!blocked(p.x,p.z+dz,p.y))p.z+=dz;
  if(moving)P.heading=Math.atan2(mx,mz);
  if(jumpQueued&&P.onGround){P.vy=inWater?5.4:7.0;P.onGround=false;}
  jumpQueued=false;
  P.vy-=22*dt;p.y+=P.vy*dt;const g=supportY(p.x,p.z);
  if(p.y<=g){if(!P.onGround&&g<-0.5&&P.vy<-3)burst(p.x,-0.2,p.z,14,['#d7eefc','#8fd0f5','#ffffff'],2,0.08);p.y=g;P.vy=0;P.onGround=true;}else if(p.y-g>0.05)P.onGround=false;
  P.anim.speed=moving?spd*Math.min(1,len):0;P.anim.run=run&&moving;P.anim.air=!P.onGround;P.anim.pose='stand';
}
function blocked(x,z,y){const r=0.28;for(const o of [[-r,-r],[r,-r],[-r,r],[r,r]]){if(cellTop(x+o[0],z+o[1])>y+0.55)return true;}return false;}
function supportY(x,z){const r=0.2;let m=-99;for(const o of [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]])m=Math.max(m,cellTop(x+o[0],z+o[1]));return m;}
function nearestSeat(){const p=state.player.root.position;let best=null,bd=1.9;for(const s of SPOTS){if(s.pose!=='sit'||s.occ)continue;const d=Math.hypot(s.x-p.x,s.z-p.z);if(d<bd){bd=d;best=s;}}return best;}
function sitOn(s){const P=state.player;s.occ='me';P.seat=s;placeAt(P,s);P.vy=0;P.onGround=true;P.say('Comfy.',1200);}
function standUp(){const P=state.player,s=P.seat;if(!s)return;s.occ=null;P.seat=null;const a=s.approach||{x:s.x,z:s.z+1};P.root.position.set(a.x,0,a.z);P.baseY=0;P.anim.pose='stand';P.root.visible=true;}
function tryInteract(){
  if(state.mode!=='world'||state.modal)return;const P=state.player;if(!P)return;
  if(P.seat){standUp();return;}
  if(P.root.position.distanceTo(BOARD_POS)<3.2){openBoard();return;}
  const s=nearestSeat();if(s)sitOn(s);
}
addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(state.modal)closeModal();else if(state.selected)closeCard();return;}
  if(isTyping()||state.mode!=='world'||state.modal)return;
  const k=e.key.toLowerCase();
  if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();
  keys.add(k);
  if(k===' '&&!e.repeat)jumpQueued=true;
  if(k==='e'&&!e.repeat)tryInteract();
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
  if(lastClick.id===ch.id&&now-lastClick.t<400){lastClick={id:null,t:0};if(ch!==state.player)doPoke(state.player,ch,POKES[state.pokeMsg]);else{ch.anim.wave=1.2;}}
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
$('#tUse').addEventListener('click',tryInteract);
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
function persistData(ch){
  if(ch.kind==='npc')saveWorld();
  else{USERS[ch.data.email]=ch.data;saveUsers();if(ch.kind==='me')state.cookieOK=writeProfileCookie(ch.data);}
}
function pushFeed(item){WORLD.feed.unshift(item);WORLD.feed=WORLD.feed.slice(0,40);saveWorld();renderFeed();}
function pushInbox(ch,item){if(ch.kind==='npc')return;ch.data.inbox=[Object.assign({at:Date.now(),read:false},item),...(ch.data.inbox||[])].slice(0,50);}
function giveApples(from,to,count,reason,note){
  const left=budgetLeft(from.data);if(count<1||count>left||from===to)return false;
  spendBudget(from.data,count);
  const before=to.data.received||0;to.data.received=before+count;
  const became=!isGolden(before)&&isGolden(to.data.received);if(became)to.data.goldenAt=Date.now();
  to.data.recent=[{from:from.data.name,count,reason,note:note||'',at:Date.now()},...(to.data.recent||[])].slice(0,6);
  pushInbox(to,{type:'apple',from:from.data.name,fromId:from.id,count,reason,note:note||''});
  persistData(from);persistData(to);
  pushFeed({kind:'apple',from:from.data.name,to:to.data.name,count,reason,at:Date.now()});
  if(became)pushFeed({kind:'golden',to:to.data.name,at:Date.now()+1});
  animateGift(from,to,count,became);
  drawBoard();renderMe();
  if(state.selected===to||state.selected===from)renderCard();
  if(state.modal==='board')openBoard();
  return{became};
}
function animateGift(from,to,count,became){
  const vis=from.root.visible&&to.root.visible&&from.root.position.distanceTo(to.root.position)<48;
  if(from.npc&&from.npc.state!=='walk'&&from.anim.pose!=='sit')from.faceTo(to.root.position.x,to.root.position.z);
  if(from===state.player&&!from.seat)from.faceTo(to.root.position.x,to.root.position.z);
  from.anim.give=0.55;
  const finish=()=>{
    const hp=headPos(to);burst(hp.x,hp.y,hp.z,18,['#e0442e','#ff8f6e','#f2b632','#6cbf4c'],2.6,0.1);
    to.anim.celebrate=1.3;to.hop(5.2);
    to.refresh();
    if(to.kind==='npc'){to.say(pick(THANKS).replace('{n}',from.data.name.split(' ')[0]),2600);if(to.npc){to.npc.pauseT=Math.max(to.npc.pauseT,1.6);}}
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
function doPoke(from,to,msg){
  if(!from||!to||from===to)return;
  const key=from.id+'>'+to.id,now=performance.now();if(now-(pokeCooldown.get(key)||0)<2500){if(from===state.player)toast('Give '+esc(to.data.name.split(' ')[0])+' a second before poking again.','',1800);return;}
  pokeCooldown.set(key,now);
  if(from===state.player&&!from.seat)from.faceTo(to.root.position.x,to.root.position.z);
  from.anim.poke=0.45;
  const arrive=()=>{
    const p=to.root.position;ringWave(p.x,p.y,p.z,0x6fb7e8);const hp=headPos(to);burst(hp.x,hp.y,hp.z,10,['#6fb7e8','#d7eefc','#ffffff'],2,0.08);
    to.anim.startle=0.8;to.hop(4.2);to.say('!',700,'alert');
    setTimeout(()=>to.say(from.data.name.split(' ')[0]+': '+msg,3000),650);
    if(to.kind==='npc')npcReact(to,from,msg);
    else if(to.kind==='local'){pushInbox(to,{type:'poke',from:from.data.name,fromId:from.id,msg});persistData(to);}
    else if(to===state.player){pushInbox(to,{type:'poke',from:from.data.name,fromId:from.id,msg});persistData(to);renderMe();toast('<b>'+esc(from.data.name)+'</b> poked you: '+esc(msg),'',3600,ICON_POKE);}
  };
  const vis=from.root.visible&&to.root.visible&&from.root.position.distanceTo(to.root.position)<48;
  if(!vis){arrive();}else{const o=new THREE.Mesh(UNIT_BOX,new THREE.MeshBasicMaterial({color:0x6fb7e8}));o.scale.setScalar(0.16);const d=from.root.position.distanceTo(to.root.position);fly(o,()=>handPos(from),()=>headPos(to),clamp(0.35+d*0.03,0.4,0.9),0.6+d*0.04,()=>{o.material.dispose();arrive();},'#6fb7e8');}
  if(from===state.player)toast('You poked <b>'+esc(to.data.name)+'</b>: '+esc(msg),'',2200,ICON_POKE);
}
function npcReact(ch,from,msg){
  const n=ch.npc;if(n){n.pauseT=Math.max(n.pauseT,3.2);}
  if(ch.anim.pose!=='sit'&&!ch.hiddenInStall)ch.faceTo(from.root.position.x,from.root.position.z);
  setTimeout(()=>{ch.anim.wave=1.4;ch.say((pick(REPLIES[msg]||['Hi!'])).replace('{n}',from.data.name.split(' ')[0]),2800);},1700);
  if(from===state.player&&Math.random()<0.3)setTimeout(()=>{if(state.player&&state.mode==='world')doPoke(ch,state.player,pick(POKES));},6500);
}

/* ambient demo life */
const ambient={npcGift:rand(25,40),toMe:30,pokeMe:rand(110,170)};
function updateAmbient(dt){
  if(state.mode!=='world')return;
  ambient.npcGift-=dt;ambient.toMe-=dt;ambient.pokeMe-=dt;
  const npcChars=npcs.map(n=>n.ch).filter(c=>c.root.visible);
  if(ambient.npcGift<=0){ambient.npcGift=rand(60,110);const givers=npcChars.filter(c=>budgetLeft(c.data)>0);if(givers.length>1){const a=pick(givers);const b=pick(npcChars.filter(c=>c!==a));const r=pick(REASONS);giveApples(a,b,Math.random()<0.2?2:1,r,pick(NOTES[r]));}}
  if(ambient.toMe<=0&&state.player){ambient.toMe=rand(100,180);const givers=npcChars.filter(c=>budgetLeft(c.data)>0);if(givers.length){const a=pick(givers),r=pick(REASONS),note=pick(NOTES[r]);giveApples(a,state.player,1,r,note);toast('<b>'+esc(a.data.name)+'</b> gave you an apple · '+esc(r),'',4200,ICON_APPLE);}}
  if(ambient.pokeMe<=0&&state.player){ambient.pokeMe=rand(140,240);const a=pick(npcChars);if(a)doPoke(a,state.player,pick(POKES));}
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
function renderZone(){if(!state.player)return;const p=state.player.root.position;const z=zoneAt(p.x,p.z);if(z!==lastZone){lastZone=z;$('#mapZone').textContent=z;$('#meSub').textContent=[state.me.role,z].filter(Boolean).join(' · ');}}
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
  const kindChip=ch.kind==='npc'?'<span class="chip">Demo coworker</span>':ch.kind==='local'?'<span class="chip">Away · same browser</span>':'<span class="chip">This is you</span>';
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
  on('cEdit',()=>openSetup('edit'));on('cWave',()=>{state.player.anim.wave=1.4;});
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
    if(ch.kind==='local')toast(esc(d.name.split(' ')[0])+' will see this in their inbox next time they log in on this browser.','',3600);
    renderCard();
  });
}
$('#cardClose').addEventListener('click',closeCard);

/* ---------- modals ---------- */
const modal=$('#modal'),modalBody=$('#modalBody');
function showModal(name,html){state.modal=name;keys.clear();modalBody.innerHTML=html;modal.hidden=false;setTimeout(()=>{const f=$('#modalClose');if(f)f.focus();},10);}
function closeModal(){state.modal=null;modal.hidden=true;cvs.focus({preventScroll:true});}
$('#modalClose').addEventListener('click',closeModal);
modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
function openBoard(){
  const people=allPeople();const golden=people.filter(c=>c.golden).sort((a,b)=>a.data.name.localeCompare(b.data.name));
  const items=WORLD.feed.slice(0,14);
  showModal('board','<h2 id="modalTitle">Orchard Board</h2>'
    +'<p class="fine">Recognition from around the office. There is no ranking here: anyone who receives more than '+GOLDEN_AFTER+' apples in total joins the Golden Apples.</p>'
    +'<section style="display:grid;gap:10px"><h3>Golden Apples ('+golden.length+')</h3>'+(golden.length?'<div class="golden-grid">'+golden.map(c=>'<div class="gcard"><img class="head" src="'+c.headUrl+'" alt=""><div style="min-width:0"><div class="nm">'+esc(c.data.name)+'</div><div class="rl">'+plural(c.data.received,'apple')+(c.kind==='npc'?' · demo':'')+'</div></div></div>').join('')+'</div>':'<p class="empty">Nobody yet.</p>')+'</section>'
    +'<section style="display:grid;gap:10px"><h3>Recent apples</h3><ol class="list">'+items.map(f=>f.kind==='golden'?'<li style="border-left-color:var(--gold)"><b>'+esc(f.to)+'</b> became a Golden Apple<div class="meta">'+timeAgo(f.at)+'</div></li>':'<li><b>'+esc(f.from)+'</b> gave <b>'+esc(f.to)+'</b> '+plural(f.count,'apple')+' · '+esc(f.reason)+'<div class="meta">'+timeAgo(f.at)+'</div></li>').join('')+'</ol></section>'
    +'<section style="display:grid;gap:6px"><h3>How it works</h3><p class="fine">Everyone can give up to '+DAILY_APPLES+' apples a day. Pick a reason and add a note so the thanks is specific. The red apples on the plaza tree are today’s gifts; the gold ones are Golden Apple members.</p></section>');
}
function openInbox(){
  const me=state.me;const items=me.inbox||[];
  showModal('inbox','<h2 id="modalTitle">Inbox</h2>'+(items.length?'<ol class="list">'+items.map((it,i)=>it.type==='apple'
    ?'<li><b>'+esc(it.from)+'</b> gave you '+plural(it.count,'apple')+' · '+esc(it.reason)+(it.note?'<q>'+esc(it.note)+'</q>':'')+'<div class="meta">'+timeAgo(it.at)+(it.read?'':' · new')+'</div></li>'
    :'<li class="poke"><b>'+esc(it.from)+'</b> poked you: '+esc(it.msg)+'<div class="meta">'+timeAgo(it.at)+(it.read?'':' · new')+'</div>'+(state.chars.get(it.fromId)?'<button class="btn sm" style="margin-top:6px" data-pokeback="'+i+'" type="button">Poke back</button>':'')+'</li>').join('')+'</ol>':'<p class="empty">Nothing yet. Apples and pokes you receive will show up here.</p>'));
  modalBody.querySelectorAll('[data-pokeback]').forEach(b=>b.addEventListener('click',()=>{const it=items[+b.dataset.pokeback];const t=state.chars.get(it.fromId);if(t){closeModal();doPoke(state.player,t,POKES[state.pokeMsg]);}}));
  items.forEach(i=>i.read=true);persistData(state.player);renderMe();
}
function openMenu(confirmDelete){
  const me=state.me;
  showModal('menu','<h2 id="modalTitle">Menu</h2>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Signed in as</span><div style="font-size:15px;word-break:break-all">'+esc(me.email)+'</div><p class="fine">Only you see your email. Coworkers see your name, role and team.</p></div>'
    +'<div style="display:grid;gap:6px"><span class="lbl">Where your profile is saved</span>'
    +'<div class="storage-row"><span>Cookie</span><span class="'+(state.cookieOK?'ok':'bad')+'">'+(state.cookieOK?'Saved':'Blocked by browser')+'</span></div>'
    +'<div class="storage-row"><span>Local storage</span><span class="'+(Store.ok?'ok':'bad')+'">'+(Store.ok?'Saved':'Blocked by browser')+'</span></div>'
    +'<p class="fine">'+(state.cookieOK?'Next time you open this page on this browser, you’ll be logged straight back in.':Store.ok?'This browser blocks cookies in embedded pages, so your profile is kept in local storage instead. You’ll still be remembered here.':'This browser blocks both, so your profile lasts only until you close the page.')+'</p></div>'
    +'<div class="menu-actions"><button class="btn" id="mEdit" type="button">Edit profile &amp; avatar</button><button class="btn" id="mLogout" type="button">Log out</button><button class="btn" id="mReset" type="button">Reset demo coworkers</button></div>'
    +(confirmDelete?'<div style="display:grid;gap:8px;padding:12px;border:2px solid var(--apple)"><p style="margin:0">Delete your profile, apples and inbox from this browser? This can’t be undone.</p><div class="menu-actions"><button class="btn btn-apple" id="mDelYes" type="button">Yes, delete my profile</button><button class="btn" id="mDelNo" type="button">Keep it</button></div></div>':'<button class="btn btn-ghost" id="mDel" type="button" style="justify-self:start">Delete my profile</button>'));
  const on=(id,fn)=>{const el=$('#'+id,modalBody);if(el)el.addEventListener('click',fn);};
  on('mEdit',()=>{closeModal();openSetup('edit');});on('mLogout',logout);
  on('mReset',()=>{const fresh=seedWorld();for(const id in fresh.npc){if(WORLD.npc[id])Object.assign(WORLD.npc[id],fresh.npc[id]);}WORLD.feed=fresh.feed;saveWorld();
    for(const n of npcs)n.ch.refresh();drawBoard();renderFeed();if(state.selected)renderCard();closeModal();toast('Demo coworkers reset to their starting apples.','',2600);});
  on('mDel',()=>openMenu(true));on('mDelNo',()=>openMenu(false));
  on('mDelYes',()=>{const email=me.email;delete USERS[email];saveUsers();Cookies.del(profileCookieName(email));Cookies.del('ga_session');Store.del('ga_last');closeModal();leaveWorld();toast('Your profile was deleted from this browser.','',3200);});
}
$('#bBoard').addEventListener('click',openBoard);$('#bInbox').addEventListener('click',openInbox);$('#bEdit').addEventListener('click',()=>openSetup('edit'));$('#bMenu').addEventListener('click',()=>openMenu(false));

/* ---------- hint ---------- */
let hintTimer=null;
function scheduleHintHide(){if(hintTimer||state.hintHidden)return;hintTimer=setTimeout(()=>{$('#hint').hidden=true;},9000);}
$('#hintClose').addEventListener('click',()=>{$('#hint').hidden=true;state.hintHidden=true;Store.set('ga_hint_hidden',true);});
if(coarse){$('#hint').innerHTML='<span>Joystick to walk</span><span>Tap a coworker</span><span>Double-tap to poke</span><span>Drag to look</span><button class="x" id="hintClose2" type="button" aria-label="Hide controls">×</button>';$('#hintClose2').addEventListener('click',()=>{$('#hint').hidden=true;state.hintHidden=true;Store.set('ga_hint_hidden',true);});}

/* =========================================================
   Login, setup, session
   ========================================================= */
const loginForm=$('#loginForm'),emailIn=$('#email'),emailErr=$('#emailErr');
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function returningUser(){const email=Cookies.get('ga_session')||Store.get('ga_last',null);return email?findUser(email):null;}
function showLogin(){
  state.mode='login';applyViewOffset();
  $('#screen-login').hidden=false;$('#screen-setup').hidden=true;$('#hud').hidden=true;
  const rec=returningUser();const ret=$('#returning');
  if(rec){ret.hidden=false;$('#retName').textContent=rec.name;$('#retMail').textContent=rec.email;$('#retHead').src=headIcon(paintSkin(rec.avatar),56);loginForm.hidden=true;}
  else{ret.hidden=true;loginForm.hidden=false;}
}
$('#retEnter').addEventListener('click',()=>{const rec=returningUser();if(rec){startSession(rec);enterWorld(rec);}});
$('#retSwitch').addEventListener('click',()=>{$('#returning').hidden=true;loginForm.hidden=false;emailIn.value='';emailIn.focus();});
loginForm.addEventListener('submit',e=>{
  e.preventDefault();const email=emailIn.value.trim().toLowerCase();
  if(!EMAIL_RE.test(email)){emailErr.textContent='Enter a valid email, like name@company.com.';emailIn.focus();return;}
  emailErr.textContent='';
  const rec=findUser(email);
  if(rec){startSession(rec);enterWorld(rec);toast('Welcome back, <b>'+esc(rec.name)+'</b>. This email already has a profile, so we logged you in.','',3600);}
  else openSetup('create',email);
});
emailIn.addEventListener('input',()=>{emailErr.textContent='';});
function startSession(rec){const a=Cookies.set('ga_session',rec.email,30);const b=writeProfileCookie(rec);state.cookieOK=a&&b;Store.set('ga_last',rec.email);}

/* setup screen */
const avControls=$('#avControls');
function openSetup(mode,email){
  const editing=mode==='edit';const me=state.me;
  state.setup={mode,email:editing?me.email:email,av:editing?Object.assign({},me.avatar):randomAvatar(),returnTo:state.mode};
  if(state.selected)closeCard();if(state.modal)closeModal();
  state.mode='setup';applyViewOffset();
  $('#screen-login').hidden=true;$('#hud').hidden=true;$('#screen-setup').hidden=false;
  $('#setupTitle').textContent=editing?'Edit your profile':'Set up your profile';
  $('#setupSub').innerHTML=editing?'Signed in as <b>'+esc(me.email)+'</b>':'Creating a profile for <b>'+esc(email)+'</b>';
  $('#setupSave').textContent=editing?'Save changes':'Enter workspace';$('#setupBack').textContent=editing?'Cancel':'Back';
  $('#pName').value=editing?me.name:'';$('#pRole').value=editing?(me.role||''):'';$('#pTeam').value=editing?(me.team||''):'';$('#pStatus').value=editing?(me.status||'available'):'available';
  $('#pNameErr').textContent='';$('#setupErr').textContent='';
  buildAvControls();updatePreview();updatePvTag();
  setTimeout(()=>$('#pName').focus(),30);
}
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
    if(findUser(s.email)){$('#setupErr').textContent='A profile with this email already exists. Go back and log in with it instead.';return;}
    const rec={email:s.email,name,role,team,status,avatar:Object.assign({},s.av),received:0,createdAt:Date.now(),given:null,recent:[],inbox:[]};
    USERS[rec.email]=rec;saveUsers();startSession(rec);state.setup=null;enterWorld(rec);
    toast('Welcome to Golden Apple, <b>'+esc(name)+'</b>. You have '+DAILY_APPLES+' apples to give today.','',4200,ICON_APPLE);
  }else{
    const me=state.me;Object.assign(me,{name,role,team,status,avatar:Object.assign({},s.av)});putUser(me);
    state.player.setAvatar(me.avatar);state.setup=null;$('#screen-setup').hidden=true;resumeWorld();renderMe();lastZone='';
    toast('Profile saved.','',2000);
  }
});

/* avatar preview (second renderer) */
const pv={renderer:null,scene:null,camera:null,av:null,rot:0.5,spin:0,drag:null,t:0};
function ensurePreview(){
  if(pv.renderer)return;
  pv.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});pv.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  $('#previewMount').appendChild(pv.renderer.domElement);
  pv.scene=new THREE.Scene();pv.scene.add(new THREE.HemisphereLight(0xfff6e6,0x3a2a1a,0.95));const dl=new THREE.DirectionalLight(0xffffff,0.6);dl.position.set(2,4,3);pv.scene.add(dl);
  const ped=new THREE.Mesh(blockGeo('grassTop','grassSide','dirt'),atlasMat);ped.scale.set(1.3,0.5,1.3);ped.position.y=-0.25;pv.scene.add(ped);
  pv.camera=new THREE.PerspectiveCamera(32,1,0.1,50);pv.camera.position.set(0,1.35,5.2);pv.camera.lookAt(0,0.92,0);
  const m=$('#previewMount');
  m.addEventListener('pointerdown',e=>{pv.drag={x:e.clientX};try{m.setPointerCapture(e.pointerId);}catch(_){}});
  m.addEventListener('pointermove',e=>{if(!pv.drag)return;pv.rot+=(e.clientX-pv.drag.x)*0.012;pv.drag.x=e.clientX;});
  m.addEventListener('pointerup',()=>{pv.drag=null;});m.addEventListener('pointercancel',()=>{pv.drag=null;});
}
function updatePreview(){ensurePreview();if(pv.av){pv.scene.remove(pv.av.root);pv.av.disposables.forEach(d=>d.dispose());}pv.av=buildAvatar(state.setup.av);pv.scene.add(pv.av.root);}
function renderPreview(dt){
  const m=$('#previewMount');const w=m.clientWidth,h=m.clientHeight;if(!w||!h)return;
  const c=pv.renderer.domElement;if(c.width!==Math.round(w*pv.renderer.getPixelRatio())||c.height!==Math.round(h*pv.renderer.getPixelRatio())){pv.renderer.setSize(w,h,false);pv.camera.aspect=w/h;pv.camera.updateProjectionMatrix();}
  pv.t+=dt;if(pv.spin>0){const s=Math.min(pv.spin,dt*9);pv.spin-=s;pv.rot+=s;}else if(!pv.drag&&!reduceMotion)pv.rot+=dt*0.35;
  const A=pv.av;A.root.rotation.y=pv.rot;A.armR.rotation.z=-0.06-Math.sin(pv.t*1.6)*0.04;A.armL.rotation.z=0.06+Math.sin(pv.t*1.6)*0.04;A.headPivot.rotation.y=Math.sin(pv.t*0.6)*0.2;
  pv.renderer.render(pv.scene,pv.camera);
}

/* world entry / exit */
const locals=[];
function enterWorld(rec){
  state.me=rec;
  if(state.player)state.player.dispose(),state.chars.delete(state.player.id);
  const P=new Character({id:'me',kind:'me',data:rec});state.player=P;state.chars.set('me',P);
  P.root.position.set(SPAWN.x,0,SPAWN.z);P.heading=Math.PI;P.root.rotation.y=Math.PI;
  cam.yaw=0;cam.pitch=0.55;cam.dist=10.5;cam.target.set(SPAWN.x,1.3,SPAWN.z);
  // other profiles from this browser appear as "Away" at their desks
  for(const l of locals.splice(0)){l.dispose();state.chars.delete(l.id);if(l.spot)l.spot.occ=null;}
  const free=SPOTS.filter(s=>s.desk&&!s.reserved&&!s.occ);let i=0;
  for(const email in USERS){if(email===rec.email)continue;const u=USERS[email];const s=free[i++];if(!s)break;
    const ch=new Character({id:'local:'+email,kind:'local',data:u});state.chars.set(ch.id,ch);s.occ=ch.id;ch.spot=s;placeAt(ch,s);locals.push(ch);}
  resumeWorld();renderMe();renderFeed();drawBoard();lastZone='';
  const unread=(rec.inbox||[]).filter(x=>!x.read);
  if(unread.length){const ap=unread.filter(x=>x.type==='apple').reduce((a,x)=>a+x.count,0),pk=unread.filter(x=>x.type==='poke').length;
    setTimeout(()=>toast('While you were away: '+[ap?plural(ap,'apple'):'',pk?plural(pk,'poke'):''].filter(Boolean).join(' and ')+'. Open your inbox to read them.','gold',5200,ap?ICON_APPLE:ICON_POKE),900);}
  setTimeout(()=>{if(state.player)state.player.say('Hi, I’m '+rec.name.split(' ')[0]+'!',2400);},500);
}
function resumeWorld(){state.mode='world';applyViewOffset();$('#screen-login').hidden=true;$('#screen-setup').hidden=true;$('#hud').hidden=false;$('#hint').hidden=state.hintHidden;cvs.focus({preventScroll:true});}
function leaveWorld(){
  closeCard();if(state.player){if(state.player.seat)state.player.seat.occ=null;state.player.dispose();state.chars.delete('me');state.player=null;}
  for(const l of locals.splice(0)){l.dispose();state.chars.delete(l.id);if(l.spot)l.spot.occ=null;}
  state.me=null;keys.clear();showLogin();
}
function logout(){Cookies.del('ga_session');Store.del('ga_last');closeModal();leaveWorld();emailIn.value='';toast('Logged out. Your profile is still saved on this browser.','',3000);}

/* =========================================================
   Main loop
   ========================================================= */
let last=performance.now(),frameN=0,uiT=0;
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;frameN++;
  if(state.mode==='world')updatePlayer(dt);
  for(const n of npcs)npcThink(n,dt);
  for(const ch of state.chars.values())ch.update(dt);
  updateParticles(dt);updateFlyers(dt);updateRings(dt);updateAmbient(dt);
  waterTex.offset.x+=dt*0.015;waterTex.offset.y+=dt*0.008;
  for(const c of clouds){c.position.x+=c.userData.v*dt;if(c.position.x>100)c.position.x=-100;}
  for(const d of ducks){const u=d.userData;u.a+=dt*u.s;d.position.set(u.cx+Math.sin(u.a)*u.r,-0.2+Math.sin(u.a*6)*0.02,u.cz+Math.cos(u.a)*u.r*0.6);d.rotation.y=u.a+Math.PI/2;}
  if(state.selected){const s=state.selected,p=s.root.position;
    const gy=s.anim.pose==='sit'?0:(s.kind==='me'?supportY(p.x,p.z):p.y-s.hopY);
    selRing.visible=s.root.visible;selRing.position.set(p.x,gy+0.04,p.z);selRing.rotation.z+=dt*0.8;}else selRing.visible=false;
  updateCamera(dt);
  renderer.render(scene,camera);
  updateLabels();
  if(state.mode==='world'){
    if(frameN%3===0)drawMinimap();
    uiT+=dt;if(uiT>0.4){uiT=0;renderZone();
      if(state.selected){const z=$('#cardZone');if(z)z.textContent=state.selected.hiddenInStall?'In the Restroom':'At '+zoneAt(state.selected.root.position.x,state.selected.root.position.z);}
      const P=state.player,pr=$('#prompt');let msg='';
      const kh=coarse?'Tap <span class="key">Use</span>':'Press <span class="key">E</span>';
      if(P&&!state.modal){if(P.seat)msg=kh+' or move to stand up';else if(P.root.position.distanceTo(BOARD_POS)<3.2)msg=kh+' to read the Orchard Board';else if(nearestSeat())msg=kh+' to sit';}
      pr.hidden=!msg;if(msg&&pr.innerHTML!==msg)pr.innerHTML=msg;
    }
  }
  if(state.mode==='setup'&&pv.renderer)renderPreview(dt);
  requestAnimationFrame(frame);
}
setInterval(()=>{if(state.mode==='world'){renderFeed();renderMe();}},20000);

/* boot */
resize();drawBoard();showLogin();
if(document.fonts&&document.fonts.load){Promise.all([document.fonts.load('600 34px "Pixelify Sans"'),document.fonts.load('700 46px "Pixelify Sans"')]).then(()=>{SIGN_DRAWERS.forEach(f=>f());drawBoard();}).catch(()=>{});}
requestAnimationFrame(frame);
})();
