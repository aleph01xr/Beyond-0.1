import type {
  DungeonMap,
  GameSnapshot,
  PlayerInputState,
  PlayerState,
  RoomSummary,
} from '../shared/types.ts';

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor';

export interface PingDiagnostics {
  pingMs: number;
  lastRttMs: number;
  avgRttMs: number;
  jitterMs: number;
  minRttMs: number;
  maxRttMs: number;
  samples: number;
  quality: ConnectionQuality;
  serverTickMs?: number;
}

export const HUD_MAX_STALE_MS = 450;
export const CLIENT_INPUT_CONTINUOUS_INTERVAL_MS = 33;
export const CLIENT_INPUT_BACKPRESSURE_RETRY_MS = 16;
export const CLIENT_WS_BACKPRESSURE_LIMIT_BYTES = 64 * 1024;
export const CLIENT_PING_INTERVAL_ACTIVE_MS = 1500;
export const CLIENT_PING_INTERVAL_IDLE_MS = 3000;

export function computeExpSmoothingFactor(ratePerSec: number, dtSec: number): number {
  if (dtSec <= 0) return 0;
  return 1 - Math.exp(-ratePerSec * dtSec);
}

export class PingTracker {
  private readonly windowSize: number;
  private readonly samplesWindow: number[] = [];
  private smoothedRtt: number | null = null;
  private jitterEwma = 0;
  private lastServerTickMs: number | undefined = undefined;

  constructor(windowSize = 10) {
    this.windowSize = Math.max(2, windowSize);
  }

  public recordSample(rttMs: number, serverTickMs?: number): PingDiagnostics {
    if (typeof serverTickMs === 'number' && Number.isFinite(serverTickMs) && serverTickMs >= 0) {
      this.lastServerTickMs = serverTickMs;
    }
    const clamped = Math.max(1, Math.round(rttMs));
    const prevLast =
      this.samplesWindow.length > 0
        ? this.samplesWindow[this.samplesWindow.length - 1]
        : clamped;

    this.samplesWindow.push(clamped);
    if (this.samplesWindow.length > this.windowSize) {
      this.samplesWindow.shift();
    }

    if (this.smoothedRtt === null) {
      this.smoothedRtt = clamped;
      this.jitterEwma = 0;
    } else {
      const instantJitter = Math.abs(clamped - prevLast);
      this.jitterEwma = this.jitterEwma * 0.7 + instantJitter * 0.3;
      this.smoothedRtt = this.smoothedRtt * 0.65 + clamped * 0.35;
    }

    return this.getDiagnostics();
  }

  public reset(): void {
    this.samplesWindow.length = 0;
    this.smoothedRtt = null;
    this.jitterEwma = 0;
    this.lastServerTickMs = undefined;
  }

  public getDiagnostics(): PingDiagnostics {
    if (this.samplesWindow.length === 0) {
      return {
        pingMs: 18,
        lastRttMs: 18,
        avgRttMs: 18,
        jitterMs: 0,
        minRttMs: 18,
        maxRttMs: 18,
        samples: 0,
        quality: 'excellent',
      };
    }

    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (const s of this.samplesWindow) {
      sum += s;
      if (s < min) min = s;
      if (s > max) max = s;
    }

    const pingMs = Math.max(1, Math.round(this.smoothedRtt ?? sum / this.samplesWindow.length));
    const avgRttMs = Math.max(1, Math.round(sum / this.samplesWindow.length));
    const jitterMs = Math.max(0, Math.round(this.jitterEwma));
    const lastRttMs = this.samplesWindow[this.samplesWindow.length - 1];
    const quality: ConnectionQuality =
      pingMs < 55 ? 'excellent' : pingMs < 110 ? 'good' : pingMs < 185 ? 'fair' : 'poor';

    return {
      pingMs,
      lastRttMs,
      avgRttMs,
      jitterMs,
      minRttMs: min,
      maxRttMs: max,
      samples: this.samplesWindow.length,
      quality,
      serverTickMs: this.lastServerTickMs,
    };
  }
}

export function computeNearInteractable(
  snap: GameSnapshot,
  map: DungeonMap | null,
  me: PlayerState | undefined
): boolean {
  if (!me || !map) return false;
  if (Math.hypot(map.portalPos.x - me.x, map.portalPos.y - me.y) <= 80) return true;
  if (snap.bossDefeated && Math.hypot(map.portalPos.x - me.x, map.portalPos.y - me.y) <= 68) {
    return true;
  }
  for (const pr of snap.props) {
    if (!pr.opened && Math.hypot(pr.x - me.x, pr.y - me.y) <= 64) return true;
  }
  if (snap.npcs) {
    for (const n of snap.npcs) {
      if (Math.hypot(n.x - me.x, n.y - me.y) <= 68) return true;
    }
  }
  if (snap.trainingDummies) {
    for (const d of snap.trainingDummies) {
      if (Math.hypot(d.x - me.x, d.y - me.y) <= 72) return true;
    }
  }
  return false;
}

