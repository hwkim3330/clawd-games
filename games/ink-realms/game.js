// Ink Realms — a tiny online-RPG-style adventure in a paper diorama. Clawds are painted cut-outs standing in a 3D
// world (Three.js); take quests in the village, level up, and bring down the Great Eraser in the ruins.
//
//   WASD / arrows move (relative to the camera) · right-drag or Q/E turn the camera · wheel zoom · Space jump
//   Tab (or click) target · 1–4 abilities · F talk / loot · L quest log
//   touch: joystick · tap an enemy or NPC to target · ability buttons

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const { PAL, TAU, clamp, lerp, backOut, mix, rgba, boil, jit, hash } = INK;
const $ = (id) => document.getElementById(id);
const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
const L = (ko, en) => (KO ? ko : en);

/* ------------------------------------------------------------ classes */
const CLASS = {
  knight: { name: L('잉크 기사', 'Ink Knight'), hat: 'band', hp: 180, mp: 100, dmg: 12, range: 2.4, as: 1.6, res: L('기력', 'Grit'),
    abilities: [
      { name: L('베기', 'Slash'), cd: 0, cost: 0, gcd: true, range: 2.6, dmg: 1.3, desc: L('강한 일격', 'A heavy strike') },
      { name: L('회전 베기', 'Whirl'), cd: 8, cost: 30, gcd: true, aoe: 3.2, dmg: 1.1, desc: L('주변 모두 공격', 'Hit everything nearby') },
      { name: L('방패 올리기', 'Shield up'), cd: 20, cost: 20, self: true, shield: 60, desc: L('보호막', 'A shield') },
      { name: L('돌진', 'Charge'), cd: 12, cost: 15, range: 14, dash: true, dmg: 0.8, stun: 1.2, desc: L('대상에게 돌진 · 기절', 'Rush the target, stun') },
    ] },
  mage: { name: L('잉크 마법사', 'Ink Mage'), hat: 'wizard', hp: 130, mp: 160, dmg: 9, range: 11, as: 1.8, ranged: true, res: L('잉크', 'Ink'),
    abilities: [
      { name: L('잉크 화살', 'Ink bolt'), cd: 0, cost: 10, gcd: true, range: 14, dmg: 1.6, bolt: true, desc: L('기본 공격 주문', 'Your main spell') },
      { name: L('얼룩 폭발', 'Blot burst'), cd: 9, cost: 35, gcd: true, range: 14, aoe: 3.5, dmg: 1.4, targetAoe: true, desc: L('대상 주변 폭발', 'Explodes around the target') },
      { name: L('얼음 잉크', 'Frost ink'), cd: 14, cost: 25, gcd: true, range: 14, dmg: 0.7, slow: 4, bolt: true, desc: L('느리게 만든다', 'Slows the target') },
      { name: L('치유 물방울', 'Mending drop'), cd: 18, cost: 40, self: true, heal: 0.4, desc: L('체력 회복', 'Heal yourself') },
    ] },
};

/* ------------------------------------------------------------ world */
const WORLD = 180, HALF = WORLD / 2;
function heightAt(x, z) {
  // gentle rolling paper hills, a flat village, a bowl for the ruins
  let h = Math.sin(x * 0.06) * 1.6 + Math.cos(z * 0.05) * 1.4 + Math.sin((x + z) * 0.11) * 0.6;
  const dv = Math.hypot(x - VILLAGE.x, z - VILLAGE.z); if (dv < 22) h *= clamp((dv - 12) / 10, 0, 1);
  const dr = Math.hypot(x - RUINS.x, z - RUINS.z); if (dr < 24) h = lerp(-1.2, h, clamp((dr - 14) / 10, 0, 1));
  const edge = Math.max(Math.abs(x), Math.abs(z)); if (edge > HALF - 14) h += (edge - (HALF - 14)) * 0.9;
  return h;
}
const VILLAGE = { x: -40, z: 40 }, WOOD = { x: 35, z: 30 }, MEADOW = { x: -30, z: -20 }, RUINS = { x: 45, z: -45 };
function zoneAt(x, z) {
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 22) return L('클로 마을', 'Clawd Village');
  if (Math.hypot(x - RUINS.x, z - RUINS.z) < 28) return L('지우개 폐허', 'Eraser Ruins');
  if (Math.hypot(x - WOOD.x, z - WOOD.z) < 34) return L('어둑한 숲', 'Dim Wood');
  return L('종이 들판', 'Paper Meadow');
}

/* ------------------------------------------------------------ quests */
const QUESTS = [
  { id: 'q1', giver: 'elder', title: L('들판의 얼룩', 'Blots in the Meadow'), text: L('들판에 잉크 얼룩이 번지고 있네. 얼룩 6마리를 치워 주겠나?', 'Ink blots are spreading over the meadow. Clear 6 of them?'), goal: { kill: 'blot', n: 6 }, xp: 120, reward: 20, done: L('고맙네! 이제 좀 살 것 같군.', 'Thank you! That feels better already.') },
  { id: 'q2', giver: 'elder', title: L('나방 날개', 'Moth Wings'), text: L('어둑한 숲의 종이 나방 날개로 약을 만들 수 있어. 날개 5장을 모아 오게.', 'We can brew medicine from paper-moth wings in the Dim Wood. Bring 5.'), goal: { loot: 'wing', n: 5 }, xp: 180, reward: 30, needs: 'q1', done: L('훌륭해, 이걸로 약을 만들지.', 'Splendid, this will make fine medicine.') },
  { id: 'q3', giver: 'guard', title: L('종이 기사단장', 'The Paper Captain'), text: L('숲 깊은 곳에 종이 기사단장이 진을 쳤어. 물리쳐 줘.', 'A Paper Captain has camped deep in the wood. Take him down.'), goal: { kill: 'captain', n: 1 }, xp: 260, reward: 45, needs: 'q2', done: L('대단해! 이제 폐허로 가는 길이 열렸어.', 'Brilliant! The road to the ruins is open.') },
  { id: 'q4', giver: 'guard', title: L('지우개 대마왕', 'The Great Eraser'), text: L('폐허의 지우개 대마왕이 세상을 지우고 있어. 막아 줘, 영웅!', 'The Great Eraser in the ruins is rubbing out the world. Stop it, hero!'), goal: { kill: 'eraser', n: 1 }, xp: 600, reward: 100, needs: 'q3', done: L('네가 세상을 지켰어! 영원히 기억할게.', 'You saved the world! We will remember you.') },
];
const NPCS = [
  { id: 'elder', name: L('촌장 클로', 'Elder Clawd'), x: VILLAGE.x + 3, z: VILLAGE.z - 2, hat: 'top', col: '#E0A0B4' },
  { id: 'guard', name: L('경비대장', 'Guard Captain'), x: VILLAGE.x - 5, z: VILLAGE.z + 4, hat: 'hard', col: '#8EC3E6' },
  { id: 'shop', name: L('잉크 상인', 'Ink Merchant'), x: VILLAGE.x + 7, z: VILLAGE.z + 6, hat: 'fedora', col: '#E8AA38' },
];
const MOB = {
  blot:    { name: L('잉크 얼룩', 'Ink Blot'), lvl: 1, hp: 40, dmg: 5, sp: 3.2, range: 1.6, col: '#3b2f4a', size: 1.1, xp: 22 },
  moth:    { name: L('종이 나방', 'Paper Moth'), lvl: 3, hp: 55, dmg: 7, sp: 4, range: 1.8, col: '#D9C7A8', size: 1.2, xp: 32, loot: 'wing', fly: true },
  knight:  { name: L('종이 기사', 'Paper Knight'), lvl: 4, hp: 90, dmg: 10, sp: 3.4, range: 2, col: '#E9E2D4', size: 1.4, xp: 45 },
  captain: { name: L('종이 기사단장', 'Paper Captain'), lvl: 5, hp: 260, dmg: 16, sp: 3.6, range: 2.4, col: '#E9E2D4', size: 2, xp: 140, elite: true },
  spider:  { name: L('잉크 거미', 'Ink Spider'), lvl: 6, hp: 110, dmg: 13, sp: 4.4, range: 1.8, col: '#2b2233', size: 1.3, xp: 55 },
  eraser:  { name: L('지우개 대마왕', 'The Great Eraser'), lvl: 8, hp: 1400, dmg: 26, sp: 3, range: 3.6, col: '#E98AA0', size: 4.2, xp: 800, boss: true },
};
const SPAWNS = [
  ...Array.from({ length: 10 }, (_, i) => ['blot', MEADOW.x + Math.cos(i * 2.3) * (6 + (i % 4) * 5), MEADOW.z + Math.sin(i * 2.3) * (6 + (i % 4) * 5)]),
  ...Array.from({ length: 8 }, (_, i) => ['moth', WOOD.x - 10 + Math.cos(i * 1.9) * (6 + (i % 3) * 6), WOOD.z + Math.sin(i * 1.9) * (6 + (i % 3) * 5)]),
  ...Array.from({ length: 5 }, (_, i) => ['knight', WOOD.x + 10 + Math.cos(i * 1.3) * 7, WOOD.z - 5 + Math.sin(i * 1.3) * 7]),
  ['captain', WOOD.x + 16, WOOD.z - 12],
  ...Array.from({ length: 6 }, (_, i) => ['spider', RUINS.x - 18 + Math.cos(i * 1.1) * 9, RUINS.z + 16 + Math.sin(i * 1.1) * 7]),
  ['eraser', RUINS.x, RUINS.z],
];

