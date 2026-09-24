// clawd-sprites.js — bake the painted Clawd into sprite frames once, then draw them for free.
//
// Clawd is painted by the vendored Claude Animation Base (p5.js + p5.brush, watercolour and ink). A painted frame
// costs 25–50 ms, far too slow for a 60 fps game, but a game only needs a handful of looks. So at load time each
// look (an emotion, a pose, a hat) is painted for a few boil frames on a transparent canvas and kept as images.
// In play they're blitted at 12 drawings a second, the rate the base boils its linework at, so the ink still
// "breathes" like hand-drawn animation.
//
// Needs, before this file: PROJECT = { w, h, bpm }, p5, p5.brush, vendor core.js and clawd.js.
// Usage:
//   await ClawdSprites.ready();
//   await ClawdSprites.bake([{ key: 'idle', emotion: 'neutral', frames: 6 }, { key: 'win', emotion: 'excited', over: { hat: 'crown' } }], onProgress);
//   ClawdSprites.draw(ctx, 'idle', x, y, size, t)   // (x, y) = ground point between the feet; size = on-screen body width

const ClawdSprites = (() => {
  const sheets = {};          // key -> [canvas, ...]
  let job = null;             // what drawWorld paints right now
  let emptyPaper = null;

  function wait() { return new Promise((r) => { const f = () => (window.ready ? r() : setTimeout(f, 30)); f(); }); }

  async function ready() {
    await wait();
    if (!emptyPaper) {
      // no paper and no grain: sprites are painted on transparency and composited onto the game's own ground
      emptyPaper = createGraphics(W, H); emptyPaper.pixelDensity(1); emptyPaper.clear();
      paperG = emptyPaper;
    }
  }

  // Quality: the watercolour fills are almost all of the cost; mid caps their bleed and drops pigment texture.
  function quality(q) {
    const o = quality.orig || (quality.orig = { fill: brush.fill.bind(brush), noFill: brush.noFill.bind(brush), bleed: brush.fillBleed.bind(brush), tex: brush.fillTexture.bind(brush) });
    brush.fill = q === 'lite' ? () => o.noFill() : o.fill;
    brush.fillBleed = q === 'mid' ? (v) => o.bleed(Math.min(v, 0.02)) : o.bleed;
    brush.fillTexture = q === 'mid' ? () => o.tex(0, 0) : o.tex;
  }

  // One spec -> frames. Clawd is drawn at unit u so the body (10u) spans about half the canvas, feet at 82% height.
  async function bakeOne(spec) {
    const frames = [], n = spec.frames || 4, u = W * 0.05;
    for (let f = 0; f < n; f++) {
      const t = (spec.t0 || 0) + f / 12;
      job = () => {
        clear();
        const base = spec.emotion ? feel(spec.emotion, t, { seed: spec.seed || 0 }) : {};
        clawd(W / 2, H * 0.82, u, { ...base, ...(spec.pose ? spec.pose(t, f) : {}), ...(spec.over || {}), boilKey: spec.key });
      };
      T = t;
      await redraw();
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(drawingContext.canvas, 0, 0, W, H);
      frames.push(c);
    }
    job = null;
    sheets[spec.key] = frames;
    return frames;
  }

  async function bake(specs, onProgress, q = 'mid') {
    await ready();
    quality(q);
    for (let i = 0; i < specs.length; i++) {
      if (!sheets[specs[i].key]) await bakeOne(specs[i]);
      onProgress?.((i + 1) / specs.length, specs[i].key);
      await new Promise((r) => setTimeout(r, 0));   // let the page breathe between looks
    }
  }

  // Draw a baked look. size = on-screen body width in px; the frame advances 12x a second.
  function draw(ctx, key, x, y, size, t, o = {}) {
    const fr = sheets[key];
    if (!fr) return;
    const img = fr[Math.floor(t * 12 + (o.phase || 0)) % fr.length];
    const s = size / (W * 0.5);           // body is 10u = W/2 wide in the sprite
    const w = W * s, h = H * s;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale((o.flip ? -1 : 1) * (1 + (o.sq || 0) * 0.6), 1 - (o.sq || 0));
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.drawImage(img, -w / 2, -h * 0.82, w, h);
    ctx.restore();
  }

  const has = (key) => !!sheets[key];
  return { ready, bake, draw, has, sheets, quality, _job: () => job };
})();
window.ClawdSprites = ClawdSprites;

// core.js composites into a canvas#out; the games don't show it, so provide a hidden one.
if (!document.getElementById('out')) {
  const c = document.createElement('canvas'); c.id = 'out'; c.width = W; c.height = H; c.style.display = 'none';
  document.body.append(c);
}
// core.js calls this once per frame; the baker decides what's on it.
function drawWorld(t) { const j = ClawdSprites._job(); if (j) j(); }
