import {
  HERO_CLASSES,
  RELIC_CATALOG,
  TILE_SIZE,
  type ChatMessage,
  type DifficultyTier,
  type DungeonMap,
  type EnemyState,
  type FieldZoneState,
  type FloatingEvent,
  type GameSnapshot,
  type HeroClassId,
  type NpcState,
  type PlayerInputState,
  type PlayerState,
  type ProjectileState,
  type PropState,
  type RoomSummary,
  type TrainingDummyState,
} from '../shared/types.ts';
import { generateDungeonFloor, generateTavernFloor, makeEnemy } from './dungeonGenerator.ts';

interface PlayerRuntime {
  state: PlayerState;
  input: PlayerInputState;
  attackCooldownMs: number;
  enteredRooms: Set<number>;
  attackCount: number;
}

const MAX_FLOORS_FOR_VICTORY = 5;

export class GameRoom {
  public readonly roomId: string;
  public readonly name: string;
  public hostName: string;
  public readonly difficulty: DifficultyTier;
  public readonly baseSeed: number;
  public readonly maxPlayers: number;

  public status: 'playing' | 'victory' | 'defeat' = 'playing';
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

  private players = new Map<string, PlayerRuntime>();
  private entitySeq = 1;
  private startedAt = Date.now();
  private zoneTickAccumMs = 0;
  private statusDotAccumMs = 0;
  private clericAuraAccumMs = 0;
  public onFloorClearedCallback?: (playerIds: string[], floor: number) => void;
  public onKillCallback?: (playerId: string) => void;
  public onReviveCallback?: (playerId: string) => void;

