/**
 * Beyond — Centralized Changelog & Update History Data
 *
 * Data-driven structure for all game updates, patches, and releases.
 * The newest update must always appear first in the array.
 *
 * Supported change categories:
 * - NEW FEATURES
 * - IMPROVEMENTS
 * - BALANCING
 * - BUG FIXES
 * - QUALITY OF LIFE
 */

export type ChangelogCategory =
  | 'NEW FEATURES'
  | 'IMPROVEMENTS'
  | 'BALANCING'
  | 'BUG FIXES'
  | 'QUALITY OF LIFE';

export interface ChangelogEntry {
  version: string;
  releaseDate: string;
  title: string;
  description: string;
  categories: Partial<Record<ChangelogCategory, string[]>>;
}

export interface CategoryBadgeStyle {
  label: ChangelogCategory;
  bg: string;
  border: string;
  text: string;
  glow: string;
}

export const CATEGORY_STYLES: Record<ChangelogCategory, CategoryBadgeStyle> = {
  'NEW FEATURES': {
    label: 'NEW FEATURES',
    bg: 'bg-[#143826]',
    border: 'border-[#22C55E]',
    text: 'text-[#86EFAC]',
    glow: 'shadow-[0_0_8px_rgba(34,197,94,0.25)]',
  },
  'IMPROVEMENTS': {
    label: 'IMPROVEMENTS',
    bg: 'bg-[#172554]',
    border: 'border-[#38BDF8]',
    text: 'text-[#BAE6FD]',
    glow: 'shadow-[0_0_8px_rgba(56,189,248,0.25)]',
  },
  'BALANCING': {
    label: 'BALANCING',
    bg: 'bg-[#3B2512]',
    border: 'border-[#F59E0B]',
    text: 'text-[#FDE68A]',
    glow: 'shadow-[0_0_8px_rgba(245,158,11,0.25)]',
  },
  'BUG FIXES': {
    label: 'BUG FIXES',
    bg: 'bg-[#3A181C]',
    border: 'border-[#EF4444]',
    text: 'text-[#FECACA]',
    glow: 'shadow-[0_0_8px_rgba(239,68,68,0.25)]',
  },
  'QUALITY OF LIFE': {
    label: 'QUALITY OF LIFE',
    bg: 'bg-[#2E1065]',
    border: 'border-[#A855F7]',
    text: 'text-[#E9D5FF]',
    glow: 'shadow-[0_0_8px_rgba(168,85,247,0.25)]',
  },
};

/**
 * Standard category display order for consistent visual hierarchy.
 */
export const CATEGORY_ORDER: ChangelogCategory[] = [
  'NEW FEATURES',
  'IMPROVEMENTS',
  'BALANCING',
  'BUG FIXES',
  'QUALITY OF LIFE',
];

