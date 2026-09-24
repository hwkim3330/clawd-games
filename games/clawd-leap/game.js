// Clawd Leap — a hand-painted platformer. Stomp ink blots, bump stamp boxes, wear the ink hat to throw ink,
// and reach the bookmark at the end of each page. Four stages; the last one has the Great Eraser.

(() => {
  const { PAL, TAU, clamp, lerp, backOut, mix, rgba, boil, jit, hash } = INK;
  const TS = Platformer.TS;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
  const T = KO ? {
    lead: '잉크 괴물을 밟고, 도장 상자를 치고, 책갈피까지 달려라!', more: '다른 게임', loading: '클로를 그리는 중…',
    keys: '<kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>Space</kbd> 점프 · <kbd>X</kbd> 달리기/잉크 던지기 · <kbd>↓</kbd> 발판 내려가기',
    stage: (i) => `스테이지 ${i + 1}`, clear: '페이지 통과!', clearText: (d, s) => `잉크 방울 ${d}개 · 점수 ${s}`, next: '다음 페이지', retry: '다시', menu: '처음으로',
    dead: '앗, 잉크투성이!', deadText: '하트를 다 잃었어요.', win: '지우개 대마왕을 물리쳤다!', winText: (s) => `모든 페이지를 지켰어요. 최종 점수 ${s}`,
    sound: (v) => (v ? '소리 켬' : '소리 끔'), boss: '지우개 대마왕', hat: '잉크 모자! X로 잉크 던지기', heart: '하트 +1', check: '체크포인트',
  } : {
    lead: 'Stomp ink blots, bump stamp boxes, and run for the bookmark!', more: 'More games', loading: 'Painting Clawd…',
    keys: '<kbd>←</kbd><kbd>→</kbd> move · <kbd>Space</kbd> jump · <kbd>X</kbd> run / throw ink · <kbd>↓</kbd> drop through ledges',
    stage: (i) => `Stage ${i + 1}`, clear: 'Page cleared!', clearText: (d, s) => `${d} ink drops · score ${s}`, next: 'Next page', retry: 'Retry', menu: 'Menu',
    dead: 'Oops, all inky!', deadText: 'Out of hearts.', win: 'The Great Eraser is beaten!', winText: (s) => `Every page is safe. Final score ${s}`,
    sound: (v) => (v ? 'Sound on' : 'Sound off'), boss: 'The Great Eraser', hat: 'Ink hat! Press X to throw ink', heart: 'Heart +1', check: 'Checkpoint',
  };
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
  document.querySelectorAll('[data-t-html]').forEach((el) => { el.innerHTML = T[el.dataset.tHtml]; });

  /* ------------------------------------------------------------ themes */
  const THEMES = [
    { name: 'meadow', sky: '#EAF2F5', paperOp: 0.75, top: '#7FB069', dirt: '#C89F74', stone: '#B9B0A2', brick: '#C9744E', hill: '#B7D3A0', hill2: '#9DC28A' },
    { name: 'cave', sky: '#2A2440', paperOp: 0.12, top: '#6C5B8F', dirt: '#4A3E63', stone: '#5C5470', brick: '#7A4E6B', hill: '#3A3155', hill2: '#453A63', dark: true },
    { name: 'sky', sky: '#D8ECF7', paperOp: 0.6, top: '#F4F0FF', dirt: '#E6DDF2', stone: '#CFC6E0', brick: '#E0A0B4', hill: '#FFFFFF', hill2: '#EEF6FB', clouds: true },
    { name: 'castle', sky: '#3B2E3E', paperOp: 0.15, top: '#8B7A8C', dirt: '#5E4E60', stone: '#6E6272', brick: '#8E4E5E', hill: '#4A3A4C', hill2: '#574659', dark: true },
  ];

  const tile = (fn) => fn;
  const TILES = {
    '#': (g, th) => { INK.blob(g, INK.rectPts(0, 0, TS, TS, 0.6), { wash: th.dirt, ink: null, smooth: false, rim: false }); INK.blob(g, INK.rectPts(-1, -2, TS + 2, 10, 0.8), { wash: th.top, ink: PAL.ink, sw: 1.4, smooth: false }); for (let i = 0; i < 3; i++) { g.fillStyle = rgba(PAL.ink, 0.18); g.beginPath(); g.arc(6 + i * 10 + jit(2), 18 + jit(6), 1.6, 0, TAU); g.fill(); } },
    'D': (g, th) => { INK.blob(g, INK.rectPts(0, 0, TS, TS, 0.4), { wash: th.dirt, ink: null, smooth: false, rim: false }); for (let i = 0; i < 3; i++) { g.fillStyle = rgba(PAL.ink, 0.14); g.beginPath(); g.arc(5 + Math.random() * 22, 5 + Math.random() * 22, 1.5, 0, TAU); g.fill(); } },
    'X': (g, th) => { INK.blob(g, INK.rectPts(0.5, 0.5, TS - 1, TS - 1, 0.7), { wash: th.stone, ink: PAL.ink, sw: 1.6, smooth: false, pool: [8, 8, 14] }); INK.inkLine(g, [[4, TS - 7], [TS - 6, TS - 7]], 0.8, rgba(PAL.ink, 0.5)); },
    'B': (g, th) => { INK.blob(g, INK.rectPts(0.5, 0.5, TS - 1, TS - 1, 0.6), { wash: th.brick, ink: PAL.ink, sw: 1.6, smooth: false }); for (const y of [10.5, 21.5]) INK.inkLine(g, [[1, y], [TS - 1, y]], 0.9); for (const [x, y0, y1] of [[16, 0, 10], [8, 10, 21], [24, 10, 21], [16, 21, 32]]) INK.inkLine(g, [[x, y0], [x, y1]], 0.9); },
    '?': (g) => { INK.blob(g, INK.rectPts(0.5, 0.5, TS - 1, TS - 1, 0.6), { wash: PAL.ochre, ink: PAL.ink, sw: 1.8, smooth: false, pool: [10, 8, 14] }); INK.blob(g, INK.starPts(16, 16, 9, 0.45, 5), { wash: PAL.cream, ink: PAL.ink, sw: 1.2, smooth: false }); },
    'H': (g, th) => TILES['?'](g, th), 'L': (g, th) => TILES['?'](g, th),
    'U': (g) => { INK.blob(g, INK.rectPts(0.5, 0.5, TS - 1, TS - 1, 0.6), { wash: '#B8A68A', ink: PAL.ink, sw: 1.6, smooth: false }); for (const [x, y] of [[6, 6], [26, 6], [6, 26], [26, 26]]) { g.fillStyle = PAL.ink; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); } },
    '=': (g, th) => { INK.blob(g, INK.rectPts(0, 1, TS, 9, 0.8), { wash: th.clouds ? '#FFFFFF' : PAL.cream, ink: PAL.ink, sw: 1.4, smooth: !!th.clouds }); INK.inkLine(g, [[3, 13], [TS - 3, 13]], 0.6, rgba(PAL.ink, 0.4)); },
    '^': (g) => { for (let i = 0; i < 3; i++) { const x = i * 10.7; INK.blob(g, [[x + 1, TS], [x + 5.3, TS - 18 + jit(1)], [x + 9.6, TS]], { wash: '#E8C06A', ink: PAL.ink, sw: 1.2, smooth: false, rim: false }); INK.blob(g, [[x + 3.8, TS - 12], [x + 5.3, TS - 18], [x + 6.8, TS - 12]], { wash: PAL.ink, ink: null, smooth: false, rim: false }); } },
  };

  /* --------------------------------------------------------- the game */
  const S = { score: 0, drops: 0, hearts: 3, maxHearts: 3, hat: false, unlocked: 1, check: null, levelDrops: 0, bossHp: 0 };
  try { S.unlocked = Math.max(1, +localStorage.getItem('clawdleap.unlocked') || 1); } catch {}

  const G = Platformer.create({
    canvas: $('game'), viewTiles: 13, tiles: TILES, themes: THEMES, levels: LEVELS,
    solid: new Set(['#', 'D', 'X', 'B', '?', 'H', 'L', 'U']), oneway: new Set(['=']), hazard: new Set(['^']),
    legend: { '@': { spawn: 'player' }, o: { spawn: 'drop' }, e: { spawn: 'blot' }, p: { spawn: 'plane' }, s: { spawn: 'spiky' }, c: { spawn: 'check' }, F: { spawn: 'goal' }, K: { spawn: 'boss' } },
    spawn, update, drawHUD, drawBackdrop, onPause: togglePause, afterFrame,
  });

  /* ---------------------------------------------------------- player */
  function makePlayer(x, y) {
    return { kind: 'player', x, y, vx: 0, vy: 0, w: 22, h: 22, face: 1, inv: 0, walkD: 0, z: 5, shootCD: 0, landT: -9, air: 0,
      update(G, dt) {
        const r = G.platformPhysics(this, dt);
        if (r.jumped) SFX.play('jump');
        if (r.ground && this.air > 0.25) { this.landT = G.t; G.puff(this.x, this.y, rgba(PAL.ink, 0.25), 4, 60); }
        this.air = r.ground ? 0 : this.air + dt;
        this.walkD += Math.abs(this.vx) * dt / 40;
        this.inv = Math.max(0, this.inv - dt); this.shootCD = Math.max(0, this.shootCD - dt);
        if (r.bumped) bump(r.bumped[0], r.bumped[1]);
        if (S.hat && G.input.hit('act') && this.shootCD <= 0) { this.shootCD = 0.3; G.ents.push(makeShot(this.x + this.face * 14, this.y - 12, this.face)); SFX.play('pew'); }
        if (G.touchesHazard(this)) hurt(this);
        if (this.y > G.level.h * TS + 60) fell();
      },
      draw(G, c) {
        if (this.inv > 0 && Math.floor(G.t * 16) % 2) return;
        const ground = G.onGround(this), moving = Math.abs(this.vx) > 20;
        const base = S.hat ? 'H' : '';
        let key = 'stand', t = G.t;
        if (!ground) key = this.vy < 0 ? 'jump' : 'fall';
        else if (moving) { key = 'run'; t = this.walkD / 12 * (8 / 8); }
        if (G.t - hurtT < 0.5) key = 'hurt';
        const land = G.t - this.landT < 0.2 ? Math.sin((G.t - this.landT) / 0.2 * Math.PI) * 0.16 : 0;
        const stretch = !ground ? clamp(-this.vy / 3000, -0.08, 0.1) : 0;
        ClawdSprites.draw(c, key + base, this.x, this.y + 1, 30, key === 'run' ? this.walkD * 1.5 : t, { flip: this.face < 0, sq: land - stretch });
      },
    };
  }
  let hurtT = -9;
  function hurt(p, from) {
    if (p.inv > 0) return;
    if (S.hat) { S.hat = false; G.float(KO ? '모자를 잃었다!' : 'Lost the hat!', p.x, p.y - 40, PAL.cream); }
    else S.hearts--;
    p.inv = 1.4; hurtT = G.t; G.shake = 0.6; SFX.play('hurt');
    p.vy = -380; p.vx = (from ? Math.sign(p.x - from.x) || -p.face : -p.face) * 220;
    if (S.hearts <= 0) setTimeout(gameOver, 500);
  }
  function fell() {
    S.hearts--; SFX.play('hurt'); G.shake = 0.8;
    if (S.hearts <= 0) { G.player.dead = true; gameOver(); return; }
    const p = G.player, c = S.check || G.level.spawns.find((s) => s.kind === 'player');
    p.x = c.x; p.y = c.y - 2; p.vx = p.vy = 0; p.inv = 1.5;
  }

  /* ------------------------------------------------------------ boxes */
  const boxContents = {};
  function bump(tx, ty) {
    const ch = G.tileAt(tx, ty), x = tx * TS + TS / 2, y = ty * TS;
    // anything standing on the bumped tile gets knocked
    for (const e of G.ents) if (e.enemy && !e.dead && Math.abs(e.x - x) < TS && Math.abs(e.y - y) < 6) squash(e, true);
    if (ch === 'B') {
      G.setTile(tx, ty, ' '); G.puff(x, y + TS / 2, th().brick, 10, 220); SFX.play('hit'); S.score += 10;
    } else if (ch === '?' || ch === 'H' || ch === 'L') {
      G.setTile(tx, ty, 'U'); G.ents.push(bounceBox(tx, ty));
      if (ch === '?') { S.drops++; S.levelDrops++; S.score += 100; SFX.play('coin'); G.ents.push(popDrop(x, y)); }
      else G.ents.push(makeItem(ch === 'H' ? 'hat' : 'heart', x, y));
    } else SFX.play('click');
  }
  const th = () => G.theme;
  function bounceBox(tx, ty) {   // the spent box hops once when hit
    return { t0: G.t, z: 1, update(G) { if (G.t - this.t0 > 0.2) this.dead = true; }, draw(G, c) { const k = Math.sin((G.t - this.t0) / 0.2 * Math.PI) * 6; c.drawImage(G.atlas.U[0], tx * TS - 2, ty * TS - 2 - k, TS + 8, TS + 8); } };
  }
  function popDrop(x, y) { return { x, y, vy: -420, t0: G.t, z: 6, update(G, dt) { this.vy += 1400 * dt; this.y += this.vy * dt; if (G.t - this.t0 > 0.5) this.dead = true; }, draw(G, c) { drawDrop(c, this.x, this.y - 10, G.t, 1); } }; }
  function drawDrop(c, x, y, t, k = 1) {
    boil(t, Math.round(x));
    const s = 7 * k, w = Math.abs(Math.cos(t * 4 + x * 0.1));
    INK.blob(c, [[x, y - s * 1.5], [x + s * w, y], [x, y + s], [x - s * w, y]], { wash: PAL.indigo, ink: PAL.ink, sw: 1.2, pool: [x - 2, y - 2, s] });
  }
  function makeItem(type, x, y) {
    return { kind: type, x, y: y, vx: 60, vy: -300, w: 20, h: 20, z: 4, rise: 0.4,
      update(G, dt) {
        if (this.rise > 0) { this.rise -= dt; this.y -= 60 * dt; return; }
        if (type === 'heart') { this.vy = Math.min(this.vy + 1200 * dt, 500); const r = G.move(this, dt); if (r.left || r.right) this.vx *= -1; }
        if (G.overlap(this, G.player)) {
          this.dead = true;
          if (type === 'hat') { S.hat = true; G.float(T.hat, this.x, this.y - 40, PAL.ochre, 16); SFX.play('heal'); }
          else { S.hearts = Math.min(S.maxHearts + 2, S.hearts + 1); G.float(T.heart, this.x, this.y - 30, PAL.rose); SFX.play('heal'); }
          S.score += 500;
        }
      },
      draw(G, c) {
        boil(G.t, 900);
        const bob = Math.sin(G.t * 5) * 2;
        if (type === 'hat') {
          INK.blob(c, [[this.x - 13, this.y - 4 + bob], [this.x + 2, this.y - 26 + bob], [this.x + 13, this.y - 4 + bob]], { wash: PAL.indigo, ink: PAL.ink, sw: 1.6, smooth: false });
          INK.blob(c, INK.starPts(this.x + 1, this.y - 12 + bob, 4, 0.45, 5), { wash: PAL.ochre, ink: null, smooth: false });
        } else INK.blob(c, INK.heartPts(this.x, this.y - 10 + bob, 10), { wash: '#E2476E', ink: PAL.ink, sw: 1.6 });
      },
    };
  }
  function makeShot(x, y, dir) {
    return { x, y, vx: 330 * dir, vy: 60, w: 12, h: 12, life: 1.6, z: 6,
      update(G, dt) {
        this.life -= dt; this.vy = Math.min(this.vy + 1500 * dt, 600);
        const r = G.move(this, dt);
        if (r.down) this.vy = -330;
        if (r.left || r.right || this.life <= 0) { this.dead = true; G.puff(this.x, this.y - 6, PAL.ink, 6, 90); }
        for (const e of G.ents) if (e.enemy && !e.dead && G.overlap(this, e)) { this.dead = true; if (e.kind === 'boss') bossHit(e, 1); else squash(e, true); break; }
      },
      draw(G, c) { boil(G.t, 950); INK.blob(c, INK.lumpPts(this.x, this.y - 6, 6, 3, 9, 0.25, 0.8), { wash: PAL.ink, ink: null, rim: false }); },
    };
  }

  /* ---------------------------------------------------------- enemies */
  function squash(e, flip) {
    e.dead = true; S.score += e.score || 100; SFX.play('splat');
    G.puff(e.x, e.y - 8, e.col || PAL.ink, 10, 160);
    G.float(`+${e.score || 100}`, e.x, e.y - 30, PAL.cream, 14);
    G.ents.push({ x: e.x, y: e.y, t0: G.t, z: 0, col: e.col, flip, update(G) { if (G.t - this.t0 > 0.5) this.dead = true; },
      draw(G, c) { const k = (G.t - this.t0) / 0.5; c.save(); c.globalAlpha = 1 - k; c.translate(this.x, this.y); c.scale(1.4, 0.35); boil(0, 3); INK.blob(c, INK.lumpPts(0, -10, 12, 7, 12, 0.3), { wash: this.col || PAL.ink, ink: null }); c.restore(); } });
  }
  function walker(kind, x, y, o) {
    return { kind, enemy: true, x, y, vx: -o.sp, vy: 0, w: o.w, h: o.h, col: o.col, score: o.score, spiky: o.spiky, z: 3, id: Math.random() * 1000 | 0, awake: false,
      update(G, dt) {
        if (!this.awake) { if (Math.abs(this.x - G.player.x) < G.VW / G.scale * 0.6 + 40) this.awake = true; else return; }
        this.vy = Math.min(this.vy + 1600 * dt, 700);
        const r = G.move(this, dt);
        if (r.left) this.vx = o.sp; if (r.right) this.vx = -o.sp;
        if (o.careful && r.down) { // turn at ledges
          const ahead = G.tileAt(Math.floor((this.x + Math.sign(this.vx) * (this.w / 2 + 2)) / TS), Math.floor((this.y + 2) / TS));
          if (!G.isSolid(ahead) && !G.oneway.has(ahead)) this.vx *= -1;
        }
        if (this.y > G.level.h * TS + 100) this.dead = true;
        touchPlayer(this);
      },
      draw(G, c) {
        if (!this.awake) return;
        boil(G.t, this.id);
        const wob = Math.sin(G.t * 10 + this.id) * 0.08, dir = Math.sign(this.vx) || -1;
        c.save(); c.translate(this.x, this.y); c.scale(1 + wob, 1 - wob);
        if (this.spiky) {
          // a spiky pencil stub on legs: can't be stomped
          INK.blob(c, INK.rectPts(-11, -24, 22, 20, 0.6), { wash: '#E8C06A', ink: PAL.ink, sw: 1.5, smooth: false });
          for (let i = 0; i < 4; i++) INK.blob(c, [[-11 + i * 5.5, -24], [-8.25 + i * 5.5, -33 - (i % 2) * 3], [-5.5 + i * 5.5, -24]], { wash: PAL.ink, ink: null, smooth: false, rim: false });
          for (const lx of [-6, 5]) INK.inkLine(c, [[lx, -4], [lx + Math.sin(G.t * 14 + lx) * 3, 0]], 2);
          eyes(c, 0, -15, 3.4, dir);
        } else {
          INK.blob(c, INK.lumpPts(0, -11, 12, this.id, 13, 0.18, 0.4), { wash: this.col, ink: PAL.ink, sw: 1.6, pool: [-4, -15, 8], poolCol: '#b9a7d6' });
          for (const lx of [-5, 5]) INK.inkLine(c, [[lx, -2], [lx + Math.sin(G.t * 12 + lx) * 3, 1]], 2.2);
          eyes(c, 0, -13, 3.6, dir);
        }
        c.restore();
      },
    };
  }
  function eyes(c, x, y, s, dir) {
    for (const sd of [-1, 1]) {
      c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(x + sd * s * 1.2, y, s * 0.8, s, 0, 0, TAU); c.fill();
      c.fillStyle = PAL.ink; c.beginPath(); c.arc(x + sd * s * 1.2 + dir * s * 0.35, y + s * 0.2, s * 0.42, 0, TAU); c.fill();
    }
  }
  function plane(x, y) {
    return { kind: 'plane', enemy: true, x, y, y0: y, vx: -80, vy: 0, w: 26, h: 16, col: '#e9e0cf', score: 200, z: 3, id: Math.random() * 1000 | 0, awake: false,
      update(G, dt) {
        if (!this.awake) { if (Math.abs(this.x - G.player.x) < G.VW / G.scale * 0.6) this.awake = true; else return; }
        this.x += this.vx * dt; this.y = this.y0 + Math.sin(G.t * 2.4 + this.id) * 28;
        if (this.x < -40) this.dead = true;
        touchPlayer(this);
      },
      draw(G, c) {
        if (!this.awake) return;
        boil(G.t, this.id); c.save(); c.translate(this.x, this.y - 8); c.rotate(Math.cos(G.t * 2.4 + this.id) * 0.25);
        INK.blob(c, [[-16, 0], [12, -9], [4, 0], [12, 9]], { wash: '#FDF8EE', ink: PAL.ink, sw: 1.4, smooth: false, rim: false });
        INK.inkLine(c, [[-14, 0], [6, 0]], 1); eyes(c, -6, -3, 2.4, -1); c.restore();
      },
    };
  }
  function touchPlayer(e) {
    const p = G.player; if (!p || p.dead || !G.overlap(p, e)) return;
    const stomp = p.vy > 60 && p.y - e.y < -e.h * 0.35;
    if (stomp && !e.spiky) {
      squash(e); p.vy = G.input.isDown('jump') ? -600 : -380; S.combo = (S.combo || 0) + 1; p.landT = G.t;
      if (S.combo > 1) G.float(`×${S.combo}`, p.x, p.y - 44, PAL.ochre, 16);
    } else if (stomp && e.spiky) { p.vy = -300; hurt(p, e); }
    else hurt(p, e);
  }

  /* ------------------------------------------------------------- boss */
  function makeBoss(x, y) {
    return { kind: 'boss', enemy: true, x, y, vx: 0, vy: 0, w: 72, h: 50, hp: 8, max: 8, inv: 0, cd: 1.5, jumps: 0, z: 3, awake: false, score: 5000,
      update(G, dt) {
        const p = G.player;
        if (!this.awake) { if (Math.abs(this.x - p.x) < 300) { this.awake = true; G.float(T.boss, this.x, this.y - 90, PAL.rose, 26); SFX.play('boom'); } else return; }
        this.inv = Math.max(0, this.inv - dt);
        this.vy = Math.min(this.vy + 1700 * dt, 900);
        const was = G.onGround(this);
        const r = G.move(this, dt);
        this.x = clamp(this.x, 72 * TS + 40, 117 * TS - 40);
        if (r.down && !was) { G.shake = 0.7; SFX.play('boom'); G.puff(this.x, this.y, rgba(PAL.ink, 0.4), 12, 200); if (this.jumps % 2 === 0) G.ents.push(walker('blot', this.x - Math.sign(p.x - this.x) * 50, this.y - 20, { sp: 70, w: 22, h: 20, col: '#3b2f4a', score: 100 })); }
        if (G.onGround(this)) {
          this.vx = 0; this.cd -= dt;
          if (this.cd <= 0) { this.jumps++; this.vy = -720 - Math.random() * 120; this.vx = clamp((p.x - this.x) * 1.1, -320, 320); this.cd = this.hp < 4 ? 0.8 : 1.3; }
        }
        if (G.overlap(p, this) && !p.dead) {
          if (p.vy > 60 && p.y < this.y - this.h * 0.55) { bossHit(this, 2); p.vy = -560; }
          else hurt(p, this);
        }
      },
      draw(G, c) {
        if (!this.awake) { boil(G.t, 77); }
        if (this.inv > 0 && Math.floor(G.t * 20) % 2) return;
        boil(G.t, 77);
        const w = this.w, h = this.h, sq = G.onGround(this) ? 0 : clamp(-this.vy / 4000, -0.12, 0.12);
        c.save(); c.translate(this.x, this.y); c.scale(1 + sq, 1 - sq);
        INK.blob(c, INK.rectPts(-w / 2, -h, w, h, 1.5), { wash: '#E98AA0', ink: PAL.ink, sw: 2.6, smooth: false, pool: [-w * 0.2, -h * 0.75, w * 0.4] });
        INK.blob(c, INK.rectPts(-w / 2, -h, w * 0.42, h, 1.2), { wash: PAL.indigo, ink: PAL.ink, sw: 2.2, smooth: false });
        INK.text(c, 'ERASE', -w * 0.29, -h / 2, 12, PAL.cream, { font: '"Permanent Marker"', rot: -Math.PI / 2, shadow: false });
        for (const sd of [0, 1]) { const ex = w * 0.08 + sd * 16, ey = -h * 0.62; c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(ex, ey, 5, 6.5, 0, 0, TAU); c.fill(); c.fillStyle = PAL.ink; c.beginPath(); c.arc(ex + Math.sign(G.player.x - this.x) * 2, ey + 1, 2.6, 0, TAU); c.fill(); INK.inkLine(c, [[ex - 6, ey - 9 + sd * 3], [ex + 6, ey - 6 - sd * 3]], 2); }
        INK.inkLine(c, [[w * 0.05, -h * 0.25], [w * 0.2, -h * 0.32], [w * 0.36, -h * 0.25]], 2.4);
        c.restore();
      },
    };
  }
  function bossHit(b, d) {
    if (b.inv > 0) return;
    b.hp -= d; b.inv = 0.9; G.shake = 0.5; SFX.play('hurt'); S.score += 300;
    if (b.hp <= 0) {
      b.dead = true; S.score += b.score; SFX.play('win'); G.shake = 1;
      for (let i = 0; i < 4; i++) G.puff(b.x + jit(30), b.y - 20 + jit(20), i % 2 ? '#E98AA0' : PAL.indigo, 14, 260);
      G.ents.push(makeGoal(b.x, (G.level.h - 2) * TS));
    }
  }

  /* ------------------------------------------------------- pickups etc */
  function makeDropPickup(x, y) {
    return { kind: 'drop', x, y: y - 8, w: 16, h: 18, z: 2, update(G) { if (G.overlap(this, G.player)) { this.dead = true; S.drops++; S.levelDrops++; S.score += 100; SFX.play('coin'); G.puff(this.x, this.y - 8, PAL.indigo, 5, 80); } }, draw(G, c) { drawDrop(c, this.x, this.y - 9, G.t); } };
  }
  function makeCheck(x, y) {
    return { kind: 'check', x, y, w: 20, h: 60, z: 1, on: false,
      update(G) { if (!this.on && Math.abs(G.player.x - this.x) < 20) { this.on = true; S.check = { x: this.x, y: this.y }; G.float(T.check, this.x, this.y - 70, PAL.sap, 16); SFX.play('card'); } },
      draw(G, c) { boil(G.t, 1200); INK.inkLine(c, [[this.x, this.y], [this.x, this.y - 56]], 2.2); INK.blob(c, [[this.x, this.y - 56], [this.x + (this.on ? 24 : 14), this.y - 49], [this.x, this.y - 42]], { wash: this.on ? PAL.sap : '#bbb', ink: PAL.ink, sw: 1.4, smooth: false }); },
    };
  }
  function makeGoal(x, y) {
    return { kind: 'goal', x, y, w: 30, h: 110, z: 1, done: false,
      update(G) { if (!this.done && Math.abs(G.player.x - this.x) < 18) { this.done = true; levelClear(); } },
      draw(G, c) {
        boil(G.t, 1300);
        INK.blob(c, INK.rectPts(this.x - 3, this.y - 110, 6, 110, 0.5), { wash: '#8C6A4A', ink: PAL.ink, sw: 1.4, smooth: false });
        const wv = Math.sin(G.t * 4) * 4;
        INK.blob(c, [[this.x + 3, this.y - 108], [this.x + 34, this.y - 100 + wv], [this.x + 26, this.y - 88 + wv], [this.x + 34, this.y - 76 + wv], [this.x + 3, this.y - 80]], { wash: PAL.red, ink: PAL.ink, sw: 1.6, smooth: false });
      },
    };
  }

  function spawn(G, s) {
    if (s.kind === 'player') { G.player = makePlayer(s.x, s.y); G.ents.push(G.player); }
    else if (s.kind === 'drop') G.ents.push(makeDropPickup(s.x, s.y));
    else if (s.kind === 'blot') G.ents.push(walker('blot', s.x, s.y, { sp: 50, w: 22, h: 20, col: '#3b2f4a', score: 100 }));
    else if (s.kind === 'spiky') G.ents.push(walker('spiky', s.x, s.y, { sp: 45, w: 22, h: 24, spiky: true, careful: true, score: 200 }));
    else if (s.kind === 'plane') G.ents.push(plane(s.x, s.y));
    else if (s.kind === 'check') G.ents.push(makeCheck(s.x, s.y));
    else if (s.kind === 'goal') G.ents.push(makeGoal(s.x, s.y));
    else if (s.kind === 'boss') G.ents.push(makeBoss(s.x, s.y));
  }

  function update(G, dt) {
    if (G.onGround(G.player)) S.combo = 0;
  }

  /* ---------------------------------------------------------- drawing */
  function drawBackdrop(G, c) {
    const th = G.theme, W = G.VW, H = G.VH, px = G.cam.x * G.scale;
    // two layers of soft hills (or clouds) scrolling slower than the level
    for (const [k, col, amp, base] of [[0.2, th.hill2, 0.12, 0.62], [0.45, th.hill, 0.1, 0.72]]) {
      c.save(); c.globalAlpha = th.dark ? 0.8 : 0.9; c.fillStyle = col;
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) { const wx = x + px * k; c.lineTo(x, H * base - Math.sin(wx / 260) * H * amp - Math.sin(wx / 97) * H * amp * 0.3); }
      c.lineTo(W, H); c.closePath(); c.fill(); c.restore();
    }
    if (th.dark) { // a few painted stars / glow motes
      for (let i = 0; i < 18; i++) { const x = ((hash(i) * W * 2 - px * 0.1) % W + W) % W, y = hash(i + 50) * H * 0.5; c.globalAlpha = 0.4 + 0.3 * Math.sin(G.t * 2 + i); c.fillStyle = PAL.cream; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
    }
  }

  function drawHUD(G, c) {
    if (G.mode === 'title' || !G.level) return;
    const pad = 14;
    for (let i = 0; i < Math.max(S.hearts, S.maxHearts); i++) { boil(G.t, 2000 + i); INK.blob(c, INK.heartPts(pad + 14 + i * 30, pad + 14, 12), { wash: i < S.hearts ? '#E2476E' : rgba(PAL.ink, 0.12), ink: PAL.ink, sw: 1.5 }); }
    if (S.hat) { boil(G.t, 2100); INK.blob(c, [[pad + 4, pad + 58], [pad + 18, pad + 36], [pad + 32, pad + 58]], { wash: PAL.indigo, ink: PAL.ink, sw: 1.4, smooth: false }); }
    drawDrop(c, G.VW / 2 - 40, pad + 16, G.t, 1.2);
    INK.text(c, `× ${S.drops}`, G.VW / 2 - 22, pad + 16, 22, G.theme.dark ? PAL.cream : PAL.ink, { align: 'left', shadow: false });
    INK.text(c, `${S.score}`, G.VW - 64, pad + 16, 24, PAL.clay, { align: 'right', font: '"Permanent Marker"', weight: 400 });
    INK.text(c, `${T.stage(G.levelIndex)} · ${LEVELS[G.levelIndex].name[KO ? 0 : 1]}`, G.VW - 64, pad + 42, 16, G.theme.dark ? PAL.cream : PAL.ink, { align: 'right', shadow: false });
    const boss = G.ents.find((e) => e.kind === 'boss' && e.awake);
    if (boss) {
      const w = Math.min(360, G.VW * 0.6), x = (G.VW - w) / 2, y = G.VH - 40 - (matchMedia('(pointer: coarse)').matches ? 150 : 0);
      c.fillStyle = rgba(PAL.ink, 0.35); c.fillRect(x, y, w, 12); c.fillStyle = '#E98AA0'; c.fillRect(x, y, w * boss.hp / boss.max, 12);
      boil(G.t, 2200); INK.inkLine(c, INK.rectPts(x, y, w, 12, 0.8), 1.6, PAL.ink, true);
      INK.text(c, T.boss, G.VW / 2, y - 14, 18, PAL.cream);
    }
    if (G.mode === 'paused') INK.text(c, KO ? '일시 정지' : 'Paused', G.VW / 2, G.VH / 2, 40, PAL.cream, { font: '"Permanent Marker"', weight: 400 });
    if (G.t - introT < 2 && G.mode === 'play') INK.text(c, `${T.stage(G.levelIndex)} — ${LEVELS[G.levelIndex].name[KO ? 0 : 1]}`, G.VW / 2, G.VH * 0.3, 34, PAL.cream, { alpha: clamp((2 - (G.t - introT)) * 2), scale: backOut(clamp((G.t - introT) * 3)), font: '"Permanent Marker", "Gaegu"', weight: 400 });
  }

  /* ------------------------------------------------------------- flow */
  let introT = -9;
  function show(id) {
    for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id;
    document.body.classList.toggle('menu', !!id);
    $('btn-pause').hidden = !!id;
  }
  function startLevel(i) {
    S.check = null; S.levelDrops = 0;
    G.player = null; G.loadLevel(i); G.mode = 'play'; introT = G.t; show(null);
    SFX.music(true); SFX.play('wave');
  }
  function newRun(i) { S.hearts = S.maxHearts; S.hat = false; S.drops = 0; S.score = 0; startLevel(i); }
  function levelClear() {
    SFX.play('win'); G.mode = 'clear'; SFX.music(false);
    const i = G.levelIndex; S.score += 1000;
    S.unlocked = Math.max(S.unlocked, i + 2); try { localStorage.setItem('clawdleap.unlocked', S.unlocked); } catch {}
    setTimeout(() => {
      if (i === LEVELS.length - 1) return message('win', T.win, T.winText(S.score), [[T.menu, titleScreen]]);
      message('clear', T.clear, T.clearText(S.levelDrops, S.score), [[T.next, () => startLevel(i + 1)], [T.menu, titleScreen, true]]);
    }, 900);
  }
  function gameOver() {
    if (G.mode !== 'play') return;
    G.mode = 'over'; SFX.music(false); SFX.play('lose');
    message('ko', T.dead, T.deadText, [[T.retry, () => newRun(G.levelIndex)], [T.menu, titleScreen, true]]);
  }
  let portrait = 'title';
  function message(face, title, text, buttons) {
    portrait = face; $('msg-title').textContent = title; $('msg-text').textContent = text;
    const row = $('msg-buttons'); row.innerHTML = '';
    for (const [label, fn, alt] of buttons) { const b = document.createElement('button'); b.className = 'big' + (alt ? ' alt' : ''); b.textContent = label; b.onclick = () => { SFX.play('click'); fn(); }; row.append(b); }
    show('msg');
  }
  function titleScreen() {
    G.mode = 'title'; portrait = 'title'; SFX.music(false);
    const box = $('levels'); box.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button'); b.disabled = i >= S.unlocked;
      b.innerHTML = `<b>${i + 1}</b>${L.name[KO ? 0 : 1]}`;
      b.onclick = () => { SFX.unlock(); SFX.play('card'); newRun(i); };
      box.append(b);
    });
    show('title');
  }
  function togglePause() {
    if (G.mode === 'play') { G.mode = 'paused'; SFX.music(false); }
    else if (G.mode === 'paused') { G.mode = 'play'; SFX.music(true); }
  }
  $('btn-pause').addEventListener('click', togglePause);
  addEventListener('blur', () => { if (G.mode === 'play') togglePause(); });
  const renderSound = () => { $('btn-sound').textContent = T.sound(SFX.on); };
  $('btn-sound').addEventListener('click', () => { SFX.setOn(!SFX.on); renderSound(); });

  function afterFrame(G) {
    for (const tc of document.querySelectorAll('.clawd-portrait')) {
      if (!tc.offsetParent) continue;
      const g = tc.getContext('2d'); g.clearRect(0, 0, tc.width, tc.height);
      ClawdSprites.draw(g, portrait, tc.width / 2, tc.height * 0.93, tc.width * 0.42, G.t);
    }
  }

  async function boot() {
    show('loading'); $('load-text').textContent = T.loading;
    const walk = (t, f) => ({ view: 'q', walk: f / 8, dy: -Math.abs(Math.sin(f / 8 * Math.PI * 2)) * 0.4, aL: 0.5 * Math.sin(f / 8 * TAU), aR: -0.5 * Math.sin(f / 8 * TAU), sq: 0 });
    const specs = [];
    for (const [suffix, over] of [['', {}], ['H', { hat: 'wizard' }]]) {
      specs.push(
        { key: 'stand' + suffix, emotion: 'neutral', frames: 4, over },
        { key: 'run' + suffix, emotion: 'determined', frames: 8, pose: walk, over: { ...over, emote: null } },
        { key: 'jump' + suffix, emotion: 'excited', frames: 3, over: { ...over, view: 'q', aL: 1.4, aR: 1.4, dy: 0, sq: -0.05, emote: null } },
        { key: 'fall' + suffix, emotion: 'surprised', frames: 3, over: { ...over, view: 'q', aL: 0.9, aR: 0.9, dy: 0, emote: null } },
        { key: 'hurt' + suffix, emotion: 'scared', frames: 3, over },
      );
    }
    specs.push({ key: 'title', emotion: 'happy', frames: 6 }, { key: 'clear', emotion: 'starstruck', frames: 6 }, { key: 'win', emotion: 'excited', frames: 6, over: { hat: 'crown' } }, { key: 'ko', emotion: 'ko', frames: 4 });
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; });
    renderSound(); titleScreen();
  }
  boot();
  window.__leap = { G, S, startLevel, newRun };
})();
