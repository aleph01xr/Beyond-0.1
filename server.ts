import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { GameRoom } from './src/server/gameEngine.ts';
import type {
  ClientMessage,
  DifficultyTier,
  HeroClassId,
  ServerMessage,
  UserProfile,
} from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AccountRecord {
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
}

const accountsByLower = new Map<string, AccountRecord>();
const accountsById = new Map<string, AccountRecord>();
const sessionsByToken = new Map<string, string>();

function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(`beyond_salt_${pw}`).digest('hex');
}

function toPublicProfile(acc: AccountRecord): UserProfile {
  return {
    id: acc.id,
    username: acc.username,
    preferredClass: acc.lockedClass,
    lockedClass: acc.lockedClass,
    runsCompleted: acc.runsCompleted,
    highestFloor: acc.highestFloor,
    totalKills: acc.totalKills,
    totalRevives: acc.totalRevives,
  };
}

function createAccount(
  username: string,
  password: string,
  chosenClass: HeroClassId = 'vanguard'
): AccountRecord {
  const validClass: HeroClassId =
    chosenClass === 'ranger' || chosenClass === 'arcanist' || chosenClass === 'cleric'
      ? chosenClass
      : 'vanguard';
  const id = `usr_${crypto.randomBytes(6).toString('hex')}`;
  const rec: AccountRecord = {
    id,
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: hashPassword(password),
    lockedClass: validClass,
    preferredClass: validClass,
    runsCompleted: 0,
    highestFloor: 0,
    totalKills: 0,
    totalRevives: 0,
  };
  accountsByLower.set(rec.usernameLower, rec);
  accountsById.set(rec.id, rec);
  return rec;
}

// Seed default wanderer account locked as vanguard
createAccount('wanderer', 'beyond', 'vanguard');

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  username: string;
  roomId: string | null;
}

