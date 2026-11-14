import type { EnemyState } from '../shared/types.ts';

export type Direction8 = 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'N' | 'NE';

export const DIRECTION8_LIST: readonly Direction8[] = [
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
  'N',
  'NE',
] as const;

export type VerticalPlane = 'front' | 'side' | 'back';

export interface DirectionalPose {
  dir: Direction8;
  /** True when horizontal facing is leftward (W, NW, SW, or preserved on N/S). */
  facingLeft: boolean;
  /** Vertical perspective plane: front (S/SE/SW), side (E/W), back (N/NE/NW). */
  verticalPlane: VerticalPlane;
  /** True for pure N or S where body/head should be drawn symmetrically without side skew. */
  isPureVertical: boolean;
  /** True for NE, SE, SW, NW (3/4 diagonal perspective). */
  isDiagonal: boolean;
  /** Normalized directional vector components for the quantized 8-way direction. */
  dirX: number;
  dirY: number;
  /** Canonical angle in radians for the quantized direction. */
  angleRad: number;
}

const INV_SQRT2 = Math.SQRT1_2;

const DIR_METADATA: Record<
  Direction8,
  {
    verticalPlane: VerticalPlane;
    isPureVertical: boolean;
    isDiagonal: boolean;
    dirX: number;
    dirY: number;
    angleRad: number;
    explicitLeft: boolean | null;
  }
> = {
  E: {
    verticalPlane: 'side',
    isPureVertical: false,
    isDiagonal: false,
    dirX: 1,
    dirY: 0,
    angleRad: 0,
    explicitLeft: false,
  },
  SE: {
    verticalPlane: 'front',
    isPureVertical: false,
    isDiagonal: true,
    dirX: INV_SQRT2,
    dirY: INV_SQRT2,
    angleRad: Math.PI / 4,
    explicitLeft: false,
  },
  S: {
    verticalPlane: 'front',
    isPureVertical: true,
    isDiagonal: false,
    dirX: 0,
    dirY: 1,
    angleRad: Math.PI / 2,
    explicitLeft: null,
  },
  SW: {
    verticalPlane: 'front',
    isPureVertical: false,
    isDiagonal: true,
    dirX: -INV_SQRT2,
    dirY: INV_SQRT2,
    angleRad: (3 * Math.PI) / 4,
    explicitLeft: true,
  },
  W: {
    verticalPlane: 'side',
    isPureVertical: false,
    isDiagonal: false,
    dirX: -1,
    dirY: 0,
    angleRad: Math.PI,
    explicitLeft: true,
  },
  NW: {
    verticalPlane: 'back',
    isPureVertical: false,
    isDiagonal: true,
    dirX: -INV_SQRT2,
    dirY: -INV_SQRT2,
    angleRad: (-3 * Math.PI) / 4,
    explicitLeft: true,
  },
  N: {
    verticalPlane: 'back',
    isPureVertical: true,
    isDiagonal: false,
    dirX: 0,
    dirY: -1,
    angleRad: -Math.PI / 2,
    explicitLeft: null,
  },
  NE: {
    verticalPlane: 'back',
    isPureVertical: false,
    isDiagonal: true,
    dirX: INV_SQRT2,
    dirY: -INV_SQRT2,
    angleRad: -Math.PI / 4,
    explicitLeft: false,
  },
};

/**
 * Quantizes any screen-space angle in radians (0 = +X East, +PI/2 = +Y South)
 * into one of the 8 cardinal/intercardinal directions.
 */
export function angleToDirection8(angleRad: number): Direction8 {
  if (!Number.isFinite(angleRad)) return 'S';
  const sector = Math.round(angleRad / (Math.PI / 4));
  const idx = ((sector % 8) + 8) % 8;
  return DIRECTION8_LIST[idx];
}

export function direction8ToPose(
  dir: Direction8,
  fallbackFacingLeft = false
): DirectionalPose {
  const meta = DIR_METADATA[dir];
  return {
    dir,
    facingLeft: meta.explicitLeft !== null ? meta.explicitLeft : fallbackFacingLeft,
    verticalPlane: meta.verticalPlane,
    isPureVertical: meta.isPureVertical,
    isDiagonal: meta.isDiagonal,
    dirX: meta.dirX,
    dirY: meta.dirY,
    angleRad: meta.angleRad,
  };
}

/**
 * Resolves a player's 8-directional facing:
 * - While moving: faces movement direction.
 * - While standing still: faces aim angle.
 */
export function resolvePlayerDirection8(params: {
  moveX: number;
  moveY: number;
  aimAngle: number;
  isMoving: boolean;
  prevFacingLeft?: boolean;
}): DirectionalPose {
  const { moveX, moveY, aimAngle, isMoving, prevFacingLeft = false } = params;
  const moveMag = Math.hypot(moveX, moveY);
  const dir =
    isMoving && moveMag > 0.05
      ? angleToDirection8(Math.atan2(moveY, moveX))
      : angleToDirection8(aimAngle);
  return direction8ToPose(dir, prevFacingLeft);
}

/**
 * Resolves an enemy's 8-directional facing from charge vector, velocity, or target position.
 */
export function resolveEnemyDirection8(
  en: Pick<
    EnemyState,
    'x' | 'y' | 'vx' | 'vy' | 'targetX' | 'targetY' | 'charging' | 'chargeAngle'
  >,
  prevDir: Direction8 = 'S',
  prevFacingLeft = false
): DirectionalPose {
  let dir: Direction8 = prevDir;
  if (en.charging && en.chargeAngle !== undefined) {
    dir = angleToDirection8(en.chargeAngle);
  } else {
    const vx = en.vx || 0;
    const vy = en.vy || 0;
    if (Math.hypot(vx, vy) > 4) {
      dir = angleToDirection8(Math.atan2(vy, vx));
    } else {
      const tx = (en.targetX ?? en.x) - en.x;
      const ty = (en.targetY ?? en.y) - en.y;
      if (Math.hypot(tx, ty) > 4) {
        dir = angleToDirection8(Math.atan2(ty, tx));
      }
    }
  }
  return direction8ToPose(dir, prevFacingLeft);
}

/**
 * Resolves an NPC's 8-directional facing toward the closest nearby active player,
 * defaulting to South (facing into the room) when alone.
 */
export function resolveNpcDirection8(
  npc: { x: number; y: number },
  players: readonly { x: number; y: number; downed?: boolean }[],
  maxLookDist = 140
): DirectionalPose {
  let bestDistSq = maxLookDist * maxLookDist;
  let nearest: { x: number; y: number } | null = null;
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    if (p.downed) continue;
    const dx = p.x - npc.x;
    const dy = p.y - npc.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1 && d2 <= bestDistSq) {
      bestDistSq = d2;
      nearest = p;
    }
  }
  if (!nearest) {
    return direction8ToPose('S', false);
  }
  return direction8ToPose(
    angleToDirection8(Math.atan2(nearest.y - npc.y, nearest.x - npc.x)),
    false
  );
}
