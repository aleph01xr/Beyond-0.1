import {
  HERO_CLASSES,
  TILE_SIZE,
  type DungeonMap,
  type FloorBlessingId,
  type HeroClassId,
  type PlayerInputState,
  type PlayerStatusEffect,
  type PropState,
} from './types.ts';

export interface MovablePlayerLike {
  heroClass: HeroClassId;
  dexterity?: number;
  relics: readonly string[];
  hasteMs?: number;
  floorBlessings?: readonly FloorBlessingId[];
  speedBoost?: boolean;
  statuses?: readonly PlayerStatusEffect[];
}

export function isWallAtWorld(
  map: DungeonMap,
  props: readonly PropState[],
  wx: number,
  wy: number
): boolean {
  const tx = Math.floor(wx / TILE_SIZE);
  const ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) {
    return true;
  }
  const code = map.tiles[ty * map.width + tx];
  if (code === 0 || code === 2 || code === 3) return true;

  // Solid collision barrier for Warden's Gate landmark prop
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    if (prop.kind === 'warden_gate' && !prop.opened) {
      if (Math.abs(wx - prop.x) <= 88 && wy >= prop.y - 50 && wy <= prop.y + 20) {
        return true;
      }
    }
  }

  return false;
}

export function hasLineOfSight(
  map: DungeonMap,
  props: readonly PropState[],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist <= TILE_SIZE) return true;
  const steps = Math.ceil(dist / 14);
  const stepX = dx / steps;
  const stepY = dy / steps;
  for (let i = 1; i < steps; i++) {
    if (isWallAtWorld(map, props, x1 + stepX * i, y1 + stepY * i)) {
      return false;
    }
  }
  return true;
}

const COLLISION_COS = [
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
  0,
  Math.SQRT1_2,
];
const COLLISION_SIN = [
  0,
  Math.SQRT1_2,
  1,
  Math.SQRT1_2,
  0,
  -Math.SQRT1_2,
  -1,
  -Math.SQRT1_2,
];

export function collidesCircle(
  map: DungeonMap,
  props: readonly PropState[],
  wx: number,
  wy: number,
  radius: number
): boolean {
  if (isWallAtWorld(map, props, wx, wy)) return true;
  // 8 perimeter points for smooth circular collision sliding
  for (let i = 0; i < 8; i++) {
    const cx = wx + COLLISION_COS[i] * radius;
    const cy = wy + COLLISION_SIN[i] * radius;
    if (isWallAtWorld(map, props, cx, cy)) return true;
  }
  return false;
}

export function moveWithCollision(
  map: DungeonMap,
  props: readonly PropState[],
  entity: { x: number; y: number },
  dx: number,
  dy: number,
  radius: number
): void {
  // 1. Stuck Recovery: if entity is overlapping a wall tile, push out toward open floor
  if (collidesCircle(map, props, entity.x, entity.y, radius * 0.75)) {
    let escapeX = 0;
    let escapeY = 0;
    const probeDist = radius + 8;
    for (let i = 0; i < 8; i++) {
      const testX = entity.x + COLLISION_COS[i] * probeDist;
      const testY = entity.y + COLLISION_SIN[i] * probeDist;
      if (!isWallAtWorld(map, props, testX, testY)) {
        escapeX += COLLISION_COS[i];
        escapeY += COLLISION_SIN[i];
      }
    }
    if (escapeX !== 0 || escapeY !== 0) {
      const len = Math.hypot(escapeX, escapeY);
      entity.x += (escapeX / len) * 4;
      entity.y += (escapeY / len) * 4;
    }
  }

  // 2. Direct full step (verify path line of sight to prevent fast wall clipping)
  const targetX = entity.x + dx;
  const targetY = entity.y + dy;
  if (
    hasLineOfSight(map, props, entity.x, entity.y, targetX, targetY) &&
    !collidesCircle(map, props, targetX, targetY, radius)
  ) {
    entity.x = targetX;
    entity.y = targetY;
    return;
  }

  // 3. Wall Sliding: try X movement alone with half-step fallback
  if (dx !== 0 && !collidesCircle(map, props, targetX, entity.y, radius)) {
    entity.x = targetX;
  } else if (dx !== 0 && !collidesCircle(map, props, entity.x + dx * 0.5, entity.y, radius)) {
    entity.x += dx * 0.5;
  }

  // 4. Wall Sliding: try Y movement alone with half-step fallback
  if (dy !== 0 && !collidesCircle(map, props, entity.x, targetY, radius)) {
    entity.y = targetY;
  } else if (dy !== 0 && !collidesCircle(map, props, entity.x, entity.y + dy * 0.5, radius)) {
    entity.y += dy * 0.5;
  }
}

