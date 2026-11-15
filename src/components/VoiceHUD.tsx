import React, { useEffect, useState } from 'react';
import { voiceManager } from '../client/voice/voiceClient.ts';
import { sfx } from '../client/sound.ts';
import { getApiEndpoint } from '../client/apiConfig.ts';
import type { GameSnapshot } from '../shared/types.ts';

interface VoiceHUDProps {
  roomId: string;
  tokenAuthHeader: string;
  userId: string;
  username: string;
  latestSnapshotRef?: React.MutableRefObject<GameSnapshot | null>;
  myPos: { x: number; y: number };
  otherPlayers: { id: string; x: number; y: number; username: string }[];
}

export const VoiceHUD: React.FC<VoiceHUDProps> = ({
  roomId,
  tokenAuthHeader,
  userId,
  username,
  latestSnapshotRef,
  myPos,
  otherPlayers,
}) => {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [reportModalUser, setReportModalUser] = useState<{ id: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState('Harassment or inappropriate audio');
  const [reportedSuccess, setReportedSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = voiceManager.subscribe(() => {
      setTick((t) => t + 1);
    });

    if (!optedOut) {
      void voiceManager.connect(roomId, tokenAuthHeader, userId, username);
    } else {
      void voiceManager.disconnect();
    }

    return () => {
      unsubscribe();
      void voiceManager.disconnect();
    };
  }, [roomId, tokenAuthHeader, userId, username, optedOut]);

  // Immediate proximity update on prop update
  useEffect(() => {
    voiceManager.updateProximityVolumes(myPos, otherPlayers);
  }, [myPos.x, myPos.y, otherPlayers]);

  // Continuous 10Hz proximity sync from latestSnapshotRef so movement updates audio smoothly
  // without waiting for React HUD snapshot throttles
  useEffect(() => {
    const interval = window.setInterval(() => {
      const snap = latestSnapshotRef?.current;
      if (!snap) return;
      const me = snap.players.find((p) => p.id === userId);
      if (!me) return;
      const others = snap.players
        .filter((p) => p.id !== userId)
        .map((p) => ({ id: p.id, x: p.x, y: p.y }));
      voiceManager.updateProximityVolumes({ x: me.x, y: me.y }, others);
    }, 100);
    return () => window.clearInterval(interval);
  }, [latestSnapshotRef, userId]);

  const status = voiceManager.getStatus();

  const handleToggleMic = async () => {
    sfx.playUiClick();
    await voiceManager.unlockAudio();
    await voiceManager.toggleMicrophone();
  };

  const handleHoldMicStart = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (status.micMode !== 'hold') return;
    await voiceManager.unlockAudio();
    await voiceManager.setMicrophoneEnabled(true);
  };

  const handleHoldMicEnd = async (e: React.SyntheticEvent) => {
    e.stopPropagation();
    if (status.micMode !== 'hold') return;
    await voiceManager.setMicrophoneEnabled(false);
  };

  const handleToggleDeafen = async () => {
    sfx.playUiClick();
    await voiceManager.unlockAudio();
    voiceManager.setDeafened(!status.isDeafened);
  };

  const handleRetryConnection = () => {
    sfx.playUiClick();
    setOptedOut(false);
    void voiceManager.connect(roomId, tokenAuthHeader, userId, username);
  };

  const handleToggleOptOut = () => {
    sfx.playUiClick();
    if (optedOut) {
      setOptedOut(false);
    } else {
      setOptedOut(true);
      void voiceManager.disconnect();
    }
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportModalUser) return;
    sfx.playUiClick();
    setReportError(null);
    setIsSubmittingReport(true);

    try {
      const res = await fetch(getApiEndpoint('/api/voice/report'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenAuthHeader ? { Authorization: tokenAuthHeader } : {}),
        },
        body: JSON.stringify({
          roomId,
          reportedUserId: reportModalUser.id,
          reason: reportReason,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success) {
        sfx.playUiClick('confirm');
        setReportedSuccess(true);
        setTimeout(() => {
          setReportedSuccess(false);
          setReportModalUser(null);
        }, 1800);
      } else {
        setReportError(data?.error || `Server rejected report (HTTP ${res.status}).`);
      }
    } catch (err) {
      console.error('Report submission error:', err);
      setReportError('Network error while submitting report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const stopGameLeak = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <>
      {/* Floating Voice Chat Bar - Clear of mobile TouchControls and desktop action bar */}
      <div
        onTouchStart={stopGameLeak}
        onMouseDown={stopGameLeak}
        className="fixed top-12 right-2 sm:top-auto sm:bottom-5 sm:right-5 z-20 pointer-events-auto flex items-center gap-1.5"
      >
        {status.connectionState === 'connected' && !status.canPlaybackAudio && (
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              void voiceManager.unlockAudio();
            }}
            className="stone-button stone-button-gold text-[10px] sm:text-xs py-1 px-2 text-black font-bold"
            title="Tap to unlock browser voice audio playback"
          >
            Enable Audio
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            sfx.playUiClick();
            void voiceManager.unlockAudio();
            setVoiceOpen((v) => !v);
          }}
          className={`stone-button text-[10px] sm:text-xs py-1 px-2.5 flex items-center gap-1.5 shadow-xl transition-all ${
            status.connectionState === 'connected'
              ? status.isReconnecting
                ? 'bg-[#3A3319] text-[#FDE047] border-[#EAB308]'
                : status.isMicEnabled
                  ? 'bg-[#166534] text-white border-[#22C55E]'
                  : 'bg-[#1F1E2E] text-[#E6E4EE] border-[#4A4760]'
              : status.connectionState === 'connecting'
                ? 'bg-[#3A3319] text-[#FDE047] border-[#EAB308]'
                : status.connectionState === 'error'
                  ? 'bg-[#7F1D1D] text-[#FCA5A5] border-[#EF4444]'
                  : 'bg-[#191824] text-[#9E9CAE] border-[#38354A]'
          }`}
          title={
            status.lastError
              ? `Voice Error: ${status.lastError}`
              : 'Proximity Voice Chat Controls'
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              status.connectionState === 'connected'
                ? status.isReconnecting
                  ? 'bg-amber-400 animate-pulse'
                  : status.isMicEnabled
                    ? 'bg-emerald-400 animate-ping'
                    : 'bg-emerald-400'
                : status.connectionState === 'connecting'
                  ? 'bg-amber-400 animate-pulse'
                  : status.connectionState === 'error'
                    ? 'bg-rose-500'
                    : 'bg-slate-500'
            }`}
          />
          <span className="font-mono whitespace-nowrap">
            {status.connectionState === 'connected'
              ? status.isReconnecting
                ? 'RECONNECTING'
                : status.isMicEnabled
                  ? 'MIC LIVE'
                  : 'CONNECTED'
              : status.connectionState === 'connecting'
                ? 'CONNECTING'
                : status.connectionState === 'error'
                  ? 'VOICE ERROR'
                  : optedOut
                    ? 'VOICE OFF'
                    : 'DISCONNECTED'}
          </span>
        </button>

        {/* Quick Mic Button (Toggle or Hold-to-Talk depending on mode) */}
        {status.connectionState === 'connected' && !status.isReconnecting && (
          status.micMode === 'hold' ? (
            <button
              type="button"
              onMouseDown={handleHoldMicStart}
              onMouseUp={handleHoldMicEnd}
              onMouseLeave={handleHoldMicEnd}
              onTouchStart={handleHoldMicStart}
              onTouchEnd={handleHoldMicEnd}
              onTouchCancel={handleHoldMicEnd}
              className={`stone-button text-[10px] sm:text-xs py-1 px-2.5 select-none ${
                status.isMicEnabled
                  ? 'bg-[#166534] text-white border-emerald-400'
                  : 'bg-[#28263A] text-[#E6E4EE] border-[#524E6B]'
              }`}
              title="Hold to Talk"
            >
              {status.isMicEnabled ? 'MIC ON' : 'HOLD PTT'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleMic}
              className={`stone-button text-[10px] sm:text-xs py-1 px-2.5 ${
                status.isMicEnabled
                  ? 'bg-[#166534] text-white border-emerald-400'
                  : 'bg-[#7F1D1D] text-[#FCA5A5] border-[#EF4444]'
              }`}
              title={status.isMicEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
            >
              {status.isMicEnabled ? 'MIC ON' : 'MIC OFF'}
            </button>
          )
        )}
      </div>

      {/* Voice Chat Control Modal / Panel */}
      {voiceOpen && (
        <div
          onTouchStart={stopGameLeak}
          onMouseDown={stopGameLeak}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs pointer-events-auto animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md bg-[#191824] border-2 border-[#524E6B] shadow-2xl p-4 sm:p-6 space-y-4 font-mono text-[#E6E4EE]">
            <div className="flex items-center justify-between border-b border-[#353347] pb-3">
              <div>
                <h3 className="font-display text-base sm:text-lg text-white font-bold flex items-center gap-2">
                  <span>Proximity Voice Chat</span>
                  <span className="text-[11px] px-1.5 py-0.5 bg-[#262438] text-amber-400 border border-[#484560]">
                    Room {roomId}
                  </span>
                </h3>
                <p className="text-[11px] text-[#A6A4B8]">
                  Spatial voice within 600 world pixels · Never recorded.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setVoiceOpen(false);
                }}
                className="stone-button text-xs py-1 px-2.5 bg-[#2B293D] text-white border-[#524E6B]"
              >
                ✕
              </button>
            </div>

            {/* Connection Status & Error / Retry Banner */}
            <div className="bg-[#12111A] p-2.5 border border-[#353347] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    status.connectionState === 'connected'
                      ? status.isReconnecting
                        ? 'bg-amber-400 animate-pulse'
                        : 'bg-emerald-400'
                      : status.connectionState === 'connecting'
                        ? 'bg-amber-400 animate-pulse'
                        : status.connectionState === 'error'
                          ? 'bg-rose-500'
                          : 'bg-slate-500'
                  }`}
                />
                <div className="min-w-0">
                  <div className="font-bold text-white uppercase">
                    Status:{' '}
                    {status.connectionState === 'connected' && status.isReconnecting
                      ? 'reconnecting'
                      : status.connectionState}
                    {status.httpStatus ? ` (HTTP ${status.httpStatus})` : ''}
                  </div>
                  {status.lastError && (
                    <div className="text-[10px] text-rose-300 mt-0.5 break-words">
                      {status.lastError}
                    </div>
                  )}
                  {status.micError && (
                    <div className="text-[10px] text-amber-300 mt-0.5 break-words">
                      {status.micError}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {status.connectionState !== 'connected' && status.connectionState !== 'connecting' && (
                  <button
                    type="button"
                    onClick={handleRetryConnection}
                    className="stone-button text-xs py-1 px-2.5 bg-amber-900 text-white border-amber-500 font-bold"
                  >
                    Retry
                  </button>
                )}
                {(status.connectionState === 'connected' || optedOut) && (
                  <button
                    type="button"
                    onClick={handleToggleOptOut}
                    className="stone-button text-xs py-1 px-2.5 bg-[#2B293D] text-white border-[#524E6B]"
                  >
                    {optedOut ? 'Join Voice' : 'Leave'}
                  </button>
                )}
              </div>
            </div>

            {status.connectionState === 'connected' && !status.canPlaybackAudio && (
              <div className="bg-amber-950/60 border border-amber-600 p-2.5 flex items-center justify-between gap-2 text-xs">
                <span className="text-amber-200">
                  Browser blocked automatic audio playback.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    void voiceManager.unlockAudio();
                  }}
                  className="stone-button stone-button-gold text-xs py-1 px-2.5 text-black font-bold shrink-0"
                >
                  Enable Audio
                </button>
              </div>
            )}

            {/* Mic Mode & Audio Controls */}
            {status.connectionState === 'connected' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {status.micMode === 'hold' ? (
                    <button
                      type="button"
                      onMouseDown={handleHoldMicStart}
                      onMouseUp={handleHoldMicEnd}
                      onMouseLeave={handleHoldMicEnd}
                      onTouchStart={handleHoldMicStart}
                      onTouchEnd={handleHoldMicEnd}
                      onTouchCancel={handleHoldMicEnd}
                      disabled={status.isDeafened}
                      className={`stone-button text-xs py-2 px-3 flex items-center justify-center gap-2 font-bold select-none ${
                        status.isMicEnabled
                          ? 'bg-[#166534] text-white border-emerald-500'
                          : 'bg-[#252336] text-[#C9C7D8] border-[#45425C]'
                      }`}
                    >
                      <span>{status.isMicEnabled ? 'Transmitting...' : 'Hold to Talk'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleMic}
                      disabled={status.isDeafened}
                      className={`stone-button text-xs py-2 px-3 flex items-center justify-center gap-2 font-bold ${
                        status.isMicEnabled
                          ? 'bg-[#166534] text-white border-emerald-500'
                          : 'bg-[#252336] text-[#C9C7D8] border-[#45425C]'
                      }`}
                    >
                      <span>{status.isMicEnabled ? 'Mic Active (Mute)' : 'Mic Muted (Unmute)'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleToggleDeafen}
                    className={`stone-button text-xs py-2 px-3 flex items-center justify-center gap-2 font-bold ${
                      status.isDeafened
                        ? 'bg-[#7F1D1D] text-[#FCA5A5] border-rose-500'
                        : 'bg-[#252336] text-[#C9C7D8] border-[#45425C]'
                    }`}
                  >
                    <span>{status.isDeafened ? 'Deafened' : 'Listening'}</span>
                  </button>
                </div>

                {/* Toggle-to-Talk vs Hold-to-Talk Switch */}
                <div className="flex items-center justify-between bg-[#12111A] border border-[#353347] px-3 py-1.5 text-[11px]">
                  <span className="text-[#A6A4B8]">Microphone Mode:</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        sfx.playUiClick();
                        voiceManager.setMicMode('toggle');
                      }}
                      className={`px-2 py-0.5 border text-[10px] ${
                        status.micMode === 'toggle'
                          ? 'bg-[#D9AA52] text-black border-[#FCD34D] font-bold'
                          : 'bg-[#1D1B2B] text-[#A6A4B8] border-[#3D3A54]'
                      }`}
                    >
                      Toggle-to-Talk
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sfx.playUiClick();
                        voiceManager.setMicMode('hold');
                      }}
                      className={`px-2 py-0.5 border text-[10px] ${
                        status.micMode === 'hold'
                          ? 'bg-[#D9AA52] text-black border-[#FCD34D] font-bold'
                          : 'bg-[#1D1B2B] text-[#A6A4B8] border-[#3D3A54]'
                      }`}
                    >
                      Hold-to-Talk
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Participants / Party Proximity List */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-[#FCD34D] uppercase tracking-wider flex items-center justify-between">
                <span>Party Voice Channels ({status.participants.length + 1})</span>
                <span className="text-[10px] text-[#9E9CAE]">Range: 600px max</span>
              </div>

              <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1.5 bg-[#12111A] p-2 border border-[#353347]">
                {/* Local User */}
                <div className="bg-[#1D1B2B] border border-[#3D3A54] px-3 py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        status.isMicEnabled ? 'bg-emerald-400' : 'bg-[#6B6882]'
                      }`}
                    />
                    <span className="font-display text-white font-bold truncate">
                      {username} (You)
                    </span>
                    {status.isMicEnabled && (
                      <span className="text-[9px] text-emerald-400 font-semibold px-1 bg-emerald-950 border border-emerald-800">
                        MIC ON
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#9E9CAE] font-mono">Local</span>
                </div>

                {/* Remote Participants */}
                {status.participants.map((p) => {
                  const isMuted = voiceManager.isUserMutedLocally(p.identity);
                  const outOfRange = p.distance !== undefined && p.distance > 600;
                  return (
                    <div
                      key={p.identity}
                      className="bg-[#1D1B2B] border border-[#3D3A54] px-3 py-2 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            p.isSpeaking
                              ? 'bg-amber-400 animate-ping'
                              : outOfRange
                                ? 'bg-[#3F3D52]'
                                : 'bg-[#6B6882]'
                          }`}
                        />
                        <span className="font-display text-white truncate">{p.name}</span>
                        {p.isSpeaking && !outOfRange && !isMuted && (
                          <span className="text-[9px] text-amber-300 font-bold px-1 bg-amber-950 border border-amber-800">
                            SPEAKING
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                        {p.distance !== undefined && (
                          <span className={outOfRange ? 'text-[#6B6882]' : 'text-[#A6A4B8]'}>
                            {Math.round(p.distance)}px
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            sfx.playUiClick();
                            voiceManager.toggleUserMute(p.identity);
                          }}
                          className={`px-2 py-0.5 border text-[10px] font-mono ${
                            isMuted
                              ? 'bg-[#7F1D1D] text-[#FCA5A5] border-rose-500'
                              : 'bg-[#2B293D] text-white border-[#524E6B]'
                          }`}
                          title={isMuted ? 'Unmute Player Locally' : 'Mute Player Locally'}
                        >
                          {isMuted ? 'Muted' : 'Mute'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            sfx.playUiClick();
                            setReportError(null);
                            setReportedSuccess(false);
                            setReportModalUser({ id: p.identity, name: p.name });
                          }}
                          className="px-1.5 py-0.5 bg-[#2B293D] text-[#FCA5A5] border border-[#524E6B] hover:border-rose-400"
                          title="Report Player"
                        >
                          Report
                        </button>
                      </div>
                    </div>
                  );
                })}

                {status.participants.length === 0 && (
                  <div className="text-center py-6 text-xs text-[#78768A] font-mono">
                    {status.connectionState === 'connected'
                      ? 'No other party members in voice room yet.'
                      : status.connectionState === 'connecting'
                        ? 'Connecting to LiveKit voice room...'
                        : status.connectionState === 'error'
                          ? 'Voice connection unavailable. See error above.'
                          : optedOut
                            ? 'You have left voice chat. Click Join Voice to reconnect.'
                            : 'Disconnected from voice room.'}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#353347] flex justify-end">
              <button
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setVoiceOpen(false);
                }}
                className="stone-button text-xs py-1.5 px-4 bg-[#262438] text-white border-[#524E6B]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Report Modal */}
      {reportModalUser && (
        <div
          onTouchStart={stopGameLeak}
          onMouseDown={stopGameLeak}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs pointer-events-auto"
        >
          <div className="w-full max-w-sm bg-[#191824] border-2 border-rose-800 shadow-2xl p-4 sm:p-5 space-y-4 font-mono text-[#E6E4EE]">
            <h3 className="font-display text-base text-rose-300 font-bold">
              Report Adventurer: {reportModalUser.name}
            </h3>

            {reportedSuccess ? (
              <div className="p-3 bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs text-center font-bold">
                Report submitted and recorded successfully. Thank you for keeping Beyond safe.
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="reportReasonInput" className="text-xs text-[#A6A4B8]">
                    Reason for report:
                  </label>
                  <select
                    id="reportReasonInput"
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full bg-[#12111A] border border-[#353347] p-2 text-xs text-white"
                  >
                    <option value="Harassment or inappropriate audio">
                      Harassment or inappropriate audio
                    </option>
                    <option value="Spam or background noise">Spam or background noise</option>
                    <option value="Offensive language">Offensive language</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {reportError && (
                  <div className="p-2 bg-rose-950 border border-rose-700 text-rose-200 text-[11px]">
                    {reportError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportModalUser(null)}
                    disabled={isSubmittingReport}
                    className="stone-button text-xs py-1 px-3 bg-[#2B293D] text-white border-[#524E6B]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingReport}
                    className="stone-button text-xs py-1.5 px-3 bg-rose-900 text-white border-rose-500 font-bold disabled:opacity-50"
                  >
                    {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};
