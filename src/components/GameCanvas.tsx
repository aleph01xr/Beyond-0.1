import React, { useEffect, useRef } from 'react';
import {
  computeCameraZoom,
  computeWorldAimAngle,
  getWorldViewBounds,
  stepCameraFollow,
} from '../client/camera.ts';
import { computeExpSmoothingFactor } from '../client/networkStats.ts';
import { LocalPredictionController } from '../client/prediction.ts';
import { drawEnhancedProjectile, ParticleManager } from '../client/canvasEffects.ts';
import {
  drawDungeonPortal,
  drawDungeonProp,
  drawMysticShrine,
  drawNpc,
  drawRelicVault,
  drawTavernDecorations,
  drawTrainingDummy,
} from '../client/dungeonDecorations.ts';
import {
  drawCultistSprite,
  drawGoblinSprite,
  drawKnightSprite,
  drawSkeletonSprite,
  drawSlimeSprite,
  drawShadowStalkerSprite,
  drawAstralSentinelSprite,
  drawHymnPhantomSprite,
  drawRelicGolemSprite,
  drawVeiledHereticSprite,
  drawCelestialArbiterSprite,
  drawWardenEnforcerSprite,
  drawGenericEnemySprite,
} from '../client/enemySprites.ts';
import { drawHumanoidBoss } from '../client/npcSprites.ts';
import { drawFallenAndGhostPlayer } from '../client/fallenPlayerSprite.ts';
import { drawHeroSprite, type HeroSwingKind } from '../client/heroSprites.ts';
import { sfx, soundManager } from '../client/sound.ts';
import {
  HERO_CLASSES,
  TILE_SIZE,
  type DungeonMap,
  type EnemyKind,
  type FieldZoneState,
  type FloatingEvent,
  type GameSnapshot,
  type HeroClassId,
  type PlayerInputState,
  type ProjectileState,
} from '../shared/types.ts';

interface GameCanvasProps {
  playerId: string;
  map: DungeonMap;
  latestSnapshotRef: React.MutableRefObject<GameSnapshot | null>;
  localInputRef?: React.MutableRefObject<PlayerInputState>;
  latestInputSeqRef?: React.MutableRefObject<number>;
  pingMsRef?: React.MutableRefObject<number>;
  onSendKeyboardInput: (keys: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    aimAngle: number;
  }) => void;
  onTriggerAction: (
    action: 'tactical' | 'ult' | 'potion' | 'interact' | 'dash',
    aimAngle: number
  ) => void;
  onSendPing: (label: string, x: number, y: number) => void;
  chatFocused: boolean;
}

interface ActiveFloatingText extends FloatingEvent {
  bornAt: number;
}

interface SmoothedPos {
  x: number;
  y: number;
}

