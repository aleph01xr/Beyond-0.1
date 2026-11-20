import {
  HERO_CLASSES,
  type AccountRecord,
  type HeroClassId,
} from './types.ts';

export type ArmamentSlot = 'weapon' | 'vestment';
export type ArmamentRarity = 'Standard' | 'Forged' | 'Ascendant';

export interface WeaponModifiers {
  /** Multiplicative damage scaling applied to class primary/ability damage (default 1.0) */
  damageMult?: number;
  /** Multiplicative attack cadence speed (e.g. 1.12 = 12% faster attacks, default 1.0) */
  attackSpeedMult?: number;
  /** Additive critical hit chance (e.g. 0.04 = +4%) */
  critChanceBonus?: number;
  /** Additive critical damage multiplier (e.g. 0.10 = +10% crit multiplier) */
  critMultBonus?: number;
  /** Additional targets pierced per primary projectile */
  bonusPierce?: number;
  /** Multiplier applied to primary projectile velocity */
  projectileSpeedMult?: number;
  /** Extra melee cleave radius or projectile reach in world px */
  rangeBonusPx?: number;
  /** Shield restored when a primary attack hits a target */
  shieldOnPrimaryHit?: number;
  /** Bonus Shield restored when Dawnstar Mace strikes Undead, Cultists, or Bosses */
  undeadBonusShieldOnHit?: number;
  /** Multiplicative bonus to healing output (e.g. 0.14 = +14% healing) */
  healingBonusPct?: number;
  /** Bonus damage multiplier vs Undead, Cultists & Bosses (e.g. 0.20 = +20%) */
  undeadBossBonusPct?: number;
  /** Additional Ranger Longshot bonus at >= 180u */
  longshotBonusPct?: number;
  /** Bonus Star Rift zone damage multiplier (e.g. 0.15 = +15%) */
  starRiftBonusDamagePct?: number;
  /** Chance on primary hit to inflict Burn (0..1) */
  burnChance?: number;
  /** Chance on primary hit to Chill/slow enemy (0..1) */
  chillChance?: number;
  /** Chance on primary hit to Shock enemy (0..1) */
  shockChance?: number;
  /** Chance on primary hit to inflict Bleed (0..1) */
  bleedChance?: number;
  /** Sunforged Claymore: bonus cleave damage while Shield > 0 */
  shieldedBonusDmgPct?: number;
  /** Crimson Halberd: outer-reach tipper threshold in px and bonus damage pct */
  tipperReachPx?: number;
  tipperBonusPct?: number;
  /** Stormbreaker Flail: instant Chain Lightning arc to nearby enemies on hit */
  chainLightningTargets?: number;
  chainLightningDmgRatio?: number;
  chainLightningRangePx?: number;
  /** Ashwood Recurve: bonus arrow damage against Slowed, Poisoned, or Frozen foes */
  impairedTargetBonusPct?: number;
  /** Galewind Twinbow: sequential straight follow-up burst shot (delayMs & dmg ratio) + knockback + crit haste */
  followUpDelayMs?: number;
  followUpDamageRatio?: number;
  followUpKnockbackPx?: number;
  critHasteMs?: number;
  /** Eclipse Longbow: escalating bonus damage per pierced enemy */
  pierceEscalationPct?: number;
  /** Runebound Spire: bonus bolt damage while an owned Star Rift is active */
  activeRiftBonusPct?: number;
  /** Cinderflare Rod: Ember Splash AoE detonation on primary hit */
  emberSplashRadiusPx?: number;
  emberSplashRatio?: number;
  /** Chronostar Scepter: wide mid-flight proximity seeking & cooldown siphon on hit */
  seekingRadiusPx?: number;
  tacticalSiphonMs?: number;
  ultSiphonMs?: number;
  /** Solaris Censer: heals lowest-HP ally within range on primary bolt hit */
  allyHealOnHitBase?: number;
  allyHealOnHitRangePx?: number;
  /** Seraphim Crozier: brands hit enemies (+35% party damage taken) */
  brandMarkChance?: number;
  brandDurationMs?: number;
}

export interface VestmentModifiers {
  /** Flat bonus to Maximum HP */
  maxHpBonus?: number;
  /** Additive physical damage resistance (e.g. 0.05 = +5%) */
  physicalResistBonus?: number;
  /** Additive elemental/magic damage resistance (e.g. 0.05 = +5%) */
  elementalResistBonus?: number;
  /** Multiplicative incoming damage reduction factor (e.g. 0.94 = -6% incoming damage) */
  damageTakenMult?: number;
  /** Multiplicative movement speed multiplier (e.g. 1.06 = +6% speed) */
  moveSpeedMult?: number;
  /** Additive cooldown reduction (e.g. 0.08 = +8% CDR) */
  cdrBonus?: number;
  /** Bonus HP regenerated per 2.0s combat pulse */
  hpRegenPerTickBonus?: number;
  /** Additive crowd-control duration reduction (e.g. 0.12 = +12%) */
  ccTenacityBonus?: number;
  /** Additive ally revive speed multiplier (e.g. 0.20 = +20% faster revive) */
  reviveSpeedBonus?: number;
  /** Multiplicative bonus to Cleric Aura & Kit healing (e.g. 0.15 = +15%) */
  auraHealBonusPct?: number;
  /** Flat increase to Maximum Shield cap (base 60) */
  maxShieldBonus?: number;
  /** Bonus starting Shield at expedition start */
  startingShieldBonus?: number;
}

