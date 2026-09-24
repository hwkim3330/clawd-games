// Ink Wars — a small real-time strategy game on a sheet of paper. Gather ink and paper, build, train an army of
// Clawds and flatten the violet Smudge Clawds' headquarters before they flatten yours.
//
//   mouse: left-drag / click select · right-click move, attack, gather · A then click = attack-move · S stop
//   wheel zoom · arrows / screen edges pan · H home · minimap click jumps
//   touch: tap to select or command · one-finger drag = box select · two-finger drag = pan · pinch = zoom

(() => {
  const { PAL, TAU, clamp, lerp, backOut, mix, rgba, boil, jit, hash } = INK;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
  const L = (ko, en) => (KO ? ko : en);

  /* --------------------------------------------------------------- data */
  const TS = 32, MW = 64, MH = 48;
  const UNIT = {
    worker:  { hp: 40, sp: 62, dmg: 3, range: 18, cd: 1.0, sight: 180, cost: { ink: 50 }, time: 10, supply: 1, name: L('일꾼', 'Worker'), key: 'q' },
    fighter: { hp: 95, sp: 56, dmg: 9, range: 20, cd: 0.9, sight: 200, cost: { ink: 60, paper: 25 }, time: 14, supply: 1, name: L('검사', 'Fighter'), key: 'q' },
    slinger: { hp: 55, sp: 60, dmg: 7, range: 120, cd: 1.2, sight: 230, cost: { ink: 45, paper: 50 }, time: 15, supply: 1, name: L('투척수', 'Slinger'), key: 'w' },
  };
  const BUILD = {
    hq:       { w: 3, h: 3, hp: 1400, cost: { ink: 400 }, time: 60, sight: 260, supply: 10, trains: ['worker'], name: L('본부', 'Headquarters'), drop: true },
    barracks: { w: 3, h: 3, hp: 750, cost: { ink: 150, paper: 100 }, time: 40, sight: 200, trains: ['fighter', 'slinger'], name: L('병영', 'Barracks'), key: 'w' },
    house:    { w: 2, h: 2, hp: 320, cost: { paper: 70 }, time: 22, sight: 150, supply: 8, name: L('집', 'House'), key: 'q' },
    tower:    { w: 2, h: 2, hp: 520, cost: { ink: 80, paper: 110 }, time: 35, sight: 260, range: 170, dmg: 11, cd: 1.1, name: L('탑', 'Tower'), key: 'e' },
  };
  const TEAM_COL = [PAL.clay, '#8A6BC4'];

  /* --------------------------------------------------------------- map */
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tiles = new Uint8Array(MW * MH);     // 0 grass, 1 tree, 2 water, 3 rock
  const wood = new Uint16Array(MW * MH);
  const occ = new Int32Array(MW * MH).fill(-1);   // building id occupying the tile
  const T_ = (x, y) => (x < 0 || y < 0 || x >= MW || y >= MH ? 3 : tiles[y * MW + x]);
  const passable = (x, y) => T_(x, y) === 0 && occ[y * MW + x] < 0;
  function genMap(s) {
    seed = s; tiles.fill(0); wood.fill(0); occ.fill(-1);
    const blob = (cx, cy, r, v) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y) + rnd() * 1.6; if (d < r) { const X = cx + x, Y = cy + y; if (X >= 0 && Y >= 0 && X < MW && Y < MH) tiles[Y * MW + X] = v; } } };
    // a lake in the middle, split by two fords; forest clumps; a few rocks — mirrored so both sides are fair
    const sym = (fn) => { fn(false); fn(true); };
    sym((m) => { const f = (x, y) => (m ? [MW - 1 - x, MH - 1 - y] : [x, y]);
      for (let i = 0; i < 9; i++) { const [x, y] = f(6 + Math.floor(rnd() * 24), 4 + Math.floor(rnd() * 40)); blob(x, y, 2 + Math.floor(rnd() * 3), 1); }
      for (let i = 0; i < 4; i++) { const [x, y] = f(12 + Math.floor(rnd() * 20), 6 + Math.floor(rnd() * 36)); blob(x, y, 1 + Math.floor(rnd() * 2), 3); }
    });
    blob(MW / 2, MH / 2, 6, 2); blob(MW / 2 - 4, MH / 2 - 5, 4, 2); blob(MW / 2 + 4, MH / 2 + 5, 4, 2);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tiles[y * MW + x] === 1) wood[y * MW + x] = 60;
    // keep the bases clear
    for (const [bx, by] of [[8, MH - 9], [MW - 9, 8]]) for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) { const X = bx + x, Y = by + y; if (X >= 0 && Y >= 0 && X < MW && Y < MH) tiles[Y * MW + X] = 0; }
    // and a forest behind each base
    for (const [fx, fy] of [[2, MH - 16], [3, MH - 3], [MW - 3, 15], [MW - 4, 2]]) { blob(fx, fy, 3, 1); }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tiles[y * MW + x] === 1 && !wood[y * MW + x]) wood[y * MW + x] = 60;
    // fords across the lake
    for (let i = -1; i <= 1; i++) for (let k = -8; k <= 8; k++) { tiles[(MH / 2 + i) * MW + MW / 2 + k] = 0; tiles[(MH / 2 + k) * MW + MW / 2 + i] = 0; }
  }

  /* --------------------------------------------------------------- state */
  let ents = [], nextId = 1, t = 0, mode = 'loading', fx = [], stains = [];
  const res = [{ ink: 250, paper: 120 }, { ink: 250, paper: 120 }];
  let difficulty = 'normal';
  const sel = new Set();
  const byId = new Map();
  const vis = new Uint8Array(MW * MH), seen = new Uint8Array(MW * MH);   // team 0 fog
  const supply = (team) => ents.filter((e) => e.team === team && e.unit && !e.dead).reduce((a, e) => a + UNIT[e.type].supply, 0) + ents.filter((e) => e.team === team && e.building && e.queue).reduce((a, e) => a + e.queue.length, 0);
  const supplyCap = (team) => Math.min(60, ents.filter((e) => e.team === team && e.building && e.done && !e.dead).reduce((a, e) => a + (BUILD[e.type].supply || 0), 0));

  function addUnit(team, type, x, y) {
    const U = UNIT[type];
    const e = { id: nextId++, team, unit: true, type, x, y, hp: U.hp, max: U.hp, order: null, path: null, cd: 0, carry: null, face: 1, walkD: Math.random() * 10, hitT: -9, r: 9 };
    ents.push(e); byId.set(e.id, e); return e;
  }
  function addBuilding(team, type, tx, ty, done = false) {
    const B = BUILD[type];
    const e = { id: nextId++, team, building: true, type, tx, ty, x: (tx + B.w / 2) * TS, y: (ty + B.h / 2) * TS, hp: done ? B.hp : B.hp * 0.1, max: B.hp, done, progress: done ? 1 : 0, queue: [], qt: 0, cd: 0, rally: null, hitT: -9, r: B.w * TS * 0.5 };
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) occ[(ty + y) * MW + tx + x] = e.id;
    ents.push(e); byId.set(e.id, e); terrainDirty = true; return e;
  }
  function addWell(tx, ty) {
    const e = { id: nextId++, team: -1, well: true, tx, ty, x: (tx + 1) * TS, y: (ty + 1) * TS, amount: 1500, r: 28 };
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) occ[(ty + y) * MW + tx + x] = e.id;
    ents.push(e); byId.set(e.id, e); return e;
  }
  function canPlace(type, tx, ty) {
    const B = BUILD[type];
    for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
      const X = tx + x, Y = ty + y; if (!passable(X, Y)) return false;
      if (ents.some((u) => u.unit && !u.dead && Math.floor(u.x / TS) === X && Math.floor(u.y / TS) === Y && u.order?.type !== 'build')) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ paths */
  // A* on the tile grid, 8 directions without cutting corners. Paths end next to blocked goals.
  function findPath(sx, sy, gx, gy, maxNodes = 4000) {
    sx = clamp(sx, 0, MW - 1); sy = clamp(sy, 0, MH - 1); gx = clamp(gx, 0, MW - 1); gy = clamp(gy, 0, MH - 1);
    const goalOk = passable(gx, gy);
    const N = MW * MH, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const open = [[0, sx, sy]]; g[sy * MW + sx] = 0;
    const h = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
    let best = sy * MW + sx, bestH = h(sx, sy), n = 0;
    while (open.length && n++ < maxNodes) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, x, y] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      const k = y * MW + x; if (closed[k]) continue; closed[k] = 1;
      const hh = h(x, y); if (hh < bestH) { bestH = hh; best = k; }
      if (x === gx && y === gy) { best = k; break; }
      if (!goalOk && Math.max(Math.abs(x - gx), Math.abs(y - gy)) <= 1) { best = k; break; }
      for (const [dx, dy, cost] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]) {
        const X = x + dx, Y = y + dy; if (!passable(X, Y)) continue;
        if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
        const K = Y * MW + X, ng = g[k] + cost; if (ng < g[K]) { g[K] = ng; from[K] = k; open.push([ng + h(X, Y), X, Y]); }
      }
    }
    const P = []; let k = best; while (k >= 0 && k !== sy * MW + sx) { P.push([(k % MW) * TS + TS / 2, Math.floor(k / MW) * TS + TS / 2]); k = from[k]; }
    P.reverse();
    // string-pull: drop waypoints we can see past
    const out = []; let i = 0, cx = sx * TS + 16, cy = sy * TS + 16;
    while (i < P.length) { let j = P.length - 1; while (j > i && !lineClear(cx, cy, P[j][0], P[j][1])) j--; out.push(P[j]); [cx, cy] = P[j]; i = j + 1; }
    return out;
  }
  function lineClear(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 10);
    for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n); for (const [ox, oy] of [[-7, -7], [7, 7], [7, -7], [-7, 7]]) if (!passable(Math.floor((x + ox) / TS), Math.floor((y + oy) / TS))) return false; }
    return true;
  }

  /* ------------------------------------------------------------ orders */
  function order(u, o) { u.order = o; u.path = null; u.repath = 0; }
  function moveGroup(units, x, y, type = 'move') {
    const n = units.length, cols = Math.ceil(Math.sqrt(n));
    units.forEach((u, i) => { const ox = ((i % cols) - (cols - 1) / 2) * 22, oy = (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * 22; order(u, { type, x: x + ox, y: y + oy }); });
    if (units.length && units[0].team === 0) { fx.push({ type: 'ping', x, y, t0: t, col: type === 'amove' ? PAL.red : PAL.sap }); SFX.play('click'); }
  }
  function nearest(list, x, y, f = () => true) { let b = null, bd = Infinity; for (const e of list) { if (e.dead || !f(e)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } } return b; }
  function nearestTree(x, y, r = 14) {
    const cx = Math.floor(x / TS), cy = Math.floor(y / TS); let b = null, bd = Infinity;
    for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) { if (T_(xx, yy) !== 1 || !wood[yy * MW + xx]) continue; const d = Math.hypot(xx - cx, yy - cy); if (d < bd) { bd = d; b = [xx, yy]; } }
    return b;
  }

  /* ------------------------------------------------------------ update */
  function stepToward(u, tx, ty, dt, stopDist = 4) {
    const U = UNIT[u.type];
    if (!u.path || u.repath <= 0 || u.pathGoal?.[0] !== Math.floor(tx / TS) || u.pathGoal?.[1] !== Math.floor(ty / TS)) {
      if (lineClear(u.x, u.y, tx, ty)) u.path = [[tx, ty]];
      else u.path = findPath(Math.floor(u.x / TS), Math.floor(u.y / TS), Math.floor(tx / TS), Math.floor(ty / TS));
      u.pathGoal = [Math.floor(tx / TS), Math.floor(ty / TS)]; u.repath = 1.5 + Math.random();
    }
    u.repath -= dt;
    while (u.path.length && Math.hypot(u.path[0][0] - u.x, u.path[0][1] - u.y) < 6) u.path.shift();
    const wp = u.path[0] || [tx, ty];
    const dx = wp[0] - u.x, dy = wp[1] - u.y, d = Math.hypot(dx, dy);
    if (!u.path.length && Math.hypot(tx - u.x, ty - u.y) <= stopDist) return true;
    if (d < 0.5) return !u.path.length;
    const s = Math.min(d, U.sp * dt);
    let nx = u.x + dx / d * s, ny = u.y + dy / d * s;
    if (passable(Math.floor(nx / TS), Math.floor(ny / TS))) { u.x = nx; u.y = ny; }
    else u.repath = 0;
    u.face = dx < 0 ? -1 : 1; u.walkD += s / 22; u.moving = true;
    return false;
  }
  function separate(dt) {
    const units = ents.filter((e) => e.unit && !e.dead);
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const a = units[i], b = units[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r - 2;
      if (d > 0 && d < m) { const p = (m - d) / 2, ux = dx / d, uy = dy / d;
        const move = (e, s) => { const nx = e.x + ux * p * s, ny = e.y + uy * p * s; if (passable(Math.floor(nx / TS), Math.floor(ny / TS))) { e.x = nx; e.y = ny; } };
        if (a.order?.type !== 'gatherAt') move(a, -1); if (b.order?.type !== 'gatherAt') move(b, 1); }
    }
  }
  function distTo(u, e) { return Math.max(0, Math.hypot(e.x - u.x, e.y - u.y) - (e.building ? e.r * 0.9 : e.well ? e.r : e.r || 9)); }
  function dropOff(u) { return nearest(ents, u.x, u.y, (e) => e.team === u.team && e.building && e.done && BUILD[e.type].drop); }

  function updateUnit(u, dt) {
    const U = UNIT[u.type]; u.cd -= dt; u.moving = false;
    const o = u.order;
    // idle or attack-moving units pick fights in sight
    if (!o || o.type === 'amove' || (o.type === 'idle')) {
      const foe = nearest(ents, u.x, u.y, (e) => e.team === 1 - u.team && (e.unit || e.building) && Math.hypot(e.x - u.x, e.y - u.y) < (u.type === 'worker' ? 60 : U.sight));
      if (foe && (u.type !== 'worker' || distTo(u, foe) < 40)) { u.order = { type: 'attack', id: foe.id, then: o }; return; }
    }
    if (!o) return;
    if (o.type === 'move' || o.type === 'amove') { if (stepToward(u, o.x, o.y, dt, 6)) u.order = null; return; }
    if (o.type === 'attack') {
      const tgt = byId.get(o.id);
      if (!tgt || tgt.dead) { u.order = o.then && o.then.type === 'amove' ? o.then : null; return; }
      if (distTo(u, tgt) > U.range) { stepToward(u, tgt.x, tgt.y, dt, U.range); return; }
      u.face = tgt.x < u.x ? -1 : 1; u.attackT = t;
      if (u.cd <= 0) {
        u.cd = U.cd;
        if (u.type === 'slinger') fx.push({ type: 'shot', x: u.x, y: u.y - 10, id: tgt.id, dmg: U.dmg, team: u.team, sp: 320 });
        else { damage(tgt, U.dmg, u); SFX.play(u.team === 0 ? 'hit' : 'hit'); }
      }
      return;
    }
    if (o.type === 'gather') {       // walk to the node, then work it
      const node = o.well ? byId.get(o.well) : null;
      if (u.carry && u.carry.n >= 8) { u.order = { type: 'return', back: o }; return; }
      if (o.well) {
        if (!node || node.dead || node.amount <= 0) { const w = nearest(ents, u.x, u.y, (e) => e.well && e.amount > 0); u.order = w ? { type: 'gather', well: w.id } : null; return; }
        if (distTo(u, node) > 8) { stepToward(u, node.x, node.y, dt, node.r + 4); return; }
        o.work = (o.work || 0) + dt;
        if (o.work > 1.3) { o.work = 0; node.amount -= 8; u.carry = { kind: 'ink', n: 8 }; if (node.amount <= 0) { node.dead = true; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) occ[(node.ty + y) * MW + node.tx + x] = -1; } }
      } else {
        let [tx, ty] = o.tree || [];
        if (!o.tree || T_(tx, ty) !== 1) { const tr = nearestTree(u.x, u.y); if (!tr) { u.order = null; return; } o.tree = tr; [tx, ty] = tr; }
        const cx = tx * TS + 16, cy = ty * TS + 16;
        if (Math.hypot(cx - u.x, cy - u.y) > 30) { stepToward(u, cx, cy, dt, 26); return; }
        o.work = (o.work || 0) + dt; u.attackT = t; u.face = cx < u.x ? -1 : 1;
        if (o.work > 1.7) { o.work = 0; const k = ty * MW + tx; wood[k] = Math.max(0, wood[k] - 8); u.carry = { kind: 'paper', n: 8 }; if (!wood[k]) { tiles[k] = 0; terrainDirty = true; } }
      }
      return;
    }
    if (o.type === 'return') {
      const hq = dropOff(u); if (!hq) { u.order = null; return; }
      if (distTo(u, hq) > 6) { stepToward(u, hq.x, hq.y, dt, hq.r); return; }
      res[u.team][u.carry.kind] += u.carry.n; if (u.team === 0) floatText(`+${u.carry.n}`, u.x, u.y - 20, u.carry.kind === 'ink' ? PAL.indigo : '#8C6A4A');
      u.carry = null; u.order = o.back; return;
    }
    if (o.type === 'build') {
      const B = BUILD[o.what];
      const cx = (o.tx + B.w / 2) * TS, cy = (o.ty + B.h / 2) * TS;
      let site = o.site ? byId.get(o.site) : null;
      if (!site) {
        if (Math.hypot(cx - u.x, cy - u.y) > B.w * TS * 0.8) { stepToward(u, cx, cy, dt, B.w * TS * 0.7); return; }
        if (!canPlace(o.what, o.tx, o.ty) || !afford(u.team, B.cost)) { u.order = null; if (u.team === 0) toast(L('여기엔 지을 수 없어요', "Can't build there")); return; }
        pay(u.team, B.cost); site = addBuilding(u.team, o.what, o.tx, o.ty); o.site = site.id;
      }
      if (site.dead) { u.order = null; return; }
      if (distTo(u, site) > 10) { stepToward(u, site.x, site.y, dt, site.r); return; }
      u.attackT = t;
      site.progress += dt / B.time; site.hp = Math.min(site.max, site.hp + site.max * 0.9 * dt / B.time);
      if (site.progress >= 1) { site.progress = 1; site.done = true; site.hp = Math.max(site.hp, site.max * 0.95); u.order = null; if (u.team === 0) { SFX.play('card'); toast(`${B.name} ${L('완성!', 'done!')}`); } if (u.team === 0 && o.after) u.order = o.after; }
    }
  }

  function updateBuilding(b, dt) {
    const B = BUILD[b.type];
    if (!b.done) return;
    if (b.queue.length) {
      const type = b.queue[0];
      if (supply(b.team) - b.queue.length + 1 > supplyCap(b.team)) { b.blocked = true; }
      else {
        b.blocked = false; b.qt += dt;
        if (b.qt >= UNIT[type].time) {
          b.qt = 0; b.queue.shift();
          const spot = freeSpotNear(b);
          const u = addUnit(b.team, type, spot[0], spot[1]);
          if (b.rally) { if (b.rally.well) order(u, { type: 'gather', well: b.rally.well }); else order(u, { type: type === 'worker' ? 'move' : 'amove', x: b.rally.x, y: b.rally.y }); }
          else if (type === 'worker' && b.team === 0) { const w = nearest(ents, u.x, u.y, (e) => e.well && e.amount > 0); if (w) order(u, { type: 'gather', well: w.id }); }
          if (b.team === 0) SFX.play('coin');
        }
      }
    }
    if (B.range) {
      b.cd -= dt;
      const foe = nearest(ents, b.x, b.y, (e) => e.team === 1 - b.team && (e.unit || e.building) && Math.hypot(e.x - b.x, e.y - b.y) < B.range);
      if (foe && b.cd <= 0) { b.cd = B.cd; fx.push({ type: 'shot', x: b.x, y: b.y - 30, id: foe.id, dmg: B.dmg, team: b.team, sp: 380, big: true }); }
    }
  }
  function freeSpotNear(b) {
    const B = BUILD[b.type];
    for (let r = 1; r < 6; r++) for (let y = b.ty - r; y < b.ty + B.h + r; y++) for (let x = b.tx - r; x < b.tx + B.w + r; x++) {
      if (x >= b.tx && x < b.tx + B.w && y >= b.ty && y < b.ty + B.h) continue;
      if (passable(x, y)) return [x * TS + 16 + jit(4), y * TS + 16 + jit(4)];
    }
    return [b.x, b.y + B.h * TS];
  }

  function damage(e, d, from) {
    if (e.dead) return;
    e.hp -= d; e.hitT = t;
    if (e.unit && !e.order && from) e.order = { type: 'attack', id: from.id };
    if (e.team === 0) underAttack(e);
    if (e.hp <= 0) kill(e);
  }
  function kill(e) {
    e.dead = true; sel.delete(e.id);
    if (e.building) {
      const B = BUILD[e.type]; for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) occ[(e.ty + y) * MW + e.tx + x] = -1;
      terrainDirty = true; SFX.play('boom'); shake = 0.6; for (let i = 0; i < 16; i++) parts.push(part(e.x + jit(40), e.y + jit(30), i % 2 ? '#C9B79B' : TEAM_COL[e.team]));
    } else SFX.play('splat');
    stains.push({ x: e.x, y: e.y, r: e.building ? 40 : 10, col: TEAM_COL[e.team], id: e.id });
    checkEnd();
  }

  /* ------------------------------------------------------------ AI */
  const AI = { t: 0, wave: 0, nextAttack: 150, army: [], builds: {}, lastHelp: 0 };
  function aiThink() {
    const me = 1, R = res[me], mul = { easy: 0.7, normal: 1, hard: 1.35 }[difficulty];
    const mine = ents.filter((e) => e.team === me && !e.dead);
    const hq = mine.find((e) => e.type === 'hq'); if (!hq) return;
    const workers = mine.filter((e) => e.type === 'worker'), army = mine.filter((e) => e.unit && e.type !== 'worker');
    const bs = (type) => mine.filter((e) => e.type === type);
    // cheat gently on higher difficulty: a trickle of extra income
    R.ink += (mul - 1) * 1.2; R.paper += (mul - 1) * 0.8;
    // economy
    if (workers.length < 10 + (difficulty === 'hard' ? 4 : 0) && hq.queue.length < 2 && afford(me, UNIT.worker.cost) && supply(me) < supplyCap(me)) { pay(me, UNIT.worker.cost); hq.queue.push('worker'); }
    // keep roughly 40% of the workers on trees (paper), more when paper is what's holding us back
    const onTrees = workers.filter((w) => (w.order?.type === 'gather' && !w.order.well) || (w.order?.type === 'return' && w.order.back && !w.order.back.well));
    const wantTrees = Math.round(workers.length * (R.paper < 60 && R.ink > 150 ? 0.6 : 0.4));
    if (onTrees.length < wantTrees) { const inker = workers.find((w) => w.order?.type === 'gather' && w.order.well && !w.carry); if (inker) order(inker, { type: 'gather' }); }
    else if (onTrees.length > wantTrees + 1 && R.ink < 100) { const chopper = onTrees.find((w) => !w.carry); const well = chopper && nearest(ents, chopper.x, chopper.y, (e) => e.well && e.amount > 0); if (well) order(chopper, { type: 'gather', well: well.id }); }
    const idle = workers.filter((w) => !w.order);
    idle.forEach((w, i) => { const inkers = workers.filter((x) => x.order?.type === 'gather' && x.order.well).length; if (inkers < workers.length * 0.6) { const well = nearest(ents, w.x, w.y, (e) => e.well && e.amount > 0); if (well) order(w, { type: 'gather', well: well.id }); } else order(w, { type: 'gather' }); });
    // build order
    const want = (type) => { const b = BUILD[type]; if (!afford(me, b.cost)) return false; const w = workers.find((x) => x.order?.type === 'gather') || workers[0]; if (!w) return false; const spot = aiSpot(hq, type); if (!spot) return false; order(w, { type: 'build', what: type, tx: spot[0], ty: spot[1] }); return true; };
    const building = (type) => mine.some((e) => e.type === 'worker' && e.order?.type === 'build' && e.order.what === type) || bs(type).some((b) => !b.done);
    if (supplyCap(me) - supply(me) < 4 && !building('house') && supplyCap(me) < 60) want('house');
    else if (bs('barracks').length < (t > 300 ? 2 : 1) && t > 40 / mul && !building('barracks')) want('barracks');
    else if (bs('tower').length < (t > 240 ? 2 : 1) && t > 150 && !building('tower')) want('tower');
    // army
    for (const b of bs('barracks')) if (b.done && b.queue.length < 2) { const type = Math.random() < 0.55 ? 'fighter' : 'slinger'; if (afford(me, UNIT[type].cost) && supply(me) < supplyCap(me)) { pay(me, UNIT[type].cost); b.queue.push(type); } }
    // defend the base
    const threat = nearest(ents, hq.x, hq.y, (e) => e.team === 0 && e.unit && Math.hypot(e.x - hq.x, e.y - hq.y) < 420);
    if (threat) army.forEach((a) => { if (!a.order || a.order.type !== 'attack') order(a, { type: 'amove', x: threat.x, y: threat.y }); });
    // waves
    else if (t > AI.nextAttack / mul && army.length >= 4 + AI.wave * 2) {
      const target = nearest(ents, hq.x, hq.y, (e) => e.team === 0 && e.building);
      if (target) { moveGroup(army, target.x, target.y, 'amove'); AI.wave++; AI.nextAttack = t + 110 + Math.random() * 40; toast(L('적 공격대가 온다!', 'An enemy wave is coming!'), true); }
    }
  }
  function aiSpot(hq, type) {
    const B = BUILD[type];
    for (let tries = 0; tries < 60; tries++) {
      const r = 4 + Math.floor(tries / 8), a = rnd() * TAU, tx = Math.round(hq.tx + 1 + Math.cos(a) * r - B.w / 2), ty = Math.round(hq.ty + 1 + Math.sin(a) * r - B.h / 2);
      if (canPlace(type, tx, ty) && canPlace(type, tx - 1, ty) && canPlace(type, tx, ty - 1)) return [tx, ty];
    }
    return null;
  }

  /* ------------------------------------------------------------ economy */
  const afford = (team, cost) => Object.entries(cost).every(([k, v]) => res[team][k] >= v);
  const pay = (team, cost) => { for (const [k, v] of Object.entries(cost)) res[team][k] -= v; };
  const refund = (team, cost) => { for (const [k, v] of Object.entries(cost)) res[team][k] += v; };
  const costText = (cost) => Object.entries(cost).map(([k, v]) => `${k === 'ink' ? '◆' : '▤'}${v}`).join(' ');

  /* ------------------------------------------------------------ view */
  const cv = $('game'), c = cv.getContext('2d'), mini = $('minimap'), mc = mini.getContext('2d');
  let VW, VH, DPR, paperC, grainC, cam = { x: 0, y: 0, z: 1 }, shake = 0, parts = [], floats = [];
  let terrainC = null, terrainDirty = true;
  const fogC = document.createElement('canvas'); fogC.width = MW; fogC.height = MH; const fogX = fogC.getContext('2d');
  function resize() {
    DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight;
    cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR);
    grainC = INK.grain(Math.round(VW), Math.round(VH));
    cam.z = clamp(cam.z, minZoom(), 2);
  }
  const minZoom = () => Math.max(VW / (MW * TS), (VH - 150) / (MH * TS), 0.45);
  addEventListener('resize', resize); resize();

  function paintTerrain() {
    if (!terrainC) { terrainC = document.createElement('canvas'); terrainC.width = MW * TS; terrainC.height = MH * TS; paperC = INK.paper(MW * TS, MH * TS, 3); }
    const g = terrainC.getContext('2d');
    g.drawImage(paperC, 0, 0);
    g.globalAlpha = 0.5; g.fillStyle = '#BFD9A2'; g.fillRect(0, 0, MW * TS, MH * TS); g.globalAlpha = 1;
    for (const s of stains) INK.splat(g, s.x, s.y, s.r, s.col, s.id, 0.22);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const v = tiles[y * MW + x], px = x * TS, py = y * TS;
      boil(0, y * MW + x);
      if (v === 2) { g.fillStyle = '#8CC0DE'; g.fillRect(px, py, TS + 1, TS + 1); if ((x + y) % 3 === 0) INK.inkLine(g, [[px + 6, py + 16], [px + 14, py + 12], [px + 22, py + 16]], 1, rgba('#FFFFFF', 0.7)); }
      else if (v === 3) INK.blob(g, INK.lumpPts(px + 16, py + 17, 14, x * 7 + y, 9, 0.2, 0.8), { wash: '#B5AEA3', ink: PAL.ink, sw: 1.4, pool: [px + 11, py + 12, 8] });
    }
    // trees last so crowns overlap
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tiles[y * MW + x] === 1) {
      const px = x * TS, py = y * TS; boil(0, y * MW + x + 9999);
      INK.blob(g, INK.rectPts(px + 13, py + 18, 6, 12, 0.5), { wash: '#8C6A4A', ink: PAL.ink, sw: 1, smooth: false });
      INK.blob(g, INK.lumpPts(px + 16, py + 12, 15, x * 13 + y, 11, 0.16, 0.8), { wash: mix('#5E9C58', '#7FB069', hash(x * 3 + y)), ink: PAL.ink, sw: 1.5, pool: [px + 11, py + 7, 9], poolCol: '#D8F0C8' });
    }
    terrainDirty = false;
  }

  function drawBuilding(e) {
    const B = BUILD[e.type], x0 = e.tx * TS, y0 = e.ty * TS, w = B.w * TS, h = B.h * TS, col = TEAM_COL[e.team];
    boil(t, e.id);
    const k = e.done ? 1 : e.progress;
    c.save();
    if (!e.done) { c.globalAlpha = 0.45 + 0.4 * k; }
    if (e.type === 'hq') {
      INK.blob(c, INK.rectPts(x0 + 6, y0 + 26, w - 12, h - 30, 1), { wash: '#EFE3CC', ink: PAL.ink, sw: 2, smooth: false, pool: [x0 + 20, y0 + 36, 30] });
      INK.blob(c, [[x0 + 2, y0 + 30], [x0 + w / 2, y0 + 2], [x0 + w - 2, y0 + 30]], { wash: col, ink: PAL.ink, sw: 2, smooth: false });
      INK.blob(c, INK.rectPts(x0 + w / 2 - 10, y0 + h - 26, 20, 22, 0.5), { wash: '#8C6A4A', ink: PAL.ink, sw: 1.4, smooth: false });
      INK.blob(c, INK.rectPts(x0 + 14, y0 + 44, 14, 12, 0.4), { wash: '#8EC3E6', ink: PAL.ink, sw: 1.2, smooth: false }); INK.blob(c, INK.rectPts(x0 + w - 28, y0 + 44, 14, 12, 0.4), { wash: '#8EC3E6', ink: PAL.ink, sw: 1.2, smooth: false });
      INK.inkLine(c, [[x0 + w / 2, y0 + 2], [x0 + w / 2, y0 - 16]], 1.6); INK.blob(c, [[x0 + w / 2, y0 - 16], [x0 + w / 2 + 16, y0 - 11], [x0 + w / 2, y0 - 6]], { wash: col, ink: PAL.ink, sw: 1.2, smooth: false });
    } else if (e.type === 'barracks') {
      INK.blob(c, INK.rectPts(x0 + 4, y0 + 18, w - 8, h - 22, 1), { wash: '#D9C7A8', ink: PAL.ink, sw: 2, smooth: false });
      INK.blob(c, INK.rectPts(x0, y0 + 10, w, 14, 1), { wash: col, ink: PAL.ink, sw: 2, smooth: false });
      INK.blob(c, INK.rectPts(x0 + w / 2 - 14, y0 + h - 30, 28, 26, 0.5), { wash: '#6E5A4A', ink: PAL.ink, sw: 1.4, smooth: false });
      for (const sx of [x0 + 16, x0 + w - 16]) { INK.inkLine(c, [[sx - 6, y0 + 40], [sx + 6, y0 + 52]], 2.2, '#8C6A4A'); INK.inkLine(c, [[sx + 6, y0 + 40], [sx - 6, y0 + 52]], 2.2, '#8C6A4A'); }
    } else if (e.type === 'house') {
      INK.blob(c, INK.rectPts(x0 + 6, y0 + 22, w - 12, h - 26, 1), { wash: '#F0E4CF', ink: PAL.ink, sw: 1.8, smooth: false });
      INK.blob(c, [[x0 + 2, y0 + 26], [x0 + w / 2, y0 + 4], [x0 + w - 2, y0 + 26]], { wash: col, ink: PAL.ink, sw: 1.8, smooth: false });
      INK.blob(c, INK.rectPts(x0 + w / 2 - 6, y0 + h - 18, 12, 14, 0.4), { wash: '#8C6A4A', ink: PAL.ink, sw: 1.2, smooth: false });
    } else if (e.type === 'tower') {
      INK.blob(c, INK.rectPts(x0 + 14, y0 + 8, w - 28, h - 12, 1), { wash: '#C9BBA6', ink: PAL.ink, sw: 1.8, smooth: false });
      INK.blob(c, INK.rectPts(x0 + 8, y0 - 6, w - 16, 18, 1), { wash: col, ink: PAL.ink, sw: 1.8, smooth: false });
      for (let i = 0; i < 3; i++) INK.blob(c, INK.rectPts(x0 + 10 + i * 14, y0 - 14, 8, 10, 0.4), { wash: col, ink: PAL.ink, sw: 1.2, smooth: false });
    }
    c.restore();
    if (!e.done) { c.fillStyle = rgba(PAL.ink, 0.4); c.fillRect(x0 + 4, y0 + h + 2, w - 8, 5); c.fillStyle = PAL.sap; c.fillRect(x0 + 4, y0 + h + 2, (w - 8) * e.progress, 5); }
  }
  function drawWell(e) {
    boil(t, e.id);
    INK.blob(c, INK.ellPts(e.x, e.y + 6, 28, 18, 16, 1), { wash: '#6E6272', ink: PAL.ink, sw: 1.8 });
    INK.blob(c, INK.ellPts(e.x, e.y + 3, 20, 11, 14, 0.8), { wash: PAL.indigo, ink: PAL.ink, sw: 1.2, pool: [e.x - 6, e.y - 1, 10], poolCol: '#9FB3F0' });
    const k = e.amount / 1500; c.fillStyle = rgba(PAL.cream, 0.8); c.fillRect(e.x - 16, e.y + 26, 32, 3); c.fillStyle = PAL.indigo; c.fillRect(e.x - 16, e.y + 26, 32 * k, 3);
  }
  function drawUnit(e) {
    const key = `${e.type}${e.team}`, attacking = t - (e.attackT || -9) < 0.25;
    const k = attacking ? key + '-atk' : e.moving ? key + '-walk' : key;
    ClawdSprites.draw(c, ClawdSprites.has(k) ? k : key, e.x, e.y + 8, 22, e.moving ? e.walkD : t + e.id * 0.37, { flip: e.face < 0 });
    if (e.carry) { boil(t, 1); if (e.carry.kind === 'ink') INK.blob(c, [[e.x, e.y - 30], [e.x + 4, e.y - 24], [e.x, e.y - 21], [e.x - 4, e.y - 24]], { wash: PAL.indigo, ink: PAL.ink, sw: 1 }); else INK.blob(c, INK.rectPts(e.x - 5, e.y - 30, 10, 8, 0.3), { wash: '#F3E8D2', ink: PAL.ink, sw: 1, smooth: false }); }
  }
  function drawHP(e) {
    if (e.hp >= e.max && !sel.has(e.id)) return;
    const w = e.building ? BUILD[e.type].w * TS - 12 : 22, x = e.x - w / 2, y = e.building ? e.ty * TS - 10 : e.y - 34;
    c.fillStyle = rgba(PAL.ink, 0.45); c.fillRect(x, y, w, 4);
    const k = clamp(e.hp / e.max); c.fillStyle = k > 0.5 ? PAL.sap : k > 0.25 ? PAL.ochre : PAL.red; c.fillRect(x, y, w * k, 4);
  }

  function render() {
    if (terrainDirty) paintTerrain();
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#E9E3D2'; c.fillRect(0, 0, cv.width, cv.height);
    const z = cam.z * DPR, sh = shake * 6;
    c.setTransform(z, 0, 0, z, (-cam.x * cam.z + (Math.random() - 0.5) * sh) * DPR, (-cam.y * cam.z + (Math.random() - 0.5) * sh) * DPR);
    c.drawImage(terrainC, 0, 0);
    // selection circles under things
    for (const id of sel) { const e = byId.get(id); if (!e || e.dead) continue; c.save(); c.strokeStyle = e.team === 0 ? PAL.sap : PAL.red; c.lineWidth = 2; c.beginPath(); c.ellipse(e.x, e.y + (e.building ? 0 : 6), e.building ? e.r + 6 : 13, e.building ? e.r * 0.8 : 7, 0, 0, TAU); c.stroke(); c.restore(); }
    const visible = (e) => { const tx = Math.floor(e.x / TS), ty = Math.floor(e.y / TS); return e.team === 0 || vis[ty * MW + tx] || (e.building && seen[ty * MW + tx]) || (e.well && seen[ty * MW + tx]); };
    const draw = ents.filter((e) => !e.dead && visible(e)).sort((a, b) => a.y - b.y);
    for (const e of draw) { if (e.building) drawBuilding(e); else if (e.well) drawWell(e); else drawUnit(e); }
    for (const e of draw) if (e.unit || e.building) drawHP(e);
    // projectiles & fx
    for (const f of fx) {
      if (f.type === 'shot') { c.fillStyle = f.big ? TEAM_COL[f.team] : PAL.ink; c.beginPath(); c.arc(f.x, f.y, f.big ? 5 : 3.5, 0, TAU); c.fill(); }
      if (f.type === 'ping') { const k = (t - f.t0) / 0.5; c.save(); c.globalAlpha = 1 - k; c.strokeStyle = f.col; c.lineWidth = 2.5; c.beginPath(); c.ellipse(f.x, f.y, 6 + k * 16, 3 + k * 8, 0, 0, TAU); c.stroke(); c.restore(); }
    }
    for (const p of parts) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    for (const f of floats) { const k = t - f.t0; INK.text(c, f.s, f.x, f.y - k * 20, 13, f.col, { alpha: 1 - k, shadow: false }); }
    // placement ghost
    if (placing) {
      const B = BUILD[placing], [tx, ty] = worldTile(mouse.x - B.w * TS / 2 + 16, mouse.y - B.h * TS / 2 + 16), ok = canPlace(placing, tx, ty) && seen[ty * MW + tx];
      c.save(); c.globalAlpha = 0.45; c.fillStyle = ok ? PAL.sap : PAL.red; c.fillRect(tx * TS, ty * TS, B.w * TS, B.h * TS); c.restore();
    }
    // fog: one pixel per tile, scaled up smoothly so the edge of sight is soft
    const fd = fogX.getImageData(0, 0, MW, MH);
    for (let k = 0; k < MW * MH; k++) { fd.data[k * 4] = 40; fd.data[k * 4 + 1] = 33; fd.data[k * 4 + 2] = 52; fd.data[k * 4 + 3] = vis[k] ? 0 : seen[k] ? 110 : 235; }
    fogX.putImageData(fd, 0, 0);
    c.save(); c.imageSmoothingEnabled = true; c.drawImage(fogC, -TS / 2, -TS / 2, (MW + 1) * TS, (MH + 1) * TS); c.restore();
    // box
    if (drag && drag.box) { c.setTransform(DPR, 0, 0, DPR, 0, 0); c.save(); c.strokeStyle = PAL.sap; c.lineWidth = 1.5; c.setLineDash([5, 4]); c.strokeRect(drag.sx, drag.sy, drag.cx - drag.sx, drag.cy - drag.sy); c.fillStyle = rgba(PAL.sap, 0.1); c.fillRect(drag.sx, drag.sy, drag.cx - drag.sx, drag.cy - drag.sy); c.restore(); }
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0, VW, VH); c.globalCompositeOperation = 'source-over';
    renderMinimap();
  }
  function renderMinimap() {
    const w = mini.width, h = mini.height, sx = w / (MW * TS), sy = h / (MH * TS);
    mc.drawImage(terrainC, 0, 0, w, h);
    mc.fillStyle = 'rgba(40,33,52,0.75)';
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!seen[y * MW + x]) mc.fillRect(x * TS * sx, y * TS * sy, TS * sx + 1, TS * sy + 1);
    for (const e of ents) { if (e.dead || e.well) continue; const tx = Math.floor(e.x / TS), ty = Math.floor(e.y / TS); if (e.team !== 0 && !vis[ty * MW + tx] && !(e.building && seen[ty * MW + tx])) continue; mc.fillStyle = TEAM_COL[e.team]; const s = e.building ? 5 : 2.5; mc.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s); }
    mc.strokeStyle = '#fff'; mc.lineWidth = 1.5; mc.strokeRect(cam.x * sx, cam.y * sy, VW / cam.z * sx, VH / cam.z * sy);
  }

  function updateFog() {
    vis.fill(0);
    for (const e of ents) {
      if (e.team !== 0 || e.dead) continue;
      const r = (e.unit ? UNIT[e.type].sight : BUILD[e.type].sight) / TS, cx = e.x / TS, cy = e.y / TS;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) { vis[y * MW + x] = 1; seen[y * MW + x] = 1; }
      }
    }
  }

  /* ------------------------------------------------------------ input */
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, inside: false };   // edge-scroll only once the mouse is really over the page
  addEventListener('mouseout', (e) => { if (!e.relatedTarget) mouse.inside = false; });
  let drag = null, placing = null, amoveArmed = false;
  const pointers = new Map();
  const worldAt = (sx, sy) => [sx / cam.z + cam.x, sy / cam.z + cam.y];
  const worldTile = (wx, wy) => [Math.floor(wx / TS), Math.floor(wy / TS)];
  function entAt(wx, wy) {
    let best = null, bd = 1e9;
    for (const e of ents) {
      if (e.dead) continue;
      const tx = Math.floor(e.x / TS), ty = Math.floor(e.y / TS); if (e.team === 1 && !vis[ty * MW + tx] && !e.building) continue;
      const r = e.building ? e.r : e.well ? e.r : 16, d = Math.hypot(e.x - wx, (e.y - (e.unit ? 6 : 0)) - wy);
      if (d < r && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  function command(wx, wy) {
    const units = [...sel].map((id) => byId.get(id)).filter((e) => e && !e.dead && e.team === 0 && e.unit);
    const bld = [...sel].map((id) => byId.get(id)).filter((e) => e && e.team === 0 && e.building);
    const tgt = entAt(wx, wy), [tx, ty] = worldTile(wx, wy);
    if (!units.length) { for (const b of bld) { b.rally = tgt?.well ? { well: tgt.id, x: tgt.x, y: tgt.y } : { x: wx, y: wy }; fx.push({ type: 'ping', x: wx, y: wy, t0: t, col: PAL.ochre }); } return; }
    if (tgt && tgt.team === 1) { units.forEach((u) => order(u, { type: 'attack', id: tgt.id })); fx.push({ type: 'ping', x: tgt.x, y: tgt.y, t0: t, col: PAL.red }); SFX.play('click'); return; }
    const workers = units.filter((u) => u.type === 'worker'), others = units.filter((u) => u.type !== 'worker');
    if (tgt?.well && workers.length) { workers.forEach((u) => order(u, { type: 'gather', well: tgt.id })); fx.push({ type: 'ping', x: tgt.x, y: tgt.y, t0: t, col: PAL.indigo }); if (others.length) moveGroup(others, wx, wy); SFX.play('click'); return; }
    if (T_(tx, ty) === 1 && workers.length) { workers.forEach((u) => order(u, { type: 'gather', tree: [tx, ty] })); fx.push({ type: 'ping', x: wx, y: wy, t0: t, col: '#8C6A4A' }); if (others.length) moveGroup(others, wx, wy); SFX.play('click'); return; }
    if (tgt && tgt.team === 0 && tgt.building && !tgt.done && workers.length) { workers.forEach((u) => order(u, { type: 'build', what: tgt.type, tx: tgt.tx, ty: tgt.ty, site: tgt.id })); return; }
    moveGroup(units, wx, wy, amoveArmed ? 'amove' : 'move'); amoveArmed = false;
  }
  function selectAt(wx, wy, add) {
    const e = entAt(wx, wy);
    if (!add) sel.clear();
    if (e && !e.well) { if (add && sel.has(e.id)) sel.delete(e.id); else sel.add(e.id); if (e.team === 0) SFX.play('click'); }
    panel();
  }
  function selectBox(x0, y0, x1, y1, add) {
    const [ax, ay] = worldAt(Math.min(x0, x1), Math.min(y0, y1)), [bx, by] = worldAt(Math.max(x0, x1), Math.max(y0, y1));
    const inBox = ents.filter((e) => !e.dead && e.team === 0 && e.unit && e.x >= ax && e.x <= bx && e.y >= ay && e.y <= by);
    if (!add) sel.clear();
    // prefer army over workers when both are boxed
    const army = inBox.filter((e) => e.type !== 'worker');
    for (const e of (army.length ? army : inBox)) sel.add(e.id);
    if (inBox.length) SFX.play('click');
    panel();
  }

  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => {
    if (mode !== 'play') return;
    SFX.unlock(); cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { drag = { pan: true, last: midpoint(), dist: pinchDist() }; return; }
    const [wx, wy] = worldAt(e.clientX, e.clientY);
    if (placing) {
      if (e.button === 2) { placing = null; return; }
      const B = BUILD[placing], [tx, ty] = worldTile(wx - B.w * TS / 2 + 16, wy - B.h * TS / 2 + 16);
      const w = [...sel].map((id) => byId.get(id)).find((u) => u && u.type === 'worker');
      if (w && canPlace(placing, tx, ty) && seen[ty * MW + tx]) { if (!afford(0, B.cost)) toast(L('자원이 부족해요', 'Not enough resources')); else { order(w, { type: 'build', what: placing, tx, ty }); SFX.play('card'); } if (!e.shiftKey) placing = null; }
      else toast(L('여기엔 지을 수 없어요', "Can't build there"));
      return;
    }
    if (e.button === 2) { command(wx, wy); return; }
    if (amoveArmed) { command(wx, wy); return; }
    drag = { sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, box: false, touch: e.pointerType === 'touch', add: e.shiftKey, t0: performance.now() };
  });
  cv.addEventListener('pointermove', (e) => {
    mouse.sx = e.clientX; mouse.sy = e.clientY; [mouse.x, mouse.y] = worldAt(e.clientX, e.clientY); if (e.pointerType === 'mouse') mouse.inside = true;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag?.pan && pointers.size === 2) {
      const m = midpoint(), d = pinchDist();
      cam.x -= (m.x - drag.last.x) / cam.z; cam.y -= (m.y - drag.last.y) / cam.z;
      const nz = clamp(cam.z * d / drag.dist, minZoom(), 2); zoomAround(m.x, m.y, nz);
      drag.last = m; drag.dist = d; return;
    }
    if (drag && !drag.pan) { drag.cx = e.clientX; drag.cy = e.clientY; if (Math.hypot(drag.cx - drag.sx, drag.cy - drag.sy) > 8) drag.box = true; }
  });
  const pointerEnd = (e) => {
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.pan) { if (pointers.size === 0) drag = null; return; }
    if (drag.box) selectBox(drag.sx, drag.sy, drag.cx, drag.cy, drag.add);
    else {
      const [wx, wy] = worldAt(drag.sx, drag.sy), e2 = entAt(wx, wy);
      // on touch a tap on the ground (or an enemy / resource) with units selected is a command
      const haveUnits = [...sel].some((id) => byId.get(id)?.team === 0);
      if (drag.touch && haveUnits && (!e2 || e2.team !== 0)) command(wx, wy); else selectAt(wx, wy, drag.add);
    }
    drag = null;
  };
  cv.addEventListener('pointerup', pointerEnd); cv.addEventListener('pointercancel', pointerEnd);
  const midpoint = () => { const p = [...pointers.values()]; return { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 }; };
  const pinchDist = () => { const p = [...pointers.values()]; return Math.max(20, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)); };
  function zoomAround(sx, sy, nz) { const [wx, wy] = worldAt(sx, sy); cam.z = nz; cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; }
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomAround(e.clientX, e.clientY, clamp(cam.z * Math.exp(-e.deltaY * 0.0015), minZoom(), 2)); }, { passive: false });
  mini.addEventListener('pointerdown', (e) => { const r = mini.getBoundingClientRect(); const wx = (e.clientX - r.left) / r.width * MW * TS, wy = (e.clientY - r.top) / r.height * MH * TS; if (e.button === 2 || (sel.size && e.pointerType === 'touch' && e.detail > 1)) command(wx, wy); else { cam.x = wx - VW / cam.z / 2; cam.y = wy - VH / cam.z / 2; } });
  mini.addEventListener('contextmenu', (e) => e.preventDefault());
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (mode !== 'play' && mode !== 'paused') return;
    keys.add(e.code);
    if (e.code === 'Escape') { if (placing) placing = null; else if (amoveArmed) amoveArmed = false; else togglePause(); }
    if (mode !== 'play') return;
    if (e.code === 'KeyA' && !e.ctrlKey && [...sel].some((id) => byId.get(id)?.unit)) { amoveArmed = true; toast(L('공격 이동: 목표를 클릭', 'Attack-move: click a target')); }
    if (e.code === 'KeyS') { for (const id of sel) { const u = byId.get(id); if (u?.unit && u.team === 0) order(u, null); } }
    const btn = document.querySelector(`#commands [data-key="${e.key.toLowerCase()}"]`); if (btn && !['KeyA', 'KeyS'].includes(e.code)) btn.click();
    if (e.code === 'KeyH') { const hq = ents.find((x) => x.team === 0 && x.type === 'hq' && !x.dead); if (hq) { cam.x = hq.x - VW / cam.z / 2; cam.y = hq.y - VH / cam.z / 2; } }
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  /* ------------------------------------------------------------ panel */
  function panel() {
    const items = [...sel].map((id) => byId.get(id)).filter((e) => e && !e.dead);
    const info = $('sel-info'), cmds = $('commands');
    cmds.innerHTML = '';
    if (!items.length) { info.innerHTML = `<b>${L('선택 없음', 'Nothing selected')}</b><span>${L('드래그로 유닛 선택', 'Drag to select units')}</span>`; addCmd(L('군대 전체', 'All army'), 'f', () => { sel.clear(); ents.filter((e) => e.team === 0 && e.unit && e.type !== 'worker' && !e.dead).forEach((e) => sel.add(e.id)); panel(); }); return; }
    const first = items[0];
    if (items.length === 1) info.innerHTML = `<b>${first.building ? BUILD[first.type].name : UNIT[first.type].name}${first.team === 1 ? ' ' + L('(적)', '(enemy)') : ''}</b><span>${Math.ceil(first.hp)} / ${first.max}${first.building && !first.done ? ' · ' + Math.round(first.progress * 100) + '%' : ''}${first.queue?.length ? ' · ' + L('훈련', 'training') + ' ' + first.queue.length : ''}</span>`;
    else { const counts = {}; items.forEach((e) => { const n = e.unit ? UNIT[e.type].name : BUILD[e.type].name; counts[n] = (counts[n] || 0) + 1; }); info.innerHTML = `<b>${items.length} ${L('선택', 'selected')}</b><span>${Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(' · ')}</span>`; }
    if (first.team !== 0) return;
    if (items.some((e) => e.type === 'worker')) {
      for (const type of ['house', 'barracks', 'tower']) addCmd(`${BUILD[type].name}<small>${costText(BUILD[type].cost)}</small>`, BUILD[type].key, () => { placing = type; toast(L('지을 곳을 클릭 (Esc 취소)', 'Click where to build (Esc cancels)')); }, !afford(0, BUILD[type].cost));
      if (BUILD.hq) addCmd(`${BUILD.hq.name}<small>${costText(BUILD.hq.cost)}</small>`, 'r', () => { placing = 'hq'; }, !afford(0, BUILD.hq.cost));
    }
    if (first.building && first.done && BUILD[first.type].trains) {
      for (const type of BUILD[first.type].trains) addCmd(`${UNIT[type].name}<small>${costText(UNIT[type].cost)}</small>`, UNIT[type].key, () => train(first, type), !afford(0, UNIT[type].cost));
    }
    if (items.some((e) => e.unit)) { addCmd(L('공격 이동', 'Attack-move') + '<small>A</small>', 'a', () => { amoveArmed = true; toast(L('목표를 탭/클릭', 'Tap / click a target')); }); addCmd(L('정지', 'Stop') + '<small>S</small>', 's', () => items.forEach((u) => u.unit && order(u, null))); }
  }
  function addCmd(html, key, fn, disabled) {
    const b = document.createElement('button'); b.innerHTML = html + (key ? `<kbd>${key.toUpperCase()}</kbd>` : ''); b.dataset.key = key || ''; b.disabled = !!disabled;
    b.onclick = (e) => { e.stopPropagation(); SFX.play('click'); fn(); panel(); };
    $('commands').append(b);
  }
  function train(b, type) {
    const U = UNIT[type];
    if (!afford(0, U.cost)) { toast(L('자원이 부족해요', 'Not enough resources')); return; }
    if (b.queue.length >= 5) return;
    if (supply(0) >= supplyCap(0)) { toast(L('인구가 가득 찼어요 — 집을 지으세요', 'Supply blocked — build a house')); return; }
    pay(0, U.cost); b.queue.push(type);
  }
  let toastT = 0;
  function toast(s, alarm) { const el = $('toast'); el.textContent = s; el.classList.add('show'); el.classList.toggle('alarm', !!alarm); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); if (alarm) SFX.play('hurt'); }
  let lastAlarm = -99;
  function underAttack(e) { if (t - lastAlarm > 12) { lastAlarm = t; toast(L('공격받고 있어요!', 'We are under attack!'), true); } }
  function floatText(s, x, y, col) { floats.push({ s, x, y, t0: t, col }); }
  const part = (x, y, col) => { const a = Math.random() * TAU, v = 60 + Math.random() * 140; return { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 4, col, age: 0, life: 0.5 + Math.random() * 0.4 }; };

  function hud() {
    $('res-ink').textContent = Math.floor(res[0].ink); $('res-paper').textContent = Math.floor(res[0].paper);
    const s = supply(0), cap = supplyCap(0); $('res-supply').textContent = `${s}/${cap}`; $('res-supply').parentElement.classList.toggle('full', s >= cap);
    const m = Math.floor(t / 60), sec = Math.floor(t % 60); $('clock').textContent = `${m}:${String(sec).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------ loop */
  let last = performance.now(), aiTimer = 0, fogTimer = 0, panelTimer = 0;
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000); last = now;
    // tests can fast-forward the simulation (window.__wars.speed) in fixed sub-steps
    for (let step = 0; step < SPEED.n; step++) { const dt = realDt; tick(dt); }
    if (mode === 'play' || mode === 'paused' || mode === 'over') render();
    for (const tc of document.querySelectorAll('.clawd-portrait')) { if (!tc.offsetParent) continue; const g = tc.getContext('2d'); g.clearRect(0, 0, tc.width, tc.height); ClawdSprites.draw(g, portrait, tc.width / 2, tc.height * 0.93, tc.width * 0.42, performance.now() / 1000); }
    requestAnimationFrame(frame);
  }
  const SPEED = { n: 1 };
  function tick(dt) {
    if (mode === 'play') {
      t += dt;
      // camera pan: keys and screen edges (desktop only)
      const pan = 700 * dt / cam.z;
      if (keys.has('ArrowLeft')) cam.x -= pan; if (keys.has('ArrowRight')) cam.x += pan; if (keys.has('ArrowUp')) cam.y -= pan; if (keys.has('ArrowDown')) cam.y += pan;
      if (mouse.inside && !drag && document.hasFocus()) { const m = 12; if (mouse.sx < m) cam.x -= pan; if (mouse.sx > VW - m) cam.x += pan; if (mouse.sy < m) cam.y -= pan; if (mouse.sy > VH - m && mouse.sy < VH) cam.y += pan; }
      cam.x = clamp(cam.x, -40, MW * TS - VW / cam.z + 40); cam.y = clamp(cam.y, -40, MH * TS - VH / cam.z + 160 / cam.z);
      for (const e of ents) { if (e.dead) continue; if (e.unit) updateUnit(e, dt); else if (e.building) updateBuilding(e, dt); }
      separate(dt);
      for (const f of fx) {
        if (f.type === 'shot') { const tg = byId.get(f.id); if (!tg || tg.dead) { f.done = true; continue; } const dx = tg.x - f.x, dy = tg.y - 8 - f.y, d = Math.hypot(dx, dy); if (d < 8) { damage(tg, f.dmg, null); f.done = true; } else { f.x += dx / d * f.sp * dt; f.y += dy / d * f.sp * dt; } }
        if (f.type === 'ping' && t - f.t0 > 0.5) f.done = true;
      }
      fx = fx.filter((f) => !f.done);
      for (const p of parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
      parts = parts.filter((p) => p.age < p.life); floats = floats.filter((f) => t - f.t0 < 1);
      if (ents.length > 400) ents = ents.filter((e) => !e.dead);
      aiTimer -= dt; if (aiTimer <= 0) { aiTimer = 1; aiThink(); }
      fogTimer -= dt; if (fogTimer <= 0) { fogTimer = 0.2; updateFog(); }
      panelTimer -= dt; if (panelTimer <= 0) { panelTimer = 0.4; panel(); hud(); }
      shake = Math.max(0, shake - dt * 2);
      if (Math.random() < dt * 0.2) ents = ents.filter((e) => !e.dead || sel.has(e.id));
    }
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------ flow */
  let portrait = 'title';
  function show(id) { for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id; document.body.classList.toggle('menu', !!id); }
  function newGame() {
    ents = []; byId.clear(); sel.clear(); fx = []; stains = []; parts = []; floats = []; t = 0; nextId = 1; placing = null;
    res[0] = { ink: 250, paper: 120 }; res[1] = { ink: 250, paper: 120 };
    Object.assign(AI, { wave: 0, nextAttack: difficulty === 'easy' ? 240 : difficulty === 'hard' ? 150 : 190 });
    seen.fill(0); vis.fill(0);
    genMap(1 + Math.floor(Math.random() * 1e6));
    terrainC = null; terrainDirty = true;
    const bases = [[6, MH - 11], [MW - 9, 8]];
    bases.forEach(([bx, by], team) => {
      addBuilding(team, 'hq', bx, by, true);
      const wells = team === 0 ? [[bx + 6, by - 1], [bx - 1, by - 5]] : [[bx - 5, by + 2], [bx + 1, by + 6]];
      for (const [wx, wy] of wells) { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) tiles[(wy + y) * MW + wx + x] = 0; addWell(wx, wy); }
      for (let i = 0; i < 4; i++) { const u = addUnit(team, 'worker', (bx + 1.5) * TS + jit(30), (by + 4) * TS + (team ? -5 * TS : 0) + jit(10)); const w = nearest(ents, u.x, u.y, (e) => e.well); if (w) order(u, { type: 'gather', well: w.id }); }
    });
    for (const [wx, wy] of [[MW / 2 - 9, MH / 2 - 1], [MW / 2 + 7, MH / 2 - 1]]) { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) tiles[(wy + y) * MW + wx + x] = 0; addWell(wx, wy); }
    const hq = ents.find((e) => e.team === 0 && e.type === 'hq');
    cam.z = clamp(1, minZoom(), 2); cam.x = hq.x - VW / cam.z / 2; cam.y = hq.y - VH / cam.z / 2 - 60;
    updateFog(); mode = 'play'; show(null); panel(); hud(); SFX.music(true); SFX.play('wave');
    toast(L('일꾼으로 잉크를 모으고, 집·병영을 지어 군대를 키우세요', 'Gather ink with workers, build houses and barracks, raise an army'));
  }
  function checkEnd() {
    if (mode !== 'play') return;
    const alive = (team) => ents.some((e) => e.team === team && e.building && !e.dead);
    if (!alive(1)) end(true); else if (!alive(0)) end(false);
  }
  function end(won) {
    mode = 'over'; SFX.music(false); SFX.play(won ? 'win' : 'lose'); portrait = won ? 'win' : 'ko';
    $('msg-title').textContent = won ? L('승리!', 'Victory!') : L('패배…', 'Defeat…');
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    $('msg-text').textContent = (won ? L('얼룩 클로들의 본부를 무너뜨렸어요.', 'The Smudge Clawds are no more.') : L('본부가 잉크에 잠겼어요.', 'Your base sank in ink.')) + ` (${m}:${String(s).padStart(2, '0')})`;
    const row = $('msg-buttons'); row.innerHTML = '';
    const b = document.createElement('button'); b.className = 'big'; b.textContent = L('다시 하기', 'Play again'); b.onclick = () => { SFX.play('card'); titleScreen(); }; row.append(b);
    show('msg');
  }
  function titleScreen() {
    mode = 'title'; portrait = 'title'; show('title');
    const box = $('diff'); box.innerHTML = '';
    for (const [k, ko, en] of [['easy', '쉬움', 'Easy'], ['normal', '보통', 'Normal'], ['hard', '어려움', 'Hard']]) {
      const b = document.createElement('button'); b.innerHTML = `<b>${L(ko, en)}</b>`; b.onclick = () => { difficulty = k; SFX.unlock(); SFX.play('card'); newGame(); }; box.append(b);
    }
  }
  function togglePause() { if (mode === 'play') { mode = 'paused'; toast(L('일시 정지 (Esc)', 'Paused (Esc)')); } else if (mode === 'paused') mode = 'play'; }
  $('btn-pause').addEventListener('click', togglePause);

  async function boot() {
    show('loading'); $('load-text').textContent = L('클로 군대를 그리는 중…', 'Painting the Clawd army…');
    const walk = (tt, f) => ({ view: 'q', walk: f / 6, dy: -Math.abs(Math.sin(f / 6 * TAU)) * 0.4, aL: 0.4 * Math.sin(f / 6 * TAU), aR: -0.4 * Math.sin(f / 6 * TAU), emote: null });
    const specs = [];
    const look = { worker: { hat: 'hard' }, fighter: { hat: 'band' }, slinger: { hat: 'beanie' } };
    for (const team of [0, 1]) for (const type of ['worker', 'fighter', 'slinger']) {
      const over = { ...look[type], ...(team ? { col: '#8A6BC4', dk: '#5A3F8A', lt: '#C4B0E8', hat: type === 'worker' ? 'hard' : 'masq' } : {}) };
      specs.push(
        { key: `${type}${team}`, emotion: team ? 'mischief' : 'neutral', frames: 3, over: { ...over, view: 'q', emote: null } },
        { key: `${type}${team}-walk`, emotion: team ? 'mischief' : 'determined', frames: 6, pose: walk, over: { ...over, emote: null } },
        { key: `${type}${team}-atk`, emotion: 'angry', frames: 2, over: { ...over, view: 'q', aR: 1.4, aL: 0.2, emote: null } },
      );
    }
    specs.push({ key: 'title', emotion: 'determined', frames: 6, over: { hat: 'crown' } }, { key: 'win', emotion: 'starstruck', frames: 6, over: { hat: 'crown' } }, { key: 'ko', emotion: 'cry', frames: 4 });
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; }, 'lite');
    titleScreen();
  }
  boot();
  window.__wars = { set speed(n) { SPEED.n = n; }, get ents() { return ents; }, res, get mode() { return mode; }, get t() { return t; }, newGame, AI, sel, command, selectBox, cam };
})();