/* ------------------------------------------------------------ three */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
const scene = new THREE.Scene();
const PAPER = new THREE.Color('#EFE6D4');
scene.background = PAPER; scene.fog = new THREE.Fog(PAPER, 40, 110);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xfff6e8, 0xa89880, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-30, 60, 20); scene.add(sun);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ground: vertex-coloured hills with a paper texture multiplied in
function buildGround() {
  const seg = 120, geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = [];
  const grass = new THREE.Color('#B7D3A0'), dark = new THREE.Color('#8FB38A'), path = new THREE.Color('#E3C99B'), ruin = new THREE.Color('#C9BBA6'), village = new THREE.Color('#D9CBA6');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, heightAt(x, z));
    let c = grass.clone();
    if (Math.hypot(x - WOOD.x, z - WOOD.z) < 34) c = dark.clone();
    if (Math.hypot(x - RUINS.x, z - RUINS.z) < 26) c = ruin.clone();
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 16) c = village.clone();
    // a winding path village → meadow → wood → ruins
    const onPath = [[VILLAGE, MEADOW], [VILLAGE, WOOD], [WOOD, RUINS]].some(([a, b]) => segDist(x, z, a.x, a.z, b.x, b.z) < 2.4 + Math.sin(x * 0.3) * 0.5);
    if (onPath) c = path.clone();
    c.offsetHSL(0, 0, (hash(i) - 0.5) * 0.03);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const paperTex = new THREE.CanvasTexture(INK.paper(512, 512, 5)); paperTex.wrapS = paperTex.wrapT = THREE.RepeatWrapping; paperTex.repeat.set(18, 18); paperTex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: paperTex }));
  scene.add(mesh);
  // water pond
  const water = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshLambertMaterial({ color: '#8EC3E6', transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.set(-8, heightAt(-8, 20) + 0.25, 20); scene.add(water);
}
function segDist(px, pz, ax, az, bx, bz) { const vx = bx - ax, vz = bz - az, l = vx * vx + vz * vz; const k = clamp(((px - ax) * vx + (pz - az) * vz) / l); return Math.hypot(px - ax - vx * k, pz - az - vz * k); }

// painted cut-outs for scenery
const TREE_TEX = [0, 1, 2].map((v) => canvasTex(256, 320, (g) => {
  boil(v, 70 + v); g.translate(0, 0);
  INK.blob(g, INK.rectPts(112, 190, 32, 120, 2), { wash: '#8C6A4A', ink: PAL.ink, sw: 5, smooth: false });
  INK.blob(g, INK.lumpPts(128, 130, 105, 12 + v, 14, 0.16, 3), { wash: ['#5E9C58', '#6FAE5E', '#4F8A50'][v], ink: PAL.ink, sw: 6, pool: [95, 95, 60], poolCol: '#D8F0C8' });
}));
const PINE_TEX = canvasTex(200, 340, (g) => { boil(0, 88); INK.blob(g, INK.rectPts(90, 260, 20, 70, 1.5), { wash: '#6E5A4A', ink: PAL.ink, sw: 4, smooth: false }); for (let i = 0; i < 3; i++) INK.blob(g, [[100, 20 + i * 70], [180 - i * 8, 170 + i * 50], [20 + i * 8, 170 + i * 50]], { wash: ['#3F7A56', '#467F58', '#4E8A5E'][i], ink: PAL.ink, sw: 5, smooth: false }); });
const ROCK_TEX = canvasTex(200, 160, (g) => { boil(0, 99); INK.blob(g, INK.lumpPts(100, 90, 70, 9, 11, 0.2, 2), { wash: '#B5AEA3', ink: PAL.ink, sw: 5, pool: [80, 70, 40] }); });
const PILLAR_TEX = canvasTex(160, 360, (g) => { boil(0, 101); INK.blob(g, INK.rectPts(40, 40, 80, 300, 3), { wash: '#C9BBA6', ink: PAL.ink, sw: 6, smooth: false, pool: [70, 100, 50] }); INK.inkLine(g, [[60, 120], [90, 160], [70, 220]], 3); INK.blob(g, INK.rectPts(28, 20, 104, 30, 2), { wash: '#B8A68A', ink: PAL.ink, sw: 5, smooth: false }); });
function cutout(tex, x, z, w, h) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.3, fog: true }));
  m.scale.set(w, h, 1); m.center.set(0.5, 0.02); m.position.set(x, heightAt(x, z), z); scene.add(m); return m;
}
function buildScenery() {
  let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = (r() - 0.5) * (WORLD - 10), z = (r() - 0.5) * (WORLD - 10);
    if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 20 || Math.hypot(x - RUINS.x, z - RUINS.z) < 22) continue;
    if ([[VILLAGE, MEADOW], [VILLAGE, WOOD], [WOOD, RUINS]].some(([a, b]) => segDist(x, z, a.x, a.z, b.x, b.z) < 5)) continue;
    if (Math.hypot(x - MEADOW.x, z - MEADOW.z) < 18 && r() < 0.8) continue;
    const inWood = Math.hypot(x - WOOD.x, z - WOOD.z) < 34;
    if (!inWood && r() < 0.45) continue;
    if (inWood && r() < 0.5) cutout(PINE_TEX, x, z, 3.4 + r(), 5.8 + r() * 1.5);
    else cutout(TREE_TEX[i % 3], x, z, 4 + r() * 1.5, 5 + r() * 1.5);
  }
  for (let i = 0; i < 40; i++) { const x = (r() - 0.5) * (WORLD - 20), z = (r() - 0.5) * (WORLD - 20); if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 20) continue; cutout(ROCK_TEX, x, z, 2 + r(), 1.6 + r() * 0.6); }
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, x = RUINS.x + Math.cos(a) * 17, z = RUINS.z + Math.sin(a) * 17; if (i % 3 !== 1) cutout(PILLAR_TEX, x, z, 2.2, 5 + (i % 2) * 1.5); }
  // village houses: little paper boxes
  const wall = canvasTex(256, 256, (g) => { g.fillStyle = '#F0E4CF'; g.fillRect(0, 0, 256, 256); boil(0, 3); INK.blob(g, INK.rectPts(96, 130, 64, 126, 2), { wash: '#8C6A4A', ink: PAL.ink, sw: 5, smooth: false }); INK.blob(g, INK.rectPts(30, 60, 50, 44, 1), { wash: '#8EC3E6', ink: PAL.ink, sw: 4, smooth: false }); INK.blob(g, INK.rectPts(176, 60, 50, 44, 1), { wash: '#8EC3E6', ink: PAL.ink, sw: 4, smooth: false }); INK.inkLine(g, INK.rectPts(3, 3, 250, 250, 1), 6, PAL.ink, true); });
  const roofCols = ['#D97757', '#7B5CA8', '#3A9C98', '#E8AA38'];
  [[-6, -6, 0.3], [6, -8, -0.4], [-10, 8, 1.2], [9, 2, -1.3], [0, 12, 0]].forEach(([dx, dz, rot], i) => {
    const x = VILLAGE.x + dx, z = VILLAGE.z + dz, y = heightAt(x, z);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), [wall, wall, new THREE.MeshLambertMaterial({ color: '#F0E4CF' }), new THREE.MeshLambertMaterial({ color: '#F0E4CF' }), wall, wall].map((m) => (m.isTexture ? new THREE.MeshLambertMaterial({ map: m }) : m)));
    body.position.y = 1.5; g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 2.4, 4), new THREE.MeshLambertMaterial({ color: roofCols[i % 4], flatShading: true }));
    roof.position.y = 4.2; roof.rotation.y = Math.PI / 4; g.add(roof);
    g.position.set(x, y, z); g.rotation.y = rot; scene.add(g);
    houses.push({ x, z, r: 3 });
  });
  // a well in the square
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.3, 1, 16, 1, true), new THREE.MeshLambertMaterial({ color: '#B5AEA3', side: THREE.DoubleSide }));
  well.position.set(VILLAGE.x, heightAt(VILLAGE.x, VILLAGE.z) + 0.5, VILLAGE.z); scene.add(well);
}
const houses = [];

