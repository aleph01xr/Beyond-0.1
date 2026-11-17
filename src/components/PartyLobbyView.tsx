import React, { useEffect, useRef, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  MAX_ATTRIBUTE,
  MAX_LEVEL,
  type ChatMessage,
  type ClientMessage,
  type GameSnapshot,
} from '../shared/types.ts';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';

interface PartyLobbyViewProps {
  playerId: string;
  snapshot: GameSnapshot;
  chatMessages: ChatMessage[];
  errorBanner: string | null;
  onDismissError: () => void;
  onStartExpedition: () => void;
  onToggleReady: (ready?: boolean) => void;
  onLeaveRoom: () => void;
  onReturnToTavern: () => void;
  onSendChat: (text: string) => void;
  onSendCommand?: (msg: ClientMessage) => void;
}

export const PartyLobbyView: React.FC<PartyLobbyViewProps> = ({
  playerId,
  snapshot,
  chatMessages,
  errorBanner,
  onDismissError,
  onStartExpedition,
  onToggleReady,
  onLeaveRoom,
  onReturnToTavern,
  onSendChat,
  onSendCommand,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const lastChatIdRef = useRef<string | null>(
    chatMessages.length > 0 ? chatMessages[chatMessages.length - 1].id : null
  );
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const me = snapshot.players.find((p) => p.id === playerId) || snapshot.players[0];
  const isHost = Boolean(
    snapshot.hostId ? snapshot.hostId === playerId : snapshot.hostName === me?.username
  );
  const connectedMembers = snapshot.players.filter((p) => p.connected);
  const readyCount = connectedMembers.filter((p) => Boolean(p.ready)).length;
  const allReady = connectedMembers.length > 0 && readyCount === connectedMembers.length;
  const meReady = Boolean(me?.ready);
  const maxSlots = 4;
  const slots = Array.from({ length: maxSlots }, (_, idx) => snapshot.players[idx] ?? null);

  useEffect(() => {
    if (chatMessages.length === 0) return;
    const latest = chatMessages[chatMessages.length - 1];
    if (latest.id !== lastChatIdRef.current) {
      lastChatIdRef.current = latest.id;
      if (latest.system) {
        setNoticeBanner(latest.text);
      }
    }
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!noticeBanner) return;
    const t = window.setTimeout(() => setNoticeBanner(null), 5000);
    return () => window.clearTimeout(t);
  }, [noticeBanner]);

  const handleCopyCode = () => {
    sfx.playUiClick();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(snapshot.roomId).catch(() => {});
    }
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatDraft.trim();
    if (!trimmed) return;
    onSendChat(trimmed);
    setChatDraft('');
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#15151D] text-[#ECEAF2] flex flex-col">
      {/* Top Party Header */}
      <header className="sticky top-0 z-30 border-b border-[#2F2E3F] bg-[#1B1B26]/95 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-[1160px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <span className="font-display text-lg sm:text-xl font-bold tracking-wider text-[#FDE68A]">
              BEYOND
            </span>
            <span className="text-[#4B4962]" aria-hidden="true">/</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-lg sm:text-xl font-semibold text-white truncate">
                  {snapshot.roomName}
                </h1>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  title="Copy Party Code"
                  className="px-2.5 py-0.5 bg-[#252434] border border-[#D9AA52]/60 hover:border-[#D9AA52] font-mono text-xs text-[#FCD34D] cursor-pointer"
                >
                  {copiedCode ? 'Copied Code!' : snapshot.roomId}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#A6A4B8] tabular-nums mt-0.5">
                <span className="text-[#6EE7B7] font-semibold">
                  Waiting Lobby ({snapshot.players.length}/{maxSlots})
                </span>
                <span aria-hidden="true">·</span>
                <span>Host: <strong className="text-[#FDE68A]">{snapshot.hostName || 'Unknown'}</strong></span>
                <span aria-hidden="true">·</span>
                <span>{snapshot.difficulty}</span>
                <span aria-hidden="true">·</span>
                <span>Seed {snapshot.seed}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {me && (
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setAttributesOpen(true);
                }}
                className="stone-button stone-button-dark text-xs py-1.5 px-3 relative"
              >
                <span>Attributes</span>
                {me.attributePoints > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 bg-[#FACC15] text-black font-mono text-[10px] font-bold">
                    {me.attributePoints}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                onReturnToTavern();
              }}
              className="stone-button stone-button-blue text-xs py-1.5 px-3"
            >
              Tavern Hub
            </button>
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                onLeaveRoom();
              }}
              className="stone-button stone-button-dark text-xs py-1.5 px-3"
            >
              Leave Party
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1160px] mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Error & Real-Time Party Event Notifications */}
        {errorBanner && (
          <div
            role="alert"
            className="px-4 py-3 bg-[#341F24] border border-[#8E3B46] text-sm text-[#FECACA] flex items-center justify-between gap-3"
          >
            <span>{errorBanner}</span>
            <button
              type="button"
              onClick={onDismissError}
              className="text-xs font-mono text-[#FCA5A5] hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {noticeBanner && (
          <div className="px-4 py-2.5 bg-[#232234] border border-[#D9AA52]/70 text-xs sm:text-sm font-mono text-[#FDE68A] flex items-center justify-between gap-3">
            <span>{noticeBanner}</span>
            <button
              type="button"
              onClick={() => setNoticeBanner(null)}
              className="text-[11px] text-[#A9A7BA] hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Previous Run Summary Banner (after Victory or Defeat) */}
        {snapshot.lastRunSummary && (
          <section className="p-4 bg-[#1E1D2A] border border-[#3B394F] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2F2E40] pb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`font-display text-base font-bold ${
                    snapshot.lastRunSummary.outcome === 'victory'
                      ? 'text-[#FDE68A]'
                      : 'text-[#FCA5A5]'
                  }`}
                >
                  Last Expedition: {snapshot.lastRunSummary.outcome === 'victory' ? 'Victory!' : 'Fallen'}
                </span>
                <span className="font-mono text-xs text-[#A5A3B8] tabular-nums">
                  Floor {snapshot.lastRunSummary.floor} · {formatTime(snapshot.lastRunSummary.elapsedSec)}
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#6EE7B7]">
                Party Unlocked · Ready for Next Expedition
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
              {snapshot.lastRunSummary.players.map((rp) => (
                <div
                  key={rp.id}
                  className="px-3 py-2 bg-[#161520] border border-[#2D2C3D] flex items-center justify-between gap-2"
                >
                  <span className="text-white truncate">{rp.username}</span>
                  <span className="text-[#C7C5D8] whitespace-nowrap">
                    {rp.kills}K · {rp.revives}R
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Party Roster Slots & Host Controls */}
          <section className="lg:col-span-7 space-y-5">
            <div className="stone-panel p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#343246] pb-3">
                <div>
                  <h2 className="font-display text-xl text-white font-semibold">
                    Expedition Party Roster
                  </h2>
                  <p className="text-xs text-[#9E9CAE] mt-0.5">
                    Share code <span className="font-mono text-[#FCD34D]">{snapshot.roomId}</span> so allies can join before entering Floor 1. Once started, the party locks until the run concludes.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 border font-mono text-xs tabular-nums ${
                      allReady
                        ? 'bg-[#143325] border-[#4ADE80]/70 text-[#86EFAC]'
                        : 'bg-[#181722] border-[#3B3950] text-[#FCD34D]'
                    }`}
                  >
                    {readyCount} / {connectedMembers.length} Ready
                  </span>
                  <span className="px-2.5 py-1 bg-[#181722] border border-[#3B3950] font-mono text-xs text-[#6EE7B7] tabular-nums">
                    {snapshot.players.length} / {maxSlots} Slots
                  </span>
                </div>
              </div>

              {/* 4 Party Slots */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {slots.map((member, slotIdx) => {
                  if (!member) {
                    return (
                      <div
                        key={`empty_${slotIdx}`}
                        className="p-4 bg-[#171622] border border-dashed border-[#343248] flex items-center gap-3 min-h-[104px]"
                      >
                        <div className="w-12 h-12 bg-[#12111B] border border-[#2B293C] flex items-center justify-center font-mono text-xs text-[#5E5C73]">
                          #{slotIdx + 1}
                        </div>
                        <div className="space-y-1">
                          <div className="font-display text-sm text-[#8B89A0]">
                            Available Party Slot
                          </div>
                          <div className="font-mono text-[11px] text-[#66647B]">
                            Open · Invite via {snapshot.roomId}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const def = HERO_CLASSES[member.heroClass];
                  const memberIsHost = snapshot.hostId
                    ? snapshot.hostId === member.id
                    : snapshot.hostName === member.username;
                  const isSelf = member.id === playerId;

                  const isMemberReady = Boolean(member.ready);

                  return (
                    <div
                      key={member.id}
                      className={`p-3.5 border flex items-center gap-3.5 min-h-[108px] transition-colors ${
                        memberIsHost
                          ? 'bg-[#23202E] border-[#D9AA52]'
                          : isMemberReady && member.connected
                          ? 'bg-[#182421] border-[#3B8F66]'
                          : 'bg-[#1D1C28] border-[#38364C]'
                      }`}
                    >
                      <div className="p-1.5 bg-[#14131D] border border-[#343246] shrink-0">
                        <PixelHeroPreview heroClass={member.heroClass} size={48} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-display text-base font-semibold text-white truncate">
                            {member.username}
                          </span>
                          {isSelf && (
                            <span className="text-[10px] font-mono text-[#93C5FD]">(You)</span>
                          )}
                          {memberIsHost && (
                            <span className="px-1.5 py-0.2 bg-[#D9AA52]/25 border border-[#D9AA52] text-[#FDE68A] font-mono text-[10px] font-bold">
                              HOST
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-[#C7C5D8] flex items-center gap-2 tabular-nums">
                          <span style={{ color: def.accentColor }}>{def.name}</span>
                          <span aria-hidden="true">·</span>
                          <span>Lv.{member.level}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <span className="text-[#9E9CAE]">{def.roleBadge}</span>
                          {!member.connected ? (
                            <span className="px-2 py-0.5 bg-[#3B1E24] border border-[#8E3B46] text-[#FCA5A5] text-[10px]">
                              Disconnected
                            </span>
                          ) : isSelf ? (
                            <button
                              type="button"
                              aria-pressed={isMemberReady}
                              onClick={() => {
                                sfx.playUiClick(isMemberReady ? 'default' : 'confirm');
                                onToggleReady(!isMemberReady);
                              }}
                              className={`px-2.5 py-0.5 border font-mono text-[10px] font-bold tracking-wide cursor-pointer transition-colors ${
                                isMemberReady
                                  ? 'bg-[#166534] border-[#4ADE80] text-[#DCFCE7] hover:bg-[#15803D]'
                                  : 'bg-[#282538] border-[#D9AA52]/70 text-[#FDE68A] hover:border-[#FDE68A] hover:bg-[#322E46]'
                              }`}
                            >
                              {isMemberReady ? '✓ READY' : 'READY UP'}
                            </button>
                          ) : (
                            <span
                              className={`px-2 py-0.5 border text-[10px] font-bold tracking-wide ${
                                isMemberReady
                                  ? 'bg-[#14532D]/60 border-[#4ADE80]/70 text-[#86EFAC]'
                                  : 'bg-[#272320] border-[#785C3A] text-[#FCD34D]'
                              }`}
                            >
                              {isMemberReady ? '✓ READY' : 'NOT READY'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Start Expedition & Ready Bar */}
              <div className="pt-3 border-t border-[#343246] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {isHost ? (
                  <>
                    <div className="text-xs text-[#C7C5D8] space-y-0.5">
                      <div className="font-semibold text-[#FDE68A]">You are the Party Host</div>
                      <div className={allReady ? 'text-[#86EFAC] font-mono' : 'text-[#9E9CAE]'}>
                        {allReady
                          ? `All ${connectedMembers.length} party members are Ready!`
                          : `${readyCount} of ${connectedMembers.length} party members ready · Start whenever everyone is prepared.`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        aria-pressed={meReady}
                        onClick={() => {
                          sfx.playUiClick(meReady ? 'default' : 'confirm');
                          onToggleReady(!meReady);
                        }}
                        className={`stone-button px-4 py-3 text-xs font-bold whitespace-nowrap ${
                          meReady ? 'stone-button-blue' : 'stone-button-dark'
                        }`}
                      >
                        {meReady ? '✓ Ready' : 'Set Ready'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sfx.playUiClick('confirm');
                          onStartExpedition();
                        }}
                        className="stone-button stone-button-gold px-7 py-3.5 text-base font-bold shadow-lg whitespace-nowrap"
                      >
                        Start Expedition
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="w-full p-3.5 bg-[#181722] border border-[#343248] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="font-display text-sm text-[#FDE68A]">
                        {meReady ? 'You are Ready for Battle' : 'Toggle Ready When Prepared'}
                      </div>
                      <div className="text-xs font-mono text-[#9E9CAE]">
                        {snapshot.hostName} controls when the party enters Floor 1 ({readyCount}/{connectedMembers.length} ready).
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={meReady}
                      onClick={() => {
                        sfx.playUiClick(meReady ? 'default' : 'confirm');
                        onToggleReady(!meReady);
                      }}
                      className={`stone-button px-5 py-2.5 text-xs font-bold shrink-0 ${
                        meReady ? 'stone-button-blue' : 'stone-button-gold text-black'
                      }`}
                    >
                      {meReady ? '✓ Ready (Click to Cancel)' : 'Ready Up'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right Column: Real-Time Party Chat & Expedition Briefing */}
          <section className="lg:col-span-5 space-y-4">
            <div className="stone-panel flex flex-col h-[380px]">
              <div className="px-4 py-3 border-b border-[#343246] flex items-center justify-between bg-[#191823]">
                <h2 className="font-display text-base font-semibold text-white">
                  Party Lobby Log &amp; Chat
                </h2>
                <span className="font-mono text-[11px] text-[#9E9CAE]">
                  {chatMessages.length} msgs
                </span>
              </div>

              <div
                ref={chatScrollRef}
                className="flex-1 overflow-y-auto p-3.5 space-y-2 text-xs sm:text-sm"
              >
                {chatMessages.length === 0 ? (
                  <div className="text-xs text-[#7E7C94] font-mono">
                    No messages yet. Coordinate hero roles or share the room code.
                  </div>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id} className="leading-relaxed">
                      <span
                        className={`font-semibold ${
                          m.system ? 'text-[#FCD34D]' : 'text-[#60A5FA]'
                        }`}
                      >
                        {m.sender}:
                      </span>{' '}
                      <span className="text-[#EAE8F2]">{m.text}</span>
                    </div>
                  ))
                )}
              </div>

              <form
                onSubmit={handleChatSubmit}
                className="p-3 border-t border-[#343246] flex gap-2 bg-[#171622]"
              >
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  placeholder="Chat with your party..."
                  maxLength={160}
                  className="flex-1 px-3 py-2 bg-[#111019] border border-[#38364C] text-xs sm:text-sm text-white focus:outline-none focus:border-[#D9AA52]"
                />
                <button
                  type="submit"
                  className="stone-button stone-button-gold px-4 py-2 text-xs font-bold text-black"
                >
                  Send
                </button>
              </form>
            </div>

            <div className="p-4 bg-[#1B1A26] border border-[#323044] text-xs space-y-1.5 text-[#B4B2C6]">
              <div className="font-display text-sm text-[#FDE68A]">Expedition Rules</div>
              <p>1. All party members spawn together on Floor 1 when the host starts.</p>
              <p>2. Once active, the party is locked across all floors (1–10) against new players.</p>
              <p>3. Disconnected members can rejoin their active run using code {snapshot.roomId}.</p>
            </div>
          </section>
        </div>
      </main>

      {/* Attribute Allocation Modal in Waiting Lobby */}
      {attributesOpen && me && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="stone-panel w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#343246] pb-3">
              <div>
                <h3 className="font-display text-lg text-white font-semibold">
                  Hero Attributes
                </h3>
                <p className="text-xs font-mono text-[#FCD34D]">
                  {me.level >= MAX_LEVEL ? 'MAX LEVEL' : `Lv.${me.level}`} · {me.attributePoints} Points Available
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAttributesOpen(false)}
                className="stone-button stone-button-dark w-8 h-8 p-0 text-xs"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              {(
                [
                  ['strength', 'STR', me.strength || 0],
                  ['vitality', 'VIT', me.vitality || 0],
                  ['dexterity', 'DEX', me.dexterity || 0],
                  ['intelligence', 'INT', me.intelligence || 0],
                  ['faith', 'FTH', me.faith || 0],
                ] as const
              ).map(([key, label, val]) => (
                <div
                  key={key}
                  className="p-2.5 bg-[#1B1A26] border border-[#323044] flex items-center justify-between gap-3"
                >
                  <span className="shrink-0">
                    {label}: <strong className="text-white">{val}</strong> / {MAX_ATTRIBUTE}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={me.attributePoints <= 0 || val >= MAX_ATTRIBUTE}
                      onClick={() => {
                        sfx.playUiClick('confirm');
                        onSendCommand?.({ type: 'player:spend_attribute', attribute: key, amount: 1 });
                      }}
                      className="stone-button stone-button-dark py-1 px-2 text-[11px] disabled:opacity-30"
                      title="Allocate +1"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      disabled={me.attributePoints < 5 || val >= MAX_ATTRIBUTE}
                      onClick={() => {
                        sfx.playUiClick('confirm');
                        onSendCommand?.({ type: 'player:spend_attribute', attribute: key, amount: 5 });
                      }}
                      className="stone-button stone-button-dark py-1 px-2 text-[11px] disabled:opacity-30"
                      title="Allocate +5"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      disabled={me.attributePoints < 10 || val >= MAX_ATTRIBUTE}
                      onClick={() => {
                        sfx.playUiClick('confirm');
                        onSendCommand?.({ type: 'player:spend_attribute', attribute: key, amount: 10 });
                      }}
                      className="stone-button stone-button-dark py-1 px-2 text-[11px] disabled:opacity-30"
                      title="Allocate +10"
                    >
                      +10
                    </button>
                    <button
                      type="button"
                      disabled={me.attributePoints <= 0 || val >= MAX_ATTRIBUTE}
                      onClick={() => {
                        sfx.playUiClick('confirm');
                        const maxSpend = Math.max(1, MAX_ATTRIBUTE - val);
                        onSendCommand?.({ type: 'player:spend_attribute', attribute: key, amount: maxSpend });
                      }}
                      className="stone-button stone-button-dark py-1 px-2.5 text-[11px] text-[#FCD34D] disabled:opacity-30"
                      title="Spend all remaining available points into this stat"
                    >
                      MAX
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
