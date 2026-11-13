import type { BiomeId, NpcState, PropState, TrainingDummyState } from '../shared/types.ts';

const OBFUSCATED_GLYPHS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '#', '$', '%', '&', '?'
];

export function getMinecraftObfuscatedString(length: number = 14, nowMs: number = Date.now()): string {
  const tick = Math.floor(nowMs / 50); // Scramble every 50ms (~20 FPS)
  let result = '';
  for (let i = 0; i < length; i++) {
    const seed = Math.abs(Math.sin(tick * 997 + i * 1337) * 10000);
    const index = Math.floor(seed) % OBFUSCATED_GLYPHS.length;
    result += OBFUSCATED_GLYPHS[index];
  }
  return result;
}

/**
 * Draws the Descent Portal in either Sealed (Guardian alive) or Transcendent Active (Guardian defeated) state.
 */
export function drawDungeonPortal(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  bossDefeated: boolean,
  now: number,
  biome: BiomeId,
  floor = 1,
  sealText?: string
): void {
  const roundPx = Math.round(px);
  const roundPy = Math.round(py);

  if (bossDefeated) {
    // ==============================================================
    // UNLOCKED: Transcendent Cosmic Rift
    // ==============================================================
    const pulse = Math.sin(now * 0.005) * 3;
    const coreRadius = 24 + pulse;

    // 1. Radiant ground accretion aura
    const auraGrad = ctx.createRadialGradient(roundPx, roundPy, 6, roundPx, roundPy, coreRadius + 22);
    auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    auraGrad.addColorStop(0.5, 'rgba(129, 140, 248, 0.28)');
    auraGrad.addColorStop(0.85, 'rgba(192, 132, 252, 0.12)');
    auraGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(roundPx, roundPy, coreRadius + 22, 0, Math.PI * 2);
    ctx.fill();

    // 2. Heavy Carved Stone Dais Flagstones
    ctx.fillStyle = '#1E1E2A';
    ctx.beginPath();
    ctx.arc(roundPx, roundPy, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38384E';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Flagstone tile seams (octagonal carved dais)
    ctx.strokeStyle = '#272738';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(roundPx + Math.cos(a) * 16, roundPy + Math.sin(a) * 16);
      ctx.lineTo(roundPx + Math.cos(a) * 32, roundPy + Math.sin(a) * 32);
      ctx.stroke();
    }

    // 3. Concentric Rotating Astral Rune Rings
    // Outer Ring (Clockwise)
    const rotOuter = now * 0.0012;
    ctx.save();
    ctx.translate(roundPx, roundPy);
    ctx.rotate(rotOuter);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    // 6 Outer runic glyph markers
    for (let r = 0; r < 6; r++) {
      const ra = (r * Math.PI) / 3;
      const rx = Math.cos(ra) * 26;
      const ry = Math.sin(ra) * 26;
      ctx.fillStyle = '#BAE6FD';
      ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(rx - 0.5, ry - 0.5, 1, 1);
    }
    ctx.restore();

    // Inner Ring (Counter-Clockwise)
    const rotInner = -now * 0.0018;
    ctx.save();
    ctx.translate(roundPx, roundPy);
    ctx.rotate(rotInner);
    ctx.strokeStyle = '#A855F7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    for (let r = 0; r < 4; r++) {
      const ra = (r * Math.PI) / 2;
      const rx = Math.cos(ra) * 18;
      const ry = Math.sin(ra) * 18;
      ctx.fillStyle = '#E9D5FF';
      ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
    }
    ctx.restore();

    // 4. Churning Dimensional Event Horizon Core
    const vortexGrad = ctx.createRadialGradient(roundPx, roundPy, 2, roundPx, roundPy, 14);
    vortexGrad.addColorStop(0, '#FFFFFF');
    vortexGrad.addColorStop(0.3, '#7DD3FC');
    vortexGrad.addColorStop(0.7, '#6366F1');
    vortexGrad.addColorStop(1, '#1E1B4B');
    ctx.fillStyle = vortexGrad;
    ctx.beginPath();
    ctx.arc(roundPx, roundPy, 14, 0, Math.PI * 2);
    ctx.fill();

    // Inward-falling starlight spiral arms
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 1.2;
    for (let s = 0; s < 3; s++) {
      const sa = -now * 0.004 + (s * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(roundPx, roundPy, 11, sa, sa + 1.2);
      ctx.stroke();
    }

    // 5. 4 Floating Resonance Monolith Keystones at cardinal points
    const monoliths = [
      { x: roundPx, y: roundPy - 36 },
      { x: roundPx + 36, y: roundPy },
      { x: roundPx, y: roundPy + 36 },
      { x: roundPx - 36, y: roundPy },
    ];
    monoliths.forEach((m, idx) => {
      const mBob = Math.sin(now * 0.004 + idx * 1.5) * 2;
      const my = m.y + mBob;
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(m.x - 4, m.y + 6, 8, 3);
      // Floating Obsidian Pylon
      ctx.fillStyle = '#1E1B4B';
      ctx.fillRect(m.x - 4, my - 8, 8, 14);
      ctx.fillStyle = '#312E81';
      ctx.fillRect(m.x - 3, my - 7, 6, 12);
      // Glowing Azure Rune Cavity
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(m.x - 1, my - 5, 2, 8);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(m.x - 0.5, my - 3, 1, 4);
    });

    // 6. Interactive Prompt Badge
    const bob = Math.sin(now * 0.006) * 2;
    const badgeY = roundPy - 44 + bob;
    ctx.save();
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const label = floor === 0 ? '[E] EXPEDITION GATE' : '[E] ENTER THE DEEP';
    const tw = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(roundPx - tw / 2 - 8, badgeY - 11, tw + 16, 18);
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(roundPx - tw / 2 - 8, badgeY - 11, tw + 16, 18);

    // Corner gold accents
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(roundPx - tw / 2 - 9, badgeY - 12, 3, 3);
    ctx.fillRect(roundPx + tw / 2 + 6, badgeY - 12, 3, 3);
    ctx.fillRect(roundPx - tw / 2 - 9, badgeY + 6, 3, 3);
    ctx.fillRect(roundPx + tw / 2 + 6, badgeY + 6, 3, 3);

    ctx.fillStyle = '#E0F2FE';
    ctx.fillText(label, roundPx, badgeY + 2);
    ctx.restore();

  } else {
    // ==============================================================
    // LOCKED: Dormant Ancient Stone Dais with Arcane Containment
    // ==============================================================
    // 1. Concentric Weathered Granite Flagstones
    ctx.fillStyle = '#181822';
    ctx.beginPath();
    ctx.arc(roundPx, roundPy, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2E3040';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inscribed dormant rune circle
    ctx.strokeStyle = '#3A3C50';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(roundPx, roundPy, 18, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Dormant Abyssal Core
    ctx.fillStyle = '#0F1017';
    ctx.beginPath();
    ctx.arc(roundPx, roundPy, 10, 0, Math.PI * 2);
    ctx.fill();

    // 3. 4 Bound Ward Pillars with Containment Chains
    const pillars = [
      { x: roundPx, y: roundPy - 26 },
      { x: roundPx + 26, y: roundPy },
      { x: roundPx, y: roundPy + 26 },
      { x: roundPx - 26, y: roundPy },
    ];
    // Arcane containment chain lines
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pillars[0].x, pillars[0].y);
    ctx.lineTo(pillars[1].x, pillars[1].y);
    ctx.lineTo(pillars[2].x, pillars[2].y);
    ctx.lineTo(pillars[3].x, pillars[3].y);
    ctx.closePath();
    ctx.stroke();

    // Heavy Stone Boundary Pylons
    pillars.forEach((p) => {
      ctx.fillStyle = '#2A2C3C';
      ctx.fillRect(p.x - 3, p.y - 6, 6, 12);
      ctx.fillStyle = '#3E4256';
      ctx.fillRect(p.x - 2, p.y - 5, 4, 10);
      // Red lock glyph
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(p.x - 1, p.y - 2, 2, 4);
    });

    // 4. Locked Indicator Label
    ctx.save();
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const label = sealText || 'SEALED · GUARDIAN AWAKE';
    const isGuardianSeal = label.includes('GUARDIANS');
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(15, 15, 22, 0.85)';
    ctx.fillRect(roundPx - tw / 2 - 5, roundPy - 36, tw + 10, 14);
    ctx.strokeStyle = isGuardianSeal ? '#F59E0B' : '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(roundPx - tw / 2 - 5, roundPy - 36, tw + 10, 14);
    ctx.fillStyle = isGuardianSeal ? '#FDE68A' : '#94A3B8';
    ctx.fillText(label, roundPx, roundPy - 26);
    ctx.restore();
  }
}

/**
 * Draws the Relic Vault (Unopened: Gilded dwarven chest with glowing relic keyhole & runic aura. Opened: Velvet interior).
 */
export function drawRelicVault(
  ctx: CanvasRenderingContext2D,
  prop: PropState,
  now: number
): void {
  const x = Math.round(prop.x);
  const y = Math.round(prop.y);

  if (!prop.opened) {
    // ==============================================================
    // UNOPENED RELIC VAULT
    // ==============================================================
    // 1. Shadow & Stone Plinth
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 16, y + 8, 32, 6);

    // Carved stone pedestal
    ctx.fillStyle = '#262235';
    ctx.fillRect(x - 17, y + 6, 34, 4);
    ctx.fillStyle = '#38324C';
    ctx.fillRect(x - 15, y + 4, 30, 3);

    // 2. Heavy Obsidian & Arcane Vault Body
    ctx.fillStyle = '#1D192B';
    ctx.fillRect(x - 15, y - 10, 30, 16);
    ctx.fillStyle = '#2B2340';
    ctx.fillRect(x - 13, y - 8, 26, 12);

    // Reinforced Iron Corner Straps
    ctx.fillStyle = '#4C3B6B';
    ctx.fillRect(x - 15, y - 10, 4, 16);
    ctx.fillRect(x + 11, y - 10, 4, 16);

    // Rivet studs
    ctx.fillStyle = '#C084FC';
    ctx.fillRect(x - 14, y - 8, 2, 2);
    ctx.fillRect(x - 14, y + 2, 2, 2);
    ctx.fillRect(x + 12, y - 8, 2, 2);
    ctx.fillRect(x + 12, y + 2, 2, 2);

    // 3. Gilded Gold Filigree Center Trim & Banding
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x - 15, y - 2, 30, 4);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x - 14, y - 1, 28, 2);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(x - 3, y - 2, 6, 4);

    // 4. Arcane Pulsating Relic Core (Keyhole)
    const corePulse = Math.sin(now * 0.007) * 2;
    const coreGrad = ctx.createRadialGradient(x, y - 1, 1, x, y - 1, 6 + corePulse);
    coreGrad.addColorStop(0, '#FFFFFF');
    coreGrad.addColorStop(0.4, '#FDE047');
    coreGrad.addColorStop(0.7, '#A855F7');
    coreGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y - 1, 6 + corePulse, 0, Math.PI * 2);
    ctx.fill();

    // Keyhole slot
    ctx.fillStyle = '#0F0E17';
    ctx.fillRect(x - 1, y - 3, 2, 4);
    ctx.fillRect(x - 2, y - 4, 4, 2);

    // 5. Heavy Beveled Vault Lid with Gold Arch Trim
    ctx.fillStyle = '#3B2D55';
    ctx.fillRect(x - 16, y - 16, 32, 7);
    ctx.fillStyle = '#4F3C70';
    ctx.fillRect(x - 14, y - 15, 28, 5);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x - 16, y - 16, 32, 2);
    ctx.fillRect(x - 5, y - 16, 10, 4); // Top crest
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(x - 2, y - 15, 4, 2);

    // 6. Floating Ancient Runic Seal above Lid
    const sealBob = Math.sin(now * 0.005) * 3;
    const sy = y - 24 + sealBob;
    ctx.save();
    ctx.translate(x, sy);
    ctx.rotate(now * 0.002);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-5, -5, 10, 10);
    ctx.rotate(Math.PI / 4);
    ctx.strokeStyle = '#C084FC';
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();

    // 7. Interactive Prompt Badge
    ctx.save();
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const label = '[E] RELIC VAULT';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(23, 19, 36, 0.9)';
    ctx.fillRect(x - tw / 2 - 6, y - 38 + sealBob, tw + 12, 16);
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - tw / 2 - 6, y - 38 + sealBob, tw + 12, 16);
    ctx.fillStyle = '#FEF08A';
    ctx.fillText(label, x, y - 26 + sealBob);
    ctx.restore();

  } else {
    // ==============================================================
    // OPENED RELIC VAULT (Lid tilted open, royal velvet interior)
    // ==============================================================
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 16, y + 8, 32, 6);

    // Stone plinth
    ctx.fillStyle = '#262235';
    ctx.fillRect(x - 17, y + 6, 34, 4);

    // Tilted Open Lid (draped backwards)
    ctx.fillStyle = '#261E34';
    ctx.fillRect(x - 16, y - 22, 32, 8);
    ctx.fillStyle = '#3B2D55';
    ctx.fillRect(x - 14, y - 21, 28, 6);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x - 16, y - 22, 32, 2);

    // Open Interior Cavity (Plush Royal Velvet)
    ctx.fillStyle = '#581C87';
    ctx.fillRect(x - 14, y - 14, 28, 8);
    ctx.fillStyle = '#3B0764';
    ctx.fillRect(x - 12, y - 12, 24, 5);

    // Chest Front Wall
    ctx.fillStyle = '#1D192B';
    ctx.fillRect(x - 15, y - 6, 30, 12);
    ctx.fillStyle = '#2B2340';
    ctx.fillRect(x - 13, y - 4, 26, 8);

    // Broken open padlock hanging
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x - 3, y - 7, 6, 5);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x - 2, y - 6, 4, 3);
  }
}

