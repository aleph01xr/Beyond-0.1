# Beyond Armament Overhaul — Full Implementation Plan

**Repository:** `aleph01xr/Beyond-Dungeons`  
**Target branch:** `main`  
**Scope:** 12 Weapons + 12 Vestments across Vanguard, Ranger, Arcanist, and Cleric  
**Status:** Design/implementation specification — not yet implemented

---

## 1. Goals

The armament overhaul changes how each class plays instead of relying mainly on generic stat modifiers.

- **Weapons** change the player's Basic Attack behavior and, where specified, the Tactical Skill.
- **Vestments** replace the class's default passive with the Vestment's own passive.
- Weapons and Vestments remain class-specific.
- The Arcanist Scroll System remains separate. Scrolls continue to determine/replace the Arcanist Tactical Skill.
- Shield bonuses and Shield-focused item mechanics are reserved for Vanguard. Ranger, Arcanist, and Cleric Vestments must not grant Shield capacity or starting Shield.
- All combat effects must be authoritative on the server. The client displays effects and UI but must not decide damage, healing, cooldown reduction, or passive triggers.

## 2. Current repository baseline

The existing implementation was inspected in:

- `src/shared/armaments.ts`
- `src/shared/types.ts`
- `src/server/gameEngine.ts`
- `src/components/CharacterInventoryModal.tsx`
- `src/components/GameCanvas.tsx`

Current architecture already includes:

- `WeaponDef`, `VestmentDef`, `WeaponModifiers`, and `VestmentModifiers` in `src/shared/armaments.ts`.
- `WEAPON_CATALOG` and `VESTMENT_CATALOG` in the same file.
- Equipped weapon and Vestment IDs in player/account state.
- `player:equip_armament` and `player:unequip_armament` client messages.
- Armament inventory/equip UI in `CharacterInventoryModal.tsx`.
- Weapon-aware projectile presentation in `GameCanvas.tsx`.
- Existing class passive behavior in the server game engine.

**Important:** The current catalog still contains older modifier/effect definitions. Do not assume that the new designs below are already implemented. Before changing code, trace each existing passive and weapon effect from its catalog entry through the server combat code and UI. Reuse working systems where possible; remove or replace obsolete behavior rather than stacking old and new mechanics unintentionally.

---

## 3. Design rules and shared behavior

### 3.1 Equipment and passive replacement

1. A player has one equipped Weapon and one equipped Vestment.
2. A Vestment's passive is the active class passive while that Vestment is equipped.
3. The class's default passive is active when its default Vestment is equipped.
4. Equipping a non-default Vestment disables the default passive completely; it must not continue running in the background.
5. Unequipping a Vestment should follow the game's existing equipment fallback rules. Prefer restoring the class default Vestment and its passive rather than leaving the player without a passive.
6. Switching Vestments must clear or safely reinitialize passive-specific temporary state (Heat, Momentum, Void Energy, Grace, etc.). No stored state should leak between Vestments.
7. Passive state must be initialized on join, reconnect, room restart, class change, and equipment change.

### 3.2 Server authority

- Server calculates hit confirmation, damage, critical hits, status effects, healing, lifesteal, cooldown reduction, passive meters, and resets.
- Client receives replicated state and renders bars, marks, particles, floating text, and animations.
- Do not trust client-sent damage, Heat, Momentum, Void Energy, target marks, or cooldown values.
- Ensure co-op effects are applied once per valid event and cannot be duplicated by reconnects or repeated input packets.

### 3.3 Shared tuning and safety limits

Put new tunable values in one clear configuration location rather than scattering magic numbers across combat code.

At minimum, define configuration for:

- Meter caps, gain per hit, decay/reset behavior, and damage bonuses.
- Lifesteal percentages and eligible damage categories.
- Mark duration and target-switch behavior.
- Healing storage caps and release rules.
- Cooldown reduction per hit and any per-tick/per-target limits.
- AoE radius, damage ratio, and target limits.
- Boss-specific scaling or caps where required.

Do not add unapproved extra mechanics or drawbacks. If a value is not specified in this document, expose it as a tuning constant and leave a clearly marked initial placeholder for balance testing.

---

## 4. Weapon implementation specification

### 4.1 Vanguard weapons