/* ------------------------------------------------------------ sprites in 3D */
// Every baked sprite frame becomes a texture once; a sprite just swaps which texture it shows.
const texCache = new Map();
function frameTex(key, i) {
  const id = key + '#' + i; let tx = texCache.get(id);
  if (!tx) { const fr = ClawdSprites.sheets[key]; if (!fr) return null; tx = new THREE.CanvasTexture(fr[i % fr.length]); tx.colorSpace = THREE.SRGBColorSpace; texCache.set(id, tx); }
  return tx;
}
function makeActorSprite(size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: 0.2, fog: true }));
  s.center.set(0.5, 0.18); s.scale.set(size * 2, size * 2, 1); scene.add(s); return s;
}
function setActorFrame(spr, key, t, flip) {
  const fr = ClawdSprites.sheets[key]; if (!fr) return;
  const tx = frameTex(key, Math.floor(t * 12));
  if (spr.material.map !== tx) { spr.material.map = tx; spr.material.needsUpdate = true; }
  spr.scale.x = Math.abs(spr.scale.x) * (flip ? -1 : 1);
}
// painted mobs: a few boiled frames per kind
const MOB_TEX = {};
function paintMob(kind, f) {
  return canvasTex(256, 256, (g) => {
    boil(f / 12, kind.length * 13 + f);
    const K = MOB[kind], cx = 128, cy = 150;
    const eyes = (x, y, s, angry) => { for (const sd of [-1, 1]) { g.fillStyle = PAL.cream; g.beginPath(); g.ellipse(x + sd * s * 1.2, y, s * 0.8, s, 0, 0, TAU); g.fill(); g.fillStyle = PAL.ink; g.beginPath(); g.arc(x + sd * s * 1.2, y + s * 0.2, s * 0.4, 0, TAU); g.fill(); if (angry) INK.inkLine(g, [[x + sd * s * 2, y - s * 1.3], [x + sd * s * 0.3, y - s * 0.8]], 5); } };
    if (kind === 'moth') { const fl = Math.sin(f * 1.6); for (const sd of [-1, 1]) INK.blob(g, INK.ellPts(cx + sd * 50, cy - 20, 50, 32 + fl * 10, 12, 2, sd * 0.4), { wash: K.col, ink: PAL.ink, sw: 5 }); INK.blob(g, INK.ellPts(cx, cy, 16, 36, 10), { wash: '#6E5A4A', ink: PAL.ink, sw: 5 }); eyes(cx, cy - 20, 7); return; }
    if (kind === 'knight' || kind === 'captain') { INK.blob(g, INK.rectPts(cx - 40, cy - 70, 80, 110, 2), { wash: K.col, ink: PAL.ink, sw: 6, smooth: false }); for (let i = 0; i < 3; i++) INK.inkLine(g, [[cx - 40, cy - 40 + i * 30], [cx + 40, cy - 40 + i * 30]], 2, rgba(PAL.ink, 0.4)); INK.blob(g, [[cx - 24, cy - 70], [cx, cy - 110], [cx + 24, cy - 70]], { wash: kind === 'captain' ? '#F2C53D' : PAL.red, ink: PAL.ink, sw: 5, smooth: false }); INK.blob(g, INK.rectPts(cx + 44, cy - 90, 12, 110, 1), { wash: '#B5AEA3', ink: PAL.ink, sw: 4, smooth: false }); eyes(cx, cy - 40, 10, kind === 'captain'); for (const lx of [-20, 20]) INK.inkLine(g, [[cx + lx, cy + 40], [cx + lx + Math.sin(f) * 8, cy + 70]], 8); return; }
    if (kind === 'spider') { for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) INK.inkLine(g, [[cx, cy - 10], [cx + sd * (50 + i * 10), cy - 40 + i * 10 + Math.sin(f + i) * 6], [cx + sd * (70 + i * 12), cy + 40]], 6); INK.blob(g, INK.lumpPts(cx, cy - 20, 44, 5, 12, 0.12, 1), { wash: K.col, ink: PAL.ink, sw: 5, pool: [cx - 14, cy - 36, 20], poolCol: '#6E6A8A' }); eyes(cx, cy - 26, 8, true); return; }
    if (kind === 'eraser') { const w = 190, h = 130; INK.blob(g, INK.rectPts(cx - w / 2, cy - h + 40, w, h, 3), { wash: K.col, ink: PAL.ink, sw: 7, smooth: false, pool: [cx - 50, cy - 70, 50] }); INK.blob(g, INK.rectPts(cx - w / 2, cy - h + 40, w * 0.42, h, 3), { wash: PAL.indigo, ink: PAL.ink, sw: 6, smooth: false }); INK.text(g, 'ERASE', cx - w * 0.29, cy - 25, 28, PAL.cream, { font: '"Permanent Marker"', rot: -Math.PI / 2, shadow: false }); eyes(cx + 30, cy - 50, 12, true); INK.inkLine(g, [[cx + 10, cy - 5], [cx + 35, cy - 16], [cx + 60, cy - 5]], 6); return; }
    INK.blob(g, INK.lumpPts(cx, cy - 20, 60, 3, 13, 0.18, 1.5), { wash: K.col, ink: PAL.ink, sw: 6, pool: [cx - 20, cy - 40, 28], poolCol: '#b9a7d6' }); eyes(cx, cy - 30, 11); for (const lx of [-20, 20]) INK.inkLine(g, [[cx + lx, cy + 30], [cx + lx + Math.sin(f + lx) * 8, cy + 50]], 8);
  });
}

