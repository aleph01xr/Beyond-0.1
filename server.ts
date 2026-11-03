import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
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
  gold?: number;
}

const accountsByLower = new Map<string, AccountRecord>();
const accountsById = new Map<string, AccountRecord>();
const sessionsByToken = new Map<string, string>();

const DATA_DIR = path.resolve(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

const { Pool } = pg;
let dbPool: pg.Pool | null = null;
if (process.env.DATABASE_URL) {
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
}

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

function saveAccountsToFile(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(accountsById.values());
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save accounts to file:', err);
  }
}

async function persistAccount(acc: AccountRecord): Promise<void> {
  // Always update in-memory maps for 60fps real-time access
  accountsByLower.set(acc.usernameLower, acc);
  accountsById.set(acc.id, acc);

  // Auto-backup to disk file
  saveAccountsToFile();

  // If PostgreSQL is configured, persist to database with ON CONFLICT upsert
  if (dbPool) {
    try {
      await dbPool.query(
        `INSERT INTO accounts (
          id, username, username_lower, password_hash, locked_class, preferred_class,
          runs_completed, highest_floor, total_kills, total_revives, gold, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
        ON CONFLICT (username_lower) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          locked_class = EXCLUDED.locked_class,
          preferred_class = EXCLUDED.preferred_class,
          runs_completed = EXCLUDED.runs_completed,
          highest_floor = EXCLUDED.highest_floor,
          total_kills = EXCLUDED.total_kills,
          total_revives = EXCLUDED.total_revives,
          gold = EXCLUDED.gold,
          updated_at = NOW();`,
        [
          acc.id,
          acc.username,
          acc.usernameLower,
          acc.passwordHash,
          acc.lockedClass,
          acc.preferredClass,
          acc.runsCompleted,
          acc.highestFloor,
          acc.totalKills,
          acc.totalRevives,
          acc.gold ?? 0,
        ]
      );
    } catch (err) {
      console.error(`Postgres persist error for ${acc.username}:`, err);
    }
  }
}

