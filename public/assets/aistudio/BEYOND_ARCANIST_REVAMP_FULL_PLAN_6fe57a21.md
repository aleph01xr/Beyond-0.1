# BEYOND — COMPLETE ARCANIST REVAMP PLAN

**Document:** Arcanist Revamp Master Plan  
**Version:** 1.0  
**Status:** Design proposal — implementation pending  
**Reference repository:** https://github.com/aleph01xr/Beyond-Dungeons

## Project objective

Develop the Arcanist into a complete spell-focused damage specialist with seven distinct offensive spells, a customizable Tactical Skill, a Scroll system, the cooperative skill Chrono Well, meaningful Intelligence scaling, and reliable multiplayer synchronization.

This is an upgrade to the existing Arcanist in Beyond, not a replacement of the game's design. Preserve existing character designs, animations, visual assets, class identity, architecture, and gameplay systems unless a specific change is approved.

---

## 1. Arcanist class identity

The Arcanist is a spell-heavy magical damage specialist whose combat identity revolves around:

- High spell availability.
- Multiple damage patterns.
- Intelligence-based scaling.
- Positioning and aiming.
- Tactical flexibility through Scrolls.
- Cooperative utility through Chrono Well.

### Core class systems

| System | Purpose |
|---|---|
| Offensive Spells | Main source of magical damage |
| Tactical Skill | Class-specific active ability |
| Scrolls | Modify or replace the Tactical Skill |
| Relics | Passive equipment and bonuses |
| Attributes | Influence spell performance |
| Chrono Well | Cooperative skill |

**System separation rules:**

- Scrolls modify or replace the Arcanist's Tactical Skill.
- Relics provide passive effects.
- Scrolls and Relics remain separate systems.
- Scrolls must not become another permanent account-storage system.
- Scrolls remain distinct from temporary dungeon loot.
- Preserve the previously established RNG-based Scroll acquisition concept.
- Do not invent extra Scroll slots or an inventory structure without auditing the existing design first.

---

## 2. Seven offensive spells

The following are the approved design proposals and current numerical baselines. They are not yet confirmed as implemented or playtested values.

### 2.1 Fireball

**Role:** Burst / AoE  
**Status:** Approved

| Property | Proposed value |
|---|---:|
| Base damage | 42 |
| INT coefficient | 1.0% |
| Cooldown | 6 seconds |
| Cast time | 0.35 seconds |
| Explosion radius | 90 units |

**Mechanics:**

- Travels toward the aimed direction.
- Explodes on enemy contact or maximum range.
- Deals area damage to enemies within the explosion radius.
- No lingering burn by default.

**Design intent:** A reliable explosive spell that requires little setup.

### 2.2 Disintegration

**Role:** Sustained directional damage  
**Status:** Detailed mechanics confirmed; implementation pending

| Property | Proposed value |
|---|---:|
| Damage per tick | 10 |
| INT coefficient | 0.8% |
| Tick interval | 0.2 seconds |
| Damage frequency | 5 ticks per second |
| Cooldown | 12 seconds |
| Cooldown starts | After channel termination |
| Channel duration | Until released or interrupted |
| Beam width | 42 units |
| Maximum range | 450 units |
| Activation animation | 0.15 seconds |
| Maximum rotation speed | 180 degrees per second |
| Movement while channeling | Disabled |

**Mechanics:**

- Holding the spell button continuously channels the beam.
- The Arcanist cannot move while channeling.
- The player can rotate the beam, subject to a maximum rotation speed of 180 degrees per second.
- Enemies intersecting the beam receive damage every 0.2 seconds.
- The beam can damage multiple enemies along its path.
- Releasing the spell immediately terminates the channel.
- Crowd control and death interrupt the channel.
- Cooldown begins when the channel terminates.
- No predetermined maximum channel duration has been established.

**Design intent:** A stationary channeling spell that rewards positioning, aim, and tracking. It should not be a fire-and-forget attack.

**Still to verify:** Whether the 0.15-second activation animation delays the first damage tick, and the exact collision/tick behavior when targets enter or leave the beam.

### 2.3 Frost Lance

**Role:** Precision / Piercing  
**Status:** Approved

| Property | Proposed value |
|---|---:|
| Base damage | 36 |
| INT coefficient | 1.2% |
| Cooldown | 4.5 seconds |
| Cast time | 0.2 seconds |
| Piercing limit | Up to 3 enemies |

**Mechanics:**

- Travels in a straight line.
- Pierces up to three enemies.
- Deals damage to each enemy it penetrates.
- No homing.
- No freeze or stun by default.

**Design intent:** Reward accurate aiming and positioning against enemy formations.

