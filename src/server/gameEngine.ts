import {
  CRIT_DAMAGE_MULTIPLIER,
  HERO_CLASSES,
  MAX_ATTRIBUTE,
  MAX_LEVEL,
  RELIC_CATALOG,
  TILE_SIZE,
  type ChatMessage,
  type DamageCategory,
  type DifficultyTier,
  type DungeonMap,
  type EnemyKind,
  type EnemyResistances,
  type EnemyState,
  type FieldZoneState,
  FLOOR_BLESSINGS,
  getDamageTypeColor,
  inferDamageCategoryFromProjectileStyle,
  type FloatingEvent,
  type FloorBlessingId,
  type GameSnapshot,
  type HeroClassId,
  type LastRunSummary,
  type NpcState,
  type PlayerInputState,
  type PlayerState,
  type PlayerStatusEffect,
  type PlayerStatusType,
  type ProjectileState,
  type PropState,
  type RoomNode,
  type RoomStatus,
  type RoomSummary,
  type TrainingDummyState,
  type VestmentPassiveId,
} from '../shared/types.ts';
import {
  collidesCircle as sharedCollidesCircle,
  computePlayerMoveSpeed,
  hasLineOfSight as sharedHasLineOfSight,
  isWallAtWorld as sharedIsWallAtWorld,
  moveWithCollision as sharedMoveWithCollision,
  normalizePlayerInputDirection,
} from '../shared/playerMovement.ts';
import {
  computeGroundTargetPosition,
  findBestAutoTarget,
  getAbilityTargetSpec,
  getPrimaryAttackRange,
  resolveSkillSmartTarget,
} from '../shared/abilityTargeting.ts';
import { generateDungeonFloor, generateTavernFloor, makeEnemy } from './dungeonGenerator.ts';
import {
  ARCANIST_SCROLLS,
  ARCANIST_SPELLS,
  computeArcanistSpellDamage,
  distancePointToSegment,
  getArcanistScrollDef,
  normalizeAngle,
  rotateAngleToward,
  STAR_RIFT_PROC_COOLDOWN_MS,
  STAR_RIFT_REQUIRED_ATTACKS,
  type ArcanistScrollId,
  type ArcanistSpellId,
} from '../shared/arcanist.ts';
import {
  ARMAMENT_TUNING,
  getArmamentDef,
  getDefaultVestmentIdForClass,
  getDefaultWeaponIdForClass,
  normalizeArmamentLoadout,
  pickNextUnlockableArmamentForClass,
  resolveActiveVestmentPassive,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
  type WeaponDef,
  type WeaponModifiers,
} from '../shared/armaments.ts';

interface PendingArcaneBarrage {
  wavesRemaining: number;
  waveIndex: number;
  timerMs: number;
  waveIntervalMs: number;
  aimAngle: number;
  targetEnemyId?: string;
  empoweredMult?: number;
}

interface PlayerRuntime {
  state: PlayerState;
  input: PlayerInputState;
  attackCooldownMs: number;
  enteredRooms: Set<number>;
  attackCount: number;
  starRiftAttackCount: number;
  pendingBarrage?: PendingArcaneBarrage | null;
  heatLastHitAtMs: number;
  momentumHoldMs: number;
  predatorLastHitAtMs: number;
  solarisLastHealAtMs: number;
  eclipseHoldActive: boolean;
  eclipseHoldStartMs: number;
  pendingEclipseReleaseMs: number | null;
  dummyGaleburstStacks: Map<string, number>;
}

interface EnemyRuntimeMeta {
  hardCcStage: number;
  lastHardCcAtMs: number;
  burnOwnerId: string | null;
  burnMultiplier: number | null;
  burnBaseTick: number | null;
  poisonOwnerId: string | null;
  poisonMultiplier: number | null;
  poisonBaseTick: number | null;
  bleedOwnerId: string | null;
  bleedMultiplier: number | null;
  bossPhase: number;
  lastBossAbility: number;
  bossTargetId: string | null;
  bossTargetSwitchAtMs: number;
  bossAbilityCooldowns: Record<number, number>;
  chargeHitPlayerIds: Set<string>;
  bossStrafeDir: number;
  bossStrafeFlipAtMs: number;
  bossRecentDmgTaken: number;
  bossRecentDmgAtMs: number;
  galeburstByOwner?: Map<string, number>;
}

const MAX_FLOORS_FOR_VICTORY = 10;

export class GameRoom {
  public readonly roomId: string;
  public readonly name: string;
  public hostId: string;
  public hostName: string;
  public readonly difficulty: DifficultyTier;
  public readonly baseSeed: number;
  public readonly maxPlayers: number;

  public status: RoomStatus = 'playing';
  public floor = 1;
  public map!: DungeonMap;
  public enemies: EnemyState[] = [];
  public projectiles: ProjectileState[] = [];
  public props: PropState[] = [];
  public zones: FieldZoneState[] = [];
  public npcs: NpcState[] = [];
  public trainingDummies: TrainingDummyState[] = [];
  public pendingEvents: FloatingEvent[] = [];
  public chat: ChatMessage[] = [];
  public spawnPoint = { x: 256, y: 256 };
  public lastRunSummary: LastRunSummary | null = null;

  private players = new Map<string, PlayerRuntime>();
  private enemyMeta = new Map<string, EnemyRuntimeMeta>();
  private zoneHitPlayers = new Map<string, Set<string>>();
  private arcaneOrbHits = new Map<string, Map<string, { hits: number; lastHitAtMs: number }>>();
  private entitySeq = 1;
  private simTimeMs = 0;
  private startedAt = Date.now();
  private endedAt: number | null = null;
  private zoneTickAccumMs = 0;
  private statusDotAccumMs = 0;
  private clericAuraAccumMs = 0;
  private floorMasteryAwarded = false;
  private entityStatusTextCooldowns = new Map<string, number>();
  private primaryAttackProjIds = new Set<string>();
  private tacticalProjIds = new Set<string>();
  private voidCreditedProjIds = new Set<string>();
  private temporalCreditedProjIds = new Set<string>();
  private triggeredOnceProjIds = new Set<string>();
  public onFloorClearedCallback?: (playerIds: string[], floor: number) => void;
  public onKillCallback?: (playerId: string) => void;
  public onReviveCallback?: (playerId: string) => void;
  public onProgressionUpdateCallback?: (playerId: string, state: PlayerState) => void;
  public onArmamentUnlockedCallback?: (playerId: string, slot: 'weapon' | 'vestment', itemId: string) => void;
  public onChatMessageCallback?: (msg: ChatMessage) => void;

  constructor(opts: {
    roomId: string;
    name: string;
    hostName: string;
    hostId?: string;
    difficulty: DifficultyTier;
    seed?: number;
    initialFloor?: number;
    initialStatus?: RoomStatus;
  }) {
    this.roomId = opts.roomId;
    this.name = opts.name;
    this.hostId = opts.hostId || '';
    this.hostName = opts.hostName;
    this.difficulty = opts.difficulty;
    this.maxPlayers = opts.roomId === 'TAVERN-HUB' ? 50 : 4;
    this.baseSeed =
      opts.seed && opts.seed > 0
        ? Math.floor(opts.seed)
        : Math.floor(100000 + Math.random() * 899999);
    const startFloor =
      opts.initialFloor !== undefined ? opts.initialFloor : opts.roomId === 'TAVERN-HUB' ? 0 : 1;
    this.status = opts.roomId === 'TAVERN-HUB' ? 'playing' : (opts.initialStatus ?? 'playing');

    if (this.status === 'waiting') {
      this.floor = startFloor;
      const preview = generateDungeonFloor(startFloor, this.baseSeed, this.difficulty, 1);
      this.map = preview.map;
      this.spawnPoint = preview.spawnPoint;
      this.enemies = [];
      this.props = [];
      this.npcs = [];
      this.trainingDummies = [];
      this.projectiles = [];
      this.zones = [];
    } else {
      this.loadFloor(startFloor, 1);
    }
  }

  public static computePlayerMaxHp(
    heroClass: HeroClassId,
    level: number,
    vitality: number,
    relics: string[] = [],
    equippedVestment?: string | null
  ): number {
    const def = HERO_CLASSES[heroClass];
    const baseHp = def ? def.maxHp : 100;
    const clampedLvl = Math.max(1, Math.min(MAX_LEVEL, level || 1));
    const levelBonus = (clampedLvl - 1) * 12;
    const vitBonus = (vitality || 0) * 5;
    const relicBonus = relics.includes('bastion_pauldron') ? 30 : 0;
    const vestmentBonus =
      resolveEquippedVestmentForClass(heroClass, equippedVestment)?.modifiers.maxHpBonus || 0;
    return baseHp + levelBonus + vitBonus + relicBonus + vestmentBonus;
  }

  public static computeHealingAmount(
    baseHealing: number,
    healer?: {
      heroClass?: HeroClassId;
      level?: number;
      faith?: number;
      equippedWeapon?: string | null;
      equippedVestment?: string | null;
    } | null,
    target?: PlayerState | null
  ): number {
    if (baseHealing <= 0) return 0;
    
    let healing = baseHealing;

    if (healer && healer.heroClass === 'cleric') {
      const lvl = Math.max(1, Math.min(MAX_LEVEL, healer.level || 1));
      const fth = Math.max(0, healer.faith || 0);
      const levelMult = 1 + (lvl - 1) * 0.015;
      const faithMult = 1 + fth * 0.006;
      const weaponHealBonus =
        resolveEquippedWeaponForClass('cleric', healer.equippedWeapon)?.modifiers.healingBonusPct || 0;
      const vestmentHealBonus =
        resolveEquippedVestmentForClass('cleric', healer.equippedVestment)?.modifiers.auraHealBonusPct || 0;
      healing = healing * levelMult * faithMult * (1 + weaponHealBonus + vestmentHealBonus);
    }

    // Floor 7: Ashen Curse - Reduces healing received by 45%
    if (target && target.statuses && target.statuses.some(s => s.type === 'ashen_curse')) {
      healing *= 0.55;
    }

    return Math.max(1, Math.round(healing));
  }

  public getActivePassive(p: PlayerState): VestmentPassiveId {
    return resolveActiveVestmentPassive(p.heroClass, p.equippedVestment);
  }

  private syncPassiveMetadata(pr: PlayerRuntime): void {
    pr.state.activePassiveId = this.getActivePassive(pr.state);
  }

  private clearEclipseCharge(pr: PlayerRuntime): void {
    pr.eclipseHoldActive = false;
    pr.eclipseHoldStartMs = 0;
    pr.pendingEclipseReleaseMs = null;
    pr.state.eclipseChargeRatio = 0;
  }

  private clearGaleburstForPlayer(playerId: string): void {
    const pr = this.players.get(playerId);
    if (pr) {
      pr.dummyGaleburstStacks.clear();
    }
    for (const enemy of this.enemies) {
      const meta = this.enemyMeta.get(enemy.id);
      if (meta?.galeburstByOwner?.delete(playerId)) {
        this.syncEnemyGaleburstMarks(enemy, meta);
      }
    }
  }

  private syncEnemyGaleburstMarks(enemy: EnemyState, meta: EnemyRuntimeMeta): void {
    let maxStacks = 0;
    if (meta.galeburstByOwner) {
      for (const count of meta.galeburstByOwner.values()) {
        if (count > maxStacks) maxStacks = count;
      }
    }
    enemy.galeburstMarks = maxStacks;
  }

  private resetPassiveState(pr: PlayerRuntime): void {
    const p = pr.state;
    p.vanguardHeat = 0;
    p.rangerMomentum = 0;
    p.predatorTargetId = null;
    p.predatorStacks = 0;
    p.voidEnergy = 0;
    p.storedGrace = 0;
    p.clericSanctity = 0;
    p.eclipseChargeRatio = 0;
    pr.starRiftAttackCount = 0;
    pr.heatLastHitAtMs = 0;
    pr.momentumHoldMs = 0;
    pr.predatorLastHitAtMs = 0;
    pr.solarisLastHealAtMs = 0;
    this.clearEclipseCharge(pr);
    this.clearGaleburstForPlayer(p.id);
    this.syncPassiveMetadata(pr);
  }

  private getPlayerCritChance(p: PlayerState, weaponMods?: WeaponModifiers): number {
    const wMods =
      weaponMods ?? resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers;
    const vMods = resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
    return Math.min(
      0.45,
      0.1 +
        (p.dexterity || 0) * 0.003 +
        (p.relics.includes('keen_arrowhead') ? 0.2 : 0) +
        (wMods?.critChanceBonus || 0) +
        (vMods?.critChanceBonus || 0)
    );
  }

  private getPlayerAttackSpeedMult(p: PlayerState): number {
    const dexSpeedMult =
      (1 + (p.dexterity || 0) * 0.004) *
      (1 + this.getBlessingStacks(p, 'swiftness') * 0.08);
    const weaponAttackSpeedMult =
      resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers.attackSpeedMult ?? 1.0;
    const vestmentAttackSpeedBonus =
      resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.attackSpeedBonus ||
      0;
    const momentumBonus =
      this.getActivePassive(p) === 'momentum'
        ? (Math.min(ARMAMENT_TUNING.passives.momentum.cap, p.rangerMomentum || 0) /
            ARMAMENT_TUNING.passives.momentum.cap) *
          ARMAMENT_TUNING.passives.momentum.maxAttackSpeedBonusPct
        : 0;
    return dexSpeedMult * weaponAttackSpeedMult * (1 + vestmentAttackSpeedBonus + momentumBonus);
  }

  private consumeVoidEnergyForTactical(p: PlayerState): number {
    if (this.getActivePassive(p) !== 'void_consumption') return 1.0;
    const cfg = ARMAMENT_TUNING.passives.voidConsumption;
    if ((p.voidEnergy || 0) < cfg.cap) return 1.0;
    p.voidEnergy = 0;
    this.emitEvent('status', p.x, p.y - 26, 'VOID EMPOWERED!', '#A855F7');
    return 1 + cfg.empoweredTacticalBonusPct;
  }

  private grantVoidEnergyFromPrimary(p: PlayerState, projId?: string): void {
    if (this.getActivePassive(p) !== 'void_consumption') return;
    if (projId) {
      if (this.voidCreditedProjIds.has(projId)) return;
      this.voidCreditedProjIds.add(projId);
    }
    const cfg = ARMAMENT_TUNING.passives.voidConsumption;
    p.voidEnergy = Math.min(cfg.cap, (p.voidEnergy || 0) + cfg.gainPerHit);
  }

  private onTacticalHitConfirmed(attacker: PlayerState | null | undefined): void {
    if (!attacker || attacker.downed) return;
    if (this.getActivePassive(attacker) === 'temporal_acceleration' && attacker.ultCooldownMs > 0) {
      attacker.ultCooldownMs = Math.max(
        0,
        attacker.ultCooldownMs - ARMAMENT_TUNING.passives.temporalAcceleration.ultReductionPerTacticalHitMs
      );
    }
  }

  private onConfirmedPrimaryHit(owner: PlayerState, projId?: string): void {
    if (!owner || owner.downed) return;
    this.grantVoidEnergyFromPrimary(owner, projId);

    const activePassive = this.getActivePassive(owner);
    if (activePassive === 'temporal_acceleration') {
      if (!projId || !this.temporalCreditedProjIds.has(projId)) {
        if (projId) this.temporalCreditedProjIds.add(projId);
        if (owner.skillCooldownMs > 0) {
          owner.skillCooldownMs = Math.max(
            0,
            owner.skillCooldownMs -
              ARMAMENT_TUNING.passives.temporalAcceleration.tacticalReductionPerBasicHitMs
          );
        }
      }
    } else if (activePassive === 'heat') {
      const hCfg = ARMAMENT_TUNING.passives.heat;
      const pr = this.players.get(owner.id);
      owner.vanguardHeat = Math.min(hCfg.cap, (owner.vanguardHeat || 0) + hCfg.gainPerHit);
      if (pr) pr.heatLastHitAtMs = this.simTimeMs;
    }
  }

  private cleanupProjectileTracking(projId: string): void {
    this.arcaneOrbHits.delete(projId);
    this.primaryAttackProjIds.delete(projId);
    this.tacticalProjIds.delete(projId);
    this.voidCreditedProjIds.delete(projId);
    this.temporalCreditedProjIds.delete(projId);
    this.triggeredOnceProjIds.delete(projId);
  }

  private applyEffectiveHealing(
    healer: PlayerState | null | undefined,
    target: PlayerState,
    preComputedAmount: number,
    source: 'aura' | 'tactical' | 'ult' | 'solaris' | 'shared_grace' | 'sacred_retribution' | 'regen'
  ): number {
    if (!target || target.downed || preComputedAmount <= 0) return 0;
    const missing = Math.max(0, target.maxHp - target.hp);
    const effective = Math.min(missing, Math.max(0, Math.round(preComputedAmount)));
    if (effective <= 0) return 0;
    target.hp += effective;
    this.emitEvent('heal', target.x, target.y - 20, `+${effective}`, '#34D399');

    if (healer && !healer.downed && healer.connected && healer.id !== target.id) {
      const passive = this.getActivePassive(healer);
      if (
        passive === 'shared_grace' &&
        source !== 'shared_grace' &&
        source !== 'sacred_retribution'
      ) {
        const sgCfg = ARMAMENT_TUNING.passives.sharedGrace;
        const storedGain = effective * sgCfg.storePct;
        healer.storedGrace = Math.min(
          sgCfg.maxCap,
          Number(((healer.storedGrace || 0) + storedGain).toFixed(2))
        );
      } else if (
        passive === 'sacred_retribution' &&
        source !== 'sacred_retribution' &&
        source !== 'shared_grace'
      ) {
        const srCfg = ARMAMENT_TUNING.passives.sacredRetribution;
        healer.clericSanctity = Math.min(
          srCfg.cap,
          (healer.clericSanctity || 0) + srCfg.sanctityPerHeal
        );
      }
    }
    return effective;
  }

  private triggerSharedGraceForAlly(ally: PlayerState): void {
    if (!ally || ally.downed || !ally.connected || ally.hp <= 0 || ally.hp >= ally.maxHp) return;
    const cfg = ARMAMENT_TUNING.passives.sharedGrace;
    if (ally.hp / Math.max(1, ally.maxHp) >= cfg.triggerHpRatio) return;

    for (const pr of this.players.values()) {
      const cleric = pr.state;
      if (cleric.id === ally.id || cleric.downed || !cleric.connected) continue;
      if (this.getActivePassive(cleric) !== 'shared_grace') continue;
      if ((cleric.storedGrace || 0) < 1) continue;
      if (Math.hypot(ally.x - cleric.x, ally.y - cleric.y) > cfg.releaseRangePx) continue;

      const missing = Math.max(0, ally.maxHp - ally.hp);
      if (missing <= 0) break;
      const curseMult =
        ally.statuses && ally.statuses.some((s) => s.type === 'ashen_curse') ? 0.55 : 1.0;
      const rawPool = Math.min(Math.floor(cleric.storedGrace || 0), Math.ceil(missing / curseMult));
      if (rawPool <= 0) continue;
      const healToApply = Math.min(missing, Math.max(1, Math.round(rawPool * curseMult)));
      cleric.storedGrace = Math.max(
        0,
        Number(((cleric.storedGrace || 0) - rawPool).toFixed(2))
      );
      this.applyEffectiveHealing(cleric, ally, healToApply, 'shared_grace');
      this.emitEvent('status', ally.x, ally.y - 32, 'SHARED GRACE!', '#34D399');
    }
  }

  private triggerSharedGraceTick(): void {
    const cfg = ARMAMENT_TUNING.passives.sharedGrace;
    for (const pr of this.players.values()) {
      const cleric = pr.state;
      if (cleric.downed || !cleric.connected) continue;
      if (this.getActivePassive(cleric) !== 'shared_grace') continue;
      if ((cleric.storedGrace || 0) < 1) continue;
      for (const allyPr of this.players.values()) {
        const ally = allyPr.state;
        if (ally.id === cleric.id || ally.downed || !ally.connected) continue;
        if (ally.hp <= 0 || ally.hp >= ally.maxHp) continue;
        if (ally.hp / Math.max(1, ally.maxHp) >= cfg.triggerHpRatio) continue;
        if (Math.hypot(ally.x - cleric.x, ally.y - cleric.y) > cfg.releaseRangePx) continue;
        this.triggerSharedGraceForAlly(ally);
        if ((cleric.storedGrace || 0) < 1) break;
      }
    }
  }

  public static computeNextXp(level: number): number {
    if (level >= MAX_LEVEL) return 999999;
    const lvl = Math.max(1, level);
    // Smooth, rewarding progression curve that scales with dungeon exploration:
    // L1: 80, L5: 421, L10: 1,120, L25: 4,850, L49: 14,030, L50 (Cap): MAX
    return Math.round(80 + (lvl - 1) * 60 + Math.pow(lvl - 1, 1.75) * 12);
  }

  public computeEnemyDamage(baseHit: number, enemy?: EnemyState | null): number {
    const diffMult = this.difficulty === 'Abyssal' ? 1.40 : this.difficulty === 'Heroic' ? 1.18 : 1.0;
    const floorBonus = (this.floor - 1) * 2;
    const partyScale = 1 + Math.max(0, this.players.size - 1) * 0.10;
    let dmg = (baseHit + floorBonus) * diffMult * partyScale;
    if (enemy && enemy.kind === 'boss' && this.floor > 0) {
      const wards = this.getBossWards();
      if (wards > 0) {
        dmg *= 1 + Math.min(0.28, wards * 0.07);
      }
    }
    if (enemy && (enemy.poisonedMs || 0) > 0) {
      dmg *= 0.70;
    }
    return Math.max(1, Math.round(dmg));
  }

  public getBlessingStacks(p: PlayerState, kind: FloorBlessingId): number {
    return (p.floorBlessings || []).filter((b) => b === kind).length;
  }

  public getMaxBossWards(): number {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === 'combat').length;
  }

  public getBossWards(): number {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === 'combat' && !r.cleared).length;
  }

  public getGuardiansTotal(): number {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === 'combat' && r.guardian).length;
  }

  public getGuardiansRemaining(): number {
    if (this.floor <= 0 || !this.map) return 0;
    return this.map.rooms.filter((r) => r.type === 'combat' && r.guardian && !r.cleared).length;
  }

  public computeHealingAmount(
    baseHealing: number,
    healer?: {
      heroClass?: HeroClassId;
      level?: number;
      faith?: number;
      equippedWeapon?: string | null;
      equippedVestment?: string | null;
    } | null,
    target?: PlayerState | null
  ): number {
    return GameRoom.computeHealingAmount(baseHealing, healer, target);
  }

  public static getEnemyResistance(
    res: EnemyResistances | undefined,
    category: DamageCategory
  ): number {
    if (!res) return 0;
    let rawRes = 0;
    switch (category) {
      case 'physical':
        rawRes = res.physical ?? 0;
        break;
      case 'arcane':
        rawRes = res.arcane ?? ((res.fire ?? 0) + (res.frost ?? 0) + (res.lightning ?? 0)) / 3;
        break;
      case 'divine':
        rawRes = res.divine ?? ((res.fire ?? 0) + (res.lightning ?? 0)) / 2;
        break;
      case 'fire':
        rawRes = res.fire ?? 0;
        break;
      case 'frost':
        rawRes = res.frost ?? 0;
        break;
      case 'lightning':
        rawRes = res.lightning ?? 0;
        break;
      case 'poison':
        rawRes = res.poison ?? 0;
        break;
      case 'bleed':
        rawRes = res.bleed ?? 0;
        break;
      default:
        rawRes = res.physical ?? 0;
        break;
    }
    return Math.min(0.75, Math.max(-0.5, rawRes));
  }

  public getEnemyResistance(
    res: EnemyResistances | undefined,
    category: DamageCategory
  ): number {
    return GameRoom.getEnemyResistance(res, category);
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.entitySeq++}`;
  }

  public loadFloor(floorNum: number, partySize: number): void {
    if (this.roomId === 'TAVERN-HUB') {
      floorNum = 0;
    }
    this.floor = floorNum;
    this.enemyMeta.clear();
    this.zoneHitPlayers.clear();
    this.arcaneOrbHits.clear();
    this.primaryAttackProjIds.clear();
    this.tacticalProjIds.clear();
    this.voidCreditedProjIds.clear();
    this.temporalCreditedProjIds.clear();
    this.triggeredOnceProjIds.clear();
    if (floorNum === 0) {
      const tav = generateTavernFloor();
      this.map = tav.map;
      this.enemies = tav.enemies;
      this.props = tav.props;
      this.npcs = tav.npcs;
      this.trainingDummies = tav.trainingDummies;
      this.projectiles = [];
      this.zones = [];
      this.spawnPoint = tav.spawnPoint;
    } else {
      const generated = generateDungeonFloor(
        floorNum,
        this.baseSeed,
        this.difficulty,
        Math.max(1, partySize)
      );
      this.map = generated.map;
      this.enemies = generated.enemies;
      this.props = generated.props;
      this.npcs = [];
      this.trainingDummies = [];
      this.projectiles = [];
      this.zones = [];
      this.spawnPoint = generated.spawnPoint;
    }

    this.floorMasteryAwarded = false;

    let idx = 0;
    for (const pr of this.players.values()) {
      const offsetAngle = (idx * Math.PI) / 2;
      pr.state.x = this.spawnPoint.x + Math.cos(offsetAngle) * 20;
      pr.state.y = this.spawnPoint.y + Math.sin(offsetAngle) * 20;
      pr.state.readyNextFloor = false;
      pr.state.statuses = [];
      pr.state.floorBlessings = [];
      pr.state.spellCastState = null;
      pr.state.disintegrationState = null;
      pr.state.chronoSuspendedMs = 0;
      pr.state.activeChestPropId = null;
      pr.state.pendingRelicChoices = [];
      pr.state.pendingScrollChoices = [];
      pr.state.predatorTargetId = null;
      pr.state.predatorStacks = 0;
      pr.dummyGaleburstStacks.clear();
      this.clearEclipseCharge(pr);
      this.syncPassiveMetadata(pr);
      pr.pendingBarrage = null;
      pr.enteredRooms.clear();
      pr.enteredRooms.add(0);
      if (pr.state.downed) {
        pr.state.downed = false;
        pr.state.hp = Math.round(pr.state.maxHp * 0.5);
      } else {
        pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + 25);
      }
      idx++;
    }
  }

  public applyPlayerStatus(
    p: PlayerState,
    statusType: PlayerStatusType,
    durationMs: number,
    value?: number,
    sourceId?: string
  ): void {
    if (p.downed || p.godMode) return;

    // Resistance scaling
    const classDef = HERO_CLASSES[p.heroClass];
    const res = classDef?.resistances || {
      physical: 0, fire: 0, frost: 0, lightning: 0, poison: 0, bleed: 0
    };
    
    let resMult = 1.0;
    if (statusType === 'frostbite') resMult = 1 - (res.frost || 0);
    if (statusType === 'scorched') resMult = 1 - (res.fire || 0);
    if (statusType === 'ashen_curse') resMult = 1 - (res.poison || 0); // Ashen curse scales with poison res for simplicity
    
    // Faith + Vestment Tenacity confers spiritual resilience: reduces debuff duration
    const vestmentTenacity =
      resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.ccTenacityBonus || 0;
    const faithTenacity = Math.min(0.55, (p.faith || 0) * 0.003 + vestmentTenacity);
    const effectiveDuration = Math.round(durationMs * Math.max(0.2, resMult * (1 - faithTenacity)));

    const existing = p.statuses.find(s => s.type === statusType);
    if (existing) {
      existing.durationMs = Math.max(existing.durationMs, effectiveDuration);
      existing.maxDurationMs = Math.max(existing.maxDurationMs, effectiveDuration);
      if (value !== undefined) existing.value = value;
      return;
    }

    const id = this.nextId('status');
    p.statuses.push({
      id,
      type: statusType,
      durationMs: effectiveDuration,
      maxDurationMs: effectiveDuration,
      value,
      sourceId,
      detonationTimerMs: (statusType === 'voidmarked' || statusType === 'condemned') ? 3000 : undefined
    });

    let label = statusType.toUpperCase().replace('_', ' ');
    let color = '#CBD5E1';
    switch (statusType) {
      case 'guard_broken': color = '#60A5FA'; break;
      case 'frostbite': color = '#38BDF8'; break;
      case 'scorched': color = '#EF4444'; break;
      case 'voidmarked': color = '#A855F7'; break;
      case 'disoriented': color = '#818CF8'; break;
      case 'charmed': color = '#FDE68A'; break;
      case 'ashen_curse': color = '#D9AA52'; break;
      case 'silenced': color = '#A855F7'; break;
      case 'impaled': color = '#FBBF24'; break;
      case 'condemned': color = '#FDE047'; break;
    }
    this.emitEvent('status', p.x, p.y - 32, `[${label}]`, color);
  }

  private detonateVoidmark(p: PlayerState, s: PlayerStatusEffect): void {
    this.emitEvent('status', p.x, p.y - 20, 'VOID DETONATION!', '#A855F7');
    const dmg = 35 + this.floor * 5;
    this.damagePlayer(p, dmg, 'arcane');
    for (const other of this.players.values()) {
      if (other.state.id !== p.id && !other.state.downed && Math.hypot(other.state.x - p.x, other.state.y - p.y) <= 95) {
        this.damagePlayer(other.state, Math.round(dmg * 0.75), 'arcane');
        this.emitEvent('status', other.state.x, other.state.y - 14, 'VOID BLAST!', '#A855F7');
      }
    }
  }

  private detonateCondemned(p: PlayerState, s: PlayerStatusEffect): void {
    this.emitEvent('status', p.x, p.y - 20, 'DIVINE JUDGMENT!', '#FDE047');
    const dmg = 65 + this.floor * 8;
    this.damagePlayer(p, dmg, 'divine');
  }

  private updatePlayerStatuses(p: PlayerState, dtMs: number, pulseDotNow: boolean): void {
    if (!p.statuses) p.statuses = [];
    if (p.downed) {
      if (p.statuses.length > 0) p.statuses = [];
      return;
    }
    for (let i = p.statuses.length - 1; i >= 0; i--) {
      const s = p.statuses[i];
      s.durationMs -= dtMs;

      // Floor 3: Scorched - Periodic Fire Damage
      if (s.type === 'scorched' && pulseDotNow) {
        this.damagePlayer(p, 6 + this.floor * 1.5, 'fire');
      }

      // Detonation logic
      if (s.detonationTimerMs !== undefined) {
        s.detonationTimerMs -= dtMs;
        if (s.detonationTimerMs <= 0) {
          if (s.type === 'voidmarked') this.detonateVoidmark(p, s);
          if (s.type === 'condemned') this.detonateCondemned(p, s);
          s.detonationTimerMs = undefined;
        }
      }

      if (s.durationMs <= 0) {
        p.statuses.splice(i, 1);
        if (s.type === 'silenced') {
          this.emitEvent('status', p.x, p.y - 20, 'SKILLS READY', '#34D399');
        }
      }
    }
  }

  public static getPrimaryAttributeValue(p: PlayerState): number {
    switch (p.heroClass) {
      case 'vanguard':
        return p.strength || 0;
      case 'ranger':
        return p.dexterity || 0;
      case 'arcanist':
        return p.intelligence || 0;
      case 'cleric':
        return p.faith || 0;
      default:
        return p.strength || 0;
    }
  }

  public static computeDotMultiplier(p: PlayerState | null | undefined): number {
    if (!p) return 1.0;
    const level = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
    const primaryAttr = Math.max(0, GameRoom.getPrimaryAttributeValue(p));
    return 1 + 0.003 * (level - 1) + 0.001 * primaryAttr;
  }

  private getEnemyMeta(enemy: EnemyState): EnemyRuntimeMeta {
    let meta = this.enemyMeta.get(enemy.id);
    if (!meta) {
      meta = {
        hardCcStage: 0,
        lastHardCcAtMs: -999999,
        burnOwnerId: null,
        burnMultiplier: null,
        burnBaseTick: null,
        poisonOwnerId: null,
        poisonMultiplier: null,
        poisonBaseTick: null,
        bleedOwnerId: null,
        bleedMultiplier: null,
        bossPhase: 1,
        lastBossAbility: -1,
        bossTargetId: null,
        bossTargetSwitchAtMs: 0,
        bossAbilityCooldowns: {},
        chargeHitPlayerIds: new Set<string>(),
        bossStrafeDir: Math.random() < 0.5 ? 1 : -1,
        bossStrafeFlipAtMs: 0,
        bossRecentDmgTaken: 0,
        bossRecentDmgAtMs: 0,
      };
      this.enemyMeta.set(enemy.id, meta);
    }
    return meta;
  }

  private clearEnemyChargeState(enemy: EnemyState): void {
    enemy.charging = false;
    enemy.chargeWindupMs = 0;
    enemy.chargeTimerMs = 0;
    enemy.chargeAngle = undefined;
    const meta = this.enemyMeta.get(enemy.id);
    if (meta) {
      meta.chargeHitPlayerIds.clear();
    }
  }

  private removeEntityZones(entityId: string, kinds?: ReadonlyArray<FieldZoneState['kind']>): void {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.ownerId === entityId && (!kinds || kinds.includes(z.kind))) {
        this.zoneHitPlayers.delete(z.id);
        this.zones.splice(i, 1);
      }
    }
  }

  public getEnemyCcState(enemy: EnemyState): { stage: number; lastHardCcAtMs: number; simTimeMs: number } {
    const meta = this.getEnemyMeta(enemy);
    const effectiveStage =
      meta.hardCcStage > 0 && this.simTimeMs - meta.lastHardCcAtMs >= 8000 ? 0 : meta.hardCcStage;
    return {
      stage: effectiveStage,
      lastHardCcAtMs: meta.lastHardCcAtMs,
      simTimeMs: this.simTimeMs,
    };
  }

  public getBossRuntimeInfo(boss: EnemyState): { phase: number; summonWave: number; lastAbility: number } {
    const meta = this.getEnemyMeta(boss);
    return {
      phase: meta.bossPhase,
      summonWave: boss.summonWave || 0,
      lastAbility: meta.lastBossAbility,
    };
  }

  public applyHardCc(
    enemy: EnemyState,
    kind: 'stun' | 'freeze',
    baseDurationMs: number
  ): number {
    if (!enemy || enemy.hp <= 0 || baseDurationMs <= 0) return 0;

    const meta = this.getEnemyMeta(enemy);

    // Reset diminishing-returns stage after 8 seconds without receiving hard CC
    if (meta.hardCcStage > 0 && this.simTimeMs - meta.lastHardCcAtMs >= 8000) {
      meta.hardCcStage = 0;
    }

    const isBoss = enemy.kind === 'boss';
    const isElite = !isBoss && Boolean(enemy.elite);

    // Enemy-type hard-CC duration reduction & DR curve
    const profileMult = isBoss ? 0.30 : isElite ? 0.75 : 1.0;
    const drStages = isBoss ? [1.0, 0.40, 0] : [1.0, 0.50, 0.25, 0];
    const stageIdx = Math.min(meta.hardCcStage, drStages.length - 1);
    const drMult = drStages[stageIdx];

    if (drMult <= 0) {
      this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 14, 'CC IMMUNE!', '#94A3B8');
      return 0;
    }

    const effectiveDuration = Math.max(0, Math.round(baseDurationMs * profileMult * drMult));
    if (effectiveDuration <= 0) return 0;

    meta.hardCcStage = Math.min(drStages.length - 1, meta.hardCcStage + 1);
    meta.lastHardCcAtMs = this.simTimeMs;

    if (kind === 'stun') {
      enemy.stunnedMs = Math.max(enemy.stunnedMs, effectiveDuration);
    } else {
      enemy.frozenMs = Math.max(enemy.frozenMs, effectiveDuration);
    }

    // Hard CC interrupts active boss charges and defensive stances like Aegis Parry
    if (enemy.charging || (enemy.chargeWindupMs || 0) > 0 || enemy.chargeAngle !== undefined) {
      this.clearEnemyChargeState(enemy);
      if (enemy.state === 'charge') enemy.state = 'recover';
    }
    if (enemy.kind === 'boss') {
      const hadParry = this.zones.some((z) => z.kind === 'warden_parry' && z.ownerId === enemy.id);
      if (hadParry) {
        this.removeEntityZones(enemy.id, ['warden_parry']);
        this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, 'PARRY BROKEN!', '#38BDF8');
      }
    }

    return effectiveDuration;
  }

  public applySoftCc(enemy: EnemyState, baseDurationMs: number): number {
    if (!enemy || enemy.hp <= 0 || baseDurationMs <= 0) return 0;
    // Soft CC (slow) stays strictly separated from hard-CC diminishing returns
    const effectiveDuration = Math.max(0, Math.round(baseDurationMs));
    enemy.slowedMs = Math.max(enemy.slowedMs, effectiveDuration);
    return effectiveDuration;
  }

  public applyDotStatus(
    enemy: EnemyState,
    kind: 'burn' | 'poison' | 'bleed',
    attacker: PlayerState | null,
    durationMs: number
  ): void {
    if (!enemy || enemy.hp <= 0 || durationMs <= 0) return;
    const meta = this.getEnemyMeta(enemy);
    const mult = GameRoom.computeDotMultiplier(attacker);
    const ownerId = attacker ? attacker.id : null;
    const effectiveDur = Math.max(0, Math.round(durationMs));

    if (kind === 'burn') {
      enemy.burnedMs = effectiveDur;
      meta.burnOwnerId = ownerId;
      meta.burnMultiplier = mult;
      meta.burnBaseTick = (7 + this.floor) * mult;
    } else if (kind === 'poison') {
      enemy.poisonedMs = effectiveDur;
      meta.poisonOwnerId = ownerId;
      meta.poisonMultiplier = mult;
      meta.poisonBaseTick = (5 + this.floor) * mult;
    } else {
      enemy.bleedingMs = effectiveDur;
      meta.bleedOwnerId = ownerId;
      meta.bleedMultiplier = mult;
    }
  }

  private applyDotDamageTick(
    enemy: EnemyState,
    kind: 'burn' | 'poison' | 'bleed',
    rawScaledTick: number,
    ownerId: string | null,
    color?: string
  ): boolean {
    if (enemy.hp <= 0) return false;
    const resCat: DamageCategory =
      kind === 'burn' ? 'fire' : kind === 'poison' ? 'poison' : 'bleed';
    const res = GameRoom.getEnemyResistance(enemy.resistances, resCat);
    const finalDmg = Math.max(1, Math.round(rawScaledTick * (1 - res)));
    enemy.hp -= finalDmg;

    const ownerState = ownerId ? (this.players.get(ownerId)?.state ?? null) : null;
    if (ownerState) {
      ownerState.damageDealt += finalDmg;
    }

    this.emitEvent(
      'damage',
      enemy.x + (Math.random() * 12 - 6),
      enemy.y - enemy.radius - 8,
      `${finalDmg}`,
      color ?? getDamageTypeColor(resCat, false),
      resCat
    );

    if (enemy.hp <= 0) {
      this.processEnemyDeath(enemy, ownerState);
      return true;
    }
    return false;
  }

  public applyStatusEffect(
    target: EnemyState | PlayerState,
    kind: 'slow' | 'stun' | 'burn' | 'freeze' | 'shock' | 'poison' | 'bleed' | 'silence',
    durationMs: number,
    attacker: PlayerState | null = null
  ): void {
    // If it's a player, use the new system for relevant types if possible, or fall back to simple timers
    if ('heroClass' in target) {
      if (kind === 'slow') this.applyPlayerStatus(target, 'frostbite', durationMs);
      else if (kind === 'burn') this.applyPlayerStatus(target, 'scorched', durationMs);
      else if (kind === 'silence') this.applyPlayerStatus(target, 'silenced', durationMs);
      else {
        const faithTenacity = Math.min(0.40, (target.faith || 0) * 0.003);
        const reducedDuration = Math.max(0, Math.round(durationMs * (1 - faithTenacity)));
        target.stunnedMs = Math.max(target.stunnedMs, reducedDuration);
      }
      return;
    }

    switch (kind) {
      case 'slow':
        this.applySoftCc(target, durationMs);
        break;
      case 'stun':
        this.applyHardCc(target, 'stun', durationMs);
        break;
      case 'freeze':
        this.applyHardCc(target, 'freeze', durationMs);
        break;
      case 'burn':
        this.applyDotStatus(target, 'burn', attacker, durationMs);
        break;
      case 'poison':
        this.applyDotStatus(target, 'poison', attacker, durationMs);
        break;
      case 'bleed':
        this.applyDotStatus(target, 'bleed', attacker, durationMs);
        break;
      case 'shock':
        target.shockedMs = Math.max(target.shockedMs, Math.max(0, Math.round(durationMs)));
        break;
      case 'silence':
        target.silencedMs = Math.max(target.silencedMs || 0, Math.max(0, Math.round(durationMs)));
        break;
    }
  }

  public spawnEnemyForTesting(kind: EnemyKind, x: number, y: number, elite = false): EnemyState {
    const biome = this.map?.biome || 'courtyard';
    const en = makeEnemy(`test_${this.entitySeq++}`, kind, 0, x, y, 1.0, elite, this.floor, biome);
    this.enemies.push(en);
    return en;
  }

  public teleportPlayerToFloor(playerId: string, floorNum: number): void {
    const targetFloor = Math.max(1, Math.min(10, floorNum));
    this.loadFloor(targetFloor, this.players.size);
    this.pushSystemChat(`[ADMIN] Teleported party to Floor ${targetFloor} (${this.map.biomeTitle}).`);
  }

  public spawnEntitiesForAdmin(playerId: string, kind: EnemyKind, count: number): void {
    const p = this.players.get(playerId)?.state;
    if (!p) return;
    const clampedCount = Math.max(1, Math.min(25, count));
    const biome = this.map?.biome || 'courtyard';
    for (let i = 0; i < clampedCount; i++) {
      const angle = (i * Math.PI * 2) / clampedCount;
      const dist = 55 + (i % 3) * 20;
      const sx = p.x + Math.cos(angle) * dist;
      const sy = p.y + Math.sin(angle) * dist;
      const en = makeEnemy(`adm_${this.entitySeq++}`, kind, 0, sx, sy, 1.0, kind === 'boss', this.floor, biome);
      this.enemies.push(en);
    }
    this.pushSystemChat(`[ADMIN] Spawned ${clampedCount}x ${kind} near ${p.username}.`);
  }

  public despawnEntity(entityId: string): void {
    const idx = this.enemies.findIndex(e => e.id === entityId);
    if (idx >= 0) {
      const removed = this.enemies.splice(idx, 1)[0];
      this.removeEntityZones(removed.id);
      this.enemyMeta.delete(removed.id);
      this.pushSystemChat(`[ADMIN] Despawned entity ${removed.name} (${removed.id}).`);
    }
  }

  public clearAllEnemies(): void {
    const count = this.enemies.length;
    for (const en of this.enemies) {
      this.removeEntityZones(en.id);
    }
    this.enemies = [];
    this.enemyMeta.clear();
    this.pushSystemChat(`[ADMIN] Cleared all ${count} active enemies from the room.`);
  }

  public clearSummonedEntities(): void {
    const before = this.enemies.length;
    this.enemies = this.enemies.filter(e => {
      if (e.kind === 'boss') return true;
      this.removeEntityZones(e.id);
      this.enemyMeta.delete(e.id);
      return false;
    });
    const cleared = before - this.enemies.length;
    this.pushSystemChat(`[ADMIN] Cleared ${cleared} summoned entities (retained primary bosses).`);
  }

  public healPlayer(playerId: string): void {
    const p = this.players.get(playerId)?.state;
    if (!p) return;
    p.hp = p.maxHp;
    p.shield = Math.max(p.shield, 50);
    this.emitEvent('heal', p.x, p.y - 18, 'ADMIN HEAL', '#34D399');
    this.pushSystemChat(`[ADMIN] Fully restored health & shield for ${p.username}.`);
  }

  public restoreEnergy(playerId: string): void {
    const p = this.players.get(playerId)?.state;
    if (!p) return;
    p.skillCooldownMs = 0;
    p.ultCooldownMs = 0;
    this.emitEvent('status', p.x, p.y - 18, 'COOLDOWNS RESET', '#38BDF8');
    this.pushSystemChat(`[ADMIN] Reset skill & ultimate cooldowns for ${p.username}.`);
  }

  public reviveAllPlayers(): void {
    for (const pr of this.players.values()) {
      pr.state.downed = false;
      pr.state.hp = pr.state.maxHp;
      this.emitEvent('heal', pr.state.x, pr.state.y - 18, 'ADMIN REVIVE', '#6EE7B7');
    }
    this.pushSystemChat(`[ADMIN] Revived and restored all downed party members.`);
  }

  public summonBossForFloor(floorNum: number): void {
    const targetFloor = Math.max(1, Math.min(10, floorNum));
    this.loadFloor(targetFloor, this.players.size);
    this.pushSystemChat(`[ADMIN] Summoned Floor ${targetFloor} Guardian Boss encounter.`);
  }

  public resetBossEncounter(): void {
    // Reset HP, phase, summons, zones, and CC state of all boss entities in the room
    for (const en of this.enemies) {
      if (en.kind === 'boss') {
        en.hp = en.maxHp;
        en.enraged = false;
        en.shieldWallMs = 0;
        en.stunnedMs = 0;
        en.frozenMs = 0;
        en.summonWave = 0;
        this.clearEnemyChargeState(en);
        this.removeEntityZones(en.id);
        const meta = this.getEnemyMeta(en);
        meta.hardCcStage = 0;
        meta.lastHardCcAtMs = -999999;
        meta.bossPhase = 1;
        meta.lastBossAbility = -1;
        meta.bossAbilityCooldowns = {};
      }
      en.chronoSuspendedMs = 0;
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i].kind === 'chrono_well') {
        this.zones.splice(i, 1);
      }
    }
    this.refreshChronoSuspensionState();
    this.pushSystemChat(`[ADMIN] Reset active boss encounter (HP restored, phase/enrage/CC cleared).`);
  }

  public resetCurrentRoom(): void {
    this.loadFloor(this.floor, this.players.size);
    this.pushSystemChat(`[ADMIN] Reset current room state.`);
  }

  public toggleEnemyAI(enabled?: boolean): void {
    // Toggle global AI flag if needed, or emit message
    const state = enabled ?? true;
    this.pushSystemChat(`[ADMIN] Enemy AI processing ${state ? 'RESUMED' : 'PAUSED'}.`);
  }

  private resetPlayersForNewRun(): void {
    for (const pr of this.players.values()) {
      // Preserve: level, xp, nextXp, strength, vitality, dexterity, intelligence, faith, attributePoints, storage

      // Clear run-specific temporary state and relics BEFORE recalculating HP
      pr.state.shield = 15;
      pr.state.gold = 0;
      pr.state.potions = 2;
      pr.state.relics = [];
      pr.state.pendingRelicChoices = [];
      pr.state.statuses = [];
      pr.state.floorBlessings = [];
      pr.state.downed = false;
      pr.state.downedTimerMs = 0;
      pr.state.reviveProgress = 0;
      pr.state.kills = 0;
      pr.state.damageDealt = 0;
      pr.state.revives = 0;
      pr.state.readyNextFloor = false;
      pr.state.ready = false;
      pr.state.skillCooldownMs = 0;
      pr.state.ultCooldownMs = 0;
      pr.state.dashCooldownMs = 0;
      pr.state.attackAnimMs = 0;
      pr.state.hasteMs = 0;
      pr.state.slowedMs = 0;
      pr.state.stunnedMs = 0;
      pr.state.burnedMs = 0;
      pr.state.frozenMs = 0;
      pr.state.shockedMs = 0;
      pr.state.poisonedMs = 0;
      pr.state.bleedingMs = 0;
      pr.state.silencedMs = 0;
      pr.state.spellCastState = null;
      pr.state.disintegrationState = null;
      pr.state.equippedScrollId = null;
      pr.state.pendingScrollChoices = [];
      pr.state.activeChestPropId = null;
      pr.state.starRiftCooldownMs = pr.state.heroClass === 'arcanist' ? 0 : undefined;
      pr.state.chronoSuspendedMs = 0;
      pr.pendingBarrage = null;
      this.resetPassiveState(pr);
      pr.input = {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: 0,
      };

      // Recalculate HP & Shield based on preserved permanent stats & permanent armaments (removing Bastion Pauldron bonus)
      const startShieldBonus =
        resolveEquippedVestmentForClass(pr.state.heroClass, pr.state.equippedVestment)?.modifiers
          .startingShieldBonus || 0;
      pr.state.shield = Math.min(this.getMaxShieldCap(pr.state), 15 + startShieldBonus);
      pr.state.maxHp = GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = pr.state.maxHp;
    }
  }

  public startExpedition(): DungeonMap {
    this.lastRunSummary = null;
    this.status = 'playing';
    this.startedAt = Date.now();
    this.endedAt = null;
    this.resetPlayersForNewRun();
    this.loadFloor(1, Math.max(1, this.players.size));
    this.pushSystemChat(`Host ${this.hostName} started the expedition! Entering Floor 1.`);
    return this.map;
  }

  public returnToWaitingLobby(): void {
    if (this.roomId === 'TAVERN-HUB') return;
    if (this.status === 'victory' || this.status === 'defeat') {
      this.lastRunSummary = {
        outcome: this.status,
        floor: this.floor,
        elapsedSec: this.getElapsedSec(),
        players: Array.from(this.players.values()).map((r) => ({
          id: r.state.id,
          username: r.state.username,
          heroClass: r.state.heroClass,
          level: r.state.level,
          kills: r.state.kills,
          revives: r.state.revives,
        })),
      };
    }

    // Prune offline disconnected players so stale offline slots do not occupy the unlocked waiting lobby
    for (const [pid, pr] of Array.from(this.players.entries())) {
      if (!pr.state.connected) {
        this.players.delete(pid);
      }
    }

    if (this.players.size > 0 && !this.isPlayerConnected(this.hostId)) {
      this.transferHostToConnectedMember();
    }

    this.resetPlayersForNewRun();
    this.enemies = [];
    this.projectiles = [];
    this.zones = [];
    this.props = [];
    this.npcs = [];
    this.trainingDummies = [];
    this.pendingEvents = [];
    this.floor = 1;
    this.status = 'waiting';
    this.startedAt = Date.now();
    this.endedAt = null;

    let idx = 0;
    for (const pr of this.players.values()) {
      const offsetAngle = (idx * Math.PI) / 2;
      pr.state.x = this.spawnPoint.x + Math.cos(offsetAngle) * 20;
      pr.state.y = this.spawnPoint.y + Math.sin(offsetAngle) * 20;
      pr.state.vx = 0;
      pr.state.vy = 0;
      pr.enteredRooms.clear();
      pr.enteredRooms.add(0);
      idx++;
    }

    this.pushSystemChat('Party returned to waiting lobby. The party is now open for new members.');
  }

  public restartRun(): DungeonMap {
    this.lastRunSummary = null;
    this.status = 'playing';
    this.startedAt = Date.now();
    this.endedAt = null;
    this.resetPlayersForNewRun();
    const restartFloor = this.roomId === 'TAVERN-HUB' ? 0 : 1;
    this.loadFloor(restartFloor, Math.max(1, this.players.size));
    this.pushSystemChat(
      this.roomId === 'TAVERN-HUB'
        ? `Sanctuary Tavern refreshed.`
        : `Host ${this.hostName} restarted the expedition on Seed ${this.baseSeed}.`
    );
    return this.map;
  }

  public isHost(playerId: string): boolean {
    return Boolean(playerId && this.hostId === playerId);
  }

  public isPartyLocked(): boolean {
    return this.roomId !== 'TAVERN-HUB' && this.status === 'playing';
  }

  public isPlayerConnected(playerId: string): boolean {
    return Boolean(this.players.get(playerId)?.state.connected);
  }

  public getConnectedPlayerCount(): number {
    let count = 0;
    for (const pr of this.players.values()) {
      if (pr.state.connected) count++;
    }
    return count;
  }

  public setPlayerReady(
    playerId: string,
    ready?: boolean
  ): { ok: true; ready: boolean } | { ok: false; reason: string } {
    if (this.roomId === 'TAVERN-HUB') {
      return { ok: false, reason: 'Ready status is only used in expedition party lobbies.' };
    }
    if (this.status !== 'waiting') {
      return { ok: false, reason: 'Ready status can only be toggled while in the waiting lobby.' };
    }
    const pr = this.players.get(playerId);
    if (!pr) {
      return { ok: false, reason: 'Player is not a member of this party.' };
    }
    const nextReady = ready === undefined ? !Boolean(pr.state.ready) : Boolean(ready);
    pr.state.ready = nextReady;
    return { ok: true, ready: nextReady };
  }

  public canAcceptJoin(
    playerId: string
  ):
    | { allowed: true; isReconnect: boolean }
    | { allowed: false; code: 'in_progress' | 'ended' | 'full'; reason: string } {
    if (this.roomId === 'TAVERN-HUB') {
      if (this.hasPlayer(playerId)) return { allowed: true, isReconnect: true };
      if (this.players.size >= this.maxPlayers) {
        return { allowed: false, code: 'full', reason: 'Sanctuary Tavern is currently full.' };
      }
      return { allowed: true, isReconnect: false };
    }

    if (this.hasPlayer(playerId)) {
      return { allowed: true, isReconnect: true };
    }
    if (this.status === 'playing') {
      return {
        allowed: false,
        code: 'in_progress',
        reason: 'This expedition is already in progress.',
      };
    }
    if (this.status === 'victory' || this.status === 'defeat') {
      return {
        allowed: false,
        code: 'ended',
        reason: 'This expedition has ended. Wait for the host to return to the waiting lobby.',
      };
    }
    if (this.players.size >= this.maxPlayers) {
      return {
        allowed: false,
        code: 'full',
        reason: 'That expedition party is already full (4/4).',
      };
    }
    return { allowed: true, isReconnect: false };
  }

  public tryJoinOrReconnectPlayer(
    playerId: string,
    username: string,
    heroClass: HeroClassId,
    isAdmin = false,
    savedStats?: {
      level: number;
      xp: number;
      strength: number;
      vitality: number;
      dexterity: number;
      intelligence: number;
      faith: number;
      attributePoints: number;
      storage?: string[];
      ownedWeapons?: string[];
      ownedVestments?: string[];
      equippedWeapon?: string | null;
      equippedVestment?: string | null;
    }
  ):
    | { ok: true; isReconnect: boolean; player: PlayerState }
    | { ok: false; code: 'in_progress' | 'ended' | 'full'; reason: string } {
    const check = this.canAcceptJoin(playerId);
    if (!check.allowed) {
      return { ok: false, code: check.code, reason: check.reason };
    }
    const player = this.addOrReconnectPlayer(playerId, username, heroClass, isAdmin, savedStats);
    return { ok: true, isReconnect: check.isReconnect, player };
  }

  public addOrReconnectPlayer(
    playerId: string,
    username: string,
    heroClass: HeroClassId,
    isAdmin = false,
    savedStats?: {
      level: number;
      xp: number;
      strength: number;
      vitality: number;
      dexterity: number;
      intelligence: number;
      faith: number;
      attributePoints: number;
      storage?: string[];
      ownedWeapons?: string[];
      ownedVestments?: string[];
      equippedWeapon?: string | null;
      equippedVestment?: string | null;
    }
  ): PlayerState {
    const existing = this.players.get(playerId);
    if (existing) {
      const wasDisconnected = !existing.state.connected;
      existing.state.connected = true;
      existing.state.username = username;
      existing.state.isAdmin = isAdmin || Boolean(existing.state.isAdmin);
      if (!existing.state.storage) existing.state.storage = [];
      if (!existing.state.ownedWeapons || !existing.state.ownedVestments) {
        const normalizedExisting = normalizeArmamentLoadout(existing.state.heroClass, {
          ownedWeapons: existing.state.ownedWeapons ?? savedStats?.ownedWeapons,
          ownedVestments: existing.state.ownedVestments ?? savedStats?.ownedVestments,
          equippedWeapon:
            existing.state.equippedWeapon !== undefined
              ? existing.state.equippedWeapon
              : savedStats?.equippedWeapon,
          equippedVestment:
            existing.state.equippedVestment !== undefined
              ? existing.state.equippedVestment
              : savedStats?.equippedVestment,
        });
        existing.state.ownedWeapons = normalizedExisting.ownedWeapons;
        existing.state.ownedVestments = normalizedExisting.ownedVestments;
        existing.state.equippedWeapon = normalizedExisting.equippedWeapon;
        existing.state.equippedVestment = normalizedExisting.equippedVestment;
      }
      if (existing.state.heroClass === 'arcanist') {
        if (!existing.state.pendingScrollChoices) existing.state.pendingScrollChoices = [];
        if (existing.state.starRiftCooldownMs === undefined) existing.state.starRiftCooldownMs = 0;
      }
      this.clearEclipseCharge(existing);
      const expectedPassive = this.getActivePassive(existing.state);
      if (existing.state.activePassiveId !== expectedPassive) {
        this.resetPassiveState(existing);
      } else {
        existing.state.vanguardHeat = existing.state.vanguardHeat ?? 0;
        existing.state.rangerMomentum = existing.state.rangerMomentum ?? 0;
        existing.state.predatorTargetId = existing.state.predatorTargetId ?? null;
        existing.state.predatorStacks = existing.state.predatorStacks ?? 0;
        existing.state.voidEnergy = existing.state.voidEnergy ?? 0;
        existing.state.storedGrace = existing.state.storedGrace ?? 0;
        existing.state.clericSanctity = existing.state.clericSanctity ?? 0;
        existing.state.eclipseChargeRatio = 0;
        this.syncPassiveMetadata(existing);
      }
      if (wasDisconnected && this.roomId !== 'TAVERN-HUB') {
        this.pushSystemChat(`${username} reconnected.`);
      }
      return existing.state;
    }

    const def = HERO_CLASSES[heroClass];
    const idx = this.players.size;
    let sx = this.spawnPoint.x + (idx % 2 === 0 ? -18 : 18);
    let sy = this.spawnPoint.y + (idx < 2 ? -14 : 14);
    for (const ally of this.players.values()) {
      if (ally.state.connected && !ally.state.downed) {
        sx = ally.state.x + 22;
        sy = ally.state.y;
        break;
      }
    }

    const clampedLevel = Math.max(1, Math.min(MAX_LEVEL, Number(savedStats?.level) || 1));
    const clampedXp = clampedLevel >= MAX_LEVEL ? 0 : Math.max(0, Number(savedStats?.xp) || 0);
    const armaments = normalizeArmamentLoadout(heroClass, savedStats);
    const startShieldBonus =
      resolveEquippedVestmentForClass(heroClass, armaments.equippedVestment)?.modifiers
        .startingShieldBonus || 0;
    const maxShieldCap =
      60 +
      (resolveEquippedVestmentForClass(heroClass, armaments.equippedVestment)?.modifiers
        .maxShieldBonus || 0);
    const initialTacticalCd =
      heroClass === 'cleric' && armaments.equippedWeapon === 'cleric_seraphim_crozier'
        ? ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs
        : def.tacticalCooldownMs;

    const state: PlayerState = {
      id: playerId,
      username,
      heroClass,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: def.maxHp,
      maxHp: def.maxHp,
      shield: Math.min(maxShieldCap, 15 + startShieldBonus),
      level: clampedLevel,
      xp: clampedXp,
      nextXp: GameRoom.computeNextXp(clampedLevel),
      gold: 0,
      potions: 2,
      relics: [],
      storage: savedStats?.storage ? [...savedStats.storage] : [],
      ownedWeapons: armaments.ownedWeapons,
      ownedVestments: armaments.ownedVestments,
      equippedWeapon: armaments.equippedWeapon,
      equippedVestment: armaments.equippedVestment,
      activePassiveId: resolveActiveVestmentPassive(heroClass, armaments.equippedVestment),
      vanguardHeat: 0,
      rangerMomentum: 0,
      predatorTargetId: null,
      predatorStacks: 0,
      voidEnergy: 0,
      storedGrace: 0,
      clericSanctity: 0,
      eclipseChargeRatio: 0,
      downed: false,
      downedTimerMs: 0,
      reviveProgress: 0,
      skillCooldownMs: 0,
      maxSkillCooldownMs: initialTacticalCd,
      ultCooldownMs: 0,
      maxUltCooldownMs: def.ultCooldownMs,
      dashCooldownMs: 0,
      maxDashCooldownMs: 2600,
      attackAnimMs: 0,
      hasteMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      kills: 0,
      damageDealt: 0,
      revives: 0,
      readyNextFloor: false,
      ready: false,
      pendingRelicChoices: [],
      connected: true,
      isAdmin: isAdmin,
      godMode: false,
      speedBoost: false,
      noCooldownMode: false,
      dexterity: savedStats?.dexterity || 0,
      vitality: savedStats?.vitality || 0,
      strength: savedStats?.strength || 0,
      intelligence: savedStats?.intelligence || 0,
      faith: savedStats?.faith || 0,
      attributePoints: savedStats?.attributePoints || 0,
      statuses: [],
      floorBlessings: [],
      ...(heroClass === 'arcanist'
        ? {
            spellCastState: null,
            disintegrationState: null,
            equippedScrollId: null,
            pendingScrollChoices: [],
            starRiftCooldownMs: 0,
          }
        : {}),
      chronoSuspendedMs: 0,
      activeChestPropId: null,
    };

    if (state.level >= MAX_LEVEL) {
      state.nextXp = 999999;
      state.xp = 0;
    }

    state.maxHp = GameRoom.computePlayerMaxHp(
      state.heroClass,
      state.level,
      state.vitality,
      state.relics,
      state.equippedVestment
    );
    state.hp = state.maxHp;

    this.players.set(playerId, {
      state,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: 0,
      },
      attackCooldownMs: 0,
      enteredRooms: new Set<number>([0]),
      attackCount: 0,
      starRiftAttackCount: 0,
      heatLastHitAtMs: 0,
      momentumHoldMs: 0,
      predatorLastHitAtMs: 0,
      solarisLastHealAtMs: 0,
      eclipseHoldActive: false,
      eclipseHoldStartMs: 0,
      pendingEclipseReleaseMs: null,
      dummyGaleburstStacks: new Map<string, number>(),
    });

    if (!this.hostId && this.roomId !== 'TAVERN-HUB') {
      this.hostId = playerId;
      this.hostName = username;
    }

    this.pushSystemChat(
      `${username} (${def.name}) joined the ${this.status === 'waiting' ? 'party lobby' : 'expedition'}.`
    );
    return state;
  }

  public markPlayerDisconnected(playerId: string): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    pr.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: pr.input.aimAngle,
      stickX: 0,
      stickY: 0,
    };
    this.clearEclipseCharge(pr);
    pr.state.vx = 0;
    pr.state.vy = 0;
    if (pr.state.disintegrationState?.active) {
      this.stopDisintegrationChannel(playerId);
    }
    pr.state.spellCastState = null;
    this.cleanupChronoWellsForOwner(playerId);
    if (pr.state.connected) {
      pr.state.connected = false;
      if (this.roomId !== 'TAVERN-HUB') {
        this.pushSystemChat(`${pr.state.username} disconnected.`);
      }
      return true;
    }
    return false;
  }

  public transferHostToConnectedMember(
    excludePlayerId?: string
  ): { previousHostName: string; newHostId: string; newHostName: string } | null {
    let candidate: PlayerRuntime | undefined;
    for (const pr of this.players.values()) {
      if (pr.state.id !== excludePlayerId && pr.state.connected) {
        candidate = pr;
        break;
      }
    }
    if (!candidate) return null;
    const prevName = this.hostName;
    this.hostId = candidate.state.id;
    this.hostName = candidate.state.username;
    this.pushSystemChat(`Host ownership transferred to ${this.hostName}.`);
    return {
      previousHostName: prevName,
      newHostId: this.hostId,
      newHostName: this.hostName,
    };
  }

  public removePlayer(playerId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (pr.state.disintegrationState?.active) {
      this.stopDisintegrationChannel(playerId);
    }
    this.cleanupChronoWellsForOwner(playerId);
    const wasHost = playerId === this.hostId || pr.state.username === this.hostName;
    this.players.delete(playerId);
    this.pushSystemChat(`${pr.state.username} departed the party.`);
    if (this.players.size > 0 && wasHost) {
      const transferred = this.transferHostToConnectedMember();
      if (!transferred) {
        const first = this.players.values().next().value as PlayerRuntime | undefined;
        if (first) {
          this.hostId = first.state.id;
          this.hostName = first.state.username;
          this.pushSystemChat(`Host ownership transferred to ${this.hostName}.`);
        }
      }
    }
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  public getPlayerState(playerId: string): PlayerState | undefined {
    return this.players.get(playerId)?.state;
  }

  public isPlayerNearNpc(playerId: string, npcIdOrName: string, maxDistance = 85): boolean {
    const p = this.players.get(playerId)?.state;
    if (!p) return false;
    const target = this.npcs.find(
      (n) => n.id === npcIdOrName || n.name.toLowerCase() === npcIdOrName.toLowerCase()
    );
    if (!target) return false;
    return Math.hypot(target.x - p.x, target.y - p.y) <= maxDistance;
  }

  public pushChat(sender: string, text: string, system = false): ChatMessage {
    const msg: ChatMessage = {
      id: this.nextId('chat'),
      sender,
      text: text.slice(0, 180),
      timestamp: Date.now(),
      system,
    };
    this.chat.push(msg);
    if (this.chat.length > 40) this.chat.shift();
    if (this.onChatMessageCallback) {
      this.onChatMessageCallback(msg);
    }
    return msg;
  }

  public pushSystemChat(text: string): ChatMessage {
    return this.pushChat('Sanctuary', text, true);
  }

  public updateInput(playerId: string, input: PlayerInputState, seq?: number): void {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== 'playing') return;
    const prevAttack = Boolean(pr.input.attack);
    const nextAttack = Boolean(input.attack);
    const p = pr.state;
    const isEclipse =
      p.heroClass === 'ranger' && p.equippedWeapon === 'ranger_eclipse_longbow';

    if (isEclipse && !p.downed && !p.spellCastState && !p.disintegrationState?.active && (p.chronoSuspendedMs || 0) <= 0) {
      if (!prevAttack && nextAttack && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
        pr.eclipseHoldActive = true;
        pr.eclipseHoldStartMs = this.simTimeMs;
        pr.pendingEclipseReleaseMs = null;
      } else if (prevAttack && !nextAttack && pr.eclipseHoldActive) {
        pr.pendingEclipseReleaseMs = Math.max(0, this.simTimeMs - pr.eclipseHoldStartMs);
        pr.eclipseHoldActive = false;
        pr.eclipseHoldStartMs = 0;
      }
    } else if (!isEclipse) {
      this.clearEclipseCharge(pr);
    }

    pr.input = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      attack: nextAttack,
      aimAngle: Number.isFinite(input.aimAngle) ? input.aimAngle : 0,
      stickX: typeof input.stickX === 'number' ? input.stickX : undefined,
      stickY: typeof input.stickY === 'number' ? input.stickY : undefined,
    };
    pr.state.aimAngle = pr.input.aimAngle;
    if (typeof seq === 'number' && Number.isFinite(seq)) {
      pr.state.lastInputSeq = seq;
    }
  }

  public getMaxShieldCap(p: PlayerState): number {
    const vestmentBonus =
      resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.maxShieldBonus || 0;
    return 60 + this.getBlessingStacks(p, 'bastion') * 15 + vestmentBonus;
  }

  public changeClass(playerId: string, heroClass: HeroClassId): void {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.downed) return;
    const def = HERO_CLASSES[heroClass];
    if (!def) return;
    const hpRatio = pr.state.hp / Math.max(1, pr.state.maxHp);
    pr.state.heroClass = heroClass;

    const defaultWpn = getDefaultWeaponIdForClass(heroClass);
    const defaultVest = getDefaultVestmentIdForClass(heroClass);
    if (!pr.state.ownedWeapons) pr.state.ownedWeapons = [];
    if (!pr.state.ownedVestments) pr.state.ownedVestments = [];
    if (!pr.state.ownedWeapons.includes(defaultWpn)) pr.state.ownedWeapons.push(defaultWpn);
    if (!pr.state.ownedVestments.includes(defaultVest)) pr.state.ownedVestments.push(defaultVest);

    if (
      pr.state.equippedWeapon !== null &&
      !resolveEquippedWeaponForClass(heroClass, pr.state.equippedWeapon)
    ) {
      pr.state.equippedWeapon = defaultWpn;
    }
    if (!resolveEquippedVestmentForClass(heroClass, pr.state.equippedVestment)) {
      pr.state.equippedVestment = defaultVest;
    }

    pr.state.maxHp = GameRoom.computePlayerMaxHp(
      heroClass,
      pr.state.level,
      pr.state.vitality,
      pr.state.relics,
      pr.state.equippedVestment
    );
    pr.state.hp = Math.max(1, Math.min(pr.state.maxHp, Math.round(pr.state.maxHp * hpRatio)));
    pr.state.shield = Math.min(this.getMaxShieldCap(pr.state), pr.state.shield);
    pr.state.maxSkillCooldownMs =
      heroClass === 'cleric' && pr.state.equippedWeapon === 'cleric_seraphim_crozier'
        ? ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs
        : def.tacticalCooldownMs;
    pr.state.maxUltCooldownMs = def.ultCooldownMs;
    pr.state.disintegrationState = null;
    pr.state.spellCastState = null;
    pr.state.equippedScrollId = null;
    pr.state.pendingScrollChoices = [];
    pr.state.activeChestPropId = null;
    pr.state.starRiftCooldownMs = heroClass === 'arcanist' ? 0 : undefined;
    pr.pendingBarrage = null;
    this.resetPassiveState(pr);
    this.emitEvent('status', pr.state.x, pr.state.y - 22, def.name, def.accentColor);
  }

  public equipArmament(
    playerId: string,
    slot: 'weapon' | 'vestment',
    itemId: string
  ): { ok: boolean; error?: string } {
    const pr = this.players.get(playerId);
    if (!pr) return { ok: false, error: 'Player not found in active room.' };
    const p = pr.state;
    const def = getArmamentDef(slot, itemId);
    if (!def) {
      return { ok: false, error: 'Unknown permanent armament.' };
    }
    if (def.heroClass !== p.heroClass) {
      return {
        ok: false,
        error: `${def.name} belongs to ${HERO_CLASSES[def.heroClass].name} and cannot be equipped by ${HERO_CLASSES[p.heroClass].name}.`,
      };
    }
    const ownedList = slot === 'weapon' ? p.ownedWeapons || [] : p.ownedVestments || [];
    if (!ownedList.includes(itemId)) {
      return { ok: false, error: `You do not own ${def.name}.` };
    }

    if (slot === 'weapon') {
      p.equippedWeapon = itemId;
      this.clearEclipseCharge(pr);
      this.clearGaleburstForPlayer(p.id);
      if (p.heroClass === 'cleric') {
        const cdrMult = this.getPlayerCdrMult(p);
        const baseCd =
          itemId === 'cleric_seraphim_crozier'
            ? ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs
            : HERO_CLASSES.cleric.tacticalCooldownMs;
        p.maxSkillCooldownMs = Math.round(baseCd * cdrMult);
        p.skillCooldownMs = Math.min(p.skillCooldownMs, p.maxSkillCooldownMs);
      }
    } else {
      const oldMaxHp = p.maxHp;
      p.equippedVestment = itemId;
      this.resetPassiveState(pr);
      p.maxHp = GameRoom.computePlayerMaxHp(
        p.heroClass,
        p.level,
        p.vitality,
        p.relics,
        p.equippedVestment
      );
      if (p.maxHp > oldMaxHp) {
        p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMaxHp));
      } else {
        p.hp = Math.min(p.hp, p.maxHp);
      }
      p.shield = Math.min(p.shield, this.getMaxShieldCap(p));
    }
    this.emitEvent('status', p.x, p.y - 26, `Equipped: ${def.name}`, def.accent);
    this.pushSystemChat(`${p.username} equipped ${def.slot}: ${def.name}.`);
    return { ok: true };
  }

  public unequipArmament(
    playerId: string,
    slot: 'weapon' | 'vestment'
  ): { ok: boolean; error?: string } {
    const pr = this.players.get(playerId);
    if (!pr) return { ok: false, error: 'Player not found in active room.' };
    const p = pr.state;
    if (slot === 'weapon') {
      if (!p.equippedWeapon) return { ok: true };
      const prev = getArmamentDef('weapon', p.equippedWeapon);
      p.equippedWeapon = null;
      this.clearEclipseCharge(pr);
      this.clearGaleburstForPlayer(p.id);
      if (p.heroClass === 'cleric') {
        const cdrMult = this.getPlayerCdrMult(p);
        p.maxSkillCooldownMs = Math.round(HERO_CLASSES.cleric.tacticalCooldownMs * cdrMult);
        p.skillCooldownMs = Math.min(p.skillCooldownMs, p.maxSkillCooldownMs);
      }
      this.emitEvent('status', p.x, p.y - 26, 'Weapon Unequipped', '#94A3B8');
      this.pushSystemChat(`${p.username} unequipped ${prev ? prev.name : 'Weapon'}.`);
      return { ok: true };
    }
    const defaultVestId = getDefaultVestmentIdForClass(p.heroClass);
    const prev = getArmamentDef('vestment', p.equippedVestment);
    p.equippedVestment = defaultVestId;
    this.resetPassiveState(pr);
    p.maxHp = GameRoom.computePlayerMaxHp(
      p.heroClass,
      p.level,
      p.vitality,
      p.relics,
      defaultVestId
    );
    p.hp = Math.min(p.hp, p.maxHp);
    p.shield = Math.min(p.shield, this.getMaxShieldCap(p));
    const defaultDef = getArmamentDef('vestment', defaultVestId);
    this.emitEvent(
      'status',
      p.x,
      p.y - 26,
      defaultDef ? `Restored: ${defaultDef.name}` : 'Default Vestment Restored',
      defaultDef?.accent || '#94A3B8'
    );
    this.pushSystemChat(
      `${p.username} restored default Vestment (${defaultDef ? defaultDef.name : defaultVestId})${prev && prev.id !== defaultVestId ? ` from ${prev.name}` : ''}.`
    );
    return { ok: true };
  }

  public grantArmament(
    playerId: string,
    slot: 'weapon' | 'vestment',
    itemId: string
  ): { ok: boolean; error?: string; added?: boolean } {
    const pr = this.players.get(playerId);
    if (!pr) return { ok: false, error: 'Player not found in active room.' };
    const p = pr.state;
    const def = getArmamentDef(slot, itemId);
    if (!def) return { ok: false, error: 'Unknown armament.' };
    if (!p.ownedWeapons) p.ownedWeapons = [];
    if (!p.ownedVestments) p.ownedVestments = [];
    const list = slot === 'weapon' ? p.ownedWeapons : p.ownedVestments;
    let added = false;
    if (!list.includes(itemId)) {
      list.push(itemId);
      added = true;
    }
    this.emitEvent('status', p.x, p.y - 28, `Armory + ${def.name}`, def.accent);
    this.pushSystemChat(`${p.username} obtained permanent ${slot}: ${def.name}.`);
    return { ok: true, added };
  }

  public addPing(playerId: string, label: string, x: number, y: number): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    this.emitEvent(
      'ping',
      x,
      y,
      `${pr.state.username}: ${label.slice(0, 24)}`,
      '#F4D378'
    );
  }

  private hasUnclaimedChestLootForPlayer(prop: PropState, p: PlayerState): boolean {
    if (prop.kind === 'relic_chest') {
      const relicClaimed = Boolean(prop.claimedRelicPlayerIds?.includes(p.id));
      const storedScrolls = prop.scrollChoicesByPlayer?.[p.id];
      const scrollClaimed = Boolean(prop.claimedScrollPlayerIds?.includes(p.id));
      const hasUnclaimedScroll = Boolean(storedScrolls && storedScrolls.length > 0 && !scrollClaimed);
      return !relicClaimed || hasUnclaimedScroll;
    }
    if (prop.kind === 'chest') {
      if (!prop.chestGoldClaimed) return true;
      const storedScrolls = prop.scrollChoicesByPlayer?.[p.id];
      const scrollClaimed = Boolean(prop.claimedScrollPlayerIds?.includes(p.id));
      return Boolean(p.heroClass === 'arcanist' && storedScrolls && storedScrolls.length > 0 && !scrollClaimed);
    }
    return !prop.opened;
  }

  private syncChestOpenedState(prop: PropState): void {
    if (prop.kind !== 'chest' && prop.kind !== 'relic_chest') return;
    const anyInspecting = Array.from(this.players.values()).some(
      (ally) => ally.state.connected && ally.state.activeChestPropId === prop.id
    );
    if (anyInspecting) {
      prop.opened = true;
      return;
    }
    const connectedPlayers = Array.from(this.players.values()).filter((ally) => ally.state.connected);
    if (prop.kind === 'chest') {
      const anyPendingScroll = connectedPlayers.some((ally) => {
        const sc = prop.scrollChoicesByPlayer?.[ally.state.id];
        return Boolean(
          ally.state.heroClass === 'arcanist' &&
            sc &&
            sc.length > 0 &&
            !prop.claimedScrollPlayerIds?.includes(ally.state.id)
        );
      });
      prop.opened = Boolean(prop.chestGoldClaimed) && !anyPendingScroll;
      return;
    }
    // For relic_chest: stays closed (so players see loot remains) until all connected players have claimed it,
    // or if no players remain, keep closed if never claimed.
    const anyUnclaimed =
      connectedPlayers.length > 0
        ? connectedPlayers.some((ally) => this.hasUnclaimedChestLootForPlayer(prop, ally.state))
        : !prop.claimedRelicPlayerIds || prop.claimedRelicPlayerIds.length === 0;
    prop.opened = !anyUnclaimed;
  }

  public openChest(playerId: string, prop: PropState): boolean {
    const pr = this.players.get(playerId);
    if (!pr || (prop.kind !== 'chest' && prop.kind !== 'relic_chest')) return false;
    const p = pr.state;

    // Toggle closed if player interacts with the chest they already have open
    if (p.activeChestPropId === prop.id) {
      this.closeChest(playerId);
      return true;
    }

    // Close any previously open chest cleanly before opening another
    if (p.activeChestPropId) {
      this.closeChest(playerId);
    }

    if (prop.kind === 'chest') {
      if (!prop.chestGoldClaimed) {
        prop.chestGoldClaimed = true;
        for (const ally of this.players.values()) {
          ally.state.gold += prop.value;
        }
        if (Math.random() < 0.45) {
          p.potions = Math.min(5, p.potions + 1);
          this.emitEvent('heal', prop.x, prop.y - 18, '+1 Potion', '#6EE7B7');
        }
        if (p.heroClass === 'arcanist' && !p.equippedScrollId && Math.random() < 0.30) {
          if (!prop.scrollChoicesByPlayer) prop.scrollChoicesByPlayer = {};
          const rolled = this.rollScrollChoices(p.equippedScrollId);
          if (rolled.length > 0) {
            prop.scrollChoicesByPlayer[p.id] = rolled;
          }
        }
        this.emitEvent('gold', prop.x, prop.y - 8, `+${prop.value} Gold`, '#F4D378');
      }

      const storedScrolls = prop.scrollChoicesByPlayer?.[p.id];
      const scrollClaimed = Boolean(prop.claimedScrollPlayerIds?.includes(p.id));
      if (p.heroClass === 'arcanist' && storedScrolls && storedScrolls.length > 0 && !scrollClaimed) {
        p.pendingScrollChoices = [...storedScrolls];
        p.activeChestPropId = prop.id;
        prop.opened = true;
      } else {
        this.syncChestOpenedState(prop);
      }
      return true;
    }

    // Relic Vault Chest: rolls once per player and remembers uncollected items across close/reopen
    if (!prop.relicChoicesByPlayer) prop.relicChoicesByPlayer = {};
    if (!prop.scrollChoicesByPlayer) prop.scrollChoicesByPlayer = {};
    if (!prop.claimedRelicPlayerIds) prop.claimedRelicPlayerIds = [];
    if (!prop.claimedScrollPlayerIds) prop.claimedScrollPlayerIds = [];

    const relicClaimed = prop.claimedRelicPlayerIds.includes(p.id);
    if (!relicClaimed) {
      if (!prop.relicChoicesByPlayer[p.id] || prop.relicChoicesByPlayer[p.id].length === 0) {
        prop.relicChoicesByPlayer[p.id] = this.rollRelicChoices(p.relics);
      }
      p.pendingRelicChoices = [...prop.relicChoicesByPlayer[p.id]];
    } else {
      p.pendingRelicChoices = [];
    }

    const scrollClaimed = prop.claimedScrollPlayerIds.includes(p.id);
    if (p.heroClass === 'arcanist' && !scrollClaimed) {
      if (!(p.id in prop.scrollChoicesByPlayer)) {
        if (!p.equippedScrollId || Math.random() < 0.45) {
          prop.scrollChoicesByPlayer[p.id] = this.rollScrollChoices(p.equippedScrollId);
        } else {
          prop.scrollChoicesByPlayer[p.id] = [];
        }
      }
      const savedScrolls = prop.scrollChoicesByPlayer[p.id];
      if (savedScrolls && savedScrolls.length > 0) {
        p.pendingScrollChoices = [...savedScrolls];
      }
    }

    const hasChoicesToShow =
      p.pendingRelicChoices.length > 0 || (p.pendingScrollChoices?.length ?? 0) > 0;

    if (hasChoicesToShow) {
      p.activeChestPropId = prop.id;
      prop.opened = true;
      if (!prop.chestGoldClaimed) {
        prop.chestGoldClaimed = true;
        this.emitEvent('status', prop.x, prop.y - 20, 'Relic Vault Opened', '#E8CE76');
        this.pushSystemChat(`${p.username} opened an Ancient Relic Chest.`);
      }
      return true;
    }

    this.syncChestOpenedState(prop);
    return false;
  }

  public closeChest(playerId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const chestPropId = p.activeChestPropId;
    p.pendingRelicChoices = [];
    p.pendingScrollChoices = [];
    p.activeChestPropId = null;

    if (chestPropId) {
      const prop = this.props.find((x) => x.id === chestPropId);
      if (prop) {
        this.syncChestOpenedState(prop);
      }
    }
  }

  public selectRelic(playerId: string, relicId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (!pr.state.pendingRelicChoices.includes(relicId)) return;
    if (!pr.state.storage) pr.state.storage = [];

    let placedInInventoryOrVault = false;
    if (!pr.state.relics.includes(relicId)) {
      if (pr.state.relics.length >= 5) {
        // Active loadout is full (5/5). If storage has capacity, safely place in Storage Vault!
        if (pr.state.storage.length < 12 && !pr.state.storage.includes(relicId)) {
          pr.state.storage.push(relicId);
          placedInInventoryOrVault = true;
          pr.state.pendingRelicChoices = [];
          const relic = RELIC_CATALOG.find((r) => r.id === relicId);
          const relicName = relic ? relic.name : relicId;
          this.emitEvent('status', pr.state.x, pr.state.y - 24, `+ ${relicName} (Vault)`, relic ? relic.accent : '#FCD34D');
          this.pushSystemChat(`${pr.state.username}'s active loadout is full. ${relicName} was placed in Storage Vault.`);
        } else {
          pr.state.pendingRelicChoices = [];
          this.emitEvent('status', pr.state.x, pr.state.y - 24, 'Inventory Full (Max 5)', '#EF4444');
          this.pushSystemChat(`${pr.state.username} could not claim ${relicId}: Inventory and Vault are both full.`);
          if (pr.state.activeChestPropId && (!pr.state.pendingScrollChoices || pr.state.pendingScrollChoices.length === 0)) {
            const chest = this.props.find((x) => x.id === pr.state.activeChestPropId);
            pr.state.activeChestPropId = null;
            if (chest) this.syncChestOpenedState(chest);
          }
          return;
        }
      } else {
        pr.state.relics.push(relicId);
        placedInInventoryOrVault = true;
      }
    } else {
      placedInInventoryOrVault = true;
    }

    pr.state.pendingRelicChoices = [];

    if (placedInInventoryOrVault && pr.state.activeChestPropId) {
      const chest = this.props.find((x) => x.id === pr.state.activeChestPropId);
      if (chest) {
        if (!chest.claimedRelicPlayerIds) chest.claimedRelicPlayerIds = [];
        if (!chest.claimedRelicPlayerIds.includes(playerId)) {
          chest.claimedRelicPlayerIds.push(playerId);
        }
        if (chest.relicChoicesByPlayer) {
          delete chest.relicChoicesByPlayer[playerId];
        }
        if (!pr.state.pendingScrollChoices || pr.state.pendingScrollChoices.length === 0) {
          pr.state.activeChestPropId = null;
          this.syncChestOpenedState(chest);
        }
      } else {
        pr.state.activeChestPropId = null;
      }
    }

    if (relicId === 'bastion_pauldron') {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + (pr.state.maxHp - oldMax));
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (relic && !pr.state.storage.includes(relicId)) {
      this.emitEvent('status', pr.state.x, pr.state.y - 24, `+ ${relic.name}`, relic.accent);
      this.pushSystemChat(`${pr.state.username} claimed relic: ${relic.name}.`);
    }
  }

  public unequipRelic(playerId: string, relicId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (!pr.state.storage) pr.state.storage = [];
    const idx = pr.state.relics.indexOf(relicId);
    if (idx >= 0) {
      pr.state.relics.splice(idx, 1);
      // Safely deposit unequipped relic into storage vault if room exists
      let storedInVault = false;
      if (pr.state.storage.length < 12 && !pr.state.storage.includes(relicId)) {
        pr.state.storage.push(relicId);
        storedInVault = true;
      }
      if (relicId === 'bastion_pauldron') {
        const oldMax = pr.state.maxHp;
        pr.state.maxHp = GameRoom.computePlayerMaxHp(
          pr.state.heroClass,
          pr.state.level,
          pr.state.vitality,
          pr.state.relics,
          pr.state.equippedVestment
        );
        pr.state.hp = Math.min(pr.state.hp, pr.state.maxHp);
      }
      const relic = RELIC_CATALOG.find((r) => r.id === relicId);
      const relicName = relic ? relic.name : relicId;
      this.emitEvent('status', pr.state.x, pr.state.y - 24, storedInVault ? `Stored ${relicName}` : `- ${relicName}`, '#94A3B8');
      this.pushSystemChat(
        storedInVault
          ? `${pr.state.username} moved relic to Storage Vault: ${relicName}.`
          : `${pr.state.username} unequipped relic: ${relicName}.`
      );
    }
  }

  public storeRelic(playerId: string, relicId: string): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (!pr.state.storage) pr.state.storage = [];
    if (pr.state.storage.length >= 12) {
      this.emitEvent('status', pr.state.x, pr.state.y - 24, 'Storage Vault Full (12/12)', '#EF4444');
      return false;
    }
    const idx = pr.state.relics.indexOf(relicId);
    if (idx < 0) return false;
    pr.state.relics.splice(idx, 1);
    pr.state.storage.push(relicId);
    if (relicId === 'bastion_pauldron') {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.hp, pr.state.maxHp);
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    const relicName = relic ? relic.name : relicId;
    this.emitEvent('status', pr.state.x, pr.state.y - 24, `Stored ${relicName}`, '#38BDF8');
    this.pushSystemChat(`${pr.state.username} stored ${relicName} in Storage Vault.`);
    return true;
  }

  public equipStoredRelic(playerId: string, relicId: string): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (!pr.state.storage) pr.state.storage = [];
    if (pr.state.relics.length >= 5) {
      this.emitEvent('status', pr.state.x, pr.state.y - 24, 'Equipped Slots Full (Max 5)', '#EF4444');
      return false;
    }
    const idx = pr.state.storage.indexOf(relicId);
    if (idx < 0) return false;
    pr.state.storage.splice(idx, 1);
    if (!pr.state.relics.includes(relicId)) {
      pr.state.relics.push(relicId);
    }
    if (relicId === 'bastion_pauldron') {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + (pr.state.maxHp - oldMax));
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    const relicName = relic ? relic.name : relicId;
    this.emitEvent('status', pr.state.x, pr.state.y - 24, `Equipped ${relicName}`, relic ? relic.accent : '#FCD34D');
    this.pushSystemChat(`${pr.state.username} equipped ${relicName} from Storage Vault.`);
    return true;
  }

  public deleteRelic(playerId: string, relicId: string, fromStorage?: boolean): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (!pr.state.storage) pr.state.storage = [];
    let removed = false;
    let wasEquipped = false;

    if (fromStorage) {
      const idx = pr.state.storage.indexOf(relicId);
      if (idx >= 0) {
        pr.state.storage.splice(idx, 1);
        removed = true;
      }
    } else {
      const idx = pr.state.relics.indexOf(relicId);
      if (idx >= 0) {
        pr.state.relics.splice(idx, 1);
        removed = true;
        wasEquipped = true;
      } else {
        const sIdx = pr.state.storage.indexOf(relicId);
        if (sIdx >= 0) {
          pr.state.storage.splice(sIdx, 1);
          removed = true;
        }
      }
    }

    if (!removed) return false;

    if (wasEquipped && relicId === 'bastion_pauldron') {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics,
        pr.state.equippedVestment
      );
      pr.state.hp = Math.min(pr.state.hp, pr.state.maxHp);
    }

    const salvageGold = 40;
    pr.state.gold = (pr.state.gold || 0) + salvageGold;

    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    const relicName = relic ? relic.name : relicId;
    this.emitEvent('status', pr.state.x, pr.state.y - 24, `+${salvageGold}g (Dismantled)`, '#E0A94F');
    this.pushSystemChat(`${pr.state.username} dismantled ${relicName} for ${salvageGold} gold.`);
    return true;
  }

  public discardPotion(playerId: string, count = 1): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    if (pr.state.potions <= 0) return false;
    const discardAmount = Math.min(pr.state.potions, Math.max(1, count));
    pr.state.potions -= discardAmount;
    this.emitEvent('status', pr.state.x, pr.state.y - 24, `-${discardAmount} Potion`, '#94A3B8');
    this.pushSystemChat(`${pr.state.username} discarded ${discardAmount} health potion(s).`);
    return true;
  }

  public togglePlayerGodMode(playerId: string, enabled?: boolean): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== undefined ? enabled : !pr.state.godMode;
    pr.state.godMode = nextState;
    if (nextState) {
      pr.state.hp = pr.state.maxHp;
    }
    this.emitEvent(
      'status',
      pr.state.x,
      pr.state.y - 28,
      nextState ? 'GOD MODE ON' : 'GOD MODE OFF',
      nextState ? '#F59E0B' : '#64748B'
    );
    return nextState;
  }

  public togglePlayerSpeedBoost(playerId: string, enabled?: boolean): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== undefined ? enabled : !pr.state.speedBoost;
    pr.state.speedBoost = nextState;
    this.emitEvent(
      'status',
      pr.state.x,
      pr.state.y - 28,
      nextState ? ' SPEED BOOST ON' : ' SPEED NORMAL',
      nextState ? '#10B981' : '#64748B'
    );
    return nextState;
  }

  public togglePlayerNoCooldown(playerId: string, enabled?: boolean): boolean {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== undefined ? enabled : !pr.state.noCooldownMode;
    pr.state.noCooldownMode = nextState;
    if (nextState) {
      pr.state.skillCooldownMs = 0;
      pr.state.ultCooldownMs = 0;
      pr.state.dashCooldownMs = 0;
      pr.attackCooldownMs = 0;
    }
    this.emitEvent(
      'status',
      pr.state.x,
      pr.state.y - 28,
      nextState ? 'NO COOLDOWN ON' : 'NO COOLDOWN OFF',
      nextState ? '#38BDF8' : '#64748B'
    );
    return nextState;
  }

  public addPlayerGold(playerId: string, amount: number): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.gold += amount;
    this.emitEvent('gold', pr.state.x, pr.state.y - 22, `+${amount}g`, '#F4D378');
  }

  public addPlayerPotions(playerId: string, amount: number): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.potions += amount;
    this.emitEvent('heal', pr.state.x, pr.state.y - 22, `+${amount} Potions`, '#EF4444');
  }

  public setPlayerLevel(playerId: string, targetLevel: number): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const def = HERO_CLASSES[p.heroClass];
    p.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(targetLevel) || 1));
    p.xp = 0;
    p.nextXp = GameRoom.computeNextXp(p.level);
    
    // Reset attributes for fresh level set
    p.strength = 0;
    p.vitality = 0;
    p.dexterity = 0;
    p.intelligence = 0;
    p.faith = 0;
    p.attributePoints = (p.level - 1) * 3;

    p.maxHp = GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
    p.hp = p.maxHp;
    this.emitEvent('status', p.x, p.y - 26, `Level ${p.level} Set!`, '#F4D378');
    if (this.onProgressionUpdateCallback) this.onProgressionUpdateCallback(p.id, p);
  }

  public addPlayerRelic(playerId: string, relicId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (!relic) return;
    if (!p.relics.includes(relicId)) {
      p.relics.push(relicId);
    }
    if (relicId === 'bastion_pauldron') {
      const oldMax = p.maxHp;
      p.maxHp = GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMax));
    }
    this.emitEvent('status', p.x, p.y - 24, `+ ${relic.name}`, relic.accent);
  }

  public addPlayerAttributePoints(playerId: string, amount: number): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.attributePoints += amount;
    this.emitEvent('status', pr.state.x, pr.state.y - 24, `+${amount} Attribute Pts`, '#D9AA52');
  }

  public updatePlayerAttributes(
    playerId: string,
    strength: number,
    vitality: number,
    dexterity: number,
    intelligence: number,
    faith: number,
    attributePoints: number
  ): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    p.strength = strength;
    p.vitality = vitality;
    p.dexterity = dexterity;
    p.intelligence = intelligence;
    p.faith = faith;
    p.attributePoints = attributePoints;

    const oldMax = p.maxHp;
    p.maxHp = GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
    p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.maxHp, p.hp);
    if (this.onProgressionUpdateCallback) this.onProgressionUpdateCallback(p.id, p);
  }

  public spawnDummyAtPlayer(playerId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const dummy: TrainingDummyState = {
      id: this.nextId('dummy'),
      x: pr.state.x + 40 * Math.cos(pr.state.aimAngle),
      y: pr.state.y + 40 * Math.sin(pr.state.aimAngle),
      hp: 10000,
      maxHp: 10000,
      hitAnimMs: 0,
      totalDamageTaken: 0,
      lastHitTimerMs: 0,
    };
    this.trainingDummies.push(dummy);
    this.emitEvent('status', dummy.x, dummy.y - 20, 'Training Dummy Spawned', '#FBBF24');
  }

  private rollRelicChoices(owned: string[]): string[] {
    const unowned = RELIC_CATALOG.filter((r) => !owned.includes(r.id));
    const unownedPool = [...unowned];
    const picked: string[] = [];

    // Prioritize all available unowned relics first
    while (picked.length < 3 && unownedPool.length > 0) {
      const idx = Math.floor(Math.random() * unownedPool.length);
      picked.push(unownedPool[idx].id);
      unownedPool.splice(idx, 1);
    }

    // If fewer than 3 unowned relics remain, fill remaining slots from the rest of the catalog
    if (picked.length < 3) {
      const fallbackPool = RELIC_CATALOG.filter((r) => !picked.includes(r.id));
      while (picked.length < 3 && fallbackPool.length > 0) {
        const idx = Math.floor(Math.random() * fallbackPool.length);
        picked.push(fallbackPool[idx].id);
        fallbackPool.splice(idx, 1);
      }
    }

    return picked;
  }

  public rollScrollChoices(equippedId?: string | null): ArcanistScrollId[] {
    const pool = ARCANIST_SCROLLS.filter((s) => s.id !== equippedId);
    const copy = [...pool];
    const picked: ArcanistScrollId[] = [];
    while (picked.length < 3 && copy.length > 0) {
      const idx = Math.floor(Math.random() * copy.length);
      picked.push(copy[idx].id);
      copy.splice(idx, 1);
    }
    return picked;
  }

  public grantScrollChoices(playerId: string): boolean {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.heroClass !== 'arcanist') return false;
    if (pr.state.pendingScrollChoices && pr.state.pendingScrollChoices.length > 0) return false;
    const choices = this.rollScrollChoices(pr.state.equippedScrollId);
    if (choices.length === 0) return false;
    pr.state.pendingScrollChoices = choices;
    return true;
  }

  public selectArcanistScroll(playerId: string, scrollId: ArcanistScrollId): void {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.heroClass !== 'arcanist') return;
    const p = pr.state;
    if (!p.pendingScrollChoices || !p.pendingScrollChoices.includes(scrollId)) return;
    const scrollDef = getArcanistScrollDef(scrollId);
    if (!scrollDef) return;
    p.pendingScrollChoices = [];
    if (p.disintegrationState?.active) {
      p.disintegrationState = null;
    }
    p.spellCastState = null;
    p.equippedScrollId = scrollId;
    if (p.activeChestPropId) {
      const chest = this.props.find((x) => x.id === p.activeChestPropId);
      if (chest) {
        if (!chest.claimedScrollPlayerIds) chest.claimedScrollPlayerIds = [];
        if (!chest.claimedScrollPlayerIds.includes(playerId)) {
          chest.claimedScrollPlayerIds.push(playerId);
        }
        if (chest.scrollChoicesByPlayer) {
          delete chest.scrollChoicesByPlayer[playerId];
        }
        if (p.pendingRelicChoices.length === 0) {
          p.activeChestPropId = null;
          this.syncChestOpenedState(chest);
        }
      } else {
        p.activeChestPropId = null;
      }
    }
    const cdrMult = this.getPlayerCdrMult(p);
    p.maxSkillCooldownMs = Math.round(scrollDef.cooldownMs * cdrMult);
    p.skillCooldownMs = Math.min(p.skillCooldownMs, p.maxSkillCooldownMs);
    this.emitEvent('status', p.x, p.y - 26, `Scroll: ${scrollDef.tacticalTitle}`, scrollDef.accentColor);
    this.pushSystemChat(`${p.username} inscribed ${scrollDef.scrollName}, replacing Astral Nova.`);
  }

  public adminEquipScroll(playerId: string, scrollId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const scrollDef = getArcanistScrollDef(scrollId as ArcanistScrollId);
    if (!scrollDef) return;
    if (p.disintegrationState?.active) {
      p.disintegrationState = null;
    }
    p.spellCastState = null;
    p.equippedScrollId = scrollId as ArcanistScrollId;
    const cdrMult = this.getPlayerCdrMult(p);
    p.maxSkillCooldownMs = Math.round(scrollDef.cooldownMs * cdrMult);
    p.skillCooldownMs = 0;
    this.emitEvent('status', p.x, p.y - 26, `Admin Scroll: ${scrollDef.tacticalTitle}`, scrollDef.accentColor);
    this.pushSystemChat(`[ADMIN] ${p.username} equipped ${scrollDef.scrollName}.`);
  }

  private getPlayerCdrMult(p: PlayerState): number {
    const intCdr = Math.min(0.20, (p.intelligence || 0) * 0.002);
    const relicCdr = p.relics.includes('hourglass_shard') ? 0.25 : 0;
    const blessingCdr = this.getBlessingStacks(p, 'swiftness') * 0.08;
    const vestmentCdr =
      resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers.cdrBonus || 0;
    return Math.max(0.50, 1 - (intCdr + relicCdr + blessingCdr + vestmentCdr));
  }

  private getArcanistSpellDamage(p: PlayerState, spellId: ArcanistSpellId): number {
    const spec = ARCANIST_SPELLS[spellId];
    return computeArcanistSpellDamage(
      spec.baseDamage,
      {
        level: p.level,
        intelligence: p.intelligence,
        relics: p.relics,
        furyStacks: this.getBlessingStacks(p, 'fury'),
      },
      spec.intCoeff
    );
  }

  private isPlayerCcInterrupted(p: PlayerState): boolean {
    if (p.downed || !p.connected) return true;
    if ((p.stunnedMs || 0) > 0 || (p.frozenMs || 0) > 0 || (p.chronoSuspendedMs || 0) > 0) return true;
    return Boolean(
      p.statuses &&
        p.statuses.some((s) => s.type === 'silenced' || s.type === 'charmed' || s.type === 'impaled')
    );
  }

  private triggerArcanistScrollTactical(
    p: PlayerState,
    scrollId: ArcanistScrollId,
    aimAngle: number,
    aimDistance?: number
  ): boolean {
    if (p.heroClass !== 'arcanist' || this.isPlayerCcInterrupted(p)) return false;
    const spec = ARCANIST_SPELLS[scrollId];
    if (!spec) return false;
    if (p.spellCastState || p.disintegrationState?.active) return false;
    if (p.skillCooldownMs > 0 && !p.noCooldownMode) return false;

    const cleanAngle = Number.isFinite(aimAngle) ? normalizeAngle(aimAngle) : p.aimAngle;
    p.aimAngle = cleanAngle;

    if (scrollId === 'disintegration') {
      return this.startDisintegrationChannel(p.id, cleanAngle);
    }

    const maxRange = spec.maxRange ?? 280;
    const dist =
      typeof aimDistance === 'number' && Number.isFinite(aimDistance)
        ? Math.max(0, Math.min(maxRange, aimDistance))
        : Math.min(maxRange, 180);
    const targetX = p.x + Math.cos(cleanAngle) * dist;
    const targetY = p.y + Math.sin(cleanAngle) * dist;

    if (spec.castTimeMs > 0) {
      p.spellCastState = {
        spellId: scrollId,
        remainingMs: spec.castTimeMs,
        totalMs: spec.castTimeMs,
        aimAngle: cleanAngle,
        targetX,
        targetY,
      };
      p.attackAnimMs = Math.max(p.attackAnimMs, spec.castTimeMs);
      return true;
    }

    return this.executeArcanistSpell(p, scrollId, cleanAngle, targetX, targetY);
  }

  private executeArcanistSpell(
    p: PlayerState,
    spellId: ArcanistSpellId,
    aimAngle: number,
    targetX: number,
    targetY: number
  ): boolean {
    const spec = ARCANIST_SPELLS[spellId];
    const cdrMult = this.getPlayerCdrMult(p);
    const applyScrollCooldown = () => {
      p.skillCooldownMs = p.noCooldownMode ? 0 : Math.round(spec.cooldownMs * cdrMult);
      p.maxSkillCooldownMs = p.skillCooldownMs;
    };
    const voidMult = this.consumeVoidEnergyForTactical(p);

    const critChance = this.getPlayerCritChance(p);
    const rollSpellCrit = (): { hasCrit: boolean; dmg: number } => {
      const baseScaled = Math.round(this.getArcanistSpellDamage(p, spellId) * voidMult);
      const hasCrit = Math.random() < critChance;
      return {
        hasCrit,
        dmg: hasCrit ? Math.round(baseScaled * CRIT_DAMAGE_MULTIPLIER) : baseScaled,
      };
    };

    if (spellId === 'fireball') {
      applyScrollCooldown();
      p.attackAnimMs = 220;
      const speed = spec.projectileSpeed ?? 380;
      const range = spec.maxRange ?? 360;
      const { hasCrit, dmg } = rollSpellCrit();
      const spawned = this.spawnProjectile({
        ownerType: 'player',
        ownerId: p.id,
        style: 'fireball',
        spellId: 'fireball',
        damageCategory: 'fire',
        explosionRadius: spec.explosionRadius ?? 105,
        x: p.x + Math.cos(aimAngle) * 16,
        y: p.y + Math.sin(aimAngle) * 16,
        vx: Math.cos(aimAngle) * speed,
        vy: Math.sin(aimAngle) * speed,
        angle: aimAngle,
        radius: 14,
        damage: dmg,
        pierce: 1,
        crit: hasCrit,
        ttlMs: Math.round((range / speed) * 1000),
      });
      this.tacticalProjIds.add(spawned.id);
      return true;
    }

    if (spellId === 'frost_lance') {
      applyScrollCooldown();
      p.attackAnimMs = 200;
      const speed = spec.projectileSpeed ?? 480;
      const range = spec.maxRange ?? 420;
      const { hasCrit, dmg } = rollSpellCrit();
      const spawned = this.spawnProjectile({
        ownerType: 'player',
        ownerId: p.id,
        style: 'frost_lance',
        spellId: 'frost_lance',
        damageCategory: 'frost',
        x: p.x + Math.cos(aimAngle) * 16,
        y: p.y + Math.sin(aimAngle) * 16,
        vx: Math.cos(aimAngle) * speed,
        vy: Math.sin(aimAngle) * speed,
        angle: aimAngle,
        radius: 8,
        damage: dmg,
        pierce: spec.pierce ?? 3,
        crit: hasCrit,
        ttlMs: Math.round((range / speed) * 1000),
      });
      this.tacticalProjIds.add(spawned.id);
      return true;
    }

    if (spellId === 'chain_lightning') {
      const maxRange = spec.maxRange ?? 340;
      const halfAngle = spec.coneHalfAngleRad ?? 0.56;

      type LightningTarget =
        | { kind: 'enemy'; id: string; x: number; y: number; dist: number; enemy: EnemyState }
        | { kind: 'dummy'; id: string; x: number; y: number; dist: number; dummy: TrainingDummyState };

      const hitTargets: LightningTarget[] = [];
      for (const e of this.enemies) {
        if (e.hp <= 0) continue;
        const dx = e.x - p.x;
        const dy = e.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRange + e.radius * 0.5) continue;
        const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - aimAngle));
        if (diff > halfAngle) continue;
        if (dist > 20 && !this.hasLineOfSight(p.x, p.y, e.x, e.y)) continue;
        hitTargets.push({ kind: 'enemy', id: e.id, x: e.x, y: e.y, dist, enemy: e });
      }
      for (const d of this.trainingDummies) {
        const dx = d.x - p.x;
        const dy = d.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > maxRange + 16) continue;
        const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - aimAngle));
        if (diff > halfAngle) continue;
        if (dist > 20 && !this.hasLineOfSight(p.x, p.y, d.x, d.y)) continue;
        hitTargets.push({ kind: 'dummy', id: d.id, x: d.x, y: d.y, dist, dummy: d });
      }

      hitTargets.sort((a, b) => a.dist - b.dist);

      applyScrollCooldown();
      p.attackAnimMs = 210;

      const { hasCrit, dmg: coneDmg } = rollSpellCrit();
      const chainPoints: { x: number; y: number }[] = [{ x: p.x, y: p.y }];
      for (const tgt of hitTargets) {
        chainPoints.push({ x: tgt.x, y: tgt.y });
        if (tgt.kind === 'enemy') {
          this.damageEnemy(tgt.enemy, coneDmg, p, hasCrit, 'lightning');
        } else {
          this.damageDummy(tgt.dummy, coneDmg, p, hasCrit, false, 'lightning');
        }
        this.onTacticalHitConfirmed(p);
      }

      this.zones.push({
        id: this.nextId('zone'),
        kind: 'chain_lightning_arc',
        x: p.x,
        y: p.y,
        angle: aimAngle,
        radius: maxRange,
        coneHalfAngleRad: halfAngle,
        ttlMs: 360,
        maxTtlMs: 360,
        ownerId: p.id,
        chainPoints,
      });
      return true;
    }

    if (spellId === 'arcane_meteor') {
      applyScrollCooldown();
      p.attackAnimMs = 260;
      const delayMs = spec.impactDelayMs ?? 1000;
      const radius = spec.explosionRadius ?? 125;
      const { dmg } = rollSpellCrit();
      this.zones.push({
        id: this.nextId('zone'),
        kind: 'arcane_meteor',
        x: targetX,
        y: targetY,
        radius,
        ttlMs: delayMs,
        maxTtlMs: delayMs,
        ownerId: p.id,
        damage: dmg,
        chronoSuspendedMs: this.isPositionInChronoWell(targetX, targetY, 0),
      });
      this.emitEvent('status', targetX, targetY - 22, 'Arcane Meteor!', '#E879F9');
      return true;
    }

    if (spellId === 'arcane_orb') {
      applyScrollCooldown();
      p.attackAnimMs = 220;
      const speed = spec.projectileSpeed ?? 115;
      const durationMs = spec.durationMs ?? 4000;
      const dmg = Math.round(this.getArcanistSpellDamage(p, 'arcane_orb') * voidMult);
      const orb = this.spawnProjectile({
        ownerType: 'player',
        ownerId: p.id,
        style: 'arcane_orb',
        spellId: 'arcane_orb',
        damageCategory: 'arcane',
        x: p.x + Math.cos(aimAngle) * 18,
        y: p.y + Math.sin(aimAngle) * 18,
        vx: Math.cos(aimAngle) * speed,
        vy: Math.sin(aimAngle) * speed,
        angle: aimAngle,
        radius: 22,
        damage: dmg,
        pierce: 999,
        ttlMs: durationMs,
      });
      this.arcaneOrbHits.set(orb.id, new Map());
      this.tacticalProjIds.add(orb.id);
      return true;
    }

    if (spellId === 'arcane_barrage') {
      applyScrollCooldown();
      p.attackAnimMs = 380;
      const totalWaves = spec.barrageWaves ?? 4;
      const waveIntervalMs = spec.barrageWaveIntervalMs ?? 95;
      const range = spec.maxRange ?? 450;
      const lockTarget = findBestAutoTarget({
        playerX: p.x,
        playerY: p.y,
        maxRange: range,
        preferredAngle: aimAngle,
        minDot: 0.72,
        map: this.map,
        props: this.props,
        enemies: this.enemies,
        trainingDummies: this.trainingDummies,
      })?.target;

      this.fireArcaneBarrageWave(p, aimAngle, 0, lockTarget?.id, voidMult);
      const ownerPr = this.players.get(p.id);
      if (ownerPr && totalWaves > 1) {
        ownerPr.pendingBarrage = {
          wavesRemaining: totalWaves - 1,
          waveIndex: 1,
          timerMs: waveIntervalMs,
          waveIntervalMs,
          aimAngle,
          targetEnemyId: lockTarget?.id,
          empoweredMult: voidMult,
        };
      }
      return true;
    }

    return false;
  }

  private fireArcaneBarrageWave(
    p: PlayerState,
    aimAngle: number,
    waveIndex: number,
    targetEnemyId?: string,
    empoweredMult = 1.0
  ): void {
    const spec = ARCANIST_SPELLS.arcane_barrage;
    const speed = spec.projectileSpeed ?? 420;
    const range = spec.maxRange ?? 450;
    const ttlMs = Math.round((range / speed) * 1000);
    const critChance = this.getPlayerCritChance(p);
    const baseScaled = Math.round(this.getArcanistSpellDamage(p, 'arcane_barrage') * empoweredMult);

    let fireAngle = aimAngle;
    if (targetEnemyId) {
      const targetEntity =
        this.enemies.find((e) => e.id === targetEnemyId && e.hp > 0) ||
        this.trainingDummies.find((d) => d.id === targetEnemyId);
      if (targetEntity) {
        fireAngle = Math.atan2(targetEntity.y - p.y, targetEntity.x - p.x);
      }
    }

    const ox = p.x + Math.cos(fireAngle) * 16;
    const oy = p.y + Math.sin(fireAngle) * 16;

    // Each wave fires 2 bolts: 1 focused seeking bolt + 1 weaving helix bolt
    for (let b = 0; b < 2; b++) {
      const hasCrit = Math.random() < critChance;
      const dmg = hasCrit ? Math.round(baseScaled * CRIT_DAMAGE_MULTIPLIER) : baseScaled;
      const isFocusedBolt = b === 0;
      const boltAngle = isFocusedBolt
        ? fireAngle
        : fireAngle + (waveIndex % 2 === 0 ? 0.045 : -0.045);
      const helixSign = (waveIndex + b) % 2 === 0 ? 1 : -1;
      const helixPhase = isFocusedBolt ? 0 : (waveIndex * Math.PI) / 2;

      const spawned = this.spawnProjectile({
        ownerType: 'player',
        ownerId: p.id,
        style: 'arcane_barrage',
        spellId: 'arcane_barrage',
        damageCategory: 'arcane',
        targetEnemyId: isFocusedBolt ? targetEnemyId : undefined,
        x: ox,
        y: oy,
        originX: ox,
        originY: oy,
        elapsedMs: 0,
        helixSign,
        helixPhase: isFocusedBolt ? undefined : helixPhase,
        vx: Math.cos(boltAngle) * speed,
        vy: Math.sin(boltAngle) * speed,
        angle: boltAngle,
        radius: 8,
        damage: dmg,
        pierce: 1,
        crit: hasCrit,
        ttlMs,
      });
      this.tacticalProjIds.add(spawned.id);
    }
  }

  public startDisintegrationChannel(playerId: string, aimAngle: number): boolean {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== 'playing') return false;
    const p = pr.state;
    if (p.heroClass !== 'arcanist' || p.equippedScrollId !== 'disintegration') return false;
    if (this.isPlayerCcInterrupted(p)) return false;
    if (p.skillCooldownMs > 0 || p.spellCastState) return false;
    if (p.disintegrationState?.active) return true;

    const spec = ARCANIST_SPELLS.disintegration;
    const cleanAngle = Number.isFinite(aimAngle) ? normalizeAngle(aimAngle) : p.aimAngle;
    const voidMult = this.consumeVoidEnergyForTactical(p);
    p.aimAngle = cleanAngle;
    p.spellCastState = null;
    p.vx = 0;
    p.vy = 0;
    p.disintegrationState = {
      active: true,
      angle: cleanAngle,
      targetAngle: cleanAngle,
      activationRemainingMs: spec.activationMs ?? 150,
      tickAccumMs: 0,
      startedAtMs: this.simTimeMs,
      empoweredByVoid: voidMult > 1,
    };
    return true;
  }

  public updateDisintegrationTarget(playerId: string, aimAngle: number): void {
    const pr = this.players.get(playerId);
    if (!pr || !pr.state.disintegrationState?.active) return;
    if (!Number.isFinite(aimAngle)) return;
    const clean = normalizeAngle(aimAngle);
    pr.state.disintegrationState.targetAngle = clean;
    pr.state.aimAngle = clean;
  }

  public stopDisintegrationChannel(playerId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    if (!p.disintegrationState?.active) return;
    p.disintegrationState = null;
    const cdrMult = this.getPlayerCdrMult(p);
    p.skillCooldownMs = Math.round(ARCANIST_SPELLS.disintegration.cooldownMs * cdrMult);
    p.maxSkillCooldownMs = p.skillCooldownMs;
  }

  private getDisintegrationEndpoint(x: number, y: number, angle: number, maxRange: number): { endX: number; endY: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const step = 14;
    let dist = 0;
    while (dist + step <= maxRange) {
      const nx = x + cos * (dist + step);
      const ny = y + sin * (dist + step);
      if (this.isWallAtWorld(nx, ny)) {
        break;
      }
      dist += step;
    }
    const finalDist = Math.min(maxRange, dist);
    return {
      endX: x + cos * finalDist,
      endY: y + sin * finalDist,
    };
  }

  private stepDisintegrationChannel(p: PlayerState, dtMs: number, dtSec: number): void {
    const ch = p.disintegrationState;
    if (!ch || !ch.active) return;
    if (this.isPlayerCcInterrupted(p)) {
      this.stopDisintegrationChannel(p.id);
      this.emitEvent('status', p.x, p.y - 24, 'CHANNEL INTERRUPTED!', '#EF4444');
      return;
    }

    p.vx = 0;
    p.vy = 0;
    const spec = ARCANIST_SPELLS.disintegration;
    const maxRotPerSec = spec.maxRotationRadPerSec ?? Math.PI;
    ch.angle = rotateAngleToward(ch.angle, ch.targetAngle, maxRotPerSec * dtSec);
    p.aimAngle = ch.angle;
    p.attackAnimMs = 120;

    let remainingDt = dtMs;
    if (ch.activationRemainingMs > 0) {
      if (remainingDt < ch.activationRemainingMs) {
        ch.activationRemainingMs -= remainingDt;
        return;
      }
      remainingDt -= ch.activationRemainingMs;
      ch.activationRemainingMs = 0;
    }

    const tickInterval = spec.tickIntervalMs ?? 200;
    ch.tickAccumMs += remainingDt;
    if (ch.tickAccumMs < tickInterval) return;

    const beamHalfWidth = (spec.beamWidth ?? 42) / 2;
    const maxRange = spec.maxRange ?? 450;
    const { endX, endY } = this.getDisintegrationEndpoint(p.x, p.y, ch.angle, maxRange);
    const voidMult = ch.empoweredByVoid
      ? 1 + ARMAMENT_TUNING.passives.voidConsumption.empoweredTacticalBonusPct
      : 1.0;
    const tickDmg = Math.round(this.getArcanistSpellDamage(p, 'disintegration') * voidMult);

    while (ch.tickAccumMs >= tickInterval) {
      ch.tickAccumMs -= tickInterval;
      const candidateEnemies = [...this.enemies];
      for (const enemy of candidateEnemies) {
        if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
        const d = distancePointToSegment(enemy.x, enemy.y, p.x, p.y, endX, endY);
        if (d <= beamHalfWidth + enemy.radius) {
          this.damageEnemy(enemy, tickDmg, p, false, 'arcane');
          this.onTacticalHitConfirmed(p);
        }
      }
      for (const dummy of this.trainingDummies) {
        const d = distancePointToSegment(dummy.x, dummy.y, p.x, p.y, endX, endY);
        if (d <= beamHalfWidth + 18) {
          this.damageDummy(dummy, tickDmg, p, false, false, 'arcane');
          this.onTacticalHitConfirmed(p);
        }
      }
    }
  }

  private explodeFireball(proj: ProjectileState): void {
    const fbSpec = ARCANIST_SPELLS.fireball;
    const radius = proj.explosionRadius ?? fbSpec.explosionRadius ?? 105;
    const ownerPr = this.players.get(proj.ownerId);
    const attacker = ownerPr ? ownerPr.state : null;
    const targets = [...this.enemies];
    const isTacticalProj = this.tacticalProjIds.has(proj.id);
    for (const enemy of targets) {
      if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
      if (Math.hypot(enemy.x - proj.x, enemy.y - proj.y) <= radius + enemy.radius * 0.35) {
        const dealt = this.damageEnemy(enemy, proj.damage, attacker, Boolean(proj.crit), 'fire');
        if (dealt > 0 && isTacticalProj) {
          this.onTacticalHitConfirmed(attacker);
        }
      }
    }
    for (const dummy of this.trainingDummies) {
      if (Math.hypot(dummy.x - proj.x, dummy.y - proj.y) <= radius + 18) {
        this.damageDummy(dummy, proj.damage, attacker, Boolean(proj.crit), false, 'fire');
        if (isTacticalProj) {
          this.onTacticalHitConfirmed(attacker);
        }
      }
    }

    // Leave a lingering burning ground zone at explosion center
    const burnRadius = fbSpec.burnRadius ?? Math.round(radius * 0.85);
    const burnDuration = fbSpec.durationMs ?? 3500;
    const baseSpellDmg = attacker
      ? this.getArcanistSpellDamage(attacker, 'fireball')
      : proj.damage;
    const burnTickDmg = Math.max(4, Math.round(baseSpellDmg * (fbSpec.burnTickRatio ?? 0.22)));
    this.zones.push({
      id: this.nextId('zone'),
      kind: 'fireball_burn',
      x: proj.x,
      y: proj.y,
      radius: burnRadius,
      ttlMs: burnDuration,
      maxTtlMs: burnDuration,
      ownerId: proj.ownerId,
      damage: burnTickDmg,
      chronoSuspendedMs: this.isPositionInChronoWell(proj.x, proj.y, 0),
    });

    this.emitEvent('status', proj.x, proj.y - 16, 'FIREBALL BLAST!', '#F97316');
  }

  private isPositionInChronoWell(
    x: number,
    y: number,
    radius = 0,
    excludeOwnerId?: string
  ): number {
    let maxRemain = 0;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.kind !== 'chrono_well' || z.ttlMs <= 0) continue;
      if (excludeOwnerId && z.ownerId === excludeOwnerId) continue;
      if (Math.hypot(x - z.x, y - z.y) <= z.radius + radius) {
        if (z.ttlMs > maxRemain) maxRemain = z.ttlMs;
      }
    }
    return maxRemain;
  }

  private refreshChronoSuspensionState(): void {
    for (const pr of this.players.values()) {
      const p = pr.state;
      if (p.downed) {
        p.chronoSuspendedMs = 0;
      } else {
        p.chronoSuspendedMs = this.isPositionInChronoWell(p.x, p.y, 10, p.id);
      }
    }
    for (const enemy of this.enemies) {
      enemy.chronoSuspendedMs = this.isPositionInChronoWell(enemy.x, enemy.y, enemy.radius * 0.35);
    }
    for (const proj of this.projectiles) {
      proj.chronoSuspendedMs = this.isPositionInChronoWell(proj.x, proj.y, proj.radius);
    }
    for (const z of this.zones) {
      if (z.kind === 'chrono_well' || z.kind === 'chain_lightning_arc') {
        z.chronoSuspendedMs = 0;
        continue;
      }
      const isSupportZone = z.kind === 'aegis_dome' || z.kind === 'solar_beacon';
      const isOffensivePlayerZone =
        z.kind === 'star_rift' || z.kind === 'arcane_meteor' || z.kind === 'fireball_burn';
      let susp = this.isPositionInChronoWell(
        z.x,
        z.y,
        0,
        isSupportZone ? z.ownerId : undefined
      );
      if (susp === 0 && !isSupportZone && !isOffensivePlayerZone) {
        const ownerEnemy = this.enemies.find((e) => e.id === z.ownerId);
        if (ownerEnemy && (ownerEnemy.chronoSuspendedMs || 0) > 0) {
          susp = ownerEnemy.chronoSuspendedMs || 0;
        }
      }
      z.chronoSuspendedMs = susp;
    }
  }

  private cleanupChronoWellsForOwner(ownerId: string): void {
    let removedAny = false;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      if (this.zones[i].kind === 'chrono_well' && this.zones[i].ownerId === ownerId) {
        this.zones.splice(i, 1);
        removedAny = true;
      }
    }
    if (removedAny) {
      this.refreshChronoSuspensionState();
    }
  }

  public performAction(
    playerId: string,
    action: 'tactical' | 'ult' | 'potion' | 'interact' | 'dash',
    aimAngle = 0,
    options?: { aimDistance?: number; explicitAim?: boolean }
  ): { floorChanged?: DungeonMap } {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== 'playing') return {};
    const p = pr.state;
    if (p.downed || (p.chronoSuspendedMs || 0) > 0) return {};
    p.aimAngle = Number.isFinite(aimAngle) ? aimAngle : p.aimAngle;

    const def = HERO_CLASSES[p.heroClass];
    const cdrMult = this.getPlayerCdrMult(p);

    const isSilenced = p.statuses && p.statuses.some(s => s.type === 'silenced');

    if (action === 'dash') {
      if (p.dashCooldownMs > 0 && !p.noCooldownMode) return {};
      p.dashCooldownMs = p.noCooldownMode ? 0 : Math.round(2600 * cdrMult);
      p.maxDashCooldownMs = p.dashCooldownMs;

      let dashAngle = p.aimAngle;
      if (!options?.explicitAim && Math.hypot(p.vx, p.vy) > 0.1) {
        dashAngle = Math.atan2(p.vy, p.vx);
      }
      const dashSpec = getAbilityTargetSpec(p.heroClass, 'dash');
      const dashDist =
        typeof options?.aimDistance === 'number' && Number.isFinite(options.aimDistance)
          ? Math.max(24, Math.min(dashSpec.range, options.aimDistance))
          : dashSpec.defaultDist;
      this.moveWithCollision(
        p,
        Math.cos(dashAngle) * dashDist,
        Math.sin(dashAngle) * dashDist,
        14
      );
      p.hasteMs = Math.max(p.hasteMs || 0, 600);
      this.emitEvent('status', p.x, p.y - 22, 'Dash!', '#F59E0B');
      return {};
    }

    if (action === 'potion') {
      if (p.potions > 0 && p.hp < p.maxHp) {
        p.potions -= 1;
        const cursedMult = p.statuses && p.statuses.some(s => s.type === 'ashen_curse') ? 0.55 : 1.0;
        const healAmt = Math.max(1, Math.round(p.maxHp * 0.30 * cursedMult));
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        this.emitEvent('heal', p.x, p.y - 20, `+${healAmt}`, '#34D399');
      }
      return {};
    }

    if (action === 'interact') {
      // 1. NPC Conversations
      for (const npc of this.npcs) {
        const dist = Math.hypot(npc.x - p.x, npc.y - p.y);
        if (dist <= 110) {
          const heroClassName = HERO_CLASSES[p.heroClass]?.name || 'Adventurer';

          let lines: string[] = [];
          if (npc.id === 'npc_bram') {
            lines = [
              `Welcome to The Rusty Tankard, ${p.username}! Pull up a stool by the hearth and warm your hands.`,
              'I have seen hundreds of adventurers cross my doorstep. The secret to surviving Beyond is party coordination.',
              'Rest your legs! Lena just brewed a fresh pot of hearty venison stew over the fireplace.',
              'Look out for Warden Malakor on Floor 1! His tower shield can crush an unwary warrior in a single blow.',
              'Don\'t forget to break every crate and barrel you see down below—relics and gold lie hidden everywhere!',
              'If your party falls in battle, a Cleric\'s Solar Beacon or another ally can revive you before time runs out.',
            ];
          } else if (npc.id === 'npc_lena') {
            const classTip =
              p.heroClass === 'vanguard'
                ? 'A Vanguard in heavy plate! Stand in the frontlines and pop your Shield to absorb boss slams.'
                : p.heroClass === 'ranger'
                  ? 'A Ranger from the Thornwood! Keep your distance and mark targets with Hunter Quarry for big crits.'
                  : p.heroClass === 'arcanist'
                    ? 'An Arcanist! Cast Chrono Well in narrow choke points to slow down swarming monster waves.'
                    : 'A Sunbrand Prelate! Keep your Solar Beacon ready when the party\'s health drops low.';

            lines = [
              `Ah, ${p.username}! Care for a mug of our signature honeyed mead or a glass of spiced cider?`,
              classTip,
              'Floor 1 is Highkeep Outer Bailey. Watch for Warden Malakor\'s crushing tower shield!',
              'Floor 2 is the Sunken Crypt. Archlich Vaelor casts necrotic soul frost that freezes anyone standing still.',
              'Floor 3 is Cindervault Bastion—a searing inferno ruled by Ignis, Cinder Sovereign! Equip Cinder Heart and Runic Carapace relics if you find them.',
              'Floor 4 is the Abyssal Shadow Chasm! Void-Eater Malice opens black holes that pull heroes into oblivion.',
              'Floor 5 reaches the Aetherial Void Spire! The Archon of Nothingness unleashes devastating astral starlight novas.',
              'Floor 6 enters the Hall of Forgotten Hymns, guarded by Elyndor, Keeper of the Last Hymn.',
              'Floor 7 holds the Reliquary of the Departed where Zadkiel shields sacred ancestral relics.',
              'Floor 8 leads to the Chapel of Severed Light, where Sariel guards the sealed scriptures.',
              'Floor 9 ascends to the Celestial Nave before Seraphel, Sentinel of the Final Seal.',
              'Floor 10 marks the Warden\'s Gate! Defeat Oriphiel, The Last Warden, to unseal the path deeper into the Sanctuary.',
              'Need to blow off steam after a tough run? Practice your combo strikes on the dummies in the East wing!',
            ];
          } else if (npc.id === 'npc_aleph') {
            lines = [
              'The paths you walk are many, but your soul remains constant. Do you seek a different focus?',
              'True strength comes not from the sword, but from knowing how to wield it.',
              'The stars whispered of your coming. I offer you the chance to begin anew.',
            ];
            // Ensure options are restored if they were cleared by a dialogue pick
            if (!npc.options || npc.options.length === 0) {
              npc.options = [
                { id: 'reset_stats', label: 'I wish to reset my attributes.' },
                { id: 'lore', label: 'Who are you?' }
              ];
            }
          } else {
            const combatTip =
              p.heroClass === 'vanguard'
                ? 'Vanguard, your Shield Bash stuns elites for 1.7s! Use it to interrupt heavy boss attacks.'
                : p.heroClass === 'ranger'
                  ? 'Ranger, your Frost Volley pierces up to 5 foes at once. Keep kiting to control the room.'
                  : p.heroClass === 'arcanist'
                    ? 'Arcanist, your Astral Nova releases an 8-way starburst that clears enemies surrounding you.'
                    : 'Cleric, your Dawnstar Smite heals nearby allies while damaging surrounding foes simultaneously.';

            lines = [
              `Halt, ${p.username}! Keep your guard high and your weapon polished. Indecision gets heroes killed.`,
              combatTip,
              'When an enemy glows orange, they are winding up a heavy attack. Step out of the danger zone immediately!',
              'Relic synergies are key! Combining Stormcaller Lodestone with Viper Crucible inflicts Shock and Poison at once.',
              'Step into my training ring over there and test your DPS against my straw dummies anytime.',
            ];
          }

          npc.speechIndex = ((npc.speechIndex ?? -1) + 1) % lines.length;
          const spoken = lines[npc.speechIndex];
          npc.dialogue = spoken;
          // Aleph stays open indefinitely if he has options
          npc.speakingMs = (npc.options && npc.options.length > 0) ? 9999999 : 5000;

          this.emitEvent('status', npc.x, npc.y - 28, `"${spoken}"`, '#FDE68A');
          this.pushSystemChat(` ${npc.name}: "${spoken}"`);
        }
      }

      for (const dummy of this.trainingDummies) {
        const dist = Math.hypot(dummy.x - p.x, dummy.y - p.y);
        if (dist <= 72) {
          dummy.totalDamageTaken = 0;
          dummy.lastHitTimerMs = 0;
          this.emitEvent('status', dummy.x, dummy.y - 44, ' Counter Reset', '#38BDF8');
          this.pushSystemChat(` ${p.username} reset the Training Dummy damage tracker.`);
          return {};
        }
      }

      for (const prop of this.props) {
        if (prop.kind === 'warden_gate') {
          const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
          if (dist <= 65) {
            this.emitEvent('status', prop.x, prop.y - 45, '"You are not worthy!"', '#EF4444');
            this.pushSystemChat(`Warden's Gate: "You are not worthy!"`);
            // Trigger temporary floating dialogue via status event and system chat
            return {};
          }
        }

        const isToggleableChest = prop.kind === 'chest' || prop.kind === 'relic_chest';
        if (prop.opened && !isToggleableChest) continue;
        const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
        if (dist <= 62) {
          if (isToggleableChest && prop.opened && p.activeChestPropId !== prop.id && !this.hasUnclaimedChestLootForPlayer(prop, p)) {
            continue;
          }
          if (prop.locked && prop.roomId !== undefined) {
            const lockedRoom = this.map.rooms.find((r) => r.id === prop.roomId);
            const stillAlive =
              (lockedRoom && !lockedRoom.cleared) ||
              this.enemies.some((e) => e.roomId === prop.roomId && e.hp > 0);
            if (stillAlive) {
              this.emitEvent('status', prop.x, prop.y - 24, 'LOCKED · CLEAR ROOM!', '#EF4444');
              return {};
            }
            prop.locked = false;
          }
          if (isToggleableChest) {
            this.openChest(p.id, prop);
            return {};
          }
          prop.opened = true;
          if (prop.kind === 'crate') {
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            if (Math.random() < 0.45) {
              p.potions = Math.min(5, p.potions + 1);
              this.emitEvent('heal', prop.x, prop.y - 18, '+1 Potion', '#6EE7B7');
            }
            this.emitEvent('gold', prop.x, prop.y - 8, `+${prop.value} Gold`, '#F4D378');
          } else if (prop.kind === 'potion') {
            p.potions = Math.min(5, p.potions + 1);
            this.emitEvent('heal', prop.x, prop.y - 12, '+1 Potion', '#6EE7B7');
          } else if (prop.kind === 'shrine') {
            for (const ally of this.players.values()) {
              if (ally.state.downed) {
                ally.state.downed = false;
                ally.state.hp = Math.round(ally.state.maxHp * 0.6);
              } else {
                ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + prop.value);
              }
              ally.state.shield = Math.max(ally.state.shield, 25);
              this.emitEvent(
                'heal',
                ally.state.x,
                ally.state.y - 20,
                `+${prop.value} Shrine Blessing`,
                '#7CE8A6'
              );
            }
            this.pushSystemChat(`${p.username} invoked a Sanctuary Shrine, restoring the party.`);
          }
          return {};
        }
      }

      if (this.floor > 0 && this.roomId !== 'TAVERN-HUB' && this.map.portalActive) {
        const portalDist = Math.hypot(
          this.map.portalPos.x - p.x,
          this.map.portalPos.y - p.y
        );
        if (portalDist <= 68) {
          p.readyNextFloor = true;
          const activePlayers = Array.from(this.players.values()).filter(
            (r) => r.state.connected && !r.state.downed
          );
          const readyPlayers = activePlayers.filter((r) => r.state.readyNextFloor);
          if (readyPlayers.length >= activePlayers.length) {
            if (this.onFloorClearedCallback) {
              this.onFloorClearedCallback(
                Array.from(this.players.keys()),
                this.floor
              );
            }
            if (this.floor >= MAX_FLOORS_FOR_VICTORY) {
              this.status = 'victory';
              this.endedAt = Date.now();
              if (this.roomId !== 'TAVERN-HUB' && !this.isPlayerConnected(this.hostId)) {
                this.transferHostToConnectedMember();
              }
              this.pushSystemChat(
                `Victory! The party conquered Floor ${this.floor} and reclaimed Beyond!`
              );
              return {};
            }
            this.loadFloor(this.floor + 1, this.players.size);
            this.pushSystemChat(
              `Descending to Floor ${this.floor}: ${this.map.biomeTitle}.`
            );
            return { floorChanged: this.map };
          } else {
            this.emitEvent(
              'status',
              this.map.portalPos.x,
              this.map.portalPos.y - 26,
              `Portal Ready (${readyPlayers.length}/${activePlayers.length})`,
              '#7CC6FE'
            );
          }
        }
      }
      return {};
    }

    if (action === 'tactical') {
      if (isSilenced) {
        this.emitEvent('status', p.x, p.y - 24, '[SILENCED]', '#C084FC');
        return {};
      }
      if (p.skillCooldownMs > 0 && !p.noCooldownMode) return {};

      let resolvedTacticalDist = options?.aimDistance;
      const tacticalSpec = getAbilityTargetSpec(
        p.heroClass,
        'tactical',
        p.equippedScrollId,
        p.equippedWeapon
      );
      if (!options?.explicitAim) {
        const smart = resolveSkillSmartTarget({
          spec: tacticalSpec,
          playerX: p.x,
          playerY: p.y,
          fallbackAngle: p.aimAngle,
          fallbackDistance: options?.aimDistance,
          preferCursorCone: false,
          map: this.map,
          props: this.props,
          enemies: this.enemies,
          trainingDummies: this.trainingDummies,
        });
        if (smart.target) {
          p.aimAngle = smart.aimAngle;
          if (resolvedTacticalDist === undefined) {
            resolvedTacticalDist = smart.aimDistance;
          }
        }
      }

      if (p.heroClass === 'arcanist' && p.equippedScrollId) {
        const scrollActivated = this.triggerArcanistScrollTactical(
          p,
          p.equippedScrollId,
          p.aimAngle,
          resolvedTacticalDist
        );
        if (scrollActivated && p.relics.includes('oathbound_censer')) {
          for (const ally of this.players.values()) {
            if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 180) {
              const censerCurseMult = ally.state.statuses && ally.state.statuses.some(s => s.type === 'ashen_curse') ? 0.55 : 1.0;
              const censerHeal = Math.max(1, Math.round(8 * censerCurseMult));
              ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + censerHeal);
            }
          }
        }
        return {};
      }

      const isSeraphimTactical =
        p.heroClass === 'cleric' &&
        Boolean(resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon)?.modifiers.seraphimTacticalBurst);
      const rawTacCooldownMs = isSeraphimTactical
        ? ARMAMENT_TUNING.weapons.seraphim.tacticalCooldownMs
        : def.tacticalCooldownMs;
      p.skillCooldownMs = p.noCooldownMode ? 0 : Math.round(rawTacCooldownMs * cdrMult);
      p.maxSkillCooldownMs = p.skillCooldownMs;
      p.attackAnimMs = 240;

      if (p.relics.includes('oathbound_censer')) {
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 180) {
            const censerCurseMult = ally.state.statuses && ally.state.statuses.some(s => s.type === 'ashen_curse') ? 0.55 : 1.0;
            const censerHeal = Math.max(1, Math.round(8 * censerCurseMult));
            ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + censerHeal);
          }
        }
      }

      if (p.heroClass === 'vanguard') {
        const dmgMult = this.computeDamageMult(p, 'physical');
        const dashDist = 92;
        this.moveWithCollision(
          p,
          Math.cos(p.aimAngle) * dashDist,
          Math.sin(p.aimAngle) * dashDist,
          12
        );
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 170) {
            ally.state.shield = Math.min(this.getMaxShieldCap(ally.state), ally.state.shield + 28);
            this.emitEvent('status', ally.state.x, ally.state.y - 22, '+28 Shield', '#93C5FD');
          }
        }
        const bashTargets = [...this.enemies];
        for (const enemy of bashTargets) {
          if (enemy && enemy.hp > 0 && this.enemies.includes(enemy) && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 84) {
            this.applyHardCc(enemy, 'stun', 1700);
            this.damageEnemy(enemy, Math.round(32 * dmgMult), p, false, 'physical');
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 84) {
            this.damageDummy(dummy, Math.round(32 * dmgMult), p, false, false, 'physical');
          }
        }
      } else if (p.heroClass === 'ranger') {
        const dmgMult = this.computeDamageMult(p, 'physical');
        const baseDmg = Math.round(18 * dmgMult);
        for (let i = -2; i <= 2; i++) {
          const ang = p.aimAngle + i * 0.14;
          this.spawnProjectile({
            ownerType: 'player',
            ownerId: p.id,
            style: 'arrow',
            damageCategory: 'physical',
            x: p.x + Math.cos(ang) * 16,
            y: p.y + Math.sin(ang) * 16,
            vx: Math.cos(ang) * 430,
            vy: Math.sin(ang) * 430,
            angle: ang,
            radius: 5,
            damage: baseDmg,
            pierce: 2,
            slowOnHit: true,
            ttlMs: 460,
          });
        }
      } else if (p.heroClass === 'arcanist') {
        const voidMult = this.consumeVoidEnergyForTactical(p);
        const dmgMult = this.computeDamageMult(p, 'arcane');
        const baseDmg = Math.round(24 * dmgMult * voidMult);
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          const spawned = this.spawnProjectile({
            ownerType: 'player',
            ownerId: p.id,
            style: 'arcane',
            damageCategory: 'arcane',
            x: p.x + Math.cos(ang) * 14,
            y: p.y + Math.sin(ang) * 14,
            vx: Math.cos(ang) * 340,
            vy: Math.sin(ang) * 340,
            angle: ang,
            radius: 7,
            damage: baseDmg,
            pierce: 2,
            ttlMs: 450,
          });
          this.tacticalProjIds.add(spawned.id);
        }
      } else if (p.heroClass === 'cleric') {
        if (isSeraphimTactical) {
          const serCfg = ARMAMENT_TUNING.weapons.seraphim;
          const targetPos = computeGroundTargetPosition(
            p.x,
            p.y,
            p.aimAngle,
            resolvedTacticalDist,
            tacticalSpec
          );
          const dmgMult = this.computeDamageMult(p, 'divine');
          const critChance = this.getPlayerCritChance(p);
          const hasCrit = Math.random() < critChance;
          const critMult = hasCrit ? CRIT_DAMAGE_MULTIPLIER : 1.0;
          const burstDmg = Math.max(1, Math.round(serCfg.tacticalBaseDamage * dmgMult * critMult));
          const burstRadius = serCfg.tacticalRadiusPx;

          this.zones.push({
            id: this.nextId('zone'),
            kind: 'seraphim_holy_burst',
            x: targetPos.x,
            y: targetPos.y,
            radius: burstRadius,
            ttlMs: serCfg.holyBurstZoneTtlMs,
            maxTtlMs: serCfg.holyBurstZoneTtlMs,
            ownerId: p.id,
          });

          const burstTargets = [...this.enemies];
          for (const enemy of burstTargets) {
            if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
            if (Math.hypot(enemy.x - targetPos.x, enemy.y - targetPos.y) <= burstRadius + enemy.radius * 0.35) {
              this.damageEnemy(enemy, burstDmg, p, hasCrit, 'divine');
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - targetPos.x, dummy.y - targetPos.y) <= burstRadius + 18) {
              this.damageDummy(dummy, burstDmg, p, hasCrit, false, 'divine');
            }
          }
          this.emitEvent('status', targetPos.x, targetPos.y - 24, 'SERAPHIC JUDGMENT!', '#FDE047');
        } else {
          const dmgMult = this.computeDamageMult(p, 'divine');
          const baseHeal = 24;
          for (const ally of this.players.values()) {
            if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 210) {
              const heal = GameRoom.computeHealingAmount(baseHeal, p, ally.state);
              this.applyEffectiveHealing(p, ally.state, heal, 'tactical');
            }
          }
          const smiteTargets = [...this.enemies];
          for (const enemy of smiteTargets) {
            if (enemy && enemy.hp > 0 && this.enemies.includes(enemy) && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 135) {
              this.damageEnemy(enemy, Math.round(28 * dmgMult), p, false, 'divine');
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 135) {
              this.damageDummy(dummy, Math.round(28 * dmgMult), p, false, false, 'divine');
            }
          }
        }
      }
      return {};
    }

    if (action === 'ult') {
      if (isSilenced) {
        this.emitEvent('status', p.x, p.y - 24, '[SILENCED]', '#C084FC');
        return {};
      }
      if (p.ultCooldownMs > 0 && !p.noCooldownMode) return {};

      let resolvedUltDist = options?.aimDistance;
      if (!options?.explicitAim) {
        const ultSpec = getAbilityTargetSpec(p.heroClass, 'ult');
        const smart = resolveSkillSmartTarget({
          spec: ultSpec,
          playerX: p.x,
          playerY: p.y,
          fallbackAngle: p.aimAngle,
          fallbackDistance: options?.aimDistance,
          preferCursorCone: false,
          map: this.map,
          props: this.props,
          enemies: this.enemies,
          trainingDummies: this.trainingDummies,
        });
        if (smart.target) {
          p.aimAngle = smart.aimAngle;
          if (resolvedUltDist === undefined) {
            resolvedUltDist = smart.aimDistance;
          }
        }
      }

      p.ultCooldownMs = p.noCooldownMode ? 0 : Math.round(def.ultCooldownMs * cdrMult);
      p.maxUltCooldownMs = p.ultCooldownMs;
      p.attackAnimMs = 280;

      if (p.heroClass === 'vanguard') {
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'aegis_dome',
          x: p.x,
          y: p.y,
          radius: 105,
          ttlMs: 5500,
          maxTtlMs: 5500,
          ownerId: p.id,
        });
        this.emitEvent('status', p.x, p.y - 26, 'Aegis Ward Active', '#93C5FD');
      } else if (p.heroClass === 'ranger') {
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 340) {
            enemy.markedMs = 6500;
          }
        }
        for (const ally of this.players.values()) {
          ally.state.hasteMs = 5000;
        }
        this.emitEvent('status', p.x, p.y - 26, 'Hunter Quarry Marked', '#FBBF24');
      } else if (p.heroClass === 'arcanist') {
        const ultSpec = getAbilityTargetSpec('arcanist', 'ult');
        const targetPos = computeGroundTargetPosition(
          p.x,
          p.y,
          p.aimAngle,
          resolvedUltDist,
          ultSpec
        );
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'chrono_well',
          x: targetPos.x,
          y: targetPos.y,
          radius: 115,
          ttlMs: 3000,
          maxTtlMs: 3000,
          ownerId: p.id,
        });
        this.refreshChronoSuspensionState();
        this.emitEvent('status', targetPos.x, targetPos.y - 20, 'Chrono Well', '#7CC6FE');
      } else if (p.heroClass === 'cleric') {
        const ultSpec = getAbilityTargetSpec('cleric', 'ult');
        const targetPos = computeGroundTargetPosition(
          p.x,
          p.y,
          p.aimAngle,
          resolvedUltDist,
          ultSpec
        );
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'solar_beacon',
          x: targetPos.x,
          y: targetPos.y,
          radius: 115,
          ttlMs: 5000,
          maxTtlMs: 5000,
          ownerId: p.id,
        });
        this.emitEvent('status', targetPos.x, targetPos.y - 26, 'Solar Beacon', '#FDE68A');
      }
      return {};
    }

    return {};
  }

  public computeDamageMult(
    p: PlayerState,
    category: DamageCategory = 'physical',
    options?: { isPrimaryAttack?: boolean; weaponDef?: WeaponDef | null }
  ): number {
    const lvl = Math.max(1, Math.min(MAX_LEVEL, p.level || 1));
    let mult = 1 + (lvl - 1) * 0.025;
    const weaponDef =
      options?.weaponDef !== undefined
        ? options.weaponDef
        : resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
    const weaponMods = weaponDef?.modifiers;

    if (category === 'physical') {
      if (p.heroClass === 'ranger') {
        if (options?.isPrimaryAttack && weaponMods?.usesIntScaling) {
          mult *= 1 + (p.intelligence || 0) * 0.008;
        } else {
          const dexFactor = weaponMods?.dexScalingMult ?? 1.0;
          mult *= 1 + (p.dexterity || 0) * 0.008 * dexFactor;
        }
      } else {
        mult *= 1 + (p.strength || 0) * 0.008;
      }
    } else if (category === 'arcane') {
      mult *= 1 + (p.intelligence || 0) * 0.008;
    } else if (category === 'divine') {
      mult *= 1 + (p.faith || 0) * 0.008;
    } else {
      const mainStat =
        p.heroClass === 'ranger'
          ? (options?.isPrimaryAttack && weaponMods?.usesIntScaling
              ? p.intelligence || 0
              : (p.dexterity || 0) * (weaponMods?.dexScalingMult ?? 1.0))
          : p.heroClass === 'arcanist'
            ? p.intelligence || 0
            : p.heroClass === 'cleric'
              ? p.faith || 0
              : p.strength || 0;
      mult *= 1 + mainStat * 0.008;
    }
    if (p.relics.includes('sunfire_signet')) mult *= 1.12;
    const furyStacks = this.getBlessingStacks(p, 'fury');
    if (furyStacks > 0) mult *= 1 + furyStacks * 0.06;
    const weaponDmgMult = weaponMods?.damageMult ?? 1.0;
    mult *= weaponDmgMult;
    if (this.getActivePassive(p) === 'heat' && (p.vanguardHeat || 0) > 0) {
      const heatCfg = ARMAMENT_TUNING.passives.heat;
      mult *= 1 + (Math.min(heatCfg.cap, p.vanguardHeat || 0) / heatCfg.cap) * heatCfg.maxDamageBonusPct;
    }
    return mult;
  }

  public tick(dtMs: number): void {
    if (this.status !== 'playing' || this.players.size === 0) return;

    this.simTimeMs += dtMs;
    const dtSec = dtMs / 1000;
    this.zoneTickAccumMs += dtMs;
    const pulseZonesNow = this.zoneTickAccumMs >= 500;
    if (pulseZonesNow) {
      this.zoneTickAccumMs = 0;
      if (this.zoneHitPlayers.size > 0) {
        for (const zid of this.zoneHitPlayers.keys()) {
          if (!this.zones.some((z) => z.id === zid)) {
            this.zoneHitPlayers.delete(zid);
          }
        }
      }
    }

    this.statusDotAccumMs += dtMs;
    const pulseDotNow = this.statusDotAccumMs >= 650;
    if (pulseDotNow) this.statusDotAccumMs = 0;

    for (const npc of this.npcs) {
      if (npc.speakingMs && npc.speakingMs > 0) {
        npc.speakingMs = Math.max(0, npc.speakingMs - dtMs);
      }
    }

    for (const dummy of this.trainingDummies) {
      if (dummy.hitAnimMs > 0) {
        dummy.hitAnimMs = Math.max(0, dummy.hitAnimMs - dtMs);
      }
      if (dummy.hp < dummy.maxHp) {
        dummy.hp = Math.min(dummy.maxHp, dummy.hp + Math.round(500 * dtSec));
      }
      if (dummy.lastHitTimerMs && dummy.lastHitTimerMs > 0) {
        dummy.lastHitTimerMs = Math.max(0, dummy.lastHitTimerMs - dtMs);
        if (dummy.lastHitTimerMs === 0 && dummy.totalDamageTaken && dummy.totalDamageTaken > 0) {
          dummy.totalDamageTaken = 0;
          this.emitEvent('status', dummy.x, dummy.y - 44, ' Counter Reset', '#94A3B8');
        }
      }
    }

    // Advance Chrono Well zones first & recompute authoritative time suspension state
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.kind !== 'chrono_well') continue;
      const owner = this.players.get(z.ownerId);
      z.ttlMs -= dtMs;
      if (z.ttlMs <= 0 || !owner || !owner.state.connected) {
        this.zones.splice(i, 1);
      }
    }
    this.refreshChronoSuspensionState();

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      if (z.kind === 'chrono_well') {
        continue;
      }
      if ((z.chronoSuspendedMs || 0) > 0) {
        continue;
      }
      z.ttlMs -= dtMs;

      if (z.kind === 'chain_lightning_arc') {
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
        }
        continue;
      }

      if (z.kind === 'arcane_meteor' && z.ttlMs <= 0) {
        const ownerPr = this.players.get(z.ownerId);
        const attacker = ownerPr ? ownerPr.state : null;
        const meteorDmg = z.damage ?? 75;
        const meteorRadSq = z.radius * z.radius;
        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          if (eIdx >= this.enemies.length) continue;
          const enemy = this.enemies[eIdx];
          if (enemy && enemy.hp > 0) {
            const dx = enemy.x - z.x;
            const dy = enemy.y - z.y;
            if (dx * dx + dy * dy <= meteorRadSq) {
              const dealt = this.damageEnemy(enemy, meteorDmg, attacker, false, 'arcane');
              if (dealt > 0) this.onTacticalHitConfirmed(attacker);
            }
          }
        }
        for (const dummy of this.trainingDummies) {
          const dx = dummy.x - z.x;
          const dy = dummy.y - z.y;
          if (dx * dx + dy * dy <= meteorRadSq) {
            this.damageDummy(dummy, meteorDmg, attacker, false, false, 'arcane');
            this.onTacticalHitConfirmed(attacker);
          }
        }
        this.emitEvent('status', z.x, z.y - 20, 'METEOR IMPACT!', '#E879F9');
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'fireball_burn') {
        if (pulseZonesNow) {
          const ownerPr = this.players.get(z.ownerId);
          const attacker = ownerPr ? ownerPr.state : null;
          const burnDmg = z.damage ?? 9;
          for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
            if (eIdx >= this.enemies.length) continue;
            const enemy = this.enemies[eIdx];
            if (enemy && enemy.hp > 0) {
              const dx = enemy.x - z.x;
              const dy = enemy.y - z.y;
              const hitR = z.radius + enemy.radius * 0.35;
              if (dx * dx + dy * dy <= hitR * hitR) {
                this.damageEnemy(enemy, burnDmg, attacker, false, 'fire');
              }
            }
          }
          const dummyHitR = z.radius + 18;
          const dummyHitRSq = dummyHitR * dummyHitR;
          for (const dummy of this.trainingDummies) {
            const dx = dummy.x - z.x;
            const dy = dummy.y - z.y;
            if (dx * dx + dy * dy <= dummyHitRSq) {
              this.damageDummy(dummy, burnDmg, attacker, false, false, 'fire');
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
        }
        continue;
      }

      if (z.kind === 'sound_lane' && z.ttlMs <= 0) {
        const w = z.width || 320;
        const h = z.height || 40;
        const ang = z.angle || 0;
        const cosA = Math.cos(-ang);
        const sinA = Math.sin(-ang);
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
              this.damagePlayer(pr.state, 26 + this.floor * 4, 'divine');
              this.emitEvent('status', pr.state.x, pr.state.y - 14, ' RESONANT WAVE!', '#F59E0B');
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'lament_mark' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, 'divine');
            this.applyPlayerStatus(pr.state, 'charmed', 3000);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'ashen_cloud') {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            pr.state.hasteMs = Math.min(pr.state.hasteMs, 0);
            this.applyPlayerStatus(pr.state, 'ashen_curse', 1500);
            if (pulseZonesNow) {
              this.damagePlayer(pr.state, 12 + this.floor * 2, 'elemental');
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
      }

      if (z.kind === 'censer_sweep' && z.ttlMs <= 0) {
        const ang = z.angle || 0;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (dist <= z.radius) {
              const pAng = Math.atan2(pr.state.y - z.y, pr.state.x - z.x);
              let diff = pAng - ang;
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              // Safe wedge is behind (diff close to PI or outside 270 deg arc)
              if (Math.abs(diff) <= (Math.PI * 3) / 4) {
                this.damagePlayer(pr.state, 34 + this.floor * 4, 'physical');
                this.emitEvent('status', pr.state.x, pr.state.y - 14, ' CENSER SWEEP!', '#F59E0B');
              }
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'scripture_line' && z.ttlMs <= 0) {
        const w = z.width || 400;
        const h = z.height || 24;
        const ang = z.angle || 0;
        const cosA = Math.cos(-ang);
        const sinA = Math.sin(-ang);
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            if (Math.abs(localX) <= w / 2 && Math.abs(localY) <= h / 2) {
              this.damagePlayer(pr.state, 30 + this.floor * 4, 'arcane');
              this.emitEvent('status', pr.state.x, pr.state.y - 14, ' SCRIPTURE BINDING!', '#E879F9');
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'silence_seal' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, 'arcane');
            this.applyPlayerStatus(pr.state, 'silenced', 4500);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'lance_thrust' && z.ttlMs <= 0) {
        const w = z.width || 360;
        const h = z.height || 40;
        const ang = z.angle || 0;
        const cosA = Math.cos(-ang);
        const sinA = Math.sin(-ang);
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const localX = dx * cosA - dy * sinA;
            const localY = dx * sinA + dy * cosA;
            if (localX >= 0 && localX <= w && Math.abs(localY) <= h / 2) {
              this.damagePlayer(pr.state, 36 + this.floor * 4, 'divine');
              this.applyPlayerStatus(pr.state, 'impaled', 4000);
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'lancefall_mark' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 32 + this.floor * 4, 'divine');
            this.applyPlayerStatus(pr.state, 'impaled', 4000);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'warden_edict' && z.ttlMs <= 0) {
        const q = z.quadrant ?? 0;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = pr.state.x - z.x;
            const dy = pr.state.y - z.y;
            const dist = Math.hypot(dx, dy);
            if (dist <= z.radius) {
              let pAng = Math.atan2(dy, dx);
              if (pAng < 0) pAng += Math.PI * 2;
              const pQuad = Math.floor(pAng / (Math.PI / 2)) % 4;
              if (pQuad === q) {
                this.damagePlayer(pr.state, 40 + this.floor * 5, 'physical');
                this.applyPlayerStatus(pr.state, 'condemned', 5000);
              }
            }
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'warden_parry') {
        const owner = this.enemies.find((e) => e.id === z.ownerId && e.hp > 0);
        if (!owner || owner.stunnedMs > 0 || owner.frozenMs > 0 || z.ttlMs <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
        z.x = owner.x;
        z.y = owner.y;
      }

      if (z.kind === 'verdict_combo' && z.ttlMs <= 0) {
        const stage = z.stage || 1;
        const dmg = 30 + stage * 6 + this.floor * 4;
        for (const pr of this.players.values()) {
          if (pr.state.downed) continue;
          if (Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, dmg, 'physical');
            this.applyPlayerStatus(pr.state, 'condemned', 4500);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'frost_nova' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 24 + this.floor * 4, 'elemental');
            this.applyPlayerStatus(pr.state, 'frostbite', 4500);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'magma_pillar' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, 'elemental');
            this.applyPlayerStatus(pr.state, 'scorched', 5000);
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'singularity') {
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = z.x - pr.state.x;
            const dy = z.y - pr.state.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 6 && dist <= z.radius + 70) {
              const pullSpd = 140 * (1 - dist / (z.radius + 70));
              pr.state.x += (dx / dist) * pullSpd * dtSec;
              pr.state.y += (dy / dist) * pullSpd * dtSec;
            }
          }
        }
        if (z.ttlMs <= 0) {
          for (const pr of this.players.values()) {
            if (
              !pr.state.downed &&
              Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
            ) {
              this.damagePlayer(pr.state, 32 + this.floor * 4, 'elemental');
              this.applyPlayerStatus(pr.state, 'voidmarked', 4000);
            }
          }
          this.zones.splice(i, 1);
          continue;
        }
      }

      if (z.kind === 'supernova') {
        const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
        const currentRadius = z.radius * progress;
        let hitSet = this.zoneHitPlayers.get(z.id);
        if (!hitSet) {
          hitSet = new Set<string>();
          this.zoneHitPlayers.set(z.id, hitSet);
        }
        for (const pr of this.players.values()) {
          if (!pr.state.downed && !hitSet.has(pr.state.id)) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (Math.abs(dist - currentRadius) <= 18) {
              hitSet.add(pr.state.id);
              this.damagePlayer(pr.state, 26 + this.floor * 4, 'elemental');
              this.applyPlayerStatus(pr.state, 'disoriented', 3000);
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zoneHitPlayers.delete(z.id);
          this.zones.splice(i, 1);
          continue;
        }
      }

      if (z.kind === 'warden_shatter' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 36 + this.floor * 4, 'physical');
            this.emitEvent('status', pr.state.x, pr.state.y - 14, ' BASTION SHATTER!', '#FBBF24');
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'starlight_beam' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 30 + this.floor * 4, 'elemental');
            this.emitEvent('status', pr.state.x, pr.state.y - 14, ' STARBEAM!', '#38BDF8');
          }
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.kind === 'boss_slam' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 30 + this.floor * 6, 'physical');
            if (this.floor === 1) {
              this.applyPlayerStatus(pr.state, 'guard_broken', 4000);
            } else {
              this.applyStatusEffect(pr.state, 'stun', 1200);
            }
          }
        }
        // Spawn 4 outward shockwave debris orbs
        const isEmber = this.map.biome === 'ember' || this.floor === 3;
        const isCatacombs = this.map.biome === 'catacombs' || this.floor === 2;
        const isVoid = this.map.biome === 'void' || this.floor === 4;
        const isAstral = this.map.biome === 'astral' || this.floor === 5;
        const slamStyle = isEmber
          ? 'fireball'
          : isVoid
            ? 'voidorb'
            : isAstral
              ? 'arcane'
              : isCatacombs
                ? 'voidorb'
                : 'bone';
        for (let k = 0; k < 4; k++) {
          const a = (k * Math.PI) / 2 + Math.PI / 4;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: z.ownerId,
            style: slamStyle,
            x: z.x,
            y: z.y,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            angle: a,
            radius: 7,
            damage: 16 + this.floor * 3,
            pierce: 1,
            ttlMs: 1400,
          });
        }
        this.zones.splice(i, 1);
        continue;
      }

      if (z.ttlMs <= 0) {
        this.zones.splice(i, 1);
        continue;
      }

      if (pulseZonesNow) {
        if (z.kind === 'solar_beacon') {
          const ownerPr = this.players.get(z.ownerId);
          const ownerState = ownerPr ? ownerPr.state : null;
          for (const pr of this.players.values()) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (dist <= z.radius) {
              if (pr.state.downed) {
                pr.state.reviveProgress = Math.min(1, pr.state.reviveProgress + 0.38);
                if (pr.state.reviveProgress >= 1) {
                  this.completeRevive(pr.state, z.ownerId);
                }
              } else if (pr.state.hp < pr.state.maxHp) {
                const beaconHeal = this.computeHealingAmount(4, ownerState, pr.state);
                this.applyEffectiveHealing(ownerState, pr.state, beaconHeal, 'ult');
              }
            }
          }
        } else if (z.kind === 'star_rift') {
          const ownerPr = this.players.get(z.ownerId);
          const starRiftBonus = ownerPr
            ? resolveEquippedWeaponForClass(ownerPr.state.heroClass, ownerPr.state.equippedWeapon)
                ?.modifiers.starRiftBonusDamagePct || 0
            : 0;
          const riftDmg = Math.round((14 + this.floor * 2) * (1 + starRiftBonus));
          for (const enemy of this.enemies) {
            if (enemy.hp > 0 && Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius) {
              const pullAngle = Math.atan2(z.y - enemy.y, z.x - enemy.x);
              enemy.x += Math.cos(pullAngle) * 5;
              enemy.y += Math.sin(pullAngle) * 5;
              this.damageEnemy(enemy, riftDmg, ownerPr ? ownerPr.state : null, false, 'arcane');
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius) {
              this.damageDummy(dummy, riftDmg, ownerPr ? ownerPr.state : null, false, false, 'arcane');
            }
          }
        }
      }
    }

    // Process Player Status Effects (paused while suspended inside an ally Chrono Well)
    for (const pr of this.players.values()) {
      if ((pr.state.chronoSuspendedMs || 0) > 0) continue;
      this.updatePlayerStatuses(pr.state, dtMs, pulseDotNow);
    }

    // Cleric Passive: Radiant Aura (only active when default Sunbrand Prelate Raiment passive is active)
    this.clericAuraAccumMs += dtMs;
    if (this.clericAuraAccumMs >= 2000) {
      this.clericAuraAccumMs = 0;
      for (const pr of this.players.values()) {
        const cleric = pr.state;
        if (
          this.getActivePassive(cleric) === 'radiant_aura' &&
          !cleric.downed &&
          cleric.connected
        ) {
          let anyMissingHp = false;
          const targetsInRange: PlayerState[] = [];
          for (const allyPr of this.players.values()) {
            const ally = allyPr.state;
            if (!ally.downed && ally.connected && Math.hypot(ally.x - cleric.x, ally.y - cleric.y) <= 140) {
              targetsInRange.push(ally);
              if (ally.hp < ally.maxHp) {
                anyMissingHp = true;
              }
            }
          }

          if (anyMissingHp) {
            this.emitEvent('cleric_pulse', cleric.x, cleric.y, 'Radiant Aura', '#22C55E');
            for (const ally of targetsInRange) {
              if (ally.hp < ally.maxHp) {
                const baseHeal = ally.hp < ally.maxHp * 0.5 ? 3 : 2;
                const healAmt = this.computeHealingAmount(baseHeal, cleric, ally);
                this.applyEffectiveHealing(cleric, ally, healAmt, 'aura');
              }
            }
          }
        }
      }
      this.triggerSharedGraceTick();
    }

    // Vitality + Vestment Passive Combat Regeneration (Every 2.0s pulse)
    if (this.clericAuraAccumMs === 0) {
      for (const pr of this.players.values()) {
        const p = pr.state;
        if (!p.downed && p.connected && p.hp < p.maxHp) {
          const vitRegen = (p.vitality || 0) >= 6 ? Math.max(1, Math.floor((p.vitality || 0) * 0.1)) : 0;
          const vestmentRegen =
            resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers
              .hpRegenPerTickBonus || 0;
          const regenAmt = vitRegen + vestmentRegen;
          if (regenAmt > 0) {
            p.hp = Math.min(p.maxHp, p.hp + regenAmt);
          }
        }
      }
    }

    for (const pr of this.players.values()) {
      const p = pr.state;
      if ((p.chronoSuspendedMs || 0) > 0) {
        if (p.disintegrationState?.active) {
          this.stopDisintegrationChannel(p.id);
          this.emitEvent('status', p.x, p.y - 24, 'TIME SUSPENDED!', '#38BDF8');
        }
        p.spellCastState = null;
        p.vx = 0;
        p.vy = 0;
        continue;
      }

      if (p.noCooldownMode) {
        pr.attackCooldownMs = 0;
        p.skillCooldownMs = 0;
        p.ultCooldownMs = 0;
        p.dashCooldownMs = 0;
      } else {
        pr.attackCooldownMs = Math.max(0, pr.attackCooldownMs - dtMs);
        p.skillCooldownMs = Math.max(0, p.skillCooldownMs - dtMs);
        p.ultCooldownMs = Math.max(0, p.ultCooldownMs - dtMs);
        p.dashCooldownMs = Math.max(0, p.dashCooldownMs - dtMs);
      }
      if (p.starRiftCooldownMs && p.starRiftCooldownMs > 0) {
        p.starRiftCooldownMs = Math.max(0, p.starRiftCooldownMs - dtMs);
      }
      p.attackAnimMs = Math.max(0, p.attackAnimMs - dtMs);
      p.hasteMs = Math.max(0, p.hasteMs - dtMs);

      if (p.downed) {
        if (p.disintegrationState?.active) {
          this.stopDisintegrationChannel(p.id);
        }
        p.spellCastState = null;
        pr.pendingBarrage = null;
        this.clearEclipseCharge(pr);
        p.vx = 0;
        p.vy = 0;
        p.downedTimerMs = Math.max(0, p.downedTimerMs - dtMs);

        let reviver: PlayerState | null = null;
        for (const ally of this.players.values()) {
          if (
            ally.state.id !== p.id &&
            !ally.state.downed &&
            ally.state.connected &&
            Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 56
          ) {
            reviver = ally.state;
            break;
          }
        }
        if (reviver) {
          const reviverPassive = this.getActivePassive(reviver);
          const vestmentReviveBonus =
            resolveEquippedVestmentForClass(reviver.heroClass, reviver.equippedVestment)?.modifiers
              .reviveSpeedBonus || 0;
          const reviveSpeedMult = (reviverPassive === 'radiant_aura' ? 1.4 : 1.0) + vestmentReviveBonus;
          p.reviveProgress = Math.min(1, p.reviveProgress + (dtSec / 2.2) * reviveSpeedMult);
          if (p.reviveProgress >= 1) {
            this.completeRevive(p, reviver.id);
          }
        } else {
          p.reviveProgress = Math.max(0, p.reviveProgress - dtSec * 0.25);
        }
        continue;
      }

      const activePassive = this.getActivePassive(p);
      if (
        activePassive === 'heat' &&
        (p.vanguardHeat || 0) > 0 &&
        this.simTimeMs - pr.heatLastHitAtMs >= ARMAMENT_TUNING.passives.heat.resetGraceMs
      ) {
        p.vanguardHeat = 0;
      }
      if (activePassive === 'predators_instinct' && (p.predatorStacks || 0) > 0) {
        const targetAlive =
          Boolean(p.predatorTargetId) &&
          (this.enemies.some((e) => e.id === p.predatorTargetId && e.hp > 0) ||
            this.trainingDummies.some((d) => d.id === p.predatorTargetId));
        if (
          !targetAlive ||
          this.simTimeMs - pr.predatorLastHitAtMs >=
            ARMAMENT_TUNING.passives.predatorsInstinct.inactivityResetMs
        ) {
          p.predatorTargetId = null;
          p.predatorStacks = 0;
        }
      }

      if (pr.pendingBarrage) {
        if (p.heroClass !== 'arcanist' || p.equippedScrollId !== 'arcane_barrage') {
          pr.pendingBarrage = null;
        } else {
          pr.pendingBarrage.timerMs -= dtMs;
          while (pr.pendingBarrage && pr.pendingBarrage.timerMs <= 0 && pr.pendingBarrage.wavesRemaining > 0) {
            const b = pr.pendingBarrage;
            this.fireArcaneBarrageWave(p, b.aimAngle, b.waveIndex, b.targetEnemyId, b.empoweredMult);
            b.wavesRemaining -= 1;
            b.waveIndex += 1;
            if (b.wavesRemaining <= 0) {
              pr.pendingBarrage = null;
            } else {
              b.timerMs += b.waveIntervalMs;
            }
          }
        }
      }

      if (p.spellCastState) {
        if (this.isPlayerCcInterrupted(p)) {
          p.spellCastState = null;
        } else {
          p.spellCastState.remainingMs = Math.max(0, p.spellCastState.remainingMs - dtMs);
          if (p.spellCastState.remainingMs <= 0) {
            const cast = p.spellCastState;
            p.spellCastState = null;
            this.executeArcanistSpell(p, cast.spellId, cast.aimAngle, cast.targetX, cast.targetY);
          }
        }
      }

      if (p.disintegrationState?.active) {
        this.stepDisintegrationChannel(p, dtMs, dtSec);
      }

      const def = HERO_CLASSES[p.heroClass];
      const moveSpeed = computePlayerMoveSpeed(p);
      const isDisoriented = p.statuses.some((s) => s.type === 'disoriented');
      const { mx, my } = normalizePlayerInputDirection(pr.input, isDisoriented, Date.now());

      // Floor 6: Charmed - Irresistible siren pull toward the boss (even when idle)
      const charmed = p.statuses.find((s) => s.type === 'charmed');
      let charmVx = 0;
      let charmVy = 0;
      if (charmed) {
        const boss = this.enemies.find((e) => e.kind === 'boss');
        if (boss) {
          const dx = boss.x - p.x;
          const dy = boss.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 20) {
            charmVx = (dx / dist) * moveSpeed * 0.75;
            charmVy = (dy / dist) * moveSpeed * 0.75;
          }
        }
      }

      const prevX = p.x;
      const prevY = p.y;
      if (p.disintegrationState?.active) {
        // Movement is disabled while channeling Disintegration
        p.vx = 0;
        p.vy = 0;
      } else {
        if (mx !== 0 || my !== 0) {
          p.vx = mx * moveSpeed + charmVx;
          p.vy = my * moveSpeed + charmVy;
        } else {
          p.vx = charmVx;
          p.vy = charmVy;
        }

        if (p.vx !== 0 || p.vy !== 0) {
          this.moveWithCollision(p, p.vx * dtSec, p.vy * dtSec, 9);
        }
      }

      if (activePassive === 'momentum') {
        const mCfg = ARMAMENT_TUNING.passives.momentum;
        const movedDist = Math.hypot(p.x - prevX, p.y - prevY);
        const actualSpeed = dtSec > 0 ? movedDist / dtSec : 0;
        if (actualSpeed >= mCfg.minMoveSpeedPx && !p.disintegrationState?.active) {
          pr.momentumHoldMs = Math.min(mCfg.buildDurationMs, pr.momentumHoldMs + dtMs);
          p.rangerMomentum = Math.min(
            mCfg.cap,
            Math.round((pr.momentumHoldMs / mCfg.buildDurationMs) * mCfg.cap)
          );
        } else if (mCfg.resetOnStop) {
          pr.momentumHoldMs = 0;
          p.rangerMomentum = 0;
        }
      }

      const room = this.findRoomContaining(p.x, p.y);
      if (room) {
        room.discovered = true;
        if (!pr.enteredRooms.has(room.id)) {
          pr.enteredRooms.add(room.id);
          if (!room.cleared && p.relics.includes('runic_carapace')) {
            p.shield = Math.max(p.shield, 22);
          }
        }
        if (room.cleared) {
          for (const prp of this.props) {
            if (prp.roomId === room.id && prp.kind === 'totem' && prp.locked) {
              prp.locked = false;
              this.emitEvent('status', prp.x, prp.y - 22, 'TOTEM AWAKENED!', '#38BDF8');
              this.pushSystemChat(`Ancient Guardian Totem awakened in Chamber ${room.id}! Approach to claim your blessing.`);
            }
          }
        }
      }

      for (const prop of this.props) {
        if (prop.opened) continue;
        if (prop.kind === 'totem' && !prop.locked) {
          const dx = prop.x - p.x;
          const dy = prop.y - p.y;
          if (dx * dx + dy * dy <= 3136) { // 56^2
            prop.opened = true;
            const blessingOrder: FloorBlessingId[] = ['fury', 'swiftness', 'bastion', 'swiftness', 'fury'];
            const blessing = blessingOrder[((prop.roomId || 1) + this.floor + (prop.value || 1)) % blessingOrder.length];
            const blessingMeta = FLOOR_BLESSINGS[blessing];

            for (const ally of this.players.values()) {
              const st = ally.state;
              if (!st.floorBlessings) st.floorBlessings = [];
              st.floorBlessings.push(blessing);
              if (blessing === 'bastion') {
                const bastionCap = this.getMaxShieldCap(st);
                st.shield = Math.min(bastionCap, st.shield + 25);
              }
              if (!st.downed) {
                st.hp = Math.min(st.maxHp, st.hp + 20);
              }
              this.emitEvent('status', st.x, st.y - 34, `TOTEM: ${blessingMeta.name}!`, blessingMeta.color);
            }
            this.emitEvent('status', prop.x, prop.y - 28, `${blessingMeta.name} CLAIMED!`, blessingMeta.color);
            this.pushSystemChat(`Ancient Guardian Totem claimed! Entire party received ${blessingMeta.name} blessing.`);
          }
        } else if (prop.kind === 'coin') {
          const dx = prop.x - p.x;
          const dy = prop.y - p.y;
          if (dx * dx + dy * dy <= 1156) { // 34^2
            prop.opened = true;
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            this.emitEvent('gold', prop.x, prop.y - 10, `+${prop.value}g`, '#F4D378');
          }
        }
      }

      const activeWeaponDef = resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
      const isEclipseBow = Boolean(activeWeaponDef?.modifiers.chargeToFire);
      const isHardCc = (p.stunnedMs || 0) > 0 || (p.frozenMs || 0) > 0;
      const canActAttack =
        p.pendingRelicChoices.length === 0 &&
        (!p.pendingScrollChoices || p.pendingScrollChoices.length === 0) &&
        !p.disintegrationState?.active &&
        !p.spellCastState &&
        !isHardCc;

      if (!canActAttack) {
        if (pr.eclipseHoldActive || pr.pendingEclipseReleaseMs !== null || (p.eclipseChargeRatio || 0) > 0) {
          this.clearEclipseCharge(pr);
        }
      } else if (isEclipseBow) {
        if (
          pr.input.attack &&
          !pr.eclipseHoldActive &&
          pr.pendingEclipseReleaseMs === null &&
          (pr.attackCooldownMs <= 0 || p.noCooldownMode)
        ) {
          pr.eclipseHoldActive = true;
          pr.eclipseHoldStartMs = this.simTimeMs;
        }
        if (pr.eclipseHoldActive) {
          if (!pr.input.attack && pr.pendingEclipseReleaseMs === null) {
            pr.pendingEclipseReleaseMs = Math.max(0, this.simTimeMs - pr.eclipseHoldStartMs);
            pr.eclipseHoldActive = false;
            pr.eclipseHoldStartMs = 0;
          } else {
            const heldMs = Math.max(0, this.simTimeMs - pr.eclipseHoldStartMs);
            p.eclipseChargeRatio = Math.max(
              0,
              Math.min(1, heldMs / ARMAMENT_TUNING.weapons.eclipse.maxChargeMs)
            );
          }
        }
        if (pr.pendingEclipseReleaseMs !== null && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
          const releaseHoldMs = pr.pendingEclipseReleaseMs;
          this.clearEclipseCharge(pr);
          const atkSpeedMult = this.getPlayerAttackSpeedMult(p);
          let hasteFactor = (p.hasteMs > 0 ? 0.8 : 1) / atkSpeedMult;
          if (p.statuses.some((s) => s.type === 'frostbite')) {
            hasteFactor *= 1.25;
          }
          pr.attackCooldownMs = p.noCooldownMode
            ? 0
            : Math.max(100, Math.round(def.attackCooldownMs * hasteFactor));
          p.attackAnimMs = 190;
          this.fireEclipseChargedShot(p, releaseHoldMs);
        }
      } else {
        if (pr.eclipseHoldActive || pr.pendingEclipseReleaseMs !== null || (p.eclipseChargeRatio || 0) > 0) {
          this.clearEclipseCharge(pr);
        }
        if (pr.input.attack && (pr.attackCooldownMs <= 0 || p.noCooldownMode)) {
          const atkSpeedMult = this.getPlayerAttackSpeedMult(p);
          let hasteFactor = (p.hasteMs > 0 ? 0.8 : 1) / atkSpeedMult;
          if (p.statuses.some((s) => s.type === 'frostbite')) {
            hasteFactor *= 1.25; // 25% attack delay penalty
          }
          pr.attackCooldownMs = p.noCooldownMode
            ? 0
            : Math.max(100, Math.round(def.attackCooldownMs * hasteFactor));
          p.attackAnimMs = 190;
          this.firePrimaryAttack(p);
        }
      }
    }

    const connectedPlayers = Array.from(this.players.values()).filter(
      (r) => r.state.connected
    );
    if (connectedPlayers.length > 0) {
      const anyAlive = connectedPlayers.some(
        (r) => !r.state.downed || (connectedPlayers.length > 1 && r.state.downedTimerMs > 0 && connectedPlayers.some((other) => !other.state.downed))
      );
      if (!anyAlive) {
        this.status = 'defeat';
        this.endedAt = Date.now();
        if (this.roomId !== 'TAVERN-HUB' && !this.isPlayerConnected(this.hostId)) {
          this.transferHostToConnectedMember();
        }
        this.pushSystemChat(`The expedition has fallen on Floor ${this.floor}.`);
        return;
      }
    }

    // Precompute active alive players and their room IDs once per tick for O(E + P) AI targeting
    const alivePlayersWithRoom: Array<{ state: PlayerState; roomId: number | undefined }> = [];
    for (let pIdx = 0; pIdx < connectedPlayers.length; pIdx++) {
      const st = connectedPlayers[pIdx].state;
      if (!st.downed) {
        const pRoom = this.findRoomContaining(st.x, st.y);
        alivePlayersWithRoom.push({ state: st, roomId: pRoom?.id });
      }
    }


    for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
      const enemy = this.enemies[eIdx];
      if ((enemy.chronoSuspendedMs || 0) > 0) {
        // Authoritative Chrono Well suspension preserves enemy execution state & timers verbatim
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }
      enemy.markedMs = Math.max(0, enemy.markedMs - dtMs);
      enemy.slowedMs = Math.max(0, enemy.slowedMs - dtMs);
      enemy.stunnedMs = Math.max(0, enemy.stunnedMs - dtMs);
      enemy.burnedMs = Math.max(0, enemy.burnedMs - dtMs);
      enemy.frozenMs = Math.max(0, enemy.frozenMs - dtMs);
      enemy.shockedMs = Math.max(0, enemy.shockedMs - dtMs);
      enemy.poisonedMs = Math.max(0, enemy.poisonedMs - dtMs);
      enemy.bleedingMs = Math.max(0, enemy.bleedingMs - dtMs);
      enemy.silencedMs = Math.max(0, (enemy.silencedMs || 0) - dtMs);
      enemy.shieldWallMs = Math.max(0, (enemy.shieldWallMs || 0) - dtMs);

      const meta = this.getEnemyMeta(enemy);

      // Periodic Status Damage (DoTs) with Hybrid Scaling, Snapshots, Attribution, and Resistances
      if (pulseDotNow && enemy.hp > 0) {
        let enemyDied = false;

        if (enemy.burnedMs > 0) {
          const ownerId = meta.burnOwnerId ?? (enemy as unknown as { burnInflicterId?: string | null }).burnInflicterId ?? null;
          const ownerState = ownerId ? (this.players.get(ownerId)?.state ?? null) : null;
          const mult = meta.burnMultiplier ?? GameRoom.computeDotMultiplier(ownerState);
          const rawBurn = meta.burnBaseTick ?? (7 + this.floor) * mult;
          enemyDied = this.applyDotDamageTick(enemy, 'burn', rawBurn, ownerId, getDamageTypeColor('fire', false));
        }

        if (!enemyDied && enemy.poisonedMs > 0) {
          const ownerId = meta.poisonOwnerId ?? null;
          const ownerState = ownerId ? (this.players.get(ownerId)?.state ?? null) : null;
          const mult = meta.poisonMultiplier ?? GameRoom.computeDotMultiplier(ownerState);
          const rawPoison = meta.poisonBaseTick ?? (5 + this.floor) * mult;
          enemyDied = this.applyDotDamageTick(enemy, 'poison', rawPoison, ownerId, getDamageTypeColor('poison', false));
        }

        if (!enemyDied && enemy.bleedingMs > 0) {
          const ownerId = meta.bleedOwnerId ?? null;
          const ownerState = ownerId ? (this.players.get(ownerId)?.state ?? null) : null;
          const mult = meta.bleedMultiplier ?? GameRoom.computeDotMultiplier(ownerState);
          const moving = Math.hypot(enemy.vx, enemy.vy) > 8;
          const baseBleed = (moving ? 14 : 7) + this.floor;
          const rawBleed = baseBleed * mult;
          enemyDied = this.applyDotDamageTick(enemy, 'bleed', rawBleed, ownerId, getDamageTypeColor('bleed', false));
        }

        if (enemyDied) {
          continue;
        }
      }

      // Clean expired DoT snapshots once timers lapse
      if (enemy.burnedMs <= 0 && meta.burnOwnerId !== null) {
        meta.burnOwnerId = null;
        meta.burnMultiplier = null;
        meta.burnBaseTick = null;
      }
      if (enemy.poisonedMs <= 0 && meta.poisonOwnerId !== null) {
        meta.poisonOwnerId = null;
        meta.poisonMultiplier = null;
        meta.poisonBaseTick = null;
      }
      if (enemy.bleedingMs <= 0 && meta.bleedOwnerId !== null) {
        meta.bleedOwnerId = null;
        meta.bleedMultiplier = null;
      }

      if (enemy.stunnedMs > 0 || enemy.frozenMs > 0) {
        if (enemy.charging || (enemy.chargeWindupMs || 0) > 0 || enemy.chargeAngle !== undefined) {
          this.clearEnemyChargeState(enemy);
        }
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }

      let nearest: PlayerState | null = null;
      let nearestDist = Infinity;
      let enemyRoom: ReturnType<GameRoom['findRoomContaining']> = undefined;
      if (alivePlayersWithRoom.length > 0) {
        let nearestDistSq = Infinity;
        enemyRoom = this.findRoomContaining(enemy.x, enemy.y);
        const enemyRoomId = enemyRoom?.id;
        const isBoss = enemy.kind === 'boss';
        const isRanged =
          enemy.kind === 'skeleton' ||
          enemy.kind === 'cultist' ||
          enemy.kind === 'hymn_phantom' ||
          enemy.kind === 'veiled_heretic' ||
          enemy.kind === 'astral_sentinel';
        const isAlerted = enemy.markedMs > 0 || enemy.hp < enemy.maxHp;

        for (let pIdx = 0; pIdx < alivePlayersWithRoom.length; pIdx++) {
          const pInfo = alivePlayersWithRoom[pIdx];
          const pState = pInfo.state;
          const inSameRoom = enemyRoomId !== undefined && pInfo.roomId === enemyRoomId;

          let maxDetectDist = isBoss ? 380 : inSameRoom ? (isRanged ? 220 : 190) : (isRanged ? 175 : 145);
          if (isAlerted) maxDetectDist += 45;

          const dxP = pState.x - enemy.x;
          const dyP = pState.y - enemy.y;
          const distSq = dxP * dxP + dyP * dyP;

          // Skip if outside detection range or farther than current nearest
          if (distSq > maxDetectDist * maxDetectDist || distSq >= nearestDistSq) continue;

          // If not in the same room, line of sight is strictly required (cannot detect through solid walls)
          if (!inSameRoom && !isBoss && !isAlerted) {
            if (!this.hasLineOfSight(enemy.x, enemy.y, pState.x, pState.y)) {
              continue;
            }
          }

          nearestDistSq = distSq;
          nearest = pState;
        }
        if (nearest) {
          nearestDist = Math.sqrt(nearestDistSq);
        }
      }

      if (!nearest) {
        if (enemy.charging || (enemy.chargeWindupMs || 0) > 0 || enemy.chargeAngle !== undefined) {
          this.clearEnemyChargeState(enemy);
        }
        enemy.state = 'idle';
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }

      enemy.state = 'chase';
      const slowFactor = enemy.slowedMs > 0 ? 0.55 : 1.0;
      const dx = nearest.x - enemy.x;
      const dy = nearest.y - enemy.y;
      const directAngle = Math.atan2(dy, dx);
      const angle = directAngle;

      // Smart obstacle steering: If moving directly toward target hits a wall/corner,
      // steer 38° to the side so the enemy glides smoothly around doorframes & pillars
      let moveAngle = directAngle;
      const stepProbe = enemy.radius + 6;
      if (this.collidesCircle(enemy.x + Math.cos(directAngle) * stepProbe, enemy.y + Math.sin(directAngle) * stepProbe, enemy.radius - 2)) {
        const leftAng = directAngle + 0.65;
        const rightAng = directAngle - 0.65;
        const leftClear = !this.collidesCircle(enemy.x + Math.cos(leftAng) * stepProbe, enemy.y + Math.sin(leftAng) * stepProbe, enemy.radius - 2);
        const rightClear = !this.collidesCircle(enemy.x + Math.cos(rightAng) * stepProbe, enemy.y + Math.sin(rightAng) * stepProbe, enemy.radius - 2);
        if (leftClear && !rightClear) {
          moveAngle = leftAng;
        } else if (rightClear && !leftClear) {
          moveAngle = rightAng;
        } else if (leftClear && rightClear) {
          moveAngle = (enemy.id.charCodeAt(0) % 2 === 0) ? leftAng : rightAng;
        }
      }

      // Soft crowd separation: nudge away from other nearby enemies so they don't jam in doorways
      for (let oIdx = eIdx - 1; oIdx >= Math.max(0, eIdx - 6); oIdx--) {
        const other = this.enemies[oIdx];
        if (other.hp <= 0) continue;
        const edx = enemy.x - other.x;
        const edy = enemy.y - other.y;
        const minDist = enemy.radius + other.radius + 2;
        const distSq = edx * edx + edy * edy;
        if (distSq > 0 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const push = (minDist - dist) * 0.4;
          const nx = (edx / dist) * push;
          const ny = (edy / dist) * push;
          if (!this.collidesCircle(enemy.x + nx, enemy.y + ny, enemy.radius - 2)) {
            enemy.x += nx;
            enemy.y += ny;
          }
        }
      }

      enemy.windupMs -= dtMs;
      const moveStartX = enemy.x;
      const moveStartY = enemy.y;

      if (enemy.kind === 'slime' || enemy.kind === 'goblin' || enemy.kind === 'knight') {
        const baseSpd =
          enemy.kind === 'goblin' ? 128 : enemy.kind === 'knight' ? 96 : 86;
        const spd = baseSpd * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 22 && enemy.windupMs <= 0) {
          const baseHit = enemy.kind === 'knight' ? 19 : enemy.kind === 'goblin' ? 13 : 11;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy));
          enemy.windupMs = enemy.kind === 'goblin' ? 850 : 1100;
        }
      } else if (enemy.kind === 'shadow_stalker') {
        // Fast, elusive void ambusher that dashes toward players
        const spd = 138 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 24 && enemy.windupMs <= 0) {
          const baseHit = 22;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), 'physical');
          // Inflict brief slow on hit
          nearest.hasteMs = Math.min(nearest.hasteMs, 0);
          enemy.windupMs = 800;
        }
      } else if (enemy.kind === 'astral_sentinel') {
        // Heavy armored celestial construct that fires crystal starlight projectiles
        const spd = 72 * slowFactor;
        if (nearestDist < 140) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 240) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }

        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, '[SILENCED]', '#C084FC');
            enemy.windupMs = 1200;
          } else {
            // Double starlight arc volley
            for (let k = -0.18; k <= 0.18; k += 0.36) {
              const a = angle + k;
              this.spawnProjectile({
                ownerType: 'enemy',
                ownerId: enemy.id,
                style: 'arcane',
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 230,
                vy: Math.sin(a) * 230,
                angle: a,
                radius: 6,
                damage: 18 + this.floor * 2,
                pierce: 1,
                ttlMs: 2000,
              });
            }
            enemy.windupMs = 1850;
          }
        }
      } else if (enemy.kind === 'skeleton' || enemy.kind === 'cultist') {
        const spd = 82 * slowFactor;
        if (nearestDist < 120) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 215) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }

        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, '[SILENCED]', '#C084FC');
            enemy.windupMs = 1200;
          } else if (enemy.kind === 'skeleton') {
            this.spawnProjectile({
              ownerType: 'enemy',
              ownerId: enemy.id,
              style: 'bone',
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(angle) * 245,
              vy: Math.sin(angle) * 245,
              angle,
              radius: 5,
              damage: 13 + this.floor * 2,
              pierce: 1,
              ttlMs: 1700,
            });
            enemy.windupMs = 1550;
          } else {
            for (let k = -1; k <= 1; k++) {
              const a = angle + k * 0.25;
              this.spawnProjectile({
                ownerType: 'enemy',
                ownerId: enemy.id,
                style: 'voidorb',
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 195,
                vy: Math.sin(a) * 195,
                angle: a,
                radius: 6,
                damage: 14 + this.floor * 2,
                pierce: 1,
                ttlMs: 1900,
              });
            }
            enemy.windupMs = 2100;
          }
        }
      } else if (enemy.kind === 'hymn_phantom') {
        // Spectral choir entity: floats smoothly at mid-range, looses oscillating Choral Wail sound waves
        const spd = 92 * slowFactor;
        if (nearestDist < 130) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 220) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }

        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, '[SILENCED]', '#C084FC');
            enemy.windupMs = 1200;
          } else {
            for (let k = -1; k <= 1; k += 2) {
              const a = angle + k * 0.18;
              this.spawnProjectile({
                ownerType: 'enemy',
                ownerId: enemy.id,
                style: 'arcane',
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 220,
                vy: Math.sin(a) * 220,
                angle: a,
                radius: 6,
                damage: 18 + this.floor * 2,
                pierce: 1,
                ttlMs: 2000,
              });
            }
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, 'CHORAL WAIL', '#C084FC');
            enemy.windupMs = 1750;
          }
        }
      } else if (enemy.kind === 'relic_golem') {
        // Heavy ancient construct: relentless stomp, devastating seismic ground slam
        const spd = 74 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }
        if (nearestDist <= enemy.radius + 28 && enemy.windupMs <= 0) {
          const baseHit = 26;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), 'physical');
          this.emitEvent('status', nearest.x, nearest.y - 14, 'SEISMIC SLAM!', '#F59E0B');
          // Radial ground tremor sparks
          for (let k = 0; k < 6; k++) {
            const sa = (k * Math.PI * 2) / 6;
            this.spawnProjectile({
              ownerType: 'enemy',
              ownerId: enemy.id,
              style: 'slash',
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(sa) * 160,
              vy: Math.sin(sa) * 160,
              angle: sa,
              radius: 6,
              damage: 14 + this.floor,
              pierce: 1,
              ttlMs: 800,
            });
          }
          enemy.windupMs = 1800;
        }
      } else if (enemy.kind === 'veiled_heretic') {
        // Corrupted scripture priest: kites at range, casts 3-way corrupted scripture sigil fan
        const spd = 84 * slowFactor;
        if (nearestDist < 140) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 230) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (dtSec > 0) {
          const distMoved = Math.hypot(enemy.x - moveStartX, enemy.y - moveStartY);
          enemy.vx = distMoved > 0.05 ? (enemy.x - moveStartX) / dtSec : 0;
          enemy.vy = distMoved > 0.05 ? (enemy.y - moveStartY) / dtSec : 0;
        }

        if (enemy.windupMs <= 0) {
          if (enemy.silencedMs > 0) {
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, '[SILENCED]', '#C084FC');
            enemy.windupMs = 1200;
          } else {
            for (let k = -1; k <= 1; k++) {
              const a = angle + k * 0.22;
              this.spawnProjectile({
                ownerType: 'enemy',
                ownerId: enemy.id,
                style: 'voidorb',
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 215,
                vy: Math.sin(a) * 215,
                angle: a,
                radius: 7,
                damage: 19 + this.floor * 2,
                pierce: 1,
                ttlMs: 1900,
              });
            }
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, 'CORRUPTED SCRIPTURE', '#A855F7');
            enemy.windupMs = 1950;
          }
        }
      } else if (enemy.kind === 'celestial_arbiter') {
        // Swift radiant judge: rushes forward, performs solar judgement thrust & holy starlight rays
        const spd = 112 * slowFactor;
        if (nearestDist > enemy.radius + 16) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }

        if (enemy.windupMs <= 0) {
          if (nearestDist <= enemy.radius + 24) {
            // Melee Judgement Cleave
            const baseHit = 24;
            this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), 'divine');
            this.emitEvent('status', nearest.x, nearest.y - 14, 'JUDGEMENT!', '#FDE047');
            enemy.windupMs = 1100;
          } else if (nearestDist <= 220) {
            if (enemy.silencedMs > 0) {
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, '[SILENCED]', '#C084FC');
              enemy.windupMs = 1200;
            } else {
              // Radiant Solar Starlight Ray
              this.spawnProjectile({
                ownerType: 'enemy',
                ownerId: enemy.id,
                style: 'radiant',
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(angle) * 310,
                vy: Math.sin(angle) * 310,
                angle,
                radius: 8,
                damage: 22 + this.floor * 2,
                pierce: 1,
                ttlMs: 1600,
              });
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 12, 'SOLAR THRUST', '#FBBF24');
              enemy.windupMs = 1400;
            }
          }
        }
      } else if (enemy.kind === 'warden_enforcer') {
        // Heavy bastion sentinel: advances with raised buckler, swings two-handed halberd cleave
        const spd = 94 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
        }

        if (nearestDist <= enemy.radius + 26 && enemy.windupMs <= 0) {
          const baseHit = 25;
          this.damagePlayer(nearest, this.computeEnemyDamage(baseHit, enemy), 'physical');
          this.emitEvent('status', nearest.x, nearest.y - 14, 'HALBERD CLEAVE!', '#38BDF8');
          // Brief buckler defense stance
          enemy.shieldWallMs = 1200;
          // Dual arc slash projectiles
          for (let off = -0.22; off <= 0.22; off += 0.44) {
            const a = angle + off;
            this.spawnProjectile({
              ownerType: 'enemy',
              ownerId: enemy.id,
              style: 'slash',
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(a) * 230,
              vy: Math.sin(a) * 230,
              angle: a,
              radius: 8,
              damage: 18 + this.floor * 2,
              pierce: 1,
              ttlMs: 1200,
            });
          }
          enemy.windupMs = 1500;
        }
      } else if (enemy.kind === 'boss') {
        this.updateBossAi(enemy, enemyRoom, nearest, dtMs, dtSec, slowFactor);
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if ((proj.chronoSuspendedMs || 0) > 0) {
        if (proj.style === 'arcane_orb') {
          const orbMap = this.arcaneOrbHits.get(proj.id);
          if (orbMap) {
            for (const entry of orbMap.values()) {
              entry.lastHitAtMs += dtMs;
            }
          }
        }
        continue;
      }

      proj.ttlMs -= dtMs;
      if (proj.ttlMs <= 0) {
        if (proj.spellId === 'fireball') {
          this.explodeFireball(proj);
        }
        this.cleanupProjectileTracking(proj.id);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Chronostar Scepter Seeking Star-Orb: dynamic mid-flight target acquisition within 170px
      if (
        proj.ownerType === 'player' &&
        proj.weaponId === 'arcanist_chronostar_scepter' &&
        !proj.targetEnemyId
      ) {
        const seekRange = 170;
        let bestSeekDist = seekRange;
        let bestSeekId: string | undefined;
        for (const e of this.enemies) {
          if (e.hp <= 0) continue;
          if (proj.hitEntityIds?.includes(e.id)) continue;
          const d = Math.hypot(e.x - proj.x, e.y - proj.y);
          if (d <= bestSeekDist) {
            bestSeekDist = d;
            bestSeekId = e.id;
          }
        }
        if (!bestSeekId) {
          for (const dummy of this.trainingDummies) {
            if (proj.hitEntityIds?.includes(dummy.id)) continue;
            const d = Math.hypot(dummy.x - proj.x, dummy.y - proj.y);
            if (d <= bestSeekDist) {
              bestSeekDist = d;
              bestSeekId = dummy.id;
            }
          }
        }
        if (bestSeekId) {
          proj.targetEnemyId = bestSeekId;
        }
      }

      // Homing guidance for player projectiles towards target enemy or training dummy
      if (proj.ownerType === 'player' && proj.targetEnemyId) {
        let target: { x: number; y: number } | undefined = this.enemies.find(
          (e) => e.id === proj.targetEnemyId && e.hp > 0
        );
        if (!target) {
          target = this.trainingDummies.find((d) => d.id === proj.targetEnemyId);
        }
        if (target && !proj.hitEntityIds?.includes(proj.targetEnemyId)) {
          const tdx = target.x - proj.x;
          const tdy = target.y - proj.y;
          const dist = Math.hypot(tdx, tdy);
          if (dist > 4 && dist < 380) {
            const desiredAngle = Math.atan2(tdy, tdx);
            const currentSpeed = Math.hypot(proj.vx, proj.vy);
            const curAngle = Math.atan2(proj.vy, proj.vx);
            const diff = Math.atan2(Math.sin(desiredAngle - curAngle), Math.cos(desiredAngle - curAngle));
            const steer = proj.weaponId === 'arcanist_chronostar_scepter' ? 0.34 : 0.22;
            const newAngle = curAngle + diff * steer;
            proj.vx = Math.cos(newAngle) * currentSpeed;
            proj.vy = Math.sin(newAngle) * currentSpeed;
            proj.angle = newAngle;
          }
        }
      }

      if (proj.style === 'arcane_barrage') {
        proj.elapsedMs = (proj.elapsedMs || 0) + dtMs;
        const tSec = proj.elapsedMs / 1000;
        const baseX = (proj.originX ?? proj.x) + proj.vx * dtSec;
        const baseY = (proj.originY ?? proj.y) + proj.vy * dtSec;
        proj.originX = baseX;
        proj.originY = baseY;
        const amp = proj.helixPhase !== undefined ? 10 : 4;
        const latOffset = (proj.helixSign || 1) * amp * Math.sin(tSec * 16 + (proj.helixPhase || 0));
        proj.x = baseX - Math.sin(proj.angle) * latOffset;
        proj.y = baseY + Math.cos(proj.angle) * latOffset;
      } else {
        proj.x += proj.vx * dtSec;
        proj.y += proj.vy * dtSec;
      }

      if (this.isWallAtWorld(proj.x, proj.y)) {
        if (proj.spellId === 'fireball') {
          this.explodeFireball(proj);
        }
        this.cleanupProjectileTracking(proj.id);
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.ownerType === 'enemy') {
        let blockedByDome = false;
        for (let zIdx = 0; zIdx < this.zones.length; zIdx++) {
          const z = this.zones[zIdx];
          if (z.kind === 'aegis_dome') {
            const dx = proj.x - z.x;
            const dy = proj.y - z.y;
            if (dx * dx + dy * dy <= z.radius * z.radius) {
              blockedByDome = true;
              break;
            }
          }
        }
        if (blockedByDome) {
          this.projectiles.splice(i, 1);
          continue;
        }

        let hitPlayer = false;
        const playerHitR = 14 + proj.radius;
        const playerHitRSq = playerHitR * playerHitR;
        for (const pr of this.players.values()) {
          if (pr.state.downed || !pr.state.connected) continue;
          const dx = pr.state.x - proj.x;
          const dy = pr.state.y - proj.y;
          if (dx * dx + dy * dy <= playerHitRSq) {
            const ownerEnemy = proj.ownerId ? this.enemies.find(e => e.id === proj.ownerId) : null;
            let finalProjDmg = proj.damage;
            if (ownerEnemy && (ownerEnemy.poisonedMs || 0) > 0) {
              finalProjDmg = Math.max(1, Math.round(finalProjDmg * 0.70));
            }
            const projDmgCat =
              proj.damageCategory ?? inferDamageCategoryFromProjectileStyle(proj.style);
            this.damagePlayer(pr.state, finalProjDmg, projDmgCat);
            if (proj.statusOnHit) {
              this.applyPlayerStatus(pr.state, proj.statusOnHit, proj.statusDurationMs || 3000);
            }
            hitPlayer = true;
            break;
          }
        }
        if (hitPlayer) {
          this.projectiles.splice(i, 1);
        }
      } else {
        const crateHitR = 18 + proj.radius;
        const crateHitRSq = crateHitR * crateHitR;
        for (const prop of this.props) {
          if (!prop.opened && prop.kind === 'crate') {
            const dx = prop.x - proj.x;
            const dy = prop.y - proj.y;
            if (dx * dx + dy * dy <= crateHitRSq) {
              prop.opened = true;
              for (const ally of this.players.values()) {
                ally.state.gold += prop.value;
              }
              this.emitEvent('gold', prop.x, prop.y - 10, `+${prop.value}g`, '#F4D378');
            }
          }
        }

        const ownerPr = this.players.get(proj.ownerId);

        if (proj.style === 'arcane_orb') {
          let orbMap = this.arcaneOrbHits.get(proj.id);
          if (!orbMap) {
            orbMap = new Map();
            this.arcaneOrbHits.set(proj.id, orbMap);
          }
          const orbSpec = ARCANIST_SPELLS.arcane_orb;
          const hitInterval = orbSpec.hitIntervalMs ?? 500;
          const maxHits = orbSpec.maxHitsPerEnemy ?? 2;
          const isTacticalOrb = this.tacticalProjIds.has(proj.id);

          for (const dummy of this.trainingDummies) {
            if (!dummy || !dummy.id) continue;
            const dx = dummy.x - proj.x;
            const dy = dummy.y - proj.y;
            if (dx * dx + dy * dy <= crateHitRSq) {
              const rec = orbMap.get(dummy.id);
              if (!rec || (rec.hits < maxHits && this.simTimeMs - rec.lastHitAtMs >= hitInterval)) {
                orbMap.set(dummy.id, { hits: (rec?.hits || 0) + 1, lastHitAtMs: this.simTimeMs });
                this.damageDummy(dummy, proj.damage, ownerPr ? ownerPr.state : null, false, false, 'arcane');
                if (isTacticalOrb) this.onTacticalHitConfirmed(ownerPr?.state);
              }
            }
          }
          for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
            if (eIdx >= this.enemies.length) continue;
            const enemy = this.enemies[eIdx];
            if (!enemy || !enemy.id || enemy.hp <= 0) continue;
            const dx = enemy.x - proj.x;
            const dy = enemy.y - proj.y;
            const hitR = enemy.radius + proj.radius;
            if (dx * dx + dy * dy <= hitR * hitR) {
              const rec = orbMap.get(enemy.id);
              if (!rec || (rec.hits < maxHits && this.simTimeMs - rec.lastHitAtMs >= hitInterval)) {
                orbMap.set(enemy.id, { hits: (rec?.hits || 0) + 1, lastHitAtMs: this.simTimeMs });
                const dealtOrb = this.damageEnemy(enemy, proj.damage, ownerPr ? ownerPr.state : null, false, 'arcane');
                if (dealtOrb > 0 && isTacticalOrb) this.onTacticalHitConfirmed(ownerPr?.state);
              }
            }
          }
          continue;
        }

        if (!Array.isArray(proj.hitEntityIds)) {
          proj.hitEntityIds = [];
        }

        // Check collision with training dummies
        let hitDummy = false;
        for (const dummy of this.trainingDummies) {
          if (!dummy || !dummy.id) continue;
          if (proj.hitEntityIds.includes(dummy.id)) continue;
          const dx = dummy.x - proj.x;
          const dy = dummy.y - proj.y;
          if (dx * dx + dy * dy <= crateHitRSq) {
            if (proj.spellId === 'fireball') {
              this.explodeFireball(proj);
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
            const isPrimaryProj = this.primaryAttackProjIds.has(proj.id);
            const isTacticalProj = this.tacticalProjIds.has(proj.id);
            const pierceHitIndex = proj.hitEntityIds.length;
            proj.hitEntityIds.push(dummy.id);
            const hitDamage = this.computePrimaryProjectileHitDamage(
              proj,
              dummy.x,
              dummy.y,
              ownerPr ? ownerPr.state : null,
              pierceHitIndex
            );
            const dealtDummy = this.damageDummy(
              dummy,
              hitDamage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit),
              isPrimaryProj,
              proj.damageCategory
            );
            if (!isPrimaryProj && isTacticalProj && dealtDummy > 0) {
              this.onTacticalHitConfirmed(ownerPr?.state);
            }
            if (isPrimaryProj && ownerPr && dealtDummy > 0) {
              this.applyWeaponPrimaryHitSpecial(
                proj,
                dummy.x,
                dummy.y,
                ownerPr.state,
                null,
                dummy,
                dealtDummy
              );
            }
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
          }
        }
        if (hitDummy) continue;

        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          if (eIdx >= this.enemies.length) continue;
          const enemy = this.enemies[eIdx];
          if (!enemy || !enemy.id || enemy.hp <= 0) continue;
          if (proj.hitEntityIds.includes(enemy.id)) continue;
          const dx = enemy.x - proj.x;
          const dy = enemy.y - proj.y;
          const hitR = enemy.radius + proj.radius;
          if (dx * dx + dy * dy <= hitR * hitR) {
            if (proj.spellId === 'fireball') {
              this.explodeFireball(proj);
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              break;
            }
            const isPrimaryProj = this.primaryAttackProjIds.has(proj.id);
            const isTacticalProj = this.tacticalProjIds.has(proj.id);
            const pierceHitIndex = proj.hitEntityIds.length;
            proj.hitEntityIds.push(enemy.id);
            if (proj.slowOnHit) this.applySoftCc(enemy, 3000);
            const hitDamage = this.computePrimaryProjectileHitDamage(
              proj,
              enemy.x,
              enemy.y,
              ownerPr ? ownerPr.state : null,
              pierceHitIndex,
              enemy
            );
            const dealtPrimary = this.damageEnemy(
              enemy,
              hitDamage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit),
              proj.damageCategory,
              isPrimaryProj
            );
            if (!isPrimaryProj && isTacticalProj && dealtPrimary > 0) {
              this.onTacticalHitConfirmed(ownerPr?.state);
            }
            if (isPrimaryProj && ownerPr && dealtPrimary > 0) {
              this.applyWeaponPrimaryHitSpecial(
                proj,
                enemy.x,
                enemy.y,
                ownerPr.state,
                enemy,
                null,
                dealtPrimary
              );
            }
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.cleanupProjectileTracking(proj.id);
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }

    let anyRoomNewlyCleared = false;
    let bossJustCleared = false;
    for (const room of this.map.rooms) {
      if (!room.cleared) {
        const aliveInRoom = this.enemies.some((e) => e.roomId === room.id && e.hp > 0);
        if (!aliveInRoom) {
          room.cleared = true;
          anyRoomNewlyCleared = true;

          for (const prop of this.props) {
            if (prop.roomId === room.id && prop.locked) {
              prop.locked = false;
              if (prop.kind === 'totem') {
                this.emitEvent('status', prop.x, prop.y - 24, 'OBELISK AWAKENED!', '#38BDF8');
                this.pushSystemChat(`Ancient Guardian Obelisk awakened in Guardian Chamber ${room.id}! Approach to claim your blessing.`);
              }
            }
          }

          if (room.type === 'boss') {
            bossJustCleared = true;
            if (!this.props.some((pr) => pr.kind === 'relic_chest' && pr.roomId === room.id)) {
              this.props.push({
                id: this.nextId('prop'),
                kind: 'relic_chest',
                x: this.map.portalPos.x + 48,
                y: this.map.portalPos.y,
                opened: false,
                roomId: room.id,
                value: 1,
              });
            }
            for (const ally of this.players.values()) {
              if (ally.state.heroClass === 'arcanist' && Math.random() < 0.5) {
                this.grantScrollChoices(ally.state.id);
              }
            }
          } else if (room.type === 'combat' && this.floor > 0) {
            this.awardCombatRoomClear(room);
            if (room.guardian) {
              for (const ally of this.players.values()) {
                if (ally.state.heroClass === 'arcanist' && Math.random() < 0.4) {
                  this.grantScrollChoices(ally.state.id);
                }
              }
            }
          }
        }
      }
    }

    const combatRooms = this.map.rooms.filter((r) => r.type === 'combat');
    if (
      this.floor > 0 &&
      anyRoomNewlyCleared &&
      !this.floorMasteryAwarded &&
      combatRooms.length > 0 &&
      combatRooms.every((r) => r.cleared)
    ) {
      this.awardFullFloorMastery();
    }

    const bossRoom = this.map.rooms.find((r) => r.type === 'boss');
    if (bossRoom && bossRoom.cleared) {
      const guardiansRemaining = this.getGuardiansRemaining();
      if (guardiansRemaining === 0) {
        if (!this.map.portalActive) {
          this.map.portalActive = true;
          this.emitEvent(
            'status',
            this.map.portalPos.x,
            this.map.portalPos.y - 34,
            'PORTAL UNLOCKED!',
            '#34D399'
          );
          this.pushSystemChat(
            bossJustCleared
              ? `Floor ${this.floor} Boss vanquished! Open the Relic Vault and press [E] at the Portal.`
              : `Final Sanctum Guardian defeated! Floor ${this.floor} Exit Portal is now unsealed.`
          );
        }
      } else if (bossJustCleared) {
        this.emitEvent(
          'status',
          this.map.portalPos.x,
          this.map.portalPos.y - 34,
          `PORTAL SEALED · ${guardiansRemaining} GUARDIAN${guardiansRemaining > 1 ? 'S' : ''}`,
          '#F59E0B'
        );
        this.pushSystemChat(
          `Floor ${this.floor} Boss vanquished, but the Exit Portal remains sealed! Defeat the remaining ${guardiansRemaining} Guardian chamber${guardiansRemaining > 1 ? 's' : ''} to unlock the descent.`
        );
      }
    }
  }

  private awardCombatRoomClear(room: RoomNode): void {
    const isGuardian = Boolean(room.guardian);
    const centerX = room.cx * TILE_SIZE + TILE_SIZE / 2;
    const centerY = room.cy * TILE_SIZE + TILE_SIZE / 2;

    const floorXpBonus = 1 + (this.floor - 1) * 0.35;
    const diffXpBonus =
      this.difficulty === 'Abyssal' ? 1.5 : this.difficulty === 'Heroic' ? 1.25 : 1.0;
    const bonusXp = Math.round((isGuardian ? 95 : 55) * floorXpBonus * diffXpBonus);
    const bonusGold = (isGuardian ? 45 : 24) + this.floor * (isGuardian ? 12 : 8);

    const blessingOrder: FloorBlessingId[] = ['fury', 'swiftness', 'bastion'];
    const blessing = blessingOrder[(room.id + this.floor) % blessingOrder.length];
    const blessingMeta = FLOOR_BLESSINGS[blessing];

    for (const ally of this.players.values()) {
      const st = ally.state;
      st.gold += bonusGold;
      if (!st.floorBlessings) st.floorBlessings = [];
      st.floorBlessings.push(blessing);

      if (blessing === 'bastion') {
        const bastionCap = this.getMaxShieldCap(st);
        st.shield = Math.min(bastionCap, st.shield + 20);
      }

      if (!st.downed) {
        const healAmt = isGuardian ? 18 : 10;
        st.hp = Math.min(st.maxHp, st.hp + healAmt);
      }

      this.grantXp(st, bonusXp);
      this.emitEvent('gold', st.x, st.y - 16, `+${bonusGold}g · +${bonusXp} XP`, '#F4D378');
      this.emitEvent(
        'status',
        st.x,
        st.y - 34,
        `${blessingMeta.name} (${blessingMeta.shortTag})`,
        blessingMeta.color
      );
    }

    this.emitEvent(
      'status',
      centerX,
      centerY - 24,
      isGuardian ? 'GUARDIAN DEFEATED!' : 'ROOM CLEARED!',
      isGuardian ? '#F59E0B' : '#34D399'
    );

    const activeBoss = this.enemies.find((e) => e.kind === 'boss' && e.hp > 0);
    const remainingWards = this.getBossWards();
    if (activeBoss) {
      this.emitEvent(
        'status',
        activeBoss.x,
        activeBoss.y - activeBoss.radius - 28,
        remainingWards > 0 ? `WARD SHATTERED (${remainingWards} LEFT)` : 'ALL WARDS SHATTERED!',
        '#38BDF8'
      );
    }

    this.pushSystemChat(
      `${isGuardian ? 'Guardian Chamber' : 'Combat Chamber'} cleared! Party earned +${bonusGold}g, +${bonusXp} XP & ${blessingMeta.name}. Boss Wards left: ${remainingWards}.`
    );
  }

  private awardFullFloorMastery(): void {
    if (this.floorMasteryAwarded) return;
    this.floorMasteryAwarded = true;
    const floorXpBonus = 1 + (this.floor - 1) * 0.35;
    const diffXpBonus =
      this.difficulty === 'Abyssal' ? 1.5 : this.difficulty === 'Heroic' ? 1.25 : 1.0;
    const masteryXp = Math.round(130 * floorXpBonus * diffXpBonus);
    const masteryGold = 60 + this.floor * 15;

    for (const ally of this.players.values()) {
      const st = ally.state;
      st.gold += masteryGold;
      if (!st.downed) {
        st.hp = Math.min(st.maxHp, st.hp + 25);
        st.shield = Math.min(this.getMaxShieldCap(st), Math.max(st.shield, 0) + 25);
      }
      st.potions = Math.min(5, st.potions + 1);
      this.grantXp(st, masteryXp);
      this.emitEvent('status', st.x, st.y - 42, 'FLOOR CLEARED (+25 SHIELD)', '#FDE047');
    }

    this.pushSystemChat(
      `Floor Mastery achieved! All chambers on Floor ${this.floor} cleared: +${masteryGold}g, +${masteryXp} XP, +25 Shield, and +1 Potion!`
    );
  }

  private computePrimaryProjectileHitDamage(
    proj: ProjectileState,
    _targetX: number,
    _targetY: number,
    owner: PlayerState | null,
    _pierceHitIndex: number,
    enemy?: EnemyState | null
  ): number {
    let dmg = proj.damage;
    if (!owner || !proj.weaponId) return dmg;
    const weaponMods = resolveEquippedWeaponForClass(owner.heroClass, proj.weaponId)?.modifiers;
    if (!weaponMods) return dmg;

    // Ashwood Recurve Barbed Broadheads (+15% vs Slowed, Frozen, or Poisoned foes)
    if (
      weaponMods.impairedTargetBonusPct &&
      enemy &&
      (enemy.slowedMs > 0 || enemy.frozenMs > 0 || enemy.poisonedMs > 0)
    ) {
      dmg = Math.round(dmg * (1 + weaponMods.impairedTargetBonusPct));
    }

    return Math.max(1, dmg);
  }

  private triggerGaleburstExplosion(
    owner: PlayerState,
    cx: number,
    cy: number,
    baseHitDmg: number,
    radius: number,
    dmgRatio: number
  ): void {
    const gwCfg = ARMAMENT_TUNING.weapons.galewind;
    this.zones.push({
      id: this.nextId('zone'),
      kind: 'galeburst_nova',
      x: cx,
      y: cy,
      radius,
      ttlMs: gwCfg.novaZoneTtlMs,
      maxTtlMs: gwCfg.novaZoneTtlMs,
      ownerId: owner.id,
    });
    const burstBase = Math.max(1, Math.round(baseHitDmg * dmgRatio));
    const enemiesSnap = [...this.enemies];
    for (const other of enemiesSnap) {
      if (!other || other.hp <= 0 || !this.enemies.includes(other)) continue;
      const dist = Math.hypot(other.x - cx, other.y - cy);
      if (dist <= radius + other.radius * 0.35) {
        this.damageEnemy(other, burstBase, owner, false, 'physical', false);
      }
    }
    for (const d of this.trainingDummies) {
      if (Math.hypot(d.x - cx, d.y - cy) <= radius + 18) {
        this.damageDummy(d, burstBase, owner, false, false, 'physical');
      }
    }
    this.emitEvent('status', cx, cy - 22, 'GALEBURST!', '#38BDF8');
  }

  private triggerSacredRetributionShockwave(cleric: PlayerState): void {
    const srCfg = ARMAMENT_TUNING.passives.sacredRetribution;
    const radius = srCfg.shockwaveRadiusPx;
    this.zones.push({
      id: this.nextId('zone'),
      kind: 'sacred_retribution',
      x: cleric.x,
      y: cleric.y,
      radius,
      ttlMs: srCfg.shockwaveZoneTtlMs,
      maxTtlMs: srCfg.shockwaveZoneTtlMs,
      ownerId: cleric.id,
    });
    const dmgMult = this.computeDamageMult(cleric, 'divine');
    const enemyDmg = Math.max(1, Math.round(srCfg.enemyBaseDamage * dmgMult));
    const enemiesSnap = [...this.enemies];
    for (const enemy of enemiesSnap) {
      if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
      if (Math.hypot(enemy.x - cleric.x, enemy.y - cleric.y) <= radius + enemy.radius * 0.35) {
        this.damageEnemy(enemy, enemyDmg, cleric, false, 'divine', false);
      }
    }
    for (const dummy of this.trainingDummies) {
      if (Math.hypot(dummy.x - cleric.x, dummy.y - cleric.y) <= radius + 18) {
        this.damageDummy(dummy, enemyDmg, cleric, false, false, 'divine');
      }
    }
    for (const allyPr of this.players.values()) {
      const ally = allyPr.state;
      if (ally.downed || !ally.connected) continue;
      if (Math.hypot(ally.x - cleric.x, ally.y - cleric.y) <= radius) {
        const healAmt = GameRoom.computeHealingAmount(srCfg.allyBaseHeal, cleric, ally);
        this.applyEffectiveHealing(cleric, ally, healAmt, 'sacred_retribution');
      }
    }
    this.emitEvent('status', cleric.x, cleric.y - 28, 'SACRED RETRIBUTION!', '#FDE047');
  }

  private applyWeaponPrimaryHitSpecial(
    proj: ProjectileState,
    targetX: number,
    targetY: number,
    owner: PlayerState,
    enemy: EnemyState | null,
    dummy: TrainingDummyState | null,
    dealtDmg?: number
  ): void {
    this.onConfirmedPrimaryHit(owner, proj.id);

    const weaponDef = resolveEquippedWeaponForClass(owner.heroClass, proj.weaponId);
    if (!weaponDef) return;
    const mods = weaponDef.modifiers;
    const triggeredBefore = this.triggeredOnceProjIds.has(proj.id);

    // Galewind Twinbow: Deterministic per-target 3-hit Galeburst air AoE
    if (mods.galeburstTriggerHits && mods.galeburstRadiusPx && mods.galeburstDamageRatio) {
      const baseDmgForBurst = dealtDmg ?? proj.damage;
      if (enemy) {
        const meta = this.getEnemyMeta(enemy);
        if (!meta.galeburstByOwner) meta.galeburstByOwner = new Map();
        const nextStacks = (meta.galeburstByOwner.get(owner.id) || 0) + 1;
        if (nextStacks >= mods.galeburstTriggerHits) {
          meta.galeburstByOwner.set(owner.id, 0);
          this.syncEnemyGaleburstMarks(enemy, meta);
          this.triggerGaleburstExplosion(
            owner,
            targetX,
            targetY,
            baseDmgForBurst,
            mods.galeburstRadiusPx,
            mods.galeburstDamageRatio
          );
        } else {
          meta.galeburstByOwner.set(owner.id, nextStacks);
          this.syncEnemyGaleburstMarks(enemy, meta);
        }
      } else if (dummy) {
        const pr = this.players.get(owner.id);
        if (pr) {
          const nextStacks = (pr.dummyGaleburstStacks.get(dummy.id) || 0) + 1;
          if (nextStacks >= mods.galeburstTriggerHits) {
            pr.dummyGaleburstStacks.set(dummy.id, 0);
            this.triggerGaleburstExplosion(
              owner,
              targetX,
              targetY,
              baseDmgForBurst,
              mods.galeburstRadiusPx,
              mods.galeburstDamageRatio
            );
          } else {
            pr.dummyGaleburstStacks.set(dummy.id, nextStacks);
          }
        }
      }
    }

    // Cinderflare Catalyst: Non-recursive Ember Detonation Fire AoE on confirmed hit
    if (mods.emberSplashRadiusPx && mods.emberSplashRatio && !triggeredBefore) {
      this.triggeredOnceProjIds.add(proj.id);
      const splashRad = mods.emberSplashRadiusPx;
      const splashBase = Math.max(2, Math.round(proj.damage * mods.emberSplashRatio));
      this.zones.push({
        id: this.nextId('zone'),
        kind: 'cinderflare_blast',
        x: targetX,
        y: targetY,
        radius: splashRad,
        ttlMs: ARMAMENT_TUNING.weapons.cinderflare.blastZoneTtlMs,
        maxTtlMs: ARMAMENT_TUNING.weapons.cinderflare.blastZoneTtlMs,
        ownerId: owner.id,
      });

      let splashed = 0;
      const enemiesSnap = [...this.enemies];
      for (const other of enemiesSnap) {
        if (!other || other === enemy || other.hp <= 0 || !this.enemies.includes(other)) continue;
        const dx = other.x - targetX;
        const dy = other.y - targetY;
        const hitR = splashRad + other.radius * 0.35;
        if (dx * dx + dy * dy <= hitR * hitR) {
          this.damageEnemy(other, splashBase, owner, false, 'fire', false);
          if (other.hp > 0 && Math.random() < 0.35) {
            const fireRes = GameRoom.getEnemyResistance(other.resistances, 'fire');
            this.applyDotStatus(other, 'burn', owner, Math.round(3500 * (1 - fireRes * 0.4)));
          }
          splashed++;
        }
      }
      for (const otherDummy of this.trainingDummies) {
        if (!otherDummy || otherDummy === dummy) continue;
        const dx = otherDummy.x - targetX;
        const dy = otherDummy.y - targetY;
        if (dx * dx + dy * dy <= (splashRad + 18) * (splashRad + 18)) {
          this.damageDummy(otherDummy, splashBase, owner, false, false, 'fire');
          splashed++;
        }
      }
      if (splashed > 0 || enemy || dummy) {
        this.emitEvent('status', targetX, targetY - 18, 'EMBER BLAST!', '#F97316');
      }
    }

    // Chronostar Scepter: Temporal Siphon trims Tactical (-150ms) & Ultimate (-300ms) CD once per orb
    if ((mods.tacticalSiphonMs || mods.ultSiphonMs) && !triggeredBefore) {
      this.triggeredOnceProjIds.add(proj.id);
      if (mods.tacticalSiphonMs && owner.skillCooldownMs > 0) {
        owner.skillCooldownMs = Math.max(0, owner.skillCooldownMs - mods.tacticalSiphonMs);
      }
      if (mods.ultSiphonMs && owner.ultCooldownMs > 0) {
        owner.ultCooldownMs = Math.max(0, owner.ultCooldownMs - mods.ultSiphonMs);
      }
    }

    // Solaris War-Censer: Incense Mending heals lowest-HP injured OTHER ally within range (no self-heal fallback)
    if (mods.allyHealOnHitBase && !triggeredBefore) {
      this.triggeredOnceProjIds.add(proj.id);
      const pr = this.players.get(owner.id);
      const procCd =
        mods.allyHealProcCooldownMs ?? ARMAMENT_TUNING.weapons.solaris.procCooldownMs;
      if (!pr || this.simTimeMs - pr.solarisLastHealAtMs >= procCd) {
        const healRange =
          mods.allyHealOnHitRangePx ?? ARMAMENT_TUNING.weapons.solaris.healRangePx;
        let lowestAlly: PlayerState | null = null;
        let lowestRatio = 1.01;
        for (const ally of this.players.values()) {
          const st = ally.state;
          if (st.id === owner.id || !st.connected || st.downed) continue;
          if (Math.hypot(st.x - owner.x, st.y - owner.y) > healRange) continue;
          const ratio = st.hp / Math.max(1, st.maxHp);
          if (st.hp < st.maxHp && ratio < lowestRatio) {
            lowestRatio = ratio;
            lowestAlly = st;
          }
        }
        if (lowestAlly) {
          const healAmt = GameRoom.computeHealingAmount(mods.allyHealOnHitBase, owner, lowestAlly);
          const applied = this.applyEffectiveHealing(owner, lowestAlly, healAmt, 'solaris');
          if (applied > 0 && pr) {
            pr.solarisLastHealAtMs = this.simTimeMs;
          }
        }
      }
    }
  }

  public fireEclipseChargedShot(p: PlayerState, holdDurationMs: number): void {
    const def = HERO_CLASSES[p.heroClass];
    const weaponDef = resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
    if (!weaponDef || !weaponDef.modifiers.chargeToFire) {
      this.firePrimaryAttack(p);
      return;
    }
    const weaponMods = weaponDef.modifiers;
    const cfg = ARMAMENT_TUNING.weapons.eclipse;
    const clampedHold = Math.max(0, Math.min(cfg.maxChargeMs, holdDurationMs));
    const chargeT =
      clampedHold <= cfg.minChargeMs
        ? 0
        : (clampedHold - cfg.minChargeMs) / Math.max(1, cfg.maxChargeMs - cfg.minChargeMs);
    const chargeDmgRatio =
      cfg.minDamageRatio + chargeT * (cfg.maxDamageRatio - cfg.minDamageRatio);
    const chargeSpeedRatio =
      cfg.minProjSpeedMult + chargeT * (cfg.maxProjSpeedMult - cfg.minProjSpeedMult);

    const mult = this.computeDamageMult(p, 'physical', {
      isPrimaryAttack: true,
      weaponDef,
    });
    const critChance = this.getPlayerCritChance(p, weaponMods);
    const hasCrit = Math.random() < critChance;
    const critMult = hasCrit ? CRIT_DAMAGE_MULTIPLIER + (weaponMods.critMultBonus || 0) : 1.0;
    const baseDmg = Math.max(1, Math.round(def.damage * mult * critMult * chargeDmgRatio));

    const relicExtraCount = p.relics.includes('twinstring_charm') ? 1 : 0;
    const bonusPierce =
      (p.relics.includes('piercing_prism') ? 1 : 0) + (weaponMods.bonusPierce || 0);
    const maxSearchDist = getPrimaryAttackRange(p.heroClass) + (weaponMods.rangeBonusPx || 0);
    const bestTarget =
      findBestAutoTarget({
        playerX: p.x,
        playerY: p.y,
        maxRange: maxSearchDist,
        preferredAngle: p.aimAngle,
        minDot: 0.88,
        map: this.map,
        props: this.props,
        enemies: this.enemies,
        trainingDummies: this.trainingDummies,
      })?.target ?? null;

    const shotCount = 1 + relicExtraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread =
        shotCount === 1 ? 0 : s === 0 ? -0.1 : 0.1;
      const ang = p.aimAngle + spread;
      const isRelicTwinShot = s >= 1;
      const shotDmg = Math.max(1, Math.round(baseDmg * (isRelicTwinShot ? 0.35 : 1.0)));
      const spawned = this.spawnProjectile({
        ownerType: 'player',
        ownerId: p.id,
        style: 'arrow',
        damageCategory: 'physical',
        x: p.x + Math.cos(ang) * 16,
        y: p.y + Math.sin(ang) * 16,
        vx: Math.cos(ang) * 470 * chargeSpeedRatio,
        vy: Math.sin(ang) * 470 * chargeSpeedRatio,
        angle: ang,
        radius: chargeT >= 0.75 ? 8 : 6,
        damage: shotDmg,
        pierce: 1 + bonusPierce,
        crit: hasCrit,
        ttlMs: Math.round(420 * (1 + chargeT * 0.25)),
        targetEnemyId: bestTarget?.id,
        originX: p.x,
        originY: p.y,
        weaponId: weaponDef.id,
      });
      this.primaryAttackProjIds.add(spawned.id);
    }
    if (chargeT >= 0.85) {
      this.emitEvent('status', p.x, p.y - 26, 'ECLIPSE FULL DRAW!', '#FBBF24');
    }
  }

  public firePrimaryAttack(p: PlayerState): void {
    const def = HERO_CLASSES[p.heroClass];
    const weaponDef = resolveEquippedWeaponForClass(p.heroClass, p.equippedWeapon);
    const weaponMods = weaponDef?.modifiers || {};

    if (weaponMods.chargeToFire) {
      this.fireEclipseChargedShot(p, 0);
      return;
    }

    const activePassive = this.getActivePassive(p);
    if (
      activePassive === 'sacred_retribution' &&
      (p.clericSanctity || 0) >= ARMAMENT_TUNING.passives.sacredRetribution.cap
    ) {
      p.clericSanctity = 0;
      this.triggerSacredRetributionShockwave(p);
    }

    const category: 'physical' | 'arcane' | 'divine' =
      p.heroClass === 'arcanist' ? 'arcane' : p.heroClass === 'cleric' ? 'divine' : 'physical';
    let mult = this.computeDamageMult(p, category, { isPrimaryAttack: true, weaponDef });
    if (
      weaponMods.activeRiftBonusPct &&
      this.zones.some((z) => z.kind === 'star_rift' && z.ownerId === p.id && z.ttlMs > 0)
    ) {
      mult *= 1 + weaponMods.activeRiftBonusPct;
    }

    const critChance = this.getPlayerCritChance(p, weaponMods);
    const hasCrit = Math.random() < critChance;
    const critMult = hasCrit ? CRIT_DAMAGE_MULTIPLIER + (weaponMods.critMultBonus || 0) : 1.0;
    const dmg = Math.max(1, Math.round(def.damage * mult * critMult));
    const relicExtraCount = p.relics.includes('twinstring_charm') ? 1 : 0;
    const bonusPierce =
      (p.relics.includes('piercing_prism') ? 1 : 0) + (weaponMods.bonusPierce || 0);
    const projSpeedMult = weaponMods.projectileSpeedMult ?? 1.0;
    const rangeBonusPx = weaponMods.rangeBonusPx || 0;

    // Stormbreaker Flail: 360-degree circular Tempest Wheel Basic Attack
    if (weaponMods.tempestWheel) {
      const twCfg = ARMAMENT_TUNING.weapons.stormbreaker;
      const wheelRadius = twCfg.tempestRadiusPx + rangeBonusPx;
      const wheelDmg = Math.max(1, Math.round(dmg * twCfg.tempestDamageRatio));
      this.zones.push({
        id: this.nextId('zone'),
        kind: 'tempest_wheel',
        x: p.x,
        y: p.y,
        radius: wheelRadius,
        ttlMs: twCfg.tempestZoneTtlMs,
        maxTtlMs: twCfg.tempestZoneTtlMs,
        ownerId: p.id,
      });

      const hitIds = new Set<string>();
      for (const prop of this.props) {
        if (!prop.opened && prop.kind === 'crate') {
          if (Math.hypot(prop.x - p.x, prop.y - p.y) <= wheelRadius + 18) {
            prop.opened = true;
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            this.emitEvent('gold', prop.x, prop.y - 10, `+${prop.value}g`, '#F4D378');
          }
        }
      }
      const enemiesSnap = [...this.enemies];
      for (const enemy of enemiesSnap) {
        if (!enemy || enemy.hp <= 0 || hitIds.has(enemy.id) || !this.enemies.includes(enemy)) {
          continue;
        }
        if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= wheelRadius + enemy.radius * 0.35) {
          hitIds.add(enemy.id);
          const dealt = this.damageEnemy(enemy, wheelDmg, p, hasCrit, 'physical', true);
          if (dealt > 0) this.onConfirmedPrimaryHit(p);
        }
      }
      for (const dummy of this.trainingDummies) {
        if (!dummy || hitIds.has(dummy.id)) continue;
        if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= wheelRadius + 18) {
          hitIds.add(dummy.id);
          const dealt = this.damageDummy(dummy, wheelDmg, p, hasCrit, true, 'physical');
          if (dealt > 0) this.onConfirmedPrimaryHit(p);
        }
      }
      return;
    }

    // Sunforged Claymore: release golden cone shockwave while Shield > 0
    if (weaponMods.sunforgedShockwave && p.shield > 0) {
      const sfCfg = ARMAMENT_TUNING.weapons.sunforged;
      const sfDmg = Math.max(1, Math.round(dmg * sfCfg.shockwaveDamageRatio));
      this.zones.push({
        id: this.nextId('zone'),
        kind: 'sunforged_shockwave',
        x: p.x,
        y: p.y,
        angle: p.aimAngle,
        radius: sfCfg.shockwaveRangePx,
        coneHalfAngleRad: sfCfg.shockwaveHalfAngleRad,
        ttlMs: sfCfg.shockwaveZoneTtlMs,
        maxTtlMs: sfCfg.shockwaveZoneTtlMs,
        ownerId: p.id,
      });
      const enemiesSnap = [...this.enemies];
      for (const enemy of enemiesSnap) {
        if (!enemy || enemy.hp <= 0 || !this.enemies.includes(enemy)) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= sfCfg.shockwaveRangePx + enemy.radius * 0.35) {
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - p.aimAngle));
          if (diff <= sfCfg.shockwaveHalfAngleRad) {
            this.damageEnemy(enemy, sfDmg, p, false, 'physical', false);
          }
        }
      }
      for (const dummy of this.trainingDummies) {
        const dx = dummy.x - p.x;
        const dy = dummy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= sfCfg.shockwaveRangePx + 18) {
          const diff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - p.aimAngle));
          if (diff <= sfCfg.shockwaveHalfAngleRad) {
            this.damageDummy(dummy, sfDmg, p, false, false, 'physical');
          }
        }
      }
    }

    // Soft homing lock ONLY for targets within a narrow forward aim cone (±28°, wider for Chronostar seeking)
    const maxSearchDist = getPrimaryAttackRange(p.heroClass) + rangeBonusPx;
    const bestTarget = findBestAutoTarget({
      playerX: p.x,
      playerY: p.y,
      maxRange: weaponMods.seekingRadiusPx
        ? Math.max(maxSearchDist, weaponMods.seekingRadiusPx)
        : maxSearchDist,
      preferredAngle: p.aimAngle,
      minDot: weaponMods.seekingRadiusPx ? 0.35 : 0.88,
      map: this.map,
      props: this.props,
      enemies: this.enemies,
      trainingDummies: this.trainingDummies,
    })?.target ?? null;

    const shotCount = 1 + relicExtraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread =
        shotCount === 1
          ? 0
          : shotCount === 2
            ? s === 0
              ? -0.1
              : 0.1
            : (s - (shotCount - 1) / 2) * 0.14;
      const ang = p.aimAngle + spread;
      const isRelicTwinShot = s >= 1;
      const shotDmg = Math.max(1, Math.round(dmg * (isRelicTwinShot ? 0.35 : 1.0)));

      let spawned: ProjectileState;
      if (p.heroClass === 'vanguard') {
        const isHalberd = weaponDef?.id === 'vanguard_crimson_halberd';
        const forwardReachOffset = isHalberd ? 30 : 22;
        const swingSpeed = isHalberd ? 145 : 60;
        const swingTtl = isHalberd ? 155 : 140;
        spawned = this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'slash',
          damageCategory: category,
          x: p.x + Math.cos(ang) * forwardReachOffset,
          y: p.y + Math.sin(ang) * forwardReachOffset,
          vx: Math.cos(ang) * swingSpeed,
          vy: Math.sin(ang) * swingSpeed,
          angle: ang,
          radius: 34 + rangeBonusPx,
          damage: shotDmg,
          pierce: 4 + bonusPierce,
          crit: hasCrit,
          ttlMs: swingTtl,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id,
        });
      } else if (p.heroClass === 'ranger') {
        spawned = this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'arrow',
          damageCategory: category,
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 470 * projSpeedMult,
          vy: Math.sin(ang) * 470 * projSpeedMult,
          angle: ang,
          radius: 6,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 420,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id,
        });
      } else if (p.heroClass === 'arcanist') {
        if (s === 0 && activePassive === 'astral_resonance') {
          const pr = this.players.get(p.id);
          if (pr) {
            pr.starRiftAttackCount = (pr.starRiftAttackCount || 0) + 1;
            if (pr.starRiftAttackCount >= STAR_RIFT_REQUIRED_ATTACKS) {
              if ((p.starRiftCooldownMs || 0) <= 0) {
                const riftX = bestTarget ? bestTarget.x : p.x + Math.cos(ang) * 120;
                const riftY = bestTarget ? bestTarget.y : p.y + Math.sin(ang) * 120;
                this.zones.push({
                  id: this.nextId('zone'),
                  kind: 'star_rift',
                  x: riftX,
                  y: riftY,
                  radius: 75,
                  ttlMs: 3000,
                  maxTtlMs: 3000,
                  ownerId: p.id,
                });
                p.starRiftCooldownMs = STAR_RIFT_PROC_COOLDOWN_MS;
                this.emitEvent('status', riftX, riftY - 18, ' Star Rift', '#C084FC');
              }
              pr.starRiftAttackCount = 0;
            }
          }
        }
        spawned = this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'arcane',
          damageCategory: category,
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 380 * projSpeedMult,
          vy: Math.sin(ang) * 380 * projSpeedMult,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 480,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id,
        });
      } else {
        spawned = this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'radiant',
          damageCategory: category,
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 390 * projSpeedMult,
          vy: Math.sin(ang) * 390 * projSpeedMult,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 420,
          targetEnemyId: bestTarget?.id,
          originX: p.x,
          originY: p.y,
          weaponId: weaponDef?.id,
        });
      }
      this.primaryAttackProjIds.add(spawned.id);
    }
  }

  public spawnProjectile(spec: Omit<ProjectileState, 'id'>): ProjectileState {
    const proj: ProjectileState = {
      id: this.nextId('proj'),
      ...spec,
      pierce: spec.pierce ?? 1,
      hitEntityIds: spec.hitEntityIds ? [...spec.hitEntityIds] : [],
      chronoSuspendedMs:
        spec.chronoSuspendedMs ??
        this.isPositionInChronoWell(spec.x, spec.y, spec.radius),
    };
    this.projectiles.push(proj);
    return proj;
  }

  private getBossCombatProfile(floorNum: number): {
    archetype: 'brawler' | 'skirmisher' | 'caster';
    preferredMinDist: number;
    preferredMaxDist: number;
  } {
    if (floorNum === 1 || floorNum === 10) {
      return { archetype: 'brawler', preferredMinDist: 44, preferredMaxDist: 92 };
    }
    if (floorNum === 4 || floorNum === 7 || floorNum === 9) {
      return { archetype: 'skirmisher', preferredMinDist: 80, preferredMaxDist: 155 };
    }
    return { archetype: 'caster', preferredMinDist: 135, preferredMaxDist: 220 };
  }

  private isBossHazardPosition(x: number, y: number, extraRadius = 0): boolean {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.ttlMs <= 0) continue;
      if (z.kind === 'fireball_burn' || z.kind === 'star_rift' || z.kind === 'arcane_meteor') {
        if (Math.hypot(x - z.x, y - z.y) <= z.radius + extraRadius) {
          return true;
        }
      }
    }
    return false;
  }

  private predictTargetPosition(
    target: PlayerState,
    leadSec: number,
    bossRoom?: RoomNode
  ): { x: number; y: number } {
    const clampedLead = Math.max(0, Math.min(0.75, leadSec));
    const speed = Math.hypot(target.vx, target.vy);
    if (speed < 5 || clampedLead <= 0) {
      return { x: target.x, y: target.y };
    }
    // Realistic velocity lead (0.78x) so fast reactions still reward dodging
    const stepX = target.vx * clampedLead * 0.78;
    const stepY = target.vy * clampedLead * 0.78;
    const steps = 4;
    let px = target.x;
    let py = target.y;
    for (let s = 1; s <= steps; s++) {
      const nx = target.x + (stepX * s) / steps;
      const ny = target.y + (stepY * s) / steps;
      const tx = Math.floor(nx / TILE_SIZE);
      const ty = Math.floor(ny / TILE_SIZE);
      if (bossRoom) {
        if (
          tx < bossRoom.x + 1 ||
          tx >= bossRoom.x + bossRoom.w - 1 ||
          ty < bossRoom.y + 1 ||
          ty >= bossRoom.y + bossRoom.h - 1
        ) {
          break;
        }
      }
      if (this.isWallAtWorld(nx, ny)) break;
      px = nx;
      py = ny;
    }
    return { x: px, y: py };
  }

  private selectBossTarget(boss: EnemyState, fallbackNearest: PlayerState, bossRoom?: RoomNode): PlayerState {
    const meta = this.getEnemyMeta(boss);
    const candidates: PlayerState[] = [];
    for (const pr of this.players.values()) {
      const st = pr.state;
      if (st.downed || !st.connected) continue;
      const dist = Math.hypot(st.x - boss.x, st.y - boss.y);
      const pRoom = this.findRoomContaining(st.x, st.y);
      if (dist <= 460 || (bossRoom && pRoom && pRoom.id === bossRoom.id)) {
        candidates.push(st);
      }
    }
    if (candidates.length <= 1) {
      const single = candidates[0] || fallbackNearest;
      meta.bossTargetId = single.id;
      return single;
    }

    const currentTarget = candidates.find((c) => c.id === meta.bossTargetId);
    const currentInLos = currentTarget
      ? this.hasLineOfSight(boss.x, boss.y, currentTarget.x, currentTarget.y)
      : false;
    // Brief hysteresis unless current target goes out of LoS or someone exposes a high-value opening
    const canSwitchFreely =
      !currentTarget ||
      !currentInLos ||
      this.simTimeMs - meta.bossTargetSwitchAtMs >= 2400;

    if (!canSwitchFreely && currentTarget) {
      return currentTarget;
    }

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x - boss.x, c.y - boss.y);
      const los = this.hasLineOfSight(boss.x, boss.y, c.x, c.y);
      const hpMissing = 1 - c.hp / Math.max(1, c.maxHp);
      let score = 100 - d * 0.16;
      if (los) score += 35;
      score += hpMissing * 48; // Focus weakened heroes
      if (c.disintegrationState?.active || c.spellCastState) score += 32; // Punish stationary casters
      if (c.heroClass === 'cleric' || c.heroClass === 'arcanist') score += 12;
      if (c.statuses?.some((s) => s.type === 'impaled' || s.type === 'guard_broken' || s.type === 'frostbite')) {
        score += 18;
      }
      if (c.id === meta.bossTargetId && this.simTimeMs - meta.bossTargetSwitchAtMs >= 2400) {
        score -= 32; // Rotate pressure across active party members instead of tunneling one player forever
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best.id !== meta.bossTargetId) {
      meta.bossTargetSwitchAtMs = this.simTimeMs;
    }
    meta.bossTargetId = best.id;
    return best;
  }

  private computeSmartBossMove(
    boss: EnemyState,
    target: PlayerState,
    bossRoom: RoomNode | undefined,
    archetype: 'brawler' | 'skirmisher' | 'caster',
    preferredMinDist: number,
    preferredMaxDist: number,
    meta: EnemyRuntimeMeta,
    spd: number,
    dtSec: number
  ): void {
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const targetDist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const hasLoS = this.hasLineOfSight(boss.x, boss.y, target.x, target.y);

    if (this.simTimeMs >= meta.bossStrafeFlipAtMs) {
      meta.bossStrafeDir = meta.bossStrafeDir >= 0 ? -1 : 1;
      meta.bossStrafeFlipAtMs = this.simTimeMs + 1900 + Math.floor(Math.random() * 900);
    }

    let vxDes = 0;
    let vyDes = 0;
    let shouldMove = false;

    // 1. Tactical range & orbit vector
    if (!hasLoS || targetDist > preferredMaxDist) {
      vxDes += Math.cos(angle);
      vyDes += Math.sin(angle);
      if (archetype !== 'brawler') {
        // Diagonal flank advance rather than rigid straight line
        const perp = angle + meta.bossStrafeDir * (Math.PI / 2);
        vxDes += Math.cos(perp) * 0.35;
        vyDes += Math.sin(perp) * 0.35;
      }
      shouldMove = true;
    } else if (targetDist < preferredMinDist && archetype !== 'brawler') {
      // Kiting / tactical retreat blended with lateral strafe so casters never back dead-end into walls
      const away = angle + Math.PI;
      const strafe = angle + meta.bossStrafeDir * (Math.PI / 2);
      vxDes += Math.cos(away) * 0.78 + Math.cos(strafe) * 0.62;
      vyDes += Math.sin(away) * 0.78 + Math.sin(strafe) * 0.62;
      shouldMove = true;
    } else if (archetype !== 'brawler' || targetDist > 52) {
      // Active orbit strafe at optimal combat distance so players can't easily stationary-turret
      const orbitAngle = angle + meta.bossStrafeDir * (Math.PI * 0.46);
      const orbitWeight = archetype === 'brawler' ? 0.55 : 0.9;
      vxDes += Math.cos(orbitAngle) * orbitWeight;
      vyDes += Math.sin(orbitAngle) * orbitWeight;
      shouldMove = true;
    }

    // 2. Player AoE hazard evasion (sidestep lingering Fireball Burn, Star Rift, Arcane Meteor)
    let escapeX = 0;
    let escapeY = 0;
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (z.ttlMs <= 0) continue;
      if (z.kind === 'fireball_burn' || z.kind === 'star_rift' || z.kind === 'arcane_meteor') {
        const zd = Math.hypot(boss.x - z.x, boss.y - z.y);
        const dangerR = z.radius + boss.radius + 10;
        if (zd < dangerR) {
          const awayAng = zd > 2 ? Math.atan2(boss.y - z.y, boss.x - z.x) : angle + Math.PI;
          const urgency = 1.45 * (1 - zd / dangerR) + 0.65;
          escapeX += Math.cos(awayAng) * urgency;
          escapeY += Math.sin(awayAng) * urgency;
          shouldMove = true;
        }
      }
    }
    vxDes += escapeX;
    vyDes += escapeY;

    if (!shouldMove || Math.hypot(vxDes, vyDes) < 0.08) {
      boss.vx = 0;
      boss.vy = 0;
      return;
    }

    const desiredAngle = Math.atan2(vyDes, vxDes);
    const whiskerOffsets = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, Math.PI];
    const probeShort = boss.radius + 10;
    const probeFar = boss.radius + 26;

    let bestAngle = desiredAngle;
    let bestScore = -Infinity;

    for (const off of whiskerOffsets) {
      const cand = desiredAngle + off;
      const cx1 = boss.x + Math.cos(cand) * probeShort;
      const cy1 = boss.y + Math.sin(cand) * probeShort;
      const cx2 = boss.x + Math.cos(cand) * probeFar;
      const cy2 = boss.y + Math.sin(cand) * probeFar;
      if (this.collidesCircle(cx1, cy1, boss.radius - 2)) continue;

      if (bossRoom) {
        const tx2 = Math.floor(cx2 / TILE_SIZE);
        const ty2 = Math.floor(cy2 / TILE_SIZE);
        if (
          tx2 < bossRoom.x + 1 ||
          tx2 >= bossRoom.x + bossRoom.w - 1 ||
          ty2 < bossRoom.y + 1 ||
          ty2 >= bossRoom.y + bossRoom.h - 1
        ) {
          continue;
        }
      }

      let candScore = Math.cos(off) * 100;
      if (this.collidesCircle(cx2, cy2, boss.radius - 2)) candScore -= 45;
      if (this.isBossHazardPosition(cx1, cy1, boss.radius * 0.5)) candScore -= 85;
      if (this.hasLineOfSight(cx1, cy1, target.x, target.y)) candScore += 20;

      if (candScore > bestScore) {
        bestScore = candScore;
        bestAngle = cand;
      }
    }

    const moveSpeedFactor = archetype === 'brawler' && targetDist < preferredMaxDist && escapeX === 0 && escapeY === 0 ? 0.65 : 1.0;
    boss.vx = Math.cos(bestAngle) * spd * moveSpeedFactor;
    boss.vy = Math.sin(bestAngle) * spd * moveSpeedFactor;
    const startX = boss.x;
    const startY = boss.y;
    this.moveWithCollision(boss, boss.vx * dtSec, boss.vy * dtSec, 22);
    const actualMoved = Math.hypot(boss.x - startX, boss.y - startY);
    const expectedMove = Math.hypot(boss.vx * dtSec, boss.vy * dtSec);
    if (expectedMove > 0.5 && actualMoved < expectedMove * 0.25) {
      meta.bossStrafeDir = meta.bossStrafeDir >= 0 ? -1 : 1;
    }
  }

  private pickSmartBossAbility(
    floorNum: number,
    available: number[],
    meta: EnemyRuntimeMeta,
    boss: EnemyState,
    target: PlayerState,
    targetDist: number,
    activePlayers: PlayerRuntime[],
    hasLoS: boolean,
    standingInHazard: boolean
  ): number {
    const ready = available.filter(
      (idx) => (meta.bossAbilityCooldowns[idx] ?? 0) <= this.simTimeMs
    );
    const pool = ready.length > 0 ? ready : available;
    if (pool.length === 1) {
      meta.lastBossAbility = pool[0];
      return pool[0];
    }

    const hpRatio = boss.hp / Math.max(1, boss.maxHp);
    const playersNear160 = activePlayers.filter(
      (p) => Math.hypot(p.state.x - boss.x, p.state.y - boss.y) <= 160
    ).length;
    const playersNear95 = activePlayers.filter(
      (p) => Math.hypot(p.state.x - boss.x, p.state.y - boss.y) <= 95
    ).length;
    const targetMovingFast = Math.hypot(target.vx, target.vy) > 65;
    const targetChanneling = Boolean(target.disintegrationState?.active || target.spellCastState);
    const underHeavyFocus =
      meta.bossRecentDmgTaken > boss.maxHp * 0.05 &&
      this.simTimeMs - meta.bossRecentDmgAtMs <= 2200;

    let bestChoice = pool[0];
    let bestScore = -Infinity;

    for (const idx of pool) {
      let score = 50 + Math.random() * 12;
      if (idx === meta.lastBossAbility) score -= 24;

      if (floorNum === 1) {
        // 0: Shield Wall, 1: Triple Cleave, 2: Ground Slam, 3: War Charge
        if (idx === 0) {
          score += underHeavyFocus ? 36 : 0;
          score += playersNear95 >= 1 ? 18 : -12;
          if (hpRatio < 0.7) score += 12;
        } else if (idx === 1) {
          score += hasLoS && targetDist <= 220 ? 28 : -18;
        } else if (idx === 2) {
          score += targetDist <= 170 ? 26 : -10;
          if (targetChanneling || !hasLoS) score += 22;
        } else if (idx === 3) {
          const chargeClear = this.hasLineOfSight(boss.x, boss.y, target.x, target.y);
          score += targetDist >= 145 && chargeClear ? 46 : -30;
        }
      } else if (floorNum === 2) {
        // 0: Frost Nova, 1: Soul Siphon, 2: Soul Hail, 3: Death Ring
        if (idx === 0) {
          score += targetChanneling || !hasLoS ? 32 : 14;
          if (activePlayers.length >= 2) score += 16;
        } else if (idx === 1) {
          score += targetDist <= 160 ? 34 : -24;
          if (hpRatio < 0.8 && targetDist <= 160) score += 26;
        } else if (idx === 2) {
          score += hasLoS && targetDist >= 110 ? 30 : -15;
        } else if (idx === 3) {
          score += playersNear160 >= 2 || targetDist <= 135 ? 30 : 8;
        }
      } else if (floorNum === 3) {
        // 0: Magma Eruption, 1: Fissure Wave, 2: Cinder Spiral, 3: Core Detonation
        if (idx === 0) {
          score += targetDist > 130 || !hasLoS ? 28 : 10;
        } else if (idx === 1) {
          score += hasLoS && targetDist <= 260 ? 32 : -20;
        } else if (idx === 2) {
          score += playersNear160 >= 1 ? 26 : 6;
        } else if (idx === 3) {
          score += targetChanneling || targetDist <= 185 ? 36 : 14;
        }
      } else if (floorNum === 4) {
        // 0: Singularity, 1: Tendril Flurry, 2: Void Step, 3: Abyssal Nova
        if (idx === 0) {
          score += targetDist >= 115 || activePlayers.length >= 2 ? 34 : 8;
        } else if (idx === 1) {
          score += hasLoS && targetDist <= 210 ? 28 : -16;
        } else if (idx === 2) {
          score += standingInHazard || !hasLoS || targetDist > 175 ? 48 : targetDist < 75 ? 24 : -12;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 28 : -8;
        }
      } else if (floorNum === 5) {
        // 0: Supernova (r=145 around boss), 1: Starbeam Cascade, 2: Cosmic Volley, 3: Radial Burst
        if (idx === 0) {
          score += playersNear160 >= 1 ? 42 : -45;
        } else if (idx === 1) {
          score += targetDist > 125 || !hasLoS ? 32 : 12;
        } else if (idx === 2) {
          score += hasLoS && targetDist >= 105 ? 30 : -15;
        } else if (idx === 3) {
          score += playersNear160 >= 2 || targetMovingFast ? 24 : 8;
        }
      } else if (floorNum === 6) {
        // 0: Resonant Crescendo, 1: Lament of the Forgotten, 2: Divine Chorus Beams, 3: Chorus of Remembrance
        if (idx === 0) {
          score += hasLoS && targetDist <= 290 ? 30 : -18;
        } else if (idx === 1) {
          score += !hasLoS || targetDist > 210 || targetChanneling ? 34 : 16;
        } else if (idx === 2) {
          score += hasLoS && targetDist <= 310 ? 30 : -16;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 30 : 6;
        }
      } else if (floorNum === 7) {
        // 0: Ashen Procession, 1: Censer Sweep (r=155), 2: Reliquary Awakening, 3: Judgment (+Aegis)
        if (idx === 0) {
          score += playersNear160 >= 1 ? 28 : -18;
        } else if (idx === 1) {
          score += targetDist <= 155 ? 44 : -42;
        } else if (idx === 2) {
          score += targetDist >= 85 && targetDist <= 190 ? 28 : -8;
        } else if (idx === 3) {
          score += hasLoS && (targetDist > 130 || underHeavyFocus) ? 38 : -10;
        }
      } else if (floorNum === 8) {
        // 0: Scripture of Binding, 1: Forbidden Verses, 2: Seal of Silence, 3: Heretical Volley
        if (idx === 0) {
          score += hasLoS && targetDist <= 260 ? 30 : -12;
        } else if (idx === 1) {
          score += hasLoS && targetDist >= 80 && targetDist <= 230 ? 28 : -10;
        } else if (idx === 2) {
          score +=
            target.heroClass === 'arcanist' || target.heroClass === 'cleric' || targetChanneling || !hasLoS
              ? 42
              : 18;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 28 : -10;
        }
      } else if (floorNum === 9) {
        // 0: Heaven's Piercing Line, 1: Lancefall Sequence, 2: Aerial Judgment, 3: Sentinel Spearfall
        if (idx === 0) {
          score += hasLoS && targetDist <= 340 ? 32 : -22;
        } else if (idx === 1) {
          score += !hasLoS || targetMovingFast || targetDist > 160 ? 36 : 16;
        } else if (idx === 2) {
          score += hasLoS && targetDist <= 280 ? 30 : -18;
        } else if (idx === 3) {
          score += playersNear160 >= 1 ? 36 : -30;
        }
      } else {
        // Floor 10: 0: Warden's Edict (r=220), 1: Unbroken Judgment (Parry), 2: Final Verdict, 3: Bastion Shatter (r=190)
        if (idx === 0) {
          score += targetDist <= 215 ? 36 : -26;
        } else if (idx === 1) {
          score += underHeavyFocus ? 46 : playersNear160 >= 1 ? 16 : -20;
        } else if (idx === 2) {
          score += hasLoS && targetDist <= 180 ? 34 : -22;
        } else if (idx === 3) {
          score += playersNear160 >= 1 || targetDist <= 185 ? 32 : -24;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestChoice = idx;
      }
    }

    meta.lastBossAbility = bestChoice;
    return bestChoice;
  }

  private updateBossAi(
    boss: EnemyState,
    bossRoom: RoomNode | undefined,
    fallbackNearest: PlayerState,
    dtMs: number,
    dtSec: number,
    slowFactor: number
  ): void {
    const meta = this.getEnemyMeta(boss);
    const hpRatio = boss.hp / Math.max(1, boss.maxHp);

    if (this.simTimeMs - meta.bossRecentDmgAtMs > 2500) {
      meta.bossRecentDmgTaken = 0;
    }

    // Enrage transition at <= 50% HP (preserves readable windows & telegraphs)
    if (!boss.enraged && hpRatio <= 0.5) {
      boss.enraged = true;
      this.emitEvent('crit', boss.x, boss.y - boss.radius - 24, 'ENRAGED!', '#EF4444');
      this.pushSystemChat(`${boss.name} has entered an ENRAGED frenzy! Pressure intensifying!`);
    }

    const floorNum = this.floor;
    const isCatacombs = this.map.biome === 'catacombs' || floorNum === 2;
    const isEmber = this.map.biome === 'ember' || floorNum === 3;
    const isVoid = this.map.biome === 'void' || floorNum === 4;
    const isAstral = this.map.biome === 'astral' || floorNum === 5;
    const isHymns = this.map.biome === 'hymns' || floorNum === 6;
    const isReliquary = this.map.biome === 'reliquary' || floorNum === 7;
    const isScripture = this.map.biome === 'scripture' || floorNum === 8;
    const isNave = this.map.biome === 'nave' || floorNum === 9;
    const isWardenGate = this.map.biome === 'wardengate' || floorNum === 10;

    // Normalize effective boss floor index when summoned on another floor
    const effectiveFloor =
      isCatacombs ? 2
        : isEmber ? 3
          : isVoid ? 4
            : isAstral ? 5
              : isHymns ? 6
                : isReliquary ? 7
                  : isScripture ? 8
                    : isNave ? 9
                      : isWardenGate ? 10
                        : floorNum;

    // Unique per-boss Phase transitions & conditional purposeful summons
    let nextPhase = meta.bossPhase || 1;
    if (effectiveFloor === 1) {
      nextPhase = hpRatio <= 0.50 ? 2 : 1;
    } else if (effectiveFloor === 2) {
      nextPhase = hpRatio <= 0.40 ? 3 : hpRatio <= 0.75 ? 2 : 1;
    } else if (effectiveFloor === 3) {
      nextPhase = hpRatio <= 0.55 ? 2 : 1;
    } else if (effectiveFloor === 4) {
      nextPhase = hpRatio <= 0.35 ? 3 : hpRatio <= 0.65 ? 2 : 1;
    } else if (effectiveFloor === 5) {
      nextPhase = hpRatio <= 0.60 ? 2 : 1;
    } else if (effectiveFloor === 6) {
      nextPhase = hpRatio <= 0.35 ? 3 : hpRatio <= 0.65 ? 2 : 1;
    } else if (effectiveFloor === 7) {
      nextPhase = hpRatio <= 0.55 ? 2 : 1;
    } else if (effectiveFloor === 8) {
      nextPhase = hpRatio <= 0.35 ? 3 : hpRatio <= 0.70 ? 2 : 1;
    } else if (effectiveFloor === 9) {
      nextPhase = hpRatio <= 0.55 ? 2 : 1;
    } else if (effectiveFloor === 10) {
      nextPhase = hpRatio <= 0.40 ? 3 : hpRatio <= 0.70 ? 2 : 1;
    }

    if (nextPhase > meta.bossPhase) {
      meta.bossPhase = nextPhase;
      this.emitEvent('status', boss.x, boss.y - boss.radius - 28, `PHASE ${nextPhase}!`, '#FBBF24');
      this.pushSystemChat(`${boss.name} shifts to Phase ${nextPhase}!`);
    }

    // Conditional summons ONLY for bosses whose identity benefits from them, never on top of players or mid-charge
    const curWave = boss.summonWave || 0;
    const canSummonSafely =
      !boss.charging &&
      !this.zones.some(
        (z) =>
          z.ownerId === boss.id &&
          z.ttlMs <= 500 &&
          (z.kind === 'warden_edict' || z.kind === 'supernova' || z.kind === 'censer_sweep')
      );

    if (canSummonSafely) {
      if (effectiveFloor === 2) {
        if (hpRatio <= 0.75 && curWave < 1) {
          boss.summonWave = 1;
          this.summonBossAdds(boss, bossRoom, ['cultist', 'skeleton'], 0.70, 2);
        } else if (hpRatio <= 0.40 && curWave < 2) {
          boss.summonWave = 2;
          this.summonBossAdds(boss, bossRoom, ['cultist', 'skeleton'], 0.70, 2);
        }
      } else if (effectiveFloor === 3 && hpRatio <= 0.55 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ['knight', 'cultist'], 0.65, 2);
      } else if (effectiveFloor === 4 && hpRatio <= 0.55 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ['shadow_stalker', 'shadow_stalker'], 0.60, 2);
      } else if (effectiveFloor === 5 && hpRatio <= 0.50 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ['astral_sentinel'], 0.70, 1);
      } else if (effectiveFloor === 7 && hpRatio <= 0.45 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ['relic_golem'], 0.75, 1);
      } else if (effectiveFloor === 8 && hpRatio <= 0.55 && curWave < 1) {
        boss.summonWave = 1;
        this.summonBossAdds(boss, bossRoom, ['veiled_heretic', 'veiled_heretic'], 0.60, 2);
      }
      // Floors 1 (Malakor), 6 (Elyndor), 9 (Seraphel), and 10 (Oriphiel) do NOT spawn regular summon waves.
    }

    const target = this.selectBossTarget(boss, fallbackNearest, bossRoom);
    const dx = target.x - boss.x;
    const dy = target.y - boss.y;
    const targetDist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const isEnraged = Boolean(boss.enraged);
    const baseSpd = isEnraged ? 142 : 110;
    const spd = baseSpd * slowFactor;

    // Bull rush charge execution (Warden Malakor Phase 2)
    if (boss.charging) {
      if ((boss.chargeWindupMs || 0) > 0) {
        boss.state = 'windup';
        boss.chargeWindupMs = Math.max(0, (boss.chargeWindupMs || 0) - dtMs);
        // Track slightly during early charge telegraph so players can't sidestep with 1px
        if (boss.chargeWindupMs > 260) {
          const leadPt = this.predictTargetPosition(target, 0.35, bossRoom);
          boss.chargeAngle = Math.atan2(leadPt.y - boss.y, leadPt.x - boss.x);
        }
        boss.vx = 0;
        boss.vy = 0;
        return;
      }
      boss.state = 'charge';
      boss.chargeTimerMs = (boss.chargeTimerMs || 0) - dtMs;
      const chargeSpd = 295 * slowFactor;
      const cAngle = boss.chargeAngle ?? angle;
      boss.vx = Math.cos(cAngle) * chargeSpd;
      boss.vy = Math.sin(cAngle) * chargeSpd;
      const preX = boss.x;
      const preY = boss.y;
      this.moveWithCollision(
        boss,
        boss.vx * dtSec,
        boss.vy * dtSec,
        24
      );
      for (const pr of this.players.values()) {
        if (
          !pr.state.downed &&
          !meta.chargeHitPlayerIds.has(pr.state.id) &&
          Math.hypot(pr.state.x - boss.x, pr.state.y - boss.y) <= boss.radius + 16
        ) {
          meta.chargeHitPlayerIds.add(pr.state.id);
          this.damagePlayer(pr.state, 20 + floorNum * 4, 'physical');
          this.applyPlayerStatus(pr.state, 'guard_broken', 4000);
        }
      }
      // Stop charge cleanly if slammed into a wall so Malakor doesn't grind against stone
      const chargeMoved = Math.hypot(boss.x - preX, boss.y - preY);
      if ((boss.chargeTimerMs || 0) <= 0 || (chargeMoved < 0.8 && dtSec > 0.01)) {
        this.clearEnemyChargeState(boss);
        boss.state = 'recover';
        boss.vx = 0;
        boss.vy = 0;
        boss.windupMs = isEnraged ? 750 : 950;
      }
      return;
    }

    const profile = this.getBossCombatProfile(effectiveFloor);
    this.computeSmartBossMove(
      boss,
      target,
      bossRoom,
      profile.archetype,
      profile.preferredMinDist,
      profile.preferredMaxDist,
      meta,
      spd,
      dtSec
    );

    if (boss.windupMs > 0) return;

    if (boss.silencedMs > 0) {
      if (targetDist <= boss.radius + 26) {
        const baseHit = 18 + floorNum * 2;
        this.damagePlayer(target, this.computeEnemyDamage(baseHit, boss), 'physical');
        this.emitEvent('status', boss.x, boss.y - boss.radius - 16, '[SILENCED]', '#C084FC');
        boss.windupMs = isEnraged ? 800 : 1150;
      } else {
        boss.windupMs = 600;
      }
      return;
    }

    const activePlayers = Array.from(this.players.values()).filter((p) => !p.state.downed && p.state.connected);
    const hasLoS = this.hasLineOfSight(boss.x, boss.y, target.x, target.y);
    const standingInHazard = this.isBossHazardPosition(boss.x, boss.y, boss.radius * 0.4);
    const leadPos = this.predictTargetPosition(target, Math.min(0.65, targetDist / 420), bossRoom);
    const leadAngle = Math.atan2(leadPos.y - boss.y, leadPos.x - boss.x);

    if (effectiveFloor === 1) {
      // FLOOR 1 BOSS: Warden Malakor (Combat fundamentals, readable recovery)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        boss.shieldWallMs = 2400;
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 6000;
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' SHIELD WALL!', '#60A5FA');
        for (let off = -0.3; off <= 0.3; off += 0.3) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'slash',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 230,
            vy: Math.sin(a) * 230,
            angle: a,
            radius: 9,
            damage: 18,
            pierce: 1,
            ttlMs: 1400,
          });
        }
        boss.windupMs = isEnraged ? 900 : 1250;
      } else if (ability === 1) {
        for (let off = -0.28; off <= 0.28; off += 0.28) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'slash',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 255,
            vy: Math.sin(a) * 255,
            angle: a,
            radius: 10,
            damage: 22,
            pierce: 1,
            ttlMs: 1600,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' CLEAVE!', '#EF4444');
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        const slamPt = this.predictTargetPosition(target, 0.55, bossRoom);
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'boss_slam',
          x: slamPt.x,
          y: slamPt.y,
          radius: 84,
          ttlMs: isEnraged ? 800 : 950,
          maxTtlMs: isEnraged ? 800 : 950,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' GROUND SLAM!', '#F59E0B');
        boss.windupMs = isEnraged ? 850 : 1150;
      } else {
        const chargePt = this.predictTargetPosition(target, 0.45, bossRoom);
        boss.charging = true;
        boss.chargeAngle = Math.atan2(chargePt.y - boss.y, chargePt.x - boss.x);
        boss.chargeWindupMs = 550;
        boss.chargeTimerMs = 560;
        boss.state = 'windup';
        boss.vx = 0;
        boss.vy = 0;
        meta.chargeHitPlayerIds.clear();
        meta.bossAbilityCooldowns[3] = this.simTimeMs + 3400;
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, 'WAR CHARGE!', '#F59E0B');
        boss.windupMs = 0;
      }
    } else if (effectiveFloor === 2) {
      // FLOOR 2 BOSS: Archlich Vaelor (Add management & necrotic control)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 2, 3];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let k = 0; k < 3; k++) {
          const targetState = activePlayers[k % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.55, bossRoom);
          const offsetX = k === 0 ? 0 : k === 1 ? -75 : 75;
          const offsetY = k === 0 ? 0 : k === 1 ? 55 : -55;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'frost_nova',
            x: pred.x + offsetX,
            y: pred.y + offsetY,
            radius: 70,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' FROST NOVA!', '#38BDF8');
        boss.windupMs = isEnraged ? 850 : 1150;
      } else if (ability === 1) {
        // Soul Siphon Tether: Close-range drain with ranged kiting counterplay
        meta.bossAbilityCooldowns[1] = this.simTimeMs + 4200;
        if (targetDist <= 165) {
          this.damagePlayer(target, 20 + floorNum * 2, 'elemental');
          boss.hp = Math.min(boss.maxHp, boss.hp + 40);
          this.emitEvent('status', target.x, target.y - 14, 'SOUL SIPHONED!', '#A855F7');
          this.emitEvent('heal', boss.x, boss.y - boss.radius - 16, '+40', '#34D399');
        } else {
          for (let k = -1; k <= 1; k++) {
            const a = leadAngle + k * 0.22;
            this.spawnProjectile({
              ownerType: 'enemy',
              ownerId: boss.id,
              style: 'voidorb',
              x: boss.x,
              y: boss.y,
              vx: Math.cos(a) * 225,
              vy: Math.sin(a) * 225,
              angle: a,
              radius: 8,
              damage: 18 + floorNum * 2,
              pierce: 1,
              ttlMs: 1900,
            });
          }
          this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' SIPHON VOLLEY!', '#A855F7');
        }
        boss.windupMs = isEnraged ? 800 : 1050;
      } else if (ability === 2) {
        for (let k = 0; k < 5; k++) {
          const a = leadAngle + (k - 2) * 0.24;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'voidorb',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 235,
            vy: Math.sin(a) * 235,
            angle: a,
            radius: 8,
            damage: 22,
            pierce: 1,
            ttlMs: 2200,
            statusOnHit: 'frostbite',
            statusDurationMs: 4000,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' SOUL HAIL!', '#A855F7');
        boss.windupMs = isEnraged ? 800 : 1050;
      } else {
        const count = meta.bossPhase >= 3 || isEnraged ? 14 : 11;
        for (let k = 0; k < count; k++) {
          const a = (k * Math.PI * 2) / count;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'voidorb',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 225,
            vy: Math.sin(a) * 225,
            angle: a,
            radius: 7,
            damage: 20,
            pierce: 1,
            ttlMs: 2000,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' DEATH RING!', '#A855F7');
        boss.windupMs = isEnraged ? 850 : 1200;
      }
    } else if (effectiveFloor === 3) {
      // FLOOR 3 BOSS: Ignis, Cinder Sovereign (Area control with clear safe zones)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let k = 0; k < 3; k++) {
          const targetState = activePlayers[k % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.55, bossRoom);
          const sepAngle = (k * Math.PI * 2) / 3;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'magma_pillar',
            x: pred.x + (k === 0 ? 0 : Math.cos(sepAngle) * 78),
            y: pred.y + (k === 0 ? 0 : Math.sin(sepAngle) * 78),
            radius: 80,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' MAGMA ERUPTION!', '#EF4444');
        boss.windupMs = isEnraged ? 850 : 1150;
      } else if (ability === 1) {
        for (let off = -0.36; off <= 0.36; off += 0.18) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'fireball',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 255,
            vy: Math.sin(a) * 255,
            angle: a,
            radius: 9,
            damage: 24,
            pierce: 1,
            ttlMs: 1800,
            statusOnHit: 'scorched',
            statusDurationMs: 4000,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' FISSURE WAVE!', '#F97316');
        boss.windupMs = isEnraged ? 750 : 1000;
      } else if (ability === 2) {
        const count = isEnraged ? 16 : 12;
        const rot = Math.random() * Math.PI;
        for (let k = 0; k < count; k++) {
          const a = rot + (k * Math.PI * 2) / count;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'fireball',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 265,
            vy: Math.sin(a) * 265,
            angle: a,
            radius: 9,
            damage: 25,
            pierce: 1,
            ttlMs: 2400,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' CINDER SPIRAL!', '#F59E0B');
        boss.windupMs = isEnraged ? 800 : 1150;
      } else {
        meta.bossAbilityCooldowns[3] = this.simTimeMs + 3500;
        const detPt = this.predictTargetPosition(target, 0.6, bossRoom);
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'magma_pillar',
          x: detPt.x,
          y: detPt.y,
          radius: 105,
          ttlMs: isEnraged ? 850 : 1050,
          maxTtlMs: isEnraged ? 850 : 1050,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' CORE DETONATION!', '#EF4444');
        boss.windupMs = isEnraged ? 850 : 1100;
      }
    } else if (effectiveFloor === 4) {
      // FLOOR 4 BOSS: Void-Eater Malice (Positioning & displacement, tactical flanking Void Step)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [1, 3];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 3500;
        const singPt = this.predictTargetPosition(target, 0.45, bossRoom);
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'singularity',
          x: singPt.x,
          y: singPt.y,
          radius: 112,
          ttlMs: 1800,
          maxTtlMs: 1800,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' SINGULARITY!', '#A855F7');
        boss.windupMs = isEnraged ? 900 : 1250;
      } else if (ability === 1) {
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI * 2) / 6 + leadAngle;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'voidorb',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 305,
            vy: Math.sin(a) * 305,
            angle: a,
            radius: 8,
            damage: 26,
            pierce: 1,
            ttlMs: 1800,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' TENDRIL FLURRY!', '#C084FC');
        boss.windupMs = isEnraged ? 750 : 1000;
      } else if (ability === 2) {
        // Void Step: Tactical flanking teleport behind target's aim angle with verified LoS, clear of walls/hazards/players
        meta.bossAbilityCooldowns[2] = this.simTimeMs + 3500;
        let stepped = false;
        const flankBaseTheta = (target.aimAngle ?? angle) + Math.PI;
        const candidateOffsets = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.2, -2.2, Math.PI];
        for (const dist of [115, 95, 145]) {
          for (const off of candidateOffsets) {
            const theta = flankBaseTheta + off;
            const cx = target.x + Math.cos(theta) * dist;
            const cy = target.y + Math.sin(theta) * dist;
            const tx = Math.floor(cx / TILE_SIZE);
            const ty = Math.floor(cy / TILE_SIZE);
            const inRoom = bossRoom
              ? tx >= bossRoom.x + 1 && tx < bossRoom.x + bossRoom.w - 1 && ty >= bossRoom.y + 1 && ty < bossRoom.y + bossRoom.h - 1
              : true;
            if (!inRoom || this.collidesCircle(cx, cy, boss.radius)) continue;
            if (this.isBossHazardPosition(cx, cy, boss.radius)) continue;
            if (!this.hasLineOfSight(cx, cy, target.x, target.y)) continue;
            const farFromPlayers = activePlayers.every((p) => Math.hypot(cx - p.state.x, cy - p.state.y) >= 65);
            if (farFromPlayers) {
              boss.x = cx;
              boss.y = cy;
              stepped = true;
              break;
            }
          }
          if (stepped) break;
        }
        const postStepPred = this.predictTargetPosition(target, 0.35, bossRoom);
        const newAngle = Math.atan2(postStepPred.y - boss.y, postStepPred.x - boss.x);
        for (let off = -0.4; off <= 0.4; off += 0.2) {
          const a = newAngle + off;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'voidorb',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 285,
            vy: Math.sin(a) * 285,
            angle: a,
            radius: 8,
            damage: 29,
            pierce: 1,
            ttlMs: 1800,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, stepped ? ' VOID STEP!' : ' VOID SCYTHE!', '#E879F9');
        boss.windupMs = isEnraged ? 750 : 1000;
      } else {
        const count = meta.bossPhase >= 3 || isEnraged ? 18 : 14;
        for (let k = 0; k < count; k++) {
          const a = (k * Math.PI * 2) / count;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'voidorb',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 275,
            vy: Math.sin(a) * 275,
            angle: a,
            radius: 8,
            damage: 28,
            pierce: 1,
            ttlMs: 2200,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' ABYSSAL NOVA!', '#C084FC');
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 5) {
      // FLOOR 5 BOSS: Archon of Nothingness (Spatial pattern recognition)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 4500;
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'supernova',
          x: boss.x,
          y: boss.y,
          radius: 145,
          ttlMs: 1350,
          maxTtlMs: 1350,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' SUPERNOVA!', '#F472B6');
        boss.windupMs = isEnraged ? 900 : 1300;
      } else if (ability === 1) {
        for (let k = 0; k < 4; k++) {
          const targetState = activePlayers[k % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.5, bossRoom);
          const beamAngle = (k * Math.PI) / 2;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'starlight_beam',
            x: pred.x + (k === 0 ? 0 : Math.cos(beamAngle) * 48),
            y: pred.y + (k === 0 ? 0 : Math.sin(beamAngle) * 48),
            radius: 68,
            ttlMs: 900,
            maxTtlMs: 900,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' STARBEAM CASCADE!', '#38BDF8');
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        for (let k = -2; k <= 3; k++) {
          const a = leadAngle + k * 0.16;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'arcane',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 320,
            vy: Math.sin(a) * 320,
            angle: a,
            radius: 7,
            damage: 28,
            pierce: 1,
            ttlMs: 2000,
            statusOnHit: 'disoriented',
            statusDurationMs: 3000,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' COSMIC VOLLEY!', '#818CF8');
        boss.windupMs = isEnraged ? 750 : 1000;
      } else {
        const count = isEnraged ? 20 : 16;
        const rot = Math.random() * Math.PI;
        for (let k = 0; k < count; k++) {
          const a = rot + (k * Math.PI * 2) / count;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'arcane',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 305,
            vy: Math.sin(a) * 305,
            angle: a,
            radius: 8,
            damage: 31,
            pierce: 1,
            ttlMs: 2400,
          });
        }
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 6) {
      // FLOOR 6 BOSS: Elyndor, Keeper of the Last Hymn (3 Musical Movements, NO regular summon waves)
      const avail = meta.bossPhase >= 3 ? [0, 1, 2, 3] : meta.bossPhase === 2 ? [0, 1, 2] : [0, 1];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let lane = -1; lane <= 1; lane++) {
          const perpX = Math.cos(leadAngle + Math.PI / 2) * (lane * 54);
          const perpY = Math.sin(leadAngle + Math.PI / 2) * (lane * 54);
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'sound_lane',
            x: boss.x + perpX,
            y: boss.y + perpY,
            width: 340,
            height: 36,
            angle: leadAngle,
            radius: 170,
            ttlMs: isEnraged ? 800 : 1000,
            maxTtlMs: isEnraged ? 800 : 1000,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' RESONANT CRESCENDO!', '#F59E0B');
        boss.windupMs = isEnraged ? 800 : 1150;
      } else if (ability === 1) {
        for (const pr of activePlayers) {
          const pred = this.predictTargetPosition(pr.state, 0.55, bossRoom);
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'lament_mark',
            x: pred.x,
            y: pred.y,
            radius: 64,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' LAMENT OF THE FORGOTTEN!', '#FEF08A');
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 2) {
        for (let c = -1; c <= 1; c++) {
          const echoAngle = leadAngle + c * 0.45;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'sound_lane',
            x: boss.x + Math.cos(echoAngle) * 80,
            y: boss.y + Math.sin(echoAngle) * 80,
            width: 380,
            height: 34,
            angle: echoAngle,
            radius: 190,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' DIVINE CHORUS BEAMS!', '#FBBF24');
        boss.windupMs = isEnraged ? 750 : 1050;
      } else {
        for (let lane = -2; lane <= 2; lane++) {
          const crAngle = (lane * Math.PI) / 5;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'sound_lane',
            x: boss.x,
            y: boss.y,
            width: 400,
            height: 32,
            angle: crAngle,
            radius: 200,
            ttlMs: isEnraged ? 950 : 1100,
            maxTtlMs: isEnraged ? 950 : 1100,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' CHORUS OF REMEMBRANCE!', '#FEF08A');
        boss.windupMs = isEnraged ? 850 : 1200;
      }
    } else if (effectiveFloor === 7) {
      // FLOOR 7 BOSS: Zadkiel, Keeper of the Ashen Reliquary (Defensive windows & censer sweeps)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1, 2];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 4200;
        for (let c = 0; c < 2; c++) {
          const offX = c === 0 ? -55 : 55;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'ashen_cloud',
            x: (c === 0 ? boss.x : leadPos.x) + offX,
            y: (c === 0 ? boss.y : leadPos.y) + (c === 0 ? -35 : 35),
            radius: 82,
            ttlMs: 3200,
            maxTtlMs: 3200,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' ASHEN PROCESSION!', '#D9AA52');
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 1) {
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'censer_sweep',
          x: boss.x,
          y: boss.y,
          angle: leadAngle,
          radius: 155,
          ttlMs: isEnraged ? 850 : 1050,
          maxTtlMs: isEnraged ? 850 : 1050,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' CHAIN OF THE DEPARTED!', '#F59E0B');
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        for (let m = 0; m < 3; m++) {
          const rAngle = leadAngle + (m - 1) * 0.65;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'lament_mark',
            x: boss.x + Math.cos(rAngle) * 115,
            y: boss.y + Math.sin(rAngle) * 115,
            radius: 68,
            ttlMs: 900,
            maxTtlMs: 900,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' RELIQUARY AWAKENING!', '#E2E8F0');
        boss.windupMs = isEnraged ? 750 : 1050;
      } else {
        // Brief readable Relic Aegis stance on 8s cooldown
        if ((meta.bossAbilityCooldowns[99] ?? 0) <= this.simTimeMs) {
          boss.shieldWallMs = 1500;
          meta.bossAbilityCooldowns[99] = this.simTimeMs + 8000;
          this.emitEvent('status', boss.x, boss.y - boss.radius - 30, ' RELIQUARY AEGIS!', '#CBD5E1');
        }
        for (let off = -0.3; off <= 0.3; off += 0.3) {
          const a = leadAngle + off;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: 'radiant',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 330,
            vy: Math.sin(a) * 330,
            angle: a,
            radius: 10,
            damage: 34,
            pierce: 2,
            ttlMs: 1800,
            statusOnHit: 'ashen_curse',
            statusDurationMs: 4500,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' JUDGMENT OF THE DEPARTED!', '#FEF08A');
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 8) {
      // FLOOR 8 BOSS: Sariel, Warden of the Veiled Scripture (Controlled silence pressure)
      const avail = meta.bossPhase >= 3 ? [0, 1, 2, 3] : meta.bossPhase === 2 ? [0, 1, 2] : [0, 1];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        for (let line = -1; line <= 1; line++) {
          const gridAngle = line === 0 ? leadAngle : leadAngle + Math.PI / 2;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'scripture_line',
            x: boss.x,
            y: boss.y,
            width: 420,
            height: 26,
            angle: gridAngle,
            radius: 210,
            ttlMs: isEnraged ? 800 : 950,
            maxTtlMs: isEnraged ? 800 : 950,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' SCRIPTURE OF BINDING!', '#E879F9');
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 1) {
        for (let v = 1; v <= 4; v++) {
          const pageAngle = leadAngle + (v - 2.5) * 0.34;
          const dist = 65 + v * 36;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'lancefall_mark',
            x: boss.x + Math.cos(pageAngle) * dist,
            y: boss.y + Math.sin(pageAngle) * dist,
            radius: 60,
            seqNumber: v,
            ttlMs: 700 + v * 220,
            maxTtlMs: 700 + v * 220,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' FORBIDDEN VERSES!', '#A855F7');
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 2) {
        meta.bossAbilityCooldowns[2] = this.simTimeMs + 5000;
        for (const pr of activePlayers) {
          const pred = this.predictTargetPosition(pr.state, 0.55, bossRoom);
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'silence_seal',
            x: pred.x,
            y: pred.y,
            radius: 72,
            ttlMs: isEnraged ? 950 : 1150,
            maxTtlMs: isEnraged ? 950 : 1150,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' SEAL OF SILENCE!', '#C084FC');
        boss.windupMs = isEnraged ? 850 : 1150;
      } else {
        const count = isEnraged ? 20 : 16;
        for (let k = 0; k < count; k++) {
          const a = (k * Math.PI * 2) / count;
          this.spawnProjectile({
            ownerType: 'enemy',
            ownerId: boss.id,
            style: k % 2 === 0 ? 'radiant' : 'voidorb',
            x: boss.x,
            y: boss.y,
            vx: Math.cos(a) * 280,
            vy: Math.sin(a) * 280,
            angle: a,
            radius: 8,
            damage: 30,
            pierce: 1,
            ttlMs: 2200,
            statusOnHit: 'silenced',
            statusDurationMs: 2600,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' HERETICAL VOLLEY!', '#F43F5E');
        boss.windupMs = isEnraged ? 800 : 1150;
      }
    } else if (effectiveFloor === 9) {
      // FLOOR 9 BOSS: Seraphel, Sentinel of the Final Seal (Precision & Lance mobility, NO summons)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [0, 1];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'lance_thrust',
          x: boss.x,
          y: boss.y,
          width: 380,
          height: 42,
          angle: leadAngle,
          radius: 190,
          ttlMs: isEnraged ? 750 : 900,
          maxTtlMs: isEnraged ? 750 : 900,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, " HEAVEN'S PIERCING LINE!", '#FDE047');
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 1) {
        for (let l = 1; l <= 4; l++) {
          const targetState = activePlayers[(l - 1) % Math.max(1, activePlayers.length)]?.state || target;
          const pred = this.predictTargetPosition(targetState, 0.35 + l * 0.1, bossRoom);
          const offsetX = l === 1 ? -30 : l === 2 ? 30 : l === 3 ? -15 : 15;
          const offsetY = l === 1 ? -15 : l === 2 ? 15 : l === 3 ? 30 : -30;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'lancefall_mark',
            x: pred.x + offsetX,
            y: pred.y + offsetY,
            radius: 64,
            seqNumber: l,
            ttlMs: 700 + l * 250,
            maxTtlMs: 700 + l * 250,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' LANCEFALL SEQUENCE!', '#FBBF24');
        boss.windupMs = isEnraged ? 800 : 1100;
      } else if (ability === 2) {
        for (let d = -1; d <= 1; d++) {
          const diveAngle = leadAngle + d * 0.35;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'lance_thrust',
            x: boss.x,
            y: boss.y,
            width: 320,
            height: 36,
            angle: diveAngle,
            radius: 160,
            ttlMs: 750 + Math.abs(d) * 200,
            maxTtlMs: 750 + Math.abs(d) * 200,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' AERIAL JUDGMENT!', '#38BDF8');
        boss.windupMs = isEnraged ? 750 : 1000;
      } else {
        for (let l = 1; l <= 6; l++) {
          const spAngle = (l * Math.PI * 2) / 6;
          const dist = 95;
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'lancefall_mark',
            x: boss.x + Math.cos(spAngle) * dist,
            y: boss.y + Math.sin(spAngle) * dist,
            radius: 64,
            seqNumber: l,
            ttlMs: 700 + l * 180,
            maxTtlMs: 700 + l * 180,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' SENTINEL SPEARFALL CASCADE!', '#FBBF24');
        boss.windupMs = isEnraged ? 800 : 1100;
      }
    } else if (effectiveFloor === 10 || isWardenGate) {
      // FLOOR 10 BOSS: Oriphiel, The Last Warden (Final Mastery Test, NO regular summons)
      const avail = meta.bossPhase >= 2 ? [0, 1, 2, 3] : [2, 3];
      const ability = this.pickSmartBossAbility(effectiveFloor, avail, meta, boss, target, targetDist, activePlayers, hasLoS, standingInHazard);
      if (ability === 0) {
        meta.bossAbilityCooldowns[0] = this.simTimeMs + 4200;
        let tAng = Math.atan2(target.y - boss.y, target.x - boss.x);
        if (tAng < 0) tAng += Math.PI * 2;
        const playerQuad = Math.floor(tAng / (Math.PI / 2)) % 4;
        // Prefer the opposite safe quadrant so players must reposition, checking it's walkable
        let safeQuad = (playerQuad + 2) % 4;
        for (let attempt = 0; attempt < 4; attempt++) {
          const q = (playerQuad + 2 + attempt) % 4;
          const midAng = (q + 0.5) * (Math.PI / 2);
          const checkX = boss.x + Math.cos(midAng) * 110;
          const checkY = boss.y + Math.sin(midAng) * 110;
          if (!this.isWallAtWorld(checkX, checkY)) {
            safeQuad = q;
            break;
          }
        }
        for (let q = 0; q < 4; q++) {
          if (q !== safeQuad) {
            this.zones.push({
              id: this.nextId('zone'),
              kind: 'warden_edict',
              x: boss.x,
              y: boss.y,
              radius: 220,
              quadrant: q,
              ttlMs: isEnraged ? 1150 : 1400,
              maxTtlMs: isEnraged ? 1150 : 1400,
              ownerId: boss.id,
            });
          }
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 20, " WARDEN'S EDICT! FIND SAFE QUADRANT!", '#EF4444');
        boss.windupMs = isEnraged ? 900 : 1250;
      } else if (ability === 1) {
        meta.bossAbilityCooldowns[1] = this.simTimeMs + 7500;
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'warden_parry',
          x: boss.x,
          y: boss.y,
          radius: 65,
          ttlMs: 2100,
          maxTtlMs: 2100,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' UNBROKEN JUDGMENT! (AEGIS PARRY)', '#F59E0B');
        boss.windupMs = isEnraged ? 750 : 1050;
      } else if (ability === 2) {
        const stages = meta.bossPhase >= 3 || isEnraged ? 3 : 2;
        for (let st = 1; st <= stages; st++) {
          this.zones.push({
            id: this.nextId('zone'),
            kind: 'verdict_combo',
            x: boss.x + Math.cos(leadAngle) * (st * 40),
            y: boss.y + Math.sin(leadAngle) * (st * 40),
            radius: 80 + st * 25,
            stage: st,
            ttlMs: 650 + st * 350,
            maxTtlMs: 650 + st * 350,
            ownerId: boss.id,
          });
        }
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' THE FINAL VERDICT COMBO!', '#FEF08A');
        boss.windupMs = isEnraged ? 850 : 1150;
      } else {
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'warden_shatter',
          x: boss.x,
          y: boss.y,
          radius: 190,
          ttlMs: 1400,
          maxTtlMs: 1400,
          ownerId: boss.id,
        });
        this.emitEvent('status', boss.x, boss.y - boss.radius - 18, ' BASTION GROUND SHATTER!', '#FBBF24');
        boss.windupMs = isEnraged ? 800 : 1100;
      }
    }
  }

  private summonBossAdds(
    boss: EnemyState,
    bossRoom: RoomNode | undefined,
    kinds: EnemyKind[],
    hpRatioScale = 0.70,
    maxLiveAdds = 2
  ): void {
    const existingAdds = this.enemies.filter((e) => e.id.startsWith('add_') && e.hp > 0).length;
    const roomSlots = Math.max(0, maxLiveAdds - existingAdds);
    if (roomSlots <= 0 || kinds.length === 0) return;

    const toSpawn = Math.min(kinds.length, roomSlots);
    const activePlayers = Array.from(this.players.values()).filter((p) => p.state.connected && !p.state.downed);

    this.emitEvent('status', boss.x, boss.y - boss.radius - 20, ' REINFORCEMENTS!', '#F59E0B');
    this.pushSystemChat(`${boss.name} calls forth reinforcements!`);

    for (let i = 0; i < toSpawn; i++) {
      const minionKind = kinds[i % kinds.length];
      let spawnX = boss.x;
      let spawnY = boss.y;
      let foundSafe = false;

      // Search concentric ring positions around boss: clear of walls, inside boss room, and >= 65px away from players
      for (let dist = 85; dist <= 135 && !foundSafe; dist += 25) {
        for (let step = 0; step < 8; step++) {
          const ang = (step * Math.PI * 2) / 8 + i * 0.9;
          const cx = boss.x + Math.cos(ang) * dist;
          const cy = boss.y + Math.sin(ang) * dist;
          const tx = Math.floor(cx / TILE_SIZE);
          const ty = Math.floor(cy / TILE_SIZE);
          const inRoom = bossRoom
            ? tx >= bossRoom.x + 1 && tx < bossRoom.x + bossRoom.w - 1 && ty >= bossRoom.y + 1 && ty < bossRoom.y + bossRoom.h - 1
            : true;
          if (!inRoom || this.collidesCircle(cx, cy, 16)) continue;
          const clearOfPlayers = activePlayers.every((p) => Math.hypot(cx - p.state.x, cy - p.state.y) >= 65);
          if (clearOfPlayers) {
            spawnX = cx;
            spawnY = cy;
            foundSafe = true;
            break;
          }
        }
      }

      if (!foundSafe) continue;

      const add = makeEnemy(
        `add_${this.floor}_${this.entitySeq++}`,
        minionKind,
        boss.roomId,
        spawnX,
        spawnY,
        hpRatioScale * (1 + (this.floor - 1) * 0.28),
        false, // Non-elite tuned role adds so the boss stays the primary threat
        this.floor,
        this.map.biome
      );
      add.name = `Summoned ${add.name}`;
      this.enemies.push(add);
    }
  }

  public damageEnemy(
    enemy: EnemyState,
    rawAmount: number,
    attacker: PlayerState | null,
    isCrit: boolean | DamageCategory = false,
    category?: DamageCategory,
    isPrimaryAttack = false
  ): number {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1 || enemy.hp <= 0) return 0;

    const isCritBool = typeof isCrit === 'boolean' ? isCrit : false;
    const cat: DamageCategory =
      (typeof isCrit === 'string' ? isCrit : category) ||
      (attacker
        ? attacker.heroClass === 'arcanist'
          ? 'arcane'
          : attacker.heroClass === 'cleric'
            ? 'divine'
            : 'physical'
        : 'physical');

    const attackerWeapon = attacker
      ? resolveEquippedWeaponForClass(attacker.heroClass, attacker.equippedWeapon)?.modifiers
      : undefined;

    const targetRes = GameRoom.getEnemyResistance(enemy.resistances, cat);
    const markBonus = enemy.markedMs > 0 ? 1.35 : 1.0;
    let finalDmg = Math.max(1, Math.round(rawAmount * (1 - targetRes) * markBonus));

    // Weapon undead/cultist/boss primary bonus
    if (
      isPrimaryAttack &&
      attackerWeapon?.undeadBossBonusPct &&
      (enemy.kind === 'boss' ||
        enemy.kind === 'skeleton' ||
        enemy.kind === 'cultist' ||
        enemy.kind === 'hymn_phantom' ||
        enemy.kind === 'veiled_heretic' ||
        enemy.kind === 'astral_sentinel')
    ) {
      finalDmg = Math.max(1, Math.round(finalDmg * (1 + attackerWeapon.undeadBossBonusPct)));
    }

    // Boss Sanctum Wards: Each uncleared side combat room shields the boss (-12% dmg taken per ward, max -48%)
    if (enemy.kind === 'boss' && this.floor > 0) {
      const activeWards = this.getBossWards();
      if (activeWards > 0) {
        const wardMitigation = Math.min(0.48, activeWards * 0.12);
        finalDmg = Math.max(1, Math.round(finalDmg * (1 - wardMitigation)));
      }
    }

    // Floor 6: Elyndor Charmed Trance - Mesmerized player deals 35% reduced outgoing damage
    if (attacker && attacker.statuses && attacker.statuses.some(s => s.type === 'charmed')) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.65));
    }

    // Warden Malakor Shield Wall Damage Mitigation (-60%)
    if (enemy.shieldWallMs && enemy.shieldWallMs > 0) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.4));
    }

    const attackerActivePassive = attacker ? this.getActivePassive(attacker) : null;

    // Oriphiel Aegis Parry Stance: Reflect 85% damage back to attacking player unless Hard CC'd
    const isParrying =
      enemy.stunnedMs <= 0 &&
      enemy.frozenMs <= 0 &&
      this.zones.some((z) => z.kind === 'warden_parry' && z.ownerId === enemy.id);
    if (isParrying && attacker) {
      const reflectDmg = Math.round(rawAmount * 0.85);
      this.damagePlayer(attacker, reflectDmg, 'divine');
      this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, 'AEGIS PARRY & REFLECTED!', '#F59E0B');
      return 0;
    }

    // Ranger Default Passive: Eagle Keenness (+25% + Ashwood Longshot bonus beyond 180px)
    let effectiveCrit = isCritBool;
    if (attacker && attackerActivePassive === 'eagle_keenness') {
      const distToTarget = Math.hypot(enemy.x - attacker.x, enemy.y - attacker.y);
      if (distToTarget >= 180) {
        const longshotBonus = 0.25 + (attackerWeapon?.longshotBonusPct || 0);
        finalDmg = Math.round(finalDmg * (1 + longshotBonus));
        effectiveCrit = true;
        this.emitEvent('crit', enemy.x, enemy.y - enemy.radius - 22, ` LONGSHOT! (+${Math.round(longshotBonus * 100)}%)`, '#34D399');
      }
    }

    // Ranger Briarheart Passive: Predator's Instinct (focusing same target increases damage, switching resets)
    if (attacker && attackerActivePassive === 'predators_instinct') {
      const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
      if (attacker.predatorTargetId !== enemy.id) {
        attacker.predatorTargetId = enemy.id;
        attacker.predatorStacks = 0;
      } else if ((attacker.predatorStacks || 0) > 0) {
        finalDmg = Math.max(
          1,
          Math.round(finalDmg * (1 + (attacker.predatorStacks || 0) * predCfg.damagePerStackPct))
        );
      }
    }

    // Freeze Shatter Mechanics (Tuned: 1.4x hit damage, 35% frost AoE splash)
    let shattered = false;
    if (enemy.frozenMs > 0) {
      enemy.frozenMs = 0;
      finalDmg = Math.round(finalDmg * 1.4);
      shattered = true;
      this.emitEvent('crit', enemy.x, enemy.y - enemy.radius - 20, ' SHATTER!', '#38BDF8');

      // AoE Frost Shatter wave to adjacent enemies (soft slow does not consume hard-CC DR)
      const shatterTargets = [...this.enemies];
      for (const other of shatterTargets) {
        if (other !== enemy && other.hp > 0 && this.enemies.includes(other) && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 85) {
          const otherRes = GameRoom.getEnemyResistance(other.resistances, 'frost');
          const otherMark = other.markedMs > 0 ? 1.35 : 1.0;
          const aoeDmg = Math.max(1, Math.round(finalDmg * 0.35 * (1 - otherRes) * otherMark));
          other.hp -= aoeDmg;
          if (attacker) attacker.damageDealt += aoeDmg;
          this.applySoftCc(other, 2500);
          this.emitEvent('damage', other.x, other.y - 10, `${aoeDmg}`, getDamageTypeColor('frost', false), 'frost');
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
        }
      }
    }

    enemy.hp -= finalDmg;
    if (enemy.kind === 'boss') {
      const bossMeta = this.getEnemyMeta(enemy);
      bossMeta.bossRecentDmgTaken += finalDmg;
      bossMeta.bossRecentDmgAtMs = this.simTimeMs;
    }

    if (attacker) {
      attacker.damageDealt += finalDmg;
      const shieldCap = this.getMaxShieldCap(attacker);

      // Briarheart Predator's Instinct stack gain after confirmed hit
      if (attackerActivePassive === 'predators_instinct') {
        const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
        const predPr = this.players.get(attacker.id);
        attacker.predatorStacks = Math.min(
          predCfg.maxStacks,
          (attacker.predatorStacks || 0) + 1
        );
        if (predPr) predPr.predatorLastHitAtMs = this.simTimeMs;
      }

      // Vanguard Default Passive: Iron Will (+3 Shield when striking CC'd / Burning foes)
      if (attackerActivePassive === 'iron_will') {
        if (enemy.stunnedMs > 0 || enemy.burnedMs > 0 || enemy.frozenMs > 0) {
          if (attacker.shield < shieldCap) {
            attacker.shield = Math.min(shieldCap, attacker.shield + 3);
          }
        }
      }

      // Vanguard Obsidian Passive: War Monger (direct hit Lifesteal: 6% above 30% HP, 50% at or below 30% HP)
      if (attackerActivePassive === 'war_monger' && !attacker.downed && attacker.hp < attacker.maxHp) {
        const wmCfg = ARMAMENT_TUNING.passives.warMonger;
        const hpRatio = attacker.hp / Math.max(1, attacker.maxHp);
        const isLowHp = wmCfg.thresholdInclusive
          ? hpRatio <= wmCfg.lowHpThresholdRatio
          : hpRatio < wmCfg.lowHpThresholdRatio;
        const pct = isLowHp ? wmCfg.atOrBelowThresholdLifestealPct : wmCfg.aboveThresholdLifestealPct;
        const missing = Math.max(0, attacker.maxHp - attacker.hp);
        const lsHeal = Math.min(missing, Math.max(1, Math.round(finalDmg * pct)));
        if (lsHeal > 0) {
          attacker.hp += lsHeal;
          this.emitEvent('heal', attacker.x, attacker.y - 20, `+${lsHeal}`, '#34D399');
        }
      }

      // Permanent Weapon On-Hit Effects (primary attacks only)
      if (isPrimaryAttack && attackerWeapon) {
        if (attackerWeapon.shieldOnPrimaryHit && attacker.shield < shieldCap) {
          attacker.shield = Math.min(shieldCap, attacker.shield + attackerWeapon.shieldOnPrimaryHit);
        }
        const res = enemy.resistances;
        if (attackerWeapon.burnChance && Math.random() < attackerWeapon.burnChance) {
          if (enemy.burnedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'IGNITED!', '#F97316', 3500);
          }
          const fireRes = GameRoom.getEnemyResistance(res, 'fire');
          this.applyDotStatus(enemy, 'burn', attacker, Math.round(4000 * (1 - fireRes * 0.4)));
        }
        if (attackerWeapon.chillChance && Math.random() < attackerWeapon.chillChance) {
          if (enemy.slowedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'CHILLED', '#7DD3FC', 3500);
          }
          this.applySoftCc(enemy, 2500);
        }
        if (attackerWeapon.shockChance && Math.random() < attackerWeapon.shockChance) {
          const lightningRes = GameRoom.getEnemyResistance(res, 'lightning');
          const shockDur = Math.round(3500 * (1 - lightningRes * 0.4));
          if (enemy.shockedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 16, 'SHOCKED!', '#FBBF24', 3500);
          }
          enemy.shockedMs = Math.max(enemy.shockedMs, shockDur);
        }
        if (attackerWeapon.bleedChance && Math.random() < attackerWeapon.bleedChance) {
          if (enemy.bleedingMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'BLEED', '#DC2626', 3500);
          }
          const bleedRes = GameRoom.getEnemyResistance(res, 'bleed');
          this.applyDotStatus(enemy, 'bleed', attacker, Math.round(4000 * (1 - bleedRes * 0.4)));
        }
      }

      // Status Relic Procs with Hybrid DoT Snapshots & Centralized CC DR:
      const res = enemy.resistances;
      // 1. Cinder Heart: Ignite Burn (4.5s duration, refreshes without stacking, hybrid DoT scaled)
      if (attacker.relics.includes('cinder_heart') && (effectiveCrit || rawAmount >= 24)) {
        if (enemy.burnedMs <= 0) {
          this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'IGNITED!', '#F97316', 3500);
        }
        const fireRes = GameRoom.getEnemyResistance(res, 'fire');
        const burnDuration = Math.round(4500 * (1 - fireRes * 0.4));
        this.applyDotStatus(enemy, 'burn', attacker, burnDuration);
      }

      // 2. Rimefrost Shard: Chill (35% chance, 3.0s Soft CC) & Freeze (1.8s base Hard CC via DR)
      if (attacker.relics.includes('rimefrost_shard')) {
        if (enemy.slowedMs > 0 && enemy.frozenMs <= 0 && !shattered) {
          const appliedFreeze = this.applyHardCc(enemy, 'freeze', 1800);
          if (appliedFreeze > 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 16, 'FROZEN!', '#38BDF8', 2000);
          }
        } else if (Math.random() < 0.35) {
          if (enemy.slowedMs <= 0) {
            this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'CHILLED', '#7DD3FC', 3500);
          }
          this.applySoftCc(enemy, 3000);
        }
      }

      // 3. Stormcaller Lodestone: Shock & Chain Lightning
      if (attacker.relics.includes('stormcaller_lodestone')) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            const lightningRes = GameRoom.getEnemyResistance(res, 'lightning');
            const shockDuration = Math.round(5000 * (1 - lightningRes * 0.4));
            if (enemy.shockedMs <= 0) {
              this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 16, 'SHOCKED!', '#FBBF24', 3500);
            }
            enemy.shockedMs = shockDuration;
          }
        }
      }

      // 4. Viper Crucible: Poison & Weaken (6.0s duration, refreshes without stacking, hybrid DoT scaled)
      if (attacker.relics.includes('viper_crucible')) {
        if (enemy.poisonedMs <= 0) {
          this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'POISONED', '#22C55E', 3500);
        }
        const poisonRes = GameRoom.getEnemyResistance(res, 'poison');
        const poisonDuration = Math.round(6000 * (1 - poisonRes * 0.4));
        this.applyDotStatus(enemy, 'poison', attacker, poisonDuration);
      }

      // 5. Bloodletter Talisman: Bleed (5.0s duration, refreshes without stacking, hybrid DoT scaled)
      if (attacker.relics.includes('bloodletter_talisman')) {
        if (enemy.bleedingMs <= 0) {
          this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - enemy.radius - 14, 'BLEED', '#DC2626', 3500);
        }
        const bleedRes = GameRoom.getEnemyResistance(res, 'bleed');
        const bleedDuration = Math.round(5000 * (1 - bleedRes * 0.4));
        this.applyDotStatus(enemy, 'bleed', attacker, bleedDuration);
      }
    }

    // Shocked chain lightning discharge
    if (enemy.shockedMs > 0 && finalDmg > 6) {
      let arcs = 3;
      for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
        if (eIdx >= this.enemies.length) continue;
        const other = this.enemies[eIdx];
        if (!other || other === enemy || other.hp <= 0) continue;
        const dx = other.x - enemy.x;
        const dy = other.y - enemy.y;
        if (dx * dx + dy * dy <= 16900) { // 130^2
          const otherRes = GameRoom.getEnemyResistance(other.resistances, 'lightning');
          const otherMark = other.markedMs > 0 ? 1.35 : 1.0;
          const arcDmg = Math.max(1, Math.round(finalDmg * 0.45 * (1 - otherRes) * otherMark));
          other.hp -= arcDmg;
          if (attacker) attacker.damageDealt += arcDmg;
          this.emitEvent('damage', other.x, other.y - 12, `⚡${arcDmg}`, getDamageTypeColor('lightning', false), 'lightning');
          arcs--;
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
          if (arcs <= 0) break;
        }
      }
    }

    const isCritPop = effectiveCrit || enemy.markedMs > 0;
    this.emitEvent(
      isCritPop ? 'crit' : 'damage',
      enemy.x + (Math.random() * 14 - 7),
      enemy.y - enemy.radius - 6,
      `${finalDmg}${effectiveCrit ? '!' : ''}`,
      getDamageTypeColor(cat, isCritPop),
      cat
    );

    if (enemy.hp <= 0) {
      this.processEnemyDeath(enemy, attacker);
    }

    return finalDmg;
  }

  private damageDummy(
    dummy: TrainingDummyState,
    rawAmount: number,
    attacker: PlayerState | null,
    isCrit = false,
    isPrimaryAttack = false,
    category?: DamageCategory
  ): number {
    const attackerWeapon = attacker
      ? resolveEquippedWeaponForClass(attacker.heroClass, attacker.equippedWeapon)?.modifiers
      : undefined;
    const attackerActivePassive = attacker ? this.getActivePassive(attacker) : null;
    const cat: DamageCategory =
      category ||
      (attacker
        ? attacker.heroClass === 'arcanist'
          ? 'arcane'
          : attacker.heroClass === 'cleric'
            ? 'divine'
            : 'physical'
        : 'physical');
    let finalDmg = Math.max(1, rawAmount);

    if (attacker && attackerActivePassive === 'eagle_keenness') {
      const distToTarget = Math.hypot(dummy.x - attacker.x, dummy.y - attacker.y);
      if (distToTarget >= 180) {
        const longshotBonus = 0.25 + (attackerWeapon?.longshotBonusPct || 0);
        finalDmg = Math.round(finalDmg * (1 + longshotBonus));
        isCrit = true;
        this.emitEvent('crit', dummy.x, dummy.y - 42, ` LONGSHOT! (+${Math.round(longshotBonus * 100)}%)`, '#34D399');
      }
    }

    if (attacker && attackerActivePassive === 'predators_instinct') {
      const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
      if (attacker.predatorTargetId !== dummy.id) {
        attacker.predatorTargetId = dummy.id;
        attacker.predatorStacks = 0;
      } else if ((attacker.predatorStacks || 0) > 0) {
        finalDmg = Math.max(
          1,
          Math.round(finalDmg * (1 + (attacker.predatorStacks || 0) * predCfg.damagePerStackPct))
        );
      }
    }

    dummy.hitAnimMs = 280;
    dummy.lastHitTimerMs = 4000; // Reset counter after 4s of combat inactivity
    dummy.totalDamageTaken = (dummy.totalDamageTaken || 0) + finalDmg;
    dummy.hp = Math.max(1, dummy.hp - finalDmg);

    if (attacker) {
      attacker.damageDealt += finalDmg;
      const shieldCap = this.getMaxShieldCap(attacker);

      if (attackerActivePassive === 'predators_instinct') {
        const predCfg = ARMAMENT_TUNING.passives.predatorsInstinct;
        const predPr = this.players.get(attacker.id);
        attacker.predatorStacks = Math.min(
          predCfg.maxStacks,
          (attacker.predatorStacks || 0) + 1
        );
        if (predPr) predPr.predatorLastHitAtMs = this.simTimeMs;
      }

      if (attackerActivePassive === 'iron_will') {
        if (attacker.shield < shieldCap) {
          attacker.shield = Math.min(shieldCap, attacker.shield + 3);
        }
      }

      if (attackerActivePassive === 'war_monger' && !attacker.downed && attacker.hp < attacker.maxHp) {
        const wmCfg = ARMAMENT_TUNING.passives.warMonger;
        const hpRatio = attacker.hp / Math.max(1, attacker.maxHp);
        const isLowHp = wmCfg.thresholdInclusive
          ? hpRatio <= wmCfg.lowHpThresholdRatio
          : hpRatio < wmCfg.lowHpThresholdRatio;
        const pct = isLowHp ? wmCfg.atOrBelowThresholdLifestealPct : wmCfg.aboveThresholdLifestealPct;
        const missing = Math.max(0, attacker.maxHp - attacker.hp);
        const lsHeal = Math.min(missing, Math.max(1, Math.round(finalDmg * pct)));
        if (lsHeal > 0) {
          attacker.hp += lsHeal;
          this.emitEvent('heal', attacker.x, attacker.y - 20, `+${lsHeal}`, '#34D399');
        }
      }

      if (isPrimaryAttack && attackerWeapon?.shieldOnPrimaryHit && attacker.shield < shieldCap) {
        attacker.shield = Math.min(shieldCap, attacker.shield + attackerWeapon.shieldOnPrimaryHit);
      }
    }

    const text = isCrit ? `${finalDmg} CRIT` : `${finalDmg}`;
    const color = getDamageTypeColor(cat, isCrit);
    this.emitEvent(
      isCrit ? 'crit' : 'damage',
      dummy.x + (Math.random() * 14 - 7),
      dummy.y - 28,
      text,
      color,
      cat
    );

    // Relic & Weapon synergies practice feedback (throttled per dummy so screen never floods)
    if (attacker) {
      if (
        (attacker.relics.includes('cinder_heart') && (isCrit || rawAmount >= 24)) ||
        (isPrimaryAttack && attackerWeapon?.burnChance && Math.random() < attackerWeapon.burnChance)
      ) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'IGNITED!', '#F97316', 3500);
      }
      if (
        (attacker.relics.includes('rimefrost_shard') && Math.random() < 0.35) ||
        (isPrimaryAttack && attackerWeapon?.chillChance && Math.random() < attackerWeapon.chillChance)
      ) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'CHILLED!', '#38BDF8', 3500);
      }
      if (isPrimaryAttack && attackerWeapon?.bleedChance && Math.random() < attackerWeapon.bleedChance) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'BLEED!', '#DC2626', 3500);
      }
      if (isPrimaryAttack && attackerWeapon?.shockChance && Math.random() < attackerWeapon.shockChance) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'SHOCKED!', '#FBBF24', 3500);
      }
      if (attacker.relics.includes('stormcaller_lodestone')) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'SHOCKED!', '#FBBF24', 3500);
            // Arc to other dummy if nearby
            for (const other of this.trainingDummies) {
              if (other.id !== dummy.id && Math.hypot(other.x - dummy.x, other.y - dummy.y) <= 350) {
                this.damageDummy(other, Math.round(finalDmg * 0.5), attacker, false, false, 'lightning');
              }
            }
          }
        }
      }
      if (attacker.relics.includes('viper_crucible')) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'POISONED!', '#22C55E', 3500);
      }
      if (attacker.relics.includes('bloodletter_talisman')) {
        this.emitThrottledEntityStatus(dummy.id, dummy.x, dummy.y - 42, 'LACERATED!', '#DC2626', 3500);
      }
    }
    return finalDmg;
  }

  private processEnemyDeath(enemy: EnemyState, attacker: PlayerState | null): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);
    this.removeEntityZones(enemy.id);
    this.enemyMeta.delete(enemy.id);

    for (const pr of this.players.values()) {
      if (pr.state.predatorTargetId === enemy.id) {
        pr.state.predatorTargetId = null;
        pr.state.predatorStacks = 0;
        pr.predatorLastHitAtMs = 0;
      }
    }

    if (attacker) {
      attacker.kills += 1;
      if (this.onKillCallback) this.onKillCallback(attacker.id);
      if (attacker.relics.includes('crimson_fang')) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
      }
      if (this.getActivePassive(attacker) === 'eagle_keenness') {
        attacker.hasteMs = Math.max(attacker.hasteMs, 2500);
      }
    }

    if (enemy.elite || enemy.kind === 'boss' || Math.random() < 0.60) {
      this.props.push({
        id: this.nextId('prop'),
        kind: 'coin',
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: enemy.kind === 'boss' ? 90 : enemy.elite ? 24 : 11,
      });
    } else if (Math.random() < 0.15) {
      this.props.push({
        id: this.nextId('prop'),
        kind: 'potion',
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: 1,
      });
    }

    const baseMobXp = enemy.kind === 'boss' ? 110 : enemy.elite ? 48 : 24;
    const floorXpBonus = 1 + (this.floor - 1) * 0.35;
    const diffXpBonus = this.difficulty === 'Abyssal' ? 1.5 : this.difficulty === 'Heroic' ? 1.25 : 1.0;
    const xpGain = Math.round(baseMobXp * floorXpBonus * diffXpBonus);
    for (const ally of this.players.values()) {
      this.grantXp(ally.state, xpGain);
    }

    // Permanent Armament discovery drop on Floor Boss clear (guaranteed new unowned class item if available)
    if (enemy.kind === 'boss' && this.roomId !== 'TAVERN-HUB') {
      for (const ally of this.players.values()) {
        const st = ally.state;
        if (!st.ownedWeapons) st.ownedWeapons = [getDefaultWeaponIdForClass(st.heroClass)];
        if (!st.ownedVestments) st.ownedVestments = [getDefaultVestmentIdForClass(st.heroClass)];
        const unlocked = pickNextUnlockableArmamentForClass(
          st.heroClass,
          st.ownedWeapons,
          st.ownedVestments,
          this.floor
        );
        if (unlocked) {
          if (unlocked.slot === 'weapon') {
            st.ownedWeapons.push(unlocked.id);
          } else {
            st.ownedVestments.push(unlocked.id);
          }
          this.emitEvent(
            'status',
            st.x,
            st.y - 38,
            `ARMORY UNLOCKED: ${unlocked.name}`,
            unlocked.accent
          );
          this.pushSystemChat(
            `${st.username} discovered permanent ${unlocked.slot}: ${unlocked.name} (${unlocked.rarity})!`
          );
          this.onArmamentUnlockedCallback?.(st.id, unlocked.slot, unlocked.id);
        }
      }
    }
  }

  private grantXp(p: PlayerState, amount: number): void {
    if (p.level >= MAX_LEVEL) {
      p.level = MAX_LEVEL;
      p.xp = 0;
      p.nextXp = 999999;
      return;
    }
    p.xp += amount;
    let leveledUp = false;
    while (p.xp >= p.nextXp && p.level < MAX_LEVEL) {
      p.xp -= p.nextXp;
      p.level += 1;
      leveledUp = true;
      if (p.level <= MAX_LEVEL) {
        p.attributePoints += 3;
      }
      p.nextXp = GameRoom.computeNextXp(p.level);
      if (p.level >= MAX_LEVEL) {
        p.level = MAX_LEVEL;
        p.xp = 0;
        p.nextXp = 999999;
      }

      const oldMax = p.maxHp;
      p.maxHp = GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics, p.equippedVestment);
      p.hp += (p.maxHp - oldMax);
      p.hp = Math.min(p.maxHp, p.hp + 24);

      this.emitEvent('status', p.x, p.y - 26, `Level ${p.level} (+3 Pts)`, '#F4D378');
      if (p.level >= MAX_LEVEL) break;
    }
    if (p.level >= MAX_LEVEL) {
      p.level = MAX_LEVEL;
      p.xp = 0;
      p.nextXp = 999999;
    }
    if (this.onProgressionUpdateCallback) {
      this.onProgressionUpdateCallback(p.id, p);
    }
  }

  public damagePlayer(
    p: PlayerState,
    rawDamage: number,
    damageType: DamageCategory | 'elemental' = 'physical'
  ): number {
    if (p.downed || p.godMode) return 0;

    const classDef = HERO_CLASSES[p.heroClass];
    const res = classDef?.resistances || {
      physical: 0,
      fire: 0,
      frost: 0,
      lightning: 0,
      poison: 0,
      bleed: 0,
    };

    const avgElemRes = (res.fire + res.frost + res.lightning) / 3;
    let resist = 0;
    if (damageType === 'elemental') {
      resist = avgElemRes;
    } else if (damageType === 'fire') {
      resist = res.fire;
    } else if (damageType === 'frost') {
      resist = res.frost;
    } else if (damageType === 'lightning') {
      resist = res.lightning;
    } else if (damageType === 'poison') {
      resist = res.poison;
    } else if (damageType === 'bleed') {
      resist = res.bleed;
    } else if (damageType === 'arcane' || damageType === 'divine') {
      resist = avgElemRes;
    } else {
      resist = res.physical;
    }

    const isMagicalOrElemental =
      damageType === 'elemental' ||
      damageType === 'fire' ||
      damageType === 'frost' ||
      damageType === 'lightning' ||
      damageType === 'arcane' ||
      damageType === 'divine';

    if (p.relics.includes('runic_carapace')) {
      resist += damageType === 'physical' ? 0.15 : 0.20;
    }
    if (p.relics.includes('thorned_aegis') && damageType === 'physical') {
      resist += 0.10;
    }
    if (damageType === 'physical' && (p.strength || 0) > 0) {
      resist += Math.min(0.15, (p.strength || 0) * 0.0015);
    }
    if (isMagicalOrElemental && (p.intelligence || 0) > 0) {
      resist += Math.min(0.15, (p.intelligence || 0) * 0.0015);
    }
    const vestmentMods =
      resolveEquippedVestmentForClass(p.heroClass, p.equippedVestment)?.modifiers;
    if (damageType === 'physical' && vestmentMods?.physicalResistBonus) {
      resist += vestmentMods.physicalResistBonus;
    }
    if (isMagicalOrElemental && vestmentMods?.elementalResistBonus) {
      resist += vestmentMods.elementalResistBonus;
    }
    const bastionStacks = this.getBlessingStacks(p, 'bastion');
    if (bastionStacks > 0) {
      resist += bastionStacks * 0.06;
    }
    resist = Math.min(0.75, Math.max(0, resist));

    let dmg = Math.max(1, Math.round(rawDamage * (1 - resist)));

    // Floor 1: Guard Broken - Increases incoming damage by 30%
    if (p.statuses.some(s => s.type === 'guard_broken')) {
      dmg = Math.round(dmg * 1.30);
    }

    // Floor 9: Impaled - Bonus damage from subsequent divine spear hits
    if (damageType === 'divine' && p.statuses.some(s => s.type === 'impaled')) {
      dmg = Math.round(dmg * 1.45);
      this.emitEvent('status', p.x, p.y - 14, 'IMPALED CRITICAL!', '#FBBF24');
    }

    if (this.getActivePassive(p) === 'iron_will') {
      dmg = Math.max(1, Math.round(dmg * 0.85));
    }
    if (vestmentMods?.damageTakenMult && vestmentMods.damageTakenMult !== 1) {
      dmg = Math.max(1, Math.round(dmg * vestmentMods.damageTakenMult));
    }

    const inAegis = this.zones.some(
      (z) => z.kind === 'aegis_dome' && Math.hypot(p.x - z.x, p.y - z.y) <= z.radius
    );
    if (inAegis) dmg = Math.max(1, Math.round(dmg * 0.65));

    const finalMitigatedDamage = dmg;

    let absorbed = 0;
    if (p.shield > 0) {
      absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;

      // Thorned Aegis: Stun retaliation shockwave routed through centralized hard-CC DR
      if (absorbed > 0 && p.relics.includes('thorned_aegis')) {
        for (const enemy of this.enemies) {
          if (enemy.hp > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 125) {
            const appliedStun = this.applyHardCc(enemy, 'stun', 1800);
            if (appliedStun > 0) {
              this.emitThrottledEntityStatus(enemy.id, enemy.x, enemy.y - 16, 'STUNNED!', '#A855F7', 2000);
            }
          }
        }
      }
    }

    if (
      (dmg > 0 || absorbed > 0) &&
      this.getActivePassive(p) === 'momentum' &&
      ARMAMENT_TUNING.passives.momentum.resetOnHit
    ) {
      p.rangerMomentum = 0;
      const mPr = this.players.get(p.id);
      if (mPr) mPr.momentumHoldMs = 0;
    }

    if (dmg > 0) {
      p.hp = Math.max(0, p.hp - dmg);
      this.emitEvent(
        'damage',
        p.x,
        p.y - 18,
        `-${dmg}`,
        getDamageTypeColor(damageType, false),
        damageType
      );
    }

    // Break Charmed if taking >= 20 damage (jolt from trance)
    if ((dmg >= 20 || absorbed >= 20 || rawDamage >= 20) && p.statuses && p.statuses.some(s => s.type === 'charmed')) {
      p.statuses = p.statuses.filter(s => s.type !== 'charmed');
      this.emitEvent('status', p.x, p.y - 30, 'CHARM BROKEN!', '#F472B6');
    }

    if (p.hp <= 0) {
      p.downed = true;
      p.downedTimerMs = 18000;
      p.reviveProgress = 0;
      const dPr = this.players.get(p.id);
      if (dPr) this.clearEclipseCharge(dPr);
      if (this.players.size > 1) {
        this.pushSystemChat(
          `${p.username} is downed! Stand near your ally to revive them.`
        );
      }
    } else if (dmg > 0) {
      this.triggerSharedGraceForAlly(p);
    }

    return finalMitigatedDamage;
  }

  public completeRevive(target: PlayerState, reviverId: string): void {
    target.downed = false;
    target.reviveProgress = 0;
    target.hp = Math.round(target.maxHp * 0.45);
    target.shield = 20;
    target.statuses = [];
    const reviver = this.players.get(reviverId);
    if (reviver && reviver.state.id !== target.id) {
      reviver.state.revives += 1;
      if (this.onReviveCallback) this.onReviveCallback(reviver.state.id);
      this.pushSystemChat(`${reviver.state.username} revived ${target.username}!`);
    }
    this.emitEvent('heal', target.x, target.y - 24, 'Revived!', '#6EE7B7');
  }

  private recentStatusEvents = new Map<string, number>();

  private emitThrottledEntityStatus(
    entityId: string,
    x: number,
    y: number,
    text: string,
    color: string,
    cooldownMs = 3500
  ): void {
    const now = Date.now();
    const key = `${entityId}_${text.trim()}`;
    const lastAt = this.entityStatusTextCooldowns.get(key) ?? 0;
    if (now - lastAt < cooldownMs) return;
    this.entityStatusTextCooldowns.set(key, now);
    if (this.entityStatusTextCooldowns.size > 200) {
      const cutoff = now - 6000;
      for (const [k, t] of this.entityStatusTextCooldowns.entries()) {
        if (t < cutoff) this.entityStatusTextCooldowns.delete(k);
      }
    }
    this.emitEvent('status', x, y, text, color);
  }

  private emitEvent(
    kind: FloatingEvent['kind'],
    x: number,
    y: number,
    text: string,
    color: string,
    damageCategory?: DamageCategory | 'elemental'
  ): void {
    const now = Date.now();
    if (kind === 'status' || kind === 'crit') {
      const bucketSize = kind === 'status' ? 110 : 45;
      const throttleKey = `${Math.round(x / bucketSize)}_${Math.round(y / bucketSize)}_${text.trim()}`;
      const lastTime = this.recentStatusEvents.get(throttleKey) ?? 0;
      if (now - lastTime < 2500) {
        return;
      }
      this.recentStatusEvents.set(throttleKey, now);
      if (this.recentStatusEvents.size > 150) {
        const cutoff = now - 5000;
        for (const [k, t] of this.recentStatusEvents.entries()) {
          if (t < cutoff) this.recentStatusEvents.delete(k);
        }
      }
    }

    this.pendingEvents.push({
      id: this.nextId('ev'),
      kind,
      x: Math.round(x),
      y: Math.round(y),
      text,
      color,
      ...(damageCategory ? { damageCategory } : {}),
    });
  }

  private findRoomContaining(wx: number, wy: number) {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    return this.map.rooms.find(
      (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h
    );
  }

  private hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    return sharedHasLineOfSight(this.map, this.props, x1, y1, x2, y2);
  }

  private isWallAtWorld(wx: number, wy: number): boolean {
    return sharedIsWallAtWorld(this.map, this.props, wx, wy, this.npcs);
  }

  private collidesCircle(wx: number, wy: number, radius: number): boolean {
    return sharedCollidesCircle(this.map, this.props, wx, wy, radius, this.npcs);
  }

  private moveWithCollision(
    entity: { x: number; y: number },
    dx: number,
    dy: number,
    radius: number
  ): void {
    sharedMoveWithCollision(this.map, this.props, entity, dx, dy, radius, this.npcs);
  }

  public getElapsedSec(): number {
    if (this.status === 'waiting') return 0;
    const end = this.endedAt ?? Date.now();
    return Math.max(0, Math.floor((end - this.startedAt) / 1000));
  }

  public getSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      name: this.name,
      hostId: this.hostId,
      hostName: this.hostName,
      difficulty: this.difficulty,
      floor: this.floor,
      seed: this.baseSeed,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      status: this.status,
    };
  }

  public buildSnapshot(): GameSnapshot {
    const events = this.pendingEvents.splice(0, this.pendingEvents.length);
    const activePlayers: PlayerState[] = [];
    let portalReadyCount = 0;
    for (const r of this.players.values()) {
      activePlayers.push(r.state);
      if (r.state.readyNextFloor) {
        portalReadyCount++;
      }
    }

    let combatRoomsTotal = 0;
    let combatRoomsCleared = 0;
    let bossRoomCleared = false;
    const roomClearedFlags = new Array<{
      id: number;
      cleared: boolean;
      discovered: boolean;
      guardian?: boolean;
      type?: RoomNode['type'];
    }>(this.map.rooms.length);

    for (let i = 0; i < this.map.rooms.length; i++) {
      const r = this.map.rooms[i];
      if (r.type === 'combat') {
        combatRoomsTotal++;
        if (r.cleared) combatRoomsCleared++;
      } else if (r.type === 'boss') {
        bossRoomCleared = Boolean(r.cleared);
      }
      roomClearedFlags[i] = {
        id: r.id,
        cleared: r.cleared,
        discovered: r.discovered,
        guardian: r.guardian,
        type: r.type,
      };
    }

    return {
      roomId: this.roomId,
      roomName: this.name,
      hostId: this.hostId,
      hostName: this.hostName,
      difficulty: this.difficulty,
      status: this.status,
      floor: this.floor,
      seed: this.baseSeed,
      elapsedSec: this.getElapsedSec(),
      lastRunSummary: this.lastRunSummary,
      bossDefeated: this.map.portalActive,
      bossRoomCleared,
      bossWards: this.getBossWards(),
      maxBossWards: this.getMaxBossWards(),
      guardiansRemaining: this.getGuardiansRemaining(),
      guardiansTotal: this.getGuardiansTotal(),
      combatRoomsCleared,
      combatRoomsTotal,
      floorMasteryAwarded: this.floorMasteryAwarded,
      portalReadyCount,
      players: activePlayers,
      enemies: this.enemies,
      projectiles: this.projectiles,
      props: this.props,
      zones: this.zones,
      npcs: this.npcs,
      trainingDummies: this.trainingDummies,
      events,
      roomClearedFlags,
    };
  }

  /**
   * Produces a bandwidth-trimmed projection of the authoritative room state for
   * high-frequency `room:tick` broadcasts:
   * - Quantizes kinematic floats (0.1px position/velocity, 0.01rad angle)
   * - Omits enemy resistances on non-boss enemies (only boss resistances render on HUD)
   * - Omits static dialogue text/options on silent NPCs
   * - Omits server-internal projectile tracking fields (hitEntityIds, targetEnemyId)
   * - Filters already-collected ephemeral props (crate, coin, potion)
   */
  public buildNetworkSnapshot(): GameSnapshot {
    const base = this.buildSnapshot();
    const r1 = (n: number): number => Math.round(n * 10) / 10;
    const r2 = (n: number): number => Math.round(n * 100) / 100;

    const netPlayers: PlayerState[] = base.players.map((p) => ({
      ...p,
      x: r1(p.x),
      y: r1(p.y),
      vx: r1(p.vx),
      vy: r1(p.vy),
      aimAngle: r2(p.aimAngle),
      reviveProgress: r2(p.reviveProgress),
    }));

    const netEnemies: EnemyState[] = base.enemies.map((e) => {
      const projected: EnemyState = {
        id: e.id,
        kind: e.kind,
        name: e.name,
        roomId: e.roomId,
        x: r1(e.x),
        y: r1(e.y),
        vx: r1(e.vx),
        vy: r1(e.vy),
        hp: e.hp,
        maxHp: e.maxHp,
        radius: e.radius,
        state: e.state,
        windupMs: e.windupMs,
        targetX: r1(e.targetX),
        targetY: r1(e.targetY),
        markedMs: e.markedMs,
        slowedMs: e.slowedMs,
        stunnedMs: e.stunnedMs,
        burnedMs: e.burnedMs,
        frozenMs: e.frozenMs,
        shockedMs: e.shockedMs,
        poisonedMs: e.poisonedMs,
        bleedingMs: e.bleedingMs,
        silencedMs: e.silencedMs,
        elite: e.elite,
      };
      if (e.kind === 'boss' && e.resistances) projected.resistances = e.resistances;
      if (e.enraged) projected.enraged = true;
      if (e.charging) projected.charging = true;
      if (e.chargeAngle !== undefined) projected.chargeAngle = r2(e.chargeAngle);
      if (e.chargeTimerMs) projected.chargeTimerMs = e.chargeTimerMs;
      if (e.chargeWindupMs) projected.chargeWindupMs = e.chargeWindupMs;
      if (e.summonWave) projected.summonWave = e.summonWave;
      if (e.shieldWallMs) projected.shieldWallMs = e.shieldWallMs;
      if (e.abilityCdMs) projected.abilityCdMs = e.abilityCdMs;
      if (e.chronoSuspendedMs) projected.chronoSuspendedMs = e.chronoSuspendedMs;
      return projected;
    });

    const netProjectiles: ProjectileState[] = base.projectiles.map((pr) => {
      const projected: ProjectileState = {
        id: pr.id,
        ownerType: pr.ownerType,
        ownerId: pr.ownerId,
        style: pr.style,
        x: r1(pr.x),
        y: r1(pr.y),
        vx: r1(pr.vx),
        vy: r1(pr.vy),
        angle: r2(pr.angle),
        radius: pr.radius,
        damage: pr.damage,
        pierce: pr.pierce,
        ttlMs: pr.ttlMs,
      };
      if (pr.slowOnHit) projected.slowOnHit = true;
      if (pr.statusOnHit) projected.statusOnHit = pr.statusOnHit;
      if (pr.statusDurationMs) projected.statusDurationMs = pr.statusDurationMs;
      if (pr.crit) projected.crit = true;
      if (pr.chronoSuspendedMs) projected.chronoSuspendedMs = pr.chronoSuspendedMs;
      if (pr.spellId) projected.spellId = pr.spellId;
      if (pr.weaponId) projected.weaponId = pr.weaponId;
      return projected;
    });

    const netProps: PropState[] = [];
    for (let i = 0; i < base.props.length; i++) {
      const prop = base.props[i];
      if (prop.opened && (prop.kind === 'crate' || prop.kind === 'coin' || prop.kind === 'potion')) {
        continue;
      }
      netProps.push(prop);
    }

    const netZones: FieldZoneState[] = base.zones.map((z) => {
      const projected: FieldZoneState = {
        ...z,
        x: r1(z.x),
        y: r1(z.y),
      };
      if (z.angle !== undefined) projected.angle = r2(z.angle);
      return projected;
    });

    const netNpcs: NpcState[] = base.npcs.map((n) =>
      (n.speakingMs ?? 0) > 0
        ? n
        : {
            id: n.id,
            name: n.name,
            x: n.x,
            y: n.y,
            dialogue: '',
            spriteKind: n.spriteKind,
            speakingMs: 0,
          }
    );

    return {
      ...base,
      players: netPlayers,
      enemies: netEnemies,
      projectiles: netProjectiles,
      props: netProps,
      zones: netZones,
      npcs: netNpcs,
    };
  }
}
