import { GameRoom } from './gameEngine.ts';
import type { RoomClientIndex, TransportSocketLike } from './wsTransport.ts';
import type {
  DifficultyTier,
  DungeonMap,
  GameSnapshot,
  HeroClassId,
  ServerMessage,
} from '../shared/types.ts';

export interface PartyClient extends TransportSocketLike {
  // marker not needed; we use ManagedWsClient shape
}

export interface ManagedPartyClient {
  ws: TransportSocketLike;
  userId: string;
  username: string;
  roomId: string | null;
  droppedTicks?: number;
  totalDroppedTicks?: number;
  needsKeyframe?: boolean;
}

export interface PartyAccountInput {
  id: string;
  username: string;
  heroClass: HeroClassId;
  isAdmin?: boolean;
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
  };
}

export interface RoomDeltaStateLike {
  seq: number;
  lastBaseline: GameSnapshot | null;
}

export interface PartyCoordinatorDeps<TClient extends ManagedPartyClient> {
  rooms: Map<string, GameRoom>;
  roomClientIndex: RoomClientIndex<TClient>;
  roomDeltaStates: Map<string, RoomDeltaStateLike>;
  dirtyNonPlayingRooms: Set<string>;
  disconnectGraceMs?: number;
  generateRoomCode: () => string;
  sendJson: (ws: TransportSocketLike, msg: ServerMessage) => void;
  broadcastToRoom: (roomId: string, msg: ServerMessage) => void;
  broadcastRoomList: () => void;
  onRoomCreated?: (room: GameRoom) => void;
}

export const DEFAULT_EXPEDITION_DISCONNECT_GRACE_MS = 20000;

export class PartyCoordinator<TClient extends ManagedPartyClient> {
  private readonly rooms: Map<string, GameRoom>;
  private readonly roomClientIndex: RoomClientIndex<TClient>;
  private readonly roomDeltaStates: Map<string, RoomDeltaStateLike>;
  private readonly dirtyNonPlayingRooms: Set<string>;
  private readonly disconnectGraceMs: number;
  private readonly generateRoomCode: () => string;
  private readonly sendJson: (ws: TransportSocketLike, msg: ServerMessage) => void;
  private readonly broadcastToRoom: (roomId: string, msg: ServerMessage) => void;
  private readonly broadcastRoomList: () => void;
  private readonly onRoomCreated?: (room: GameRoom) => void;
  private readonly disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(deps: PartyCoordinatorDeps<TClient>) {
    this.rooms = deps.rooms;
    this.roomClientIndex = deps.roomClientIndex;
    this.roomDeltaStates = deps.roomDeltaStates;
    this.dirtyNonPlayingRooms = deps.dirtyNonPlayingRooms;
    this.disconnectGraceMs =
      deps.disconnectGraceMs ?? DEFAULT_EXPEDITION_DISCONNECT_GRACE_MS;
    this.generateRoomCode = deps.generateRoomCode;
    this.sendJson = deps.sendJson;
    this.broadcastToRoom = deps.broadcastToRoom;
    this.broadcastRoomList = deps.broadcastRoomList;
    this.onRoomCreated = deps.onRoomCreated;
  }

  private timerKey(roomId: string, userId: string): string {
    return `${roomId}:${userId}`;
  }

  public clearDisconnectTimer(roomId: string, userId: string): void {
    const key = this.timerKey(roomId, userId);
    const existing = this.disconnectTimers.get(key);
    if (existing) {
      clearTimeout(existing);
      this.disconnectTimers.delete(key);
    }
  }

  public clearRoomTimers(roomId: string): void {
    const prefix = `${roomId}:`;
    for (const [key, timer] of this.disconnectTimers.entries()) {
      if (key.startsWith(prefix)) {
        clearTimeout(timer);
        this.disconnectTimers.delete(key);
      }
    }
  }