/**
 * Draws the Mystic Shrine (Active: Levitating Sacred Crystal, blessing god-rays & altar. Used: Peaceful cooled stone).
 */
export function drawMysticShrine(
  ctx: CanvasRenderingContext2D,
  prop: PropState,
  now: number
): void {
  const x = Math.round(prop.x);
  const y = Math.round(prop.y);

  if (!prop.opened) {
    // ==============================================================
    // ACTIVE MYSTIC SHRINE
    // ==============================================================
    // 1. Soft blessing god-rays / vertical aura
    const rayGrad = ctx.createLinearGradient(x, y + 8, x, y - 46);
    rayGrad.addColorStop(0, 'rgba(52, 211, 153, 0.22)');
    rayGrad.addColorStop(0.6, 'rgba(110, 231, 183, 0.1)');
    rayGrad.addColorStop(1, 'rgba(167, 243, 208, 0)');
    ctx.fillStyle = rayGrad;
    ctx.fillRect(x - 16, y - 46, 32, 54);

    // 2. Stepped Temple Altar Plinth
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 18, y + 6, 36, 6);

    ctx.fillStyle = '#1F2937';
    ctx.fillRect(x - 18, y + 4, 36, 4);
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 16, y + 1, 32, 4);

    // Central Altar Block with Sacred Basin
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(x - 14, y - 10, 28, 12);
    ctx.fillStyle = '#6B7280';
    ctx.fillRect(x - 12, y - 8, 24, 8);

    // Fluted Column Pillars on left & right
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 15, y - 16, 5, 18);
    ctx.fillRect(x + 10, y - 16, 5, 18);
    ctx.fillStyle = '#9CA3AF';
    ctx.fillRect(x - 14, y - 15, 3, 16);
    ctx.fillRect(x + 11, y - 15, 3, 16);
    // Pillar capitals
    ctx.fillStyle = '#E5E7EB';
    ctx.fillRect(x - 16, y - 18, 7, 3);
    ctx.fillRect(x + 9, y - 18, 7, 3);

    // Sacred Inscribed Basin rim
    ctx.fillStyle = '#10B981';
    ctx.fillRect(x - 8, y - 10, 16, 2);
    ctx.fillStyle = '#34D399';
    ctx.fillRect(x - 6, y - 9, 12, 1);

    // 3. Levitating Celestial Blessing Crystal / Sacred Relic
    const crystalBob = Math.sin(now * 0.005) * 4;
    const cy = y - 24 + crystalBob;

    // Glowing holy aura around crystal
    const crystalAura = ctx.createRadialGradient(x, cy, 1, x, cy, 12);
    crystalAura.addColorStop(0, '#FFFFFF');
    crystalAura.addColorStop(0.35, '#6EE7B7');
    crystalAura.addColorStop(0.7, '#10B981');
    crystalAura.addColorStop(1, 'rgba(16, 185, 129, 0)');
    ctx.fillStyle = crystalAura;
    ctx.beginPath();
    ctx.arc(x, cy, 12, 0, Math.PI * 2);
    ctx.fill();

    // Geometric Diamond Crystal Facets
    ctx.save();
    ctx.translate(x, cy);
    const cSpin = Math.sin(now * 0.003) * 0.25;
    ctx.rotate(cSpin);
    // Top pyramid
    ctx.fillStyle = '#A7F3D0';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, -2);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    // Shaded side
    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, -2);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fill();
    // Bottom inverted pyramid
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(6, -2);
    ctx.lineTo(-6, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#047857';
    ctx.beginPath();
    ctx.moveTo(0, 9);
    ctx.lineTo(6, -2);
    ctx.lineTo(0, -2);
    ctx.closePath();
    ctx.fill();
    // Specular sparkle center
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-1, -3, 2, 2);
    ctx.restore();

    // 4. Rotating Sacred Glyph Ring around Crystal
    ctx.save();
    ctx.translate(x, cy);
    ctx.rotate(-now * 0.002);
    ctx.strokeStyle = '#6EE7B7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 2 small orbiting holy motes
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(13, -1, 2, 2);
    ctx.fillRect(-15, -1, 2, 2);
    ctx.restore();

    // 5. Interactive Prompt Badge
    ctx.save();
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const label = '[E] COMMUNE WITH SHRINE';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(6, 44, 33, 0.9)';
    ctx.fillRect(x - tw / 2 - 6, y - 44 + crystalBob, tw + 12, 16);
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x - tw / 2 - 6, y - 44 + crystalBob, tw + 12, 16);
    ctx.fillStyle = '#A7F3D0';
    ctx.fillText(label, x, y - 32 + crystalBob);
    ctx.restore();

  } else {
    // ==============================================================
    // USED / DEPLETED MYSTIC SHRINE
    // ==============================================================
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 18, y + 6, 36, 6);

    ctx.fillStyle = '#1F2937';
    ctx.fillRect(x - 18, y + 4, 36, 4);
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 16, y + 1, 32, 4);

    ctx.fillStyle = '#4B5563';
    ctx.fillRect(x - 14, y - 10, 28, 12);
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 12, y - 8, 24, 8);

    // Pillars
    ctx.fillStyle = '#374151';
    ctx.fillRect(x - 15, y - 16, 5, 18);
    ctx.fillRect(x + 10, y - 16, 5, 18);
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(x - 14, y - 15, 3, 16);
    ctx.fillRect(x + 11, y - 15, 3, 16);

    // Extinguished chalice / stone basin
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(x - 6, y - 14, 12, 4);
    ctx.fillStyle = '#111827';
    ctx.fillRect(x - 4, y - 13, 8, 2);

    // Soft rising incense smoke
    for (let s = 0; s < 2; s++) {
      const st = (now * 0.0012 + s * 0.5) % 1;
      const sx = x + Math.sin(now * 0.003 + s) * 4;
      const sy = y - 15 - st * 18;
      ctx.fillStyle = `rgba(156, 163, 175, ${0.4 * (1 - st)})`;
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    }
  }
}

