import {
  TILE_SIZE,
  type BiomeId,
  type DifficultyTier,
  type DungeonMap,
  type EnemyKind,
  type EnemyResistances,
  type EnemyState,
  type NpcState,
  type PropState,
  type RoomNode,
  type TrainingDummyState,
} from '../shared/types.ts';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedFloorResult {
  map: DungeonMap;
  enemies: EnemyState[];
  props: PropState[];
  spawnPoint: { x: number; y: number };
}

const BIOMES: { id: BiomeId; title: string; bossNames: string[] }[] = [
  {
    id: 'courtyard',
    title: 'Highkeep Outer Bailey',
    bossNames: ['Warden Malakor'],
  },
  {
    id: 'catacombs',
    title: 'Sunken Crypt',
    bossNames: ['Archlich Vaelor'],
  },
  {
    id: 'ember',
    title: 'Cindervault Bastion',
    bossNames: ['Ignis, Cinder Sovereign'],
  },
  {
    id: 'void',
    title: 'Abyssal Shadow Chasm',
    bossNames: ['Void-Eater Malice'],
  },
  {
    id: 'astral',
    title: 'Aetherial Void Spire',
    bossNames: ['Archon of Nothingness'],
  },
];

export function generateDungeonFloor(
  floor: number,
  baseSeed: number,
  difficulty: DifficultyTier,
  partySize: number
): GeneratedFloorResult {
  const floorSeed = ((baseSeed >>> 0) + floor * 7919) >>> 0;
  const rng = mulberry32(floorSeed);

  const width = 58;
  const height = 44;
  const tiles = new Array<number>(width * height).fill(0);

  const biomeSpec = BIOMES[(floor - 1) % BIOMES.length];

  const setTile = (tx: number, ty: number, code: number) => {
    if (tx >= 1 && tx < width - 1 && ty >= 1 && ty < height - 1) {
      tiles[ty * width + tx] = code;
    }
  };
  const getTile = (tx: number, ty: number): number => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return 0;
    return tiles[ty * width + tx];
  };

  const rooms: RoomNode[] = [];
  const targetRoomCount = 8;

  const startW = 8;
  const startH = 8;
  const startX = 4;
  const startY = Math.floor(height / 2 - startH / 2);
  rooms.push({
    id: 0,
    x: startX,
    y: startY,
    w: startW,
    h: startH,
    cx: Math.floor(startX + startW / 2),
    cy: Math.floor(startY + startH / 2),
    type: 'start',
    cleared: true,
    discovered: true,
  });

  let attempts = 0;
  while (rooms.length < targetRoomCount && attempts < 260) {
    attempts++;
    const isBossCandidate = rooms.length === targetRoomCount - 1;
    const rw = isBossCandidate ? 12 : 7 + Math.floor(rng() * 5);
    const rh = isBossCandidate ? 11 : 7 + Math.floor(rng() * 4);
    const rx = isBossCandidate
      ? width - rw - 4 - Math.floor(rng() * 4)
      : 4 + Math.floor(rng() * (width - rw - 8));
    const ry = 4 + Math.floor(rng() * (height - rh - 8));

    const overlaps = rooms.some(
      (r) =>
        rx < r.x + r.w + 3 &&
        rx + rw + 3 > r.x &&
        ry < r.y + r.h + 3 &&
        ry + rh + 3 > r.y
    );

    if (!overlaps) {
      rooms.push({
        id: rooms.length,
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2),
        type: 'combat',
        cleared: false,
        discovered: false,
      });
    }
  }

  const startRoom = rooms[0];
  const sortedByDist = rooms
    .slice(1)
    .sort(
      (a, b) =>
        Math.hypot(a.cx - startRoom.cx, a.cy - startRoom.cy) -
        Math.hypot(b.cx - startRoom.cx, b.cy - startRoom.cy)
    );

  if (sortedByDist.length >= 3) {
    const bossRoom = sortedByDist[sortedByDist.length - 1];
    bossRoom.type = 'boss';
    const treasureRoom = sortedByDist[Math.floor(sortedByDist.length / 2)];
    if (treasureRoom.id !== bossRoom.id) {
      treasureRoom.type = 'treasure';
      treasureRoom.cleared = true;
    }
    const shrineRoom = sortedByDist[1];
    if (shrineRoom.id !== bossRoom.id && shrineRoom.id !== treasureRoom.id) {
      shrineRoom.type = 'shrine';
      shrineRoom.cleared = true;
    }
  }

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setTile(x, y, 1);
      }
    }
  }

  const connected = new Set<number>([0]);
  const remaining = new Set<number>(rooms.slice(1).map((r) => r.id));
  const edges: [RoomNode, RoomNode][] = [];

  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestPair: [RoomNode, RoomNode] | null = null;
    for (const cId of connected) {
      const rc = rooms[cId];
      for (const uId of remaining) {
        const ru = rooms[uId];
        const d = Math.hypot(rc.cx - ru.cx, rc.cy - ru.cy);
        if (d < bestDist) {
          bestDist = d;
          bestPair = [rc, ru];
        }
      }
    }
    if (!bestPair) break;
    edges.push(bestPair);
    connected.add(bestPair[1].id);
    remaining.delete(bestPair[1].id);
  }

  if (rooms.length >= 5) {
    edges.push([rooms[1], rooms[3]]);
  }

  const carveCorridor = (ax: number, ay: number, bx: number, by: number) => {
    let cx = ax;
    let cy = ay;
    const horizFirst = rng() > 0.5;
    const stampFloor = (px: number, py: number) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          setTile(px + dx, py + dy, 1);
        }
      }
    };

    if (horizFirst) {
      while (cx !== bx) {
        stampFloor(cx, cy);
        cx += cx < bx ? 1 : -1;
      }
      while (cy !== by) {
        stampFloor(cx, cy);
        cy += cy < by ? 1 : -1;
      }
    } else {
      while (cy !== by) {
        stampFloor(cx, cy);
        cy += cy < by ? 1 : -1;
      }
      while (cx !== bx) {
        stampFloor(cx, cy);
        cx += cx < bx ? 1 : -1;
      }
    }
    stampFloor(bx, by);
  };

  for (const [ra, rb] of edges) {
    carveCorridor(ra.cx, ra.cy, rb.cx, rb.cy);
  }

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (getTile(x, y) === 0) {
        let touchesFloor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (getTile(x + dx, y + dy) === 1) {
              touchesFloor = true;
            }
          }
        }
        if (touchesFloor) {
          tiles[y * width + x] = 2;
        }
      }
    }
  }

  const torches: { x: number; y: number }[] = [];
  const enemies: EnemyState[] = [];
  const props: PropState[] = [];
  let propSeq = 1;
  let enemySeq = 1;

  const diffMult =
    difficulty === 'Abyssal' ? 1.55 : difficulty === 'Heroic' ? 1.25 : 1.0;
  const partyMult = 1 + Math.max(0, partySize - 1) * 0.55;
  const floorMult = 1 + (floor - 1) * 0.32;
  const hpScale = diffMult * partyMult * floorMult;

  let portalPos = {
    x: (startRoom.cx + 1) * TILE_SIZE + TILE_SIZE / 2,
    y: startRoom.cy * TILE_SIZE + TILE_SIZE / 2,
  };

  for (const room of rooms) {
    const torchCandidates = [
      { tx: room.x + 1, ty: room.y + 1 },
      { tx: room.x + room.w - 2, ty: room.y + 1 },
      { tx: room.x + 1, ty: room.y + room.h - 2 },
      { tx: room.x + room.w - 2, ty: room.y + room.h - 2 },
    ];
    for (const tc of torchCandidates) {
      if (getTile(tc.tx, tc.ty) === 1 && rng() > 0.22) {
        torches.push({
          x: tc.tx * TILE_SIZE + TILE_SIZE / 2,
          y: tc.ty * TILE_SIZE + TILE_SIZE / 2,
        });
      }
    }

    if ((room.type === 'combat' || room.type === 'boss') && room.w >= 9 && room.h >= 9) {
      const pOffsets = [
        [room.x + 2, room.y + 2],
        [room.x + room.w - 3, room.y + 2],
        [room.x + 2, room.y + room.h - 3],
        [room.x + room.w - 3, room.y + room.h - 3],
      ];
      for (const [px, py] of pOffsets) {
        if (getTile(px, py) === 1) {
          setTile(px, py, 3);
        }
      }
    }

    const centerWorldX = room.cx * TILE_SIZE + TILE_SIZE / 2;
    const centerWorldY = room.cy * TILE_SIZE + TILE_SIZE / 2;

    if (room.type === 'start') {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: 'crate',
        x: (room.x + 2) * TILE_SIZE + 16,
        y: (room.y + 2) * TILE_SIZE + 16,
        opened: false,
        value: 12,
      });
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: 'potion',
        x: (room.x + room.w - 2) * TILE_SIZE + 16,
        y: (room.y + 2) * TILE_SIZE + 16,
        opened: false,
        value: 1,
      });
    } else if (room.type === 'treasure') {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: 'relic_chest',
        x: centerWorldX,
        y: centerWorldY,
        opened: false,
        value: 1,
      });
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: 'chest',
        x: centerWorldX - 48,
        y: centerWorldY + 28,
        opened: false,
        value: 35,
      });
    } else if (room.type === 'shrine') {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: 'shrine',
        x: centerWorldX,
        y: centerWorldY,
        opened: false,
        value: 55,
      });
    } else if (room.type === 'combat') {
      const enemyCount = 3 + Math.floor(rng() * 3) + Math.min(2, Math.floor(floor / 2));
      const pool: EnemyKind[] =
        floor === 1
          ? ['slime', 'goblin', 'skeleton']
          : floor === 2
            ? ['goblin', 'skeleton', 'cultist']
            : floor === 3
              ? ['skeleton', 'knight', 'cultist']
              : floor === 4
                ? ['cultist', 'shadow_stalker', 'skeleton']
                : ['astral_sentinel', 'cultist', 'shadow_stalker'];

      for (let i = 0; i < enemyCount; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
        // Find safe open floor tile clear of pillars (tile 3) and perimeter walls
        let spawnTx = Math.floor(room.cx);
        let spawnTy = Math.floor(room.cy);
        for (let attempt = 0; attempt < 12; attempt++) {
          const candTx = Math.floor(room.x + 2 + rng() * (room.w - 4));
          const candTy = Math.floor(room.y + 2 + rng() * (room.h - 4));
          if (getTile(candTx, candTy) === 1) {
            spawnTx = candTx;
            spawnTy = candTy;
            break;
          }
        }
        const ex = spawnTx * TILE_SIZE + TILE_SIZE / 2;
        const ey = spawnTy * TILE_SIZE + TILE_SIZE / 2;
        const elite = rng() < 0.16 + floor * 0.04;
        enemies.push(makeEnemy(`en_${floor}_${enemySeq++}`, kind, room.id, ex, ey, hpScale, elite, floor, biomeSpec.id));
      }

      if (rng() > 0.35) {
        props.push({
          id: `prop_${floor}_${propSeq++}`,
          kind: rng() > 0.65 ? 'chest' : 'crate',
          x: (room.x + 1.8) * TILE_SIZE,
          y: (room.y + room.h - 1.8) * TILE_SIZE,
          opened: false,
          value: 20 + floor * 8,
        });
      }
    } else if (room.type === 'boss') {
      const bossName =
        biomeSpec.bossNames[Math.floor(rng() * biomeSpec.bossNames.length)];
      const boss = makeEnemy(
        `boss_${floor}_${enemySeq++}`,
        'boss',
        room.id,
        centerWorldX,
        centerWorldY,
        hpScale,
        true,
        floor,
        biomeSpec.id
      );
      boss.name = bossName;
      enemies.push(boss);

      const bossMinion1: EnemyKind =
        floor === 1 ? 'skeleton' : floor === 2 ? 'cultist' : floor === 3 ? 'knight' : floor === 4 ? 'shadow_stalker' : 'astral_sentinel';
      const bossMinion2: EnemyKind =
        floor === 1 ? 'goblin' : floor === 2 ? 'skeleton' : floor === 3 ? 'cultist' : floor === 4 ? 'cultist' : 'shadow_stalker';

      enemies.push(
        makeEnemy(
          `en_${floor}_${enemySeq++}`,
          bossMinion1,
          room.id,
          centerWorldX - 86,
          centerWorldY - 56,
          hpScale,
          false,
          floor,
          biomeSpec.id
        )
      );
      enemies.push(
        makeEnemy(
          `en_${floor}_${enemySeq++}`,
          bossMinion2,
          room.id,
          centerWorldX + 86,
          centerWorldY + 56,
          hpScale,
          false,
          floor,
          biomeSpec.id
        )
      );

      portalPos = {
        x: centerWorldX,
        y: centerWorldY,
      };
      setTile(room.cx, room.cy, 5);
    }
  }

  const map: DungeonMap = {
    floor,
    seed: baseSeed,
    biome: biomeSpec.id,
    biomeTitle: biomeSpec.title,
    width,
    height,
    tiles,
    rooms,
    torches,
    portalPos,
    portalActive: false,
  };

  return {
    map,
    enemies,
    props,
    spawnPoint: {
      x: startRoom.cx * TILE_SIZE + TILE_SIZE / 2,
      y: startRoom.cy * TILE_SIZE + TILE_SIZE / 2,
    },
  };
}

