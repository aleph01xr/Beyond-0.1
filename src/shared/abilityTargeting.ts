import type { ArcanistScrollId } from './arcanist.ts';
import { hasLineOfSight, moveWithCollision } from './playerMovement.ts';
import type { DungeonMap, HeroClassId, PropState } from './types.ts';

export type AimableAction = 'tactical' | 'ult' | 'dash';

export type AbilityTargetKind = 'dash' | 'cone_volley' | 'cone' | 'ground_aoe' | 'self_aoe' | 'line';

export interface AbilityTargetSpec {
  action: AimableAction;
  label: string;
  kind: AbilityTargetKind;
  /** Primary cast/projectile/dash range in world units */
  range: number;
  /** AoE radius (at destination for ground_aoe / Bulwark stun, or around self for self_aoe) */
  aoeRadius: number;
  /** Optional line width in world units for line-cast spells */
  lineWidth?: number;
  /** Optional secondary radius (e.g. Cleric heal vs damage, Vanguard shield wave) */
  secondaryRadius?: number;
  /** Default distance when quick-tapped without dragging (for ground_aoe & dash) */
  defaultDist: number;
  /** Player collision radius used when simulating dashes */
  collisionRadius?: number;
  /** Fan ray offsets in radians (for Ranger Frost Volley) */
  coneRayOffsets?: readonly number[];
  /** Cone half-angle in radians (for cone skills like Chain Lightning) */
  coneHalfAngleRad?: number;
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
  /** Screen client origin when initiated from a HUD button click so quick taps preserve existing aim */
  originClientX?: number;
  originClientY?: number;
  hasDragged?: boolean;
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
      aoeRadius: 115,
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

const ARCANIST_SCROLL_TARGET_SPECS: Record<ArcanistScrollId, AbilityTargetSpec> = {
  fireball: {
    action: 'tactical',
    label: 'Fireball',
    kind: 'line',
    range: 360,
    aoeRadius: 105,
    lineWidth: 28,
    defaultDist: 220,
    accentColor: '#F97316',
    secondaryColor: '#FDBA74',
  },
  disintegration: {
    action: 'tactical',
    label: 'Disintegration',
    kind: 'line',
    range: 450,
    aoeRadius: 0,
    lineWidth: 42,
    defaultDist: 450,
    accentColor: '#A855F7',
    secondaryColor: '#E9D5FF',
  },
  frost_lance: {
    action: 'tactical',
    label: 'Frost Lance',
    kind: 'line',
    range: 420,
    aoeRadius: 0,
    lineWidth: 16,
    defaultDist: 420,
    accentColor: '#38BDF8',
    secondaryColor: '#BAE6FD',
  },
  chain_lightning: {
    action: 'tactical',
    label: 'Chain Lightning',
    kind: 'cone',
    range: 340,
    aoeRadius: 0,
    coneHalfAngleRad: 0.56,
    defaultDist: 340,
    accentColor: '#FACC15',
    secondaryColor: '#38BDF8',
  },
  arcane_meteor: {
    action: 'tactical',
    label: 'Arcane Meteor',
    kind: 'ground_aoe',
    range: 280,
    aoeRadius: 125,
    defaultDist: 180,
    accentColor: '#E879F9',
    secondaryColor: '#F5D0FE',
  },
  arcane_orb: {
    action: 'tactical',
    label: 'Arcane Orb',
    kind: 'line',
    range: 460,
    aoeRadius: 22,
    lineWidth: 44,
    defaultDist: 280,
    accentColor: '#818CF8',
    secondaryColor: '#C7D2FE',
  },
  arcane_barrage: {
    action: 'tactical',
    label: 'Arcane Barrage',
    kind: 'line',
    range: 450,
    aoeRadius: 0,
    lineWidth: 28,
    defaultDist: 450,
    accentColor: '#60A5FA',
    secondaryColor: '#BFDBFE',
  },
};

export function getAbilityTargetSpec(
  heroClass: HeroClassId,
  action: AimableAction,
  equippedScrollId?: ArcanistScrollId | null,
  equippedWeaponId?: string | null
): AbilityTargetSpec {
  if (action === 'dash') return DASH_TARGET_SPEC;
  if (heroClass === 'arcanist' && action === 'tactical' && equippedScrollId) {
    const scrollSpec = ARCANIST_SCROLL_TARGET_SPECS[equippedScrollId];
    if (scrollSpec) return scrollSpec;
  }
  if (
    heroClass === 'cleric' &&
    action === 'tactical' &&
    equippedWeaponId === 'cleric_seraphim_crozier'
  ) {
    return {
      action: 'tactical',
      label: 'Seraphic Judgment',
      kind: 'ground_aoe',
      range: 210,
      aoeRadius: 110,
      defaultDist: 120,
      accentColor: '#FDE047',
      secondaryColor: '#F59E0B',
    };
  }
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
    let bestDx = 0;
    let bestDy = 0;
    let bestDist = Infinity;
    const maxRangeSq = opts.maxRange * opts.maxRange;

    for (let i = 0; i < list.length; i++) {
      const candidate = list[i];
      if (typeof candidate.hp === 'number' && candidate.hp <= 0) continue;
      const dx = candidate.x - opts.playerX;
      const dy = candidate.y - opts.playerY;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0.000001 || distSq > maxRangeSq) continue;
      const dist = Math.sqrt(distSq);

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
        bestDx = dx;
        bestDy = dy;
        bestDist = dist;
      }
    }

    if (!bestTarget) return null;
    return { target: bestTarget, angle: Math.atan2(bestDy, bestDx), distance: bestDist };
  };

  const enemyMatch = pickFrom(opts.enemies);
  if (enemyMatch) return enemyMatch;
  if (opts.trainingDummies && opts.trainingDummies.length > 0) {
    return pickFrom(opts.trainingDummies);
  }
  return null;
}

