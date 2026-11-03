# Migration Plan: Beyond Backend to Render Singapore

Safely migrate Beyond's backend from Render Oregon to Render Singapore (`singapore`), reducing latency for Philippine players from ~221ms to ~25–45ms while preserving all existing player accounts, password hashes, and progression without data loss, split-brain conflicts, or gameplay downtime.

---

## The Best Move (Executive Recommendation)

If this were my game, here is the exact 3-part strategy I recommend:

### 1. Unified Hosting on Render Singapore (Do Not Split with Vercel)
- **Why**: Render Singapore can serve both the React client (`dist`) and the WebSocket/Express server on the same domain (`https://beyond-game-sg.onrender.com`).
- **Benefits**:
  - **Zero CORS issues**: Browser security never blocks login or lobby requests.
  - **Zero extra configuration**: No need to configure cross-domain environment variables in Vercel.
  - **Optimal Network Route**: The entire handshake (HTTP login + WebSocket stream) stays inside Singapore's low-latency network pipe (dropping ping from **~221ms down to ~30–45ms** for Philippine players).

### 2. Storage: Render Managed PostgreSQL with In-Memory Dev Fallback
- **Why Not Disks?**: Render's Persistent Disks are **not supported on the free tier** (they require a paid $7/mo Starter web service plus disk storage fees). Disks are also physically tied to one machine and cannot easily migrate across regions.
- **Why PostgreSQL**:
  - Permanent data persistence: Accounts and stats will never be wiped when instances restart or go to sleep.
  - Render provides managed PostgreSQL instances directly in the Singapore region (`region: singapore`).
  - Code architecture: We configure `server.ts` to connect to PostgreSQL when `DATABASE_URL` is provided, and gracefully fall back to local in-memory storage during local development.

### 3. Safe "Blue / Green" Migration (Zero Risk to Existing Game)
- Keep Oregon running 100% untouched while building and testing Singapore.
- Export player accounts from Oregon via a secure token-protected API endpoint.
- Import accounts into Singapore PostgreSQL.
- Test Singapore with a live party run to verify the ping monitor shows **🟢 ~30ms**.
- Only after you are completely satisfied do you give players the Singapore link.

---

## 1. Storage Comparison: Persistent Disk vs. PostgreSQL

| Criteria | Render Persistent Disk | Render PostgreSQL *(The Best Move)* |
| :--- | :--- | :--- |
| **Data Integrity & Concurrency** | File-based. Prone to lock contention or corruption on rapid restarts. | ACID transactions (`BEGIN ... COMMIT`). Atomic stat updates for kills, revives, and floor progress. |
| **Render Tier Support** | Paid only ($7/mo Starter instance required; not available on free tier). | Available on Render with full region selection (`singapore`). |
| **Cross-Region Migration** | Disk is locked to Oregon. Cannot be attached to a Singapore server. | Network-accessible via standard `DATABASE_URL`. |
| **Split-Brain Risk** | High if two servers ever write to local files. | Zero: A single authoritative database instance prevents duplicate accounts and conflicting state. |

---

## 2. Risk Analysis & Data-Loss Prevention

| Potential Risk | Root Cause | Prevention Strategy |
| :--- | :--- | :--- |
| **Split-Brain Writes** | Players play on Oregon and Singapore at the same time, splitting their progress. | **Maintenance Lock on Oregon**: During the 3-minute cutover window, set `MAINTENANCE_MODE=true` on Oregon so it rejects new runs and displays: *"Server migrated to Singapore for low ping. Click here to join."* |
| **Unauthorized Data Exposure** | Migration endpoints accessed by public users. | **Cryptographic Admin Bearer Token**: Endpoints are gated behind `MIGRATION_ADMIN_SECRET`. Requests without the matching secret header receive immediate `403 Forbidden`. |
| **Duplicate / Overwritten Accounts** | Concurrent registrations during migration. | PostgreSQL `UNIQUE` constraint on `username_lower`. Migration import uses `INSERT ... ON CONFLICT (username_lower) DO UPDATE` preserving the highest progress. |
| **Password Invalidation** | Password rehashing or mismatched hashing schemes. | Exact SHA-256 salt preservation: `crypto.createHash('sha256').update('beyond_salt_' + pw).digest('hex')`. Hashes are copied verbatim so players log in with zero disruption. |

---

## 3. Account Schema (Preserves 100% of Existing Data)

All fields from current player accounts are preserved:

```sql
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
```

---

## 4. Phased Testing Protocol (Safe Verification Before Cutover)

Before directing any live players to Singapore:

1. **Standalone Health & Ping Test**:
   - Access the Singapore URL directly in a browser.
   - Verify the top HUD latency monitor displays **🟢 ~25–45ms** (down from ~221ms).
2. **Authentication Verification**:
   - Create a test adventurer account on Singapore.
   - Log out, log back in, test password reset.
3. **Multiplayer WebSocket Verification**:
   - Open two browser tabs (or test with another player).
   - Join the same room code (`BYND-XXXX`).
   - Verify real-time 60 FPS movement, synchronized 20-tick/sec game state, chat messages, abilities, and boss combat.
4. **Data Sync Dry-Run**:
   - Perform a test export and import with test data to ensure the cryptographic admin secret, payload parsing, and duplicate handling work flawlessly.
5. **Oregon Remains Untouched**:
   - The Oregon instance stays completely active throughout all testing steps until Singapore is 100% verified.

---

## 5. Implementation Status (All Tasks Completed & Verified)

- [x] **Task 1**: Updated `server.ts` with PostgreSQL database adapter (ACID storage with automatic fallback to local JSON/in-memory).
- [x] **Task 2**: Added authenticated migration endpoints (`/api/admin/export-accounts`, `/api/admin/import-accounts`) secured with Bearer token authentication via `MIGRATION_ADMIN_SECRET`.
- [x] **Task 3**: Added `MAINTENANCE_MODE` and `TARGET_SERVER_URL` cutover safety lock in `server.ts` to eliminate split-brain writes during migration.
- [x] **Task 4**: Updated `render.yaml` with Singapore region (`region: singapore`), dynamic port binding, and database blueprint declaration.
- [x] **Task 5**: Added `src/client/apiConfig.ts` with `VITE_SERVER_URL` support for optional Vercel frontend connectivity while maintaining zero-config unified Render deployment.
- [x] **Task 6**: Ran `lint_applet` (`tsc --noEmit`) and `compile_applet` (`npm run build`) — both passed with zero errors.