| Weapon | Rarity | Basic Attack | Tactical Skill | Implementation notes |
|---|---|---|---|---|
| **Sunforged Claymore** | Standard | Broad greatsword swing. While Shield is above zero, the Basic Attack also releases a short-range golden shockwave. | Existing Tactical initially; a counter skill called **Bastion Counter** is a proposed redesign, not a finalized requirement. | Preserve Vanguard's Shield identity. Shockwave should only trigger from a confirmed primary hit/attack event and must not recursively trigger itself. |
| **Crimson War Halberd & Buckler** | Forged | Long-reaching halberd swing that can pierce enemies. | Existing Tactical initially; **Impaling Charge** is a proposed redesign. | Implement reach/pierce as a distinct attack profile. Avoid applying the same hit more than once during a single swing. |
| **Stormbreaker Flail & Bastion Wall** | Ascendant | **Tempest Wheel:** circular flail attack around the player. | Existing Tactical initially; **Thunderfall** is a proposed redesign. | The circular attack needs a defined radius, hit cadence, and per-swing hit registry. Shockwave/chain effects must not recursively chain. |

### 4.2 Ranger weapons

| Weapon | Rarity | Basic Attack | Tactical Skill | Implementation notes |
|---|---|---|---|---|
| **Ashwood Recurve** | Standard | Keep the current/default Ranger Basic Attack feel, including its established attack speed and critical behavior. | Keep the existing Tactical Skill. | Do not replace the default attack with a new mechanic. Verify its current Longshot and impaired-target behavior before preserving/removing old modifiers. |
| **Galewind Twinbow & Split Quiver** | Forged | Every confirmed Basic Attack hit applies a **Galeburst** stack/mark. On every third hit, the target triggers an air burst that damages nearby enemies. | Existing Tactical initially; **Cyclone Break** is a proposed redesign. | Use a deterministic hit counter, not RNG. Define whether the counter is per target or global before implementation; recommended starting behavior is per target so target switching cannot instantly complete another enemy's sequence. Avoid retaining the old tandem follow-up arrow behavior unless explicitly requested. |
| **Eclipse Siege Longbow & Bodkins** | Ascendant | Hold Basic Attack to charge. Longer charge increases arrow damage; quick taps produce weaker shots. Damage scaling uses **INT**, not Ranger DEX. | Existing Tactical initially; **Black Sun** is a proposed redesign. | Implement charge start/hold/release with server-validated duration. Set minimum/maximum charge time and damage curve in config. Prevent charge state persisting after death, disconnect, weapon swap, or interruption. |

**Ranger balance note:** The Galewind design discussion included reducing DEX scaling and attack speed to balance its third-hit AoE. Treat exact scaling/cadence numbers as pending tuning, not finalized values.

### 4.3 Arcanist weapons

| Weapon | Rarity | Basic Attack | Tactical Skill / additional mechanic | Implementation notes |
|---|---|---|---|---|
| **Runebound Spire** | Standard | Keep the current/default cosmic Basic Attack unchanged. | Tactical remains controlled by the equipped Scroll. | Do not invent a new default weapon attack. Preserve Scroll compatibility. |
| **Cinderflare Catalyst & Ember Crown** | Forged | Every successful Basic Attack hit creates an AoE fire explosion at the hit enemy/impact location. | Tactical remains controlled by the equipped Scroll. | AoE should be tied to the confirmed primary hit. Prevent the splash from recursively spawning another splash. Configure radius and damage ratio. |
| **Chronostar Scepter & Twin Orbs** | Ascendant | Keep its seeking cosmic-orb identity, subject to replacing obsolete values/behavior where required. | Every confirmed Basic Attack hit reduces Tactical cooldown by **150ms** and Ultimate cooldown by **300ms**. Tactical still comes from Scrolls. | Replace the old catalog values of 300ms Tactical / 400ms Ultimate with the approved 150ms / 300ms values. Add cooldown floors and ensure one projectile hit only grants reduction once. |

### 4.4 Cleric weapons

