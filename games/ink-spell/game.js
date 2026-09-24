// Ink Spell — draw shapes to cast spells and keep Clawd safe from the ink creatures crawling across the page.
//
//   line → slash   circle → shield   zigzag → lightning   triangle → fireburst   spiral → vortex
//   square → ink turret   anything else → the stroke itself becomes an ink wall
//
// Clawd is the painted Clawd of the Claude Animation Base, baked to sprites at load (lib/clawd-sprites.js).
// Everything else is Canvas2D in the same paper-and-ink look (lib/ink.js), so the game runs at 60 fps.

(() => {
  const { PAL, TAU, clamp, lerp, ease, backOut, mix, rgba, boil, jit, hash } = INK;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');

  /* --------------------------------------------------------------- text */
  const TXT = KO ? {
    lead: '모양을 그리면 주문이 돼요. 잉크 괴물로부터 클로를 지켜주세요!', start: '시작', again: '다시 하기', more: '다른 게임',
    pick: '업그레이드를 하나 고르세요', wave: (n) => `${n}번째 물결`, cleared: (n) => `${n}번째 물결 통과!`,
    over: '잉크에 먹혔다…', overText: (w, s) => `${w}번째 물결까지 버텼어요. 점수 ${s}`, win: '페이지를 지켜냈다!', winText: (s) => `20번째 물결 돌파! 점수 ${s} — 계속하면 끝없는 모드`,
    best: (s, w) => `최고 기록 ${s}점 (물결 ${w})`, sound: (v) => (v ? '소리 켬' : '소리 끔'), noInk: '잉크 부족!', combo: (n) => `콤보 ×${n}`,
    loading: '클로를 그리는 중…', boss: '지우개 대마왕 등장!', paused: '일시 정지 — 탭해서 계속',
    spells: { line: ['베기', '직선'], circle: ['방패', '동그라미'], zigzag: ['번개', '지그재그'], triangle: ['폭발', '세모'], spiral: ['소용돌이', '나선'], square: ['포탑', '네모'], scribble: ['잉크 벽', '아무렇게나'] },
  } : {
    lead: 'Shapes you draw become spells. Keep Clawd safe from the ink monsters!', start: 'Start', again: 'Play again', more: 'More games',
    pick: 'Pick an upgrade', wave: (n) => `Wave ${n}`, cleared: (n) => `Wave ${n} cleared!`,
    over: 'Swallowed by ink…', overText: (w, s) => `You held out to wave ${w}. Score ${s}`, win: 'The page is safe!', winText: (s) => `Wave 20 beaten! Score ${s} — keep going for endless mode`,
    best: (s, w) => `Best ${s} (wave ${w})`, sound: (v) => (v ? 'Sound on' : 'Sound off'), noInk: 'Out of ink!', combo: (n) => `Combo ×${n}`,
    loading: 'Painting Clawd…', boss: 'The Great Eraser appears!', paused: 'Paused — tap to resume',
    spells: { line: ['Slash', 'line'], circle: ['Shield', 'circle'], zigzag: ['Lightning', 'zigzag'], triangle: ['Burst', 'triangle'], spiral: ['Vortex', 'spiral'], square: ['Turret', 'square'], scribble: ['Ink wall', 'anything'] },
  };
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = TXT[el.dataset.t]; });

  /* ------------------------------------------------------------- canvas */
  const cv = $('game'), c = cv.getContext('2d');
  let VW = 0, VH = 0, DPR = 1, B = 600, CX = 0, CY = 0;   // view size (css px), base scale, Clawd position
  let paperC = null, grainC = null, stainC = null, stainX = null;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    VW = innerWidth; VH = innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    B = Math.min(VW, VH); CX = VW / 2; CY = VH * 0.54;
    paperC = INK.paper(cv.width, cv.height);
    grainC = INK.grain(Math.round(VW), Math.round(VH));
    const old = stainC;
    stainC = document.createElement('canvas'); stainC.width = cv.width; stainC.height = cv.height; stainX = stainC.getContext('2d');
    if (old) stainX.drawImage(old, 0, 0, stainC.width, stainC.height);
  }
  addEventListener('resize', resize); resize();

  /* -------------------------------------------------------------- state */
  const S = {
    mode: 'loading', t: 0, wave: 0, hp: 5, score: 0, kills: 0,
    ink: 100, stats: null, spawnQ: [], spawnT: 0, waveActive: false,
    enemies: [], walls: [], shields: [], turrets: [], vortexes: [], fx: [], shots: [], floats: [], parts: [],
    stroke: null, combo: { n: 0, last: '', t: -9 }, shake: 0, hurtT: -9, castT: -9, cheerT: -9, loveT: -9,
    face: 'idle', faceT: 0, nextId: 1, endless: false, legendT: 0,
  };
  const baseStats = () => ({ maxInk: 100, regen: 15, cost: 1, slash: 3, zapN: 3, zapDmg: 4, fireR: 1, fireDmg: 5, shieldT: 6, turretT: 12, turretRate: 0.6, vortexT: 4, vortexDmg: 1, wallT: 6, maxHp: 5 });
  let best = { score: 0, wave: 0 };
  try { best = JSON.parse(localStorage.getItem('inkspell.best')) || best; } catch {}

  /* ------------------------------------------------------------ enemies */
  const KIND = {
    blot:     { hp: 3, sp: 0.07, r: 0.028, col: '#3b2f4a', score: 10 },
    runner:   { hp: 2, sp: 0.15, r: 0.021, col: '#6a2c55', score: 15 },
    splitter: { hp: 4, sp: 0.075, r: 0.034, col: PAL.violet, score: 20 },
    mini:     { hp: 1, sp: 0.12, r: 0.017, col: '#8d6ab8', score: 5 },
    brute:    { hp: 14, sp: 0.042, r: 0.052, col: '#26244a', score: 45 },
    flyer:    { hp: 2, sp: 0.1, r: 0.026, col: '#fdf8ee', score: 20, fly: true },
    boss:     { hp: 90, sp: 0.028, r: 0.1, col: '#e98aa0', score: 500, boss: true },
  };
  function spawnEnemy(kind, at) {
    const K = KIND[kind];
    let x, y;
    if (at) [x, y] = at;
    else {
      const side = Math.floor(Math.random() * 4), m = 30;
      x = side === 0 ? -m : side === 1 ? VW + m : Math.random() * VW;
      y = side === 2 ? -m : side === 3 ? VH + m : Math.random() * VH;
      if (side < 2) y = Math.random() * VH;
    }
    const hpMul = 1 + Math.max(0, S.wave - 5) * 0.08 + (S.endless ? (S.wave - 20) * 0.1 : 0);
    S.enemies.push({ id: S.nextId++, kind, x, y, vx: 0, vy: 0, hp: K.hp * hpMul, max: K.hp * hpMul, r: K.r * B, hitT: -9, slow: 0, burn: 0, born: S.t, stuck: 0 });
  }

  function planWave(n) {
    const q = [];
    const budget = 5 + n * 3;
    const pool = [['blot', 1, 1]];
    if (n >= 2) pool.push(['runner', 1.5, 0.8]);
    if (n >= 3) pool.push(['splitter', 2, 0.6]);
    if (n >= 4) pool.push(['flyer', 2, 0.6]);
    if (n >= 6) pool.push(['brute', 5, 0.35]);
    let b = budget;
    while (b > 0) {
      const tw = pool.reduce((a, p) => a + p[2], 0); let r = Math.random() * tw, k = pool[0];
      for (const p of pool) { r -= p[2]; if (r <= 0) { k = p; break; } }
      q.push(k[0]); b -= k[1];
    }
    if (n % 10 === 0) q.push('boss');
    S.spawnQ = q;
    S.spawnGap = Math.max(0.35, 1.5 - n * 0.06);
    S.spawnT = 1.2;
  }

  /* ------------------------------------------------------------- spells */
  const SHAPE_COL = { line: PAL.red, circle: PAL.sky, zigzag: PAL.ochre, triangle: '#EE6A3A', spiral: PAL.violet, square: PAL.teal, scribble: PAL.ink };
  function inkCost(len) { return (len / B) * 45 * S.stats.cost; }

  function damage(e, d, from) {
    if (e.dead) return;
    e.hp -= d; e.hitT = S.t;
    const dx = e.x - (from ? from[0] : CX), dy = e.y - (from ? from[1] : CY), L = Math.hypot(dx, dy) || 1;
    e.x += (dx / L) * B * 0.012; e.y += (dy / L) * B * 0.012;
    if (e.hp <= 0) kill(e);
    else SFX.play('hit');
  }
  function kill(e) {
    e.dead = true;
    const K = KIND[e.kind];
    const mult = comboMult();
    S.score += Math.round(K.score * mult); S.kills++;
    stainX.save(); stainX.scale(DPR, DPR);
    INK.splat(stainX, e.x, e.y, e.r * 0.9, e.kind === 'flyer' ? '#d9ccb4' : e.kind === 'boss' ? '#e98aa0' : K.col, e.id, e.kind === 'flyer' ? 0.5 : 0.28);
    stainX.restore();
    for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, s = (0.1 + Math.random() * 0.25) * B; S.parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, age: 0, r: e.r * (0.15 + Math.random() * 0.2), col: K.col }); }
    float(`+${Math.round(K.score * mult)}`, e.x, e.y - e.r, mult > 1 ? PAL.ochre : PAL.cream, 0.035);
    SFX.play('splat');
    if (e.kind === 'splitter') for (let i = 0; i < 2; i++) spawnEnemy('mini', [e.x + (i ? 1 : -1) * e.r, e.y]);
    if (e.kind === 'boss') { S.shake = 1; S.cheerT = S.t; SFX.play('win'); }
  }
  function comboMult() { return 1 + Math.min(8, Math.max(0, S.combo.n - 1)) * 0.25; }

  function segDist(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
    const k = clamp(((px - ax) * vx + (py - ay) * vy) / L2);
    return Math.hypot(px - (ax + vx * k), py - (ay + vy * k));
  }

  function cast(g, pts) {
    const st = S.stats;
    let shape = g.shape;
    if (shape === 'dot') return;
    // combo: a different spell soon after the last one grows the chain
    if (S.t - S.combo.t < 3.5 && shape !== S.combo.last) S.combo.n++; else if (S.t - S.combo.t >= 3.5) S.combo.n = 1;
    S.combo.last = shape; S.combo.t = S.t;
    if (S.combo.n >= 2) float(TXT.combo(comboMult().toFixed(2).replace(/\.?0+$/, '')), CX, CY - B * 0.2, PAL.ochre, 0.05);
    S.castT = S.t;
    const name = TXT.spells[shape][0];
    float(name, g.cx, g.cy - g.size * 0.6 - 10, SHAPE_COL[shape] === PAL.ink ? PAL.cream : SHAPE_COL[shape], 0.045);

    if (shape === 'line') {
      const [ax, ay] = g.start, [bx, by] = g.end, w = B * 0.035;
      for (const e of S.enemies) if (segDist(e.x, e.y, ax, ay, bx, by) < w + e.r) damage(e, st.slash, [(ax + bx) / 2, (ay + by) / 2]);
      S.fx.push({ type: 'slash', a: [ax, ay], b: [bx, by], t0: S.t, life: 0.35 });
      SFX.play('slash'); S.shake = Math.max(S.shake, 0.25);
    } else if (shape === 'circle') {
      const r = clamp(g.r, B * 0.06, B * 0.3);
      const around = Math.hypot(g.cx - CX, g.cy - CY) < r * 0.8;
      S.shields.push({ x: around ? CX : g.cx, y: around ? CY : g.cy, r: around ? Math.max(r, B * 0.1) : r, t0: S.t, life: st.shieldT, hp: 12 + S.wave, around });
      SFX.play('shield');
    } else if (shape === 'zigzag') {
      const [ex, ey] = g.end, range = B * 0.38;
      const targets = S.enemies.filter((e) => !e.dead).map((e) => [e, Math.hypot(e.x - ex, e.y - ey)]).filter(([, d]) => d < range).sort((a, b) => a[1] - b[1]).slice(0, st.zapN);
      let prev = [ex, ey];
      const chain = [prev];
      for (const [e] of targets) { chain.push([e.x, e.y]); damage(e, st.zapDmg, prev); prev = [e.x, e.y]; }
      S.fx.push({ type: 'zap', chain, stroke: g.pts, t0: S.t, life: 0.45 });
      SFX.play('zap'); S.shake = Math.max(S.shake, 0.35);
    } else if (shape === 'triangle') {
      const R = clamp(g.size * 0.6, B * 0.08, B * 0.22) * st.fireR;
      for (const e of S.enemies) { const d = Math.hypot(e.x - g.cx, e.y - g.cy); if (d < R + e.r) { damage(e, st.fireDmg * (d < R * 0.5 ? 1.3 : 1), [g.cx, g.cy]); e.burn = 2; } }
      S.fx.push({ type: 'boom', x: g.cx, y: g.cy, r: R, t0: S.t, life: 0.6 });
      SFX.play('boom'); S.shake = Math.max(S.shake, 0.7);
    } else if (shape === 'spiral') {
      S.vortexes.push({ x: g.cx, y: g.cy, r: B * 0.26, t0: S.t, life: st.vortexT, spin: g.winding > 0 ? 1 : -1 });
      SFX.play('vortex');
    } else if (shape === 'square') {
      S.turrets.push({ x: g.cx, y: g.cy, t0: S.t, life: st.turretT, cd: 0, aim: 0 });
      SFX.play('turret');
    } else {
      // scribble: the stroke itself becomes a wall
      const P = g.pts.filter((_, i) => i % 3 === 0).concat([g.end]);
      S.walls.push({ pts: P, t0: S.t, life: st.wallT, hp: 8 + S.wave * 0.6 });
      SFX.play('wall');
    }
  }

  /* -------------------------------------------------------------- input */
  let lastMove = 0;
  cv.addEventListener('pointerdown', (e) => {
    SFX.unlock();
    if (S.mode === 'paused') { setMode('play'); return; }
    if (S.mode !== 'play') return;
    cv.setPointerCapture(e.pointerId);
    if (S.ink < 3) { float(TXT.noInk, e.clientX, e.clientY - 20, PAL.red, 0.04); SFX.play('fizzle'); return; }
    S.stroke = { pts: [[e.clientX, e.clientY]], len: 0, id: e.pointerId };
    lastMove = performance.now();
  });
  cv.addEventListener('pointermove', (e) => {
    const st = S.stroke; if (!st || st.id !== e.pointerId) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const p = st.pts[st.pts.length - 1], x = ev.clientX, y = ev.clientY, d = Math.hypot(x - p[0], y - p[1]);
      if (d < 2) continue;
      const cost = inkCost(d);
      if (S.ink < cost) { S.ink = 0; endStroke(); return; }
      S.ink -= cost; st.len += d; st.pts.push([x, y]);
      const now = performance.now(); SFX.scribble(d / Math.max(1, now - lastMove) * 1000); lastMove = now;
    }
  });
  const endStroke = () => {
    const st = S.stroke; if (!st) return;
    S.stroke = null; SFX.scribble(0);
    const g = Gesture.classify(st.pts);
    if (g.shape === 'dot') { S.ink = Math.min(S.stats.maxInk, S.ink + inkCost(st.len)); return; }
    cast(g, st.pts);
  };
  cv.addEventListener('pointerup', endStroke);
  cv.addEventListener('pointercancel', endStroke);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'p') togglePause(); });
  $('btn-pause').addEventListener('click', togglePause);
  function togglePause() { if (S.mode === 'play') setMode('paused'); else if (S.mode === 'paused') setMode('play'); }
  addEventListener('blur', () => { if (S.mode === 'play') setMode('paused'); });

  /* -------------------------------------------------------------- flow */
  function setMode(m) {
    S.mode = m;
    $('loading').hidden = m !== 'loading';
    $('title').hidden = m !== 'title';
    $('cards').hidden = m !== 'cards';
    $('over').hidden = m !== 'over' && m !== 'won';
    $('btn-pause').parentElement.hidden = m !== 'play' && m !== 'paused';
  }

  function newGame() {
    S.stats = baseStats(); S.hp = S.stats.maxHp; S.ink = S.stats.maxInk; S.score = 0; S.kills = 0; S.wave = 0; S.endless = false;
    for (const k of ['enemies', 'walls', 'shields', 'turrets', 'vortexes', 'fx', 'shots', 'floats', 'parts']) S[k] = [];
    S.combo = { n: 0, last: '', t: -9 };
    stainX.clearRect(0, 0, stainC.width, stainC.height);
    nextWave();
    setMode('play');
    SFX.music(true);
  }
  function nextWave() {
    S.wave++; planWave(S.wave); S.waveActive = true;
    banner(TXT.wave(S.wave));
    if (S.wave % 10 === 0) setTimeout(() => banner(TXT.boss, PAL.rose), 1400);
    SFX.play('wave');
  }
  function waveCleared() {
    S.waveActive = false; S.cheerT = S.t;
    banner(TXT.cleared(S.wave), PAL.sap);
    if (S.wave === 20 && !S.endless) { setTimeout(() => endGame(true), 1200); return; }
    setTimeout(() => { if (S.mode === 'play') showCards(); }, 1300);
  }

  const CARDS = [
    { ico: '▣', ko: ['잉크병 확장', '최대 잉크 +25'], en: ['Bigger inkwell', 'Max ink +25'], ok: () => true, f: (s) => { s.maxInk += 25; S.ink += 25; } },
    { ico: '≋', ko: ['빠른 펜', '잉크 회복 +5/초'], en: ['Quick pen', 'Ink regen +5/s'], ok: () => true, f: (s) => { s.regen += 5; } },
    { ico: '%', ko: ['아껴 쓰기', '주문 비용 -15%'], en: ['Thrifty strokes', 'Spells cost 15% less'], ok: () => S.stats.cost > 0.45, f: (s) => { s.cost *= 0.85; } },
    { ico: '/', ko: ['예리한 획', '베기 피해 +2'], en: ['Sharp stroke', 'Slash damage +2'], ok: () => true, f: (s) => { s.slash += 2; } },
    { ico: 'Z', ko: ['연쇄 번개', '번개가 2마리 더 튐'], en: ['Chain lightning', 'Lightning jumps 2 more'], ok: () => true, f: (s) => { s.zapN += 2; } },
    { ico: 'Δ', ko: ['큰 불꽃', '폭발 범위 +25%, 피해 +2'], en: ['Big burst', 'Burst radius +25%, damage +2'], ok: () => true, f: (s) => { s.fireR *= 1.25; s.fireDmg += 2; } },
    { ico: 'O', ko: ['튼튼한 방패', '방패 +3초'], en: ['Sturdy shield', 'Shields last 3s longer'], ok: () => true, f: (s) => { s.shieldT += 3; } },
    { ico: '□', ko: ['포탑 정비', '포탑 +6초, 연사 +25%'], en: ['Turret tune-up', 'Turrets +6s, fire 25% faster'], ok: () => true, f: (s) => { s.turretT += 6; s.turretRate *= 0.8; } },
    { ico: '@', ko: ['깊은 소용돌이', '소용돌이 +2초, 피해 두 배'], en: ['Deep vortex', 'Vortex +2s, double damage'], ok: () => true, f: (s) => { s.vortexT += 2; s.vortexDmg *= 2; } },
    { ico: '~', ko: ['두꺼운 벽', '잉크 벽 +4초'], en: ['Thick walls', 'Ink walls +4s'], ok: () => true, f: (s) => { s.wallT += 4; } },
    { ico: '♥', ko: ['반창고', '하트 2개 회복'], en: ['Band-aid', 'Heal 2 hearts'], ok: () => S.hp < S.stats.maxHp, f: () => { S.hp = Math.min(S.stats.maxHp, S.hp + 2); S.loveT = S.t; SFX.play('heal'); } },
    { ico: '+', ko: ['튼튼한 클로', '최대 하트 +1'], en: ['Hardy Clawd', 'Max hearts +1'], ok: () => S.stats.maxHp < 9, f: (s) => { s.maxHp++; S.hp++; } },
  ];
  function showCards() {
    const pool = CARDS.filter((k) => k.ok()).sort(() => Math.random() - 0.5).slice(0, 3);
    $('cards-title').textContent = TXT.cleared(S.wave);
    const box = $('choices'); box.innerHTML = '';
    for (const k of pool) {
      const b = document.createElement('button'); b.className = 'choice';
      const [name, desc] = KO ? k.ko : k.en;
      b.innerHTML = `<div class="ico">${k.ico}</div><b>${name}</b><span>${desc}</span>`;
      b.onclick = () => { SFX.play('card'); k.f(S.stats); setMode('play'); nextWave(); };
      box.append(b);
    }
    setMode('cards');
  }
  function endGame(won) {
    if (S.score > best.score) best = { score: S.score, wave: S.wave };
    try { localStorage.setItem('inkspell.best', JSON.stringify(best)); } catch {}
    $('over-title').textContent = won ? TXT.win : TXT.over;
    $('over-text').textContent = won ? TXT.winText(S.score) : TXT.overText(S.wave, S.score);
    $('btn-again').textContent = won ? (KO ? '끝없이 계속' : 'Keep going') : TXT.again;
    $('btn-again').onclick = won ? () => { S.endless = true; setMode('play'); showCards(); } : () => { SFX.play('click'); newGame(); };
    SFX.music(false);
    SFX.play(won ? 'win' : 'lose');
    setMode(won ? 'won' : 'over');
    renderBest();
  }
  function renderBest() { $('best').textContent = best.score ? TXT.best(best.score, best.wave) : ''; }

  function banner(s, col = PAL.cream) { S.floats.push({ s, x: VW / 2, y: VH * 0.2, t0: S.t, life: 1.8, col, size: 0.085, banner: true }); }
  function float(s, x, y, col, size) { S.floats.push({ s, x, y, t0: S.t, life: 1, col, size }); }

  /* ------------------------------------------------------------- update */
  function update(dt) {
    const st = S.stats;
    S.ink = Math.min(st.maxInk, S.ink + st.regen * dt * (S.stroke ? 0.3 : 1));

    // spawning
    if (S.waveActive) {
      S.spawnT -= dt;
      if (S.spawnT <= 0 && S.spawnQ.length) { spawnEnemy(S.spawnQ.shift()); S.spawnT = S.spawnGap * (0.6 + Math.random() * 0.8); }
      if (!S.spawnQ.length && !S.enemies.length) waveCleared();
    }

    // things with lifetimes
    const alive = (o) => S.t - o.t0 < o.life && (o.hp == null || o.hp > 0);
    S.walls = S.walls.filter(alive); S.shields = S.shields.filter(alive); S.turrets = S.turrets.filter(alive);
    S.vortexes = S.vortexes.filter(alive); S.fx = S.fx.filter((f) => S.t - f.t0 < f.life); S.floats = S.floats.filter((f) => S.t - f.t0 < f.life);

    // enemies
    for (const e of S.enemies) {
      if (e.dead) continue;
      const K = KIND[e.kind];
      let sp = K.sp * B * (e.slow > 0 ? 0.45 : 1) * (S.wave === 1 ? 0.8 : 1);
      e.slow = Math.max(0, e.slow - dt);
      if (e.burn > 0) { e.burn -= dt; e.hp -= dt * 1.5; if (e.hp <= 0) { kill(e); continue; } }
      let dx = CX - e.x, dy = CY - e.y; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      // flyers weave
      if (K.fly) { const w = Math.sin(S.t * 3 + e.id) * 0.6; const ox = -dy * w, oy = dx * w; dx += ox; dy += oy; }
      // vortex pull
      for (const v of S.vortexes) {
        const vx = v.x - e.x, vy = v.y - e.y, vd = Math.hypot(vx, vy);
        if (vd < v.r) {
          const k = 1 - vd / v.r;
          dx = lerp(dx, vx / (vd || 1) - (vy / (vd || 1)) * v.spin * 0.8, k * 0.9); dy = lerp(dy, vy / (vd || 1) + (vx / (vd || 1)) * v.spin * 0.8, k * 0.9);
          e.slow = 0.2; e.hp -= st.vortexDmg * dt * k * 1.6; if (e.hp <= 0) { kill(e); break; }
        }
      }
      if (e.dead) continue;
      let nx = e.x + dx * sp * dt, ny = e.y + dy * sp * dt;
      // walls (flyers pass over)
      let blocked = false;
      if (!K.fly) for (const w of S.walls) {
        for (let i = 0; i + 1 < w.pts.length; i++) {
          const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1];
          if (segDist(nx, ny, ax, ay, bx, by) < e.r + B * 0.008) { blocked = true; w.hp -= dt * (K.boss ? 20 : e.kind === 'brute' ? 3 : 1); break; }
        }
        if (blocked) break;
      }
      // shields
      for (const s of S.shields) {
        const was = Math.hypot(e.x - s.x, e.y - s.y), will = Math.hypot(nx - s.x, ny - s.y);
        if (was > s.r - e.r * 0.2 && will < s.r + e.r) { blocked = true; s.hp -= dt * (K.boss ? 25 : e.kind === 'brute' ? 4 : 1.2); }
      }
      if (blocked) { e.stuck += dt; if (K.boss) for (const w of S.walls) w.hp -= dt * 10; }
      else { e.x = nx; e.y = ny; e.stuck = 0; }
      // boss spits blots
      if (K.boss && Math.floor(S.t * 0.35 + e.id) !== Math.floor((S.t - dt) * 0.35 + e.id)) for (let i = 0; i < 2; i++) spawnEnemy('blot', [e.x + jit(e.r), e.y + jit(e.r)]);
      // reach Clawd
      if (Math.hypot(e.x - CX, e.y - CY) < e.r + B * 0.055) {
        e.dead = true; S.hp -= K.boss ? 3 : e.kind === 'brute' ? 2 : 1; S.hurtT = S.t; S.shake = 1; S.combo.n = 0;
        SFX.play('hurt');
        stainX.save(); stainX.scale(DPR, DPR); INK.splat(stainX, e.x, e.y, e.r, K.col, e.id, 0.2); stainX.restore();
        if (S.hp <= 0) { S.hp = 0; endGame(false); return; }
      }
    }
    S.enemies = S.enemies.filter((e) => !e.dead);

    // turrets
    for (const tu of S.turrets) {
      tu.cd -= dt;
      const tgt = nearest(tu.x, tu.y, B * 0.38);
      if (tgt) tu.aim = Math.atan2(tgt.y - tu.y, tgt.x - tu.x);
      if (tgt && tu.cd <= 0) { tu.cd = st.turretRate; S.shots.push({ x: tu.x, y: tu.y, tgt, sp: B * 1.1 }); SFX.play('pew'); }
    }
    for (const sh of S.shots) {
      if (sh.tgt.dead) { sh.done = true; continue; }
      const dx = sh.tgt.x - sh.x, dy = sh.tgt.y - sh.y, d = Math.hypot(dx, dy);
      if (d < sh.tgt.r) { damage(sh.tgt, 1, [sh.x, sh.y]); sh.done = true; continue; }
      sh.x += (dx / d) * sh.sp * dt; sh.y += (dy / d) * sh.sp * dt;
    }
    S.shots = S.shots.filter((s) => !s.done);
    for (const p of S.parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    S.parts = S.parts.filter((p) => p.age < p.life);
    S.shake = Math.max(0, S.shake - dt * 2.5);
  }
  function nearest(x, y, range) {
    let b = null, bd = range;
    for (const e of S.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } }
    return b;
  }

  /* ------------------------------------------------------------- render */
  function clawdFace() {
    const t = S.t;
    if (S.mode === 'over') return 'ko';
    if (S.mode === 'won') return 'win';
    if (t - S.hurtT < 0.8) return 'hurt';
    if (t - S.loveT < 1.5) return 'love';
    if (t - S.cheerT < 1.6) return 'cheer';
    if (t - S.castT < 0.5) return 'cast';
    if (S.mode === 'title') return 'title';
    const nearE = S.enemies.some((e) => Math.hypot(e.x - CX, e.y - CY) < B * 0.2);
    if (nearE) return 'scared';
    return S.mode === 'paused' ? 'sleepy' : 'idle';
  }

  function drawEnemy(e) {
    const K = KIND[e.kind], t = S.t, flash = t - e.hitT < 0.1;
    boil(t, e.id);
    const wob = Math.sin(t * 8 + e.id) * 0.06, r = e.r;
    const look = Math.atan2(CY - e.y, CX - e.x);
    c.save(); c.translate(e.x, e.y);
    if (K.fly) {
      // paper plane
      c.rotate(look);
      const P = [[r * 1.4, 0], [-r, -r * 0.9], [-r * 0.5, 0], [-r, r * 0.9]].map(([x, y]) => [x + jit(1), y + jit(1)]);
      INK.blob(c, P, { wash: flash ? '#fff' : K.col, ink: PAL.ink, sw: 1.6, smooth: false, rim: false });
      INK.inkLine(c, [[-r * 0.5, 0], [r * 1.2, 0]], 1.2);
      c.restore(); return;
    }
    if (K.boss) {
      // the Great Eraser: a pink rubber block with a paper sleeve
      c.rotate(Math.sin(t * 2) * 0.05);
      const w = r * 1.7, h = r * 1.15;
      INK.blob(c, INK.rectPts(-w / 2, -h / 2, w, h, 2), { wash: flash ? '#fff' : K.col, ink: PAL.ink, sw: 3, smooth: false, pool: [-w * 0.2, -h * 0.25, w * 0.4] });
      INK.blob(c, INK.rectPts(-w / 2, -h / 2, w * 0.45, h, 2), { wash: PAL.indigo, ink: PAL.ink, sw: 2.5, smooth: false });
      INK.text(c, 'ERASE', -w * 0.27, 0, r * 0.28, PAL.cream, { font: '"Permanent Marker"', rot: -Math.PI / 2, shadow: false });
      eyes(w * 0.18, -h * 0.08, r * 0.2, look, true);
      INK.inkLine(c, [[w * 0.05, h * 0.25], [w * 0.2, h * 0.18], [w * 0.35, h * 0.25]], 2.5);
      // health bar
      c.restore();
      c.save(); c.fillStyle = rgba(PAL.ink, 0.3); c.fillRect(e.x - w / 2, e.y - h / 2 - 14, w, 6); c.fillStyle = PAL.red; c.fillRect(e.x - w / 2, e.y - h / 2 - 14, w * (e.hp / e.max), 6); c.restore();
      return;
    }
    c.scale(1 + wob, 1 - wob);
    let P = INK.lumpPts(0, 0, r, e.id, e.kind === 'brute' ? 12 : 14, e.kind === 'runner' ? 0.12 : 0.2, r * 0.05);
    if (e.kind === 'runner') P = P.map(([x, y]) => { const a = Math.atan2(y, x) - look; const tail = Math.max(0, -Math.cos(a)) * 0.7; return [x * (1 + tail * Math.abs(Math.cos(Math.atan2(y, x)))), y]; });
    INK.blob(c, P, { wash: flash ? '#fff' : K.col, ink: PAL.ink, sw: e.kind === 'brute' ? 2.8 : 1.8, pool: [-r * 0.3, -r * 0.35, r * 0.6], poolCol: '#b9a7d6' });
    if (e.burn > 0) { c.globalAlpha = 0.5; INK.blob(c, INK.ellPts(0, -r * 0.2, r * 0.8, r * 0.6, 10, r * 0.15), { wash: '#EE6A3A', rim: false }); c.globalAlpha = 1; }
    eyes(0, -r * 0.1, r * (e.kind === 'brute' ? 0.22 : 0.3), look, e.kind === 'brute');
    if (e.kind === 'brute') { // teeth
      const tw = r * 0.18;
      for (let i = -2; i <= 1; i++) INK.blob(c, [[i * tw, r * 0.3], [(i + 1) * tw, r * 0.3], [(i + 0.5) * tw, r * 0.5]], { wash: PAL.cream, ink: PAL.ink, sw: 1, smooth: false, rim: false });
    }
    if (e.hp < e.max && e.kind !== 'mini') { c.fillStyle = rgba(PAL.ink, 0.25); c.fillRect(-r, r + 5, r * 2, 3); c.fillStyle = PAL.cream; c.fillRect(-r, r + 5, r * 2 * clamp(e.hp / e.max), 3); }
    c.restore();
  }
  function eyes(x, y, s, look, angry) {
    for (const sd of [-1, 1]) {
      const ex = x + sd * s * 1.1, ey = y;
      c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(ex, ey, s * 0.75, s, 0, 0, TAU); c.fill();
      c.fillStyle = PAL.ink; c.beginPath(); c.arc(ex + Math.cos(look) * s * 0.35, ey + Math.sin(look) * s * 0.4, s * 0.38, 0, TAU); c.fill();
      if (angry) INK.inkLine(c, [[ex - s * 0.8, ey - s * (sd < 0 ? 1.3 : 0.9)], [ex + s * 0.8, ey - s * (sd < 0 ? 0.9 : 1.3)]], 2);
    }
  }

  function drawWorld(t) {
    // walls
    for (const w of S.walls) {
      boil(t, 5000 + Math.round(w.t0 * 100));
      const k = 1 - (t - w.t0) / w.life, fade = clamp(k * 4);
      const P = w.pts.map(([x, y]) => [x + jit(1.2), y + jit(1.2)]);
      c.save(); c.globalAlpha = 0.35 * fade; c.strokeStyle = PAL.ink; c.lineWidth = B * 0.022; c.lineCap = 'round'; c.lineJoin = 'round';
      INK.path(c, P, false, true); c.stroke(); c.restore();
      INK.inkLine(c, P, B * 0.009, PAL.ink, false, fade);
    }
    // vortexes
    for (const v of S.vortexes) {
      const age = t - v.t0, k = clamp(age * 3) * clamp((v.life - age) * 2);
      c.save(); c.translate(v.x, v.y); c.globalAlpha = 0.18 * k;
      const g = c.createRadialGradient(0, 0, 0, 0, 0, v.r); g.addColorStop(0, PAL.violet); g.addColorStop(1, rgba(PAL.violet, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, v.r, 0, TAU); c.fill(); c.globalAlpha = k;
      for (let arm = 0; arm < 3; arm++) {
        const P = []; for (let i = 0; i < 22; i++) { const a = arm * TAU / 3 + i * 0.28 * v.spin + age * 4 * v.spin, rr = v.r * (1 - i / 24); P.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        boil(t, 7000 + arm); INK.inkLine(c, P, 2.2, PAL.violet);
      }
      c.restore();
    }
    // shields
    for (const s of S.shields) {
      const age = t - s.t0, k = backOut(clamp(age * 4)) * clamp((s.life - age) * 2);
      boil(t, 9000 + Math.round(s.t0 * 100));
      const P = INK.ellPts(s.x, s.y, s.r * k, s.r * k, 26, 1.5);
      c.save(); c.globalAlpha = 0.22 * k; c.fillStyle = PAL.sky; INK.path(c, P, true, true); c.fill(); c.restore();
      INK.inkLine(c, P, 2.4, mix(PAL.sky, PAL.indigo, 0.5), true, k);
      c.save(); c.globalAlpha = 0.5 * k; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(s.x, s.y, s.r * k * 0.82, -2.4, -1.6); c.stroke(); c.restore();
    }
    // enemies
    for (const e of S.enemies) drawEnemy(e);
    // Clawd
    const face = clawdFace();
    if (face !== S.face) { S.face = face; S.faceT = t; }
    const take = Math.exp(-(t - S.faceT) * 7) * Math.sin((t - S.faceT) * 20) * 0.12;
    const hurtShake = t - S.hurtT < 0.4 ? Math.sin(t * 60) * B * 0.008 : 0;
    if (S.mode !== 'title') ClawdSprites.draw(c, face, CX + hurtShake, CY + B * 0.07, B * 0.14, t, { sq: take });
    // turrets
    for (const tu of S.turrets) {
      const age = t - tu.t0, k = backOut(clamp(age * 4)) * clamp((tu.life - age) * 2), r = B * 0.03 * k;
      boil(t, 11000 + Math.round(tu.t0 * 100));
      c.save(); c.translate(tu.x, tu.y);
      INK.blob(c, INK.ellPts(0, r * 0.3, r * 1.2, r * 0.5, 14, 1), { wash: rgba(PAL.ink, 0.25), ink: null, rim: false });
      INK.blob(c, INK.rectPts(-r, -r, r * 2, r * 1.6, 1), { wash: PAL.teal, ink: PAL.ink, sw: 2, smooth: false });
      c.rotate(tu.aim);
      INK.blob(c, INK.rectPts(0, -r * 0.25, r * 1.5, r * 0.5, 0.5), { wash: PAL.ink, ink: null, smooth: false, rim: false });
      c.restore();
      eyes(tu.x, tu.y - r * 0.2, r * 0.28, tu.aim, false);
    }
    for (const sh of S.shots) { c.fillStyle = PAL.ink; c.beginPath(); c.arc(sh.x, sh.y, B * 0.007, 0, TAU); c.fill(); }
    // spell effects
    for (const f of S.fx) {
      const age = t - f.t0, k = age / f.life;
      if (f.type === 'slash') {
        c.save(); c.globalAlpha = 1 - k; c.strokeStyle = PAL.red; c.lineCap = 'round';
        c.lineWidth = B * 0.03 * (1 - k); c.beginPath(); c.moveTo(...f.a); c.lineTo(...f.b); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = B * 0.008 * (1 - k); c.stroke(); c.restore();
      } else if (f.type === 'zap') {
        boil(t * 3, 13000);
        c.save(); c.globalAlpha = 1 - k;
        for (let i = 0; i + 1 < f.chain.length; i++) {
          const [ax, ay] = f.chain[i], [bx, by] = f.chain[i + 1], P = [];
          for (let s = 0; s <= 8; s++) { const q = s / 8; P.push([lerp(ax, bx, q) + (s % 8 ? jit(B * 0.02) : 0), lerp(ay, by, q) + (s % 8 ? jit(B * 0.02) : 0)]); }
          INK.inkLine(c, P, 5, PAL.ochre); INK.inkLine(c, P, 2, '#fff');
        }
        c.restore();
      } else if (f.type === 'boom') {
        const R = f.r * ease(clamp(k * 2.5));
        c.save(); c.globalAlpha = 1 - k;
        boil(t, 15000 + Math.round(f.t0 * 100));
        INK.blob(c, INK.lumpPts(f.x, f.y, R, Math.round(f.t0 * 100), 16, 0.25, R * 0.04), { wash: '#F4A640', ink: PAL.ink, sw: 2.5, pool: [f.x, f.y, R * 0.7], poolCol: '#FFF1B8' });
        INK.blob(c, INK.lumpPts(f.x, f.y, R * 0.55, Math.round(f.t0 * 100) + 1, 12, 0.3), { wash: '#EE6A3A', ink: null, rim: false });
        c.restore();
      }
    }
    // particles
    for (const p of S.parts) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    // the stroke being drawn
    if (S.stroke && S.stroke.pts.length > 1) {
      const P = S.stroke.pts, g = P.length > 5 ? Gesture.classify(P) : { shape: 'scribble' };
      const col = SHAPE_COL[g.shape] || PAL.ink;
      c.save(); c.globalAlpha = 0.25; c.strokeStyle = col; c.lineWidth = B * 0.018; c.lineCap = 'round'; c.lineJoin = 'round';
      INK.path(c, P, false, true); c.stroke(); c.restore();
      boil(t, 17000); INK.inkLine(c, P, B * 0.006, PAL.ink);
      if (g.shape !== 'dot') INK.text(c, TXT.spells[g.shape][0], P.at(-1)[0] + 18, P.at(-1)[1] - 22, B * 0.035, col === PAL.ink ? PAL.cream : col, { align: 'left' });
    }
  }

  function drawHUD(t) {
    const pad = 14, s = B * 0.045;
    // hearts
    for (let i = 0; i < S.stats.maxHp; i++) {
      boil(t, 20000 + i);
      const full = i < S.hp, x = pad + s * 0.6 + i * s * 1.25, y = pad + s * 0.6 + (full && t - S.hurtT < 0.5 ? Math.sin(t * 40) * 2 : 0);
      INK.blob(c, INK.heartPts(x, y, s * 0.5), { wash: full ? '#E2476E' : rgba(PAL.ink, 0.12), ink: PAL.ink, sw: 1.6 });
    }
    // ink bottle
    const bx = pad, by = pad + s * 1.5, bw = Math.min(VW * 0.42, B * 0.5), bh = s * 0.55;
    c.save(); c.fillStyle = rgba(PAL.cream, 0.8); c.fillRect(bx, by, bw, bh);
    const k = S.ink / S.stats.maxInk;
    c.fillStyle = k < 0.2 ? PAL.red : PAL.ink; c.fillRect(bx, by, bw * k, bh); c.restore();
    boil(t, 20100); INK.inkLine(c, INK.rectPts(bx, by, bw, bh, 1), 1.8, PAL.ink, true);
    INK.text(c, `${Math.floor(S.ink)}`, bx + bw + 8, by + bh / 2, s * 0.55, PAL.ink, { align: 'left', shadow: false });
    // wave + score
    INK.text(c, TXT.wave(S.wave), VW - 70, pad + s * 0.5, s * 0.75, PAL.ink, { align: 'right', shadow: false });
    INK.text(c, `${S.score}`, VW - 70, pad + s * 1.35, s * 0.9, PAL.clay, { align: 'right', font: '"Permanent Marker"', weight: 400 });
    if (S.combo.n >= 2 && t - S.combo.t < 3.5) INK.text(c, TXT.combo(comboMult().toFixed(2).replace(/\.?0+$/, '')), VW - 70, pad + s * 2.2, s * 0.6, PAL.ochre, { align: 'right' });
    // legend (bottom): which shape does what
    const items = ['line', 'circle', 'zigzag', 'triangle', 'spiral', 'square'];
    const lw = Math.min(VW - 20, 620), cw = lw / items.length, ly = VH - s * 1.25 - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab')) || 0);
    c.save(); c.globalAlpha = 0.85;
    items.forEach((sh, i) => {
      const x = (VW - lw) / 2 + cw * (i + 0.5);
      drawGlyph(c, sh, x - cw * 0.3, ly, Math.min(s * 0.7, cw * 0.3), SHAPE_COL[sh]);
      INK.text(c, TXT.spells[sh][0], x - cw * 0.1, ly, Math.min(s * 0.5, cw * 0.17), PAL.ink, { align: 'left', shadow: false });
    });
    c.restore();
    // floating texts
    for (const f of S.floats) {
      const age = t - f.t0, k = age / f.life;
      const size = B * f.size * (f.banner ? backOut(clamp(age * 3)) : 1);
      INK.text(c, f.s, f.x, f.y - (f.banner ? 0 : k * 30), size, f.col, { alpha: 1 - clamp((k - 0.7) / 0.3), font: f.banner ? '"Permanent Marker", "Gaegu"' : undefined, weight: f.banner ? 400 : 700 });
    }
    if (S.mode === 'paused') INK.text(c, TXT.paused, VW / 2, VH / 2, B * 0.05, PAL.cream);
  }

  // Little drawings of each shape, used in the legend and on the title card.
  function drawGlyph(g, shape, x, y, s, col) {
    boil(S.t, 30000 + shape.length);
    let P;
    if (shape === 'line') P = [[x - s * 0.5, y + s * 0.35], [x + s * 0.5, y - s * 0.35]];
    else if (shape === 'circle') P = INK.ellPts(x, y, s * 0.45, s * 0.42, 14, 0.5).concat([[x + s * 0.45, y + 0.5]]);
    else if (shape === 'zigzag') P = [[x - s * 0.55, y + s * 0.3], [x - s * 0.2, y - s * 0.35], [x + s * 0.15, y + s * 0.3], [x + s * 0.55, y - s * 0.35]];
    else if (shape === 'triangle') P = [[x, y - s * 0.45], [x + s * 0.5, y + s * 0.4], [x - s * 0.5, y + s * 0.4], [x, y - s * 0.45]];
    else if (shape === 'square') P = [[x - s * 0.42, y - s * 0.42], [x + s * 0.42, y - s * 0.42], [x + s * 0.42, y + s * 0.42], [x - s * 0.42, y + s * 0.42], [x - s * 0.42, y - s * 0.42]];
    else if (shape === 'spiral') { P = []; for (let i = 0; i < 30; i++) { const a = i * 0.45, r = s * 0.05 + i * s * 0.016; P.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } }
    else { P = []; for (let i = 0; i < 10; i++) P.push([x - s * 0.5 + i * s * 0.11, y + Math.sin(i * 1.9) * s * 0.3]); }
    INK.inkLine(g, P, Math.max(1.4, s * 0.09), col);
  }

  /* --------------------------------------------------------------- loop */
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (S.mode !== 'paused' && S.mode !== 'loading') S.t += dt;
    if (S.mode === 'play') update(dt);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(paperC, 0, 0);
    c.drawImage(stainC, 0, 0);
    const sh = S.shake * B * 0.012;
    c.setTransform(DPR, 0, 0, DPR, (Math.random() - 0.5) * sh * DPR, (Math.random() - 0.5) * sh * DPR);
    if (S.mode !== 'loading') {
      drawWorld(S.t);
      if (S.mode === 'play' || S.mode === 'paused' || S.mode === 'cards') drawHUD(S.t);
    }
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0, VW, VH); c.globalCompositeOperation = 'source-over';
    if (S.mode === 'title' || S.mode === 'over' || S.mode === 'won') {
      for (const tc of document.querySelectorAll('.clawd-portrait')) {
        if (!tc.offsetParent) continue;
        const g = tc.getContext('2d');
        g.clearRect(0, 0, tc.width, tc.height);
        ClawdSprites.draw(g, S.mode === 'title' ? 'title' : S.mode === 'won' ? 'win' : 'ko', tc.width / 2, tc.height * 0.93, tc.width * 0.42, S.t);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* --------------------------------------------------------------- boot */
  function renderSpellList() {
    const ul = $('spell-list'); ul.innerHTML = '';
    for (const sh of ['line', 'circle', 'zigzag', 'triangle', 'spiral', 'square', 'scribble']) {
      const li = document.createElement('li'), k = document.createElement('canvas');
      k.width = 108; k.height = 80; const g = k.getContext('2d'); g.scale(2, 2);
      drawGlyph(g, sh, 27, 20, 30, SHAPE_COL[sh]);
      const [name, how] = TXT.spells[sh];
      li.append(k); li.insertAdjacentHTML('beforeend', `<b>${name}</b>${how}`);
      ul.append(li);
    }
  }
  function renderSound() { $('btn-sound').textContent = TXT.sound(SFX.on); }
  $('btn-sound').addEventListener('click', () => { SFX.setOn(!SFX.on); renderSound(); SFX.play('click'); });
  $('btn-start').addEventListener('click', () => { SFX.unlock(); SFX.play('card'); newGame(); });

  async function boot() {
    setMode('loading');
    $('load-text').textContent = TXT.loading;
    // every look Clawd needs, painted once (wizard hat: Clawd is the ink mage)
    const hat = { hat: 'wizard' };
    const specs = [
      { key: 'idle', emotion: 'neutral', frames: 6, over: hat },
      { key: 'title', emotion: 'happy', frames: 6, over: hat },
      { key: 'cast', emotion: 'determined', frames: 4, over: { ...hat, aR: 1.5 } },
      { key: 'scared', emotion: 'scared', frames: 4, over: hat },
      { key: 'hurt', emotion: 'angry', frames: 3, over: hat },
      { key: 'cheer', emotion: 'excited', frames: 6, over: hat },
      { key: 'love', emotion: 'love', frames: 4, over: hat },
      { key: 'ko', emotion: 'ko', frames: 4, over: hat },
      { key: 'win', emotion: 'starstruck', frames: 6, over: { hat: 'crown' } },
      { key: 'sleepy', emotion: 'sleepy', frames: 4, over: hat },
    ];
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; });
    renderSpellList(); renderSound(); renderBest();
    S.stats = baseStats();
    setMode('title');
  }
  boot();
  window.__inkspell = S;   // for testing
  window.__inkcast = (pts) => cast(Gesture.classify(pts), pts);
})();
