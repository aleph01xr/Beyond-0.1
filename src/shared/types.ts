export type HeroClassId = 'vanguard' | 'ranger' | 'arcanist' | 'cleric';

export type DifficultyTier = 'Normal' | 'Heroic' | 'Abyssal';

export type BiomeId =
  | 'courtyard'
  | 'catacombs'
  | 'ember'
  | 'void'
  | 'astral'
  | 'hymns'
  | 'reliquary'
  | 'scripture'
  | 'nave'
  | 'wardengate';
export const MAX_LEVEL = 100;
export const MAX_ATTRIBUTE = 100;

export interface AccountRecord {
  id: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  lockedClass: HeroClassId;
  preferredClass: HeroClassId;
  runsCompleted: number;
  highestFloor: number;
  totalKills: number;
  totalRevives: number;
  gold?: number;
  isAdmin?: boolean;
  level?: number;
  xp?: number;
  strength?: number;
  vitality?: number;
  dexterity?: number;
  intelligence?: number;
  faith?: number;
  attributePoints?: number;
  storedRelics?: string[];
}

export interface HeroClassStats {
  survivability: number; // 1-5
  damage: number;        // 1-5
  range: number;         // 1-5
  mobility: number;      // 1-5
  utility: number;       // 1-5
}

export interface CombatResistances {
  physical: number;   // damage mitigation (e.g. 0.28 = 28%)
  fire: number;       // reduces Burn tick damage & duration
  frost: number;      // reduces Freeze duration & slow magnitude
  lightning: number;  // reduces Shock duration & chain arc damage
  poison: number;     // reduces Poison DoT & monster weaken magnitude
  bleed: number;      // reduces Bleed tick damage & duration
}

export type DamageCategory = 'physical' | 'arcane' | 'divine' | 'fire' | 'frost' | 'lightning' | 'poison' | 'bleed';

export interface EnemyResistances {
  physical: number;
  fire: number;
  frost: number;
  lightning: number;
  poison: number;
  bleed: number;
  tenacity: number;   // crowd control reduction (Freeze/Stun duration scaling)
  arcane?: number;    // magical/arcane damage mitigation
  divine?: number;    // holy/divine damage mitigation
}

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  title: string;
  role: string;
  roleBadge: 'TANK' | 'MARKSMAN' | 'CASTER' | 'SUPPORT';
  weapon: string;
  weaponType: string;
  passiveName: string;
  passiveDesc: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldownMs: number;
  range: number;
  primaryColor: string;
  secondaryColor: string;
  capeColor: string;
  accentColor: string;
  glowColor: string;
  lore: string;
  stats: HeroClassStats;
  resistances: CombatResistances;
  tacticalName: string;
  tacticalDesc: string;
  tacticalCooldownMs: number;
  ultName: string;
  ultDesc: string;
  ultCooldownMs: number;
}

