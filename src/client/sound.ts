/**
 * Web Audio API Sound Engine for "Beyond"
 * Synthesizes retro-modern arcade sound effects in real time:
 * - UI interactions (clicks, toggles, confirms, cancels, hovers)
 * - Attacks (melee sword cleave, ranger arrow loose, arcane bolt, cleric dawnstar smite, skills)
 * - Damage & Health feedback (player hurt thud, enemy hit crunch, critical strike ring, shield shatter, player downed, heal)
 * - Rewards (gold coins, relic acquisition fanfare)
 */

import { soundManager } from './soundManager.ts';

export type UiSoundType = 'default' | 'confirm' | 'cancel' | 'toggle' | 'hover';
export type AttackHeroStyle = 'vanguard' | 'ranger' | 'arcanist' | 'cleric' | string;

class RetroAudioEngine {
  private noiseBuffer: AudioBuffer | null = null;

  private ambientGain: GainNode | null = null;
  private ambientSource: AudioBufferSourceNode | null = null;
  private ambientFilter: BiquadFilterNode | null = null;
  private ambientActive = false;
  private ambientOscillators: OscillatorNode[] = [];
  private musicInterval: number | null = null;

  constructor() {
    // Synchronize initial mute state if legacy storage was present
    try {
      const saved = localStorage.getItem('beyond_sfx_muted');
      if (saved === 'true') {
        soundManager.setMasterMuted(true);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Initialize or resume the Web Audio Context lazily on user interaction.
   */
  public ensureContext(): AudioContext | null {
    if (soundManager.isMasterMuted() || soundManager.isSfxMuted()) return null;
    return soundManager.ensureContext();
  }

  /**
   * Unlock AudioContext from early user gesture.
   */
  public unlockAudio(): void {
    soundManager.unlockAudio();
  }

  public isMuted(): boolean {
    return soundManager.isMasterMuted() || soundManager.isSfxMuted();
  }

  public toggleMute(): boolean {
    return soundManager.toggleMasterMute();
  }

  public setVolume(vol: number): void {
    soundManager.setMasterVolume(vol);
    soundManager.setSfxVolume(vol);
  }

  private getDestination(): AudioNode | null {
    return soundManager.getSfxDestination() || soundManager.getMasterDestination();
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

  // ==========================================
  // BOSS ABILITY SFX — FLOORS 1 to 10
  // ==========================================

  public playBossAbility(boss: string, ability: string): void {
    const key = `${boss.toLowerCase()}_${ability.toLowerCase().replace(/['’]/g, '').replace(/\s+/g, '_')}`;

    switch (key) {
      // ——— FLOOR 1: Warden Malakor ———
      case 'malakor_iron_bulwark':
      case 'warden_malakor_iron_bulwark':
        this.playMalakorIronBulwark(); break;
      case 'malakor_triple_cleave':
      case 'warden_malakor_triple_cleave':
        this.playMalakorTripleCleave(); break;
      case 'malakor_bastion_ground_slam':
      case 'warden_malakor_bastion_ground_slam':
        this.playMalakorBastionGroundSlam(); break;
      case 'malakor_war_charge':
      case 'warden_malakor_war_charge':
        this.playMalakorWarCharge(); break;

      // ——— FLOOR 2: Archlich Vaelor ———
      case 'vaelor_glacial_frost_nova':
      case 'archlich_vaelor_glacial_frost_nova':
        this.playVaelorGlacialFrostNova(); break;
      case 'vaelor_soul_siphon_tether':
      case 'archlich_vaelor_soul_siphon_tether':
        this.playVaelorSoulSiphonTether(); break;
      case 'vaelor_seeking_soul_hail':
      case 'archlich_vaelor_seeking_soul_hail':
        this.playVaelorSeekingSoulHail(); break;
      case 'vaelor_necrotic_death_ring':
      case 'archlich_vaelor_necrotic_death_ring':
        this.playVaelorNecroticDeathRing(); break;

      // ——— FLOOR 3: Ignis, Cinder Sovereign ———
      case 'ignis_magma_eruptions':
        this.playIgnisMagmaEruptions(); break;
      case 'ignis_molten_fissure_wave':
        this.playIgnisMoltenFissureWave(); break;
      case 'ignis_cinder_ember_spiral':
        this.playIgnisCinderEmberSpiral(); break;
      case 'ignis_volcanic_core_detonation':
        this.playIgnisVolcanicCoreDetonation(); break;

      // ——— FLOOR 4: Void-Eater Malice ———
      case 'malice_gravitational_singularity':
      case 'void-eater_malice_gravitational_singularity':
        this.playMaliceGravitationalSingularity(); break;
      case 'malice_void_tendril_flurry':
      case 'void-eater_malice_void_tendril_flurry':
        this.playMaliceVoidTendrilFlurry(); break;
      case 'malice_void_step':
      case 'void-eater_malice_void_step':
        this.playMaliceVoidStep(); break;
      case 'malice_abyssal_nova_spread':
      case 'void-eater_malice_abyssal_nova_spread':
        this.playMaliceAbyssalNovaSpread(); break;

      // ——— FLOOR 5: Archon of Nothingness ———
      case 'archon_celestial_supernova_ring':
      case 'archon_of_nothingness_celestial_supernova_ring':
        this.playArchonCelestialSupernovaRing(); break;
      case 'archon_orbital_starlight_beams':
      case 'archon_of_nothingness_orbital_starlight_beams':
        this.playArchonOrbitalStarlightBeams(); break;
      case 'archon_cosmic_shard_volley':
      case 'archon_of_nothingness_cosmic_shard_volley':
        this.playArchonCosmicShardVolley(); break;
      case 'archon_astral_constellation_spiral':
      case 'archon_of_nothingness_astral_constellation_spiral':
        this.playArchonAstralConstellationSpiral(); break;

      // ——— FLOOR 6: Elyndor, Keeper of the Last Hymn ———
      case 'elyndor_resonant_crescendo':
        this.playElyndorResonantCrescendo(); break;
      case 'elyndor_lament_of_the_forgotten':
        this.playElyndorLamentOfTheForgotten(); break;
      case 'elyndor_divine_chorus_beams':
        this.playElyndorDivineChorusBeams(); break;
      case 'elyndor_chorus_of_remembrance':
        this.playElyndorChorusOfRemembrance(); break;

      // ——— FLOOR 7: Zadkiel, Keeper of the Ashen Reliquary ———
      case 'zadkiel_ashen_procession':
        this.playZadkielAshenProcession(); break;
      case 'zadkiel_chain_of_the_departed':
        this.playZadkielChainOfTheDeparted(); break;
      case 'zadkiel_reliquary_awakening':
        this.playZadkielReliquaryAwakening(); break;
      case 'zadkiel_judgment_of_the_departed':
        this.playZadkielJudgmentOfTheDeparted(); break;

      // ——— FLOOR 8: Sariel, Warden of the Veiled Scripture ———
      case 'sariel_scripture_of_binding':
        this.playSarielScriptureOfBinding(); break;
      case 'sariel_forbidden_verses':
        this.playSarielForbiddenVerses(); break;
      case 'sariel_seal_of_silence':
        this.playSarielSealOfSilence(); break;
      case 'sariel_heretical_volley':
        this.playSarielHereticalVolley(); break;

      // ——— FLOOR 9: Seraphel, Sentinel of the Final Seal ———
      case 'seraphel_heavens_piercing_line':
      case 'seraphel_heavens_piercing_line!':
        this.playSeraphelHeavensPiercingLine(); break;
      case 'seraphel_lancefall_sequence':
        this.playSeraphelLancefallSequence(); break;
      case 'seraphel_aerial_judgment':
        this.playSeraphelAerialJudgment(); break;
      case 'seraphel_sentinel_spearfall_cascade':
        this.playSeraphelSentinelSpearfallCascade(); break;

      // ——— FLOOR 10: Oriphiel, The Last Warden ———
      case 'oriphiel_wardens_edict':
      case 'oriphiel_wardens_edict!_find_safe_quadrant!':
        this.playOriphielWardensEdict(); break;
      case 'oriphiel_unbroken_judgment':
      case 'oriphiel_unbroken_judgment!_(aegis_parry)':
        this.playOriphielUnbrokenJudgment(); break;
      case 'oriphiel_the_final_verdict_combo':
        this.playOriphielTheFinalVerdictCombo(); break;
      case 'oriphiel_bastion_ground_shatter':
        this.playOriphielBastionGroundShatter(); break;

      default:
        console.warn(`[sfx] Unknown boss ability: ${boss} / ${ability}`);
    }
  }

  // ——— FLOOR 1: Warden Malakor (heavy knight / shield) ———

  private playMalakorIronBulwark(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.35);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.42);

    const clang = ctx.createOscillator();
    const clangGain = ctx.createGain();
    clang.type = 'square';
    clang.frequency.setValueAtTime(320, now);
    clang.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    clangGain.gain.setValueAtTime(0.07, now);
    clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    clang.connect(clangGain);
    clangGain.connect(dest);
    clang.start(now);
    clang.stop(now + 0.24);
  }

  private playMalakorTripleCleave(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.09;
      if (noise) {
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = noise;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800 - i * 200, t);
        filter.Q.value = 2.5;
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        src.connect(filter);
        filter.connect(g);
        g.connect(dest);
        src.start(t);
        src.stop(t + 0.15);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280 - i * 30, t);
      osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  private playMalakorBastionGroundSlam(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.exponentialRampToValueAtTime(22, now + 0.45);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.52);

    if (noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(700, now);
      filter.frequency.exponentialRampToValueAtTime(80, now + 0.55);
      g.gain.setValueAtTime(0.16, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.65);
    }
  }

  private playMalakorWarCharge(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    if (noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1400, now + 0.4);
      g.gain.setValueAtTime(0.05, now);
      g.gain.linearRampToValueAtTime(0.12, now + 0.25);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.6);
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.35);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.48);
  }

  // ——— FLOOR 2: Archlich Vaelor (frost / necrotic) ———

  private playVaelorGlacialFrostNova(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [180, 240, 320, 420].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.03;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.5);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  private playVaelorSoulSiphonTether(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, now);
    osc.frequency.linearRampToValueAtTime(40, now + 0.7);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.85);
  }

  private playVaelorSeekingSoulHail(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520 + i * 40, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.2);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.24);
    }
  }

  private playVaelorNecroticDeathRing(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 0.7);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  // ——— FLOOR 3: Ignis, Cinder Sovereign (fire / magma) ———

  private playIgnisMagmaEruptions(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    [0, 0.15, 0.3].forEach((delay) => {
      const t = now + delay;
      if (noise) {
        const src = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const g = ctx.createGain();
        src.buffer = noise;
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, t);
        filter.frequency.exponentialRampToValueAtTime(150, t + 0.35);
        g.gain.setValueAtTime(0.13, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        src.connect(filter);
        filter.connect(g);
        g.connect(dest);
        src.start(t);
        src.stop(t + 0.42);
      }
    });
  }

  private playIgnisMoltenFissureWave(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.55);
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  private playIgnisCinderEmberSpiral(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.045;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(380 + i * 45, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.15);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }

  private playIgnisVolcanicCoreDetonation(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
    gain.gain.setValueAtTime(0.17, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.7);

    if (noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.7);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.8);
    }
  }

  // ——— FLOOR 4: Void-Eater Malice (void / gravity) ———

  private playMaliceGravitationalSingularity(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(45, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 1.0);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 1.15);
  }

  private playMaliceVoidTendrilFlurry(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + i * 30, t);
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
      gain.gain.setValueAtTime(0.065, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  }

  private playMaliceVoidStep(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  private playMaliceAbyssalNovaSpread(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [0, 0.12, 0.24].forEach((delay, i) => {
      const t = now + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(80 - i * 15, t);
      osc.frequency.exponentialRampToValueAtTime(25, t + 0.4);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.48);
    });
  }

  // ——— FLOOR 5: Archon of Nothingness (astral / cosmic) ———

  private playArchonCelestialSupernovaRing(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [300, 450, 600, 800].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.04;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.55);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  private playArchonOrbitalStarlightBeams(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [0, 0.18, 0.36].forEach((delay) => {
      const t = now + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.linearRampToValueAtTime(280, t + 0.3);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.38);
    });
  }

  private playArchonCosmicShardVolley(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 7; i++) {
      const t = now + i * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580 + i * 50, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.16);
      gain.gain.setValueAtTime(0.055, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  private playArchonAstralConstellationSpiral(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 10; i++) {
      const t = now + i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400 + i * 60, t);
      osc.frequency.exponentialRampToValueAtTime(150 + i * 20, t + 0.25);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.32);
    }
  }

  // ——— FLOOR 6: Elyndor, Keeper of the Last Hymn ———

  private playElyndorResonantCrescendo(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [261.63, 329.63, 392.0, 523.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  }

  private playElyndorLamentOfTheForgotten(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.7);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.8);
  }

  private playElyndorDivineChorusBeams(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.05;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.linearRampToValueAtTime(freq * 1.2, t + 0.4);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.48);
    });
  }

  private playElyndorChorusOfRemembrance(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(330 + i * 55, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.3);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.38);
    }
  }

  // ——— FLOOR 7: Zadkiel, Keeper of the Ashen Reliquary ———

  private playZadkielAshenProcession(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    if (noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(100, now + 0.5);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.6);
    }
  }

  private playZadkielChainOfTheDeparted(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(450 - i * 40, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }

  private playZadkielReliquaryAwakening(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.6);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.68);
  }

  private playZadkielJudgmentOfTheDeparted(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.5);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  // ——— FLOOR 8: Sariel, Warden of the Veiled Scripture ———

  private playSarielScriptureOfBinding(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.4);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.48);
  }

  private playSarielForbiddenVerses(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 5; i++) {
      const t = now + i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300 + i * 60, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.15);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  private playSarielSealOfSilence(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.35);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  private playSarielHereticalVolley(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(400 + i * 35, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  // ——— FLOOR 9: Seraphel, Sentinel of the Final Seal ———

  private playSeraphelHeavensPiercingLine(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.5);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.58);
  }

  private playSeraphelLancefallSequence(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 5; i++) {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650 - i * 50, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.15);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  private playSeraphelAerialJudgment(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.25);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.55);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.62);
  }

  private playSeraphelSentinelSpearfallCascade(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    for (let i = 0; i < 8; i++) {
      const t = now + i * 0.04;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(700 - i * 30, t);
      osc.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      gain.gain.setValueAtTime(0.06, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  // ——— FLOOR 10: Oriphiel, The Last Warden ———

  private playOriphielWardensEdict(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [440, 554.37, 659.25].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(now);
      osc.stop(now + 0.65);
    });
  }

  private playOriphielUnbrokenJudgment(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.45);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  private playOriphielTheFinalVerdictCombo(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;

    [0, 0.15, 0.3].forEach((delay, i) => {
      const t = now + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140 + i * 60, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  private playOriphielBastionGroundShatter(): void {
    const ctx = this.ensureContext();
    const dest = this.getDestination();
    if (!ctx || !dest) return;
    const now = ctx.currentTime;
    const noise = this.getNoiseBuffer();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(18, now + 0.7);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.78);

    if (noise) {
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();
      src.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.75);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      src.connect(filter);
      filter.connect(g);
      g.connect(dest);
      src.start(now);
      src.stop(now + 0.85);
    }
  }

  /**
   * Start low-volume background tavern ambience: crackling fireplace hearth & soft tavern crowd murmurs.
   */
  public startTavernAmbience(forceUnmute = false): void {
    if (forceUnmute) {
      soundManager.setMasterMuted(false);
      soundManager.setMusicMuted(false);
    }
    if (soundManager.isMasterMuted() || soundManager.isMusicMuted()) return;

    const ctx = soundManager.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (this.ambientActive) return;
    this.ambientActive = true;
    const now = ctx.currentTime;

    // Main ambient loop gain with smooth fade in
    this.ambientGain = ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.001, now);
    this.ambientGain.gain.linearRampToValueAtTime(0.18, now + 0.6);
    const dest = this.getDestination();
    if (dest) this.ambientGain.connect(dest);

    // 1. Fireplace Hearth Crackle & Wood Pop Sparks (5-second procedural loop)
    const sampleRate = ctx.sampleRate;
    const bufferSize = sampleRate * 5;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      // Warm brown noise integration for deep hearth fire rumble
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.03 * white) / 1.03;

      // Crisp wood popping and crackling spark bursts
      let crackle = 0;
      const rand = Math.random();
      if (rand < 0.0018) {
        crackle = (Math.random() * 2 - 1) * 0.95;
      } else if (rand < 0.007) {
        crackle = (Math.random() * 2 - 1) * 0.45;
      }

      channelData[i] = lastOut * 0.45 + crackle;
    }

    this.ambientSource = ctx.createBufferSource();
    this.ambientSource.buffer = buffer;
    this.ambientSource.loop = true;

    // Cozy Lowpass Filter (580Hz cut-off for crisp, warm hearth crackle)
    this.ambientFilter = ctx.createBiquadFilter();
    this.ambientFilter.type = 'lowpass';
    this.ambientFilter.frequency.setValueAtTime(580, now);

    this.ambientSource.connect(this.ambientFilter);
    this.ambientFilter.connect(this.ambientGain);
    this.ambientSource.start(now);

    // 2. Low-volume Distant Tavern Crowd Murmur Chord
    const chord = [130.81, 164.81, 196.00, 246.94]; // C3, E3, G3, B3
    this.ambientOscillators = [];
    chord.forEach((freq, idx) => {
      if (!ctx || !this.ambientGain) return;
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      // Gentle LFO pitch wobble to emulate distant chatter
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(0.18 + idx * 0.12, now);
      lfoGain.gain.setValueAtTime(2.2, now);
      lfo.connect(osc.frequency);
      lfo.start(now);

      oscGain.gain.setValueAtTime(0.006, now);
      osc.connect(oscGain);
      oscGain.connect(this.ambientGain);
      osc.start(now);

      this.ambientOscillators.push(osc, lfo);
    });

    // 3. Jaunty Medieval Tavern Lute & Flute Folk Music Loop
    this.startTavernMusic();
  }

  /**
   * Synthesize soothing 8-bar fantasy tavern harp & lute music with acoustic hall filtering.
   */
  public startTavernMusic(): void {
    if (this.musicInterval !== null) return;

    // Rich Pentatonic Chord Progressions (Am7 -> Fmaj7 -> Cmaj7 -> G6)
    const acousticChords = [
      [220.0, 261.63, 329.63, 392.0],   // Am7 (A3, C4, E4, G4)
      [174.61, 220.0, 261.63, 329.63],  // Fmaj7 (F3, A3, C4, E4)
      [130.81, 164.81, 196.0, 246.94],  // Cmaj7 (C3, E3, G3, B3)
      [196.0, 246.94, 293.66, 349.23],  // G6 (G3, B3, D4, F4)
    ];

    // Soothing Lyrical Fantasy Melody (6 seconds per phrase)
    const melodyPhrases = [
      [
        { note: 440.0, dur: 0.6, delay: 0.0 },   // A4
        { note: 523.25, dur: 0.5, delay: 0.6 },  // C5
        { note: 659.25, dur: 0.9, delay: 1.1 },  // E5
        { note: 587.33, dur: 0.5, delay: 2.0 },  // D5
        { note: 523.25, dur: 0.8, delay: 2.5 },  // C5
        { note: 440.0, dur: 1.1, delay: 3.3 },   // A4
        { note: 392.0, dur: 0.6, delay: 4.4 },   // G4
        { note: 440.0, dur: 1.0, delay: 5.0 },   // A4
      ],
      [
        { note: 659.25, dur: 0.7, delay: 0.0 },  // E5
        { note: 698.46, dur: 0.5, delay: 0.7 },  // F5
        { note: 659.25, dur: 0.8, delay: 1.2 },  // E5
        { note: 587.33, dur: 0.6, delay: 2.0 },  // D5
        { note: 523.25, dur: 0.9, delay: 2.6 },  // C5
        { note: 493.88, dur: 0.6, delay: 3.5 },  // B4
        { note: 440.0, dur: 0.8, delay: 4.1 },   // A4
        { note: 523.25, dur: 1.0, delay: 4.9 },  // C5
      ],
    ];

    let phraseIdx = 0;
    const playTavernBar = () => {
      if (!this.ambientActive || soundManager.isMasterMuted() || soundManager.isMusicMuted()) return;
      const ctx = soundManager.ensureContext();
      if (!ctx || ctx.state === 'suspended') return;
      const now = ctx.currentTime;

      // Acoustic Reverb Bus Filter (Lowpass at 750Hz removes digital harshness)
      const busFilter = ctx.createBiquadFilter();
      busFilter.type = 'lowpass';
      busFilter.frequency.setValueAtTime(750, now);

      const busGain = ctx.createGain();
      busGain.gain.setValueAtTime(0.065, now);

      const dest = soundManager.getMusicDestination() || this.getDestination() || ctx.destination;
      busFilter.connect(busGain);
      busGain.connect(dest);

      // Plucked Acoustic Lute Arpeggio (Warm Triangle + Soft Attack)
      const chord = acousticChords[phraseIdx % acousticChords.length];
      const melody = melodyPhrases[phraseIdx % melodyPhrases.length];
      phraseIdx++;

      chord.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.28;
        osc.frequency.setValueAtTime(freq, t);

        // Soft acoustic string envelope
        noteGain.gain.setValueAtTime(0.001, t);
        noteGain.gain.linearRampToValueAtTime(0.35, t + 0.06);
        noteGain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

        osc.connect(noteGain);
        noteGain.connect(busFilter);
        osc.start(t);
        osc.stop(t + 1.85);
      });

      // Lyrical Flute / Whistle Melody
      melody.forEach((m) => {
        const osc = ctx.createOscillator();
        const noteGain = ctx.createGain();
        osc.type = 'sine';
        const t = now + m.delay;
        osc.frequency.setValueAtTime(m.note, t);

        // Gentle breath vibrato
        const vib = ctx.createOscillator();
        const vibGain = ctx.createGain();
        vib.frequency.setValueAtTime(4.8, t);
        vibGain.gain.setValueAtTime(3.5, t);
        vib.connect(osc.frequency);
        vib.start(t);
        vib.stop(t + m.dur);

        noteGain.gain.setValueAtTime(0.001, t);
        noteGain.gain.linearRampToValueAtTime(0.28, t + 0.08);
        noteGain.gain.exponentialRampToValueAtTime(0.001, t + m.dur + 0.1);

        osc.connect(noteGain);
        noteGain.connect(busFilter);
        osc.start(t);
        osc.stop(t + m.dur + 0.15);
      });
    };

    playTavernBar();
    this.musicInterval = window.setInterval(playTavernBar, 6000);
  }

  /**
   * Smoothly fade out and stop tavern ambience and music.
   */
  public stopTavernAmbience(): void {
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }

    if (!this.ambientActive) return;
    this.ambientActive = false;
    const ctx = soundManager.getAudioContext();
    if (this.ambientGain && ctx) {
      const now = ctx.currentTime;
      this.ambientGain.gain.setValueAtTime(this.ambientGain.gain.value, now);
      this.ambientGain.gain.linearRampToValueAtTime(0.001, now + 0.8);
      setTimeout(() => {
        if (this.ambientSource) {
          try {
            this.ambientSource.stop();
          } catch {
            // ignore
          }
          this.ambientSource = null;
        }
        for (const osc of this.ambientOscillators) {
          try {
            osc.stop();
          } catch {
            // ignore
          }
        }
        this.ambientOscillators = [];
        this.ambientGain = null;
      }, 850);
    }
  }
}

export const sfx = new RetroAudioEngine();
export { soundManager };

// Auto-unlock audio on the first user interaction anywhere in the window
if (typeof window !== 'undefined') {
  const handleFirstInteraction = () => {
    sfx.unlockAudio();
    soundManager.unlockAudio();
    window.removeEventListener('pointerdown', handleFirstInteraction);
    window.removeEventListener('touchstart', handleFirstInteraction);
    window.removeEventListener('keydown', handleFirstInteraction);
  };
  window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
  window.addEventListener('touchstart', handleFirstInteraction, { passive: true });
  window.addEventListener('keydown', handleFirstInteraction, { passive: true });
}
