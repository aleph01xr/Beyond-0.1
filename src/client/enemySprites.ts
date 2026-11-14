import type { BiomeId, EnemyState } from '../shared/types.ts';
import { resolveEnemyDirection8, type DirectionalPose } from './directionalFacing.ts';

function getEnemyPose(en: EnemyState, facing?: DirectionalPose) {
  const pose = facing ?? resolveEnemyDirection8(en);
  const mirrorX = !pose.isPureVertical && pose.facingLeft;
  const isBack = pose.verticalPlane === 'back';
  const isFront = pose.verticalPlane === 'front';
  const isSide = pose.verticalPlane === 'side';
  const gazeX = pose.isPureVertical ? 0 : pose.isDiagonal ? 1.5 : 2.5;
  return { pose, mirrorX, isBack, isFront, isSide, gazeX };
}

/**
 * Draws the Gelatinous Slime with fluid squash-and-stretch animation,
 * glowing nucleus, specular jelly shine, expressive blinking eyes, and drip effects.
 */
export function drawSlimeSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  biome: BiomeId,
  facing?: DirectionalPose
): void {
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';

  // Distinct Idle Jelly Breathing vs Moving Hop vs Windup Squash
  let stretchY = 1;
  let stretchX = 1;
  let yOffset = 0;

  if (isWindup) {
    stretchY = 0.72;
    stretchX = 1.35;
    yOffset = 2;
  } else if (isMoving) {
    const bouncePhase = (now * 0.012 + ex * 0.1) % (Math.PI * 2);
    stretchY = 1 + Math.sin(bouncePhase) * 0.24;
    stretchX = 1 / stretchY;
    yOffset = Math.abs(Math.sin(bouncePhase)) * -6;
  } else {
    // Rich idle organic jelly breathing with subtle side-to-side gel wobble
    const idleBounce = Math.sin(now * 0.0034 + ex * 0.2);
    stretchY = 1 + idleBounce * 0.11;
    const idleWobble = Math.cos(now * 0.0026 + ex * 0.15) * 0.04;
    stretchX = (1 / stretchY) + idleWobble;
    yOffset = -Math.abs(idleBounce) * 1.2;
  }

  const sy = ey + yOffset;

  // Shadow expands/flattens realistically with squash-and-stretch
  const shadowW = en.radius * (1 + (1 - stretchY) * 0.5) * 1.8;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, shadowW / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Biome-specific jelly palette
  let outerJelly = '#15803D';
  let innerJelly = '#22C55E';
  let nucleusColor = '#86EFAC';
  let eyeColor = '#052E16';

  if (en.slowedMs > 0 || en.frozenMs > 0) {
    outerJelly = '#0284C7';
    innerJelly = '#38BDF8';
    nucleusColor = '#BAE6FD';
    eyeColor = '#082F49';
  } else if (biome === 'catacombs') {
    outerJelly = '#0D9488';
    innerJelly = '#2DD4BF';
    nucleusColor = '#99F6E4';
    eyeColor = '#042F2E';
  } else if (biome === 'ember') {
    outerJelly = '#C2410C';
    innerJelly = '#F97316';
    nucleusColor = '#FDE047';
    eyeColor = '#431407';
  } else if (biome === 'void') {
    outerJelly = '#4C1D95';
    innerJelly = '#7C3AED';
    nucleusColor = '#F43F5E';
    eyeColor = '#1E1B4B';
  } else if (biome === 'astral') {
    outerJelly = '#0369A1';
    innerJelly = '#0EA5E9';
    nucleusColor = '#FEF08A';
    eyeColor = '#082F49';
  }

  ctx.save();
  ctx.translate(ex, sy);
  ctx.scale(mirrorX ? -stretchX : stretchX, stretchY);

  // 1. Outer Translucent Jelly Dome
  ctx.fillStyle = outerJelly;
  ctx.beginPath();
  ctx.arc(0, 0, en.radius, Math.PI, 0, false);
  ctx.lineTo(en.radius, en.radius * 0.6);
  ctx.quadraticCurveTo(0, en.radius * 0.9, -en.radius, en.radius * 0.6);
  ctx.closePath();
  ctx.fill();

  // 2. Inner Glowing Core Body
  ctx.fillStyle = innerJelly;
  ctx.beginPath();
  ctx.arc(0, 1, en.radius * 0.78, Math.PI, 0, false);
  ctx.lineTo(en.radius * 0.78, en.radius * 0.45);
  ctx.quadraticCurveTo(0, en.radius * 0.7, -en.radius * 0.78, en.radius * 0.45);
  ctx.closePath();
  ctx.fill();

  // 3. Floating Buoyant Nucleus Core (shifts subtly toward movement/facing direction)
  const nucBob = isMoving ? Math.sin(now * 0.008) * 1.5 : Math.sin(now * 0.004 + ex) * 2.2;
  const nucX = (!isMoving ? Math.cos(now * 0.003 + ex) * 1.2 : 0) + gazeX * 0.6;
  const nucY = -1 + nucBob + pose.dirY * 1.1;
  ctx.fillStyle = nucleusColor;
  ctx.beginPath();
  ctx.arc(nucX, nucY, en.radius * 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Floating micro-bubbles drifting inside the jelly
  const bubbleY1 = Math.sin(now * 0.005 + ex) * 1.8;
  const bubbleY2 = Math.cos(now * 0.004 + ex) * 1.8;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-en.radius * 0.3, -en.radius * 0.2 + bubbleY1, 2, 2);
  ctx.fillRect(en.radius * 0.25, en.radius * 0.1 + bubbleY2, 1.5, 1.5);

  // 4. Glossy Specular Bevel & Shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(-en.radius * 0.6, -en.radius * 0.75, en.radius * 0.65, 3);
  ctx.fillRect(-en.radius * 0.7, -en.radius * 0.65, 3, en.radius * 0.35);

  // 5. Expressive Blinking Eyes (hidden on rear-facing North planes; gaze shifts toward facing)
  if (!isBack) {
    const blink = Math.sin(now * 0.0028 + ex) > 0.94;
    const eyeY = -en.radius * 0.15 + pose.dirY * 1.4;
    const eyeSpacing = en.radius * 0.38;
    const eyeOffsetX = gazeX * 0.85;

    ctx.fillStyle = eyeColor;
    if (blink) {
      ctx.fillRect(-eyeSpacing - 3 + eyeOffsetX, eyeY, 6, 2);
      ctx.fillRect(eyeSpacing - 3 + eyeOffsetX, eyeY, 6, 2);
    } else {
      // Open jelly eyes
      ctx.fillRect(-eyeSpacing - 2.5 + eyeOffsetX, eyeY - 2.5, 5, 5);
      ctx.fillRect(eyeSpacing - 2.5 + eyeOffsetX, eyeY - 2.5, 5, 5);
      // Shiny white reflection pupils
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-eyeSpacing - 1.5 + eyeOffsetX, eyeY - 2, 2, 2);
      ctx.fillRect(eyeSpacing - 1.5 + eyeOffsetX, eyeY - 2, 2, 2);
    }
  }

  ctx.restore();

  // Dropping slime trails when moving
  if (isMoving && Math.random() < 0.2) {
    ctx.fillStyle = innerJelly;
    ctx.fillRect(ex + (Math.random() - 0.5) * 8, ey + en.radius - 2, 2, 2);
  }
}

