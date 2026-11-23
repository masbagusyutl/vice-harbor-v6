// Keyboard and mouse input for Vice Harbor. Held keys steer and drive; one-shot presses
// (enter/exit a car, pause, confirm, job choices) are queued as flags and taken once by the
// loop, so a press between two frames is never lost or counted twice.
export const ACTION_ENTER = 1;
export const ACTION_PAUSE = 2;
export const ACTION_CONFIRM = 4;
export const ACTION_CHOICE_A = 8;
export const ACTION_CHOICE_B = 16;
export const ACTION_JOB = 32;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const ENTER = new Set(['KeyE', 'KeyF']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const JOB = new Set(['KeyJ']);
const CHOICE_A = new Set(['Digit1']);
const CHOICE_B = new Set(['Digit2']);

export function createInput(target) {
  const held = { forward: false, back: false, left: false, right: false, sprint: false };
  let actions = 0;

  window.addEventListener('keydown', (event) => {
    if (FORWARD.has(event.code)) held.forward = true;
    else if (BACK.has(event.code)) held.back = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (SPRINT.has(event.code)) held.sprint = true;
    else if (ENTER.has(event.code)) { if (!event.repeat) actions |= ACTION_ENTER; }
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (JOB.has(event.code)) { if (!event.repeat) actions |= ACTION_JOB; }
    else if (CHOICE_A.has(event.code)) { if (!event.repeat) actions |= ACTION_CHOICE_A; }
    else if (CHOICE_B.has(event.code)) { if (!event.repeat) actions |= ACTION_CHOICE_B; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (FORWARD.has(event.code)) held.forward = false;
    else if (BACK.has(event.code)) held.back = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (SPRINT.has(event.code)) held.sprint = false;
  });
  window.addEventListener('blur', () => {
    held.forward = held.back = held.left = held.right = held.sprint = false;
  });
  // Clicking the game confirms / starts, the same as Space.
  target.addEventListener('pointerdown', () => { actions |= ACTION_CONFIRM; });

  return {
    /** The held driving/walking keys, as one object the world steps with. */
    state() { return { ...held }; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
