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
  type PlayerInputState,
  type PlayerState,
  type ProjectileState,
  type PropState,
  type RoomSummary,
} from '../shared/types.ts';
import { generateDungeonFloor } from './dungeonGenerator.ts';

interface PlayerRuntime {
  state: PlayerState;
  input: PlayerInputState;
  attackCooldownMs: number;
  enteredRooms: Set<number>;
}

const MAX_FLOORS_FOR_VICTORY = 3;

export class GameRoom {
  public readonly roomId: string;
  public readonly name: string;
  public hostName: string;
  public readonly difficulty: DifficultyTier;
  public readonly baseSeed: number;
  public readonly maxPlayers = 4;

  public status: 'playing' | 'victory' | 'defeat' = 'playing';
  public floor = 1;
  public map!: DungeonMap;
  public enemies: EnemyState[] = [];
  public projectiles: ProjectileState[] = [];
  public props: PropState[] = [];
  public zones: FieldZoneState[] = [];
  public pendingEvents: FloatingEvent[] = [];
  public chat: ChatMessage[] = [];
  public spawnPoint = { x: 256, y: 256 };

  private players = new Map<string, PlayerRuntime>();
  private entitySeq = 1;
  private startedAt = Date.now();
  private zoneTickAccumMs = 0;
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
    this.baseSeed =
      opts.seed && opts.seed > 0
        ? Math.floor(opts.seed)
        : Math.floor(100000 + Math.random() * 899999);
    this.loadFloor(1, 1);
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.entitySeq++}`;
  }

  private loadFloor(floorNum: number, partySize: number): void {
    this.floor = floorNum;
    const generated = generateDungeonFloor(
      floorNum,
      this.baseSeed,
      this.difficulty,
      Math.max(1, partySize)
    );
    this.map = generated.map;
    this.enemies = generated.enemies;
    this.props = generated.props;
    this.projectiles = [];
    this.zones = [];
    this.spawnPoint = generated.spawnPoint;

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
    this.loadFloor(1, this.players.size);
    this.pushSystemChat(`Expedition restarted on Seed ${this.baseSeed}.`);
    return this.map;
  }

  public addOrReconnectPlayer(
    playerId: string,
    username: string,
    heroClass: HeroClassId
  ): PlayerState {
    const existing = this.players.get(playerId);
    if (existing) {
      existing.state.connected = true;
      existing.state.username = username;
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

      if (this.map.portalActive) {
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
    if (p.relics.includes('sunfire_signet')) mult *= 1.24;
    return mult;
  }

  public tick(dtMs: number): void {
    if (this.status !== 'playing' || this.players.size === 0) return;

    const dtSec = dtMs / 1000;
    this.zoneTickAccumMs += dtMs;
    const pulseZonesNow = this.zoneTickAccumMs >= 500;
    if (pulseZonesNow) this.zoneTickAccumMs = 0;

    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.ttlMs -= dtMs;

      if (z.kind === 'boss_slam' && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (
            !pr.state.downed &&
            Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius
          ) {
            this.damagePlayer(pr.state, 28 + this.floor * 5);
          }
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
          p.reviveProgress = Math.min(1, p.reviveProgress + dtSec / 2.2);
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

    for (const enemy of this.enemies) {
      enemy.markedMs = Math.max(0, enemy.markedMs - dtMs);
      enemy.slowedMs = Math.max(0, enemy.slowedMs - dtMs);
      enemy.stunnedMs = Math.max(0, enemy.stunnedMs - dtMs);

      if (enemy.stunnedMs > 0) {
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }

      let nearest: PlayerState | null = null;
      let nearestDist = Infinity;
      for (const pr of this.players.values()) {
        if (pr.state.downed || !pr.state.connected) continue;
        const d = Math.hypot(pr.state.x - enemy.x, pr.state.y - enemy.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = pr.state;
        }
      }

      const aggroRadius = enemy.kind === 'boss' ? 430 : 350;
      if (!nearest || nearestDist > aggroRadius) {
        enemy.state = 'idle';
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }

      enemy.state = 'chase';
      const slowFactor = enemy.slowedMs > 0 ? 0.55 : 1.0;
      const dx = nearest.x - enemy.x;
      const dy = nearest.y - enemy.y;
      const angle = Math.atan2(dy, dx);

      enemy.windupMs -= dtMs;

      if (enemy.kind === 'slime' || enemy.kind === 'goblin' || enemy.kind === 'knight') {
        const baseSpd =
          enemy.kind === 'goblin' ? 128 : enemy.kind === 'knight' ? 96 : 86;
        const spd = baseSpd * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(angle) * spd;
          enemy.vy = Math.sin(angle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        }
        if (nearestDist <= enemy.radius + 22 && enemy.windupMs <= 0) {
          const baseHit = enemy.kind === 'knight' ? 19 : enemy.kind === 'goblin' ? 13 : 11;
          this.damagePlayer(nearest, baseHit + this.floor * 2);
          enemy.windupMs = enemy.kind === 'goblin' ? 850 : 1100;
        }
      } else if (enemy.kind === 'skeleton' || enemy.kind === 'cultist') {
        const spd = 82 * slowFactor;
        if (nearestDist < 120) {
          this.moveWithCollision(
            enemy,
            -Math.cos(angle) * spd * dtSec,
            -Math.sin(angle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 215) {
          this.moveWithCollision(
            enemy,
            Math.cos(angle) * spd * dtSec,
            Math.sin(angle) * spd * dtSec,
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
        const spd = 76 * slowFactor;
        if (nearestDist > 72) {
          this.moveWithCollision(
            enemy,
            Math.cos(angle) * spd * dtSec,
            Math.sin(angle) * spd * dtSec,
            20
          );
        }
        if (enemy.windupMs <= 0) {
          const pattern = Math.random();
          const isCatacombs = this.map.biome === 'catacombs' || this.floor === 2;
          const isEmber = this.map.biome === 'ember' || this.floor >= 3;

          if (pattern < 0.48) {
            this.zones.push({
              id: this.nextId('zone'),
              kind: 'boss_slam',
              x: nearest.x,
              y: nearest.y,
              radius: isEmber ? 88 : isCatacombs ? 82 : 76,
              ttlMs: 1150,
              maxTtlMs: 1150,
              ownerId: enemy.id,
            });
            enemy.windupMs = 2200;
          } else {
            const offset = Math.random() * Math.PI;
            const projCount = isEmber ? 10 : 8;
            const projStyle = isCatacombs ? 'voidorb' : isEmber ? 'fireball' : 'bone';
            const projSpeed = isCatacombs ? 220 : isEmber ? 230 : 210;

            for (let k = 0; k < projCount; k++) {
              const a = offset + (k * Math.PI * 2) / projCount;
              this.spawnProjectile({
                ownerType: 'enemy',
                ownerId: enemy.id,
                style: projStyle,
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * projSpeed,
                vy: Math.sin(a) * projSpeed,
                angle: a,
                radius: isEmber ? 8 : 7,
                damage: 17 + this.floor * 3,
                pierce: 1,
                ttlMs: 2200,
              });
            }
            enemy.windupMs = 2000;
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

      // Homing guidance for player projectiles towards target enemy
      if (proj.ownerType === 'player' && proj.targetEnemyId) {
        const target = this.enemies.find((e) => e.id === proj.targetEnemyId && e.hp > 0);
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

    // Automatic Target Acquisition: Find nearest enemy within strike range
    // Vanguard: 140px cleave search; Ranged: 460px line-of-fire search
    let bestEnemy: EnemyState | null = null;
    let bestDist = Infinity;
    const maxSearchDist = p.heroClass === 'vanguard' ? 140 : 460;

    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (d <= maxSearchDist && d < bestDist) {
        bestDist = d;
        bestEnemy = enemy;
      }
    }

    // Automatically orient attack towards the nearest enemy
    if (bestEnemy) {
      p.aimAngle = Math.atan2(bestEnemy.y - p.y, bestEnemy.x - p.x);
    }

    const shotCount = 1 + extraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread = shotCount === 2 ? (s === 0 ? -0.1 : 0.1) : 0;
      const ang = p.aimAngle + spread;

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
          damage: dmg,
          pierce: 4 + bonusPierce,
          crit: hasCrit,
          ttlMs: 260,
          targetEnemyId: bestEnemy?.id,
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
          damage: dmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 850,
          targetEnemyId: bestEnemy?.id,
        });
      } else if (p.heroClass === 'arcanist') {
        this.spawnProjectile({
          ownerType: 'player',
          ownerId: p.id,
          style: 'arcane',
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 370,
          vy: Math.sin(ang) * 370,
          angle: ang,
          radius: 8,
          damage: dmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 920,
          targetEnemyId: bestEnemy?.id,
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
          damage: dmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 800,
          targetEnemyId: bestEnemy?.id,
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

  private damageEnemy(
    enemy: EnemyState,
    rawAmount: number,
    attacker: PlayerState | null,
    isCrit: boolean
  ): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;

    const markBonus = enemy.markedMs > 0 ? 1.35 : 1.0;
    const finalDmg = Math.max(1, Math.round(rawAmount * markBonus));
    enemy.hp -= finalDmg;

    if (attacker) {
      attacker.damageDealt += finalDmg;
    }

    this.emitEvent(
      isCrit || enemy.markedMs > 0 ? 'crit' : 'damage',
      enemy.x + (Math.random() * 14 - 7),
      enemy.y - enemy.radius - 6,
      `${finalDmg}${isCrit ? '!' : ''}`,
      isCrit || enemy.markedMs > 0 ? '#FBBF24' : '#F8FAFC'
    );

    if (enemy.hp <= 0) {
      this.enemies.splice(idx, 1);
      if (attacker) {
        attacker.kills += 1;
        if (this.onKillCallback) this.onKillCallback(attacker.id);
        if (attacker.relics.includes('crimson_fang')) {
          attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
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
  }

  private grantXp(p: PlayerState, amount: number): void {
    p.xp += amount;
    while (p.xp >= p.nextXp) {
      p.xp -= p.nextXp;
      p.level += 1;
      p.nextXp = Math.round(p.nextXp * 1.35);
      p.maxHp += 12;
      p.hp = Math.min(p.maxHp, p.hp + 24);
      this.emitEvent('status', p.x, p.y - 26, `Level ${p.level}`, '#F4D378');
    }
  }

  private damagePlayer(p: PlayerState, rawDamage: number): void {
    if (p.downed) return;

    const inAegis = this.zones.some(
      (z) => z.kind === 'aegis_dome' && Math.hypot(p.x - z.x, p.y - z.y) <= z.radius
    );
    let dmg = inAegis ? Math.max(1, Math.round(rawDamage * 0.65)) : rawDamage;

    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
    }

    if (dmg > 0) {
      p.hp = Math.max(0, p.hp - dmg);
      this.emitEvent('damage', p.x, p.y - 18, `-${dmg}`, '#F87171');
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
    // Separate X and Y movements to allow wall sliding
    if (dx !== 0 && !this.collidesCircle(entity.x + dx, entity.y, radius)) {
      entity.x += dx;
    }
    if (dy !== 0 && !this.collidesCircle(entity.x, entity.y + dy, radius)) {
      entity.y += dy;
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
      events,
      roomClearedFlags: this.map.rooms.map((r) => ({
        id: r.id,
        cleared: r.cleared,
        discovered: r.discovered,
      })),
    };
  }
}
