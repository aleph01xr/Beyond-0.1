# Arcanist Class Design & Repository Audit (`ARCANIST_DESIGN.md`)

**Status:** Implemented and aligned with Spell Scroll `[Q / RMB]` Tactical replacement & Chrono Well full-projectile suspension  
**Target Class:** Arcanist (`HERO_CLASSES.arcanist`)

---

## 1. Control & Ability Layout (Unified Across All Classes)

Beyond uses consistent controls across all four hero classes (`[1]` / `[H]` Healing Flask, `[Q / RMB]` Tactical Skill, `[R / Shift]` Ultimate, `[C / F / V]` Dash, `[LMB / Space]` Primary Attack):

- **Primary Attack (`LMB` / `Space`)**: Fires an `'arcane'` bolt (`style: 'arcane'`, `pierce: 2`) and spawns a `star_rift` zone on every 4th primary attack.
- **Starting Tactical Skill (`[Q]` / `RMB` — `Astral Nova`)**: 8-way radial burst of `'arcane'` projectiles (`24 * computeDamageMult`, `pierce: 2`, `5000ms` base cooldown).
- **Spell Scrolls (Replacing `[Q / RMB]` via Dungeon RNG)**:
  - There is **no** separate `[1-7]` spellbook hotbar. Instead, Scrolls found inside the dungeon ARE the 7 offensive Arcanist spells (`Scroll of Fireball`, `Scroll of Disintegration`, `Scroll of Frost Lance`, `Scroll of Chain Lightning`, `Scroll of Arcane Meteor`, `Scroll of Arcane Orb`, `Scroll of Arcane Barrage`).
  - Inscribing a Scroll (`player:select_scroll`) replaces `Astral Nova` on `[Q / RMB]` (`equippedScrollId`) and sets `skillCooldownMs` / `maxSkillCooldownMs` to that spell's CDR-adjusted cooldown.
- **Cooperative Ultimate (`[R]` / `Shift` — `Chrono Well`)**:
  - Server-authoritative 3-second localized time suspension (`45s` base cooldown, `115u` radius, `220u` cast range).
  - Suspends ordinary enemies, elites, **bosses** (bypassing boss CC immunity), allied players (exempting caster player entity), **ALL projectiles** inside the well (enemy, allied, and caster's own projectiles), and enemy/offensive AoE hazard zones while preserving exact execution state and cleanly resuming on expiry or caster disconnect.

---

## 2. System Separation Guarantees

| System | Storage & Lifecycle | Interaction Boundary |
|---|---|---|
| Offensive Spell Scrolls | `ARCANIST_SPELLS` / `ARCANIST_SCROLLS` (`equippedScrollId` on `[Q / RMB]`), cooldown in `skillCooldownMs` | Uses `D = B * [1 + 0.025*(L-1)] * [1 + c*INT]` (applied once); `Astral Nova` fallback keeps tactical `computeDamageMult` |
| Scroll Drafting | Run-scoped `equippedScrollId` + `pendingScrollChoices` | Cleared on run reset / class change; NEVER added to `relics` or `storage` |
| Relics | `RELIC_CATALOG`, `p.relics`, permanent `p.storage` | Passive bonuses & procs (`sunfire_signet`, `hourglass_shard`, `cinder_heart`, etc.) |
| Dungeon Loot | `gold`, `potions` | Consumable/currency drops only |
