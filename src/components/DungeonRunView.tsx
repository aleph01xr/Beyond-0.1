import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  RELIC_CATALOG,
  type ChatMessage,
  type DifficultyTier,
  type DungeonMap,
  type GameSnapshot,
  type HeroClassId,
  type PlayerInputState,
  type RoomSummary,
} from '../shared/types.ts';
import { ExpeditionGateModal } from './ExpeditionGateModal.tsx';
import { GameCanvas } from './GameCanvas.tsx';
import {
  TouchControls,
  loadSavedTouchSettings,
  saveTouchSettings,
  type TouchSettings,
} from './TouchControls.tsx';
import { TouchSettingsModal } from './TouchSettingsModal.tsx';

interface DungeonRunViewProps {
  playerId: string;
  map: DungeonMap;
  snapshot: GameSnapshot;
  latestSnapshotRef: React.MutableRefObject<GameSnapshot | null>;
  chatMessages: ChatMessage[];
  onSendInput: (input: PlayerInputState) => void;
  onTriggerAction: (
    action: 'tactical' | 'ult' | 'potion' | 'interact',
    aimAngle: number
  ) => void;
  onSelectRelic: (relicId: string) => void;
  onChangeClass: (heroClass: HeroClassId) => void;
  onSendPing: (label: string, x: number, y: number) => void;
  onSendChat: (text: string) => void;
  onRestartRun: () => void;
  onLeaveRoom: () => void;
  pingMs?: number;
  onCreateRoom?: (opts: {
    name: string;
    difficulty: DifficultyTier;
    seed?: number;
    heroClass: HeroClassId;
  }) => void;
  onJoinRoom?: (roomId: string, heroClass: HeroClassId) => void;
  onReturnToTavern?: () => void;
  rooms?: RoomSummary[];
}