export const CHANGELOG_DATA: ChangelogEntry[] = [
  {
    version: 'v1.3.0',
    releaseDate: 'November 11, 2026',
    title: 'Status Effects & Engine Integrity Overhaul',
    description:
      'Complete overhaul of all 19 status effects (10 Guardian Boss Afflictions & 9 Combat Afflictions), Unified Codex grid display, server-authoritative ability suppression, and snapshot array safeguards for projectile collisions, Freeze Shatter AoEs, and Chain Lightning arcs.',
    categories: {
      'NEW FEATURES': [
        'Status Effect Codex Grid: Reorganized Status Effect Codex into sleek, high-contrast cards matching the Ancient Relics Codex 1:1 with icon slots, duration badges, and detailed combat mechanics.',
        'Charmed Mechanics: Charmed players experience an ethereal siren pull toward the source, -35% damage penalty, and damage threshold break condition (breaks on >= 20 damage taken).',
        'Silenced Ability Lock: Server-authoritative suppression for Tactical and Ultimate skills with visual lock indicators, preserving basic attacks, movement, and evasion dash.',
      ],
      IMPROVEMENTS: [
        'Poison Damage Reduction: Applied 30% outgoing damage mitigation consistently across enemy melee attacks, ranged projectiles, and floor hazard zones.',
        'Clean Codex Display: Removed floor number prefixes from status entries for clean information hierarchy.',
      ],
      'BUG FIXES': [
        'Snapshot Array Safety: Resolved production server crash (TypeError: Cannot read properties of undefined (reading \'id\')) by using snapshot array iterations across projectile collisions, Freeze Shatter AoE waves, and Shock Chain Lightning arcs.',
        'Duplicate Reward Prevention: Verified strict single-execution guarantees for XP, kill counts, gold, and potion drops during simultaneous multi-target deaths.',
      ],
    },
  },
  {
    version: 'v1.2.0',
    releaseDate: 'November 10, 2026',
    title: 'Fallen Spirits & Vault Expansion',
    description:
      'Introduces visual fallen and ethereal ghost animations during co-op combat with tactical revive beacons, permanent relic storage vault in the sanctuary, relic dismantling for gold, and restored character stat refinement.',
    categories: {
      'NEW FEATURES': [
        'Ethereal Ghost & Fallen State: Visual soul spirit and fallen hero sprites when reaching 0 HP with 52px revive sonar beacon and active revival beam.',
        'Relic Storage Vault: Store up to 12 excess relics in the sanctuary vault and retrieve them across dungeon expeditions.',
      ],
      IMPROVEMENTS: [
        'Co-op Revive HUD: Real-time bleedout countdown and animated percentage gauge for reviving teammates.',
        'Relic Dismantling: Break down unwanted relics for +40 gold and safely discard excess potions.',
      ],
      'BUG FIXES': [
        'Aleph Stat Reset: Restored interaction range (110px) and fixed dialogue box visibility in the Tavern.',
        'Itch.io Web Compatibility: Configured relative asset paths and CORS origin headers for embedded canvas hosting.',
      ],
    },
  },
  {
    version: 'v1.1.0',
    releaseDate: 'November 8, 2026',
    title: 'Sanctuary of the Departed',
    description:
      'Unveils Floors 6 through 10 with 5 new guardian bosses, elite sanctuary enemies, and Chapter 1 victory progression.',
    categories: {
      'NEW FEATURES': [
        '5 Guardian Bosses: Elyndor (Hymns), Zadkiel (Ashen Reliquary), Sariel (Veiled Scripture), Seraphel (Final Seal), and Oriphiel (The Last Warden).',
        'Sanctuary Biome: Distinctive cathedral gothic stone environment across floors 6-10 with unique floor hazard zones.',
        'Warden’s Gate: Chapter 1 portal interaction triggering expedition victory.',
      ],
      BALANCING: [
        'Faith Scaling: Authoritative server damage and healing scaling for Cleric Dawnstar Smite and Radiant Aura.',
        'Tenacity Window: Guaranteed 400ms interrupt window for boss crowd control.',
      ],
      'QUALITY OF LIFE': [
        'Dynamic Boss Room Scaling: Boss arenas generated larger than standard dungeon chambers for fluid team combat.',
      ],
    },
  },
  {
    version: 'v1.0.0',
    releaseDate: 'November 1, 2026',
    title: 'Beyond: Chapter 1 Launch',
    description:
      'Initial public release of Beyond — a dark fantasy co-op roguelike RPG with procedural dungeons and distinct hero classes.',
    categories: {
      'NEW FEATURES': [
        '4 Distinct Hero Classes: Vanguard (Bastion Knight), Ranger (Keen Hunter), Arcanist (Astral Mage), and Cleric (Dawnbound Healer).',
        'Multiplayer Co-Op: Real-time WebSocket synchronization with server-authoritative combat and revives.',
        'Relic Synergies: Over 20 stackable ancient artifacts with passives and projectile modifiers.',
        'The Rusty Tankard: Social hub tavern with equipment management, training dummy, and NPC dialogue.',
      ],
      'QUALITY OF LIFE': [
        'Responsive Controls: Full keyboard (WASD/Mouse) and mobile touch controller support.',
        'JetBrains Mono HUD: Crisp pixel-art monospace layout with high-contrast health, ability cooldowns, and status gauges.',
      ],
    },
  },
];
