# Arcanist Spell Balance & Damage Scaling (`ARCANIST_SPELL_BALANCE.md`)

**Status:** Implemented & verified against single-application INT scaling and regression baselines

---

## 1. Damage Pipeline Audit (Existing vs Spell Formula)

- **Default Primary / Tactical Pipeline (`computeDamageMult` in `src/server/gameEngine.ts` & `src/shared/statUtils.ts`)**:
  - `L = Math.max(1, Math.min(MAX_LEVEL, p.level || 1))` (capped at Level 50).
  - `levelMult = 1 + 0.025 * (L - 1)` (+2.5% per level above 1; e.g., Lv 50 = `2.225x`).
  - `attrMult = 1 + 0.008 * INT` (+0.8% per INT for Arcane; e.g., 100 INT = `1.80x`).
  - Optional Relic/Blessing multipliers: `sunfire_signet` (`* 1.12`), `fury` blessing (`* (1 + furyStacks * 0.06)`).
  - Downstream `damageEnemy(enemy, rawAmount, attacker, isCrit, category)` applies enemy resistance (`arcane` / `fire` / `frost` / `lightning`), `markedMs` (`1.35x`), Sanctum Wards, Malakor Shield Wall, and Oriphiel Parry—**never** re-applying `computeDamageMult`.

- **Primary Attack & Star Rift Baseline**:
  - `HERO_CLASSES.arcanist.damage = 24` (`420ms` attack cooldown, `185` range, `pierce: 2`).
  - **Star Rift Proc Rule**: Every 4th primary attack attempts to spawn a `star_rift` zone (`75u` radius, `3000ms` duration). A Star Rift spawns only when 4 primary attacks have completed **and** the independent `8000ms` `starRiftCooldownMs` has expired. The 4-hit counter resets after every proc attempt (so attacks during cooldown do not stockpile an instant burst), and the `8000ms` cooldown starts only when a Rift successfully spawns.

- **Spell Scroll Damage Formula**:
  `D = B * [1 + 0.025 * (L - 1)] * [1 + c * INT]`
  - Applied **exactly once** via `computeArcanistSpellDamage(baseDamage, player, intCoeff)`.
  - When Relic/Blessing modifiers (`sunfire_signet`, `fury`) are present, they multiply `D` once without re-applying `INT` or `Level`.
  - Critical hits apply `CRIT_DAMAGE_MULTIPLIER` (`1.25x`) up to the 45% crit cap on hit spells (`Fireball`, `Frost Lance`, `Chain Lightning`, `Arcane Meteor`, `Arcane Orb`, `Arcane Barrage`); `Disintegration` beam ticks remain steady non-crit ticks (`5/sec`) to avoid RNG DPS spikes.
  - Cooldown Reduction (`cdrMult = max(0.50, 1 - (min(0.20, INT*0.002) + hourglass_0.25 + swiftness_0.08*stacks))`) scales `[Q / RMB]` `skillCooldownMs` consistently with Beyond's 50% CDR cap (with `cdrMult = 1.0` at 0 INT / no Hourglass).

---

## 2. Seven Spell Scrolls Replacing `[Q / RMB]` (`ARCANIST_SPELLS`)

| # | Spell Scroll ID | Name | Base `B` | INT Coeff `c` | Cooldown | Cast / Timing | Key Mechanics | Damage Category |
|---|---|---|---:|---:|---:|---|---|---|
| 1 | `fireball` | Scroll of Fireball | 42 | 1.5% (`0.015`) | 6.0s | 0.35s cast | Enlarged bolt (`r=14`, `380 px/s`, `360u` range), explodes immediately on contact/wall/max-range (`105u` AoE) & leaves a `3.5s` burning area (`88u`, `22%` per `0.5s`) | `fire` |
| 2 | `disintegration` | Scroll of Disintegration | 10 / tick | 1.2% (`0.012`) | 12.0s (post-end) | 0.15s activation + 0.2s ticks | Hold `[Q / RMB]` to channel, movement disabled, max rot `180 deg/s`, `42u` width, `450u` wall-clipped; stops on release/CC/death | `arcane` |
| 3 | `frost_lance` | Scroll of Frost Lance | 36 | 1.8% (`0.018`) | 4.5s | 0.20s cast | Straight line (`480 px/s`, `420u` range), pierces up to 3 enemies, no homing, no freeze/stun | `frost` |
| 4 | `chain_lightning` | Scroll of Chain Lightning | 32 | 1.5% (`0.015`) | 7.0s | Instant | Forward cone-shaped discharge (`340u` range, `±0.56 rad` arc), shocks all LoS foes inside the cone | `lightning` |
| 5 | `arcane_meteor` | Scroll of Arcane Meteor | 75 | 1.95% (`0.0195`) | 11.0s | 0.50s cast + 1.0s impact delay | Ground telegraph (`<= 280u` cast range), `125u` AoE burst on impact, no lingering DoT | `arcane` |
| 6 | `arcane_orb` | Scroll of Arcane Orb | 12 / hit | 1.05% (`0.0105`) | 9.0s | Instant (`4.0s` duration) | Slow sphere (`115 px/s`), persists through enemies, max 2 hits/enemy at `>= 0.5s` interval; suspends in Chrono Well | `arcane` |
| 7 | `arcane_barrage` | Scroll of Arcane Barrage | 12 / bolt | 0.675% (`0.00675`) | 8.0s | Instant (`4` waves) | 4 rapid staggered waves (`95ms` apart, `2` bolts/wave = `8` bolts, `420 px/s`, `450u` range) with soft-seeking focus bolts reliably landing 3–4+ hits | `arcane` |