/**
 * Draws polished Treasure Chests, Crates, Rotating Coins, and Restorative Potions.
 */
export function drawDungeonProp(
  ctx: CanvasRenderingContext2D,
  prop: PropState,
  now: number
): void {
  const x = Math.round(prop.x);
  const y = Math.round(prop.y);

  if (prop.kind === 'warden_gate') {
    drawWardenGateProp(ctx, x, y, now);
    return;
  }

  if (prop.kind === 'crate') {
    // Weathered pine storage crate with iron nails & cross-braces
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(x - 11, y + 8, 22, 4);

    // Dark wood background
    ctx.fillStyle = '#5A3825';
    ctx.fillRect(x - 11, y - 11, 22, 20);

    // Horizontal planks
    ctx.fillStyle = '#825237';
    ctx.fillRect(x - 10, y - 10, 20, 5);
    ctx.fillRect(x - 10, y - 3, 20, 5);
    ctx.fillRect(x - 10, y + 4, 20, 4);

    // Corner iron braces
    ctx.fillStyle = '#4A4E69';
    ctx.fillRect(x - 11, y - 11, 4, 4);
    ctx.fillRect(x + 7, y - 11, 4, 4);
    ctx.fillRect(x - 11, y + 5, 4, 4);
    ctx.fillRect(x + 7, y + 5, 4, 4);

    // Diagonal support beam
    ctx.fillStyle = '#6E452E';
    for (let d = 0; d < 8; d++) {
      ctx.fillRect(x - 8 + d * 2, y - 8 + d * 2, 2, 3);
    }

    // Iron rivets
    ctx.fillStyle = '#C9ADA7';
    ctx.fillRect(x - 10, y - 10, 1, 1);
    ctx.fillRect(x + 9, y - 10, 1, 1);
    ctx.fillRect(x - 10, y + 7, 1, 1);
    ctx.fillRect(x + 9, y + 7, 1, 1);

  } else if (prop.kind === 'chest') {
    // Ironwood treasure chest with brass bands and padlock
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x - 13, y + 7, 26, 5);

    if (!prop.opened) {
      // Body
      ctx.fillStyle = '#4A2810';
      ctx.fillRect(x - 13, y - 8, 26, 16);
      ctx.fillStyle = '#7C4A21';
      ctx.fillRect(x - 11, y - 6, 22, 12);

      // Curved Lid
      ctx.fillStyle = '#9C6230';
      ctx.fillRect(x - 13, y - 13, 26, 6);
      ctx.fillStyle = '#B87840';
      ctx.fillRect(x - 11, y - 12, 22, 3);

      // Brass Corner Straps & Banding
      ctx.fillStyle = '#D97706';
      ctx.fillRect(x - 13, y - 13, 4, 21);
      ctx.fillRect(x + 9, y - 13, 4, 21);
      ctx.fillRect(x - 13, y - 3, 26, 3);

      // Brass Lockplate & Keyhole
      ctx.fillStyle = prop.locked ? '#DC2626' : '#F59E0B';
      ctx.fillRect(x - 3, y - 4, 6, 6);
      ctx.fillStyle = prop.locked ? '#FCA5A5' : '#FEF08A';
      ctx.fillRect(x - 2, y - 3, 4, 3);
      ctx.fillStyle = '#18181B';
      ctx.fillRect(x - 1, y - 2, 2, 3);

      if (prop.locked) {
        // Arcane ward chains and LOCKED tag until room enemies fall
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.72)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 13);
        ctx.lineTo(x + 14, y + 8);
        ctx.moveTo(x + 14, y - 13);
        ctx.lineTo(x - 14, y + 8);
        ctx.stroke();

        ctx.save();
        ctx.font = '700 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(20, 10, 14, 0.88)';
        ctx.fillRect(x - 20, y - 26, 40, 11);
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 20, y - 26, 40, 11);
        ctx.fillStyle = '#FCA5A5';
        ctx.fillText('LOCKED', x, y - 18);
        ctx.restore();
      }

    } else {
      // Opened Chest
      ctx.fillStyle = '#3A1E0B';
      ctx.fillRect(x - 13, y - 18, 26, 7); // Open lid
      ctx.fillStyle = '#5A3215';
      ctx.fillRect(x - 11, y - 17, 22, 5);

      // Open cavity with shimmering gold dust
      ctx.fillStyle = '#1F1208';
      ctx.fillRect(x - 11, y - 11, 22, 6);
      ctx.fillStyle = '#FEF08A';
      ctx.fillRect(x - 5, y - 8, 3, 2);
      ctx.fillRect(x + 2, y - 9, 2, 2);

      // Front body
      ctx.fillStyle = '#4A2810';
      ctx.fillRect(x - 13, y - 5, 26, 13);
      ctx.fillStyle = '#7C4A21';
      ctx.fillRect(x - 11, y - 3, 22, 9);
      ctx.fillStyle = '#D97706';
      ctx.fillRect(x - 13, y - 5, 4, 13);
      ctx.fillRect(x + 9, y - 5, 4, 13);
    }

  } else if (prop.kind === 'coin') {
    // Minted gold coin with 3D spin effect & sparkle
    const bob = Math.sin(now * 0.007 + x) * 2;
    const cy = y + bob;
    const spinPhase = Math.cos(now * 0.006 + x);
    const coinW = Math.max(2, Math.abs(spinPhase) * 10);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 5, y + 6, 10, 3);

    // Outer coin rim
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x - coinW / 2, cy - 5, coinW, 10);
    // Gold face
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x - (coinW - 2) / 2, cy - 4, Math.max(1, coinW - 2), 8);
    // Specular gleam
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(x - (coinW - 4) / 2, cy - 3, Math.max(1, coinW - 4), 3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 1, cy - 2, 1, 1);

  } else if (prop.kind === 'potion') {
    // Alchemical crystal health flask with bubbling red elixir
    const bob = Math.sin(now * 0.006 + y) * 2;
    const py = y + bob;

    // Ambient healing glow
    ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.beginPath();
    ctx.arc(x, py, 10, 0, Math.PI * 2);
    ctx.fill();

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - 6, y + 7, 12, 3);

    // Cork Stopper & Brass Neck
    ctx.fillStyle = '#78350F';
    ctx.fillRect(x - 2, py - 10, 4, 3);
    ctx.fillStyle = '#D97706';
    ctx.fillRect(x - 4, py - 7, 8, 2);

    // Glass Flask Body
    ctx.fillStyle = '#991B1B';
    ctx.fillRect(x - 7, py - 5, 14, 12);
    // Glowing Restorative Liquid
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(x - 6, py - 3, 12, 9);
    ctx.fillStyle = '#F87171';
    ctx.fillRect(x - 5, py - 2, 10, 4);

    // Effervescence bubbles rising
    const b1 = Math.sin(now * 0.015) * 2;
    const b2 = Math.cos(now * 0.018) * 2;
    ctx.fillStyle = '#FECACA';
    ctx.fillRect(x - 3 + b1, py + 2, 2, 2);
    ctx.fillRect(x + 2 + b2, py, 1.5, 1.5);

    // Glass Specular Highlight (Reflection)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 5, py - 4, 2, 7);
    ctx.fillRect(x - 5, py + 4, 1, 1);
  }
}

