// ink.js — a small painterly kit for Canvas2D games, in the look of the Claude Animation Base: warm paper, flat
// washes with a darker rim, and hand-inked lines that "boil" (re-jitter 12x a second) like drawn animation.
// Everything here is cheap enough for 60 fps; the expensive p5.brush painting is only used to bake Clawd.

(function (root) {
  const PAL = {
    paper: '#F3EBDC', ink: '#2B2233', clay: '#D97757', clayDk: '#A84D33', clayLt: '#F2A283',
    night: '#1F2550', indigo: '#2F3C7A', rose: '#E27A92', ochre: '#E8AA38', sap: '#6E9F58',
    teal: '#3A9C98', violet: '#7B5CA8', cream: '#FFF5E2', sky: '#8EC3E6', red: '#D8394E',
  };
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const backOut = (x) => { x = clamp(x); const s = 1.9; return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2; };
  function mix(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), c = (i) => Math.round(lerp((pa >> i) & 255, (pb >> i) & 255, clamp(k)));
    return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

  // Seeded jitter. boil(t, key) restarts the stream for one element on one drawing (12 per second), so things
  // that don't move redraw identically between boils and everything re-jitters together on the boil.
  let seed = 1;
  function boil(t, key = 0) { let h = 2166136261 ^ Math.floor(t * 12); h = Math.imul(h ^ (key * 2654435761 >>> 0), 16777619); seed = (h >>> 0) || 1; }
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const jit = (a) => (rnd() * 2 - 1) * a;
  const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function path(c, pts, closed = true, smooth = false) {
    c.beginPath();
    if (!smooth || pts.length < 3) { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); if (closed) c.closePath(); return; }
    const n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      let q = m(pts[n - 1], pts[0]); c.moveTo(q[0], q[1]);
      for (let i = 0; i < n; i++) { const p = pts[i]; q = m(p, pts[(i + 1) % n]); c.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
      c.closePath();
    } else {
      c.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) { const q = m(pts[i], pts[i + 1]); c.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]); }
      c.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }

  // An inked outline: short strokes of wobbling weight plus a faint dry pass, round caps hide the joins.
  function inkLine(c, pts, sw = 2, col = PAL.ink, closed = false, alpha = 1) {
    const n = pts.length; if (n < 2) return;
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col;
    const segs = closed ? n : n - 1, ph = rnd() * 9;
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const taper = closed ? 1 : Math.min(1, (i + 0.7) / 2.5, (segs - i + 0.3) / 2.5);
      c.globalAlpha = 0.92 * alpha;
      c.lineWidth = Math.max(0.5, sw * (0.8 + 0.3 * Math.sin(i * 1.7 + ph)) * (0.5 + 0.5 * taper));
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
    }
    c.globalAlpha = 0.3 * alpha; c.lineWidth = Math.max(0.4, sw * 0.35);
    c.beginPath();
    for (let i = 0; i <= segs; i++) { const p = pts[i % n]; const x = p[0] + jit(sw * 0.5), y = p[1] + jit(sw * 0.5); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke(); c.restore();
  }

  // A painted shape: wash, darker rim where pigment pools, optional light pool, then ink.
  function blob(c, pts, o = {}) {
    c.save();
    path(c, pts, true, o.smooth !== false);
    if (o.wash) {
      c.globalAlpha = o.washOp ?? 1; c.fillStyle = o.wash; c.fill();
      if (o.rim !== false) { c.clip(); c.globalAlpha = 0.3 * (o.washOp ?? 1); c.strokeStyle = o.rimCol || mix(o.wash, PAL.ink, 0.35); c.lineWidth = o.rimW || 5; c.stroke(); }
      if (o.pool) {
        const [px, py, pr] = o.pool; const g = c.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, rgba(o.poolCol || '#ffffff', 0.45)); g.addColorStop(1, rgba(o.poolCol || '#ffffff', 0));
        c.globalAlpha = 1; c.fillStyle = g; c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
      }
    }
    c.restore();
    if (o.ink !== null && o.ink !== undefined) inkLine(c, pts, o.sw || 2, o.ink, true, o.inkOp ?? 1);
  }

  function ellPts(cx, cy, rx, ry, n = 18, j = 0, rot = 0) {
    const p = []; for (let i = 0; i < n; i++) { const a = rot + (i / n) * TAU; p.push([cx + Math.cos(a) * rx + jit(j), cy + Math.sin(a) * ry + jit(j)]); } return p;
  }
  function rectPts(x, y, w, h, j = 0) {
    return [[x + jit(j), y + jit(j)], [x + w / 2 + jit(j), y + jit(j) * 0.5], [x + w + jit(j), y + jit(j)], [x + w + jit(j) * 0.5, y + h / 2],
      [x + w + jit(j), y + h + jit(j)], [x + w / 2 + jit(j), y + h + jit(j) * 0.5], [x + jit(j), y + h + jit(j)], [x + jit(j) * 0.5, y + h / 2]];
  }
  function starPts(cx, cy, r, inner = 0.4, n = 5, rot = -Math.PI / 2) {
    const p = []; for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, q = i % 2 ? r * inner : r; p.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return p;
  }
  function heartPts(cx, cy, r, n = 22) {
    const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; p.push([cx + (16 * Math.sin(a) ** 3 * r) / 16, cy - ((13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * r) / 16]); } return p;
  }
  // A lumpy ink-creature body: radius wobbles by hash so each creature keeps its own silhouette.
  function lumpPts(cx, cy, r, id, n = 14, wob = 0.18, j = 0) {
    const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = 1 + wob * (hash(id * 31 + i) * 2 - 1); p.push([cx + Math.cos(a) * r * k + jit(j), cy + Math.sin(a) * r * k + jit(j)]); } return p;
  }

  // Paper: warm ground, soft stains and fibres; built once per size.
  function paper(w, h, s = 11) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    let q = s; const r = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    c.fillStyle = PAL.paper; c.fillRect(0, 0, w, h);
    const A = w * h / 1e6;
    for (let i = 0; i < 40 * A + 10; i++) {
      const x = r() * w, y = r() * h, rad = (120 + r() * 380) * Math.sqrt(A) * 0.6, a = 0.045 * r();
      const g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(160,125,80,${a})`); g.addColorStop(1, 'rgba(160,125,80,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    c.lineWidth = 1;
    for (let i = 0; i < 700 * A + 100; i++) {
      const x = r() * w, y = r() * h, l = 6 + r() * 26, a = r() * TAU;
      c.strokeStyle = `rgba(110,88,60,${0.035 + r() * 0.06})`;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    return cv;
  }
  // Grain + vignette to multiply over a finished frame.
  function grain(w, h) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d');
    let q = 5; const r = () => ((q = (q * 16807) % 2147483647) / 2147483647);
    const id = c.createImageData(w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = 255 - (r() < 0.55 ? r() * r() * 30 : 0); d[i] = v; d[i + 1] = v - 1; d[i + 2] = v - 3; d[i + 3] = 255; }
    c.putImageData(id, 0, 0);
    const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(120,95,70,.32)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    return cv;
  }

  // Ink splat decal: a blot with droplets thrown outward.
  function splat(c, x, y, r, col, id, alpha = 0.85) {
    c.save(); c.globalAlpha = alpha; c.fillStyle = col;
    path(c, lumpPts(x, y, r, id, 16, 0.35), true, true); c.fill();
    for (let i = 0; i < 9; i++) {
      const a = hash(id * 7 + i) * TAU, d = r * (1.2 + hash(id * 13 + i) * 1.4), s = r * (0.08 + hash(id * 17 + i) * 0.18);
      c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU); c.fill();
    }
    c.restore();
  }

  // Handwritten text with an ink drop shadow.
  function text(c, s, x, y, size, col = PAL.ink, o = {}) {
    c.save(); c.font = `${o.weight || 700} ${size}px ${o.font || '"Gaegu", "Permanent Marker", cursive'}`;
    c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
    if (o.rot) { c.translate(x, y); c.rotate(o.rot); x = 0; y = 0; }
    if (o.scale) { c.translate(x, y); c.scale(o.scale, o.scale); x = 0; y = 0; }
    c.globalAlpha = o.alpha ?? 1;
    if (o.shadow !== false) { c.fillStyle = o.shadowCol || rgba(PAL.ink, 0.85); c.fillText(s, x + size * 0.05, y + size * 0.06); }
    if (o.stroke) { c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = o.stroke; c.strokeText(s, x, y); }
    c.fillStyle = col; c.fillText(s, x, y); c.restore();
  }

  root.INK = { PAL, TAU, clamp, lerp, ease, backOut, mix, rgba, boil, rnd, jit, hash, path, inkLine, blob, ellPts, rectPts, starPts, heartPts, lumpPts, paper, grain, splat, text };
})(window);
