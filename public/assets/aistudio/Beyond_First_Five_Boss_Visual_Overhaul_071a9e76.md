# Beyond — First Five Boss Visual Overhaul

**Repository:** `aleph01xr/Beyond-Dungeons`

Update the first five bosses so they look slightly humanoid while remaining clearly monstrous. Give each boss a distinct silhouette, anatomy, personality, and animations that match its existing abilities.

## Before editing

Inspect the current implementation. In particular, trace:
- `src/client/npcSprites.ts` and the existing `drawHumanoidBoss` implementation.
- `src/components/GameCanvas.tsx`.
- `src/client/directionalFacing.ts`.
- Existing boss definitions, abilities, movement states, and rendering logic.

Reuse the existing architecture. Do not create a parallel sprite or animation system. Verify actual file paths and existing behavior before making changes.

## Bosses in scope

| Floor | Biome | Boss |
|---|---|---|
| 1 | Highkeep Outer Bailey | Warden Malakor |
| 2 | Sunken Crypt | Archlich Vaelor |
| 3 | Cindervault Bastion | Ignis, Cinder Sovereign |
| 4 | Abyssal Shadow Chasm | Void-Eater Malice |
| 5 | Aetherial Void Spire | Archon of Nothingness |

Use these exact names. Do not include other bosses.

## Requirements

### 1. Eight-directional sprites
Support N, NE, E, SE, S, SW, W, and NW. Make front, back, side, and diagonal views intentional and consistent. Preserve anatomy, equipment, and distinctive details across directions. Avoid crude mirroring when it makes the design look incorrect. Use the existing directional-facing utilities.

### 2. Idle and movement
Give each boss a living idle animation: subtle breathing, shifting, head or limb movement, and suitable secondary motion. Movement animations must reflect actual movement and facing direction. Each boss should move with its own weight and personality.

### 3. Ability animations
When a boss uses an ability, its body must visibly perform the action—not just trigger particles or screen effects.

Examples:
- Heavy attacks: wind-up, torso rotation, strike, and recovery.
- Spinning attacks: visibly rotate the body and follow-through.
- Charges: lean forward, accelerate, then recover.
- Spell casts: pose and move the relevant limbs, with the release synchronized to the existing cast.
- Area attacks: show a clear preparation and release motion.

Inspect each boss's real abilities and implement animations that match them. Do not invent new attacks or change gameplay behavior just to showcase an animation.

## Character direction

- **Warden Malakor:** Heavy, imposing armored guardian. Weighty steps, strong attack wind-ups, forceful swings, and deliberate recovery.
- **Archlich Vaelor:** Ancient undead spellcaster. Unnatural idle movement, deliberate casting gestures, and clear summoning/casting preparation.
- **Ignis, Cinder Sovereign:** Molten/cinder sovereign. Powerful silhouette, heat-like secondary motion, and forceful movements during existing fire abilities.
- **Void-Eater Malice:** Unsettling void creature. Slightly humanoid but asymmetrical, with unusual appendages and unnatural yet readable movement. Do not make it a generic shadow blob.
- **Archon of Nothingness:** Distinct cosmic entity with a recognizable central body and silhouette. Use controlled floating or moving components where appropriate. Do not represent it as an indistinct color blur or generic knight.

Treat these as art direction, not permission to contradict the existing character designs or abilities. Inspect the current implementation first.

## Technical constraints

- Keep server-authoritative gameplay unchanged.
- Synchronize visual animations with existing boss states and ability timing.
- Do not alter damage, cooldowns, hitboxes, AI, phases, or balance unless strictly necessary; explain any required gameplay change before making it.
- Prevent animation states from conflicting. Use sensible transitions between idle, movement, wind-up, attack, recovery, hit, and death where supported.
- Keep rendering efficient: reuse loaded assets, avoid unnecessary allocations and excessive particles, and follow existing canvas-rendering conventions.
- Ensure all clients see consistent boss actions in multiplayer.

## Validation

After implementation:
1. Check all five bosses in all eight directions.
2. Verify idle and movement animations.
3. Test every existing boss ability and confirm its body animation matches the action timing.
4. Check transitions, hit reactions, and death animations where supported.
5. Test multiplayer synchronization and performance.
6. Run the repository's relevant type checks, tests, and build.

Do not claim completion for animations or directions that have not actually been implemented and tested.
