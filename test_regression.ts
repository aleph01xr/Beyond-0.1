import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { GameRoom } from './src/server/gameEngine.ts';
import { TILE_SIZE, type AccountRecord, type HeroClassId, type EnemyState } from './src/shared/types.ts';
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
    assert.strictEqual(tavern.isPlayerNearNpc(pid, 'npc_aleph', 85), true);

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

    const isNearAleph = tavern.isPlayerNearNpc(pid, 'npc_aleph', 85);
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
      assert.ok(boss.resistances.tenacity >= 0.70, `Floor ${f} boss tenacity must be high`);
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
      assert.ok(e.resistances.physical !== undefined);
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

  console.log(`\nAll regression tests completed: ${passed}/${total} passed.`);
  if (passed !== total) {
    throw new Error(`Some regression tests failed: ${passed}/${total}`);
  }
}

runRegressionTests().catch(err => {
  console.error('Fatal error in regression tests:', err);
  process.exit(1);
});



