# Arcanist Revamp Implementation Plan (`ARCANIST_IMPLEMENTATION_PLAN.md`)

1. **Shared Definitions & Protocol (`src/shared/arcanist.ts`, `src/shared/abilityTargeting.ts`, `src/shared/types.ts`, `src/shared/snapshotDelta.ts`)**:
   - Define `ArcanistSpellId`, `ArcanistScrollId = ArcanistSpellId`, `ARCANIST_SPELLS` / `ARCANIST_SCROLLS` (all 7 Scroll spells with exact base damage, INT coefficients, cooldowns, cast/channel/range specs), and `computeArcanistSpellDamage()`.
   - Add per-Scroll targeting specs (`ARCANIST_SCROLL_TARGET_SPECS`) in `abilityTargeting.ts` (`'line'` / `'ground_aoe'`) resolved dynamically by `getAbilityTargetSpec(heroClass, action, equippedScrollId)`.
   - Extend `PlayerState`, `EnemyState`, `ProjectileState`, `FieldZoneState`, and `ClientMessage` cleanly (`spellCastState`, `disintegrationState`, `equippedScrollId`, `pendingScrollChoices`, `chronoSuspendedMs`, `player:select_scroll`, `player:channel_start` / `update` / `stop`).
   - Update `HERO_CLASSES.arcanist.ultCooldownMs` to `45000` and preserve `skillCooldownMs` / `maxSkillCooldownMs` as the unified `[Q / RMB]` cooldown.

2. **Server-Authoritative Engine & WS Wiring (`src/server/gameEngine.ts`, `server.ts`)**:
   - Route Arcanist `[Q / RMB]` (`performAction(..., 'tactical')`) through `triggerArcanistScrollTactical()` when `equippedScrollId` is set, falling back to `Astral Nova` when unequipped.
   - Enforce Disintegration requires `equippedScrollId === 'disintegration'`, movement lock (`vx=0, vy=0`), `PI rad/s` rotation clamping, 0.15s activation + 0.2s ticks, 42u beam width, 450u wall-clipped range, post-termination 12s CD on `skillCooldownMs`, and CC/death/disconnect interruption.
   - Implement authoritative `chrono_well` (3s duration, 45s CD) time suspension for ordinary/elite/boss enemies, non-caster allied players, hazard/meteor zones, and **ALL projectiles inside the well (enemy, allied, and caster's own)**, plus immediate `spawnProjectile` check and disconnect/expiry cleanup.
   - Preserve `buildNetworkSnapshot()` projection parity for new fields.

3. **Client Prediction, Rendering, Audio & HUD (`src/client/*`, `src/components/*`)**:
   - Lock local movement prediction in `prediction.ts` during `disintegrationState.active` or `chronoSuspendedMs > 0`.
   - Keep standard class controls intact (`[1]` / `[H]` Potion, `[Q / RMB]` Tactical Skill / Disintegration hold-channel, `[R / Shift]` Chrono Well).
   - Render all 7 Spell Scrolls + targeting corridors (`abilityIndicator.ts`), Chrono Well temporal dome & suspended entity frost/clockwork overlays (`canvasEffects.ts`, `GameCanvas.tsx`), SFX (`sound.ts`), Tactical `[Q / RMB]` Scroll badge & Scroll Draft modal (`DungeonRunView.tsx`), and compact mobile Tactical button (`TouchControls.tsx`).

4. **Verification**:
   - Automated tests in `test_regression.ts` (Tests 97–101), `npm test`, `compile_applet`, and `lint_applet`.
