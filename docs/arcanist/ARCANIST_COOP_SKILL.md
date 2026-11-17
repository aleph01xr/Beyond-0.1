# Cooperative Skill — Chrono Well Specification (`ARCANIST_COOP_SKILL.md`)

**Status:** Implemented & verified — server-authoritative 3s time suspension across enemies, bosses, allies, hazard zones, and ALL projectiles (including player/caster projectiles)

---

## 1. Authoritative Chrono Well Specification

| Property | Value | Notes |
|---|---|---|
| Duration | `3000 ms` (3s) | Server-authoritative `ttlMs` |
| Cooldown | `45000 ms` (45s) | Scaled by CDR (`cdrMult`, max 50% CDR) |
| Cast Range | `220 px` (`ground_aoe`) | Matches `abilityTargeting.ts` drag-to-aim |
| Area Radius | `115 px` | Large localized temporal dome |
| Damage | `0` | Pure utility/control cooperative ultimate |
| Caster Player Entity Affected | **No** | Caster moves, aims, casts, and cools down freely |
| All Projectiles Inside Well Suspended | **Yes** | Suspends enemy, allied, AND caster's own projectiles |

### Time Suspension Rules (Evaluated Every Server Tick & On Projectile Spawn)

1. **Ordinary Enemies, Elites & Bosses** inside radius (`dist <= z.radius + enemy.radius * 0.35`):
   - **Bypasses Boss CC Immunity & Hard-CC DR** (does NOT increment `meta.hardCcStage` or get reduced by boss `0.30` / `drMult`).
   - Preserves exact execution state (`windupMs`, `charging`, `chargeTimerMs`, `chargeWindupMs`, `abilityCdMs`, DoT timers, `shieldWallMs`) without clearing or ticking them down.
   - Stops movement (`vx = 0, vy = 0`), AI decisions, attacks, and DoT ticks until Chrono Well ends.
2. **Allied Players** (`ally.id !== z.ownerId` and `!ally.downed`) inside radius:
   - Sets `ally.chronoSuspendedMs > 0`; caster's own player entity always keeps `chronoSuspendedMs = 0`.
   - Suspends movement, attacks, spell casting, actions, status decay, and cooldown progression while inside; resumes seamlessly when leaving or upon expiration.
3. **ALL Projectiles (Enemy, Allied, AND Caster's Own)** inside radius:
   - Evaluated immediately in `spawnProjectile()` and every tick in `refreshChronoSuspensionState()` without owner exemption.
   - Suspends movement (`x/y` unchanged), homing/helix stepping, `ttlMs` countdown, and `Arcane Orb` hit-interval timers cleanly until time resumes—allowing the Arcanist to stack suspended spells mid-field and unleash them simultaneously when Chrono Well expires.
4. **Offensive & Boss Area-of-Effect Zones** (`arcane_meteor`, `star_rift`, and enemy/boss zones) inside radius:
   - Pauses `ttlMs` detonation timers and active zone effects until Chrono Well expires; supportive zones (`aegis_dome`, `solar_beacon`) exempt only their own caster's well.
5. **Overlapping Wells, Resumption & Disconnect Cleanup**:
   - Covering wells track max remaining `ttlMs` so overlapping Chrono Wells extend coverage without flickering.
   - Removing a `chrono_well` (expiry, caster disconnect/leave, floor transition, room reset, or boss encounter reset) immediately calls `refreshChronoSuspensionState()`, guaranteeing zero permanently suspended entities.
