# Arcanist Revamp Test & Verification Plan (`ARCANIST_TEST_PLAN.md`)

## Acceptance Criteria Checklist (Verified in `test_regression.ts` Tests 97–101)

- **Default `[Q]` & Seven Spell Scrolls (Test 97)**:
  - Arcanist starts with default `Astral Nova` (`[Q]`, `5000ms` CD, 8 radial bolts).
  - Equipping any of the 7 Spell Scrolls (`fireball`, `disintegration`, `frost_lance`, `chain_lightning`, `arcane_meteor`, `arcane_orb`, `arcane_barrage`) routes `[Q / RMB]` (`performAction(..., 'tactical')`) through that spell server-authoritatively.
  - Exact base cooldowns (`6s`, `12s` post-channel, `4.5s`, `7s`, `11s`, `9s`, `8s`) & CDR scaling on `skillCooldownMs` / `maxSkillCooldownMs`.
  - Exact single-application INT formula `D = B * [1 + 0.025*(L-1)] * [1 + c*INT]` (verified Lv25, 60 INT, Sunfire Signet, 2 Fury stacks -> `135`).
  - Fireball `90u` AoE explosion (no burn); Frost Lance 3-pierce straight line (no homing/CC); Chain Lightning max 4 targets (`150u` jump, `-15%`/jump, no repeats, preserves CD if no target); Arcane Meteor `0.5s` cast + `1.0s` delay + `125u` blast (no DoT); Arcane Orb `4.0s`, slow movement, max 2 hits/enemy at `0.5s` interval; Arcane Barrage 6 alternating-helix bolts (`450u` range, independent hits, no homing).
- **Disintegration Specialization (Test 98)**:
  - Server rejects `startDisintegrationChannel` unless `equippedScrollId === 'disintegration'`.
  - Movement disabled while channeling (`vx=0, vy=0` + prediction lock).
  - Rotation clamped at `180 deg/s` (`PI rad/s`).
  - `42u` beam width & `450u` wall-clipped max range collision across multiple targets.
  - `0.15s` activation + `0.2s` damage tick cadence (no duplicate ticks).
  - Immediate termination & `12s` cooldown start on `skillCooldownMs` upon release, hard CC, silence, charm, Chrono suspension, or death.
- **Scroll RNG Acquisition & Isolation (Test 99)**:
  - `ARCANIST_SCROLLS` equals the 7 offensive spell IDs (`ARCANIST_SPELL_ORDER`).
  - RNG draft offers 3 distinct Spell Scrolls excluding any currently equipped Scroll.
  - Equipping Scrolls updates `maxSkillCooldownMs` & `getAbilityTargetSpec('arcanist', 'tactical', scrollId)` (`'ground_aoe'` for Meteor, `'line'` for others) while remaining strictly separate from `relics`, `storage`, `gold`, and `potions`.
- **Chrono Well Cooperative Skill (Test 100)**:
  - 3s duration, 45s cooldown, 0 damage, caster player entity unaffected.
  - Suspends ordinary enemies, elites, **bosses** (Floor 10 `Oriphiel`, bypassing boss CC immunity), allied players, hazard/meteor zones, AND **ALL projectiles inside the well (enemy, allied, AND the caster's own projectiles)** while preserving execution state and TTLs.
  - Resumes cleanly on 3s expiration or caster disconnect—never leaving any entity permanently suspended.
- **Multiplayer Sync, Prediction & Build Gate (Test 101)**:
  - Wire JSON delta sync preserves `pendingScrollChoices`, `equippedScrollId`, `disintegrationState`, `skillCooldownMs`, and `chronoSuspendedMs`.
  - `LocalPredictionController` locks movement during channeling / Chrono suspension and `buildSnapshotHudKey` refreshes cleanly.
  - All tests in `test_regression.ts`, `compile_applet`, and `lint_applet` pass cleanly.
