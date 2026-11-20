import type { ArcanistScrollId } from './arcanist.ts';
import type {
  EnemyState,
  FieldZoneState,
  FloatingEvent,
  GameSnapshot,
  NpcState,
  PlayerState,
  PropState,
  TrainingDummyState,
} from './types.ts';

export type SnapshotScalarFields = Partial<
  Pick<
    GameSnapshot,
    | 'roomId'
    | 'roomName'
    | 'hostId'
    | 'hostName'
    | 'difficulty'
    | 'status'
    | 'floor'
    | 'seed'
    | 'elapsedSec'
    | 'bossDefeated'
    | 'bossRoomCleared'
    | 'bossWards'
    | 'maxBossWards'
    | 'guardiansRemaining'
    | 'guardiansTotal'
    | 'combatRoomsCleared'
    | 'combatRoomsTotal'
    | 'floorMasteryAwarded'
    | 'portalReadyCount'
  >
>;

export interface EntityPatch<T extends { id: string }> {
  id: string;
  changes: Partial<T>;
  removedKeys?: string[];
}

export interface SnapshotDelta {
  seq: number;
  baseSeq: number;
  scalars?: SnapshotScalarFields;
  playersAdded?: PlayerState[];
  playersUpdated?: EntityPatch<PlayerState>[];
  playersRemoved?: string[];
  enemiesAdded?: EnemyState[];
  enemiesUpdated?: EntityPatch<EnemyState>[];
  enemiesRemoved?: string[];
  projectiles?: GameSnapshot['projectiles'];
  zones?: FieldZoneState[];
  props?: PropState[];
  npcs?: NpcState[];
  trainingDummies?: TrainingDummyState[];
  roomClearedFlags?: GameSnapshot['roomClearedFlags'];
  events?: FloatingEvent[];
  lastRunSummary?: GameSnapshot['lastRunSummary'];
}

function shallowEqualValues(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!shallowEqualValues(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      const k = keysA[i];
      if (!Object.prototype.hasOwnProperty.call(objB, k)) return false;
      if (!shallowEqualValues(objA[k], objB[k])) return false;
    }
    return true;
  }
  return false;
}

function diffEntity<T extends { id: string }>(
  prev: T,
  next: T
): { changes: Partial<T>; removedKeys?: string[] } | null {
  const prevRec = prev as Record<string, unknown>;
  const nextRec = next as Record<string, unknown>;
  let changes: Record<string, unknown> | null = null;
  let removedKeys: string[] | undefined;

  for (const key of Object.keys(nextRec)) {
    if (key === 'id') continue;
    if (!shallowEqualValues(prevRec[key], nextRec[key])) {
      if (!changes) changes = {};
      changes[key] = nextRec[key];
    }
  }

  for (const key of Object.keys(prevRec)) {
    if (key === 'id') continue;
    if ((!(key in nextRec) || nextRec[key] === undefined) && prevRec[key] !== undefined) {
      if (!removedKeys) removedKeys = [];
      removedKeys.push(key);
    }
  }

  if (!changes && !removedKeys) return null;
  return {
    changes: (changes ?? {}) as Partial<T>,
    ...(removedKeys ? { removedKeys } : {}),
  };
}

function diffEntityArray<T extends { id: string }>(
  prevList: readonly T[],
  nextList: readonly T[]
): {
  added?: T[];
  updated?: EntityPatch<T>[];
  removed?: string[];
} {
  const prevById = new Map<string, T>();
  for (let i = 0; i < prevList.length; i++) {
    prevById.set(prevList[i].id, prevList[i]);
  }

  const nextIds = new Set<string>();
  let added: T[] | undefined;
  let updated: EntityPatch<T>[] | undefined;

  for (let i = 0; i < nextList.length; i++) {
    const nextItem = nextList[i];
    nextIds.add(nextItem.id);
    const prevItem = prevById.get(nextItem.id);
    if (!prevItem) {
      if (!added) added = [];
      added.push(nextItem);
    } else {
      const patch = diffEntity(prevItem, nextItem);
      if (patch) {
        if (!updated) updated = [];
        updated.push({
          id: nextItem.id,
          changes: patch.changes,
          ...(patch.removedKeys ? { removedKeys: patch.removedKeys } : {}),
        });
      }
    }
  }

  let removed: string[] | undefined;
  for (let i = 0; i < prevList.length; i++) {
    const prevId = prevList[i].id;
    if (!nextIds.has(prevId)) {
      if (!removed) removed = [];
      removed.push(prevId);
    }
  }

  return { added, updated, removed };
}

