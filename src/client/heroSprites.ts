import type { HeroClassId, PlayerState } from '../shared/types.ts';

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
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Draws a crisp, animated pixel-art hero character with articulated limbs,
 * flowing capes/robes, class-distinct silhouettes, and expressive weapon animations
 * (idle sway, run poise, aim-tracking, smooth rotation + translation swing transitions).
 */
export function drawHeroSprite(
  ctx: CanvasRenderingContext2D,
  p: Pick<PlayerState, 'heroClass' | 'attackAnimMs' | 'vx' | 'vy' | 'hasteMs' | 'shield'>,
  hx: number,
  hy: number,
  options: HeroRenderOptions
): void {
  const { aimAngle, bob, moving, now, facingLeft: overrideFacingLeft } = options;
  const facingLeft = overrideFacingLeft !== undefined ? overrideFacingLeft : (Math.cos(aimAngle) < 0);
  // Angle in local sprite space where +X is always "forward"
  const localAim = Math.atan2(Math.sin(aimAngle), facingLeft ? -Math.cos(aimAngle) : Math.cos(aimAngle));

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

  // Dynamic body lean (into runs, telegraphed back/forward on strikes)
  let bodyLean = moving ? (isDashing ? 0.14 : 0.06) : 0;
  if (isAttacking && (p.heroClass === 'vanguard' || p.heroClass === 'cleric')) {
    bodyLean +=
      atkProgress < 0.24
        ? -0.1 * swingAmp
        : Math.sin(Math.min(1, (atkProgress - 0.24) / 0.76) * Math.PI) * 0.16 * swingAmp;
  } else if (isAttacking && (p.heroClass === 'arcanist' || p.heroClass === 'ranger')) {
    bodyLean += Math.sin(atkProgress * Math.PI) * (p.heroClass === 'arcanist' ? 0.08 : -0.06) * swingAmp;
  }

  ctx.save();
  ctx.translate(hx, hy);
  ctx.scale(facingLeft ? -1 : 1, 1);
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
}

