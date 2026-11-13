import React from 'react';
import { TILE_SIZE, type DungeonMap, type GameSnapshot, type PlayerState } from '../shared/types.ts';
import { sfx } from '../client/sound.ts';

interface ExpandedMapModalProps {
  map: DungeonMap;
  snapshot: GameSnapshot;
  playerId: string;
  onClose: () => void;
}

export const ExpandedMapModal: React.FC<ExpandedMapModalProps> = ({
  map,
  snapshot,
  playerId,
  onClose,
}) => {
  const me = snapshot.players.find((p) => p.id === playerId) || snapshot.players[0];
  const boss = snapshot.enemies.find((e) => e.kind === 'boss');

  const flagMap = new Map(snapshot.roomClearedFlags.map((f) => [f.id, f]));

  // Calculate zoom scale for 600px canvas viewport
  const maxDim = Math.max(map.width, map.height);
  const scale = Math.max(6, Math.min(12, Math.floor(520 / maxDim)));
  const canvasW = map.width * scale;
  const canvasH = map.height * scale;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none pb-safe pt-safe pl-safe pr-safe">
      <div className="stone-panel w-full max-w-4xl max-h-[94dvh] flex flex-col overflow-hidden text-white rounded-none">
        
        {/* Header */}
        <div className="stone-plaque p-2.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-[#D9AA52] bg-[#252336] flex items-center justify-center font-mono font-bold text-xs text-[#FCD34D] shadow">
              [MAP]
            </div>
            <div>
              <div className="flex items-center gap-2 font-mono">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                  Floor {snapshot.floor}: {map.biomeTitle}
                </h2>
                <span className="text-[10px] px-2 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                  SEED #{map.seed}
                </span>
                <span className="text-[10px] px-2 py-0.5 border border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]">
                  {snapshot.difficulty}
                </span>
              </div>
              <p className="text-xs text-[#A19FAF] font-mono mt-0.5 tabular-nums">
                Rooms {snapshot.combatRoomsCleared ?? 0}/{snapshot.combatRoomsTotal ?? 0} · Boss Wards {snapshot.bossWards ?? 0} · Guardians Left {snapshot.guardiansRemaining ?? 0} · Press [M] or [Esc]
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-dark w-9 h-9 p-0 text-white font-mono font-bold text-base flex items-center justify-center"
            title="Close Map [M]"
          >
            ✕
          </button>
        </div>

        {/* Map Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center justify-center space-y-6">

          {/* Map Graphic Container */}
          <div className="stone-input p-3 sm:p-4 flex items-center justify-center max-w-full overflow-auto">
            <div
              className="relative border-2 border-[#353442] bg-[#111018]"
              style={{ width: canvasW, height: canvasH }}
            >
              {/* Corridor Tiles */}
              {Array.from({ length: map.height }).map((_, ty) =>
                Array.from({ length: map.width }).map((_, tx) => {
                  const tileCode = map.tiles[ty * map.width + tx];
                  if (tileCode === 0) return null;
                  return (
                    <div
                      key={`t_${tx}_${ty}`}
                      className="absolute bg-[#1E1D2A]"
                      style={{
                        left: tx * scale,
                        top: ty * scale,
                        width: scale,
                        height: scale,
                      }}
                    />
                  );
                })
              )}

              {/* Rooms */}
              {map.rooms.map((room) => {
                const flags = flagMap.get(room.id);
                const discovered = flags ? flags.discovered : room.discovered;
                const cleared = flags ? flags.cleared : room.cleared;
                const isGuardian = Boolean(room.guardian || flags?.guardian);

                if (!discovered && room.type !== 'boss') {
                  return (
                    <div
                      key={`r_${room.id}`}
                      className="absolute bg-[#0D0C14] border border-[#1E1D2A]/60 flex items-center justify-center font-mono text-[9px] text-[#475569]"
                      style={{
                        left: room.x * scale,
                        top: room.y * scale,
                        width: room.w * scale,
                        height: room.h * scale,
                      }}
                    >
                      ?
                    </div>
                  );
                }

                let bgClass = 'bg-[#1E293B] border-[#475569]';
                let typeTag = '[COMBAT]';
                let tagColor = 'text-[#94A3B8]';

                if (room.type === 'boss') {
                  bgClass = 'bg-[#7F1D1D] border-[#EF4444] animate-pulse';
                  typeTag = '[BOSS SANCTUM]';
                  tagColor = 'text-[#FCA5A5]';
                } else if (room.type === 'treasure') {
                  bgClass = 'bg-[#78350F] border-[#F59E0B]';
                  typeTag = '[TREASURE VAULT]';
                  tagColor = 'text-[#FDE047]';
                } else if (room.type === 'shrine') {
                  bgClass = 'bg-[#064E3B] border-[#10B981]';
                  typeTag = '[SANCTUARY SHRINE]';
                  tagColor = 'text-[#6EE7B7]';
                } else if (room.type === 'start') {
                  bgClass = 'bg-[#1E293B] border-[#64748B]';
                  typeTag = '[START]';
                  tagColor = 'text-[#CBD5E1]';
                } else if (isGuardian) {
                  bgClass = cleared
                    ? 'bg-[#064E3B]/70 border-[#10B981]'
                    : 'bg-[#451A03] border-[#F59E0B]';
                  typeTag = '[GUARDIAN]';
                  tagColor = cleared ? 'text-[#6EE7B7]' : 'text-[#FCD34D]';
                } else if (!cleared) {
                  bgClass = 'bg-[#334155] border-[#64748B]';
                  typeTag = '[HOSTILE]';
                  tagColor = 'text-[#F87171]';
                }

                return (
                  <div
                    key={`r_${room.id}`}
                    className={`absolute border-2 ${bgClass} flex flex-col items-center justify-center p-1 text-center font-mono`}
                    style={{
                      left: room.x * scale,
                      top: room.y * scale,
                      width: room.w * scale,
                      height: room.h * scale,
                    }}
                  >
                    <span className={`text-[10px] font-bold ${tagColor}`}>
                      {typeTag}
                    </span>
                    {room.type !== 'start' && (
                      <span className="text-[9px] text-[#A19FAF]">
                        {cleared ? 'CLEARED' : isGuardian ? 'SEAL ACTIVE' : 'UNCLEARED'}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Portal Marker */}
              {map.portalPos && (
                <div
                  className={`absolute w-4 h-4 -ml-2 -mt-2 rounded-full border-2 flex items-center justify-center font-mono text-[8px] font-bold ${
                    snapshot.bossDefeated
                      ? 'bg-[#10B981] border-[#6EE7B7] text-black animate-bounce'
                      : snapshot.bossRoomCleared
                        ? 'bg-[#D97706] border-[#FCD34D] text-black'
                        : 'bg-[#0284C7] border-[#38BDF8] text-white'
                  }`}
                  style={{
                    left: Math.floor(map.portalPos.x / TILE_SIZE) * scale,
                    top: Math.floor(map.portalPos.y / TILE_SIZE) * scale,
                  }}
                  title={
                    snapshot.bossDefeated
                      ? 'Floor Portal (Unlocked)'
                      : snapshot.bossRoomCleared
                        ? `Floor Portal (Sealed by ${snapshot.guardiansRemaining ?? 0} Guardian Room)`
                        : 'Floor Portal (Sealed by Floor Boss)'
                  }
                >
                  P
                </div>
              )}

              {/* Enemy Dots */}
              {snapshot.enemies &&
                snapshot.enemies.map((en) => {
                  if (en.hp <= 0) return null;
                  const ex = Math.floor(en.x / TILE_SIZE) * scale;
                  const ey = Math.floor(en.y / TILE_SIZE) * scale;
                  if (en.kind === 'boss') {
                    return (
                      <div
                        key={`en_${en.id}`}
                        className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-[#DC2626] border-2 border-[#F87171] flex items-center justify-center text-[8px] font-mono font-bold text-white shadow-lg animate-pulse"
                        style={{ left: ex, top: ey }}
                        title={`${en.name} (Boss)`}
                      >
                        B
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`en_${en.id}`}
                      className={`absolute w-2 h-2 -ml-1 -mt-1 rounded-full ${
                        en.elite ? 'bg-[#F97316]' : 'bg-[#EF4444]'
                      }`}
                      style={{ left: ex, top: ey }}
                    />
                  );
                })}

              {/* Players */}
              {snapshot.players.map((p) => {
                const isMe = p.id === playerId;
                const px = Math.floor(p.x / TILE_SIZE) * scale;
                const py = Math.floor(p.y / TILE_SIZE) * scale;

                return (
                  <div
                    key={`p_${p.id}`}
                    className={`absolute -ml-3 -mt-3 flex flex-col items-center z-10`}
                    style={{ left: px, top: py }}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center font-mono text-[9px] font-bold shadow-md ${
                        isMe
                          ? 'bg-[#FACC15] border-[#854D0E] text-black animate-pulse'
                          : 'bg-[#38BDF8] border-[#1E3A8A] text-black'
                      }`}
                    >
                      {p.username.substring(0, 1).toUpperCase()}
                    </div>
                    <span className="text-[8px] font-mono bg-black/80 text-white px-1 border border-[#353442] whitespace-nowrap mt-0.5">
                      {p.username}
                    </span>
                  </div>
                );
              })}

            </div>
          </div>

          {/* Map Legend */}
          <div className="stone-plaque p-3 w-full font-mono text-xs flex flex-wrap items-center justify-around gap-4 text-[#A19FAF]">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#FACC15] border border-[#854D0E]" />
              <span>You (Local Hero)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#38BDF8] border border-[#1E3A8A]" />
              <span>Co-op Ally</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 rounded-full bg-[#DC2626] border border-[#F87171]" />
              <span>Floor Boss</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#451A03] border border-[#F59E0B]" />
              <span>Guardian Chamber</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#78350F] border border-[#F59E0B]" />
              <span>Treasure Room</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#064E3B] border border-[#10B981]" />
              <span>Sanctuary Shrine</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#38BDF8] border border-white" />
              <span>Floor Portal</span>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="stone-plaque p-3 px-6 flex items-center justify-between shrink-0 text-xs font-mono text-[#A19FAF]">
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white">M</kbd> or <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white">Esc</kbd> to close.
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-gold py-1.5 px-6 text-xs font-bold"
          >
            Close Tactical Map
          </button>
        </div>

      </div>
    </div>
  );
};
