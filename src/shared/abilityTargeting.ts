import { hasLineOfSight, moveWithCollision } from './playerMovement.ts';
import type { DungeonMap, HeroClassId, PropState } from './types.ts';

export type AimableAction = 'tactical' | 'ult' | 'dash';

export type AbilityTargetKind = 'dash' | 'cone_volley' | 'ground_aoe' | 'self_aoe';

export interface AbilityTargetSpec {
  action: AimableAction;
  label: string;
  kind: AbilityTargetKind;
  /** Primary cast/projectile/dash range in world units */
  range: number;
  /** AoE radius (at destination for ground_aoe / Bulwark stun, or around self for self_aoe) */
  aoeRadius: number;
  /** Optional secondary radius (e.g. Cleric heal vs damage, Vanguard shield wave) */
  secondaryRadius?: number;
  /** Default distance when quick-tapped without dragging (for ground_aoe & dash) */
  defaultDist: number;
  /** Player collision radius used when simulating dashes */
  collisionRadius?: number;
  /** Fan ray offsets in radians (for Ranger Frost Volley) */
  coneRayOffsets?: readonly number[];
  /** Number of radial starburst rays (for Arcanist Astral Nova) */
  radialRays?: number;
  /** Primary theme color */
  accentColor: string;
  /** Secondary highlight color */
  secondaryColor?: string;
}

export interface AbilityAimState {
  action: AimableAction;
  source: 'touch' | 'mouse' | 'keyboard';
  aimAngle: number;
  /** Normalized drag magnitude 0..1 */
  magnitude: number;
  /** World-space distance along aimAngle (used by ground_aoe and dash) */
  aimDistance: number;
  cancelled: boolean;
}

export const DASH_TARGET_SPEC: AbilityTargetSpec = {
  action: 'dash',
  label: 'Dash',
  kind: 'dash',
  range: 110,
  aoeRadius: 18,
  defaultDist: 110,
  collisionRadius: 14,
  accentColor: '#F59E0B',
  secondaryColor: '#FEF08A',
};

const CLASS_ABILITY_SPECS: Record<HeroClassId, Record<'tactical' | 'ult', AbilityTargetSpec>> = {
  vanguard: {
    tactical: {
      action: 'tactical',
      label: 'Bulwark Dash',
      kind: 'dash',
      range: 92,
      aoeRadius: 84,
      secondaryRadius: 170,
      defaultDist: 92,
      collisionRadius: 12,
      accentColor: '#F59E0B',
      secondaryColor: '#93C5FD',
    },
    ult: {
      action: 'ult',
      label: 'Aegis Sanctuary',
      kind: 'self_aoe',
      range: 0,
      aoeRadius: 105,
      defaultDist: 0,
      accentColor: '#60A5FA',
      secondaryColor: '#FDE047',
    },
  },
  ranger: {
    tactical: {
      action: 'tactical',
      label: 'Frost Volley',
      kind: 'cone_volley',
      range: 210,
      aoeRadius: 0,
      defaultDist: 210,
      coneRayOffsets: [-0.28, -0.14, 0, 0.14, 0.28],
      accentColor: '#38BDF8',
      secondaryColor: '#BAE6FD',
    },
    ult: {
      action: 'ult',
      label: 'Hunter Quarry',
      kind: 'self_aoe',
      range: 0,
      aoeRadius: 340,
      defaultDist: 0,
      accentColor: '#FBBF24',
      secondaryColor: '#FDE68A',
    },
  },
  arcanist: {
    tactical: {
      action: 'tactical',
      label: 'Astral Nova',
      kind: 'self_aoe',
      range: 165,
      aoeRadius: 165,
      defaultDist: 0,
      radialRays: 8,
      accentColor: '#818CF8',
      secondaryColor: '#38BDF8',
    },
    ult: {
      action: 'ult',
      label: 'Chrono Well',
      kind: 'ground_aoe',
      range: 220,
      aoeRadius: 100,
      defaultDist: 110,
      accentColor: '#38BDF8',
      secondaryColor: '#C084FC',
    },
  },
  cleric: {
    tactical: {
      action: 'tactical',
      label: 'Sanctified Pulse',
      kind: 'self_aoe',
      range: 0,
      aoeRadius: 210,
      secondaryRadius: 135,
      defaultDist: 0,
      accentColor: '#34D399',
      secondaryColor: '#FACC15',
    },
    ult: {
      action: 'ult',
      label: 'Solar Beacon',
      kind: 'ground_aoe',
      range: 180,
      aoeRadius: 115,
      defaultDist: 0,
      accentColor: '#FACC15',
      secondaryColor: '#34D399',
    },
  },
};

