import {
  computeGroundTargetPosition,
  getAbilityTargetSpec,
  getPrimaryAttackRange,
  simulateDashEndpoint,
  type AbilityAimState,
} from '../shared/abilityTargeting.ts';
import type {
  DungeonMap,
  GameSnapshot,
  HeroClassId,
  PlayerState,
} from '../shared/types.ts';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return `rgba(255, 255, 255, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawTargetBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  now: number
): void {
  const pulseR = r + 5 + Math.sin(now * 0.012) * 1.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, pulseR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawAbilityTargetingIndicator(
  ctx: CanvasRenderingContext2D,
  map: DungeonMap,
  snap: GameSnapshot,
  player: PlayerState,
  playerX: number,
  playerY: number,
  aim: AbilityAimState,
  now: number
): void {
  const spec = getAbilityTargetSpec(player.heroClass, aim.action);
  const cancelled = aim.cancelled;
  const primary = cancelled ? '#EF4444' : spec.accentColor;
  const secondary = cancelled
    ? '#FCA5A5'
    : spec.secondaryColor || spec.accentColor;
  const pulse = 0.88 + 0.12 * Math.sin(now * 0.01);

  ctx.save();

  if (spec.kind === 'dash') {
    const dashDist =
      spec.action === 'tactical'
        ? spec.range
        : Math.max(24, Math.min(spec.range, aim.aimDistance || spec.defaultDist));
    const end = simulateDashEndpoint(
      map,
      snap.props,
      snap.npcs,
      playerX,
      playerY,
      aim.aimAngle,
      dashDist,
      spec.collisionRadius ?? 14
    );
    const actualDx = end.x - playerX;
    const actualDy = end.y - playerY;
    const actualLen = Math.hypot(actualDx, actualDy);
    const dirAngle = actualLen > 1 ? Math.atan2(actualDy, actualDx) : aim.aimAngle;

    // Max dash range guide ring for variable-distance evasion dash
    if (spec.action === 'dash') {
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = hexToRgba(primary, 0.28);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(playerX, playerY, spec.range, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Trajectory corridor from player to collision-clamped landing point
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(dirAngle);
    const corridorHalfW = 11;
    ctx.fillStyle = hexToRgba(primary, 0.2 * pulse);
    ctx.fillRect(0, -corridorHalfW, actualLen, corridorHalfW * 2);

    ctx.strokeStyle = hexToRgba(primary, 0.85);
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(0, -corridorHalfW);
    ctx.lineTo(actualLen, -corridorHalfW);
    ctx.moveTo(0, corridorHalfW);
    ctx.lineTo(actualLen, corridorHalfW);
    ctx.stroke();

    // Dashed center spine + animated chevrons
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = hexToRgba(secondary, 0.85);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(actualLen, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    const step = 22;
    const offset = ((now * 0.06) % step);
    ctx.strokeStyle = hexToRgba(secondary, 0.9);
    ctx.lineWidth = 2;
    for (let d = 14 + offset; d < actualLen - 6; d += step) {
      ctx.beginPath();
      ctx.moveTo(d - 5, -5);
      ctx.lineTo(d, 0);
      ctx.lineTo(d - 5, 5);
      ctx.stroke();
    }
    ctx.restore();

    // Bulwark Dash impact stun & shield wave rings at landing location
    if (spec.secondaryRadius && spec.secondaryRadius > spec.aoeRadius) {
      ctx.save();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = hexToRgba(secondary, 0.48);
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.arc(end.x, end.y, spec.secondaryRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (spec.aoeRadius > 24) {
      ctx.fillStyle = hexToRgba(primary, 0.14 * pulse);
      ctx.beginPath();
      ctx.arc(end.x, end.y, spec.aoeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(primary, 0.88);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(end.x, end.y, spec.aoeRadius, 0, Math.PI * 2);
      ctx.stroke();

      for (const en of snap.enemies) {
        if (en.hp <= 0) continue;
        if (Math.hypot(en.x - end.x, en.y - end.y) <= spec.aoeRadius) {
          drawTargetBracket(ctx, en.x, en.y, en.radius, secondary, now);
        }
      }
    }

    // Landing destination marker
    ctx.fillStyle = hexToRgba(primary, 0.28);
    ctx.strokeStyle = hexToRgba(secondary, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = secondary;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (spec.kind === 'cone_volley') {
    const offsets = spec.coneRayOffsets || [-0.28, -0.14, 0, 0.14, 0.28];
    const halfSpread = Math.abs(offsets[offsets.length - 1]) + 0.04;
    const minAng = aim.aimAngle - halfSpread;
    const maxAng = aim.aimAngle + halfSpread;

    // Translucent cone sector
    const grad = ctx.createRadialGradient(
      playerX,
      playerY,
      16,
      playerX,
      playerY,
      spec.range
    );
    grad.addColorStop(0, hexToRgba(primary, 0.22 * pulse));
    grad.addColorStop(1, hexToRgba(primary, 0.04));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(playerX, playerY);
    ctx.arc(playerX, playerY, spec.range, minAng, maxAng);
    ctx.closePath();
    ctx.fill();

    // Outer cone border & arc
    ctx.strokeStyle = hexToRgba(primary, 0.72);
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(
      playerX + Math.cos(minAng) * 16,
      playerY + Math.sin(minAng) * 16
    );
    ctx.lineTo(
      playerX + Math.cos(minAng) * spec.range,
      playerY + Math.sin(minAng) * spec.range
    );
    ctx.moveTo(
      playerX + Math.cos(maxAng) * 16,
      playerY + Math.sin(maxAng) * 16
    );
    ctx.lineTo(
      playerX + Math.cos(maxAng) * spec.range,
      playerY + Math.sin(maxAng) * spec.range
    );
    ctx.stroke();

    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(playerX, playerY, spec.range, minAng, maxAng);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5 individual arrow trajectory lines + arrowheads
    for (const off of offsets) {
      const ang = aim.aimAngle + off;
      const sx = playerX + Math.cos(ang) * 16;
      const sy = playerY + Math.sin(ang) * 16;
      const tx = playerX + Math.cos(ang) * spec.range;
      const ty = playerY + Math.sin(ang) * spec.range;
      ctx.strokeStyle = hexToRgba(secondary, off === 0 ? 0.92 : 0.65);
      ctx.lineWidth = off === 0 ? 2.2 : 1.4;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrowhead tip
      const headLen = 9;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(
        tx - Math.cos(ang - 0.45) * headLen,
        ty - Math.sin(ang - 0.45) * headLen
      );
      ctx.moveTo(tx, ty);
      ctx.lineTo(
        tx - Math.cos(ang + 0.45) * headLen,
        ty - Math.sin(ang + 0.45) * headLen
      );
      ctx.stroke();
    }

    // Highlight enemies inside the volley cone
    for (const en of snap.enemies) {
      if (en.hp <= 0) continue;
      const dx = en.x - playerX;
      const dy = en.y - playerY;
      const d = Math.hypot(dx, dy);
      if (d <= spec.range + en.radius) {
        const diff = Math.atan2(
          Math.sin(Math.atan2(dy, dx) - aim.aimAngle),
          Math.cos(Math.atan2(dy, dx) - aim.aimAngle)
        );
        if (Math.abs(diff) <= halfSpread) {
          drawTargetBracket(ctx, en.x, en.y, en.radius, secondary, now);
        }
      }
    }
  } else if (spec.kind === 'ground_aoe') {
    const target = computeGroundTargetPosition(
      playerX,
      playerY,
      aim.aimAngle,
      aim.aimDistance,
      spec
    );

    // Outer cast-range boundary ring around player
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = hexToRgba(primary, 0.36);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(playerX, playerY, spec.range, 0, Math.PI * 2);
    ctx.stroke();

    // Dashed tether line from player to target center
    if (target.distance > 6) {
      ctx.strokeStyle = hexToRgba(secondary, 0.55);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playerX, playerY);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Affected AoE ground zone circle
    ctx.fillStyle = hexToRgba(primary, 0.18 * pulse);
    ctx.beginPath();
    ctx.arc(target.x, target.y, spec.aoeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(primary, 0.92);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(target.x, target.y, spec.aoeRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating inner rune ring
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.rotate(now * 0.0014);
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = hexToRgba(secondary, 0.72);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, spec.aoeRadius * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center reticle crosshair
    ctx.strokeStyle = hexToRgba(secondary, 0.95);
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();

    // Highlight affected enemies / allies inside ground AoE
    if (player.heroClass === 'arcanist') {
      for (const en of snap.enemies) {
        if (en.hp <= 0) continue;
        if (Math.hypot(en.x - target.x, en.y - target.y) <= spec.aoeRadius) {
          drawTargetBracket(ctx, en.x, en.y, en.radius, secondary, now);
        }
      }
    } else if (player.heroClass === 'cleric') {
      for (const ally of snap.players) {
        if (Math.hypot(ally.x - target.x, ally.y - target.y) <= spec.aoeRadius) {
          drawTargetBracket(
            ctx,
            ally.x,
            ally.y,
            14,
            cancelled ? '#EF4444' : '#34D399',
            now
          );
        }
      }
      for (const en of snap.enemies) {
        if (en.hp <= 0) continue;
        if (Math.hypot(en.x - target.x, en.y - target.y) <= spec.aoeRadius) {
          drawTargetBracket(ctx, en.x, en.y, en.radius, primary, now);
        }
      }
    }
  } else if (spec.kind === 'self_aoe') {
    // Self-centered AoE ring
    ctx.fillStyle = hexToRgba(primary, 0.13 * pulse);
    ctx.beginPath();
    ctx.arc(playerX, playerY, spec.aoeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = hexToRgba(primary, 0.88);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(playerX, playerY, spec.aoeRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner rotating dashed ring
    ctx.save();
    ctx.translate(playerX, playerY);
    ctx.rotate(-now * 0.001);
    ctx.setLineDash([10, 7]);
    ctx.strokeStyle = hexToRgba(secondary, 0.55);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, spec.aoeRadius * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);

    // Arcanist Astral Nova 8-way starburst trajectory rays
    if (spec.radialRays && spec.radialRays > 0) {
      for (let i = 0; i < spec.radialRays; i++) {
        const ang = (i * Math.PI * 2) / spec.radialRays;
        const sx = playerX + Math.cos(ang) * 14;
        const sy = playerY + Math.sin(ang) * 14;
        const tx = playerX + Math.cos(ang) * spec.aoeRadius;
        const ty = playerY + Math.sin(ang) * spec.aoeRadius;
        ctx.strokeStyle = hexToRgba(secondary, 0.75);
        ctx.lineWidth = 1.6;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);

        const headLen = 8;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          tx - Math.cos(ang - 0.45) * headLen,
          ty - Math.sin(ang - 0.45) * headLen
        );
        ctx.moveTo(tx, ty);
        ctx.lineTo(
          tx - Math.cos(ang + 0.45) * headLen,
          ty - Math.sin(ang + 0.45) * headLen
        );
        ctx.stroke();
      }
    }

    // Secondary inner ring (Cleric Sanctified Pulse 135px Holy Sear inside 210px Heal)
    if (spec.secondaryRadius && spec.secondaryRadius > 0) {
      ctx.fillStyle = hexToRgba(secondary, 0.12 * pulse);
      ctx.beginPath();
      ctx.arc(playerX, playerY, spec.secondaryRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(secondary, 0.9);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(playerX, playerY, spec.secondaryRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Highlight affected enemies or allies
    if (player.heroClass === 'vanguard') {
      for (const ally of snap.players) {
        if (!ally.downed && Math.hypot(ally.x - playerX, ally.y - playerY) <= spec.aoeRadius) {
          drawTargetBracket(ctx, ally.x, ally.y, 14, secondary, now);
        }
      }
    } else if (player.heroClass === 'cleric') {
      for (const ally of snap.players) {
        if (!ally.downed && Math.hypot(ally.x - playerX, ally.y - playerY) <= spec.aoeRadius) {
          drawTargetBracket(ctx, ally.x, ally.y, 14, primary, now);
        }
      }
      const searR = spec.secondaryRadius || 135;
      for (const en of snap.enemies) {
        if (en.hp <= 0) continue;
        if (Math.hypot(en.x - playerX, en.y - playerY) <= searR) {
          drawTargetBracket(ctx, en.x, en.y, en.radius, secondary, now);
        }
      }
    } else {
      for (const en of snap.enemies) {
        if (en.hp <= 0) continue;
        if (Math.hypot(en.x - playerX, en.y - playerY) <= spec.aoeRadius) {
          drawTargetBracket(ctx, en.x, en.y, en.radius, secondary, now);
        }
      }
    }
  }

  ctx.restore();
}

export function drawPrimaryAttackRangeIndicator(
  ctx: CanvasRenderingContext2D,
  playerX: number,
  playerY: number,
  heroClass: HeroClassId,
  hasTargetInRange: boolean,
  isAttacking: boolean
): void {
  const range = getPrimaryAttackRange(heroClass);
  const engaged = hasTargetInRange || isAttacking;
  const strokeAlpha = engaged ? 0.2 : 0.1;

  ctx.save();
  ctx.strokeStyle = `rgba(226, 232, 240, ${strokeAlpha})`;
  ctx.lineWidth = engaged ? 1.25 : 1;
  ctx.setLineDash([6, 9]);
  ctx.beginPath();
  ctx.arc(playerX, playerY, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
