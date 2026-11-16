import { CRIT_DAMAGE_MULTIPLIER, HERO_CLASSES, MAX_LEVEL, type HeroClassId, type PlayerState, type DamageCategory } from './types.ts';
import { computePlayerMoveSpeed } from './playerMovement.ts';

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

  faithCcTenacityPct: number; // e.g. 15.0% debuff reduction

  // Offense & DPS
  primaryCategory: DamageCategory;
  primaryStatName: 'Strength' | 'Dexterity' | 'Intelligence' | 'Faith';
  primaryStatValue: number;
  damageMultiplier: number; // e.g. 2.45
  healingMultiplier: number; // Cleric Level & Faith healing multiplier (1.0 for non-Cleric)
  healingBonusPct: number;
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
  directDps: number; // Direct attack & crit/twinstring DPS before DoTs
  sustainedDps: number; // Combined average damage per second (direct + active DoT relics)

  // Hybrid DoT Scaling & Relic Projections
  dotMultiplier: number; // 1 + 0.003 * (Level - 1) + 0.001 * PrimaryAttr
  dotBonusPct: number; // e.g. 19.7% bonus DoT damage
  hasBurnRelic: boolean;
  hasPoisonRelic: boolean;
  hasBleedRelic: boolean;
  burnTickDamage: number; // per 0.65s tick (0-res baseline)
  poisonTickDamage: number; // per 0.65s tick (0-res baseline)
  bleedTickDamage: number; // stationary per 0.65s tick
  bleedMovingTickDamage: number; // moving per 0.65s tick
  dotDpsContribution: number; // combined active relic DoT DPS per second

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

