// sfx.js — every sound is synthesised with WebAudio: no files to download, nothing to license.
// SFX.play('slash'); SFX.scribble(speed) while drawing; SFX.music(true) for a soft generative loop.

(function (root) {
  let ac = null, master = null, musicGain = null, noiseBuf = null, on = true, musicOn = false, musicTimer = 0;
  try { on = localStorage.getItem('clawd.sound') !== 'off'; } catch {}

  function ctx() {
    if (!ac) {
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = on ? 0.8 : 0; master.connect(ac.destination);
      musicGain = ac.createGain(); musicGain.gain.value = 0.22; musicGain.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function tone(f, dur, { type = 'sine', vol = 0.3, slide = 0, delay = 0, attack = 0.005, out } = {}) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(out || master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { vol = 0.3, f = 2000, q = 1, type = 'bandpass', slide = 0, delay = 0 } = {}) {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, s = a.createBufferSource(), bf = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf; s.loop = true; bf.type = type; bf.frequency.setValueAtTime(f, t); bf.Q.value = q;
    if (slide) bf.frequency.exponentialRampToValueAtTime(Math.max(40, f * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(bf).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const S = {
    slash: () => { noise(0.18, { f: 3000, slide: 0.3, vol: 0.4, q: 2 }); tone(900, 0.12, { type: 'triangle', slide: 0.4, vol: 0.12 }); },
    shield: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.5, { type: 'sine', vol: 0.12, delay: i * 0.05 })); },
    zap: () => { for (let i = 0; i < 5; i++) tone(200 + Math.random() * 1400, 0.08, { type: 'square', vol: 0.08, delay: i * 0.03, slide: 0.5 }); noise(0.3, { f: 5000, vol: 0.2, q: 0.7 }); },
    boom: () => { noise(0.6, { f: 800, slide: 0.15, vol: 0.6, type: 'lowpass' }); tone(110, 0.5, { type: 'sine', slide: 0.4, vol: 0.4 }); },
    vortex: () => { tone(180, 1.2, { type: 'sawtooth', slide: 2.5, vol: 0.06 }); noise(1.2, { f: 400, slide: 4, vol: 0.12, q: 4 }); },
    turret: () => { tone(330, 0.12, { type: 'square', vol: 0.1 }); tone(495, 0.18, { type: 'square', vol: 0.1, delay: 0.08 }); },
    wall: () => { noise(0.25, { f: 300, vol: 0.3, type: 'lowpass' }); },
    fizzle: () => { tone(300, 0.2, { type: 'triangle', slide: 0.5, vol: 0.12 }); },
    pew: () => { tone(880, 0.08, { type: 'square', slide: 0.5, vol: 0.05 }); },
    hit: () => { noise(0.08, { f: 1200, vol: 0.25 }); tone(220, 0.06, { type: 'square', vol: 0.06 }); },
    splat: () => { noise(0.22, { f: 500, slide: 0.4, vol: 0.35, type: 'lowpass' }); tone(160 + Math.random() * 80, 0.12, { type: 'sine', slide: 0.5, vol: 0.2 }); },
    hurt: () => { tone(300, 0.3, { type: 'sawtooth', slide: 0.5, vol: 0.2 }); noise(0.2, { f: 600, vol: 0.3 }); },
    heal: () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.14, delay: i * 0.07 })); },
    wave: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.14, delay: i * 0.09 })); },
    card: () => { tone(740, 0.1, { type: 'triangle', vol: 0.12 }); tone(1110, 0.2, { type: 'triangle', vol: 0.12, delay: 0.06 }); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.45, { type: 'triangle', vol: 0.15, delay: i * 0.18 })); },
    win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.15, delay: i * 0.11 })); },
    coin: () => { tone(988, 0.07, { type: 'square', vol: 0.08 }); tone(1319, 0.25, { type: 'square', vol: 0.08, delay: 0.07 }); },
    jump: () => { tone(300, 0.18, { type: 'square', slide: 2.2, vol: 0.08 }); },
    click: () => { tone(1200, 0.03, { type: 'square', vol: 0.05 }); },
  };

  let scribbleG = null, scribbleSrc = null;
  function scribble(speed) {   // pen-on-paper hiss that follows drawing speed (px/s); 0 stops it
    const a = ctx(); if (!a) return;
    if (!scribbleG) {
      scribbleSrc = a.createBufferSource(); scribbleSrc.buffer = noiseBuf; scribbleSrc.loop = true;
      const bf = a.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 2400; bf.Q.value = 0.8;
      scribbleG = a.createGain(); scribbleG.gain.value = 0;
      scribbleSrc.connect(bf).connect(scribbleG).connect(master); scribbleSrc.start();
    }
    scribbleG.gain.setTargetAtTime(Math.min(0.18, speed / 5000), a.currentTime, 0.03);
  }

  // Music: a gentle pentatonic pluck pattern with a soft bass, re-rolled every 4 bars.
  function music(v) {
    musicOn = v;
    clearInterval(musicTimer);
    if (!v) return;
    const a = ctx(); if (!a) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16], root0 = 220, bpm = 100, step = 60 / bpm / 2;
    let i = 0, pat = [];
    const roll = () => { pat = Array.from({ length: 16 }, () => (Math.random() < 0.62 ? scale[Math.floor(Math.random() * scale.length)] : null)); };
    roll();
    musicTimer = setInterval(() => {
      if (!on) return;
      const n = pat[i % 16];
      if (n != null) tone(root0 * Math.pow(2, n / 12), 0.5, { type: 'triangle', vol: 0.5, out: musicGain });
      if (i % 8 === 0) tone(root0 / 2 * Math.pow(2, [0, 5, 7, 3][(i / 8) % 4 | 0] / 12), 1.4, { type: 'sine', vol: 0.7, out: musicGain });
      i++; if (i % 64 === 0) roll();
    }, step * 1000);
  }

  function setOn(v) {
    on = v; try { localStorage.setItem('clawd.sound', v ? 'on' : 'off'); } catch {}
    if (master) master.gain.value = v ? 0.8 : 0;
  }

  root.SFX = { play: (k) => on && S[k] && S[k](), tone, noise, scribble, music, setOn, get on() { return on; }, unlock: ctx };
})(window);