| Weapon | Rarity | Basic Attack | Tactical Skill | Implementation notes |
|---|---|---|---|---|
| **Dawnstar Mace & Reliquary** | Standard | Keep the existing radiant Smite identity. | Keep the existing Tactical Skill. | Defensive/sustain identity. Review existing Shield-on-hit behavior: the class-wide design rule reserves Shield bonuses for Vanguard, so remove Shield generation from Cleric weapon effects. |
| **Solaris War-Censer & Thurible** | Forged | On a confirmed hit, heal the lowest-HP eligible nearby ally. | Keep the existing Tactical Skill. | Preserve the lowest-HP nearby ally targeting rule. Add a clear range and healing amount/cooldown policy; avoid healing the Cleric if the design intends ally-only healing. |
| **Seraphim Judgment Crozier & Sun-Relic** | Ascendant | Keep existing Basic Attack behavior; do not turn it into a faster Ranger-like attack. | Tactical becomes a powerful targeted AoE holy burst focused on immediate damage, not healing. | Replace the old party damage-brand/Shield-oriented design where it conflicts with the approved burst identity. Define radius, damage scaling, targeting indicator, and cooldown before implementation. |

**Tactical-skill scope clarification:** Only the Tactical changes explicitly specified as approved in the design are required. The Vanguard and Ranger Tactical names/ideas above are proposals. Unless separately approved, Gemini should leave those existing Tactical Skills unchanged rather than implementing speculative redesigns.

---

## 5. Vestment implementation specification

Vestments replace the class passive. The passive listed below is the only class passive that should run while the corresponding Vestment is equipped.

### 5.1 Vanguard Vestments

| Vestment | Rarity | Passive | Proposed stat bonuses |
|---|---|---|---|
| **Ironcrest Bastion Plate** | Standard | **Iron Will** — retain the existing Vanguard passive exactly as implemented, after verifying its actual current behavior. | +10 Max Shield, +5 Starting Shield, +4% Elemental Resistance |
| **Obsidian Juggernaut Harness** | Forged | **War Monger** — above 30% HP, Lifesteal is low; at or below 30% HP, Lifesteal becomes **50%**. No cooldown. | +25 Max HP, +8% Physical Resistance, -5% Movement Speed |
| **Sovereign Aegis Warplate** | Ascendant | **Heat** — display a Heat bar beside the player. Confirmed Basic Attack hits build Heat; higher Heat increases damage. Heat resets when the player is no longer attacking. | +15 Max HP, +5% Attack Speed, +5% Physical Resistance |

**War Monger implementation requirement:** The 50% value is the Lifesteal percentage of eligible damage dealt, not 50% of maximum HP. Define the low Lifesteal value above 30% HP as a balance constant because no exact percentage has been approved. Prevent healing from exceeding missing HP. Test multi-target AoE and damage-over-time interactions to prevent unintended repeated healing.

**Heat implementation requirement:** Define the Heat cap, Heat gained per confirmed hit, damage bonus at cap, and what qualifies as “no longer attacking.” Recommended interpretation: Heat is maintained only while the Vanguard continues landing Basic Attack hits; after a short configurable grace period without a confirmed hit, reset it. This avoids a bar that remains full indefinitely while the player merely holds the attack button.

### 5.2 Ranger Vestments

| Vestment | Rarity | Passive | Proposed stat bonuses |
|---|---|---|---|
| **Thornwood Stalker Brigandine** | Standard | **Eagle Keenness** — retain the existing Ranger passive exactly as implemented, after verifying its actual current behavior. | +5% Movement Speed, +4% Elemental Resistance, +5 Max HP |
| **Windrunner Mistcloak** | Forged | **Momentum** — continuous movement builds Momentum; higher Momentum increases attack speed. Standing still or being hit resets Momentum. | +10% Movement Speed, +5% Attack Speed, +10 Max HP |
| **Briarheart Sentinel Hauberk** | Ascendant | **Predator's Instinct** — repeatedly attacking the same target increases damage against that target. Switching targets or stopping attacks resets the mark. | +20 Max HP, +6% Physical Resistance, +5% Critical Chance |

**Momentum implementation requirement:** Define movement threshold, charge duration, Momentum cap, and attack-speed bonus. Use actual server-side player movement rather than client joystick input. Clarify whether being hit resets all Momentum immediately (current design says yes).

**Predator's Instinct implementation requirement:** Store the marked target ID and mark stacks/value per player. A target switch or attack inactivity resets the mark. Ensure the bonus applies only to the marked target and cannot persist after that target dies or leaves the room.

