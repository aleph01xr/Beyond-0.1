import type { HeroClassId, PlayerState } from '../shared/types.ts';
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
  p: Pick<PlayerState, 'heroClass' | 'attackAnimMs' | 'vx' | 'vy' | 'hasteMs' | 'shield'>,
  hx: number,
  hy: number,
  options: HeroRenderOptions
): void {
  const { aimAngle, bob, moving, now } = options;
  const pose = resolveSpritePose(p, options);

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

  const drawWarCape = () => {
    if (isPureVertical) {
      // Symmetrical billowing mantle for N / S
      const billow = moving ? Math.sin(walkPhase * 1.4) * 1.5 : idleWave * 0.9;
      ctx.fillStyle = '#7F1D1D';
      ctx.fillRect(-9.5, -5 + bodyBob, 19, 14);
      ctx.fillRect(-10.5, 4 + bodyBob + billow * 0.4, 21, 7);
      ctx.fillStyle = '#991B1B';
      ctx.fillRect(-8, -4 + bodyBob, 16, 13);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-10.5, 10 + bodyBob + billow * 0.4, 21, 1.5);
      return;
    }
    const shiftX = isDiagonal ? capeLift * 0.35 : capeLift * 0.5;
    const tailX = isDiagonal ? -10 + capeLift * 0.65 : -13 + capeLift;
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(-11 + shiftX, -5 + bodyBob, isDiagonal ? 14 : 12, 13);
    ctx.fillRect(tailX, 4 + bodyBob, 10, 7);
    ctx.fillStyle = '#991B1B';
    ctx.fillRect(-10 + shiftX * 0.8, -4 + bodyBob, isDiagonal ? 12 : 10, 11);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(tailX, 10 + bodyBob, 9, 1.5);
  };

  const drawShield = () => {
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
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-4, -8, w, 17);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-3, -7, w - 2, 14);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-3, -7, 2, 12);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-3, -3, w - 2, 7);
    ctx.fillRect(-4, -8, w, 1.5);
    ctx.restore();
  };

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  const baseSwordAngle =
    aimCos < -0.25
      ? localAim + Math.PI / 2 - 0.35
      : moving
        ? 0.42 + aimSin * 0.25 + Math.sin(walkPhase) * 0.16
        : -0.35 + aimSin * 0.25 + idleWave * 0.06;
  const baseSwordX = isPureVertical
    ? aimCos < -0.2
      ? Math.max(-9, aimCos * 8)
      : Math.max(7, aimCos * 8)
    : aimCos < -0.35
      ? aimCos * 8
      : moving
        ? 6 + strideA * 1.5
        : 7;
  const baseSwordY = 1 + bodyBob + (isPureVertical ? aimSin * 2.5 : 0);

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
    ctx.fillStyle = '#475569';
    ctx.fillRect(-1, -1, 5, 4);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(0, -21, 3.5, 21);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(1, -22, 2.5, 22);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(2, -21, 1, 19);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-3.5, 0, 10, 2.5);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-3.5, 0, 1.5, 2.5);
    ctx.fillRect(5, 0, 1.5, 2.5);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(0.5, 2.5, 2.5, 4);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(0, 6.5, 3.5, 2.5);
    ctx.restore();
  };

  const drawSlashCrescent = () => {
    if (slashProgressT < 0) return;
    const t = slashProgressT;
    ctx.save();
    ctx.translate(aimCos * 5.5, aimSin * 6 + bodyBob);
    ctx.rotate(localAim);
    ctx.strokeStyle =
      swingKind === 'ult' ? 'rgba(147, 197, 253, 0.9)' : 'rgba(254, 240, 138, 0.85)';
    ctx.lineWidth = (swingKind === 'tactical' || swingKind === 'ult' ? 4.2 : 3.5) * (1 - t * 0.45);
    ctx.beginPath();
    ctx.arc(2, 0, 22 * (1 + (swingAmp - 1) * 0.4), -1.25, -1.25 + t * 2.55);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(2, 0, 24 * (1 + (swingAmp - 1) * 0.4), -1.1, -1.1 + t * 2.35);
    ctx.stroke();
    ctx.restore();
  };

  const drawPlume = () => {
    const plumeWave = moving ? -3 + Math.sin(walkPhase * 1.6) * 2 : Math.sin(now * 0.009) * 1.4;
    if (isPureVertical && isBack) {
      // Plume cascades down back of greathelm
      ctx.fillStyle = '#B91C1C';
      ctx.fillRect(-2.5, -24 + headBob, 5, 5);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(-2 + plumeWave * 0.25, -20 + headBob, 4, 8);
      ctx.fillRect(-1.5 + plumeWave * 0.45, -13 + headBob, 3, 5);
      return;
    }
    if (isPureVertical && isFront) {
      ctx.fillStyle = '#B91C1C';
      ctx.fillRect(-2.5, -25 + headBob, 5, 5);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(-2 + plumeWave * 0.2, -27 + headBob, 4, 3);
      return;
    }
    const pShift = isDiagonal ? 0.6 : 1.0;
    ctx.fillStyle = '#B91C1C';
    ctx.fillRect(-3, -24 + headBob, 5, 4);
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-6 + plumeWave * 0.6 * pShift, -25 + headBob, 5, 3);
    ctx.fillRect(-8 + plumeWave * pShift, -23 + headBob, 4, 3);
  };

  const weaponBehind = isBack && aimSin <= 0.35;

  // 1. Cape behind torso when facing Front/Side
  if (!isBack) {
    drawWarCape();
  }
  if (weaponBehind) {
    drawSword();
  }

  // 2. Articulated Greaves & Sabatons
  const legs = getLegPositions(s, 6);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(legs.lx, legs.ly, 5, 5);
  ctx.fillStyle = '#334155';
  ctx.fillRect(legs.lx - 0.5, legs.ly + 4 - bodyBob, 6, 2.5);
  ctx.fillStyle = '#334155';
  ctx.fillRect(legs.rx, legs.ry, 5, 5);
  ctx.fillStyle = '#475569';
  ctx.fillRect(legs.rx, legs.ry, 2, 4);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(legs.rx, legs.ry + 4 - bodyBob, 6, 2.5);

  // 3. Sculpted Steel Cuirass & Armored Tassets
  ctx.fillStyle = '#334155';
  ctx.fillRect(-8, -7 + bodyBob, 16, 14);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(-7, -6 + bodyBob, 14, 11);
  if (!isBack) {
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-5, -5 + bodyBob, 10, 3);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-1.5, -4 + bodyBob, 3, 9);
    ctx.fillRect(-4.5, -2 + bodyBob, 9, 2.5);
  }
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-8, 5 + bodyBob, 16, 2.5);
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(-2, 5 + bodyBob, 4, 2.5);

  // 4. Layered Winged Pauldrons
  ctx.fillStyle = '#475569';
  ctx.fillRect(-11, -9 + bodyBob, 5, 6);
  ctx.fillRect(6, -9 + bodyBob, 5, 6);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(-10, -8 + bodyBob, 3, 3);
  ctx.fillRect(7, -8 + bodyBob, 3, 3);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-11, -10 + bodyBob, 5, 1.5);
  ctx.fillRect(6, -10 + bodyBob, 5, 1.5);

  // When facing Back (N/NE/NW), shield & cape drape over back of cuirass
  if (isBack) {
    drawShield();
    drawWarCape();
  }

  // 5. Horned Steel Greathelm (with Front/Diagonal Visor vs Back Plate + Plume)
  if (!isBack && isPureVertical) {
    drawPlume();
  }
  ctx.fillStyle = '#334155';
  ctx.fillRect(-7, -20 + headBob, 14, 13);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(-6, -19 + headBob, 12, 11);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-4, -19 + headBob, 8, 3);

  if (isBack) {
    // Back of Greathelm: central spine trim, only tiny corner visor hint on 3/4 NE/NW
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(isDiagonal ? 1 : -1, -20 + headBob, 2, 11);
    if (isDiagonal) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(4, -14 + headBob, 3, 2.5);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(5, -14 + headBob, 1.5, 1.5);
    }
    drawPlume();
  } else {
    const crestX = isPureVertical ? -1 : isDiagonal ? 0 : -1;
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(crestX, -20 + headBob, 2, 11);
    if (isPureVertical) {
      // Symmetrical twin-slit forward visor
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-5, -14 + headBob, 10, 3);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(-4, -14 + headBob, 3, 2);
      ctx.fillRect(1, -14 + headBob, 3, 2);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(-3, -14 + headBob, 1.5, 1);
      ctx.fillRect(1.5, -14 + headBob, 1.5, 1);
    } else {
      const visorX = isDiagonal ? -4 : -3;
      const glowX = isDiagonal ? -1.5 : 0;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(visorX, -14 + headBob, 9, 3);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(glowX, -14 + headBob, 5, 2);
      ctx.fillStyle = '#E0F2FE';
      ctx.fillRect(glowX + 3, -14 + headBob, 2, 1);
      drawPlume();
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

  const drawQuiver = () => {
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
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-2, -6, 4, 14);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-2, -3, 4, 1.5);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-3, -10, 2.5, 4);
    ctx.fillStyle = '#34D399';
    ctx.fillRect(0, -11, 2.5, 5);
    ctx.restore();
  };

  const drawCloak = () => {
    if (isPureVertical) {
      const sway = moving ? Math.sin(walkPhase * 1.5) * 1.6 : idleWave * 1.0;
      ctx.fillStyle = '#0F2418';
      ctx.fillRect(-9, -5 + bodyBob, 18, 15);
      ctx.fillStyle = '#1E3A29';
      ctx.fillRect(-10, 4 + bodyBob + sway * 0.35, 20, 7);
      ctx.fillStyle = '#2D5A3C';
      ctx.fillRect(-7.5, -4 + bodyBob, 15, 13);
      return;
    }
    const shiftX = isDiagonal ? cloakTail * 0.35 : cloakTail * 0.5;
    const tailX = isDiagonal ? -9 + cloakTail * 0.65 : -12 + cloakTail;
    ctx.fillStyle = '#0F2418';
    ctx.fillRect(-10 + shiftX, -5 + bodyBob, 14, 14);
    ctx.fillStyle = '#1E3A29';
    ctx.fillRect(tailX, 3 + bodyBob, 10, 8);
    ctx.fillStyle = '#2D5A3C';
    ctx.fillRect(-8 + shiftX * 0.8, -4 + bodyBob, 10, 12);
  };

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  let drawPull = moving ? 0.5 : 0;
  let releaseTwang = 0;
  let showNockedArrow = true;
  const baseBowTilt = localAim + (moving ? Math.sin(walkPhase) * 0.06 : idleWave * 0.03);
  const baseBowX = aimCos * 8.2 + (moving && !isPureVertical ? strideA * 0.8 : 0);
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
    ctx.restore();
  };

  const bowBehind = isBack && aimSin <= 0.2;

  if (!isBack) {
    drawCloak();
    drawQuiver();
  }
  if (bowBehind) {
    drawBow();
  }

  // 3. Agile Leather Boots & Stride
  const legs = getLegPositions(s, 6, 4.0);
  ctx.fillStyle = '#271E15';
  ctx.fillRect(legs.lx, legs.ly, 4.5, 5);
  ctx.fillStyle = '#142E1F';
  ctx.fillRect(legs.lx - 0.5, legs.ly + 4 - bodyBob, 5.5, 2.5);
  ctx.fillStyle = '#3E2F20';
  ctx.fillRect(legs.rx, legs.ry, 4.5, 5);
  ctx.fillStyle = '#142E1F';
  ctx.fillRect(legs.rx, legs.ry + 4 - bodyBob, 5.5, 2.5);

  // 4. Forest Brigandine Tunic & Emerald Clasp
  ctx.fillStyle = '#2D5A3C';
  ctx.fillRect(-7, -6 + bodyBob, 14, 13);
  ctx.fillStyle = '#3F7A52';
  ctx.fillRect(-6, -5 + bodyBob, 12, 10);
  if (!isBack) {
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-6, -5 + bodyBob, 3, 3);
    ctx.fillRect(-3, -2 + bodyBob, 3, 3);
    ctx.fillRect(0, 1 + bodyBob, 3, 3);
    ctx.fillStyle = '#34D399';
    ctx.fillRect(-1, -3 + bodyBob, 3, 3);
  }
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-6, 4 + bodyBob, 12, 2);

  if (isBack) {
    drawCloak();
    drawQuiver();
  }

  // 5. Pointed Archer Cowl & Keen Emerald Eyes
  ctx.fillStyle = '#142E1F';
  ctx.fillRect(isPureVertical ? -7.5 : -8, -19 + headBob, 15, 13);
  ctx.fillStyle = '#2D5A3C';
  ctx.fillRect(isPureVertical ? -6.5 : -7, -18 + headBob, 13, 10);
  ctx.fillStyle = '#3F7A52';
  ctx.fillRect(isPureVertical ? -2.5 : -4, -21 + headBob, 5, 3);

  if (isBack) {
    // Back of hood + trailing scarf
    ctx.fillStyle = '#1E3A29';
    ctx.fillRect(-4, -14 + headBob, 8, 5);
    ctx.fillStyle = '#3F7A52';
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
      // Symmetrical forward-facing cowl mask & twin eyes
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-4.5, -13 + headBob, 9, 4.5);
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(-3, -12 + headBob, 2, 2);
      ctx.fillRect(1, -12 + headBob, 2, 2);
    } else {
      const maskX = isDiagonal ? -3.5 : -3;
      const eye1X = isDiagonal ? -1.5 : 0;
      const eye2X = isDiagonal ? 2.5 : 4;
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(maskX, -13 + headBob, 8, 4.5);
      ctx.fillStyle = '#4ADE80';
      ctx.fillRect(eye1X, -12 + headBob, 2.5, 2);
      ctx.fillRect(eye2X, -12 + headBob, 2, 2);
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
  const staffSide = isPureVertical
    ? aimCos < -0.2
      ? -8.5
      : 8.5
    : aimCos < -0.35
      ? -8.5
      : 8.5;

  const baseStaffAngle =
    (aimCos < -0.35 ? -0.14 : 0.14) +
    Math.sin(localAim) * 0.18 +
    (moving ? Math.sin(walkPhase) * 0.08 : Math.sin(now * 0.004) * 0.06);
  const baseStaffX =
    staffSide + (moving && !isPureVertical ? strideA * 1.2 : 0);
  const baseStaffY = -1 + floatBob + (isPureVertical ? aimSin * 2 : 0);
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

  const drawStaff = () => {
    ctx.save();
    ctx.translate(staffOffX, staffOffY);
    ctx.rotate(staffAngle);
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
    ctx.restore();
  };

  const staffBehind = isBack && aimSin <= 0.25;
  if (staffBehind) {
    drawStaff();
  }

  // 1. Billowing Cosmic Robe Skirt & Hovering Boots
  const hemOff = isPureVertical ? 0 : hemFlow * (isDiagonal ? 0.35 : 0.5);
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-9.5 + hemOff, -4 + floatBob, 19, 16);
  ctx.fillStyle = '#312E81';
  ctx.fillRect(-8 + hemOff * 0.6, -3 + floatBob, 16, 14);

  const legs = getLegPositions(s, 9 + floatBob - bodyBob, 2.5, 0.6);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(legs.lx + 0.5, legs.ly, 4, 3);
  ctx.fillRect(legs.rx + 1, legs.ry, 4, 3);

  // Inner Indigo Tunic & Glowing Celestial Runes
  ctx.fillStyle = '#4338CA';
  ctx.fillRect(-6, -4 + floatBob, 12, 13);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-8 + hemOff * 0.6, 9 + floatBob, 16, 2);
  if (!isBack) {
    ctx.fillRect(-2, -1 + floatBob, 4, 2);
    ctx.fillRect(-1, 2 + floatBob, 2, 4);
  } else {
    // Back arcane spine rune
    ctx.fillStyle = '#6366F1';
    ctx.fillRect(-1.5, -2 + floatBob, 3, 9);
  }

  // 2. Shoulder Mantle & Astral Scarf
  ctx.fillStyle = '#4F46E5';
  ctx.fillRect(-9, -7 + floatBob, 18, 4.5);
  ctx.fillStyle = '#818CF8';
  ctx.fillRect(-6, -6 + floatBob, 12, 2);

  // 3. Crooked-Tip Archmage Hat + Glowing Cyan Star Band
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-11, -15 + headBob * 0.9, 22, 3);
  ctx.fillStyle = '#312E81';
  ctx.fillRect(-7, -21 + headBob * 0.9, 14, 7);
  ctx.fillStyle = '#4338CA';
  ctx.fillRect(isPureVertical ? -4.5 : -5, -26 + headBob * 0.9, 9, 6);
  const hatTipWave = moving ? -3 + Math.sin(walkPhase) * 1.2 : idleWave * 1.1;
  const hatTipShift = isPureVertical ? hatTipWave * 0.25 : hatTipWave;
  ctx.fillStyle = '#6366F1';
  ctx.fillRect(-2.5 + hatTipShift * 0.5, -29 + headBob * 0.9, 5, 4);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-7, -17 + headBob * 0.9, 14, 2);
  ctx.fillRect(-1.5 + hatTipShift, -30 + headBob * 0.9, 2.5, 2.5);

  if (!isBack) {
    // Mystic Cowl Face & Starlight Eyes (Front / Diagonal / Side)
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-5, -13 + headBob * 0.9, 10, 5);
    ctx.fillStyle = '#38BDF8';
    if (isPureVertical) {
      ctx.fillRect(-3.5, -12 + headBob * 0.9, 2.5, 2);
      ctx.fillRect(1, -12 + headBob * 0.9, 2.5, 2);
    } else {
      const eShift = isDiagonal ? -0.5 : 0;
      ctx.fillRect(-1 + eShift, -12 + headBob * 0.9, 2.5, 2);
      ctx.fillRect(3 + eShift, -12 + headBob * 0.9, 2.5, 2);
    }
  } else {
    // Back of hat / dark collar hair when facing away
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(-6, -13 + headBob * 0.9, 12, 5);
  }

  // 4. Off-Hand Floating Channeling Spark
  const castPulse = isAttacking ? Math.sin(atkProgress * Math.PI) : 0;
  const offSideSign = staffSide >= 0 ? -1 : 1;
  const handX = offSideSign * (11 - castPulse * 3.5 * swingAmp) - (offSideSign < 0 ? 2 : 2);
  const handY = -1 + floatBob + Math.sin(now * 0.007) * 1.5 - castPulse * 2.5;
  ctx.fillStyle = '#4338CA';
  ctx.fillRect(handX, handY, 4, 4);
  ctx.fillStyle = castPulse > 0.35 ? '#E0F2FE' : '#38BDF8';
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
    ctx.fillStyle = `rgba(56, 189, 248, ${(1 - t) * 0.85})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 4.5 * swingAmp * (1 - t * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  // 6. Local Orbiting Astral Conduit Motes
  const orbAngle = now * 0.0052;
  const ox = Math.cos(orbAngle) * 15;
  const oy = Math.sin(orbAngle) * 6 + floatBob;
  ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.fillRect(ox - 2.5, oy - 2.5, 5, 5);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(ox - 0.5, oy - 0.5, 1, 1);
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

  const drawHalo = () => {
    const haloY = -22 + headBob + idleWave * 0.8;
    ctx.save();
    ctx.translate(0, haloY);
    ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(now * 0.0014);
    ctx.fillStyle = '#FEF08A';
    for (let r = 0; r < 4; r++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillRect(-1.5, -12.5, 3, 3.5);
    }
    ctx.restore();
  };

  const drawCape = () => {
    if (isPureVertical) {
      ctx.fillStyle = '#78350F';
      ctx.fillRect(-9, -6 + bodyBob, 18, 16);
      ctx.fillStyle = '#92400E';
      ctx.fillRect(-8, -5 + bodyBob, 16, 14);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-8, 8 + bodyBob, 16, 1.5);
      return;
    }
    const shiftX = isDiagonal ? capeSway * 0.35 : capeSway * 0.5;
    ctx.fillStyle = '#78350F';
    ctx.fillRect(-10 + shiftX, -6 + bodyBob, 14, 16);
    ctx.fillStyle = '#92400E';
    ctx.fillRect(-9 + shiftX * 0.6, -5 + bodyBob, 12, 14);
  };

  const aimCos = Math.cos(localAim);
  const aimSin = Math.sin(localAim);
  const baseMaceAngle =
    aimCos < -0.25
      ? localAim + Math.PI / 2 - 0.3
      : moving
        ? 0.35 + aimSin * 0.2 - Math.sin(walkPhase) * 0.18
        : 0.2 + aimSin * 0.2 + idleWave * 0.08;
  const baseMaceX = isPureVertical
    ? aimCos < -0.2
      ? Math.max(-9, aimCos * 8)
      : Math.max(7.5, aimCos * 8)
    : aimCos < -0.35
      ? aimCos * 8
      : moving
        ? 7 + strideA * 1.4
        : 8;
  const baseMaceY = 0 + bodyBob + (isPureVertical ? aimSin * 2.5 : 0);
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

  const drawMace = () => {
    ctx.save();
    ctx.translate(maceOffX, maceOffY);
    ctx.rotate(maceAngle);
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
    ctx.restore();
  };

  const drawSweepArc = () => {
    if (sweepT < 0) return;
    const t = sweepT;
    ctx.save();
    ctx.translate(aimCos * 5.5, aimSin * 6 + bodyBob);
    ctx.rotate(localAim);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
    ctx.lineWidth = (swingAmp > 1.05 ? 3.8 : 3) * (1 - t * 0.4);
    ctx.beginPath();
    ctx.arc(2, 0, 20 * (1 + (swingAmp - 1) * 0.35), -1.1, -1.1 + t * 2.25);
    ctx.stroke();
    ctx.restore();
  };

  const maceBehind = isBack && aimSin <= 0.3;

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
  ctx.fillStyle = '#451A03';
  ctx.fillRect(legs.lx + 0.5, legs.ly, 4.5, 4);
  ctx.fillRect(legs.rx, legs.ry, 4.5, 4);

  // 3. Ivory Ceremonial Tabard & Gold Sunburst Embroidery
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-8, -6 + bodyBob, 16, 16);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-7, -5 + bodyBob, 14, 14);
  if (!isBack) {
    ctx.fillStyle = '#B45309';
    ctx.fillRect(-6, -5 + bodyBob, 2.5, 13);
    ctx.fillRect(3.5, -5 + bodyBob, 2.5, 13);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-3, -2 + bodyBob, 6, 6);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-1.5, -0.5 + bodyBob, 3, 3);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-7, 7 + bodyBob, 14, 2);
  }

  if (isBack) {
    drawCape();
    drawHalo();
  }

  // 4. Winged Sun Mitre & Face
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-7, -19 + headBob, 14, 12);
  ctx.fillStyle = '#FDE047';
  ctx.fillRect(-8, -19 + headBob, 16, 3);
  ctx.fillRect(-2, -22 + headBob, 4, 4);
  if (!isBack) {
    ctx.fillStyle = '#FCD34D';
    ctx.fillRect(-5, -13 + headBob, 10, 5);
    ctx.fillStyle = '#78350F';
    if (isPureVertical) {
      ctx.fillRect(-3, -12 + headBob, 2, 2);
      ctx.fillRect(1, -12 + headBob, 2, 2);
    } else {
      const eShift = isDiagonal ? -0.5 : 0;
      ctx.fillRect(-2 + eShift, -12 + headBob, 2, 2);
      ctx.fillRect(2 + eShift, -12 + headBob, 2, 2);
    }
  } else {
    // Back of mitre with golden vertical trim
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-1, -16 + headBob, 2, 8);
  }

  // 5. Left Hand: Swinging Sacred Reliquary Censer on Chain
  const censerWave = isAttacking ? Math.sin(atkProgress * Math.PI) : 0;
  const censerSwing = isAttacking
    ? -0.55 * censerWave * swingAmp
    : moving
      ? -0.25 + Math.sin(walkPhase) * 0.25
      : idleWave * 0.14;
  ctx.save();
  ctx.translate(-10 - censerWave * 2.5, -2 + bodyBob - censerWave * 2.5);
  ctx.rotate(censerSwing);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-0.5, 0, 1.5, 6);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-2.5, 6, 5, 5);
  ctx.fillStyle = isAttacking ? '#FFFFFF' : '#FEF08A';
  ctx.fillRect(-1.5, 7, 3, 3);
  ctx.restore();

  if (!maceBehind) {
    drawMace();
  }
  drawSweepArc();
}

export function drawHeroClassLabel(_heroClass: HeroClassId): void {
  // Helper type export reference preserved for modularity
}
