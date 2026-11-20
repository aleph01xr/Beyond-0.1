import type { EnemyState } from '../shared/types.ts';
import {
  direction8ToPose,
  resolveEnemyDirection8,
  type DirectionalPose,
} from './directionalFacing.ts';

export type FirstFiveBossKey = 'malakor' | 'vaelor' | 'ignis' | 'malice' | 'archon';

export type BossActionKind =
  | 'idle'
  | 'move'
  | 'windup'
  | 'attack'
  | 'heavy_slam'
  | 'spin'
  | 'charge'
  | 'cast'
  | 'aoe'
  | 'recover'
  | 'shield'
  | 'summon'
  | 'teleport'
  | 'death';

export interface BossVisualAnimState {
  bossKey: FirstFiveBossKey;
  action: BossActionKind;
  abilityKey: string;
  progress: number; // 0..1 within current timed action
  prevAction: BossActionKind;
  blend: number; // 0..1 transition blend into current action
  moveSpeedNorm: number; // 0..1 normalized movement intensity
  walkCycle: number; // continuous phase for locomotion
  facingAngle: number; // ability or facing angle in radians
  hitFlash: number; // 0..1 brief white/ember flash on HP drop
  hitRecoilX: number;
  hitRecoilY: number;
  deathProgress: number; // 0..1 during death sequence
}

export interface BossAnimRuntime {
  bossKey: FirstFiveBossKey;
  activeAction: BossActionKind;
  abilityKey: string;
  actionStartAt: number;
  actionDurationMs: number;
  actionAngle: number;
  prevAction: BossActionKind;
  transitionStartAt: number;
  hitFlashUntil: number;
  hitRecoilX: number;
  hitRecoilY: number;
  lastHp: number;
  lastX: number;
  lastY: number;
  lastState: EnemyState['state'];
  walkPhase: number;
  lastEvalAt: number;
}

export interface DyingBossEntry {
  id: string;
  enemy: EnemyState;
  bossKey: FirstFiveBossKey;
  x: number;
  y: number;
  pose: DirectionalPose;
  lastAnim: BossVisualAnimState;
  bornAt: number;
  durationMs: number;
}

const DEFAULT_BLEND_MS = 110;
const HIT_FLASH_MS = 200;

export function resolveFirstFiveBossKey(
  bossName?: string,
  floor?: number,
  biome?: string
): FirstFiveBossKey | null {
  const n = (bossName || '').toLowerCase();
  if (
    n.includes('elyndor') ||
    n.includes('zadkiel') ||
    n.includes('sariel') ||
    n.includes('seraphel') ||
    n.includes('oriphiel')
  ) {
    return null;
  }
  if (n.includes('malakor')) return 'malakor';
  if (n.includes('vaelor')) return 'vaelor';
  if (n.includes('ignis')) return 'ignis';
  if (n.includes('malice') || n.includes('void-eater')) return 'malice';
  if (n.includes('archon')) return 'archon';

  if (biome === 'catacombs' || floor === 2) return 'vaelor';
  if (biome === 'ember' || floor === 3) return 'ignis';
  if (biome === 'void' || floor === 4) return 'malice';
  if (biome === 'astral' || floor === 5) return 'archon';
  if (biome === 'highkeep' || floor === 1) return 'malakor';
  return null;
}

export function createBossAnimRuntime(
  bossKey: FirstFiveBossKey,
  en: EnemyState,
  now: number
): BossAnimRuntime {
  return {
    bossKey,
    activeAction: 'idle',
    abilityKey: 'none',
    actionStartAt: now,
    actionDurationMs: 0,
    actionAngle: 0,
    prevAction: 'idle',
    transitionStartAt: now,
    hitFlashUntil: 0,
    hitRecoilX: 0,
    hitRecoilY: 0,
    lastHp: en.hp,
    lastX: en.x,
    lastY: en.y,
    lastState: en.state,
    walkPhase: (en.x + en.y) * 0.03,
    lastEvalAt: now,
  };
}

export function triggerBossAbilityAnim(
  runtime: BossAnimRuntime,
  action: BossActionKind,
  abilityKey: string,
  durationMs: number,
  angleRad: number,
  now: number
): void {
  runtime.prevAction = runtime.activeAction;
  runtime.activeAction = action;
  runtime.abilityKey = abilityKey;
  runtime.actionStartAt = now;
  runtime.actionDurationMs = durationMs;
  runtime.actionAngle = angleRad;
  runtime.transitionStartAt = now;
}

export function triggerBossEventAnim(
  runtime: BossAnimRuntime,
  eventKind: 'status' | 'damage' | 'heal' | 'crit' | string,
  eventText: string,
  aimAngle: number,
  now: number
): boolean {
  const txt = eventText.trim().toUpperCase();
  if (eventKind === 'damage' && txt.includes('SOUL SIPHON')) {
    triggerBossAbilityAnim(runtime, 'cast', 'soul_siphon', 950, aimAngle, now);
    return true;
  }
  if (eventKind !== 'status') return false;

  if (txt.includes('SHIELD WALL')) {
    triggerBossAbilityAnim(runtime, 'shield', 'shield_wall', 1050, aimAngle, now);
    return true;
  }
  if (txt.includes('CLEAVE')) {
    triggerBossAbilityAnim(runtime, 'attack', 'triple_cleave', 950, aimAngle, now);
    return true;
  }
  if (txt.includes('GROUND SLAM')) {
    triggerBossAbilityAnim(runtime, 'heavy_slam', 'ground_slam', 900, aimAngle, now);
    return true;
  }
  if (txt.includes('WAR CHARGE')) {
    triggerBossAbilityAnim(runtime, 'windup', 'war_charge', 550, aimAngle, now);
    return true;
  }
  if (txt.includes('FROST NOVA')) {
    triggerBossAbilityAnim(runtime, 'aoe', 'frost_nova', 900, aimAngle, now);
    return true;
  }
  if (txt.includes('SIPHON VOLLEY')) {
    triggerBossAbilityAnim(runtime, 'cast', 'soul_siphon', 900, aimAngle, now);
    return true;
  }
  if (txt.includes('SOUL HAIL')) {
    triggerBossAbilityAnim(runtime, 'attack', 'soul_hail', 900, aimAngle, now);
    return true;
  }
  if (txt.includes('DEATH RING')) {
    triggerBossAbilityAnim(runtime, 'spin', 'death_ring', 1000, aimAngle, now);
    return true;
  }
  if (txt.includes('MAGMA ERUPTION') || txt.includes('MAGMA')) {
    triggerBossAbilityAnim(runtime, 'heavy_slam', 'magma_eruption', 900, aimAngle, now);
    return true;
  }
  if (txt.includes('FISSURE WAVE')) {
    triggerBossAbilityAnim(runtime, 'attack', 'fissure_wave', 850, aimAngle, now);
    return true;
  }
  if (txt.includes('CINDER SPIRAL')) {
    triggerBossAbilityAnim(runtime, 'spin', 'cinder_spiral', 1050, aimAngle, now);
    return true;
  }
  if (txt.includes('CORE DETONATION')) {
    triggerBossAbilityAnim(runtime, 'aoe', 'core_detonation', 950, aimAngle, now);
    return true;
  }
  if (txt.includes('SINGULARITY')) {
    triggerBossAbilityAnim(runtime, 'aoe', 'singularity', 1200, aimAngle, now);
    return true;
  }
  if (txt.includes('TENDRIL FLURRY')) {
    triggerBossAbilityAnim(runtime, 'attack', 'tendril_flurry', 850, aimAngle, now);
    return true;
  }
  if (txt.includes('VOID STEP') || txt.includes('VOID SCYTHE')) {
    triggerBossAbilityAnim(runtime, 'teleport', 'void_step', 850, aimAngle, now);
    return true;
  }
  if (txt.includes('ABYSSAL NOVA')) {
    triggerBossAbilityAnim(runtime, 'spin', 'abyssal_nova', 950, aimAngle, now);
    return true;
  }
  if (txt.includes('SUPERNOVA')) {
    triggerBossAbilityAnim(runtime, 'aoe', 'supernova', 1250, aimAngle, now);
    return true;
  }
  if (txt.includes('STARBEAM')) {
    triggerBossAbilityAnim(runtime, 'cast', 'starbeam_cascade', 900, aimAngle, now);
    return true;
  }
  if (txt.includes('COSMIC VOLLEY')) {
    triggerBossAbilityAnim(runtime, 'attack', 'cosmic_volley', 850, aimAngle, now);
    return true;
  }
  if (txt.includes('REINFORCEMENTS')) {
    triggerBossAbilityAnim(runtime, 'summon', 'summon', 1050, aimAngle, now);
    return true;
  }
  return false;
}

export function stepBossAnimRuntime(
  runtime: BossAnimRuntime,
  en: EnemyState,
  pose: DirectionalPose,
  now: number
): BossVisualAnimState {
  const dtSec = Math.min(0.08, Math.max(0, (now - runtime.lastEvalAt) / 1000));
  runtime.lastEvalAt = now;

  // Hit detection on HP drop
  if (en.hp < runtime.lastHp && en.hp > 0) {
    runtime.hitFlashUntil = now + HIT_FLASH_MS;
    const recoilAng = pose.angleRad + Math.PI;
    runtime.hitRecoilX = Math.cos(recoilAng) * 3.5;
    runtime.hitRecoilY = Math.sin(recoilAng) * 2.5;
  }
  runtime.lastHp = en.hp;

  // Silent teleport fallback detection (Void Step)
  const jumpDist = Math.hypot(en.x - runtime.lastX, en.y - runtime.lastY);
  if (
    runtime.bossKey === 'malice' &&
    jumpDist > 52 &&
    !(runtime.activeAction === 'teleport' && now - runtime.actionStartAt < 300)
  ) {
    triggerBossAbilityAnim(runtime, 'teleport', 'void_step', 850, pose.angleRad, now);
  }
  runtime.lastX = en.x;
  runtime.lastY = en.y;

  const speed = Math.hypot(en.vx || 0, en.vy || 0);
  const moveSpeedNorm = Math.min(1, speed / 135);
  if ((en.frozenMs ?? 0) <= 0 && (en.chronoSuspendedMs ?? 0) <= 0) {
    runtime.walkPhase += dtSec * (2.4 + moveSpeedNorm * 6.5);
  }

  let resolvedAction: BossActionKind = runtime.activeAction;
  let resolvedAbility = runtime.abilityKey;
  let progress = 0;

  // Authoritative server-driven charge / recover / shield overrides
  if (en.charging) {
    if ((en.chargeWindupMs ?? 0) > 0) {
      resolvedAction = 'windup';
      resolvedAbility = 'war_charge';
      progress = Math.max(0, Math.min(1, 1 - (en.chargeWindupMs ?? 0) / 550));
      runtime.actionAngle = en.chargeAngle ?? pose.angleRad;
    } else {
      resolvedAction = 'charge';
      resolvedAbility = 'war_charge';
      progress = Math.max(0, Math.min(1, 1 - (en.chargeTimerMs ?? 0) / 560));
      runtime.actionAngle = en.chargeAngle ?? pose.angleRad;
    }
    if (runtime.activeAction !== resolvedAction) {
      runtime.prevAction = runtime.activeAction;
      runtime.activeAction = resolvedAction;
      runtime.abilityKey = resolvedAbility;
      runtime.transitionStartAt = now;
    }
  } else if (en.state === 'recover') {
    resolvedAction = 'recover';
    resolvedAbility = 'war_charge';
    const maxRec = en.enraged ? 750 : 950;
    progress = Math.max(0, Math.min(1, 1 - (en.windupMs || 0) / maxRec));
    if (runtime.activeAction !== 'recover') {
      runtime.prevAction = runtime.activeAction;
      runtime.activeAction = 'recover';
      runtime.abilityKey = 'war_charge';
      runtime.transitionStartAt = now;
    }
  } else if (
    runtime.actionDurationMs > 0 &&
    now - runtime.actionStartAt < runtime.actionDurationMs
  ) {
    resolvedAction = runtime.activeAction;
    resolvedAbility = runtime.abilityKey;
    progress = Math.max(0, Math.min(1, (now - runtime.actionStartAt) / runtime.actionDurationMs));
  } else if ((en.shieldWallMs ?? 0) > 0) {
    resolvedAction = 'shield';
    resolvedAbility = 'shield_wall';
    progress = 1;
    if (runtime.activeAction !== 'shield') {
      runtime.prevAction = runtime.activeAction;
      runtime.activeAction = 'shield';
      runtime.abilityKey = 'shield_wall';
      runtime.transitionStartAt = now;
    }
  } else {
    const locAction: BossActionKind = moveSpeedNorm > 0.08 ? 'move' : 'idle';
    if (runtime.activeAction !== locAction) {
      runtime.prevAction = runtime.activeAction;
      runtime.activeAction = locAction;
      runtime.abilityKey = 'none';
      runtime.actionDurationMs = 0;
      runtime.transitionStartAt = now;
    }
    resolvedAction = locAction;
    resolvedAbility = 'none';
    progress = (runtime.walkPhase % (Math.PI * 2)) / (Math.PI * 2);
  }

  runtime.lastState = en.state;

  const rawBlend = (now - runtime.transitionStartAt) / DEFAULT_BLEND_MS;
  const blend = Math.max(0, Math.min(1, rawBlend));
  const hitRem = Math.max(0, runtime.hitFlashUntil - now);
  const hitFlash = hitRem / HIT_FLASH_MS;

  return {
    bossKey: runtime.bossKey,
    action: resolvedAction,
    abilityKey: resolvedAbility,
    progress,
    prevAction: runtime.prevAction,
    blend: blend * blend * (3 - 2 * blend),
    moveSpeedNorm,
    walkCycle: runtime.walkPhase,
    facingAngle: runtime.actionAngle || pose.angleRad,
    hitFlash,
    hitRecoilX: runtime.hitRecoilX * hitFlash,
    hitRecoilY: runtime.hitRecoilY * hitFlash,
    deathProgress: 0,
  };
}