function getEnemyResistances(
  kind: EnemyKind,
  elite: boolean,
  floor: number,
  biome?: BiomeId
): EnemyResistances {
  switch (kind) {
    case 'slime':
      return {
        physical: 0.20,
        fire: -0.15,
        frost: 0.10,
        lightning: 0.20,
        poison: 0.60,
        bleed: 0.90, // slimes cannot bleed
        tenacity: 0.05,
      };
    case 'goblin':
      return {
        physical: elite ? 0.12 : 0.05,
        fire: 0.05,
        frost: 0.05,
        lightning: 0.05,
        poison: 0.20,
        bleed: 0.10,
        tenacity: elite ? 0.15 : 0.05,
      };
    case 'skeleton':
      return {
        physical: -0.10, // brittle bones take more blunt damage
        fire: 0.10,
        frost: 0.40,
        lightning: 0.10,
        poison: 0.95, // undead has no poison susceptibility
        bleed: 0.95,  // cannot bleed
        tenacity: elite ? 0.20 : 0.10,
      };
    case 'cultist':
      return {
        physical: 0.05,
        fire: 0.25,
        frost: 0.25,
        lightning: 0.35,
        poison: 0.25,
        bleed: 0.10,
        tenacity: elite ? 0.25 : 0.15,
      };
    case 'knight':
      return {
        physical: elite ? 0.42 : 0.32, // plate armor
        fire: 0.15,
        frost: 0.10,
        lightning: -0.10, // metal conducts shock
        poison: 0.20,
        bleed: 0.30,
        tenacity: elite ? 0.35 : 0.25,
      };
    case 'shadow_stalker':
      return {
        physical: elite ? 0.25 : 0.18,
        fire: 0.10,
        frost: 0.20,
        lightning: -0.15, // fragile to shock
        poison: 0.50,
        bleed: 0.65, // spectral shadow substance
        tenacity: elite ? 0.45 : 0.30,
      };
    case 'astral_sentinel':
      return {
        physical: elite ? 0.45 : 0.38, // hardened celestial crystal armor
        fire: 0.30,
        frost: 0.30,
        lightning: 0.40,
        poison: 0.70, // stone/crystal construct
        bleed: 0.90,  // cannot bleed
        tenacity: elite ? 0.55 : 0.40,
      };
    case 'boss': {
      if (biome === 'ember' || floor === 3) {
        return {
          physical: 0.30,
          fire: 0.75, // molten behemoth heavily resists fire
          frost: -0.15, // quenched by frost
          lightning: 0.25,
          poison: 0.40,
          bleed: 0.35,
          tenacity: 0.65, // 65% CC duration reduction
        };
      } else if (biome === 'catacombs' || floor === 2) {
        return {
          physical: 0.22,
          fire: -0.05,
          frost: 0.65, // spectral arch-lich resists frost
          lightning: 0.30,
          poison: 0.85, // undead
          bleed: 0.85,  // undead
          tenacity: 0.60,
        };
      } else if (biome === 'void' || floor === 4) {
        return {
          physical: 0.35,
          fire: 0.30,
          frost: 0.30,
          lightning: 0.30,
          poison: 0.60,
          bleed: 0.70, // shadowy void entity resists bleed
          tenacity: 0.70, // 70% CC duration reduction
        };
      } else if (biome === 'astral' || floor === 5) {
        return {
          physical: 0.40,
          fire: 0.45,
          frost: 0.45,
          lightning: 0.50, // celestial entity resists elemental magic
          poison: 0.50,
          bleed: 0.40,
          tenacity: 0.75, // 75% CC duration reduction
        };
      } else {
        return {
          physical: 0.25,
          fire: 0.20,
          frost: 0.25,
          lightning: 0.20,
          poison: 0.45,
          bleed: 0.30,
          tenacity: 0.55,
        };
      }
    }
  }
}