export const HERO_CLASSES: Record<HeroClassId, HeroClassDef> = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    title: 'Ironcrest Bastion',
    role: 'Frontline Guardian & Juggernaut',
    roleBadge: 'TANK',
    weapon: 'Sunforged Claymore & Tower Greatshield',
    weaponType: 'Heavy Cleave & Shield Wall',
    passiveName: 'Iron Will',
    passiveDesc: 'Absorbs 15% of all incoming damage. Striking stunned or burning foes restores +3 Shield.',
    maxHp: 155,
    speed: 175,
    damage: 28,
    attackCooldownMs: 400,
    range: 78,
    primaryColor: '#64748B',
    secondaryColor: '#CBD5E1',
    capeColor: '#991B1B',
    accentColor: '#F59E0B',
    glowColor: '#FBBF24',
    lore: 'Sworn knights of the Sunken Bastion who bound their lifeblood into eternal steel. With unbroken wills and towering shields, they stand between ancient horrors and their comrades.',
    stats: { survivability: 5, damage: 3, range: 1, mobility: 2, utility: 4 },
    resistances: { physical: 0.28, fire: 0.15, frost: 0.15, lightning: 0.10, poison: 0.15, bleed: 0.30 },
    tacticalName: 'Bulwark Dash',
    tacticalDesc: 'Slam forward with tower shield, battering through monsters, stunning them for 1.6s and granting +28 Shield to nearby allies.',
    tacticalCooldownMs: 4800,
    ultName: 'Aegis Sanctuary',
    ultDesc: 'Plant your colossal shield into the earth, raising a gleaming dome that deflects projectile barrages and boosts party defense.',
    ultCooldownMs: 13000,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    title: 'Thornwood Marksman',
    role: 'Long-Range Sniper & Scout',
    roleBadge: 'MARKSMAN',
    weapon: 'Ashwood Recurve & Barbed Quiver',
    weaponType: 'Piercing Ranged Bow',
    passiveName: 'Eagle Keenness',
    passiveDesc: 'Attacks deal +25% Critical damage to targets beyond 180 units. Slaying a foe grants a 2s burst of swiftness.',
    maxHp: 110,
    speed: 210,
    damage: 24,
    attackCooldownMs: 320,
    range: 380,
    primaryColor: '#2D5A3C',
    secondaryColor: '#4ADE80',
    capeColor: '#1A3826',
    accentColor: '#FBBF24',
    glowColor: '#34D399',
    lore: 'Sole survivors of the blighted Thornwood groves, master trackers capable of loose-drawing three enchanted shafts in the blink of an eye. Their arrows never falter.',
    stats: { survivability: 2, damage: 5, range: 5, mobility: 5, utility: 2 },
    resistances: { physical: 0.10, fire: 0.10, frost: 0.25, lightning: 0.15, poison: 0.45, bleed: 0.20 },
    tacticalName: 'Frost Volley',
    tacticalDesc: 'Loose a 5-arrow crystalline fan that pierces foes, slowing enemy advance by 50% and chilling their attacks.',
    tacticalCooldownMs: 4200,
    ultName: 'Hunter Quarry',
    ultDesc: 'Mark elites and bosses with radiant moonlight hunters-brand, exposing their weak points so all co-op allies deal +35% bonus strike damage.',
    ultCooldownMs: 11500,
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    title: 'Astral Conduit',
    role: 'AoE Spellweaver & Cosmic Blaster',
    roleBadge: 'CASTER',
    weapon: 'Runebound Spire & Orbiting Astral Orbs',
    weaponType: 'Cosmic Shards & Starlight',
    passiveName: 'Astral Resonance',
    passiveDesc: 'Basic attacks loose homing cosmic shards that pierce an additional enemy. Spells leave lingering star rifts.',
    maxHp: 100,
    speed: 188,
    damage: 32,
    attackCooldownMs: 420,
    range: 340,
    primaryColor: '#4338CA',
    secondaryColor: '#818CF8',
    capeColor: '#312E81',
    accentColor: '#38BDF8',
    glowColor: '#60A5FA',
    lore: 'Scholars of the shattered celestial spires who channel raw starlight through crystalline conduits. They weave time and void to obliterate dungeon hordes from afar.',
    stats: { survivability: 2, damage: 5, range: 4, mobility: 3, utility: 4 },
    resistances: { physical: 0.05, fire: 0.25, frost: 0.35, lightning: 0.45, poison: 0.15, bleed: 0.10 },
    tacticalName: 'Astral Nova',
    tacticalDesc: 'Unleash 8 piercing arcane shards in a starburst, knocking back surrounding monsters with void energy.',
    tacticalCooldownMs: 5000,
    ultName: 'Chrono Well',
    ultDesc: 'Anchor a cosmic gravitational well that snares enemies, pulling them in while accelerating allied cooldowns by 50%.',
    ultCooldownMs: 13500,
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    title: 'Sunbrand Prelate',
    role: 'Radiant Healer & Divine Enchanter',
    roleBadge: 'SUPPORT',
    weapon: 'Dawnstar Flanged Mace & Reliquary',
    weaponType: 'Radiant Smite & Holy Relic',
    passiveName: 'Radiant Aura',
    passiveDesc: 'Emits a sacred 140-range warmth that heals wounded party members every 2 seconds (scales with Level & Faith, base 4 HP, +50% when critical), and increases revive speed by 40%.',
    maxHp: 128,
    speed: 185,
    damage: 22,
    attackCooldownMs: 380,
    range: 290,
    primaryColor: '#E2E8F0',
    secondaryColor: '#FDE047',
    capeColor: '#854D0E',
    accentColor: '#FACC15',
    glowColor: '#FEF08A',
    lore: 'Devotees of the Eternal Dawn whose sacred chants can mend the gravest wounds and turn undead to ash. A cornerstone of every surviving expedition into the depths.',
    stats: { survivability: 4, damage: 3, range: 3, mobility: 2, utility: 5 },
    resistances: { physical: 0.15, fire: 0.40, frost: 0.20, lightning: 0.15, poison: 0.35, bleed: 0.25 },
    tacticalName: 'Sanctified Pulse',
    tacticalDesc: 'Release a blinding wave of golden light, healing you and all nearby party members (scales with Level & Faith, base 36 HP) while searing adjacent undead.',
    tacticalCooldownMs: 5400,
    ultName: 'Solar Beacon',
    ultDesc: 'Consecrate holy ground with an avatar of the Sun that continuously heals all allies (scales with Level & Faith, base 9 HP) and rapidly revives downed teammates who enter.',
    ultCooldownMs: 14000,
  },
};

