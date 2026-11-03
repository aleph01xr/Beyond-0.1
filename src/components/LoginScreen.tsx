import React, { useEffect, useRef, useState } from 'react';
import { getApiEndpoint } from '../client/apiConfig.ts';
import { sfx } from '../client/sound.ts';
import { HERO_CLASSES, type HeroClassId, type UserProfile } from '../shared/types.ts';
import { PixelHeroPreview } from './PixelHeroPreview.tsx';

const LOGIN_BG_SRC = '/src/assets/images/beyond_login_courtyard_1793596400177.jpg';

interface LoginScreenProps {
  onAuthenticated: (token: string, user: UserProfile) => void;
}

type AuthMode = 'login' | 'register' | 'reset';

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('beyond_last_username') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [preferredClass, setPreferredClass] = useState<HeroClassId>('vanguard');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [bgLoaded, setBgLoaded] = useState(false);

  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Subtle floating pixel embers & lantern glow
  useEffect(() => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const motes = Array.from({ length: 18 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 12,
      vy: -8 - Math.random() * 16,
      size: Math.random() < 0.4 ? 3 : 2,
      phase: Math.random() * Math.PI * 2,
    }));

    let rafId = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);

      for (const m of motes) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < -10) {
          m.y = h + 10;
          m.x = Math.random() * w;
        }
        if (m.x < -10) m.x = w + 10;
        if (m.x > w + 10) m.x = -10;

        const alpha = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.003 + m.phase));
        ctx.fillStyle = `rgba(254, 215, 110, ${alpha.toFixed(3)})`;
        ctx.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const switchMode = (next: AuthMode) => {
    sfx.playUiClick();
    setMode(next);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    sfx.playUiClick();
    setErrorMsg(null);
    setInfoMsg(null);

    const trimmedUser = username.trim();
    if (trimmedUser.length < 2) {
      setErrorMsg('Enter a username (at least 2 characters).');
      return;
    }
    if (password.length < 3) {
      setErrorMsg('Enter a password (at least 3 characters).');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'reset') {
        const res = await fetch(getApiEndpoint('/api/auth/reset-password'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: trimmedUser, newPassword: password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Could not reset password.');
        } else {
          setInfoMsg(data.message || 'Password updated. Sign in below.');
          setMode('login');
        }
        return;
      }

      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(getApiEndpoint(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUser,
          password,
          preferredClass,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        sfx.playUiCancel();
        setErrorMsg(data.error || 'Authentication failed.');
        return;
      }

      sfx.playUiConfirm();
      try {
        localStorage.setItem('beyond_last_username', data.user.username);
      } catch {
        // ignore
      }
      onAuthenticated(data.token, data.user);
    } catch {
      sfx.playUiCancel();
      setErrorMsg('Unable to reach game server. Retrying shortly.');
    } finally {
      setLoading(false);
    }
  };

  const headerTitle =
    mode === 'login'
      ? 'Log In'
      : mode === 'register'
        ? 'Create Account'
        : 'Reset Password';

  return (
    <main className="relative min-h-screen w-screen overflow-x-hidden overflow-y-auto select-none bg-[#191924] flex items-center justify-center p-4">
      {/* Fallback gradient */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-gradient-to-b from-[#3E64A6] via-[#4C6E8E] to-[#323A36] pointer-events-none"
      />

      {/* Beyond Castle Courtyard Pixel Art Background */}
      <img
        src={LOGIN_BG_SRC}
        alt="Beyond pixel-art title screen courtyard"
        referrerPolicy="no-referrer"
        onLoad={() => setBgLoaded(true)}
        className={`fixed inset-0 w-full h-full object-cover pixelated pointer-events-none transition-opacity duration-300 ${
          bgLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Subtle floating particles */}
      <canvas
        ref={fxCanvasRef}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
      />

      {/* Central Chiseled Stone Login Modal matching reference screenshot */}
      <section
        aria-label={headerTitle}
        className="stone-panel relative z-10 w-full max-w-[440px] p-6 sm:p-7 pt-9 pb-5 my-auto"
      >
        {/* Subtle stone corner chisel details */}
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
        <div className="stone-plaque absolute -top-5 left-1/2 -translate-x-1/2 px-6 py-1.5 flex items-center justify-center min-w-[190px] sm:min-w-[220px]">
          <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-wide text-[#F5F5F7] drop-shadow-[0_2px_0_#2F2E3A] whitespace-nowrap">
            {headerTitle}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          {(errorMsg || infoMsg) && (
            <div
              role="status"
              className={`px-3 py-1.5 text-xs font-mono border ${
                errorMsg
                  ? 'bg-[#3D2429] border-[#9E424B] text-[#FECACA]'
                  : 'bg-[#22392F] border-[#4A8B6E] text-[#BBF7D0]'
              }`}
            >
              {errorMsg || infoMsg}
            </div>
          )}

          {/* Username Input with User Icon */}
          <label className="stone-input flex items-center gap-3 px-3.5 h-12 focus-within:outline-2 focus-within:outline-[#C9C7D4]">
            <span className="sr-only">Username</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[#B4B2BE]"
            >
              <rect x="6" y="2" width="4" height="4" fill="currentColor" />
              <rect x="5" y="3" width="6" height="2" fill="currentColor" />
              <rect x="4" y="8" width="8" height="2" fill="currentColor" />
              <rect x="3" y="10" width="10" height="4" fill="currentColor" />
            </svg>
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              maxLength={20}
              className="w-full bg-transparent font-display text-base sm:text-lg tracking-wide text-[#F3F2F7] placeholder:text-[#9694A1] focus:outline-none"
            />
          </label>

          {/* Password Input with Padlock & Eye Toggle */}
          <label className="stone-input flex items-center gap-3 px-3.5 h-12 focus-within:outline-2 focus-within:outline-[#C9C7D4]">
            <span className="sr-only">
              {mode === 'reset' ? 'New Password' : 'Password'}
            </span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="shrink-0 text-[#B4B2BE]"
            >
              <rect x="5" y="2" width="6" height="2" fill="currentColor" />
              <rect x="4" y="4" width="2" height="3" fill="currentColor" />
              <rect x="10" y="4" width="2" height="3" fill="currentColor" />
              <rect x="3" y="7" width="10" height="7" fill="currentColor" />
              <rect x="7" y="9" width="2" height="3" fill="#3B3942" />
            </svg>
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'reset' ? 'New Password' : 'Password'}
              className="w-full bg-transparent font-display text-base sm:text-lg tracking-wide text-[#F3F2F7] placeholder:text-[#9694A1] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                sfx.playUiClick();
                setShowPassword((prev) => !prev);
              }}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="shrink-0 p-1.5 text-[#AEACB8] hover:text-white cursor-pointer min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              {showPassword ? (
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                  <rect x="4" y="4" width="8" height="1" fill="currentColor" />
                  <rect x="2" y="5" width="2" height="2" fill="currentColor" />
                  <rect x="12" y="5" width="2" height="2" fill="currentColor" />
                  <rect x="1" y="7" width="1" height="2" fill="currentColor" />
                  <rect x="14" y="7" width="1" height="2" fill="currentColor" />
                  <rect x="2" y="9" width="2" height="2" fill="currentColor" />
                  <rect x="12" y="9" width="2" height="2" fill="currentColor" />
                  <rect x="4" y="11" width="8" height="1" fill="currentColor" />
                  <rect x="6" y="6" width="4" height="4" fill="currentColor" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                  <rect x="4" y="4" width="8" height="1" fill="currentColor" />
                  <rect x="2" y="5" width="2" height="2" fill="currentColor" />
                  <rect x="12" y="5" width="2" height="2" fill="currentColor" />
                  <rect x="1" y="7" width="1" height="2" fill="currentColor" />
                  <rect x="14" y="7" width="1" height="2" fill="currentColor" />
                  <rect x="2" y="9" width="2" height="2" fill="currentColor" />
                  <rect x="12" y="9" width="2" height="2" fill="currentColor" />
                  <rect x="4" y="11" width="8" height="1" fill="currentColor" />
                  <rect x="6" y="6" width="4" height="4" fill="currentColor" />
                  <path d="M2 13L13 2" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              )}
            </button>
          </label>

          {/* Soul Oath Class Selection in Register Mode (1 class locked per account) */}
          {mode === 'register' && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-display text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5">
                  <span>🔒</span> Soul Oath (Locked to Account)
                </span>
                <span className="text-[11px] text-[#FBBF24] font-mono">
                  Permanent Class Binding
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(HERO_CLASSES) as HeroClassId[]).map((cid) => {
                  const c = HERO_CLASSES[cid];
                  const active = preferredClass === cid;
                  return (
                    <button
                      key={cid}
                      type="button"
                      onClick={() => {
                        sfx.playUiClick();
                        setPreferredClass(cid);
                      }}
                      className={`p-2 text-left border-2 transition-all cursor-pointer flex items-center gap-2.5 ${
                        active
                          ? 'bg-[#2E2B38] border-[#F59E0B] text-white shadow-md'
                          : 'bg-[#201F29]/90 border-[#383648] text-[#B3B1BD] hover:border-[#5A5870]'
                      }`}
                    >
                      <PixelHeroPreview heroClass={cid} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-display text-xs sm:text-sm font-semibold text-white truncate">
                            {c.name}
                          </span>
                          <span className="text-[9px] font-mono uppercase tracking-wider text-[#FCD34D] px-1 py-0.5 bg-[#171622] border border-[#3E3C50]">
                            {c.roleBadge}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#9A98AA] font-mono truncate">
                          {c.weapon}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Class Highlight Card */}
              {(() => {
                const cur = HERO_CLASSES[preferredClass];
                return (
                  <div className="p-2.5 bg-[#1C1B26] border border-[#3A384C] text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-white font-medium">
                      <span>{cur.title}</span>
                      <span className="text-[#A7F3D0] font-mono">HP {cur.maxHp} · DMG {cur.damage}</span>
                    </div>
                    <p className="text-[#B9B7C7] text-[10.5px] leading-snug">
                      <span className="text-[#FDE047] font-semibold">{cur.passiveName}:</span> {cur.passiveDesc}
                    </p>
                  </div>
                );
              })()}

              <p className="text-[10.5px] text-[#A5A3B5] text-center font-mono">
                ⚠️ Each account is permanently bound to 1 class. To play another hero, create another adventurer account.
              </p>
            </div>
          )}

          {/* Raised Stone Primary Action Button */}
          <div className="pt-1 flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className="stone-button w-full sm:w-[75%] h-11 sm:h-12 flex items-center justify-center font-display text-lg sm:text-xl font-medium tracking-wide text-[#F7F7FA] drop-shadow-[0_2px_0_#46454E] cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {loading
                ? 'Connecting...'
                : mode === 'login'
                  ? 'Log In'
                  : mode === 'register'
                    ? 'Create Account'
                    : 'Save Password'}
            </button>
          </div>
        </form>

        {/* Bottom Mode Switch Links */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2 font-display text-xs sm:text-sm text-[#D4D2DC]">
          {mode === 'login' ? (
            <>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="hover:text-white transition-colors cursor-pointer whitespace-nowrap min-h-[36px] flex items-center"
              >
                &gt; Create Account
              </button>
              <span aria-hidden="true" className="text-[#ABA9B5]">
                |
              </span>
              <button
                type="button"
                onClick={() => switchMode('reset')}
                className="hover:text-white transition-colors cursor-pointer whitespace-nowrap min-h-[36px] flex items-center"
              >
                Forgot Password?
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="hover:text-white transition-colors cursor-pointer whitespace-nowrap min-h-[36px] flex items-center"
            >
              &gt; Back to Log In
            </button>
          )}
        </div>
      </section>
    </main>
  );
};
