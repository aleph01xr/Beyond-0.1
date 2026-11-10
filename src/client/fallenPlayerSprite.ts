import { HERO_CLASSES, type PlayerState } from '../shared/types.ts';

/**
 * Beyond — Fallen & Ethereal Ghost State Animation System
 *
 * Provides unmistakable, high-fidelity visual feedback when a player entity
 * reaches 0 HP during co-op dungeon combat:
 *
 * 1. Ground Plane: Fallen hero slumped on the stone floor with class armor,
 *    cracked soul circle, and dropped weapon.
 * 2. Revive Beacon: 52px tactical revive perimeter, pulsing distress sonar ping,
 *    and luminous emerald channel arc when revive is in progress.
 * 3. Ethereal Spirit: Ascended translucent ghost soul floating and bobbing overhead
 *    with class-specific spectral tints, flowing wavy wisp tails, piercing eyes,
 *    and rising soul tether embers.
 * 4. Co-op HUD Badge: Clean monospace distress callout with bleedout countdown
 *    and revive progress percentage. Zero emojis.
 */

interface ClassSpectralTheme {
  primary: string;
  secondary: string;
  highlight: string;
  auraRgba: string;
  glowRgba: string;
}

const SPECTRAL_THEMES: Record<string, ClassSpectralTheme> = {
  vanguard: {
    primary: '#D97706',
    secondary: '#B45309',
    highlight: '#FDE68A',
    auraRgba: 'rgba(245, 158, 11, 0.28)',
    glowRgba: 'rgba(251, 191, 36, 0.65)',
  },
  ranger: {
    primary: '#059669',
    secondary: '#047857',
    highlight: '#A7F3D0',
    auraRgba: 'rgba(52, 211, 153, 0.28)',
    glowRgba: 'rgba(110, 231, 183, 0.65)',
  },
  arcanist: {
    primary: '#0284C7',
    secondary: '#0369A1',
    highlight: '#BAE6FD',
    auraRgba: 'rgba(56, 189, 248, 0.32)',
    glowRgba: 'rgba(125, 211, 252, 0.70)',
  },
  cleric: {
    primary: '#CA8A04',
    secondary: '#A16207',
    highlight: '#FEF08A',
    auraRgba: 'rgba(253, 224, 71, 0.32)',
    glowRgba: 'rgba(254, 240, 138, 0.75)',
  },
};

const DEFAULT_SPECTRAL_THEME: ClassSpectralTheme = {
  primary: '#0284C7',
  secondary: '#0369A1',
  highlight: '#BAE6FD',
  auraRgba: 'rgba(56, 189, 248, 0.30)',
  glowRgba: 'rgba(125, 211, 252, 0.65)',
};