export function makeEnemy(
  id: string,
  kind: EnemyKind,
  roomId: number,
  x: number,
  y: number,
  hpScale: number,
  elite: boolean,
  floor = 1,
  biome: BiomeId = 'courtyard'
): EnemyState {
  const baseStats: Record<
    EnemyKind,
    { name: string; hp: number; radius: number }
  > = {
    slime: { name: 'Mire Slime', hp: 46, radius: 13 },
    goblin: { name: 'Grimalkin Raider', hp: 56, radius: 13 },
    skeleton: { name: 'Bone Marksman', hp: 52, radius: 13 },
    cultist: { name: 'Void Acolyte', hp: 68, radius: 14 },
    knight: { name: 'Dread Halberdier', hp: 105, radius: 16 },
    shadow_stalker: { name: 'Abyssal Stalker', hp: 88, radius: 15 },
    astral_sentinel: { name: 'Celestial Sentinel', hp: 122, radius: 17 },
    boss: { name: 'Warden Malakor', hp: 950, radius: 28 },
  };
  const spec = baseStats[kind];
  const eliteMult = kind === 'boss' ? (1 + (floor - 1) * 0.28) : elite ? 1.55 : 1;
  const maxHp = Math.round(spec.hp * hpScale * eliteMult);
  return {
    id,
    kind,
    name: elite && kind !== 'boss' ? `Elite ${spec.name.trim()}` : spec.name.trim(),
    roomId,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: maxHp,
    maxHp,
    radius: kind === 'boss' ? 28 : elite ? spec.radius + 3 : spec.radius,
    state: 'idle',
    windupMs: kind === 'boss' ? 700 : 800 + Math.floor(Math.random() * 600),
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
    elite,
    resistances: getEnemyResistances(kind, elite, floor, biome),
    enraged: false,
    charging: false,
    chargeTimerMs: 0,
  };
}

