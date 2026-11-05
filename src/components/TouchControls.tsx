import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  type EnemyState,
  type PlayerState,
} from '../shared/types.ts';

export type JoystickSizeOption = 'small' | 'medium' | 'large' | 'huge';
export type JoystickModeOption = 'fixed' | 'floating';
export type ButtonSizeOption = 'compact' | 'standard' | 'large';

export interface TouchSettings {
  joystickSize: JoystickSizeOption;
  joystickMode: JoystickModeOption;
  buttonSize: ButtonSizeOption;
  opacity: number;
  haptics: boolean;
}

const DEFAULT_TOUCH_SETTINGS: TouchSettings = {
  joystickSize: 'medium',
  joystickMode: 'floating',
  buttonSize: 'compact',
  opacity: 0.88,
  haptics: true,
};

const JOYSTICK_CONFIGS: Record<
  JoystickSizeOption,
  { basePx: number; knobPx: number; maxRadius: number }
> = {
  small: { basePx: 100, knobPx: 44, maxRadius: 34 },
  medium: { basePx: 125, knobPx: 52, maxRadius: 42 },
  large: { basePx: 160, knobPx: 64, maxRadius: 56 },
  huge: { basePx: 200, knobPx: 78, maxRadius: 72 },
};

const BUTTON_CONFIGS: Record<
  ButtonSizeOption,
  { util: number; skill: number; attack: number; icon: number }
> = {
  compact: { util: 36, skill: 46, attack: 64, icon: 16 },
  standard: { util: 42, skill: 54, attack: 76, icon: 20 },
  large: { util: 48, skill: 64, attack: 90, icon: 24 },
};

interface TouchControlsProps {
  player: PlayerState;
  enemies: EnemyState[];
  nearInteractable: boolean;
  onStickMove: (stickX: number, stickY: number, aimAngle?: number) => void;
  onAttackPress: (pressed: boolean, aimAngle?: number) => void;
  onTriggerAction: (
    action: 'tactical' | 'ult' | 'potion' | 'interact',
    aimAngle: number
  ) => void;
  onSendPing: (label: string, x: number, y: number) => void;
  settings: TouchSettings;
  onOpenSettings: () => void;
}