/* ------------------------------------------------------------ state */
const S = { cls: 'knight', level: 1, xp: 0, hp: 180, max: 180, mp: 100, maxmp: 100, drops: 0, quests: {}, inv: { wing: 0 }, deaths: 0 };
let player = null, mobs = [], npcs = [], target = null, t = 0, mode = 'loading', gcd = 0, cds = [0, 0, 0, 0], fx = [], logLines = [], floats = [];
const xpNeed = (lv) => 100 + lv * 80;
function statMul() { return 1 + (S.level - 1) * 0.14; }

function spawnMob(kind, x, z) {
  const K = MOB[kind];
  if (!MOB_TEX[kind]) MOB_TEX[kind] = [0, 1, 2, 3].map((f) => paintMob(kind, f));
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: MOB_TEX[kind][0], transparent: true, alphaTest: 0.2, fog: true }));
  spr.center.set(0.5, 0.1); spr.scale.set(K.size * 3, K.size * 3, 1); scene.add(spr);
  const m = { kind, x, z, y: heightAt(x, z), hx: x, hz: z, hp: K.hp, max: K.hp, spr, state: 'idle', cd: 0, wander: 0, hitT: -9, dead: false, respawnT: 0, slowT: 0, stunT: 0, id: Math.random() * 1e6 | 0 };
  mobs.push(m); return m;
}
function makeNPC(n) {
  const spr = makeActorSprite(1.4);
  const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 96, (g) => INK.text(g, '!', 32, 48, 80, PAL.ochre, { font: '"Permanent Marker"' })), transparent: true }));
  mark.scale.set(0.9, 1.35, 1); scene.add(mark);
  const o = { ...n, y: heightAt(n.x, n.z), spr, mark };
  npcs.push(o); return o;
}

