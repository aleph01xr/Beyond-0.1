import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import express from 'express';
import pg from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import { GameRoom } from './src/server/gameEngine.ts';
import {
  PartyCoordinator,
  type PartyAccountInput,
} from './src/server/partyCoordinator.ts';
import { AccessToken } from 'livekit-server-sdk';
import {
  broadcastSerialized,
  RoomClientIndex,
  sendJsonMessage,
  sendRawFrame,
  type ManagedWsClient,
  type SendFrameOptions,
} from './src/server/wsTransport.ts';
import {
  cloneSnapshotBaseline,
  computeSnapshotDelta,
} from './src/shared/snapshotDelta.ts';
import { SERVER_TICK_MS } from './src/client/networkStats.ts';
import type {
  AccountRecord,
  ClientMessage,
  DifficultyTier,
  GameSnapshot,
  HeroClassId,
  ServerMessage,
  UserProfile,
} from './src/shared/types.ts';
import { MAX_ATTRIBUTE, MAX_LEVEL } from './src/shared/types.ts';
import {
  buildSharedAssertionPayload,
  DEFAULT_ASSERTION_TTL_SECONDS,
  hashPassword,
  MIN_SHARED_IDENTITY_SECRET_LENGTH,
  normalizeHeroClass,
  signDungeonsIdentityAssertion,
  SlidingWindowRateLimiter,
  verifyPassword,
  verifySharedIdentityRequestSecret,
} from './src/server/sharedIdentity.ts';
import {
  applyAccountArmamentMigration,
  getArmamentDef,
  getDefaultVestmentIdForClass,
  getDefaultWeaponIdForClass,
  parseArmamentIdArray,
} from './src/shared/armaments.ts';

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

function normalizeAccountLevel(acc: AccountRecord): void {
  const rawLevel = Number(acc.level) || 1;
  if (rawLevel >= MAX_LEVEL) {
    acc.level = MAX_LEVEL;
    acc.xp = 0;
  } else {
    acc.level = Math.max(1, Math.floor(rawLevel));
    acc.xp = Math.max(0, Number(acc.xp) || 0);
  }
}

function toPublicProfile(acc: AccountRecord): UserProfile {
  normalizeAccountLevel(acc);
  applyAccountArmamentMigration(acc);
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
    ownedWeapons: [...(acc.ownedWeapons || [])],
    ownedVestments: [...(acc.ownedVestments || [])],
    equippedWeapon: acc.equippedWeapon ?? null,
    equippedVestment: acc.equippedVestment ?? null,
  };
}

let fileSaveInFlight = false;
let fileSaveQueued = false;
let fileDataDirReady = false;

