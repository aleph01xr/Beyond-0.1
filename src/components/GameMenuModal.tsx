import React, { useState } from 'react';
import { HERO_CLASSES, type PlayerState } from '../shared/types.ts';
import { calculatePlayerStatProjections } from '../shared/statUtils.ts';
import { sfx } from '../client/sound.ts';
import { soundManager } from '../client/soundManager.ts';
import { useFullscreenState } from '../client/fullscreen.ts';
import { type TouchSettings } from './TouchControls.tsx';

interface GameMenuModalProps {
  player: PlayerState;
  mapBiome: string;
  isTavern: boolean;
  onClose: () => void;
  onOpenInventory: () => void;
  onOpenAttributes: () => void;
  onOpenMap: () => void;
  onOpenTouchSettings: () => void;
  onOpenAdminPanel?: () => void;
  onReturnToTavern?: () => void;
  onLeaveRoom: () => void;
  isAdmin: boolean;
}

type MenuTab = 'settings' | 'navigation' | 'character';

export const GameMenuModal: React.FC<GameMenuModalProps> = ({
  player,
  mapBiome,
  isTavern,
  onClose,
  onOpenInventory,
  onOpenAttributes,
  onOpenMap,
  onOpenTouchSettings,
  onOpenAdminPanel,
  onReturnToTavern,
  onLeaveRoom,
  isAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<MenuTab>('settings');
  const [isFullscreen, toggleFullscreen] = useFullscreenState();
  const [isMasterMuted, setIsMasterMuted] = useState(() => soundManager.isMasterMuted());
  const [isSfxMuted, setIsSfxMuted] = useState(() => soundManager.isSfxMuted());
  const [isMusicMuted, setIsMusicMuted] = useState(() => soundManager.isMusicMuted());

  const heroDef = HERO_CLASSES[player.heroClass] || HERO_CLASSES.vanguard;
  const stats = calculatePlayerStatProjections(player);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none pb-safe pt-safe pl-safe pr-safe">
      <div className="stone-panel w-full max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden text-white rounded-none">
        
        {/* Header Plaque */}
        <div className="stone-plaque p-2.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-[#D9AA52] bg-[#252336] flex items-center justify-center font-mono font-bold text-[10px] sm:text-xs text-[#FCD34D] shadow shrink-0">
              [MENU]
            </div>
            <div>
              <h2 className="font-mono text-sm sm:text-lg font-bold text-white tracking-wide">
                Sanctuary Master Menu
              </h2>
              <p className="text-[10px] sm:text-xs text-[#A19FAF] font-mono mt-0.5 truncate">
                Expedition Hub · {player.username} ({heroDef.name})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-dark w-8 h-8 sm:w-9 sm:h-9 p-0 text-white font-mono font-bold text-sm sm:text-base flex items-center justify-center"
            title="Close Menu [Esc]"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="stone-plaque border-t border-b border-[#353442] px-2 sm:px-4 flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('settings'); }}
            className={`px-4 py-3 text-xs font-mono font-bold transition-all stone-button ${
              activeTab === 'settings' ? 'stone-button-gold text-black' : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            [SYSTEM SETTINGS]
          </button>
          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('navigation'); }}
            className={`px-4 py-3 text-xs font-mono font-bold transition-all stone-button ${
              activeTab === 'navigation' ? 'stone-button-gold text-black' : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            [NAVIGATION & MENUS]
          </button>
          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('character'); }}
            className={`px-4 py-3 text-xs font-mono font-bold transition-all stone-button ${
              activeTab === 'character' ? 'stone-button-gold text-black' : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            [SOUL OATH & STATS]
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 font-mono text-xs">

          {activeTab === 'settings' && (
            <div className="space-y-4">
              
              {/* Audio Controls */}
              <div className="stone-plaque p-4 space-y-3">
                <div className="text-[#FCD34D] font-bold text-xs border-b border-[#353442] pb-2">
                  AUDIO & MASTER CONTROLS
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      sfx.unlockAudio();
                      const muted = soundManager.toggleMasterMute();
                      setIsMasterMuted(muted);
                    }}
                    className={`stone-button py-2 text-[11px] ${isMasterMuted ? 'stone-button-red' : 'stone-button-green'}`}
                  >
                    Master: {isMasterMuted ? 'Muted' : 'Active'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfx.unlockAudio();
                      const muted = soundManager.toggleSfxMute();
                      setIsSfxMuted(muted);
                      if (!muted) sfx.playUiClick('confirm');
                    }}
                    className={`stone-button py-2 text-[11px] ${isSfxMuted ? 'stone-button-red' : 'stone-button-green'}`}
                  >
                    SFX: {isSfxMuted ? 'Muted' : 'Active'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfx.unlockAudio();
                      const muted = soundManager.toggleMusicMute();
                      setIsMusicMuted(muted);
                    }}
                    className={`stone-button py-2 text-[11px] ${isMusicMuted ? 'stone-button-red' : 'stone-button-green'}`}
                  >
                    Music: {isMusicMuted ? 'Muted' : 'Active'}
                  </button>
                </div>
              </div>

              {/* Display & Touch Settings */}
              <div className="stone-plaque p-4 space-y-3">
                <div className="text-[#FCD34D] font-bold text-xs border-b border-[#353442] pb-2">
                  DISPLAY & TOUCH CONTROLS
                </div>

                <div className="flex items-center justify-between stone-input p-3">
                  <span>Display Mode</span>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      toggleFullscreen();
                    }}
                    className={`stone-button h-8 text-[10px] px-3 ${isFullscreen ? 'stone-button-gold text-black' : 'stone-button-dark'}`}
                  >
                    {isFullscreen ? 'FULLSCREEN' : 'WINDOWED'}
                  </button>
                </div>

                <div className="flex items-center justify-between stone-input p-3">
                  <span>Mobile Virtual Touch Controls</span>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      onOpenTouchSettings();
                      onClose();
                    }}
                    className="stone-button stone-button-dark h-8 text-[10px] px-3"
                  >
                    Configure Touch
                  </button>
                </div>
              </div>

              {/* Session Controls */}
              <div className="stone-plaque p-4 space-y-3">
                <div className="text-[#EF4444] font-bold text-xs border-b border-[#353442] pb-2">
                  SESSION MANAGEMENT
                </div>

                <div className="flex flex-col gap-2.5">
                  {!isTavern && onReturnToTavern && (
                    <button
                      type="button"
                      onClick={() => {
                        sfx.playUiClick();
                        onClose();
                        onReturnToTavern();
                      }}
                      className="stone-button stone-button-blue py-3"
                    >
                      Return to Sanctuary Tavern Hub
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      onClose();
                      onLeaveRoom();
                    }}
                    className="stone-button stone-button-red py-3"
                  >
                    {isTavern ? 'Exit to Lobby' : 'Leave Party & Return to Lobby'}
                  </button>

                  {isAdmin && onOpenAdminPanel && (
                    <button
                      type="button"
                      onClick={() => {
                        sfx.playUiClick();
                        onClose();
                        onOpenAdminPanel();
                      }}
                      className="stone-button stone-button-gold py-3 text-black font-bold"
                    >
                      Open Developer Admin Console
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'navigation' && (
            <div className="space-y-4">
              <div className="stone-plaque p-4 space-y-3">
                <div className="text-[#FCD34D] font-bold text-xs border-b border-[#353442] pb-2">
                  QUICK NAVIGATION & MENUS
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      onClose();
                      onOpenMap();
                    }}
                    className="stone-button stone-button-gold py-4 flex flex-col gap-1 text-black font-bold"
                  >
                    <span className="text-base">[M]</span>
                    <span>Tactical Map</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      onClose();
                      onOpenInventory();
                    }}
                    className="stone-button stone-button-dark py-4 flex flex-col gap-1 text-white"
                  >
                    <span className="text-base text-[#FCD34D]">[I]</span>
                    <span>Inventory & Relics</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sfx.playUiClick();
                      onClose();
                      onOpenAttributes();
                    }}
                    className="stone-button stone-button-gold py-4 flex flex-col gap-1 text-black font-bold"
                  >
                    <span className="text-base">[P]</span>
                    <span>Attributes Allocation</span>
                  </button>
                </div>
              </div>

              <div className="stone-input p-4 space-y-2 text-[#A19FAF]">
                <div className="text-white font-bold">Hotkeys Reference:</div>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong className="text-white">WASD / Arrow Keys</strong>: Move Adventurer</li>
                  <li><strong className="text-white">Mouse Aim & Click</strong>: Attack / Action</li>
                  <li><strong className="text-white">I / Tab</strong>: Open Inventory & Relic Vault</li>
                  <li><strong className="text-white">M</strong>: Open Expanded Tactical Map</li>
                  <li><strong className="text-white">E</strong>: Interact with Chests, Shrines & NPCs</li>
                  <li><strong className="text-white">Esc</strong>: Open Master Sanctuary Menu</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'character' && (
            <div className="space-y-4">
              <div className="stone-plaque p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#353442] pb-2">
                  <span className="text-[#FCD34D] font-bold">SOUL OATH & CLASS IDENTITY</span>
                  <span className="text-xs px-2 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                    {heroDef.roleBadge}
                  </span>
                </div>

                <div className="stone-input p-3 space-y-2">
                  <div className="text-white font-bold text-sm">
                    {heroDef.name} — {heroDef.title}
                  </div>
                  <p className="text-xs text-[#A19FAF] leading-relaxed">
                    {heroDef.lore}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="stone-input p-3 space-y-1">
                    <span className="text-[#A19FAF] text-[10px] uppercase block">Primary Weapon</span>
                    <span className="font-bold text-[#FCD34D]">{heroDef.weapon}</span>
                  </div>
                  <div className="stone-input p-3 space-y-1">
                    <span className="text-[#A19FAF] text-[10px] uppercase block">Class Passive</span>
                    <span className="font-bold text-[#38BDF8]">{heroDef.passiveName}</span>
                  </div>
                </div>

                <div className="stone-input p-3 space-y-2">
                  <div className="text-[#34D399] font-bold">Combat Projections Summary</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 stone-plaque">
                      <div className="text-[9px] text-[#A19FAF]">Max HP</div>
                      <div className="font-bold text-[#10B981]">{stats.maxHp}</div>
                    </div>
                    <div className="p-2 stone-plaque">
                      <div className="text-[9px] text-[#A19FAF]">Target DPS</div>
                      <div className="font-bold text-[#FCD34D]">{stats.sustainedDps}</div>
                    </div>
                    <div className="p-2 stone-plaque">
                      <div className="text-[9px] text-[#A19FAF]">Crit Rate</div>
                      <div className="font-bold text-[#38BDF8]">{stats.critChancePct}%</div>
                    </div>
                    <div className="p-2 stone-plaque">
                      <div className="text-[9px] text-[#A19FAF]">Phys Armor</div>
                      <div className="font-bold text-[#60A5FA]">{stats.physicalResistPct}%</div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Footer Plaque */}
        <div className="stone-plaque p-3 px-6 flex items-center justify-between shrink-0 text-xs font-mono text-[#A19FAF]">
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white">Esc</kbd> to resume game.
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-gold py-1.5 px-6 text-xs font-bold text-black"
          >
            Resume Expedition
          </button>
        </div>

      </div>
    </div>
  );
};
