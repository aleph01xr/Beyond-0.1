import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  RELIC_CATALOG,
  type DifficultyTier,
  type HeroClassId,
  type RoomSummary,
  type UserProfile,
} from '../shared/types.ts';

interface SanctuaryLobbyProps {
  user: UserProfile;
  rooms: RoomSummary[];
  onlineCount: number;
  selectedClass: HeroClassId;
  onSelectClass: (heroClass: HeroClassId) => void;
  onCreateRoom: (opts: {
    name: string;
    difficulty: DifficultyTier;
    seed?: number;
    heroClass: HeroClassId;
  }) => void;
  onJoinRoom: (roomId: string, heroClass: HeroClassId) => void;
  onLogout: () => void;
  errorBanner: string | null;
}

type LobbyTab = 'expeditions' | 'classes' | 'codex' | 'controls';

const PixelHeroPreview: React.FC<{ heroClass: HeroClassId; size?: number }> = ({
  heroClass,
  size = 64,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 24, 24);

    const def = HERO_CLASSES[heroClass];

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(6, 19, 12, 3);

    ctx.fillStyle = def.capeColor;
    ctx.fillRect(6, 9, 12, 9);

    ctx.fillStyle = '#2B2A33';
    ctx.fillRect(8, 18, 3, 3);
    ctx.fillRect(13, 18, 3, 3);

    ctx.fillStyle = def.primaryColor;
    ctx.fillRect(7, 9, 10, 9);

    ctx.fillStyle = def.accentColor;
    ctx.fillRect(7, 14, 10, 2);

    if (heroClass === 'vanguard') {
      ctx.fillStyle = '#A8B5CC';
      ctx.fillRect(7, 3, 10, 7);
      ctx.fillStyle = '#242632';
      ctx.fillRect(9, 6, 6, 2);
      ctx.fillStyle = def.accentColor;
      ctx.fillRect(11, 2, 2, 2);
      ctx.fillStyle = def.accentColor;
      ctx.fillRect(3, 10, 4, 7);
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(18, 4, 2, 10);
      ctx.fillStyle = def.accentColor;
      ctx.fillRect(17, 12, 4, 2);
    } else if (heroClass === 'ranger') {
      ctx.fillStyle = '#385C41';
      ctx.fillRect(7, 3, 10, 6);
      ctx.fillStyle = '#E8C39E';
      ctx.fillRect(9, 6, 6, 3);
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(10, 7, 1, 1);
      ctx.fillRect(13, 7, 1, 1);
      ctx.fillStyle = '#B88446';
      ctx.fillRect(18, 5, 2, 12);
      ctx.fillRect(17, 4, 2, 2);
      ctx.fillRect(17, 16, 2, 2);
    } else if (heroClass === 'arcanist') {
      ctx.fillStyle = '#3B3769';
      ctx.fillRect(6, 5, 12, 2);
      ctx.fillRect(8, 3, 8, 2);
      ctx.fillRect(10, 1, 4, 2);
      ctx.fillStyle = '#E8C39E';
      ctx.fillRect(9, 7, 6, 3);
      ctx.fillStyle = '#7A593C';
      ctx.fillRect(18, 6, 2, 13);
      ctx.fillStyle = '#7CC6FE';
      ctx.fillRect(17, 3, 4, 3);
    } else {
      ctx.fillStyle = '#EAE4D7';
      ctx.fillRect(7, 3, 10, 6);
      ctx.fillStyle = '#E8C39E';
      ctx.fillRect(9, 6, 6, 3);
      ctx.fillStyle = def.accentColor;
      ctx.fillRect(10, 3, 4, 2);
      ctx.fillStyle = '#94A3B8';
      ctx.fillRect(18, 8, 2, 9);
      ctx.fillStyle = '#F4D378';
      ctx.fillRect(17, 5, 4, 4);
    }
  }, [heroClass]);

  return (
    <canvas
      ref={canvasRef}
      width={24}
      height={24}
      style={{ width: size, height: size }}
      className="pixelated shrink-0"
    />
  );
};

