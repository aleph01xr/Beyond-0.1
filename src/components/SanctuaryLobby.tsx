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
import { PixelHeroPreview } from './PixelHeroPreview.tsx';

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
  const [relicFilter, setRelicFilter] = useState<'all' | 'status' | 'offensive' | 'defensive' | 'mobility' | 'coop'>('all');

  useEffect(() => {
    sfx.startTavernAmbience();

    const handleFirstUserGesture = () => {
      sfx.unlockAudio();
      sfx.startTavernAmbience();
    };

    window.addEventListener('pointerdown', handleFirstUserGesture, { once: true });
    window.addEventListener('keydown', handleFirstUserGesture, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstUserGesture);
      window.removeEventListener('keydown', handleFirstUserGesture);
      sfx.stopTavernAmbience();
    };
  }, []);

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

  const handleEnterTavern = () => {
    sfx.playUiClick();
    onJoinRoom('TAVERN-HUB', selectedClass);
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

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleEnterTavern}
            className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-[#2D231C] border border-[#D9AA52]/60 hover:border-[#D9AA52] text-[#FCD34D] font-display text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] flex items-center gap-1.5"
          >
            <span>🍻</span> Tavern Hub
          </button>
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
              <span className="text-[#FBBF24] font-semibold flex items-center gap-1">
                <span>🔒</span> {currentClassDef.name} ({currentClassDef.title})
              </span>
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
                sfx.unlockAudio();
                if (muted) {
                  sfx.startTavernAmbience(true);
                  setMuted(false);
                } else {
                  sfx.stopTavernAmbience();
                  sfx.toggleMute();
                  setMuted(true);
                }
              }}
              className="px-3.5 py-1.5 bg-[#2B2119] border border-[#D9AA52]/60 hover:border-[#D9AA52] text-[#FCD34D] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[40px] flex items-center gap-1.5"
            >
              <span>🔥</span> Hearth Ambience: {muted ? 'Off' : 'On'}
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
          <div className="space-y-8">
            {/* Tavern Banner Card */}
            <div className="p-6 sm:p-7 bg-gradient-to-r from-[#2A231C] via-[#22202B] to-[#1D1C26] border-2 border-[#D9AA52] flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 opacity-10 text-9xl pointer-events-none select-none font-display">
                🍺
              </div>
              <div className="space-y-2 text-center md:text-left z-10">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-[#D9AA52]/20 border border-[#D9AA52] text-[#FCD34D] font-mono text-xs font-semibold">
                  <span>🍻</span> Multiplayer Social Hub
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                  Sanctuary Tavern & Training Ground
                </h2>
                <p className="text-xs sm:text-sm text-[#BDBACF] max-w-3xl leading-relaxed">
                  Step inside the warm hearth of the Tavern! Meet fellow adventurers, chat in real-time, interact with NPCs (Innkeeper Bram, Barkeep Lena, Veteran Jorah), and test your skills and weapons against training dummies.
                </p>
              </div>
              <button
                type="button"
                onClick={handleEnterTavern}
                className="stone-button px-6 py-3.5 font-display text-base text-white whitespace-nowrap shrink-0 cursor-pointer min-h-[50px] flex items-center justify-center z-10 shadow-lg"
              >
                Enter Tavern Hub
              </button>
            </div>

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

              {/* Locked Soul Oath Hero Card */}
              <div className="p-4 sm:p-5 bg-[#20202B] border-2 border-[#D9AA52] relative overflow-hidden space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#353346] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base sm:text-lg text-white font-semibold">
                      Your Sworn Hero: {currentClassDef.name}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#FCD34D] px-1.5 py-0.5 bg-[#171622] border border-[#3E3C50]">
                      {currentClassDef.roleBadge}
                    </span>
                  </div>
                  <div className="px-2.5 py-1 bg-[#D9AA52]/20 border border-[#D9AA52] text-[#FCD34D] font-mono text-xs flex items-center gap-1.5">
                    <span>🔒</span> Permanent Soul Oath
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                  <div className="p-2.5 bg-[#171622] border border-[#3A384C] shrink-0">
                    <PixelHeroPreview heroClass={currentClassDef.id} size={64} />
                  </div>
                  <div className="space-y-1.5 flex-1 text-center sm:text-left min-w-0">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <span className="text-sm font-display text-[#E2E8F0]">
                        {currentClassDef.title}
                      </span>
                      <span className="text-xs text-[#9E9CAE] font-mono">
                        · {currentClassDef.role}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-xs text-[#9E9CAE] font-mono tabular-nums">
                      <span>Weapon: <strong className="text-white">{currentClassDef.weapon}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>HP: <strong className="text-[#4ADE80]">{currentClassDef.maxHp}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>DMG: <strong className="text-[#F87171]">{currentClassDef.damage}</strong></span>
                      <span aria-hidden="true">·</span>
                      <span>SPD: <strong className="text-[#38BDF8]">{currentClassDef.speed}</strong></span>
                    </div>

                    <p className="text-xs text-[#C7C5D8] leading-relaxed pt-0.5">
                      <strong className="text-[#FBBF24]">Passive [{currentClassDef.passiveName}]:</strong> {currentClassDef.passiveDesc}
                    </p>

                    <p className="text-[11px] text-[#8C8A9E] font-mono pt-1">
                      🔒 This account is locked to this class. To play as another hero class, create a separate adventurer account.
                    </p>
                  </div>
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
         </div>
        )}

        {/* TAB 2: HERO SANCTUM & CODEX */}
        {activeTab === 'classes' && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 p-5 bg-[#1B1A24] border border-[#2F2E3E]">
              <div>
                <h2 className="font-display text-2xl text-white flex items-center gap-2">
                  <span>Grand Hero Sanctum & Codex</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#A8A6B8] mt-1 max-w-2xl leading-relaxed">
                  Every hero represents an unbroken soul oath with specialized abilities, passives, and distinct pixel armaments. Each adventurer account is permanently bonded to 1 class.
                </p>
              </div>
              <div className="p-3 bg-[#242332] border border-[#D9AA52]/40 text-xs text-[#E6E4EE] font-mono shrink-0">
                <div className="text-[#9E9CAE] text-[11px]">Your Sworn Account Oath:</div>
                <div className="text-sm font-display text-[#FCD34D] font-bold flex items-center gap-1.5 mt-0.5">
                  <span>🔒</span> {currentClassDef.name} — {currentClassDef.title}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {(Object.keys(HERO_CLASSES) as HeroClassId[]).map((cid) => {
                const c = HERO_CLASSES[cid];
                const isMyClass = selectedClass === cid;
                return (
                  <div
                    key={cid}
                    className={`p-5 sm:p-6 bg-[#20202B] border-2 transition-all flex flex-col justify-between gap-5 relative overflow-hidden ${
                      isMyClass
                        ? 'border-[#D9AA52] shadow-xl bg-gradient-to-b from-[#252433] to-[#1C1B26]'
                        : 'border-[#2F2E3E] opacity-90'
                    }`}
                  >
                    {/* Top Status Banner */}
                    <div className="flex items-center justify-between gap-2 border-b border-[#2D2C3D] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#FCD34D] px-2 py-0.5 bg-[#161521] border border-[#3E3C50]">
                          {c.roleBadge}
                        </span>
                        <span className="text-xs text-[#9E9CAE] font-mono">
                          {c.role}
                        </span>
                      </div>
                      {isMyClass ? (
                        <div className="px-2.5 py-1 bg-[#D9AA52]/20 border border-[#D9AA52] text-[#FCD34D] font-mono text-xs font-semibold flex items-center gap-1">
                          <span>🔒</span> Your Account Class
                        </div>
                      ) : (
                        <div className="px-2 py-0.5 bg-[#171622] border border-[#38364A] text-[#868498] font-mono text-[11px]">
                          Locked Oath
                        </div>
                      )}
                    </div>

                    {/* Hero Header with Pixel Preview & Core Stats */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                      <div className="p-3 bg-[#15141E] border border-[#353346] shadow-inner shrink-0">
                        <PixelHeroPreview heroClass={cid} size={76} />
                      </div>
                      <div className="space-y-1.5 flex-1 text-center sm:text-left min-w-0">
                        <h3 className="font-display text-xl sm:text-2xl text-white font-semibold">
                          {c.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-[#D9AA52] font-mono">
                          {c.title}
                        </p>
                        <p className="text-xs text-[#E2E8F0]">
                          <strong className="text-[#9E9CAE] font-mono">Armament:</strong> {c.weapon} ({c.weaponType})
                        </p>

                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1 text-xs font-mono tabular-nums">
                          <span className="px-2 py-0.5 bg-[#171622] border border-[#2F2E40] text-[#4ADE80]">
                            HP {c.maxHp}
                          </span>
                          <span className="px-2 py-0.5 bg-[#171622] border border-[#2F2E40] text-[#F87171]">
                            DMG {c.damage}
                          </span>
                          <span className="px-2 py-0.5 bg-[#171622] border border-[#2F2E40] text-[#38BDF8]">
                            RNG {c.range}
                          </span>
                          <span className="px-2 py-0.5 bg-[#171622] border border-[#2F2E40] text-[#FBBF24]">
                            SPD {c.speed}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stat Meters */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3 bg-[#171622] border border-[#2B2A3B] text-xs">
                      {(
                        [
                          ['Survivability', c.stats.survivability],
                          ['Damage', c.stats.damage],
                          ['Range', c.stats.range],
                          ['Mobility', c.stats.mobility],
                          ['Utility', c.stats.utility],
                        ] as [string, number][]
                      ).map(([label, val]) => (
                        <div key={label} className="space-y-1">
                          <div className="text-[10px] text-[#9A98AA] font-mono truncate">{label}</div>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((step) => (
                              <span
                                key={step}
                                className={`h-1.5 flex-1 ${
                                  step <= val
                                    ? isMyClass
                                      ? 'bg-[#FBBF24]'
                                      : 'bg-[#93C5FD]'
                                    : 'bg-[#2B2A3B]'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Innate Resistances Matrix */}
                    <div className="pt-2 border-t border-[#2C2B3B] space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#E2E8F0]">
                        <span className="text-[#D9AA52] font-semibold flex items-center gap-1">
                          <span>🛡️</span> Innate Resistances
                        </span>
                        <span className="text-[10px] text-[#8E8C9E]">Damage Mitigation</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                        <div className="p-1.5 bg-[#171622] border border-[#2B293A] flex flex-col">
                          <span className="text-[#94A3B8]">Physical</span>
                          <span className="font-semibold text-white">+{Math.round(c.resistances.physical * 100)}%</span>
                        </div>
                        <div className="p-1.5 bg-[#171622] border border-[#2B293A] flex flex-col">
                          <span className="text-[#F97316]">🔥 Fire</span>
                          <span className="font-semibold text-white">+{Math.round(c.resistances.fire * 100)}%</span>
                        </div>
                        <div className="p-1.5 bg-[#171622] border border-[#2B293A] flex flex-col">
                          <span className="text-[#38BDF8]">❄️ Frost</span>
                          <span className="font-semibold text-white">+{Math.round(c.resistances.frost * 100)}%</span>
                        </div>
                        <div className="p-1.5 bg-[#171622] border border-[#2B293A] flex flex-col">
                          <span className="text-[#FBBF24]">⚡ Shock</span>
                          <span className="font-semibold text-white">+{Math.round(c.resistances.lightning * 100)}%</span>
                        </div>
                        <div className="p-1.5 bg-[#171622] border border-[#2B293A] flex flex-col">
                          <span className="text-[#22C55E]">☣️ Poison</span>
                          <span className="font-semibold text-white">+{Math.round(c.resistances.poison * 100)}%</span>
                        </div>
                        <div className="p-1.5 bg-[#171622] border border-[#2B293A] flex flex-col">
                          <span className="text-[#EF4444]">🩸 Bleed</span>
                          <span className="font-semibold text-white">+{Math.round(c.resistances.bleed * 100)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Abilities Breakdown */}
                    <div className="space-y-2.5 pt-2 border-t border-[#2C2B3B] text-xs leading-relaxed">
                      <div className="p-2.5 bg-[#1B1A26] border border-[#2D2C3D]">
                        <span className="font-semibold text-[#FDE047] font-mono">
                          ★ Passive — {c.passiveName}:
                        </span>{' '}
                        <span className="text-[#C7C5D6]">{c.passiveDesc}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-white font-mono">
                          [Q] Tactical — {c.tacticalName} ({Math.round(c.tacticalCooldownMs / 1000)}s CD):
                        </span>{' '}
                        <span className="text-[#B4B2C4]">{c.tacticalDesc}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-[#D9AA52] font-mono">
                          [R] Ultimate — {c.ultName} ({Math.round(c.ultCooldownMs / 1000)}s CD):
                        </span>{' '}
                        <span className="text-[#B4B2C4]">{c.ultDesc}</span>
                      </div>
                    </div>

                    {/* Lore Excerpt */}
                    <p className="text-[11px] text-[#8E8C9E] italic border-t border-[#292837] pt-2 leading-relaxed">
                      &quot;{c.lore}&quot;
                    </p>

                    {/* Bottom Action / Lock Notice */}
                    <div className="pt-1">
                      {isMyClass ? (
                        <div className="w-full py-2.5 px-4 bg-[#D9AA52] text-[#181820] font-display font-semibold text-sm text-center flex items-center justify-center gap-1.5 shadow-md">
                          <span>🔒</span> Your Active Expedition Class (Ready to Delve)
                        </div>
                      ) : (
                        <div className="w-full py-2 px-3 bg-[#1A1924] border border-[#333244] text-[#9E9CAE] font-mono text-xs text-center">
                          🔒 Account Locked. To play {c.name}, create a new adventurer account.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 3: RELIC CODEX & STATUS EFFECTS */}
        {activeTab === 'codex' && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display text-2xl text-white">
                Ancient Relics &amp; Status Effects Codex
              </h2>
              <p className="text-xs sm:text-sm text-[#9B99AB] mt-1">
                Draft relics from Relic Vaults located in treasure rooms and after defeating floor bosses to trigger elemental afflictions.
              </p>
            </div>

            {/* Status Effects Mechanics Guide */}
            <div className="bg-[#1C1C27] border border-[#2F2E40] p-4 sm:p-5 space-y-3">
              <h3 className="font-display text-base text-[#D9AA52] flex items-center gap-2">
                <span>⚡</span> Elemental &amp; Combat Status Afflictions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="p-3 bg-[#13131A] border-l-2 border-[#F97316] space-y-1">
                  <div className="font-display text-sm text-[#F97316] font-semibold flex items-center gap-1.5">
                    <span>🔥</span> Burn (Ignite)
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    Ticks fire damage every 0.65s based on your attack power. Extinguishes over 4 seconds.
                  </p>
                </div>

                <div className="p-3 bg-[#13131A] border-l-2 border-[#38BDF8] space-y-1">
                  <div className="font-display text-sm text-[#38BDF8] font-semibold flex items-center gap-1.5">
                    <span>❄️</span> Freeze &amp; Shatter
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    Immobilizes the target completely. Hitting a frozen target triggers <strong className="text-white">Shatter</strong> (+60% damage + frost burst to adjacent foes).
                  </p>
                </div>

                <div className="p-3 bg-[#13131A] border-l-2 border-[#FBBF24] space-y-1">
                  <div className="font-display text-sm text-[#FBBF24] font-semibold flex items-center gap-1.5">
                    <span>⚡</span> Shock &amp; Chain Lightning
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    Electrocutes the foe. The 3rd hit discharges a high-voltage lightning arc jumping to up to 3 nearby enemies.
                  </p>
                </div>

                <div className="p-3 bg-[#13131A] border-l-2 border-[#22C55E] space-y-1">
                  <div className="font-display text-sm text-[#22C55E] font-semibold flex items-center gap-1.5">
                    <span>☣️</span> Acid Poison &amp; Weaken
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    Corrosive venom ticks for 5 seconds and weakens afflicted enemies, reducing their attack damage by 30%.
                  </p>
                </div>

                <div className="p-3 bg-[#13131A] border-l-2 border-[#EF4444] space-y-1">
                  <div className="font-display text-sm text-[#EF4444] font-semibold flex items-center gap-1.5">
                    <span>🩸</span> Lacerate Bleed
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    Inflicts deep open wounds. Bleed damage doubles whenever the afflicted monster moves.
                  </p>
                </div>

                <div className="p-3 bg-[#13131A] border-l-2 border-[#EAB308] space-y-1">
                  <div className="font-display text-sm text-[#EAB308] font-semibold flex items-center gap-1.5">
                    <span>💫</span> Concussive Stun
                  </div>
                  <p className="text-xs text-[#C7C5D6] leading-relaxed">
                    Disorients and completely incapacitates monsters, preventing all attacks and movement.
                  </p>
                </div>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-b border-[#292837] pb-3">
              <span className="text-xs text-[#8E8C9E] font-mono mr-2">Filter Codex:</span>
              {(
                [
                  { id: 'all', label: 'All Relics (12)' },
                  { id: 'status', label: 'Status Procs (6)' },
                  { id: 'offensive', label: 'Offense' },
                  { id: 'defensive', label: 'Defense' },
                  { id: 'mobility', label: 'Mobility' },
                  { id: 'coop', label: 'Co-op' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    setRelicFilter(f.id);
                  }}
                  className={`px-3 py-1 text-xs font-mono transition-colors cursor-pointer ${
                    relicFilter === f.id
                      ? 'bg-[#D9AA52] text-[#14141B] font-semibold shadow-sm'
                      : 'bg-[#20202B] text-[#A5A3B8] hover:text-white border border-[#2E2D3E]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Relic Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {RELIC_CATALOG.filter((relic) => {
                if (relicFilter === 'status') {
                  return [
                    'cinder_heart',
                    'rimefrost_shard',
                    'stormcaller_lodestone',
                    'viper_crucible',
                    'bloodletter_talisman',
                    'thorned_aegis',
                  ].includes(relic.id);
                }
                if (relicFilter === 'offensive') return relic.category === 'Offense';
                if (relicFilter === 'defensive') return relic.category === 'Defense';
                if (relicFilter === 'mobility') return relic.category === 'Mobility';
                if (relicFilter === 'coop') return relic.category === 'Co-op';
                return true;
              }).map((relic) => {
                const isStatusRelic = [
                  'cinder_heart',
                  'rimefrost_shard',
                  'stormcaller_lodestone',
                  'viper_crucible',
                  'bloodletter_talisman',
                  'thorned_aegis',
                ].includes(relic.id);

                return (
                  <div
                    key={relic.id}
                    className="p-4 bg-[#20202B] border border-[#2F2E3E] hover:border-[#4B4961] transition-colors space-y-2 relative"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        style={{ color: relic.accent }}
                        className="font-display text-base sm:text-lg font-semibold flex items-center gap-1.5"
                      >
                        {relic.name}
                      </h3>
                      <span className="text-[11px] text-[#9E9CAE] font-mono px-2 py-0.5 bg-[#171720] border border-[#2B2A3A]">
                        {relic.category}
                      </span>
                    </div>

                    {isStatusRelic && (
                      <div className="text-[10px] font-mono tracking-wider text-[#FCD34D] uppercase">
                        ⚡ Inflicts Status Affliction
                      </div>
                    )}

                    <p className="text-xs sm:text-sm text-[#C7C5D5] leading-relaxed">
                      {relic.summary}
                    </p>
                  </div>
                );
              })}
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
