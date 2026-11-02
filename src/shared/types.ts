export type HeroClassId = 'vanguard' | 'ranger' | 'arcanist' | 'cleric';

export type DifficultyTier = 'Normal' | 'Heroic' | 'Abyssal';

export type BiomeId = 'courtyard' | 'catacombs' | 'ember';

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  title: string;
  weapon: string;
  maxHp: number;
  speed: number;
  damage: number;
  attackCooldownMs: number;
  range: number;
  primaryColor: string;
  capeColor: string;
  accentColor: string;
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
    weapon: 'Greatsword & Kite Shield',
    maxHp: 145,
    speed: 175,
    damage: 26,
    attackCooldownMs: 420,
    range: 74,
    primaryColor: '#8B9BB4',
    capeColor: '#9E3333',
    accentColor: '#E2B45A',
    tacticalName: 'Bulwark Dash',
    tacticalDesc: 'Charge forward, stunning foes in path and granting +28 Shield to nearby allies.',
    tacticalCooldownMs: 4800,
    ultName: 'Aegis Ward',
    ultDesc: 'Deploy a sanctuary barrier that intercepts enemy projectiles and bolsters party defense.',
    ultCooldownMs: 13000,
  },
  ranger: {
    id: 'ranger',
    name: 'Ranger',
    title: 'Thornwood Marksman',
    weapon: 'Ashwood Longbow',
    maxHp: 105,
    speed: 205,
    damage: 21,
    attackCooldownMs: 340,
    range: 360,
    primaryColor: '#4E7A56',
    capeColor: '#2F4D38',
    accentColor: '#D6A856',
    tacticalName: 'Frost Volley',
    tacticalDesc: 'Loose a 5-arrow fan that pierces targets and slows enemy movement by 45%.',
    tacticalCooldownMs: 4200,
    ultName: 'Hunter Quarry',
    ultDesc: 'Mark nearby elites and bosses so all co-op allies deal +35% bonus strike damage.',
    ultCooldownMs: 11500,
  },
  arcanist: {
    id: 'arcanist',
    name: 'Arcanist',
    title: 'Astral Conduit',
    weapon: 'Runebound Spire',
    maxHp: 95,
    speed: 185,
    damage: 28,
    attackCooldownMs: 440,
    range: 330,
    primaryColor: '#5B629E',
    capeColor: '#3B3769',
    accentColor: '#7CC6FE',
    tacticalName: 'Astral Nova',
    tacticalDesc: 'Unleash 8 piercing arcane shards outward, knocking back surrounding monsters.',
    tacticalCooldownMs: 5000,
    ultName: 'Chrono Well',
    ultDesc: 'Anchor a stasis field that snares enemies and accelerates ally skill cooldowns.',
    ultCooldownMs: 13500,
  },
  cleric: {
    id: 'cleric',
    name: 'Cleric',
    title: 'Sunbrand Prelate',
    weapon: 'Dawnstar Mace',
    maxHp: 120,
    speed: 182,
    damage: 20,
    attackCooldownMs: 390,
    range: 290,
    primaryColor: '#C8C2B8',
    capeColor: '#B58938',
    accentColor: '#F4D378',
    tacticalName: 'Sanctified Pulse',
    tacticalDesc: 'Restore +32 HP to yourself and nearby co-op allies while searing adjacent foes.',
    tacticalCooldownMs: 5400,
    ultName: 'Solar Beacon',
    ultDesc: 'Consecrate ground that heals allies every second and rapidly revives downed teammates.',
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
    summary: 'Primary attacks unleash +1 additional projectile or cleave wave.',
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
    summary: 'Gain +22 regenerating Shield upon entering each new room combat.',
    accent: '#6E85C9',
  },
  {
    id: 'piercing_prism',
    name: 'Piercing Prism',
    category: 'Offense',
    summary: 'Projectiles and waves pierce +1 extra enemy target.',
    accent: '#A988E6',
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
  downed: boolean;
  downedTimerMs: number;
  reviveProgress: number; // 0 to 1
  skillCooldownMs: number;
  maxSkillCooldownMs: number;
  ultCooldownMs: number;
  maxUltCooldownMs: number;
  attackAnimMs: number;
  hasteMs: number;
  kills: number;
  damageDealt: number;
  revives: number;
  readyNextFloor: boolean;
  pendingRelicChoices: string[];
  connected: boolean;
}

export type EnemyKind = 'slime' | 'goblin' | 'skeleton' | 'cultist' | 'knight' | 'boss';

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
  state: 'idle' | 'chase' | 'windup' | 'recover';
  windupMs: number;
  targetX: number;
  targetY: number;
  markedMs: number;
  slowedMs: number;
  stunnedMs: number;
  elite: boolean;
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
  crit?: boolean;
  ttlMs: number;
  targetEnemyId?: string;
}

export interface PropState {
  id: string;
  kind: 'crate' | 'chest' | 'relic_chest' | 'shrine' | 'coin' | 'potion';
  x: number;
  y: number;
  opened: boolean;
  value: number;
}

export interface FieldZoneState {
  id: string;
  kind: 'aegis_dome' | 'solar_beacon' | 'chrono_well' | 'boss_slam';
  x: number;
  y: number;
  radius: number;
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
  events: FloatingEvent[];
  roomClearedFlags: { id: number; cleared: boolean; discovered: boolean }[];
}

export interface UserProfile {
  id: string;
  username: string;
  preferredClass: HeroClassId;
  runsCompleted: number;
  highestFloor: number;
  totalKills: number;
  totalRevives: number;
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
  | { type: 'player:change_class'; heroClass: HeroClassId }
  | { type: 'player:ping'; label: string; x: number; y: number }
  | { type: 'chat:send'; text: string }
  | { type: 'room:restart' };

export type ServerMessage =
  | { type: 'lobby:rooms'; rooms: RoomSummary[]; onlineCount: number }
  | { type: 'room:joined'; roomId: string; playerId: string; map: DungeonMap; snapshot: GameSnapshot; chat: ChatMessage[] }
  | { type: 'room:map'; map: DungeonMap }
  | { type: 'room:tick'; snapshot: GameSnapshot }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'room:left' }
  | { type: 'error'; message: string };
