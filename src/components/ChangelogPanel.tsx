import React from 'react';
import { sfx } from '../client/sound.ts';
import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  CHANGELOG_DATA,
  type ChangelogEntry,
} from '../data/changelog.ts';

interface ChangelogPanelProps {
  onOpenFullChangelog: () => void;
  className?: string;
}

export const ChangelogPanel: React.FC<ChangelogPanelProps> = ({
  onOpenFullChangelog,
  className = '',
}) => {
  // The newest release always appears first
  const latest: ChangelogEntry = CHANGELOG_DATA[0];

  if (!latest) return null;

  // Only display categories that contain actual changes
  const activeCategories = CATEGORY_ORDER.filter(
    (cat) => latest.categories[cat] && latest.categories[cat]!.length > 0
  );

  return (
    <aside
      aria-label="Latest Updates Panel"
      className={`stone-panel relative z-10 w-full max-w-[460px] p-5 sm:p-6 pt-9 pb-5 flex flex-col justify-between ${className}`}
    >
      {/* Stone corner chisel details matching LoginScreen */}
      <span
        aria-hidden="true"
        className="absolute top-1.5 left-1.5 w-2 h-2 border-t-2 border-l-2 border-[#8B8996]/60 pointer-events-none"
      />
      <span
        aria-hidden="true"
        className="absolute top-1.5 right-1.5 w-2 h-2 border-t-2 border-r-2 border-[#8B8996]/60 pointer-events-none"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-1.5 left-1.5 w-2 h-2 border-b-2 border-l-2 border-[#393844]/80 pointer-events-none"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-1.5 right-1.5 w-2 h-2 border-b-2 border-r-2 border-[#393844]/80 pointer-events-none"
      />

      {/* Raised Top Stone Plaque Header */}
      <div className="stone-plaque absolute -top-5 left-1/2 -translate-x-1/2 px-5 py-1.5 flex items-center justify-center gap-2 min-w-[200px] sm:min-w-[240px]">
        <span className="w-2 h-2 rounded-full bg-[#F59E0B] shadow-[0_0_8px_#F59E0B] animate-pulse" />
        <h2 className="font-display text-lg sm:text-xl font-semibold tracking-wide text-[#F5F5F7] drop-shadow-[0_2px_0_#2F2E3A] whitespace-nowrap">
          LATEST UPDATES
        </h2>
      </div>

      <div className="space-y-4 pt-1">
        {/* Release Version Banner */}
        <div className="stone-plaque p-3 flex items-center justify-between gap-2 border border-[#353442]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="px-2 py-0.5 text-xs font-mono font-bold bg-[#D9AA52] text-black shadow-sm shrink-0">
              {latest.version}
            </span>
            <h3 className="font-display text-sm sm:text-base font-bold text-[#F3F2F7] truncate">
              {latest.title}
            </h3>
          </div>
          <span className="text-[11px] font-mono text-[#A19FAF] whitespace-nowrap shrink-0">
            {latest.releaseDate}
          </span>
        </div>

        {/* Short Description */}
        <p className="text-xs sm:text-[13px] text-[#D4D2DE] leading-relaxed font-sans px-1">
          {latest.description}
        </p>

        {/* Categorized Changes List (Only non-empty categories) */}
        <div className="space-y-3 max-h-[300px] sm:max-h-[340px] overflow-y-auto pr-1">
          {activeCategories.map((catKey) => {
            const items = latest.categories[catKey]!;
            const style = CATEGORY_STYLES[catKey];
            return (
              <div
                key={catKey}
                className="stone-plaque p-3 space-y-2 border border-[#353442] bg-[#22202C]/80"
              >
                {/* Category Header Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider border ${style.bg} ${style.border} ${style.text} ${style.glow}`}
                  >
                    {catKey}
                  </span>
                  <span className="text-[10px] font-mono text-[#8B8996]">
                    {items.length} {items.length === 1 ? 'change' : 'changes'}
                  </span>
                </div>

                {/* Bullets */}
                <ul className="space-y-1.5 pl-0.5">
                  {items.map((item, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs text-[#E6E4EE] leading-snug"
                    >
                      <span className="text-[#D9AA52] font-mono font-bold select-none shrink-0 mt-0.5">
                        ▸
                      </span>
                      <span className="font-sans text-[11.5px] sm:text-xs">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 mt-2 border-t border-[#3B3944] flex flex-col sm:flex-row items-center justify-between gap-3">
        <span className="text-[11px] font-mono text-[#A19FAF] text-center sm:text-left">
          {CHANGELOG_DATA.length} releases documented
        </span>

        <button
          type="button"
          onClick={() => {
            sfx.playUiClick();
            onOpenFullChangelog();
          }}
          className="stone-button stone-button-gold w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-bold tracking-wide"
        >
          VIEW FULL CHANGELOG
        </button>
      </div>
    </aside>
  );
};
