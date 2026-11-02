import {
  TILE_SIZE,
  type BiomeId,
  type DifficultyTier,
  type DungeonMap,
  type EnemyKind,
  type EnemyState,
  type PropState,
  type RoomNode,
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
    bossNames: ['Warden Malakor', 'Sir Vane the Hollow'],
  },
  {
    id: 'catacombs',
    title: 'Sunken Reliquary',
    bossNames: ['Archlich Vaelor', 'Dread Prelate Moros'],
  },
  {
    id: 'ember',
    title: 'Cindervault Bastion',
    bossNames: ['Ignis, Cinder Sovereign', 'Pyrelord Kaelen'],
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
            ? ['goblin', 'skeleton', 'cultist', 'knight']
            : ['skeleton', 'cultist', 'knight', 'slime'];

      for (let i = 0; i < enemyCount; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
        const ex = (room.x + 2 + rng() * (room.w - 4)) * TILE_SIZE;
        const ey = (room.y + 2 + rng() * (room.h - 4)) * TILE_SIZE;
        const elite = rng() < 0.16 + floor * 0.04;
        enemies.push(makeEnemy(`en_${floor}_${enemySeq++}`, kind, room.id, ex, ey, hpScale, elite));
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
        true
      );
      boss.name = bossName;
      enemies.push(boss);

      enemies.push(
        makeEnemy(
          `en_${floor}_${enemySeq++}`,
          floor >= 2 ? 'cultist' : 'skeleton',
          room.id,
          centerWorldX - 86,
          centerWorldY - 56,
          hpScale,
          false
        )
      );
      enemies.push(
        makeEnemy(
          `en_${floor}_${enemySeq++}`,
          floor >= 2 ? 'knight' : 'goblin',
          room.id,
          centerWorldX + 86,
          centerWorldY + 56,
          hpScale,
          false
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

function makeEnemy(
  id: string,
  kind: EnemyKind,
  roomId: number,
  x: number,
  y: number,
  hpScale: number,
  elite: boolean
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
    boss: { name: 'Warden Malakor', hp: 460, radius: 26 },
  };
  const spec = baseStats[kind];
  const eliteMult = kind === 'boss' ? 1 : elite ? 1.55 : 1;
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
    radius: kind === 'boss' ? 26 : elite ? spec.radius + 3 : spec.radius,
    state: 'idle',
    windupMs: 800 + Math.floor(Math.random() * 600),
    targetX: x,
    targetY: y,
    markedMs: 0,
    slowedMs: 0,
    stunnedMs: 0,
    elite,
  };
}