/**
 * Generates a compact structural key covering ONLY the fields rendered by React HUD/DOM layers.
 * Changes trigger immediate React HUD updates, whereas pure world position interpolation
 * ticks flow exclusively to the 60 FPS canvas via ref without causing React re-renders.
 */
export function buildSnapshotHudKey(
  snap: GameSnapshot,
  playerId: string,
  map: DungeonMap | null
): string {
  const me = snap.players.find((p) => p.id === playerId) || snap.players[0];
  const boss = snap.enemies.find((e) => e.kind === 'boss');
  const near = computeNearInteractable(snap, map, me);
  const speakingNpc = snap.npcs?.find((n) => (n.speakingMs ?? 0) > 0);

  let meKey = 'none';
  if (me) {
    const tacSec = Math.ceil(me.skillCooldownMs / 1000);
    const ultSec = Math.ceil(me.ultCooldownMs / 1000);
    const dashSec = Math.ceil((me.dashCooldownMs || 0) / 1000);
    const statusKey =
      me.statuses && me.statuses.length > 0
        ? me.statuses.map((s) => `${s.type}:${Math.ceil(s.durationMs / 100)}`).join(',')
        : '';
    meKey = [
      me.id,
      me.heroClass,
      me.hp,
      me.maxHp,
      me.shield,
      me.downed ? 1 : 0,
      me.gold,
      me.potions,
      me.level,
      me.xp,
      me.nextXp,
      me.attributePoints,
      me.strength,
      me.vitality,
      me.dexterity,
      me.intelligence,
      me.faith,
      me.kills,
      me.revives,
      me.relics.length,
      me.storage?.length ?? 0,
      me.pendingRelicChoices.length,
      me.floorBlessings?.length ?? 0,
      tacSec,
      ultSec,
      dashSec,
      me.godMode ? 1 : 0,
      me.speedBoost ? 1 : 0,
      statusKey,
    ].join(':');
  }

  let bossKey = 'none';
  if (boss) {
    const bossVisible = Boolean(
      me && (boss.hp < boss.maxHp || Math.hypot(boss.x - me.x, boss.y - me.y) <= 480)
    );
    bossKey = `${boss.id}:${boss.hp}:${boss.maxHp}:${boss.enraged ? 1 : 0}:${bossVisible ? 1 : 0}`;
  }

  const partyKey = snap.players
    .map((p) => `${p.id}:${p.hp}:${p.maxHp}:${p.shield}:${p.downed ? 1 : 0}:${p.kills}:${p.revives}:${p.heroClass}`)
    .join(',');

  const flagsKey = snap.roomClearedFlags
    .map((f) => `${f.id}:${f.cleared ? 1 : 0}:${f.discovered ? 1 : 0}`)
    .join(',');

  const npcKey = speakingNpc
    ? `${speakingNpc.id}:${speakingNpc.dialogue}:${speakingNpc.options?.length ?? 0}:${(speakingNpc.speakingMs ?? 0) > 6000 ? 1 : 0}`
    : '';

  return [
    snap.roomId,
    snap.status,
    snap.floor,
    snap.seed,
    snap.elapsedSec,
    snap.bossDefeated ? 1 : 0,
    snap.bossRoomCleared ? 1 : 0,
    snap.bossWards ?? 0,
    snap.guardiansRemaining ?? 0,
    snap.combatRoomsCleared ?? 0,
    snap.combatRoomsTotal ?? 0,
    snap.portalReadyCount,
    near ? 1 : 0,
    meKey,
    bossKey,
    partyKey,
    flagsKey,
    npcKey,
  ].join('|');
}

export function buildLobbyRoomsKey(rooms: RoomSummary[], onlineCount: number): string {
  const roomParts = rooms
    .map((r) => `${r.roomId}:${r.floor}:${r.playerCount}:${r.status}:${r.name}:${r.difficulty}`)
    .join(',');
  return `${onlineCount}|${roomParts}`;
}

