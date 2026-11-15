import type { PlayerInputState } from '../shared/types.ts';

export interface KeyboardMovementState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  aimAngle: number;
}

/**
 * Returns true if the event target is an editable DOM element where typing
 * should NOT trigger gameplay movement, abilities, or HUD shortcuts.
 */
export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (el.isContentEditable) {
    return true;
  }
  return false;
}

/**
 * Updates unified input state from a virtual touch joystick.
 * Returns whether the touch stick is currently considered active.
 */
export function applyTouchStickToUnifiedInput(
  cur: PlayerInputState,
  stickX: number,
  stickY: number,
  aimAngle?: number
): boolean {
  const safeX = Number.isFinite(stickX) ? stickX : 0;
  const safeY = Number.isFinite(stickY) ? stickY : 0;
  const active = Math.hypot(safeX, safeY) > 0.05;

  cur.stickX = active ? safeX : 0;
  cur.stickY = active ? safeY : 0;
  cur.up = safeY < -0.25;
  cur.down = safeY > 0.25;
  cur.left = safeX < -0.25;
  cur.right = safeX > 0.25;

  if (typeof aimAngle === 'number' && Number.isFinite(aimAngle) && !cur.attack) {
    cur.aimAngle = aimAngle;
  }
  return active;
}

/**
 * Applies desktop keyboard/mouse state onto the unified input ref without
 * polluting stickX/stickY (which are reserved strictly for analog touch stick).
 * Only yields movement control while a real touch joystick is actively held.
 */
export function applyKeyboardToUnifiedInput(
  cur: PlayerInputState,
  keys: KeyboardMovementState,
  touchStickActive: boolean
): void {
  if (!touchStickActive) {
    cur.up = Boolean(keys.up);
    cur.down = Boolean(keys.down);
    cur.left = Boolean(keys.left);
    cur.right = Boolean(keys.right);
    cur.stickX = 0;
    cur.stickY = 0;
  }
  cur.attack = Boolean(keys.attack);
  if (Number.isFinite(keys.aimAngle)) {
    cur.aimAngle = keys.aimAngle;
  }
}

/**
 * Computes normalized shortest angular difference between two angles in radians [0, PI].
 */
export function angleDeltaRad(a: number, b: number): number {
  let diff = (a - b) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff);
}