/**
 * Derive a standalone stateless animation snapshot when no persistent runtime is passed
 * (e.g. unit tests or synthetic previews).
 */
export function deriveStatelessBossAnim(
  bossKey: FirstFiveBossKey,
  en: EnemyState | undefined,
  pose: DirectionalPose,
  now: number
): BossVisualAnimState {
  const speed = en ? Math.hypot(en.vx || 0, en.vy || 0) : 0;
  const moveSpeedNorm = Math.min(1, speed / 135);
  let action: BossActionKind = moveSpeedNorm > 0.08 ? 'move' : 'idle';
  let abilityKey = 'none';
  let progress = ((now * 0.004) % 1);

  if (en) {
    if (en.hp <= 0) {
      action = 'death';
      progress = 0.5;
    } else if (en.charging) {
      if ((en.chargeWindupMs ?? 0) > 0) {
        action = 'windup';
        abilityKey = 'war_charge';
        progress = Math.max(0, Math.min(1, 1 - (en.chargeWindupMs ?? 0) / 550));
      } else {
        action = 'charge';
        abilityKey = 'war_charge';
        progress = Math.max(0, Math.min(1, 1 - (en.chargeTimerMs ?? 0) / 560));
      }
    } else if (en.state === 'recover') {
      action = 'recover';
      abilityKey = 'war_charge';
      progress = Math.max(0, Math.min(1, 1 - (en.windupMs || 0) / 950));
    } else if ((en.shieldWallMs ?? 0) > 0) {
      action = 'shield';
      abilityKey = 'shield_wall';
      progress = 0.8;
    } else if (en.windupMs > 0) {
      action = en.state === 'windup' ? 'windup' : 'cast';
      abilityKey = 'windup';
      progress = Math.max(0, Math.min(1, 1 - en.windupMs / 1150));
    }
  }

  return {
    bossKey,
    action,
    abilityKey,
    progress,
    prevAction: 'idle',
    blend: 1,
    moveSpeedNorm,
    walkCycle: now * 0.0085,
    facingAngle: en?.chargeAngle ?? pose.angleRad,
    hitFlash: 0,
    hitRecoilX: 0,
    hitRecoilY: 0,
    deathProgress: action === 'death' ? 0.5 : 0,
  };
}

// ============================================================================
// SHARED PERSPECTIVE & ANIMATION HELPERS (8-DIRECTIONAL, NON-MIRRORED)
// ============================================================================

interface PerspectiveMetrics {
  pose: DirectionalPose;
  isBack: boolean;
  isFront: boolean;
  isSide: boolean;
  isDiag: boolean;
  /** Signed horizontal look direction (-1 West, 0 N/S, +1 East) */
  lookX: number;
  /** Signed vertical look direction (-1 North, 0 E/W, +1 South) */
  lookY: number;
  /** Width compression for side/diagonal views (1.0 on N/S, ~0.84 diag, ~0.68 side) */
  widthScale: number;
  /** Front-back depth separation helper */
  zRightFront: boolean;
  zLeftFront: boolean;
}

function getPerspective(pose: DirectionalPose): PerspectiveMetrics {
  const isBack = pose.verticalPlane === 'back';
  const isSide = pose.verticalPlane === 'side';
  const isFront = pose.verticalPlane === 'front';
  const isDiag = pose.isDiagonal;
  const lookX = pose.isPureVertical ? 0 : pose.facingLeft ? -1 : 1;
  const lookY = isBack ? -1 : isFront ? 1 : 0;
  const widthScale = pose.isPureVertical ? 1.0 : isDiag ? 0.86 : 0.68;

  // Anatomical right side of character (viewer-left when facing S, viewer-right when facing N):
  // Facing W -> character's right side is away from viewer (far), left side is near viewer!
  // Wait: stand facing South (+Y): right hand is at -X (viewer left), left hand is at +X (viewer right).
  // Turn 90 deg counter-clockwise to face East (+X): right hand is toward +Y (viewer front/near!), left hand is toward -Y (far).
  // Turn 90 deg clockwise from South to face West (-X): left hand is toward +Y (viewer front/near!), right hand is toward -Y (far).
  const zRightFront = pose.dir === 'E' || pose.dir === 'SE' || pose.dir === 'S' || pose.dir === 'SW';
  const zLeftFront = pose.dir === 'W' || pose.dir === 'SW' || pose.dir === 'S' || pose.dir === 'NW';

  return {
    pose,
    isBack,
    isFront,
    isSide,
    isDiag,
    lookX,
    lookY,
    widthScale,
    zRightFront,
    zLeftFront,
  };
}

function smoothStep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Computes lateral X offset for a character-anatomical side ('right' or 'left')
 * preserving true anatomical handedness across all 8 directions without mirroring!
 * Facing South: character's right arm is at -armSpread, left arm is at +armSpread.
 * Facing North: character's right arm is at +armSpread, left arm is at -armSpread.
 * Facing East/West: near/far depth shift toward/away from center.
 */
function getAnatomicalSidePos(
  persp: PerspectiveMetrics,
  side: 'right' | 'left',
  spreadX: number,
  depthShiftY = 3
): { ox: number; oy: number; isFrontLayer: boolean } {
  // Unit vector perpendicular to facing in screen space (character's left vector = rotate facing -90 deg in screen XY where +Y is down?
  // Wait: facing South = (0, +1). Character's right = (-1, 0), left = (+1, 0).
  // For facing vector (fx, fy), character's RIGHT vector is (-fy, fx), LEFT is (fy, -fx)!
  // Verify:
  // South (0, 1) -> Right=(-1, 0), Left=(+1, 0) -> viewer left & viewer right! Correct!
  // North (0, -1) -> Right=(+1, 0), Left=(-1, 0) -> viewer right & viewer left! Correct!
  // East (1, 0) -> Right=(0, +1) [viewer front/down], Left=(0, -1) [viewer back/up]! Correct!
  // West (-1, 0) -> Right=(0, -1) [viewer back/up], Left=(0, +1) [viewer front/down]! Correct!
  // SE (0.7, 0.7) -> Right=(-0.7, +0.7) [slightly viewer-left & near], Left=(+0.7, -0.7) [slightly viewer-right & far]!
  const fx = persp.pose.dirX;
  const fy = persp.pose.dirY;
  const rx = side === 'right' ? -fy : fy;
  const ry = side === 'right' ? fx : -fx;
  return {
    ox: rx * spreadX,
    oy: ry * depthShiftY,
    isFrontLayer: ry >= -0.05,
  };
}

function drawStatusOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  en: EnemyState | undefined,
  anim: BossVisualAnimState,
  now: number
): void {
  if (anim.hitFlash > 0.04) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.55, anim.hitFlash * 0.55);
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y - 6, radius * 0.95, radius * 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (!en) return;
  if ((en.frozenMs ?? 0) > 0) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 4, radius * 1.05, radius * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if ((en.stunnedMs ?? 0) > 0) {
    ctx.save();
    for (let s = 0; s < 3; s++) {
      const a = now * 0.008 + (s * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 18;
      const sy = y - radius - 26 + Math.sin(a) * 5;
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(Math.round(sx - 2), Math.round(sy - 2), 4, 4);
    }
    ctx.restore();
  }
}

// ============================================================================
// FLOOR 1 BOSS: WARDEN MALAKOR — Towering Monstrous Armored Bastion Guardian
// Weighty armored strides, horned monstrous great-helm, crimson war mantle,
// preserved Shield (Left arm) & Broadsword (Right arm) across all 8 directions,
// synchronized Shield Wall, Triple Cleave, Ground Slam, and War Charge animations.
// ============================================================================