export function quantizePlayerInput(input: PlayerInputState): PlayerInputState {
  const qStep = (v: number | undefined): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 50) / 50 : v;
  return {
    up: Boolean(input.up),
    down: Boolean(input.down),
    left: Boolean(input.left),
    right: Boolean(input.right),
    attack: Boolean(input.attack),
    aimAngle: Number.isFinite(input.aimAngle) ? Math.round(input.aimAngle * 50) / 50 : 0,
    stickX: qStep(input.stickX),
    stickY: qStep(input.stickY),
  };
}

export function hasDiscreteInputChanged(a: PlayerInputState | null, b: PlayerInputState): boolean {
  if (!a) return true;
  return (
    a.up !== b.up ||
    a.down !== b.down ||
    a.left !== b.left ||
    a.right !== b.right ||
    a.attack !== b.attack
  );
}

export function isSameQuantizedInput(a: PlayerInputState | null, b: PlayerInputState): boolean {
  if (!a) return false;
  return (
    !hasDiscreteInputChanged(a, b) &&
    a.aimAngle === b.aimAngle &&
    (a.stickX ?? 0) === (b.stickX ?? 0) &&
    (a.stickY ?? 0) === (b.stickY ?? 0)
  );
}

export interface QueuedInputPacket {
  type: 'player:input';
  input: PlayerInputState;
  seq: number;
}

export interface InputDispatchResult {
  status: 'sent' | 'deduped' | 'queued_throttle' | 'queued_backpressure';
  seq?: number;
  retryDelayMs?: number;
}

/**
 * Coordinates quantized input deduplication, continuous aim/stick throttling,
 * monotonic sequence tagging, and zero-loss backpressure retry scheduling.
 * Unlike fire-and-forget senders, `lastSentInput` only advances once transport
 * accepts the frame, ensuring key-up/attack transitions are never silenced by dedup.
 */
export class ReliableInputDispatcher {
  private lastSentInput: PlayerInputState | null = null;
  private lastSentAtMs = 0;
  private pendingInput: PlayerInputState | null = null;
  private nextSeq = 0;

  public get latestSentSeq(): number {
    return this.nextSeq;
  }

  public hasPending(): boolean {
    return this.pendingInput !== null;
  }

  public reset(): void {
    this.lastSentInput = null;
    this.lastSentAtMs = 0;
    this.pendingInput = null;
    this.nextSeq = 0;
  }

  public submit(
    rawInput: PlayerInputState,
    nowMs: number,
    transportSend: (msg: QueuedInputPacket) => boolean
  ): InputDispatchResult {
    const quantized = quantizePlayerInput(rawInput);
    const baseline = this.pendingInput ?? this.lastSentInput;
    if (isSameQuantizedInput(baseline, quantized)) {
      return { status: 'deduped' };
    }

    const discreteChanged = hasDiscreteInputChanged(this.lastSentInput, quantized);
    const elapsed = nowMs - this.lastSentAtMs;

    if (discreteChanged || elapsed >= CLIENT_INPUT_CONTINUOUS_INTERVAL_MS) {
      const seq = this.nextSeq + 1;
      if (transportSend({ type: 'player:input', input: quantized, seq })) {
        this.nextSeq = seq;
        this.lastSentInput = quantized;
        this.lastSentAtMs = nowMs;
        this.pendingInput = null;
        return { status: 'sent', seq };
      }
      // Retain latest state and schedule fast backpressure drain retry without updating lastSentInput
      this.pendingInput = quantized;
      return {
        status: 'queued_backpressure',
        retryDelayMs: CLIENT_INPUT_BACKPRESSURE_RETRY_MS,
      };
    }

    this.pendingInput = quantized;
    return {
      status: 'queued_throttle',
      retryDelayMs: Math.max(4, CLIENT_INPUT_CONTINUOUS_INTERVAL_MS - elapsed),
    };
  }

  public flushPending(
    nowMs: number,
    transportSend: (msg: QueuedInputPacket) => boolean
  ): { sent: boolean; seq?: number; retryDelayMs?: number } {
    const queued = this.pendingInput;
    if (!queued) {
      return { sent: false };
    }
    if (isSameQuantizedInput(this.lastSentInput, queued)) {
      this.pendingInput = null;
      return { sent: false };
    }
    const seq = this.nextSeq + 1;
    if (transportSend({ type: 'player:input', input: queued, seq })) {
      this.nextSeq = seq;
      this.lastSentInput = queued;
      this.lastSentAtMs = nowMs;
      this.pendingInput = null;
      return { sent: true, seq };
    }
    return { sent: false, retryDelayMs: CLIENT_INPUT_BACKPRESSURE_RETRY_MS };
  }
}
