import React, { useEffect, useRef } from 'react';
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
import { sfx, soundManager } from '../client/sound.ts';
import {
  HERO_CLASSES,
  TILE_SIZE,
  type DungeonMap,
  type EnemyKind,
  type FloatingEvent,
  type GameSnapshot,
  type PlayerInputState,
} from '../shared/types.ts';

interface GameCanvasProps {
  playerId: string;
  map: DungeonMap;
  latestSnapshotRef: React.MutableRefObject<GameSnapshot | null>;
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

export const GameCanvas: React.FC<GameCanvasProps> = ({
  playerId,
  map,
  latestSnapshotRef,
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
  const cameraRef = useRef({ x: 300, y: 300 });
  const chatFocusedRef = useRef(chatFocused);
  chatFocusedRef.current = chatFocused;

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
      onSendKeyboardInput({
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
        }
      } else if (k === 'q') {
        sfx.playSkill('tactical');
        onTriggerAction('tactical', aimAngleRef.current);
      } else if (k === 'r' || e.key === 'Shift') {
        sfx.playSkill('ult');
        onTriggerAction('ult', aimAngleRef.current);
      } else if (k === 'c' || k === 'f' || k === 'v') {
        sfx.playDash();
        onTriggerAction('dash', aimAngleRef.current);
      } else if (k === 'h' || k === '1') {
        sfx.playHeal();
        onTriggerAction('potion', aimAngleRef.current);
      } else if (k === 'e') {
        sfx.playUiClick();
        onTriggerAction('interact', aimAngleRef.current);
      } else if (k === 'g') {
        const snap = latestSnapshotRef.current;
        const me = snap?.players.find((p) => p.id === playerId);
        if (me) {
          sfx.playUiClick();
          onSendPing('Rally Here', me.x, me.y - 18);
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
  }, [latestSnapshotRef, onSendKeyboardInput, onSendPing, onTriggerAction, playerId]);

  // 60 FPS Render Loop with Delta-Time Velocity Extrapolation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const smoothedPlayers = new Map<string, SmoothedPos>();
    const smoothedEnemies = new Map<string, SmoothedPos>();
    const prevEnemiesMap = new Map<string, { hp: number; kind: EnemyKind; x: number; y: number }>();
    const floatingTexts: ActiveFloatingText[] = [];
    const seenEventIds = new Set<string>();
    const particleManager = new Part
