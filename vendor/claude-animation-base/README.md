# Vendored: Claude Animation Base

`core.js` and `clawd.js` are from [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)
(MIT, see `LICENSE`; upstream commit in `UPSTREAM_COMMIT`). They paint Clawd in watercolour and ink with p5.js + p5.brush.

`clawd.js` is unchanged. `core.js` has two small changes, each marked `[claude-charm]`:
the canvas size is read from `PROJECT.w` / `PROJECT.h`, and the studio scrubber UI only starts when its element exists.
