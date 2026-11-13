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
    version: 'v1.5.0',
    releaseDate: 'November 12, 2026',
    title: 'Procedural Visual Effects Library Expansion',
    description:
      'Massive procedural visual effects library expansion adding 12 new pixel-art particle shapes, advanced motion patterns (spirals, orbits, waves, inward attraction), visual stretching and lifetime curves, and 16 reusable elemental building blocks across Fire, Ice, Lightning, Arcane, Holy, Void, Poison, and Physical impacts.',
    categories: {
      'NEW FEATURES': [
        '12 New Procedural Particle Shapes: Added Diamond, Triangle, Shard, Ring, Crescent, Cross, Rune, Hexagon, Starburst, Streak, Smoke, and Flame with crisp Canvas-based pixel alignment and zero external PNG dependencies.',
        '16 Reusable Elemental Building Blocks: Comprehensive procedural styles for Fire (bursts & flame puffs), Ice (shatters & frost rings), Lightning (discharge arcs & shock bursts), Arcane (spirals & rune bursts), Holy (radiance & cross gleams), Void (collapses & motes), Poison (clouds & caustic bubbles), and Physical impacts (shrapnel & shockwave rings).',
        'Complex Motion Patterns: Built-in physics support for inward gravitational attraction, lateral curve drift, spiral velocity, transverse wave oscillation, wandering drift, orbiting centers, and expanding/contracting rings.',
        'Enhanced Visual Properties: Velocity stretch alignment, custom scale and alpha curves (easeIn, easeOut, pulse), fade-in ratios, and localized flickering.',
      ],
      IMPROVEMENTS: [
        'Combat Readability & Feedback: Integrated physical impacts, shockwave rings, and distinct elemental responses into GameCanvas hit and boss ability handling.',
        'Zero-Asset Overhead: Every new shape and particle style is procedurally synthesized directly through Canvas without asset loading latency.',
        'High-Performance Mobile Compatibility: Preserved integer pixel snapping, capped glow blurs, object pool recycling, and priority-budget shedding.',
      ],
    },
  },
  {
    version: 'v1.4.0',
    releaseDate: 'November 12, 2026',
    title: 'Phase 1: Particle Engine Upgrade',
    description:
      'Major procedural particle engine upgrade featuring high-performance object pooling, priority-based particle budgeting, time-based projectile wake emission, and extended physics and visual properties while preserving backward compatibility and pixel-art alignment.',
    categories: {
      'NEW FEATURES': [
        'Particle Object Pooling: High-throughput memory pool reuses expired particles with complete property resets, eliminating GC spikes during intense boss fights and mob swarms.',
        'Priority Particle Budget: Dynamic 4-tier budget (Low, Normal, High, Critical) protecting critical combat feedback, boss telegraphs, and death bursts under heavy load while automatically shedding ambient motes.',
        'Extended Particle Dynamics: Support for rotation, angular velocity, initial/final scaling, acceleration, drag, custom alpha curves, color transitions, and configurable blend modes.',
      ],
      IMPROVEMENTS: [
        'Time-Based Projectile Trails: Rate-limited projectile wake emission (28ms cadence) replacing random frame-based chances for rock-solid trail density across 30 FPS, 60 FPS, and high-refresh-rate monitors.',
        'Inactive Projectile Cleanup: Stale projectile tracking is automatically pruned upon projectile destruction to prevent memory leakage.',
        'Zero-Allocation Canvas Render Loop: In-place array compaction during particle updates completely removes splice and array reallocations.',
        'Pixel Alignment & Capped Glow: Integer pixel coordinates and capped shadowBlur preserve crisp retro pixel-art visuals with minimal GPU overhead.',
      ],
      'BUG FIXES': [
        'Trailing Memory Cleanup: Fixed potential memory leaks in projectile trails by providing active projectile id synchronization.',
      ],
    },
  },
  {
    version: 'v1.3.0',
    releaseDate: 'November 11, 2026',
    title: 'Status Effects & Engine Integrity Overhaul',
    description:
      'Complete overhaul of all 19 status effects (10 Guardian Boss Afflictions & 9 Combat Afflictions), Unified Codex grid display, server-authoritative ability suppression, and snapshot array safeguards for projectile collisions, Freeze Shatter AoEs, and Chain Lightning arcs.',
    categories: {
      'NEW FEATURES': [
        'CombatEffects Component: Created a dedicated CombatEffects React component consuming the extracted SlashFX sprite sheets, triggered upon successful enemy hits to provide animated hit feedback for Vanguard.',
        'SlashFX Sprite Sheets: Extracted and integrated custom multi-frame animated slash sprite sheets (SlashFX SimpleCombo & Combo1) from archive for Vanguard cleaves and critical attacks.',
        'Status Effect Codex Grid: Reorganized Status Effect Codex into sleek, high-contrast cards matching the Ancient Relics Codex 1:1 with icon slots, duration badges, and detailed combat mechanics.',
        'Charmed Mechanics: Charmed players experience an ethereal siren pull toward the source, -35% damage penalty, and damage threshold break condition (breaks on >= 20 damage taken).',
        'Silenced Ability Lock: Server-authoritative suppression for Tactical and Ultimate skills with visual lock indicators, preserving basic attacks, movement, and evasion dash.',
      ],
      IMPROVEMENTS: [
        'Vanguard Melee Cleave: Refined Vanguard primary attack into a heavy close-range claymore cleave (85px melee engagement range, 34px cleave radius), replacing the long-distance flying wave.',
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
