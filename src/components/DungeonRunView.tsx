import React, { useCallback, useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import { getMinecraftObfuscatedString } from '../client/dungeonDecorations.ts';

export const MinecraftObfuscatedText: React.FC<{ length?: number; className?: string }> = ({
  length = 12,
  className = '',
}) => {
  const [text, setText] = useState(() => getMinecraftObfuscatedString(length));

  useEffect(() => {
    const interval = setInterval(() => {
      setText(getMinecraftObfuscatedString(length, Date.now()));
    }, 50);
    return () => clearInterval(interval);
  }, [length]);

  return <span className={`font-mono tracking-widest text-[#FCD34D] drop-shadow ${className}`}>{text}</span>;
};
import { AdminPanel } from './AdminPanel.tsx';
import { ExpeditionGateModal } from './ExpeditionGateModal.tsx';
import { GameCanvas } from './GameCanvas.tsx';
import {
  TouchControls,
  loadSavedTouchSettings,
  saveTouchSettings,
  type TouchSettings,
} from './TouchControls.tsx';
import { TouchSettingsModal } from './TouchSettingsModal.tsx';
import { useFullscreenState } from '../client/fullscreen.ts';
import { CharacterInventoryModal } from './CharacterInventoryModal.tsx';
import { ExpandedMapModal } from './ExpandedMapModal.tsx';
import { CinematicIntroOverlay } from './CinematicIntroOverlay.tsx';
import { GameMenuModal } from './GameMenuModal.tsx';
import { calculatePlayerStatProjections } from '../shared/statUtils.ts';
import {
  HERO_CLASSES,
  MAX_ATTRIBUTE,
  MAX_LEVEL,
  RELIC_CATALOG,
  type ChatMessage,
  type ClientMessage,
  type DifficultyTier,
  type DungeonMap,
  type GameSnapshot,
  type HeroClassId,
  type PlayerInputState,
  type RoomSummary,
} from '../shared/types.ts';

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
  onSendAdminCommand?: (msg: ClientMessage) => void;
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
  onSendAdminCommand,
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
  const [attributesModalOpen, setAttributesModalOpen] = useState(false);
  const [inventoryModalOpen, setInventoryModalOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<'stats' | 'audio' | 'touch'>('stats');
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [expandedMapOpen, setExpandedMapOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(() => sfx.isMuted());
  const [isFullscreen, toggleFullscreen] = useFullscreenState();

  // Cinematic Chapter & Floor Introductions
  const [cinematicIntro, setCinematicIntro] = useState<{
    floor: number;
    biomeTitle: string;
    isInitialChapterEntry: boolean;
  } | null>(null);

  const lastSeenFloorRef = useRef<number>(-1);
  const hasSeenChapter1Ref = useRef<boolean>(false);

  const currentFloor = snapshot.floor !== undefined ? snapshot.floor : map.floor;

  useEffect(() => {
    if (currentFloor === 0) {
      // In Tavern Hub: reset chapter 1 seen flag
      hasSeenChapter1Ref.current = false;
      lastSeenFloorRef.current = 0;
      setCinematicIntro(null);
      return;
    }

    if (currentFloor === 1 && !hasSeenChapter1Ref.current) {
      hasSeenChapter1Ref.current = true;
      lastSeenFloorRef.current = 1;
      setCinematicIntro({
        floor: 1,
        biomeTitle: map.biomeTitle || 'Highkeep Outer Bailey',
        isInitialChapterEntry: true,
      });
    } else if (currentFloor > 1 && currentFloor !== lastSeenFloorRef.current) {
      lastSeenFloorRef.current = currentFloor;
      setCinematicIntro({
        floor: currentFloor,
        biomeTitle: map.biomeTitle || `Floor ${currentFloor}`,
        isInitialChapterEntry: false,
      });
    }
  }, [currentFloor, map.biomeTitle]);

  const handleDismissIntro = useCallback(() => {
    setCinematicIntro(null);
  }, []);

  // Hotkeys [I] for Inventory & [M] for Map
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        sfx.playUiClick();
        setInventoryModalOpen((v) => !v);
      }
      if (e.key === 'm' || e.key === 'M') {
        sfx.playUiClick();
        setExpandedMapOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
                <span></span> Sanctuary Tavern
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
              <span className="font-display text-xs sm:text-base text-white font-semibold flex flex-wrap sm:flex-nowrap items-center gap-1.5 leading-tight">
                <span>Floor {snapshot.floor}:</span>
                <span className="truncate max-w-[140px] sm:max-w-none">{map.biomeTitle}</span>
              </span>
              <span aria-hidden="true" className="text-[#78768A]">·</span>
              <span className="text-[#FCD34D] font-mono text-xs font-bold">
                {me?.level >= MAX_LEVEL ? 'MAX LEVEL' : `Lv. ${me?.level || 1}`}
              </span>
              <span aria-hidden="true" className="text-[#78768A]">·</span>
              <span className="hidden sm:inline">{snapshot.difficulty}</span>
              <span aria-hidden="true" className="hidden sm:inline text-[#78768A]">·</span>
              <span>{formatTime(snapshot.elapsedSec)}</span>
            </>
          )}
        </div>

        {/* Right: Organized HUD Action Bar & Utilities */}
        <div className="pointer-events-auto flex items-center gap-2 overflow-x-auto custom-scrollbar max-w-[70vw] md:max-w-[80vw] lg:max-w-none shrink-0 py-1 font-mono">
          
          {/* Quick Expedition Gate Access inside Tavern */}
          {isTavern && (
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setExpeditionGateOpen(true);
              }}
              className="stone-button stone-button-gold text-[10px] sm:text-xs animate-pulse"
              title="Open Expedition Gate (Embark or Join Party)"
            >
              <span className="hidden sm:inline">Expedition Gate</span>
              <span className="sm:hidden">Gate</span>
            </button>
          )}

          {/* Group 1: Primary Gameplay Quick Shortcuts ([M] Map, [I] Inventory, [P] Attributes, Chat) */}
          <div className="flex items-center gap-1.5 bg-[#171622]/90 p-1 border border-[#353442]">
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setExpandedMapOpen(true);
              }}
              className="stone-button stone-button-gold text-[10px] sm:text-xs py-1 px-2.5"
              title="Open Expanded Tactical Map [M]"
            >
              [M] Map
            </button>

            {me && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    setInventoryModalOpen(true);
                  }}
                  className="stone-button stone-button-dark text-[10px] sm:text-xs relative flex items-center gap-1 py-1 px-2.5"
                  title="Open Advanced Inventory & Character Sheet [I]"
                >
                  <span>[I] Inventory</span>
                  {me.relics && me.relics.length > 0 && (
                    <span className="bg-[#252336] px-1 py-0.2 border border-[#353442] text-[#FCD34D] text-[9px] font-mono font-bold">
                      {me.relics.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    setAttributesModalOpen(true);
                  }}
                  className="stone-button stone-button-gold text-[10px] sm:text-xs relative py-1 px-2.5"
                  title="Open Stat Allocation Panel"
                >
                  <span>[P] Attributes</span>
                  {me.attributePoints > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 px-1 py-0.2 bg-[#FACC15] text-black font-mono text-[9px] font-bold rounded-full animate-pulse border border-[#854D0E] shadow">
                      {me.attributePoints}
                    </span>
                  )}
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setChatOpen((v) => !v);
              }}
              className="stone-button stone-button-dark text-[10px] sm:text-xs py-1 px-2.5"
            >
              Chat ({chatMessages.length})
            </button>
          </div>

          {/* Group 2: System Utilities & Session Menu */}
          <div className="flex items-center gap-1.5 bg-[#171622]/90 p-1 border border-[#353442]">
            {/* Latency / Ping Monitor */}
            <div
              className="hidden sm:flex items-center gap-1 px-2 py-1 bg-[#1E1E2A] border border-[#353442] text-[10px] text-[#E6E4EE]"
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
              className="stone-button stone-button-dark text-[10px] py-1 px-2"
            >
              {copiedCode ? 'Copied!' : isTavern ? 'TAVERN' : snapshot.roomId}
            </button>

            <button
              type="button"
              onClick={() => {
                const nextMuted = sfx.toggleMute();
                setIsMuted(nextMuted);
                if (!nextMuted) sfx.playUiClick('confirm');
              }}
              title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
              className="stone-button stone-button-dark text-[10px] py-1 px-2"
            >
              {isMuted ? 'Muted' : 'SFX'}
            </button>

            {/* Exclusive Developer Admin Menu Button */}
            {me && (me.isAdmin || me.username.toLowerCase() === 'admin' || me.username.toLowerCase() === 'aleph') && (
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setAdminPanelOpen(true);
                }}
                className="stone-button stone-button-gold text-[10px] py-1 px-2 border-amber-400 text-amber-900 animate-pulse font-bold"
                title="Open Exclusive Admin Control Console"
              >
                ADMIN
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setPauseOpen((v) => !v);
              }}
              className="stone-button stone-button-gold text-[10px] sm:text-xs py-1 px-3 text-black font-bold"
              title="Open Master Sanctuary Menu [Esc]"
            >
              Menu [Esc]
            </button>
          </div>

        </div>
      </header>

      {/* Boss Health Bar (Only visible when near boss or engaged in combat) */}
      {boss && me && (boss.hp < boss.maxHp || Math.hypot(boss.x - me.x, boss.y - me.y) <= 480) && (() => {
        const isCatacombs = map.biome === 'catacombs' || snapshot.floor === 2;
        const isEmber = map.biome === 'ember' || snapshot.floor === 3;
        const isVoid = map.biome === 'void' || snapshot.floor === 4;
        const isAstral = map.biome === 'astral' || snapshot.floor === 5;
        const isHymns = map.biome === 'hymns' || snapshot.floor === 6;
        const isReliquary = map.biome === 'reliquary' || snapshot.floor === 7;
        const isScripture = map.biome === 'scripture' || snapshot.floor === 8;
        const isNave = map.biome === 'nave' || snapshot.floor === 9;
        const isWardenGate = map.biome === 'wardengate' || snapshot.floor === 10;
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
            : isVoid
              ? {
                  border: 'border-[#9333EA]',
                  bg: 'bg-[#180B28]/95',
                  barTrack: 'bg-[#2B1242]',
                  barFill: 'bg-gradient-to-r from-[#581C87] via-[#9333EA] to-[#F43F5E]',
                  titleColor: 'text-[#F0ABFC]',
                  badge: 'ABYSSAL VOID LORD',
                  badgeColor: 'text-[#FDA4AF] border-[#E11D48]',
                }
              : isAstral
                ? {
                    border: 'border-[#0EA5E9]',
                    bg: 'bg-[#0B1A30]/95',
                    barTrack: 'bg-[#142A4A]',
                    barFill: 'bg-gradient-to-r from-[#0284C7] via-[#38BDF8] to-[#FDE047]',
                    titleColor: 'text-[#BAE6FD]',
                    badge: 'CELESTIAL TITAN',
                    badgeColor: 'text-[#FEF08A] border-[#EAB308]',
                  }
                : isHymns
                  ? {
                      border: 'border-[#F59E0B]',
                      bg: 'bg-[#241D12]/95',
                      barTrack: 'bg-[#382C18]',
                      barFill: 'bg-gradient-to-r from-[#D97706] via-[#FBBF24] to-[#FFFBEB]',
                      titleColor: 'text-[#FEF08A]',
                      badge: 'SACRED CHOIR KEEPER',
                      badgeColor: 'text-[#FEF08A] border-[#D97706]',
                    }
                  : isReliquary
                    ? {
                        border: 'border-[#D9AA52]',
                        bg: 'bg-[#211E16]/95',
                        barTrack: 'bg-[#332D1F]',
                        barFill: 'bg-gradient-to-r from-[#B45309] via-[#D9AA52] to-[#FEF08A]',
                        titleColor: 'text-[#FDE68A]',
                        badge: 'RELIQUARY WARDEN',
                        badgeColor: 'text-[#FDE68A] border-[#D9AA52]',
                      }
                    : isScripture
                      ? {
                          border: 'border-[#E11D48]',
                          bg: 'bg-[#241018]/95',
                          barTrack: 'bg-[#381622]',
                          barFill: 'bg-gradient-to-r from-[#BE123C] via-[#FB7185] to-[#C084FC]',
                          titleColor: 'text-[#FECDD3]',
                          badge: 'SCRIPTURE WARDEN',
                          badgeColor: 'text-[#FECDD3] border-[#E11D48]',
                        }
                      : isNave
                        ? {
                            border: 'border-[#EAB308]',
                            bg: 'bg-[#24231A]/95',
                            barTrack: 'bg-[#363422]',
                            barFill: 'bg-gradient-to-r from-[#CA8A04] via-[#FACC15] to-[#FFFFFF]',
                            titleColor: 'text-[#FEF08A]',
                            badge: 'FINAL SEAL SENTINEL',
                            badgeColor: 'text-[#FEF08A] border-[#EAB308]',
                          }
                        : isWardenGate
                          ? {
                              border: 'border-[#F59E0B]',
                              bg: 'bg-[#261E14]/95',
                              barTrack: 'bg-[#3A2D1B]',
                              barFill: 'bg-gradient-to-r from-[#D97706] via-[#FBBF24] to-[#FFFBEB]',
                              titleColor: 'text-[#FEF08A]',
                              badge: 'THE LAST WARDEN',
                              badgeColor: 'text-[#FEF08A] border-[#F59E0B]',
                            }
                          : {
                              border: 'border-[#6E2932]',
                              bg: 'bg-[#191822]/95',
                              barTrack: 'bg-[#2A171B]',
                              barFill: 'bg-[#DC2626]',
                              titleColor: 'text-[#FCA5A5]',
                              badge: 'HIGHKEEP WARDEN',
                              badgeColor: 'text-[#FDE68A] border-[#B45309]',
                            };

        return (
          <div
            className={`pointer-events-none fixed top-12 sm:top-14 left-1/2 -translate-x-1/2 z-10 w-[min(460px,95vw)] ${theme.bg} border ${theme.border} px-3 py-1.5 sm:px-4 sm:py-2 shadow-2xl backdrop-blur-xs`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums mb-1">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className={`font-display text-xs sm:text-sm font-semibold truncate ${theme.titleColor}`}>
                  {boss.name}
                </span>
                {boss.enraged ? (
                  <span className="text-[9px] px-1.5 py-0.2 bg-[#7F1D1D] text-[#FECACA] border border-[#DC2626] font-mono tracking-wider animate-pulse">
                     ENRAGED
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

      {/* Collapsible Co-op Party Dropdown Menu */}
      <div className="pointer-events-auto fixed top-12 sm:top-14 left-3 sm:left-5 z-20">
        <button
          type="button"
          onClick={() => {
            sfx.playUiClick();
            setPartyOpen((v) => !v);
          }}
          className="px-2.5 py-1.5 bg-[#1A1A24]/95 border border-[#38364C] hover:border-[#D9AA52] font-mono text-xs text-[#E6E4EE] transition-colors whitespace-nowrap shadow-md flex items-center gap-1.5 cursor-pointer min-h-[36px]"
          title="Toggle Party Members List"
        >
          <span>Party ({snapshot.players.length})</span>
          <span className="text-[10px] text-[#FCD34D]">{partyOpen ? '▴' : '▾'}</span>
        </button>

        {partyOpen && (
          <aside className="mt-1.5 space-y-1.5 w-48 sm:w-56 max-h-[50vh] overflow-y-auto custom-scrollbar bg-[#1A1A24]/95 border border-[#323044] p-2 shadow-2xl animate-in fade-in duration-150">
            {snapshot.players.map((p) => {
              const cDef = HERO_CLASSES[p.heroClass];
              const hpPct = Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100));
              return (
                <div
                  key={p.id}
                  className="bg-[#242332] border border-[#3E3C50] px-2 py-1.5 space-y-1"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs">
                    <span className="font-display text-xs text-white truncate">
                      {p.username} {p.id === playerId ? '(You)' : ''}
                    </span>
                    <span className="font-mono text-[9px] text-[#B3B1C4] tabular-nums whitespace-nowrap">
                      {cDef.name}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-[#171622] overflow-hidden">
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

                  <div className="flex items-center justify-between text-[10px] font-mono tabular-nums text-[#C9C7D8]">
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
        )}
      </div>

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
            className={`stone-button stone-button-dark flex-col items-start min-w-[120px] h-auto py-1.5 ${
              tacSec > 0 ? 'opacity-50 grayscale' : ''
            }`}
          >
            <div className="flex justify-between w-full text-[10px] font-mono tabular-nums opacity-80">
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
            className={`stone-button flex-col items-start min-w-[120px] h-auto py-1.5 ${
              ultSec > 0 ? 'stone-button-dark opacity-50 grayscale' : 'stone-button-gold shadow-[0_0_15px_rgba(251,191,36,0.2)]'
            }`}
          >
            <div className="flex justify-between w-full text-[10px] font-mono tabular-nums opacity-80">
              <span>[R / Shift]</span>
              <span>{ultSec > 0 ? `${ultSec}s` : 'READY'}</span>
            </div>
            <div className="font-display text-sm whitespace-nowrap">
              {myDef.ultName}
            </div>
          </button>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => {
                sfx.playHeal();
                onTriggerAction('potion', me.aimAngle);
              }}
              className="stone-button stone-button-red flex-col items-start h-auto py-1.5 min-w-[100px]"
            >
              <div className="text-[10px] font-mono tabular-nums opacity-80">
                [H] Flasks: {me.potions}
              </div>
              <div className="font-display text-sm whitespace-nowrap">
                Heal
              </div>
            </button>
            {/* Status Indicators Bar */}
            <div className="flex gap-1 h-6 items-center justify-center">
              {me.statuses && me.statuses.map(s => {
                const colors: Record<string, string> = {
                  guard_broken: 'bg-blue-500',
                  frostbite: 'bg-cyan-400',
                  scorched: 'bg-orange-600',
                  voidmarked: 'bg-purple-600',
                  disoriented: 'bg-indigo-400',
                  charmed: 'bg-amber-300',
                  ashen_curse: 'bg-gray-500',
                  silenced: 'bg-fuchsia-600',
                  impaled: 'bg-yellow-500',
                  condemned: 'bg-red-500',
                };
                const labels: Record<string, string> = {
                  guard_broken: 'BRK',
                  frostbite: 'FRZ',
                  scorched: 'BRN',
                  voidmarked: 'VOID',
                  disoriented: 'DIS',
                  charmed: 'CHM',
                  ashen_curse: 'CRS',
                  silenced: 'SIL',
                  impaled: 'IMP',
                  condemned: 'CON',
                };
                return (
                  <div key={s.id} className={`px-1.5 py-0.5 rounded-sm border border-white/20 shadow-sm flex items-center gap-1 ${colors[s.type] || 'bg-slate-500'}`}>
                    <span className="text-[9px] font-bold text-white leading-none">{labels[s.type] || 'ST'}</span>
                    <div className="w-6 h-1 bg-black/40 rounded-full overflow-hidden">
                      <div className="h-full bg-white/80" style={{ width: `${(s.durationMs / s.maxDurationMs) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              handleTriggerActionWithPortal('interact', me.aimAngle);
            }}
            className={`stone-button flex-col h-auto py-2 ${
              isTavern && nearPortal ? 'stone-button-gold animate-pulse' : 'stone-button-dark'
            }`}
          >
            <div className="text-[10px] font-mono opacity-80">
              {isTavern && nearPortal ? 'Portal' : '[E] Action'}
            </div>
            <div className="font-display text-sm whitespace-nowrap">
              {isTavern && nearPortal ? 'Expedition Gate' : 'Interact'}
            </div>
          </button>

          <div className="px-3 py-1 font-mono text-xs tabular-nums text-[#E5E3F0] space-y-1">
            <div className="text-[#F4D378]">{me.gold} Gold</div>
            <div className="text-[#A5A3B8]">{me.relics.length} Relics</div>
            <div className="w-24 h-2 bg-[#12111A] border border-[#3C3A52] relative overflow-hidden">
              {me.level >= MAX_LEVEL ? (
                <div className="absolute inset-0 bg-[#FCD34D] text-[#181820] text-[7px] font-bold flex items-center justify-center">
                  MAX LEVEL
                </div>
              ) : (
                <div 
                  className="h-full bg-gradient-to-r from-[#D9AA52] to-[#FDE68A]" 
                  style={{ width: `${Math.min(100, (me.xp / Math.max(1, me.nextXp)) * 100)}%` }} 
                />
              )}
            </div>
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
                    className="stone-button stone-button-dark h-auto flex-col items-start p-4 text-left gap-3 border-2 border-transparent hover:border-[#F4D378] ring-1 ring-[#38364C]"
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
                    <span className="font-display text-xs text-white underline mt-auto">
                      Claim Relic
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Unified Master Game Menu Modal */}
      {pauseOpen && snapshot.status === 'playing' && me && (
        <GameMenuModal
          player={me}
          mapBiome={map.biomeTitle}
          isTavern={isTavern}
          onClose={() => setPauseOpen(false)}
          onOpenInventory={() => setInventoryModalOpen(true)}
          onOpenAttributes={() => setAttributesModalOpen(true)}
          onOpenMap={() => setExpandedMapOpen(true)}
          onOpenTouchSettings={() => setTouchSettingsOpen(true)}
          onOpenAdminPanel={() => setAdminPanelOpen(true)}
          onReturnToTavern={() => {
            if (onReturnToTavern) {
              onReturnToTavern();
            } else if (onJoinRoom) {
              onJoinRoom('TAVERN-HUB', me.heroClass);
            }
          }}
          onLeaveRoom={onLeaveRoom}
          isAdmin={Boolean(me.isAdmin || me.username.toLowerCase() === 'admin' || me.username.toLowerCase() === 'aleph')}
        />
      )}

      {/* Animated CSS Sprite NPC Dialogue Banner */}
      {(() => {
        const speakingNpc = snapshot.npcs?.find((n) => (n.speakingMs ?? 0) > 0);
        if (!speakingNpc) return null;
        const isBram = speakingNpc.id === 'npc_bram';
        const isLena = speakingNpc.id === 'npc_lena';
        const isAleph = speakingNpc.id === 'npc_aleph';
        const isGate = speakingNpc.id === 'npc_warden_gate' || speakingNpc.name.includes('Gate');
        const avatarTag = isBram ? '[HOST]' : isLena ? '[BREWER]' : isAleph ? '[MYSTIC]' : isGate ? '[GATE]' : '[NPC]';
        const roleLabel = isBram
          ? 'Innkeeper & Host'
          : isLena
            ? 'Meadmaster & Strategist'
            : isAleph
              ? 'Mysterious Cloaked Figure'
              : isGate
                ? 'Sanctuary Monument'
                : 'Mercenary Commander';

        const handlePickOption = (optionId: string) => {
          sfx.playUiClick('confirm');
          if (optionId === 'reset_stats') {
            onSendAdminCommand?.({ type: 'player:reset_attributes' });
          } else if (optionId === 'goodbye') {
            onSendAdminCommand?.({ type: 'player:dialogue_close' });
          } else {
            onSendAdminCommand?.({ type: 'player:dialogue_pick', optionId });
          }
        };

        return (
          <div className="stone-panel max-w-xl w-[92vw] sm:w-full p-4 sm:p-5 flex items-start gap-4 transition-all animate-in slide-in-from-bottom-4 duration-300">
            <div className="stone-plaque w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center font-mono font-bold text-xs text-[#FCD34D] relative overflow-hidden shadow-inner">
              <span className="animate-pulse">{avatarTag}</span>
              <span className="absolute bottom-0 inset-x-0 h-1.5 bg-[#FCD34D] animate-ping" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-sm sm:text-base text-[#FCD34D] flex items-center gap-1.5">
                  {speakingNpc.name}
                  <span className="text-xs font-mono text-[#BDBACF] font-normal">
                    · {roleLabel}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // We can't easily set speakingMs to 0 from client without a message,
                    // but we can at least stop showing it locally if we had local state.
                    // For now, let's just use the 'Close' button if available.
                  }}
                  className="text-[10px] font-mono px-2 py-0.5 bg-[#D9AA52]/20 text-[#FDE68A] border border-[#D9AA52]/40 animate-pulse"
                >
                  {speakingNpc.speakingMs && speakingNpc.speakingMs > 6000 ? 'INTERACTIVE' : 'SPEAKING'}
                </button>
              </div>
              <p className="text-xs sm:text-sm text-[#F1F5F9] font-sans leading-relaxed italic">
                "{speakingNpc.dialogue}"
              </p>

              {speakingNpc.options && speakingNpc.options.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10 mt-2">
                  {speakingNpc.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handlePickOption(opt.id)}
                      className="stone-button stone-button-gold text-[10px] sm:text-xs py-1.5 px-3 min-h-0"
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      onSendAdminCommand?.({ type: 'player:dialogue_close' });
                    }}
                    className="stone-button stone-button-dark text-[10px] sm:text-xs py-1.5 px-3 min-h-0"
                  >
                    Goodbye
                  </button>
                </div>
              )}
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
                className="stone-button stone-button-gold px-8 py-3 text-lg"
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
                  className="stone-button stone-button-blue px-6 py-3"
                >
                  Return to Tavern
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  onLeaveRoom();
                }}
                className="stone-button stone-button-dark px-6 py-3"
              >
                Exit to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Prompt near Portal in Tavern */}
      {isTavern && nearPortal && !expeditionGateOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 px-4 py-2 bg-[#1A1926]/95 border-2 border-[#D9AA52] shadow-2xl backdrop-blur-sm animate-bounce">
          <span className="font-display font-bold text-xs sm:text-sm text-[#FCD34D] flex items-center gap-1.5">
             Ancient Expedition Portal
          </span>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setExpeditionGateOpen(true);
            }}
            className="stone-button stone-button-gold h-9 text-xs px-4"
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

      {/* Stat Allocation Modal Panel */}
      {attributesModalOpen && me && (() => {
        const liveStats = calculatePlayerStatProjections(me);
        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="stone-panel w-full max-w-lg shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-[#353442]">
                <div>
                  <h2 className="font-display text-lg text-white font-bold flex items-center gap-2">
                    <span>Adventurer Attributes</span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-[#252336] border border-[#3A384C] text-[#D9AA52]">
                      {me.level >= MAX_LEVEL ? 'MAX LEVEL' : `Lv. ${me.level}`}
                    </span>
                  </h2>
                  <p className="text-xs text-[#8E8C9E]">
                    Allocate earned points to empower {me.username} ({HERO_CLASSES[me.heroClass].name}).
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase font-mono text-[#8E8C9E]">Available Points</div>
                    <div className="text-sm font-mono font-bold text-[#FCD34D]">
                      {me.attributePoints} PTS
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      setAttributesModalOpen(false);
                    }}
                    className="stone-button stone-button-dark w-8 h-8 p-0 text-white text-sm font-bold"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Live Stat Projections Quick Card */}
              <div className="stone-input p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase text-[#FCD34D] font-bold">[STAT PROJECTIONS]</span>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      setAttributesModalOpen(false);
                      setInventoryModalOpen(true);
                    }}
                    className="stone-button stone-button-gold py-0.5 px-2.5 text-[10px] font-mono font-bold"
                  >
                    Full Inventory Sheet [I]
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-[11px]">
                  <div className="bg-[#1A1828] p-1.5 border border-[#3A384C]">
                    <div className="text-[9px] text-[#94A3B8] uppercase">Target DPS</div>
                    <div className="font-bold text-[#FCD34D]">{liveStats.sustainedDps}</div>
                  </div>
                  <div className="bg-[#1A1828] p-1.5 border border-[#3A384C]">
                    <div className="text-[9px] text-[#94A3B8] uppercase">Max HP</div>
                    <div className="font-bold text-[#10B981]">{liveStats.maxHp}</div>
                  </div>
                  <div className="bg-[#1A1828] p-1.5 border border-[#3A384C]">
                    <div className="text-[9px] text-[#94A3B8] uppercase">Crit Rate</div>
                    <div className="font-bold text-[#38BDF8]">{liveStats.critChancePct}%</div>
                  </div>
                  <div className="bg-[#1A1828] p-1.5 border border-[#3A384C]">
                    <div className="text-[9px] text-[#94A3B8] uppercase">Phys Armor</div>
                    <div className="font-bold text-[#60A5FA]">{liveStats.physicalResistPct}%</div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {/* Strength */}
                <div className="stone-plaque p-3.5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#EF4444]">STR · STRENGTH</span>
                      <span className="text-xs font-mono font-bold text-white bg-[#252336] px-2 py-0.5 border border-[#3A384C]">
                        {me.strength || 0} / {MAX_ATTRIBUTE}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A6A4B6]">
                      Increases physical damage for Vanguard (+3% per point) and grants bonus physical armor mitigation (+0.15% per point).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={me.attributePoints <= 0 || (me.strength || 0) >= MAX_ATTRIBUTE}
                    onClick={() => {
                      sfx.playUiClick('confirm');
                      onSendAdminCommand?.({ type: 'player:spend_attribute', attribute: 'strength' });
                    }}
                    className="stone-button stone-button-dark h-auto py-2 px-4 text-xs font-bold shrink-0 disabled:opacity-30"
                  >
                    {(me.strength || 0) >= MAX_ATTRIBUTE ? 'MAX' : '+ Allocate'}
                  </button>
                </div>

                {/* Vitality */}
                <div className="stone-plaque p-3.5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#10B981]">VIT · VITALITY</span>
                      <span className="text-xs font-mono font-bold text-white bg-[#252336] px-2 py-0.5 border border-[#3A384C]">
                        {me.vitality || 0} / {MAX_ATTRIBUTE}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A6A4B6]">
                      Increases maximum health pool (+6 Max HP per point) and grants passive combat health regeneration.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={me.attributePoints <= 0 || (me.vitality || 0) >= MAX_ATTRIBUTE}
                    onClick={() => {
                      sfx.playUiClick('confirm');
                      onSendAdminCommand?.({ type: 'player:spend_attribute', attribute: 'vitality' });
                    }}
                    className="stone-button stone-button-dark h-auto py-2 px-4 text-xs font-bold shrink-0 disabled:opacity-30"
                  >
                    {(me.vitality || 0) >= MAX_ATTRIBUTE ? 'MAX' : '+ Allocate'}
                  </button>
                </div>

                {/* Dexterity */}
                <div className="stone-plaque p-3.5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#38BDF8]">DEX · DEXTERITY</span>
                      <span className="text-xs font-mono font-bold text-white bg-[#252336] px-2 py-0.5 border border-[#3A384C]">
                        {me.dexterity || 0} / {MAX_ATTRIBUTE}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A6A4B6]">
                      Increases Ranger damage (+3%), attack speed (+0.6%), movement speed (+0.35%), and crit chance (+0.4%).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={me.attributePoints <= 0 || (me.dexterity || 0) >= MAX_ATTRIBUTE}
                    onClick={() => {
                      sfx.playUiClick('confirm');
                      onSendAdminCommand?.({ type: 'player:spend_attribute', attribute: 'dexterity' });
                    }}
                    className="stone-button stone-button-dark h-auto py-2 px-4 text-xs font-bold shrink-0 disabled:opacity-30"
                  >
                    {(me.dexterity || 0) >= MAX_ATTRIBUTE ? 'MAX' : '+ Allocate'}
                  </button>
                </div>

                {/* Intelligence */}
                <div className="stone-plaque p-3.5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#818CF8]">INT · INTELLIGENCE</span>
                      <span className="text-xs font-mono font-bold text-white bg-[#252336] px-2 py-0.5 border border-[#3A384C]">
                        {me.intelligence || 0} / {MAX_ATTRIBUTE}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A6A4B6]">
                      Increases Arcanist damage (+3%), reduces ability cooldowns (+0.2% CDR), and adds elemental resistance (+0.15%).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={me.attributePoints <= 0 || (me.intelligence || 0) >= MAX_ATTRIBUTE}
                    onClick={() => {
                      sfx.playUiClick('confirm');
                      onSendAdminCommand?.({ type: 'player:spend_attribute', attribute: 'intelligence' });
                    }}
                    className="stone-button stone-button-dark h-auto py-2 px-4 text-xs font-bold shrink-0 disabled:opacity-30"
                  >
                    {(me.intelligence || 0) >= MAX_ATTRIBUTE ? 'MAX' : '+ Allocate'}
                  </button>
                </div>

                {/* Faith */}
                <div className="stone-plaque p-3.5 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#FDE047]">FTH · FAITH</span>
                      <span className="text-xs font-mono font-bold text-white bg-[#252336] px-2 py-0.5 border border-[#3A384C]">
                        {me.faith || 0} / {MAX_ATTRIBUTE}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A6A4B6]">
                      Increases Cleric divine damage & healing (+3% per point) and grants spiritual crowd-control duration resistance (+0.4%).
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={me.attributePoints <= 0 || (me.faith || 0) >= MAX_ATTRIBUTE}
                    onClick={() => {
                      sfx.playUiClick('confirm');
                      onSendAdminCommand?.({ type: 'player:spend_attribute', attribute: 'faith' });
                    }}
                    className="stone-button stone-button-dark h-auto py-2 px-4 text-xs font-bold shrink-0 disabled:opacity-30"
                  >
                    {(me.faith || 0) >= MAX_ATTRIBUTE ? 'MAX' : '+ Allocate'}
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-[#2B293A] flex items-center justify-between">
                <p className="text-[11px] font-mono text-[#8E8C9E]">
                  Gain +2 attribute points per level (Cap Lv. {MAX_LEVEL}).
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick('confirm');
                    onSendAdminCommand?.({ type: 'player:reset_attributes' });
                  }}
                  className="stone-button stone-button-red text-xs py-1.5 px-3 font-mono font-bold"
                  title="Reset all allocated attributes and reclaim points"
                >
                  Reset Stats
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Advanced Inventory & Character Sheet Modal */}
      {inventoryModalOpen && me && (
        <CharacterInventoryModal
          player={me}
          onClose={() => setInventoryModalOpen(false)}
          onSendAdminCommand={onSendAdminCommand}
          onUnequipRelic={(relicId) => onSendAdminCommand?.({ type: 'player:unequip_relic', relicId })}
        />
      )}

      {/* Exclusive Developer Admin Control Panel Modal */}
      {me && (
        <AdminPanel
          me={me}
          isOpen={adminPanelOpen}
          onClose={() => setAdminPanelOpen(false)}
          onSendAdminCommand={(msg) => {
            if (onSendAdminCommand) {
              onSendAdminCommand(msg);
            }
          }}
        />
      )}

      {/* Expanded Fullscreen Tactical Map Modal */}
      {expandedMapOpen && (
        <ExpandedMapModal
          map={map}
          snapshot={snapshot}
          playerId={playerId}
          onClose={() => setExpandedMapOpen(false)}
        />
      )}

      {/* Cinematic Chapter I & Floor Intro Overlay */}
      {cinematicIntro && (
        <CinematicIntroOverlay
          floor={cinematicIntro.floor}
          biomeTitle={cinematicIntro.biomeTitle}
          isInitialChapterEntry={cinematicIntro.isInitialChapterEntry}
          onComplete={handleDismissIntro}
        />
      )}
    </div>
  );
};
