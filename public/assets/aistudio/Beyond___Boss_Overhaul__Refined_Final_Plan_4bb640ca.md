# Beyond — Boss Overhaul: Refined Final Plan

**Locked in:**
* **Boss phases:** Unique — every boss gets its own phase structure and signature mechanics.
* **Summons:** Conditional — only bosses whose identity and mechanics benefit from summons will use them.
* **Difficulty progression:** Hybrid — later bosses become mechanically more demanding, with controlled increases to damage and survivability.

The goal is to make all ten bosses feel like distinct encounters, not ten versions of the same enemy with increasingly large health bars.

---

## 1. Core Design Direction

Every boss must have four things:
* **Identity:** A recognizable combat theme and signature mechanic.
* **Readability:** Players can understand what the boss is preparing to do.
* **Counterplay:** Dangerous attacks have a meaningful response.
* **Mastery:** Players who learn the encounter should perform noticeably better.

We should preserve mechanics that already make a boss memorable. The overhaul should improve how those mechanics work, not replace everything just for the sake of change.

---

## 2. Boss Phases — Unique Encounters

Each boss receives a phase structure built around its identity. We should not force every boss into identical 70% and 50% thresholds.

**Possible phase patterns:**
* **Opening:** Introduces the boss's core attacks and teaches the encounter.
* **Escalation:** Introduces a new mechanic, changes an existing pattern, or creates a new positioning challenge.
* **Final phase:** Tests the player's understanding of the encounter through stronger combinations and tighter execution.

These are design roles, not mandatory phases. Some bosses may have two phases, others three, and some may use event-triggered transitions instead of fixed health thresholds.

> **Important:** Enrage should make a boss more threatening without making its attacks unreadable or removing opportunities to respond.

---

## 3. Summons — Conditional, Purposeful Encounters

Summons will no longer be a universal boss feature.

| Boss | Summon Direction | Design Purpose |
| :--- | :--- | :--- |
| **Warden Malakor** | No regular summon waves | Keep the encounter focused on direct combat fundamentals |
| **Archlich Vaelor** | Yes | Make add management part of the necromancer identity |
| **Ignis, Cinder Sovereign** | Conditional | Use fire-themed adds only if they create meaningful area-control decisions |
| **Void-Eater Malice** | Conditional | Use summons only if they reinforce its void-control mechanics |
| **Archon of Nothingness** | Conditional | Prefer unusual, coordinated threats over ordinary enemy waves |
| **Elyndor, Keeper of the Last Hymn** | No regular waves | Keep attention on rhythm, timing, and the boss's own patterns |
| **Zadkiel, Keeper of the Ashen Reliquary** | Conditional | Adds may support defensive or relic-based mechanics |
| **Sariel, Warden of the Veiled Scripture** | Conditional | Use adds to create controlled pressure, not constant clutter |
| **Seraphel, Sentinel of the Final Seal** | No regular waves | Make the fight a test of movement and precision |
| **Oriphiel, The Last Warden** | No regular waves by default | Keep the final encounter focused on Oriphiel's own mechanics |

*Note: These are design recommendations, not claims that every boss currently has or lacks summons. The code audit should confirm their existing behavior before implementation.*

### Summon Rules
* Never spawn enemies directly on top of players.
* Avoid spawning adds during an unavoidable boss attack.
* Give each summon wave a clear purpose and a reasonable limit.
* Avoid repeated waves that turn the fight into an endless cleanup task.
* Make summoned enemies distinguishable from ordinary room enemies.
* Tune summon health and damage for their intended role.
* Ensure the boss remains the main threat.

For Vaelor, for example, summons could be a central part of the encounter. For Malakor, they would likely distract from the direct combat test the first boss should provide.

---

## 4. Difficulty Progression — Hybrid

Difficulty should increase through mechanics first, stats second.

| Floors | Difficulty Identity | Main Source of Challenge |
| :--- | :--- | :--- |
| **1–2** | Fundamentals | Learn telegraphs, positioning, and basic responses |
| **3–4** | Area control | Manage hazards, movement, and safe spaces |
| **5–6** | Pattern mastery | Recognize sequences and respond to changing patterns |
| **7–8** | Execution | Handle layered mechanics and controlled pressure |
| **9–10** | Mastery | Combine previously learned skills into demanding encounters |