function applyEntityDiff<T extends { id: string }>(
  prevList: readonly T[],
  added?: readonly T[],
  updated?: readonly EntityPatch<T>[],
  removed?: readonly string[]
): T[] {
  if (!added?.length && !updated?.length && !removed?.length) {
    return prevList as T[];
  }

  const removedSet = removed?.length ? new Set(removed) : null;
  const updatedMap = updated?.length
    ? new Map(updated.map((u) => [u.id, u]))
    : null;

  const result: T[] = [];
  for (let i = 0; i < prevList.length; i++) {
    const item = prevList[i];
    if (removedSet?.has(item.id)) continue;
    const patch = updatedMap?.get(item.id);
    if (patch) {
      const merged = { ...item, ...patch.changes } as Record<string, unknown>;
      for (const key of Object.keys(patch.changes)) {
        if (merged[key] === undefined) {
          delete merged[key];
        }
      }
      if (patch.removedKeys) {
        for (let k = 0; k < patch.removedKeys.length; k++) {
          delete merged[patch.removedKeys[k]];
        }
      }
      result.push(merged as T);
    } else {
      result.push(item);
    }
  }

  if (added?.length) {
    for (let i = 0; i < added.length; i++) {
      result.push(added[i]);
    }
  }

  return result;
}

const SCALAR_KEYS = [
  'roomId',
  'roomName',
  'hostId',
  'hostName',
  'difficulty',
  'status',
  'floor',
  'seed',
  'elapsedSec',
  'bossDefeated',
  'bossRoomCleared',
  'bossWards',
  'maxBossWards',
  'guardiansRemaining',
  'guardiansTotal',
  'combatRoomsCleared',
  'combatRoomsTotal',
  'floorMasteryAwarded',
  'portalReadyCount',
] as const;

/**
 * Produces an immutable deep-enough baseline copy of a GameSnapshot so mutating
 * room objects on subsequent server ticks never corrupts delta diff comparisons.
 */
export function cloneSnapshotBaseline(snap: GameSnapshot): GameSnapshot {
  const baseline: GameSnapshot = {
    ...snap,
    players: snap.players.map((p) => {
      const copy: PlayerState = {
        ...p,
        relics: [...p.relics],
        storage: [...(p.storage || [])],
        pendingRelicChoices: [...p.pendingRelicChoices],
        statuses: p.statuses.map((s) => ({ ...s })),
      };
      if (p.floorBlessings) copy.floorBlessings = [...p.floorBlessings];
      if (p.spellCastState !== undefined) {
        copy.spellCastState = p.spellCastState ? { ...p.spellCastState } : null;
      }
      if (p.disintegrationState !== undefined) {
        copy.disintegrationState = p.disintegrationState ? { ...p.disintegrationState } : null;
      }
      if (p.pendingScrollChoices) copy.pendingScrollChoices = [...p.pendingScrollChoices];
      if (p.ownedWeapons) copy.ownedWeapons = [...p.ownedWeapons];
      if (p.ownedVestments) copy.ownedVestments = [...p.ownedVestments];
      return copy;
    }),
    enemies: snap.enemies.map((e) => {
      const copy: EnemyState = { ...e };
      if (e.resistances) copy.resistances = { ...e.resistances };
      return copy;
    }),
    projectiles: snap.projectiles.map((pr) => ({ ...pr })),
    props: snap.props.map((pr) => {
      const copy: PropState = { ...pr };
      if (pr.claimedRelicPlayerIds) copy.claimedRelicPlayerIds = [...pr.claimedRelicPlayerIds];
      if (pr.claimedScrollPlayerIds) copy.claimedScrollPlayerIds = [...pr.claimedScrollPlayerIds];
      if (pr.relicChoicesByPlayer) {
        const mapCopy: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(pr.relicChoicesByPlayer)) {
          mapCopy[k] = [...v];
        }
        copy.relicChoicesByPlayer = mapCopy;
      }
      if (pr.scrollChoicesByPlayer) {
        const mapCopy: Record<string, ArcanistScrollId[]> = {};
        for (const [k, v] of Object.entries(pr.scrollChoicesByPlayer)) {
          mapCopy[k] = [...v];
        }
        copy.scrollChoicesByPlayer = mapCopy;
      }
      return copy;
    }),
    zones: snap.zones.map((z) => {
      const copy: FieldZoneState = { ...z };
      if (z.chainPoints) copy.chainPoints = z.chainPoints.map((pt) => ({ ...pt }));
      return copy;
    }),
    npcs: snap.npcs.map((n) => {
      const copy: NpcState = { ...n };
      if (n.options) copy.options = n.options.map((o) => ({ ...o }));
      return copy;
    }),
    trainingDummies: snap.trainingDummies.map((d) => ({ ...d })),
    events: [],
    roomClearedFlags: snap.roomClearedFlags.map((f) => ({ ...f })),
  };
  if (snap.lastRunSummary !== undefined) {
    baseline.lastRunSummary = snap.lastRunSummary
      ? {
          ...snap.lastRunSummary,
          players: snap.lastRunSummary.players.map((lp) => ({ ...lp })),
        }
      : null;
  }
  return baseline;
}