export const DungeonRunView: React.FC<DungeonRunViewProps> = ({
  playerId,
  map,
  snapshot,
  latestSnapshotRef,
  chatMessages,
  onSendInput,
  onTriggerAction,
  onSelectRelic,
  onChangeClass,
  onSendPing,
  onSendChat,
  onRestartRun,
  onLeaveRoom,
  pingMs = 18,
  onCreateRoom,
  onJoinRoom,
  onReturnToTavern,
  rooms = [],
}) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [chatFocused, setChatFocused] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [expeditionGateOpen, setExpeditionGateOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => sfx.isMuted());

  // Touch settings & visibility
  const [touchSettings, setTouchSettings] = useState<TouchSettings>(() => loadSavedTouchSettings());
  const [touchSettingsOpen, setTouchSettingsOpen] = useState(false);
  const [forceTouchGamepad, setForceTouchGamepad] = useState<boolean>(() => {
    try {
      return localStorage.getItem('beyond_force_touch') === 'true';
    } catch {
      return false;
    }
  });

  // Detect touch device or allow explicit toggle
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  useEffect(() => {
    const checkTouch = () => {
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        setIsTouchDevice(true);
      }
    };
    window.addEventListener('touchstart', checkTouch, { once: true });
    return () => window.removeEventListener('touchstart', checkTouch);
  }, []);

  // Tavern Ambience & Medieval Music when playing inside Floor 0 (Tavern Hub)
  useEffect(() => {
    const isTavernFloor = map.floor === 0 || snapshot.floor === 0;
    if (isTavernFloor) {
      sfx.unlockAudio();
      sfx.startTavernAmbience();

      const handleTavernClick = () => {
        sfx.unlockAudio();
        sfx.startTavernAmbience();
      };
      window.addEventListener('pointerdown', handleTavernClick, { once: true });
      window.addEventListener('keydown', handleTavernClick, { once: true });

      return () => {
        window.removeEventListener('pointerdown', handleTavernClick);
        window.removeEventListener('keydown', handleTavernClick);
        sfx.stopTavernAmbience();
      };
    } else {
      sfx.stopTavernAmbience();
    }
  }, [map.floor, snapshot.floor]);

  const handleUpdateTouchSettings = (newSettings: TouchSettings) => {
    setTouchSettings(newSettings);
    saveTouchSettings(newSettings);
  };

  const handleToggleForceGamepad = (forced: boolean) => {
    setForceTouchGamepad(forced);
    try {
      localStorage.setItem('beyond_force_touch', String(forced));
    } catch {
      // ignore
    }
  };

  const me =
    snapshot.players.find((p) => p.id === playerId) || snapshot.players[0];
  const boss = snapshot.enemies.find((e) => e.kind === 'boss');

  const isTavern = map.floor === 0 || snapshot.floor === 0;
  const nearPortal = Boolean(
    me && Math.hypot(map.portalPos.x - me.x, map.portalPos.y - me.y) <= 80
  );

  // Check if player is near any chest, shrine, NPC, or portal
  const nearInteractable = Boolean(
    me &&
      (nearPortal ||
        snapshot.props.some(
          (pr) => !pr.opened && Math.hypot(pr.x - me.x, pr.y - me.y) <= 64
        ) ||
        snapshot.npcs?.some(
          (n) => Math.hypot(n.x - me.x, n.y - me.y) <= 68
        ) ||
        snapshot.trainingDummies?.some(
          (d) => Math.hypot(d.x - me.x, d.y - me.y) <= 72
        ) ||
        (snapshot.bossDefeated &&
          Math.hypot(map.portalPos.x - me.x, map.portalPos.y - me.y) <= 68))
  );

  const handleTriggerActionWithPortal = (
    action: 'tactical' | 'ult' | 'potion' | 'interact',
    aimAngle: number
  ) => {
    if (action === 'interact' && isTavern && nearPortal) {
      sfx.playUiClick();
      setExpeditionGateOpen(true);
      return;
    }
    onTriggerAction(action, aimAngle);
  };

  const handleCopyCode = () => {
    sfx.playUiClick();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(snapshot.roomId).catch(() => {});
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    onSendChat(chatDraft.trim());
    setChatDraft('');
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const myDef = me ? HERO_CLASSES[me.heroClass] : HERO_CLASSES.vanguard;
  const tacSec = me ? Math.ceil(me.skillCooldownMs / 1000) : 0;
  const ultSec = me ? Math.ceil(me.ultCooldownMs / 1000) : 0;

  // Unified input state ref - prevents keyboard and touch inputs from clobbering each other
  const unifiedInputRef = useRef<PlayerInputState>({
    up: false,
    down: false,
    left: false,
    right: false,
    attack: false,
    aimAngle: 0,
    stickX: 0,
    stickY: 0,
  });

  // Touch gamepad handlers
  const handleStickMove = (stickX: number, stickY: number, aimAngle?: number) => {
    const cur = unifiedInputRef.current;
    cur.stickX = stickX;
    cur.stickY = stickY;
    cur.up = stickY < -0.25;
    cur.down = stickY > 0.25;
    cur.left = stickX < -0.25;
    cur.right = stickX > 0.25;
    if (typeof aimAngle === 'number') {
      cur.aimAngle = aimAngle;
    }
    onSendInput({ ...cur });
  };

  const handleAttackPress = (pressed: boolean, aimAngle?: number) => {
    const cur = unifiedInputRef.current;
    cur.attack = pressed;
    if (typeof aimAngle === 'number') {
      cur.aimAngle = aimAngle;
    }
    onSendInput({ ...cur });
  };

  // Keyboard input handler from GameCanvas
  const handleKeyboardInput = (keys: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    attack: boolean;
    aimAngle: number;
  }) => {
    const cur = unifiedInputRef.current;
    const stickMagnitude = Math.hypot(cur.stickX || 0, cur.stickY || 0);
    // If touch joystick is not currently held, keyboard controls the movement
    if (stickMagnitude < 0.1) {
      cur.up = keys.up;
      cur.down = keys.down;
      cur.left = keys.left;
      cur.right = keys.right;
      cur.stickX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      cur.stickY = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    }
    cur.attack = keys.attack;
    cur.aimAngle = keys.aimAngle;
    onSendInput({ ...cur });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#111219] touch-none">
      {/* 60 FPS Pixel-Art Canvas */}
      <GameCanvas
        playerId={playerId}
        map={map}
        latestSnapshotRef={latestSnapshotRef}
        onSendKeyboardInput={handleKeyboardInput}
        onTriggerAction={handleTriggerActionWithPortal}
        onSendPing={onSendPing}
        chatFocused={chatFocused}
      />

      {/* Top Header HUD */}
      <header className="pointer-events-none fixed top-0 inset-x-0 z-10 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3 bg-gradient-to-b from-[#111219]/90 to-transparent">
        {/* Left: Floor, Biome, Seed */}
        <div className="pointer-events-auto flex items-center gap-2 text-xs sm:text-sm font-mono tabular-nums text-[#D4D2E0]">
          {isTavern ? (
            <>
              <span className="font-display text-sm sm:text-base text-[#FCD34D] font-bold whitespace-nowrap flex items-center gap-1.5">
                <span>🍺</span> Sanctuary Tavern
              </span>
              <span aria-hidden="true" className="text-[#78768A]">·</span>
              <span className="text-emerald-400 font-semibold">Social Hub</span>
              <span aria-hidden="true" className="hidden sm:inline text-[#78768A]">·</span>
              <span className="hidden sm:inline text-[#BDBACF]">
                {snapshot.players.length} {snapshot.players.length === 1 ? 'Adventurer' : 'Adventurers'}
              </span>
            </>
          ) : (
            <>
              <span className="font-display text-sm sm:text-base text-white font-semibold whitespace-nowrap truncate max-w-[150px] sm:max-w-none">
                Floor {snapshot.floor}: {map.biomeTitle.split(' ')[0]}
              </span>
              <span aria-hidden="true" className="text-[#78768A]">·</span>
              <span className="hidden sm:inline">{snapshot.difficulty}</span>
              <span aria-hidden="true" className="hidden sm:inline text-[#78768A]">·</span>
              <span>{formatTime(snapshot.elapsedSec)}</span>
            </>
          )}
        </div>

        {/* Right: Room Code, Ping, Chat & Menu */}
        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5">
          {/* Quick Expedition Gate Access inside Tavern */}
          {isTavern && (
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setExpeditionGateOpen(true);
              }}
              className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-gradient-to-r from-[#854D0E] to-[#A16207] hover:from-[#A16207] hover:to-[#CA8A04] border border-[#FACC15]/60 text-xs font-display font-semibold text-white transition-all shadow-md whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] flex items-center gap-1.5 animate-pulse"
              title="Open Expedition Gate (Embark or Join Party)"
            >
              <span>⚔️</span>
              <span className="hidden sm:inline">Expedition Gate</span>
              <span className="sm:hidden">Gate</span>
            </button>
          )}

          {/* Latency / Ping Monitor */}
          <div
            className="pointer-events-auto hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1E1E2A]/95 border border-[#38364C] font-mono text-xs text-[#E6E4EE] min-h-[36px]"
            title="Connection Latency (Ping)"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                pingMs < 80
                  ? 'bg-emerald-400'
                  : pingMs < 180
                    ? 'bg-amber-400'
                    : 'bg-rose-500 animate-pulse'
              }`}
            />
            <span>{pingMs}ms</span>
          </div>

          <button
            type="button"
            onClick={handleCopyCode}
            title={isTavern ? 'Copy Tavern Room Code' : 'Copy Party Code'}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-[#1E1E2A]/95 border border-[#38364C] hover:border-[#D9AA52] font-mono text-xs text-[#F3F2F8] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] flex items-center"
          >
            {copiedCode ? 'Copied!' : isTavern ? 'TAVERN-HUB' : snapshot.roomId}
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setChatOpen((v) => !v);
            }}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-[#1E1E2A]/95 border border-[#38364C] hover:border-[#6E6C88] text-xs font-medium text-[#E6E4EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] flex items-center"
          >
            Chat ({chatMessages.length})
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setTouchSettingsOpen(true);
            }}
            title="Configure Joystick & Touch Controls"
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-[#1E1E2A]/95 border border-[#38364C] hover:border-[#D9AA52] text-xs font-medium text-[#E6E4EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] flex items-center gap-1"
          >
            <span className="text-[#F4D378] text-[11px]">⚙️</span>
            <span>Touch</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const nextMuted = sfx.toggleMute();
              setIsMuted(nextMuted);
              if (!nextMuted) sfx.playUiClick('confirm');
            }}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-[#1E1E2A]/95 border border-[#38364C] hover:border-[#D9AA52] text-xs font-medium text-[#E6E4EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] flex items-center gap-1"
          >
            <span>{isMuted ? '🔇' : '🔊'}</span>
            <span className="hidden sm:inline">{isMuted ? 'Muted' : 'SFX'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setPauseOpen((v) => !v);
            }}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 bg-[#1E1E2A]/95 border border-[#38364C] hover:border-[#6E6C88] text-xs font-medium text-[#E6E4EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[36px] flex items-center"
          >
            Menu
          </button>
        </div>
      </header>

      {/* Boss Health Bar */}
      {boss && (() => {
        const isCatacombs = map.biome === 'catacombs' || snapshot.floor === 2;
        const isEmber = map.biome === 'ember' || snapshot.floor >= 3;
        const hpPct = Math.max(0, Math.min(100, (boss.hp / Math.max(1, boss.maxHp)) * 100));

        const theme = isCatacombs
          ? {
              border: 'border-[#7C3AED]',
              bg: 'bg-[#221338]/95',
              barTrack: 'bg-[#281742]',
              barFill: 'bg-gradient-to-r from-[#7C3AED] via-[#A855F7] to-[#22D3EE]',
              titleColor: 'text-[#DDD6FE]',
              badge: 'ANCIENT ARCHLICH',
              badgeColor: 'text-[#67E8F9] border-[#0891B2]',
            }
          : isEmber
            ? {
                border: 'border-[#EA580C]',
                bg: 'bg-[#2B1410]/95',
                barTrack: 'bg-[#3A1810]',
                barFill: 'bg-gradient-to-r from-[#DC2626] via-[#EA580C] to-[#FACC15]',
                titleColor: 'text-[#FED7AA]',
                badge: 'CINDER SOVEREIGN',
                badgeColor: 'text-[#FEF08A] border-[#D97706]',
              }
            : {
                border: 'border-[#6E2932]',
                bg: 'bg-[#191822]/95',
                barTrack: 'bg-[#2A171B]',
                barFill: 'bg-[#DC2626]',
                titleColor: 'text-[#FCA5A5]',
                badge: 'WARDEN KNIGHT',
                badgeColor: 'text-[#FDE68A] border-[#B45309]',
              };

        return (
          <div
            className={`pointer-events-none fixed top-12 sm:top-14 left-1/2 -translate-x-1/2 z-10 w-[min(410px,92vw)] ${theme.bg} border ${theme.border} px-3 py-1.5 sm:px-4 sm:py-2 shadow-2xl backdrop-blur-xs`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums mb-1">
              <div className="flex items-center gap-1.5 truncate">
                <span className={`font-display text-xs sm:text-sm font-semibold truncate ${theme.titleColor}`}>
                  {boss.name}
                </span>
                {boss.enraged ? (
                  <span className="text-[9px] px-1.5 py-0.2 bg-[#7F1D1D] text-[#FECACA] border border-[#DC2626] font-mono tracking-wider animate-pulse">
                    🔥 ENRAGED
                  </span>
                ) : (
                  <span
                    className={`text-[9px] px-1 py-0.2 border font-mono tracking-wider shrink-0 hidden sm:inline ${theme.badgeColor}`}
                  >
                    {theme.badge}
                  </span>
                )}
              </div>
              <span className="text-[#FECACA] text-[11px] sm:text-xs shrink-0 font-medium">
                HP {boss.hp}/{boss.maxHp}
              </span>
            </div>
            <div className={`w-full h-2 sm:h-2.5 ${theme.barTrack} overflow-hidden`}>
              <div
                style={{ width: `${hpPct}%` }}
                className={`h-full ${theme.barFill} transition-all duration-150`}
              />
            </div>
            {/* Boss Resistances & Tenacity */}
            <div className="flex items-center justify-between text-[9px] font-mono text-[#D4D2E0] mt-1 pt-0.5 border-t border-white/10">
              <span className="text-[#C084FC]">Tenacity {Math.round((boss.resistances?.tenacity ?? 0.55) * 100)}%</span>
              <span className="text-[#CBD5E1]">Armor {Math.round((boss.resistances?.physical ?? 0.25) * 100)}%</span>
              <span className="text-[#FBBF24]">Floor {snapshot.floor} Guardian</span>
            </div>
          </div>
        );
      })()}

      {/* Left Co-op Party Stack */}
      <aside className="pointer-events-none fixed top-14 sm:top-16 left-3 sm:left-5 z-10 space-y-1.5 sm:space-y-2 w-44 sm:w-56">
        {snapshot.players.map((p) => {
          const cDef = HERO_CLASSES[p.heroClass];
          const hpPct = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
          return (
            <div
              key={p.id}
              className="bg-[#1A1A24]/90 border border-[#323044] px-2.5 py-1.5 sm:px-3 sm:py-2 space-y-1"
            >
              <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs">
                <span className="font-display text-xs sm:text-sm text-white truncate">
                  {p.username} {p.id === playerId ? '(You)' : ''}
                </span>
                <span className="font-mono text-[10px] text-[#B3B1C4] tabular-nums whitespace-nowrap">
                  {cDef.name}
                </span>
              </div>

              <div className="w-full h-1.5 sm:h-2 bg-[#2B2A38] overflow-hidden">
                <div
                  style={{ width: `${hpPct}%` }}
                  className={`h-full ${
                    p.downed
                      ? 'bg-[#64748B]'
                      : hpPct <= 30
                        ? 'bg-[#EF4444]'
                        : 'bg-[#22C55E]'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono tabular-nums text-[#C9C7D8]">
                <span>
                  HP {p.hp}/{p.maxHp}
                  {p.shield > 0 ? ` (+${p.shield})` : ''}
                </span>
                <span>{p.downed ? 'DOWN' : `${Math.round(hpPct)}%`}</span>
              </div>
            </div>
          );
        })}
      </aside>

      {/* MOBILE ON-SCREEN TOUCH GAMEPAD (Virtual Joystick + Action Cluster) */}
      {me && (isTouchDevice || forceTouchGamepad) && (
        <TouchControls
          player={me}
          enemies={snapshot.enemies}
          nearInteractable={nearInteractable}
          onStickMove={handleStickMove}
          onAttackPress={handleAttackPress}
          onTriggerAction={handleTriggerActionWithPortal}
          onSendPing={onSendPing}
          settings={touchSettings}
          onOpenSettings={() => setTouchSettingsOpen(true)}
        />
      )}

      {/* DESKTOP KEYBOARD / MOUSE ACTION BAR (Visible when touch gamepad is not active or on wide screens) */}
      {me && !(isTouchDevice || forceTouchGamepad) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-10 hidden sm:flex items-center justify-center gap-2 px-4 py-2 bg-[#1B1B26]/95 border border-[#38364C]">
          <div className="px-3 py-1.5 bg-[#252433] border border-[#3C3A52] text-left min-w-[100px]">
            <div className="text-[10px] font-mono text-[#9E9CAE]">[LMB / Space]</div>
            <div className="font-display text-sm text-white whitespace-nowrap">
              Attack
            </div>
          </div>

          <button
            type="button"
            onClick={() => onTriggerAction('tactical', me.aimAngle)}
            className={`px-3 py-1.5 border text-left min-w-[120px] transition-colors cursor-pointer ${
              tacSec > 0
                ? 'bg-[#1D1C28] border-[#2E2D3E] text-[#7D7B8E]'
                : 'bg-[#282738] border-[#595678] hover:border-[#D9AA52] text-white'
            }`}
          >
            <div className="flex justify-between text-[10px] font-mono tabular-nums">
              <span>[Q / RMB]</span>
              <span>{tacSec > 0 ? `${tacSec}s` : 'READY'}</span>
            </div>
            <div className="font-display text-sm whitespace-nowrap">
              {myDef.tacticalName}
            </div>
          </button>

          <button
            type="button"
            onClick={() => onTriggerAction('ult', me.aimAngle)}
            className={`px-3 py-1.5 border text-left min-w-[120px] transition-colors cursor-pointer ${
              ultSec > 0
                ? 'bg-[#1D1C28] border-[#2E2D3E] text-[#7D7B8E]'
                : 'bg-[#2C2836] border-[#8A6D3B] hover:border-[#F4D378] text-[#FDE68A]'
            }`}
          >
            <div className="flex justify-between text-[10px] font-mono tabular-nums">
              <span>[R / Shift]</span>
              <span>{ultSec > 0 ? `${ultSec}s` : 'READY'}</span>
            </div>
            <div className="font-display text-sm whitespace-nowrap">
              {myDef.ultName}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playHeal();
              onTriggerAction('potion', me.aimAngle);
            }}
            className="px-3 py-1.5 bg-[#281E24] border border-[#6E3642] hover:border-[#F87171] text-left cursor-pointer"
          >
            <div className="text-[10px] font-mono tabular-nums text-[#FCA5A5]">
              [H] Flasks: {me.potions}
            </div>
            <div className="font-display text-sm text-white whitespace-nowrap">
              Heal
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              handleTriggerActionWithPortal('interact', me.aimAngle);
            }}
            className={`px-3 py-1.5 border text-left cursor-pointer transition-colors ${
              isTavern && nearPortal
                ? 'bg-[#854D0E] border-[#FACC15] text-[#FEF08A] animate-pulse'
                : 'bg-[#232832] border-[#44566C] hover:border-[#93C5FD]'
            }`}
          >
            <div className="text-[10px] font-mono text-[#BAE6FD]">
              {isTavern && nearPortal ? '🌀 Portal' : '[E] Action'}
            </div>
            <div className="font-display text-sm text-white whitespace-nowrap">
              {isTavern && nearPortal ? 'Expedition Gate' : 'Interact'}
            </div>
          </button>

          <div className="px-3 py-1 font-mono text-xs tabular-nums text-[#E5E3F0]">
            <div className="text-[#F4D378]">{me.gold} Gold</div>
            <div className="text-[#A5A3B8]">{me.relics.length} Relics</div>
          </div>
        </div>
      )}

      {/* Party Chat Drawer */}
      {chatOpen && (
        <section className="fixed bottom-24 right-4 sm:right-6 z-30 w-72 sm:w-80 bg-[#1B1B26]/96 border border-[#38364C] flex flex-col shadow-2xl">
          <div className="px-3 py-2 border-b border-[#2D2C3D] flex items-center justify-between">
            <span className="font-display text-sm text-white">Party Chat</span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="text-xs text-[#9E9CAE] hover:text-white cursor-pointer min-h-[36px] flex items-center px-2"
            >
              Close
            </button>
          </div>
          <div className="h-40 overflow-y-auto p-2.5 space-y-1.5 text-xs">
            {chatMessages.map((m) => (
              <div key={m.id} className="leading-snug">
                <span
                  className={`font-semibold ${
                    m.system ? 'text-[#D9AA52]' : 'text-[#93C5FD]'
                  }`}
                >
                  {m.sender}:
                </span>{' '}
                <span className="text-[#E6E4EE]">{m.text}</span>
              </div>
            ))}
          </div>
          <form
            onSubmit={handleChatSubmit}
            className="p-2 border-t border-[#2D2C3D] flex gap-1.5"
          >
            <input
              type="text"
              value={chatDraft}
              onFocus={() => setChatFocused(true)}
              onBlur={() => setChatFocused(false)}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Party message..."
              maxLength={140}
              className="flex-1 px-2.5 py-1.5 bg-[#13131B] border border-[#323044] text-xs text-white focus:outline-none focus:border-[#D9AA52]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#313044] hover:bg-[#413F59] text-xs font-semibold text-white cursor-pointer whitespace-nowrap min-h-[36px]"
            >
              Send
            </button>
          </form>
        </section>
      )}

      {/* Relic Draft Modal */}
      {me && me.pendingRelicChoices.length > 0 && snapshot.status === 'playing' && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="stone-panel max-w-xl w-full p-5 sm:p-7 space-y-5 my-auto">
            <div className="text-center space-y-1">
              <h2 className="font-display text-xl sm:text-2xl text-white">
                Choose an Ancient Relic
              </h2>
              <p className="text-xs sm:text-sm text-[#D0CEDB]">
                Select one permanent boon for your party expedition.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {me.pendingRelicChoices.map((rid) => {
                const relic = RELIC_CATALOG.find((r) => r.id === rid);
                if (!relic) return null;
                return (
                  <button
                    key={rid}
                    type="button"
                    onClick={() => {
                      sfx.playRelicChime();
                      onSelectRelic(rid);
                    }}
                    className="p-3.5 bg-[#3B3944] hover:bg-[#474553] border-2 border-[#2B2933] hover:border-[#F4D378] text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer min-h-[110px]"
                  >
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono text-[#BDBBC9]">
                        {relic.category}
                      </div>
                      <div
                        style={{ color: relic.accent }}
                        className="font-display text-base font-semibold"
                      >
                        {relic.name}
                      </div>
                      <p className="text-xs text-[#E8E6F2] leading-relaxed">
                        {relic.summary}
                      </p>
                    </div>
                    <span className="font-display text-xs text-white underline">
                      Claim
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Menu / Settings */}
      {pauseOpen && snapshot.status === 'playing' && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4">
          <div className="stone-panel max-w-md w-full p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl text-white">Expedition Menu</h2>
              <button
                type="button"
                onClick={() => setPauseOpen(false)}
                className="text-xs text-[#D4D2DC] hover:text-white cursor-pointer min-h-[36px] flex items-center px-2"
              >
                Resume
              </button>
            </div>

            {/* Touchpad Toggle for testing or preference */}
            <div className="flex items-center justify-between p-3 bg-[#33313D] border border-[#2B2933]">
              <span className="text-xs text-[#E2E0EC]">Touch Gamepad:</span>
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick('toggle');
                  setIsTouchDevice((v) => !v);
                }}
                className="px-3 py-1 bg-[#474554] border border-[#5E5C6E] text-xs font-mono text-white cursor-pointer min-h-[36px]"
              >
                {isTouchDevice ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            {/* Audio SFX Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#33313D] border border-[#2B2933]">
              <span className="text-xs text-[#E2E0EC]">Sound Effects (SFX):</span>
              <button
                type="button"
                onClick={() => {
                  const nextMuted = sfx.toggleMute();
                  setIsMuted(nextMuted);
                  if (!nextMuted) sfx.playUiClick('confirm');
                }}
                className={`px-3 py-1 border text-xs font-mono cursor-pointer min-h-[36px] flex items-center gap-1.5 ${
                  isMuted
                    ? 'bg-[#3D2528] border-[#8C3A44] text-[#FECACA]'
                    : 'bg-[#293B33] border-[#4E8B67] text-[#D1FAE5]'
                }`}
              >
                <span>{isMuted ? '🔇 MUTED' : '🔊 ACTIVE'}</span>
              </button>
            </div>

            {/* Account Class Locked Soul Oath */}
            <div className="p-3.5 bg-[#201F2B] border border-[#3A384C] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-display text-white font-semibold flex items-center gap-1.5">
                  <span>🔒</span> Soul Oath (Class Locked)
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#FCD34D] px-1.5 py-0.5 bg-[#171622] border border-[#3E3C50]">
                  {myDef.roleBadge}
                </span>
              </div>
              <p className="text-xs text-[#E2E0EE]">
                Bonded as <strong className="text-white">{myDef.name}</strong> · {myDef.title}
              </p>
              <p className="text-[11px] text-[#A6A4B6] leading-relaxed">
                <span className="text-[#FBBF24] font-semibold">{myDef.passiveName}:</span> {myDef.passiveDesc}
              </p>
              <p className="text-[10.5px] text-[#787687] font-mono pt-0.5">
                Each account is permanently locked to 1 class.
              </p>
            </div>

            {/* Active Character Resistances */}
            {(() => {
              const baseRes = myDef.resistances;
              const hasCarapace = me?.relics.includes('runic_carapace');
              const hasThorned = me?.relics.includes('thorned_aegis');
              const phys = Math.round((baseRes.physical + (hasCarapace ? 0.15 : 0) + (hasThorned ? 0.10 : 0)) * 100);
              const fire = Math.round((baseRes.fire + (hasCarapace ? 0.20 : 0)) * 100);
              const frost = Math.round((baseRes.frost + (hasCarapace ? 0.20 : 0)) * 100);
              const shock = Math.round((baseRes.lightning + (hasCarapace ? 0.20 : 0)) * 100);
              const poison = Math.round((baseRes.poison + (hasCarapace ? 0.20 : 0)) * 100);
              const bleed = Math.round((baseRes.bleed + (hasCarapace ? 0.20 : 0)) * 100);

              return (
                <div className="p-3 bg-[#201F2B] border border-[#3A384C] space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#D9AA52] font-semibold flex items-center gap-1">
                      <span>🛡️</span> Active Resistances
                    </span>
                    <span className="text-[10px] text-[#8E8C9E]">Damage Mitigation</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[10.5px] font-mono text-center">
                    <div className="p-1.5 bg-[#171622] border border-[#2B293A]">
                      <div className="text-[#94A3B8]">Physical</div>
                      <div className="text-white font-bold">+{phys}%</div>
                    </div>
                    <div className="p-1.5 bg-[#171622] border border-[#2B293A]">
                      <div className="text-[#F97316]">🔥 Fire</div>
                      <div className="text-white font-bold">+{fire}%</div>
                    </div>
                    <div className="p-1.5 bg-[#171622] border border-[#2B293A]">
                      <div className="text-[#38BDF8]">❄️ Frost</div>
                      <div className="text-white font-bold">+{frost}%</div>
                    </div>
                    <div className="p-1.5 bg-[#171622] border border-[#2B293A]">
                      <div className="text-[#FBBF24]">⚡ Shock</div>
                      <div className="text-white font-bold">+{shock}%</div>
                    </div>
                    <div className="p-1.5 bg-[#171622] border border-[#2B293A]">
                      <div className="text-[#22C55E]">☣️ Poison</div>
                      <div className="text-white font-bold">+{poison}%</div>
                    </div>
                    <div className="p-1.5 bg-[#171622] border border-[#2B293A]">
                      <div className="text-[#EF4444]">🩸 Bleed</div>
                      <div className="text-white font-bold">+{bleed}%</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setTouchSettingsOpen(true);
                }}
                className="py-2.5 bg-[#292837] hover:bg-[#363548] border border-[#49475D] font-display text-sm text-[#F3F2F8] cursor-pointer whitespace-nowrap min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <span>⚙️</span>
                <span>Touch Controls Setup</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setPauseOpen(false);
                }}
                className="stone-button py-2.5 font-display text-sm text-white cursor-pointer whitespace-nowrap min-h-[44px] flex items-center justify-center"
              >
                {isTavern ? 'Resume Tavern Exploration' : 'Return to Combat'}
              </button>
              {!isTavern && (
                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    setPauseOpen(false);
                    if (onReturnToTavern) {
                      onReturnToTavern();
                    } else if (onJoinRoom) {
                      onJoinRoom('TAVERN-HUB', me.heroClass);
                    }
                  }}
                  className="py-2.5 bg-[#1F2937] hover:bg-[#2E3B4E] border border-[#38BDF8] font-display text-sm text-[#7DD3FC] cursor-pointer whitespace-nowrap min-h-[44px] flex items-center justify-center gap-1.5 shadow"
                >
                  <span>🍺</span>
                  <span>Return to Tavern Hub</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  onLeaveRoom();
                }}
                className="py-2 bg-[#3D2429] hover:bg-[#522E35] border border-[#8E3B46] font-display text-sm text-[#FECACA] cursor-pointer whitespace-nowrap min-h-[44px] flex items-center justify-center"
              >
                {isTavern ? 'Exit to Lobby' : 'Leave Party & Return to Lobby'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animated CSS Sprite NPC Dialogue Banner */}
      {(() => {
        const speakingNpc = snapshot.npcs?.find((n) => (n.speakingMs ?? 0) > 0);
        if (!speakingNpc) return null;
        const isBram = speakingNpc.id === 'npc_bram';
        const isLena = speakingNpc.id === 'npc_lena';
        const avatarEmoji = isBram ? '🍺' : isLena ? '🍻' : '⚔️';
        const roleLabel = isBram
          ? 'Innkeeper & Host'
          : isLena
            ? 'Meadmaster & Strategist'
            : 'Mercenary Commander';

        return (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-xl w-[92vw] sm:w-full p-4 sm:p-5 bg-[#1B1A24]/95 border-2 border-[#D9AA52] shadow-2xl flex items-start gap-4 transition-all">
            <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded bg-[#2D231C] border border-[#D9AA52] flex items-center justify-center text-2xl sm:text-3xl relative overflow-hidden shadow-inner">
              <span className="animate-bounce">{avatarEmoji}</span>
              <span className="absolute bottom-0 inset-x-0 h-1.5 bg-[#FCD34D] animate-ping" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm sm:text-base text-[#FCD34D] flex items-center gap-1.5">
                  {speakingNpc.name}
                  <span className="text-xs font-mono text-[#BDBACF] font-normal">
                    · {roleLabel}
                  </span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-[#D9AA52]/20 text-[#FDE68A] border border-[#D9AA52]/40 animate-pulse">
                  SPEAKING
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#F1F5F9] font-sans leading-relaxed italic">
                "{speakingNpc.dialogue}"
              </p>
            </div>
          </div>
        );
      })()}

      {/* Victory / Defeat Modal */}
      {(snapshot.status === 'victory' || snapshot.status === 'defeat') && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="stone-panel max-w-lg w-full p-5 sm:p-7 space-y-5 my-auto">
            <div className="text-center space-y-1">
              <h2
                className={`font-display text-2xl sm:text-3xl font-bold ${
                  snapshot.status === 'victory'
                    ? 'text-[#FDE68A]'
                    : 'text-[#FCA5A5]'
                }`}
              >
                {snapshot.status === 'victory'
                  ? 'Victory — Beyond Reclaimed!'
                  : 'Expedition Fallen'}
              </h2>
              <p className="text-xs sm:text-sm text-[#D6D4E2] font-mono tabular-nums">
                Floor {snapshot.floor} · {snapshot.difficulty} · Seed {snapshot.seed} · {formatTime(snapshot.elapsedSec)}
              </p>
            </div>

            <div className="divide-y divide-[#43414E] border border-[#353442] bg-[#3B3942]">
              {snapshot.players.map((p) => (
                <div
                  key={p.id}
                  className="px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-2 text-xs sm:text-sm font-mono tabular-nums"
                >
                  <div className="truncate">
                    <span className="font-display text-sm sm:text-base text-white">
                      {p.username}
                    </span>{' '}
                    <span className="text-[#B8B6C6]">
                      · Lv.{p.level} {HERO_CLASSES[p.heroClass].name}
                    </span>
                  </div>
                  <div className="text-[#E6E4F0] whitespace-nowrap text-right">
                    {p.kills} Kills · {p.revives} Revives
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  onRestartRun();
                }}
                className="stone-button px-5 py-2 font-display text-base text-white cursor-pointer whitespace-nowrap min-h-[44px] flex items-center"
              >
                Play Again
              </button>
              {!isTavern && (
                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    if (onReturnToTavern) {
                      onReturnToTavern();
                    } else if (onJoinRoom) {
                      onJoinRoom('TAVERN-HUB', me.heroClass);
                    }
                  }}
                  className="px-4 py-2 bg-[#1E293B] hover:bg-[#334155] border-2 border-[#38BDF8] font-display text-sm text-[#7DD3FC] cursor-pointer whitespace-nowrap min-h-[44px] flex items-center gap-1.5 shadow"
                >
                  <span>🍺</span>
                  <span>Return to Tavern</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  onLeaveRoom();
                }}
                className="px-4 py-2 bg-[#3B3942] hover:bg-[#494752] border-2 border-[#2D2B34] font-display text-sm text-[#E6E4F0] cursor-pointer whitespace-nowrap min-h-[44px] flex items-center"
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Prompt near Portal in Tavern */}
      {isTavern && nearPortal && !expeditionGateOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 px-4 py-2 bg-[#1A1926]/95 border-2 border-[#38BDF8] shadow-2xl backdrop-blur-sm animate-bounce">
          <span className="font-display font-bold text-xs sm:text-sm text-[#7DD3FC] flex items-center gap-1.5">
            🌀 Ancient Expedition Portal
          </span>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setExpeditionGateOpen(true);
            }}
            className="px-3 py-1 bg-[#0284C7] hover:bg-[#0369A1] font-display text-xs font-semibold text-white border border-[#38BDF8] cursor-pointer"
          >
            [E] Open Gate
          </button>
        </div>
      )}

      {/* Expedition Gate Modal */}
      {expeditionGateOpen && (
        <ExpeditionGateModal
          userHeroClass={me.heroClass}
          defaultHostName={me.username}
          rooms={rooms}
          onCreateExpedition={(opts) => {
            if (onCreateRoom) {
              onCreateRoom(opts);
            }
          }}
          onJoinExpedition={(targetRoomId, heroClass) => {
            if (onJoinRoom) {
              onJoinRoom(targetRoomId, heroClass);
            }
          }}
          onClose={() => setExpeditionGateOpen(false)}
        />
      )}

      {/* Touch Controls Setup Modal */}
      {touchSettingsOpen && (
        <TouchSettingsModal
          settings={touchSettings}
          forceTouchGamepad={forceTouchGamepad}
          onUpdateSettings={handleUpdateTouchSettings}
          onToggleForceGamepad={handleToggleForceGamepad}
          onClose={() => setTouchSettingsOpen(false)}
        />
      )}
    </div>
  );
};
