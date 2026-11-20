import React, { useEffect, useRef } from 'react';
import { HERO_CLASSES, type HeroClassId } from '../shared/types.ts';
import {
  DEFAULT_VESTMENT_BY_CLASS,
  DEFAULT_WEAPON_BY_CLASS,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
} from '../shared/armaments.ts';

interface PixelHeroPreviewProps {
  heroClass: HeroClassId;
  equippedWeapon?: string | null;
  equippedVestment?: string | null;
  size?: number;
  animate?: boolean;
  className?: string;
}

function resolvePreviewWeaponId(
  heroClass: HeroClassId,
  equippedWeapon: string | null | undefined
): string | null {
  if (equippedWeapon === undefined) return DEFAULT_WEAPON_BY_CLASS[heroClass];
  if (equippedWeapon === null) return null;
  return resolveEquippedWeaponForClass(heroClass, equippedWeapon)?.id ?? null;
}

function resolvePreviewVestmentId(
  heroClass: HeroClassId,
  equippedVestment: string | null | undefined
): string | null {
  if (equippedVestment === undefined) return DEFAULT_VESTMENT_BY_CLASS[heroClass];
  if (equippedVestment === null) return null;
  return resolveEquippedVestmentForClass(heroClass, equippedVestment)?.id ?? null;
}

/**
 * Pixel-art hero sprite renderer.
 * Draws unique, detailed pixel armor, vestments, weapons, plumes, halos, and gear
 * for Vanguard, Ranger, Arcanist, and Cleric.
 */