export function drawMalakorBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState,
  facing?: DirectionalPose,
  animIn?: BossVisualAnimState
): void {
  const pose = facing ?? (en ? resolveEnemyDirection8(en) : direction8ToPose('S', false));
  const anim = animIn ?? deriveStatelessBossAnim('malakor', en, pose, now);
  const persp = getPerspective(pose);
  const isEnraged = Boolean(en?.enraged);
  const isShielding = anim.action === 'shield' || (en?.shieldWallMs ?? 0) > 0;
  const isDeath = anim.action === 'death';

  const breathRate = isEnraged ? 0.0065 : 0.0038;
  const breathe = Math.sin(now * breathRate) * (isEnraged ? 2.2 : 1.5);
  const stepCycle = anim.walkCycle;
  const strideAmp =
    anim.action === 'charge'
      ? 1.45
      : anim.action === 'move'
        ? 0.45 + anim.moveSpeedNorm * 0.7
        : 0;
  const heavyStomp = strideAmp > 0 ? Math.abs(Math.sin(stepCycle)) * -3.5 * Math.min(1.2, strideAmp) : 0;
  const shoulderRoll = strideAmp > 0 ? Math.sin(stepCycle) * 2.2 * Math.min(1, strideAmp) : 0;

  // Pose offsets from active ability
  let bodyLeanX = pose.dirX * (anim.action === 'move' ? 2.5 * anim.moveSpeedNorm : 0);
  let bodyLeanY = pose.dirY * (anim.action === 'move' ? 1.5 * anim.moveSpeedNorm : 0);
  let bodyTiltRot = 0;
  let torsoSquashY = 1;
  let torsoLiftY = 0;
  let swordSwingAngle = -0.08 + Math.sin(now * 0.004) * 0.05;
  let swordReachX = 0;
  let swordReachY = 0;
  let shieldBraceFwd = 0;
  let shieldLiftY = 0;
  let swingArcAlpha = 0;

  if (anim.action === 'windup' && anim.abilityKey === 'war_charge') {
    const p = smoothStep(anim.progress);
    bodyLeanX = -pose.dirX * 5 * p;
    bodyLeanY = -pose.dirY * 3 * p + 4 * p;
    torsoSquashY = 1 - 0.1 * p;
    shieldBraceFwd = 1.0 * p;
    swordSwingAngle = -0.85 * p;
    bodyTiltRot = persp.lookX * -0.14 * p;
  } else if (anim.action === 'charge') {
    bodyLeanX = pose.dirX * 9;
    bodyLeanY = pose.dirY * 5 + 2;
    bodyTiltRot = persp.lookX * 0.24;
    shieldBraceFwd = 1.25;
    swordSwingAngle = -1.1;
  } else if (anim.action === 'recover') {
    const p = smoothStep(anim.progress);
    const inv = 1 - p;
    bodyLeanX = pose.dirX * 6 * inv;
    bodyLeanY = 7 * inv + Math.sin(now * 0.025) * 1.4 * inv;
    torsoSquashY = 1 - 0.12 * inv;
    swordSwingAngle = 0.85 * inv;
    shieldLiftY = 5 * inv;
  } else if (anim.action === 'attack' && anim.abilityKey === 'triple_cleave') {
    const p = anim.progress;
    if (p < 0.24) {
      const w = smoothStep(p / 0.24);
      bodyTiltRot = (persp.lookX || 1) * -0.22 * w;
      swordSwingAngle = -1.35 * w;
      swordReachX = -5 * w;
      torsoLiftY = -3 * w;
    } else if (p < 0.54) {
      const s = smoothStep((p - 0.24) / 0.3);
      bodyTiltRot = (persp.lookX || 1) * (-0.22 + 0.5 * s);
      swordSwingAngle = -1.35 + 2.9 * s;
      swordReachX = pose.dirX * 10 * Math.sin(s * Math.PI);
      swordReachY = pose.dirY * 6 * Math.sin(s * Math.PI);
      swingArcAlpha = Math.sin(s * Math.PI);
    } else {
      const r = smoothStep((p - 0.54) / 0.46);
      bodyTiltRot = (persp.lookX || 1) * 0.28 * (1 - r);
      swordSwingAngle = 1.55 * (1 - r);
    }
  } else if (anim.action === 'heavy_slam' && anim.abilityKey === 'ground_slam') {
    const p = anim.progress;
    if (p < 0.5) {
      const u = smoothStep(p / 0.5);
      torsoLiftY = -12 * u;
      swordSwingAngle = -2.2 * u;
      swordReachY = -14 * u;
      shieldLiftY = -8 * u;
    } else if (p < 0.72) {
      const d = smoothStep((p - 0.5) / 0.22);
      torsoLiftY = -12 + 18 * d;
      torsoSquashY = 1 - 0.16 * d;
      swordSwingAngle = -2.2 + 3.25 * d;
      swordReachY = -14 + 26 * d;
      swingArcAlpha = d;
    } else {
      const r = smoothStep((p - 0.72) / 0.28);
      torsoLiftY = 6 * (1 - r);
      torsoSquashY = 1 - 0.16 * (1 - r);
      swordSwingAngle = 1.05 * (1 - r);
      swordReachY = 12 * (1 - r);
    }
  } else if (isShielding) {
    const braceWave = anim.action === 'shield' ? Math.sin(Math.min(1, anim.progress) * Math.PI) : 0;
    shieldBraceFwd = 0.85 + braceWave * 0.35;
    shieldLiftY = -3;
    torsoSquashY = 0.96;
    swordSwingAngle = -0.35;
  }

  let deathAlpha = 1;
  if (isDeath) {
    const dp = smoothStep(anim.deathProgress);
    torsoLiftY += dp * 18;
    torsoSquashY *= 1 - dp * 0.45;
    bodyTiltRot += (persp.lookX || 1) * dp * 1.15;
    deathAlpha = Math.max(0, 1 - Math.max(0, dp - 0.45) / 0.55);
  }

  const bx = Math.round(x + bodyLeanX + anim.hitRecoilX);
  const by = Math.round(y + bodyLeanY + heavyStomp + torsoLiftY + anim.hitRecoilY);
  const wScale = persp.widthScale;
  const capeWave = Math.sin(now * 0.0065) * 3 + strideAmp * 2.5;

  ctx.save();
  ctx.globalAlpha *= deathAlpha;

  // 1. Bastion Ground Sanctuary Aura
  ctx.fillStyle = isEnraged ? 'rgba(239, 68, 68, 0.24)' : 'rgba(245, 158, 11, 0.18)';
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 28, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = isEnraged ? 'rgba(239, 68, 68, 0.65)' : 'rgba(245, 158, 11, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ground slam shock ripple during impact frame
  if (anim.action === 'heavy_slam' && anim.progress >= 0.58 && anim.progress <= 0.92) {
    const rp = (anim.progress - 0.58) / 0.34;
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.85 * (1 - rp)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y + 18, 26 + rp * 34, 10 + rp * 14, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(bodyTiltRot);
  ctx.scale(1, torsoSquashY);

  // Compute anatomical positions for legs, arms, shield (left), sword (right)
  const rightSide = getAnatomicalSidePos(persp, 'right', 24 * wScale + 4, 4);
  const leftSide = getAnatomicalSidePos(persp, 'left', 25 * wScale + 4, 4);
  const rightLegSide = getAnatomicalSidePos(persp, 'right', 9 * wScale + 1, 3);
  const leftLegSide = getAnatomicalSidePos(persp, 'left', 9 * wScale + 1, 3);

  const legStrideR = Math.sin(stepCycle) * 7 * Math.min(1.1, strideAmp);
  const legStrideL = -Math.sin(stepCycle) * 7 * Math.min(1.1, strideAmp);

  const drawCape = () => {
    const cOffX = -pose.dirX * (persp.isSide ? 11 : 4);
    const cW = Math.round(44 * (persp.isSide ? 0.58 : wScale));
    const cTopY = -18 + breathe * 0.4;
    const cH = 42;
    ctx.fillStyle = '#7F1D1D';
    ctx.beginPath();
    ctx.moveTo(cOffX - cW * 0.45, cTopY);
    ctx.lineTo(cOffX + cW * 0.45, cTopY);
    ctx.lineTo(cOffX + cW * 0.56 - pose.dirX * 5, cTopY + cH + capeWave);
    ctx.lineTo(cOffX - cW * 0.56 - pose.dirX * 5, cTopY + cH + capeWave * 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#BE123C';
    ctx.fillRect(
      Math.round(cOffX - cW * 0.36),
      Math.round(cTopY + 3),
      Math.round(cW * 0.72),
      Math.round(cH - 6 + capeWave * 0.5)
    );
    // Gold tattered hem
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(
      Math.round(cOffX - cW * 0.46 - pose.dirX * 3),
      Math.round(cTopY + cH - 4 + capeWave * 0.8),
      Math.round(cW * 0.92),
      3
    );
  };

  const drawLegs = () => {
    const legs: Array<{ sidePos: typeof rightLegSide; stride: number }> = [
      { sidePos: rightLegSide, stride: legStrideR },
      { sidePos: leftLegSide, stride: legStrideL },
    ];
    legs.sort((a, b) => a.sidePos.oy - b.sidePos.oy);
    for (const leg of legs) {
      const lx = Math.round(leg.sidePos.ox + pose.dirX * leg.stride * 0.55);
      const ly = Math.round(12 + leg.sidePos.oy + pose.dirY * leg.stride * 0.45);
      // Thigh & knee plate
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(lx - 5, ly - 5, 10, 12);
      ctx.fillStyle = '#475569';
      ctx.fillRect(lx - 4, ly - 3, 8, 5);
      // Heavy iron sabaton
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(lx - 5, ly + 5, 11, 6);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(lx - 4, ly + 4, 9, 2);
    }
  };

  const drawSwordArm = () => {
    const sx =
      Math.round(
        rightSide.ox +
          pose.dirX * (4 + swordReachX * 0.4) +
          swordReachX
      );
    const sy = Math.round(-6 + rightSide.oy + breathe + swordReachY);
    ctx.save();
    ctx.translate(sx, sy);
    const dirBias = persp.lookX === 0 ? (persp.isBack ? -0.15 : 0.15) : persp.lookX * 0.25;
    ctx.rotate(swordSwingAngle + dirBias);

    // Armored gauntlet
    ctx.fillStyle = '#334155';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-4, -3, 8, 3);

    // Massive Runic Bastion Broadsword
    ctx.fillStyle = '#334155';
    ctx.fillRect(-4, -48, 8, 52);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-2.5, -46, 5, 48);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1, -44, 2, 44);
    // Runic glowing edge notches
    ctx.fillStyle = isEnraged ? '#EF4444' : '#F59E0B';
    ctx.fillRect(-1.5, -34, 3, 4);
    ctx.fillRect(-1.5, -22, 3, 4);
    // Broad horned crossguard & pommel
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-9, 1, 18, 5);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-7, 2, 14, 2);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-2.5, 6, 5, 8);

    // Cleave energy arc when actively swinging
    if (swingArcAlpha > 0.08) {
      ctx.strokeStyle = `rgba(251, 191, 36, ${swingArcAlpha * 0.9})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -18, 34, -Math.PI * 0.7, Math.PI * 0.25);
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawShieldArm = () => {
    const shX = Math.round(
      leftSide.ox + pose.dirX * (shieldBraceFwd * 9 + 2)
    );
    const shY = Math.round(-4 + leftSide.oy + breathe + shieldLiftY + pose.dirY * shieldBraceFwd * 5);
    const shW = persp.isSide ? 11 : persp.isDiag ? 14 : 17;
    const shH = 38;

    ctx.save();
    ctx.translate(shX, shY);
    // Tower Kite Shield
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(-shW / 2, -shH / 2);
    ctx.lineTo(shW / 2, -shH / 2);
    ctx.lineTo(shW / 2 - 1, shH * 0.25);
    ctx.lineTo(0, shH / 2 + 4);
    ctx.lineTo(-shW / 2 + 1, shH * 0.25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(-shW / 2 + 2, -shH / 2 + 2, shW - 4, shH - 10);

    // Lion Emblem & Iron Boss
    ctx.fillStyle = isShielding ? '#FEF08A' : '#F59E0B';
    ctx.fillRect(-3, -10, 6, 18);
    ctx.fillRect(-Math.max(2, shW * 0.28), -3, Math.max(4, shW * 0.56), 5);
    if (isShielding) {
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-shW / 2 - 2, -shH / 2 - 2, shW + 4, shH + 4);
    }
    ctx.restore();
  };

  // Layer order: cape (front view behind) -> far limbs -> torso & head -> near limbs -> cape (back view over rear shoulders)
  if (!persp.isBack) {
    drawCape();
  }

  drawLegs();

  if (!rightSide.isFrontLayer) drawSwordArm();
  if (!leftSide.isFrontLayer) drawShieldArm();

  // Heavy Monstrous Armored Torso
  const torsoW = Math.round(44 * wScale);
  const torsoY = Math.round(-26 + breathe);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-torsoW / 2 - 2, torsoY, torsoW + 4, 42);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-torsoW / 2, torsoY + 2, torsoW, 38);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-torsoW / 2 + 4, torsoY + 5, Math.max(6, torsoW - 8), 28);

  if (!persp.isBack) {
    // Chest Lion Heraldry & Belt
    const chestShiftX = Math.round(persp.lookX * 3);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-torsoW / 2 + 2, torsoY + 24, torsoW - 4, 6);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(chestShiftX - 5, torsoY + 10, 10, 10);
    ctx.fillStyle = isEnraged ? '#EF4444' : '#FEF08A';
    ctx.fillRect(chestShiftX - 3, torsoY + 12, 6, 6);
  } else {
    // Back spinal plate ridge & cape clasp
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-3, torsoY + 4, 6, 30);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-5, torsoY + 6, 10, 4);
  }

  // Towering Spiked Steel Pauldrons (wider & heavier than standard knights)
  const pSpread = Math.round((torsoW / 2) + 2);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-pSpread - 6, torsoY - 3 + shoulderRoll, 13, 17);
  ctx.fillRect(pSpread - 7, torsoY - 3 - shoulderRoll, 13, 17);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-pSpread - 5, torsoY - 1 + shoulderRoll, 11, 4);
  ctx.fillRect(pSpread - 6, torsoY - 1 - shoulderRoll, 11, 4);
  // Jagged monstrous shoulder spikes
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-pSpread - 5, torsoY - 11 + shoulderRoll, 5, 9);
  ctx.fillRect(pSpread, torsoY - 11 - shoulderRoll, 5, 9);

  if (persp.isBack) {
    drawCape();
  }

  // Winged Monstrous Great-Helm
  const headW = Math.round(28 * (persp.isSide ? 0.8 : persp.isDiag ? 0.9 : 1));
  const headX = Math.round(persp.lookX * 2.5);
  const headY = Math.round(torsoY - 17);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(headX - headW / 2 - 1, headY - 1, headW + 2, 21);
  ctx.fillStyle = '#475569';
  ctx.fillRect(headX - headW / 2, headY, headW, 18);

  // Towering Horned Gold-Iron Crest
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(headX - headW / 2 - 4, headY - 10, 6, 15);
  ctx.fillRect(headX + headW / 2 - 2, headY - 10, 6, 15);
  ctx.fillRect(headX - 3, headY - 13, 6, 14);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(headX - 1.5, headY - 11, 3, 9);

  if (!persp.isBack) {
    const visorShift = Math.round(persp.lookX * (persp.isSide ? 5 : 3));
    const visorW = persp.isSide ? 12 : persp.isDiag ? 17 : 20;
    ctx.fillStyle = '#090D16';
    ctx.fillRect(headX + visorShift - visorW / 2, headY + 6, visorW, 9);
    // Glowing fierce ember eyes behind heavy grate
    ctx.fillStyle = isEnraged ? '#EF4444' : '#FEF08A';
    if (persp.isSide) {
      ctx.fillRect(headX + visorShift - 2, headY + 8, 6, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(headX + visorShift, headY + 9, 2, 2);
    } else {
      ctx.fillRect(headX + visorShift - 7, headY + 8, 6, 4);
      ctx.fillRect(headX + visorShift + 2, headY + 8, 6, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(headX + visorShift - 5, headY + 9, 2, 2);
      ctx.fillRect(headX + visorShift + 4, headY + 9, 2, 2);
    }
  } else {
    // Solid bolted rear helm plate & neck guard
    ctx.fillStyle = '#334155';
    ctx.fillRect(headX - headW / 2 + 2, headY + 4, headW - 4, 14);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(headX - 2, headY + 2, 4, 15);
  }

  // Front-layered arms
  if (rightSide.isFrontLayer) drawSwordArm();
  if (leftSide.isFrontLayer) drawShieldArm();

  ctx.restore();

  drawStatusOverlay(ctx, x, y, en?.radius ?? 28, en, anim, now);
  ctx.restore();
}

// ============================================================================
// FLOOR 2 BOSS: ARCHLICH VAELOR — Ancient Gaunt Undead Spellcaster
// Unnatural skeletal bob & twitching head tilt, hollow rib-shroud & spine,
// Dread Soul Lantern Staff (Right hand) & Necrotic Orb Claw (Left hand),
// synchronized Frost Nova, Soul Siphon, Soul Hail, Death Ring, and Summon poses.
// ============================================================================

export function drawVaelorBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState,
  facing?: DirectionalPose,
  animIn?: BossVisualAnimState
): void {
  const pose = facing ?? (en ? resolveEnemyDirection8(en) : direction8ToPose('S', false));
  const anim = animIn ?? deriveStatelessBossAnim('vaelor', en, pose, now);
  const persp = getPerspective(pose);
  const isEnraged = Boolean(en?.enraged);
  const isDeath = anim.action === 'death';

  // Unnatural twitching idle micro-tilt + eerie floating sine wave
  const twitchCycle = (now % 3400) / 3400;
  const unnaturalTwitch =
    twitchCycle > 0.86 ? Math.sin((twitchCycle - 0.86) * 45) * 0.16 : 0;
  const lichFloat = Math.sin(now * 0.0042) * 5.5 + Math.sin(now * 0.009) * 1.2;

  let liftY = 0;
  let leanX = pose.dirX * (anim.action === 'move' ? 5.5 * anim.moveSpeedNorm : 0);
  let leanY = pose.dirY * (anim.action === 'move' ? 3 * anim.moveSpeedNorm : 0);
  let staffRaiseY = 0;
  let staffTilt = -0.05 + Math.sin(now * 0.004) * 0.05;
  let orbReachFwd = 0;
  let orbRaiseY = 0;
  let torsoRot = 0;
  let shroudFlare = 0;
  let deathAlpha = 1;

  if (anim.action === 'aoe' && anim.abilityKey === 'frost_nova') {
    const p = anim.progress;
    if (p < 0.55) {
      const u = smoothStep(p / 0.55);
      liftY = -10 * u;
      staffRaiseY = -14 * u;
      orbRaiseY = -16 * u;
      shroudFlare = 8 * u;
    } else if (p < 0.8) {
      const d = smoothStep((p - 0.55) / 0.25);
      liftY = -10 + 12 * d;
      staffRaiseY = -14 + 20 * d;
      orbRaiseY = -16 + 20 * d;
      shroudFlare = 8 + 10 * Math.sin(d * Math.PI);
    } else {
      const r = smoothStep((p - 0.8) / 0.2);
      liftY = 2 * (1 - r);
      staffRaiseY = 6 * (1 - r);
      orbRaiseY = 4 * (1 - r);
    }
  } else if (anim.action === 'cast' && anim.abilityKey === 'soul_siphon') {
    const p = anim.progress;
    const thrust = p < 0.35 ? smoothStep(p / 0.35) : p < 0.72 ? 1 : 1 - smoothStep((p - 0.72) / 0.28);
    orbReachFwd = 15 * thrust;
    orbRaiseY = -6 * thrust;
    staffTilt = -0.25 * thrust;
    leanX += pose.dirX * 4 * thrust;
  } else if (anim.action === 'attack' && anim.abilityKey === 'soul_hail') {
    const p = anim.progress;
    const wave = Math.sin(p * Math.PI);
    staffTilt = -0.9 + 1.5 * smoothStep(Math.min(1, p * 1.8));
    orbReachFwd = 10 * wave;
    torsoRot = (persp.lookX || 1) * 0.16 * wave;
  } else if (anim.action === 'spin' && anim.abilityKey === 'death_ring') {
    const p = anim.progress;
    const swell = Math.sin(p * Math.PI);
    liftY = -9 * swell;
    shroudFlare = 12 * swell;
    torsoRot = p < 0.7 ? Math.sin(p * Math.PI * 2.5) * 0.28 : 0;
    staffRaiseY = -10 * swell;
    orbRaiseY = -10 * swell;
  } else if (anim.action === 'summon') {
    const swell = Math.sin(anim.progress * Math.PI);
    liftY = -11 * swell;
    staffRaiseY = -16 * swell;
    shroudFlare = 10 * swell;
  }

  if (isDeath) {
    const dp = smoothStep(anim.deathProgress);
    liftY += dp * 16;
    shroudFlare = -10 * dp;
    deathAlpha = Math.max(0, 1 - dp);
  }

  const bx = Math.round(x + leanX + anim.hitRecoilX);
  const by = Math.round(y - 7 + lichFloat + liftY + leanY + anim.hitRecoilY);
  const wScale = persp.widthScale;

  ctx.save();
  ctx.globalAlpha *= deathAlpha;

  // 1. Necrotic & Frost Sanctum Aura
  const auraPulse = 29 + Math.sin(now * 0.006) * 4;
  const auraGrad = ctx.createRadialGradient(x, y + 18, 4, x, y + 18, auraPulse);
  auraGrad.addColorStop(0, isEnraged ? 'rgba(168, 85, 247, 0.5)' : 'rgba(34, 211, 238, 0.42)');
  auraGrad.addColorStop(0.55, 'rgba(88, 28, 135, 0.28)');
  auraGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.ellipse(x, y + 18, auraPulse, auraPulse * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.52)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 24, 9.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(torsoRot);

  const rightSide = getAnatomicalSidePos(persp, 'right', 24 * wScale + 3, 4);
  const leftSide = getAnatomicalSidePos(persp, 'left', 22 * wScale + 3, 4);

  const drawStaffArm = () => {
    const sx = Math.round(rightSide.ox - pose.dirX * 2);
    const sy = Math.round(rightSide.oy + staffRaiseY);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(staffTilt + (persp.lookX * 0.08));

    // Twisted ancient darkwood shaft
    ctx.fillStyle = '#292524';
    ctx.fillRect(-2.5, -44, 5, 64);
    // Bone knuckle hook at top
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(-3, -46, 9, 4);
    // Suspended Dread Soul Lantern
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-5, -42, 11, 3);
    ctx.fillRect(-4, -39, 9, 10);
    ctx.fillStyle = isEnraged ? '#C084FC' : '#38BDF8';
    ctx.fillRect(-3, -38, 7, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1.5, -36, 4, 4);
    ctx.restore();
  };

  const drawOrbClaw = () => {
    const ox = Math.round(leftSide.ox + pose.dirX * orbReachFwd);
    const oy = Math.round(4 + leftSide.oy + orbRaiseY + pose.dirY * orbReachFwd * 0.55);
    const orbBob = Math.sin(now * 0.009) * 3;
    // Gaunt skeletal forearm & talons
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(ox - 4, oy - 2, 8, 4);
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(ox + pose.dirX * 3 - 2, oy - 4, 3, 6);
    // Floating Necrotic Soul Orb
    const orbX = ox + pose.dirX * 5;
    const orbY = oy - 12 + orbBob;
    ctx.fillStyle = '#6D28D9';
    ctx.beginPath();
    ctx.arc(orbX, orbY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isEnraged ? '#F43F5E' : '#38BDF8';
    ctx.beginPath();
    ctx.arc(orbX, orbY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(orbX - 1, orbY - 1, 2, 2);
  };

  if (!rightSide.isFrontLayer) drawStaffArm();
  if (!leftSide.isFrontLayer) drawOrbClaw();

  // 2. Floating Tattered Obsidian & Necrotic Violet Shroud
  const shroudW = Math.round((42 + shroudFlare) * wScale);
  const trailShift = Math.round(-pose.dirX * 4 * anim.moveSpeedNorm);
  ctx.fillStyle = '#0F091F';
  ctx.beginPath();
  ctx.moveTo(-shroudW * 0.48, -16);
  ctx.lineTo(shroudW * 0.48, -16);
  ctx.lineTo(shroudW * 0.56 + trailShift, 30);
  ctx.lineTo(-shroudW * 0.56 + trailShift, 30);
  ctx.closePath();
  ctx.fill();

  // Tattered frayed hem
  const toothCount = Math.max(4, Math.round(6 * wScale));
  for (let t = 0; t < toothCount; t++) {
    const frac = toothCount > 1 ? t / (toothCount - 1) - 0.5 : 0;
    const tx = Math.round(frac * shroudW * 0.9 + trailShift);
    const th = 7 + ((t * 5) % 6) + Math.sin(now * 0.008 + t) * 2.5;
    ctx.fillStyle = t % 2 === 0 ? '#0F091F' : '#3B0764';
    ctx.fillRect(tx - 3, 29, 6, Math.round(th));
  }

  // Inner Violet Lich Mantle
  ctx.fillStyle = '#3B0764';
  ctx.fillRect(-Math.round(shroudW * 0.36), -14, Math.round(shroudW * 0.72), 40);

  if (!persp.isBack) {
    // Exposed glowing ribcage arches & frost spine rune
    const rShift = Math.round(persp.lookX * 2.5);
    ctx.fillStyle = '#22D3EE';
    ctx.fillRect(rShift - 1.5, -10, 3, 28);
    ctx.fillStyle = '#CBD5E1';
    for (let rib = 0; rib < 3; rib++) {
      const rw = Math.round((16 - rib * 3) * wScale);
      ctx.fillRect(rShift - rw / 2, -6 + rib * 6, rw, 2.5);
    }
  } else {
    // Exposed Floating Jagged Spinal Vertebrae down back!
    for (let v = 0; v < 5; v++) {
      const vx = Math.round(Math.sin(now * 0.006 + v) * 1.2);
      const vy = -12 + v * 7;
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(vx - 3, vy, 6, 4);
      ctx.fillStyle = '#22D3EE';
      ctx.fillRect(vx - 1, vy + 1, 2, 2);
    }
  }

  // Jagged Bone Clavicle Collar & Pauldrons
  const colW = Math.round(38 * wScale);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-colW / 2, -20, colW, 6);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-colW / 2 - 2, -18, 7, 9);
  ctx.fillRect(colW / 2 - 5, -18, 7, 9);
  // Upward bone shoulder thorns
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-colW / 2, -26, 4, 7);
  ctx.fillRect(colW / 2 - 4, -26, 4, 7);

  // 3. Monstrous Gaunt Skull & Horned Ivory Crown (with unnatural tilt)
  ctx.save();
  ctx.translate(Math.round(persp.lookX * 2), -29);
  ctx.rotate(unnaturalTwitch);

  const skullW = persp.isSide ? 16 : persp.isDiag ? 19 : 22;
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(-skullW / 2, -9, skullW, 18);
  // Cheek & jaw gaunt taper
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-skullW / 2 + 2, 5, skullW - 4, 5);

  if (!persp.isBack) {
    const faceX = Math.round(persp.lookX * (persp.isSide ? 3 : 2));
    // Deep sunken orbital sockets
    ctx.fillStyle = '#090514';
    if (persp.isSide) {
      ctx.fillRect(faceX - 2, -4, 6, 6);
      ctx.fillStyle = isEnraged ? '#F43F5E' : '#22D3EE';
      ctx.fillRect(faceX - 1, -3, 4, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(faceX, -2, 2, 2);
    } else {
      ctx.fillRect(faceX - 8, -4, 6, 6);
      ctx.fillRect(faceX + 2, -4, 6, 6);
      ctx.fillStyle = isEnraged ? '#F43F5E' : '#22D3EE';
      ctx.fillRect(faceX - 7, -3, 4, 4);
      ctx.fillRect(faceX + 3, -3, 4, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(faceX - 6, -2, 2, 2);
      ctx.fillRect(faceX + 4, -2, 2, 2);
    }
    // Skeletal grin teeth
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(faceX - Math.round(skullW * 0.25), 4, Math.round(skullW * 0.5), 4);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(faceX - 3, 5, 2, 2);
    ctx.fillRect(faceX + 1, 5, 2, 2);
  } else {
    // Rear cranium sutures & necrotic rune etched into occiput
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-skullW / 2 + 2, -7, skullW - 4, 13);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1.5, -4, 3, 7);
  }

  // Ancient Horned Ivory Crown
  ctx.fillStyle = '#B45309';
  ctx.fillRect(-skullW / 2 - 2, -13, skullW + 4, 5);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-skullW / 2 - 2, -23, 4, 11);
  ctx.fillRect(-2, -28, 4, 16);
  ctx.fillRect(skullW / 2 - 2, -23, 4, 11);
  if (!persp.isBack) {
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-2, -12, 4, 4);
  }
  ctx.restore();

  if (rightSide.isFrontLayer) drawStaffArm();
  if (leftSide.isFrontLayer) drawOrbClaw();

  // 4. Orbiting Frost Soul Wisps (expand during Death Ring / Frost Nova)
  const wispR = 32 + shroudFlare * 1.1;
  for (let i = 0; i < 4; i++) {
    const ang = now * 0.0038 + (i * Math.PI * 2) / 4;
    const wx = Math.cos(ang) * wispR;
    const wy = -4 + Math.sin(ang) * (wispR * 0.48);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.fillRect(Math.round(wx - 3), Math.round(wy - 3), 6, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(Math.round(wx - 1), Math.round(wy - 1), 2, 2);
  }

  ctx.restore();
  drawStatusOverlay(ctx, x, y, en?.radius ?? 28, en, anim, now);
  ctx.restore();
}

// ============================================================================
// FLOOR 3 BOSS: IGNIS, CINDER SOVEREIGN — Hulking Molten Volcano Sovereign
// Basalt-armored demonic humanoid, blazing molten chest furnace & dorsal vents,
// flickering living flame hair, heat shimmer & rising embers, Obsidian Greataxe,
// synchronized Magma Eruption, Fissure Wave, 360° Cinder Spiral spin, Core Detonation.
// ============================================================================

export function drawIgnisBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState,
  facing?: DirectionalPose,
  animIn?: BossVisualAnimState
): void {
  const pose = facing ?? (en ? resolveEnemyDirection8(en) : direction8ToPose('S', false));
  const anim = animIn ?? deriveStatelessBossAnim('ignis', en, pose, now);
  const persp = getPerspective(pose);
  const isEnraged = Boolean(en?.enraged);
  const isDeath = anim.action === 'death';

  const lavaThrob = 0.88 + Math.sin(now * 0.0085) * 0.14;
  const breath = Math.sin(now * 0.005) * 2.2;
  const strideAmp = anim.action === 'move' ? 0.4 + anim.moveSpeedNorm * 0.65 : 0;
  const stepCycle = anim.walkCycle;
  const stompY = strideAmp > 0 ? Math.abs(Math.sin(stepCycle)) * -3 * strideAmp : 0;

  let bodyRot = 0;
  let torsoSquash = 1;
  let liftY = 0;
  let coreFlare = 1;
  let axeSwing = 0.06 + Math.sin(now * 0.006) * 0.08;
  let axePullY = 0;
  let swingArc = 0;
  let deathAlpha = 1;

  if (anim.action === 'heavy_slam' && anim.abilityKey === 'magma_eruption') {
    const p = anim.progress;
    if (p < 0.52) {
      const u = smoothStep(p / 0.52);
      liftY = -10 * u;
      axeSwing = -2.1 * u;
      axePullY = -12 * u;
      coreFlare = 1 + 0.4 * u;
    } else if (p < 0.76) {
      const d = smoothStep((p - 0.52) / 0.24);
      liftY = -10 + 18 * d;
      torsoSquash = 1 - 0.14 * d;
      axeSwing = -2.1 + 3.15 * d;
      axePullY = -12 + 24 * d;
      coreFlare = 1.45;
    } else {
      const r = smoothStep((p - 0.76) / 0.24);
      liftY = 8 * (1 - r);
      torsoSquash = 1 - 0.14 * (1 - r);
      axeSwing = 1.05 * (1 - r);
    }
  } else if (anim.action === 'attack' && anim.abilityKey === 'fissure_wave') {
    const p = anim.progress;
    if (p < 0.28) {
      const w = smoothStep(p / 0.28);
      bodyRot = (persp.lookX || 1) * -0.24 * w;
      axeSwing = -1.4 * w;
    } else if (p < 0.58) {
      const s = smoothStep((p - 0.28) / 0.3);
      bodyRot = (persp.lookX || 1) * (-0.24 + 0.52 * s);
      axeSwing = -1.4 + 2.9 * s;
      swingArc = Math.sin(s * Math.PI);
    } else {
      const r = smoothStep((p - 0.58) / 0.42);
      bodyRot = (persp.lookX || 1) * 0.28 * (1 - r);
      axeSwing = 1.5 * (1 - r);
    }
  } else if (anim.action === 'spin' && anim.abilityKey === 'cinder_spiral') {
    const p = anim.progress;
    if (p < 0.18) {
      const w = smoothStep(p / 0.18);
      torsoSquash = 1 - 0.12 * w;
      axeSwing = -1.1 * w;
    } else if (p < 0.8) {
      const sp = (p - 0.18) / 0.62;
      bodyRot = sp * Math.PI * 4; // True 2 full 360-degree spins!
      axeSwing = Math.PI * 0.42;
      swingArc = 0.95;
      coreFlare = 1.35;
    } else {
      const r = smoothStep((p - 0.8) / 0.2);
      bodyRot = 0.22 * (1 - r);
      axeSwing = 1.2 * (1 - r);
    }
  } else if (anim.action === 'aoe' && anim.abilityKey === 'core_detonation') {
    const p = anim.progress;
    if (p < 0.55) {
      const c = smoothStep(p / 0.55);
      torsoSquash = 1 - 0.18 * c;
      liftY = 5 * c;
      coreFlare = 1 + 0.9 * c;
      axeSwing = -0.5 * c;
    } else if (p < 0.78) {
      const b = smoothStep((p - 0.55) / 0.23);
      torsoSquash = 0.82 + 0.3 * b;
      liftY = 5 - 12 * b;
      coreFlare = 1.9 + 0.4 * Math.sin(b * Math.PI);
      axeSwing = -0.5 - 1.1 * b;
    } else {
      const r = smoothStep((p - 0.78) / 0.22);
      torsoSquash = 1 + 0.12 * (1 - r);
      liftY = -7 * (1 - r);
      coreFlare = 1 + 0.6 * (1 - r);
    }
  }

  if (isDeath) {
    const dp = smoothStep(anim.deathProgress);
    coreFlare = dp < 0.45 ? 1 + dp * 2.2 : Math.max(0.1, 2 - (dp - 0.45) * 3.4);
    liftY += dp * 16;
    torsoSquash *= 1 - dp * 0.5;
    deathAlpha = Math.max(0, 1 - Math.max(0, dp - 0.5) / 0.5);
  }

  const bx = Math.round(x + pose.dirX * 3 * anim.moveSpeedNorm + anim.hitRecoilX);
  const by = Math.round(y + stompY + liftY + anim.hitRecoilY);
  const wScale = persp.widthScale;

  ctx.save();
  ctx.globalAlpha *= deathAlpha;

  // 1. Molten Caldera Ground Reservoir
  ctx.fillStyle = isEnraged ? 'rgba(239, 68, 68, 0.36)' : 'rgba(234, 88, 12, 0.34)';
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 36 * lavaThrob, 14 * lavaThrob, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Heat-shimmer secondary distortion ring during Core Detonation / Spin
  if (swingArc > 0.2 || coreFlare > 1.35) {
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, 34 * coreFlare * 0.7, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(bodyRot);
  ctx.scale(1, torsoSquash);

  const rightSide = getAnatomicalSidePos(persp, 'right', 29 * wScale + 3, 4);
  const leftSide = getAnatomicalSidePos(persp, 'left', 27 * wScale + 3, 4);
  const legR = getAnatomicalSidePos(persp, 'right', 11 * wScale + 2, 3);
  const legL = getAnatomicalSidePos(persp, 'left', 11 * wScale + 2, 3);

  const drawLegs = () => {
    const legs = [
      { pos: legR, s: Math.sin(stepCycle) * 7 * strideAmp },
      { pos: legL, s: -Math.sin(stepCycle) * 7 * strideAmp },
    ].sort((a, b) => a.pos.oy - b.pos.oy);
    for (const lg of legs) {
      const lx = Math.round(lg.pos.ox + pose.dirX * lg.s * 0.5);
      const ly = Math.round(13 + lg.pos.oy + pose.dirY * lg.s * 0.4);
      ctx.fillStyle = '#18181B';
      ctx.fillRect(lx - 6, ly - 4, 12, 13);
      ctx.fillStyle = '#F97316';
      ctx.fillRect(lx - 2, ly - 1, 4, 5);
      ctx.fillStyle = '#27272A';
      ctx.fillRect(lx - 7, ly + 6, 14, 5);
    }
  };

  const drawClawArm = () => {
    const cx = Math.round(leftSide.ox);
    const cy = Math.round(-6 + leftSide.oy + breath);
    ctx.fillStyle = '#27272A';
    ctx.fillRect(cx - 5, cy - 6, 10, 18);
    ctx.fillStyle = '#F97316';
    ctx.fillRect(cx - 3, cy, 6, 3);
    // Obsidian claws glowing hot
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(cx - 4, cy + 12, 3, 5);
    ctx.fillRect(cx + 1, cy + 12, 3, 5);
  };

  const drawGreataxeArm = () => {
    const ax = Math.round(rightSide.ox);
    const ay = Math.round(-10 + rightSide.oy + breath + axePullY);
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(axeSwing + persp.lookX * 0.14);

    // Ashwood & Basalt Haft
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-3, -44, 6, 68);
    // Double-bitted Obsidian Greataxe Heads
    ctx.fillStyle = '#18181B';
    ctx.fillRect(-20, -44, 17, 26);
    ctx.fillRect(3, -44, 17, 26);
    // Incandescent Molten Cutting Edges
    ctx.fillStyle = '#F97316';
    ctx.fillRect(-22, -46, 4, 30);
    ctx.fillRect(18, -46, 4, 30);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-21, -42, 2, 22);
    ctx.fillRect(19, -42, 2, 22);

    if (swingArc > 0.1) {
      ctx.strokeStyle = `rgba(249, 115, 22, ${swingArc * 0.9})`;
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(0, -18, 36, -Math.PI * 0.85, Math.PI * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  };

  drawLegs();
  if (!rightSide.isFrontLayer) drawGreataxeArm();
  if (!leftSide.isFrontLayer) drawClawArm();

  // 2. Hulking Obsidian Behemoth Torso
  const tW = Math.round(52 * wScale);
  const tY = Math.round(-28 + breath);
  ctx.fillStyle = '#18181B';
  ctx.fillRect(-tW / 2, tY, tW, 46);
  ctx.fillStyle = '#27272A';
  ctx.fillRect(-tW / 2 + 4, tY + 4, tW - 8, 38);

  if (!persp.isBack) {
    // Open Molten Furnace Core
    const cX = Math.round(persp.lookX * 3);
    const fW = Math.round(28 * wScale * Math.min(1.3, coreFlare * 0.9));
    ctx.fillStyle = '#991B1B';
    ctx.fillRect(cX - fW / 2, tY + 6, fW, 30);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(cX - fW * 0.36, tY + 10, fW * 0.72, 22);
    ctx.fillStyle = coreFlare > 1.25 ? '#FFFFFF' : '#FEF08A';
    ctx.fillRect(cX - fW * 0.2, tY + 14, fW * 0.4, 14);
  } else {
    // Dorsal Volcanic Spine Vents & Magma Spine Plates
    for (let s = 0; s < 4; s++) {
      const sy = tY + 5 + s * 9;
      ctx.fillStyle = '#F97316';
      ctx.fillRect(-4, sy, 8, 5);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-2, sy + 1, 4, 3);
      // Obsidian dorsal ridge plates
      ctx.fillStyle = '#09090B';
      ctx.fillRect(-10, sy - 1, 5, 6);
      ctx.fillRect(5, sy - 1, 5, 6);
    }
  }

  // Craggy Obsidian Shoulder Pauldrons
  const pX = Math.round(tW / 2);
  ctx.fillStyle = '#27272A';
  ctx.fillRect(-pX - 7, tY - 4, 13, 18);
  ctx.fillRect(pX - 6, tY - 4, 13, 18);
  ctx.fillStyle = '#F97316';
  ctx.fillRect(-pX - 5, tY, 9, 3);
  ctx.fillRect(pX - 4, tY, 9, 3);

  // 3. Horned Magma Sovereign Head & Living Flame Hair
  const headW = persp.isSide ? 20 : persp.isDiag ? 24 : 28;
  const headX = Math.round(persp.lookX * 3);
  const headY = Math.round(tY - 19);
  ctx.fillStyle = '#18181B';
  ctx.fillRect(headX - headW / 2, headY, headW, 20);

  // Sweeping Basalt Horns with Molten Tips
  ctx.fillStyle = '#27272A';
  ctx.fillRect(headX - headW / 2 - 9, headY - 12, 9, 18);
  ctx.fillRect(headX + headW / 2, headY - 12, 9, 18);
  ctx.fillRect(headX - headW / 2 - 14, headY - 22, 9, 12);
  ctx.fillRect(headX + headW / 2 + 5, headY - 22, 9, 12);
  ctx.fillStyle = '#F97316';
  ctx.fillRect(headX - headW / 2 - 14, headY - 26, 6, 6);
  ctx.fillRect(headX + headW / 2 + 8, headY - 26, 6, 6);

  // Flickering Living Flame Hair Crown (sways opposite movement)
  const flameTrail = -pose.dirX * 3.5 * anim.moveSpeedNorm;
  for (let f = 0; f < 5; f++) {
    const fH = 10 + Math.sin(now * 0.022 + f * 1.4) * 5 * coreFlare;
    const fx = headX - 10 + f * 4.5 + flameTrail * 0.5;
    ctx.fillStyle = f % 2 === 0 ? '#F97316' : '#FEF08A';
    ctx.fillRect(Math.round(fx), Math.round(headY - fH), 4, Math.round(fH));
  }

  if (!persp.isBack) {
    const eShift = Math.round(persp.lookX * (persp.isSide ? 4 : 2.5));
    ctx.fillStyle = '#FEF08A';
    if (persp.isSide) {
      ctx.fillRect(headX + eShift - 2, headY + 7, 6, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(headX + eShift, headY + 8, 2, 2);
    } else {
      ctx.fillRect(headX + eShift - 8, headY + 7, 6, 4);
      ctx.fillRect(headX + eShift + 2, headY + 7, 6, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(headX + eShift - 6, headY + 8, 2, 2);
      ctx.fillRect(headX + eShift + 4, headY + 8, 2, 2);
    }
  } else {
    // Basalt nape magma cracks
    ctx.fillStyle = '#F97316';
    ctx.fillRect(headX - 3, headY + 5, 6, 3);
    ctx.fillRect(headX - 1, headY + 8, 2, 8);
  }

  if (rightSide.isFrontLayer) drawGreataxeArm();
  if (leftSide.isFrontLayer) drawClawArm();

  // Rising volcanic embers
  for (let i = 0; i < 6; i++) {
    const sparkT = (now * 0.0017 + i * 0.19) % 1;
    const sx = -24 + ((i * 17 + 5) % 48) + Math.sin(now * 0.01 + i) * 5 - pose.dirX * sparkT * 10;
    const sy = 10 - sparkT * 68;
    ctx.fillStyle = sparkT > 0.5 ? '#F97316' : '#FEF08A';
    ctx.fillRect(Math.round(sx), Math.round(sy), 2.5, 2.5);
  }

  ctx.restore();
  drawStatusOverlay(ctx, x, y, en?.radius ?? 28, en, anim, now);
  ctx.restore();
}

// ============================================================================
// FLOOR 4 BOSS: VOID-EATER MALICE — Unsettling Asymmetrical Void Horror
// Slightly humanoid crooked torso & crouched legs, NEVER mirrored blindly!
// Right arm: massive jagged Void-Scythe Blade Limb + twin shoulder spines;
// Left side: gaping fanged Shoulder-Maw + twin undulating Void Whip-Tendrils;
// Asymmetrical 3-eyed crooked skull & off-center pulsing Singularity Heart.
// ============================================================================

export function drawMaliceBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState,
  facing?: DirectionalPose,
  animIn?: BossVisualAnimState
): void {
  const pose = facing ?? (en ? resolveEnemyDirection8(en) : direction8ToPose('S', false));
  const anim = animIn ?? deriveStatelessBossAnim('malice', en, pose, now);
  const persp = getPerspective(pose);
  const isEnraged = Boolean(en?.enraged);
  const isDeath = anim.action === 'death';

  // Unnatural twitching offset + asymmetrical core pulse
  const headTwitch = Math.sin(now * 0.013) > 0.92 ? 0.2 : Math.sin(now * 0.004) * 0.08;
  const hoverBob = Math.sin(now * 0.0052) * 4.5;
  const strideAmp = anim.action === 'move' ? 0.45 + anim.moveSpeedNorm * 0.65 : 0;
  const stepCycle = anim.walkCycle;

  let squashX = 1;
  let squashY = 1;
  let leanX = pose.dirX * 5 * anim.moveSpeedNorm;
  let leanY = pose.dirY * 3 * anim.moveSpeedNorm;
  let scytheAngle = 0.15 + Math.sin(now * 0.006) * 0.12;
  let tendrilExtend = 0;
  let mawOpen = Math.abs(Math.sin(now * 0.007)) * 3;
  let coreScale = 1 + Math.sin(now * 0.009) * 0.16;
  let deathAlpha = 1;

  if (anim.action === 'aoe' && anim.abilityKey === 'singularity') {
    const p = anim.progress;
    if (p < 0.55) {
      const u = smoothStep(p / 0.55);
      scytheAngle = -1.6 * u;
      coreScale = 1.45 - 0.55 * u;
      tendrilExtend = -4 * u;
    } else if (p < 0.85) {
      const s = smoothStep((p - 0.55) / 0.3);
      scytheAngle = -1.6 + 2.8 * s;
      coreScale = 0.9 + 0.85 * Math.sin(s * Math.PI);
      mawOpen = 7 * Math.sin(s * Math.PI);
    }
  } else if (anim.action === 'attack' && anim.abilityKey === 'tendril_flurry') {
    const p = anim.progress;
    const lash = Math.sin(p * Math.PI);
    tendrilExtend = 18 * lash;
    scytheAngle = -0.5 * lash;
    leanX += pose.dirX * 7 * lash;
    mawOpen = 6 * lash;
  } else if (anim.action === 'teleport' && anim.abilityKey === 'void_step') {
    const p = anim.progress;
    if (p < 0.24) {
      const snap = smoothStep(p / 0.24);
      squashX = 0.65 + 0.35 * snap;
      squashY = 1.35 - 0.35 * snap;
      scytheAngle = -1.5;
    } else {
      const slash = smoothStep(Math.min(1, (p - 0.24) / 0.36));
      scytheAngle = -1.5 + 2.95 * slash;
      leanX += pose.dirX * 10 * Math.sin(slash * Math.PI);
    }
  } else if (anim.action === 'spin' && anim.abilityKey === 'abyssal_nova') {
    const p = anim.progress;
    const swell = Math.sin(p * Math.PI);
    coreScale = 1 + 0.8 * swell;
    tendrilExtend = 14 * swell;
    scytheAngle = -1.2 * swell;
    squashX = 1 + 0.18 * swell;
  } else if (anim.action === 'summon') {
    const swell = Math.sin(anim.progress * Math.PI);
    mawOpen = 8 * swell;
    coreScale = 1 + 0.4 * swell;
  }

  if (isDeath) {
    const dp = smoothStep(anim.deathProgress);
    squashX = Math.max(0.08, 1 - dp * 0.9);
    squashY = Math.max(0.08, 1 - dp * 0.9);
    coreScale = 1.6 * (1 - dp);
    deathAlpha = Math.max(0, 1 - dp);
  }

  const bx = Math.round(x + leanX + anim.hitRecoilX);
  const by = Math.round(y - 5 + hoverBob + leanY + anim.hitRecoilY);
  const wScale = persp.widthScale;

  ctx.save();
  ctx.globalAlpha *= deathAlpha;

  // 1. Swirling Singularity Accretion Horizon
  const voidGrad = ctx.createRadialGradient(x, y + 18, 4, x, y + 18, 40);
  voidGrad.addColorStop(0, 'rgba(147, 51, 234, 0.58)');
  voidGrad.addColorStop(0.5, 'rgba(88, 28, 135, 0.36)');
  voidGrad.addColorStop(1, 'rgba(15, 7, 24, 0)');
  ctx.fillStyle = voidGrad;
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 40, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(squashX, squashY);

  // IMPORTANT: Explicitly distinguish Malice's RIGHT (Giant Scythe-Claw Arm) vs LEFT (Shoulder Maw + Whip Tendrils)
  // using getAnatomicalSidePos so flipping West vs East NEVER mirrors its asymmetric limbs!
  const scytheSide = getAnatomicalSidePos(persp, 'right', 26 * wScale + 4, 4);
  const tendrilSide = getAnatomicalSidePos(persp, 'left', 22 * wScale + 3, 4);
  const legR = getAnatomicalSidePos(persp, 'right', 10 * wScale + 2, 3);
  const legL = getAnatomicalSidePos(persp, 'left', 8 * wScale + 1, 3);

  const drawPredatoryLegs = () => {
    const legs = [
      { pos: legR, stride: Math.sin(stepCycle) * 7 * strideAmp, thick: 8 },
      { pos: legL, stride: -Math.sin(stepCycle) * 7 * strideAmp, thick: 6 },
    ].sort((a, b) => a.pos.oy - b.pos.oy);
    for (const lg of legs) {
      const lx = Math.round(lg.pos.ox + pose.dirX * lg.stride * 0.55);
      const ly = Math.round(14 + lg.pos.oy + pose.dirY * lg.stride * 0.45);
      // Digitigrade void leg
      ctx.fillStyle = '#0F0718';
      ctx.fillRect(lx - lg.thick / 2, ly - 5, lg.thick, 10);
      ctx.fillStyle = '#4C1D95';
      ctx.fillRect(lx - lg.thick / 2 + 1, ly + 3, lg.thick - 2, 7);
      ctx.fillStyle = '#F43F5E';
      ctx.fillRect(lx - 1, ly + 8, 3, 3);
    }
  };

  const drawRightScytheArm = () => {
    const sx = Math.round(scytheSide.ox);
    const sy = Math.round(-12 + scytheSide.oy);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(scytheAngle + persp.lookX * 0.2);

    // Jagged asymmetrical twin horn-pauldrons on right shoulder ONLY
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-5, -14, 10, 12);
    ctx.fillStyle = '#9333EA';
    ctx.fillRect(-2, -22, 4, 9);

    // Oversized Hooked Void-Scythe Arm
    ctx.fillStyle = '#2E1065';
    ctx.fillRect(-4, -2, 8, 22);
    ctx.fillStyle = '#0F0718';
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(14, 28);
    ctx.lineTo(4, 44);
    ctx.lineTo(-5, 22);
    ctx.closePath();
    ctx.fill();
    // Glowing crimson void-scythe edge
    ctx.strokeStyle = isEnraged ? '#FB7185' : '#F43F5E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(14, 28);
    ctx.lineTo(4, 44);
    ctx.stroke();
    ctx.restore();
  };

  const drawLeftMawAndTendrils = () => {
    const tx = Math.round(tendrilSide.ox);
    const ty = Math.round(-8 + tendrilSide.oy);
    // Gaping Shoulder-Maw on LEFT side ONLY
    ctx.fillStyle = '#3B0764';
    ctx.fillRect(tx - 6, ty - 8, 12, 12);
    ctx.fillStyle = '#090311';
    ctx.fillRect(tx - 4, ty - 5, 8, Math.round(5 + mawOpen * 0.5));
    ctx.fillStyle = '#F43F5E';
    ctx.fillRect(tx - 3, ty - 5, 2, 2);
    ctx.fillRect(tx + 1, ty - 5, 2, 2);

    // 2 Articulated Whip-Tendrils whipping forward/outward during Flurry
    for (let t = 0; t < 2; t++) {
      const phase = now * 0.008 + t * 2.1;
      const reachX = tx + pose.dirX * (8 + tendrilExtend) + (t === 0 ? -7 : 5);
      const reachY = ty + 14 + pose.dirY * (4 + tendrilExtend * 0.5) + Math.sin(phase) * 7;
      ctx.strokeStyle = t === 0 ? '#7C3AED' : '#9333EA';
      ctx.lineWidth = t === 0 ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 2);
      ctx.quadraticCurveTo(tx + Math.cos(phase) * 10, ty + 10, reachX, reachY);
      ctx.stroke();
      ctx.fillStyle = '#F43F5E';
      ctx.fillRect(Math.round(reachX - 2), Math.round(reachY - 2), 4, 4);
    }
  };

  drawPredatoryLegs();
  if (!scytheSide.isFrontLayer) drawRightScytheArm();
  if (!tendrilSide.isFrontLayer) drawLeftMawAndTendrils();

  // 2. Crooked Slightly-Humanoid Ribcage Torso
  const torsoW = Math.round(36 * wScale);
  ctx.fillStyle = '#0F0718';
  ctx.beginPath();
  ctx.moveTo(-torsoW * 0.55, -24);
  ctx.lineTo(torsoW * 0.48, -21); // crooked asymmetrical shoulder height!
  ctx.lineTo(torsoW * 0.35, 16);
  ctx.lineTo(-torsoW * 0.42, 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2E1065';
  ctx.fillRect(-Math.round(torsoW * 0.36), -18, Math.round(torsoW * 0.72), 30);

  if (!persp.isBack) {
    // Exposed Dark-Matter Rib Arches & Off-Center Singularity Heart
    const heartX = Math.round(persp.lookX * 3 - 2);
    const r = 7 * coreScale;
    ctx.fillStyle = '#9333EA';
    ctx.beginPath();
    ctx.arc(heartX, -4, r + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#F43F5E';
    ctx.beginPath();
    ctx.arc(heartX, -4, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(heartX - 2, -6, 4, 4);

    // Jagged asymmetrical rib hooks curving toward heart
    ctx.fillStyle = '#C084FC';
    ctx.fillRect(-Math.round(torsoW * 0.38), -12, 8, 2.5);
    ctx.fillRect(Math.round(torsoW * 0.14), -8, 8, 2.5);
    ctx.fillRect(-Math.round(torsoW * 0.34), 2, 7, 2.5);
  } else {
    // Jagged twisted dorsal void spines curving off-center
    for (let sp = 0; sp < 4; sp++) {
      const sx = (sp % 2 === 0 ? -2 : 2);
      const sy = -18 + sp * 9;
      ctx.fillStyle = '#581C87';
      ctx.fillRect(sx - 3, sy, 6, 6);
      ctx.fillStyle = '#F43F5E';
      ctx.fillRect(sx - 1, sy + 1, 2, 3);
    }
  }

  // 3. Crooked Asymmetrical 3-Eyed Abyssal Skull
  ctx.save();
  ctx.translate(Math.round(persp.lookX * 3), -29);
  ctx.rotate(headTwitch);

  const headW = persp.isSide ? 18 : persp.isDiag ? 22 : 26;
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-headW / 2, -9, headW, 17);
  // Asymmetrical horns: tall curved spire on right, broken jagged stub on left
  ctx.fillStyle = '#311042';
  ctx.fillRect(-headW / 2 - 4, -23, 5, 16);
  ctx.fillRect(headW / 2 - 1, -15, 5, 8);
  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(-headW / 2 - 4, -26, 4, 4);

  if (!persp.isBack) {
    const faceX = Math.round(persp.lookX * (persp.isSide ? 4 : 2));
    // Asymmetric 3 Crimson Slit Eyes (2 normal + 1 off-center upper brow eye)
    ctx.fillStyle = '#F43F5E';
    if (persp.isSide) {
      ctx.fillRect(faceX - 1, -3, 6, 3);
      ctx.fillRect(faceX + 1, -7, 4, 2.5);
    } else {
      ctx.fillRect(faceX - 8, -3, 6, 3);
      ctx.fillRect(faceX + 2, -2, 5, 3);
      ctx.fillRect(faceX - 4, -7, 4, 2.5);
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(faceX - 2, -6.5, 1.5, 1.5);
    // Split mandible maw
    ctx.fillStyle = '#090311';
    ctx.fillRect(faceX - 6, 3, 12, 4);
    ctx.fillStyle = '#E879F9';
    ctx.fillRect(faceX - 5, 4, 2, 2);
    ctx.fillRect(faceX + 3, 4, 2, 2);
  } else {
    // Rear tendrils & pulsing void cleft
    ctx.fillStyle = '#4C1D95';
    ctx.fillRect(-headW / 2 + 2, -6, headW - 4, 12);
    ctx.fillStyle = '#9333EA';
    ctx.fillRect(-1.5, -5, 3, 8);
  }
  ctx.restore();

  if (scytheSide.isFrontLayer) drawRightScytheArm();
  if (tendrilSide.isFrontLayer) drawLeftMawAndTendrils();

  // 4. Orbiting Void Shards
  for (let i = 0; i < 4; i++) {
    const ang = now * 0.0032 + (i * Math.PI) / 2;
    const dist = 33 * (0.85 + coreScale * 0.15);
    const ox = Math.cos(ang) * dist;
    const oy = -4 + Math.sin(ang) * (dist * 0.5);
    ctx.fillStyle = '#9333EA';
    ctx.fillRect(Math.round(ox - 3), Math.round(oy - 3), 6, 6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(Math.round(ox - 1), Math.round(oy - 1), 2, 2);
  }

  ctx.restore();
  drawStatusOverlay(ctx, x, y, en?.radius ?? 28, en, anim, now);
  ctx.restore();
}

// ============================================================================
// FLOOR 5 BOSS: ARCHON OF NOTHINGNESS — Distinct Cosmic Entity
// Recognizable central horned/crowned star-forged body (NOT a blur or plain knight),
// separated floating chest/shoulder sigil armor, rotating astrolabe zodiac halo,
// articulated crystalline quad-wings angled by perspective, Cosmic Greatblade,
// synchronized Supernova, Starbeam Cascade, Cosmic Volley, and Radial Burst spin.
// ============================================================================

export function drawArchonBoss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number,
  en?: EnemyState,
  facing?: DirectionalPose,
  animIn?: BossVisualAnimState
): void {
  const pose = facing ?? (en ? resolveEnemyDirection8(en) : direction8ToPose('S', false));
  const anim = animIn ?? deriveStatelessBossAnim('archon', en, pose, now);
  const persp = getPerspective(pose);
  const isEnraged = Boolean(en?.enraged);
  const isDeath = anim.action === 'death';

  const starFloat = Math.sin(now * 0.0036) * 5;
  const wingFlap = Math.sin(now * 0.0044) * 4.5;

  let liftY = 0;
  let leanX = pose.dirX * 5 * anim.moveSpeedNorm;
  let leanY = pose.dirY * 3 * anim.moveSpeedNorm;
  let bladeAngle = 0.05 + Math.sin(now * 0.005) * 0.07;
  let haloScale = 1;
  let haloSpeedBoost = 1;
  let wingSpread = 1;
  let plateRadiusOffset = 0;
  let bodySpinRot = 0;
  let sigilThrust = 0;
  let deathAlpha = 1;

  if (anim.action === 'aoe' && anim.abilityKey === 'supernova') {
    const p = anim.progress;
    if (p < 0.58) {
      const c = smoothStep(p / 0.58);
      haloScale = 1 - 0.38 * c;
      wingSpread = 1 - 0.32 * c;
      plateRadiusOffset = -7 * c;
      bladeAngle = -0.35 * c;
    } else if (p < 0.84) {
      const b = smoothStep((p - 0.58) / 0.26);
      haloScale = 0.62 + 0.82 * b;
      wingSpread = 0.68 + 0.62 * b;
      plateRadiusOffset = -7 + 18 * b;
      liftY = -10 * b;
      bladeAngle = -2.2 * b;
      haloSpeedBoost = 3.2;
    } else {
      const r = smoothStep((p - 0.84) / 0.16);
      haloScale = 1.44 - 0.44 * r;
      wingSpread = 1.3 - 0.3 * r;
      plateRadiusOffset = 11 * (1 - r);
      liftY = -10 * (1 - r);
    }
  } else if (anim.action === 'cast' && anim.abilityKey === 'starbeam_cascade') {
    const p = anim.progress;
    const hold = p < 0.35 ? smoothStep(p / 0.35) : p < 0.78 ? 1 : 1 - smoothStep((p - 0.78) / 0.22);
    bladeAngle = -0.15 * hold;
    liftY = -9 * hold;
    sigilThrust = 10 * hold;
    haloScale = 1 + 0.22 * hold;
  } else if (anim.action === 'attack' && anim.abilityKey === 'cosmic_volley') {
    const p = anim.progress;
    if (p < 0.25) {
      const w = smoothStep(p / 0.25);
      bladeAngle = -1.3 * w;
      bodySpinRot = (persp.lookX || 1) * -0.15 * w;
    } else if (p < 0.6) {
      const s = smoothStep((p - 0.25) / 0.35);
      bladeAngle = -1.3 + 2.75 * s;
      bodySpinRot = (persp.lookX || 1) * (-0.15 + 0.36 * s);
      sigilThrust = 11 * Math.sin(s * Math.PI);
    } else {
      const r = smoothStep((p - 0.6) / 0.4);
      bladeAngle = 1.45 * (1 - r);
      bodySpinRot = (persp.lookX || 1) * 0.21 * (1 - r);
    }
  } else if (anim.action === 'spin' && anim.abilityKey === 'radial_burst') {
    const p = anim.progress;
    bodySpinRot = p * Math.PI * 2;
    wingSpread = 1 + 0.3 * Math.sin(p * Math.PI);
    haloScale = 1 + 0.28 * Math.sin(p * Math.PI);
    haloSpeedBoost = 3.5;
  } else if (anim.action === 'summon') {
    const swell = Math.sin(anim.progress * Math.PI);
    liftY = -9 * swell;
    haloScale = 1 + 0.25 * swell;
  }

  if (isDeath) {
    const dp = smoothStep(anim.deathProgress);
    liftY -= dp * 20; // ascends slightly while shattering
    wingSpread = 1 + dp * 0.7;
    haloScale = 1 + dp * 0.65;
    plateRadiusOffset = dp * 18;
    deathAlpha = Math.max(0, 1 - dp);
  }

  const bx = Math.round(x + leanX + anim.hitRecoilX);
  const by = Math.round(y - 8 + starFloat + liftY + leanY + anim.hitRecoilY);
  const wScale = persp.widthScale;

  ctx.save();
  ctx.globalAlpha *= deathAlpha;

  // 1. Celestial Astral Ground Glyph
  const starGrad = ctx.createRadialGradient(x, y + 18, 5, x, y + 18, 44);
  starGrad.addColorStop(0, 'rgba(56, 189, 248, 0.52)');
  starGrad.addColorStop(0.5, 'rgba(14, 165, 233, 0.3)');
  starGrad.addColorStop(1, 'rgba(7, 18, 28, 0)');
  ctx.fillStyle = starGrad;
  ctx.beginPath();
  ctx.ellipse(x, y + 18, 44, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(bodySpinRot);

  // 2. Concentric Rotating Astrolabe Zodiac Halo (tilts with 3D perspective)
  const haloRot = now * 0.0016 * haloSpeedBoost;
  const drawHalo = () => {
    ctx.save();
    ctx.translate(0, -34);
    ctx.scale(persp.isSide ? 0.62 : persp.isDiag ? 0.85 : 1, 1);
    ctx.rotate(haloRot);
    const outerR = 30 * haloScale;
    const innerR = 20 * haloScale;
    ctx.strokeStyle = isEnraged ? 'rgba(244, 114, 182, 0.88)' : 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, outerR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(254, 240, 138, 0.72)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, innerR, 0, Math.PI * 2);
    ctx.stroke();

    for (let h = 0; h < 8; h++) {
      const hAng = (h * Math.PI) / 4;
      const hx = Math.cos(hAng) * outerR;
      const hy = Math.sin(hAng) * outerR;
      ctx.fillStyle = h % 2 === 0 ? '#FEF08A' : '#38BDF8';
      ctx.fillRect(Math.round(hx - 2), Math.round(hy - 2), 4, 4);
    }
    ctx.restore();
  };

  // 3. Articulated Starlight Crystal Quad-Wings (angled cleanly per direction!)
  const drawWings = () => {
    const wingTrail = -pose.dirX * 6 * anim.moveSpeedNorm;
    const wSpan = 38 * wingSpread * (persp.isSide ? 0.65 : wScale);
    // Upper crystal wings
    ctx.fillStyle = 'rgba(56, 189, 248, 0.78)';
    ctx.beginPath();
    ctx.moveTo(-8 * wScale, -16);
    ctx.lineTo(-wSpan + wingTrail, -36 + wingFlap);
    ctx.lineTo(-wSpan * 0.65 + wingTrail, -2 + wingFlap * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(8 * wScale, -16);
    ctx.lineTo(wSpan + wingTrail, -36 - wingFlap);
    ctx.lineTo(wSpan * 0.65 + wingTrail, -2 - wingFlap * 0.5);
    ctx.closePath();
    ctx.fill();

    // Golden crystal cores inside upper wings
    ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
    ctx.fillRect(Math.round(-wSpan * 0.72 + wingTrail), Math.round(-25 + wingFlap * 0.6), 9, 18);
    ctx.fillRect(Math.round(wSpan * 0.72 - 9 + wingTrail), Math.round(-25 - wingFlap * 0.6), 9, 18);

    // Lower smaller astral pinions
    ctx.fillStyle = 'rgba(2, 132, 199, 0.72)';
    ctx.fillRect(Math.round(-wSpan * 0.68 + wingTrail), Math.round(0 + wingFlap * 0.4), 11, 17);
    ctx.fillRect(Math.round(wSpan * 0.68 - 11 + wingTrail), Math.round(0 - wingFlap * 0.4), 11, 17);
  };

  // Draw halo & wings behind central cosmic body when facing forward, or wings in front of torso edge on back!
  if (!persp.isBack) {
    drawHalo();
    drawWings();
  }

  const rightSide = getAnatomicalSidePos(persp, 'right', 25 * wScale + 4 + plateRadiusOffset, 4);
  const leftSide = getAnatomicalSidePos(persp, 'left', 22 * wScale + 3 + plateRadiusOffset, 4);

  const drawBladeArm = () => {
    const bxArm = Math.round(rightSide.ox);
    const byArm = Math.round(-12 + rightSide.oy);
    ctx.save();
    ctx.translate(bxArm, byArm);
    ctx.rotate(bladeAngle + persp.lookX * 0.14);

    // Detached hovering gauntlet
    ctx.fillStyle = '#0369A1';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(-3, -3, 6, 2);

    // Star-Forged Cosmic Greatblade
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(-7, 0, 14, 4);
    ctx.fillStyle = '#A16207';
    ctx.fillRect(-2, 4, 4, 8);
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(-3.5, -52, 7, 52);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-2, -50, 4, 48);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1, -48, 2, 44);
    ctx.restore();
  };

  const drawAstralOrbArm = () => {
    const lxArm = Math.round(leftSide.ox + pose.dirX * sigilThrust);
    const lyArm = Math.round(-6 + leftSide.oy + pose.dirY * sigilThrust * 0.5);
    ctx.fillStyle = '#0369A1';
    ctx.fillRect(lxArm - 4, lyArm - 4, 8, 8);
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(lxArm + pose.dirX * 5, lyArm - 4, 4.5, 0, Math.PI * 2);
    ctx.fill();
  };

  if (!rightSide.isFrontLayer) drawBladeArm();
  if (!leftSide.isFrontLayer) drawAstralOrbArm();

  // 4. Recognizable Central Star-Forged Body (Floating Lower Greaves + Segmented Torso)
  const legW = Math.round(14 * wScale);
  ctx.fillStyle = '#0B1A30';
  ctx.fillRect(-legW, 14, 7, 15);
  ctx.fillRect(legW - 7, 14, 7, 15);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-legW + 1, 16, 5, 10);
  ctx.fillRect(legW - 6, 16, 5, 10);

  const tW = Math.round(40 * wScale);
  ctx.fillStyle = '#0B1A30';
  ctx.fillRect(-tW / 2, -22, tW, 38);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-tW / 2 + 4, -18, tW - 8, 30);

  // Detached Hovering Shoulder Sigil Plates
  const spX = Math.round(tW / 2 + 5 + plateRadiusOffset * 0.5);
  ctx.fillStyle = '#0369A1';
  ctx.fillRect(-spX - 4, -26, 9, 15);
  ctx.fillRect(spX - 5, -26, 9, 15);
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-spX - 3, -24, 7, 3);
  ctx.fillRect(spX - 4, -24, 7, 3);

  // Pulsating Celestial Core (Front/Diagonal visible star core; Back shows spinal glyph seal)
  if (!persp.isBack) {
    const cX = Math.round(persp.lookX * 2.5);
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.moveTo(cX, -13);
    ctx.lineTo(cX + 9, -4);
    ctx.lineTo(cX, 5);
    ctx.lineTo(cX - 9, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(cX - 4, -8, 8, 8);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cX - 2, -6, 4, 4);
  } else {
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(-2, -16, 4, 24);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-6, -8, 12, 4);
  }

  // 5. Distinct Faceted Cosmic Crown-Helm (Monstrous Astral Visage, not a plain knight)
  const hW = persp.isSide ? 18 : persp.isDiag ? 22 : 26;
  const hX = Math.round(persp.lookX * 2.5);
  const hY = -41;
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(hX - hW / 2, hY, hW, 19);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(hX - hW / 2 + 2, hY + 3, hW - 4, 13);

  // Towering Triple Golden Spire Crown
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(hX - hW / 2, hY - 6, hW, 6);
  ctx.fillRect(hX - hW / 2, hY - 14, 4, 9);
  ctx.fillRect(hX - 2, hY - 19, 4, 14);
  ctx.fillRect(hX + hW / 2 - 4, hY - 14, 4, 9);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(hX - 1, hY - 17, 2, 6);

  if (!persp.isBack) {
    // Vertical glowing cosmic eye cleft + twin radiant eye slits
    const eX = Math.round(persp.lookX * (persp.isSide ? 4 : 2));
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(hX + eX - 1.5, hY + 4, 3, 10);
    if (!persp.isSide) {
      ctx.fillRect(hX + eX - 7, hY + 7, 5, 3);
      ctx.fillRect(hX + eX + 2, hY + 7, 5, 3);
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(hX + eX - 1, hY + 6, 2, 5);
  } else {
    ctx.fillStyle = '#0B1A30';
    ctx.fillRect(hX - hW / 2 + 3, hY + 4, hW - 6, 12);
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(hX - 2, hY + 5, 4, 9);
  }

  if (persp.isBack) {
    drawWings();
    drawHalo();
  }

  if (rightSide.isFrontLayer) drawBladeArm();
  if (leftSide.isFrontLayer) drawAstralOrbArm();

  // Rising stardust motes
  for (let s = 0; s < 5; s++) {
    const sparkT = (now * 0.0015 + s * 0.2) % 1;
    const sx = -26 + ((s * 19 + 5) % 52) + Math.sin(now * 0.008 + s) * 6;
    const sy = 12 - sparkT * 68;
    ctx.fillStyle = s % 2 === 0 ? '#38BDF8' : '#FEF08A';
    ctx.fillRect(Math.round(sx), Math.round(sy), 2.5, 2.5);
  }

  ctx.restore();
  drawStatusOverlay(ctx, x, y, en?.radius ?? 28, en, anim, now);
  ctx.restore();
}

export function drawFirstFiveBossByKey(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bossKey: FirstFiveBossKey,
  now: number,
  en?: EnemyState,
  facing?: DirectionalPose,
  animState?: BossVisualAnimState
): void {
  if (bossKey === 'vaelor') {
    drawVaelorBoss(ctx, x, y, now, en, facing, animState);
  } else if (bossKey === 'ignis') {
    drawIgnisBoss(ctx, x, y, now, en, facing, animState);
  } else if (bossKey === 'malice') {
    drawMaliceBoss(ctx, x, y, now, en, facing, animState);
  } else if (bossKey === 'archon') {
    drawArchonBoss(ctx, x, y, now, en, facing, animState);
  } else {
    drawMalakorBoss(ctx, x, y, now, en, facing, animState);
  }
}
