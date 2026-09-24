// Ink Beat — a rhythm game you play by drawing. Shape cards slide in on the beat; draw the shape so your pen lifts
// right as its beat lands. Every hit makes Clawd dance a move from the Claude Animation Base.
//
// Timing is judged on the WebAudio clock (the same clock the music is scheduled on), at the moment the stroke ends.

(() => {
  const { PAL, TAU, clamp, lerp, backOut, ease, mix, rgba, boil, jit, hash } = INK;
  const $ = (id) => document.getElementById(id);
  const KO = (navigator.language || 'ko').toLowerCase().startsWith('ko');
  const L = (ko, en) => (KO ? ko : en);
  const BPM = PROJECT.bpm, BEAT = 60 / BPM;

  const SHAPES = {
    line: { col: PAL.red, move: 'wave', name: L('선', 'line') },
    circle: { col: PAL.sky, move: 'spin', name: L('원', 'circle') },
    zigzag: { col: PAL.ochre, move: 'shimmy', name: L('지그재그', 'zigzag') },
    triangle: { col: '#EE6A3A', move: 'hop', name: L('세모', 'triangle') },
    square: { col: PAL.teal, move: 'stomp', name: L('네모', 'square') },
    spiral: { col: PAL.violet, move: 'roof', name: L('나선', 'spiral') },
  };
  // songs: key, tempo feel, and which beats carry a card (bar = 4 beats). Harder songs use more shapes and closer cards.
  const SONGS = [
    { name: L('첫 번째 선', 'First Lines'), shapes: ['line', 'circle', 'zigzag'], bars: 16, every: [4, 4, 4, 2], root: 220, scale: [0, 2, 4, 7, 9], lead: 'triangle' },
    { name: L('도형 댄스', 'Shape Dance'), shapes: ['line', 'circle', 'zigzag', 'triangle', 'square'], bars: 20, every: [4, 2, 2, 2, 3], root: 196, scale: [0, 3, 5, 7, 10], lead: 'square' },
    { name: L('나선 열기', 'Spiral Fever'), shapes: ['line', 'circle', 'zigzag', 'triangle', 'square', 'spiral'], bars: 24, every: [2, 2, 3, 2, 1.5], root: 247, scale: [0, 2, 3, 7, 8, 12], lead: 'sawtooth' },
  ];
  const WIN = { perfect: 0.12, good: 0.25, late: 0.45 };

  /* ------------------------------------------------------------ canvas */
  const cv = $('game'), c = cv.getContext('2d');
  let VW, VH, DPR, B, paperC, grainC;
  function resize() { DPR = Math.min(2, devicePixelRatio || 1); VW = innerWidth; VH = innerHeight; cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR); B = Math.min(VW, VH); paperC = INK.paper(cv.width, cv.height, 21); grainC = INK.grain(Math.round(VW), Math.round(VH)); }
  addEventListener('resize', resize); resize();

  /* ------------------------------------------------------------ state */
  let mode = 'loading', song = null, notes = [], t0 = 0, stroke = null, score = 0, combo = 0, maxCombo = 0, fever = 0, judged = [], floats = [], dance = { move: 'idle', t: -9 }, mood = 'neutral', moodT = 0, songIdx = 0, stats = null;
  let best = {}; try { best = JSON.parse(localStorage.getItem('inkbeat.best')) || {}; } catch {}
  const ac = () => SFX.unlock();
  const now = () => (ac() ? ac().currentTime : performance.now() / 1000);
  const songTime = () => now() - t0;

  /* ------------------------------------------------------------ music */
  // Scheduled ahead on the audio clock: kick, snare, hat, bass and a little lead that follows the cards.
  let schedAt = 0, schedTimer = 0;
  function scheduleMusic() {
    const a = ac(); if (!a || !song) return;
    const endT = song.bars * 4 * BEAT + 4 * BEAT;
    while (schedAt < songTime() + 0.25 && schedAt < endT) {
      const beat = Math.round(schedAt / BEAT), inBar = beat % 4, delay = schedAt - songTime();
      if (delay > -0.02) {
        const d = Math.max(0, delay);
        const intro = beat < 4;
        // kick on 1 and 3, snare on 2 and 4, hats on every eighth
        if (inBar === 0 || inBar === 2) { SFX.tone(110, 0.25, { type: 'sine', slide: 0.35, vol: 0.55, delay: d }); }
        if (!intro && (inBar === 1 || inBar === 3)) SFX.noise(0.14, { f: 1800, vol: 0.22, q: 0.8, delay: d });
        SFX.noise(0.04, { f: 8000, vol: 0.06, q: 2, type: 'highpass', delay: d }); SFX.noise(0.04, { f: 8000, vol: 0.04, q: 2, type: 'highpass', delay: d + BEAT / 2 });
        if (!intro) {
          const barN = Math.floor(beat / 4), chord = [0, 5, 3, 4][barN % 4];
          SFX.tone(song.root / 2 * Math.pow(2, song.scale[chord % song.scale.length] / 12), BEAT * 0.9, { type: 'triangle', vol: 0.18, delay: d });
          if (hash(beat * 3.7) < 0.55) { const n = song.scale[Math.floor(hash(beat * 7.1) * song.scale.length)]; SFX.tone(song.root * Math.pow(2, n / 12), BEAT * 0.45, { type: song.lead, vol: 0.05, delay: d + (hash(beat) < 0.3 ? BEAT / 2 : 0) }); }
        }
        // count-in clicks
        if (intro) SFX.tone(inBar === 0 ? 1320 : 880, 0.05, { type: 'square', vol: 0.06, delay: d });
      }
      schedAt += BEAT;
    }
  }

  /* ------------------------------------------------------------ chart */
  function makeChart(s) {
    const out = []; let beat = 4, i = 0, last = '';
    const total = s.bars * 4;
    while (beat < total) {
      const k = Math.floor((beat - 4) / (total - 4) * s.every.length);
      // avoid long runs of the same shape (a few tries, each with its own hash)
      let shape, tries = 0; do { shape = s.shapes[Math.floor(hash(beat * 13.3 + i + tries * 91.7) * s.shapes.length)]; tries++; } while (shape === last && tries < 4);
      last = shape; out.push({ shape, beat, time: beat * BEAT, state: 'wait' });
      beat += s.every[Math.min(k, s.every.length - 1)]; i++;
    }
    return out;
  }

  /* ------------------------------------------------------------ input */
  cv.addEventListener('pointerdown', (e) => {
    if (mode !== 'play') return;
    cv.setPointerCapture(e.pointerId);
    stroke = { pts: [[e.clientX, e.clientY]], id: e.pointerId, t0: songTime() };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!stroke || stroke.id !== e.pointerId) return;
    for (const ev of e.getCoalescedEvents ? e.getCoalescedEvents() : [e]) { const p = stroke.pts.at(-1); if (Math.hypot(ev.clientX - p[0], ev.clientY - p[1]) > 2) stroke.pts.push([ev.clientX, ev.clientY]); }
  });
  const endStroke = (e) => {
    if (!stroke || (e && stroke.id !== e.pointerId)) return;
    const s = stroke; stroke = null;
    const g = Gesture.classify(s.pts);
    if (g.shape === 'dot') return;
    judge(g, songTime(), s.pts);
  };
  cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && mode === 'play') quit(); });

  function judge(g, at, pts) {
    // the nearest waiting card in time (early or late)
    let best = null, bd = Infinity;
    for (const n of notes) { if (n.state !== 'wait') continue; const d = Math.abs(n.time - at); if (d < bd) { bd = d; best = n; } }
    const shape = g.shape === 'scribble' ? null : g.shape;
    if (!best || bd > WIN.late) { floatText(L('헛그림', 'Stray'), pts.at(-1)[0], pts.at(-1)[1], '#999'); return; }
    const right = shape === best.shape;
    let grade = !right ? 'wrong' : bd <= WIN.perfect ? 'perfect' : bd <= WIN.good ? 'good' : 'late';
    best.state = grade === 'wrong' ? 'miss' : 'hit'; best.grade = grade; best.hitT = at;
    judged.push({ grade, x: pts.at(-1)[0], y: pts.at(-1)[1], t: songTime(), pts, col: SHAPES[best.shape].col });
    if (grade === 'wrong') { combo = 0; fever = Math.max(0, fever - 0.3); setMood('confused'); stats.miss++; SFX.play('fizzle'); floatText(L(`${SHAPES[best.shape].name}였어!`, `It was a ${SHAPES[best.shape].name}!`), VW / 2, VH * 0.24, PAL.red); return; }
    combo++; maxCombo = Math.max(maxCombo, combo); stats[grade]++;
    const pts0 = { perfect: 300, good: 150, late: 60 }[grade] * (1 + Math.min(combo, 50) / 25) * (fever >= 1 ? 2 : 1);
    score += Math.round(pts0);
    fever = fever >= 1 ? fever : Math.min(1, fever + (grade === 'perfect' ? 0.12 : 0.06));
    if (fever >= 1 && !feverOn) { feverOn = songTime(); SFX.play('win'); floatText(L('피버!', 'FEVER!'), VW / 2, VH * 0.2, PAL.ochre, 1.6); }
    dance = { move: SHAPES[best.shape].move, t: songTime() };
    setMood(grade === 'perfect' ? (combo > 15 ? 'starstruck' : 'excited') : 'happy');
    SFX.tone(grade === 'perfect' ? 1047 : 784, 0.12, { type: 'triangle', vol: 0.1 });
  }
  let feverOn = 0;
  function setMood(m) { mood = m; moodT = songTime(); }
  function floatText(s, x, y, col, scale = 1) { floats.push({ s, x, y, t: songTime(), col, scale }); }

  /* ------------------------------------------------------------ update/render */
  function drawGlyph(g, shape, x, y, s, col, w = 0.1) {
    let P;
    if (shape === 'line') P = [[x - s * 0.5, y + s * 0.35], [x + s * 0.5, y - s * 0.35]];
    else if (shape === 'circle') P = INK.ellPts(x, y, s * 0.45, s * 0.42, 16, 0.5).concat([[x + s * 0.45, y + 0.5]]);
    else if (shape === 'zigzag') P = [[x - s * 0.55, y + s * 0.3], [x - s * 0.2, y - s * 0.35], [x + s * 0.15, y + s * 0.3], [x + s * 0.55, y - s * 0.35]];
    else if (shape === 'triangle') P = [[x, y - s * 0.45], [x + s * 0.5, y + s * 0.4], [x - s * 0.5, y + s * 0.4], [x, y - s * 0.45]];
    else if (shape === 'square') P = [[x - s * 0.42, y - s * 0.42], [x + s * 0.42, y - s * 0.42], [x + s * 0.42, y + s * 0.42], [x - s * 0.42, y + s * 0.42], [x - s * 0.42, y - s * 0.42]];
    else { P = []; for (let i = 0; i < 34; i++) { const a = i * 0.45, r = s * 0.04 + i * s * 0.014; P.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } }
    INK.inkLine(g, P, Math.max(1.6, s * w), col);
  }

  function render() {
    const st = songTime(), bp = st / BEAT, beatK = Math.exp(-((bp % 1 + 1) % 1) * 6);
    c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(paperC, 0, 0);
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    // pulsing sunburst behind Clawd, hotter in fever
    const fev = fever >= 1, cx = VW / 2, cy = VH * 0.46;
    c.save(); c.globalAlpha = 0.18 + beatK * 0.08 + (fev ? 0.1 : 0);
    const n = 16, R = B * (0.55 + beatK * 0.03);
    for (let i = 0; i < n; i++) { const a0 = st * 0.2 + i / n * TAU, a1 = a0 + TAU / n * 0.5; c.fillStyle = i % 2 ? (fev ? PAL.ochre : PAL.sky) : (fev ? PAL.rose : PAL.cream); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); c.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); c.fill(); }
    c.restore();
    // the lane: cards slide right→left toward the stamp circle
    const laneY = VH * 0.8, hitX = VW * 0.2, pxPerSec = Math.max(220, VW * 0.32);
    c.save(); c.fillStyle = rgba(PAL.cream, 0.85); c.fillRect(0, laneY - B * 0.07, VW, B * 0.14); c.restore();
    boil(st, 1); INK.inkLine(c, [[0, laneY - B * 0.07], [VW, laneY - B * 0.07]], 1.6); INK.inkLine(c, [[0, laneY + B * 0.07], [VW, laneY + B * 0.07]], 1.6);
    // beat ticks
    for (let k = Math.floor(bp) - 2; k < bp + 10; k++) { const x = hitX + (k * BEAT - st) * pxPerSec; if (x < -20 || x > VW + 20) continue; c.fillStyle = rgba(PAL.ink, k % 4 === 0 ? 0.35 : 0.15); c.fillRect(x - 1, laneY - B * 0.07, 2, B * 0.14); }
    // stamp ring
    boil(st, 2);
    INK.inkLine(c, INK.ellPts(hitX, laneY, B * 0.062 * (1 + beatK * 0.12), B * 0.062 * (1 + beatK * 0.12), 20, 0.8), 3, PAL.ink, true);
    for (const nt of notes) {
      if (nt.state === 'hit' && st - nt.hitT > 0.3) continue;
      const x = hitX + (nt.time - st) * pxPerSec; if (x > VW + 60 || x < -60) continue;
      const S = SHAPES[nt.shape], sz = B * 0.1, gone = nt.state === 'hit' ? clamp((st - nt.hitT) / 0.3) : 0;
      c.save(); c.globalAlpha = nt.state === 'miss' ? 0.3 : 1 - gone; c.translate(x, laneY - gone * 40); c.scale(1 + gone * 0.4, 1 + gone * 0.4);
      boil(st, nt.beat);
      INK.blob(c, INK.rectPts(-sz / 2, -sz / 2, sz, sz, 1.2), { wash: '#fff', ink: PAL.ink, sw: 2, smooth: false });
      drawGlyph(c, nt.shape, 0, 0, sz * 0.68, S.col, 0.12);
      c.restore();
    }
    // next-card hint big at the top
    const next = notes.find((nt) => nt.state === 'wait');
    if (next && next.time - st < BEAT * 3) { const k = clamp(1 - (next.time - st) / (BEAT * 3)); c.save(); c.globalAlpha = 0.14 + k * 0.2; drawGlyph(c, next.shape, VW / 2, VH * 0.46, B * 0.45, SHAPES[next.shape].col, 0.035); c.restore(); }
    // Clawd dances
    const since = st - dance.t, dancing = since < BEAT * 2 && dance.move !== 'idle';
    const phase = ((bp % 1) + 1) % 1;
    const key = dancing ? `dance-${dance.move}` : st - moodT < 1.2 && mood !== 'neutral' ? `mood-${mood}` : 'dance-idle';
    ClawdSprites.draw(c, ClawdSprites.has(key) ? key : 'dance-idle', cx, cy + B * 0.16, B * 0.3, key.startsWith('dance') ? phase * 8 / 12 : st, { sq: -beatK * 0.03 });
    // judged strokes fade where they were drawn
    for (const j of judged) { const k = (st - j.t) / 0.6; if (k > 1) continue; c.save(); c.globalAlpha = 1 - k; boil(st, 9); INK.inkLine(c, j.pts, 4, j.grade === 'wrong' ? '#aaa' : j.col); c.restore(); INK.text(c, { perfect: L('완벽!', 'PERFECT'), good: L('좋아!', 'GOOD'), late: L('아슬', 'LATE'), wrong: L('다른 모양', 'WRONG') }[j.grade], j.x, j.y - 30 - k * 30, B * 0.05, { perfect: PAL.ochre, good: PAL.sap, late: PAL.sky, wrong: '#999' }[j.grade], { font: '"Permanent Marker", "Gaegu"', weight: 400, alpha: 1 - k }); }
    judged = judged.filter((j) => st - j.t < 0.6);
    for (const f of floats) { const k = (st - f.t) / 1.1; if (k > 1) continue; INK.text(c, f.s, f.x, f.y - k * 30, B * 0.045 * f.scale, f.col, { alpha: 1 - k, font: f.scale > 1 ? '"Permanent Marker", "Gaegu"' : undefined, weight: f.scale > 1 ? 400 : 700 }); }
    floats = floats.filter((f) => st - f.t < 1.1);
    // live stroke
    if (stroke && stroke.pts.length > 1) { boil(st, 5); const g = stroke.pts.length > 6 ? Gesture.classify(stroke.pts) : null; INK.inkLine(c, stroke.pts, B * 0.008, g && SHAPES[g.shape] ? SHAPES[g.shape].col : PAL.ink); }
    // HUD
    INK.text(c, `${score}`, VW - 20, 36, B * 0.06, PAL.clay, { align: 'right', font: '"Permanent Marker"', weight: 400 });
    if (combo > 1) INK.text(c, `${combo} ${L('콤보', 'combo')}`, VW - 20, 36 + B * 0.055, B * 0.04, fever >= 1 ? PAL.ochre : PAL.ink, { align: 'right' });
    const fw = Math.min(260, VW * 0.4); c.fillStyle = rgba(PAL.ink, 0.2); c.fillRect(20, 24, fw, 12); c.fillStyle = fever >= 1 ? PAL.ochre : PAL.rose; c.fillRect(20, 24, fw * fever, 12); boil(st, 3); INK.inkLine(c, INK.rectPts(20, 24, fw, 12, 0.5), 1.4, PAL.ink, true);
    INK.text(c, song.name, 20, 54, B * 0.032, PAL.ink, { align: 'left', shadow: false });
    // progress
    const total = song.bars * 4 * BEAT; c.fillStyle = rgba(PAL.ink, 0.25); c.fillRect(0, VH - 4, VW * clamp(st / total), 4);
    if (st < 4 * BEAT) INK.text(c, `${4 - Math.floor(st / BEAT)}`, VW / 2, VH * 0.22, B * 0.12 * (1 + beatK * 0.2), PAL.clay, { font: '"Permanent Marker"', weight: 400 });
    c.globalCompositeOperation = 'multiply'; c.drawImage(grainC, 0, 0, VW, VH); c.globalCompositeOperation = 'source-over';
  }

  function tick() {
    const st = songTime();
    scheduleMusic();
    // cards that passed their window without a stroke are misses
    for (const n of notes) if (n.state === 'wait' && st - n.time > WIN.late) { n.state = 'miss'; combo = 0; fever = Math.max(0, fever - 0.2); stats.miss++; setMood('sad'); }
    if (fever >= 1 && st - feverOn > BEAT * 16) { fever = 0; feverOn = 0; }
    if (st > song.bars * 4 * BEAT + BEAT * 2) finish();
  }

  let raf = 0;
  function frame() {
    if (mode === 'play') { tick(); render(); }
    for (const tc of document.querySelectorAll('.clawd-portrait')) { if (!tc.offsetParent) continue; const g = tc.getContext('2d'); g.clearRect(0, 0, tc.width, tc.height); ClawdSprites.draw(g, portrait, tc.width / 2, tc.height * 0.93, tc.width * 0.42, performance.now() / 1000 * 0.9 % 10); }
    raf = requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------ flow */
  let portrait = 'title';
  function show(id) { for (const s of ['loading', 'title', 'msg']) $(s).hidden = s !== id; document.body.classList.toggle('menu', !!id); }
  function start(i) {
    songIdx = i; song = SONGS[i]; notes = makeChart(song); score = 0; combo = 0; maxCombo = 0; fever = 0; feverOn = 0; judged = []; floats = [];
    stats = { perfect: 0, good: 0, late: 0, miss: 0 }; dance = { move: 'idle', t: -9 };
    SFX.music(false);
    t0 = now() + 0.3; schedAt = 0;
    mode = 'play'; show(null);
  }
  function finish() {
    mode = 'over';
    const total = notes.length, acc = Math.round((stats.perfect + stats.good * 0.6 + stats.late * 0.3) / total * 100);
    const rank = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
    const b = best[song.name] || 0; if (score > b) { best[song.name] = score; try { localStorage.setItem('inkbeat.best', JSON.stringify(best)); } catch {} }
    const good = ['S', 'A', 'B'].includes(rank);
    portrait = good ? 'mood-starstruck' : 'mood-sad';
    $('msg-title').textContent = `${L('등급', 'Rank')} ${rank} · ${score}`;
    $('msg-text').innerHTML = `${L('완벽', 'Perfect')} ${stats.perfect} · ${L('좋아', 'Good')} ${stats.good} · ${L('아슬', 'Late')} ${stats.late} · ${L('놓침', 'Miss')} ${stats.miss}<br>${L('최대 콤보', 'Max combo')} ${maxCombo} · ${L('정확도', 'Accuracy')} ${acc}%${score > b ? ' · ' + L('신기록!', 'New best!') : ''}`;
    const row = $('msg-buttons'); row.innerHTML = '';
    const mk = (label, fn, alt) => { const bt = document.createElement('button'); bt.className = 'big' + (alt ? ' alt' : ''); bt.textContent = label; bt.onclick = () => { SFX.play('card'); fn(); }; row.append(bt); };
    mk(L('다시', 'Again'), () => start(songIdx)); if (songIdx < SONGS.length - 1) mk(L('다음 곡', 'Next song'), () => start(songIdx + 1), true); mk(L('곡 선택', 'Songs'), titleScreen, true);
    SFX.play(good ? 'win' : 'lose');
    show('msg');
  }
  function quit() { mode = 'title'; titleScreen(); }
  function titleScreen() {
    mode = 'title'; portrait = 'dance-bounce'; show('title');
    const box = $('songs'); box.innerHTML = '';
    SONGS.forEach((s, i) => { const b = document.createElement('button'); b.innerHTML = `<b>${i + 1}</b>${s.name}<small>${s.shapes.length} ${L('도형', 'shapes')} · ${best[s.name] ? L('최고 ', 'best ') + best[s.name] : L('처음', 'new')}</small>`; b.onclick = () => { SFX.unlock(); start(i); }; box.append(b); });
    const leg = $('legend'); leg.innerHTML = '';
    for (const [k, S] of Object.entries(SHAPES)) { const li = document.createElement('li'), kc = document.createElement('canvas'); kc.width = 90; kc.height = 70; const g = kc.getContext('2d'); g.scale(2, 2); boil(0, k.length); drawGlyph(g, k, 22, 17, 24, S.col, 0.1); li.append(kc); li.insertAdjacentHTML('beforeend', `<span>${S.name}</span>`); leg.append(li); }
  }

  async function boot() {
    show('loading'); $('load-text').textContent = L('춤 동작을 그리는 중…', 'Painting the dance moves…');
    const specs = [];
    // one beat of each dance, 8 drawings, baked from the base's beat-locked move()
    for (const mv of ['idle', 'bounce', 'wave', 'spin', 'shimmy', 'hop', 'stomp', 'roof']) specs.push({ key: `dance-${mv}`, emotion: mv === 'idle' ? 'happy' : 'excited', frames: 8, pose: (t, f) => ({ ...move(mv, ((mv === 'spin' ? 3 : 0) + f / 8) * BEAT), emote: null }), over: { emote: null } });
    for (const m of ['excited', 'starstruck', 'happy', 'confused', 'sad']) specs.push({ key: `mood-${m}`, emotion: m, frames: 4 });
    await ClawdSprites.bake(specs, (k) => { $('load-bar').style.width = Math.round(k * 100) + '%'; });
    titleScreen();
  }
  boot();
  window.__beat = { get mode() { return mode; }, get notes() { return notes; }, start, songTime, judgeAt: (shape, at) => judge({ shape }, at, [[VW / 2, VH / 2], [VW / 2 + 10, VH / 2]]), get score() { return score; }, get stats() { return stats; } };
})();