  constructor(opts: {
    roomId: string;
    name: string;
    hostName: string;
    difficulty: DifficultyTier;
    seed?: number;
  }) {
    this.roomId = opts.roomId;
    this.name = opts.name;
    this.hostName = opts.hostName;
    this.difficulty = opts.difficulty;
    this.maxPlayers = opts.roomId === 'TAVERN-HUB' ? 50 : 4;
    this.baseSeed =
      opts.seed && opts.seed > 0
        ? Math.floor(opts.seed)
        : Math.floor(100000 + Math.random() * 899999);
    const startFloor = opts.roomId === 'TAVERN-HUB' ? 0 : 1;
    this.loadFloor(startFloor, 1);
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.entitySeq++}`;
  }

  private loadFloor(floorNum: number, partySize: number): void {
    if (this.roomId === 'TAVERN-HUB') {
      floorNum = 0;
    }
    this.floor = floorNum;
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

    let idx = 0;
    for (const pr of this.players.values()) {
      const offsetAngle = (idx * Math.PI) / 2;
      pr.state.x = this.spawnPoint.x + Math.cos(offsetAngle) * 20;
      pr.state.y = this.spawnPoint.y + Math.sin(offsetAngle) * 20;
      pr.state.readyNextFloor = false;
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

  public restartRun(): DungeonMap {
    this.status = 'playing';
    this.startedAt = Date.now();
    for (const pr of this.players.values()) {
      const def = HERO_CLASSES[pr.state.heroClass];
      pr.state.level = 1;
      pr.state.xp = 0;
      pr.state.nextXp = 80;
      pr.state.maxHp = def.maxHp;
      pr.state.hp = def.maxHp;
      pr.state.shield = 0;
      pr.state.gold = 0;
      pr.state.potions = 2;
      pr.state.relics = [];
      pr.state.pendingRelicChoices = [];
      pr.state.downed = false;
      pr.state.downedTimerMs = 0;
      pr.state.reviveProgress = 0;
      pr.state.kills = 0;
      pr.state.damageDealt = 0;
      pr.state.revives = 0;
      pr.state.skillCooldownMs = 0;
      pr.state.ultCooldownMs = 0;
    }
    const restartFloor = this.roomId === 'TAVERN-HUB' ? 0 : 1;
    this.loadFloor(restartFloor, this.players.size);
    this.pushSystemChat(
      this.roomId === 'TAVERN-HUB'
        ? `Sanctuary Tavern refreshed.`
        : `Expedition restarted on Seed ${this.baseSeed}.`
    );
    return this.map;
  }

  public addOrReconnectPlayer(
    playerId: string,
    username: string,
    heroClass: HeroClassId,
    isAdmin = false
  ): PlayerState {
    const existing = this.players.get(playerId);
    if (existing) {
      existing.state.connected = true;
      existing.state.username = username;
      existing.state.isAdmin = isAdmin || Boolean(existing.state.isAdmin);
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
      shield: 15,
      level: 1,
      xp: 0,
      nextXp: 80,
      gold: 0,
      potions: 2,
      relics: [],
      downed: false,
      downedTimerMs: 0,
      reviveProgress: 0,
      skillCooldownMs: 0,
      maxSkillCooldownMs: def.tacticalCooldownMs,
      ultCooldownMs: 0,
      maxUltCooldownMs: def.ultCooldownMs,
      attackAnimMs: 0,
      hasteMs: 0,
      kills: 0,
      damageDealt: 0,
      revives: 0,
      readyNextFloor: false,
      pendingRelicChoices: [],
      connected: true,
      isAdmin: isAdmin,
      godMode: false,
      speedBoost: false,
      dexterity: 10,
      vitality: 10,
      attributePoints: 0,
    };

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
    });

    this.pushSystemChat(`${username} (${def.name}) joined the expedition.`);
    return state;
  }

  public removePlayer(playerId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    this.players.delete(playerId);
    this.pushSystemChat(`${pr.state.username} departed the party.`);
    if (this.players.size > 0 && pr.state.username === this.hostName) {
      const first = this.players.values().next().value as PlayerRuntime | undefined;
      if (first) this.hostName = first.state.username;
    }
  }

  public getPlayerCount(): number {
    return this.players.size;
  }

  public hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
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
    return msg;
  }

  public pushSystemChat(text: string): ChatMessage {
    return this.pushChat('Sanctuary', text, true);
  }

  public updateInput(playerId: string, input: PlayerInputState): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.input = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      attack: Boolean(input.attack),
      aimAngle: Number.isFinite(input.aimAngle) ? input.aimAngle : 0,
      stickX: typeof input.stickX === 'number' ? input.stickX : undefined,
      stickY: typeof input.stickY === 'number' ? input.stickY : undefined,
    };
    pr.state.aimAngle = pr.input.aimAngle;
  }

  public changeClass(playerId: string, heroClass: HeroClassId): void {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.downed) return;
    const def = HERO_CLASSES[heroClass];
    if (!def) return;
    const hpRatio = pr.state.hp / Math.max(1, pr.state.maxHp);
    pr.state.heroClass = heroClass;
    const bonusHp = pr.state.relics.includes('bastion_pauldron') ? 30 : 0;
    pr.state.maxHp = def.maxHp + (pr.state.level - 1) * 12 + bonusHp;
    pr.state.hp = Math.max(1, Math.round(pr.state.maxHp * hpRatio));
    pr.state.maxSkillCooldownMs = def.tacticalCooldownMs;
    pr.state.maxUltCooldownMs = def.ultCooldownMs;
    this.emitEvent('status', pr.state.x, pr.state.y - 22, def.name, def.accentColor);
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

  public selectRelic(playerId: string, relicId: string): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (!pr.state.pendingRelicChoices.includes(relicId)) return;
    pr.state.pendingRelicChoices = [];
    if (!pr.state.relics.includes(relicId)) {
      pr.state.relics.push(relicId);
    }
    if (relicId === 'bastion_pauldron') {
      pr.state.maxHp += 30;
      pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + 30);
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (relic) {
      this.emitEvent('status', pr.state.x, pr.state.y - 24, `+ ${relic.name}`, relic.accent);
      this.pushSystemChat(`${pr.state.username} claimed relic: ${relic.name}.`);
    }
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
      nextState ? ' GOD MODE ON' : '️ GOD MODE OFF',
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
    p.level = Math.max(1, Math.min(100, targetLevel));
    p.xp = 0;
    p.nextXp = Math.round(80 * Math.pow(1.35, p.level - 1));
    const bonusHp = p.relics.includes('bastion_pauldron') ? 30 : 0;
    p.maxHp = def.maxHp + (p.level - 1) * 12 + bonusHp;
    p.hp = p.maxHp;
    this.emitEvent('status', p.x, p.y - 26, ` Level ${p.level} Set!`, '#F4D378');
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
      p.maxHp += 30;
      p.hp = Math.min(p.maxHp, p.hp + 30);
    }
    this.emitEvent('status', p.x, p.y - 24, `+ ${relic.name}`, relic.accent);
  }

  public updatePlayerAttributes(
    playerId: string,
    dexterity: number,
    vitality: number,
    attributePoints: number
  ): void {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    p.dexterity = dexterity;
    p.vitality = vitality;
    p.attributePoints = attributePoints;

    const def = HERO_CLASSES[p.heroClass];
    const bonusHp = p.relics.includes('bastion_pauldron') ? 30 : 0;
    const vitBonus = (p.vitality - 10) * 5;
    const oldMax = p.maxHp;
    p.maxHp = def.maxHp + (p.level - 1) * 12 + bonusHp + vitBonus;
    p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.maxHp, p.hp);
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
    this.emitEvent('status', dummy.x, dummy.y - 20, '️ Training Dummy Spawned', '#FBBF24');
  }

  private rollRelicChoices(owned: string[]): string[] {
    const available = RELIC_CATALOG.filter((r) => !owned.includes(r.id));
    const pool = available.length >= 3 ? [...available] : [...RELIC_CATALOG];
    const picked: string[] = [];
    while (picked.length < 3 && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx].id);
      pool.splice(idx, 1);
    }
    return picked;
  }

  public performAction(
    playerId: string,
    action: 'tactical' | 'ult' | 'potion' | 'interact',
    aimAngle: number
  ): { floorChanged?: DungeonMap } {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== 'playing') return {};
    const p = pr.state;
    if (p.downed) return {};
    p.aimAngle = Number.isFinite(aimAngle) ? aimAngle : p.aimAngle;

    const def = HERO_CLASSES[p.heroClass];
    const cdrMult = p.relics.includes('hourglass_shard') ? 0.75 : 1.0;

    if (action === 'potion') {
      if (p.potions > 0 && p.hp < p.maxHp) {
        p.potions -= 1;
        const healAmt = Math.round(p.maxHp * 0.45);
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        this.emitEvent('heal', p.x, p.y - 20, `+${healAmt} HP`, '#5CD68D');
      }
      return {};
    }

    if (action === 'interact') {
      // 1. NPC Conversations
      for (const npc of this.npcs) {
        const dist = Math.hypot(npc.x - p.x, npc.y - p.y);
        if (dist <= 68) {
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
              'Need to blow off steam after a tough run? Practice your combo strikes on the dummies in the East wing!',
            ];
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
          npc.speakingMs = 5000;

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
        if (prop.opened) continue;
        const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
        if (dist <= 62) {
          prop.opened = true;
          if (prop.kind === 'chest' || prop.kind === 'crate') {
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
          } else if (prop.kind === 'relic_chest') {
            for (const ally of this.players.values()) {
              ally.state.pendingRelicChoices = this.rollRelicChoices(ally.state.relics);
            }
            this.emitEvent('status', prop.x, prop.y - 20, 'Relic Vault Opened', '#E8CE76');
            this.pushSystemChat(`${p.username} unlocked an Ancient Relic Chest for the party.`);
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
      if (p.skillCooldownMs > 0) return {};
      p.skillCooldownMs = Math.round(def.tacticalCooldownMs * cdrMult);
      p.maxSkillCooldownMs = p.skillCooldownMs;
      p.attackAnimMs = 240;

      const dmgMult = this.computeDamageMult(p);

      if (p.relics.includes('oathbound_censer')) {
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 180) {
            ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + 14);
          }
        }
      }

      if (p.heroClass === 'vanguard') {
        const dashDist = 92;
        this.moveWithCollision(
          p,
          Math.cos(p.aimAngle) * dashDist,
          Math.sin(p.aimAngle) * dashDist,
          12
        );
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 170) {
            ally.state.shield = Math.min(60, ally.state.shield + 28);
            this.emitEvent('status', ally.state.x, ally.state.y - 22, '+28 Shield', '#93C5FD');
          }
        }
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 84) {
            enemy.stunnedMs = 1700;
            this.damageEnemy(enemy, Math.round(32 * dmgMult), p, false);
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 84) {
            this.damageDummy(dummy, Math.round(32 * dmgMult), p, false);
          }
        }
      } else if (p.heroClass === 'ranger') {
        const baseDmg = Math.round(18 * dmgMult);
        for (let i = -2; i <= 2; i++) {
          const ang = p.aimAngle + i * 0.14;
          this.spawnProjectile({
            ownerType: 'player',
            ownerId: p.id,
            style: 'arrow',
            x: p.x + Math.cos(ang) * 16,
            y: p.y + Math.sin(ang) * 16,
            vx: Math.cos(ang) * 430,
            vy: Math.sin(ang) * 430,
            angle: ang,
            radius: 5,
            damage: baseDmg,
            pierce: 2,
            slowOnHit: true,
            ttlMs: 950,
          });
        }
      } else if (p.heroClass === 'arcanist') {
        const baseDmg = Math.round(24 * dmgMult);
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          this.spawnProjectile({
            ownerType: 'player',
            ownerId: p.id,
            style: 'arcane',
            x: p.x + Math.cos(ang) * 14,
            y: p.y + Math.sin(ang) * 14,
            vx: Math.cos(ang) * 340,
            vy: Math.sin(ang) * 340,
            angle: ang,
            radius: 7,
            damage: baseDmg,
            pierce: 2,
            ttlMs: 850,
          });
        }
      } else if (p.heroClass === 'cleric') {
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 210) {
            const heal = 32;
            ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + heal);
            this.emitEvent('heal', ally.state.x, ally.state.y - 20, `+${heal} HP`, '#6EE7B7');
          }
        }
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 135) {
            this.damageEnemy(enemy, Math.round(28 * dmgMult), p, false);
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 135) {
            this.damageDummy(dummy, Math.round(28 * dmgMult), p, false);
          }
        }
      }
      return {};
    }

    if (action === 'ult') {
      if (p.ultCooldownMs > 0) return {};
      p.ultCooldownMs = Math.round(def.ultCooldownMs * cdrMult);
      p.maxUltCooldownMs = p.ultCooldownMs;

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
        const tx = p.x + Math.cos(p.aimAngle) * 110;
        const ty = p.y + Math.sin(p.aimAngle) * 110;
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'chrono_well',
          x: tx,
          y: ty,
          radius: 100,
          ttlMs: 5000,
          maxTtlMs: 5000,
          ownerId: p.id,
        });
        this.emitEvent('status', tx, ty - 20, 'Chrono Well', '#7CC6FE');
      } else if (p.heroClass === 'cleric') {
        this.zones.push({
          id: this.nextId('zone'),
          kind: 'solar_beacon',
          x: p.x,
          y: p.y,
          radius: 115,
          ttlMs: 6000,
          maxTtlMs: 6000,
          ownerId: p.id,
        });
        this.emitEvent('status', p.x, p.y - 26, 'Solar Beacon', '#FDE68A');
      }
      return {};
    }

    return {};
  }

  private computeDamageMult(p: PlayerState): number {
    let mult = 1 + (p.level - 1) * 0.1;
    // Dexterity bonus: +1% damage per point above 10
    const dexBonus = Math.max(0, (p.dexterity - 10) * 0.012);
    mult += dexBonus;
    if (p.relics.includes('sunfire_signet')) mult *= 1.24;
    return mult;
  }

  public tick(dtMs: number): void {
    if (this.status !== 'playing' || this.players.size === 0) return;

    const dtSec = dtMs / 1000;
    this.zoneTickAccumMs += dtMs;
    const pulseZonesNow = this.zoneTickAccumMs >= 500;
    if (pulseZonesNow) this.zoneTickAccumMs = 0;

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

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.ttlMs -= dtMs;

      if (z.kind === 'frost_nova' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 24 + this.floor * 4, 'elemental');
            this.emitEvent('status', pr.state.x, pr.state.y - 14, ' FROST NOVA!', '#38BDF8');
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
            this.emitEvent('status', pr.state.x, pr.state.y - 14, ' BURNING!', '#EF4444');
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
              this.emitEvent('status', pr.state.x, pr.state.y - 14, ' VOID BURST!', '#A855F7');
            }
          }
          this.zones.splice(i, 1);
          continue;
        }
      }

      if (z.kind === 'supernova') {
        const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
        const currentRadius = z.radius * progress;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (Math.abs(dist - currentRadius) <= 18) {
              this.damagePlayer(pr.state, 26 + this.floor * 4, 'elemental');
              this.emitEvent('status', pr.state.x, pr.state.y - 14, ' SUPERNOVA!', '#F472B6');
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
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
          for (const pr of this.players.values()) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (dist <= z.radius) {
              if (pr.state.downed) {
                pr.state.reviveProgress = Math.min(1, pr.state.reviveProgress + 0.38);
                if (pr.state.reviveProgress >= 1) {
                  this.completeRevive(pr.state, z.ownerId);
                }
              } else if (pr.state.hp < pr.state.maxHp) {
                pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + 9);
              }
            }
          }
        } else if (z.kind === 'chrono_well') {
          for (const enemy of this.enemies) {
            if (Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius) {
              enemy.slowedMs = 900;
            }
          }
          for (const pr of this.players.values()) {
            if (Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
              pr.state.skillCooldownMs = Math.max(0, pr.state.skillCooldownMs - 350);
            }
          }
        } else if (z.kind === 'star_rift') {
          const riftDmg = 14 + this.floor * 2;
          const ownerPr = this.players.get(z.ownerId);
          for (const enemy of this.enemies) {
            if (enemy.hp > 0 && Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius) {
              const pullAngle = Math.atan2(z.y - enemy.y, z.x - enemy.x);
              enemy.x += Math.cos(pullAngle) * 5;
              enemy.y += Math.sin(pullAngle) * 5;
              this.damageEnemy(enemy, riftDmg, ownerPr ? ownerPr.state : null, false);
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius) {
              this.damageDummy(dummy, riftDmg, ownerPr ? ownerPr.state : null, false);
            }
          }
        }
      }
    }

    // Cleric Passive: Radiant Aura (2.0s Periodic Golden Healing Warmth Pulse)
    this.clericAuraAccumMs += dtMs;
    if (this.clericAuraAccumMs >= 2000) {
      this.clericAuraAccumMs = 0;
      for (const pr of this.players.values()) {
        const cleric = pr.state;
        if (cleric.heroClass === 'cleric' && !cleric.downed && cleric.connected) {
          for (const allyPr of this.players.values()) {
            const ally = allyPr.state;
            if (!ally.downed && ally.connected && Math.hypot(ally.x - cleric.x, ally.y - cleric.y) <= 140) {
              if (ally.hp < ally.maxHp) {
                const healAmt = ally.hp < ally.maxHp * 0.5 ? 6 : 4;
                ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                this.emitEvent('heal', ally.x, ally.y - 18, ` Radiant Aura +${healAmt}`, '#FDE047');
              }
            }
          }
        }
      }
    }

    for (const pr of this.players.values()) {
      const p = pr.state;
      pr.attackCooldownMs = Math.max(0, pr.attackCooldownMs - dtMs);
      p.skillCooldownMs = Math.max(0, p.skillCooldownMs - dtMs);
      p.ultCooldownMs = Math.max(0, p.ultCooldownMs - dtMs);
      p.attackAnimMs = Math.max(0, p.attackAnimMs - dtMs);
      p.hasteMs = Math.max(0, p.hasteMs - dtMs);

      if (p.downed) {
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
          const reviveSpeedMult = reviver.heroClass === 'cleric' ? 1.4 : 1.0;
          p.reviveProgress = Math.min(1, p.reviveProgress + (dtSec / 2.2) * reviveSpeedMult);
          if (p.reviveProgress >= 1) {
            this.completeRevive(p, reviver.id);
          }
        } else {
          p.reviveProgress = Math.max(0, p.reviveProgress - dtSec * 0.25);
        }
        continue;
      }

      const def = HERO_CLASSES[p.heroClass];
      let moveSpeed = def.speed;
      if (p.relics.includes('zephyr_greaves')) moveSpeed *= 1.18;
      if (p.hasteMs > 0) moveSpeed *= 1.22;
      if (p.speedBoost) moveSpeed *= 1.8;

      let mx = 0;
      let my = 0;

      // Check analog touch stick input first, otherwise fallback to digital WASD/arrows
      if (
        typeof pr.input.stickX === 'number' &&
        typeof pr.input.stickY === 'number' &&
        (Math.abs(pr.input.stickX) > 0.05 || Math.abs(pr.input.stickY) > 0.05)
      ) {
        const len = Math.hypot(pr.input.stickX, pr.input.stickY);
        const clampedLen = Math.min(1, len);
        mx = (pr.input.stickX / len) * clampedLen;
        my = (pr.input.stickY / len) * clampedLen;
      } else {
        mx = (pr.input.right ? 1 : 0) - (pr.input.left ? 1 : 0);
        my = (pr.input.down ? 1 : 0) - (pr.input.up ? 1 : 0);
        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          mx /= len;
          my /= len;
        }
      }

      if (mx !== 0 || my !== 0) {
        p.vx = mx * moveSpeed;
        p.vy = my * moveSpeed;
        this.moveWithCollision(p, p.vx * dtSec, p.vy * dtSec, 9);
      } else {
        p.vx = 0;
        p.vy = 0;
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
      }

      for (const prop of this.props) {
        if (!prop.opened && prop.kind === 'coin') {
          if (Math.hypot(prop.x - p.x, prop.y - p.y) <= 34) {
            prop.opened = true;
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            this.emitEvent('gold', prop.x, prop.y - 10, `+${prop.value}g`, '#F4D378');
          }
        }
      }

      if (pr.input.attack && pr.attackCooldownMs <= 0 && p.pendingRelicChoices.length === 0) {
        const hasteFactor = p.hasteMs > 0 ? 0.8 : 1;
        pr.attackCooldownMs = Math.round(def.attackCooldownMs * hasteFactor);
        p.attackAnimMs = 190;
        this.firePrimaryAttack(p);
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
        this.pushSystemChat(`The expedition has fallen on Floor ${this.floor}.`);
        return;
      }
    }
 
    this.statusDotAccumMs += dtMs;
    const pulseDotNow = this.statusDotAccumMs >= 650;
    if (pulseDotNow) this.statusDotAccumMs = 0;

    for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
      const enemy = this.enemies[eIdx];
      enemy.markedMs = Math.max(0, enemy.markedMs - dtMs);
      enemy.slowedMs = Math.max(0, enemy.slowedMs - dtMs);
      enemy.stunnedMs = Math.max(0, enemy.stunnedMs - dtMs);
      enemy.burnedMs = Math.max(0, enemy.burnedMs - dtMs);
      enemy.frozenMs = Math.max(0, enemy.frozenMs - dtMs);
      enemy.shockedMs = Math.max(0, enemy.shockedMs - dtMs);
      enemy.poisonedMs = Math.max(0, enemy.poisonedMs - dtMs);
      enemy.bleedingMs = Math.max(0, enemy.bleedingMs - dtMs);

      // Periodic Status Damage (DoTs) with Resistances
      if (pulseDotNow && enemy.hp > 0) {
        const res = enemy.resistances || {
          physical: 0,
          fire: 0,
          frost: 0,
          lightning: 0,
          poison: 0,
          bleed: 0,
          tenacity: 0,
        };

        if (enemy.burnedMs > 0) {
          const rawBurn = 7 + this.floor;
          const burnDmg = Math.max(1, Math.round(rawBurn * (1 - res.fire)));
          enemy.hp -= burnDmg;
          this.emitEvent('damage', enemy.x + (Math.random() * 12 - 6), enemy.y - enemy.radius - 8, ` ${burnDmg}`, '#F97316');
        }
        if (enemy.poisonedMs > 0) {
          const rawPoison = 5 + this.floor;
          const poisonDmg = Math.max(1, Math.round(rawPoison * (1 - res.poison)));
          enemy.hp -= poisonDmg;
          this.emitEvent('damage', enemy.x + (Math.random() * 12 - 6), enemy.y - enemy.radius - 8, ` ${poisonDmg}`, '#22C55E');
        }
        if (enemy.bleedingMs > 0) {
          const moving = Math.hypot(enemy.vx, enemy.vy) > 8;
          const rawBleed = (moving ? 14 : 7) + this.floor;
          const bleedDmg = Math.max(1, Math.round(rawBleed * (1 - res.bleed)));
          enemy.hp -= bleedDmg;
          this.emitEvent('damage', enemy.x + (Math.random() * 12 - 6), enemy.y - enemy.radius - 8, `🩸 ${bleedDmg}`, '#DC2626');
        }
        if (enemy.hp <= 0) {
          this.processEnemyDeath(enemy, null);
          continue;
        }
      }

      if (enemy.stunnedMs > 0 || enemy.frozenMs > 0) {
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }

      let nearest: PlayerState | null = null;
      let nearestDist = Infinity;
      const enemyRoom = this.findRoomContaining(enemy.x, enemy.y);
      const isBoss = enemy.kind === 'boss';
      const isRanged = enemy.kind === 'skeleton' || enemy.kind === 'cultist';
      const isAlerted = enemy.markedMs > 0 || enemy.hp < enemy.maxHp;

      for (const pr of this.players.values()) {
        if (pr.state.downed || !pr.state.connected) continue;
        const d = Math.hypot(pr.state.x - enemy.x, pr.state.y - enemy.y);

        // Sensible detection ranges (reduced from blind 350px to natural room & line-of-sight scopes)
        const playerRoom = this.findRoomContaining(pr.state.x, pr.state.y);
        const inSameRoom = !!(enemyRoom && playerRoom && enemyRoom.id === playerRoom.id);

        let maxDetectDist = isBoss ? 380 : inSameRoom ? (isRanged ? 220 : 190) : (isRanged ? 175 : 145);
        if (isAlerted) maxDetectDist += 45;

        // Skip if outside detection range
        if (d > maxDetectDist) continue;

        // If not in the same room, line of sight is strictly required (cannot detect through solid walls)
        if (!inSameRoom && !isBoss && !isAlerted) {
          if (!this.hasLineOfSight(enemy.x, enemy.y, pr.state.x, pr.state.y)) {
            continue;
          }
        }

        if (d < nearestDist) {
          nearestDist = d;
          nearest = pr.state;
        }
      }

      if (!nearest) {
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

      if (enemy.kind === 'slime' || enemy.kind === 'goblin' || enemy.kind === 'knight') {
        const baseSpd =
          enemy.kind === 'goblin' ? 128 : enemy.kind === 'knight' ? 96 : 86;
        const spd = baseSpd * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        }
        if (nearestDist <= enemy.radius + 22 && enemy.windupMs <= 0) {
          let baseHit = enemy.kind === 'knight' ? 19 : enemy.kind === 'goblin' ? 13 : 11;
          if (enemy.poisonedMs > 0) baseHit = Math.round(baseHit * 0.7);
          this.damagePlayer(nearest, baseHit + this.floor * 2);
          enemy.windupMs = enemy.kind === 'goblin' ? 850 : 1100;
        }
      } else if (enemy.kind === 'shadow_stalker') {
        // Fast, elusive void ambusher that dashes toward players
        const spd = 138 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        }
        if (nearestDist <= enemy.radius + 24 && enemy.windupMs <= 0) {
          let baseHit = 22;
          if (enemy.poisonedMs > 0) baseHit = Math.round(baseHit * 0.7);
          this.damagePlayer(nearest, baseHit + this.floor * 2, 'physical');
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

        if (enemy.windupMs <= 0) {
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

        if (enemy.windupMs <= 0) {
          if (enemy.kind === 'skeleton') {
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
      } else if (enemy.kind === 'boss') {
        // Enrage transition when HP drops to <= 50%
        if (!enemy.enraged && enemy.hp <= enemy.maxHp * 0.5) {
          enemy.enraged = true;
          this.emitEvent('crit', enemy.x, enemy.y - enemy.radius - 24, ' ENRAGED! ', '#EF4444');
          this.pushSystemChat(`️ ${enemy.name} has entered an ENRAGED frenzy! Movement and attack speed surging!`);
        }

        // Minion Summon thresholds: at 70% and 35% HP
        const hpRatio = enemy.hp / enemy.maxHp;
        const curWave = enemy.summonWave || 0;
        if (hpRatio <= 0.70 && curWave < 1) {
          enemy.summonWave = 1;
          this.summonBossAdds(enemy);
        } else if (hpRatio <= 0.35 && curWave < 2) {
          enemy.summonWave = 2;
          this.summonBossAdds(enemy);
        }

        const isEnraged = !!enemy.enraged;
        const isCatacombs = this.map.biome === 'catacombs' || this.floor === 2;
        const isEmber = this.map.biome === 'ember' || this.floor === 3;
        const isVoid = this.map.biome === 'void' || this.floor === 4;
        const isAstral = this.map.biome === 'astral' || this.floor === 5;
        const baseSpd = isEnraged ? 142 : 110;
        const spd = baseSpd * slowFactor;

        // Bull rush charge execution
        if (enemy.charging) {
          enemy.chargeTimerMs = (enemy.chargeTimerMs || 0) - dtMs;
          const chargeSpd = 310 * slowFactor;
          const cAngle = enemy.chargeAngle ?? angle;
          this.moveWithCollision(
            enemy,
            Math.cos(cAngle) * chargeSpd * dtSec,
            Math.sin(cAngle) * chargeSpd * dtSec,
            24
          );
          // Trample damage to nearby players
          for (const pr of this.players.values()) {
            if (!pr.state.downed && Math.hypot(pr.state.x - enemy.x, pr.state.y - enemy.y) <= enemy.radius + 18) {
              this.damagePlayer(pr.state, 24 + this.floor * 4, 'physical');
              this.emitEvent('damage', pr.state.x, pr.state.y - 14, 'TRAMPLED!', '#EF4444');
            }
          }
          if ((enemy.chargeTimerMs || 0) <= 0) {
            enemy.charging = false;
            enemy.windupMs = isEnraged ? 550 : 850;
          }
          continue;
        }

        if (nearestDist > 68) {
          this.moveWithCollision(
            enemy,
            Math.cos(angle) * spd * dtSec,
            Math.sin(angle) * spd * dtSec,
            22
          );
        }

        if (enemy.windupMs <= 0) {
          const patternChoice = Math.random();

          if (this.floor === 1) {
            // ==========================================
            // FLOOR 1 BOSS: Warden Malakor (Outer Bailey)
            // ==========================================
            if (patternChoice < 0.35) {
              // 1. Shield Wall (Iron Bulwark stance: -60% damage for 3s)
              enemy.shieldWallMs = 3000;
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 20, ' SHIELD WALL!', '#60A5FA');
              // Front shockwave
              for (let off = -0.3; off <= 0.3; off += 0.3) {
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
                  radius: 9,
                  damage: 18,
                  pierce: 1,
                  ttlMs: 1400,
                });
              }
              enemy.windupMs = isEnraged ? 800 : 1200;
            } else if (patternChoice < 0.70) {
              // 2. Vanguard Triple Cleave
              for (let off = -0.28; off <= 0.28; off += 0.28) {
                const a = angle + off;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'slash',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 260,
                  vy: Math.sin(a) * 260,
                  angle: a,
                  radius: 10,
                  damage: 22,
                  pierce: 1,
                  ttlMs: 1600,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, ' CLEAVE!', '#EF4444');
              enemy.windupMs = isEnraged ? 700 : 1000;
            } else {
              // 3. Shield Rush Charge
              enemy.charging = true;
              enemy.chargeAngle = angle;
              enemy.chargeTimerMs = 580;
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, 'CHARGING!', '#F59E0B');
              enemy.windupMs = isEnraged ? 700 : 950;
            }
          } else if (this.floor === 2 || isCatacombs) {
            // ==========================================
            // FLOOR 2 BOSS: Archlich Vaelor (Sunken Crypt)
            // ==========================================
            if (patternChoice < 0.40) {
              // 1. Frost Nova & Glacial Shackles (3 Frost Circles)
              for (let k = 0; k < 3; k++) {
                const prList = Array.from(this.players.values()).filter((p) => !p.state.downed);
                const targetState = prList[k % prList.length]?.state || nearest;
                const offsetX = k === 0 ? 0 : k === 1 ? -40 : 40;
                const offsetY = k === 0 ? 0 : k === 1 ? 30 : -30;
                this.zones.push({
                  id: this.nextId('zone'),
                  kind: 'frost_nova',
                  x: targetState.x + offsetX,
                  y: targetState.y + offsetY,
                  radius: 72,
                  ttlMs: 750,
                  maxTtlMs: 750,
                  ownerId: enemy.id,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 20, ' FROST NOVA!', '#38BDF8');
              enemy.windupMs = isEnraged ? 750 : 1100;
            } else if (patternChoice < 0.75) {
              // 2. Seeking Soul Orb Volley (Homing Cyan Soul Wisps)
              for (let k = 0; k < 6; k++) {
                const a = angle + (k - 2.5) * 0.22;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'voidorb',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 250,
                  vy: Math.sin(a) * 250,
                  angle: a,
                  radius: 8,
                  damage: 22,
                  pierce: 1,
                  ttlMs: 2200,
                  slowOnHit: true,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, ' SOUL HAIL!', '#A855F7');
              enemy.windupMs = isEnraged ? 700 : 1000;
            } else {
              // 3. Necrotic Death Ring
              const count = isEnraged ? 16 : 12;
              for (let k = 0; k < count; k++) {
                const a = (k * Math.PI * 2) / count;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'voidorb',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 230,
                  vy: Math.sin(a) * 230,
                  angle: a,
                  radius: 7,
                  damage: 20,
                  pierce: 1,
                  ttlMs: 2000,
                });
              }
              enemy.windupMs = isEnraged ? 800 : 1150;
            }
          } else if (this.floor === 3 || isEmber) {
            // ==========================================
            // FLOOR 3 BOSS: Ignis, Cinder Sovereign (Bastion)
            // ==========================================
            if (patternChoice < 0.40) {
              // 1. Magma Eruption Pillars
              for (let k = 0; k < 3; k++) {
                const prList = Array.from(this.players.values()).filter((p) => !p.state.downed);
                const targetState = prList[k % prList.length]?.state || nearest;
                this.zones.push({
                  id: this.nextId('zone'),
                  kind: 'magma_pillar',
                  x: targetState.x + (Math.random() * 50 - 25),
                  y: targetState.y + (Math.random() * 50 - 25),
                  radius: 84,
                  ttlMs: 650,
                  maxTtlMs: 650,
                  ownerId: enemy.id,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 20, ' MAGMA ERUPTION!', '#EF4444');
              enemy.windupMs = isEnraged ? 700 : 1050;
            } else if (patternChoice < 0.75) {
              // 2. Ignis Firestorm Spiral
              const count = isEnraged ? 18 : 14;
              const rot = Math.random() * Math.PI;
              for (let k = 0; k < count; k++) {
                const a = rot + (k * Math.PI * 2) / count;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'fireball',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 270,
                  vy: Math.sin(a) * 270,
                  angle: a,
                  radius: 9,
                  damage: 26,
                  pierce: 1,
                  ttlMs: 2400,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, ' FIRESTORM!', '#F59E0B');
              enemy.windupMs = isEnraged ? 750 : 1100;
            } else {
              // 3. Volcanic Core Slam
              this.zones.push({
                id: this.nextId('zone'),
                kind: 'boss_slam',
                x: nearest.x,
                y: nearest.y,
                radius: 96,
                ttlMs: isEnraged ? 650 : 800,
                maxTtlMs: isEnraged ? 650 : 800,
                ownerId: enemy.id,
              });
              enemy.windupMs = isEnraged ? 650 : 950;
            }
          } else if (this.floor === 4 || isVoid) {
            // ==========================================
            // FLOOR 4 BOSS: Void-Eater Malice (Shadow Chasm)
            // ==========================================
            if (patternChoice < 0.35) {
              // 1. Gravitational Singularity (Pulls all heroes towards center!)
              this.zones.push({
                id: this.nextId('zone'),
                kind: 'singularity',
                x: nearest.x,
                y: nearest.y,
                radius: 115,
                ttlMs: 1800,
                maxTtlMs: 1800,
                ownerId: enemy.id,
              });
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 20, ' SINGULARITY!', '#A855F7');
              enemy.windupMs = isEnraged ? 800 : 1200;
            } else if (patternChoice < 0.70) {
              // 2. Void Step Teleport & Scythe Arc
              enemy.x = nearest.x + (Math.random() < 0.5 ? -90 : 90);
              enemy.y = nearest.y + (Math.random() < 0.5 ? -90 : 90);
              const newAngle = Math.atan2(nearest.y - enemy.y, nearest.x - enemy.x);
              for (let off = -0.4; off <= 0.4; off += 0.2) {
                const a = newAngle + off;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'voidorb',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 290,
                  vy: Math.sin(a) * 290,
                  angle: a,
                  radius: 8,
                  damage: 30,
                  pierce: 1,
                  ttlMs: 1800,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, ' VOID STEP!', '#E879F9');
              enemy.windupMs = isEnraged ? 650 : 950;
            } else {
              // 3. Abyssal Nova Spread
              const count = isEnraged ? 20 : 16;
              for (let k = 0; k < count; k++) {
                const a = (k * Math.PI * 2) / count;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'voidorb',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 280,
                  vy: Math.sin(a) * 280,
                  angle: a,
                  radius: 8,
                  damage: 28,
                  pierce: 1,
                  ttlMs: 2200,
                });
              }
              enemy.windupMs = isEnraged ? 750 : 1100;
            }
          } else {
            // ==========================================
            // FLOOR 5 BOSS: Archon of Nothingness (Void Spire)
            // ==========================================
            if (patternChoice < 0.35) {
              // 1. Celestial Supernova Ring (Expanding cosmic shockwave)
              this.zones.push({
                id: this.nextId('zone'),
                kind: 'supernova',
                x: enemy.x,
                y: enemy.y,
                radius: 140,
                ttlMs: 1200,
                maxTtlMs: 1200,
                ownerId: enemy.id,
              });
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 20, ' SUPERNOVA NOVA!', '#F472B6');
              enemy.windupMs = isEnraged ? 850 : 1250;
            } else if (patternChoice < 0.70) {
              // 2. Orbital Starlight Beams (4 targeted beams)
              for (let k = 0; k < 4; k++) {
                const prList = Array.from(this.players.values()).filter((p) => !p.state.downed);
                const targetState = prList[k % prList.length]?.state || nearest;
                this.zones.push({
                  id: this.nextId('zone'),
                  kind: 'starlight_beam',
                  x: targetState.x + (Math.random() * 60 - 30),
                  y: targetState.y + (Math.random() * 60 - 30),
                  radius: 70,
                  ttlMs: 800,
                  maxTtlMs: 800,
                  ownerId: enemy.id,
                });
              }
              this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 18, ' STARBEAM CASCADE!', '#38BDF8');
              enemy.windupMs = isEnraged ? 750 : 1050;
            } else {
              // 3. Cosmic Arc Spiral
              const count = isEnraged ? 22 : 18;
              const rot = Math.random() * Math.PI;
              for (let k = 0; k < count; k++) {
                const a = rot + (k * Math.PI * 2) / count;
                this.spawnProjectile({
                  ownerType: 'enemy',
                  ownerId: enemy.id,
                  style: 'arcane',
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 310,
                  vy: Math.sin(a) * 310,
                  angle: a,
                  radius: 8,
                  damage: 32,
                  pierce: 1,
                  ttlMs: 2400,
                });
              }
              enemy.windupMs = isEnraged ? 700 : 1000;
            }
          }
        }
      }
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.ttlMs -= dtMs;
      if (proj.ttlMs <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Homing guidance for player projectiles towards target enemy or training dummy
      if (proj.ownerType === 'player' && proj.targetEnemyId) {
        let target: { x: number; y: number } | undefined = this.enemies.find(
          (e) => e.id === proj.targetEnemyId && e.hp > 0
        );
        if (!target) {
          target = this.trainingDummies.find((d) => d.id === proj.targetEnemyId);
        }
        if (target) {
          const tdx = target.x - proj.x;
          const tdy = target.y - proj.y;
          const dist = Math.hypot(tdx, tdy);
          if (dist > 4 && dist < 380) {
            const desiredAngle = Math.atan2(tdy, tdx);
            const currentSpeed = Math.hypot(proj.vx, proj.vy);
            const curAngle = Math.atan2(proj.vy, proj.vx);
            const diff = Math.atan2(Math.sin(desiredAngle - curAngle), Math.cos(desiredAngle - curAngle));
            const steer = 0.22;
            const newAngle = curAngle + diff * steer;
            proj.vx = Math.cos(newAngle) * currentSpeed;
            proj.vy = Math.sin(newAngle) * currentSpeed;
            proj.angle = newAngle;
          }
        }
      }

      proj.x += proj.vx * dtSec;
      proj.y += proj.vy * dtSec;

      if (this.isWallAtWorld(proj.x, proj.y)) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (proj.ownerType === 'enemy') {
        const blockedByDome = this.zones.some(
          (z) =>
            z.kind === 'aegis_dome' &&
            Math.hypot(proj.x - z.x, proj.y - z.y) <= z.radius
        );
        if (blockedByDome) {
          this.projectiles.splice(i, 1);
          continue;
        }

        let hitPlayer = false;
        for (const pr of this.players.values()) {
          if (pr.state.downed || !pr.state.connected) continue;
          if (Math.hypot(pr.state.x - proj.x, pr.state.y - proj.y) <= 14 + proj.radius) {
            this.damagePlayer(pr.state, proj.damage);
            hitPlayer = true;
            break;
          }
        }
        if (hitPlayer) {
          this.projectiles.splice(i, 1);
        }
      } else {
        for (const prop of this.props) {
          if (!prop.opened && prop.kind === 'crate') {
            if (Math.hypot(prop.x - proj.x, prop.y - proj.y) <= 18 + proj.radius) {
              prop.opened = true;
              for (const ally of this.players.values()) {
                ally.state.gold += prop.value;
              }
              this.emitEvent('gold', prop.x, prop.y - 10, `+${prop.value}g`, '#F4D378');
            }
          }
        }

        const ownerPr = this.players.get(proj.ownerId);

        // Check collision with training dummies
        let hitDummy = false;
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - proj.x, dummy.y - proj.y) <= 18 + proj.radius) {
            this.damageDummy(
              dummy,
              proj.damage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit)
            );
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
          }
        }
        if (hitDummy) continue;

        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          const enemy = this.enemies[eIdx];
          if (Math.hypot(enemy.x - proj.x, enemy.y - proj.y) <= enemy.radius + proj.radius) {
            if (proj.slowOnHit) enemy.slowedMs = 3500;
            this.damageEnemy(
              enemy,
              proj.damage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit)
            );
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }

    for (const room of this.map.rooms) {
      if (!room.cleared) {
        const aliveInRoom = this.enemies.some((e) => e.roomId === room.id);
        if (!aliveInRoom) {
          room.cleared = true;
          if (room.type === 'boss') {
            this.map.portalActive = true;
            this.props.push({
              id: this.nextId('prop'),
              kind: 'relic_chest',
              x: this.map.portalPos.x + 48,
              y: this.map.portalPos.y,
              opened: false,
              value: 1,
            });
            this.pushSystemChat(
              `Floor ${this.floor} Boss vanquished! Open the Relic Vault and press [E] at the Portal.`
            );
          }
        }
      }
    }
  }

  private firePrimaryAttack(p: PlayerState): void {
    const def = HERO_CLASSES[p.heroClass];
    const mult = this.computeDamageMult(p);
    const hasCrit = p.relics.includes('keen_arrowhead') && Math.random() < 0.25;
    const critMult = hasCrit ? 1.75 : 1.0;
    const dmg = Math.round(def.damage * mult * critMult);
    const extraCount = p.relics.includes('twinstring_charm') ? 1 : 0;
    const bonusPierce = p.relics.includes('piercing_prism') ? 1 : 0;

    // Automatic Target Acquisition: Find nearest enemy or training dummy within strike range
    // Vanguard: 140px cleave search; Ranged: 460px line-of-fire search
    let bestTarget: { id: string; x: number; y: number } | null = null;
    let bestDist = Infinity;
    const maxSearchDist = p.heroClass === 'vanguard' ? 140 : 460;

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (d <= maxSearchDist && d < bestDist) {
        bestDist = d;
        bestTarget = enemy;
      }
    }

    if (!bestTarget) {
      for (const dummy of this.trainingDummies) {
        const d = Math.hypot(dummy.x - p.x, dummy.y - p.y);
        if (d <= maxSearchDist && d < bestDist) {
          bestDist = d;
          bestTarget = dummy;
        }
      }
    }

    // Automatically orient attack towards the nearest target
    if (bestTarget) {
      p.aimAngle = Math.atan2(bestTarget.y - p.y, bestTarget.x - p.x);
    }

    const shotCount = 1 + extraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread = shotCount === 2 ? (s === 0 ? -0.1 : 0.1) : 0;
      const ang = p.aimAngle + spread;
      const shotDmg = Math.round(dmg * (s === 0 ? 1.0 : 0.75));

      if (p.heroClass === 'vanguard') {
        this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'slash',
          x: p.x + Math.cos(ang) * 20,
          y: p.y + Math.sin(ang) * 20,
          vx: Math.cos(ang) * 310,
          vy: Math.sin(ang) * 310,
          angle: ang,
          radius: 28,
          damage: shotDmg,
          pierce: 4 + bonusPierce,
          crit: hasCrit,
          ttlMs: 260,
          targetEnemyId: bestTarget?.id,
        });
      } else if (p.heroClass === 'ranger') {
        this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'arrow',
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 470,
          vy: Math.sin(ang) * 470,
          angle: ang,
          radius: 6,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 850,
          targetEnemyId: bestTarget?.id,
        });
      } else if (p.heroClass === 'arcanist') {
        const pr = this.players.get(p.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 4 === 0) {
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
            this.emitEvent('status', riftX, riftY - 18, ' Star Rift', '#C084FC');
          }
        }
        this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'arcane',
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 380,
          vy: Math.sin(ang) * 380,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: 2 + bonusPierce,
          crit: hasCrit,
          ttlMs: 920,
          targetEnemyId: bestTarget?.id,
        });
      } else {
        this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'radiant',
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 390,
          vy: Math.sin(ang) * 390,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 800,
          targetEnemyId: bestTarget?.id,
        });
      }
    }
  }

  private spawnProjectile(spec: Omit<ProjectileState, 'id'>): void {
    this.projectiles.push({
      id: this.nextId('proj'),
      ...spec,
    });
  }

  private summonBossAdds(boss: EnemyState): void {
    const isCatacombs = this.map.biome === 'catacombs' || this.floor === 2;
    const isEmber = this.map.biome === 'ember' || this.floor === 3;
    const isVoid = this.map.biome === 'void' || this.floor === 4;
    const isAstral = this.map.biome === 'astral' || this.floor === 5;
    const minionKind = isAstral
      ? 'cultist'
      : isVoid
        ? 'skeleton'
        : isEmber
          ? 'knight'
          : isCatacombs
            ? 'cultist'
            : 'skeleton';
    this.emitEvent('status', boss.x, boss.y - boss.radius - 20, '️ REINFORCEMENTS!', '#F59E0B');
    this.pushSystemChat(`️ ${boss.name} calls forth dungeon reinforcements!`);

    for (let i = 0; i < 2; i++) {
      let addX = boss.x + (i === 0 ? -50 : 50);
      let addY = boss.y + (i === 0 ? 35 : -35);
      if (this.collidesCircle(addX, addY, 14)) {
        addX = boss.x + (i === 0 ? -24 : 24);
        addY = boss.y;
      }
      const add = makeEnemy(
        `add_${this.floor}_${Date.now()}_${i}`,
        minionKind,
        boss.roomId,
        addX,
        addY,
        1.0,
        true,
        this.floor,
        this.map.biome
      );
      this.enemies.push(add);
    }
  }

  private damageEnemy(
    enemy: EnemyState,
    rawAmount: number,
    attacker: PlayerState | null,
    isCrit: boolean
  ): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1 || enemy.hp <= 0) return;

    const res = enemy.resistances || {
      physical: 0,
      fire: 0,
      frost: 0,
      lightning: 0,
      poison: 0,
      bleed: 0,
      tenacity: 0,
    };
    const markBonus = enemy.markedMs > 0 ? 1.35 : 1.0;
    // Physical Resistance mitigates direct attacks
    const physRes = Math.min(0.75, Math.max(-0.5, res.physical));
    let finalDmg = Math.max(1, Math.round(rawAmount * (1 - physRes) * markBonus));

    // Warden Malakor Shield Wall Damage Mitigation (-60%)
    if (enemy.shieldWallMs && enemy.shieldWallMs > 0) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.4));
      this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 16, ' BLOCKED! (-60%)', '#60A5FA');
    }

    // Ranger Class Passive: Eagle Keenness (+25% Longshot Crit Damage beyond 180px)
    if (attacker && attacker.heroClass === 'ranger') {
      const distToTarget = Math.hypot(enemy.x - attacker.x, enemy.y - attacker.y);
      if (distToTarget >= 180) {
        finalDmg = Math.round(finalDmg * 1.25);
        isCrit = true;
        this.emitEvent('crit', enemy.x, enemy.y - enemy.radius - 22, ' LONGSHOT! (+25%)', '#34D399');
      }
    }

    // Freeze Shatter Mechanics
    let shattered = false;
    if (enemy.frozenMs > 0) {
      enemy.frozenMs = 0;
      finalDmg = Math.round(finalDmg * 1.6);
      shattered = true;
      this.emitEvent('crit', enemy.x, enemy.y - enemy.radius - 20, ' SHATTER!', '#38BDF8');

      // AoE Frost Shatter wave to adjacent enemies
      for (const other of this.enemies) {
        if (other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 85) {
          const aoeDmg = Math.round(finalDmg * 0.4);
          other.hp -= aoeDmg;
          other.slowedMs = Math.max(other.slowedMs, 2500);
          this.emitEvent('damage', other.x, other.y - 10, `${aoeDmg}`, '#7DD3FC');
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
        }
      }
    }

    enemy.hp -= finalDmg;

    if (attacker) {
      attacker.damageDealt += finalDmg;

      // Vanguard Class Passive: Iron Will (+3 Shield when striking CC'd / Burning foes)
      if (attacker.heroClass === 'vanguard') {
        if (enemy.stunnedMs > 0 || enemy.burnedMs > 0 || enemy.frozenMs > 0) {
          if (attacker.shield < 60) {
            attacker.shield = Math.min(60, attacker.shield + 3);
            this.emitEvent('status', attacker.x, attacker.y - 20, '️ Iron Will (+3 Shield)', '#93C5FD');
          }
        }
      }

      // Status Relic Procs with Resistances & Tenacity:
      // 1. Cinder Heart: Ignite Burn
      if (attacker.relics.includes('cinder_heart') && (isCrit || rawAmount >= 24)) {
        if (enemy.burnedMs <= 0) {
          this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 14, 'IGNITED!', '#F97316');
        }
        const burnDuration = Math.round(4500 * (1 - res.fire * 0.4));
        enemy.burnedMs = burnDuration;
      }

      // 2. Rimefrost Shard: Chill & Freeze
      if (attacker.relics.includes('rimefrost_shard')) {
        const frostTenacity = Math.max(res.frost, res.tenacity);
        if (enemy.slowedMs > 0 && enemy.frozenMs <= 0 && !shattered) {
          const freezeDuration = Math.round(2400 * (1 - frostTenacity));
          if (freezeDuration >= 600) {
            enemy.frozenMs = freezeDuration;
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 16, 'FROZEN!', '#38BDF8');
          } else {
            enemy.slowedMs = Math.max(enemy.slowedMs, 3500);
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 14, 'TENACIOUS!', '#94A3B8');
          }
        } else if (Math.random() < 0.35) {
          const slowDuration = Math.round(3500 * (1 - frostTenacity * 0.5));
          enemy.slowedMs = Math.max(enemy.slowedMs, slowDuration);
          this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 14, 'CHILLED', '#7DD3FC');
        }
      }

      // 3. Stormcaller Lodestone: Shock & Chain Lightning
      if (attacker.relics.includes('stormcaller_lodestone')) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            const shockDuration = Math.round(5000 * (1 - res.lightning * 0.4));
            enemy.shockedMs = shockDuration;
            this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 16, 'SHOCKED!', '#FBBF24');
          }
        }
      }

      // 4. Viper Crucible: Poison & Weaken
      if (attacker.relics.includes('viper_crucible')) {
        if (enemy.poisonedMs <= 0) {
          this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 14, 'POISONED', '#22C55E');
        }
        const poisonDuration = Math.round(6000 * (1 - res.poison * 0.4));
        enemy.poisonedMs = poisonDuration;
      }

      // 5. Bloodletter Talisman: Bleed
      if (attacker.relics.includes('bloodletter_talisman')) {
        if (enemy.bleedingMs <= 0) {
          this.emitEvent('status', enemy.x, enemy.y - enemy.radius - 14, 'BLEED', '#DC2626');
        }
        const bleedDuration = Math.round(5000 * (1 - res.bleed * 0.4));
        enemy.bleedingMs = bleedDuration;
      }
    }

    // Shocked chain lightning discharge
    if (enemy.shockedMs > 0 && finalDmg > 6) {
      let arcs = 3;
      for (const other of this.enemies) {
        if (other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 130) {
          const otherRes = other.resistances ? other.resistances.lightning : 0;
          const arcDmg = Math.max(1, Math.round(finalDmg * 0.45 * (1 - otherRes)));
          other.hp -= arcDmg;
          this.emitEvent('damage', other.x, other.y - 12, ` ${arcDmg}`, '#FBBF24');
          arcs--;
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
          if (arcs <= 0) break;
        }
      }
    }

    this.emitEvent(
      isCrit || enemy.markedMs > 0 ? 'crit' : 'damage',
      enemy.x + (Math.random() * 14 - 7),
      enemy.y - enemy.radius - 6,
      `${finalDmg}${isCrit ? '!' : ''}`,
      isCrit || enemy.markedMs > 0 ? '#FBBF24' : '#F8FAFC'
    );

    if (enemy.hp <= 0) {
      this.processEnemyDeath(enemy, attacker);
    }
  }

  private damageDummy(
    dummy: TrainingDummyState,
    rawAmount: number,
    attacker: PlayerState | null,
    isCrit = false
  ): void {
    let finalDmg = Math.max(1, rawAmount);

    if (attacker && attacker.heroClass === 'ranger') {
      const distToTarget = Math.hypot(dummy.x - attacker.x, dummy.y - attacker.y);
      if (distToTarget >= 180) {
        finalDmg = Math.round(finalDmg * 1.25);
        isCrit = true;
        this.emitEvent('crit', dummy.x, dummy.y - 42, ' LONGSHOT! (+25%)', '#34D399');
      }
    }

    dummy.hitAnimMs = 280;
    dummy.lastHitTimerMs = 4000; // Reset counter after 4s of combat inactivity
    dummy.totalDamageTaken = (dummy.totalDamageTaken || 0) + finalDmg;
    dummy.hp = Math.max(1, dummy.hp - finalDmg);

    if (attacker) {
      attacker.damageDealt += finalDmg;

      if (attacker.heroClass === 'vanguard') {
        if (attacker.shield < 60) {
          attacker.shield = Math.min(60, attacker.shield + 3);
          this.emitEvent('status', attacker.x, attacker.y - 20, '️ Iron Will (+3 Shield)', '#93C5FD');
        }
      }
    }

    const text = isCrit ? ` ${finalDmg} CRIT!` : `${finalDmg}`;
    const color = isCrit ? '#FEF08A' : '#FCD34D';
    this.emitEvent(
      isCrit ? 'crit' : 'damage',
      dummy.x + (Math.random() * 14 - 7),
      dummy.y - 28,
      text,
      color
    );

    // Relic synergies practice feedback
    if (attacker) {
      if (attacker.relics.includes('cinder_heart') && (isCrit || rawAmount >= 24)) {
        this.emitEvent('status', dummy.x, dummy.y - 42, ' IGNITED!', '#F97316');
      }
      if (attacker.relics.includes('rimefrost_shard') && Math.random() < 0.25) {
        this.emitEvent('status', dummy.x, dummy.y - 42, '️ CHILLED!', '#38BDF8');
      }
      if (attacker.relics.includes('stormcaller_lodestone')) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            this.emitEvent('status', dummy.x, dummy.y - 42, ' SHOCKED!', '#FBBF24');
            // Arc to other dummy if nearby
            for (const other of this.trainingDummies) {
              if (other.id !== dummy.id && Math.hypot(other.x - dummy.x, other.y - dummy.y) <= 350) {
                this.damageDummy(other, Math.round(finalDmg * 0.5), attacker, false);
                this.emitEvent('status', other.x, other.y - 26, ' Arc Shock', '#FBBF24');
              }
            }
          }
        }
      }
      if (attacker.relics.includes('viper_crucible')) {
        this.emitEvent('status', dummy.x, dummy.y - 42, ' POISONED!', '#22C55E');
      }
      if (attacker.relics.includes('bloodletter_talisman')) {
        this.emitEvent('status', dummy.x, dummy.y - 42, '🩸 LACERATED!', '#DC2626');
      }
    }
  }

  private processEnemyDeath(enemy: EnemyState, attacker: PlayerState | null): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);

    if (attacker) {
      attacker.kills += 1;
      if (this.onKillCallback) this.onKillCallback(attacker.id);
      if (attacker.relics.includes('crimson_fang')) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
      }
      if (attacker.heroClass === 'ranger') {
        attacker.hasteMs = Math.max(attacker.hasteMs, 2500);
        this.emitEvent('status', attacker.x, attacker.y - 22, ' EAGLE SWIFTNESS!', '#4ADE80');
      }
    }

    if (Math.random() < 0.55 || enemy.kind === 'boss') {
      this.props.push({
        id: this.nextId('prop'),
        kind: 'coin',
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: enemy.kind === 'boss' ? 75 : enemy.elite ? 18 : 8,
      });
    } else if (Math.random() < 0.14) {
      this.props.push({
        id: this.nextId('prop'),
        kind: 'potion',
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: 1,
      });
    }

    const xpGain = enemy.kind === 'boss' ? 95 : enemy.elite ? 28 : 16;
    for (const ally of this.players.values()) {
      this.grantXp(ally.state, xpGain);
    }
  }

  private grantXp(p: PlayerState, amount: number): void {
    p.xp += amount;
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp;
      p.level += 1;
      p.attributePoints += 2; // Give 2 points per level
      p.nextXp = Math.round(p.nextXp * 1.35);
      
      const bonusHp = p.relics.includes('bastion_pauldron') ? 30 : 0;
      const vitBonus = (p.vitality - 10) * 5; // Vitality bonus: +5 HP per point above 10
      const oldMax = p.maxHp;
      p.maxHp = HERO_CLASSES[p.heroClass].maxHp + (p.level - 1) * 12 + bonusHp + vitBonus;
      p.hp += (p.maxHp - oldMax); // Keep current HP relative to max
      p.hp = Math.min(p.maxHp, p.hp + 24);

      this.emitEvent('status', p.x, p.y - 26, `Level ${p.level} (+2 Pts)`, '#F4D378');
    }
  }

  private damagePlayer(
    p: PlayerState,
    rawDamage: number,
    damageType: 'physical' | 'elemental' = 'physical'
  ): void {
    if (p.downed || p.godMode) return;

    const classDef = HERO_CLASSES[p.heroClass];
    const res = classDef?.resistances || {
      physical: 0,
      fire: 0,
      frost: 0,
      lightning: 0,
      poison: 0,
      bleed: 0,
    };

    let resist =
      damageType === 'elemental'
        ? (res.fire + res.frost + res.lightning) / 3
        : res.physical;

    if (p.relics.includes('runic_carapace')) {
      resist += damageType === 'physical' ? 0.15 : 0.20;
    }
    if (p.relics.includes('thorned_aegis') && damageType === 'physical') {
      resist += 0.10;
    }
    resist = Math.min(0.75, Math.max(0, resist));

    let dmg = Math.max(1, Math.round(rawDamage * (1 - resist)));

    if (p.heroClass === 'vanguard') {
      dmg = Math.max(1, Math.round(dmg * 0.85));
      this.emitEvent('status', p.x, p.y - 28, '️ Iron Will (-15%)', '#CBD5E1');
    }

    const inAegis = this.zones.some(
      (z) => z.kind === 'aegis_dome' && Math.hypot(p.x - z.x, p.y - z.y) <= z.radius
    );
    if (inAegis) dmg = Math.max(1, Math.round(dmg * 0.65));

    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;

      // Thorned Aegis: Stun retaliation shockwave with Tenacity respect
      if (absorbed > 0 && p.relics.includes('thorned_aegis')) {
        this.emitEvent('status', p.x, p.y - 24, 'THORNED RETALIATION', '#A855F7');
        for (const enemy of this.enemies) {
          if (enemy.hp > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 125) {
            const tenacity = enemy.resistances ? enemy.resistances.tenacity : 0;
            const stunDur = Math.round(1800 * (1 - tenacity));
            if (stunDur >= 500) {
              enemy.stunnedMs = stunDur;
              this.emitEvent('status', enemy.x, enemy.y - 16, 'STUNNED!', '#A855F7');
            } else {
              this.emitEvent('status', enemy.x, enemy.y - 16, 'TENACIOUS!', '#FBBF24');
            }
          }
        }
      }
    }

    if (dmg > 0) {
      p.hp = Math.max(0, p.hp - dmg);
      this.emitEvent('damage', p.x, p.y - 18, `-${dmg}`, '#F87171');
      if (resist >= 0.25) {
        this.emitEvent('status', p.x + 16, p.y - 26, 'ARMORED', '#94A3B8');
      }
    }

    if (p.hp <= 0) {
      p.downed = true;
      p.downedTimerMs = 18000;
      p.reviveProgress = 0;
      if (this.players.size > 1) {
        this.pushSystemChat(
          `${p.username} is downed! Stand near your ally to revive them.`
        );
      }
    }
  }

  private completeRevive(target: PlayerState, reviverId: string): void {
    target.downed = false;
    target.reviveProgress = 0;
    target.hp = Math.round(target.maxHp * 0.45);
    target.shield = 20;
    const reviver = this.players.get(reviverId);
    if (reviver && reviver.state.id !== target.id) {
      reviver.state.revives += 1;
      if (this.onReviveCallback) this.onReviveCallback(reviver.state.id);
      this.pushSystemChat(`${reviver.state.username} revived ${target.username}!`);
    }
    this.emitEvent('heal', target.x, target.y - 24, 'Revived!', '#6EE7B7');
  }

  private emitEvent(
    kind: FloatingEvent['kind'],
    x: number,
    y: number,
    text: string,
    color: string
  ): void {
    this.pendingEvents.push({
      id: this.nextId('ev'),
      kind,
      x: Math.round(x),
      y: Math.round(y),
      text,
      color,
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
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist <= TILE_SIZE) return true;
    const steps = Math.ceil(dist / 14);
    const stepX = dx / steps;
    const stepY = dy / steps;
    for (let i = 1; i < steps; i++) {
      if (this.isWallAtWorld(x1 + stepX * i, y1 + stepY * i)) {
        return false;
      }
    }
    return true;
  }

  private isWallAtWorld(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || tx >= this.map.width || ty < 0 || ty >= this.map.height) {
      return true;
    }
    const code = this.map.tiles[ty * this.map.width + tx];
    return code === 0 || code === 2 || code === 3;
  }

  private collidesCircle(wx: number, wy: number, radius: number): boolean {
    if (this.isWallAtWorld(wx, wy)) return true;
    // 8 perimeter points for smooth circular collision sliding
    const step = Math.PI / 4;
    for (let i = 0; i < 8; i++) {
      const a = i * step;
      const cx = wx + Math.cos(a) * radius;
      const cy = wy + Math.sin(a) * radius;
      if (this.isWallAtWorld(cx, cy)) return true;
    }
    return false;
  }

  private moveWithCollision(
    entity: { x: number; y: number },
    dx: number,
    dy: number,
    radius: number
  ): void {
    // 1. Stuck Recovery: If entity is currently overlapping or embedded in a wall tile,
    // immediately probe surrounding directions and push out towards open floor
    if (this.collidesCircle(entity.x, entity.y, radius * 0.75)) {
      let escapeX = 0;
      let escapeY = 0;
      const probeDist = radius + 8;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const testX = entity.x + Math.cos(a) * probeDist;
        const testY = entity.y + Math.sin(a) * probeDist;
        if (!this.isWallAtWorld(testX, testY)) {
          escapeX += Math.cos(a);
          escapeY += Math.sin(a);
        }
      }
      if (escapeX !== 0 || escapeY !== 0) {
        const len = Math.hypot(escapeX, escapeY);
        entity.x += (escapeX / len) * 4;
        entity.y += (escapeY / len) * 4;
      }
    }

    // 2. Direct full step
    const targetX = entity.x + dx;
    const targetY = entity.y + dy;
    if (!this.collidesCircle(targetX, targetY, radius)) {
      entity.x = targetX;
      entity.y = targetY;
      return;
    }

    // 3. Wall Sliding: try X movement alone with half-step fallback
    if (dx !== 0 && !this.collidesCircle(targetX, entity.y, radius)) {
      entity.x = targetX;
    } else if (dx !== 0 && !this.collidesCircle(entity.x + dx * 0.5, entity.y, radius)) {
      entity.x += dx * 0.5;
    }

    // 4. Wall Sliding: try Y movement alone with half-step fallback
    if (dy !== 0 && !this.collidesCircle(entity.x, targetY, radius)) {
      entity.y = targetY;
    } else if (dy !== 0 && !this.collidesCircle(entity.x, entity.y + dy * 0.5, radius)) {
      entity.y += dy * 0.5;
    }
  }

  public getSummary(): RoomSummary {
    return {
      roomId: this.roomId,
      name: this.name,
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
    const activePlayers = Array.from(this.players.values()).map((r) => r.state);
    const portalReadyCount = activePlayers.filter((p) => p.readyNextFloor).length;

    return {
      roomId: this.roomId,
      roomName: this.name,
      difficulty: this.difficulty,
      status: this.status,
      floor: this.floor,
      seed: this.baseSeed,
      elapsedSec: Math.floor((Date.now() - this.startedAt) / 1000),
      bossDefeated: this.map.portalActive,
      portalReadyCount,
      players: activePlayers,
      enemies: this.enemies,
      projectiles: this.projectiles,
      props: this.props,
      zones: this.zones,
      npcs: this.npcs,
      trainingDummies: this.trainingDummies,
      events,
      roomClearedFlags: this.map.rooms.map((r) => ({
        id: r.id,
        cleared: r.cleared,
        discovered: r.discovered,
      })),
    };
  }
}
