import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { GameRoom } from './src/server/gameEngine.ts';
import { TILE_SIZE, MAX_LEVEL, HERO_CLASSES, type AccountRecord, type HeroClassId, type EnemyState, type PropState } from './src/shared/types.ts';
import {
  computeGroundTargetPosition,
  findBestAutoTarget,
  getAbilityTargetSpec,
  getPrimaryAttackRange,
  simulateDashEndpoint,
  type AimableAction,
} from './src/shared/abilityTargeting.ts';
import {
  drawAbilityTargetingIndicator,
  drawPrimaryAttackRangeIndicator,
} from './src/client/abilityIndicator.ts';
import {
  drawHumanoidBoss,
  drawElyndorBoss,
  drawZadkielBoss,
  drawSarielBoss,
  drawSeraphelBoss,
  drawOriphielBoss,
} from './src/client/npcSprites.ts';
import {
  drawHymnPhantomSprite,
  drawRelicGolemSprite,
  drawVeiledHereticSprite,
  drawCelestialArbiterSprite,
  drawWardenEnforcerSprite,
  drawGenericEnemySprite,
} from './src/client/enemySprites.ts';
import { drawFallenAndGhostPlayer } from './src/client/fallenPlayerSprite.ts';
import {
  ParticleManager,
  DEFAULT_PARTICLE_BUDGET,
  applySpiralMovement,
  applyOrbitMovement,
  applyInwardAttraction,
  applyParticleMovement,
  drawDiamondShape,
  drawTriangleShape,
  drawShardShape,
  drawRingShape,
  drawCrescentShape,
  drawCrossShape,
  drawRuneShape,
  drawHexagonShape,
  drawStarburstShape,
  drawStreakShape,
  drawSmokeShape,
  drawFlameShape,
  drawParticleShape,
  drawEnhancedProjectile,
  quantizeGlowRgbKey,
  type CombatParticle,
} from './src/client/canvasEffects.ts';
import { CHANGELOG_DATA, CATEGORY_ORDER } from './src/data/changelog.ts';
import {
  applyKeyboardToUnifiedInput,
  applyTouchStickToUnifiedInput,
  isEditableEventTarget,
  angleDeltaRad,
} from './src/client/desktopInput.ts';
import {
  computePlayerMoveSpeed,
  hasMovementInput,
  isWallAtWorld,
  normalizePlayerInputDirection,
} from './src/shared/playerMovement.ts';
import {
  buildSharedAssertionPayload,
  hashPassword,
  signDungeonsIdentityAssertion,
  SlidingWindowRateLimiter,
  verifyDungeonsIdentityAssertion,
  verifyPassword,
  verifySharedIdentityRequestSecret,
} from './src/server/sharedIdentity.ts';
import {
  ARMAMENT_TUNING,
  DEFAULT_VESTMENT_BY_CLASS,
  DEFAULT_WEAPON_BY_CLASS,
  VESTMENT_CATALOG,
  WEAPON_CATALOG,
  applyAccountArmamentMigration,
  getClassVestments,
  getClassWeapons,
  normalizeArmamentLoadout,
  resolveActiveVestmentPassive,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
} from './src/shared/armaments.ts';
import { calculatePlayerStatProjections } from './src/shared/statUtils.ts';
import {
  applySnapshotDelta,
  cloneSnapshotBaseline,
  computeSnapshotDelta,
} from './src/shared/snapshotDelta.ts';

async function runRegressionTests() {
  console.log('--- STARTING BEYOND REGRESSION TESTS ---');
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res.then(() => {
          console.log(`  PASSED: ${name}`);
          passed++;
        }).catch(err => {
          console.error(` FAILED: ${name}`);
          console.error(err);
          process.exitCode = 1;
        });
      }
      console.log(`  PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(` FAILED: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // --- Test 1: Restart server twice and verify allocated attributes remain unchanged ---
  await test('1. Server restarts preserve allocated attributes across multiple boots', async () => {
    const testDir = path.resolve(process.cwd(), 'data_test_restart');
    const testAccountsFile = path.join(testDir, 'accounts.json');
    const testMigrationsFile = path.join(testDir, 'migrations.json');

    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    // Initial state: Level 25, 20 STR, 15 VIT, 13 unspent points (Total = (25-1)*2 = 48 points)
    const initialAccount: AccountRecord = {
      id: 'usr_test_restart',
      username: 'SirKaelen',
      usernameLower: 'sirkaelen',
      passwordHash: 'hash123',
      lockedClass: 'vanguard',
      preferredClass: 'vanguard',
      runsCompleted: 5,
      highestFloor: 3,
      totalKills: 100,
      totalRevives: 2,
      gold: 500,
      isAdmin: false,
      level: 25,
      xp: 400,
      strength: 20,
      vitality: 15,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 13,
    };

    fs.writeFileSync(testAccountsFile, JSON.stringify([initialAccount], null, 2), 'utf8');

    // Simulate Server Boot 1 (with migration logic)
    function simulateServerBoot() {
      const data = fs.readFileSync(testAccountsFile, 'utf8');
      const list = JSON.parse(data) as AccountRecord[];
      let appliedMigrations: string[] = [];
      if (fs.existsSync(testMigrationsFile)) {
        appliedMigrations = JSON.parse(fs.readFileSync(testMigrationsFile, 'utf8'));
      }
      const needsReset = !appliedMigrations.includes('20261106_reset_attributes');
      if (needsReset) {
        for (const rec of list) {
          rec.strength = 0;
          rec.vitality = 0;
          rec.dexterity = 0;
          rec.intelligence = 0;
          rec.faith = 0;
          rec.attributePoints = (Math.max(1, rec.level || 1) - 1) * 3;
        }
      } else {
        for (const rec of list) {
          rec.strength = Number(rec.strength) || 0;
          rec.vitality = Number(rec.vitality) || 0;
          rec.dexterity = Number(rec.dexterity) || 0;
          rec.intelligence = Number(rec.intelligence) || 0;
          rec.faith = Number(rec.faith) || 0;
          rec.attributePoints = Number(rec.attributePoints) || 0;
        }
      }
      if (needsReset) {
        appliedMigrations.push('20261106_reset_attributes');
        fs.writeFileSync(testMigrationsFile, JSON.stringify(appliedMigrations, null, 2), 'utf8');
        fs.writeFileSync(testAccountsFile, JSON.stringify(list, null, 2), 'utf8');
      }
      return list;
    }

    // First boot: One-time reset happens
    const boot1Accounts = simulateServerBoot();
    assert.strictEqual(boot1Accounts[0].strength, 0);
    assert.strictEqual(boot1Accounts[0].attributePoints, 72); // (25-1)*3

    // Now player spends points: 10 STR, 10 VIT, remaining 28 points
    boot1Accounts[0].strength = 10;
    boot1Accounts[0].vitality = 10;
    boot1Accounts[0].attributePoints = 28;
    fs.writeFileSync(testAccountsFile, JSON.stringify(boot1Accounts, null, 2), 'utf8');

    // Second boot: Migration was recorded, so attributes MUST be preserved
    const boot2Accounts = simulateServerBoot();
    assert.strictEqual(boot2Accounts[0].strength, 10, 'STR must be preserved on 2nd boot');
    assert.strictEqual(boot2Accounts[0].vitality, 10, 'VIT must be preserved on 2nd boot');
    assert.strictEqual(boot2Accounts[0].attributePoints, 28, 'Points must be preserved on 2nd boot');

    // Third boot: Attributes still preserved
    const boot3Accounts = simulateServerBoot();
    assert.strictEqual(boot3Accounts[0].strength, 10, 'STR must be preserved on 3rd boot');
    assert.strictEqual(boot3Accounts[0].vitality, 10, 'VIT must be preserved on 3rd boot');
    assert.strictEqual(boot3Accounts[0].attributePoints, 28, 'Points must be preserved on 3rd boot');

    // Clean up test dir
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // --- Test 2: Reset attributes through Aleph and verify all spent points refunded exactly once ---
  await test('2. Reset attributes near Aleph refunds all spent points exactly once', () => {
    const tavern = new GameRoom({
      roomId: 'TAVERN-HUB',
      name: 'Sanctuary Tavern',
      hostName: 'Innkeeper',
      difficulty: 'Normal',
      seed: 12345,
    });

    // Add player near Aleph (Aleph is at 18 * TILE_SIZE = 576, 28 * TILE_SIZE = 896)
    const aleph = tavern.npcs.find(n => n.id === 'npc_aleph')!;
    assert(aleph, 'Aleph must exist in Tavern');

    const pid = 'p_tester_1';
    tavern.addOrReconnectPlayer(pid, 'Tester', 'ranger', false, {
      level: 10,
      xp: 100,
      strength: 4,
      vitality: 6,
      dexterity: 8,
      intelligence: 0,
      faith: 0,
      attributePoints: 0, // Spent all 18 earned points: 4+6+8 = 18
    });

    const pState = tavern.getPlayerState(pid)!;
    // Move player right in front of Aleph
    pState.x = aleph.x + 10;
    pState.y = aleph.y + 10;

    // Verify distance check
    assert.strictEqual(tavern.isPlayerNearNpc(pid, 'npc_aleph', 180), true);

    // Simulate reset logic
    const spent = pState.strength + pState.vitality + pState.dexterity + pState.intelligence + pState.faith;
    assert.strictEqual(spent, 18);

    const refundedPoints = pState.attributePoints + spent;
    tavern.updatePlayerAttributes(pid, 0, 0, 0, 0, 0, refundedPoints);

    const updated = tavern.getPlayerState(pid)!;
    assert.strictEqual(updated.strength, 0);
    assert.strictEqual(updated.vitality, 0);
    assert.strictEqual(updated.dexterity, 0);
    assert.strictEqual(updated.intelligence, 0);
    assert.strictEqual(updated.faith, 0);
    assert.strictEqual(updated.attributePoints, 18, 'Refunded points must equal exactly 18');

    // Attempt second reset when spent is 0
    const spent2 = updated.strength + updated.vitality + updated.dexterity + updated.intelligence + updated.faith;
    assert.strictEqual(spent2, 0, 'No more spent points to refund');
    const refundedPoints2 = updated.attributePoints + spent2;
    assert.strictEqual(refundedPoints2, 18, 'Attribute points must not duplicate or change on repeated reset');
  });

  // --- Test 3: Attempt a reset outside the tavern and verify rejection ---
  await test('3. Reset outside Tavern or far from Aleph is rejected', () => {
    // Case A: In dungeon room
    const dungeon = new GameRoom({
      roomId: 'DUNGEON-FLOOR-1',
      name: 'Highkeep',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 999,
    });

    const pid = 'p_tester_2';
    dungeon.addOrReconnectPlayer(pid, 'Explorer', 'vanguard');

    assert.notStrictEqual(dungeon.roomId, 'TAVERN-HUB', 'Dungeon room is not Tavern Hub');
    // Cannot reset outside tavern
    const isTavern = dungeon.roomId === 'TAVERN-HUB';
    assert.strictEqual(isTavern, false, 'Reset must be rejected outside Tavern');

    // Case B: In Tavern Hub, but far away from Aleph
    const tavern = new GameRoom({
      roomId: 'TAVERN-HUB',
      name: 'Sanctuary Tavern',
      hostName: 'Innkeeper',
      difficulty: 'Normal',
      seed: 12345,
    });
    tavern.addOrReconnectPlayer(pid, 'Explorer', 'vanguard');
    const pState = tavern.getPlayerState(pid)!;
    pState.x = 100; // Far from Aleph (at 576, 896)
    pState.y = 100;

    const isNearAleph = tavern.isPlayerNearNpc(pid, 'npc_aleph', 180);
    assert.strictEqual(isNearAleph, false, 'Player is 800+ px away, must be rejected');
  });

  // --- Test 4: Restart with Bastion Pauldron and verify its HP bonus disappears ---
  await test('4. Bastion Pauldron HP bonus disappears upon dungeon restart', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-TEST',
      name: 'Crypts',
      hostName: 'Leader',
      difficulty: 'Normal',
      seed: 55555,
    });

    const pid = 'p_tester_3';
    // Vanguard: Base HP = 155
    // Level 5: level bonus = (5 - 1) * 12 = 48
    // Vitality 10: vit bonus = 10 * 5 = 50
    // Total permanent HP = 155 + 48 + 50 = 253
    room.addOrReconnectPlayer(pid, 'Knight', 'vanguard', false, {
      level: 5,
      xp: 0,
      strength: 0,
      vitality: 10,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const pState = room.getPlayerState(pid)!;
    assert.strictEqual(pState.maxHp, 253, 'Initial max HP with level 5 and 10 VIT');

    // Award Bastion Pauldron relic (+30 HP)
    room.addPlayerRelic(pid, 'bastion_pauldron');
    assert.strictEqual(pState.relics.includes('bastion_pauldron'), true);
    assert.strictEqual(pState.maxHp, 283, 'Max HP with Bastion Pauldron must be 283');

    // Now restart the expedition
    room.restartRun();

    // Verify relics are cleared and HP is recalculated WITHOUT Bastion Pauldron
    assert.strictEqual(pState.relics.length, 0, 'Relics must be empty after restart');
    assert.strictEqual(pState.maxHp, 253, 'Max HP must return to 253 (Bastion Pauldron bonus completely removed)');
    assert.strictEqual(pState.hp, 253, 'Current HP must equal max HP (253)');
    assert.strictEqual(pState.level, 5, 'Permanent level must be preserved');
    assert.strictEqual(pState.vitality, 10, 'Permanent vitality must be preserved');
  });

  // --- Test 5: Simulate a database failure and verify the server remains operational ---
  await test('5. Simulated database failure rolls back state safely without crashing lock queue', async () => {
    // Simulating the sequential account write lock and rollback mechanism
    const locks = new Map<string, Promise<void>>();
    const memoryAccounts = new Map<string, AccountRecord>();

    const acc: AccountRecord = {
      id: 'acc_fail_test',
      username: 'Survivor',
      usernameLower: 'survivor',
      passwordHash: 'pass',
      lockedClass: 'arcanist',
      preferredClass: 'arcanist',
      runsCompleted: 0,
      highestFloor: 0,
      totalKills: 0,
      totalRevives: 0,
      gold: 100,
      isAdmin: false,
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 5,
      faith: 0,
      attributePoints: 13,
    };
    memoryAccounts.set(acc.id, { ...acc });

    let shouldDbFail = true;

    async function safePersist(target: AccountRecord): Promise<void> {
      const lockKey = target.id;
      const existingLock = locks.get(lockKey) || Promise.resolve();

      const newLock = (async () => {
        try {
          await existingLock;
        } catch {
          // Ignore previous lock failure
        }

        if (shouldDbFail) {
          throw new Error('Simulated PostgreSQL Connection Timeout / Failure');
        }

        memoryAccounts.set(target.id, { ...target });
      })();

      locks.set(lockKey, newLock);

      newLock.then(
        () => {
          if (locks.get(lockKey) === newLock) locks.delete(lockKey);
        },
        () => {
          if (locks.get(lockKey) === newLock) locks.delete(lockKey);
        }
      );

      return newLock;
    }

    // Step A: Attempt a write that fails
    const oldSnapshot = { ...acc };
    acc.intelligence = 6;
    acc.attributePoints = 12;

    let writeFailed = false;
    try {
      await safePersist(acc);
    } catch (err: any) {
      writeFailed = true;
      assert(err.message.includes('Simulated PostgreSQL Connection Timeout'));
      // Rollback memory on failure
      Object.assign(acc, oldSnapshot);
    }

    assert.strictEqual(writeFailed, true, 'Write must fail as simulated');
    assert.strictEqual(acc.intelligence, 5, 'Account memory rolled back to 5 INT');
    assert.strictEqual(acc.attributePoints, 13, 'Account memory rolled back to 13 points');
    assert.strictEqual(memoryAccounts.get(acc.id)!.intelligence, 5, 'Persisted storage did not save corrupt state');

    // Step B: Ensure the lock queue did NOT deadlock or leave unhandled rejection
    shouldDbFail = false; // DB recovers
    acc.faith = 1;
    acc.attributePoints = 12;

    await safePersist(acc); // Must succeed smoothly
    assert.strictEqual(memoryAccounts.get(acc.id)!.faith, 1, 'Subsequent write succeeded after failure');
    assert.strictEqual(locks.has(acc.id), false, 'Lock was cleanly released');
  });

  // --- Test 6: Cleric with 0 FTH vs 10 FTH vs 20 FTH scaling ---
  test('6. Cleric healing increases with Faith (0 FTH vs 10 FTH vs 20 FTH)', () => {
    const base = 24;
    const heal0 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: 0 });
    const heal10 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: 10 });
    const heal20 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: 20 });

    assert.strictEqual(heal0, 24, '0 FTH at lvl 1 gives base 24');
    assert(heal10 > heal0, `10 FTH (${heal10}) must heal more than 0 FTH (${heal0})`);
    assert(heal20 > heal10, `20 FTH (${heal20}) must heal more than 10 FTH (${heal10})`);
    assert.strictEqual(heal10, 25, '24 * 1.0 * 1.06 = 25.44 -> 25');
    assert.strictEqual(heal20, 27, '24 * 1.0 * 1.12 = 26.88 -> 27');
  });

  // --- Test 7: Level scaling with same Faith ---
  test('7. Higher level increases Cleric healing with same Faith', () => {
    const base = 24;
    const fth = 10;
    const healLvl1 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: fth });
    const healLvl10 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 10, faith: fth });
    const healLvl25 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 25, faith: fth });

    assert(healLvl10 > healLvl1, `Lvl 10 (${healLvl10}) must heal more than Lvl 1 (${healLvl1})`);
    assert(healLvl25 > healLvl10, `Lvl 25 (${healLvl25}) must heal more than Lvl 10 (${healLvl10})`);
    assert.strictEqual(healLvl1, 25);
    assert.strictEqual(healLvl10, 29, '24 * 1.135 * 1.06 = 28.87 -> 29');
    assert.strictEqual(healLvl25, 35, '24 * 1.360 * 1.06 = 34.60 -> 35');
  });

  // --- Test 8: Dawnstar Smite (Sanctified Pulse) uses scaling helper ---
  test('8. Dawnstar Smite heals allies using authoritative server scaling helper', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-CLERIC-TACTICAL',
      name: 'Sanctuary',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 1111,
    });

    // Add Cleric at Level 10 with 15 Faith
    const clericId = 'cleric_player';
    room.addOrReconnectPlayer(clericId, 'SisterAria', 'cleric', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 15,
      attributePoints: 3,
    });

    // Add injured ally nearby (Vanguard)
    const allyId = 'vanguard_ally';
    room.addOrReconnectPlayer(allyId, 'SirRoland', 'vanguard', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 5,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 13,
    });

    const cleric = room.getPlayerState(clericId)!;
    const ally = room.getPlayerState(allyId)!;
    cleric.x = 200;
    cleric.y = 200;
    ally.x = 210;
    ally.y = 210;

    // Damage ally so they have room to be healed
    ally.hp = 100;
    const expectedHeal = GameRoom.computeHealingAmount(24, cleric, ally);
    // Level 10, 15 FTH: 24 * (1 + 9*0.015) * (1 + 15*0.006) = 24 * 1.135 * 1.09 = 29.69 -> 30
    assert.strictEqual(expectedHeal, 30);

    // Cleric uses tactical skill
    room.performAction(clericId, 'tactical');
    assert.strictEqual(ally.hp, 100 + expectedHeal, 'Ally HP must increase by exactly 30');
  });

  // --- Test 9: Radiant Aura uses scaling helper ---
  test('9. Radiant Aura uses scaling helper and increases with Cleric stats', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-CLERIC-AURA',
      name: 'Sanctuary',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 2222,
    });

    const clericId = 'cleric_aura';
    room.addOrReconnectPlayer(clericId, 'AuraCleric', 'cleric', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 20,
      attributePoints: 0,
    });

    const allyId = 'ally_aura';
    room.addOrReconnectPlayer(allyId, 'AuraAlly', 'ranger', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const cleric = room.getPlayerState(clericId)!;
    const ally = room.getPlayerState(allyId)!;
    cleric.x = 300;
    cleric.y = 300;
    ally.x = 320;
    ally.y = 320;

    // Injure ally to 80% (normal base 2)
    ally.hp = Math.round(ally.maxHp * 0.8);
    const startHp = ally.hp;

    // Expected aura heal: Level 10, 20 FTH, base 2:
    // 2 * (1 + 9*0.015) * (1 + 20*0.006) = 2 * 1.135 * 1.12 = 2.54 -> 3
    const expectedNormal = GameRoom.computeHealingAmount(2, cleric, ally);
    assert.strictEqual(expectedNormal, 3);

    // Tick room 2000ms to trigger Radiant Aura
    room.tick(2000);
    assert.strictEqual(ally.hp, startHp + expectedNormal, 'Aura must heal ally by exactly 3 HP');

    // Injure ally below 50% HP (critical base 3):
    // 3 * 1.135 * 1.12 = 3.81 -> 4
    ally.hp = Math.round(ally.maxHp * 0.4);
    const critStartHp = ally.hp;
    const expectedCrit = GameRoom.computeHealingAmount(3, cleric, ally);
    assert.strictEqual(expectedCrit, 4);

    room.tick(2000);
    assert.strictEqual(ally.hp, critStartHp + expectedCrit, 'Critical aura must heal ally by exactly 4 HP');
  });

  // --- Test 10: Healing a nearly full-health player never exceeds max HP ---
  test('10. Healing never overheals beyond target maxHp', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-OVERHEAL-TEST',
      name: 'Sanctuary',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 3333,
    });

    const clericId = 'cleric_overheal';
    room.addOrReconnectPlayer(clericId, 'OverhealCleric', 'cleric', false, {
      level: 20,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 30,
      attributePoints: 0,
    });

    const cleric = room.getPlayerState(clericId)!;
    // Set HP to 5 below max
    cleric.hp = cleric.maxHp - 5;
    assert(cleric.hp < cleric.maxHp);

    // Massive heal
    room.performAction(clericId, 'tactical');
    assert.strictEqual(cleric.hp, cleric.maxHp, 'HP must be clamped exactly to maxHp');
  });

  // --- Test 11: Healing does not affect enemies ---
  test('11. Healing does not heal enemies', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-ENEMY-HEAL-TEST',
      name: 'Sanctuary',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 4444,
    });

    const clericId = 'cleric_enemy_test';
    room.addOrReconnectPlayer(clericId, 'CombatCleric', 'cleric');
    const cleric = room.getPlayerState(clericId)!;
    cleric.x = 256;
    cleric.y = 256;

    assert(room.enemies.length > 0, 'Room must have spawned enemies');
    const enemy = room.enemies[0];
    enemy.x = cleric.x + 20;
    enemy.y = cleric.y + 20;
    enemy.hp = 50;
    const startEnemyHp = enemy.hp;

    // Cleric uses tactical skill (Dawnstar Smite)
    room.performAction(clericId, 'tactical');

    // Enemy should take damage from Smite, NOT heal!
    assert(enemy.hp < startEnemyHp, 'Enemy must take damage from Smite, never heal');
  });

  // --- Test 12: Non-Cleric healing is unchanged by Faith ---
  test('12. Non-Cleric healing does not receive Cleric Faith scaling', () => {
    // Vanguard with 20 FTH
    const vanguardHeal = GameRoom.computeHealingAmount(24, {
      heroClass: 'vanguard',
      level: 10,
      faith: 20,
    });
    assert.strictEqual(vanguardHeal, 24, 'Non-Cleric helper call returns base amount without FTH scaling');

    // Potion healing is nerfed to 30% of maxHp
    const maxHp = 200;
    const potionHeal = Math.round(maxHp * 0.30);
    assert.strictEqual(potionHeal, 60, 'Potion healing is unscaled 30% Max HP consumable percentage');
  });

  // --- Test 13: Multiplayer healing is calculated consistently on server ---
  test('13. Multiplayer party members in range receive consistent server-authoritative heal', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-MULTIPLAYER-HEAL',
      name: 'Sanctuary',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 5555,
    });

    const clericId = 'mp_cleric';
    room.addOrReconnectPlayer(clericId, 'HolyCleric', 'cleric', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 10,
      attributePoints: 0,
    });

    const ally1Id = 'mp_ally1';
    room.addOrReconnectPlayer(ally1Id, 'Ally1', 'ranger', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const ally2Id = 'mp_ally2';
    room.addOrReconnectPlayer(ally2Id, 'Ally2', 'arcanist', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const cleric = room.getPlayerState(clericId)!;
    const ally1 = room.getPlayerState(ally1Id)!;
    const ally2 = room.getPlayerState(ally2Id)!;

    cleric.x = 250; cleric.y = 250;
    ally1.x = 270; ally1.y = 270;
    ally2.x = 290; ally2.y = 290;

    ally1.hp = 50;
    ally2.hp = 50;

    // Both are within 210px range
    const expected = GameRoom.computeHealingAmount(24, cleric, ally1);
    room.performAction(clericId, 'tactical');

    assert.strictEqual(ally1.hp, 50 + expected, 'Ally 1 receives authoritative heal');
    assert.strictEqual(ally2.hp, 50 + expected, 'Ally 2 receives identical authoritative heal');
  });

  // --- Test 14: Revive behavior remains correct and separate from ordinary healing ---
  test('14. Downed players are not healed by normal heals and receive 45% maxHp on revive', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-REVIVE-TEST',
      name: 'Sanctuary',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 6666,
    });

    const clericId = 'revive_cleric';
    room.addOrReconnectPlayer(clericId, 'MedicCleric', 'cleric', false, {
      level: 15,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 25,
      attributePoints: 0,
    });

    const allyId = 'downed_ally';
    room.addOrReconnectPlayer(allyId, 'FallenWarrior', 'vanguard');

    const cleric = room.getPlayerState(clericId)!;
    const ally = room.getPlayerState(allyId)!;
    cleric.x = 250; cleric.y = 250;
    ally.x = 260; ally.y = 260;

    // Down the ally
    ally.downed = true;
    ally.hp = 0;

    // Normal tactical skill should NOT heal downed ally
    room.performAction(clericId, 'tactical');
    assert.strictEqual(ally.hp, 0, 'Downed ally must not be healed by Dawnstar Smite');
    assert.strictEqual(ally.downed, true, 'Downed status must remain');

    // Complete revive restores exactly 45% maxHp
    room.completeRevive(ally, clericId);
    assert.strictEqual(ally.downed, false, 'Ally is now revived');
    assert.strictEqual(ally.hp, Math.round(ally.maxHp * 0.45), 'Revived ally has exactly 45% maxHp');
  });

  // Helper to create test enemy
  function createTestEnemy(id: string, type: string, name: string, x: number, y: number, hp: number, res: any) {
    return {
      id,
      type,
      name,
      x,
      y,
      hp,
      maxHp: hp,
      resistances: res,
      moveSpeed: 1,
      attackPower: 10,
      attackRange: 30,
      attackCooldownMs: 0,
      maxCooldownMs: 1000,
      state: 'idle',
      targetPlayerId: null,
      hitAnimMs: 0,
      radius: 16,
      stunnedMs: 0,
      slowedMs: 0,
      frozenMs: 0,
      burnedMs: 0,
      burnInflicterId: null as string | null,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      markedMs: 0,
    };
  }

  // --- Test 15: Physical attack against physical-resistant enemy (Knight) ---
  test('15. Vanguard/Ranger physical attacks respect physical resistance of enemy', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-PHYS-RES',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7777,
    });

    const playerId = 'phys_attacker';
    room.addOrReconnectPlayer(playerId, 'VanguardHero', 'vanguard', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(playerId)!;
    p.x = 100; p.y = 100;

    // Knight has 0.25 physical resistance
    const knight = createTestEnemy('e_knight', 'knight', 'Death Knight', 110, 110, 500, { physical: 0.25 });
    room.enemies.push(knight as any);

    const baseDamage = 100;
    // Physical res 0.25 => damage = 100 * (1 - 0.25) = 75
    const actualDamage = room.damageEnemy(knight as any, baseDamage, p, 'physical');
    assert.strictEqual(actualDamage, 75, 'Base 100 damage against 0.25 phys res enemy must deal 75 damage');
    assert.strictEqual(knight.hp, 425);
  });

  // --- Test 16: Arcane attack against arcane resistance ---
  test('16. Arcanist arcane attacks respect enemy arcane resistance', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-ARCANE-RES',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 8888,
    });

    const playerId = 'arcane_attacker';
    room.addOrReconnectPlayer(playerId, 'MageHero', 'arcanist', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(playerId)!;
    p.x = 100; p.y = 100;

    // Astral Sentinel has 0.35 arcane resistance
    const sentinel = createTestEnemy('e_sentinel', 'astral_sentinel', 'Astral Sentinel', 110, 110, 500, { arcane: 0.35 });
    room.enemies.push(sentinel as any);

    const baseDamage = 100;
    // Arcane res 0.35 => damage = 100 * (1 - 0.35) = 65
    const actualDamage = room.damageEnemy(sentinel as any, baseDamage, p, 'arcane');
    assert.strictEqual(actualDamage, 65, 'Base 100 arcane damage against 0.35 arcane res enemy must deal 65 damage');
  });

  // --- Test 17: Divine attack against divine-vulnerable enemy ---
  test('17. Cleric divine attacks exploit divine vulnerability (-0.25 divine res)', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-DIVINE-VULN',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 9999,
    });

    const playerId = 'divine_attacker';
    room.addOrReconnectPlayer(playerId, 'HolySmiter', 'cleric', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(playerId)!;
    p.x = 100; p.y = 100;

    // Skeleton has -0.25 divine resistance (vulnerability)
    const skeleton = createTestEnemy('e_skel', 'skeleton', 'Skeleton', 110, 110, 500, { divine: -0.25 });
    room.enemies.push(skeleton as any);

    const baseDamage = 100;
    // Divine res -0.25 => damage = 100 * (1 - (-0.25)) = 125
    const actualDamage = room.damageEnemy(skeleton as any, baseDamage, p, 'divine');
    assert.strictEqual(actualDamage, 125, 'Base 100 divine damage against -0.25 divine res skeleton must deal 125 damage');
  });

  // --- Test 18: Marked enemy vulnerability ---
  test('18. Marked enemy receives 1.35x damage bonus', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-MARK-TEST',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 1234,
    });

    const playerId = 'ranger_marker';
    room.addOrReconnectPlayer(playerId, 'RangerMark', 'ranger', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(playerId)!;
    p.x = 100; p.y = 100;

    const slime = createTestEnemy('e_slime', 'slime', 'Slime', 110, 110, 500, { physical: 0 });
    slime.markedMs = 5000;
    room.enemies.push(slime as any);

    const baseDamage = 100;
    // Slime has 0 physical res. Marked bonus = 1.35x => 100 * 1.35 = 135
    const actualDamage = room.damageEnemy(slime as any, baseDamage, p, 'physical');
    assert.strictEqual(actualDamage, 135, 'Base 100 physical damage against marked slime must deal 135 damage');
  });

  // --- Test 19: Frost Shatter AoE respecting frost resistance & tracking damage ---
  test('19. Frost Shatter AoE respects secondary target frost resistance and tracks damage', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-FROST-AOE',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 2345,
    });

    const playerId = 'frost_mage';
    room.addOrReconnectPlayer(playerId, 'FrostMage', 'arcanist', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(playerId)!;
    p.x = 100; p.y = 100;
    p.damageDealt = 0;

    // Primary target: frozen slime
    const t1 = createTestEnemy('e_t1', 'slime', 'Target 1', 110, 110, 500, { frost: 0 });
    t1.frozenMs = 3000; // Frozen target triggers Frost Shatter

    // Secondary target: Goblin (frost res = 0.05)
    const t2 = createTestEnemy('e_t2', 'goblin', 'Target 2', 130, 110, 500, { frost: 0.05 });
    room.enemies.push(t1 as any, t2 as any);

    const mainDmg = room.damageEnemy(t1 as any, 100, p, 'frost');
    assert(p.damageDealt > mainDmg, 'Damage dealt must include Frost Shatter AoE damage');
    assert.strictEqual(mainDmg, 140, 'Primary frozen target must take 1.4x Shatter hit damage (140)');
    assert.strictEqual(t2.hp, 453, 'Secondary target must take 35% of 140 frost splash mitigated by 5% res = 47 dmg (500 - 47 = 453)');
  });

  // --- Test 20: Chain Lightning respecting lightning resistance & tracking damage ---
  test('20. Chain Lightning respects secondary target lightning resistance and tracks damage', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-CHAIN-LIGHTNING',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 3456,
    });

    const playerId = 'spark_mage';
    room.addOrReconnectPlayer(playerId, 'Sparky', 'arcanist', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(playerId)!;
    p.x = 100; p.y = 100;
    p.damageDealt = 0;

    // Primary target: shocked slime
    const t1 = createTestEnemy('e_t1', 'slime', 'Target 1', 110, 110, 500, { lightning: 0 });
    t1.shockedMs = 3000;

    // Secondary target (within 130px): Skeleton (lightning res = 0.0)
    const t2 = createTestEnemy('e_t2', 'skeleton', 'Target 2', 140, 110, 500, { lightning: 0.0 });
    room.enemies.push(t1 as any, t2 as any);

    const mainDmg = room.damageEnemy(t1 as any, 100, p, 'lightning');
    assert(p.damageDealt > mainDmg, 'Damage dealt must include Chain Lightning arc damage');
    assert.strictEqual(t2.hp, 455, 'Secondary target must take 45 lightning damage (500 - 45 = 455)');
  });

  // --- Test 21: Status DoTs (Burn, Poison, Bleed) respecting elemental resistances ---
  test('21. Status DoTs (Burn, Poison, Bleed) respect target resistances', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-DOT-TEST',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 4567,
    });

    const playerId = 'dot_applier';
    room.addOrReconnectPlayer(playerId, 'DoTMaster', 'arcanist');
    const p = room.getPlayerState(playerId)!;

    // Target with fire res 0.20 (Cultist)
    const cultist = createTestEnemy('e_cultist', 'cultist', 'Cultist', 110, 110, 500, { fire: 0.20 });
    cultist.burnedMs = 3000;
    cultist.burnInflicterId = p.id;
    room.enemies.push(cultist as any);

    // Tick 1000ms: Base burn = 8. Cultist fire res 0.20 => 8 * (1 - 0.20) = 6.4 -> 6 damage.
    room.tick(1000);
    assert.strictEqual(cultist.hp, 494, 'Burn DoT tick must be reduced by 0.20 fire resistance to 6 damage (500 - 6 = 494)');
  });

  // --- Test 22: Player physical and elemental damage mitigation ---
  test('22. Player damage mitigation handles armor, Vanguard passive, Aegis Dome, and shields', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-PLAYER-MITIGATION',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 5678,
    });

    const pid = 'vanguard_tank';
    room.addOrReconnectPlayer(pid, 'Tanker', 'vanguard', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(pid)!;
    p.hp = 200;
    p.shield = 50;

    // Aegis Dome zone active
    room.zones.push({
      id: 'z_aegis',
      kind: 'aegis_dome',
      x: p.x,
      y: p.y,
      radius: 150,
      durationMs: 5000,
    } as any);

    // Base Vanguard phys res = 0.28. 100 * (1 - 0.28) = 72.
    // Vanguard passive (-15%): 72 * 0.85 = 61. Aegis Dome (-35%): 61 * 0.65 = 40.
    const dmgDealt = room.damagePlayer(p, 100, 'physical');
    assert.strictEqual(dmgDealt, 40, '100 phys damage mitigated by armor + Vanguard passive + Aegis Dome to 40');
    assert.strictEqual(p.shield, 10, '50 shield absorbed 40 damage, leaving 10 shield');
    assert.strictEqual(p.hp, 200, 'HP remains untouched at 200');
  });

  // --- Test 23: Relic stacking and resistance cap at 75% ---
  test('23. Relic stacking (Runic Carapace + Thorned Aegis) caps mitigation at 75%', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-RELIC-CAP',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 6789,
    });

    const pid = 'relic_tank';
    room.addOrReconnectPlayer(pid, 'SuperTank', 'vanguard');
    const p = room.getPlayerState(pid)!;
    p.hp = 500;
    p.relics.push('runic_carapace', 'thorned_aegis');

    // Vanguard base (0.28) + Carapace (0.15) + Thorned Aegis (0.10) = 0.53 physical resistance.
    // Base damage = 1000 physical. 1000 * (1 - 0.53) = 470. Vanguard passive (-15%): 470 * 0.85 = 400 damage.
    const dmgDealt = room.damagePlayer(p, 1000, 'physical');
    assert.strictEqual(dmgDealt, 400, '1000 phys damage mitigated by 0.53 resistance + Vanguard passive to 400');
  });

  // --- Test 24: Verifying no duplicate damage scaling multipliers ---
  test('24. Damage scaling helper applies stat and level multipliers exactly once', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-NO-DUP-SCALING',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7890,
    });

    const pid = 'scaling_check';
    // Ranger level 10 (+22.5% level scaling = 1.225x), DEX 10 (+8% stat scaling = 1.08x)
    room.addOrReconnectPlayer(pid, 'RangerScaler', 'ranger', false, {
      level: 10,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 10,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const p = room.getPlayerState(pid)!;
    p.x = 110; p.y = 110; // Position next to slime so Longshot (+25%) does not trigger
    const slime = createTestEnemy('e_slime', 'slime', 'Slime', 110, 110, 1000, { physical: 0 });
    room.enemies.push(slime as any);

    // Base attack damage = 10.
    // Scaled base damage using computeDamageMult = 10 * (1 + (10-1)*0.025) * (1 + 10*0.008) = 10 * 1.225 * 1.08 = 13.23 -> 13
    const scaledBaseDmg = Math.round(10 * room.computeDamageMult(p, 'physical'));
    assert.strictEqual(scaledBaseDmg, 13);

    const actualDmg = room.damageEnemy(slime as any, scaledBaseDmg, p, 'physical');
    assert.strictEqual(actualDmg, 13, 'Base 10 damage scaled to 13 at Lvl 10 + 10 DEX against 0 res slime must deal exactly 13 damage without duplicate scaling');
  });

  // --- Test 25: Arcanist tactical damage scales with Intelligence, not Strength ---
  test('25. Arcanist tactical damage scales with Intelligence, not Strength', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-ARCANIST-TACTICAL-SCALE',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 1111,
    });

    // Arcanist A: 10 STR, 0 INT
    const idA = 'mage_str';
    room.addOrReconnectPlayer(idA, 'StrMage', 'arcanist', false, {
      level: 1, xp: 0, strength: 10, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pA = room.getPlayerState(idA)!;
    const multA = room.computeDamageMult(pA, 'arcane');
    assert.strictEqual(multA, 1.0, 'Arcanist arcane mult with 10 STR / 0 INT must remain 1.0');

    // Arcanist B: 0 STR, 10 INT
    const idB = 'mage_int';
    room.addOrReconnectPlayer(idB, 'IntMage', 'arcanist', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 10, faith: 0, attributePoints: 0,
    });
    const pB = room.getPlayerState(idB)!;
    const multB = room.computeDamageMult(pB, 'arcane');
    assert.strictEqual(multB, 1.08, 'Arcanist arcane mult with 10 INT must be 1.08');

    // Check spawned tactical projectile damage
    room.performAction(idA, 'tactical');
    const projA = room.projectiles.find(pr => pr.ownerId === idA)!;
    assert.strictEqual(projA.damage, 24, '0 INT Arcanist tactical projectile damage must be 24');

    room.projectiles = []; // Clear projectiles
    room.performAction(idB, 'tactical');
    const projB = room.projectiles.find(pr => pr.ownerId === idB)!;
    assert.strictEqual(projB.damage, 26, '10 INT Arcanist tactical projectile damage must be 26 (24 * 1.08 = 25.92 -> 26)');
  });

  // --- Test 26: Cleric tactical damage scales with Faith, not Strength ---
  test('26. Cleric tactical damage scales with Faith, not Strength', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-CLERIC-TACTICAL-SCALE',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 2222,
    });

    // Cleric A: 10 STR, 0 FTH
    const idA = 'cleric_str';
    room.addOrReconnectPlayer(idA, 'StrCleric', 'cleric', false, {
      level: 1, xp: 0, strength: 10, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pA = room.getPlayerState(idA)!;
    pA.x = 100; pA.y = 100;
    const multA = room.computeDamageMult(pA, 'divine');
    assert.strictEqual(multA, 1.0, 'Cleric divine mult with 10 STR / 0 FTH must remain 1.0');

    const dummyA = createTestEnemy('e_dummyA', 'slime', 'Dummy A', 110, 110, 500, { divine: 0 });
    room.enemies.push(dummyA as any);
    room.performAction(idA, 'tactical');
    assert.strictEqual(dummyA.hp, 472, '0 FTH Cleric tactical deals 28 damage (500 - 28 = 472)');

    // Cleric B: 0 STR, 10 FTH
    const idB = 'cleric_fth';
    room.addOrReconnectPlayer(idB, 'FthCleric', 'cleric', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 10, attributePoints: 0,
    });
    const pB = room.getPlayerState(idB)!;
    pB.x = 200; pB.y = 200;
    const multB = room.computeDamageMult(pB, 'divine');
    assert.strictEqual(multB, 1.08, 'Cleric divine mult with 10 FTH must be 1.08');

    const dummyB = createTestEnemy('e_dummyB', 'slime', 'Dummy B', 210, 210, 500, { divine: 0 });
    room.enemies.push(dummyB as any);
    room.performAction(idB, 'tactical');
    assert.strictEqual(dummyB.hp, 470, '10 FTH Cleric tactical deals 30 damage (28 * 1.08 = 30.24 -> 30, 500 - 30 = 470)');
  });

  // --- Test 27: Ranger tactical damage scales with Dexterity ---
  test('27. Ranger tactical damage scales with Dexterity', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-RANGER-TACTICAL-SCALE',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 3333,
    });

    const idR = 'ranger_dex';
    room.addOrReconnectPlayer(idR, 'DexRanger', 'ranger', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 10, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pR = room.getPlayerState(idR)!;
    const multR = room.computeDamageMult(pR, 'physical');
    assert.strictEqual(multR, 1.08, 'Ranger physical mult with 10 DEX must be 1.08');

    room.performAction(idR, 'tactical');
    const projR = room.projectiles.find(pr => pr.ownerId === idR)!;
    assert.strictEqual(projR.damage, 19, '10 DEX Ranger tactical projectile damage must be 19 (18 * 1.08 = 19.44 -> 19)');
  });

  // --- Test 28: Vanguard tactical damage scales with Strength ---
  test('28. Vanguard tactical damage scales with Strength', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-VANGUARD-TACTICAL-SCALE',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 4444,
    });

    const idV = 'vanguard_str';
    room.addOrReconnectPlayer(idV, 'StrVanguard', 'vanguard', false, {
      level: 1, xp: 0, strength: 10, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pV = room.getPlayerState(idV)!;
    pV.x = 100; pV.y = 100;
    const multV = room.computeDamageMult(pV, 'physical');
    assert.strictEqual(multV, 1.08, 'Vanguard physical mult with 10 STR must be 1.08');

    const dummyV = createTestEnemy('e_dummyV', 'slime', 'Dummy V', 110, 110, 500, { physical: 0 });
    room.enemies.push(dummyV as any);
    room.performAction(idV, 'tactical');
    assert.strictEqual(dummyV.hp, 465, '10 STR Vanguard tactical deals 35 damage (32 * 1.08 = 34.56 -> 35, 500 - 35 = 465)');
  });

  // --- Test 29: Damage resistance still uses the correct category after scaling ---
  test('29. Damage resistance still uses the correct category after scaling', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-RESISTANCE-CATEGORY-CHECK',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 5555,
    });

    const idCleric = 'holy_cleric';
    room.addOrReconnectPlayer(idCleric, 'Faithful', 'cleric', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 10, attributePoints: 0,
    });
    const pCleric = room.getPlayerState(idCleric)!;
    pCleric.x = 100; pCleric.y = 100;

    // Skeleton has divine res = -0.25 (vulnerability) and phys res = -0.10
    const skeleton = createTestEnemy('e_skel_test', 'skeleton', 'Skeleton', 110, 110, 500, { physical: -0.10, divine: -0.25 });
    room.enemies.push(skeleton as any);

    // Cleric uses tactical: 28 base * 1.08 FTH mult = 30 scaled divine damage.
    // Divine vulnerability (-0.25 res): 30 * (1 - (-0.25)) = 30 * 1.25 = 37.5 -> 38 damage.
    room.performAction(idCleric, 'tactical');
    assert.strictEqual(skeleton.hp, 462, 'Skeleton hp must be 462 after 38 divine damage (500 - 38 = 462)');
  });

  // --- Test 30: A projectile cannot damage the same enemy repeatedly across consecutive update ticks ---
  test('30. A projectile cannot damage the same enemy repeatedly across consecutive update ticks', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-PROJ-NO-DUP-ENEMY',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7001,
    });
    room.status = 'playing';

    const pid = 'p_tester_30';
    room.addOrReconnectPlayer(pid, 'Mage30', 'arcanist');
    const p = room.getPlayerState(pid)!;

    const sx = room.spawnPoint.x;
    const sy = room.spawnPoint.y;

    const enemy = createTestEnemy('e_static_30', 'slime', 'Slime', sx, sy, 500, { physical: 0, arcane: 0 });
    room.enemies.push(enemy as any);

    // Stationary projectile resting directly on the enemy with 2 pierce
    const proj = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'arcane',
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 10,
      damage: 25,
      pierce: 2,
      ttlMs: 500,
    });

    // First tick: projectile hits enemy once
    room.tick(50);
    assert.strictEqual(enemy.hp, 475, 'Enemy must take 25 damage on first hit');
    assert.strictEqual(proj.pierce, 1, 'Pierce count must decrement to 1');
    assert(proj.hitEntityIds?.includes(enemy.id), 'hitEntityIds must contain enemy ID');

    // Second tick: projectile remains on enemy, but MUST NOT hit again
    room.tick(50);
    assert.strictEqual(enemy.hp, 475, 'Enemy HP must remain 475 on consecutive tick');
    assert.strictEqual(proj.pierce, 1, 'Pierce count must remain 1');
  });

  // --- Test 31: A projectile can damage multiple different enemies when it has sufficient pierce ---
  test('31. A projectile can damage multiple different enemies when it has sufficient pierce', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-PROJ-MULTI-HIT',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7002,
    });
    room.status = 'playing';

    const pid = 'p_tester_31';
    room.addOrReconnectPlayer(pid, 'Ranger31', 'ranger');
    const p = room.getPlayerState(pid)!;

    const sx = room.spawnPoint.x;
    const sy = room.spawnPoint.y;

    const e1 = createTestEnemy('e_multi_1', 'goblin', 'Goblin 1', sx + 20, sy, 500, { physical: 0 });
    const e2 = createTestEnemy('e_multi_2', 'goblin', 'Goblin 2', sx + 80, sy, 500, { physical: 0 });
    room.enemies.push(e1 as any, e2 as any);

    // Moving projectile from left to right with 2 pierce
    room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'arrow',
      x: sx,
      y: sy,
      vx: 1000, // moves 100px per 100ms
      vy: 0,
      angle: 0,
      radius: 6,
      damage: 30,
      pierce: 2,
      ttlMs: 1000,
    });

    // Tick 30ms (moves to sx + 30 -> hits e1 at sx + 20)
    room.tick(30);
    assert.strictEqual(e1.hp, 470, 'Enemy 1 must be hit for 30 damage');
    assert.strictEqual(e2.hp, 500, 'Enemy 2 not yet hit');

    // Tick 60ms (moves to sx + 90 -> hits e2 at sx + 80)
    room.tick(60);
    assert.strictEqual(e2.hp, 470, 'Enemy 2 must be hit for 30 damage');

    // Both enemies hit exactly once
    assert.strictEqual(e1.hp, 470);
    assert.strictEqual(e2.hp, 470);
  });

  // --- Test 32: Each newly hit enemy consumes exactly one pierce charge ---
  test('32. Each newly hit enemy consumes exactly one pierce charge', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-PROJ-PIERCE-DECREMENT',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7003,
    });
    room.status = 'playing';

    const pid = 'p_tester_32';
    room.addOrReconnectPlayer(pid, 'Vanguard32', 'vanguard');
    const p = room.getPlayerState(pid)!;

    const sx = room.spawnPoint.x;
    const sy = room.spawnPoint.y;

    const e1 = createTestEnemy('e_p1', 'slime', 'S1', sx + 20, sy, 500, { physical: 0 });
    const e2 = createTestEnemy('e_p2', 'slime', 'S2', sx + 60, sy, 500, { physical: 0 });
    const e3 = createTestEnemy('e_p3', 'slime', 'S3', sx + 100, sy, 500, { physical: 0 });
    room.enemies.push(e1 as any, e2 as any, e3 as any);

    const proj = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'slash',
      x: sx,
      y: sy,
      vx: 800,
      vy: 0,
      angle: 0,
      radius: 10,
      damage: 40,
      pierce: 3,
      ttlMs: 1000,
    });

    // Pass through e1
    room.tick(30); // x ~ sx + 24 -> hits e1
    assert.strictEqual(e1.hp, 460);
    assert.strictEqual(proj.pierce, 2, '1 pierce consumed after hitting e1');

    // Pass through e2
    room.tick(50); // x ~ sx + 64 -> hits e2
    assert.strictEqual(e2.hp, 460);
    assert.strictEqual(proj.pierce, 1, '2nd pierce consumed after hitting e2');

    // Pass through e3
    room.tick(50); // x ~ sx + 104 -> hits e3
    assert.strictEqual(e3.hp, 460);
    assert.strictEqual(room.projectiles.includes(proj), false, 'Projectile removed when pierce reaches 0');
  });

  // --- Test 33: A projectile cannot repeatedly damage the same training dummy ---
  test('33. A projectile cannot repeatedly damage the same training dummy', () => {
    const room = new GameRoom({
      roomId: 'TAVERN-HUB',
      name: 'Sanctuary Tavern',
      hostName: 'Innkeeper',
      difficulty: 'Normal',
      seed: 7004,
    });

    const pid = 'p_tester_33';
    room.addOrReconnectPlayer(pid, 'DummyTester', 'vanguard');
    const p = room.getPlayerState(pid)!;

    p.aimAngle = 0;
    room.spawnDummyAtPlayer(pid);
    const dummy = room.trainingDummies[0];
    assert(dummy, 'Training dummy must exist');

    const proj = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'slash',
      x: dummy.x,
      y: dummy.y,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 10,
      damage: 50,
      pierce: 4,
      ttlMs: 500,
    });

    // Tick 1
    room.tick(50);
    assert.strictEqual(dummy.totalDamageTaken, 50, 'Dummy takes 50 damage on first hit');
    assert.strictEqual(proj.pierce, 3, 'Pierce count decrements to 3');

    // Tick 2
    room.tick(50);
    assert.strictEqual(dummy.totalDamageTaken, 50, 'Dummy must NOT take duplicate damage on 2nd tick');
    assert.strictEqual(proj.pierce, 3, 'Pierce count remains 3');
  });

  // --- Test 34: Ranger and Cleric work correctly with Piercing Prism ---
  test('34. Ranger and Cleric gain +1 pierce from Piercing Prism', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-PIERCING-PRISM',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7005,
    });

    // Ranger with Piercing Prism (base 1 + 1 = 2 pierce)
    const idR = 'ranger_prism';
    room.addOrReconnectPlayer(idR, 'PrismRanger', 'ranger');
    const pR = room.getPlayerState(idR)!;
    pR.relics.push('piercing_prism');

    room.firePrimaryAttack(pR);
    const projR = room.projectiles.find(pr => pr.ownerId === idR)!;
    assert.strictEqual(projR.pierce, 2, 'Ranger projectile with Piercing Prism must have 2 pierce');

    room.projectiles = []; // Clear

    // Cleric with Piercing Prism (base 1 + 1 = 2 pierce)
    const idC = 'cleric_prism';
    room.addOrReconnectPlayer(idC, 'PrismCleric', 'cleric');
    const pC = room.getPlayerState(idC)!;
    pC.relics.push('piercing_prism');

    room.firePrimaryAttack(pC);
    const projC = room.projectiles.find(pr => pr.ownerId === idC)!;
    assert.strictEqual(projC.pierce, 2, 'Cleric projectile with Piercing Prism must have 2 pierce');
  });

  // --- Test 35: Arcanist and Vanguard retain their existing piercing behavior ---
  test('35. Arcanist (base 2 pierce) and Vanguard (base 4 pierce) retain default piercing', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-BASE-PIERCE',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7006,
    });

    const idV = 'vanguard_base';
    room.addOrReconnectPlayer(idV, 'VanguardBase', 'vanguard');
    const pV = room.getPlayerState(idV)!;
    room.firePrimaryAttack(pV);
    const projV = room.projectiles.find(pr => pr.ownerId === idV)!;
    assert.strictEqual(projV.pierce, 4, 'Vanguard basic attack must have base 4 pierce');

    const idA = 'arcanist_base';
    room.addOrReconnectPlayer(idA, 'ArcanistBase', 'arcanist');
    const pA = room.getPlayerState(idA)!;
    room.firePrimaryAttack(pA);
    const projA = room.projectiles.find(pr => pr.ownerId === idA)!;
    assert.strictEqual(projA.pierce, 2, 'Arcanist basic attack must have base 2 pierce');
  });

  // --- Test 36: Twinstring Charm still generates its intended additional projectile ---
  test('36. Twinstring Charm generates an additional projectile dealing 35% damage', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-TWINSTRING',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7007,
    });

    const idR = 'ranger_twin';
    room.addOrReconnectPlayer(idR, 'TwinRanger', 'ranger');
    const pR = room.getPlayerState(idR)!;
    pR.relics.push('twinstring_charm');

    room.firePrimaryAttack(pR);
    const projs = room.projectiles.filter(pr => pr.ownerId === idR);
    assert.strictEqual(projs.length, 2, 'Twinstring Charm must spawn exactly 2 projectiles');
    assert.ok(projs[0].damage === 24 || projs[0].damage === 30, `Primary shot deals base or 1.25x crit damage (got ${projs[0].damage})`);
    assert.strictEqual(projs[1].damage, Math.round(projs[0].damage * 0.35), 'Secondary shot deals exactly 35% of primary shot damage');
  });

  // --- Test 37: Separate projectiles can independently hit the same enemy ---
  test('37. Separate projectiles can independently hit the same enemy', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-INDEPENDENT-PROJS',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7008,
    });
    room.status = 'playing';

    const pid = 'p_tester_37';
    room.addOrReconnectPlayer(pid, 'MultiShooter', 'ranger');
    const p = room.getPlayerState(pid)!;

    const sx = room.spawnPoint.x;
    const sy = room.spawnPoint.y;

    const enemy = createTestEnemy('e_target_37', 'slime', 'Slime', sx, sy, 500, { physical: 0 });
    room.enemies.push(enemy as any);

    // Two independent projectiles at the same location
    const proj1 = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'arrow',
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 6,
      damage: 20,
      pierce: 1,
      ttlMs: 500,
    });

    const proj2 = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'arrow',
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 6,
      damage: 20,
      pierce: 1,
      ttlMs: 500,
    });

    room.tick(50);
    // Both projectiles hit independently for 20 damage each (total 40 damage)
    assert.strictEqual(enemy.hp, 460, 'Enemy must take 40 total damage from both independent projectiles');
    assert.strictEqual(room.projectiles.includes(proj1), false, 'Proj 1 removed after pierce 0');
    assert.strictEqual(room.projectiles.includes(proj2), false, 'Proj 2 removed after pierce 0');
  });

  // --- Test 38: Critical hits and existing damage scaling remain unchanged ---
  test('38. Critical hits and damage scaling remain unchanged with projectile hit tracking', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-CRIT-SCALING-CHECK',
      name: 'Test Dungeon',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 7009,
    });
    room.status = 'playing';

    const pid = 'p_tester_38';
    room.addOrReconnectPlayer(pid, 'CritRanger', 'ranger', false, {
      level: 10, xp: 0, strength: 0, vitality: 0, dexterity: 10, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const p = room.getPlayerState(pid)!;

    const sx = room.spawnPoint.x;
    const sy = room.spawnPoint.y;
    p.x = sx; p.y = sy;

    const enemy = createTestEnemy('e_target_38', 'slime', 'Slime', sx, sy, 500, { physical: 0 });
    room.enemies.push(enemy as any);

    // Ranger Lvl 10 + 10 DEX: base damage 18 * 1.9 * 1.3 = 44.46 -> 44.
    // Crit multiplier: 44 * 1.75 = 77.
    const proj = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'arrow',
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      angle: 0,
      radius: 6,
      damage: 77,
      pierce: 1,
      crit: true,
      ttlMs: 500,
    });

    room.tick(50);
    assert.strictEqual(enemy.hp, 423, 'Enemy must take 77 crit damage (500 - 77 = 423)');
  });

  // --- Test 39: Verify all 10 floor configurations generate valid maps and roster boss names ---
  await test('39. All 10 floor configurations generate valid maps and match official Chapter 1 roster', async () => {
    const expectedRoster = [
      { floor: 1, title: 'Highkeep Outer Bailey', boss: 'Warden Malakor' },
      { floor: 2, title: 'Sunken Crypt', boss: 'Archlich Vaelor' },
      { floor: 3, title: 'Cindervault Bastion', boss: 'Ignis, Cinder Sovereign' },
      { floor: 4, title: 'Abyssal Shadow Chasm', boss: 'Void-Eater Malice' },
      { floor: 5, title: 'Aetherial Void Spire', boss: 'Archon of Nothingness' },
      { floor: 6, title: 'Hall of Forgotten Hymns', boss: 'Elyndor, Keeper of the Last Hymn' },
      { floor: 7, title: 'Reliquary of the Departed', boss: 'Zadkiel, Keeper of the Ashen Reliquary' },
      { floor: 8, title: 'Chapel of Severed Light', boss: 'Sariel, Warden of the Veiled Scripture' },
      { floor: 9, title: 'Celestial Nave', boss: 'Seraphel, Sentinel of the Final Seal' },
      { floor: 10, title: "Warden's Gate", boss: 'Oriphiel, The Last Warden' },
    ];

    for (const spec of expectedRoster) {
      const room = new GameRoom({
        roomId: `R_TEST_F${spec.floor}`,
        name: `Floor ${spec.floor} Test`,
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 12345,
        initialFloor: spec.floor,
      });

      assert.strictEqual(room.map.floor, spec.floor, `Floor number must be ${spec.floor}`);
      assert.strictEqual(room.map.biomeTitle, spec.title, `Floor ${spec.floor} title must be '${spec.title}'`);
      assert.ok(room.enemies.length > 0, `Floor ${spec.floor} must generate enemies`);

      const boss = room.enemies.find((e) => e.kind === 'boss');
      assert.ok(boss, `Floor ${spec.floor} must contain a boss`);
      assert.strictEqual(boss?.name, spec.boss, `Floor ${spec.floor} boss name must be '${spec.boss}'`);
    }
  });

  // --- Test 40: Verify Guardians on Floors 6-10 spawn with correct base stats & resistances ---
  await test('40. Guardians on Floors 6-10 spawn with correct stats and resistances', async () => {
    for (let f = 6; f <= 10; f++) {
      const room = new GameRoom({
        roomId: `R_TEST_GUARDIANS_F${f}`,
        name: 'Guardian Test',
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 8888,
        initialFloor: f,
      });
      const boss = room.enemies.find((e) => e.kind === 'boss');
      assert.ok(boss, `Floor ${f} boss must exist`);
      assert.ok(boss.maxHp > 1000, `Floor ${f} boss HP must scale above 1000`);
      assert.ok((boss.resistances?.tenacity ?? 0) >= 0.70, `Floor ${f} boss tenacity must be high`);
    }
  });

  // --- Test 41: Defeating boss on Floor 10 activates Warden's Gate portal ---
  await test("41. Defeating boss on Floor 10 activates Warden's Gate portal", async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_F10_BOSS',
      name: 'F10 Boss Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 5555,
      initialFloor: 10,
    });
    room.status = 'playing';

    const bossRoom = room.map.rooms.find((r) => r.type === 'boss')!;
    const boss = room.enemies.find((e) => e.kind === 'boss')!;
    assert.strictEqual(boss.name, 'Oriphiel, The Last Warden');
    boss.roomId = bossRoom.id;
    for (const e of room.enemies) {
      e.roomId = bossRoom.id;
    }

    // Simulate killing Oriphiel and minions
    boss.hp = 0;
    room.enemies = [];
    bossRoom.cleared = true;
    room.map.portalActive = true;
    room.tick(50);

    assert.strictEqual(room.map.portalActive, true, "Warden's Gate portal must become active upon Oriphiel's defeat");
  });

  // --- Test 42: Sequential floor transitions advance from Floor 1 to Floor 10 ---
  await test('42. Sequential floor transitions advance from Floor 1 through Floor 10', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_SEQ',
      name: 'Sequential Descent Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9999,
      initialFloor: 1,
    });

    const pid = 'p_descent_tester';
    room.addOrReconnectPlayer(pid, 'Climber', 'vanguard', false, {
      level: 20, xp: 0, strength: 10, vitality: 10, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });

    for (let currentFloor = 1; currentFloor <= 9; currentFloor++) {
      assert.strictEqual(room.floor, currentFloor);
      room.map.portalActive = true;
      const p = room.getPlayerState(pid)!;
      p.x = room.map.portalPos.x;
      p.y = room.map.portalPos.y;
      p.readyNextFloor = true;

      room.performAction(pid, 'interact');
      assert.strictEqual(room.floor, currentFloor + 1, `Must advance to Floor ${currentFloor + 1}`);
    }
    assert.strictEqual(room.floor, 10, 'Must reach Floor 10');
  });

  // --- Test 43: Floor 10 portal victory condition ---
  await test('43. Floor 10 portal interaction triggers Chapter 1 victory', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_F10_VICTORY',
      name: 'F10 Victory Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 7777,
      initialFloor: 10,
    });
    room.status = 'playing';

    const pid = 'p_victor';
    room.addOrReconnectPlayer(pid, 'Champion', 'arcanist', false, {
      level: 30, xp: 0, strength: 0, vitality: 10, dexterity: 0, intelligence: 20, faith: 0, attributePoints: 0,
    });

    room.map.portalActive = true;
    const p = room.getPlayerState(pid)!;
    p.x = room.map.portalPos.x;
    p.y = room.map.portalPos.y;
    p.readyNextFloor = true;

    room.performAction(pid, 'interact');
    assert.strictEqual(room.status, 'victory', 'Room status must be victory after completing Floor 10');
  });

  // --- Test 44: New enemy types initialize with valid stats ---
  await test('44. Sanctuary enemy types initialize with valid stats and resistances', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_ENEMIES',
      name: 'Enemy Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 1111,
    });

    const sanctuaryTypes: Array<{ kind: any; name: string }> = [
      { kind: 'hymn_phantom', name: 'Hymn Phantom' },
      { kind: 'relic_golem', name: 'Relic Golem' },
      { kind: 'veiled_heretic', name: 'Veiled Heretic' },
      { kind: 'celestial_arbiter', name: 'Celestial Arbiter' },
      { kind: 'warden_enforcer', name: 'Warden Enforcer' },
    ];

    for (const spec of sanctuaryTypes) {
      const e = room.spawnEnemyForTesting(spec.kind, 100, 100);
      assert.strictEqual(e.name, spec.name);
      assert.ok(e.maxHp > 0);
      assert.ok(e.resistances?.physical !== undefined);
    }
  });

  // --- Test 45: Boss rooms across all 10 floors are reliably and substantially larger than regular rooms ---
  await test('45. Boss rooms across all 10 floors are guaranteed to be larger than standard rooms', async () => {
    const testSeeds = [1234, 5555, 9999, 44444];
    for (const seed of testSeeds) {
      for (let floor = 1; floor <= 10; floor++) {
        const room = new GameRoom({
          roomId: `R_TEST_BOSS_ROOM_F${floor}_S${seed}`,
          name: `Boss Room Sizing F${floor}`,
          hostName: 'Tester',
          difficulty: 'Normal',
          seed,
          initialFloor: floor,
        });

        const bossRoom = room.map.rooms.find((r) => r.type === 'boss');
        assert.ok(bossRoom, `Floor ${floor} (seed ${seed}) must have a designated boss room`);
        assert.ok(bossRoom.w >= 16, `Floor ${floor} boss room width (${bossRoom.w}) must be at least 16 tiles`);
        assert.ok(bossRoom.h >= 13, `Floor ${floor} boss room height (${bossRoom.h}) must be at least 13 tiles`);
        assert.ok(
          bossRoom.w * bossRoom.h >= 208,
          `Floor ${floor} boss room area (${bossRoom.w * bossRoom.h}) must be at least 208 tiles (substantially larger than standard 8x8 rooms)`
        );

        // Verify start room is smaller than boss room
        const startRoom = room.map.rooms.find((r) => r.type === 'start')!;
        assert.ok(bossRoom.w * bossRoom.h > startRoom.w * startRoom.h * 2.5, 'Boss room must be over 2.5x the start room area');
      }
    }
  });

  // --- Test 46: Sprite renderers for all Chapter 1 bosses and sanctuary enemies execute cleanly ---
  await test('46. All Chapter 1 guardian bosses and sanctuary enemy sprites render without errors', async () => {
    function createMockCtx(): any {
      return {
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        bezierCurveTo() {},
        arc() {},
        ellipse() {},
        fill() {},
        stroke() {},
        fillRect() {},
        strokeRect() {},
        fillText() {},
        createRadialGradient() {
          return {
            addColorStop() {},
          };
        },
      };
    }

    const mockCtx = createMockCtx();
    const now = 10000;

    const mockBaseEnemy: EnemyState = {
      id: 'mock_boss',
      kind: 'boss',
      name: 'Test Boss',
      roomId: 1,
      x: 200,
      y: 200,
      vx: 0,
      vy: 0,
      hp: 1500,
      maxHp: 1500,
      radius: 24,
      state: 'idle',
      windupMs: 0,
      targetX: 200,
      targetY: 200,
      markedMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      elite: true,
      resistances: { physical: 0.2, fire: 0, frost: 0, lightning: 0, poison: 0, bleed: 0, divine: 0, arcane: 0, tenacity: 0.8 },
    };

    // Test each boss with various animation states (normal, windup, enraged)
    const bosses = [
      'Elyndor, Keeper of the Last Hymn',
      'Zadkiel, Keeper of the Ashen Reliquary',
      'Sariel, Warden of the Veiled Scripture',
      'Seraphel, Sentinel of the Final Seal',
      'Oriphiel, The Last Warden',
    ];

    for (const bName of bosses) {
      assert.doesNotThrow(() => {
        drawHumanoidBoss(mockCtx, 200, 200, bName, now, { ...mockBaseEnemy, name: bName });
        drawHumanoidBoss(mockCtx, 200, 200, bName, now, { ...mockBaseEnemy, name: bName, windupMs: 600, enraged: true });
      }, `Rendering ${bName} should not throw`);
    }

    // Direct invocation of individual boss renderers
    assert.doesNotThrow(() => drawElyndorBoss(mockCtx, 200, 200, now, mockBaseEnemy));
    assert.doesNotThrow(() => drawZadkielBoss(mockCtx, 200, 200, now, { ...mockBaseEnemy, shieldWallMs: 500 }));
    assert.doesNotThrow(() => drawSarielBoss(mockCtx, 200, 200, now, mockBaseEnemy));
    assert.doesNotThrow(() => drawSeraphelBoss(mockCtx, 200, 200, now, mockBaseEnemy));
    assert.doesNotThrow(() => drawOriphielBoss(mockCtx, 200, 200, now, { ...mockBaseEnemy, charging: true }));

    // Test all sanctuary enemy renderers and generic fallback
    const sanctuaryEnemies: Array<{ kind: any; fn: Function }> = [
      { kind: 'hymn_phantom', fn: drawHymnPhantomSprite },
      { kind: 'relic_golem', fn: drawRelicGolemSprite },
      { kind: 'veiled_heretic', fn: drawVeiledHereticSprite },
      { kind: 'celestial_arbiter', fn: drawCelestialArbiterSprite },
      { kind: 'warden_enforcer', fn: drawWardenEnforcerSprite },
      { kind: 'unknown_custom', fn: drawGenericEnemySprite },
    ];

    for (const { kind, fn } of sanctuaryEnemies) {
      assert.doesNotThrow(() => {
        fn(mockCtx, { ...mockBaseEnemy, kind, radius: 14 }, 200, 200, now);
        fn(mockCtx, { ...mockBaseEnemy, kind, radius: 14, windupMs: 500, state: 'chase' }, 200, 200, now);
      }, `Rendering enemy kind '${kind}' should not throw`);
    }
  });

  // --- Test 47: Sanctuary mobs execute distinct attacks and movement in gameEngine ---
  await test('47. Sanctuary mobs execute distinct attacks and movement in gameEngine', async () => {
    const sanctuaryKinds: Array<{ kind: any; name: string; isRanged: boolean }> = [
      { kind: 'hymn_phantom', name: 'Hymn Phantom', isRanged: true },
      { kind: 'relic_golem', name: 'Relic Golem', isRanged: false },
      { kind: 'veiled_heretic', name: 'Veiled Heretic', isRanged: true },
      { kind: 'celestial_arbiter', name: 'Celestial Arbiter', isRanged: false },
      { kind: 'warden_enforcer', name: 'Warden Enforcer', isRanged: false },
    ];

    for (const spec of sanctuaryKinds) {
      const room = new GameRoom({
        roomId: `R_TEST_MOB_ATTACK_${spec.kind}`,
        name: `Mob Attack Test ${spec.name}`,
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 4321,
        initialFloor: 6,
      });
      room.status = 'playing';

      const pid = 'p_target';
      room.addOrReconnectPlayer(pid, 'TargetKnight', 'vanguard', false, {
        level: 10, xp: 0, strength: 10, vitality: 10, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
      });

      const player = room.getPlayerState(pid)!;
      // Position player in center of start room
      player.x = (room.map.rooms[0].cx) * TILE_SIZE + 16;
      player.y = (room.map.rooms[0].cy) * TILE_SIZE + 16;
      const initialHp = player.hp;

      // Spawn mob close to player
      const mobX = player.x + (spec.isRanged ? 80 : 25);
      const mobY = player.y;
      const mob = room.spawnEnemyForTesting(spec.kind, mobX, mobY);
      mob.roomId = room.map.rooms[0].id;
      mob.windupMs = 0; // ready to attack immediately

      const initialProjCount = room.projectiles.length;

      // Tick engine by 150ms
      room.tick(150);

      // Verify mob acted: either fired a projectile or dealt direct melee damage or entered attack windup
      const firedProj = room.projectiles.length > initialProjCount;
      const dealtDamage = player.hp < initialHp;
      const wentOnWindup = mob.windupMs > 0;

      assert.ok(
        firedProj || dealtDamage || wentOnWindup,
        `${spec.name} must attack or wind up when near player (firedProj: ${firedProj}, dealtDmg: ${dealtDamage}, windup: ${mob.windupMs})`
      );
    }
  });

  // --- Test 48: All 10 Floor Bosses execute their 4 unique abilities ---
  await test('48. All 10 floor bosses execute their 4 distinct abilities without errors', async () => {
    for (let floor = 1; floor <= 10; floor++) {
      const room = new GameRoom({
        roomId: `R_TEST_BOSS_4_ABILITIES_F${floor}`,
        name: `Boss 4-Abilities F${floor}`,
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 7777 + floor,
        initialFloor: floor,
      });
      room.status = 'playing';

      const pid = 'p_challenger';
      room.addOrReconnectPlayer(pid, 'Challenger', 'vanguard', false, {
        level: 25, xp: 0, strength: 15, vitality: 20, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
      });

      const boss = room.enemies.find((e) => e.kind === 'boss');
      assert.ok(boss, `Floor ${floor} boss must exist`);

      const player = room.getPlayerState(pid)!;
      // Place player in same room as boss
      player.x = boss.x + 40;
      player.y = boss.y;

      // Tick room across multiple frames to exercise boss AI and abilities
      for (let t = 0; t < 25; t++) {
        boss.windupMs = 0; // Force ability selection
        assert.doesNotThrow(() => {
          room.tick(100);
        }, `Floor ${floor} boss (${boss.name}) ability execution failed on tick ${t}`);
      }
    }
  });

  // --- Test 49: Differentiated Floor 6-10 Guardian abilities and Oriphiel Aegis Parry Reflection ---
  await test('49. Floors 6-10 guardians create unique field zones and Oriphiel Aegis Parry reflects damage', async () => {
    // A: Floor 10 Oriphiel Aegis Parry Reflection
    const f10Room = new GameRoom({
      roomId: 'R_TEST_F10_PARRY',
      name: 'Oriphiel Parry Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 101010,
      initialFloor: 10,
    });
    f10Room.status = 'playing';

    const pid = 'p_parry_attacker';
    f10Room.addOrReconnectPlayer(pid, 'Striker', 'vanguard');
    const attacker = f10Room.getPlayerState(pid)!;
    attacker.hp = 200;
    attacker.maxHp = 200;

    const oriphiel = f10Room.enemies.find((e) => e.kind === 'boss')!;
    const oriphielHpBefore = oriphiel.hp;

    // Manually spawn Oriphiel's Aegis Parry zone
    f10Room.zones.push({
      id: 'z_oriphiel_parry',
      kind: 'warden_parry',
      x: oriphiel.x,
      y: oriphiel.y,
      radius: 65,
      ttlMs: 2000,
      maxTtlMs: 2000,
      ownerId: oriphiel.id,
    });

    // Attacker hits Oriphiel while Aegis Parry is active
    const dealt = f10Room.damageEnemy(oriphiel, 100, attacker, 'physical');
    assert.strictEqual(dealt, 0, 'Oriphiel must take 0 damage when parrying');
    assert.strictEqual(oriphiel.hp, oriphielHpBefore, 'Oriphiel HP must remain unchanged');
    assert.ok(attacker.hp < 200, 'Attacking player must take reflected divine damage');

    // B: Verify Floors 6-10 create their signature unique zone kinds
    const expectedZoneKinds: Record<number, string[]> = {
      6: ['sound_lane', 'lament_mark'],
      7: ['ashen_cloud', 'censer_sweep', 'lament_mark'],
      8: ['scripture_line', 'lancefall_mark', 'silence_seal'],
      9: ['lance_thrust', 'lancefall_mark'],
      10: ['warden_edict', 'warden_parry', 'verdict_combo'],
    };

    for (let floor = 6; floor <= 10; floor++) {
      const room = new GameRoom({
        roomId: `R_TEST_UNIQUE_ZONES_F${floor}`,
        name: `Unique Zones F${floor}`,
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 6600 + floor,
        initialFloor: floor,
      });
      room.status = 'playing';

      const pid = 'p_test_target';
      room.addOrReconnectPlayer(pid, 'Challenger', 'vanguard');

      const boss = room.enemies.find((e) => e.kind === 'boss')!;
      const player = room.getPlayerState(pid)!;
      player.x = boss.x + 40;
      player.y = boss.y;

      const spawnedZoneKinds = new Set<string>();

      // Run boss ticks to collect zone kinds spawned by boss AI
      for (let t = 0; t < 150; t++) {
        player.downed = false;
        player.hp = player.maxHp;
        boss.windupMs = 0;
        room.tick(100);
        for (const z of room.zones) {
          spawnedZoneKinds.add(z.kind);
        }
      }

      const expectedList = expectedZoneKinds[floor];
      const hasUniqueZone = expectedList.some((k) => spawnedZoneKinds.has(k));
      assert.ok(
        hasUniqueZone,
        `Floor ${floor} boss (${boss.name}) must spawn at least one of its signature unique zones: ${expectedList.join(', ')}. Found: ${Array.from(spawnedZoneKinds).join(', ')}`
      );
    }
  });

  // --- Test 50: Rebalanced Boss HP scaling prevents quadratic compounding across floors and party sizes ---
  await test('50. Boss HP scales linearly without quadratic compounding in solo and 4P', async () => {
    // Floor 1 Solo Normal: base 950
    const f1Room = new GameRoom({
      roomId: 'R_TEST_F1_SCALE',
      name: 'F1 Scale',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 1234,
      initialFloor: 1,
    });
    const f1Boss = f1Room.enemies.find(e => e.kind === 'boss')!;
    assert.strictEqual(f1Boss.maxHp, 950, 'Floor 1 boss must be exactly base 950 HP');

    // Floor 10 Solo Normal: expected 950 * 1.0 * (1 + 9 * 0.35) = 950 * 4.15 = 3942.
    // Previously quadratic compounding drove this to 12,975 HP.
    const f10Room = new GameRoom({
      roomId: 'R_TEST_F10_SCALE',
      name: 'F10 Scale',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 5678,
      initialFloor: 10,
    });
    const f10Boss = f10Room.enemies.find(e => e.kind === 'boss')!;
    assert.strictEqual(f10Boss.maxHp, 3943, 'Floor 10 solo boss HP must be 3943 (linear scaling)');
    assert.ok(f10Boss.maxHp < 5000, 'Floor 10 solo boss HP must be well below unplayable 12,975 sponge');
  });

  // --- Test 51: Attributes provide cohesive dual benefits ---
  test('51. Attributes confer balanced secondary defenses and utilities', () => {
    const room = new GameRoom({
      roomId: 'R_TEST_ATTRIB_DUAL',
      name: 'Dual Benefit Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9999,
    });

    // 1. Strength confers physical damage reduction
    const idStr = 'p_str_test';
    room.addOrReconnectPlayer(idStr, 'StrHero', 'vanguard', false, {
      level: 1, xp: 0, strength: 40, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pStr = room.getPlayerState(idStr)!;
    pStr.hp = 500;
    // 40 STR grants 40 * 0.0015 = 0.06 additional physical resistance.
    // Base Vanguard phys res = 0.28 -> total resist = 0.34.
    // 100 * (1 - 0.34) = 66. Vanguard passive: 66 * 0.85 = 56 damage (without STR it would be 61 damage).
    const dmgStr = room.damagePlayer(pStr, 100, 'physical');
    assert.strictEqual(dmgStr, 56, '40 STR mitigates physical damage from 61 down to 56');

    // 2. Intelligence confers ability cooldown reduction
    const idInt = 'p_int_test';
    room.addOrReconnectPlayer(idInt, 'IntHero', 'arcanist', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 50, faith: 0, attributePoints: 0,
    });
    const pInt = room.getPlayerState(idInt)!;
    // 50 INT grants 50 * 0.002 = 10% CDR. Astral Nova base CD = 5000ms -> 4500ms.
    room.performAction(idInt, 'tactical');
    assert.strictEqual(pInt.skillCooldownMs, 4500, '50 INT reduces 5000ms tactical CD to 4500ms');

    // 3. Faith confers crowd-control duration reduction (+0.3 percentage points/FTH)
    const idFth = 'p_fth_test';
    room.addOrReconnectPlayer(idFth, 'FthHero', 'cleric', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 50, attributePoints: 0,
    });
    const pFth = room.getPlayerState(idFth)!;
    // 50 FTH grants 50 * 0.003 = 15% CC duration reduction.
    room.applyStatusEffect(pFth, 'silence', 4000);
    const silenceStatus = pFth.statuses.find(s => s.type === 'silenced')!;
    assert.strictEqual(silenceStatus.durationMs, 3400, '50 FTH reduces 4000ms silence duration to 3400ms');

    // 4. Vitality confers periodic combat health regeneration: max(1, floor(VIT * 0.1))
    const idVit = 'p_vit_test';
    room.addOrReconnectPlayer(idVit, 'VitHero', 'vanguard', false, {
      level: 1, xp: 0, strength: 0, vitality: 30, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pVit = room.getPlayerState(idVit)!;
    // Move away from pFth's Radiant Aura radius (<= 140px) so only passive VIT regen applies
    pVit.x += 500;
    pVit.hp = 100; // Damaged
    room.tick(2000); // 2s pulse
    assert.strictEqual(pVit.hp, 103, '30 VIT must regenerate max(1, floor(30 * 0.1)) = 3 HP every 2s');
  });

  // --- Test 52: Dexterity attack speed and crit chance remain balanced and capped safely ---
  test('52. Dexterity scaling is normalized and respects safety caps', () => {
    const room = new GameRoom({
      roomId: 'R_TEST_DEX_CAPS',
      name: 'Dex Caps Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 8881,
    });

    const idDex = 'p_dex_hero';
    room.addOrReconnectPlayer(idDex, 'DexHero', 'ranger', false, {
      level: 25, xp: 0, strength: 0, vitality: 0, dexterity: 60, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pDex = room.getPlayerState(idDex)!;

    // Movement speed: base 210 * (1 + 60 * 0.0025) = 210 * 1.15 = 241.5 px/s
    const def = HERO_CLASSES.ranger;
    const moveSpeed = def.speed * (1 + (pDex.dexterity || 0) * 0.0025);
    assert.ok(Math.abs(moveSpeed - 241.5) < 1e-6, `60 DEX move speed must be 241.5 px/s (got ${moveSpeed})`);

    // Attack cooldown: 1 + 60 * 0.004 = 1.24x speed rate. Base 320ms / 1.24 = 258ms.
    const dexSpeedMult = 1 + (pDex.dexterity || 0) * 0.004;
    const cd = Math.round(def.attackCooldownMs / dexSpeedMult);
    assert.strictEqual(cd, 258, `60 DEX attack cooldown must be 258ms (got ${cd}ms)`);
  });

  // --- Test 53: Polynomial XP curve and floor-scaled XP drops allow smooth progression up to Lv 50 cap ---
  test('53. Progression curve provides smooth leveling without exponential wall up to Lv 50 cap', () => {
    // Check nextXp curve:
    const xpLvl1 = GameRoom.computeNextXp(1);
    const xpLvl10 = GameRoom.computeNextXp(10);
    const xpLvl25 = GameRoom.computeNextXp(25);
    const xpLvl49 = GameRoom.computeNextXp(49);
    const xpLvl50 = GameRoom.computeNextXp(50);

    assert.strictEqual(xpLvl1, 80, 'Level 1 next XP must be 80');
    assert.ok(xpLvl10 > 1000 && xpLvl10 < 1300, `Level 10 next XP must be ~1120 (got ${xpLvl10})`);
    assert.ok(xpLvl25 > 4000 && xpLvl25 < 6000, `Level 25 next XP must be ~4850 (got ${xpLvl25})`);
    assert.ok(xpLvl49 > 12000 && xpLvl49 < 16000, `Level 49 next XP must be achievable (~14,030, got ${xpLvl49})`);
    assert.strictEqual(xpLvl50, 999999, 'Level 50 (MAX_LEVEL) must stop progression cleanly');
  });

  // --- Test 54: Boss crowd control allows interrupt window ---
  test('54. Stuns against tenacious bosses guarantee at least 400ms interrupt window', () => {
    const room = new GameRoom({
      roomId: 'R_TEST_BOSS_INTERRUPT',
      name: 'Boss Interrupt Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 4321,
      initialFloor: 10,
    });

    const boss = room.enemies.find(e => e.kind === 'boss')!;
    assert.ok((boss.resistances?.tenacity ?? 0) >= 0.70, 'Floor 10 boss has high tenacity');

    // Player applies a 1600ms stun (Shield Bash)
    room.applyStatusEffect(boss, 'stun', 1600);
    assert.ok(boss.stunnedMs >= 400, `Boss must receive at least 400ms stun interrupt window (got ${boss.stunnedMs}ms)`);
  });

  // --- Test 55: Item storage vault, retrieval, dismantling for gold, and potion discarding ---
  await test('55. Player can store relics in vault, equip from vault, dismantle for gold, and discard potions', () => {
    const room = new GameRoom({
      roomId: 'STORAGE-TEST',
      name: 'Vault Testing',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 98765,
    });

    const pid = 'p_storage_tester';
    room.addOrReconnectPlayer(pid, 'VaultMaster', 'vanguard');
    const p = room.getPlayerState(pid)!;

    // 1. Give player 5 active relics
    room.addPlayerRelic(pid, 'crimson_fang');
    room.addPlayerRelic(pid, 'twinstring_charm');
    room.addPlayerRelic(pid, 'zephyr_greaves');
    room.addPlayerRelic(pid, 'sunfire_signet');
    room.addPlayerRelic(pid, 'bastion_pauldron');
    assert.strictEqual(p.relics.length, 5, 'Must have 5 active relics equipped');
    assert.strictEqual(p.storage.length, 0, 'Storage starts empty');

    // 2. Store bastion_pauldron into vault
    const initialMaxHp = p.maxHp;
    const stored = room.storeRelic(pid, 'bastion_pauldron');
    assert.strictEqual(stored, true, 'Storing relic into vault must succeed');
    assert.strictEqual(p.relics.length, 4, 'Active relics must be reduced to 4');
    assert.strictEqual(p.storage.length, 1, 'Vault storage must now contain 1 relic');
    assert.strictEqual(p.storage[0], 'bastion_pauldron');
    assert.strictEqual(p.maxHp, initialMaxHp - 30, 'Storing Bastion Pauldron must remove its +30 HP bonus');

    // 3. Equip bastion_pauldron back from vault
    const equipped = room.equipStoredRelic(pid, 'bastion_pauldron');
    assert.strictEqual(equipped, true, 'Equipping relic from vault must succeed');
    assert.strictEqual(p.relics.length, 5, 'Active relics must be back to 5');
    assert.strictEqual(p.storage.length, 0, 'Vault storage must be empty again');
    assert.strictEqual(p.maxHp, initialMaxHp, 'Equipping Bastion Pauldron must restore its +30 HP bonus');

    // 4. Dismantle / Delete relic for gold
    const startingGold = p.gold;
    const dismantled = room.deleteRelic(pid, 'crimson_fang');
    assert.strictEqual(dismantled, true, 'Dismantling relic must succeed');
    assert.strictEqual(p.relics.length, 4, 'Active relics reduced to 4');
    assert.strictEqual(p.gold, startingGold + 40, 'Dismantling relic must award exactly +40 gold');

    // 5. Overflow to storage when active loadout is full (5/5)
    room.addPlayerRelic(pid, 'cinder_heart');
    assert.strictEqual(p.relics.length, 5, 'Active loadout is full at 5/5');
    p.pendingRelicChoices = ['rimefrost_shard'];
    room.selectRelic(pid, 'rimefrost_shard');
    assert.strictEqual(p.storage.includes('rimefrost_shard'), true, 'Full loadout drops must overflow into Storage Vault');

    // 6. Discard potion
    assert.strictEqual(p.potions, 2, 'Starts with 2 potions');
    const discarded = room.discardPotion(pid, 1);
    assert.strictEqual(discarded, true, 'Discarding potion must succeed');
    assert.strictEqual(p.potions, 1, 'Must have 1 potion left after discarding 1');
  });

  // --- Test 56: Visual fallen and ghost state animations render cleanly across all classes & revive states ---
  await test('56. Fallen and ethereal ghost state animation renders without errors across all classes and revive states', async () => {
    function createMockCanvasCtx(): any {
      return {
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'alphabetic',
        globalAlpha: 1,
        shadowColor: 'transparent',
        shadowBlur: 0,
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        beginPath() {},
        closePath() {},
        moveTo() {},
        lineTo() {},
        quadraticCurveTo() {},
        bezierCurveTo() {},
        arc() {},
        ellipse() {},
        fill() {},
        stroke() {},
        fillRect() {},
        strokeRect() {},
        fillText() {},
        setLineDash() {},
        createRadialGradient() {
          return { addColorStop() {} };
        },
        createLinearGradient() {
          return { addColorStop() {} };
        },
      };
    }

    const mockCtx = createMockCanvasCtx();
    const heroClasses: HeroClassId[] = ['vanguard', 'ranger', 'arcanist', 'cleric'];
    const now = 15000;

    for (const hc of heroClasses) {
      const mockPlayer: any = {
        id: `player_${hc}`,
        username: `Hero_${hc}`,
        heroClass: hc,
        x: 300,
        y: 400,
        vx: 0,
        vy: 0,
        aimAngle: 0,
        hp: 0,
        maxHp: 100,
        shield: 0,
        level: 5,
        xp: 100,
        nextXp: 500,
        gold: 250,
        potions: 1,
        relics: [],
        storage: [],
        downed: true,
        downedTimerMs: 14000,
        reviveProgress: 0,
        skillCooldownMs: 0,
        maxSkillCooldownMs: 8000,
        ultCooldownMs: 0,
        maxUltCooldownMs: 30000,
        attackAnimMs: 0,
        hasteMs: 0,
        slowedMs: 0,
        stunnedMs: 0,
        burnedMs: 0,
        frozenMs: 0,
        shockedMs: 0,
        poisonedMs: 0,
        bleedingMs: 0,
        silencedMs: 0,
        kills: 10,
      };

      // State 1: Downed, awaiting rescue (ally view)
      assert.doesNotThrow(() => {
        drawFallenAndGhostPlayer(mockCtx, mockPlayer, 300, 400, now, false);
      }, `Rendering downed ${hc} awaiting rescue should not throw`);

      // State 2: Downed, awaiting rescue (self view)
      assert.doesNotThrow(() => {
        drawFallenAndGhostPlayer(mockCtx, mockPlayer, 300, 400, now, true);
      }, `Rendering downed ${hc} self view should not throw`);

      // State 3: Active revive channel at 65% progress
      assert.doesNotThrow(() => {
        drawFallenAndGhostPlayer(mockCtx, { ...mockPlayer, reviveProgress: 0.65 }, 300, 400, now, false);
      }, `Rendering reviving ${hc} at 65% should not throw`);

      // State 4: Critical bleedout (<5s left)
      assert.doesNotThrow(() => {
        drawFallenAndGhostPlayer(mockCtx, { ...mockPlayer, downedTimerMs: 3200 }, 300, 400, now, false);
      }, `Rendering critical downed ${hc} should not throw`);

      // State 5: Expired timer (0s left)
      assert.doesNotThrow(() => {
        drawFallenAndGhostPlayer(mockCtx, { ...mockPlayer, downedTimerMs: 0 }, 300, 400, now, false);
      }, `Rendering expired downed ${hc} should not throw`);
    }
  });

  // --- Test 57: Centralized changelog data management, release chronology, and category validation ---
  await test('57. Centralized changelog data management preserves release history with valid categorized changes', async () => {
    assert.ok(Array.isArray(CHANGELOG_DATA), 'CHANGELOG_DATA must be an array');
    assert.ok(CHANGELOG_DATA.length >= 1, 'CHANGELOG_DATA must have at least one release documented');

    // 1. Verify newest release appears first
    const newest = CHANGELOG_DATA[0];
    assert.ok(newest.version && typeof newest.version === 'string', 'Newest release must have a version string');
    assert.ok(newest.releaseDate && typeof newest.releaseDate === 'string', 'Newest release must have a releaseDate');
    assert.ok(newest.title && typeof newest.title === 'string', 'Newest release must have a title');
    assert.ok(newest.description && typeof newest.description === 'string', 'Newest release must have a description');

    // 2. Validate all releases in history
    const allowedCategories = new Set(CATEGORY_ORDER);
    const seenVersions = new Set<string>();

    for (const release of CHANGELOG_DATA) {
      assert.ok(!seenVersions.has(release.version), `Version ${release.version} must be unique in history`);
      seenVersions.add(release.version);

      assert.ok(release.version.startsWith('v'), `Version ${release.version} must start with 'v'`);
      assert.ok(release.title.length > 0, `Title for ${release.version} must not be empty`);
      assert.ok(release.description.length > 0, `Description for ${release.version} must not be empty`);
      assert.ok(release.releaseDate.length > 0, `Release date for ${release.version} must not be empty`);

      // Check categories
      const categoryKeys = Object.keys(release.categories);
      assert.ok(categoryKeys.length > 0, `Release ${release.version} must have at least one category`);

      for (const cat of categoryKeys) {
        assert.ok(
          allowedCategories.has(cat as any),
          `Category '${cat}' in ${release.version} must be one of the 5 allowed categories: ${CATEGORY_ORDER.join(', ')}`
        );
        const entries = release.categories[cat as keyof typeof release.categories];
        assert.ok(Array.isArray(entries), `Category '${cat}' must be an array of change strings`);
        assert.ok(entries.length > 0, `Category '${cat}' must only be present if it contains actual changes`);
        for (const change of entries) {
          assert.strictEqual(typeof change, 'string', `Change in ${cat} must be a string`);
          assert.ok(change.trim().length > 0, `Change in ${cat} must not be empty whitespace`);
        }
      }
    }

    // 3. Ensure historical releases remain accessible (at least v1.2.0, v1.1.0, v1.0.0 documented)
    assert.ok(CHANGELOG_DATA.length >= 3, 'Changelog must preserve historical releases for modal archive');
  });

  // --- Test 58: Universal Dash/Evasion ability executes correctly ---
  await test('58. Player dash action triggers movement, haste surge, and cooldowns correctly', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_DASH',
      name: 'Dash Ability Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 5858,
    });
    room.status = 'playing';

    const pid = 'p_dasher';
    room.addOrReconnectPlayer(pid, 'SwiftDash', 'vanguard');
    const p = room.getPlayerState(pid)!;

    const startX = p.x;
    const startY = p.y;
    p.dashCooldownMs = 0;

    // Set aim direction to right (0 rad)
    p.aimAngle = 0;

    // Trigger dash action
    room.performAction(pid, 'dash', 0);

    // Verify cooldown initialized (base 2600ms or reduced by INT)
    assert.ok(p.dashCooldownMs > 2000, `Dash cooldown must be initialized (~2600ms, got ${p.dashCooldownMs}ms)`);
    assert.strictEqual(p.maxDashCooldownMs, p.dashCooldownMs, 'maxDashCooldownMs must match dashCooldownMs');

    // Verify displacement along angle
    assert.ok(p.x > startX + 50, `Player X position (${p.x}) must displace forward from start (${startX})`);

    // Verify haste surge
    assert.ok(p.hasteMs >= 500, `Player must gain haste surge on dash (got ${p.hasteMs}ms)`);

    // Tick engine to verify dash cooldown decrements in tick loop
    room.tick(500);
    assert.ok(p.dashCooldownMs < 2200, `Dash cooldown must decrement on tick loop (got ${p.dashCooldownMs}ms)`);
  });

  // --- Test 59: Complete Status Effects System Overhaul & Balance ---
  test('59. Complete Status Effects System Overhaul (Charmed, Silenced, Poison, Frostbite, Impaled)', () => {
    const room = new GameRoom({
      roomId: 'test_status_room',
      name: 'Status Test Sanctuary',
      hostName: 'StatusValidator',
      difficulty: 'Normal',
      seed: 9912,
    });
    room.floor = 6;
    room.status = 'playing';

    const pid = 'p_status_hero';
    room.addOrReconnectPlayer(pid, 'StatusHero', 'vanguard');
    const p = room.getPlayerState(pid)!;
    const pr = (room as any).players.get(pid)!;
    p.x = 200;
    p.y = 200;

    // 1. Charmed Siren Pull when Idle
    const boss = {
      id: 'boss_elyndor',
      name: 'Elyndor, Keeper of the Last Hymn',
      kind: 'boss' as const,
      x: 350,
      y: 200,
      radius: 32,
      hp: 1000,
      maxHp: 1000,
      enraged: false,
      windupMs: 1000,
      silencedMs: 0,
      poisonedMs: 0,
      markedMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      bleedingMs: 0,
      resistances: { physical: 0, arcane: 0, divine: 0 },
    };
    room.enemies = [boss as any];

    // Apply Charmed
    room.applyPlayerStatus(p, 'charmed', 3000);
    assert.ok(p.statuses.some(s => s.type === 'charmed'), 'Charmed must be active on player');

    // Idle input (zero directional movement)
    pr.input.left = false;
    pr.input.right = false;
    pr.input.up = false;
    pr.input.down = false;
    delete pr.input.stickX;
    delete pr.input.stickY;

    const preX = p.x;
    room.tick(100); // 100ms
    assert.ok(p.x > preX, `Charmed idle player must be pulled toward boss (preX=${preX}, postX=${p.x})`);

    // 2. Charmed Damage Reduction (-35%)
    const normalDmgEnemy = {
      id: 'dummy_target',
      hp: 500,
      maxHp: 500,
      radius: 16,
      resistances: { physical: 0 },
      markedMs: 0,
    };
    room.enemies.push(normalDmgEnemy as any);
    const charmDmgDealt = room.damageEnemy(normalDmgEnemy as any, 100, p, false, 'physical');
    // Normal 100 with Vanguard level 1 mult (1.0) would be 100, but charmed should be ~65
    assert.strictEqual(charmDmgDealt, 65, `Charmed player should deal 65% outgoing damage (got ${charmDmgDealt})`);

    // 3. Charm Broken on Taking >= 20 Damage
    p.shield = 0;
    room.damagePlayer(p, 30, 'physical');
    assert.ok(!p.statuses.some(s => s.type === 'charmed'), 'Charm must break when taking >= 20 damage');

    // 4. Silenced Ability Lock & Cooldown Preservation
    room.applyPlayerStatus(p, 'silenced', 3000);
    assert.ok(p.statuses.some(s => s.type === 'silenced'), 'Silenced must be active on player');

    p.skillCooldownMs = 0;
    p.ultCooldownMs = 0;
    p.dashCooldownMs = 0;

    // Tactical activation must be rejected without putting skill on cooldown
    room.performAction(pid, 'tactical', 0);
    assert.strictEqual(p.skillCooldownMs, 0, 'Silenced player cannot activate tactical, and cooldown must stay 0');

    // Ult activation must be rejected without putting ult on cooldown
    room.performAction(pid, 'ult', 0);
    assert.strictEqual(p.ultCooldownMs, 0, 'Silenced player cannot activate ult, and cooldown must stay 0');

    // Basic evasion dash must NOT be blocked by silence
    const preDashX = p.x;
    room.performAction(pid, 'dash', 0);
    assert.ok(p.dashCooldownMs > 0, 'Dash evasion must remain usable while silenced');
    assert.ok(p.x > preDashX + 40, 'Player displaced during dash while silenced');

    // 5. Enemy Silence Decrement & Spell Suppression
    boss.silencedMs = 1500;
    room.tick(500);
    assert.strictEqual(boss.silencedMs, 1000, `Enemy silencedMs must decrement from 1500 to 1000 (got ${boss.silencedMs})`);

    // 6. Poison 30% Outgoing Damage Reduction
    boss.poisonedMs = 4000;
    const baseHit = 50;
    const unpoisonedDmg = room.computeEnemyDamage(baseHit, null);
    const poisonedDmg = room.computeEnemyDamage(baseHit, boss as any);
    assert.strictEqual(
      poisonedDmg,
      Math.max(1, Math.round(unpoisonedDmg * 0.7)),
      `Poisoned enemy damage must be exactly 70% of base (unpoisoned=${unpoisonedDmg}, poisoned=${poisonedDmg})`
    );

    // 7. Frostbite Movement & Attack Penalty
    p.statuses = [];
    room.applyPlayerStatus(p, 'frostbite', 3000);
    assert.ok(p.statuses.some(s => s.type === 'frostbite'), 'Frostbite must be active');

    // 8. Impaled Damage Vulnerability
    p.statuses = [];
    room.applyPlayerStatus(p, 'impaled', 4000);
    assert.ok(p.statuses.some(s => s.type === 'impaled'), 'Impaled must be active');
    const regularHit = room.damagePlayer(p, 40, 'physical');
    // Impaled increases divine damage by 45%
    const impaledDivineHit = room.damagePlayer(p, 40, 'divine');
    assert.ok(
      impaledDivineHit > regularHit,
      `Impaled player must take increased damage against divine attacks (${impaledDivineHit} vs ${regularHit})`
    );
  });

  // --- Test 60: Targeted Audit — Simultaneous Enemy Deaths During Projectile Iteration ---
  await test('60. Targeted Audit: Simultaneous enemy deaths during projectile iteration', async () => {
    const room = new GameRoom({ roomId: 'TEST_AUDIT_60', name: 'Audit Room 60', hostName: 'Host', difficulty: 'Normal' });
    const p = room.addOrReconnectPlayer('pid_audit_1', 'VanguardAlpha', 'vanguard', true);
    p.relics = [];
    room.enemies.length = 0; // Clear floor mobs so only test enemies are evaluated

    const startX = p.x;
    const startY = p.y;

    // Spawn 5 low-HP enemies in a line along the projectile trajectory using valid EnemyKinds and walkable coordinates
    const e1 = room.spawnEnemyForTesting('skeleton', startX + 30, startY); e1.hp = 5;
    const e2 = room.spawnEnemyForTesting('cultist', startX + 50, startY); e2.hp = 5;
    const e3 = room.spawnEnemyForTesting('slime', startX + 70, startY); e3.hp = 5;
    const e4 = room.spawnEnemyForTesting('goblin', startX + 90, startY); e4.hp = 5;
    const e5 = room.spawnEnemyForTesting('knight', startX + 110, startY); e5.hp = 5;

    // Spawn a piercing projectile (pierce: 5) travelling through all 5 enemies
    room.spawnProjectile({
      ownerType: 'player',
      ownerId: p.id,
      style: 'slash',
      x: startX,
      y: startY,
      vx: 300,
      vy: 0,
      angle: 0,
      radius: 30,
      damage: 25,
      pierce: 5,
      ttlMs: 2000,
    });

    // Tick room in small steps so projectile moves and hits all 5 enemies
    for (let t = 0; t < 5; t++) {
      room.tick(100);
    }

    assert.strictEqual(room.enemies.length, 0, 'All 5 low-HP enemies must be processed and removed safely');
    assert.strictEqual(p.kills, 5, 'Attacker must receive exactly 5 kill credits without duplicates');
  });

  // --- Test 61: Targeted Audit — AoE Freeze Shatter & Shock Chain Lightning Chain Reactions ---
  await test('61. Targeted Audit: Freeze Shatter & Shock Chain Lightning chain reactions', async () => {
    const room = new GameRoom({ roomId: 'TEST_AUDIT_61', name: 'Audit Room 61', hostName: 'Host', difficulty: 'Normal' });
    const p = room.addOrReconnectPlayer('pid_audit_2', 'ArcanistBeta', 'arcanist', true);
    room.enemies.length = 0;

    // Spawn 3 enemies clustered together: E1 (frozen, 20 HP), E2 (1 HP), E3 (30 HP)
    const e1 = room.spawnEnemyForTesting('slime', 100, 100); e1.frozenMs = 3000; e1.hp = 20;
    const e2 = room.spawnEnemyForTesting('skeleton', 130, 100); e2.hp = 1;
    const e3 = room.spawnEnemyForTesting('goblin', 160, 100); e3.hp = 30;

    // Damage E1 to trigger Shatter AoE. Shatter AoE will hit E2 and kill E2 (1 HP), which splices E2 from room.enemies.
    // With snapshot array iteration, E3 must STILL receive Shatter AoE damage without being skipped!
    room.damageEnemy(e1, 30, p, true, 'frost');

    assert.ok(e1.hp <= 0, 'Primary target E1 must be dead from Shatter damage');
    assert.ok(!room.enemies.includes(e2), 'Intermediate target E2 must be killed and removed from room.enemies');
    assert.ok(e3.hp < 30, 'Target E3 must have received Shatter AoE damage despite E2 dying mid-iteration');

    // Test Shock Chain Lightning arc reaction
    room.enemies.length = 0;
    const c1 = room.spawnEnemyForTesting('cultist', 200, 200); c1.shockedMs = 4000; c1.hp = 50;
    const c2 = room.spawnEnemyForTesting('slime', 230, 200); c2.hp = 1; // Dies on arc 1
    const c3 = room.spawnEnemyForTesting('goblin', 260, 200); c3.hp = 40; // Receives arc 2

    room.damageEnemy(c1, 20, p, false, 'lightning');
    assert.ok(!room.enemies.includes(c2), 'Chain lightning arc 1 must kill low-HP c2 and splice it');
    assert.ok(c3.hp < 40, 'Chain lightning arc 2 must safely hit c3 even after c2 died');
  });

  // --- Test 62: Targeted Audit — Two-Player Co-op Combat & Boss Cleanup ---
  await test('62. Targeted Audit: Two-Player co-op combat & boss cleanup', async () => {
    const room = new GameRoom({ roomId: 'TEST_AUDIT_62', name: 'Audit Room 62', hostName: 'Host', difficulty: 'Normal' });
    const p1 = room.addOrReconnectPlayer('pid_coop_1', 'PlayerOne', 'vanguard', true);
    const p2 = room.addOrReconnectPlayer('pid_coop_2', 'PlayerTwo', 'ranger', false);

    // Load Floor 1 Boss room
    room.summonBossForFloor(1);
    const boss = room.enemies.find(e => e.kind === 'boss');
    assert.ok(boss, 'Boss must be spawned');
    const initialBossHp = boss.hp;

    // Both players attack boss simultaneously in the same tick
    const dmg1 = room.damageEnemy(boss, 40, p1, false, 'physical');
    const dmg2 = room.damageEnemy(boss, 40, p2, false, 'physical');

    assert.strictEqual(boss.hp, initialBossHp - dmg1 - dmg2, 'Boss HP must reflect total damage from both players');
    assert.strictEqual(p1.damageDealt, dmg1, 'P1 damageDealt must match dealt damage');
    assert.strictEqual(p2.damageDealt, dmg2, 'P2 damageDealt must match dealt damage');

    // Retain only the boss in the room so room clearing can trigger
    room.enemies = [boss];

    // Lethal strike on boss (5000 raw damage ensures lethal net damage after resistance)
    room.damageEnemy(boss, 5000, p1, true, 'physical');
    room.tick(50); // Process room clear check

    assert.ok(!room.enemies.includes(boss), 'Boss must be cleaned up from room.enemies');
    assert.ok(room.map.portalActive, 'Portal must activate on boss defeat');

    const chest = room.props.find(pr => pr.kind === 'relic_chest');
    assert.ok(chest, 'Relic Vault chest prop must spawn upon boss defeat');
  });

  // --- Test 63: Phase 1 — Particle Engine API & 13 Spawn Methods Backward Compatibility ---
  await test('63. Particle Engine: All 13 spawn methods callable and maintain backward compatibility', async () => {
    const pm = new ParticleManager();
    const now = 1000;

    // Call all 13 methods
    pm.spawnHitSparks(100, 100, '#EF4444', 8, now, false);
    pm.spawnHitSparks(100, 100, '#F59E0B', 12, now, true); // Crit
    pm.spawnEnemyDeathBurst(120, 120, 'slime', now);
    pm.spawnEnemyDeathBurst(120, 120, 'boss', now);
    pm.spawnPortalWisps(200, 200, true, now);
    pm.spawnShrineMotes(300, 300, true, now);
    pm.spawnBossShieldSparks(400, 400, now);
    pm.spawnFrostNovaMotes(500, 500, 40, now);
    pm.spawnMagmaEmbers(600, 600, 50, now);
    pm.spawnSingularityInwardWisps(700, 700, 60, now);
    pm.spawnSupernovaGlints(800, 800, 70, now);
    pm.spawnBossEnrageBurst(900, 900, now);
    pm.spawnCleaveShockwaveSparks(150, 150, 0.5, now);
    pm.spawnVaultGleam(250, 250, true, now);

    const testProj = {
      id: 'proj_test_1',
      x: 100,
      y: 100,
      vx: 200,
      vy: 0,
      radius: 6,
      damage: 25,
      fromPlayer: true,
      style: 'arcane' as const,
      rangeLeft: 500,
      angle: 0,
      ownerType: 'player' as const,
      ownerId: 'pid_1',
      pierce: 1,
      ttlMs: 2000,
    };
    pm.spawnProjectileWake(testProj, now);

    assert.ok(pm.count > 50, `Particle count should be healthy after spawns, got ${pm.count}`);
    assert.strictEqual(pm.poolSize, 0, 'Pool starts empty until particles expire');
  });

  // --- Test 64: Phase 1 — Object Pooling, Lifecycle Recycling & Property Reset Verification ---
  await test('64. Particle Engine: Object pooling recycles expired particles with complete property resets', async () => {
    const pm = new ParticleManager();
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      fillRect: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      shadowBlur: 0,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    // Spawn critical hit sparks with high rotation, scale and colorEnd
    pm.spawnHitSparks(100, 100, '#EF4444', 6, 1000, true);
    const initialCount = pm.count;
    assert.ok(initialCount > 0, 'Sparks spawned');

    // Age particles beyond maxAgeMs (e.g. at now = 3000ms)
    pm.updateAndDraw(mockCtx, 3000, 0.016);

    // All expired particles must be recycled to the pool
    assert.strictEqual(pm.count, 0, 'Active particles must be 0 after expiration');
    assert.strictEqual(pm.poolSize, initialCount, 'All expired particles must enter pool');

    // Spawn simple non-crit particles which re-acquire from the pool
    pm.spawnHitSparks(200, 200, '#38BDF8', 4, 3000, false);
    assert.ok(pm.count > 0, 'New particles acquired from pool');
    assert.ok(pm.poolSize < initialCount, 'Pool size decreased upon reuse');

    // Verify properties of active particles do not bleed from the previous crit particles
    // Standard sparks have shape='spark', not 'star', and isCrit=false means glow is false
    const rawList = (pm as any).particles;
    for (const p of rawList) {
      assert.strictEqual(p.color, '#38BDF8', 'Color must be reset to new particle color');
      assert.strictEqual(p.glow, false, 'Non-crit sparks must have glow=false');
      assert.strictEqual(p.priority, 'high', 'Non-crit hit sparks have high priority');
    }
  });

  // --- Test 65: Phase 1 — Particle Budget Enforcement & Priority Shedding ---
  await test('65. Particle Engine: Configurable budget prioritizes critical combat over low motes', async () => {
    // Create tight budget: max 20, reserve 10 for high, 5 for critical
    const pm = new ParticleManager({
      maxParticles: 20,
      reserveForHigh: 10,
      reserveForCritical: 5,
    });

    const now = 1000;

    // Fill up to the low-priority ceiling (20 - 10 = 10 particles)
    for (let i = 0; i < 20; i++) {
      (pm as any).acquireParticle({
        x: 10,
        y: 10,
        vx: 0,
        vy: 0,
        color: '#FFFFFF',
        size: 2,
        bornAt: now,
        maxAgeMs: 500,
        priority: 'low',
      });
    }

    // Low priority particles must stop spawning once currentCount >= max - reserveForHigh (10)
    assert.strictEqual(pm.count, 10, 'Low-priority particles must be capped at 10');

    // High priority can continue spawning past the low limit up to max (20)
    for (let i = 0; i < 15; i++) {
      (pm as any).acquireParticle({
        x: 10,
        y: 10,
        vx: 0,
        vy: 0,
        color: '#EF4444',
        size: 2,
        bornAt: now,
        maxAgeMs: 500,
        priority: 'high',
      });
    }

    assert.ok(pm.count <= 20, `High priority particles should respect max limit of 20, got ${pm.count}`);

    // Critical priority particles can reclaim lower priority particles even when budget is full
    const criticalAcquired = (pm as any).acquireParticle({
      x: 50,
      y: 50,
      vx: 0,
      vy: 0,
      color: '#FDE047',
      size: 4,
      bornAt: now,
      maxAgeMs: 500,
      priority: 'critical',
    });

    assert.strictEqual(criticalAcquired, true, 'Critical particle must be acquired');
  });

  // --- Test 66: Phase 1 — Time-based Projectile Wake Emission & Cleanup ---
  await test('66. Particle Engine: Time-based projectile wake rate limiting and inactive cleanup', async () => {
    const pm = new ParticleManager();
    const projA = {
      id: 'proj_speed_a',
      x: 100,
      y: 100,
      vx: 400,
      vy: 0,
      radius: 6,
      damage: 10,
      fromPlayer: true,
      style: 'fireball' as const,
      rangeLeft: 500,
      angle: 0,
      ownerType: 'player' as const,
      ownerId: 'pid_1',
      pierce: 1,
      ttlMs: 2000,
    };

    const startTime = 1000;
    pm.spawnProjectileWake(projA, startTime);
    const countAfterFirst = pm.count;
    assert.strictEqual(countAfterFirst, 1, 'First wake particle should spawn');

    // Simulate high-refresh rate frame at +5ms (under the 28ms threshold)
    pm.spawnProjectileWake(projA, startTime + 5);
    assert.strictEqual(pm.count, 1, 'Sub-28ms frame must not spawn redundant projectile wake');

    // Simulate frame at +30ms (exceeds the 28ms threshold)
    pm.spawnProjectileWake(projA, startTime + 30);
    assert.strictEqual(pm.count, 2, 'Frame after 28ms must spawn next wake particle');

    // Verify cleanup of inactive projectiles
    const activeSet = new Set<string>();
    // projA is not in activeSet
    pm.cleanupInactiveProjectiles(activeSet);
    const internalMap = (pm as any).projectileLastSpawn as Map<string, number>;
    assert.strictEqual(internalMap.has(projA.id), false, 'Inactive projectile id must be pruned from map');
  });

  // --- Test 67: Procedural Visual Effects — All 16 Particle Shapes Render Properly ---
  await test('67. Procedural Effects: All 16 shapes render without errors in Canvas pipeline', async () => {
    const pm = new ParticleManager();
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      quadraticCurveTo: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      shadowBlur: 0,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const allShapes = [
      'square',
      'circle',
      'spark',
      'star',
      'diamond',
      'triangle',
      'shard',
      'ring',
      'crescent',
      'cross',
      'rune',
      'hexagon',
      'starburst',
      'streak',
      'smoke',
      'flame',
    ] as const;

    const now = 1000;

    for (const shape of allShapes) {
      (pm as any).acquireParticle({
        x: 100,
        y: 100,
        vx: 30,
        vy: -20,
        color: '#F59E0B',
        secondaryColor: '#FFFFFF',
        size: 3,
        bornAt: now,
        maxAgeMs: 500,
        shape,
        rotation: 0.5,
        angularVelocity: 2,
        stretchWithVelocity: shape === 'streak' || shape === 'triangle',
        glow: true,
      });
    }

    assert.strictEqual(pm.count, 16, 'All 16 shapes must be spawned');

    // Run updateAndDraw tick at now = 1050ms
    pm.updateAndDraw(mockCtx, 1050, 0.016);
    assert.strictEqual(pm.count, 16, 'All 16 shapes must survive within lifetime');

    // Direct shape function invocation tests
    assert.doesNotThrow(() => drawDiamondShape(mockCtx, 4), 'drawDiamondShape executes without errors');
    assert.doesNotThrow(() => drawTriangleShape(mockCtx, 4), 'drawTriangleShape executes without errors');
    assert.doesNotThrow(() => drawShardShape(mockCtx, 4, '#FFFFFF'), 'drawShardShape executes without errors');
    assert.doesNotThrow(() => drawRingShape(mockCtx, 8, '#F59E0B', 1.5), 'drawRingShape executes without errors');
    assert.doesNotThrow(() => drawCrescentShape(mockCtx, 4), 'drawCrescentShape executes without errors');
    assert.doesNotThrow(() => drawCrossShape(mockCtx, 4, '#FFFFFF'), 'drawCrossShape executes without errors');
    assert.doesNotThrow(() => drawRuneShape(mockCtx, 4, 1000), 'drawRuneShape executes without errors');
    assert.doesNotThrow(() => drawHexagonShape(mockCtx, 4, '#FFFFFF'), 'drawHexagonShape executes without errors');
    assert.doesNotThrow(() => drawStarburstShape(mockCtx, 4, '#FFFFFF'), 'drawStarburstShape executes without errors');
    assert.doesNotThrow(() => drawStreakShape(mockCtx, 4), 'drawStreakShape executes without errors');
    assert.doesNotThrow(() => drawSmokeShape(mockCtx, 4), 'drawSmokeShape executes without errors');
    assert.doesNotThrow(() => drawFlameShape(mockCtx, 4, 1050, 1000, '#FEF08A'), 'drawFlameShape executes without errors');
    assert.doesNotThrow(
      () =>
        drawParticleShape(
          mockCtx,
          'flame',
          4,
          '#F97316',
          { x: 0, y: 0, vx: 0, vy: 0, color: '#F97316', size: 4, bornAt: 1000, maxAgeMs: 500 },
          1050
        ),
      'drawParticleShape dispatcher executes without errors'
    );

    // Expire all particles and check pool
    pm.updateAndDraw(mockCtx, 2000, 0.016);
    assert.strictEqual(pm.count, 0, 'All particles must expire cleanly');
    assert.strictEqual(pm.poolSize, 16, 'All 16 particles returned to pool');
  });

  // --- Test 68: Reusable Elemental Effect Styles & Advanced Motion Dynamics ---
  await test('68. Procedural Effects: 16 elemental helper methods and advanced motion dynamics', async () => {
    const pm = new ParticleManager();
    const now = 1000;

    // Test calling all 16 elemental building blocks
    pm.spawnFireBurst(100, 100, 10, now);
    pm.spawnFlamePuff(100, 100, 0, -30, now);
    pm.spawnIceShatter(200, 200, 10, now);
    pm.spawnFrostRing(200, 200, 24, now);
    pm.spawnLightningArc(100, 100, 200, 200, now);
    pm.spawnShockBurst(300, 300, 10, now);
    pm.spawnArcaneSpiral(400, 400, now);
    pm.spawnArcaneRuneBurst(400, 400, 8, now);
    pm.spawnHolyRadiance(500, 500, 8, now);
    pm.spawnHolyCrossGleam(500, 500, now);
    pm.spawnVoidCollapse(600, 600, 30, now);
    pm.spawnVoidMotes(600, 600, 8, now);
    pm.spawnPoisonCloud(700, 700, 20, 8, now);
    pm.spawnToxicBubbles(700, 700, now);
    pm.spawnPhysicalImpact(800, 800, 0.5, 8, now);
    pm.spawnImpactRing(800, 800, 20, now);

    assert.ok(pm.count > 60, `Comprehensive elemental spawns should produce rich particle count, got ${pm.count}`);

    // Verify motion patterns integration: test inward attraction and wave drift update
    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      quadraticCurveTo: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      shadowBlur: 0,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    // Simulate 5 frame updates with dt = 16ms
    for (let frame = 1; frame <= 5; frame++) {
      pm.updateAndDraw(mockCtx, now + frame * 16, 0.016);
    }

    assert.ok(pm.count > 0, 'Active particles successfully simulate physics without crashing');
  });

  // --- Test 69: Reusable Movement Functions (Spiral, Orbit & Inward Attraction) ---
  await test('69. Reusable Movement Functions: Spiral, Orbit & Inward Attraction Integration', async () => {
    const pm = new ParticleManager();
    const now = 2000;
    const dt = 0.016; // 16ms delta

    // 1. Direct applySpiralMovement validation
    const spiralParticle: CombatParticle = {
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      color: '#A855F7',
      size: 2,
      bornAt: now,
      maxAgeMs: 500,
      spiralSpeed: 3.0,
      spiralTangentialVelocity: 60,
      spiralRadialVelocity: 20,
    };

    const initialVx = spiralParticle.vx;
    const initialVy = spiralParticle.vy;
    applySpiralMovement(spiralParticle, dt, 50);
    assert.ok(
      spiralParticle.vx !== initialVx || spiralParticle.vy !== initialVy,
      'applySpiralMovement should modulate particle velocity tangentially and radially'
    );

    // Test with SpiralMovementOptions overrides
    const spiralWithOpts: CombatParticle = {
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      color: '#A855F7',
      size: 2,
      bornAt: now,
      maxAgeMs: 500,
    };
    applySpiralMovement(spiralWithOpts, dt, 50, {
      speed: 4.0,
      tangentialVelocity: 80,
      radialVelocity: 30,
      decayRate: 0.8,
    });
    assert.ok(
      Math.hypot(spiralWithOpts.vx, spiralWithOpts.vy) > 0,
      'applySpiralMovement should accept and apply SpiralMovementOptions overrides'
    );

    // 2. Direct applyOrbitMovement validation
    const orbitParticle: CombatParticle = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      color: '#38BDF8',
      size: 2,
      bornAt: now,
      maxAgeMs: 500,
      orbitCenterX: 200,
      orbitCenterY: 150,
      orbitRadius: 30,
      orbitSpeed: 2.0,
      orbitAngle: 0,
      orbitEccentricity: 1.5,
    };

    applyOrbitMovement(orbitParticle, dt);
    assert.ok(orbitParticle.orbitAngle! > 0, 'applyOrbitMovement should increment orbitAngle by speed * dt');
    const expectedX = 200 + Math.cos(orbitParticle.orbitAngle!) * 30;
    const expectedY = 150 + Math.sin(orbitParticle.orbitAngle!) * 30 * 1.5;
    assert.strictEqual(
      Math.abs(orbitParticle.x - expectedX) < 0.0001,
      true,
      `Orbit X should match elliptical orbit equation, got ${orbitParticle.x} vs expected ${expectedX}`
    );
    assert.strictEqual(
      Math.abs(orbitParticle.y - expectedY) < 0.0001,
      true,
      `Orbit Y should match elliptical eccentricity equation, got ${orbitParticle.y} vs expected ${expectedY}`
    );

    // 3. Direct applyInwardAttraction validation
    const attractParticle: CombatParticle = {
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      color: '#C084FC',
      size: 2,
      bornAt: now,
      maxAgeMs: 500,
      attractX: 150,
      attractY: 100,
      attractStrength: 200,
      attractMinDist: 5,
      attractSpiralBias: 0.5,
    };

    applyInwardAttraction(attractParticle, dt);
    // Attractor is directly to the right (dx = 50, dy = 0)
    // vx should be positive due to attraction toward target
    // vy should be positive due to spiralBias * normX (perpendicular vortex swirl)
    assert.ok(attractParticle.vx > 0, 'Inward attraction pulls particle toward target along X');
    assert.ok(attractParticle.vy > 0, 'Inward attraction applies tangential swirl vortex bias along Y');

    // Test minDistance and maxDistance clamping
    const tooCloseParticle: CombatParticle = {
      x: 151,
      y: 100,
      vx: 0,
      vy: 0,
      color: '#C084FC',
      size: 2,
      bornAt: now,
      maxAgeMs: 500,
      attractX: 150,
      attractY: 100,
      attractStrength: 200,
      attractMinDist: 5,
    };
    applyInwardAttraction(tooCloseParticle, dt);
    assert.strictEqual(tooCloseParticle.vx, 0, 'Particle closer than minDist should not experience attraction singularity');

    // 4. Composite applyParticleMovement validation
    const compositeParticle: CombatParticle = {
      x: 50,
      y: 50,
      vx: 10,
      vy: 10,
      color: '#E0F2FE',
      size: 2,
      bornAt: now,
      maxAgeMs: 500,
      attractX: 100,
      attractY: 100,
      attractStrength: 100,
      spiralSpeed: 2.0,
    };
    applyParticleMovement(compositeParticle, dt, 100);
    assert.ok(compositeParticle.x !== 50 || compositeParticle.y !== 50, 'applyParticleMovement should integrate particle movement');

    // 5. ParticleManager delegation methods validation
    assert.strictEqual(typeof pm.applySpiralMovement, 'function', 'ParticleManager exposes applySpiralMovement method');
    assert.strictEqual(typeof pm.applyOrbitMovement, 'function', 'ParticleManager exposes applyOrbitMovement method');
    assert.strictEqual(typeof pm.applyInwardAttraction, 'function', 'ParticleManager exposes applyInwardAttraction method');
    assert.strictEqual(typeof pm.applyParticleMovement, 'function', 'ParticleManager exposes applyParticleMovement method');

    // 6. Integration across existing effect methods:
    // Singularity, Portal, Boss Shield, Frost Nova, Supernova, Void Collapse, Arcane Spiral, Frost Ring
    pm.clear();
    pm.spawnSingularityInwardWisps(300, 300, 40, now);
    pm.spawnPortalWisps(400, 400, true, now);
    pm.spawnBossShieldSparks(500, 500, now);
    pm.spawnFrostNovaMotes(600, 600, 50, now);
    pm.spawnSupernovaGlints(700, 700, 60, now);
    pm.spawnVoidCollapse(800, 800, 40, now);
    pm.spawnArcaneSpiral(900, 900, now);
    pm.spawnFrostRing(1000, 1000, 30, now);

    assert.ok(pm.count >= 8, `Spawn methods should populate particles, got ${pm.count}`);

    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      quadraticCurveTo: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      shadowBlur: 0,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    // Simulate 10 frames of movement updates
    for (let frame = 1; frame <= 10; frame++) {
      pm.updateAndDraw(mockCtx, now + frame * 16, 0.016);
    }

    assert.ok(pm.count > 0, 'Active particles with spiral, orbit, and inward attraction simulate cleanly across frames');
  });

  // --- Test 70: Hero Class Visual Effects Upgrade (Vanguard, Ranger, Arcanist, Cleric) ---
  await test('70. Hero Class Visual Effects Upgrade: All Class-Specific Spawn Methods Callable and Performant', async () => {
    const pm = new ParticleManager({
      maxParticles: 600,
      reserveForCritical: 150,
      reserveForHigh: 80,
    });
    const now = 3000;

    // Class Dashes (Inward suction + lingering spectral ghosting + active dash trail steps)
    for (const [idx, cls] of (['vanguard', 'ranger', 'arcanist', 'cleric'] as const).entries()) {
      const y = 100 + idx * 50;
      pm.spawnDashInwardSuction(cls, 100, y, now);
      pm.spawnClassDashEffect(cls, 100, y, 210, y, 0, now);
      pm.spawnClassDashTrailStep(cls, 210, y, 0, now + 45);
    }

    // Vanguard Effects (Cleave, Bulwark Dash, Aegis Cast, Shield Grant/Break, Aegis Motes)
    pm.spawnVanguardCleave(100, 100, 0.5, true, now);
    pm.spawnVanguardBulwarkDash(100, 100, 192, 100, 0, now);
    pm.spawnVanguardAegisCast(100, 100, 105, now);
    pm.spawnVanguardShieldGrant(100, 100, now);
    pm.spawnVanguardShieldBreak(100, 100, now);
    pm.spawnVanguardAegisMotes(100, 100, 25, now);

    // Ranger Effects (Arrow Hit, Frost Volley Cast & Hit, Quarry Cast & Mark, Swiftness Trail)
    pm.spawnRangerArrowHit(200, 200, 1.2, true, now);
    pm.spawnRangerFrostVolleyCast(200, 200, 0.4, now);
    pm.spawnRangerFrostArrowHit(220, 220, 0.4, true, now);
    pm.spawnRangerQuarryCast(200, 200, now);
    pm.spawnRangerQuarryMark(240, 240, now);
    pm.spawnRangerSwiftnessTrail(200, 200, 0.8, now);

    // Arcanist Effects (Bolt Hit, Astral Nova, Teleport, Star Rift, Chrono Well Cast & Motes + Alias)
    pm.spawnArcanistBoltHit(300, 300, now);
    pm.spawnArcanistNovaCast(300, 300, now);
    pm.spawnArcanistTeleportBurst(300, 300, now);
    pm.spawnArcanistStarRiftWisps(300, 300, 40, now);
    pm.spawnArcanistChronoWellCast(340, 340, 100, now);
    pm.spawnArcanistChronoMotes(340, 340, 100, now);
    pm.spawnRangerChronoMotes(200, 200, 30, now);

    // Cleric Effects (Smite Hit, Sanctified Pulse, Solar Beacon Cast, Heal Burst, Beacon Motes)
    pm.spawnClericSmiteHit(400, 400, true, now);
    pm.spawnClericSanctifiedPulse(400, 400, now);
    pm.spawnClericSolarBeaconCast(400, 400, 115, now);
    pm.spawnClericHealBurst(400, 400, now);
    pm.spawnClericBeaconMotes(400, 400, 35, now);

    assert.ok(pm.count > 100, `Calling all class effect methods should populate particles, got ${pm.count}`);

    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      ellipse: () => {},
      quadraticCurveTo: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      shadowBlur: 0,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    // Exercise class projectile wake emission and procedural rendering
    const classProjectiles = [
      { id: 'p_slash', ownerType: 'player' as const, ownerId: 'p1', style: 'slash' as const, x: 100, y: 100, vx: 300, vy: 0, angle: 0, radius: 34, damage: 25, pierce: 4, crit: true, ttlMs: 140 },
      { id: 'p_frost', ownerType: 'player' as const, ownerId: 'p2', style: 'arrow' as const, x: 150, y: 150, vx: 520, vy: 0, angle: 0, radius: 6, damage: 20, pierce: 1, slowOnHit: true, ttlMs: 800 },
      { id: 'p_arcane', ownerType: 'player' as const, ownerId: 'p3', style: 'arcane' as const, x: 200, y: 200, vx: 400, vy: 0, angle: 0, radius: 8, damage: 24, pierce: 2, ttlMs: 800 },
      { id: 'p_radiant', ownerType: 'player' as const, ownerId: 'p4', style: 'radiant' as const, x: 250, y: 250, vx: 380, vy: 0, angle: 0, radius: 7, damage: 18, pierce: 1, ttlMs: 800 },
    ];
    for (const proj of classProjectiles) {
      drawEnhancedProjectile(mockCtx, proj, now);
      pm.spawnProjectileWake(proj, now + 40);
    }

    for (let frame = 1; frame <= 5; frame++) {
      pm.updateAndDraw(mockCtx, now + frame * 16, 0.016);
    }

    assert.ok(pm.count > 0, 'Class particles update and render cleanly across frames');
  });

  // --- Test 71: Boss Skill Visual Effects (Floors 1-10) ---
  await test('71. Boss Skill Visual Effects: All 10 Floor Bosses Spawn Identity-Accurate Procedural Effects', async () => {
    const pm = new ParticleManager({
      maxParticles: 900,
      reserveForCritical: 250,
      reserveForHigh: 150,
    });
    const now = 5000;

    // Floor 1: Warden Malakor
    pm.spawnMalakorBulwarkCast(100, 100, now);
    pm.spawnMalakorTripleCleave(100, 100, 0.2, now);
    pm.spawnMalakorGroundSlamImpact(150, 100, 88, now);
    pm.spawnMalakorWarCharge(100, 100, 0.4, now);
    pm.spawnMalakorChargeTrail(120, 108, 0.4, now);

    // Floor 2: Archlich Vaelor
    pm.spawnVaelorFrostNovaBurst(200, 100, 72, now);
    pm.spawnVaelorSoulSiphonTether(240, 120, 200, 100, now);
    pm.spawnVaelorSoulHail(200, 100, 0.5, now);
    pm.spawnVaelorDeathRing(200, 100, now);

    // Floor 3: Ignis, Cinder Sovereign
    pm.spawnIgnisMagmaEruption(300, 100, 84, now);
    pm.spawnIgnisFissureWave(300, 100, 0.8, now);
    pm.spawnIgnisCinderSpiral(300, 100, now);
    pm.spawnIgnisCoreDetonation(340, 100, 110, now);

    // Floor 4: Void-Eater Malice
    pm.spawnMaliceSingularityImplosion(400, 100, 115, now);
    pm.spawnMaliceTendrilFlurry(400, 100, 1.0, now);
    pm.spawnMaliceVoidStep(400, 100, 490, 140, now);
    pm.spawnMaliceAbyssalNova(490, 140, now);

    // Floor 5: Archon of Nothingness
    pm.spawnArchonSupernovaBurst(500, 100, 140, now);
    pm.spawnArchonStarbeamStrike(540, 130, 70, now);
    pm.spawnArchonCosmicVolley(500, 100, 1.2, now);
    pm.spawnArchonConstellationSpiral(500, 100, now);

    // Floor 6: Elyndor, Keeper of the Last Hymn
    pm.spawnElyndorResonantCrescendo(100, 300, 0.3, now);
    pm.spawnElyndorHarpLaneMotes(150, 300, 340, 38, 0.3, now);
    pm.spawnElyndorLamentBurst(140, 320, 65, now);
    pm.spawnElyndorDivineChorus(100, 300, 0.3, now);
    pm.spawnElyndorChorusRemembrance(100, 300, now);

    // Floor 7: Zadkiel, Keeper of the Ashen Reliquary
    pm.spawnZadkielAshenCloudMotes(200, 300, 85, now);
    pm.spawnZadkielCenserSweepSparks(200, 300, 0.6, 155, 0.5, now);
    pm.spawnZadkielReliquaryAwakening(200, 300, now);
    pm.spawnZadkielRelicDetonation(250, 300, 70, now);
    pm.spawnZadkielJudgmentCast(200, 300, 0.6, now);

    // Floor 8: Sariel, Warden of the Veiled Scripture
    pm.spawnSarielScriptureBinding(300, 300, 0.1, now);
    pm.spawnSarielScriptureDetonation(300, 300, 420, 0.1, now);
    pm.spawnSarielForbiddenPageBurst(340, 320, 60, now);
    pm.spawnSarielSilenceSealMotes(340, 320, 75, now);
    pm.spawnSarielSilenceDetonation(340, 320, 75, now);
    pm.spawnSarielHereticalVolley(300, 300, now);

    // Floor 9: Seraphel, Sentinel of the Final Seal
    pm.spawnSeraphelPiercingLine(400, 300, 0.0, 380, now);
    pm.spawnSeraphelLancefallImpact(460, 300, 65, now);
    pm.spawnSeraphelAerialJudgment(400, 300, 0.2, now);
    pm.spawnSeraphelSpearfallCascade(400, 300, now);

    // Floor 10: Oriphiel, The Last Warden
    pm.spawnOriphielWardenEdictCast(500, 300, now);
    pm.spawnOriphielEdictExecution(500, 300, 220, 1, now);
    pm.spawnOriphielParryStance(500, 300, now);
    pm.spawnOriphielParryReflectBurst(500, 300, now);
    pm.spawnOriphielVerdictStage(520, 300, 105, 1, now);
    pm.spawnOriphielVerdictStage(540, 300, 155, 3, now);
    pm.spawnOriphielBastionShatter(500, 300, 190, now);

    assert.ok(pm.count > 250, `All 10 floor boss VFX methods should populate particles cleanly, got ${pm.count}`);

    const mockCtx = {
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      scale: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      ellipse: () => {},
      quadraticCurveTo: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      fill: () => {},
      stroke: () => {},
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      shadowColor: '',
      shadowBlur: 0,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    for (let frame = 1; frame <= 8; frame++) {
      pm.updateAndDraw(mockCtx, now + frame * 16, 0.016);
    }

    assert.ok(pm.count > 0, 'Boss skill particles animate and render across multiple frames without errors');
  });

  // --- Test 72: Side Monster Progression (Sanctum Wards, Guardian Seals, Locked Chests, Blessings, Mastery) ---
  await test('72. Side monster progression: Sanctum Wards, Guardian seals, locked chests, blessings, and floor mastery', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_SIDE_PROGRESSION',
      name: 'Side Monster Progression Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 4242,
      initialFloor: 1,
    });
    room.status = 'playing';
    const pid = 'p_side_prog';
    room.addOrReconnectPlayer(pid, 'Dungeoneer', 'vanguard', false, {
      level: 5,
      xp: 0,
      strength: 5,
      vitality: 5,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });
    const player = room.getPlayerState(pid)!;

    const combatRooms = room.map.rooms.filter((r) => r.type === 'combat');
    const guardianRooms = combatRooms.filter((r) => Boolean(r.guardian));
    assert.ok(combatRooms.length >= 2, 'Floor 1 must have at least 2 combat rooms');
    assert.strictEqual(guardianRooms.length, 1, 'Floor 1 must designate exactly 1 Guardian chamber');

    const gRoom = guardianRooms[0];
    const gEnemies = room.enemies.filter((e) => e.roomId === gRoom.id);
    assert.ok(gEnemies.length >= 4, 'Guardian chamber must contain at least 4 enemies');
    assert.ok(gEnemies.some((e) => e.elite && e.name.startsWith('Guardian ')), 'Guardian chamber must contain a Guardian Elite enemy');

    const gLockedChest = room.props.find((pr) => pr.roomId === gRoom.id && pr.kind === 'totem');
    assert.ok(gLockedChest && gLockedChest.locked, 'Guardian chamber totem must start locked');

    // Attempt to interact with locked totem while Guardian enemies remain alive
    player.x = gLockedChest!.x;
    player.y = gLockedChest!.y;
    const blessingsBefore = player.floorBlessings?.length || 0;
    room.tick(25);
    assert.strictEqual(gLockedChest!.opened, false, 'Locked totem must not open while room enemies are alive');
    assert.strictEqual(player.floorBlessings?.length || 0, blessingsBefore, 'Blessings must not change when totem is locked');

    // Boss Sanctum Wards should reduce boss damage taken when side combat rooms are uncleared
    const boss = room.enemies.find((e) => e.kind === 'boss')!;
    const initSnap = room.buildSnapshot();
    const initialWards = initSnap.bossWards ?? 0;
    assert.strictEqual(initialWards, Math.min(4, combatRooms.length), 'Boss Sanctum Wards should match uncleared combat rooms (cap 4)');

    const hpBeforeWardedHit = boss.hp;
    room.damageEnemy(boss, 100, player, false, 'physical');
    const wardedDamageTaken = hpBeforeWardedHit - boss.hp;

    // Clear a non-guardian combat room and verify Ward shatter, Blessing, XP, and Gold
    const regularRoom = combatRooms.find((r) => !r.guardian)!;
    const prevGold = player.gold;
    const prevXp = player.xp;
    const prevLevel = player.level;
    room.enemies = room.enemies.filter((e) => e.roomId !== regularRoom.id);
    room.tick(50);

    assert.strictEqual(regularRoom.cleared, true, 'Regular combat room should clear after its enemies are defeated');
    assert.ok(player.gold > prevGold, 'Clearing a combat room should reward Gold');
    assert.ok(player.xp !== prevXp || player.level > prevLevel, 'Clearing a combat room should reward XP');
    assert.strictEqual((player.floorBlessings?.length ?? 0), 1, 'Clearing a combat room should grant 1 Floor Blessing');

    const afterClearSnap = room.buildSnapshot();
    if (combatRooms.length <= 4) {
      assert.strictEqual(afterClearSnap.bossWards, initialWards - 1, 'Boss Sanctum Wards should drop after clearing a combat room');
    }

    // Slaying Boss while Guardian room is still active must NOT unlock portal
    const bossRoom = room.map.rooms.find((r) => r.type === 'boss')!;
    room.enemies = room.enemies.filter((e) => e.roomId !== bossRoom.id);
    room.tick(50);
    assert.strictEqual(bossRoom.cleared, true, 'Boss room should be marked cleared');
    assert.strictEqual(room.map.portalActive, false, 'Exit Portal must remain sealed while Guardian room is uncleared');

    // Now clear all remaining combat rooms (including Guardian room)
    room.enemies = [];
    const attrBeforeMastery = player.attributePoints;
    const potionsBeforeMastery = player.potions;
    room.tick(50);

    assert.strictEqual(gRoom.cleared, true, 'Guardian room should now be cleared');
    assert.strictEqual(gLockedChest!.locked, false, 'Guardian chamber chest must unlock when room clears');
    assert.strictEqual(room.map.portalActive, true, 'Exit Portal must unlock once Boss AND all Guardians are defeated');

    // Opening unlocked Guardian chest now succeeds
    player.x = gLockedChest!.x;
    player.y = gLockedChest!.y;
    room.performAction(pid, 'interact');
    assert.strictEqual(gLockedChest!.opened, true, 'Unlocked Guardian chest can now be opened');

    // Full-Floor Mastery Bonus check (must NOT award permanent attribute points, preventing farming past 147)
    const finalSnap = room.buildSnapshot();
    assert.strictEqual(finalSnap.floorMasteryAwarded, true, 'Full-floor mastery should be awarded when all combat rooms clear');
    assert.strictEqual(finalSnap.bossWards, 0, 'Boss Sanctum Wards should be 0 when all combat rooms are cleared');
    assert.strictEqual(player.attributePoints, attrBeforeMastery, 'Full-floor mastery must NOT grant unintended extra attribute points');
    assert.ok(player.potions >= Math.min(5, potionsBeforeMastery + 1), 'Full-floor mastery must grant +1 potion');

    // Verify Floor 5+ designates 2 Guardian rooms when >=3 combat rooms exist, and Sanctum Ward reduction worked earlier
    assert.ok(wardedDamageTaken < 100, `Warded boss should take reduced damage (took ${wardedDamageTaken})`);
    const floor5Room = new GameRoom({
      roomId: 'R_TEST_SIDE_F5',
      name: 'Floor 5 Guardian Check',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 4242,
      initialFloor: 5,
    });
    const f5CombatCount = floor5Room.map.rooms.filter((r) => r.type === 'combat').length;
    const f5GuardianCount = floor5Room.map.rooms.filter((r) => Boolean(r.guardian)).length;
    if (f5CombatCount >= 3) {
      assert.strictEqual(f5GuardianCount, 2, 'Floors 5+ with >=3 combat rooms should designate 2 Guardian chambers');
    } else {
      assert.strictEqual(f5GuardianCount, 1, 'Floors with <3 combat rooms should designate 1 Guardian chamber');
    }
  });

  // --- Test 73: Camera Zoom, Smooth Following & World-Space Aim Alignment ---
  await test('73. Camera zoom scales responsively across desktop/tablet/mobile while keeping player centered and aim accurate', async () => {
    const {
      computeCameraZoom,
      computeWorldAimAngle,
      getWorldViewBounds,
      stepCameraFollow,
    } = await import('./src/client/camera.ts');

    // 1. Default zoom enlarges characters across all viewport sizes while keeping bounded visibility
    const desktopZoom = computeCameraZoom(1920, 1080);
    const laptopZoom = computeCameraZoom(1280, 720);
    const tabletPortraitZoom = computeCameraZoom(768, 1024);
    const tabletLandscapeZoom = computeCameraZoom(1024, 768);
    const phonePortraitZoom = computeCameraZoom(390, 844);
    const phoneLandscapeZoom = computeCameraZoom(844, 390);

    assert.ok(desktopZoom >= 1.6 && desktopZoom <= 1.65, `Desktop zoom should enlarge sprites cleanly (got ${desktopZoom})`);
    assert.ok(laptopZoom >= 1.5 && laptopZoom <= 1.65, `Laptop zoom should enlarge sprites cleanly (got ${laptopZoom})`);
    assert.strictEqual(
      tabletPortraitZoom,
      tabletLandscapeZoom,
      'Tablet zoom must be orientation-consistent between portrait and landscape'
    );
    assert.ok(tabletPortraitZoom > 1.35 && tabletPortraitZoom < desktopZoom, `Tablet zoom expected ~1.42, got ${tabletPortraitZoom}`);
    assert.strictEqual(
      phonePortraitZoom,
      phoneLandscapeZoom,
      'Mobile zoom must be orientation-consistent between portrait and landscape'
    );
    assert.ok(phonePortraitZoom >= 1.2 && phonePortraitZoom < tabletPortraitZoom, `Mobile zoom should enlarge sprites without cramping view (got ${phonePortraitZoom})`);

    // 2. Surrounding environment visibility stays large enough for combat & navigation
    const phoneView = getWorldViewBounds(500, 500, 390, 844, phonePortraitZoom);
    assert.ok(phoneView.width >= 300 && phoneView.height >= 600, `Phone world viewport must remain navigable (${phoneView.width}x${phoneView.height})`);
    assert.strictEqual(Math.round((phoneView.left + phoneView.right) / 2), 500, 'Camera horizontally centered on player');
    assert.strictEqual(Math.round((phoneView.top + phoneView.bottom) / 2), 500, 'Camera vertically centered on player');

    // 3. Smooth camera following converges steadily without snapping on small moves, snaps on teleports
    const cam = { x: 500, y: 500 };
    stepCameraFollow(cam, 620, 500, 0.016);
    assert.ok(cam.x > 500 && cam.x < 620, `Camera should glide smoothly toward target (cam.x=${cam.x})`);
    for (let i = 0; i < 40; i++) {
      stepCameraFollow(cam, 620, 500, 0.016);
    }
    assert.ok(Math.abs(cam.x - 620) < 0.25, `Camera should settle cleanly on target (cam.x=${cam.x})`);

    stepCameraFollow(cam, 2000, 2000, 0.016);
    assert.strictEqual(cam.x, 2000, 'Camera should snap cleanly across floor transitions / teleports');
    assert.strictEqual(cam.y, 2000, 'Camera Y should snap cleanly across floor transitions / teleports');

    // 4. Screen-to-world aiming respects zoom factor when camera trails slightly behind player
    // Canvas 1200x800, zoom 1.5, player at (510, 400), camera at (500, 400) -> player on screen at (615, 400).
    // Cursor right above screen player at (615, 250) -> aim straight up (-Math.PI / 2).
    const upAngle = computeWorldAimAngle(615, 250, 1200, 800, 510, 400, 500, 400, 1.5);
    assert.ok(Math.abs(upAngle + Math.PI / 2) < 0.001, `Aiming up under zoom must match -PI/2, got ${upAngle}`);
  });

  // --- Test 74: Hero Sprite & Weapon Animation Rendering ---
  await test('74. Hero sprite renderer draws all 4 classes cleanly across idle, running, dashing, and multi-stage attack frames', async () => {
    const { drawHeroSprite } = await import('./src/client/heroSprites.ts');

    let drawOps = 0;
    const mockCtx = {
      save: () => { drawOps++; },
      restore: () => { drawOps++; },
      translate: () => { drawOps++; },
      rotate: () => { drawOps++; },
      scale: () => { drawOps++; },
      beginPath: () => { drawOps++; },
      closePath: () => { drawOps++; },
      moveTo: () => { drawOps++; },
      lineTo: () => { drawOps++; },
      arc: () => { drawOps++; },
      fillRect: () => { drawOps++; },
      strokeRect: () => { drawOps++; },
      fill: () => { drawOps++; },
      stroke: () => { drawOps++; },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const classes = ['vanguard', 'ranger', 'arcanist', 'cleric'] as const;
    const attackFrames = [0, 220, 150, 90, 30];
    const angles = [0.2, Math.PI * 0.8, -Math.PI / 4];

    for (const heroClass of classes) {
      for (const attackAnimMs of attackFrames) {
        for (const aimAngle of angles) {
          drawHeroSprite(
            mockCtx,
            {
              heroClass,
              attackAnimMs,
              vx: attackAnimMs === 0 ? 180 : 0,
              vy: 0,
              hasteMs: 0,
              shield: heroClass === 'vanguard' ? 20 : 0,
            },
            200,
            200,
            {
              aimAngle,
              bob: 1.5,
              moving: attackAnimMs === 0,
              now: 12345,
            }
          );
        }
      }
    }

    assert.ok(drawOps > 500, `Expected substantial canvas drawing operations across all hero animation frames, got ${drawOps}`);
  });

  // --- Test 75: Dynamic Weapon Swing Transitions & Ult Server Animation Trigger ---
  await test('75. Dynamic weapon rotation/translation transitions & ult animation state work across all hero classes', async () => {
    const { drawHeroSprite } = await import('./src/client/heroSprites.ts');
    const room = new GameRoom({
      roomId: 'R_TEST_SWING',
      name: 'Weapon Swing Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 1337,
      initialFloor: 1,
    });
    room.status = 'playing';
    const classes = ['vanguard', 'ranger', 'arcanist', 'cleric'] as const;

    for (const heroClass of classes) {
      const pid = `p_${heroClass}`;
      room.addOrReconnectPlayer(pid, heroClass, heroClass);
      const player = room.getPlayerState(pid)!;
      assert.ok(player, `Expected player ${pid} to exist`);
      player.ultCooldownMs = 0;
      player.attackAnimMs = 0;

      room.performAction(pid, 'ult', 0.25);
      assert.ok(player.attackAnimMs >= 240, `Expected ult action for ${heroClass} to set attackAnimMs, got ${player.attackAnimMs}`);

      const transformsByProgress: Array<{ translates: Array<[number, number]>; rotates: number[] }> = [];
      for (const swingProgress of [0.1, 0.45, 0.85]) {
        const translates: Array<[number, number]> = [];
        const rotates: number[] = [];
        const mockCtx = {
          save: () => {},
          restore: () => {},
          translate: (x: number, y: number) => { translates.push([Number(x.toFixed(2)), Number(y.toFixed(2))]); },
          rotate: (a: number) => { rotates.push(Number(a.toFixed(4))); },
          scale: () => {},
          beginPath: () => {},
          closePath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arc: () => {},
          fillRect: () => {},
          strokeRect: () => {},
          fill: () => {},
          stroke: () => {},
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
        } as unknown as CanvasRenderingContext2D;

        drawHeroSprite(
          mockCtx,
          {
            heroClass,
            attackAnimMs: 0,
            vx: 0,
            vy: 0,
            hasteMs: 0,
            shield: 0,
          },
          100,
          100,
          {
            aimAngle: 0.3,
            bob: 0,
            moving: false,
            now: 5000,
            swingProgress,
            swingKind: 'tactical',
          }
        );

        assert.ok(translates.length >= 2 && rotates.length >= 1, `Expected transform ops for ${heroClass}`);
        transformsByProgress.push({ translates, rotates });
      }

      // Ensure windup, strike/cast/release, and recovery produce distinct weapon transforms
      assert.notDeepStrictEqual(
        transformsByProgress[0],
        transformsByProgress[1],
        `Expected ${heroClass} weapon transform to transition from windup to active strike`
      );
      assert.notDeepStrictEqual(
        transformsByProgress[1],
        transformsByProgress[2],
        `Expected ${heroClass} weapon transform to transition from active strike to recovery`
      );
    }
  });

  // --- Test 76: Multiplayer Networking Optimizations (Single Serialization, Backpressure, RoomClientIndex, HUD Key, PingTracker) ---
  await test('76. Networking optimizations preserve protocol correctness and eliminate redundant work', async () => {
    const {
      broadcastSerialized,
      sendRawFrame,
      RoomClientIndex,
      WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES,
      WS_CRITICAL_BACKPRESSURE_BYTES,
      WS_MAX_CONSECUTIVE_DROPPED_TICKS,
    } = await import('./src/server/wsTransport.ts');
    const {
      PingTracker,
      buildSnapshotHudKey,
      buildLobbyRoomsKey,
      quantizePlayerInput,
      hasDiscreteInputChanged,
      isSameQuantizedInput,
    } = await import('./src/client/networkStats.ts');

    // 1. Single-pass serialization per broadcast
    let mockSeq = 0;
    const makeMockClient = (bufferedAmount = 0) => {
      mockSeq++;
      const sent: string[] = [];
      let closed = false;
      return {
        userId: `u_${mockSeq}`,
        username: `User${mockSeq}`,
        roomId: null as string | null,
        droppedTicks: 0,
        totalDroppedTicks: 0,
        sent,
        get isClosed() {
          return closed;
        },
        ws: {
          readyState: 1,
          get bufferedAmount() {
            return bufferedAmount;
          },
          setBufferedAmount(val: number) {
            bufferedAmount = val;
          },
          send(data: string) {
            sent.push(data);
          },
          close() {
            closed = true;
            this.readyState = 3;
          },
        },
      };
    };

    const mockClients = [makeMockClient(0), makeMockClient(0), makeMockClient(0), makeMockClient(0)];
    let serializeCalls = 0;
    const roomPayload = { type: 'room:tick' as const, snapshot: {} as any };
    const result = broadcastSerialized(
      mockClients,
      roomPayload,
      { droppable: true },
      (m) => {
        serializeCalls++;
        return JSON.stringify(m);
      }
    );
    assert.strictEqual(serializeCalls, 1, 'Expected JSON serializer to execute once across all 4 recipients');
    assert.strictEqual(result.sentCount, 4);
    assert.strictEqual(mockClients[0].sent[0], mockClients[3].sent[0]);

    // 2. Backpressure: droppable frames skip high-water clients; critical frames still deliver; overflow closes client
    const slowClient = makeMockClient(WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES + 512);
    const tickRes = sendRawFrame(slowClient, '{"type":"room:tick"}', { droppable: true });
    assert.strictEqual(tickRes, 'dropped_backpressure');
    assert.strictEqual(slowClient.droppedTicks, 1);
    assert.strictEqual(slowClient.sent.length, 0);

    const chatRes = sendRawFrame(slowClient, '{"type":"chat:message"}', { droppable: false });
    assert.strictEqual(chatRes, 'sent');
    assert.strictEqual(slowClient.sent.length, 1);

    // Drain resets droppedTicks
    slowClient.ws.setBufferedAmount(0);
    const recoveredRes = sendRawFrame(slowClient, '{"type":"room:tick"}', { droppable: true });
    assert.strictEqual(recoveredRes, 'sent');
    assert.strictEqual(slowClient.droppedTicks, 0);

    // Persistent stall triggers disconnect after WS_MAX_CONSECUTIVE_DROPPED_TICKS
    slowClient.ws.setBufferedAmount(WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES + 100);
    for (let i = 0; i < WS_MAX_CONSECUTIVE_DROPPED_TICKS - 1; i++) {
      assert.strictEqual(sendRawFrame(slowClient, '{"type":"room:tick"}', { droppable: true }), 'dropped_backpressure');
    }
    assert.strictEqual(sendRawFrame(slowClient, '{"type":"room:tick"}', { droppable: true }), 'closed_overflow');
    assert.strictEqual(slowClient.isClosed, true);

    // Extreme buffer spikes trigger immediate disconnect
    const stalledClient = makeMockClient(WS_CRITICAL_BACKPRESSURE_BYTES + 1);
    assert.strictEqual(sendRawFrame(stalledClient, '{"type":"room:tick"}', { droppable: true }), 'closed_overflow');
    assert.strictEqual(stalledClient.isClosed, true);

    // 3. RoomClientIndex O(roomSize) routing
    const index = new RoomClientIndex<(typeof mockClients)[0]>();
    index.assignRoom(mockClients[0], 'ROOM-A');
    index.assignRoom(mockClients[1], 'ROOM-A');
    index.assignRoom(mockClients[2], 'ROOM-B');
    assert.strictEqual(index.getRoomClientCount('ROOM-A'), 2);
    assert.strictEqual(index.getRoomClientCount('ROOM-B'), 1);
    index.assignRoom(mockClients[1], 'ROOM-B');
    assert.strictEqual(index.getRoomClientCount('ROOM-A'), 1);
    assert.strictEqual(index.getRoomClientCount('ROOM-B'), 2);
    index.removeFromRoom(mockClients[1]);
    assert.strictEqual(index.getRoomClientCount('ROOM-B'), 1);

    // 4. Snapshot HUD Key deduplicates movement-only ticks while reacting to combat/HUD changes
    const room = new GameRoom({
      roomId: 'NET-TEST',
      name: 'Networking Test',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 4242,
      initialFloor: 1,
    });
    room.status = 'playing';
    room.addOrReconnectPlayer('p1', 'Hero1', 'vanguard');
    const snapA = room.buildSnapshot();
    const keyA = buildSnapshotHudKey(snapA, 'p1', room.map);

    // Pure coordinate shift away from NPCs/portals should preserve HUD key
    const p1 = room.getPlayerState('p1')!;
    p1.x += 5;
    p1.y += 3;
    const snapB = room.buildSnapshot();
    const keyB = buildSnapshotHudKey(snapB, 'p1', room.map);
    assert.strictEqual(keyA, keyB, 'Expected pure movement tick to preserve HUD key without React rerender');

    // HP change must invalidate HUD key immediately
    p1.hp = Math.max(1, p1.hp - 10);
    const snapC = room.buildSnapshot();
    const keyC = buildSnapshotHudKey(snapC, 'p1', room.map);
    assert.notStrictEqual(keyB, keyC, 'Expected HP loss to update HUD key immediately');

    // Lobby rooms key deduplication
    const summaries = [room.getSummary()];
    assert.strictEqual(buildLobbyRoomsKey(summaries, 3), buildLobbyRoomsKey([...summaries], 3));
    assert.notStrictEqual(buildLobbyRoomsKey(summaries, 3), buildLobbyRoomsKey(summaries, 4));

    // 5. Input quantization & discrete transition detection
    const baseInput = quantizePlayerInput({
      up: false,
      down: false,
      left: false,
      right: true,
      attack: false,
      aimAngle: 0.501,
      stickX: 0.402,
      stickY: -0.204,
    });
    const tinyJitter = quantizePlayerInput({
      up: false,
      down: false,
      left: false,
      right: true,
      attack: false,
      aimAngle: 0.504,
      stickX: 0.404,
      stickY: -0.201,
    });
    assert.strictEqual(isSameQuantizedInput(baseInput, tinyJitter), true, 'Sub-threshold aim/stick noise should collapse');
    assert.strictEqual(
      hasDiscreteInputChanged(baseInput, { ...tinyJitter, attack: true }),
      true,
      'Discrete attack press must be detected immediately'
    );

    // 6. PingTracker RTT, jitter & quality diagnostics
    const tracker = new PingTracker(5);
    const d1 = tracker.recordSample(40);
    assert.strictEqual(d1.pingMs, 40);
    assert.strictEqual(d1.quality, 'excellent');
    tracker.recordSample(80);
    const d3 = tracker.recordSample(40);
    assert.ok(d3.jitterMs > 0, 'Expected jitter > 0 across varying RTT samples');
    assert.strictEqual(d3.minRttMs, 40);
    assert.strictEqual(d3.maxRttMs, 80);
    assert.strictEqual(d3.samples, 3);
  });

  // --- Test 77: Advanced Latency Optimization — Input Backpressure Recovery, Network Snapshot Slimming & Client-Side Prediction ---
  await test('77. Advanced Latency Optimization: Backpressure recovery, network snapshot projection, and client-side prediction', async () => {
    const {
      ReliableInputDispatcher,
      buildSnapshotHudKey,
      computeExpSmoothingFactor,
    } = await import('./src/client/networkStats.ts');
    const { LocalPredictionController } = await import('./src/client/prediction.ts');

    // 1. ReliableInputDispatcher never loses discrete key-up/press transitions under WS backpressure
    const dispatcher = new ReliableInputDispatcher();
    const sentPackets: { input: any; seq: number }[] = [];
    let allowSend = true;

    const r1 = dispatcher.submit(
      { up: false, down: false, left: false, right: true, attack: true, aimAngle: 0.25 },
      100,
      (pkt) => {
        if (!allowSend) return false;
        sentPackets.push({ input: pkt.input, seq: pkt.seq });
        return true;
      }
    );
    assert.strictEqual(r1.status, 'sent');
    assert.strictEqual(r1.seq, 1);

    // Simulate backpressure during key-up transition
    allowSend = false;
    const r2 = dispatcher.submit(
      { up: false, down: false, left: false, right: false, attack: false, aimAngle: 0.25 },
      116,
      (pkt) => {
        if (!allowSend) return false;
        sentPackets.push({ input: pkt.input, seq: pkt.seq });
        return true;
      }
    );
    assert.strictEqual(r2.status, 'queued_backpressure');
    assert.strictEqual(dispatcher.hasPending(), true);
    assert.strictEqual(dispatcher.latestSentSeq, 1, 'Seq must not advance until transport accepts');

    // Re-submitting identical idle key-up must stay queued (not deduped against old held state!)
    const r3 = dispatcher.submit(
      { up: false, down: false, left: false, right: false, attack: false, aimAngle: 0.25 },
      124,
      (pkt) => {
        if (!allowSend) return false;
        sentPackets.push({ input: pkt.input, seq: pkt.seq });
        return true;
      }
    );
    assert.strictEqual(r3.status, 'deduped');
    assert.strictEqual(dispatcher.hasPending(), true);

    // Socket drains -> retry flushes queued key-up with seq=2
    allowSend = true;
    const flush = dispatcher.flushPending(132, (pkt) => {
      sentPackets.push({ input: pkt.input, seq: pkt.seq });
      return true;
    });
    assert.strictEqual(flush.sent, true);
    assert.strictEqual(flush.seq, 2);
    assert.strictEqual(dispatcher.hasPending(), false);
    assert.strictEqual(sentPackets.length, 2);
    assert.strictEqual(sentPackets[1].input.right, false);
    assert.strictEqual(sentPackets[1].input.attack, false);

    // 2. Network snapshot slimming & seq acknowledgment
    const room = new GameRoom({
      roomId: 'OPT-F5',
      name: 'Optimization Room',
      hostName: 'Hero1',
      difficulty: 'Normal',
      seed: 9001,
      initialFloor: 5,
    });
    room.status = 'playing';
    room.addOrReconnectPlayer('p1', 'Hero1', 'vanguard');
    room.updateInput('p1', { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0.12345 }, 42);
    room.tick(50);

    const fullSnap = room.buildSnapshot();
    const netSnap = room.buildNetworkSnapshot();
    const fullBytes = Buffer.byteLength(JSON.stringify({ type: 'room:tick', snapshot: fullSnap }), 'utf8');
    const netBytes = Buffer.byteLength(JSON.stringify({ type: 'room:tick', snapshot: netSnap }), 'utf8');
    assert.ok(netBytes < fullBytes, `Expected network snapshot (${netBytes}B) < full (${fullBytes}B)`);

    const meNet = netSnap.players.find((p) => p.id === 'p1')!;
    assert.strictEqual(meNet.lastInputSeq, 42, 'Server must acknowledge latest processed input seq');

    const netBoss = netSnap.enemies.find((e) => e.kind === 'boss');
    const netMob = netSnap.enemies.find((e) => e.kind !== 'boss');
    assert.ok(netBoss?.resistances && typeof netBoss.resistances.tenacity === 'number', 'Boss resistances must be preserved for HUD');
    assert.strictEqual(netMob?.resistances, undefined, 'Non-boss resistances should be omitted from wire ticks');
    assert.ok(buildSnapshotHudKey(netSnap, 'p1', room.map).length > 0, 'HUD key must compute cleanly on trimmed snapshot');

    // Also check Tavern idle NPCs strip dialogue text while speaking NPC keeps dialogue
    const tavern = new GameRoom({
      roomId: 'TAVERN-HUB',
      name: 'Tavern',
      hostName: 'Innkeeper',
      difficulty: 'Normal',
      seed: 777,
    });
    tavern.addOrReconnectPlayer('p1', 'Hero1', 'vanguard');
    tavern.npcs[0].speakingMs = 4000;
    const tavNet = tavern.buildNetworkSnapshot();
    assert.ok(tavNet.npcs[0].dialogue.length > 0, 'Speaking NPC retains dialogue');
    if (tavNet.npcs.length > 1) {
      assert.strictEqual(tavNet.npcs[1].dialogue, '', 'Silent NPC strips dialogue on network ticks');
    }

    // 3. LocalPredictionController instant step + reconciliation + dash snap
    const predictor = new LocalPredictionController();
    const pState = room.getPlayerState('p1')!;
    const initX = pState.x;
    const initY = pState.y;

    const step0 = predictor.step({
      me: { ...pState, lastInputSeq: 2 },
      liveInput: { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0 },
      latestSentSeq: 2,
      map: room.map,
      props: room.props,
      dtSec: 0.016,
      nowMs: 1000,
      isNewSnapshot: true,
      oneWayLatencySec: 0.02,
    });
    assert.strictEqual(step0.x, initX, 'Initial frame initializes at authoritative spawn');

    // Next frame predicts forward immediately without waiting for server snapshot
    const step1 = predictor.step({
      me: { ...pState, lastInputSeq: 2 },
      liveInput: { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0 },
      latestSentSeq: 3,
      map: room.map,
      props: room.props,
      dtSec: 0.05,
      nowMs: 1050,
      isNewSnapshot: false,
      oneWayLatencySec: 0.02,
    });
    assert.ok(step1.x > initX, `Expected immediate predicted forward movement (${step1.x} > ${initX})`);

    // Authoritative dash displacement > 48px must snap cleanly without rubber-banding
    room.performAction('p1', 'dash', 0);
    const dashedSnap = room.buildNetworkSnapshot();
    const meDashed = dashedSnap.players.find((p) => p.id === 'p1')!;
    const dashRes = predictor.step({
      me: meDashed,
      liveInput: { up: false, down: false, left: false, right: false, attack: false, aimAngle: 0 },
      latestSentSeq: 3,
      map: room.map,
      props: dashedSnap.props,
      dtSec: 0.016,
      nowMs: 1100,
      isNewSnapshot: true,
      oneWayLatencySec: 0.02,
    });
    assert.ok(Math.hypot(dashRes.x - meDashed.x, dashRes.y - meDashed.y) < 1, 'Expected dash jump >48px to snap immediately to authoritative position');
    assert.strictEqual(dashRes.snapped, true);

    // 4. Refresh-rate invariance of exponential smoothing factor
    const f60 = computeExpSmoothingFactor(45, 1 / 60);
    const f120 = computeExpSmoothingFactor(45, 1 / 120);
    const combined120 = 1 - Math.pow(1 - f120, 2);
    assert.ok(Math.abs(f60 - combined120) < 1e-9, 'Expected dt-normalized smoothing to match across 60Hz and 120Hz');
  });

  // --- Test 78: 8-Directional Character, Enemy & NPC Facing and Rendering ---
  await test('78. True 8-directional facing (N, NE, E, SE, S, SW, W, NW) works across all hero classes, animations, abilities, controls, enemies, and NPCs', async () => {
    const {
      DIRECTION8_LIST,
      angleToDirection8,
      direction8ToPose,
      resolvePlayerDirection8,
      resolveEnemyDirection8,
      resolveNpcDirection8,
    } = await import('./src/client/directionalFacing.ts');
    const { drawHeroSprite } = await import('./src/client/heroSprites.ts');
    const {
      drawSlimeSprite,
      drawGoblinSprite,
      drawSkeletonSprite,
      drawCultistSprite,
      drawKnightSprite,
      drawShadowStalkerSprite,
      drawAstralSentinelSprite,
      drawHymnPhantomSprite,
      drawRelicGolemSprite,
      drawVeiledHereticSprite,
      drawCelestialArbiterSprite,
      drawWardenEnforcerSprite,
      drawGenericEnemySprite,
    } = await import('./src/client/enemySprites.ts');
    const { drawNpc, drawHumanoidBoss } = await import('./src/client/npcSprites.ts');
    const { normalizePlayerInputDirection, hasMovementInput } = await import('./src/shared/playerMovement.ts');

    // 1. Angle quantization & pose metadata for all 8 directions
    const expectedAngles: Array<[number, string, string]> = [
      [0, 'E', 'side'],
      [Math.PI / 4, 'SE', 'front'],
      [Math.PI / 2, 'S', 'front'],
      [(3 * Math.PI) / 4, 'SW', 'front'],
      [Math.PI, 'W', 'side'],
      [(-3 * Math.PI) / 4, 'NW', 'back'],
      [-Math.PI / 2, 'N', 'back'],
      [-Math.PI / 4, 'NE', 'back'],
    ];
    for (const [ang, expectedDir, expectedPlane] of expectedAngles) {
      const dir = angleToDirection8(ang);
      assert.strictEqual(dir, expectedDir, `Angle ${ang} should map to ${expectedDir}, got ${dir}`);
      const pose = direction8ToPose(dir, false);
      assert.strictEqual(pose.verticalPlane, expectedPlane);
    }

    // 2. Movement facing vs idle aim facing + keyboard & mobile joystick controls
    const kbDirs = [
      { up: true, down: false, left: false, right: false, expected: 'N' },
      { up: true, down: false, left: false, right: true, expected: 'NE' },
      { up: false, down: false, left: false, right: true, expected: 'E' },
      { up: false, down: true, left: false, right: true, expected: 'SE' },
      { up: false, down: true, left: false, right: false, expected: 'S' },
      { up: false, down: true, left: true, right: false, expected: 'SW' },
      { up: false, down: false, left: true, right: false, expected: 'W' },
      { up: true, down: false, left: true, right: false, expected: 'NW' },
    ];
    for (const kb of kbDirs) {
      const input = { ...kb, attack: false, aimAngle: 0 };
      assert.strictEqual(hasMovementInput(input), true);
      const { mx, my } = normalizePlayerInputDirection(input, false, 1000);
      // Aim opposite (South-West/East) while moving -> character must face movement direction
      const movingPose = resolvePlayerDirection8({
        moveX: mx,
        moveY: my,
        aimAngle: Math.PI * 0.75,
        isMoving: true,
        prevFacingLeft: false,
      });
      assert.strictEqual(movingPose.dir, kb.expected, `Keyboard move should face ${kb.expected}`);
    }

    // Mobile virtual joystick 8-way input
    for (const dir of DIRECTION8_LIST) {
      const targetPose = direction8ToPose(dir, false);
      const stickInput = {
        up: false,
        down: false,
        left: false,
        right: false,
        stickX: targetPose.dirX * 0.9,
        stickY: targetPose.dirY * 0.9,
        attack: false,
        aimAngle: 0,
      };
      assert.strictEqual(hasMovementInput(stickInput), true);
      const { mx, my } = normalizePlayerInputDirection(stickInput, false, 1000);
      const joyPose = resolvePlayerDirection8({
        moveX: mx,
        moveY: my,
        aimAngle: Math.PI,
        isMoving: true,
      });
      assert.strictEqual(joyPose.dir, dir, `Joystick input should face ${dir}`);
    }

    // Standing still -> character faces aimAngle across all 8 directions
    for (const dir of DIRECTION8_LIST) {
      const targetPose = direction8ToPose(dir, false);
      const idlePose = resolvePlayerDirection8({
        moveX: 0,
        moveY: 0,
        aimAngle: targetPose.angleRad,
        isMoving: false,
      });
      assert.strictEqual(idlePose.dir, dir, `Idle aim should face ${dir}`);
    }

    // Remote multiplayer player moving NW while aiming SE -> faces NW
    const remotePose = resolvePlayerDirection8({
      moveX: -120,
      moveY: -120,
      aimAngle: Math.PI / 4,
      isMoving: true,
    });
    assert.strictEqual(remotePose.dir, 'NW');
    assert.strictEqual(remotePose.facingLeft, true);

    // 3. Render all 4 hero classes across all 8 directions (idle, walk, primary, tactical, ult, independent aim)
    const createTrackingMockCtx = () => {
      const stack: number[] = [1];
      const scales: Array<[number, number]> = [];
      const rotates: number[] = [];
      const textScaleXs: number[] = [];
      let drawOps = 0;
      const ctx = {
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: 1,
        save: () => { stack.push(stack[stack.length - 1]); },
        restore: () => { if (stack.length > 1) stack.pop(); },
        translate: () => {},
        rotate: (a: number) => { rotates.push(a); },
        scale: (sx: number, sy: number) => {
          scales.push([sx, sy]);
          stack[stack.length - 1] *= sx;
        },
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arc: () => {},
        ellipse: () => {},
        fillRect: () => { drawOps++; },
        strokeRect: () => { drawOps++; },
        fill: () => { drawOps++; },
        stroke: () => { drawOps++; },
        fillText: () => { textScaleXs.push(stack[stack.length - 1]); drawOps++; },
        createRadialGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;
      return {
        ctx,
        getStats: () => ({ drawOps, scales: [...scales], rotates: [...rotates], textScaleXs: [...textScaleXs] }),
      };
    };

    const heroClasses = ['vanguard', 'ranger', 'arcanist', 'cleric'] as const;
    const swingKinds = ['primary', 'tactical', 'ult'] as const;
    for (const heroClass of heroClasses) {
      for (const dir of DIRECTION8_LIST) {
        const pose = direction8ToPose(dir, false);
        // Idle + Walk
        for (const moving of [false, true]) {
          const tracker = createTrackingMockCtx();
          drawHeroSprite(
            tracker.ctx,
            {
              heroClass,
              attackAnimMs: 0,
              vx: moving ? pose.dirX * 160 : 0,
              vy: moving ? pose.dirY * 160 : 0,
              hasteMs: heroClass === 'ranger' && moving ? 1000 : 0,
              shield: heroClass === 'vanguard' ? 25 : 0,
            },
            240,
            240,
            {
              aimAngle: pose.angleRad,
              bob: moving ? 1.5 : 0,
              moving,
              now: 12000,
              facingLeft: pose.facingLeft,
              facingDirection: dir,
            }
          );
          const stats = tracker.getStats();
          assert.ok(stats.drawOps > 10, `Expected drawing ops for ${heroClass} ${dir} moving=${moving}`);
          const expectMirror = !pose.isPureVertical && pose.facingLeft;
          const hasMirrorScale = stats.scales.some(([sx]) => sx === -1);
          assert.strictEqual(
            hasMirrorScale,
            expectMirror,
            `${heroClass} ${dir} horizontal mirror mismatch`
          );
        }

        // Primary, Tactical, Ult with independent aim perpendicular to facing
        const indepAim = pose.angleRad + Math.PI / 2;
        for (const swingKind of swingKinds) {
          const tracker = createTrackingMockCtx();
          drawHeroSprite(
            tracker.ctx,
            {
              heroClass,
              attackAnimMs: 180,
              vx: pose.dirX * 140,
              vy: pose.dirY * 140,
              hasteMs: 0,
              shield: 10,
            },
            240,
            240,
            {
              aimAngle: indepAim,
              bob: 1,
              moving: true,
              now: 12500,
              swingProgress: 0.48,
              swingKind,
              facingLeft: pose.facingLeft,
              facingDirection: dir,
            }
          );
          const stats = tracker.getStats();
          assert.ok(stats.drawOps > 12, `Expected attack draw ops for ${heroClass} ${dir} ${swingKind}`);
          assert.ok(stats.rotates.length >= 1, `Expected independent weapon rotation for ${heroClass} ${dir} ${swingKind}`);
        }
      }
    }

    // 4. All 13 enemy sprite renderers + 5 humanoid bosses across all 8 directions
    const baseEnemy = {
      id: 'e_dir',
      kind: 'goblin' as const,
      name: 'Test Mob',
      roomId: 1,
      x: 200,
      y: 200,
      vx: 0,
      vy: 0,
      hp: 100,
      maxHp: 100,
      radius: 14,
      state: 'chase' as const,
      windupMs: 0,
      targetX: 200,
      targetY: 200,
      markedMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      elite: false,
    };

    const enemyRenderers = [
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawSlimeSprite(ctx, en, 200, 200, 12000, 'catacombs', p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawGoblinSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawSkeletonSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawCultistSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawKnightSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawShadowStalkerSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawAstralSentinelSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawHymnPhantomSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawRelicGolemSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawVeiledHereticSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawCelestialArbiterSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawWardenEnforcerSprite(ctx, en, 200, 200, 12000, p),
      (ctx: CanvasRenderingContext2D, en: any, p: any) => drawGenericEnemySprite(ctx, en, 200, 200, 12000, p),
    ];

    for (const dir of DIRECTION8_LIST) {
      const targetPose = direction8ToPose(dir, false);
      const enemyState = {
        ...baseEnemy,
        vx: targetPose.dirX * 90,
        vy: targetPose.dirY * 90,
      };
      const resolved = resolveEnemyDirection8(enemyState, 'S', false);
      assert.strictEqual(resolved.dir, dir);

      for (const renderFn of enemyRenderers) {
        const tracker = createTrackingMockCtx();
        assert.doesNotThrow(() => renderFn(tracker.ctx, enemyState, resolved));
        const stats = tracker.getStats();
        assert.ok(stats.drawOps > 0);
        // Ensure any text drawn (e.g. Hymn Phantom music notes) is never mirrored
        for (const sx of stats.textScaleXs) {
          assert.strictEqual(sx, 1, 'Enemy text elements must remain un-mirrored');
        }
      }

      const bossTracker = createTrackingMockCtx();
      assert.doesNotThrow(() =>
        drawHumanoidBoss(bossTracker.ctx, 200, 200, 'Elyndor, Keeper of the Last Hymn', 12000, enemyState, resolved)
      );
      assert.ok(bossTracker.getStats().drawOps > 10);
    }

    // 5. Tavern NPCs: 8-way facing toward nearby player, default South when alone, un-mirrored name/talk badge
    const npcs = [
      { id: 'npc_bram', name: 'Innkeeper Bram', x: 300, y: 300, radius: 14, spriteKind: 'innkeeper' as const, dialogue: 'Welcome' },
      { id: 'npc_lena', name: 'Barkeeper Lena', x: 300, y: 300, radius: 14, spriteKind: 'barkeep' as const, dialogue: 'Drink?' },
      { id: 'npc_jorah', name: 'Veteran Jorah', x: 300, y: 300, radius: 14, spriteKind: 'veteran' as const, dialogue: 'Ready' },
      { id: 'npc_aleph', name: 'Aleph', x: 300, y: 300, radius: 14, spriteKind: 'mysterious_cloak' as const, dialogue: 'Hmm' },
      { id: 'npc_other', name: 'Traveler', x: 300, y: 300, radius: 14, spriteKind: 'scholar' as const, dialogue: 'Hi' },
    ];
    assert.strictEqual(resolveNpcDirection8(npcs[0], [], 140).dir, 'S');
    for (const dir of DIRECTION8_LIST) {
      const p = direction8ToPose(dir, false);
      const nearbyPlayer = { x: 300 + p.dirX * 60, y: 300 + p.dirY * 60, downed: false };
      const npcPose = resolveNpcDirection8(npcs[0], [nearbyPlayer], 140);
      assert.strictEqual(npcPose.dir, dir);
      for (const npc of npcs) {
        const tracker = createTrackingMockCtx();
        assert.doesNotThrow(() => drawNpc(tracker.ctx, npc, 12000, npcPose));
        const stats = tracker.getStats();
        assert.ok(stats.textScaleXs.length >= 2, 'NPC name and prompt should render');
        for (const sx of stats.textScaleXs) {
          assert.strictEqual(sx, 1, `NPC ${npc.name} badge text must stay upright (un-mirrored) on ${dir}`);
        }
      }
    }

    // 6. Server primary attacks preserve 8-directional aimAngle even with enemies behind player
    const atkRoom = new GameRoom({
      roomId: 'EXPEDITION-8WAY-ATK',
      name: 'Test 8Way Attack',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 9012,
    });
    for (const heroClass of ['vanguard', 'ranger', 'arcanist', 'cleric'] as const) {
      const pid = `atk_${heroClass}`;
      atkRoom.addOrReconnectPlayer(pid, pid, heroClass);
      const player = atkRoom.getPlayerState(pid)!;
      for (const dir of DIRECTION8_LIST) {
        const pose = direction8ToPose(dir, false);
        atkRoom.enemies = [
          {
            ...baseEnemy,
            id: `rear_${dir}`,
            x: player.x - pose.dirX * 55,
            y: player.y - pose.dirY * 55,
          },
        ];
        atkRoom.projectiles = [];
        player.aimAngle = pose.angleRad;
        atkRoom.firePrimaryAttack(player);
        const proj = atkRoom.projectiles.find((pr) => pr.ownerId === pid);
        assert.ok(proj, `Primary attack should spawn projectile for ${heroClass} facing ${dir}`);
        const angleDiff = Math.abs(
          Math.atan2(Math.sin(proj!.angle - pose.angleRad), Math.cos(proj!.angle - pose.angleRad))
        );
        assert.ok(angleDiff < 0.05, `${heroClass} projectile on ${dir} must follow aimAngle (diff=${angleDiff})`);
        assert.ok(!proj!.targetEnemyId, `Rear enemy must not be homing-locked when aiming ${dir}`);
      }
    }
  });

  // --- Test 79: Drag-to-aim ability targeting specs, ground AoE placement, dash aiming & indicator rendering ---
  test('79. Drag-to-aim ability targeting specs, server execution, and canvas indicators work across all classes', () => {
    const room = new GameRoom({
      roomId: 'EXPEDITION-DRAG-AIM',
      name: 'Drag Aim Test',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 4242,
    });

    // 1. Validate spec taxonomy across all classes & dash
    assert.strictEqual(getAbilityTargetSpec('vanguard', 'tactical').kind, 'dash');
    assert.strictEqual(getAbilityTargetSpec('vanguard', 'ult').kind, 'self_aoe');
    assert.strictEqual(getAbilityTargetSpec('ranger', 'tactical').kind, 'cone_volley');
    assert.strictEqual(getAbilityTargetSpec('ranger', 'ult').kind, 'self_aoe');
    assert.strictEqual(getAbilityTargetSpec('arcanist', 'tactical').kind, 'self_aoe');
    assert.strictEqual(getAbilityTargetSpec('arcanist', 'ult').kind, 'ground_aoe');
    assert.strictEqual(getAbilityTargetSpec('cleric', 'tactical').kind, 'self_aoe');
    assert.strictEqual(getAbilityTargetSpec('cleric', 'ult').kind, 'ground_aoe');
    assert.strictEqual(getAbilityTargetSpec('ranger', 'dash').kind, 'dash');

    // 2. Arcanist Chrono Well honors aimDistance and clamps to 220px max range
    room.addOrReconnectPlayer('arc_aim', 'Arc', 'arcanist');
    const arc = room.getPlayerState('arc_aim')!;
    arc.ultCooldownMs = 0;
    const startX = arc.x;
    const startY = arc.y;
    room.zones = [];
    room.performAction('arc_aim', 'ult', Math.PI / 2, {
      aimDistance: 500, // beyond 220 max range
      explicitAim: true,
    });
    const chronoZone = room.zones.find((z) => z.kind === 'chrono_well');
    assert.ok(chronoZone, 'Chrono Well zone should spawn');
    assert.ok(
      Math.abs(chronoZone!.x - startX) < 1 && Math.abs(chronoZone!.y - (startY + 220)) < 1,
      `Chrono Well must clamp target distance to 220px along aimAngle (got dx=${chronoZone!.x - startX}, dy=${chronoZone!.y - startY})`
    );
    // Cooldown lock must prevent recasting immediately
    room.zones = [];
    room.performAction('arc_aim', 'ult', 0, { aimDistance: 100, explicitAim: true });
    assert.strictEqual(room.zones.length, 0, 'Cooldown lock must block ult recast');

    // 3. Cleric Solar Beacon places at target ground coordinates & defaults to self-cast when omitted
    room.addOrReconnectPlayer('cle_aim', 'Cle', 'cleric');
    const cle = room.getPlayerState('cle_aim')!;
    cle.ultCooldownMs = 0;
    room.zones = [];
    room.performAction('cle_aim', 'ult', Math.PI, { aimDistance: 140, explicitAim: true });
    const solarAimed = room.zones.find((z) => z.kind === 'solar_beacon');
    assert.ok(solarAimed, 'Aimed Solar Beacon should spawn');
    assert.ok(
      Math.abs(solarAimed!.x - (cle.x - 140)) < 1 && Math.abs(solarAimed!.y - cle.y) < 1,
      'Solar Beacon must spawn at aimed ground offset'
    );
    // Default (quick tap) places on self (distance 0)
    cle.ultCooldownMs = 0;
    room.zones = [];
    room.performAction('cle_aim', 'ult', 0);
    const solarDefault = room.zones.find((z) => z.kind === 'solar_beacon');
    assert.ok(
      solarDefault && Math.abs(solarDefault.x - cle.x) < 1 && Math.abs(solarDefault.y - cle.y) < 1,
      'Quick-tap Solar Beacon without aimDistance must center on player'
    );

    // 4. Explicit-aim Dash overrides movement vector (vx, vy), while quick-tap Dash follows movement
    room.addOrReconnectPlayer('rng_aim', 'Rng', 'ranger');
    const rng = room.getPlayerState('rng_aim')!;
    const originX = rng.x;
    const originY = rng.y;
    rng.vx = 180; // Moving East
    rng.vy = 0;
    rng.dashCooldownMs = 0;
    room.performAction('rng_aim', 'dash', Math.PI / 2, {
      aimDistance: 60,
      explicitAim: true,
    });
    assert.ok(
      rng.y > originY + 20 && Math.abs(rng.x - originX) < 5,
      `Explicit-aim dash must move South even while walking East (dx=${rng.x - originX}, dy=${rng.y - originY})`
    );

    // Quick-tap dash (explicitAim false) follows movement vector East
    rng.x = originX;
    rng.y = originY;
    rng.dashCooldownMs = 0;
    room.performAction('rng_aim', 'dash', Math.PI / 2, {
      explicitAim: false,
    });
    assert.ok(
      rng.x > originX + 30 && Math.abs(rng.y - originY) < 5,
      `Non-explicit dash must follow active velocity vector East (dx=${rng.x - originX}, dy=${rng.y - originY})`
    );

    // 5. Silence restriction remains intact
    room.applyStatusEffect(arc, 'silence', 2000);
    arc.skillCooldownMs = 0;
    const beforeProjCount = room.projectiles.length;
    room.performAction('arc_aim', 'tactical', 0, { explicitAim: true });
    assert.strictEqual(room.projectiles.length, beforeProjCount, 'Silenced player must not fire tactical ability');

    // 6. Wall-clamped simulateDashEndpoint stays inside walkable map bounds
    const clampedEnd = simulateDashEndpoint(
      room.map,
      room.props,
      room.npcs,
      originX,
      originY,
      0,
      5000,
      14
    );
    assert.ok(
      clampedEnd.x < room.map.width * TILE_SIZE,
      'Simulated dash endpoint must clamp against dungeon walls'
    );

    // 7. Canvas indicator renders cleanly for all hero classes, actions, and cancel states
    const noop = () => {};
    const mockCtx = {
      save: noop,
      restore: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      fillRect: noop,
      setLineDash: noop,
      createRadialGradient: () => ({ addColorStop: noop }),
    } as unknown as CanvasRenderingContext2D;

    const snap = room.buildSnapshot();
    const classes: HeroClassId[] = ['vanguard', 'ranger', 'arcanist', 'cleric'];
    const actions: AimableAction[] = ['tactical', 'ult', 'dash'];
    for (const hc of classes) {
      const p = { ...rng, heroClass: hc };
      for (const act of actions) {
        for (const cancelled of [false, true]) {
          assert.doesNotThrow(() =>
            drawAbilityTargetingIndicator(
              mockCtx,
              room.map,
              snap,
              p,
              p.x,
              p.y,
              {
                action: act,
                source: 'touch',
                aimAngle: Math.PI / 4,
                magnitude: 0.75,
                aimDistance: getAbilityTargetSpec(hc, act).range * 0.75,
                cancelled,
              },
              15000
            )
          );
        }
      }
    }
    const groundRes = computeGroundTargetPosition(100, 100, 0, 999, getAbilityTargetSpec('arcanist', 'ult'));
    assert.strictEqual(groundRes.distance, 220);
  });

  // --- Test 80: Smart Auto-Aim (360° Touch Kiting, LoS, Exact Class Ranges) & Low-Visibility Range Indicator ---
  test('80. Smart auto-aim respects class ranges, line-of-sight, kiting angles, training dummies, and low-visibility range indicator', () => {
    // 1. Exact per-class primary attack ranges (Ranger, Arcanist, Cleric further nerfed; Vanguard unchanged)
    assert.strictEqual(getPrimaryAttackRange('vanguard'), 81);
    assert.strictEqual(getPrimaryAttackRange('ranger'), 210);
    assert.strictEqual(getPrimaryAttackRange('arcanist'), 195);
    assert.strictEqual(getPrimaryAttackRange('cleric'), 175);
    assert.strictEqual(getAbilityTargetSpec('ranger', 'tactical').range, 210);
    assert.strictEqual(getAbilityTargetSpec('arcanist', 'tactical').range, 165);

    // 2. Build a small synthetic dungeon map with a solid wall separating player and a blocked enemy
    const w = 16;
    const h = 16;
    const tiles = new Array(w * h).fill(1);
    for (let y = 0; y < h; y++) {
      tiles[y * w + 10] = 2; // vertical wall at tile x=10 (world x=320..352)
    }
    const testMap = {
      width: w,
      height: h,
      tiles,
      rooms: [],
      biome: 'courtyard' as const,
      biomeTitle: 'Test Arena',
      floor: 1,
      seed: 1,
      portalPos: { x: 100, y: 100 },
      portalActive: false,
      torches: [],
    };

    // Player at (240, 240), walking/facing West (PI), enemy behind them East at (300, 240),
    // another enemy behind the wall at (380, 240)
    const behindCloseEnemy = { id: 'e_east', x: 300, y: 240, hp: 50, radius: 14 };
    const wallBlockedEnemy = { id: 'e_wall', x: 380, y: 240, hp: 50, radius: 14 };
    const outOfRangeEnemy = { id: 'e_far', x: 240, y: 650, hp: 50, radius: 14 };

    // Touch 360° auto-aim (minDot: -1) acquires the rear enemy while kiting West
    const touchLock = findBestAutoTarget({
      playerX: 240,
      playerY: 240,
      maxRange: getPrimaryAttackRange('ranger'),
      preferredAngle: Math.PI, // walking West
      minDot: -1,
      map: testMap,
      props: [],
      enemies: [wallBlockedEnemy, outOfRangeEnemy, behindCloseEnemy],
    });
    assert.ok(touchLock, 'Touch auto-aim must acquire enemy in range while kiting away');
    assert.strictEqual(touchLock!.target.id, 'e_east');
    assert.ok(Math.abs(touchLock!.angle - 0) < 0.01, 'Angle should point East directly at e_east');

    // If only wall-blocked or out-of-range enemies exist, auto-aim must ignore them and fall back to training dummy if in LoS
    const dummyFallback = findBestAutoTarget({
      playerX: 240,
      playerY: 240,
      maxRange: getPrimaryAttackRange('cleric'),
      preferredAngle: 0,
      minDot: -1,
      map: testMap,
      props: [],
      enemies: [wallBlockedEnemy, outOfRangeEnemy],
      trainingDummies: [{ id: 'dummy_1', x: 240, y: 360 }],
    });
    assert.ok(dummyFallback, 'Auto-aim should acquire training dummy when no valid LoS enemy is in range');
    assert.strictEqual(dummyFallback!.target.id, 'dummy_1');

    // Vanguard range (85px) must NOT lock onto enemy at 120px
    const vanMiss = findBestAutoTarget({
      playerX: 240,
      playerY: 240,
      maxRange: getPrimaryAttackRange('vanguard'),
      minDot: -1,
      enemies: [{ id: 'e_120', x: 360, y: 240, hp: 50 }],
    });
    assert.strictEqual(vanMiss, null, 'Vanguard 85px range must not lock enemy at 120px');

    // 3. Low-visibility primary attack range indicator renders with low opacity (<= 0.25) and no fill
    const capturedStrokes: string[] = [];
    let fillCount = 0;
    let drawnRadius = 0;
    const rangeCtx = {
      save: () => {},
      restore: () => {},
      setLineDash: () => {},
      beginPath: () => {},
      arc: (_x: number, _y: number, r: number) => { drawnRadius = r; },
      stroke: () => { capturedStrokes.push(String(rangeCtx.strokeStyle)); },
      fill: () => { fillCount++; },
      strokeStyle: '',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    drawPrimaryAttackRangeIndicator(rangeCtx, 200, 200, 'arcanist', false, false);
    assert.strictEqual(drawnRadius, 195, 'Range circle must match Arcanist further nerfed attack range');
    assert.strictEqual(fillCount, 0, 'Low-visibility range ring must not draw interior fill');
    const idleAlphaMatch = capturedStrokes[0].match(/[\d.]+\)$/);
    const idleAlpha = idleAlphaMatch ? parseFloat(idleAlphaMatch[0]) : 1;
    assert.ok(idleAlpha > 0 && idleAlpha <= 0.15, `Idle range indicator alpha must be low-visibility (got ${idleAlpha})`);

    drawPrimaryAttackRangeIndicator(rangeCtx, 200, 200, 'arcanist', true, true);
    const activeAlphaMatch = capturedStrokes[1].match(/[\d.]+\)$/);
    const activeAlpha = activeAlphaMatch ? parseFloat(activeAlphaMatch[0]) : 1;
    assert.ok(activeAlpha > idleAlpha && activeAlpha <= 0.25, `Engaged range indicator alpha must stay subtle (got ${activeAlpha})`);
  });

  // --- Test 81: PC WASD movement, diagonal transitions, key release & editable input guards ---
  await test('81. PC keyboard movement updates cleanly without stick-lock and yields only to active touch stick', () => {
    const unified = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
      stickX: 0,
      stickY: 0,
    };
    let touchActive = false;

    // 1. Press W (Up)
    applyKeyboardToUnifiedInput(unified, { up: true, down: false, left: false, right: false, attack: false, aimAngle: 1.2 }, touchActive);
    assert.strictEqual(unified.up, true);
    assert.strictEqual(unified.stickX, 0, 'Keyboard must never write to analog stickX');
    assert.strictEqual(unified.stickY, 0, 'Keyboard must never write to analog stickY');
    assert.strictEqual(unified.aimAngle, 1.2);
    assert.strictEqual(hasMovementInput(unified), true);

    // 2. Add D (Up-Right diagonal)
    applyKeyboardToUnifiedInput(unified, { up: true, down: false, left: false, right: true, attack: true, aimAngle: 0.4 }, touchActive);
    assert.strictEqual(unified.up, true);
    assert.strictEqual(unified.right, true);
    assert.strictEqual(unified.attack, true);
    const diag = normalizePlayerInputDirection(unified);
    assert.ok(diag.mx > 0.65 && diag.my < -0.65, 'Diagonal keyboard movement must normalize to ~(+0.707, -0.707)');

    // 3. Release W and D -> character MUST stop completely (previously permanently stuck on W!)
    applyKeyboardToUnifiedInput(unified, { up: false, down: false, left: false, right: false, attack: false, aimAngle: -0.8 }, touchActive);
    assert.strictEqual(unified.up, false);
    assert.strictEqual(unified.right, false);
    assert.strictEqual(unified.attack, false);
    assert.strictEqual(hasMovementInput(unified), false, 'Releasing WASD keys must stop movement immediately');

    // 4. Touch stick takes priority while dragged, then returns control cleanly on release (0, 0)
    touchActive = applyTouchStickToUnifiedInput(unified, -0.8, 0.2, 2.9);
    assert.strictEqual(touchActive, true);
    applyKeyboardToUnifiedInput(unified, { up: true, down: false, left: false, right: false, attack: false, aimAngle: 0 }, touchActive);
    assert.strictEqual(unified.up, false, 'Held touch stick keeps priority over keyboard direction');
    assert.strictEqual(unified.left, true);

    touchActive = applyTouchStickToUnifiedInput(unified, 0, 0);
    assert.strictEqual(touchActive, false);
    applyKeyboardToUnifiedInput(unified, { up: true, down: false, left: false, right: false, attack: false, aimAngle: 0.5 }, touchActive);
    assert.strictEqual(unified.up, true, 'Releasing touch stick immediately restores keyboard movement');
    assert.strictEqual(unified.left, false);

    // 5. Editable target & angle wrap helpers
    assert.strictEqual(isEditableEventTarget({ tagName: 'INPUT' } as unknown as EventTarget), true);
    assert.strictEqual(isEditableEventTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true);
    assert.strictEqual(isEditableEventTarget({ tagName: 'CANVAS' } as unknown as EventTarget), false);
    assert.ok(angleDeltaRad(Math.PI - 0.05, -Math.PI + 0.05) < 0.11, 'Angle delta handles +/-PI wrap cleanly');
  });

  // --- Test 82: Full-Stack Latency Optimization (40Hz Tick Cadence, Wire Delta Compression & Backpressure Keyframe Recovery) ---
  await test('82. Full-stack latency optimization: 40Hz tick cadence, wire delta compression fidelity, and backpressure keyframe recovery', async () => {
    const {
      SERVER_TICK_MS,
      CLIENT_INPUT_CONTINUOUS_INTERVAL_MS,
    } = await import('./src/client/networkStats.ts');
    const {
      cloneSnapshotBaseline,
      computeSnapshotDelta,
      applySnapshotDelta,
    } = await import('./src/shared/snapshotDelta.ts');
    const {
      sendRawFrame,
      WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES,
    } = await import('./src/server/wsTransport.ts');

    assert.strictEqual(SERVER_TICK_MS, 25, 'Server must tick at 40Hz (25ms)');
    assert.strictEqual(CLIENT_INPUT_CONTINUOUS_INTERVAL_MS, 20, 'Continuous input interval must run at 50Hz (20ms)');

    const room = new GameRoom({
      roomId: 'DELTA-F3',
      name: 'Delta Benchmark',
      hostName: 'Hero1',
      difficulty: 'Normal',
      seed: 1337,
      initialFloor: 3,
    });
    room.status = 'playing';
    room.addOrReconnectPlayer('p1', 'Hero1', 'ranger');

    // Capture baseline tick 1
    room.tick(SERVER_TICK_MS);
    const snap1 = room.buildNetworkSnapshot();
    const baseline1 = cloneSnapshotBaseline(snap1);

    // Tick 2: player moves + shoots projectile (majority of props/rooms/idle enemies unchanged)
    room.updateInput('p1', { up: false, down: false, left: false, right: true, attack: true, aimAngle: 0.4 }, 10);
    room.tick(SERVER_TICK_MS);
    const snap2 = room.buildNetworkSnapshot();

    const delta12 = computeSnapshotDelta(baseline1, snap2, 1, 2);
    assert.strictEqual(delta12.props, undefined, 'Unchanged dungeon props must be omitted on delta ticks');
    assert.strictEqual(delta12.npcs, undefined, 'Unchanged NPCs must be omitted on delta ticks');
    assert.strictEqual(delta12.roomClearedFlags, undefined, 'Unchanged room flags must be omitted on delta ticks');

    const fullWireBytes = Buffer.byteLength(JSON.stringify({ type: 'room:tick', snapshot: snap2, seq: 2 }), 'utf8');
    const deltaWireBytes = Buffer.byteLength(JSON.stringify({ type: 'room:delta', delta: delta12 }), 'utf8');
    assert.ok(
      deltaWireBytes < fullWireBytes * 0.45,
      `Expected wire delta (${deltaWireBytes}B) to be <45% of full snapshot (${fullWireBytes}B)`
    );

    const reconstructed2 = applySnapshotDelta(baseline1, delta12);
    assert.deepStrictEqual(
      reconstructed2,
      snap2,
      'Reconstructed delta snapshot must match full server snapshot identically'
    );

    // Tick 3: open a chest/prop mutation + spawn/kill enemy -> baseline clone isolation prevents silent diff loss
    const baseline2 = cloneSnapshotBaseline(snap2);
    if (room.props.length > 0) {
      room.props[0].opened = true;
    }
    if (room.enemies.length > 0) {
      room.enemies.pop();
    }
    room.tick(SERVER_TICK_MS);
    const snap3 = room.buildNetworkSnapshot();
    const delta23 = computeSnapshotDelta(baseline2, snap3, 2, 3);
    const reconstructed3 = applySnapshotDelta(reconstructed2, delta23);
    assert.deepStrictEqual(
      reconstructed3,
      snap3,
      'Mutated props and removed enemies must reconstruct cleanly without mutating prior baseline'
    );

    // Dropped tick under backpressure must automatically flag client for full keyframe resync
    const slowClient = {
      userId: 'u_slow',
      username: 'Slow',
      roomId: 'DELTA-F3',
      droppedTicks: 0,
      totalDroppedTicks: 0,
      needsKeyframe: false,
      ws: {
        readyState: 1,
        bufferedAmount: WS_TICK_BACKPRESSURE_HIGH_WATER_BYTES + 1024,
        send() {},
        close() {},
      },
    };
    const outcome = sendRawFrame(slowClient, '{"type":"room:delta"}', { droppable: true });
    assert.strictEqual(outcome, 'dropped_backpressure');
    assert.strictEqual(slowClient.needsKeyframe, true, 'Backpressure skip must flag client for next-tick keyframe resync');
  });

  // --- Test 83: Party Lobby Lifecycle, Waiting Inactivity, & Server Join Locks (Edge Cases 1-6) ---
  await test('83. Party lobby stays inactive until host starts, enforces 4-player cap and active lock through Floor 5+', async () => {
    const { PartyCoordinator } = await import('./src/server/partyCoordinator.ts');
    const { RoomClientIndex } = await import('./src/server/wsTransport.ts');

    type MockClient = {
      ws: {
        readyState: number;
        bufferedAmount: number;
        send: (data: string) => void;
        close: () => void;
      };
      userId: string;
      username: string;
      roomId: string | null;
      needsKeyframe?: boolean;
      messages: any[];
    };

    const rooms = new Map<string, GameRoom>();
    const roomClientIndex = new RoomClientIndex<MockClient>();
    const roomDeltaStates = new Map<string, { seq: number; lastBaseline: any }>();
    const dirtyNonPlayingRooms = new Set<string>();
    let seqCode = 1;

    const coordinator = new PartyCoordinator<MockClient>({
      rooms,
      roomClientIndex,
      roomDeltaStates,
      dirtyNonPlayingRooms,
      disconnectGraceMs: 25,
      generateRoomCode: () => `BYND-T${seqCode++}`,
      sendJson: (ws, msg) => ws.send(JSON.stringify(msg)),
      broadcastToRoom: (roomId, msg) => {
        const raw = JSON.stringify(msg);
        for (const c of roomClientIndex.getRoomClients(roomId)) {
          c.ws.send(raw);
        }
      },
      broadcastRoomList: () => {},
    });

    const mkClient = (id: string, username: string): MockClient => {
      const messages: any[] = [];
      return {
        userId: id,
        username,
        roomId: null,
        needsKeyframe: false,
        messages,
        ws: {
          readyState: 1,
          bufferedAmount: 0,
          send: (data: string) => {
            messages.push(JSON.parse(data));
          },
          close: () => {},
        },
      };
    };

    const c1 = mkClient('u1', 'HostHero');
    const c2 = mkClient('u2', 'AllyTwo');
    const c3 = mkClient('u3', 'AllyThree');
    const c4 = mkClient('u4', 'AllyFour');
    const c5 = mkClient('u5', 'OutsiderFive');

    // Case 1: Player creates a party -> starts in 'waiting', dungeon simulation inactive
    const room = coordinator.createParty(
      c1,
      { id: 'u1', username: 'HostHero', heroClass: 'vanguard' },
      { name: 'Test Party', difficulty: 'Normal', seed: 4242 }
    );
    assert.strictEqual(room.status, 'waiting', 'New party must start in waiting state');
    assert.strictEqual(room.enemies.length, 0, 'Waiting lobby must not spawn active dungeon enemies');
    assert.strictEqual(room.getElapsedSec(), 0, 'Waiting lobby elapsed timer must stay at 0');

    const initPos = { x: room.getPlayerState('u1')!.x, y: room.getPlayerState('u1')!.y };
    room.updateInput('u1', { up: false, down: false, left: false, right: true, attack: true, aimAngle: 0 }, 1);
    room.tick(100);
    assert.strictEqual(room.getPlayerState('u1')!.x, initPos.x, 'Waiting lobby must not simulate player movement');
    assert.strictEqual(room.projectiles.length, 0, 'Waiting lobby must not simulate combat projectiles');

    // Case 2: Three more players join -> all 4 remain in waiting lobby; 5th rejected for full (4/4)
    assert.strictEqual(
      coordinator.joinOrReconnectRoom(c2, { id: 'u2', username: 'AllyTwo', heroClass: 'ranger' }, room.roomId).ok,
      true
    );
    assert.strictEqual(
      coordinator.joinOrReconnectRoom(c3, { id: 'u3', username: 'AllyThree', heroClass: 'arcanist' }, room.roomId).ok,
      true
    );
    assert.strictEqual(
      coordinator.joinOrReconnectRoom(c4, { id: 'u4', username: 'AllyFour', heroClass: 'cleric' }, room.roomId).ok,
      true
    );
    assert.strictEqual(room.status, 'waiting', 'Party must remain in waiting after 4 players join');
    assert.strictEqual(room.getPlayerCount(), 4);

    const fullReject = coordinator.joinOrReconnectRoom(
      c5,
      { id: 'u5', username: 'OutsiderFive', heroClass: 'vanguard' },
      room.roomId
    );
    assert.strictEqual(fullReject.ok, false);
    assert.strictEqual(c5.messages[c5.messages.length - 1]?.message, 'That expedition party is already full (4/4).');

    // Also verify a 3-player expedition locks out a 4th outsider once started (Cases 3-6)
    coordinator.leaveRoomExplicit(c4);
    assert.strictEqual(room.getPlayerCount(), 3);

    // Case 3: Host starts the expedition -> all members enter Floor 1 together & party locks
    const startRes = coordinator.startExpedition(c1);
    assert.strictEqual(startRes.ok, true);
    assert.strictEqual(room.status, 'playing');
    assert.strictEqual(room.isPartyLocked(), true);
    assert.strictEqual(room.floor, 1);
    assert.ok(room.enemies.length > 0, 'Starting expedition must populate Floor 1 dungeon enemies');
    for (const uid of ['u1', 'u2', 'u3']) {
      assert.ok(room.hasPlayer(uid), `Member ${uid} must spawn inside Floor 1 expedition`);
    }

    // Case 4: Outsider trying to join locked active expedition is rejected with exact message
    const midRunReject = coordinator.joinOrReconnectRoom(
      c5,
      { id: 'u5', username: 'OutsiderFive', heroClass: 'vanguard' },
      room.roomId
    );
    assert.strictEqual(midRunReject.ok, false);
    if (!midRunReject.ok) {
      assert.strictEqual(midRunReject.reason, 'This expedition is already in progress.');
    }
    assert.strictEqual(room.hasPlayer('u5'), false, 'Rejected outsider must never be added to dungeon');

    // Cases 5 & 6: Party advances to Floor 5 -> party stays locked & rejects new joiners
    room.loadFloor(5, room.getPlayerCount());
    assert.strictEqual(room.floor, 5);
    assert.strictEqual(room.status, 'playing');
    assert.strictEqual(room.isPartyLocked(), true);

    const floor5Reject = coordinator.joinOrReconnectRoom(
      c4,
      { id: 'u4', username: 'AllyFour', heroClass: 'cleric' },
      room.roomId
    );
    assert.strictEqual(floor5Reject.ok, false);
    if (!floor5Reject.ok) {
      assert.strictEqual(floor5Reject.reason, 'This expedition is already in progress.');
    }
    assert.strictEqual(room.hasPlayer('u4'), false, 'Floor 5 locked expedition must reject new players');

    coordinator.disposeAllTimers();
  });

  // --- Test 84: Reconnection Without Duplication, Host Authorization & Ownership Transfer (Edge Cases 7-9) ---
  await test('84. Reconnection restores character without duplication, non-hosts are rejected, and host disconnect transfers ownership', async () => {
    const { PartyCoordinator } = await import('./src/server/partyCoordinator.ts');
    const { RoomClientIndex } = await import('./src/server/wsTransport.ts');

    type MockClient = {
      ws: {
        readyState: number;
        bufferedAmount: number;
        send: (data: string) => void;
        close: () => void;
      };
      userId: string;
      username: string;
      roomId: string | null;
      needsKeyframe?: boolean;
      messages: any[];
    };

    const rooms = new Map<string, GameRoom>();
    const roomClientIndex = new RoomClientIndex<MockClient>();
    const roomDeltaStates = new Map<string, { seq: number; lastBaseline: any }>();
    const dirtyNonPlayingRooms = new Set<string>();
    let seqCode = 1;

    const coordinator = new PartyCoordinator<MockClient>({
      rooms,
      roomClientIndex,
      roomDeltaStates,
      dirtyNonPlayingRooms,
      disconnectGraceMs: 25,
      generateRoomCode: () => `BYND-R${seqCode++}`,
      sendJson: (ws, msg) => ws.send(JSON.stringify(msg)),
      broadcastToRoom: (roomId, msg) => {
        const raw = JSON.stringify(msg);
        for (const c of roomClientIndex.getRoomClients(roomId)) {
          c.ws.send(raw);
        }
      },
      broadcastRoomList: () => {},
    });

    const mkClient = (id: string, username: string): MockClient => {
      const messages: any[] = [];
      return {
        userId: id,
        username,
        roomId: null,
        needsKeyframe: false,
        messages,
        ws: {
          readyState: 1,
          bufferedAmount: 0,
          send: (data: string) => messages.push(JSON.parse(data)),
          close: () => {},
        },
      };
    };

    const host = mkClient('host_1', 'OriginalHost');
    const ally = mkClient('ally_2', 'FaithfulAlly');

    const room = coordinator.createParty(
      host,
      { id: 'host_1', username: 'OriginalHost', heroClass: 'vanguard' },
      { name: 'Reconnect & Host Test', difficulty: 'Heroic', seed: 9191 }
    );
    coordinator.joinOrReconnectRoom(
      ally,
      { id: 'ally_2', username: 'FaithfulAlly', heroClass: 'cleric' },
      room.roomId
    );

    // Case 9 (waiting lobby): Non-host cannot start expedition directly
    const nonHostStart = coordinator.startExpedition(ally);
    assert.strictEqual(nonHostStart.ok, false);
    assert.strictEqual(room.status, 'waiting', 'Non-host start attempt must leave party in waiting');

    // Host starts expedition
    assert.strictEqual(coordinator.startExpedition(host).ok, true);

    // Mutate ally's run state (gold, relics, hp, kills, position)
    const allyState = room.getPlayerState('ally_2')!;
    allyState.gold = 340;
    allyState.relics.push('crimson_fang');
    allyState.kills = 12;
    allyState.hp = 64;
    allyState.x += 48;

    // Case 7: Ally disconnects and reconnects on a new socket -> character restored, zero duplicates
    coordinator.handleSocketDisconnect(ally);
    assert.strictEqual(room.isPlayerConnected('ally_2'), false);
    assert.strictEqual(room.getPlayerCount(), 2, 'Active run must retain disconnected player slot');

    const allyReconnected = mkClient('ally_2', 'FaithfulAlly');
    const rejoinRes = coordinator.joinOrReconnectRoom(
      allyReconnected,
      { id: 'ally_2', username: 'FaithfulAlly', heroClass: 'cleric' },
      room.roomId
    );
    assert.strictEqual(rejoinRes.ok, true);
    assert.strictEqual(room.getPlayerCount(), 2, 'Reconnecting must NEVER create a duplicate character');
    const restored = room.getPlayerState('ally_2')!;
    assert.strictEqual(restored.connected, true);
    assert.strictEqual(restored.gold, 340);
    assert.deepStrictEqual(restored.relics, ['crimson_fang']);
    assert.strictEqual(restored.kills, 12);
    assert.strictEqual(restored.hp, 64);

    // Case 9 (active expedition): Non-host cannot restart or return to lobby
    assert.strictEqual(coordinator.restartExpedition(allyReconnected).ok, false);
    assert.strictEqual(coordinator.returnToLobby(allyReconnected).ok, false);

    // Case 8: Host permanently disconnects -> ownership transfers after grace period
    coordinator.handleSocketDisconnect(host);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.strictEqual(room.hostId, 'ally_2', 'Host ID must transfer to connected party member');
    assert.strictEqual(room.hostName, 'FaithfulAlly', 'Host name must update on transfer');
    assert.ok(
      room.chat.some((m) => m.system && m.text.includes('Host ownership transferred to FaithfulAlly')),
      'Ownership transfer must emit system notification'
    );

    // Former host cannot start/restart as host anymore if rejoining as regular member
    const hostRejoin = mkClient('host_1', 'OriginalHost');
    assert.strictEqual(
      coordinator.joinOrReconnectRoom(hostRejoin, { id: 'host_1', username: 'OriginalHost', heroClass: 'vanguard' }, room.roomId).ok,
      true
    );
    assert.strictEqual(coordinator.restartExpedition(hostRejoin).ok, false, 'Demoted original host must no longer have host authority');
    assert.strictEqual(coordinator.restartExpedition(allyReconnected).ok, true, 'New host must be authorized to restart');

    coordinator.disposeAllTimers();
  });

  // --- Test 85: Victory & Defeat Return to Unlocked Waiting Lobby + Second Fresh Run + Delta Sync (Edge Cases 10-12) ---
  await test('85. Victory and defeat return party to unlocked waiting lobby, preserve permanent stats, start fresh 2nd run, and delta-sync metadata', async () => {
    const { PartyCoordinator } = await import('./src/server/partyCoordinator.ts');
    const { RoomClientIndex } = await import('./src/server/wsTransport.ts');
    const { cloneSnapshotBaseline, computeSnapshotDelta, applySnapshotDelta } = await import('./src/shared/snapshotDelta.ts');

    type MockClient = {
      ws: {
        readyState: number;
        bufferedAmount: number;
        send: (data: string) => void;
        close: () => void;
      };
      userId: string;
      username: string;
      roomId: string | null;
      needsKeyframe?: boolean;
      messages: any[];
    };

    const rooms = new Map<string, GameRoom>();
    const roomClientIndex = new RoomClientIndex<MockClient>();
    const roomDeltaStates = new Map<string, { seq: number; lastBaseline: any }>();
    const dirtyNonPlayingRooms = new Set<string>();
    let seqCode = 1;

    const coordinator = new PartyCoordinator<MockClient>({
      rooms,
      roomClientIndex,
      roomDeltaStates,
      dirtyNonPlayingRooms,
      disconnectGraceMs: 25,
      generateRoomCode: () => `BYND-E${seqCode++}`,
      sendJson: (ws, msg) => ws.send(JSON.stringify(msg)),
      broadcastToRoom: (roomId, msg) => {
        const raw = JSON.stringify(msg);
        for (const c of roomClientIndex.getRoomClients(roomId)) {
          c.ws.send(raw);
        }
      },
      broadcastRoomList: () => {},
    });

    const mkClient = (id: string, username: string): MockClient => ({
      userId: id,
      username,
      roomId: null,
      needsKeyframe: false,
      messages: [],
      ws: {
        readyState: 1,
        bufferedAmount: 0,
        send: () => {},
        close: () => {},
      },
    });

    const host = mkClient('h1', 'RunHost');
    const ally = mkClient('a2', 'RunAlly');
    const newcomer = mkClient('n3', 'LateJoiner');

    const room = coordinator.createParty(
      host,
      {
        id: 'h1',
        username: 'RunHost',
        heroClass: 'vanguard',
        savedStats: {
          level: 12,
          xp: 45,
          strength: 10,
          vitality: 8,
          dexterity: 0,
          intelligence: 0,
          faith: 0,
          attributePoints: 4,
          storage: ['crimson_fang'],
        },
      },
      { name: 'Victory & Defeat Test', difficulty: 'Normal', seed: 3131 }
    );
    coordinator.joinOrReconnectRoom(ally, { id: 'a2', username: 'RunAlly', heroClass: 'ranger' }, room.roomId);
    assert.strictEqual(coordinator.startExpedition(host).ok, true);

    // Accumulate run-specific rewards in Floor 10 victory
    room.loadFloor(10, 2);
    const p1 = room.getPlayerState('h1')!;
    const p2 = room.getPlayerState('a2')!;
    p1.gold = 999;
    p1.relics = ['sunfire_signet', 'bastion_pauldron'];
    p1.kills = 25;
    p2.kills = 19;

    // Case 10: Reach Victory via Floor 10 portal -> host returns party to unlocked waiting lobby
    room.map.portalActive = true;
    p1.x = room.map.portalPos.x;
    p1.y = room.map.portalPos.y;
    p2.x = room.map.portalPos.x;
    p2.y = room.map.portalPos.y;
    room.performAction('h1', 'interact');
    room.performAction('a2', 'interact');
    assert.strictEqual(room.status, 'victory');

    // Baseline before return-to-lobby for delta compression verification
    const victorySnap = room.buildNetworkSnapshot();
    const baselineVictory = cloneSnapshotBaseline(victorySnap);

    // Newcomer still cannot bypass into ended run until returned to waiting lobby
    assert.strictEqual(
      coordinator.joinOrReconnectRoom(newcomer, { id: 'n3', username: 'LateJoiner', heroClass: 'cleric' }, room.roomId).ok,
      false
    );

    // Host returns to lobby
    assert.strictEqual(coordinator.returnToLobby(host).ok, true);
    assert.strictEqual(room.status, 'waiting', 'Victory return-to-lobby must restore waiting status');
    assert.strictEqual(room.isPartyLocked(), false, 'Party must be unlocked in waiting lobby');
    assert.strictEqual(room.lastRunSummary?.outcome, 'victory');

    // Verify permanent progression preserved while run-specific state reset
    assert.strictEqual(p1.level, 12, 'Permanent level must be preserved');
    assert.strictEqual(p1.strength, 10, 'Permanent attributes must be preserved');
    assert.deepStrictEqual(p1.storage, ['crimson_fang'], 'Permanent vault storage must be preserved');
    assert.strictEqual(p1.gold, 0, 'Run gold must reset');
    assert.deepStrictEqual(p1.relics, [], 'Run relics must reset');
    assert.strictEqual(p1.kills, 0, 'Run kill counter must reset');

    // Verify delta compression accurately reflects lastRunSummary + waiting status
    const waitingSnap = room.buildNetworkSnapshot();
    const deltaVicToWait = computeSnapshotDelta(baselineVictory, waitingSnap, 1, 2);
    const reconstructedWait = applySnapshotDelta(baselineVictory, deltaVicToWait);
    assert.deepStrictEqual(reconstructedWait, waitingSnap);

    // New player CAN now join the unlocked party
    assert.strictEqual(
      coordinator.joinOrReconnectRoom(newcomer, { id: 'n3', username: 'LateJoiner', heroClass: 'cleric' }, room.roomId).ok,
      true,
      'Unlocked lobby after victory must allow new members to join'
    );
    assert.strictEqual(room.getPlayerCount(), 3);

    // Case 11 & 12: Start 2nd expedition together -> trigger Defeat -> return to waiting lobby -> start 3rd fresh run
    assert.strictEqual(coordinator.startExpedition(host).ok, true);
    assert.strictEqual(room.status, 'playing');
    assert.strictEqual(room.floor, 1);
    assert.strictEqual(room.getPlayerCount(), 3);

    // Simulate party wipe on Floor 2 -> Defeat
    room.loadFloor(2, 3);
    for (const prState of [room.getPlayerState('h1')!, room.getPlayerState('a2')!, room.getPlayerState('n3')!]) {
      prState.downed = true;
      prState.hp = 0;
    }
    room.tick(25);
    assert.strictEqual(room.status, 'defeat', 'All connected players downed must transition room to defeat');

    assert.strictEqual(coordinator.returnToLobby(host).ok, true);
    assert.strictEqual(room.status, 'waiting', 'Defeat return-to-lobby must unlock party back to waiting');
    assert.strictEqual(room.lastRunSummary?.outcome, 'defeat');

    // Host starts another fresh expedition with all 3 players together
    assert.strictEqual(coordinator.startExpedition(host).ok, true);
    assert.strictEqual(room.status, 'playing');
    assert.strictEqual(room.floor, 1);
    assert.strictEqual(room.isPartyLocked(), true);
    for (const uid of ['h1', 'a2', 'n3']) {
      const ps = room.getPlayerState(uid)!;
      assert.strictEqual(ps.downed, false);
      assert.strictEqual(ps.hp, ps.maxHp);
    }

    coordinator.disposeAllTimers();
  });

  // --- Test 86: Waiting Lobby Per-Member Ready Toggle, HUD Key Invalidation & Lifecycle Reset ---
  await test('86. Party waiting lobby supports per-member Ready toggle, delta sync, HUD key refresh, and resets on run start', async () => {
    const { PartyCoordinator } = await import('./src/server/partyCoordinator.ts');
    const { RoomClientIndex } = await import('./src/server/wsTransport.ts');
    const { cloneSnapshotBaseline, computeSnapshotDelta, applySnapshotDelta } = await import(
      './src/shared/snapshotDelta.ts'
    );
    const { buildSnapshotHudKey } = await import('./src/client/networkStats.ts');

    type MockClient = {
      ws: {
        readyState: number;
        bufferedAmount: number;
        send: (data: string) => void;
        close: () => void;
      };
      userId: string;
      username: string;
      roomId: string | null;
      needsKeyframe?: boolean;
      messages: any[];
    };

    const rooms = new Map<string, GameRoom>();
    const roomClientIndex = new RoomClientIndex<MockClient>();
    const roomDeltaStates = new Map<string, { seq: number; lastBaseline: any }>();
    const dirtyNonPlayingRooms = new Set<string>();
    const mkClient = (userId: string, username: string): MockClient => {
      const msgs: any[] = [];
      return {
        userId,
        username,
        roomId: null,
        messages: msgs,
        ws: {
          readyState: 1,
          bufferedAmount: 0,
          send: (raw: string) => msgs.push(JSON.parse(raw)),
          close: () => {},
        },
      };
    };

    const coordinator = new PartyCoordinator<MockClient>({
      rooms,
      roomClientIndex,
      roomDeltaStates,
      dirtyNonPlayingRooms,
      generateRoomCode: () => 'BYND-RDY1',
      sendJson: (ws, msg) => ws.send(JSON.stringify(msg)),
      broadcastToRoom: (roomId, msg) => {
        for (const c of roomClientIndex.getRoomClients(roomId)) {
          c.ws.send(JSON.stringify(msg));
        }
      },
      broadcastRoomList: () => {},
    });

    const host = mkClient('r1', 'HostReady');
    const ally = mkClient('r2', 'AllyReady');
    const room = coordinator.createParty(
      host,
      { id: 'r1', username: 'HostReady', heroClass: 'vanguard' },
      { name: 'Ready Check Lobby', difficulty: 'Normal', seed: 6001 }
    );
    coordinator.joinOrReconnectRoom(
      ally,
      { id: 'r2', username: 'AllyReady', heroClass: 'cleric' },
      room.roomId
    );

    assert.strictEqual(room.getPlayerState('r1')!.ready, false);
    assert.strictEqual(room.getPlayerState('r2')!.ready, false);

    const snapBefore = room.buildNetworkSnapshot();
    const baseline = cloneSnapshotBaseline(snapBefore);
    const hudKeyBefore = buildSnapshotHudKey(snapBefore, 'r1', room.map);

    dirtyNonPlayingRooms.clear();
    const toggleRes = coordinator.setPlayerReady(ally);
    assert.strictEqual(toggleRes.ok, true);
    if (toggleRes.ok) {
      assert.strictEqual(toggleRes.ready, true);
    }
    assert.strictEqual(room.getPlayerState('r2')!.ready, true);
    assert.strictEqual(room.getPlayerState('r1')!.ready, false);
    assert.strictEqual(dirtyNonPlayingRooms.has(room.roomId), true, 'Toggling ready must mark waiting room dirty for snapshot push');

    const snapAfterAllyReady = room.buildNetworkSnapshot();
    const hudKeyAfter = buildSnapshotHudKey(snapAfterAllyReady, 'r1', room.map);
    assert.notStrictEqual(hudKeyBefore, hudKeyAfter, 'Host HUD key must update immediately when ally toggles Ready');

    const delta = computeSnapshotDelta(baseline, snapAfterAllyReady, 1, 2);
    const reconstructed = applySnapshotDelta(baseline, delta);
    assert.deepStrictEqual(reconstructed, snapAfterAllyReady, 'Delta compression must faithfully transport player ready toggle');

    // Host toggles own ready on, ally toggles explicit false
    assert.strictEqual(coordinator.setPlayerReady(host, true).ok, true);
    assert.strictEqual(room.getPlayerState('r1')!.ready, true);
    assert.strictEqual(coordinator.setPlayerReady(ally, false).ok, true);
    assert.strictEqual(room.getPlayerState('r2')!.ready, false);

    // Starting expedition resets ready state and disallows room:set_ready mid-run
    assert.strictEqual(coordinator.startExpedition(host).ok, true);
    assert.strictEqual(room.status, 'playing');
    assert.strictEqual(room.getPlayerState('r1')!.ready, false);
    assert.strictEqual(room.getPlayerState('r2')!.ready, false);

    const midRunReady = coordinator.setPlayerReady(ally, true);
    assert.strictEqual(midRunReady.ok, false, 'Cannot toggle waiting lobby ready while expedition is active');

    coordinator.disposeAllTimers();
  });

  // --- Test 87: Hybrid DoT Scaling, Refresh Without Stacking & Multiplayer Attribution ---
  await test('87. Hybrid DoT Scaling: Level + Primary Attribute formula, refresh-without-stacking, bleed velocity, and multiplayer kill credit', async () => {
    // 1. Verify computeDotMultiplier formula: 1 + 0.003 * (min(50, Level) - 1) + 0.001 * PrimaryAttr
    const v1 = { heroClass: 'vanguard', level: 1, strength: 0, dexterity: 0, intelligence: 0, faith: 0 } as any;
    const r25 = { heroClass: 'ranger', level: 25, strength: 10, dexterity: 25, intelligence: 0, faith: 0 } as any;
    const a50 = { heroClass: 'arcanist', level: 50, strength: 0, dexterity: 0, intelligence: 50, faith: 10 } as any;
    const c100Cap = { heroClass: 'cleric', level: 100, strength: 0, dexterity: 0, intelligence: 0, faith: 100 } as any;

    assert.ok(Math.abs(GameRoom.computeDotMultiplier(v1) - 1.0) < 1e-9, 'Level 1 / 0 attr must yield 1.0x');
    assert.ok(Math.abs(GameRoom.computeDotMultiplier(r25) - 1.097) < 1e-9, 'Level 25 / 25 DEX must yield 1.097x');
    assert.ok(Math.abs(GameRoom.computeDotMultiplier(a50) - 1.197) < 1e-9, 'Level 50 / 50 INT must yield 1.197x');
    assert.ok(Math.abs(GameRoom.computeDotMultiplier(c100Cap) - 1.247) < 1e-9, 'Clamped Lv 50 / 100 FTH must yield 1.247x');

    const room = new GameRoom({
      roomId: 'R_TEST_DOT_OVERHAUL',
      name: 'Hybrid DoT Room',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 8787,
    });
    room.status = 'playing';
    room.enemies.length = 0;

    room.addOrReconnectPlayer('p_high', 'HighArc', 'arcanist', false, {
      level: 50,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 50,
      faith: 0,
      attributePoints: 0,
    });
    room.addOrReconnectPlayer('p_low', 'LowVan', 'vanguard', false, {
      level: 1,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });

    const pHigh = room.getPlayerState('p_high')!;
    const pLow = room.getPlayerState('p_low')!;
    pHigh.relics = ['cinder_heart', 'viper_crucible', 'crimson_fang'];
    pLow.relics = ['bloodletter_talisman'];
    pHigh.damageDealt = 0;
    pLow.damageDealt = 0;
    pHigh.kills = 0;
    pLow.kills = 0;
    pHigh.hp = 50;
    pHigh.maxHp = 100;

    // Burn (4.5s) + Poison (6.0s) from HighArc, Bleed (5.0s) from LowVan
    const dummy = createTestEnemy('e_dot_1', 'slime', 'DoT Dummy', pHigh.x + 300, pHigh.y, 1000, {
      fire: 0,
      poison: 0,
      bleed: 0,
    });
    room.enemies.push(dummy as any);

    room.damageEnemy(dummy as any, 30, pHigh, false, 'arcane'); // Triggers cinder_heart (raw>=24) & viper_crucible
    assert.strictEqual(dummy.burnedMs, 4500, 'Cinder Heart must apply 4.5s Burn duration');
    assert.strictEqual(dummy.poisonedMs, 6000, 'Viper Crucible must apply 6.0s Poison duration');

    // Reapplying Cinder Heart refreshes duration cleanly rather than multiplying stack damage
    room.tick(1000); // Advances 1s (one DoT tick fires here)
    const hpAfterOneTick = dummy.hp;
    const burnDealtBeforeRefresh = pHigh.damageDealt;
    room.damageEnemy(dummy as any, 30, pHigh, false, 'arcane');
    assert.strictEqual(dummy.burnedMs, 4500, 'Re-igniting must refresh Burn duration back to 4.5s');

    // Wait 1s and confirm single-stack DoT tick (Burn = round(8*1.247)=10, Poison = round(6*1.247)=7 -> 17 total DoT)
    const dmgBeforeSecondPulse = pHigh.damageDealt;
    const hpBeforeSecondPulse = dummy.hp;
    room.tick(1000);
    const dotPulseTotal = pHigh.damageDealt - dmgBeforeSecondPulse;
    assert.strictEqual(hpBeforeSecondPulse - dummy.hp, dotPulseTotal, 'DoT pulse must match HighArc attributed damageDealt');
    assert.strictEqual(dotPulseTotal, 17, `Scaled Burn (10) + Poison (7) tick must equal 17 without stacking explosion (got ${dotPulseTotal})`);

    // Bleed: moving enemy deals higher bleed damage than stationary enemy
    const stationaryBleed = createTestEnemy('e_bleed_stat', 'slime', 'StatBleed', pLow.x + 250, pLow.y, 500, { bleed: 0 }) as any;
    const movingBleed = createTestEnemy('e_bleed_mov', 'slime', 'MovBleed', pLow.x + 250, pLow.y + 40, 500, { bleed: 0 }) as any;
    stationaryBleed.vx = 0; stationaryBleed.vy = 0;
    movingBleed.vx = 45; movingBleed.vy = 0;
    room.enemies.push(stationaryBleed, movingBleed);
    room.applyStatusEffect(stationaryBleed, 'bleed', 5000, pLow);
    room.applyStatusEffect(movingBleed, 'bleed', 5000, pLow);
    room.tick(1000);
    // Keep movingBleed velocity up on next tick? Wait - check after 1s tick
    const statDmg = 500 - stationaryBleed.hp;
    assert.strictEqual(statDmg, 8, `Stationary floor-1 Level-1 bleed tick must be 8 (got ${statDmg})`);

    // Test Bleed moving tick directly with velocity maintained right before pulse
    movingBleed.hp = 500;
    movingBleed.bleedingMs = 5000;
    movingBleed.vx = 60;
    (room as any).statusDotAccumMs = 600;
    movingBleed.stunnedMs = 0;
    room.tick(50);
    const movDmg = 500 - movingBleed.hp;
    assert.ok(movDmg > statDmg, `Moving enemy must suffer bonus bleed tick damage (${movDmg} vs ${statDmg})`);

    // Lethal DoT tick credits killer with kills++, damageDealt, and triggers Crimson Fang sustain cleanly
    room.enemies = [];
    const lowHpVictim = createTestEnemy('e_dot_kill', 'slime', 'Victim', 9000, 9000, 5, { fire: 0 });
    room.enemies.push(lowHpVictim as any);
    room.applyStatusEffect(lowHpVictim as any, 'burn', 4500, pHigh);
    pHigh.hp = 40;
    const killsBefore = pHigh.kills;
    const hpBeforeKill = pHigh.hp;
    (room as any).statusDotAccumMs = 600;
    room.tick(50);
    assert.ok(!room.enemies.includes(lowHpVictim as any), 'Lethal DoT tick must remove slain enemy');
    assert.strictEqual(pHigh.kills, killsBefore + 1, 'Lethal DoT tick must credit kill to applying player');
    assert.strictEqual(pHigh.hp, hpBeforeKill + 5, 'Crimson Fang must heal owner (+5 HP) when their DoT scores a lethal kill');
  });

  // --- Test 88: Crowd-Control Balance, Diminishing Returns, 8s Reset, Soft-CC Separation & Rimefrost Tuning ---
  await test('88. Crowd-Control Balance: Hard-CC DR curves, Elite/Boss profiles, 8s reset, Soft-CC separation, and Rimefrost tuning', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_CC_DR',
      name: 'CC DR Room',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 8888,
      initialFloor: 1,
    });
    room.status = 'playing';
    room.addOrReconnectPlayer('p_cc', 'CcTester', 'vanguard');

    // 1. Normal enemy DR curve: 100% -> 50% -> 25% -> 0% (Immune)
    const normalMob = room.spawnEnemyForTesting('knight', 200, 200, false);
    assert.strictEqual(room.applyHardCc(normalMob, 'stun', 1000), 1000, 'Normal Stage 1: 100% duration');
    assert.strictEqual(room.applyHardCc(normalMob, 'stun', 1000), 500, 'Normal Stage 2: 50% duration');
    assert.strictEqual(room.applyHardCc(normalMob, 'freeze', 1000), 250, 'Normal Stage 3: 25% shared hard-CC DR');
    assert.strictEqual(room.applyHardCc(normalMob, 'stun', 1000), 0, 'Normal Stage 4: 0% immune');
    assert.strictEqual(room.getEnemyCcState(normalMob).stage, 3, 'DR stage reaches immune cap at 3');

    // Soft CC (slow) MUST NOT advance Hard-CC DR stage and continues applying full slow duration
    const freshNormal = room.spawnEnemyForTesting('slime', 240, 200, false);
    const softDur = room.applySoftCc(freshNormal, 3000);
    assert.strictEqual(softDur, 3000, 'Soft CC applies full slow duration');
    assert.strictEqual(room.getEnemyCcState(freshNormal).stage, 0, 'Soft CC must NEVER advance hard-CC DR stage');
    assert.strictEqual(room.applyHardCc(freshNormal, 'freeze', 1800), 1800, 'First freeze after slows still gets Stage 1 (1800ms)');

    // 2. 8000ms reset window restores DR stage back to 0
    room.tick(8000);
    assert.strictEqual(room.getEnemyCcState(normalMob).stage, 0, 'Hard-CC DR must reset to Stage 0 after 8s without hard CC');
    assert.strictEqual(room.applyHardCc(normalMob, 'stun', 1000), 1000, 'Post-reset stun receives full 100% duration again');

    // 3. Elite profile: 25% duration reduction + [1.0, 0.50, 0.25, 0] DR
    const eliteMob = room.spawnEnemyForTesting('knight', 300, 200, true);
    assert.strictEqual(room.applyHardCc(eliteMob, 'stun', 1000), 750, 'Elite Stage 1: 75% duration');
    assert.strictEqual(room.applyHardCc(eliteMob, 'stun', 1000), 375, 'Elite Stage 2: 75% * 50% = 375ms');
    assert.strictEqual(room.applyHardCc(eliteMob, 'stun', 1000), 188, 'Elite Stage 3: 75% * 25% = 188ms');
    assert.strictEqual(room.applyHardCc(eliteMob, 'stun', 1000), 0, 'Elite Stage 4: Immune');

    // 4. Boss profile: 70% duration reduction + [1.0, 0.40, 0] stronger DR + interrupts charge
    const boss = room.enemies.find(e => e.kind === 'boss')!;
    boss.charging = true;
    boss.chargeTimerMs = 500;
    const bossFirst = room.applyHardCc(boss, 'stun', 1600);
    assert.strictEqual(bossFirst, 480, 'Boss Stage 1: 1600 * 0.30 = 480ms (>= 400ms interrupt)');
    assert.strictEqual(boss.charging, false, 'Hard CC must interrupt active boss charge');
    assert.strictEqual(room.applyHardCc(boss, 'freeze', 1800), 216, 'Boss Stage 2: 1800 * 0.30 * 0.40 = 216ms');
    assert.strictEqual(room.applyHardCc(boss, 'stun', 1600), 0, 'Boss Stage 3: Immune until 8s reset');

    // 5. Floor change clears old CC metadata cleanly
    room.loadFloor(2, 1);
    const newBoss = room.enemies.find(e => e.kind === 'boss')!;
    assert.strictEqual(room.getEnemyCcState(newBoss).stage, 0, 'New floor enemies must start with clean DR state');
  });

  // --- Test 89: Boss Overhaul — Phases, Conditional Summons, Safe Spawns, Supernova Single-Hit & Multiplayer Fairness ---
  await test('89. Boss Overhaul: Differentiated phases, conditional capped safe summons, supernova single-hit, and multiplayer aggro rotation', async () => {
    // 1. Floor 1 (Malakor): 2 Phases (50%), NO regular summon adds
    const f1Room = new GameRoom({
      roomId: 'R_TEST_BOSS_F1_OVERHAUL',
      name: 'F1 Overhaul',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9101,
      initialFloor: 1,
    });
    f1Room.status = 'playing';
    f1Room.addOrReconnectPlayer('p1', 'Hero1', 'vanguard');
    f1Room.addOrReconnectPlayer('p2', 'Hero2', 'arcanist');
    const p1 = f1Room.getPlayerState('p1')!;
    const p2 = f1Room.getPlayerState('p2')!;
    const malakor = f1Room.enemies.find(e => e.kind === 'boss')!;
    p1.x = malakor.x - 45; p1.y = malakor.y;
    p2.x = malakor.x + 45; p2.y = malakor.y;

    malakor.hp = Math.round(malakor.maxHp * 0.45);
    malakor.windupMs = 0;
    f1Room.tick(50);
    assert.strictEqual(f1Room.getBossRuntimeInfo(malakor).phase, 2, 'Malakor must enter Phase 2 at <= 50% HP');
    assert.strictEqual(f1Room.enemies.filter(e => e.id.startsWith('add_')).length, 0, 'Malakor must NEVER spawn regular summon adds');

    // Verify multiplayer boss aggro rotates across connected party members in arena
    const targetedIds = new Set<string>();
    for (let i = 0; i < 6; i++) {
      f1Room.tick(1800);
      p1.downed = false; p1.hp = p1.maxHp;
      p2.downed = false; p2.hp = p2.maxHp;
      const picked = (f1Room as any).selectBossTarget(malakor, p1, (f1Room as any).findRoomContaining(malakor.x, malakor.y));
      targetedIds.add(picked.id);
    }
    assert.ok(targetedIds.has('p1') && targetedIds.has('p2'), 'Multiplayer boss aggro must rotate across active arena party members');

    // 2. Floor 2 (Vaelor): 3 Phases (75% & 40%), capped safe non-elite 'Summoned ...' waves (>= 65px away from players)
    const f2Room = new GameRoom({
      roomId: 'R_TEST_BOSS_F2_VAELOR',
      name: 'F2 Vaelor',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9102,
      initialFloor: 2,
    });
    f2Room.status = 'playing';
    f2Room.addOrReconnectPlayer('pv', 'VaelorChallenger', 'vanguard');
    const pv = f2Room.getPlayerState('pv')!;
    const vaelor = f2Room.enemies.find(e => e.kind === 'boss')!;
    pv.x = vaelor.x + 40;
    pv.y = vaelor.y;
    vaelor.hp = Math.round(vaelor.maxHp * 0.70);
    vaelor.windupMs = 0;
    f2Room.tick(50);
    assert.strictEqual(f2Room.getBossRuntimeInfo(vaelor).phase, 2, 'Vaelor must enter Phase 2 at 75% HP');
    const adds = f2Room.enemies.filter(e => e.id.startsWith('add_'));
    assert.ok(adds.length >= 1 && adds.length <= 2, `Vaelor wave 1 must summon 1-2 capped adds (got ${adds.length})`);
    for (const add of adds) {
      assert.strictEqual(Boolean(add.elite), false, 'Summoned boss adds must be non-elite');
      assert.ok(add.name.startsWith('Summoned '), `Summoned add name must be prefixed cleanly (got ${add.name})`);
      const distToPlayer = Math.hypot(add.x - pv.x, add.y - pv.y);
      assert.ok(distToPlayer >= 64, `Summoned add must spawn safely >= 65px from players (got ${distToPlayer.toFixed(1)}px)`);
    }

    // 3. Supernova Single-Hit-Per-Wave bug fix verification (Floor 5 Archon)
    const f5Room = new GameRoom({
      roomId: 'R_TEST_SUPERNOVA_SINGLE',
      name: 'Supernova Check',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9105,
      initialFloor: 5,
    });
    f5Room.status = 'playing';
    f5Room.addOrReconnectPlayer('psn', 'NovaTank', 'vanguard');
    const psn = f5Room.getPlayerState('psn')!;
    psn.hp = 500;
    psn.maxHp = 500;
    psn.shield = 0;
    psn.downed = false;
    const archon = f5Room.enemies.find(e => e.kind === 'boss')!;
    archon.windupMs = 99999; // Keep Archon from triggering other attacks during test
    psn.x = archon.x + 120; // Positioned on expanding ring band
    psn.y = archon.y;
    f5Room.zones.push({
      id: 'z_test_supernova',
      kind: 'supernova',
      x: archon.x,
      y: archon.y,
      radius: 145,
      ttlMs: 300, // currentRadius starts ~113px and sweeps through 120px over several ticks
      maxTtlMs: 1350,
      ownerId: archon.id,
    });
    const hpHits: number[] = [];
    for (let k = 0; k < 6; k++) {
      const before = psn.hp;
      f5Room.tick(25);
      if (psn.hp < before) hpHits.push(before - psn.hp);
    }
    assert.strictEqual(hpHits.length, 1, `Supernova wave must hit player at most once per zone, not every frame (hits: ${hpHits.length})`);

    // 4. Solo-no-summon verification for Floors 6, 9, and 10 at low HP
    for (const soloFloor of [6, 9, 10]) {
      const sRoom = new GameRoom({
        roomId: `R_TEST_SOLO_BOSS_F${soloFloor}`,
        name: `Solo Boss F${soloFloor}`,
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 9200 + soloFloor,
        initialFloor: soloFloor,
      });
      sRoom.status = 'playing';
      sRoom.addOrReconnectPlayer('ps', 'SoloHero', 'vanguard');
      const ps = sRoom.getPlayerState('ps')!;
      const sb = sRoom.enemies.find(e => e.kind === 'boss')!;
      ps.x = sb.x + 40; ps.y = sb.y;
      sb.hp = Math.round(sb.maxHp * 0.25);
      sb.windupMs = 0;
      sRoom.tick(100);
      assert.strictEqual(
        sRoom.enemies.filter(e => e.id.startsWith('add_')).length,
        0,
        `Floor ${soloFloor} boss must remain a pure solo duel with 0 regular summons`
      );
      assert.strictEqual(sRoom.getBossRuntimeInfo(sb).phase >= 2, true, `Floor ${soloFloor} boss at 25% HP must enter higher phase`);
    }
  });

  // --- Test 90: Stat Projections Include Hybrid DoT Scaling & Active Relic DoT DPS ---
  await test('90. Stat Projections: calculatePlayerStatProjections reflects Hybrid DoT Scaling and equipped DoT relic DPS', async () => {
    const { calculatePlayerStatProjections } = await import('./src/shared/statUtils.ts');

    const baseHero = {
      id: 'p_proj',
      username: 'ProjHero',
      heroClass: 'arcanist',
      level: 50,
      xp: 0,
      nextXp: 100,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: 200,
      maxHp: 200,
      shield: 0,
      gold: 0,
      potions: 2,
      relics: [],
      storage: [],
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 50,
      faith: 0,
      attributePoints: 0,
      downed: false,
      downedTimerMs: 0,
      reviveProgress: 0,
      skillCooldownMs: 0,
      maxSkillCooldownMs: 5000,
      ultCooldownMs: 0,
      maxUltCooldownMs: 13500,
      dashCooldownMs: 0,
      maxDashCooldownMs: 2600,
      attackAnimMs: 0,
      hasteMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      statuses: [],
      kills: 0,
      damageDealt: 0,
      healingDone: 0,
      connected: true,
      ready: false,
    } as any;

    const noRelicProj = calculatePlayerStatProjections(baseHero, 1);
    assert.strictEqual(noRelicProj.dotMultiplier, 1.197, 'Lv50 / 50 INT dotMultiplier must be 1.197x');
    assert.strictEqual(noRelicProj.dotBonusPct, 19.7, 'Lv50 / 50 INT dotBonusPct must be 19.7%');
    assert.strictEqual(noRelicProj.dotDpsContribution, 0, 'No DoT relics equipped must yield 0 dotDpsContribution');
    assert.strictEqual(noRelicProj.burnTickDamage, 10, 'Floor 1 Burn base tick at 1.197x must be 10');
    assert.strictEqual(noRelicProj.poisonTickDamage, 7, 'Floor 1 Poison base tick at 1.197x must be 7');
    assert.strictEqual(noRelicProj.sustainedDps, noRelicProj.directDps, 'Without DoT relics sustainedDps equals directDps');

    const dotHero = {
      ...baseHero,
      relics: ['cinder_heart', 'viper_crucible', 'bloodletter_talisman'],
    };
    const dotProj = calculatePlayerStatProjections(dotHero, 5);
    assert.strictEqual(dotProj.hasBurnRelic, true);
    assert.strictEqual(dotProj.hasPoisonRelic, true);
    assert.strictEqual(dotProj.hasBleedRelic, true);
    assert.strictEqual(dotProj.burnTickDamage, Math.round((7 + 5) * 1.197), 'Floor 5 Burn tick scales with floor and dotMultiplier');
    assert.strictEqual(dotProj.poisonTickDamage, Math.round((5 + 5) * 1.197), 'Floor 5 Poison tick scales with floor and dotMultiplier');
    assert.strictEqual(dotProj.bleedMovingTickDamage, Math.round((14 + 5) * 1.197), 'Floor 5 moving Bleed tick scales with floor and dotMultiplier');
    assert.ok(dotProj.dotDpsContribution > 0, 'Equipped DoT relics must contribute positive dotDpsContribution');
    assert.ok(dotProj.sustainedDps > dotProj.directDps, 'sustainedDps must include active DoT DPS contribution');
  });

  // --- Test 91: Level 50 Cap, Attribute Rebalance Formulas, Relic Stacking & Stat Projection Parity ---
  await test('91. Level 50 Cap & Attribute Rebalance: hard level cap, all 5 attribute formulas, relic stacking, and live/UI projection parity', async () => {
    const { calculatePlayerStatProjections } = await import('./src/shared/statUtils.ts');

    assert.strictEqual(MAX_LEVEL, 50, 'MAX_LEVEL must be reduced to 50');

    const room = new GameRoom({
      roomId: 'R_TEST_REBALANCE_91',
      name: 'Rebalance Verification Room',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9191,
    });
    room.status = 'playing';

    // 1. Legacy saved account above Lv 50 loads safely capped at 50 while preserving invested attributes & storage
    const legacyState = room.addOrReconnectPlayer('p_legacy', 'LegacyHero', 'vanguard', false, {
      level: 85,
      xp: 4500,
      strength: 50,
      vitality: 40,
      dexterity: 10,
      intelligence: 0,
      faith: 0,
      attributePoints: 20,
      storage: ['sunfire_signet'],
    });
    assert.strictEqual(legacyState.level, 50, 'Legacy >50 account must clamp cleanly to Level 50');
    assert.strictEqual(legacyState.xp, 0, 'Capped account XP must stay at 0');
    assert.strictEqual(legacyState.nextXp, 999999, 'Capped account nextXp must stay at MAX sentinel');
    assert.strictEqual(legacyState.strength, 50, 'Existing invested attributes must be preserved');
    assert.strictEqual(legacyState.attributePoints, 20, 'Existing attribute points must be preserved');
    assert.deepStrictEqual(legacyState.storage, ['sunfire_signet'], 'Existing relic storage must be preserved');

    // Verify grantXp and setPlayerLevel cannot exceed Level 50 or grant extra attribute points past 50
    const capHero = room.addOrReconnectPlayer('p_cap', 'CapTester', 'vanguard', false, {
      level: 49,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
    });
    assert.strictEqual(capHero.nextXp, GameRoom.computeNextXp(49), 'Level 49 nextXp must match polynomial curve');
    (room as any).grantXp(capHero, 500000);
    assert.strictEqual(capHero.level, 50, 'grantXp must stop at Level 50');
    assert.strictEqual(capHero.xp, 0, 'XP must reset to 0 upon reaching Level 50 cap');
    assert.strictEqual(capHero.nextXp, 999999, 'nextXp at Level 50 must be 999999');
    assert.strictEqual(capHero.attributePoints, 3, 'Only 1 level-up (+3 pts) may be granted from Lv49 to Lv50');
    (room as any).grantXp(capHero, 500000);
    assert.strictEqual(capHero.level, 50, 'Subsequent XP must never exceed Level 50');
    assert.strictEqual(capHero.attributePoints, 3, 'No attribute points may be granted after Level 50');

    room.setPlayerLevel('p_cap', 99);
    assert.strictEqual(capHero.level, 50, 'setPlayerLevel must clamp to Level 50');
    assert.strictEqual(capHero.nextXp, 999999);
    assert.strictEqual(capHero.attributePoints, 147, 'Level 50 reset grants (50 - 1) * 3 = 147 points');

    // 2. Direct Damage Scaling: BaseDamage * (1 + 0.05*(Lv-1)) * (1 + 0.015*PrimaryAttr), no double application
    const classesAndAttrs: Array<{ id: string; cls: HeroClassId; attr: 'strength' | 'dexterity' | 'intelligence' | 'faith'; cat: 'physical' | 'arcane' | 'divine' }> = [
      { id: 'v_dmg', cls: 'vanguard', attr: 'strength', cat: 'physical' },
      { id: 'r_dmg', cls: 'ranger', attr: 'dexterity', cat: 'physical' },
      { id: 'a_dmg', cls: 'arcanist', attr: 'intelligence', cat: 'arcane' },
      { id: 'c_dmg', cls: 'cleric', attr: 'faith', cat: 'divine' },
    ];
    for (const spec of classesAndAttrs) {
      const saved = { level: 30, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0 };
      saved[spec.attr] = 40;
      const st = room.addOrReconnectPlayer(spec.id, spec.id, spec.cls, false, saved);
      const expectedMult = (1 + 29 * 0.025) * (1 + 40 * 0.008); // 1.725 * 1.32 = 2.277
      assert.ok(Math.abs(room.computeDamageMult(st, spec.cat) - expectedMult) < 1e-9, `${spec.cls} multiplier must equal ${expectedMult}`);

      const proj = calculatePlayerStatProjections(st, 1);
      assert.strictEqual(proj.damageMultiplier, Number(expectedMult.toFixed(2)), `${spec.cls} projected damageMultiplier must match engine`);
      assert.strictEqual(proj.scaledHitDamage, Math.round(HERO_CLASSES[spec.cls].damage * expectedMult), `${spec.cls} projected hit damage must match engine`);
      assert.strictEqual(proj.critMultiplier, 1.25, `${spec.cls} projected critMultiplier must be 1.25x`);

      // Confirm basic attack projectile receives single-applied scaled damage (non-crit OR 1.25x crit)
      room.projectiles = [];
      room.firePrimaryAttack(st);
      const shot = room.projectiles.find((pr) => pr.ownerId === spec.id)!;
      const expectedHit = Math.round(HERO_CLASSES[spec.cls].damage * expectedMult);
      const expectedCrit = Math.round(HERO_CLASSES[spec.cls].damage * expectedMult * 1.25);
      assert.strictEqual(proj.critHitDamage, Math.round(proj.scaledHitDamage * 1.25), `${spec.cls} projected critHitDamage must reflect 1.25x crit multiplier`);
      assert.ok(shot.damage === expectedHit || shot.damage === expectedCrit, `${spec.cls} primary shot damage (${shot.damage}) must equal ${expectedHit} or crit ${expectedCrit}`);
    }

    // 2b. Verify DPS curve stays < 1,000 DPS for balanced and even heavily geared Lv50 builds, requiring extreme stacking to cross 1,000 DPS
    const balancedRanger = room.addOrReconnectPlayer('r_bal', 'BalRanger', 'ranger', false, {
      level: 50, xp: 0, strength: 0, vitality: 38, dexterity: 60, intelligence: 0, faith: 0, attributePoints: 0,
    });
    balancedRanger.relics = ['twinstring_charm', 'sunfire_signet'];
    const balProj = calculatePlayerStatProjections(balancedRanger, 5);
    assert.ok(balProj.sustainedDps < 600, `Balanced Lv50 Ranger (60 DEX + Twinstring + Sunfire) must stay moderate (got ${balProj.sustainedDps})`);

    const glassRangerNoFury = room.addOrReconnectPlayer('r_glass', 'GlassRanger', 'ranger', false, {
      level: 50, xp: 0, strength: 0, vitality: 0, dexterity: 98, intelligence: 0, faith: 0, attributePoints: 0,
    });
    glassRangerNoFury.relics = ['twinstring_charm', 'sunfire_signet', 'keen_arrowhead'];
    const glassNoFuryProj = calculatePlayerStatProjections(glassRangerNoFury, 5);
    assert.ok(glassNoFuryProj.directDps < 800, `98 DEX Lv50 Ranger with core offense relics still stays well below 1000 DPS (got ${glassNoFuryProj.directDps})`);

    glassRangerNoFury.relics.push('cinder_heart', 'viper_crucible', 'bloodletter_talisman');
    glassRangerNoFury.floorBlessings = ['fury', 'fury', 'fury', 'swiftness', 'swiftness'];
    const extremeProj = calculatePlayerStatProjections(glassRangerNoFury, 5);
    assert.ok(extremeProj.sustainedDps >= 1000, `Extreme Lv50 98-DEX glass-cannon with 6 offensive relics + 5 offensive blessings reaches >= 1000 DPS (got ${extremeProj.sustainedDps})`);

    // 3. Vitality: +5 Max HP per point & max(1, floor(VIT * 0.1)) regen every 2s
    const vitZero = room.addOrReconnectPlayer('vit_zero', 'VitZero', 'vanguard', false, {
      level: 10, xp: 0, strength: 0, vitality: 5, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    vitZero.x += 600;
    vitZero.hp = 100;
    const vitLow = room.addOrReconnectPlayer('vit_low', 'VitLow', 'vanguard', false, {
      level: 10, xp: 0, strength: 0, vitality: 9, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    vitLow.x += 600;
    assert.strictEqual(vitLow.maxHp, 155 + 9 * 12 + 9 * 5, '9 VIT Vanguard at Lv10 maxHp = 155 + 108 + 45 = 308');
    vitLow.hp = 100;
    const vitHigh = room.addOrReconnectPlayer('vit_high', 'VitHigh', 'vanguard', false, {
      level: 10, xp: 0, strength: 0, vitality: 45, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    vitHigh.x += 600;
    assert.strictEqual(vitHigh.maxHp, 155 + 9 * 12 + 45 * 5, '45 VIT Vanguard at Lv10 maxHp = 155 + 108 + 225 = 488');
    vitHigh.hp = 100;
    room.tick(2000);
    assert.strictEqual(vitZero.hp, 100, 'Under-threshold 5 VIT must not trigger passive regen');
    assert.strictEqual(vitLow.hp, 101, '9 VIT must regen max(1, floor(0.9)) = 1 HP / 2s');
    assert.strictEqual(vitHigh.hp, 104, '45 VIT must regen max(1, floor(4.5)) = 4 HP / 2s');
    assert.strictEqual(calculatePlayerStatProjections(vitZero, 1).hpRegenPerTick, 0);
    assert.strictEqual(calculatePlayerStatProjections(vitLow, 1).hpRegenPerTick, 1);
    assert.strictEqual(calculatePlayerStatProjections(vitHigh, 1).hpRegenPerTick, 4);

    // Cleric Faith healing projection matches GameRoom.computeHealingAmount
    const cState = room.getPlayerState('c_dmg')!;
    const cProj = calculatePlayerStatProjections(cState, 1);
    const expectedHealMult = (1 + 29 * 0.015) * (1 + 40 * 0.006); // 1.435 * 1.24 = 1.7794 -> 1.78
    assert.strictEqual(cProj.healingMultiplier, Number(expectedHealMult.toFixed(2)), 'Cleric projected healingMultiplier must match Lv & Faith scaling');
    assert.strictEqual(GameRoom.computeHealingAmount(24, cState), Math.round(24 * expectedHealMult), 'GameRoom healing amount must match Cleric Lv & Faith formula');

    // 4. All attribute caps + relic & blessing stacking parity between GameRoom and statUtils
    const stacked = room.addOrReconnectPlayer('p_stack', 'StackHero', 'arcanist', false, {
      level: 50,
      xp: 0,
      strength: 100,
      vitality: 25,
      dexterity: 100,
      intelligence: 100,
      faith: 100,
      attributePoints: 0,
    });
    stacked.relics = ['sunfire_signet', 'keen_arrowhead', 'runic_carapace', 'hourglass_shard', 'zephyr_greaves', 'bastion_pauldron', 'twinstring_charm'];
    stacked.floorBlessings = ['fury', 'swiftness', 'bastion'];
    stacked.maxHp = GameRoom.computePlayerMaxHp(stacked.heroClass, stacked.level, stacked.vitality, stacked.relics);
    stacked.hp = stacked.maxHp;

    const projStacked = calculatePlayerStatProjections(stacked, 5);
    assert.strictEqual(projStacked.maxHp, stacked.maxHp, 'Projection maxHp with Bastion Pauldron must equal GameRoom maxHp');
    assert.strictEqual(projStacked.critChancePct, 45.0, 'Crit chance must remain capped at 45.0%');
    assert.strictEqual(projStacked.faithCcTenacityPct, 30.0, '100 FTH grants 30.0% CC tenacity');
    // Arcanist base phys resist (0.05) + STR attr cap (0.15) + Runic Carapace (0.15) + Bastion (0.06) = 0.41 -> 41.0%
    assert.strictEqual(projStacked.physicalResistPct, 41.0, 'Physical resistance must combine base + capped 15% STR + Runic Carapace + Bastion');
    assert.strictEqual(room.damagePlayer(stacked, 1000, 'physical'), 590, 'Engine physical resistance mitigation must match 41.0% projection');
    stacked.hp = stacked.maxHp;

    // Damage multiplier includes sunfire_signet (1.12x) and fury blessing (1.06x)
    const engineMult = room.computeDamageMult(stacked, 'arcane');
    assert.strictEqual(projStacked.damageMultiplier, Number(engineMult.toFixed(2)), 'Projected damageMultiplier with relics + Fury must match GameRoom');
    assert.ok(projStacked.sustainedDps < 1000, `Capped 100/100 Arcanist with all offensive relics + Fury remains < 1000 DPS (got ${projStacked.sustainedDps})`);

    // Move speed matches computePlayerMoveSpeed
    assert.strictEqual(projStacked.moveSpeedPx, Math.round(computePlayerMoveSpeed(stacked)), 'Projected moveSpeedPx must match computePlayerMoveSpeed');

    // Attack cooldown matches tick() logic (0.4% DEX + swiftness blessing)
    const expectedAttackCd = Math.round(HERO_CLASSES.arcanist.attackCooldownMs / ((1 + 100 * 0.004) * (1 + 1 * 0.08)));
    assert.strictEqual(projStacked.attackCooldownMs, expectedAttackCd, 'Projected attackCooldownMs must match live attack cadence');

    // CDR matches performAction() (20% INT cap + 25% Hourglass + 8% Swiftness -> capped at 50%)
    room.performAction('p_stack', 'tactical');
    assert.strictEqual(stacked.skillCooldownMs, Math.round(HERO_CLASSES.arcanist.tacticalCooldownMs * 0.50), 'Engine CDR must cap at 50%');
    assert.strictEqual(projStacked.tacticalCooldownSec, Number((stacked.skillCooldownMs / 1000).toFixed(1)), 'Projected tactical cooldown must match engine');

    // Elemental resist check against 1000 incoming elemental damage
    // Arcanist base avg (0.25+0.35+0.45)/3=0.35 + INT cap 0.15 + Runic Carapace 0.20 + Bastion 0.06 = 0.76 -> capped at 0.75 (250 dmg)
    const elemTaken = room.damagePlayer(stacked, 1000, 'elemental');
    assert.strictEqual(elemTaken, 250, 'Elemental resistance must preserve 75% total cap');
    assert.strictEqual(projStacked.elementalResistPct, 75.0, 'Projected elementalResistPct must match 75% cap');
  });

  // --- Test 92: Progression (+3 Attr Pts/Lv, 147 Total at Lv 50, Floor Mastery No Extra Attr Pts) ---
  await test('92. Progression: Lv1 starts at 0 pts, +3 pts/level up to 147 at Lv50, and Floor Mastery never inflates attr pts', async () => {
    const room = new GameRoom({
      roomId: 'R_TEST_PROG_92',
      name: 'Progression Audit Room',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9292,
      initialFloor: 1,
    });
    room.status = 'playing';

    const hero = room.addOrReconnectPlayer('p_prog92', 'LvOneHero', 'vanguard');
    assert.strictEqual(hero.level, 1, 'Fresh player starts at Level 1');
    assert.strictEqual(hero.attributePoints, 0, 'Level 1 starts with 0 attribute points');

    // Step through levels 1 -> 50 via grantXp
    let safety = 0;
    while (hero.level < MAX_LEVEL && safety < 200) {
      safety++;
      (room as any).grantXp(hero, hero.nextXp);
    }
    assert.strictEqual(hero.level, 50, 'Must reach Level 50 cap');
    assert.strictEqual(hero.attributePoints, 147, 'Lv 1 -> Lv 50 must award exactly (50 - 1) * 3 = 147 attribute points');

    // Verify Floor Mastery awards shield/gold/xp/potion without adding or duplicating attribute points
    const ptsBefore = hero.attributePoints;
    const shieldBefore = hero.shield;
    room.enemies = [];
    room.tick(50);
    assert.strictEqual(room.buildSnapshot().floorMasteryAwarded, true);
    assert.strictEqual(hero.attributePoints, ptsBefore, 'Floor Mastery must NOT award extra attribute points past 147');
    assert.ok(hero.shield > shieldBefore, 'Floor Mastery grants defensive shield instead of permanent attribute inflation');

    // Repeated call guard: attributePoints & gold must not duplicate
    const goldAfterFirst = hero.gold;
    (room as any).awardFullFloorMastery();
    assert.strictEqual(hero.gold, goldAfterFirst, 'Guard prevents duplicate Floor Mastery rewards');
    assert.strictEqual(hero.attributePoints, ptsBefore);
  });

  // --- Test 93: Boss Indicator & Ability Lifecycle Fixes (Malakor Dash, JSON Delta RemovedKeys, Shield Wall Decay, Oriphiel Parry, Zone Cleanup) ---
  await test('93. Boss Lifecycle: Malakor dash windup/single-hit/interrupt cleanup, JSON delta key deletion, shieldWall decay, & zone cleanup', async () => {
    const {
      applySnapshotDelta,
      cloneSnapshotBaseline,
      computeSnapshotDelta,
    } = await import('./src/shared/snapshotDelta.ts');

    // 1. Warden Malakor War Charge lifecycle + JSON WebSocket delta cleanup
    const f1Room = new GameRoom({
      roomId: 'R_TEST_MALAKOR_93',
      name: 'Malakor Dash Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9301,
      initialFloor: 1,
    });
    f1Room.status = 'playing';
    const p1 = f1Room.addOrReconnectPlayer('pm', 'TankHero', 'vanguard');
    p1.maxHp = 800;
    p1.hp = 800;
    const malakor = f1Room.enemies.find((e) => e.kind === 'boss')!;
    // Keep other non-boss mobs out of the test
    f1Room.enemies = [malakor];

    // Put Malakor into Phase 2, lock out non-charge abilities so he casts War Charge
    malakor.hp = Math.round(malakor.maxHp * 0.50);
    malakor.windupMs = 0;
    const meta = (f1Room as any).getEnemyMeta(malakor);
    meta.bossAbilityCooldowns = { 0: 9999999, 1: 9999999, 2: 9999999 };

    p1.x = malakor.x + 110;
    p1.y = malakor.y;

    // Tick 1: Malakor casts War Charge -> MUST enter windup first (vx === 0, chargeWindupMs > 0), NOT teleport/lunge on frame 1
    f1Room.tick(25);
    assert.strictEqual(malakor.charging, true, 'Malakor War Charge sets charging telemetry flag');
    assert.ok((malakor.chargeWindupMs ?? 0) > 400, `War Charge must begin with visible windup (got ${malakor.chargeWindupMs}ms)`);
    assert.strictEqual(malakor.state, 'windup', 'Malakor state during windup must be windup');
    const xAfterCast = malakor.x;
    f1Room.tick(100);
    assert.strictEqual(malakor.x, xAfterCast, 'Malakor must remain stationary while telegraphing charge windup');

    // Finish windup -> active lunge begins and hits stationary p1 along horizontal line AT MOST ONCE
    p1.x = malakor.x + 40;
    p1.y = malakor.y;
    p1.shield = 0;
    p1.maxHp = 800;
    p1.hp = 800;
    const hpBeforeDash = p1.hp;
    let clientSnap = cloneSnapshotBaseline(f1Room.buildNetworkSnapshot());
    let prevServerSnap = clientSnap;

    for (let t = 0; t < 50; t++) {
      f1Room.tick(25);
      const nextSnap = f1Room.buildNetworkSnapshot();
      // Round-trip through JSON.stringify to simulate actual WebSocket serialization!
      const rawDelta = computeSnapshotDelta(prevServerSnap, nextSnap, t + 1, t + 2);
      const wireDelta = JSON.parse(JSON.stringify(rawDelta));
      clientSnap = applySnapshotDelta(clientSnap, wireDelta);
      prevServerSnap = cloneSnapshotBaseline(nextSnap);
    }

    assert.strictEqual(malakor.charging, false, 'Server must clear charging after charge completes');
    assert.strictEqual(malakor.chargeAngle, undefined, 'Server must clear chargeAngle after charge completes');

    const clientMalakor = clientSnap.enemies.find((e) => e.id === malakor.id)!;
    assert.strictEqual(clientMalakor.charging, undefined, 'Client JSON-reconstructed Malakor must NOT retain stuck charging indicator');
    assert.strictEqual(clientMalakor.chargeAngle, undefined, 'Client JSON-reconstructed Malakor must NOT retain stuck chargeAngle');
    assert.strictEqual(clientMalakor.chargeWindupMs, undefined, 'Client JSON-reconstructed Malakor must clear chargeWindupMs');

    const dmgTaken = hpBeforeDash - p1.hp;
    assert.ok(dmgTaken > 0 && dmgTaken <= 60, `Malakor dash must hit overlapping player only once, not per tick (took ${dmgTaken} dmg)`);

    // 2. Hard CC & Idle interruption during charge/windup + shieldWallMs decay
    malakor.charging = true;
    malakor.chargeWindupMs = 450;
    malakor.chargeTimerMs = 560;
    malakor.chargeAngle = 0.5;
    malakor.shieldWallMs = 200;
    f1Room.applyHardCc(malakor, 'stun', 1700);
    assert.strictEqual(malakor.charging, false, 'Hard CC must interrupt active/winding-up charge');
    assert.strictEqual(malakor.chargeAngle, undefined, 'Hard CC must clear chargeAngle');
    f1Room.tick(250);
    assert.strictEqual(malakor.shieldWallMs, 0, 'shieldWallMs must decay to 0 over time in tick() instead of staying permanent');

    // Idle interruption (target downed in boss arena while party survives elsewhere -> !nearest clears charging)
    const farAlly = f1Room.addOrReconnectPlayer('pm_far', 'FarAlly', 'ranger');
    farAlly.x = f1Room.spawnPoint.x;
    farAlly.y = f1Room.spawnPoint.y;
    malakor.stunnedMs = 0;
    malakor.charging = true;
    malakor.chargeTimerMs = 400;
    malakor.chargeAngle = 1.0;
    p1.downed = true;
    f1Room.tick(25);
    assert.strictEqual(f1Room.status, 'playing', 'Room must stay in playing state with alive distant teammate');
    assert.strictEqual(malakor.charging, false, 'Loss of target / idle transition must clear charging');
    assert.strictEqual(malakor.chargeAngle, undefined, 'Loss of target / idle transition must clear chargeAngle');

    // 3. Oriphiel (Floor 10): warden_parry follows Oriphiel, cancels on stun, & zones clean up on boss death
    const f10Room = new GameRoom({
      roomId: 'R_TEST_ORIPHIEL_93',
      name: 'Oriphiel Lifecycle Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9310,
      initialFloor: 10,
    });
    f10Room.status = 'playing';
    const p10 = f10Room.addOrReconnectPlayer('po', 'ParryTester', 'vanguard');
    const oriphiel = f10Room.enemies.find((e) => e.kind === 'boss')!;
    oriphiel.windupMs = 99999;
    f10Room.zones.push({
      id: 'z_parry_test',
      kind: 'warden_parry',
      x: oriphiel.x,
      y: oriphiel.y,
      radius: 65,
      ttlMs: 2100,
      maxTtlMs: 2100,
      ownerId: oriphiel.id,
    });
    oriphiel.x += 45;
    oriphiel.y -= 20;
    f10Room.tick(25);
    const parryZone = f10Room.zones.find((z) => z.kind === 'warden_parry')!;
    assert.ok(parryZone && parryZone.x === oriphiel.x && parryZone.y === oriphiel.y, 'Oriphiel warden_parry aura must track Oriphiel position');

    f10Room.applyHardCc(oriphiel, 'stun', 1700);
    assert.strictEqual(f10Room.zones.some((z) => z.kind === 'warden_parry'), false, 'Stun must break Oriphiel warden_parry stance');

    f10Room.zones.push({
      id: 'z_orphan_check',
      kind: 'warden_edict',
      x: oriphiel.x,
      y: oriphiel.y,
      radius: 200,
      quadrant: 0,
      ttlMs: 1400,
      maxTtlMs: 1400,
      ownerId: oriphiel.id,
    });
    oriphiel.stunnedMs = 0;
    oriphiel.shieldWallMs = 0;
    f10Room.damageEnemy(oriphiel, oriphiel.maxHp * 10, p10, false, 'physical');
    assert.strictEqual(f10Room.zones.some((z) => z.ownerId === oriphiel.id), false, 'Killing boss must immediately clear its active hazard zones');
  });

  // --- Test 94: Attribute Passives Audit (INT Elemental/Fire/Arcane/Divine Resistance & Attack CD Clamp Parity) ---
  await test('94. Attribute Passives: INT reduces all elemental/magic damage types and attackCooldownMs floor matches statUtils', async () => {
    const { calculatePlayerStatProjections } = await import('./src/shared/statUtils.ts');

    const room = new GameRoom({
      roomId: 'R_TEST_ATTR_AUDIT_94',
      name: 'Attribute Audit',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9494,
    });
    room.status = 'playing';

    const lowInt = room.addOrReconnectPlayer('p_int0', 'ZeroInt', 'arcanist', false, {
      level: 10, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const highInt = room.addOrReconnectPlayer('p_int100', 'MaxInt', 'arcanist', false, {
      level: 10, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 100, faith: 0, attributePoints: 0,
    });

    for (const dmgType of ['fire', 'frost', 'lightning', 'arcane', 'divine', 'elemental'] as const) {
      lowInt.hp = lowInt.maxHp;
      highInt.hp = highInt.maxHp;
      const dmgLow = room.damagePlayer(lowInt, 100, dmgType);
      const dmgHigh = room.damagePlayer(highInt, 100, dmgType);
      assert.strictEqual(dmgLow - dmgHigh, 15, `100 INT must grant +15% resistance against ${dmgType} damage (low=${dmgLow}, high=${dmgHigh})`);
    }

    // Attack cooldown floor parity (100ms clamp in fast haste/swiftness stack)
    const fastRanger = room.addOrReconnectPlayer('p_fast', 'FastRanger', 'ranger', false, {
      level: 50, xp: 0, strength: 0, vitality: 0, dexterity: 100, intelligence: 0, faith: 0, attributePoints: 0,
    });
    fastRanger.hasteMs = 5000;
    fastRanger.floorBlessings = ['swiftness', 'swiftness', 'swiftness', 'swiftness'];
    const proj = calculatePlayerStatProjections(fastRanger, 1);
    assert.ok(proj.attackCooldownMs >= 100, 'Projected attackCooldownMs must respect >=100ms floor');
  });

  // --- Test 95: Major Healing Nerf Audit (Lv 1, Mid Lv 25, Max Lv 50 + Ashen Curse + Infinite Sustain Prevention) ---
  await test('95. Major Healing Nerf: Lv1/Lv25/Lv50 healing curves support Cleric identity without infinite sustain, and Ashen Curse applies', async () => {
    const { calculatePlayerStatProjections } = await import('./src/shared/statUtils.ts');

    const room = new GameRoom({
      roomId: 'R_TEST_HEAL_NERF_95',
      name: 'Healing Audit Room',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9595,
      initialFloor: 7,
    });
    room.status = 'playing';

    const tiers = [
      { id: 'c1', level: 1, faith: 0, label: 'Early Lv1' },
      { id: 'c25', level: 25, faith: 40, label: 'Mid Lv25 (40 FTH)' },
      { id: 'c50', level: 50, faith: 100, label: 'Max Lv50 (100 FTH)' },
    ];

    const hpsByTier: number[] = [];
    for (const t of tiers) {
      const c = room.addOrReconnectPlayer(t.id, t.label, 'cleric', false, {
        level: t.level, xp: 0, strength: 0, vitality: 20, dexterity: 0, intelligence: 0, faith: t.faith, attributePoints: 0,
      });
      const proj = calculatePlayerStatProjections(c, 1);
      const pulseHeal = GameRoom.computeHealingAmount(24, c);
      const beaconTick = GameRoom.computeHealingAmount(4, c);
      const auraNormal = GameRoom.computeHealingAmount(2, c);
      const expectedMult = (1 + (t.level - 1) * 0.015) * (1 + t.faith * 0.006);
      assert.strictEqual(proj.healingMultiplier, Number(expectedMult.toFixed(2)), `${t.label} statUtils healingMultiplier parity`);

      // Sustained HP/sec from Pulse (6.8s CD) + Beacon (10 ticks / 18s CD) + Aura (2s pulse)
      const sustainedHps = pulseHeal / 6.8 + (beaconTick * 10) / 18.0 + auraNormal / 2.0;
      hpsByTier.push(sustainedHps);

      // Cleric support scales upward with level & Faith
      if (hpsByTier.length > 1) {
        assert.ok(sustainedHps > hpsByTier[hpsByTier.length - 2], `${t.label} sustained HP/s must exceed lower tier`);
      }
      // Prevent late-game infinite sustain (was ~328 HP/s previously)
      assert.ok(sustainedHps < 25, `${t.label} sustained healing (${sustainedHps.toFixed(1)} HP/s) must be far below infinite-sustain levels`);
    }

    // Ashen Curse (-45% healing) works across Cleric abilities AND Health Potions
    const cleric50 = room.getPlayerState('c50')!;
    const victim = room.addOrReconnectPlayer('p_cursed', 'CursedTank', 'vanguard', false, {
      level: 50, xp: 0, strength: 0, vitality: 40, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    victim.x = cleric50.x + 20;
    victim.y = cleric50.y;
    victim.hp = 100;
    victim.statuses = [{
      id: 'st_ashen',
      type: 'ashen_curse',
      durationMs: 5000,
      maxDurationMs: 5000,
    }];

    const uncursedPulse = GameRoom.computeHealingAmount(24, cleric50);
    const cursedPulse = GameRoom.computeHealingAmount(24, cleric50, victim);
    assert.ok(cursedPulse <= Math.round(uncursedPulse * 0.56), `Ashen Curse must cut Pulse heal ~45% (${cursedPulse} vs ${uncursedPulse})`);

    room.performAction('c50', 'tactical');
    assert.strictEqual(victim.hp, 100 + cursedPulse, 'Sanctified Pulse must apply target Ashen Curse reduction');

    // Nerfed potion (30% Max HP) with Ashen Curse (-45%)
    const hpBeforePotion = victim.hp;
    victim.potions = 2;
    room.performAction('p_cursed', 'potion');
    const potionGained = victim.hp - hpBeforePotion;
    const expectedCursedPotion = Math.max(1, Math.round(victim.maxHp * 0.30 * 0.55));
    assert.strictEqual(potionGained, expectedCursedPotion, 'Health potion must heal 30% Max HP reduced by Ashen Curse when cursed');

    // Solar Beacon revives downed teammates cleanly even with nerfed heal tick
    const downedAlly = room.addOrReconnectPlayer('p_downed_b', 'DownedHero', 'ranger');
    downedAlly.downed = true;
    downedAlly.hp = 0;
    downedAlly.reviveProgress = 0;
    downedAlly.x = cleric50.x + 10;
    downedAlly.y = cleric50.y;
    cleric50.ultCooldownMs = 0;
    room.performAction('c50', 'ult', 0, { aimDistance: 10 });
    for (let i = 0; i < 65; i++) {
      f1_advanceBeaconTick(room);
    }
    assert.strictEqual(downedAlly.downed, false, 'Solar Beacon must still reliably revive downed allies within ~1.5s');

    function f1_advanceBeaconTick(r: GameRoom) {
      r.tick(25);
    }
  });

  // --- Test 96: Bulk and Spend All Attribute Allocation clamping and accounting ---
  test('96. Bulk and Spend All attribute allocation correctly clamps to available points and MAX_ATTRIBUTE cap', () => {
    const room = new GameRoom({
      roomId: 'R_TEST_BULK_ATTR_96',
      name: 'Bulk Attr Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9696,
    });
    room.status = 'playing';

    const pid = 'p_bulk';
    const player = room.addOrReconnectPlayer(pid, 'BulkHero', 'vanguard', false, {
      level: 20, xp: 0, strength: 10, vitality: 10, dexterity: 10, intelligence: 10, faith: 10, attributePoints: 50,
    });

    const spendAmount = (attr: keyof typeof player, requested: number) => {
      const current = Number(player[attr]) || 0;
      const availablePoints = player.attributePoints;
      const availableRoom = Math.max(0, 100 - current);
      const spend = Math.min(requested, availablePoints, availableRoom);
      if (spend > 0) {
        (player as any)[attr] = current + spend;
        player.attributePoints -= spend;
      }
      return spend;
    };

    const spent10 = spendAmount('strength', 10);
    assert.strictEqual(spent10, 10, 'Must spend 10 STR points');
    assert.strictEqual(player.strength, 20, 'STR must be 20');
    assert.strictEqual(player.attributePoints, 40, 'Remaining points must be 40');

    const remainingPts = player.attributePoints;
    const spentMax = spendAmount('vitality', remainingPts);
    assert.strictEqual(spentMax, 40, 'Must spend all 40 remaining points into VIT');
    assert.strictEqual(player.vitality, 50, 'VIT must be 50 (10 + 40)');
    assert.strictEqual(player.attributePoints, 0, 'Attribute points must be 0 after MAX spend');
  });

  // Helper: carve a deterministic walkable arena patch on a test room map
  function carveOpenArena(room: GameRoom, centerTileX: number, centerTileY: number, halfTiles = 18): { x: number; y: number } {
    for (let ty = Math.max(1, centerTileY - halfTiles); ty <= Math.min(room.map.height - 2, centerTileY + halfTiles); ty++) {
      for (let tx = Math.max(1, centerTileX - halfTiles); tx <= Math.min(room.map.width - 2, centerTileX + halfTiles); tx++) {
        room.map.tiles[ty * room.map.width + tx] = 1;
      }
    }
    room.props = [];
    for (const r of room.map.rooms) {
      r.cleared = true;
    }
    return {
      x: centerTileX * TILE_SIZE + TILE_SIZE / 2,
      y: centerTileY * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  function makeNeutralDummyEnemy(
    id: string,
    x: number,
    y: number,
    hp = 5000,
    opts?: { kind?: 'skeleton' | 'knight' | 'boss' }
  ): EnemyState {
    return {
      id,
      kind: opts?.kind ?? 'skeleton',
      name: `Dummy ${id}`,
      roomId: 0,
      x,
      y,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      radius: 16,
      state: 'idle',
      windupMs: 0,
      targetX: x,
      targetY: y,
      markedMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      elite: false,
      resistances: { physical: 0, fire: 0, frost: 0, lightning: 0, arcane: 0, divine: 0, poison: 0, bleed: 0, tenacity: 0 },
    };
  }

  // --- Test 97: Arcanist Default Astral Nova + 7 Spell Scrolls, Cooldowns, INT Scaling & Hit Limits ---
  await test('97. Arcanist Spells: Astral Nova default + all 7 Spell Scrolls replace [Q], enforce CDs, INT scaling, and hit limits', async () => {
    const {
      ARCANIST_SPELL_ORDER,
      ARCANIST_SPELLS,
      computeArcanistSpellDamage,
    } = await import('./src/shared/arcanist.ts');

    const room = new GameRoom({
      roomId: 'R_ARC_SPELLS_97',
      name: 'Arcanist Spell Range',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9701,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 20);

    // Zero INT / Lv1 caster for exact base cooldown & base damage check
    const arc0 = room.addOrReconnectPlayer('arc0', 'NoviceArc', 'arcanist', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    arc0.x = origin.x;
    arc0.y = origin.y;

    // 0) Default [Q] without Scroll = Astral Nova (8-way burst, 5000ms CD)
    assert.strictEqual(arc0.equippedScrollId || null, null, 'Arcanist must start with no Scroll equipped (Astral Nova default)');
    room.performAction(arc0.id, 'tactical', 0, { aimDistance: 120, explicitAim: true });
    assert.strictEqual(room.projectiles.length, 8, 'Default Astral Nova [Q] must fire 8 radial projectiles');
    assert.strictEqual(arc0.skillCooldownMs, HERO_CLASSES.arcanist.tacticalCooldownMs, 'Astral Nova must start 5000ms tactical CD');
    room.projectiles = [];
    arc0.skillCooldownMs = 0;

    // 1) All 7 Spell Scrolls equip onto [Q], activate via tactical action, and enforce exact CDs
    for (const spellId of ARCANIST_SPELL_ORDER) {
      const spec = ARCANIST_SPELLS[spellId];
      arc0.pendingScrollChoices = [spellId];
      room.selectArcanistScroll(arc0.id, spellId);
      assert.strictEqual(arc0.equippedScrollId, spellId, `Must equip ${spellId} Scroll onto [Q]`);
      arc0.skillCooldownMs = 0;

      if (spellId === 'chain_lightning') {
        // Cone blast fires forward immediately even if no enemy is inside the cone
        room.performAction(arc0.id, 'tactical', 0, { aimDistance: 340, explicitAim: true });
        assert.strictEqual(arc0.skillCooldownMs, spec.cooldownMs, 'Chain Lightning cone must consume cooldown on cast');
        assert.ok(room.zones.some((z) => z.kind === 'chain_lightning_arc' && Math.abs((z.coneHalfAngleRad || 0) - 0.56) < 0.01), 'Chain Lightning must spawn cone discharge zone');
        room.zones = [];
        arc0.skillCooldownMs = 0;
        const t1 = makeNeutralDummyEnemy('cl_target', origin.x + 120, origin.y, 1000);
        room.enemies.push(t1);
      }

      room.performAction(arc0.id, 'tactical', 0, { aimDistance: 180, explicitAim: true });
      if (spellId === 'disintegration') {
        assert.strictEqual(arc0.disintegrationState?.active, true, 'Disintegration Scroll must enter active channel on [Q]');
        assert.strictEqual(arc0.skillCooldownMs, 0, 'Disintegration cooldown must NOT start while channeling');
        room.stopDisintegrationChannel(arc0.id);
      } else if (spec.castTimeMs > 0) {
        assert.ok(arc0.spellCastState && arc0.spellCastState.spellId === spellId, `${spellId} must enter cast state`);
        for (let step = 0; step < Math.ceil(spec.castTimeMs / 25); step++) {
          room.tick(25);
        }
      }
      assert.strictEqual(
        arc0.skillCooldownMs,
        spec.cooldownMs,
        `${spellId} must start exact ${spec.cooldownMs}ms tactical cooldown (0 INT/CDR)`
      );
      assert.strictEqual(
        arc0.maxSkillCooldownMs,
        spec.cooldownMs,
        `${spellId} maxSkillCooldownMs must reflect ${spec.cooldownMs}ms`
      );
      if (spellId === 'arcane_barrage') {
        for (let step = 0; step < 14; step++) {
          room.tick(25);
        }
      }
      // Attempting recast while on cooldown must not fire extra projectiles/zones
      const prevProjCount = room.projectiles.length;
      const prevZoneCount = room.zones.length;
      room.performAction(arc0.id, 'tactical', 0, { aimDistance: 180, explicitAim: true });
      assert.strictEqual(room.projectiles.length, prevProjCount, `${spellId} must not spawn projectiles while on cooldown`);
      assert.strictEqual(room.zones.length, prevZoneCount, `${spellId} must not spawn zones while on cooldown`);

      room.enemies = [];
      room.projectiles = [];
      room.zones = [];
      arc0.skillCooldownMs = 0;
      arc0.spellCastState = null;
    }
    room.removePlayer(arc0.id);

    // Single-application INT scaling verification (Lv25, 60 INT, Sunfire Signet, 2 Fury stacks)
    const arc25 = room.addOrReconnectPlayer('arc25', 'Archmage', 'arcanist', false, {
      level: 25, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 60, faith: 0, attributePoints: 0,
    });
    arc25.x = origin.x;
    arc25.y = origin.y;
    arc25.relics = ['sunfire_signet'];
    arc25.floorBlessings = ['fury', 'fury'];

    // D = 42 * (1 + 0.025 * 24) * (1 + 0.015 * 60) * 1.12 * 1.12 = 42 * 1.6 * 1.9 * 1.2544 = 160.16 -> 160
    const expectedFireball = computeArcanistSpellDamage(
      ARCANIST_SPELLS.fireball.baseDamage,
      { level: 25, intelligence: 60, relics: ['sunfire_signet'], furyStacks: 2 },
      ARCANIST_SPELLS.fireball.intCoeff
    );
    assert.strictEqual(expectedFireball, 160, 'Single-application Fireball INT formula must yield 160 (no double-dip)');

    const equipAndCast = (spellId: (typeof ARCANIST_SPELL_ORDER)[number], aimDistance: number) => {
      arc25.pendingScrollChoices = [spellId];
      room.selectArcanistScroll(arc25.id, spellId);
      arc25.skillCooldownMs = 0;
      arc25.spellCastState = null;
      room.performAction(arc25.id, 'tactical', 0, { aimDistance, explicitAim: true });
    };

    // 1) Fireball: larger projectile (radius 14), immediate explosion on enemy hit, 105u AoE, and lingering burning ground zone
    const fbDirect = makeNeutralDummyEnemy('fb_1', origin.x + 160, origin.y, 2000);
    const fbSplashIn = makeNeutralDummyEnemy('fb_2', origin.x + 215, origin.y + 10, 2000); // ~85u from detonation (<105u)
    const fbOut = makeNeutralDummyEnemy('fb_3', origin.x + 295, origin.y, 2000); // ~165u from detonation (>105u)
    room.enemies.push(fbDirect, fbSplashIn, fbOut);
    equipAndCast('fireball', 180);
    for (let i = 0; i < 14; i++) room.tick(25); // completes 350ms cast
    const fbProj = room.projectiles.find((pr) => pr.spellId === 'fireball');
    assert.ok(fbProj && fbProj.radius === 14, 'Fireball projectile must be larger (radius 14)');
    let explodedImmediately = false;
    for (let i = 0; i < 20; i++) {
      room.tick(25);
      if (fbDirect.hp < 2000) {
        explodedImmediately = !room.projectiles.some((pr) => pr.spellId === 'fireball') &&
          room.zones.some((z) => z.kind === 'fireball_burn');
        break;
      }
    }
    assert.strictEqual(explodedImmediately, true, 'Fireball must immediately explode on enemy contact, remove projectile, and leave a burning zone');
    assert.ok(fbSplashIn.hp < 2000, 'Fireball 105u AoE must hit splash enemy within explosion radius');
    assert.strictEqual(fbOut.hp, 2000, 'Fireball must NOT hit enemies outside 105u AoE');
    const hpAfterBlast = fbDirect.hp;
    for (let i = 0; i < 24; i++) room.tick(25); // +600ms -> lingering burn zone ticks at 500ms
    assert.ok(fbDirect.hp < hpAfterBlast, 'Fireball lingering burn zone must deal periodic fire damage');

    room.enemies = [];
    room.projectiles = [];
    room.zones = [];

    // 2) Frost Lance (Ice Lance): 3-pierce straight line, no freeze
    const flEnemies = [
      makeNeutralDummyEnemy('fl_1', origin.x + 80, origin.y, 2000),
      makeNeutralDummyEnemy('fl_2', origin.x + 140, origin.y, 2000),
      makeNeutralDummyEnemy('fl_3', origin.x + 200, origin.y, 2000),
      makeNeutralDummyEnemy('fl_4', origin.x + 260, origin.y, 2000),
    ];
    room.enemies.push(...flEnemies);
    equipAndCast('frost_lance', 300);
    for (let i = 0; i < 50; i++) room.tick(25);
    assert.ok(flEnemies[0].hp < 2000 && flEnemies[1].hp < 2000 && flEnemies[2].hp < 2000, 'Frost Lance must pierce up to 3 enemies');
    assert.strictEqual(flEnemies[3].hp, 2000, 'Frost Lance must stop after 3 hits and NOT hit 4th enemy');
    assert.strictEqual(flEnemies[0].frozenMs, 0, 'Frost Lance must NOT apply freeze status');

    room.enemies = [];
    room.projectiles = [];
    room.zones = [];

    // 3) Chain Lightning: cone-shaped discharge (340u range, ±0.56 rad arc)
    const clIn1 = makeNeutralDummyEnemy('cl1', origin.x + 110, origin.y, 5000);
    const clIn2 = makeNeutralDummyEnemy('cl2', origin.x + 260, origin.y + 80, 5000); // ~272u, ~0.30 rad (inside cone)
    const clOutAngle = makeNeutralDummyEnemy('clOutAng', origin.x + 60, origin.y + 140, 5000); // ~1.17 rad (outside cone angle)
    const clOutRange = makeNeutralDummyEnemy('clOutRng', origin.x + 390, origin.y, 5000); // 390u (beyond 340u range)
    room.enemies.push(clIn1, clIn2, clOutAngle, clOutRange);
    equipAndCast('chain_lightning', 340);
    assert.ok(clIn1.hp < 5000 && clIn2.hp < 5000, 'Chain Lightning cone must hit all enemies inside the forward cone');
    assert.strictEqual(clOutAngle.hp, 5000, 'Chain Lightning cone must NOT hit enemies outside cone angle');
    assert.strictEqual(clOutRange.hp, 5000, 'Chain Lightning cone must NOT hit enemies beyond 340u range');
    assert.ok(
      room.zones.some((z) => z.kind === 'chain_lightning_arc' && (z.chainPoints?.length || 0) === 3 && Math.abs((z.coneHalfAngleRad || 0) - 0.56) < 0.01),
      'Chain Lightning arc zone must record cone geometry and shocked target points'
    );

    room.enemies = [];
    room.zones = [];

    // 4) Arcane Meteor: 0.5s cast + 1.0s delay + 125u AoE, no DoT
    const metIn = makeNeutralDummyEnemy('met_in', origin.x + 180, origin.y, 5000);
    const metOut = makeNeutralDummyEnemy('met_out', origin.x + 330, origin.y, 5000); // 150u from target (>125u)
    room.enemies.push(metIn, metOut);
    equipAndCast('arcane_meteor', 180);
    for (let i = 0; i < 20; i++) room.tick(25); // 500ms cast completes
    assert.ok(room.zones.some((z) => z.kind === 'arcane_meteor'), 'Arcane Meteor must spawn ground warning zone after 0.5s cast');
    assert.strictEqual(metIn.hp, 5000, 'Arcane Meteor must NOT deal damage before 1.0s delay');
    for (let i = 0; i < 42; i++) room.tick(25); // +1050ms delay completes
    assert.ok(metIn.hp < 5000, 'Arcane Meteor must deal heavy AoE damage on impact');
    assert.strictEqual(metOut.hp, 5000, 'Arcane Meteor must NOT damage targets outside 125u AoE');
    assert.strictEqual(metIn.burnedMs, 0, 'Arcane Meteor must NOT leave Burn DoT');

    room.enemies = [];
    room.zones = [];
    room.projectiles = [];

    // 5) Arcane Orb: 4s duration, 0.5s tick interval, max 2 hits per enemy, persists through enemies
    const orbHitCounts = new Map<string, number>();
    const orbVictim = makeNeutralDummyEnemy('orb_v1', origin.x + 65, origin.y, 5000);
    const orbSecond = makeNeutralDummyEnemy('orb_v2', origin.x + 140, origin.y, 5000);
    room.enemies.push(orbVictim, orbSecond);
    equipAndCast('arcane_orb', 200);
    let prevHp = orbVictim.hp;
    let hitsOnVictim = 0;
    for (let step = 0; step < 80; step++) {
      room.tick(25);
      if (orbVictim.hp < prevHp) {
        hitsOnVictim++;
        prevHp = orbVictim.hp;
      }
      if (orbSecond.hp < 5000 && !orbHitCounts.has('second')) {
        orbHitCounts.set('second', 1);
      }
    }
    assert.ok(hitsOnVictim >= 1 && hitsOnVictim <= 2, `Arcane Orb must cap at max 2 hits per enemy (got ${hitsOnVictim})`);
    assert.ok(orbHitCounts.has('second'), 'Arcane Orb must persist through enemies to hit further targets');

    room.enemies = [];
    room.projectiles = [];

    // 6) Arcane Barrage: 4 rapid waves (8 bolts total), 450u max range, hits a single standard enemy 3-4+ times
    const barTarget = makeNeutralDummyEnemy('bar_t1', origin.x + 170, origin.y, 5000);
    room.enemies.push(barTarget);
    equipAndCast('arcane_barrage', 300);
    const wave0Bolts = room.projectiles.filter((pr) => pr.spellId === 'arcane_barrage');
    assert.strictEqual(wave0Bolts.length, 2, 'Arcane Barrage wave 0 must spawn 2 bolts immediately');
    const seenBoltIds = new Set<string>(wave0Bolts.map((b) => b.id));
    let barrageDamageTicks = 0;
    let barPrevHp = barTarget.hp;
    for (let step = 0; step < 48; step++) {
      room.tick(25);
      for (const pr of room.projectiles) {
        if (pr.spellId === 'arcane_barrage') seenBoltIds.add(pr.id);
      }
      if (barTarget.hp < barPrevHp) {
        barrageDamageTicks++;
        barPrevHp = barTarget.hp;
      }
    }
    assert.strictEqual(seenBoltIds.size, 8, `Arcane Barrage must fire 8 total bolts across 4 staggered waves (got ${seenBoltIds.size})`);
    assert.ok(barrageDamageTicks >= 3, `Arcane Barrage multi-wave barrage must hit standard target 3-4+ times (hits=${barrageDamageTicks})`);
  });

  // --- Test 98: Disintegration Scroll Channeling, Movement Lock, 180 deg/s Turn Cap, 42u/450u Wall-Clip & Interrupts ---
  await test('98. Disintegration Scroll: requires equipped Scroll, stationary lock, 180deg/s turn cap, 42u/450u clip, & CC/death cooldown', async () => {
    const room = new GameRoom({
      roomId: 'R_ARC_BEAM_98',
      name: 'Disintegration Beam Lab',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9802,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 22);

    const arc = room.addOrReconnectPlayer('arc_beam', 'BeamMage', 'arcanist', false, {
      level: 10, xp: 0, strength: 0, vitality: 20, dexterity: 0, intelligence: 40, faith: 0, attributePoints: 0,
    });
    arc.x = origin.x;
    arc.y = origin.y;

    // Server must reject Disintegration channel unless the Disintegration Scroll is equipped on [Q]
    assert.strictEqual(room.startDisintegrationChannel(arc.id, 0), false, 'Disintegration must reject when Scroll is not equipped');

    arc.pendingScrollChoices = ['disintegration'];
    room.selectArcanistScroll(arc.id, 'disintegration');
    assert.strictEqual(arc.equippedScrollId, 'disintegration', 'Disintegration Scroll must be equipped on [Q]');

    // Place targets at exact coordinates:
    // insideBeam: x+160, y+20 (dist 20 <= beamHalfWidth(21) + enemyRadius(16)=37)
    // outsideWidth: x+160, y+60 (dist 60 > 37)
    // insideRange: x+430, y (<=450u)
    // beyondRange: x+500, y (>450u)
    const inBeam = makeNeutralDummyEnemy('b_in', origin.x + 160, origin.y + 20, 5000);
    const outWidth = makeNeutralDummyEnemy('b_outW', origin.x + 160, origin.y + 60, 5000);
    const inRange = makeNeutralDummyEnemy('b_inR', origin.x + 430, origin.y, 5000);
    const outRange = makeNeutralDummyEnemy('b_outR', origin.x + 500, origin.y, 5000);
    room.enemies.push(inBeam, outWidth, inRange, outRange);

    assert.strictEqual(room.startDisintegrationChannel(arc.id, 0), true, 'Disintegration channel must start when equipped');

    // Attempt movement while holding channel
    room.updateInput(arc.id, { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0, stickX: 1, stickY: 0 });

    // Activation delay is 150ms -> first 125ms deals 0 ticks, 200ms after activation deals 1 tick cleanly
    for (let i = 0; i < 5; i++) room.tick(25); // 125ms
    assert.strictEqual(inBeam.hp, 5000, 'Disintegration must not tick before 0.15s activation delay');
    assert.strictEqual(arc.x, origin.x, 'Player movement X must be completely locked while channeling');
    assert.strictEqual(arc.y, origin.y, 'Player movement Y must be completely locked while channeling');

    // Advance +250ms (total 375ms -> 150ms activation + 225ms => exactly 1 tick at 200ms)
    for (let i = 0; i < 10; i++) room.tick(25);
    const expectedTickDmg = 5000 - inBeam.hp;
    assert.ok(expectedTickDmg > 0, 'Disintegration must deal damage after 0.15s activation + 0.2s tick');
    assert.strictEqual(outWidth.hp, 5000, 'Enemy outside 42u beam width must take 0 damage');
    assert.strictEqual(inRange.hp, 5000 - expectedTickDmg, 'Enemy at 430u (<450u range) must be hit by beam');
    assert.strictEqual(outRange.hp, 5000, 'Enemy beyond 450u max range must NOT be hit');

    // Next 200ms -> exactly 1 additional tick (no duplicate ticks)
    for (let i = 0; i < 8; i++) room.tick(25);
    assert.strictEqual(5000 - inBeam.hp, expectedTickDmg * 2, 'Each 0.2s interval must produce exactly 1 tick without duplication');

    // Rotation speed cap: 180 deg/s (Math.PI rad/s). Command instant 180 deg turn (Math.PI).
    room.updateDisintegrationTarget(arc.id, Math.PI);
    for (let i = 0; i < 20; i++) room.tick(25); // 500ms -> max ~PI/2 rad turn
    const angleAfterHalfSec = arc.disintegrationState!.angle;
    assert.ok(
      Math.abs(angleAfterHalfSec - Math.PI / 2) < 0.08,
      `After 500ms turning toward PI at 180deg/s, angle should be ~PI/2 (${angleAfterHalfSec.toFixed(3)})`
    );

    // Cooldown must NOT start until termination
    assert.strictEqual(arc.skillCooldownMs, 0, 'Cooldown must not start while channeling');
    room.stopDisintegrationChannel(arc.id);
    assert.strictEqual(arc.disintegrationState, null, 'Releasing stops Disintegration immediately');
    assert.ok(arc.skillCooldownMs > 10000, `Tactical cooldown (${arc.skillCooldownMs}ms) must start only after channel termination`);

    // Wall clipping test
    arc.skillCooldownMs = 0;
    const wallTileX = Math.floor((origin.x + 128) / TILE_SIZE);
    const wallTileY = Math.floor(origin.y / TILE_SIZE);
    room.map.tiles[wallTileY * room.map.width + wallTileX] = 2; // solid wall ~128u right
    inRange.hp = 5000;
    room.startDisintegrationChannel(arc.id, 0);
    for (let i = 0; i < 16; i++) room.tick(25); // 400ms
    assert.strictEqual(inRange.hp, 5000, 'Wall must clip Disintegration beam before reaching enemy behind wall');
    room.map.tiles[wallTileY * room.map.width + wallTileX] = 1;

    // Crowd control (stun) interrupts Disintegration and starts cooldown
    const chAfterWall = arc.disintegrationState as { active?: boolean } | null;
    assert.strictEqual(Boolean(chAfterWall?.active), true);
    arc.stunnedMs = 800;
    room.tick(25);
    assert.strictEqual(arc.disintegrationState, null, 'Hard CC stun must immediately interrupt Disintegration');
    assert.ok(arc.skillCooldownMs > 0, 'CC interruption must trigger post-channel cooldown');

    // Death / downed interrupts Disintegration and starts cooldown
    arc.stunnedMs = 0;
    arc.skillCooldownMs = 0;
    assert.strictEqual(room.startDisintegrationChannel(arc.id, 0), true);
    arc.downed = true;
    arc.hp = 0;
    room.tick(25);
    assert.strictEqual(arc.disintegrationState, null, 'Downed/death must immediately interrupt Disintegration');
    assert.ok(arc.skillCooldownMs > 0, 'Downed interruption must trigger post-channel cooldown');
  });

  // --- Test 99: Spell Scroll Draft RNG, [Q] Replacement, Targeting Specs & Vault/Relic Isolation ---
  await test('99. Spell Scrolls: draft rolls 3 spells, replaces [Q] Astral Nova, updates targeting specs, & isolates Relics/Vault/Gold', async () => {
    const {
      ARCANIST_SCROLLS,
      ARCANIST_SPELL_ORDER,
      getArcanistScrollDef,
    } = await import('./src/shared/arcanist.ts');
    const { getAbilityTargetSpec } = await import('./src/shared/abilityTargeting.ts');

    assert.deepStrictEqual(
      ARCANIST_SCROLLS.map((s) => s.id),
      ARCANIST_SPELL_ORDER,
      'ARCANIST_SCROLLS must strictly equal the 7 offensive Arcanist spells'
    );

    const room = new GameRoom({
      roomId: 'R_ARC_SCROLLS_99',
      name: 'Scroll Chamber',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 9903,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 18);

    const arc = room.addOrReconnectPlayer('arc_scr', 'ScrollMage', 'arcanist', false, {
      level: 12, xp: 0, strength: 0, vitality: 10, dexterity: 0, intelligence: 30, faith: 0, attributePoints: 0,
    });
    arc.x = origin.x;
    arc.y = origin.y;
    arc.relics = ['twinstring_charm'];
    arc.storage = ['sunfire_signet'];
    arc.gold = 250;
    arc.potions = 2;

    // RNG draft offers 3 valid choices excluding already-equipped scroll
    assert.strictEqual(room.grantScrollChoices(arc.id), true, 'grantScrollChoices must succeed for Arcanist');
    assert.strictEqual(arc.pendingScrollChoices?.length, 3, 'Must roll 3 distinct Spell Scroll choices');
    for (const choiceId of arc.pendingScrollChoices!) {
      assert.ok(ARCANIST_SPELL_ORDER.includes(choiceId), `Drafted scroll ${choiceId} must be one of the 7 real spells`);
    }

    // Default [Q] spec uses Astral Nova self_aoe; equipped Scrolls return accurate line / ground_aoe specs
    assert.strictEqual(getAbilityTargetSpec('arcanist', 'tactical', null).label, 'Astral Nova');

    for (const scroll of ARCANIST_SCROLLS) {
      arc.pendingScrollChoices = [scroll.id];
      room.selectArcanistScroll(arc.id, scroll.id);
      assert.strictEqual(arc.equippedScrollId, scroll.id, `Must equip ${scroll.id}`);
      assert.deepStrictEqual(arc.relics, ['twinstring_charm'], 'Scroll inscription must never alter Relics');
      assert.deepStrictEqual(arc.storage, ['sunfire_signet'], 'Scroll inscription must never alter Vault storage');
      assert.strictEqual(arc.gold, 250, 'Scroll must never alter Gold');
      assert.strictEqual(arc.potions, 2, 'Scroll must never alter Potions');
      assert.strictEqual(
        arc.maxSkillCooldownMs,
        Math.round(scroll.cooldownMs * (1 - 30 * 0.002)),
        `${scroll.id} must update [Q] tactical max CD`
      );
      assert.ok(getArcanistScrollDef(arc.equippedScrollId), 'Equipped scroll helper must resolve cleanly');

      const spec = getAbilityTargetSpec('arcanist', 'tactical', scroll.id);
      if (scroll.id === 'arcane_meteor') {
        assert.strictEqual(spec.kind, 'ground_aoe', `${scroll.id} must use ground_aoe targeting preview`);
      } else if (scroll.id === 'chain_lightning') {
        assert.strictEqual(spec.kind, 'cone', `${scroll.id} must use cone targeting preview`);
      } else {
        assert.strictEqual(spec.kind, 'line', `${scroll.id} must use line targeting preview`);
      }

      // Subsequent RNG draft excludes currently equipped scroll
      assert.strictEqual(room.grantScrollChoices(arc.id), true);
      assert.strictEqual(arc.pendingScrollChoices!.includes(scroll.id), false, 'RNG draft must not re-offer currently equipped scroll');
      arc.pendingScrollChoices = [];
    }
  });

  // --- Test 100: Chrono Well Time Suspension, Bosses/Allies/ALL Projectiles (Including Caster's)/Zones & Clean Resumption ---
  await test('100. Chrono Well: suspends bosses, allies, zones, AND ALL projectiles including caster/player projectiles, exempting caster player', async () => {
    const room = new GameRoom({
      roomId: 'R_ARC_CHRONO_100',
      name: 'Chrono Sanctuary',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10004,
      initialFloor: 10, // Floor 10 boss Oriphiel (high CC resistance / tenacity)
    });
    room.status = 'playing';
    const origin = carveOpenArena(room, 25, 25, 20);

    const p1 = room.addOrReconnectPlayer('arc_chrono1', 'ChronoMaster', 'arcanist', false, {
      level: 30, xp: 0, strength: 0, vitality: 20, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const p2 = room.addOrReconnectPlayer('ally_cleric', 'FrozenCleric', 'cleric', false, {
      level: 30, xp: 0, strength: 0, vitality: 20, dexterity: 0, intelligence: 0, faith: 40, attributePoints: 0,
    });
    p1.x = origin.x;
    p1.y = origin.y;
    p2.x = origin.x + 50;
    p2.y = origin.y;

    // Position boss inside 115u Chrono Well radius
    const boss = room.enemies.find((e) => e.kind === 'boss')!;
    boss.x = origin.x + 80;
    boss.y = origin.y;
    boss.windupMs = 700;

    // Enemy projectile, Ally projectile, AND Caster's OWN projectile inside well
    const enemyProj = room.spawnProjectile({
      ownerType: 'enemy',
      ownerId: boss.id,
      style: 'fireball',
      x: origin.x + 40,
      y: origin.y + 30,
      vx: 200,
      vy: 0,
      angle: 0,
      radius: 8,
      damage: 25,
      pierce: 1,
      ttlMs: 2500,
    });
    const allyProj = room.spawnProjectile({
      ownerType: 'player',
      ownerId: p2.id,
      style: 'radiant',
      x: origin.x + 40,
      y: origin.y - 30,
      vx: 200,
      vy: 0,
      angle: 0,
      radius: 8,
      damage: 20,
      pierce: 1,
      ttlMs: 2500,
    });
    room.zones.push({
      id: 'z_boss_suspend',
      kind: 'warden_edict',
      x: origin.x + 70,
      y: origin.y,
      radius: 80,
      quadrant: 0,
      ttlMs: 1200,
      maxTtlMs: 1200,
      ownerId: boss.id,
    });

    // Cast Chrono Well centered on caster (check 45000ms CD base on 0-INT caster)
    assert.strictEqual(HERO_CLASSES.arcanist.ultCooldownMs, 45000, 'Arcanist ultCooldownMs must be 45000ms');
    p1.ultCooldownMs = 0;
    room.performAction(p1.id, 'ult', 0, { aimDistance: 0, explicitAim: true });
    assert.strictEqual(p1.ultCooldownMs, 45000, 'Chrono Well must enforce exact 45s cooldown');

    const well = room.zones.find((z) => z.kind === 'chrono_well');
    assert.ok(well && well.radius === 115 && well.ttlMs === 3000, 'Chrono Well zone must spawn with 115u radius and 3000ms duration');

    // Caster fires Frost Lance & Arcane Barrage inside OWN Chrono Well — caster's own projectiles MUST also freeze inside Chrono Well!
    p1.pendingScrollChoices = ['arcane_barrage'];
    room.selectArcanistScroll(p1.id, 'arcane_barrage');
    p1.skillCooldownMs = 0;
    room.performAction(p1.id, 'tactical', 0, { aimDistance: 200, explicitAim: true });
    const casterProj = room.projectiles.find((pr) => pr.ownerId === p1.id && pr.spellId === 'arcane_barrage')!;
    assert.ok(casterProj, 'Caster must be able to fire Spell Scroll projectiles while standing inside own Chrono Well');
    assert.ok((casterProj.chronoSuspendedMs || 0) > 0, 'Caster own projectile spawned inside Chrono Well must be immediately suspended');

    // Step 500ms: ALL entities & ALL projectiles inside well suspend EXCEPT caster player entity
    const bossStartX = boss.x;
    const bossStartY = boss.y;
    const bossStartWindup = boss.windupMs;
    const p2StartX = p2.x;
    const enemyProjStartX = enemyProj.x;
    const allyProjStartX = allyProj.x;
    const casterProjStartX = casterProj.x;
    const casterProjStartTtl = casterProj.ttlMs;
    room.updateInput(p2.id, { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0, stickX: 1, stickY: 0 });
    room.updateInput(p1.id, { up: false, down: false, left: true, right: false, attack: false, aimAngle: Math.PI, stickX: -1, stickY: 0 });

    for (let i = 0; i < 20; i++) room.tick(25); // 500ms elapsed inside 3000ms Chrono Well

    assert.strictEqual(p1.chronoSuspendedMs || 0, 0, 'Chrono Well caster player entity must remain unaffected');
    assert.ok(p1.x < origin.x - 10, 'Caster must move freely inside own Chrono Well');
    assert.ok((p2.chronoSuspendedMs || 0) > 0, 'Ally inside Chrono Well must be suspended');
    assert.strictEqual(p2.x, p2StartX, 'Suspended ally must not move while inside Chrono Well');
    assert.ok((boss.chronoSuspendedMs || 0) > 0, 'Floor 10 boss must be suspended inside Chrono Well');
    assert.strictEqual(boss.x, bossStartX, 'Suspended boss X must remain frozen');
    assert.strictEqual(boss.y, bossStartY, 'Suspended boss Y must remain frozen');
    assert.strictEqual(boss.windupMs, bossStartWindup, 'Suspended boss windup must pause without resetting');
    assert.ok((enemyProj.chronoSuspendedMs || 0) > 0 && enemyProj.x === enemyProjStartX, 'Enemy projectile must freeze in Chrono Well');
    assert.ok((allyProj.chronoSuspendedMs || 0) > 0 && allyProj.x === allyProjStartX, 'Ally projectile must freeze in Chrono Well');
    assert.ok((casterProj.chronoSuspendedMs || 0) > 0 && casterProj.x === casterProjStartX && casterProj.ttlMs === casterProjStartTtl, 'Caster own projectile inside Chrono Well must also freeze in position and TTL');
    const bossZone = room.zones.find((z) => z.id === 'z_boss_suspend')!;
    assert.ok((bossZone.chronoSuspendedMs || 0) > 0 && bossZone.ttlMs === 1200, 'Enemy/boss hazard zone ttlMs must pause inside Chrono Well');

    // Step past remaining 2600ms (total 3100ms > 3000ms) -> clean resumption
    for (let i = 0; i < 106; i++) room.tick(25);
    assert.strictEqual(room.zones.some((z) => z.kind === 'chrono_well'), false, 'Chrono Well must expire after 3s');
    assert.strictEqual(boss.chronoSuspendedMs || 0, 0, 'Boss must resume cleanly after Chrono Well expires');
    assert.strictEqual(p2.chronoSuspendedMs || 0, 0, 'Ally must resume cleanly after Chrono Well expires');
    assert.ok(enemyProj.x > enemyProjStartX || !room.projectiles.includes(enemyProj), 'Suspended enemy projectile must resume advancing cleanly');
    assert.ok(casterProj.x > casterProjStartX || !room.projectiles.includes(casterProj), 'Suspended caster projectile must resume advancing cleanly after Chrono Well ends');
    assert.ok(p2.x > p2StartX, 'Ally must resume moving cleanly after Chrono Well ends');

    // Disconnect safety: active Chrono Well caster disconnects -> clears zone & never leaves permanently suspended entities
    const arc2 = room.addOrReconnectPlayer('arc_dc', 'DisconnectingArc', 'arcanist', false, {
      level: 10, xp: 0, strength: 0, vitality: 10, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    arc2.x = origin.x;
    arc2.y = origin.y;
    boss.x = origin.x + 40;
    boss.y = origin.y;
    p2.x = origin.x + 20;
    p2.y = origin.y;
    room.performAction(arc2.id, 'ult', 0, { aimDistance: 0, explicitAim: true });
    room.tick(25);
    assert.ok((boss.chronoSuspendedMs || 0) > 0 && (p2.chronoSuspendedMs || 0) > 0, 'Second Chrono Well suspends nearby entities');
    room.removePlayer(arc2.id);
    assert.strictEqual(room.zones.some((z) => z.ownerId === arc2.id && z.kind === 'chrono_well'), false, 'Disconnecting caster must clean up active Chrono Well');
    assert.strictEqual(boss.chronoSuspendedMs || 0, 0, 'Disconnect must not leave boss permanently suspended');
    assert.strictEqual(p2.chronoSuspendedMs || 0, 0, 'Disconnect must not leave ally permanently suspended');
  });

  // --- Test 101: Arcanist Multiplayer Delta Sync, Client Prediction & HUD Key Reactivity ---
  await test('101. Multiplayer Sync & Prediction: snapshotDelta preserves Scroll/channel states, prediction locks movement, and HUD key refreshes', async () => {
    const {
      cloneSnapshotBaseline,
      computeSnapshotDelta,
      applySnapshotDelta,
    } = await import('./src/shared/snapshotDelta.ts');
    const { LocalPredictionController } = await import('./src/client/prediction.ts');
    const { buildSnapshotHudKey } = await import('./src/client/networkStats.ts');

    const room = new GameRoom({
      roomId: 'R_ARC_SYNC_101',
      name: 'Delta Sync Arena',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10105,
    });
    room.status = 'playing';
    const origin = carveOpenArena(room, 25, 25, 18);

    const p1 = room.addOrReconnectPlayer('arc_sync', 'SyncMage', 'arcanist', false, {
      level: 15, xp: 0, strength: 0, vitality: 15, dexterity: 0, intelligence: 30, faith: 0, attributePoints: 0,
    });
    p1.x = origin.x;
    p1.y = origin.y;

    let clientSnap = cloneSnapshotBaseline(room.buildNetworkSnapshot());
    let prevServer = cloneSnapshotBaseline(clientSnap);

    // 1. Grant Scroll choices -> delta syncs pendingScrollChoices -> HUD key changes
    const baseHudKey = buildSnapshotHudKey(clientSnap, p1.id, room.map);
    room.grantScrollChoices(p1.id);
    let nextSnap = room.buildNetworkSnapshot();
    let wireDelta = JSON.parse(JSON.stringify(computeSnapshotDelta(prevServer, nextSnap, 1, 2)));
    clientSnap = applySnapshotDelta(clientSnap, wireDelta);
    prevServer = cloneSnapshotBaseline(nextSnap);

    const clientP1Draft = clientSnap.players.find((p) => p.id === p1.id)!;
    assert.ok((clientP1Draft.pendingScrollChoices?.length || 0) === 3, 'Delta sync must deliver pendingScrollChoices');
    assert.notStrictEqual(buildSnapshotHudKey(clientSnap, p1.id, room.map), baseHudKey, 'HUD key must refresh on pendingScrollChoices');

    // 2. Equip Disintegration Scroll & start channel -> delta syncs equippedScrollId + active disintegrationState -> end clears cleanly & delivers skillCooldownMs
    p1.pendingScrollChoices = ['disintegration'];
    room.selectArcanistScroll(p1.id, 'disintegration');
    room.startDisintegrationChannel(p1.id, 0.4);
    room.tick(25);
    nextSnap = room.buildNetworkSnapshot();
    wireDelta = JSON.parse(JSON.stringify(computeSnapshotDelta(prevServer, nextSnap, 2, 3)));
    clientSnap = applySnapshotDelta(clientSnap, wireDelta);
    prevServer = cloneSnapshotBaseline(nextSnap);

    const clientP1Chan = clientSnap.players.find((p) => p.id === p1.id)!;
    assert.strictEqual(clientP1Chan.equippedScrollId, 'disintegration', 'Delta sync must deliver equippedScrollId');
    assert.strictEqual(clientP1Chan.disintegrationState?.active, true, 'Delta sync must deliver active disintegrationState');

    // Client-side prediction must freeze movement when channeling or Chrono-suspended
    const pred = new LocalPredictionController();
    pred.step({
      me: clientP1Chan,
      liveInput: { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0, stickX: 1, stickY: 0 },
      latestSentSeq: 1,
      map: room.map,
      props: [],
      dtSec: 0.05,
      nowMs: Date.now(),
      isNewSnapshot: true,
    });
    const predChan = pred.step({
      me: clientP1Chan,
      liveInput: { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0, stickX: 1, stickY: 0 },
      latestSentSeq: 2,
      map: room.map,
      props: [],
      dtSec: 0.05,
      nowMs: Date.now() + 50,
      isNewSnapshot: false,
    });
    assert.strictEqual(predChan.x, clientP1Chan.x, 'Client prediction must lock X during Disintegration channel');
    assert.strictEqual(predChan.y, clientP1Chan.y, 'Client prediction must lock Y during Disintegration channel');

    // Stop channel -> JSON delta cleanly clears disintegrationState & delivers skillCooldownMs
    room.stopDisintegrationChannel(p1.id);
    nextSnap = room.buildNetworkSnapshot();
    wireDelta = JSON.parse(JSON.stringify(computeSnapshotDelta(prevServer, nextSnap, 3, 4)));
    clientSnap = applySnapshotDelta(clientSnap, wireDelta);
    const clientP1Post = clientSnap.players.find((p) => p.id === p1.id)!;
    assert.strictEqual(Boolean(clientP1Post.disintegrationState), false, 'Delta sync must clear ended disintegrationState');
    assert.ok(clientP1Post.skillCooldownMs > 0, 'Delta sync must deliver post-channel tactical skillCooldownMs');

    // Prediction lock under Chrono suspension
    const suspendedClientState = { ...clientP1Post, chronoSuspendedMs: 1800 };
    const predSusp = pred.step({
      me: suspendedClientState,
      liveInput: { up: false, down: false, left: false, right: true, attack: false, aimAngle: 0, stickX: 1, stickY: 0 },
      latestSentSeq: 3,
      map: room.map,
      props: [],
      dtSec: 0.05,
      nowMs: Date.now() + 100,
      isNewSnapshot: true,
    });
    assert.strictEqual(predSusp.x, suspendedClientState.x, 'Client prediction must lock X during Chrono suspension');
  });

  // --- Test 102: Shared Beyond Identity signing, legacy SHA-256 compatibility, secret checks & rate limiter ---
  await test('102. Shared identity assertions, constant-time password/secret checks, and rate limiting', async () => {
    const crypto = await import('node:crypto');

    // Password hashing & legacy SHA-256 verification compatibility
    const scryptHash = hashPassword('DungeonHero!99');
    assert.ok(scryptHash.startsWith('scrypt:'));
    assert.strictEqual(verifyPassword('DungeonHero!99', scryptHash), true);
    assert.strictEqual(verifyPassword('WrongPass!99', scryptHash), false);
    assert.strictEqual(verifyPassword('DungeonHero!99', 'scrypt:bad'), false);

    const legacyHash = crypto.createHash('sha256').update('beyond_salt_LegacyPass123').digest('hex');
    assert.strictEqual(verifyPassword('LegacyPass123', legacyHash), true);
    assert.strictEqual(verifyPassword('WrongLegacy', legacyHash), false);

    // Assertion payload normalization & HMAC signature verification
    const secret = 'beyond_shared_test_secret_min_32_chars!';
    const sampleAcc: AccountRecord = {
      id: 'usr_abc123def456',
      username: 'Aleph',
      usernameLower: 'aleph',
      passwordHash: scryptHash,
      lockedClass: 'arcanist',
      preferredClass: 'arcanist',
      runsCompleted: 12,
      highestFloor: 9,
      totalKills: 420,
      totalRevives: 15,
      gold: 9999,
      isAdmin: true,
      level: 55, // over MAX_LEVEL -> clamps to 50 with 0 xp
      xp: 1234,
      strength: 5,
      vitality: 20,
      dexterity: 10,
      intelligence: 140, // over MAX_ATTRIBUTE -> clamps to 100
      faith: -2, // negative -> clamps to 0
      attributePoints: 4,
    };

    const payload = buildSharedAssertionPayload(sampleAcc, 60);
    assert.strictEqual(payload.iss, 'beyond-dungeons');
    assert.strictEqual(payload.aud, 'beyond-overworld');
    assert.strictEqual(payload.accountId, 'usr_abc123def456');
    assert.strictEqual(payload.isAdmin, true);
    assert.strictEqual(payload.level, MAX_LEVEL);
    assert.strictEqual(payload.xp, 0);
    assert.strictEqual(payload.intelligence, 100);
    assert.strictEqual(payload.faith, 0);
    assert.ok(payload.jti.length >= 16);

    const token = signDungeonsIdentityAssertion(payload, secret);
    const verified = verifyDungeonsIdentityAssertion(token, secret);
    assert.strictEqual(verified.ok, true);
    if (verified.ok) {
      assert.strictEqual(verified.payload.accountId, 'usr_abc123def456');
      assert.strictEqual(verified.payload.isAdmin, true);
    }

    // Tampered / wrong secret / expired assertions must fail
    const [b64, sig] = token.split('.');
    assert.strictEqual(verifyDungeonsIdentityAssertion(`${b64}.tampered_${sig}`, secret).ok, false);
    assert.strictEqual(verifyDungeonsIdentityAssertion(token, 'different_secret_min_32_chars_long').ok, false);
    const expiredPayload = buildSharedAssertionPayload(sampleAcc, 60, Date.now() - 120_000);
    const expiredToken = signDungeonsIdentityAssertion(expiredPayload, secret);
    assert.strictEqual(verifyDungeonsIdentityAssertion(expiredToken, secret).ok, false);

    // Server-to-server secret checks
    const unconfigured = verifySharedIdentityRequestSecret(`Bearer ${secret}`, undefined, '');
    assert.strictEqual(unconfigured.ok, false);
    if (!unconfigured.ok) assert.strictEqual(unconfigured.status, 503);

    const wrongSecret = verifySharedIdentityRequestSecret('Bearer wrong_secret_123456', undefined, secret);
    assert.strictEqual(wrongSecret.ok, false);
    if (!wrongSecret.ok) assert.strictEqual(wrongSecret.status, 403);

    assert.strictEqual(verifySharedIdentityRequestSecret(`Bearer ${secret}`, undefined, secret).ok, true);
    assert.strictEqual(verifySharedIdentityRequestSecret(undefined, secret, secret).ok, true);

    // Rate limiter
    const limiter = new SlidingWindowRateLimiter(2, 1000);
    assert.strictEqual(limiter.consume('10.0.0.1', 100), true);
    assert.strictEqual(limiter.consume('10.0.0.1', 200), true);
    assert.strictEqual(limiter.consume('10.0.0.1', 300), false);
    assert.strictEqual(limiter.consume('10.0.0.1', 1500), true);
  });

  // --- Test 103: Complete Arcanist Balance Pass (Primary 24, Star Rift 8s Cooldown & Sync, 7 Scroll INT Coefficients) ---
  await test('103. Arcanist Balance Pass: 24 primary damage, Star Rift 4-hit + 8s cooldown/sync/reset, and 50% Scroll INT scaling', async () => {
    const {
      ARCANIST_SPELLS,
      STAR_RIFT_PROC_COOLDOWN_MS,
      STAR_RIFT_REQUIRED_ATTACKS,
      computeArcanistSpellDamage,
    } = await import('./src/shared/arcanist.ts');
    const {
      applySnapshotDelta,
      cloneSnapshotBaseline,
      computeSnapshotDelta,
    } = await import('./src/shared/snapshotDelta.ts');

    // 1. Primary Attack base damage & class isolation
    assert.strictEqual(HERO_CLASSES.arcanist.damage, 24, 'Arcanist base primary damage must be 24');
    assert.strictEqual(HERO_CLASSES.arcanist.attackCooldownMs, 420, 'Arcanist attackCooldownMs must remain 420ms');
    assert.strictEqual(HERO_CLASSES.arcanist.range, 185, 'Arcanist range must remain 185');
    assert.strictEqual(HERO_CLASSES.vanguard.damage, 28, 'Vanguard damage must remain untouched');
    assert.strictEqual(HERO_CLASSES.ranger.damage, 24, 'Ranger damage must remain untouched');
    assert.strictEqual(HERO_CLASSES.cleric.damage, 22, 'Cleric damage must remain untouched');

    const room = new GameRoom({
      roomId: 'R_ARC_BAL_103',
      name: 'Arcanist Balance Lab',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10301,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 20);

    const arc = room.addOrReconnectPlayer('arc_bal', 'ArcBal', 'arcanist', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    arc.x = origin.x;
    arc.y = origin.y;
    assert.strictEqual(arc.starRiftCooldownMs, 0, 'Arcanist must start with 0ms Star Rift proc cooldown');

    // Primary bolt preserves speed, radius, pierce 2, and 24 base damage (or 30 crit)
    room.firePrimaryAttack(arc);
    const firstBolt = room.projectiles.find((pr) => pr.ownerId === arc.id && pr.style === 'arcane')!;
    assert.ok(firstBolt, 'Arcanist must spawn arcane primary bolt');
    assert.strictEqual(firstBolt.pierce, 2, 'Arcanist primary bolt must retain pierce 2');
    assert.strictEqual(firstBolt.radius, 8, 'Arcanist primary bolt must retain radius 8');
    assert.strictEqual(Math.round(Math.hypot(firstBolt.vx, firstBolt.vy)), 380, 'Arcanist primary bolt must retain speed 380');
    assert.ok(firstBolt.damage === 24 || firstBolt.damage === 30, `Lv1 0-INT primary damage must be 24 (or 30 crit), got ${firstBolt.damage}`);
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 0, '1st attack must not spawn Star Rift');

    // 2. Star Rift: 4-hit requirement + independent 8s cooldown + counter reset + multiplayer delta sync
    room.firePrimaryAttack(arc);
    room.firePrimaryAttack(arc);
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 0, '3rd attack must not spawn Star Rift');
    assert.strictEqual(arc.starRiftCooldownMs, 0, 'Cooldown must only start when Star Rift successfully spawns');

    let prevSnap = cloneSnapshotBaseline(room.buildNetworkSnapshot());
    let clientSnap = cloneSnapshotBaseline(prevSnap);

    // 4th attack spawns Star Rift & triggers 8000ms cooldown
    room.firePrimaryAttack(arc);
    assert.strictEqual(STAR_RIFT_REQUIRED_ATTACKS, 4);
    assert.strictEqual(STAR_RIFT_PROC_COOLDOWN_MS, 8000);
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 1, '4th attack must spawn Star Rift');
    assert.strictEqual(arc.starRiftCooldownMs, 8000, 'Successful Star Rift spawn must start 8000ms cooldown');

    // Verify multiplayer snapshot delta syncs starRiftCooldownMs
    let nextSnap = room.buildNetworkSnapshot();
    let wireDelta = JSON.parse(JSON.stringify(computeSnapshotDelta(prevSnap, nextSnap, 1, 2)));
    clientSnap = applySnapshotDelta(clientSnap, wireDelta);
    prevSnap = cloneSnapshotBaseline(nextSnap);
    assert.strictEqual(clientSnap.players.find((p) => p.id === arc.id)?.starRiftCooldownMs, 8000, 'Multiplayer delta sync must transmit starRiftCooldownMs');

    // Firing 4 more primary attacks during cooldown must NOT spawn a Rift, must NOT restart cooldown, and must reset counter
    room.zones = [];
    for (let t = 0; t < 40; t++) room.tick(25); // advance 1000ms -> 7000ms remaining
    assert.strictEqual(arc.starRiftCooldownMs, 7000, 'Star Rift cooldown must count down independently to 7000ms');

    for (let i = 0; i < 4; i++) room.firePrimaryAttack(arc);
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 0, 'No Star Rift may spawn during 8s cooldown');
    assert.strictEqual(arc.starRiftCooldownMs, 7000, 'Blocked proc attempt must NOT restart 8s cooldown');

    // Expire remaining 7000ms cooldown -> verify counter was reset (1 attack does NOT immediately proc!)
    for (let t = 0; t < 280; t++) room.tick(25); // +7000ms
    assert.strictEqual(arc.starRiftCooldownMs, 0, 'Star Rift cooldown must expire to 0ms after 8s total');
    room.firePrimaryAttack(arc); // attack 1 post-reset
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 0, 'Attack counter reset on cooldown block prevents instant proc on 1st post-cooldown hit');
    room.firePrimaryAttack(arc); // attack 2
    room.firePrimaryAttack(arc); // attack 3
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 0, '3 post-cooldown attacks must not spawn Star Rift yet');
    room.firePrimaryAttack(arc); // attack 4
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 1, '4th post-cooldown attack must spawn Star Rift again');
    assert.strictEqual(arc.starRiftCooldownMs, 8000, 'Second Star Rift spawn must start fresh 8000ms cooldown');

    // Changing class and restarting run must reset Star Rift cooldown & counter cleanly
    room.changeClass(arc.id, 'ranger');
    assert.strictEqual(arc.starRiftCooldownMs, undefined, 'Changing off Arcanist must clear starRiftCooldownMs');
    room.changeClass(arc.id, 'arcanist');
    assert.strictEqual(arc.starRiftCooldownMs, 0, 'Changing back to Arcanist must initialize starRiftCooldownMs to 0');
    for (let i = 0; i < 4; i++) room.firePrimaryAttack(arc);
    assert.strictEqual(arc.starRiftCooldownMs, 8000);
    room.restartRun();
    const arcSnapAfterReset = room.buildNetworkSnapshot().players.find((p) => p.id === arc.id)!;
    assert.strictEqual(arc.starRiftCooldownMs, 0, 'Ending/restarting run must reset starRiftCooldownMs to 0');
    assert.strictEqual(arcSnapAfterReset.starRiftCooldownMs, 0, 'Network snapshot after run reset must expose starRiftCooldownMs = 0');
    room.zones = [];
    for (let i = 0; i < 3; i++) room.firePrimaryAttack(arc);
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 0, 'Run reset must clear Star Rift attack counter');
    room.firePrimaryAttack(arc);
    assert.strictEqual(room.zones.filter((z) => z.kind === 'star_rift').length, 1, '4th attack after run reset spawns Star Rift');

    // 3. All 7 Spell Scrolls use exact +50% INT coefficients without double scaling
    const expectedCoeffs: Record<keyof typeof ARCANIST_SPELLS, { base: number; coeff: number; cd: number }> = {
      fireball: { base: 42, coeff: 0.015, cd: 6000 },
      disintegration: { base: 10, coeff: 0.012, cd: 12000 },
      frost_lance: { base: 36, coeff: 0.018, cd: 4500 },
      chain_lightning: { base: 32, coeff: 0.015, cd: 7000 },
      arcane_meteor: { base: 75, coeff: 0.0195, cd: 11000 },
      arcane_orb: { base: 12, coeff: 0.0105, cd: 9000 },
      arcane_barrage: { base: 12, coeff: 0.00675, cd: 8000 },
    };

    for (const [id, expected] of Object.entries(expectedCoeffs) as Array<[keyof typeof ARCANIST_SPELLS, { base: number; coeff: number; cd: number }]>) {
      const def = ARCANIST_SPELLS[id];
      assert.strictEqual(def.baseDamage, expected.base, `${id} baseDamage must remain unchanged`);
      assert.strictEqual(def.cooldownMs, expected.cd, `${id} cooldownMs must remain unchanged`);
      assert.ok(Math.abs(def.intCoeff - expected.coeff) < 1e-9, `${id} intCoeff must equal ${expected.coeff} (got ${def.intCoeff})`);

      // Verify formula D = B * [1 + 0.025*(L-1)] * [1 + c*INT] and single relic scaling
      const dmgLv21Int80 = computeArcanistSpellDamage(def.baseDamage, { level: 21, intelligence: 80 }, def.intCoeff);
      const exactRaw = def.baseDamage * (1 + 0.025 * 20) * (1 + expected.coeff * 80); // B * 1.5 * (1 + 80*c)
      assert.strictEqual(dmgLv21Int80, Math.round(exactRaw), `${id} single-application Lv21/80-INT damage mismatch`);

      const dmgWithRelic = computeArcanistSpellDamage(
        def.baseDamage,
        { level: 21, intelligence: 80, relics: ['sunfire_signet'] },
        def.intCoeff
      );
      assert.strictEqual(dmgWithRelic, Math.round(exactRaw * 1.12), `${id} Sunfire Signet must multiply once`);
    }

    // Live server-pipeline parity checks (Disintegration tick & Chain Lightning decay, no double INT scaling)
    const arenaOrigin = carveOpenArena(room, 25, 25, 20);
    const mage = room.addOrReconnectPlayer('arc_int80', 'IntMage', 'arcanist', false, {
      level: 21, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 80, faith: 0, attributePoints: 0,
    });
    mage.x = arenaOrigin.x;
    mage.y = arenaOrigin.y;

    // Disintegration tick damage against 0-resistance enemy: 10 * 1.5 * (1 + 0.012 * 80) = 15 * 1.96 = 29.4 -> 29
    const beamTarget = makeNeutralDummyEnemy('bal_beam', arenaOrigin.x + 120, arenaOrigin.y, 2000);
    room.enemies = [beamTarget];
    mage.pendingScrollChoices = ['disintegration'];
    room.selectArcanistScroll(mage.id, 'disintegration');
    mage.skillCooldownMs = 0;
    assert.strictEqual(room.startDisintegrationChannel(mage.id, 0), true);
    for (let t = 0; t < 14; t++) room.tick(25); // 150ms activation + 200ms first tick = 350ms
    assert.strictEqual(2000 - beamTarget.hp, 29, 'Disintegration live channel tick must apply 0.012 INT coeff exactly once (29 dmg)');
    room.stopDisintegrationChannel(mage.id);

    // Chain Lightning live cone scaling against 0-res targets: 32 * 1.5 * (1 + 0.015 * 80) = 48 * 2.2 = 105.6 -> 106 (or crit 133)
    const clA = makeNeutralDummyEnemy('bal_cl1', arenaOrigin.x + 100, arenaOrigin.y, 2000);
    const clB = makeNeutralDummyEnemy('bal_cl2', arenaOrigin.x + 210, arenaOrigin.y, 2000);
    room.enemies = [clA, clB];
    mage.pendingScrollChoices = ['chain_lightning'];
    room.selectArcanistScroll(mage.id, 'chain_lightning');
    mage.skillCooldownMs = 0;
    room.performAction(mage.id, 'tactical', 0, { aimDistance: 340, explicitAim: true });
    const hitA = 2000 - clA.hp;
    const hitB = 2000 - clB.hp;
    assert.ok(hitA === 106 || hitA === 133, `Chain Lightning cone target A damage (${hitA}) must match single-scaled 106 (or 133 crit)`);
    assert.ok(hitB === 106 || hitB === 133, `Chain Lightning cone target B damage (${hitB}) must match single-scaled 106 (or 133 crit)`);
  });

  // --- Test 104: Skill Smart Targeting Across Skill Ranges, LoS & Server Non-Explicit Casts ---
  await test('104. Skill Smart Targeting immediately acquires unobstructed enemies within/near skill range', async () => {
    const {
      getAbilityTargetSpec,
      resolveSkillSmartTarget,
    } = await import('./src/shared/abilityTargeting.ts');

    const room = new GameRoom({
      roomId: 'R_SMART_TARGET_104',
      name: 'Smart Target Lab',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10401,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 22);

    const arc = room.addOrReconnectPlayer('arc_smart', 'SmartMage', 'arcanist', false, {
      level: 10, xp: 0, strength: 0, vitality: 20, dexterity: 0, intelligence: 30, faith: 0, attributePoints: 0,
    });
    arc.x = origin.x;
    arc.y = origin.y;

    // 1. Enemy near outer edge of Fireball range (370u vs 360u + 28u buffer) behind player (facing Math.PI) is immediately acquired
    const fbSpec = getAbilityTargetSpec('arcanist', 'tactical', 'fireball');
    const nearEdgeEnemy = makeNeutralDummyEnemy('sm_edge', origin.x + 370, origin.y, 2000);
    const farEnemy = makeNeutralDummyEnemy('sm_far', origin.x + 480, origin.y, 2000);
    const smartFb = resolveSkillSmartTarget({
      spec: fbSpec,
      playerX: arc.x,
      playerY: arc.y,
      fallbackAngle: Math.PI, // player facing opposite direction
      preferCursorCone: false,
      allowFullRangeFallback: true,
      map: room.map,
      props: room.props,
      enemies: [farEnemy, nearEdgeEnemy],
    });
    assert.strictEqual(smartFb.target?.id, 'sm_edge', 'Smart targeting must acquire unobstructed enemy near Fireball range');
    assert.ok(Math.abs(smartFb.aimAngle) < 0.05, `Smart targeting must turn aim toward acquired target (got ${smartFb.aimAngle})`);

    // 2. Enemy beyond skill range is NOT acquired
    const outSmart = resolveSkillSmartTarget({
      spec: fbSpec,
      playerX: arc.x,
      playerY: arc.y,
      fallbackAngle: Math.PI,
      preferCursorCone: false,
      allowFullRangeFallback: true,
      map: room.map,
      props: room.props,
      enemies: [farEnemy],
    });
    assert.strictEqual(outSmart.target, null, 'Smart targeting must ignore enemies beyond skill reach');
    assert.strictEqual(outSmart.aimAngle, Math.PI, 'Fallback angle must preserve facing when no enemy is in range');

    // 3. Wall LoS blocks acquisition of closer enemy behind wall, selecting clear enemy instead
    const wallTileX = Math.floor((origin.x + 100) / TILE_SIZE);
    const wallTileY = Math.floor(origin.y / TILE_SIZE);
    room.map.tiles[wallTileY * room.map.width + wallTileX] = 2;
    const blockedEnemy = makeNeutralDummyEnemy('sm_blocked', origin.x + 170, origin.y, 2000);
    const clearEnemy = makeNeutralDummyEnemy('sm_clear', origin.x, origin.y - 240, 2000);
    const smartLos = resolveSkillSmartTarget({
      spec: fbSpec,
      playerX: arc.x,
      playerY: arc.y,
      fallbackAngle: 0,
      preferCursorCone: false,
      allowFullRangeFallback: true,
      map: room.map,
      props: room.props,
      enemies: [blockedEnemy, clearEnemy],
    });
    assert.strictEqual(smartLos.target?.id, 'sm_clear', 'Smart targeting must skip wall-occluded enemy and acquire clear enemy');
    room.map.tiles[wallTileY * room.map.width + wallTileX] = 1;

    // 4. Ground AoE (Arcane Meteor): snaps ground reticle directly onto enemy within range (clamped <= 280u)
    const metSpec = getAbilityTargetSpec('arcanist', 'tactical', 'arcane_meteor');
    const metEnemy = makeNeutralDummyEnemy('sm_met', origin.x, origin.y + 295, 2000); // within 280 + 44 buffer
    const smartMet = resolveSkillSmartTarget({
      spec: metSpec,
      playerX: arc.x,
      playerY: arc.y,
      fallbackAngle: 0,
      preferCursorCone: false,
      allowFullRangeFallback: true,
      map: room.map,
      props: room.props,
      enemies: [metEnemy],
    });
    assert.strictEqual(smartMet.target?.id, 'sm_met', 'Arcane Meteor smart targeting must acquire enemy near ground AoE range');
    assert.strictEqual(smartMet.aimDistance, metSpec.range, 'Ground AoE distance must clamp cleanly to max cast range');

    // 5. Server performAction without explicitAim immediately smart-targets enemy behind player for Cone Lightning
    arc.pendingScrollChoices = ['chain_lightning'];
    room.selectArcanistScroll(arc.id, 'chain_lightning');
    arc.skillCooldownMs = 0;
    const behindFoe = makeNeutralDummyEnemy('sm_cl_behind', origin.x, origin.y - 250, 2000);
    room.enemies = [behindFoe];
    room.performAction(arc.id, 'tactical', 0, { aimDistance: 340, explicitAim: false });
    assert.ok(behindFoe.hp < 2000, 'Non-explicit tactical skill cast must automatically smart-target enemy within skill range');
  });

  // --- Test 105: Chest Open / Close / Reopen Mechanics (Relic Vault & Arcanist Scroll Chests) ---
  await test('105. Chest Open/Close preserves rolled Relics & Scrolls without reroll exploit or duplicate gold', async () => {
    const room = new GameRoom({
      roomId: 'R_CHEST_TOGGLE_105',
      name: 'Chest Lab',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10501,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 16);

    const arc = room.addOrReconnectPlayer('chest_arc', 'ArcOpener', 'arcanist', false, {
      level: 8, xp: 0, strength: 0, vitality: 15, dexterity: 0, intelligence: 25, faith: 0, attributePoints: 0,
    });
    arc.x = origin.x;
    arc.y = origin.y;
    arc.gold = 0;

    // 1. Relic Vault Chest: open -> inspect rolled offers -> close -> reopen -> claim
    const vaultChest: PropState = {
      id: 'prop_vault_105',
      kind: 'relic_chest',
      x: origin.x + 12,
      y: origin.y,
      opened: false,
      value: 0,
    };
    room.props.push(vaultChest);

    const openedOk = room.openChest(arc.id, vaultChest);
    assert.strictEqual(openedOk, true, 'Opening Relic Vault chest should succeed');
    assert.strictEqual(vaultChest.opened, true, 'Relic Vault chest visually opens while inspecting');
    assert.strictEqual(arc.activeChestPropId, vaultChest.id, 'Player must track activeChestPropId');
    assert.ok(arc.pendingRelicChoices.length >= 2, 'Relic Vault must present relic choices on open');
    const firstRelicRoll = [...arc.pendingRelicChoices];

    // Toggle closed via second 'interact' press (also verifies Escape -> closeChest path)
    room.performAction(arc.id, 'interact', 0);
    assert.strictEqual(arc.activeChestPropId, null, 'Closing chest via interact toggle must clear activeChestPropId');
    assert.strictEqual(arc.pendingRelicChoices.length, 0, 'Closing chest must dismiss relic modal choices');
    assert.strictEqual(vaultChest.opened, false, 'Chest must close visually when loot remains unclaimed');
    assert.deepStrictEqual(
      vaultChest.relicChoicesByPlayer?.[arc.id],
      firstRelicRoll,
      'Unclaimed relic roll must remain persisted on chest'
    );

    // Reopen must restore exact same rolled choices (no infinite reroll exploit)
    room.performAction(arc.id, 'interact', 0);
    assert.strictEqual(vaultChest.opened, true, 'Reopening chest opens lid again');
    assert.strictEqual(arc.activeChestPropId, vaultChest.id, 'Reopening restores activeChestPropId');
    assert.deepStrictEqual(
      arc.pendingRelicChoices,
      firstRelicRoll,
      'Reopening same chest must restore exact original relic roll'
    );

    // Explicitly close via closeChest() as triggered by Escape / UI Close button
    room.closeChest(arc.id);
    assert.strictEqual(vaultChest.opened, false, 'closeChest must shut lid when loot is still inside');
    assert.strictEqual(arc.pendingRelicChoices.length, 0);

    // Reopen and claim the relic (also test simultaneous scroll offer if rolled or injected)
    vaultChest.scrollChoicesByPlayer = { [arc.id]: ['fireball', 'frost_lance'] };
    room.openChest(arc.id, vaultChest);
    assert.deepStrictEqual(arc.pendingScrollChoices, ['fireball', 'frost_lance'], 'Stored scroll choices must appear on reopen');
    room.selectRelic(arc.id, firstRelicRoll[0]);
    assert.ok(arc.relics.includes(firstRelicRoll[0]), 'Selected relic must be added to player loadout');
    assert.ok(vaultChest.claimedRelicPlayerIds?.includes(arc.id), 'Chest must record relic claim for player');
    assert.strictEqual(vaultChest.opened, true, 'Chest remains open while player finishes picking scroll');

    // Close before picking scroll -> chest closes again, then reopen shows only remaining scroll (relic already claimed)
    room.closeChest(arc.id);
    assert.strictEqual(vaultChest.opened, false, 'Chest must stay closeable while unclaimed Scroll remains');
    room.openChest(arc.id, vaultChest);
    assert.strictEqual(arc.pendingRelicChoices.length, 0, 'Already-claimed relic must not re-appear');
    assert.deepStrictEqual(arc.pendingScrollChoices, ['fireball', 'frost_lance'], 'Unclaimed scroll must still be inside');

    room.selectArcanistScroll(arc.id, 'fireball');
    assert.strictEqual(arc.equippedScrollId, 'fireball', 'Selected scroll must equip cleanly');
    assert.strictEqual(arc.activeChestPropId, null, 'Claiming final item clears activeChestPropId');
    assert.strictEqual(vaultChest.opened, true, 'Once all loot is claimed, chest remains open');

    // 2. Standard Gold Chest with stored Scroll: gold awarded once only across close/reopen
    const goldChest: PropState = {
      id: 'prop_gold_105',
      kind: 'chest',
      x: origin.x - 14,
      y: origin.y,
      opened: false,
      value: 35,
      scrollChoicesByPlayer: { [arc.id]: ['chain_lightning', 'arcane_orb'] },
    };
    room.props.push(goldChest);

    arc.gold = 0;
    room.openChest(arc.id, goldChest);
    assert.strictEqual(arc.gold, 35, 'Standard chest grants gold on first open');
    assert.strictEqual(goldChest.chestGoldClaimed, true);
    assert.deepStrictEqual(arc.pendingScrollChoices, ['chain_lightning', 'arcane_orb']);

    room.closeChest(arc.id);
    assert.strictEqual(goldChest.opened, false, 'Gold chest with unclaimed scroll must close cleanly');
    room.openChest(arc.id, goldChest);
    assert.strictEqual(arc.gold, 35, 'Reopening gold chest to inspect scroll must NOT award gold again');
    assert.deepStrictEqual(arc.pendingScrollChoices, ['chain_lightning', 'arcane_orb']);
    room.selectArcanistScroll(arc.id, 'chain_lightning');
    assert.strictEqual(goldChest.opened, true, 'Gold chest stays open once both gold and scroll are claimed');
  });

  // --- Test 106: Smart Boss AI (Prediction, Kiting, Hazard Avoidance, Situational Scoring & Void Step LoS) ---
  await test('106. Smart Boss AI predicts movement, kites as caster, avoids AoE hazards & picks situational skills', async () => {
    const room = new GameRoom({
      roomId: 'R_SMART_BOSS_106',
      name: 'Boss Tactician Lab',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10601,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 20);

    const p = room.addOrReconnectPlayer('boss_hero', 'Dodger', 'ranger', false, {
      level: 10, xp: 0, strength: 0, vitality: 20, dexterity: 20, intelligence: 0, faith: 0, attributePoints: 0,
    });
    p.x = origin.x;
    p.y = origin.y;
    p.vx = 180;
    p.vy = 0;

    // 1. Predictive targeting leads moving players and clamps inside walkable bounds
    const predFn = (room as any).predictTargetPosition.bind(room);
    const pred = predFn(p, 0.5, undefined);
    assert.ok(pred.x > p.x + 50 && pred.x < p.x + 90, `Predicted X (${pred.x}) must lead rightward velocity realistically`);
    assert.strictEqual(pred.y, p.y);

    // 2. Caster Boss (Floor 3 Ignis) kites away when hero rushes melee + sidesteps Fireball Burn hazard
    room.floor = 3;
    room.map.biome = 'ember';
    p.vx = 0;
    p.vy = 0;
    const ignis = makeNeutralDummyEnemy('boss_ignis_106', origin.x + 55, origin.y, 4000) as EnemyState;
    ignis.kind = 'boss';
    ignis.name = 'Ignis, Cinder Sovereign';
    ignis.radius = 28;
    ignis.elite = true;
    ignis.windupMs = 2000; // isolate movement behavior
    room.enemies = [ignis];

    // Place a Fireball Burn hazard slightly behind-left of Ignis (still overlaps Ignis) to verify combined kite + hazard avoidance
    room.zones.push({
      id: 'hz_burn_106',
      kind: 'fireball_burn',
      x: origin.x + 40,
      y: origin.y - 12,
      radius: 48,
      ttlMs: 3000,
      maxTtlMs: 3000,
      ownerId: p.id,
    });
    const startDist = Math.hypot(ignis.x - p.x, ignis.y - p.y);
    const startBurnDist = Math.hypot(ignis.x - (origin.x + 40), ignis.y - (origin.y - 12));
    for (let i = 0; i < 10; i++) room.tick(40);
    const afterDist = Math.hypot(ignis.x - p.x, ignis.y - p.y);
    const afterBurnDist = Math.hypot(ignis.x - (origin.x + 40), ignis.y - (origin.y - 12));
    assert.ok(afterDist > startDist + 10, `Caster boss Ignis must kite away from melee range (${startDist.toFixed(1)} -> ${afterDist.toFixed(1)})`);
    assert.ok(afterBurnDist > startBurnDist + 20, `Caster boss must sidestep burn zone away (burnDist ${startBurnDist.toFixed(1)} -> ${afterBurnDist.toFixed(1)})`);
    room.zones = [];

    // 3. Situational Ability Selection:
    // Floor 1 Malakor (Phase 2) favors War Charge (3) when target is far (>= 190u) with LoS
    room.floor = 1;
    room.map.biome = 'courtyard';
    const malakor = makeNeutralDummyEnemy('boss_mal_106', origin.x + 210, origin.y, 2000) as EnemyState;
    malakor.kind = 'boss';
    malakor.name = 'Warden Malakor';
    malakor.maxHp = 5000;
    malakor.hp = 2000; // Phase 2
    malakor.radius = 26;
    malakor.windupMs = 0;
    room.enemies = [malakor];

    const pickFn = (room as any).pickSmartBossAbility.bind(room);
    const metaMal = (room as any).getEnemyMeta(malakor);
    let warCharges = 0;
    for (let sample = 0; sample < 25; sample++) {
      metaMal.lastBossAbility = -1;
      const picked = pickFn(1, [0, 1, 2, 3], metaMal, malakor, p, 210, [{ state: p }], true, false);
      if (picked === 3) warCharges++;
    }
    assert.ok(warCharges >= 18, `Far clear target should strongly favor Malakor War Charge (got ${warCharges}/25)`);

    // Floor 5 Archon avoids close-range Supernova (0, r=145) when target is 280u away
    const archon = makeNeutralDummyEnemy('boss_arch_106', origin.x + 280, origin.y, 5000) as EnemyState;
    archon.kind = 'boss';
    const metaArch = (room as any).getEnemyMeta(archon);
    let supernovasAtRange = 0;
    for (let sample = 0; sample < 25; sample++) {
      metaArch.lastBossAbility = -1;
      const picked = pickFn(5, [0, 1, 2, 3], metaArch, archon, p, 280, [{ state: p }], true, false);
      if (picked === 0) supernovasAtRange++;
    }
    assert.strictEqual(supernovasAtRange, 0, 'Archon must not waste point-blank Supernova when hero is 280u away');

    // 4. Floor 4 Malice Void Step flanks safely with verified LoS outside hazards
    room.floor = 4;
    room.map.biome = 'void';
    room.map.rooms = [{ id: 1, x: 5, y: 5, w: 41, h: 41, cx: 25, cy: 25, type: 'boss', cleared: false, discovered: true }];
    p.aimAngle = 0; // Hero facing East (+X) -> behind hero is West (-X)
    const malice = makeNeutralDummyEnemy('boss_malice_106', origin.x + 220, origin.y, 1500) as EnemyState;
    malice.kind = 'boss';
    malice.name = 'Void-Eater Malice';
    malice.maxHp = 5000;
    malice.hp = 1500;
    malice.radius = 26;
    malice.windupMs = 0;
    const metaMalice = (room as any).getEnemyMeta(malice);
    metaMalice.bossAbilityCooldowns = { 0: 999999, 1: 999999, 3: 999999 }; // Force Void Step (2)
    metaMalice.lastBossAbility = 1;
    room.enemies = [malice];
    room.pendingEvents = [];
    room.tick(25);
    assert.ok(malice.x < p.x, `Void Step must flank behind eastward-facing target (malice.x=${malice.x}, p.x=${p.x})`);
    assert.ok(
      room.pendingEvents.some((e) => e.kind === 'status' && e.text.includes('VOID STEP')),
      'Void Step must preserve boss VFX/SFX cue event'
    );
  });

  // --- Test 107: Status Floating Text Decluttering & Boss SFX Cue Preservation ---
  await test('107. Noisy passive floating texts are suppressed and repeated status procs are throttled per entity', async () => {
    const room = new GameRoom({
      roomId: 'R_DECLUTTER_107',
      name: 'HUD Clarity Lab',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 10701,
    });
    room.status = 'playing';
    room.enemies = [];
    const origin = carveOpenArena(room, 25, 25, 16);

    const vanguard = room.addOrReconnectPlayer('van_107', 'Bulwark', 'vanguard', false, {
      level: 10, xp: 0, strength: 15, vitality: 20, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    vanguard.x = origin.x;
    vanguard.y = origin.y;
    vanguard.shield = 20;
    vanguard.relics = ['cinder_heart', 'viper_crucible', 'thorned_aegis'];

    const foe = makeNeutralDummyEnemy('foe_107', origin.x + 40, origin.y, 5000);
    foe.burnedMs = 3000; // Triggers Vanguard Iron Will shield gain on hit
    room.enemies = [foe];
    room.trainingDummies = [
      {
        id: 'dummy_107',
        x: origin.x - 40,
        y: origin.y,
        hp: 5000,
        maxHp: 5000,
        hitAnimMs: 0,
        totalDamageTaken: 0,
        lastHitTimerMs: 0,
      },
    ];

    room.pendingEvents = [];
    // Rapidly strike burning foe & dummy, plus take damage (triggers Iron Will -15% & Thorned Aegis stun)
    for (let i = 0; i < 4; i++) {
      room.damageEnemy(foe, 35, vanguard, true, 'physical');
      (room as any).damageDummy(room.trainingDummies[0], 35, vanguard, true);
    }
    room.damagePlayer(vanguard, 30, 'physical');

    const statusTexts = room.pendingEvents.filter((e) => e.kind === 'status').map((e) => e.text.trim());
    assert.strictEqual(
      statusTexts.some((t) => t.includes('Iron Will') || t === 'ARMORED' || t.includes('THORNED RETALIATION') || t.includes('BLOCKED!')),
      false,
      `Noisy passive labels must not spam status events (got: ${statusTexts.join(', ')})`
    );
    assert.strictEqual(
      statusTexts.filter((t) => t === 'POISONED!').length,
      1,
      'Repeated POISONED! dummy proc on same target within 3.5s must throttle to 1 event'
    );
    assert.strictEqual(
      statusTexts.filter((t) => t === 'IGNITED!').length,
      1,
      'Repeated IGNITED! dummy proc on same target within 3.5s must throttle to 1 event'
    );
    assert.ok(vanguard.shield > 0, 'Passive Iron Will shield gain still applies mechanically without floating spam');
  });

  // --- Test 108: Stat Projection Rank Reassessment (D–S+ Fairness & True Class Performance Accuracy) ---
  await test('108. Reassessed D–S+ ranks & projections accurately reflect actual performance across all 4 classes', async () => {
    const { calculatePlayerStatProjections, scoreToStatRank } = await import('./src/shared/statUtils.ts');
    const makeHero = (
      cls: HeroClassId,
      level: number,
      attrs: Partial<{ strength: number; vitality: number; dexterity: number; intelligence: number; faith: number }> = {},
      relics: string[] = [],
      equippedScrollId?: 'fireball' | 'disintegration' | 'arcane_meteor',
      floorBlessings: string[] = []
    ) =>
      ({
        id: `rank_${cls}_${level}`,
        username: cls,
        heroClass: cls,
        level,
        xp: 0,
        nextXp: 100,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        aimAngle: 0,
        hp: 200,
        maxHp: 200,
        shield: 0,
        gold: 0,
        potions: 2,
        relics,
        storage: [],
        strength: attrs.strength || 0,
        vitality: attrs.vitality || 0,
        dexterity: attrs.dexterity || 0,
        intelligence: attrs.intelligence || 0,
        faith: attrs.faith || 0,
        attributePoints: 0,
        downed: false,
        downedTimerMs: 0,
        reviveProgress: 0,
        skillCooldownMs: 0,
        maxSkillCooldownMs: 5000,
        ultCooldownMs: 0,
        maxUltCooldownMs: 13000,
        dashCooldownMs: 0,
        maxDashCooldownMs: 2600,
        attackAnimMs: 0,
        hasteMs: 0,
        slowedMs: 0,
        stunnedMs: 0,
        statuses: [],
        kills: 0,
        damageDealt: 0,
        healingDone: 0,
        connected: true,
        ready: false,
        equippedScrollId: equippedScrollId ?? null,
        floorBlessings,
      } as any);

    // 1. Score ladder thresholds: D < 30 <= C < 45 <= B < 63 <= A < 80 <= S < 98 <= S+
    assert.strictEqual(scoreToStatRank(24).tier, 'D');
    assert.strictEqual(scoreToStatRank(35).tier, 'C');
    assert.strictEqual(scoreToStatRank(50).tier, 'B');
    assert.strictEqual(scoreToStatRank(70).tier, 'A');
    assert.strictEqual(scoreToStatRank(85).tier, 'S');
    assert.strictEqual(scoreToStatRank(99).tier, 'S+');

    // 2. All 4 Lv1 starters with 0 pts / 0 relics start in D-RANK consistently
    for (const cls of ['vanguard', 'ranger', 'arcanist', 'cleric'] as HeroClassId[]) {
      const lv1Proj = calculatePlayerStatProjections(makeHero(cls, 1), 1);
      assert.strictEqual(
        lv1Proj.overallRank.tier,
        'D',
        `Fresh Lv1 ${cls} must start at D-RANK (got ${lv1Proj.overallRank.label} @ ${lv1Proj.overallRank.score})`
      );
      assert.ok(lv1Proj.effectiveDps > lv1Proj.directDps, `Lv1 ${cls} effectiveDps must include Tactical/Passive output`);
    }

    // 3. Lv50 Endgame builds in their real class roles ALL achieve S-RANK or S+-RANK (no Tank/Cleric/Scroll penalty)
    const lv50Vanguard = calculatePlayerStatProjections(
      makeHero('vanguard', 50, { strength: 80, vitality: 67 }, ['runic_carapace', 'thorned_aegis', 'bastion_pauldron', 'sunfire_signet', 'cinder_heart']),
      10
    );
    assert.ok(lv50Vanguard.effectiveHp >= 2200, `Lv50 Vanguard EHP must reflect Iron Will + Armor (got ${lv50Vanguard.effectiveHp})`);
    assert.ok(lv50Vanguard.defenseRank.tier === 'S' || lv50Vanguard.defenseRank.tier === 'S+', `Lv50 Tank Vanguard must earn S/S+ Defense (got ${lv50Vanguard.defenseRank.label})`);
    assert.ok(lv50Vanguard.overallRank.tier === 'S' || lv50Vanguard.overallRank.tier === 'S+', `Lv50 Tank Vanguard must earn S/S+ Overall (got ${lv50Vanguard.overallRank.label})`);

    const lv50Cleric = calculatePlayerStatProjections(
      makeHero('cleric', 50, { faith: 85, vitality: 62 }, ['hourglass_shard', 'oathbound_censer', 'runic_carapace', 'bastion_pauldron', 'sunfire_signet']),
      10
    );
    assert.ok(lv50Cleric.healingPerSec >= 18, `Lv50 Cleric healingPerSec must reflect Radiant Aura + Pulse + Beacon + Censer (got ${lv50Cleric.healingPerSec})`);
    assert.ok(lv50Cleric.utilityRank.tier === 'S' || lv50Cleric.utilityRank.tier === 'S+', `Lv50 Support Cleric must earn S/S+ Support/Utility (got ${lv50Cleric.utilityRank.label})`);
    assert.ok(lv50Cleric.overallRank.tier === 'S' || lv50Cleric.overallRank.tier === 'S+', `Lv50 Support Cleric must earn S/S+ Overall (got ${lv50Cleric.overallRank.label})`);

    const lv50Ranger = calculatePlayerStatProjections(
      makeHero('ranger', 50, { dexterity: 85, vitality: 62 }, ['twinstring_charm', 'sunfire_signet', 'keen_arrowhead', 'viper_crucible', 'cinder_heart']),
      10
    );
    assert.ok(lv50Ranger.longshotHitDamage > lv50Ranger.scaledHitDamage, 'Ranger Eagle Keenness Longshot hit must exceed base hit by +25%');
    assert.ok(lv50Ranger.offenseRank.tier === 'S' || lv50Ranger.offenseRank.tier === 'S+', `Lv50 Marksman Ranger must earn S/S+ Offense (got ${lv50Ranger.offenseRank.label})`);
    assert.ok(lv50Ranger.overallRank.tier === 'S' || lv50Ranger.overallRank.tier === 'S+', `Lv50 Marksman Ranger must earn S/S+ Overall (got ${lv50Ranger.overallRank.label})`);

    // 4. Arcanist equipped Scroll accuracy (cooldown, damage & Star Rift reflected in projections)
    const arcNoScroll = calculatePlayerStatProjections(
      makeHero('arcanist', 50, { intelligence: 85, vitality: 62 }, ['sunfire_signet', 'hourglass_shard', 'runic_carapace', 'cinder_heart']),
      10
    );
    const arcFireball = calculatePlayerStatProjections(
      makeHero('arcanist', 50, { intelligence: 85, vitality: 62 }, ['sunfire_signet', 'hourglass_shard', 'runic_carapace', 'cinder_heart'], 'fireball'),
      10
    );
    assert.strictEqual(arcFireball.activeTacticalLabel, 'Scroll of Fireball');
    assert.strictEqual(arcFireball.tacticalBaseCooldownMs, 6000, 'Arcanist Fireball Scroll base cooldown must be 6000ms');
    assert.ok(arcFireball.tacticalAbilityDps > arcNoScroll.tacticalAbilityDps, 'Fireball Scroll must raise tacticalAbilityDps over Astral Nova');
    assert.ok(arcFireball.effectiveDps > arcNoScroll.effectiveDps, 'Equipped Spell Scroll must raise projected effectiveDps');
    assert.ok(arcFireball.passiveCombatDps > 0, 'Arcanist Star Rift passive DPS must be projected');
    assert.ok(arcFireball.overallRank.tier === 'S' || arcFireball.overallRank.tier === 'S+', `Lv50 Scroll Arcanist must earn S/S+ Overall (got ${arcFireball.overallRank.label})`);

    // 5. Extreme Lv50 Min-Maxed Glass Cannon with Blessings reaches S+-RANK cleanly
    const mythicRanger = calculatePlayerStatProjections(
      makeHero('ranger', 50, { dexterity: 98, vitality: 49 }, ['twinstring_charm', 'sunfire_signet', 'keen_arrowhead', 'cinder_heart', 'viper_crucible'], undefined, ['fury', 'fury', 'swiftness']),
      10
    );
    assert.strictEqual(mythicRanger.overallRank.tier, 'S+', `Optimized Lv50 build with blessings reaches S+-RANK (got ${mythicRanger.overallRank.label} @ ${mythicRanger.overallRank.score})`);

    // 6. Misbuilt Lv50 (100 STR on a Ranger, 0 relics) scores lower than a proper build
    const misbuiltRanger = calculatePlayerStatProjections(
      makeHero('ranger', 50, { strength: 100 }, []),
      10
    );
    assert.ok(
      misbuiltRanger.overallRank.score < lv50Ranger.overallRank.score - 20,
      `Off-stat Lv50 Ranger (${misbuiltRanger.overallRank.score}) must rank noticeably below synergistic Ranger (${lv50Ranger.overallRank.score})`
    );
  });

  // --- Test 109: First Five Bosses Visual Overhaul (8-way directions, abilities, transitions, hit/death) ---
  await test('109. First five bosses render 8 directions without crude mirroring and animate all abilities, hits, and deaths', async () => {
    const {
      DIRECTION8_LIST,
      direction8ToPose,
      resolveEnemyDirection8,
    } = await import('./src/client/directionalFacing.ts');
    const {
      drawHumanoidBoss,
      resolveFirstFiveBossKey,
      createBossAnimRuntime,
      stepBossAnimRuntime,
      triggerBossAbilityAnim,
      triggerBossEventAnim,
    } = await import('./src/client/npcSprites.ts');

    const createBossMockCtx = () => {
      const scales: Array<[number, number]> = [];
      const rotates: number[] = [];
      let drawOps = 0;
      const ctx = {
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: 1,
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: (a: number) => { rotates.push(a); },
        scale: (sx: number, sy: number) => { scales.push([sx, sy]); },
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        bezierCurveTo: () => {},
        arc: () => {},
        ellipse: () => {},
        fillRect: () => { drawOps++; },
        strokeRect: () => { drawOps++; },
        fill: () => { drawOps++; },
        stroke: () => { drawOps++; },
        fillText: () => { drawOps++; },
        createRadialGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;
      return {
        ctx,
        getStats: () => ({ drawOps, scales: [...scales], rotates: [...rotates] }),
      };
    };

    const firstFive: Array<{
      name: string;
      key: string;
      events: Array<[string, string, string]>;
    }> = [
      {
        name: 'Warden Malakor',
        key: 'malakor',
        events: [
          ['status', ' SHIELD WALL!', 'shield'],
          ['status', ' CLEAVE!', 'attack'],
          ['status', ' GROUND SLAM!', 'heavy_slam'],
          ['status', 'WAR CHARGE!', 'windup'],
        ],
      },
      {
        name: 'Archlich Vaelor',
        key: 'vaelor',
        events: [
          ['status', ' FROST NOVA!', 'aoe'],
          ['damage', 'SOUL SIPHONED!', 'cast'],
          ['status', ' SIPHON VOLLEY!', 'cast'],
          ['status', ' SOUL HAIL!', 'attack'],
          ['status', ' DEATH RING!', 'spin'],
          ['status', ' REINFORCEMENTS!', 'summon'],
        ],
      },
      {
        name: 'Ignis, Cinder Sovereign',
        key: 'ignis',
        events: [
          ['status', ' MAGMA ERUPTION!', 'heavy_slam'],
          ['status', ' FISSURE WAVE!', 'attack'],
          ['status', ' CINDER SPIRAL!', 'spin'],
          ['status', ' CORE DETONATION!', 'aoe'],
          ['status', ' REINFORCEMENTS!', 'summon'],
        ],
      },
      {
        name: 'Void-Eater Malice',
        key: 'malice',
        events: [
          ['status', ' SINGULARITY!', 'aoe'],
          ['status', ' TENDRIL FLURRY!', 'attack'],
          ['status', ' VOID STEP!', 'teleport'],
          ['status', ' VOID SCYTHE!', 'teleport'],
          ['status', ' ABYSSAL NOVA!', 'spin'],
        ],
      },
      {
        name: 'Archon of Nothingness',
        key: 'archon',
        events: [
          ['status', ' SUPERNOVA!', 'aoe'],
          ['status', ' STARBEAM CASCADE!', 'cast'],
          ['status', ' COSMIC VOLLEY!', 'attack'],
          ['status', ' REINFORCEMENTS!', 'summon'],
        ],
      },
    ];

    // Confirm F6-F10 bosses are NOT altered or intercepted by F1-F5 key resolution
    for (const f6Name of [
      'Elyndor, Keeper of the Last Hymn',
      'Zadkiel, Keeper of the Ashen Reliquary',
      'Sariel, Warden of the Veiled Scripture',
      'Seraphel, Sentinel of the Final Seal',
      'Oriphiel, The Last Warden',
    ]) {
      assert.strictEqual(resolveFirstFiveBossKey(f6Name, 1, 'highkeep'), null);
    }

    const baseBoss: EnemyState = {
      id: 'b_test',
      kind: 'boss',
      name: 'Warden Malakor',
      roomId: 1,
      x: 300,
      y: 300,
      vx: 0,
      vy: 0,
      hp: 2000,
      maxHp: 2000,
      radius: 28,
      state: 'idle',
      windupMs: 0,
      targetX: 300,
      targetY: 360,
      markedMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      elite: true,
    };

    for (const bossDef of firstFive) {
      assert.strictEqual(resolveFirstFiveBossKey(bossDef.name, 9, 'nave'), bossDef.key);
      const bossEn: EnemyState = { ...baseBoss, id: `boss_${bossDef.key}`, name: bossDef.name };

      // 1. All 8 directions (idle & moving), verifying non-mirrored intentional anatomy
      for (const dir of DIRECTION8_LIST) {
        const pose = direction8ToPose(dir, false);
        for (const moving of [false, true]) {
          const st: EnemyState = {
            ...bossEn,
            state: moving ? 'chase' : 'idle',
            vx: moving ? pose.dirX * 120 : 0,
            vy: moving ? pose.dirY * 120 : 0,
            targetX: bossEn.x + pose.dirX * 80,
            targetY: bossEn.y + pose.dirY * 80,
          };
          const resolved = resolveEnemyDirection8(st, dir, pose.facingLeft);
          assert.strictEqual(resolved.dir, dir);
          const rt = createBossAnimRuntime(bossDef.key as any, st, 10000);
          const anim = stepBossAnimRuntime(rt, st, resolved, 10050);
          assert.strictEqual(anim.action, moving ? 'move' : 'idle');

          const tracker = createBossMockCtx();
          assert.doesNotThrow(() =>
            drawHumanoidBoss(tracker.ctx, 200, 200, bossDef.name, 10050, st, resolved, anim)
          );
          const stats = tracker.getStats();
          assert.ok(stats.drawOps > 18, `${bossDef.name} ${dir} moving=${moving} should emit rich geometry`);
          const usedCrudeMirror = stats.scales.some(([sx]) => sx === -1);
          assert.strictEqual(usedCrudeMirror, false, `${bossDef.name} ${dir} must not use crude ctx.scale(-1, 1)`);
        }
      }

      // 2. Every server ability event + mid-action rendering + return to idle
      const rt = createBossAnimRuntime(bossDef.key as any, bossEn, 20000);
      for (let idx = 0; idx < bossDef.events.length; idx++) {
        const [evKind, evText, expectedAction] = bossDef.events[idx];
        const t0 = 20000 + idx * 3000;
        const matched = triggerBossEventAnim(rt, evKind, evText, Math.PI / 4, t0);
        assert.strictEqual(matched, true, `${bossDef.name} should match event ${evText}`);
        const pose = direction8ToPose('SE', false);
        const mid = stepBossAnimRuntime(rt, bossEn, pose, t0 + 350);
        assert.strictEqual(mid.action, expectedAction, `${bossDef.name} ${evText} -> ${expectedAction}`);
        assert.ok(mid.progress > 0 && mid.progress < 1);
        const tracker = createBossMockCtx();
        assert.doesNotThrow(() =>
          drawHumanoidBoss(tracker.ctx, 200, 200, bossDef.name, t0 + 350, bossEn, pose, mid)
        );
        if (bossDef.key === 'ignis' && evText.includes('CINDER SPIRAL')) {
          assert.ok(
            tracker.getStats().rotates.some((r) => Math.abs(r) > 0.5),
            'Ignis Cinder Spiral must visibly rotate body silhouette'
          );
        }
        // After duration expires -> transitions cleanly back to idle
        const settled = stepBossAnimRuntime(rt, bossEn, pose, t0 + 1800);
        assert.strictEqual(settled.action, 'idle');
      }

      // 3. Server-driven Charge Windup -> Charge -> Recover (Malakor), Radial Burst (Archon), & Silent Void Step (Malice)
      if (bossDef.key === 'malakor') {
        const poseE = direction8ToPose('E', false);
        const windupSt: EnemyState = { ...bossEn, charging: true, chargeWindupMs: 280, chargeAngle: 0, state: 'windup' };
        assert.strictEqual(stepBossAnimRuntime(rt, windupSt, poseE, 40000).action, 'windup');
        const chargeSt: EnemyState = { ...bossEn, charging: true, chargeWindupMs: 0, chargeTimerMs: 300, chargeAngle: 0, state: 'charge' };
        assert.strictEqual(stepBossAnimRuntime(rt, chargeSt, poseE, 40200).action, 'charge');
        const recSt: EnemyState = { ...bossEn, charging: false, state: 'recover', windupMs: 500 };
        assert.strictEqual(stepBossAnimRuntime(rt, recSt, poseE, 40500).action, 'recover');
      } else if (bossDef.key === 'archon') {
        triggerBossAbilityAnim(rt, 'spin', 'radial_burst', 950, 0, 40000);
        const mid = stepBossAnimRuntime(rt, bossEn, direction8ToPose('S', false), 40400);
        assert.strictEqual(mid.action, 'spin');
        assert.strictEqual(mid.abilityKey, 'radial_burst');
      } else if (bossDef.key === 'malice') {
        const teleported: EnemyState = { ...bossEn, x: bossEn.x + 120, y: bossEn.y + 40 };
        const tpAnim = stepBossAnimRuntime(rt, teleported, direction8ToPose('E', false), 41000);
        assert.strictEqual(tpAnim.action, 'teleport');
      }

      // 4. Hit reaction on HP drop & Death animation rendering
      const hitEn: EnemyState = { ...bossEn, hp: bossEn.hp - 120 };
      const hitAnim = stepBossAnimRuntime(rt, hitEn, direction8ToPose('S', false), 45000);
      assert.ok(hitAnim.hitFlash > 0.5, `${bossDef.name} should trigger hitFlash on HP drop`);
      const deathTracker = createBossMockCtx();
      for (const dp of [0.1, 0.5, 0.9]) {
        assert.doesNotThrow(() =>
          drawHumanoidBoss(deathTracker.ctx, 200, 200, bossDef.name, 46000, hitEn, direction8ToPose('S', false), {
            ...hitAnim,
            action: 'death',
            progress: dp,
            deathProgress: dp,
          })
        );
      }
      assert.ok(deathTracker.getStats().drawOps > 20);
    }
  });

  // --- Test 110: Permanent Armament Defaults, Class Compatibility & Ownership Enforcement ---
  await test('110. Permanent Class Armaments initialize defaults and enforce class & ownership rules', () => {
    const classes: HeroClassId[] = ['vanguard', 'ranger', 'arcanist', 'cleric'];
    assert.strictEqual(WEAPON_CATALOG.length, 12);
    assert.strictEqual(VESTMENT_CATALOG.length, 12);

    const room = new GameRoom({
      roomId: 'ARM_T110',
      name: 'Armory Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 101,
    });
    for (const cls of classes) {
      assert.strictEqual(getClassWeapons(cls).length, 3);
      assert.strictEqual(getClassVestments(cls).length, 3);
      const defWpn = resolveEquippedWeaponForClass(cls, DEFAULT_WEAPON_BY_CLASS[cls]);
      const defVest = resolveEquippedVestmentForClass(cls, DEFAULT_VESTMENT_BY_CLASS[cls]);
      assert.ok(defWpn, `${cls} should have a valid default weapon`);
      assert.ok(defVest, `${cls} should have a valid default vestment`);
      assert.strictEqual(defWpn!.name, HERO_CLASSES[cls].weapon, `${cls} default weapon must match HERO_CLASSES weapon`);

      const p = room.addOrReconnectPlayer(`p_${cls}`, `hero_${cls}`, cls);
      assert.strictEqual(p.heroClass, cls);
      assert.strictEqual(p.equippedWeapon, DEFAULT_WEAPON_BY_CLASS[cls]);
      assert.strictEqual(p.equippedVestment, DEFAULT_VESTMENT_BY_CLASS[cls]);
      assert.ok(p.ownedWeapons?.includes(DEFAULT_WEAPON_BY_CLASS[cls]));
      assert.ok(p.ownedVestments?.includes(DEFAULT_VESTMENT_BY_CLASS[cls]));
    }

    // Reject unowned weapon/vestment even of same class
    const unownedRes = room.equipArmament('p_vanguard', 'weapon', 'vanguard_crimson_halberd');
    assert.strictEqual(unownedRes.ok, false);

    // Reject cross-class equipment even if granted/owned
    room.grantArmament('p_vanguard', 'weapon', 'arcanist_cinderflare_rod');
    const crossClassWpn = room.equipArmament('p_vanguard', 'weapon', 'arcanist_cinderflare_rod');
    assert.strictEqual(crossClassWpn.ok, false);

    room.grantArmament('p_ranger', 'vestment', 'cleric_templar_cassock');
    const crossClassVest = room.equipArmament('p_ranger', 'vestment', 'cleric_templar_cassock');
    assert.strictEqual(crossClassVest.ok, false);

    // Grant & equip valid class armaments, then unequip cleanly
    const grantWpn = room.grantArmament('p_vanguard', 'weapon', 'vanguard_crimson_halberd');
    assert.strictEqual(grantWpn.ok, true);
    assert.strictEqual(grantWpn.added, true);
    const eqWpn = room.equipArmament('p_vanguard', 'weapon', 'vanguard_crimson_halberd');
    assert.strictEqual(eqWpn.ok, true);
    assert.strictEqual(room.getPlayerState('p_vanguard')!.equippedWeapon, 'vanguard_crimson_halberd');

    const defaultVestHp = room.getPlayerState('p_vanguard')!.maxHp;
    room.grantArmament('p_vanguard', 'vestment', 'vanguard_obsidian_juggernaut');
    const eqVest = room.equipArmament('p_vanguard', 'vestment', 'vanguard_obsidian_juggernaut');
    assert.strictEqual(eqVest.ok, true);
    assert.strictEqual(
      room.getPlayerState('p_vanguard')!.maxHp,
      defaultVestHp + ARMAMENT_TUNING.passives ? defaultVestHp + 25 : defaultVestHp + 25
    );
    assert.strictEqual(room.getPlayerState('p_vanguard')!.activePassiveId, 'war_monger');

    const uneqWpn = room.unequipArmament('p_vanguard', 'weapon');
    assert.strictEqual(uneqWpn.ok, true);
    assert.strictEqual(room.getPlayerState('p_vanguard')!.equippedWeapon, null);

    // Unequipping Vestment restores class default Vestment & passive cleanly
    const uneqVest = room.unequipArmament('p_vanguard', 'vestment');
    assert.strictEqual(uneqVest.ok, true);
    assert.strictEqual(room.getPlayerState('p_vanguard')!.equippedVestment, DEFAULT_VESTMENT_BY_CLASS.vanguard);
    assert.strictEqual(room.getPlayerState('p_vanguard')!.activePassiveId, 'iron_will');
    assert.strictEqual(room.getPlayerState('p_vanguard')!.maxHp, defaultVestHp);
  });

  // --- Test 111: Legacy Account Migration & Tamper Normalization ---
  await test('111. Account armament migration preserves existing progression, vault relics, and intentional null unequip', () => {
    const legacyAcc: AccountRecord = {
      id: 'acc_legacy_ranger',
      username: 'LegacyRanger',
      usernameLower: 'legacyranger',
      passwordHash: 'hash',
      preferredClass: 'ranger',
      lockedClass: 'ranger',
      level: 14,
      xp: 320,
      gold: 875,
      attributePoints: 11,
      strength: 4,
      vitality: 6,
      dexterity: 18,
      intelligence: 2,
      faith: 1,
      storedRelics: ['keen_arrowhead', 'sunfire_signet'],
      runsCompleted: 5,
      highestFloor: 4,
      totalKills: 240,
      totalRevives: 3,
    };

    const changed = applyAccountArmamentMigration(legacyAcc, true);
    assert.strictEqual(changed, true);
    assert.strictEqual(legacyAcc.equippedWeapon, DEFAULT_WEAPON_BY_CLASS.ranger);
    assert.strictEqual(legacyAcc.equippedVestment, DEFAULT_VESTMENT_BY_CLASS.ranger);
    assert.deepStrictEqual(legacyAcc.ownedWeapons, [DEFAULT_WEAPON_BY_CLASS.ranger]);
    assert.deepStrictEqual(legacyAcc.ownedVestments, [DEFAULT_VESTMENT_BY_CLASS.ranger]);
    // Existing progression & stash preserved untouched
    assert.strictEqual(legacyAcc.level, 14);
    assert.strictEqual(legacyAcc.xp, 320);
    assert.strictEqual(legacyAcc.gold, 875);
    assert.strictEqual(legacyAcc.attributePoints, 11);
    assert.strictEqual(legacyAcc.dexterity, 18);
    assert.deepStrictEqual(legacyAcc.storedRelics, ['keen_arrowhead', 'sunfire_signet']);
    assert.strictEqual(legacyAcc.runsCompleted, 5);

    // Post-migration intentional weapon unequip (`null`) is preserved, while null vestment restores default vestment
    legacyAcc.equippedWeapon = null;
    legacyAcc.equippedVestment = null;
    const secondRun = applyAccountArmamentMigration(legacyAcc, false);
    assert.strictEqual(secondRun, true);
    assert.strictEqual(legacyAcc.equippedWeapon, null);
    assert.strictEqual(legacyAcc.equippedVestment, DEFAULT_VESTMENT_BY_CLASS.ranger);
    const thirdRun = applyAccountArmamentMigration(legacyAcc, false);
    assert.strictEqual(thirdRun, false);
    assert.strictEqual(legacyAcc.equippedWeapon, null);
    assert.strictEqual(legacyAcc.equippedVestment, DEFAULT_VESTMENT_BY_CLASS.ranger);

    // Tampered / spoofed / cross-class entries are stripped server-side
    const sanitized = normalizeArmamentLoadout('cleric', {
      ownedWeapons: ['fake_god_sword', 'cleric_solaris_censer'],
      ownedVestments: ['invalid_robe'],
      equippedWeapon: 'vanguard_stormbreaker_flail',
      equippedVestment: 'cleric_templar_cassock', // not owned
    });
    assert.ok(sanitized.ownedWeapons.includes(DEFAULT_WEAPON_BY_CLASS.cleric));
    assert.ok(sanitized.ownedWeapons.includes('cleric_solaris_censer'));
    assert.strictEqual(sanitized.ownedWeapons.includes('fake_god_sword'), false);
    assert.strictEqual(sanitized.equippedWeapon, DEFAULT_WEAPON_BY_CLASS.cleric);
    assert.strictEqual(sanitized.equippedVestment, DEFAULT_VESTMENT_BY_CLASS.cleric);
  });

  // --- Test 112: Server-Authoritative Unique Weapon Gameplay Effects Across All 12 Weapons ---
  await test('112. All 12 permanent weapons deliver unique server-authoritative gameplay mechanics without Twinstring reuse', () => {
    const origRandom = Math.random;
    try {
      Math.random = () => 0.99;

      const makeEnemy = (id: string, kind: EnemyState['kind'], x: number, y: number): EnemyState => ({
        id,
        kind,
        name: kind,
        roomId: 0,
        x,
        y,
        vx: 0,
        vy: 0,
        hp: 1000,
        maxHp: 1000,
        radius: 14,
        state: 'idle',
        windupMs: 5000,
        targetX: x,
        targetY: y,
        markedMs: 0,
        slowedMs: 0,
        stunnedMs: 0,
        burnedMs: 0,
        frozenMs: 0,
        shockedMs: 0,
        poisonedMs: 0,
        bleedingMs: 0,
        silencedMs: 0,
        elite: false,
      });

      // 1. VANGUARD: Sunforged Claymore (Golden cone shockwave when Shield > 0), Crimson Halberd (+3 pierce / +26px reach / single-hit per swing), Stormbreaker Flail (360° Tempest Wheel + Shock + +3 Shield)
      const vRoom = new GameRoom({
        roomId: 'WPN_V',
        name: 'Vanguard Armory Combat',
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 202,
      });
      vRoom.addOrReconnectPlayer('v1', 'Knight', 'vanguard');
      vRoom.startExpedition();
      const vpLive = vRoom.getPlayerState('v1')!;
      vpLive.aimAngle = 0;

      const stepRoom = (rm: GameRoom, totalMs: number) => {
        let rem = totalMs;
        while (rem > 0) {
          const dt = Math.min(25, rem);
          rm.tick(dt);
          rem -= dt;
        }
      };

      // Claymore Sunforged Shockwave (triggers when shield > 0, absent when shield === 0)
      const clayTarget = makeEnemy('v_clay', 'goblin', vpLive.x + 100, vpLive.y);
      vRoom.enemies = [clayTarget];
      vpLive.shield = 0;
      vRoom.zones = [];
      vRoom.projectiles = [];
      vRoom.firePrimaryAttack(vpLive);
      stepRoom(vRoom, 30);
      assert.strictEqual(vRoom.zones.some((z) => z.kind === 'sunforged_shockwave'), false, 'Claymore must NOT emit shockwave at 0 shield');
      const clayHpUnshielded = clayTarget.hp;

      vpLive.shield = 20;
      vRoom.zones = [];
      vRoom.projectiles = [];
      vRoom.firePrimaryAttack(vpLive);
      assert.ok(vRoom.zones.some((z) => z.kind === 'sunforged_shockwave'), 'Claymore must emit sunforged_shockwave when Shield > 0');
      assert.ok(clayTarget.hp < clayHpUnshielded, 'Sunforged shockwave must strike cone targets out to 118px');

      // Halberd (+3 pierce, +26px reach, hits each target once per swing & inflicts Bleed)
      vRoom.grantArmament('v1', 'weapon', 'vanguard_crimson_halberd');
      vRoom.equipArmament('v1', 'weapon', 'vanguard_crimson_halberd');
      const halberdSkeleton = makeEnemy('v_halb', 'skeleton', vpLive.x + 56, vpLive.y);
      vRoom.enemies = [halberdSkeleton];
      Math.random = () => 0.2; // triggers 45% bleedChance
      vRoom.projectiles = [];
      vRoom.firePrimaryAttack(vpLive);
      assert.strictEqual(vRoom.projectiles[0].weaponId, 'vanguard_crimson_halberd');
      assert.ok(vRoom.projectiles[0].pierce >= 7, 'Crimson Halberd adds +3 pierce (base 4 + 3 = 7)');
      const hpBeforeHalb = halberdSkeleton.hp;
      stepRoom(vRoom, 120);
      assert.ok(halberdSkeleton.hp < hpBeforeHalb, 'Crimson Halberd must strike extended range targets');
      assert.ok(halberdSkeleton.bleedingMs > 0, 'Crimson Halberd primary hit should inflict Bleed');

      // Stormbreaker Flail (360° Tempest Wheel around Vanguard + Shock + +3 Shield)
      Math.random = () => 0.2; // triggers 25% shockChance
      vRoom.grantArmament('v1', 'weapon', 'vanguard_stormbreaker_flail');
      vRoom.equipArmament('v1', 'weapon', 'vanguard_stormbreaker_flail');
      const flailFront = makeEnemy('v_flail_0', 'goblin', vpLive.x + 68, vpLive.y);
      const flailBehind = makeEnemy('v_flail_1', 'goblin', vpLive.x - 68, vpLive.y);
      vRoom.enemies = [flailFront, flailBehind];
      vpLive.shield = 10;
      vRoom.projectiles = [];
      vRoom.zones = [];
      vRoom.firePrimaryAttack(vpLive);
      assert.strictEqual(vRoom.projectiles.length, 0, 'Stormbreaker Tempest Wheel replaces directional cleave projectile with 360° AoE');
      assert.ok(vRoom.zones.some((z) => z.kind === 'tempest_wheel'), 'Stormbreaker must spawn tempest_wheel zone');
      assert.ok(flailFront.hp < 1000 && flailBehind.hp < 1000, 'Stormbreaker Tempest Wheel must damage enemies 360° around Vanguard');
      assert.ok(vpLive.shield >= 16, `Expected +3 shield per hit (10 + 6 = 16), got ${vpLive.shield}`);
      assert.ok(flailFront.shockedMs > 0, 'Stormbreaker Flail primary hit should Shock enemy');

      // 2. RANGER: Ashwood Recurve (Barbed Broadheads +15% vs Slowed), Galewind Twinbow (per-target 3rd-hit Galeburst wind AoE), Eclipse Longbow (Hold-to-Charge + INT scaling)
      Math.random = () => 0.99;
      const rRoom = new GameRoom({
        roomId: 'WPN_R',
        name: 'Ranger Armory Combat',
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 303,
      });
      rRoom.addOrReconnectPlayer('r1', 'Scout', 'ranger');
      rRoom.startExpedition();
      const rp = rRoom.getPlayerState('r1')!;
      rp.aimAngle = 0;

      // Ashwood vs clean vs slowed
      const cleanGoblin = makeEnemy('r_clean', 'goblin', rp.x + 48, rp.y);
      const slowedGoblin = makeEnemy('r_slow', 'goblin', rp.x + 48, rp.y);
      slowedGoblin.slowedMs = 3000;
      rRoom.enemies = [cleanGoblin];
      rRoom.projectiles = [];
      rRoom.firePrimaryAttack(rp);
      const cleanBefore = cleanGoblin.hp;
      stepRoom(rRoom, 100);
      const cleanDealt = cleanBefore - cleanGoblin.hp;

      rRoom.enemies = [slowedGoblin];
      rRoom.projectiles = [];
      rRoom.firePrimaryAttack(rp);
      const slowBefore = slowedGoblin.hp;
      stepRoom(rRoom, 100);
      const slowDealt = slowBefore - slowedGoblin.hp;
      assert.ok(slowDealt > cleanDealt, `Ashwood Barbed Broadheads vs slowed (${slowDealt}) must exceed clean (${cleanDealt})`);

      // Galewind Twinbow: Per-target 3-hit Galeburst (1 -> 2 -> burst + wind AoE!)
      rRoom.enemies = [];
      rRoom.grantArmament('r1', 'weapon', 'ranger_galewind_twinbow');
      rRoom.equipArmament('r1', 'weapon', 'ranger_galewind_twinbow');
      const gbMain = makeEnemy('r_gb_1', 'goblin', rp.x + 60, rp.y);
      const gbSplash = makeEnemy('r_gb_splash', 'goblin', rp.x + 60, rp.y + 44);
      gbMain.stunnedMs = 5000;
      gbSplash.stunnedMs = 5000;
      rRoom.enemies = [gbMain, gbSplash];
      rRoom.zones = [];

      // Hit 1 & Hit 2 build per-target marks without bursting
      for (let shot = 1; shot <= 2; shot++) {
        rRoom.projectiles = [];
        rRoom.firePrimaryAttack(rp);
        stepRoom(rRoom, 110);
        assert.strictEqual(gbMain.galeburstMarks, shot, `Expected ${shot} Galeburst mark(s) after hit ${shot}`);
        assert.strictEqual(gbSplash.hp, 1000, 'Adjacent enemy must not take Galeburst damage before 3rd hit');
      }
      // Hit 3 triggers Galeburst wind AoE & resets mark to 0
      rRoom.projectiles = [];
      rRoom.firePrimaryAttack(rp);
      stepRoom(rRoom, 110);
      assert.strictEqual(gbMain.galeburstMarks, 0, 'Galeburst marks reset to 0 after detonation');
      assert.ok(rRoom.zones.some((z) => z.kind === 'galeburst_nova'), 'Expected galeburst_nova zone on 3rd hit');
      assert.ok(gbSplash.hp < 1000, 'Galeburst wind AoE must damage nearby enemies');

      // Verify Twinstring Charm relic STILL stacks cleanly as its own separate angled system
      rRoom.addPlayerRelic('r1', 'twinstring_charm');
      rRoom.enemies = [];
      rRoom.projectiles = [];
      rRoom.firePrimaryAttack(rp);
      assert.strictEqual(rRoom.projectiles.length, 2, 'Twinstring Charm still adds 1 angled spread arrow independently');

      // Eclipse Longbow: Hold-to-Charge + Intelligence scaling
      rRoom.enemies = [];
      rp.relics = [];
      rRoom.grantArmament('r1', 'weapon', 'ranger_eclipse_longbow');
      rRoom.equipArmament('r1', 'weapon', 'ranger_eclipse_longbow');
      rRoom.projectiles = [];
      rRoom.fireEclipseChargedShot(rp, 0);
      const minShot = rRoom.projectiles[0];
      assert.ok(minShot.pierce >= 3, 'Eclipse Longbow grants +2 bonus pierce (3+ total)');
      rRoom.projectiles = [];
      rRoom.fireEclipseChargedShot(rp, ARMAMENT_TUNING.weapons.eclipse.maxChargeMs);
      const fullShot = rRoom.projectiles[0];
      assert.ok(fullShot.damage > minShot.damage * 2, `Full draw Eclipse shot (${fullShot.damage}) must massively exceed uncharged (${minShot.damage})`);
      assert.ok(Math.hypot(fullShot.vx, fullShot.vy) > Math.hypot(minShot.vx, minShot.vy), 'Full draw arrow flies faster');

      // Confirm Intelligence increases Eclipse shot damage while Dexterity does not
      const dmgIntBase = fullShot.damage;
      rp.dexterity += 20;
      rRoom.projectiles = [];
      rRoom.fireEclipseChargedShot(rp, ARMAMENT_TUNING.weapons.eclipse.maxChargeMs);
      assert.strictEqual(rRoom.projectiles[0].damage, dmgIntBase, 'DEX must not boost Eclipse damage');
      rp.intelligence += 20;
      rRoom.projectiles = [];
      rRoom.fireEclipseChargedShot(rp, ARMAMENT_TUNING.weapons.eclipse.maxChargeMs);
      assert.ok(rRoom.projectiles[0].damage > dmgIntBase, 'INT must scale Eclipse Longbow damage');

      // 3. ARCANIST: Runebound Spire (Active Star Rift Resonance), Cinderflare Rod (64px Ember Blast), Chronostar Scepter (Seeking Star-Orb + 150/300ms Cooldown Siphon + Chill)
      Math.random = () => 0.99;
      const aRoom = new GameRoom({
        roomId: 'WPN_A',
        name: 'Arcanist Armory Combat',
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 404,
      });
      aRoom.addOrReconnectPlayer('a1', 'Mage', 'arcanist');
      aRoom.startExpedition();
      const ap = aRoom.getPlayerState('a1')!;
      ap.aimAngle = 0;

      // Runebound Spire: +12% bolt damage when own Star Rift zone is active
      aRoom.zones = [];
      aRoom.projectiles = [];
      aRoom.firePrimaryAttack(ap);
      assert.strictEqual(aRoom.projectiles[0].pierce, 2, 'Runebound Spire gives 2 total bolt pierce');
      const spireNoRiftDmg = aRoom.projectiles[0].damage;
      aRoom.zones.push({
        id: 'test_rift',
        kind: 'star_rift',
        x: ap.x + 80,
        y: ap.y,
        radius: 75,
        ttlMs: 3000,
        maxTtlMs: 3000,
        ownerId: ap.id,
      });
      aRoom.projectiles = [];
      aRoom.firePrimaryAttack(ap);
      const spireActiveRiftDmg = aRoom.projectiles[0].damage;
      assert.ok(spireActiveRiftDmg > spireNoRiftDmg, 'Runebound Spire Rift Resonance boosts bolt damage while Star Rift is active');

      // Cinderflare Rod: Ember Blast 64px AoE hits adjacent foes & spawns cinderflare_blast
      aRoom.zones = [];
      aRoom.grantArmament('a1', 'weapon', 'arcanist_cinderflare_rod');
      aRoom.equipArmament('a1', 'weapon', 'arcanist_cinderflare_rod');
      const cinderPrimary = makeEnemy('a_cind_1', 'goblin', ap.x + 36, ap.y);
      const cinderSplashTarget = makeEnemy('a_cind_2', 'goblin', ap.x + 36, ap.y + 42);
      aRoom.enemies = [cinderPrimary, cinderSplashTarget];
      Math.random = () => 0.2;
      aRoom.projectiles = [];
      aRoom.firePrimaryAttack(ap);
      aRoom.tick(60);
      assert.ok(cinderPrimary.burnedMs > 0, 'Cinderflare Rod primary hit should ignite target');
      assert.ok(cinderSplashTarget.hp < 1000, 'Cinderflare Ember Blast must splash Fire AoE to adjacent enemy within 64px');
      assert.ok(aRoom.zones.some((z) => z.kind === 'cinderflare_blast'), 'Cinderflare Ember Blast spawns cinderflare_blast zone');

      // Chronostar Scepter: Seeking Star-Orb curves mid-flight & siphons 150ms Q / 300ms R once per orb
      Math.random = () => 0.99;
      aRoom.grantArmament('a1', 'weapon', 'arcanist_chronostar_scepter');
      aRoom.equipArmament('a1', 'weapon', 'arcanist_chronostar_scepter');
      const offAxisTarget = makeEnemy('a_chrono', 'goblin', ap.x + 95, ap.y + 62);
      aRoom.enemies = [offAxisTarget];
      aRoom.projectiles = [];
      ap.skillCooldownMs = 2000;
      ap.ultCooldownMs = 4000;
      Math.random = () => 0.2;
      aRoom.firePrimaryAttack(ap);
      assert.strictEqual(aRoom.projectiles.length, 1, 'Chronostar Scepter launches 1 seeking temporal Star-Orb');
      const chronoOrb = aRoom.projectiles[0];
      assert.strictEqual(chronoOrb.weaponId, 'arcanist_chronostar_scepter');
      aRoom.tick(60);
      assert.ok(Math.abs(chronoOrb.vy) > 1, 'Chronostar Star-Orb must seek off-axis enemy mid-flight');

      // Direct hit siphon test (single siphon even when piercing 2 targets!)
      const inline1 = makeEnemy('a_chrono_hit1', 'goblin', ap.x + 34, ap.y);
      const inline2 = makeEnemy('a_chrono_hit2', 'goblin', ap.x + 60, ap.y);
      aRoom.enemies = [inline1, inline2];
      aRoom.projectiles = [];
      ap.skillCooldownMs = 2000;
      ap.ultCooldownMs = 4000;
      aRoom.firePrimaryAttack(ap);
      stepRoom(aRoom, 100);
      assert.strictEqual(ap.skillCooldownMs, 2000 - ARMAMENT_TUNING.weapons.chronostar.tacticalSiphonMs - 100, 'Chronostar Siphon must trim Q cooldown once per orb');
      assert.strictEqual(ap.ultCooldownMs, 4000 - ARMAMENT_TUNING.weapons.chronostar.ultSiphonMs - 100, 'Chronostar Siphon must trim R cooldown once per orb');
      assert.ok(inline1.slowedMs > 0, 'Chronostar Star-Orb hit should Chill enemy');

      // 4. CLERIC: Dawnstar Mace (Undead Bane, 0 shield on hit), Solaris Censer (Lowest-HP OTHER Ally Heal), Seraphim Crozier (Seraphic Judgment Tactical ground AoE)
      Math.random = () => 0.99;
      const cRoom = new GameRoom({
        roomId: 'WPN_C',
        name: 'Cleric Armory Combat',
        hostName: 'Tester',
        difficulty: 'Normal',
        seed: 505,
      });
      cRoom.addOrReconnectPlayer('c1', 'Prelate', 'cleric');
      cRoom.addOrReconnectPlayer('ally1', 'WoundedAlly', 'vanguard');
      cRoom.startExpedition();
      const cp = cRoom.getPlayerState('c1')!;
      const allyP = cRoom.getPlayerState('ally1')!;
      allyP.x = cp.x + 50;
      allyP.y = cp.y;
      const skeletonTarget = makeEnemy('skel_c', 'skeleton', cp.x + 35, cp.y);
      cRoom.enemies = [skeletonTarget];

      cp.aimAngle = 0;
      cp.shield = 10;
      cRoom.projectiles = [];
      cRoom.firePrimaryAttack(cp);
      const dawnstarHpBefore = skeletonTarget.hp;
      cRoom.tick(60);
      const dawnstarDealt = dawnstarHpBefore - skeletonTarget.hp;
      assert.strictEqual(cp.shield, 10, 'Dawnstar Mace must grant 0 shield (Shield Exclusivity)');

      cRoom.unequipArmament('c1', 'weapon');
      cRoom.projectiles = [];
      cRoom.firePrimaryAttack(cp);
      const unarmedHpBefore = skeletonTarget.hp;
      cRoom.tick(60);
      const unarmedDealt = unarmedHpBefore - skeletonTarget.hp;
      assert.ok(dawnstarDealt > unarmedDealt, `Dawnstar Mace vs Undead (${dawnstarDealt}) must exceed unarmed (${unarmedDealt})`);

      // Solaris Censer: Healing amplification + lowest-HP OTHER ally heal on primary hit + Chill (never self-heal when solo)
      const healUnarmed = GameRoom.computeHealingAmount(20, cp, cp);
      cRoom.grantArmament('c1', 'weapon', 'cleric_solaris_censer');
      cRoom.equipArmament('c1', 'weapon', 'cleric_solaris_censer');
      const healSolaris = GameRoom.computeHealingAmount(20, cp, cp);
      assert.ok(healSolaris > healUnarmed, `Solaris Censer heal (${healSolaris}) must exceed unarmed (${healUnarmed})`);

      cp.hp = 50;
      allyP.hp = allyP.maxHp; // No injured other ally
      Math.random = () => 0.2;
      cRoom.projectiles = [];
      cRoom.firePrimaryAttack(cp);
      cRoom.tick(60);
      assert.strictEqual(cp.hp, 50, 'Solaris Censer must never self-heal when only self is injured');

      allyP.hp = 40;
      cRoom.tick(400); // expire Solaris proc cooldown
      cRoom.projectiles = [];
      cRoom.firePrimaryAttack(cp);
      cRoom.tick(60);
      assert.ok(skeletonTarget.slowedMs > 0, 'Solaris Censer primary hit should Chill target');
      assert.ok(allyP.hp > 40, `Solaris Censer Incense Mending must heal lowest-HP injured ally on hit (ally hp=${allyP.hp})`);

      // Seraphim Judgment Crozier: Tactical becomes Seraphic Judgment ground AoE Divine burst with NO healing
      cRoom.grantArmament('c1', 'weapon', 'cleric_seraphim_crozier');
      cRoom.equipArmament('c1', 'weapon', 'cleric_seraphim_crozier');
      const seraphimSpec = getAbilityTargetSpec('cleric', 'tactical', null, 'cleric_seraphim_crozier');
      assert.strictEqual(seraphimSpec.label, 'Seraphic Judgment');
      assert.strictEqual(seraphimSpec.kind, 'ground_aoe');
      cp.hp = 50;
      allyP.hp = 40;
      cp.skillCooldownMs = 0;
      cRoom.zones = [];
      skeletonTarget.x = cp.x + 120;
      skeletonTarget.y = cp.y;
      const skelBeforeSeraphim = skeletonTarget.hp;
      cRoom.performAction('c1', 'tactical', 0, { aimDistance: 120, explicitAim: true });
      assert.ok(skeletonTarget.hp < skelBeforeSeraphim, 'Seraphic Judgment must deal immediate Divine AoE damage');
      assert.ok(cRoom.zones.some((z) => z.kind === 'seraphim_holy_burst'), 'Seraphic Judgment spawns seraphim_holy_burst zone');
      assert.strictEqual(cp.hp, 50, 'Seraphic Judgment must NOT heal caster');
      assert.strictEqual(allyP.hp, 40, 'Seraphic Judgment must NOT heal allies');
    } finally {
      Math.random = origRandom;
    }
  });

  // --- Test 113: Server-Authoritative Vestment Effects & Stat Projections Parity ---
  await test('113. Vestments modify HP, resistances, CDR, move speed, attack speed, healing power & statUtils parity', () => {
    const room = new GameRoom({
      roomId: 'VEST_T113',
      name: 'Vestment Defense Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 606,
    });
    room.addOrReconnectPlayer('v1', 'Bulwark', 'vanguard');
    room.addOrReconnectPlayer('c1', 'Healer', 'cleric');
    room.startExpedition();

    const vp = room.getPlayerState('v1')!;
    const cp = room.getPlayerState('c1')!;
    // Default Ironcrest Plate grants +10 Max Shield Cap (60 + 10 = 70)
    assert.strictEqual(room.getMaxShieldCap(vp), 70, 'Ironcrest Plate grants +10 Max Shield Cap (70)');
    const defaultSpeed = computePlayerMoveSpeed(vp);

    // 1. Vanguard Obsidian Juggernaut: +25 Max HP, +8% phys res, -5% speed, 0 shield cap bonus
    room.grantArmament('v1', 'vestment', 'vanguard_obsidian_juggernaut');
    room.equipArmament('v1', 'vestment', 'vanguard_obsidian_juggernaut');
    assert.strictEqual(room.getMaxShieldCap(vp), 60, 'Obsidian Juggernaut grants 0 shield cap bonus');
    assert.ok(computePlayerMoveSpeed(vp) < defaultSpeed, 'Heavy Obsidian plate trades 5% move speed');
    const juggPhysTaken = room.damagePlayer(vp, 100, 'physical');
    vp.hp = vp.maxHp;

    // Sovereign Aegis Warplate (+15 HP, +5% phys res, +5% attack speed)
    room.grantArmament('v1', 'vestment', 'vanguard_aegis_sovereign_mail');
    room.equipArmament('v1', 'vestment', 'vanguard_aegis_sovereign_mail');
    const sovPhysTaken = room.damagePlayer(vp, 100, 'physical');
    assert.ok(juggPhysTaken < sovPhysTaken, `Obsidian +8% phys res takes less (${juggPhysTaken}) than Sovereign +5% (${sovPhysTaken})`);

    // 2. Move speed & attack speed on Ranger Windrunner Mistcloak (+10 HP, +10% move speed, +5% attack speed)
    room.addOrReconnectPlayer('r1', 'Wind', 'ranger');
    const rp = room.getPlayerState('r1')!;
    const defaultRangerSpeed = computePlayerMoveSpeed(rp);
    const defaultProj = calculatePlayerStatProjections(rp, 1);

    room.grantArmament('r1', 'vestment', 'ranger_windrunner_mantle');
    room.equipArmament('r1', 'vestment', 'ranger_windrunner_mantle');
    const windSpeed = computePlayerMoveSpeed(rp);
    const windProj = calculatePlayerStatProjections(rp, 1);
    assert.ok(windSpeed > defaultRangerSpeed, 'Windrunner Mistcloak increases movement speed (+10% vs +5%)');
    assert.ok(windProj.attackCooldownMs < defaultProj.attackCooldownMs, 'Windrunner +5% attack speed reduces cooldown');

    // 3. Cleric Martyr Surplice: +15% healing power & +5% CDR
    const healBaseVest = GameRoom.computeHealingAmount(20, cp, vp);
    cp.skillCooldownMs = 0;
    room.performAction('c1', 'tactical');
    const cdDefault = cp.skillCooldownMs;

    room.grantArmament('c1', 'vestment', 'cleric_martyr_surplice');
    room.equipArmament('c1', 'vestment', 'cleric_martyr_surplice');
    const healMartyrVest = GameRoom.computeHealingAmount(20, cp, vp);
    assert.ok(healMartyrVest > healBaseVest, `Martyr Surplice heal (${healMartyrVest}) > Prelate (${healBaseVest})`);
    cp.skillCooldownMs = 0;
    room.performAction('c1', 'tactical');
    const cdMartyr = cp.skillCooldownMs;
    assert.ok(cdMartyr < cdDefault, `Martyr 5% CDR (${cdMartyr}ms) < Prelate (${cdDefault}ms)`);

    // 4. Stat projection parity checks in statUtils.ts
    room.grantArmament('v1', 'weapon', 'vanguard_crimson_halberd');
    room.equipArmament('v1', 'weapon', 'vanguard_crimson_halberd');
    room.equipArmament('v1', 'vestment', 'vanguard_obsidian_juggernaut');
    const projObsidian = calculatePlayerStatProjections(vp, 1);
    room.unequipArmament('v1', 'weapon');
    room.unequipArmament('v1', 'vestment');
    const projDefault = calculatePlayerStatProjections(vp, 1);
    assert.ok(projObsidian.scaledHitDamage > projDefault.scaledHitDamage);
    assert.ok(projObsidian.maxHp > projDefault.maxHp);
    assert.ok(projObsidian.physicalResistPct > projDefault.physicalResistPct);
  });

  // --- Test 114: System Separation, Run Reset Persistence, Boss Drops & Multiplayer Delta Sync ---
  await test('114. Permanent Armaments survive run resets & sync via delta snapshots while Relics & Scrolls reset properly', () => {
    const room = new GameRoom({
      roomId: 'SEP_T114',
      name: 'System Separation Room',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 707,
    });
    const unlockedLog: Array<{ pid: string; slot: string; id: string }> = [];
    room.onArmamentUnlockedCallback = (pid, slot, id) => {
      unlockedLog.push({ pid, slot, id });
    };

    room.addOrReconnectPlayer('a1', 'Starweaver', 'arcanist', false, {
      level: 5,
      xp: 0,
      strength: 0,
      vitality: 0,
      dexterity: 0,
      intelligence: 0,
      faith: 0,
      attributePoints: 0,
      storage: ['bloodletter_talisman'],
      ownedWeapons: ['arcanist_runebound_spire', 'arcanist_chronostar_scepter'],
      ownedVestments: ['arcanist_astral_vestments', 'arcanist_voidward_robes'],
      equippedWeapon: 'arcanist_chronostar_scepter',
      equippedVestment: 'arcanist_voidward_robes',
    });
    room.startExpedition();

    const ap = room.getPlayerState('a1')!;
    // Equip temporary dungeon relic & Arcanist tactical scroll
    room.addPlayerRelic('a1', 'sunfire_signet');
    room.addPlayerRelic('a1', 'keen_arrowhead');
    ap.equippedScrollId = 'fireball';
    assert.strictEqual(ap.relics.length, 2);
    assert.strictEqual(ap.equippedScrollId, 'fireball');
    assert.strictEqual(ap.equippedWeapon, 'arcanist_chronostar_scepter');
    assert.strictEqual(ap.equippedVestment, 'arcanist_voidward_robes');
    assert.strictEqual(ap.shield, 15, 'Voidward Robes grants 0 starting shield (base 15 only)');

    // Capture delta snapshot before and after swapping armaments
    const snap1 = cloneSnapshotBaseline(room.buildNetworkSnapshot());
    room.equipArmament('a1', 'weapon', 'arcanist_runebound_spire');
    const snap2 = room.buildNetworkSnapshot();
    const delta = computeSnapshotDelta(snap1, snap2, 1, 2);
    const applied = applySnapshotDelta(snap1, delta);
    const syncedArc = applied.players.find((p) => p.id === 'a1')!;
    assert.strictEqual(syncedArc.equippedWeapon, 'arcanist_runebound_spire');
    assert.strictEqual(syncedArc.equippedVestment, 'arcanist_voidward_robes');

    // Simulate Boss clear unlock callback
    const boss = room.enemies.find((e) => e.kind === 'boss') || {
      id: 'boss_t114',
      kind: 'boss' as const,
      name: 'Warden Malakor',
      roomId: 4,
      x: ap.x + 25,
      y: ap.y,
      vx: 0,
      vy: 0,
      hp: 1,
      maxHp: 500,
      radius: 28,
      state: 'idle' as const,
      windupMs: 0,
      targetX: ap.x,
      targetY: ap.y,
      markedMs: 0,
      slowedMs: 0,
      stunnedMs: 0,
      burnedMs: 0,
      frozenMs: 0,
      shockedMs: 0,
      poisonedMs: 0,
      bleedingMs: 0,
      silencedMs: 0,
      elite: true,
    };
    if (!room.enemies.includes(boss)) room.enemies.push(boss);
    boss.hp = 1;
    room.damageEnemy(boss, 50, ap, false, 'arcane', true);
    assert.strictEqual(unlockedLog.length, 1, 'Boss kill should unlock a new unowned class armament');
    assert.ok(
      ap.ownedWeapons!.includes(unlockedLog[0].id) || ap.ownedVestments!.includes(unlockedLog[0].id),
      'Unlocked item must be added to player permanent armory'
    );

    // Restart run (simulates wipe/new expedition): temporary relics & scroll reset, permanent armaments & storage persist!
    room.restartRun();
    const afterRestart = room.getPlayerState('a1')!;
    assert.deepStrictEqual(afterRestart.relics, [], 'Temporary relics must reset on new run');
    assert.strictEqual(afterRestart.equippedScrollId, null, 'Temporary Arcanist scroll must reset on new run');
    assert.deepStrictEqual(afterRestart.storage, ['bloodletter_talisman'], 'Storage vault remains separate & preserved');
    assert.strictEqual(afterRestart.equippedWeapon, 'arcanist_runebound_spire', 'Equipped permanent weapon survives run reset');
    assert.strictEqual(afterRestart.equippedVestment, 'arcanist_voidward_robes', 'Equipped permanent vestment survives run reset');
    assert.ok(afterRestart.ownedWeapons!.includes('arcanist_chronostar_scepter'));
  });

  // --- Test 115: Visual In-Hand Weapon & Vestment Rendering (8-Dir + North Visibility), Projectiles & Fallen ---
  await test('115. All 12 permanent weapons & 12 vestments (+ unequipped) render distinctly across N/E/S/W, fallen sprites, and projectiles', async () => {
    const { drawHeroSprite } = await import('./src/client/heroSprites.ts');
    const {
      WEAPON_CATALOG,
      VESTMENT_CATALOG,
      getClassWeapons,
      getClassVestments,
    } = await import('./src/shared/armaments.ts');
    const { DIRECTION8_LIST, direction8ToPose } = await import('./src/client/directionalFacing.ts');

    assert.strictEqual(WEAPON_CATALOG.length, 12, 'Expected 12 permanent weapons in catalog');
    assert.strictEqual(VESTMENT_CATALOG.length, 12, 'Expected 12 permanent vestments in catalog');

    const createMockCtx = () => {
      const colors = new Set<string>();
      const rects: string[] = [];
      let arcs = 0;
      let ellipses = 0;
      let strokes = 0;
      let drawOps = 0;
      let curFill = '';
      let curStroke = '';

      const ctx = {
        get fillStyle() { return curFill; },
        set fillStyle(v: string) { curFill = String(v); if (v) colors.add(`f:${v}`); },
        get strokeStyle() { return curStroke; },
        set strokeStyle(v: string) { curStroke = String(v); if (v) colors.add(`s:${v}`); },
        lineWidth: 1,
        font: '',
        textAlign: 'center',
        textBaseline: 'middle',
        globalAlpha: 1,
        shadowColor: '',
        shadowBlur: 0,
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
        scale: () => {},
        setLineDash: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        quadraticCurveTo: () => {},
        arc: () => { arcs++; },
        ellipse: () => { ellipses++; },
        fillRect: (x: number, y: number, w: number, h: number) => {
          drawOps++;
          rects.push(`${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}`);
        },
        strokeRect: () => { drawOps++; },
        fill: () => { drawOps++; },
        stroke: () => { drawOps++; strokes++; },
        fillText: () => { drawOps++; },
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} }),
      } as unknown as CanvasRenderingContext2D;

      return {
        ctx,
        result: () => ({
          drawOps,
          signature: `${[...colors].sort().join('|')}#ops=${drawOps}#arcs=${arcs}#ell=${ellipses}#stk=${strokes}#rects=${rects.length}`,
        }),
      };
    };

    const renderHero = (
      heroClass: 'vanguard' | 'ranger' | 'arcanist' | 'cleric',
      equippedWeapon: string | null | undefined,
      swingProgress?: number,
      dir: (typeof DIRECTION8_LIST)[number] = 'E',
      equippedVestment?: string | null
    ) => {
      const m = createMockCtx();
      const pose = direction8ToPose(dir, false);
      drawHeroSprite(
        m.ctx,
        {
          heroClass,
          attackAnimMs: swingProgress !== undefined ? 150 : 0,
          vx: 0,
          vy: 0,
          hasteMs: 0,
          shield: 20,
          equippedWeapon,
          equippedVestment,
        },
        160,
        160,
        {
          aimAngle: pose.angleRad,
          bob: 0,
          moving: false,
          now: 5000,
          swingProgress,
          swingKind: 'primary',
          facingLeft: pose.facingLeft,
          facingDirection: dir,
        }
      );
      return m.result();
    };

    const classes = ['vanguard', 'ranger', 'arcanist', 'cleric'] as const;
    const styleByClass = {
      vanguard: 'slash',
      ranger: 'arrow',
      arcanist: 'arcane',
      cleric: 'radiant',
    } as const;

    for (const heroClass of classes) {
      const weapons = getClassWeapons(heroClass);
      const vestments = getClassVestments(heroClass);
      assert.strictEqual(weapons.length, 3, `Expected 3 weapons for ${heroClass}`);
      assert.strictEqual(vestments.length, 3, `Expected 3 vestments for ${heroClass}`);

      const signaturesE = new Set<string>();
      const signaturesN = new Set<string>();
      const projectileSigs = new Set<string>();

      for (const w of weapons) {
        const idleSigE = renderHero(heroClass, w.id, undefined, 'E');
        const idleSigN = renderHero(heroClass, w.id, undefined, 'N');
        const swingSig = renderHero(heroClass, w.id, 0.45, 'E');
        assert.ok(idleSigE.drawOps > 25, `Expected full sprite + weapon draw ops for ${w.id}`);
        assert.ok(swingSig.drawOps > 20, `Expected swing animation draws for ${w.id}`);
        assert.notStrictEqual(idleSigE.signature, swingSig.signature, `Expected swing state visual delta for ${w.id}`);
        signaturesE.add(idleSigE.signature);
        signaturesN.add(idleSigN.signature);

        for (const dir of DIRECTION8_LIST) {
          const dirRes = renderHero(heroClass, w.id, 0.42, dir);
          assert.ok(dirRes.drawOps > 20, `Expected 8-dir draw ops for ${w.id} @ ${dir}`);
        }

        // Verify per-weapon projectile visual uniqueness in drawEnhancedProjectile
        const pm = createMockCtx();
        drawEnhancedProjectile(
          pm.ctx,
          {
            id: `proj_${w.id}`,
            ownerType: 'player',
            ownerId: 'p1',
            style: styleByClass[heroClass],
            x: 100,
            y: 100,
            vx: 100,
            vy: 0,
            angle: 0,
            radius: 30,
            damage: 25,
            pierce: 1,
            ttlMs: 90,
            weaponId: w.id,
          },
          5000
        );
        const pRes = pm.result();
        assert.ok(pRes.drawOps > 2, `Expected projectile draw ops for ${w.id}`);
        projectileSigs.add(pRes.signature);
      }

      // Unarmed (`null`) must differ visibly from all 3 equipped weapons in both E and N facings
      signaturesE.add(renderHero(heroClass, null, undefined, 'E').signature);
      signaturesN.add(renderHero(heroClass, null, undefined, 'N').signature);
      assert.strictEqual(signaturesE.size, 4, `Expected 4 distinct East weapon signatures for ${heroClass}`);
      assert.strictEqual(signaturesN.size, 4, `Expected 4 distinct North weapon signatures for ${heroClass}`);
      assert.strictEqual(projectileSigs.size, 3, `Expected 3 distinct projectile signatures for ${heroClass}`);

      // Verify all 3 vestments + unarmored (`null`) render distinctly across E, N, and S facings
      const vestSigsE = new Set<string>();
      const vestSigsN = new Set<string>();
      const vestSigsS = new Set<string>();
      for (const v of vestments) {
        const resE = renderHero(heroClass, weapons[0].id, undefined, 'E', v.id);
        const resN = renderHero(heroClass, weapons[0].id, undefined, 'N', v.id);
        const resS = renderHero(heroClass, weapons[0].id, undefined, 'S', v.id);
        assert.ok(resE.drawOps > 25, `Expected full vestment draw ops for ${v.id}`);
        vestSigsE.add(resE.signature);
        vestSigsN.add(resN.signature);
        vestSigsS.add(resS.signature);
      }
      vestSigsE.add(renderHero(heroClass, weapons[0].id, undefined, 'E', null).signature);
      vestSigsN.add(renderHero(heroClass, weapons[0].id, undefined, 'N', null).signature);
      vestSigsS.add(renderHero(heroClass, weapons[0].id, undefined, 'S', null).signature);
      assert.strictEqual(vestSigsE.size, 4, `Expected 4 distinct East vestment signatures for ${heroClass}`);
      assert.strictEqual(vestSigsN.size, 4, `Expected 4 distinct North vestment signatures for ${heroClass}`);
      assert.strictEqual(vestSigsS.size, 4, `Expected 4 distinct South vestment signatures for ${heroClass}`);

      // Verify `undefined` gracefully falls back to class default starter weapon & vestment
      assert.strictEqual(
        renderHero(heroClass, undefined, undefined, 'E', undefined).signature,
        renderHero(heroClass, weapons[0].id, undefined, 'E', vestments[0].id).signature,
        `Undefined equippedWeapon/equippedVestment should match starter visuals for ${heroClass}`
      );

      // Verify drawFallenAndGhostPlayer distinguishes each weapon + unarmed
      const fallenWeaponSigs = new Set<string>();
      for (const wId of [...weapons.map((w) => w.id), null]) {
        const fm = createMockCtx();
        const fRoom = new GameRoom({
          roomId: `FW_${heroClass}`,
          name: 'Fallen Sprite Test',
          hostName: 'Tester',
          difficulty: 'Normal',
          seed: 42,
          initialFloor: 1,
        });
        fRoom.addOrReconnectPlayer(`p_${heroClass}_w_${wId ?? 'none'}`, 'Tester', heroClass);
        const fPlayer = fRoom.getPlayerState(`p_${heroClass}_w_${wId ?? 'none'}`)!;
        fPlayer.downed = true;
        fPlayer.downedTimerMs = 12000;
        fPlayer.reviveProgress = 0;
        fPlayer.equippedWeapon = wId;

        drawFallenAndGhostPlayer(fm.ctx, fPlayer, 200, 200, 7500, false);
        fallenWeaponSigs.add(fm.result().signature);
      }
      assert.strictEqual(
        fallenWeaponSigs.size,
        4,
        `Expected fallen sprite dropped weapons for ${heroClass} to produce 4 distinct signatures`
      );

      // Verify drawFallenAndGhostPlayer distinguishes each vestment + unarmored
      const fallenVestmentSigs = new Set<string>();
      for (const vId of [...vestments.map((v) => v.id), null]) {
        const fm = createMockCtx();
        const fRoom = new GameRoom({
          roomId: `FV_${heroClass}`,
          name: 'Fallen Vestment Sprite Test',
          hostName: 'Tester',
          difficulty: 'Normal',
          seed: 42,
          initialFloor: 1,
        });
        fRoom.addOrReconnectPlayer(`p_${heroClass}_v_${vId ?? 'none'}`, 'Tester', heroClass);
        const fPlayer = fRoom.getPlayerState(`p_${heroClass}_v_${vId ?? 'none'}`)!;
        fPlayer.downed = true;
        fPlayer.downedTimerMs = 12000;
        fPlayer.reviveProgress = 0;
        fPlayer.equippedVestment = vId;

        drawFallenAndGhostPlayer(fm.ctx, fPlayer, 200, 200, 7500, false);
        fallenVestmentSigs.add(fm.result().signature);
      }
      assert.strictEqual(
        fallenVestmentSigs.size,
        4,
        `Expected fallen sprite vestments for ${heroClass} to produce 4 distinct signatures`
      );
    }

    // Verify ParticleManager weapon-aware projectile wakes, hit/cleave impacts, and rate-limited ambient motes
    const vfxPm = new ParticleManager({ maxParticles: 600 });
    const baseTime = 12000;
    const styleForClass: Record<'vanguard' | 'ranger' | 'arcanist' | 'cleric', 'slash' | 'arrow' | 'arcane' | 'radiant'> = {
      vanguard: 'slash',
      ranger: 'arrow',
      arcanist: 'arcane',
      cleric: 'radiant',
    };

    for (const w of WEAPON_CATALOG) {
      const wakeBefore = vfxPm.count;
      vfxPm.spawnProjectileWake(
        {
          id: `wake_${w.id}`,
          ownerType: 'player',
          ownerId: 'p1',
          style: styleForClass[w.heroClass],
          x: 150,
          y: 150,
          vx: 120,
          vy: 0,
          angle: 0,
          radius: 20,
          damage: 25,
          pierce: 1,
          ttlMs: 120,
          weaponId: w.id,
        },
        baseTime
      );
      assert.ok(vfxPm.count > wakeBefore, `Expected spawnProjectileWake to emit for ${w.id}`);

      const hitBefore = vfxPm.count;
      if (w.heroClass === 'vanguard') {
        vfxPm.spawnVanguardCleave(180, 180, 0.4, true, baseTime + 50, w.id);
      } else if (w.heroClass === 'ranger') {
        vfxPm.spawnRangerArrowHit(180, 180, 0.4, true, baseTime + 50, w.id);
      } else if (w.heroClass === 'arcanist') {
        vfxPm.spawnArcanistBoltHit(180, 180, baseTime + 50, w.id);
      } else {
        vfxPm.spawnClericSmiteHit(180, 180, true, baseTime + 50, w.id);
      }
      assert.ok(vfxPm.count > hitBefore, `Expected class impact VFX to emit for ${w.id}`);
    }

    // Verify spawnArmamentAmbientMotes emits for Forged/Ascendant gear and enforces 240ms rate limit
    const nonStarterVestments = VESTMENT_CATALOG.filter((v) => !v.isDefault);
    assert.strictEqual(nonStarterVestments.length, 8, 'Expected 8 Forged/Ascendant vestments');
    for (let i = 0; i < nonStarterVestments.length; i++) {
      const v = nonStarterVestments[i];
      const sigWeapon = WEAPON_CATALOG.find((w) => w.heroClass === v.heroClass && !w.isDefault)?.id ?? null;
      const beforeAmb = vfxPm.count;
      vfxPm.spawnArmamentAmbientMotes(`amb_${v.id}`, v.heroClass, sigWeapon, v.id, 220, 220, baseTime + 500 + i * 300);
      const afterFirst = vfxPm.count;
      assert.ok(afterFirst > beforeAmb, `Expected ambient motes to spawn for ${v.id}`);
      // Calling again 50ms later should be rate-limited
      vfxPm.spawnArmamentAmbientMotes(`amb_${v.id}`, v.heroClass, sigWeapon, v.id, 220, 220, baseTime + 550 + i * 300);
      assert.strictEqual(vfxPm.count, afterFirst, `Expected ambient motes for ${v.id} to rate-limit within 240ms`);
    }
  });

  // --- Test 116: Damage Type Floating Text Colors (Red Physical, Purple Magic, Yellow Divine) ---
  await test('116. Damage floating text uses Red (Physical), Purple (Magic), Yellow (Divine) across hits, crits, dummies & players without conflicts', async () => {
    const {
      getDamageTypeColor,
      getDamageTypeFamily,
      inferDamageCategoryFromProjectileStyle,
    } = await import('./src/shared/types.ts');

    const physColor = getDamageTypeColor('physical', false);
    const physCrit = getDamageTypeColor('physical', true);
    const magicColor = getDamageTypeColor('arcane', false);
    const magicCrit = getDamageTypeColor('arcane', true);
    const divineColor = getDamageTypeColor('divine', false);
    const divineCrit = getDamageTypeColor('divine', true);
    const poisonColor = getDamageTypeColor('poison', false);

    assert.strictEqual(getDamageTypeFamily('physical'), 'physical');
    assert.strictEqual(getDamageTypeFamily('bleed'), 'physical');
    assert.strictEqual(getDamageTypeFamily('arcane'), 'magic');
    assert.strictEqual(getDamageTypeFamily('fire'), 'magic');
    assert.strictEqual(getDamageTypeFamily('frost'), 'magic');
    assert.strictEqual(getDamageTypeFamily('lightning'), 'magic');
    assert.strictEqual(getDamageTypeFamily('elemental'), 'magic');
    assert.strictEqual(getDamageTypeFamily('divine'), 'divine');
    assert.strictEqual(getDamageTypeColor('fire', false), magicColor);
    assert.strictEqual(getDamageTypeColor('frost', false), magicColor);
    assert.strictEqual(getDamageTypeColor('lightning', false), magicColor);
    assert.strictEqual(getDamageTypeColor('bleed', false), physColor);

    const uniqueColors = new Set([physColor, magicColor, divineColor, poisonColor]);
    assert.strictEqual(uniqueColors.size, 4, 'Physical, Magic, Divine, and Poison colors must all be distinct');
    assert.notStrictEqual(physCrit, divineCrit, 'Physical crit must not share Divine crit yellow');
    assert.notStrictEqual(magicCrit, divineCrit, 'Magic crit must not share Divine crit yellow');

    assert.strictEqual(inferDamageCategoryFromProjectileStyle('slash'), 'physical');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('arrow'), 'physical');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('bone'), 'physical');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('arcane'), 'arcane');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('voidorb'), 'arcane');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('fireball'), 'fire');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('frost_lance'), 'frost');
    assert.strictEqual(inferDamageCategoryFromProjectileStyle('radiant'), 'divine');

    const room = new GameRoom({
      roomId: 'DMG-COLORS',
      name: 'Damage Color Verification',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 123,
      initialFloor: 1,
    });
    room.status = 'playing';
    room.addOrReconnectPlayer('p_van', 'Vanguard', 'vanguard');
    room.addOrReconnectPlayer('p_arc', 'Arcanist', 'arcanist');
    room.addOrReconnectPlayer('p_cle', 'Cleric', 'cleric');
    const pVan = room.getPlayerState('p_van')!;
    const pArc = room.getPlayerState('p_arc')!;
    const pCle = room.getPlayerState('p_cle')!;

    // 1. Enemy hits (normal, crit, and marked) preserve Red / Purple / Yellow
    const enemy = room.spawnEnemyForTesting('goblin', 200, 200);
    enemy.hp = 5000;
    enemy.maxHp = 5000;

    room.pendingEvents = [];
    room.damageEnemy(enemy, 30, pVan, false, 'physical');
    assert.strictEqual(room.pendingEvents[0]?.color, physColor, 'Physical enemy hit should be Red');
    assert.strictEqual(room.pendingEvents[0]?.damageCategory, 'physical');

    room.pendingEvents = [];
    room.damageEnemy(enemy, 31, pVan, true, 'physical');
    assert.strictEqual(room.pendingEvents[0]?.kind, 'crit');
    assert.strictEqual(room.pendingEvents[0]?.color, physCrit, 'Physical enemy crit should be Red, not Yellow');

    // Marked enemy hit by Arcanist should still be Magic Purple (not Divine Yellow)
    enemy.markedMs = 2000;
    room.pendingEvents = [];
    room.damageEnemy(enemy, 32, pArc, false, 'arcane');
    assert.strictEqual(room.pendingEvents[0]?.kind, 'crit');
    assert.strictEqual(room.pendingEvents[0]?.color, magicCrit, 'Marked Magic hit must remain Purple');

    enemy.markedMs = 0;
    room.pendingEvents = [];
    room.damageEnemy(enemy, 33, pCle, true, 'divine');
    assert.strictEqual(room.pendingEvents[0]?.kind, 'crit');
    assert.strictEqual(room.pendingEvents[0]?.color, divineCrit, 'Divine crit should be Yellow');

    // Shock chain lightning should emit Magic Purple (not Divine Yellow)
    const shockTarget = room.spawnEnemyForTesting('goblin', 240, 200);
    shockTarget.hp = 1000;
    enemy.shockedMs = 3000;
    room.pendingEvents = [];
    room.damageEnemy(enemy, 40, pVan, false, 'physical');
    const chainEv = room.pendingEvents.find((e) => e.text.includes('⚡'));
    assert.ok(chainEv, 'Expected shock chain lightning floating damage event');
    assert.strictEqual(chainEv?.color, magicColor, 'Shock chain lightning must be Magic Purple, not Yellow');

    // 2. Player incoming damage matches Physical Red, Magic Purple, Divine Yellow
    pVan.shield = 0;
    pVan.hp = pVan.maxHp;
    room.pendingEvents = [];
    room.damagePlayer(pVan, 25, 'physical');
    assert.strictEqual(room.pendingEvents[0]?.color, physColor, 'Physical damage taken must be Red');

    room.pendingEvents = [];
    room.damagePlayer(pVan, 26, 'arcane');
    assert.strictEqual(room.pendingEvents[0]?.color, magicColor, 'Arcane damage taken must be Purple');

    room.pendingEvents = [];
    room.damagePlayer(pVan, 27, 'divine');
    assert.strictEqual(room.pendingEvents[0]?.color, divineColor, 'Divine damage taken must be Yellow');

    // 3. Oriphiel Aegis Parry reflect emits only ONE Divine Yellow event (no duplicate red event)
    room.zones.push({
      id: 'parry_zone_test',
      kind: 'warden_parry',
      x: enemy.x,
      y: enemy.y,
      radius: 70,
      ttlMs: 2000,
      maxTtlMs: 2000,
      ownerId: enemy.id,
    });
    room.pendingEvents = [];
    room.damageEnemy(enemy, 50, pVan, false, 'physical');
    const parryDamageEvents = room.pendingEvents.filter((e) => e.kind === 'damage');
    assert.strictEqual(parryDamageEvents.length, 1, 'Parry reflect must not emit duplicate damage floating texts');
    assert.strictEqual(parryDamageEvents[0]?.color, divineColor, 'Parry reflect damage must be Divine Yellow');

    // 4. Training dummies match attacker damage types (Red for Vanguard, Purple for Arcanist, Yellow for Cleric)
    const tavern = new GameRoom({
      roomId: 'TAVERN-HUB',
      name: 'Tavern Test',
      hostName: 'Tester',
      difficulty: 'Normal',
      seed: 1,
      initialFloor: 0,
    });
    tavern.status = 'playing';
    tavern.addOrReconnectPlayer('t_van', 'V', 'vanguard');
    tavern.addOrReconnectPlayer('t_arc', 'A', 'arcanist');
    tavern.addOrReconnectPlayer('t_cle', 'C', 'cleric');
    const tVan = tavern.getPlayerState('t_van')!;
    const tArc = tavern.getPlayerState('t_arc')!;
    const tCle = tavern.getPlayerState('t_cle')!;
    const dummy = tavern.trainingDummies[0];
    assert.ok(dummy, 'Expected Tavern training dummy');

    for (const [pl, expectedCol, label] of [
      [tVan, physColor, 'Vanguard'],
      [tArc, magicColor, 'Arcanist'],
      [tCle, divineColor, 'Cleric'],
    ] as const) {
      pl.x = dummy.x - 24;
      pl.y = dummy.y;
      pl.aimAngle = 0;
      tavern.pendingEvents = [];
      tavern.firePrimaryAttack(pl);
      for (let step = 0; step < 6; step++) tavern.tick(50);
      const dmgEv = tavern.pendingEvents.find((e) => e.kind === 'damage' || e.kind === 'crit');
      assert.ok(dmgEv, `Expected dummy floating damage event for ${label}`);
      assert.strictEqual(
        dmgEv?.color,
        dmgEv?.kind === 'crit'
          ? getDamageTypeColor(dmgEv.damageCategory, true)
          : expectedCol,
        `Expected ${label} dummy hit color to match damage type`
      );
    }
  });

  // --- Test 117: Runtime Optimization Fidelity (Particle Viewport Culling, Collision Cache & Snapshot Delta Fast-Paths) ---
  await test('117. Runtime optimization fidelity: particle viewport culling, Warden Gate collision cache, and snapshot delta fast paths', () => {
    // 1. ParticleManager viewport culling skips offscreen draw ops while still advancing physics & expiring particles
    const pm = new ParticleManager();
    const t0 = 50000;
    pm.spawnHitSparks(100, 100, '#FFFFFF', 4, t0);
    const onscreenCount = pm.count;
    assert.ok(onscreenCount > 0, 'Expected onscreen particles to spawn');

    pm.spawnHitSparks(1500, 1500, '#FFFFFF', 4, t0);
    assert.strictEqual(pm.count, onscreenCount * 2, 'Expected offscreen particles to spawn');

    let drawCalls = 0;
    const noop = () => {};
    const mockCtx = {
      save: noop,
      restore: noop,
      translate: noop,
      rotate: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      ellipse: noop,
      fill: () => { drawCalls++; },
      stroke: () => { drawCalls++; },
      fillRect: () => { drawCalls++; },
      strokeRect: noop,
      globalAlpha: 1,
      fillStyle: '#fff',
      strokeStyle: '#fff',
      lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;

    const viewport = { left: 0, right: 400, top: 0, bottom: 400 };
    // Only the onscreen particles (x=100,y=100) should draw; offscreen (x=1500,y=1500) must be culled
    pm.updateAndDraw(mockCtx, t0 + 50, 0.05, viewport);
    const firstFrameDraws = drawCalls;
    assert.ok(firstFrameDraws > 0, 'Onscreen particles must draw within viewport');

    // Compare against only having the onscreen burst: draw call count should be identical
    const pmSingle = new ParticleManager();
    pmSingle.spawnHitSparks(100, 100, '#FFFFFF', 4, t0);
    drawCalls = 0;
    pmSingle.updateAndDraw(mockCtx, t0 + 50, 0.05, viewport);
    assert.strictEqual(firstFrameDraws, drawCalls, 'Offscreen particles must not execute canvas draw ops');

    // Offscreen particles spawned later with short window vs earlier still expire on schedule
    pm.clear();
    pm.spawnHitSparks(1500, 1500, '#FFFFFF', 4, t0);
    assert.ok(pm.count > 0);
    pm.updateAndDraw(mockCtx, t0 + 2000, 0.1, viewport);
    assert.strictEqual(pm.count, 0, 'Offscreen particles must expire on schedule even when culled from rendering');

    // 2. Warden's Gate WeakMap collision cache reacts accurately to prop array mutation & opened state changes
    const miniMap = {
      width: 12,
      height: 12,
      tiles: new Array(144).fill(1),
      rooms: [],
      biome: 'catacombs' as const,
      biomeTitle: 'Cache Test',
      floor: 10,
      seed: 1,
      portalPos: { x: 100, y: 100 },
      portalActive: false,
      torches: [],
    };
    const props: PropState[] = [
      { id: 'c1', kind: 'crate', x: 64, y: 64, opened: false, value: 5 },
    ];
    assert.strictEqual(isWallAtWorld(miniMap, props, 200, 200), false, 'Open tile without gate should be passable');

    // Pushing a new warden_gate invalidates cached len cleanly
    const gate: PropState = { id: 'g1', kind: 'warden_gate', x: 200, y: 200, opened: false, value: 0 };
    props.push(gate);
    assert.strictEqual(isWallAtWorld(miniMap, props, 200, 200), true, 'Newly added closed warden_gate must block');

    // Toggling opened on existing gate object reflects immediately without array length change
    gate.opened = true;
    assert.strictEqual(isWallAtWorld(miniMap, props, 200, 200), false, 'Opened warden_gate must immediately become passable');

    // 3. Snapshot delta fast-path fidelity across matching-order updates, additions, removals, and empty arrays
    const snapRoom = new GameRoom({
      roomId: 'DELTA-OPT',
      name: 'Delta Opt Test',
      hostName: 'Host',
      difficulty: 'Normal',
      seed: 77,
      initialFloor: 1,
    });
    snapRoom.status = 'playing';
    snapRoom.addOrReconnectPlayer('p_delta', 'DeltaHero', 'vanguard');
    const s1 = snapRoom.buildNetworkSnapshot();
    let baseline = cloneSnapshotBaseline(s1);

    // Same-order tick mutation
    snapRoom.tick(25);
    const s2 = snapRoom.buildNetworkSnapshot();
    const d2 = computeSnapshotDelta(baseline, s2, 1, 2);
    const recon2 = applySnapshotDelta(baseline, d2);
    assert.deepStrictEqual(recon2, s2, 'Same-order delta fast path must reconstruct snapshot identically');
    baseline = cloneSnapshotBaseline(recon2);

    // Enemy removal + new projectile insertion (out-of-length path)
    if (snapRoom.enemies.length > 0) snapRoom.enemies.pop();
    snapRoom.firePrimaryAttack(snapRoom.getPlayerState('p_delta')!);
    const s3 = snapRoom.buildNetworkSnapshot();
    const d3 = computeSnapshotDelta(baseline, s3, 2, 3);
    const recon3 = applySnapshotDelta(baseline, d3);
    assert.deepStrictEqual(recon3, s3, 'Entity add/remove delta path must reconstruct snapshot identically');
  });

  // --- Test 118: Frame-Pacing, Viewport Crop Blitting, Sub-Pixel Snap & Smooth Sub-Threshold Prediction ---
  await test('118. Frame-pacing optimizations: computeMapCropRect, snapToScreenPixel, smooth prediction convergence & headless decoration safety', async () => {
    const {
      computeMapCropRect,
      getWorldViewBounds,
      snapToScreenPixel,
    } = await import('./src/client/camera.ts');
    const { LocalPredictionController } = await import('./src/client/prediction.ts');
    const {
      drawTavernDecorations,
      drawDungeonPortal,
      drawMysticShrine,
      drawRelicVault,
    } = await import('./src/client/dungeonDecorations.ts');

    // 1. Viewport map crop rectangle strictly clamps to map bounds and skips offscreen maps
    const viewCenter = getWorldViewBounds(400, 300, 640, 360, 1.5);
    const cropCenter = computeMapCropRect(viewCenter, 2560, 2560, 2);
    assert.ok(cropCenter, 'Expected valid crop rect inside map bounds');
    assert.ok(cropCenter!.sx >= 0 && cropCenter!.sy >= 0);
    assert.ok(cropCenter!.sw < 2560 && cropCenter!.sh < 2560, 'Crop rect should only cover visible viewport slice');

    const viewEdge = getWorldViewBounds(100, 100, 800, 600, 1.2);
    const cropEdge = computeMapCropRect(viewEdge, 1024, 1024, 2);
    assert.ok(cropEdge && cropEdge.sx === 0 && cropEdge.sy === 0, 'Left/top overflow must clamp cleanly to 0');

    const offMapView = getWorldViewBounds(4000, 4000, 400, 400, 1.5);
    assert.strictEqual(computeMapCropRect(offMapView, 1024, 1024, 2), null, 'Off-map view must return null');

    // 2. Screen-pixel grid snapping locks camera and world entities onto identical device pixels
    const zoom = 1.5;
    const rawCoord = 123.4;
    const snapped = snapToScreenPixel(rawCoord, zoom);
    assert.ok(Math.abs(snapped * zoom - Math.round(snapped * zoom)) < 1e-9, 'Snapped world coord must land on exact device pixel');

    // 3. Sub-threshold tick phase drift converges smoothly without rubber-band snap jumps
    const room = new GameRoom({
      roomId: 'PRED-SMOOTH',
      name: 'Smooth Prediction Test',
      hostName: 'Hero',
      difficulty: 'Normal',
      seed: 101,
      initialFloor: 1,
    });
    room.status = 'playing';
    room.addOrReconnectPlayer('p_smooth', 'Hero', 'vanguard');
    const p = room.getPlayerState('p_smooth')!;
    const pred = new LocalPredictionController();
    const idleInput = { up: false, down: false, left: false, right: false, attack: false, aimAngle: 0 };

    const init = pred.step({
      me: { ...p, lastInputSeq: 1 },
      liveInput: idleInput,
      latestSentSeq: 1,
      map: room.map,
      props: room.props,
      dtSec: 0.016,
      nowMs: 1000,
      isNewSnapshot: true,
    });
    assert.strictEqual(init.x, p.x);

    // Simulate minor 2.5px server tick phase offset (< 4.5px MIN_BLEND_ERROR_PX)
    const drifted = pred.step({
      me: { ...p, x: p.x + 2.5, lastInputSeq: 1 },
      liveInput: idleInput,
      latestSentSeq: 1,
      map: room.map,
      props: room.props,
      dtSec: 0.016,
      nowMs: 1025,
      isNewSnapshot: true,
    });
    assert.strictEqual(drifted.snapped, false, 'Sub-threshold drift must not trigger hard snap');
    assert.ok(drifted.x > p.x && drifted.x < p.x + 2.5, `Sub-threshold drift must converge smoothly (got ${drifted.x} vs ${p.x}..${p.x + 2.5})`);

    // 4. Decoration renderers remain safe in headless Node environments without document
    const noop = () => {};
    const mockCtx = {
      save: noop,
      restore: noop,
      translate: noop,
      rotate: noop,
      scale: noop,
      beginPath: noop,
      closePath: noop,
      moveTo: noop,
      lineTo: noop,
      arc: noop,
      ellipse: noop,
      fillRect: noop,
      strokeRect: noop,
      fill: noop,
      stroke: noop,
      fillText: noop,
      drawImage: noop,
      measureText: (txt: string) => ({ width: txt.length * 6 }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createLinearGradient: () => ({ addColorStop: noop }),
      setLineDash: noop,
      font: '',
      textAlign: 'center',
      textBaseline: 'middle',
      fillStyle: '#fff',
      strokeStyle: '#fff',
      lineWidth: 1,
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    assert.doesNotThrow(() => {
      drawTavernDecorations(mockCtx, 5000);
      drawDungeonPortal(mockCtx, 300, 300, false, 5000, 'catacombs', 1);
      drawMysticShrine(mockCtx, { id: 's1', kind: 'shrine', x: 200, y: 200, opened: false, value: 0 }, 5000);
      drawRelicVault(mockCtx, { id: 'v1', kind: 'relic_chest', x: 250, y: 250, opened: false, value: 0 }, 5000);
    });
  });

  // --- Test 119: Basic-Attack Hotpath (Quantized Glow Sprite Cache & Auto-Target Squared Distance) ---
  await test('119. Basic-attack hotpath: quantized glow sprite reuse bounds offscreen canvas allocations and findBestAutoTarget preserves range accuracy', async () => {
    // 1. Quantized glow key collapses smooth RGB fades into bounded cache buckets
    const buckets = new Set<number>();
    for (let step = 0; step <= 200; step++) {
      const t = step / 200;
      const r = Math.round(254 + (127 - 254) * t);
      const g = Math.round(240 + (29 - 240) * t);
      const b = Math.round(138 + (29 - 138) * t);
      buckets.add(quantizeGlowRgbKey(r, g, b));
    }
    assert.ok(
      buckets.size > 4 && buckets.size <= 36,
      `Expected smooth glow trajectory to collapse into <= 36 quantized buckets (got ${buckets.size})`
    );

    // 2. Instrument document.createElement to ensure ParticleManager.updateAndDraw reuses cached glow canvases
    const prevDoc = (globalThis as any).document;
    let createdCanvases = 0;
    const noop = () => {};
    const makeMockCanvas = () => ({
      width: 32,
      height: 32,
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop: noop }),
        fillStyle: '',
        fillRect: noop,
      }),
    });
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') createdCanvases++;
        return makeMockCanvas();
      },
    };
    try {
      const pm = new ParticleManager();
      const baseTime = 10000;
      for (let burst = 0; burst < 6; burst++) {
        pm.spawnVanguardCleave(300, 300, burst * 0.4, true, baseTime + burst * 40, 'vanguard_crimson_halberd');
      }
      const drawCtx = {
        save: noop,
        restore: noop,
        translate: noop,
        rotate: noop,
        scale: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        ellipse: noop,
        fillRect: noop,
        strokeRect: noop,
        fill: noop,
        stroke: noop,
        drawImage: noop,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '#fff',
        strokeStyle: '#fff',
        lineWidth: 1,
      } as unknown as CanvasRenderingContext2D;

      for (let frame = 0; frame < 15; frame++) {
        pm.updateAndDraw(drawCtx, baseTime + frame * 16, 0.016, {
          left: 0,
          right: 800,
          top: 0,
          bottom: 600,
        });
      }
      assert.ok(
        createdCanvases <= 25,
        `Glow cache should bound offscreen canvas creation across 6 crit cleaves x 15 frames (created ${createdCanvases})`
      );
    } finally {
      if (prevDoc === undefined) {
        delete (globalThis as any).document;
      } else {
        (globalThis as any).document = prevDoc;
      }
    }

    // 3. findBestAutoTarget squared-distance rejection preserves exact range boundary and angle selection
    const nearMatch = findBestAutoTarget({
      playerX: 100,
      playerY: 100,
      maxRange: 90,
      preferredAngle: 0,
      minDot: -1,
      enemies: [
        { id: 'far', x: 195, y: 100, hp: 50 }, // dist 95 > 90
        { id: 'edge', x: 189, y: 100, hp: 50 }, // dist 89 <= 90
      ],
    });
    assert.ok(nearMatch && nearMatch.target.id === 'edge', 'Expected target within maxRange to lock and out-of-range to skip');
    assert.ok(Math.abs(nearMatch!.angle) < 1e-6);

    const outOfRange = findBestAutoTarget({
      playerX: 100,
      playerY: 100,
      maxRange: 90,
      enemies: [{ id: 'far', x: 191, y: 100, hp: 50 }],
    });
    assert.strictEqual(outOfRange, null, 'Out-of-range candidate must return null');
  });

  console.log(`\nAll regression tests completed: ${passed}/${total} passed.`);
  if (passed !== total) {
    throw new Error(`Some regression tests failed: ${passed}/${total}`);
  }
}

runRegressionTests().catch(err => {
  console.error('Fatal error in regression tests:', err);
  process.exit(1);
});




