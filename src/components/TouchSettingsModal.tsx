import React from 'react';
import { sfx } from '../client/sound.ts';
import type {
  ButtonSizeOption,
  JoystickModeOption,
  JoystickSizeOption,
  TouchSettings,
} from './TouchControls.tsx';

interface TouchSettingsModalProps {
  settings: TouchSettings;
  forceTouchGamepad: boolean;
  onUpdateSettings: (newSettings: TouchSettings) => void;
  onToggleForceGamepad: (forced: boolean) => void;
  onClose: () => void;
}

export const TouchSettingsModal: React.FC<TouchSettingsModalProps> = ({
  settings,
  forceTouchGamepad,
  onUpdateSettings,
  onToggleForceGamepad,
  onClose,
}) => {
  const setJoystickSize = (size: JoystickSizeOption) => {
    sfx.playUiClick();
    onUpdateSettings({ ...settings, joystickSize: size });
  };

  const setJoystickMode = (mode: JoystickModeOption) => {
    sfx.playUiClick();
    onUpdateSettings({ ...settings, joystickMode: mode });
  };

  const setButtonSize = (size: ButtonSizeOption) => {
    sfx.playUiClick();
    onUpdateSettings({ ...settings, buttonSize: size });
  };

  const setOpacity = (opacity: number) => {
    sfx.playUiClick();
    onUpdateSettings({ ...settings, opacity });
  };

  const toggleHaptics = () => {
    sfx.playUiClick();
    onUpdateSettings({ ...settings, haptics: !settings.haptics });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="touch-settings-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 select-none"
    >
      <div className="stone-panel max-w-md w-full p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#434152] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#D9AA52]" />
            <h2 id="touch-settings-title" className="font-display text-lg sm:text-xl text-white">
              Touch Controls Setup
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="text-sm font-mono text-[#A8A6B8] hover:text-white px-2 py-1 min-h-[36px] flex items-center cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-4 text-xs font-mono">
          {/* JOYSTICK SIZE (Requested by user) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[#C9C7D6]">
              <span className="font-semibold text-white">Joystick Size</span>
              <span className="text-[#F4D378] capitalize">{settings.joystickSize}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'small', label: 'Small', desc: '110px' },
                  { id: 'medium', label: 'Medium', desc: '140px' },
                  { id: 'large', label: 'Large', desc: '175px' },
                  { id: 'huge', label: 'Huge', desc: '215px' },
                ] as const
              ).map((opt) => {
                const active = settings.joystickSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setJoystickSize(opt.id)}
                    className={`py-2 px-1 text-center border cursor-pointer min-h-[44px] flex flex-col justify-center transition-colors ${
                      active
                        ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold shadow-inner'
                        : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] opacity-75">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-[#8E8C9F] pt-0.5">
              Select &quot;Large&quot; or &quot;Huge&quot; for extra thumb comfort on modern smartphones and tablets.
            </p>
          </div>

          {/* JOYSTICK ANCHOR MODE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[#C9C7D6]">
              <span className="font-semibold text-white">Joystick Placement</span>
              <span className="text-[#F4D378]">
                {settings.joystickMode === 'floating' ? 'Floating Thumb' : 'Fixed Base'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJoystickMode('floating')}
                className={`py-2 px-3 border cursor-pointer min-h-[44px] flex flex-col items-center justify-center text-center transition-colors ${
                  settings.joystickMode === 'floating'
                    ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                    : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                }`}
              >
                <span>Floating Thumb</span>
                <span className="text-[10px] opacity-75">Spawns where you touch</span>
              </button>
              <button
                type="button"
                onClick={() => setJoystickMode('fixed')}
                className={`py-2 px-3 border cursor-pointer min-h-[44px] flex flex-col items-center justify-center text-center transition-colors ${
                  settings.joystickMode === 'fixed'
                    ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                    : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                }`}
              >
                <span>Fixed Base</span>
                <span className="text-[10px] opacity-75">Bottom-left corner</span>
              </button>
            </div>
          </div>

          {/* ACTION BUTTON SIZES */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[#C9C7D6]">
              <span className="font-semibold text-white">Action Buttons</span>
              <span className="text-[#F4D378] capitalize">{settings.buttonSize}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'compact', label: 'Compact', desc: 'Space-saving' },
                { id: 'standard', label: 'Standard', desc: 'Balanced' },
                { id: 'large', label: 'Large', desc: 'Comfortable' },
              ].map((opt) => {
                const active = settings.buttonSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setButtonSize(opt.id as ButtonSizeOption)}
                    className={`py-2 px-1 border cursor-pointer min-h-[44px] flex flex-col items-center justify-center text-center transition-colors ${
                      active
                        ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                        : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className="text-[10px] opacity-75">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* OPACITY */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[#C9C7D6]">
              <span className="font-semibold text-white">Controls Opacity</span>
              <span className="text-[#F4D378]">{Math.round(settings.opacity * 100)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0.5, 0.75, 0.9, 1.0].map((val) => {
                const active = Math.abs(settings.opacity - val) < 0.05;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setOpacity(val)}
                    className={`py-2 border cursor-pointer min-h-[40px] flex items-center justify-center transition-colors ${
                      active
                        ? 'bg-[#5B5870] border-[#F4D378] text-white font-bold'
                        : 'bg-[#292834] border-[#3F3D4E] text-[#B8B6C7] hover:border-[#73708A]'
                    }`}
                  >
                    {Math.round(val * 100)}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* HAPTICS & VISIBILITY TOGGLES */}
          <div className="pt-2 border-t border-[#3B3A4C] space-y-2">
            <button
              type="button"
              onClick={toggleHaptics}
              className="w-full py-2.5 px-3 bg-[#242330] hover:bg-[#302F3E] border border-[#3E3C4E] flex items-center justify-between cursor-pointer min-h-[44px]"
            >
              <span className="text-white">Haptic Vibration on Tap</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold ${
                  settings.haptics ? 'bg-[#22C55E]/20 text-[#86EFAC]' : 'bg-[#EF4444]/20 text-[#FCA5A5]'
                }`}
              >
                {settings.haptics ? 'ENABLED' : 'DISABLED'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                onToggleForceGamepad(!forceTouchGamepad);
              }}
              className="w-full py-2.5 px-3 bg-[#242330] hover:bg-[#302F3E] border border-[#3E3C4E] flex items-center justify-between cursor-pointer min-h-[44px]"
            >
              <div className="text-left">
                <span className="text-white block">Always Show Touch Gamepad</span>
                <span className="text-[10px] text-[#8E8C9F] block">
                  Force display on PC/laptops for testing or mouse-touch
                </span>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold shrink-0 ml-2 ${
                  forceTouchGamepad
                    ? 'bg-[#EAB308]/20 text-[#FDE047]'
                    : 'bg-[#4B495C]/30 text-[#9E9CAF]'
                }`}
              >
                {forceTouchGamepad ? 'ALWAYS ON' : 'AUTO'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer Confirmation */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button w-full py-2.5 font-display text-sm text-white cursor-pointer min-h-[44px] flex items-center justify-center"
          >
            Apply &amp; Return to Game
          </button>
        </div>
      </div>
    </div>
  );
};
