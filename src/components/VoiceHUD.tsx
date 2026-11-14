import React, { useEffect, useState } from 'react';
import { voiceManager } from '../client/voice/voiceClient.ts';
import { sfx } from '../client/sound.ts';

interface VoiceHUDProps {
  roomId: string;
  tokenAuthHeader: string;
  userId: string;
  username: string;
  myPos: { x: number; y: number };
  otherPlayers: { id: string; x: number; y: number; username: string }[];
}

export const VoiceHUD: React.FC<VoiceHUDProps> = ({
  roomId,
  tokenAuthHeader,
  userId,
  username,
  myPos,
  otherPlayers,
}) => {
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [reportModalUser, setReportModalUser] = useState<{ id: string; name: string } | null>(null);
  const [reportReason, setReportReason] = useState('Harassment or inappropriate audio');
  const [reportedSuccess, setReportedSuccess] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    // Connect to LiveKit voice room on mount or roomId change
    voiceManager.connect(roomId, tokenAuthHeader, userId, username);

    const unsubscribe = voiceManager.subscribe(() => {
      setTick((t) => t + 1);
    });

    return () => {
      unsubscribe();
      voiceManager.disconnect();
    };
  }, [roomId, tokenAuthHeader, userId, username]);

  // Update proximity volumes whenever myPos or otherPlayers change
  useEffect(() => {
    voiceManager.updateProximityVolumes(myPos, otherPlayers);
  }, [myPos.x, myPos.y, otherPlayers]);

  const status = voiceManager.getStatus();

  const handleToggleMic = async () => {
    sfx.playUiClick();
    await voiceManager.toggleMicrophone();
  };

  const handleToggleDeafen = () => {
    sfx.playUiClick();
    voiceManager.setDeafened(!status.isDeafened);
  };

  const handleReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sfx.playUiClick('confirm');
    setReportedSuccess(true);
    setTimeout(() => {
      setReportedSuccess(false);
      setReportModalUser(null);
    }, 2000);
  };

  return (
    <>
      {/* Floating Voice Chat Toggle Button */}
      <div className="fixed bottom-16 sm:bottom-20 right-2 sm:right-5 z-20 pointer-events-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            sfx.playUiClick();
            setVoiceOpen((v) => !v);
          }}
          className={`stone-button text-[10px] sm:text-xs py-1 px-2.5 flex items-center gap-1.5 shadow-xl transition-all ${
            status.isConnected
              ? status.isMicEnabled
                ? 'bg-[#166534] text-white border-[#22C55E] animate-pulse'
                : 'bg-[#1F1E2E] text-[#E6E4EE] border-[#4A4760]'
              : 'bg-[#191824] text-[#9E9CAE] border-[#38354A]'
          }`}
          title="Proximity Voice Chat Controls"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              status.isConnected
                ? status.isMicEnabled
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-amber-400'
                : 'bg-slate-500'
            }`}
          />
          <span className="font-mono">
            {status.isConnected ? (status.isMicEnabled ? 'MIC ON' : 'VOICE') : 'CONNECTING...'}
          </span>
        </button>

        {/* Quick Mic Mute Toggle */}
        {status.isConnected && (
          <button
            type="button"
            onClick={handleToggleMic}
            className={`stone-button text-[10px] sm:text-xs py-1 px-2 ${
              status.isMicEnabled
                ? 'bg-[#166534] text-white border-emerald-500'
                : 'bg-[#7F1D1D] text-[#FCA5A5] border-[#EF4444]'
            }`}
            title={status.isMicEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {status.isMicEnabled ? '🎙️' : '🔇'}
          </button>
        )}
      </div>

      {/* Voice Chat Control Modal / Panel */}
      {voiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs pointer-events-auto animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[#191824] border-2 border-[#524E6B] shadow-2xl p-4 sm:p-6 space-y-4 font-mono text-[#E6E4EE]">
            <div className="flex items-center justify-between border-b border-[#353347] pb-3">
              <div>
                <h3 className="font-display text-base sm:text-lg text-white font-bold flex items-center gap-2">
                  <span>Proximity Voice Chat</span>
                  <span className="text-xs px-1.5 py-0.5 bg-[#262438] text-amber-400 border border-[#484560]">
                    LiveKit
                  </span>
                </h3>
                <p className="text-[11px] text-[#A6A4B8]">
                  Hear nearby party adventurers within 600 world pixels.
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

            {/* General Settings & Quick Toggles */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleToggleMic}
                className={`stone-button text-xs py-2 px-3 flex items-center justify-center gap-2 font-bold ${
                  status.isMicEnabled
                    ? 'bg-[#166534] text-white border-emerald-500'
                    : 'bg-[#252336] text-[#C9C7D8] border-[#45425C]'
                }`}
              >
                <span>{status.isMicEnabled ? '🎙️ Transmitting' : '🔇 Mic Muted'}</span>
              </button>

              <button
                type="button"
                onClick={handleToggleDeafen}
                className={`stone-button text-xs py-2 px-3 flex items-center justify-center gap-2 font-bold ${
                  status.isDeafened
                    ? 'bg-[#7F1D1D] text-[#FCA5A5] border-rose-500'
                    : 'bg-[#252336] text-[#C9C7D8] border-[#45425C]'
                }`}
              >
                <span>{status.isDeafened ? '🎧 Deafened' : '🔊 Listening'}</span>
              </button>
            </div>

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
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
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
                  return (
                    <div
                      key={p.identity}
                      className="bg-[#1D1B2B] border border-[#3D3A54] px-3 py-2 flex items-center justify-between text-xs gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            p.isSpeaking ? 'bg-amber-400 animate-ping' : 'bg-[#6B6882]'
                          }`}
                        />
                        <span className="font-display text-white truncate">{p.name}</span>
                        {p.isSpeaking && (
                          <span className="text-[9px] text-amber-300 font-bold px-1 bg-amber-950 border border-amber-800 animate-pulse">
                            SPEAKING
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                        {p.distance !== undefined && (
                          <span className="text-[#A6A4B8]">
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
                    No other party members in voice range yet.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs pointer-events-auto">
          <div className="w-full max-w-sm bg-[#191824] border-2 border-rose-800 shadow-2xl p-4 sm:p-5 space-y-4 font-mono text-[#E6E4EE]">
            <h3 className="font-display text-base text-rose-300 font-bold">
              Report Adventurer: {reportModalUser.name}
            </h3>

            {reportedSuccess ? (
              <div className="p-3 bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs text-center font-bold">
                Report submitted successfully. Thank you for keeping Beyond safe.
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="reportReasonInput" className="text-xs text-[#A6A4B8]">Reason for report:</label>
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

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportModalUser(null)}
                    className="stone-button text-xs py-1 px-3 bg-[#2B293D] text-white border-[#524E6B]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="stone-button text-xs py-1.5 px-3 bg-rose-900 text-white border-rose-500 font-bold"
                  >
                    Submit Report
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