/**
 * Draws the Scrappy Goblin Skirmisher with pointed ears, gold earring,
 * stitched leather jerkin, glowing amber eyes, and jagged iron scimitar.
 */
export function drawGoblinSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Fidgety rapid goblin breathing vs walking bob
  const idleBreathing = Math.sin(now * 0.0062 + ex * 0.18) * 1.4;
  const walkBob = isMoving ? Math.sin(now * 0.018 + ex * 0.15) * 2.5 : idleBreathing;
  const legCycle = isMoving ? Math.sin(now * 0.02 + ex * 0.1) * 3 : 0;
  const legX = pose.isPureVertical ? 0 : legCycle;
  const legY = pose.isPureVertical ? legCycle * 0.75 : 0;

  // Ear twitching: goblins nervously perk their pointed ears
  const earTwitchCycle = Math.sin(now * 0.0035 + ex);
  const earTwitch = !isMoving && earTwitchCycle > 0.85 ? Math.sin(now * 0.04) * 1.8 : 0;

  // Shifty glances: looking around warily when idle
  const eyeShift = !isMoving && Math.sin(now * 0.002 + ex) > 0.35 ? 1 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 11, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey + walkBob);
  if (mirrorX) ctx.scale(-1, 1);

  const drawScimitar = () => {
    ctx.save();
    const swordIdleWiggle = !isMoving ? Math.sin(now * 0.005 + ex) * 0.08 : 0;
    const swordAngle = isWindup
      ? -0.8
      : isMoving
        ? 0.3 + Math.sin(now * 0.015) * 0.2
        : 0.28 + swordIdleWiggle;
    ctx.translate(6, 2);
    ctx.rotate(swordAngle);
    // Hilt
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-2, -1, 4, 2);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-4, -2, 8, 2);
    // Curved notched iron blade
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, -14, 3, 13);
    ctx.fillRect(1, -17, 3, 4);
    // Metallic sharp edge & notches
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(2, -16, 1, 14);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, -8, 2, 2); // Blade battle notch
    ctx.restore();
  };

  if (isBack) {
    drawScimitar();
  }

  // 1. Leather Bound Legs & Feet
  ctx.fillStyle = '#451A03';
  ctx.fillRect(-5 + legX, 7 + legY, 4, 5);
  ctx.fillRect(2 - legX, 7 - legY, 4, 5);
  // Dirty cloth wraps
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-5 + legX, 9 + legY, 5, 3);
  ctx.fillRect(2 - legX, 9 - legY, 5, 3);

  // 2. Stitched Leather Jerkin & Rope Belt
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-6, -2, 12, 10);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(-5, -1, 10, 8);
  // Belt
  ctx.fillStyle = '#451A03';
  ctx.fillRect(-6, 4, 12, 2);
  if (!isBack) {
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-1, 4, 3, 2);
    // Bronze chest strap
    ctx.fillStyle = '#B45309';
    ctx.fillRect(-4, -1, 2, 5);
    ctx.fillRect(-2, 2, 2, 2);
  } else {
    // Rear stitched seam & back strap
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-1, -1, 2, 5);
    ctx.fillStyle = '#B45309';
    ctx.fillRect(-5, 0, 10, 1.5);
  }

  // 3. Goblin Head & Pointed Nose
  ctx.fillStyle = '#4D7C0F';
  ctx.fillRect(-6, -13, 12, 11);
  ctx.fillStyle = '#65A30D';
  ctx.fillRect(-5, -12, 10, 9);
  if (!isBack && !pose.isPureVertical) {
    // Pointed goblin nose on side / 3-4 profiles
    ctx.fillStyle = '#3F6212';
    ctx.fillRect(5, -8, pose.isDiagonal ? 2 : 3, 3);
  }

  // 4. Large Pointed Goblin Ears with Twitching
  // Left ear
  ctx.fillStyle = '#3F6212';
  ctx.fillRect(-10, -11 + earTwitch, 5, 4);
  ctx.fillRect(-12, -10 + earTwitch, 3, 2);
  ctx.fillStyle = '#65A30D';
  ctx.fillRect(-9, -10 + earTwitch, 3, 2);
  // Right ear
  ctx.fillStyle = '#3F6212';
  ctx.fillRect(4, -12 - earTwitch, 5, 4);
  ctx.fillRect(8, -13 - earTwitch, 3, 2);
  ctx.fillStyle = '#65A30D';
  ctx.fillRect(5, -11 - earTwitch, 3, 2);
  // Golden earring hoop on right ear
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(8, -10 - earTwitch, 2, 3);

  // 5. Menacing Glowing Amber/Red Eyes (front & side planes) vs Rear Skull Shading
  if (!isBack) {
    const faceOffset = pose.isPureVertical ? -3 : pose.isDiagonal ? -1 + gazeX * 0.5 : eyeShift;
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(faceOffset, -9, 3, 3);
    ctx.fillRect(faceOffset + 4, -9, 3, 3);
    ctx.fillStyle = isWindup ? '#EF4444' : '#FBBF24';
    ctx.fillRect(faceOffset + 1, -8, 2, 2);
    ctx.fillRect(faceOffset + 4.5, -8, 2, 2);
  } else {
    ctx.fillStyle = '#3F6212';
    ctx.fillRect(-4, -12, 8, 5);
  }

  // 6. Jagged Scavenged Iron Scimitar
  if (!isBack) {
    drawScimitar();
  }

  ctx.restore();
}

/**
 * Draws the Skeletal Ancient Warrior with articulated ribcage,
 * skull with spectral cyan soul flames, notched shortsword, and wooden buckler.
 */