### 5.3 Arcanist Vestments

| Vestment | Rarity | Passive | Proposed stat bonuses |
|---|---|---|---|
| **Spireweaver Astral Vestments** | Standard | **Astral Resonance** — retain the existing Arcanist passive exactly as implemented, after verifying its actual current behavior. | +5% Elemental Resistance, +5 Max HP, +3% Cooldown Reduction |
| **Chronomancer Silk Shroud** | Forged | **Temporal Acceleration** — Basic Attack hits reduce Tactical cooldown; Tactical hits reduce Ultimate cooldown. | +8% Cooldown Reduction, +5% Movement Speed, +10 Max HP |
| **Voidward Battlemage Robes** | Ascendant | **Void Consumption** — Basic Attack hits build Void Energy. At maximum energy, the next Tactical Skill consumes the energy to increase that skill's damage. | +25 Max HP, +8% Elemental Resistance, +5% Cooldown Reduction |

**Temporal Acceleration implementation requirement:** This is separate from Chronostar's weapon passive. If both are equipped, their reductions may stack, but all reductions must respect cooldown floors and one-trigger-per-hit rules. Do not accidentally apply the passive to every projectile frame or repeated collision tick.

**Void Consumption implementation requirement:** Define energy gained per confirmed Basic Attack hit, maximum energy, and the damage bonus per energy/full meter. Consume energy only when a valid Tactical Skill actually activates. If the skill is interrupted or cannot cast, do not consume energy. Because Arcanist Tactical Skills come from Scrolls, the effect must work with every supported Scroll and must not overwrite or bypass Scroll behavior.

### 5.4 Cleric Vestments

| Vestment | Rarity | Passive | Proposed stat bonuses |
|---|---|---|---|
| **Sunbrand Prelate Raiment** | Standard | **Radiant Aura** — retain the existing Cleric passive exactly as implemented, after verifying its actual current behavior. | +5% Healing Power, +5 Max HP, +3% Physical Resistance |
| **Hallowed Martyr Surplice** | Forged | **Shared Grace** — healing an ally stores a portion of that healing as Grace. When an ally becomes injured, stored Grace automatically releases healing to them. | +15% Healing Power, +15 Max HP, +5% Cooldown Reduction |
| **Arch-Templar Sanctum Plate** | Ascendant | **Sacred Retribution** — healing an ally builds Sanctity. At maximum Sanctity, the next Basic Attack releases a holy shockwave that damages nearby enemies and heals nearby allies. | +25 Max HP, +8% Physical Resistance, +8% Elemental Resistance |

**Shared Grace implementation requirement:** Define the percentage of healing stored, maximum Grace capacity, release trigger/threshold, and whether stored Grace is consumed proportionally or all at once. Prevent overhealing from creating stored Grace unless explicitly intended. Grace must be owned by the Cleric who generated it and cleared safely when they leave the run.

**Sacred Retribution implementation requirement:** Define Sanctity gained per effective ally heal, maximum Sanctity, shockwave radius, enemy damage, and ally healing. Avoid generating Sanctity from the shockwave's own healing, which could create an infinite loop. The empowered Basic Attack should consume Sanctity exactly once.

---

## 6. Stat and class identity rules

### 6.1 Proposed stat table

All values below are the current design proposal and must be centralized in the Vestment catalog/config.

| Class | Vestment | Max HP | Max Shield | Starting Shield | Other bonuses |
|---|---|---:|---:|---:|---|
| Vanguard | Ironcrest | — | +10 | +5 | +4% Elemental Resistance |
| Vanguard | Obsidian | +25 | — | — | +8% Physical Resistance, -5% Movement Speed |
| Vanguard | Sovereign | +15 | — | — | +5% Attack Speed, +5% Physical Resistance |
| Ranger | Thornwood | +5 | **0** | **0** | +5% Movement Speed, +4% Elemental Resistance |
| Ranger | Windrunner | +10 | **0** | **0** | +10% Movement Speed, +5% Attack Speed |
| Ranger | Briarheart | +20 | **0** | **0** | +6% Physical Resistance, +5% Critical Chance |
| Arcanist | Spireweaver | +5 | **0** | **0** | +5% Elemental Resistance, +3% Cooldown Reduction |
| Arcanist | Chronomancer | +10 | **0** | **0** | +8% Cooldown Reduction, +5% Movement Speed |
| Arcanist | Voidward | +25 | **0** | **0** | +8% Elemental Resistance, +5% Cooldown Reduction |
| Cleric | Sunbrand | +5 | **0** | **0** | +5% Healing Power, +3% Physical Resistance |
| Cleric | Hallowed Martyr | +15 | **0** | **0** | +15% Healing Power, +5% Cooldown Reduction |
| Cleric | Arch-Templar | +25 | **0** | **0** | +8% Physical Resistance, +8% Elemental Resistance |

