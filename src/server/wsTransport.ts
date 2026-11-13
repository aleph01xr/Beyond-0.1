import type { ServerMessage } from '../shared/types.ts';

export const WS_OPEN_READY_STATE = 1;
export const WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES = 64 * 1024;
export const WS_CRITICAL_BACKPRESSURE_BYTES = 512 * 1024;
export const WS_MAX_CONSECUTIVE_DROPPED_TICKS = 100;

export interface TransportSocketLike {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
  close(code?: number, data?: string): void;
  terminate?: () => void;
}

export interface ManagedWsClient {
  ws: TransportSocketLike;
  userId: string;
  username: string;
  roomId: string | null;
  droppedTicks?: number;
  totalDroppedTicks?: number;
}

export interface SendFrameOptions {
  droppable?: boolean;
  highWaterBytes?: number;
  criticalBytes?: number;
  maxConsecutiveDrops?: number;
}

export type SendFrameOutcome =
  | 'sent'
  | 'dropped_backpressure'
  | 'closed_overflow'
  | 'not_open';

export interface BroadcastStats {
  serializedBytes: number;
  targetCount: number;
  sentCount: number;
  droppedCount: number;
  closedCount: number;
}

function closeCongestedSocket(ws: TransportSocketLike): void {
  try {
    if (typeof ws.terminate === 'function') {
      ws.terminate();
    } else {
      ws.close(4008, 'Backpressure overflow');
    }
  } catch {
    // Socket may already be closing or closed
  }
}

/**
 * Sends an already-serialized WebSocket payload while enforcing backpressure thresholds.
 * Non-critical periodic updates (e.g., room:tick / lobby:rooms) are skipped when the client's
 * outbound socket buffer exceeds the high-water mark so stale frames do not accumulate.
 * Sockets exceeding the critical cap or failing to drain over sustained ticks are closed.
 */
export function sendRawFrame(
  target: ManagedWsClient | TransportSocketLike,
  rawPayload: string,
  options: SendFrameOptions = {}
): SendFrameOutcome {
  const isManaged = 'ws' in target;
  const ws = isManaged ? target.ws : target;

  if (ws.readyState !== WS_OPEN_READY_STATE) {
    return 'not_open';
  }

  const highWaterBytes = options.highWaterBytes ?? WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES;
  const criticalBytes = options.criticalBytes ?? WS_CRITICAL_BACKPRESSURE_BYTES;
  const maxConsecutiveDrops =
    options.maxConsecutiveDrops ?? WS_MAX_CONSECUTIVE_DROPPED_TICKS;

  if (ws.bufferedAmount > criticalBytes) {
    closeCongestedSocket(ws);
    return 'closed_overflow';
  }

  if (options.droppable && ws.bufferedAmount > highWaterBytes) {
    if (isManaged) {
      target.droppedTicks = (target.droppedTicks ?? 0) + 1;
      target.totalDroppedTicks = (target.totalDroppedTicks ?? 0) + 1;
      if (target.droppedTicks >= maxConsecutiveDrops) {
        closeCongestedSocket(ws);
        return 'closed_overflow';
      }
    }
    return 'dropped_backpressure';
  }

  if (isManaged) {
    target.droppedTicks = 0;
  }

  try {
    ws.send(rawPayload);
    return 'sent';
  } catch {
    return 'not_open';
  }
}

export function sendJsonMessage(
  target: ManagedWsClient | TransportSocketLike,
  msg: ServerMessage,
  options?: SendFrameOptions
): SendFrameOutcome {
  return sendRawFrame(target, JSON.stringify(msg), options);
}

/**
 * Serializes a server message exactly once and broadcasts the resulting payload string
 * across all eligible targets with per-client backpressure enforcement.
 */
export function broadcastSerialized<T extends ManagedWsClient | TransportSocketLike>(
  targets: Iterable<T>,
  msg: ServerMessage,
  options: SendFrameOptions = {},
  serializeFn: (value: ServerMessage) => string = JSON.stringify
): BroadcastStats {
  const iterator = targets[Symbol.iterator]();
  const first = iterator.next();
  if (first.done) {
    return {
      serializedBytes: 0,
      targetCount: 0,
      sentCount: 0,
      droppedCount: 0,
      closedCount: 0,
    };
  }

  const rawPayload = serializeFn(msg);
  let targetCount = 0;
  let sentCount = 0;
  let droppedCount = 0;
  let closedCount = 0;

  let current: IteratorResult<T> = first;
  while (!current.done) {
    targetCount++;
    const outcome = sendRawFrame(current.value, rawPayload, options);
    if (outcome === 'sent') sentCount++;
    else if (outcome === 'dropped_backpressure') droppedCount++;
    else if (outcome === 'closed_overflow') closedCount++;
    current = iterator.next();
  }

  return {
    serializedBytes: rawPayload.length,
    targetCount,
    sentCount,
    droppedCount,
    closedCount,
  };
}

/**
 * Indexes connected clients by active roomId so per-tick broadcasts iterate
 * only room members in O(roomSize) instead of scanning every connected socket.
 */
export class RoomClientIndex<T extends ManagedWsClient> {
  private readonly byRoom = new Map<string, Set<T>>();

  public assignRoom(client: T, roomId: string | null): void {
    if (client.roomId && client.roomId !== roomId) {
      this.removeFromRoom(client, client.roomId);
    }
    client.roomId = roomId;
    if (!roomId) return;

    let set = this.byRoom.get(roomId);
    if (!set) {
      set = new Set<T>();
      this.byRoom.set(roomId, set);
    }
    set.add(client);
  }

  public removeFromRoom(client: T, roomId = client.roomId): void {
    if (!roomId) return;
    const set = this.byRoom.get(roomId);
    if (set) {
      set.delete(client);
      if (set.size === 0) {
        this.byRoom.delete(roomId);
      }
    }
    if (client.roomId === roomId) {
      client.roomId = null;
    }
  }

  public getRoomClients(roomId: string): Iterable<T> {
    return this.byRoom.get(roomId) ?? [];
  }

  public getRoomClientCount(roomId: string): number {
    return this.byRoom.get(roomId)?.size ?? 0;
  }
}