export interface RelicDef {
  id: string;
  name: string;
  category: 'Offense' | 'Defense' | 'Mobility' | 'Co-op';
  summary: string;
  accent: string;
}

export const RELIC_CATALOG: RelicDef[] = [
  {
    id: 'crimson_fang',
    name: 'Crimson Fang',
    category: 'Offense',
    summary: 'Restore +5 HP whenever you slay an enemy.',
    accent: '#D14B4B',
  },
  {
    id: 'twinstring_charm',
    name: 'Twinstring Charm',
    category: 'Offense',
    summary: 'Primary attacks unleash +1 additional projectile or cleave wave, but extra projectiles deal 75% damage.',
    accent: '#E0A94F',
  },
  {
    id: 'zephyr_greaves',
    name: 'Zephyr Greaves',
    category: 'Mobility',
    summary: '+18% movement speed across all terrain.',
    accent: '#68B89E',
  },
  {
    id: 'sunfire_signet',
    name: 'Sunfire Signet',
    category: 'Offense',
    summary: '+24% primary and skill damage.',
    accent: '#E88348',
  },
  {
    id: 'bastion_pauldron',
    name: 'Bastion Pauldron',
    category: 'Defense',
    summary: '+30 Max HP and immediate +30 HP recovery.',
    accent: '#8D9BB5',
  },
  {
    id: 'hourglass_shard',
    name: 'Hourglass Shard',
    category: 'Mobility',
    summary: 'Tactical and Ultimate cooldowns recharge 25% faster.',
    accent: '#76B5E8',
  },
  {
    id: 'keen_arrowhead',
    name: 'Keen Arrowhead',
    category: 'Offense',
    summary: '+25% critical strike chance for 1.75x damage.',
    accent: '#DFC15E',
  },
  {
    id: 'oathbound_censer',
    name: 'Oathbound Censer',
    category: 'Co-op',
    summary: 'Using your Tactical skill heals nearby co-op allies for +14 HP.',
    accent: '#E8CE76',
  },
  {
    id: 'runic_carapace',
    name: 'Runic Carapace',
    category: 'Defense',
    summary: 'Gain +22 Shield upon entering new rooms, and passive +15% Physical Resistance & +20% Status/Elemental Resistances.',
    accent: '#6E85C9',
  },
  {
    id: 'piercing_prism',
    name: 'Piercing Prism',
    category: 'Offense',
    summary: 'Projectiles and waves pierce +1 extra enemy target.',
    accent: '#A988E6',
  },
  {
    id: 'cinder_heart',
    name: 'Cinder Heart',
    category: 'Offense',
    summary: 'Critical hits and tactical skills Ignite enemies with Burn DoT (ticks fiery damage every 0.8s for 4s).',
    accent: '#F97316',
  },
  {
    id: 'rimefrost_shard',
    name: 'Rimefrost Shard',
    category: 'Offense',
    summary: 'Attacks have 25% chance to Chill. Striking a Chilled enemy Freezes them in solid ice; shattering deals +60% bonus damage.',
    accent: '#38BDF8',
  },
  {
    id: 'stormcaller_lodestone',
    name: 'Stormcaller Lodestone',
    category: 'Offense',
    summary: 'Every 3rd strike inflicts Shock for 5s. Damaging a Shocked foe arcs lightning bolts to up to 3 nearby enemies.',
    accent: '#FBBF24',
  },
  {
    id: 'viper_crucible',
    name: 'Viper Crucible',
    category: 'Offense',
    summary: 'Attacks apply virulent Poison for 6s, dealing continuous acid damage and reducing enemy damage output by 30%.',
    accent: '#22C55E',
  },
  {
    id: 'bloodletter_talisman',
    name: 'Bloodletter Talisman',
    category: 'Offense',
    summary: 'Strikes lacerate targets with Bleed for 5s. Bleeding enemies take damage that doubles whenever they attempt to move.',
    accent: '#DC2626',
  },
  {
    id: 'thorned_aegis',
    name: 'Thorned Aegis',
    category: 'Defense',
    summary: 'When your Shield absorbs enemy damage, discharge a concussive shockwave that Stuns adjacent attackers for 1.8s.',
    accent: '#A855F7',
  },
];

