import { MAX_LEVEL, type DamageCategory } from './types.ts';

export const STAR_RIFT_REQUIRED_ATTACKS = 4;
export const STAR_RIFT_PROC_COOLDOWN_MS = 8000;

export type ArcanistSpellId =
  | 'fireball'
  | 'disintegration'
  | 'frost_lance'
  | 'chain_lightning'
  | 'arcane_meteor'
  | 'arcane_orb'
  | 'arcane_barrage';

/**
 * In Beyond, Arcane Scrolls ARE the offensive spell inscriptions that modify
 * or replace the Arcanist's [Q / RMB] Tactical Skill (Astral Nova).
 */
export type ArcanistScrollId = ArcanistSpellId;

export interface ArcanistSpellDef {
  id: ArcanistSpellId;
  name: string;
  scrollName: string;
  tacticalTitle: string;
  role: string;
  baseDamage: number;
  intCoeff: number; // c in D = B * [1 + 0.025 * (L - 1)] * [1 + c * INT]
  cooldownMs: number;
  castTimeMs: number;
  damageCategory: DamageCategory;
  accentColor: string;
  summary: string;
  chronoInteraction: string;
  // Optional spell-specific mechanics
  explosionRadius?: number;
  maxRange?: number;
  projectileSpeed?: number;
  pierce?: number;
  maxTargets?: number;
  jumpDamageDecay?: number;
  maxJumpDistance?: number;
  impactDelayMs?: number;
  durationMs?: number;
  hitIntervalMs?: number;
  maxHitsPerEnemy?: number;
  projectileCount?: number;
  barrageWaves?: number;
  barrageWaveIntervalMs?: number;
  coneHalfAngleRad?: number;
  burnRadius?: number;
  burnTickRatio?: number;
  tickIntervalMs?: number;
  beamWidth?: number;
  activationMs?: number;
  maxRotationRadPerSec?: number;
  isChannel?: boolean;
}

export const ARCANIST_SPELL_ORDER: readonly ArcanistSpellId[] = [
  'fireball',
  'disintegration',
  'frost_lance',
  'chain_lightning',
  'arcane_meteor',
  'arcane_orb',
  'arcane_barrage',
] as const;

export const ARCANIST_SCROLL_ORDER = ARCANIST_SPELL_ORDER;

export const ARCANIST_SPELLS: Record<ArcanistSpellId, ArcanistSpellDef> = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    scrollName: 'Scroll of Fireball',
    tacticalTitle: 'Fireball',
    role: 'Burst / Burning AoE',
    baseDamage: 42,
    intCoeff: 0.015,
    cooldownMs: 6000,
    castTimeMs: 350,
    explosionRadius: 105,
    burnRadius: 88,
    burnTickRatio: 0.22,
    durationMs: 3500,
    hitIntervalMs: 500,
    maxRange: 360,
    projectileSpeed: 380,
    damageCategory: 'fire',
    accentColor: '#F97316',
    summary: 'Replaces Astral Nova [Q]. 0.35s cast; hurls a large fireball that explodes on hit (105u AoE) and leaves a 3.5s burning ground zone.',
    chronoInteraction: 'Fireball projectile and lingering burn zone freeze inside ANY Chrono Well (including caster zones) until time resumes.',
  },
  disintegration: {
    id: 'disintegration',
    name: 'Disintegration',
    scrollName: 'Scroll of Disintegration',
    tacticalTitle: 'Disintegration',
    role: 'Sustained Beam',
    baseDamage: 10,
    intCoeff: 0.012,
    cooldownMs: 12000,
    castTimeMs: 0,
    tickIntervalMs: 200,
    beamWidth: 42,
    maxRange: 450,
    activationMs: 150,
    maxRotationRadPerSec: Math.PI, // 180 deg/s
    isChannel: true,
    damageCategory: 'arcane',
    accentColor: '#A855F7',
    summary: 'Replaces Astral Nova [Q]. Hold [Q / RMB] to channel a 450u violet beam (5 ticks/s, stationary, 180°/s turn cap; 12s CD starts on end).',
    chronoInteraction: 'Interrupted if caster is suspended by another Chrono Well; own Chrono Well lets caster channel freely.',
  },
  frost_lance: {
    id: 'frost_lance',
    name: 'Frost Lance',
    scrollName: 'Scroll of Frost Lance (Ice Lance)',
    tacticalTitle: 'Frost Lance',
    role: 'Precision / Piercing',
    baseDamage: 36,
    intCoeff: 0.018,
    cooldownMs: 4500,
    castTimeMs: 200,
    pierce: 3,
    maxRange: 420,
    projectileSpeed: 480,
    damageCategory: 'frost',
    accentColor: '#38BDF8',
    summary: 'Replaces Astral Nova [Q]. 0.2s cast; fires a straight crystalline ice lance piercing up to 3 enemies (no homing/freeze).',
    chronoInteraction: 'Ice lance projectile suspends mid-air inside ANY Chrono Well until the field ends.',
  },
  chain_lightning: {
    id: 'chain_lightning',
    name: 'Chain Lightning',
    scrollName: 'Scroll of Chain Lightning',
    tacticalTitle: 'Chain Lightning',
    role: 'Cone Discharge',
    baseDamage: 32,
    intCoeff: 0.015,
    cooldownMs: 7000,
    castTimeMs: 0,
    maxRange: 340,
    coneHalfAngleRad: 0.56, // ~±32 deg (64 deg total cone)
    damageCategory: 'lightning',
    accentColor: '#FACC15',
    summary: 'Replaces Astral Nova [Q]. Unleashes a 340u cone-shaped lightning blast (64° arc) shocking all foes inside.',
    chronoInteraction: 'Instant lightning cone hits suspended foes inside Chrono Well; blocked while caster is Chrono-suspended.',
  },
  arcane_meteor: {
    id: 'arcane_meteor',
    name: 'Arcane Meteor',
    scrollName: 'Scroll of Arcane Meteor',
    tacticalTitle: 'Arcane Meteor',
    role: 'Heavy AoE Burst',
    baseDamage: 75,
    intCoeff: 0.0195,
    cooldownMs: 11000,
    castTimeMs: 500,
    impactDelayMs: 1000,
    explosionRadius: 125,
    maxRange: 280,
    damageCategory: 'arcane',
    accentColor: '#E879F9',
    summary: 'Replaces Astral Nova [Q]. 0.5s cast + 1.0s warning delay; drops an arcane meteor for heavy 125u AoE damage (no burn).',
    chronoInteraction: 'Marked meteor impact timer freezes while covered by ANY Chrono Well and detonates once time resumes.',
  },
  arcane_orb: {
    id: 'arcane_orb',
    name: 'Arcane Orb',
    scrollName: 'Scroll of Arcane Orb',
    tacticalTitle: 'Arcane Orb',
    role: 'Persistent Pressure',
    baseDamage: 12,
    intCoeff: 0.0105,
    cooldownMs: 9000,
    castTimeMs: 0,
    durationMs: 4000,
    hitIntervalMs: 500,
    maxHitsPerEnemy: 2,
    projectileSpeed: 115,
    damageCategory: 'arcane',
    accentColor: '#818CF8',
    summary: 'Replaces Astral Nova [Q]. 4s slow sphere damaging enemies every 0.5s (max 2 hits/enemy) without vanishing on hit.',
    chronoInteraction: 'Orb movement and lifetime freeze completely inside ANY Chrono Well without losing hit cooldown timing.',
  },
  arcane_barrage: {
    id: 'arcane_barrage',
    name: 'Arcane Barrage',
    scrollName: 'Scroll of Arcane Barrage',
    tacticalTitle: 'Arcane Barrage',
    role: 'Multi-Wave Barrage',
    baseDamage: 12,
    intCoeff: 0.00675,
    cooldownMs: 8000,
    castTimeMs: 0,
    projectileCount: 8,
    barrageWaves: 4,
    barrageWaveIntervalMs: 95,
    projectileSpeed: 420,
    maxRange: 450,
    damageCategory: 'arcane',
    accentColor: '#60A5FA',
    summary: 'Replaces Astral Nova [Q]. Launches a 4-wave rapid arcane barrage (8 bolts) that streams forward and strikes targets 3-4+ times.',
    chronoInteraction: 'Barrage projectiles suspend inside ANY Chrono Well (including the caster’s own) and burst forward together on resume.',
  },
};