### 6.2 Shield exclusivity audit

Remove Shield-related Vestment modifiers from every Ranger, Arcanist, and Cleric item. Also audit their Weapons for Shield-on-hit or Shield-granting effects. The current repository contains older Cleric weapon Shield effects, which conflict with the new class identity rule and must be removed unless the design owner explicitly changes this rule.

Do not globally remove Shield from the game: Vanguard and any existing universal systems that are intentionally class-neutral must be reviewed separately.

---

## 7. Data model and code organization

Use the existing armament definitions where possible, but avoid turning `armaments.ts` into a large collection of runtime logic.

### 7.1 Catalog definitions

In `src/shared/armaments.ts`:

- Update all 12 `WEAPON_CATALOG` entries to describe the new approved Basic Attack mechanics and modifiers.
- Update all 12 `VESTMENT_CATALOG` entries with their new passive descriptions and stat bonuses.
- Remove obsolete effect lines/modifiers that would cause old and new mechanics to run together.
- Add typed identifiers for weapon mechanics and Vestment passive types if needed.
- Keep catalog data declarative: IDs, names, rarity, descriptions, display metadata, and tuning references. Put actual combat execution in server systems.

### 7.2 Runtime state

In `src/shared/types.ts`, add optional or required typed state fields only for mechanics that need persistent state, such as:

- Vanguard Heat meter and last successful attack time.
- Ranger Momentum meter and movement/interrupt state.
- Ranger Predator target ID, stacks/value, and last hit time.
- Arcanist Void Energy meter.
- Cleric stored Grace.
- Cleric Sanctity meter.
- Ranger charged-shot state if it must be represented in snapshots.
- Galewind per-target hit counters if the counter persists across attacks.

Keep transient internal timers server-side where they do not need to be exposed to the client. Add state to the snapshot only when the UI needs it.

### 7.3 Server combat services

In `src/server/gameEngine.ts` (or extracted modules if the file is too large), create clear helpers for:

- Resolve currently equipped Weapon/Vestment for a player.
- Resolve the active Vestment passive.
- Handle confirmed Basic Attack hits.
- Handle Tactical Skill activation and confirmed hits.
- Apply weapon-specific secondary effects.
- Apply Vestment passive triggers.
- Apply stat modifiers consistently.
- Reset passive state when equipment/class/room state changes.

Avoid duplicating hit detection logic across every weapon. Prefer a shared confirmed-hit pipeline that invokes the relevant weapon and passive handlers once.

### 7.4 Client UI and presentation

Relevant existing locations include:

- `src/components/CharacterInventoryModal.tsx`
- `src/components/GameCanvas.tsx`

Implement:

- Updated item names, descriptions, rarity, stat lines, and passive explanations in inventory.
- Clear indication of the currently equipped Weapon and Vestment.
- A Heat bar for Sovereign.
- A Momentum meter for Windrunner.
- A Void Energy meter for Voidward.
- A Grace indicator for Hallowed Martyr if useful to communicate stored healing.
- A Sanctity meter for Arch-Templar.
- Charge feedback for Eclipse Longbow.
- Galeburst mark/third-hit burst feedback.
- Distinct visual feedback for Cinderflare, Tempest Wheel, and Cleric shockwave.

UI must read server-replicated state. Do not locally predict authoritative damage or passive resource values in a way that can disagree with the server.

---

## 8. Recommended implementation phases

Implement in small, testable phases. Do not ask Gemini to rewrite all armaments and combat systems in one pass.

### Phase 0 — Audit and baseline