export const TILE_SIZE = 32;

export interface RoomNode {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  type: 'start' | 'combat' | 'treasure' | 'shrine' | 'boss';
  cleared: boolean;
  discovered: boolean;
}

export interface DungeonMap {
  floor: number;
  seed: number;
  biome: BiomeId;
  biomeTitle: string;
  width: number;
  height: number;
  tiles: number[];
  rooms: RoomNode[];
  torches: { x: number; y: number }[];
  portalPos: { x: number; y: number };
  portalActive: boolean;
}

export interface PlayerInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  attack: boolean;
  aimAngle: number;
  // Mobile virtual joystick analog input (-1 to 1)
  stickX?: number;
  stickY?: number;
}

export interface PlayerState {
  id: string;
  username: string;
  heroClass: HeroClassId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  shield: number;
  level: number;
  xp: number;
  nextXp: number;
  gold: number;
  potions: number;
  relics: string[];
  storage: string[];
  downed: boolean;
  downedTimerMs: number;
  reviveProgress: number; // 0 to 1
  skillCooldownMs: number;
  maxSkillCooldownMs: number;
  ultCooldownMs: number;
  maxUltCooldownMs: number;
  attackAnimMs: number;
  hasteMs: number;
  // Status Effects
  slowedMs: number;
  stunnedMs: number;
  burnedMs: number;
  frozenMs: number;
  shockedMs: number;
  poisonedMs: number;
  bleedingMs: number;
  silencedMs: number;

  kills: number;
  damageDealt: number;
  revives: number;
  readyNextFloor: boolean;
  pendingRelicChoices: string[];
  connected: boolean;
  isAdmin?: boolean;
  godMode?: boolean;
  speedBoost?: boolean;
  dexterity: number;
  vitality: number;
  strength: number;
  intelligence: number;
  faith: number;
  attributePoints: number;
  statuses: PlayerStatusEffect[];
}

export type PlayerStatusType =
  | 'guard_broken' // Floor 1: Warden Malakor
  | 'frostbite'    // Floor 2: Archlich Vaelor
  | 'scorched'     // Floor 3: Ignis
  | 'voidmarked'   // Floor 4: Void-Eater Malice
  | 'disoriented'  // Floor 5: Archon of Nothingness
  | 'charmed'      // Floor 6: Elyndor
  | 'ashen_curse'  // Floor 7: Zadkiel
  | 'silenced'     // Floor 8: Sariel
  | 'impaled'      // Floor 9: Seraphel
  | 'condemned';   // Floor 10: Oriphiel