export function getAbilityTargetSpec(
  heroClass: HeroClassId,
  action: AimableAction
): AbilityTargetSpec {
  if (action === 'dash') return DASH_TARGET_SPEC;
  return CLASS_ABILITY_SPECS[heroClass][action];
}

export function clampGroundTargetDistance(
  rawDistance: number | undefined,
  spec: AbilityTargetSpec
): number {
  if (typeof rawDistance !== 'number' || !Number.isFinite(rawDistance)) {
    return spec.defaultDist;
  }
  return Math.max(0, Math.min(spec.range, rawDistance));
}

export function computeGroundTargetPosition(
  playerX: number,
  playerY: number,
  aimAngle: number,
  rawDistance: number | undefined,
  spec: AbilityTargetSpec
): { x: number; y: number; distance: number } {
  const dist = clampGroundTargetDistance(rawDistance, spec);
  return {
    x: playerX + Math.cos(aimAngle) * dist,
    y: playerY + Math.sin(aimAngle) * dist,
    distance: dist,
  };
}

export function simulateDashEndpoint(
  map: DungeonMap,
  props: readonly PropState[],
  npcs: readonly { x: number; y: number }[] | undefined,
  startX: number,
  startY: number,
  angle: number,
  distance: number,
  collisionRadius = 14
): { x: number; y: number } {
  const pos = { x: startX, y: startY };
  const clampedDist = Math.max(0, distance);
  if (clampedDist <= 0.1) return pos;
  moveWithCollision(
    map,
    props,
    pos,
    Math.cos(angle) * clampedDist,
    Math.sin(angle) * clampedDist,
    collisionRadius,
    npcs
  );
  return pos;
}

export const PRIMARY_ATTACK_RANGES: Record<HeroClassId, number> = {
  vanguard: 81,
  ranger: 210,
  arcanist: 195,
  cleric: 175,
};

export function getPrimaryAttackRange(heroClass: HeroClassId): number {
  return PRIMARY_ATTACK_RANGES[heroClass] ?? 175;
}

export interface AutoTargetCandidate {
  id: string;
  x: number;
  y: number;
  hp?: number;
  radius?: number;
}

export function findBestAutoTarget(opts: {
  playerX: number;
  playerY: number;
  maxRange: number;
  preferredAngle?: number;
  minDot?: number;
  map?: DungeonMap;
  props?: readonly PropState[];
  enemies: readonly AutoTargetCandidate[];
  trainingDummies?: readonly AutoTargetCandidate[];
}): { target: AutoTargetCandidate; angle: number; distance: number } | null {
  const hasPref =
    typeof opts.preferredAngle === 'number' &&
    Number.isFinite(opts.preferredAngle);
  const prefCos = hasPref ? Math.cos(opts.preferredAngle!) : 1;
  const prefSin = hasPref ? Math.sin(opts.preferredAngle!) : 0;
  const minDot = typeof opts.minDot === 'number' ? opts.minDot : -1;

  const pickFrom = (
    list: readonly AutoTargetCandidate[]
  ): { target: AutoTargetCandidate; angle: number; distance: number } | null => {
    let bestTarget: AutoTargetCandidate | null = null;
    let bestScore = Infinity;
    let bestAngle = 0;
    let bestDist = Infinity;

    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      if (typeof candidate.hp === 'number' && candidate.hp <= 0) continue;
      const dx = candidate.x - opts.playerX;
      const dy = candidate.y - opts.playerY;
      const dist = Math.hypot(dx, dy);
      if (dist <= 0.001 || dist > opts.maxRange) continue;

      const dot = hasPref ? (dx * prefCos + dy * prefSin) / dist : 0;
      if (minDot > -1 && dot < minDot) continue;

      if (
        opts.map &&
        opts.props &&
        !hasLineOfSight(
          opts.map,
          opts.props,
          opts.playerX,
          opts.playerY,
          candidate.x,
          candidate.y
        )
      ) {
        continue;
      }

      // Favor closest target, with a slight tie-breaker for targets aligned with preferredAngle
      const score = dist - Math.max(0, dot) * 16;
      if (score < bestScore) {
        bestScore = score;
        bestTarget = candidate;
        bestAngle = Math.atan2(dy, dx);
        bestDist = dist;
      }
    }

    if (!bestTarget) return null;
    return { target: bestTarget, angle: bestAngle, distance: bestDist };
  };

  const enemyMatch = pickFrom(opts.enemies);
  if (enemyMatch) return enemyMatch;
  if (opts.trainingDummies && opts.trainingDummies.length > 0) {
    return pickFrom(opts.trainingDummies);
  }
  return null;
}