const GameCanvasComponent: React.FC<GameCanvasProps> = ({
  playerId,
  map,
  latestSnapshotRef,
  localInputRef,
  latestInputSeqRef,
  pingMsRef,
  onSendKeyboardInput,
  onTriggerAction,
  onSendPing,
  chatFocused,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapLayerRef = useRef<HTMLCanvasElement | null>(null);

  const keysRef = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    attack: false,
  });
  const mouseScreenRef = useRef({ x: 0, y: 0 });
  const aimAngleRef = useRef(0);
  const localSwingTriggerRef = useRef<{
    bornAt: number;
    durationMs: number;
    kind: HeroSwingKind;
  } | null>(null);
  const startRoom = map.rooms.find((r) => r.type === 'start') ?? map.rooms[0];
  const initialCamX = startRoom ? startRoom.cx * TILE_SIZE + TILE_SIZE / 2 : 300;
  const initialCamY = startRoom ? startRoom.cy * TILE_SIZE + TILE_SIZE / 2 : 300;
  const cameraRef = useRef({ x: initialCamX, y: initialCamY });
  const cameraZoomRef = useRef<number | null>(null);
  const cameraSnappedRef = useRef(false);
  const chatFocusedRef = useRef(chatFocused);
  chatFocusedRef.current = chatFocused;
  const onSendKeyboardInputRef = useRef(onSendKeyboardInput);
  onSendKeyboardInputRef.current = onSendKeyboardInput;
  const onTriggerActionRef = useRef(onTriggerAction);
  onTriggerActionRef.current = onTriggerAction;
  const onSendPingRef = useRef(onSendPing);
  onSendPingRef.current = onSendPing;
  const localInputPropRef = useRef(localInputRef);
  localInputPropRef.current = localInputRef;
  const latestInputSeqPropRef = useRef(latestInputSeqRef);
  latestInputSeqPropRef.current = latestInputSeqRef;
  const pingMsPropRef = useRef(pingMsRef);
  pingMsPropRef.current = pingMsRef;

  const triggerLocalSwing = (kind: HeroSwingKind) => {
    const now = performance.now();
    const cur = localSwingTriggerRef.current;
    if (cur && now - cur.bornAt < 130 && cur.kind === kind) return;
    const snap = latestSnapshotRef.current;
    const me = snap?.players.find((p) => p.id === playerId) || snap?.players[0];
    if (me) {
      if (me.downed) return;
      if (kind === 'primary' && me.attackAnimMs > 120) return;
      if (kind === 'tactical' && me.skillCooldownMs > 45) return;
      if (kind === 'ult' && me.ultCooldownMs > 45) return;
    }
    const durationMs = kind === 'ult' ? 320 : kind === 'tactical' ? 280 : 220;
    localSwingTriggerRef.current = { bornAt: now, durationMs, kind };
  };

  // Pre-render dungeon floor & walls
  useEffect(() => {
    const off = document.createElement('canvas');
    off.width = map.width * TILE_SIZE;
    off.height = map.height * TILE_SIZE;
    const ctx = off.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const isTavern = map.floor === 0;

    const palette = isTavern
      ? {
          voidBg: '#1A0F0A',
          floorA: '#5C3A21',
          floorB: '#4E3019',
          moss: '#734A2C',
          wallTop: '#5A3824',
          wallFace: '#382216',
          pillar: '#4A2C1A',
        }
      : map.biome === 'courtyard'
        ? {
            voidBg: '#12131A',
            floorA: '#3A3E4A',
            floorB: '#343843',
            moss: '#3A523E',
            wallTop: '#565969',
            wallFace: '#2D2F3B',
            pillar: '#6A6E80',
          }
        : map.biome === 'catacombs'
          ? {
              voidBg: '#0E111B',
              floorA: '#283044',
              floorB: '#232A3C',
              moss: '#2D4A5E',
              wallTop: '#454F6B',
              wallFace: '#202638',
              pillar: '#5B688A',
            }
          : map.biome === 'ember'
            ? {
                voidBg: '#160F12',
                floorA: '#382B2E',
                floorB: '#302427',
                moss: '#5C3228',
                wallTop: '#594246',
                wallFace: '#2B1E21',
                pillar: '#75565B',
              }
            : map.biome === 'void'
              ? {
                  voidBg: '#0D0714',
                  floorA: '#241634',
                  floorB: '#1D112B',
                  moss: '#4A1D6B',
                  wallTop: '#3B2354',
                  wallFace: '#170D24',
                  pillar: '#5C3580',
                }
              : map.biome === 'astral'
                ? {
                    voidBg: '#07121C',
                    floorA: '#1A334B',
                    floorB: '#14293E',
                    moss: '#1E4B6E',
                    wallTop: '#2C577D',
                    wallFace: '#0F2032',
                    pillar: '#3D74A3',
                  }
                : map.biome === 'hymns'
                  ? {
                      voidBg: '#18130B',
                      floorA: '#584E3C',
                      floorB: '#4B4232',
                      moss: '#D4AF37',
                      wallTop: '#847458',
                      wallFace: '#32291B',
                      pillar: '#EAB308',
                    }
                  : map.biome === 'reliquary'
                    ? {
                        voidBg: '#141310',
                        floorA: '#353026',
                        floorB: '#2D281F',
                        moss: '#8C7748',
                        wallTop: '#594F3B',
                        wallFace: '#211E18',
                        pillar: '#9C8552',
                      }
                    : map.biome === 'scripture'
                      ? {
                          voidBg: '#170A0F',
                          floorA: '#3D222A',
                          floorB: '#311A22',
                          moss: '#8C3A4F',
                          wallTop: '#5E333F',
                          wallFace: '#210F16',
                          pillar: '#9E4D62',
                        }
                      : map.biome === 'nave'
                        ? {
                            voidBg: '#171822',
                            floorA: '#4A4D5E',
                            floorB: '#3E4152',
                            moss: '#D4AF37',
                            wallTop: '#70758F',
                            wallFace: '#2A2D3C',
                            pillar: '#E6C254',
                          }
                        : {
                            voidBg: '#1C1710',
                            floorA: '#645B4B',
                            floorB: '#544B3C',
                            moss: '#F59E0B',
                            wallTop: '#948772',
                            wallFace: '#3E3526',
                            pillar: '#F59E0B',
                          };

    ctx.fillStyle = palette.voidBg;
    ctx.fillRect(0, 0, off.width, off.height);

    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const code = map.tiles[ty * map.width + tx];
        if (code === 0) continue;
        const px = tx * TILE_SIZE;
        const py = ty * TILE_SIZE;
        const hash = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;

        if (isTavern) {
          if (code === 1) {
            // Polished Oak Wooden Planks
            ctx.fillStyle = (ty % 2 === 0) ? '#5C3A21' : '#52331C';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // Horizontal plank division lines
            ctx.fillStyle = '#382011';
            ctx.fillRect(px, py + 15, TILE_SIZE, 1);
            ctx.fillRect(px, py + 31, TILE_SIZE, 1);

            // Staggered vertical plank joints
            const jointOffset = (ty % 2 === 0) ? 12 : 24;
            ctx.fillRect(px + jointOffset, py, 1, 15);
            ctx.fillRect(px + ((jointOffset + 16) % 32), py + 16, 1, 16);

            // Wood grain highlights
            ctx.fillStyle = '#734A2C';
            ctx.fillRect(px + 4, py + 4, 12, 1);
            ctx.fillRect(px + 18, py + 20, 8, 1);

            // Brass nails at plank ends
            ctx.fillStyle = '#967246';
            ctx.fillRect(px + jointOffset - 2, py + 2, 1.5, 1.5);
            ctx.fillRect(px + jointOffset - 2, py + 13, 1.5, 1.5);
          } else if (code === 4) {
            // Royal Red Velvet Woven Carpet
            ctx.fillStyle = '#8B1D1D';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // Diamond weave texture
            ctx.fillStyle = '#6B1212';
            ctx.fillRect(px + 4, py + 4, 8, 8);
            ctx.fillRect(px + 20, py + 20, 8, 8);
            ctx.fillRect(px + 20, py + 4, 8, 8);
            ctx.fillRect(px + 4, py + 20, 8, 8);

            // Gold fringe & border
            ctx.fillStyle = '#D97706';
            if (ty === 14) ctx.fillRect(px, py, TILE_SIZE, 3);
            if (ty === 21) ctx.fillRect(px, py + 29, TILE_SIZE, 3);
            if (tx === 14) ctx.fillRect(px, py, 3, TILE_SIZE);
            if (tx === 28) ctx.fillRect(px + 29, py, 3, TILE_SIZE);
          } else if (code === 5) {
            // Fireplace Cobblestone Hearth Floor
            ctx.fillStyle = '#484441';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            // Flagstone seams
            ctx.fillStyle = '#2C2927';
            ctx.fillRect(px, py + 15, TILE_SIZE, 2);
            ctx.fillRect(px + 15, py, 2, TILE_SIZE);

            // Warm hearth ember specks
            ctx.fillStyle = '#D97706';
            if (hash % 5 === 0) ctx.fillRect(px + 6, py + 6, 2, 2);
            if (hash % 3 === 0) ctx.fillRect(px + 22, py + 18, 2, 2);
          } else if (code === 6) {
            // Training Grounds Sand & Dirt Ring
            ctx.fillStyle = '#755437';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#8C6544';
            if (hash % 4 === 0) ctx.fillRect(px + 4, py + 8, 4, 4);
            if (hash % 7 === 0) ctx.fillRect(px + 18, py + 20, 5, 3);
          } else if (code === 2) {
            // Timber-Framed Oak Wall
            ctx.fillStyle = '#382216';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#5A3824';
            ctx.fillRect(px, py, TILE_SIZE, 8);
            ctx.fillStyle = '#24140B';
            ctx.fillRect(px, py + 24, TILE_SIZE, 8);
            ctx.fillStyle = '#D97706';
            if (hash % 6 === 0) {
              // Brass wall sconce mounting
              ctx.fillRect(px + 14, py + 12, 4, 6);
              ctx.fillStyle = '#FBBF24';
              ctx.fillRect(px + 13, py + 8, 6, 4);
            }
          } else if (code === 3) {
            // Heavy Oak Support Post with Iron Straps
            ctx.fillStyle = '#5C3A21';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#4A2C1A';
            ctx.fillRect(px + 4, py + 2, TILE_SIZE - 8, TILE_SIZE - 4);
            // Iron bracket
            ctx.fillStyle = '#1E242B';
            ctx.fillRect(px + 2, py + 12, TILE_SIZE - 4, 6);
            ctx.fillStyle = '#64748B';
            ctx.fillRect(px + 6, py + 14, 2, 2);
            ctx.fillRect(px + 24, py + 14, 2, 2);
          }
        } else {
          if (code === 1 || code === 5) {
            ctx.fillStyle = (tx + ty) % 2 === 0 ? palette.floorA : palette.floorB;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
            ctx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);

            if (map.biome === 'hymns') {
              if (hash % 10 === 0) {
                // Sacred Inlaid Gilded Prayer Cross
                ctx.fillStyle = '#D4AF37';
                ctx.fillRect(px + 14, py + 8, 4, 16);
                ctx.fillRect(px + 8, py + 12, 16, 4);
                ctx.fillStyle = '#FEF08A';
                ctx.fillRect(px + 15, py + 13, 2, 2);
              } else if (hash % 6 === 0) {
                // Holy Hymn Inscription / Gilded Gold Leaf
                ctx.fillStyle = 'rgba(212, 175, 55, 0.45)';
                ctx.fillRect(px + 6, py + 10, 12, 2);
                ctx.fillRect(px + 6, py + 15, 18, 2);
                ctx.fillRect(px + 6, py + 20, 10, 2);
              }
            } else if (map.biome === 'wardengate') {
              // Clean polished sanctuary marble tile without clutter
            } else if (hash % 11 === 0) {
              ctx.fillStyle = palette.moss;
              ctx.fillRect(px + 4, py + 4, 8, 6);
              ctx.fillRect(px + 8, py + 8, 6, 4);
            } else if (hash % 7 === 0) {
              ctx.fillStyle = 'rgba(255,255,255,0.05)';
              ctx.fillRect(px + 6, py + 6, 10, 4);
            }
          } else if (code === 2) {
            ctx.fillStyle = palette.wallFace;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = palette.wallTop;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE - 8);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 3);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);

            // Sacred Wall Sconces with warm holy candle flames for hymns & wardengate biomes
            if ((map.biome === 'hymns' || map.biome === 'wardengate') && hash % 4 === 0) {
              ctx.fillStyle = '#D97706';
              ctx.fillRect(px + 14, py + 10, 4, 6);
              ctx.fillStyle = '#FBBF24';
              ctx.fillRect(px + 13, py + 6, 6, 4);
              ctx.fillStyle = '#FFFBEB';
              ctx.fillRect(px + 15, py + 5, 2, 2);
            }
          } else if (code === 3) {
            ctx.fillStyle = palette.floorA;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.fillRect(px + 3, py + 22, TILE_SIZE - 6, 8);
            ctx.fillStyle = palette.wallFace;
            ctx.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8);
            ctx.fillStyle = palette.pillar;
            ctx.fillRect(px + 4, py + 2, TILE_SIZE - 8, 16);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fillRect(px + 6, py + 4, TILE_SIZE - 12, 3);

            // Gilded Angelic Wing Relief on hymns & wardengate pillars
            if (map.biome === 'hymns' || map.biome === 'wardengate') {
              ctx.fillStyle = '#FEF08A';
              ctx.fillRect(px + 10, py + 8, 12, 3);
              ctx.fillRect(px + 12, py + 11, 8, 2);
            }
          }
        }
      }
    }

    mapLayerRef.current = off;
  }, [map]);

  // Keyboard Event Handlers (Only fires when keys change - NEVER on an arbitrary interval!)
  useEffect(() => {
    const emitKeys = () => {
      onSendKeyboardInputRef.current({
        ...keysRef.current,
        aimAngle: aimAngleRef.current,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (chatFocusedRef.current) return;
      const k = e.key.toLowerCase();
      let changed = false;

      if (k === 'w' || e.key === 'ArrowUp') {
        if (!keysRef.current.up) {
          keysRef.current.up = true;
          changed = true;
        }
      } else if (k === 's' || e.key === 'ArrowDown') {
        if (!keysRef.current.down) {
          keysRef.current.down = true;
          changed = true;
        }
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        if (!keysRef.current.left) {
          keysRef.current.left = true;
          changed = true;
        }
      } else if (k === 'd' || e.key === 'ArrowRight') {
        if (!keysRef.current.right) {
          keysRef.current.right = true;
          changed = true;
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        const snap = latestSnapshotRef.current;
        const me = snap?.players.find((p) => p.id === playerId);
        if (me && snap) {
          let nearestDist = Infinity;
          const maxDist = me.heroClass === 'vanguard' ? 140 : 460;
          for (const en of snap.enemies) {
            if (en.hp <= 0) continue;
            const d = Math.hypot(en.x - me.x, en.y - me.y);
            if (d < nearestDist && d <= maxDist) {
              nearestDist = d;
              aimAngleRef.current = Math.atan2(en.y - me.y, en.x - me.x);
            }
          }
          if (nearestDist === Infinity && snap.trainingDummies) {
            for (const dummy of snap.trainingDummies) {
              const d = Math.hypot(dummy.x - me.x, dummy.y - me.y);
              if (d < nearestDist && d <= maxDist) {
                nearestDist = d;
                aimAngleRef.current = Math.atan2(dummy.y - me.y, dummy.x - me.x);
              }
            }
          }
          if (nearestDist === Infinity && snap.trainingDummies) {
            for (const dummy of snap.trainingDummies) {
              const d = Math.hypot(dummy.x - me.x, dummy.y - me.y);
              if (d < nearestDist && d <= maxDist) {
                nearestDist = d;
                aimAngleRef.current = Math.atan2(dummy.y - me.y, dummy.x - me.x);
              }
            }
          }
        }
        if (!keysRef.current.attack) {
          keysRef.current.attack = true;
          changed = true;
          triggerLocalSwing('primary');
        }
      } else if (k === 'q') {
        sfx.playSkill('tactical');
        triggerLocalSwing('tactical');
        onTriggerActionRef.current('tactical', aimAngleRef.current);
      } else if (k === 'r' || e.key === 'Shift') {
        sfx.playSkill('ult');
        triggerLocalSwing('ult');
        onTriggerActionRef.current('ult', aimAngleRef.current);
      } else if (k === 'c' || k === 'f' || k === 'v') {
        sfx.playDash();
        onTriggerActionRef.current('dash', aimAngleRef.current);
      } else if (k === 'h' || k === '1') {
        sfx.playHeal();
        onTriggerActionRef.current('potion', aimAngleRef.current);
      } else if (k === 'e') {
        sfx.playUiClick();
        onTriggerActionRef.current('interact', aimAngleRef.current);
      } else if (k === 'g') {
        const snap = latestSnapshotRef.current;
        const me = snap?.players.find((p) => p.id === playerId);
        if (me) {
          sfx.playUiClick();
          onSendPingRef.current('Rally Here', me.x, me.y - 18);
        }
      }

      if (changed) emitKeys();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      let changed = false;
      if (k === 'w' || e.key === 'ArrowUp') {
        keysRef.current.up = false;
        changed = true;
      } else if (k === 's' || e.key === 'ArrowDown') {
        keysRef.current.down = false;
        changed = true;
      } else if (k === 'a' || e.key === 'ArrowLeft') {
        keysRef.current.left = false;
        changed = true;
      } else if (k === 'd' || e.key === 'ArrowRight') {
        keysRef.current.right = false;
        changed = true;
      } else if (e.code === 'Space') {
        keysRef.current.attack = false;
        changed = true;
      }
      if (changed) emitKeys();
    };

    const handleBlur = () => {
      const hadKeys =
        keysRef.current.up ||
        keysRef.current.down ||
        keysRef.current.left ||
        keysRef.current.right ||
        keysRef.current.attack;
      if (hadKeys) {
        keysRef.current = {
          up: false,
          down: false,
          left: false,
          right: false,
          attack: false,
        };
        emitKeys();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [latestSnapshotRef, playerId]);

  // 60 FPS Render Loop with Delta-Time Velocity Extrapolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const smoothedPlayers = new Map<string, SmoothedPos>();
    const smoothedEnemies = new Map<string, SmoothedPos>();
    const prevEnemiesMap = new Map<string, { hp: number; kind: EnemyKind; x: number; y: number }>();
    const prevPlayersMap = new Map<
      string,
      {
        x: number;
        y: number;
        heroClass: HeroClassId;
        skillCooldownMs: number;
        ultCooldownMs: number;
        dashCooldownMs: number;
        shield: number;
      }
    >();
    const prevProjectilesMap = new Map<string, ProjectileState>();
    const prevZonesMap = new Map<string, FieldZoneState>();
    const prevMarkedEnemyIds = new Set<string>();
    let prevBossState: { id: string; x: number; y: number } | null = null;
    const activeDashTrails = new Map<
      string,
      { until: number; lastEmit: number; heroClass: HeroClassId; angle: number }
    >();
    const prevAttackAnimMap = new Map<string, number>();
    const playerWeaponSwings = new Map<
      string,
      { bornAt: number; durationMs: number; kind: HeroSwingKind }
    >();
    let hasInitWorldEffects = false;
    cameraSnappedRef.current = false;
    const entryRoom = map.rooms.find((r) => r.type === 'start') ?? map.rooms[0];
    if (entryRoom) {
      cameraRef.current = {
        x: entryRoom.cx * TILE_SIZE + TILE_SIZE / 2,
        y: entryRoom.cy * TILE_SIZE + TILE_SIZE / 2,
      };
    }
    const floatingTexts: ActiveFloatingText[] = [];
    const seenEventIds = new Set<string>();
    const particleManager = new ParticleManager();
    const localPredictor = new LocalPredictionController();
    let lastSeenSnapshot: GameSnapshot | null = null;
    let screenShake = 0;
    let lastMyAttackAnim = 0;
    let lastPlayerHp: number | null = null;
    let lastPlayerShield: number | null = null;
    let lastPlayerDowned = false;
    let lastRenderTime = performance.now();

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let rafId = 0;
    const render = (now: number) => {
      const dtSec = Math.min(0.05, (now - lastRenderTime) / 1000);
      lastRenderTime = now;

      const cw = canvas.width;
      const ch = canvas.height;
      const targetZoom = computeCameraZoom(cw, ch);
      if (cameraZoomRef.current === null) {
        cameraZoomRef.current = targetZoom;
      } else {
        cameraZoomRef.current += (targetZoom - cameraZoomRef.current) * Math.min(1, dtSec * 10);
      }
      const zoom = cameraZoomRef.current;

      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = '#111219';
      ctx.fillRect(0, 0, cw, ch);

      const snap = latestSnapshotRef.current;
      if (!snap) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const isNewSnapshot = snap !== lastSeenSnapshot;
      lastSeenSnapshot = snap;

      const activeBoss = snap.enemies.find((e) => e.kind === 'boss' && e.hp > 0);
      let bossAimAngle = 0;
      if (activeBoss) {
        let bestPlayerDist = Infinity;
        for (const pr of snap.players) {
          if (pr.downed) continue;
          const dist = Math.hypot(pr.x - activeBoss.x, pr.y - activeBoss.y);
          if (dist < bestPlayerDist) {
            bestPlayerDist = dist;
            bossAimAngle = Math.atan2(pr.y - activeBoss.y, pr.x - activeBoss.x);
          }
        }
      }

      let didVoidStepStatus = false;
      for (const ev of snap.events) {
        if (!seenEventIds.has(ev.id)) {
          seenEventIds.add(ev.id);
          floatingTexts.push({ ...ev, bornAt: now });
          if (ev.kind === 'gold') sfx.playCoin();
          else if (ev.kind === 'heal') {
            sfx.playHeal();
            particleManager.spawnClericHealBurst(ev.x, ev.y, now);
          } else if (ev.kind === 'damage') {
            if (ev.text.toUpperCase().includes('SOUL SIPHON')) {
              sfx.playBossAbility('vaelor', 'soul_siphon_tether');
              particleManager.spawnVaelorSoulSiphonTether(
                ev.x,
                ev.y + 14,
                activeBoss ? activeBoss.x : ev.x,
                activeBoss ? activeBoss.y : ev.y,
                now
              );
            } else {
              sfx.playEnemyHit(false);
              particleManager.spawnHitSparks(ev.x, ev.y, ev.color || '#EF4444', 6, now, false);
              particleManager.spawnPhysicalImpact(ev.x, ev.y, Math.random() * Math.PI * 2, 4, now);
              screenShake = Math.min(5, screenShake + 1.2);
            }
          } else if (ev.kind === 'crit') {
            sfx.playEnemyHit(true);
            particleManager.spawnHitSparks(ev.x, ev.y, '#FBBF24', 12, now, true);
            particleManager.spawnPhysicalImpact(ev.x, ev.y, Math.random() * Math.PI * 2, 8, now);
            screenShake = Math.min(8, screenShake + 3.0);
          } else if (ev.text.includes('Relic')) {
            sfx.playRelicChime();
          } else if (ev.kind === 'status') {
            const txt = ev.text.trim().toUpperCase();
            const bx = activeBoss ? activeBoss.x : ev.x;
            const by = activeBoss ? activeBoss.y : ev.y + 38;
            if (txt.includes('SHIELD WALL')) {
              sfx.playBossAbility('malakor', 'iron_bulwark');
              particleManager.spawnMalakorBulwarkCast(bx, by, now);
            } else if (txt.includes('CLEAVE')) {
              sfx.playBossAbility('malakor', 'triple_cleave');
              particleManager.spawnMalakorTripleCleave(bx, by, bossAimAngle, now);
            } else if (txt.includes('GROUND SLAM')) {
              sfx.playBossAbility('malakor', 'bastion_ground_slam');
              particleManager.spawnImpactRing(bx, by, 35, now);
            } else if (txt.includes('WAR CHARGE')) {
              sfx.playBossAbility('malakor', 'war_charge');
              particleManager.spawnMalakorWarCharge(bx, by, activeBoss?.chargeAngle ?? bossAimAngle, now);
            } else if (txt.includes('FROST NOVA')) {
              sfx.playBossAbility('vaelor', 'glacial_frost_nova');
              particleManager.spawnFrostRing(bx, by, 36, now);
            } else if (txt.includes('SOUL SIPHON')) {
              sfx.playBossAbility('vaelor', 'soul_siphon_tether');
              particleManager.spawnVaelorSoulSiphonTether(ev.x, ev.y + 14, bx, by, now);
            } else if (txt.includes('SOUL HAIL')) {
              sfx.playBossAbility('vaelor', 'seeking_soul_hail');
              particleManager.spawnVaelorSoulHail(bx, by, bossAimAngle, now);
            } else if (txt.includes('DEATH RING')) {
              sfx.playBossAbility('vaelor', 'necrotic_death_ring');
              particleManager.spawnVaelorDeathRing(bx, by, now);
            } else if (txt.includes('MAGMA')) {
              sfx.playBossAbility('ignis', 'magma_eruptions');
              particleManager.spawnIgnisMagmaEruption(bx, by, 40, now);
            } else if (txt.includes('FISSURE WAVE')) {
              sfx.playBossAbility('ignis', 'molten_fissure_wave');
              particleManager.spawnIgnisFissureWave(bx, by, bossAimAngle, now);
            } else if (txt.includes('CINDER SPIRAL')) {
              sfx.playBossAbility('ignis', 'cinder_ember_spiral');
              particleManager.spawnIgnisCinderSpiral(bx, by, now);
            } else if (txt.includes('CORE DETONATION')) {
              sfx.playBossAbility('ignis', 'volcanic_core_detonation');
              particleManager.spawnIgnisCoreDetonation(bx, by, 110, now);
            } else if (txt.includes('SINGULARITY')) {
              sfx.playBossAbility('malice', 'gravitational_singularity');
              particleManager.spawnMaliceSingularityImplosion(bx, by, 45, now);
            } else if (txt.includes('TENDRIL FLURRY')) {
              sfx.playBossAbility('malice', 'void_tendril_flurry');
              particleManager.spawnMaliceTendrilFlurry(bx, by, bossAimAngle, now);
            } else if (txt.includes('VOID STEP')) {
              sfx.playBossAbility('malice', 'void_step');
              didVoidStepStatus = true;
              const fromX = prevBossState && activeBoss && prevBossState.id === activeBoss.id ? prevBossState.x : bx;
              const fromY = prevBossState && activeBoss && prevBossState.id === activeBoss.id ? prevBossState.y : by;
              particleManager.spawnMaliceVoidStep(fromX, fromY, bx, by, now);
            } else if (txt.includes('ABYSSAL NOVA')) {
              sfx.playBossAbility('malice', 'abyssal_nova_spread');
              particleManager.spawnMaliceAbyssalNova(bx, by, now);
            } else if (txt.includes('SUPERNOVA')) {
              sfx.playBossAbility('archon', 'celestial_supernova_ring');
              particleManager.spawnArchonSupernovaBurst(bx, by, 80, now);
            } else if (txt.includes('STARBEAM')) {
              sfx.playBossAbility('archon', 'orbital_starlight_beams');
              particleManager.spawnArchonStarbeamStrike(bx, by, 50, now);
            } else if (txt.includes('COSMIC VOLLEY')) {
              sfx.playBossAbility('archon', 'cosmic_shard_volley');
              particleManager.spawnArchonCosmicVolley(bx, by, bossAimAngle, now);
            } else if (txt.includes('RESONANT CRESCENDO')) {
              sfx.playBossAbility('elyndor', 'resonant_crescendo');
              particleManager.spawnElyndorResonantCrescendo(bx, by, bossAimAngle, now);
            } else if (txt.includes('LAMENT')) {
              sfx.playBossAbility('elyndor', 'lament_of_the_forgotten');
              particleManager.spawnElyndorLamentBurst(bx, by, 55, now);
            } else if (txt.includes('DIVINE CHORUS')) {
              sfx.playBossAbility('elyndor', 'divine_chorus_beams');
              particleManager.spawnElyndorDivineChorus(bx, by, bossAimAngle, now);
            } else if (txt.includes('CHORUS OF REMEMBRANCE')) {
              sfx.playBossAbility('elyndor', 'resonant_crescendo');
              particleManager.spawnElyndorChorusRemembrance(bx, by, now);
            } else if (txt.includes('ASHEN PROCESSION')) {
              sfx.playBossAbility('zadkiel', 'ashen_procession');
              particleManager.spawnZadkielAshenCloudMotes(bx, by, 60, now);
            } else if (txt.includes('CHAIN OF THE DEPARTED')) {
              sfx.playBossAbility('zadkiel', 'chain_of_the_departed');
              particleManager.spawnZadkielCenserSweepSparks(bx, by, bossAimAngle, 155, 0.25, now);
            } else if (txt.includes('RELIQUARY AWAKENING')) {
              sfx.playBossAbility('zadkiel', 'reliquary_awakening');
              particleManager.spawnZadkielReliquaryAwakening(bx, by, now);
            } else if (txt.includes('JUDGMENT OF THE DEPARTED')) {
              sfx.playBossAbility('zadkiel', 'reliquary_awakening');
              particleManager.spawnZadkielJudgmentCast(bx, by, bossAimAngle, now);
            } else if (txt.includes('SCRIPTURE OF BINDING')) {
              sfx.playBossAbility('sariel', 'scripture_of_binding');
              particleManager.spawnSarielScriptureBinding(bx, by, bossAimAngle, now);
            } else if (txt.includes('FORBIDDEN VERSES')) {
              sfx.playBossAbility('sariel', 'forbidden_verses');
              particleManager.spawnSarielForbiddenPageBurst(bx, by, 55, now);
            } else if (txt.includes('SEAL OF SILENCE')) {
              sfx.playBossAbility('sariel', 'seal_of_silence');
              particleManager.spawnSarielSilenceDetonation(bx, by, 55, now);
            } else if (txt.includes('HERETICAL VOLLEY')) {
              sfx.playBossAbility('sariel', 'heretical_volley');
              particleManager.spawnSarielHereticalVolley(bx, by, now);
            } else if (txt.includes("HEAVEN'S PIERCING LINE")) {
              sfx.playBossAbility('seraphel', 'heavens_piercing_line');
              particleManager.spawnSeraphelPiercingLine(bx, by, bossAimAngle, 380, now);
            } else if (txt.includes('LANCEFALL')) {
              sfx.playBossAbility('seraphel', 'lancefall_sequence');
              particleManager.spawnSeraphelLancefallImpact(bx, by, 50, now);
            } else if (txt.includes('AERIAL JUDGMENT')) {
              sfx.playBossAbility('seraphel', 'aerial_judgment');
              particleManager.spawnSeraphelAerialJudgment(bx, by, bossAimAngle, now);
            } else if (txt.includes('SENTINEL SPEARFALL CASCADE')) {
              sfx.playBossAbility('seraphel', 'lancefall_sequence');
              particleManager.spawnSeraphelSpearfallCascade(bx, by, now);
            } else if (txt.includes("WARDEN'S EDICT")) {
              sfx.playBossAbility('oriphiel', 'wardens_edict');
              particleManager.spawnOriphielWardenEdictCast(bx, by, now);
            } else if (txt.includes('REFLECTED')) {
              sfx.playBossAbility('oriphiel', 'unbroken_judgment');
              particleManager.spawnOriphielParryReflectBurst(bx, by, now);
            } else if (txt.includes('UNBROKEN JUDGMENT')) {
              sfx.playBossAbility('oriphiel', 'unbroken_judgment');
              particleManager.spawnOriphielParryStance(bx, by, now);
            } else if (txt.includes('FINAL VERDICT')) {
              sfx.playBossAbility('oriphiel', 'the_final_verdict_combo');
              particleManager.spawnOriphielVerdictStage(bx, by, 75, 2, now);
            } else if (txt.includes('BASTION GROUND SHATTER')) {
              sfx.playBossAbility('oriphiel', 'the_final_verdict_combo');
              particleManager.spawnOriphielBastionShatter(bx, by, 140, now);
            } else if (txt.includes('GUARDIAN DEFEATED')) {
              sfx.playRelicChime();
              particleManager.spawnRoomClearBlessing(ev.x, ev.y + 24, true, now);
              screenShake = Math.min(8, screenShake + 2.5);
            } else if (txt.includes('ROOM CLEARED')) {
              sfx.playRelicChime();
              particleManager.spawnRoomClearBlessing(ev.x, ev.y + 24, false, now);
            } else if (txt.includes('WARD SHATTERED') || txt.includes('ALL WARDS SHATTERED')) {
              particleManager.spawnBossWardShatter(bx, by, snap.bossWards ?? 0, now);
              screenShake = Math.min(8, screenShake + 2.2);
            } else if (txt.includes('FLOOR CLEARED') || txt.includes('PORTAL UNLOCKED')) {
              sfx.playRelicChime();
              particleManager.spawnRoomClearBlessing(ev.x, ev.y + 34, true, now);
            }
          }
        }
      }
      if (seenEventIds.size > 600) {
        seenEventIds.clear();
      }

      // Check for defeated enemies & newly marked Hunter Quarry targets
      for (const en of snap.enemies) {
        const prev = prevEnemiesMap.get(en.id);
        if (prev && prev.hp > 0 && en.hp <= 0) {
          particleManager.spawnEnemyDeathBurst(en.x, en.y, en.kind, now);
        }
        if (en.markedMs > 0 && !prevMarkedEnemyIds.has(en.id)) {
          particleManager.spawnRangerQuarryMark(en.x, en.y, now);
        }
      }
      for (const [id, prev] of prevEnemiesMap.entries()) {
        if (!snap.enemies.some((e) => e.id === id) && prev.hp > 0) {
          particleManager.spawnEnemyDeathBurst(prev.x, prev.y, prev.kind, now);
        }
      }
      prevEnemiesMap.clear();
      prevMarkedEnemyIds.clear();
      for (const en of snap.enemies) {
        prevEnemiesMap.set(en.id, { hp: en.hp, kind: en.kind, x: en.x, y: en.y });
        if (en.markedMs > 0) {
          prevMarkedEnemyIds.add(en.id);
        }
      }

      // Track class ability activations (dash, tactical, ult, primary weapon swings, shield changes) for all players
      for (const p of snap.players) {
        const prev = prevPlayersMap.get(p.id);
        const prevAtkAnim = prevAttackAnimMap.get(p.id) ?? 0;
        let detectedSwingKind: HeroSwingKind | null = null;
        let detectedSwingDur = 220;

        if (prev) {
          if (p.dashCooldownMs > prev.dashCooldownMs + 300) {
            const dx = p.x - prev.x;
            const dy = p.y - prev.y;
            const dashMoveAngle = Math.hypot(dx, dy) > 4 ? Math.atan2(dy, dx) : p.aimAngle;
            particleManager.spawnClassDashEffect(p.heroClass, prev.x, prev.y, p.x, p.y, dashMoveAngle, now);
            activeDashTrails.set(p.id, {
              until: now + (p.heroClass === 'vanguard' ? 190 : 280),
              lastEmit: now,
              heroClass: p.heroClass,
              angle: dashMoveAngle,
            });
          }
          if (p.skillCooldownMs > prev.skillCooldownMs + 400) {
            detectedSwingKind = 'tactical';
            detectedSwingDur = 280;
            if (p.heroClass === 'vanguard') {
              particleManager.spawnVanguardBulwarkDash(prev.x, prev.y, p.x, p.y, p.aimAngle, now);
            } else if (p.heroClass === 'ranger') {
              particleManager.spawnRangerFrostVolleyCast(p.x, p.y, p.aimAngle, now);
            } else if (p.heroClass === 'arcanist') {
              particleManager.spawnArcanistNovaCast(p.x, p.y, now);
            } else if (p.heroClass === 'cleric') {
              particleManager.spawnClericSanctifiedPulse(p.x, p.y, now);
            }
          }
          if (p.ultCooldownMs > prev.ultCooldownMs + 400) {
            detectedSwingKind = 'ult';
            detectedSwingDur = 320;
            if (p.heroClass === 'ranger') {
              particleManager.spawnRangerQuarryCast(p.x, p.y, now);
            }
          }
          if (p.shield - prev.shield >= 8) {
            particleManager.spawnVanguardShieldGrant(p.x, p.y, now);
          } else if (prev.shield > 0 && p.shield === 0) {
            particleManager.spawnVanguardShieldBreak(p.x, p.y, now);
          }
        }

        if (!detectedSwingKind && ((p.attackAnimMs > 0 && prevAtkAnim === 0) || p.attackAnimMs > prevAtkAnim + 35)) {
          detectedSwingKind = p.attackAnimMs > 245 ? 'ult' : p.attackAnimMs > 195 ? 'tactical' : 'primary';
          detectedSwingDur = p.attackAnimMs > 245 ? 320 : p.attackAnimMs > 195 ? 280 : 220;
        }

        if (detectedSwingKind) {
          const existingSwing = playerWeaponSwings.get(p.id);
          const triggeredLocally =
            p.id === playerId && existingSwing && now - existingSwing.bornAt < 130;
          if (!triggeredLocally) {
            playerWeaponSwings.set(p.id, {
              bornAt: now,
              durationMs: detectedSwingDur,
              kind: detectedSwingKind,
            });
          }
        }

        if (p.id === playerId && localSwingTriggerRef.current) {
          const trig = localSwingTriggerRef.current;
          const curSwing = playerWeaponSwings.get(p.id);
          if (!curSwing || trig.bornAt > curSwing.bornAt) {
            playerWeaponSwings.set(p.id, {
              bornAt: trig.bornAt,
              durationMs: trig.durationMs,
              kind: trig.kind,
            });
          }
          localSwingTriggerRef.current = null;
        }
      }
      prevPlayersMap.clear();
      prevAttackAnimMap.clear();
      for (const p of snap.players) {
        prevPlayersMap.set(p.id, {
          x: p.x,
          y: p.y,
          heroClass: p.heroClass,
          skillCooldownMs: p.skillCooldownMs,
          ultCooldownMs: p.ultCooldownMs,
          dashCooldownMs: p.dashCooldownMs,
          shield: p.shield,
        });
        prevAttackAnimMap.set(p.id, p.attackAnimMs);

        const activeSwing = playerWeaponSwings.get(p.id);
        if (activeSwing && (now - activeSwing.bornAt >= activeSwing.durationMs || p.downed)) {
          playerWeaponSwings.delete(p.id);
        }

        const dashTrail = activeDashTrails.get(p.id);
        if (dashTrail) {
          if (now >= dashTrail.until || p.downed) {
            activeDashTrails.delete(p.id);
          } else if (now - dashTrail.lastEmit >= 42) {
            const livePos = smoothedPlayers.get(p.id) || { x: p.x, y: p.y };
            const liveAngle = Math.hypot(p.vx, p.vy) > 15 ? Math.atan2(p.vy, p.vx) : dashTrail.angle;
            particleManager.spawnClassDashTrailStep(p.heroClass, livePos.x, livePos.y, liveAngle, now);
            dashTrail.lastEmit = now;
          }
        }
      }
      for (const id of activeDashTrails.keys()) {
        if (!prevPlayersMap.has(id)) {
          activeDashTrails.delete(id);
        }
      }
      for (const id of playerWeaponSwings.keys()) {
        if (!prevPlayersMap.has(id)) {
          playerWeaponSwings.delete(id);
        }
      }

      // Track newly spawned class field zones and expiring boss hazard detonations
      const currentZoneIds = new Set<string>();
      for (const z of snap.zones) {
        currentZoneIds.add(z.id);
      }
      if (hasInitWorldEffects) {
        for (const z of snap.zones) {
          if (!prevZonesMap.has(z.id)) {
            if (z.kind === 'aegis_dome') {
              particleManager.spawnVanguardAegisCast(z.x, z.y, z.radius, now);
            } else if (z.kind === 'chrono_well') {
              particleManager.spawnArcanistChronoWellCast(z.x, z.y, z.radius, now);
            } else if (z.kind === 'solar_beacon') {
              particleManager.spawnClericSolarBeaconCast(z.x, z.y, z.radius, now);
            } else if (z.kind === 'star_rift') {
              particleManager.spawnArcanistBoltHit(z.x, z.y, now);
            }
          }
        }
        if (activeBoss) {
          for (const [id, prevZ] of prevZonesMap.entries()) {
            if (!currentZoneIds.has(id) && prevZ.ttlMs <= 220) {
              if (prevZ.kind === 'boss_slam') {
                if (map.biome === 'catacombs' || map.floor === 2) {
                  particleManager.spawnVaelorFrostNovaBurst(prevZ.x, prevZ.y, prevZ.radius, now);
                } else if (map.biome === 'ember' || map.floor === 3) {
                  particleManager.spawnIgnisCoreDetonation(prevZ.x, prevZ.y, prevZ.radius, now);
                } else if (map.biome === 'void' || map.floor === 4) {
                  particleManager.spawnMaliceSingularityImplosion(prevZ.x, prevZ.y, prevZ.radius, now);
                } else if (map.biome === 'astral' || map.floor === 5) {
                  particleManager.spawnArchonSupernovaBurst(prevZ.x, prevZ.y, prevZ.radius, now);
                } else {
                  particleManager.spawnMalakorGroundSlamImpact(prevZ.x, prevZ.y, prevZ.radius, now);
                }
              } else if (prevZ.kind === 'frost_nova') {
                particleManager.spawnVaelorFrostNovaBurst(prevZ.x, prevZ.y, prevZ.radius, now);
              } else if (prevZ.kind === 'magma_pillar') {
                if (prevZ.radius >= 100) {
                  particleManager.spawnIgnisCoreDetonation(prevZ.x, prevZ.y, prevZ.radius, now);
                } else {
                  particleManager.spawnIgnisMagmaEruption(prevZ.x, prevZ.y, prevZ.radius, now);
                }
              } else if (prevZ.kind === 'singularity') {
                particleManager.spawnMaliceSingularityImplosion(prevZ.x, prevZ.y, prevZ.radius, now);
              } else if (prevZ.kind === 'supernova') {
                particleManager.spawnArchonSupernovaBurst(prevZ.x, prevZ.y, prevZ.radius, now);
              } else if (prevZ.kind === 'starlight_beam') {
                particleManager.spawnArchonStarbeamStrike(prevZ.x, prevZ.y, prevZ.radius, now);
              } else if (prevZ.kind === 'lament_mark') {
                if (map.biome === 'reliquary' || map.floor === 7) {
                  particleManager.spawnZadkielRelicDetonation(prevZ.x, prevZ.y, prevZ.radius, now);
                } else {
                  particleManager.spawnElyndorLamentBurst(prevZ.x, prevZ.y, prevZ.radius, now);
                }
              } else if (prevZ.kind === 'scripture_line') {
                particleManager.spawnSarielScriptureDetonation(
                  prevZ.x,
                  prevZ.y,
                  prevZ.width || 420,
                  prevZ.angle || 0,
                  now
                );
              } else if (prevZ.kind === 'silence_seal') {
                particleManager.spawnSarielSilenceDetonation(prevZ.x, prevZ.y, prevZ.radius, now);
              } else if (prevZ.kind === 'lance_thrust') {
                particleManager.spawnSeraphelPiercingLine(
                  prevZ.x,
                  prevZ.y,
                  prevZ.angle || 0,
                  prevZ.width || 380,
                  now
                );
              } else if (prevZ.kind === 'lancefall_mark') {
                if (map.biome === 'scripture' || map.floor === 8) {
                  particleManager.spawnSarielForbiddenPageBurst(prevZ.x, prevZ.y, prevZ.radius, now);
                } else {
                  particleManager.spawnSeraphelLancefallImpact(prevZ.x, prevZ.y, prevZ.radius, now);
                }
              } else if (prevZ.kind === 'warden_edict') {
                particleManager.spawnOriphielEdictExecution(
                  prevZ.x,
                  prevZ.y,
                  prevZ.radius,
                  prevZ.quadrant ?? 0,
                  now
                );
              } else if (prevZ.kind === 'verdict_combo') {
                particleManager.spawnOriphielVerdictStage(prevZ.x, prevZ.y, prevZ.radius, prevZ.stage || 1, now);
              } else if (prevZ.kind === 'warden_shatter') {
                particleManager.spawnOriphielBastionShatter(prevZ.x, prevZ.y, prevZ.radius, now);
              }
            }
          }
        }
      }
      prevZonesMap.clear();
      for (const z of snap.zones) {
        prevZonesMap.set(z.id, z);
      }

      // Detect silent boss Void Step teleport if no status event was matched yet
      if (
        !didVoidStepStatus &&
        hasInitWorldEffects &&
        activeBoss &&
        prevBossState &&
        prevBossState.id === activeBoss.id &&
        (map.biome === 'void' || map.floor === 4) &&
        Math.hypot(activeBoss.x - prevBossState.x, activeBoss.y - prevBossState.y) > 50
      ) {
        particleManager.spawnMaliceVoidStep(prevBossState.x, prevBossState.y, activeBoss.x, activeBoss.y, now);
      }

      // Track newly fired melee cleave arcs, silent boss nova spreads & projectile impacts
      const currentProjIds = new Set<string>();
      let newBossProjCount = 0;
      for (const proj of snap.projectiles) {
        currentProjIds.add(proj.id);
        if (!prevProjectilesMap.has(proj.id)) {
          if (proj.ownerType === 'player' && proj.style === 'slash') {
            particleManager.spawnVanguardCleave(proj.x, proj.y, proj.angle, Boolean(proj.crit), now);
          } else if (proj.ownerType === 'enemy' && activeBoss && proj.ownerId === activeBoss.id) {
            newBossProjCount++;
          }
        }
      }
      if (hasInitWorldEffects && activeBoss && newBossProjCount >= 10) {
        if (map.biome === 'catacombs' || map.floor === 2) {
          particleManager.spawnVaelorDeathRing(activeBoss.x, activeBoss.y, now);
        } else if (map.biome === 'void' || map.floor === 4) {
          particleManager.spawnMaliceAbyssalNova(activeBoss.x, activeBoss.y, now);
        } else if (map.biome === 'astral' || map.floor === 5) {
          particleManager.spawnArchonConstellationSpiral(activeBoss.x, activeBoss.y, now);
        }
      }
      if (hasInitWorldEffects) {
        for (const [id, prevProj] of prevProjectilesMap.entries()) {
          if (!currentProjIds.has(id) && prevProj.ownerType === 'player' && prevProj.ttlMs > 90) {
            if (prevProj.style === 'arrow') {
              if (prevProj.slowOnHit) {
                particleManager.spawnRangerFrostArrowHit(prevProj.x, prevProj.y, prevProj.angle, Boolean(prevProj.crit), now);
              } else {
                particleManager.spawnRangerArrowHit(prevProj.x, prevProj.y, prevProj.angle, Boolean(prevProj.crit), now);
              }
            } else if (prevProj.style === 'arcane') {
              particleManager.spawnArcanistBoltHit(prevProj.x, prevProj.y, now);
            } else if (prevProj.style === 'radiant') {
              particleManager.spawnClericSmiteHit(prevProj.x, prevProj.y, Boolean(prevProj.crit), now);
            }
          }
        }
      }
      prevProjectilesMap.clear();
      for (const proj of snap.projectiles) {
        prevProjectilesMap.set(proj.id, proj);
      }
      prevBossState = activeBoss ? { id: activeBoss.id, x: activeBoss.x, y: activeBoss.y } : null;
      hasInitWorldEffects = true;

      // Client-side prediction with server reconciliation for local player;
      // dt-normalized exponential smoothing for remote players & enemies
      const remoteBlend = computeExpSmoothingFactor(45, dtSec);
      const oneWaySec = Math.max(0.005, ((pingMsPropRef.current?.current ?? 18) * 0.5) / 1000);
      const activeLocalInput: PlayerInputState = localInputPropRef.current?.current ?? {
        up: keysRef.current.up,
        down: keysRef.current.down,
        left: keysRef.current.left,
        right: keysRef.current.right,
        attack: keysRef.current.attack,
        aimAngle: aimAngleRef.current,
      };

      for (const p of snap.players) {
        if (p.id === playerId) {
          const pred = localPredictor.step({
            me: p,
            liveInput: activeLocalInput,
            latestSentSeq: latestInputSeqPropRef.current?.current ?? 0,
            map,
            props: snap.props,
            dtSec,
            nowMs: now,
            isNewSnapshot,
            oneWayLatencySec: oneWaySec,
          });
          smoothedPlayers.set(p.id, { x: pred.x, y: pred.y });
          continue;
        }

        let cur = smoothedPlayers.get(p.id);
        if (!cur || Math.hypot(p.x - cur.x, p.y - cur.y) > 100) {
          smoothedPlayers.set(p.id, { x: p.x, y: p.y });
        } else {
          if (Math.hypot(p.vx, p.vy) > 10) {
            cur.x += p.vx * dtSec;
            cur.y += p.vy * dtSec;
          }
          cur.x += (p.x - cur.x) * remoteBlend;
          cur.y += (p.y - cur.y) * remoteBlend;
        }
      }

      for (const en of snap.enemies) {
        let cur = smoothedEnemies.get(en.id);
        if (!cur || Math.hypot(en.x - cur.x, en.y - cur.y) > 100) {
          smoothedEnemies.set(en.id, { x: en.x, y: en.y });
        } else {
          if (Math.hypot(en.vx, en.vy) > 10) {
            cur.x += en.vx * dtSec;
            cur.y += en.vy * dtSec;
          }
          cur.x += (en.x - cur.x) * remoteBlend;
          cur.y += (en.y - cur.y) * remoteBlend;
        }
      }

      const me = snap.players.find((p) => p.id === playerId) || snap.players[0];
      if (me) {
        // Attack SFX when animation starts or resets
        if (
          (me.attackAnimMs > 0 && lastMyAttackAnim === 0) ||
          me.attackAnimMs > lastMyAttackAnim + 40
        ) {
          sfx.playAttack(me.heroClass);
        }
        lastMyAttackAnim = me.attackAnimMs;

        // Player health & shield damage tracking (taking damage feedback)
        if (lastPlayerHp !== null && me.hp < lastPlayerHp && !me.downed) {
          sfx.playHurt();
        }
        if (lastPlayerShield !== null && lastPlayerShield > 0 && me.shield === 0) {
          sfx.playShieldBreak();
        }
        if (!lastPlayerDowned && me.downed) {
          sfx.playPlayerDowned();
        }
        lastPlayerHp = me.hp;
        lastPlayerShield = me.shield;
        lastPlayerDowned = me.downed;

        const mySmooth = smoothedPlayers.get(me.id) || { x: me.x, y: me.y };
        if (!cameraSnappedRef.current) {
          cameraRef.current.x = mySmooth.x;
          cameraRef.current.y = mySmooth.y;
          cameraSnappedRef.current = true;
        } else {
          stepCameraFollow(cameraRef.current, mySmooth.x, mySmooth.y, dtSec);
        }

        if (mouseScreenRef.current.x !== 0 || mouseScreenRef.current.y !== 0) {
          aimAngleRef.current = computeWorldAimAngle(
            mouseScreenRef.current.x,
            mouseScreenRef.current.y,
            cw,
            ch,
            mySmooth.x,
            mySmooth.y,
            cameraRef.current.x,
            cameraRef.current.y,
            zoom
          );

          if (me.statuses && me.statuses.some(s => s.type === 'disoriented')) {
            aimAngleRef.current += Math.sin(now * 0.018) * 0.18;
          }
        }
      }

      soundManager.setListenerPosition(cameraRef.current.x, cameraRef.current.y);

      let shakeX = 0;
      let shakeY = 0;
      if (screenShake > 0.05) {
        const shakeAngle = Math.random() * Math.PI * 2;
        shakeX = (Math.cos(shakeAngle) * screenShake) / zoom;
        shakeY = (Math.sin(shakeAngle) * screenShake) / zoom;
        screenShake *= Math.pow(0.84, dtSec * 60);
      } else {
        screenShake = 0;
      }

      const snappedCamX = Math.round((cameraRef.current.x + shakeX) * zoom) / zoom;
      const snappedCamY = Math.round((cameraRef.current.y + shakeY) * zoom) / zoom;
      const worldView = getWorldViewBounds(snappedCamX, snappedCamY, cw, ch, zoom);

      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      ctx.scale(zoom, zoom);
      ctx.translate(-snappedCamX, -snappedCamY);

      if (mapLayerRef.current) {
        ctx.drawImage(mapLayerRef.current, 0, 0);
      }

      // Grand Descent Portal
      const portalSealText =
        snap.bossRoomCleared && (snap.guardiansRemaining ?? 0) > 0
          ? `SEALED · GUARDIANS (${snap.guardiansRemaining})`
          : 'SEALED · BOSS AWAKE';
      drawDungeonPortal(ctx, map.portalPos.x, map.portalPos.y, snap.bossDefeated, now, map.biome, snap.floor, portalSealText);
      particleManager.spawnPortalWisps(map.portalPos.x, map.portalPos.y, snap.bossDefeated, now);

      // Torches
      const flicker = 0.88 + Math.sin(now * 0.009) * 0.12;
      for (const t of map.torches) {
        if (
          t.x < worldView.left - 90 ||
          t.x > worldView.right + 90 ||
          t.y < worldView.top - 90 ||
          t.y > worldView.bottom + 90
        ) {
          continue;
        }
        const g = ctx.createRadialGradient(t.x, t.y, 2, t.x, t.y, 68 * flicker);
        g.addColorStop(0, 'rgba(255, 196, 98, 0.25)');
        g.addColorStop(1, 'rgba(255, 140, 50, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 68 * flicker, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#5C4033';
        ctx.fillRect(t.x - 2, t.y - 2, 4, 8);
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(t.x - 3, t.y - 7, 6, 5);
        ctx.fillStyle = '#FEF08A';
        ctx.fillRect(t.x - 1, t.y - 6, 2, 3);
      }

      // Field Zones
      for (const z of snap.zones) {
        if (z.kind === 'aegis_dome') {
          const rot = now * 0.0012;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          // Outer bastion barrier ring
          ctx.strokeStyle = 'rgba(147, 197, 253, 0.78)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Rotating golden-blue hexagonal sanctuary lattice
          ctx.rotate(rot);
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.42)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          const hexR = z.radius * 0.86;
          for (let i = 0; i < 6; i++) {
            const ha = (i * Math.PI) / 3;
            const hxPos = Math.cos(ha) * hexR;
            const hyPos = Math.sin(ha) * hexR;
            if (i === 0) ctx.moveTo(hxPos, hyPos);
            else ctx.lineTo(hxPos, hyPos);
          }
          ctx.closePath();
          ctx.stroke();

          // Inner bastion emblem
          ctx.rotate(-rot * 2);
          ctx.strokeStyle = 'rgba(191, 219, 254, 0.5)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.36, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          particleManager.spawnVanguardAegisMotes(z.x, z.y, z.radius, now);
        } else if (z.kind === 'solar_beacon') {
          const rot = now * 0.0018;
          const pulse = 0.85 + Math.sin(now * 0.007) * 0.15;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = `rgba(253, 224, 71, ${0.78 * pulse})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Inner consecration ring & rotating 4-point solar cross
          ctx.rotate(rot);
          ctx.strokeStyle = 'rgba(254, 249, 195, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.62, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
          for (let r = 0; r < 4; r++) {
            const ra = (r * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ra) * (z.radius * 0.25), Math.sin(ra) * (z.radius * 0.25));
            ctx.lineTo(Math.cos(ra + 0.16) * (z.radius * 0.42), Math.sin(ra + 0.16) * (z.radius * 0.42));
            ctx.lineTo(Math.cos(ra) * (z.radius * 0.92), Math.sin(ra) * (z.radius * 0.92));
            ctx.lineTo(Math.cos(ra - 0.16) * (z.radius * 0.42), Math.sin(ra - 0.16) * (z.radius * 0.42));
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
          particleManager.spawnClericBeaconMotes(z.x, z.y, z.radius, now);
        } else if (z.kind === 'chrono_well') {
          const rot = now * 0.0028;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(125, 211, 252, 0.78)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Counter-rotating cosmic clockwork arcs
          ctx.rotate(rot);
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.72)';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.72, 0, Math.PI * 0.85);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.72, Math.PI, Math.PI * 1.85);
          ctx.stroke();

          ctx.rotate(-rot * 2.1);
          ctx.strokeStyle = 'rgba(224, 242, 254, 0.75)';
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.42, 0, Math.PI * 1.35);
          ctx.stroke();
          ctx.restore();
          particleManager.spawnArcanistChronoMotes(z.x, z.y, z.radius, now);
        } else if (z.kind === 'star_rift') {
          // Arcanist Star Rift Zone: Spinning cosmic nebula portal
          const rotAngle = now * 0.003;
          ctx.save();
          ctx.translate(z.x, z.y);

          ctx.fillStyle = 'rgba(126, 34, 206, 0.22)';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.rotate(rotAngle);
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.75, 0, Math.PI * 1.5);
          ctx.stroke();

          ctx.rotate(-rotAngle * 2.2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.45, 0, Math.PI * 1.5);
          ctx.stroke();

          ctx.restore();
          particleManager.spawnArcanistStarRiftWisps(z.x, z.y, z.radius, now);
        } else if (z.kind === 'boss_slam') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const isCatacombs = map.biome === 'catacombs' || map.floor === 2;
          const isEmber = map.biome === 'ember' || map.floor === 3;
          const isVoid = map.biome === 'void' || map.floor === 4;
          const isAstral = map.biome === 'astral' || map.floor === 5;

          ctx.save();
          if (isCatacombs) {
            // ================================================================
            // FLOOR 2: Archlich Vaelor — Necrotic Glacial Frost Well
            // ================================================================
            ctx.fillStyle = 'rgba(76, 29, 149, 0.28)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Concentric freezing frost rings
            for (let r = 1; r <= 3; r++) {
              const wr = (z.radius * (r / 3) + now * 0.015) % z.radius;
              ctx.strokeStyle = `rgba(34, 211, 238, ${0.6 - (wr / z.radius) * 0.5})`;
              ctx.lineWidth = 1.4;
              ctx.beginPath();
              ctx.arc(z.x, z.y, wr, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Hazard perimeter with glowing rune spikes
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Rotating 8-Pointed Necrotic Crypt Seal
            ctx.save();
            ctx.translate(z.x, z.y);
            ctx.rotate(now * 0.002);
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
            ctx.lineWidth = 1.8;
            for (let i = 0; i < 4; i++) {
              const a = (i * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(-Math.cos(a) * (z.radius * 0.65), -Math.sin(a) * (z.radius * 0.65));
              ctx.lineTo(Math.cos(a) * (z.radius * 0.65), Math.sin(a) * (z.radius * 0.65));
              ctx.stroke();
            }
            // 4 Skull diamonds on rune circle
            for (let s = 0; s < 4; s++) {
              const sa = (s * Math.PI) / 2;
              const sx = Math.cos(sa) * (z.radius * 0.55);
              const sy = Math.sin(sa) * (z.radius * 0.55);
              ctx.fillStyle = '#C084FC';
              ctx.fillRect(sx - 3, sy - 3, 6, 6);
            }
            ctx.restore();

            // Shrinking countdown frost ring (timing gauge)
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
            ctx.stroke();

          } else if (isEmber) {
            // ================================================================
            // FLOOR 3: Ignis, Cinder Sovereign — Magma Caldera Shatter
            // ================================================================
            ctx.fillStyle = 'rgba(234, 88, 12, 0.32)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Swirling molten caldera waves
            for (let r = 1; r <= 3; r++) {
              const wr = (z.radius * (r / 3) + now * 0.02) % z.radius;
              ctx.strokeStyle = `rgba(249, 115, 22, ${0.7 - (wr / z.radius) * 0.6})`;
              ctx.lineWidth = 1.6;
              ctx.beginPath();
              ctx.arc(z.x, z.y, wr, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Outer danger rim with incandescent teeth
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // 8 Jagged Volcanic Fissures radiating from center
            ctx.save();
            ctx.translate(z.x, z.y);
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
            ctx.lineWidth = 2;
            for (let f = 0; f < 8; f++) {
              const fa = (f * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              const midDist = z.radius * 0.5;
              const perp = (f % 2 === 0 ? 1 : -1) * 6;
              ctx.lineTo(Math.cos(fa) * midDist - Math.sin(fa) * perp, Math.sin(fa) * midDist + Math.cos(fa) * perp);
              ctx.lineTo(Math.cos(fa) * z.radius, Math.sin(fa) * z.radius);
              ctx.stroke();
            }
            ctx.restore();

            // Expanding volcanic core detonation fill
            ctx.fillStyle = 'rgba(254, 240, 138, 0.38)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius * progress, 0, Math.PI * 2);
            ctx.fill();

            // Shrinking timing ring
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
            ctx.stroke();

          } else if (isVoid) {
            // ================================================================
            // FLOOR 4: Void-Eater Malice — Singularity Event Horizon Collapse
            // ================================================================
            ctx.fillStyle = 'rgba(59, 7, 100, 0.38)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Outer dark violet rim
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.95)';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Inward swirling gravitational spiral lines
            ctx.save();
            ctx.translate(z.x, z.y);
            ctx.rotate(-now * 0.0035);
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
            ctx.lineWidth = 1.8;
            for (let a = 0; a < 6; a++) {
              const ang = (a * Math.PI) / 3;
              ctx.beginPath();
              ctx.moveTo(Math.cos(ang) * z.radius, Math.sin(ang) * z.radius);
              ctx.quadraticCurveTo(
                Math.cos(ang + 0.6) * (z.radius * 0.5),
                Math.sin(ang + 0.6) * (z.radius * 0.5),
                0,
                0
              );
              ctx.stroke();
            }
            // Event horizon dark center
            ctx.fillStyle = '#0F0718';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius * 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Shrinking event horizon collapse ring
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
            ctx.stroke();

          } else if (isAstral) {
            // ================================================================
            // FLOOR 5: Archon of Nothingness — Astral Starburst Nova
            // ================================================================
            ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Outer starlight boundary
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Rotating 12-pointed celestial zodiac rune ring
            ctx.save();
            ctx.translate(z.x, z.y);
            ctx.rotate(now * 0.0025);
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius * 0.65, 0, Math.PI * 2);
            ctx.stroke();

            for (let p = 0; p < 8; p++) {
              const pa = (p * Math.PI) / 4;
              const px = Math.cos(pa) * (z.radius * 0.65);
              const py = Math.sin(pa) * (z.radius * 0.65);
              ctx.fillStyle = p % 2 === 0 ? '#FEF08A' : '#38BDF8';
              ctx.fillRect(px - 2.5, py - 2.5, 5, 5);
            }
            ctx.restore();

            // Shrinking starlight focus ring
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
            ctx.stroke();

          } else {
            // ================================================================
            // FLOOR 1: Warden Malakor — Highkeep Bastion Ground Shatter
            // ================================================================
            ctx.fillStyle = 'rgba(153, 27, 27, 0.26)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Outer red & gold danger rim
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Concentric shockwave ripples
            for (let r = 1; r <= 3; r++) {
              const wr = (z.radius * (r / 3) + now * 0.015) % z.radius;
              ctx.strokeStyle = `rgba(245, 158, 11, ${0.7 - (wr / z.radius) * 0.6})`;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(z.x, z.y, wr, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Highkeep Lion Crest & Crossed Bastion Claymores in center
            ctx.save();
            ctx.translate(z.x, z.y);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(-10, -12, 20, 24);
            ctx.strokeStyle = '#FEF08A';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-10, -12, 20, 24);
            // Crossed claymores
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-14, -14); ctx.lineTo(14, 14);
            ctx.moveTo(14, -14); ctx.lineTo(-14, 14);
            ctx.stroke();
            ctx.restore();

            // Shrinking timing ring
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        } else if (z.kind === 'frost_nova') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          ctx.save();
          // Frost nova ground fill with subtle frosty radial gradient
          const frostGrad = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.radius);
          frostGrad.addColorStop(0, 'rgba(186, 230, 253, 0.45)');
          frostGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.28)');
          frostGrad.addColorStop(1, 'rgba(14, 165, 233, 0.12)');
          ctx.fillStyle = frostGrad;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();

          // Outer cyan crystalline perimeter rim with frost spikes
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Inner frosty ice crack rim
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius - 4, 0, Math.PI * 2);
          ctx.stroke();

          // 12 Outer perimeter crystalline ice teeth
          for (let sp = 0; sp < 12; sp++) {
            const spAng = (sp * Math.PI) / 6 + now * 0.001;
            const px1 = z.x + Math.cos(spAng) * (z.radius - 3);
            const py1 = z.y + Math.sin(spAng) * (z.radius - 3);
            const px2 = z.x + Math.cos(spAng) * (z.radius + 6);
            const py2 = z.y + Math.sin(spAng) * (z.radius + 6);
            ctx.strokeStyle = '#BAE6FD';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px1, py1);
            ctx.lineTo(px2, py2);
            ctx.stroke();
          }

          // Shrinking radial warning timer ring (shows exact time left before freeze blast!)
          const shrinkR = Math.max(4, z.radius * (1 - progress));
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
          ctx.stroke();

          // Rotating 8-point frost snowflake fractal glyph emblem
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(now * 0.0025);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 2.2;
          for (let f = 0; f < 8; f++) {
            const fa = (f * Math.PI) / 4;
            const fx = Math.cos(fa) * (z.radius * 0.65);
            const fy = Math.sin(fa) * (z.radius * 0.65);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(fx, fy);
            // Snowflake branch ticks
            const bx1 = Math.cos(fa) * (z.radius * 0.38);
            const by1 = Math.sin(fa) * (z.radius * 0.38);
            const perpA = fa + Math.PI / 2;
            ctx.moveTo(bx1 - Math.cos(perpA) * 6, by1 - Math.sin(perpA) * 6);
            ctx.lineTo(bx1 + Math.cos(perpA) * 6, by1 + Math.sin(perpA) * 6);
            ctx.stroke();
          }
          // Center ice diamond
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.restore();

          particleManager.spawnFrostNovaMotes(z.x, z.y, z.radius, now);
        } else if (z.kind === 'magma_pillar') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          ctx.save();
          // Molten earth ground fill with scorched incandescent core
          const magmaGrad = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.radius);
          magmaGrad.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
          magmaGrad.addColorStop(0.35, 'rgba(249, 115, 22, 0.42)');
          magmaGrad.addColorStop(0.8, 'rgba(220, 38, 38, 0.28)');
          magmaGrad.addColorStop(1, 'rgba(68, 10, 10, 0.15)');
          ctx.fillStyle = magmaGrad;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();

          // Outer fiery danger rim
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // 8 Jagged Volcanic Fissures radiating through crust
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
          ctx.lineWidth = 2;
          for (let f = 0; f < 8; f++) {
            const fa = (f * Math.PI) / 4;
            const rMid = z.radius * 0.5;
            const rEnd = z.radius * 0.9;
            const x1 = z.x + Math.cos(fa) * rMid + (f % 2 === 0 ? 3 : -3);
            const y1 = z.y + Math.sin(fa) * rMid + (f % 2 === 0 ? -3 : 3);
            const x2 = z.x + Math.cos(fa) * rEnd;
            const y2 = z.y + Math.sin(fa) * rEnd;
            ctx.beginPath();
            ctx.moveTo(z.x, z.y);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }

          // Expanding incandescent eruption gauge ring
          const currentEruptR = z.radius * progress;
          ctx.fillStyle = 'rgba(254, 240, 138, 0.4)';
          ctx.beginPath();
          ctx.arc(z.x, z.y, currentEruptR, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(z.x, z.y, currentEruptR, 0, Math.PI * 2);
          ctx.stroke();

          // Shrinking perimeter containment countdown ring
          const shrinkR = Math.max(4, z.radius * (1 - progress));
          ctx.strokeStyle = 'rgba(249, 115, 22, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, shrinkR, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
          particleManager.spawnMagmaEmbers(z.x, z.y, z.radius, now);
        } else if (z.kind === 'singularity') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const rotAngle = now * 0.006;
          ctx.save();
          ctx.translate(z.x, z.y);

          // Outer gravitational distortion field with warning border
          const singGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, z.radius);
          singGrad.addColorStop(0, 'rgba(15, 7, 24, 0.9)');
          singGrad.addColorStop(0.3, 'rgba(88, 28, 135, 0.55)');
          singGrad.addColorStop(0.75, 'rgba(147, 51, 234, 0.35)');
          singGrad.addColorStop(1, 'rgba(244, 63, 94, 0.15)');
          ctx.fillStyle = singGrad;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(232, 121, 249, 0.95)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Inward gravitational vortex spiral tendrils (8 curved lines)
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
          ctx.lineWidth = 2;
          for (let a = 0; a < 8; a++) {
            const baseAng = (a * Math.PI) / 4 + now * 0.003;
            ctx.beginPath();
            for (let step = 0; step < 16; step++) {
              const rStep = z.radius * (1 - step / 16);
              const aStep = baseAng + step * 0.12;
              const sx = Math.cos(aStep) * rStep;
              const sy = Math.sin(aStep) * rStep;
              if (step === 0) ctx.moveTo(sx, sy);
              else ctx.lineTo(sx, sy);
            }
            ctx.stroke();
          }

          // Dual counter-rotating accretion disk rings
          ctx.rotate(rotAngle);
          ctx.strokeStyle = 'rgba(232, 121, 249, 0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * (1 - progress * 0.35), 0, Math.PI * 1.6);
          ctx.stroke();

          ctx.rotate(-rotAngle * 2.4);
          ctx.strokeStyle = 'rgba(192, 132, 252, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.62, 0, Math.PI * 1.6);
          ctx.stroke();

          // Black hole event horizon core
          ctx.fillStyle = '#0F0718';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.95)';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.restore();
          particleManager.spawnSingularityInwardWisps(z.x, z.y, z.radius, now);
        } else if (z.kind === 'supernova') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const currentRadius = z.radius * progress;
          ctx.save();
          // Outer cosmic shockwave ring
          ctx.strokeStyle = 'rgba(244, 114, 182, 0.95)';
          ctx.lineWidth = 4.5;
          ctx.beginPath();
          ctx.arc(z.x, z.y, currentRadius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(z.x, z.y, Math.max(2, currentRadius - 8), 0, Math.PI * 2);
          ctx.stroke();

          // Rotating 12-point celestial constellation ticks
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(now * 0.002);
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.8)';
          ctx.lineWidth = 1.8;
          for (let c = 0; c < 12; c++) {
            const ca = (c * Math.PI) / 6;
            ctx.beginPath();
            ctx.moveTo(Math.cos(ca) * (currentRadius * 0.6), Math.sin(ca) * (currentRadius * 0.6));
            ctx.lineTo(Math.cos(ca) * currentRadius, Math.sin(ca) * currentRadius);
            ctx.stroke();
          }
          ctx.restore();

          // Outer boundary threat outline
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          particleManager.spawnSupernovaGlints(z.x, z.y, currentRadius, now);
        } else if (z.kind === 'starlight_beam') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          ctx.save();
          // Target lock-on ground circle with radiant golden starlight fill
          ctx.fillStyle = 'rgba(253, 224, 71, 0.28)';
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Shrinking lock-on countdown ring
          const lockR = Math.max(4, z.radius * (1 - progress));
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(z.x, z.y, lockR, 0, Math.PI * 2);
          ctx.stroke();

          // Rotating crosshair reticle ticks & celestial zodiac diamond
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(now * 0.004);
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)';
          ctx.lineWidth = 2.2;
          for (let c = 0; c < 4; c++) {
            const cAng = (c * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(cAng) * (z.radius - 10), Math.sin(cAng) * (z.radius - 10));
            ctx.lineTo(Math.cos(cAng) * (z.radius + 8), Math.sin(cAng) * (z.radius + 8));
            ctx.stroke();
          }
          // Center radiant 4-point star
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(-3, -3, 6, 6);
          ctx.fillRect(-6, -1, 12, 2);
          ctx.fillRect(-1, -6, 2, 12);
          ctx.restore();

          // Heavenly beam pillar indicator descending from above
          const beamGrad = ctx.createLinearGradient(z.x, z.y - 160, z.x, z.y);
          beamGrad.addColorStop(0, 'rgba(253, 224, 71, 0)');
          beamGrad.addColorStop(0.7, 'rgba(253, 224, 71, 0.35)');
          beamGrad.addColorStop(1, 'rgba(255, 255, 255, 0.65)');
          ctx.fillStyle = beamGrad;
          ctx.fillRect(z.x - z.radius * 0.6, z.y - 160, z.radius * 1.2, 160);
          ctx.restore();
        } else if (z.kind === 'sound_lane') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const w = z.width || 340;
          const h = z.height || 38;
          const ang = z.angle || 0;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(ang);

          // Background acoustic corridor fill
          const bgGrad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
          bgGrad.addColorStop(0, 'rgba(245, 158, 11, 0.05)');
          bgGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.22)');
          bgGrad.addColorStop(1, 'rgba(245, 158, 11, 0.05)');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(-w / 2, -h / 2, w, h);

          // Outer glowing acoustic gold borders
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2, -h / 2, w, h);

          // 5 Parallel Golden Musical Staff Lines
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
          ctx.lineWidth = 1;
          const staffSpacing = h / 6;
          for (let s = 1; s <= 5; s++) {
            const sy = -h / 2 + s * staffSpacing;
            ctx.beginPath();
            ctx.moveTo(-w / 2, sy);
            ctx.lineTo(w / 2, sy);
            ctx.stroke();
          }

          // Vibrating acoustic sine wave traveling down the staff
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          const wavePoints = 40;
          for (let i = 0; i <= wavePoints; i++) {
            const wx = -w / 2 + (i / wavePoints) * w;
            const wy = Math.sin((i / wavePoints) * Math.PI * 6 + now * 0.012) * (h * 0.35);
            if (i === 0) ctx.moveTo(wx, wy);
            else ctx.lineTo(wx, wy);
          }
          ctx.stroke();

          // Progress acoustic resonance pulse bar
          const pulseX = -w / 2 + w * progress;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(pulseX, -h / 2);
          ctx.lineTo(pulseX, h / 2);
          ctx.stroke();

          // Floating pixel-art musical note motes
          ctx.fillStyle = '#FEF08A';
          for (let n = 0; n < 4; n++) {
            const nx = -w / 2 + ((n * 0.25 + now * 0.0003) % 1.0) * w;
            const ny = Math.sin(n * 2 + now * 0.008) * (h * 0.25);
            ctx.fillRect(nx - 2, ny - 2, 4, 4);
            ctx.fillRect(nx + 1, ny - 7, 1.5, 6);
          }

          ctx.restore();
          particleManager.spawnElyndorHarpLaneMotes(z.x, z.y, w, h, ang, now);
        } else if (z.kind === 'lament_mark') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const isReliquary = map.biome === 'reliquary' || map.floor === 7;
          ctx.save();
          ctx.translate(z.x, z.y);

          if (isReliquary) {
            // Zadkiel Ancestral Relic Vault Seal
            const rot = now * 0.002;
            ctx.fillStyle = 'rgba(217, 170, 82, 0.18)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // 8-Pointed Ancestral Star Emblem
            ctx.rotate(rot);
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
            ctx.lineWidth = 1.8;
            for (let i = 0; i < 4; i++) {
              const a = (i * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(-Math.cos(a) * (z.radius * 0.7), -Math.sin(a) * (z.radius * 0.7));
              ctx.lineTo(Math.cos(a) * (z.radius * 0.7), Math.sin(a) * (z.radius * 0.7));
              ctx.stroke();
            }

            // Shrinking bronze lock ring
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(234, 179, 8, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, shrinkR, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Elyndor Acoustic Resonance Ring
            const rot = -now * 0.0025;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Concentric sound vibration waves
            for (let r = 1; r <= 3; r++) {
              const waveR = (z.radius * (r / 3) + now * 0.02) % z.radius;
              ctx.strokeStyle = `rgba(254, 240, 138, ${0.7 - waveR / z.radius * 0.6})`;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.arc(0, 0, waveR, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Rotating 4-note harp string cross
            ctx.rotate(rot);
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-z.radius * 0.5, 0); ctx.lineTo(z.radius * 0.5, 0);
            ctx.moveTo(0, -z.radius * 0.5); ctx.lineTo(0, z.radius * 0.5);
            ctx.stroke();

            // Shrinking countdown sound ring
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, shrinkR, 0, Math.PI * 2);
            ctx.stroke();
          }

          ctx.restore();
        } else if (z.kind === 'ashen_cloud') {
          ctx.save();
          ctx.translate(z.x, z.y);

          // 3 Multi-layered offset swirling smoke clouds
          for (let c = 0; c < 3; c++) {
            const rot = now * (0.001 + c * 0.0006) * (c % 2 === 0 ? 1 : -1);
            const offsetX = Math.cos(rot + c * 2) * (z.radius * 0.2);
            const offsetY = Math.sin(rot + c * 2) * (z.radius * 0.2);

            ctx.save();
            ctx.translate(offsetX, offsetY);
            ctx.rotate(rot);

            ctx.fillStyle = c === 0 ? 'rgba(78, 72, 68, 0.35)' : c === 1 ? 'rgba(120, 113, 108, 0.28)' : 'rgba(217, 170, 82, 0.2)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius * (0.8 + c * 0.1), 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          }

          // Outer ash perimeter boundary
          ctx.strokeStyle = 'rgba(217, 170, 82, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Central Sacred Reliquary Seal
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-12, -12, 24, 24);

          // Rising sacred ash & gold reliquary motes
          particleManager.spawnZadkielAshenCloudMotes(z.x, z.y, z.radius, now);

          ctx.restore();
        } else if (z.kind === 'censer_sweep') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const ang = z.angle || 0;
          ctx.save();
          ctx.translate(z.x, z.y);

          // 270 degree danger arc coverage
          const startAng = ang - (Math.PI * 3) / 4;
          const endAng = ang + (Math.PI * 3) / 4;

          // Danger area fill
          ctx.fillStyle = 'rgba(245, 158, 11, 0.24)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, z.radius, startAng, endAng);
          ctx.closePath();
          ctx.fill();

          // Outer crimson danger rim
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, startAng, endAng);
          ctx.stroke();

          // 90 degree Safe Wedge Indicator (highlighted in sanctuary green/gold behind Zadkiel)
          ctx.fillStyle = 'rgba(52, 211, 153, 0.15)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, z.radius, endAng, startAng + Math.PI * 2);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(52, 211, 153, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, endAng, startAng + Math.PI * 2);
          ctx.stroke();

          // Safe direction arrow indicator
          const safeMidAng = ang + Math.PI;
          const safeX = Math.cos(safeMidAng) * (z.radius * 0.5);
          const safeY = Math.sin(safeMidAng) * (z.radius * 0.5);
          ctx.fillStyle = '#34D399';
          ctx.beginPath();
          ctx.arc(safeX, safeY, 6, 0, Math.PI * 2);
          ctx.fill();

          // Sweeping bronze censer chain line & censer head
          const sweepCur = startAng + (endAng - startAng) * progress;
          const headX = Math.cos(sweepCur) * z.radius;
          const headY = Math.sin(sweepCur) * z.radius;

          // Chain links along line
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(headX, headY);
          ctx.stroke();

          // Flaming Censer Head at tip
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(headX, headY, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FEF08A';
          ctx.beginPath();
          ctx.arc(headX, headY, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
          particleManager.spawnZadkielCenserSweepSparks(z.x, z.y, ang, z.radius, progress, now);
        } else if (z.kind === 'scripture_line') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const w = z.width || 420;
          const h = z.height || 26;
          const ang = z.angle || 0;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(ang);

          // Parchment & Deep Purple Scripture Path
          const scripGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
          scripGrad.addColorStop(0, 'rgba(126, 34, 206, 0.12)');
          scripGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.28)');
          scripGrad.addColorStop(1, 'rgba(126, 34, 206, 0.12)');
          ctx.fillStyle = scripGrad;
          ctx.fillRect(-w / 2, -h / 2, w, h);

          // Illuminated Manuscript Gold & Lavender Borders
          ctx.strokeStyle = 'rgba(232, 121, 249, 0.9)';
          ctx.lineWidth = 2;
          ctx.strokeRect(-w / 2, -h / 2, w, h);

          ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
          ctx.lineWidth = 1;
          ctx.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);

          // Celestial Inscription Glyphs
          ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
          const runeCount = 14;
          const runeStep = w / runeCount;
          for (let r = 0; r < runeCount; r++) {
            const rx = -w / 2 + r * runeStep + 14;
            if (r % 3 === 0) {
              ctx.fillRect(rx - 3, -3, 6, 6);
              ctx.fillRect(rx - 5, -1, 10, 2);
              ctx.fillRect(rx - 1, -5, 2, 10);
            } else if (r % 3 === 1) {
              ctx.fillRect(rx - 4, -2, 8, 4);
              ctx.fillRect(rx - 1, -4, 2, 8);
            } else {
              ctx.fillRect(rx - 2, -4, 4, 8);
              ctx.fillRect(rx - 4, -2, 8, 4);
            }
          }

          // Pulsing energy thread fill gauge
          const chargeW = w * progress;
          ctx.fillStyle = 'rgba(244, 114, 182, 0.35)';
          ctx.fillRect(-w / 2, -h / 2, chargeW, h);

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(-w / 2 + chargeW, -h / 2);
          ctx.lineTo(-w / 2 + chargeW, h / 2);
          ctx.stroke();

          ctx.restore();
        } else if (z.kind === 'silence_seal') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const rot = now * 0.003;
          ctx.save();
          ctx.translate(z.x, z.y);

          // Anti-Magic Purple Suppression Field
          ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(232, 121, 249, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // Rotating Runic Ring with 6 celestial points
          ctx.save();
          ctx.rotate(rot);
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * 0.7, 0, Math.PI * 2);
          ctx.stroke();

          for (let p = 0; p < 6; p++) {
            const pa = (p * Math.PI) / 3;
            const px = Math.cos(pa) * (z.radius * 0.7);
            const py = Math.sin(pa) * (z.radius * 0.7);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(px - 3, py - 3, 6, 6);
          }
          ctx.restore();

          // Pixel-Art Closed Scripture & Crossed Quill Emblem in center
          ctx.fillStyle = '#7E22CE';
          ctx.fillRect(-10, -12, 20, 24);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-8, -10, 16, 20);
          ctx.fillStyle = '#C084FC';
          ctx.fillRect(-6, -8, 12, 16);

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-12, 12); ctx.lineTo(12, -12);
          ctx.stroke();

          // Shrinking lock-on countdown ring
          const shrinkR = Math.max(4, z.radius * (1 - progress));
          ctx.strokeStyle = 'rgba(244, 114, 182, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, shrinkR, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
          particleManager.spawnSarielSilenceSealMotes(z.x, z.y, z.radius, now);
        } else if (z.kind === 'lance_thrust') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const w = z.width || 380;
          const h = z.height || 42;
          const ang = z.angle || 0;
          ctx.save();
          ctx.translate(z.x, z.y);
          ctx.rotate(ang);

          // Solar energy runway fill
          const runGrad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
          runGrad.addColorStop(0, 'rgba(250, 204, 21, 0.08)');
          runGrad.addColorStop(0.5, 'rgba(253, 224, 71, 0.28)');
          runGrad.addColorStop(1, 'rgba(250, 204, 21, 0.08)');
          ctx.fillStyle = runGrad;
          ctx.fillRect(0, -h / 2, w, h);

          // Dual Golden Energy Rails
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(0, -h / 2, w, h);

          // Chevron directional thrust indicators >>>
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
          ctx.lineWidth = 2;
          const chevCount = 8;
          for (let c = 1; c <= chevCount; c++) {
            const cx = (c / (chevCount + 1)) * w;
            ctx.beginPath();
            ctx.moveTo(cx - 8, -h * 0.3);
            ctx.lineTo(cx + 4, 0);
            ctx.lineTo(cx - 8, h * 0.3);
            ctx.stroke();
          }

          // Spearhead emblem at the tip of the runway
          ctx.fillStyle = '#FEF08A';
          ctx.beginPath();
          ctx.moveTo(w + 12, 0);
          ctx.lineTo(w - 6, -h * 0.45);
          ctx.lineTo(w - 6, h * 0.45);
          ctx.closePath();
          ctx.fill();

          // High-speed charge beam fill gauge
          const chargeX = w * progress;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(0, -h / 2, chargeX, h);

          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(chargeX, -h / 2);
          ctx.lineTo(chargeX, h / 2);
          ctx.stroke();

          ctx.restore();
        } else if (z.kind === 'lancefall_mark') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const isScripture = map.biome === 'scripture' || map.floor === 8;
          const seq = z.seqNumber || 1;
          ctx.save();
          ctx.translate(z.x, z.y);

          if (isScripture) {
            // Sariel's Forbidden Verses: Floating illuminated manuscript page
            ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(232, 121, 249, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Floating Illuminated Manuscript Page Seal in center
            ctx.fillStyle = '#FAF8F5';
            ctx.fillRect(-12, -16, 24, 32);
            ctx.strokeStyle = '#F59E0B';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-12, -16, 24, 32);

            // Ornate Roman Numeral (I, II, III, IV) rendered in golden ink
            ctx.fillStyle = '#D97706';
            ctx.font = 'bold 15px serif';
            ctx.textAlign = 'center';
            const roman = seq === 1 ? 'I' : seq === 2 ? 'II' : seq === 3 ? 'III' : 'IV';
            ctx.fillText(roman, 0, 5);

            // Shrinking countdown circle
            const shrinkR = Math.max(4, z.radius * (1 - progress));
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, shrinkR, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Seraphel's Lancefall Target & Descending Lance Tip
            ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Crosshair reticle ticks
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-z.radius - 4, 0); ctx.lineTo(-z.radius + 8, 0);
            ctx.moveTo(z.radius - 8, 0); ctx.lineTo(z.radius + 4, 0);
            ctx.moveTo(0, -z.radius - 4); ctx.lineTo(0, -z.radius + 8);
            ctx.moveTo(0, z.radius - 8); ctx.lineTo(0, z.radius + 4);
            ctx.stroke();

            // Sequence Badge Crest with number
            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.arc(0, 0, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#FEF08A';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${seq}`, 0, 4.5);

            // Descending Lance Tip animation
            const lanceHeight = (1 - progress) * 80;
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.moveTo(0, -lanceHeight);
            ctx.lineTo(-5, -lanceHeight - 24);
            ctx.lineTo(5, -lanceHeight - 24);
            ctx.closePath();
            ctx.fill();
          }

          ctx.restore();
        } else if (z.kind === 'warden_edict') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const q = z.quadrant ?? 0;
          ctx.save();
          ctx.translate(z.x, z.y);

          const startAng = (q * Math.PI) / 2;
          const endAng = startAng + Math.PI / 2;

          // Execution Quadrant Hazard Fill
          ctx.fillStyle = 'rgba(239, 68, 68, 0.32)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, z.radius, startAng, endAng);
          ctx.closePath();
          ctx.fill();

          // Imposing Crimson & Gold Boundary Lines
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Stamped Pixel-Art Warden Execution Crest (Crossed Greatswords & Shield Emblem)
          const midAng = startAng + Math.PI / 4;
          const qx = Math.cos(midAng) * (z.radius * 0.55);
          const qy = Math.sin(midAng) * (z.radius * 0.55);

          ctx.save();
          ctx.translate(qx, qy);
          // Horned Warden Shield
          ctx.fillStyle = '#991B1B';
          ctx.fillRect(-10, -12, 20, 24);
          ctx.fillStyle = '#F59E0B';
          ctx.strokeRect(-10, -12, 20, 24);
          // Crossed Swords
          ctx.strokeStyle = '#FEF08A';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-14, -14); ctx.lineTo(14, 14);
          ctx.moveTo(14, -14); ctx.lineTo(-14, 14);
          ctx.stroke();
          ctx.restore();

          // Expanding Execution Wave
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * progress, startAng, endAng);
          ctx.stroke();

          ctx.restore();
        } else if (z.kind === 'warden_parry') {
          const rot = now * 0.004;
          ctx.save();
          ctx.translate(z.x, z.y);

          // Golden Deflection Barrier Fill
          ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.fill();

          // Outer Aegis Parry Shield Rim
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.95)';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
          ctx.stroke();

          // 4 Rotating Tower Shield Plates around perimeter
          ctx.rotate(rot);
          for (let s = 0; s < 4; s++) {
            const sa = (s * Math.PI) / 2;
            const sx = Math.cos(sa) * z.radius;
            const sy = Math.sin(sa) * z.radius;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(sa + Math.PI / 2);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(-6, -10, 12, 20);
            ctx.fillStyle = '#FEF08A';
            ctx.strokeRect(-6, -10, 12, 20);
            ctx.restore();
          }

          // Central Golden Lion/Sun Warden Crest
          ctx.fillStyle = '#FEF08A';
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#B45309';
          ctx.fillRect(-4, -4, 8, 8);

          ctx.restore();
          particleManager.spawnOriphielParryStance(z.x, z.y, now);
        } else if (z.kind === 'verdict_combo') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const stage = z.stage || 1;
          ctx.save();
          ctx.translate(z.x, z.y);

          if (stage === 3) {
            // Ultimate Stage 3 Leap Slam: Incandescent Crimson Crater
            ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // 8 Jagged Fractured Ground Lines extending outward
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
            ctx.lineWidth = 2;
            for (let f = 0; f < 8; f++) {
              const fa = (f * Math.PI) / 4;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(fa) * z.radius, Math.sin(fa) * z.radius);
              ctx.stroke();
            }
          } else {
            // Stage 1 & 2 Razor Slash Telegraphs
            ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius, 0, Math.PI * 2);
            ctx.stroke();

            // Inner blade arc indicator
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, z.radius * 0.65, -0.8, 0.8);
            ctx.stroke();
          }

          // Expanding impact shockwave
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * progress, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        } else if (z.kind === 'warden_shatter') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          ctx.save();
          ctx.translate(z.x, z.y);

          // Seismic Ground Shatter Ring
          ctx.fillStyle = `rgba(245, 158, 11, ${0.15 + progress * 0.25})`;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * progress, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#FEF08A';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, z.radius * progress, 0, Math.PI * 2);
          ctx.stroke();

          // 8 Radiating Warden Ground Rupture Fractures
          for (let f = 0; f < 8; f++) {
            const fa = (f * Math.PI * 2) / 8 + now * 0.001;
            ctx.strokeStyle = f % 2 === 0 ? '#EF4444' : '#F59E0B';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(fa) * z.radius * progress, Math.sin(fa) * z.radius * progress);
            ctx.stroke();
          }

          // Central Warden Crest Stamp
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FEF08A';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.restore();
        }
      }

      // Custom Pixel Art Tavern Architecture, Fireplace, Tables, Bar & Casks
      if (map.floor === 0) {
        drawTavernDecorations(ctx, now);
      }

      // Props, Relic Vault, Mystic Shrine & Pickups
      for (const prop of snap.props) {
        if (prop.opened && (prop.kind === 'crate' || prop.kind === 'coin' || prop.kind === 'potion')) {
          continue;
        }
        if (prop.kind === 'relic_chest') {
          drawRelicVault(ctx, prop, now);
          particleManager.spawnVaultGleam(prop.x, prop.y, !prop.opened, now);
        } else if (prop.kind === 'shrine') {
          drawMysticShrine(ctx, prop, now);
          particleManager.spawnShrineMotes(prop.x, prop.y, !prop.opened, now);
        } else {
          drawDungeonProp(ctx, prop, now);
        }
      }

      // NPCs & Training Dummies (Tavern Social Hub)
      if (snap.npcs) {
        for (const npc of snap.npcs) {
          drawNpc(ctx, npc, now);
        }
      }
      // Auto-hit Target Acquisition for local player
      const myPlayer = snap.players.find((p) => p.id === playerId);
      let lockedEnemyId: string | null = null;
      if (myPlayer && !myPlayer.downed) {
        let bestDist = Infinity;
        const maxDist = myPlayer.heroClass === 'vanguard' ? 140 : 460;
        for (const en of snap.enemies) {
          if (en.hp <= 0) continue;
          const d = Math.hypot(en.x - myPlayer.x, en.y - myPlayer.y);
          if (d < bestDist && d <= maxDist) {
            bestDist = d;
            lockedEnemyId = en.id;
          }
        }
        if (!lockedEnemyId && snap.trainingDummies) {
          for (const dummy of snap.trainingDummies) {
            const d = Math.hypot(dummy.x - myPlayer.x, dummy.y - myPlayer.y);
            if (d < bestDist && d <= maxDist) {
              bestDist = d;
              lockedEnemyId = dummy.id;
            }
          }
        }
      }

      if (snap.trainingDummies) {
        for (const dummy of snap.trainingDummies) {
          drawTrainingDummy(ctx, dummy, now, dummy.id === lockedEnemyId);
        }
      }

      // Enemies
      for (const en of snap.enemies) {
        const pos = smoothedEnemies.get(en.id) || { x: en.x, y: en.y };
        const ex = Math.round(pos.x);
        const ey = Math.round(pos.y);
        const walkBob = en.state === 'chase' ? Math.sin(now * 0.014 + ex * 0.1) * 2 : Math.sin(now * 0.003 + ex * 0.1) * 1.5;

        if (en.kind === 'slime') {
          drawSlimeSprite(ctx, en, ex, ey, now, map.biome);
        } else if (en.kind === 'goblin') {
          drawGoblinSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'skeleton') {
          drawSkeletonSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'cultist') {
          drawCultistSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'knight') {
          drawKnightSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'shadow_stalker') {
          drawShadowStalkerSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'astral_sentinel') {
          drawAstralSentinelSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'hymn_phantom') {
          drawHymnPhantomSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'relic_golem') {
          drawRelicGolemSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'veiled_heretic') {
          drawVeiledHereticSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'celestial_arbiter') {
          drawCelestialArbiterSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'warden_enforcer') {
          drawWardenEnforcerSprite(ctx, en, ex, ey, now);
        } else if (en.kind === 'boss') {
          // Boss ground shadow
          ctx.fillStyle = 'rgba(0,0,0,0.48)';
          ctx.fillRect(ex - en.radius + 2, ey + en.radius - 3, (en.radius - 2) * 2, 6);

          const isCatacombs = map.biome === 'catacombs' || map.floor === 2;
          const isEmber = map.biome === 'ember' || map.floor === 3;
          const isVoid = map.biome === 'void' || map.floor === 4;
          const isAstral = map.biome === 'astral' || map.floor === 5;
          const isHymns = map.biome === 'hymns' || map.floor === 6;
          const isReliquary = map.biome === 'reliquary' || map.floor === 7;
          const isScripture = map.biome === 'scripture' || map.floor === 8;
          const isNave = map.biome === 'nave' || map.floor === 9;
          const isWardenGate = map.biome === 'wardengate' || map.floor === 10;

          // ==============================================================
          // BOSS CHARGE RUNWAY TRAJECTORY TELEGRAPH
          // ==============================================================
          if (en.charging) {
            ctx.save();
            const cAngle = en.chargeAngle ?? 0;
            const runwayLen = 180;
            const runwayW = en.radius * 2 + 12;

            ctx.translate(ex, ey);
            ctx.rotate(cAngle);

            // Glowing hazard runway strip fill
            ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
            ctx.fillRect(0, -runwayW / 2, runwayLen, runwayW);

            // Striped hazard borders
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -runwayW / 2);
            ctx.lineTo(runwayLen, -runwayW / 2);
            ctx.moveTo(0, runwayW / 2);
            ctx.lineTo(runwayLen, runwayW / 2);
            ctx.stroke();

            // Animated directional chevron arrows >>>
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
            ctx.lineWidth = 2.5;
            for (let c = 30; c < runwayLen; c += 40) {
              const animOffset = (now * 0.12) % 40;
              const cx = (c + animOffset) % runwayLen;
              ctx.beginPath();
              ctx.moveTo(cx - 10, -10);
              ctx.lineTo(cx, 0);
              ctx.lineTo(cx - 10, 10);
              ctx.stroke();
            }

            // Impact danger circle at end of runway
            ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
            ctx.beginPath();
            ctx.arc(runwayLen, 0, runwayW / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.95)';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.restore();
          }

          // ==============================================================
          // BOSS WINDUP / CASTING GROUND AURA & TIMER RING
          // ==============================================================
          if (en.windupMs > 0) {
            ctx.save();
            const windupRatio = Math.max(0, Math.min(1, en.windupMs / 1200));
            const auraR = en.radius + 18;

            const elemColor = isCatacombs
              ? '#38BDF8'
              : isEmber
                ? '#F97316'
                : isVoid
                  ? '#E879F9'
                  : isAstral
                    ? '#38BDF8'
                    : isHymns
                      ? '#FBBF24'
                      : isReliquary
                        ? '#D9AA52'
                        : isScripture
                          ? '#E879F9'
                          : isNave
                            ? '#FDE047'
                            : isWardenGate
                              ? '#EF4444'
                              : '#F59E0B';

            // Pulsing elemental ground circle
            ctx.fillStyle = isCatacombs
              ? 'rgba(56, 189, 248, 0.22)'
              : isEmber
                ? 'rgba(249, 115, 22, 0.25)'
                : isVoid
                  ? 'rgba(232, 121, 249, 0.25)'
                  : isAstral
                    ? 'rgba(56, 189, 248, 0.22)'
                    : isHymns
                      ? 'rgba(251, 191, 36, 0.22)'
                      : isReliquary
                        ? 'rgba(217, 170, 82, 0.22)'
                        : isScripture
                          ? 'rgba(232, 121, 249, 0.24)'
                          : isNave
                            ? 'rgba(253, 224, 71, 0.24)'
                            : isWardenGate
                              ? 'rgba(239, 68, 68, 0.24)'
                              : 'rgba(245, 158, 11, 0.22)';
            ctx.beginPath();
            ctx.arc(ex, ey + 10, auraR, 0, Math.PI * 2);
            ctx.fill();

            // Outer danger rim stroke
            ctx.strokeStyle = elemColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(ex, ey + 10, auraR, 0, Math.PI * 2);
            ctx.stroke();

            // Shrinking windup countdown arc ring
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(
              ex,
              ey + 10,
              auraR + 4,
              -Math.PI / 2,
              -Math.PI / 2 + Math.PI * 2 * (1 - windupRatio)
            );
            ctx.stroke();

            ctx.restore();
          }

          // Shield Wall Barrier Stance
          if (en.shieldWallMs && en.shieldWallMs > 0) {
            ctx.strokeStyle = 'rgba(96, 165, 250, 0.95)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.arc(ex, ey, en.radius + 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(147, 197, 253, 0.26)';
            ctx.fill();

            // Fortified shield emblem arc
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ex, ey, en.radius + 6, 0, Math.PI * 2);
            ctx.stroke();

            particleManager.spawnBossShieldSparks(ex, ey, now);
          }

          if (isCatacombs) {
            // ==============================================================
            // FLOOR 2 BOSS: Archlich Vaelor (The Sunken Crypt Archlich)
            // Floating Skeletal Necromancer Lord with floating silk shrouds,
            // 8-gem ivory crown, Dread Soul Lantern emitting cyan spirit wisps,
            // floating bone vertebrae, and orbiting frost soul wisps
            // ==============================================================
            const lichFloat = Math.sin(now * 0.004) * 7;
            const by = ey - 6 + lichFloat;

            // 1. Ethereal Dual Cyan & Necrotic Violet Ground Sanctuary Aura
            const auraPulse = 32 + Math.sin(now * 0.006) * 6;
            const auraGrad = ctx.createRadialGradient(ex, ey + 18, 4, ex, ey + 18, auraPulse);
            auraGrad.addColorStop(0, 'rgba(34, 211, 238, 0.45)');
            auraGrad.addColorStop(0.45, 'rgba(126, 34, 206, 0.3)');
            auraGrad.addColorStop(0.85, 'rgba(59, 130, 246, 0.15)');
            auraGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.fillStyle = auraGrad;
            ctx.beginPath();
            ctx.arc(ex, ey + 18, auraPulse, 0, Math.PI * 2);
            ctx.fill();

            // Concentric Crypt Rune Ground Circle
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(ex, ey + 18, 26, 0, Math.PI * 2);
            ctx.stroke();

            // 2. Floating Tattered Dark Obsidian Shroud & Trailing Frost Silk
            ctx.fillStyle = '#0F091F';
            ctx.fillRect(ex - 24, by - 14, 48, 46);
            // Tattered frayed trailing edge
            for (let t = 0; t < 7; t++) {
              const toothH = 8 + ((t * 7) % 9) + Math.sin(now * 0.008 + t) * 3;
              ctx.fillRect(ex - 24 + t * 7, by + 32, 6, toothH);
            }

            // Inner Royal Necrotic Purple Robe with silver lining
            ctx.fillStyle = '#3B0764';
            ctx.fillRect(ex - 18, by - 10, 36, 42);
            ctx.fillStyle = '#581C87';
            ctx.fillRect(ex - 14, by - 8, 28, 38);

            // Frost Runic Spine Embroidery (Cyan Glint)
            ctx.fillStyle = '#22D3EE';
            ctx.fillRect(ex - 2, by - 6, 4, 32);
            ctx.fillRect(ex - 10, by, 20, 2);
            ctx.fillRect(ex - 8, by + 10, 16, 2);
            ctx.fillRect(ex - 6, by + 20, 12, 2);
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(ex - 1, by + 2, 2, 2);
            ctx.fillRect(ex - 1, by + 12, 2, 2);

            // Skeletal Shoulder Pauldron Plates (Horned Bone Clavicle)
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(ex - 22, by - 18, 44, 7);
            ctx.fillStyle = '#94A3B8';
            ctx.fillRect(ex - 24, by - 16, 8, 10);
            ctx.fillRect(ex + 16, by - 16, 8, 10);
            // Bone Spikes on shoulders
            ctx.fillStyle = '#F8FAFC';
            ctx.fillRect(ex - 22, by - 24, 4, 7);
            ctx.fillRect(ex + 18, by - 24, 4, 7);

            // Floating Skeletal Skull Face
            ctx.fillStyle = '#F1F5F9';
            ctx.fillRect(ex - 11, by - 34, 22, 17);
            // Cheekbone hollows & nasal cavity
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 11, by - 21, 4, 4);
            ctx.fillRect(ex + 7, by - 21, 4, 4);
            ctx.fillRect(ex - 1, by - 23, 2, 4);
            // Sunken orbital sockets
            ctx.fillStyle = '#090514';
            ctx.fillRect(ex - 8, by - 30, 6, 6);
            ctx.fillRect(ex + 2, by - 30, 6, 6);

            // Piercing Frost Cyan Soul Eyes with white core flare
            ctx.fillStyle = '#22D3EE';
            ctx.fillRect(ex - 7, by - 29, 4, 4);
            ctx.fillRect(ex + 3, by - 29, 4, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 6, by - 28, 2, 2);
            ctx.fillRect(ex + 4, by - 28, 2, 2);

            // Ancient Horned Bone Crown with 3 Ivory Spires & Soul Gem
            ctx.fillStyle = '#B45309';
            ctx.fillRect(ex - 13, by - 38, 26, 5);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 11, by - 39, 22, 2);
            // Triple Horned Ivory Spires
            ctx.fillStyle = '#F8FAFC';
            ctx.fillRect(ex - 13, by - 48, 4, 11);
            ctx.fillRect(ex - 2, by - 53, 4, 16);
            ctx.fillRect(ex + 9, by - 48, 4, 11);
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(ex - 11, by - 45, 2, 7);
            ctx.fillRect(ex, by - 50, 2, 12);
            ctx.fillRect(ex + 11, by - 45, 2, 7);
            // Crown Soul Diamond
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(ex - 2, by - 37, 4, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 1, by - 36, 2, 2);

            // Left Hand: Dread Soul Staff & Suspended Soul Lantern
            const staffX = ex - 28;
            ctx.fillStyle = '#292524';
            ctx.fillRect(staffX, by - 46, 5, 66);
            // Lantern Cage
            ctx.fillStyle = '#D97706';
            ctx.fillRect(staffX - 4, by - 50, 13, 4);
            ctx.fillRect(staffX - 3, by - 46, 11, 10);
            // Pulsating Soul Flame inside Lantern
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(staffX - 2, by - 44, 9, 7);
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(staffX, by - 42, 5, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(staffX + 1, by - 41, 3, 2);

            // Right Hand: Skeletal Claw holding Orbiting Necrotic Orb
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(ex + 18, by - 6, 7, 5);
            const orbBob = Math.sin(now * 0.009) * 3.5;
            ctx.fillStyle = '#6D28D9';
            ctx.fillRect(ex + 22, by - 20 + orbBob, 10, 10);
            ctx.fillStyle = '#A855F7';
            ctx.fillRect(ex + 24, by - 18 + orbBob, 6, 6);
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(ex + 25, by - 17 + orbBob, 4, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex + 26, by - 16 + orbBob, 2, 2);

            // 4 Orbiting Frost Soul Wisps (Concentric Orbiting Phantoms)
            for (let i = 0; i < 4; i++) {
              const ang = now * 0.0035 + (i * Math.PI * 2) / 4;
              const wx = ex + Math.cos(ang) * 36;
              const wy = by + Math.sin(ang) * 18;
              ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
              ctx.fillRect(wx - 3.5, wy - 3.5, 7, 7);
              ctx.fillStyle = '#E0F2FE';
              ctx.fillRect(wx - 2, wy - 2, 4, 4);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(wx - 1, wy - 1, 2, 2);
            }
          } else if (isEmber) {
            // ==============================================================
            // FLOOR 3 BOSS: Ignis, Cinder Sovereign (The Molten Magma Sovereign)
            // Hulking Volcanic Behemoth of cooled obsidian rock, pulsating
            // lava veins, sweeping demonic horns, blazing flame hair, and greataxe
            // ==============================================================
            const lavaThrob = 0.85 + Math.sin(now * 0.008) * 0.18;
            const breathBob = Math.sin(now * 0.005) * 2;

            // 1. Scorched Ground Caldera & Molten Lava Reservoir
            ctx.fillStyle = 'rgba(234, 88, 12, 0.4)';
            ctx.beginPath();
            ctx.arc(ex, ey + 18, 42 * lavaThrob, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(ex, ey + 18, 32, 0, Math.PI * 2);
            ctx.stroke();

            // 2. Colossal Charred Basalt Demon Torso & Obsidian Pauldrons
            ctx.fillStyle = '#18181B';
            ctx.fillRect(ex - 28, ey - 30 + walkBob + breathBob, 56, 52);
            ctx.fillStyle = '#27272A';
            ctx.fillRect(ex - 24, ey - 26 + walkBob + breathBob, 48, 44);

            // 3. Glowing Molten Lava Core Fissures & White-Hot Furnace
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(ex - 19, ey - 22 + walkBob + breathBob, 38, 36);
            ctx.fillStyle = '#EA580C';
            ctx.fillRect(ex - 13, ey - 16 + walkBob + breathBob, 26, 24);
            // Incandescent White-Hot Furnace Chest
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 7, ey - 10 + walkBob + breathBob, 14, 12);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 4, ey - 7 + walkBob + breathBob, 8, 6);

            // Branching glowing lava fissures across armor plates
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 26, ey - 8 + walkBob, 10, 3);
            ctx.fillRect(ex + 16, ey - 8 + walkBob, 10, 3);
            ctx.fillRect(ex - 18, ey + 8 + walkBob, 36, 4);
            ctx.fillRect(ex - 2, ey + 12 + walkBob, 4, 10);
            ctx.fillRect(ex - 14, ey - 24 + walkBob, 28, 3);

            // Heavy Obsidian Spiked Pauldrons
            ctx.fillStyle = '#27272A';
            ctx.fillRect(ex - 34, ey - 32 + walkBob, 14, 18);
            ctx.fillRect(ex + 20, ey - 32 + walkBob, 14, 18);
            // Pauldron magma fissures
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 32, ey - 28 + walkBob, 10, 3);
            ctx.fillRect(ex + 22, ey - 28 + walkBob, 10, 3);

            // 4. Demon Head & Obsidian Horns
            ctx.fillStyle = '#18181B';
            ctx.fillRect(ex - 15, ey - 48 + walkBob, 30, 20);
            // Sweeping Demonic Basalt Horns with glowing magma tips
            ctx.fillStyle = '#27272A';
            ctx.fillRect(ex - 27, ey - 60 + walkBob, 10, 20);
            ctx.fillRect(ex + 17, ey - 60 + walkBob, 10, 20);
            ctx.fillRect(ex - 33, ey - 72 + walkBob, 10, 14);
            ctx.fillRect(ex + 23, ey - 72 + walkBob, 10, 14);
            // Horn magma glowing tips
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 33, ey - 76 + walkBob, 7, 7);
            ctx.fillRect(ex + 26, ey - 76 + walkBob, 7, 7);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 31, ey - 74 + walkBob, 3, 3);
            ctx.fillRect(ex + 28, ey - 74 + walkBob, 3, 3);

            // Flickering Flame Hair Crown
            for (let f = 0; f < 5; f++) {
              const flameH = 12 + Math.sin(now * 0.02 + f * 1.5) * 5;
              ctx.fillStyle = f % 2 === 0 ? '#F97316' : '#FEF08A';
              ctx.fillRect(ex - 12 + f * 5, ey - 48 - flameH + walkBob, 4, flameH);
            }

            // Blazing Lava Eyes
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 9, ey - 40 + walkBob, 6, 4);
            ctx.fillRect(ex + 3, ey - 40 + walkBob, 6, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 7, ey - 39 + walkBob, 2, 2);
            ctx.fillRect(ex + 5, ey - 39 + walkBob, 2, 2);

            // 5. Colossal Magma Greataxe (Right Hand)
            const axeSway = Math.sin(now * 0.006) * 0.1;
            ctx.save();
            ctx.translate(ex + 30, ey - 18 + walkBob);
            ctx.rotate(axeSway);
            // Ashwood Haft
            ctx.fillStyle = '#44403C';
            ctx.fillRect(-3, -48, 6, 72);
            // Double-Bitted Obsidian Axe Blades with Molten Edge
            ctx.fillStyle = '#18181B';
            ctx.fillRect(-22, -46, 19, 28);
            ctx.fillRect(3, -46, 19, 28);
            // Molten cutting edges
            ctx.fillStyle = '#F97316';
            ctx.fillRect(-24, -48, 4, 32);
            ctx.fillRect(20, -48, 4, 32);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(-23, -44, 2, 24);
            ctx.fillRect(21, -44, 2, 24);
            ctx.restore();

            // Rising Embers
            for (let i = 0; i < 6; i++) {
              const sparkT = (now * 0.0016 + i * 0.2) % 1;
              const sx = ex - 26 + ((i * 19 + 7) % 52) + Math.sin(now * 0.01 + i) * 6;
              const sy = ey + 10 - sparkT * 70;
              const sz = sparkT > 0.7 ? 1.5 : 2.5;
              ctx.fillStyle = sparkT > 0.5 ? '#F97316' : '#FEF08A';
              ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
            }
          } else if (isVoid) {
            // ==============================================================
            // FLOOR 4 BOSS: Void-Eater Malice (The Abyssal Singularity Dragon)
            // Colossal Void Dragon with undulating dark matter tendrils,
            // pulsating magenta event horizon core, obsidian spires, and crimson eye glare
            // ==============================================================
            const voidPulse = Math.sin(now * 0.005) * 7;
            const vy = ey - 6 + voidPulse;

            // 1. Swirling Dark Void Singularity Ground Accretion Disk
            const diskRot = now * 0.002;
            const voidGrad = ctx.createRadialGradient(ex, ey + 16, 6, ex, ey + 16, 48);
            voidGrad.addColorStop(0, 'rgba(147, 51, 234, 0.65)');
            voidGrad.addColorStop(0.4, 'rgba(88, 28, 135, 0.45)');
            voidGrad.addColorStop(0.8, 'rgba(244, 63, 94, 0.2)');
            voidGrad.addColorStop(1, 'rgba(15, 7, 24, 0)');
            ctx.fillStyle = voidGrad;
            ctx.beginPath();
            ctx.arc(ex, ey + 16, 48, 0, Math.PI * 2);
            ctx.fill();

            // Concentric Accretion Horizon Lines
            ctx.strokeStyle = 'rgba(232, 121, 249, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(ex, ey + 16, 34, 0, Math.PI * 2);
            ctx.stroke();

            // 2. Rotating Accretion Dust Particles
            for (let d = 0; d < 8; d++) {
              const dAngle = diskRot + (d * Math.PI) / 4;
              const dDist = 28 + Math.sin(now * 0.004 + d) * 14;
              const dx = ex + Math.cos(dAngle) * dDist;
              const dy = ey + 16 + Math.sin(dAngle) * (dDist * 0.45);
              ctx.fillStyle = d % 2 === 0 ? '#F43F5E' : '#C084FC';
              ctx.fillRect(dx - 2, dy - 2, 4, 4);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(dx - 1, dy - 1, 2, 2);
            }

            // 3. Undulating Void Tendrils (6 articulated shadowy appendages)
            for (let i = 0; i < 6; i++) {
              const tAng = now * 0.0035 + (i * Math.PI * 2) / 6;
              const tDist = 34 + Math.sin(now * 0.006 + i) * 8;
              const tx = ex + Math.cos(tAng) * tDist;
              const ty = vy + Math.sin(tAng * 1.6) * 20;
              ctx.fillStyle = '#3B0764';
              ctx.fillRect(tx - 6, ty - 6, 12, 12);
              ctx.fillStyle = '#7C3AED';
              ctx.fillRect(tx - 4, ty - 4, 8, 8);
              ctx.fillStyle = '#F43F5E';
              ctx.fillRect(tx - 1.5, ty - 1.5, 3, 3);
            }

            // 4. Dark Obsidian Abyssal Dragon Torso & Wings
            ctx.fillStyle = '#0F0718';
            ctx.fillRect(ex - 30, vy - 28, 60, 52);
            ctx.fillStyle = '#2E1065';
            ctx.fillRect(ex - 24, vy - 22, 48, 42);

            // Dragon Wing Ribs with Crimson Energy Lines
            ctx.fillStyle = '#E11D48';
            ctx.fillRect(ex - 28, vy - 24, 8, 2);
            ctx.fillRect(ex + 20, vy - 24, 8, 2);
            ctx.fillRect(ex - 30, vy - 16, 10, 2);
            ctx.fillRect(ex + 20, vy - 16, 10, 2);
            ctx.fillRect(ex - 26, vy - 8, 8, 2);
            ctx.fillRect(ex + 18, vy - 8, 8, 2);

            // 5. Pulsating Void Core (Magenta Singularity Event Horizon)
            const coreThrob = 1 + Math.sin(now * 0.009) * 0.18;
            ctx.fillStyle = '#581C87';
            ctx.fillRect(ex - 15 * coreThrob, vy - 15 * coreThrob, 30 * coreThrob, 30 * coreThrob);
            ctx.fillStyle = '#9333EA';
            ctx.fillRect(ex - 10 * coreThrob, vy - 10 * coreThrob, 20 * coreThrob, 20 * coreThrob);
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(ex - 6, vy - 6, 12, 12);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 2.5, vy - 2.5, 5, 5);

            // Horned Dragon Skull with Armored Brow
            ctx.fillStyle = '#1E1B4B';
            ctx.fillRect(ex - 18, vy - 44, 36, 24);
            ctx.fillStyle = '#311042';
            ctx.fillRect(ex - 14, vy - 40, 28, 18);

            // Sweeping Void Horns with Glowing Tips
            ctx.fillStyle = '#1E1B4B';
            ctx.fillRect(ex - 28, vy - 54, 11, 18);
            ctx.fillRect(ex + 17, vy - 54, 11, 18);
            ctx.fillRect(ex - 34, vy - 66, 11, 14);
            ctx.fillRect(ex + 23, vy - 66, 11, 14);
            // Horn glowing tips
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(ex - 34, vy - 70, 7, 7);
            ctx.fillRect(ex + 27, vy - 70, 7, 7);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 32, vy - 68, 3, 3);
            ctx.fillRect(ex + 29, vy - 68, 3, 3);

            // Glowing Crimson Spectral Eyes (Double Slits)
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(ex - 11, vy - 36, 8, 4);
            ctx.fillRect(ex + 3, vy - 36, 8, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 9, vy - 35, 3, 2);
            ctx.fillRect(ex + 5, vy - 35, 3, 2);

            // Fanged Abyssal Maw
            ctx.fillStyle = '#0F0718';
            ctx.fillRect(ex - 10, vy - 28, 20, 6);
            ctx.fillStyle = '#F43F5E';
            ctx.fillRect(ex - 8, vy - 27, 3, 4);
            ctx.fillRect(ex - 2, vy - 27, 4, 4);
            ctx.fillRect(ex + 5, vy - 27, 3, 4);

            // 4 Orbiting Abyssal Void Shards
            for (let i = 0; i < 4; i++) {
              const ang = now * 0.003 + (i * Math.PI) / 2;
              const ox = ex + Math.cos(ang) * 40;
              const oy = vy + Math.sin(ang) * 22;
              ctx.fillStyle = '#9333EA';
              ctx.fillRect(ox - 3.5, oy - 3.5, 7, 7);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(ox - 1.5, oy - 1.5, 3, 3);
            }
          } else if (isAstral) {
            // ==============================================================
            // FLOOR 5 BOSS: Archon of Nothingness (The Celestial Cosmic Titan)
            // Towering Celestial Entity with rotating zodiac rune halo,
            // starlight crystal quad-wings, star-forged cobalt armor, and cosmic greatblade
            // ==============================================================
            const starFloat = Math.sin(now * 0.0035) * 7;
            const ay = ey - 8 + starFloat;

            // 1. Radiant Multilayer Starlight Ground Aura
            const starGrad = ctx.createRadialGradient(ex, ey + 16, 6, ex, ey + 16, 52);
            starGrad.addColorStop(0, 'rgba(56, 189, 248, 0.65)');
            starGrad.addColorStop(0.4, 'rgba(14, 165, 233, 0.45)');
            starGrad.addColorStop(0.8, 'rgba(254, 240, 138, 0.22)');
            starGrad.addColorStop(1, 'rgba(7, 18, 28, 0)');
            ctx.fillStyle = starGrad;
            ctx.beginPath();
            ctx.arc(ex, ey + 16, 52, 0, Math.PI * 2);
            ctx.fill();

            // 2. Concentric Rotating Celestial Zodiac Halo (Behind Head)
            const haloRot = now * 0.0015;
            ctx.save();
            ctx.translate(ex, ay - 42);
            ctx.rotate(haloRot);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 36, 0, Math.PI * 2);
            ctx.stroke();

            // Inner Astrolabe Ring
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(0, 0, 24, 0, Math.PI * 2);
            ctx.stroke();

            // 8 Star Points on Halo
            for (let h = 0; h < 8; h++) {
              const hAng = (h * Math.PI) / 4;
              const hx = Math.cos(hAng) * 36;
              const hy = Math.sin(hAng) * 36;
              ctx.fillStyle = h % 2 === 0 ? '#FEF08A' : '#38BDF8';
              ctx.fillRect(hx - 2.5, hy - 2.5, 5, 5);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(hx - 1, hy - 1, 2, 2);
            }
            ctx.restore();

            // 3. Celestial Cosmic Quad-Wings
            const wingFlap = Math.sin(now * 0.004) * 5;
            // Upper Large Starlight Wings
            ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
            ctx.fillRect(ex - 46, ay - 40 + wingFlap, 22, 46);
            ctx.fillRect(ex + 24, ay - 40 - wingFlap, 22, 46);
            ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
            ctx.fillRect(ex - 38, ay - 34 + wingFlap, 14, 32);
            ctx.fillRect(ex + 26, ay - 34 - wingFlap, 14, 32);
            // Lower Small Wings
            ctx.fillStyle = 'rgba(2, 132, 199, 0.7)';
            ctx.fillRect(ex - 36, ay - 2 + wingFlap * 0.5, 16, 26);
            ctx.fillRect(ex + 20, ay - 2 - wingFlap * 0.5, 16, 26);

            // 4. Star-Forged Heavy Armor Torso & Pauldrons
            ctx.fillStyle = '#0B1A30';
            ctx.fillRect(ex - 24, ay - 26, 48, 48);
            ctx.fillStyle = '#0284C7';
            ctx.fillRect(ex - 18, ay - 20, 36, 38);

            // Cosmic Shoulder Pauldrons with Gold Filigree
            ctx.fillStyle = '#0369A1';
            ctx.fillRect(ex - 30, ay - 28, 12, 18);
            ctx.fillRect(ex + 18, ay - 28, 12, 18);
            ctx.fillStyle = '#EAB308';
            ctx.fillRect(ex - 29, ay - 26, 10, 4);
            ctx.fillRect(ex + 19, ay - 26, 10, 4);

            // Pulsating Celestial Core (Solar Diamond Star)
            ctx.fillStyle = '#0284C7';
            ctx.fillRect(ex - 11, ay - 13, 22, 22);
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(ex - 8, ay - 10, 16, 16);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 5, ay - 7, 10, 10);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 2.5, ay - 4.5, 5, 5);

            // Celestial Crown Helmet
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(ex - 15, ay - 42, 30, 20);
            ctx.fillStyle = '#0284C7';
            ctx.fillRect(ex - 12, ay - 38, 24, 14);
            // Triple Golden Spire Crown
            ctx.fillStyle = '#EAB308';
            ctx.fillRect(ex - 13, ay - 48, 26, 7);
            ctx.fillRect(ex - 13, ay - 55, 4, 9);
            ctx.fillRect(ex - 2, ay - 60, 4, 14);
            ctx.fillRect(ex + 9, ay - 55, 4, 9);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 1, ay - 58, 2, 5);

            // Piercing Radiant Gold Starlight Eyes
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 9, ay - 34, 6, 4);
            ctx.fillRect(ex + 3, ay - 34, 6, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 7, ay - 33, 3, 2);
            ctx.fillRect(ex + 5, ay - 33, 3, 2);

            // Star-Forged Celestial Greatblade (Right Hand) with Shimmering Glow
            const bladeSway = Math.sin(now * 0.005) * 0.08;
            ctx.save();
            ctx.translate(ex + 28, ay - 22);
            ctx.rotate(bladeSway);
            // Gold Hilt & Crossguard
            ctx.fillStyle = '#EAB308';
            ctx.fillRect(-7, 0, 16, 5);
            ctx.fillStyle = '#A16207';
            ctx.fillRect(-1.5, 5, 5, 9);
            // Radiant Crystal Blade
            ctx.fillStyle = '#0284C7';
            ctx.fillRect(-3, -58, 8, 58);
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(-2, -56, 6, 54);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(-0.5, -54, 3, 50);
            ctx.restore();

            // Rising Celestial Stardust Sparks
            for (let s = 0; s < 6; s++) {
              const sparkT = (now * 0.0014 + s * 0.17) % 1;
              const sx = ex - 30 + ((s * 21 + 5) % 60) + Math.sin(now * 0.008 + s) * 7;
              const sy = ay + 12 - sparkT * 75;
              ctx.fillStyle = s % 2 === 0 ? '#38BDF8' : '#FEF08A';
              ctx.fillRect(Math.round(sx), Math.round(sy), 2.5, 2.5);
            }
          } else if (map.floor >= 6) {
            drawHumanoidBoss(ctx, ex, ey, en.name, now, en);
          } else {
            // ==============================================================
            // FLOOR 1 BOSS: Warden Malakor (Highkeep Bastion Warden Knight)
            // Heavy steel plate armor, red heraldic battle cape with gold filigree,
            // winged great-helm, glowing amber visor, lion crest tower shield,
            // and shimmering runic broadsword
            // ==============================================================
            const capeWave = Math.sin(now * 0.006) * 2.5;

            // 1. Bastion Sanctuary Ground Disc
            ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
            ctx.beginPath();
            ctx.arc(ex, ey + 18, 30, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // 2. Flowing Crimson War Mantle draped behind
            ctx.fillStyle = '#881337';
            ctx.fillRect(ex - 26, ey - 20 + walkBob, 52, 46);
            ctx.fillStyle = '#BE123C';
            ctx.fillRect(ex - 22, ey - 16 + walkBob + capeWave, 44, 40);
            // Gold Mantle Hem
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 24, ey + 22 + walkBob + capeWave, 48, 3);

            // 3. Heavy Steel Plate Torso & Armor Plates
            ctx.fillStyle = '#1E293B';
            ctx.fillRect(ex - 22, ey - 24 + walkBob, 44, 42);
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 18, ey - 20 + walkBob, 36, 36);
            ctx.fillStyle = '#475569';
            ctx.fillRect(ex - 14, ey - 16 + walkBob, 28, 30);

            // Golden Highkeep Heraldry & Belt
            ctx.fillStyle = '#D97706';
            ctx.fillRect(ex - 14, ey + walkBob, 28, 7);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 5, ey - 10 + walkBob, 10, 10); // Lion chest emblem
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 3, ey - 8 + walkBob, 6, 6);

            // Spiked Steel Pauldrons with Gold Trim
            ctx.fillStyle = '#64748B';
            ctx.fillRect(ex - 28, ey - 26 + walkBob, 14, 16);
            ctx.fillRect(ex + 14, ey - 26 + walkBob, 14, 16);
            ctx.fillStyle = '#D97706';
            ctx.fillRect(ex - 26, ey - 24 + walkBob, 10, 4);
            ctx.fillRect(ex + 16, ey - 24 + walkBob, 10, 4);
            ctx.fillStyle = '#94A3B8';
            ctx.fillRect(ex - 28, ey - 32 + walkBob, 5, 7); // Shoulder Spikes
            ctx.fillRect(ex + 23, ey - 32 + walkBob, 5, 7);

            // Winged Great-Helm with Golden Crest
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 15, ey - 38 + walkBob, 30, 20);
            // Golden Helm Wings / Crest
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 20, ey - 46 + walkBob, 7, 14);
            ctx.fillRect(ex - 4, ey - 48 + walkBob, 8, 12);
            ctx.fillRect(ex + 13, ey - 46 + walkBob, 7, 14);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 18, ey - 44 + walkBob, 3, 10);
            ctx.fillRect(ex - 2, ey - 46 + walkBob, 4, 8);
            ctx.fillRect(ex + 15, ey - 44 + walkBob, 3, 10);

            // Steel visor faceplate
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(ex - 11, ey - 32 + walkBob, 22, 10);
            // Glowing Amber Visor Slits
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 9, ey - 30 + walkBob, 7, 4);
            ctx.fillRect(ex + 2, ey - 30 + walkBob, 7, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 7, ey - 29 + walkBob, 3, 2);
            ctx.fillRect(ex + 4, ey - 29 + walkBob, 3, 2);

            // Left Hand: Tower Kite Greatshield
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 32, ey - 18 + walkBob, 16, 38);
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(ex - 30, ey - 16 + walkBob, 12, 34);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 27, ey - 10 + walkBob, 6, 20); // Lion heraldry on shield
            ctx.fillRect(ex - 29, ey - 4 + walkBob, 10, 6);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 26, ey - 8 + walkBob, 4, 14);

            // Right Hand: Heavy Broadsword with Shimmering Fuller
            const swordX = ex + 22;
            ctx.fillStyle = '#475569';
            ctx.fillRect(swordX, ey - 50 + walkBob, 8, 60);
            ctx.fillStyle = '#CBD5E1';
            ctx.fillRect(swordX + 2, ey - 48 + walkBob, 4, 54);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(swordX + 3, ey - 46 + walkBob, 2, 50);
            // Gold Crossguard & Pommel
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(swordX - 6, ey - 8 + walkBob, 20, 6);
            ctx.fillStyle = '#D97706';
            ctx.fillRect(swordX + 2, ey + 10 + walkBob, 4, 7);
          }
        } else {
          // Safe visible fallback for any undefined or custom enemy kinds
          drawGenericEnemySprite(ctx, en, ex, ey, now);
        }

        if (en.markedMs > 0) {
          const markPulse = 1 + Math.sin(now * 0.012) * 1.5;
          const mr = en.radius + 5 + markPulse;
          const tick = 5;
          ctx.save();
          ctx.strokeStyle = '#FBBF24';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          // Top-left corner bracket
          ctx.moveTo(ex - mr, ey - mr + tick);
          ctx.lineTo(ex - mr, ey - mr);
          ctx.lineTo(ex - mr + tick, ey - mr);
          // Top-right corner bracket
          ctx.moveTo(ex + mr - tick, ey - mr);
          ctx.lineTo(ex + mr, ey - mr);
          ctx.lineTo(ex + mr, ey - mr + tick);
          // Bottom-right corner bracket
          ctx.moveTo(ex + mr, ey + mr - tick);
          ctx.lineTo(ex + mr, ey + mr);
          ctx.lineTo(ex + mr - tick, ey + mr);
          // Bottom-left corner bracket
          ctx.moveTo(ex - mr + tick, ey + mr);
          ctx.lineTo(ex - mr, ey + mr);
          ctx.lineTo(ex - mr, ey + mr - tick);
          ctx.stroke();

          // Emerald-gold Hunter Quarry apex diamond above target
          const crestY = ey - en.radius - 23;
          ctx.fillStyle = '#34D399';
          ctx.beginPath();
          ctx.moveTo(ex, crestY - 4);
          ctx.lineTo(ex + 3.5, crestY);
          ctx.lineTo(ex, crestY + 4);
          ctx.lineTo(ex - 3.5, crestY);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        const barW = en.kind === 'boss' ? 76 : 30;
        const hpRatio = Math.max(0, en.hp / Math.max(1, en.maxHp));
        const isCatacombs = map.biome === 'catacombs' || map.floor === 2;
        const isEmber = map.biome === 'ember' || map.floor === 3;
        const isVoid = map.biome === 'void' || map.floor === 4;
        const isAstral = map.biome === 'astral' || map.floor === 5;
        const isHymns = map.biome === 'hymns' || map.floor === 6;

        ctx.fillStyle = '#181820';
        ctx.fillRect(ex - barW / 2 - 1, ey - en.radius - 17, barW + 2, 6);
        ctx.fillStyle =
          en.kind === 'boss'
            ? isCatacombs
              ? '#A855F7'
              : isEmber
                ? '#F97316'
                : isVoid
                  ? '#9333EA'
                  : isAstral
                    ? '#38BDF8'
                    : isHymns
                      ? '#FBBF24'
                      : '#EF4444'
            : en.elite
              ? '#F59E0B'
              : '#DC2626';
        ctx.fillRect(ex - barW / 2, ey - en.radius - 16, Math.round(barW * hpRatio), 4);

        if (en.kind === 'boss') {
          ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = en.enraged
            ? '#EF4444'
            : isCatacombs
              ? '#C084FC'
              : isEmber
                ? '#FDBA74'
                : isVoid
                  ? '#F0ABFC'
                  : isAstral
                    ? '#BAE6FD'
                    : isHymns
                      ? '#FEF08A'
                      : '#FCA5A5';
          ctx.fillText(
            en.enraged ? ` ${en.name} [ENRAGED] ` : en.name,
            ex,
            ey - en.radius - 21
          );

          // Enraged Fiery Pulsing Aura & Shockwave Burst
          if (en.enraged) {
            ctx.save();
            const pulse = Math.sin(now * 0.015) * 4;
            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ex, ey, en.radius + 6 + pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Inner gold pulse ring
            ctx.strokeStyle = '#FBBF24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(ex, ey, en.radius + 2 + pulse * 0.5, 0, Math.PI * 2);
            ctx.stroke();

            // Subtle rising rage embers
            for (let f = 0; f < 3; f++) {
              const fAngle = (f * Math.PI * 2) / 3 + now * 0.004;
              const fx = ex + Math.cos(fAngle) * (en.radius + 2);
              const fy = ey + Math.sin(fAngle) * (en.radius + 2) - Math.abs(Math.sin(now * 0.008 + f)) * 6;
              ctx.fillStyle = f % 2 === 0 ? '#EF4444' : '#F59E0B';
              ctx.beginPath();
              ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
              ctx.fill();
            }

            // Tasteful periodic burst (approx once every 0.8s) instead of constant flood
            if (Math.random() < 0.035) {
              particleManager.spawnBossEnrageBurst(ex, ey, now);
            }
            ctx.restore();
          }

          // Bull Rush Charge Speed Trails
          if (en.charging) {
            ctx.save();
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const cAng = en.chargeAngle ?? 0;
            ctx.moveTo(ex - Math.cos(cAng) * 40, ey - Math.sin(cAng) * 40);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.restore();
            particleManager.spawnMalakorChargeTrail(ex, ey, cAng, now);
          }
        }

        // Active Status Badges beneath health bar
        const activeStatuses: { icon: string; color: string }[] = [];
        if ((en.burnedMs ?? 0) > 0) activeStatuses.push({ icon: 'BRN', color: '#F97316' });
        if ((en.frozenMs ?? 0) > 0) activeStatuses.push({ icon: 'FRZ', color: '#38BDF8' });
        if ((en.shockedMs ?? 0) > 0) activeStatuses.push({ icon: 'SHK', color: '#FBBF24' });
        if ((en.poisonedMs ?? 0) > 0) activeStatuses.push({ icon: 'PSN', color: '#22C55E' });
        if ((en.bleedingMs ?? 0) > 0) activeStatuses.push({ icon: 'BLD', color: '#EF4444' });
        if ((en.stunnedMs ?? 0) > 0) activeStatuses.push({ icon: 'STN', color: '#EAB308' });

        if (activeStatuses.length > 0) {
          ctx.save();
          const badgeSpacing = 11;
          const totalW = activeStatuses.length * badgeSpacing;
          const startX = ex - totalW / 2 + 5;
          const badgeY = ey - en.radius - 7;
          ctx.font = '9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          activeStatuses.forEach((st, idx) => {
            const bx = startX + idx * badgeSpacing;
            ctx.fillStyle = 'rgba(15, 15, 22, 0.75)';
            ctx.fillRect(bx - 5, badgeY - 5, 10, 10);
            ctx.fillText(st.icon, bx, badgeY);
          });
          ctx.restore();
        }

        // Visual Status Overlays & Auras
        // 1. Frozen: Ice crystal encasement & frosted white shards
        if ((en.frozenMs ?? 0) > 0) {
          ctx.save();
          const cr = en.radius + 3;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.strokeStyle = '#BAE6FD';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            const px = ex + Math.cos(a) * cr;
            const py = ey + Math.sin(a) * cr;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Internal ice crystal facets & glints
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ex - cr * 0.45, ey - cr * 0.4);
          ctx.lineTo(ex + cr * 0.15, ey + cr * 0.25);
          ctx.moveTo(ex - cr * 0.1, ey - cr * 0.6);
          ctx.lineTo(ex + cr * 0.45, ey - 0.1);
          ctx.stroke();
          ctx.restore();
        }

        // 2. Burned: Rising flickering flame embers & fiery aura
        if ((en.burnedMs ?? 0) > 0) {
          ctx.save();
          // Fiery ambient aura
          ctx.fillStyle = 'rgba(249, 115, 22, 0.2)';
          ctx.beginPath();
          ctx.arc(ex, ey, en.radius + 2, 0, Math.PI * 2);
          ctx.fill();

          // Floating ember particles
          for (let i = 0; i < 4; i++) {
            const seed = (en.id.charCodeAt(0) || 0) + i * 43;
            const fTime = (now * 0.0035 + seed) % 1;
            const fx = ex + Math.sin(now * 0.007 + i * 1.5) * (en.radius * 0.65);
            const fy = ey + en.radius * 0.3 - fTime * (en.radius * 1.4);
            const fSize = (1 - fTime) * 3.5 + 1;
            ctx.fillStyle = i % 2 === 0 ? '#F97316' : '#EF4444';
            ctx.beginPath();
            ctx.arc(fx, fy, fSize, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 3. Shocked: Crackling electric arcs around body perimeter
        if ((en.shockedMs ?? 0) > 0) {
          ctx.save();
          ctx.strokeStyle = Math.floor(now / 60) % 2 === 0 ? '#FBBF24' : '#67E8F9';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const baseArc = (now * 0.012) % (Math.PI * 2);
          for (let s = 0; s < 3; s++) {
            const sa = baseArc + (s * Math.PI * 2) / 3;
            const r1 = en.radius + 2;
            const r2 = en.radius + 7 + Math.sin(now * 0.02 + s * 2) * 3;
            const sx1 = ex + Math.cos(sa) * r1;
            const sy1 = ey + Math.sin(sa) * r1;
            const sxMid = ex + Math.cos(sa + 0.2) * (r1 + 4);
            const syMid = ey + Math.sin(sa + 0.2) * (r1 + 4);
            const sx2 = ex + Math.cos(sa - 0.1) * r2;
            const sy2 = ey + Math.sin(sa - 0.1) * r2;
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sxMid, syMid);
            ctx.lineTo(sx2, sy2);
          }
          ctx.stroke();
          ctx.restore();
        }

        // 4. Poisoned: Acid mist & floating toxic bubbles
        if ((en.poisonedMs ?? 0) > 0) {
          ctx.save();
          ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
          ctx.beginPath();
          ctx.arc(ex, ey, en.radius + 2, 0, Math.PI * 2);
          ctx.fill();

          for (let b = 0; b < 3; b++) {
            const bTime = (now * 0.0028 + b * 0.33) % 1;
            const bx = ex + Math.cos(b * 2.3 + now * 0.002) * (en.radius * 0.6);
            const by = ey - bTime * (en.radius * 1.2);
            ctx.fillStyle = 'rgba(74, 222, 128, 0.85)';
            ctx.beginPath();
            ctx.arc(bx, by, 1.8 + (1 - bTime) * 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 5. Bleeding: Crimson laceration blood drips
        if ((en.bleedingMs ?? 0) > 0) {
          ctx.save();
          for (let d = 0; d < 3; d++) {
            const dTime = (now * 0.004 + d * 0.34) % 1;
            const dx = ex + (d - 1) * 6;
            const dy = ey + en.radius * 0.2 + dTime * (en.radius * 0.9);
            ctx.fillStyle = '#DC2626';
            ctx.beginPath();
            ctx.arc(dx, dy, 2.4 * (1 - dTime * 0.45), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // 6. Stunned: Dizzy celestial stars orbiting above head
        if ((en.stunnedMs ?? 0) > 0) {
          ctx.save();
          const stunOrbit = now * 0.007;
          for (let i = 0; i < 3; i++) {
            const a = stunOrbit + (i * Math.PI * 2) / 3;
            const starX = ex + Math.cos(a) * 11;
            const starY = ey - en.radius - 8 + Math.sin(a) * 4;
            ctx.fillStyle = i % 2 === 0 ? '#FBBF24' : '#A855F7';
            ctx.beginPath();
            ctx.moveTo(starX, starY - 3.5);
            ctx.lineTo(starX + 2, starY);
            ctx.lineTo(starX, starY + 3.5);
            ctx.lineTo(starX - 2, starY);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }

        // Auto-hit Target Lock Reticle
        if (en.id === lockedEnemyId) {
          ctx.save();
          ctx.strokeStyle = '#F43F5E';
          ctx.lineWidth = 1.5;
          const r = en.radius + 6;
          const len = 4;
          // Four corner brackets
          ctx.beginPath();
          // Top-left
          ctx.moveTo(ex - r, ey - r + len);
          ctx.lineTo(ex - r, ey - r);
          ctx.lineTo(ex - r + len, ey - r);
          // Top-right
          ctx.moveTo(ex + r - len, ey - r);
          ctx.lineTo(ex + r, ey - r);
          ctx.lineTo(ex + r, ey - r + len);
          // Bottom-left
          ctx.moveTo(ex - r, ey + r - len);
          ctx.lineTo(ex - r, ey + r);
          ctx.lineTo(ex - r + len, ey + r);
          // Bottom-right
          ctx.moveTo(ex + r - len, ey + r);
          ctx.lineTo(ex + r, ey + r);
          ctx.lineTo(ex + r, ey + r - len);
          ctx.stroke();

          // Pulsing diamond indicator above enemy
          const arrowBob = Math.sin(now * 0.012) * 2.5;
          ctx.fillStyle = '#FB7185';
          ctx.beginPath();
          ctx.moveTo(ex, ey - r - 8 + arrowBob);
          ctx.lineTo(ex - 4, ey - r - 13 + arrowBob);
          ctx.lineTo(ex, ey - r - 17 + arrowBob);
          ctx.lineTo(ex + 4, ey - r - 13 + arrowBob);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }

      // Players
      for (const p of snap.players) {
        const pos = smoothedPlayers.get(p.id) || { x: p.x, y: p.y };
        const hx = Math.round(pos.x);
        const hy = Math.round(pos.y);
        const def = HERO_CLASSES[p.heroClass];
        const moving = Math.hypot(p.vx, p.vy) > 5;
        const bob = moving ? Math.sin(now * 0.018) * 2 : 0;

        if (p.downed) {
          drawFallenAndGhostPlayer(ctx, p, hx, hy, now, p.id === playerId);
          continue;
        }

        // Shadow beneath player
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(hx - 10, hy + 10, 20, 5);

        // Class-specific Subtle Aura / Motion Effects (no obstructive rings on character)
        if (p.heroClass === 'ranger') {
          const isSwift = p.hasteMs > 0 || moving;
          if (isSwift) {
            // Swiftness wind motion lines drifting behind movement
            const windOffX = -Math.cos(p.aimAngle) * 14;
            const windOffY = -Math.sin(p.aimAngle) * 14;
            ctx.strokeStyle = 'rgba(134, 239, 172, 0.7)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(hx + windOffX, hy + windOffY);
            ctx.lineTo(hx + windOffX * 1.8, hy + windOffY * 1.8);
            ctx.stroke();
            if (p.hasteMs > 0) {
              particleManager.spawnRangerSwiftnessTrail(hx, hy, p.aimAngle, now);
            }
          }
        } else if (p.heroClass === 'arcanist') {
          // Arcanist: Astral Resonance 3 Orbiting Celestial Starlight Diamonds
          const orbAngleBase = now * 0.003 + hx;
          for (let orbIdx = 0; orbIdx < 3; orbIdx++) {
            const a = orbAngleBase + (orbIdx * Math.PI * 2) / 3;
            const ox = hx + Math.cos(a) * 20;
            const oy = hy + 4 + Math.sin(a) * 8;
            ctx.fillStyle = '#38BDF8';
            ctx.beginPath();
            ctx.moveTo(ox, oy - 3.5);
            ctx.lineTo(ox + 2.8, oy);
            ctx.lineTo(ox, oy + 3.5);
            ctx.lineTo(ox - 2.8, oy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(ox - 0.5, oy - 0.5, 1, 1);
          }
        } else if (p.heroClass === 'cleric') {
          // Cleric: Radiant Aura 140px Translucent Golden Warmth Halo
          const auraPulse = Math.sin(now * 0.004 + hx) * 3;
          ctx.fillStyle = 'rgba(253, 224, 71, 0.06)';
          ctx.beginPath();
          ctx.arc(hx, hy, 140, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(253, 224, 71, 0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(hx, hy, 140 + auraPulse, 0, Math.PI * 2);
          ctx.stroke();

          particleManager.spawnClericBeaconMotes(hx, hy, 40, now);
        }
        // Floor Status Effects Visual Feedback
        if (p.statuses && p.statuses.length > 0) {
          const statusCount = p.statuses.length;
          p.statuses.forEach((s, sIdx) => {
            const angle = (now * 0.002) + (sIdx * (Math.PI * 2) / statusCount);
            const dist = 22 + Math.sin(now * 0.003 + sIdx) * 3;
            const sx = hx + Math.cos(angle) * dist;
            const sy = hy - 10 + Math.sin(angle) * (dist * 0.4);

            let color = '#CBD5E1';
            let char = '●';

            if (s.type === 'guard_broken') { color = '#60A5FA'; char = '!'; }
            else if (s.type === 'frostbite') { color = '#38BDF8'; char = '*'; }
            else if (s.type === 'scorched') { color = '#EF4444'; char = '^'; }
            else if (s.type === 'voidmarked') { 
              color = '#A855F7'; char = 'o'; 
              // Pulsing radius for voidmark detonation
              if (s.detonationTimerMs !== undefined) {
                const pct = 1 - (s.detonationTimerMs / 3000);
                ctx.strokeStyle = `rgba(168, 85, 247, ${0.4 + Math.sin(now * 0.02) * 0.2})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(hx, hy, 95 * pct, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
            else if (s.type === 'disoriented') { color = '#818CF8'; char = '?'; }
            else if (s.type === 'charmed') { color = '#FDE68A'; char = '+'; }
            else if (s.type === 'ashen_curse') { color = '#D9AA52'; char = 'x'; }
            else if (s.type === 'silenced') { color = '#A855F7'; char = 'X'; }
            else if (s.type === 'impaled') { color = '#FBBF24'; char = '|'; }
            else if (s.type === 'condemned') { 
              color = '#FDE047'; char = '!'; 
              // Radiant judgment circle
              if (s.detonationTimerMs !== undefined) {
                const pulse = 0.5 + Math.sin(now * 0.01) * 0.2;
                ctx.fillStyle = `rgba(253, 224, 71, ${0.05 * pulse})`;
                ctx.beginPath();
                ctx.arc(hx, hy, 45, 0, Math.PI * 2);
                ctx.fill();
              }
            }

            ctx.fillStyle = color;
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, sx, sy);
            
            // Draw small timer arc
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, 7, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * (s.durationMs / s.maxDurationMs)));
            ctx.stroke();
          });
        }

        // Aim angle & articulated pixel hero sprite with 60 FPS smooth weapon swing transitions
        const ang = p.id === playerId ? aimAngleRef.current : p.aimAngle;
        const swingState = playerWeaponSwings.get(p.id);
        const swingProgress = swingState
          ? Math.max(0, Math.min(1, (now - swingState.bornAt) / swingState.durationMs))
          : undefined;
        drawHeroSprite(ctx, p, hx, hy, {
          aimAngle: ang,
          bob,
          moving,
          now,
          swingProgress,
          swingKind: swingState?.kind,
        });

        // Player Name Tag
        const isLocalPlayer = p.id === playerId;
        const displayLabel = p.username;

        ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        const labelWidth = ctx.measureText(displayLabel).width;

        // Name Tag Translucent Badge
        const badgeY = hy - 38;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(hx - labelWidth / 2 - 6, badgeY - 11, labelWidth + 12, 17);

        // Border: Gold for Local Player, Azure Blue for Allies
        ctx.strokeStyle = isLocalPlayer ? '#F59E0B' : '#0284C7';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(hx - labelWidth / 2 - 6, badgeY - 11, labelWidth + 12, 17);

        // Gold Marker Arrow for Local Player
        if (isLocalPlayer) {
          ctx.fillStyle = '#F59E0B';
          ctx.beginPath();
          ctx.moveTo(hx, badgeY - 13);
          ctx.lineTo(hx - 4, badgeY - 17);
          ctx.lineTo(hx + 4, badgeY - 17);
          ctx.closePath();
          ctx.fill();
        }

        // Name text
        ctx.fillStyle = isLocalPlayer ? '#FCD34D' : '#7DD3FC';
        ctx.fillText(displayLabel, hx, badgeY + 1);

        // Health Bar & Compact Shield Bar (replaces circle overlay on sprite)
        const pBarW = 36;
        const pHpRatio = Math.max(0, p.hp / Math.max(1, p.maxHp));
        ctx.fillStyle = '#0F172A';
        ctx.fillRect(hx - pBarW / 2 - 1, hy - 18, pBarW + 2, 5);
        ctx.fillStyle = isLocalPlayer ? '#22C55E' : '#38BDF8';
        ctx.fillRect(hx - pBarW / 2, hy - 17, Math.round(pBarW * pHpRatio), 3);
        if (p.shield > 0) {
          const pShieldRatio = Math.min(1, p.shield / 60);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(hx - pBarW / 2 - 1, hy - 21, pBarW + 2, 3);
          ctx.fillStyle = '#93C5FD';
          ctx.fillRect(hx - pBarW / 2, hy - 20, Math.max(2, Math.round(pBarW * pShieldRatio)), 2);
        }
      }

      // Enhanced Projectiles & Combat Trails
      const activeProjIds = new Set<string>();
      for (const proj of snap.projectiles) {
        activeProjIds.add(proj.id);
        drawEnhancedProjectile(ctx, proj, now);
        particleManager.spawnProjectileWake(proj, now);
      }
      particleManager.cleanupInactiveProjectiles(activeProjIds);

      // Floating Numbers, Critical Hit Animations & Speech Bubbles
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        const age = now - ft.bornAt;
        const isDialogue = ft.text.startsWith('"');
        const duration = isDialogue ? 5500 : ft.kind === 'ping' ? 2600 : ft.kind === 'crit' ? 1200 : 950;
        if (age >= duration) {
          floatingTexts.splice(i, 1);
          continue;
        }
        const t = age / duration;
        const alpha = Math.max(0, 1 - Math.pow(t, 4)); // 100% opacity for most of the 5.5s duration
        const floatY = ft.y - (isDialogue ? Math.min(10, t * 12) : t * (ft.kind === 'ping' ? 20 : ft.kind === 'crit' ? 36 : 28));

        ctx.save();
        ctx.globalAlpha = alpha;

        if (ft.kind === 'crit') {
          // Explosive Scale Pop & Golden Glow for Critical Hits
          const pop = t < 0.18 ? 0.6 + (t / 0.18) * 1.0 : Math.max(1, 1.6 - (t - 0.18) * 0.7);
          ctx.translate(ft.x, floatY);
          ctx.scale(pop, pop);

          // Glowing badge background
          ctx.fillStyle = 'rgba(220, 38, 38, 0.45)';
          ctx.fillRect(-32, -12, 64, 16);
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-32, -12, 64, 16);

          ctx.font = '800 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#111219';
          ctx.fillText(` ${ft.text}!`, 1, 1);
          ctx.fillStyle = '#FEF08A';
          ctx.fillText(` ${ft.text}!`, 0, 0);
        } else if (ft.kind === 'status') {
          // Styled Status / Speech Badge
          ctx.translate(ft.x, floatY);
          ctx.font = isDialogue
            ? '600 12px "Plus Jakarta Sans", sans-serif'
            : '700 11px "JetBrains Mono", monospace';
          const textW = ctx.measureText(ft.text).width;

          // Translucent Speech/Status box
          ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
          ctx.fillRect(-textW / 2 - 8, -13, textW + 16, 20);
          ctx.strokeStyle = isDialogue ? '#FCD34D' : ft.color;
          ctx.lineWidth = 1.4;
          ctx.strokeRect(-textW / 2 - 8, -13, textW + 16, 20);

          if (isDialogue) {
            // Speech tail pointer
            ctx.fillStyle = '#FCD34D';
            ctx.beginPath();
            ctx.moveTo(0, 7);
            ctx.lineTo(-4, 11);
            ctx.lineTo(4, 11);
            ctx.closePath();
            ctx.fill();
          }

          ctx.textAlign = 'center';
          ctx.fillStyle = isDialogue ? '#FDE68A' : ft.color;
          ctx.fillText(ft.text, 0, 1);
        } else {
          // Standard Damage, Heal, Gold, Ping
          ctx.font =
            ft.kind === 'ping'
              ? '700 13px "JetBrains Mono", monospace'
              : '600 12px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#111219';
          ctx.fillText(ft.text, ft.x + 1, floatY + 1);
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, ft.x, floatY);
        }

        ctx.restore();
      }

      // Update and render combat particles in world coordinates
      particleManager.updateAndDraw(ctx, now, dtSec);

      ctx.restore();

      // ——— HIGH-DETAIL STONE RADAR MINIMAP ———
      const isMobileScreen = cw < 640;
      let mmScale = 2.5;
      if (isMobileScreen) {
        const targetMaxW = Math.min(100, Math.floor(cw * 0.24));
        mmScale = Math.max(1.0, Math.min(1.5, targetMaxW / Math.max(1, map.width)));
      }
      const mmW = map.width * mmScale;
      const mmH = map.height * mmScale;
      const pad = isMobileScreen ? 4 : 6;
      const mmX = cw - mmW - (isMobileScreen ? 8 : 20);
      const mmY = isMobileScreen ? 42 : 74;

      // 1. Stone Outer Bevel Frame (.stone-panel aesthetic)
      ctx.save();
      ctx.fillStyle = '#55535f';
      ctx.fillRect(mmX - pad, mmY - pad - 16, mmW + pad * 2, mmH + pad * 2 + 16);

      // Stone 3px Bevel borders
      ctx.fillStyle = '#75737f'; // Top light
      ctx.fillRect(mmX - pad, mmY - pad - 16, mmW + pad * 2, 3);
      ctx.fillRect(mmX - pad, mmY - pad - 16, 3, mmH + pad * 2 + 16);
      ctx.fillStyle = '#353442'; // Dark border
      ctx.strokeRect(mmX - pad, mmY - pad - 16, mmW + pad * 2, mmH + pad * 2 + 16);
      ctx.fillStyle = '#41404c'; // Bottom shadow
      ctx.fillRect(mmX - pad, mmY + mmH + pad - 3, mmW + pad * 2, 3);
      ctx.fillRect(mmX + mmW + pad - 3, mmY - pad - 16, 3, mmH + pad * 2 + 16);

      // 2. Header Bar
      ctx.fillStyle = '#353442';
      ctx.fillRect(mmX - pad + 3, mmY - pad - 13, mmW + pad * 2 - 6, 14);
      ctx.fillStyle = '#FCD34D';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const headerTitle = map.floor === 0 ? 'TAVERN HUB' : `F${map.floor}: ${map.biomeTitle.toUpperCase()}`;
      ctx.fillText(headerTitle.slice(0, 16), mmX - pad + 5, mmY - pad - 6);

      // Compass Indicator "N"
      ctx.fillStyle = '#38BDF8';
      ctx.textAlign = 'right';
      ctx.fillText('N ▲', mmX + mmW + pad - 5, mmY - pad - 6);

      // 3. Inner Map Viewport
      ctx.fillStyle = '#111018';
      ctx.fillRect(mmX, mmY, mmW, mmH);
      ctx.strokeStyle = '#2A2836';
      ctx.lineWidth = 1;
      ctx.strokeRect(mmX, mmY, mmW, mmH);

      const flagMap = new Map(
        snap.roomClearedFlags.map((f) => [f.id, f])
      );

      // 4. Corridor Pathways & Walkable Tiles
      const tileW = mmScale;
      const tileH = mmScale;
      ctx.fillStyle = '#1E1D2A';
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const tileCode = map.tiles[ty * map.width + tx];
          if (tileCode > 0) {
            ctx.fillRect(mmX + tx * tileW, mmY + ty * tileH, tileW, tileH);
          }
        }
      }

      // 5. Rooms
      for (const room of map.rooms) {
        const flags = flagMap.get(room.id);
        const discovered = flags ? flags.discovered : room.discovered;
        const cleared = flags ? flags.cleared : room.cleared;
        const isGuardian = Boolean(room.guardian || flags?.guardian);

        if (!discovered && room.type !== 'boss') continue;

        const rx = mmX + room.x * mmScale;
        const ry = mmY + room.y * mmScale;
        const rw = room.w * mmScale;
        const rh = room.h * mmScale;

        // Fill
        if (room.type === 'boss') {
          ctx.fillStyle = '#7F1D1D';
        } else if (room.type === 'treasure') {
          ctx.fillStyle = '#78350F';
        } else if (room.type === 'shrine') {
          ctx.fillStyle = '#064E3B';
        } else if (isGuardian && !cleared) {
          ctx.fillStyle = '#78350F';
        } else if (cleared) {
          ctx.fillStyle = '#1E293B';
        } else {
          ctx.fillStyle = '#334155';
        }
        ctx.fillRect(rx, ry, rw, rh);

        // Border
        ctx.strokeStyle =
          room.type === 'boss'
            ? Math.floor(now / 300) % 2 === 0 ? '#EF4444' : '#DC2626'
            : room.type === 'treasure'
              ? '#F59E0B'
              : room.type === 'shrine'
                ? '#10B981'
                : isGuardian
                  ? cleared
                    ? '#10B981'
                    : '#F59E0B'
                  : cleared
                    ? '#475569'
                    : '#64748B';
        ctx.lineWidth = room.type === 'boss' || (isGuardian && !cleared) ? 1.5 : 1;
        ctx.strokeRect(rx, ry, rw, rh);

        // Room Badge Text
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = rx + rw / 2;
        const cy = ry + rh / 2;
        if (room.type === 'boss') {
          ctx.fillStyle = '#FCA5A5';
          ctx.fillText('BOSS', cx, cy);
        } else if (room.type === 'treasure') {
          ctx.fillStyle = '#FDE047';
          ctx.fillText('[T]', cx, cy);
        } else if (room.type === 'shrine') {
          ctx.fillStyle = '#6EE7B7';
          ctx.fillText('[S]', cx, cy);
        } else if (isGuardian) {
          ctx.fillStyle = cleared ? '#6EE7B7' : '#FCD34D';
          ctx.fillText(cleared ? 'G' : '[G]', cx, cy);
        } else if (room.type === 'start') {
          ctx.fillStyle = '#94A3B8';
          ctx.fillText('[ST]', cx, cy);
        }
      }

      // 6. Dungeon Portal Indicator
      if (map.portalPos) {
        const px = mmX + Math.floor(map.portalPos.x / TILE_SIZE) * mmScale;
        const py = mmY + Math.floor(map.portalPos.y / TILE_SIZE) * mmScale;
        const portalPulse = Math.sin(now / 200) * 1.5 + 3.5;
        ctx.fillStyle = snap.bossDefeated ? '#34D399' : snap.bossRoomCleared ? '#F59E0B' : '#38BDF8';
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, portalPulse), 0, Math.PI * 2);
        ctx.fill();
      }

      // 7. Enemy Markers
      if (snap.enemies) {
        for (const en of snap.enemies) {
          if (en.hp <= 0) continue;
          const ex = mmX + Math.floor(en.x / TILE_SIZE) * mmScale;
          const ey = mmY + Math.floor(en.y / TILE_SIZE) * mmScale;
          if (en.kind === 'boss') {
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
          } else {
            ctx.fillStyle = en.elite ? '#F97316' : '#EF4444';
            ctx.fillRect(ex - 1, ey - 1, en.elite ? 3 : 2, en.elite ? 3 : 2);
          }
        }
      }

      // 8. Player Markers & Local Radar Ring
      for (const p of snap.players) {
        const isMe = p.id === playerId;
        const px = mmX + Math.floor(p.x / TILE_SIZE) * mmScale;
        const py = mmY + Math.floor(p.y / TILE_SIZE) * mmScale;

        if (isMe) {
          // Pulse ring around local player
          const pulseR = Math.sin(now / 150) * 1.2 + 3.5;
          ctx.strokeStyle = '#FCD34D';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, Math.max(2, pulseR), 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#FACC15';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        }
      }

      ctx.restore();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [latestSnapshotRef, map, playerId]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseScreenRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (keysRef.current.attack) {
      onSendKeyboardInput({ ...keysRef.current, aimAngle: aimAngleRef.current });
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseScreenRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.button === 0) {
      keysRef.current.attack = true;
      const snap = latestSnapshotRef.current;
      const me = snap?.players.find((p) => p.id === playerId);
      if (me && snap) {
        let nearestDist = Infinity;
        const maxDist = me.heroClass === 'vanguard' ? 140 : 460;
        for (const en of snap.enemies) {
          if (en.hp <= 0) continue;
          const d = Math.hypot(en.x - me.x, en.y - me.y);
          if (d < nearestDist && d <= maxDist) {
            nearestDist = d;
            aimAngleRef.current = Math.atan2(en.y - me.y, en.x - me.x);
          }
        }
        if (nearestDist === Infinity && snap.trainingDummies) {
          for (const dummy of snap.trainingDummies) {
            const d = Math.hypot(dummy.x - me.x, dummy.y - me.y);
            if (d < nearestDist && d <= maxDist) {
              nearestDist = d;
              aimAngleRef.current = Math.atan2(dummy.y - me.y, dummy.x - me.x);
            }
          }
        }
      }
      triggerLocalSwing('primary');
      onSendKeyboardInput({ ...keysRef.current, aimAngle: aimAngleRef.current });
    } else if (e.button === 2) {
      e.preventDefault();
      sfx.playSkill('tactical');
      triggerLocalSwing('tactical');
      onTriggerAction('tactical', aimAngleRef.current);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) {
      keysRef.current.attack = false;
      onSendKeyboardInput({ ...keysRef.current, aimAngle: aimAngleRef.current });
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      className="block w-screen h-screen cursor-crosshair pixelated touch-none"
    />
  );
};

export const GameCanvas = React.memo(GameCanvasComponent);
