import React, { useEffect, useRef, useState } from 'react';

interface CinematicIntroOverlayProps {
  floor: number;
  biomeTitle: string;
  isInitialChapterEntry: boolean;
  onComplete: () => void;
}

const FLOOR_ROMAN_MAP: Record<number, string> = {
  1: 'FLOOR I',
  2: 'FLOOR II',
  3: 'FLOOR III',
  4: 'FLOOR IV',
  5: 'FLOOR V',
  6: 'FLOOR VI',
  7: 'FLOOR VII',
  8: 'FLOOR VIII',
  9: 'FLOOR IX',
  10: 'FLOOR X',
};

export const CinematicIntroOverlay: React.FC<CinematicIntroOverlayProps> = ({
  floor,
  biomeTitle,
  isInitialChapterEntry,
  onComplete,
}) => {
  const [step, setStep] = useState<number>(0);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const romanFloor = FLOOR_ROMAN_MAP[floor] || `FLOOR ${floor}`;
  const isFullChapterI = floor === 1 && isInitialChapterEntry;

  const handleDismiss = () => {
    setIsFadingOut(true);
    setTimeout(() => onCompleteRef.current(), 250);
  };

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setStep(4);
      const timer = setTimeout(() => {
        setIsFadingOut(true);
        setTimeout(() => onCompleteRef.current(), 300);
      }, 1200);
      return () => clearTimeout(timer);
    }

    if (isFullChapterI) {
      const t1 = setTimeout(() => setStep(1), 200);
      const t2 = setTimeout(() => setStep(2), 900);
      const t3 = setTimeout(() => setStep(3), 1500);
      const t4 = setTimeout(() => setStep(4), 2100);
      const t5 = setTimeout(() => setIsFadingOut(true), 4000);
      const t6 = setTimeout(() => onCompleteRef.current(), 4500);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
        clearTimeout(t5);
        clearTimeout(t6);
      };
    } else {
      const t1 = setTimeout(() => setStep(1), 150);
      const t2 = setTimeout(() => setIsFadingOut(true), 2200);
      const t3 = setTimeout(() => onCompleteRef.current(), 2600);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [floor, isFullChapterI]);

  return (
    <div
      role="region"
      aria-label="Cinematic Floor Introduction"
      onClick={handleDismiss}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-black/90 backdrop-blur-md select-none cursor-pointer transition-opacity duration-500 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Background Radial Gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1E1B2E]/60 via-[#0C0B12]/80 to-black pointer-events-none" />

      {/* Floating Ember Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={`ember_${i}`}
            className="absolute w-1.5 h-1.5 rounded-full bg-[#FCD34D] shadow-[0_0_8px_#FCD34D] animate-ember"
            style={{
              left: `${10 + (i * 7.5) % 80}%`,
              bottom: `${15 + (i * 8) % 40}%`,
              animationDelay: `${i * 0.35}s`,
              animationDuration: `${3.5 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      {/* Chapter I Main Entry Presentation */}
      {isFullChapterI ? (
        <div className="relative z-10 flex flex-col items-center text-center space-y-5 max-w-2xl">
          
          {/* Main Chapter Title */}
          {step >= 1 && (
            <div className="font-mono text-3xl sm:text-5xl font-bold tracking-[0.35em] text-[#FCD34D] drop-shadow-[0_0_20px_rgba(252,211,77,0.4)] animate-cinematic-tracking">
              CHAPTER I
            </div>
          )}

          {/* Subtitle */}
          {step >= 2 && (
            <div className="font-mono text-xs sm:text-sm uppercase tracking-[0.25em] text-[#E2E8F0] font-semibold animate-cinematic-fade">
              THE BEGINNING OF THE END
            </div>
          )}

          {/* Ornamental Filigree Divider */}
          {step >= 3 && (
            <div className="flex items-center gap-3 py-1 animate-cinematic-fade">
              <span className="w-16 sm:w-24 h-px bg-gradient-to-r from-transparent via-[#D9AA52] to-transparent" />
              <span className="text-[#D9AA52] font-mono text-xs text-amber-400">◆</span>
              <span className="w-16 sm:w-24 h-px bg-gradient-to-r from-transparent via-[#D9AA52] to-transparent" />
            </div>
          )}

          {/* Floor Name */}
          {step >= 4 && (
            <div className="space-y-1.5 animate-cinematic-fade">
              <div className="font-mono text-base sm:text-2xl font-bold tracking-widest text-[#38BDF8] drop-shadow">
                {romanFloor} — {biomeTitle.toUpperCase()}
              </div>
            </div>
          )}

        </div>
      ) : (
        /* Floors II - X Short Title Card */
        <div className="relative z-10 flex flex-col items-center text-center space-y-3 max-w-xl">
          
          {step >= 1 && (
            <div className="font-mono text-2xl sm:text-4xl font-bold tracking-[0.25em] text-[#FCD34D] drop-shadow-[0_0_15px_rgba(252,211,77,0.3)] animate-cinematic-fade">
              {romanFloor} — {biomeTitle.toUpperCase()}
            </div>
          )}

          {step >= 1 && (
            <div className="flex items-center gap-3 py-0.5 animate-cinematic-fade">
              <span className="w-12 sm:w-20 h-px bg-gradient-to-r from-transparent via-[#D9AA52] to-transparent" />
              <span className="text-[#D9AA52] font-mono text-[10px]">◆</span>
              <span className="w-12 sm:w-20 h-px bg-gradient-to-r from-transparent via-[#D9AA52] to-transparent" />
            </div>
          )}

        </div>
      )}

      {/* Dismiss hint */}
      <div className="absolute bottom-6 font-mono text-[10px] text-[#A19FAF] tracking-widest uppercase opacity-60">
        Click or tap anywhere to skip
      </div>

    </div>
  );
};