- Trace current weapon modifiers from catalog to server attack logic.
- Trace all four class passives and identify every location where they execute.
- Trace equipment equip/unequip, account persistence, class changes, reconnects, and room restarts.
- Trace inventory UI and snapshot serialization.
- Identify old weapon effects that conflict with the new designs.
- Record a baseline of current attack damage, attack cadence, cooldowns, healing, Shield, and resistance behavior.
- Run existing tests and save the results before modifying code.

**Deliverable:** A short audit report listing exact functions/files to change and any existing behavior that must be preserved.

### Phase 1 — Catalog and passive selection foundation

- Update catalog descriptions and proposed stats.
- Add a single reliable active-passive resolver based on equipped Vestment.
- Ensure default Vestments activate the existing class passives.
- Ensure non-default Vestments fully replace those passives.
- Add equipment-change initialization/reset handling.
- Add tests for all four classes and all six equipment transition cases: default -> alternate, alternate -> default, alternate -> alternate, reconnect, class change, and room restart.

**Do not begin all new passive effects until replacement behavior is verified.**

### Phase 2 — Stat modifiers and class restrictions

- Apply Max HP, resistance, movement speed, attack speed, CDR, Healing Power, and Critical Chance from equipped Vestments.
- Enforce Shield exclusivity for Vanguard Vestments.
- Remove old Shield-granting effects from Cleric Weapons.
- Verify stat modifiers apply exactly once and are removed when swapping equipment.
- Verify HP is clamped/updated correctly when Max HP changes.

### Phase 3 — Weapon Basic Attack mechanics

Suggested order:

1. Vanguard: Sunforged Shield shockwave, Crimson reach/pierce, Stormbreaker circular attack.
2. Ranger: Galewind third-hit Galeburst, Eclipse charge shot, preserve Ashwood default.
3. Arcanist: Cinderflare AoE, Chronostar cooldown siphon, preserve Runebound default.
4. Cleric: Solaris lowest-HP ally heal, Seraphim Tactical work can be handled in Phase 4, Dawnstar Shield effect removal.

After each weapon, test hit registration, multi-target behavior, damage, status effects, visual effects, and multiplayer consistency.

### Phase 4 — Tactical Skill changes

- Implement only Tactical redesigns explicitly approved by the design owner.
- Keep unapproved Vanguard/Ranger proposals unchanged.
- Implement Cleric Seraphim targeted AoE holy burst once its damage/radius/cooldown/scaling values are confirmed.
- Preserve Arcanist Scroll selection and execution. Weapon/Vestment mechanics may modify a Scroll's result but must never replace the Scroll system.
- Test every Arcanist Scroll with Void Consumption and Chronomancer/Chronostar cooldown reduction.

### Phase 5 — Vestment passives

Suggested order:

1. Vanguard: Heat, War Monger; verify Iron Will remains intact.
2. Ranger: Momentum, Predator's Instinct; verify Eagle Keenness remains intact.
3. Arcanist: Temporal Acceleration, Void Consumption; verify Astral Resonance remains intact.
4. Cleric: Shared Grace, Sacred Retribution; verify Radiant Aura remains intact.

Implement one passive at a time. For each, add server state, trigger/reset rules, snapshot fields if needed, UI, and tests before moving on.

### Phase 6 — UI, effects, and feedback

- Update inventory descriptions and stat displays.
- Add meter/bar UI and icons.
- Add hit effects, AoE visuals, marks, charge indicators, and floating feedback.
- Verify visual effects do not create gameplay state or duplicate damage.
- Check mobile and desktop layouts.

### Phase 7 — Balance and regression

- Run solo and multiplayer tests.
- Test all 12 Weapons and all 12 Vestments.
- Test equipment swaps during a run and between runs.
- Test disconnect/reconnect and player death/revive.
- Test bosses and groups of enemies.
- Test high attack speed, critical hits, pierce, AoE, damage-over-time, and multiple allies.
- Check performance with multiple players using effects simultaneously.
- Update regression tests and run the full test suite.

---

## 9. Required test matrix