  public disposeAllTimers(): void {
    for (const timer of this.disconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.disconnectTimers.clear();
  }

  public markRoomDirty(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.status !== 'playing') {
      this.dirtyNonPlayingRooms.add(roomId);
    }
  }

  private wireRoomCallbacks(room: GameRoom): void {
    room.onChatMessageCallback = (msg) => {
      this.broadcastToRoom(room.roomId, {
        type: 'chat:message',
        message: msg,
      });
    };
    if (this.onRoomCreated) {
      this.onRoomCreated(room);
    }
  }

  public ensureTavernRoom(): GameRoom {
    let tavern = this.rooms.get('TAVERN-HUB');
    if (!tavern) {
      tavern = new GameRoom({
        roomId: 'TAVERN-HUB',
        name: 'Sanctuary Tavern & Social Hub',
        hostName: 'Innkeeper',
        difficulty: 'Normal',
        seed: 777,
        initialStatus: 'playing',
      });
      this.wireRoomCallbacks(tavern);
      this.rooms.set('TAVERN-HUB', tavern);
    }
    return tavern;
  }

  public createParty(
    client: TClient,
    account: PartyAccountInput,
    opts: { name: string; difficulty: DifficultyTier; seed?: number }
  ): GameRoom {
    if (client.roomId) {
      this.leaveRoomExplicit(client);
    }

    const roomId = this.generateRoomCode();
    const room = new GameRoom({
      roomId,
      name: opts.name.trim() || `${account.username}'s Party`,
      hostId: account.id,
      hostName: account.username,
      difficulty: opts.difficulty,
      seed: opts.seed,
      initialFloor: 1,
      initialStatus: 'waiting',
    });

    this.wireRoomCallbacks(room);
    this.rooms.set(roomId, room);

    room.addOrReconnectPlayer(
      account.id,
      account.username,
      account.heroClass,
      Boolean(account.isAdmin),
      account.savedStats
    );

    this.roomClientIndex.assignRoom(client, room.roomId);
    client.needsKeyframe = true;
    this.markRoomDirty(room.roomId);

    this.sendJson(client.ws, {
      type: 'room:joined',
      roomId: room.roomId,
      playerId: account.id,
      map: room.map,
      snapshot: room.buildSnapshot(),
      chat: room.chat,
    });
    this.broadcastRoomList();
    return room;
  }

  public joinOrReconnectRoom(
    client: TClient,
    account: PartyAccountInput,
    rawRoomId: string
  ):
    | { ok: true; room: GameRoom; isReconnect: boolean }
    | { ok: false; reason: string } {
    const normalizedCode = rawRoomId.trim().toUpperCase();
    const room =
      normalizedCode === 'TAVERN-HUB'
        ? this.ensureTavernRoom()
        : this.rooms.get(normalizedCode);

    if (!room) {
      const reason = `Room "${normalizedCode}" was not found or has closed.`;
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }

    // Authoritative lock / capacity validation BEFORE leaving existing room
    const check = room.canAcceptJoin(account.id);
    if (!check.allowed) {
      this.sendJson(client.ws, { type: 'error', message: check.reason });
      return { ok: false, reason: check.reason };
    }

    if (client.roomId && client.roomId !== room.roomId) {
      this.leaveRoomExplicit(client);
    }

    this.clearDisconnectTimer(room.roomId, account.id);

    // Detach any stale duplicate socket belonging to this same user in this room
    for (const existingClient of Array.from(
      this.roomClientIndex.getRoomClients(room.roomId)
    )) {
      if (existingClient !== client && existingClient.userId === account.id) {
        this.roomClientIndex.removeFromRoom(existingClient, room.roomId);
      }
    }

    room.addOrReconnectPlayer(
      account.id,
      account.username,
      account.heroClass,
      Boolean(account.isAdmin),
      account.savedStats
    );

    this.roomClientIndex.assignRoom(client, room.roomId);
    client.needsKeyframe = true;
    this.markRoomDirty(room.roomId);

    this.sendJson(client.ws, {
      type: 'room:joined',
      roomId: room.roomId,
      playerId: account.id,
      map: room.map,
      snapshot: room.buildSnapshot(),
      chat: room.chat,
    });
    this.broadcastRoomList();

    return { ok: true, room, isReconnect: check.isReconnect };
  }