/* ------------------------------------------------------------ input */
const I = GameInput.create({ buttons: [], touch: false });
const keys = new Set();
addEventListener('keydown', (e) => {
  if (mode !== 'play') return;
  keys.add(e.code);
  if (/^Digit[1-4]$/.test(e.code)) useAbility(+e.code.slice(5) - 1);
  if (e.code === 'Tab') { e.preventDefault(); tabTarget(); }
  if (e.code === 'KeyF') interact();
  if (e.code === 'KeyL') $('questlog').hidden = !$('questlog').hidden;
  if (e.code === 'Escape') { if (!$('dialog').hidden) closeDialog(); else target = null; }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
let camYaw = 0.6, camPitch = 0.5, camDist = 14, dragging = null;
const cvs = $('game');
cvs.addEventListener('contextmenu', (e) => e.preventDefault());
cvs.addEventListener('pointerdown', (e) => {
  if (mode !== 'play') return; SFX.unlock();
  dragging = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, button: e.button, touch: e.pointerType === 'touch' };
  if (!(e.pointerType === 'touch' && e.clientX < innerWidth * 0.45)) cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', (e) => {
  if (!dragging || dragging.id !== e.pointerId) return;
  const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) dragging.moved = true;
  if (dragging.button === 2 || dragging.button === 0 && dragging.moved && (!dragging.touch || e.clientX > innerWidth * 0.45)) { camYaw -= dx * 0.006; camPitch = clamp(camPitch + dy * 0.004, 0.15, 1.2); }
  dragging.x = e.clientX; dragging.y = e.clientY;
});
cvs.addEventListener('pointerup', (e) => {
  if (dragging && !dragging.moved && dragging.id === e.pointerId) pick(e.clientX, e.clientY);
  dragging = null;
});
cvs.addEventListener('wheel', (e) => { e.preventDefault(); camDist = clamp(camDist * Math.exp(e.deltaY * 0.001), 6, 26); }, { passive: false });
const ray = new THREE.Raycaster();
function pick(sx, sy) {
  ray.setFromCamera(new THREE.Vector2(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1), camera);
  const all = mobs.filter((m) => !m.dead).map((m) => m.spr).concat(npcs.map((n) => n.spr));
  const hit = ray.intersectObjects(all)[0];
  if (!hit) return;
  const m = mobs.find((q) => q.spr === hit.object); if (m) { target = m; SFX.play('click'); return; }
  const n = npcs.find((q) => q.spr === hit.object); if (n) { target = n; interact(); }
}
function tabTarget() {
  const list = mobs.filter((m) => !m.dead && dist2(m, player) < 30 * 30).sort((a, b) => dist2(a, player) - dist2(b, player));
  if (!list.length) return;
  const i = list.indexOf(target); target = list[(i + 1) % list.length]; SFX.play('click');
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const dist = (a, b) => Math.sqrt(dist2(a, b));

/* ------------------------------------------------------------ combat */
function useAbility(i) {
  const C = CLASS[S.cls], A = C.abilities[i];
  if (!player || S.hp <= 0 || cds[i] > 0 || (A.gcd && gcd > 0)) return;
  if (S.mp < A.cost) { log(L('자원이 부족합니다', 'Not enough') + ` ${C.res}`, '#8EC3E6'); SFX.play('fizzle'); return; }
  if (!A.self && (!target || target.dead || !target.kind || !MOB[target.kind])) { tabTarget(); if (!target || !MOB[target?.kind]) { log(L('대상이 없습니다', 'No target'), '#ccc'); return; } }
  if (!A.self && dist(player, target) > (A.range || C.range) + MOB[target.kind].size * 0.5) { log(L('너무 멉니다', 'Out of range'), '#ccc'); SFX.play('fizzle'); return; }
  S.mp -= A.cost; cds[i] = A.cd; if (A.gcd) gcd = 1.2; player.castT = t;
  const base = C.dmg * statMul();
  if (A.self) {
    if (A.shield) { player.shield = A.shield * statMul(); log(`${A.name}!`, '#fff'); SFX.play('shield'); }
    if (A.heal) { const h = Math.round(S.max * A.heal); S.hp = Math.min(S.max, S.hp + h); float(`+${h}`, player, '#6FB35E'); SFX.play('heal'); }
    return;
  }
  if (A.dash) { player.dash = { tx: target.x, tz: target.z, t0: t }; }
  if (A.bolt) { fx.push({ kind: 'bolt', x: player.x, y: player.y + 1.4, z: player.z, tgt: target, dmg: base * A.dmg, slow: A.slow, sp: 26, mesh: boltMesh(A.slow ? '#8EC3E6' : '#2F3C7A') }); SFX.play('zap'); return; }
  if (A.aoe) {
    const cx = A.targetAoe ? target.x : player.x, cz = A.targetAoe ? target.z : player.z;
    for (const m of mobs) if (!m.dead && Math.hypot(m.x - cx, m.z - cz) < A.aoe) hitMob(m, base * A.dmg);
    fx.push({ kind: 'ring', x: cx, z: cz, r: A.aoe, t0: t, mesh: ringMesh(A.targetAoe ? '#2F3C7A' : '#ffffff', A.aoe) }); SFX.play(A.targetAoe ? 'boom' : 'slash'); return;
  }
  hitMob(target, base * A.dmg, A.stun); SFX.play('slash');
}
function boltMesh(col) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: col })); scene.add(m); return m; }
function ringMesh(col, r) { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; scene.add(m); return m; }
function hitMob(m, dmg, stun) {
  if (m.dead) return;
  dmg = Math.round(dmg * (0.85 + Math.random() * 0.3));
  const crit = Math.random() < 0.12; if (crit) dmg = Math.round(dmg * 1.8);
  m.hp -= dmg; m.hitT = t; m.state = 'fight'; if (stun) m.stunT = t + stun;
  float(crit ? `${dmg}!` : `${dmg}`, m, crit ? PAL.ochre : '#fff');
  if (m.hp <= 0) killMob(m);
}
function killMob(m) {
  const K = MOB[m.kind];
  m.dead = true; m.respawnT = t + (K.boss ? 1e9 : K.elite ? 60 : 22); m.spr.visible = false;
  SFX.play(K.boss ? 'win' : 'splat');
  const xp = Math.round(K.xp * clamp(1 + (K.lvl - S.level) * 0.15, 0.3, 1.6)); gainXP(xp);
  log(`${K.name} ${L('처치', 'defeated')} · +${xp} XP`, '#F2C53D');
  const drops = K.boss ? 60 : 1 + Math.floor(Math.random() * (K.lvl + 1)); S.drops += drops;
  for (const q of activeQuests()) {
    if (q.goal.kill === m.kind) { S.quests[q.id].n++; log(`${q.title}: ${S.quests[q.id].n}/${q.goal.n}`, '#9FE39F'); }
    if (q.goal.loot && K.loot === q.goal.loot && Math.random() < 0.7 && S.quests[q.id].n < q.goal.n) { S.quests[q.id].n++; log(`${L('날개', 'Wing')} ${S.quests[q.id].n}/${q.goal.n}`, '#9FE39F'); SFX.play('coin'); }
  }
  if (target === m) target = null;
  updateTracker();
  if (K.boss) setTimeout(() => { log(L('지우개 대마왕이 쓰러졌다! 마을로 돌아가 보고하자.', 'The Great Eraser falls! Return to the village.'), '#F2C53D'); }, 500);
}
function gainXP(n) {
  if (S.level >= 10) return;
  S.xp += n;
  while (S.xp >= xpNeed(S.level) && S.level < 10) {
    S.xp -= xpNeed(S.level); S.level++;
    const C = CLASS[S.cls]; S.max = Math.round(C.hp * statMul()); S.hp = S.max; S.maxmp = Math.round(C.mp * statMul()); S.mp = S.maxmp;
    log(`${L('레벨 업!', 'Level up!')} ${S.level}`, '#F2C53D'); float(L('레벨 업!', 'LEVEL UP!'), player, PAL.ochre, true); SFX.play('win');
  }
}
function hurtPlayer(dmg, src) {
  if (player.shield > 0) { const s = Math.min(player.shield, dmg); player.shield -= s; dmg -= s; }
  if (dmg <= 0) return;
  S.hp -= dmg; player.hitT = t; float(`-${Math.round(dmg)}`, player, '#FF8080'); SFX.play('hit');
  if (S.hp <= 0) { S.hp = 0; die(); }
}
function die() {
  S.deaths++; log(L('쓰러졌습니다… 마을에서 되살아납니다.', 'You fell… reviving in the village.'), '#FF8080'); SFX.play('lose');
  mode = 'dead'; $('deadmsg').hidden = false;
  setTimeout(() => { player.x = VILLAGE.x; player.z = VILLAGE.z - 6; S.hp = Math.round(S.max * 0.6); S.mp = S.maxmp; target = null; for (const m of mobs) if (m.state === 'fight') { m.state = 'return'; } mode = 'play'; $('deadmsg').hidden = true; }, 3000);
}

/* ------------------------------------------------------------ quests & talk */
const activeQuests = () => QUESTS.filter((q) => S.quests[q.id] && !S.quests[q.id].turnedIn);
function questFor(npcId) {
  for (const q of QUESTS) {
    if (q.giver !== npcId) continue;
    const st = S.quests[q.id];
    if (st && !st.turnedIn) return { q, st };
    if (!st && (!q.needs || S.quests[q.needs]?.turnedIn)) return { q, st: null };
  }
  return null;
}
function interact() {
  const n = npcs.find((o) => dist(o, player) < 4) || (target && npcs.includes(target) && dist(target, player) < 6 ? target : null);
  if (!n) return;
  target = n;
  if (n.id === 'shop') { dialog(n.name, L(`잉크 방울 ${S.drops}개를 가졌구먼. 30개에 체력 물약 하나야.`, `You have ${S.drops} ink drops. A health tonic is 30.`), S.drops >= 30 ? [[L('물약 사기 (+50% 체력)', 'Buy tonic (+50% health)'), () => { S.drops -= 30; S.hp = Math.min(S.max, S.hp + S.max * 0.5); SFX.play('heal'); closeDialog(); }]] : []); return; }
  const qs = questFor(n.id);
  if (!qs) { dialog(n.name, L('오늘도 좋은 하루야, 모험가.', 'Fine day for an adventure.')); return; }
  const { q, st } = qs;
  if (!st) dialog(n.name, q.text, [[L('수락', 'Accept'), () => { S.quests[q.id] = { n: q.goal.kill === 'captain' || q.goal.kill === 'eraser' ? 0 : 0 }; log(`${L('퀘스트 수락', 'Quest accepted')}: ${q.title}`, '#9FE39F'); SFX.play('card'); updateTracker(); closeDialog(); }]]);
  else if (st.n >= q.goal.n) dialog(n.name, q.done, [[L('보상 받기', 'Complete'), () => { st.turnedIn = true; gainXP(q.xp); S.drops += q.reward; log(`${L('퀘스트 완료', 'Quest complete')}: ${q.title} · +${q.xp} XP`, '#F2C53D'); SFX.play('win'); updateTracker(); closeDialog(); if (q.id === 'q4') setTimeout(victory, 800); }]]);
  else dialog(n.name, `${q.title} — ${st.n}/${q.goal.n}`);
}
function dialog(name, text, buttons = []) {
  $('dialog').hidden = false; $('dlg-name').textContent = name; $('dlg-text').textContent = text;
  const row = $('dlg-buttons'); row.innerHTML = '';
  for (const [label, fn] of buttons) { const b = document.createElement('button'); b.className = 'big'; b.textContent = label; b.onclick = fn; row.append(b); }
  const b = document.createElement('button'); b.className = 'big alt'; b.textContent = L('닫기', 'Close'); b.onclick = closeDialog; row.append(b);
  SFX.play('click');
}
function closeDialog() { $('dialog').hidden = true; }
function updateTracker() {
  const el = $('tracker'), qs = activeQuests();
  el.innerHTML = qs.length ? qs.map((q) => { const st = S.quests[q.id], done = st.n >= q.goal.n; return `<div class="${done ? 'done' : ''}"><b>${q.title}</b>${done ? L('완료 — 돌아가 보고하세요', 'Done — return to turn in') : `${st.n}/${q.goal.n}`}</div>`; }).join('') : `<div><b>${L('할 일', 'To do')}</b>${L('마을 사람(!)에게 말을 걸어 보세요 (F)', 'Talk to a villager with a ! (F)')}</div>`;
  const ql = $('questlog');
  ql.innerHTML = `<h3>${L('퀘스트 기록', 'Quest log')}</h3>` + QUESTS.map((q) => { const st = S.quests[q.id]; return `<p class="${st?.turnedIn ? 'done' : st ? 'on' : ''}"><b>${q.title}</b> ${st?.turnedIn ? '✓' : st ? `${st.n}/${q.goal.n}` : '—'}</p>`; }).join('');
}
function log(s, col = '#fff') { logLines.push({ s, col }); if (logLines.length > 7) logLines.shift(); $('log').innerHTML = logLines.map((l) => `<div style="color:${l.col}">${l.s}</div>`).join(''); }
function float(s, e, col, big) { floats.push({ s, x: e.x, y: (e.y || 0) + (e.kind && MOB[e.kind] ? MOB[e.kind].size * 1.8 : 2.4), z: e.z, t0: t, col, big }); }