export { drawNpc } from './npcSprites.ts';

export function drawTrainingDummy(
  ctx: CanvasRenderingContext2D,
  dummy: TrainingDummyState,
  now: number,
  isLocked = false
): void {
  const x = Math.round(dummy.x);
  const y = Math.round(dummy.y);
  const isHit = (dummy.hitAnimMs ?? 0) > 0;
  const hitIntensity = isHit ? Math.min(1, dummy.hitAnimMs / 280) : 0;
  const hitShake = isHit ? Math.sin(now * 0.08) * 3.5 * hitIntensity : 0;
  const hitRecoilTilt = isHit ? Math.sin(now * 0.06) * 0.14 * hitIntensity : 0;

  // Subtle straw rope squeak & idle creak
  const idleCreak = !isHit ? Math.sin(now * 0.003 + x) * 0.8 : 0;
  const dummyTilt = !isHit ? Math.sin(now * 0.0025 + x) * 0.015 : hitRecoilTilt;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(x - 10, y + 12, 20, 5);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dummyTilt);

  // Wooden Post & Crossbar Base
  ctx.fillStyle = '#451A03';
  ctx.fillRect(-3, -4, 6, 16);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-14 + hitShake * 0.3, -16 + idleCreak, 28, 4); // Crossbar arms

  // Burlap Body / Torso (with hit flash brightness)
  const outerBurlap = isHit && hitIntensity > 0.4 ? '#CA8A04' : '#A16207';
  const innerBurlap = isHit && hitIntensity > 0.4 ? '#FEF08A' : '#CA8A04';
  ctx.fillStyle = outerBurlap;
  ctx.fillRect(-12 + hitShake, -22 + idleCreak, 24, 20);
  ctx.fillStyle = innerBurlap;
  ctx.fillRect(-10 + hitShake, -20 + idleCreak, 20, 16);

  // Stitched Cross on Dummy
  ctx.fillStyle = '#78350F';
  ctx.fillRect(-2 + hitShake, -16 + idleCreak, 4, 10);
  ctx.fillRect(-6 + hitShake, -12 + idleCreak, 12, 4);

  // Head Sacks with straw stuffing
  ctx.fillStyle = innerBurlap;
  ctx.fillRect(-8 + hitShake, -30 + idleCreak, 16, 10);
  ctx.fillStyle = '#854D0E';
  ctx.fillRect(-7 + hitShake, -29 + idleCreak, 14, 2);

  // Straw poking from top knot & arms
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(-4 + hitShake, -33 + idleCreak, 2, 3);
  ctx.fillRect(1 + hitShake, -34 + idleCreak, 2, 4);
  ctx.fillRect(-16 + hitShake * 0.3, -17 + idleCreak, 3, 2);
  ctx.fillRect(13 + hitShake * 0.3, -17 + idleCreak, 3, 2);

  // Impact straw flecks when struck
  if (isHit && hitIntensity > 0.2) {
    ctx.fillStyle = '#FDE047';
    ctx.fillRect(-15 + hitShake, -20, 2, 2);
    ctx.fillRect(13 - hitShake, -25, 2, 2);
    ctx.fillRect(-2 + hitShake * 1.5, -34, 1.5, 2.5);
  }

  // Target Lock Reticle
  if (isLocked) {
    ctx.strokeStyle = '#F43F5E';
    ctx.lineWidth = 1.5;
    const r = 20;
    const len = 5;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(-r, -14 - r + len);
    ctx.lineTo(-r, -14 - r);
    ctx.lineTo(-r + len, -14 - r);
    // Top-right
    ctx.moveTo(r - len, -14 - r);
    ctx.lineTo(r, -14 - r);
    ctx.lineTo(r, -14 - r + len);
    // Bottom-left
    ctx.moveTo(-r, -14 + r - len);
    ctx.lineTo(-r, -14 + r);
    ctx.lineTo(-r + len, -14 + r);
    // Bottom-right
    ctx.moveTo(r - len, -14 + r);
    ctx.lineTo(r, -14 + r);
    ctx.lineTo(r, -14 + r - len);
    ctx.stroke();
  }

  ctx.restore();

  // Distinctive Title & Practice Stats Readout
  ctx.font = '700 10px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = isHit ? '#FCD34D' : '#FDE68A';
  ctx.textAlign = 'center';
  ctx.fillText(' Training Dummy', x, y - 36);

  ctx.font = '600 8.5px "JetBrains Mono", monospace';
  if (dummy.totalDamageTaken && dummy.totalDamageTaken > 0) {
    ctx.fillStyle = '#FBBF24';
    ctx.fillText(`${dummy.totalDamageTaken.toLocaleString()} DMG`, x, y - 46);
    ctx.fillStyle = '#38BDF8';
    ctx.fillText('[E] Reset DMG', x, y - 24);
  } else {
    ctx.fillStyle = '#94A3B8';
    ctx.fillText('[Attack to Practice]', x, y - 46);
  }
}

