// gesture.js — what did you just draw? Classifies one stroke into a spell shape from its geometry.
//
//   line     nearly straight
//   circle   closed, one full turn, no sharp corners
//   triangle closed, one full turn, three corners
//   square   closed, one full turn, four corners
//   zigzag   open, several sharp corners that alternate direction
//   spiral   more than ~1.5 turns
//   scribble anything else (the game turns it into an ink wall)
//
// Features (all scale-free): straightness = chord / length, closure = end gap / size, winding = total signed
// turning in turns, corners = sharp local turns found on a resampled path. Works for mouse, touch and pen.

(function (root) {
  function resample(pts, n) {
    const out = [pts[0]];
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const step = L / (n - 1); if (!(step > 0)) return null;
    let acc = 0, prev = pts[0];
    for (let i = 1; i < pts.length; i++) {
      let cur = pts[i], d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      while (acc + d >= step && d > 0) {
        const k = (step - acc) / d, q = [prev[0] + (cur[0] - prev[0]) * k, prev[1] + (cur[1] - prev[1]) * k];
        out.push(q); prev = q; d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]); acc = 0;
      }
      acc += d; prev = cur;
    }
    while (out.length < n) out.push(pts[pts.length - 1]);
    return { pts: out.slice(0, n), length: L };
  }

  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  function classify(raw) {
    if (!raw || raw.length < 4) return { shape: 'dot' };
    const r = resample(raw, 96); if (!r) return { shape: 'dot' };
    const P = r.pts, L = r.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
    for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); cx += x; cy += y; }
    cx /= P.length; cy /= P.length;
    const size = Math.max(x1 - x0, y1 - y0, 1), diag = Math.hypot(x1 - x0, y1 - y0);
    const chord = Math.hypot(P[P.length - 1][0] - P[0][0], P[P.length - 1][1] - P[0][1]);
    const straight = chord / L, closure = chord / size;
    const info = { cx, cy, size, length: L, bbox: [x0, y0, x1, y1], start: P[0], end: P[P.length - 1], pts: P };
    if (L < 24) return { shape: 'dot', ...info };
    if (straight > 0.92) return { shape: 'line', ...info };

    // headings along the path (skip 2 points to smooth jitter), then signed turning between them
    const H = []; for (let i = 0; i + 2 < P.length; i += 2) H.push(Math.atan2(P[i + 2][1] - P[i][1], P[i + 2][0] - P[i][0]));
    const T = []; for (let i = 1; i < H.length; i++) T.push(angDiff(H[i - 1], H[i]));
    const winding = T.reduce((a, b) => a + b, 0) / (2 * Math.PI);
    // corners: windows of 3 turning steps that together turn more than ~55°
    const corners = [];
    for (let i = 1; i + 1 < T.length; i++) {
      const w = T[i - 1] + T[i] + T[i + 1];
      if (Math.abs(w) > 1.2 && Math.abs(T[i]) >= Math.abs(T[i - 1]) && Math.abs(T[i]) >= Math.abs(T[i + 1])) {
        if (!corners.length || i - corners[corners.length - 1].i > 2) corners.push({ i, sign: Math.sign(w) });
      }
    }
    const closed = closure < 0.3;
    const aw = Math.abs(winding);
    info.winding = winding; info.corners = corners.length;

    if (aw > 1.45) return { shape: 'spiral', ...info };
    if (closed && aw > 0.55) {
      // corners away from the ends, plus the join where the stroke closes (the pen turns from its last heading
      // back into its first); a smooth circle has neither
      const inner = corners.filter((c) => c.i > 2 && c.i < T.length - 3).length;
      const join = Math.abs(angDiff(H[H.length - 2], H[1])) > 1.2 ? 1 : 0;
      const n = inner + join;
      if (n <= 1) return { shape: 'circle', ...info, r: (x1 - x0 + y1 - y0) / 4 };
      if (n <= 3) return { shape: 'triangle', ...info };
      if (n <= 5) return { shape: 'square', ...info };
      return { shape: 'circle', ...info, r: (x1 - x0 + y1 - y0) / 4 };
    }
    if (!closed && corners.length >= 2) {
      let alt = 0; for (let i = 1; i < corners.length; i++) if (corners[i].sign !== corners[i - 1].sign) alt++;
      if (alt >= Math.max(1, corners.length - 2) && straight > 0.25) return { shape: 'zigzag', ...info };
    }
    return { shape: 'scribble', ...info };
  }

  // Spread of distances to the centre, relative: ~0 for a circle, ~0.2 for a square, ~0.3+ for a triangle.
  function roundness(P, cx, cy) {
    const d = P.map(([x, y]) => Math.hypot(x - cx, y - cy));
    const m = d.reduce((a, b) => a + b, 0) / d.length;
    const v = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length);
    return v / m;
  }

  const api = { classify, resample };
  if (typeof module !== 'undefined') module.exports = api; else root.Gesture = api;
})(typeof window !== 'undefined' ? window : globalThis);
