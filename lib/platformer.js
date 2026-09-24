// platformer.js — a small side-scrolling engine shared by the platform games.
//
//   const G = Platformer.create({ canvas, tiles, levels, ... })
//
// Levels are ASCII maps (one char per 32 px tile). The engine owns the canvas, input (keyboard, gamepad, and
// on-screen touch buttons), fixed-step physics against the tile grid, the camera, the paper background and a
// pre-painted tile atlas; games bring the tile palette, the entities and the rules.
//
// Player physics feel matters more than anything else, so it's tuned like a modern platformer: acceleration
// and friction instead of instant speed, variable jump height (let go early for a short hop), coyote time
// (you can still jump a moment after running off a ledge) and a jump buffer (press a moment before landing).

(function (root) {
  const { PAL, TAU, clamp, lerp, boil, jit } = INK;
  const TS = 32;

  /* ------------------------------------------------------------- input */
  function makeInput(el) {
    const down = new Set(), pressed = new Set();
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'act', KeyJ: 'act', ShiftLeft: 'act', KeyC: 'alt', KeyL: 'alt', Escape: 'pause', KeyP: 'pause', Enter: 'start' };
    addEventListener('keydown', (e) => { const k = map[e.code]; if (!k) return; if (!down.has(k)) pressed.add(k); down.add(k); if (k !== 'pause') e.preventDefault(); });
    addEventListener('keyup', (e) => { const k = map[e.code]; if (k) down.delete(k); });
    addEventListener('blur', () => down.clear());

    // touch pad: left/right on the left, jump + action on the right
    const pad = document.createElement('div');
    pad.className = 'pf-pad';
    pad.innerHTML = `<div class="pf-dpad"><button data-k="left">◀</button><button data-k="down">▼</button><button data-k="right">▶</button></div>
      <div class="pf-ab"><button data-k="act" class="pf-b">B</button><button data-k="jump" class="pf-a">A</button></div>`;
    document.body.append(pad);
    const touches = new Map();
    const setFrom = () => {
      const want = new Set(touches.values());
      for (const k of ['left', 'right', 'down', 'jump', 'act']) {
        if (want.has(k) && !down.has(k)) { down.add(k); pressed.add(k); }
        if (!want.has(k) && down.has(k) && touchOwned.has(k)) down.delete(k);
      }
      touchOwned = want;
    };
    let touchOwned = new Set();
    const hit = (x, y) => { const b = document.elementFromPoint(x, y)?.closest?.('[data-k]'); return b ? b.dataset.k : null; };
    pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture(e.pointerId); touches.set(e.pointerId, hit(e.clientX, e.clientY)); setFrom(); pad.classList.add('used'); });
    pad.addEventListener('pointermove', (e) => { if (touches.has(e.pointerId)) { touches.set(e.pointerId, hit(e.clientX, e.clientY)); setFrom(); } });
    const up = (e) => { touches.delete(e.pointerId); setFrom(); };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    if (matchMedia('(pointer: coarse)').matches) pad.classList.add('show');

    function poll() {   // gamepad
      const gp = navigator.getGamepads?.()[0]; if (!gp) return;
      const set = (k, v) => { if (v && !down.has(k)) { pressed.add(k); down.add(k); gpOwned.add(k); } else if (!v && gpOwned.has(k)) { down.delete(k); gpOwned.delete(k); } };
      set('left', gp.axes[0] < -0.4 || gp.buttons[14]?.pressed); set('right', gp.axes[0] > 0.4 || gp.buttons[15]?.pressed);
      set('down', gp.axes[1] > 0.5 || gp.buttons[13]?.pressed); set('up', gp.axes[1] < -0.5 || gp.buttons[12]?.pressed);
      set('jump', gp.buttons[0]?.pressed); set('act', gp.buttons[2]?.pressed || gp.buttons[1]?.pressed); set('pause', gp.buttons[9]?.pressed);
    }
    const gpOwned = new Set();
    return { down, pressed, poll, isDown: (k) => down.has(k), hit: (k) => pressed.has(k), endFrame: () => pressed.clear(), pad };
  }

  /* -------------------------------------------------------------- level */
  function parse(rows, legend) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const grid = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
      const ch = rows[y][x] || ' ';
      return legend[ch]?.tile ?? (legend[ch] ? ' ' : ch);
    }));
    const spawns = [];
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (legend[ch]?.spawn) spawns.push({ kind: legend[ch].spawn, x: x * TS + TS / 2, y: (y + 1) * TS, ch }); }));
    return { w, h, grid, spawns };
  }

  /* --------------------------------------------------------------- core */
  function create(opt) {
    const cv = opt.canvas, c = cv.getContext('2d');
    const input = makeInput(cv);
    const G = {
      c, cv, input, TS, t: 0, dt: 1 / 60, mode: 'loading', level: null, ents: [], player: null, cam: { x: 0, y: 0 }, shake: 0,
      VW: 0, VH: 0, DPR: 1, scale: 1, solid: opt.solid, oneway: opt.oneway || new Set(), hazard: opt.hazard || new Set(), atlas: {}, paperC: null, grainC: null, theme: opt.themes?.[0],
      floats: [], parts: [], opt,
    };

    function resize() {
      G.DPR = Math.min(2, devicePixelRatio || 1);
      G.VW = innerWidth; G.VH = innerHeight;
      cv.width = Math.round(G.VW * G.DPR); cv.height = Math.round(G.VH * G.DPR);
      G.scale = G.VH / (TS * (opt.viewTiles || 14));
      G.paperC = INK.paper(cv.width, cv.height, 11);
      G.grainC = INK.grain(Math.round(G.VW), Math.round(G.VH));
    }
    addEventListener('resize', resize); resize();

    // tiles are painted once into an atlas (3 boil variants each) and blitted
    G.bakeTiles = (theme) => {
      G.atlas = {};
      for (const [ch, paintFn] of Object.entries(opt.tiles)) {
        G.atlas[ch] = [0, 1, 2].map((v) => {
          const k = document.createElement('canvas'); k.width = k.height = TS * 2 + 16;
          const g = k.getContext('2d'); g.scale(2, 2); g.translate(4, 4);
          boil(v / 12, ch.charCodeAt(0) * 7 + v);
          paintFn(g, theme, v);
          return k;
        });
      }
    };

    G.tileAt = (tx, ty) => (ty < 0 ? ' ' : ty >= G.level.h ? '#' : tx < 0 || tx >= G.level.w ? '#' : G.level.grid[ty][tx]);
    G.setTile = (tx, ty, ch) => { if (G.level.grid[ty]) G.level.grid[ty][tx] = ch; };
    G.isSolid = (ch) => G.solid.has(ch);

    // Move an AABB body through the grid, resolving x then y. Returns contact flags.
    G.move = (b, dt) => {
      const res = { left: false, right: false, up: false, down: false, bumped: null };
      b.x += b.vx * dt;
      const x0 = Math.floor((b.x - b.w / 2) / TS), x1 = Math.floor((b.x + b.w / 2 - 0.01) / TS);
      const y0 = Math.floor((b.y - b.h) / TS), y1 = Math.floor((b.y - 0.01) / TS);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        if (!G.isSolid(G.tileAt(tx, ty))) continue;
        if (b.vx > 0) { b.x = tx * TS - b.w / 2; res.right = true; } else if (b.vx < 0) { b.x = (tx + 1) * TS + b.w / 2; res.left = true; }
        b.vx = 0;
      }
      const prevBottom = b.y;
      b.y += b.vy * dt;
      const X0 = Math.floor((b.x - b.w / 2 + 0.01) / TS), X1 = Math.floor((b.x + b.w / 2 - 0.01) / TS);
      const Y0 = Math.floor((b.y - b.h) / TS), Y1 = Math.floor((b.y - 0.01) / TS);
      for (let ty = Y0; ty <= Y1; ty++) for (let tx = X0; tx <= X1; tx++) {
        const ch = G.tileAt(tx, ty);
        const one = G.oneway.has(ch);
        if (!G.isSolid(ch) && !one) continue;
        if (one && !(b.vy > 0 && prevBottom <= ty * TS + 1 && !b.dropThrough)) continue;
        if (b.vy > 0) { b.y = ty * TS; res.down = true; }
        else if (b.vy < 0 && !one) { b.y = (ty + 1) * TS + b.h; res.up = true; if (!res.bumped || Math.abs(tx * TS + TS / 2 - b.x) < Math.abs(res.bumped[0] * TS + TS / 2 - b.x)) res.bumped = [tx, ty]; }
        b.vy = 0;
      }
      return res;
    };
    G.onGround = (b) => {
      const ty = Math.floor((b.y + 1) / TS);
      for (const x of [b.x - b.w / 2 + 1, b.x + b.w / 2 - 1]) { const ch = G.tileAt(Math.floor(x / TS), ty); if (G.isSolid(ch) || (G.oneway.has(ch) && Math.abs(b.y - ty * TS) < 2)) return true; }
      return false;
    };
    G.touchesHazard = (b) => {
      const x0 = Math.floor((b.x - b.w / 2 + 3) / TS), x1 = Math.floor((b.x + b.w / 2 - 3) / TS), y0 = Math.floor((b.y - b.h + 3) / TS), y1 = Math.floor((b.y - 2) / TS);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (G.hazard.has(G.tileAt(tx, ty))) return true;
      return false;
    };
    G.overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2;

    // Standard player controller: returns the move result. p needs x, y, vx, vy, w, h.
    G.platformPhysics = (p, dt, k = {}) => {
      const P = { accel: 2000, air: 1400, friction: 2200, max: 210, runMax: 290, gravity: 1900, fall: 900, jump: 640, ...k };
      const I = input, dir = (I.isDown('right') ? 1 : 0) - (I.isDown('left') ? 1 : 0);
      const ground = G.onGround(p);
      if (ground) p.coyote = 0.1; else p.coyote = Math.max(0, (p.coyote || 0) - dt);
      if (I.hit('jump')) p.buffer = 0.12; else p.buffer = Math.max(0, (p.buffer || 0) - dt);
      const max = I.isDown('act') ? P.runMax : P.max;
      if (dir) { p.vx += dir * (ground ? P.accel : P.air) * dt; p.face = dir; }
      else if (ground) { const f = P.friction * dt; p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f; }
      p.vx = clamp(p.vx, -max, max);
      let jumped = false;
      if (p.buffer > 0 && p.coyote > 0) { p.vy = -P.jump; p.buffer = 0; p.coyote = 0; jumped = true; p.jumpHeld = true; }
      if (p.jumpHeld && !I.isDown('jump') && p.vy < 0) { p.vy *= 0.5; p.jumpHeld = false; }
      if (p.vy >= 0) p.jumpHeld = false;
      p.vy = Math.min(P.fall, p.vy + P.gravity * (p.vy > 0 ? 1.15 : 1) * dt * (P.gravityMul || 1));
      p.dropThrough = I.isDown('down') && ground;
      const r = G.move(p, dt);
      r.jumped = jumped; r.ground = G.onGround(p);
      return r;
    };

    G.loadLevel = (i) => {
      const L = opt.levels[i];
      G.levelIndex = i;
      G.level = parse(L.map, opt.legend);
      G.theme = opt.themes[L.theme || 0];
      G.bakeTiles(G.theme);
      G.ents = []; G.floats = []; G.parts = [];
      for (const s of G.level.spawns) opt.spawn(G, s);
      G.cam.x = G.player ? G.player.x : 0; G.cam.y = G.player ? G.player.y : 0;
      opt.onLevel?.(G, L);
    };

    G.float = (s, x, y, col = PAL.cream, size = 18) => G.floats.push({ s, x, y, t0: G.t, col, size });
    G.puff = (x, y, col, n = 8, sp = 160) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.4 + Math.random()); G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: 2 + Math.random() * 4, col, age: 0, life: 0.4 + Math.random() * 0.4 }); } };

    function drawBackground() {
      const th = G.theme;
      c.setTransform(1, 0, 0, 1, 0, 0);
      if (th.sky) { c.fillStyle = th.sky; c.fillRect(0, 0, cv.width, cv.height); c.globalAlpha = th.paperOp ?? 0.5; }
      c.drawImage(G.paperC, 0, 0); c.globalAlpha = 1;
      c.setTransform(G.DPR, 0, 0, G.DPR, 0, 0);
      opt.drawBackdrop?.(G, c);
    }
    function drawTiles() {
      const s = G.scale, x0 = Math.floor((G.cam.x - G.VW / 2 / s) / TS) - 1, x1 = Math.ceil((G.cam.x + G.VW / 2 / s) / TS) + 1;
      const y0 = Math.floor((G.cam.y - G.VH / 2 / s) / TS) - 1, y1 = Math.ceil((G.cam.y + G.VH / 2 / s) / TS) + 1;
      const v = Math.floor(G.t * 12) % 3;
      for (let ty = Math.max(0, y0); ty <= Math.min(G.level.h - 1, y1); ty++) for (let tx = Math.max(0, x0); tx <= Math.min(G.level.w - 1, x1); tx++) {
        const ch = G.level.grid[ty][tx]; const a = G.atlas[ch]; if (!a) continue;
        // neighbours tell the painter whether this is a top edge (for grass etc.)
        const img = a[(v + tx * 7 + ty * 3) % 3];
        c.drawImage(img, tx * TS - 2, ty * TS - 2, TS + 8, TS + 8);
        if (opt.decorate) opt.decorate(G, c, ch, tx, ty);
      }
    }

    let last = performance.now(), acc = 0;
    function frame(now) {
      const real = Math.min(0.1, (now - last) / 1000); last = now;
      input.poll();
      if (input.hit('pause')) opt.onPause?.(G);
      if (G.mode === 'play') {
        acc += real;
        while (acc >= G.dt) {
          G.t += G.dt;
          opt.update(G, G.dt);
          for (const e of G.ents) if (!e.dead && e.update) e.update(G, G.dt);
          G.ents = G.ents.filter((e) => !e.dead);
          for (const p of G.parts) { p.age += G.dt; p.x += p.vx * G.dt; p.y += p.vy * G.dt; p.vy += 600 * G.dt; }
          G.parts = G.parts.filter((p) => p.age < p.life);
          G.floats = G.floats.filter((f) => G.t - f.t0 < 1);
          input.endFrame();
          acc -= G.dt;
          if (G.mode !== 'play') break;
        }
        // camera: lead a little in the facing direction, clamp to the level
        const p = G.player;
        if (p) {
          const s = G.scale, hw = G.VW / 2 / s, hh = G.VH / 2 / s;
          const tx = p.x + (p.face || 1) * 40, ty = p.y - 40;
          G.cam.x = lerp(G.cam.x, tx, 1 - Math.exp(-real * 6)); G.cam.y = lerp(G.cam.y, ty, 1 - Math.exp(-real * 4));
          G.cam.x = clamp(G.cam.x, hw, Math.max(hw, G.level.w * TS - hw));
          G.cam.y = clamp(G.cam.y, hh, Math.max(hh, G.level.h * TS - hh));
        }
      } else { input.endFrame(); if (G.mode !== 'paused') G.t += real; }
      G.shake = Math.max(0, G.shake - real * 3);

      drawBackground();
      if (G.level) {
        const s = G.scale, sh = G.shake * 6;
        c.setTransform(G.DPR * s, 0, 0, G.DPR * s, G.DPR * (G.VW / 2 - G.cam.x * s + (Math.random() - 0.5) * sh), G.DPR * (G.VH / 2 - G.cam.y * s + (Math.random() - 0.5) * sh));
        opt.drawBehind?.(G, c);
        drawTiles();
        const ents = G.ents.slice().sort((a, b) => (a.z || 0) - (b.z || 0));
        for (const e of ents) e.draw?.(G, c);
        for (const p of G.parts) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
        c.globalAlpha = 1;
        for (const f of G.floats) { const k = (G.t - f.t0); INK.text(c, f.s, f.x, f.y - k * 30, f.size, f.col, { alpha: 1 - clamp((k - 0.6) / 0.4) }); }
      }
      c.setTransform(G.DPR, 0, 0, G.DPR, 0, 0);
      opt.drawHUD?.(G, c);
      c.globalCompositeOperation = 'multiply'; c.drawImage(G.grainC, 0, 0, G.VW, G.VH); c.globalCompositeOperation = 'source-over';
      opt.afterFrame?.(G);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return G;
  }

  root.Platformer = { create, TS };
})(window);