export function drawSkeletonSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Undead skeletal rattle sway
  const idleRattle = Math.sin(now * 0.0032 + ex * 0.14) * 1.3;
  const walkBob = isMoving ? Math.sin(now * 0.016 + ex * 0.2) * 2 : idleRattle;
  const legCycle = isMoving ? Math.sin(now * 0.02 + ex * 0.1) * 4 : 0;
  const legX = pose.isPureVertical ? 0 : legCycle;
  const legY = pose.isPureVertical ? legCycle * 0.65 : 0;

  // Skull micro-tilt & jaw rattle when idle
  const jawDrop = !isMoving && Math.sin(now * 0.003 + ex) > 0.72 ? 1 : 0;
  const skullTilt = !isMoving ? Math.sin(now * 0.0022 + ex) * 0.04 : 0;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 11, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey + walkBob);
  if (mirrorX) ctx.scale(-1, 1);

  const drawSwordAndBuckler = () => {
    // Wooden Buckler Shield
    ctx.fillStyle = '#451A03';
    ctx.fillRect(-10, -3, 4, 10);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-10, -3, 4, 1);
    ctx.fillRect(-10, 6, 4, 1);
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-11, 1, 2, 2);

    // Weathered Iron Shortsword
    ctx.save();
    const swordIdle = !isMoving ? Math.sin(now * 0.003 + ex) * 0.06 : 0;
    const swordAngle = isWindup
      ? -0.7
      : isMoving
        ? 0.2 + Math.sin(now * 0.015) * 0.15
        : 0.18 + swordIdle;
    ctx.translate(6, 2);
    ctx.rotate(swordAngle);
    ctx.fillStyle = '#78350F';
    ctx.fillRect(0, 0, 2, 4);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-2, -1, 6, 2);
    ctx.fillStyle = '#64748B';
    ctx.fillRect(0, -14, 3, 13);
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(1, -13, 1, 11);
    ctx.restore();
  };

  if (isBack) {
    drawSwordAndBuckler();
  }

  // 1. Skeletal Bone Legs
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-4 + legX, 7 + legY, 2, 6);
  ctx.fillRect(2 - legX, 7 - legY, 2, 6);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-5 + legX, 11 + legY, 3, 2);
  ctx.fillRect(1 - legX, 11 - legY, 3, 2);

  // 2. Tattered Grave Shroud / Moldering Tunic behind
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-6, 0, 12, 8);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-5, 6, 10, 4);

  // 3. Articulated Ribcage & Spine
  ctx.fillStyle = '#475569';
  ctx.fillRect(-1, -1, 2, 8); // Spine vertebrae
  // Rib bones
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-5, -2, 10, 2);
  ctx.fillRect(-6, 1, 12, 2);
  ctx.fillRect(-5, 4, 10, 2);
  if (!isBack) {
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-3, 0, 2, 2);
    ctx.fillRect(1, 0, 2, 2);
  } else {
    // Prominent dorsal spine vertebrae when seen from behind
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(-1, -3, 2, 10);
  }

  // 4. Ancient Ivory Bone Skull with subtle tilt
  ctx.save();
  ctx.rotate(skullTilt);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(-6, -14, 12, 11);
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(-5, -13, 10, 9);

  if (!isBack) {
    const faceX = gazeX * 0.45;
    // Cheekbones & jawline with jaw creak
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-5, -4 + jawDrop, 10, 2);
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-4, -4 + jawDrop, 1, 2);
    ctx.fillRect(-2, -4 + jawDrop, 1, 2);
    ctx.fillRect(0, -4 + jawDrop, 1, 2);
    ctx.fillRect(2, -4 + jawDrop, 1, 2);

    // Nasal cavity
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-1 + faceX, -7, 2, 2);

    // 5. Deep Eye Sockets with Spectral Cyan Soul Flames
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-4.5 + faceX, -10, 3.5, 3.5);
    ctx.fillRect(1 + faceX, -10, 3.5, 3.5);

    const soulFlicker = Math.sin(now * 0.024 + ex) * 0.8;
    const flameH = 2.4 + Math.sin(now * 0.016 + ex) * 0.6;
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-4 + faceX, -9.5 + soulFlicker, 2.5, flameH);
    ctx.fillRect(1.5 + faceX, -9.5 + soulFlicker, 2.5, flameH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-3.5 + faceX, -9 + soulFlicker, 1, 1);
    ctx.fillRect(2 + faceX, -9 + soulFlicker, 1, 1);
  } else {
    // Rear cranium & tattered hood seam
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(-4, -6, 8, 3);
    ctx.fillStyle = '#475569';
    ctx.fillRect(-1, -13, 2, 5);
  }
  ctx.restore();

  if (!isBack) {
    drawSwordAndBuckler();
  }

  ctx.restore();
}

/**
 * Draws the Void Cultist Acolyte with levitating hover glide,
 * layered dark purple ceremonial robes with golden runic hem, deep cowl, and dark magic orb.
 */