export interface WeaponDef {
  id: string;
  slot: 'weapon';
  heroClass: HeroClassId;
  name: string;
  rarity: ArmamentRarity;
  archetype: string;
  summary: string;
  effectLines: string[];
  unlockHint: string;
  isDefault?: boolean;
  accent: string;
  modifiers: WeaponModifiers;
}

export interface VestmentDef {
  id: string;
  slot: 'vestment';
  heroClass: HeroClassId;
  name: string;
  rarity: ArmamentRarity;
  archetype: string;
  summary: string;
  effectLines: string[];
  unlockHint: string;
  isDefault?: boolean;
  accent: string;
  modifiers: VestmentModifiers;
}

export type ArmamentDef = WeaponDef | VestmentDef;

export const DEFAULT_WEAPON_BY_CLASS: Record<HeroClassId, string> = {
  vanguard: 'vanguard_sunforged_claymore',
  ranger: 'ranger_ashwood_recurve',
  arcanist: 'arcanist_runebound_spire',
  cleric: 'cleric_dawnstar_mace',
};

export const DEFAULT_VESTMENT_BY_CLASS: Record<HeroClassId, string> = {
  vanguard: 'vanguard_ironcrest_plate',
  ranger: 'ranger_thornwood_brigandine',
  arcanist: 'arcanist_astral_vestments',
  cleric: 'cleric_prelate_raiment',
};

