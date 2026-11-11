import React, { useState } from 'react';
import { sfx, soundManager } from '../client/sound.ts';
import { useFullscreenState } from '../client/fullscreen.ts';
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

type MenuSettingsTab = 'sfx' | 'touch' | 'display';

export const TouchSettingsModal: React.FC<TouchSettingsModalProps> = ({
  settings,
  forceTouchGamepad,
  onUpdateSettings,
  onToggleForceGamepad,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<MenuSettingsTab>('sfx');
  const [isMasterMuted, setIsMasterMuted] = useState(() => soundManager.isMasterMuted());
  const [isSfxMuted, setIsSfxMuted] = useState(() => soundManager.isSfxMuted());
  const [isMusicMuted, setIsMusicMuted] = useState(() => soundManager.isMusicMuted());

  const [masterVolume, setMasterVolState] = useState<number>(() => soundManager.getMasterVolume());
  const [sfxVolume, setSfxVolState] = useState<number>(() => soundManager.getSfxVolume());
  const [musicVolume, setMusicVolState] = useState<number>(() => soundManager.getMusicVolume());
  const [isFullscreen, toggleFullscreenState] = useFullscreenState();

  // Touch controls settings
  const setJoystickSize = (size: JoystickSizeOption) => {
    sfx.playUiClick();
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    onUpdateSettings({ ...settings, joystickSize: size });
  };

  const setJoystickMode = (mode: JoystickModeOption) => {
    sfx.playUiClick();
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    onUpdateSettings({ ...settings, joystickMode: mode });
  };

  const setButtonSize = (size: ButtonSizeOption) => {
    sfx.playUiClick();
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    onUpdateSettings({ ...settings, buttonSize: size });
  };

  const setOpacity = (opacity: number) => {
    sfx.playUiClick();
    if (settings.haptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    onUpdateSettings({ ...settings, opacity });
  };

  const toggleHaptics = () => {
    sfx.playUiClick();
    const newHaptics = !settings.haptics;
    if (newHaptics && typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([20, 30, 20]);
    }
    onUpdateSettings({ ...settings, haptics: newHaptics });
  };

  // Audio handlers
  const handleToggleMasterMute = () => {
    sfx.unlockAudio();
    const muted = soundManager.toggleMasterMute();
    setIsMasterMuted(muted);
    if (!muted) sfx.playUiClick('confirm');
  };

  const handleToggleSfxMute = () => {
    sfx.unlockAudio();
    const muted = soundManager.toggleSfxMute();
    setIsSfxMuted(muted);
    if (!muted) sfx.playUiClick('confirm');
  };

  const handleToggleMusicMute = () => {
    sfx.unlockAudio();
    const muted = soundManager.toggleMusicMute();
    setIsMusicMuted(muted);
    if (!muted) sfx.playUiClick('confirm');
  };

  const handleMasterVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMasterVolState(val);
    soundManager.setMasterVolume(val);
  };

  const handleSfxVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSfxVolState(val);
    soundManager.setSfxVolume(val);
  };

  const handleMusicVolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setMusicVolState(val);
    soundManager.setMusicVolume(val);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="touch-settings-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-5 select-none pb-safe pt-safe pl-safe pr-safe"
    >
      <div className="stone-panel max-w-lg w-full p-3.5 sm:p-6 space-y-3 sm:space-y-4 my-auto max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#434152] pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#D9AA52]" />
            <h2 id="touch-settings-title" className="font-display text-lg sm:text-xl text-white">
              Menu Settings: Touch &amp; SFX
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
            Close
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#363546] pb-2 text-xs font-mono">
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setActiveTab('sfx');
            }}
            className={`px-3 py-1.5 border font-semibold cursor-pointer transition-colors min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'sfx'
                ? 'bg-[#5B5870] border-[#F4D378] text-white'
                : 'bg-[#242330] border-[#3B394A] text-[#A8A6B8] hover:text-white'
            }`}
          >
            <span>Audio &amp; SFX</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setActiveTab('touch');
            }}
            className={`px-3 py-1.5 border font-semibold cursor-pointer transition-colors min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'touch'
                ? 'bg-[#5B5870] border-[#F4D378] text-white'
                : 'bg-[#242330] border-[#3B394A] text-[#A8A6B8] hover:text-white'
            }`}
          >
            <span>Touch Controls</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setActiveTab('display');
            }}
            className={`px-3 py-1.5 border font-semibold cursor-pointer transition-colors min-h-[36px] flex items-center gap-1.5 ${
              activeTab === 'display'
                ? 'bg-[#5B5870] border-[#F4D378] text-white'
                : 'bg-[#242330] border-[#3B394A] text-[#A8A6B8] hover:text-white'
            }`}
          >
            <span>Display &amp; Screen</span>
          </button>
        </div>

        {/* TAB 1: AUDIO & SFX */}
        {activeTab === 'sfx' && (
          <div className="space-y-4 text-xs font-mono">
            {/* THREE-CHANNEL VOLUME CONTROLS */}
            <div className="p-3 bg-[#242330] border border-[#3E3C4E] space-y-4">
              {/* Channel 1: Master Audio */}
              <div className="space-y-1.5 pb-2 border-b border-[#363546]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#F4D378]" />
                    Master Channel
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleMasterMute}
                    className={`px-2.5 py-0.5 text-xs font-bold border cursor-pointer min-h-[28px] flex items-center gap-1 transition-colors ${
                      isMasterMuted
                        ? 'bg-[#EF4444]/20 border-[#EF4444] text-[#FCA5A5]'
                        : 'bg-[#22C55E]/20 border-[#22C55E] text-[#86EFAC]'
                    }`}
                  >
                    {isMasterMuted ? 'MUTED' : 'ACTIVE'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[#C9C7D6] text-[11px]">
                  <span>Master Volume</span>
                  <span className="text-[#F4D378] font-bold">
                    {Math.round(masterVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={masterVolume}
                  onChange={handleMasterVolChange}
                  className="w-full accent-[#F4D378] cursor-pointer h-2 bg-[#1A1924] rounded"
                />
              </div>

              {/* Channel 2: Sound Effects (SFX) */}
              <div className="space-y-1.5 pb-2 border-b border-[#363546]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#60A5FA]" />
                    Sound Effects (SFX)
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleSfxMute}
                    className={`px-2.5 py-0.5 text-xs font-bold border cursor-pointer min-h-[28px] flex items-center gap-1 transition-colors ${
                      isSfxMuted
                        ? 'bg-[#EF4444]/20 border-[#EF4444] text-[#FCA5A5]'
                        : 'bg-[#3B82F6]/20 border-[#3B82F6] text-[#93C5FD]'
                    }`}
                  >
                    {isSfxMuted ? 'MUTED' : 'ACTIVE'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[#C9C7D6] text-[11px]">
                  <span>SFX Volume</span>
                  <span className="text-[#60A5FA] font-bold">
                    {Math.round(sfxVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={sfxVolume}
                  onChange={handleSfxVolChange}
                  className="w-full accent-[#60A5FA] cursor-pointer h-2 bg-[#1A1924] rounded"
                />
              </div>

              {/* Channel 3: Music & Ambience */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#A78BFA]" />
                    Music &amp; Ambience
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleMusicMute}
                    className={`px-2.5 py-0.5 text-xs font-bold border cursor-pointer min-h-[28px] flex items-center gap-1 transition-colors ${
                      isMusicMuted
                        ? 'bg-[#EF4444]/20 border-[#EF4444] text-[#FCA5A5]'
                        : 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-[#C4B5FD]'
                    }`}
                  >
                    {isMusicMuted ? 'MUTED' : 'ACTIVE'}
                  </button>
                </div>
                <div className="flex items-center justify-between text-[#C9C7D6] text-[11px]">
                  <span>Music Volume</span>
                  <span className="text-[#A78BFA] font-bold">
                    {Math.round(musicVolume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={musicVolume}
                  onChange={handleMusicVolChange}
                  className="w-full accent-[#A78BFA] cursor-pointer h-2 bg-[#1A1924] rounded"
                />
              </div>
            </div>

            {/* SOUND TEST PLAYGROUND */}
            <div className="space-y-2">
              <span className="font-semibold text-white block">SFX Sound Test</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'UI Click', fn: () => sfx.playUiClick() },
                  { label: 'Attack', fn: () => sfx.playAttack('vanguard') },
                  { label: 'Tactical', fn: () => sfx.playSkill('tactical') },
                  { label: 'Ultimate', fn: () => sfx.playSkill('ult') },
                  { label: 'Crit Hit', fn: () => sfx.playEnemyHit(true) },
                  { label: 'Relic Chime', fn: () => sfx.playRelicChime() },
                  { label: 'Heal Potion', fn: () => sfx.playHeal() },
                  { label: 'Gold Coin', fn: () => sfx.playCoin() },
                ].map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      sfx.unlockAudio();
                      item.fn();
                    }}
                    className="py-2 px-2 bg-[#292834] hover:bg-[#3B394A] border border-[#3F3D4E] hover:border-[#F4D378] text-[#D4D2E3] hover:text-white font-medium text-center cursor-pointer min-h-[38px] transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#8E8C9F] pt-1">
                Tap any button above to preview real-time synthesized audio effects.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: TOUCH CONTROLS */}
        {activeTab === 'touch' && (
          <div className="space-y-4 text-xs font-mono">
            {/* JOYSTICK SIZE */}
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
                  <span className="text-[10px] opacity-75">Spawns on touch</span>
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
                      className={`py-[#5B5870] py-2 border cursor-pointer min-h-[40px] flex items-center justify-center transition-colors ${
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
                <span className="text-white">Haptic Vibration on Touch Tap</span>
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
        )}

        {/* TAB 3: DISPLAY & FULLSCREEN */}
        {activeTab === 'display' && (
          <div className="space-y-4 text-xs font-mono">
            <div className="p-3.5 bg-[#242330] border border-[#3E3C4E] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white block">Full Screen Mode</span>
                  <span className="text-[10.5px] text-[#8E8C9F] block">
                    Expand game viewport to fill your monitor or mobile screen
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    toggleFullscreenState();
                  }}
                  className={`px-3 py-1.5 text-xs font-bold border cursor-pointer min-h-[36px] flex items-center gap-1.5 transition-colors ${
                    isFullscreen
                      ? 'bg-[#EAB308]/20 border-[#EAB308] text-[#FDE047]'
                      : 'bg-[#5B5870] border-[#F4D378] text-white hover:bg-[#6D6A85]'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {isFullscreen ? (
                      <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                    ) : (
                      <path d="M15 3h6v6M9 21H3v-6M21 15v6h-6M3 9V3h6" />
                    )}
                  </svg>
                  <span>{isFullscreen ? 'EXIT FULLSCREEN' : 'TOGGLE FULLSCREEN'}</span>
                </button>
              </div>

              <div className="pt-2 border-t border-[#363445] flex items-center justify-between text-[11px] text-[#A2A0B3]">
                <span>Status: <strong className={isFullscreen ? 'text-[#FDE047]' : 'text-[#8E8C9F]'}>{isFullscreen ? 'Active Fullscreen' : 'Windowed Mode'}</strong></span>
                <span>Keyboard shortcut: <code className="px-1.5 py-0.5 bg-[#171622] border border-[#3B384B] text-[#FCD34D] rounded">F11</code> / <code className="px-1.5 py-0.5 bg-[#171622] border border-[#3B384B] text-[#FCD34D] rounded">Esc</code></span>
              </div>
            </div>

            <div className="p-3 bg-[#1C1B26] border border-[#333144] space-y-1.5 text-[11px] text-[#8E8C9F]">
              <span className="font-semibold text-white block font-display">Display Optimization Tip</span>
              <p>
                Full screen mode locks aspect ratio and removes browser chrome for maximal immersive pixel art gameplay and responsive touch boundaries.
              </p>
            </div>
          </div>
        )}

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