export function drawCultistSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';
  // Smooth levitation hover glide
  const hoverBob = Math.sin(now * 0.0055 + ex * 0.1) * 3.5;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Shadow expands/contracts with hover height
  const shadowScale = 1 - Math.abs(hoverBob) * 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 12, 11 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey - 2 + hoverBob);
  if (mirrorX) ctx.scale(-1, 1);

  // 1. Billowing Dark Purple Vestments / Robes with idle air draft flutter
  const robeFlap = isMoving ? Math.sin(now * 0.015) * 2 : Math.sin(now * 0.004 + ex * 0.12) * 1.5;
  ctx.fillStyle = '#2E1065';
  ctx.fillRect(-8, -4, 16, 16);
  ctx.fillStyle = '#3B0764';
  ctx.fillRect(-7, -3, 14, 14);
  // Frayed billowing robe bottom teeth
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-8 + robeFlap, 11, 4, 4);
  ctx.fillRect(-3, 12, 5, 4);
  ctx.fillRect(3 - robeFlap, 11, 4, 4);

  // 2. Gold Runic Embroidery along Robe Hem & Chest/Back
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-7, 9, 14, 2);
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(-1, -2, 2, 7);
  ctx.fillRect(-3, 1, 6, 1);
  ctx.fillRect(-2, 4, 4, 1);

  // 3. Deep Shadowed Occult Cowl / Hood
  ctx.fillStyle = '#2E1065';
  ctx.fillRect(-8, -16, 16, 13);
  ctx.fillStyle = '#3B0764';
  ctx.fillRect(-7, -15, 14, 11);
  // Pointed peak of cowl
  ctx.fillRect(-2, -18, 4, 3);
  ctx.fillStyle = '#581C87';
  ctx.fillRect(-1, -19, 2, 2);

  if (!isBack) {
    const faceX = gazeX * 0.55;
    // 4. Abyssal Darkness inside Cowl
    ctx.fillStyle = '#0F0E17';
    ctx.fillRect(-5 + faceX, -12, 10, 7);

    // 5. Piercing Eldritch Magenta Eyes with subtle pulse
    const eyeColor = isWindup ? '#EF4444' : '#C084FC';
    ctx.fillStyle = eyeColor;
    ctx.fillRect(-3.5 + faceX, -9, 2.5, 2.5);
    ctx.fillRect(1 + faceX, -9, 2.5, 2.5);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-3 + faceX, -8.5, 1, 1);
    ctx.fillRect(1.5 + faceX, -8.5, 1, 1);
  } else {
    // Gold rear cowl trim when facing North
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-4, -5, 8, 1.5);
    ctx.fillStyle = '#581C87';
    ctx.fillRect(-2, -15, 4, 8);
  }

  // 6. Floating Swirling Void Orb with Pulsating Expansion
  const orbBob = Math.sin(now * 0.008 + ex) * 2;
  const orbPulse = Math.sin(now * 0.006 + ex) * 0.8;
  const ox = 9;
  const oy = -1 + orbBob;

  // Void orb aura
  ctx.fillStyle = 'rgba(126, 34, 206, 0.4)';
  ctx.beginPath();
  ctx.arc(ox, oy, 7 + orbPulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4C1D95';
  ctx.beginPath();
  ctx.arc(ox, oy, 4.5 + orbPulse * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#A855F7';
  ctx.beginPath();
  ctx.arc(ox, oy, 2.5 + orbPulse * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F3E8FF';
  ctx.fillRect(ox - 0.5, oy - 0.5, 1, 1);

  // Dual Orbiting Void Sparks
  // Primary spark
  const orbAngle1 = now * 0.012;
  const sx1 = ox + Math.cos(orbAngle1) * 6;
  const sy1 = oy + Math.sin(orbAngle1) * 4;
  ctx.fillStyle = '#E9D5FF';
  ctx.fillRect(sx1 - 0.5, sy1 - 0.5, 1.5, 1.5);

  // Secondary counter-orbiting spark
  const orbAngle2 = -now * 0.008 + Math.PI;
  const sx2 = ox + Math.cos(orbAngle2) * 8;
  const sy2 = oy + Math.sin(orbAngle2) * 5;
  ctx.fillStyle = '#C084FC';
  ctx.fillRect(sx2 - 0.5, sy2 - 0.5, 1, 1);

  ctx.restore();
}

/**
 * Draws the Corrupted Bastion Knight in heavy blackened plate armor,
 * horned visor with crimson war-glare, spiked pauldrons, notched broadsword, and scarred tower shield.
 */
export function drawKnightSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Heavy plate-armored breathing vs heavy march bob
  const idleBob = Math.sin(now * 0.0028 + ex * 0.12) * 1.3;
  const walkBob = isMoving ? Math.sin(now * 0.014 + ex * 0.1) * 2.5 : idleBob;
  const legCycle = isMoving ? Math.sin(now * 0.016 + ex * 0.1) * 3 : 0;
  const legX = pose.isPureVertical ? 0 : legCycle;
  const legY = pose.isPureVertical ? legCycle * 0.7 : 0;

  // Tattered red war cape draft flutter
  const capeWave = Math.sin(now * 0.0036 + ex * 0.15) * 2;

  // Heavy armored shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + 13, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, ey + walkBob);
  if (mirrorX) ctx.scale(-1, 1);

  const drawCape = () => {
    ctx.fillStyle = '#881337';
    ctx.fillRect(-10, -5, 20 + capeWave * 0.5, 16);
    ctx.fillStyle = '#9F1239';
    ctx.fillRect(-9, -4, 18 + capeWave * 0.5, 14);
    if (isBack) {
      // Gold heraldic trim on rear cape
      ctx.fillStyle = '#D97706';
      ctx.fillRect(-9, 8, 18 + capeWave * 0.5, 2);
    }
  };

  // 1. Cape behind when facing front/side
  if (!isBack) {
    drawCape();
  }

  // 2. Heavy Greaves & Sabatons (Legs & Feet)
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-6 + legX, 7 + legY, 5, 6);
  ctx.fillRect(2 - legX, 7 - legY, 5, 6);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-7 + legX, 11 + legY, 6, 3);
  ctx.fillRect(1 - legX, 11 - legY, 6, 3);

  // 3. Blackened Steel Cuirass & Heraldic Tabard
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-9, -7, 18, 15);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-8, -6, 16, 13);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-7, -5, 14, 11);
  // Red heraldic sash & lion belt
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(-8, 3, 16, 3);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-2, 3, 4, 3);

  // 4. Spiked Steel Pauldrons
  ctx.fillStyle = '#64748B';
  ctx.fillRect(-12, -8, 5, 6);
  ctx.fillRect(7, -8, 5, 6);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-11, -9, 3, 2); // Spikes
  ctx.fillRect(8, -9, 3, 2);

  // Cape over back torso when facing North
  if (isBack) {
    drawCape();
  }

  // 5. Heavy Barred Greathelm
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-8, -19, 16, 13);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-7, -18, 14, 11);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-6, -17, 12, 9);
  // Helm Crest / Horns
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-3, -22, 6, 4);
  ctx.fillRect(-1, -24, 2, 3);

  // 6. Barred Visor (front/side) vs Solid Rear Helm Plate (back)
  if (!isBack) {
    const visorX = gazeX * 0.65;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-5 + visorX, -13, 10, 4);

    const glarePulse = Math.sin(now * 0.0045 + ex) * 0.2 + 0.8;
    const glowColor = isWindup ? '#FEF08A' : glarePulse > 0.9 ? '#FF4D4D' : '#EF4444';
    ctx.fillStyle = glowColor;
    ctx.fillRect(-4 + visorX, -12, 8, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2 + visorX, -12, 4, 1);
  } else {
    ctx.fillStyle = '#334155';
    ctx.fillRect(-5, -13, 10, 4);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-1, -17, 2, 7);
  }

  // 7. Left Hand: Tower Heater Shield
  const shieldSettle = !isMoving ? Math.cos(now * 0.0028 + ex * 0.12) * 0.5 : 0;
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-14, -6 + shieldSettle, 6, 17);
  ctx.fillStyle = '#991B1B';
  ctx.fillRect(-13, -5 + shieldSettle, 4, 15);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-13, 0 + shieldSettle, 4, 3);
  ctx.fillRect(-12, -2 + shieldSettle, 2, 7);

  // 8. Right Hand: Massive Notched Steel Greatsword
  ctx.save();
  const swordIdle = !isMoving ? Math.sin(now * 0.0024 + ex) * 0.05 : 0;
  const swordAngle = isWindup ? -0.9 : 0.25 + (isMoving ? Math.sin(now * 0.014) * 0.2 : swordIdle);
  ctx.translate(8, 0);
  ctx.rotate(swordAngle);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(0, 0, 3, 5);
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-3, -2, 9, 3);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-1, -22, 5, 20);
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, -21, 3, 18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(1, -20, 1, 16);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-1, -12, 2, 2);

  const gleamCycle = (now * 0.0006 + ex * 0.05) % 1;
  if (!isWindup && gleamCycle > 0.4 && gleamCycle < 0.6) {
    const gleamY = -21 + (gleamCycle - 0.4) * 5 * 18;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, gleamY, 3, 2);
  }
  ctx.restore();

  ctx.restore();
}

/**
 * Draws the Abyssal Shadow Stalker with undulating void cloaks, glowing magenta slits,
 * shadowy spectral blades, and floating dark motes.
 */
export function drawShadowStalkerSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = en.state === 'windup';
  const floatBob = Math.sin(now * 0.007 + ex * 0.2) * 3;
  const sy = ey + floatBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Ground shadow pulse
  ctx.fillStyle = 'rgba(24, 7, 36, 0.55)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, en.radius * 1.1, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 1. Wispy outer shadow mist aura
  const mistPulse = Math.sin(now * 0.009 + ex) * 2;
  ctx.fillStyle = 'rgba(88, 28, 135, 0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, en.radius + mistPulse, 0, Math.PI * 2);
  ctx.fill();

  // 2. Trailing shadow ribbons (3 lower wisps)
  for (let i = -1; i <= 1; i++) {
    const wave = Math.sin(now * 0.012 + i * 2) * 4;
    ctx.fillStyle = '#3B0764';
    ctx.fillRect(i * 6 - 3 + wave, 6, 6, 12);
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(i * 6 - 2 + wave, 12, 4, 6);
  }

  // 3. Main Void Shroud / Torso
  ctx.fillStyle = '#0F0718';
  ctx.fillRect(-10, -10, 20, 18);
  ctx.fillStyle = '#2E1065';
  ctx.fillRect(-7, -8, 14, 14);

  // 4. Horned Shadow Hood
  ctx.fillStyle = '#0F0718';
  ctx.fillRect(-8, -20, 16, 12);
  ctx.fillStyle = '#4C1D95';
  ctx.fillRect(-6, -18, 12, 9);
  // Hood horns
  ctx.fillStyle = '#7C3AED';
  ctx.fillRect(-9, -24, 3, 6);
  ctx.fillRect(6, -24, 3, 6);

  // 5. Piercing Magenta Eyes (front/side) vs Rear Void Spine Seam (back)
  if (!isBack) {
    const eyeX = gazeX * 0.6;
    const eyeColor = isWindup ? '#FDA4AF' : '#F43F5E';
    ctx.fillStyle = eyeColor;
    ctx.fillRect(-5 + eyeX, -14, 3, 3);
    ctx.fillRect(2 + eyeX, -14, 3, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-4 + eyeX, -13, 1, 1);
    ctx.fillRect(3 + eyeX, -13, 1, 1);
  } else {
    ctx.fillStyle = '#7C3AED';
    ctx.fillRect(-1, -16, 2, 16);
  }

  // 6. Dual Void Scythe Blades
  const bladeAngle = isWindup ? 0.6 : Math.sin(now * 0.008) * 0.2;
  ctx.save();
  ctx.translate(-11, 0);
  ctx.rotate(-bladeAngle);
  ctx.fillStyle = '#9333EA';
  ctx.fillRect(-2, -14, 4, 18);
  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(-1, -12, 2, 14);
  ctx.restore();

  ctx.save();
  ctx.translate(11, 0);
  ctx.rotate(bladeAngle);
  ctx.fillStyle = '#9333EA';
  ctx.fillRect(-2, -14, 4, 18);
  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(-1, -12, 2, 14);
  ctx.restore();

  ctx.restore();
}

