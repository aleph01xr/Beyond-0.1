import { HERO_CLASSES, RELIC_CATALOG, type HeroClassId, type PlayerState, type DamageCategory } from './types.ts';

export interface PlayerStatProjections {
  // Survivability & Health
  maxHp: number;
  baseHp: number;
  levelHpBonus: number;
  vitHpBonus: number;
  relicHpBonus: number;
  hpRegenPerTick: number; // every 2.0s pulse
  hpRegenPerSec: number;

  // Defenses & Mitigations
  physicalResistPct: number; // e.g. 38.5%
  basePhysicalResistPct: number;
  strPhysicalResistPct: number;
  relicPhysicalResistPct: number;
  vanguardIronWillPct: number; // 15%

  elementalResistPct: number; // e.g. 24.5%
  baseElementalResistPct: number;
  intElementalResistPct: number;
  relicElementalResistPct: number;

  faithCcTenacityPct: number; // e.g. 20.0% debuff reduction

  // Offense & DPS
  primaryCategory: DamageCategory;
  primaryStatName: 'Strength' | 'Dexterity' | 'Intelligence' | 'Faith';
  primaryStatValue: number;
  damageMultiplier: number; // e.g. 2.45
  baseHitDamage: number;
  scaledHitDamage: number; // Damage per non-crit hit
  
  // Attack Speed & Cadence
  baseAttackCooldownMs: number;
  attackCooldownMs: number; // Cooldown between attacks
  attacksPerSecond: number; // e.g. 3.42 attacks/sec
  dexSpeedBonusPct: number;

  // Critical Strike Stats
  critChancePct: number; // e.g. 34.0%
  baseCritChancePct: number;
  dexCritChancePct: number;
  relicCritChancePct: number;
  critMultiplier: number; // 1.75x
  critHitDamage: number; // Scaled damage when hit crits

  // Sustained DPS Projection
  sustainedDps: number; // Average damage per second against 0-resist target

  // Utility & CDR
  moveSpeedPx: number; // e.g. 242 px/s
  moveSpeedBonusPct: number;
  cooldownReductionPct: number; // e.g. 15.0%
  tacticalCooldownSec: number;
  ultCooldownSec: number;

  // Piercing & Multi-projectile
  pierceCount: number;
  extraProjectileCount: number;
}