export function computeSnapshotDelta(
  prev: GameSnapshot,
  next: GameSnapshot,
  baseSeq: number,
  nextSeq: number
): SnapshotDelta {
  const delta: SnapshotDelta = {
    seq: nextSeq,
    baseSeq,
  };

  let scalars: Record<string, unknown> | undefined;
  const prevRec = prev as unknown as Record<string, unknown>;
  const nextRec = next as unknown as Record<string, unknown>;
  for (let i = 0; i < SCALAR_KEYS.length; i++) {
    const k = SCALAR_KEYS[i];
    if (!Object.is(prevRec[k], nextRec[k])) {
      if (!scalars) scalars = {};
      scalars[k] = nextRec[k];
    }
  }
  if (scalars) {
    delta.scalars = scalars as SnapshotScalarFields;
  }

  const playerDiff = diffEntityArray(prev.players, next.players);
  if (playerDiff.added) delta.playersAdded = playerDiff.added;
  if (playerDiff.updated) delta.playersUpdated = playerDiff.updated;
  if (playerDiff.removed) delta.playersRemoved = playerDiff.removed;

  const enemyDiff = diffEntityArray(prev.enemies, next.enemies);
  if (enemyDiff.added) delta.enemiesAdded = enemyDiff.added;
  if (enemyDiff.updated) delta.enemiesUpdated = enemyDiff.updated;
  if (enemyDiff.removed) delta.enemiesRemoved = enemyDiff.removed;

  if (!shallowEqualValues(prev.projectiles, next.projectiles)) {
    delta.projectiles = next.projectiles;
  }

  if (!shallowEqualValues(prev.zones, next.zones)) {
    delta.zones = next.zones;
  }

  if (!shallowEqualValues(prev.props, next.props)) {
    delta.props = next.props;
  }

  if (!shallowEqualValues(prev.npcs, next.npcs)) {
    delta.npcs = next.npcs;
  }

  if (!shallowEqualValues(prev.trainingDummies, next.trainingDummies)) {
    delta.trainingDummies = next.trainingDummies;
  }

  if (!shallowEqualValues(prev.roomClearedFlags, next.roomClearedFlags)) {
    delta.roomClearedFlags = next.roomClearedFlags;
  }

  if (next.events.length > 0) {
    delta.events = next.events;
  }

  const prevRun = prev.lastRunSummary ?? null;
  const nextRun = next.lastRunSummary ?? null;
  if (!shallowEqualValues(prevRun, nextRun)) {
    delta.lastRunSummary = nextRun;
  }

  return delta;
}

export function applySnapshotDelta(prev: GameSnapshot, delta: SnapshotDelta): GameSnapshot {
  const players = applyEntityDiff(
    prev.players,
    delta.playersAdded,
    delta.playersUpdated,
    delta.playersRemoved
  );
  const enemies = applyEntityDiff(
    prev.enemies,
    delta.enemiesAdded,
    delta.enemiesUpdated,
    delta.enemiesRemoved
  );

  const next: GameSnapshot = {
    ...prev,
    ...(delta.scalars ?? {}),
    players,
    enemies,
    projectiles: delta.projectiles !== undefined ? delta.projectiles : prev.projectiles,
    zones: delta.zones !== undefined ? delta.zones : prev.zones,
    props: delta.props !== undefined ? delta.props : prev.props,
    npcs: delta.npcs !== undefined ? delta.npcs : prev.npcs,
    trainingDummies:
      delta.trainingDummies !== undefined ? delta.trainingDummies : prev.trainingDummies,
    roomClearedFlags:
      delta.roomClearedFlags !== undefined ? delta.roomClearedFlags : prev.roomClearedFlags,
    events: delta.events ?? [],
  };
  if (delta.lastRunSummary !== undefined) {
    next.lastRunSummary = delta.lastRunSummary;
  }
  return next;
}
