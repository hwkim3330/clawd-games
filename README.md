---
title: Clawd Arcade
emoji: 🖋️
colorFrom: red
colorTo: yellow
sdk: static
pinned: false
license: mit
short_description: Original browser games starring a hand-painted Clawd
---

# Clawd Arcade

These are original browser games starring Clawd, painted in watercolour and ink. Every game is a static page with no build step and no server.

**Play:** [GitHub Pages](https://hwkim3330.github.io/clawd-games/) · [Hugging Face Space](https://huggingface.co/spaces/kimhyunwoo/clawd-games)

| game | genre | what's special |
|---|---|---|
| [Ink Spell](games/ink-spell/) · 잉크 주문 | drawing · wave defense | the shape you draw is the spell: line/circle/zigzag/triangle/spiral/square, anything else becomes a wall |
| [Clawd Gulp](games/clawd-gulp/) · 클로 꿀꺽 | copy-ability platformer | Clawd's lunchbox lid opens to inhale; swallow to copy fire / spark / pencil sword; float; the Smudge King |
| [Clawd Leap](games/clawd-leap/) · 클로 점프 | platformer | four painted pages, stamp boxes, an ink-throwing hat, the Great Eraser; coyote time + jump buffer |

## How Clawd is drawn

Clawd, with its 31 emotions, hats and poses, is painted by [Claude Animation Base](https://github.com/JohnHeibel/ClaudeAnimationBase)
(MIT, vendored in `vendor/`) using p5.js and p5.brush. A painted frame costs 25–50 ms, which is too slow for a 60 fps game.
So [`lib/clawd-sprites.js`](lib/clawd-sprites.js) paints each look a game needs once at load time, a few "boil" frames each on
transparency, and the game blits them at 12 drawings a second. That way the ink still boils like hand-drawn animation, and the
game itself costs nothing to draw.

The rest of the world is plain Canvas2D in the same look ([`lib/ink.js`](lib/ink.js)): warm paper, washes with pooled rims
and wobbling ink lines. Sound is synthesised with WebAudio ([`lib/sfx.js`](lib/sfx.js)), so there are no audio files.
[`lib/gesture.js`](lib/gesture.js) classifies a drawn stroke from its geometry (straightness, closure, winding, corners).

## Run locally

```bash
python3 -m http.server 8000   # open http://localhost:8000
```

## License and credits

My code is MIT-licensed. Clawd's painting code is © 2026 John Heibel (MIT, see `vendor/claude-animation-base/LICENSE`).
This is an unofficial fan project and is not affiliated with Anthropic.
