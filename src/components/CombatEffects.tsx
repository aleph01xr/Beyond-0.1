import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface CombatHitEvent {
  id: string;
  x: number;
  y: number;
  heroClass: string;
  isCrit: boolean;
  bornAt: number;
}

const slashSheets: Record<string, HTMLImageElement> = {};

function preloadSlashSheets() {
  if (typeof window === 'undefined') return;
  const files = [
    'slash_combo1.png',
    'slash_combo2.png',
    'slash_combo3.png',
    'slash_simple1.png',
    'slash_simple2.png',
    'slash_simple3.png',
    'slash_small1.png',
    'slash_small2.png',
    'slash_small3.png',
  ];
  for (const f of files) {
    if (!slashSheets[f]) {
      const img = new Image();
      img.src = `/assets/slash_fx/${f}`;
      slashSheets[f] = img;
    }
  }
}

export const CombatEffects: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitsRef = useRef<CombatHitEvent[]>([]);

  const addHit = useCallback((event: CustomEvent<{ x: number; y: number; heroClass?: string; isCrit?: boolean }>) => {
    const { x, y, heroClass = 'vanguard', isCrit = false } = event.detail;
    const newHit: CombatHitEvent = {
      id: `hit_${Math.random().toString(36).substring(2, 9)}`,
      x,
      y,
      heroClass,
      isCrit,
      bornAt: performance.now(),
    };
    hitsRef.current.push(newHit);
    if (hitsRef.current.length > 25) {
      hitsRef.current.shift();
    }
  }, []);

  useEffect(() => {
    preloadSlashSheets();
    const handleHit = (e: Event) => addHit(e as CustomEvent<any>);
    window.addEventListener('beyond-combat-hit', handleHit);
    return () => {
      window.removeEventListener('beyond-combat-hit', handleHit);
    };
  }, [addHit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeHits = hitsRef.current;
      for (let i = activeHits.length - 1; i >= 0; i--) {
        const hit = activeHits[i];
        const age = now - hit.bornAt;
        const duration = hit.isCrit ? 550 : 380;

        if (age >= duration) {
          activeHits.splice(i, 1);
          continue;
        }

        const progress = age / duration;
        const sheetName = hit.isCrit
          ? 'slash_combo1.png'
          : hit.heroClass === 'vanguard'
            ? 'slash_simple1.png'
            : 'slash_simple2.png';

        const img = slashSheets[sheetName];
        if (img && img.complete && img.naturalWidth > 0) {
          const totalFrames = hit.isCrit ? 7 : 3;
          const frameIdx = Math.min(totalFrames - 1, Math.floor(progress * totalFrames));
          const size = hit.isCrit ? 96 : 72;

          ctx.save();
          ctx.translate(hit.x, hit.y);
          ctx.globalAlpha = Math.max(0, 1 - progress * 0.85);
          ctx.drawImage(
            img,
            frameIdx * 128,
            0,
            128,
            128,
            -size / 2,
            -size / 2,
            size,
            size
          );
          ctx.restore();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-20 w-full h-full"
      width={window.innerWidth}
      height={window.innerHeight}
    />
  );
};
