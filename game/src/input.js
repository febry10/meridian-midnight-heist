// Keyboard and pointer input. Held keys give a movement vector; one-shot presses
// (confirm, pause, use gadget, interact) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost or counted twice.
// Mouse clicks set a move target the thief walks toward (click-to-move).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_USE = 4;
export const ACTION_INTERACT = 8;
export const ACTION_POINTER = 16;

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const USE = new Set(['KeyQ']);
const INTERACT = new Set(['KeyE']);

export function createInput(canvas) {
  let left = false;
  let right = false;
  let up = false;
  let down = false;
  let actions = 0;
  let clickTarget = null;
  let interactHeldFlag = false;

  function scalePoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * 1280,
      y: ((clientY - rect.top) / rect.height) * 720,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (LEFT.has(event.code)) left = true;
    else if (RIGHT.has(event.code)) right = true;
    else if (UP.has(event.code)) up = true;
    else if (DOWN.has(event.code)) down = true;
    else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (USE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_USE;
    } else if (INTERACT.has(event.code)) {
      interactHeldFlag = true;
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (LEFT.has(event.code)) left = false;
    else if (RIGHT.has(event.code)) right = false;
    else if (UP.has(event.code)) up = false;
    else if (DOWN.has(event.code)) down = false;
    else if (INTERACT.has(event.code)) interactHeldFlag = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    left = false;
    right = false;
    up = false;
    down = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    clickTarget = scalePoint(event.clientX, event.clientY);
    actions |= ACTION_POINTER;
  });

  return {
    /** Normalised movement vector from held keys, or null when none are held. */
    keysVector() {
      const x = (right ? 1 : 0) - (left ? 1 : 0);
      const y = (down ? 1 : 0) - (up ? 1 : 0);
      if (x === 0 && y === 0) return null;
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The last click-to-move target, or null. Cleared when the thief arrives. */
    clickTarget() { return clickTarget; },
    clearClickTarget() { clickTarget = null; },
    /** True while the interact key (E) is held down. */
    interactHeld() { return interactHeldFlag; },
  };
}
