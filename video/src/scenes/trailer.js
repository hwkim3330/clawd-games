// trailer.js — "Clawd and the Hat Box", a 16-second trailer for Clawd Arcade. See STORYBOARD.md for the shot list and reads.
(() => {
  const U = 24;                                 // Clawd's usual acting size
  const DESK_Y = 820;                           // desk top (ground line) in shots A and D

  // ---------- set pieces ----------
  function deskRoom(t, warm = 0) {
    boilSeed('wall');
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: mixCol('#F2E2C4', '#F4C9A8', warm), ink: null });
    paint(ellPts(W * .72, H * .25, W * .42, H * .38, 30, 10), { fill: mixCol(PAL.ochre, PAL.rose, warm), fillOp: 70, bleed: .3, tex: .5, ink: null });
    boilSeed('window');   // a window with the sky going from afternoon to sunset
    paint(rectPts(1180, 150, 420, 330, 3), { wash: mixCol('#CFE6F2', '#F2B08C', warm), fill: mixCol(PAL.sky, PAL.rose, warm), fillOp: 80, bleed: .1, ink: PAL.ink, sw: 1.4 });
    inkLine([[1390, 150], [1390, 480]], 1.2); inkLine([[1180, 315], [1600, 315]], 1.2);
    glow(1390, 300, 260, mixCol('#FFE6A8', '#FFB070', warm), .45);
    boilSeed('desk');
    paint(rectPts(-300, DESK_Y, W + 600, 400, 4), { wash: '#C89F74', fill: '#A87B52', fillOp: 90, bleed: .08, tex: .7, ink: PAL.ink, sw: 1.4 });
    for (let i = 0; i < 5; i++) inkLine([[-100, DESK_Y + 50 + i * 55 + hash(i) * 10], [W + 100, DESK_Y + 40 + i * 55]], .6, '#8C6A4A', 'inkfine', .3);
    // props on the desk: an ink bottle and a pencil
    boilSeed('bottle');
    paint(rrPts(260, DESK_Y - 150, 110, 150, 18, 1.5), { wash: PAL.indigo, fill: PAL.violet, fillOp: 60, ink: PAL.ink, sw: 1.2 });
    paint(rectPts(285, DESK_Y - 185, 60, 40, 1), { wash: PAL.ink, ink: null });
    boilSeed('pencil');
    push(); translate(1500, DESK_Y - 20); rotate(-.08);
    paint(rectPts(-160, -14, 280, 28, 1), { wash: '#F2C53D', ink: PAL.ink, sw: 1.1 });
    paint([[120, -14], [170, 0], [120, 14]], { wash: '#F3D9A6', ink: PAL.ink, sw: 1 });
    paint(rectPts(-190, -14, 30, 28, 1), { wash: PAL.rose, ink: PAL.ink, sw: 1 });
    pop();
  }
  // The box: cardboard, with a lid that pops open (open 0..1). (x, y) is the middle of its bottom edge.
  function box(x, y, s, open = 0, sq = 0) {
    boilSeed('box');
    push(); translate(x, y); scale(1 + sq * .5, 1 - sq);
    paint(rectPts(-110 * s, -150 * s, 220 * s, 150 * s, 2), { wash: '#C9955E', fill: '#A8743F', fillOp: 70, bleed: .06, tex: .6, ink: PAL.ink, sw: 1.5 });
    inkLine([[-110 * s, -110 * s], [110 * s, -110 * s]], .7, '#8C5A33', 'inkfine', 0);
    for (const sd of [-1, 1]) {
      push(); translate(sd * 110 * s, -150 * s); rotate(sd * (-.2 - open * 1.9));
      paint(rectPts(sd > 0 ? -110 * s : 0, -26 * s, 110 * s, 26 * s, 1.5), { wash: '#D9A870', ink: PAL.ink, sw: 1.3 });
      pop();
    }
    pop();
  }
  // A hat on its own (flying): drawn in Clawd's body space, so it matches the hat Clawd wears.
  function looseHat(x, y, u, h, rot = 0) {
    boilSeed('hat' + h);
    push(); translate(x, y); rotate(rot); translate(0, 8 * u); hat(u, h, clamp(u / 15, .45, 2.4)); pop();
  }
  // Ink blot creature. k = squash; face looks toward lx.
  function blot(x, y, r, id, o = {}) {
    boilSeed('blot' + id);
    const s = 1 + (o.sq || 0);
    push(); translate(x, y); scale(s, 2 - s);
    const P = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, k = 1 + .18 * (hash(id * 31 + i) * 2 - 1); P.push([Math.cos(a) * r * k, -r + Math.sin(a) * r * .85 * k]); }
    paint(P, { wash: '#3b2f4a', fill: PAL.violet, fillOp: 50, ink: PAL.ink, sw: 1.1, curv: .5 });
    for (const sd of [-1, 1]) {
      paint(ellPts(sd * r * .32 + (o.look || 0) * r * .1, -r * 1.1, r * .2, r * .26, 10), { wash: PAL.cream, ink: null });
      paint(ellPts(sd * r * .32 + (o.look || 0) * r * .18, -r * 1.06, r * .09, r * .12, 8), { wash: PAL.ink, ink: null });
    }
    pop();
  }
  function splat(x, y, r, id, k) {
    boilSeed('splat' + id);
    const q = easeOut(k);
    for (let i = 0; i < 7; i++) { const a = hash(id + i) * TAU, d = r * (.4 + q * 1.6 * hash(id * 7 + i)); paint(ellPts(x + Math.cos(a) * d, y - r * .6 + Math.sin(a) * d * .7, r * .22 * (1 - k * .5), r * .2 * (1 - k * .5), 8), { wash: '#3b2f4a', washOp: 255 * (1 - k), ink: null }); }
  }

  // ---------- shot A: the box ----------
  function shotBox(t, lt, dur) {
    const land = 1.25, shake = lt > land ? shakeXY(lt, 6 * Math.exp(-(lt - land) * 8)) : [0, 0];
    camBegin(kf(lt, [[0, 820], [1.2, 900], [4.2, 940]]) + shake[0], kf(lt, [[0, 640], [4.2, 610]]) + shake[1], kf(lt, [[0, 1.35], [1.2, 1.25], [4.2, 1.45]]));
    deskRoom(t, 0);
    // the box falls on an arc and lands with a thump
    const bx = 1180, fall = seg(lt, .75, land), boxY = lt < land ? lerp(-260, DESK_Y, easeIn(fall)) : DESK_Y;
    const bsq = lt > land ? .22 * Math.exp(-(lt - land) * 9) * Math.cos((lt - land) * 26) : -.08 * fall;
    const open = easeOut(seg(lt, 3.05, 3.25)) * (1 - .3 * seg(lt, 3.6, 4));
    box(bx, boxY, 1, open, bsq);
    if (lt > land && lt < land + .6) { boilSeed('dust'); for (let i = 0; i < 6; i++) { const k = seg(lt, land, land + .6), sd = i < 3 ? -1 : 1; paint(ellPts(bx + sd * (120 + k * 120 + i % 3 * 30), DESK_Y - 10 - k * 30 - i % 3 * 12, 26 * (1 - k), 18 * (1 - k), 10), { wash: PAL.cream, washOp: 200 * (1 - k), ink: null }); } }
    // Clawd: bored → surprised by the thump → curious → walks to the box → the hat lands → idea
    const walk = stroll(lt, 2.15, 3.0, 640, 930, U);
    const mood = emotions(lt, [[0, 'bored'], [land + .05, 'surprised'], [1.9, 'curious' in EMO ? 'curious' : 'hopeful'], [3.1, 'excited'], [3.75, 'idea']]);
    const hatK = seg(lt, 3.1, 3.6), onHead = lt >= 3.6;
    const dy = (mood.dy || 0) + (walk.dy || 0) + (onHead ? -spring(lt, 3.6, 7, 22) * .6 : 0);
    clawd(walk.x, DESK_Y, U, { ...mood, dy, walk: walk.walk, view: lt < 2.15 ? (lt > 1.9 ? 'q' : 'front') : walk.view, lookX: lt > 1.4 && lt < 2.2 ? 1 : mood.lookX, hat: onHead ? 'wizard' : null, boilKey: 'clawd' });
    if (!onHead && hatK > 0) { const [hx, hy] = arcPt([bx, DESK_Y - 150], [930, DESK_Y - 8 * U + (walk.dy || 0) * U], 260, easeOut(hatK)); looseHat(hx, hy, U, 'wizard', (1 - hatK) * 6); }
    const me = toScreen(640, DESK_Y - 4 * U);
    camEnd();
    if (lt < .6) iris(me[0], me[1], lerp(0, 1500, easeIn(lt / .6)), PAL.paper);
    if (lt > dur - .3) brushWipe((lt - (dur - .3)) / .6, [PAL.indigo, PAL.violet]);
  }

  // ---------- shot B: ink night, the circle ----------
  const CX = 960, GY = 820;
  function nightWorld(t) {
    boilSeed('night');
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: PAL.night, ink: null });
    paint(ellPts(W / 2, H * 1.05, W * .8, H * .5, 30, 10), { fill: PAL.violet, fillOp: 100, bleed: .3, tex: .6, ink: null });
    for (let i = 0; i < 30; i++) { boilSeed('nstar' + i); const x = hash(i) * W, y = hash(i + 40) * H * .55, tw = .6 + .4 * Math.sin(t * 3 + i); paint(starPts(x, y, (3 + 4 * hash(i + 9)) * tw, .35, 4), { wash: PAL.cream, washOp: 160 + 90 * tw, ink: null }); }
    boilSeed('nground');
    paint(ellPts(W / 2, GY + 420, W * .9, 440, 40, 3), { wash: mixCol(PAL.indigo, PAL.night, .3), fill: PAL.violet, fillOp: 60, bleed: .1, ink: PAL.ink, sw: 1.2 });
  }
  function shotCircle(t, lt, dur) {
    camBegin(960, 580, kf(lt, [[0, 1.06], [2, 1.12], [4.2, 1.18]]));
    nightWorld(t);
    const R = 220, draw = seg(lt, 1.45, 2.05), hitT = 2.2;
    // the circle of light draws itself around Clawd
    if (draw > 0) {
      const n = Math.max(2, Math.floor(draw * 40)), P = [];
      for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + i / 40 * TAU; P.push([CX + Math.cos(a) * R, GY - 110 + Math.sin(a) * R * .8]); }
      glow(CX, GY - 110, R * 1.3, '#9FD4F2', .45 + .3 * pulse(t));
      boilSeed('ring'); paint(ribbon(P, 16, 16), { wash: '#BFE3F7', fill: PAL.sky, fillOp: 80, ink: PAL.ink, sw: 1 });
    }
    // three blots crawl in, hit the circle, bounce back and burst
    const blots = [[-1, 0, 0], [1, 1, .15], [1, 2, .35]];
    for (const [side, id, delay] of blots) {
      const approach = ease(seg(lt, .2 + delay, hitT)), start = CX + side * 1050, stop = CX + side * (R + 40);
      let x = lerp(start, stop, approach), sq = .1 * Math.sin(lt * 14 + id);
      const bounce = seg(lt, hitT, hitT + .45);
      if (lt > hitT) { x = stop + side * 160 * easeOut(bounce); sq = .3 * Math.exp(-(lt - hitT) * 6); }
      const burstK = seg(lt, hitT + .45 + id * .12, hitT + .95 + id * .12);
      if (burstK <= 0) blot(x, GY + (id === 2 ? 40 : 0) - (lt > hitT ? 80 * Math.sin(bounce * Math.PI) : 0), 46, id, { sq, look: -side });
      else if (burstK < 1) splat(x, GY + (id === 2 ? 40 : 0), 46, id, burstK);
    }
    const mood = emotions(lt, [[0, 'determined'], [1.3, 'angry'], [2.35, 'surprised'], [3.0, 'proud']]);
    const arm = kf(lt, [[1.2, .2], [1.45, 1.55], [2.1, 1.55], [2.4, .3]]);
    clawd(CX, GY, U * 1.1, { ...mood, hat: 'wizard', aR: lt > 1.2 && lt < 2.4 ? arm : mood.aR, lookX: lt < 1.3 ? Math.sin(lt * 3) : mood.lookX, boilKey: 'clawd' });
    camEnd();
    if (lt < .3) brushWipe(.5 + lt / .6, [PAL.indigo, PAL.violet]);
    // match cut: the circle swells to cover the frame in sky blue
    if (lt > dur - .6) iris(W / 2, H / 2 - 40, lerp(1200, 0, easeIn(seg(lt, dur - .6, dur))), PAL.sky);
  }

  // ---------- shot C: the meadow hops ----------
  const BLOCKS = [[420, 780], [860, 700], [1300, 760]];
  function meadow(t) {
    boilSeed('sky');
    paint(rectPts(-400, -300, W + 800, H + 600), { wash: '#D8ECF7', ink: null });
    paint(ellPts(W * .3, H * .2, W * .35, H * .22, 24, 10), { fill: PAL.sky, fillOp: 70, bleed: .3, tex: .5, ink: null });
    for (let i = 0; i < 4; i++) { boilSeed('cloud' + i); const x = ((hash(i) * W * 1.4 + t * 18 * (1 + i * .3)) % (W + 400)) - 200, y = 120 + i * 70; paint(ellPts(x, y, 110, 40, 14, 3), { wash: PAL.cream, ink: PAL.ink, sw: .8 }); }
    boilSeed('hills');
    paint(ellPts(W * .25, H * 1.12, W * .6, H * .45, 30, 5), { wash: '#A9D48E', fill: PAL.sap, fillOp: 70, bleed: .08, tex: .5, ink: PAL.ink, sw: 1 });
    paint(ellPts(W * .85, H * 1.15, W * .55, H * .4, 30, 5), { wash: '#B7DDA0', fill: PAL.sap, fillOp: 60, bleed: .08, tex: .5, ink: PAL.ink, sw: 1 });
    BLOCKS.forEach(([x, y], i) => { boilSeed('block' + i); const bob = Math.sin(t * 2 + i) * 6; paint(rectPts(x - 110, y + bob, 220, 60, 2), { wash: PAL.cream, fill: '#EAD9B8', fillOp: 70, ink: PAL.ink, sw: 1.3 }); inkLine([[x - 100, y + bob + 44], [x + 100, y + bob + 44]], .5, '#B8A68A', 'inkfine', 0); });
  }
  function blockTop(i, t) { return BLOCKS[i][1] + Math.sin(t * 2 + i) * 6; }
  function shotHops(t, lt, dur) {
    camBegin(kf(lt, [[0, 760], [4, 1100]]), 560, 1.02);
    meadow(t);
    // hop 1: block 0 → 1, hop 2: block 1 → 2 (onto the blot)
    const h1 = [.6, 1.2], h2 = [1.5, 2.2];
    let x, y, pose = {};
    if (lt < h1[0]) { x = BLOCKS[0][0]; y = blockTop(0, t); pose = jump(lt, h1[0], h1[1], 5); }
    else if (lt < h1[1]) { const k = seg(lt, h1[0], h1[1]); x = lerp(BLOCKS[0][0], BLOCKS[1][0], k); y = lerp(blockTop(0, t), blockTop(1, t), k); pose = jump(lt, h1[0], h1[1], 5); }
    else if (lt < h2[1]) { const k = seg(lt, h2[0], h2[1]); x = lt < h2[0] ? BLOCKS[1][0] : lerp(BLOCKS[1][0], BLOCKS[2][0] - 20, k); y = lt < h2[0] ? blockTop(1, t) : lerp(blockTop(1, t), blockTop(2, t), k); pose = { ...jump(lt, h1[0], h1[1], 5) }; const p2 = jump(lt, h2[0], h2[1], 6); pose = { dy: p2.dy, sq: p2.sq + (pose.sq || 0) * (lt < h2[0] ? 1 : 0) }; }
    else { x = BLOCKS[2][0] - 20; y = blockTop(2, t); pose = jump(lt, h2[0], h2[1], 6); }
    // the blot on the last block gets stomped as Clawd lands
    const stompT = h2[1];
    if (lt < stompT) blot(BLOCKS[2][0] + 10, blockTop(2, t), 40, 7, { sq: .08 * Math.sin(lt * 12), look: -1 });
    else if (lt < stompT + .5) splat(BLOCKS[2][0] + 10, blockTop(2, t), 40, 7, seg(lt, stompT, stompT + .5));
    const mood = emotions(lt, [[0, 'determined'], [stompT + .05, 'excited'], [3.1, 'surprised']]);
    const bandK = seg(lt, 3.05, 3.9), bandOn = lt < 3.05;
    const flying = lt > h1[0] && lt < h2[1] && !(lt > h1[1] && lt < h2[0]);
    clawd(x, y, U, { ...mood, dy: (mood.dy || 0) + (pose.dy || 0), sq: (mood.sq || 0) + (pose.sq || 0), view: flying ? 'q' : 'front', aL: flying ? 1.3 : mood.aL, aR: flying ? 1.1 : mood.aR, hat: bandOn ? 'band' : null, lookX: lt > 3.1 ? -1 : mood.lookX, lookY: lt > 3.1 ? -.7 : mood.lookY, boilKey: 'clawd' });
    if (!bandOn) { const [hx, hy] = arcPt([x, y - 8 * U], [x - 900, y - 700], 160, easeIn(bandK)); looseHat(hx, hy, U, 'band', -bandK * 5); }
    // wind streaks
    if (lt > 2.9) { boilSeed('wind'); for (let i = 0; i < 4; i++) { const k = seg(lt, 2.9 + i * .1, 3.6 + i * .1), wx = lerp(x + 500, x - 700, k), wy = y - 260 - i * 40; if (k > 0 && k < 1) inkLine([[wx, wy], [wx - 160, wy - 10], [wx - 260, wy + 6]], .9, PAL.cream, 'dry', .5); } }
    camEnd();
    if (lt < .6) iris(W / 2, H / 2 - 40, lerp(0, 1300, easeOut(seg(lt, 0, .6))), PAL.sky);
    if (lt > dur - .35) { const k = seg(lt, dur - .35, dur); flash(k * .9, PAL.cream); }
  }

  // ---------- shot D: home, the crown ----------
  function shotCrown(t, lt, dur) {
    const push = kf(lt, [[0, 1.5], [3.6, 1.3]]);
    camBegin(kf(lt, [[0, 880], [.4, 1000]], easeOut), kf(lt, [[0, 600], [3.6, 640]]), push);
    deskRoom(t, 1);
    const bx = 1180, open = easeOut(seg(lt, .75, .95)) * (1 - seg(lt, 1.8, 2.3) * .4);
    box(bx, DESK_Y, 1, open, lt > .45 && lt < .75 ? .12 * Math.sin((lt - .45) * 30) : 0);
    // the band drops back into the box
    if (lt < .45) { const [hx, hy] = arcPt([bx - 500, -120], [bx, DESK_Y - 160], 80, easeIn(seg(lt, 0, .45))); looseHat(hx, hy, U, 'band', lt * 4); }
    // the crown rises out and floats onto Clawd
    const cx = 930, crownK = seg(lt, .8, 1.5), crowned = lt >= 1.5;
    const mood = emotions(lt, [[0, 'laugh'], [.8, 'surprised'], [1.55, 'starstruck'], [2.2, 'happy', { emote: 'music' }]]);
    const dance = lt > 2.2 ? move('roof', t) : {};
    const dy = (mood.dy || 0) + (dance.dy || 0) + (crowned ? -spring(lt, 1.5, 7, 22) * .5 : 0);
    clawd(cx + (dance.dx || 0) * U, DESK_Y, U * 1.05, { ...mood, ...(lt > 2.2 ? { aL: dance.aL, aR: dance.aR, rot: dance.rot } : {}), dy, sq: (mood.sq || 0) + (dance.sq || 0), hat: crowned ? 'crown' : null, lookX: lt > .7 && lt < 1.5 ? .8 : mood.lookX, lookY: lt > .7 && lt < 1.5 ? -.6 : mood.lookY, boilKey: 'clawd' });
    if (!crowned && crownK > 0) { const [hx, hy] = arcPt([bx, DESK_Y - 150], [cx, DESK_Y - 8 * U * 1.05], 300, ease(crownK)); glow(hx, hy - 20, 140, '#FFD96A', .6); looseHat(hx, hy, U * 1.05, 'crown', (1 - crownK) * -3); }
    if (crowned) glow(cx, DESK_Y - 9 * U, 180 + 30 * pulse(t), '#FFD96A', .35);
    const at = toScreen(cx, DESK_Y - 4 * U);
    camEnd();
    if (lt < .35) { const k = seg(lt, 0, .35); flash((1 - k) * .9, PAL.cream); }
    if (lt > dur - .7) iris(at[0], at[1], lerp(1400, 0, easeIn(seg(lt, dur - .7, dur - .05))), PAL.ink);
  }

  shots([[0, shotBox], [4.2, shotCircle], [8.4, shotHops], [12.4, shotCrown]]);
})();