async function flushAccountsToFile(): Promise<void> {
  if (fileSaveInFlight) {
    fileSaveQueued = true;
    return;
  }
  fileSaveInFlight = true;
  try {
    do {
      fileSaveQueued = false;
      if (!fileDataDirReady) {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        fileDataDirReady = true;
      }
      const list = Array.from(accountsById.values());
      await fs.promises.writeFile(ACCOUNTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    } while (fileSaveQueued);
  } catch (err) {
    console.error('Failed to save accounts to file:', err);
  } finally {
    fileSaveInFlight = false;
  }
}

function saveAccountsToFile(): void {
  void flushAccountsToFile();
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
            strength, vitality, dexterity, intelligence, faith, attribute_points,
            owned_weapons, owned_vestments, equipped_weapon, equipped_vestment, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW())
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
            owned_weapons = EXCLUDED.owned_weapons,
            owned_vestments = EXCLUDED.owned_vestments,
            equipped_weapon = EXCLUDED.equipped_weapon,
            equipped_vestment = EXCLUDED.equipped_vestment,
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
            JSON.stringify(acc.ownedWeapons || []),
            JSON.stringify(acc.ownedVestments || []),
            acc.equippedWeapon ?? null,
            acc.equippedVestment ?? null,
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
          owned_weapons TEXT NOT NULL DEFAULT '[]',
          owned_vestments TEXT NOT NULL DEFAULT '[]',
          equipped_weapon VARCHAR(64),
          equipped_vestment VARCHAR(64),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      // Safe migration for existing tables missing attribute or armament columns
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
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='owned_weapons') THEN
            ALTER TABLE accounts ADD COLUMN owned_weapons TEXT NOT NULL DEFAULT '[]';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='owned_vestments') THEN
            ALTER TABLE accounts ADD COLUMN owned_vestments TEXT NOT NULL DEFAULT '[]';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='equipped_weapon') THEN
            ALTER TABLE accounts ADD COLUMN equipped_weapon VARCHAR(64);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='equipped_vestment') THEN
            ALTER TABLE accounts ADD COLUMN equipped_vestment VARCHAR(64);
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
              attribute_points = (GREATEST(1, level) - 1) * 3;
        `);
        await dbPool.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          ['20261106_reset_attributes']
        );
        console.log('[Migration] Attribute reset migration completed successfully in PostgreSQL.');
      } else {
        console.log('[Migration] Attribute reset migration already applied. Preserving account attributes.');
      }

      const armamentMigrationRes = await dbPool.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        ['20261119_permanent_armaments']
      );
      const needsArmamentMigration = armamentMigrationRes.rowCount === 0;

      const res = await dbPool.query('SELECT * FROM accounts');
      const migratedAccounts: AccountRecord[] = [];
      for (const row of res.rows) {
        const lvl = Number(row.level) || 1;
        const parsedWeapons = parseArmamentIdArray(row.owned_weapons, 'weapon');
        const parsedVestments = parseArmamentIdArray(row.owned_vestments, 'vestment');
        const isLegacyRow =
          needsArmamentMigration &&
          row.equipped_weapon == null &&
          row.equipped_vestment == null &&
          parsedWeapons.length === 0 &&
          parsedVestments.length === 0;

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
          ownedWeapons: parsedWeapons,
          ownedVestments: parsedVestments,
          equippedWeapon: isLegacyRow ? undefined : (row.equipped_weapon ?? null),
          equippedVestment: isLegacyRow ? undefined : (row.equipped_vestment ?? null),
        };
        normalizeAccountLevel(rec);
        const changed = applyAccountArmamentMigration(rec, needsArmamentMigration);
        if (changed) {
          migratedAccounts.push(rec);
        }
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }

      if (needsArmamentMigration || migratedAccounts.length > 0) {
        for (const acc of migratedAccounts) {
          await dbPool.query(
            `UPDATE accounts
             SET owned_weapons = $2, owned_vestments = $3, equipped_weapon = $4, equipped_vestment = $5, updated_at = NOW()
             WHERE id = $1`,
            [
              acc.id,
              JSON.stringify(acc.ownedWeapons || []),
              JSON.stringify(acc.ownedVestments || []),
              acc.equippedWeapon ?? null,
              acc.equippedVestment ?? null,
            ]
          );
        }
        if (needsArmamentMigration) {
          await dbPool.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
            ['20261119_permanent_armaments']
          );
          console.log(`[Migration] Permanent armaments assigned to ${migratedAccounts.length} PostgreSQL accounts.`);
        }
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
      const needsArmamentMigration = !appliedMigrations.includes('20261119_permanent_armaments');
      if (needsReset) {
        console.log('[JSON Storage] Applying one-time attribute reset migration...');
      }
      if (needsArmamentMigration) {
        console.log('[JSON Storage] Applying permanent armaments migration...');
      }

      let anyJsonChanged = false;
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
          rec.attributePoints = (Math.max(1, rec.level) - 1) * 3;
        } else {
          rec.strength = Number(rec.strength) || 0;
          rec.vitality = Number(rec.vitality) || 0;
          rec.dexterity = Number(rec.dexterity) || 0;
          rec.intelligence = Number(rec.intelligence) || 0;
          rec.faith = Number(rec.faith) || 0;
          rec.attributePoints = Number(rec.attributePoints) || 0;
        }
        normalizeAccountLevel(rec);
        if (applyAccountArmamentMigration(rec, needsArmamentMigration)) {
          anyJsonChanged = true;
        }

        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }

      if (needsReset || needsArmamentMigration || anyJsonChanged) {
        if (needsReset && !appliedMigrations.includes('20261106_reset_attributes')) {
          appliedMigrations.push('20261106_reset_attributes');
        }
        if (needsArmamentMigration && !appliedMigrations.includes('20261119_permanent_armaments')) {
          appliedMigrations.push('20261119_permanent_armaments');
        }
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(MIGRATIONS_FILE, JSON.stringify(appliedMigrations, null, 2), 'utf8');
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(accountsById.values()), null, 2), 'utf8');
        console.log('[JSON Storage] Account migrations applied and recorded.');
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

function buildAccountRecord(
  username: string,
  password: string,
  chosenClass: HeroClassId = 'vanguard',
  isAdmin = false
): AccountRecord {
  const validClass = normalizeHeroClass(chosenClass);
  const id = `usr_${crypto.randomBytes(6).toString('hex')}`;
  const defaultWeapon = getDefaultWeaponIdForClass(validClass);
  const defaultVestment = getDefaultVestmentIdForClass(validClass);
  return {
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
    isAdmin,
    strength: 0,
    vitality: 0,
    dexterity: 0,
    intelligence: 0,
    faith: 0,
    attributePoints: 0,
    level: 1,
    xp: 0,
    ownedWeapons: [defaultWeapon],
    ownedVestments: [defaultVestment],
    equippedWeapon: defaultWeapon,
    equippedVestment: defaultVestment,
  };
}

function createAccount(
  username: string,
  password: string,
  chosenClass: HeroClassId = 'vanguard',
  isAdmin = false
): AccountRecord {
  const rec = buildAccountRecord(username, password, chosenClass, isAdmin);
  persistAccount(rec);
  return rec;
}

interface ConnectedClient extends ManagedWsClient {
  ws: WebSocket;
  userId: string;
  username: string;
  roomId: string | null;
  droppedTicks: number;
  totalDroppedTicks: number;
  needsKeyframe?: boolean;
}

interface RoomDeltaState {
  seq: number;
  lastBaseline: GameSnapshot | null;
}

const rooms = new Map<string, GameRoom>();
const roomDeltaStates = new Map<string, RoomDeltaState>();
const dirtyNonPlayingRooms = new Set<string>();
const clients = new Set<ConnectedClient>();
const roomClientIndex = new RoomClientIndex<ConnectedClient>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'BYND-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sendJson(ws: WebSocket, msg: ServerMessage, options?: SendFrameOptions): void {
  sendJsonMessage(ws, msg, options);
}

function broadcastRoomList(): void {
  const lobbyTargets: ConnectedClient[] = [];
  for (const c of clients) {
    if (!c.roomId || c.roomId === 'TAVERN-HUB') {
      lobbyTargets.push(c);
    }
  }
  if (lobbyTargets.length === 0) return;

  const summaries = Array.from(rooms.values())
    .filter((r) => r.roomId !== 'TAVERN-HUB')
    .map((r) => r.getSummary());
  const payload: ServerMessage = {
    type: 'lobby:rooms',
    rooms: summaries,
    onlineCount: clients.size,
  };
  broadcastSerialized(lobbyTargets, payload, { droppable: true });
}

function broadcastToRoom(roomId: string, msg: ServerMessage, options: SendFrameOptions = {}): void {
  const stats = broadcastSerialized(roomClientIndex.getRoomClients(roomId), msg, options);
  if (stats.closedCount > 0) {
    for (const c of Array.from(roomClientIndex.getRoomClients(roomId))) {
      if (c.ws.readyState !== WebSocket.OPEN) {
        roomClientIndex.removeFromRoom(c, roomId);
        clients.delete(c);
      }
    }
  }
}

function attachRoomPersistenceCallbacks(room: GameRoom): void {
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
      acc.level = Math.max(1, Math.min(MAX_LEVEL, state.level));
      acc.xp = acc.level >= MAX_LEVEL ? 0 : Math.max(0, state.xp);
      acc.strength = state.strength;
      acc.vitality = state.vitality;
      acc.dexterity = state.dexterity;
      acc.intelligence = state.intelligence;
      acc.faith = state.faith;
      acc.attributePoints = state.attributePoints;
      await persistAccount(acc).catch(err => {
        console.error('CRITICAL: Failed to persist progression update:', err);
      });
    }
  };
  room.onArmamentUnlockedCallback = async (pid, slot, itemId) => {
    const acc = accountsById.get(pid);
    if (!acc) return;
    applyAccountArmamentMigration(acc);
    if (slot === 'weapon') {
      if (!acc.ownedWeapons!.includes(itemId)) {
        acc.ownedWeapons!.push(itemId);
      }
    } else {
      if (!acc.ownedVestments!.includes(itemId)) {
        acc.ownedVestments!.push(itemId);
      }
    }
    await persistAccount(acc).catch(err => {
      console.error('Failed to persist unlocked permanent armament:', err);
    });
  };
}

function toPartyAccount(acc: AccountRecord): PartyAccountInput {
  normalizeAccountLevel(acc);
  applyAccountArmamentMigration(acc);
  return {
    id: acc.id,
    username: acc.username,
    heroClass: acc.lockedClass || acc.preferredClass || 'vanguard',
    isAdmin: acc.isAdmin,
    savedStats: {
      level: acc.level || 1,
      xp: acc.xp || 0,
      strength: acc.strength || 0,
      vitality: acc.vitality || 0,
      dexterity: acc.dexterity || 0,
      intelligence: acc.intelligence || 0,
      faith: acc.faith || 0,
      attributePoints: acc.attributePoints || 0,
      storage: acc.storedRelics || [],
      ownedWeapons: [...(acc.ownedWeapons || [])],
      ownedVestments: [...(acc.ownedVestments || [])],
      equippedWeapon: acc.equippedWeapon ?? null,
      equippedVestment: acc.equippedVestment ?? null,
    },
  };
}

const partyCoordinator = new PartyCoordinator<ConnectedClient>({
  rooms,
  roomClientIndex,
  roomDeltaStates,
  dirtyNonPlayingRooms,
  generateRoomCode,
  sendJson: (ws, msg) => sendJsonMessage(ws, msg),
  broadcastToRoom: (roomId, msg) => broadcastToRoom(roomId, msg),
  broadcastRoomList,
  onRoomCreated: attachRoomPersistenceCallbacks,
});

async function startServer() {
  await initStorage();

  partyCoordinator.ensureTavernRoom();

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

      // Deployed platforms (Render, Google Cloud Run / AI Studio preview, Vercel, Itch.io)
      if (
        hostname.endsWith('.onrender.com') ||
        hostname.endsWith('.run.app') ||
        hostname.endsWith('.vercel.app') ||
        hostname.endsWith('.itch.io') ||
        hostname.endsWith('.itch.zone')
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

  const internalIdentityRateLimiter = new SlidingWindowRateLimiter(120, 60_000);
  const ssoAssertionRateLimiter = new SlidingWindowRateLimiter(30, 60_000);

  function getConfiguredIdentitySecret(): string {
    return (process.env.BEYOND_IDENTITY_SECRET || '').trim();
  }

  function requireInternalIdentityAuth(req: express.Request, res: express.Response): string | null {
    const clientKey = req.ip || 'unknown';
    if (!internalIdentityRateLimiter.consume(clientKey)) {
      res.status(429).json({ error: 'Too many shared identity requests. Please retry shortly.' });
      return null;
    }
    const expectedSecret = getConfiguredIdentitySecret();
    const xSecretHeader = typeof req.headers['x-beyond-identity-secret'] === 'string'
      ? req.headers['x-beyond-identity-secret']
      : undefined;
    const check = verifySharedIdentityRequestSecret(
      req.headers.authorization,
      xSecretHeader,
      expectedSecret
    );
    if (!check.ok) {
      res.status(check.status).json({ error: check.error });
      return null;
    }
    return expectedSecret;
  }

  // Authenticated player SSO handoff: mints a short-lived signed assertion for Beyond: Overworld
  app.post('/api/auth/overworld-assertion', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!ssoAssertionRateLimiter.consume(userId)) {
      res.status(429).json({ error: 'Rate limit exceeded for Overworld handoff assertions.' });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }
    const secret = getConfiguredIdentitySecret();
    if (secret.length < MIN_SHARED_IDENTITY_SECRET_LENGTH) {
      res.status(503).json({ error: 'Shared Beyond identity integration is not configured.' });
      return;
    }
    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.json({
      assertion,
      expiresInSeconds: DEFAULT_ASSERTION_TTL_SECONDS,
    });
  });

  // Server-to-server identity verification for Beyond: Overworld
  app.post('/api/internal/identity/verify-credentials', async (req, res) => {
    const secret = requireInternalIdentityAuth(req, res);
    if (!secret) return;

    const usernameRaw = String(req.body?.username ?? '').trim();
    const passwordRaw = String(req.body?.password ?? '');

    if (usernameRaw.length < 2 || usernameRaw.length > 20) {
      res.status(400).json({ error: 'Username must be 2 to 20 characters.' });
      return;
    }
    if (!passwordRaw) {
      res.status(400).json({ error: 'Password is required.' });
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

    let dirty = false;
    if (!acc.passwordHash.startsWith('scrypt:')) {
      acc.passwordHash = hashPassword(passwordRaw);
      dirty = true;
    }
    if (acc.usernameLower === 'aleph' && !acc.isAdmin) {
      acc.isAdmin = true;
      dirty = true;
    }
    if (dirty) {
      await persistAccount(acc).catch((err) => {
        console.error('Failed to persist account upgrade during shared verify:', err);
      });
    }

    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.json({
      assertion,
      account: toPublicProfile(acc),
    });
  });

  // Server-to-server account registration for Beyond: Overworld (single authoritative Dungeons record)
  app.post('/api/internal/identity/register', async (req, res) => {
    const secret = requireInternalIdentityAuth(req, res);
    if (!secret) return;

    if (isMaintenance) {
      res.status(503).json({
        error: `Server is migrating to Singapore for lower latency. Please register at: ${redirectTarget}`,
        redirectUrl: redirectTarget,
      });
      return;
    }

    const usernameRaw = String(req.body?.username ?? '').trim();
    const passwordRaw = String(req.body?.password ?? '');
    const preferredClass = normalizeHeroClass(req.body?.preferredClass ?? req.body?.heroClass);

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

    const isAdmin = usernameRaw.toLowerCase() === 'aleph';
    const acc = buildAccountRecord(usernameRaw, passwordRaw, preferredClass, isAdmin);
    try {
      await persistAccount(acc);
    } catch (err) {
      console.error('Failed to persist shared-identity registration:', err);
      res.status(500).json({ error: 'Failed to persist new adventurer account.' });
      return;
    }

    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.status(201).json({
      assertion,
      account: toPublicProfile(acc),
    });
  });

  // Server-to-server authoritative identity snapshot lookup by Dungeons accountId
  app.get('/api/internal/identity/account/:accountId', (req, res) => {
    const secret = requireInternalIdentityAuth(req, res);
    if (!secret) return;

    const accountId = String(req.params.accountId ?? '').trim();
    const acc = accountsById.get(accountId);
    if (!acc) {
      res.status(404).json({ error: 'Adventurer account not found.' });
      return;
    }

    const payload = buildSharedAssertionPayload(acc, DEFAULT_ASSERTION_TTL_SECONDS);
    const assertion = signDungeonsIdentityAssertion(payload, secret);
    res.json({
      assertion,
      account: toPublicProfile(acc),
    });
  });

  app.post('/api/voice/token', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      console.warn('[Voice] Token request rejected: invalid or missing session token.');
      res.status(401).json({ error: 'Authentication required for voice chat.' });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }

    const rawRoomId = String(req.body?.roomId || '').trim();
    if (!rawRoomId) {
      res.status(400).json({ error: 'Room ID required.' });
      return;
    }

    const room = rooms.get(rawRoomId) || rooms.get(rawRoomId.toUpperCase());
    if (!room) {
      console.warn(`[Voice] Token request rejected: Room ${rawRoomId} not found.`);
      res.status(404).json({ error: 'Game room not found.' });
      return;
    }

    const resolvedRoomId = room.roomId;
    const isMemberViaWs = Array.from(roomClientIndex.getRoomClients(resolvedRoomId)).some(
      (c) => c.userId === acc.id
    );
    const isMember = room.hasPlayer(acc.id) || isMemberViaWs;

    if (!isMember) {
      console.warn(
        `[Voice] Token request rejected: Player ${acc.username} (${acc.id}) is not a member of room ${resolvedRoomId}.`
      );
      res.status(403).json({ error: 'Forbidden: You are not a member of this room.' });
      return;
    }

    const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
    const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
    const rawUrl = (process.env.LIVEKIT_URL || '').trim();
    const livekitUrl = rawUrl
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.warn('[Voice] LiveKit environment variables are missing on server.');
      res.status(503).json({
        error:
          'Voice chat is not configured on the server (missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET).',
      });
      return;
    }

    console.log(`[Voice] Generating LiveKit token for ${acc.username} in room ${resolvedRoomId}`);

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: acc.id,
        name: acc.username,
      });
      at.addGrant({
        roomJoin: true,
        room: resolvedRoomId,
        canPublish: true,
        canSubscribe: true,
      });
      const jwtToken = await at.toJwt();
      console.log(`[Voice] Token issued for ${acc.username} in room ${resolvedRoomId}`);
      res.json({ token: jwtToken, url: livekitUrl });
    } catch (err) {
      console.error('[Voice] Failed to generate LiveKit access token:', err);
      res.status(500).json({ error: 'Failed to generate voice token.' });
    }
  });

  app.post('/api/voice/report', async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required for reporting.' });
      return;
    }
    const reporterAcc = accountsById.get(userId);
    if (!reporterAcc) {
      res.status(401).json({ error: 'Account not found.' });
      return;
    }

    const roomId = String(req.body?.roomId || '').trim();
    const reportedUserId = String(req.body?.reportedUserId || '').trim();
    const reason = String(req.body?.reason || '').trim();

    if (!roomId || !reportedUserId || !reason) {
      res.status(400).json({ error: 'roomId, reportedUserId, and reason are required.' });
      return;
    }
    if (reason.length > 500) {
      res.status(400).json({ error: 'Report reason must be 500 characters or less.' });
      return;
    }
    if (reportedUserId === userId) {
      res.status(400).json({ error: 'You cannot report yourself.' });
      return;
    }

    const room = rooms.get(roomId) || rooms.get(roomId.toUpperCase());
    if (!room || !room.hasPlayer(userId)) {
      res.status(403).json({ error: 'Invalid room or membership.' });
      return;
    }

    const reportedKnown = accountsById.has(reportedUserId) || room.hasPlayer(reportedUserId);
    if (!reportedKnown) {
      res.status(400).json({ error: 'Reported player was not found.' });
      return;
    }

    console.log(
      `[VoiceReport] Player ${reporterAcc.username} reported user ${reportedUserId} in room ${room.roomId}: ${reason}`
    );

    if (dbPool) {
      try {
        await dbPool.query(
          `CREATE TABLE IF NOT EXISTS voice_reports (
            id SERIAL PRIMARY KEY,
            room_id VARCHAR(64) NOT NULL,
            reporter_id VARCHAR(64) NOT NULL,
            reported_id VARCHAR(64) NOT NULL,
            reason TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );`
        );
        await dbPool.query(
          `INSERT INTO voice_reports (room_id, reporter_id, reported_id, reason) VALUES ($1, $2, $3, $4);`,
          [room.roomId, userId, reportedUserId, reason]
        );
      } catch (err) {
        console.error('[VoiceReport] Failed to persist report to PostgreSQL:', err);
        res.status(500).json({ error: 'Failed to save report to database.' });
        return;
      }
    } else {
      try {
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        const reportsFile = path.join(DATA_DIR, 'voice_reports.json');
        let existing: unknown[] = [];
        if (fs.existsSync(reportsFile)) {
          try {
            existing = JSON.parse(fs.readFileSync(reportsFile, 'utf8'));
            if (!Array.isArray(existing)) existing = [];
          } catch {
            existing = [];
          }
        }
        existing.push({
          roomId: room.roomId,
          reporterId: userId,
          reportedId: reportedUserId,
          reason,
          createdAt: new Date().toISOString(),
        });
        fs.writeFileSync(reportsFile, JSON.stringify(existing, null, 2), 'utf8');
      } catch (err) {
        console.error('[VoiceReport] Failed to persist report locally:', err);
        res.status(500).json({ error: 'Failed to save report.' });
        return;
      }
    }

    res.json({ success: true, message: 'Report recorded successfully.' });
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
  let lastTickDurationMs = 0;
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });

  wss.on('connection', (ws, req) => {
    // Disable Nagle's algorithm so small input/pong frames flush immediately
    req.socket?.setNoDelay?.(true);

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
      droppedTicks: 0,
      totalDroppedTicks: 0,
      needsKeyframe: false,
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
        sendJson(ws, { type: 'pong', t: msg.t, tickMs: lastTickDurationMs });
        return;
      }

      if (msg.type === 'lobby:subscribe') {
        sendJson(ws, {
          type: 'lobby:rooms',
          rooms: Array.from(rooms.values())
            .filter((r) => r.roomId !== 'TAVERN-HUB')
            .map((r) => r.getSummary()),
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
        const difficulty: DifficultyTier =
          msg.difficulty === 'Heroic' || msg.difficulty === 'Abyssal'
            ? msg.difficulty
            : 'Normal';
        partyCoordinator.createParty(client, toPartyAccount(acc), {
          name: msg.name,
          difficulty,
          seed: msg.seed,
        });
        return;
      }

      if (msg.type === 'room:join') {
        partyCoordinator.joinOrReconnectRoom(client, toPartyAccount(acc), String(msg.roomId || ''));
        return;
      }

      if (msg.type === 'room:leave') {
        partyCoordinator.leaveRoomExplicit(client);
        sendJson(ws, { type: 'room:left' });
        return;
      }

      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) return;

      if (msg.type === 'player:input') {
        room.updateInput(acc.id, msg.input, msg.seq);
      } else if (msg.type === 'room:resync') {
        client.needsKeyframe = true;
      } else if (msg.type === 'player:action') {
        const res = room.performAction(acc.id, msg.action, msg.aimAngle, {
          aimDistance: typeof msg.aimDistance === 'number' && Number.isFinite(msg.aimDistance) ? msg.aimDistance : undefined,
          explicitAim: Boolean(msg.explicitAim),
        });
        if (res.floorChanged) {
          roomDeltaStates.delete(room.roomId);
          for (const c of roomClientIndex.getRoomClients(room.roomId)) {
            c.needsKeyframe = true;
          }
          broadcastToRoom(room.roomId, {
            type: 'room:map',
            map: res.floorChanged,
          });
          broadcastRoomList();
        }
      } else if (msg.type === 'player:channel_start') {
        room.startDisintegrationChannel(acc.id, msg.aimAngle);
      } else if (msg.type === 'player:channel_update') {
        room.updateDisintegrationTarget(acc.id, msg.aimAngle);
      } else if (msg.type === 'player:channel_stop') {
        room.stopDisintegrationChannel(acc.id);
      } else if (msg.type === 'player:select_scroll') {
        room.selectArcanistScroll(acc.id, msg.scrollId);
      } else if (msg.type === 'player:close_chest') {
        room.closeChest(acc.id);
      } else if (msg.type === 'player:select_relic') {
        room.selectRelic(acc.id, msg.relicId);
        acc.storedRelics = [...(room.getPlayerState(acc.id)?.storage || [])];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === 'player:unequip_relic') {
        room.unequipRelic(acc.id, msg.relicId);
        acc.storedRelics = [...(room.getPlayerState(acc.id)?.storage || [])];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === 'player:store_relic') {
        room.storeRelic(acc.id, msg.relicId);
        acc.storedRelics = [...(room.getPlayerState(acc.id)?.storage || [])];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === 'player:equip_stored_relic') {
        room.equipStoredRelic(acc.id, msg.relicId);
        acc.storedRelics = [...(room.getPlayerState(acc.id)?.storage || [])];
        persistAccount(acc).catch(console.error);
      } else if (msg.type === 'player:delete_relic') {
        room.deleteRelic(acc.id, msg.relicId, msg.fromStorage);
        acc.storedRelics = [...(room.getPlayerState(acc.id)?.storage || [])];
        acc.gold = room.getPlayerState(acc.id)?.gold ?? acc.gold;
        persistAccount(acc).catch(console.error);
      } else if (msg.type === 'player:discard_potion') {
        room.discardPotion(acc.id, msg.count);
      } else if (msg.type === 'player:equip_armament') {
        const slot = msg.slot === 'weapon' || msg.slot === 'vestment' ? msg.slot : null;
        const itemId = typeof msg.itemId === 'string' ? msg.itemId.trim() : '';
        if (!slot || !itemId) {
          sendJson(ws, { type: 'error', message: 'Invalid armament selection.' });
          return;
        }
        applyAccountArmamentMigration(acc);
        const def = getArmamentDef(slot, itemId);
        if (!def) {
          sendJson(ws, { type: 'error', message: 'Unknown permanent armament.' });
          return;
        }
        const activeClass = acc.lockedClass || acc.preferredClass || 'vanguard';
        if (def.heroClass !== activeClass) {
          sendJson(ws, {
            type: 'error',
            message: `${def.name} requires the ${def.heroClass.toUpperCase()} class.`,
          });
          return;
        }
        const ownedList = slot === 'weapon' ? acc.ownedWeapons || [] : acc.ownedVestments || [];
        if (!ownedList.includes(itemId)) {
          sendJson(ws, {
            type: 'error',
            message: `Ownership verification failed: ${def.name} is not in your armory.`,
          });
          return;
        }
        if (slot === 'weapon') {
          acc.equippedWeapon = itemId;
        } else {
          acc.equippedVestment = itemId;
        }
        const eqRes = room.equipArmament(acc.id, slot, itemId);
        if (!eqRes.ok) {
          sendJson(ws, { type: 'error', message: eqRes.error || 'Cannot equip armament.' });
          return;
        }
        partyCoordinator.markRoomDirty(room.roomId);
        persistAccount(acc).catch(err => {
          console.error('Failed to persist equipped armament:', err);
        });
      } else if (msg.type === 'player:unequip_armament') {
        const slot = msg.slot === 'weapon' || msg.slot === 'vestment' ? msg.slot : null;
        if (!slot) {
          sendJson(ws, { type: 'error', message: 'Invalid armament slot.' });
          return;
        }
        applyAccountArmamentMigration(acc);
        if (slot === 'weapon') {
          acc.equippedWeapon = null;
        } else {
          acc.equippedVestment = null;
        }
        room.unequipArmament(acc.id, slot);
        partyCoordinator.markRoomDirty(room.roomId);
        persistAccount(acc).catch(err => {
          console.error('Failed to persist unequipped armament:', err);
        });
      } else if (msg.type === 'admin:grant_armament') {
        if (!acc.isAdmin) {
          sendJson(ws, { type: 'error', message: 'Admin access required.' });
          return;
        }
        const slot = msg.slot === 'weapon' || msg.slot === 'vestment' ? msg.slot : null;
        const itemId = typeof msg.itemId === 'string' ? msg.itemId.trim() : '';
        const def = slot ? getArmamentDef(slot, itemId) : null;
        if (!slot || !def) {
          sendJson(ws, { type: 'error', message: 'Unknown armament item ID.' });
          return;
        }
        applyAccountArmamentMigration(acc);
        const targetList = slot === 'weapon' ? acc.ownedWeapons! : acc.ownedVestments!;
        if (!targetList.includes(itemId)) {
          targetList.push(itemId);
        }
        room.grantArmament(acc.id, slot, itemId);
        partyCoordinator.markRoomDirty(room.roomId);
        persistAccount(acc).catch(err => {
          console.error('Failed to persist admin-granted armament:', err);
        });
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
          applyAccountArmamentMigration(acc, true);
          persistAccount(acc).catch(console.error);
          room.changeClass(acc.id, validClass);
          room.pushSystemChat(`[ADMIN] ${acc.username} shifted hero class to ${validClass.toUpperCase()}`);
          partyCoordinator.markRoomDirty(room.roomId);
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
          room.pushSystemChat(`[ADMIN] God Mode ${isGod ? 'ENABLED' : 'DISABLED'} for ${acc.username}`);
        } else {
          sendJson(ws, { type: 'error', message: 'Admin access required.' });
        }
      } else if (msg.type === 'admin:toggle_speed') {
        if (acc.isAdmin) {
          const isSpeed = room.togglePlayerSpeedBoost(acc.id, msg.enabled);
          room.pushSystemChat(`[ADMIN] Speed Boost ${isSpeed ? 'ENABLED' : 'DISABLED'} for ${acc.username}`);
        } else {
          sendJson(ws, { type: 'error', message: 'Admin access required.' });
        }
      } else if (msg.type === 'admin:toggle_no_cooldown') {
        if (acc.isAdmin) {
          const isNoCd = room.togglePlayerNoCooldown(acc.id, msg.enabled);
          room.pushSystemChat(`[ADMIN] No Cooldown Mode ${isNoCd ? 'ENABLED' : 'DISABLED'} for ${acc.username}`);
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
            room.pushSystemChat(`[ADMIN] Set Level ${level} for ${acc.username}`);
          }
        }
      } else if (msg.type === 'admin:add_relic') {
        if (acc.isAdmin && msg.relicId) {
          room.addPlayerRelic(acc.id, String(msg.relicId));
        }
      } else if (msg.type === 'admin:equip_scroll') {
        if (acc.isAdmin && msg.scrollId) {
          room.adminEquipScroll(acc.id, String(msg.scrollId));
        }
      } else if (msg.type === 'admin:spawn_dummy') {
        if (acc.isAdmin) {
          room.spawnDummyAtPlayer(acc.id);
        }
      } else if (msg.type === 'admin:teleport_floor') {
        if (acc.isAdmin && typeof msg.floor === 'number') {
          if (room.roomId !== 'TAVERN-HUB' && room.status !== 'playing') {
            sendJson(ws, { type: 'error', message: 'Start the expedition from the party lobby first.' });
            return;
          }
          room.teleportPlayerToFloor(acc.id, msg.floor);
        }
      } else if (msg.type === 'admin:spawn_entity') {
        if (acc.isAdmin && msg.kind) {
          if (room.roomId !== 'TAVERN-HUB' && room.status !== 'playing') {
            sendJson(ws, { type: 'error', message: 'Start the expedition from the party lobby first.' });
            return;
          }
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
          if (room.roomId !== 'TAVERN-HUB' && room.status !== 'playing') {
            sendJson(ws, { type: 'error', message: 'Start the expedition from the party lobby first.' });
            return;
          }
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
          room.pushChat(acc.username, trimmed, false);
        }
      } else if (msg.type === 'room:start') {
        partyCoordinator.startExpedition(client);
      } else if (msg.type === 'room:set_ready') {
        partyCoordinator.setPlayerReady(client, msg.ready);
      } else if (msg.type === 'room:return_to_lobby') {
        partyCoordinator.returnToLobby(client);
      } else if (msg.type === 'room:restart') {
        partyCoordinator.restartExpedition(client);
      } else if (msg.type === 'player:spend_attribute') {
        if (acc.attributePoints && acc.attributePoints > 0) {
          const attr = msg.attribute;
          if (attr === 'strength' || attr === 'dexterity' || attr === 'vitality' || attr === 'intelligence' || attr === 'faith') {
            const currentAttr = acc[attr] || 0;
            if (currentAttr < MAX_ATTRIBUTE) {
              const oldAttr = currentAttr;
              const oldPoints = acc.attributePoints;
              const requested = msg.amount !== undefined ? Math.floor(Number(msg.amount)) : 1;
              const availableRoom = Math.max(0, MAX_ATTRIBUTE - oldAttr);
              const spend = Math.min(requested > 0 ? requested : 1, oldPoints, availableRoom);

              if (spend > 0) {
                acc[attr] = oldAttr + spend;
                acc.attributePoints = oldPoints - spend;
                
                void (async () => {
                  try {
                    await persistAccount(acc);
                    room.pushSystemChat(`${acc.username} increased ${attr.toUpperCase()} by +${spend} to ${acc[attr]}.`);
                    
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
                    partyCoordinator.markRoomDirty(room.roomId);
                  } catch {
                    // Rollback on failure
                    acc[attr] = oldAttr;
                    acc.attributePoints = oldPoints;
                    sendJson(ws, { type: 'error', message: 'Failed to save attribute allocation. Please try again.' });
                  }
                })();
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
            persistAccount(acc).catch(err => console.error('Failed to persist admin attribute points:', err));
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
        if (!room.isPlayerNearNpc(acc.id, 'npc_aleph', 180)) {
          sendJson(ws, { type: 'error', message: 'You must be near Aleph to reset your attributes.' });
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
        
        void (async () => {
          try {
            await persistAccount(acc);
            
            // Sync with room state
            room.updatePlayerAttributes(
              acc.id,
              acc.strength || 0,
              acc.vitality || 0,
              acc.dexterity || 0,
              acc.intelligence || 0,
              acc.faith || 0,
              acc.attributePoints || 0
            );
            
            room.pushSystemChat(`${acc.username} has reclaimed ${spent} attribute points through Aleph.`);
          } catch {
            // Rollback
            Object.assign(acc, oldState);
            sendJson(ws, { type: 'error', message: 'Failed to reset attributes. Please try again.' });
          }
        })();
        
        // Keep Aleph dialogue active with confirmation of reclaimed points
        const aleph = room.npcs.find(n => n.id === 'npc_aleph');
        if (aleph) {
          aleph.dialogue = spent > 0
            ? `Your spirit is purified. Reclaimed ${spent} attribute points. Forge your destiny anew.`
            : 'Your attributes are already at balance. Earn greater experience to hone your spirit.';
          aleph.speakingMs = 9999999;
          aleph.options = [
            { id: 'lore', label: 'Who are you?' },
            { id: 'goodbye', label: 'Thank you, Aleph. (Close)' }
          ];
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
              speakingNpc.dialogue = 'I am Aleph, weaver of dormant spirits. In this Sanctuary, I return what you have sown so you may reap a new path.';
              speakingNpc.speakingMs = 9999999; 
              speakingNpc.options = [
                { id: 'reset_stats', label: 'I wish to reset my attributes.' },
                { id: 'back', label: 'I see. (Back)' }
              ];
            } else if (msg.optionId === 'back') {
              speakingNpc.dialogue = 'The paths you walk are many, but your soul remains constant. Do you seek a different focus?';
              speakingNpc.speakingMs = 9999999;
              speakingNpc.options = [
                { id: 'reset_stats', label: 'I wish to reset my attributes.' },
                { id: 'lore', label: 'Who are you?' }
              ];
            } else if (msg.optionId === 'goodbye') {
              speakingNpc.speakingMs = 0;
            }
          }
        }
      }
    });

    ws.on('close', () => {
      clients.delete(client);
      partyCoordinator.handleSocketDisconnect(client);
    });

    ws.on('error', () => {
      clients.delete(client);
      partyCoordinator.handleSocketDisconnect(client);
    });
  });

  const TICK_MS = SERVER_TICK_MS; // 40 Hz (25ms) drift-free authoritative simulation loop
  let nextTickAt = performance.now() + TICK_MS;

  const runServerTick = () => {
    const tickStart = performance.now();
    let anyStatusChanged = false;

    for (const [roomId, room] of rooms.entries()) {
      if (room.getPlayerCount() === 0) {
        if (roomId !== 'TAVERN-HUB') {
          partyCoordinator.clearRoomTimers(roomId);
          rooms.delete(roomId);
          roomDeltaStates.delete(roomId);
          dirtyNonPlayingRooms.delete(roomId);
        }
        continue;
      }
      const prevStatus = room.status;
      if (room.status === 'playing') {
        room.tick(TICK_MS);
      }

      const clientCount = roomClientIndex.getRoomClientCount(roomId);
      const statusTransitioned = room.status !== prevStatus;
      const roomClients = clientCount > 0 ? Array.from(roomClientIndex.getRoomClients(roomId)) : [];
      const anyNeedsKeyframe = roomClients.some((c) => c.needsKeyframe);
      const shouldBroadcast =
        clientCount > 0 &&
        (room.status === 'playing' ||
          statusTransitioned ||
          dirtyNonPlayingRooms.has(roomId) ||
          anyNeedsKeyframe);

      if (shouldBroadcast) {
        const snapshot = room.buildNetworkSnapshot();
        let deltaState = roomDeltaStates.get(roomId);
        if (!deltaState) {
          deltaState = { seq: 0, lastBaseline: null };
          roomDeltaStates.set(roomId, deltaState);
        }
        const nextSeq = deltaState.seq + 1;

        const keyframeTargets: ConnectedClient[] = [];
        const deltaTargets: ConnectedClient[] = [];

        if (!deltaState.lastBaseline) {
          for (const c of roomClients) keyframeTargets.push(c);
        } else {
          for (const c of roomClients) {
            if (c.needsKeyframe) keyframeTargets.push(c);
            else deltaTargets.push(c);
          }
        }

        if (keyframeTargets.length > 0) {
          const rawKeyframe = JSON.stringify({
            type: 'room:tick',
            snapshot,
            seq: nextSeq,
          } satisfies ServerMessage);
          for (const c of keyframeTargets) {
            const outcome = sendRawFrame(c, rawKeyframe, { droppable: true });
            if (outcome === 'sent') {
              c.needsKeyframe = false;
            } else if (outcome === 'closed_overflow') {
              roomClientIndex.removeFromRoom(c, roomId);
              clients.delete(c);
            }
          }
        }

        if (deltaTargets.length > 0 && deltaState.lastBaseline) {
          const delta = computeSnapshotDelta(
            deltaState.lastBaseline,
            snapshot,
            deltaState.seq,
            nextSeq
          );
          const stats = broadcastSerialized(
            deltaTargets,
            { type: 'room:delta', delta },
            { droppable: true }
          );
          if (stats.closedCount > 0) {
            for (const c of deltaTargets) {
              if (c.ws.readyState !== WebSocket.OPEN) {
                roomClientIndex.removeFromRoom(c, roomId);
                clients.delete(c);
              }
            }
          }
        }

        deltaState.seq = nextSeq;
        deltaState.lastBaseline = cloneSnapshotBaseline(snapshot);
        dirtyNonPlayingRooms.delete(roomId);
      }

      if (statusTransitioned) {
        anyStatusChanged = true;
      }
    }

    if (anyStatusChanged) {
      broadcastRoomList();
    }

    const nowAfter = performance.now();
    lastTickDurationMs = Math.round((nowAfter - tickStart) * 10) / 10;

    nextTickAt += TICK_MS;
    if (nowAfter - nextTickAt > TICK_MS * 4) {
      nextTickAt = nowAfter + TICK_MS;
    }
    const delayMs = Math.max(1, Math.round(nextTickAt - nowAfter));
    setTimeout(runServerTick, delayMs);
  };

  setTimeout(runServerTick, TICK_MS);

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