export function computePlayerMoveSpeed(player: MovablePlayerLike): number {
  const def = HERO_CLASSES[player.heroClass];
  let moveSpeed = def.speed * (1 + (player.dexterity || 0) * 0.0035);
  if (player.relics.includes('zephyr_greaves')) moveSpeed *= 1.15;
  if ((player.hasteMs || 0) > 0) moveSpeed *= 1.22;

  if (player.floorBlessings && player.floorBlessings.length > 0) {
    let swiftStacks = 0;
    for (let i = 0; i < player.floorBlessings.length; i++) {
      if (player.floorBlessings[i] === 'swiftness') swiftStacks++;
    }
    if (swiftStacks > 0) moveSpeed *= 1 + swiftStacks * 0.08;
  }

  if (player.speedBoost) moveSpeed *= 1.8;

  if (player.statuses && player.statuses.length > 0) {
    if (player.statuses.some((s) => s.type === 'frostbite')) {
      moveSpeed *= 0.55;
    }
    if (player.statuses.some((s) => s.type === 'impaled')) {
      moveSpeed *= 0.75;
    }
  }

  return moveSpeed;
}

export function normalizePlayerInputDirection(
  input: Pick<PlayerInputState, 'up' | 'down' | 'left' | 'right' | 'stickX' | 'stickY'>,
  disoriented = false,
  timeMs = 0
): { mx: number; my: number } {
  let mx = 0;
  let my = 0;

  if (
    typeof input.stickX === 'number' &&
    typeof input.stickY === 'number' &&
    (Math.abs(input.stickX) > 0.05 || Math.abs(input.stickY) > 0.05)
  ) {
    const len = Math.hypot(input.stickX, input.stickY);
    const clampedLen = Math.min(1, len);
    mx = (input.stickX / len) * clampedLen;
    my = (input.stickY / len) * clampedLen;
  } else {
    mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
    }
  }

  if (disoriented) {
    const drift = timeMs * 0.003;
    mx += Math.cos(drift) * 0.25;
    my += Math.sin(drift * 0.8) * 0.25;
  }

  if (mx !== 0 || my !== 0) {
    const inputLen = Math.hypot(mx, my);
    if (inputLen > 1) {
      mx /= inputLen;
      my /= inputLen;
    }
  }

  return { mx, my };
}

export function hasMovementInput(
  input: Pick<PlayerInputState, 'up' | 'down' | 'left' | 'right' | 'stickX' | 'stickY'>
): boolean {
  if (
    typeof input.stickX === 'number' &&
    typeof input.stickY === 'number' &&
    (Math.abs(input.stickX) > 0.05 || Math.abs(input.stickY) > 0.05)
  ) {
    return true;
  }
  return Boolean(input.up || input.down || input.left || input.right);
}

export function stepPlayerMovement(
  entity: { x: number; y: number; vx: number; vy: number },
  input: Pick<PlayerInputState, 'up' | 'down' | 'left' | 'right' | 'stickX' | 'stickY'>,
  map: DungeonMap,
  props: readonly PropState[],
  dtSec: number,
  options?: {
    moveSpeed?: number;
    player?: MovablePlayerLike;
    charmVx?: number;
    charmVy?: number;
    disoriented?: boolean;
    timeMs?: number;
  }
): void {
  if (dtSec <= 0) return;
  const moveSpeed =
    options?.moveSpeed ??
    (options?.player ? computePlayerMoveSpeed(options.player) : 175);
  const charmVx = options?.charmVx ?? 0;
  const charmVy = options?.charmVy ?? 0;
  const { mx, my } = normalizePlayerInputDirection(
    input,
    options?.disoriented,
    options?.timeMs
  );

  if (mx !== 0 || my !== 0) {
    entity.vx = mx * moveSpeed + charmVx;
    entity.vy = my * moveSpeed + charmVy;
  } else {
    entity.vx = charmVx;
    entity.vy = charmVy;
  }

  if (entity.vx !== 0 || entity.vy !== 0) {
    moveWithCollision(map, props, entity, entity.vx * dtSec, entity.vy * dtSec, 9);
  }
}
