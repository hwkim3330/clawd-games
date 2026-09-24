// levelkit.js — build tile maps with a few calls instead of hand-aligned ASCII rows.
//   LevelKit.build(width, (A) => { A.ground(0, 40); A.set(3, 12, '@'); ... }, { height: 15, top: 13 })
(function (root) {
  function build(w, fn, o = {}) {
    const H = o.height || 15, TOP = o.top || 13;
    const g = Array.from({ length: H }, () => Array(w).fill(' '));
    const set = (x, y, ch) => { if (x >= 0 && x < w && y >= 0 && y < H) g[y][x] = ch; };
    const A = {
      w, H, TOP, set,
      fill(x0, y0, x1, y1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, ch); },
      ground(x0, x1, top = TOP, soil = '#', dirt = 'D') { for (let x = x0; x <= x1; x++) { set(x, top, soil); for (let y = top + 1; y < H; y++) set(x, y, dirt); } },
      column(x, h, top = TOP, ch = 'X') { for (let y = top - h; y < top; y++) set(x, y, ch); },
      stairs(x, n, dir = 1, top = TOP, ch = 'X') { for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) set(x + (dir > 0 ? i : n - 1 - i), top - 1 - k, ch); },
      row(x, y, s) { [...s].forEach((ch, i) => { if (ch !== ' ') set(x + i, y, ch); }); },
      coins(x, y, n, ch = 'o') { for (let i = 0; i < n; i++) set(x + i, y, ch); },
      arc(x, y, n, ch = 'o') { for (let i = 0; i < n; i++) set(x + i, y - Math.round(Math.sin((i / (n - 1)) * Math.PI) * 2), ch); },
    };
    fn(A);
    return g.map((r) => r.join(''));
  }
  root.LevelKit = { build };
})(window);
