import type { HeroClassId, PlayerState } from '../shared/types.ts';
import {
  DEFAULT_VESTMENT_BY_CLASS,
  DEFAULT_WEAPON_BY_CLASS,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
} from '../shared/armaments.ts';
import {
  angleToDirection8,
  direction8ToPose,
  type Direction8,
  type DirectionalPose,
} from './directionalFacing.ts';

export type HeroSwingKind = 'primary' | 'tactical' | 'ult';

export interface HeroRenderOptions {
  aimAngle: number;
  bob: number;
  moving: boolean;
  now: number;
  isPreview?: boolean;
  swingProgress?: number;
  swingKind?: HeroSwingKind;
  facingLeft?: boolean;
  facingDirection?: Direction8;
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
}

function resolveVisualWeaponId(
  heroClass: HeroClassId,
  equippedWeapon: string | null | undefined
): string | null {
  if (equippedWeapon === undefined) {
    return DEFAULT_WEAPON_BY_CLASS[heroClass];
  }
  if (equippedWeapon === null) {
    return null;
  }
  return resolveEquippedWeaponForClass(heroClass, equippedWeapon)?.id ?? null;
}

function resolveVisualVestmentId(
  heroClass: HeroClassId,
  equippedVestment: string | null | undefined
): string | null {
  if (equippedVestment === undefined) {
    return DEFAULT_VESTMENT_BY_CLASS[heroClass];
  }
  if (equippedVestment === null) {
    return null;
  }
  return resolveEquippedVestmentForClass(heroClass, equippedVestment)?.id ?? null;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolveSpritePose(
  p: Pick<PlayerState, 'vx' | 'vy'>,
  options: HeroRenderOptions
): DirectionalPose {
  if (options.facingDirection) {
    return direction8ToPose(options.facingDirection, options.facingLeft ?? false);
  }
  if (options.facingLeft !== undefined) {
    return direction8ToPose(options.facingLeft ? 'W' : 'E', options.facingLeft);
  }
  const vx = p.vx || 0;
  const vy = p.vy || 0;
  if (options.moving && Math.hypot(vx, vy) > 0.5) {
    return direction8ToPose(angleToDirection8(Math.atan2(vy, vx)), vx < 0);
  }
  return direction8ToPose(
    angleToDirection8(options.aimAngle),
    Math.cos(options.aimAngle) < 0
  );
}

/**
 * Draws a crisp, animated pixel-art hero character with true 8-directional poses
 * (N, NE, E, SE, S, SW, W, NW), articulated limbs, depth-layered capes/robes/quivers,
 * class-distinct silhouettes, and independent 360-degree weapon aiming & swings.
 */
export function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  p: Pick<PlayerState, 'heroClass' | 'attackAnimMs' | 'vx' | 'vy' | 'hasteMs' | 'shield'> &
    Partial<Pick<PlayerState, 'equippedWeapon' | 'equippedVestment'>>,
  hx: number,
  hy: number,
  options: HeroRenderOptions
): void {
  const { aimAngle, bob, moving, now } = options;
  const pose = resolveSpritePose(p, options);
  const rawWeapon =
    options.equippedWeapon !== undefined ? options.equippedWeapon : p.equippedWeapon;
  const weaponId = resolveVisualWeaponId(p.heroClass, rawWeapon);
  const rawVestment =
    options.equippedVestment !== undefined ? options.equippedVestment : p.equippedVestment;
  const vestmentId = resolveVisualVestmentId(p.heroClass, rawVestment);

  // Pure vertical poses (N/S) stay horizontally un-mirrored for symmetric torso/head;
  // W, NW, SW mirror across Y-axis so +X in local space always points toward horizontal facing.
  const mirrorX = pose.isPureVertical ? false : pose.facingLeft;

  // Angle in local (possibly X-mirrored) sprite space pointing along exact world aimAngle
  const localAim = Math.atan2(
    Math.sin(aimAngle),
    mirrorX ? -Math.cos(aimAngle) : Math.cos(aimAngle)
  );

  const speedMag = Math.hypot(p.vx || 0, p.vy || 0);
  const isDashing = speedMag > 290;
  const walkPhase = now * (isDashing ? 0.026 : 0.017) + hx * 0.03;
  const strideA = moving ? Math.sin(walkPhase) : 0;
  const strideB = moving ? -Math.sin(walkPhase) : 0;
  const liftA = moving ? Math.max(0, -Math.cos(walkPhase)) * 2.4 : 0;
  const liftB = moving ? Math.max(0, Math.cos(walkPhase)) * 2.4 : 0;

  const idleWave = Math.sin(now * 0.0045 + hx * 0.07);
  const bodyBob = moving ? bob : idleWave * 0.75;
  const headBob = bodyBob + (moving ? Math.sin(walkPhase * 2) * 0.45 : idleWave * 0.35);

  const hasClientSwing =
    options.swingProgress !== undefined && options.swingProgress >= 0 && options.swingProgress < 1;
  const isAttacking = hasClientSwing || p.attackAnimMs > 0;
  const maxAnim = p.attackAnimMs > 245 ? 280 : p.attackAnimMs > 190 ? 240 : 190;
  const atkProgress = hasClientSwing
    ? Math.max(0, Math.min(1, options.swingProgress as number))
    : isAttacking
      ? Math.max(0, Math.min(1, 1 - p.attackAnimMs / maxAnim))
      : 0;
  const swingKind: HeroSwingKind =
    options.swingKind ?? (p.attackAnimMs > 245 ? 'ult' : p.attackAnimMs > 190 ? 'tactical' : 'primary');
  const swingAmp = swingKind === 'ult' ? 1.25 : swingKind === 'tactical' ? 1.14 : 1.0;

  // Natural directional lean: full forward tilt for E/W, 3/4 tilt for diagonals,
  // zero awkward side tilt when moving pure N/S (only slight swing impulse along aim X).
  const moveLeanFactor = pose.isPureVertical ? 0 : pose.isDiagonal ? 0.55 : 1.0;
  let bodyLean = moving ? (isDashing ? 0.14 : 0.06) * moveLeanFactor : 0;
  const aimSideBias = pose.isPureVertical ? Math.cos(localAim) * 0.55 : 1.0;
  if (isAttacking && (p.heroClass === 'vanguard' || p.heroClass === 'cleric')) {
    bodyLean +=
      (atkProgress < 0.24
        ? -0.1 * swingAmp
        : Math.sin(Math.min(1, (atkProgress - 0.24) / 0.76) * Math.PI) * 0.16 * swingAmp) *
      aimSideBias;
  } else if (isAttacking && (p.heroClass === 'arcanist' || p.heroClass === 'ranger')) {
    bodyLean +=
      Math.sin(atkProgress * Math.PI) *
      (p.heroClass === 'arcanist' ? 0.08 : -0.06) *
      swingAmp *
      aimSideBias;
  }

  ctx.save();
  ctx.translate(hx, hy);
  if (mirrorX) {
    ctx.scale(-1, 1);
  }
  if (bodyLean !== 0) {
    ctx.rotate(bodyLean);
  }

  const drawArgs: DrawHeroPartsContext = {
    bodyBob,
    headBob,
    strideA,
    strideB,
    liftA,
    liftB,
    moving,
    isDashing,
    idleWave,
    now,
    isAttacking,
    atkProgress,
    swingKind,
    swingAmp,
    localAim,
    walkPhase,
    pose,
    isBack: pose.verticalPlane === 'back',
    isFront: pose.verticalPlane === 'front',
    isSide: pose.verticalPlane === 'side',
    isPureVertical: pose.isPureVertical,
    isDiagonal: pose.isDiagonal,
    faceShiftX: pose.isPureVertical ? 0 : pose.isDiagonal ? 1.5 : 3,
    weaponId,
    vestmentId,
  };

  if (p.heroClass === 'vanguard') {
    drawVanguard(ctx, drawArgs);
  } else if (p.heroClass === 'ranger') {
    drawRanger(ctx, drawArgs);
  } else if (p.heroClass === 'arcanist') {
    drawArcanist(ctx, drawArgs);
  } else {
    drawCleric(ctx, drawArgs);
  }

  ctx.restore();
}

interface DrawHeroPartsContext {
  bodyBob: number;
  headBob: number;
  strideA: number;
  strideB: number;
  liftA: number;
  liftB: number;
  moving: boolean;
  isDashing: boolean;
  idleWave: number;
  now: number;
  isAttacking: boolean;
  atkProgress: number;
  swingKind: HeroSwingKind;
  swingAmp: number;
  localAim: number;
  walkPhase: number;
  pose: DirectionalPose;
  isBack: boolean;
  isFront: boolean;
  isSide: boolean;
  isPureVertical: boolean;
  isDiagonal: boolean;
  faceShiftX: number;
  weaponId: string | null;
  vestmentId: string | null;
}

function getLegPositions(
  s: DrawHeroPartsContext,
  baseY: number,
  horizScale = 3.5,
  liftFactor = 1.0
): { lx: number; ly: number; rx: number; ry: number } {
  const { strideA, strideB, liftA, liftB, isPureVertical, isDiagonal } = s;
  if (isPureVertical) {
    return {
      lx: -5.5,
      ly: baseY + strideB * 1.5 - liftB * 0.75 * liftFactor,
      rx: 1,
      ry: baseY + strideA * 1.5 - liftA * 0.75 * liftFactor,
    };
  }
  if (isDiagonal) {
    return {
      lx: -5.5 + strideB * horizScale * 0.62,
      ly: baseY + strideB * 1.0 - liftB * liftFactor,
      rx: 1 + strideA * horizScale * 0.62,
      ry: baseY + strideA * 1.0 - liftA * liftFactor,
    };
  }
  return {
    lx: -6 + strideB * horizScale,
    ly: baseY - liftB * liftFactor,
    rx: 1 + strideA * horizScale,
    ry: baseY - liftA * liftFactor,
  };
}