export const ARCANIST_SCROLLS: ArcanistSpellDef[] = ARCANIST_SPELL_ORDER.map(
  (id) => ARCANIST_SPELLS[id]
);

export function getArcanistScrollDef(scrollId?: string | null): ArcanistSpellDef | null {
  if (!scrollId) return null;
  return ARCANIST_SPELLS[scrollId as ArcanistScrollId] || null;
}

export interface ArcanistCastState {
  spellId: ArcanistSpellId;
  remainingMs: number;
  totalMs: number;
  aimAngle: number;
  targetX: number;
  targetY: number;
}

export interface DisintegrationChannelState {
  active: boolean;
  angle: number;
  targetAngle: number;
  activationRemainingMs: number;
  tickAccumMs: number;
  startedAtMs: number;
}

/**
 * Single-application Arcanist spell damage formula:
 *   D = B * [1 + 0.025 * (L - 1)] * [1 + c * INT]
 * Optional relic/blessing multipliers (Sunfire Signet 1.12x, Fury 1 + 0.06*stacks)
 * apply once without re-applying level or INT scaling.
 */
export function computeArcanistSpellDamage(
  baseDamage: number,
  params: {
    level?: number;
    intelligence?: number;
    relics?: readonly string[];
    furyStacks?: number;
  },
  intCoeff: number
): number {
  const level = Math.max(1, Math.min(MAX_LEVEL, params.level || 1));
  const intStat = Math.max(0, params.intelligence || 0);
  const levelMult = 1 + 0.025 * (level - 1);
  const intMult = 1 + intCoeff * intStat;
  let total = baseDamage * levelMult * intMult;
  if (params.relics?.includes('sunfire_signet')) {
    total *= 1.12;
  }
  const fury = Math.max(0, params.furyStacks || 0);
  if (fury > 0) {
    total *= 1 + fury * 0.06;
  }
  return Math.max(1, Math.round(total));
}

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function rotateAngleToward(
  currentAngle: number,
  targetAngle: number,
  maxDeltaRad: number
): number {
  const diff = normalizeAngle(targetAngle - currentAngle);
  if (Math.abs(diff) <= maxDeltaRad) {
    return normalizeAngle(targetAngle);
  }
  return normalizeAngle(currentAngle + Math.sign(diff) * maxDeltaRad);
}

export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 0.000001) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const closestX = ax + t * abx;
  const closestY = ay + t * aby;
  return Math.hypot(px - closestX, py - closestY);
}
