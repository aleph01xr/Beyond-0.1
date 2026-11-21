import React, { useState } from 'react';
import { HERO_CLASSES, RELIC_CATALOG, type HeroClassId, type PlayerState, type RelicDef } from '../shared/types.ts';
import { calculatePlayerStatProjections, RELIC_SYNERGIES, type PlayerStatProjections } from '../shared/statUtils.ts';
import {
  VESTMENT_CATALOG,
  WEAPON_CATALOG,
  getClassVestments,
  getClassWeapons,
  getDefaultVestmentIdForClass,
  getVestmentDef,
  resolveEquippedVestmentForClass,
  resolveEquippedWeaponForClass,
  type ArmamentDef,
  type ArmamentSlot,
} from '../shared/armaments.ts';
import { sfx } from '../client/sound.ts';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';
import { ArmamentIcon } from './ArmamentIcon.tsx';

interface CharacterInventoryModalProps {
  player: PlayerState;
  floor?: number;
  onClose: () => void;
  onSendAdminCommand?: (cmd: any) => void;
  onUnequipRelic?: (relicId: string) => void;
}

type TabType = 'equipment' | 'armaments' | 'storage' | 'projections';

const MAX_EQUIPPED_RELICS = 5;
const MAX_STORAGE_SLOTS = 12;
const DISMANTLE_GOLD_REWARD = 40;

