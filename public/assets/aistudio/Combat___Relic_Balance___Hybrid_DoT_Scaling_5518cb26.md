# Combat & Relic Balance — Hybrid DoT Scaling

* **System:** Combat & Relic Balance
* **Status:** Proposed — Pending Implementation
* **Balancing Direction:** Hybrid Scaling

---

## 1. Design Goals

The goal is to make Burn, Poison, and Bleed remain relevant throughout player progression without allowing damage-over-time (DoT) effects to overshadow direct attacks.

**The system should:**
* Reward player progression.
* Preserve the unique identity of each DoT relic.
* Keep enemy resistances meaningful.
* Prevent unlimited status stacking.
* Preserve Twinstring Charm's multi-projectile interactions.
* Ensure correct multiplayer damage attribution.

> **Core Principle:** DoT should benefit from player progression, but should not inherit every direct-damage multiplier.

---

## 2. Hybrid DoT Scaling Formula

DoT damage will use a separate progression multiplier:

$$\text{DoT Multiplier} = 1 + 0.003 \times (\text{Level} - 1) + 0.002 \times \text{Primary Attribute}$$

Where:
* $\text{Level}$ = player's current level.
* $\text{Primary Attribute}$ = the relevant offensive attribute for the player's class.

At level $100$ and $100$ primary attribute:

$$1 + 0.297 + 0.200 = 1.497\text{x}$$

This creates a maximum progression multiplier of approximately $1.5\text{x}$.

**Final damage per tick:**

$$\text{Final Tick} = \text{Base Tick} \times \text{DoT Multiplier} \times (1 - \text{Enemy Resistance})$$

*Note: DoT should not automatically inherit direct-hit critical damage, general damage bonuses, or other direct-attack multipliers.*

---

## 3. Individual Relic Balance

Preserve the existing base damage values initially. Introduce hybrid scaling without immediately changing the relics' identities.

| Relic | Current Base Damage | Intended Identity |
| :--- | :--- | :--- |
| **Cinder Heart** | $7 + \text{floor}$ | Consistent burn damage |
| **Viper Crucible** | $5 + \text{floor}$ | Sustained poison pressure |
| **Bloodletter Talisman** | $7 + \text{floor}$ | Conditional bleed damage |
| **Bloodletter vs. moving enemies** | $14 + \text{floor}$ | Rewards movement-based pressure |

### Cinder Heart — Burn
* Retain its existing application conditions.
* Preserve its $4.5$-second duration.
* Apply hybrid DoT scaling.
* Fire resistance reduces final burn damage.

### Viper Crucible — Poison
* Preserve its $6$-second duration.
* Apply hybrid DoT scaling.
* Poison remains a sustained damage source.
* Reapplication refreshes the duration instead of creating unlimited independent stacks.

### Bloodletter Talisman — Bleed
* Preserve its $5$-second duration.
* Apply hybrid DoT scaling.
* Moving enemies retain the existing increased bleed damage.
* The movement bonus must be applied consistently and only once.

---

## 4. Status Application and Refreshing

All three relics should follow consistent status rules:
* Reapplying an existing status refreshes its duration.
* Reapplication does not create another independent stack of the same status.
* Each active status tracks its applying player's identity.
* Each application stores the relevant DoT damage snapshot.
* A new application refreshes the status and updates its damage snapshot.

**Twinstring Charm** must retain its ability to trigger on-hit status effects through either projectile. However, repeated projectile hits must not generate unlimited simultaneous instances of the same status.

---

## 5. Damage Attribution and Processing

Periodic damage should use a centralized damage-processing path.

**Every DoT tick should correctly:**
* Subtract enemy HP.
* Credit damage to the applying player.
* Update the player's damage-dealt statistics.
* Trigger normal enemy death handling.
* Award kills and rewards correctly.
* Function consistently in multiplayer.

DoT ticks must not independently trigger critical hits, Twinstring projectiles, Cinder Heart applications, or other recursive on-hit relic effects. The implementation must also avoid crediting the same damage twice.

---

## 6. Enemy Resistance

Each DoT retains its corresponding resistance interaction:

| Damage Type | Relevant Resistance |
| :--- | :--- |
| **Burn** | Fire Resistance |
| **Poison** | Poison Resistance |
| **Bleed** | Bleed Resistance |

* Resistance reduces final DoT damage.
* Existing resistance-based duration reduction can remain initially, but must be tested to ensure resistant enemies are not excessively difficult to affect.
* Resistance must not modify the player's progression multiplier.

---

## 7. Boss Balance

Bosses should remain vulnerable to DoT effects.

**Proposed rules:**
* Bosses can receive Burn, Poison, and Bleed simultaneously.
* DoT uses the same fundamental damage formula against bosses.
* Existing boss resistance remains meaningful.
* No blanket DoT immunity.
* No additional hidden boss-only damage reduction initially.

*Boss-specific adjustments should only be introduced if testing demonstrates that optimized DoT builds are excessively powerful.*

---

## 8. Testing and Validation

Test the system across different progression stages and combat scenarios:

| Test Scenario | Main Objective |
| :--- | :--- |
| **Level 1, early floor** | Ensure DoT is not overpowering |
| **Level 25, mid-game** | Verify noticeable progression |
| **Level 50, later floor** | Confirm continued usefulness |
| **Level 100, optimized build** | Prevent DoT from replacing direct damage |
| **Twinstring + DoT relics** | Check repeated status applications |
| **High-resistance boss** | Validate resistance calculations |
| **Four-player party** | Verify damage attribution |

**Metrics to Record:**
* Damage per tick.
* Total damage over the full duration.
* DoT contribution as a percentage of total player damage.
* Boss time-to-kill.
* Damage attribution per player.
* Status application and refresh frequency.

---

## 9. Implementation Order

1. **Audit existing DoT processing:** Inspect status ownership, damage attribution, death handling, and refresh behavior.
2. **Introduce centralized DoT scaling:** Implement the separate hybrid progression formula.
3. **Update status ownership:** Track the applying player and damage snapshot.
4. **Unify periodic damage processing:** Correctly process damage, statistics, kills, and rewards.
5. **Preserve relic interactions:** Maintain Twinstring's identity and the unique behavior of each DoT relic.
6. **Run balance tests:** Validate early-, mid-, and late-game performance in solo and multiplayer.

---

## 10. Final Design Decisions

| Feature | Decision |
| :--- | :--- |
| **Scaling model** | Hybrid |
| **Maximum progression multiplier** | Approximately $1.5\text{x}$ |
| **Existing base damage** | Preserve initially |
| **Status stacking** | Refresh duration, no unlimited stacking |
| **Damage attribution** | Track applying player |
| **Twinstring interaction** | Preserve |
| **Enemy resistance** | Retain |
| **Boss immunity** | None |
| **Direct-hit multipliers** | Not automatically inherited |

---

### Final Design Philosophy

Damage-over-time effects should be reliable secondary damage sources that reward players for building around them. They should contribute meaningfully to combat at every stage of progression while preserving the importance of direct attacks, abilities, and class-specific combinations.

*This document defines the intended balance direction. Numerical adjustments beyond the proposed scaling formula should be validated through gameplay testing before final approval.*