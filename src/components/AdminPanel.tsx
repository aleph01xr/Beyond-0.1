import React, { useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  HERO_CLASSES,
  RELIC_CATALOG,
  type ClientMessage,
  type HeroClassId,
  type PlayerState,
} from '../shared/types.ts';

interface AdminPanelProps {
  me: PlayerState;
  isOpen: boolean;
  onClose: () => void;
  onSendAdminCommand: (msg: ClientMessage) => void;
}

type AdminTab = 'classes' | 'cheats' | 'relics' | 'spawner';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  me,
  isOpen,
  onClose,
  onSendAdminCommand,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('cheats');

  if (!isOpen) return null;

  const handleCommand = (msg: ClientMessage) => {
    sfx.playUiClick('confirm');
    onSendAdminCommand(msg);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
    >
      <div className="stone-panel max-w-2xl w-full p-5 sm:p-6 space-y-5 relative border-2 border-[#D9AA52] shadow-[0_0_60px_rgba(217,170,82,0.3)] text-[#E6E4EE] flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#383548]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-[#2D2A3A] border border-[#D9AA52] flex items-center justify-center font-mono font-bold text-[#FCD34D] text-xs shadow-md shrink-0">
              ADM
            </div>
            <div>
              <h2
                id="admin-title"
                className="font-display text-lg sm:text-xl font-bold text-[#FCD34D] tracking-wide flex items-center gap-2"
              >
                <span>Admin Master Console</span>
                <span className="text-xs font-mono font-bold bg-[#D9AA52]/20 border border-[#D9AA52] text-[#FDE047] px-2 py-0.5 rounded">
                  DEVELOPER MODE
                </span>
              </h2>
              <p className="text-xs font-mono text-[#A19FAF] mt-0.5">
                Exclusive Privileges • Authenticated Adventurer:{' '}
                <span className="text-white font-bold">{me.username}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button w-8 h-8 flex items-center justify-center text-xs font-mono font-bold text-white shrink-0 cursor-pointer"
            title="Close Admin Console"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-b border-[#383548] overflow-x-auto custom-scrollbar pb-1">
          {[
            ['cheats', 'Cheats & Stats'],
            ['classes', 'Hero Classes'],
            ['relics', 'Relic Vault'],
            ['spawner', 'Entity Spawner'],
          ].map(([tabKey, label]) => {
            const isActive = activeTab === tabKey;
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => {
                  sfx.playUiClick();
                  setActiveTab(tabKey as AdminTab);
                }}
                className={`px-3.5 py-1.5 text-xs font-display font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? 'border-b-2 border-[#D9AA52] text-[#FCD34D] bg-[#2D2B3A]/80'
                    : 'text-[#A19FAF] hover:text-white hover:bg-[#252332]/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 custom-scrollbar text-xs">
          {/* TAB 1: CHEATS & STATS */}
          {activeTab === 'cheats' && (
            <div className="space-y-4">
              {/* Toggles */}
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  Invincibility & Movement Enhancements
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      handleCommand({
                        type: 'admin:godmode',
                        enabled: !me.godMode,
                      })
                    }
                    className={`p-3.5 stone-plaque text-left flex items-center justify-between gap-3 border transition-all cursor-pointer ${
                      me.godMode
                        ? 'border-[#FACC15] bg-[#423a1a]'
                        : 'border-[#383548] hover:border-[#D9AA52]/60'
                    }`}
                  >
                    <div>
                      <div className={`font-display font-bold text-sm flex items-center gap-1.5 ${me.godMode ? 'text-[#FCD34D]' : 'text-[#A19FAF]'}`}>
                        <span>God Mode (Invincible)</span>
                      </div>
                      <p className="text-[11px] text-[#A19FAF] mt-0.5">
                        Absorbs 100% of all incoming physical & elemental damage.
                      </p>
                    </div>
                    <div
                      className={`text-[10px] font-mono font-bold px-2.5 py-1 border shrink-0 ${
                        me.godMode
                          ? 'bg-[#FACC15] text-[#111219] border-[#85632e]'
                          : 'bg-[#252332] text-[#A19FAF] border-[#383548]'
                      }`}
                    >
                      {me.godMode ? 'ACTIVE' : 'OFF'}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleCommand({
                        type: 'admin:toggle_speed',
                        enabled: !me.speedBoost,
                      })
                    }
                    className={`p-3.5 stone-plaque text-left flex items-center justify-between gap-3 border transition-all cursor-pointer ${
                      me.speedBoost
                        ? 'border-[#34D399] bg-[#1a3325]'
                        : 'border-[#383548] hover:border-[#D9AA52]/60'
                    }`}
                  >
                    <div>
                      <div className={`font-display font-bold text-sm flex items-center gap-1.5 ${me.speedBoost ? 'text-[#34D399]' : 'text-[#A19FAF]'}`}>
                        <span>Swiftness (+80% Speed)</span>
                      </div>
                      <p className="text-[11px] text-[#A19FAF] mt-0.5">
                        Massively increases movement velocity across all floor biomes.
                      </p>
                    </div>
                    <div
                      className={`text-[10px] font-mono font-bold px-2.5 py-1 border shrink-0 ${
                        me.speedBoost
                          ? 'bg-[#34D399] text-[#111219] border-[#14532d]'
                          : 'bg-[#252332] text-[#A19FAF] border-[#383548]'
                      }`}
                    >
                      {me.speedBoost ? 'ACTIVE' : 'OFF'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Resource Boosters */}
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  Resource & Wealth Dispensers
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleCommand({ type: 'admin:add_gold', amount: 10000 })}
                    className="stone-button stone-button-gold p-3 h-auto"
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-display font-bold text-sm">+10,000 Gold</span>
                      <span className="text-[10px] opacity-80 font-mono">Current: {me.gold}g</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCommand({ type: 'admin:add_potions', amount: 10 })}
                    className="stone-button stone-button-red p-3 h-auto"
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-display font-bold text-sm">+10 Potions</span>
                      <span className="text-[10px] opacity-80 font-mono">Current: {me.potions}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCommand({ type: 'admin:add_attribute_points', amount: 50 })}
                    className="stone-button stone-button-blue p-3 h-auto"
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-display font-bold text-sm">+50 Attr Pts</span>
                      <span className="text-[10px] opacity-80 font-mono">Current: {me.attributePoints}</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Progression & Leveling */}
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  Progression & Leveling Overrides
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleCommand({ type: 'admin:set_level', level: 100 })}
                    className="stone-button stone-button-blue p-3 h-auto"
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-display font-bold text-sm">Set Level 100 (Cap)</span>
                      <span className="text-[10px] opacity-80 font-mono">Current: Lv.{me.level}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCommand({ type: 'admin:set_level', level: 1 })}
                    className="stone-button stone-button-dark p-3 h-auto text-white"
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-display font-bold text-sm">Reset to Level 1</span>
                      <span className="text-[10px] opacity-80 font-mono">Resets XP & Level</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Direct Attribute Injection */}
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  Direct Attribute Injection
                </h3>
                <p className="text-[10px] text-[#A19FAF] mb-2 font-mono italic">
                  Note: These buttons simulate spending a point to test incremental gains.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { key: 'strength', label: 'STR', color: '#EF4444' },
                    { key: 'vitality', label: 'VIT', color: '#10B981' },
                    { key: 'dexterity', label: 'DEX', color: '#38BDF8' },
                    { key: 'intelligence', label: 'INT', color: '#818CF8' },
                    { key: 'faith', label: 'FTH', color: '#FDE047' },
                  ].map((attr) => (
                    <button
                      key={attr.key}
                      type="button"
                      onClick={() => handleCommand({ type: 'player:spend_attribute', attribute: attr.key as any })}
                      className="stone-button stone-button-dark p-2 h-auto text-white border-none shadow-none ring-1 ring-[#383548] hover:ring-[#D9AA52]"
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold" style={{ color: attr.color }}>{attr.label}</span>
                        <span className="text-[11px] font-mono font-bold">{(me as any)[attr.key] || 0}</span>
                        <span className="text-[9px] text-[#A19FAF] mt-0.5">+1</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HERO CLASSES */}
          {activeTab === 'classes' && (
            <div className="space-y-3">
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  Override Class Lock (Instant Hero Shift)
                </h3>
                <p className="text-xs text-[#A19FAF] mb-3 font-mono">
                  Admin privilege allows overriding permanent account class restrictions on the fly.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(HERO_CLASSES) as HeroClassId[]).map((clsKey) => {
                  const cls = HERO_CLASSES[clsKey];
                  const isCurrent = me.heroClass === clsKey;

                  return (
                    <button
                      key={clsKey}
                      type="button"
                      onClick={() =>
                        handleCommand({
                          type: 'player:change_class',
                          heroClass: clsKey,
                        })
                      }
                      className={`stone-plaque p-3.5 text-left border transition-all cursor-pointer relative flex flex-col justify-between ${
                        isCurrent
                          ? 'border-[#FACC15] bg-[#332E1F] shadow-[0_0_15px_rgba(250,204,21,0.15)]'
                          : 'border-[#383548] hover:border-[#D9AA52]/60 bg-[#252332]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-display font-bold text-sm text-white">
                            {cls.name}
                          </span>
                          <span
                            className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase"
                            style={{
                              backgroundColor: `${cls.primaryColor}40`,
                              color: cls.accentColor,
                              border: `1px solid ${cls.accentColor}60`,
                            }}
                          >
                            {cls.roleBadge}
                          </span>
                        </div>

                        <p className="text-[11px] text-[#D4D2E0] font-medium italic mb-2">
                          "{cls.title}"
                        </p>

                        <div className="text-[10px] font-mono text-[#A19FAF] space-y-0.5 mb-2">
                          <p>
                            <span className="text-white font-semibold">
                              Weapon:
                            </span>{' '}
                            {cls.weapon}
                          </p>
                          <p>
                            <span className="text-white font-semibold">
                              Passive:
                            </span>{' '}
                            {cls.passiveName}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#383548] flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[#FCD34D]">
                          {cls.maxHp} HP • {cls.damage} Base Dmg
                        </span>
                        {isCurrent ? (
                          <span className="text-[10px] font-mono font-bold bg-[#FACC15] text-[#111219] px-2 py-0.5 rounded">
                            ACTIVE HERO
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#A19FAF] group-hover:text-white">
                            [Click to Shift]
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: RELIC VAULT */}
          {activeTab === 'relics' && (
            <div className="space-y-3">
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  Ancient Relic Vault (Instant Acquisition)
                </h3>
                <p className="text-xs text-[#A19FAF] mb-3 font-mono">
                  Click any relic tablet below to immediately bind its legendary passive power to your hero.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {RELIC_CATALOG.map((relic) => {
                  const hasRelic = me.relics.includes(relic.id);

                  return (
                    <button
                      key={relic.id}
                      type="button"
                      onClick={() =>
                        handleCommand({
                          type: 'admin:add_relic',
                          relicId: relic.id,
                        })
                      }
                      className={`stone-plaque p-3 text-left border transition-all cursor-pointer relative flex items-start gap-3 ${
                        hasRelic
                          ? 'border-[#FACC15] bg-[#332E1F]'
                          : 'border-[#383548] hover:border-[#D9AA52]/60 bg-[#252332]'
                      }`}
                    >
                      <div
                        className="w-3.5 h-3.5 rounded-full mt-0.5 shrink-0 border border-white/40 shadow-sm"
                        style={{ backgroundColor: relic.accent }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-display font-bold text-xs text-white truncate">
                            {relic.name}
                          </span>
                          <span className="text-[9px] font-mono text-[#A19FAF] px-1.5 py-0.2 bg-[#1A1926] border border-[#383548]">
                            {relic.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#A19FAF] leading-tight">
                          {relic.summary}
                        </p>
                        {hasRelic && (
                          <span className="mt-1.5 inline-block text-[9px] font-mono font-bold text-[#FDE047] bg-[#FACC15]/20 border border-[#FACC15]/60 px-1.5 py-0.2 rounded">
                            EQUIPPED IN INVENTORY
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: ENTITY SPAWNER */}
          {activeTab === 'spawner' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-display text-xs font-bold text-[#FCD34D] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  Entity & Target Spawner
                </h3>
                <p className="text-xs text-[#A19FAF] mb-3 font-mono">
                  Spawn entities directly in front of your character to test combat passives, DPS numbers, and skill interactions.
                </p>
              </div>

              <div className="stone-plaque p-5 border border-[#383548] space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded bg-[#111219] border border-[#D9AA52] flex items-center justify-center font-mono font-bold text-[#FCD34D] text-xs shrink-0">
                    TARGET
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-sm text-white">
                      High-Durability Training Dummy
                    </h4>
                    <p className="text-xs text-[#A19FAF] font-mono">
                      Spawns a 10,000 HP combat dummy that records live total damage taken, crit multipliers, and resets damage counters automatically after 4s inactivity.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleCommand({
                      type: 'admin:spawn_dummy',
                    })
                  }
                  className="stone-button stone-button-gold w-full py-4 text-base"
                >
                  <span>Spawn Combat Dummy at Current Position</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-[#383548] flex items-center justify-between text-xs font-mono text-[#A19FAF]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SESSION: ADMIN_VERIFIED</span>
          </span>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-dark px-6 py-1.5 text-xs text-white"
          >
            Close Console
          </button>
        </div>
      </div>
    </div>
  );
};