export const CharacterInventoryModal: React.FC<CharacterInventoryModalProps> = ({
  player,
  floor = 1,
  onClose,
  onSendAdminCommand,
  onUnequipRelic,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('equipment');
  const [armoryFilter, setArmoryFilter] = useState<'all' | ArmamentSlot>('all');
  const [selectedArmament, setSelectedArmament] = useState<ArmamentDef | null>(null);
  const [selectedRelic, setSelectedRelic] = useState<RelicDef | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ relic: RelicDef; fromStorage: boolean } | null>(null);
  const [confirmDiscardPotion, setConfirmDiscardPotion] = useState(false);

  const heroClass: HeroClassId = HERO_CLASSES[player.heroClass] ? player.heroClass : 'vanguard';
  const heroDef = HERO_CLASSES[heroClass];
  const stats: PlayerStatProjections = calculatePlayerStatProjections(player, floor);

  const ownedWeapons = player.ownedWeapons || [];
  const ownedVestments = player.ownedVestments || [];
  const equippedWeaponDef = resolveEquippedWeaponForClass(heroClass, player.equippedWeapon);
  const equippedVestmentDef = resolveEquippedVestmentForClass(heroClass, player.equippedVestment);
  const activeVestmentDef =
    equippedVestmentDef || getVestmentDef(getDefaultVestmentIdForClass(heroClass));
  const isNonDefaultVestment = Boolean(equippedVestmentDef && !equippedVestmentDef.isDefault);

  const classWeapons = getClassWeapons(heroClass);
  const classVestments = getClassVestments(heroClass);
  const classCatalogCount = classWeapons.length + classVestments.length;
  const classOwnedCount =
    classWeapons.filter((w) => ownedWeapons.includes(w.id)).length +
    classVestments.filter((v) => ownedVestments.includes(v.id)).length;

  const ownedArmamentDefs: ArmamentDef[] = [
    ...WEAPON_CATALOG.filter((w) => ownedWeapons.includes(w.id)),
    ...VESTMENT_CATALOG.filter((v) => ownedVestments.includes(v.id)),
  ].sort((a, b) => {
    const aMatches = a.heroClass === heroClass ? 0 : 1;
    const bMatches = b.heroClass === heroClass ? 0 : 1;
    if (aMatches !== bMatches) return aMatches - bMatches;
    if (a.slot !== b.slot) return a.slot === 'weapon' ? -1 : 1;
    return 0;
  });

  const unownedClassArmaments: ArmamentDef[] = [
    ...classWeapons.filter((w) => !ownedWeapons.includes(w.id)),
    ...classVestments.filter((v) => !ownedVestments.includes(v.id)),
  ];

  const ownedRelics = player.relics || [];
  const ownedRelicDefs = RELIC_CATALOG.filter((r) => ownedRelics.includes(r.id));

  const storedRelics = player.storage || [];
  const storedRelicDefs = RELIC_CATALOG.filter((r) => storedRelics.includes(r.id));

  // Determine active synergies from equipped relics
  const activeSynergies = RELIC_SYNERGIES.filter((syn) =>
    syn.relicIds.every((id) => ownedRelics.includes(id))
  );

  // Reassessed Class Performance Rating (role-calibrated D–S+ across Offense, Defense & Utility)
  const overallRank = stats.overallRank;

  const handleEquipArmament = (slot: ArmamentSlot, itemId: string) => {
    sfx.playUiClick('confirm');
    onSendAdminCommand?.({ type: 'player:equip_armament', slot, itemId });
  };

  const handleUnequipArmament = (slot: ArmamentSlot) => {
    sfx.playUiClick('confirm');
    onSendAdminCommand?.({ type: 'player:unequip_armament', slot });
  };

  const rarityBadgeClass = (rarity: ArmamentDef['rarity']) => {
    if (rarity === 'Ascendant') return 'text-[#FDE047] border-[#FACC15]/60 bg-[#3B3014]';
    if (rarity === 'Forged') return 'text-[#38BDF8] border-[#38BDF8]/50 bg-[#152838]';
    return 'text-[#CBD5E1] border-[#475569] bg-[#1F2430]';
  };

  // Action handlers
  const handleStoreRelic = (relicId: string) => {
    sfx.playUiClick('confirm');
    if (storedRelics.length >= MAX_STORAGE_SLOTS) return;
    onSendAdminCommand?.({ type: 'player:store_relic', relicId });
    if (selectedRelic?.id === relicId) setSelectedRelic(null);
  };

  const handleEquipStoredRelic = (relicId: string) => {
    sfx.playUiClick('confirm');
    if (ownedRelics.length >= MAX_EQUIPPED_RELICS) return;
    onSendAdminCommand?.({ type: 'player:equip_stored_relic', relicId });
    if (selectedRelic?.id === relicId) setSelectedRelic(null);
  };

  const handleConfirmDeleteRelic = () => {
    if (!confirmDelete) return;
    sfx.playUiClick('confirm');
    onSendAdminCommand?.({
      type: 'player:delete_relic',
      relicId: confirmDelete.relic.id,
      fromStorage: confirmDelete.fromStorage,
    });
    if (selectedRelic?.id === confirmDelete.relic.id) setSelectedRelic(null);
    setConfirmDelete(null);
  };

  const handleConfirmDiscardPotion = () => {
    sfx.playUiClick('confirm');
    onSendAdminCommand?.({ type: 'player:discard_potion', count: 1 });
    setConfirmDiscardPotion(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none pb-safe pt-safe pl-safe pr-safe">
      {/* Stone Panel Container */}
      <div className="stone-panel w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden text-white rounded-none relative">
        
        {/* Stone Plaque Header */}
        <div className="stone-plaque p-2.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-[#D9AA52] bg-[#181722] flex items-center justify-center shadow shrink-0">
              <PixelHeroPreview
                heroClass={heroClass}
                equippedWeapon={player.equippedWeapon}
                equippedVestment={player.equippedVestment}
                size={38}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="font-mono text-sm sm:text-lg font-bold text-white tracking-wide truncate">
                  {player.username}
                </h2>
                <span className="text-[9px] sm:text-[10px] font-mono px-1.5 sm:px-2 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                  Lv.{player.level} {heroDef.name}
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-[#A19FAF] font-mono mt-0.5 truncate">
                {heroDef.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Stats Summary */}
            <div className="hidden sm:flex items-center gap-4 font-mono text-xs border-r border-[#353442] pr-4">
              <div>
                <span className="text-[#A19FAF] text-[10px] uppercase block">Gold</span>
                <span className="text-[#FCD34D] font-bold">GOLD: {player.gold || 0}g</span>
              </div>
              <div>
                <span className="text-[#A19FAF] text-[10px] uppercase block">Potions</span>
                <span className="text-[#5CD68D] font-bold">POTIONS: {player.potions || 0}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                onClose();
              }}
              className="stone-button stone-button-dark w-8 h-8 sm:w-9 sm:h-9 p-0 text-white font-mono font-bold text-sm sm:text-base flex items-center justify-center"
              title="Close Inventory [I]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stone Navigation Tabs */}
        <div className="stone-plaque border-t border-b border-[#353442] px-2 sm:px-4 flex items-center gap-1.5 sm:gap-2 shrink-0 overflow-x-auto custom-scrollbar">
          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('equipment'); }}
            className={`px-3 sm:px-4 py-2.5 min-h-[42px] text-xs font-mono font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 stone-button ${
              activeTab === 'equipment'
                ? 'stone-button-gold text-black'
                : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            <span>[LOADOUT] Gear &amp; Relics</span>
            <span className="text-[10px] tabular-nums bg-[#252336] px-1.5 py-0.5 border border-[#353442] text-[#FCD34D]">
              {ownedRelics.length}/{MAX_EQUIPPED_RELICS}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('armaments'); }}
            className={`px-3 sm:px-4 py-2.5 min-h-[42px] text-xs font-mono font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 stone-button ${
              activeTab === 'armaments'
                ? 'stone-button-gold text-black'
                : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            <span>[ARMORY] Permanent Gear</span>
            <span className="text-[10px] tabular-nums bg-[#252336] px-1.5 py-0.5 border border-[#353442] text-[#E0A94F]">
              {classOwnedCount}/{classCatalogCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('storage'); }}
            className={`px-3 sm:px-4 py-2.5 min-h-[42px] text-xs font-mono font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 stone-button ${
              activeTab === 'storage'
                ? 'stone-button-gold text-black'
                : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            <span>[VAULT] Relic Stash</span>
            <span className="text-[10px] tabular-nums bg-[#252336] px-1.5 py-0.5 border border-[#353442] text-[#38BDF8]">
              {storedRelics.length}/{MAX_STORAGE_SLOTS}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { sfx.playUiClick(); setActiveTab('projections'); }}
            className={`px-3 sm:px-4 py-2.5 min-h-[42px] text-xs font-mono font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 stone-button ${
              activeTab === 'projections'
                ? 'stone-button-gold text-black'
                : 'stone-button-dark text-[#A19FAF]'
            }`}
          >
            <span>[STATS] Projections</span>
            <span className="text-[10px] tabular-nums font-bold px-1.5 py-0.5 border border-[#353442] bg-[#181722]" style={{ color: overallRank.color }}>
              {overallRank.label} · {stats.effectiveDps} DPS
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-6">

          {/* TAB 1: EQUIPMENT (PERMANENT ARMAMENTS + 5 TEMPORARY RELIC SLOTS) */}
          {activeTab === 'equipment' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
              
              {/* Left Column: Permanent Account Armaments + Class Passive + Potions */}
              <div className="md:col-span-5 space-y-4">
                <div className="stone-plaque p-3.5 sm:p-4 space-y-3.5">
                  <div className="border-b border-[#353442] pb-2 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="font-mono text-sm font-bold text-[#FCD34D]">Permanent Armaments</h3>
                      <p className="text-[10px] font-mono text-[#A19FAF]">
                        Account-bound gear · Survives death &amp; dungeon resets
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sfx.playUiClick();
                        setArmoryFilter('all');
                        setActiveTab('armaments');
                      }}
                      className="stone-button stone-button-gold py-1.5 px-2.5 min-h-[36px] text-[10px] font-mono font-bold whitespace-nowrap shrink-0"
                    >
                      Open Armory
                    </button>
                  </div>

                  {/* Permanent Weapon Slot */}
                  <div className="stone-input p-3 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-11 h-11 bg-[#181722] border-2 flex items-center justify-center shrink-0"
                        style={{
                          borderColor: equippedWeaponDef ? equippedWeaponDef.accent : '#475569',
                        }}
                        title={equippedWeaponDef ? equippedWeaponDef.name : 'Unarmed'}
                      >
                        <ArmamentIcon itemId={equippedWeaponDef?.id ?? null} slot="weapon" size={34} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-[#A19FAF] uppercase">
                            Weapon Slot · {equippedWeaponDef ? equippedWeaponDef.rarity : 'Empty'}
                          </span>
                        </div>
                        <div
                          className="text-xs font-mono font-bold truncate mt-0.5"
                          style={{ color: equippedWeaponDef ? equippedWeaponDef.accent : '#94A3B8' }}
                        >
                          {equippedWeaponDef ? equippedWeaponDef.name : '[ NONE EQUIPPED ]'}
                        </div>
                        {equippedWeaponDef ? (
                          <ul className="mt-1.5 space-y-0.5 text-[10px] font-mono text-[#CBD5E1]">
                            {equippedWeaponDef.effectLines.map((line, i) => (
                              <li key={i} className="leading-snug">· {line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] font-mono text-[#94A3B8] mt-1">
                            Fighting unarmed with base class scaling ({stats.scaledHitDamage} dmg/hit).
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2E2D3C]">
                      <button
                        type="button"
                        onClick={() => {
                          sfx.playUiClick();
                          setArmoryFilter('weapon');
                          setActiveTab('armaments');
                        }}
                        className="stone-button stone-button-dark py-1.5 px-3 min-h-[36px] text-[10px] font-mono font-bold text-[#FCD34D] whitespace-nowrap"
                      >
                        {equippedWeaponDef ? 'Swap Weapon' : 'Equip Weapon'}
                      </button>
                      {equippedWeaponDef && onSendAdminCommand && (
                        <button
                          type="button"
                          onClick={() => handleUnequipArmament('weapon')}
                          className="stone-button stone-button-dark py-1.5 px-3 min-h-[36px] text-[10px] font-mono font-bold text-[#F87171] whitespace-nowrap"
                        >
                          Unequip
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Permanent Vestment Slot */}
                  <div className="stone-input p-3 space-y-2.5">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-11 h-11 bg-[#181722] border-2 flex items-center justify-center shrink-0"
                        style={{
                          borderColor: equippedVestmentDef ? equippedVestmentDef.accent : '#475569',
                        }}
                        title={equippedVestmentDef ? equippedVestmentDef.name : 'No Vestment'}
                      >
                        <ArmamentIcon itemId={equippedVestmentDef?.id ?? null} slot="vestment" size={34} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono text-[#A19FAF] uppercase">
                            Vestment Slot · {equippedVestmentDef ? equippedVestmentDef.rarity : 'Empty'}
                          </span>
                        </div>
                        <div
                          className="text-xs font-mono font-bold truncate mt-0.5"
                          style={{ color: equippedVestmentDef ? equippedVestmentDef.accent : '#94A3B8' }}
                        >
                          {equippedVestmentDef ? equippedVestmentDef.name : '[ NONE EQUIPPED ]'}
                        </div>
                        {equippedVestmentDef ? (
                          <ul className="mt-1.5 space-y-0.5 text-[10px] font-mono text-[#CBD5E1]">
                            {equippedVestmentDef.effectLines.map((line, i) => (
                              <li key={i} className="leading-snug">· {line}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] font-mono text-[#94A3B8] mt-1">
                            Base class defenses active (Phys {stats.physicalResistPct}% · Elem {stats.elementalResistPct}%).
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#2E2D3C]">
                      <button
                        type="button"
                        onClick={() => {
                          sfx.playUiClick();
                          setArmoryFilter('vestment');
                          setActiveTab('armaments');
                        }}
                        className="stone-button stone-button-dark py-1.5 px-3 min-h-[36px] text-[10px] font-mono font-bold text-[#A855F7] whitespace-nowrap"
                      >
                        {equippedVestmentDef ? 'Swap Vestment' : 'Equip Vestment'}
                      </button>
                      {isNonDefaultVestment && onSendAdminCommand && (
                        <button
                          type="button"
                          onClick={() => handleUnequipArmament('vestment')}
                          className="stone-button stone-button-dark py-1.5 px-3 min-h-[36px] text-[10px] font-mono font-bold text-[#F87171] whitespace-nowrap"
                        >
                          Restore Default
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Active Passive (Default Class Passive or Vestment Replacement) */}
                  <div className="stone-input p-3 flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#252336] border border-[#38BDF8] flex items-center justify-center font-mono font-bold text-xs text-[#38BDF8] shrink-0">
                      [PAS]
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono font-bold text-[#38BDF8] truncate">
                          {activeVestmentDef?.passiveName || heroDef.passiveName}
                        </span>
                        <span className="text-[9px] font-mono text-[#38BDF8] shrink-0 text-right">
                          {isNonDefaultVestment ? 'VESTMENT PASSIVE (REPLACES DEFAULT)' : 'DEFAULT PASSIVE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A19FAF] leading-snug mt-0.5">
                        {activeVestmentDef?.passiveSummary || heroDef.passiveDesc}
                      </p>
                    </div>
                  </div>

                  {/* Potion Pouch */}
                  <div className="stone-input p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-[#5CD68D] bg-[#1E2923] px-1.5 py-0.5 border border-[#22C55E]/40">
                        [POTION]
                      </span>
                      <div>
                        <div className="text-xs font-mono font-bold text-white">Health Potions</div>
                        <div className="text-[10px] text-[#A19FAF]">Restores 30% Max HP on use [E]</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-[#5CD68D] bg-[#1E2923] px-2 py-0.5 border border-[#22C55E]/40">
                        {player.potions || 0} POUCH
                      </span>
                      {onSendAdminCommand && (player.potions || 0) > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSendAdminCommand({ type: 'player:action', action: 'potion' })}
                            className="stone-button stone-button-dark py-1 px-2.5 text-[10px] font-mono font-bold text-[#5CD68D]"
                            title="Drink a potion now"
                          >
                            Drink
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDiscardPotion(true)}
                            className="stone-button stone-button-dark py-1 px-2 text-[10px] font-mono font-bold text-[#EF4444]"
                            title="Discard 1 health potion"
                          >
                            Discard
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                </div>

                {/* Active Synergies Box */}
                {activeSynergies.length > 0 && (
                  <div className="stone-plaque p-4 space-y-2 border-2 border-[#38BDF8]/60">
                    <h4 className="text-xs font-mono font-bold text-[#38BDF8] flex items-center gap-2">
                      <span>[SYNERGIES] Active Relic Combos</span>
                      <span className="text-[10px] bg-[#38BDF8]/20 px-1.5 border border-[#38BDF8]/40">{activeSynergies.length}</span>
                    </h4>
                    <div className="space-y-2">
                      {activeSynergies.map((syn) => (
                        <div key={syn.id} className="stone-input p-2.5 text-xs space-y-1">
                          <div className="font-bold font-mono" style={{ color: syn.accent }}>
                            {syn.name}
                          </div>
                          <p className="text-[11px] text-[#A19FAF]">{syn.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: 5 Equipped Relic Slots */}
              <div className="md:col-span-7 space-y-4">
                <div className="stone-plaque p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#353442] pb-2">
                    <h3 className="font-mono text-sm font-bold text-[#FCD34D] flex items-center gap-2">
                      <span>Equipped Dungeon Relics</span>
                      <span className="text-xs font-mono text-[#A19FAF]">({ownedRelics.length} / {MAX_EQUIPPED_RELICS} Max Slots)</span>
                    </h3>
                    <span className="text-[10px] font-mono text-[#A19FAF]">Active Combat Loadout</span>
                  </div>

                  {/* Render 5 Explicit Slots */}
                  <div className="space-y-3">
                    {Array.from({ length: MAX_EQUIPPED_RELICS }).map((_, slotIndex) => {
                      const relic = ownedRelicDefs[slotIndex] as RelicDef | undefined;
                      const isSelected = selectedRelic?.id === relic?.id;

                      if (relic) {
                        return (
                          <div
                            key={relic.id}
                            className={`stone-plaque p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-all ${
                              isSelected
                                ? 'border-2 border-[#FCD34D]'
                                : 'hover:border-[#525068]'
                            }`}
                          >
                            <div
                              className="flex-1 cursor-pointer space-y-1"
                              onClick={() => {
                                sfx.playUiClick();
                                setSelectedRelic(isSelected ? null : relic);
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                                  Slot {slotIndex + 1}
                                </span>
                                <span className="font-mono text-xs font-bold" style={{ color: relic.accent }}>
                                  {relic.name}
                                </span>
                                <span className="text-[9px] font-mono px-1.5 py-0.2 border bg-[#252336]" style={{ borderColor: `${relic.accent}66`, color: relic.accent }}>
                                  {relic.category}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#A19FAF] leading-relaxed">{relic.summary}</p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                              <button
                                type="button"
                                onClick={() => handleStoreRelic(relic.id)}
                                disabled={storedRelics.length >= MAX_STORAGE_SLOTS}
                                className="stone-button stone-button-dark text-[10px] font-mono py-1 px-2.5 text-[#38BDF8] disabled:opacity-40"
                                title={storedRelics.length >= MAX_STORAGE_SLOTS ? 'Vault storage is full (12/12)' : `Move ${relic.name} to Storage Vault`}
                              >
                                Store in Vault
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete({ relic, fromStorage: false })}
                                className="stone-button stone-button-red text-[10px] font-mono py-1 px-2.5"
                                title={`Dismantle ${relic.name} for +${DISMANTLE_GOLD_REWARD} Gold`}
                              >
                                Dismantle
                              </button>
                            </div>
                          </div>
                        );
                      }

                      // Empty Slot Card
                      return (
                        <div
                          key={`empty_slot_${slotIndex}`}
                          className="stone-input p-3 border-2 border-dashed border-[#353442] flex items-center justify-between gap-3 text-[#A19FAF]"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#171524] border border-[#353442] text-[#A19FAF]">
                              Slot {slotIndex + 1}
                            </span>
                            <div className="font-mono text-xs text-[#A19FAF]">
                              [ EMPTY RELIC SLOT ]
                            </div>
                          </div>
                          {storedRelics.length > 0 ? (
                            <button
                              type="button"
                              onClick={() => {
                                sfx.playUiClick();
                                setActiveTab('storage');
                              }}
                              className="stone-button stone-button-gold text-[10px] font-mono py-0.5 px-2 text-black font-bold"
                            >
                              + Equip from Vault ({storedRelics.length})
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-[#838192] hidden sm:inline">
                              Claim from Dungeon Chests
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Selected Relic Inspector Tooltip Box */}
                {selectedRelic && (
                  <div className="stone-panel p-4 space-y-2 border-2 border-[#FCD34D] animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-[#353442] pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#FCD34D] bg-[#252336] px-1.5 py-0.5 border border-[#353442]">[RELIC]</span>
                        <div>
                          <h4 className="font-mono text-sm font-bold" style={{ color: selectedRelic.accent }}>
                            {selectedRelic.name}
                          </h4>
                          <span className="text-[10px] font-mono text-[#A19FAF]">{selectedRelic.category} Artifact</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedRelic(null)}
                        className="stone-button stone-button-dark text-xs px-2 py-1"
                      >
                        Dismiss
                      </button>
                    </div>
                    <p className="text-xs text-[#E2E8F0] leading-relaxed pt-1 font-mono">
                      {selectedRelic.summary}
                    </p>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* TAB 2: PERMANENT CLASS ARMORY */}
          {activeTab === 'armaments' && (
            <div className="space-y-6">
              {/* Armory Header & Active Slots Summary */}
              <div className="stone-plaque p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase text-[#FCD34D]">
                      [PERMANENT ACCOUNT ARMORY] · {heroDef.name} Lv.{player.level}
                    </div>
                    <h3 className="font-mono text-base sm:text-lg font-bold text-white">
                      Class Weapons &amp; Vestments ({classOwnedCount}/{classCatalogCount} Unlocked)
                    </h3>
                    <p className="text-xs text-[#A19FAF] font-mono max-w-2xl leading-relaxed">
                      Permanent Armaments are bound to your account and persist across dungeon runs, deaths, and disconnects. Temporary Relics (5 slots), Vault Stash, and Arcanist Spell Scrolls remain separate expedition systems.
                    </p>
                  </div>

                  {/* Interactive Filter Bar */}
                  <div className="flex items-center gap-1.5 bg-[#171622] p-1 border border-[#353442]">
                    {([
                      ['all', 'All Gear'],
                      ['weapon', 'Weapons'],
                      ['vestment', 'Vestments'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          sfx.playUiClick();
                          setArmoryFilter(key);
                        }}
                        className={`px-3 py-1.5 min-h-[38px] text-xs font-mono font-bold whitespace-nowrap transition-colors ${
                          armoryFilter === key
                            ? 'bg-[#D9AA52] text-black'
                            : 'text-[#A19FAF] hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Currently Equipped Summary Strip */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-[#353442]">
                  <div className="stone-input p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-10 h-10 bg-[#181722] border flex items-center justify-center shrink-0"
                        style={{ borderColor: equippedWeaponDef ? equippedWeaponDef.accent : '#475569' }}
                      >
                        <ArmamentIcon itemId={equippedWeaponDef?.id ?? null} slot="weapon" size={30} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono uppercase text-[#A19FAF]">Equipped Weapon</div>
                        <div
                          className="text-xs font-mono font-bold truncate"
                          style={{ color: equippedWeaponDef ? equippedWeaponDef.accent : '#94A3B8' }}
                        >
                          {equippedWeaponDef ? equippedWeaponDef.name : 'None Equipped'}
                        </div>
                      </div>
                    </div>
                    {equippedWeaponDef && onSendAdminCommand && (
                      <button
                        type="button"
                        onClick={() => handleUnequipArmament('weapon')}
                        className="stone-button stone-button-dark py-1.5 px-3 min-h-[38px] text-[10px] font-mono font-bold text-[#F87171] whitespace-nowrap shrink-0"
                      >
                        Unequip
                      </button>
                    )}
                  </div>

                  <div className="stone-input p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-10 h-10 bg-[#181722] border flex items-center justify-center shrink-0"
                        style={{ borderColor: equippedVestmentDef ? equippedVestmentDef.accent : '#475569' }}
                      >
                        <ArmamentIcon itemId={equippedVestmentDef?.id ?? null} slot="vestment" size={30} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono uppercase text-[#A19FAF]">Equipped Vestment</div>
                        <div
                          className="text-xs font-mono font-bold truncate"
                          style={{ color: equippedVestmentDef ? equippedVestmentDef.accent : '#94A3B8' }}
                        >
                          {equippedVestmentDef ? equippedVestmentDef.name : 'None Equipped'}
                        </div>
                      </div>
                    </div>
                    {isNonDefaultVestment && onSendAdminCommand && (
                      <button
                        type="button"
                        onClick={() => handleUnequipArmament('vestment')}
                        className="stone-button stone-button-dark py-1.5 px-3 min-h-[38px] text-[10px] font-mono font-bold text-[#F87171] whitespace-nowrap shrink-0"
                      >
                        Restore Default
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Selected Armament Inspector Box */}
              {selectedArmament && (
                <div className="stone-panel p-4 space-y-2.5 border-2 border-[#FCD34D]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#353442] pb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 bg-[#181722] border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: selectedArmament.accent }}
                      >
                        <ArmamentIcon itemId={selectedArmament.id} slot={selectedArmament.slot} size={34} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-[#A19FAF]">
                          {HERO_CLASSES[selectedArmament.heroClass].name} · {selectedArmament.slot.toUpperCase()} · {selectedArmament.rarity} · {selectedArmament.archetype}
                        </div>
                        <h4 className="font-mono text-sm font-bold mt-0.5 truncate" style={{ color: selectedArmament.accent }}>
                          {selectedArmament.name}
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedArmament(null)}
                      className="stone-button stone-button-dark py-1.5 px-3 min-h-[38px] text-xs font-mono"
                    >
                      Close Inspector
                    </button>
                  </div>
                  <p className="text-xs text-[#E2E8F0] font-mono leading-relaxed">{selectedArmament.summary}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {selectedArmament.effectLines.map((line, i) => (
                      <div key={i} className="stone-input px-2.5 py-1.5 text-[11px] font-mono text-[#34D399]">
                        + {line}
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] font-mono text-[#A19FAF]">
                    Acquisition: {selectedArmament.unlockHint}
                  </div>
                </div>
              )}

              {/* Owned Armaments Collection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono text-xs font-bold uppercase text-[#FCD34D]">
                    Owned Account Armaments
                  </h4>
                  <span className="text-[11px] font-mono text-[#A19FAF] tabular-nums">
                    {ownedArmamentDefs.filter((item) => armoryFilter === 'all' || item.slot === armoryFilter).length} items
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {ownedArmamentDefs
                    .filter((item) => armoryFilter === 'all' || item.slot === armoryFilter)
                    .map((item) => {
                      const matchesClass = item.heroClass === heroClass;
                      const isEquipped =
                        item.slot === 'weapon'
                          ? equippedWeaponDef?.id === item.id
                          : equippedVestmentDef?.id === item.id;
                      const itemClassName = HERO_CLASSES[item.heroClass].name;

                      return (
                        <div
                          key={item.id}
                          className={`stone-plaque p-3.5 flex flex-col justify-between gap-3 border transition-all ${
                            isEquipped ? 'border-[#FACC15]' : 'border-[#353442] hover:border-[#525068]'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div
                                  className="w-10 h-10 bg-[#181722] border flex items-center justify-center shrink-0 mt-0.5"
                                  style={{ borderColor: item.accent }}
                                >
                                  <ArmamentIcon itemId={item.id} slot={item.slot} size={30} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-mono text-[#A19FAF]">
                                    {item.slot === 'weapon' ? 'Weapon' : 'Vestment'} · {itemClassName} · {item.archetype}
                                  </div>
                                  <h5 className="font-mono text-xs sm:text-sm font-bold mt-0.5 truncate" style={{ color: item.accent }}>
                                    {item.name}
                                  </h5>
                                </div>
                              </div>
                              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border shrink-0 ${rarityBadgeClass(item.rarity)}`}>
                                {item.rarity}
                              </span>
                            </div>

                            <p className="text-[11px] text-[#A19FAF] leading-relaxed">{item.summary}</p>

                            <ul className="space-y-1 text-[11px] font-mono text-[#E2E8F0]">
                              {item.effectLines.map((line, idx) => (
                                <li key={idx}>· {line}</li>
                              ))}
                            </ul>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#353442]">
                            <button
                              type="button"
                              onClick={() => {
                                sfx.playUiClick();
                                setSelectedArmament(selectedArmament?.id === item.id ? null : item);
                              }}
                              className="stone-button stone-button-dark py-1.5 px-3 min-h-[38px] text-[10px] font-mono text-[#CBD5E1]"
                            >
                              {selectedArmament?.id === item.id ? 'Hide Details' : 'Inspect'}
                            </button>

                            {!matchesClass ? (
                              <span className="text-[10px] font-mono text-[#F87171]">
                                Requires {itemClassName}
                              </span>
                            ) : isEquipped ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-bold text-[#FACC15]">EQUIPPED</span>
                                {onSendAdminCommand && (item.slot === 'weapon' || !item.isDefault) && (
                                  <button
                                    type="button"
                                    onClick={() => handleUnequipArmament(item.slot)}
                                    className="stone-button stone-button-dark py-1.5 px-3 min-h-[38px] text-[10px] font-mono font-bold text-[#F87171]"
                                  >
                                    {item.slot === 'vestment' ? 'Restore Default' : 'Unequip'}
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEquipArmament(item.slot, item.id)}
                                className="stone-button stone-button-gold py-1.5 px-4 min-h-[38px] text-[10px] font-mono font-bold text-black"
                              >
                                Equip {item.slot === 'weapon' ? 'Weapon' : 'Vestment'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Unlockable Class Armaments Codex */}
              {unownedClassArmaments.filter((item) => armoryFilter === 'all' || item.slot === armoryFilter).length > 0 && (
                <div className="space-y-3 pt-2 border-t border-[#353442]">
                  <div className="flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold uppercase text-[#A19FAF]">
                      Discoverable {heroDef.name} Armaments (Boss Drops)
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {unownedClassArmaments
                      .filter((item) => armoryFilter === 'all' || item.slot === armoryFilter)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="stone-input p-3.5 flex flex-col justify-between gap-2.5 opacity-85"
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-10 h-10 bg-[#181722] border border-[#353442] flex items-center justify-center shrink-0 mt-0.5">
                                  <ArmamentIcon itemId={item.id} slot={item.slot} size={30} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-mono text-[#8E8C9F]">
                                    {item.slot === 'weapon' ? 'Weapon' : 'Vestment'} · {item.rarity} · Locked
                                  </div>
                                  <h5 className="font-mono text-xs sm:text-sm font-bold text-[#CBD5E1] mt-0.5 truncate">
                                    {item.name}
                                  </h5>
                                </div>
                              </div>
                              <span className="text-[10px] font-mono text-[#FCD34D] shrink-0">
                                LOCKED
                              </span>
                            </div>
                            <ul className="space-y-0.5 text-[11px] font-mono text-[#A19FAF]">
                              {item.effectLines.map((line, idx) => (
                                <li key={idx}>· {line}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="text-[10px] font-mono text-[#38BDF8] pt-2 border-t border-[#2E2D3C]">
                            Unlock: {item.unlockHint}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: STORAGE VAULT (PERSONAL STASH) */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              
              {/* Storage Header Banner */}
              <div className="stone-plaque p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-mono uppercase text-[#38BDF8]">[PERSONAL SANCTUARY CHEST]</div>
                  <h3 className="font-mono text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Vault Storage Stash</span>
                    <span className="text-xs font-mono px-2 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                      {storedRelics.length} / {MAX_STORAGE_SLOTS} SLOTS USED
                    </span>
                  </h3>
                  <p className="text-xs text-[#A19FAF] font-mono max-w-2xl leading-relaxed">
                    Store extra artifacts here to preserve them across expeditions. Items stored in your vault can be equipped into your active loadout anytime, or dismantled for +{DISMANTLE_GOLD_REWARD} Gold.
                  </p>
                </div>

                <div className="stone-input p-3 font-mono text-xs flex items-center gap-4">
                  <div>
                    <span className="text-[#A19FAF] text-[10px] block uppercase">Equipped Loadout</span>
                    <span className="text-[#FCD34D] font-bold text-sm">{ownedRelics.length} / {MAX_EQUIPPED_RELICS} Active</span>
                  </div>
                  <div className="border-l border-[#353442] pl-4">
                    <span className="text-[#A19FAF] text-[10px] block uppercase">Vault Capacity</span>
                    <span className="text-[#38BDF8] font-bold text-sm">{MAX_STORAGE_SLOTS - storedRelics.length} Free</span>
                  </div>
                </div>
              </div>

              {/* 12 Vault Storage Slots Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: MAX_STORAGE_SLOTS }).map((_, slotIdx) => {
                  const relic = storedRelicDefs[slotIdx] as RelicDef | undefined;
                  const isSelected = selectedRelic?.id === relic?.id;

                  if (relic) {
                    const isLoadoutFull = ownedRelics.length >= MAX_EQUIPPED_RELICS;
                    return (
                      <div
                        key={`vault_${relic.id}_${slotIdx}`}
                        className={`stone-plaque p-3 flex flex-col justify-between gap-3 transition-all ${
                          isSelected ? 'border-2 border-[#38BDF8]' : 'hover:border-[#525068]'
                        }`}
                      >
                        <div
                          className="cursor-pointer space-y-1.5"
                          onClick={() => {
                            sfx.playUiClick();
                            setSelectedRelic(isSelected ? null : relic);
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-[#38BDF8]">
                                Vault {slotIdx + 1}
                              </span>
                              <span className="font-mono text-xs font-bold" style={{ color: relic.accent }}>
                                {relic.name}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 border bg-[#252336]" style={{ borderColor: `${relic.accent}66`, color: relic.accent }}>
                              {relic.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#A19FAF] leading-relaxed line-clamp-2">{relic.summary}</p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#353442]">
                          <button
                            type="button"
                            onClick={() => handleEquipStoredRelic(relic.id)}
                            disabled={isLoadoutFull}
                            className={`stone-button text-[10px] font-mono py-1 px-3 ${
                              isLoadoutFull
                                ? 'stone-button-dark opacity-40 cursor-not-allowed'
                                : 'stone-button-gold text-black font-bold'
                            }`}
                            title={isLoadoutFull ? 'Equipped loadout is full (5/5). Unequip an active relic first.' : `Equip ${relic.name} into battle`}
                          >
                            {isLoadoutFull ? 'Loadout Full (5/5)' : 'Equip to Loadout'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ relic, fromStorage: true })}
                            className="stone-button stone-button-red text-[10px] font-mono py-1 px-2.5"
                            title={`Dismantle ${relic.name} for +${DISMANTLE_GOLD_REWARD} Gold`}
                          >
                            Dismantle
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // Empty Vault Slot
                  return (
                    <div
                      key={`vault_empty_${slotIdx}`}
                      className="stone-input p-3 border-2 border-dashed border-[#353442] flex items-center justify-between gap-3 text-[#A19FAF]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#171524] border border-[#353442] text-[#716F82]">
                          Vault {slotIdx + 1}
                        </span>
                        <div className="font-mono text-xs text-[#716F82]">
                          [ EMPTY VAULT SLOT ]
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-[#585667]">
                        Store from Loadout
                      </span>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* TAB 3: DETAILED STAT PROJECTIONS */}
          {activeTab === 'projections' && (
            <div className="space-y-6">
              
              {/* Reassessed Class Performance & Effective Combat Rating Banner */}
              <div className="stone-plaque p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-[#A19FAF]">
                      {heroDef.name} ({heroDef.roleBadge}) Performance Assessment · Rating {overallRank.score} PTS
                    </div>
                    <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                      <span className="text-2xl font-mono font-bold" style={{ color: overallRank.color }}>
                        {stats.effectiveDps} <span className="text-xs font-normal text-[#A19FAF]">Eff. DPS / sec</span>
                      </span>
                      <span
                        className="text-xs font-mono font-bold px-2.5 py-0.5 border"
                        style={{
                          color: overallRank.color,
                          borderColor: `${overallRank.color}66`,
                          backgroundColor: `${overallRank.color}15`,
                        }}
                      >
                        {overallRank.label}
                      </span>
                      <span className="text-[11px] font-mono text-[#A19FAF]">
                        (Primary: {stats.directDps}{stats.tacticalAbilityDps > 0 ? ` + Skill: ${stats.tacticalAbilityDps}` : ''}{stats.passiveCombatDps > 0 ? ` + Passive: ${stats.passiveCombatDps}` : ''}{stats.dotDpsContribution > 0 ? ` + DoT: ${stats.dotDpsContribution}` : ''})
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A19FAF] mt-1 font-mono">
                      Calibrated for {heroDef.role} performance across Offense ({stats.offenseRank.label}), Defense ({stats.defenseRank.label}), and Support/Utility ({stats.utilityRank.label}).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 stone-input p-3 font-mono text-xs">
                    <div>
                      <span className="text-[#A19FAF] text-[10px] block uppercase">Damage Mult</span>
                      <span className="text-[#FCD34D] font-bold text-sm">{stats.damageMultiplier}x</span>
                    </div>
                    <div className="border-l border-[#353442] pl-4">
                      <span className="text-[#A19FAF] text-[10px] block uppercase">Effective HP</span>
                      <span className="text-[#10B981] font-bold text-sm">{stats.effectiveHp}</span>
                    </div>
                    <div className="border-l border-[#353442] pl-4">
                      <span className="text-[#A19FAF] text-[10px] block uppercase">Crit Rate</span>
                      <span className="text-[#38BDF8] font-bold text-sm">{stats.critChancePct}%</span>
                    </div>
                    <div className="border-l border-[#353442] pl-4">
                      <span className="text-[#A19FAF] text-[10px] block uppercase">Attack Cooldown</span>
                      <span className="text-[#34D399] font-bold text-sm">{stats.attackCooldownMs}ms</span>
                    </div>
                  </div>
                </div>

                {/* 3-Pillar D–S+ Rank Breakdown */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                  <div className="stone-input p-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase text-[#A19FAF]">Offense Output</div>
                      <div className="text-xs font-bold text-white">{stats.effectiveDps} Eff. DPS</div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 border"
                      style={{
                        color: stats.offenseRank.color,
                        borderColor: `${stats.offenseRank.color}66`,
                        backgroundColor: `${stats.offenseRank.color}15`,
                      }}
                    >
                      {stats.offenseRank.label}
                    </span>
                  </div>

                  <div className="stone-input p-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase text-[#A19FAF]">Defense &amp; EHP</div>
                      <div className="text-xs font-bold text-white">{stats.effectiveHp} EHP</div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 border"
                      style={{
                        color: stats.defenseRank.color,
                        borderColor: `${stats.defenseRank.color}66`,
                        backgroundColor: `${stats.defenseRank.color}15`,
                      }}
                    >
                      {stats.defenseRank.label}
                    </span>
                  </div>

                  <div className="stone-input p-2.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase text-[#A19FAF]">Support &amp; Tempo</div>
                      <div className="text-xs font-bold text-white">
                        {stats.selfShieldPerSec > 0
                          ? `${stats.healingPerSec} HP/s · ${stats.selfShieldPerSec} Shd/s`
                          : `${stats.healingPerSec} HP/s · ${stats.cooldownReductionPct}% CDR`}
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 border"
                      style={{
                        color: stats.utilityRank.color,
                        borderColor: `${stats.utilityRank.color}66`,
                        backgroundColor: `${stats.utilityRank.color}15`,
                      }}
                    >
                      {stats.utilityRank.label}
                    </span>
                  </div>
                </div>
              </div>

              {/* Grid of Stat Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Box A: Offense & Attack Cadence */}
                <div className="stone-plaque p-4 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-[#FCD34D] uppercase tracking-wider border-b border-[#353442] pb-2 flex items-center justify-between">
                    <span>[OFFENSE] Attack Cadence</span>
                    <span className="font-mono text-[10px] text-[#34D399]">{stats.primaryCategory.toUpperCase()} DAMAGE</span>
                  </h3>

                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Primary Stat ({stats.primaryStatName})</span>
                      <span className="font-bold text-white">{stats.primaryStatValue} Pts (+{(stats.primaryStatValue * 0.8).toFixed(1)}% Dmg)</span>
                    </div>

                    {player.heroClass === 'cleric' && (
                      <div className="flex items-center justify-between p-2 stone-input">
                        <span className="text-[#A19FAF]">Healing Effectiveness (Faith)</span>
                        <span className="font-bold text-[#34D399]">{stats.healingMultiplier}x (+{stats.healingBonusPct}% Lv &amp; FTH)</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Scaled Primary Hit</span>
                      <span className="font-bold text-[#FCD34D]">
                        {stats.scaledHitDamage} Dmg ({stats.directDps} DPS)
                      </span>
                    </div>

                    {stats.longshotHitDamage > stats.scaledHitDamage && (
                      <div className="flex items-center justify-between p-2 stone-input">
                        <span className="text-[#A19FAF]">Eagle Keenness (180u+ Longshot)</span>
                        <span className="font-bold text-[#34D399]">{stats.longshotHitDamage} Dmg / Hit (+25%)</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-2 stone-input gap-2">
                      <span className="text-[#A19FAF]">{stats.activeTacticalLabel}</span>
                      <span className="font-bold text-[#E879F9] text-right">
                        {stats.activeTacticalHitDamage} Hit (+{stats.tacticalAbilityDps} DPS)
                      </span>
                    </div>

                    {player.heroClass === 'arcanist' &&
                      (!activeVestmentDef || activeVestmentDef.passiveId === 'astral_resonance') &&
                      stats.passiveCombatDps > 0 && (
                        <div className="flex items-center justify-between p-2 stone-input">
                          <span className="text-[#A19FAF]">Star Rift Passive (4th Hit / 8s CD)</span>
                          <span className="font-bold text-[#C084FC]">+{stats.passiveCombatDps} DPS</span>
                        </div>
                      )}

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Hybrid DoT Scaling</span>
                      <span className="font-bold text-[#F97316]">{stats.dotMultiplier}x (+{stats.dotBonusPct}% Lv & {stats.primaryStatName.slice(0, 3).toUpperCase()})</span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input gap-2">
                      <span className="text-[#A19FAF]">Active DoT Output</span>
                      <span className="font-bold text-[#FB923C] text-right">
                        {stats.dotDpsContribution > 0
                          ? `+${stats.dotDpsContribution} DPS (${[
                              stats.hasBurnRelic ? `Burn ${stats.burnTickDamage}` : '',
                              stats.hasPoisonRelic ? `Poison ${stats.poisonTickDamage}` : '',
                              stats.hasBleedRelic ? `Bleed ${stats.bleedTickDamage}-${stats.bleedMovingTickDamage}` : '',
                            ].filter(Boolean).join(' / ')})`
                          : `0.0 DPS (Base Burn ${stats.burnTickDamage} / Poison ${stats.poisonTickDamage} / Bleed ${stats.bleedTickDamage}-${stats.bleedMovingTickDamage})`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Attack Cooldown & Frequency</span>
                      <span className="font-bold text-[#34D399]">{stats.attackCooldownMs} ms ({stats.attacksPerSecond} atk/s)</span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Critical Strike Chance</span>
                      <span className="font-bold text-[#38BDF8]">{stats.critChancePct}% (Cap: 45.0%)</span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Critical Damage Multiplier</span>
                      <span className="font-bold text-[#E0A94F]">{stats.critMultiplier}x ({stats.critHitDamage} Crit Dmg)</span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Piercing & Extra Projectiles</span>
                      <span className="font-bold text-[#A855F7]">{stats.pierceCount} Target Pierce {stats.extraProjectileCount > 0 ? '(+1 Twin Shot)' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Box B: Defense, Armor & Vitality */}
                <div className="stone-plaque p-4 space-y-3">
                  <h3 className="font-mono text-xs font-bold text-[#10B981] uppercase tracking-wider border-b border-[#353442] pb-2 flex items-center justify-between">
                    <span>[DEFENSE] Survivability</span>
                    <span className="font-mono text-[10px] text-[#10B981]">MAX HP: {stats.maxHp}</span>
                  </h3>

                  <div className="space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Max Health Pool Breakdown</span>
                      <span className="font-bold text-[#10B981]">
                        {stats.maxHp} HP (Base {stats.baseHp} + Lv {stats.levelHpBonus} + VIT {stats.vitHpBonus}{stats.relicHpBonus > 0 ? ` + Relic ${stats.relicHpBonus}` : ''})
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Effective Health (EHP)</span>
                      <span className="font-bold text-[#34D399]">{stats.effectiveHp} EHP (Mitigation-Adjusted)</span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Combat Health Regeneration</span>
                      <span className="font-bold text-[#5CD68D]">
                        +{stats.hpRegenPerTick} HP / 2.0s ({stats.healingPerSec} Total Sustain/s)
                      </span>
                    </div>

                    {stats.selfShieldPerSec > 0 && (
                      <div className="flex items-center justify-between p-2 stone-input">
                        <span className="text-[#A19FAF]">Bulwark &amp; Iron Will Shielding</span>
                        <span className="font-bold text-[#93C5FD]">+{stats.selfShieldPerSec} Shield/s</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Physical Damage Mitigation</span>
                      <span className="font-bold text-[#60A5FA]">{stats.physicalResistPct}% (Base + STR + Relics)</span>
                    </div>

                    {stats.vanguardIronWillPct > 0 && (
                      <div className="flex items-center justify-between p-2 stone-input">
                        <span className="text-[#A19FAF]">Vanguard Iron Will Passive</span>
                        <span className="font-bold text-[#CBD5E1]">Absorbs 15.0% incoming damage</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Elemental / Status Resistance</span>
                      <span className="font-bold text-[#F472B6]">{stats.elementalResistPct}% (Base + INT + Relics)</span>
                    </div>

                    <div className="flex items-center justify-between p-2 stone-input">
                      <span className="text-[#A19FAF]">Spiritual Debuff Tenacity</span>
                      <span className="font-bold text-[#FDE047]">{stats.faithCcTenacityPct}% CC Duration Reduction</span>
                    </div>
                  </div>
                </div>

                {/* Box C: Mobility & Cooldown Reduction */}
                <div className="stone-plaque p-4 space-y-3 md:col-span-2">
                  <h3 className="font-mono text-xs font-bold text-[#38BDF8] uppercase tracking-wider border-b border-[#353442] pb-2 flex items-center justify-between">
                    <span>[MOBILITY] Speed & Acceleration</span>
                    <span className="font-mono text-[10px] text-[#38BDF8]">CDR: {stats.cooldownReductionPct}%</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                    <div className="p-3 stone-input space-y-1">
                      <div className="text-[#A19FAF] text-[10px] uppercase">Movement Velocity</div>
                      <div className="text-sm font-bold text-[#38BDF8]">{stats.moveSpeedPx} px/s</div>
                      <div className="text-[10px] text-[#34D399]">+{stats.moveSpeedBonusPct}% over base class speed</div>
                    </div>

                    <div className="p-3 stone-input space-y-1">
                      <div className="text-[#A19FAF] text-[10px] uppercase">{stats.activeTacticalLabel}</div>
                      <div className="text-sm font-bold text-[#FCD34D]">{stats.tacticalCooldownSec} seconds</div>
                      <div className="text-[10px] text-[#A19FAF]">Base: {(stats.tacticalBaseCooldownMs / 1000).toFixed(1)}s</div>
                    </div>

                    <div className="p-3 stone-input space-y-1">
                      <div className="text-[#A19FAF] text-[10px] uppercase">Ultimate Ability Cadence</div>
                      <div className="text-sm font-bold text-[#E0A94F]">{stats.ultCooldownSec} seconds</div>
                      <div className="text-[10px] text-[#A19FAF]">Base: {(heroDef.ultCooldownMs / 1000).toFixed(1)}s</div>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="stone-plaque p-3 px-6 flex items-center justify-between shrink-0 text-xs font-mono text-[#A19FAF]">
          <div>
            Press <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white font-mono">I</kbd> or <kbd className="px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-white font-mono">Tab</kbd> to toggle inventory.
          </div>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-gold py-1.5 px-5 text-xs font-mono font-bold"
          >
            Close Character Sheet
          </button>
        </div>

        {/* CONFIRMATION OVERLAY MODAL: DISMANTLE RELIC */}
        {confirmDelete && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="stone-panel max-w-md w-full p-5 space-y-4 border-2 border-[#EF4444] animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-[#353442] pb-2">
                <span className="font-mono text-sm font-bold text-[#EF4444] flex items-center gap-2">
                  [DISMANTLE ARTIFACT]
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#252336] border border-[#353442] text-[#FCD34D]">
                  +{DISMANTLE_GOLD_REWARD} Gold
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-[#A19FAF]">Artifact:</span>
                  <span className="font-bold text-white" style={{ color: confirmDelete.relic.accent }}>
                    {confirmDelete.relic.name}
                  </span>
                  <span className="text-[10px] text-[#A19FAF]">
                    ({confirmDelete.fromStorage ? 'From Vault' : 'Equipped'})
                  </span>
                </div>
                <p className="text-xs text-[#E2E8F0] font-mono leading-relaxed">
                  Are you sure you want to dismantle <span className="font-bold text-white">{confirmDelete.relic.name}</span>? You will salvage its raw components for <span className="font-bold text-[#FCD34D]">+{DISMANTLE_GOLD_REWARD} Gold</span>. This artifact will be permanently destroyed.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#353442]">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="stone-button stone-button-dark py-1.5 px-4 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteRelic}
                  className="stone-button stone-button-red py-1.5 px-4 text-xs font-mono font-bold"
                >
                  Confirm Dismantle (+{DISMANTLE_GOLD_REWARD}g)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CONFIRMATION OVERLAY MODAL: DISCARD POTION */}
        {confirmDiscardPotion && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="stone-panel max-w-sm w-full p-5 space-y-4 border-2 border-[#EF4444] animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-[#353442] pb-2">
                <span className="font-mono text-sm font-bold text-[#EF4444]">
                  [DISCARD POTION]
                </span>
                <span className="text-[10px] font-mono text-[#A19FAF]">
                  Pouch: {player.potions || 0}
                </span>
              </div>

              <p className="text-xs text-[#E2E8F0] font-mono leading-relaxed">
                Discard 1 Health Potion from your pouch? Discarded potions cannot be recovered.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#353442]">
                <button
                  type="button"
                  onClick={() => setConfirmDiscardPotion(false)}
                  className="stone-button stone-button-dark py-1.5 px-4 text-xs font-mono"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDiscardPotion}
                  className="stone-button stone-button-red py-1.5 px-4 text-xs font-mono font-bold"
                >
                  Confirm Discard
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