function drawVanguard(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    headBob,
    strideA,
    strideB,
    moving,
    isDashing,
    idleWave,
    now,
    isAttacking,
    atkProgress,
    swingKind,
    swingAmp,
    localAim,
    walkPhase,
    isBack,
    isFront,
    isPureVertical,
    isDiagonal,
    faceShiftX,
  } = s;

  const capeLift = moving
    ? (isDashing ? -5 : -2.5) + Math.sin(walkPhase * 1.4) * 1.8
    : idleWave * 1.1;

  const vestmentId = s.vestmentId;
  const isUnarmored = vestmentId === null;
  const isObsidian = vestmentId === 'vanguard_obsidian_juggernaut';
  const isSovereign = vestmentId === 'vanguard_aegis_sovereign_mail';

  const capeOuter = isObsidian ? '#1E293B' : isSovereign ? '#991B1B' : '#7F1D1D';
  const capeInner = isObsidian ? '#334155' : isSovereign ? '#B91C1C' : '#991B1B';
  const capeTrim = isObsidian ? '#CBD5E1' : isSovereign ? '#FDE047' : '#D97706';

  const drawWarCape = () => {
    if (isUnarmored) return;
    if (isPureVertical) {
      // Symmetrical billowing mantle for N / S
      const billow = moving ? Math.sin(walkPhase * 1.4) * 1.5 : idleWave * 0.9;
      ctx.fillStyle = capeOuter;
      ctx.fillRect(-9.5, -5 + bodyBob, 19, 14);
      ctx.fillRect(-10.5, 4 + bodyBob + billow * 0.4, 21, 7);
      ctx.fillStyle = capeInner;
      ctx.fillRect(-8, -4 + bodyBob, 16, 13);
      ctx.fillStyle = capeTrim;
      ctx.fillRect(-10.5, 10 + bodyBob + billow * 0.4, 21, 1.5);
      return;
    }
    const shiftX = isDiagonal ? capeLift * 0.35 : capeLift * 0.5;
    const tailX = isDiagonal ? -10 + capeLift * 0.65 : -13 + capeLift;
    ctx.fillStyle = capeOuter;
    ctx.fillRect(-11 + shiftX, -5 + bodyBob, isDiagonal ? 14 : 12, 13);
    ctx.fillRect(tailX, 4 + bodyBob, 10, 7);
    ctx.fillStyle = capeInner;
    ctx.fillRect(-10 + shiftX * 0.8, -4 + bodyBob, isDiagonal ? 12 : 10, 11);
    ctx.fillStyle = capeTrim;
    ctx.fillRect(tailX, 10 + bodyBob, 9, 1.5);
  };

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isHalberd = weaponId === 'vanguard_crimson_halberd';
  const isFlail = weaponId === 'vanguard_stormbreaker_flail';

  const drawShield = () => {
    if (isUnarmed) return;
    const shieldWave = isAttacking ? Math.sin(atkProgress * Math.PI) : 0;
    const shieldThrust = isAttacking
      ? shieldWave * (swingKind === 'tactical' ? 7.5 : 3.5 * swingAmp)
      : moving
        ? strideB * 1.4
        : idleWave * 0.5;
    const shieldAngle = isAttacking
      ? -shieldWave * (swingKind === 'tactical' ? 0.34 : 0.22 * swingAmp)
      : moving
        ? strideB * 0.08
        : 0;
    const sx = isPureVertical ? -10.5 + shieldThrust * 0.25 : -10 + shieldThrust;
    const sy = (isPureVertical ? (isFront ? 1 : -1) : -shieldWave * 1.2) + bodyBob;
    const w = isPureVertical ? 5 : 6;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(shieldAngle);
    if (isHalberd) {
      // Compact Round Crimson & Iron Buckler
      const r = isPureVertical ? 4.2 : 5;
      ctx.fillStyle = '#1E293B';
      ctx.beginPath();
      ctx.arc(-1, 0, r + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#991B1B';
      ctx.beginPath();
      ctx.arc(-1, 0, r - 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(-1.5, -0.5, r - 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-2, -1, 2, 2);
    } else if (isFlail) {
      // Bastion Wall Greatshield (Reinforced Tempest Blue & Gold)
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4.5, -9, w + 1, 18);
      ctx.fillStyle = '#1E3A8A';
      ctx.fillRect(-3.5, -8, w - 1, 16);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-3.5, -8, 1.5, 16);
      ctx.fillRect(-2, -1, w - 3, 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-4.5, -9, w + 1, 1.8);
      ctx.fillRect(-4.5, 7.2, w + 1, 1.8);
    } else {
      // Sunforged Tower Greatshield (Default)
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4, -8, w, 17);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-3, -7, w - 2, 14);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-3, -7, 2, 12);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-3, -3, w - 2, 7);
      ctx.fillRect(-4, -8, w, 1.5);
    }
    ctx.restore();
  };

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  const baseSwordAngle =
    aimCos < -0.25
      ? localAim + Math.PI / 2 + 0.32
      : moving
        ? 0.42 + aimSin * 0.22 + Math.sin(walkPhase) * 0.14
        : 0.34 + aimSin * 0.22 + idleWave * 0.06;
  const baseSwordX = isPureVertical
    ? aimCos < -0.15
      ? Math.min(-11.5, aimCos * 11)
      : Math.max(11.5, aimCos * 11)
    : aimCos < -0.35
      ? aimCos * 10.5
      : moving
        ? 9.5 + strideA * 1.4
        : 10.0;
  const baseSwordY = 1 + bodyBob + (isPureVertical ? aimSin * 2.0 : 0);

  let swordAngle = baseSwordAngle;
  let swordOffX = baseSwordX;
  let swordOffY = baseSwordY;
  let slashProgressT = -1;

  if (isAttacking) {
    const targetRot = localAim + Math.PI / 2;
    const windupAngle = targetRot - 1.48 * swingAmp;
    const windupX = aimCos * 4.5 + 2 * (aimCos >= 0 ? 1 : -1);
    const windupY = aimSin * 3 - 2 + bodyBob;
    const endAngle = targetRot + 1.25 * swingAmp;
    const strikeEndX = aimCos * (10.5 + (swingAmp - 1) * 4);
    const strikeEndY = aimSin * 9 + 1 + bodyBob;

    if (atkProgress < 0.22) {
      const t = easeOutCubic(atkProgress / 0.22);
      swordAngle = lerp(baseSwordAngle, windupAngle, t);
      swordOffX = lerp(baseSwordX, windupX, t);
      swordOffY = lerp(baseSwordY, windupY, t);
    } else if (atkProgress < 0.62) {
      const t = easeOutCubic((atkProgress - 0.22) / 0.4);
      slashProgressT = t;
      swordAngle = lerp(windupAngle, endAngle, t);
      swordOffX = lerp(windupX, strikeEndX, t) + aimCos * Math.sin(t * Math.PI) * 4.5 * swingAmp;
      swordOffY = lerp(windupY, strikeEndY, t) + aimSin * Math.sin(t * Math.PI) * 3.5 * swingAmp;
    } else {
      const t = easeOutCubic((atkProgress - 0.62) / 0.38);
      swordAngle = lerp(endAngle, baseSwordAngle, t);
      swordOffX = lerp(strikeEndX, baseSwordX, t);
      swordOffY = lerp(strikeEndY, baseSwordY, t);
    }
  }

  const drawSword = () => {
    ctx.save();
    ctx.translate(swordOffX, swordOffY);
    ctx.rotate(swordAngle);
    if (isUnarmed) {
      // Unarmed heavy gauntlet fist (no weapon in hand)
      ctx.fillStyle = '#334155';
      ctx.fillRect(-1.5, -2.5, 4.5, 5);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, -2, 3, 2.5);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-1.5, 1.5, 4.5, 1.5);
    } else if (isFlail) {
      // Stormbreaker Flail: Iron/gold handle + animated chain + spiked lightning ball
      ctx.fillStyle = '#334155';
      ctx.fillRect(-1, -6, 3, 14);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-2, -7, 5, 2);
      ctx.fillRect(-1.5, 8, 4, 2);
      // Chain & ball swing lag / whip extension
      const chainStretch = isAttacking ? 1 + Math.sin(atkProgress * Math.PI) * 0.45 : 1;
      const chainSway = isAttacking ? 0.28 : 0.16 + Math.sin(now * 0.008) * 0.2;
      ctx.save();
      ctx.translate(0.5, -7);
      ctx.rotate(chainSway);
      // 3 steel chain links
      ctx.fillStyle = '#CBD5E1';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(-1.2, -(i + 1) * 3.4 * chainStretch, 2.4, 2.4);
      }
      const ballY = -13.5 * chainStretch;
      // Electric storm aura around spiked morningstar head
      ctx.fillStyle = isAttacking ? 'rgba(56, 189, 248, 0.56)' : 'rgba(56, 189, 248, 0.26)';
      ctx.beginPath();
      ctx.arc(0, ballY, isAttacking ? 7.8 : 5.8, 0, Math.PI * 2);
      ctx.fill();
      // Jagged crackling lightning arcs around flail head
      const boltSpin = now * 0.015;
      ctx.strokeStyle = isAttacking ? '#FEF08A' : '#7DD3FC';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(boltSpin) * 4.5, ballY + Math.sin(boltSpin) * 4.5);
      ctx.lineTo(Math.cos(boltSpin + 0.5) * 7.5, ballY + Math.sin(boltSpin + 0.5) * 7.5);
      ctx.lineTo(Math.cos(boltSpin + 1.1) * 5.2, ballY + Math.sin(boltSpin + 1.1) * 5.2);
      ctx.stroke();
      // Spiked flail sphere
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4, ballY - 4, 8, 8);
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(-3, ballY - 3, 6, 6);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-2, ballY - 2, 4, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-1, ballY - 1, 2, 2);
      // Bold gold spikes
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-1, ballY - 6, 2, 2.2);
      ctx.fillRect(-6, ballY - 1, 2.2, 2);
      ctx.fillRect(3.8, ballY - 1, 2.2, 2);
      ctx.fillRect(-1, ballY + 3.8, 2, 2.2);
      ctx.restore();
    } else if (isHalberd) {
      // Crimson War Halberd: Extended crimson polearm + razor crescent axe head + spear spike
      ctx.fillStyle = '#7F1D1D';
      ctx.fillRect(-0.5, -21, 2.5, 31);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(0, -20, 1.5, 29);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(-0.5, 8, 2.5, 3); // Buttcap ferrule
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-1.5, -13, 4.5, 2); // Collar ring
      // Top spear pike
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, -29, 2.5, 8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0.5, -30, 1, 8);
      // Curved crescent axe blade
      ctx.fillStyle = '#475569';
      ctx.fillRect(1.5, -22, 5.5, 11);
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(2, -19, 2.5, 6);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(6, -23, 2, 13);
      ctx.fillRect(7.5, -21, 1.2, 9);
      // Animated crimson edge sheen gliding along crescent blade
      const edgeGlintY = -22 + ((now * 0.012) % 10);
      ctx.fillStyle = isAttacking ? '#FEF2F2' : '#FCA5A5';
      ctx.fillRect(6.5, edgeGlintY, 1.6, 2.5);
      // Rear armor-piercing fluke
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(-4.5, -18, 4, 2.5);
    } else if (!isUnarmed) {
      // Sunforged Claymore (Default) + traveling golden blade sheen
      ctx.fillStyle = '#475569';
      ctx.fillRect(-1, -1, 5, 4);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(0, -21, 3.5, 21);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(1, -22, 2.5, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(2, -21, 1, 19);
      const bladeGlint = -20 + ((now * 0.015) % 17);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(0.5, bladeGlint, 2.5, 2.5);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3.5, 0, 10, 2.5);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-3.5, 0, 1.5, 2.5);
      ctx.fillRect(5, 0, 1.5, 2.5);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(0.5, 2.5, 2.5, 4);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(0, 6.5, 3.5, 2.5);
    }
    ctx.restore();
  };

  const drawSlashCrescent = () => {
    if (slashProgressT < 0) return;
    const t = slashProgressT;
    ctx.save();
    ctx.translate(aimCos * 5.5, aimSin * 6 + bodyBob);
    ctx.rotate(localAim);
    const radiusBase = isUnarmed ? 15 : isHalberd ? 25 : 22;
    const primaryArcColor = isUnarmed
      ? 'rgba(203, 213, 225, 0.72)'
      : isHalberd
        ? 'rgba(248, 113, 113, 0.88)'
        : isFlail
          ? 'rgba(56, 189, 248, 0.9)'
          : swingKind === 'ult'
            ? 'rgba(147, 197, 253, 0.9)'
            : 'rgba(254, 240, 138, 0.85)';
    ctx.strokeStyle = primaryArcColor;
    ctx.lineWidth = (swingKind === 'tactical' || swingKind === 'ult' ? 4.2 : 3.5) * (1 - t * 0.45);
    ctx.beginPath();
    ctx.arc(2, 0, radiusBase * (1 + (swingAmp - 1) * 0.4), -1.25, -1.25 + t * 2.55);
    ctx.stroke();
    if (!isUnarmed) {
      ctx.strokeStyle = isFlail
        ? 'rgba(253, 224, 71, 0.92)'
        : isHalberd
          ? 'rgba(254, 202, 202, 0.94)'
          : 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(2, 0, (radiusBase + 2) * (1 + (swingAmp - 1) * 0.4), -1.1, -1.1 + t * 2.35);
      ctx.stroke();
      if (isFlail) {
        // Jagged electric lightning tooth sparks on Stormbreaker cleave
        const sparkAng = -1.0 + t * 2.2;
        const rSp = radiusBase * (1 + (swingAmp - 1) * 0.4);
        ctx.strokeStyle = '#E0F2FE';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(2 + Math.cos(sparkAng) * (rSp - 3), Math.sin(sparkAng) * (rSp - 3));
        ctx.lineTo(2 + Math.cos(sparkAng + 0.14) * (rSp + 5), Math.sin(sparkAng + 0.14) * (rSp + 5));
        ctx.stroke();
      } else if (isHalberd) {
        // Outer Crimson Tipper wave rim
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.65)';
        ctx.lineWidth = 2.2 * (1 - t * 0.4);
        ctx.beginPath();
        ctx.arc(2, 0, (radiusBase + 5) * (1 + (swingAmp - 1) * 0.4), -0.95, -0.95 + t * 2.0);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const drawPlume = () => {
    if (isUnarmored) return;
    const plumeWave = moving ? -3 + Math.sin(walkPhase * 1.6) * 2 : Math.sin(now * 0.009) * 1.4;
    const plumeBase = isObsidian ? '#64748B' : isSovereign ? '#F59E0B' : '#B91C1C';
    const plumeTip = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#DC2626';
    if (isPureVertical && isBack) {
      // Plume cascades down back of greathelm
      ctx.fillStyle = plumeBase;
      ctx.fillRect(-2.5, -24 + headBob, 5, 5);
      ctx.fillStyle = plumeTip;
      ctx.fillRect(-2 + plumeWave * 0.25, -20 + headBob, 4, 8);
      ctx.fillRect(-1.5 + plumeWave * 0.45, -13 + headBob, 3, 5);
      return;
    }
    if (isPureVertical && isFront) {
      ctx.fillStyle = plumeBase;
      ctx.fillRect(-2.5, -25 + headBob, 5, 5);
      ctx.fillStyle = plumeTip;
      ctx.fillRect(-2 + plumeWave * 0.2, -27 + headBob, 4, 3);
      return;
    }
    const pShift = isDiagonal ? 0.6 : 1.0;
    ctx.fillStyle = plumeBase;
    ctx.fillRect(-3, -24 + headBob, 5, 4);
    ctx.fillStyle = plumeTip;
    ctx.fillRect(-6 + plumeWave * 0.6 * pShift, -25 + headBob, 5, 3);
    ctx.fillRect(-8 + plumeWave * pShift, -23 + headBob, 4, 3);
  };

  const drawVanguardVestmentAura = () => {
    if (isSovereign) {
      const auraPulse = 0.28 + Math.sin(now * 0.006) * 0.1;
      ctx.strokeStyle = `rgba(250, 204, 21, ${auraPulse.toFixed(2)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, -6 + bodyBob, 14.5, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (isObsidian) {
      const emberAlpha = 0.18 + Math.sin(now * 0.007) * 0.08;
      ctx.fillStyle = `rgba(249, 115, 22, ${emberAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(0, -2 + bodyBob, 13, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const weaponBehind = isBack && aimSin < -0.45 && Math.abs(aimCos) < 0.35;

  drawVanguardVestmentAura();

  // 1. Cape behind torso when facing Front/Side
  if (!isBack) {
    drawWarCape();
  }
  if (weaponBehind) {
    drawSword();
  }

  // 2. Articulated Greaves & Sabatons
  const legs = getLegPositions(s, 6);
  ctx.fillStyle = isObsidian ? '#0F172A' : isSovereign ? '#7F1D1D' : '#1E293B';
  ctx.fillRect(legs.lx, legs.ly, 5, 5);
  ctx.fillStyle = isObsidian ? '#334155' : isSovereign ? '#B45309' : '#334155';
  ctx.fillRect(legs.lx - 0.5, legs.ly + 4 - bodyBob, 6, 2.5);
  ctx.fillStyle = isObsidian ? '#1E293B' : isSovereign ? '#991B1B' : '#334155';
  ctx.fillRect(legs.rx, legs.ry, 5, 5);
  ctx.fillStyle = isObsidian ? '#64748B' : isSovereign ? '#F59E0B' : '#475569';
  ctx.fillRect(legs.rx, legs.ry, 2, 4);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(legs.rx, legs.ry + 4 - bodyBob, 6, 2.5);

  // 3. Sculpted Cuirass & Armored Tassets (vestment-styled)
  if (isUnarmored) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(-7, -6 + bodyBob, 14, 13);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-6, -5 + bodyBob, 12, 10);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-7, 4 + bodyBob, 14, 2.5);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-2, 4 + bodyBob, 4, 2.5);
  } else {
    const cuirassOuter = isObsidian ? '#0F172A' : isSovereign ? '#7F1D1D' : '#334155';
    const cuirassInner = isObsidian ? '#1E293B' : isSovereign ? '#B45309' : '#64748B';
    const cuirassHighlight = isObsidian ? '#475569' : isSovereign ? '#F59E0B' : '#94A3B8';
    const emblemColor = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
    ctx.fillStyle = cuirassOuter;
    ctx.fillRect(-8, -7 + bodyBob, 16, 14);
    ctx.fillStyle = cuirassInner;
    ctx.fillRect(-7, -6 + bodyBob, 14, 11);
    if (!isBack) {
      ctx.fillStyle = cuirassHighlight;
      ctx.fillRect(-5, -5 + bodyBob, 10, 3);
      ctx.fillStyle = emblemColor;
      ctx.fillRect(-1.5, -4 + bodyBob, 3, 9);
      ctx.fillRect(-4.5, -2 + bodyBob, 9, 2.5);
    } else if (isSovereign) {
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-2, -4 + bodyBob, 4, 7);
    }
    ctx.fillStyle = isObsidian ? '#090D16' : '#1E293B';
    ctx.fillRect(-8, 5 + bodyBob, 16, 2.5);
    ctx.fillStyle = isObsidian ? '#CBD5E1' : '#FBBF24';
    ctx.fillRect(-2, 5 + bodyBob, 4, 2.5);

    // 4. Layered Winged Pauldrons
    const pauldronBase = isObsidian ? '#1E293B' : isSovereign ? '#B45309' : '#475569';
    const pauldronShine = isObsidian ? '#64748B' : isSovereign ? '#FBBF24' : '#CBD5E1';
    const pauldronTrim = isObsidian ? '#E2E8F0' : isSovereign ? '#FEF08A' : '#F59E0B';
    ctx.fillStyle = pauldronBase;
    ctx.fillRect(-11.5, -9 + bodyBob, isObsidian ? 6 : 5, isObsidian ? 7 : 6);
    ctx.fillRect(6.5, -9 + bodyBob, isObsidian ? 6 : 5, isObsidian ? 7 : 6);
    ctx.fillStyle = pauldronShine;
    ctx.fillRect(-10, -8 + bodyBob, 3, 3);
    ctx.fillRect(7, -8 + bodyBob, 3, 3);
    ctx.fillStyle = pauldronTrim;
    ctx.fillRect(-11.5, -10.5 + bodyBob, isObsidian ? 6 : 5, 1.8);
    ctx.fillRect(6.5, -10.5 + bodyBob, isObsidian ? 6 : 5, 1.8);
    if (isObsidian) {
      // Obsidian shoulder spikes + pulsing amber forge vents
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(-12.5, -12 + bodyBob, 2, 2.5);
      ctx.fillRect(10.5, -12 + bodyBob, 2, 2.5);
      const forgePulse = Math.sin(now * 0.008) > 0;
      ctx.fillStyle = forgePulse ? '#FB923C' : '#EA580C';
      ctx.fillRect(-10.5, -5.5 + bodyBob, 2.2, 2.2);
      ctx.fillRect(8.3, -5.5 + bodyBob, 2.2, 2.2);
      const emberDrift = ((now * 0.012) % 7);
      ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
      ctx.fillRect(-11, -11 + bodyBob - emberDrift, 1.4, 1.4);
      ctx.fillRect(9.5, -13 + bodyBob - ((emberDrift + 3) % 7), 1.4, 1.4);
    } else if (isSovereign) {
      // Sovereign golden crown sparks & shoulder sanctum gleam
      const sparkRise = ((now * 0.01) % 8);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
      ctx.fillRect(-9.5, -12 + bodyBob - sparkRise, 1.5, 1.5);
      ctx.fillRect(8.5, -10 + bodyBob - ((sparkRise + 4) % 8), 1.5, 1.5);
    } else {
      // Ironcrest breastplate subtle glint
      const sheenPhase = (now * 0.006) % 14;
      if (!isBack && sheenPhase < 6) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
        ctx.fillRect(-5 + sheenPhase, -4 + bodyBob, 2, 2);
      }
    }
  }

  // When facing Back (N/NE/NW), cape drapes behind back armor, with shield strapped cleanly over cape edge
  if (isBack) {
    drawWarCape();
    drawShield();
  }

  // 5. Helm / Head
  if (isUnarmored) {
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-6, -18 + headBob, 12, 11);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6.5, -20 + headBob, 13, 4.5);
    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(-6.5, -16 + headBob, 13, 1.8);
    if (!isBack) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-3.5, -13 + headBob, 2, 2);
      ctx.fillRect(1.5, -13 + headBob, 2, 2);
    }
  } else {
    if (!isBack && isPureVertical) {
      drawPlume();
    }
    const helmOuter = isObsidian ? '#0F172A' : isSovereign ? '#92400E' : '#334155';
    const helmInner = isObsidian ? '#1E293B' : isSovereign ? '#D97706' : '#64748B';
    const helmTop = isObsidian ? '#475569' : isSovereign ? '#FBBF24' : '#94A3B8';
    const crestColor = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
    const visorGlow = isObsidian ? '#FB923C' : isSovereign ? '#FEF08A' : '#38BDF8';
    const visorCore = isObsidian ? '#FEF08A' : isSovereign ? '#FFFFFF' : '#E0F2FE';

    ctx.fillStyle = helmOuter;
    ctx.fillRect(-7, -20 + headBob, 14, 13);
    ctx.fillStyle = helmInner;
    ctx.fillRect(-6, -19 + headBob, 12, 11);
    ctx.fillStyle = helmTop;
    ctx.fillRect(-4, -19 + headBob, 8, 3);
    if (isSovereign) {
      // Sovereign golden crown horns
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-7, -22 + headBob, 2.5, 3);
      ctx.fillRect(4.5, -22 + headBob, 2.5, 3);
    }

    if (isBack) {
      ctx.fillStyle = crestColor;
      ctx.fillRect(isDiagonal ? 1 : -1, -20 + headBob, 2, 11);
      if (isDiagonal) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(4, -14 + headBob, 3, 2.5);
        ctx.fillStyle = visorGlow;
        ctx.fillRect(5, -14 + headBob, 1.5, 1.5);
      }
      drawPlume();
    } else {
      const crestX = isPureVertical ? -1 : isDiagonal ? 0 : -1;
      ctx.fillStyle = crestColor;
      ctx.fillRect(crestX, -20 + headBob, 2, 11);
      if (isPureVertical) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-5, -14 + headBob, 10, 3);
        ctx.fillStyle = visorGlow;
        ctx.fillRect(-4, -14 + headBob, 3, 2);
        ctx.fillRect(1, -14 + headBob, 3, 2);
        ctx.fillStyle = visorCore;
        ctx.fillRect(-3, -14 + headBob, 1.5, 1);
        ctx.fillRect(1.5, -14 + headBob, 1.5, 1);
      } else {
        const visorX = isDiagonal ? -4 : -3;
        const glowX = isDiagonal ? -1.5 : 0;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(visorX, -14 + headBob, 9, 3);
        ctx.fillStyle = visorGlow;
        ctx.fillRect(glowX, -14 + headBob, 5, 2);
        ctx.fillStyle = visorCore;
        ctx.fillRect(glowX + 3, -14 + headBob, 2, 1);
        drawPlume();
      }
    }
  }

  // 6 & 7. Shield (front/side) & Sword (when not behind) + Slash Crescent always readable
  if (!isBack) {
    drawShield();
  }
  if (!weaponBehind) {
    drawSword();
  }
  drawSlashCrescent();
  void faceShiftX;
}

