// server.ts
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import pg from "pg";
import { WebSocket, WebSocketServer } from "ws";

// src/shared/types.ts
var MAX_LEVEL = 100;
var MAX_ATTRIBUTE = 100;
var HERO_CLASSES = {
  vanguard: {
    id: "vanguard",
    name: "Vanguard",
    title: "Ironcrest Bastion",
    role: "Frontline Guardian & Juggernaut",
    roleBadge: "TANK",
    weapon: "Sunforged Claymore & Tower Greatshield",
    weaponType: "Heavy Cleave & Shield Wall",
    passiveName: "Iron Will",
    passiveDesc: "Absorbs 15% of all incoming damage. Striking stunned or burning foes restores +3 Shield.",
    maxHp: 155,
    speed: 175,
    damage: 28,
    attackCooldownMs: 400,
    range: 78,
    primaryColor: "#64748B",
    secondaryColor: "#CBD5E1",
    capeColor: "#991B1B",
    accentColor: "#F59E0B",
    glowColor: "#FBBF24",
    lore: "Sworn knights of the Sunken Bastion who bound their lifeblood into eternal steel. With unbroken wills and towering shields, they stand between ancient horrors and their comrades.",
    stats: { survivability: 5, damage: 3, range: 1, mobility: 2, utility: 4 },
    resistances: { physical: 0.28, fire: 0.15, frost: 0.15, lightning: 0.1, poison: 0.15, bleed: 0.3 },
    tacticalName: "Bulwark Dash",
    tacticalDesc: "Slam forward with tower shield, battering through monsters, stunning them for 1.6s and granting +28 Shield to nearby allies.",
    tacticalCooldownMs: 4800,
    ultName: "Aegis Sanctuary",
    ultDesc: "Plant your colossal shield into the earth, raising a gleaming dome that deflects projectile barrages and boosts party defense.",
    ultCooldownMs: 13e3
  },
  ranger: {
    id: "ranger",
    name: "Ranger",
    title: "Thornwood Marksman",
    role: "Long-Range Sniper & Scout",
    roleBadge: "MARKSMAN",
    weapon: "Ashwood Recurve & Barbed Quiver",
    weaponType: "Piercing Ranged Bow",
    passiveName: "Eagle Keenness",
    passiveDesc: "Attacks deal +25% Critical damage to targets beyond 180 units. Slaying a foe grants a 2s burst of swiftness.",
    maxHp: 110,
    speed: 210,
    damage: 24,
    attackCooldownMs: 320,
    range: 380,
    primaryColor: "#2D5A3C",
    secondaryColor: "#4ADE80",
    capeColor: "#1A3826",
    accentColor: "#FBBF24",
    glowColor: "#34D399",
    lore: "Sole survivors of the blighted Thornwood groves, master trackers capable of loose-drawing three enchanted shafts in the blink of an eye. Their arrows never falter.",
    stats: { survivability: 2, damage: 5, range: 5, mobility: 5, utility: 2 },
    resistances: { physical: 0.1, fire: 0.1, frost: 0.25, lightning: 0.15, poison: 0.45, bleed: 0.2 },
    tacticalName: "Frost Volley",
    tacticalDesc: "Loose a 5-arrow crystalline fan that pierces foes, slowing enemy advance by 50% and chilling their attacks.",
    tacticalCooldownMs: 4200,
    ultName: "Hunter Quarry",
    ultDesc: "Mark elites and bosses with radiant moonlight hunters-brand, exposing their weak points so all co-op allies deal +35% bonus strike damage.",
    ultCooldownMs: 11500
  },
  arcanist: {
    id: "arcanist",
    name: "Arcanist",
    title: "Astral Conduit",
    role: "AoE Spellweaver & Cosmic Blaster",
    roleBadge: "CASTER",
    weapon: "Runebound Spire & Orbiting Astral Orbs",
    weaponType: "Cosmic Shards & Starlight",
    passiveName: "Astral Resonance",
    passiveDesc: "Basic attacks loose homing cosmic shards that pierce an additional enemy. Spells leave lingering star rifts.",
    maxHp: 100,
    speed: 188,
    damage: 32,
    attackCooldownMs: 420,
    range: 340,
    primaryColor: "#4338CA",
    secondaryColor: "#818CF8",
    capeColor: "#312E81",
    accentColor: "#38BDF8",
    glowColor: "#60A5FA",
    lore: "Scholars of the shattered celestial spires who channel raw starlight through crystalline conduits. They weave time and void to obliterate dungeon hordes from afar.",
    stats: { survivability: 2, damage: 5, range: 4, mobility: 3, utility: 4 },
    resistances: { physical: 0.05, fire: 0.25, frost: 0.35, lightning: 0.45, poison: 0.15, bleed: 0.1 },
    tacticalName: "Astral Nova",
    tacticalDesc: "Unleash 8 piercing arcane shards in a starburst, knocking back surrounding monsters with void energy.",
    tacticalCooldownMs: 5e3,
    ultName: "Chrono Well",
    ultDesc: "Anchor a cosmic gravitational well that snares enemies, pulling them in while accelerating allied cooldowns by 50%.",
    ultCooldownMs: 13500
  },
  cleric: {
    id: "cleric",
    name: "Cleric",
    title: "Sunbrand Prelate",
    role: "Radiant Healer & Divine Enchanter",
    roleBadge: "SUPPORT",
    weapon: "Dawnstar Flanged Mace & Reliquary",
    weaponType: "Radiant Smite & Holy Relic",
    passiveName: "Radiant Aura",
    passiveDesc: "Emits a sacred 140-range warmth that heals wounded party members every 2 seconds (scales with Level & Faith, base 4 HP, +50% when critical), and increases revive speed by 40%.",
    maxHp: 128,
    speed: 185,
    damage: 22,
    attackCooldownMs: 380,
    range: 290,
    primaryColor: "#E2E8F0",
    secondaryColor: "#FDE047",
    capeColor: "#854D0E",
    accentColor: "#FACC15",
    glowColor: "#FEF08A",
    lore: "Devotees of the Eternal Dawn whose sacred chants can mend the gravest wounds and turn undead to ash. A cornerstone of every surviving expedition into the depths.",
    stats: { survivability: 4, damage: 3, range: 3, mobility: 2, utility: 5 },
    resistances: { physical: 0.15, fire: 0.4, frost: 0.2, lightning: 0.15, poison: 0.35, bleed: 0.25 },
    tacticalName: "Sanctified Pulse",
    tacticalDesc: "Release a blinding wave of golden light, healing you and all nearby party members (scales with Level & Faith, base 36 HP) while searing adjacent undead.",
    tacticalCooldownMs: 5400,
    ultName: "Solar Beacon",
    ultDesc: "Consecrate holy ground with an avatar of the Sun that continuously heals all allies (scales with Level & Faith, base 9 HP) and rapidly revives downed teammates who enter.",
    ultCooldownMs: 14e3
  }
};
var RELIC_CATALOG = [
  {
    id: "crimson_fang",
    name: "Crimson Fang",
    category: "Offense",
    summary: "Restore +5 HP whenever you slay an enemy.",
    accent: "#D14B4B"
  },
  {
    id: "twinstring_charm",
    name: "Twinstring Charm",
    category: "Offense",
    summary: "Primary attacks unleash +1 additional projectile or cleave wave, but extra projectiles deal 75% damage.",
    accent: "#E0A94F"
  },
  {
    id: "zephyr_greaves",
    name: "Zephyr Greaves",
    category: "Mobility",
    summary: "+18% movement speed across all terrain.",
    accent: "#68B89E"
  },
  {
    id: "sunfire_signet",
    name: "Sunfire Signet",
    category: "Offense",
    summary: "+24% primary and skill damage.",
    accent: "#E88348"
  },
  {
    id: "bastion_pauldron",
    name: "Bastion Pauldron",
    category: "Defense",
    summary: "+30 Max HP and immediate +30 HP recovery.",
    accent: "#8D9BB5"
  },
  {
    id: "hourglass_shard",
    name: "Hourglass Shard",
    category: "Mobility",
    summary: "Tactical and Ultimate cooldowns recharge 25% faster.",
    accent: "#76B5E8"
  },
  {
    id: "keen_arrowhead",
    name: "Keen Arrowhead",
    category: "Offense",
    summary: "+25% critical strike chance for 1.75x damage.",
    accent: "#DFC15E"
  },
  {
    id: "oathbound_censer",
    name: "Oathbound Censer",
    category: "Co-op",
    summary: "Using your Tactical skill heals nearby co-op allies for +14 HP.",
    accent: "#E8CE76"
  },
  {
    id: "runic_carapace",
    name: "Runic Carapace",
    category: "Defense",
    summary: "Gain +22 Shield upon entering new rooms, and passive +15% Physical Resistance & +20% Status/Elemental Resistances.",
    accent: "#6E85C9"
  },
  {
    id: "piercing_prism",
    name: "Piercing Prism",
    category: "Offense",
    summary: "Projectiles and waves pierce +1 extra enemy target.",
    accent: "#A988E6"
  },
  {
    id: "cinder_heart",
    name: "Cinder Heart",
    category: "Offense",
    summary: "Critical hits and tactical skills Ignite enemies with Burn DoT (ticks fiery damage every 0.8s for 4s).",
    accent: "#F97316"
  },
  {
    id: "rimefrost_shard",
    name: "Rimefrost Shard",
    category: "Offense",
    summary: "Attacks have 25% chance to Chill. Striking a Chilled enemy Freezes them in solid ice; shattering deals +60% bonus damage.",
    accent: "#38BDF8"
  },
  {
    id: "stormcaller_lodestone",
    name: "Stormcaller Lodestone",
    category: "Offense",
    summary: "Every 3rd strike inflicts Shock for 5s. Damaging a Shocked foe arcs lightning bolts to up to 3 nearby enemies.",
    accent: "#FBBF24"
  },
  {
    id: "viper_crucible",
    name: "Viper Crucible",
    category: "Offense",
    summary: "Attacks apply virulent Poison for 6s, dealing continuous acid damage and reducing enemy damage output by 30%.",
    accent: "#22C55E"
  },
  {
    id: "bloodletter_talisman",
    name: "Bloodletter Talisman",
    category: "Offense",
    summary: "Strikes lacerate targets with Bleed for 5s. Bleeding enemies take damage that doubles whenever they attempt to move.",
    accent: "#DC2626"
  },
  {
    id: "thorned_aegis",
    name: "Thorned Aegis",
    category: "Defense",
    summary: "When your Shield absorbs enemy damage, discharge a concussive shockwave that Stuns adjacent attackers for 1.8s.",
    accent: "#A855F7"
  }
];
var TILE_SIZE = 32;