export function drawTavernDecorations(
  ctx: CanvasRenderingContext2D,
  now: number
): void {
  const TILE = 32;

  // 1. Grand Roaring Hearth & Stone Fireplace (North Wall, x: 20..26, y: 3.5)
  const hx = 23 * TILE;
  const hy = 4 * TILE;

  // Hearth Stone Arch Structure
  ctx.fillStyle = '#373539';
  ctx.fillRect(hx - 80, hy - 24, 160, 48);
  ctx.fillStyle = '#4A4648';
  ctx.fillRect(hx - 74, hy - 20, 148, 40);
  ctx.fillStyle = '#232124';
  ctx.fillRect(hx - 50, hy - 8, 100, 32);

  // Animated Roaring Pixel Fire & Embers
  const flicker = Math.sin(now * 0.012) * 4;
  const flicker2 = Math.cos(now * 0.016) * 3;

  // Burning Oak Logs
  ctx.fillStyle = '#5C3A21';
  ctx.fillRect(hx - 36, hy + 16, 72, 8);
  ctx.fillRect(hx - 24, hy + 12, 48, 6);

  // Core Fireplace Flames
  ctx.fillStyle = '#DC2626';
  ctx.beginPath();
  ctx.arc(hx + flicker, hy + 12, 28, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#EA580C';
  ctx.beginPath();
  ctx.arc(hx + flicker2, hy + 10, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(hx - flicker * 0.5, hy + 6, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.arc(hx, hy + 2, 9, 0, Math.PI * 2);
  ctx.fill();

  // Floating embers rising
  const ember1 = (now * 0.04) % 36;
  const ember2 = (now * 0.05 + 18) % 36;
  ctx.fillStyle = '#FBBF24';
  ctx.fillRect(hx - 14 + flicker, hy + 10 - ember1, 2, 2);
  ctx.fillRect(hx + 18 - flicker2, hy + 10 - ember2, 2.5, 2.5);

  // Iron Kettle hanging over fire
  ctx.fillStyle = '#111827';
  ctx.fillRect(hx - 1, hy - 16, 2, 18); // Chain
  ctx.fillRect(hx - 12, hy + 2, 24, 14); // Kettle
  ctx.fillStyle = '#374151';
  ctx.fillRect(hx - 10, hy + 4, 20, 10);

  // Warm Fireplace Light Radial Gradient Aura
  const fireGlow = ctx.createRadialGradient(hx, hy + 10, 10, hx, hy + 10, 240);
  fireGlow.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
  fireGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.18)');
  fireGlow.addColorStop(0.8, 'rgba(217, 119, 6, 0.06)');
  fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fireGlow;
  ctx.beginPath();
  ctx.arc(hx, hy + 10, 240, 0, Math.PI * 2);
  ctx.fill();

  // 2. Stacked Ale Barrels / Casks Behind Bar (x: 14..20, y: 5)
  for (let bx = 14; bx <= 20; bx += 2) {
    const startX = bx * TILE;
    const startY = 5 * TILE;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(startX - 12, startY + 12, 24, 4);

    // Oak Barrel Body
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.arc(startX, startY, 14, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#92400E';
    ctx.beginPath();
    ctx.arc(startX, startY, 11, 0, Math.PI * 2);
    ctx.fill();

    // Metal Hoops
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Brass Tap Spigot
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(startX - 2, startY + 4, 4, 6);
  }

  // 3. Bar Counter Accessories (x: 11..22, y: 8)
  const barY = 8 * TILE;
  for (let bx = 12; bx <= 21; bx += 3) {
    const mugX = bx * TILE;

    // Brass Mug with Foamy Ale
    ctx.fillStyle = '#D97706';
    ctx.fillRect(mugX - 4, barY - 6, 8, 10);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(mugX - 5, barY - 9, 10, 4); // Foam head
    ctx.fillStyle = '#92400E';
    ctx.fillRect(mugX + 4, barY - 4, 3, 6); // Handle
  }

  // 4. Tavern Seating Tables & Stools
  const tables = [
    { x: 11 * TILE, y: 18 * TILE },
    { x: 11 * TILE, y: 25 * TILE },
    { x: 27 * TILE, y: 25 * TILE },
    { x: 20 * TILE, y: 26 * TILE },
  ];

  for (const tbl of tables) {
    // Table Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(tbl.x, tbl.y + 8, 22, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stools Around Table
    const stoolOffsets = [
      { x: -24, y: 0 },
      { x: 24, y: 0 },
      { x: 0, y: -20 },
      { x: 0, y: 20 },
    ];
    for (const st of stoolOffsets) {
      ctx.fillStyle = '#451A03';
      ctx.fillRect(tbl.x + st.x - 6, tbl.y + st.y - 6, 12, 12);
      ctx.fillStyle = '#78350F';
      ctx.fillRect(tbl.x + st.x - 5, tbl.y + st.y - 5, 10, 10);
    }

    // Polished Oak Table Top
    ctx.fillStyle = '#451A03';
    ctx.fillRect(tbl.x - 20, tbl.y - 12, 40, 24);
    ctx.fillStyle = '#6E4729';
    ctx.fillRect(tbl.x - 18, tbl.y - 10, 36, 20);
    ctx.fillStyle = '#855634';
    ctx.fillRect(tbl.x - 16, tbl.y - 8, 32, 16);

    // Candle Stand on Table
    ctx.fillStyle = '#D97706';
    ctx.fillRect(tbl.x - 3, tbl.y - 6, 6, 4);
    ctx.fillStyle = '#FEF3C7';
    ctx.fillRect(tbl.x - 1.5, tbl.y - 12, 3, 6);
    // Candle Flame
    const candleBob = Math.sin(now * 0.01 + tbl.x) * 1.5;
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(tbl.x - 2, tbl.y - 16 + candleBob, 4, 4);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(tbl.x - 1, tbl.y - 15 + candleBob, 2, 2);

    // Warm Candle Glow
    const candleGlow = ctx.createRadialGradient(tbl.x, tbl.y - 12, 2, tbl.x, tbl.y - 12, 45);
    candleGlow.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
    candleGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = candleGlow;
    ctx.beginPath();
    ctx.arc(tbl.x, tbl.y - 12, 45, 0, Math.PI * 2);
    ctx.fill();

    // Beer Mug on Table
    ctx.fillStyle = '#D97706';
    ctx.fillRect(tbl.x + 8, tbl.y - 4, 6, 8);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(tbl.x + 7, tbl.y - 6, 8, 3);
  }

  // 5. Adventurer Quest Board on West Wall (x: 5*TILE, y: 15*TILE)
  const qx = 5 * TILE;
  const qy = 15 * TILE;
  ctx.fillStyle = '#451A03';
  ctx.fillRect(qx - 16, qy - 24, 32, 40);
  ctx.fillStyle = '#78350F';
  ctx.fillRect(qx - 14, qy - 22, 28, 36);

  // Pinned Parchment Bounty Notes
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(qx - 10, qy - 18, 9, 11);
  ctx.fillRect(qx + 2, qy - 14, 8, 12);
  ctx.fillRect(qx - 8, qy - 2, 10, 10);
  ctx.fillRect(qx + 3, qy + 1, 7, 9);
  // Red Wax Seal
  ctx.fillStyle = '#DC2626';
  ctx.fillRect(qx - 6, qy - 14, 2, 2);
  ctx.fillRect(qx + 5, qy - 10, 2, 2);

  // Quest Board Label
  ctx.font = '700 8px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FCD34D';
  ctx.textAlign = 'center';
  ctx.fillText('BOUNTIES', qx, qy - 26);

  // 6. Weapon Rack near Training Arena (x: 32*TILE, y: 11*TILE)
  const wx = 32 * TILE;
  const wy = 11 * TILE;
  ctx.fillStyle = '#5C3A21';
  ctx.fillRect(wx - 14, wy - 16, 28, 32);
  ctx.fillStyle = '#4A2C1A';
  ctx.fillRect(wx - 12, wy - 14, 24, 28);

  // Mounted Iron Swords & Shield
  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(wx - 8, wy - 10, 3, 20); // Sword 1 blade
  ctx.fillRect(wx + 5, wy - 10, 3, 20); // Sword 2 blade
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(wx - 10, wy - 4, 7, 2); // Crossguard
  ctx.fillRect(wx + 3, wy - 4, 7, 2);

  // Round Wooden Shield in Center
  ctx.fillStyle = '#78350F';
  ctx.beginPath();
  ctx.arc(wx, wy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(wx, wy, 3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Monumental Sanctuary Warden's Gate of Divine Protection (Floor 10 Landmark Gate)
 */
export function drawWardenGateProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  now: number
): void {
  // 1. Soft Shadow on Floor
  ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
  ctx.fillRect(x - 94, y + 16, 188, 14);

  // 2. Consecrated White Marble Threshold & Pedestal
  ctx.fillStyle = '#D9D2C5'; // Base shadow stone
  ctx.fillRect(x - 90, y + 12, 180, 8);
  ctx.fillStyle = '#FAF8F5'; // Pure alabaster marble top
  ctx.fillRect(x - 88, y + 10, 176, 5);
  ctx.fillStyle = '#F59E0B'; // Gold inlay line
  ctx.fillRect(x - 86, y + 11, 172, 1.5);

  // Inlaid Golden Solar Protection Runes along threshold
  ctx.fillStyle = '#FEF08A';
  for (let r = -3; r <= 3; r++) {
    const rx = x + r * 22;
    ctx.fillRect(rx - 3, y + 12, 6, 2);
    ctx.fillRect(rx - 1, y + 10, 2, 6);
  }

  // 3. Left & Right Monumental Fluted Alabaster Pillars
  const pillarW = 28;
  const pillarH = 110;
  const leftX = x - 85;
  const rightX = x + 57;
  const topY = y - 95;

  for (const px of [leftX, rightX]) {
    // Pillar Base
    ctx.fillStyle = '#C5BCAE';
    ctx.fillRect(px - 2, y - 5, pillarW + 4, 18);
    ctx.fillStyle = '#FAF8F5';
    ctx.fillRect(px - 1, y - 4, pillarW + 2, 15);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(px, y - 2, pillarW, 2);

    // Fluted Shaft
    ctx.fillStyle = '#ECE7DF';
    ctx.fillRect(px, topY, pillarW, pillarH);
    ctx.fillStyle = '#FAF8F5';
    ctx.fillRect(px + 2, topY, pillarW - 4, pillarH);

    // Fluted Gold Grooves (3 gold vertical inlay flutes)
    ctx.fillStyle = '#D97706';
    ctx.fillRect(px + 6, topY + 4, 2, pillarH - 8);
    ctx.fillRect(px + 13, topY + 4, 2, pillarH - 8);
    ctx.fillRect(px + 20, topY + 4, 2, pillarH - 8);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(px + 7, topY + 4, 1, pillarH - 8);
    ctx.fillRect(px + 14, topY + 4, 1, pillarH - 8);
    ctx.fillRect(px + 21, topY + 4, 1, pillarH - 8);

    // Sculpted Angel Guardian Statue Relief on Pillar
    const angelY = topY + 28;
    const ax = px + pillarW / 2;

    // Sculpted Angel Wings
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.moveTo(ax - 10, angelY - 6);
    ctx.lineTo(ax - 2, angelY - 14);
    ctx.lineTo(ax - 4, angelY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ax + 10, angelY - 6);
    ctx.lineTo(ax + 2, angelY - 14);
    ctx.lineTo(ax + 4, angelY + 4);
    ctx.closePath();
    ctx.fill();

    // Sculpted Angel Body & Robes
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(ax - 4, angelY - 10, 8, 22);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(ax - 1, angelY - 8, 2, 18); // Gold stole

    // Raised Sword of Protection
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(ax - 1, angelY - 22, 2, 14);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(ax - 4, angelY - 10, 8, 2); // Crossguard

    // Pillar Capital (Top Header of Pillar)
    ctx.fillStyle = '#D97706';
    ctx.fillRect(px - 3, topY - 8, pillarW + 6, 9);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(px - 2, topY - 7, pillarW + 4, 7);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(px - 1, topY - 6, pillarW + 2, 3);
  }

  // 4. Double-Arched Sanctuary Header & Lintel
  const lintelY = topY - 22;
  const lintelW = 176;
  ctx.fillStyle = '#B8AFA0';
  ctx.fillRect(x - lintelW / 2 - 2, lintelY - 2, lintelW + 4, 18);
  ctx.fillStyle = '#FAF8F5'; // Pristine alabaster
  ctx.fillRect(x - lintelW / 2, lintelY, lintelW, 14);

  // Gilded Arch Filigree & Inscription
  ctx.fillStyle = '#F59E0B';
  ctx.fillRect(x - lintelW / 2 + 4, lintelY + 2, lintelW - 8, 3);
  ctx.fillStyle = '#FEF08A';
  ctx.fillRect(x - lintelW / 2 + 6, lintelY + 3, lintelW - 12, 1);

  // Central Grand Solar Sunburst Crest on Arch Lintel
  const crestY = lintelY + 7;
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(x, crestY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.arc(x, crestY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x - 2, crestY - 2, 4, 4);

  // Radiant Solar Rays extending from Crest
  for (let r = 0; r < 8; r++) {
    const rAng = (r * Math.PI) / 4;
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(rAng) * 12, crestY + Math.sin(rAng) * 12);
    ctx.lineTo(x + Math.cos(rAng) * 19, crestY + Math.sin(rAng) * 19);
    ctx.stroke();
  }

  // Inscribed Sacred Moving Obfuscated Text (Minecraft §k style with English alphabet)
  const obfText = `[ ${getMinecraftObfuscatedString(14, now)} ]`;
  ctx.font = '700 8px "JetBrains Mono", monospace';
  ctx.fillStyle = '#FEF08A';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
  ctx.shadowBlur = 5;
  ctx.fillText(obfText, x, lintelY - 4);
  ctx.shadowBlur = 0;

  // 5. Massive Closed Sanctuary Doors (Dual Ivory & Gold Panels)
  const doorW = 56;
  const doorH = 92;
  const doorY = topY + 4;
  const leftDoorX = x - doorW;
  const rightDoorX = x;

  // Door background (Consecrated ivory oak panels)
  ctx.fillStyle = '#3D3427'; // Deep dark shadow seam
  ctx.fillRect(leftDoorX - 1, doorY - 1, doorW * 2 + 2, doorH + 2);

  // Left Door Panel
  ctx.fillStyle = '#E5DDD0';
  ctx.fillRect(leftDoorX, doorY, doorW - 1, doorH);
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(leftDoorX + 3, doorY + 3, doorW - 7, doorH - 6);

  // Right Door Panel
  ctx.fillStyle = '#E5DDD0';
  ctx.fillRect(rightDoorX + 1, doorY, doorW - 1, doorH);
  ctx.fillStyle = '#FAF8F5';
  ctx.fillRect(rightDoorX + 4, doorY + 3, doorW - 7, doorH - 6);

  // Door Mouldings & Recessed Panels
  for (const dx of [leftDoorX + 6, rightDoorX + 7]) {
    // Upper Recessed Panel
    ctx.fillStyle = '#D9D2C5';
    ctx.fillRect(dx, doorY + 8, doorW - 14, 32);
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(dx + 2, doorY + 10, doorW - 18, 28);

    // Lower Recessed Panel
    ctx.fillStyle = '#D9D2C5';
    ctx.fillRect(dx, doorY + 48, doorW - 14, 36);
    ctx.fillStyle = '#FFFBEB';
    ctx.fillRect(dx + 2, doorY + 50, doorW - 18, 32);

    // Embossed Gold Aegis Shield Studs on Panels
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(dx + 6, doorY + 14, 6, 6);
    ctx.fillRect(dx + doorW - 22, doorY + 14, 6, 6);
    ctx.fillRect(dx + 6, doorY + 56, 6, 6);
    ctx.fillRect(dx + doorW - 22, doorY + 56, 6, 6);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(dx + 8, doorY + 16, 2, 2);
    ctx.fillRect(dx + doorW - 20, doorY + 16, 2, 2);
    ctx.fillRect(dx + 8, doorY + 58, 2, 2);
    ctx.fillRect(dx + doorW - 20, doorY + 58, 2, 2);
  }

  // Heavy Iron-Gold Hinge Brackets (3 pairs of hinges)
  ctx.fillStyle = '#B45309';
  for (let h = 0; h < 3; h++) {
    const hy = doorY + 12 + h * 30;
    // Left Hinge
    ctx.fillRect(leftDoorX, hy, 16, 4);
    // Right Hinge
    ctx.fillRect(rightDoorX + doorW - 16, hy, 16, 4);
    ctx.fillStyle = '#FEF08A';
    ctx.fillRect(leftDoorX + 2, hy + 1, 12, 2);
    ctx.fillRect(rightDoorX + doorW - 14, hy + 1, 12, 2);
    ctx.fillStyle = '#B45309';
  }

  // 6. Central Divine Light Beam Leaking Through Door Seam
  const seamX = x;
  const seamPulse = 0.65 + Math.sin(now * 0.004) * 0.25;
  ctx.fillStyle = `rgba(254, 240, 138, ${seamPulse})`;
  ctx.fillRect(seamX - 1.5, doorY, 3, doorH);

  // Light stream spreading onto floor threshold
  ctx.beginPath();
  ctx.moveTo(seamX - 2, doorY + doorH);
  ctx.lineTo(seamX - 18, y + 16);
  ctx.lineTo(seamX + 18, y + 16);
  ctx.lineTo(seamX + 2, doorY + doorH);
  ctx.closePath();
  ctx.fillStyle = `rgba(254, 240, 138, ${seamPulse * 0.4})`;
  ctx.fill();

  // 7. CENTRAL SOLAR AEGIS SEAL LOCK MEDALLION
  const lockY = doorY + doorH / 2;
  const pulseR = 14 + Math.sin(now * 0.005) * 2;

  // Outer Glowing Golden Rays
  ctx.strokeStyle = `rgba(254, 240, 138, ${seamPulse})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(x, lockY, pulseR + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Solid Gold Medallion Body
  ctx.fillStyle = '#D97706';
  ctx.beginPath();
  ctx.arc(x, lockY, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(x, lockY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FEF08A';
  ctx.beginPath();
  ctx.arc(x, lockY, 8, 0, Math.PI * 2);
  ctx.fill();

  // Inlaid Solar Cross Keyhole Seal
  ctx.fillStyle = '#451A03';
  ctx.fillRect(x - 2, lockY - 5, 4, 10);
  ctx.fillRect(x - 5, lockY - 2, 10, 4);
  ctx.fillStyle = '#FFFBEB';
  ctx.fillRect(x - 1, lockY - 1, 2, 2);

  // Floating Holy Light Particles drifting from Gate Seal
  for (let p = 0; p < 4; p++) {
    const pPhase = (now * 0.0015 + p * 0.25) % 1;
    const px = x + Math.sin(now * 0.004 + p * 1.7) * 24;
    const py = lockY + 10 - pPhase * 40;
    const pAlpha = Math.sin(pPhase * Math.PI) * 0.85;

    ctx.fillStyle = `rgba(254, 240, 138, ${pAlpha})`;
    ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${pAlpha})`;
    ctx.fillRect(Math.round(px + 1), Math.round(py), 1, 1);
  }
}