export function generateTavernFloor(): {
  map: DungeonMap;
  enemies: EnemyState[];
  props: PropState[];
  npcs: NpcState[];
  trainingDummies: TrainingDummyState[];
  spawnPoint: { x: number; y: number };
} {
  const width = 48;
  const height = 34;
  const tiles = new Array<number>(width * height).fill(0);

  // 1. Base Wooden Floor (code 1)
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      tiles[y * width + x] = 1;
    }
  }

  // 2. Outer Timber Walls (code 2)
  for (let x = 3; x < width - 3; x++) {
    tiles[3 * width + x] = 2;
    tiles[(height - 4) * width + x] = 2;
  }
  for (let y = 3; y < height - 3; y++) {
    tiles[y * width + 3] = 2;
    tiles[y * width + (width - 4)] = 2;
  }

  // Entrance doorway opening on West wall
  tiles[15 * width + 3] = 1;
  tiles[16 * width + 3] = 1;

  // 3. Fireplace Hearth Stone Floor (code 5) & Chimney Wall
  for (let y = 4; y <= 6; y++) {
    for (let x = 20; x <= 26; x++) {
      tiles[y * width + x] = 5;
    }
  }
  // Fireplace stone mantle frame (code 2 for wall collision)
  tiles[3 * width + 21] = 2;
  tiles[3 * width + 22] = 2;
  tiles[3 * width + 24] = 2;
  tiles[3 * width + 25] = 2;

  // 4. L-Shaped Oak Bar Counter (code 2 for solid collision)
  for (let x = 11; x <= 22; x++) {
    tiles[8 * width + x] = 2;
  }
  for (let y = 8; y <= 11; y++) {
    tiles[y * width + 22] = 2;
  }

  // 5. Central Royal Velvet Rug (code 4)
  for (let y = 14; y <= 21; y++) {
    for (let x = 14; x <= 28; x++) {
      tiles[y * width + x] = 4;
    }
  }

  // 6. Training Grounds Arena Dirt Ring (code 6) & Wooden Fencing
  for (let y = 12; y <= 28; y++) {
    for (let x = 33; x <= 43; x++) {
      tiles[y * width + x] = 6;
    }
  }
  // Fence pillars (code 3)
  for (let y = 12; y <= 28; y += 4) {
    tiles[y * width + 32] = 3;
  }
  // Gate gap at y=18..19
  tiles[18 * width + 32] = 6;
  tiles[19 * width + 32] = 6;

  // Structural Heavy Timber Support Pillars (code 3)
  const pillars = [
    { x: 10, y: 14 },
    { x: 10, y: 24 },
    { x: 30, y: 14 },
    { x: 30, y: 24 },
  ];
  for (const p of pillars) {
    tiles[p.y * width + p.x] = 3;
  }

  const rooms: RoomNode[] = [
    {
      id: 0,
      x: 3,
      y: 3,
      w: width - 6,
      h: height - 6,
      cx: Math.floor(width / 2),
      cy: Math.floor(height / 2),
      type: 'start',
      cleared: true,
      discovered: true,
    },
  ];

  const torches = [
    { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE },
    { x: 19 * TILE_SIZE, y: 4 * TILE_SIZE },
    { x: 27 * TILE_SIZE, y: 4 * TILE_SIZE },
    { x: 31 * TILE_SIZE, y: 5 * TILE_SIZE },
    { x: 5 * TILE_SIZE, y: 28 * TILE_SIZE },
    { x: 30 * TILE_SIZE, y: 28 * TILE_SIZE },
    { x: 43 * TILE_SIZE, y: 13 * TILE_SIZE },
    { x: 43 * TILE_SIZE, y: 27 * TILE_SIZE },
  ];

  const props: PropState[] = [
    { id: 'prop_tav_1', kind: 'crate', x: 6 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 10 },
    { id: 'prop_tav_2', kind: 'crate', x: 7 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 10 },
    { id: 'prop_tav_3', kind: 'chest', x: 42 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 50 },
  ];

  const npcs: NpcState[] = [
    {
      id: 'npc_lena',
      name: 'Barkeep Lena',
      x: 16.5 * TILE_SIZE,
      y: 6.2 * TILE_SIZE,
      dialogue: 'Welcome to the Rusty Tankard! Care for a glass of honeyed mead?',
      spriteKind: 'barkeep',
    },
    {
      id: 'npc_bram',
      name: 'Innkeeper Bram',
      x: 8.5 * TILE_SIZE,
      y: 13.5 * TILE_SIZE,
      dialogue: 'Greetings, adventurer! Rest by our warm hearth fireplace.',
      spriteKind: 'innkeeper',
    },
    {
      id: 'npc_jorah',
      name: 'Veteran Jorah',
      x: 31 * TILE_SIZE,
      y: 18.5 * TILE_SIZE,
      dialogue: 'Test your steel against the training dummies in my arena!',
      spriteKind: 'veteran',
    },
    {
      id: 'npc_aleph',
      name: 'Aleph',
      x: 18 * TILE_SIZE,
      y: 28 * TILE_SIZE,
      dialogue: 'The paths you walk are many, but your soul remains constant. Do you seek a different focus?',
      spriteKind: 'mysterious_cloak',
      options: [
        { id: 'reset_stats', label: 'I wish to reset my attributes.' },
        { id: 'lore', label: 'Who are you?' }
      ]
    },
  ];

  const trainingDummies: TrainingDummyState[] = [
    {
      id: 'dummy_1',
      x: 38 * TILE_SIZE,
      y: 16 * TILE_SIZE,
      hp: 9999,
      maxHp: 9999,
      hitAnimMs: 0,
    },
    {
      id: 'dummy_2',
      x: 38 * TILE_SIZE,
      y: 24 * TILE_SIZE,
      hp: 9999,
      maxHp: 9999,
      hitAnimMs: 0,
    },
  ];

  const map: DungeonMap = {
    floor: 0,
    seed: 99999,
    biome: 'courtyard',
    biomeTitle: 'The Rusty Tankard Tavern',
    width,
    height,
    tiles,
    rooms,
    torches,
    portalPos: { x: 42 * TILE_SIZE, y: 9 * TILE_SIZE },
    portalActive: true,
  };

  return {
    map,
    enemies: [],
    props,
    npcs,
    trainingDummies,
    spawnPoint: {
      x: 21 * TILE_SIZE,
      y: 18 * TILE_SIZE,
    },
  };
}