export function drawFallenAndGhostPlayer(
  ctx: CanvasRenderingContext2D,
  p: PlayerState,
  hx: number,
  hy: number,
  now: number,
  isSelf: boolean
): void {
  ctx.save();

  const theme = SPECTRAL_THEMES[p.heroClass] || DEFAULT_SPECTRAL_THEME;
  const isBeingRevived = p.reviveProgress > 0;
  const secondsLeft = Math.max(0, Math.ceil(p.downedTimerMs / 1000));
  const isCritical = p.downedTimerMs > 0 && p.downedTimerMs < 5000;

  // =========================================================================
  // 1. REVIVE PERIMETER & TACTICAL BEACON (52px Radius)
  // =========================================================================
  const reviveRadius = 52;

  // Base dotted perimeter
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = isBeingRevived
    ? 'rgba(74, 222, 128, 0.65)'
    : isCritical
    ? 'rgba(239, 68, 68, 0.55)'
    : 'rgba(250, 204, 21, 0.40)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(hx, hy, reviveRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Cardinal alignment notches (N, S, E, W)
  ctx.strokeStyle = isBeingRevived ? '#4ADE80' : isCritical ? '#F87171' : '#FBBF24';
  ctx.lineWidth = 2;
  const notchLen = 4;
  // North
  ctx.beginPath();
  ctx.moveTo(hx, hy - reviveRadius - notchLen);
  ctx.lineTo(hx, hy - reviveRadius + notchLen);
  ctx.stroke();
  // South
  ctx.beginPath();
  ctx.moveTo(hx, hy + reviveRadius - notchLen);
  ctx.lineTo(hx, hy + reviveRadius + notchLen);
  ctx.stroke();
  // West
  ctx.beginPath();
  ctx.moveTo(hx - reviveRadius - notchLen, hy);
  ctx.lineTo(hx - reviveRadius + notchLen, hy);
  ctx.stroke();
  // East
  ctx.beginPath();
  ctx.moveTo(hx + reviveRadius - notchLen, hy);
  ctx.lineTo(hx + reviveRadius + notchLen, hy);
  ctx.stroke();

  // Expanding distress sonar wave (radiates outward every 1.6s)
  if (!isBeingRevived) {
    const pingCycle = ((now + (hx * 23 + hy * 19)) % 1600) / 1600;
    const pingRadius = 10 + pingCycle * (reviveRadius - 10);
    const pingAlpha = (1 - pingCycle) * (isCritical ? 0.6 : 0.35);
    ctx.strokeStyle = isCritical
      ? `rgba(239, 68, 68, ${pingAlpha})`
      : `rgba(245, 158, 11, ${pingAlpha})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(hx, hy, pingRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Active revive progress arc & channel glow
  if (isBeingRevived) {
    // Soft illuminated field
    ctx.fillStyle = 'rgba(34, 197, 94, 0.12)';
    ctx.beginPath();
    ctx.arc(hx, hy, reviveRadius, 0, Math.PI * 2);
    ctx.fill();

    // Luminous progress arc
    ctx.strokeStyle = '#22C55E';
    ctx.lineWidth = 4;
    ctx.beginPath();
    const startAng = -Math.PI / 2;
    const endAng = startAng + Math.PI * 2 * Math.min(1, Math.max(0, p.reviveProgress));
    ctx.arc(hx, hy, reviveRadius, startAng, endAng);
    ctx.stroke();

    // Arc head spark
    const headX = hx + Math.cos(endAng) * reviveRadius;
    const headY = hy + Math.sin(endAng) * reviveRadius;
    ctx.fillStyle = '#DCFCE7';
    ctx.beginPath();
    ctx.arc(headX, headY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Descending revive beam ribbons from above
    const beamPhase = (now * 0.004) % 1;
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
    ctx.lineWidth = 2;
    for (let b = -1; b <= 1; b++) {
      const bx = hx + b * 14;
      const byTop = hy - 45 + (beamPhase * 10);
      ctx.beginPath();
      ctx.moveTo(bx, byTop);
      ctx.lineTo(bx, hy + 2);
      ctx.stroke();
    }
  }

  // =========================================================================
  // 2. CRACKED GROUND & FALLEN PHYSICAL BODY (Floor Plane)
  // =========================================================================
  // Dark shadowy blood/void pool
  ctx.fillStyle = 'rgba(10, 15, 25, 0.70)';
  ctx.beginPath();
  ctx.ellipse(hx, hy + 5, 16, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle cracked soul rune fracture lines
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx - 14, hy + 4);
  ctx.lineTo(hx - 6, hy + 5);
  ctx.lineTo(hx + 2, hy + 7);
  ctx.moveTo(hx + 8, hy + 3);
  ctx.lineTo(hx + 15, hy + 6);
  ctx.moveTo(hx - 4, hy + 8);
  ctx.lineTo(hx + 5, hy + 9);
  ctx.stroke();

  // Slumped Fallen Body (Horizontal pixel sprite)
  // Legs / Greaves
  ctx.fillStyle = '#1E293B';
  ctx.fillRect(hx + 3, hy + 2, 9, 4);
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(hx + 9, hy + 3, 4, 3); // boots

  // Torso & Class Garb
  if (p.heroClass === 'vanguard') {
    // Crumpled crimson cape
    ctx.fillStyle = '#581C1C';
    ctx.fillRect(hx - 8, hy + 3, 11, 4);
    // Heavy steel plate
    ctx.fillStyle = '#475569';
    ctx.fillRect(hx - 6, hy + 1, 9, 5);
    // Darker plate edge
    ctx.fillStyle = '#334155';
    ctx.fillRect(hx - 5, hy + 3, 7, 2);
    // Fallen Greatsword beside body
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy + 8);
    ctx.lineTo(hx + 14, hy + 7);
    ctx.stroke();
    // Brass crossguard
    ctx.fillStyle = '#B45309';
    ctx.fillRect(hx - 2, hy + 7, 2, 3);
  } else if (p.heroClass === 'ranger') {
    // Leather & forest cloak folds
    ctx.fillStyle = '#064E3B';
    ctx.fillRect(hx - 8, hy + 3, 11, 4);
    ctx.fillStyle = '#14532D';
    ctx.fillRect(hx - 6, hy + 1, 9, 5);
    // Fallen recurve bow
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx + 4, hy + 8, 8, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
  } else if (p.heroClass === 'arcanist') {
    // Midnight cosmic robes
    ctx.fillStyle = '#1E1B4B';
    ctx.fillRect(hx - 8, hy + 2, 12, 5);
    ctx.fillStyle = '#312E81';
    ctx.fillRect(hx - 5, hy + 1, 8, 4);
    // Fallen catalyst staff with dim pulsing star crystal
    ctx.strokeStyle = '#5B21B6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 5, hy + 8);
    ctx.lineTo(hx + 13, hy + 7);
    ctx.stroke();
    const crystalPulse = 0.4 + Math.sin(now * 0.005) * 0.3;
    ctx.fillStyle = `rgba(56, 189, 248, ${crystalPulse})`;
    ctx.beginPath();
    ctx.arc(hx + 14, hy + 7, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Cleric: Vestments & prayer stole
    ctx.fillStyle = '#475569';
    ctx.fillRect(hx - 8, hy + 2, 12, 5);
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(hx - 6, hy + 1, 9, 4);
    // Faded gold stole
    ctx.fillStyle = '#D97706';
    ctx.fillRect(hx - 3, hy + 2, 5, 2);
    // Fallen mace
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - 4, hy + 8);
    ctx.lineTo(hx + 12, hy + 8);
    ctx.stroke();
    ctx.fillStyle = '#94A3B8';
    ctx.fillRect(hx + 10, hy + 7, 3, 3);
  }

  // Slumped Head / Cowl on the stones
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(hx - 9, hy + 1, 5, 5);
  ctx.fillStyle = '#334155';
  ctx.fillRect(hx - 8, hy, 4, 3);

  // =========================================================================
  // 3. ETHEREAL FLOATING GHOST / SOUL SPIRIT (Ascended Overhead)
  // =========================================================================
  const floatCycle = now * 0.0032 + (hx * 0.08);
  const floatBob = Math.sin(floatCycle) * 5.0;
  const swayX = Math.cos(floatCycle * 0.7) * 2.2;
  const ghostX = hx + swayX;
  const ghostY = hy - 22 + floatBob;

  // Vertical Soul Tether linking fallen body to hovering spirit
  ctx.save();
  const tetherGradient = ctx.createLinearGradient(hx, hy + 2, ghostX, ghostY + 8);
  tetherGradient.addColorStop(0, 'rgba(15, 23, 42, 0.1)');
  tetherGradient.addColorStop(0.5, theme.auraRgba);
  tetherGradient.addColorStop(1, 'rgba(255, 255, 255, 0.4)');
  ctx.strokeStyle = tetherGradient;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(hx, hy + 2);
  // Gentle bezier curve that sways with the float cycle
  ctx.quadraticCurveTo(hx + swayX * 1.5, hy - 10, ghostX, ghostY + 8);
  ctx.stroke();
  ctx.restore();

  // Rising Soul Spark Particles (4 particles looping from body to ghost)
  for (let i = 0; i < 4; i++) {
    const seed = (p.id.charCodeAt(i % p.id.length) || 1) * 23 + i * 47;
    const sparkCycle = ((now * 0.0009 + seed * 0.05) % 1);
    const sparkY = (hy + 2) - sparkCycle * ((hy + 2) - ghostY);
    const sparkX = hx + Math.sin(now * 0.004 + i * 1.8) * (3.5 + sparkCycle * 4);
    const sparkAlpha = Math.sin(sparkCycle * Math.PI) * 0.75;

    ctx.fillStyle = theme.highlight;
    ctx.globalAlpha = sparkAlpha;
    ctx.beginPath();
    ctx.arc(sparkX, sparkY, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ghost Spirit Glow Aura
  ctx.save();
  const auraRad = 16 + Math.sin(now * 0.005) * 2;
  const auraGrad = ctx.createRadialGradient(ghostX, ghostY - 3, 2, ghostX, ghostY - 3, auraRad);
  auraGrad.addColorStop(0, theme.auraRgba);
  auraGrad.addColorStop(0.7, theme.auraRgba.replace(/[\d\.]+\)$/, '0.12)'));
  auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(ghostX, ghostY - 3, auraRad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Translucent Ethereal Body Form
  ctx.save();
  const spiritAlpha = 0.68 + Math.sin(now * 0.004 + hx) * 0.14;
  ctx.globalAlpha = spiritAlpha;

  // Floating Phantom Hood & Mantle
  ctx.fillStyle = theme.primary;
  // Head / Cowl top
  ctx.beginPath();
  ctx.arc(ghostX, ghostY - 8, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // Upper spectral mantle
  ctx.fillRect(ghostX - 6, ghostY - 5, 12, 6);

  // Flowing / Wavy Ghost Tails (3 tapering ethereal wisps waving downward)
  const tailBaseY = ghostY + 1;
  const wave1 = Math.sin(now * 0.006 + 0.0) * 3.0;
  const wave2 = Math.sin(now * 0.006 + 1.6) * 4.0;
  const wave3 = Math.sin(now * 0.006 + 3.2) * 3.0;

  // Left wisp
  ctx.fillStyle = theme.secondary;
  ctx.beginPath();
  ctx.moveTo(ghostX - 6, tailBaseY);
  ctx.quadraticCurveTo(ghostX - 7 + wave1, tailBaseY + 5, ghostX - 4 + wave1, tailBaseY + 10);
  ctx.lineTo(ghostX - 2, tailBaseY + 4);
  ctx.closePath();
  ctx.fill();

  // Center wisp (longest)
  ctx.fillStyle = theme.primary;
  ctx.beginPath();
  ctx.moveTo(ghostX - 3, tailBaseY);
  ctx.quadraticCurveTo(ghostX + wave2 * 0.8, tailBaseY + 7, ghostX + wave2, tailBaseY + 13);
  ctx.lineTo(ghostX + 3, tailBaseY);
  ctx.closePath();
  ctx.fill();

  // Right wisp
  ctx.fillStyle = theme.secondary;
  ctx.beginPath();
  ctx.moveTo(ghostX + 2, tailBaseY + 4);
  ctx.quadraticCurveTo(ghostX + 7 + wave3, tailBaseY + 5, ghostX + 4 + wave3, tailBaseY + 10);
  ctx.lineTo(ghostX + 6, tailBaseY);
  ctx.closePath();
  ctx.fill();

  // Inner spectral highlight sheen
  ctx.fillStyle = theme.highlight;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(ghostX - 3, ghostY - 6, 6, 4);

  // Piercing Spectral Twin Eyes
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(ghostX - 3, ghostY - 8, 2, 1.5);
  ctx.fillRect(ghostX + 1, ghostY - 8, 2, 1.5);

  // Eye glow highlights
  ctx.fillStyle = theme.highlight;
  ctx.fillRect(ghostX - 3.5, ghostY - 8.5, 1, 1);
  ctx.fillRect(ghostX + 2.5, ghostY - 8.5, 1, 1);

  // Class-Specific Spectral Emblems
  if (p.heroClass === 'arcanist') {
    // 2 Orbiting Celestial Starlight Motes
    const orbAng = now * 0.0045;
    for (let o = 0; o < 2; o++) {
      const a = orbAng + o * Math.PI;
      const ox = ghostX + Math.cos(a) * 9;
      const oy = ghostY - 8 + Math.sin(a) * 4;
      ctx.fillStyle = '#BAE6FD';
      ctx.beginPath();
      ctx.arc(ox, oy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (p.heroClass === 'cleric') {
    // Glowing Sacred Halo
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(ghostX, ghostY - 14, 6.5, 2.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (p.heroClass === 'vanguard') {
    // Spectral Shield Sigil hovering by side
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(ghostX - 9, ghostY - 5);
    ctx.lineTo(ghostX - 6, ghostY - 5);
    ctx.lineTo(ghostX - 6, ghostY - 1);
    ctx.lineTo(ghostX - 7.5, ghostY + 2);
    ctx.lineTo(ghostX - 9, ghostY - 1);
    ctx.closePath();
    ctx.stroke();
  } else if (p.heroClass === 'ranger') {
    // Wind swirl arc around cowl
    const windAng = now * 0.005;
    ctx.strokeStyle = 'rgba(167, 243, 208, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(ghostX, ghostY - 6, 8, windAng, windAng + 1.2);
    ctx.stroke();
  }

  ctx.restore();

  // =========================================================================
  // 4. DISTRESS CALLOUT & REVIVE STATUS HUD (Overhead Text)
  // =========================================================================
  const badgeY = ghostY - 20;

  // Distress Beacon Pip overhead
  const beaconPulse = Math.sin(now * 0.012);
  const beaconColor = isBeingRevived
    ? '#4ADE80'
    : isCritical
    ? (beaconPulse > 0 ? '#EF4444' : '#FCA5A5')
    : '#F59E0B';

  ctx.fillStyle = beaconColor;
  ctx.beginPath();
  // Small diamond beacon marker
  const bSize = isCritical ? 3.5 : 2.5;
  ctx.moveTo(ghostX, badgeY - 12 - bSize);
  ctx.lineTo(ghostX + bSize, badgeY - 12);
  ctx.lineTo(ghostX, badgeY - 12 + bSize);
  ctx.lineTo(ghostX - bSize, badgeY - 12);
  ctx.closePath();
  ctx.fill();

  // Monospace Player Name
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.fillText(p.username, ghostX, badgeY - 1);
  ctx.shadowBlur = 0;

  // Status & Progress Sub-label
  ctx.font = '700 9px "JetBrains Mono", monospace';
  ctx.textBaseline = 'top';

  if (isBeingRevived) {
    const pct = Math.round(p.reviveProgress * 100);
    ctx.fillStyle = '#4ADE80';
    ctx.fillText(`REVIVING ${pct}%`, ghostX, badgeY + 1);
  } else if (p.downedTimerMs > 0) {
    ctx.fillStyle = isCritical ? '#F87171' : '#FDE047';
    ctx.fillText(`FALLEN (${secondsLeft}s)`, ghostX, badgeY + 1);
  } else {
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('SOUL EXPIRED', ghostX, badgeY + 1);
  }

  // Local Player Hint
  if (isSelf) {
    ctx.font = '500 8px "JetBrains Mono", monospace';
    ctx.fillStyle = isBeingRevived ? '#86EFAC' : '#FCA5A5';
    ctx.fillText(
      isBeingRevived ? 'ALLIES RESTORING YOUR LIFE' : 'AWAITING RESCUE IN RANGE',
      ghostX,
      badgeY + 12
    );
  }

  ctx.restore();
}
