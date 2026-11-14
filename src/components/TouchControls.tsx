import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  findBestAutoTarget,
  getAbilityTargetSpec,
  getPrimaryAttackRange,
  type AbilityAimState,
  type AimableAction,
} from '../shared/abilityTargeting.ts';
import type {
  DungeonMap,
  EnemyState,
  GameSnapshot,
  PlayerState,
} from '../shared/types.ts';
import { HERO_CLASSES } from '../shared/types.ts';

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
  map?: DungeonMap;
  latestSnapshotRef?: React.MutableRefObject<GameSnapshot | null>;
  nearInteractable: boolean;
  abilityAimRef?: React.MutableRefObject<AbilityAimState | null>;
  onAbilityAimUiChange?: (
    ui: {
      action: AimableAction;
      cancelled: boolean;
      source: 'touch' | 'mouse' | 'keyboard';
    } | null
  ) => void;
  onStickMove: (stickX: number, stickY: number, aimAngle?: number) => void;
  onAttackPress: (pressed: boolean, aimAngle?: number) => void;
  onTriggerAction: (
    action: 'tactical' | 'ult' | 'potion' | 'interact' | 'dash',
    aimAngle: number,
    opts?: { aimDistance?: number; explicitAim?: boolean }
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
  map,
  latestSnapshotRef,
  nearInteractable,
  abilityAimRef,
  onAbilityAimUiChange,
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
  const attackAimingRef = useRef(false);
  const lastStickAngleRef = useRef<number>(player.aimAngle || 0);
  const playerRef = useRef(player);
  playerRef.current = player;
  const enemiesRef = useRef(enemies);
  enemiesRef.current = enemies;
  const mapRef = useRef(map);
  mapRef.current = map;
  const onAttackPressRef = useRef(onAttackPress);
  onAttackPressRef.current = onAttackPress;

  // Ability drag-to-aim tracking
  const abilityTouchRef = useRef<{
    id: number;
    action: AimableAction;
    originX: number;
    originY: number;
    dragDist: number;
  } | null>(null);
  const cancelZoneRef = useRef<HTMLDivElement | null>(null);
  const [skillWheelUi, setSkillWheelUi] = useState<{
    action: AimableAction;
    originX: number;
    originY: number;
    knobX: number;
    knobY: number;
    cancelled: boolean;
    accentColor: string;
    label: string;
  } | null>(null);

  const heroDef = HERO_CLASSES[player.heroClass] || HERO_CLASSES.vanguard;
  const tacSec = Math.ceil(player.skillCooldownMs / 1000);
  const ultSec = Math.ceil(player.ultCooldownMs / 1000);
  const dashSec = Math.ceil((player.dashCooldownMs || 0) / 1000);
  const isSilenced = Boolean(player.statuses && player.statuses.some((s) => s.type === 'silenced'));

  // Dynamic scale calculation for compact mobile screens (100% zoom on mobile browsers)
  const mobileViewportScale = React.useMemo(() => {
    if (typeof window === 'undefined') return 1;
    const minDim = Math.min(window.innerWidth, window.innerHeight);
    if (minDim < 380) return 0.8;
    if (minDim < 480) return 0.88;
    if (minDim < 640) return 0.94;
    return 1;
  }, []);

  const baseJoySpec = JOYSTICK_CONFIGS[settings.joystickSize] || JOYSTICK_CONFIGS.medium;
  const joySpec = React.useMemo(() => {
    if (mobileViewportScale === 1) return baseJoySpec;
    return {
      basePx: Math.round(baseJoySpec.basePx * mobileViewportScale),
      knobPx: Math.round(baseJoySpec.knobPx * mobileViewportScale),
      maxRadius: Math.round(baseJoySpec.maxRadius * mobileViewportScale),
    };
  }, [baseJoySpec, mobileViewportScale]);

  const baseBtnSpec = BUTTON_CONFIGS[settings.buttonSize] || BUTTON_CONFIGS.compact;
  const btnSpec = React.useMemo(() => {
    if (mobileViewportScale === 1) return baseBtnSpec;
    return {
      util: Math.round(baseBtnSpec.util * mobileViewportScale),
      skill: Math.round(baseBtnSpec.skill * mobileViewportScale),
      attack: Math.round(baseBtnSpec.attack * mobileViewportScale),
      icon: Math.round(baseBtnSpec.icon * mobileViewportScale),
    };
  }, [baseBtnSpec, mobileViewportScale]);

  const triggerHaptic = (ms = 12) => {
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore
      }
    }
  };

  const getAutoTarget = (maxRangeOverride?: number) => {
    const liveSnap = latestSnapshotRef?.current;
    const fallbackPlayer = playerRef.current;
    const livePlayer =
      liveSnap?.players.find((p) => p.id === fallbackPlayer.id) ?? fallbackPlayer;
    const liveEnemies = liveSnap?.enemies ?? enemiesRef.current;
    const liveDummies = liveSnap?.trainingDummies;
    const baseAngle = lastStickAngleRef.current;
    const maxDist =
      typeof maxRangeOverride === 'number'
        ? maxRangeOverride
        : getPrimaryAttackRange(livePlayer.heroClass);

    return findBestAutoTarget({
      playerX: livePlayer.x,
      playerY: livePlayer.y,
      maxRange: maxDist,
      preferredAngle: baseAngle,
      minDot: -1,
      map: mapRef.current,
      props: liveSnap?.props,
      enemies: liveEnemies,
      trainingDummies: liveDummies,
    });
  };

  const getAutoTargetAngle = (maxRangeOverride?: number) => {
    return getAutoTarget(maxRangeOverride)?.angle ?? lastStickAngleRef.current;
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
          lastStickAngleRef.current = angle;
          onStickMove(normX, normY, attackAimingRef.current ? undefined : angle);
        } else {
          onStickMove(
            0,
            0,
            attackAimingRef.current ? undefined : lastStickAngleRef.current
          );
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
        onStickMove(
          0,
          0,
          attackAimingRef.current ? undefined : lastStickAngleRef.current
        );
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
    attackAimingRef.current = true;
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
        attackAimingRef.current = false;
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
      onAttackPressRef.current(true, angle);
    }, 45);
    return () => clearInterval(interval);
  }, [attackAiming]);

  // Clear active ability aim on unmount
  useEffect(() => {
    return () => {
      abilityTouchRef.current = null;
      if (abilityAimRef) abilityAimRef.current = null;
      onAbilityAimUiChange?.(null);
    };
  }, [abilityAimRef, onAbilityAimUiChange]);

  const canAimAbility = (action: AimableAction): boolean => {
    const liveSnap = latestSnapshotRef?.current;
    const livePlayer = liveSnap?.players.find((p) => p.id === player.id) ?? player;
    if (livePlayer.downed) return false;
    const silenced = Boolean(
      livePlayer.statuses && livePlayer.statuses.some((s) => s.type === 'silenced')
    );
    if (action !== 'dash' && silenced) {
      sfx.playUiClick();
      return false;
    }
    if (action === 'tactical' && livePlayer.skillCooldownMs > 0) return false;
    if (action === 'ult' && livePlayer.ultCooldownMs > 0) return false;
    if (action === 'dash' && (livePlayer.dashCooldownMs || 0) > 0) return false;
    return true;
  };

  const handleAbilityTouchStart = (
    action: AimableAction,
    e: React.TouchEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    if (abilityTouchRef.current !== null) return;
    if (!canAimAbility(action)) return;

    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;
    const spec = getAbilityTargetSpec(player.heroClass, action);
    const defaultAngle =
      action === 'dash' ? lastStickAngleRef.current : getAutoTargetAngle();

    abilityTouchRef.current = {
      id: touch.identifier,
      action,
      originX,
      originY,
      dragDist: 0,
    };

    if (abilityAimRef) {
      abilityAimRef.current = {
        action,
        source: 'touch',
        aimAngle: defaultAngle,
        magnitude: 0,
        aimDistance: spec.defaultDist,
        cancelled: false,
      };
    }

    onAbilityAimUiChange?.({ action, cancelled: false, source: 'touch' });
    setSkillWheelUi({
      action,
      originX,
      originY,
      knobX: 0,
      knobY: 0,
      cancelled: false,
      accentColor: spec.accentColor,
      label: spec.label,
    });
    triggerHaptic(10);
  };

  const handleAbilityTouchMove = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const active = abilityTouchRef.current;
    if (!active) return;

    let matched: React.Touch | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === active.id) {
        matched = e.changedTouches[i];
        break;
      }
    }
    if (!matched) return;

    const dx = matched.clientX - active.originX;
    const dy = matched.clientY - active.originY;
    const dist = Math.hypot(dx, dy);
    active.dragDist = Math.max(active.dragDist, dist);

    const wheelRadius = 46;
    const deadzone = 10;
    const clampedDist = Math.min(dist, wheelRadius);
    const angle = Math.atan2(dy, dx);
    const knobX = dist > 0.5 ? Math.cos(angle) * clampedDist : 0;
    const knobY = dist > 0.5 ? Math.sin(angle) * clampedDist : 0;

    // Check cancel target bounding box (with thumb forgiveness padding)
    let isCancelled = false;
    const cancelRect = cancelZoneRef.current?.getBoundingClientRect();
    if (cancelRect) {
      const pad = 14;
      if (
        matched.clientX >= cancelRect.left - pad &&
        matched.clientX <= cancelRect.right + pad &&
        matched.clientY >= cancelRect.top - pad &&
        matched.clientY <= cancelRect.bottom + pad
      ) {
        isCancelled = true;
      }
    }

    const spec = getAbilityTargetSpec(player.heroClass, active.action);
    const prevCancelled = abilityAimRef?.current?.cancelled ?? false;

    if (dist > deadzone) {
      const mag = Math.min(1, (dist - deadzone) / (wheelRadius - deadzone));
      const aimDistance =
        spec.kind === 'ground_aoe'
          ? Math.round(mag * spec.range)
          : spec.kind === 'dash'
          ? Math.round(Math.max(36, mag * spec.range))
          : spec.range;
      if (abilityAimRef?.current) {
        abilityAimRef.current.aimAngle = angle;
        abilityAimRef.current.magnitude = mag;
        abilityAimRef.current.aimDistance = aimDistance;
        abilityAimRef.current.cancelled = isCancelled;
      }
    } else {
      const defaultAngle =
        active.action === 'dash' ? lastStickAngleRef.current : getAutoTargetAngle();
      if (abilityAimRef?.current) {
        abilityAimRef.current.aimAngle = defaultAngle;
        abilityAimRef.current.magnitude = 0;
        abilityAimRef.current.aimDistance = spec.defaultDist;
        abilityAimRef.current.cancelled = isCancelled;
      }
    }

    if (isCancelled !== prevCancelled) {
      if (isCancelled) triggerHaptic(14);
      onAbilityAimUiChange?.({
        action: active.action,
        cancelled: isCancelled,
        source: 'touch',
      });
    }

    setSkillWheelUi((prev) =>
      prev
        ? {
            ...prev,
            knobX,
            knobY,
            cancelled: isCancelled,
          }
        : null
    );
  };

  const handleAbilityTouchEnd = (
    e: React.TouchEvent<HTMLButtonElement>,
    forceCancel = false
  ) => {
    e.stopPropagation();
    const active = abilityTouchRef.current;
    if (!active) return;

    let found = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === active.id) {
        found = true;
        break;
      }
    }
    if (!found) return;

    const currentAim = abilityAimRef?.current ? { ...abilityAimRef.current } : null;
    abilityTouchRef.current = null;
    if (abilityAimRef) abilityAimRef.current = null;
    setSkillWheelUi(null);
    onAbilityAimUiChange?.(null);

    if (forceCancel || currentAim?.cancelled) {
      sfx.playUiClick();
      triggerHaptic(8);
      return;
    }

    const spec = getAbilityTargetSpec(player.heroClass, active.action);
    const dragged = active.dragDist > 10;
    const quickSearchRange =
      spec.kind === 'cone_volley' || spec.kind === 'ground_aoe'
        ? spec.range
        : spec.kind === 'dash' && spec.action === 'tactical'
        ? 160
        : undefined;
    const quickTarget = !dragged && active.action !== 'dash'
      ? getAutoTarget(quickSearchRange)
      : null;

    const castAngle = dragged
      ? currentAim?.aimAngle ?? lastStickAngleRef.current
      : active.action === 'dash'
      ? lastStickAngleRef.current
      : quickTarget?.angle ?? lastStickAngleRef.current;
    const castDist = dragged
      ? currentAim?.aimDistance ?? spec.defaultDist
      : spec.kind === 'ground_aoe' && player.heroClass === 'arcanist' && quickTarget
      ? Math.round(Math.min(spec.range, quickTarget.distance))
      : spec.defaultDist;

    if (active.action === 'dash') {
      sfx.playDash();
      triggerHaptic(14);
    } else if (active.action === 'tactical') {
      sfx.playSkill('tactical');
      triggerHaptic(16);
    } else {
      sfx.playSkill('ult');
      triggerHaptic(25);
    }

    onTriggerAction(active.action, castAngle, {
      aimDistance: castDist,
      explicitAim: dragged,
    });
  };

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
        className="pointer-events-auto absolute left-0 bottom-0 top-12 sm:top-16 w-[50vw] touch-none flex items-end p-2.5 sm:p-5 pl-safe pb-safe"
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
      <div className="pointer-events-auto absolute right-1.5 sm:right-5 bottom-1.5 sm:bottom-5 pr-safe pb-safe flex flex-col items-end gap-1.5 sm:gap-2.5">
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

          {/* Dash Button [C] - Hold & Drag to Aim */}
          <button
            type="button"
            onTouchStart={(e) => handleAbilityTouchStart('dash', e)}
            onTouchMove={handleAbilityTouchMove}
            onTouchEnd={(e) => handleAbilityTouchEnd(e, false)}
            onTouchCancel={(e) => handleAbilityTouchEnd(e, true)}
            style={{ width: `${btnSpec.util + 8}px`, height: `${btnSpec.util + 8}px` }}
            className={`rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-md cursor-pointer ${
              skillWheelUi?.action === 'dash'
                ? 'scale-110 bg-[#422006]/95 border-[#FEF08A] text-[#FEF08A] ring-2 ring-[#F59E0B]/70'
                : dashSec > 0
                ? 'bg-[#1E1E28]/85 border-[#38364C] text-[#6E6C7D]'
                : 'bg-[#2A2314]/95 border-[#F59E0B] text-[#FDE68A] active:scale-95'
            }`}
            aria-label="Dash Evasion"
          >
            <span className="text-[10px] font-mono font-bold leading-none">
              {dashSec > 0 ? `${dashSec}s` : 'DASH'}
            </span>
            <span className="text-[7.5px] font-mono leading-none mt-0.5 opacity-80">
              [C]
            </span>
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
          {/* Tactical Skill [Q] - Hold & Drag to Aim */}
          <button
            type="button"
            onTouchStart={(e) => handleAbilityTouchStart('tactical', e)}
            onTouchMove={handleAbilityTouchMove}
            onTouchEnd={(e) => handleAbilityTouchEnd(e, false)}
            onTouchCancel={(e) => handleAbilityTouchEnd(e, true)}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
            }}
            className={`absolute top-0 left-0 rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-lg cursor-pointer ${
              skillWheelUi?.action === 'tactical'
                ? 'scale-110 bg-[#1E1B4B]/95 border-[#38BDF8] text-white ring-2 ring-[#38BDF8]/70'
                : isSilenced
                ? 'bg-[#251B33]/90 border-[#A855F7] text-[#D8B4FE]'
                : tacSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#282738]/95 border-[#818CF8] text-[#C7D2FE] active:scale-95'
            }`}
            aria-label={heroDef.tacticalName}
          >
            <span className="text-xs font-mono font-bold leading-none">
              {isSilenced ? 'SIL' : tacSec > 0 ? `${tacSec}s` : 'Q'}
            </span>
            <span className="text-[7.5px] font-display truncate max-w-[42px] mt-0.5">
              {isSilenced ? 'Sealed' : tacSec > 0 ? 'Wait' : heroDef.tacticalName.split(' ')[0]}
            </span>
          </button>

          {/* Ultimate Ability [R] - Hold & Drag to Aim */}
          <button
            type="button"
            onTouchStart={(e) => handleAbilityTouchStart('ult', e)}
            onTouchMove={handleAbilityTouchMove}
            onTouchEnd={(e) => handleAbilityTouchEnd(e, false)}
            onTouchCancel={(e) => handleAbilityTouchEnd(e, true)}
            style={{
              width: `${btnSpec.skill}px`,
              height: `${btnSpec.skill}px`,
              right: `${btnSpec.attack * 0.9}px`,
            }}
            className={`absolute top-0 rounded-full border-2 flex flex-col items-center justify-center transition-transform shadow-lg cursor-pointer ${
              skillWheelUi?.action === 'ult'
                ? 'scale-110 bg-[#451A03]/95 border-[#FEF08A] text-white ring-2 ring-[#F59E0B]/80'
                : isSilenced
                ? 'bg-[#251B33]/90 border-[#A855F7] text-[#D8B4FE]'
                : ultSec > 0
                ? 'bg-[#1B1A24]/90 border-[#38364A] text-[#716F82]'
                : 'bg-[#372A18]/95 border-[#F59E0B] text-[#FEF08A] active:scale-95'
            }`}
            aria-label={heroDef.ultName}
          >
            <span className="text-xs font-mono font-bold leading-none">
              {isSilenced ? 'SIL' : ultSec > 0 ? `${ultSec}s` : 'R'}
            </span>
            <span className="text-[7.5px] font-display truncate max-w-[42px] mt-0.5">
              {isSilenced ? 'Sealed' : ultSec > 0 ? 'Wait' : 'ULT'}
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

      {/* MOBILE LEGENDS-STYLE SKILL AIM WHEEL & CANCEL TARGET OVERLAY */}
      {skillWheelUi && (
        <>
          {/* Cancel Cast Drop Zone */}
          <div
            ref={cancelZoneRef}
            className={`fixed right-36 sm:right-52 bottom-44 sm:bottom-52 z-30 w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center pointer-events-none transition-all shadow-2xl ${
              skillWheelUi.cancelled
                ? 'scale-115 bg-[#991B1B]/95 border-[#FECACA] text-white ring-4 ring-[#EF4444]/60'
                : 'bg-[#1E1418]/90 border-[#EF4444]/80 text-[#FCA5A5]'
            }`}
          >
            <span className="text-sm font-mono font-bold leading-none">✕</span>
            <span className="text-[8px] font-mono font-bold tracking-wider uppercase mt-0.5">
              Cancel
            </span>
          </div>

          {/* Floating Mini Skill Joystick Wheel centered on pressed skill button */}
          <div
            style={{
              position: 'fixed',
              left: `${skillWheelUi.originX}px`,
              top: `${skillWheelUi.originY}px`,
              width: '96px',
              height: '96px',
              marginLeft: '-48px',
              marginTop: '-48px',
              borderColor: skillWheelUi.cancelled
                ? '#EF4444'
                : skillWheelUi.accentColor,
            }}
            className="z-30 rounded-full border-2 bg-[#14131E]/65 backdrop-blur-[2px] flex items-center justify-center pointer-events-none shadow-2xl"
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-[#12111A]/90 border border-[#3C3A52] text-[9px] font-mono whitespace-nowrap text-white">
              {skillWheelUi.cancelled ? 'Cancel Cast' : skillWheelUi.label}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-30">
              <div className="w-full h-px bg-white" />
              <div className="h-full w-px bg-white absolute" />
            </div>
            <div
              style={{
                width: '30px',
                height: '30px',
                transform: `translate3d(${skillWheelUi.knobX}px, ${skillWheelUi.knobY}px, 0)`,
                backgroundColor: skillWheelUi.cancelled
                  ? '#EF4444'
                  : skillWheelUi.accentColor,
              }}
              className="rounded-full border-2 border-white/90 shadow-lg"
            />
          </div>
        </>
      )}
    </div>
  );
};