function drawRanger(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    headBob,
    strideA,
    moving,
    isDashing,
    idleWave,
    localAim,
    walkPhase,
    isAttacking,
    atkProgress,
    swingAmp,
    isBack,
    isFront,
    isPureVertical,
    isDiagonal,
  } = s;

  const cloakTail = moving
    ? (isDashing ? -6 : -3) + Math.sin(walkPhase * 1.5) * 2
    : idleWave * 1.3;

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isTwinbow = weaponId === 'ranger_galewind_twinbow';
  const isEclipse = weaponId === 'ranger_eclipse_longbow';

  const drawQuiver = () => {
    if (isUnarmed) return;
    ctx.save();
    if (isPureVertical && isBack) {
      // Centered diagonal quiver strapped across back
      ctx.translate(0, -3 + bodyBob);
      ctx.rotate(-0.45 + (moving ? Math.sin(walkPhase) * 0.06 : 0));
    } else if (isPureVertical && isFront) {
      // Just arrow fletchings peeking behind left shoulder
      ctx.translate(-7, -8 + bodyBob);
      ctx.rotate(-0.25);
    } else {
      ctx.translate(isDiagonal ? -7 : -9, -6 + bodyBob);
      ctx.rotate(-0.22 + (moving ? Math.sin(walkPhase) * 0.08 : 0));
    }
    if (isTwinbow) {
      // Split Quiver (Teal/Slate dual-compartment quiver + cyan wind fletchings)
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-2.5, -6, 5, 14);
      ctx.fillStyle = '#0E7490';
      ctx.fillRect(-2, -5, 4, 12);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-2.5, -2, 5, 1.5);
      ctx.fillRect(-3.5, -10.5, 2.5, 4.5);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(0.5, -11, 2.5, 5);
    } else if (isEclipse) {
      // Obsidian Bodkin Quiver (Dark Violet & Gold Trim)
      ctx.fillStyle = '#1E1B4B';
      ctx.fillRect(-2.5, -7, 5, 15);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-2.5, -4, 5, 1.5);
      ctx.fillRect(-2.5, 4, 5, 1.5);
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(-3, -11.5, 2.5, 4.5);
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(0, -12, 2.5, 5);
    } else {
      // Barbed Quiver (Default Ashwood)
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-2, -6, 4, 14);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-2, -3, 4, 1.5);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-3, -10, 2.5, 4);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(0, -11, 2.5, 5);
    }
    ctx.restore();
  };

  const vestmentId = s.vestmentId;
  const isBareGarb = vestmentId === null;
  const isWindrunner = vestmentId === 'ranger_windrunner_mantle';
  const isBriarheart = vestmentId === 'ranger_briarheart_leather';

  const drawCloak = () => {
    if (isBareGarb) return;
    const cDark = isWindrunner ? '#082F49' : isBriarheart ? '#022C22' : '#0F2418';
    const cMid = isWindrunner ? '#0E7490' : isBriarheart ? '#065F46' : '#1E3A29';
    const cLight = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#2D5A3C';
    if (isPureVertical) {
      const sway = moving ? Math.sin(walkPhase * 1.5) * 1.6 : idleWave * 1.0;
      ctx.fillStyle = cDark;
      ctx.fillRect(-9, -5 + bodyBob, 18, 15);
      ctx.fillStyle = cMid;
      ctx.fillRect(-10, 4 + bodyBob + sway * 0.35, 20, 7);
      ctx.fillStyle = cLight;
      ctx.fillRect(-7.5, -4 + bodyBob, 15, isWindrunner ? 3 : 13);
      if (isWindrunner) {
        ctx.fillStyle = '#BAE6FD';
        ctx.fillRect(-9.5, 9 + bodyBob + sway * 0.35, 19, 1.5);
      }
      return;
    }
    const shiftX = isDiagonal ? cloakTail * 0.35 : cloakTail * 0.5;
    const tailX = isDiagonal ? -9 + cloakTail * 0.65 : -12 + cloakTail;
    ctx.fillStyle = cDark;
    ctx.fillRect(-10 + shiftX, -5 + bodyBob, 14, 14);
    ctx.fillStyle = cMid;
    ctx.fillRect(tailX, 3 + bodyBob, 10, 8);
    ctx.fillStyle = cLight;
    ctx.fillRect(-8 + shiftX * 0.8, -4 + bodyBob, 10, isWindrunner ? 3 : 12);
    if (isWindrunner) {
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(tailX, 9.5 + bodyBob, 9, 1.5);
    }
  };

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  let drawPull = moving ? 0.5 : 0;
  let releaseTwang = 0;
  let showNockedArrow = true;
  const baseBowTilt = localAim + (moving ? Math.sin(walkPhase) * 0.06 : idleWave * 0.03);
  // Keep bow laterally clear of cloak/hood when aiming nearly straight North
  const northLateralOffset = isBack && Math.abs(aimCos) < 0.45 ? 9.5 : 0;
  const baseBowX =
    northLateralOffset +
    aimCos * 10.2 +
    (moving && !isPureVertical ? strideA * 0.8 : 0);
  const baseBowY = -1 + bodyBob + aimSin * 6.5;
  let bowTilt = baseBowTilt;
  let bowOffX = baseBowX;
  let bowOffY = baseBowY;

  if (isAttacking) {
    const drawBowX = baseBowX + aimCos * 3.2 * swingAmp;
    const drawBowY = baseBowY + aimSin * 3.0 * swingAmp;
    const recoilBowX = baseBowX - aimCos * 2.4 * swingAmp;
    const recoilBowY = baseBowY - aimSin * 2.0 * swingAmp;
    const drawTilt = localAim - 0.05 * swingAmp;
    const recoilTilt = localAim + 0.12 * swingAmp;

    if (atkProgress < 0.34) {
      const t = easeOutCubic(atkProgress / 0.34);
      drawPull = t * 5.4;
      bowTilt = lerp(baseBowTilt, drawTilt, t);
      bowOffX = lerp(baseBowX, drawBowX, t);
      bowOffY = lerp(baseBowY, drawBowY, t);
    } else if (atkProgress < 0.64) {
      const t = (atkProgress - 0.34) / 0.3;
      const kick = Math.sin(t * Math.PI);
      drawPull = -1.3 * (1 - t);
      releaseTwang = Math.sin(t * Math.PI * 4) * (1 - t) * 1.9;
      showNockedArrow = false;
      bowTilt = lerp(drawTilt, recoilTilt, easeOutCubic(Math.min(1, t * 1.4)));
      bowOffX = lerp(drawBowX, recoilBowX, kick);
      bowOffY = lerp(drawBowY, recoilBowY, kick);
    } else {
      const t = easeOutCubic((atkProgress - 0.64) / 0.36);
      drawPull = lerp(0, 0.5, t);
      bowTilt = lerp(recoilTilt, baseBowTilt, t);
      bowOffX = lerp(recoilBowX, baseBowX, t);
      bowOffY = lerp(recoilBowY, baseBowY, t);
    }
  }

  const drawBow = () => {
    ctx.save();
    ctx.translate(bowOffX, bowOffY);
    ctx.rotate(bowTilt);

    if (isUnarmed) {
      // Unarmed nimble bare archer hand (no bow)
      ctx.fillStyle = '#3F7A52';
      ctx.fillRect(-1, -2, 3.5, 4);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-1.5, -1.5, 1.5, 3);
      ctx.restore();
      return;
    }

    if (isTwinbow) {
      // Galewind Twinbow: Sleek cyan-silver double composite limbs + paired twin arrows
      ctx.fillStyle = '#0E7490';
      ctx.fillRect(1.5, -14, 2.5, 6);
      ctx.fillRect(1.5, 8, 2.5, 6);
      ctx.fillStyle = '#22D3EE';
      ctx.fillRect(3, -10, 2.5, 20);
      // Secondary forward twin limb
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(5, -11, 1.8, 6);
      ctx.fillRect(5, 5, 1.8, 6);
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(2.5, -2, 3.5, 4);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(0, -15, 2.5, 2);
      ctx.fillRect(0, 13, 2.5, 2);

      const stringAnchorX = 1.2 - drawPull + releaseTwang;
      ctx.strokeStyle = '#BAE6FD';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1.2, -14);
      ctx.lineTo(stringAnchorX, 0);
      ctx.lineTo(1.2, 14);
      ctx.stroke();

      ctx.fillStyle = '#0E7490';
      ctx.fillRect(stringAnchorX - 2, -2, 3, 4);
      if (showNockedArrow) {
        const arrowX = stringAnchorX;
        // Twin parallel wind shafts
        ctx.fillStyle = '#BAE6FD';
        ctx.fillRect(arrowX, -2.5, 11, 1.3);
        ctx.fillRect(arrowX, 1.2, 11, 1.3);
        ctx.fillStyle = drawPull > 2 ? '#38BDF8' : '#22D3EE';
        ctx.fillRect(arrowX + 10, -3.5, 3, 2.8);
        ctx.fillRect(arrowX + 10, 0.7, 3, 2.8);
        if (drawPull > 1.5) {
          ctx.strokeStyle = 'rgba(186, 230, 253, 0.7)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(arrowX + 10, 0, 5, -0.7, 0.7);
          ctx.stroke();
        }
      } else if (atkProgress < 0.52) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(5, -2);
        ctx.lineTo(16, -3);
        ctx.moveTo(5, 2);
        ctx.lineTo(16, 3);
        ctx.moveTo(7, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
      }
    } else if (isEclipse) {
      // Eclipse Siege Longbow: Tall royal-violet & gold-trimmed bow + bodkin arrow
      ctx.fillStyle = '#312E81';
      ctx.fillRect(1.5, -17, 3.2, 7);
      ctx.fillRect(1.5, 10, 3.2, 7);
      ctx.fillStyle = '#7C3AED';
      ctx.fillRect(3, -12, 3.5, 24);
      // Golden siege riser & crescent tips + bright violet runes
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(2.8, -2, 3.8, 4);
      ctx.fillRect(-0.5, -18, 3.2, 2.2);
      ctx.fillRect(-0.5, 15.8, 3.2, 2.2);
      ctx.fillStyle = '#D8B4FE';
      ctx.fillRect(3.6, -10, 1.8, 6);
      ctx.fillRect(3.6, 4, 1.8, 6);
      // Pulsing eclipse ring at bow riser
      ctx.strokeStyle = drawPull > 2 ? 'rgba(253, 224, 71, 0.85)' : 'rgba(192, 132, 252, 0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(4, 0, 4.5 + Math.sin(s.now * 0.008) * 0.6, 0, Math.PI * 2);
      ctx.stroke();

      const stringAnchorX = 1.2 - drawPull + releaseTwang;
      ctx.strokeStyle = '#EDE9FE';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(1, -17);
      ctx.lineTo(stringAnchorX, 0);
      ctx.lineTo(1, 17);
      ctx.stroke();

      ctx.fillStyle = '#6D28D9';
      ctx.fillRect(stringAnchorX - 2, -1.5, 3, 3);
      if (showNockedArrow) {
        const arrowX = stringAnchorX;
        ctx.fillStyle = '#A855F7';
        ctx.fillRect(arrowX, -0.9, 13.5, 1.8);
        ctx.fillStyle = drawPull > 2 ? '#FDE047' : '#C084FC';
        ctx.fillRect(arrowX + 12, -2.5, 4.5, 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(arrowX + 14.5, -1, 2, 2);
      } else if (atkProgress < 0.52) {
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.92)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
      }
    } else {
      // Ashwood Recurve Bow (Default)
      ctx.fillStyle = '#78350F';
      ctx.fillRect(2, -13, 2.5, 5);
      ctx.fillRect(2, 8, 2.5, 5);
      ctx.fillStyle = '#92400E';
      ctx.fillRect(3, -9, 3, 18);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(3, -1, 3, 3);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(0.5, -14, 2.5, 2);
      ctx.fillRect(0.5, 12, 2.5, 2);

      const stringAnchorX = 1.5 - drawPull + releaseTwang;
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(1.5, -13);
      ctx.lineTo(stringAnchorX, 0);
      ctx.lineTo(1.5, 13);
      ctx.stroke();

      ctx.fillStyle = '#3F7A52';
      ctx.fillRect(stringAnchorX - 2, -1.5, 3, 3);
      if (showNockedArrow) {
        const arrowX = stringAnchorX;
        ctx.fillStyle = '#A16207';
        ctx.fillRect(arrowX, -0.7, 11, 1.5);
        ctx.fillStyle = drawPull > 2 ? '#6EE7B7' : '#34D399';
        ctx.fillRect(arrowX + 10, -2, 3.5, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(arrowX + 12, -1, 1.5, 2);
      } else if (atkProgress < 0.52) {
        ctx.strokeStyle = 'rgba(110, 231, 183, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(14, 0);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const bowBehind = isBack && aimSin < -0.5 && Math.abs(aimCos) < 0.35;

  if (!isBack) {
    drawCloak();
    drawQuiver();
  }
  if (bowBehind) {
    drawBow();
  }

  // 3. Agile Boots & Stride
  const legs = getLegPositions(s, 6, 4.0);
  const bootTrim = isWindrunner ? '#0E7490' : isBriarheart ? '#064E3B' : '#142E1F';
  ctx.fillStyle = '#271E15';
  ctx.fillRect(legs.lx, legs.ly, 4.5, 5);
  ctx.fillStyle = bootTrim;
  ctx.fillRect(legs.lx - 0.5, legs.ly + 4 - bodyBob, 5.5, 2.5);
  ctx.fillStyle = '#3E2F20';
  ctx.fillRect(legs.rx, legs.ry, 4.5, 5);
  ctx.fillStyle = bootTrim;
  ctx.fillRect(legs.rx, legs.ry + 4 - bodyBob, 5.5, 2.5);

  // 4. Brigandine / Mistcloak / Briarheart Hauberk
  if (isBareGarb) {
    ctx.fillStyle = '#57534E';
    ctx.fillRect(-6.5, -6 + bodyBob, 13, 12);
    ctx.fillStyle = '#78716C';
    ctx.fillRect(-5.5, -5 + bodyBob, 11, 9);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-6.5, 3.5 + bodyBob, 13, 2);
  } else {
    const tunicOuter = isWindrunner ? '#0F172A' : isBriarheart ? '#064E3B' : '#2D5A3C';
    const tunicInner = isWindrunner ? '#0E7490' : isBriarheart ? '#059669' : '#3F7A52';
    const strapColor = isWindrunner ? '#BAE6FD' : isBriarheart ? '#78350F' : '#78350F';
    const claspColor = isWindrunner ? '#FFFFFF' : isBriarheart ? '#34D399' : '#34D399';
    ctx.fillStyle = tunicOuter;
    ctx.fillRect(-7, -6 + bodyBob, 14, 13);
    ctx.fillStyle = tunicInner;
    ctx.fillRect(-6, -5 + bodyBob, 12, 10);
    if (isWindrunner) {
      // Sky-blue mistcloak shoulder collar + swirling gale ribbons
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-8.5, -7 + bodyBob, 17, 3.5);
      const windSwirl = (s.now * (moving ? 0.009 : 0.004)) % (Math.PI * 2);
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 1 + bodyBob, 12.5, windSwirl, windSwirl + 1.25);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 1 + bodyBob, 12.5, windSwirl + Math.PI, windSwirl + Math.PI + 1.15);
      ctx.stroke();
    } else if (isBriarheart) {
      // Leaf shoulder pads + orbiting grove leaf motes
      ctx.fillStyle = '#10B981';
      ctx.fillRect(-8.5, -7 + bodyBob, 4, 4);
      ctx.fillRect(4.5, -7 + bodyBob, 4, 4);
      const leafPhase = s.now * 0.0045;
      const lx1 = Math.cos(leafPhase) * 11;
      const ly1 = -11 + bodyBob + Math.sin(leafPhase * 1.4) * 3;
      const lx2 = Math.cos(leafPhase + Math.PI) * 11;
      const ly2 = -9 + bodyBob + Math.sin(leafPhase * 1.4 + 2) * 3;
      ctx.fillStyle = '#A7F3D0';
      ctx.fillRect(lx1 - 1, ly1 - 1, 2.2, 2.2);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(lx2 - 1, ly2 - 1, 2.2, 2.2);
    }
    if (!isBack) {
      ctx.fillStyle = strapColor;
      ctx.fillRect(-6, -5 + bodyBob, 3, 3);
      ctx.fillRect(-3, -2 + bodyBob, 3, 3);
      ctx.fillRect(0, 1 + bodyBob, 3, 3);
      ctx.fillStyle = claspColor;
      ctx.fillRect(-1.5, -3 + bodyBob, isBriarheart ? 4 : 3, isBriarheart ? 4 : 3);
      if (isBriarheart) {
        const coreGlow = Math.sin(s.now * 0.008) > 0;
        ctx.fillStyle = coreGlow ? '#FFFFFF' : '#ECFDF5';
        ctx.fillRect(-0.5, -2 + bodyBob, 2, 2);
      }
    }
    ctx.fillStyle = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#D97706';
    ctx.fillRect(-6, 4 + bodyBob, 12, 2);
  }

  if (isBack) {
    drawCloak();
    drawQuiver();
  }

  // 5. Hood / Head
  if (isBareGarb) {
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-6, -18 + headBob, 12, 11);
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-6.5, -19.5 + headBob, 13, 4.5);
    if (!isBack) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-3, -13 + headBob, 2, 2);
      ctx.fillRect(1, -13 + headBob, 2, 2);
    }
  } else {
    const hoodDark = isWindrunner ? '#082F49' : isBriarheart ? '#022C22' : '#142E1F';
    const hoodMid = isWindrunner ? '#0E7490' : isBriarheart ? '#065F46' : '#2D5A3C';
    const hoodLight = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#3F7A52';
    const eyeColor = isWindrunner ? '#BAE6FD' : isBriarheart ? '#A7F3D0' : '#4ADE80';

    ctx.fillStyle = hoodDark;
    ctx.fillRect(isPureVertical ? -7.5 : -8, -19 + headBob, 15, 13);
    ctx.fillStyle = hoodMid;
    ctx.fillRect(isPureVertical ? -6.5 : -7, -18 + headBob, 13, 10);
    ctx.fillStyle = hoodLight;
    ctx.fillRect(isPureVertical ? -2.5 : -4, -21 + headBob, 5, 3);
    if (isBriarheart) {
      // Living-bark brow antlers
      ctx.fillStyle = '#A7F3D0';
      ctx.fillRect(-7, -21 + headBob, 2, 3);
      ctx.fillRect(5, -21 + headBob, 2, 3);
    }

    if (isBack) {
      ctx.fillStyle = hoodDark;
      ctx.fillRect(-4, -14 + headBob, 8, 5);
      ctx.fillStyle = hoodLight;
      if (isPureVertical) {
        ctx.fillRect(-2 + cloakTail * 0.2, -11 + headBob, 4, 6);
      } else {
        ctx.fillRect(-10 + cloakTail * 0.4, -15 + headBob, 3, 5);
      }
    } else {
      if (!isPureVertical) {
        ctx.fillRect(-10 + cloakTail * 0.4, -15 + headBob, 3, 4);
      }
      if (isPureVertical) {
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(-4.5, -13 + headBob, 9, 4.5);
        ctx.fillStyle = eyeColor;
        ctx.fillRect(-3, -12 + headBob, 2, 2);
        ctx.fillRect(1, -12 + headBob, 2, 2);
      } else {
        const maskX = isDiagonal ? -3.5 : -3;
        const eye1X = isDiagonal ? -1.5 : 0;
        const eye2X = isDiagonal ? 2.5 : 4;
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(maskX, -13 + headBob, 8, 4.5);
        ctx.fillStyle = eyeColor;
        ctx.fillRect(eye1X, -12 + headBob, 2.5, 2);
        ctx.fillRect(eye2X, -12 + headBob, 2, 2);
      }
    }
  }

  if (!bowBehind) {
    drawBow();
  }
  void isFront;
}

