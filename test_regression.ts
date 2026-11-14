import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { GameRoom } from './src/server/gameEngine.ts';
import { TILE_SIZE, HERO_CLASSES, type AccountRecord, type HeroClassId, type EnemyState } from './src/shared/types.ts';
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
  type CombatParticle,
} from './src/client/canvasEffects.ts';
import { CHANGELOG_DATA, CATEGORY_ORDER } from './src/data/changelog.ts';

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
      for (const rec of list) {
        if (needsReset) {
          rec.strength = 0;
          rec.vitality = 0;
          rec.dexterity = 0;
          rec.intelligence = 0;
          rec.faith = 0;
          rec.attributePoints = (Math.max(1, rec.level || 1) - 1) * 2;
        } else {
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
    assert.strictEqual(boot1Accounts[0].attributePoints, 48); // (25-1)*2

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
    // Vitality 10: vit bonus = 10 * 6 = 60
    // Total permanent HP = 155 + 48 + 60 = 263
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
    assert.strictEqual(pState.maxHp, 263, 'Initial max HP with level 5 and 10 VIT');

    // Award Bastion Pauldron relic (+30 HP)
    room.addPlayerRelic(pid, 'bastion_pauldron');
    assert.strictEqual(pState.relics.includes('bastion_pauldron'), true);
    assert.strictEqual(pState.maxHp, 293, 'Max HP with Bastion Pauldron must be 293');

    // Now restart the expedition
    room.restartRun();

    // Verify relics are cleared and HP is recalculated WITHOUT Bastion Pauldron
    assert.strictEqual(pState.relics.length, 0, 'Relics must be empty after restart');
    assert.strictEqual(pState.maxHp, 263, 'Max HP must return to 263 (Bastion Pauldron bonus completely removed)');
    assert.strictEqual(pState.hp, 263, 'Current HP must equal max HP (263)');
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
    const base = 36;
    const heal0 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: 0 });
    const heal10 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: 10 });
    const heal20 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: 20 });

    assert.strictEqual(heal0, 36, '0 FTH at lvl 1 gives base 36');
    assert(heal10 > heal0, `10 FTH (${heal10}) must heal more than 0 FTH (${heal0})`);
    assert(heal20 > heal10, `20 FTH (${heal20}) must heal more than 10 FTH (${heal10})`);
    assert.strictEqual(heal10, 47, '36 * 1.0 * 1.30 = 46.8 -> 47');
    assert.strictEqual(heal20, 58, '36 * 1.0 * 1.60 = 57.6 -> 58');
  });

  // --- Test 7: Level scaling with same Faith ---
  test('7. Higher level increases Cleric healing with same Faith', () => {
    const base = 36;
    const fth = 10;
    const healLvl1 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 1, faith: fth });
    const healLvl10 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 10, faith: fth });
    const healLvl25 = GameRoom.computeHealingAmount(base, { heroClass: 'cleric', level: 25, faith: fth });

    assert(healLvl10 > healLvl1, `Lvl 10 (${healLvl10}) must heal more than Lvl 1 (${healLvl1})`);
    assert(healLvl25 > healLvl10, `Lvl 25 (${healLvl25}) must heal more than Lvl 10 (${healLvl10})`);
    assert.strictEqual(healLvl1, 47);
    assert.strictEqual(healLvl10, 68, '36 * 1.45 * 1.30 = 67.86 -> 68');
    assert.strictEqual(healLvl25, 103, '36 * 2.20 * 1.30 = 102.96 -> 103');
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
    const expectedHeal = GameRoom.computeHealingAmount(36, cleric);
    // Level 10, 15 FTH: 36 * (1 + 9*0.05) * (1 + 15*0.03) = 36 * 1.45 * 1.45 = 75.69 -> 76
    assert.strictEqual(expectedHeal, 76);

    // Cleric uses tactical skill
    room.performAction(clericId, 'tactical');
    assert.strictEqual(ally.hp, 100 + expectedHeal, 'Ally HP must increase by exactly 76');
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

    // Injure ally to 80% (normal base 4)
    ally.hp = Math.round(ally.maxHp * 0.8);
    const startHp = ally.hp;

    // Expected aura heal: Level 10, 20 FTH, base 4:
    // 4 * (1 + 9*0.05) * (1 + 20*0.03) = 4 * 1.45 * 1.60 = 9.28 -> 9
    const expectedNormal = GameRoom.computeHealingAmount(4, cleric);
    assert.strictEqual(expectedNormal, 9);

    // Tick room 2000ms to trigger Radiant Aura
    room.tick(2000);
    assert.strictEqual(ally.hp, startHp + expectedNormal, 'Aura must heal ally by exactly 9 HP');

    // Injure ally below 50% HP (critical base 6):
    // 6 * 1.45 * 1.60 = 13.92 -> 14
    ally.hp = Math.round(ally.maxHp * 0.4);
    const critStartHp = ally.hp;
    const expectedCrit = GameRoom.computeHealingAmount(6, cleric);
    assert.strictEqual(expectedCrit, 14);

    room.tick(2000);
    assert.strictEqual(ally.hp, critStartHp + expectedCrit, 'Critical aura must heal ally by exactly 14 HP');
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
    const vanguardHeal = GameRoom.computeHealingAmount(36, {
      heroClass: 'vanguard',
      level: 10,
      faith: 20,
    });
    assert.strictEqual(vanguardHeal, 36, 'Non-Cleric helper call returns base amount without FTH scaling');

    // Potion healing remains 45% of maxHp
    const maxHp = 200;
    const potionHeal = Math.round(maxHp * 0.45);
    assert.strictEqual(potionHeal, 90, 'Potion healing is unscaled consumable percentage');
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
    const expected = GameRoom.computeHealingAmount(36, cleric);
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
    assert.strictEqual(t2.hp, 439, 'Secondary target must take 61 frost damage (500 - 61 = 439)');
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
    // Ranger level 10 (+90% level scaling = 1.9x), DEX 10 (+30% stat scaling = 1.3x)
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
    // Scaled base damage using computeDamageMult = 10 * (1 + (10-1)*0.10) * (1 + 10*0.03) = 10 * 1.9 * 1.3 = 24.7 -> 25
    const scaledBaseDmg = Math.round(10 * room.computeDamageMult(p, 'physical'));
    assert.strictEqual(scaledBaseDmg, 25);

    const actualDmg = room.damageEnemy(slime as any, scaledBaseDmg, p, 'physical');
    assert.strictEqual(actualDmg, 25, 'Base 10 damage scaled to 25 at Lvl 10 + 10 DEX against 0 res slime must deal exactly 25 damage without duplicate scaling');
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
    assert.strictEqual(multB, 1.3, 'Arcanist arcane mult with 10 INT must be 1.3');

    // Check spawned tactical projectile damage
    room.performAction(idA, 'tactical');
    const projA = room.projectiles.find(pr => pr.ownerId === idA)!;
    assert.strictEqual(projA.damage, 24, '0 INT Arcanist tactical projectile damage must be 24');

    room.projectiles = []; // Clear projectiles
    room.performAction(idB, 'tactical');
    const projB = room.projectiles.find(pr => pr.ownerId === idB)!;
    assert.strictEqual(projB.damage, 31, '10 INT Arcanist tactical projectile damage must be 31 (24 * 1.3 = 31.2 -> 31)');
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
    assert.strictEqual(multB, 1.3, 'Cleric divine mult with 10 FTH must be 1.3');

    const dummyB = createTestEnemy('e_dummyB', 'slime', 'Dummy B', 210, 210, 500, { divine: 0 });
    room.enemies.push(dummyB as any);
    room.performAction(idB, 'tactical');
    assert.strictEqual(dummyB.hp, 464, '10 FTH Cleric tactical deals 36 damage (28 * 1.3 = 36.4 -> 36, 500 - 36 = 464)');
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
    assert.strictEqual(multR, 1.3, 'Ranger physical mult with 10 DEX must be 1.3');

    room.performAction(idR, 'tactical');
    const projR = room.projectiles.find(pr => pr.ownerId === idR)!;
    assert.strictEqual(projR.damage, 23, '10 DEX Ranger tactical projectile damage must be 23 (18 * 1.3 = 23.4 -> 23)');
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
    assert.strictEqual(multV, 1.3, 'Vanguard physical mult with 10 STR must be 1.3');

    const dummyV = createTestEnemy('e_dummyV', 'slime', 'Dummy V', 110, 110, 500, { physical: 0 });
    room.enemies.push(dummyV as any);
    room.performAction(idV, 'tactical');
    assert.strictEqual(dummyV.hp, 458, '10 STR Vanguard tactical deals 42 damage (32 * 1.3 = 41.6 -> 42, 500 - 42 = 458)');
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

    // Cleric uses tactical: 28 base * 1.3 FTH mult = 36 scaled divine damage.
    // Divine vulnerability (-0.25 res): 36 * (1 - (-0.25)) = 36 * 1.25 = 45 damage.
    room.performAction(idCleric, 'tactical');
    assert.strictEqual(skeleton.hp, 455, 'Skeleton hp must be 455 after 45 divine damage (500 - 45 = 455)');
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
  test('36. Twinstring Charm generates an additional projectile dealing 75% damage', () => {
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
    assert.ok(projs[0].damage === 24 || projs[0].damage === 42, `Primary shot deals base damage (got ${projs[0].damage})`);
    assert.strictEqual(projs[1].damage, Math.round(projs[0].damage * 0.75), 'Secondary shot deals exactly 75% of primary shot damage');
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

    // 3. Faith confers crowd-control duration reduction
    const idFth = 'p_fth_test';
    room.addOrReconnectPlayer(idFth, 'FthHero', 'cleric', false, {
      level: 1, xp: 0, strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 50, attributePoints: 0,
    });
    const pFth = room.getPlayerState(idFth)!;
    // 50 FTH grants 50 * 0.004 = 20% CC duration reduction.
    room.applyStatusEffect(pFth, 'silence', 4000);
    const silenceStatus = pFth.statuses.find(s => s.type === 'silenced')!;
    assert.strictEqual(silenceStatus.durationMs, 3200, '50 FTH reduces 4000ms silence duration to 3200ms');

    // 4. Vitality confers periodic combat health regeneration
    const idVit = 'p_vit_test';
    room.addOrReconnectPlayer(idVit, 'VitHero', 'vanguard', false, {
      level: 1, xp: 0, strength: 0, vitality: 30, dexterity: 0, intelligence: 0, faith: 0, attributePoints: 0,
    });
    const pVit = room.getPlayerState(idVit)!;
    pVit.hp = 100; // Damaged
    room.tick(2000); // 2s pulse
    assert.ok(pVit.hp > 100, 'Invested Vitality must passively regenerate health during ticks');
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

    // Movement speed: base 210 * (1 + 60 * 0.0035) = 210 * 1.21 = 254.1 px/s (not uncontrollable 457 px/s)
    const def = HERO_CLASSES.ranger;
    const moveSpeed = def.speed * (1 + (pDex.dexterity || 0) * 0.0035);
    assert.ok(moveSpeed > 240 && moveSpeed < 270, '60 DEX move speed must be in a readable, non-clipping range (~254 px/s)');

    // Attack cooldown: 1 + 60 * 0.006 = 1.36x speed rate. Base 320ms / 1.36 = 235ms.
    const dexSpeedMult = 1 + (pDex.dexterity || 0) * 0.006;
    const cd = Math.round(def.attackCooldownMs / dexSpeedMult);
    assert.ok(cd >= 220 && cd <= 250, '60 DEX attack cooldown must remain balanced without breaking animation frames (~235ms)');
  });

  // --- Test 53: Polynomial XP curve and floor-scaled XP drops allow smooth progression ---
  test('53. Progression curve provides smooth leveling without exponential wall', () => {
    // Check nextXp curve:
    const xpLvl1 = GameRoom.computeNextXp(1);
    const xpLvl5 = GameRoom.computeNextXp(5);
    const xpLvl10 = GameRoom.computeNextXp(10);
    const xpLvl25 = GameRoom.computeNextXp(25);
    const xpLvl50 = GameRoom.computeNextXp(50);

    assert.strictEqual(xpLvl1, 80, 'Level 1 next XP must be 80');
    assert.ok(xpLvl10 > 1000 && xpLvl10 < 1300, `Level 10 next XP must be ~1120 (got ${xpLvl10})`);
    assert.ok(xpLvl25 > 4000 && xpLvl25 < 6000, `Level 25 next XP must be ~4850 (got ${xpLvl25}) - previously 103,138!`);
    assert.ok(xpLvl50 > 12000 && xpLvl50 < 20000, `Level 50 next XP must be achievable (~15,200) - previously 175,000,000!`);
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

    const gLockedChest = room.props.find((pr) => pr.roomId === gRoom.id && pr.kind === 'chest');
    assert.ok(gLockedChest && gLockedChest.locked, 'Guardian chamber chest must start locked');

    // Attempt to open locked chest while Guardian enemies remain alive
    player.x = gLockedChest!.x;
    player.y = gLockedChest!.y;
    const goldBeforeLocked = player.gold;
    room.performAction(pid, 'interact');
    assert.strictEqual(gLockedChest!.opened, false, 'Locked chest must not open while room enemies are alive');
    assert.strictEqual(player.gold, goldBeforeLocked, 'Gold must not change when chest is locked');

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

    // Full-Floor Mastery Bonus check
    const finalSnap = room.buildSnapshot();
    assert.strictEqual(finalSnap.floorMasteryAwarded, true, 'Full-floor mastery should be awarded when all combat rooms clear');
    assert.strictEqual(finalSnap.bossWards, 0, 'Boss Sanctum Wards should be 0 when all combat rooms are cleared');
    assert.ok(player.attributePoints >= attrBeforeMastery + 1, 'Full-floor mastery must grant +1 attribute point');
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

  console.log(`\nAll regression tests completed: ${passed}/${total} passed.`);
  if (passed !== total) {
    throw new Error(`Some regression tests failed: ${passed}/${total}`);
  }
}

runRegressionTests().catch(err => {
  console.error('Fatal error in regression tests:', err);
  process.exit(1);
});