Later bosses can hit harder and survive longer, but raw stats must not be the main reason they feel difficult.

A player should be able to say, *"I lost because I mishandled that mechanic,"* rather than, *"I lost because the boss has an enormous health bar."*

---

## 5. HP, Damage, and Survivability

**Recommendation:** Preserve the current scaling formulas during the first implementation pass. We should measure actual encounter performance before changing them.

The current boss HP formula is:

$$\text{HP} = 950 \times D \times P \times [1 + 0.35(F - 1)]$$

Where:
* $D$ = difficulty multiplier (`Normal: 1.0`, `Heroic: 1.20`, `Abyssal: 1.45`)
* $P$ = party multiplier ($1 + 0.50(N - 1)$, scaling by $50\%$ per additional player)
* $F$ = floor number
* $N$ = party size

For reference, a Floor 10 boss on Normal currently has approximately:
* **Solo:** $3,943\text{ HP}$
* **Four players:** $9,856\text{ HP}$

The current party HP scaling is substantial, so we need to test whether it produces appropriately longer fights without making multiplayer encounters tedious.

### Proposed Encounter Duration Targets
*These are initial testing targets, not confirmed balance results.*

| Floors | Target Fight Duration |
| :--- | :--- |
| **1–2** | 45–90 seconds |
| **3–5** | 60–120 seconds |
| **6–8** | 90–150 seconds |
| **9–10** | 120–180 seconds |

Track player DPS, party size, build strength, and difficulty when evaluating these times. Do not adjust boss HP in isolation.

### Damage and Enrage Audit
Review:
* Damage dealt by every boss attack.
* Difficulty and party-size damage scaling.
* Damage increases from remaining Boss Wards.
* Enrage behavior at $50\%\text{ HP}$.
* Shortened attack windups during enrage.
* Whether poison or other status effects unexpectedly reduce incoming boss damage.

The current enrage increases movement speed from $110$ to $142$. That may be appropriate, but its combined effect with shortened windups needs testing. Enrage should increase pressure, not make attacks effectively unavoidable.

---

## 6. Individual Boss Overhaul Directions

### Floor 1 — Warden Malakor
* **Role:** Combat fundamentals.
* **Direction:** Focus on readable cleaves, charges, and ground attacks. Give players clear opportunities to dodge and punish recovery. Avoid excessive attack chaining.

### Floor 2 — Archlich Vaelor
* **Role:** Add management.
* **Direction:** Make summons a defining mechanic. Test summon timing, wave limits, and whether players can manage adds without losing all opportunities to attack Vaelor.

### Floor 3 — Ignis, Cinder Sovereign
* **Role:** Area control.
* **Direction:** Improve hazard readability and safe-zone design. Fire attacks should create movement decisions without covering every escape route at once.

### Floor 4 — Void-Eater Malice
* **Role:** Positioning and displacement.
* **Direction:** Focus on gravity, tendrils, and movement disruption. Any forced movement should leave players a fair chance to respond to what follows.

### Floor 5 — Archon of Nothingness
* **Role:** Pattern recognition.
* **Direction:** Build more demanding projectile sequences and spatial patterns. Keep safe zones visible and avoid overwhelming players with simultaneous effects.

### Floor 6 — Elyndor, Keeper of the Last Hymn
* **Role:** Rhythm and timing.
* **Direction:** Make musical patterns mechanically meaningful. Players should learn attack timing and recognize the moment to reposition or punish.

### Floor 7 — Zadkiel, Keeper of the Ashen Reliquary
* **Role:** Defensive mechanics.
* **Direction:** Make defensive windows and shield behavior understandable. Reward players for recognizing when to attack, reposition, or wait.

### Floor 8 — Sariel, Warden of the Veiled Scripture
* **Role:** Debuffs and pressure.
* **Direction:** Audit status-effect frequency and duration. Debuffs should create decisions, not leave players feeling that they cannot meaningfully fight back.

### Floor 9 — Seraphel, Sentinel of the Final Seal
* **Role:** Precision and movement.
* **Direction:** Focus on lance attacks, sequential hazards, and repositioning. Make hitboxes match their visual indicators and preserve room to maneuver.

### Floor 10 — Oriphiel, The Last Warden
* **Role:** Final mastery test.
* **Direction:** Combine demanding movement, attack recognition, and defensive timing. Make mechanics such as Aegis Parry and quadrant indicators understandable and satisfying to overcome.