const rooms = new Map<string, GameRoom>();
const clients = new Set<ConnectedClient>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BYND-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sendJson(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoomList(): void {
  const summaries = Array.from(rooms.values()).map((r) => r.getSummary());
  const payload: ServerMessage = {
    type: 'lobby:rooms',
    rooms: summaries,
    onlineCount: clients.size,
  };
  for (const c of clients) {
    if (!c.roomId) {
      sendJson(c.ws, payload);
    }
  }
}

function broadcastToRoom(roomId: string, msg: ServerMessage): void {
  for (const c of clients) {
    if (c.roomId === roomId) {
      sendJson(c.ws, msg);
    }
  }
}

function createManagedRoom(opts: {
  name: string;
  hostName: string;
  difficulty: DifficultyTier;
  seed?: number;
}): GameRoom {
  const roomId = generateRoomCode();
  const room = new GameRoom({
    roomId,
    name: opts.name.trim() || `${opts.hostName}'s Expedition`,
    hostName: opts.hostName,
    difficulty: opts.difficulty,
    seed: opts.seed,
  });

  room.onFloorClearedCallback = (playerIds, floor) => {
    for (const pid of playerIds) {
      const acc = accountsById.get(pid);
      if (acc) {
        acc.highestFloor = Math.max(acc.highestFloor, floor);
        if (floor >= 3) acc.runsCompleted += 1;
      }
    }
  };
  room.onKillCallback = (pid) => {
    const acc = accountsById.get(pid);
    if (acc) acc.totalKills += 1;
  };
  room.onReviveCallback = (pid) => {
    const acc = accountsById.get(pid);
    if (acc) acc.totalRevives += 1;
  };

  rooms.set(roomId, room);
  return room;
}

function leaveCurrentRoom(client: ConnectedClient): void {
  if (!client.roomId) return;
  const oldRoomId = client.roomId;
  client.roomId = null;
  const room = rooms.get(oldRoomId);
  if (room) {
    const stillConnected = Array.from(clients).some(
      (other) => other.userId === client.userId && other.roomId === oldRoomId
    );
    if (!stillConnected) {
      room.removePlayer(client.userId);
      if (room.getPlayerCount() === 0) {
        rooms.delete(oldRoomId);
      }
    }
  }
  broadcastRoomList();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.post('/api/auth/login', (req, res) => {
    const usernameRaw = String(req.body?.username ?? '').trim();
    const passwordRaw = String(req.body?.password ?? '');

    if (usernameRaw.length < 2 || usernameRaw.length > 20) {
      res.status(400).json({ error: 'Username must be 2 to 20 characters.' });
      return;
    }
    if (passwordRaw.length < 3) {
      res.status(400).json({ error: 'Password must be at least 3 characters.' });
      return;
    }

    let acc = accountsByLower.get(usernameRaw.toLowerCase());
    if (!acc) {
      acc = createAccount(usernameRaw, passwordRaw, 'vanguard');
    } else if (acc.passwordHash !== hashPassword(passwordRaw)) {
      res.status(401).json({ error: 'Invalid password for this adventurer.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessionsByToken.set(token, acc.id);
    res.json({ token, user: toPublicProfile(acc) });
  });

  app.post('/api/auth/register', (req, res) => {
    const usernameRaw = String(req.body?.username ?? '').trim();
    const passwordRaw = String(req.body?.password ?? '');
    const preferredClass = (req.body?.preferredClass as HeroClassId) || 'vanguard';

    if (!/^[a-zA-Z0-9_-]{2,20}$/.test(usernameRaw)) {
      res.status(400).json({
        error: 'Username must be 2–20 letters, numbers, underscores, or hyphens.',
      });
      return;
    }
    if (passwordRaw.length < 3) {
      res.status(400).json({ error: 'Password must be at least 3 characters.' });
      return;
    }
    if (accountsByLower.has(usernameRaw.toLowerCase())) {
      res.status(409).json({ error: 'That adventurer name is already claimed.' });
      return;
    }

    const acc = createAccount(usernameRaw, passwordRaw, preferredClass);
    const token = crypto.randomBytes(24).toString('hex');
    sessionsByToken.set(token, acc.id);
    res.status(201).json({ token, user: toPublicProfile(acc) });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const usernameRaw = String(req.body?.username ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');

    if (!usernameRaw || newPassword.length < 3) {
      res
        .status(400)
        .json({ error: 'Enter your username and a new password (min 3 chars).' });
      return;
    }
    const acc = accountsByLower.get(usernameRaw.toLowerCase());
    if (!acc) {
      res.status(404).json({ error: 'No adventurer found with that username.' });
      return;
    }
    acc.passwordHash = hashPassword(newPassword);
    res.json({ message: 'Password updated. You may now log in.' });
  });

  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const userId = sessionsByToken.get(token);
    if (!userId) {
      res.status(401).json({ error: 'Session expired.' });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }
    res.json({ user: toPublicProfile(acc) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) sessionsByToken.delete(token);
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/ws', 'http://localhost:3000');
    const token = reqUrl.searchParams.get('token') || '';
    const userId = sessionsByToken.get(token);
    const acc = userId ? accountsById.get(userId) : undefined;

    if (!acc) {
      sendJson(ws, { type: 'error', message: 'Authentication required.' });
      ws.close();
      return;
    }

    const client: ConnectedClient = {
      ws,
      userId: acc.id,
      username: acc.username,
      roomId: null,
    };
    clients.add(client);
    broadcastRoomList();

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendJson(ws, { type: 'pong', t: msg.t });
        return;
      }

      if (msg.type === 'lobby:subscribe') {
        sendJson(ws, {
          type: 'lobby:rooms',
          rooms: Array.from(rooms.values()).map((r) => r.getSummary()),
          onlineCount: clients.size,
        });
        return;
      }

      if (msg.type === 'room:create') {
        leaveCurrentRoom(client);
        // Player is strictly locked to their account's hero class
        const heroClass: HeroClassId = acc.lockedClass || acc.preferredClass || 'vanguard';
        const difficulty: DifficultyTier =
          msg.difficulty === 'Heroic' || msg.difficulty === 'Abyssal'
            ? msg.difficulty
            : 'Normal';
        const room = createManagedRoom({
          name: msg.name,
          hostName: acc.username,
          difficulty,
          seed: msg.seed,
        });
        room.addOrReconnectPlayer(acc.id, acc.username, heroClass);
        client.roomId = room.roomId;

        sendJson(ws, {
          type: 'room:joined',
          roomId: room.roomId,
          playerId: acc.id,
          map: room.map,
          snapshot: room.buildSnapshot(),
          chat: room.chat,
        });
        broadcastRoomList();
        return;
      }

      if (msg.type === 'room:join') {
        const normalizedCode = msg.roomId.trim().toUpperCase();
        const room = rooms.get(normalizedCode);
        if (!room) {
          sendJson(ws, {
            type: 'error',
            message: `Room "${normalizedCode}" was not found or has closed.`,
          });
          return;
        }
        if (!room.hasPlayer(acc.id) && room.getPlayerCount() >= room.maxPlayers) {
          sendJson(ws, {
            type: 'error',
            message: 'That expedition party is already full (4/4).',
          });
          return;
        }

        leaveCurrentRoom(client);
        // Player is strictly locked to their account's hero class
        const heroClass: HeroClassId = acc.lockedClass || acc.preferredClass || 'vanguard';
        room.addOrReconnectPlayer(acc.id, acc.username, heroClass);
        client.roomId = room.roomId;

        sendJson(ws, {
          type: 'room:joined',
          roomId: room.roomId,
          playerId: acc.id,
          map: room.map,
          snapshot: room.buildSnapshot(),
          chat: room.chat,
        });
        broadcastRoomList();
        return;
      }

      if (msg.type === 'room:leave') {
        leaveCurrentRoom(client);
        sendJson(ws, { type: 'room:left' });
        return;
      }

      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) return;

      if (msg.type === 'player:input') {
        room.updateInput(acc.id, msg.input);
      } else if (msg.type === 'player:action') {
        const res = room.performAction(acc.id, msg.action, msg.aimAngle);
        if (res.floorChanged) {
          broadcastToRoom(room.roomId, {
            type: 'room:map',
            map: res.floorChanged,
          });
          broadcastRoomList();
        }
      } else if (msg.type === 'player:select_relic') {
        room.selectRelic(acc.id, msg.relicId);
      } else if (msg.type === 'player:change_class') {
        // Classes are permanently locked per account
        sendJson(ws, {
          type: 'error',
          message: `${acc.username}'s account is permanently bound to the ${acc.lockedClass.toUpperCase()} class.`,
        });
      } else if (msg.type === 'player:ping') {
        room.addPing(acc.id, msg.label, msg.x, msg.y);
      } else if (msg.type === 'chat:send') {
        const trimmed = String(msg.text ?? '').trim();
        if (trimmed.length > 0) {
          const chatMsg = room.pushChat(acc.username, trimmed, false);
          broadcastToRoom(room.roomId, {
            type: 'chat:message',
            message: chatMsg,
          });
        }
      } else if (msg.type === 'room:restart') {
        const freshMap = room.restartRun();
        broadcastToRoom(room.roomId, { type: 'room:map', map: freshMap });
        broadcastRoomList();
      }
    });

    ws.on('close', () => {
      clients.delete(client);
      leaveCurrentRoom(client);
      broadcastRoomList();
    });
  });

  const TICK_MS = 50;
  setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.getPlayerCount() === 0) {
        rooms.delete(roomId);
        continue;
      }
      const prevStatus = room.status;
      room.tick(TICK_MS);
      const snapshot = room.buildSnapshot();
      broadcastToRoom(roomId, { type: 'room:tick', snapshot });
      if (room.status !== prevStatus) {
        broadcastRoomList();
      }
    }
  }, TICK_MS);

  const distPath = path.resolve(__dirname, 'dist');
  const isProd =
    process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distPath, 'index.html'));

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Beyond Co-op Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
