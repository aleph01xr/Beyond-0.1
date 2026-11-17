# Arcanist Tactical Skill & Spell Scroll System (`ARCANIST_SCROLLS.md`)

**Status:** Implemented — the 7 Spell Scrolls replace `[Q / RMB]` (`Astral Nova`) via run-scoped RNG acquisition

---

## 1. Default Tactical Skill (`Astral Nova`)

- **Trigger**: `[Q]` / `RMB` / Touch Tactical button (`action: 'tactical'`) when `equippedScrollId` is null.
- **Behavior**: 8-way radial burst of `'arcane'` projectiles (`24` base damage, `pierce: 2`, `5000ms` base cooldown).
- **Scaling**: Uses independent Tactical scaling (`computeDamageMult(p, 'arcane')` — 0.8% INT scaling).

---

## 2. Spell Scroll Rules (Strict Separation)

1. **System Boundary**: Scrolls are **never** stored in `p.relics`, `RELIC_CATALOG`, `p.storage` (Vault), or `gold`/`potions`.
2. **Slot Discipline**: An Arcanist holds at most one active `equippedScrollId` for the current dungeon run, replacing `Astral Nova` on `[Q / RMB]` cleanly (and resets to `null` on new run or class change). Standard hotkeys (`[1]`/`[H]` Potion, `[Q]`/`RMB` Tactical Scroll, `[R]`/`Shift` Chrono Well) remain unified across all classes.
3. **Acquisition**: When an Arcanist opens chests (30% chance if unequipped), Relic Vault chests (100% if unequipped else 45%), or clears a Guardian/Boss room, an RNG roll (`pendingScrollChoices` of 3 distinct Spell Scrolls excluding any already equipped Scroll) is offered via `player:select_scroll`.
4. **Chrono Well Projectile Rule**: Any projectiles spawned by Spell Scrolls inside a `Chrono Well` (including the **caster's own** projectiles) freeze inside the well until time resumes; only the **caster's player entity** remains free to move, aim, and cast.

---

## 3. Spell Scroll Roster (`ARCANIST_SCROLLS`)

| Scroll ID | Scroll Name | Role | Base Dmg `B` | INT Coeff `c` | Base CD | Timing & Mechanics |
|---|---|---|---:|---:|---:|---|
| *(none)* | Default Tactical (`Astral Nova`) | Radial Burst | `24` | `0.8%` | `5.0s` | 8 radial arcane bolts (`pierce: 2`) |
| `fireball` | Scroll of Fireball | Burst / AoE | `42` | `1.0%` | `6.0s` | `0.35s` cast; straight fireball (`360u`), `90u` AoE explosion, no burn |
| `disintegration` | Scroll of Disintegration | Sustained Beam | `10`/tick | `0.8%` | `12.0s` (post-end) | Hold `[Q / RMB]`; `0.15s` windup, `0.2s` ticks, `42u` width, `450u` wall-clipped, stationary, `180°/s` turn cap |
| `frost_lance` | Scroll of Frost Lance (Ice Lance) | Precision / Piercing | `36` | `1.2%` | `4.5s` | `0.20s` cast; straight lance (`420u`), `3` pierce, no homing/freeze |
| `chain_lightning` | Scroll of Chain Lightning | Multi-Target Arc | `32` | `1.0%` | `7.0s` | Instant; up to `4` targets within `150u` jump range, `-15%` damage/jump, no repeats |
| `arcane_meteor` | Scroll of Arcane Meteor | Heavy AoE Burst | `75` | `1.3%` | `11.0s` | `0.50s` cast + `1.0s` impact delay; `125u` AoE burst, no burn DoT |
| `arcane_orb` | Scroll of Arcane Orb | Persistent Pressure | `12`/hit | `0.7%` | `9.0s` | `4.0s` slow sphere; hits every `0.5s`, max `2` hits/enemy, persists through enemies |
| `arcane_barrage` | Scroll of Arcane Barrage | Multi-Projectile Helix | `12`/bolt | `0.45%` | `8.0s` | `6` alternating helix bolts up to `450u`; independent hits, no homing |