/* ------------------------------------------------------------ update */
function update(dt) {
  t += dt; gcd = Math.max(0, gcd - dt); for (let i = 0; i < 4; i++) cds[i] = Math.max(0, cds[i] - dt);
  const C = CLASS[S.cls];
  S.mp = Math.min(S.maxmp, S.mp + dt * (S.cls === 'mage' ? 4 : 6));
  const inCombat = mobs.some((m) => m.state === 'fight' && !m.dead);
  if (!inCombat) S.hp = Math.min(S.max, S.hp + dt * S.max * 0.02);
  // movement relative to the camera
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyQ')) camYaw += dt * 1.8; if (keys.has('KeyE')) camYaw -= dt * 1.8;
  const ax = I.axis(); mx += ax.x; mz += ax.y;
  const p = player;
  if (p.dash) {
    const dx = p.dash.tx - p.x, dz = p.dash.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 2 || t - p.dash.t0 > 0.6) p.dash = null; else { p.x += dx / d * 30 * dt; p.z += dz / d * 30 * dt; }
  } else if (mx || mz) {
    const len = Math.min(1, Math.hypot(mx, mz)), a = Math.atan2(mz, mx) + camYaw - Math.PI / 2, sp = 7.5 * len;
    const nx = p.x + Math.cos(a) * sp * dt, nz = p.z + Math.sin(a) * sp * dt;
    if (!houses.some((h) => Math.hypot(nx - h.x, nz - h.z) < h.r)) { p.x = clamp(nx, -HALF + 8, HALF - 8); p.z = clamp(nz, -HALF + 8, HALF - 8); }
    p.walkD += sp * dt / 1.2; p.moving = true;
    // face left/right as seen by the camera
    const sx = Math.cos(a) * Math.cos(camYaw) + Math.sin(a) * Math.sin(camYaw); if (Math.abs(sx) > 0.2) p.flip = sx < 0;
  } else p.moving = false;
  // jump
  if (keys.has('Space') && p.vy === 0 && p.yOff === 0) { p.vy = 9; SFX.play('jump'); }
  p.vy -= 26 * dt; p.yOff = Math.max(0, p.yOff + p.vy * dt); if (p.yOff === 0) p.vy = Math.max(0, p.vy);
  p.y = heightAt(p.x, p.z) + p.yOff;
  // auto-attack
  p.swing -= dt;
  if (target && MOB[target.kind] && !target.dead && dist(p, target) < C.range + MOB[target.kind].size * 0.5 && p.swing <= 0) {
    p.swing = C.as;
    if (C.ranged) fx.push({ kind: 'bolt', x: p.x, y: p.y + 1.4, z: p.z, tgt: target, dmg: C.dmg * statMul() * 0.7, sp: 22, mesh: boltMesh('#5A6BB0') });
    else { hitMob(target, C.dmg * statMul()); SFX.play('hit'); }
    p.castT = t;
  }
  // mobs
  for (const m of mobs) {
    const K = MOB[m.kind];
    if (m.dead) { if (t > m.respawnT) { m.dead = false; m.hp = m.max; m.x = m.hx; m.z = m.hz; m.state = 'idle'; m.spr.visible = true; } continue; }
    const d = dist(m, p), stunned = t < m.stunT, sp = K.sp * (t < m.slowT ? 0.5 : 1);
    if (m.state === 'idle') {
      m.wander -= dt;
      if (m.wander <= 0) { m.wander = 2 + Math.random() * 4; m.wx = m.hx + jit(6); m.wz = m.hz + jit(6); }
      if (m.wx != null) { const dx = m.wx - m.x, dz = m.wz - m.z, dd = Math.hypot(dx, dz); if (dd > 0.3) { m.x += dx / dd * sp * 0.3 * dt; m.z += dz / dd * sp * 0.3 * dt; } }
      const aggro = K.boss ? 14 : 7 + (K.lvl - S.level) * 1.5;
      if (d < Math.max(4, aggro) && S.hp > 0) { m.state = 'fight'; if (!target) target = m; }
    } else if (m.state === 'fight') {
      if (Math.hypot(m.x - m.hx, m.z - m.hz) > (K.boss ? 30 : 26) || S.hp <= 0) { m.state = 'return'; continue; }
      if (!stunned) {
        if (d > K.range + 0.6) { m.x += (p.x - m.x) / d * sp * dt; m.z += (p.z - m.z) / d * sp * dt; }
        else { m.cd -= dt; if (m.cd <= 0) { m.cd = K.boss ? 1.6 : 1.8; hurtPlayer(K.dmg * (0.85 + Math.random() * 0.3), m); m.attackT = t;
          if (K.boss && Math.random() < 0.35) { log(L('지우개 대마왕이 바닥을 지운다!', 'The Great Eraser rubs the ground!'), '#FFB0B0'); fx.push({ kind: 'slam', x: m.x, z: m.z, t0: t, r: 7, mesh: ringMesh('#E98AA0', 7) }); } } }
      }
    } else if (m.state === 'return') {
      const dx = m.hx - m.x, dz = m.hz - m.z, dd = Math.hypot(dx, dz);
      if (dd < 0.5) { m.state = 'idle'; m.hp = m.max; } else { m.x += dx / dd * sp * 1.6 * dt; m.z += dz / dd * sp * 1.6 * dt; m.hp = Math.min(m.max, m.hp + m.max * dt); }
    }
    m.y = heightAt(m.x, m.z) + (K.fly ? 1.2 + Math.sin(t * 3 + m.id) * 0.4 : 0);
  }
  // fx
  for (const f of fx) {
    if (f.kind === 'bolt') {
      if (f.tgt.dead) { f.done = true; continue; }
      const ty = f.tgt.y + MOB[f.tgt.kind].size * 0.8, dx = f.tgt.x - f.x, dy = ty - f.y, dz = f.tgt.z - f.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.6) { hitMob(f.tgt, f.dmg); if (f.slow) f.tgt.slowT = t + f.slow; f.done = true; }
      else { f.x += dx / d * f.sp * dt; f.y += dy / d * f.sp * dt; f.z += dz / d * f.sp * dt; f.mesh.position.set(f.x, f.y, f.z); }
    }
    if (f.kind === 'ring') { const k = (t - f.t0) / 0.4; f.mesh.position.set(f.x, heightAt(f.x, f.z) + 0.2, f.z); f.mesh.material.opacity = 0.6 * (1 - k); if (k >= 1) f.done = true; }
    if (f.kind === 'slam') { const k = (t - f.t0) / 1.0; f.mesh.position.set(f.x, heightAt(f.x, f.z) + 0.2, f.z); f.mesh.material.opacity = 0.2 + k * 0.5; if (k >= 1) { if (Math.hypot(p.x - f.x, p.z - f.z) < f.r) hurtPlayer(MOB.eraser.dmg * 1.4); SFX.play('boom'); f.done = true; } }
  }
  for (const f of fx) if (f.done && f.mesh) { scene.remove(f.mesh); f.mesh.geometry.dispose(); }
  fx = fx.filter((f) => !f.done);
  floats = floats.filter((f) => t - f.t0 < 1.2);
}

