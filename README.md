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
| [Clawd's Quest](games/clawd-quest/) · 클로의 모험 | top-down adventure | 3×3 overworld + dungeon: cut bushes, key → locked door → bombs → cracked wall → Ink Kraken; autosave |
| [Ink Wars](games/ink-wars/) · 잉크 전쟁 | real-time strategy | gather ink & paper, build HQ / barracks / houses / towers, A* pathing, fog of war, minimap, 3 AI levels, touch controls |
| [Ink Lane](games/ink-lane/) · 잉크 라인 | 3v3 battle arena | three heroes with Q W E R (skillshots, dashes, traps, ultimates), minion waves, towers in order, core, levels, AI allies & foes |
| [Ink Realms](games/ink-realms/) · 잉크 왕국 | 3D online-RPG style | Three.js paper diorama with painted cut-outs; village quest chain, tab-target combat, 1–4 action bar, levels, loot, raid boss |
| [Ink Beat](games/ink-beat/) · 잉크 비트 | draw-to-the-beat rhythm | a new mash-up: draw the shape as its beat lands (judged on the WebAudio clock at pen-up); each shape is a dance move |
| [Clawd Leap](games/clawd-leap/) · 클로 점프 | platformer | four painted pages, stamp boxes, an ink-throwing hat, the Great Eraser; coyote time + jump buffer |

## Trailer

[`media/trailer.mp4`](media/trailer.mp4) is *Clawd and the Hat Box*, a 16-second film painted frame by frame with Claude Animation Base.
The storyboard is in [`video/STORYBOARD.md`](video/STORYBOARD.md), the scene in [`video/src/scenes/trailer.js`](video/src/scenes/trailer.js), and the
soundtrack is synthesised. To re-render: `cd video && npm install && node render.mjs --gpu-angle=vulkan --frames --workers=4 && node render.mjs --encode --audio=assets/trailer.wav --out=out/trailer.mp4`.

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
