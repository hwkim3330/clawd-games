// Clawd's Quest — a top-down adventure. Explore a 3×3 overworld, cut bushes, find a heart container, then take the
// dungeon room by room (key → locked door → chest with bombs → cracked wall) and beat the Ink Kraken.
//   A: pencil sword / read / open    B: ink bomb (once you have them)

(() => {
  const { PAL, TAU, clamp, lerp, backOut, mix, rgba, boil, jit, hash } = INK;
  const TS = 32, RW = 16, RH = 11, W = RW * TS, H = RH * TS;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
  const L = (ko, en) => (KO ? ko : en);
  const T = {
    lead: L('잉크 문어가 황금 펜촉을 훔쳐 갔다! 연필 검을 들고 찾으러 가자.', 'The Ink Kraken stole the Golden Nib! Grab your pencil sword and get it back.'),
    keys: L('<kbd>←↑↓→</kbd> 이동 · <kbd>Space</kbd> 칼 / 읽기 / 열기 · <kbd>X</kbd> 잉크 폭탄', '<kbd>←↑↓→</kbd> move · <kbd>Space</kbd> sword / read / open · <kbd>X</kbd> ink bomb'),
    start: L('모험 시작', 'Start'), cont: L('이어서', 'Continue'), more: L('다른 게임', 'More games'), loading: L('클로를 그리는 중…', 'Painting Clawd…'),
    dead: L('쓰러졌다…', 'You fainted…'), deadText: L('가진 물건은 그대로, 다시 일어나자.', 'You keep your things. Up you get.'), retry: L('다시 일어나기', 'Get up'),
    win: L('황금 펜촉을 되찾았다!', 'The Golden Nib is back!'), winText: (d) => L(`잉크 방울 ${d}개와 함께 페이지를 지켰어요.`, `Page saved, with ${d} ink drops.`), menu: L('처음으로', 'Menu'),
    key: L('열쇠!', 'A key!'), bombs: L('잉크 폭탄 5개! X로 설치', '5 ink bombs! Press X to place'), heart: L('하트 그릇! 최대 체력 +1', 'Heart container! Max hearts +1'),
    locked: L('잠겨 있다. 열쇠가 필요해.', "It's locked. You need a key."), cracked: L('벽에 금이 가 있다…', 'The wall is cracked…'), boss: L('잉크 문어', 'Ink Kraken'),
    nib: L('황금 펜촉!', 'The Golden Nib!'), sound: (v) => L(v ? '소리 켬' : '소리 끔', v ? 'Sound on' : 'Sound off'),
  };
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
  document.querySelectorAll('[data-t-html]').forEach((el) => { el.innerHTML = T[el.dataset.tHtml]; });

  /* ------------------------------------------------------------ canvas */
  const cv = $('game'), c = cv.getContext('2d');
  let VW = 0, VH = 0, DPR = 1, SC = 1, OX = 0, OY = 0, paperC, grainC;
  const HUD = 58;
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    const touchPad = matchMedia('(pointer: coarse)').matches && VH > VW ? 190 : 0;
    SC = Math.min(VW / W, (VH - HUD - touchPad - 8) / H);
    OX = (VW - W * SC) / 2; OY = HUD + Math.max(0, (VH - HUD - touchPad - H * SC) / 2);
    paperC = INK.paper(cv.width, cv.height, 7); grainC = INK.grain(Math.round(VW), Math.round(VH));
  }
  addEventListener('resize', resize); resize();
  const I = GameInput.create({ buttons: ['a', 'b'], labels: { a: 'A', b: 'B' } });

  /* ------------------------------------------------------------ tiles */
  const SOLID = new Set(['T', 'b', 'r', 'w', 'S', '#', 'D', 'C', 'c', 'e', 'l']);
  const ATLAS = {};
  const PAINT = {
    '.': (g) => { g.fillStyle = '#A8CF8E'; g.fillRect(0, 0, TS, TS); for (let i = 0; i < 3; i++) { const x = 4 + Math.random() * 24, y = 6 + Math.random() * 20; INK.inkLine(g, [[x, y], [x + 1.5, y - 4]], 0.9, rgba('#4E7A3E', 0.6)); } },
    ',': (g) => { g.fillStyle = '#E3C99B'; g.fillRect(0, 0, TS, TS); g.fillStyle = rgba(PAL.ink, 0.1); for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(Math.random() * 32, Math.random() * 32, 1.4, 0, TAU); g.fill(); } },
    's': (g) => { g.fillStyle = '#F0DDB0'; g.fillRect(0, 0, TS, TS); g.fillStyle = rgba('#B08A50', 0.3); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(Math.random() * 32, Math.random() * 32, 1, 0, TAU); g.fill(); } },
    'f': (g) => { PAINT['.'](g); for (let i = 0; i < 3; i++) { const x = 6 + Math.random() * 20, y = 6 + Math.random() * 20; for (let k = 0; k < 5; k++) { g.fillStyle = [PAL.rose, PAL.cream, PAL.ochre][i]; g.beginPath(); g.arc(x + Math.cos(k * 1.26) * 3, y + Math.sin(k * 1.26) * 3, 2, 0, TAU); g.fill(); } } },
    'T': (g) => { PAINT['.'](g); INK.blob(g, INK.rectPts(13, 20, 6, 10, 0.5), { wash: '#8C6A4A', ink: PAL.ink, sw: 1.2, smooth: false }); INK.blob(g, INK.lumpPts(16, 13, 14, 5, 12, 0.14, 0.6), { wash: '#5E9C58', ink: PAL.ink, sw: 1.6, pool: [11, 8, 9], poolCol: '#CFE8B8' }); },
    'b': (g) => { PAINT['.'](g); INK.blob(g, INK.lumpPts(16, 17, 11, 9, 11, 0.18, 0.6), { wash: '#6FB35E', ink: PAL.ink, sw: 1.5, pool: [12, 12, 7], poolCol: '#D8F0C8' }); },
    'r': (g) => { PAINT['.'](g); INK.blob(g, INK.lumpPts(16, 17, 12, 3, 9, 0.2, 0.6), { wash: '#B5AEA3', ink: PAL.ink, sw: 1.6, pool: [11, 12, 8] }); },
    'w': (g, v) => { g.fillStyle = '#7FB7D9'; g.fillRect(0, 0, TS, TS); for (let i = 0; i < 2; i++) { const y = 9 + i * 13 + v * 2; INK.inkLine(g, [[4, y], [10, y - 2], [16, y]], 1, rgba('#FFFFFF', 0.7)); } },
    '>': (g) => { PAINT['.'](g); INK.blob(g, INK.rectPts(3, 3, 26, 26, 0.5), { wash: '#4A3E63', ink: PAL.ink, sw: 1.6, smooth: false }); for (let i = 0; i < 4; i++) INK.inkLine(g, [[6, 8 + i * 6], [26, 8 + i * 6]], 1, rgba(PAL.cream, 0.5)); },
    'S': (g) => { PAINT['.'](g); INK.blob(g, INK.rectPts(15, 18, 3, 12, 0.3), { wash: '#8C6A4A', ink: PAL.ink, sw: 1, smooth: false }); INK.blob(g, INK.rectPts(5, 6, 22, 14, 0.6), { wash: '#D9B27C', ink: PAL.ink, sw: 1.4, smooth: false }); for (let i = 0; i < 2; i++) INK.inkLine(g, [[9, 11 + i * 4], [23, 11 + i * 4]], 0.8); },
    '#': (g) => { g.fillStyle = '#5E5470'; g.fillRect(0, 0, TS, TS); INK.blob(g, INK.rectPts(1, 1, 14, 14, 0.4), { wash: '#6E6480', ink: PAL.ink, sw: 1, smooth: false }); INK.blob(g, INK.rectPts(17, 1, 14, 14, 0.4), { wash: '#686078', ink: PAL.ink, sw: 1, smooth: false }); INK.blob(g, INK.rectPts(8, 17, 16, 14, 0.4), { wash: '#6A6280', ink: PAL.ink, sw: 1, smooth: false }); },
    '_': (g) => { g.fillStyle = '#C9BBA6'; g.fillRect(0, 0, TS, TS); INK.inkLine(g, [[0, 31.5], [32, 31.5]], 0.7, rgba(PAL.ink, 0.25)); INK.inkLine(g, [[31.5, 0], [31.5, 32]], 0.7, rgba(PAL.ink, 0.25)); },
    '<': (g) => { PAINT['_'](g); INK.blob(g, INK.rectPts(3, 3, 26, 26, 0.5), { wash: '#E9DCC4', ink: PAL.ink, sw: 1.6, smooth: false }); for (let i = 0; i < 4; i++) INK.inkLine(g, [[6, 8 + i * 6], [26, 8 + i * 6]], 1, rgba(PAL.ink, 0.5)); },
    'D': (g) => { PAINT['#'](g); INK.blob(g, INK.rectPts(2, 2, 28, 28, 0.5), { wash: '#9A6B45', ink: PAL.ink, sw: 1.6, smooth: false }); INK.blob(g, INK.ellPts(16, 14, 3.5, 3.5, 10), { wash: PAL.ink, ink: null }); INK.blob(g, INK.rectPts(14.5, 15, 3, 7, 0), { wash: PAL.ink, ink: null, smooth: false }); },
    'C': (g) => { PAINT['#'](g); INK.inkLine(g, [[8, 2], [14, 12], [10, 18], [18, 26], [15, 31]], 1.6); INK.inkLine(g, [[14, 12], [24, 9]], 1.2); },
    'c': (g) => { PAINT['_'](g); INK.blob(g, INK.rectPts(4, 8, 24, 18, 0.5), { wash: '#A0673E', ink: PAL.ink, sw: 1.6, smooth: false }); INK.blob(g, INK.rectPts(4, 8, 24, 6, 0.4), { wash: '#C4884F', ink: PAL.ink, sw: 1.2, smooth: false }); INK.blob(g, INK.rectPts(13, 12, 6, 6, 0.2), { wash: PAL.ochre, ink: PAL.ink, sw: 1, smooth: false }); },
    'e': (g) => { PAINT['_'](g); INK.blob(g, INK.rectPts(4, 12, 24, 14, 0.5), { wash: '#A0673E', ink: PAL.ink, sw: 1.6, smooth: false }); INK.blob(g, INK.rectPts(4, 4, 24, 7, 0.4), { wash: '#C4884F', ink: PAL.ink, sw: 1.2, smooth: false }); },
    'l': (g, v) => { PAINT['_'](g); INK.blob(g, INK.rectPts(12, 14, 8, 14, 0.4), { wash: '#7A6A5A', ink: PAL.ink, sw: 1.2, smooth: false }); INK.blob(g, INK.lumpPts(16, 10 - v, 6 + v * 0.5, 4 + v, 8, 0.25), { wash: '#F4A640', ink: PAL.ink, sw: 1, pool: [16, 11, 4], poolCol: '#FFF1B8' }); },
  };
  for (const [ch, fn] of Object.entries(PAINT)) {
    ATLAS[ch] = [0, 1, 2].map((v) => { const k = document.createElement('canvas'); k.width = k.height = TS * 2; const g = k.getContext('2d'); g.scale(2, 2); boil(v / 12, ch.charCodeAt(0) + v * 17); fn(g, v); return k; });
  }

  /* ------------------------------------------------------------ state */
  const S = { area: 'over', rx: 1, ry: 2, hearts: 3, maxHearts: 3, drops: 0, keys: 0, bombs: 0, hasBombs: false, flags: {}, boss: false, won: false };
  const rooms = { over: {}, dun: {} };
  const roomTiles = (area, rx, ry) => {
    const k = `${rx},${ry}`;
    if (!rooms[area][k]) rooms[area][k] = WORLD[area][k].map((r) => [...r]);
    return rooms[area][k];
  };
  let room = null, ents = [], player = null, trans = null, dialog = null, floats = [], parts = [], shake = 0, t = 0, mode = 'loading';

  function tileAt(tx, ty, grid = room) { if (tx < 0 || ty < 0 || tx >= RW || ty >= RH) return null; return grid[ty][tx]; }
  function solidAt(x, y, flying) {
    const ch = tileAt(Math.floor(x / TS), Math.floor(y / TS));
    if (ch == null) return false;           // off the room: that's a doorway, handled as a transition
    if (flying) return ch === 'T' || ch === '#' || ch === 'D' || ch === 'C';
    return SOLID.has(ch);
  }
  // Move a box (centre x,y; half sizes hw,hh) with tile collision, sliding along walls.
  function moveBox(e, dx, dy, flying) {
    const tryMove = (nx, ny) => ![[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([sx, sy]) => solidAt(nx + sx * e.hw, ny + sy * e.hh, flying));
    let moved = false;
    if (dx && tryMove(e.x + dx, e.y)) { e.x += dx; moved = true; }
    else if (dx) { // nudge around corners like classic games
      for (const n of [4, -4, 8, -8]) if (tryMove(e.x + dx, e.y + n) && !dy) { e.y += Math.sign(n) * Math.min(1.5, Math.abs(n)); break; }
    }
    if (dy && tryMove(e.x, e.y + dy)) { e.y += dy; moved = true; }
    else if (dy) { for (const n of [4, -4, 8, -8]) if (tryMove(e.x + n, e.y + dy) && !dx) { e.x += Math.sign(n) * Math.min(1.5, Math.abs(n)); break; } }
    return moved;
  }

  /* ------------------------------------------------------------ rooms */
  function enterRoom(area, rx, ry, px, py) {
    S.area = area; S.rx = rx; S.ry = ry;
    room = roomTiles(area, rx, ry);
    ents = []; parts = []; floats = [];
    const key = `${area}:${rx},${ry}`;
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const ch = room[y][x], cx = x * TS + TS / 2, cy = y * TS + TS / 2;
      const base = area === 'over' ? '.' : '_';
      if (ch === 'P') { room[y][x] = base; if (px == null) { px = cx; py = cy; } }
      else if ('okm'.includes(ch)) { room[y][x] = base; ents.push(makeEnemy(ch, cx, cy)); }
      else if (ch === 'd') { room[y][x] = base; if (!S.flags[`${key}:d${x},${y}`]) ents.push(makePickup('drop', cx, cy, `${key}:d${x},${y}`)); }
      else if (ch === 'H') { room[y][x] = base; if (!S.flags['heart']) ents.push(makePickup('heart', cx, cy, 'heart')); }
      else if (ch === 'B') { room[y][x] = base; if (!S.boss) ents.push(makeKraken(cx, cy)); }
    }
    if (!player) player = makePlayer(px, py);
    if (px != null) { player.x = px; player.y = py; }
    SFX.music(area === 'over' ? 'over' : 'dun');
  }
  function checkEdges() {
    const p = player; let d = null;
    if (p.x < 2) d = [-1, 0]; else if (p.x > W - 2) d = [1, 0]; else if (p.y < 2) d = [0, -1]; else if (p.y > H - 2) d = [0, 1];
    if (!d) return;
    const nx = S.rx + d[0], ny = S.ry + d[1];
    if (!WORLD[S.area][`${nx},${ny}`]) { p.x = clamp(p.x, 4, W - 4); p.y = clamp(p.y, 4, H - 4); return; }
    // slide from the old room to the new one
    const oldRoom = room, oldEnts = ents;
    const npx = d[0] ? (d[0] > 0 ? 10 : W - 10) : p.x, npy = d[1] ? (d[1] > 0 ? 12 : H - 12) : p.y;
    trans = { d, t0: t, oldRoom, oldEnts, dur: 0.5 };
    enterRoom(S.area, nx, ny, npx, npy);
  }
  function roomCleared() { return !ents.some((e) => e.enemy && !e.dead); }

  /* ------------------------------------------------------------ player */
  function makePlayer(x, y) {
    return { x, y, hw: 9, hh: 7, face: 'down', inv: 0, swing: -9, walkD: 0, kx: 0, ky: 0, moving: false,
      update(dt) {
        const a = I.axis(), swinging = t - this.swing < 0.22;
        let sp = swinging ? 40 : 120;
        let dx = a.x, dy = a.y;
        if (Math.abs(dx) > 0.2 || Math.abs(dy) > 0.2) { if (!swinging) this.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up'; }
        else { dx = dy = 0; }
        // knockback overrides input for a moment
        if (Math.abs(this.kx) + Math.abs(this.ky) > 5) { moveBox(this, this.kx * dt, this.ky * dt); this.kx *= 0.85; this.ky *= 0.85; }
        else { this.kx = this.ky = 0; if (dx || dy) { moveBox(this, dx * sp * dt, dy * sp * dt); this.walkD += Math.hypot(dx, dy) * sp * dt / 30; } }
        this.moving = !!(dx || dy);
        this.inv = Math.max(0, this.inv - dt);
        if (I.hit('a')) { if (!interact()) { this.swing = t; SFX.play('slash'); swordHit(); } }
        if (I.hit('b') && S.hasBombs && S.bombs > 0 && !ents.some((e) => e.kind === 'bomb')) { S.bombs--; ents.push(makeBomb(this.x + FACE[this.face][0] * 18, this.y + FACE[this.face][1] * 18)); SFX.play('click'); }
        checkEdges();
      },
      draw(c) {
        if (this.inv > 0 && Math.floor(t * 16) % 2) return;
        const view = this.face === 'down' ? 'front' : this.face === 'up' ? 'back' : 'side';
        const swinging = t - this.swing < 0.22;
        let key = view + (swinging ? '-atk' : this.moving ? '-walk' : '-idle');
        if (t - hurtT < 0.4) key = 'hurt';
        // sword behind when facing up
        if (swinging && this.face === 'up') drawSword(c, this, (t - this.swing) / 0.22);
        ClawdSprites.draw(c, key, this.x, this.y + 8, 26, this.moving ? this.walkD : t, { flip: this.face === 'left' });
        if (swinging && this.face !== 'up') drawSword(c, this, (t - this.swing) / 0.22);
      },
    };
  }
  const FACE = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  let hurtT = -9;
  function hurtPlayer(from, dmg = 1) {
    const p = player; if (p.inv > 0 || mode !== 'play') return;
    S.hearts -= dmg; p.inv = 1; hurtT = t; shake = 0.5; SFX.play('hurt');
    const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1; p.kx = dx / d * 320; p.ky = dy / d * 320;
    if (S.hearts <= 0) { S.hearts = 0; setTimeout(faint, 500); }
  }
  function drawSword(c, p, k) {
    const [fx, fy] = FACE[p.face], base = Math.atan2(fy, fx), a = base - 1.2 + k * 2.4;
    boil(0, 40);
    c.save(); c.translate(p.x, p.y - 2); c.rotate(a);
    INK.blob(c, INK.rectPts(6, -3, 22, 6, 0.3), { wash: '#E8C06A', ink: PAL.ink, sw: 1.2, smooth: false });
    INK.blob(c, [[28, -3], [35, 0], [28, 3]], { wash: '#F3D9A6', ink: PAL.ink, sw: 1, smooth: false });
    INK.blob(c, [[33, -1], [35, 0], [33, 1]], { wash: PAL.ink, ink: null, smooth: false, rim: false });
    c.restore();
    c.save(); c.globalAlpha = 0.5 * (1 - k); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y - 2, 30, base - 1.2, a); c.stroke(); c.restore();
  }
  function swordHit() {
    const p = player, [fx, fy] = FACE[p.face], hx = p.x + fx * 24, hy = p.y + fy * 22, r = 20;
    for (const e of ents) if (e.enemy && !e.dead && Math.abs(e.x - hx) < r + e.hw && Math.abs(e.y - hy) < r + e.hh) e.hit?.(1, p);
    // cut bushes
    const tx = Math.floor(hx / TS), ty = Math.floor(hy / TS);
    for (const [ax, ay] of [[tx, ty], [Math.floor((hx + fy * 10) / TS), Math.floor((hy + fx * 10) / TS)]]) {
      if (tileAt(ax, ay) === 'b') { room[ay][ax] = '.'; puff(ax * TS + 16, ay * TS + 16, '#6FB35E', 10); SFX.play('wall'); if (Math.random() < 0.35) ents.push(makePickup(Math.random() < 0.5 ? 'drop' : 'heartlet', ax * TS + 16, ay * TS + 16)); }
    }
  }
  // A in front of a sign, chest or door does that instead of swinging
  function interact() {
    const p = player, [fx, fy] = FACE[p.face], tx = Math.floor((p.x + fx * 20) / TS), ty = Math.floor((p.y + fy * 18) / TS), ch = tileAt(tx, ty);
    const key = `${S.area}:${S.rx},${S.ry}`;
    if (ch === 'S') { say(WORLD.signs[key] ? WORLD.signs[key][KO ? 0 : 1] : '…'); return true; }
    if (ch === 'c') { room[ty][tx] = 'e'; S.hasBombs = true; S.bombs = Math.max(S.bombs, 5); float(T.bombs, p.x, p.y - 40, PAL.ochre); SFX.play('win'); return true; }
    if (ch === 'D') {
      if (S.keys > 0) { S.keys--; for (let x = 0; x < RW; x++) if (room[ty][x] === 'D') room[ty][x] = '_'; SFX.play('card'); float(L('철컥!', 'Click!'), p.x, p.y - 40, PAL.cream); }
      else say(T.locked);
      return true;
    }
    if (ch === 'C') { say(T.cracked); return true; }
    if (ch === '>') { enterRoom('dun', 0, 2, 7.5 * TS + 16, 8.3 * TS); return true; }
    if (ch === '<') { enterRoom('over', 1, 0, 7.5 * TS + 16, 5.5 * TS + 8); return true; }
    return false;
  }
  function checkStairs() {
    const ch = tileAt(Math.floor(player.x / TS), Math.floor(player.y / TS));
    if (ch === '>' && !trans) { SFX.play('wave'); enterRoom('dun', 0, 2, 7.5 * TS + 16, 8.2 * TS); }
    if (ch === '<' && !trans) { SFX.play('wave'); enterRoom('over', 1, 0, 7.5 * TS + 16, 5.6 * TS + 8); }
  }

  /* ------------------------------------------------------------ things */
  function puff(x, y, col, n = 8, sp = 120) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 3, col, age: 0, life: 0.35 + Math.random() * 0.3 }); } }
  function float(s, x, y, col = PAL.cream, size = 15) { floats.push({ s, x, y, t0: t, col, size }); }
  function say(s) { dialog = { s, t0: t }; SFX.play('click'); }

  function makePickup(kind, x, y, flag) {
    return { kind, x, y, hw: 8, hh: 8, t0: t,
      update() {
        if (Math.abs(player.x - this.x) < 16 && Math.abs(player.y - this.y) < 16) {
          this.dead = true; if (flag) S.flags[flag] = true;
          if (kind === 'drop') { S.drops++; SFX.play('coin'); }
          if (kind === 'heartlet') { S.hearts = Math.min(S.maxHearts, S.hearts + 1); SFX.play('heal'); }
          if (kind === 'key') { S.keys++; float(T.key, this.x, this.y - 20, PAL.ochre); SFX.play('coin'); }
          if (kind === 'heart') { S.maxHearts++; S.hearts = S.maxHearts; float(T.heart, this.x, this.y - 24, PAL.rose); SFX.play('win'); }
          if (kind === 'nib') { S.won = true; float(T.nib, this.x, this.y - 30, PAL.ochre, 22); SFX.play('win'); setTimeout(win, 1500); }
        }
      },
      draw(c) {
        boil(t, Math.round(this.x + this.y));
        const bob = Math.sin((t - this.t0) * 5) * 2;
        if (kind === 'drop') INK.blob(c, [[this.x, this.y - 10 + bob], [this.x + 6, this.y + bob], [this.x, this.y + 6 + bob], [this.x - 6, this.y + bob]], { wash: PAL.indigo, ink: PAL.ink, sw: 1.2 });
        else if (kind === 'heartlet') INK.blob(c, INK.heartPts(this.x, this.y + bob, 7), { wash: '#E2476E', ink: PAL.ink, sw: 1.2 });
        else if (kind === 'heart') { INK.blob(c, INK.heartPts(this.x, this.y + bob, 12), { wash: '#E2476E', ink: PAL.ink, sw: 2, pool: [this.x - 4, this.y - 4 + bob, 8] }); INK.inkLine(c, INK.heartPts(this.x, this.y + bob, 15), 1.2, PAL.ochre, true); }
        else if (kind === 'key') { INK.blob(c, INK.ellPts(this.x - 5, this.y + bob, 5, 5, 10), { wash: PAL.ochre, ink: PAL.ink, sw: 1.4 }); INK.blob(c, INK.rectPts(this.x, this.y - 1.5 + bob, 12, 3, 0.2), { wash: PAL.ochre, ink: PAL.ink, sw: 1.2, smooth: false }); }
        else if (kind === 'nib') { INK.blob(c, [[this.x, this.y - 18 + bob], [this.x + 9, this.y + bob], [this.x, this.y + 12 + bob], [this.x - 9, this.y + bob]], { wash: '#F2C53D', ink: PAL.ink, sw: 2, pool: [this.x - 3, this.y - 6 + bob, 8], poolCol: '#FFF6C8' }); INK.inkLine(c, [[this.x, this.y - 4 + bob], [this.x, this.y + 10 + bob]], 1.4); }
      },
    };
  }

  function makeBomb(x, y) {
    return { kind: 'bomb', x, y, hw: 8, hh: 8, t0: t,
      update() {
        if (t - this.t0 > 1.4) {
          this.dead = true; shake = 0.8; SFX.play('boom'); puff(this.x, this.y, PAL.ink, 18, 220); puff(this.x, this.y, '#F4A640', 10, 160);
          boomAt(this.x, this.y);
        }
      },
      draw(c) {
        boil(t, 60);
        const blink = (t - this.t0) > 0.9 && Math.floor(t * 12) % 2;
        INK.blob(c, INK.ellPts(this.x, this.y + 2, 9, 9, 12, 0.5), { wash: blink ? PAL.red : PAL.ink, ink: PAL.ink, sw: 1.4, pool: [this.x - 3, this.y - 2, 5], poolCol: '#8888aa' });
        INK.inkLine(c, [[this.x + 5, this.y - 6], [this.x + 9, this.y - 12]], 1.4, '#8C6A4A');
        c.fillStyle = PAL.ochre; c.beginPath(); c.arc(this.x + 9, this.y - 13, 2 + Math.random(), 0, TAU); c.fill();
      },
    };
  }
  function boomAt(x, y) {
    const R = 50;
    for (const e of ents) if (e.enemy && !e.dead && Math.hypot(e.x - x, e.y - y) < R + 10) e.hit?.(2, { x, y });
    if (Math.hypot(player.x - x, player.y - y) < R - 6) hurtPlayer({ x, y });
    for (let ty = 0; ty < RH; ty++) for (let tx = 0; tx < RW; tx++) {
      const cx = tx * TS + 16, cy = ty * TS + 16; if (Math.hypot(cx - x, cy - y) > R + 12) continue;
      const ch = room[ty][tx];
      if (ch === 'C') { for (let k = 0; k < RW; k++) if (room[ty][k] === 'C') room[ty][k] = '_'; SFX.play('win'); float(L('길이 열렸다!', 'A way opens!'), x, y - 30, PAL.cream); }
      if (ch === 'b') { room[ty][tx] = '.'; puff(cx, cy, '#6FB35E', 8); }
    }
    ents.push(boomFx(x, y, R));
  }
  function boomFx(x, y, R) {
    return { kind: 'fx', t0: t, update() { if (t - this.t0 > 0.4) this.dead = true; },
      draw(c) { const k = (t - this.t0) / 0.4; boil(t, 61); c.globalAlpha = 1 - k; INK.blob(c, INK.lumpPts(x, y, R * (0.4 + k * 0.7), 7, 14, 0.25), { wash: '#F4A640', ink: PAL.ink, sw: 2, pool: [x, y, R * 0.5], poolCol: '#FFF1B8' }); c.globalAlpha = 1; } };
  }

  /* ------------------------------------------------------------ enemies */
  function makeEnemy(kind, x, y) {
    const hp = kind === 'k' ? 3 : 1;
    const e = { kind, enemy: true, x, y, hw: 10, hh: 9, hp, max: hp, dir: [0, 1], turnT: 0.5 + Math.random(), shootT: 2 + Math.random() * 2, hitT: -9, kx: 0, ky: 0, id: Math.random() * 1000 | 0, flying: kind === 'm', vx: 0, vy: 0,
      hit(d, from) {
        this.hp -= d; this.hitT = t; SFX.play('hit');
        const dx = this.x - from.x, dy = this.y - from.y, dd = Math.hypot(dx, dy) || 1; this.kx = dx / dd * 300; this.ky = dy / dd * 300;
        if (this.hp <= 0) { this.dead = true; SFX.play('splat'); puff(this.x, this.y, kind === 'k' ? '#9AA7C0' : PAL.ink, 12, 150); if (Math.random() < 0.45) ents.push(makePickup(Math.random() < 0.6 ? 'drop' : 'heartlet', this.x, this.y)); afterKill(); }
      },
      update(dt) {
        if (Math.abs(this.kx) + Math.abs(this.ky) > 5) { moveBox(this, this.kx * dt, this.ky * dt, this.flying); this.kx *= 0.85; this.ky *= 0.85; return; }
        if (kind === 'm') {   // moths flutter
          this.vx += (Math.random() - 0.5) * 600 * dt + (player.x - this.x) * 0.4 * dt; this.vy += (Math.random() - 0.5) * 600 * dt + (player.y - this.y) * 0.4 * dt;
          const v = Math.hypot(this.vx, this.vy); if (v > 90) { this.vx *= 90 / v; this.vy *= 90 / v; }
          if (!moveBox(this, this.vx * dt, this.vy * dt, true)) { this.vx *= -1; this.vy *= -1; }
          this.x = clamp(this.x, 40, W - 40); this.y = clamp(this.y, 40, H - 40);
        } else {
          const sp = kind === 'k' ? 50 : 40;
          this.turnT -= dt;
          if (kind === 'k' && (Math.abs(player.x - this.x) < 12 || Math.abs(player.y - this.y) < 12)) {  // knights charge when lined up
            const dx = player.x - this.x, dy = player.y - this.y; this.dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
          } else if (this.turnT <= 0) { this.dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)]; this.turnT = 0.8 + Math.random() * 1.4; }
          const boost = kind === 'k' && (Math.abs(player.x - this.x) < 12 || Math.abs(player.y - this.y) < 12) ? 1.8 : 1;
          if (kind === 'o' && this.shootT < 0.5) { /* wind up */ }
          else if (!moveBox(this, this.dir[0] * sp * boost * dt, this.dir[1] * sp * boost * dt)) this.turnT = 0;
          if (kind === 'o') {
            this.shootT -= dt;
            if (this.shootT <= 0) { const dx = player.x - this.x, dy = player.y - this.y; this.dir = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]; ents.push(pellet(this.x, this.y, this.dir[0] * 170, this.dir[1] * 170)); this.shootT = 2.2 + Math.random() * 1.5; SFX.play('pew'); }
          }
        }
        if (Math.abs(player.x - this.x) < this.hw + player.hw && Math.abs(player.y - this.y) < this.hh + player.hh) hurtPlayer(this);
      },
      draw(c) {
        boil(t, this.id);
        const flash = t - this.hitT < 0.1, wob = Math.sin(t * 10 + this.id) * 0.08;
        c.save(); c.translate(this.x, this.y);
        if (kind === 'm') {
          const f = Math.sin(t * 30 + this.id);
          for (const s of [-1, 1]) INK.blob(c, INK.ellPts(s * 8, -2, 7, 5 + f * 2, 10, 0.5, s * 0.4), { wash: flash ? '#fff' : '#D9C7A8', ink: PAL.ink, sw: 1.1 });
          INK.blob(c, INK.ellPts(0, 0, 4, 7, 10), { wash: '#6E5A4A', ink: PAL.ink, sw: 1.2 });
          c.restore(); return;
        }
        c.scale(1 + wob, 1 - wob);
        if (kind === 'k') {
          INK.blob(c, INK.rectPts(-10, -14, 20, 22, 0.8), { wash: flash ? '#fff' : '#E9E2D4', ink: PAL.ink, sw: 1.5, smooth: false });
          INK.inkLine(c, [[-10, -6], [10, -6]], 0.8, rgba(PAL.ink, 0.4)); INK.inkLine(c, [[-10, 0], [10, 0]], 0.8, rgba(PAL.ink, 0.4));
          INK.blob(c, [[-6, -14], [0, -22], [6, -14]], { wash: PAL.red, ink: PAL.ink, sw: 1.2, smooth: false });
          c.save(); c.translate(this.dir[0] * 12, this.dir[1] * 8); INK.blob(c, INK.rectPts(-2, -12, 4, 16, 0.2), { wash: '#B5AEA3', ink: PAL.ink, sw: 1, smooth: false }); c.restore();
        } else INK.blob(c, INK.lumpPts(0, -2, 11, this.id, 12, 0.18, 0.4), { wash: flash ? '#fff' : '#3b2f4a', ink: PAL.ink, sw: 1.5, pool: [-4, -6, 6], poolCol: '#b9a7d6' });
        const [dx, dy] = this.dir;
        for (const s of [-1, 1]) { c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(s * 4, -5, 2.8, 3.4, 0, 0, TAU); c.fill(); c.fillStyle = PAL.ink; c.beginPath(); c.arc(s * 4 + dx * 1.2, -5 + dy * 1.2, 1.5, 0, TAU); c.fill(); }
        c.restore();
      },
    };
    return e;
  }
  function pellet(x, y, vx, vy) {
    return { kind: 'pellet', x, y, vx, vy, hw: 4, hh: 4,
      update(dt) { this.x += this.vx * dt; this.y += this.vy * dt; if (solidAt(this.x, this.y, true) || this.x < 0 || this.y < 0 || this.x > W || this.y > H) this.dead = true;
        if (Math.abs(player.x - this.x) < 11 && Math.abs(player.y - this.y) < 10) { this.dead = true; hurtPlayer(this); } },
      draw(c) { c.fillStyle = PAL.ink; c.beginPath(); c.arc(this.x, this.y, 5, 0, TAU); c.fill(); },
    };
  }
  function afterKill() {
    // the dungeon's first room hands over the key once it's quiet
    if (S.area === 'dun' && S.rx === 0 && S.ry === 2 && !S.flags.key && roomCleared()) { S.flags.key = true; ents.push(makePickup('key', W / 2, H / 2 + 20)); SFX.play('card'); }
  }

  /* ------------------------------------------------------------ Kraken */
  function makeKraken(x, y) {
    return { kind: 'boss', enemy: true, x, y, hw: 34, hh: 28, hp: 8, max: 8, eye: 0, cycle: 0, hitT: -9, awake: false,
      hit(d) {
        if (this.eye < 0.5) { SFX.play('fizzle'); float(L('눈을 노려!', 'Aim for the eye!'), this.x, this.y - 50, PAL.cream, 13); return; }
        this.hp -= d; this.hitT = t; this.eye = 0; this.cycle = 0; shake = 0.5; SFX.play('hurt');
        if (this.hp <= 0) { this.dead = true; S.boss = true; SFX.play('win'); shake = 1; for (let i = 0; i < 5; i++) puff(this.x + jit(30), this.y + jit(20), PAL.ink, 16, 240); ents.push(makePickup('nib', this.x, this.y)); }
      },
      update(dt) {
        if (!this.awake) { this.awake = true; float(T.boss, this.x, this.y - 70, PAL.rose, 22); SFX.play('boom'); }
        this.cycle += dt;
        const period = this.hp < 4 ? 2.4 : 3.2;
        this.eye = this.cycle % period > period - 1.3 ? 1 : 0;
        if (Math.floor(this.cycle * 10) % Math.floor(period * 10) === 0 && Math.random() < 0.05) {
          const n = this.hp < 4 ? 8 : 4;
          for (let i = 0; i < n; i++) { const a = i / n * TAU + t; ents.push(pellet(this.x, this.y, Math.cos(a) * 140, Math.sin(a) * 140)); }
          SFX.play('pew');
        }
        // tentacles sweep: touching their tips hurts
        for (let i = 0; i < 4; i++) {
          const a = t * (this.hp < 4 ? 1.3 : 0.9) + i * TAU / 4, len = 70 + Math.sin(t * 2 + i) * 20;
          const tx = this.x + Math.cos(a) * len, ty = this.y + Math.sin(a) * len * 0.7;
          if (Math.hypot(player.x - tx, player.y - ty) < 16) hurtPlayer({ x: tx, y: ty });
        }
        if (Math.abs(player.x - this.x) < this.hw + 6 && Math.abs(player.y - this.y) < this.hh + 6) hurtPlayer(this);
      },
      draw(c) {
        boil(t, 70);
        for (let i = 0; i < 4; i++) {
          const a = t * (this.hp < 4 ? 1.3 : 0.9) + i * TAU / 4, len = 70 + Math.sin(t * 2 + i) * 20, P = [];
          for (let k = 0; k <= 8; k++) { const q = k / 8, aa = a + Math.sin(t * 3 + k * 0.6 + i) * 0.3 * q; P.push([this.x + Math.cos(aa) * len * q, this.y + Math.sin(aa) * len * q * 0.7]); }
          c.save(); c.strokeStyle = '#3b2f4a'; c.lineCap = 'round'; c.lineWidth = 12; INK.path(c, P, false, true); c.stroke(); c.restore();
          INK.inkLine(c, P, 1.4);
          INK.blob(c, INK.ellPts(P[8][0], P[8][1], 7, 7, 10), { wash: '#3b2f4a', ink: PAL.ink, sw: 1.4 });
        }
        const flash = t - this.hitT < 0.12;
        INK.blob(c, INK.lumpPts(this.x, this.y, 36, 70, 18, 0.12, 0.8), { wash: flash ? '#fff' : '#2f2640', ink: PAL.ink, sw: 2.6, pool: [this.x - 12, this.y - 14, 18], poolCol: '#b9a7d6' });
        const eo = this.eye;
        INK.blob(c, INK.ellPts(this.x, this.y - 4, 14, 3 + eo * 9, 16), { wash: eo ? PAL.cream : '#4A3E63', ink: PAL.ink, sw: 1.8 });
        if (eo) { c.fillStyle = PAL.red; c.beginPath(); c.arc(this.x + clamp((player.x - this.x) / 20, -5, 5), this.y - 3, 5, 0, TAU); c.fill(); }
        const w = 120, hx = this.x - w / 2, hy = this.y - 62;
        c.fillStyle = rgba(PAL.ink, 0.35); c.fillRect(hx, hy, w, 7); c.fillStyle = PAL.rose; c.fillRect(hx, hy, w * this.hp / this.max, 7);
      },
    };
  }

  /* ------------------------------------------------------------ render */
  function drawRoom(grid, ox, oy) {
    const v = Math.floor(t * 4) % 3;
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const ch = grid[y][x], a = ATLAS[ch] || ATLAS[S.area === 'over' ? '.' : '_'];
      c.drawImage(a[(ch === 'w' || ch === 'l') ? v : (x * 3 + y) % 3], ox + x * TS, oy + y * TS, TS + 0.5, TS + 0.5);
    }
  }
  function drawHUD() {
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const pad = 12;
    for (let i = 0; i < S.maxHearts; i++) { boil(t, 300 + i); INK.blob(c, INK.heartPts(pad + 13 + i * 27, pad + 14, 11), { wash: i < S.hearts ? '#E2476E' : rgba(PAL.ink, 0.12), ink: PAL.ink, sw: 1.4 }); }
    const x0 = Math.max(pad + 13 + S.maxHearts * 27 + 14, VW / 2 - 110);
    boil(t, 320);
    INK.blob(c, [[x0, pad + 4], [x0 + 7, pad + 16], [x0, pad + 24], [x0 - 7, pad + 16]], { wash: PAL.indigo, ink: PAL.ink, sw: 1.2 });
    INK.text(c, `${S.drops}`, x0 + 12, pad + 16, 20, PAL.ink, { align: 'left', shadow: false });
    INK.blob(c, INK.ellPts(x0 + 64, pad + 15, 5, 5, 10), { wash: PAL.ochre, ink: PAL.ink, sw: 1.2 }); INK.text(c, `${S.keys}`, x0 + 76, pad + 16, 20, PAL.ink, { align: 'left', shadow: false });
    if (S.hasBombs) { INK.blob(c, INK.ellPts(x0 + 118, pad + 16, 7, 7, 10), { wash: PAL.ink, ink: PAL.ink, sw: 1 }); INK.text(c, `${S.bombs}`, x0 + 130, pad + 16, 20, PAL.ink, { align: 'left', shadow: false }); }
    // minimap
    const mm = S.area === 'over' ? [3, 3] : [1, 3], cs = 9, mx = VW - 64 - mm[0] * (cs + 2), my = pad + 2;
    for (let y = 0; y < mm[1]; y++) for (let x = 0; x < mm[0]; x++) { if (!WORLD[S.area][`${x},${y}`]) continue; c.fillStyle = x === S.rx && y === S.ry ? PAL.clay : rgba(PAL.ink, 0.25); c.fillRect(mx + x * (cs + 2), my + y * (cs + 2), cs, cs); }
    if (dialog) {
      const w = Math.min(560, VW - 32), h = 86, x = (VW - w) / 2, y = OY + H * SC - h - 8;
      c.save(); c.fillStyle = rgba(PAL.cream, 0.96); c.fillRect(x, y, w, h); c.restore();
      boil(t, 330); INK.inkLine(c, INK.rectPts(x, y, w, h, 1), 2.2, PAL.ink, true);
      c.save(); c.font = '700 19px "Gaegu", cursive'; c.fillStyle = PAL.ink; c.textBaseline = 'top';
      const words = dialog.s.split(' '); let line = '', ly = y + 12;
      for (const wd of words) { const test = line ? line + ' ' + wd : wd; if (c.measureText(test).width > w - 28) { c.fillText(line, x + 14, ly); line = wd; ly += 23; } else line = test; }
      c.fillText(line, x + 14, ly); c.restore();
    }
    if (mode === 'paused') INK.text(c, L('일시 정지', 'Paused'), VW / 2, VH / 2, 38, PAL.cream, { font: '"Permanent Marker"', weight: 400 });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    I.poll();
    if (I.hit('pause')) togglePause();
    if (mode === 'play') {
      t += dt;
      if (dialog) { if (I.hit('a') || I.hit('b')) { dialog = null; I.consume('a'); } }
      else if (!trans || t - trans.t0 > trans.dur) {
        trans = null;
        player.update(dt);
        checkStairs();
        for (const e of ents) if (!e.dead) e.update?.(dt);
        ents = ents.filter((e) => !e.dead);
      }
      for (const p of parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
      parts = parts.filter((p) => p.age < p.life); floats = floats.filter((f) => t - f.t0 < 1.3);
    } else if (mode !== 'paused') t += dt;
    I.endFrame();
    shake = Math.max(0, shake - dt * 3);

    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = S.area === 'over' ? '#E9E3D2' : '#2E2838'; c.fillRect(0, 0, cv.width, cv.height);
    c.globalAlpha = 0.6; c.drawImage(paperC, 0, 0); c.globalAlpha = 1;
    if (room) {
      const sh = shake * 5;
      c.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * (OX + (Math.random() - 0.5) * sh), DPR * (OY + (Math.random() - 0.5) * sh));
      c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
      if (trans && t - trans.t0 < trans.dur) {
        const k = INK.ease((t - trans.t0) / trans.dur), [dx, dy] = trans.d;
        drawRoom(trans.oldRoom, -dx * W * k, -dy * H * k);
        c.save(); c.translate(dx * W * (1 - k), dy * H * (1 - k)); drawRoom(room, 0, 0); player.draw(c); c.restore();
      } else {
        drawRoom(room, 0, 0);
        const all = ents.concat([player]).sort((a, b) => a.y - b.y);
        for (const e of all) e.draw?.(c);
        for (const p of parts) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
        for (const f of floats) { const k = t - f.t0; INK.text(c, f.s, clamp(f.x, 90, W - 90), f.y - k * 24, f.size, f.col, { alpha: 1 - clamp((k - 0.9) / 0.4) }); }
      }
      c.restore();
      boil(t, 340); INK.inkLine(c, INK.rectPts(0, 0, W, H, 0.6), 3, PAL.ink, true);
    }
    if (mode === 'play' || mode === 'paused') drawHUD();
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0, VW, VH); c.globalCompositeOperation = 'source-over';
    for (const tc of document.querySelectorAll('.clawd-portrait')) { if (!tc.offsetParent) continue; const g = tc.getContext('2d'); g.clearRect(0, 0, tc.width, tc.height); ClawdSprites.draw(g, portrait, tc.width / 2, tc.height * 0.93, tc.width * 0.42, t); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------ music (overworld / dungeon moods) */
  const baseMusic = SFX.music;
  SFX.music = (v) => baseMusic(!!v);

  /* ------------------------------------------------------------ flow */
  let portrait = 'title';
  function show(id) { for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id; document.body.classList.toggle('menu', !!id); $('btn-pause').hidden = !!id; }
  function save() { try { localStorage.setItem('clawdquest.save', JSON.stringify({ S, rooms })); } catch {} }
  function load() { try { const d = JSON.parse(localStorage.getItem('clawdquest.save')); if (d) { Object.assign(S, d.S); for (const a of ['over', 'dun']) rooms[a] = d.rooms[a] || {}; return true; } } catch {} return false; }
  function start(fresh) {
    if (fresh) { Object.assign(S, { area: 'over', rx: 1, ry: 2, hearts: 3, maxHearts: 3, drops: 0, keys: 0, bombs: 0, hasBombs: false, flags: {}, boss: false, won: false }); rooms.over = {}; rooms.dun = {}; }
    player = null; S.hearts = Math.max(S.hearts, S.maxHearts);
    enterRoom(S.area, S.rx, S.ry);
    if (!fresh) { const g = WORLD[S.area][`${S.rx},${S.ry}`]; player.x = W / 2; player.y = H / 2 + 40; }
    mode = 'play'; show(null); SFX.play('wave');
    if (fresh) setTimeout(() => say(WORLD.signs['over:1,2'][KO ? 0 : 1]), 400);
  }
  function faint() {
    if (mode !== 'play') return;
    mode = 'over'; SFX.play('lose'); SFX.music(false); save();
    portrait = 'ko'; $('msg-title').textContent = T.dead; $('msg-text').textContent = T.deadText;
    const row = $('msg-buttons'); row.innerHTML = '';
    const b = document.createElement('button'); b.className = 'big'; b.textContent = T.retry; b.onclick = () => { S.hearts = S.maxHearts; if (S.area === 'dun') { S.rx = 0; S.ry = 2; } else { S.rx = 1; S.ry = 2; } start(false); }; row.append(b);
    show('msg');
  }
  function win() {
    mode = 'won'; SFX.music(false); try { localStorage.removeItem('clawdquest.save'); } catch {}
    portrait = 'win'; $('msg-title').textContent = T.win; $('msg-text').textContent = T.winText(S.drops);
    const row = $('msg-buttons'); row.innerHTML = '';
    const b = document.createElement('button'); b.className = 'big'; b.textContent = T.menu; b.onclick = titleScreen; row.append(b);
    show('msg');
  }
  function titleScreen() {
    mode = 'title'; portrait = 'title';
    const hasSave = !!localStorage.getItem('clawdquest.save');
    const row = $('title-buttons'); row.innerHTML = '';
    const mk = (label, fn, alt) => { const b = document.createElement('button'); b.className = 'big' + (alt ? ' alt' : ''); b.textContent = label; b.onclick = () => { SFX.unlock(); SFX.play('card'); fn(); }; row.append(b); };
    if (hasSave) mk(T.cont, () => { load(); start(false); });
    mk(T.start, () => start(true), hasSave);
    show('title');
  }
  function togglePause() { if (mode === 'play') { mode = 'paused'; save(); } else if (mode === 'paused') mode = 'play'; }
  $('btn-pause').addEventListener('click', togglePause);
  addEventListener('blur', () => { if (mode === 'play') togglePause(); });
  setInterval(() => { if (mode === 'play') save(); }, 5000);
  const renderSound = () => { $('btn-sound').textContent = T.sound(SFX.on); };
  $('btn-sound').addEventListener('click', () => { SFX.setOn(!SFX.on); renderSound(); });

  async function boot() {
    show('loading'); $('load-text').textContent = T.loading;
    const hat = { hat: 'band' };
    const walk = (view) => (tt, f) => ({ view, walk: f / 8, dy: -Math.abs(Math.sin(f / 8 * TAU)) * 0.35, aL: 0.4 * Math.sin(f / 8 * TAU), aR: -0.4 * Math.sin(f / 8 * TAU), emote: null });
    const specs = [];
    for (const view of ['front', 'back', 'side']) specs.push(
      { key: `${view}-idle`, emotion: 'neutral', frames: 4, over: { ...hat, view } },
      { key: `${view}-walk`, emotion: 'determined', frames: 8, pose: walk(view), over: hat },
      { key: `${view}-atk`, emotion: 'determined', frames: 2, over: { ...hat, view, aR: 1.5, aL: -0.3, emote: null } },
    );
    specs.push({ key: 'hurt', emotion: 'scared', frames: 3, over: { ...hat, emote: null } }, { key: 'title', emotion: 'determined', frames: 6, over: hat }, { key: 'ko', emotion: 'ko', frames: 4, over: hat }, { key: 'win', emotion: 'starstruck', frames: 6, over: { hat: 'crown' } });
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; });
    renderSound(); titleScreen();
  }
  boot();
  window.__quest = { S, get room() { return room; }, get ents() { return ents; }, get player() { return player; }, enterRoom, start, get mode() { return mode; } };
})();