/**
 * Draws the Astral Sentinel celestial crystal guardian with hovering runic plates,
 * glowing cyan core, starlight prism head, and orbiting astral shards.
 */
export function drawAstralSentinelSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = en.state === 'windup';
  const floatBob = Math.sin(now * 0.005 + ex * 0.15) * 2.5;
  const sy = ey + floatBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Soft celestial starlight shadow
  ctx.fillStyle = 'rgba(14, 116, 144, 0.4)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 1, en.radius * 1.15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 1. Rotating Celestial Rune Ring (Orbiting)
  const rotA = now * 0.002;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, en.radius + 3, rotA, rotA + Math.PI * 1.5);
  ctx.stroke();

  // 2. Heavy Star-Forged Torso Cuirass
  ctx.fillStyle = '#0B1A30';
  ctx.fillRect(-11, -9, 22, 20);
  ctx.fillStyle = '#0369A1';
  ctx.fillRect(-8, -7, 16, 16);

  // 3. Central Starlight Heart Core (subtler dorsal slit on back)
  ctx.fillStyle = isWindup ? '#FEF08A' : '#38BDF8';
  if (!isBack) {
    ctx.fillRect(-5, -4, 10, 10);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2, -1, 4, 4);
  } else {
    ctx.fillRect(-1.5, -6, 3, 12);
    ctx.fillStyle = '#E0F2FE';
    ctx.fillRect(-0.5, -4, 1, 8);
  }

  // 4. Carved Crystal Pauldrons (Floating Shoulder Pads)
  const padShift = Math.sin(now * 0.006) * 1.5;
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-16, -12 + padShift, 6, 10);
  ctx.fillRect(10, -12 - padShift, 6, 10);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-15, -10 + padShift, 4, 6);
  ctx.fillRect(11, -10 - padShift, 4, 6);

  // 5. Angular Prism Visor Head
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-7, -21, 14, 12);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-5, -19, 10, 8);
  if (!isBack) {
    const visorX = gazeX * 0.55;
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(-4 + visorX, -16, 8, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2 + visorX, -15, 4, 1);
  } else {
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1, -19, 2, 7);
  }

  // 6. Orbiting Crystal Shards
  for (let s = 0; s < 3; s++) {
    const ang = now * 0.0035 + (s * Math.PI * 2) / 3;
    const sx = Math.cos(ang) * (en.radius + 7);
    const syOrb = Math.sin(ang) * (en.radius * 0.55);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(sx - 2, syOrb - 2, 4, 4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(sx - 1, syOrb - 1, 2, 2);
  }

  ctx.restore();
}


/**
 * Hymn Phantom — Spectral choir spirit of the Forgotten Sanctuary.
 * Flowing ethereal purple vestments, floating melodious hymn runes,
 * glowing lavender soul eyes, sacred prayer chime, and undulating ghostly tails.
 */