export interface PlayerStatusEffect {
  id: string;
  type: PlayerStatusType;
  durationMs: number;
  maxDurationMs: number;
  stacks?: number;
  value?: number;
  sourceId?: string;
  detonationTimerMs?: number;
}

export type EnemyKind =
  | 'slime'
  | 'goblin'
  | 'skeleton'
  | 'cultist'
  | 'knight'
  | 'shadow_stalker'
  | 'astral_sentinel'
  | 'hymn_phantom'
  | 'relic_golem'
  | 'veiled_heretic'
  | 'celestial_arbiter'
  | 'warden_enforcer'
  | 'boss';

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  name: string;
  roomId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  radius: number;
  state: 'idle' | 'chase' | 'windup' | 'recover' | 'charge';
  windupMs: number;
  targetX: number;
  targetY: number;
  markedMs: number;
  // Status Effects
  slowedMs: number;
  stunnedMs: number;
  burnedMs: number;
  frozenMs: number;
  shockedMs: number;
  poisonedMs: number;
  bleedingMs: number;
  silencedMs: number;
  
  elite: boolean;
  resistances: EnemyResistances;
  enraged?: boolean;
  charging?: boolean;
  chargeAngle?: number;
  chargeTimerMs?: number;
  summonWave?: number;
  shieldWallMs?: number;
  abilityCdMs?: number;
}

export interface ProjectileState {
  id: string;
  ownerType: 'player' | 'enemy';
  ownerId: string;
  style: 'slash' | 'arrow' | 'arcane' | 'radiant' | 'bone' | 'voidorb' | 'fireball';
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  damage: number;
  pierce: number;
  slowOnHit?: boolean;
  statusOnHit?: PlayerStatusType;
  statusDurationMs?: number;
  crit?: boolean;
  ttlMs: number;
  targetEnemyId?: string;
  hitEntityIds?: string[];
}

export interface PropState {
  id: string;
  kind: 'crate' | 'chest' | 'relic_chest' | 'shrine' | 'coin' | 'potion' | 'warden_gate';
  x: number;
  y: number;
  opened: boolean;
  value: number;
}

export interface FieldZoneState {
  id: string;
  kind:
    | 'aegis_dome'
    | 'solar_beacon'
    | 'chrono_well'
    | 'boss_slam'
    | 'star_rift'
    | 'frost_nova'
    | 'magma_pillar'
    | 'singularity'
    | 'supernova'
    | 'starlight_beam'
    | 'sound_lane'
    | 'lament_mark'
    | 'ashen_cloud'
    | 'censer_sweep'
    | 'scripture_line'
    | 'silence_seal'
    | 'lance_thrust'
    | 'lancefall_mark'
    | 'warden_edict'
    | 'warden_parry'
    | 'verdict_combo'
    | 'warden_shatter';
  x: number;
  y: number;
  radius: number;
  width?: number;
  height?: number;
  angle?: number;
  seqNumber?: number;
  label?: string;
  quadrant?: number;
  stage?: number;
  ttlMs: number;
  maxTtlMs: number;
  ownerId: string;
}