export const SanctuaryLobby: React.FC<SanctuaryLobbyProps> = ({
  user,
  rooms,
  onlineCount,
  selectedClass,
  onSelectClass,
  onCreateRoom,
  onJoinRoom,
  onLogout,
  errorBanner,
}) => {
  const [activeTab, setActiveTab] = useState<LobbyTab>('expeditions');
  const [roomName, setRoomName] = useState(`${user.username}'s Party`);
  const [difficulty, setDifficulty] = useState<DifficultyTier>('Normal');
  const [seedInput, setSeedInput] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [muted, setMuted] = useState(() => sfx.isMuted());

  const handleQuickStart = () => {
    sfx.playUiClick();
    const joinable = rooms.find(
      (r) => r.status === 'playing' && r.playerCount < r.maxPlayers
    );
    if (joinable) {
      onJoinRoom(joinable.roomId, selectedClass);
    } else {
      onCreateRoom({
        name: `${user.username}'s Expedition`,
        difficulty,
        heroClass: selectedClass,
      });
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sfx.playUiClick();
    const parsedSeed = seedInput.trim() ? Number(seedInput.trim()) : undefined;
    onCreateRoom({
      name: roomName.trim() || `${user.username}'s Expedition`,
      difficulty,
      seed: parsedSeed && Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      heroClass: selectedClass,
    });
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    sfx.playUiClick();
    onJoinRoom(joinCode.trim().toUpperCase(), selectedClass);
  };

  const currentClassDef = HERO_CLASSES[selectedClass];

  return (
    <div className="min-h-screen bg-[#17171F] text-[#ECEAF2] flex flex-col">
      {/* Responsive Top Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-8 py-3.5 border-b border-[#2D2C3A] bg-[#1C1C26]/95 backdrop-blur-md">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('expeditions');
          }}
          className="font-display text-xl sm:text-2xl font-bold tracking-wider text-[#F4F3F8] whitespace-nowrap shrink-0"
        >
          BEYOND
        </a>

        {/* Horizontal Navigation Scroll Strip */}
        <nav className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar text-xs sm:text-sm font-medium text-[#A9A7B8]">
          {(
            [
              ['expeditions', 'Expeditions'],
              ['classes', 'Hero Classes'],
              ['codex', 'Relic Codex'],
              ['controls', 'Controls'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setActiveTab(id);
              }}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] flex items-center ${
                activeTab === id
                  ? 'border-[#D9AA52] text-white font-semibold'
                  : 'border-transparent hover:text-[#E4E2EC]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleQuickStart}
            className="stone-button px-3.5 py-1.5 sm:px-4 sm:py-2 font-display text-xs sm:text-sm font-semibold text-white whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] flex items-center"
          >
            Quick Co-op
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-[1180px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* User Stats Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#2A2937]">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Sanctuary Keep
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-[#9E9CAE] font-mono tabular-nums">
              <span className="text-[#E6E4EE] font-semibold">{user.username}</span>
              <span aria-hidden="true">·</span>
              <span>{currentClassDef.name}</span>
              <span aria-hidden="true">·</span>
              <span>{onlineCount} Online</span>
              <span aria-hidden="true">·</span>
              <span>Best Floor {user.highestFloor}</span>
              <span aria-hidden="true">·</span>
              <span>{user.totalKills} Slain</span>
              <span aria-hidden="true">·</span>
              <span>{user.totalRevives} Revives</span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs sm:text-sm text-[#B5B3C4]">
            <button
              type="button"
              onClick={() => {
                const next = sfx.toggleMute();
                setMuted(next);
              }}
              className="px-3 py-1.5 bg-[#23222E] border border-[#353445] hover:border-[#57556D] text-[#E6E4EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] flex items-center"
            >
              Audio: {muted ? 'Muted' : 'On'}
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                onLogout();
              }}
              className="px-3 py-1.5 bg-[#23222E] border border-[#353445] hover:border-[#8C464E] text-[#E6E4EE] transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] flex items-center"
            >
              Sign Out
            </button>
          </div>
        </div>

        {errorBanner && (
          <div
            role="alert"
            className="px-4 py-3 bg-[#341F24] border border-[#8E3B46] text-sm text-[#FECACA]"
          >
            {errorBanner}
          </div>
        )}

        {/* TAB 1: EXPEDITIONS */}
        {activeTab === 'expeditions' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Active Parties */}
            <section className="lg:col-span-7 space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl text-white">
                    Active Co-op Expeditions
                  </h2>
                  <p className="text-xs sm:text-sm text-[#9B99AB] mt-0.5">
                    Join open dungeon parties or enter a room code.
                  </p>
                </div>

                <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="BYND-XXXX"
                    maxLength={10}
                    className="w-28 sm:w-32 px-3 py-2 bg-[#22212D] border border-[#38364A] font-mono text-xs text-white placeholder:text-[#747285] focus:outline-none focus:border-[#D9AA52]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-[#2E2D3D] hover:bg-[#3A394D] border border-[#49475E] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] flex items-center"
                  >
                    Join Code
                  </button>
                </form>
              </div>

              {rooms.length === 0 ? (
                <div className="p-8 bg-[#20202B] border border-[#2F2E3E] text-center space-y-3">
                  <p className="font-display text-lg text-[#E6E4EE]">
                    No Open Parties in the Sanctuary
                  </p>
                  <p className="text-xs sm:text-sm text-[#9B99AB] max-w-md mx-auto">
                    Start a new party using the form on this page. Other players on mobile or desktop can join your room code in real time!
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#2C2B3B] border border-[#2F2E3E] bg-[#20202B]">
                  {rooms.map((room) => {
                    const isFull = room.playerCount >= room.maxPlayers;
                    return (
                      <div
                        key={room.roomId}
                        className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 hover:bg-[#252533] transition-colors"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="font-display text-base sm:text-lg text-white">
                              {room.name}
                            </span>
                            <span className="font-mono text-xs text-[#D9AA52] tabular-nums">
                              {room.roomId}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[#9E9CAE] font-mono tabular-nums">
                            <span>Host: {room.hostName}</span>
                            <span aria-hidden="true">·</span>
                            <span>{room.difficulty}</span>
                            <span aria-hidden="true">·</span>
                            <span>Floor {room.floor}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {room.playerCount}/{room.maxPlayers} Heroes
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isFull}
                          onClick={() => {
                            sfx.playUiClick();
                            onJoinRoom(room.roomId, selectedClass);
                          }}
                          className="stone-button px-4 py-2 font-display text-sm text-white disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] flex items-center"
                        >
                          {isFull ? 'Full' : 'Join'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Class Selection Strip */}
              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base sm:text-lg text-white">
                    Selected Hero: {currentClassDef.name}
                  </h3>
                  <span className="text-xs text-[#9E9CAE]">
                    {currentClassDef.weapon}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  {(Object.keys(HERO_CLASSES) as HeroClassId[]).map((cid) => {
                    const c = HERO_CLASSES[cid];
                    const active = selectedClass === cid;
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => {
                          sfx.playAttack(cid);
                          onSelectClass(cid);
                        }}
                        className={`p-3 text-left border transition-colors flex flex-col items-center gap-1.5 cursor-pointer min-h-[90px] ${
                          active
                            ? 'bg-[#2A293A] border-[#D9AA52] text-white'
                            : 'bg-[#20202B] border-[#2F2E3E] text-[#B3B1C2] hover:border-[#49475F]'
                        }`}
                      >
                        <PixelHeroPreview heroClass={cid} size={48} />
                        <div className="text-center">
                          <div className="font-display text-sm sm:text-base">{c.name}</div>
                          <div className="text-[10px] sm:text-[11px] text-[#9A98AA] font-mono tabular-nums">
                            HP {c.maxHp} · DMG {c.damage}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Host New Expedition */}
            <section className="lg:col-span-5 p-5 sm:p-6 bg-[#20202B] border border-[#2F2E3E] space-y-5">
              <div>
                <h2 className="font-display text-xl text-white">
                  Forge New Expedition
                </h2>
                <p className="text-xs sm:text-sm text-[#9B99AB] mt-0.5">
                  Start a seeded multi-floor procedural dungeon.
                </p>
              </div>

              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C6D6]">
                    Expedition Name
                  </label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    maxLength={28}
                    className="w-full px-3.5 py-2.5 bg-[#181821] border border-[#343346] text-sm text-white focus:outline-none focus:border-[#D9AA52]"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-medium text-[#C8C6D6]">
                    Difficulty Tier
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#181821] border border-[#343346]">
                    {(['Normal', 'Heroic', 'Abyssal'] as DifficultyTier[]).map(
                      (tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => {
                            sfx.playUiClick();
                            setDifficulty(tier);
                          }}
                          className={`py-2 px-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer min-h-[40px] flex items-center justify-center ${
                            difficulty === tier
                              ? 'bg-[#343346] text-white'
                              : 'text-[#9B99AB] hover:text-white'
                          }`}
                        >
                          {tier}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#C8C6D6]">
                    Dungeon Seed (Optional)
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={seedInput}
                    onChange={(e) =>
                      setSeedInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))
                    }
                    placeholder="Random procedural seed"
                    className="w-full px-3.5 py-2.5 bg-[#181821] border border-[#343346] font-mono text-sm text-white placeholder:text-[#6E6C80] focus:outline-none focus:border-[#D9AA52]"
                  />
                </div>

                <div className="pt-2 space-y-2 border-t border-[#2D2C3C] text-xs text-[#A5A3B5]">
                  <div className="flex justify-between">
                    <span>Tactical Skill [Q]</span>
                    <span className="text-[#E6E4EE] font-medium truncate max-w-[170px]">
                      {currentClassDef.tacticalName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Co-op Ultimate [R]</span>
                    <span className="text-[#D9AA52] font-medium truncate max-w-[170px]">
                      {currentClassDef.ultName}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="stone-button w-full h-12 font-display text-lg text-white cursor-pointer whitespace-nowrap flex items-center justify-center"
                >
                  Enter the Beyond
                </button>
              </form>
            </section>
          </div>
        )}

        {/* TAB 2: CLASSES */}
        {activeTab === 'classes' && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-white">
                Playable Hero Classes
              </h2>
              <p className="text-xs sm:text-sm text-[#9B99AB] mt-1">
                Each hero features distinct combat attributes, tactical skills, and a co-op Ultimate.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {(Object.keys(HERO_CLASSES) as HeroClassId[]).map((cid) => {
                const c = HERO_CLASSES[cid];
                const isSelected = selectedClass === cid;
                return (
                  <div
                    key={cid}
                    className={`p-5 sm:p-6 bg-[#20202B] border transition-colors flex flex-col justify-between gap-4 ${
                      isSelected ? 'border-[#D9AA52]' : 'border-[#2F2E3E]'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <PixelHeroPreview heroClass={cid} size={68} />
                      <div className="space-y-1">
                        <h3 className="font-display text-xl text-white">
                          {c.name}
                        </h3>
                        <div className="text-xs text-[#9E9CAE] font-mono tabular-nums">
                          {c.title} · HP {c.maxHp} · DMG {c.damage}
                        </div>
                        <p className="text-xs text-[#C7C5D5] pt-0.5">
                          Weapon: {c.weapon}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-[#2C2B3B] text-xs leading-relaxed">
                      <div>
                        <span className="font-semibold text-white">
                          [Q] {c.tacticalName}:
                        </span>{' '}
                        <span className="text-[#B4B2C4]">{c.tacticalDesc}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[#D9AA52]">
                          [R] {c.ultName}:
                        </span>{' '}
                        <span className="text-[#B4B2C4]">{c.ultDesc}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sfx.playAttack(cid);
                        onSelectClass(cid);
                      }}
                      className={`py-2 px-4 font-display text-sm border transition-colors self-start cursor-pointer min-h-[44px] flex items-center ${
                        isSelected
                          ? 'bg-[#D9AA52] border-[#D9AA52] text-[#181820] font-semibold'
                          : 'bg-[#292837] border-[#3F3E54] text-white hover:border-[#6A6887]'
                      }`}
                    >
                      {isSelected ? 'Selected' : `Select ${c.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 3: RELIC CODEX */}
        {activeTab === 'codex' && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-white">
                Ancient Relics Codex
              </h2>
              <p className="text-xs sm:text-sm text-[#9B99AB] mt-1">
                Draft relics from Relic Vaults located in treasure rooms and after defeating floor bosses.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {RELIC_CATALOG.map((relic) => (
                <div
                  key={relic.id}
                  className="p-4 bg-[#20202B] border border-[#2F2E3E] space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      style={{ color: relic.accent }}
                      className="font-display text-lg font-semibold"
                    >
                      {relic.name}
                    </h3>
                    <span className="text-[11px] text-[#9E9CAE] font-mono">
                      {relic.category}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#C7C5D5] leading-relaxed">
                    {relic.summary}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TAB 4: CONTROLS & MOBILE GUIDE */}
        {activeTab === 'controls' && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 sm:p-6 bg-[#20202B] border border-[#2F2E3E] space-y-4">
              <h2 className="font-display text-xl text-white">
                Mobile &amp; Desktop Controls
              </h2>
              <div className="divide-y divide-[#2C2B3B] text-xs sm:text-sm">
                {[
                  ['Move Hero', 'Left On-screen Joystick (Mobile) or WASD / Arrows'],
                  ['Attack & Aim', 'Right Attack Button (Mobile) or Mouse Click'],
                  ['Tactical Skill [Q]', 'Q Button on Touchpad or Q / RMB'],
                  ['Co-op Ultimate [R]', 'R Button on Touchpad or R / Shift'],
                  ['Healing Flask [H]', 'HP Potion Button or H / 1 key'],
                  ['Interact [E]', 'Interact Button or E key'],
                  ['Rally Ping [G]', 'Ping Button or G key'],
                ].map(([action, keys]) => (
                  <div
                    key={action}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <span className="text-[#C7C5D5]">{action}</span>
                    <span className="font-mono text-xs text-[#D9AA52] text-right">
                      {keys}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 sm:p-6 bg-[#20202B] border border-[#2F2E3E] space-y-4">
              <h2 className="font-display text-xl text-white">
                Mobile Co-op Mechanics
              </h2>
              <ul className="space-y-3 text-xs sm:text-sm text-[#C7C5D5] leading-relaxed">
                <li>
                  <strong className="text-white">Smart Auto-Aiming on Touch:</strong>{' '}
                  Tapping the attack or skill buttons on mobile automatically acquires and aims at the nearest enemy target within range.
                </li>
                <li>
                  <strong className="text-white">Analog Virtual Joystick:</strong>{' '}
                  Drag smoothly with your left thumb to move in 360 degrees through dungeon corridors and combat rooms.
                </li>
                <li>
                  <strong className="text-white">Co-op Revivals:</strong>{' '}
                  When an ally falls, stand near their golden ring for 2.2 seconds to revive them.
                </li>
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};