async function initStorage(): Promise<void> {
  if (dbPool) {
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(32) NOT NULL,
          username_lower VARCHAR(32) UNIQUE NOT NULL,
          password_hash VARCHAR(128) NOT NULL,
          locked_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          preferred_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          runs_completed INT NOT NULL DEFAULT 0,
          highest_floor INT NOT NULL DEFAULT 0,
          total_kills INT NOT NULL DEFAULT 0,
          total_revives INT NOT NULL DEFAULT 0,
          gold INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      console.log('Connected to PostgreSQL and verified schema.');

      const res = await dbPool.query('SELECT * FROM accounts');
      for (const row of res.rows) {
        const rec: AccountRecord = {
          id: row.id,
          username: row.username,
          usernameLower: row.username_lower,
          passwordHash: row.password_hash,
          lockedClass: row.locked_class as HeroClassId,
          preferredClass: row.preferred_class as HeroClassId,
          runsCompleted: Number(row.runs_completed) || 0,
          highestFloor: Number(row.highest_floor) || 0,
          totalKills: Number(row.total_kills) || 0,
          totalRevives: Number(row.total_revives) || 0,
          gold: Number(row.gold) || 0,
        };
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }
      console.log(`Loaded ${res.rows.length} accounts from PostgreSQL.`);
    } catch (err) {
      console.error('PostgreSQL init error, falling back to local storage:', err);
    }
  }

  // Load from local file if empty
  if (accountsById.size === 0 && fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const list = JSON.parse(data) as AccountRecord[];
      for (const rec of list) {
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }
      console.log(`Loaded ${list.length} accounts from ${ACCOUNTS_FILE}`);
    } catch (err) {
      console.error('Failed to load accounts from file:', err);
    }
  }

  // Seed default wanderer account locked as vanguard if no accounts exist
  if (!accountsByLower.has('wanderer')) {
    createAccount('wanderer', 'beyond', 'vanguard');
  }
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
    gold: 0,
  };
  persistAccount(rec);
  return rec;
}

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
  const summaries = Array.from(rooms.values())
    .filter((r) => r.roomId !== 'TAVERN-HUB')
    .map((r) => r.getSummary());
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
        persistAccount(acc);
      }
    }
  };
  room.onKillCallback = (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalKills += 1;
      persistAccount(acc);
    }
  };
  room.onReviveCallback = (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalRevives += 1;
      persistAccount(acc);
    }
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
  await initStorage();

  const tavernRoom = new GameRoom({
    roomId: 'TAVERN-HUB',
    name: 'Sanctuary Tavern & Social Hub',
    hostName: 'Innkeeper',
    difficulty: 'Normal',
    seed: 777,
  });
  rooms.set('TAVERN-HUB', tavernRoom);

  const app = express();
  app.use(express.json());

  // CORS middleware for cross-origin requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const isMaintenance = process.env.MAINTENANCE_MODE === 'true';
  const redirectTarget = process.env.REDIRECT_URL || 'https://beyond-game-sg.onrender.com';

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
      if (isMaintenance) {
        res.status(503).json({
          error: `Server is migrating to Singapore for lower latency. Please connect to: ${redirectTarget}`,
          redirectUrl: redirectTarget,
        });
        return;
      }
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
    if (isMaintenance) {
      res.status(503).json({
        error: `Server is migrating to Singapore for lower latency. Please register at: ${redirectTarget}`,
        redirectUrl: redirectTarget,
      });
      return;
    }

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
    persistAccount(acc);
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

  // Protected Admin Migration: Export Accounts
  app.get('/api/admin/export-accounts', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET || 'beyond_migrate_secret_key_2026';
    if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedSecret) {
      res.status(403).json({ error: 'Forbidden: Invalid or missing migration admin secret.' });
      return;
    }

    const list = Array.from(accountsById.values());
    res.json({
      exportTimestamp: Date.now(),
      count: list.length,
      accounts: list,
    });
  });

  // Protected Admin Migration: Import Accounts
  app.post('/api/admin/import-accounts', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET || 'beyond_migrate_secret_key_2026';
    if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedSecret) {
      res.status(403).json({ error: 'Forbidden: Invalid or missing migration admin secret.' });
      return;
    }

    const payload = req.body?.accounts;
    if (!Array.isArray(payload)) {
      res.status(400).json({ error: 'Invalid payload: "accounts" array required.' });
      return;
    }

    let importedCount = 0;
    for (const item of payload) {
      if (item && item.username && item.passwordHash) {
        const rec: AccountRecord = {
          id: String(item.id || `usr_${crypto.randomBytes(6).toString('hex')}`),
          username: String(item.username),
          usernameLower: String(item.usernameLower || item.username).toLowerCase(),
          passwordHash: String(item.passwordHash),
          lockedClass: (item.lockedClass as HeroClassId) || 'vanguard',
          preferredClass: (item.preferredClass || item.lockedClass || 'vanguard') as HeroClassId,
          runsCompleted: Number(item.runsCompleted) || 0,
          highestFloor: Number(item.highestFloor) || 0,
          totalKills: Number(item.totalKills) || 0,
          totalRevives: Number(item.totalRevives) || 0,
          gold: Number(item.gold) || 0,
        };
        await persistAccount(rec);
        importedCount++;
      }
    }

    res.json({
      success: true,
      importedCount,
      message: `Successfully migrated ${importedCount} accounts into storage.`,
    });
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
        if (isMaintenance) {
          sendJson(ws, {
            type: 'error',
            message: `Expeditions are paused on Oregon during Singapore migration. Please connect to: ${redirectTarget}`,
          });
          return;
        }
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
        let room = rooms.get(normalizedCode);
        if (!room && normalizedCode === 'TAVERN-HUB') {
          room = new GameRoom({
            roomId: 'TAVERN-HUB',
            name: 'Sanctuary Tavern & Social Hub',
            hostName: 'Innkeeper',
            difficulty: 'Normal',
            seed: 777,
          });
          rooms.set('TAVERN-HUB', room);
        }
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

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Beyond Co-op Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
