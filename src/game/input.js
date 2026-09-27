// Keyboard, mouse (pointer lock or drag-to-look fallback) and touch controls.

export const IS_TOUCH =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window && navigator.maxTouchPoints > 0) || window.matchMedia?.('(pointer: coarse)').matches);

export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.breakHeld = false;
    this.placeHeld = false;
    this.actions = []; // one-shot actions: 'place', 'pick'
    this.wheel = 0;
    this.locked = false;
    this.everLocked = false;
    this.dragMode = false; // pointer lock unavailable -> drag to look
    this.enabled = false; // only capture gameplay input while playing
    this.sensitivity = 1;
    this.touch = IS_TOUCH;
    this.touchMove = { x: 0, y: 0 };
    this.touchJump = false;
    this.touchDown = false;
    this.onKey = null; // (code, event) => void
    this.onLockChange = null; // (locked) => void
    this.lastSpace = 0;
    this.onDoubleJump = null;
    this.lastW = 0;
    this.sprintLatch = false;

    this._bindKeyboard();
    this._bindMouse();
    if (this.touch) this._bindTouch(touchRoot);
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const first = !this.keys.has(e.code);
      this.keys.add(e.code);
      if (first && this.enabled) {
        const now = performance.now();
        if (e.code === 'Space') {
          if (now - this.lastSpace < 280 && this.onDoubleJump) this.onDoubleJump();
          this.lastSpace = now;
        }
        if (e.code === 'KeyW' || e.code === 'ArrowUp') {
          if (now - this.lastW < 280) this.sprintLatch = true;
          this.lastW = now;
        }
      }
      if (this.onKey) this.onKey(e.code, e, first);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (this.enabled && (e.code === 'F3' || (e.ctrlKey && ['KeyW', 'KeyS', 'KeyD'].includes(e.code)))) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.sprintLatch = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.breakHeld = false;
      this.placeHeld = false;
      this.sprintLatch = false;
    });
  }

  _bindMouse() {
    const c = this.canvas;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      if (this.locked) this.everLocked = true;
      if (!this.locked) {
        this.breakHeld = false;
        this.placeHeld = false;
      }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this._lockFailed());

    let dragStart = null;
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (!this.locked && !this.dragMode) return;
      if (e.button === 0) {
        this.breakHeld = true;
        dragStart = { x: e.clientX, y: e.clientY, moved: false };
      } else if (e.button === 2) {
        this.placeHeld = true;
        this.actions.push('place');
      } else if (e.button === 1) {
        this.actions.push('pick');
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.breakHeld = false;
        dragStart = null;
      } else if (e.button === 2) this.placeHeld = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.touch) return;
      if (this.locked) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      } else if (this.dragMode && dragStart) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
        if (Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 6) {
          dragStart.moved = true;
          this.breakHeld = false; // it's a drag, not a mining click
        }
      }
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
  }

  _lockFailed() {
    if (this.locked) return;
    if (this.everLocked) {
      // Usually the browser's short cooldown after Esc: ask for another click.
      if (this.onLockChange) this.onLockChange(false, 'retry');
      return;
    }
    // Sandboxed frames and some browsers refuse pointer lock: fall back to drag-to-look.
    this.dragMode = true;
    if (this.onLockChange) this.onLockChange(false, 'unsupported');
  }

  requestLock() {
    if (this.touch || this.dragMode || this.locked) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => this._lockFailed());
    } catch {
      this._lockFailed();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _bindTouch(root) {
    root.classList.add('active');
    const stick = root.querySelector('.stick');
    const knob = root.querySelector('.knob');
    const jump = root.querySelector('[data-touch="jump"]');
    const down = root.querySelector('[data-touch="down"]');
    const RADIUS = 56;
    let moveId = null;
    let moveOrigin = null;
    let lookId = null;
    let lookLast = null;
    let lookStart = null;
    let holdTimer = null;
    let lastJump = 0;

    const button = (el, prop) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        this[prop] = true;
        if (prop === 'touchJump') {
          const now = performance.now();
          if (now - lastJump < 300 && this.onDoubleJump) this.onDoubleJump();
          lastJump = now;
        }
      });
      const up = (e) => {
        e.preventDefault();
        this[prop] = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    };
    button(jump, 'touchJump');
    button(down, 'touchDown');

    root.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.target !== root) return;
      e.preventDefault();
      root.setPointerCapture(e.pointerId);
      if (e.clientX < window.innerWidth * 0.4 && moveId === null) {
        moveId = e.pointerId;
        moveOrigin = { x: e.clientX, y: e.clientY };
        stick.style.left = `${e.clientX}px`;
        stick.style.top = `${e.clientY}px`;
        stick.classList.add('shown');
        knob.style.transform = 'translate(-50%, -50%)';
      } else if (lookId === null) {
        lookId = e.pointerId;
        lookLast = { x: e.clientX, y: e.clientY };
        lookStart = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => {
          if (lookStart && !lookStart.moved) this.breakHeld = true;
        }, 280);
      }
    });
    root.addEventListener('pointermove', (e) => {
      if (e.pointerId === moveId) {
        let dx = e.clientX - moveOrigin.x;
        let dy = e.clientY - moveOrigin.y;
        const l = Math.hypot(dx, dy);
        if (l > RADIUS) {
          dx = (dx / l) * RADIUS;
          dy = (dy / l) * RADIUS;
        }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.touchMove.x = dx / RADIUS;
        this.touchMove.y = dy / RADIUS;
      } else if (e.pointerId === lookId) {
        this.look.dx += (e.clientX - lookLast.x) * 1.6;
        this.look.dy += (e.clientY - lookLast.y) * 1.6;
        lookLast = { x: e.clientX, y: e.clientY };
        if (lookStart && Math.hypot(e.clientX - lookStart.x, e.clientY - lookStart.y) > 12) lookStart.moved = true;
      }
    });
    const end = (e) => {
      if (e.pointerId === moveId) {
        moveId = null;
        this.touchMove.x = 0;
        this.touchMove.y = 0;
        stick.classList.remove('shown');
      } else if (e.pointerId === lookId) {
        lookId = null;
        clearTimeout(holdTimer);
        if (lookStart && !lookStart.moved && !this.breakHeld && performance.now() - lookStart.t < 280) {
          this.actions.push('place');
        }
        this.breakHeld = false;
        lookStart = null;
      }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }

  /** Returns and clears accumulated look deltas in radians. */
  consumeLook() {
    const k = 0.0022 * this.sensitivity;
    const out = { dx: this.look.dx * k, dy: this.look.dy * k };
    this.look.dx = 0;
    this.look.dy = 0;
    return out;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  movement() {
    const k = this.keys;
    let forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let jump = k.has('Space');
    let sneak = k.has('ShiftLeft') || k.has('ShiftRight');
    let sprint = k.has('ControlLeft') || k.has('ControlRight') || this.sprintLatch;
    if (this.touch) {
      forward += -this.touchMove.y;
      strafe += this.touchMove.x;
      jump = jump || this.touchJump;
      sneak = sneak || this.touchDown;
      sprint = sprint || Math.hypot(this.touchMove.x, this.touchMove.y) > 0.97;
    }
    return { forward, strafe, jump, sneak, sprint };
  }

  reset() {
    this.keys.clear();
    this.look.dx = 0;
    this.look.dy = 0;
    this.breakHeld = false;
    this.placeHeld = false;
    this.actions.length = 0;
    this.wheel = 0;
  }
}