/* ------------------------------------------------------------ render */
const tmpV = new THREE.Vector3();
function render() {
  const p = player;
  // camera orbit
  const cx = p.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist, cz = p.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist;
  const cy = p.y + 2 + Math.sin(camPitch) * camDist;
  camera.position.set(cx, Math.max(cy, heightAt(cx, cz) + 1.5), cz); camera.lookAt(p.x, p.y + 1.8, p.z);
  // player sprite
  const C = CLASS[S.cls];
  const pk = `hero-${S.cls}` + (t - (p.castT || -9) < 0.25 ? '-atk' : p.moving ? '-walk' : '');
  setActorFrame(p.spr, pk, p.moving ? p.walkD : t, p.flip);
  p.spr.position.set(p.x, p.y, p.z); p.spr.material.opacity = t - (p.hitT || -9) < 0.1 ? 0.6 : 1;
  // npcs
  for (const n of npcs) {
    setActorFrame(n.spr, `npc-${n.id}`, t + n.x, n.x > p.x);
    n.spr.position.set(n.x, n.y, n.z);
    const qs = questFor(n.id); n.mark.visible = !!qs && (!qs.st || qs.st.n >= qs.q.goal.n);
    n.mark.material.color.set(qs?.st ? '#F2C53D' : '#ffffff');
    n.mark.position.set(n.x, n.y + 3.3 + Math.sin(t * 3) * 0.15, n.z);
  }
  // mobs
  for (const m of mobs) {
    if (m.dead) continue;
    const fr = MOB_TEX[m.kind][Math.floor(t * 8 + m.id) % 4];
    if (m.spr.material.map !== fr) { m.spr.material.map = fr; m.spr.material.needsUpdate = true; }
    m.spr.position.set(m.x, m.y, m.z);
    m.spr.material.color.set(t - m.hitT < 0.1 ? '#ffaaaa' : target === m ? '#ffffff' : '#f4f4f4');
  }
  renderer.render(scene, camera);
  // HTML overlays: nameplates over the target and floaters
  const plates = $('plates'); let html = '';
  const project = (x, y, z) => { tmpV.set(x, y, z).project(camera); return tmpV.z < 1 ? [(tmpV.x + 1) / 2 * innerWidth, (1 - tmpV.y) / 2 * innerHeight] : null; };
  for (const m of mobs) {
    if (m.dead || dist(m, p) > 28) continue;
    const K = MOB[m.kind], s = project(m.x, m.y + K.size * 2 + 0.3, m.z); if (!s) continue;
    const hostile = m.state === 'fight';
    html += `<div class="plate ${target === m ? 'sel' : ''} ${K.boss ? 'boss' : ''}" style="left:${s[0]}px;top:${s[1]}px"><span>${K.name} <i>${K.lvl}</i></span><b style="width:${m.hp / m.max * 100}%;background:${hostile ? '#D8394E' : '#E8AA38'}"></b></div>`;
  }
  for (const n of npcs) { const s = project(n.x, n.y + 2.6, n.z); if (s && dist(n, p) < 22) html += `<div class="plate npc" style="left:${s[0]}px;top:${s[1]}px"><span>${n.name}</span></div>`; }
  for (const f of floats) { const k = t - f.t0, s = project(f.x, f.y + k * 1.4, f.z); if (s) html += `<div class="float ${f.big ? 'big' : ''}" style="left:${s[0]}px;top:${s[1]}px;color:${f.col};opacity:${1 - clamp((k - 0.8) / 0.4)}">${f.s}</div>`; }
  plates.innerHTML = html;
  hud();
}
function hud() {
  const C = CLASS[S.cls];
  $('pf-hp').style.width = `${S.hp / S.max * 100}%`; $('pf-hp-t').textContent = `${Math.ceil(S.hp)} / ${S.max}`;
  $('pf-mp').style.width = `${S.mp / S.maxmp * 100}%`; $('pf-mp-t').textContent = `${Math.floor(S.mp)} ${C.res}`;
  $('pf-name').textContent = `${C.name} · Lv ${S.level}`;
  $('xpbar').style.width = `${S.level >= 10 ? 100 : S.xp / xpNeed(S.level) * 100}%`;
  $('drops').textContent = `◆ ${S.drops}`;
  const tf = $('tf');
  if (target && MOB[target.kind] && !target.dead) { tf.hidden = false; const K = MOB[target.kind]; $('tf-name').textContent = `${K.name} · Lv ${K.lvl}${K.elite ? ' ★' : K.boss ? ' ☠' : ''}`; $('tf-hp').style.width = `${target.hp / target.max * 100}%`; $('tf-hp-t').textContent = `${Math.max(0, Math.ceil(target.hp))} / ${target.max}`; }
  else tf.hidden = true;
  $('zone').textContent = zoneAt(player.x, player.z);
  [...$('bar').children].forEach((el, i) => { const A = C.abilities[i]; if (!A) return; const cd = Math.max(cds[i], A.gcd ? gcd : 0), total = cds[i] > 0 ? A.cd : 1.2; el.querySelector('i').style.height = `${cd > 0 ? cd / total * 100 : 0}%`; el.classList.toggle('nomana', S.mp < A.cost); });
  // minimap
  const mm = $('minimap'), g = mm.getContext('2d'), w = mm.width, s = w / WORLD;
  g.clearRect(0, 0, w, w); g.drawImage(minimapBase, 0, 0, w, w);
  for (const m of mobs) { if (m.dead) continue; g.fillStyle = MOB[m.kind].boss ? '#E98AA0' : m.state === 'fight' ? '#D8394E' : '#8a7'; g.fillRect((m.x + HALF) * s - 1.5, (m.z + HALF) * s - 1.5, 3, 3); }
  for (const n of npcs) { g.fillStyle = '#F2C53D'; g.fillRect((n.x + HALF) * s - 2, (n.z + HALF) * s - 2, 4, 4); }
  g.save(); g.translate((player.x + HALF) * s, (player.z + HALF) * s); g.rotate(-camYaw + Math.PI); g.fillStyle = PAL.clay; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 4); g.lineTo(-4, 4); g.fill(); g.restore();
}
let minimapBase;
function buildMinimap() {
  const c = document.createElement('canvas'); c.width = c.height = 180; const g = c.getContext('2d'), s = 180 / WORLD;
  g.fillStyle = '#B7D3A0'; g.fillRect(0, 0, 180, 180);
  g.fillStyle = '#8FB38A'; g.beginPath(); g.arc((WOOD.x + HALF) * s, (WOOD.z + HALF) * s, 34 * s, 0, TAU); g.fill();
  g.fillStyle = '#C9BBA6'; g.beginPath(); g.arc((RUINS.x + HALF) * s, (RUINS.z + HALF) * s, 26 * s, 0, TAU); g.fill();
  g.fillStyle = '#D9CBA6'; g.beginPath(); g.arc((VILLAGE.x + HALF) * s, (VILLAGE.z + HALF) * s, 16 * s, 0, TAU); g.fill();
  g.strokeStyle = '#E3C99B'; g.lineWidth = 4; for (const [a, b] of [[VILLAGE, MEADOW], [VILLAGE, WOOD], [WOOD, RUINS]]) { g.beginPath(); g.moveTo((a.x + HALF) * s, (a.z + HALF) * s); g.lineTo((b.x + HALF) * s, (b.z + HALF) * s); g.stroke(); }
  minimapBase = c;
}

