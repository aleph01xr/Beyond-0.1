# Beyond — Crowd-Control Balance Plan

## Goal

Prevent enemies and bosses from being permanently locked down by repeated freeze and stun effects, while keeping crowd control useful and rewarding coordinated play.

The goal is **not** to make bosses immune to crowd control. Players should still be able to interrupt and control bosses through teamwork, but repeated hard-CC applications should have diminishing returns.

## 1. Centralized crowd-control diminishing returns

Create one shared crowd-control system for hard-CC effects so relics and class abilities follow the same rules.

### Proposed starting values

| Consecutive hard-CC application | Duration applied |
|---|---:|
| First | 100% |
| Second | 50% |
| Third | 25% |
| Fourth and later | 0% (temporary immunity) |

- Track hard-CC applications per enemy.
- Reset the diminishing-returns stage after **8 seconds without receiving hard CC**.
- Freeze and stun count as hard CC.
- Slow and other movement reductions are soft CC and do not advance the hard-CC diminishing-returns stage.
- Apply the same rules regardless of whether the effect comes from a relic, class skill, or another combat effect.

These values are initial tuning targets and should be validated in gameplay testing.

## 2. Enemy-type resistance profiles

Use enemy type to determine how strongly hard CC affects a target.

- **Normal enemies:** use the standard diminishing-returns values.
- **Elite enemies:** begin with 25% hard-CC duration reduction.
- **Bosses:** begin with 70% hard-CC duration reduction and use stronger diminishing returns.

Bosses should remain interruptible. Do not add blanket immunity to hard CC during major attacks as the default behavior. Coordinated CC should still create meaningful openings, but should not allow repeated effects to keep a boss disabled indefinitely.

## 3. Initial Rimefrost Shard tuning

Use these as proposed starting values:

| Effect | Current value | Proposed value |
|---|---:|---:|
| Chill chance | 35% | 35% |
| Slow duration | 3.5 seconds | 3.0 seconds |
| Freeze base duration | 2.4 seconds | 1.8 seconds |
| Frozen-hit damage multiplier | 1.6x | 1.4x |
| Shatter wave damage | 40% of final hit damage | 35% of final hit damage |

The centralized hard-CC system must also apply to Rimefrost's freeze effect. Avoid adding a separate freeze-only immunity system that could behave differently from other hard-CC sources.

## 4. Separate hard CC from soft CC

Keep the two categories explicit in the combat code.

- **Hard CC:** freeze and stun. These effects prevent or interrupt enemy actions and use diminishing returns.
- **Soft CC:** slow and movement reduction. These effects reduce movement but do not advance hard-CC diminishing returns.

Review all existing sources of CC and classify them consistently, including:
- Rimefrost Shard
- Thorned Aegis
- Arcanist's Chrono Well
- Any other class skills, relics, enemy effects, or blessings that apply control effects

## 5. Implementation order

1. Inspect and map every existing freeze, stun, and slow application.
2. Implement a centralized hard-CC application function and per-enemy diminishing-returns tracking.
3. Route every hard-CC source through that function.
4. Apply enemy-type resistance profiles for normal, elite, and boss enemies.
5. Tune Rimefrost Shard to the proposed values.
6. Verify that soft CC remains separate and does not increase hard-CC diminishing returns.
7. Test solo and four-player encounters, especially boss fights and repeated CC chains.

## 6. Testing and acceptance criteria

- Repeated freeze/stun effects cannot permanently lock an enemy or boss.
- The diminishing-returns stage resets after the target has gone 8 seconds without hard CC.
- Slow effects do not consume hard-CC diminishing-return stages.
- All hard-CC sources use the same system; no relic or skill bypasses it.
- Bosses can still be interrupted by coordinated players.
- Bosses remain able to perform their mechanics between CC windows.
- Normal enemies still feel responsive to crowd control.
- No negative-duration, stuck-state, or stale-immunity bugs occur when enemies die, despawn, change floors, or are reused.
- Multiplayer behavior is consistent for all players and is authoritative on the server.

## Design principle

**Reward coordination, not permanent lockdown.** Crowd control should create tactical openings and help teams manage dangerous enemies, while bosses remain active threats.