export function drawHymnPhantomSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = en.state === 'windup';
  const floatBob = Math.sin(now * 0.005 + ex * 0.18) * 3.5;
  const sy = ey + floatBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // 1. Soft Consecrated Holy Golden Shadow
  const shadowAlpha = 0.28 + Math.sin(now * 0.004) * 0.08;
  ctx.fillStyle = `rgba(245, 158, 11, ${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius + 1, en.radius * 1.1, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);

  // Mirrored sprite body so text/music notes drawn afterward stay upright
  ctx.save();
  if (mirrorX) ctx.scale(-1, 1);

  // 2. Windup Melody Resonance Wave (Holy Golden Chords)
  if (isWindup) {
    const ringPulse = (now * 0.01) % (Math.PI * 2);
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, en.radius + 4 + Math.sin(ringPulse) * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Ethereal Undulating Holy Spirit Tail (Luminous Warm Ivory & Gold Vapor)
  const tailSway = Math.sin(now * 0.007 + ex) * 3;
  ctx.fillStyle = 'rgba(217, 119, 6, 0.75)';
  ctx.beginPath();
  ctx.moveTo(-en.radius * 0.7, 4);
  ctx.quadraticCurveTo(-en.radius * 0.4 + tailSway, en.radius * 0.9, tailSway, en.radius * 1.25);
  ctx.quadraticCurveTo(en.radius * 0.4 + tailSway, en.radius * 0.9, en.radius * 0.7, 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(254, 243, 199, 0.92)';
  ctx.beginPath();
  ctx.moveTo(-en.radius * 0.5, 6);
  ctx.quadraticCurveTo(tailSway * 0.6, en.radius * 0.8, tailSway * 0.8, en.radius * 1.1);
  ctx.quadraticCurveTo(tailSway * 0.6, en.radius * 0.7, en.radius * 0.5, 6);
  ctx.closePath();
  ctx.fill();

  // 4. Layered Consecrated Ivory Choir Robes
  ctx.fillStyle = '#E5DDD0';
  ctx.fillRect(-en.radius * 0.65, -en.radius * 0.4, en.radius * 1.3, en.radius * 0.9);
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(-en.radius * 0.5, -en.radius * 0.3, en.radius, en.radius * 0.7);
  // Gold hymnal stole / embroidery
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-2, -en.radius * 0.25, 4, en.radius * 0.75);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-1, -en.radius * 0.1, 2, en.radius * 0.5);

  // 5. Sacred Cowl & Glowing Choir Aureole
  ctx.fillStyle = '#F3EFE6';
  ctx.fillRect(-en.radius * 0.55, -en.radius * 1.15, en.radius * 1.1, en.radius * 0.85);
  if (!isBack) {
    const faceX = gazeX * 0.45;
    ctx.fillStyle = '#3E3426';
    ctx.fillRect(-en.radius * 0.4 + faceX, -en.radius * 1.05, en.radius * 0.8, en.radius * 0.65);

    // 6. Glowing Amber-Gold Soul Eyes
    const isBlink = Math.sin(now * 0.002 + ex) > 0.97;
    if (!isBlink) {
      ctx.fillStyle = isWindup ? '#FFFFFF' : '#FEF08A';
      ctx.fillRect(-en.radius * 0.32 + faceX, -en.radius * 0.85, 3, isWindup ? 3 : 2);
      ctx.fillRect(en.radius * 0.15 + faceX, -en.radius * 0.85, 3, isWindup ? 3 : 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-en.radius * 0.26 + faceX, -en.radius * 0.85, 1, 1);
      ctx.fillRect(en.radius * 0.21 + faceX, -en.radius * 0.85, 1, 1);
    }
  } else {
    // Gold-embroidered rear cowl fold
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-en.radius * 0.35, -en.radius * 0.48, en.radius * 0.7, 2);
  }

  // Holy Choir Halo
  ctx.strokeStyle = '#FEF08A';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -en.radius * 1.15, en.radius * 0.6, 2.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  // 7. Sacred Golden Prayer Chime in Hand
  const chimeBob = Math.sin(now * 0.008) * 1.5;
  ctx.fillStyle = '#D97706';
  ctx.fillRect(en.radius * 0.55, -en.radius * 0.2 + chimeBob, 3, 7);
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(en.radius * 0.45, en.radius * 0.1 + chimeBob, 5, 4);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(en.radius * 0.5, en.radius * 0.15 + chimeBob, 2, 2);

  ctx.restore();

  // 8. Orbiting Holy Musical Notes & Hymnal Runes (un-mirrored)
  for (let k = 0; k < 3; k++) {
    const rAng = now * 0.003 + (k * Math.PI * 2) / 3;
    const rx = Math.cos(rAng) * (en.radius + 6);
    const ry = Math.sin(rAng) * (en.radius * 0.45) - 2;
    ctx.fillStyle = '#FEF08A';
    ctx.font = '700 7px serif';
    ctx.fillText(k === 0 ? '♪' : k === 1 ? '♫' : '♩', rx - 2, ry + 2);
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(rx + 2, ry - 3, 1, 1);
  }

  ctx.restore();
}

/**
 * Relic Golem — Heavy ancient bronze and carved basalt reliquary construct.
 * Inlaid golden filigree, glowing amber relic core fissure, massive stone fist,
 * and rune-engraved shoulder slabs.
 */
export function drawRelicGolemSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';
  const stompGait = isMoving ? Math.sin(now * 0.012 + ex) * 2.5 : Math.sin(now * 0.003) * 1;
  const sy = ey + stompGait;
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // 1. Heavy Grounded Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, en.radius * 1.45, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 2. Chiseled Stone Legs
  const legSwing = isMoving ? Math.sin(now * 0.012 + ex) * 4 : 0;
  const legX = pose.isPureVertical ? 0 : legSwing * 0.35;
  const legY = pose.isPureVertical ? legSwing * 0.75 : legSwing;
  ctx.fillStyle = '#292524';
  ctx.fillRect(-en.radius * 0.7 + legX, en.radius * 0.4 + legY, en.radius * 0.55, en.radius * 0.6);
  ctx.fillRect(en.radius * 0.15 - legX, en.radius * 0.4 - legY, en.radius * 0.55, en.radius * 0.6);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-en.radius * 0.7 + legX, en.radius * 0.85 + legY, en.radius * 0.55, 3);
  ctx.fillRect(en.radius * 0.15 - legX, en.radius * 0.85 - legY, en.radius * 0.55, 3);

  // 3. Heavy Weathered Bronze & Basalt Torso
  ctx.fillStyle = '#1C1917';
  ctx.fillRect(-en.radius * 0.9, -en.radius * 0.7, en.radius * 1.8, en.radius * 1.25);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-en.radius * 0.8, -en.radius * 0.6, en.radius * 1.6, en.radius * 1.05);

  // Weathered gold chest filigree
  ctx.fillStyle = '#D97706';
  ctx.fillRect(-en.radius * 0.75, -en.radius * 0.55, en.radius * 1.5, 3);
  ctx.fillRect(-en.radius * 0.75, en.radius * 0.35, en.radius * 1.5, 3);

  // 4. Glowing Relic Heart Core Fissures (front/side) vs Rear Basalt Spine (back)
  if (!isBack) {
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(-en.radius * 0.3, -en.radius * 0.2, en.radius * 0.6, en.radius * 0.5);
    ctx.fillStyle = '#F97316';
    ctx.fillRect(-en.radius * 0.2, -en.radius * 0.12, en.radius * 0.4, en.radius * 0.35);
    ctx.fillStyle = isWindup ? '#FFFFFF' : '#FEF08A';
    ctx.fillRect(-2, -2, 4, 4);
  } else {
    ctx.fillStyle = '#44403C';
    ctx.fillRect(-en.radius * 0.2, -en.radius * 0.45, en.radius * 0.4, en.radius * 0.75);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-1.5, -en.radius * 0.35, 3, en.radius * 0.55);
  }

  // 5. Engraved Stone Shoulder Tablets
  ctx.fillStyle = '#44403C';
  ctx.fillRect(-en.radius * 1.15, -en.radius * 0.85, en.radius * 0.45, en.radius * 0.75);
  ctx.fillRect(en.radius * 0.7, -en.radius * 0.85, en.radius * 0.45, en.radius * 0.75);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-en.radius * 1.05, -en.radius * 0.75, en.radius * 0.25, 2);
  ctx.fillRect(-en.radius * 1.05, -en.radius * 0.55, en.radius * 0.25, 2);
  ctx.fillRect(en.radius * 0.8, -en.radius * 0.75, en.radius * 0.25, 2);
  ctx.fillRect(en.radius * 0.8, -en.radius * 0.55, en.radius * 0.25, 2);

  // 6. Weathered Stone Head & Amber Optical Slit
  ctx.fillStyle = '#292524';
  ctx.fillRect(-en.radius * 0.45, -en.radius * 1.25, en.radius * 0.9, en.radius * 0.6);
  ctx.fillStyle = '#44403C';
  ctx.fillRect(-en.radius * 0.35, -en.radius * 1.15, en.radius * 0.7, en.radius * 0.45);
  if (!isBack) {
    const eyeX = gazeX * 0.55;
    ctx.fillStyle = isWindup ? '#FEF08A' : '#F59E0B';
    ctx.fillRect(-en.radius * 0.25 + eyeX, -en.radius * 0.95, en.radius * 0.5, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1 + eyeX, -en.radius * 0.95, 2, 2);
  }

  // 7. Heavy Stone Crushing Fist (Right Arm)
  const fistRise = isWindup ? -8 : 0;
  ctx.fillStyle = '#292524';
  ctx.fillRect(en.radius * 0.85, -en.radius * 0.3 + fistRise, en.radius * 0.5, en.radius * 0.8);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(en.radius * 0.8, en.radius * 0.2 + fistRise, en.radius * 0.6, 6);
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(en.radius * 0.9, en.radius * 0.3 + fistRise, 3, 3);

  ctx.restore();
}

/**
 * Veiled Heretic — Corrupted religious acolyte of the Chapel of Severed Light.
 * Tattered ascetic robes, occult eye medallion, twisted bone wand crackling with void spark.
 */
export function drawVeiledHereticSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = en.state === 'windup';
  const walkBob = en.state === 'chase' ? Math.sin(now * 0.014 + ex) * 2 : Math.sin(now * 0.003) * 1;
  const sy = ey + walkBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // 1. Ground Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, en.radius * 1.15, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 2. Windup Occult Void Ring
  if (isWindup) {
    ctx.strokeStyle = 'rgba(232, 121, 249, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, en.radius * 0.8, en.radius * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 3. Tattered Corrupted Ascetic Robes
  const hemSway = Math.sin(now * 0.006 + ex) * 2;
  ctx.fillStyle = '#18181B';
  ctx.beginPath();
  ctx.moveTo(-en.radius * 0.7, -en.radius * 0.3);
  ctx.lineTo(-en.radius * 0.8 + hemSway, en.radius * 0.9);
  ctx.lineTo(en.radius * 0.8 + hemSway, en.radius * 0.9);
  ctx.lineTo(en.radius * 0.7, -en.radius * 0.3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#2E1065';
  ctx.fillRect(-en.radius * 0.55, -en.radius * 0.2, en.radius * 1.1, en.radius * 1.05);
  ctx.fillStyle = '#4C1D95';
  ctx.fillRect(-en.radius * 0.35, -en.radius * 0.1, en.radius * 0.7, en.radius * 0.9);

  ctx.fillStyle = '#18181B';
  for (let f = 0; f < 4; f++) {
    ctx.fillRect(-en.radius * 0.7 + f * 7, en.radius * 0.88, 4, 3 + (f % 2) * 2);
  }

  // 4. Occult Eye Medallion at Chest (hidden on rear view)
  if (!isBack) {
    ctx.fillStyle = '#D97706';
    ctx.fillRect(-3, -en.radius * 0.05, 6, 6);
    ctx.fillStyle = '#F43F5E';
    ctx.fillRect(-1.5, 0.5, 3, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-0.5, 1, 1, 1);
  } else {
    ctx.fillStyle = '#6D28D9';
    ctx.fillRect(-1.5, -en.radius * 0.15, 3, en.radius * 0.7);
  }

  // 5. Shrouded Ascetic Cowl & Head
  ctx.fillStyle = '#1E1B4B';
  ctx.fillRect(-en.radius * 0.55, -en.radius * 1.1, en.radius * 1.1, en.radius * 0.9);
  if (!isBack) {
    const faceX = gazeX * 0.5;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(-en.radius * 0.4 + faceX, -en.radius * 1.0, en.radius * 0.8, en.radius * 0.7);

    // Glowing Malevolent Magenta Eyes
    ctx.fillStyle = isWindup ? '#F43F5E' : '#E11D48';
    ctx.fillRect(-en.radius * 0.28 + faceX, -en.radius * 0.75, 2.5, 2);
    ctx.fillRect(en.radius * 0.1 + faceX, -en.radius * 0.75, 2.5, 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-en.radius * 0.22 + faceX, -en.radius * 0.75, 1, 1);
    ctx.fillRect(en.radius * 0.16 + faceX, -en.radius * 0.75, 1, 1);
  } else {
    ctx.fillStyle = '#3B0764';
    ctx.fillRect(-en.radius * 0.35, -en.radius * 0.95, en.radius * 0.7, en.radius * 0.6);
  }

  // 6. Twisted Bone Scripture Wand (Right Arm)
  const wandTilt = isWindup ? -0.5 : 0.15;
  ctx.save();
  ctx.translate(en.radius * 0.65, 0);
  ctx.rotate(wandTilt);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-1.5, -en.radius * 0.9, 3, en.radius * 1.1);
  ctx.fillStyle = '#A855F7';
  ctx.fillRect(-3, -en.radius * 1.1, 6, 5);
  ctx.fillStyle = '#F43F5E';
  ctx.fillRect(-1.5, -en.radius * 1.05, 3, 3);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-0.5, -en.radius * 1.0, 1, 1);
  ctx.restore();

  // 7. Left Hand Gesture with void smoke motes
  ctx.fillStyle = '#4C1D95';
  ctx.fillRect(-en.radius * 0.75, 2, 4, 4);
  const smokeBob = Math.sin(now * 0.01) * 2;
  ctx.fillStyle = '#C084FC';
  ctx.fillRect(-en.radius * 0.8, -2 + smokeBob, 2, 2);

  ctx.restore();
}

/**
 * Celestial Arbiter — Armored divine judge of the Celestial Nave.
 * Pristine ivory & solar-gold plate, winged diadem, floating geometric solar halo,
 * and radiant celestial judgement blades.
 */
export function drawCelestialArbiterSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isWindup = en.state === 'windup';
  const hoverBob = Math.sin(now * 0.005 + ex * 0.15) * 3;
  const sy = ey + hoverBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // 1. Soft Radiant Ground Shadow
  ctx.fillStyle = 'rgba(234, 179, 8, 0.28)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius, en.radius * 1.1, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 2. Floating Geometric Solar Ring Halo
  const haloRot = now * 0.002;
  ctx.save();
  ctx.rotate(haloRot);
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -en.radius * 0.4, en.radius + 3, 0, Math.PI * 2);
  ctx.stroke();
  for (let s = 0; s < 4; s++) {
    const sAng = (s * Math.PI) / 2;
    const sx = Math.cos(sAng) * (en.radius + 3);
    const syH = Math.sin(sAng) * (en.radius + 3) - en.radius * 0.4;
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(sx - 1.5, syH - 1.5, 3, 3);
  }
  ctx.restore();

  // 3. Pristine Ivory & Solar-Gold Cuirass
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(-en.radius * 0.65, -en.radius * 0.55, en.radius * 1.3, en.radius * 1.1);
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(-en.radius * 0.5, -en.radius * 0.45, en.radius, en.radius * 0.95);

  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-en.radius * 0.4, -en.radius * 0.35, en.radius * 0.8, 3);
  ctx.fillRect(-en.radius * 0.4, en.radius * 0.15, en.radius * 0.8, 3);
  if (!isBack) {
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(-2, -en.radius * 0.15, 4, 4);
  } else {
    // Flowing ivory mantle spine down back
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(-en.radius * 0.3, -en.radius * 0.3, en.radius * 0.6, en.radius * 0.8);
    ctx.fillStyle = '#EAB308';
    ctx.fillRect(-1, -en.radius * 0.3, 2, en.radius * 0.75);
  }

  // 4. Angelic Shoulder Fins / Pauldrons
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(-en.radius * 0.95, -en.radius * 0.75, en.radius * 0.35, en.radius * 0.65);
  ctx.fillRect(en.radius * 0.6, -en.radius * 0.75, en.radius * 0.35, en.radius * 0.65);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-en.radius * 0.9, -en.radius * 0.65, 2, en.radius * 0.45);
  ctx.fillRect(en.radius * 0.85, -en.radius * 0.65, 2, en.radius * 0.45);

  // 5. Winged Golden Diadem & Helm
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(-en.radius * 0.45, -en.radius * 1.25, en.radius * 0.9, en.radius * 0.7);
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-en.radius * 0.55, -en.radius * 1.3, en.radius * 1.1, 3);
  ctx.fillRect(-en.radius * 0.5, -en.radius * 1.45, 3, 5);
  ctx.fillRect(en.radius * 0.35, -en.radius * 1.45, 3, 5);

  if (!isBack) {
    const visorX = gazeX * 0.5;
    ctx.fillStyle = isWindup ? '#FEF08A' : '#38BDF8';
    ctx.fillRect(-en.radius * 0.3 + visorX, -en.radius * 0.95, en.radius * 0.6, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-en.radius * 0.15 + visorX, -en.radius * 0.95, en.radius * 0.3, 2);
  }

  // 6. Radiant Judgement Blade (Right Arm)
  const bladeGlint = Math.sin(now * 0.008) * 0.08;
  ctx.save();
  ctx.translate(en.radius * 0.8, -en.radius * 0.1);
  ctx.rotate(bladeGlint + (isWindup ? -0.4 : 0));
  ctx.fillStyle = '#EAB308';
  ctx.fillRect(-4, 0, 8, 3);
  ctx.fillStyle = '#92400E';
  ctx.fillRect(-1, 3, 2, 5);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-2, -en.radius * 1.4, 4, en.radius * 1.4);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(-1, -en.radius * 1.35, 2, en.radius * 1.3);
  ctx.restore();

  ctx.restore();
}

/**
 * Warden Enforcer — Imposing elite guardian of the Warden's Gate.
 * Heavy cobalt-steel plate armor, spiked bastion pauldrons, glowing azure visor,
 * and massive two-handed Warden Halberd.
 */
export function drawWardenEnforcerSprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const isMoving = en.state === 'chase';
  const isWindup = en.state === 'windup';
  const marchBob = isMoving ? Math.sin(now * 0.013 + ex) * 2.5 : Math.sin(now * 0.003) * 1;
  const sy = ey + marchBob;
  const { pose, mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // 1. Heavy Grounded Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, en.radius * 1.35, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // 2. Heavy Greaves / Legs
  const legOffset = isMoving ? Math.sin(now * 0.013 + ex) * 4 : 0;
  const legX = pose.isPureVertical ? 0 : legOffset * 0.35;
  const legY = pose.isPureVertical ? legOffset * 0.75 : legOffset;
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-en.radius * 0.65 + legX, en.radius * 0.45 + legY, en.radius * 0.5, en.radius * 0.6);
  ctx.fillRect(en.radius * 0.15 - legX, en.radius * 0.45 - legY, en.radius * 0.5, en.radius * 0.6);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-en.radius * 0.65 + legX, en.radius * 0.75 + legY, en.radius * 0.5, 3);
  ctx.fillRect(en.radius * 0.15 - legX, en.radius * 0.75 - legY, en.radius * 0.5, 3);

  // 3. Cobalt-Steel Plate Cuirass & Tabard
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(-en.radius * 0.85, -en.radius * 0.6, en.radius * 1.7, en.radius * 1.15);
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-en.radius * 0.75, -en.radius * 0.5, en.radius * 1.5, en.radius * 1.0);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-en.radius * 0.6, -en.radius * 0.4, en.radius * 1.2, en.radius * 0.8);

  if (!isBack) {
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(-2, -en.radius * 0.35, 4, en.radius * 0.7);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1, -en.radius * 0.25, 2, en.radius * 0.5);
  } else {
    // Cobalt bastion back mantle & dorsal ridge
    ctx.fillStyle = '#1E3A8A';
    ctx.fillRect(-en.radius * 0.55, -en.radius * 0.45, en.radius * 1.1, en.radius * 0.9);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(-1, -en.radius * 0.35, 2, en.radius * 0.65);
  }

  // 4. Spiked Bastion Pauldrons
  ctx.fillStyle = '#475569';
  ctx.fillRect(-en.radius * 1.15, -en.radius * 0.8, en.radius * 0.45, en.radius * 0.65);
  ctx.fillRect(en.radius * 0.7, -en.radius * 0.8, en.radius * 0.45, en.radius * 0.65);
  ctx.fillStyle = '#0284C7';
  ctx.fillRect(-en.radius * 1.1, -en.radius * 1.0, 3, 5);
  ctx.fillRect(en.radius * 0.95, -en.radius * 1.0, 3, 5);

  // 5. Great Horned Warden Visor & Helm
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-en.radius * 0.5, -en.radius * 1.25, en.radius, en.radius * 0.7);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-en.radius * 0.4, -en.radius * 1.15, en.radius * 0.8, en.radius * 0.55);

  if (!isBack) {
    const visorX = gazeX * 0.55;
    ctx.fillStyle = isWindup ? '#FEF08A' : '#38BDF8';
    ctx.fillRect(-en.radius * 0.28 + visorX, -en.radius * 0.95, en.radius * 0.56, 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-2 + visorX, -en.radius * 0.95, 4, 2);
  } else {
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(-1, -en.radius * 1.18, 2, en.radius * 0.45);
  }

  // 6. Colossal Warden's Halberd / Poleaxe (Right Arm)
  const halberdTilt = isWindup ? -0.7 : 0.2;
  ctx.save();
  ctx.translate(en.radius * 0.75, 0);
  ctx.rotate(halberdTilt);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-1.5, -en.radius * 1.6, 3, en.radius * 2.2);
  ctx.fillStyle = '#64748B';
  ctx.fillRect(1.5, -en.radius * 1.5, en.radius * 0.75, en.radius * 0.65);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(1.5 + en.radius * 0.65, -en.radius * 1.45, 3, en.radius * 0.55);
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-en.radius * 0.4, -en.radius * 1.35, en.radius * 0.4, 3);
  ctx.restore();

  // 7. Reinforced Kite Buckler on Left Arm
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(-en.radius * 1.15, -en.radius * 0.2, 5, en.radius * 0.8);
  ctx.fillStyle = '#38BDF8';
  ctx.fillRect(-en.radius * 1.1, 0, 3, 4);

  ctx.restore();
}

/**
 * Generic Fallback Enemy — High quality dark fantasy mercenary shadow silhouette
 * with glowing red visor and steel blade so any future mob is immediately visible.
 */
export function drawGenericEnemySprite(
  ctx: CanvasRenderingContext2D,
  en: EnemyState,
  ex: number,
  ey: number,
  now: number,
  facing?: DirectionalPose
): void {
  const walkBob = Math.sin(now * 0.005 + ex) * 1.5;
  const sy = ey + walkBob;
  const { mirrorX, isBack, gazeX } = getEnemyPose(en, facing);

  // Ground Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(ex, ey + en.radius - 2, en.radius * 1.2, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(ex, sy);
  if (mirrorX) ctx.scale(-1, 1);

  // Shaded Cloak
  ctx.fillStyle = '#1F2937';
  ctx.fillRect(-en.radius * 0.65, -en.radius * 0.5, en.radius * 1.3, en.radius * 1.1);
  ctx.fillStyle = '#374151';
  ctx.fillRect(-en.radius * 0.5, -en.radius * 0.4, en.radius, en.radius * 0.9);

  // Masked Helm
  ctx.fillStyle = '#111827';
  ctx.fillRect(-en.radius * 0.45, -en.radius * 1.1, en.radius * 0.9, en.radius * 0.65);

  // Glowing Crimson Eyes (hidden on rear view)
  if (!isBack) {
    const eyeX = gazeX * 0.5;
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-en.radius * 0.25 + eyeX, -en.radius * 0.85, 3, 2);
    ctx.fillRect(en.radius * 0.1 + eyeX, -en.radius * 0.85, 3, 2);
  }

  // Steel Weapon in Hand
  ctx.fillStyle = '#9CA3AF';
  ctx.fillRect(en.radius * 0.6, -en.radius * 0.5, 3, en.radius * 0.9);

  ctx.restore();
}