function drawVanguard(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const { bodyBob, headBob, strideA, strideB, liftA, liftB, moving, isDashing, idleWave, now, isAttacking, atkProgress, swingKind, swingAmp, localAim, walkPhase } = s;

  // 1. Articulated War Cape (billows behind based on run/dash speed)
  const capeLift = moving ? (isDashing ? -5 : -2.5) + Math.sin(walkPhase * 1.4) * 1.8 : idleWave * 1.1;
  ctx.fillStyle = '#7F1D1D';
  ctx.fillRect(-11 + capeLift * 0.5, -5 + bodyBob, 12, 13);
  ctx.fillRect(-13 + capeLift, 4 + bodyBob, 9, 7);
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(-10 + capeLift * 0.4, -4 + bodyBob, 10, 11);
  // Gold hem trim on cape
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-13 + capeLift, 10 + bodyBob, 8, 1.5);

  // 2. Articulated Greaves & Sabatons
  // Back leg
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-6 + strideB * 3.5, 6 + bodyBob - liftB, 5, 5);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-7 + strideB * 3.5, 10 - liftB, 6, 2.5);
  // Front leg
  ctx.fillStyle = '#334155';
  ctx.fillRect(1 + strideA * 3.5, 6 + bodyBob - liftA, 5, 5);
  ctx.fillStyle = '#475569';
  ctx.fillRect(1 + strideA * 3.5, 6 + bodyBob - liftA, 2, 4);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(1 + strideA * 3.5, 10 - liftA, 6, 2.5);

  // 3. Sculpted Steel Cuirass & Armored Tassets
  ctx.fillStyle = '#334155';
  ctx.fillRect(-8, -7 + bodyBob, 16, 14);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(-7, -6 + bodyBob, 14, 11);
  // Beveled chest highlight
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-5, -5 + bodyBob, 10, 3);
  // Golden Bastion Cross Emblem
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-1.5, -4 + bodyBob, 3, 9);
  ctx.fillRect(-4.5, -2 + bodyBob, 9, 2.5);
  // Armored belt & gold buckle
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

  // 5. Horned Steel Greathelm + Glowing Cyan Visor + Flowing Crimson Plume
  ctx.fillStyle = '#334155';
  ctx.fillRect(-7, -20 + headBob, 14, 13);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(-6, -19 + headBob, 12, 11);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-4, -19 + headBob, 8, 3);
  // Vertical T-crest gold bar & brow
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-1, -20 + headBob, 2, 11);
  // Visor Slit with cyan glow
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-3, -14 + headBob, 9, 3);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(0, -14 + headBob, 5, 2);
  ctx.fillStyle = '#E0F2FE';
  ctx.fillRect(3, -14 + headBob, 2, 1);
  // Flowing Multi-Segment Battle Plume
  const plumeWave = moving ? -3 + Math.sin(walkPhase * 1.6) * 2 : Math.sin(now * 0.009) * 1.4;
  ctx.fillStyle = '#B91C1C';
  ctx.fillRect(-3, -24 + headBob, 5, 4);
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(-6 + plumeWave * 0.6, -25 + headBob, 5, 3);
  ctx.fillRect(-8 + plumeWave, -23 + headBob, 4, 3);

  // 6. Left Hand: Tower Kite Shield (braces forward and tilts dynamically during walk/swing/tactical)
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
  ctx.save();
  ctx.translate(-10 + shieldThrust, -shieldWave * 1.2 + bodyBob);
  ctx.rotate(shieldAngle);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-4, -8, 6, 17);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-3, -7, 4, 14);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-3, -7, 2, 12);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-3, -3, 4, 7);
  ctx.fillRect(-4, -8, 6, 1.5);
  ctx.restore();

  // 7. Right Hand: Sunforged Claymore — Heroic Guard, Run Poise, and Smooth 3-Phase Rotation + Translation Swing
  const baseSwordAngle = moving ? 0.42 + Math.sin(walkPhase) * 0.16 : -0.35 + idleWave * 0.06;
  const baseSwordX = moving ? 6 + strideA * 1.5 : 7;
  const baseSwordY = 1 + bodyBob;

  let swordAngle = baseSwordAngle;
  let swordOffX = baseSwordX;
  let swordOffY = baseSwordY;

  if (isAttacking) {
    const windupAngle = -1.42 * swingAmp;
    const windupX = 4.2;
    const windupY = -2.5 + bodyBob;
    const endAngle = 1.5 * swingAmp + localAim * 0.38;
    const strikeEndX = 9.5 + (swingAmp - 1) * 4;
    const strikeEndY = 3.2 + bodyBob;

    if (atkProgress < 0.22) {
      // Crisp anticipation backswing (angle + pull-back lift)
      const t = easeOutCubic(atkProgress / 0.22);
      swordAngle = lerp(baseSwordAngle, windupAngle, t);
      swordOffX = lerp(baseSwordX, windupX, t);
      swordOffY = lerp(baseSwordY, windupY, t);
    } else if (atkProgress < 0.62) {
      // Explosive cleave arc tracking local aim with forward lunge translation
      const t = easeOutCubic((atkProgress - 0.22) / 0.4);
      swordAngle = lerp(windupAngle, endAngle, t);
      swordOffX = lerp(windupX, strikeEndX, t) + Math.sin(t * Math.PI) * 4.5 * swingAmp;
      swordOffY = lerp(windupY, strikeEndY, t);

      // Crisp pixel-art blade slash crescent during active strike
      ctx.save();
      ctx.translate(4, 0 + bodyBob);
      ctx.rotate(localAim * 0.35);
      ctx.strokeStyle = swingKind === 'ult' ? 'rgba(147, 197, 253, 0.9)' : 'rgba(254, 240, 138, 0.85)';
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
    } else {
      // Seamless follow-through recovery back to active stance
      const t = easeOutCubic((atkProgress - 0.62) / 0.38);
      swordAngle = lerp(endAngle, baseSwordAngle, t);
      swordOffX = lerp(strikeEndX, baseSwordX, t);
      swordOffY = lerp(strikeEndY, baseSwordY, t);
    }
  }

  ctx.save();
  ctx.translate(swordOffX, swordOffY);
  ctx.rotate(swordAngle);
  // Gauntlet grip
  ctx.fillStyle = '#475569';
  ctx.fillRect(-1, -1, 5, 4);
  // Double-edged broad blade with fuller & radiant gleam
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(0, -21, 3.5, 21);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(1, -22, 2.5, 22);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(2, -21, 1, 19);
  // Broad golden crossguard & pommel
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
}

