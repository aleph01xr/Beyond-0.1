import React from 'react';
import type { ArmamentSlot } from '../shared/armaments.ts';

interface ArmamentIconProps {
  itemId?: string | null;
  slot: ArmamentSlot;
  size?: number;
  className?: string;
}

/**
 * Crisp pixel-art SVG icon renderer for all 12 Permanent Weapons, 12 Vestments,
 * and empty/unarmed slot states.
 */
export const ArmamentIcon: React.FC<ArmamentIconProps> = ({
  itemId,
  slot,
  size = 32,
  className = '',
}) => {
  const renderArtwork = () => {
    if (!itemId) {
      if (slot === 'weapon') {
        return (
          <>
            <rect x="7" y="10" width="10" height="8" fill="#334155" />
            <rect x="8" y="8" width="2" height="3" fill="#64748B" />
            <rect x="11" y="7" width="2" height="4" fill="#64748B" />
            <rect x="14" y="8" width="2" height="3" fill="#64748B" />
            <rect x="7" y="16" width="10" height="2" fill="#475569" />
          </>
        );
      }
      return (
        <>
          <rect x="7" y="7" width="10" height="12" fill="#1E293B" />
          <rect x="9" y="8" width="6" height="9" fill="#334155" />
          <rect x="10" y="7" width="4" height="2" fill="#0F172A" />
        </>
      );
    }

    // ================= WEAPONS =================
    switch (itemId) {
      case 'vanguard_sunforged_claymore':
        return (
          <>
            {/* Diagonal Greatsword + Tower Shield silhouette */}
            <rect x="16" y="3" width="4" height="4" fill="#E2E8F0" />
            <rect x="14" y="5" width="4" height="4" fill="#FFFFFF" />
            <rect x="12" y="7" width="4" height="4" fill="#CBD5E1" />
            <rect x="10" y="9" width="4" height="4" fill="#E2E8F0" />
            <rect x="8" y="11" width="4" height="4" fill="#94A3B8" />
            <rect x="5" y="12" width="7" height="2" fill="#F59E0B" />
            <rect x="7" y="14" width="2" height="5" fill="#78350F" />
            <rect x="5" y="18" width="3" height="3" fill="#FBBF24" />
            {/* Mini Sunforged Shield */}
            <rect x="14" y="12" width="7" height="9" fill="#475569" />
            <rect x="15" y="13" width="5" height="7" fill="#94A3B8" />
            <rect x="16" y="15" width="3" height="3" fill="#F59E0B" />
          </>
        );

      case 'vanguard_crimson_halberd':
        return (
          <>
            {/* Crimson polearm shaft */}
            <rect x="10" y="6" width="2" height="15" fill="#991B1B" />
            <rect x="11" y="6" width="1" height="14" fill="#EF4444" />
            <rect x="9" y="9" width="4" height="2" fill="#F59E0B" />
            {/* Top Spear Spike */}
            <rect x="10" y="2" width="2" height="4" fill="#CBD5E1" />
            <rect x="11" y="2" width="1" height="3" fill="#FFFFFF" />
            {/* Crescent Axe Head */}
            <rect x="12" y="4" width="5" height="7" fill="#475569" />
            <rect x="13" y="5" width="3" height="5" fill="#EF4444" />
            <rect x="16" y="3" width="2" height="9" fill="#F8FAFC" />
            <rect x="18" y="5" width="1" height="5" fill="#FFFFFF" />
            {/* Rear Fluke */}
            <rect x="7" y="6" width="3" height="2" fill="#CBD5E1" />
          </>
        );

      case 'vanguard_stormbreaker_flail':
        return (
          <>
            {/* Handle */}
            <rect x="6" y="14" width="3" height="7" fill="#334155" />
            <rect x="5" y="13" width="5" height="2" fill="#F59E0B" />
            {/* Chain links */}
            <rect x="7" y="10" width="2" height="3" fill="#CBD5E1" />
            <rect x="9" y="8" width="2" height="2" fill="#94A3B8" />
            {/* Spiked Lightning Ball */}
            <rect x="11" y="5" width="8" height="8" fill="#0F172A" />
            <rect x="12" y="6" width="6" height="6" fill="#0284C7" />
            <rect x="13" y="7" width="4" height="4" fill="#38BDF8" />
            <rect x="14" y="8" width="2" height="2" fill="#FFFFFF" />
            {/* Gold Spikes */}
            <rect x="14" y="3" width="2" height="2" fill="#FBBF24" />
            <rect x="19" y="8" width="2" height="2" fill="#FBBF24" />
            <rect x="14" y="13" width="2" height="2" fill="#FBBF24" />
            <rect x="9" y="8" width="2" height="2" fill="#FBBF24" />
          </>
        );

      case 'ranger_ashwood_recurve':
        return (
          <>
            {/* Curved Ashwood Bow */}
            <rect x="12" y="3" width="3" height="3" fill="#78350F" />
            <rect x="14" y="5" width="3" height="4" fill="#92400E" />
            <rect x="15" y="9" width="3" height="6" fill="#B45309" />
            <rect x="15" y="11" width="3" height="2" fill="#D97706" />
            <rect x="14" y="15" width="3" height="4" fill="#92400E" />
            <rect x="12" y="18" width="3" height="3" fill="#78350F" />
            {/* Bowstring */}
            <rect x="11" y="4" width="1" height="16" fill="#E2E8F0" />
            {/* Emerald-fletched Arrow */}
            <rect x="6" y="11" width="12" height="2" fill="#A16207" />
            <rect x="17" y="10" width="3" height="4" fill="#34D399" />
            <rect x="19" y="11" width="2" height="2" fill="#FFFFFF" />
            <rect x="5" y="10" width="2" height="1" fill="#34D399" />
            <rect x="5" y="13" width="2" height="1" fill="#34D399" />
          </>
        );

      case 'ranger_galewind_twinbow':
        return (
          <>
            {/* Dual Composite Limbs */}
            <rect x="12" y="3" width="3" height="4" fill="#0E7490" />
            <rect x="14" y="6" width="3" height="12" fill="#22D3EE" />
            <rect x="16" y="5" width="2" height="5" fill="#38BDF8" />
            <rect x="16" y="14" width="2" height="5" fill="#38BDF8" />
            <rect x="12" y="17" width="3" height="4" fill="#0E7490" />
            {/* String */}
            <rect x="11" y="4" width="1" height="16" fill="#BAE6FD" />
            {/* Paired Twin Wind Shafts */}
            <rect x="5" y="9" width="12" height="2" fill="#BAE6FD" />
            <rect x="5" y="13" width="12" height="2" fill="#BAE6FD" />
            <rect x="16" y="8" width="3" height="3" fill="#38BDF8" />
            <rect x="16" y="13" width="3" height="3" fill="#38BDF8" />
            <rect x="19" y="9" width="1" height="1" fill="#FFFFFF" />
            <rect x="19" y="14" width="1" height="1" fill="#FFFFFF" />
          </>
        );

      case 'ranger_eclipse_longbow':
        return (
          <>
            {/* Tall Obsidian & Violet Siege Longbow */}
            <rect x="12" y="2" width="3" height="4" fill="#312E81" />
            <rect x="14" y="5" width="3" height="14" fill="#7C3AED" />
            <rect x="15" y="10" width="3" height="4" fill="#FBBF24" />
            <rect x="11" y="2" width="2" height="2" fill="#FBBF24" />
            <rect x="11" y="20" width="2" height="2" fill="#FBBF24" />
            <rect x="12" y="18" width="3" height="4" fill="#312E81" />
            {/* String */}
            <rect x="10" y="3" width="1" height="18" fill="#EDE9FE" />
            {/* Heavy Bodkin Arrow */}
            <rect x="5" y="11" width="13" height="2" fill="#A855F7" />
            <rect x="17" y="9" width="3" height="6" fill="#FBBF24" />
            <rect x="19" y="11" width="2" height="2" fill="#FFFFFF" />
          </>
        );

      case 'arcanist_runebound_spire':
        return (
          <>
            <rect x="11" y="9" width="2" height="13" fill="#581C87" />
            <rect x="11" y="9" width="1" height="12" fill="#A855F7" />
            <rect x="9" y="8" width="6" height="2" fill="#F59E0B" />
            <rect x="8" y="4" width="2" height="4" fill="#FBBF24" />
            <rect x="14" y="4" width="2" height="4" fill="#FBBF24" />
            <rect x="10" y="3" width="4" height="4" fill="#38BDF8" />
            <rect x="11" y="4" width="2" height="2" fill="#FFFFFF" />
          </>
        );

      case 'arcanist_cinderflare_rod':
        return (
          <>
            <rect x="11" y="10" width="2" height="12" fill="#27272A" />
            <rect x="12" y="10" width="1" height="11" fill="#EA580C" />
            <rect x="8" y="9" width="8" height="2" fill="#D97706" />
            <rect x="7" y="6" width="2" height="4" fill="#F59E0B" />
            <rect x="15" y="6" width="2" height="4" fill="#F59E0B" />
            <rect x="9" y="4" width="6" height="5" fill="#EA580C" />
            <rect x="10" y="3" width="4" height="5" fill="#FB923C" />
            <rect x="11" y="4" width="2" height="3" fill="#FEF08A" />
          </>
        );

      case 'arcanist_chronostar_scepter':
        return (
          <>
            <rect x="11" y="10" width="2" height="12" fill="#312E81" />
            <rect x="11" y="10" width="1" height="11" fill="#E2E8F0" />
            <rect x="9" y="9" width="6" height="2" fill="#FBBF24" />
            {/* Astrolabe Ring */}
            <rect x="8" y="2" width="8" height="7" fill="#FBBF24" />
            <rect x="9" y="3" width="6" height="5" fill="#1E1B4B" />
            <rect x="10" y="4" width="4" height="3" fill="#38BDF8" />
            <rect x="11" y="5" width="2" height="1" fill="#FFFFFF" />
            <rect x="6" y="5" width="2" height="2" fill="#FDE047" />
            <rect x="16" y="5" width="2" height="2" fill="#38BDF8" />
          </>
        );

      case 'cleric_dawnstar_mace':
        return (
          <>
            <rect x="11" y="10" width="2" height="11" fill="#64748B" />
            <rect x="11" y="17" width="2" height="4" fill="#78350F" />
            <rect x="8" y="4" width="8" height="7" fill="#D97706" />
            <rect x="9" y="5" width="6" height="5" fill="#FEF08A" />
            <rect x="11" y="2" width="2" height="2" fill="#F59E0B" />
            <rect x="6" y="7" width="2" height="2" fill="#F59E0B" />
            <rect x="16" y="7" width="2" height="2" fill="#F59E0B" />
            <rect x="11" y="7" width="2" height="2" fill="#FFFFFF" />
          </>
        );

      case 'cleric_solaris_censer':
        return (
          <>
            {/* Staff & Crook */}
            <rect x="8" y="6" width="2" height="15" fill="#475569" />
            <rect x="8" y="17" width="2" height="4" fill="#D97706" />
            <rect x="8" y="4" width="8" height="2" fill="#F59E0B" />
            <rect x="14" y="6" width="2" height="3" fill="#94A3B8" />
            {/* Swinging Emerald-Gold Thurible */}
            <rect x="12" y="9" width="6" height="7" fill="#D97706" />
            <rect x="13" y="10" width="4" height="5" fill="#34D399" />
            <rect x="14" y="11" width="2" height="2" fill="#ECFDF5" />
            <rect x="14" y="16" width="2" height="2" fill="#FACC15" />
          </>
        );

      case 'cleric_seraphim_crozier':
        return (
          <>
            <rect x="10" y="8" width="2" height="14" fill="#E2E8F0" />
            <rect x="9" y="17" width="4" height="5" fill="#F59E0B" />
            {/* Angel Wings */}
            <rect x="5" y="9" width="5" height="2" fill="#FEF08A" />
            <rect x="12" y="9" width="5" height="2" fill="#FEF08A" />
            <rect x="6" y="11" width="3" height="2" fill="#F59E0B" />
            <rect x="13" y="11" width="3" height="2" fill="#F59E0B" />
            {/* Shepherd's Crook */}
            <rect x="10" y="3" width="2" height="6" fill="#FACC15" />
            <rect x="10" y="2" width="7" height="2" fill="#FACC15" />
            <rect x="15" y="4" width="2" height="4" fill="#FACC15" />
            <rect x="13" y="6" width="3" height="2" fill="#F59E0B" />
            {/* Sun Orb */}
            <rect x="12" y="4" width="2" height="2" fill="#FFFFFF" />
          </>
        );

      // ================= VESTMENTS =================
      case 'vanguard_ironcrest_plate':
        return (
          <>
            <rect x="6" y="5" width="12" height="14" fill="#334155" />
            <rect x="7" y="6" width="10" height="11" fill="#64748B" />
            <rect x="5" y="5" width="3" height="4" fill="#94A3B8" />
            <rect x="16" y="5" width="3" height="4" fill="#94A3B8" />
            <rect x="11" y="7" width="2" height="9" fill="#F59E0B" />
            <rect x="9" y="9" width="6" height="2" fill="#F59E0B" />
          </>
        );

      case 'vanguard_obsidian_juggernaut':
        return (
          <>
            <rect x="5" y="5" width="14" height="15" fill="#0F172A" />
            <rect x="6" y="6" width="12" height="12" fill="#1E293B" />
            <rect x="4" y="4" width="4" height="5" fill="#475569" />
            <rect x="16" y="4" width="4" height="5" fill="#475569" />
            <rect x="8" y="8" width="8" height="2" fill="#CBD5E1" />
            <rect x="9" y="12" width="6" height="3" fill="#475569" />
            <rect x="11" y="11" width="2" height="6" fill="#94A3B8" />
          </>
        );

      case 'vanguard_aegis_sovereign_mail':
        return (
          <>
            <rect x="6" y="5" width="12" height="14" fill="#7F1D1D" />
            <rect x="7" y="6" width="10" height="11" fill="#B45309" />
            <rect x="5" y="4" width="4" height="4" fill="#F59E0B" />
            <rect x="15" y="4" width="4" height="4" fill="#F59E0B" />
            <rect x="9" y="8" width="6" height="7" fill="#FBBF24" />
            <rect x="11" y="9" width="2" height="4" fill="#FEF08A" />
          </>
        );

      case 'ranger_thornwood_brigandine':
        return (
          <>
            <rect x="7" y="5" width="10" height="14" fill="#1E3A29" />
            <rect x="8" y="6" width="8" height="11" fill="#2D5A3C" />
            <rect x="8" y="10" width="8" height="2" fill="#78350F" />
            <rect x="11" y="7" width="2" height="3" fill="#4ADE80" />
            <rect x="6" y="6" width="2" height="8" fill="#142E1F" />
            <rect x="16" y="6" width="2" height="8" fill="#142E1F" />
          </>
        );

      case 'ranger_windrunner_mantle':
        return (
          <>
            <rect x="6" y="5" width="12" height="14" fill="#0F172A" />
            <rect x="7" y="6" width="10" height="11" fill="#0E7490" />
            <rect x="5" y="5" width="4" height="4" fill="#38BDF8" />
            <rect x="15" y="5" width="4" height="4" fill="#38BDF8" />
            <rect x="10" y="8" width="4" height="7" fill="#BAE6FD" />
            <rect x="11" y="9" width="2" height="4" fill="#FFFFFF" />
          </>
        );

      case 'ranger_briarheart_leather':
        return (
          <>
            <rect x="7" y="5" width="10" height="14" fill="#064E3B" />
            <rect x="8" y="6" width="8" height="11" fill="#059669" />
            <rect x="8" y="8" width="8" height="2" fill="#78350F" />
            <rect x="10" y="9" width="4" height="4" fill="#34D399" />
            <rect x="11" y="10" width="2" height="2" fill="#ECFDF5" />
          </>
        );

      case 'arcanist_astral_vestments':
        return (
          <>
            <rect x="6" y="5" width="12" height="15" fill="#1E1B4B" />
            <rect x="7" y="6" width="10" height="13" fill="#312E81" />
            <rect x="9" y="7" width="6" height="10" fill="#4338CA" />
            <rect x="10" y="9" width="4" height="2" fill="#38BDF8" />
            <rect x="11" y="11" width="2" height="4" fill="#818CF8" />
          </>
        );

      case 'arcanist_chronomancer_shroud':
        return (
          <>
            <rect x="6" y="5" width="12" height="15" fill="#0F172A" />
            <rect x="7" y="6" width="10" height="13" fill="#1E3A8A" />
            <rect x="6" y="5" width="12" height="3" fill="#38BDF8" />
            <rect x="10" y="9" width="4" height="4" fill="#FBBF24" />
            <rect x="11" y="10" width="2" height="2" fill="#E0F2FE" />
          </>
        );

      case 'arcanist_voidward_robes':
        return (
          <>
            <rect x="6" y="5" width="12" height="15" fill="#3B0764" />
            <rect x="7" y="6" width="10" height="13" fill="#581C87" />
            <rect x="5" y="5" width="4" height="4" fill="#A855F7" />
            <rect x="15" y="5" width="4" height="4" fill="#A855F7" />
            <rect x="10" y="9" width="4" height="5" fill="#C084FC" />
            <rect x="11" y="10" width="2" height="3" fill="#FFFFFF" />
          </>
        );

      case 'cleric_prelate_raiment':
        return (
          <>
            <rect x="6" y="5" width="12" height="15" fill="#E2E8F0" />
            <rect x="7" y="6" width="10" height="13" fill="#F8FAFC" />
            <rect x="8" y="6" width="2" height="12" fill="#B45309" />
            <rect x="14" y="6" width="2" height="12" fill="#B45309" />
            <rect x="10" y="9" width="4" height="4" fill="#FACC15" />
          </>
        );

      case 'cleric_martyr_surplice':
        return (
          <>
            <rect x="6" y="5" width="12" height="15" fill="#ECFDF5" />
            <rect x="7" y="6" width="10" height="13" fill="#F8FAFC" />
            <rect x="8" y="6" width="8" height="3" fill="#34D399" />
            <rect x="11" y="9" width="2" height="7" fill="#F59E0B" />
            <rect x="9" y="11" width="6" height="2" fill="#F59E0B" />
          </>
        );

      case 'cleric_templar_cassock':
        return (
          <>
            <rect x="5" y="5" width="14" height="15" fill="#475569" />
            <rect x="6" y="6" width="12" height="13" fill="#E2E8F0" />
            <rect x="4" y="4" width="4" height="4" fill="#FACC15" />
            <rect x="16" y="4" width="4" height="4" fill="#FACC15" />
            <rect x="10" y="8" width="4" height="7" fill="#F59E0B" />
            <rect x="11" y="9" width="2" height="4" fill="#FEF08A" />
          </>
        );

      default:
        return (
          <>
            <rect x="8" y="8" width="8" height="8" fill="#64748B" />
            <rect x="10" y="10" width="4" height="4" fill="#CBD5E1" />
          </>
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {renderArtwork()}
    </svg>
  );
};
