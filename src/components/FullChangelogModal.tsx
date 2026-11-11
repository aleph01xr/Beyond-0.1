import React, { useEffect, useState } from 'react';
import { sfx } from '../client/sound.ts';
import {
  CATEGORY_ORDER,
  CATEGORY_STYLES,
  CHANGELOG_DATA,
  type ChangelogCategory,
} from '../data/changelog.ts';

interface FullChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullChangelogModal: React.FC<FullChangelogModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<ChangelogCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sfx.playUiCancel();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter releases and categories
  const filteredReleases = CHANGELOG_DATA.map((entry) => {
    // If category filter is active, check if entry has this category
    if (selectedCategory !== 'ALL' && (!entry.categories[selectedCategory] || entry.categories[selectedCategory]!.length === 0)) {
      return null;
    }

    // If search query is entered, check version, title, description, and bullet items
    const query = searchQuery.trim().toLowerCase();
    if (!query) return entry;

    const matchesHeader =
      entry.version.toLowerCase().includes(query) ||
      entry.title.toLowerCase().includes(query) ||
      entry.description.toLowerCase().includes(query) ||
      entry.releaseDate.toLowerCase().includes(query);

    const filteredCategories: typeof entry.categories = {};
    let hasMatchingCategoryItem = false;

    for (const catKey of CATEGORY_ORDER) {
      const items = entry.categories[catKey];
      if (!items) continue;
      const matchedItems = items.filter((item) =>
        item.toLowerCase().includes(query) || catKey.toLowerCase().includes(query)
      );
      if (matchedItems.length > 0) {
        filteredCategories[catKey] = matchedItems;
        hasMatchingCategoryItem = true;
      }
    }

    if (matchesHeader) {
      return entry;
    }

    if (hasMatchingCategoryItem) {
      return {
        ...entry,
        categories: filteredCategories,
      };
    }

    return null;
  }).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200 select-none pb-safe pt-safe pl-safe pr-safe"
    >
      <div className="stone-panel w-full max-w-3xl max-h-[92dvh] flex flex-col overflow-hidden text-white rounded-none relative shadow-2xl">
        {/* Subtle stone corner chisel details */}
        <span
          aria-hidden="true"
          className="absolute top-1.5 left-1.5 w-2.5 h-2.5 border-t-2 border-l-2 border-[#8B8996]/60 pointer-events-none z-10"
        />
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 w-2.5 h-2.5 border-t-2 border-r-2 border-[#8B8996]/60 pointer-events-none z-10"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 border-b-2 border-l-2 border-[#393844]/80 pointer-events-none z-10"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-1.5 right-1.5 w-2.5 h-2.5 border-b-2 border-r-2 border-[#393844]/80 pointer-events-none z-10"
        />

        {/* Modal Header */}
        <div className="stone-plaque p-4 flex items-center justify-between shrink-0 border-b border-[#353442]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 border-2 border-[#D9AA52] bg-[#252336] flex items-center justify-center font-mono font-bold text-xs text-[#FCD34D] shadow">
              [LOG]
            </div>
            <div>
              <h2
                id="changelog-modal-title"
                className="font-display text-lg sm:text-xl font-bold text-white tracking-wide"
              >
                Beyond — Complete Update Log
              </h2>
              <p className="text-xs text-[#A19FAF] font-mono mt-0.5">
                Release Archive &amp; Patch Notes · {CHANGELOG_DATA.length} versions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sfx.playUiCancel();
              onClose();
            }}
            className="stone-button stone-button-dark w-9 h-9 p-0 text-white font-mono font-bold text-base flex items-center justify-center cursor-pointer"
            title="Close [Esc]"
            aria-label="Close changelog modal"
          >
            ✕
          </button>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="stone-plaque border-b border-[#353442] p-3 sm:p-3.5 space-y-2.5 shrink-0 bg-[#22202C]/90">
          {/* Search Bar */}
          <div className="stone-input flex items-center gap-2.5 px-3 h-10">
            <span className="text-[#A19FAF] text-xs font-mono font-bold select-none shrink-0">
              SEARCH:
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by keyword, version (e.g. v1.2), or feature..."
              className="w-full bg-transparent font-mono text-xs text-white placeholder:text-[#848292] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#A19FAF] hover:text-white font-mono px-1.5 cursor-pointer"
              >
                CLEAR
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setSelectedCategory('ALL');
              }}
              className={`px-2.5 py-1 text-[10px] sm:text-[11px] font-mono font-bold transition-all shrink-0 cursor-pointer ${
                selectedCategory === 'ALL'
                  ? 'stone-button stone-button-gold text-black shadow-sm'
                  : 'stone-button stone-button-dark text-[#A19FAF]'
              }`}
            >
              ALL CATEGORIES
            </button>

            {CATEGORY_ORDER.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    sfx.playUiClick();
                    setSelectedCategory(cat);
                  }}
                  className={`px-2 py-1 text-[10px] sm:text-[11px] font-mono font-bold transition-all shrink-0 cursor-pointer ${
                    active
                      ? 'stone-button stone-button-gold text-black shadow-sm'
                      : 'stone-button stone-button-dark text-[#A19FAF]'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Changelog List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {filteredReleases.length === 0 ? (
            <div className="stone-plaque p-8 text-center space-y-2 border border-[#353442]">
              <p className="font-mono text-sm text-[#FBBF24]">
                No patch notes found matching your criteria.
              </p>
              <p className="text-xs text-[#A19FAF]">
                Try adjusting your search terms or clearing category filters.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('ALL');
                  setSearchQuery('');
                }}
                className="stone-button stone-button-dark mx-auto mt-2 px-3 py-1 text-xs font-mono"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            filteredReleases.map((entry, entryIdx) => {
              // Only display categories that contain actual changes
              const activeCategories = CATEGORY_ORDER.filter(
                (cat) =>
                  (selectedCategory === 'ALL' || selectedCategory === cat) &&
                  entry.categories[cat] &&
                  entry.categories[cat]!.length > 0
              );

              return (
                <article
                  key={entry.version}
                  className="stone-plaque p-4 sm:p-5 space-y-3.5 border-2 border-[#353442] bg-[#22202C]/90 relative"
                >
                  {/* Top Release Banner */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#3B3944]">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-2.5 py-1 text-xs sm:text-sm font-mono font-bold bg-[#D9AA52] text-black shadow">
                        {entry.version}
                      </span>
                      {entryIdx === 0 && (
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-[#143826] border border-[#22C55E] text-[#86EFAC]">
                          LATEST
                        </span>
                      )}
                      <h3 className="font-display text-base sm:text-lg font-bold text-[#F5F5F7]">
                        {entry.title}
                      </h3>
                    </div>
                    <time className="text-xs font-mono text-[#A19FAF] shrink-0">
                      {entry.releaseDate}
                    </time>
                  </div>

                  {/* Summary Description */}
                  <p className="text-xs sm:text-sm text-[#D4D2DE] leading-relaxed font-sans">
                    {entry.description}
                  </p>

                  {/* Categorized Changes */}
                  <div className="space-y-3 pt-1">
                    {activeCategories.map((catKey) => {
                      const items = entry.categories[catKey]!;
                      const style = CATEGORY_STYLES[catKey];
                      return (
                        <div
                          key={catKey}
                          className="stone-panel p-3 space-y-2 border border-[#353442] bg-[#1A1822]"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider border ${style.bg} ${style.border} ${style.text} ${style.glow}`}
                            >
                              {catKey}
                            </span>
                            <span className="text-[10px] font-mono text-[#8B8996]">
                              {items.length} {items.length === 1 ? 'entry' : 'entries'}
                            </span>
                          </div>

                          <ul className="space-y-1.5 pl-0.5">
                            {items.map((item, idx) => (
                              <li
                                key={idx}
                                className="flex items-start gap-2 text-xs sm:text-[12.5px] text-[#E6E4EE] leading-snug"
                              >
                                <span className="text-[#D9AA52] font-mono font-bold select-none shrink-0 mt-0.5">
                                  ▸
                                </span>
                                <span className="font-sans">
                                  {item}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="stone-plaque p-3 sm:p-4 border-t border-[#353442] flex items-center justify-between shrink-0">
          <span className="text-xs font-mono text-[#A19FAF]">
            Showing {filteredReleases.length} of {CHANGELOG_DATA.length} versions
          </span>
          <button
            type="button"
            onClick={() => {
              sfx.playUiClick();
              onClose();
            }}
            className="stone-button stone-button-gold px-4 py-1.5 text-xs font-bold"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