// src/server/dungeonGenerator.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var BIOMES = [
  {
    id: "courtyard",
    title: "Highkeep Outer Bailey",
    bossNames: ["Warden Malakor"]
  },
  {
    id: "catacombs",
    title: "Sunken Crypt",
    bossNames: ["Archlich Vaelor"]
  },
  {
    id: "ember",
    title: "Cindervault Bastion",
    bossNames: ["Ignis, Cinder Sovereign"]
  },
  {
    id: "void",
    title: "Abyssal Shadow Chasm",
    bossNames: ["Void-Eater Malice"]
  },
  {
    id: "astral",
    title: "Aetherial Void Spire",
    bossNames: ["Archon of Nothingness"]
  }
];
function generateDungeonFloor(floor, baseSeed, difficulty, partySize) {
  const floorSeed = (baseSeed >>> 0) + floor * 7919 >>> 0;
  const rng = mulberry32(floorSeed);
  const width = 58;
  const height = 44;
  const tiles = new Array(width * height).fill(0);
  const biomeSpec = BIOMES[(floor - 1) % BIOMES.length];
  const setTile = (tx, ty, code) => {
    if (tx >= 1 && tx < width - 1 && ty >= 1 && ty < height - 1) {
      tiles[ty * width + tx] = code;
    }
  };
  const getTile = (tx, ty) => {
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return 0;
    return tiles[ty * width + tx];
  };
  const rooms2 = [];
  const targetRoomCount = 8;
  const startW = 8;
  const startH = 8;
  const startX = 4;
  const startY = Math.floor(height / 2 - startH / 2);
  rooms2.push({
    id: 0,
    x: startX,
    y: startY,
    w: startW,
    h: startH,
    cx: Math.floor(startX + startW / 2),
    cy: Math.floor(startY + startH / 2),
    type: "start",
    cleared: true,
    discovered: true
  });
  let attempts = 0;
  while (rooms2.length < targetRoomCount && attempts < 260) {
    attempts++;
    const isBossCandidate = rooms2.length === targetRoomCount - 1;
    const rw = isBossCandidate ? 12 : 7 + Math.floor(rng() * 5);
    const rh = isBossCandidate ? 11 : 7 + Math.floor(rng() * 4);
    const rx = isBossCandidate ? width - rw - 4 - Math.floor(rng() * 4) : 4 + Math.floor(rng() * (width - rw - 8));
    const ry = 4 + Math.floor(rng() * (height - rh - 8));
    const overlaps = rooms2.some(
      (r) => rx < r.x + r.w + 3 && rx + rw + 3 > r.x && ry < r.y + r.h + 3 && ry + rh + 3 > r.y
    );
    if (!overlaps) {
      rooms2.push({
        id: rooms2.length,
        x: rx,
        y: ry,
        w: rw,
        h: rh,
        cx: Math.floor(rx + rw / 2),
        cy: Math.floor(ry + rh / 2),
        type: "combat",
        cleared: false,
        discovered: false
      });
    }
  }
  const startRoom = rooms2[0];
  const sortedByDist = rooms2.slice(1).sort(
    (a, b) => Math.hypot(a.cx - startRoom.cx, a.cy - startRoom.cy) - Math.hypot(b.cx - startRoom.cx, b.cy - startRoom.cy)
  );
  if (sortedByDist.length >= 3) {
    const bossRoom = sortedByDist[sortedByDist.length - 1];
    bossRoom.type = "boss";
    const treasureRoom = sortedByDist[Math.floor(sortedByDist.length / 2)];
    if (treasureRoom.id !== bossRoom.id) {
      treasureRoom.type = "treasure";
      treasureRoom.cleared = true;
    }
    const shrineRoom = sortedByDist[1];
    if (shrineRoom.id !== bossRoom.id && shrineRoom.id !== treasureRoom.id) {
      shrineRoom.type = "shrine";
      shrineRoom.cleared = true;
    }
  }
  for (const room of rooms2) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        setTile(x, y, 1);
      }
    }
  }
  const connected = /* @__PURE__ */ new Set([0]);
  const remaining = new Set(rooms2.slice(1).map((r) => r.id));
  const edges = [];
  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestPair = null;
    for (const cId of connected) {
      const rc = rooms2[cId];
      for (const uId of remaining) {
        const ru = rooms2[uId];
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
  if (rooms2.length >= 5) {
    edges.push([rooms2[1], rooms2[3]]);
  }
  const carveCorridor = (ax, ay, bx, by) => {
    let cx = ax;
    let cy = ay;
    const horizFirst = rng() > 0.5;
    const stampFloor = (px, py) => {
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
  const torches = [];
  const enemies = [];
  const props = [];
  let propSeq = 1;
  let enemySeq = 1;
  const diffMult = difficulty === "Abyssal" ? 1.55 : difficulty === "Heroic" ? 1.25 : 1;
  const partyMult = 1 + Math.max(0, partySize - 1) * 0.55;
  const floorMult = 1 + (floor - 1) * 0.32;
  const hpScale = diffMult * partyMult * floorMult;
  let portalPos = {
    x: (startRoom.cx + 1) * TILE_SIZE + TILE_SIZE / 2,
    y: startRoom.cy * TILE_SIZE + TILE_SIZE / 2
  };
  for (const room of rooms2) {
    const torchCandidates = [
      { tx: room.x + 1, ty: room.y + 1 },
      { tx: room.x + room.w - 2, ty: room.y + 1 },
      { tx: room.x + 1, ty: room.y + room.h - 2 },
      { tx: room.x + room.w - 2, ty: room.y + room.h - 2 }
    ];
    for (const tc of torchCandidates) {
      if (getTile(tc.tx, tc.ty) === 1 && rng() > 0.22) {
        torches.push({
          x: tc.tx * TILE_SIZE + TILE_SIZE / 2,
          y: tc.ty * TILE_SIZE + TILE_SIZE / 2
        });
      }
    }
    if ((room.type === "combat" || room.type === "boss") && room.w >= 9 && room.h >= 9) {
      const pOffsets = [
        [room.x + 2, room.y + 2],
        [room.x + room.w - 3, room.y + 2],
        [room.x + 2, room.y + room.h - 3],
        [room.x + room.w - 3, room.y + room.h - 3]
      ];
      for (const [px, py] of pOffsets) {
        if (getTile(px, py) === 1) {
          setTile(px, py, 3);
        }
      }
    }
    const centerWorldX = room.cx * TILE_SIZE + TILE_SIZE / 2;
    const centerWorldY = room.cy * TILE_SIZE + TILE_SIZE / 2;
    if (room.type === "start") {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "crate",
        x: (room.x + 2) * TILE_SIZE + 16,
        y: (room.y + 2) * TILE_SIZE + 16,
        opened: false,
        value: 12
      });
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "potion",
        x: (room.x + room.w - 2) * TILE_SIZE + 16,
        y: (room.y + 2) * TILE_SIZE + 16,
        opened: false,
        value: 1
      });
    } else if (room.type === "treasure") {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "relic_chest",
        x: centerWorldX,
        y: centerWorldY,
        opened: false,
        value: 1
      });
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "chest",
        x: centerWorldX - 48,
        y: centerWorldY + 28,
        opened: false,
        value: 35
      });
    } else if (room.type === "shrine") {
      props.push({
        id: `prop_${floor}_${propSeq++}`,
        kind: "shrine",
        x: centerWorldX,
        y: centerWorldY,
        opened: false,
        value: 55
      });
    } else if (room.type === "combat") {
      const enemyCount = 3 + Math.floor(rng() * 3) + Math.min(2, Math.floor(floor / 2));
      const pool = floor === 1 ? ["slime", "goblin", "skeleton"] : floor === 2 ? ["goblin", "skeleton", "cultist"] : floor === 3 ? ["skeleton", "knight", "cultist"] : floor === 4 ? ["cultist", "shadow_stalker", "skeleton"] : ["astral_sentinel", "cultist", "shadow_stalker"];
      for (let i = 0; i < enemyCount; i++) {
        const kind = pool[Math.floor(rng() * pool.length)];
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
          kind: rng() > 0.65 ? "chest" : "crate",
          x: (room.x + 1.8) * TILE_SIZE,
          y: (room.y + room.h - 1.8) * TILE_SIZE,
          opened: false,
          value: 20 + floor * 8
        });
      }
    } else if (room.type === "boss") {
      const bossName = biomeSpec.bossNames[Math.floor(rng() * biomeSpec.bossNames.length)];
      const boss = makeEnemy(
        `boss_${floor}_${enemySeq++}`,
        "boss",
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
      const bossMinion1 = floor === 1 ? "skeleton" : floor === 2 ? "cultist" : floor === 3 ? "knight" : floor === 4 ? "shadow_stalker" : "astral_sentinel";
      const bossMinion2 = floor === 1 ? "goblin" : floor === 2 ? "skeleton" : floor === 3 ? "cultist" : floor === 4 ? "cultist" : "shadow_stalker";
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
        y: centerWorldY
      };
      setTile(room.cx, room.cy, 5);
    }
  }
  const map = {
    floor,
    seed: baseSeed,
    biome: biomeSpec.id,
    biomeTitle: biomeSpec.title,
    width,
    height,
    tiles,
    rooms: rooms2,
    torches,
    portalPos,
    portalActive: false
  };
  return {
    map,
    enemies,
    props,
    spawnPoint: {
      x: startRoom.cx * TILE_SIZE + TILE_SIZE / 2,
      y: startRoom.cy * TILE_SIZE + TILE_SIZE / 2
    }
  };
}
function getEnemyResistances(kind, elite, floor, biome) {
  switch (kind) {
    case "slime":
      return {
        physical: 0.2,
        fire: -0.15,
        frost: 0.1,
        lightning: 0.2,
        poison: 0.6,
        bleed: 0.9,
        // slimes cannot bleed
        tenacity: 0.05,
        arcane: 0.15,
        divine: 0.1
      };
    case "goblin":
      return {
        physical: elite ? 0.12 : 0.05,
        fire: 0.05,
        frost: 0.05,
        lightning: 0.05,
        poison: 0.2,
        bleed: 0.1,
        tenacity: elite ? 0.15 : 0.05,
        arcane: 0.05,
        divine: 0.05
      };
    case "skeleton":
      return {
        physical: -0.1,
        // brittle bones take more blunt damage
        fire: 0.1,
        frost: 0.4,
        lightning: 0.1,
        poison: 0.95,
        // undead has no poison susceptibility
        bleed: 0.95,
        // cannot bleed
        tenacity: elite ? 0.2 : 0.1,
        arcane: 0.15,
        divine: -0.25
        // undead vulnerable to divine holy light
      };
    case "cultist":
      return {
        physical: 0.05,
        fire: 0.25,
        frost: 0.25,
        lightning: 0.35,
        poison: 0.25,
        bleed: 0.1,
        tenacity: elite ? 0.25 : 0.15,
        arcane: 0.3,
        divine: -0.15
        // dark cultist vulnerable to holy light
      };
    case "knight":
      return {
        physical: elite ? 0.42 : 0.32,
        // plate armor
        fire: 0.15,
        frost: 0.1,
        lightning: -0.1,
        // metal conducts shock
        poison: 0.2,
        bleed: 0.3,
        tenacity: elite ? 0.35 : 0.25,
        arcane: 0.1,
        divine: 0.1
      };
    case "shadow_stalker":
      return {
        physical: elite ? 0.25 : 0.18,
        fire: 0.1,
        frost: 0.2,
        lightning: -0.15,
        // fragile to shock
        poison: 0.5,
        bleed: 0.65,
        // spectral shadow substance
        tenacity: elite ? 0.45 : 0.3,
        arcane: 0.25,
        divine: -0.2
        // shadow entity vulnerable to divine light
      };
    case "astral_sentinel":
      return {
        physical: elite ? 0.45 : 0.38,
        // hardened celestial crystal armor
        fire: 0.3,
        frost: 0.3,
        lightning: 0.4,
        poison: 0.7,
        // stone/crystal construct
        bleed: 0.9,
        // cannot bleed
        tenacity: elite ? 0.55 : 0.4,
        arcane: 0.4,
        divine: 0.3
      };
    case "boss": {
      if (biome === "ember" || floor === 3) {
        return {
          physical: 0.3,
          fire: 0.75,
          // molten behemoth heavily resists fire
          frost: -0.15,
          // quenched by frost
          lightning: 0.25,
          poison: 0.4,
          bleed: 0.35,
          tenacity: 0.65,
          // 65% CC duration reduction
          arcane: 0.2,
          divine: 0.15
        };
      } else if (biome === "catacombs" || floor === 2) {
        return {
          physical: 0.22,
          fire: -0.05,
          frost: 0.65,
          // spectral arch-lich resists frost
          lightning: 0.3,
          poison: 0.85,
          // undead
          bleed: 0.85,
          // undead
          tenacity: 0.6,
          arcane: 0.25,
          divine: -0.3
          // Arch-Lich vulnerable to divine holy light
        };
      } else if (biome === "void" || floor === 4) {
        return {
          physical: 0.35,
          fire: 0.3,
          frost: 0.3,
          lightning: 0.3,
          poison: 0.6,
          bleed: 0.7,
          // shadowy void entity resists bleed
          tenacity: 0.7,
          // 70% CC duration reduction
          arcane: 0.35,
          divine: -0.2
          // Void boss vulnerable to divine light
        };
      } else if (biome === "astral" || floor === 5) {
        return {
          physical: 0.4,
          fire: 0.45,
          frost: 0.45,
          lightning: 0.5,
          // celestial entity resists elemental magic
          poison: 0.5,
          bleed: 0.4,
          tenacity: 0.75,
          // 75% CC duration reduction
          arcane: 0.45,
          divine: 0.4
        };
      } else {
        return {
          physical: 0.25,
          fire: 0.2,
          frost: 0.25,
          lightning: 0.2,
          poison: 0.45,
          bleed: 0.3,
          tenacity: 0.55,
          arcane: 0.2,
          divine: 0.1
        };
      }
    }
  }
}
function makeEnemy(id, kind, roomId, x, y, hpScale, elite, floor = 1, biome = "courtyard") {
  const baseStats = {
    slime: { name: "Mire Slime", hp: 46, radius: 13 },
    goblin: { name: "Grimalkin Raider", hp: 56, radius: 13 },
    skeleton: { name: "Bone Marksman", hp: 52, radius: 13 },
    cultist: { name: "Void Acolyte", hp: 68, radius: 14 },
    knight: { name: "Dread Halberdier", hp: 105, radius: 16 },
    shadow_stalker: { name: "Abyssal Stalker", hp: 88, radius: 15 },
    astral_sentinel: { name: "Celestial Sentinel", hp: 122, radius: 17 },
    boss: { name: "Warden Malakor", hp: 950, radius: 28 }
  };
  const spec = baseStats[kind];
  const eliteMult = kind === "boss" ? 1 + (floor - 1) * 0.28 : elite ? 1.55 : 1;
  const maxHp = Math.round(spec.hp * hpScale * eliteMult);
  return {
    id,
    kind,
    name: elite && kind !== "boss" ? `Elite ${spec.name.trim()}` : spec.name.trim(),
    roomId,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: maxHp,
    maxHp,
    radius: kind === "boss" ? 28 : elite ? spec.radius + 3 : spec.radius,
    state: "idle",
    windupMs: kind === "boss" ? 700 : 800 + Math.floor(Math.random() * 600),
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
    chargeTimerMs: 0
  };
}
function generateTavernFloor() {
  const width = 48;
  const height = 34;
  const tiles = new Array(width * height).fill(0);
  for (let y = 3; y < height - 3; y++) {
    for (let x = 3; x < width - 3; x++) {
      tiles[y * width + x] = 1;
    }
  }
  for (let x = 3; x < width - 3; x++) {
    tiles[3 * width + x] = 2;
    tiles[(height - 4) * width + x] = 2;
  }
  for (let y = 3; y < height - 3; y++) {
    tiles[y * width + 3] = 2;
    tiles[y * width + (width - 4)] = 2;
  }
  tiles[15 * width + 3] = 1;
  tiles[16 * width + 3] = 1;
  for (let y = 4; y <= 6; y++) {
    for (let x = 20; x <= 26; x++) {
      tiles[y * width + x] = 5;
    }
  }
  tiles[3 * width + 21] = 2;
  tiles[3 * width + 22] = 2;
  tiles[3 * width + 24] = 2;
  tiles[3 * width + 25] = 2;
  for (let x = 11; x <= 22; x++) {
    tiles[8 * width + x] = 2;
  }
  for (let y = 8; y <= 11; y++) {
    tiles[y * width + 22] = 2;
  }
  for (let y = 14; y <= 21; y++) {
    for (let x = 14; x <= 28; x++) {
      tiles[y * width + x] = 4;
    }
  }
  for (let y = 12; y <= 28; y++) {
    for (let x = 33; x <= 43; x++) {
      tiles[y * width + x] = 6;
    }
  }
  for (let y = 12; y <= 28; y += 4) {
    tiles[y * width + 32] = 3;
  }
  tiles[18 * width + 32] = 6;
  tiles[19 * width + 32] = 6;
  const pillars = [
    { x: 10, y: 14 },
    { x: 10, y: 24 },
    { x: 30, y: 14 },
    { x: 30, y: 24 }
  ];
  for (const p of pillars) {
    tiles[p.y * width + p.x] = 3;
  }
  const rooms2 = [
    {
      id: 0,
      x: 3,
      y: 3,
      w: width - 6,
      h: height - 6,
      cx: Math.floor(width / 2),
      cy: Math.floor(height / 2),
      type: "start",
      cleared: true,
      discovered: true
    }
  ];
  const torches = [
    { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE },
    { x: 19 * TILE_SIZE, y: 4 * TILE_SIZE },
    { x: 27 * TILE_SIZE, y: 4 * TILE_SIZE },
    { x: 31 * TILE_SIZE, y: 5 * TILE_SIZE },
    { x: 5 * TILE_SIZE, y: 28 * TILE_SIZE },
    { x: 30 * TILE_SIZE, y: 28 * TILE_SIZE },
    { x: 43 * TILE_SIZE, y: 13 * TILE_SIZE },
    { x: 43 * TILE_SIZE, y: 27 * TILE_SIZE }
  ];
  const props = [
    { id: "prop_tav_1", kind: "crate", x: 6 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 10 },
    { id: "prop_tav_2", kind: "crate", x: 7 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 10 },
    { id: "prop_tav_3", kind: "chest", x: 42 * TILE_SIZE, y: 5 * TILE_SIZE, opened: false, value: 50 }
  ];
  const npcs = [
    {
      id: "npc_lena",
      name: "Barkeep Lena",
      x: 16.5 * TILE_SIZE,
      y: 6.2 * TILE_SIZE,
      dialogue: "Welcome to the Rusty Tankard! Care for a glass of honeyed mead?",
      spriteKind: "barkeep"
    },
    {
      id: "npc_bram",
      name: "Innkeeper Bram",
      x: 8.5 * TILE_SIZE,
      y: 13.5 * TILE_SIZE,
      dialogue: "Greetings, adventurer! Rest by our warm hearth fireplace.",
      spriteKind: "innkeeper"
    },
    {
      id: "npc_jorah",
      name: "Veteran Jorah",
      x: 31 * TILE_SIZE,
      y: 18.5 * TILE_SIZE,
      dialogue: "Test your steel against the training dummies in my arena!",
      spriteKind: "veteran"
    },
    {
      id: "npc_aleph",
      name: "Aleph",
      x: 18 * TILE_SIZE,
      y: 28 * TILE_SIZE,
      dialogue: "The paths you walk are many, but your soul remains constant. Do you seek a different focus?",
      spriteKind: "mysterious_cloak",
      options: [
        { id: "reset_stats", label: "I wish to reset my attributes." },
        { id: "lore", label: "Who are you?" }
      ]
    }
  ];
  const trainingDummies = [
    {
      id: "dummy_1",
      x: 38 * TILE_SIZE,
      y: 16 * TILE_SIZE,
      hp: 9999,
      maxHp: 9999,
      hitAnimMs: 0
    },
    {
      id: "dummy_2",
      x: 38 * TILE_SIZE,
      y: 24 * TILE_SIZE,
      hp: 9999,
      maxHp: 9999,
      hitAnimMs: 0
    }
  ];
  const map = {
    floor: 0,
    seed: 99999,
    biome: "courtyard",
    biomeTitle: "The Rusty Tankard Tavern",
    width,
    height,
    tiles,
    rooms: rooms2,
    torches,
    portalPos: { x: 42 * TILE_SIZE, y: 9 * TILE_SIZE },
    portalActive: true
  };
  return {
    map,
    enemies: [],
    props,
    npcs,
    trainingDummies,
    spawnPoint: {
      x: 21 * TILE_SIZE,
      y: 18 * TILE_SIZE
    }
  };
}