export function calculatePlayerStatProjections(p: PlayerState, floor = 1): PlayerStatProjections {
  const heroClass = p.heroClass || 'vanguard';
  const def = HERO_CLASSES[heroClass] || HERO_CLASSES.vanguard;
  const level = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
  const safeFloor = Math.max(1, floor || 1);
  const str = Math.max(0, p.strength || 0);
  const vit = Math.max(0, p.vitality || 0);
  const dex = Math.max(0, p.dexterity || 0);
  const intStat = Math.max(0, p.intelligence || 0);
  const fth = Math.max(0, p.faith || 0);
  const relics = p.relics || [];
  const floorBlessings = p.floorBlessings || [];
  let furyStacks = 0;
  let swiftStacks = 0;
  let bastionStacks = 0;
  for (let i = 0; i < floorBlessings.length; i++) {
    if (floorBlessings[i] === 'fury') furyStacks++;
    else if (floorBlessings[i] === 'swiftness') swiftStacks++;
    else if (floorBlessings[i] === 'bastion') bastionStacks++;
  }

  // 1. Health
  const baseHp = def.maxHp;
  const levelHpBonus = (level - 1) * 12;
  const vitHpBonus = vit * 5;
  const relicHpBonus = relics.includes('bastion_pauldron') ? 30 : 0;
  const maxHp = baseHp + levelHpBonus + vitHpBonus + relicHpBonus;

  // Combat HP Regen (pulse every 2.0s for vit >= 6)
  const hpRegenPerTick = vit >= 6 ? Math.max(1, Math.floor(vit * 0.1)) : 0;
  const hpRegenPerSec = hpRegenPerTick / 2.0;

  // 2. Physical Armor & Mitigation
  const basePhysicalResistPct = (def.resistances?.physical || 0) * 100;
  const strPhysicalResistPct = Math.min(15, str * 0.15);
  let relicPhysicalResistPct = 0;
  if (relics.includes('runic_carapace')) relicPhysicalResistPct += 15;
  if (relics.includes('thorned_aegis')) relicPhysicalResistPct += 10;

  const rawPhysRes =
    (basePhysicalResistPct / 100) +
    (strPhysicalResistPct / 100) +
    (relicPhysicalResistPct / 100) +
    bastionStacks * 0.06;
  const physicalResistPct = Number(Math.min(75, Math.max(0, rawPhysRes * 100)).toFixed(1));

  const vanguardIronWillPct = heroClass === 'vanguard' ? 15 : 0;

  // 3. Elemental Resistance
  const baseElem = ((def.resistances?.fire || 0) + (def.resistances?.frost || 0) + (def.resistances?.lightning || 0)) / 3;
  const baseElementalResistPct = Number((baseElem * 100).toFixed(1));
  const intElementalResistPct = Math.min(15, intStat * 0.15);
  const relicElementalResistPct = relics.includes('runic_carapace') ? 20 : 0;

  const rawElemRes =
    baseElem +
    (intElementalResistPct / 100) +
    (relicElementalResistPct / 100) +
    bastionStacks * 0.06;
  const elementalResistPct = Number(Math.min(75, Math.max(0, rawElemRes * 100)).toFixed(1));

  // 4. Faith Crowd Control Tenacity
  const faithCcTenacityPct = Number(Math.min(40, fth * 0.3).toFixed(1));

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

  let damageMultiplier = (1 + (level - 1) * 0.05) * (1 + primaryStatValue * 0.015);
  if (relics.includes('sunfire_signet')) damageMultiplier *= 1.24;
  if (furyStacks > 0) damageMultiplier *= 1 + furyStacks * 0.10;

  const rawHealingMult = heroClass === 'cleric' ? (1 + (level - 1) * 0.05) * (1 + fth * 0.02) : 1.0;
  const healingMultiplier = Number(rawHealingMult.toFixed(2));
  const healingBonusPct = Number(((rawHealingMult - 1) * 100).toFixed(1));

  const baseHitDamage = def.damage;
  const scaledHitDamage = Math.round(baseHitDamage * damageMultiplier);

  // 6. Attack Speed & Cooldown
  const baseAttackCooldownMs = def.attackCooldownMs;
  const dexSpeedBonusPct = Number((dex * 0.4).toFixed(1)); // +0.4% rate per DEX
  const dexSpeedMult = (1 + dex * 0.004) * (1 + swiftStacks * 0.08);
  const hasteMult = (p.hasteMs || 0) > 0 ? 0.8 : 1.0;
  const frostbiteMult = (p.statuses || []).some((s) => s.type === 'frostbite') ? 1.25 : 1.0;

  const attackCooldownMs = Math.max(100, Math.round((baseAttackCooldownMs * hasteMult * frostbiteMult) / dexSpeedMult));
  const attacksPerSecond = Number((1000 / attackCooldownMs).toFixed(2));

  // 7. Critical Strike
  const baseCritChancePct = 10.0;
  const dexCritChancePct = Number((dex * 0.3).toFixed(1));
  const relicCritChancePct = relics.includes('keen_arrowhead') ? 20.0 : 0.0;
  const rawCritChance = baseCritChancePct + dex * 0.3 + relicCritChancePct;
  const critChancePct = Number(Math.min(45.0, rawCritChance).toFixed(1));
  const critMultiplier = CRIT_DAMAGE_MULTIPLIER;
  const critHitDamage = Math.round(scaledHitDamage * critMultiplier);

  // 8. Hybrid DoT Scaling & Relic Projections (matches GameRoom.computeDotMultiplier)
  const rawDotMult = 1 + 0.003 * (level - 1) + 0.001 * primaryStatValue;
  const dotMultiplier = Number(rawDotMult.toFixed(3));
  const dotBonusPct = Number(((rawDotMult - 1) * 100).toFixed(1));
  const hasBurnRelic = relics.includes('cinder_heart');
  const hasPoisonRelic = relics.includes('viper_crucible');
  const hasBleedRelic = relics.includes('bloodletter_talisman');

  const burnTickDamage = Math.max(1, Math.round((7 + safeFloor) * rawDotMult));
  const poisonTickDamage = Math.max(1, Math.round((5 + safeFloor) * rawDotMult));
  const bleedTickDamage = Math.max(1, Math.round((7 + safeFloor) * rawDotMult));
  const bleedMovingTickDamage = Math.max(1, Math.round((14 + safeFloor) * rawDotMult));

  const rawDotDps =
    (hasBurnRelic ? burnTickDamage / 0.65 : 0) +
    (hasPoisonRelic ? poisonTickDamage / 0.65 : 0) +
    (hasBleedRelic ? bleedTickDamage / 0.65 : 0);
  const dotDpsContribution = Number(rawDotDps.toFixed(1));

  // 9. Sustained DPS Projection (direct attacks + active DoT relics)
  const extraProjectileFactor = relics.includes('twinstring_charm') ? 0.75 : 0;
  const avgDamagePerHit = (scaledHitDamage * (1 - critChancePct / 100)) + (critHitDamage * (critChancePct / 100));
  const totalPerShotDmg = avgDamagePerHit * (1 + extraProjectileFactor);
  const rawDirectDps = totalPerShotDmg * attacksPerSecond;
  const directDps = Number(rawDirectDps.toFixed(1));
  const sustainedDps = Number((rawDirectDps + rawDotDps).toFixed(1));

  // 10. Mobility & Cooldown Reduction (matches computePlayerMoveSpeed & GameRoom CDR cap)
  const moveSpeedPx = Math.round(
    computePlayerMoveSpeed({
      heroClass,
      dexterity: dex,
      relics,
      hasteMs: p.hasteMs,
      speedBoost: p.speedBoost,
      floorBlessings: p.floorBlessings,
      statuses: p.statuses,
    })
  );
  const moveSpeedBonusPct = Number((((moveSpeedPx - def.speed) / def.speed) * 100).toFixed(1));

  const intCdrPct = Math.min(20, intStat * 0.2);
  const relicCdrPct = relics.includes('hourglass_shard') ? 25 : 0;
  const blessingCdrPct = swiftStacks * 8;
  const cooldownReductionPct = Number(Math.min(50, intCdrPct + relicCdrPct + blessingCdrPct).toFixed(1));

  const cdrFactor = 1 - (cooldownReductionPct / 100);
  const tacticalCooldownSec = Number(((def.tacticalCooldownMs * cdrFactor) / 1000).toFixed(1));
  const ultCooldownSec = Number(((def.ultCooldownMs * cdrFactor) / 1000).toFixed(1));

  // 11. Piercing
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
    healingMultiplier,
    healingBonusPct,
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
    directDps,
    sustainedDps,
    dotMultiplier,
    dotBonusPct,
    hasBurnRelic,
    hasPoisonRelic,
    hasBleedRelic,
    burnTickDamage,
    poisonTickDamage,
    bleedTickDamage,
    bleedMovingTickDamage,
    dotDpsContribution,
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
