// Ink Lane — a one-lane 3v3 battle arena. Pick a Clawd hero, push with the minion waves, take the towers and
// break the enemy core. Allies and enemies are AI heroes.
//
//   desktop: right-click move / attack · Q W E R skills aimed at the cursor · A attack-move · S stop · Space centre camera
//   touch:   joystick to move · ⚔ attacks the nearest enemy · skill buttons auto-aim at the nearest enemy hero

(() => {
  const { PAL, TAU, clamp, lerp, backOut, mix, rgba, boil, jit, hash } = INK;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
  const L = (ko, en) => (KO ? ko : en);

  /* --------------------------------------------------------------- map */
  const MAPW = 3600, MAPH = 1000, LANE = 520;
  const TEAMS = [{ col: PAL.clay, name: L('주황 팀', 'Orange') }, { col: '#8A6BC4', name: L('보라 팀', 'Violet') }];
  const FOUNT = [180, MAPW - 180], CORE = [330, MAPW - 330], TOWERS = [[1500, 920], [MAPW - 1500, MAPW - 920]];

  /* --------------------------------------------------------------- heroes */
  const HERO = {
    mage: { name: L('잉크 마법사', 'Ink Mage'), hat: 'wizard', hp: 520, mp: 400, dmg: 42, range: 430, sp: 190, as: 1.2, ranged: true,
      skills: [
        { k: 'Q', name: L('잉크 화살', 'Ink bolt'), cd: 4, mp: 50, desc: L('직선으로 날아가는 잉크', 'A bolt of ink in a line') },
        { k: 'W', name: L('웅덩이', 'Puddle'), cd: 9, mp: 70, desc: L('느려지는 잉크 웅덩이', 'A slowing puddle') },
        { k: 'E', name: L('점멸', 'Blink'), cd: 12, mp: 60, desc: L('짧은 순간이동', 'A short teleport') },
        { k: 'R', name: L('잉크 운석', 'Ink meteor'), cd: 45, mp: 120, desc: L('큰 범위 폭발', 'A huge splash'), ult: true },
      ] },
    knight: { name: L('연필 기사', 'Pencil Knight'), hat: 'band', hp: 760, mp: 260, dmg: 58, range: 70, sp: 205, as: 1.0,
      skills: [
        { k: 'Q', name: L('찌르기', 'Lunge'), cd: 5, mp: 30, desc: L('앞으로 돌진해 찌른다', 'Dash and stab') },
        { k: 'W', name: L('방패', 'Guard'), cd: 12, mp: 40, desc: L('보호막', 'A shield') },
        { k: 'E', name: L('회전 베기', 'Spin'), cd: 7, mp: 40, desc: L('주변 적을 벤다', 'Hit everything around') },
        { k: 'R', name: L('돌격', 'Charge'), cd: 50, mp: 80, desc: L('길게 돌진해 기절시킨다', 'A long stunning charge'), ult: true },
      ] },
    archer: { name: L('궁수', 'Archer'), hat: 'beanie', hp: 560, mp: 320, dmg: 52, range: 470, sp: 200, as: 0.95, ranged: true,
      skills: [
        { k: 'Q', name: L('부채 사격', 'Volley'), cd: 6, mp: 45, desc: L('부채꼴로 다섯 발', 'Five arrows in a fan') },
        { k: 'W', name: L('덫', 'Trap'), cd: 12, mp: 50, desc: L('밟으면 기절', 'Stuns whoever steps on it') },
        { k: 'E', name: L('구르기', 'Roll'), cd: 8, mp: 30, desc: L('빠르게 굴러 피한다', 'Roll out of trouble') },
        { k: 'R', name: L('화살 비', 'Arrow rain'), cd: 55, mp: 110, desc: L('넓은 곳에 화살비', 'Rain arrows on an area'), ult: true },
      ] },
  };
  const ORDER = ['mage', 'knight', 'archer'];

  /* --------------------------------------------------------------- state */
  let ents = [], fx = [], areas = [], parts = [], floats = [], t = 0, mode = 'loading', nextId = 1, waveT = 3, me = null, winner = -1;
  const byId = new Map();
  const add = (e) => { e.id = nextId++; ents.push(e); byId.set(e.id, e); return e; };
  const lvlMul = (e) => 1 + (e.level - 1) * 0.09;

  function makeHero(type, team, ai) {
    const H = HERO[type];
    return add({ kind: 'hero', type, team, ai, x: FOUNT[team] + (team ? -40 : 40), y: LANE + jit(60), r: 18, hp: H.hp, max: H.hp, mp: H.mp, maxmp: H.mp, level: 1, xp: 0, cds: [0, 0, 0, 0], acd: 0, dead: false, respawn: 0,
      target: null, dest: null, face: team ? -1 : 1, walkD: 0, slow: 0, stun: 0, shield: 0, dash: null, aiState: 'lane', kills: 0, deaths: 0, hitT: -9, attackT: -9 });
  }
  function makeMinion(team, ranged, i) {
    const x = CORE[team] + (team ? -70 : 70), y = LANE + (i - 2) * 22;
    // minions grow a little every minute (and more once a team has lost a tower) so matches keep moving
    const g = 1 + t / 420 + ents.filter((o) => o.kind === 'tower' && o.team !== team && o.dead).length * 0.15;
    return add({ kind: 'minion', team, ranged, x, y, r: 12, hp: (ranged ? 260 : 380) * g, max: (ranged ? 260 : 380) * g, dmg: (ranged ? 22 : 16) * g, range: ranged ? 300 : 44, sp: 110, as: ranged ? 1.4 : 1.1, acd: 0, face: team ? -1 : 1, walkD: 0, slow: 0, stun: 0, hitT: -9, attackT: -9 });
  }
  function makeTower(team, x, order) { return add({ kind: 'tower', team, x, y: LANE - 20, r: 36, hp: 2200, max: 2200, dmg: 110, range: 330, as: 1.1, acd: 0, order, hitT: -9 }); }
  function makeCore(team) { return add({ kind: 'core', team, x: CORE[team], y: LANE, r: 56, hp: 3500, max: 3500, hitT: -9 }); }

  /* --------------------------------------------------------------- helpers */
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const alive = (e) => e && !e.dead && e.hp > 0;
  const foesOf = (e) => ents.filter((o) => alive(o) && o.team === 1 - e.team && o.kind !== 'area');
  function vulnerable(e) {
    if (e.kind === 'tower') return !ents.some((o) => o.kind === 'tower' && o.team === e.team && alive(o) && o.order < e.order);
    if (e.kind === 'core') return !ents.some((o) => o.kind === 'tower' && o.team === e.team && alive(o));
    return true;
  }
  function nearestFoe(e, range, f = () => true) { let b = null, bd = range; for (const o of foesOf(e)) { if (!f(o) || !vulnerable(o)) continue; const d = dist(e, o) - o.r; if (d < bd) { bd = d; b = o; } } return b; }

  function damage(target, amount, src, type = 'hit') {
    if (!alive(target) || !vulnerable(target)) return;
    if (target.shield > 0) { const s = Math.min(target.shield, amount); target.shield -= s; amount -= s; }
    target.hp -= amount; target.hitT = t;
    if (src && src.kind === 'hero' && target.kind === 'hero') { src.aggroT = t; }
    if (amount > 0 && (target.kind === 'hero' || src === me || target === me)) floats.push({ s: Math.round(amount), x: target.x + jit(10), y: target.y - 40, t0: t, col: target === me ? PAL.red : type === 'skill' ? PAL.ochre : PAL.cream });
    if (target.hp <= 0) die(target, src);
  }
  function die(e, killer) {
    if (e.kind === 'hero') {
      e.dead = true; e.deaths++; e.respawn = 6 + e.level * 2; e.hp = 0;
      if (killer?.kind === 'hero') { killer.kills++; giveXP(killer, 200 + e.level * 30); feed(`${TEAMS[killer.team].name} ${HERO[killer.type].name} ⚔ ${HERO[e.type].name}`); }
      if (e === me) { shake = 0.8; SFX.play('lose'); }
      else SFX.play('hurt');
      burst(e.x, e.y, TEAMS[e.team].col, 18);
      return;
    }
    e.dead = true; burst(e.x, e.y, e.kind === 'minion' ? TEAMS[e.team].col : '#C9B79B', e.kind === 'minion' ? 8 : 30);
    if (e.kind === 'minion') { for (const h of ents) if (h.kind === 'hero' && alive(h) && h.team !== e.team && dist(h, e) < 700) giveXP(h, 34); SFX.play('splat'); }
    if (e.kind === 'tower') { SFX.play('boom'); shake = 0.7; feed(`${TEAMS[1 - e.team].name}: ${L('탑 파괴!', 'tower down!')}`); for (const h of ents) if (h.kind === 'hero' && h.team !== e.team) giveXP(h, 120); }
    if (e.kind === 'core') { winner = 1 - e.team; SFX.play('boom'); shake = 1.2; setTimeout(() => end(winner === 0), 1400); }
  }
  function giveXP(h, n) {
    if (h.level >= 10) return;
    h.xp += n;
    while (h.xp >= 100 + h.level * 60 && h.level < 10) {
      h.xp -= 100 + h.level * 60; h.level++;
      const H = HERO[h.type], m = lvlMul(h); const f = h.hp / h.max; h.max = Math.round(H.hp * m); h.hp = Math.round(h.max * f + H.hp * 0.1); h.maxmp = Math.round(H.mp * m); h.mp = Math.min(h.maxmp, h.mp + 60);
      if (h === me) { floats.push({ s: L('레벨 업!', 'Level up!'), x: h.x, y: h.y - 64, t0: t, col: PAL.ochre, big: true }); SFX.play('win'); if (h.level === 4) feed(L('궁극기 R 해제!', 'Ultimate R unlocked!')); }
    }
  }
  function burst(x, y, col, n) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 80 + Math.random() * 220; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 2 + Math.random() * 4, col, age: 0, life: 0.4 + Math.random() * 0.4 }); } }
  function feed(s) { const el = $('feed'); const d = document.createElement('div'); d.textContent = s; el.prepend(d); setTimeout(() => d.remove(), 5000); while (el.children.length > 4) el.lastChild.remove(); }

  /* --------------------------------------------------------------- skills */
  function aimAt(h, tx, ty, maxR) { const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy) || 1; const r = Math.min(d, maxR); return { x: h.x + dx / d * r, y: h.y + dy / d * r, ux: dx / d, uy: dy / d, d }; }
  function cast(h, i, tx, ty) {
    const H = HERO[h.type], S = H.skills[i];
    if (!alive(h) || h.stun > 0 || h.cds[i] > 0 || h.mp < S.mp || (S.ult && h.level < 4)) return false;
    h.cds[i] = S.cd; h.mp -= S.mp; h.attackT = t; h.face = tx < h.x ? -1 : 1;
    const m = lvlMul(h);
    if (h.type === 'mage') {
      if (i === 0) { const a = aimAt(h, tx, ty, 1); fx.push({ type: 'bolt', team: h.team, src: h.id, x: h.x, y: h.y - 16, vx: a.ux * 760, vy: a.uy * 760, life: 0.8, dmg: 90 * m, r: 14, col: PAL.indigo }); SFX.play('zap'); }
      if (i === 1) { const a = aimAt(h, tx, ty, 620); areas.push({ type: 'puddle', team: h.team, src: h.id, x: a.x, y: a.y, r: 110, t0: t, life: 2.6, dps: 45 * m, slow: 0.45 }); SFX.play('splat'); }
      if (i === 2) { const a = aimAt(h, tx, ty, 300); burst(h.x, h.y, PAL.violet, 10); h.x = a.x; h.y = clamp(a.y, 120, MAPH - 120); burst(h.x, h.y, PAL.violet, 10); SFX.play('vortex'); h.dest = null; }
      if (i === 3) { const a = aimAt(h, tx, ty, 800); areas.push({ type: 'meteor', team: h.team, src: h.id, x: a.x, y: a.y, r: 230, t0: t, life: 1.0, dmg: 320 * m }); SFX.play('vortex'); }
    }
    if (h.type === 'knight') {
      if (i === 0) { const a = aimAt(h, tx, ty, 290); h.dash = { x: a.x, y: a.y, sp: 1100, hit: new Set(), dmg: 85 * m, stun: 0, first: true }; SFX.play('slash'); }
      if (i === 1) { h.shield = 160 * m; h.shieldT = t; SFX.play('shield'); }
      if (i === 2) { for (const o of foesOf(h)) if (dist(o, h) < 170 + o.r) damage(o, 75 * m, h, 'skill'); fx.push({ type: 'ring', x: h.x, y: h.y, r: 170, t0: t, life: 0.3, col: '#fff' }); SFX.play('slash'); }
      if (i === 3) { const a = aimAt(h, tx, ty, 560); h.dash = { x: a.x, y: a.y, sp: 1300, hit: new Set(), dmg: 160 * m, stun: 1.1 }; SFX.play('boom'); }
    }
    if (h.type === 'archer') {
      if (i === 0) { const a = aimAt(h, tx, ty, 1); const base = Math.atan2(a.uy, a.ux); for (let k = -2; k <= 2; k++) { const an = base + k * 0.16; fx.push({ type: 'bolt', team: h.team, src: h.id, x: h.x, y: h.y - 14, vx: Math.cos(an) * 820, vy: Math.sin(an) * 820, life: 0.6, dmg: 55 * m, r: 8, col: '#8C6A4A', arrow: true }); } SFX.play('pew'); }
      if (i === 1) { const a = aimAt(h, tx, ty, 450); areas.push({ type: 'trap', team: h.team, src: h.id, x: a.x, y: a.y, r: 40, t0: t, life: 14, stun: 1.3, dmg: 60 * m }); SFX.play('click'); }
      if (i === 2) { const a = aimAt(h, tx, ty, 230); h.dash = { x: a.x, y: a.y, sp: 900, hit: new Set(), dmg: 0 }; h.empower = true; SFX.play('jump'); }
      if (i === 3) { const a = aimAt(h, tx, ty, 900); areas.push({ type: 'rain', team: h.team, src: h.id, x: a.x, y: a.y, r: 260, t0: t, life: 3, dps: 120 * m, slow: 0.25 }); SFX.play('wave'); }
    }
    return true;
  }

  /* --------------------------------------------------------------- update */
  function moveToward(e, x, y, sp, dt) {
    const dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
    if (d < 3) return true;
    const s = Math.min(d, sp * dt * (e.slow > 0 ? 0.55 : 1));
    e.x += dx / d * s; e.y = clamp(e.y + dy / d * s, 110, MAPH - 110); e.x = clamp(e.x, 60, MAPW - 60);
    e.face = dx < 0 ? -1 : 1; e.walkD += s / 26; e.moving = true;
    return false;
  }
  function attack(e, tgt, dt) {
    const range = e.kind === 'hero' ? HERO[e.type].range : e.range;
    if (dist(e, tgt) - tgt.r > range) { moveToward(e, tgt.x, tgt.y, e.kind === 'hero' ? HERO[e.type].sp : e.sp, dt); return; }
    e.face = tgt.x < e.x ? -1 : 1;
    if (e.acd <= 0) {
      const as = e.kind === 'hero' ? HERO[e.type].as : e.as, dmg = e.kind === 'hero' ? HERO[e.type].dmg * lvlMul(e) * (e.empower ? 1.8 : 1) : e.dmg;
      e.acd = as; e.attackT = t; e.empower = false;
      const ranged = e.kind === 'hero' ? HERO[e.type].ranged : e.ranged;
      if (ranged) fx.push({ type: 'homing', team: e.team, src: e.id, x: e.x, y: e.y - 16, id: tgt.id, sp: 650, dmg, col: e.kind === 'hero' && e.type === 'mage' ? PAL.indigo : PAL.ink, arrow: e.kind === 'hero' && e.type === 'archer' });
      else damage(tgt, dmg, e);
      if (e === me || tgt === me) SFX.play('hit');
    }
  }

  function updateHero(h, dt) {
    if (h.dead) {
      h.respawn -= dt;
      if (h.respawn <= 0) { h.dead = false; h.hp = h.max; h.mp = h.maxmp; h.x = FOUNT[h.team]; h.y = LANE + jit(40); h.dest = null; h.target = null; h.aiState = 'lane'; if (h === me) SFX.play('heal'); }
      return;
    }
    const H = HERO[h.type];
    h.acd -= dt; h.slow = Math.max(0, h.slow - dt); h.stun = Math.max(0, h.stun - dt); h.moving = false;
    for (let i = 0; i < 4; i++) h.cds[i] = Math.max(0, h.cds[i] - dt);
    h.mp = Math.min(h.maxmp, h.mp + dt * (4 + h.level));
    if (h.shield > 0 && t - h.shieldT > 3) h.shield = 0;
    if (Math.abs(h.x - FOUNT[h.team]) < 200) { h.hp = Math.min(h.max, h.hp + h.max * 0.12 * dt); h.mp = Math.min(h.maxmp, h.mp + h.maxmp * 0.12 * dt); }
    else h.hp = Math.min(h.max, h.hp + dt * 2);
    if (h.stun > 0) return;
    if (h.dash) {
      const d = h.dash, done = moveToward(h, d.x, d.y, d.sp, dt);
      if (d.dmg) for (const o of foesOf(h)) if (!d.hit.has(o.id) && dist(o, h) < o.r + 30 && o.kind !== 'core' && o.kind !== 'tower') { d.hit.add(o.id); damage(o, d.dmg, h, 'skill'); if (d.stun) o.stun = d.stun; if (d.first) { h.dash = null; break; } }
      if (done) h.dash = null;
      return;
    }
    if (h.ai) aiHero(h, dt);
    else {
      // player
      const ax = I.axis();
      if (Math.abs(ax.x) + Math.abs(ax.y) > 0.15) { h.dest = null; h.target = null; moveToward(h, h.x + ax.x * 100, h.y + ax.y * 100, H.sp, dt); }
      const tgt = h.target && byId.get(h.target);
      if (tgt && alive(tgt) && vulnerable(tgt)) attack(h, tgt, dt);
      else if (h.dest) {
        if (h.dest.amove) { const f = nearestFoe(h, H.range + 120); if (f) { h.target = f.id; } }
        if (moveToward(h, h.dest.x, h.dest.y, H.sp, dt)) h.dest = null;
      } else if (!tgt && !h.moving) { const f = nearestFoe(h, H.range * 0.9, (o) => o.kind !== 'hero' || true); if (f && t - (h.idleT || 0) > 0.2 && autoAttack) attack(h, f, dt); }
    }
  }
  let autoAttack = true;

  // AI heroes: stay behind their minions, poke enemy heroes with skills, back off when hurt or under an enemy tower.
  function aiHero(h, dt) {
    const H = HERO[h.type], hpK = h.hp / h.max;
    if (h.aiState === 'lane' && hpK < 0.28) h.aiState = 'back';
    if (h.aiState === 'back') { if (moveToward(h, FOUNT[h.team], LANE, H.sp, dt) || hpK > 0.92) { if (hpK > 0.92) h.aiState = 'lane'; } return; }
    const dir = h.team ? -1 : 1;
    const mine = ents.filter((o) => o.kind === 'minion' && o.team === h.team && alive(o));
    const front = mine.length ? mine.reduce((a, b) => (dir > 0 ? (b.x > a.x ? b : a) : (b.x < a.x ? b : a))) : null;
    const enemyTower = ents.find((o) => o.kind === 'tower' && o.team !== h.team && alive(o) && vulnerable(o));
    let holdX = front ? front.x - dir * (H.ranged ? 160 : 60) : CORE[h.team] + dir * 400;
    // don't stand under an enemy tower unless minions are tanking it
    if (enemyTower) { const safe = enemyTower.x - dir * (enemyTower.range + 40); const tanked = mine.some((m) => dist(m, enemyTower) < enemyTower.range); if (!tanked) holdX = dir > 0 ? Math.min(holdX, safe) : Math.max(holdX, safe); }
    const foeHero = nearestFoe(h, H.range + 250, (o) => o.kind === 'hero');
    // skills: poke heroes, clear waves
    if (foeHero && hpK > 0.35) {
      const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
      for (const i of order) {
        if (h.cds[i] > 0) continue;
        const S = H.skills[i]; if (S.ult && foeHero.hp / foeHero.max > 0.6 && Math.random() < 0.9) continue;
        if (h.type === 'mage' && i === 2) { if (hpK < 0.5) cast(h, i, FOUNT[h.team], LANE); continue; }
        if (h.type === 'archer' && i === 2) { if (dist(h, foeHero) < 200) cast(h, i, h.x - dir * 200, h.y + jit(80)); continue; }
        if (h.type === 'knight' && i === 1) { if (h.hitT > t - 0.5) cast(h, i, h.x, h.y); continue; }
        if (h.type === 'knight' && i === 2 && dist(h, foeHero) > 180) continue;
        if (dist(h, foeHero) < (h.type === 'knight' && i !== 3 ? 300 : 700) && Math.random() < dt * 2.5) { cast(h, i, foeHero.x + jit(20), foeHero.y + jit(20)); break; }
      }
    }
    const tgt = foeHero && hpK > 0.35 && (dist(h, foeHero) < H.range + 80 || h.aggroT > t - 3) ? foeHero : nearestFoe(h, H.range + 60, (o) => o.kind !== 'hero');
    if (tgt && !(tgt.kind === 'tower' && !mine.some((m) => dist(m, tgt) < tgt.range))) attack(h, tgt, dt);
    else moveToward(h, holdX, LANE + (h.type === 'mage' ? -60 : h.type === 'archer' ? 60 : 0), H.sp, dt);
  }

  function updateMinion(m, dt) {
    m.acd -= dt; m.slow = Math.max(0, m.slow - dt); m.stun = Math.max(0, m.stun - dt); m.moving = false;
    if (m.stun > 0) return;
    const tgt = nearestFoe(m, 260, (o) => o.kind !== 'hero') || nearestFoe(m, 180);
    if (tgt) attack(m, tgt, dt);
    else moveToward(m, CORE[1 - m.team], LANE + (m.y - LANE) * 0.98, m.sp, dt);
  }
  function updateTower(tw, dt) {
    tw.acd -= dt;
    if (tw.acd > 0) return;
    // towers prefer minions, but punish heroes that hit heroes under them
    let tgt = nearestFoe(tw, tw.range, (o) => o.kind === 'minion');
    const bully = ents.find((o) => o.kind === 'hero' && alive(o) && o.team !== tw.team && dist(o, tw) < tw.range && o.aggroT > t - 2);
    if (bully) tgt = bully;
    if (!tgt) tgt = nearestFoe(tw, tw.range, (o) => o.kind === 'hero');
    if (tgt) { tw.acd = tw.as; fx.push({ type: 'homing', team: tw.team, src: tw.id, x: tw.x, y: tw.y - 70, id: tgt.id, sp: 700, dmg: tw.dmg * (tgt.kind === 'hero' ? 1 : 0.7), col: TEAMS[tw.team].col, big: true }); if (tgt === me) SFX.play('pew'); }
  }
  function separate() {
    const movers = ents.filter((e) => (e.kind === 'hero' || e.kind === 'minion') && alive(e));
    for (let i = 0; i < movers.length; i++) for (let j = i + 1; j < movers.length; j++) {
      const a = movers[i], b = movers[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d > 0 && d < m) { const p = (m - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
    }
  }

  function tick(dt) {
    t += dt;
    waveT -= dt;
    if (waveT <= 0) { waveT = 26; for (const team of [0, 1]) for (let i = 0; i < 5; i++) setTimeout(() => { if (mode === 'play') makeMinion(team, i >= 3, i); }, i * 350); }
    for (const e of ents) {
      if (e.kind === 'hero') updateHero(e, dt);
      else if (!alive(e)) continue;
      else if (e.kind === 'minion') updateMinion(e, dt);
      else if (e.kind === 'tower') updateTower(e, dt);
    }
    separate();
    for (const f of fx) {
      f.life = (f.life ?? 3) - dt;
      if (f.type === 'bolt') { f.x += f.vx * dt; f.y += f.vy * dt; for (const o of ents) if (alive(o) && o.team === 1 - f.team && (o.kind === 'hero' || o.kind === 'minion') && Math.hypot(o.x - f.x, o.y - 16 - f.y) < o.r + f.r) { damage(o, f.dmg, byId.get(f.src), 'skill'); f.life = 0; burst(f.x, f.y, f.col, 6); break; } }
      if (f.type === 'homing') { const tg = byId.get(f.id); if (!alive(tg)) { f.life = 0; continue; } const dx = tg.x - f.x, dy = tg.y - 16 - f.y, d = Math.hypot(dx, dy); if (d < 12) { damage(tg, f.dmg, byId.get(f.src)); f.life = 0; } else { f.x += dx / d * f.sp * dt; f.y += dy / d * f.sp * dt; } }
    }
    fx = fx.filter((f) => f.life > 0);
    for (const a of areas) {
      const age = t - a.t0;
      for (const o of ents) {
        if (!alive(o) || o.team === a.team || (o.kind !== 'hero' && o.kind !== 'minion')) continue;
        const inside = Math.hypot(o.x - a.x, o.y - a.y) < a.r + o.r * 0.5;
        if (!inside) continue;
        if (a.dps) { damage(o, a.dps * dt, byId.get(a.src), 'dot'); if (a.slow) o.slow = 0.3; }
        if (a.type === 'trap' && !a.sprung) { a.sprung = true; a.life = age + 0.3; o.stun = a.stun; damage(o, a.dmg, byId.get(a.src), 'skill'); SFX.play('hit'); }
      }
      if (a.type === 'meteor' && age >= 0.8 && !a.boomed) { a.boomed = true; shake = 0.8; SFX.play('boom'); for (const o of ents) if (alive(o) && o.team !== a.team && (o.kind === 'hero' || o.kind === 'minion') && Math.hypot(o.x - a.x, o.y - a.y) < a.r) damage(o, a.dmg, byId.get(a.src), 'skill'); burst(a.x, a.y, PAL.indigo, 30); }
    }
    areas = areas.filter((a) => t - a.t0 < a.life);
    for (const p of parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; }
    parts = parts.filter((p) => p.age < p.life); floats = floats.filter((f) => t - f.t0 < 1);
    if (Math.random() < dt) ents = ents.filter((e) => e.kind === 'hero' || !e.dead);
    shake = Math.max(0, shake - dt * 2);
  }

  /* --------------------------------------------------------------- input */
  const I = GameInput.create({ buttons: [], touch: false });
  const cv = $('game'), c = cv.getContext('2d');
  let VW, VH, DPR, grainC, bgC = null, cam = { x: 0, y: 0, z: 1 }, shake = 0, mouse = { x: 0, y: 0, sx: 0, sy: 0 }, amove = false;
  const touch = matchMedia('(pointer: coarse)').matches;
  function resize() { DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); grainC = INK.grain(Math.round(VW), Math.round(VH)); cam.z = clamp(VH / 720, 0.6, 1.3) * (touch ? 0.85 : 1); }
  addEventListener('resize', resize); resize();
  const worldAt = (sx, sy) => [sx / cam.z + cam.x, sy / cam.z + cam.y];
  function entAt(wx, wy) { let b = null, bd = 1e9; for (const e of ents) { if (!alive(e) || e.team === me.team) continue; const d = Math.hypot(e.x - wx, e.y - (e.kind === 'hero' || e.kind === 'minion' ? e.y - 16 : e.y) - (wy - e.y)); const dd = Math.hypot(e.x - wx, (e.y - 16) - wy); if (dd < e.r + 18 && dd < bd) { bd = dd; b = e; } } return b; }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => { mouse.sx = e.clientX; mouse.sy = e.clientY; [mouse.x, mouse.y] = worldAt(e.clientX, e.clientY); });
  cv.addEventListener('pointerdown', (e) => {
    if (mode !== 'play' || !me || e.pointerType === 'touch') return;
    SFX.unlock();
    [mouse.x, mouse.y] = worldAt(e.clientX, e.clientY);
    if (e.button === 2 || amove) {
      const tgt = entAt(mouse.x, mouse.y);
      if (tgt && vulnerable(tgt)) { me.target = tgt.id; me.dest = null; ping(tgt.x, tgt.y, PAL.red); }
      else { me.target = null; me.dest = { x: mouse.x, y: mouse.y, amove }; ping(mouse.x, mouse.y, amove ? PAL.red : PAL.sap); }
      amove = false;
    }
  });
  let pings = [];
  function ping(x, y, col) { pings.push({ x, y, col, t0: t }); }
  addEventListener('keydown', (e) => {
    if (mode !== 'play' || !me) { if (e.code === 'Escape' && mode === 'paused') togglePause(); return; }
    const k = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 }[e.code];
    if (k != null) { if (!cast(me, k, mouse.x, mouse.y)) SFX.play('fizzle'); e.preventDefault(); }
    if (e.code === 'KeyA') amove = true;
    if (e.code === 'KeyS') { me.dest = null; me.target = null; }
    if (e.code === 'Space') { camLock = !camLock; e.preventDefault(); }
    if (e.code === 'Escape') togglePause();
  });
  let camLock = true;

  // touch controls: joystick (GameInput) + attack + skills, auto-aimed
  function touchUI() {
    const box = $('touch'); if (!touch) { box.hidden = true; return; }
    box.hidden = false; box.innerHTML = '';
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = label; b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); SFX.unlock(); fn(); }); box.append(b); return b; };
    mk('⚔', 'atk', () => { const f = nearestFoe(me, 700, (o) => o.kind === 'hero') || nearestFoe(me, 700); if (f) { me.target = f.id; me.dest = null; } });
    HERO[me.type].skills.forEach((S, i) => { const b = mk(S.k, 'sk sk' + i, () => { const f = nearestFoe(me, 900, (o) => o.kind === 'hero') || nearestFoe(me, 900); const tx = f ? f.x : me.x + me.face * 300, ty = f ? f.y : me.y; if (me.type === 'mage' && i === 2 || me.type === 'archer' && i === 2) { const ax = I.axis(); cast(me, i, me.x + (ax.x || -me.face * (f ? 1 : -1)) * 300, me.y + ax.y * 300); } else cast(me, i, tx, ty); }); b.dataset.i = i; });
    const pad = document.querySelector('.gi-pad'); if (pad) pad.classList.add('show');
  }

  /* --------------------------------------------------------------- render */
  function paintBG() {
    bgC = document.createElement('canvas'); bgC.width = MAPW / 2; bgC.height = MAPH / 2;
    const g = bgC.getContext('2d'); g.scale(0.5, 0.5);
    g.drawImage(INK.paper(MAPW, MAPH, 9), 0, 0);
    g.globalAlpha = 0.55; g.fillStyle = '#B7D3A0'; g.fillRect(0, 0, MAPW, MAPH); g.globalAlpha = 1;
    // lane
    boil(0, 1);
    const P = []; for (let x = -40; x <= MAPW + 40; x += 80) P.push([x, LANE + Math.sin(x / 400) * 24]);
    g.save(); g.strokeStyle = '#E3C99B'; g.lineWidth = 330; g.lineCap = 'round'; INK.path(g, P, false, true); g.stroke(); g.restore();
    g.save(); g.strokeStyle = rgba('#B08A50', 0.3); g.lineWidth = 3; g.setLineDash([12, 16]); INK.path(g, P, false, true); g.stroke(); g.restore();
    // base plazas
    for (const team of [0, 1]) { const x = FOUNT[team]; INK.blob(g, INK.ellPts(x + (team ? -100 : 100), LANE, 330, 290, 26, 6), { wash: mix('#EFE3CC', TEAMS[team].col, 0.12), ink: PAL.ink, sw: 2 }); INK.blob(g, INK.ellPts(x, LANE, 90, 70, 20, 3), { wash: '#8EC3E6', ink: PAL.ink, sw: 2, pool: [x - 20, LANE - 20, 50] }); }
    // woods along the edges
    for (let i = 0; i < 160; i++) {
      const x = hash(i) * MAPW, top = hash(i + 500) < 0.5, y = top ? 30 + hash(i + 900) * 190 : MAPH - 30 - hash(i + 900) * 190;
      if (Math.abs(x - FOUNT[0]) < 360 || Math.abs(x - FOUNT[1]) < 360) continue;
      boil(0, i + 2);
      INK.blob(g, INK.rectPts(x - 5, y + 10, 10, 22, 0.8), { wash: '#8C6A4A', ink: PAL.ink, sw: 1.4, smooth: false });
      INK.blob(g, INK.lumpPts(x, y, 34 + hash(i + 7) * 16, i, 12, 0.15, 1.2), { wash: mix('#5E9C58', '#7FB069', hash(i * 3)), ink: PAL.ink, sw: 2, pool: [x - 10, y - 12, 18], poolCol: '#D8F0C8' });
    }
    // bushes and rocks in the side meadows
    for (let i = 0; i < 40; i++) { const x = 500 + hash(i + 70) * (MAPW - 1000), y = hash(i + 170) < 0.5 ? LANE - 250 - hash(i) * 60 : LANE + 250 + hash(i) * 60; boil(0, i + 400); INK.blob(g, INK.lumpPts(x, y, 26, i + 3, 10, 0.2, 1), { wash: '#6FB35E', ink: PAL.ink, sw: 1.6, pool: [x - 8, y - 8, 12] }); }
  }

  function drawStructure(e) {
    boil(t, e.id);
    const col = TEAMS[e.team].col, flash = t - e.hitT < 0.08 && vulnerable(e);
    if (e.kind === 'tower') {
      INK.blob(c, INK.ellPts(e.x, e.y + 30, 40, 16, 16, 1), { wash: rgba(PAL.ink, 0.25), ink: null, rim: false });
      INK.blob(c, INK.rectPts(e.x - 26, e.y - 60, 52, 90, 1.5), { wash: flash ? '#fff' : '#D8CDB8', ink: PAL.ink, sw: 2.4, smooth: false, pool: [e.x - 10, e.y - 30, 30] });
      INK.blob(c, INK.rectPts(e.x - 34, e.y - 78, 68, 22, 1.2), { wash: col, ink: PAL.ink, sw: 2.2, smooth: false });
      for (let i = 0; i < 3; i++) INK.blob(c, INK.rectPts(e.x - 32 + i * 24, e.y - 92, 16, 14, 0.6), { wash: col, ink: PAL.ink, sw: 1.6, smooth: false });
      INK.blob(c, INK.ellPts(e.x, e.y - 28, 8, 10, 10), { wash: PAL.ink, ink: null });
      if (!vulnerable(e)) { c.save(); c.globalAlpha = 0.35; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y - 30, 58, 0, TAU); c.stroke(); c.restore(); }
    } else if (e.kind === 'core') {
      const pulse = 1 + Math.sin(t * 2) * 0.04;
      INK.blob(c, INK.ellPts(e.x, e.y + 40, 70, 24, 18, 1), { wash: rgba(PAL.ink, 0.25), ink: null, rim: false });
      INK.blob(c, INK.rectPts(e.x - 50, e.y - 10, 100, 50, 1.2), { wash: '#C9BBA6', ink: PAL.ink, sw: 2.4, smooth: false });
      INK.blob(c, [[e.x, e.y - 110 * pulse], [e.x + 42, e.y - 40], [e.x, e.y + 4], [e.x - 42, e.y - 40]], { wash: flash ? '#fff' : col, ink: PAL.ink, sw: 2.6, smooth: false, pool: [e.x - 12, e.y - 60, 26], poolCol: '#FFF6E8' });
      if (!vulnerable(e)) { c.save(); c.globalAlpha = 0.35; c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(e.x, e.y - 40, 84, 0, TAU); c.stroke(); c.restore(); }
    }
    bar(e, e.x, e.y - (e.kind === 'core' ? 128 : 104), e.kind === 'core' ? 110 : 76, 7);
  }
  function bar(e, x, y, w, h) {
    c.fillStyle = rgba(PAL.ink, 0.55); c.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    c.fillStyle = e.team === me?.team ? '#6FB35E' : PAL.red; c.fillRect(x - w / 2, y, w * clamp(e.hp / e.max), h);
    if (e.shield > 0) { c.fillStyle = '#fff'; c.fillRect(x - w / 2 + w * clamp(e.hp / e.max), y, w * clamp(e.shield / e.max), h); }
  }
  function drawUnit(e) {
    if (e.kind === 'hero' && e.dead) return;
    const atk = t - (e.attackT || -9) < 0.2;
    if (e.kind === 'hero') {
      const key = `${e.type}${e.team}` + (atk ? '-atk' : e.moving || e.dash ? '-walk' : '');
      if (e.shield > 0) { c.save(); c.globalAlpha = 0.3; c.fillStyle = '#fff'; c.beginPath(); c.arc(e.x, e.y - 14, 30, 0, TAU); c.fill(); c.restore(); }
      if (e === me) { c.save(); c.strokeStyle = PAL.sap; c.lineWidth = 2.5; c.beginPath(); c.ellipse(e.x, e.y + 6, 22, 9, 0, 0, TAU); c.stroke(); c.restore(); }
      ClawdSprites.draw(c, key, e.x, e.y + 8, 40, e.moving ? e.walkD : t + e.id, { flip: e.face < 0, alpha: t - e.hitT < 0.08 ? 0.6 : 1 });
      if (e.stun > 0) INK.text(c, '★', e.x, e.y - 58 + Math.sin(t * 10) * 3, 16, PAL.ochre, { shadow: false });
      bar(e, e.x, e.y - 60, 52, 6);
      c.fillStyle = rgba(PAL.ink, 0.6); c.fillRect(e.x - 26, e.y - 52, 52, 3); c.fillStyle = PAL.sky; c.fillRect(e.x - 26, e.y - 52, 52 * e.mp / e.maxmp, 3);
      INK.text(c, `${e.level}`, e.x - 34, e.y - 57, 13, PAL.cream, { shadow: true });
    } else {
      ClawdSprites.draw(c, `minion${e.team}${e.ranged ? 'r' : ''}` + (e.moving ? '-walk' : ''), e.x, e.y + 6, 22, e.moving ? e.walkD : t + e.id, { flip: e.face < 0 });
      if (e.hp < e.max) bar(e, e.x, e.y - 30, 26, 4);
    }
  }
  function drawAreas() {
    for (const a of areas) {
      const age = t - a.t0, k = clamp(age * 4); boil(t, 3000 + Math.round(a.t0 * 10));
      c.save();
      if (a.type === 'puddle') { c.globalAlpha = 0.45 * clamp((a.life - age) * 2); INK.blob(c, INK.lumpPts(a.x, a.y, a.r * k, 5, 16, 0.12), { wash: PAL.indigo, ink: PAL.ink, sw: 1.6 }); }
      if (a.type === 'meteor') { c.globalAlpha = 0.25 + age * 0.4; c.strokeStyle = PAL.red; c.lineWidth = 3; c.setLineDash([10, 8]); c.beginPath(); c.arc(a.x, a.y, a.r, 0, TAU); c.stroke(); if (age < 0.8) { const y = a.y - (0.8 - age) * 900; c.setLineDash([]); c.globalAlpha = 1; INK.blob(c, INK.lumpPts(a.x, y, 36, 9, 12, 0.2), { wash: PAL.indigo, ink: PAL.ink, sw: 2 }); } else { c.globalAlpha = 1 - (age - 0.8) / 0.2; INK.blob(c, INK.lumpPts(a.x, a.y, a.r, 11, 18, 0.2), { wash: PAL.indigo, ink: PAL.ink, sw: 2.4 }); } }
      if (a.type === 'trap') { c.globalAlpha = a.team === me.team ? 0.9 : 0.35; INK.blob(c, INK.starPts(a.x, a.y, 20, 0.45, 6, t), { wash: '#8C6A4A', ink: PAL.ink, sw: 1.4, smooth: false }); }
      if (a.type === 'rain') { c.globalAlpha = 0.18; c.fillStyle = '#8C6A4A'; c.beginPath(); c.arc(a.x, a.y, a.r, 0, TAU); c.fill(); c.globalAlpha = 0.9; c.strokeStyle = '#6E5A4A'; c.lineWidth = 2; for (let i = 0; i < 26; i++) { const an = hash(i + Math.floor(t * 10)) * TAU, rr = Math.sqrt(hash(i * 7 + Math.floor(t * 10))) * a.r, x = a.x + Math.cos(an) * rr, y = a.y + Math.sin(an) * rr; c.beginPath(); c.moveTo(x - 4, y - 18); c.lineTo(x, y); c.stroke(); } }
      c.restore();
    }
  }
  function render() {
    if (!bgC) paintBG();
    if (me) {
      if (camLock || touch) { const tx = (me.dead ? FOUNT[me.team] : me.x) - VW / cam.z / 2, ty = (me.dead ? LANE : me.y) - VH / cam.z / 2 + 40; cam.x = lerp(cam.x, tx, 0.12); cam.y = lerp(cam.y, ty, 0.12); }
      else { const pan = 14 / cam.z, m = 14; if (mouse.sx < m) cam.x -= pan; if (mouse.sx > VW - m) cam.x += pan; if (mouse.sy < m) cam.y -= pan; if (mouse.sy > VH - m) cam.y += pan; }
      cam.x = clamp(cam.x, 0, MAPW - VW / cam.z); cam.y = clamp(cam.y, 0, Math.max(0, MAPH - VH / cam.z));
    }
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#E9E3D2'; c.fillRect(0, 0, cv.width, cv.height);
    const z = cam.z * DPR, sh = shake * 8;
    c.setTransform(z, 0, 0, z, (-cam.x * cam.z + (Math.random() - 0.5) * sh) * DPR, (-cam.y * cam.z + (Math.random() - 0.5) * sh) * DPR);
    c.drawImage(bgC, 0, 0, MAPW, MAPH);
    drawAreas();
    for (const p of pings) { const k = (t - p.t0) / 0.5; if (k > 1) continue; c.save(); c.globalAlpha = 1 - k; c.strokeStyle = p.col; c.lineWidth = 3; c.beginPath(); c.ellipse(p.x, p.y, 8 + k * 20, 4 + k * 10, 0, 0, TAU); c.stroke(); c.restore(); }
    pings = pings.filter((p) => t - p.t0 < 0.5);
    const draw = ents.filter((e) => !e.dead || e.kind === 'hero').sort((a, b) => a.y - b.y);
    for (const e of draw) { if (e.kind === 'tower' || e.kind === 'core') { if (!e.dead) drawStructure(e); } else drawUnit(e); }
    for (const f of fx) {
      if (f.arrow) { c.save(); c.translate(f.x, f.y); c.rotate(Math.atan2(f.vy ?? (byId.get(f.id)?.y - f.y), f.vx ?? (byId.get(f.id)?.x - f.x))); c.strokeStyle = '#6E5A4A'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-12, 0); c.lineTo(8, 0); c.stroke(); c.fillStyle = PAL.ink; c.beginPath(); c.moveTo(12, 0); c.lineTo(6, -4); c.lineTo(6, 4); c.fill(); c.restore(); continue; }
      c.fillStyle = f.col || PAL.ink; c.beginPath(); c.arc(f.x, f.y, f.big ? 8 : f.r ? f.r * 0.8 : 5, 0, TAU); c.fill();
      if (f.type === 'bolt') { c.globalAlpha = 0.35; c.beginPath(); c.arc(f.x - f.vx * 0.02, f.y - f.vy * 0.02, f.r * 0.6, 0, TAU); c.fill(); c.globalAlpha = 1; }
    }
    for (const r of fx.filter((f) => f.type === 'ring')) { const k = (t - r.t0) / r.life; c.save(); c.globalAlpha = 1 - k; c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(r.x, r.y - 14, r.r * (0.5 + k * 0.5), 0, TAU); c.stroke(); c.restore(); }
    for (const p of parts) { c.globalAlpha = 1 - p.age / p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    for (const f of floats) { const k = t - f.t0; INK.text(c, `${f.s}`, f.x, f.y - k * 30, f.big ? 26 : 16, f.col, { alpha: 1 - k, font: f.big ? '"Permanent Marker"' : undefined, weight: f.big ? 400 : 700 }); }
    // skill aim preview (desktop)
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0, VW, VH); c.globalCompositeOperation = 'source-over';
    if (me) hud();
  }
  function hud() {
    // skill bar
    const H = HERO[me.type];
    const bar = $('skills');
    if (!bar.dataset.built) { bar.innerHTML = H.skills.map((S, i) => `<div class="skill" data-i="${i}"><kbd>${S.k}</kbd><b>${S.name}</b><i></i><span></span></div>`).join(''); bar.dataset.built = '1'; }
    [...bar.children].forEach((el, i) => { const S = H.skills[i], cd = me.cds[i], locked = S.ult && me.level < 4; el.classList.toggle('cd', cd > 0 || locked); el.classList.toggle('nomana', me.mp < S.mp); el.querySelector('i').style.height = `${(locked ? 1 : cd / S.cd) * 100}%`; el.querySelector('span').textContent = locked ? 'Lv4' : cd > 0 ? Math.ceil(cd) : ''; });
    for (const b of document.querySelectorAll('#touch .sk')) { const i = +b.dataset.i, S = H.skills[i], cd = me.cds[i]; b.classList.toggle('cd', cd > 0 || (S.ult && me.level < 4)); b.textContent = cd > 0 ? Math.ceil(cd) : S.k; }
    $('stats').innerHTML = `<b>${H.name}</b> Lv ${me.level} · ${L('킬', 'K')} ${me.kills} / ${L('데스', 'D')} ${me.deaths}<div class="xp"><i style="width:${me.level >= 10 ? 100 : me.xp / (100 + me.level * 60) * 100}%"></i></div>`;
    const towers = (team) => ents.filter((e) => e.kind === 'tower' && e.team === team && alive(e)).length;
    $('score').innerHTML = `<span style="color:${TEAMS[0].col}">▲${towers(0)}</span> ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')} <span style="color:${TEAMS[1].col}">▲${towers(1)}</span>`;
    $('respawn').hidden = !me.dead; if (me.dead) $('respawn').textContent = L(`부활까지 ${Math.ceil(me.respawn)}초`, `Respawn in ${Math.ceil(me.respawn)}s`);
  }

  /* --------------------------------------------------------------- loop */
  let last = performance.now();
  const SPEED = { n: 1 };
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    I.poll();
    if (mode === 'play') for (let i = 0; i < SPEED.n; i++) tick(dt);
    I.endFrame();
    if (mode === 'play' || mode === 'paused' || mode === 'over') render();
    for (const tc of document.querySelectorAll('.clawd-portrait')) { if (!tc.offsetParent) continue; const g = tc.getContext('2d'); g.clearRect(0, 0, tc.width, tc.height); ClawdSprites.draw(g, portrait, tc.width / 2, tc.height * 0.93, tc.width * 0.42, now / 1000); }
    for (const pc of document.querySelectorAll('.pick canvas')) { const g = pc.getContext('2d'); g.clearRect(0, 0, pc.width, pc.height); ClawdSprites.draw(g, `${pc.dataset.type}0`, pc.width / 2, pc.height * 0.95, pc.width * 0.46, now / 1000); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* --------------------------------------------------------------- flow */
  let portrait = 'title';
  function show(id) { for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id; document.body.classList.toggle('menu', !!id); }
  function start(type) {
    ents = []; fx = []; areas = []; parts = []; floats = []; byId.clear(); t = 0; nextId = 1; waveT = 4; winner = -1;
    for (const team of [0, 1]) { makeCore(team); makeTower(team, TOWERS[team][0], 0); makeTower(team, TOWERS[team][1], 1); }
    // tower order: the one further out falls first
    for (const e of ents) if (e.kind === 'tower') e.order = Math.abs(e.x - CORE[e.team]) > 800 ? 0 : 1;
    me = makeHero(type, 0, false);
    for (const tp of ORDER) { if (tp !== type) makeHero(tp, 0, true); makeHero(tp, 1, true); }
    cam.x = me.x - VW / cam.z / 2; cam.y = me.y - VH / cam.z / 2;
    $('skills').dataset.built = ''; touchUI();
    mode = 'play'; show(null); SFX.music(true); SFX.play('wave');
    feed(L('미니언이 곧 출발합니다', 'Minions are on their way'));
  }
  function end(won) {
    mode = 'over'; SFX.music(false); SFX.play(won ? 'win' : 'lose'); portrait = won ? 'win' : 'ko';
    $('msg-title').textContent = won ? L('승리!', 'Victory!') : L('패배…', 'Defeat…');
    $('msg-text').textContent = `${HERO[me.type].name} · Lv ${me.level} · ${L('킬', 'kills')} ${me.kills} · ${L('데스', 'deaths')} ${me.deaths}`;
    const row = $('msg-buttons'); row.innerHTML = ''; const b = document.createElement('button'); b.className = 'big'; b.textContent = L('다시 하기', 'Play again'); b.onclick = titleScreen; row.append(b);
    show('msg');
  }
  function titleScreen() {
    mode = 'title'; portrait = 'title'; show('title');
    const box = $('picks'); box.innerHTML = '';
    for (const type of ORDER) {
      const H = HERO[type], b = document.createElement('button'); b.className = 'pick';
      b.innerHTML = `<canvas width="220" height="170" data-type="${type}"></canvas><b>${H.name}</b><small>${H.skills.map((s) => `${s.k} ${s.name}`).join(' · ')}</small>`;
      b.onclick = () => { SFX.unlock(); SFX.play('card'); start(type); };
      box.append(b);
    }
  }
  function togglePause() { if (mode === 'play') { mode = 'paused'; } else if (mode === 'paused') mode = 'play'; }
  $('btn-pause').addEventListener('click', togglePause);
  addEventListener('blur', () => { if (mode === 'play') togglePause(); });

  async function boot() {
    show('loading'); $('load-text').textContent = L('영웅들을 그리는 중…', 'Painting the heroes…');
    const walk = (tt, f) => ({ view: 'q', walk: f / 6, dy: -Math.abs(Math.sin(f / 6 * TAU)) * 0.4, aL: 0.4 * Math.sin(f / 6 * TAU), aR: -0.4 * Math.sin(f / 6 * TAU), emote: null });
    const tint = (team) => (team ? { col: '#8A6BC4', dk: '#5A3F8A', lt: '#C4B0E8' } : {});
    const specs = [];
    for (const team of [0, 1]) {
      for (const type of ORDER) {
        const over = { hat: HERO[type].hat, ...tint(team) };
        specs.push(
          { key: `${type}${team}`, emotion: team ? 'smug' : 'determined', frames: 3, over: { ...over, emote: null } },
          { key: `${type}${team}-walk`, emotion: 'determined', frames: 6, pose: walk, over: { ...over, emote: null } },
          { key: `${type}${team}-atk`, emotion: 'angry', frames: 2, over: { ...over, view: 'q', aR: 1.5, aL: 0.2, emote: null } },
        );
      }
      for (const r of ['', 'r']) specs.push(
        { key: `minion${team}${r}`, emotion: 'neutral', frames: 2, over: { ...tint(team), hat: r ? 'bow' : 'party', view: 'q', emote: null } },
        { key: `minion${team}${r}-walk`, emotion: 'neutral', frames: 4, pose: walk, over: { ...tint(team), hat: r ? 'bow' : 'party', emote: null } },
      );
    }
    specs.push({ key: 'title', emotion: 'determined', frames: 6, over: { hat: 'wizard' } }, { key: 'win', emotion: 'starstruck', frames: 6, over: { hat: 'crown' } }, { key: 'ko', emotion: 'cry', frames: 4 });
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; }, 'lite');
    titleScreen();
  }
  boot();
  window.__lane = { get ents() { return ents; }, get me() { return me; }, get mode() { return mode; }, get t() { return t; }, start, set speed(n) { SPEED.n = n; }, cast };
})();
