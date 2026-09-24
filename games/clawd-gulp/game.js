// Clawd Gulp — open the lunchbox lid, gulp up ink creatures and copy their powers.
//
//   B (hold)  open the lid and suck things in          B with a mouthful   spit it out as a star
//   ▼ with a mouthful   swallow: copy its power (fire / spark / pencil sword)
//   jump again in the air   puff up and float          C (or hold ▼)   drop your power
//
// Clawd's lunchbox mouth (the lid that hinges open with teeth) comes from the Claude Animation Base; each power's
// look is baked into sprites the first time you get it.

(() => {
  const { PAL, TAU, clamp, lerp, backOut, mix, rgba, boil, jit, hash } = INK;
  const TS = Platformer.TS;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
  const T = KO ? {
    lead: '뚜껑을 열어 잉크 괴물을 꿀꺽! 삼키면 그 능력을 따라 해요.', more: '다른 게임', loading: '클로를 그리는 중…',
    keys: '<kbd>←</kbd><kbd>→</kbd> 이동 · <kbd>Space</kbd> 점프(공중에서 또 누르면 둥실) · <kbd>X</kbd> 빨아들이기/뱉기/능력 · <kbd>↓</kbd> 삼키기 · <kbd>C</kbd> 능력 버리기',
    stage: (i) => `스테이지 ${i + 1}`, clear: '통과!', clearText: (s) => `점수 ${s}`, next: '다음으로', retry: '다시', menu: '처음으로',
    dead: '꿀꺽 실패…', deadText: '체력이 다 떨어졌어요.', win: '얼룩 대왕을 물리쳤다!', winText: (s) => `최종 점수 ${s}`, sound: (v) => (v ? '소리 켬' : '소리 끔'),
    boss: '얼룩 대왕', power: { fire: '불꽃!', spark: '스파크!', sword: '연필 검!' }, powerName: { fire: '불꽃', spark: '스파크', sword: '연필 검', none: '없음' }, painting: '능력 그리는 중…',
  } : {
    lead: 'Open the lid and gulp up ink creatures! Swallow one to copy its power.', more: 'More games', loading: 'Painting Clawd…',
    keys: '<kbd>←</kbd><kbd>→</kbd> move · <kbd>Space</kbd> jump (again in the air to float) · <kbd>X</kbd> inhale / spit / power · <kbd>↓</kbd> swallow · <kbd>C</kbd> drop power',
    stage: (i) => `Stage ${i + 1}`, clear: 'Cleared!', clearText: (s) => `Score ${s}`, next: 'Next', retry: 'Retry', menu: 'Menu',
    dead: 'Gulp failed…', deadText: 'Out of health.', win: 'The Smudge King is beaten!', winText: (s) => `Final score ${s}`, sound: (v) => (v ? 'Sound on' : 'Sound off'),
    boss: 'Smudge King', power: { fire: 'Fire!', spark: 'Spark!', sword: 'Pencil sword!' }, powerName: { fire: 'Fire', spark: 'Spark', sword: 'Pencil sword', none: 'None' }, painting: 'Painting the power…',
  };
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = T[el.dataset.t]; });
  document.querySelectorAll('[data-t-html]').forEach((el) => { el.innerHTML = T[el.dataset.tHtml]; });

  const POWER_HAT = { fire: 'band', spark: 'halo', sword: 'beanie' };
  const SUFFIX = { none: '', fire: 'F', spark: 'S', sword: 'W' };

  /* ------------------------------------------------------------ levels */
  const B = LevelKit.build;
  const LEVELS = [
    { name: ['솜사탕 언덕', 'Cotton Hills'], theme: 0, map: B(150, (A) => {
      A.ground(0, 150); A.set(3, 12, '@');
      A.set(14, 12, 'e'); A.set(20, 12, 'e'); A.column(26, 2); A.set(31, 12, 'f');
      A.row(36, 9, '====='); A.coins(37, 8, 3, 'o'); A.set(44, 12, 'e'); A.set(48, 12, 'e');
      A.fill(52, 13, 55, 14, ' '); A.set(58, 12, 'k'); A.column(63, 3); A.set(67, 12, 'f');
      A.row(71, 10, '===='); A.row(77, 8, '===='); A.set(80, 5, 'p'); A.coins(77, 7, 4, 'o');
      A.set(86, 12, 'z'); A.set(92, 12, 'e'); A.fill(96, 13, 99, 14, ' '); A.set(103, 12, 'e');
      A.stairs(108, 4); A.set(116, 12, 'k'); A.set(120, 12, 'z'); A.set(126, 7, 'p');
      A.set(142, 12, 'F');
    }) },
    { name: ['잉크병 숲', 'Inkwell Woods'], theme: 1, map: B(160, (A) => {
      A.ground(0, 40); A.ground(46, 90); A.ground(96, 160); A.set(3, 12, '@');
      A.set(12, 12, 'f'); A.set(18, 12, 'e'); A.row(22, 9, '===='); A.set(24, 8, 'z'); A.set(32, 12, 'k');
      A.row(40, 10, '===='); A.set(50, 12, 'e'); A.set(54, 12, 'f'); A.column(58, 3); A.set(62, 12, 'k'); A.set(66, 6, 'p');
      A.fill(70, 9, 74, 12, 'X'); A.set(72, 8, 'z'); A.set(80, 12, 'e'); A.set(84, 12, 'e');
      A.row(88, 9, '========'); A.set(100, 12, 'f'); A.set(106, 12, 'k'); A.set(110, 6, 'p');
      A.fill(116, 11, 118, 12, 'X'); A.fill(122, 9, 124, 12, 'X'); A.fill(128, 7, 130, 12, 'X'); A.set(129, 6, 'z');
      A.set(138, 12, 'e'); A.set(144, 12, 'f'); A.set(152, 12, 'F');
    }) },
    { name: ['구름 부엌', 'Cloud Kitchen'], theme: 2, map: B(150, (A) => {
      A.ground(0, 16); A.set(3, 12, '@'); A.set(12, 12, 'z');
      A.row(20, 11, '====='); A.row(28, 9, '====='); A.set(30, 8, 'f'); A.row(36, 7, '===='); A.set(40, 3, 'p');
      A.row(44, 9, '======'); A.set(47, 8, 'k'); A.row(54, 11, '====');
      A.ground(60, 84); A.set(66, 12, 'e'); A.set(70, 12, 'z'); A.set(74, 12, 'f'); A.set(78, 7, 'p');
      A.row(88, 10, '===='); A.row(95, 8, '===='); A.row(102, 10, '===='); A.set(99, 4, 'p');
      A.ground(108, 150); A.set(114, 12, 'k'); A.set(120, 12, 'e'); A.set(126, 12, 'z'); A.set(142, 12, 'F');
    }) },
    { name: ['얼룩 왕좌', 'Smudge Throne'], theme: 3, map: B(44, (A) => {
      A.fill(0, 0, 43, 1, 'X'); A.ground(0, 43); A.fill(0, 2, 0, 12, 'X'); A.fill(43, 2, 43, 12, 'X');
      A.set(4, 12, '@'); A.row(8, 9, '==='); A.row(33, 9, '==='); A.row(19, 7, '=====');
      A.set(30, 12, 'K');
    }) },
  ];

  const THEMES = [
    { sky: '#FBEFF3', paperOp: 0.7, top: '#F2A9C0', dirt: '#E8C9A6', stone: '#D9C7D6', hill: '#F6CFDC', hill2: '#EFBBD0' },
    { sky: '#DDEFE9', paperOp: 0.6, top: '#6FB3A0', dirt: '#8C7A64', stone: '#9FB0A8', hill: '#A9D4C4', hill2: '#8EC4B2' },
    { sky: '#E3F0FA', paperOp: 0.6, top: '#FFFFFF', dirt: '#E9E2F2', stone: '#D5CDE3', hill: '#FFFFFF', hill2: '#EEF5FB', clouds: true },
    { sky: '#3A2F45', paperOp: 0.15, top: '#8C7BA0', dirt: '#554766', stone: '#6A5C7B', hill: '#4A3D5A', hill2: '#56476A', dark: true },
  ];
  const TILES = {
    '#': (g, th) => { INK.blob(g, INK.rectPts(0, 0, TS, TS, 0.6), { wash: th.dirt, ink: null, smooth: false, rim: false }); INK.blob(g, INK.rectPts(-1, -2, TS + 2, 11, 0.9), { wash: th.top, ink: PAL.ink, sw: 1.4, smooth: true }); },
    'D': (g, th) => { INK.blob(g, INK.rectPts(0, 0, TS, TS, 0.4), { wash: th.dirt, ink: null, smooth: false, rim: false }); g.fillStyle = rgba(PAL.ink, 0.12); g.beginPath(); g.arc(8 + Math.random() * 16, 8 + Math.random() * 16, 1.6, 0, TAU); g.fill(); },
    'X': (g, th) => { INK.blob(g, INK.rectPts(0.5, 0.5, TS - 1, TS - 1, 0.7), { wash: th.stone, ink: PAL.ink, sw: 1.6, smooth: false, pool: [8, 8, 14] }); },
    '=': (g, th) => { INK.blob(g, INK.rectPts(0, 1, TS, 9, 0.8), { wash: th.clouds ? '#FFFFFF' : PAL.cream, ink: PAL.ink, sw: 1.4, smooth: true }); },
  };

  /* -------------------------------------------------------------- state */
  const S = { score: 0, hp: 6, maxHp: 6, power: 'none', mouth: null, unlocked: 1, lives: 3 };
  try { S.unlocked = Math.max(1, +localStorage.getItem('clawdgulp.unlocked') || 1); } catch {}

  const G = Platformer.create({
    canvas: $('game'), viewTiles: 12, tiles: TILES, themes: THEMES, levels: LEVELS,
    solid: new Set(['#', 'D', 'X']), oneway: new Set(['=']),
    legend: { '@': { spawn: 'player' }, o: { spawn: 'star' }, e: { spawn: 'blot' }, f: { spawn: 'flame' }, z: { spawn: 'spark' }, k: { spawn: 'pencil' }, p: { spawn: 'plane' }, F: { spawn: 'goal' }, K: { spawn: 'boss' } },
    spawn, update: () => {}, drawHUD, drawBackdrop, onPause: togglePause, afterFrame,
  });

  /* ------------------------------------------------------------- player */
  function makePlayer(x, y) {
    return { kind: 'player', x, y, vx: 0, vy: 0, w: 24, h: 22, face: 1, inv: 0, walkD: 0, z: 5, puffed: false, inhaling: false, attackT: -9, holdDown: 0, landT: -9, air: 0,
      update(G, dt) {
        const I = G.input;
        const k = this.puffed ? { gravityMul: 0.22, fall: 110, max: 150, air: 1100 } : this.inhaling ? { max: 40, accel: 600 } : {};
        const wasGround = G.onGround(this);
        // float: jump again in mid-air
        if (!wasGround && I.hit('jump') && !this.mouthFull() && (this.coyote || 0) <= 0) { this.puffed = true; this.vy = -250; SFX.play('jump'); I.pressed.delete('jump'); }
        const r = G.platformPhysics(this, dt, k);
        if (r.jumped) SFX.play('jump');
        if (r.ground) { if (this.puffed) { this.puffed = false; G.ents.push(airPuff(this.x + this.face * 16, this.y - 12, this.face)); } if (this.air > 0.25) this.landT = G.t; }
        this.air = r.ground ? 0 : this.air + dt;
        this.walkD += Math.abs(this.vx) * dt / 40;
        this.inv = Math.max(0, this.inv - dt);

        // B: exhale when puffed, spit when full, power when powered, else inhale
        if (this.puffed && I.hit('act')) { this.puffed = false; G.ents.push(airPuff(this.x + this.face * 16, this.y - 12, this.face)); SFX.play('wall'); }
        else if (this.mouthFull() && I.hit('act')) spit(this);
        else if (this.mouthFull() && I.hit('down')) swallow(this);
        else if (S.power !== 'none' && !this.puffed) usePower(this, dt);
        else this.inhaling = !this.puffed && !this.mouthFull() && I.isDown('act');
        if (this.inhaling) inhale(this, dt);
        // drop power: C, or hold ▼ on the ground
        this.holdDown = I.isDown('down') && !this.mouthFull() ? this.holdDown + dt : 0;
        if (S.power !== 'none' && (I.hit('alt') || this.holdDown > 0.8)) { dropPower(this); this.holdDown = 0; }
        if (this.y > G.level.h * TS + 60) { hurt(this, null, 2); const s = G.level.spawns.find((q) => q.kind === 'player'); this.x = s.x; this.y = s.y; this.vx = this.vy = 0; }
      },
      mouthFull() { return !!S.mouth; },
      draw(G, c) {
        if (this.inv > 0 && Math.floor(G.t * 16) % 2) return;
        const ground = G.onGround(this), suf = SUFFIX[S.power];
        let key = 'stand', t = G.t;
        if (this.puffed) key = 'float';
        else if (this.inhaling) key = 'inhale';
        else if (S.mouth) key = 'full';
        else if (G.t - this.attackT < 0.25) key = 'attack';
        else if (!ground) key = this.vy < 0 ? 'jump' : 'fall';
        else if (Math.abs(this.vx) > 20) { key = 'walk'; t = this.walkD * 1.5; }
        if (G.t - hurtT < 0.5) key = 'hurt';
        // full-mouth and float looks are shared by every power
        const name = ['float', 'full', 'inhale', 'hurt'].includes(key) ? key : key + suf;
        const land = G.t - this.landT < 0.2 ? Math.sin((G.t - this.landT) / 0.2 * Math.PI) * 0.16 : 0;
        ClawdSprites.draw(c, ClawdSprites.has(name) ? name : key, this.x, this.y + 1, this.puffed ? 36 : 30, t, { flip: this.face < 0, sq: land });
        // power effects drawn with the player
        if (S.power === 'spark' && G.input.isDown('act') && !this.puffed && !S.mouth) sparkAura(c, this.x, this.y - 14, G.t);
        if (S.power === 'fire' && G.input.isDown('act') && !this.puffed && !S.mouth) fireCone(c, this, G.t);
        if (S.power === 'sword' && G.t - this.attackT < 0.25) swordArc(c, this, (G.t - this.attackT) / 0.25);
        if (this.inhaling) suctionLines(c, this, G.t);
      },
    };
  }
  let hurtT = -9;
  function hurt(p, from, dmg = 1) {
    if (p.inv > 0) return;
    S.hp -= dmg; p.inv = 1.3; hurtT = G.t; G.shake = 0.6; SFX.play('hurt'); p.puffed = false; p.inhaling = false;
    if (from) { p.vx = Math.sign(p.x - from.x || -p.face) * 240; p.vy = -320; }
    if (S.mouth) { S.mouth = null; }
    if (S.power !== 'none' && Math.random() < 0.6) dropPower(p);
    if (S.hp <= 0) setTimeout(gameOver, 400);
  }

  /* ---------------------------------------------------------- mouthing */
  const HAS_POWER = { flame: 'fire', spark: 'spark', pencil: 'sword', powerstar: null };
  function inhale(p, dt) {
    if (Math.floor(G.t * 10) !== Math.floor((G.t - dt) * 10)) SFX.noise(0.12, { f: 900, vol: 0.12, q: 0.6 });
    for (const e of G.ents) {
      if (!e.gulpable || e.dead) continue;
      const dx = e.x - p.x, dy = (e.y - e.h / 2) - (p.y - 12);
      const ahead = dx * p.face;
      if (ahead > -6 && ahead < 110 && Math.abs(dy) < 44) {
        e.sucked = true;
        const k = 1 - ahead / 110;
        e.x -= p.face * (120 + 360 * k) * dt; e.y += -dy * 4 * dt;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 24) {
          e.dead = true; S.mouth = e.kind === 'powerstar' ? e.power : e.kind; p.inhaling = false; SFX.play('coin');
          G.puff(p.x + p.face * 14, p.y - 12, rgba(PAL.ink, 0.3), 5, 60);
        }
      }
    }
  }
  function spit(p) {
    const what = S.mouth; S.mouth = null;
    G.ents.push(starShot(p.x + p.face * 18, p.y - 12, p.face)); SFX.play('slash'); p.attackT = G.t;
  }
  async function swallow(p) {
    const what = S.mouth; S.mouth = null;
    const pw = HAS_POWER[what] || (['fire', 'spark', 'sword'].includes(what) ? what : null);
    SFX.play('heal');
    if (!pw) { G.float(KO ? '꿀꺽!' : 'Gulp!', p.x, p.y - 44, PAL.cream, 18); return; }
    S.power = pw;
    G.float(T.power[pw], p.x, p.y - 50, PAL.ochre, 24); G.shake = 0.3;
    if (!ClawdSprites.has('stand' + SUFFIX[pw])) await bakePower(pw);
  }
  function dropPower(p) {
    if (S.power === 'none') return;
    const pw = S.power; S.power = 'none'; SFX.play('fizzle');
    G.ents.push(powerStar(p.x, p.y - 20, pw));
  }
  function usePower(p, dt) {
    const I = G.input;
    if (S.power === 'sword') { if (I.hit('act')) { p.attackT = G.t; SFX.play('slash'); hitBox(p.x + p.face * 30, p.y - 12, 56, 44, 2, p); } }
    else if (S.power === 'fire' && I.isDown('act')) { p.vx *= 0.9; if (Math.floor(G.t * 12) !== Math.floor((G.t - dt) * 12)) { SFX.noise(0.1, { f: 700, vol: 0.2, type: 'lowpass' }); hitBox(p.x + p.face * 44, p.y - 12, 70, 34, 1, p); } }
    else if (S.power === 'spark' && I.isDown('act')) { p.vx *= 0.85; if (Math.floor(G.t * 8) !== Math.floor((G.t - dt) * 8)) { SFX.play('zap'); hitBox(p.x, p.y - 14, 92, 80, 1, p); } }
  }
  function hitBox(x, y, w, h, dmg, from) {
    for (const e of G.ents) if (e.enemy && !e.dead && Math.abs(e.x - x) < (w + e.w) / 2 && Math.abs((e.y - e.h / 2) - y) < (h + e.h) / 2) {
      if (e.kind === 'boss') bossHit(e, dmg * 0.5); else defeat(e);
    }
  }

  /* ------------------------------------------------------ projectiles */
  function starShot(x, y, dir) {
    return { x, y, vx: 460 * dir, w: 20, h: 20, life: 1.1, z: 6, rot: 0,
      update(G, dt) {
        this.life -= dt; this.x += this.vx * dt; this.rot += dt * 14;
        const tx = Math.floor(this.x / TS), ty = Math.floor((this.y - 4) / TS);
        if (G.isSolid(G.tileAt(tx, ty)) || this.life <= 0) { this.dead = true; G.puff(this.x, this.y, PAL.ochre, 8, 120); return; }
        for (const e of G.ents) if (e.enemy && !e.dead && Math.abs(e.x - this.x) < (e.w + 20) / 2 && Math.abs(e.y - e.h / 2 - this.y) < (e.h + 20) / 2) {
          this.dead = true; if (e.kind === 'boss') bossHit(e, 2); else defeat(e); break;
        }
      },
      draw(G, c) { boil(G.t, 500); c.save(); c.translate(this.x, this.y); c.rotate(this.rot); INK.blob(c, INK.starPts(0, 0, 12, 0.45, 5), { wash: PAL.ochre, ink: PAL.ink, sw: 1.6, smooth: false, pool: [-3, -3, 8] }); c.restore(); },
    };
  }
  function airPuff(x, y, dir) {
    return { x, y, vx: 260 * dir, life: 0.35, z: 6, update(G, dt) { this.life -= dt; this.x += this.vx * dt; this.vx *= 0.9; if (this.life <= 0) this.dead = true;
        for (const e of G.ents) if (e.enemy && !e.dead && e.kind !== 'boss' && Math.abs(e.x - this.x) < 22 && Math.abs(e.y - e.h / 2 - this.y) < 20) { defeat(e); this.dead = true; break; } },
      draw(G, c) { boil(G.t, 520); c.globalAlpha = this.life / 0.35; INK.blob(c, INK.ellPts(this.x, this.y, 10, 8, 10, 1), { wash: '#FFFFFF', ink: PAL.ink, sw: 1.2 }); c.globalAlpha = 1; } };
  }
  function powerStar(x, y, power) {
    return { kind: 'powerstar', power, gulpable: true, x, y, vx: (Math.random() < 0.5 ? -1 : 1) * 140, vy: -380, w: 20, h: 20, z: 4, life: 7,
      update(G, dt) {
        if (this.sucked) { this.sucked = false; return; }
        this.life -= dt; if (this.life <= 0) this.dead = true;
        this.vy = Math.min(this.vy + 1200 * dt, 500);
        const r = G.move(this, dt); if (r.down) this.vy = -300; if (r.left || r.right) this.vx *= -1;
      },
      draw(G, c) { if (this.life < 2 && Math.floor(G.t * 10) % 2) return; boil(G.t, 540); INK.blob(c, INK.starPts(this.x, this.y - 10, 12, 0.45, 5), { wash: { fire: '#EE6A3A', spark: '#F2C53D', sword: PAL.sky }[power], ink: PAL.ink, sw: 1.6, smooth: false }); },
    };
  }

  /* ----------------------------------------------------------- effects */
  function suctionLines(c, p, t) {
    boil(t * 2, 600);
    c.save(); c.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const k = ((t * 3 + i / 5) % 1), x = p.x + p.face * (20 + (1 - k) * 90), y = p.y - 12 + (i - 2) * 9 * (1 - k * 0.6);
      INK.inkLine(c, [[x, y], [x + p.face * 14, y * 0.98 + (p.y - 12) * 0.02]], 1.4, PAL.sky);
    }
    c.restore();
  }
  function fireCone(c, p, t) {
    boil(t, 610);
    for (let i = 0; i < 7; i++) {
      const k = ((t * 4 + i / 7) % 1), x = p.x + p.face * (18 + k * 70), y = p.y - 12 + Math.sin(i * 2.3 + t * 9) * 8 * k, r = 6 + k * 10;
      c.globalAlpha = 1 - k; INK.blob(c, INK.ellPts(x, y, r, r * 0.8, 9, 1), { wash: k < 0.4 ? '#F7D25A' : '#EE6A3A', ink: null, rim: false });
    }
    c.globalAlpha = 1;
  }
  function sparkAura(c, x, y, t) {
    boil(t * 2, 620);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + t * 5, P = [];
      for (let s = 0; s < 5; s++) P.push([x + Math.cos(a) * (18 + s * 6) + jit(5), y + Math.sin(a) * (16 + s * 5) + jit(5)]);
      INK.inkLine(c, P, 2.4, '#F2C53D'); INK.inkLine(c, P, 1, '#fff');
    }
  }
  function swordArc(c, p, k) {
    boil(0, 630);
    const a0 = -1.6 + k * 2.6, P = [];
    for (let i = 0; i <= 8; i++) { const a = -1.6 + (i / 8) * 2.6 * k; P.push([p.x + p.face * Math.cos(a) * 38, p.y - 12 + Math.sin(a) * 34]); }
    c.save(); c.globalAlpha = 1 - k * 0.6; INK.inkLine(c, P, 5, PAL.sky); INK.inkLine(c, P, 2, '#fff'); c.restore();
    // the pencil itself
    c.save(); c.translate(p.x + p.face * 10, p.y - 14); c.rotate((p.face > 0 ? 0 : Math.PI) + (a0 * p.face));
    INK.blob(c, INK.rectPts(0, -3, 30, 6, 0.3), { wash: '#E8C06A', ink: PAL.ink, sw: 1.2, smooth: false });
    INK.blob(c, [[30, -3], [38, 0], [30, 3]], { wash: PAL.ink, ink: null, smooth: false, rim: false });
    c.restore();
  }

  /* ----------------------------------------------------------- enemies */
  const ENEMY = {
    blot: { col: '#3b2f4a', sp: 45, hp: 1, score: 100 },
    flame: { col: '#EE6A3A', sp: 40, hp: 1, score: 200 },
    spark: { col: '#F2C53D', sp: 0, hp: 1, score: 200, hop: true },
    pencil: { col: '#E8C06A', sp: 55, hp: 1, score: 200 },
  };
  function defeat(e) {
    e.dead = true; S.score += e.score || 100; SFX.play('splat');
    G.puff(e.x, e.y - 10, e.col || PAL.ink, 10, 170); G.float(`+${e.score || 100}`, e.x, e.y - 30, PAL.cream, 14);
  }
  function creature(kind, x, y) {
    const K = ENEMY[kind];
    return { kind, enemy: true, gulpable: true, x, y, vx: -K.sp, vy: 0, w: 24, h: 22, col: K.col, score: K.score, z: 3, id: Math.random() * 1000 | 0, awake: false, hopT: 1 + Math.random(),
      update(G, dt) {
        if (!this.awake) { if (Math.abs(this.x - G.player.x) < G.VW / G.scale * 0.6 + 40) this.awake = true; else return; }
        if (this.sucked) { this.sucked = false; return; }   // being inhaled: the player moves it
        this.vy = Math.min(this.vy + 1500 * dt, 700);
        if (K.hop && G.onGround(this)) { this.hopT -= dt; if (this.hopT <= 0) { this.vy = -420; this.vx = Math.sign(G.player.x - this.x) * 80; this.hopT = 1.2 + Math.random(); } else this.vx = 0; }
        const r = G.move(this, dt);
        if (!K.hop) { if (r.left) this.vx = K.sp; if (r.right) this.vx = -K.sp; }
        if (this.y > G.level.h * TS + 100) this.dead = true;
        const p = G.player;
        if (G.overlap(p, this) && !p.inhaling) hurt(p, this);
      },
      draw(G, c) {
        if (!this.awake) return;
        boil(G.t, this.id);
        const wob = Math.sin(G.t * 10 + this.id) * 0.08, dir = Math.sign(this.vx) || Math.sign(G.player.x - this.x) || -1;
        c.save(); c.translate(this.x, this.y); c.scale(1 + wob, 1 - wob);
        if (kind === 'pencil') {
          INK.blob(c, INK.lumpPts(0, -11, 12, this.id, 12, 0.15, 0.4), { wash: '#8FA8C9', ink: PAL.ink, sw: 1.5 });
          c.save(); c.translate(dir * 12, -12); c.rotate(dir > 0 ? -0.6 : Math.PI + 0.6);
          INK.blob(c, INK.rectPts(0, -2.5, 22, 5, 0.3), { wash: '#E8C06A', ink: PAL.ink, sw: 1, smooth: false }); c.restore();
        } else {
          INK.blob(c, INK.lumpPts(0, -11, 12, this.id, 13, 0.18, 0.4), { wash: this.col, ink: PAL.ink, sw: 1.6, pool: [-4, -15, 8] });
          if (kind === 'flame') for (let i = 0; i < 3; i++) INK.blob(c, [[-6 + i * 6, -20], [-3 + i * 6, -30 - Math.sin(G.t * 10 + i) * 4], [0 + i * 6, -20]], { wash: '#F7D25A', ink: PAL.ink, sw: 1, smooth: true, rim: false });
          if (kind === 'spark') for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + G.t * 4; INK.inkLine(c, [[Math.cos(a) * 14, -11 + Math.sin(a) * 14], [Math.cos(a) * 20, -11 + Math.sin(a) * 20]], 1.6, '#F2C53D'); }
        }
        for (const lx of [-5, 5]) INK.inkLine(c, [[lx, -2], [lx + Math.sin(G.t * 12 + lx) * 3, 1]], 2.2);
        for (const sd of [-1, 1]) { c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(sd * 4.2, -13, 2.9, 3.6, 0, 0, TAU); c.fill(); c.fillStyle = PAL.ink; c.beginPath(); c.arc(sd * 4.2 + dir * 1.2, -12.5, 1.5, 0, TAU); c.fill(); }
        c.restore();
      },
    };
  }
  function plane(x, y) {
    return { kind: 'plane', enemy: true, gulpable: true, x, y, y0: y, vx: -80, w: 26, h: 16, col: '#e9e0cf', score: 200, z: 3, id: Math.random() * 1000 | 0, awake: false,
      update(G, dt) {
        if (!this.awake) { if (Math.abs(this.x - G.player.x) < G.VW / G.scale * 0.6) this.awake = true; else return; }
        if (this.sucked) { this.sucked = false; this.y0 = this.y; return; }
        this.x += this.vx * dt; this.y = this.y0 + Math.sin(G.t * 2.4 + this.id) * 26;
        if (this.x < -40) this.dead = true;
        if (G.overlap(G.player, this) && !G.player.inhaling) hurt(G.player, this);
      },
      draw(G, c) { if (!this.awake) return; boil(G.t, this.id); c.save(); c.translate(this.x, this.y - 8); INK.blob(c, [[-16, 0], [12, -9], [4, 0], [12, 9]], { wash: '#FDF8EE', ink: PAL.ink, sw: 1.4, smooth: false, rim: false }); c.restore(); },
    };
  }
  function starPickup(x, y) {
    return { kind: 'pickup', x, y: y - 10, w: 18, h: 18, z: 2, update(G) { if (G.overlap(this, G.player)) { this.dead = true; S.score += 100; SFX.play('coin'); } }, draw(G, c) { boil(G.t, Math.round(this.x)); INK.blob(c, INK.starPts(this.x, this.y - 8 + Math.sin(G.t * 4 + this.x) * 2, 8, 0.45, 5), { wash: PAL.ochre, ink: PAL.ink, sw: 1.2, smooth: false }); } };
  }
  function makeGoal(x, y) {
    return { kind: 'goal', x, y, w: 40, h: 60, z: 1, done: false,
      update(G) { if (!this.done && Math.abs(G.player.x - this.x) < 22 && Math.abs(G.player.y - this.y) < 60) { this.done = true; levelClear(); } },
      draw(G, c) { boil(G.t, 700); const r = 22 + Math.sin(G.t * 3) * 2; INK.blob(c, INK.starPts(this.x, this.y - 40, r, 0.45, 5, G.t * 0.8 - Math.PI / 2), { wash: PAL.ochre, ink: PAL.ink, sw: 2, smooth: false, pool: [this.x - 6, this.y - 46, 14] }); INK.text(c, 'GOAL', this.x, this.y - 8, 13, PAL.ink, { font: '"Permanent Marker"', shadow: false }); },
    };
  }

  /* -------------------------------------------------------------- boss */
  function makeBoss(x, y) {
    return { kind: 'boss', enemy: true, x, y, vx: 0, vy: 0, w: 88, h: 76, hp: 14, max: 14, inv: 0, cd: 2, phase: 0, z: 3, id: 99, awake: false, score: 5000, col: '#2f2640',
      update(G, dt) {
        const p = G.player;
        if (!this.awake) { if (Math.abs(this.x - p.x) < 480) { this.awake = true; G.float(T.boss, this.x, this.y - 110, PAL.rose, 26); SFX.play('boom'); } else return; }
        this.inv = Math.max(0, this.inv - dt);
        this.vy = Math.min(this.vy + 1600 * dt, 900);
        const was = G.onGround(this);
        const r = G.move(this, dt);
        if (r.down && !was) { G.shake = 0.7; SFX.play('boom'); }
        if (G.onGround(this)) {
          this.vx *= 0.85; this.cd -= dt;
          if (this.cd <= 0) {
            this.phase++;
            if (this.phase % 3 === 0) { this.vy = -760; this.vx = clamp((p.x - this.x) * 1.2, -360, 360); }
            else { // spit a row of blots: inhale one and send it back as a star
              const dir = Math.sign(p.x - this.x) || -1;
              for (let i = 0; i < (this.hp < 7 ? 3 : 2); i++) setTimeout(() => { if (this.dead) return; const b = creature('blot', this.x + dir * 40, this.y - 30); b.awake = true; b.vx = dir * (120 + i * 30); b.vy = -300; G.ents.push(b); SFX.play('pew'); }, i * 260);
            }
            this.cd = this.hp < 7 ? 1.4 : 2;
          }
        }
        if (G.overlap(p, this)) hurt(p, this);
      },
      draw(G, c) {
        if (this.inv > 0 && Math.floor(G.t * 20) % 2) return;
        boil(G.t, 99);
        const sq = G.onGround(this) ? Math.sin(G.t * 4) * 0.04 : clamp(-this.vy / 4000, -0.14, 0.14);
        c.save(); c.translate(this.x, this.y); c.scale(1 + sq, 1 - sq);
        INK.blob(c, INK.lumpPts(0, -38, 42, 99, 18, 0.14, 1), { wash: this.col, ink: PAL.ink, sw: 2.8, pool: [-14, -54, 24], poolCol: '#b9a7d6' });
        INK.blob(c, [[-22, -74], [-16, -94], [-6, -80], [0, -98], [6, -80], [16, -94], [22, -74]], { wash: '#F2C53D', ink: PAL.ink, sw: 1.8, smooth: false });
        const dir = Math.sign(G.player.x - this.x) || -1;
        for (const sd of [-1, 1]) { c.fillStyle = PAL.cream; c.beginPath(); c.ellipse(sd * 13, -46, 8, 10, 0, 0, TAU); c.fill(); c.fillStyle = PAL.ink; c.beginPath(); c.arc(sd * 13 + dir * 3, -44, 4, 0, TAU); c.fill(); INK.inkLine(c, [[sd * 13 - 9, -60 + (sd < 0 ? 4 : 0)], [sd * 13 + 9, -60 + (sd < 0 ? 0 : 4)]], 2.4); }
        INK.blob(c, INK.ellPts(0, -24, 12, 7 + Math.max(0, Math.sin(G.t * 3)) * 4, 12), { wash: '#4A1F2A', ink: PAL.ink, sw: 1.6 });
        c.restore();
      },
    };
  }
  function bossHit(b, d) {
    if (b.inv > 0) return;
    b.hp -= d; b.inv = 0.6; G.shake = 0.5; SFX.play('hurt'); S.score += 200;
    if (b.hp <= 0) { b.dead = true; S.score += b.score; SFX.play('win'); G.shake = 1; for (let i = 0; i < 5; i++) G.puff(b.x + jit(40), b.y - 40 + jit(30), i % 2 ? '#F2C53D' : '#2f2640', 14, 260); G.ents.push(makeGoal(b.x, (G.level.h - 2) * TS)); }
  }

  function spawn(G, s) {
    if (s.kind === 'player') { G.player = makePlayer(s.x, s.y); G.ents.push(G.player); }
    else if (s.kind === 'star') G.ents.push(starPickup(s.x, s.y));
    else if (ENEMY[s.kind]) G.ents.push(creature(s.kind, s.x, s.y));
    else if (s.kind === 'plane') G.ents.push(plane(s.x, s.y));
    else if (s.kind === 'goal') G.ents.push(makeGoal(s.x, s.y));
    else if (s.kind === 'boss') G.ents.push(makeBoss(s.x, s.y));
  }

  /* ----------------------------------------------------------- drawing */
  function drawBackdrop(G, c) {
    const th = G.theme, W = G.VW, H = G.VH, px = G.cam.x * G.scale;
    for (const [k, col, amp, base] of [[0.2, th.hill2, 0.1, 0.6], [0.45, th.hill, 0.08, 0.72]]) {
      c.save(); c.fillStyle = col; c.globalAlpha = 0.9; c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) { const wx = x + px * k; c.lineTo(x, H * base - Math.abs(Math.sin(wx / 180)) * H * amp * 1.4); }
      c.lineTo(W, H); c.closePath(); c.fill(); c.restore();
    }
  }
  function drawHUD(G, c) {
    if (!G.level || G.mode === 'title' || G.mode === 'loading') return;
    const pad = 14;
    for (let i = 0; i < S.maxHp; i++) { boil(G.t, 800 + i); INK.blob(c, INK.rectPts(pad + i * 22, pad, 18, 22, 0.8), { wash: i < S.hp ? '#E2476E' : rgba(PAL.ink, 0.12), ink: PAL.ink, sw: 1.4, smooth: false }); }
    const pw = S.power;
    INK.text(c, `${KO ? '능력' : 'Power'}: ${T.powerName[pw]}`, pad, pad + 42, 20, pw === 'none' ? (G.theme.dark ? PAL.cream : PAL.ink) : PAL.clay, { align: 'left', shadow: false });
    if (S.mouth) INK.text(c, KO ? '입에 가득! X 뱉기 · ↓ 삼키기' : 'Mouthful! X spit · ↓ swallow', pad, pad + 66, 16, G.theme.dark ? PAL.cream : PAL.ink, { align: 'left', shadow: false });
    INK.text(c, `${S.score}`, G.VW - 64, pad + 16, 24, PAL.clay, { align: 'right', font: '"Permanent Marker"', weight: 400 });
    INK.text(c, `${T.stage(G.levelIndex)} · ${LEVELS[G.levelIndex].name[KO ? 0 : 1]}`, G.VW - 64, pad + 42, 16, G.theme.dark ? PAL.cream : PAL.ink, { align: 'right', shadow: false });
    const boss = G.ents.find((e) => e.kind === 'boss' && e.awake);
    if (boss) {
      const w = Math.min(360, G.VW * 0.6), x = (G.VW - w) / 2, y = G.VH - 40 - (matchMedia('(pointer: coarse)').matches ? 150 : 0);
      c.fillStyle = rgba(PAL.ink, 0.35); c.fillRect(x, y, w, 12); c.fillStyle = '#F2C53D'; c.fillRect(x, y, w * clamp(boss.hp / boss.max), 12);
      INK.text(c, T.boss, G.VW / 2, y - 14, 18, PAL.cream);
    }
    if (G.mode === 'paused') INK.text(c, KO ? '일시 정지' : 'Paused', G.VW / 2, G.VH / 2, 40, PAL.cream, { font: '"Permanent Marker"', weight: 400 });
    if (G.t - introT < 2 && G.mode === 'play') INK.text(c, `${T.stage(G.levelIndex)} — ${LEVELS[G.levelIndex].name[KO ? 0 : 1]}`, G.VW / 2, G.VH * 0.3, 34, PAL.cream, { alpha: clamp((2 - (G.t - introT)) * 2), scale: backOut(clamp((G.t - introT) * 3)), font: '"Permanent Marker", "Gaegu"', weight: 400 });
    if (bakingPower) INK.text(c, T.painting, G.VW / 2, G.VH * 0.4, 22, PAL.cream);
  }

  /* -------------------------------------------------------------- flow */
  let introT = -9, portrait = 'title', bakingPower = false;
  function show(id) { for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id; document.body.classList.toggle('menu', !!id); $('btn-pause').hidden = !!id; }
  function startLevel(i) { G.player = null; S.mouth = null; G.loadLevel(i); G.mode = 'play'; introT = G.t; show(null); SFX.music(true); SFX.play('wave'); }
  function newRun(i) { S.hp = S.maxHp; S.power = 'none'; S.score = 0; startLevel(i); }
  function levelClear() {
    SFX.play('win'); G.mode = 'clear'; SFX.music(false); S.score += 1000; S.hp = Math.min(S.maxHp, S.hp + 2);
    const i = G.levelIndex; S.unlocked = Math.max(S.unlocked, i + 2); try { localStorage.setItem('clawdgulp.unlocked', S.unlocked); } catch {}
    setTimeout(() => {
      if (i === LEVELS.length - 1) return message('win', T.win, T.winText(S.score), [[T.menu, titleScreen]]);
      message('clear', T.clear, T.clearText(S.score), [[T.next, () => startLevel(i + 1)], [T.menu, titleScreen, true]]);
    }, 900);
  }
  function gameOver() { if (G.mode !== 'play') return; G.mode = 'over'; SFX.music(false); SFX.play('lose'); message('ko', T.dead, T.deadText, [[T.retry, () => newRun(G.levelIndex)], [T.menu, titleScreen, true]]); }
  function message(face, title, text, buttons) {
    portrait = face; $('msg-title').textContent = title; $('msg-text').textContent = text;
    const row = $('msg-buttons'); row.innerHTML = '';
    for (const [label, fn, alt] of buttons) { const b = document.createElement('button'); b.className = 'big' + (alt ? ' alt' : ''); b.textContent = label; b.onclick = () => { SFX.play('click'); fn(); }; row.append(b); }
    show('msg');
  }
  function titleScreen() {
    G.mode = 'title'; portrait = 'title'; SFX.music(false);
    const box = $('levels'); box.innerHTML = '';
    LEVELS.forEach((L, i) => { const b = document.createElement('button'); b.disabled = i >= S.unlocked; b.innerHTML = `<b>${i + 1}</b>${L.name[KO ? 0 : 1]}`; b.onclick = () => { SFX.unlock(); SFX.play('card'); newRun(i); }; box.append(b); });
    show('title');
  }
  function togglePause() { if (G.mode === 'play') { G.mode = 'paused'; SFX.music(false); } else if (G.mode === 'paused') { G.mode = 'play'; SFX.music(true); } }
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

  /* ----------------------------------------------------------- sprites */
  const walk = (t, f) => ({ view: 'q', walk: f / 8, dy: -Math.abs(Math.sin(f / 8 * Math.PI * 2)) * 0.4, aL: 0.5 * Math.sin(f / 8 * TAU), aR: -0.5 * Math.sin(f / 8 * TAU), emote: null });
  function setFor(suffix, hat) {
    const o = hat ? { hat } : {};
    return [
      { key: 'stand' + suffix, emotion: 'neutral', frames: 4, over: o },
      { key: 'walk' + suffix, emotion: 'happy', frames: 8, pose: walk, over: { ...o, emote: null } },
      { key: 'jump' + suffix, emotion: 'excited', frames: 3, over: { ...o, view: 'q', aL: 1.3, aR: 1.3, dy: 0, emote: null } },
      { key: 'fall' + suffix, emotion: 'hopeful', frames: 3, over: { ...o, view: 'q', aL: 0.8, aR: 0.8, dy: 0, emote: null } },
      { key: 'attack' + suffix, emotion: 'determined', frames: 3, over: { ...o, view: 'q', aR: 1.5, aL: -0.2, emote: null } },
    ];
  }
  async function bakePower(pw) {
    bakingPower = true;
    await ClawdSprites.bake(setFor(SUFFIX[pw], POWER_HAT[pw]));
    bakingPower = false;
  }
  async function boot() {
    show('loading'); $('load-text').textContent = T.loading;
    const flap = (t, f) => ({ aL: 1.2 + Math.sin(f / 4 * TAU) * 0.6, aR: 1.2 + Math.sin(f / 4 * TAU) * 0.6, dy: 0, sq: -0.06 });
    const specs = [
      ...setFor('', null),
      { key: 'float', emotion: 'relieved', frames: 4, pose: flap, over: { eyes: 'closed', mouth: 'o', blush: 0.6, emote: null } },
      { key: 'inhale', emotion: 'determined', frames: 4, pose: (t, f) => ({ lid: 0.5 + (f % 2) * 0.08, sq: -0.04, aL: 0.9, aR: 0.9, dy: 0 }), over: { mouth: null, emote: null, eyes: 'squeeze' } },
      { key: 'full', emotion: 'happy', frames: 4, over: { mouth: null, emote: null, blush: 0.8, sq: 0.12, dy: 0 } },
      { key: 'hurt', emotion: 'dizzy', frames: 3, over: { emote: null } },
      { key: 'title', emotion: 'laugh', frames: 6, pose: (t, f) => ({ lid: 0.3 + 0.2 * Math.abs(Math.sin(f / 6 * Math.PI)), mouth: null }) },
      { key: 'clear', emotion: 'starstruck', frames: 6 },
      { key: 'win', emotion: 'excited', frames: 6, over: { hat: 'crown' } },
      { key: 'ko', emotion: 'ko', frames: 4 },
    ];
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; });
    renderSound(); titleScreen();
  }
  boot();
  window.__gulp = { G, S, startLevel, newRun };
})();