// src/server/gameEngine.ts
var MAX_FLOORS_FOR_VICTORY = 5;
var GameRoom = class _GameRoom {
  constructor(opts) {
    this.status = "playing";
    this.floor = 1;
    this.enemies = [];
    this.projectiles = [];
    this.props = [];
    this.zones = [];
    this.npcs = [];
    this.trainingDummies = [];
    this.pendingEvents = [];
    this.chat = [];
    this.spawnPoint = { x: 256, y: 256 };
    this.players = /* @__PURE__ */ new Map();
    this.entitySeq = 1;
    this.startedAt = Date.now();
    this.zoneTickAccumMs = 0;
    this.statusDotAccumMs = 0;
    this.clericAuraAccumMs = 0;
    this.roomId = opts.roomId;
    this.name = opts.name;
    this.hostName = opts.hostName;
    this.difficulty = opts.difficulty;
    this.maxPlayers = opts.roomId === "TAVERN-HUB" ? 50 : 4;
    this.baseSeed = opts.seed && opts.seed > 0 ? Math.floor(opts.seed) : Math.floor(1e5 + Math.random() * 899999);
    const startFloor = opts.roomId === "TAVERN-HUB" ? 0 : 1;
    this.loadFloor(startFloor, 1);
  }
  static computePlayerMaxHp(heroClass, level, vitality, relics = []) {
    const def = HERO_CLASSES[heroClass];
    const baseHp = def ? def.maxHp : 100;
    const levelBonus = (Math.max(1, level) - 1) * 12;
    const vitBonus = (vitality || 0) * 6;
    const relicBonus = relics.includes("bastion_pauldron") ? 30 : 0;
    return baseHp + levelBonus + vitBonus + relicBonus;
  }
  static computeHealingAmount(baseHealing, healer) {
    if (baseHealing <= 0) return 0;
    if (!healer || healer.heroClass !== "cleric") {
      return Math.max(1, Math.round(baseHealing));
    }
    const lvl = Math.max(1, healer.level || 1);
    const fth = Math.max(0, healer.faith || 0);
    const levelMult = 1 + (lvl - 1) * 0.05;
    const faithMult = 1 + fth * 0.03;
    const scaled = baseHealing * levelMult * faithMult;
    return Math.max(1, Math.round(scaled));
  }
  computeHealingAmount(baseHealing, healer) {
    return _GameRoom.computeHealingAmount(baseHealing, healer);
  }
  static getEnemyResistance(res, category) {
    if (!res) return 0;
    let rawRes = 0;
    switch (category) {
      case "physical":
        rawRes = res.physical ?? 0;
        break;
      case "arcane":
        rawRes = res.arcane ?? ((res.fire ?? 0) + (res.frost ?? 0) + (res.lightning ?? 0)) / 3;
        break;
      case "divine":
        rawRes = res.divine ?? ((res.fire ?? 0) + (res.lightning ?? 0)) / 2;
        break;
      case "fire":
        rawRes = res.fire ?? 0;
        break;
      case "frost":
        rawRes = res.frost ?? 0;
        break;
      case "lightning":
        rawRes = res.lightning ?? 0;
        break;
      case "poison":
        rawRes = res.poison ?? 0;
        break;
      case "bleed":
        rawRes = res.bleed ?? 0;
        break;
      default:
        rawRes = res.physical ?? 0;
        break;
    }
    return Math.min(0.75, Math.max(-0.5, rawRes));
  }
  getEnemyResistance(res, category) {
    return _GameRoom.getEnemyResistance(res, category);
  }
  nextId(prefix) {
    return `${prefix}_${this.entitySeq++}`;
  }
  loadFloor(floorNum, partySize) {
    if (this.roomId === "TAVERN-HUB") {
      floorNum = 0;
    }
    this.floor = floorNum;
    if (floorNum === 0) {
      const tav = generateTavernFloor();
      this.map = tav.map;
      this.enemies = tav.enemies;
      this.props = tav.props;
      this.npcs = tav.npcs;
      this.trainingDummies = tav.trainingDummies;
      this.projectiles = [];
      this.zones = [];
      this.spawnPoint = tav.spawnPoint;
    } else {
      const generated = generateDungeonFloor(
        floorNum,
        this.baseSeed,
        this.difficulty,
        Math.max(1, partySize)
      );
      this.map = generated.map;
      this.enemies = generated.enemies;
      this.props = generated.props;
      this.npcs = [];
      this.trainingDummies = [];
      this.projectiles = [];
      this.zones = [];
      this.spawnPoint = generated.spawnPoint;
    }
    let idx = 0;
    for (const pr of this.players.values()) {
      const offsetAngle = idx * Math.PI / 2;
      pr.state.x = this.spawnPoint.x + Math.cos(offsetAngle) * 20;
      pr.state.y = this.spawnPoint.y + Math.sin(offsetAngle) * 20;
      pr.state.readyNextFloor = false;
      pr.enteredRooms.clear();
      pr.enteredRooms.add(0);
      if (pr.state.downed) {
        pr.state.downed = false;
        pr.state.hp = Math.round(pr.state.maxHp * 0.5);
      } else {
        pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + 25);
      }
      idx++;
    }
  }
  restartRun() {
    this.status = "playing";
    this.startedAt = Date.now();
    for (const pr of this.players.values()) {
      pr.state.shield = 0;
      pr.state.gold = 0;
      pr.state.potions = 2;
      pr.state.relics = [];
      pr.state.pendingRelicChoices = [];
      pr.state.downed = false;
      pr.state.downedTimerMs = 0;
      pr.state.reviveProgress = 0;
      pr.state.kills = 0;
      pr.state.damageDealt = 0;
      pr.state.revives = 0;
      pr.state.skillCooldownMs = 0;
      pr.state.ultCooldownMs = 0;
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(
        pr.state.heroClass,
        pr.state.level,
        pr.state.vitality,
        pr.state.relics
      );
      pr.state.hp = pr.state.maxHp;
    }
    const restartFloor = this.roomId === "TAVERN-HUB" ? 0 : 1;
    this.loadFloor(restartFloor, this.players.size);
    this.pushSystemChat(
      this.roomId === "TAVERN-HUB" ? `Sanctuary Tavern refreshed.` : `Expedition restarted on Seed ${this.baseSeed}.`
    );
    return this.map;
  }
  addOrReconnectPlayer(playerId, username, heroClass, isAdmin = false, savedStats) {
    const existing = this.players.get(playerId);
    if (existing) {
      existing.state.connected = true;
      existing.state.username = username;
      existing.state.isAdmin = isAdmin || Boolean(existing.state.isAdmin);
      return existing.state;
    }
    const def = HERO_CLASSES[heroClass];
    const idx = this.players.size;
    let sx = this.spawnPoint.x + (idx % 2 === 0 ? -18 : 18);
    let sy = this.spawnPoint.y + (idx < 2 ? -14 : 14);
    for (const ally of this.players.values()) {
      if (ally.state.connected && !ally.state.downed) {
        sx = ally.state.x + 22;
        sy = ally.state.y;
        break;
      }
    }
    const state = {
      id: playerId,
      username,
      heroClass,
      x: sx,
      y: sy,
      vx: 0,
      vy: 0,
      aimAngle: 0,
      hp: def.maxHp,
      maxHp: def.maxHp,
      shield: 15,
      level: savedStats?.level || 1,
      xp: savedStats?.xp || 0,
      nextXp: savedStats ? Math.round(80 * Math.pow(1.35, savedStats.level - 1)) : 80,
      gold: 0,
      potions: 2,
      relics: [],
      downed: false,
      downedTimerMs: 0,
      reviveProgress: 0,
      skillCooldownMs: 0,
      maxSkillCooldownMs: def.tacticalCooldownMs,
      ultCooldownMs: 0,
      maxUltCooldownMs: def.ultCooldownMs,
      attackAnimMs: 0,
      hasteMs: 0,
      kills: 0,
      damageDealt: 0,
      revives: 0,
      readyNextFloor: false,
      pendingRelicChoices: [],
      connected: true,
      isAdmin,
      godMode: false,
      speedBoost: false,
      dexterity: savedStats?.dexterity || 0,
      vitality: savedStats?.vitality || 0,
      strength: savedStats?.strength || 0,
      intelligence: savedStats?.intelligence || 0,
      faith: savedStats?.faith || 0,
      attributePoints: savedStats?.attributePoints || 0
    };
    if (state.level >= MAX_LEVEL) {
      state.nextXp = 999999;
      state.xp = 0;
    }
    state.maxHp = _GameRoom.computePlayerMaxHp(state.heroClass, state.level, state.vitality, state.relics);
    state.hp = state.maxHp;
    this.players.set(playerId, {
      state,
      input: {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: 0
      },
      attackCooldownMs: 0,
      enteredRooms: /* @__PURE__ */ new Set([0]),
      attackCount: 0
    });
    this.pushSystemChat(`${username} (${def.name}) joined the expedition.`);
    return state;
  }
  removePlayer(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    this.players.delete(playerId);
    this.pushSystemChat(`${pr.state.username} departed the party.`);
    if (this.players.size > 0 && pr.state.username === this.hostName) {
      const first = this.players.values().next().value;
      if (first) this.hostName = first.state.username;
    }
  }
  getPlayerCount() {
    return this.players.size;
  }
  hasPlayer(playerId) {
    return this.players.has(playerId);
  }
  getPlayerState(playerId) {
    return this.players.get(playerId)?.state;
  }
  isPlayerNearNpc(playerId, npcIdOrName, maxDistance = 85) {
    const p = this.players.get(playerId)?.state;
    if (!p) return false;
    const target = this.npcs.find(
      (n) => n.id === npcIdOrName || n.name.toLowerCase() === npcIdOrName.toLowerCase()
    );
    if (!target) return false;
    return Math.hypot(target.x - p.x, target.y - p.y) <= maxDistance;
  }
  pushChat(sender, text, system = false) {
    const msg = {
      id: this.nextId("chat"),
      sender,
      text: text.slice(0, 180),
      timestamp: Date.now(),
      system
    };
    this.chat.push(msg);
    if (this.chat.length > 40) this.chat.shift();
    return msg;
  }
  pushSystemChat(text) {
    return this.pushChat("Sanctuary", text, true);
  }
  updateInput(playerId, input) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.input = {
      up: Boolean(input.up),
      down: Boolean(input.down),
      left: Boolean(input.left),
      right: Boolean(input.right),
      attack: Boolean(input.attack),
      aimAngle: Number.isFinite(input.aimAngle) ? input.aimAngle : 0,
      stickX: typeof input.stickX === "number" ? input.stickX : void 0,
      stickY: typeof input.stickY === "number" ? input.stickY : void 0
    };
    pr.state.aimAngle = pr.input.aimAngle;
  }
  changeClass(playerId, heroClass) {
    const pr = this.players.get(playerId);
    if (!pr || pr.state.downed) return;
    const def = HERO_CLASSES[heroClass];
    if (!def) return;
    const hpRatio = pr.state.hp / Math.max(1, pr.state.maxHp);
    pr.state.heroClass = heroClass;
    pr.state.maxHp = _GameRoom.computePlayerMaxHp(heroClass, pr.state.level, pr.state.vitality, pr.state.relics);
    pr.state.hp = Math.max(1, Math.round(pr.state.maxHp * hpRatio));
    pr.state.maxSkillCooldownMs = def.tacticalCooldownMs;
    pr.state.maxUltCooldownMs = def.ultCooldownMs;
    this.emitEvent("status", pr.state.x, pr.state.y - 22, def.name, def.accentColor);
  }
  addPing(playerId, label, x, y) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    this.emitEvent(
      "ping",
      x,
      y,
      `${pr.state.username}: ${label.slice(0, 24)}`,
      "#F4D378"
    );
  }
  selectRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    if (!pr.state.pendingRelicChoices.includes(relicId)) return;
    pr.state.pendingRelicChoices = [];
    if (!pr.state.relics.includes(relicId)) {
      pr.state.relics.push(relicId);
    }
    if (relicId === "bastion_pauldron") {
      const oldMax = pr.state.maxHp;
      pr.state.maxHp = _GameRoom.computePlayerMaxHp(pr.state.heroClass, pr.state.level, pr.state.vitality, pr.state.relics);
      pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + (pr.state.maxHp - oldMax));
    }
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (relic) {
      this.emitEvent("status", pr.state.x, pr.state.y - 24, `+ ${relic.name}`, relic.accent);
      this.pushSystemChat(`${pr.state.username} claimed relic: ${relic.name}.`);
    }
  }
  togglePlayerGodMode(playerId, enabled) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== void 0 ? enabled : !pr.state.godMode;
    pr.state.godMode = nextState;
    if (nextState) {
      pr.state.hp = pr.state.maxHp;
    }
    this.emitEvent(
      "status",
      pr.state.x,
      pr.state.y - 28,
      nextState ? " GOD MODE ON" : "\uFE0F GOD MODE OFF",
      nextState ? "#F59E0B" : "#64748B"
    );
    return nextState;
  }
  togglePlayerSpeedBoost(playerId, enabled) {
    const pr = this.players.get(playerId);
    if (!pr) return false;
    const nextState = enabled !== void 0 ? enabled : !pr.state.speedBoost;
    pr.state.speedBoost = nextState;
    this.emitEvent(
      "status",
      pr.state.x,
      pr.state.y - 28,
      nextState ? " SPEED BOOST ON" : " SPEED NORMAL",
      nextState ? "#10B981" : "#64748B"
    );
    return nextState;
  }
  addPlayerGold(playerId, amount) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.gold += amount;
    this.emitEvent("gold", pr.state.x, pr.state.y - 22, `+${amount}g`, "#F4D378");
  }
  addPlayerPotions(playerId, amount) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.potions += amount;
    this.emitEvent("heal", pr.state.x, pr.state.y - 22, `+${amount} Potions`, "#EF4444");
  }
  setPlayerLevel(playerId, targetLevel) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const def = HERO_CLASSES[p.heroClass];
    p.level = Math.max(1, Math.min(MAX_LEVEL, targetLevel));
    p.xp = 0;
    p.nextXp = p.level >= MAX_LEVEL ? 999999 : Math.round(80 * Math.pow(1.35, p.level - 1));
    p.strength = 0;
    p.vitality = 0;
    p.dexterity = 0;
    p.intelligence = 0;
    p.faith = 0;
    p.attributePoints = (p.level - 1) * 2;
    p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics);
    p.hp = p.maxHp;
    this.emitEvent("status", p.x, p.y - 26, `Level ${p.level} Set!`, "#F4D378");
    if (this.onProgressionUpdateCallback) this.onProgressionUpdateCallback(p.id, p);
  }
  addPlayerRelic(playerId, relicId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    const relic = RELIC_CATALOG.find((r) => r.id === relicId);
    if (!relic) return;
    if (!p.relics.includes(relicId)) {
      p.relics.push(relicId);
    }
    if (relicId === "bastion_pauldron") {
      const oldMax = p.maxHp;
      p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics);
      p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMax));
    }
    this.emitEvent("status", p.x, p.y - 24, `+ ${relic.name}`, relic.accent);
  }
  addPlayerAttributePoints(playerId, amount) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    pr.state.attributePoints += amount;
    this.emitEvent("status", pr.state.x, pr.state.y - 24, `+${amount} Attribute Pts`, "#D9AA52");
  }
  updatePlayerAttributes(playerId, strength, vitality, dexterity, intelligence, faith, attributePoints) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const p = pr.state;
    p.strength = strength;
    p.vitality = vitality;
    p.dexterity = dexterity;
    p.intelligence = intelligence;
    p.faith = faith;
    p.attributePoints = attributePoints;
    const oldMax = p.maxHp;
    p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics);
    p.hp += p.maxHp - oldMax;
    p.hp = Math.min(p.maxHp, p.hp);
    if (this.onProgressionUpdateCallback) this.onProgressionUpdateCallback(p.id, p);
  }
  spawnDummyAtPlayer(playerId) {
    const pr = this.players.get(playerId);
    if (!pr) return;
    const dummy = {
      id: this.nextId("dummy"),
      x: pr.state.x + 40 * Math.cos(pr.state.aimAngle),
      y: pr.state.y + 40 * Math.sin(pr.state.aimAngle),
      hp: 1e4,
      maxHp: 1e4,
      hitAnimMs: 0,
      totalDamageTaken: 0,
      lastHitTimerMs: 0
    };
    this.trainingDummies.push(dummy);
    this.emitEvent("status", dummy.x, dummy.y - 20, "\uFE0F Training Dummy Spawned", "#FBBF24");
  }
  rollRelicChoices(owned) {
    const unowned = RELIC_CATALOG.filter((r) => !owned.includes(r.id));
    const unownedPool = [...unowned];
    const picked = [];
    while (picked.length < 3 && unownedPool.length > 0) {
      const idx = Math.floor(Math.random() * unownedPool.length);
      picked.push(unownedPool[idx].id);
      unownedPool.splice(idx, 1);
    }
    if (picked.length < 3) {
      const fallbackPool = RELIC_CATALOG.filter((r) => !picked.includes(r.id));
      while (picked.length < 3 && fallbackPool.length > 0) {
        const idx = Math.floor(Math.random() * fallbackPool.length);
        picked.push(fallbackPool[idx].id);
        fallbackPool.splice(idx, 1);
      }
    }
    return picked;
  }
  performAction(playerId, action, aimAngle = 0) {
    const pr = this.players.get(playerId);
    if (!pr || this.status !== "playing") return {};
    const p = pr.state;
    if (p.downed) return {};
    p.aimAngle = Number.isFinite(aimAngle) ? aimAngle : p.aimAngle;
    const def = HERO_CLASSES[p.heroClass];
    const cdrMult = p.relics.includes("hourglass_shard") ? 0.75 : 1;
    if (action === "potion") {
      if (p.potions > 0 && p.hp < p.maxHp) {
        p.potions -= 1;
        const healAmt = Math.round(p.maxHp * 0.45);
        p.hp = Math.min(p.maxHp, p.hp + healAmt);
        this.emitEvent("heal", p.x, p.y - 20, `+${healAmt} HP`, "#5CD68D");
      }
      return {};
    }
    if (action === "interact") {
      for (const npc of this.npcs) {
        const dist = Math.hypot(npc.x - p.x, npc.y - p.y);
        if (dist <= 68) {
          const heroClassName = HERO_CLASSES[p.heroClass]?.name || "Adventurer";
          let lines = [];
          if (npc.id === "npc_bram") {
            lines = [
              `Welcome to The Rusty Tankard, ${p.username}! Pull up a stool by the hearth and warm your hands.`,
              "I have seen hundreds of adventurers cross my doorstep. The secret to surviving Beyond is party coordination.",
              "Rest your legs! Lena just brewed a fresh pot of hearty venison stew over the fireplace.",
              "Look out for Warden Malakor on Floor 1! His tower shield can crush an unwary warrior in a single blow.",
              "Don't forget to break every crate and barrel you see down below\u2014relics and gold lie hidden everywhere!",
              "If your party falls in battle, a Cleric's Solar Beacon or another ally can revive you before time runs out."
            ];
          } else if (npc.id === "npc_lena") {
            const classTip = p.heroClass === "vanguard" ? "A Vanguard in heavy plate! Stand in the frontlines and pop your Shield to absorb boss slams." : p.heroClass === "ranger" ? "A Ranger from the Thornwood! Keep your distance and mark targets with Hunter Quarry for big crits." : p.heroClass === "arcanist" ? "An Arcanist! Cast Chrono Well in narrow choke points to slow down swarming monster waves." : "A Sunbrand Prelate! Keep your Solar Beacon ready when the party's health drops low.";
            lines = [
              `Ah, ${p.username}! Care for a mug of our signature honeyed mead or a glass of spiced cider?`,
              classTip,
              "Floor 1 is Highkeep Outer Bailey. Watch for Warden Malakor's crushing tower shield!",
              "Floor 2 is the Sunken Crypt. Archlich Vaelor casts necrotic soul frost that freezes anyone standing still.",
              "Floor 3 is Cindervault Bastion\u2014a searing inferno ruled by Ignis, Cinder Sovereign! Equip Cinder Heart and Runic Carapace relics if you find them.",
              "Floor 4 is the Abyssal Shadow Chasm! Void-Eater Malice opens black holes that pull heroes into oblivion.",
              "Floor 5 reaches the Aetherial Void Spire! The Archon of Nothingness unleashes devastating astral starlight novas.",
              "Need to blow off steam after a tough run? Practice your combo strikes on the dummies in the East wing!"
            ];
          } else if (npc.id === "npc_aleph") {
            lines = [
              "The paths you walk are many, but your soul remains constant. Do you seek a different focus?",
              "True strength comes not from the sword, but from knowing how to wield it.",
              "The stars whispered of your coming. I offer you the chance to begin anew."
            ];
            if (!npc.options || npc.options.length === 0) {
              npc.options = [
                { id: "reset_stats", label: "I wish to reset my attributes." },
                { id: "lore", label: "Who are you?" }
              ];
            }
          } else {
            const combatTip = p.heroClass === "vanguard" ? "Vanguard, your Shield Bash stuns elites for 1.7s! Use it to interrupt heavy boss attacks." : p.heroClass === "ranger" ? "Ranger, your Frost Volley pierces up to 5 foes at once. Keep kiting to control the room." : p.heroClass === "arcanist" ? "Arcanist, your Astral Nova releases an 8-way starburst that clears enemies surrounding you." : "Cleric, your Dawnstar Smite heals nearby allies while damaging surrounding foes simultaneously.";
            lines = [
              `Halt, ${p.username}! Keep your guard high and your weapon polished. Indecision gets heroes killed.`,
              combatTip,
              "When an enemy glows orange, they are winding up a heavy attack. Step out of the danger zone immediately!",
              "Relic synergies are key! Combining Stormcaller Lodestone with Viper Crucible inflicts Shock and Poison at once.",
              "Step into my training ring over there and test your DPS against my straw dummies anytime."
            ];
          }
          npc.speechIndex = ((npc.speechIndex ?? -1) + 1) % lines.length;
          const spoken = lines[npc.speechIndex];
          npc.dialogue = spoken;
          npc.speakingMs = npc.options && npc.options.length > 0 ? 9999999 : 5e3;
          this.emitEvent("status", npc.x, npc.y - 28, `"${spoken}"`, "#FDE68A");
          this.pushSystemChat(` ${npc.name}: "${spoken}"`);
        }
      }
      for (const dummy of this.trainingDummies) {
        const dist = Math.hypot(dummy.x - p.x, dummy.y - p.y);
        if (dist <= 72) {
          dummy.totalDamageTaken = 0;
          dummy.lastHitTimerMs = 0;
          this.emitEvent("status", dummy.x, dummy.y - 44, " Counter Reset", "#38BDF8");
          this.pushSystemChat(` ${p.username} reset the Training Dummy damage tracker.`);
          return {};
        }
      }
      for (const prop of this.props) {
        if (prop.opened) continue;
        const dist = Math.hypot(prop.x - p.x, prop.y - p.y);
        if (dist <= 62) {
          prop.opened = true;
          if (prop.kind === "chest" || prop.kind === "crate") {
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            if (Math.random() < 0.45) {
              p.potions = Math.min(5, p.potions + 1);
              this.emitEvent("heal", prop.x, prop.y - 18, "+1 Potion", "#6EE7B7");
            }
            this.emitEvent("gold", prop.x, prop.y - 8, `+${prop.value} Gold`, "#F4D378");
          } else if (prop.kind === "potion") {
            p.potions = Math.min(5, p.potions + 1);
            this.emitEvent("heal", prop.x, prop.y - 12, "+1 Potion", "#6EE7B7");
          } else if (prop.kind === "relic_chest") {
            for (const ally of this.players.values()) {
              ally.state.pendingRelicChoices = this.rollRelicChoices(ally.state.relics);
            }
            this.emitEvent("status", prop.x, prop.y - 20, "Relic Vault Opened", "#E8CE76");
            this.pushSystemChat(`${p.username} unlocked an Ancient Relic Chest for the party.`);
          } else if (prop.kind === "shrine") {
            for (const ally of this.players.values()) {
              if (ally.state.downed) {
                ally.state.downed = false;
                ally.state.hp = Math.round(ally.state.maxHp * 0.6);
              } else {
                ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + prop.value);
              }
              ally.state.shield = Math.max(ally.state.shield, 25);
              this.emitEvent(
                "heal",
                ally.state.x,
                ally.state.y - 20,
                `+${prop.value} Shrine Blessing`,
                "#7CE8A6"
              );
            }
            this.pushSystemChat(`${p.username} invoked a Sanctuary Shrine, restoring the party.`);
          }
          return {};
        }
      }
      if (this.floor > 0 && this.roomId !== "TAVERN-HUB" && this.map.portalActive) {
        const portalDist = Math.hypot(
          this.map.portalPos.x - p.x,
          this.map.portalPos.y - p.y
        );
        if (portalDist <= 68) {
          p.readyNextFloor = true;
          const activePlayers = Array.from(this.players.values()).filter(
            (r) => r.state.connected && !r.state.downed
          );
          const readyPlayers = activePlayers.filter((r) => r.state.readyNextFloor);
          if (readyPlayers.length >= activePlayers.length) {
            if (this.onFloorClearedCallback) {
              this.onFloorClearedCallback(
                Array.from(this.players.keys()),
                this.floor
              );
            }
            if (this.floor >= MAX_FLOORS_FOR_VICTORY) {
              this.status = "victory";
              this.pushSystemChat(
                `Victory! The party conquered Floor ${this.floor} and reclaimed Beyond!`
              );
              return {};
            }
            this.loadFloor(this.floor + 1, this.players.size);
            this.pushSystemChat(
              `Descending to Floor ${this.floor}: ${this.map.biomeTitle}.`
            );
            return { floorChanged: this.map };
          } else {
            this.emitEvent(
              "status",
              this.map.portalPos.x,
              this.map.portalPos.y - 26,
              `Portal Ready (${readyPlayers.length}/${activePlayers.length})`,
              "#7CC6FE"
            );
          }
        }
      }
      return {};
    }
    if (action === "tactical") {
      if (p.skillCooldownMs > 0) return {};
      p.skillCooldownMs = Math.round(def.tacticalCooldownMs * cdrMult);
      p.maxSkillCooldownMs = p.skillCooldownMs;
      p.attackAnimMs = 240;
      if (p.relics.includes("oathbound_censer")) {
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 180) {
            ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + 14);
          }
        }
      }
      if (p.heroClass === "vanguard") {
        const dmgMult = this.computeDamageMult(p, "physical");
        const dashDist = 92;
        this.moveWithCollision(
          p,
          Math.cos(p.aimAngle) * dashDist,
          Math.sin(p.aimAngle) * dashDist,
          12
        );
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 170) {
            ally.state.shield = Math.min(60, ally.state.shield + 28);
            this.emitEvent("status", ally.state.x, ally.state.y - 22, "+28 Shield", "#93C5FD");
          }
        }
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 84) {
            enemy.stunnedMs = 1700;
            this.damageEnemy(enemy, Math.round(32 * dmgMult), p, false, "physical");
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 84) {
            this.damageDummy(dummy, Math.round(32 * dmgMult), p, false);
          }
        }
      } else if (p.heroClass === "ranger") {
        const dmgMult = this.computeDamageMult(p, "physical");
        const baseDmg = Math.round(18 * dmgMult);
        for (let i = -2; i <= 2; i++) {
          const ang = p.aimAngle + i * 0.14;
          this.spawnProjectile({
            ownerType: "player",
            ownerId: p.id,
            style: "arrow",
            x: p.x + Math.cos(ang) * 16,
            y: p.y + Math.sin(ang) * 16,
            vx: Math.cos(ang) * 430,
            vy: Math.sin(ang) * 430,
            angle: ang,
            radius: 5,
            damage: baseDmg,
            pierce: 2,
            slowOnHit: true,
            ttlMs: 950
          });
        }
      } else if (p.heroClass === "arcanist") {
        const dmgMult = this.computeDamageMult(p, "arcane");
        const baseDmg = Math.round(24 * dmgMult);
        for (let i = 0; i < 8; i++) {
          const ang = i * Math.PI / 4;
          this.spawnProjectile({
            ownerType: "player",
            ownerId: p.id,
            style: "arcane",
            x: p.x + Math.cos(ang) * 14,
            y: p.y + Math.sin(ang) * 14,
            vx: Math.cos(ang) * 340,
            vy: Math.sin(ang) * 340,
            angle: ang,
            radius: 7,
            damage: baseDmg,
            pierce: 2,
            ttlMs: 850
          });
        }
      } else if (p.heroClass === "cleric") {
        const dmgMult = this.computeDamageMult(p, "divine");
        const baseHeal = 36;
        const heal = this.computeHealingAmount(baseHeal, p);
        for (const ally of this.players.values()) {
          if (!ally.state.downed && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 210) {
            ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + heal);
            this.emitEvent("heal", ally.state.x, ally.state.y - 20, `+${heal} HP`, "#6EE7B7");
          }
        }
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 135) {
            this.damageEnemy(enemy, Math.round(28 * dmgMult), p, false, "divine");
          }
        }
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - p.x, dummy.y - p.y) <= 135) {
            this.damageDummy(dummy, Math.round(28 * dmgMult), p, false);
          }
        }
      }
      return {};
    }
    if (action === "ult") {
      if (p.ultCooldownMs > 0) return {};
      p.ultCooldownMs = Math.round(def.ultCooldownMs * cdrMult);
      p.maxUltCooldownMs = p.ultCooldownMs;
      if (p.heroClass === "vanguard") {
        this.zones.push({
          id: this.nextId("zone"),
          kind: "aegis_dome",
          x: p.x,
          y: p.y,
          radius: 105,
          ttlMs: 5500,
          maxTtlMs: 5500,
          ownerId: p.id
        });
        this.emitEvent("status", p.x, p.y - 26, "Aegis Ward Active", "#93C5FD");
      } else if (p.heroClass === "ranger") {
        for (const enemy of this.enemies) {
          if (Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 340) {
            enemy.markedMs = 6500;
          }
        }
        for (const ally of this.players.values()) {
          ally.state.hasteMs = 5e3;
        }
        this.emitEvent("status", p.x, p.y - 26, "Hunter Quarry Marked", "#FBBF24");
      } else if (p.heroClass === "arcanist") {
        const tx = p.x + Math.cos(p.aimAngle) * 110;
        const ty = p.y + Math.sin(p.aimAngle) * 110;
        this.zones.push({
          id: this.nextId("zone"),
          kind: "chrono_well",
          x: tx,
          y: ty,
          radius: 100,
          ttlMs: 5e3,
          maxTtlMs: 5e3,
          ownerId: p.id
        });
        this.emitEvent("status", tx, ty - 20, "Chrono Well", "#7CC6FE");
      } else if (p.heroClass === "cleric") {
        this.zones.push({
          id: this.nextId("zone"),
          kind: "solar_beacon",
          x: p.x,
          y: p.y,
          radius: 115,
          ttlMs: 6e3,
          maxTtlMs: 6e3,
          ownerId: p.id
        });
        this.emitEvent("status", p.x, p.y - 26, "Solar Beacon", "#FDE68A");
      }
      return {};
    }
    return {};
  }
  computeDamageMult(p, category = "physical") {
    let mult = 1 + (p.level - 1) * 0.1;
    if (category === "physical") {
      const physStat = p.heroClass === "ranger" ? p.dexterity || 0 : p.strength || 0;
      mult *= 1 + physStat * 0.03;
    } else if (category === "arcane") {
      mult *= 1 + (p.intelligence || 0) * 0.03;
    } else if (category === "divine") {
      mult *= 1 + (p.faith || 0) * 0.03;
    } else {
      const mainStat = p.heroClass === "ranger" ? p.dexterity || 0 : p.heroClass === "arcanist" ? p.intelligence || 0 : p.heroClass === "cleric" ? p.faith || 0 : p.strength || 0;
      mult *= 1 + mainStat * 0.03;
    }
    if (p.relics.includes("sunfire_signet")) mult *= 1.24;
    return mult;
  }
  tick(dtMs) {
    if (this.status !== "playing" || this.players.size === 0) return;
    const dtSec = dtMs / 1e3;
    this.zoneTickAccumMs += dtMs;
    const pulseZonesNow = this.zoneTickAccumMs >= 500;
    if (pulseZonesNow) this.zoneTickAccumMs = 0;
    for (const npc of this.npcs) {
      if (npc.speakingMs && npc.speakingMs > 0) {
        npc.speakingMs = Math.max(0, npc.speakingMs - dtMs);
      }
    }
    for (const dummy of this.trainingDummies) {
      if (dummy.hitAnimMs > 0) {
        dummy.hitAnimMs = Math.max(0, dummy.hitAnimMs - dtMs);
      }
      if (dummy.hp < dummy.maxHp) {
        dummy.hp = Math.min(dummy.maxHp, dummy.hp + Math.round(500 * dtSec));
      }
      if (dummy.lastHitTimerMs && dummy.lastHitTimerMs > 0) {
        dummy.lastHitTimerMs = Math.max(0, dummy.lastHitTimerMs - dtMs);
        if (dummy.lastHitTimerMs === 0 && dummy.totalDamageTaken && dummy.totalDamageTaken > 0) {
          dummy.totalDamageTaken = 0;
          this.emitEvent("status", dummy.x, dummy.y - 44, " Counter Reset", "#94A3B8");
        }
      }
    }
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.ttlMs -= dtMs;
      if (z.kind === "frost_nova" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 24 + this.floor * 4, "elemental");
            this.emitEvent("status", pr.state.x, pr.state.y - 14, " FROST NOVA!", "#38BDF8");
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "magma_pillar" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 28 + this.floor * 4, "elemental");
            this.emitEvent("status", pr.state.x, pr.state.y - 14, " BURNING!", "#EF4444");
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "singularity") {
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dx = z.x - pr.state.x;
            const dy = z.y - pr.state.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 6 && dist <= z.radius + 70) {
              const pullSpd = 140 * (1 - dist / (z.radius + 70));
              pr.state.x += dx / dist * pullSpd * dtSec;
              pr.state.y += dy / dist * pullSpd * dtSec;
            }
          }
        }
        if (z.ttlMs <= 0) {
          for (const pr of this.players.values()) {
            if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
              this.damagePlayer(pr.state, 32 + this.floor * 4, "elemental");
              this.emitEvent("status", pr.state.x, pr.state.y - 14, " VOID BURST!", "#A855F7");
            }
          }
          this.zones.splice(i, 1);
          continue;
        }
      }
      if (z.kind === "supernova") {
        const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
        const currentRadius = z.radius * progress;
        for (const pr of this.players.values()) {
          if (!pr.state.downed) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (Math.abs(dist - currentRadius) <= 18) {
              this.damagePlayer(pr.state, 26 + this.floor * 4, "elemental");
              this.emitEvent("status", pr.state.x, pr.state.y - 14, " SUPERNOVA!", "#F472B6");
            }
          }
        }
        if (z.ttlMs <= 0) {
          this.zones.splice(i, 1);
          continue;
        }
      }
      if (z.kind === "starlight_beam" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 30 + this.floor * 4, "elemental");
            this.emitEvent("status", pr.state.x, pr.state.y - 14, " STARBEAM!", "#38BDF8");
          }
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.kind === "boss_slam" && z.ttlMs <= 0) {
        for (const pr of this.players.values()) {
          if (!pr.state.downed && Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
            this.damagePlayer(pr.state, 30 + this.floor * 6, "physical");
          }
        }
        const isEmber = this.map.biome === "ember" || this.floor === 3;
        const isCatacombs = this.map.biome === "catacombs" || this.floor === 2;
        const isVoid = this.map.biome === "void" || this.floor === 4;
        const isAstral = this.map.biome === "astral" || this.floor === 5;
        const slamStyle = isEmber ? "fireball" : isVoid ? "voidorb" : isAstral ? "arcane" : isCatacombs ? "voidorb" : "bone";
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          this.spawnProjectile({
            ownerType: "enemy",
            ownerId: z.ownerId,
            style: slamStyle,
            x: z.x,
            y: z.y,
            vx: Math.cos(a) * 220,
            vy: Math.sin(a) * 220,
            angle: a,
            radius: 7,
            damage: 16 + this.floor * 3,
            pierce: 1,
            ttlMs: 1400
          });
        }
        this.zones.splice(i, 1);
        continue;
      }
      if (z.ttlMs <= 0) {
        this.zones.splice(i, 1);
        continue;
      }
      if (pulseZonesNow) {
        if (z.kind === "solar_beacon") {
          const ownerPr = this.players.get(z.ownerId);
          const ownerState = ownerPr ? ownerPr.state : null;
          const beaconHeal = this.computeHealingAmount(9, ownerState);
          for (const pr of this.players.values()) {
            const dist = Math.hypot(pr.state.x - z.x, pr.state.y - z.y);
            if (dist <= z.radius) {
              if (pr.state.downed) {
                pr.state.reviveProgress = Math.min(1, pr.state.reviveProgress + 0.38);
                if (pr.state.reviveProgress >= 1) {
                  this.completeRevive(pr.state, z.ownerId);
                }
              } else if (pr.state.hp < pr.state.maxHp) {
                pr.state.hp = Math.min(pr.state.maxHp, pr.state.hp + beaconHeal);
                this.emitEvent("heal", pr.state.x, pr.state.y - 16, `+${beaconHeal} Solar Beacon`, "#FEF08A");
              }
            }
          }
        } else if (z.kind === "chrono_well") {
          for (const enemy of this.enemies) {
            if (Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius) {
              enemy.slowedMs = 900;
            }
          }
          for (const pr of this.players.values()) {
            if (Math.hypot(pr.state.x - z.x, pr.state.y - z.y) <= z.radius) {
              pr.state.skillCooldownMs = Math.max(0, pr.state.skillCooldownMs - 350);
            }
          }
        } else if (z.kind === "star_rift") {
          const riftDmg = 14 + this.floor * 2;
          const ownerPr = this.players.get(z.ownerId);
          for (const enemy of this.enemies) {
            if (enemy.hp > 0 && Math.hypot(enemy.x - z.x, enemy.y - z.y) <= z.radius) {
              const pullAngle = Math.atan2(z.y - enemy.y, z.x - enemy.x);
              enemy.x += Math.cos(pullAngle) * 5;
              enemy.y += Math.sin(pullAngle) * 5;
              this.damageEnemy(enemy, riftDmg, ownerPr ? ownerPr.state : null, false);
            }
          }
          for (const dummy of this.trainingDummies) {
            if (Math.hypot(dummy.x - z.x, dummy.y - z.y) <= z.radius) {
              this.damageDummy(dummy, riftDmg, ownerPr ? ownerPr.state : null, false);
            }
          }
        }
      }
    }
    this.clericAuraAccumMs += dtMs;
    if (this.clericAuraAccumMs >= 2e3) {
      this.clericAuraAccumMs = 0;
      for (const pr of this.players.values()) {
        const cleric = pr.state;
        if (cleric.heroClass === "cleric" && !cleric.downed && cleric.connected) {
          for (const allyPr of this.players.values()) {
            const ally = allyPr.state;
            if (!ally.downed && ally.connected && Math.hypot(ally.x - cleric.x, ally.y - cleric.y) <= 140) {
              if (ally.hp < ally.maxHp) {
                const baseHeal = ally.hp < ally.maxHp * 0.5 ? 6 : 4;
                const healAmt = this.computeHealingAmount(baseHeal, cleric);
                ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                this.emitEvent("heal", ally.x, ally.y - 18, ` Radiant Aura +${healAmt}`, "#FDE047");
              }
            }
          }
        }
      }
    }
    for (const pr of this.players.values()) {
      const p = pr.state;
      pr.attackCooldownMs = Math.max(0, pr.attackCooldownMs - dtMs);
      p.skillCooldownMs = Math.max(0, p.skillCooldownMs - dtMs);
      p.ultCooldownMs = Math.max(0, p.ultCooldownMs - dtMs);
      p.attackAnimMs = Math.max(0, p.attackAnimMs - dtMs);
      p.hasteMs = Math.max(0, p.hasteMs - dtMs);
      if (p.downed) {
        p.vx = 0;
        p.vy = 0;
        p.downedTimerMs = Math.max(0, p.downedTimerMs - dtMs);
        let reviver = null;
        for (const ally of this.players.values()) {
          if (ally.state.id !== p.id && !ally.state.downed && ally.state.connected && Math.hypot(ally.state.x - p.x, ally.state.y - p.y) <= 56) {
            reviver = ally.state;
            break;
          }
        }
        if (reviver) {
          const reviveSpeedMult = reviver.heroClass === "cleric" ? 1.4 : 1;
          p.reviveProgress = Math.min(1, p.reviveProgress + dtSec / 2.2 * reviveSpeedMult);
          if (p.reviveProgress >= 1) {
            this.completeRevive(p, reviver.id);
          }
        } else {
          p.reviveProgress = Math.max(0, p.reviveProgress - dtSec * 0.25);
        }
        continue;
      }
      const def = HERO_CLASSES[p.heroClass];
      let moveSpeed = def.speed;
      if (p.relics.includes("zephyr_greaves")) moveSpeed *= 1.18;
      if (p.hasteMs > 0) moveSpeed *= 1.22;
      if (p.speedBoost) moveSpeed *= 1.8;
      let mx = 0;
      let my = 0;
      if (typeof pr.input.stickX === "number" && typeof pr.input.stickY === "number" && (Math.abs(pr.input.stickX) > 0.05 || Math.abs(pr.input.stickY) > 0.05)) {
        const len = Math.hypot(pr.input.stickX, pr.input.stickY);
        const clampedLen = Math.min(1, len);
        mx = pr.input.stickX / len * clampedLen;
        my = pr.input.stickY / len * clampedLen;
      } else {
        mx = (pr.input.right ? 1 : 0) - (pr.input.left ? 1 : 0);
        my = (pr.input.down ? 1 : 0) - (pr.input.up ? 1 : 0);
        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          mx /= len;
          my /= len;
        }
      }
      if (mx !== 0 || my !== 0) {
        p.vx = mx * moveSpeed;
        p.vy = my * moveSpeed;
        this.moveWithCollision(p, p.vx * dtSec, p.vy * dtSec, 9);
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      const room = this.findRoomContaining(p.x, p.y);
      if (room) {
        room.discovered = true;
        if (!pr.enteredRooms.has(room.id)) {
          pr.enteredRooms.add(room.id);
          if (!room.cleared && p.relics.includes("runic_carapace")) {
            p.shield = Math.max(p.shield, 22);
          }
        }
      }
      for (const prop of this.props) {
        if (!prop.opened && prop.kind === "coin") {
          if (Math.hypot(prop.x - p.x, prop.y - p.y) <= 34) {
            prop.opened = true;
            for (const ally of this.players.values()) {
              ally.state.gold += prop.value;
            }
            this.emitEvent("gold", prop.x, prop.y - 10, `+${prop.value}g`, "#F4D378");
          }
        }
      }
      if (pr.input.attack && pr.attackCooldownMs <= 0 && p.pendingRelicChoices.length === 0) {
        const dexSpeedMult = 1 + (p.dexterity || 0) * 0.012;
        const hasteFactor = (p.hasteMs > 0 ? 0.8 : 1) / dexSpeedMult;
        pr.attackCooldownMs = Math.round(def.attackCooldownMs * hasteFactor);
        p.attackAnimMs = 190;
        this.firePrimaryAttack(p);
      }
    }
    const connectedPlayers = Array.from(this.players.values()).filter(
      (r) => r.state.connected
    );
    if (connectedPlayers.length > 0) {
      const anyAlive = connectedPlayers.some(
        (r) => !r.state.downed || connectedPlayers.length > 1 && r.state.downedTimerMs > 0 && connectedPlayers.some((other) => !other.state.downed)
      );
      if (!anyAlive) {
        this.status = "defeat";
        this.pushSystemChat(`The expedition has fallen on Floor ${this.floor}.`);
        return;
      }
    }
    this.statusDotAccumMs += dtMs;
    const pulseDotNow = this.statusDotAccumMs >= 650;
    if (pulseDotNow) this.statusDotAccumMs = 0;
    for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
      const enemy = this.enemies[eIdx];
      enemy.markedMs = Math.max(0, enemy.markedMs - dtMs);
      enemy.slowedMs = Math.max(0, enemy.slowedMs - dtMs);
      enemy.stunnedMs = Math.max(0, enemy.stunnedMs - dtMs);
      enemy.burnedMs = Math.max(0, enemy.burnedMs - dtMs);
      enemy.frozenMs = Math.max(0, enemy.frozenMs - dtMs);
      enemy.shockedMs = Math.max(0, enemy.shockedMs - dtMs);
      enemy.poisonedMs = Math.max(0, enemy.poisonedMs - dtMs);
      enemy.bleedingMs = Math.max(0, enemy.bleedingMs - dtMs);
      if (pulseDotNow && enemy.hp > 0) {
        if (enemy.burnedMs > 0) {
          const rawBurn = 7 + this.floor;
          const fireRes = _GameRoom.getEnemyResistance(enemy.resistances, "fire");
          const burnDmg = Math.max(1, Math.round(rawBurn * (1 - fireRes)));
          enemy.hp -= burnDmg;
          this.emitEvent("damage", enemy.x + (Math.random() * 12 - 6), enemy.y - enemy.radius - 8, ` ${burnDmg}`, "#F97316");
        }
        if (enemy.poisonedMs > 0) {
          const rawPoison = 5 + this.floor;
          const poisonRes = _GameRoom.getEnemyResistance(enemy.resistances, "poison");
          const poisonDmg = Math.max(1, Math.round(rawPoison * (1 - poisonRes)));
          enemy.hp -= poisonDmg;
          this.emitEvent("damage", enemy.x + (Math.random() * 12 - 6), enemy.y - enemy.radius - 8, ` ${poisonDmg}`, "#22C55E");
        }
        if (enemy.bleedingMs > 0) {
          const moving = Math.hypot(enemy.vx, enemy.vy) > 8;
          const rawBleed = (moving ? 14 : 7) + this.floor;
          const bleedRes = _GameRoom.getEnemyResistance(enemy.resistances, "bleed");
          const bleedDmg = Math.max(1, Math.round(rawBleed * (1 - bleedRes)));
          enemy.hp -= bleedDmg;
          this.emitEvent("damage", enemy.x + (Math.random() * 12 - 6), enemy.y - enemy.radius - 8, `\u{1FA78} ${bleedDmg}`, "#DC2626");
        }
        if (enemy.hp <= 0) {
          this.processEnemyDeath(enemy, null);
          continue;
        }
      }
      if (enemy.stunnedMs > 0 || enemy.frozenMs > 0) {
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }
      let nearest = null;
      let nearestDist = Infinity;
      const enemyRoom = this.findRoomContaining(enemy.x, enemy.y);
      const isBoss = enemy.kind === "boss";
      const isRanged = enemy.kind === "skeleton" || enemy.kind === "cultist";
      const isAlerted = enemy.markedMs > 0 || enemy.hp < enemy.maxHp;
      for (const pr of this.players.values()) {
        if (pr.state.downed || !pr.state.connected) continue;
        const d = Math.hypot(pr.state.x - enemy.x, pr.state.y - enemy.y);
        const playerRoom = this.findRoomContaining(pr.state.x, pr.state.y);
        const inSameRoom = !!(enemyRoom && playerRoom && enemyRoom.id === playerRoom.id);
        let maxDetectDist = isBoss ? 380 : inSameRoom ? isRanged ? 220 : 190 : isRanged ? 175 : 145;
        if (isAlerted) maxDetectDist += 45;
        if (d > maxDetectDist) continue;
        if (!inSameRoom && !isBoss && !isAlerted) {
          if (!this.hasLineOfSight(enemy.x, enemy.y, pr.state.x, pr.state.y)) {
            continue;
          }
        }
        if (d < nearestDist) {
          nearestDist = d;
          nearest = pr.state;
        }
      }
      if (!nearest) {
        enemy.state = "idle";
        enemy.vx = 0;
        enemy.vy = 0;
        continue;
      }
      enemy.state = "chase";
      const slowFactor = enemy.slowedMs > 0 ? 0.55 : 1;
      const dx = nearest.x - enemy.x;
      const dy = nearest.y - enemy.y;
      const directAngle = Math.atan2(dy, dx);
      const angle = directAngle;
      let moveAngle = directAngle;
      const stepProbe = enemy.radius + 6;
      if (this.collidesCircle(enemy.x + Math.cos(directAngle) * stepProbe, enemy.y + Math.sin(directAngle) * stepProbe, enemy.radius - 2)) {
        const leftAng = directAngle + 0.65;
        const rightAng = directAngle - 0.65;
        const leftClear = !this.collidesCircle(enemy.x + Math.cos(leftAng) * stepProbe, enemy.y + Math.sin(leftAng) * stepProbe, enemy.radius - 2);
        const rightClear = !this.collidesCircle(enemy.x + Math.cos(rightAng) * stepProbe, enemy.y + Math.sin(rightAng) * stepProbe, enemy.radius - 2);
        if (leftClear && !rightClear) {
          moveAngle = leftAng;
        } else if (rightClear && !leftClear) {
          moveAngle = rightAng;
        } else if (leftClear && rightClear) {
          moveAngle = enemy.id.charCodeAt(0) % 2 === 0 ? leftAng : rightAng;
        }
      }
      for (let oIdx = eIdx - 1; oIdx >= Math.max(0, eIdx - 6); oIdx--) {
        const other = this.enemies[oIdx];
        if (other.hp <= 0) continue;
        const edx = enemy.x - other.x;
        const edy = enemy.y - other.y;
        const minDist = enemy.radius + other.radius + 2;
        const distSq = edx * edx + edy * edy;
        if (distSq > 0 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const push = (minDist - dist) * 0.4;
          const nx = edx / dist * push;
          const ny = edy / dist * push;
          if (!this.collidesCircle(enemy.x + nx, enemy.y + ny, enemy.radius - 2)) {
            enemy.x += nx;
            enemy.y += ny;
          }
        }
      }
      enemy.windupMs -= dtMs;
      if (enemy.kind === "slime" || enemy.kind === "goblin" || enemy.kind === "knight") {
        const baseSpd = enemy.kind === "goblin" ? 128 : enemy.kind === "knight" ? 96 : 86;
        const spd = baseSpd * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        }
        if (nearestDist <= enemy.radius + 22 && enemy.windupMs <= 0) {
          let baseHit = enemy.kind === "knight" ? 19 : enemy.kind === "goblin" ? 13 : 11;
          if (enemy.poisonedMs > 0) baseHit = Math.round(baseHit * 0.7);
          this.damagePlayer(nearest, baseHit + this.floor * 2);
          enemy.windupMs = enemy.kind === "goblin" ? 850 : 1100;
        }
      } else if (enemy.kind === "shadow_stalker") {
        const spd = 138 * slowFactor;
        if (nearestDist > enemy.radius + 14) {
          enemy.vx = Math.cos(moveAngle) * spd;
          enemy.vy = Math.sin(moveAngle) * spd;
          this.moveWithCollision(enemy, enemy.vx * dtSec, enemy.vy * dtSec, enemy.radius - 2);
        }
        if (nearestDist <= enemy.radius + 24 && enemy.windupMs <= 0) {
          let baseHit = 22;
          if (enemy.poisonedMs > 0) baseHit = Math.round(baseHit * 0.7);
          this.damagePlayer(nearest, baseHit + this.floor * 2, "physical");
          nearest.hasteMs = Math.min(nearest.hasteMs, 0);
          enemy.windupMs = 800;
        }
      } else if (enemy.kind === "astral_sentinel") {
        const spd = 72 * slowFactor;
        if (nearestDist < 140) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 240) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (enemy.windupMs <= 0) {
          for (let k = -0.18; k <= 0.18; k += 0.36) {
            const a = angle + k;
            this.spawnProjectile({
              ownerType: "enemy",
              ownerId: enemy.id,
              style: "arcane",
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(a) * 230,
              vy: Math.sin(a) * 230,
              angle: a,
              radius: 6,
              damage: 18 + this.floor * 2,
              pierce: 1,
              ttlMs: 2e3
            });
          }
          enemy.windupMs = 1850;
        }
      } else if (enemy.kind === "skeleton" || enemy.kind === "cultist") {
        const spd = 82 * slowFactor;
        if (nearestDist < 120) {
          this.moveWithCollision(
            enemy,
            -Math.cos(directAngle) * spd * dtSec,
            -Math.sin(directAngle) * spd * dtSec,
            enemy.radius - 2
          );
        } else if (nearestDist > 215) {
          this.moveWithCollision(
            enemy,
            Math.cos(moveAngle) * spd * dtSec,
            Math.sin(moveAngle) * spd * dtSec,
            enemy.radius - 2
          );
        }
        if (enemy.windupMs <= 0) {
          if (enemy.kind === "skeleton") {
            this.spawnProjectile({
              ownerType: "enemy",
              ownerId: enemy.id,
              style: "bone",
              x: enemy.x,
              y: enemy.y,
              vx: Math.cos(angle) * 245,
              vy: Math.sin(angle) * 245,
              angle,
              radius: 5,
              damage: 13 + this.floor * 2,
              pierce: 1,
              ttlMs: 1700
            });
            enemy.windupMs = 1550;
          } else {
            for (let k = -1; k <= 1; k++) {
              const a = angle + k * 0.25;
              this.spawnProjectile({
                ownerType: "enemy",
                ownerId: enemy.id,
                style: "voidorb",
                x: enemy.x,
                y: enemy.y,
                vx: Math.cos(a) * 195,
                vy: Math.sin(a) * 195,
                angle: a,
                radius: 6,
                damage: 14 + this.floor * 2,
                pierce: 1,
                ttlMs: 1900
              });
            }
            enemy.windupMs = 2100;
          }
        }
      } else if (enemy.kind === "boss") {
        if (!enemy.enraged && enemy.hp <= enemy.maxHp * 0.5) {
          enemy.enraged = true;
          this.emitEvent("crit", enemy.x, enemy.y - enemy.radius - 24, " ENRAGED! ", "#EF4444");
          this.pushSystemChat(`\uFE0F ${enemy.name} has entered an ENRAGED frenzy! Movement and attack speed surging!`);
        }
        const hpRatio = enemy.hp / enemy.maxHp;
        const curWave = enemy.summonWave || 0;
        if (hpRatio <= 0.7 && curWave < 1) {
          enemy.summonWave = 1;
          this.summonBossAdds(enemy);
        } else if (hpRatio <= 0.35 && curWave < 2) {
          enemy.summonWave = 2;
          this.summonBossAdds(enemy);
        }
        const isEnraged = !!enemy.enraged;
        const isCatacombs = this.map.biome === "catacombs" || this.floor === 2;
        const isEmber = this.map.biome === "ember" || this.floor === 3;
        const isVoid = this.map.biome === "void" || this.floor === 4;
        const isAstral = this.map.biome === "astral" || this.floor === 5;
        const baseSpd = isEnraged ? 142 : 110;
        const spd = baseSpd * slowFactor;
        if (enemy.charging) {
          enemy.chargeTimerMs = (enemy.chargeTimerMs || 0) - dtMs;
          const chargeSpd = 310 * slowFactor;
          const cAngle = enemy.chargeAngle ?? angle;
          this.moveWithCollision(
            enemy,
            Math.cos(cAngle) * chargeSpd * dtSec,
            Math.sin(cAngle) * chargeSpd * dtSec,
            24
          );
          for (const pr of this.players.values()) {
            if (!pr.state.downed && Math.hypot(pr.state.x - enemy.x, pr.state.y - enemy.y) <= enemy.radius + 18) {
              this.damagePlayer(pr.state, 24 + this.floor * 4, "physical");
              this.emitEvent("damage", pr.state.x, pr.state.y - 14, "TRAMPLED!", "#EF4444");
            }
          }
          if ((enemy.chargeTimerMs || 0) <= 0) {
            enemy.charging = false;
            enemy.windupMs = isEnraged ? 550 : 850;
          }
          continue;
        }
        if (nearestDist > 68) {
          this.moveWithCollision(
            enemy,
            Math.cos(angle) * spd * dtSec,
            Math.sin(angle) * spd * dtSec,
            22
          );
        }
        if (enemy.windupMs <= 0) {
          const patternChoice = Math.random();
          if (this.floor === 1) {
            if (patternChoice < 0.35) {
              enemy.shieldWallMs = 3e3;
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 20, " SHIELD WALL!", "#60A5FA");
              for (let off = -0.3; off <= 0.3; off += 0.3) {
                const a = angle + off;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "slash",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 230,
                  vy: Math.sin(a) * 230,
                  angle: a,
                  radius: 9,
                  damage: 18,
                  pierce: 1,
                  ttlMs: 1400
                });
              }
              enemy.windupMs = isEnraged ? 800 : 1200;
            } else if (patternChoice < 0.7) {
              for (let off = -0.28; off <= 0.28; off += 0.28) {
                const a = angle + off;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "slash",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 260,
                  vy: Math.sin(a) * 260,
                  angle: a,
                  radius: 10,
                  damage: 22,
                  pierce: 1,
                  ttlMs: 1600
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, " CLEAVE!", "#EF4444");
              enemy.windupMs = isEnraged ? 700 : 1e3;
            } else {
              enemy.charging = true;
              enemy.chargeAngle = angle;
              enemy.chargeTimerMs = 580;
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, "CHARGING!", "#F59E0B");
              enemy.windupMs = isEnraged ? 700 : 950;
            }
          } else if (this.floor === 2 || isCatacombs) {
            if (patternChoice < 0.4) {
              for (let k = 0; k < 3; k++) {
                const prList = Array.from(this.players.values()).filter((p) => !p.state.downed);
                const targetState = prList[k % prList.length]?.state || nearest;
                const offsetX = k === 0 ? 0 : k === 1 ? -40 : 40;
                const offsetY = k === 0 ? 0 : k === 1 ? 30 : -30;
                this.zones.push({
                  id: this.nextId("zone"),
                  kind: "frost_nova",
                  x: targetState.x + offsetX,
                  y: targetState.y + offsetY,
                  radius: 72,
                  ttlMs: 750,
                  maxTtlMs: 750,
                  ownerId: enemy.id
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 20, " FROST NOVA!", "#38BDF8");
              enemy.windupMs = isEnraged ? 750 : 1100;
            } else if (patternChoice < 0.75) {
              for (let k = 0; k < 6; k++) {
                const a = angle + (k - 2.5) * 0.22;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "voidorb",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 250,
                  vy: Math.sin(a) * 250,
                  angle: a,
                  radius: 8,
                  damage: 22,
                  pierce: 1,
                  ttlMs: 2200,
                  slowOnHit: true
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, " SOUL HAIL!", "#A855F7");
              enemy.windupMs = isEnraged ? 700 : 1e3;
            } else {
              const count = isEnraged ? 16 : 12;
              for (let k = 0; k < count; k++) {
                const a = k * Math.PI * 2 / count;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "voidorb",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 230,
                  vy: Math.sin(a) * 230,
                  angle: a,
                  radius: 7,
                  damage: 20,
                  pierce: 1,
                  ttlMs: 2e3
                });
              }
              enemy.windupMs = isEnraged ? 800 : 1150;
            }
          } else if (this.floor === 3 || isEmber) {
            if (patternChoice < 0.4) {
              for (let k = 0; k < 3; k++) {
                const prList = Array.from(this.players.values()).filter((p) => !p.state.downed);
                const targetState = prList[k % prList.length]?.state || nearest;
                this.zones.push({
                  id: this.nextId("zone"),
                  kind: "magma_pillar",
                  x: targetState.x + (Math.random() * 50 - 25),
                  y: targetState.y + (Math.random() * 50 - 25),
                  radius: 84,
                  ttlMs: 650,
                  maxTtlMs: 650,
                  ownerId: enemy.id
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 20, " MAGMA ERUPTION!", "#EF4444");
              enemy.windupMs = isEnraged ? 700 : 1050;
            } else if (patternChoice < 0.75) {
              const count = isEnraged ? 18 : 14;
              const rot = Math.random() * Math.PI;
              for (let k = 0; k < count; k++) {
                const a = rot + k * Math.PI * 2 / count;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "fireball",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 270,
                  vy: Math.sin(a) * 270,
                  angle: a,
                  radius: 9,
                  damage: 26,
                  pierce: 1,
                  ttlMs: 2400
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, " FIRESTORM!", "#F59E0B");
              enemy.windupMs = isEnraged ? 750 : 1100;
            } else {
              this.zones.push({
                id: this.nextId("zone"),
                kind: "boss_slam",
                x: nearest.x,
                y: nearest.y,
                radius: 96,
                ttlMs: isEnraged ? 650 : 800,
                maxTtlMs: isEnraged ? 650 : 800,
                ownerId: enemy.id
              });
              enemy.windupMs = isEnraged ? 650 : 950;
            }
          } else if (this.floor === 4 || isVoid) {
            if (patternChoice < 0.35) {
              this.zones.push({
                id: this.nextId("zone"),
                kind: "singularity",
                x: nearest.x,
                y: nearest.y,
                radius: 115,
                ttlMs: 1800,
                maxTtlMs: 1800,
                ownerId: enemy.id
              });
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 20, " SINGULARITY!", "#A855F7");
              enemy.windupMs = isEnraged ? 800 : 1200;
            } else if (patternChoice < 0.7) {
              enemy.x = nearest.x + (Math.random() < 0.5 ? -90 : 90);
              enemy.y = nearest.y + (Math.random() < 0.5 ? -90 : 90);
              const newAngle = Math.atan2(nearest.y - enemy.y, nearest.x - enemy.x);
              for (let off = -0.4; off <= 0.4; off += 0.2) {
                const a = newAngle + off;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "voidorb",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 290,
                  vy: Math.sin(a) * 290,
                  angle: a,
                  radius: 8,
                  damage: 30,
                  pierce: 1,
                  ttlMs: 1800
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, " VOID STEP!", "#E879F9");
              enemy.windupMs = isEnraged ? 650 : 950;
            } else {
              const count = isEnraged ? 20 : 16;
              for (let k = 0; k < count; k++) {
                const a = k * Math.PI * 2 / count;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "voidorb",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 280,
                  vy: Math.sin(a) * 280,
                  angle: a,
                  radius: 8,
                  damage: 28,
                  pierce: 1,
                  ttlMs: 2200
                });
              }
              enemy.windupMs = isEnraged ? 750 : 1100;
            }
          } else {
            if (patternChoice < 0.35) {
              this.zones.push({
                id: this.nextId("zone"),
                kind: "supernova",
                x: enemy.x,
                y: enemy.y,
                radius: 140,
                ttlMs: 1200,
                maxTtlMs: 1200,
                ownerId: enemy.id
              });
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 20, " SUPERNOVA NOVA!", "#F472B6");
              enemy.windupMs = isEnraged ? 850 : 1250;
            } else if (patternChoice < 0.7) {
              for (let k = 0; k < 4; k++) {
                const prList = Array.from(this.players.values()).filter((p) => !p.state.downed);
                const targetState = prList[k % prList.length]?.state || nearest;
                this.zones.push({
                  id: this.nextId("zone"),
                  kind: "starlight_beam",
                  x: targetState.x + (Math.random() * 60 - 30),
                  y: targetState.y + (Math.random() * 60 - 30),
                  radius: 70,
                  ttlMs: 800,
                  maxTtlMs: 800,
                  ownerId: enemy.id
                });
              }
              this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 18, " STARBEAM CASCADE!", "#38BDF8");
              enemy.windupMs = isEnraged ? 750 : 1050;
            } else {
              const count = isEnraged ? 22 : 18;
              const rot = Math.random() * Math.PI;
              for (let k = 0; k < count; k++) {
                const a = rot + k * Math.PI * 2 / count;
                this.spawnProjectile({
                  ownerType: "enemy",
                  ownerId: enemy.id,
                  style: "arcane",
                  x: enemy.x,
                  y: enemy.y,
                  vx: Math.cos(a) * 310,
                  vy: Math.sin(a) * 310,
                  angle: a,
                  radius: 8,
                  damage: 32,
                  pierce: 1,
                  ttlMs: 2400
                });
              }
              enemy.windupMs = isEnraged ? 700 : 1e3;
            }
          }
        }
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.ttlMs -= dtMs;
      if (proj.ttlMs <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (proj.ownerType === "player" && proj.targetEnemyId) {
        let target = this.enemies.find(
          (e) => e.id === proj.targetEnemyId && e.hp > 0
        );
        if (!target) {
          target = this.trainingDummies.find((d) => d.id === proj.targetEnemyId);
        }
        if (target) {
          const tdx = target.x - proj.x;
          const tdy = target.y - proj.y;
          const dist = Math.hypot(tdx, tdy);
          if (dist > 4 && dist < 380) {
            const desiredAngle = Math.atan2(tdy, tdx);
            const currentSpeed = Math.hypot(proj.vx, proj.vy);
            const curAngle = Math.atan2(proj.vy, proj.vx);
            const diff = Math.atan2(Math.sin(desiredAngle - curAngle), Math.cos(desiredAngle - curAngle));
            const steer = 0.22;
            const newAngle = curAngle + diff * steer;
            proj.vx = Math.cos(newAngle) * currentSpeed;
            proj.vy = Math.sin(newAngle) * currentSpeed;
            proj.angle = newAngle;
          }
        }
      }
      proj.x += proj.vx * dtSec;
      proj.y += proj.vy * dtSec;
      if (this.isWallAtWorld(proj.x, proj.y)) {
        this.projectiles.splice(i, 1);
        continue;
      }
      if (proj.ownerType === "enemy") {
        const blockedByDome = this.zones.some(
          (z) => z.kind === "aegis_dome" && Math.hypot(proj.x - z.x, proj.y - z.y) <= z.radius
        );
        if (blockedByDome) {
          this.projectiles.splice(i, 1);
          continue;
        }
        let hitPlayer = false;
        for (const pr of this.players.values()) {
          if (pr.state.downed || !pr.state.connected) continue;
          if (Math.hypot(pr.state.x - proj.x, pr.state.y - proj.y) <= 14 + proj.radius) {
            this.damagePlayer(pr.state, proj.damage);
            hitPlayer = true;
            break;
          }
        }
        if (hitPlayer) {
          this.projectiles.splice(i, 1);
        }
      } else {
        for (const prop of this.props) {
          if (!prop.opened && prop.kind === "crate") {
            if (Math.hypot(prop.x - proj.x, prop.y - proj.y) <= 18 + proj.radius) {
              prop.opened = true;
              for (const ally of this.players.values()) {
                ally.state.gold += prop.value;
              }
              this.emitEvent("gold", prop.x, prop.y - 10, `+${prop.value}g`, "#F4D378");
            }
          }
        }
        const ownerPr = this.players.get(proj.ownerId);
        let hitDummy = false;
        for (const dummy of this.trainingDummies) {
          if (Math.hypot(dummy.x - proj.x, dummy.y - proj.y) <= 18 + proj.radius) {
            this.damageDummy(
              dummy,
              proj.damage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit)
            );
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.projectiles.splice(i, 1);
              hitDummy = true;
              break;
            }
          }
        }
        if (hitDummy) continue;
        for (let eIdx = this.enemies.length - 1; eIdx >= 0; eIdx--) {
          const enemy = this.enemies[eIdx];
          if (Math.hypot(enemy.x - proj.x, enemy.y - proj.y) <= enemy.radius + proj.radius) {
            if (proj.slowOnHit) enemy.slowedMs = 3500;
            this.damageEnemy(
              enemy,
              proj.damage,
              ownerPr ? ownerPr.state : null,
              Boolean(proj.crit)
            );
            proj.pierce -= 1;
            if (proj.pierce <= 0) {
              this.projectiles.splice(i, 1);
              break;
            }
          }
        }
      }
    }
    for (const room of this.map.rooms) {
      if (!room.cleared) {
        const aliveInRoom = this.enemies.some((e) => e.roomId === room.id);
        if (!aliveInRoom) {
          room.cleared = true;
          if (room.type === "boss") {
            this.map.portalActive = true;
            this.props.push({
              id: this.nextId("prop"),
              kind: "relic_chest",
              x: this.map.portalPos.x + 48,
              y: this.map.portalPos.y,
              opened: false,
              value: 1
            });
            this.pushSystemChat(
              `Floor ${this.floor} Boss vanquished! Open the Relic Vault and press [E] at the Portal.`
            );
          }
        }
      }
    }
  }
  firePrimaryAttack(p) {
    const def = HERO_CLASSES[p.heroClass];
    const category = p.heroClass === "arcanist" ? "arcane" : p.heroClass === "cleric" ? "divine" : "physical";
    const mult = this.computeDamageMult(p, category);
    const critChance = Math.min(0.55, 0.1 + (p.dexterity || 0) * 8e-3 + (p.relics.includes("keen_arrowhead") ? 0.25 : 0));
    const hasCrit = Math.random() < critChance;
    const critMult = hasCrit ? 1.75 : 1;
    const dmg = Math.round(def.damage * mult * critMult);
    const extraCount = p.relics.includes("twinstring_charm") ? 1 : 0;
    const bonusPierce = p.relics.includes("piercing_prism") ? 1 : 0;
    let bestTarget = null;
    let bestDist = Infinity;
    const maxSearchDist = p.heroClass === "vanguard" ? 140 : 460;
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const d = Math.hypot(enemy.x - p.x, enemy.y - p.y);
      if (d <= maxSearchDist && d < bestDist) {
        bestDist = d;
        bestTarget = enemy;
      }
    }
    if (!bestTarget) {
      for (const dummy of this.trainingDummies) {
        const d = Math.hypot(dummy.x - p.x, dummy.y - p.y);
        if (d <= maxSearchDist && d < bestDist) {
          bestDist = d;
          bestTarget = dummy;
        }
      }
    }
    if (bestTarget) {
      p.aimAngle = Math.atan2(bestTarget.y - p.y, bestTarget.x - p.x);
    }
    const shotCount = 1 + extraCount;
    for (let s = 0; s < shotCount; s++) {
      const spread = shotCount === 2 ? s === 0 ? -0.1 : 0.1 : 0;
      const ang = p.aimAngle + spread;
      const shotDmg = Math.round(dmg * (s === 0 ? 1 : 0.75));
      if (p.heroClass === "vanguard") {
        this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "slash",
          x: p.x + Math.cos(ang) * 20,
          y: p.y + Math.sin(ang) * 20,
          vx: Math.cos(ang) * 310,
          vy: Math.sin(ang) * 310,
          angle: ang,
          radius: 28,
          damage: shotDmg,
          pierce: 4 + bonusPierce,
          crit: hasCrit,
          ttlMs: 260,
          targetEnemyId: bestTarget?.id
        });
      } else if (p.heroClass === "ranger") {
        this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "arrow",
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 470,
          vy: Math.sin(ang) * 470,
          angle: ang,
          radius: 6,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 850,
          targetEnemyId: bestTarget?.id
        });
      } else if (p.heroClass === "arcanist") {
        const pr = this.players.get(p.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 4 === 0) {
            const riftX = bestTarget ? bestTarget.x : p.x + Math.cos(ang) * 120;
            const riftY = bestTarget ? bestTarget.y : p.y + Math.sin(ang) * 120;
            this.zones.push({
              id: this.nextId("zone"),
              kind: "star_rift",
              x: riftX,
              y: riftY,
              radius: 75,
              ttlMs: 3e3,
              maxTtlMs: 3e3,
              ownerId: p.id
            });
            this.emitEvent("status", riftX, riftY - 18, " Star Rift", "#C084FC");
          }
        }
        this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "arcane",
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 380,
          vy: Math.sin(ang) * 380,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: 2 + bonusPierce,
          crit: hasCrit,
          ttlMs: 920,
          targetEnemyId: bestTarget?.id
        });
      } else {
        this.spawnProjectile({
          ownerType: "player",
          ownerId: p.id,
          style: "radiant",
          x: p.x + Math.cos(ang) * 16,
          y: p.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * 390,
          vy: Math.sin(ang) * 390,
          angle: ang,
          radius: 8,
          damage: shotDmg,
          pierce: 1 + bonusPierce,
          crit: hasCrit,
          ttlMs: 800,
          targetEnemyId: bestTarget?.id
        });
      }
    }
  }
  spawnProjectile(spec) {
    this.projectiles.push({
      id: this.nextId("proj"),
      ...spec
    });
  }
  summonBossAdds(boss) {
    const isCatacombs = this.map.biome === "catacombs" || this.floor === 2;
    const isEmber = this.map.biome === "ember" || this.floor === 3;
    const isVoid = this.map.biome === "void" || this.floor === 4;
    const isAstral = this.map.biome === "astral" || this.floor === 5;
    const minionKind = isAstral ? "cultist" : isVoid ? "skeleton" : isEmber ? "knight" : isCatacombs ? "cultist" : "skeleton";
    this.emitEvent("status", boss.x, boss.y - boss.radius - 20, "\uFE0F REINFORCEMENTS!", "#F59E0B");
    this.pushSystemChat(`\uFE0F ${boss.name} calls forth dungeon reinforcements!`);
    for (let i = 0; i < 2; i++) {
      let addX = boss.x + (i === 0 ? -50 : 50);
      let addY = boss.y + (i === 0 ? 35 : -35);
      if (this.collidesCircle(addX, addY, 14)) {
        addX = boss.x + (i === 0 ? -24 : 24);
        addY = boss.y;
      }
      const add = makeEnemy(
        `add_${this.floor}_${Date.now()}_${i}`,
        minionKind,
        boss.roomId,
        addX,
        addY,
        1,
        true,
        this.floor,
        this.map.biome
      );
      this.enemies.push(add);
    }
  }
  damageEnemy(enemy, rawAmount, attacker, isCrit = false, category) {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1 || enemy.hp <= 0) return 0;
    const isCritBool = typeof isCrit === "boolean" ? isCrit : false;
    const cat = (typeof isCrit === "string" ? isCrit : category) || (attacker ? attacker.heroClass === "arcanist" ? "arcane" : attacker.heroClass === "cleric" ? "divine" : "physical" : "physical");
    const targetRes = _GameRoom.getEnemyResistance(enemy.resistances, cat);
    const markBonus = enemy.markedMs > 0 ? 1.35 : 1;
    let finalDmg = Math.max(1, Math.round(rawAmount * (1 - targetRes) * markBonus));
    if (enemy.shieldWallMs && enemy.shieldWallMs > 0) {
      finalDmg = Math.max(1, Math.round(finalDmg * 0.4));
      this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 16, " BLOCKED! (-60%)", "#60A5FA");
    }
    let effectiveCrit = isCritBool;
    if (attacker && attacker.heroClass === "ranger") {
      const distToTarget = Math.hypot(enemy.x - attacker.x, enemy.y - attacker.y);
      if (distToTarget >= 180) {
        finalDmg = Math.round(finalDmg * 1.25);
        effectiveCrit = true;
        this.emitEvent("crit", enemy.x, enemy.y - enemy.radius - 22, " LONGSHOT! (+25%)", "#34D399");
      }
    }
    let shattered = false;
    if (enemy.frozenMs > 0) {
      enemy.frozenMs = 0;
      finalDmg = Math.round(finalDmg * 1.6);
      shattered = true;
      this.emitEvent("crit", enemy.x, enemy.y - enemy.radius - 20, " SHATTER!", "#38BDF8");
      for (const other of this.enemies) {
        if (other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 85) {
          const otherRes = _GameRoom.getEnemyResistance(other.resistances, "frost");
          const otherMark = other.markedMs > 0 ? 1.35 : 1;
          const aoeDmg = Math.max(1, Math.round(finalDmg * 0.4 * (1 - otherRes) * otherMark));
          other.hp -= aoeDmg;
          if (attacker) attacker.damageDealt += aoeDmg;
          other.slowedMs = Math.max(other.slowedMs, 2500);
          this.emitEvent("damage", other.x, other.y - 10, `${aoeDmg}`, "#7DD3FC");
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
        }
      }
    }
    enemy.hp -= finalDmg;
    if (attacker) {
      attacker.damageDealt += finalDmg;
      if (attacker.heroClass === "vanguard") {
        if (enemy.stunnedMs > 0 || enemy.burnedMs > 0 || enemy.frozenMs > 0) {
          if (attacker.shield < 60) {
            attacker.shield = Math.min(60, attacker.shield + 3);
            this.emitEvent("status", attacker.x, attacker.y - 20, "\uFE0F Iron Will (+3 Shield)", "#93C5FD");
          }
        }
      }
      const res = enemy.resistances;
      if (attacker.relics.includes("cinder_heart") && (effectiveCrit || rawAmount >= 24)) {
        if (enemy.burnedMs <= 0) {
          this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 14, "IGNITED!", "#F97316");
        }
        const fireRes = _GameRoom.getEnemyResistance(res, "fire");
        const burnDuration = Math.round(4500 * (1 - fireRes * 0.4));
        enemy.burnedMs = burnDuration;
      }
      if (attacker.relics.includes("rimefrost_shard")) {
        const frostRes = _GameRoom.getEnemyResistance(res, "frost");
        const tenacity = res ? res.tenacity || 0 : 0;
        const frostTenacity = Math.max(frostRes, tenacity);
        if (enemy.slowedMs > 0 && enemy.frozenMs <= 0 && !shattered) {
          const freezeDuration = Math.round(2400 * (1 - frostTenacity));
          if (freezeDuration >= 600) {
            enemy.frozenMs = freezeDuration;
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 16, "FROZEN!", "#38BDF8");
          } else {
            enemy.slowedMs = Math.max(enemy.slowedMs, 3500);
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 14, "TENACIOUS!", "#94A3B8");
          }
        } else if (Math.random() < 0.35) {
          const slowDuration = Math.round(3500 * (1 - frostTenacity * 0.5));
          enemy.slowedMs = Math.max(enemy.slowedMs, slowDuration);
          this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 14, "CHILLED", "#7DD3FC");
        }
      }
      if (attacker.relics.includes("stormcaller_lodestone")) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            const lightningRes = _GameRoom.getEnemyResistance(res, "lightning");
            const shockDuration = Math.round(5e3 * (1 - lightningRes * 0.4));
            enemy.shockedMs = shockDuration;
            this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 16, "SHOCKED!", "#FBBF24");
          }
        }
      }
      if (attacker.relics.includes("viper_crucible")) {
        if (enemy.poisonedMs <= 0) {
          this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 14, "POISONED", "#22C55E");
        }
        const poisonRes = _GameRoom.getEnemyResistance(res, "poison");
        const poisonDuration = Math.round(6e3 * (1 - poisonRes * 0.4));
        enemy.poisonedMs = poisonDuration;
      }
      if (attacker.relics.includes("bloodletter_talisman")) {
        if (enemy.bleedingMs <= 0) {
          this.emitEvent("status", enemy.x, enemy.y - enemy.radius - 14, "BLEED", "#DC2626");
        }
        const bleedRes = _GameRoom.getEnemyResistance(res, "bleed");
        const bleedDuration = Math.round(5e3 * (1 - bleedRes * 0.4));
        enemy.bleedingMs = bleedDuration;
      }
    }
    if (enemy.shockedMs > 0 && finalDmg > 6) {
      let arcs = 3;
      for (const other of this.enemies) {
        if (other !== enemy && other.hp > 0 && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 130) {
          const otherRes = _GameRoom.getEnemyResistance(other.resistances, "lightning");
          const otherMark = other.markedMs > 0 ? 1.35 : 1;
          const arcDmg = Math.max(1, Math.round(finalDmg * 0.45 * (1 - otherRes) * otherMark));
          other.hp -= arcDmg;
          if (attacker) attacker.damageDealt += arcDmg;
          this.emitEvent("damage", other.x, other.y - 12, ` ${arcDmg}`, "#FBBF24");
          arcs--;
          if (other.hp <= 0) {
            this.processEnemyDeath(other, attacker);
          }
          if (arcs <= 0) break;
        }
      }
    }
    this.emitEvent(
      effectiveCrit || enemy.markedMs > 0 ? "crit" : "damage",
      enemy.x + (Math.random() * 14 - 7),
      enemy.y - enemy.radius - 6,
      `${finalDmg}${effectiveCrit ? "!" : ""}`,
      effectiveCrit || enemy.markedMs > 0 ? "#FBBF24" : "#F8FAFC"
    );
    if (enemy.hp <= 0) {
      this.processEnemyDeath(enemy, attacker);
    }
    return finalDmg;
  }
  damageDummy(dummy, rawAmount, attacker, isCrit = false) {
    let finalDmg = Math.max(1, rawAmount);
    if (attacker && attacker.heroClass === "ranger") {
      const distToTarget = Math.hypot(dummy.x - attacker.x, dummy.y - attacker.y);
      if (distToTarget >= 180) {
        finalDmg = Math.round(finalDmg * 1.25);
        isCrit = true;
        this.emitEvent("crit", dummy.x, dummy.y - 42, " LONGSHOT! (+25%)", "#34D399");
      }
    }
    dummy.hitAnimMs = 280;
    dummy.lastHitTimerMs = 4e3;
    dummy.totalDamageTaken = (dummy.totalDamageTaken || 0) + finalDmg;
    dummy.hp = Math.max(1, dummy.hp - finalDmg);
    if (attacker) {
      attacker.damageDealt += finalDmg;
      if (attacker.heroClass === "vanguard") {
        if (attacker.shield < 60) {
          attacker.shield = Math.min(60, attacker.shield + 3);
          this.emitEvent("status", attacker.x, attacker.y - 20, "\uFE0F Iron Will (+3 Shield)", "#93C5FD");
        }
      }
    }
    const text = isCrit ? ` ${finalDmg} CRIT!` : `${finalDmg}`;
    const color = isCrit ? "#FEF08A" : "#FCD34D";
    this.emitEvent(
      isCrit ? "crit" : "damage",
      dummy.x + (Math.random() * 14 - 7),
      dummy.y - 28,
      text,
      color
    );
    if (attacker) {
      if (attacker.relics.includes("cinder_heart") && (isCrit || rawAmount >= 24)) {
        this.emitEvent("status", dummy.x, dummy.y - 42, " IGNITED!", "#F97316");
      }
      if (attacker.relics.includes("rimefrost_shard") && Math.random() < 0.25) {
        this.emitEvent("status", dummy.x, dummy.y - 42, "\uFE0F CHILLED!", "#38BDF8");
      }
      if (attacker.relics.includes("stormcaller_lodestone")) {
        const pr = this.players.get(attacker.id);
        if (pr) {
          pr.attackCount = (pr.attackCount || 0) + 1;
          if (pr.attackCount % 3 === 0) {
            this.emitEvent("status", dummy.x, dummy.y - 42, " SHOCKED!", "#FBBF24");
            for (const other of this.trainingDummies) {
              if (other.id !== dummy.id && Math.hypot(other.x - dummy.x, other.y - dummy.y) <= 350) {
                this.damageDummy(other, Math.round(finalDmg * 0.5), attacker, false);
                this.emitEvent("status", other.x, other.y - 26, " Arc Shock", "#FBBF24");
              }
            }
          }
        }
      }
      if (attacker.relics.includes("viper_crucible")) {
        this.emitEvent("status", dummy.x, dummy.y - 42, " POISONED!", "#22C55E");
      }
      if (attacker.relics.includes("bloodletter_talisman")) {
        this.emitEvent("status", dummy.x, dummy.y - 42, "\u{1FA78} LACERATED!", "#DC2626");
      }
    }
  }
  processEnemyDeath(enemy, attacker) {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);
    if (attacker) {
      attacker.kills += 1;
      if (this.onKillCallback) this.onKillCallback(attacker.id);
      if (attacker.relics.includes("crimson_fang")) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + 5);
      }
      if (attacker.heroClass === "ranger") {
        attacker.hasteMs = Math.max(attacker.hasteMs, 2500);
        this.emitEvent("status", attacker.x, attacker.y - 22, " EAGLE SWIFTNESS!", "#4ADE80");
      }
    }
    if (Math.random() < 0.55 || enemy.kind === "boss") {
      this.props.push({
        id: this.nextId("prop"),
        kind: "coin",
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: enemy.kind === "boss" ? 75 : enemy.elite ? 18 : 8
      });
    } else if (Math.random() < 0.14) {
      this.props.push({
        id: this.nextId("prop"),
        kind: "potion",
        x: enemy.x,
        y: enemy.y,
        opened: false,
        value: 1
      });
    }
    const xpGain = enemy.kind === "boss" ? 95 : enemy.elite ? 28 : 16;
    for (const ally of this.players.values()) {
      this.grantXp(ally.state, xpGain);
    }
  }
  grantXp(p, amount) {
    if (p.level >= MAX_LEVEL) {
      p.level = MAX_LEVEL;
      p.xp = 0;
      return;
    }
    p.xp += amount;
    let leveledUp = false;
    while (p.xp >= p.nextXp && p.level < MAX_LEVEL) {
      p.xp -= p.nextXp;
      p.level += 1;
      leveledUp = true;
      if (p.level <= MAX_LEVEL) {
        p.attributePoints += 2;
      }
      p.nextXp = p.level >= MAX_LEVEL ? 999999 : Math.round(p.nextXp * 1.35);
      if (p.level >= MAX_LEVEL) {
        p.level = MAX_LEVEL;
        p.xp = 0;
        p.nextXp = 999999;
      }
      const oldMax = p.maxHp;
      p.maxHp = _GameRoom.computePlayerMaxHp(p.heroClass, p.level, p.vitality, p.relics);
      p.hp += p.maxHp - oldMax;
      p.hp = Math.min(p.maxHp, p.hp + 24);
      this.emitEvent("status", p.x, p.y - 26, `Level ${p.level} (+2 Pts)`, "#F4D378");
      if (p.level >= MAX_LEVEL) break;
    }
    if (p.level >= MAX_LEVEL) {
      p.level = MAX_LEVEL;
      p.xp = 0;
      p.nextXp = 999999;
    }
    if (this.onProgressionUpdateCallback) {
      this.onProgressionUpdateCallback(p.id, p);
    }
  }
  damagePlayer(p, rawDamage, damageType = "physical") {
    if (p.downed || p.godMode) return 0;
    const classDef = HERO_CLASSES[p.heroClass];
    const res = classDef?.resistances || {
      physical: 0,
      fire: 0,
      frost: 0,
      lightning: 0,
      poison: 0,
      bleed: 0
    };
    let resist = damageType === "elemental" ? (res.fire + res.frost + res.lightning) / 3 : res.physical;
    if (p.relics.includes("runic_carapace")) {
      resist += damageType === "physical" ? 0.15 : 0.2;
    }
    if (p.relics.includes("thorned_aegis") && damageType === "physical") {
      resist += 0.1;
    }
    resist = Math.min(0.75, Math.max(0, resist));
    let dmg = Math.max(1, Math.round(rawDamage * (1 - resist)));
    if (p.heroClass === "vanguard") {
      dmg = Math.max(1, Math.round(dmg * 0.85));
      this.emitEvent("status", p.x, p.y - 28, "\uFE0F Iron Will (-15%)", "#CBD5E1");
    }
    const inAegis = this.zones.some(
      (z) => z.kind === "aegis_dome" && Math.hypot(p.x - z.x, p.y - z.y) <= z.radius
    );
    if (inAegis) dmg = Math.max(1, Math.round(dmg * 0.65));
    const finalMitigatedDamage = dmg;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, dmg);
      p.shield -= absorbed;
      dmg -= absorbed;
      if (absorbed > 0 && p.relics.includes("thorned_aegis")) {
        this.emitEvent("status", p.x, p.y - 24, "THORNED RETALIATION", "#A855F7");
        for (const enemy of this.enemies) {
          if (enemy.hp > 0 && Math.hypot(enemy.x - p.x, enemy.y - p.y) <= 125) {
            const tenacity = enemy.resistances ? enemy.resistances.tenacity : 0;
            const stunDur = Math.round(1800 * (1 - tenacity));
            if (stunDur >= 500) {
              enemy.stunnedMs = stunDur;
              this.emitEvent("status", enemy.x, enemy.y - 16, "STUNNED!", "#A855F7");
            } else {
              this.emitEvent("status", enemy.x, enemy.y - 16, "TENACIOUS!", "#FBBF24");
            }
          }
        }
      }
    }
    if (dmg > 0) {
      p.hp = Math.max(0, p.hp - dmg);
      this.emitEvent("damage", p.x, p.y - 18, `-${dmg}`, "#F87171");
      if (resist >= 0.25) {
        this.emitEvent("status", p.x + 16, p.y - 26, "ARMORED", "#94A3B8");
      }
    }
    if (p.hp <= 0) {
      p.downed = true;
      p.downedTimerMs = 18e3;
      p.reviveProgress = 0;
      if (this.players.size > 1) {
        this.pushSystemChat(
          `${p.username} is downed! Stand near your ally to revive them.`
        );
      }
    }
    return finalMitigatedDamage;
  }
  completeRevive(target, reviverId) {
    target.downed = false;
    target.reviveProgress = 0;
    target.hp = Math.round(target.maxHp * 0.45);
    target.shield = 20;
    const reviver = this.players.get(reviverId);
    if (reviver && reviver.state.id !== target.id) {
      reviver.state.revives += 1;
      if (this.onReviveCallback) this.onReviveCallback(reviver.state.id);
      this.pushSystemChat(`${reviver.state.username} revived ${target.username}!`);
    }
    this.emitEvent("heal", target.x, target.y - 24, "Revived!", "#6EE7B7");
  }
  emitEvent(kind, x, y, text, color) {
    this.pendingEvents.push({
      id: this.nextId("ev"),
      kind,
      x: Math.round(x),
      y: Math.round(y),
      text,
      color
    });
  }
  findRoomContaining(wx, wy) {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    return this.map.rooms.find(
      (r) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h
    );
  }
  hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist <= TILE_SIZE) return true;
    const steps = Math.ceil(dist / 14);
    const stepX = dx / steps;
    const stepY = dy / steps;
    for (let i = 1; i < steps; i++) {
      if (this.isWallAtWorld(x1 + stepX * i, y1 + stepY * i)) {
        return false;
      }
    }
    return true;
  }
  isWallAtWorld(wx, wy) {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || tx >= this.map.width || ty < 0 || ty >= this.map.height) {
      return true;
    }
    const code = this.map.tiles[ty * this.map.width + tx];
    return code === 0 || code === 2 || code === 3;
  }
  collidesCircle(wx, wy, radius) {
    if (this.isWallAtWorld(wx, wy)) return true;
    const step = Math.PI / 4;
    for (let i = 0; i < 8; i++) {
      const a = i * step;
      const cx = wx + Math.cos(a) * radius;
      const cy = wy + Math.sin(a) * radius;
      if (this.isWallAtWorld(cx, cy)) return true;
    }
    return false;
  }
  moveWithCollision(entity, dx, dy, radius) {
    if (this.collidesCircle(entity.x, entity.y, radius * 0.75)) {
      let escapeX = 0;
      let escapeY = 0;
      const probeDist = radius + 8;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const testX = entity.x + Math.cos(a) * probeDist;
        const testY = entity.y + Math.sin(a) * probeDist;
        if (!this.isWallAtWorld(testX, testY)) {
          escapeX += Math.cos(a);
          escapeY += Math.sin(a);
        }
      }
      if (escapeX !== 0 || escapeY !== 0) {
        const len = Math.hypot(escapeX, escapeY);
        entity.x += escapeX / len * 4;
        entity.y += escapeY / len * 4;
      }
    }
    const targetX = entity.x + dx;
    const targetY = entity.y + dy;
    if (!this.collidesCircle(targetX, targetY, radius)) {
      entity.x = targetX;
      entity.y = targetY;
      return;
    }
    if (dx !== 0 && !this.collidesCircle(targetX, entity.y, radius)) {
      entity.x = targetX;
    } else if (dx !== 0 && !this.collidesCircle(entity.x + dx * 0.5, entity.y, radius)) {
      entity.x += dx * 0.5;
    }
    if (dy !== 0 && !this.collidesCircle(entity.x, targetY, radius)) {
      entity.y = targetY;
    } else if (dy !== 0 && !this.collidesCircle(entity.x, entity.y + dy * 0.5, radius)) {
      entity.y += dy * 0.5;
    }
  }
  getSummary() {
    return {
      roomId: this.roomId,
      name: this.name,
      hostName: this.hostName,
      difficulty: this.difficulty,
      floor: this.floor,
      seed: this.baseSeed,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      status: this.status
    };
  }
  buildSnapshot() {
    const events = this.pendingEvents.splice(0, this.pendingEvents.length);
    const activePlayers = Array.from(this.players.values()).map((r) => r.state);
    const portalReadyCount = activePlayers.filter((p) => p.readyNextFloor).length;
    return {
      roomId: this.roomId,
      roomName: this.name,
      difficulty: this.difficulty,
      status: this.status,
      floor: this.floor,
      seed: this.baseSeed,
      elapsedSec: Math.floor((Date.now() - this.startedAt) / 1e3),
      bossDefeated: this.map.portalActive,
      portalReadyCount,
      players: activePlayers,
      enemies: this.enemies,
      projectiles: this.projectiles,
      props: this.props,
      zones: this.zones,
      npcs: this.npcs,
      trainingDummies: this.trainingDummies,
      events,
      roomClearedFlags: this.map.rooms.map((r) => ({
        id: r.id,
        cleared: r.cleared,
        discovered: r.discovered
      }))
    };
  }
};

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var accountsByLower = /* @__PURE__ */ new Map();
var accountsById = /* @__PURE__ */ new Map();
var sessionsByToken = /* @__PURE__ */ new Map();
function clearExpiredSessions() {
  const now = Date.now();
  for (const [token, session] of sessionsByToken.entries()) {
    if (session.expiresAt < now) {
      sessionsByToken.delete(token);
    }
  }
}
setInterval(clearExpiredSessions, 1e3 * 60 * 60);
var DATA_DIR = path.resolve(__dirname, "data");
var ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
var MIGRATIONS_FILE = path.join(DATA_DIR, "migrations.json");
var { Pool } = pg;
var dbPool = null;
if (process.env.DATABASE_URL) {
  dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : void 0
  });
}
function hashPassword(pw, salt) {
  if (!salt) {
    const newSalt = crypto.randomBytes(16).toString("hex");
    const hash2 = crypto.scryptSync(pw, newSalt, 64).toString("hex");
    return `scrypt:${newSalt}:${hash2}`;
  }
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return hash;
}
function verifyPassword(pw, storedHash) {
  if (storedHash.startsWith("scrypt:")) {
    const [, salt, hash] = storedHash.split(":");
    return hashPassword(pw, salt) === hash;
  }
  const legacyHash = crypto.createHash("sha256").update(`beyond_salt_${pw}`).digest("hex");
  return legacyHash === storedHash;
}
function toPublicProfile(acc) {
  return {
    id: acc.id,
    username: acc.username,
    preferredClass: acc.lockedClass,
    lockedClass: acc.lockedClass,
    runsCompleted: acc.runsCompleted,
    highestFloor: acc.highestFloor,
    totalKills: acc.totalKills,
    totalRevives: acc.totalRevives,
    isAdmin: !!acc.isAdmin,
    level: acc.level || 1,
    xp: acc.xp || 0,
    strength: acc.strength || 0,
    vitality: acc.vitality || 0,
    dexterity: acc.dexterity || 0,
    intelligence: acc.intelligence || 0,
    faith: acc.faith || 0,
    attributePoints: acc.attributePoints || 0
  };
}
function saveAccountsToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(accountsById.values());
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save accounts to file:", err);
  }
}
var accountLocks = /* @__PURE__ */ new Map();
async function persistAccount(acc) {
  const lockKey = acc.id;
  const existingLock = accountLocks.get(lockKey) || Promise.resolve();
  const newLock = (async () => {
    try {
      await existingLock;
    } catch {
    }
    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO accounts (
            id, username, username_lower, password_hash, locked_class, preferred_class,
            runs_completed, highest_floor, total_kills, total_revives, gold, is_admin,
            level, xp,
            strength, vitality, dexterity, intelligence, faith, attribute_points, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW())
          ON CONFLICT (username_lower) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            locked_class = EXCLUDED.locked_class,
            preferred_class = EXCLUDED.preferred_class,
            runs_completed = EXCLUDED.runs_completed,
            highest_floor = EXCLUDED.highest_floor,
            total_kills = EXCLUDED.total_kills,
            total_revives = EXCLUDED.total_revives,
            gold = EXCLUDED.gold,
            is_admin = EXCLUDED.is_admin,
            level = EXCLUDED.level,
            xp = EXCLUDED.xp,
            strength = EXCLUDED.strength,
            vitality = EXCLUDED.vitality,
            dexterity = EXCLUDED.dexterity,
            intelligence = EXCLUDED.intelligence,
            faith = EXCLUDED.faith,
            attribute_points = EXCLUDED.attribute_points,
            updated_at = NOW();`,
          [
            acc.id,
            acc.username,
            acc.usernameLower,
            acc.passwordHash,
            acc.lockedClass,
            acc.preferredClass,
            acc.runsCompleted,
            acc.highestFloor,
            acc.totalKills,
            acc.totalRevives,
            acc.gold ?? 0,
            !!acc.isAdmin,
            acc.level || 1,
            acc.xp || 0,
            acc.strength || 0,
            acc.vitality || 0,
            acc.dexterity || 0,
            acc.intelligence || 0,
            acc.faith || 0,
            acc.attributePoints || 0
          ]
        );
      } catch (err) {
        console.error(`Postgres persist error for ${acc.username}:`, err);
        throw err;
      }
    }
    accountsByLower.set(acc.usernameLower, acc);
    accountsById.set(acc.id, acc);
    saveAccountsToFile();
  })();
  accountLocks.set(lockKey, newLock);
  newLock.then(
    () => {
      if (accountLocks.get(lockKey) === newLock) {
        accountLocks.delete(lockKey);
      }
    },
    () => {
      if (accountLocks.get(lockKey) === newLock) {
        accountLocks.delete(lockKey);
      }
    }
  );
  return newLock;
}
async function initStorage() {
  if (dbPool) {
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id VARCHAR(64) PRIMARY KEY,
          username VARCHAR(32) NOT NULL,
          username_lower VARCHAR(32) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          locked_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          preferred_class VARCHAR(24) NOT NULL DEFAULT 'vanguard',
          runs_completed INT NOT NULL DEFAULT 0,
          highest_floor INT NOT NULL DEFAULT 0,
          total_kills INT NOT NULL DEFAULT 0,
          total_revives INT NOT NULL DEFAULT 0,
          gold INT NOT NULL DEFAULT 0,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          level INT NOT NULL DEFAULT 1,
          xp INT NOT NULL DEFAULT 0,
          strength INT NOT NULL DEFAULT 0,
          vitality INT NOT NULL DEFAULT 0,
          dexterity INT NOT NULL DEFAULT 0,
          intelligence INT NOT NULL DEFAULT 0,
          faith INT NOT NULL DEFAULT 0,
          attribute_points INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      await dbPool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='is_admin') THEN
            ALTER TABLE accounts ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='strength') THEN
            ALTER TABLE accounts ADD COLUMN strength INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='intelligence') THEN
            ALTER TABLE accounts ADD COLUMN intelligence INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='faith') THEN
            ALTER TABLE accounts ADD COLUMN faith INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='dexterity') THEN
            ALTER TABLE accounts ADD COLUMN dexterity INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='vitality') THEN
            ALTER TABLE accounts ADD COLUMN vitality INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='attribute_points') THEN
            ALTER TABLE accounts ADD COLUMN attribute_points INT NOT NULL DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='level') THEN
            ALTER TABLE accounts ADD COLUMN level INT NOT NULL DEFAULT 1;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='accounts' AND column_name='xp') THEN
            ALTER TABLE accounts ADD COLUMN xp INT NOT NULL DEFAULT 0;
          END IF;
          -- Increase password_hash length for scrypt
          ALTER TABLE accounts ALTER COLUMN password_hash TYPE VARCHAR(255);
        END $$;
      `);
      console.log("Connected to PostgreSQL and verified schema.");
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(64) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      const migrationRes = await dbPool.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        ["20261106_reset_attributes"]
      );
      if (migrationRes.rowCount === 0) {
        console.log("[Migration] Running one-time global attribute reset in PostgreSQL...");
        await dbPool.query(`
          UPDATE accounts 
          SET strength = 0, vitality = 0, dexterity = 0, intelligence = 0, faith = 0, 
              attribute_points = (GREATEST(1, level) - 1) * 2;
        `);
        await dbPool.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          ["20261106_reset_attributes"]
        );
        console.log("[Migration] Attribute reset migration completed successfully in PostgreSQL.");
      } else {
        console.log("[Migration] Attribute reset migration already applied. Preserving account attributes.");
      }
      const res = await dbPool.query("SELECT * FROM accounts");
      for (const row of res.rows) {
        const lvl = Number(row.level) || 1;
        const rec = {
          id: row.id,
          username: row.username,
          usernameLower: row.username_lower,
          passwordHash: row.password_hash,
          lockedClass: row.locked_class,
          preferredClass: row.preferred_class,
          runsCompleted: Number(row.runs_completed) || 0,
          highestFloor: Number(row.highest_floor) || 0,
          totalKills: Number(row.total_kills) || 0,
          totalRevives: Number(row.total_revives) || 0,
          gold: Number(row.gold) || 0,
          isAdmin: !!row.is_admin,
          level: lvl,
          xp: Number(row.xp) || 0,
          strength: Number(row.strength) || 0,
          vitality: Number(row.vitality) || 0,
          dexterity: Number(row.dexterity) || 0,
          intelligence: Number(row.intelligence) || 0,
          faith: Number(row.faith) || 0,
          attributePoints: Number(row.attribute_points) || 0
        };
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }
      console.log(`Loaded ${res.rows.length} accounts from PostgreSQL.`);
    } catch (err) {
      console.error("PostgreSQL init error, falling back to local storage:", err);
    }
  }
  if (accountsById.size === 0 && fs.existsSync(ACCOUNTS_FILE)) {
    try {
      const isProduction2 = process.env.NODE_ENV === "production";
      const data = fs.readFileSync(ACCOUNTS_FILE, "utf8");
      const list = JSON.parse(data);
      let appliedMigrations = [];
      if (fs.existsSync(MIGRATIONS_FILE)) {
        try {
          appliedMigrations = JSON.parse(fs.readFileSync(MIGRATIONS_FILE, "utf8"));
        } catch {
          appliedMigrations = [];
        }
      }
      const needsReset = !appliedMigrations.includes("20261106_reset_attributes");
      if (needsReset) {
        console.log("[JSON Storage] Applying one-time attribute reset migration...");
      }
      for (const rec of list) {
        if (isProduction2 && rec.usernameLower === "wanderer") continue;
        rec.level = Number(rec.level) || 1;
        rec.xp = Number(rec.xp) || 0;
        if (needsReset) {
          rec.strength = 0;
          rec.vitality = 0;
          rec.dexterity = 0;
          rec.intelligence = 0;
          rec.faith = 0;
          rec.attributePoints = (Math.max(1, rec.level) - 1) * 2;
        } else {
          rec.strength = Number(rec.strength) || 0;
          rec.vitality = Number(rec.vitality) || 0;
          rec.dexterity = Number(rec.dexterity) || 0;
          rec.intelligence = Number(rec.intelligence) || 0;
          rec.faith = Number(rec.faith) || 0;
          rec.attributePoints = Number(rec.attributePoints) || 0;
        }
        accountsByLower.set(rec.usernameLower, rec);
        accountsById.set(rec.id, rec);
      }
      if (needsReset) {
        appliedMigrations.push("20261106_reset_attributes");
        if (!fs.existsSync(DATA_DIR)) {
          fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.writeFileSync(MIGRATIONS_FILE, JSON.stringify(appliedMigrations, null, 2), "utf8");
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(Array.from(accountsById.values()), null, 2), "utf8");
        console.log("[JSON Storage] One-time attribute reset applied and recorded.");
      }
      console.log(`Loaded ${accountsById.size} accounts from ${ACCOUNTS_FILE}`);
    } catch (err) {
      console.error("Failed to load accounts from file:", err);
    }
  }
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction && !accountsByLower.has("wanderer")) {
    createAccount("wanderer", "beyond", "vanguard");
  }
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const adminUsername = "Aleph";
  const adminLower = adminUsername.toLowerCase();
  if (!accountsByLower.has(adminLower)) {
    if (bootstrapPassword) {
      if (bootstrapPassword.length >= 16) {
        console.log(`Bootstrapping fresh admin account "${adminUsername}"...`);
        createAccount(adminUsername, bootstrapPassword, "vanguard", true);
      } else {
        console.warn(`[Admin Bootstrap] ADMIN_BOOTSTRAP_PASSWORD provided but does not meet minimum length requirement of 16 characters (length: ${bootstrapPassword.length}).`);
      }
    }
  } else {
    const existing = accountsByLower.get(adminLower);
    if (!existing.isAdmin) {
      console.log(`Granting administrator privileges to account "${adminUsername}"...`);
      existing.isAdmin = true;
      persistAccount(existing);
    }
  }
}
function createAccount(username, password, chosenClass = "vanguard", isAdmin = false) {
  const validClass = chosenClass === "ranger" || chosenClass === "arcanist" || chosenClass === "cleric" ? chosenClass : "vanguard";
  const id = `usr_${crypto.randomBytes(6).toString("hex")}`;
  const lowerName = username.toLowerCase();
  const isUserAdmin = isAdmin;
  const rec = {
    id,
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: hashPassword(password),
    lockedClass: validClass,
    preferredClass: validClass,
    runsCompleted: 0,
    highestFloor: 0,
    totalKills: 0,
    totalRevives: 0,
    gold: 0,
    isAdmin: isUserAdmin,
    strength: 0,
    vitality: 0,
    dexterity: 0,
    intelligence: 0,
    faith: 0,
    attributePoints: 0,
    level: 1,
    xp: 0
  };
  persistAccount(rec);
  return rec;
}
var rooms = /* @__PURE__ */ new Map();
var clients = /* @__PURE__ */ new Set();
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BYND-";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}
function sendJson(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}
function broadcastRoomList() {
  const summaries = Array.from(rooms.values()).filter((r) => r.roomId !== "TAVERN-HUB").map((r) => r.getSummary());
  const payload = {
    type: "lobby:rooms",
    rooms: summaries,
    onlineCount: clients.size
  };
  for (const c of clients) {
    if (!c.roomId || c.roomId === "TAVERN-HUB") {
      sendJson(c.ws, payload);
    }
  }
}
function broadcastToRoom(roomId, msg) {
  for (const c of clients) {
    if (c.roomId === roomId) {
      sendJson(c.ws, msg);
    }
  }
}
function createManagedRoom(opts) {
  const roomId = generateRoomCode();
  const room = new GameRoom({
    roomId,
    name: opts.name.trim() || `${opts.hostName}'s Expedition`,
    hostName: opts.hostName,
    difficulty: opts.difficulty,
    seed: opts.seed
  });
  room.onFloorClearedCallback = async (playerIds, floor) => {
    for (const pid of playerIds) {
      const acc = accountsById.get(pid);
      if (acc) {
        acc.highestFloor = Math.max(acc.highestFloor, floor);
        if (floor >= 3) acc.runsCompleted += 1;
        await persistAccount(acc).catch((err) => console.error("Failed to persist floor clear:", err));
      }
    }
  };
  room.onKillCallback = async (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalKills += 1;
      await persistAccount(acc).catch((err) => console.error("Failed to persist kill:", err));
    }
  };
  room.onReviveCallback = async (pid) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.totalRevives += 1;
      await persistAccount(acc).catch((err) => console.error("Failed to persist revive:", err));
    }
  };
  room.onProgressionUpdateCallback = async (pid, state) => {
    const acc = accountsById.get(pid);
    if (acc) {
      acc.level = state.level;
      acc.xp = state.xp;
      acc.strength = state.strength;
      acc.vitality = state.vitality;
      acc.dexterity = state.dexterity;
      acc.intelligence = state.intelligence;
      acc.faith = state.faith;
      acc.attributePoints = state.attributePoints;
      await persistAccount(acc).catch((err) => {
        console.error("CRITICAL: Failed to persist progression update:", err);
      });
    }
  };
  rooms.set(roomId, room);
  return room;
}
function leaveCurrentRoom(client) {
  if (!client.roomId) return;
  const oldRoomId = client.roomId;
  client.roomId = null;
  const room = rooms.get(oldRoomId);
  if (room) {
    const stillConnected = Array.from(clients).some(
      (other) => other.userId === client.userId && other.roomId === oldRoomId
    );
    if (!stillConnected) {
      room.removePlayer(client.userId);
      if (room.getPlayerCount() === 0 && oldRoomId !== "TAVERN-HUB") {
        rooms.delete(oldRoomId);
      }
    }
  }
  broadcastRoomList();
}
async function startServer() {
  await initStorage();
  const tavernRoom = new GameRoom({
    roomId: "TAVERN-HUB",
    name: "Sanctuary Tavern & Social Hub",
    hostName: "Innkeeper",
    difficulty: "Normal",
    seed: 777
  });
  rooms.set("TAVERN-HUB", tavernRoom);
  const app = express();
  app.use(express.json());
  const isProduction = process.env.NODE_ENV === "production";
  const rawOrigins = process.env.ALLOWED_ORIGINS || "";
  const allowedOrigins = rawOrigins.split(",").map((o) => o.trim()).filter((o) => {
    if (!o) return false;
    try {
      if (o.includes("*")) return false;
      const url = new URL(o);
      return url.origin === o && (url.protocol === "http:" || url.protocol === "https:");
    } catch {
      return false;
    }
  });
  if (rawOrigins && allowedOrigins.length === 0) {
    console.error("CRITICAL: ALLOWED_ORIGINS is configured but all entries were rejected as malformed.");
  }
  function isOriginAllowed(origin, hostHeader) {
    if (!origin) return true;
    if (allowedOrigins.length > 0) {
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return true;
      }
    }
    try {
      const url = new URL(origin);
      const hostname = url.hostname.toLowerCase();
      if (hostHeader) {
        const cleanHost = hostHeader.split(":")[0].toLowerCase();
        if (hostname === cleanHost) return true;
      }
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        return true;
      }
      if (hostname.endsWith(".onrender.com") || hostname.endsWith(".run.app") || hostname.endsWith(".vercel.app")) {
        return true;
      }
    } catch {
      return false;
    }
    return !isProduction;
  }
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const isAllowed = isOriginAllowed(origin, req.headers.host);
    if (isAllowed && origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    if (origin && !isAllowed) {
      console.warn(`Blocked CORS request from unauthorized origin: ${origin}`);
      res.status(403).json({ error: "CORS policy: Origin not allowed." });
      return;
    }
    next();
  });
  const isMaintenance = process.env.MAINTENANCE_MODE === "true";
  const redirectTarget = process.env.REDIRECT_URL || "https://beyond-game-sg.onrender.com";
  app.post("/api/auth/login", (req, res) => {
    const usernameRaw = String(req.body?.username ?? "").trim();
    const passwordRaw = String(req.body?.password ?? "");
    if (usernameRaw.length < 2 || usernameRaw.length > 20) {
      res.status(400).json({ error: "Username must be 2 to 20 characters." });
      return;
    }
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    const acc = accountsByLower.get(usernameRaw.toLowerCase());
    if (!acc) {
      if (isMaintenance) {
        res.status(503).json({
          error: `Server is migrating to Singapore for lower latency. Please connect to: ${redirectTarget}`,
          redirectUrl: redirectTarget
        });
        return;
      }
      res.status(401).json({ error: "No adventurer account found with that name." });
      return;
    }
    if (!verifyPassword(passwordRaw, acc.passwordHash)) {
      res.status(401).json({ error: "Invalid password for this adventurer." });
      return;
    }
    if (!acc.passwordHash.startsWith("scrypt:")) {
      acc.passwordHash = hashPassword(passwordRaw);
      persistAccount(acc);
    }
    if (acc.usernameLower === "aleph" && !acc.isAdmin) {
      acc.isAdmin = true;
      persistAccount(acc);
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessionsByToken.set(token, {
      userId: acc.id,
      expiresAt: Date.now() + 1e3 * 60 * 60 * 24
      // 24 hours
    });
    res.json({ token, user: toPublicProfile(acc) });
  });
  app.post("/api/auth/register", (req, res) => {
    if (isMaintenance) {
      res.status(503).json({
        error: `Server is migrating to Singapore for lower latency. Please register at: ${redirectTarget}`,
        redirectUrl: redirectTarget
      });
      return;
    }
    const usernameRaw = String(req.body?.username ?? "").trim();
    const passwordRaw = String(req.body?.password ?? "");
    const preferredClass = req.body?.preferredClass || "vanguard";
    if (!/^[a-zA-Z0-9_-]{2,20}$/.test(usernameRaw)) {
      res.status(400).json({
        error: "Username must be 2\u201320 letters, numbers, underscores, or hyphens."
      });
      return;
    }
    if (passwordRaw.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters." });
      return;
    }
    if (accountsByLower.has(usernameRaw.toLowerCase())) {
      res.status(409).json({ error: "That adventurer name is already claimed." });
      return;
    }
    const isAdmin = usernameRaw.toLowerCase() === "aleph";
    const acc = createAccount(usernameRaw, passwordRaw, preferredClass, isAdmin);
    const token = crypto.randomBytes(24).toString("hex");
    sessionsByToken.set(token, {
      userId: acc.id,
      expiresAt: Date.now() + 1e3 * 60 * 60 * 24
      // 24 hours
    });
    res.status(201).json({ token, user: toPublicProfile(acc) });
  });
  app.post("/api/auth/change-password", async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Authentication required to change password." });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    const currentPassword = String(req.body?.currentPassword ?? "");
    const newPassword = String(req.body?.newPassword ?? "");
    if (newPassword.length < 8) {
      res.status(400).json({ error: "New password must be at least 8 characters." });
      return;
    }
    if (!verifyPassword(currentPassword, acc.passwordHash)) {
      res.status(401).json({ error: "Incorrect current password." });
      return;
    }
    acc.passwordHash = hashPassword(newPassword);
    await persistAccount(acc);
    for (const [t, sess] of sessionsByToken.entries()) {
      if (sess.userId === userId && t !== token) {
        sessionsByToken.delete(t);
      }
    }
    sessionsByToken.set(token, {
      userId,
      expiresAt: Date.now() + 1e3 * 60 * 60 * 24
      // 24 hours
    });
    res.json({ message: "Password updated successfully.", token });
  });
  app.get("/api/auth/me", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    if (!userId) {
      res.status(401).json({ error: "Session expired." });
      return;
    }
    const acc = accountsById.get(userId);
    if (!acc) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    res.json({ user: toPublicProfile(acc) });
  });
  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token) sessionsByToken.delete(token);
    res.json({ ok: true });
  });
  app.get("/api/admin/export-accounts", (req, res) => {
    const authHeader = req.headers.authorization || "";
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      res.status(500).json({ error: "Migration secret not configured or too weak." });
      return;
    }
    if (!authHeader.startsWith("Bearer ")) {
      res.status(403).json({ error: "Forbidden: Missing Bearer token." });
      return;
    }
    const providedToken = Buffer.from(authHeader.slice(7));
    const expectedBuffer = Buffer.from(expectedSecret);
    if (providedToken.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedToken, expectedBuffer)) {
      res.status(403).json({ error: "Forbidden: Invalid or missing migration admin secret." });
      return;
    }
    const list = Array.from(accountsById.values());
    res.json({
      exportTimestamp: Date.now(),
      count: list.length,
      accounts: list
    });
  });
  app.post("/api/admin/import-accounts", async (req, res) => {
    const authHeader = req.headers.authorization || "";
    const expectedSecret = process.env.MIGRATION_ADMIN_SECRET;
    if (!expectedSecret || expectedSecret.length < 16) {
      res.status(500).json({ error: "Migration secret not configured or too weak." });
      return;
    }
    if (!authHeader.startsWith("Bearer ")) {
      res.status(403).json({ error: "Forbidden: Missing Bearer token." });
      return;
    }
    const providedToken = Buffer.from(authHeader.slice(7));
    const expectedBuffer = Buffer.from(expectedSecret);
    if (providedToken.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedToken, expectedBuffer)) {
      res.status(403).json({ error: "Forbidden: Invalid or missing migration admin secret." });
      return;
    }
    const payload = req.body?.accounts;
    if (!Array.isArray(payload)) {
      res.status(400).json({ error: 'Invalid payload: "accounts" array required.' });
      return;
    }
    let importedCount = 0;
    for (const item of payload) {
      if (item && item.username && item.passwordHash) {
        const rec = {
          id: String(item.id || `usr_${crypto.randomBytes(6).toString("hex")}`),
          username: String(item.username),
          usernameLower: String(item.usernameLower || item.username).toLowerCase(),
          passwordHash: String(item.passwordHash),
          lockedClass: item.lockedClass || "vanguard",
          preferredClass: item.preferredClass || item.lockedClass || "vanguard",
          runsCompleted: Number(item.runsCompleted) || 0,
          highestFloor: Number(item.highestFloor) || 0,
          totalKills: Number(item.totalKills) || 0,
          totalRevives: Number(item.totalRevives) || 0,
          gold: Number(item.gold) || 0,
          isAdmin: !!item.isAdmin,
          dexterity: Number(item.dexterity) || 10,
          vitality: Number(item.vitality) || 10,
          attributePoints: Number(item.attributePoints) || 0
        };
        await persistAccount(rec);
        importedCount++;
      }
    }
    res.json({
      success: true,
      importedCount,
      message: `Successfully migrated ${importedCount} accounts into storage.`
    });
  });
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const origin = req.headers.origin;
    const originAllowed = isOriginAllowed(origin, req.headers.host);
    if (!originAllowed) {
      console.warn(`WebSocket connection rejected from unauthorized origin: ${origin}`);
      ws.close(4003, "Forbidden Origin");
      return;
    }
    const token = String(req.headers["sec-websocket-protocol"] || "").split(",")[0].trim();
    const session = sessionsByToken.get(token);
    const userId = session && session.expiresAt > Date.now() ? session.userId : null;
    const acc = userId ? accountsById.get(userId) : void 0;
    if (!acc) {
      sendJson(ws, { type: "error", message: "Authentication required." });
      ws.close(4001, "Unauthorized");
      return;
    }
    const client = {
      ws,
      userId: acc.id,
      username: acc.username,
      roomId: null
    };
    clients.add(client);
    broadcastRoomList();
    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type === "ping") {
        sendJson(ws, { type: "pong", t: msg.t });
        return;
      }
      if (msg.type === "lobby:subscribe") {
        sendJson(ws, {
          type: "lobby:rooms",
          rooms: Array.from(rooms.values()).map((r) => r.getSummary()),
          onlineCount: clients.size
        });
        return;
      }
      if (msg.type === "room:create") {
        if (isMaintenance) {
          sendJson(ws, {
            type: "error",
            message: `Expeditions are paused on Oregon during Singapore migration. Please connect to: ${redirectTarget}`
          });
          return;
        }
        leaveCurrentRoom(client);
        const heroClass = acc.lockedClass || acc.preferredClass || "vanguard";
        const difficulty = msg.difficulty === "Heroic" || msg.difficulty === "Abyssal" ? msg.difficulty : "Normal";
        const room2 = createManagedRoom({
          name: msg.name,
          hostName: acc.username,
          difficulty,
          seed: msg.seed
        });
        room2.addOrReconnectPlayer(acc.id, acc.username, heroClass, acc.isAdmin, {
          level: acc.level || 1,
          xp: acc.xp || 0,
          strength: acc.strength || 0,
          vitality: acc.vitality || 0,
          dexterity: acc.dexterity || 0,
          intelligence: acc.intelligence || 0,
          faith: acc.faith || 0,
          attributePoints: acc.attributePoints || 0
        });
        client.roomId = room2.roomId;
        sendJson(ws, {
          type: "room:joined",
          roomId: room2.roomId,
          playerId: acc.id,
          map: room2.map,
          snapshot: room2.buildSnapshot(),
          chat: room2.chat
        });
        broadcastRoomList();
        return;
      }
      if (msg.type === "room:join") {
        const normalizedCode = msg.roomId.trim().toUpperCase();
        let room2 = rooms.get(normalizedCode);
        if (!room2 && normalizedCode === "TAVERN-HUB") {
          room2 = new GameRoom({
            roomId: "TAVERN-HUB",
            name: "Sanctuary Tavern & Social Hub",
            hostName: "Innkeeper",
            difficulty: "Normal",
            seed: 777
          });
          rooms.set("TAVERN-HUB", room2);
        }
        if (!room2) {
          sendJson(ws, {
            type: "error",
            message: `Room "${normalizedCode}" was not found or has closed.`
          });
          return;
        }
        if (!room2.hasPlayer(acc.id) && room2.getPlayerCount() >= room2.maxPlayers) {
          sendJson(ws, {
            type: "error",
            message: "That expedition party is already full (4/4)."
          });
          return;
        }
        leaveCurrentRoom(client);
        const heroClass = acc.lockedClass || acc.preferredClass || "vanguard";
        room2.addOrReconnectPlayer(acc.id, acc.username, heroClass, acc.isAdmin, {
          level: acc.level || 1,
          xp: acc.xp || 0,
          strength: acc.strength || 0,
          vitality: acc.vitality || 0,
          dexterity: acc.dexterity || 0,
          intelligence: acc.intelligence || 0,
          faith: acc.faith || 0,
          attributePoints: acc.attributePoints || 0
        });
        client.roomId = room2.roomId;
        sendJson(ws, {
          type: "room:joined",
          roomId: room2.roomId,
          playerId: acc.id,
          map: room2.map,
          snapshot: room2.buildSnapshot(),
          chat: room2.chat
        });
        broadcastRoomList();
        return;
      }
      if (msg.type === "room:leave") {
        leaveCurrentRoom(client);
        sendJson(ws, { type: "room:left" });
        return;
      }
      if (!client.roomId) return;
      const room = rooms.get(client.roomId);
      if (!room) return;
      if (msg.type === "player:input") {
        room.updateInput(acc.id, msg.input);
      } else if (msg.type === "player:action") {
        const res = room.performAction(acc.id, msg.action, msg.aimAngle);
        if (res.floorChanged) {
          broadcastToRoom(room.roomId, {
            type: "room:map",
            map: res.floorChanged
          });
          broadcastRoomList();
        }
      } else if (msg.type === "player:select_relic") {
        room.selectRelic(acc.id, msg.relicId);
      } else if (msg.type === "player:change_class") {
        if (acc.isAdmin) {
          const validClass = msg.heroClass === "ranger" || msg.heroClass === "arcanist" || msg.heroClass === "cleric" || msg.heroClass === "vanguard" ? msg.heroClass : "vanguard";
          acc.lockedClass = validClass;
          acc.preferredClass = validClass;
          await persistAccount(acc);
          room.changeClass(acc.id, validClass);
          broadcastToRoom(room.roomId, {
            type: "chat:message",
            message: room.pushSystemChat(`[ADMIN] ${acc.username} shifted hero class to ${validClass.toUpperCase()}`)
          });
        } else {
          sendJson(ws, {
            type: "error",
            message: `${acc.username}'s account is permanently bound to the ${acc.lockedClass.toUpperCase()} class.`
          });
        }
      } else if (msg.type === "admin:godmode") {
        if (acc.isAdmin) {
          const isGod = room.togglePlayerGodMode(acc.id, msg.enabled);
          broadcastToRoom(room.roomId, {
            type: "chat:message",
            message: room.pushSystemChat(`[ADMIN] God Mode ${isGod ? "ENABLED" : "DISABLED"} for ${acc.username}`)
          });
        } else {
          sendJson(ws, { type: "error", message: "Admin access required." });
        }
      } else if (msg.type === "admin:toggle_speed") {
        if (acc.isAdmin) {
          const isSpeed = room.togglePlayerSpeedBoost(acc.id, msg.enabled);
          broadcastToRoom(room.roomId, {
            type: "chat:message",
            message: room.pushSystemChat(`[ADMIN] Speed Boost ${isSpeed ? "ENABLED" : "DISABLED"} for ${acc.username}`)
          });
        } else {
          sendJson(ws, { type: "error", message: "Admin access required." });
        }
      } else if (msg.type === "admin:add_gold") {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0 && amount <= 1e6) {
            room.addPlayerGold(acc.id, amount);
          }
        }
      } else if (msg.type === "admin:add_potions") {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0 && amount <= 99) {
            room.addPlayerPotions(acc.id, amount);
          }
        }
      } else if (msg.type === "admin:set_level") {
        if (acc.isAdmin) {
          const level = Math.floor(Number(msg.level));
          if (Number.isFinite(level) && level >= 1 && level <= MAX_LEVEL) {
            room.setPlayerLevel(acc.id, level);
            broadcastToRoom(room.roomId, {
              type: "chat:message",
              message: room.pushSystemChat(`[ADMIN] Set Level ${level} for ${acc.username}`)
            });
          }
        }
      } else if (msg.type === "admin:add_relic") {
        if (acc.isAdmin && msg.relicId) {
          room.addPlayerRelic(acc.id, String(msg.relicId));
        }
      } else if (msg.type === "admin:spawn_dummy") {
        if (acc.isAdmin) {
          room.spawnDummyAtPlayer(acc.id);
        }
      } else if (msg.type === "player:ping") {
        room.addPing(acc.id, msg.label, msg.x, msg.y);
      } else if (msg.type === "chat:send") {
        const trimmed = String(msg.text ?? "").trim();
        if (trimmed.length > 0) {
          const chatMsg = room.pushChat(acc.username, trimmed, false);
          broadcastToRoom(room.roomId, {
            type: "chat:message",
            message: chatMsg
          });
        }
      } else if (msg.type === "room:restart") {
        const freshMap = room.restartRun();
        broadcastToRoom(room.roomId, { type: "room:map", map: freshMap });
        broadcastRoomList();
      } else if (msg.type === "player:spend_attribute") {
        if (acc.attributePoints && acc.attributePoints > 0) {
          const attr = msg.attribute;
          if (attr === "strength" || attr === "dexterity" || attr === "vitality" || attr === "intelligence" || attr === "faith") {
            if ((acc[attr] || 0) < MAX_ATTRIBUTE) {
              const oldAttr = acc[attr] || 0;
              const oldPoints = acc.attributePoints;
              acc[attr] = oldAttr + 1;
              acc.attributePoints = oldPoints - 1;
              try {
                await persistAccount(acc);
                room.pushSystemChat(`${acc.username} increased ${attr.toUpperCase()} to ${acc[attr]}.`);
                room.updatePlayerAttributes(
                  acc.id,
                  acc.strength || 0,
                  acc.vitality || 0,
                  acc.dexterity || 0,
                  acc.intelligence || 0,
                  acc.faith || 0,
                  acc.attributePoints || 0
                );
              } catch (err) {
                acc[attr] = oldAttr;
                acc.attributePoints = oldPoints;
                sendJson(ws, { type: "error", message: "Failed to save attribute allocation. Please try again." });
              }
            } else {
              sendJson(ws, { type: "error", message: `${attr.toUpperCase()} is already at maximum level.` });
            }
          }
        }
      } else if (msg.type === "admin:add_attribute_points") {
        if (acc.isAdmin) {
          const amount = Math.floor(Number(msg.amount));
          if (Number.isFinite(amount) && amount > 0) {
            acc.attributePoints = (acc.attributePoints || 0) + amount;
            await persistAccount(acc).catch((err) => console.error("Failed to persist admin attribute points:", err));
            room.addPlayerAttributePoints(acc.id, amount);
          }
        }
      } else if (msg.type === "player:reset_attributes") {
        if (room.roomId !== "TAVERN-HUB") {
          sendJson(ws, { type: "error", message: "Attributes can only be reset in the Sanctuary Tavern." });
          return;
        }
        if (!room.isPlayerNearNpc(acc.id, "npc_aleph", 85)) {
          sendJson(ws, { type: "error", message: "You must be speaking with Aleph to reset your attributes." });
          return;
        }
        const spent = (acc.strength || 0) + (acc.vitality || 0) + (acc.dexterity || 0) + (acc.intelligence || 0) + (acc.faith || 0);
        const oldState = {
          strength: acc.strength,
          vitality: acc.vitality,
          dexterity: acc.dexterity,
          intelligence: acc.intelligence,
          faith: acc.faith,
          attributePoints: acc.attributePoints
        };
        acc.attributePoints = (acc.attributePoints || 0) + spent;
        acc.strength = 0;
        acc.vitality = 0;
        acc.dexterity = 0;
        acc.intelligence = 0;
        acc.faith = 0;
        try {
          await persistAccount(acc);
          room.updatePlayerAttributes(
            acc.id,
            acc.strength,
            acc.vitality,
            acc.dexterity,
            acc.intelligence,
            acc.faith,
            acc.attributePoints
          );
          room.pushSystemChat(`${acc.username} has reclaimed ${spent} attribute points through Aleph.`);
        } catch (err) {
          Object.assign(acc, oldState);
          sendJson(ws, { type: "error", message: "Failed to reset attributes. Please try again." });
        }
        const aleph = room.npcs.find((n) => n.id === "npc_aleph");
        if (aleph) {
          aleph.speakingMs = 0;
        }
      } else if (msg.type === "player:dialogue_close") {
        const speakingNpc = room.npcs.find((n) => (n.speakingMs ?? 0) > 0);
        if (speakingNpc) {
          speakingNpc.speakingMs = 0;
        }
      } else if (msg.type === "player:dialogue_pick") {
        const speakingNpc = room.npcs.find((n) => (n.speakingMs ?? 0) > 0);
        if (speakingNpc) {
          if (speakingNpc.id === "npc_aleph") {
            if (msg.optionId === "lore") {
              speakingNpc.dialogue = "I am who I am.";
              speakingNpc.speakingMs = 9999999;
              speakingNpc.options = [
                { id: "back", label: "I see. (Back)" }
              ];
            } else if (msg.optionId === "back") {
              speakingNpc.dialogue = "The paths you walk are many, but your soul remains constant.";
              speakingNpc.options = [
                { id: "reset_stats", label: "I wish to reset my attributes." },
                { id: "lore", label: "Who are you?" }
              ];
            } else if (msg.optionId === "reset_stats") {
            }
          }
        }
      }
    });
    ws.on("close", () => {
      clients.delete(client);
      leaveCurrentRoom(client);
      broadcastRoomList();
    });
  });
  const TICK_MS = 50;
  setInterval(() => {
    for (const [roomId, room] of rooms.entries()) {
      if (room.getPlayerCount() === 0) {
        if (roomId !== "TAVERN-HUB") {
          rooms.delete(roomId);
        }
        continue;
      }
      const prevStatus = room.status;
      room.tick(TICK_MS);
      const snapshot = room.buildSnapshot();
      broadcastToRoom(roomId, { type: "room:tick", snapshot });
      if (room.status !== prevStatus) {
        broadcastRoomList();
      }
    }
  }, TICK_MS);
  const distPath = path.resolve(__dirname, "dist");
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(path.join(distPath, "index.html"));
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Beyond Co-op Server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer();
