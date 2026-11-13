import React, { useEffect, useRef } from 'react';
import { HERO_CLASSES, type HeroClassId } from '../shared/types.ts';

interface PixelHeroPreviewProps {
  heroClass: HeroClassId;
  size?: number;
  animate?: boolean;
  className?: string;
}

/**
 * Pixel-art hero sprite renderer.
 * Draws unique, detailed pixel armor, weapons, plumes, halos, and gear
 * for Vanguard, Ranger, Arcanist, and Cleric.
 */
export const PixelHeroPreview: React.FC<PixelHeroPreviewProps> = ({
  heroClass,
  size = 64,
  animate = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const def = HERO_CLASSES[heroClass];

    const draw = (time: number) => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, 32, 32);

      const bob = animate ? Math.round(Math.sin(time * 0.005) * 0.8) : 0;
      const breathe = animate ? Math.round(Math.sin(time * 0.003) * 0.5) : 0;

      // Drop shadow on ground
      ctx.fillStyle = 'rgba(10, 11, 18, 0.45)';
      ctx.fillRect(8, 27, 16, 3);
      ctx.fillRect(10, 26, 12, 1);

      if (heroClass === 'vanguard') {
        // ==========================================
        // VANGUARD: Ironcrest Bastion (Heavy Knight)
        // ==========================================
        // Regal Crimson War Cape
        ctx.fillStyle = '#7F1D1D';
        ctx.fillRect(8, 12 + bob, 16, 12);
        ctx.fillStyle = '#991B1B';
        ctx.fillRect(9, 13 + bob, 14, 10);
        ctx.fillStyle = '#B91C1C';
        ctx.fillRect(10, 14 + bob, 4, 8);

        // Heavy Steel Plate Legs & Sabatons
        ctx.fillStyle = '#334155';
        ctx.fillRect(11, 23 + bob, 4, 5);
        ctx.fillRect(17, 23 + bob, 4, 5);
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(10, 26, 5, 2);
        ctx.fillRect(17, 26, 5, 2);

        // Steel Plate Cuirass & Tabard
        ctx.fillStyle = '#475569';
        ctx.fillRect(10, 11 + bob, 12, 12);
        ctx.fillStyle = '#64748B';
        ctx.fillRect(11, 12 + bob, 10, 10);
        // Golden Heraldic Bastion Cross on chest
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(15, 13 + bob, 2, 8);
        ctx.fillRect(13, 15 + bob, 6, 2);
        // Gold plate rivets & belt
        ctx.fillStyle = '#D97706';
        ctx.fillRect(11, 21 + bob, 10, 2);

        // Heavy Pauldrons (Shoulders)
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(8, 11 + bob, 3, 4);
        ctx.fillRect(21, 11 + bob, 3, 4);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(8, 10 + bob, 3, 1);
        ctx.fillRect(21, 10 + bob, 3, 1);

        // Winged Steel Greathelm
        ctx.fillStyle = '#475569';
        ctx.fillRect(11, 4 + bob, 10, 8);
        ctx.fillStyle = '#64748B';
        ctx.fillRect(12, 5 + bob, 8, 6);
        // Glowing Blue Visor Slit
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(13, 8 + bob, 6, 2);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(14, 8 + bob, 4, 1);
        // Golden Forehead Crest
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(15, 4 + bob, 2, 2);
        // Flowing Crimson Plume (Battle crest)
        const plumeWave = animate ? Math.round(Math.sin(time * 0.008) * 1) : 0;
        ctx.fillStyle = '#DC2626';
        ctx.fillRect(15, 1 + bob, 2, 3);
        ctx.fillRect(16 + plumeWave, 2 + bob, 3, 2);
        ctx.fillRect(18 + plumeWave, 3 + bob, 2, 2);

        // Left Hand: Tower Kite Shield with subtle guard brace
        const shieldBob = animate ? Math.round(Math.sin(time * 0.004) * 1) : 0;
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(4, 11 + bob + shieldBob, 6, 14);
        ctx.fillStyle = '#475569';
        ctx.fillRect(5, 12 + bob + shieldBob, 4, 11);
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(5, 12 + bob + shieldBob, 2, 9);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(5, 11 + bob + shieldBob, 4, 1);
        ctx.fillRect(6, 14 + bob + shieldBob, 2, 6);
        ctx.fillRect(7, 22 + bob + shieldBob, 1, 2);

        // Right Hand: Sunforged Claymore with gentle ready-stance tilt
        const swordTilt = animate ? Math.sin(time * 0.0038) * 0.14 : -0.1;
        ctx.save();
        ctx.translate(25, 20 + bob);
        ctx.rotate(swordTilt);
        ctx.fillStyle = '#CBD5E1';
        ctx.fillRect(-1, -17, 2, 17);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-1, -16, 1, 15);
        ctx.fillStyle = '#D97706';
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillStyle = '#78350F';
        ctx.fillRect(-1, 1, 2, 4);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-1, 5, 2, 2);
        ctx.restore();
      } else if (heroClass === 'ranger') {
        // ==========================================
        // RANGER: Thornwood Marksman (Swift Scout)
        // ==========================================
        // Scalloped Leaf-Green Cloak
        ctx.fillStyle = '#142E1F';
        ctx.fillRect(9, 12 + bob, 14, 12);
        ctx.fillStyle = '#1E3A29';
        ctx.fillRect(10, 13 + bob, 12, 10);
        ctx.fillStyle = '#2D5A3C';
        ctx.fillRect(11, 14 + bob, 10, 8);

        // Wooden Quiver on Back with Fletched Arrows
        ctx.fillStyle = '#78350F';
        ctx.fillRect(7, 8 + bob, 3, 10);
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(6, 5 + bob, 2, 3);
        ctx.fillRect(8, 4 + bob, 2, 4);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(7, 6 + bob, 1, 2);

        // Leather Greaves & Boots
        ctx.fillStyle = '#271E15';
        ctx.fillRect(11, 23 + bob, 4, 5);
        ctx.fillRect(17, 23 + bob, 4, 5);
        ctx.fillStyle = '#142E1F';
        ctx.fillRect(10, 26, 5, 2);
        ctx.fillRect(17, 26, 5, 2);

        // Thornwood Leather Cuirass
        ctx.fillStyle = '#2D5A3C';
        ctx.fillRect(11, 11 + bob, 10, 12);
        ctx.fillStyle = '#3F7A52';
        ctx.fillRect(12, 12 + bob, 8, 9);
        ctx.fillStyle = '#D97706';
        ctx.fillRect(12, 14 + bob, 8, 1);
        ctx.fillRect(12, 18 + bob, 8, 1);
        ctx.fillStyle = '#4ADE80';
        ctx.fillRect(15, 13 + bob, 2, 2);

        // Forest Ranger Deep Hood
        ctx.fillStyle = '#1E3A29';
        ctx.fillRect(11, 3 + bob, 10, 8);
        ctx.fillStyle = '#2D5A3C';
        ctx.fillRect(12, 4 + bob, 8, 6);
        ctx.fillRect(15, 2 + bob, 2, 2);
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(12, 7 + bob, 8, 3);
        ctx.fillStyle = '#4ADE80';
        ctx.fillRect(14, 8 + bob, 2, 1);
        ctx.fillRect(17, 8 + bob, 2, 1);

        // Ashwood Recurve Bow with Periodic Arrow Draw Cycle
        const drawCycle = animate ? Math.max(0, Math.sin(time * 0.0045)) : 0.4;
        const drawPull = Math.round(drawCycle * 2.5);
        ctx.fillStyle = '#92400E';
        ctx.fillRect(24, 7 + bob, 2, 16);
        ctx.fillRect(23, 9 + bob, 1, 12);
        ctx.fillRect(25, 6 + bob, 2, 3);
        ctx.fillRect(25, 21 + bob, 2, 3);
        // Bowstring flexing back cleanly during draw
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(26, 8 + bob, 1, 6);
        ctx.fillRect(26, 15 + bob, 1, 7);
        ctx.fillRect(26 + drawPull, 13 + bob, 1, 3);
        // Nocked Arrow moving backward/forward with bowstring
        ctx.fillStyle = '#78350F';
        ctx.fillRect(20 + drawPull, 14 + bob, 7, 1);
        ctx.fillStyle = drawCycle > 0.65 ? '#6EE7B7' : '#34D399';
        ctx.fillRect(19 + drawPull, 13 + bob, 2, 2);
      } else if (heroClass === 'arcanist') {
        // ==========================================
        // ARCANIST: Astral Conduit (Cosmic Caster)
        // ==========================================
        // Midnight Indigo Layered Robes
        ctx.fillStyle = '#1E1B4B';
        ctx.fillRect(9, 13 + bob, 14, 14);
        ctx.fillStyle = '#312E81';
        ctx.fillRect(10, 14 + bob, 12, 12);
        ctx.fillStyle = '#4338CA';
        ctx.fillRect(11, 15 + bob, 10, 10);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(10, 25 + bob, 12, 2);
        ctx.fillRect(14, 16 + bob, 4, 2);
        ctx.fillRect(15, 19 + bob, 2, 4);

        // Mystic Mantle & Astral Scarf
        ctx.fillStyle = '#4F46E5';
        ctx.fillRect(9, 11 + bob, 14, 4);
        ctx.fillStyle = '#818CF8';
        ctx.fillRect(11, 12 + bob, 10, 2);

        // Pointed Mystic Wizard Hat
        ctx.fillStyle = '#1E1B4B';
        ctx.fillRect(8, 7 + bob, 16, 2);
        ctx.fillStyle = '#312E81';
        ctx.fillRect(11, 5 + bob, 10, 3);
        ctx.fillStyle = '#4338CA';
        ctx.fillRect(13, 3 + bob, 6, 3);
        ctx.fillStyle = '#6366F1';
        ctx.fillRect(14, 1 + bob, 4, 3);
        ctx.fillStyle = '#818CF8';
        ctx.fillRect(16, 0 + bob, 2, 2);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(11, 6 + bob, 10, 1);
        ctx.fillStyle = '#E2E8F0';
        ctx.fillRect(12, 8 + bob, 8, 3);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(13, 9 + bob, 2, 1);
        ctx.fillRect(17, 9 + bob, 2, 1);

        // Runebound Spire Staff with Gentle Caster Sway + Gold Prongs
        const staffTilt = animate ? Math.sin(time * 0.0036) * 0.09 : 0.05;
        ctx.save();
        ctx.translate(26, 20 + bob);
        ctx.rotate(staffTilt);
        ctx.fillStyle = '#581C87';
        ctx.fillRect(-1, -15, 2, 22);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-2, -16, 4, 2);
        ctx.fillRect(-3, -19, 1, 3);
        ctx.fillRect(2, -19, 1, 3);
        const crystalPulse = animate ? Math.sin(time * 0.008) * 1.2 : 0;
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(-2, -21 + Math.round(crystalPulse), 4, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-1, -20 + Math.round(crystalPulse), 2, 2);
        ctx.restore();

        // Orbiting Astral Orb (Left side)
        const orbAngle = animate ? time * 0.004 : 1.2;
        const orbX = 5 + Math.round(Math.cos(orbAngle) * 3);
        const orbY = 12 + bob + Math.round(Math.sin(orbAngle) * 4);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fillRect(orbX - 1, orbY - 1, 5, 5);
        ctx.fillStyle = '#38BDF8';
        ctx.fillRect(orbX, orbY, 3, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(orbX + 1, orbY + 1, 1, 1);
      } else {
        // ==========================================
        // CLERIC: Sunbrand Prelate (Radiant Healer)
        // ==========================================
        const haloPulse = animate ? Math.round(Math.sin(time * 0.006) * 1) : 0;
        ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
        ctx.fillRect(8, 0 + bob + haloPulse, 16, 10);
        ctx.fillStyle = '#FACC15';
        ctx.fillRect(10, 1 + bob + haloPulse, 12, 1);
        ctx.fillRect(8, 3 + bob + haloPulse, 2, 5);
        ctx.fillRect(22, 3 + bob + haloPulse, 2, 5);
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(15, -1 + bob + haloPulse, 2, 2);
        ctx.fillRect(7, 1 + bob + haloPulse, 2, 2);
        ctx.fillRect(23, 1 + bob + haloPulse, 2, 2);

        // Amber Ceremonial Drape & Cape
        ctx.fillStyle = '#78350F';
        ctx.fillRect(9, 12 + bob, 14, 14);
        ctx.fillStyle = '#92400E';
        ctx.fillRect(10, 13 + bob, 12, 12);

        // Ivory Ceremonial Tabard & Golden Filigree
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(11, 11 + bob, 10, 15);
        ctx.fillStyle = '#F1F5F9';
        ctx.fillRect(12, 12 + bob, 8, 13);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(14, 13 + bob, 4, 4);
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(15, 14 + bob, 2, 2);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(13, 21 + bob, 6, 2);
        ctx.fillRect(15, 23 + bob, 2, 3);

        // Golden Winged Cowl / Mitre
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(11, 4 + bob, 10, 7);
        ctx.fillStyle = '#FDE047';
        ctx.fillRect(11, 4 + bob, 10, 2);
        ctx.fillRect(15, 3 + bob, 2, 2);
        ctx.fillStyle = '#FCD34D';
        ctx.fillRect(12, 7 + bob, 8, 3);
        ctx.fillStyle = '#78350F';
        ctx.fillRect(14, 8 + bob, 1, 1);
        ctx.fillRect(17, 8 + bob, 1, 1);

        // Dawnstar Flanged War Mace with Subtle Ready Sway
        const maceTilt = animate ? Math.sin(time * 0.0042) * 0.12 : 0.08;
        ctx.save();
        ctx.translate(25, 21 + bob);
        ctx.rotate(maceTilt);
        ctx.fillStyle = '#64748B';
        ctx.fillRect(-1, -12, 2, 16);
        ctx.fillStyle = '#D97706';
        ctx.fillRect(-2, 0, 4, 3);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-3, -16, 6, 6);
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(-2, -15, 4, 4);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-1, -18, 2, 2);
        ctx.fillRect(-4, -14, 2, 2);
        ctx.fillRect(2, -14, 2, 2);
        ctx.restore();

        // Swinging Holy Reliquary Censer
        const censerSwing = animate ? Math.sin(time * 0.005) * 0.2 : 0;
        ctx.save();
        ctx.translate(7, 14 + bob);
        ctx.rotate(censerSwing);
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(-0.5, 0, 1, 3);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-2, 3, 4, 5);
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(-1, 4, 2, 3);
        ctx.restore();
        if (animate) {
          const sparkY = ((time * 0.008) % 6);
          ctx.fillStyle = 'rgba(254, 240, 138, 0.7)';
          ctx.fillRect(6, 15 + bob - Math.round(sparkY), 1, 1);
        }
      }

      if (animate) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [heroClass, animate]);

  return (
    <canvas
      ref={canvasRef}
      width={32}
      height={32}
      style={{ width: size, height: size }}
      className={`pixelated shrink-0 ${className}`}
      title={HERO_CLASSES[heroClass].name}
      aria-label={`${HERO_CLASSES[heroClass].name} pixel preview`}
    />
  );
};