/* ------------------------------------------------------------ loop */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  I.poll();
  if (mode === 'play' && $('dialog').hidden) update(dt); else if (mode === 'dead') t += dt;
  I.endFrame();
  if (player && (mode === 'play' || mode === 'dead' || mode === 'won')) render();
  for (const pc of document.querySelectorAll('.pick canvas')) { const g = pc.getContext('2d'); g.clearRect(0, 0, pc.width, pc.height); ClawdSprites.draw(g, `hero-${pc.dataset.cls}`, pc.width / 2, pc.height * 0.95, pc.width * 0.46, now / 1000); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ------------------------------------------------------------ flow */
function show(id) { for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id; document.body.classList.toggle('menu', !!id); }
function start(cls) {
  S.cls = cls; const C = CLASS[cls]; S.max = S.hp = C.hp; S.maxmp = S.mp = C.mp;
  player = { x: VILLAGE.x + 2, z: VILLAGE.z - 8, y: 0, yOff: 0, vy: 0, spr: makeActorSprite(1.5), walkD: 0, flip: false, swing: 0, shield: 0 };
  for (const n of NPCS) makeNPC(n);
  for (const [k, x, z] of SPAWNS) spawnMob(k, x, z);
  // ability bar
  const bar = $('bar'); bar.innerHTML = '';
  C.abilities.forEach((A, i) => { const b = document.createElement('button'); b.innerHTML = `<kbd>${i + 1}</kbd><b>${A.name}</b><small>${A.cost ? A.cost : ''}</small><i></i>`; b.title = A.desc; b.onclick = () => useAbility(i); bar.append(b); });
  if (matchMedia('(pointer: coarse)').matches) { document.querySelector('.gi-pad')?.classList.add('show'); const tb = document.createElement('button'); tb.textContent = '◎'; tb.className = 'tabbtn'; tb.onclick = tabTarget; bar.append(tb); const fb = document.createElement('button'); fb.textContent = 'F'; fb.className = 'tabbtn'; fb.onclick = interact; bar.append(fb); }
  mode = 'play'; show(null); updateTracker(); SFX.music(true);
  log(L('클로 마을에 오신 걸 환영해요! 노란 ! 가 뜬 촌장에게 말을 걸어 보세요 (F).', 'Welcome to Clawd Village! Talk to the Elder with the ! (F).'), '#F2C53D');
}
function victory() {
  mode = 'won'; SFX.music(false); SFX.play('win');
  $('msg-title').textContent = L('세상을 지켰다!', 'The world is saved!');
  $('msg-text').textContent = L(`Lv ${S.level} ${CLASS[S.cls].name} · 쓰러진 횟수 ${S.deaths} · 잉크 방울 ${S.drops}`, `Lv ${S.level} ${CLASS[S.cls].name} · fell ${S.deaths} times · ${S.drops} ink drops`);
  const row = $('msg-buttons'); row.innerHTML = ''; const b = document.createElement('button'); b.className = 'big'; b.textContent = L('계속 돌아다니기', 'Keep exploring'); b.onclick = () => { mode = 'play'; show(null); }; row.append(b);
  show('msg');
}
async function boot() {
  show('loading'); $('load-text').textContent = L('종이 세상을 접는 중…', 'Folding the paper world…');
  buildGround(); buildScenery(); buildMinimap();
  const walk = (tt, f) => ({ view: 'q', walk: f / 8, dy: -Math.abs(Math.sin(f / 8 * TAU)) * 0.4, aL: 0.5 * Math.sin(f / 8 * TAU), aR: -0.5 * Math.sin(f / 8 * TAU), emote: null });
  const specs = [];
  for (const cls of ['knight', 'mage']) specs.push(
    { key: `hero-${cls}`, emotion: 'determined', frames: 4, over: { hat: CLASS[cls].hat, emote: null } },
    { key: `hero-${cls}-walk`, emotion: 'happy', frames: 8, pose: walk, over: { hat: CLASS[cls].hat, emote: null } },
    { key: `hero-${cls}-atk`, emotion: 'angry', frames: 3, over: { hat: CLASS[cls].hat, view: 'q', aR: 1.5, aL: 0.2, emote: null } },
  );
  for (const n of NPCS) specs.push({ key: `npc-${n.id}`, emotion: 'happy', frames: 4, over: { hat: n.hat, col: n.col, dk: mix(n.col, '#3a1a10', 0.3), lt: mix(n.col, '#FFF1E6', 0.42), emote: null } });
  await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; });
  show('title');
  const box = $('picks'); box.innerHTML = '';
  for (const cls of ['knight', 'mage']) {
    const C = CLASS[cls], b = document.createElement('button'); b.className = 'pick';
    b.innerHTML = `<canvas width="220" height="170" data-cls="${cls}"></canvas><b>${C.name}</b><small>${C.abilities.map((a) => a.name).join(' · ')}</small>`;
    b.onclick = () => { SFX.unlock(); SFX.play('card'); start(cls); };
    box.append(b);
  }
}
boot();
window.__realms = { S, get mode() { return mode; }, get player() { return player; }, mobs, npcs, start, useAbility, interact, get target() { return target; }, set target(v) { target = v; }, QUESTS };