### 2.4 Chain Lightning

**Role:** Multi-target damage  
**Status:** Approved

| Property | Proposed value |
|---|---:|
| Initial damage | 32 |
| INT coefficient | 1.0% |
| Cooldown | 7 seconds |
| Maximum targets | 4 |
| Damage reduction per jump | 15% |
| Maximum jump distance | 150 units |

**Mechanics:**

- The initial strike hits the selected target.
- Lightning jumps to up to three additional enemies.
- Each subsequent jump deals 15% less damage than the preceding hit.
- Prioritizes enemies that have not already been hit.
- Cannot repeatedly jump between the same targets during one cast.

**Design intent:** The dedicated spell for damaging clustered enemies.

### 2.5 Arcane Meteor

**Role:** Heavy AoE burst  
**Status:** Approved

| Property | Proposed value |
|---|---:|
| Base damage | 75 |
| INT coefficient | 1.3% |
| Cooldown | 11 seconds |
| Cast time | 0.5 seconds |
| Impact delay | 1 second |
| Explosion radius | 125 units |

**Mechanics:**

- Marks a selected ground location.
- A meteor descends after a short delay.
- Deals heavy damage upon impact.
- Enemies can move out of the marked area.
- No lingering damage by default.

**Design intent:** A high-impact area spell with a readable warning and an opportunity for enemies to evade.

### 2.6 Arcane Orb

**Role:** Persistent damage / Area pressure  
**Status:** Approved

| Property | Proposed value |
|---|---:|
| Damage per hit | 12 |
| INT coefficient | 0.7% |
| Cooldown | 9 seconds |
| Duration | 4 seconds |
| Hit interval | 0.5 seconds |
| Maximum hits per enemy | 2 |
| Projectile speed | Slow |

**Mechanics:**

- Summons a slowly traveling magical orb.
- Persists while moving forward.
- Can damage multiple enemies.
- Can hit the same enemy at most twice.
- Does not disappear immediately after hitting an enemy.
- Interaction with time suspension must be defined consistently with Chrono Well.

**Design intent:** Persistent area pressure and space control.

### 2.7 Arcane Barrage

**Role:** Multi-projectile damage  
**Status:** Approved

| Property | Proposed value |
|---|---:|
| Damage per projectile | 12 |
| INT coefficient | 0.45% |
| Cooldown | 8 seconds |
| Projectile count | 6 |
| Projectile speed | Medium-high |
| Maximum range | 450 units |
| Formation | Alternating helix |

**Mechanics:**

- Fires six magical projectiles.
- Projectiles alternate around a straight centerline in a twisting helix formation.
- The overall trajectory remains forward.
- Each projectile deals independent damage.
- Multiple projectiles can hit the same enemy.
- No homing.

**Design intent:** A distinctive multi-projectile spell that rewards aiming and positioning.

---

## 3. Cooperative Skill — Chrono Well

**Status:** Previously established design; implementation must be audited and verified.

| Property | Proposed value |
|---|---:|
| Duration | 3 seconds |
| Cooldown | 45 seconds |
| Area | Large localized radius |
| Damage | None |
| Caster affected | No |

### Time suspension behavior

Chrono Well suspends:

- Ordinary enemies.
- Elite enemies.
- Bosses.
- Allied players.
- Enemy and allied projectiles.
- Attacks.
- Area-of-effect attacks.
- Relevant ongoing actions and animations.

**Boss interaction:** Bosses are not exempt from Chrono Well's time suspension. The intended design bypasses ordinary boss crowd-control immunity for this specific cooperative skill.

### Technical requirements

- Implement actual server-authoritative suspension, not merely a visual slow-motion effect.
- Preserve affected entities' execution state while suspended.
- Resume entities and ongoing actions correctly when the effect ends.
- Handle projectiles and area effects consistently.
- Ensure the caster remains unaffected.
- Define behavior for overlapping Chrono Well effects and caster disconnects.
- Avoid leaving any entity permanently suspended.

---

## 4. Tactical Skill and Scroll system

### Tactical Skill

The Tactical Skill is a separate active class ability.

It must have:

- Its own cooldown.
- Its own damage or effect calculation.
- Independent class-specific scaling.
- Server-authoritative activation.
- Correct multiplayer synchronization.

It must not automatically inherit the offensive spell damage formula.

### Scrolls

Scrolls customize or replace the Arcanist's Tactical Skill.

Intended rules:

1. Scrolls are acquired through the established RNG-based system.
2. A Scroll provides a different Tactical Skill behavior.
3. Selecting or equipping a Scroll changes the available tactical ability according to the existing item design.
4. Scroll effects remain separate from Relic passives.
5. Scrolls remain separate from permanent account storage and temporary dungeon loot.
6. Do not add extra Scroll slots or invent an inventory system without first inspecting the repository and established design.
7. Define how Scroll effects interact with Chrono Well and multiplayer state.