| Area | Test | Expected result |
|---|---|---|
| Passive replacement | Equip alternate Vestment | Default passive stops; alternate passive starts |
| Passive restoration | Equip default Vestment | Original class passive resumes once |
| Equipment swap | Swap between two alternate Vestments | Old passive state clears; new passive initializes |
| Persistence | Reconnect with saved equipment | Correct Weapon, Vestment, stats, and passive restore |
| Class restriction | Attempt to equip another class's item | Server rejects it |
| Shield exclusivity | Ranger/Arcanist/Cleric Vestment equipped | No Shield cap or starting Shield bonus from that Vestment |
| Weapon hit registration | Multi-target attack | Each enemy is hit at most as intended; no duplicate triggers |
| Galewind | Three confirmed hits | Third hit triggers one Galeburst AoE |
| Eclipse | Tap vs fully charge | Fully charged shot deals more damage; charge cannot persist through invalid states |
| Cinderflare | Basic Attack hits enemy | One fire AoE occurs; splash does not recursively explode |
| Chronostar | Basic Attack hits enemy | Tactical -150ms and Ultimate -300ms, once per hit |
| War Monger | HP crosses 30% boundary | Lifesteal changes to correct tier; healing never exceeds missing HP |
| Heat | Keep hitting, then stop | Heat builds during hits and resets after configured inactivity |
| Momentum | Move, stop, get hit | Meter/attack-speed bonus behaves according to rules |
| Predator's Instinct | Focus one target, then switch | Bonus builds on one target and resets on target switch |
| Void Consumption | Fill energy and cast Scroll Tactical | Energy empowers the cast and is consumed once |
| Shared Grace | Heal allies, then ally becomes injured | Stored Grace releases correctly and respects cap |
| Sacred Retribution | Build Sanctity and Basic Attack | One shockwave damages enemies and heals allies; no feedback loop |
| Multiplayer | Two or more players trigger passives | No cross-player state leakage or duplicated healing/damage |
| Regression | Existing classes/skills/relics | No unrelated gameplay systems break |

---

## 10. Decisions that still need explicit values

Do not silently invent final balance numbers for these. Implement them as named configuration values and report the chosen temporary defaults.

| Mechanic | Still needs a decision |
|---|---|
| Sovereign Heat | Meter cap, Heat per hit, maximum damage bonus, reset grace period |
| Obsidian War Monger | Low Lifesteal percentage above 30% HP; confirm whether the 50% tier applies at exactly 30% |
| Windrunner Momentum | Build duration, meter cap, maximum attack-speed bonus |
| Briarheart Predator's Instinct | Mark buildup, maximum damage bonus, inactivity timeout |
| Galewind | Per-target vs global hit counter; AoE radius and damage ratio |
| Eclipse | Minimum/maximum charge duration and damage curve |
| Cinderflare | AoE radius and damage ratio |
| Solaris | Healing amount, target range, and whether a proc limit is needed |
| Seraphim | Tactical AoE radius, damage, scaling, and cooldown |
| Chronomancer | Cooldown reduction amount per Basic Attack/Tactical hit |
| Voidward | Energy per hit, energy cap, empowered Tactical damage bonus |
| Hallowed Martyr | Grace storage percentage, capacity, and release threshold |
| Arch-Templar | Sanctity per heal, cap, shockwave damage, healing, and radius |

---

## 11. Completion criteria

The overhaul is complete only when:

- All 12 Weapons and 12 Vestments have correct catalog data and working mechanics.
- Each Vestment replaces the class passive rather than stacking on top of it.
- Default Vestments restore the existing class passive.
- Ranger, Arcanist, and Cleric Vestments provide no Shield bonuses.
- Cleric weapon Shield generation is removed.
- Arcanist Scrolls continue to work with all weapon and Vestment effects.
- Server-side state is authoritative and synchronized to clients.
- Inventory UI accurately describes and displays equipped items.
- All required regression tests pass.
- No obsolete weapon modifiers continue triggering alongside redesigned effects.
- No unapproved Tactical redesign has been slipped into the implementation.

## 12. Instructions for the implementation agent

Work phase by phase. Before editing, inspect the current code and identify the exact files/functions responsible for each behavior. Do not perform a broad rewrite or change unrelated systems.

For each phase:

1. Explain the files/functions that will be changed.
2. Make the smallest coherent implementation.
3. Add or update tests.
4. Run type-check/build/tests and report actual results.
5. Summarize what changed and what remains.

If a design value is missing, do not guess that it is final. Use a clearly named temporary tuning constant and list it as a decision needed. Never claim a feature is complete unless it is implemented, tested, and verified in the repository.