*Note: These are encounter design directions. Exact attack names, phase triggers, and existing abilities must be checked against the current code before making changes.*

---

## 7. Multiplayer Balance

Bosses must be tested at all party sizes, not just solo.

The current formulas scale boss HP by $50\%$ per additional player and boss damage by $10\%$ per additional player. We should investigate whether this creates the right balance between party damage output and incoming pressure.

**Audit these areas:**
* **Aggro:** Does the boss target players fairly, or focus one player for too long?
* **AoE:** Can multiple players realistically avoid overlapping attacks?
* **Revives:** Can teammates revive someone without being punished by unavoidable damage?
* **Summons:** Do additional players make add management overwhelming?
* **Scaling:** Does a four-player encounter take an appropriate amount of time compared with solo?
* **Synchronization:** Do all clients see the same phase transitions, attacks, and boss state?

Party size should create cooperation opportunities, not simply multiply the amount of chaos.

---

## 8. Telegraphs, Hitboxes, and Attack Fairness

This needs to be a dedicated audit across all ten bosses. Every attack should be checked for:

| Element | Requirement |
| :--- | :--- |
| **Telegraph** | Players can recognize the upcoming attack |
| **Windup** | Enough time to react based on the attack's danger |
| **Hitbox** | Matches the visible attack area |
| **Damage** | Appropriate for its difficulty and warning |
| **Recovery** | Creates reasonable opportunities to punish |
| **Repetition** | Doesn't create unfair or unavoidable attack loops |
| **Multiplayer** | Remains readable when several players are present |

Also review screen shake, visual effects, overlapping projectiles, and effects that obscure important attack indicators.

---

## 9. Regression and Gameplay Testing

The existing regression tests already cover all ten floor configurations, boss names, HP scaling, rendering, and some boss-specific mechanics. Expand them to cover the actual encounter behavior.

**Required test scenarios:**
* Solo Normal, Heroic, and Abyssal.
* Four-player Normal, Heroic, and Abyssal.
* Every boss's phase transitions.
* Summon conditions and wave limits.
* Enrage behavior.
* Attack windups and hitbox accuracy.
* Status effects and boss resistances.
* Player death, revive, and multiplayer synchronization.
* Boss defeat, rewards, and progression.

**Record these metrics during gameplay:**
* Total fight duration.
* Player damage dealt and received.
* Deaths and revives.
* Damage per boss attack.
* Time spent in each phase.
* Number of summons spawned.
* Attacks successfully avoided.
* Performance differences between solo and multiplayer.

---

## 10. Implementation Order

Follow this sequence so mechanics aren't accidentally balanced around another mechanic that is still broken:

1. **Complete the code audit:** Inspect all ten boss definitions, attacks, phase logic, summons, resistances, and scaling.
2. **Audit shared boss systems:** Review damage calculations, HP scaling, enrage, windups, hitboxes, targeting, and multiplayer synchronization.
3. **Design unique phase structures:** Define each boss's phase triggers, signature mechanics, and transitions before implementing them.
4. **Rework conditional summons:** Keep summons where they serve the encounter and remove or redesign unnecessary waves.
5. **Tune individual boss encounters:** Implement the ten encounter designs, starting with the earliest floors and progressing toward Oriphiel.
6. **Balance stats and difficulty:** Use actual test results to adjust HP, damage, resistance, and party scaling.
7. **Run regression and multiplayer testing:** Verify that the overhaul doesn't break existing mechanics, rewards, or multiplayer behavior.

---

## Final Design Rules

These should be treated as the overhaul's non-negotiable guidelines:

* Don't increase HP just to make a boss feel harder.
* Don't give every boss summons.
* Don't force identical phases onto every boss.
* Don't make enrage attacks impossible to avoid.
* Don't let visual effects hide important attack indicators.
* Don't make a boss immune to an entire class's main damage identity without meaningful alternatives.
* Don't sacrifice encounter readability for visual spectacle.
* Don't remove fun mechanics simply because they are powerful; evaluate their actual impact first.

> **Core Takeaway:** Make each boss memorable through its mechanics before touching its numbers. A player should remember Vaelor because of his necromancy, Ignis because of his battlefield control, and Oriphiel because of the final mastery test—not because they each took longer to kill.