The exact Scroll roster, acquisition probabilities, and replacement/equip rules must be recovered from the existing design and repository audit rather than invented.

---

## 5. Attributes and damage scaling

### Working spell damage formula

`D = B × [1 + 0.025 × (L - 1)] × [1 + c × INT]`

Where:

- `B` = spell base damage.
- `L` = relevant level.
- `c` = spell-specific INT coefficient.
- `INT` = Intelligence attribute.

Multi-hit spells calculate damage per successful hit. Channeling spells calculate damage per tick. Area spells apply damage independently to each valid target.

### Required verification

Before implementation, inspect:

- Whether this formula already exists in Beyond.
- What `L` represents in the current damage pipeline.
- Whether damage bonuses stack additively or multiplicatively.
- Whether critical hits affect spell damage.
- How damage reduction applies.
- How Relic modifiers interact with spell damage.
- Whether modifiers can be applied twice.
- Whether server and client calculations agree.

Do not introduce a second damage calculation pipeline that conflicts with Beyond's existing implementation.

---

## 6. Visual and gameplay implementation

Preserve Beyond's existing art direction, character designs, animations, and visual assets. New effects should complement the existing visual style.

| Spell | Required visual behavior |
|---|---|
| Fireball | Flaming projectile and explosion |
| Disintegration | Continuous violet beam and channel feedback |
| Frost Lance | Crystalline piercing projectile |
| Chain Lightning | Branching electrical arcs |
| Arcane Meteor | Ground marker, falling meteor, impact explosion |
| Arcane Orb | Persistent floating energy sphere |
| Arcane Barrage | Six twisting projectiles |
| Chrono Well | Temporal field activation, suspension, and release effects |

### Animation and feedback requirements

- Casting animations.
- Projectile animations.
- Impact effects.
- Damage feedback.
- Channeling animations.
- Interruption feedback.
- Cooldown feedback.
- Chrono Well activation and expiration effects.

Do not replace existing character art or redesign the class visuals without approval.

---

## 7. Multiplayer and server architecture

All important spell decisions must be authoritative on the server.

### Server responsibilities

- Validate spell activation.
- Validate cooldowns.
- Calculate damage.
- Track projectiles.
- Handle collision.
- Process damage ticks.
- Handle interruptions.
- Synchronize effects.
- Manage Chrono Well.
- Resume suspended entities.
- Prevent duplicate damage events.

### Disintegration synchronization

The server must track:

- Whether the channel is active.
- Channel start and termination.
- Player movement restriction.
- Beam direction.
- Rotation speed.
- Damage tick timing.
- Valid targets.
- Interruption state.
- Cooldown activation.

Clients may render the beam smoothly, but must not independently decide whether damage occurs.

### Chrono Well synchronization

Test and handle:

- Entity suspension.
- Projectile suspension.
- Boss state preservation.
- Allied player suspension.
- Overlapping time effects.
- Correct resumption.
- Disconnects during suspension.
- Cleanup when the effect expires or its caster disconnects.

---

## 8. Repository audit before implementation

**Reference repository:** https://github.com/aleph01xr/Beyond-Dungeons

Gemini should perform a read-only inspection before making gameplay changes.

Inspect:

1. Existing Arcanist class implementation.
2. Existing spell and ability architecture.
3. Existing Tactical Skill implementation.
4. Scroll data structures and acquisition.
5. Relic interactions.
6. Attribute and damage calculations.
7. Cooldown management.
8. Projectile and collision systems.
9. Multiplayer event handling.
10. Existing visual assets and animations.
11. Existing status-effect and crowd-control handling.
12. Existing boss immunity and time-related mechanics.

### Required audit deliverables

| File | Purpose |
|---|---|
| `ARCANIST_DESIGN.md` | Class identity and gameplay mechanics |
| `ARCANIST_SPELL_BALANCE.md` | Seven spells and numerical proposals |
| `ARCANIST_SCROLLS.md` | Tactical Skill and Scroll system |
| `ARCANIST_COOP_SKILL.md` | Chrono Well specifications |
| `ARCANIST_IMPLEMENTATION_PLAN.md` | Technical implementation roadmap |
| `ARCANIST_TEST_PLAN.md` | Testing and acceptance criteria |

The audit must distinguish existing implementation, documented design, proposed changes, and unknowns. Do not claim a mechanic exists without locating and verifying it.

---

## 9. Implementation sequence