/**
 * Smart skill targeting: when an enemy (or dummy fallback) is within or near
 * an ability's effective range and unobstructed by walls, immediately target them.
 */
export function resolveSkillSmartTarget(opts: {
  spec: AbilityTargetSpec;
  playerX: number;
  playerY: number;
  fallbackAngle: number;
  fallbackDistance?: number;
  cursorWorldX?: number;
  cursorWorldY?: number;
  preferCursorCone?: boolean;
  allowFullRangeFallback?: boolean;
  map?: DungeonMap;
  props?: readonly PropState[];
  enemies: readonly AutoTargetCandidate[];
  trainingDummies?: readonly AutoTargetCandidate[];
}): {
  target: AutoTargetCandidate | null;
  aimAngle: number;
  aimDistance: number;
} {
  const { spec, playerX, playerY, fallbackAngle } = opts;
  const fallbackDist =
    typeof opts.fallbackDistance === 'number' && Number.isFinite(opts.fallbackDistance)
      ? Math.max(0, Math.min(spec.range, opts.fallbackDistance))
      : spec.defaultDist;

  // Evasion dash and self-centered AoEs preserve manual directional/self semantics
  if (spec.action === 'dash' || spec.kind === 'self_aoe') {
    return {
      target: null,
      aimAngle: fallbackAngle,
      aimDistance: fallbackDist,
    };
  }

  // Acquire radius includes a small grace buffer near the skill's max reach
  const acquireRange =
    spec.kind === 'ground_aoe'
      ? spec.range + Math.min(44, spec.aoeRadius * 0.35)
      : spec.kind === 'dash'
        ? spec.range + Math.min(56, spec.aoeRadius * 0.6)
        : spec.range + 28;

  const hasCursor =
    typeof opts.cursorWorldX === 'number' &&
    Number.isFinite(opts.cursorWorldX) &&
    typeof opts.cursorWorldY === 'number' &&
    Number.isFinite(opts.cursorWorldY);

  let match: { target: AutoTargetCandidate; angle: number; distance: number } | null = null;

  if (opts.preferCursorCone && hasCursor) {
    const cx = opts.cursorWorldX!;
    const cy = opts.cursorWorldY!;
    const cursorDist = Math.hypot(cx - playerX, cy - playerY);
    const cursorAngle = cursorDist > 1 ? Math.atan2(cy - playerY, cx - playerX) : fallbackAngle;

    // 1. Check enemies near cursor world position first (for ground_aoe or cursor hover)
    let closestNearCursor: AutoTargetCandidate | null = null;
    let closestCursorDist = Math.max(96, spec.aoeRadius * 0.9);
    const scanList = (list: readonly AutoTargetCandidate[]) => {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (typeof c.hp === 'number' && c.hp <= 0) continue;
        const pDist = Math.hypot(c.x - playerX, c.y - playerY);
        if (pDist <= 0.001 || pDist > acquireRange) continue;
        const cDist = Math.hypot(c.x - cx, c.y - cy);
        if (cDist > closestCursorDist) continue;
        if (
          opts.map &&
          opts.props &&
          !hasLineOfSight(opts.map, opts.props, playerX, playerY, c.x, c.y)
        ) {
          continue;
        }
        closestCursorDist = cDist;
        closestNearCursor = c;
      }
    };
    scanList(opts.enemies);
    if (!closestNearCursor && opts.trainingDummies) {
      scanList(opts.trainingDummies);
    }
    if (closestNearCursor) {
      const c = closestNearCursor as AutoTargetCandidate;
      const dist = Math.hypot(c.x - playerX, c.y - playerY);
      match = { target: c, angle: Math.atan2(c.y - playerY, c.x - playerX), distance: dist };
    } else {
      // 2. Check forward cursor cone (±45 deg)
      match = findBestAutoTarget({
        playerX,
        playerY,
        maxRange: acquireRange,
        preferredAngle: cursorAngle,
        minDot: 0.7,
        map: opts.map,
        props: opts.props,
        enemies: opts.enemies,
        trainingDummies: opts.trainingDummies,
      });
    }
  }

  if (!match && (!opts.preferCursorCone || opts.allowFullRangeFallback)) {
    match = findBestAutoTarget({
      playerX,
      playerY,
      maxRange: acquireRange,
      preferredAngle: fallbackAngle,
      minDot: -1,
      map: opts.map,
      props: opts.props,
      enemies: opts.enemies,
      trainingDummies: opts.trainingDummies,
    });
  }

  if (!match) {
    return {
      target: null,
      aimAngle: fallbackAngle,
      aimDistance: fallbackDist,
    };
  }

  const clampedDist =
    spec.kind === 'ground_aoe'
      ? Math.max(0, Math.min(spec.range, match.distance))
      : spec.kind === 'dash'
        ? spec.range
        : Math.max(0, Math.min(spec.range, match.distance));

  return {
    target: match.target,
    aimAngle: match.angle,
    aimDistance: clampedDist,
  };
}

