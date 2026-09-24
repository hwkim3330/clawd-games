// input.js — keyboard, gamepad and a touch joystick with A/B buttons, as one small state object.
//   const I = GameInput.create({ buttons: ['a', 'b'] });  I.axis() -> {x, y}; I.down('a'); I.hit('a'); I.endFrame()
(function (root) {
  function create(opt = {}) {
    const down = new Set(), pressed = new Set();
    const map = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      Space: 'a', KeyZ: 'a', KeyJ: 'a', KeyX: 'b', KeyK: 'b', KeyC: 'c', KeyL: 'c', Escape: 'pause', KeyP: 'pause', Enter: 'start', KeyE: 'a', KeyQ: 'b', ...(opt.map || {}) };
    addEventListener('keydown', (e) => { const k = map[e.code]; if (!k) return; if (!down.has(k)) pressed.add(k); down.add(k); if (!['pause'].includes(k) && e.target === document.body) e.preventDefault(); });
    addEventListener('keyup', (e) => { const k = map[e.code]; if (k) down.delete(k); });
    addEventListener('blur', () => down.clear());

    // touch: a floating joystick anywhere on the left half, buttons on the right
    const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    const pad = document.createElement('div'); pad.className = 'gi-pad';
    pad.innerHTML = `<div class="gi-stick"><i></i></div><div class="gi-btns">${(opt.buttons || ['a', 'b']).map((b) => `<button data-k="${b}">${(opt.labels || {})[b] || b.toUpperCase()}</button>`).join('')}</div>`;
    document.body.append(pad);
    const knob = pad.querySelector('.gi-stick'), dot = knob.querySelector('i');
    const btnTouches = new Map();
    pad.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-k]');
      pad.setPointerCapture(e.pointerId); e.preventDefault();
      if (b) { btnTouches.set(e.pointerId, b.dataset.k); if (!down.has(b.dataset.k)) pressed.add(b.dataset.k); down.add(b.dataset.k); b.classList.add('on'); return; }
      if (e.clientX < innerWidth * 0.55 && stick.id == null) { stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0; knob.style.left = e.clientX + 'px'; knob.style.top = e.clientY + 'px'; knob.classList.add('on'); }
    });
    pad.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stick.id) return;
      const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, d = Math.hypot(dx, dy), m = 48, k = Math.min(1, d / m);
      stick.x = d ? (dx / d) * k : 0; stick.y = d ? (dy / d) * k : 0;
      dot.style.transform = `translate(${stick.x * m}px, ${stick.y * m}px)`;
    });
    const up = (e) => {
      if (e.pointerId === stick.id) { stick.id = null; stick.x = stick.y = 0; dot.style.transform = ''; knob.classList.remove('on'); }
      const k = btnTouches.get(e.pointerId); if (k) { down.delete(k); btnTouches.delete(e.pointerId); pad.querySelector(`[data-k="${k}"]`)?.classList.remove('on'); }
    };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && opt.touch !== false) pad.classList.add('show');

    const gpOwned = new Set();
    function poll() {
      const gp = navigator.getGamepads?.()[0]; if (!gp) return;
      const set = (k, v) => { if (v && !down.has(k)) { pressed.add(k); down.add(k); gpOwned.add(k); } else if (!v && gpOwned.has(k)) { down.delete(k); gpOwned.delete(k); } };
      set('a', gp.buttons[0]?.pressed); set('b', gp.buttons[2]?.pressed || gp.buttons[1]?.pressed); set('c', gp.buttons[3]?.pressed); set('pause', gp.buttons[9]?.pressed);
      I.gp = { x: Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0, y: Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0 };
      if (gp.buttons[14]?.pressed) I.gp.x = -1; if (gp.buttons[15]?.pressed) I.gp.x = 1; if (gp.buttons[12]?.pressed) I.gp.y = -1; if (gp.buttons[13]?.pressed) I.gp.y = 1;
    }
    const I = {
      pad, touch, gp: { x: 0, y: 0 }, poll,
      down: (k) => down.has(k), hit: (k) => pressed.has(k), endFrame: () => pressed.clear(), consume: (k) => pressed.delete(k),
      axis() {
        let x = (down.has('right') ? 1 : 0) - (down.has('left') ? 1 : 0) + stick.x + I.gp.x;
        let y = (down.has('down') ? 1 : 0) - (down.has('up') ? 1 : 0) + stick.y + I.gp.y;
        const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
        return { x, y };
      },
    };
    return I;
  }
  root.GameInput = { create };
})(window);