  public startExpedition(
    client: TClient
  ): { ok: true; map: DungeonMap } | { ok: false; reason: string } {
    if (!client.roomId) {
      return { ok: false, reason: 'You are not in a party room.' };
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.roomId === 'TAVERN-HUB') {
      return { ok: false, reason: 'Invalid party room.' };
    }
    if (!room.isHost(client.userId)) {
      const reason = 'Only the party host can start the expedition.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    if (room.status === 'playing') {
      const reason = 'This expedition is already in progress.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    if (room.status !== 'waiting') {
      const reason =
        'Return to the waiting lobby or restart before starting a new expedition.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    if (room.getConnectedPlayerCount() === 0) {
      const reason = 'Cannot start expedition without connected party members.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }

    const freshMap = room.startExpedition();
    this.dirtyNonPlayingRooms.delete(room.roomId);
    this.roomDeltaStates.delete(room.roomId);
    for (const c of this.roomClientIndex.getRoomClients(room.roomId)) {
      c.needsKeyframe = true;
    }
    this.broadcastToRoom(room.roomId, { type: 'room:map', map: freshMap });
    this.broadcastRoomList();

    return { ok: true, map: freshMap };
  }

  public setPlayerReady(
    client: TClient,
    ready?: boolean
  ): { ok: true; ready: boolean } | { ok: false; reason: string } {
    if (!client.roomId) {
      return { ok: false, reason: 'You are not in a party room.' };
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.roomId === 'TAVERN-HUB') {
      const reason = 'Ready status is only used in expedition party lobbies.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    const result = room.setPlayerReady(client.userId, ready);
    if (!result.ok) {
      this.sendJson(client.ws, { type: 'error', message: result.reason });
      return result;
    }
    this.markRoomDirty(room.roomId);
    return result;
  }

  public restartExpedition(
    client: TClient
  ): { ok: true; map: DungeonMap } | { ok: false; reason: string } {
    if (!client.roomId) {
      return { ok: false, reason: 'You are not in a party room.' };
    }
    const room = this.rooms.get(client.roomId);
    if (!room) {
      return { ok: false, reason: 'Room not found.' };
    }
    if (room.roomId !== 'TAVERN-HUB' && !room.isHost(client.userId)) {
      const reason = 'Only the party host can restart the expedition.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    if (room.roomId !== 'TAVERN-HUB' && room.status === 'waiting') {
      const reason = 'Start the expedition from the waiting lobby first.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }

    const freshMap = room.restartRun();
    this.dirtyNonPlayingRooms.delete(room.roomId);
    this.roomDeltaStates.delete(room.roomId);
    for (const c of this.roomClientIndex.getRoomClients(room.roomId)) {
      c.needsKeyframe = true;
    }
    this.broadcastToRoom(room.roomId, { type: 'room:map', map: freshMap });
    this.broadcastRoomList();

    return { ok: true, map: freshMap };
  }

  public returnToLobby(
    client: TClient
  ): { ok: true } | { ok: false; reason: string } {
    if (!client.roomId) {
      return { ok: false, reason: 'You are not in a party room.' };
    }
    const room = this.rooms.get(client.roomId);
    if (!room || room.roomId === 'TAVERN-HUB') {
      return { ok: false, reason: 'Invalid party room.' };
    }
    if (!room.isHost(client.userId)) {
      const reason =
        'Only the party host can return the party to the waiting lobby.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    if (room.status === 'playing') {
      const reason =
        'Cannot unlock the party while an expedition is still active.';
      this.sendJson(client.ws, { type: 'error', message: reason });
      return { ok: false, reason };
    }
    if (room.status === 'waiting') {
      return { ok: true };
    }

    this.clearRoomTimers(room.roomId);
    room.returnToWaitingLobby();

    this.roomDeltaStates.delete(room.roomId);
    for (const c of this.roomClientIndex.getRoomClients(room.roomId)) {
      c.needsKeyframe = true;
    }
    this.dirtyNonPlayingRooms.add(room.roomId);
    this.broadcastRoomList();

    return { ok: true };
  }

  public leaveRoomExplicit(client: TClient): void {
    if (!client.roomId) return;
    const oldRoomId = client.roomId;
    this.clearDisconnectTimer(oldRoomId, client.userId);
    this.roomClientIndex.removeFromRoom(client, oldRoomId);

    const room = this.rooms.get(oldRoomId);
    if (room) {
      const stillConnected = Array.from(
        this.roomClientIndex.getRoomClients(oldRoomId)
      ).some((other) => other.userId === client.userId);

      if (!stillConnected) {
        room.removePlayer(client.userId);
        if (room.getPlayerCount() === 0 && oldRoomId !== 'TAVERN-HUB') {
          this.clearRoomTimers(oldRoomId);
          this.rooms.delete(oldRoomId);
          this.roomDeltaStates.delete(oldRoomId);
          this.dirtyNonPlayingRooms.delete(oldRoomId);
        } else {
          this.markRoomDirty(oldRoomId);
        }
      }
    }
    this.broadcastRoomList();
  }

  public handleSocketDisconnect(client: TClient): void {
    if (!client.roomId) {
      this.broadcastRoomList();
      return;
    }

    const oldRoomId = client.roomId;
    this.roomClientIndex.removeFromRoom(client, oldRoomId);

    const stillHasSocket = Array.from(
      this.roomClientIndex.getRoomClients(oldRoomId)
    ).some((other) => other.userId === client.userId);
    if (stillHasSocket) {
      return;
    }

    const room = this.rooms.get(oldRoomId);
    if (!room) {
      this.broadcastRoomList();
      return;
    }

    // Tavern or waiting lobby: remove immediately and transfer host if needed
    if (oldRoomId === 'TAVERN-HUB' || room.status === 'waiting') {
      room.removePlayer(client.userId);
      if (room.getPlayerCount() === 0 && oldRoomId !== 'TAVERN-HUB') {
        this.clearRoomTimers(oldRoomId);
        this.rooms.delete(oldRoomId);
        this.roomDeltaStates.delete(oldRoomId);
        this.dirtyNonPlayingRooms.delete(oldRoomId);
      } else {
        this.markRoomDirty(oldRoomId);
      }
      this.broadcastRoomList();
      return;
    }

    // Active / ended expedition: mark disconnected & start permanent-disconnect grace timer
    room.markPlayerDisconnected(client.userId);
    this.markRoomDirty(oldRoomId);
    this.broadcastRoomList();

    this.clearDisconnectTimer(oldRoomId, client.userId);
    const key = this.timerKey(oldRoomId, client.userId);
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(key);
      const currentRoom = this.rooms.get(oldRoomId);
      if (!currentRoom) return;
      if (
        !currentRoom.hasPlayer(client.userId) ||
        currentRoom.isPlayerConnected(client.userId)
      ) {
        return;
      }

      if (currentRoom.getConnectedPlayerCount() === 0) {
        this.clearRoomTimers(oldRoomId);
        this.rooms.delete(oldRoomId);
        this.roomDeltaStates.delete(oldRoomId);
        this.dirtyNonPlayingRooms.delete(oldRoomId);
        this.broadcastRoomList();
        return;
      }

      if (currentRoom.isHost(client.userId)) {
        const transfer = currentRoom.transferHostToConnectedMember(client.userId);
        if (transfer) {
          this.markRoomDirty(oldRoomId);
          this.broadcastRoomList();
        }
      }
    }, this.disconnectGraceMs);

    this.disconnectTimers.set(key, timer);
  }
}
