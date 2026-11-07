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
  AccountRecord,
  ClientMessage,
  DifficultyTier,
  HeroClassId,
  ServerMessage,
  UserProfile,
} from './src/shared/types.ts';
import { MAX_ATTRIBUTE, MAX_LEVEL } from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const accountsByLower = new Map<string, AccountRecord>();
const accountsById = new Map<string, AccountRecord>();
const sessionsByToken = new Map<string, { userId: string; expiresAt: number }>();

function clearExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of sessionsByToken.entries()) {
    if (session.expiresAt < now) {
      sessionsByToken.delete(token);
    }
  }
}
setInterval(clearExpiredSessions, 1000 * 60 * 60); // Clean up every hour

const DATA_DIR = path.resolve(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const MIGRATIONS_FILE = path.join(DATA_DIR, 'migrations.json');

const { Pool } = pg;
let dbPool: pg.Pool | null = null;
if (process.env.DATABASE_URL) {
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });
}

function hashPassword(pw: string, salt?: string): string {
  if (!salt) {
    // New scrypt hash: "scrypt:salt:hash"
    const newSalt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pw, newSalt, 64).toString('hex');
    return `scrypt:${newSalt}:${hash}`;
  }
  // Verify scrypt
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return hash;
}

function verifyPassword(pw: string, storedHash: string): boolean {
  if (storedHash.startsWith('scrypt:')) {
    const [, salt, hash] = storedHash.split(':');
    return hashPassword(pw, salt) === hash;
  }
  // Legacy SHA-256 fallback
  const legacyHash = crypto.createHash('sha256').update(`beyond_salt_${pw}`).digest('hex');
  return legacyHash === storedHash;
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
    isAdmin: !!acc.isAdmin,
    level: acc.level || 1,
    xp: acc.xp || 0,
    strength: acc.strength || 0,
    vitality: acc.vitality || 0,
    dexterity: acc.dexterity || 0,
    intelligence: acc.intelligence || 0,
    faith: acc.faith || 0,
    attributePoints: acc.attributePoints || 0,
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

// Lock map to prevent concurrent writes to the same account
const accountLocks = new Map<string, Promise<void>>();

async function persistAccount(acc: AccountRecord): Promise<void> {
  const lockKey = acc.id;
  
  // Wait for any existing write for this account to finish
  const existingLock = accountLocks.get(lockKey) || Promise.resolve();
  
  const newLock = (async () => {
    try {
      await existingLock;
    } catch {
      // Ignore previous lock failures so subsequent writes still run in order
    }

    // Persist to PostgreSQL if available FIRST
    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO accounts (
            id, username, username_lower, password_hash, locked_class, preferred_class,
            runs_completed, highest_floor, total_kills, total_revives, gold, is_admin,
            level, xp,
            strength, vitality, dexterity, intelligence, faith, attribute_points, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
          ON CONFLICT (username_lower) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            locked_class = EXCLUDED.locked_class,
            preferred_class = EXCLUDED.preferred_class,
            runs_completed = EXCLUDED.runs_completed,
            highest_floor = EXCLUDED.highest_floor,
            total_kills = EXCLUDED.total_kills,
            total_revives = EXCLUDED.total_revives,
            gold = EXCLUDED.gold,
            is_admin = EXCLUDED.is_admin,
            level = EXCLUDED.level,
            xp = EXCLUDED.xp,
            strength = EXCLUDED.strength,
            vitality = EXCLUDED.vitality,
            dexterity = EXCLUDED.dexterity,
            intelligence = EXCLUDED.intelligence,
            faith = EXCLUDED.faith,
            attribute_points = EXCLUDED.attribute_points,
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
            !!acc.isAdmin,
            acc.level || 1,
            acc.xp || 0,
            acc.strength || 0,
            acc.vitality || 0,
            acc.dexterity || 0,
            acc.intelligence || 0,
            acc.faith || 0,
            acc.attributePoints || 0,
          ]
        );
      } catch (err) {
        console.error(`Postgres persist error for ${acc.username}:`, err);
        throw err; // Propagate error without updating backup file or in-memory maps
      }
    }

    // Only commit to in-memory maps and disk backup if DB write succeeded (or in file storage mode)
    accountsByLower.set(acc.usernameLower, acc);
    accountsById.set(acc.id, acc);
    saveAccountsToFile();
  })();

  accountLocks.set(lockKey, newLock);
  
  // Clean up lock map when done, ensuring cleanup does not trigger unhandled promise rejections
  newLock.then(
    () => {
      if (accountLocks.get(lockKey) === newLock) {
        accountLocks.delete(lockKey);
      }
    },
    () => {
      if (accountLocks.get(lockKey) === newLock) {
        accountLocks.delete(lockKey);
      }
    }
  );

  return newLock;
}