export function loadSavedTouchSettings(): TouchSettings {
  try {
    const raw = localStorage.getItem('beyond_touch_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_TOUCH_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_TOUCH_SETTINGS;
}

export function saveTouchSettings(s: TouchSettings): void {
  try {
    localStorage.setItem('beyond_touch_settings', JSON.stringify(s));
  } catch {
    // ignore
  }
}

export const TouchControls: React.FC<TouchControlsProps> = ({
  player,
  enemies,
  nearInteractable,
  onStickMove,
  onAttackPress,
  onTriggerAction,
  onSendPing,
  settings,
  onOpenSettings,
}) => {
  const joystickTouchIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isStickActive, setIsStickActive] = useState(false);

  // Position of floating joystick base in screen coordinates
  const [floatingOrigin, setFloatingOrigin] = useState<{ x: number; y: number } | null>(null);
  const fixedBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickCenterRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const attackTouchIdRef = useRef<number | null>(null);
  const [attackAiming, setAttackAiming] = useState(false);

  const heroDef = HERO_CLASSES[player.heroClass] || HERO_CLASSES.vanguard;
  const tacSec = Math.ceil(player.skillCooldownMs / 1000);
  const ultSec = Math.ceil(player.ultCooldownMs / 1000);

  const joySpec = JOYSTICK_CONFIGS[settings.joystickSize] || JOYSTICK_CONFIGS.medium;
  const btnSpec = BUTTON_CONFIGS[settings.buttonSize] || BUTTON_CONFIGS.compact;

  const triggerHaptic = (ms = 12) => {
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore
      }
    }
  };

  const getAutoTargetAngle = () => {
    let nearestDist = Infinity;
    let targetAngle = player.aimAngle;
    const maxDist = player.heroClass === 'vanguard' ? 140 : 460;
    for (const en of enemies) {
      if (en.hp <= 0) continue;
      const d = Math.hypot(en.x - player.x, en.y - player.y);
      if (d < nearestDist && d <= maxDist) {
        nearestDist = d;
        targetAngle = Math.atan2(en.y - player.y, en.x - player.x);
      }
    }
    return targetAngle;
  };

  // Touch handlers for floating zone on the left half of screen
  const handleLeftZoneTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    joystickTouchIdRef.current = touch.identifier;

    let cx = 0;
    let cy = 0;

    if (settings.joystickMode === 'floating') {
      cx = touch.clientX;
      cy = touch.clientY;
      setFloatingOrigin({ x: cx, y: cy });
    } else {
      const rect = fixedBaseRef.current?.getBoundingClientRect();
      if (rect) {
        cx = rect.left + rect.width / 2;
        cy = rect.top + rect.height / 2;
      } else {
        cx = touch.clientX;
        cy = touch.clientY;
      }
    }

    joystickCenterRef.current = { x: cx, y: cy };
    setKnobPos({ x: 0, y: 0 });
    setIsStickActive(true);
    triggerHaptic(10);
  };

  const handleLeftZoneTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === joystickTouchIdRef.current) {
        const cx = joystickCenterRef.current.x;
        const cy = joystickCenterRef.current.y;
        const dx = touch.clientX - cx;
        const dy = touch.clientY - cy;
        const dist = Math.hypot(dx, dy);
        const maxR = joySpec.maxRadius;
        const clampedDist = Math.min(dist, maxR);
        const angle = Math.atan2(dy, dx);
        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;

        setKnobPos({ x: kx, y: ky });

        // Normalize -1 to 1 with smooth deadzone
        const deadzone = 8;
        if (clampedDist > deadzone) {
          const normMagnitude = (clampedDist - deadzone) / (maxR - deadzone);
          const normX = Math.cos(angle) * normMagnitude;
          const normY = Math.sin(angle) * normMagnitude;
          onStickMove(normX, normY, angle);
        } else {
          onStickMove(0, 0);
        }
        break;
      }
    }
  };

  const handleLeftZoneTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (joystickTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchIdRef.current) {
        joystickTouchIdRef.current = null;
        setKnobPos({ x: 0, y: 0 });
        setIsStickActive(false);
        setFloatingOrigin(null);
        onStickMove(0, 0);
        break;
      }
    }
  };

  // Attack Touch
  const handleAttackStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (attackTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    attackTouchIdRef.current = touch.identifier;
    setAttackAiming(true);
    triggerHaptic(18);
    sfx.playAttack(player.heroClass);
    const targetAngle = getAutoTargetAngle();
    onAttackPress(true, targetAngle);
  };

  const handleAttackEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (attackTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === attackTouchIdRef.current) {
        attackTouchIdRef.current = null;
        setAttackAiming(false);
        onAttackPress(false);
        break;
      }
    }
  };

  // Continuous auto-target tracking while holding attack button
  useEffect(() => {
    if (!attackAiming) return;
    const interval = setInterval(() => {
      const angle = getAutoTargetAngle();
      onAttackPress(true, angle);
    }, 70);
    return () => clearInterval(interval);
  }, [attackAiming, player.x, player.y, enemies]);

  return (
    <div
      aria-label="Mobile Touch Gamepad"
      style={{ opacity: settings.opacity }}
      className="fixed inset-0 pointer-events-none select-none z-20 touch-none"
    >
      {/* LEFT HALF SCREEN: Joystick Touch Catch Area */}
      <div
        onTouchStart={handleLeftZoneTouchStart}
        onTouchMove={handleLeftZoneTouchMove}
        onTouchEnd={handleLeftZoneTouchEnd}
        onTouchCancel={handleLeftZoneTouchEnd}
        className="pointer-events-auto absolute left-0 bottom-0 top-16 w-[50vw] touch-none flex items-end p-4 sm:p-5"
      >
        {/* Floating Joystick Base */}
        {settings.joystickMode === 'floating' && floatingOrigin && isStickActive && (
          <div
            style={{
              position: 'fixed',
              left: `${floatingOrigin.x}px`,
              top: `${floatingOrigin.y}px`,
              width: `${joySpec.basePx}px`,
              height: `${joySpec.basePx}px`,
              marginLeft: `-${joySpec.basePx / 2}px`,
              marginTop: `-${joySpec.basePx / 2}px`,
            }}
            className="rounded-full bg-[#181822]/85 border-3 border-[#5B5872] shadow-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-40">
              <div className="w-full h-0.5 bg-[#A19EB3]" />
              <div className="h-full w-0.5 bg-[#A19EB3] absolute" />
            </div>
            <div
              style={{
                width: `${joySpec.knobPx}px`,
                height: `${joySpec.knobPx}px`,
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
              }}
              className="rounded-full bg-[#7D7B91] border-3 border-[#343243] shadow-[0_4px_16px_rgba(0,0,0,0.6)] flex items-center justify-center"
            >
              <div className="w-4 h-4 rounded-full bg-[#E5E3F2]" />
            </div>
          </div>
        )}

        {/* Fixed Joystick Base */}
        {settings.joystickMode === 'fixed' && (
          <div
            ref={fixedBaseRef}
            style={{
              width: `${joySpec.basePx}px`,
              height: `${joySpec.basePx}px`,
            }}
            className="relative rounded-full bg-[#181822]/85 border-3 border-[#5B5872] shadow-2xl flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-35">
              <div className="w-full h-0.5 bg-[#A19EB3]" />
              <div className="h-full w-0.5 bg-[#A19EB3] absolute" />
            </div>
            <div
              style={{
                width: `${joySpec.knobPx}px`,
                height: `${joySpec.knobPx}px`,
                transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
                transition: isStickActive ? 'none' : 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              className="rounded-full bg-[#7D7B91] border-3 border-[#343243] shadow-[0_4px_16px_rgba(0,0,0,0.6)] flex items-center justify-center"
            >
              <div className="w-4 h-4 rounded-full bg-[#E5E3F2]" />
            </div>
          </div>
        )}

        {settings.joystickMode === 'floating' && !isStickActive && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#9D9AAC]/75 bg-[#161622]/50 px-2.5 py-1 border border-[#3C3A4D] pointer-events-none">
            <span>Touch to Move</span>
          </div>
        )}
      </div>

      {/* RIGHT ACTION CLUSTER */}
      <div className="pointer-events-auto absolute right-2.5 sm:right-5 bottom-2.5 sm:bottom-5 flex flex-col items-end gap-2.5">
        {/* Progression Status Bar (Mobile) */}
        <div className="flex flex-col items-end gap-1 mb-1 pr-1">
          <div className="text-[9px] font-mono font-bold text-[#FCD34D] bg-[#181822]/60 px-1.5 py-0.5 border border-[#3C3A4D]">
            {player.level >= 100 ? 'MAX LEVEL' : `LV.${player.level}`}
          </div>
          <div className="w-20 h-1.5 bg-[#12111A]/80 border border-[#3C3A52] relative overflow-hidden">
            {player.level >= 100 ? (
              <div className="absolute inset-0 bg-[#FCD34D]" />
            ) : (
              <div 
                className="h-full bg-gradient-to-r from-[#D9AA52] to-[#FDE68A]" 
                style={{ width: `${Math.min(100, (player.xp / Math.max(1, player.nextXp)) * 100)}%` }} 
              />
            )}
          </div>
        </div>

        {/* Upper Utility Row */}
        <div className="flex items-center gap-2">
          {/* Settings Gear */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              triggerHaptic(12);
              onOpenSettings();
            }}
            onClick={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              onOpenSettings();
            }}
            style={{ width: `${btnSpec.util}px`, height: `${btnSpec.util}px` }}
            className="rounded-full bg-[#242332]/90 border border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
            aria-label="Touch Controls Settings"
            title="Touch Controls Settings"
          >
            <svg width={btnSpec.icon} height={btnSpec.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>

          {/* Ping */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              triggerHaptic(14);
              onSendPing('Rally Here', player.x, player.y - 18);
            }}
            style={{ width: `${btnSpec.util}px`, height: `${btnSpec.util}px` }}
            className="rounded-full bg-[#242332]/90 border border-[#525066] text-white flex items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer"
            aria-label="Rally Ping"
          >
            <svg width={btnSpec.icon} height={btnSpec.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M2 12h20" />
            </svg>
          </button>

          {/* Potion */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              if (player.potions > 0) {
                sfx.playHeal();
                triggerHaptic(20);
                onTriggerAction('potion', player.aimAngle);
              }
            }}
            style={{ width: `${btnSpec.util + 4}px`, height: `${btnSpec.util + 4}px` }}
            className={`rounded-full border-2 flex flex-col items-center justify-center active:scale-95 transition-transform shadow-md cursor-pointer ${
              player.potions > 0
                ? 'bg-[#3D1A22]/95 border-[#E11D48] text-[#FDA4AF]'
                : 'bg-[#1E1E28]/85 border-[#38364C] text-[#6E6C7D]'
            }`}
            aria-label="Healing Flask"
          >
            <span className="text-[11px] font-mono font-bold leading-none">
              {player.potions}
            </span>
            <span className="text-[8px] font-mono leading-none mt-0.5">HEAL</span>
          </button>

          {/* Interact */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              sfx.playUiClick();
              triggerHaptic(16);
              onTriggerAction('interact', player.aimAngle);
            }}
            style={{ width: `${btnSpec.util + 4}px`, height: `${btnSpec.util + 4}px` }}
            className={`rounded-full border-2 flex items-center justify-center font-display text-xs font-bold active:scale-95 transition-all shadow-md cursor-pointer ${
              nearInteractable
                ? 'bg-[#1E3A8A]/95 border-[#60A5FA] text-white animate-pulse'
                : 'bg-[#222332]/85 border-[#47455E] text-[#D1CFDC]'
            }`}
            aria-label="Interact"
          >
            [E]
          </button>
        </div>

        {/* Lower Combat Cluster */}
        <div
          style={{
            width: `${btnSpec.attack * 2.2}px`,
            height: `${btnSpec.attack * 1.6}px`,
          }}
          className="relative flex items-end justify-end"
        >
          {/* Tactical Skill [Q] */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              if (tacSec === 0) {
                sfx.playSkill('tactical');
                triggerHaptic(16);
                const targetAngle = getAutoTargetAngle();
                onTriggerAction('tactical', targetAngle);
              }
            }}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
            }}
            className={`absolute top-0 left-0 rounded-full border-2 flex flex-col items-center justify-center active:scale-95 transition-transform shadow-lg cursor-pointer ${
              tacSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#282738]/95 border-[#818CF8] text-[#C7D2FE]'
            }`}
            aria-label={heroDef.tacticalName}
          >
            <span className="text-xs font-mono font-bold leading-none">
              {tacSec > 0 ? `${tacSec}s` : 'Q'}
            </span>
            <span className="text-[7.5px] font-display truncate max-w-[42px] mt-0.5">
              {tacSec > 0 ? 'Wait' : heroDef.tacticalName.split(' ')[0]}
            </span>
          </button>

          {/* Ultimate Ability [R] */}
          <button
            type="button"
            onTouchStart={(e) => {
              e.stopPropagation();
              if (ultSec === 0) {
                sfx.playSkill('ult');
                triggerHaptic(25);
                const targetAngle = getAutoTargetAngle();
                onTriggerAction('ult', targetAngle);
              }
            }}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
              right: `${btnSpec.attack * 0.9}px`,
            }}
            className={`absolute top-0 rounded-full border-2 flex flex-col items-center justify-center active:scale-95 transition-transform shadow-lg cursor-pointer ${
              ultSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#372A18]/95 border-[#F59E0B] text-[#FEF08A]'
            }`}
            aria-label={heroDef.ultName}
          >
            <span className="text-xs font-mono font-bold leading-none">
              {ultSec > 0 ? `${ultSec}s` : 'R'}
            </span>
            <span className="text-[7.5px] font-display truncate max-w-[42px] mt-0.5">
              {ultSec > 0 ? 'Wait' : 'ULT'}
            </span>
          </button>

          {/* Giant Primary Attack Button */}
          <button
            type="button"
            onTouchStart={handleAttackStart}
            onTouchEnd={handleAttackEnd}
            onTouchCancel={handleAttackEnd}
            style={{
              width: `${btnSpec.attack}px`,
              height: `${btnSpec.attack}px`,
            }}
            className={`rounded-full border-3 flex items-center justify-center shadow-2xl transition-transform cursor-pointer ${
              attackAiming
                ? 'scale-105 bg-[#DC2626] border-[#FECACA] text-white'
                : 'bg-[#B91C1C] border-[#F87171] text-white active:scale-95'
            }`}
            aria-label="Attack"
          >
            <svg
              width={btnSpec.attack * 0.42}
              height={btnSpec.attack * 0.42}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
              <path d="M13 19l6-6" />
              <path d="M16 16l4 4" />
              <path d="M19 21l2-2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