export interface FloatingEvent {
  id: string;
  kind: 'damage' | 'crit' | 'heal' | 'gold' | 'status' | 'ping';
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface RoomSummary {
  roomId: string;
  name: string;
  hostName: string;
  difficulty: DifficultyTier;
  floor: number;
  seed: number;
  playerCount: number;
  maxPlayers: number;
  status: 'playing' | 'victory' | 'defeat';
}

export interface DialogueOption {
  id: string;
  label: string;
}

export interface NpcState {
  id: string;
  name: string;
  x: number;
  y: number;
  dialogue: string;
  spriteKind: string;
  speechIndex?: number;
  speakingMs?: number;
  options?: DialogueOption[];
}

export interface TrainingDummyState {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  hitAnimMs: number;
  totalDamageTaken?: number;
  lastHitTimerMs?: number;
}

export interface GameSnapshot {
  roomId: string;
  roomName: string;
  difficulty: DifficultyTier;
  status: 'playing' | 'victory' | 'defeat';
  floor: number;
  seed: number;
  elapsedSec: number;
  bossDefeated: boolean;
  portalReadyCount: number;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  props: PropState[];
  zones: FieldZoneState[];
  npcs: NpcState[];
  trainingDummies: TrainingDummyState[];
  events: FloatingEvent[];
  roomClearedFlags: { id: number; cleared: boolean; discovered: boolean }[];
}

export interface UserProfile {
  id: string;
  username: string;
  preferredClass: HeroClassId;
  lockedClass: HeroClassId;
  runsCompleted: number;
  highestFloor: number;
  totalKills: number;
  totalRevives: number;
  isAdmin?: boolean;
  level: number;
  xp: number;
  dexterity: number;
  vitality: number;
  strength: number;
  intelligence: number;
  faith: number;
  attributePoints: number;
}

export type ClientMessage =
  | { type: 'lobby:subscribe' }
  | {
      type: 'room:create';
      name: string;
      difficulty: DifficultyTier;
      seed?: number;
      heroClass: HeroClassId;
    }
  | {
      type: 'room:join';
      roomId: string;
      heroClass: HeroClassId;
    }
  | { type: 'room:leave' }
  | { type: 'player:input'; input: PlayerInputState }
  | { type: 'player:action'; action: 'tactical' | 'ult' | 'potion' | 'interact'; aimAngle: number }
  | { type: 'player:select_relic'; relicId: string }
  | { type: 'player:unequip_relic'; relicId: string }
  | { type: 'player:store_relic'; relicId: string }
  | { type: 'player:equip_stored_relic'; relicId: string }
  | { type: 'player:delete_relic'; relicId: string; fromStorage?: boolean }
  | { type: 'player:discard_potion'; count?: number }
  | { type: 'player:change_class'; heroClass: HeroClassId }
  | { type: 'player:ping'; label: string; x: number; y: number }
  | { type: 'chat:send'; text: string }
  | { type: 'room:restart' }
  | { type: 'admin:godmode'; enabled?: boolean }
  | { type: 'admin:toggle_speed'; enabled?: boolean }
  | { type: 'admin:add_gold'; amount?: number }
  | { type: 'admin:add_potions'; amount?: number }
  | { type: 'admin:set_level'; level?: number }
  | { type: 'admin:add_relic'; relicId: string }
  | { type: 'admin:spawn_dummy' }
  | { type: 'admin:teleport_floor'; floor: number }
  | { type: 'admin:spawn_entity'; kind: EnemyKind; count: number }
  | { type: 'admin:despawn_entity'; entityId: string }
  | { type: 'admin:clear_enemies' }
  | { type: 'admin:clear_summoned' }
  | { type: 'admin:heal_player' }
  | { type: 'admin:restore_energy' }
  | { type: 'admin:revive_all' }
  | { type: 'admin:summon_boss'; floor: number }
  | { type: 'admin:reset_boss' }
  | { type: 'admin:reset_room' }
  | { type: 'admin:toggle_ai'; enabled?: boolean }
  | { type: 'admin:add_attribute_points'; amount?: number }
  | { type: 'player:spend_attribute'; attribute: 'strength' | 'dexterity' | 'vitality' | 'intelligence' | 'faith' }
  | { type: 'player:reset_attributes' }
  | { type: 'player:dialogue_close' }
  | { type: 'player:dialogue_pick'; optionId: string }
  | { type: 'ping'; t: number };

export type ServerMessage =
  | { type: 'lobby:rooms'; rooms: RoomSummary[]; onlineCount: number }
  | { type: 'room:joined'; roomId: string; playerId: string; map: DungeonMap; snapshot: GameSnapshot; chat: ChatMessage[] }
  | { type: 'room:map'; map: DungeonMap }
  | { type: 'room:tick'; snapshot: GameSnapshot }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'room:left' }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number };