async function initStorage(): Promise<void> {
  if (dbPool) {
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(32) NOT NULL,
          username_lower VARCHAR(32) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          locked_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          preferred_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          runs_completed INT NOT NULL DEFAULT 0,
          highest_floor INT NOT NULL DEFAULT 0,
          total_kills INT NOT NULL DEFAULT 0,
          total_revives INT NOT NULL DEFAULT 0,
          gold INT NOT NULL DEFAULT 0,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          level INT NOT NULL DEFAULT 1,
          xp INT NOT NULL DEFAULT 0,
          strength INT NOT NULL DEFAULT 0,
          vitality INT NOT NULL DEFAULT 0,
          dexterity INT NOT NULL DEFAULT 0,
          intelligence INT NOT NULL DEFAULT 0,
          faith INT NOT NULL DEFAULT 0,
          attribute_points INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      // Safe migration for existing tables missing attribute columns
      await dbPool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='is_admin') THEN
            ALTER TABLE accounts ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='strength') THEN
            ALTER TABLE accounts ADD COLUMN strength INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='intelligence') THEN
            ALTER TABLE accounts ADD COLUMN intelligence INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='faith') THEN
            ALTER TABLE accounts ADD COLUMN faith INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='dexterity') THEN
            ALTER TABLE accounts ADD COLUMN dexterity INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='vitality') THEN
            ALTER TABLE accounts ADD COLUMN vitality INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='attribute_points') THEN
            ALTER TABLE accounts ADD COLUMN attribute_points INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='level') THEN
            ALTER TABLE accounts ADD COLUMN level INT NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='xp') THEN
            ALTER TABLE accounts ADD COLUMN xp INT NOT NULL DEFAULT 0;
          END IF;
          -- Increase password_hash length for scrypt
          ALTER TABLE accounts ALTER COLUMN password_hash TYPE VARCHAR(255);
        END $$;
      `);
      console.log('Connected to PostgreSQL and verified schema.');

      // Track and apply one-time schema migrations
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      const migrationRes = await dbPool.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        ['20261106_reset_attributes']
      );

      if (migrationRes.rowCount === 0) {
        console.log('[Migration] Running one-time global attribute reset in PostgreSQL...');
        await dbPool.query(`
          UPDATE accounts 
          SET strength = 0, vitality = 0, dexterity = 0, intelligence = 0, faith = 0, 
              attribute_points = (GREATEST(1, level) - 1) * 2;
        `);
        await dbPool.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          ['20261106_reset_attributes']
        );
        console.log('[Migration] Attribute reset migration completed successfully in PostgreSQL.');
      } else {
        console.log('[Migration] Attribute reset migration already applied. Preserving account attributes.');
      }

      const res = await dbPool.query('SELECT * FROM accounts');
      for (const row of res.rows) {
        const lvl = Number(row.level) || 1;
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
          isAdmin: !!row.is_admin,
          level: lvl,
          xp: Number(row.xp) || 0,
          strength: Number(row.strength) || 0,
          vitality: Number(row.vitality) || 0,
          dexterity: Number(row.dexterity) || 0,
          intelligence: Number(row.intelligence) || 0,
          faith: Number(row.faith) || 0,
          attributePoints: Number(row.attribute_points) || 0,
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
      const isProduction = process.env.NODE_ENV === 'production';
      const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const list = JSON.parse(data) as AccountRecord[];

      let appliedMigrations: string[] = [];
      if (fs.existsSync(MIGRATIONS_FILE)) {
        try {
          appliedMigrations = JSON.parse(fs.readFileSync(MIGRATIONS_FILE, 'utf8'));
        } catch {
          appliedMigrations = [];
        }
      }

      const needsReset = !appliedMigrations.includes('20261106_reset_attributes');
      if (needsReset) {
        console.log('[JSON Storage] Applying one-time attribute reset migration...');
      }

      for (const rec of list) {
        // STRICT: Never load 'wanderer' in production
        if (isProduction && rec.usernameLower === 'wanderer') continue;
        
        rec.level = Number(rec.level) || 1;
        rec.xp = Number(rec.xp) || 0;

        if (needsReset) {
          rec.strength = 0;
          rec.vitality = 0;
          rec.dexterity = 0;
          rec.intelligence = 0;
          rec.faith = 0;
          rec.attributePoints = (Math.max(1, rec.level) - 1) * 2;
        } else {
          rec.strength = Number(rec.strength) || 0;
          rec.vitality = Number(rec.vitality) || 0;
          rec.dexterity = Number(rec.dexterity) || 0;
          rec.intelligence = Number(rec.intelligence) || 0;
          rec.faith = Number(rec.faith) || 0;
          rec.attributePoints = Number(rec.attributePoints) || 0;
        }

        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }

      if (needsReset) {
        appliedMigrations.push('20261106_reset_attributes');
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(MIGRATIONS_FILE, JSON.stringify(appliedMigrations, null, 2), 'utf8');
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(accountsById.values()), null, 2), 'utf8');
        console.log('[JSON Storage] One-time attribute reset applied and recorded.');
      }
      console.log(`Loaded ${accountsById.size} accounts from ${ACCOUNTS_FILE}`);
    } catch (err) {
      console.error('Failed to load accounts from file:', err);
    }
  }

  // Seed default wanderer account locked as vanguard if no accounts exist (STRICT DEV ONLY)
  const isProduction = process.env.NODE_ENV === 'production';
  if (!isProduction && !accountsByLower.has('wanderer')) {
    createAccount('wanderer', 'beyond', 'vanguard');
  }

  // Seed / guarantee exclusive admin account (Aleph)
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const adminUsername = 'Aleph';
  const adminLower = adminUsername.toLowerCase();
  
  if (!accountsByLower.has(adminLower)) {
    if (bootstrapPassword) {
      if (bootstrapPassword.length >= 16) {
        console.log(`Bootstrapping fresh admin account "${adminUsername}"...`);
        createAccount(adminUsername, bootstrapPassword, 'vanguard', true);
      } else {
        console.warn(`[Admin Bootstrap] ADMIN_BOOTSTRAP_PASSWORD provided but does not meet minimum length requirement of 16 characters (length: ${bootstrapPassword.length}).`);
      }
    }
  } else {
    const existing = accountsByLower.get(adminLower)!;
    if (!existing.isAdmin) {
      console.log(`Granting administrator privileges to account "${adminUsername}"...`);
      existing.isAdmin = true;
      persistAccount(existing);
    }
  }
}

function createAccount(
  username: string,
  password: string,
  chosenClass: HeroClassId = 'vanguard',
  isAdmin = false
): AccountRecord {
  const validClass: HeroClassId =
    chosenClass === 'ranger' || chosenClass === 'arcanist' || chosenClass === 'cleric'
      ? chosenClass
      : 'vanguard';
  const id = `usr_${crypto.randomBytes(6).toString('hex')}`;
  const lowerName = username.toLowerCase();
  const isUserAdmin = isAdmin;
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
    isAdmin: isUserAdmin,
    strength: 0,
    vitality: 0,
    dexterity: 0,
    intelligence: 0,
    faith: 0,
    attributePoints: 0,
    level: 1,
    xp: 0,
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
    if (!c.roomId || c.roomId === 'TAVERN-HUB') {
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

  room.onFloorClearedCallback = async (playerIds, floor) => {
    for (const pid of playerIds) {
      const acc = accountsById.get(pid);
      if (acc) {
        acc.highestFloor = Math.max(acc.highestFloor, floor);
        if (floor >= 3) acc.runsCompleted += 1;
        await persistAccount(acc).catch(err => console.error('Failed to persist floor clear:', err));
      }
    }
  };
  room.onKillCallback = async (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalKills += 1;
      await persistAccount(acc).catch(err => console.error('Failed to persist kill:', err));
    }
  };
  room.onReviveCallback = async (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalRevives += 1;
      await persistAccount(acc).catch(err => console.error('Failed to persist revive:', err));
    }
  };
  room.onProgressionUpdateCallback = async (pid, state) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.level = state.level;
      acc.xp = state.xp;
      acc.strength = state.strength;
      acc.vitality = state.vitality;
      acc.dexterity = state.dexterity;
      acc.intelligence = state.intelligence;
      acc.faith = state.faith;
      acc.attributePoints = state.attributePoints;
      await persistAccount(acc).catch(err => {
        console.error('CRITICAL: Failed to persist progression update:', err);
        // We can't easily undo the runtime change here, but we've logged it.
      });
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
      if (room.getPlayerCount() === 0 && oldRoomId !== 'TAVERN-HUB') {
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

  // --- STRICT CORS CONFIGURATION ---
  const isProduction = process.env.NODE_ENV === 'production';
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  
  // Strict parser: rejects malformed, wildcards, and paths
  const allowedOrigins = rawOrigins.split(',')
    .map(o => o.trim())
    .filter(o => {
      if (!o) return false;
      try {
        if (o.includes('*')) return false; // Reject wildcards
        const url = new URL(o);
        // Ensure no path, query, or fragment, and protocol is valid
        return url.origin === o && (url.protocol === 'http:' || url.protocol === 'https:');
      } catch {
        return false; // Malformed
      }
    });

  if (rawOrigins && allowedOrigins.length === 0) {
    console.error('CRITICAL: ALLOWED_ORIGINS is configured but all entries were rejected as malformed.');
  }

  function isOriginAllowed(origin: string | undefined, hostHeader: string | undefined): boolean {
    if (!origin) return true; // Same-origin, curl, server-to-server

    if (allowedOrigins.length > 0) {
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return true;
      }
    }

    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();

      // Same-origin request (the website calling its own backend server)
      if (hostHeader) {
        const cleanHost = hostHeader.split(':')[0].toLowerCase();
        if (hostname === cleanHost) return true;
      }

      // Localhost & loopback
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true;
      }

      // Deployed platforms (Render, Google Cloud Run / AI Studio preview, Vercel)
      if (
        hostname.endsWith('.onrender.com') ||
        hostname.endsWith('.run.app') ||
        hostname.endsWith('.vercel.app')
      ) {
        return true;
      }
    } catch {
      return false;
    }

    return !isProduction;
  }

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isAllowed = isOriginAllowed(origin, req.headers.host);

    if (isAllowed && origin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Vary', 'Origin');
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    if (origin && !isAllowed) {
      console.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
      res.status(403).json({ error: 'CORS policy: Origin not allowed.' });
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
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const acc = accountsByLower.get(usernameRaw.toLowerCase());
    if (!acc) {
      if (isMaintenance) {
        res.status(503).json({
          error: `Server is migrating to Singapore for lower latency. Please connect to: ${redirectTarget}`,
          redirectUrl: redirectTarget,
        });
        return;
      }
      res.status(401).json({ error: 'No adventurer account found with that name.' });
      return;
    }
    if (!verifyPassword(passwordRaw, acc.passwordHash)) {
      res.status(401).json({ error: 'Invalid password for this adventurer.' });
      return;
    }

    // Automatic rehash if using legacy SHA-256
    if (!acc.passwordHash.startsWith('scrypt:')) {
      acc.passwordHash = hashPassword(passwordRaw);
      persistAccount(acc);
    }

    // Ensure Aleph always has administrator privileges
    if (acc.usernameLower === 'aleph' && !acc.isAdmin) {
      acc.isAdmin = true;
      persistAccount(acc);
    }

    const token = crypto.randomBytes(24).toString('hex');
    sessionsByToken.set(token, {
      userId: acc.id,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24 hours
    });
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
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    if (accountsByLower.has(usernameRaw.toLowerCase())) {
      res.status(409).json({ error: 'That adventurer name is already claimed.' });
      return;
    }

    // Auto-grant admin if registering Aleph
    const isAdmin = usernameRaw.toLowerCase() === 'aleph';
    const acc = createAccount(usernameRaw, passwordRaw, preferredClass, isAdmin);
    const token = crypto.randomBytes(24).toString('hex');
    sessionsByToken.set(token, {
      userId: acc.id,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24 hours
    });
    res.status(201).json({ token, user: toPublicProfile(acc) });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required to change password.' });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }

    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters.' });
      return;
    }

    if (!verifyPassword(currentPassword, acc.passwordHash)) {
      res.status(401).json({ error: 'Incorrect current password.' });
      return;
    }

    acc.passwordHash = hashPassword(newPassword);
    await persistAccount(acc);

    // Invalidate all other sessions for this user while keeping the current session alive
    for (const [t, sess] of sessionsByToken.entries()) {
      if (sess.userId === userId && t !== token) {
        sessionsByToken.delete(t);
      }
    }
    // Refresh current session expiry
    sessionsByToken.set(token, {
      userId,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24, // 24 hours
    });

    res.json({ message: 'Password updated successfully.', token });
  });

  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
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
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      res.status(500).json({ error: 'Migration secret not configured or too weak.' });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(403).json({ error: 'Forbidden: Missing Bearer token.' });
      return;
    }

    const providedToken = Buffer.from(authHeader.slice(7));
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedToken.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedToken, expectedBuffer)) {
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
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      res.status(500).json({ error: 'Migration secret not configured or too weak.' });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(403).json({ error: 'Forbidden: Missing Bearer token.' });
      return;
    }

    const providedToken = Buffer.from(authHeader.slice(7));
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedToken.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedToken, expectedBuffer)) {
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
          isAdmin: !!item.isAdmin,
          dexterity: Number(item.dexterity) || 10,
          vitality: Number(item.vitality) || 10,
          attributePoints: Number(item.attributePoints) || 0,
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
    // --- WebSocket Handshake Origin Validation ---
    const origin = req.headers.origin;
    const originAllowed = isOriginAllowed(origin, req.headers.host);

    if (!originAllowed) {
      console.warn(`WebSocket connection rejected from unauthorized origin: ${origin}`);
      ws.close(4003, 'Forbidden Origin');
      return;
    }

    // Strictly use Sec-WebSocket-Protocol for tokens (safer than URL parameters)
    const token = String(req.headers['sec-websocket-protocol'] || '').split(',')[0].trim();
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    const acc = userId ? accountsById.get(userId) : undefined;

    if (!acc) {
      sendJson(ws, { type: 'error', message: 'Authentication required.' });
      ws.close(4001, 'Unauthorized');
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

    ws.on('message', async (raw) => {
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
        room.addOrReconnectPlayer(acc.id, acc.username, heroClass, acc.isAdmin, {
          level: acc.level || 1,
          xp: acc.xp || 0,
          strength: acc.strength || 0,
          vitality: acc.vitality || 0,
          dexterity: acc.dexterity || 0,
          intelligence: acc.intelligence || 0,
          faith: acc.faith || 0,
          attributePoints: acc.attributePoints || 0,
        });
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
        room.addOrReconnectPlayer(acc.id, acc.username, heroClass, acc.isAdmin, {
          level: acc.level || 1,
          xp: acc.xp || 0,
          strength: acc.strength || 0,
          vitality: acc.vitality || 0,
          dexterity: acc.dexterity || 0,
          intelligence: acc.intelligence || 0,
          faith: acc.faith || 0,
          attributePoints: acc.attributePoints || 0,
        });
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
        if (acc.isAdmin) {
          const validClass: HeroClassId =
            msg.heroClass === 'ranger' ||
            msg.heroClass === 'arcanist' ||
            msg.heroClass === 'cleric' ||
            msg.heroClass === 'vanguard'
              ? msg.heroClass
              : 'vanguard';
          acc.lockedClass = validClass;
          acc.preferredClass = validClass;
          await persistAccount(acc);
          room.changeClass(acc.id, validClass);
          broadcastToRoom(room.roomId, {
            type: 'chat:message',
            message: room.pushSystemChat(`[ADMIN] ${acc.username} shifted hero class to ${validClass.toUpperCase()}`),
          });
        } else {
          // Classes are permanently locked per account
          sendJson(ws, {
            type: 'error',
            message: `${acc.username}'s account is permanently bound to the ${acc.lockedClass.toUpperCase()} class.`,
          });
        }
      } else if (msg.type === 'admin:godmode') {
        if (acc.isAdmin) {
          const isGod = room.togglePlayerGodMode(acc.id, msg.enabled);
          broadcastToRoom(room.roomId, {
            type: 'chat:message',
            message: room.pushSystemChat(`[ADMIN] God Mode ${isGod ? 'ENABLED' : 'DISABLED'} for ${acc.username}`),
          });
        } else {
          sendJson(ws, { type: 'error', message: 'Admin access required.' });
        }
      } else if (msg.type === 'admin:toggle_speed') {
        if (acc.isAdmin) {
          const isSpeed = room.togglePlayerSpeedBoost(acc.id, msg.enabled);
          broadcastToRoom(room.roomId, {
            type: 'chat:message',
            message: room.pushSystemChat(`[ADMIN] Speed Boost ${isSpeed ? 'ENABLED' : 'DISABLED'} for ${acc.username}`),
          });
        } else {
          sendJson(ws, { type: 'error', message: 'Admin access required.' });
        }
      } else if (msg.type === 'admin:add_gold') {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0 && amount <= 1000000) {
            room.addPlayerGold(acc.id, amount);
          }
        }
      } else if (msg.type === 'admin:add_potions') {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0 && amount <= 99) {
            room.addPlayerPotions(acc.id, amount);
          }
        }
      } else if (msg.type === 'admin:set_level') {
        if (acc.isAdmin) {
          const level = Math.floor(Number(msg.level));
          if (Number.isFinite(level) && level >= 1 && level <= MAX_LEVEL) {
            room.setPlayerLevel(acc.id, level);
            broadcastToRoom(room.roomId, {
              type: 'chat:message',
              message: room.pushSystemChat(`[ADMIN] Set Level ${level} for ${acc.username}`),
            });
          }
        }
      } else if (msg.type === 'admin:add_relic') {
        if (acc.isAdmin && msg.relicId) {
          room.addPlayerRelic(acc.id, String(msg.relicId));
        }
      } else if (msg.type === 'admin:spawn_dummy') {
        if (acc.isAdmin) {
          room.spawnDummyAtPlayer(acc.id);
        }
      } else if (msg.type === 'admin:teleport_floor') {
        if (acc.isAdmin && typeof msg.floor === 'number') {
          room.teleportPlayerToFloor(acc.id, msg.floor);
        }
      } else if (msg.type === 'admin:spawn_entity') {
        if (acc.isAdmin && msg.kind) {
          room.spawnEntitiesForAdmin(acc.id, msg.kind, msg.count || 1);
        }
      } else if (msg.type === 'admin:despawn_entity') {
        if (acc.isAdmin && msg.entityId) {
          room.despawnEntity(String(msg.entityId));
        }
      } else if (msg.type === 'admin:clear_enemies') {
        if (acc.isAdmin) {
          room.clearAllEnemies();
        }
      } else if (msg.type === 'admin:clear_summoned') {
        if (acc.isAdmin) {
          room.clearSummonedEntities();
        }
      } else if (msg.type === 'admin:heal_player') {
        if (acc.isAdmin) {
          room.healPlayer(acc.id);
        }
      } else if (msg.type === 'admin:restore_energy') {
        if (acc.isAdmin) {
          room.restoreEnergy(acc.id);
        }
      } else if (msg.type === 'admin:revive_all') {
        if (acc.isAdmin) {
          room.reviveAllPlayers();
        }
      } else if (msg.type === 'admin:summon_boss') {
        if (acc.isAdmin && typeof msg.floor === 'number') {
          room.summonBossForFloor(msg.floor);
        }
      } else if (msg.type === 'admin:reset_boss') {
        if (acc.isAdmin) {
          room.resetBossEncounter();
        }
      } else if (msg.type === 'admin:reset_room') {
        if (acc.isAdmin) {
          room.resetCurrentRoom();
        }
      } else if (msg.type === 'admin:toggle_ai') {
        if (acc.isAdmin) {
          room.toggleEnemyAI(msg.enabled);
        }
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
      } else if (msg.type === 'player:spend_attribute') {
        if (acc.attributePoints && acc.attributePoints > 0) {
          const attr = msg.attribute;
          if (attr === 'strength' || attr === 'dexterity' || attr === 'vitality' || attr === 'intelligence' || attr === 'faith') {
            if ((acc[attr] || 0) < MAX_ATTRIBUTE) {
              const oldAttr = acc[attr] || 0;
              const oldPoints = acc.attributePoints;
              
              acc[attr] = oldAttr + 1;
              acc.attributePoints = oldPoints - 1;
              
              try {
                await persistAccount(acc);
                room.pushSystemChat(`${acc.username} increased ${attr.toUpperCase()} to ${acc[attr]}.`);
                
                // Force immediate update in game engine runtime state
                room.updatePlayerAttributes(
                  acc.id,
                  acc.strength || 0,
                  acc.vitality || 0,
                  acc.dexterity || 0,
                  acc.intelligence || 0,
                  acc.faith || 0,
                  acc.attributePoints || 0
                );
              } catch (err) {
                // Rollback on failure
                acc[attr] = oldAttr;
                acc.attributePoints = oldPoints;
                sendJson(ws, { type: 'error', message: 'Failed to save attribute allocation. Please try again.' });
              }
            } else {
              sendJson(ws, { type: 'error', message: `${attr.toUpperCase()} is already at maximum level.` });
            }
          }
        }
      } else if (msg.type === 'admin:add_attribute_points') {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0) {
            acc.attributePoints = (acc.attributePoints || 0) + amount;
            await persistAccount(acc).catch(err => console.error('Failed to persist admin attribute points:', err));
            room.addPlayerAttributePoints(acc.id, amount);
          }
        }
      } else if (msg.type === 'player:reset_attributes') {
        // Validate that the player is in the Tavern Hub
        if (room.roomId !== 'TAVERN-HUB') {
          sendJson(ws, { type: 'error', message: 'Attributes can only be reset in the Sanctuary Tavern.' });
          return;
        }

        // Verify that the player is within interaction range of Aleph
        if (!room.isPlayerNearNpc(acc.id, 'npc_aleph', 85)) {
          sendJson(ws, { type: 'error', message: 'You must be speaking with Aleph to reset your attributes.' });
          return;
        }

        // Correctly return spent points to the unspent pool instead of overwriting with level base
        const spent = 
          (acc.strength || 0) + 
          (acc.vitality || 0) + 
          (acc.dexterity || 0) + 
          (acc.intelligence || 0) + 
          (acc.faith || 0);
        
        const oldState = {
          strength: acc.strength,
          vitality: acc.vitality,
          dexterity: acc.dexterity,
          intelligence: acc.intelligence,
          faith: acc.faith,
          attributePoints: acc.attributePoints
        };

        acc.attributePoints = (acc.attributePoints || 0) + spent;
        acc.strength = 0;
        acc.vitality = 0;
        acc.dexterity = 0;
        acc.intelligence = 0;
        acc.faith = 0;
        
        try {
          await persistAccount(acc);
          
          // Sync with room state
          room.updatePlayerAttributes(
            acc.id,
            acc.strength,
            acc.vitality,
            acc.dexterity,
            acc.intelligence,
            acc.faith,
            acc.attributePoints
          );
          
          room.pushSystemChat(`${acc.username} has reclaimed ${spent} attribute points through Aleph.`);
        } catch (err) {
          // Rollback
          Object.assign(acc, oldState);
          sendJson(ws, { type: 'error', message: 'Failed to reset attributes. Please try again.' });
        }
        
        // Close dialogue if it was active
        const aleph = room.npcs.find(n => n.id === 'npc_aleph');
        if (aleph) {
          aleph.speakingMs = 0;
        }
      } else if (msg.type === 'player:dialogue_close') {
        const speakingNpc = room.npcs.find(n => (n.speakingMs ?? 0) > 0);
        if (speakingNpc) {
          speakingNpc.speakingMs = 0;
        }
      } else if (msg.type === 'player:dialogue_pick') {
        const speakingNpc = room.npcs.find(n => (n.speakingMs ?? 0) > 0);
        if (speakingNpc) {
          if (speakingNpc.id === 'npc_aleph') {
            if (msg.optionId === 'lore') {
              speakingNpc.dialogue = 'I am who I am.';
              speakingNpc.speakingMs = 9999999; 
              speakingNpc.options = [
                { id: 'back', label: 'I see. (Back)' }
              ];
            } else if (msg.optionId === 'back') {
              speakingNpc.dialogue = 'The paths you walk are many, but your soul remains constant.';
              speakingNpc.options = [
                { id: 'reset_stats', label: 'I wish to reset my attributes.' },
                { id: 'lore', label: 'Who are you?' }
              ];
            } else if (msg.optionId === 'reset_stats') {
              // Frontend sends reset_attributes for this, but handle here just in case or for consistency
            }
          }
        }
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
        if (roomId !== 'TAVERN-HUB') {
          rooms.delete(roomId);
        }
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

  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Beyond Co-op Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