export const WEAPON_CATALOG: readonly WeaponDef[] = [
  // ================= VANGUARD WEAPONS =================
  {
    id: 'vanguard_sunforged_claymore',
    slot: 'weapon',
    heroClass: 'vanguard',
    name: HERO_CLASSES.vanguard.weapon,
    rarity: 'Standard',
    archetype: 'Shield-Empowered Greatsword',
    summary: 'Signature Vanguard greatsword paired with a heavy tower shield for stalwart counter-cleaves.',
    effectLines: [
      '+10px primary cleave reach & +3% Critical Chance',
      'Guard-Edge: +12% cleave damage while you hold Shield',
      'Restores +2 Shield when primary cleave hits a foe',
    ],
    unlockHint: 'Starter Vanguard armament',
    isDefault: true,
    accent: '#F59E0B',
    modifiers: {
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      critChanceBonus: 0.03,
      rangeBonusPx: 10,
      shieldOnPrimaryHit: 2,
      shieldedBonusDmgPct: 0.12,
    },
  },
  {
    id: 'vanguard_crimson_halberd',
    slot: 'weapon',
    heroClass: 'vanguard',
    name: 'Crimson War Halberd & Buckler',
    rarity: 'Forged',
    archetype: 'Tipper Polearm Cleaver',
    summary: 'Extended polearm engineered to skewer distant frontlines with its crescent axe-tip.',
    effectLines: [
      '+10% Offensive Damage, +18px cleave reach & +1 Pierce (-6% cadence)',
      'Polearm Tipper: +20% bonus damage to foes struck at 28px+ reach',
      '45% chance on primary hit to inflict Bleed (4s) & +1 Shield',
    ],
    unlockHint: 'Defeat Floor Bosses as Vanguard',
    accent: '#EF4444',
    modifiers: {
      damageMult: 1.1,
      attackSpeedMult: 0.94,
      bonusPierce: 1,
      rangeBonusPx: 18,
      tipperReachPx: 28,
      tipperBonusPct: 0.2,
      bleedChance: 0.45,
      shieldOnPrimaryHit: 1,
    },
  },
  {
    id: 'vanguard_stormbreaker_flail',
    slot: 'weapon',
    heroClass: 'vanguard',
    name: 'Stormbreaker Flail & Bastion Wall',
    rarity: 'Ascendant',
    archetype: 'Tempest Chain-Lightning Flail',
    summary: 'Lightning-tempered war flail discharging crackling thunderbolts across clustered enemies.',
    effectLines: [
      '+14% Attack Speed, +6% Crit Chance & +4 Shield on primary hit',
      'Tempest Arc: Strikes chain lightning to up to 2 foes within 105px (45% dmg)',
      '25% chance on primary hit to Shock foes (3.5s)',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Vanguard',
    accent: '#FBBF24',
    modifiers: {
      damageMult: 1.04,
      attackSpeedMult: 1.14,
      critChanceBonus: 0.06,
      rangeBonusPx: 8,
      shieldOnPrimaryHit: 4,
      shockChance: 0.25,
      chainLightningTargets: 2,
      chainLightningDmgRatio: 0.45,
      chainLightningRangePx: 105,
    },
  },

  // ================= RANGER WEAPONS =================
  {
    id: 'ranger_ashwood_recurve',
    slot: 'weapon',
    heroClass: 'ranger',
    name: HERO_CLASSES.ranger.weapon,
    rarity: 'Standard',
    archetype: 'Precision Hunter Recurve',
    summary: 'Supple Thornwood recurve strung with barbed arrows that punish slowed or poisoned prey.',
    effectLines: [
      '+4% Critical Chance & +10% Arrow Velocity',
      'Barbed Broadheads: +15% arrow damage vs Slowed, Frozen, or Poisoned foes',
      '+5% bonus Longshot damage beyond 180u',
    ],
    unlockHint: 'Starter Ranger armament',
    isDefault: true,
    accent: '#34D399',
    modifiers: {
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      critChanceBonus: 0.04,
      projectileSpeedMult: 1.1,
      longshotBonusPct: 0.05,
      impairedTargetBonusPct: 0.15,
    },
  },
  {
    id: 'ranger_galewind_twinbow',
    slot: 'weapon',
    heroClass: 'ranger',
    name: 'Galewind Twinbow & Split Quiver',
    rarity: 'Forged',
    archetype: 'Sequential Tandem Wind-Burst',
    summary: 'Double-limbed composite bow firing two rapid straight shafts in tandem along your exact aim line.',
    effectLines: [
      'Tandem Double-Tap: Fires a 2nd straight tailwind arrow 75ms later (90% ratio)',
      '+6% Cadence, +18% Velocity & 2nd shaft knocks non-boss foes back 12px',
      'Critical hits grant 0.7s Galewind Haste (+4% Crit, 62% base per-shaft ratio)',
    ],
    unlockHint: 'Defeat Floor Bosses as Ranger',
    accent: '#38BDF8',
    modifiers: {
      damageMult: 0.62,
      attackSpeedMult: 1.06,
      projectileSpeedMult: 1.18,
      critChanceBonus: 0.04,
      followUpDelayMs: 75,
      followUpDamageRatio: 0.9,
      followUpKnockbackPx: 12,
      critHasteMs: 700,
    },
  },
  {
    id: 'ranger_eclipse_longbow',
    slot: 'weapon',
    heroClass: 'ranger',
    name: 'Eclipse Siege Longbow & Bodkins',
    rarity: 'Ascendant',
    archetype: 'Overpenetrating Siege Sniper',
    summary: 'Heavy darkwood siege bow whose high-velocity bodkins gain lethal momentum as they pierce ranks.',
    effectLines: [
      '+12% Arrow Damage, +2 Arrow Pierce & +25% Arrow Velocity (-6% cadence)',
      'Overpenetration: Each enemy pierced boosts remaining hit damage by +18%',
      '+8% Crit Chance, +10% Crit Multiplier & +15% Longshot beyond 180u',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Ranger',
    accent: '#FBBF24',
    modifiers: {
      damageMult: 1.12,
      attackSpeedMult: 0.94,
      bonusPierce: 2,
      critChanceBonus: 0.08,
      critMultBonus: 0.1,
      projectileSpeedMult: 1.25,
      longshotBonusPct: 0.15,
      pierceEscalationPct: 0.18,
    },
  },

  // ================= ARCANIST WEAPONS =================
  {
    id: 'arcanist_runebound_spire',
    slot: 'weapon',
    heroClass: 'arcanist',
    name: HERO_CLASSES.arcanist.weapon,
    rarity: 'Standard',
    archetype: 'Astral Rift Conduit',
    summary: 'Crystalline focus rod attuned with orbiting astral spheres that draw power from Star Rifts.',
    effectLines: [
      '+1 Cosmic Bolt Pierce & +3% Critical Chance',
      'Rift Resonance: +12% primary bolt damage while your Star Rift is active',
      '+15% Star Rift Zone resonance damage',
    ],
    unlockHint: 'Starter Arcanist armament',
    isDefault: true,
    accent: '#818CF8',
    modifiers: {
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      critChanceBonus: 0.03,
      starRiftBonusDamagePct: 0.15,
      activeRiftBonusPct: 0.12,
    },
  },
  {
    id: 'arcanist_cinderflare_rod',
    slot: 'weapon',
    heroClass: 'arcanist',
    name: 'Cinderflare Catalyst & Ember Crown',
    rarity: 'Forged',
    archetype: 'Detonating Pyromancy Catalyst',
    summary: 'Obsidian-gold catalyst firing volatile ember bolts that erupt into fiery splash blasts on impact.',
    effectLines: [
      '+10% Arcane Spell & Bolt Damage, +1 Pierce & +10% Crit Multiplier',
      'Ember Detonation: Primary bolts splash 45% Fire AoE within 54px on hit',
      '35% chance on primary hit to Ignite foes (4s Burn)',
    ],
    unlockHint: 'Defeat Floor Bosses as Arcanist',
    accent: '#F97316',
    modifiers: {
      damageMult: 1.1,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      critMultBonus: 0.1,
      burnChance: 0.35,
      emberSplashRadiusPx: 54,
      emberSplashRatio: 0.45,
    },
  },
  {
    id: 'arcanist_chronostar_scepter',
    slot: 'weapon',
    heroClass: 'arcanist',
    name: 'Chronostar Scepter & Twin Orbs',
    rarity: 'Ascendant',
    archetype: 'Seeking Temporal Star-Orb Scepter',
    summary: 'Celestial astrolabe scepter launching homing Star-Orbs that curve mid-flight and siphon spell cooldowns.',
    effectLines: [
      'Seeking Star-Orb: Curves toward foes within 170px mid-flight (+10% dmg, +10% cadence)',
      'Temporal Siphon: Primary orb hits trim -0.3s Tactical & -0.4s Ultimate cooldowns',
      '+1 Pierce, +6% Crit Chance, 35% Chill & +30% Star Rift resonance damage',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Arcanist',
    accent: '#38BDF8',
    modifiers: {
      damageMult: 1.1,
      attackSpeedMult: 1.1,
      bonusPierce: 1,
      critChanceBonus: 0.06,
      projectileSpeedMult: 1.15,
      starRiftBonusDamagePct: 0.3,
      seekingRadiusPx: 170,
      tacticalSiphonMs: 300,
      ultSiphonMs: 400,
      chillChance: 0.35,
    },
  },

  // ================= CLERIC WEAPONS =================
  {
    id: 'cleric_dawnstar_mace',
    slot: 'weapon',
    heroClass: 'cleric',
    name: HERO_CLASSES.cleric.weapon,
    rarity: 'Standard',
    archetype: 'Consecrated Sanctuary Mace',
    summary: 'Flanged sun-gold mace paired with a consecrated reliquary of undead-banishing judgment.',
    effectLines: [
      '+20% Smite damage vs Undead, Cultists & Bosses',
      '+4% Critical Strike Chance & +1 Shield on primary Smite hit',
      'Sanctuary Bane: Grants +2 total Shield when smiting Undead, Cultists, or Bosses',
    ],
    unlockHint: 'Starter Cleric armament',
    isDefault: true,
    accent: '#FACC15',
    modifiers: {
      damageMult: 1.0,
      attackSpeedMult: 1.0,
      critChanceBonus: 0.04,
      undeadBossBonusPct: 0.2,
      shieldOnPrimaryHit: 1,
      undeadBonusShieldOnHit: 1,
    },
  },
  {
    id: 'cleric_solaris_censer',
    slot: 'weapon',
    heroClass: 'cleric',
    name: 'Solaris War-Censer & Thurible',
    rarity: 'Forged',
    archetype: 'Mending Incense Focus',
    summary: 'Swinging emerald-gold war-censer whose sacred bolts mend the lowest-HP nearby ally on impact.',
    effectLines: [
      '+16% Healing Power, +8% Divine Damage & +1 Radiant Bolt Pierce',
      'Incense Mending: Primary hits heal the lowest-HP ally within 150px (+4 scaled HP)',
      '30% chance on primary hit to Chill targets (2.5s)',
    ],
    unlockHint: 'Defeat Floor Bosses as Cleric',
    accent: '#34D399',
    modifiers: {
      damageMult: 1.08,
      attackSpeedMult: 1.0,
      bonusPierce: 1,
      healingBonusPct: 0.16,
      chillChance: 0.3,
      allyHealOnHitBase: 4,
      allyHealOnHitRangePx: 150,
    },
  },
  {
    id: 'cleric_seraphim_crozier',
    slot: 'weapon',
    heroClass: 'cleric',
    name: 'Seraphim Judgment Crozier & Sun-Relic',
    rarity: 'Ascendant',
    archetype: 'Judgment Brand Battle-Crozier',
    summary: 'High-choir crozier piercing ranks with sunlit lances that brand foes for amplified party damage.',
    effectLines: [
      '+14% Divine Damage, +10% Attack Speed, +1 Pierce & +6% Crit Chance',
      'Seraphic Brand: 35% chance (100% on Crit) to Mark foes (+35% party dmg for 2.5s)',
      '+12% Healing Power, +2 Shield/hit & +15% vs Undead/Bosses',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Cleric',
    accent: '#FDE047',
    modifiers: {
      damageMult: 1.14,
      attackSpeedMult: 1.1,
      bonusPierce: 1,
      critChanceBonus: 0.06,
      healingBonusPct: 0.12,
      undeadBossBonusPct: 0.15,
      shieldOnPrimaryHit: 2,
      brandMarkChance: 0.35,
      brandDurationMs: 2500,
    },
  },
];

export const VESTMENT_CATALOG: readonly VestmentDef[] = [
  // ================= VANGUARD VESTMENTS =================
  {
    id: 'vanguard_ironcrest_plate',
    slot: 'vestment',
    heroClass: 'vanguard',
    name: 'Ironcrest Bastion Plate',
    rarity: 'Standard',
    archetype: 'Linebreaker Knight Armor',
    summary: 'Layered bastion steel engineered to turn heavy blows and reinforce guard posture.',
    effectLines: [
      '+4% Elemental Resistance',
      '+12 Maximum Shield Cap (up to 72)',
      '+5 Starting Shield at expedition launch',
    ],
    unlockHint: 'Starter Vanguard vestment',
    isDefault: true,
    accent: '#94A3B8',
    modifiers: {
      elementalResistBonus: 0.04,
      maxShieldBonus: 12,
      startingShieldBonus: 5,
    },
  },
  {
    id: 'vanguard_obsidian_juggernaut',
    slot: 'vestment',
    heroClass: 'vanguard',
    name: 'Obsidian Juggernaut Harness',
    rarity: 'Forged',
    archetype: 'Fortress Heavy Plate',
    summary: 'Dense obsidian-riveted plate trading slight stride speed for massive durability.',
    effectLines: [
      '+28 Maximum HP & +9% Physical Resistance',
      '-6% All Incoming Damage & +15 Max Shield Cap',
      '-3% Movement Speed (heavy plate weight)',
    ],
    unlockHint: 'Defeat Floor Bosses as Vanguard',
    accent: '#CBD5E1',
    modifiers: {
      maxHpBonus: 28,
      physicalResistBonus: 0.09,
      damageTakenMult: 0.94,
      maxShieldBonus: 15,
      startingShieldBonus: 10,
      moveSpeedMult: 0.97,
    },
  },
  {
    id: 'vanguard_aegis_sovereign_mail',
    slot: 'vestment',
    heroClass: 'vanguard',
    name: 'Sovereign Aegis Warplate',
    rarity: 'Ascendant',
    archetype: 'Commanding Warden Mail',
    summary: 'Gilded sanctum warplate channeling rapid shield abilities and steady vitality regen.',
    effectLines: [
      '+18 Maximum HP & +8% Cooldown Reduction',
      '+6% Physical Resistance & +8% Elemental Resistance',
      '+2 HP Regen every 2.0s combat pulse',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Vanguard',
    accent: '#F59E0B',
    modifiers: {
      maxHpBonus: 18,
      physicalResistBonus: 0.06,
      elementalResistBonus: 0.08,
      cdrBonus: 0.08,
      hpRegenPerTickBonus: 2,
      maxShieldBonus: 12,
    },
  },

  // ================= RANGER VESTMENTS =================
  {
    id: 'ranger_thornwood_brigandine',
    slot: 'vestment',
    heroClass: 'ranger',
    name: 'Thornwood Stalker Brigandine',
    rarity: 'Standard',
    archetype: 'Scout Leather & Cloak',
    summary: 'Oil-treated forest brigandine woven with briarhide for swift kiting.',
    effectLines: [
      '+5% Movement Speed',
      '+4% Elemental Resistance',
      '+6 Max Shield Cap & +4 Starting Shield',
    ],
    unlockHint: 'Starter Ranger vestment',
    isDefault: true,
    accent: '#4ADE80',
    modifiers: {
      moveSpeedMult: 1.05,
      elementalResistBonus: 0.04,
      maxShieldBonus: 6,
      startingShieldBonus: 4,
    },
  },
  {
    id: 'ranger_windrunner_mantle',
    slot: 'vestment',
    heroClass: 'ranger',
    name: 'Windrunner Mistcloak',
    rarity: 'Forged',
    archetype: 'Gale-Tuned Skirmisher Garb',
    summary: 'Featherlight mistcloak accelerating evasion, skill cadence, and snare recovery.',
    effectLines: [
      '+11% Movement Speed & +8% Cooldown Reduction',
      '+18% Crowd-Control Duration Tenacity',
      '+12 Maximum HP',
    ],
    unlockHint: 'Defeat Floor Bosses as Ranger',
    accent: '#38BDF8',
    modifiers: {
      maxHpBonus: 12,
      moveSpeedMult: 1.11,
      cdrBonus: 0.08,
      ccTenacityBonus: 0.18,
    },
  },
  {
    id: 'ranger_briarheart_leather',
    slot: 'vestment',
    heroClass: 'ranger',
    name: 'Briarheart Sentinel Hauberk',
    rarity: 'Ascendant',
    archetype: 'Reinforced Grove Brigandine',
    summary: 'Living-bark reinforced leather mending wounds while preserving agile footwork.',
    effectLines: [
      '+24 Maximum HP & +2 HP Regen every 2.0s pulse',
      '+7% Physical & +7% Elemental Resistance',
      '+6% Movement Speed',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Ranger',
    accent: '#10B981',
    modifiers: {
      maxHpBonus: 24,
      physicalResistBonus: 0.07,
      elementalResistBonus: 0.07,
      moveSpeedMult: 1.06,
      hpRegenPerTickBonus: 2,
    },
  },

  // ================= ARCANIST VESTMENTS =================
  {
    id: 'arcanist_astral_vestments',
    slot: 'vestment',
    heroClass: 'arcanist',
    name: 'Spireweaver Astral Vestments',
    rarity: 'Standard',
    archetype: 'Runed Scholar Robes',
    summary: 'Indigo vestments threaded with silver astrolabe wire to steady mana cadence.',
    effectLines: [
      '+4% Elemental Resistance',
      '+10 Maximum Shield Cap',
      '+5 Starting Shield at expedition launch',
    ],
    unlockHint: 'Starter Arcanist vestment',
    isDefault: true,
    accent: '#818CF8',
    modifiers: {
      elementalResistBonus: 0.04,
      maxShieldBonus: 10,
      startingShieldBonus: 5,
    },
  },
  {
    id: 'arcanist_chronomancer_shroud',
    slot: 'vestment',
    heroClass: 'arcanist',
    name: 'Chronomancer Silk Shroud',
    rarity: 'Forged',
    archetype: 'Temporal Conduit Robes',
    summary: 'Quicksilver-lined shroud engineered for rapid spell cycling and nimble repositioning.',
    effectLines: [
      '+12% Cooldown Reduction',
      '+7% Movement Speed & +8% Elemental Resistance',
      '+14 Maximum HP',
    ],
    unlockHint: 'Defeat Floor Bosses as Arcanist',
    accent: '#38BDF8',
    modifiers: {
      maxHpBonus: 14,
      cdrBonus: 0.12,
      moveSpeedMult: 1.07,
      elementalResistBonus: 0.08,
    },
  },
  {
    id: 'arcanist_voidward_robes',
    slot: 'vestment',
    heroClass: 'arcanist',
    name: 'Voidward Battlemage Robes',
    rarity: 'Ascendant',
    archetype: 'Ward-Woven Battle Mantle',
    summary: 'Runic ward-cloth wrapping frail casters in dense arcane barriers.',
    effectLines: [
      '+26 Maximum HP & +15 Max Shield Cap',
      '+7% Physical & +10% Elemental Resistance',
      '-6% All Incoming Damage & +6% Cooldown Reduction',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Arcanist',
    accent: '#A855F7',
    modifiers: {
      maxHpBonus: 26,
      physicalResistBonus: 0.07,
      elementalResistBonus: 0.1,
      damageTakenMult: 0.94,
      cdrBonus: 0.06,
      maxShieldBonus: 15,
      startingShieldBonus: 10,
    },
  },

  // ================= CLERIC VESTMENTS =================
  {
    id: 'cleric_prelate_raiment',
    slot: 'vestment',
    heroClass: 'cleric',
    name: 'Sunbrand Prelate Raiment',
    rarity: 'Standard',
    archetype: 'Consecrated Choir Vestments',
    summary: 'Gold-embroidered vestments preserving clear prayers under pressure.',
    effectLines: [
      '+3% Physical & +5% Elemental Resistance',
      '+20% faster Ally Revive Speed',
      '+6 Maximum Shield Cap',
    ],
    unlockHint: 'Starter Cleric vestment',
    isDefault: true,
    accent: '#FACC15',
    modifiers: {
      physicalResistBonus: 0.03,
      elementalResistBonus: 0.05,
      reviveSpeedBonus: 0.2,
      maxShieldBonus: 6,
    },
  },
  {
    id: 'cleric_martyr_surplice',
    slot: 'vestment',
    heroClass: 'cleric',
    name: 'Hallowed Martyr Surplice',
    rarity: 'Forged',
    archetype: 'Sacred Mending Vestments',
    summary: 'Sunlit surplice amplifying party healing cadence, HP regen, and battlefield revives.',
    effectLines: [
      '+22 Maximum HP & +15% Healing Power',
      '+8% Cooldown Reduction & +2 HP Regen / 2.0s',
      '+35% faster Ally Revive Speed',
    ],
    unlockHint: 'Defeat Floor Bosses as Cleric',
    accent: '#34D399',
    modifiers: {
      maxHpBonus: 22,
      auraHealBonusPct: 0.15,
      cdrBonus: 0.08,
      hpRegenPerTickBonus: 2,
      reviveSpeedBonus: 0.35,
    },
  },
  {
    id: 'cleric_templar_cassock',
    slot: 'vestment',
    heroClass: 'cleric',
    name: 'Arch-Templar Sanctum Plate',
    rarity: 'Ascendant',
    archetype: 'Armored Paladin Cassock',
    summary: 'Sacred steel-lined cassock letting Clerics hold the frontline beside Vanguards.',
    effectLines: [
      '+32 Maximum HP & +12 Max Shield Cap',
      '+8% Physical & +8% Elemental Resistance',
      '-6% All Incoming Damage & +18% CC Tenacity',
    ],
    unlockHint: 'Defeat Floor 3+ Bosses as Cleric',
    accent: '#FDE047',
    modifiers: {
      maxHpBonus: 32,
      physicalResistBonus: 0.08,
      elementalResistBonus: 0.08,
      damageTakenMult: 0.94,
      ccTenacityBonus: 0.18,
      maxShieldBonus: 12,
      startingShieldBonus: 8,
    },
  },
];

export const WEAPONS_BY_ID: ReadonlyMap<string, WeaponDef> = new Map(
  WEAPON_CATALOG.map((w) => [w.id, w])
);

export const VESTMENTS_BY_ID: ReadonlyMap<string, VestmentDef> = new Map(
  VESTMENT_CATALOG.map((v) => [v.id, v])
);

export function getDefaultWeaponIdForClass(heroClass: HeroClassId): string {
  return DEFAULT_WEAPON_BY_CLASS[heroClass] || DEFAULT_WEAPON_BY_CLASS.vanguard;
}

export function getDefaultVestmentIdForClass(heroClass: HeroClassId): string {
  return DEFAULT_VESTMENT_BY_CLASS[heroClass] || DEFAULT_VESTMENT_BY_CLASS.vanguard;
}

export function getWeaponDef(weaponId?: string | null): WeaponDef | null {
  if (!weaponId || typeof weaponId !== 'string') return null;
  return WEAPONS_BY_ID.get(weaponId) ?? null;
}

export function getVestmentDef(vestmentId?: string | null): VestmentDef | null {
  if (!vestmentId || typeof vestmentId !== 'string') return null;
  return VESTMENTS_BY_ID.get(vestmentId) ?? null;
}

export function getArmamentDef(slot: ArmamentSlot, itemId?: string | null): ArmamentDef | null {
  return slot === 'weapon' ? getWeaponDef(itemId) : getVestmentDef(itemId);
}

/**
 * Resolves a character's equipped Weapon ONLY if it exists AND matches their active HeroClassId.
 * An explicit `null` means unequipped. `undefined` on runtime PlayerState also resolves to null.
 */
export function resolveEquippedWeaponForClass(
  heroClass: HeroClassId,
  weaponId?: string | null
): WeaponDef | null {
  const def = getWeaponDef(weaponId);
  if (!def || def.heroClass !== heroClass) return null;
  return def;
}

export function resolveEquippedVestmentForClass(
  heroClass: HeroClassId,
  vestmentId?: string | null
): VestmentDef | null {
  const def = getVestmentDef(vestmentId);
  if (!def || def.heroClass !== heroClass) return null;
  return def;
}

export function getClassWeapons(heroClass: HeroClassId): WeaponDef[] {
  return WEAPON_CATALOG.filter((w) => w.heroClass === heroClass);
}

export function getClassVestments(heroClass: HeroClassId): VestmentDef[] {
  return VESTMENT_CATALOG.filter((v) => v.heroClass === heroClass);
}

export function parseArmamentIdArray(raw: unknown, slot: ArmamentSlot): string[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const seen = new Set<string>();
  const valid: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const def = slot === 'weapon' ? WEAPONS_BY_ID.get(entry) : VESTMENTS_BY_ID.get(entry);
    if (def && !seen.has(entry)) {
      seen.add(entry);
      valid.push(entry);
    }
  }
  return valid;
}

export interface SanitizedArmamentLoadout {
  ownedWeapons: string[];
  ownedVestments: string[];
  equippedWeapon: string | null;
  equippedVestment: string | null;
}

/**
 * Normalizes and validates an account's permanent armaments:
 * - Strips unknown/tampered item IDs
 * - Guarantees the class default Weapon & Vestment are owned
 * - Enforces ownership + class restriction on equipped items
 * - Preserves intentional `null` (unequipped) once initialized, while auto-equipping
 *   class defaults when uninitialized (`undefined`) or migrating legacy accounts.
 */
export function normalizeArmamentLoadout(
  heroClass: HeroClassId,
  input?: {
    ownedWeapons?: unknown;
    ownedVestments?: unknown;
    equippedWeapon?: string | null;
    equippedVestment?: string | null;
  },
  forceEquipDefaultsIfEmpty = false
): SanitizedArmamentLoadout {
  const defaultWeapon = getDefaultWeaponIdForClass(heroClass);
  const defaultVestment = getDefaultVestmentIdForClass(heroClass);

  const ownedWeapons = parseArmamentIdArray(input?.ownedWeapons, 'weapon');
  if (!ownedWeapons.includes(defaultWeapon)) {
    ownedWeapons.unshift(defaultWeapon);
  }

  const ownedVestments = parseArmamentIdArray(input?.ownedVestments, 'vestment');
  if (!ownedVestments.includes(defaultVestment)) {
    ownedVestments.unshift(defaultVestment);
  }

  let equippedWeapon: string | null;
  if (input?.equippedWeapon === undefined) {
    equippedWeapon = defaultWeapon;
  } else if (input.equippedWeapon === null) {
    equippedWeapon = forceEquipDefaultsIfEmpty ? defaultWeapon : null;
  } else {
    const def = resolveEquippedWeaponForClass(heroClass, input.equippedWeapon);
    if (def && ownedWeapons.includes(def.id)) {
      equippedWeapon = def.id;
    } else {
      equippedWeapon = defaultWeapon;
    }
  }

  let equippedVestment: string | null;
  if (input?.equippedVestment === undefined) {
    equippedVestment = defaultVestment;
  } else if (input.equippedVestment === null) {
    equippedVestment = forceEquipDefaultsIfEmpty ? defaultVestment : null;
  } else {
    const def = resolveEquippedVestmentForClass(heroClass, input.equippedVestment);
    if (def && ownedVestments.includes(def.id)) {
      equippedVestment = def.id;
    } else {
      equippedVestment = defaultVestment;
    }
  }

  return {
    ownedWeapons,
    ownedVestments,
    equippedWeapon,
    equippedVestment,
  };
}

/**
 * Safely migrates and normalizes an AccountRecord without overwriting existing progression or relics.
 */
export function applyAccountArmamentMigration(
  acc: AccountRecord,
  isFirstTimeMigration = false
): boolean {
  const heroClass: HeroClassId = HERO_CLASSES[acc.lockedClass]
    ? acc.lockedClass
    : HERO_CLASSES[acc.preferredClass]
      ? acc.preferredClass
      : 'vanguard';

  const forceDefaults =
    isFirstTimeMigration &&
    acc.equippedWeapon === undefined &&
    acc.equippedVestment === undefined;

  const beforeW = JSON.stringify(acc.ownedWeapons || []);
  const beforeV = JSON.stringify(acc.ownedVestments || []);
  const beforeEqW = acc.equippedWeapon;
  const beforeEqV = acc.equippedVestment;

  const normalized = normalizeArmamentLoadout(
    heroClass,
    {
      ownedWeapons: acc.ownedWeapons,
      ownedVestments: acc.ownedVestments,
      equippedWeapon: acc.equippedWeapon,
      equippedVestment: acc.equippedVestment,
    },
    forceDefaults
  );

  acc.ownedWeapons = normalized.ownedWeapons;
  acc.ownedVestments = normalized.ownedVestments;
  acc.equippedWeapon = normalized.equippedWeapon;
  acc.equippedVestment = normalized.equippedVestment;

  return (
    JSON.stringify(acc.ownedWeapons) !== beforeW ||
    JSON.stringify(acc.ownedVestments) !== beforeV ||
    acc.equippedWeapon !== beforeEqW ||
    acc.equippedVestment !== beforeEqV
  );
}

/**
 * Picks the next unowned class Weapon or Vestment for a boss clear discovery drop.
 * Floors 1-2 favor Forged armaments; Floors 3+ unlock Forged & Ascendant armaments.
 */
export function pickNextUnlockableArmamentForClass(
  heroClass: HeroClassId,
  ownedWeapons: readonly string[],
  ownedVestments: readonly string[],
  floor: number
): ArmamentDef | null {
  const classItems: ArmamentDef[] = [
    ...WEAPON_CATALOG.filter((w) => w.heroClass === heroClass && !w.isDefault),
    ...VESTMENT_CATALOG.filter((v) => v.heroClass === heroClass && !v.isDefault),
  ];

  const unowned = classItems.filter((item) =>
    item.slot === 'weapon'
      ? !ownedWeapons.includes(item.id)
      : !ownedVestments.includes(item.id)
  );
  if (unowned.length === 0) return null;

  const forgedPool = unowned.filter((i) => i.rarity === 'Forged');
  const pool = floor < 3 && forgedPool.length > 0 ? forgedPool : unowned;
  return pool[Math.floor(Math.random() * pool.length)] ?? unowned[0];
}