export function calculatePlayerStatProjections(p: PlayerState): PlayerStatProjections {
  const heroClass = p.heroClass || 'vanguard';
  const def = HERO_CLASSES[heroClass] || HERO_CLASSES.vanguard;
  const level = Math.max(1, p.level || 1);
  const str = Math.max(0, p.strength || 0);
  const vit = Math.max(0, p.vitality || 0);
  const dex = Math.max(0, p.dexterity || 0);
  const intStat = Math.max(0, p.intelligence || 0);
  const fth = Math.max(0, p.faith || 0);
  const relics = p.relics || [];

  // 1. Health
  const baseHp = def.maxHp;
  const levelHpBonus = (level - 1) * 12;
  const vitHpBonus = vit * 6;
  const relicHpBonus = relics.includes('bastion_pauldron') ? 30 : 0;
  const maxHp = baseHp + levelHpBonus + vitHpBonus + relicHpBonus;

  // Combat HP Regen (pulse every 2.0s for vit >= 6)
  const hpRegenPerTick = vit >= 6 ? Math.max(1, Math.floor(vit * 0.12)) : 0;
  const hpRegenPerSec = hpRegenPerTick / 2.0;

  // 2. Physical Armor & Mitigation
  const basePhysicalResistPct = (def.resistances?.physical || 0) * 100;
  const strPhysicalResistPct = Math.min(15, str * 0.15);
  let relicPhysicalResistPct = 0;
  if (relics.includes('runic_carapace')) relicPhysicalResistPct += 15;
  if (relics.includes('thorned_aegis')) relicPhysicalResistPct += 10;

  const rawPhysRes = (basePhysicalResistPct / 100) + (strPhysicalResistPct / 100) + (relicPhysicalResistPct / 100);
  const physicalResistPct = Math.min(75, Math.max(0, rawPhysRes * 100));

  const vanguardIronWillPct = heroClass === 'vanguard' ? 15 : 0;

  // 3. Elemental Resistance
  const baseElem = ((def.resistances?.fire || 0) + (def.resistances?.frost || 0) + (def.resistances?.lightning || 0)) / 3;
  const baseElementalResistPct = baseElem * 100;
  const intElementalResistPct = Math.min(15, intStat * 0.15);
  const relicElementalResistPct = relics.includes('runic_carapace') ? 20 : 0;

  const rawElemRes = (baseElementalResistPct / 100) + (intElementalResistPct / 100) + (relicElementalResistPct / 100);
  const elementalResistPct = Math.min(75, Math.max(0, rawElemRes * 100));

  // 4. Faith Crowd Control Tenacity
  const faithCcTenacityPct = Math.min(40, fth * 0.4);

  // 5. Damage Multiplier & Scaled Hit Damage
  const primaryCategory: DamageCategory = heroClass === 'arcanist' ? 'arcane' : heroClass === 'cleric' ? 'divine' : 'physical';
  let primaryStatName: 'Strength' | 'Dexterity' | 'Intelligence' | 'Faith' = 'Strength';
  let primaryStatValue = str;

  if (heroClass === 'ranger') {
    primaryStatName = 'Dexterity';
    primaryStatValue = dex;
  } else if (heroClass === 'arcanist') {
    primaryStatName = 'Intelligence';
    primaryStatValue = intStat;
  } else if (heroClass === 'cleric') {
    primaryStatName = 'Faith';
    primaryStatValue = fth;
  }

  let damageMultiplier = (1 + (level - 1) * 0.10) * (1 + primaryStatValue * 0.03);
  if (relics.includes('sunfire_signet')) damageMultiplier *= 1.24;

  const baseHitDamage = def.damage;
  const scaledHitDamage = Math.round(baseHitDamage * damageMultiplier);

  // 6. Attack Speed & Cooldown
  const baseAttackCooldownMs = def.attackCooldownMs;
  const dexSpeedBonusPct = dex * 0.6; // +0.6% rate per DEX
  const dexSpeedMult = 1 + dex * 0.006;
  const hasteMult = (p.hasteMs || 0) > 0 ? 0.8 : 1.0;

  const attackCooldownMs = Math.max(100, Math.round((baseAttackCooldownMs * hasteMult) / dexSpeedMult));
  const attacksPerSecond = Number((1000 / attackCooldownMs).toFixed(2));

  // 7. Critical Strike
  const baseCritChancePct = 10.0;
  const dexCritChancePct = dex * 0.4;
  const relicCritChancePct = relics.includes('keen_arrowhead') ? 20.0 : 0.0;
  const rawCritChance = baseCritChancePct + dexCritChancePct + relicCritChancePct;
  const critChancePct = Math.min(45.0, rawCritChance);
  const critMultiplier = 1.75;
  const critHitDamage = Math.round(scaledHitDamage * critMultiplier);

  // 8. Sustained DPS Projection
  const extraProjectileFactor = relics.includes('twinstring_charm') ? 0.75 : 0;
  const avgDamagePerHit = (scaledHitDamage * (1 - critChancePct / 100)) + (critHitDamage * (critChancePct / 100));
  const totalPerShotDmg = avgDamagePerHit * (1 + extraProjectileFactor);
  const sustainedDps = Number((totalPerShotDmg * attacksPerSecond).toFixed(1));

  // 9. Mobility & Cooldown Reduction
  const dexMoveBonusPct = dex * 0.35;
  let moveSpeedPx = def.speed * (1 + dex * 0.0035);
  if (relics.includes('zephyr_greaves')) moveSpeedPx *= 1.15;
  if ((p.hasteMs || 0) > 0) moveSpeedPx *= 1.22;
  moveSpeedPx = Math.round(moveSpeedPx);
  const moveSpeedBonusPct = Number((((moveSpeedPx - def.speed) / def.speed) * 100).toFixed(1));

  const intCdrPct = Math.min(20, intStat * 0.2);
  const relicCdrPct = relics.includes('hourglass_shard') ? 25 : 0;
  const cooldownReductionPct = Math.min(45, intCdrPct + relicCdrPct);

  const cdrFactor = 1 - (cooldownReductionPct / 100);
  const tacticalCooldownSec = Number(((def.tacticalCooldownMs * cdrFactor) / 1000).toFixed(1));
  const ultCooldownSec = Number(((def.ultCooldownMs * cdrFactor) / 1000).toFixed(1));

  // 10. Piercing
  let pierceCount = heroClass === 'vanguard' ? 4 : heroClass === 'arcanist' ? 2 : 1;
  if (relics.includes('piercing_prism')) pierceCount += 1;
  const extraProjectileCount = relics.includes('twinstring_charm') ? 1 : 0;

  return {
    maxHp,
    baseHp,
    levelHpBonus,
    vitHpBonus,
    relicHpBonus,
    hpRegenPerTick,
    hpRegenPerSec,
    physicalResistPct,
    basePhysicalResistPct,
    strPhysicalResistPct,
    relicPhysicalResistPct,
    vanguardIronWillPct,
    elementalResistPct,
    baseElementalResistPct,
    intElementalResistPct,
    relicElementalResistPct,
    faithCcTenacityPct,
    primaryCategory,
    primaryStatName,
    primaryStatValue,
    damageMultiplier: Number(damageMultiplier.toFixed(2)),
    baseHitDamage,
    scaledHitDamage,
    baseAttackCooldownMs,
    attackCooldownMs,
    attacksPerSecond,
    dexSpeedBonusPct,
    critChancePct,
    baseCritChancePct,
    dexCritChancePct,
    relicCritChancePct,
    critMultiplier,
    critHitDamage,
    sustainedDps,
    moveSpeedPx,
    moveSpeedBonusPct,
    cooldownReductionPct,
    tacticalCooldownSec,
    ultCooldownSec,
    pierceCount,
    extraProjectileCount,
  };
}

export interface RelicSynergyCombo {
  id: string;
  name: string;
  relicIds: [string, string];
  description: string;
  accent: string;
}

export const RELIC_SYNERGIES: RelicSynergyCombo[] = [
  {
    id: 'frostfire_shatter',
    name: 'Frostfire Shatter',
    relicIds: ['cinder_heart', 'rimefrost_shard'],
    description: 'Chilled & Ignited enemies take +30% shatter burst damage when frozen.',
    accent: '#38BDF8',
  },
  {
    id: 'storm_venom',
    name: 'Storm Venom Conduit',
    relicIds: ['stormcaller_lodestone', 'viper_crucible'],
    description: 'Poisoned enemies arc lightning shockwaves to 2 additional targets.',
    accent: '#22C55E',
  },
  {
    id: 'thorned_carapace',
    name: 'Thorned Iron Fortress',
    relicIds: ['runic_carapace', 'thorned_aegis'],
    description: 'Entering a new room discharges a retaliatory concussive stun wave.',
    accent: '#A855F7',
  },
  {
    id: 'twin_pierce',
    name: 'Twin-Shaft Cataclysm',
    relicIds: ['twinstring_charm', 'piercing_prism'],
    description: 'Both primary projectiles pierce through all targets without damage reduction.',
    accent: '#E0A94F',
  },
];