export const PixelHeroPreview: React.FC<PixelHeroPreviewProps> = ({
  heroClass,
  equippedWeapon,
  equippedVestment,
  size = 64,
  animate = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const weaponId = resolvePreviewWeaponId(heroClass, equippedWeapon);
  const vestmentId = resolvePreviewVestmentId(heroClass, equippedVestment);

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
        // VANGUARD: Ironcrest / Obsidian / Sovereign / Unarmored
        // ==========================================
        const isUnarmored = vestmentId === null;
        const isObsidian = vestmentId === 'vanguard_obsidian_juggernaut';
        const isSovereign = vestmentId === 'vanguard_aegis_sovereign_mail';

        if (!isUnarmored) {
          // Regal War Cape
          ctx.fillStyle = isObsidian ? '#1E293B' : isSovereign ? '#991B1B' : '#7F1D1D';
          ctx.fillRect(8, 12 + bob, 16, 12);
          ctx.fillStyle = isObsidian ? '#334155' : isSovereign ? '#B91C1C' : '#991B1B';
          ctx.fillRect(9, 13 + bob, 14, 10);
          ctx.fillStyle = isObsidian ? '#CBD5E1' : isSovereign ? '#FDE047' : '#B91C1C';
          ctx.fillRect(10, 14 + bob, 4, 8);
        }

        // Plate Legs & Sabatons
        ctx.fillStyle = isObsidian ? '#0F172A' : isSovereign ? '#7F1D1D' : '#334155';
        ctx.fillRect(11, 23 + bob, 4, 5);
        ctx.fillRect(17, 23 + bob, 4, 5);
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(10, 26, 5, 2);
        ctx.fillRect(17, 26, 5, 2);

        if (isUnarmored) {
          ctx.fillStyle = '#334155';
          ctx.fillRect(10, 11 + bob, 12, 12);
          ctx.fillStyle = '#475569';
          ctx.fillRect(11, 12 + bob, 10, 10);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(11, 21 + bob, 10, 2);
          // Bare head + headband
          ctx.fillStyle = '#FDBA74';
          ctx.fillRect(12, 5 + bob, 8, 6);
          ctx.fillStyle = '#334155';
          ctx.fillRect(11, 4 + bob, 10, 2);
          ctx.fillStyle = '#B91C1C';
          ctx.fillRect(11, 6 + bob, 10, 1);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(13, 8 + bob, 2, 1);
          ctx.fillRect(17, 8 + bob, 2, 1);
        } else {
          // Cuirass & Tabard
          ctx.fillStyle = isObsidian ? '#0F172A' : isSovereign ? '#7F1D1D' : '#475569';
          ctx.fillRect(10, 11 + bob, 12, 12);
          ctx.fillStyle = isObsidian ? '#1E293B' : isSovereign ? '#B45309' : '#64748B';
          ctx.fillRect(11, 12 + bob, 10, 10);
          // Chest Emblem
          ctx.fillStyle = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
          ctx.fillRect(15, 13 + bob, 2, 8);
          ctx.fillRect(13, 15 + bob, 6, 2);
          // Belt
          ctx.fillStyle = isObsidian ? '#64748B' : isSovereign ? '#FBBF24' : '#D97706';
          ctx.fillRect(11, 21 + bob, 10, 2);

          // Heavy Pauldrons
          ctx.fillStyle = isObsidian ? '#334155' : isSovereign ? '#F59E0B' : '#94A3B8';
          ctx.fillRect(8, 11 + bob, 3, 4);
          ctx.fillRect(21, 11 + bob, 3, 4);
          ctx.fillStyle = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
          ctx.fillRect(8, 10 + bob, 3, 1);
          ctx.fillRect(21, 10 + bob, 3, 1);
          if (animate && isObsidian) {
            const emberY = Math.round((time * 0.012) % 6);
            ctx.fillStyle = Math.sin(time * 0.008) > 0 ? '#FB923C' : '#EA580C';
            ctx.fillRect(9, 13 + bob, 1, 1);
            ctx.fillRect(22, 13 + bob, 1, 1);
            ctx.fillStyle = 'rgba(251, 146, 60, 0.85)';
            ctx.fillRect(8, 10 + bob - emberY, 1, 1);
            ctx.fillRect(23, 12 + bob - ((emberY + 3) % 6), 1, 1);
          } else if (animate && isSovereign) {
            const sparkY = Math.round((time * 0.01) % 6);
            ctx.fillStyle = 'rgba(254, 240, 138, 0.9)';
            ctx.fillRect(8, 8 + bob - sparkY, 1, 1);
            ctx.fillRect(23, 10 + bob - ((sparkY + 3) % 6), 1, 1);
          }

          // Greathelm
          ctx.fillStyle = isObsidian ? '#0F172A' : isSovereign ? '#92400E' : '#475569';
          ctx.fillRect(11, 4 + bob, 10, 8);
          ctx.fillStyle = isObsidian ? '#1E293B' : isSovereign ? '#D97706' : '#64748B';
          ctx.fillRect(12, 5 + bob, 8, 6);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(13, 8 + bob, 6, 2);
          ctx.fillStyle = isObsidian ? '#FB923C' : isSovereign ? '#FEF08A' : '#38BDF8';
          ctx.fillRect(14, 8 + bob, 4, 1);
          ctx.fillStyle = isObsidian ? '#CBD5E1' : isSovereign ? '#FEF08A' : '#F59E0B';
          ctx.fillRect(15, 4 + bob, 2, 2);
          const plumeWave = animate ? Math.round(Math.sin(time * 0.008) * 1) : 0;
          ctx.fillStyle = isObsidian ? '#94A3B8' : isSovereign ? '#FBBF24' : '#DC2626';
          ctx.fillRect(15, 1 + bob, 2, 3);
          ctx.fillRect(16 + plumeWave, 2 + bob, 3, 2);
          ctx.fillRect(18 + plumeWave, 3 + bob, 2, 2);
        }

        // Left Hand: Shield (hidden when unarmed)
        const shieldBob = animate ? Math.round(Math.sin(time * 0.004) * 1) : 0;
        if (weaponId === 'vanguard_crimson_halberd') {
          // Round Crimson & Iron Buckler
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(3, 14 + bob + shieldBob, 7, 7);
          ctx.fillStyle = '#991B1B';
          ctx.fillRect(4, 15 + bob + shieldBob, 5, 5);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(6, 17 + bob + shieldBob, 1, 1);
        } else if (weaponId === 'vanguard_stormbreaker_flail') {
          // Bastion Wall Tempest Shield
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(3, 10 + bob + shieldBob, 7, 15);
          ctx.fillStyle = '#1E3A8A';
          ctx.fillRect(4, 11 + bob + shieldBob, 5, 13);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(4, 11 + bob + shieldBob, 2, 13);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(3, 10 + bob + shieldBob, 7, 1);
        } else if (weaponId !== null) {
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
        }

        // Right Hand: Equipped Vanguard Weapon
        const swordTilt = animate ? 0.06 + Math.sin(time * 0.0038) * 0.1 : 0.06;
        ctx.save();
        ctx.translate(24, 21 + bob);
        ctx.rotate(swordTilt);
        if (weaponId === null) {
          ctx.fillStyle = '#475569';
          ctx.fillRect(-1, -2, 3, 3);
        } else if (weaponId === 'vanguard_crimson_halberd') {
          ctx.fillStyle = '#991B1B';
          ctx.fillRect(-1, -15, 2, 21);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-1, -10, 2, 1);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(-1, -19, 2, 4);
          ctx.fillStyle = '#475569';
          ctx.fillRect(1, -16, 3, 7);
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(3, -17, 2, 8);
          ctx.fillStyle = '#EF4444';
          ctx.fillRect(1, -14, 2, 3);
          if (animate) {
            const glintY = -17 + Math.round((time * 0.01) % 7);
            ctx.fillStyle = '#FCA5A5';
            ctx.fillRect(3, glintY, 2, 1);
          }
        } else if (weaponId === 'vanguard_stormbreaker_flail') {
          ctx.fillStyle = '#334155';
          ctx.fillRect(-1, -3, 2, 9);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-2, -4, 4, 1);
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(-0.5, -9, 1.5, 5);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(-3, -15, 6, 6);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-2, -14, 4, 4);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-1, -13, 2, 2);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(-1, -17, 2, 2);
          ctx.fillRect(3, -13, 2, 2);
          ctx.fillRect(-5, -13, 2, 2);
          if (animate && Math.sin(time * 0.02) > 0.2) {
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(-4, -16, 1, 2);
            ctx.fillRect(3, -10, 1, 2);
          }
        } else {
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(-1, -16, 2, 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-1, -15, 1, 14);
          ctx.fillStyle = '#D97706';
          ctx.fillRect(-3, -1, 6, 2);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(-1, 1, 2, 4);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-1, 5, 2, 2);
        }
        ctx.restore();
      } else if (heroClass === 'ranger') {
        // ==========================================
        // RANGER: Thornwood / Windrunner / Briarheart / Unarmored
        // ==========================================
        const isBareGarb = vestmentId === null;
        const isWindrunner = vestmentId === 'ranger_windrunner_mantle';
        const isBriarheart = vestmentId === 'ranger_briarheart_leather';

        if (!isBareGarb) {
          ctx.fillStyle = isWindrunner ? '#082F49' : isBriarheart ? '#022C22' : '#142E1F';
          ctx.fillRect(9, 12 + bob, 14, 12);
          ctx.fillStyle = isWindrunner ? '#0E7490' : isBriarheart ? '#065F46' : '#1E3A29';
          ctx.fillRect(10, 13 + bob, 12, 10);
          ctx.fillStyle = isWindrunner ? '#38BDF8' : isBriarheart ? '#10B981' : '#2D5A3C';
          ctx.fillRect(11, 14 + bob, 10, 8);
        }

        // Quiver on Back (hidden when unarmed)
        if (weaponId !== null) {
          if (weaponId === 'ranger_galewind_twinbow') {
            ctx.fillStyle = '#0E7490';
            ctx.fillRect(7, 8 + bob, 3, 10);
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(6, 5 + bob, 2, 3);
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(8, 4 + bob, 2, 4);
          } else if (weaponId === 'ranger_eclipse_longbow') {
            ctx.fillStyle = '#3B0764';
            ctx.fillRect(7, 8 + bob, 3, 10);
            ctx.fillStyle = '#FBBF24';
            ctx.fillRect(7, 10 + bob, 3, 1);
            ctx.fillStyle = '#C084FC';
            ctx.fillRect(6, 5 + bob, 2, 3);
            ctx.fillStyle = '#FDE047';
            ctx.fillRect(8, 4 + bob, 2, 4);
          } else {
            ctx.fillStyle = '#78350F';
            ctx.fillRect(7, 8 + bob, 3, 10);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(6, 5 + bob, 2, 3);
            ctx.fillRect(8, 4 + bob, 2, 4);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(7, 6 + bob, 1, 2);
          }
        }

        // Leather Greaves & Boots
        ctx.fillStyle = '#271E15';
        ctx.fillRect(11, 23 + bob, 4, 5);
        ctx.fillRect(17, 23 + bob, 4, 5);
        ctx.fillStyle = isWindrunner ? '#0E7490' : isBriarheart ? '#064E3B' : '#142E1F';
        ctx.fillRect(10, 26, 5, 2);
        ctx.fillRect(17, 26, 5, 2);

        if (isBareGarb) {
          ctx.fillStyle = '#57534E';
          ctx.fillRect(11, 11 + bob, 10, 12);
          ctx.fillStyle = '#78716C';
          ctx.fillRect(12, 12 + bob, 8, 9);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(11, 20 + bob, 10, 2);
          ctx.fillStyle = '#FDBA74';
          ctx.fillRect(12, 5 + bob, 8, 6);
          ctx.fillStyle = '#44403C';
          ctx.fillRect(11, 4 + bob, 10, 2);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(13, 8 + bob, 2, 1);
          ctx.fillRect(17, 8 + bob, 2, 1);
        } else {
          // Tunic / Hauberk
          ctx.fillStyle = isWindrunner ? '#0F172A' : isBriarheart ? '#064E3B' : '#2D5A3C';
          ctx.fillRect(11, 11 + bob, 10, 12);
          ctx.fillStyle = isWindrunner ? '#0E7490' : isBriarheart ? '#059669' : '#3F7A52';
          ctx.fillRect(12, 12 + bob, 8, 9);
          ctx.fillStyle = isWindrunner ? '#BAE6FD' : isBriarheart ? '#10B981' : '#D97706';
          ctx.fillRect(12, 14 + bob, 8, 1);
          ctx.fillRect(12, 18 + bob, 8, 1);
          ctx.fillStyle = isWindrunner ? '#FFFFFF' : isBriarheart ? '#34D399' : '#4ADE80';
          ctx.fillRect(15, 13 + bob, 2, 2);

          // Forest / Mist / Briarheart Hood
          ctx.fillStyle = isWindrunner ? '#082F49' : isBriarheart ? '#065F46' : '#1E3A29';
          ctx.fillRect(11, 3 + bob, 10, 8);
          ctx.fillStyle = isWindrunner ? '#0E7490' : isBriarheart ? '#10B981' : '#2D5A3C';
          ctx.fillRect(12, 4 + bob, 8, 6);
          ctx.fillRect(15, 2 + bob, 2, 2);
          if (isBriarheart) {
            ctx.fillStyle = '#A7F3D0';
            ctx.fillRect(11, 2 + bob, 2, 2);
            ctx.fillRect(19, 2 + bob, 2, 2);
            if (animate) {
              const groveY = Math.round(Math.sin(time * 0.006) * 1.5);
              ctx.fillStyle = '#34D399';
              ctx.fillRect(8, 6 + bob + groveY, 1, 1);
              ctx.fillRect(23, 8 + bob - groveY, 1, 1);
            }
          } else if (isWindrunner && animate) {
            const windX = Math.round((time * 0.015) % 8);
            ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
            ctx.fillRect(8 + windX, 11 + bob, 2, 1);
            ctx.fillRect(21 - windX, 17 + bob, 2, 1);
          }
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(12, 7 + bob, 8, 3);
          ctx.fillStyle = isWindrunner ? '#BAE6FD' : isBriarheart ? '#A7F3D0' : '#4ADE80';
          ctx.fillRect(14, 8 + bob, 2, 1);
          ctx.fillRect(17, 8 + bob, 2, 1);
        }

        // Equipped Bow
        const drawCycle = animate ? Math.max(0, Math.sin(time * 0.0045)) : 0.4;
        const drawPull = Math.round(drawCycle * 2.5);
        if (weaponId === null) {
          ctx.fillStyle = '#3F7A52';
          ctx.fillRect(23, 14 + bob, 3, 3);
        } else if (weaponId === 'ranger_galewind_twinbow') {
          ctx.fillStyle = '#0E7490';
          ctx.fillRect(24, 6 + bob, 2, 17);
          ctx.fillStyle = '#22D3EE';
          ctx.fillRect(23, 8 + bob, 1, 13);
          ctx.fillRect(26, 8 + bob, 1, 5);
          ctx.fillRect(26, 16 + bob, 1, 5);
          ctx.fillStyle = '#BAE6FD';
          ctx.fillRect(26, 8 + bob, 1, 13);
          ctx.fillRect(20 + drawPull, 12 + bob, 7, 1);
          ctx.fillRect(20 + drawPull, 15 + bob, 7, 1);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(19 + drawPull, 12 + bob, 2, 1);
          ctx.fillRect(19 + drawPull, 15 + bob, 2, 1);
        } else if (weaponId === 'ranger_eclipse_longbow') {
          ctx.fillStyle = '#312E81';
          ctx.fillRect(24, 5 + bob, 2, 19);
          ctx.fillStyle = '#7C3AED';
          ctx.fillRect(23, 7 + bob, 2, 15);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(25, 4 + bob, 2, 2);
          ctx.fillRect(25, 23 + bob, 2, 2);
          ctx.fillStyle = '#EDE9FE';
          ctx.fillRect(26, 6 + bob, 1, 17);
          ctx.fillStyle = '#A855F7';
          ctx.fillRect(19 + drawPull, 14 + bob, 8, 1);
          ctx.fillStyle = '#FDE047';
          ctx.fillRect(18 + drawPull, 13 + bob, 2, 3);
        } else {
          ctx.fillStyle = '#92400E';
          ctx.fillRect(24, 7 + bob, 2, 16);
          ctx.fillRect(23, 9 + bob, 1, 12);
          ctx.fillRect(25, 6 + bob, 2, 3);
          ctx.fillRect(25, 21 + bob, 2, 3);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(26, 8 + bob, 1, 6);
          ctx.fillRect(26, 15 + bob, 1, 7);
          ctx.fillRect(26 + drawPull, 13 + bob, 1, 3);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(20 + drawPull, 14 + bob, 7, 1);
          ctx.fillStyle = drawCycle > 0.65 ? '#6EE7B7' : '#34D399';
          ctx.fillRect(19 + drawPull, 13 + bob, 2, 2);
        }
      } else if (heroClass === 'arcanist') {
        // ==========================================
        // ARCANIST: Astral / Chronomancer / Voidward / Unarmored
        // ==========================================
        const isBareRobe = vestmentId === null;
        const isChronoShroud = vestmentId === 'arcanist_chronomancer_shroud';
        const isVoidward = vestmentId === 'arcanist_voidward_robes';

        if (isBareRobe) {
          ctx.fillStyle = '#1E1B4B';
          ctx.fillRect(10, 13 + bob, 12, 13);
          ctx.fillStyle = '#334155';
          ctx.fillRect(11, 14 + bob, 10, 11);
          ctx.fillStyle = '#475569';
          ctx.fillRect(11, 21 + bob, 10, 2);
          ctx.fillStyle = '#FDBA74';
          ctx.fillRect(12, 6 + bob, 8, 6);
          ctx.fillStyle = '#312E81';
          ctx.fillRect(11, 5 + bob, 10, 3);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(13, 9 + bob, 2, 1);
          ctx.fillRect(17, 9 + bob, 2, 1);
        } else {
          const robeDark = isChronoShroud ? '#0F172A' : isVoidward ? '#3B0764' : '#1E1B4B';
          const robeMid = isChronoShroud ? '#1E3A8A' : isVoidward ? '#581C87' : '#312E81';
          const robeInner = isChronoShroud ? '#1D4ED8' : isVoidward ? '#7E22CE' : '#4338CA';
          const runeTrim = isChronoShroud ? '#FBBF24' : isVoidward ? '#C084FC' : '#38BDF8';
          const mantleA = isChronoShroud ? '#38BDF8' : isVoidward ? '#9333EA' : '#4F46E5';
          const mantleB = isChronoShroud ? '#E0F2FE' : isVoidward ? '#E879F9' : '#818CF8';

          ctx.fillStyle = robeDark;
          ctx.fillRect(9, 13 + bob, 14, 14);
          ctx.fillStyle = robeMid;
          ctx.fillRect(10, 14 + bob, 12, 12);
          ctx.fillStyle = robeInner;
          ctx.fillRect(11, 15 + bob, 10, 10);
          ctx.fillStyle = runeTrim;
          ctx.fillRect(10, 25 + bob, 12, 2);
          ctx.fillRect(14, 16 + bob, 4, 2);
          ctx.fillRect(15, 19 + bob, 2, 4);

          // Mantle & Scarf + Vestment Aura Pixels
          ctx.fillStyle = mantleA;
          ctx.fillRect(9, 11 + bob, 14, 4);
          ctx.fillStyle = mantleB;
          ctx.fillRect(11, 12 + bob, 10, 2);
          if (animate && isChronoShroud) {
            const cAng = time * 0.004;
            const cx = 16 + Math.round(Math.cos(cAng) * 8);
            const cy = 12 + bob + Math.round(Math.sin(cAng) * 4);
            ctx.fillStyle = '#FBBF24';
            ctx.fillRect(cx, cy, 1, 1);
          } else if (animate && isVoidward) {
            const vAng = time * 0.005;
            ctx.fillStyle = '#E879F9';
            ctx.fillRect(16 + Math.round(Math.cos(vAng) * 8), 13 + bob + Math.round(Math.sin(vAng) * 3), 1, 1);
            ctx.fillRect(16 - Math.round(Math.cos(vAng) * 8), 13 + bob - Math.round(Math.sin(vAng) * 3), 1, 1);
          }

          // Wizard Hat
          ctx.fillStyle = robeDark;
          ctx.fillRect(8, 7 + bob, 16, 2);
          ctx.fillStyle = robeMid;
          ctx.fillRect(11, 5 + bob, 10, 3);
          ctx.fillStyle = robeInner;
          ctx.fillRect(13, 3 + bob, 6, 3);
          ctx.fillStyle = mantleB;
          ctx.fillRect(14, 1 + bob, 4, 3);
          ctx.fillRect(16, 0 + bob, 2, 2);
          ctx.fillStyle = runeTrim;
          ctx.fillRect(11, 6 + bob, 10, 1);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(12, 8 + bob, 8, 3);
          ctx.fillStyle = isChronoShroud ? '#38BDF8' : isVoidward ? '#E879F9' : '#38BDF8';
          ctx.fillRect(13, 9 + bob, 2, 1);
          ctx.fillRect(17, 9 + bob, 2, 1);
        }

        // Equipped Arcanist Staff / Focus
        const staffTilt = animate ? Math.sin(time * 0.0036) * 0.08 : 0.04;
        ctx.save();
        ctx.translate(25, 21 + bob);
        ctx.rotate(staffTilt);
        if (weaponId === null) {
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-1, -2, 2, 2);
        } else if (weaponId === 'arcanist_cinderflare_rod') {
          ctx.fillStyle = '#27272A';
          ctx.fillRect(-1, -13, 2, 20);
          ctx.fillStyle = '#D97706';
          ctx.fillRect(-3, -14, 6, 2);
          ctx.fillStyle = '#EA580C';
          ctx.fillRect(-2, -18, 4, 4);
          ctx.fillStyle = '#FB923C';
          ctx.fillRect(-2, -17, 4, 2);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-1, -19, 2, 2);
          if (animate) {
            const fY = Math.round((time * 0.012) % 4);
            ctx.fillStyle = '#FDE047';
            ctx.fillRect(-1, -20 - fY, 1, 1);
          }
        } else if (weaponId === 'arcanist_chronostar_scepter') {
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(-1, -13, 2, 20);
          ctx.fillStyle = '#FBBF24';
          ctx.fillRect(-3, -19, 6, 5);
          ctx.fillStyle = '#1E1B4B';
          ctx.fillRect(-2, -18, 4, 3);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-1, -17, 2, 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, -17, 1, 1);
        } else {
          ctx.fillStyle = '#581C87';
          ctx.fillRect(-1, -13, 2, 20);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-2, -14, 4, 2);
          ctx.fillRect(-3, -17, 1, 3);
          ctx.fillRect(2, -17, 1, 3);
          const crystalPulse = animate ? Math.sin(time * 0.008) * 1.1 : 0;
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-2, -19 + Math.round(crystalPulse), 4, 4);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-1, -18 + Math.round(crystalPulse), 2, 2);
        }
        ctx.restore();

        // Orbiting Astral Orb(s)
        if (weaponId !== null) {
          const orbAngle = animate ? time * 0.004 : 1.2;
          const orbColor = weaponId === 'arcanist_cinderflare_rod' ? '#F97316' : '#38BDF8';
          const orbX = 5 + Math.round(Math.cos(orbAngle) * 3);
          const orbY = 12 + bob + Math.round(Math.sin(orbAngle) * 4);
          ctx.fillStyle = orbColor;
          ctx.fillRect(orbX, orbY, 3, 3);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(orbX + 1, orbY + 1, 1, 1);
          if (weaponId === 'arcanist_chronostar_scepter') {
            const ox2 = 5 + Math.round(Math.cos(orbAngle + Math.PI) * 3);
            const oy2 = 12 + bob + Math.round(Math.sin(orbAngle + Math.PI) * 4);
            ctx.fillStyle = '#FDE047';
            ctx.fillRect(ox2, oy2, 3, 3);
          }
        }
      } else {
        // ==========================================
        // CLERIC: Prelate / Martyr / Templar / Unarmored
        // ==========================================
        const isNovice = vestmentId === null;
        const isMartyr = vestmentId === 'cleric_martyr_surplice';
        const isTemplar = vestmentId === 'cleric_templar_cassock';

        if (!isNovice) {
          const haloPulse = animate ? Math.round(Math.sin(time * 0.006) * 1) : 0;
          ctx.fillStyle = isMartyr ? 'rgba(52, 211, 153, 0.35)' : 'rgba(253, 224, 71, 0.35)';
          ctx.fillRect(8, 0 + bob + haloPulse, 16, 10);
          ctx.fillStyle = isMartyr ? '#34D399' : '#FACC15';
          ctx.fillRect(10, 1 + bob + haloPulse, 12, 1);
          ctx.fillRect(8, 3 + bob + haloPulse, 2, 5);
          ctx.fillRect(22, 3 + bob + haloPulse, 2, 5);
          ctx.fillStyle = isMartyr ? '#ECFDF5' : '#FEF08A';
          ctx.fillRect(15, -1 + bob + haloPulse, 2, 2);
          ctx.fillRect(7, 1 + bob + haloPulse, 2, 2);
          ctx.fillRect(23, 1 + bob + haloPulse, 2, 2);

          // Ceremonial Drape & Cape
          ctx.fillStyle = isMartyr ? '#065F46' : isTemplar ? '#7F1D1D' : '#78350F';
          ctx.fillRect(9, 12 + bob, 14, 14);
          ctx.fillStyle = isMartyr ? '#059669' : isTemplar ? '#B45309' : '#92400E';
          ctx.fillRect(10, 13 + bob, 12, 12);
        }

        if (isNovice) {
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(11, 11 + bob, 10, 15);
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(12, 12 + bob, 8, 13);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(11, 20 + bob, 10, 2);
          ctx.fillStyle = '#FDBA74';
          ctx.fillRect(12, 5 + bob, 8, 6);
          ctx.fillStyle = '#92400E';
          ctx.fillRect(11, 4 + bob, 10, 2);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(14, 8 + bob, 1, 1);
          ctx.fillRect(17, 8 + bob, 1, 1);
        } else {
          // Tabard / Surplice / Sanctum Plate
          ctx.fillStyle = isMartyr ? '#A7F3D0' : isTemplar ? '#475569' : '#F8FAFC';
          ctx.fillRect(11, 11 + bob, 10, 15);
          ctx.fillStyle = isMartyr ? '#ECFDF5' : isTemplar ? '#E2E8F0' : '#F1F5F9';
          ctx.fillRect(12, 12 + bob, 8, 13);
          if (isTemplar) {
            ctx.fillStyle = '#FACC15';
            ctx.fillRect(9, 11 + bob, 3, 4);
            ctx.fillRect(20, 11 + bob, 3, 4);
            if (animate) {
              ctx.fillStyle = 'rgba(253, 224, 71, 0.8)';
              ctx.fillRect(7, 11 + bob, 2, 3);
              ctx.fillRect(23, 11 + bob, 2, 3);
            }
          } else if (isMartyr) {
            ctx.fillStyle = '#34D399';
            ctx.fillRect(11, 11 + bob, 10, 3);
            if (animate) {
              const mY = Math.round((time * 0.01) % 5);
              ctx.fillStyle = '#6EE7B7';
              ctx.fillRect(9, 11 + bob - mY, 1, 1);
              ctx.fillRect(22, 12 + bob - ((mY + 2) % 5), 1, 1);
            }
          }
          ctx.fillStyle = isMartyr ? '#34D399' : '#F59E0B';
          ctx.fillRect(14, 13 + bob, 4, 4);
          ctx.fillStyle = '#FDE047';
          ctx.fillRect(15, 14 + bob, 2, 2);
          ctx.fillStyle = isMartyr ? '#10B981' : '#F59E0B';
          ctx.fillRect(13, 21 + bob, 6, 2);
          ctx.fillRect(15, 23 + bob, 2, 3);

          // Mitre
          ctx.fillStyle = isMartyr ? '#ECFDF5' : isTemplar ? '#94A3B8' : '#F8FAFC';
          ctx.fillRect(11, 4 + bob, 10, 7);
          ctx.fillStyle = isMartyr ? '#34D399' : '#FDE047';
          ctx.fillRect(11, 4 + bob, 10, 2);
          ctx.fillRect(15, 3 + bob, 2, 2);
          ctx.fillStyle = isMartyr ? '#FDE68A' : isTemplar ? '#CBD5E1' : '#FCD34D';
          ctx.fillRect(12, 7 + bob, 8, 3);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(14, 8 + bob, 1, 1);
          ctx.fillRect(17, 8 + bob, 1, 1);
        }

        // Equipped Cleric Weapon
        const maceTilt = animate ? 0.05 + Math.sin(time * 0.0042) * 0.1 : 0.06;
        ctx.save();
        ctx.translate(24, 21 + bob);
        ctx.rotate(maceTilt);
        if (weaponId === null) {
          ctx.fillStyle = '#FDE047';
          ctx.fillRect(-1, -2, 2, 2);
        } else if (weaponId === 'cleric_solaris_censer') {
          ctx.fillStyle = '#475569';
          ctx.fillRect(-1, -15, 2, 21);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-1, -16, 5, 2);
          ctx.fillStyle = '#D97706';
          ctx.fillRect(2, -14, 3, 5);
          ctx.fillStyle = '#34D399';
          ctx.fillRect(2, -13, 3, 3);
          ctx.fillStyle = '#ECFDF5';
          ctx.fillRect(3, -12, 1, 1);
          if (animate) {
            const iY = Math.round((time * 0.01) % 4);
            ctx.fillStyle = '#6EE7B7';
            ctx.fillRect(3, -17 - iY, 1, 1);
          }
        } else if (weaponId === 'cleric_seraphim_crozier') {
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(-1, -15, 2, 21);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-4, -14, 8, 2);
          ctx.fillStyle = '#FACC15';
          ctx.fillRect(-1, -19, 5, 2);
          ctx.fillRect(3, -18, 2, 4);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(1, -17, 2, 2);
        } else {
          ctx.fillStyle = '#64748B';
          ctx.fillRect(-1, -11, 2, 17);
          ctx.fillStyle = '#D97706';
          ctx.fillRect(-2, 1, 4, 3);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-3, -15, 6, 6);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-2, -14, 4, 4);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-1, -17, 2, 2);
          ctx.fillRect(-4, -13, 2, 2);
          ctx.fillRect(2, -13, 2, 2);
        }
        ctx.restore();

        // Swinging Holy Offhand (hidden when unarmed)
        if (weaponId !== null) {
          const censerSwing = animate ? Math.sin(time * 0.005) * 0.2 : 0;
          ctx.save();
          ctx.translate(7, 14 + bob);
          ctx.rotate(censerSwing);
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(-0.5, 0, 1, 3);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-2, 3, 4, 5);
          ctx.fillStyle =
            weaponId === 'cleric_solaris_censer'
              ? '#34D399'
              : weaponId === 'cleric_seraphim_crozier'
                ? '#FFFFFF'
                : '#FEF08A';
          ctx.fillRect(-1, 4, 2, 3);
          ctx.restore();
        }
        if (animate && weaponId !== null) {
          const sparkY = ((time * 0.008) % 6);
          ctx.fillStyle =
            weaponId === 'cleric_solaris_censer'
              ? 'rgba(52, 211, 153, 0.8)'
              : 'rgba(254, 240, 138, 0.7)';
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
  }, [heroClass, weaponId, vestmentId, animate]);

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
