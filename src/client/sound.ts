/**
 * Web Audio API Sound Engine for "Beyond"
 * Synthesizes retro-modern arcade sound effects in real time:
 * - UI interactions (clicks, toggles, confirms, cancels, hovers)
 * - Attacks (melee sword cleave, ranger arrow loose, arcane bolt, cleric dawnstar smite, skills)
 * - Damage & Health feedback (player hurt thud, enemy hit crunch, critical strike ring, shield shatter, player downed, heal)
 * - Rewards (gold coins, relic acquisition fanfare)
 */

export type UiSoundType = 'default' | 'confirm' | 'cancel' | 'toggle' | 'hover';
export type AttackHeroStyle = 'vanguard' | 'ranger' | 'arcanist' | 'cleric' | string;

class RetroAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private masterVolume = 0.85;

  constructor() {
    try {
      const saved = localStorage.getItem('beyond_sfx_muted');
      if (saved === 'true') this.muted = true;
    } catch {
      // ignore
    }
  }

  /**
   * Initialize or resume the Web Audio Context lazily on user interaction.
   */
  public ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Unlock AudioContext from early user gesture.
   */
  public unlockAudio(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('beyond_sfx_muted', String(this.muted));
    } catch {
      // ignore
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.masterVolume,
        this.ctx.currentTime
      );
    }
    return this.muted;
  }

  public setVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.muted) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
  }

  private getDestination(): AudioNode | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    return this.masterGain || ctx.destination;
  }

  /**
   * Pre-generate a short white-noise buffer for percussion, swishes, and impacts.
   */
  private getNoiseBuffer(): AudioBuffer | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;
    if (this.noiseBuffer) return this.noiseBuffer;

    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * 0.35); // 350ms of noise
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  // ==========================================
  // UI SOUND EFFECTS
  // ==========================================

  /**
   * Tactile UI sound effect for buttons, tabs, toggles, modal open/close.
   */
  public playUiClick(tone: UiSoundType = 'default'): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    if (tone === 'hover') {
      // Soft micro-tick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.03);
      return;
    }

    if (tone === 'toggle') {
      // Crisp mechanical flip
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.setValueAtTime(950, now + 0.03);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.08);
      return;
    }

    if (tone === 'confirm') {
      // Uplifting two-tone chime
      [587.33, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + i * 0.065;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.07, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.15);
      });
      return;
    }

    if (tone === 'cancel') {
      // Descending cancel blip
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(460, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.1);
      return;
    }

    // Default button click: crisp tactile wooden blip
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);
    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playUiHover(): void {
    this.playUiClick('hover');
  }

  public playUiConfirm(): void {
    this.playUiClick('confirm');
  }

  public playUiCancel(): void {
    this.playUiClick('cancel');
  }

  // ==========================================
  // ATTACK SOUND EFFECTS
  // ==========================================

  /**
   * Sound effect when the player executes a basic attack swing or shot.
   * Distinct acoustic profile for each hero class:
   * - Vanguard: Heavy greatsword blade whoosh + mid-frequency air cleave
   * - Ranger: High-tension bowstring snap + zipping arrow flutter
   * - Arcanist: Shimmering starlight blast with ascending harmonic flare
   * - Cleric: Resonant holy hammer chime with warm punch
   */
  public playAttack(style: AttackHeroStyle = 'vanguard'): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    if (style === 'vanguard') {
      // 1. Greatsword slice noise swoosh
      if (noise) {
        const noiseSrc = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const noiseGain = ctx.createGain();
        noiseSrc.buffer = noise;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1400, now);
        filter.frequency.exponentialRampToValueAtTime(320, now + 0.12);
        filter.Q.setValueAtTime(2.2, now);
        noiseGain.gain.setValueAtTime(0.09, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        noiseSrc.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(dest);
        noiseSrc.start(now);
        noiseSrc.stop(now + 0.14);
      }

      // 2. Resonant blade weight tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.11);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (style === 'ranger') {
      // Bowstring twang + release zipping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(820, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.085);
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.1);

      // High arrow release flutter
      if (noise) {
        const noiseSrc = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const nGain = ctx.createGain();
        noiseSrc.buffer = noise;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(3800, now);
        nGain.gain.setValueAtTime(0.04, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        noiseSrc.connect(filter);
        filter.connect(nGain);
        nGain.connect(dest);
        noiseSrc.start(now);
        noiseSrc.stop(now + 0.07);
      }
    } else if (style === 'arcanist') {
      // Arcane shimmer burst (dual sine with slight harmonic detune)
      const freqs = [360, 720];
      freqs.forEach((baseFreq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const startT = now + idx * 0.02;
        osc.frequency.setValueAtTime(baseFreq, startT);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.2, startT + 0.1);
        gain.gain.setValueAtTime(0.055, startT);
        gain.gain.exponentialRampToValueAtTime(0.001, startT + 0.11);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(startT);
        osc.stop(startT + 0.12);
      });
    } else {
      // Cleric dawnstar smite: holy bell chime + solid strike
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(580, now);
      osc1.frequency.exponentialRampToValueAtTime(320, now + 0.12);
      gain1.gain.setValueAtTime(0.07, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc1.connect(gain1);
      gain1.connect(dest);
      osc1.start(now);
      osc1.stop(now + 0.14);

      // Overtone chime
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1160, now);
      gain2.gain.setValueAtTime(0.035, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc2.connect(gain2);
      gain2.connect(dest);
      osc2.start(now);
      osc2.stop(now + 0.19);
    }
  }

  /**
   * Sound effect for tactical or ultimate skills.
   */
  public playSkill(kind: 'tactical' | 'ult'): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    if (kind === 'tactical') {
      // Rushing energy surge
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.23);
    } else {
      // Ultimate: deep resonant power blast
      [130.81, 196.0, 261.63, 392.0].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.04;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.28);
        gain.gain.setValueAtTime(0.065, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t);
        osc.stop(t + 0.33);
      });
    }
  }

  // ==========================================
  // DAMAGE & HEALTH FEEDBACK
  // ==========================================

  /**
   * Player taking damage: deep visceral impact thump to provide instant tactile warning.
   */
  public playHurt(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    // 1. Low frequency thump
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(175, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.16);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.18);

    // 2. Punchy noise crunch
    if (noise) {
      const noiseSrc = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const nGain = ctx.createGain();
      noiseSrc.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(650, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.12);
      nGain.gain.setValueAtTime(0.1, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      noiseSrc.connect(filter);
      filter.connect(nGain);
      nGain.connect(dest);
      noiseSrc.start(now);
      noiseSrc.stop(now + 0.14);
    }
  }

  /**
   * Player shield depleted: glass/crystal resonance snap alerting the player.
   */
  public playShieldBreak(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1050, now);
    osc.frequency.exponentialRampToValueAtTime(280, now + 0.18);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /**
   * Player downed: ominous descending minor tone.
   */
  public playPlayerDowned(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [220, 185, 146.83, 110].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + i * 0.1;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.23);
    });
  }

  /**
   * Attack hits an enemy (hit confirmation).
   * isCrit adds a metallic high-pitch slash ring.
   */
  public playEnemyHit(isCrit = false): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    // Satisfying crunchy thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isCrit ? 480 : 340, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.08);
    gain.gain.setValueAtTime(isCrit ? 0.09 : 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.1);

    if (isCrit) {
      // Critical metallic resonance ping
      const ringOsc = ctx.createOscillator();
      const ringGain = ctx.createGain();
      ringOsc.type = 'square';
      ringOsc.frequency.setValueAtTime(1320, now);
      ringOsc.frequency.exponentialRampToValueAtTime(990, now + 0.14);
      ringGain.gain.setValueAtTime(0.045, now);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      ringOsc.connect(ringGain);
      ringGain.connect(dest);
      ringOsc.start(now);
      ringOsc.stop(now + 0.16);
    }
  }

  /**
   * Healing potion or restorative effect.
   */
  public playHeal(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.05;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.065, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  /**
   * Gold coin collection chime.
   */
  public playCoin(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, now);
    osc.frequency.setValueAtTime(1318.51, now + 0.05);
    gain.gain.setValueAtTime(0.045, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /**
   * Relic discovered / level descent celebratory fanfare.
   */
  public playRelicChime(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.07;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.075, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }
}

export const sfx = new RetroAudioEngine();

// Auto-unlock audio on the first user interaction anywhere in the window
if (typeof window !== 'undefined') {
  const handleFirstInteraction = () => {
    sfx.unlockAudio();
    window.removeEventListener('pointerdown', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
  };
  window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
  window.addEventListener('keydown', handleFirstInteraction, { passive: true });
}