function drawRanger(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const { bodyBob, headBob, strideA, strideB, liftA, liftB, moving, isDashing, idleWave, now, isAttacking, atkProgress, swingAmp, localAim, walkPhase } = s;

  // 1. Leaf-Cut Woodland Cloak (flutters behind swift movement)
  const cloakTail = moving ? (isDashing ? -6 : -3) + Math.sin(walkPhase * 1.5) * 2 : idleWave * 1.3;
  ctx.fillStyle = '#0F2418';
  ctx.fillRect(-10 + cloakTail * 0.5, -5 + bodyBob, 14, 14);
  ctx.fillStyle = '#1E3A29';
  ctx.fillRect(-12 + cloakTail, 3 + bodyBob, 10, 8);
  ctx.fillStyle = '#2D5A3C';
  ctx.fillRect(-8 + cloakTail * 0.4, -4 + bodyBob, 10, 12);

  // 2. Angled Quiver on Back with Bobbing Fletched Arrows
  ctx.save();
  ctx.translate(-9, -6 + bodyBob);
  ctx.rotate(-0.22 + (moving ? Math.sin(walkPhase) * 0.08 : 0));
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-2, -6, 4, 14);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-2, -3, 4, 1.5);
  // Feather fletchings
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-3, -10, 2.5, 4);
  ctx.fillStyle = '#34D399';
  ctx.fillRect(0, -11, 2.5, 5);
  ctx.restore();

  // 3. Agile Leather Boots & Stride
  ctx.fillStyle = '#271E15';
  ctx.fillRect(-6 + strideB * 4, 6 + bodyBob - liftB, 4.5, 5);
  ctx.fillStyle = '#142E1F';
  ctx.fillRect(-7 + strideB * 4, 10 - liftB, 5.5, 2.5);
  ctx.fillStyle = '#3E2F20';
  ctx.fillRect(1 + strideA * 4, 6 + bodyBob - liftA, 4.5, 5);
  ctx.fillStyle = '#142E1F';
  ctx.fillRect(1 + strideA * 4, 10 - liftA, 5.5, 2.5);

  // 4. Forest Brigandine Tunic & Emerald Clasp
  ctx.fillStyle = '#2D5A3C';
  ctx.fillRect(-7, -6 + bodyBob, 14, 13);
  ctx.fillStyle = '#3F7A52';
  ctx.fillRect(-6, -5 + bodyBob, 12, 10);
  // Diagonal bandolier strap + belt
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-6, -5 + bodyBob, 3, 3);
  ctx.fillRect(-3, -2 + bodyBob, 3, 3);
  ctx.fillRect(0, 1 + bodyBob, 3, 3);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-6, 4 + bodyBob, 12, 2);
  ctx.fillStyle = '#34D399';
  ctx.fillRect(-1, -3 + bodyBob, 3, 3);

  // 5. Pointed Archer Cowl & Keen Emerald Eyes
  ctx.fillStyle = '#142E1F';
  ctx.fillRect(-8, -19 + headBob, 15, 13);
  ctx.fillStyle = '#2D5A3C';
  ctx.fillRect(-7, -18 + headBob, 13, 10);
  // Hood peak & trailing scarf tip
  ctx.fillStyle = '#3F7A52';
  ctx.fillRect(-4, -21 + headBob, 5, 3);
  ctx.fillRect(-10 + cloakTail * 0.4, -15 + headBob, 3, 4);
  // Shadowed mask + glowing hunter eyes
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-3, -13 + headBob, 8, 4.5);
  ctx.fillStyle = '#4ADE80';
  ctx.fillRect(0, -12 + headBob, 2.5, 2);
  ctx.fillRect(4, -12 + headBob, 2, 2);

  // 6. Ashwood Recurve Bow + Smooth Draw Extension, Kickback Recoil Translation & Bow Tilt Rotation
  let drawPull = moving ? 0.5 : 0;
  let releaseTwang = 0;
  let showNockedArrow = true;
  const baseBowTilt = localAim * 0.78 + (moving ? Math.sin(walkPhase) * 0.08 : idleWave * 0.04);
  const baseBowX = moving ? 7 + strideA * 1.1 : 7;
  const baseBowY = -1 + bodyBob;
  let bowTilt = baseBowTilt;
  let bowOffX = baseBowX;
  let bowOffY = baseBowY;

  if (isAttacking) {
    const drawBowX = baseBowX + 3.2 * swingAmp;
    const drawBowY = baseBowY - 1.2;
    const drawTilt = localAim * 0.9 - 0.12 * swingAmp;
    const recoilBowX = baseBowX - 2.6 * swingAmp;
    const recoilBowY = baseBowY + 0.8;
    const recoilTilt = localAim * 0.92 + 0.24 * swingAmp;

    if (atkProgress < 0.34) {
      // Brace bow forward, tilt, and draw string taut
      const t = easeOutCubic(atkProgress / 0.34);
      drawPull = t * 5.4;
      bowTilt = lerp(baseBowTilt, drawTilt, t);
      bowOffX = lerp(baseBowX, drawBowX, t);
      bowOffY = lerp(baseBowY, drawBowY, t);
    } else if (atkProgress < 0.64) {
      // Release arrow — crisp bow recoil translation back & upward cant + string vibration
      const t = (atkProgress - 0.34) / 0.3;
      const kick = Math.sin(t * Math.PI);
      drawPull = -1.3 * (1 - t);
      releaseTwang = Math.sin(t * Math.PI * 4) * (1 - t) * 1.9;
      showNockedArrow = false;
      bowTilt = lerp(drawTilt, recoilTilt, easeOutCubic(Math.min(1, t * 1.4)));
      bowOffX = lerp(drawBowX, recoilBowX, kick);
      bowOffY = lerp(drawBowY, recoilBowY, kick);
    } else {
      // Smoothly return bow to rest and nock next arrow
      const t = easeOutCubic((atkProgress - 0.64) / 0.36);
      drawPull = lerp(0, 0.5, t);
      bowTilt = lerp(recoilTilt, baseBowTilt, t);
      bowOffX = lerp(recoilBowX, baseBowX, t);
      bowOffY = lerp(recoilBowY, baseBowY, t);
    }
  }

  ctx.save();
  ctx.translate(bowOffX, bowOffY);
  ctx.rotate(bowTilt);

  // Sculpted Recurve Limbs
  ctx.fillStyle = '#78350F';
  ctx.fillRect(2, -13, 2.5, 5);
  ctx.fillRect(2, 8, 2.5, 5);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(3, -9, 3, 18);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(3, -1, 3, 3); // grip wrap
  // Emerald limb tips
  ctx.fillStyle = '#34D399';
  ctx.fillRect(0.5, -14, 2.5, 2);
  ctx.fillRect(0.5, 12, 2.5, 2);

  // Dynamic Bowstring (V-bend when drawn, twang vibration on snap)
  const stringAnchorX = 1.5 - drawPull + releaseTwang;
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(1.5, -13);
  ctx.lineTo(stringAnchorX, 0);
  ctx.lineTo(1.5, 13);
  ctx.stroke();

  // Drawing Hand & Nocked Jade Arrow
  ctx.fillStyle = '#3F7A52';
  ctx.fillRect(stringAnchorX - 2, -1.5, 3, 3);
  if (showNockedArrow) {
    const arrowX = stringAnchorX;
    ctx.fillStyle = '#A16207';
    ctx.fillRect(arrowX, -0.7, 11, 1.5);
    // Glowing Emerald Broadhead
    ctx.fillStyle = drawPull > 2 ? '#6EE7B7' : '#34D399';
    ctx.fillRect(arrowX + 10, -2, 3.5, 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(arrowX + 12, -1, 1.5, 2);
  } else if (atkProgress < 0.52) {
    // Wind flash right off bow on release
    ctx.strokeStyle = 'rgba(110, 231, 183, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArcanist(ctx: CanvasRenderingContext2D, s: DrawHeroPartsContext): void {
  const { bodyBob, headBob, strideA, strideB, liftA, liftB, moving, isDashing, idleWave, now, isAttacking, atkProgress, swingAmp, localAim, walkPhase } = s;

  // Arcanist glides softly with subtle astral float
  const floatBob = moving ? bodyBob * 0.75 - 1 : idleWave * 1.4 - 0.8;

  // 1. Billowing Cosmic Robe Skirt & Hovering Boots
  const hemFlow = moving ? (isDashing ? -5 : -2.5) + Math.sin(walkPhase) * 1.5 : idleWave * 1;
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-10 + hemFlow * 0.5, -4 + floatBob, 19, 16);
  ctx.fillStyle = '#312E81';
  ctx.fillRect(-8 + hemFlow * 0.3, -3 + floatBob, 16, 14);
  // Glowing boots peaking while striding
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-5 + strideB * 2.5, 9 + floatBob - liftB * 0.6, 4, 3);
  ctx.fillRect(2 + strideA * 2.5, 9 + floatBob - liftA * 0.6, 4, 3);

  // Inner Indigo Tunic & Glowing Celestial Runes
  ctx.fillStyle = '#4338CA';
  ctx.fillRect(-6, -4 + floatBob, 12, 13);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-8 + hemFlow * 0.3, 9 + floatBob, 16, 2);
  ctx.fillRect(-2, -1 + floatBob, 4, 2);
  ctx.fillRect(-1, 2 + floatBob, 2, 4);

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
  ctx.fillRect(-5, -26 + headBob * 0.9, 9, 6);
  const hatTipWave = moving ? -3 + Math.sin(walkPhase) * 1.2 : idleWave * 1.1;
  ctx.fillStyle = '#6366F1';
  ctx.fillRect(-3 + hatTipWave * 0.5, -29 + headBob * 0.9, 5, 4);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-7, -17 + headBob * 0.9, 14, 2);
  ctx.fillRect(-2 + hatTipWave, -30 + headBob * 0.9, 2.5, 2.5);

  // Mystic Cowl Face & Starlight Eyes
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-5, -13 + headBob * 0.9, 10, 5);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-1, -12 + headBob * 0.9, 2.5, 2);
  ctx.fillRect(3, -12 + headBob * 0.9, 2.5, 2);

  // 4. Off-Hand Floating Channeling Spark (lifts & pushes forward during spellcast)
  const castPulse = isAttacking ? Math.sin(atkProgress * Math.PI) : 0;
  const handX = -11 + castPulse * 3.5 * swingAmp;
  const handY = -1 + floatBob + Math.sin(now * 0.007) * 1.5 - castPulse * 2.5;
  ctx.fillStyle = '#4338CA';
  ctx.fillRect(handX, handY, 4, 4);
  ctx.fillStyle = castPulse > 0.35 ? '#E0F2FE' : '#38BDF8';
  ctx.fillRect(handX - 1, handY - 3, 3, 3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(handX, handY - 2, 1, 1);

  // 5. Runebound Spire Staff — Smooth Levitating Tilt Rotation + Forward Spell Thrust Translation
  const baseStaffAngle =
    0.14 + localAim * 0.35 + (moving ? Math.sin(walkPhase) * 0.08 : Math.sin(now * 0.004) * 0.06);
  const baseStaffX = moving ? 8.5 + strideA * 1.2 : 9;
  const baseStaffY = -1 + floatBob;
  let staffAngle = baseStaffAngle;
  let staffOffX = baseStaffX;
  let staffOffY = baseStaffY;
  let flareIntensity = 0;

  if (isAttacking) {
    const windAngle = -0.34 * swingAmp + localAim * 0.25;
    const windX = baseStaffX - 3.5 * swingAmp;
    const windY = baseStaffY - 3.2;
    const castAngle = 0.72 * swingAmp + localAim * 0.65;
    const castX = baseStaffX + 6.5 * swingAmp;
    const castY = baseStaffY + 0.5;

    if (atkProgress < 0.25) {
      // Draw staff back & raise crystal
      const t = easeOutCubic(atkProgress / 0.25);
      staffAngle = lerp(baseStaffAngle, windAngle, t);
      staffOffX = lerp(baseStaffX, windX, t);
      staffOffY = lerp(baseStaffY, windY, t);
      flareIntensity = 0.6 * t;
    } else if (atkProgress < 0.65) {
      // Thrust staff forward toward target with radiant crystal flare
      const t = easeOutCubic((atkProgress - 0.25) / 0.4);
      const thrustArc = Math.sin(t * Math.PI);
      staffAngle = lerp(windAngle, castAngle, t);
      staffOffX = lerp(windX, castX, t) + thrustArc * 2.5;
      staffOffY = lerp(windY, castY, t);
      flareIntensity = 0.6 + 0.4 * thrustArc;
    } else {
      // Seamless recovery translation & angle return
      const t = easeOutCubic((atkProgress - 0.65) / 0.35);
      staffAngle = lerp(castAngle, baseStaffAngle, t);
      staffOffX = lerp(castX, baseStaffX, t);
      staffOffY = lerp(castY, baseStaffY, t);
      flareIntensity = Math.max(0, 0.55 * (1 - t));
    }
  }

  ctx.save();
  ctx.translate(staffOffX, staffOffY);
  ctx.rotate(staffAngle);
  // Staff shaft & gold binding
  ctx.fillStyle = '#581C87';
  ctx.fillRect(-1, -15, 3, 29);
  ctx.fillStyle = '#A855F7';
  ctx.fillRect(-1, -15, 1.5, 28);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-2.5, -16, 6, 2);
  // Twin crescent prongs cradling the prismatic crystal
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
  const { bodyBob, headBob, strideA, strideB, liftA, liftB, moving, idleWave, now, isAttacking, atkProgress, swingAmp, localAim, walkPhase } = s;

  // 1. Rotating Golden Sunburst Halo Behind Head
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
  // 4 rotating cardinal solar rays
  ctx.rotate(now * 0.0014);
  ctx.fillStyle = '#FEF08A';
  for (let r = 0; r < 4; r++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(-1.5, -12.5, 3, 3.5);
  }
  ctx.restore();

  // 2. Amber Ceremonial Cape Drape
  const capeSway = moving ? -2.5 + Math.sin(walkPhase) * 1.4 : idleWave * 0.9;
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-10 + capeSway * 0.5, -6 + bodyBob, 14, 16);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(-9 + capeSway * 0.3, -5 + bodyBob, 12, 14);

  // Boots Striding Beneath Tabard
  ctx.fillStyle = '#451A03';
  ctx.fillRect(-5 + strideB * 3, 8 + bodyBob - liftB * 0.7, 4.5, 4);
  ctx.fillRect(1 + strideA * 3, 8 + bodyBob - liftA * 0.7, 4.5, 4);

  // 3. Ivory Ceremonial Tabard & Gold Sunburst Embroidery
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-8, -6 + bodyBob, 16, 16);
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-7, -5 + bodyBob, 14, 14);
  // Crimson-gold clerical stole & sun crest
  ctx.fillStyle = '#B45309';
  ctx.fillRect(-6, -5 + bodyBob, 2.5, 13);
  ctx.fillRect(3.5, -5 + bodyBob, 2.5, 13);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-3, -2 + bodyBob, 6, 6);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-1.5, -0.5 + bodyBob, 3, 3);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-7, 7 + bodyBob, 14, 2);

  // 4. Winged Sun Mitre & Face
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-7, -19 + headBob, 14, 12);
  ctx.fillStyle = '#FDE047';
  ctx.fillRect(-8, -19 + headBob, 16, 3);
  ctx.fillRect(-2, -22 + headBob, 4, 4);
  ctx.fillStyle = '#FCD34D';
  ctx.fillRect(-5, -13 + headBob, 10, 5);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-2, -12 + headBob, 2, 2);
  ctx.fillRect(2, -12 + headBob, 2, 2);

  // 5. Left Hand: Swinging Sacred Reliquary Censer on Chain (swings & lifts smoothly on casts/strikes)
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

  // 6. Right Hand: Dawnstar Flanged War Mace — Smooth Overhead Windup, Consecrated Strike & Recovery
  const baseMaceAngle = moving ? 0.35 - Math.sin(walkPhase) * 0.18 : 0.2 + idleWave * 0.08;
  const baseMaceX = moving ? 7 + strideA * 1.4 : 8;
  const baseMaceY = 0 + bodyBob;
  let maceAngle = baseMaceAngle;
  let maceOffX = baseMaceX;
  let maceOffY = baseMaceY;

  if (isAttacking) {
    const windAngle = -1.32 * swingAmp;
    const windX = baseMaceX - 3 * swingAmp;
    const windY = baseMaceY - 4 * swingAmp;
    const strikeAngle = 1.42 * swingAmp + localAim * 0.32;
    const strikeX = baseMaceX + 4.5 * swingAmp;
    const strikeY = baseMaceY + 2.5;

    if (atkProgress < 0.26) {
      // Raise Dawnstar mace overhead
      const t = easeOutCubic(atkProgress / 0.26);
      maceAngle = lerp(baseMaceAngle, windAngle, t);
      maceOffX = lerp(baseMaceX, windX, t);
      maceOffY = lerp(baseMaceY, windY, t);
    } else if (atkProgress < 0.62) {
      // Forceful downward radiant strike + forward lunge translation
      const t = easeOutCubic((atkProgress - 0.26) / 0.36);
      maceAngle = lerp(windAngle, strikeAngle, t);
      maceOffX = lerp(windX, strikeX, t) + Math.sin(t * Math.PI) * 3.5 * swingAmp;
      maceOffY = lerp(windY, strikeY, t);

      // Golden solar consecration sweep arc
      ctx.save();
      ctx.translate(4, -2 + bodyBob);
      ctx.rotate(localAim * 0.3);
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.85)';
      ctx.lineWidth = (swingAmp > 1.05 ? 3.8 : 3) * (1 - t * 0.4);
      ctx.beginPath();
      ctx.arc(2, 0, 20 * (1 + (swingAmp - 1) * 0.35), -1.1, -1.1 + t * 2.25);
      ctx.stroke();
      ctx.restore();
    } else {
      // Seamless follow-through recovery back to rest stance
      const t = easeOutCubic((atkProgress - 0.62) / 0.38);
      maceAngle = lerp(strikeAngle, baseMaceAngle, t);
      maceOffX = lerp(strikeX, baseMaceX, t);
      maceOffY = lerp(strikeY, baseMaceY, t);
    }
  }

  ctx.save();
  ctx.translate(maceOffX, maceOffY);
  ctx.rotate(maceAngle);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(-1, -12, 3, 22);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-1, 3, 3, 6);
  // Spiked Sunhead
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-3.5, -19, 8, 8);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-2, -17.5, 5, 5);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-0.5, -22, 2, 3);
  ctx.fillRect(-5.5, -16, 2, 2);
  ctx.fillRect(4.5, -16, 2, 2);
  ctx.restore();
}

export function drawHeroClassLabel(_heroClass: HeroClassId): void {
  // Helper type export reference preserved for modularity
}
