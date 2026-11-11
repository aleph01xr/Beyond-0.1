import React, { useEffect, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  type DifficultyTier,
  type HeroClassId,
  type RoomSummary,
} from '../shared/types.ts';

interface ExpeditionGateModalProps {
  userHeroClass: HeroClassId;
  defaultHostName: string;
  rooms?: RoomSummary[];
  onCreateExpedition: (opts: {
    name: string;
    difficulty: DifficultyTier;
    seed?: number;
    heroClass: HeroClassId;
  }) => void;
  onJoinExpedition: (roomId: string, heroClass: HeroClassId) => void;
  onClose: () => void;
}

type GateTab = 'create' | 'join' | 'finder';

export const ExpeditionGateModal: React.FC<ExpeditionGateModalProps> = ({
  userHeroClass,
  defaultHostName,
  rooms = [],
  onCreateExpedition,
  onJoinExpedition,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<GateTab>('create');
  const [expeditionName, setExpeditionName] = useState(
    `${defaultHostName}'s Expedition`
  );
  const [difficulty, setDifficulty] = useState<DifficultyTier>('Normal');
  const [seedInput, setSeedInput] = useState('');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Filter out the Tavern social room so only actual expeditions appear
  const activeExpeditions = rooms.filter(
    (r) => r.roomId !== 'TAVERN-HUB' && r.status === 'playing'
  );

  const handleLaunchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sfx.playUiClick('confirm');
    const parsedSeed = seedInput.trim() ? Number(seedInput.trim()) : undefined;
    onCreateExpedition({
      name: expeditionName.trim() || `${defaultHostName}'s Expedition`,
      difficulty,
      seed: parsedSeed && Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      heroClass: userHeroClass,
    });
    onClose();
  };

  const handleJoinByCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCodeInput.trim().toUpperCase();
    if (!cleanCode) {
      setErrorMsg('Please enter an expedition room code.');
      return;
    }
    sfx.playUiClick('confirm');
    onJoinExpedition(cleanCode, userHeroClass);
    onClose();
  };

  const handleQuickJoin = (roomId: string) => {
    sfx.playUiClick('confirm');
    onJoinExpedition(roomId, userHeroClass);
    onClose();
  };

  const classDef = HERO_CLASSES[userHeroClass] || HERO_CLASSES.vanguard;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5 animate-in fade-in duration-200 pb-safe pt-safe pl-safe pr-safe"
    >
      <div className="stone-panel max-w-2xl w-full max-h-[92dvh] overflow-y-auto p-3.5 sm:p-7 space-y-4 sm:space-y-6 relative border-2 border-[#D9AA52] shadow-[0_0_50px_rgba(217,170,82,0.2)]">
        {/* Close Button */}
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-dark absolute top-4 right-4 w-9 h-9 p-0"
            title="Close Gate (Esc)"
            aria-label="Close Gate"
          >
            ✕
          </button>

        {/* Header */}
        <div className="space-y-1.5 pr-10">
          <div className="flex items-center gap-2">
            <span className="text-2xl"></span>
            <h2
              id="gate-title"
              className="font-display text-2xl sm:text-3xl font-bold text-[#FDE68A] tracking-wide"
            >
              Expedition Gate
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-[#C8C5D8] font-sans leading-relaxed">
            Step through the dimensional rift to venture into the depths of Beyond.
            You will enter your own independent multiplayer dungeon instance while other visitors remain safe in the Sanctuary Tavern.
          </p>
        </div>

        {/* Character & Party Notice */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#1A1926] border border-[#3A384F] text-xs font-mono">
          <div className="flex items-center gap-2 text-[#E6E4EE]">
            <span className="text-[#D9AA52]">Embarking as:</span>
            <span className="font-display text-white font-semibold">
              {defaultHostName}
            </span>
            <span className="text-[#7DD3FC]">({classDef.name})</span>
          </div>
          <div className="text-[#94A3B8]">
            Party Size: <span className="text-[#FBBF24]">1-4 Players</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#3A384F] gap-1">
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setActiveTab('create');
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 font-display text-sm font-semibold transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'create'
                ? 'border-[#D9AA52] text-[#FDE68A] bg-[#2A2938]'
                : 'border-transparent text-[#9D9AAC] hover:text-white hover:bg-[#201F2C]'
            }`}
          >
            Launch Expedition
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setActiveTab('join');
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 font-display text-sm font-semibold transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'join'
                ? 'border-[#D9AA52] text-[#FDE68A] bg-[#2A2938]'
                : 'border-transparent text-[#9D9AAC] hover:text-white hover:bg-[#201F2C]'
            }`}
          >
            Join Code
          </button>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              setActiveTab('finder');
              setErrorMsg(null);
            }}
            className={`px-4 py-2.5 font-display text-sm font-semibold transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
              activeTab === 'finder'
                ? 'border-[#D9AA52] text-[#FDE68A] bg-[#2A2938]'
                : 'border-transparent text-[#9D9AAC] hover:text-white hover:bg-[#201F2C]'
            }`}
          >
            Parties ({activeExpeditions.length})
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/70 border border-rose-500 text-rose-200 text-xs font-mono">
            {errorMsg}
          </div>
        )}

        {/* Tab Content: Launch Expedition */}
        {activeTab === 'create' && (
          <form onSubmit={handleLaunchSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="expedition-name"
                className="block text-xs font-semibold text-[#D8D6E8] uppercase tracking-wider"
              >
                Expedition Name
              </label>
              <input
                id="expedition-name"
                type="text"
                value={expeditionName}
                onChange={(e) => setExpeditionName(e.target.value)}
                maxLength={32}
                placeholder="Name your dungeon run..."
                className="w-full px-3.5 py-2.5 bg-[#1B1A26] border border-[#3A384F] focus:border-[#D9AA52] font-sans text-sm text-white placeholder-[#6E6C82] outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#D8D6E8] uppercase tracking-wider">
                Select Difficulty Tier
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(['Normal', 'Heroic', 'Abyssal'] as DifficultyTier[]).map(
                  (tier) => {
                    const isSelected = difficulty === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => {
                          sfx.playUiClick();
                          setDifficulty(tier);
                        }}
                        className={`p-3 text-left border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#312B20] border-[#D9AA52] shadow-sm'
                            : 'bg-[#1D1C28] border-[#333144] hover:border-[#524F6D]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-display text-sm font-bold ${
                              isSelected ? 'text-[#FDE68A]' : 'text-white'
                            }`}
                          >
                            {tier}
                          </span>
                          {tier === 'Normal' && (
                            <span className="text-[10px] text-emerald-400 font-mono">
                              Balanced
                            </span>
                          )}
                          {tier === 'Heroic' && (
                            <span className="text-[10px] text-amber-400 font-mono">
                              +50% XP
                            </span>
                          )}
                          {tier === 'Abyssal' && (
                            <span className="text-[10px] text-rose-400 font-mono">
                              +100% XP
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#A6A3B8] mt-1 leading-snug">
                          {tier === 'Normal' &&
                            'Standard monsters, balanced hazards. Best for all adventurers.'}
                          {tier === 'Heroic' &&
                            'Enemies strike harder with deadlier elite affixes.'}
                          {tier === 'Abyssal' &&
                            'Relentless swarms, catastrophic damage, merciless bosses.'}
                        </p>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="expedition-seed"
                className="block text-xs font-semibold text-[#D8D6E8] uppercase tracking-wider"
              >
                World Seed <span className="text-[#848296] font-normal">(Optional)</span>
              </label>
              <input
                id="expedition-seed"
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.replace(/\D/g, ''))}
                maxLength={8}
                placeholder="Leave blank for random dungeon layout"
                className="w-full px-3.5 py-2 bg-[#1B1A26] border border-[#3A384F] focus:border-[#D9AA52] font-mono text-xs text-white placeholder-[#6E6C82] outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  onClose();
                }}
                className="stone-button stone-button-dark"
              >
                Stay in Tavern
              </button>
              <button
                type="submit"
                className="stone-button stone-button-gold px-8 h-12 text-base font-bold shadow-lg"
              >
                Embark on Floor 1
              </button>
            </div>
          </form>
        )}

        {/* Tab Content: Join by Room Code */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinByCodeSubmit} className="space-y-5">
            <div className="p-4 bg-[#1B1A26] border border-[#3A384F] space-y-2">
              <label
                htmlFor="gate-room-code"
                className="block text-xs font-semibold text-[#D8D6E8] uppercase tracking-wider"
              >
                Enter Expedition Room Code
              </label>
              <p className="text-xs text-[#9B99AC]">
                Enter the party room code shared by your party host (e.g.,{' '}
                <span className="font-mono text-[#D9AA52]">BYND-7482</span>).
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="gate-room-code"
                  type="text"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  placeholder="BYND-XXXX"
                  maxLength={10}
                  className="flex-1 px-4 py-3 bg-[#111019] border border-[#44425C] focus:border-[#D9AA52] font-mono text-base text-white tracking-widest text-center uppercase outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  className="stone-button stone-button-gold px-8 h-12 text-base"
                >
                  Join Party
                </button>
              </div>
            </div>

            <div className="text-center text-xs text-[#8E8C9E]">
              Tip: Room codes allow party members to connect directly without joining the host's Tavern session.
            </div>
          </form>
        )}

        {/* Tab Content: Active Expeditions (Party Finder) */}
        {activeTab === 'finder' && (
          <div className="space-y-3">
            {activeExpeditions.length === 0 ? (
              <div className="p-8 bg-[#1B1A26] border border-[#3A384F] text-center space-y-2">
                <p className="font-display text-base text-[#FDE68A]">
                  No Public Expeditions in Progress
                </p>
                <p className="text-xs text-[#9B99AB] max-w-sm mx-auto">
                  No other heroes are currently inside a dungeon run. Switch to{' '}
                  <span className="text-[#D9AA52]">Launch Expedition</span> to begin one, or invite other players in Tavern chat!
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1 divide-y divide-[#2B293A]">
                {activeExpeditions.map((room) => {
                  const isFull = room.playerCount >= room.maxPlayers;
                  return (
                    <div
                      key={room.roomId}
                      className="pt-2 first:pt-0 flex flex-wrap items-center justify-between gap-3 p-3 bg-[#1C1B28] hover:bg-[#252336] border border-[#343248] transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-semibold text-sm text-white">
                            {room.name}
                          </span>
                          <span className="px-1.5 py-0.5 bg-[#D9AA52]/20 border border-[#D9AA52]/40 font-mono text-[11px] text-[#FDE68A]">
                            {room.roomId}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[#A8A5B9] font-mono">
                          <span>Host: {room.hostName}</span>
                          <span>·</span>
                          <span
                            className={
                              room.difficulty === 'Abyssal'
                                ? 'text-rose-400 font-semibold'
                                : room.difficulty === 'Heroic'
                                  ? 'text-amber-400 font-semibold'
                                  : 'text-emerald-400 font-semibold'
                            }
                          >
                            {room.difficulty}
                          </span>
                          <span>·</span>
                          <span>Floor {room.floor}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-xs font-mono text-[#D4D2E0] text-right">
                          <span
                            className={
                              isFull ? 'text-rose-400' : 'text-emerald-400'
                            }
                          >
                            {room.playerCount}/{room.maxPlayers}
                          </span>
                          <div className="text-[10px] text-[#7C7A8E]">Players</div>
                        </div>

                        <button
                          type="button"
                          disabled={isFull}
                          onClick={() => handleQuickJoin(room.roomId)}
                          className={`stone-button h-10 px-6 text-xs ${isFull ? 'stone-button-dark opacity-50' : 'stone-button-blue'}`}
                        >
                          {isFull ? 'Party Full' : 'Join Party'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
