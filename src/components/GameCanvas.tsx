import React, { useEffect, useRef } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  TILE_SIZE,
  type DungeonMap,
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
    action: 'tactical' | 'ult' | 'potion' | 'interact',
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

    const palette =
      map.biome === 'courtyard'
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
          : {
              voidBg: '#160F12',
              floorA: '#382B2E',
              floorB: '#302427',
              moss: '#5C3228',
              wallTop: '#594246',
              wallFace: '#2B1E21',
              pillar: '#75565B',
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

        if (code === 1 || code === 5) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? palette.floorA : palette.floorB;
          ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
          ctx.fillRect(px + TILE_SIZE - 2, py, 2, TILE_SIZE);

          if (hash % 11 === 0) {
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
    const floatingTexts: ActiveFloatingText[] = [];
    const seenEventIds = new Set<string>();
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
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = '#111219';
      ctx.fillRect(0, 0, cw, ch);

      const snap = latestSnapshotRef.current;
      if (!snap) {
        rafId = requestAnimationFrame(render);
        return;
      }

      for (const ev of snap.events) {
        if (!seenEventIds.has(ev.id)) {
          seenEventIds.add(ev.id);
          floatingTexts.push({ ...ev, bornAt: now });
          if (ev.kind === 'gold') sfx.playCoin();
          else if (ev.kind === 'heal') sfx.playHeal();
          else if (ev.kind === 'damage') sfx.playEnemyHit(false);
          else if (ev.kind === 'crit') sfx.playEnemyHit(true);
          else if (ev.text.includes('Relic')) sfx.playRelicChime();
        }
      }
      if (seenEventIds.size > 600) {
        seenEventIds.clear();
      }

      // Smooth & Predict Players (Extrapolate along velocity + gently pull toward authoritative server pos)
      for (const p of snap.players) {
        let cur = smoothedPlayers.get(p.id);
        if (!cur || Math.hypot(p.x - cur.x, p.y - cur.y) > 100) {
          smoothedPlayers.set(p.id, { x: p.x, y: p.y });
        } else {
          // If player has velocity, predict forward in current frame
          if (Math.hypot(p.vx, p.vy) > 10) {
            cur.x += p.vx * dtSec;
            cur.y += p.vy * dtSec;
          }
          // Smoothly reconcile error with server
          cur.x += (p.x - cur.x) * 0.38;
          cur.y += (p.y - cur.y) * 0.38;
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
          cur.x += (en.x - cur.x) * 0.38;
          cur.y += (en.y - cur.y) * 0.38;
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
        cameraRef.current.x += (mySmooth.x - cameraRef.current.x) * 0.22;
        cameraRef.current.y += (mySmooth.y - cameraRef.current.y) * 0.22;

        if (mouseScreenRef.current.x !== 0 || mouseScreenRef.current.y !== 0) {
          const screenPlayerX = cw / 2 + (mySmooth.x - cameraRef.current.x);
          const screenPlayerY = ch / 2 + (mySmooth.y - cameraRef.current.y);
          aimAngleRef.current = Math.atan2(
            mouseScreenRef.current.y - screenPlayerY,
            mouseScreenRef.current.x - screenPlayerX
          );
        }
      }

      const camX = Math.round(cameraRef.current.x - cw / 2);
      const camY = Math.round(cameraRef.current.y - ch / 2);

      ctx.save();
      ctx.translate(-camX, -camY);

      if (mapLayerRef.current) {
        ctx.drawImage(mapLayerRef.current, 0, 0);
      }

      // Portal
      const px = map.portalPos.x;
      const py = map.portalPos.y;
      if (snap.bossDefeated) {
        const pulse = 22 + Math.sin(now * 0.006) * 4;
        const grad = ctx.createRadialGradient(px, py, 4, px, py, pulse + 14);
        grad.addColorStop(0, 'rgba(186, 230, 253, 0.95)');
        grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.55)');
        grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, pulse + 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#E0F2FE';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 16, now * 0.003, now * 0.003 + Math.PI * 1.4);
        ctx.stroke();

        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#E0F2FE';
        ctx.textAlign = 'center';
        ctx.fillText('[E] Descent Portal', px, py - 26);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 18, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Torches
      const flicker = 0.88 + Math.sin(now * 0.009) * 0.12;
      for (const t of map.torches) {
        if (
          t.x < camX - 90 ||
          t.x > camX + cw + 90 ||
          t.y < camY - 90 ||
          t.y > camY + ch + 90
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
          ctx.fillStyle = 'rgba(96, 165, 250, 0.14)';
          ctx.strokeStyle = 'rgba(147, 197, 253, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (z.kind === 'solar_beacon') {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.14)';
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.8)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (z.kind === 'chrono_well') {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
          ctx.strokeStyle = 'rgba(125, 211, 252, 0.78)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (z.kind === 'boss_slam') {
          const progress = 1 - Math.max(0, z.ttlMs) / Math.max(1, z.maxTtlMs);
          const isCatacombs = map.biome === 'catacombs' || map.floor === 2;
          const isEmber = map.biome === 'ember' || map.floor >= 3;

          if (isCatacombs) {
            // Sunken Crypt: Necrotic Soul Well stasis circle
            ctx.fillStyle = 'rgba(126, 34, 206, 0.22)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Expanding cyan rune ring
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius * progress, 0, Math.PI * 2);
            ctx.stroke();

            // Inner spectral square rune
            ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(z.x - 14, z.y - 14, 28, 28);
          } else if (isEmber) {
            // Cindervault: Volcanic Magma Eruption crater
            ctx.fillStyle = 'rgba(234, 88, 12, 0.26)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();

            // Expanding incandescent shockwave
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius * progress, 0, Math.PI * 2);
            ctx.stroke();

            // Molten core ring
            ctx.strokeStyle = 'rgba(220, 38, 38, 0.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius * 0.5 * progress, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Highkeep: Heavy stone ground slam
            ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(248, 113, 113, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(z.x, z.y, z.radius * progress, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Props
      for (const prop of snap.props) {
        if (prop.opened && (prop.kind === 'crate' || prop.kind === 'coin' || prop.kind === 'potion')) {
          continue;
        }
        const x = Math.round(prop.x);
        const y = Math.round(prop.y);

        if (prop.kind === 'crate') {
          ctx.fillStyle = '#7C5338';
          ctx.fillRect(x - 10, y - 10, 20, 20);
          ctx.fillStyle = '#9E6B49';
          ctx.fillRect(x - 8, y - 8, 16, 4);
          ctx.fillRect(x - 8, y + 4, 16, 4);
        } else if (prop.kind === 'chest') {
          ctx.fillStyle = prop.opened ? '#4B3B32' : '#8C5832';
          ctx.fillRect(x - 12, y - 9, 24, 18);
          ctx.fillStyle = '#E2B45A';
          ctx.fillRect(x - 12, y - 2, 24, 3);
          ctx.fillRect(x - 2, y - 4, 4, 6);
        } else if (prop.kind === 'relic_chest') {
          ctx.fillStyle = prop.opened ? '#3E3A4F' : '#58427C';
          ctx.fillRect(x - 14, y - 11, 28, 22);
          ctx.fillStyle = '#F4D378';
          ctx.fillRect(x - 14, y - 3, 28, 4);
          ctx.fillRect(x - 3, y - 6, 6, 8);
          if (!prop.opened) {
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = '#FDE68A';
            ctx.textAlign = 'center';
            ctx.fillText('[E] Relic Vault', x, y - 17);
          }
        } else if (prop.kind === 'shrine') {
          ctx.fillStyle = '#6B7280';
          ctx.fillRect(x - 12, y - 6, 24, 18);
          ctx.fillStyle = prop.opened ? '#475569' : '#6EE7B7';
          ctx.fillRect(x - 6, y - 18, 12, 12);
          if (!prop.opened) {
            ctx.font = '600 10px "JetBrains Mono", monospace';
            ctx.fillStyle = '#A7F3D0';
            ctx.textAlign = 'center';
            ctx.fillText('[E] Shrine', x, y - 24);
          }
        } else if (prop.kind === 'coin') {
          const bob = Math.sin(now * 0.008 + x) * 2;
          ctx.fillStyle = '#FACC15';
          ctx.fillRect(x - 5, y - 5 + bob, 10, 10);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(x - 2, y - 3 + bob, 3, 5);
        } else if (prop.kind === 'potion') {
          const bob = Math.sin(now * 0.006 + y) * 2;
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(x - 6, y - 4 + bob, 12, 11);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(x - 3, y - 8 + bob, 6, 4);
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
      }

      // Enemies
      for (const en of snap.enemies) {
        const pos = smoothedEnemies.get(en.id) || { x: en.x, y: en.y };
        const ex = Math.round(pos.x);
        const ey = Math.round(pos.y);
        const walkBob = en.state === 'chase' ? Math.sin(now * 0.014 + ex * 0.1) * 2 : 0;

        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(ex - en.radius + 2, ey + en.radius - 3, (en.radius - 2) * 2, 5);

        if (en.kind === 'slime') {
          ctx.fillStyle = en.slowedMs > 0 ? '#38BDF8' : '#4ADE80';
          ctx.fillRect(ex - 12, ey - 8 + walkBob, 24, 18);
          ctx.fillStyle = '#86EFAC';
          ctx.fillRect(ex - 8, ey - 11 + walkBob, 16, 4);
          ctx.fillStyle = '#14532D';
          ctx.fillRect(ex - 6, ey - 2 + walkBob, 3, 3);
          ctx.fillRect(ex + 3, ey - 2 + walkBob, 3, 3);
        } else if (en.kind === 'goblin') {
          ctx.fillStyle = '#65A30D';
          ctx.fillRect(ex - 9, ey - 12 + walkBob, 18, 20);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(ex - 9, ey + walkBob, 18, 9);
          ctx.fillStyle = '#EF4444';
          ctx.fillRect(ex - 5, ey - 8 + walkBob, 3, 3);
          ctx.fillRect(ex + 2, ey - 8 + walkBob, 3, 3);
        } else if (en.kind === 'skeleton') {
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(ex - 8, ey - 13 + walkBob, 16, 22);
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(ex - 5, ey - 9 + walkBob, 3, 3);
          ctx.fillRect(ex + 2, ey - 9 + walkBob, 3, 3);
          ctx.fillStyle = '#B45309';
          ctx.fillRect(ex + 9, ey - 10 + walkBob, 3, 16);
        } else if (en.kind === 'cultist') {
          ctx.fillStyle = '#6D28D9';
          ctx.fillRect(ex - 10, ey - 14 + walkBob, 20, 24);
          ctx.fillStyle = '#C084FC';
          ctx.fillRect(ex - 5, ey - 9 + walkBob, 3, 3);
          ctx.fillRect(ex + 2, ey - 9 + walkBob, 3, 3);
        } else if (en.kind === 'knight') {
          ctx.fillStyle = '#64748B';
          ctx.fillRect(ex - 12, ey - 15 + walkBob, 24, 26);
          ctx.fillStyle = '#991B1B';
          ctx.fillRect(ex - 4, ey - 19 + walkBob, 8, 4);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(ex - 7, ey - 9 + walkBob, 14, 3);
        } else if (en.kind === 'boss') {
          const isCatacombs = map.biome === 'catacombs' || map.floor === 2;
          const isEmber = map.biome === 'ember' || map.floor >= 3;

          if (isCatacombs) {
            // ==============================================================
            // FLOOR 2 BOSS: Archlich Vaelor (The Sunken Crypt Archlich)
            // Levitating Skeletal Necromancer Lord with floating robes,
            // horned bone crown, soul staff, and orbiting soul wisps
            // ==============================================================
            const lichFloat = Math.sin(now * 0.004) * 6;
            const by = ey - 4 + lichFloat;

            // Ethereal purple & cyan ground aura
            const auraPulse = 28 + Math.sin(now * 0.006) * 5;
            const auraGrad = ctx.createRadialGradient(ex, ey + 18, 4, ex, ey + 18, auraPulse);
            auraGrad.addColorStop(0, 'rgba(34, 211, 238, 0.35)');
            auraGrad.addColorStop(0.5, 'rgba(126, 34, 206, 0.25)');
            auraGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
            ctx.fillStyle = auraGrad;
            ctx.beginPath();
            ctx.arc(ex, ey + 18, auraPulse, 0, Math.PI * 2);
            ctx.fill();

            // Tattered dark obsidian shroud / outer robe
            ctx.fillStyle = '#171126';
            ctx.fillRect(ex - 22, by - 14, 44, 42);
            // Tattered fraying bottom teeth
            for (let t = 0; t < 5; t++) {
              ctx.fillRect(ex - 22 + t * 9, by + 28, 7, 7 + (t % 2) * 5);
            }

            // Inner royal necrotic purple robe
            ctx.fillStyle = '#4C1D95';
            ctx.fillRect(ex - 15, by - 10, 30, 38);

            // Runic spine embroidery (glowing cyan)
            ctx.fillStyle = '#22D3EE';
            ctx.fillRect(ex - 2, by - 6, 4, 28);
            ctx.fillRect(ex - 8, by, 16, 2);
            ctx.fillRect(ex - 6, by + 10, 12, 2);

            // Skeletal collar / shoulder bone structure
            ctx.fillStyle = '#CBD5E1';
            ctx.fillRect(ex - 18, by - 16, 36, 6);
            ctx.fillStyle = '#94A3B8';
            ctx.fillRect(ex - 20, by - 14, 6, 8);
            ctx.fillRect(ex + 14, by - 14, 6, 8);

            // Floating Skeletal Bone Skull
            ctx.fillStyle = '#F1F5F9';
            ctx.fillRect(ex - 10, by - 32, 20, 16);
            // Cheekbone shadows & nose cavity
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 10, by - 20, 3, 4);
            ctx.fillRect(ex + 7, by - 20, 3, 4);
            ctx.fillRect(ex - 1, by - 22, 2, 4);
            // Deep sunken eye sockets
            ctx.fillStyle = '#0F172A';
            ctx.fillRect(ex - 7, by - 28, 5, 5);
            ctx.fillRect(ex + 2, by - 28, 5, 5);

            // Piercing Spectral Cyan Soul Eyes (glowing)
            ctx.fillStyle = '#22D3EE';
            ctx.fillRect(ex - 6, by - 27, 3, 3);
            ctx.fillRect(ex + 3, by - 27, 3, 3);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 5, by - 26, 1, 1);
            ctx.fillRect(ex + 4, by - 26, 1, 1);

            // Ancient Horned Bone Crown (blackened gold + ivory spires)
            ctx.fillStyle = '#D97706';
            ctx.fillRect(ex - 12, by - 36, 24, 4);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 2, by - 37, 4, 3);
            // 3 Ivory Horn Spires
            ctx.fillStyle = '#F1F5F9';
            ctx.fillRect(ex - 12, by - 44, 4, 9);
            ctx.fillRect(ex - 2, by - 48, 4, 13);
            ctx.fillRect(ex + 8, by - 44, 4, 9);
            // Crown soul gem
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(ex - 1, by - 35, 2, 2);

            // Left Hand: Dread Soul Staff with pulsating spirit lantern
            ctx.fillStyle = '#292524';
            ctx.fillRect(ex - 27, by - 44, 5, 60);
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(ex - 30, by - 48, 11, 4);
            ctx.fillRect(ex - 29, by - 44, 9, 8);
            // Spirit flame inside lantern
            ctx.fillStyle = '#38BDF8';
            ctx.fillRect(ex - 28, by - 42, 7, 6);
            ctx.fillStyle = '#E0F2FE';
            ctx.fillRect(ex - 26, by - 40, 3, 3);

            // Right Hand: Skeletal claw casting floating necrotic sphere
            ctx.fillStyle = '#CBD5E1';
            ctx.fillRect(ex + 18, by - 6, 6, 4);
            const orbBob = Math.sin(now * 0.009) * 3;
            ctx.fillStyle = '#7C3AED';
            ctx.fillRect(ex + 20, by - 18 + orbBob, 8, 8);
            ctx.fillStyle = '#C084FC';
            ctx.fillRect(ex + 22, by - 16 + orbBob, 4, 4);
            ctx.fillStyle = '#A5F3FC';
            ctx.fillRect(ex + 23, by - 15 + orbBob, 2, 2);

            // 3 Orbiting Necrotic Soul Wisps
            for (let i = 0; i < 3; i++) {
              const ang = now * 0.003 + (i * Math.PI * 2) / 3;
              const wx = ex + Math.cos(ang) * 32;
              const wy = by + Math.sin(ang) * 16;
              ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
              ctx.fillRect(wx - 3, wy - 3, 6, 6);
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(wx - 1, wy - 1, 2, 2);
            }
          } else if (isEmber) {
            // ==============================================================
            // FLOOR 3 BOSS: Ignis, Cinder Sovereign (The Molten Magma Sovereign)
            // Hulking Volcanic Behemoth of cooled obsidian rock, pulsating
            // lava veins, sweeping demonic horns, blazing flame hair, and greataxe
            // ==============================================================
            const lavaThrob = 0.8 + Math.sin(now * 0.008) * 0.2;

            // Scorched ground lava reservoir
            ctx.fillStyle = 'rgba(234, 88, 12, 0.35)';
            ctx.beginPath();
            ctx.arc(ex, ey + 18, 38 * lavaThrob, 0, Math.PI * 2);
            ctx.fill();

            // Heavy Charred Basalt Torso
            ctx.fillStyle = '#18181B';
            ctx.fillRect(ex - 26, ey - 28 + walkBob, 52, 48);

            // Glowing Molten Lava Core Fissures
            ctx.fillStyle = '#B91C1C';
            ctx.fillRect(ex - 18, ey - 22 + walkBob, 36, 34);
            ctx.fillStyle = '#EA580C';
            ctx.fillRect(ex - 12, ey - 16 + walkBob, 24, 22);
            // Incandescent White-Hot Furnace Chest
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 6, ey - 10 + walkBob, 12, 10);

            // Branching glowing lava fissures across armor
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 24, ey - 8 + walkBob, 8, 3);
            ctx.fillRect(ex + 16, ey - 8 + walkBob, 8, 3);
            ctx.fillRect(ex - 16, ey + 8 + walkBob, 32, 4);
            ctx.fillRect(ex - 2, ey + 12 + walkBob, 4, 8);

            // Heavy Spiked Magma Pauldrons
            ctx.fillStyle = '#27272A';
            ctx.fillRect(ex - 32, ey - 28 + walkBob, 14, 18);
            ctx.fillRect(ex + 18, ey - 28 + walkBob, 14, 18);
            // Lava Shoulder Spikes
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 30, ey - 36 + walkBob, 4, 9);
            ctx.fillRect(ex + 26, ey - 36 + walkBob, 4, 9);

            // Charred Volcanic Demon Head
            ctx.fillStyle = '#18181B';
            ctx.fillRect(ex - 14, ey - 40 + walkBob, 28, 18);

            // Burning White-Hot Eyes & Molten Maw
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 9, ey - 34 + walkBob, 6, 4);
            ctx.fillRect(ex + 3, ey - 34 + walkBob, 6, 4);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(ex - 7, ey - 33 + walkBob, 2, 2);
            ctx.fillRect(ex + 5, ey - 33 + walkBob, 2, 2);
            // Fanged glowing fiery maw
            ctx.fillStyle = '#EA580C';
            ctx.fillRect(ex - 8, ey - 26 + walkBob, 16, 3);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 6, ey - 25 + walkBob, 2, 2);
            ctx.fillRect(ex + 4, ey - 25 + walkBob, 2, 2);

            // Sweeping Volcanic Demonic Horns
            ctx.fillStyle = '#27272A';
            // Left sweeping horn
            ctx.fillRect(ex - 22, ey - 48 + walkBob, 8, 12);
            ctx.fillRect(ex - 28, ey - 56 + walkBob, 8, 10);
            ctx.fillRect(ex - 34, ey - 62 + walkBob, 8, 8);
            // Right sweeping horn
            ctx.fillRect(ex + 14, ey - 48 + walkBob, 8, 12);
            ctx.fillRect(ex + 20, ey - 56 + walkBob, 8, 10);
            ctx.fillRect(ex + 26, ey - 62 + walkBob, 8, 8);
            // Incandescent red-hot horn tips
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 34, ey - 66 + walkBob, 4, 6);
            ctx.fillRect(ex + 30, ey - 66 + walkBob, 4, 6);

            // Flickering Flame Hair / Fire Crown
            const flame1 = Math.sin(now * 0.02) * 3;
            const flame2 = Math.cos(now * 0.025) * 3;
            ctx.fillStyle = '#DC2626';
            ctx.fillRect(ex - 10, ey - 50 + flame1 + walkBob, 20, 12);
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex - 8, ey - 54 + flame2 + walkBob, 16, 8);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 4, ey - 56 + flame1 + walkBob, 8, 5);

            // Colossal Molten Greataxe (Right Hand)
            ctx.fillStyle = '#3F3F46';
            ctx.fillRect(ex + 25, ey - 58 + walkBob, 6, 78);
            // Obsidian double axe blade
            ctx.fillStyle = '#18181B';
            ctx.fillRect(ex + 16, ey - 60 + walkBob, 24, 26);
            // Molten glowing axe cutting edges
            ctx.fillStyle = '#F97316';
            ctx.fillRect(ex + 14, ey - 58 + walkBob, 4, 22);
            ctx.fillRect(ex + 38, ey - 58 + walkBob, 4, 22);
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex + 14, ey - 52 + walkBob, 2, 10);
            ctx.fillRect(ex + 40, ey - 52 + walkBob, 2, 10);

            // Rising Fiery Cinder Embers
            for (let i = 0; i < 4; i++) {
              const sparkT = (now * 0.0016 + i * 0.25) % 1;
              const sx = ex - 24 + ((i * 19 + 7) % 48) + Math.sin(now * 0.01 + i) * 5;
              const sy = ey + 10 - sparkT * 64;
              const sz = sparkT > 0.7 ? 1 : 2;
              ctx.fillStyle = sparkT > 0.5 ? '#F97316' : '#FEF08A';
              ctx.fillRect(Math.round(sx), Math.round(sy), sz, sz);
            }
          } else {
            // ==============================================================
            // FLOOR 1 BOSS: Warden Malakor (Highkeep Bastion Warden Knight)
            // Heavy steel plate armor, red heraldic battle cape, winged helm,
            // gold lion crest, greatsword, and tower kite shield
            // ==============================================================
            // Red war cape draped behind
            ctx.fillStyle = '#881337';
            ctx.fillRect(ex - 24, ey - 18 + walkBob, 48, 42);
            ctx.fillStyle = '#BE123C';
            ctx.fillRect(ex - 20, ey - 14 + walkBob, 40, 36);

            // Heavy Steel Plate Torso & Armor
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 20, ey - 22 + walkBob, 40, 38);
            ctx.fillStyle = '#475569';
            ctx.fillRect(ex - 16, ey - 18 + walkBob, 32, 30);

            // Golden Highkeep Heraldry & Belt
            ctx.fillStyle = '#D97706';
            ctx.fillRect(ex - 12, ey - 2 + walkBob, 24, 6);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 4, ey - 10 + walkBob, 8, 8); // Lion chest emblem

            // Spiked Steel Pauldrons
            ctx.fillStyle = '#64748B';
            ctx.fillRect(ex - 26, ey - 24 + walkBob, 12, 14);
            ctx.fillRect(ex + 14, ey - 24 + walkBob, 12, 14);
            ctx.fillStyle = '#D97706';
            ctx.fillRect(ex - 24, ey - 22 + walkBob, 8, 3);
            ctx.fillRect(ex + 16, ey - 22 + walkBob, 8, 3);

            // Winged Great-Helm with Golden Wings
            ctx.fillStyle = '#334155';
            ctx.fillRect(ex - 14, ey - 36 + walkBob, 28, 18);
            // Golden Helm Wings / Crest
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 18, ey - 42 + walkBob, 6, 12);
            ctx.fillRect(ex - 3, ey - 44 + walkBob, 6, 10);
            ctx.fillRect(ex + 12, ey - 42 + walkBob, 6, 12);
            // Steel visor faceplate
            ctx.fillStyle = '#1E293B';
            ctx.fillRect(ex - 10, ey - 30 + walkBob, 20, 8);
            // Glowing Amber Visor Slits
            ctx.fillStyle = '#FEF08A';
            ctx.fillRect(ex - 8, ey - 28 + walkBob, 6, 3);
            ctx.fillRect(ex + 2, ey - 28 + walkBob, 6, 3);

            // Left Hand: Tower Kite Shield
            ctx.fillStyle = '#475569';
            ctx.fillRect(ex - 30, ey - 16 + walkBob, 14, 34);
            ctx.fillStyle = '#991B1B';
            ctx.fillRect(ex - 28, ey - 14 + walkBob, 10, 30);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex - 25, ey - 8 + walkBob, 4, 16);
            ctx.fillRect(ex - 27, ey - 2 + walkBob, 8, 4);

            // Right Hand: Heavy Broadsword
            ctx.fillStyle = '#64748B';
            ctx.fillRect(ex + 22, ey - 46 + walkBob, 7, 54);
            ctx.fillStyle = '#E2E8F0';
            ctx.fillRect(ex + 24, ey - 44 + walkBob, 3, 48);
            ctx.fillStyle = '#F59E0B';
            ctx.fillRect(ex + 17, ey - 8 + walkBob, 17, 5); // Crossguard
            ctx.fillStyle = '#D97706';
            ctx.fillRect(ex + 24, ey + 8 + walkBob, 3, 6); // Pommel
          }
        }

        if (en.markedMs > 0) {
          ctx.strokeStyle = '#FBBF24';
          ctx.lineWidth = 2;
          ctx.strokeRect(
            ex - en.radius - 3,
            ey - en.radius - 3,
            (en.radius + 3) * 2,
            (en.radius + 3) * 2
          );
        }

        const barW = en.kind === 'boss' ? 76 : 30;
        const hpRatio = Math.max(0, en.hp / Math.max(1, en.maxHp));
        const isCatacombs = map.biome === 'catacombs' || map.floor === 2;
        const isEmber = map.biome === 'ember' || map.floor >= 3;

        ctx.fillStyle = '#181820';
        ctx.fillRect(ex - barW / 2 - 1, ey - en.radius - 17, barW + 2, 6);
        ctx.fillStyle =
          en.kind === 'boss'
            ? isCatacombs
              ? '#A855F7'
              : isEmber
                ? '#F97316'
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
                : '#FCA5A5';
          ctx.fillText(
            en.enraged ? `🔥 ${en.name} [ENRAGED] 🔥` : en.name,
            ex,
            ey - en.radius - 21
          );

          // Enraged Fiery Pulsing Aura
          if (en.enraged) {
            ctx.save();
            const pulse = Math.sin(now * 0.015) * 3.5;
            ctx.strokeStyle = '#EF4444';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(ex, ey, en.radius + 5 + pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Rising rage fire embers
            for (let f = 0; f < 5; f++) {
              const fAngle = (f * Math.PI * 2) / 5 + now * 0.005;
              const fx = ex + Math.cos(fAngle) * (en.radius + 3);
              const fy = ey + Math.sin(fAngle) * (en.radius + 3) - Math.abs(Math.sin(now * 0.01 + f)) * 8;
              ctx.fillStyle = f % 2 === 0 ? '#EF4444' : '#F97316';
              ctx.beginPath();
              ctx.arc(fx, fy, 3, 0, Math.PI * 2);
              ctx.fill();
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
          }
        }

        // Active Status Badges beneath health bar
        const activeStatuses: { icon: string; color: string }[] = [];
        if ((en.burnedMs ?? 0) > 0) activeStatuses.push({ icon: '🔥', color: '#F97316' });
        if ((en.frozenMs ?? 0) > 0) activeStatuses.push({ icon: '❄️', color: '#38BDF8' });
        if ((en.shockedMs ?? 0) > 0) activeStatuses.push({ icon: '⚡', color: '#FBBF24' });
        if ((en.poisonedMs ?? 0) > 0) activeStatuses.push({ icon: '☣️', color: '#22C55E' });
        if ((en.bleedingMs ?? 0) > 0) activeStatuses.push({ icon: '🩸', color: '#EF4444' });
        if ((en.stunnedMs ?? 0) > 0) activeStatuses.push({ icon: '💫', color: '#EAB308' });

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
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(hx, hy, 52, 0, Math.PI * 2);
          ctx.stroke();

          if (p.reviveProgress > 0) {
            ctx.strokeStyle = '#4ADE80';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(
              hx,
              hy,
              52,
              -Math.PI / 2,
              -Math.PI / 2 + Math.PI * 2 * p.reviveProgress
            );
            ctx.stroke();
          }

          ctx.fillStyle = '#64748B';
          ctx.fillRect(hx - 12, hy - 5, 24, 12);
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.fillStyle = '#FCA5A5';
          ctx.textAlign = 'center';
          ctx.fillText(`${p.username} [DOWNED]`, hx, hy - 16);
          continue;
        }

        // Shadow beneath player
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(hx - 10, hy + 10, 20, 5);

        // Class-specific Ground VFX (e.g. Cleric holy aura)
        if (p.heroClass === 'cleric') {
          const haloPulse = Math.sin(now * 0.005) * 2;
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(hx, hy + 11, 16 + haloPulse, 6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Aim angle & facing direction
        const ang = p.id === playerId ? aimAngleRef.current : p.aimAngle;
        const facingLeft = Math.cos(ang) < 0;

        ctx.save();
        ctx.translate(hx, hy);
        ctx.scale(facingLeft ? -1 : 1, 1);

        const swingOffset = p.attackAnimMs > 0 ? Math.sin(p.attackAnimMs * 0.04) * 0.8 : 0;

        if (p.heroClass === 'vanguard') {
          // ==========================================
          // VANGUARD: Ironcrest Bastion (Heavy Knight)
          // ==========================================
          // Crimson battle cape fluttering behind
          ctx.fillStyle = '#7F1D1D';
          ctx.fillRect(-10, -5 + bob, 14, 15);
          ctx.fillStyle = '#991B1B';
          ctx.fillRect(-9, -4 + bob, 12, 13);

          // Steel plate legs & sabatons
          ctx.fillStyle = '#334155';
          ctx.fillRect(-7, 7 + bob, 5, 5);
          ctx.fillRect(1, 7 + bob, 5, 5);
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(-8, 10, 6, 2);
          ctx.fillRect(1, 10, 6, 2);

          // Polished Steel Cuirass & Golden Bastion Cross
          ctx.fillStyle = '#475569';
          ctx.fillRect(-8, -6 + bob, 16, 14);
          ctx.fillStyle = '#64748B';
          ctx.fillRect(-7, -5 + bob, 14, 12);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-2, -4 + bob, 4, 10);
          ctx.fillRect(-5, -2 + bob, 10, 3);

          // Heavy Winged Pauldrons
          ctx.fillStyle = '#94A3B8';
          ctx.fillRect(-10, -8 + bob, 4, 5);
          ctx.fillRect(6, -8 + bob, 4, 5);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-10, -9 + bob, 4, 1);
          ctx.fillRect(6, -9 + bob, 4, 1);

          // Steel Greathelm with cyan visor slit & waving red plume
          ctx.fillStyle = '#475569';
          ctx.fillRect(-7, -19 + bob, 14, 12);
          ctx.fillStyle = '#64748B';
          ctx.fillRect(-6, -18 + bob, 12, 10);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(-3, -14 + bob, 9, 3);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-1, -14 + bob, 6, 2);
          const plumeBob = Math.sin(now * 0.01) * 2;
          ctx.fillStyle = '#DC2626';
          ctx.fillRect(-3, -24 + bob, 4, 5);
          ctx.fillRect(-5 + plumeBob, -22 + bob, 3, 3);

          // Left Hand: Tower Kite Shield
          ctx.fillStyle = '#1E293B';
          ctx.fillRect(-13, -7 + bob, 5, 16);
          ctx.fillStyle = '#475569';
          ctx.fillRect(-12, -6 + bob, 3, 14);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-12, -2 + bob, 3, 6);

          // Right Hand: Sunforged Claymore
          ctx.save();
          ctx.translate(6, 2 + bob);
          ctx.rotate(0.3 + swingOffset);
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(0, -18, 3, 20);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, -17, 1, 18);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-3, 0, 9, 2);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(0, 2, 3, 4);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(0, 6, 3, 3);
          ctx.restore();

        } else if (p.heroClass === 'ranger') {
          // ==========================================
          // RANGER: Thornwood Marksman (Swift Scout)
          // ==========================================
          // Forest leaf-cut cloak
          ctx.fillStyle = '#142E1F';
          ctx.fillRect(-9, -5 + bob, 15, 15);
          ctx.fillStyle = '#1E3A29';
          ctx.fillRect(-8, -4 + bob, 13, 13);

          // Quiver with feather-fletched arrows on back
          ctx.fillStyle = '#78350F';
          ctx.fillRect(-11, -12 + bob, 4, 13);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-12, -16 + bob, 3, 4);
          ctx.fillRect(-10, -17 + bob, 3, 5);

          // Leather boots & legs
          ctx.fillStyle = '#271E15';
          ctx.fillRect(-6, 7 + bob, 5, 5);
          ctx.fillRect(1, 7 + bob, 5, 5);

          // Forest Green Brigandine & Bronze Buckles
          ctx.fillStyle = '#2D5A3C';
          ctx.fillRect(-7, -6 + bob, 14, 14);
          ctx.fillStyle = '#3F7A52';
          ctx.fillRect(-6, -5 + bob, 12, 11);
          ctx.fillStyle = '#D97706';
          ctx.fillRect(-6, -1 + bob, 12, 2);
          ctx.fillStyle = '#34D399';
          ctx.fillRect(-1, -3 + bob, 3, 3);

          // Deep Archer Hood & Keen Emerald Eyes
          ctx.fillStyle = '#1E3A29';
          ctx.fillRect(-7, -19 + bob, 14, 12);
          ctx.fillStyle = '#2D5A3C';
          ctx.fillRect(-6, -18 + bob, 12, 10);
          ctx.fillRect(-2, -21 + bob, 4, 3);
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(-4, -13 + bob, 9, 4);
          ctx.fillStyle = '#34D399';
          ctx.fillRect(0, -13 + bob, 3, 2);
          ctx.fillRect(4, -13 + bob, 2, 2);

          // Ashwood Recurve Bow in hand
          ctx.save();
          ctx.translate(8, 0 + bob);
          ctx.rotate(swingOffset);
          ctx.fillStyle = '#92400E';
          ctx.fillRect(2, -14, 3, 26);
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(5, -12, 1, 22);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(-6, -1, 10, 2);
          ctx.fillStyle = '#34D399';
          ctx.fillRect(3, -2, 3, 3);
          ctx.restore();

        } else if (p.heroClass === 'arcanist') {
          // ==========================================
          // ARCANIST: Astral Conduit (Cosmic Caster)
          // ==========================================
          // Midnight indigo layered robes & cyan trim
          ctx.fillStyle = '#1E1B4B';
          ctx.fillRect(-9, -5 + bob, 18, 17);
          ctx.fillStyle = '#312E81';
          ctx.fillRect(-8, -4 + bob, 16, 15);
          ctx.fillStyle = '#4338CA';
          ctx.fillRect(-6, -3 + bob, 12, 13);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-8, 9 + bob, 16, 2);
          ctx.fillRect(-2, 0 + bob, 4, 3);

          // Pointed Mystic Wizard Hat with curling tip
          ctx.fillStyle = '#1E1B4B';
          ctx.fillRect(-11, -14 + bob, 22, 3);
          ctx.fillStyle = '#312E81';
          ctx.fillRect(-7, -20 + bob, 14, 7);
          ctx.fillStyle = '#4338CA';
          ctx.fillRect(-4, -25 + bob, 8, 6);
          ctx.fillStyle = '#818CF8';
          ctx.fillRect(-2, -28 + bob, 4, 4);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-7, -16 + bob, 14, 2);

          // Mystic Face & Star Eyes
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(-5, -12 + bob, 10, 5);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-2, -11 + bob, 2, 2);
          ctx.fillRect(2, -11 + bob, 2, 2);

          // Runebound Spire Staff
          ctx.save();
          ctx.translate(9, -2 + bob);
          ctx.rotate(swingOffset);
          ctx.fillStyle = '#581C87';
          ctx.fillRect(0, -16, 3, 30);
          const crystalSpark = Math.sin(now * 0.01) * 2;
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-1, -21 + crystalSpark, 5, 5);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, -20 + crystalSpark, 3, 3);
          ctx.restore();

          // Orbiting Astral Orb
          const orbAngle = now * 0.005;
          const ox = Math.cos(orbAngle) * 15;
          const oy = Math.sin(orbAngle) * 7 + bob;
          ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
          ctx.fillRect(ox - 2, oy - 2, 5, 5);
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(ox - 1, oy - 1, 3, 3);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(ox, oy, 1, 1);

        } else {
          // ==========================================
          // CLERIC: Sunbrand Prelate (Radiant Healer)
          // ==========================================
          // Floating Sunburst Halo behind head
          const haloPulse = Math.sin(now * 0.006) * 1.5;
          ctx.fillStyle = 'rgba(253, 224, 71, 0.35)';
          ctx.fillRect(-11, -29 + bob + haloPulse, 22, 14);
          ctx.fillStyle = '#FACC15';
          ctx.fillRect(-9, -28 + bob + haloPulse, 18, 2);
          ctx.fillRect(-11, -26 + bob + haloPulse, 2, 10);
          ctx.fillRect(9, -26 + bob + haloPulse, 2, 10);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-1, -31 + bob + haloPulse, 3, 3);
          ctx.fillRect(-12, -28 + bob + haloPulse, 3, 3);
          ctx.fillRect(10, -28 + bob + haloPulse, 3, 3);

          // Ivory Ceremonial Tabard & Golden Sun Embroidery
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(-8, -6 + bob, 16, 17);
          ctx.fillStyle = '#F1F5F9';
          ctx.fillRect(-7, -5 + bob, 14, 15);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-3, -2 + bob, 6, 6);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-2, -1 + bob, 4, 4);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-7, 8 + bob, 14, 2);

          // Amber Ceremonial Cloak
          ctx.fillStyle = '#78350F';
          ctx.fillRect(-9, -6 + bob, 3, 14);
          ctx.fillRect(6, -6 + bob, 3, 14);

          // Winged Sun Mitre / Cowl
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(-7, -19 + bob, 14, 12);
          ctx.fillStyle = '#FDE047';
          ctx.fillRect(-8, -19 + bob, 16, 3);
          ctx.fillRect(-2, -21 + bob, 4, 3);

          // Face
          ctx.fillStyle = '#FCD34D';
          ctx.fillRect(-5, -13 + bob, 10, 5);
          ctx.fillStyle = '#78350F';
          ctx.fillRect(-2, -12 + bob, 2, 2);
          ctx.fillRect(2, -12 + bob, 2, 2);

          // Dawnstar Flanged War Mace
          ctx.save();
          ctx.translate(9, 0 + bob);
          ctx.rotate(0.2 + swingOffset);
          ctx.fillStyle = '#64748B';
          ctx.fillRect(0, -12, 3, 24);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(-3, -19, 9, 8);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-2, -18, 7, 6);
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(0, -21, 3, 3);
          ctx.fillRect(-5, -17, 3, 3);
          ctx.fillRect(5, -17, 3, 3);
          ctx.restore();
        }

        ctx.restore();

        // Protective Shield Bubble
        if (p.shield > 0) {
          ctx.strokeStyle = 'rgba(147, 197, 253, 0.75)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(hx, hy - 4, 20, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Username
        ctx.font = '600 11px "Plus Jakarta Sans", sans-serif';
        ctx.fillStyle = p.id === playerId ? '#FDE68A' : '#E2E8F0';
        ctx.textAlign = 'center';
        ctx.fillText(p.username, hx, hy - 32);

        // Health Bar
        const pBarW = 34;
        const pHpRatio = Math.max(0, p.hp / Math.max(1, p.maxHp));
        ctx.fillStyle = '#181820';
        ctx.fillRect(hx - pBarW / 2 - 1, hy - 27, pBarW + 2, 5);
        ctx.fillStyle = '#22C55E';
        ctx.fillRect(hx - pBarW / 2, hy - 26, Math.round(pBarW * pHpRatio), 3);
      }

      // Projectiles
      for (const proj of snap.projectiles) {
        ctx.save();
        ctx.translate(proj.x, proj.y);
        ctx.rotate(proj.angle);

        if (proj.style === 'slash') {
          ctx.strokeStyle = '#FDE68A';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, 18, -0.85, 0.85);
          ctx.stroke();
        } else if (proj.style === 'arrow') {
          ctx.fillStyle = '#E2B45A';
          ctx.fillRect(-8, -2, 16, 4);
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(5, -3, 5, 6);
        } else if (proj.style === 'arcane') {
          ctx.fillStyle = '#38BDF8';
          ctx.fillRect(-6, -6, 12, 12);
          ctx.fillStyle = '#E0F2FE';
          ctx.fillRect(-3, -3, 6, 6);
        } else if (proj.style === 'radiant') {
          ctx.fillStyle = '#FACC15';
          ctx.fillRect(-6, -4, 12, 8);
          ctx.fillStyle = '#FEF9C3';
          ctx.fillRect(-2, -2, 6, 4);
        } else if (proj.style === 'bone') {
          ctx.fillStyle = '#E2E8F0';
          ctx.fillRect(-6, -2, 12, 4);
        } else if (proj.style === 'voidorb') {
          ctx.fillStyle = '#A855F7';
          ctx.fillRect(-6, -6, 12, 12);
        } else {
          ctx.fillStyle = '#F97316';
          ctx.fillRect(-7, -7, 14, 14);
          ctx.fillStyle = '#FEF08A';
          ctx.fillRect(-3, -3, 6, 6);
        }

        ctx.restore();
      }

      // Floating Numbers & Critical Hit Animations
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        const age = now - ft.bornAt;
        const duration = ft.kind === 'ping' ? 2600 : ft.kind === 'crit' ? 1200 : 950;
        if (age >= duration) {
          floatingTexts.splice(i, 1);
          continue;
        }
        const t = age / duration;
        const alpha = Math.max(0, 1 - t * t);
        const floatY = ft.y - t * (ft.kind === 'ping' ? 20 : ft.kind === 'crit' ? 36 : 28);

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
          ctx.fillText(`⚡ ${ft.text}!`, 1, 1);
          ctx.fillStyle = '#FEF08A';
          ctx.fillText(`⚡ ${ft.text}!`, 0, 0);
        } else if (ft.kind === 'status') {
          // Styled Status Badge
          ctx.translate(ft.x, floatY);
          ctx.font = '700 11px "JetBrains Mono", monospace';
          const textW = ctx.measureText(ft.text).width;
          ctx.fillStyle = 'rgba(17, 18, 25, 0.85)';
          ctx.fillRect(-textW / 2 - 6, -11, textW + 12, 14);
          ctx.strokeStyle = ft.color;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(-textW / 2 - 6, -11, textW + 12, 14);

          ctx.textAlign = 'center';
          ctx.fillStyle = ft.color;
          ctx.fillText(ft.text, 0, 0);
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

      ctx.restore();

      // Corner Minimap
      const isMobileScreen = cw < 640;
      const mmScale = isMobileScreen ? 2 : 3;
      const mmW = map.width * mmScale;
      const mmH = map.height * mmScale;
      const mmX = cw - mmW - (isMobileScreen ? 12 : 20);
      const mmY = isMobileScreen ? 58 : 74;

      ctx.fillStyle = 'rgba(20, 20, 28, 0.85)';
      ctx.fillRect(mmX - 4, mmY - 4, mmW + 8, mmH + 8);
      ctx.strokeStyle = '#38364A';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(mmX - 4, mmY - 4, mmW + 8, mmH + 8);

      const flagMap = new Map(
        snap.roomClearedFlags.map((f) => [f.id, f])
      );

      for (const room of map.rooms) {
        const flags = flagMap.get(room.id);
        const discovered = flags ? flags.discovered : room.discovered;
        const cleared = flags ? flags.cleared : room.cleared;
        if (!discovered && room.type !== 'boss') continue;

        ctx.fillStyle =
          room.type === 'boss'
            ? '#991B1B'
            : room.type === 'treasure'
              ? '#B45309'
              : room.type === 'shrine'
                ? '#065F46'
                : cleared
                  ? '#475569'
                  : '#6366F1';
        ctx.fillRect(
          mmX + room.x * mmScale,
          mmY + room.y * mmScale,
          room.w * mmScale,
          room.h * mmScale
        );
      }

      for (const p of snap.players) {
        ctx.fillStyle = p.id === playerId ? '#FACC15' : '#38BDF8';
        ctx.fillRect(
          mmX + Math.floor(p.x / TILE_SIZE) * mmScale - 1,
          mmY + Math.floor(p.y / TILE_SIZE) * mmScale - 1,
          isMobileScreen ? 3 : 4,
          isMobileScreen ? 3 : 4
        );
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [latestSnapshotRef, map, playerId]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    mouseScreenRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    mouseScreenRef.current = { x: e.clientX, y: e.clientY };
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
      }
      onSendKeyboardInput({ ...keysRef.current, aimAngle: aimAngleRef.current });
    } else if (e.button === 2) {
      e.preventDefault();
      sfx.playSkill('tactical');
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