function drawArcanist(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    headBob,
    strideA,
    moving,
    isDashing,
    idleWave,
    now,
    isAttacking,
    atkProgress,
    swingAmp,
    localAim,
    walkPhase,
    isBack,
    isPureVertical,
    isDiagonal,
  } = s;

  const floatBob = moving ? bodyBob * 0.75 - 1 : idleWave * 1.4 - 0.8;
  const hemFlow = moving
    ? (isDashing ? -5 : -2.5) + Math.sin(walkPhase) * 1.5
    : idleWave * 1;

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  // Hold staff outside +/-11px wizard hat brim and +/-9.5px robe in all directions
  const staffSide = isPureVertical
    ? aimCos < -0.2
      ? -12.2
      : 12.2
    : aimCos < -0.35
      ? -11.8
      : 11.8;

  const baseStaffAngle =
    (staffSide < 0 ? -0.22 : 0.22) +
    Math.sin(localAim) * 0.16 +
    (moving ? Math.sin(walkPhase) * 0.08 : Math.sin(now * 0.004) * 0.06);
  const baseStaffX =
    staffSide + (moving && !isPureVertical ? strideA * 1.2 : 0);
  const baseStaffY = -1 + floatBob + (isPureVertical ? aimSin * 1.5 : 0);
  let staffAngle = baseStaffAngle;
  let staffOffX = baseStaffX;
  let staffOffY = baseStaffY;
  let flareIntensity = 0;

  if (isAttacking) {
    const castDirAngle = localAim + Math.PI / 2;
    const angleDelta = Math.atan2(
      Math.sin(castDirAngle - baseStaffAngle),
      Math.cos(castDirAngle - baseStaffAngle)
    );
    const windAngle = baseStaffAngle - (angleDelta >= 0 ? 0.34 : -0.34) * swingAmp;
    const windX = baseStaffX - aimCos * 3.5 * swingAmp;
    const windY = baseStaffY - 2.5 - aimSin * 2.5;
    const castAngle = baseStaffAngle + angleDelta * 0.68;
    const castX = baseStaffX + aimCos * 8.0 * swingAmp;
    const castY = baseStaffY + aimSin * 7.0 * swingAmp;

    if (atkProgress < 0.25) {
      const t = easeOutCubic(atkProgress / 0.25);
      staffAngle = lerp(baseStaffAngle, windAngle, t);
      staffOffX = lerp(baseStaffX, windX, t);
      staffOffY = lerp(baseStaffY, windY, t);
      flareIntensity = 0.6 * t;
    } else if (atkProgress < 0.65) {
      const t = easeOutCubic((atkProgress - 0.25) / 0.4);
      const thrustArc = Math.sin(t * Math.PI);
      staffAngle = lerp(windAngle, castAngle, t);
      staffOffX = lerp(windX, castX, t) + aimCos * thrustArc * 2.5;
      staffOffY = lerp(windY, castY, t) + aimSin * thrustArc * 2.0;
      flareIntensity = 0.6 + 0.4 * thrustArc;
    } else {
      const t = easeOutCubic((atkProgress - 0.65) / 0.35);
      staffAngle = lerp(castAngle, baseStaffAngle, t);
      staffOffX = lerp(castX, baseStaffX, t);
      staffOffY = lerp(castY, baseStaffY, t);
      flareIntensity = Math.max(0, 0.55 * (1 - t));
    }
  }

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isCinder = weaponId === 'arcanist_cinderflare_rod';
  const isChrono = weaponId === 'arcanist_chronostar_scepter';

  const drawStaff = () => {
    ctx.save();
    ctx.translate(staffOffX, staffOffY);
    ctx.rotate(staffAngle);
    if (isUnarmed) {
      // Unarmed bare arcane casting hand (no staff)
      ctx.fillStyle = '#4338CA';
      ctx.fillRect(-1.5, -2.5, 4, 4.5);
      ctx.fillStyle = flareIntensity > 0.2 ? '#E0F2FE' : '#38BDF8';
      ctx.fillRect(-0.5, -5.5, 2.5, 2.5);
      ctx.restore();
      return;
    }
    if (isCinder) {
      // Cinderflare Catalyst: Charred obsidian-bronze rod + brass brazier crown + flickering flame
      ctx.fillStyle = '#27272A';
      ctx.fillRect(-1, -14, 3, 28);
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(0, -13, 1.2, 24);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3.5, -16, 8, 2.5);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-4.5, -20, 2, 4.5);
      ctx.fillRect(3.5, -20, 2, 4.5);
      const flicker = Math.sin(now * 0.018) * 1.4;
      if (flareIntensity > 0.1) {
        ctx.strokeStyle = `rgba(249, 115, 22, ${0.85 * flareIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0.5, -21 + flicker * 0.4, 6 + flareIntensity * 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#EA580C';
      ctx.fillRect(-2.5, -22 + flicker * 0.5, 6, 6);
      ctx.fillStyle = '#FB923C';
      ctx.fillRect(-1.5, -24 - flicker * 0.5, 4, 6);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-0.5, -22, 2, 3);
      // Rising animated flame ember pixels above brazier
      const emberStep = (now * 0.015) % 8;
      ctx.fillStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.fillRect(-2 + Math.sin(now * 0.02) * 1.5, -26 - emberStep, 1.5, 1.5);
      ctx.fillStyle = 'rgba(249, 115, 22, 0.78)';
      ctx.fillRect(2 - Math.cos(now * 0.018) * 1.5, -24 - ((emberStep + 4) % 8), 1.5, 1.5);
    } else if (isChrono) {
      // Chronostar Scepter: Celestial ivory/indigo scepter + rotating gold armillary ring + star core
      ctx.fillStyle = '#312E81';
      ctx.fillRect(-1, -15, 3, 29);
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-0.5, -14, 1.5, 27);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-3, -16, 7, 2);
      ctx.fillRect(-2.5, -2, 6, 1.5);

      const coreY = -22 + Math.sin(now * 0.008) * 0.9;
      ctx.save();
      ctx.translate(0.5, coreY);
      ctx.rotate(now * 0.004);
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, 5.5, 2.4, 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, 2.4, 5.5, 0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (flareIntensity > 0.1) {
        ctx.strokeStyle = `rgba(253, 224, 71, ${0.85 * flareIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0.5, coreY, 7 + flareIntensity * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = flareIntensity > 0.5 ? '#FFFFFF' : '#38BDF8';
      ctx.fillRect(-1.5, coreY - 2, 4, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-0.5, coreY - 1, 2, 2);
    } else {
      // Runebound Spire (Default)
      ctx.fillStyle = '#581C87';
      ctx.fillRect(-1, -15, 3, 29);
      ctx.fillStyle = '#A855F7';
      ctx.fillRect(-1, -15, 1.5, 28);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-2.5, -16, 6, 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fillRect(-3.5, -22, 2, 6);
      ctx.fillRect(2.5, -22, 2, 6);

      const crystalBob = Math.sin(now * 0.01) * 1.4;
      if (flareIntensity > 0.1) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${0.85 * flareIntensity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0.5, -21 + crystalBob, 6 + flareIntensity * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = flareIntensity > 0.5 ? '#E0F2FE' : '#38BDF8';
      ctx.fillRect(-2, -23 + crystalBob, 5, 5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-0.5, -21.5 + crystalBob, 2, 2);
    }
    ctx.restore();
  };

  const staffBehind = isBack && aimSin < -0.5 && Math.abs(aimCos) < 0.35;
  if (staffBehind) {
    drawStaff();
  }

  const vestmentId = s.vestmentId;
  const isBareRobe = vestmentId === null;
  const isChronoShroud = vestmentId === 'arcanist_chronomancer_shroud';
  const isVoidward = vestmentId === 'arcanist_voidward_robes';

  // 1. Billowing Cosmic Robe Skirt & Hovering Boots
  const hemOff = isPureVertical ? 0 : hemFlow * (isDiagonal ? 0.35 : 0.5);
  if (isBareRobe) {
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-7 + hemOff * 0.3, -4 + floatBob, 14, 14);
    ctx.fillStyle = '#334155';
    ctx.fillRect(-6 + hemOff * 0.2, -3 + floatBob, 12, 12);
    const legs = getLegPositions(s, 9 + floatBob - bodyBob, 2.5, 0.6);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(legs.lx + 0.5, legs.ly, 4, 3);
    ctx.fillRect(legs.rx + 1, legs.ry, 4, 3);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-6, 3 + floatBob, 12, 2);

    // Unrobed scholar head
    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-5.5, -16 + headBob * 0.9, 11, 10);
    ctx.fillStyle = '#312E81';
    ctx.fillRect(-6, -18 + headBob * 0.9, 12, 4);
    if (!isBack) {
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-3.5, -12 + headBob * 0.9, 2, 2);
      ctx.fillRect(1.5, -12 + headBob * 0.9, 2, 2);
    }
  } else {
    const robeOuter = isChronoShroud ? '#0F172A' : isVoidward ? '#3B0764' : '#1E1B4B';
    const robeMid = isChronoShroud ? '#1E3A8A' : isVoidward ? '#581C87' : '#312E81';
    const robeInner = isChronoShroud ? '#1D4ED8' : isVoidward ? '#7E22CE' : '#4338CA';
    const hemTrim = isChronoShroud ? '#FBBF24' : isVoidward ? '#C084FC' : '#38BDF8';
    const mantleDark = isChronoShroud ? '#38BDF8' : isVoidward ? '#9333EA' : '#4F46E5';
    const mantleLight = isChronoShroud ? '#E0F2FE' : isVoidward ? '#E879F9' : '#818CF8';

    ctx.fillStyle = robeOuter;
    ctx.fillRect(-9.5 + hemOff, -4 + floatBob, 19, 16);
    ctx.fillStyle = robeMid;
    ctx.fillRect(-8 + hemOff * 0.6, -3 + floatBob, 16, 14);

    const legs = getLegPositions(s, 9 + floatBob - bodyBob, 2.5, 0.6);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(legs.lx + 0.5, legs.ly, 4, 3);
    ctx.fillRect(legs.rx + 1, legs.ry, 4, 3);

    // Inner Tunic & Glowing Celestial/Temporal/Void Runes
    ctx.fillStyle = robeInner;
    ctx.fillRect(-6, -4 + floatBob, 12, 13);
    ctx.fillStyle = hemTrim;
    ctx.fillRect(-8 + hemOff * 0.6, 9 + floatBob, 16, 2);
    if (!isBack) {
      if (isChronoShroud) {
        // Golden hourglass sigil
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(-2.5, -1 + floatBob, 5, 1.8);
        ctx.fillRect(-1.5, 1 + floatBob, 3, 2);
        ctx.fillRect(-2.5, 3 + floatBob, 5, 1.8);
      } else if (isVoidward) {
        // Luminous void core rune
        ctx.fillStyle = '#C084FC';
        ctx.fillRect(-2.5, -1 + floatBob, 5, 5);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-1, 0.5 + floatBob, 2, 2);
      } else {
        ctx.fillRect(-2, -1 + floatBob, 4, 2);
        ctx.fillRect(-1, 2 + floatBob, 2, 4);
      }
    } else {
      ctx.fillStyle = isChronoShroud ? '#38BDF8' : isVoidward ? '#C084FC' : '#6366F1';
      ctx.fillRect(-1.5, -2 + floatBob, 3, 9);
    }

    // 2. Shoulder Mantle & Scarf / Battlemage Shoulder Wards + Vestment Aura FX
    if (isChronoShroud) {
      // Rotating golden astrolabe ring behind shoulders
      ctx.save();
      ctx.translate(0, -6 + floatBob);
      ctx.rotate(now * 0.0022);
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, 12.5, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 12.5, Math.PI, Math.PI * 2.35);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = mantleDark;
    ctx.fillRect(isVoidward ? -10.5 : -9, -7 + floatBob, isVoidward ? 21 : 18, 4.5);
    ctx.fillStyle = mantleLight;
    ctx.fillRect(-6, -6 + floatBob, 12, 2);
    if (isVoidward) {
      // Pointed arcane shoulder ward spikes + orbiting magenta ward sigils
      ctx.fillStyle = '#C084FC';
      ctx.fillRect(-11, -9 + floatBob, 3, 3);
      ctx.fillRect(8, -9 + floatBob, 3, 3);
      const wardAng = now * 0.004;
      for (let wIdx = 0; wIdx < 2; wIdx++) {
        const wa = wardAng + wIdx * Math.PI;
        const wx = Math.cos(wa) * 12.5;
        const wy = -4 + floatBob + Math.sin(wa) * 5;
        ctx.fillStyle = 'rgba(232, 121, 249, 0.85)';
        ctx.fillRect(wx - 1.2, wy - 1.2, 2.4, 2.4);
      }
    }

    // 3. Crooked-Tip Archmage Hat + Vestment Trim & Eyes
    const hatTipWave = moving ? -3 + Math.sin(walkPhase) * 1.2 : idleWave * 1.1;
    const hatTipShift = isPureVertical ? hatTipWave * 0.25 : hatTipWave;
    const hatBand = isChronoShroud ? '#FBBF24' : isVoidward ? '#C084FC' : '#38BDF8';
    const hatTipColor = isChronoShroud ? '#E0F2FE' : isVoidward ? '#E879F9' : '#6366F1';
    const eyeColor = isChronoShroud ? '#BAE6FD' : isVoidward ? '#E879F9' : '#38BDF8';

    ctx.fillStyle = robeOuter;
    ctx.fillRect(-11, -15 + headBob * 0.9, 22, 3);
    ctx.fillStyle = robeMid;
    ctx.fillRect(-7, -21 + headBob * 0.9, 14, 7);
    ctx.fillStyle = robeInner;
    ctx.fillRect(isPureVertical ? -4.5 : -5, -26 + headBob * 0.9, 9, 6);
    ctx.fillStyle = hatTipColor;
    ctx.fillRect(-2.5 + hatTipShift * 0.5, -29 + headBob * 0.9, 5, 4);
    ctx.fillStyle = hatBand;
    ctx.fillRect(-7, -17 + headBob * 0.9, 14, 2);
    ctx.fillRect(-1.5 + hatTipShift, -30 + headBob * 0.9, 2.5, 2.5);

    if (!isBack) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-5, -13 + headBob * 0.9, 10, 5);
      ctx.fillStyle = eyeColor;
      if (isPureVertical) {
        ctx.fillRect(-3.5, -12 + headBob * 0.9, 2.5, 2);
        ctx.fillRect(1, -12 + headBob * 0.9, 2.5, 2);
      } else {
        const eShift = isDiagonal ? -0.5 : 0;
        ctx.fillRect(-1 + eShift, -12 + headBob * 0.9, 2.5, 2);
        ctx.fillRect(3 + eShift, -12 + headBob * 0.9, 2.5, 2);
      }
    } else {
      ctx.fillStyle = robeOuter;
      ctx.fillRect(-6, -13 + headBob * 0.9, 12, 5);
    }
  }

  // 4. Off-Hand Floating Channeling Spark
  const castPulse = isAttacking ? Math.sin(atkProgress * Math.PI) : 0;
  const offSideSign = staffSide >= 0 ? -1 : 1;
  const handX = offSideSign * (11 - castPulse * 3.5 * swingAmp) - 2;
  const handY = -1 + floatBob + Math.sin(now * 0.007) * 1.5 - castPulse * 2.5;
  ctx.fillStyle = '#4338CA';
  ctx.fillRect(handX, handY, 4, 4);
  ctx.fillStyle = isCinder
    ? castPulse > 0.35
      ? '#FEF08A'
      : '#F97316'
    : isChrono
      ? '#FDE047'
      : castPulse > 0.35
        ? '#E0F2FE'
        : '#38BDF8';
  ctx.fillRect(handX - 1, handY - 3, 3, 3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(handX, handY - 2, 1, 1);

  if (!staffBehind) {
    drawStaff();
  }

  // Directional spellcast flash along aim angle when actively casting
  if (isAttacking && atkProgress > 0.25 && atkProgress < 0.65) {
    const t = (atkProgress - 0.25) / 0.4;
    const fx = aimCos * (18 + t * 9);
    const fy = aimSin * (16 + t * 9) + floatBob;
    ctx.fillStyle = isCinder
      ? `rgba(249, 115, 22, ${(1 - t) * 0.9})`
      : isChrono
        ? `rgba(253, 224, 71, ${(1 - t) * 0.85})`
        : `rgba(56, 189, 248, ${(1 - t) * 0.85})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 4.5 * swingAmp * (1 - t * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Local Orbiting Astral Conduit Motes (0 when unarmed, 1 for Spire/Cinderflare, 2 twin orbs for Chronostar)
  if (!isUnarmed) {
    const orbAngle = now * 0.0052;
    const orbCount = isChrono ? 2 : 1;
    for (let i = 0; i < orbCount; i++) {
      const a = orbAngle + i * Math.PI;
      const ox = Math.cos(a) * 15;
      const oy = Math.sin(a) * 6 + floatBob;
      const haloColor = isCinder
        ? 'rgba(249, 115, 22, 0.48)'
        : i === 1
          ? 'rgba(253, 224, 71, 0.48)'
          : 'rgba(56, 189, 248, 0.45)';
      const coreColor = isCinder ? '#FB923C' : i === 1 ? '#FDE047' : '#38BDF8';
      ctx.fillStyle = haloColor;
      ctx.fillRect(ox - 2.5, oy - 2.5, 5, 5);
      ctx.fillStyle = coreColor;
      ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(ox - 0.5, oy - 0.5, 1, 1);
    }
  }
}

function drawCleric(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const {
    bodyBob,
    headBob,
    strideA,
    moving,
    idleWave,
    now,
    isAttacking,
    atkProgress,
    swingAmp,
    localAim,
    walkPhase,
    isBack,
    isPureVertical,
    isDiagonal,
  } = s;

  const capeSway = moving ? -2.5 + Math.sin(walkPhase) * 1.4 : idleWave * 0.9;

  const vestmentId = s.vestmentId;
  const isNovice = vestmentId === null;
  const isMartyr = vestmentId === 'cleric_martyr_surplice';
  const isTemplar = vestmentId === 'cleric_templar_cassock';

  const drawHalo = () => {
    if (isNovice) return;
    const haloY = -22 + headBob + idleWave * 0.8;
    ctx.save();
    ctx.translate(0, haloY);
    ctx.fillStyle = isMartyr
      ? 'rgba(52, 211, 153, 0.25)'
      : isTemplar
        ? 'rgba(250, 204, 21, 0.34)'
        : 'rgba(253, 224, 71, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, isTemplar ? 11 : 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isMartyr ? '#34D399' : '#FACC15';
    ctx.lineWidth = isTemplar ? 2.4 : 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(now * 0.0014);
    ctx.fillStyle = isMartyr ? '#ECFDF5' : '#FEF08A';
    const rayCount = isTemplar ? 8 : 4;
    for (let r = 0; r < rayCount; r++) {
      ctx.rotate((Math.PI * 2) / rayCount);
      ctx.fillRect(-1.5, isTemplar ? -13.5 : -12.5, 3, isTemplar ? 4 : 3.5);
    }
    ctx.restore();
  };

  const drawCape = () => {
    if (isNovice) return;
    const cOuter = isMartyr ? '#065F46' : isTemplar ? '#7F1D1D' : '#78350F';
    const cInner = isMartyr ? '#059669' : isTemplar ? '#B45309' : '#92400E';
    const cTrim = isMartyr ? '#34D399' : isTemplar ? '#FDE047' : '#F59E0B';
    if (isPureVertical) {
      ctx.fillStyle = cOuter;
      ctx.fillRect(-9, -6 + bodyBob, 18, 16);
      ctx.fillStyle = cInner;
      ctx.fillRect(-8, -5 + bodyBob, 16, 14);
      ctx.fillStyle = cTrim;
      ctx.fillRect(-8, 8 + bodyBob, 16, 1.5);
      return;
    }
    const shiftX = isDiagonal ? capeSway * 0.35 : capeSway * 0.5;
    ctx.fillStyle = cOuter;
    ctx.fillRect(-10 + shiftX, -6 + bodyBob, 14, 16);
    ctx.fillStyle = cInner;
    ctx.fillRect(-9 + shiftX * 0.6, -5 + bodyBob, 12, 14);
    if (isTemplar || isMartyr) {
      ctx.fillStyle = cTrim;
      ctx.fillRect(-9 + shiftX * 0.6, 8 + bodyBob, 12, 1.5);
    }
  };

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  const baseMaceAngle =
    aimCos < -0.25
      ? localAim + Math.PI / 2 + 0.28
      : moving
        ? 0.38 + aimSin * 0.2 - Math.sin(walkPhase) * 0.16
        : 0.34 + aimSin * 0.2 + idleWave * 0.08;
  const baseMaceX = isPureVertical
    ? aimCos < -0.15
      ? Math.min(-10.8, aimCos * 10)
      : Math.max(10.8, aimCos * 10)
    : aimCos < -0.35
      ? aimCos * 10
      : moving
        ? 9.5 + strideA * 1.3
        : 10.5;
  const baseMaceY = 0 + bodyBob + (isPureVertical ? aimSin * 2.0 : 0);
  let maceAngle = baseMaceAngle;
  let maceOffX = baseMaceX;
  let maceOffY = baseMaceY;
  let sweepT = -1;

  if (isAttacking) {
    const targetRot = localAim + Math.PI / 2;
    const windAngle = targetRot - 1.38 * swingAmp;
    const windX = baseMaceX - aimCos * 3 * swingAmp;
    const windY = baseMaceY - 4 * swingAmp - aimSin * 1.5;
    const strikeAngle = targetRot + 1.25 * swingAmp;
    const strikeX = aimCos * (10 + 4.5 * (swingAmp - 1));
    const strikeY = aimSin * 9 + 1 + bodyBob;

    if (atkProgress < 0.26) {
      const t = easeOutCubic(atkProgress / 0.26);
      maceAngle = lerp(baseMaceAngle, windAngle, t);
      maceOffX = lerp(baseMaceX, windX, t);
      maceOffY = lerp(baseMaceY, windY, t);
    } else if (atkProgress < 0.62) {
      const t = easeOutCubic((atkProgress - 0.26) / 0.36);
      sweepT = t;
      maceAngle = lerp(windAngle, strikeAngle, t);
      maceOffX = lerp(windX, strikeX, t) + aimCos * Math.sin(t * Math.PI) * 3.5 * swingAmp;
      maceOffY = lerp(windY, strikeY, t) + aimSin * Math.sin(t * Math.PI) * 2.5 * swingAmp;
    } else {
      const t = easeOutCubic((atkProgress - 0.62) / 0.38);
      maceAngle = lerp(strikeAngle, baseMaceAngle, t);
      maceOffX = lerp(strikeX, baseMaceX, t);
      maceOffY = lerp(strikeY, baseMaceY, t);
    }
  }

  const weaponId = s.weaponId;
  const isUnarmed = weaponId === null;
  const isCenser = weaponId === 'cleric_solaris_censer';
  const isCrozier = weaponId === 'cleric_seraphim_crozier';

  const drawMace = () => {
    ctx.save();
    ctx.translate(maceOffX, maceOffY);
    ctx.rotate(maceAngle);
    if (isUnarmed) {
      // Unarmed consecrated bare fist
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(-1.5, -2.5, 4, 4.5);
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(-0.5, -2, 2.5, 2);
      ctx.restore();
      return;
    }
    if (isCenser) {
      // Solaris War-Censer: Silver-bronze staff with arched golden hook & swinging emerald-gold thurible
      ctx.fillStyle = '#475569';
      ctx.fillRect(-1, -16, 2.5, 25);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-1, 3, 2.5, 6);
      // Curved top bracket
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-1, -20, 7, 2.5);
      ctx.fillRect(4.5, -18, 2, 3);
      // Dangling chain + emerald-jade glowing thurible head
      const thuribleSway = isAttacking ? 0.3 : Math.sin(now * 0.007) * 0.25;
      ctx.save();
      ctx.translate(5.5, -15);
      ctx.rotate(thuribleSway);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, 0, 1.5, 4);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3, 4, 6, 6);
      ctx.fillStyle = '#34D399';
      ctx.fillRect(-2, 5, 4, 4);
      ctx.fillStyle = '#ECFDF5';
      ctx.fillRect(-1, 6, 2, 2);
      // Rising emerald incense wisps curling upward from thurible
      const wispShift = (now * 0.014) % 9;
      ctx.fillStyle = 'rgba(110, 231, 183, 0.85)';
      ctx.fillRect(-2 + Math.sin(now * 0.01) * 1.5, 1 - wispShift, 1.8, 1.8);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.75)';
      ctx.fillRect(1 - Math.sin(now * 0.012) * 1.5, 2 - ((wispShift + 4) % 9), 1.5, 1.5);
      ctx.restore();
    } else if (isCrozier) {
      // Seraphim Judgment Crozier: Tall ivory/gold winged shepherd's crook + hovering sunlit halo orb
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(-1, -18, 2.5, 28);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-1.5, 2, 3.5, 7);
      // Outstretched angel wings beneath the crook
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-6.5, -18, 5.5, 2.5);
      ctx.fillRect(1.5, -18, 5.5, 2.5);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-5, -16, 3.5, 1.5);
      ctx.fillRect(2, -16, 3.5, 1.5);
      // Curved golden shepherd's crook curling overhead
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(-1, -25, 2.5, 7);
      ctx.fillRect(-1, -27, 7, 2.5);
      ctx.fillRect(4.5, -25, 2.5, 5);
      ctx.fillRect(2.5, -21, 3, 2);
      // Floating sunlit core inside the crook
      const orbPulse = Math.sin(now * 0.009) * 0.7;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(1, -24 + orbPulse, 3, 3);
    } else {
      // Dawnstar Flanged Mace (Default)
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-1, -12, 3, 22);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-1, 3, 3, 6);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-3.5, -19, 8, 8);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(-2, -17.5, 5, 5);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-0.5, -22, 2, 3);
      ctx.fillRect(-5.5, -16, 2, 2);
      ctx.fillRect(4.5, -16, 2, 2);
    }
    ctx.restore();
  };

  const drawSweepArc = () => {
    if (sweepT < 0) return;
    const t = sweepT;
    ctx.save();
    ctx.translate(aimCos * 5.5, aimSin * 6 + bodyBob);
    ctx.rotate(localAim);
    ctx.strokeStyle = isUnarmed
      ? 'rgba(254, 240, 138, 0.55)'
      : isCenser
        ? 'rgba(52, 211, 153, 0.88)'
        : isCrozier
          ? 'rgba(254, 249, 195, 0.94)'
          : 'rgba(253, 224, 71, 0.85)';
    ctx.lineWidth = (swingAmp > 1.05 ? 3.8 : 3) * (1 - t * 0.4);
    ctx.beginPath();
    ctx.arc(2, 0, (isUnarmed ? 14 : 20) * (1 + (swingAmp - 1) * 0.35), -1.1, -1.1 + t * 2.25);
    ctx.stroke();
    if (isCrozier && !isUnarmed) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.78)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(2, 0, 23 * (1 + (swingAmp - 1) * 0.35), -0.95, -0.95 + t * 1.95);
      ctx.stroke();
    } else if (isCenser && !isUnarmed) {
      ctx.strokeStyle = 'rgba(167, 243, 208, 0.78)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(2, 0, 22 * (1 + (swingAmp - 1) * 0.35), -0.95, -0.95 + t * 1.95);
      ctx.stroke();
    }
    ctx.restore();
  };

  const maceBehind = isBack && aimSin < -0.5 && Math.abs(aimCos) < 0.35;

  // 1. Halo & Cape behind torso when facing Front/Side
  if (!isBack) {
    drawHalo();
    drawCape();
  }
  if (maceBehind) {
    drawMace();
  }

  // Boots Striding Beneath Tabard
  const legs = getLegPositions(s, 8, 3.0, 0.7);
  ctx.fillStyle = isTemplar ? '#334155' : '#451A03';
  ctx.fillRect(legs.lx + 0.5, legs.ly, 4.5, 4);
  ctx.fillRect(legs.rx, legs.ry, 4.5, 4);

  // 3. Ceremonial Tabard / Surplice / Sanctum Plate & Mitre
  if (isNovice) {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-7, -6 + bodyBob, 14, 15);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-6, -5 + bodyBob, 12, 13);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-7, 4 + bodyBob, 14, 2);

    ctx.fillStyle = '#FDBA74';
    ctx.fillRect(-5.5, -17 + headBob, 11, 10);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(-6, -18.5 + headBob, 12, 4);
    if (!isBack) {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-3, -12 + headBob, 2, 2);
      ctx.fillRect(1, -12 + headBob, 2, 2);
    }
  } else {
    const tabardOuter = isMartyr ? '#A7F3D0' : isTemplar ? '#475569' : '#E2E8F0';
    const tabardInner = isMartyr ? '#ECFDF5' : isTemplar ? '#E2E8F0' : '#F8FAFC';
    const stoleColor = isMartyr ? '#10B981' : isTemplar ? '#D97706' : '#B45309';
    const emblemOuter = isMartyr ? '#34D399' : '#F59E0B';
    const emblemCore = isMartyr ? '#FDE047' : '#FEF08A';

    ctx.fillStyle = tabardOuter;
    ctx.fillRect(-8, -6 + bodyBob, 16, 16);
    ctx.fillStyle = tabardInner;
    ctx.fillRect(-7, -5 + bodyBob, 14, 14);
    if (isTemplar) {
      // Heavy gilded armored paladin pauldrons + twin radiant golden aegis flares
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-10.5, -8 + bodyBob, 4.5, 5.5);
      ctx.fillRect(6, -8 + bodyBob, 4.5, 5.5);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(-10.5, -9 + bodyBob, 4.5, 1.8);
      ctx.fillRect(6, -9 + bodyBob, 4.5, 1.8);
      const wingAlpha = (0.35 + Math.sin(now * 0.007) * 0.14).toFixed(2);
      ctx.fillStyle = `rgba(253, 224, 71, ${wingAlpha})`;
      ctx.fillRect(-13.5, -9 + bodyBob, 2.5, 5);
      ctx.fillRect(11, -9 + bodyBob, 2.5, 5);
    } else if (isMartyr) {
      // Emerald shoulder yoke + rising verdant restorative motes
      ctx.fillStyle = '#34D399';
      ctx.fillRect(-8, -6 + bodyBob, 16, 3.5);
      const moteRise = (now * 0.011) % 8;
      ctx.fillStyle = 'rgba(110, 231, 183, 0.85)';
      ctx.fillRect(-9, -8 + bodyBob - moteRise, 1.6, 1.6);
      ctx.fillRect(7.5, -6 + bodyBob - ((moteRise + 4) % 8), 1.6, 1.6);
    }
    if (!isBack) {
      ctx.fillStyle = stoleColor;
      ctx.fillRect(-6, -5 + bodyBob, 2.5, 13);
      ctx.fillRect(3.5, -5 + bodyBob, 2.5, 13);
      ctx.fillStyle = emblemOuter;
      ctx.fillRect(-3, -2 + bodyBob, 6, 6);
      ctx.fillStyle = emblemCore;
      ctx.fillRect(-1.5, -0.5 + bodyBob, 3, 3);
      ctx.fillStyle = emblemOuter;
      ctx.fillRect(-7, 7 + bodyBob, 14, 2);
    }

    if (isBack) {
      drawCape();
      drawHalo();
    }

    // 4. Mitre / Templar Crowned Helm & Face
    ctx.fillStyle = isMartyr ? '#ECFDF5' : isTemplar ? '#94A3B8' : '#F8FAFC';
    ctx.fillRect(-7, -19 + headBob, 14, 12);
    ctx.fillStyle = isMartyr ? '#34D399' : '#FDE047';
    ctx.fillRect(-8, -19 + headBob, 16, 3);
    ctx.fillRect(-2, -22 + headBob, 4, 4);
    if (!isBack) {
      ctx.fillStyle = isMartyr ? '#FDE68A' : isTemplar ? '#CBD5E1' : '#FCD34D';
      ctx.fillRect(-5, -13 + headBob, 10, 5);
      ctx.fillStyle = isTemplar ? '#0F172A' : '#78350F';
      if (isPureVertical) {
        ctx.fillRect(-3, -12 + headBob, 2, 2);
        ctx.fillRect(1, -12 + headBob, 2, 2);
      } else {
        const eShift = isDiagonal ? -0.5 : 0;
        ctx.fillRect(-2 + eShift, -12 + headBob, 2, 2);
        ctx.fillRect(2 + eShift, -12 + headBob, 2, 2);
      }
    } else {
      ctx.fillStyle = isMartyr ? '#34D399' : '#F59E0B';
      ctx.fillRect(-1, -16 + headBob, 2, 8);
    }
  }

  // 5. Left Hand: Weapon-paired Offhand Reliquary / Thurible / Winged Sun-Relic (hidden when unarmed)
  if (!isUnarmed) {
    const censerWave = isAttacking ? Math.sin(atkProgress * Math.PI) : 0;
    const censerSwing = isAttacking
      ? -0.55 * censerWave * swingAmp
      : moving
        ? -0.25 + Math.sin(walkPhase) * 0.25
        : idleWave * 0.14;
    ctx.save();
    ctx.translate(-10 - censerWave * 2.5, -2 + bodyBob - censerWave * 2.5);
    ctx.rotate(censerSwing);
    if (isCrozier) {
      // Winged Sun-Relic Medallion
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-4, 2, 8, 2);
      ctx.fillStyle = '#FDE047';
      ctx.fillRect(-2.5, 1, 5, 5);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-1, 2.5, 2, 2);
    } else if (isCenser) {
      // Paired Emerald Thurible Satchel
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, 0, 1.5, 5);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-2.5, 5, 5, 5);
      ctx.fillStyle = isAttacking ? '#ECFDF5' : '#34D399';
      ctx.fillRect(-1.5, 6, 3, 3);
    } else {
      // Dawnstar Sacred Reliquary Censer
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(-0.5, 0, 1.5, 6);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-2.5, 6, 5, 5);
      ctx.fillStyle = isAttacking ? '#FFFFFF' : '#FEF08A';
      ctx.fillRect(-1.5, 7, 3, 3);
    }
    ctx.restore();
  }

  if (!maceBehind) {
    drawMace();
  }
  drawSweepArc();
}

export function drawHeroClassLabel(_heroClass: HeroClassId): void {
  // Helper type export reference preserved for modularity
}