Implement incrementally. Do not ask Gemini to rewrite the entire class in one operation.

1. **Repository inspection and documentation**
   - Read-only audit.
   - No gameplay modifications.
   - Identify existing systems and dependencies.

2. **Damage and scaling integration**
   - Verify the damage pipeline.
   - Establish spell INT coefficients.
   - Keep Tactical Skill scaling independent.

3. **Spell infrastructure**
   - Casting and activation.
   - Cooldowns.
   - Targeting.
   - Collision.
   - Interruption.
   - Server-authoritative damage.

4. **Offensive spell implementation**
   - Implement and test each spell individually.
   - Preserve distinct spell behavior.

5. **Disintegration specialization**
   - Stationary channeling.
   - Limited rotation.
   - Beam collision.
   - Damage ticks.
   - Release and interruption behavior.

6. **Tactical Skill and Scroll integration**
   - Recover and implement established Scroll behavior.
   - Preserve separation from Relics and other item systems.

7. **Chrono Well**
   - Implement authoritative time suspension.
   - Verify correct resumption.

8. **Visual and animation integration**
   - Use existing assets where appropriate.
   - Add compatible effects without redesigning existing characters.

9. **Multiplayer testing**
   - Test multiple players, different network conditions, bosses, and overlapping effects.

10. **Balance testing and documentation**
    - Compare actual damage against enemy HP.
    - Adjust values based on playtesting.
    - Finalize documentation after verification.

---

## 10. Acceptance testing

The revamp is not complete merely because spells appear visually. All relevant gameplay and multiplayer behavior must pass testing.

### Spell functionality

- [ ] All seven spells activate correctly.
- [ ] Every spell has the correct cooldown.
- [ ] Projectile and beam collision works.
- [ ] Multi-target damage works correctly.
- [ ] INT scaling is applied exactly once.
- [ ] Damage and hit limits match the approved specifications.

### Disintegration

- [ ] Holding continuously channels.
- [ ] Movement is completely disabled.
- [ ] Rotation is capped at 180 degrees per second.
- [ ] Beam width is 42 units.
- [ ] Beam range is 450 units.
- [ ] Releasing immediately terminates the channel.
- [ ] Crowd control interrupts the channel.
- [ ] Death interrupts the channel.
- [ ] Cooldown starts after termination.
- [ ] Damage ticks do not duplicate or desynchronize.

### Scrolls and Tactical Skills

- [ ] Scroll changes the intended Tactical Skill.
- [ ] Scroll effects remain separate from Relics.
- [ ] Tactical Skill scaling is independent.
- [ ] Scroll behavior synchronizes in multiplayer.
- [ ] Existing acquisition and item rules are preserved.

### Chrono Well

- [ ] Three-second suspension works.
- [ ] 45-second cooldown works.
- [ ] Bosses are suspended.
- [ ] Allies are suspended.
- [ ] Projectiles and attacks are suspended.
- [ ] Entities resume correctly.
- [ ] Caster remains unaffected.
- [ ] Disconnects do not leave broken states.

### Multiplayer and stability

- [ ] Server validates damage and cooldowns.
- [ ] No duplicate damage ticks.
- [ ] No desynchronized projectiles.
- [ ] No permanently suspended entities.
- [ ] Disconnects do not leave broken states.
- [ ] Client visuals agree with authoritative server state.

---

## 11. Non-negotiable development rules

1. **Preserve Beyond:** Do not unnecessarily rewrite existing systems or visual designs.
2. **No assumptions:** Inspect the repository when a mechanic or implementation detail is unclear.
3. **Incremental implementation:** One subsystem at a time, with testing before proceeding.
4. **Server authority:** Clients must not decide authoritative damage, cooldowns, or crowd-control outcomes.
5. **Keep systems separate:** Do not merge Scrolls, Relics, Tactical Skills, and temporary dungeon loot.
6. **Document actual behavior:** Clearly distinguish proposed, implemented, and tested features.
7. **Avoid unrelated changes:** Do not modify other classes or systems unless required and explicitly justified.
8. **Report changes:** Gemini should list files changed, behavior implemented, tests run, and known limitations after each implementation phase.

---

## 12. Immediate next step

Do not begin implementation yet.

First, have Gemini perform a **read-only audit** of `aleph01xr/Beyond-Dungeons` and produce the documentation package.

The audit should establish exactly what already exists, what needs modification, what can be reused, and what remains unknown.

Only after reviewing that audit should implementation begin.

**Final objective:** Deliver a cohesive Arcanist class whose seven offensive spells, Tactical Skill, Scrolls, Relics, attributes, and Chrono Well work together within Beyond's existing architecture and multiplayer PvE experience.
