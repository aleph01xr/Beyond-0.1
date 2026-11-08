/**
 * BEYOND — AAA Advanced Boss Ability SFX System (Floors 1–10)
 *
 * Multi-Layered Procedural Web Audio Synthesis:
 * - FM Synthesis (Frequency Modulation with dynamic index decay)
 * - Sub-bass Punch & Non-linear Saturation (Speaker-shaking impact modeling)
 * - Physical Comb Filtering & Inharmonic Partials (Metal, Ice, Fire, Void & Bell acoustics)
 * - Multi-stage Noise Transients & Dynamic Stereo Spatials
 */

type BossId =
  | 'malakor'
  | 'vaelor'
  | 'ignis'
  | 'malice'
  | 'archon'
  | 'elyndor'
  | 'zadkiel'
  | 'sariel'
  | 'seraphel'
  | 'oriphiel';

const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Brown/Pink noise generator for organic textures, explosions, and wind */
function noise(ctx: AudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 1.5));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = clamp(brown * 3.2, -1, 1);
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** Non-linear wave shaper saturation for punch, grit, and warm analog drive */
function saturation(ctx: AudioContext, amount = 1.8): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  shaper.curve = curve;
  shaper.oversample = '4x';
  return shaper;
}

/** Robust exponential gain envelope helper */
function gainEnvelope(
  g: GainNode,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number
): void {
  const a = Math.max(0.002, attack);
  const h = Math.max(a + 0.002, hold);
  const end = h + Math.max(0.008, release);
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  if (h > a + 0.003) g.gain.setValueAtTime(Math.max(0.0002, peak), t + h);
  g.gain.exponentialRampToValueAtTime(0.0001, t + end);
}

/** FM Synthesis Engine — Modulator modulates Carrier for organic/metallic/elemental timbres */
function fmVoice(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  opts: {
    carrierFreq: number;
    carrierTo?: number;
    modFreq: number;
    modIndex: number;
    duration: number;
    peak: number;
    carrierType?: OscillatorType;
    modType?: OscillatorType;
    attack?: number;
    release?: number;
    pan?: number;
    drive?: number;
  }
): void {
  const carrier = ctx.createOscillator();
  const modulator = ctx.createOscillator();
  const modGain = ctx.createGain();
  const mainGain = ctx.createGain();
  const panner = ctx.createStereoPanner();

  carrier.type = opts.carrierType ?? 'sine';
  modulator.type = opts.modType ?? 'sine';

  // Carrier Pitch Sweep
  carrier.frequency.setValueAtTime(Math.max(1, opts.carrierFreq), t);
  if (opts.carrierTo) {
    carrier.frequency.exponentialRampToValueAtTime(
      Math.max(1, opts.carrierTo),
      t + Math.max(0.008, opts.duration)
    );
  }

  // Modulator Frequency & Envelope
  modulator.frequency.setValueAtTime(Math.max(1, opts.modFreq), t);
  const modDepth = opts.modFreq * opts.modIndex;
  modGain.gain.setValueAtTime(modDepth, t);
  modGain.gain.exponentialRampToValueAtTime(0.01, t + Math.max(0.01, opts.duration * 0.8));

  // Connections: Modulator -> Carrier Frequency
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  // Amp & Panner
  panner.pan.setValueAtTime(clamp(opts.pan ?? 0, -1, 1), t);
  gainEnvelope(
    mainGain,
    t,
    opts.peak,
    opts.attack ?? 0.003,
    opts.duration * 0.6,
    opts.release ?? opts.duration * 0.4
  );

  carrier.connect(mainGain);

  if (opts.drive) {
    const shaper = saturation(ctx, opts.drive);
    mainGain.connect(shaper);
    shaper.connect(panner);
  } else {
    mainGain.connect(panner);
  }

  panner.connect(dest);

  const stopAt = t + opts.duration + 0.1;
  carrier.start(t);
  modulator.start(t);
  carrier.stop(stopAt);
  modulator.stop(stopAt);
}

/** Filtered Noise Texture (For wind, fire, ash, debris, shimmers) */
function noiseTexture(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  opts: {
    duration: number;
    peak: number;
    filter: BiquadFilterType;
    from: number;
    to: number;
    q?: number;
    attack?: number;
    release?: number;
    pan?: number;
    drive?: number;
  }
): void {
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  const panner = ctx.createStereoPanner();

  src.buffer = noise(ctx);
  filter.type = opts.filter;
  filter.Q.setValueAtTime(opts.q ?? 1.0, t);
  filter.frequency.setValueAtTime(Math.max(20, opts.from), t);
  filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + opts.duration);

  panner.pan.setValueAtTime(clamp(opts.pan ?? 0, -1, 1), t);
  gainEnvelope(
    amp,
    t,
    opts.peak,
    opts.attack ?? 0.003,
    opts.duration * 0.65,
    opts.release ?? opts.duration * 0.35
  );

  src.connect(filter);
  filter.connect(amp);

  if (opts.drive) {
    const shaper = saturation(ctx, opts.drive);
    amp.connect(shaper);
    shaper.connect(panner);
  } else {
    amp.connect(panner);
  }

  panner.connect(dest);

  src.start(t);
  src.stop(t + opts.duration + 0.1);
}

/** Layer 1: Sub-bass Punch — Physical speaker-shaking impact modeling */
function subImpact(ctx: AudioContext, dest: AudioNode, t: number, weight = 1): void {
  // Rapid pitch drop 150Hz -> 30Hz for physical thud
  fmVoice(ctx, dest, t, {
    carrierFreq: 155 * weight,
    carrierTo: 28,
    modFreq: 45,
    modIndex: 1.5,
    duration: 0.22,
    peak: 0.22 * weight,
    carrierType: 'sine',
    attack: 0.002,
    release: 0.28,
    drive: 2.2,
  });

  // Transient impact crackle
  noiseTexture(ctx, dest, t, {
    duration: 0.08,
    peak: 0.12 * weight,
    filter: 'lowpass',
    from: 2200,
    to: 80,
    q: 0.8,
    attack: 0.001,
    release: 0.08,
    drive: 2.5,
  });

  // High snap for small speakers
  noiseTexture(ctx, dest, t + 0.002, {
    duration: 0.03,
    peak: 0.05 * weight,
    filter: 'highpass',
    from: 6800,
    to: 1800,
    q: 0.7,
    attack: 0.001,
    release: 0.035,
  });
}

/** Metallic Anvil / Blade Clang (Inharmonic Partials + FM Ring) */
function metalImpact(ctx: AudioContext, dest: AudioNode, t: number, weight = 1, pan = 0): void {
  // Heavy strike transient
  fmVoice(ctx, dest, t, {
    carrierFreq: 820 * weight,
    carrierTo: 410,
    modFreq: 1150,
    modIndex: 3.2,
    duration: 0.14,
    peak: 0.08 * weight,
    carrierType: 'triangle',
    modType: 'sawtooth',
    attack: 0.001,
    release: 0.22,
    pan,
    drive: 1.8,
  });

  // Inharmonic resonant ring partials (Metal Body)
  [1240, 1890, 2750].forEach((freq, i) => {
    fmVoice(ctx, dest, t + 0.003 * i, {
      carrierFreq: freq * weight,
      carrierTo: freq * 0.98,
      modFreq: freq * 1.414,
      modIndex: 0.8,
      duration: 0.18 + i * 0.05,
      peak: (0.03 / (i + 1)) * weight,
      carrierType: 'sine',
      attack: 0.002,
      release: 0.35,
      pan: pan + (i - 1) * 0.1,
    });
  });

  // High blade edge snap
  noiseTexture(ctx, dest, t, {
    duration: 0.05,
    peak: 0.06 * weight,
    filter: 'highpass',
    from: 7800,
    to: 2400,
    q: 1.2,
    pan,
  });
}

/** Ice / Crystal Shatter (High Inharmonic FM Glass Partials) */
function crystalShatter(ctx: AudioContext, dest: AudioNode, t: number, root = 880, weight = 1, pan = 0): void {
  // High glass strike
  fmVoice(ctx, dest, t, {
    carrierFreq: root * 2.8,
    carrierTo: root * 2.7,
    modFreq: root * 4.14,
    modIndex: 2.1,
    duration: 0.18,
    peak: 0.045 * weight,
    carrierType: 'sine',
    attack: 0.001,
    release: 0.35,
    pan,
  });

  // Frost sparkle noise
  noiseTexture(ctx, dest, t + 0.005, {
    duration: 0.25,
    peak: 0.035 * weight,
    filter: 'highpass',
    from: 9500,
    to: 3200,
    q: 0.9,
    pan,
  });
}

/** Fire Explosion & Molten Roar */
function fireBurst(ctx: AudioContext, dest: AudioNode, t: number, weight = 1, pan = 0): void {
  // Low volcanic rumble
  fmVoice(ctx, dest, t, {
    carrierFreq: 140 * weight,
    carrierTo: 32,
    modFreq: 85,
    modIndex: 2.8,
    duration: 0.45,
    peak: 0.14 * weight,
    carrierType: 'sawtooth',
    attack: 0.005,
    release: 0.35,
    drive: 2.8,
    pan,
  });

  // Flame roaring noise sweep
  noiseTexture(ctx, dest, t + 0.01, {
    duration: 0.5,
    peak: 0.11 * weight,
    filter: 'lowpass',
    from: 3400,
    to: 120,
    q: 1.1,
    attack: 0.01,
    release: 0.35,
    drive: 2.0,
    pan,
  });
}

/** Void Gravitational Vortex & Spatial Implosion */
function voidVortex(ctx: AudioContext, dest: AudioNode, t: number, duration = 0.6, pan = 0): void {
  // Sweeping sub implosion
  fmVoice(ctx, dest, t, {
    carrierFreq: 220,
    carrierTo: 22,
    modFreq: 90,
    modIndex: 3.5,
    duration,
    peak: 0.13,
    carrierType: 'sine',
    attack: 0.05,
    release: 0.25,
    drive: 2.2,
    pan,
  });

  // Phase-shifted void swirl
  noiseTexture(ctx, dest, t, {
    duration,
    peak: 0.08,
    filter: 'bandpass',
    from: 3800,
    to: 150,
    q: 4.5,
    attack: 0.04,
    release: 0.2,
    pan,
  });
}

/** Cathedral Bell / Sacred Hymn Chime (Physical Modeling of Bell Resonance) */
function cathedralBell(ctx: AudioContext, dest: AudioNode, t: number, rootFreq: number, weight = 1, pan = 0): void {
  // 5 Inharmonic Bell Partials (Hum tone, Prime, Tierce, Quint, Nominal)
  const partialRatios = [0.5, 1.0, 1.2, 1.5, 2.0];
  const decays = [1.2, 0.9, 0.7, 0.5, 0.4];

  // Clapper strike transient
  metalImpact(ctx, dest, t, 0.6 * weight, pan);

  partialRatios.forEach((ratio, i) => {
    fmVoice(ctx, dest, t + 0.002 * i, {
      carrierFreq: rootFreq * ratio,
      carrierTo: rootFreq * ratio * 0.995,
      modFreq: rootFreq * ratio * 1.414,
      modIndex: 0.6 / (i + 1),
      duration: decays[i] * 0.8,
      peak: (0.045 / (1 + i * 0.4)) * weight,
      carrierType: 'sine',
      attack: 0.002,
      release: decays[i],
      pan: pan + (i - 2) * 0.08,
    });
  });
}

/** Metallic Chain Rattle (Comb-filtered noise + FM clicks) */
function chainRattle(ctx: AudioContext, dest: AudioNode, t: number, count = 4, pan = 0): void {
  for (let i = 0; i < count; i++) {
    const at = t + i * 0.045;
    metalImpact(ctx, dest, at, 0.45, pan + (i % 2 ? 0.15 : -0.15));
    noiseTexture(ctx, dest, at, {
      duration: 0.06,
      peak: 0.035,
      filter: 'bandpass',
      from: 4500,
      to: 1200,
      q: 3.5,
      pan,
    });
  }
}

/** Pulse train utility helper */
function pulseTrain(
  t: number,
  count: number,
  interval: number,
  fn: (at: number, i: number) => void
): void {
  for (let i = 0; i < count; i++) fn(t + i * interval, i);
}

// ——— FLOOR 1: Warden Malakor (Iron & Heavy Armor) ———
function malakor(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'iron_bulwark':
      metalImpact(ctx, d, t, 1.4, -0.1);
      subImpact(ctx, d, t + 0.03, 1.2);
      fmVoice(ctx, d, t + 0.05, {
        carrierFreq: 180,
        carrierTo: 110,
        modFreq: 60,
        modIndex: 1.8,
        duration: 0.35,
        peak: 0.1,
        carrierType: 'triangle',
        drive: 1.8,
      });
      return true;
    case 'triple_cleave':
      pulseTrain(t, 3, 0.16, (at, i) => {
        noiseTexture(ctx, d, at, {
          duration: 0.12,
          peak: 0.09,
          filter: 'bandpass',
          from: 4800,
          to: 850,
          q: 2.2,
          pan: (i - 1) * 0.3,
        });
        metalImpact(ctx, d, at + 0.02, 0.8 + i * 0.25, (i - 1) * 0.25);
        if (i === 2) subImpact(ctx, d, at + 0.03, 1.3);
      });
      return true;
    case 'bastion_ground_slam':
      subImpact(ctx, d, t + 0.15, 1.6);
      metalImpact(ctx, d, t + 0.16, 1.1);
      fireBurst(ctx, d, t + 0.16, 0.8);
      return true;
    case 'war_charge':
      pulseTrain(t, 4, 0.09, (at, i) => {
        metalImpact(ctx, d, at, 0.5 + i * 0.15, (i % 2 ? 0.2 : -0.2));
      });
      subImpact(ctx, d, t + 0.42, 1.5);
      return true;
  }
  return false;
}

// ——— FLOOR 2: Archlich Vaelor (Frost & Necromancy) ———
function vaelor(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'glacial_frost_nova':
      subImpact(ctx, d, t, 1.2);
      pulseTrain(t + 0.04, 5, 0.03, (at, i) => {
        crystalShatter(ctx, d, at, 780 + i * 220, 0.9, (i - 2) * 0.25);
      });
      noiseTexture(ctx, d, t + 0.08, {
        duration: 0.55,
        peak: 0.08,
        filter: 'highpass',
        from: 8800,
        to: 1800,
        q: 0.8,
      });
      return true;
    case 'soul_siphon_tether':
      voidVortex(ctx, d, t, 0.7);
      pulseTrain(t + 0.05, 4, 0.15, (at, i) => {
        crystalShatter(ctx, d, at, 1050 - i * 120, 0.5, (i % 2 ? 0.3 : -0.3));
      });
      return true;
    case 'seeking_soul_hail':
      pulseTrain(t, 6, 0.08, (at, i) => {
        const pan = (i - 2.5) * 0.25;
        crystalShatter(ctx, d, at, 920 + i * 140, 0.7, pan);
        noiseTexture(ctx, d, at, {
          duration: 0.1,
          peak: 0.04,
          filter: 'bandpass',
          from: 5500,
          to: 1400,
          q: 3.0,
          pan,
        });
      });
      return true;
    case 'necrotic_death_ring':
      subImpact(ctx, d, t, 1.4);
      fmVoice(ctx, d, t + 0.04, {
        carrierFreq: 120,
        carrierTo: 35,
        modFreq: 88,
        modIndex: 4.0,
        duration: 0.6,
        peak: 0.12,
        carrierType: 'sawtooth',
        drive: 2.2,
      });
      return true;
  }
  return false;
}

// ——— FLOOR 3: Ignis, Cinder Sovereign (Volcanic Fire & Lava) ———
function ignis(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'magma_eruptions':
      pulseTrain(t, 3, 0.18, (at, i) => {
        subImpact(ctx, d, at, 1.1 + i * 0.2);
        fireBurst(ctx, d, at, 1.0 + i * 0.2, (i - 1) * 0.3);
      });
      return true;
    case 'molten_fissure_wave':
      fireBurst(ctx, d, t, 1.5);
      subImpact(ctx, d, t + 0.05, 1.3);
      return true;
    case 'cinder_ember_spiral':
      pulseTrain(t, 8, 0.045, (at, i) => {
        const pan = Math.sin(i * 0.8) * 0.6;
        fmVoice(ctx, d, at, {
          carrierFreq: 450 + i * 90,
          modFreq: 620,
          modIndex: 1.5,
          duration: 0.08,
          peak: 0.04,
          pan,
        });
        noiseTexture(ctx, d, at, {
          duration: 0.06,
          peak: 0.03,
          filter: 'highpass',
          from: 6500,
          to: 2200,
          q: 1.0,
          pan,
        });
      });
      fireBurst(ctx, d, t + 0.3, 1.2);
      return true;
    case 'volcanic_core_detonation':
      // Pre-detonation pressure vacuum
      voidVortex(ctx, d, t, 0.25);
      // Colossal Volcanic Explosion
      subImpact(ctx, d, t + 0.22, 1.8);
      fireBurst(ctx, d, t + 0.22, 1.8);
      return true;
  }
  return false;
}

// ——— FLOOR 4: Void-Eater Malice (Abyssal Void & Gravitational Collapse) ———
function malice(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'gravitational_singularity':
      voidVortex(ctx, d, t, 0.85);
      subImpact(ctx, d, t + 0.6, 1.5);
      return true;
    case 'void_tendril_flurry':
      pulseTrain(t, 6, 0.065, (at, i) => {
        const pan = (i - 2.5) * 0.28;
        fmVoice(ctx, d, at, {
          carrierFreq: i % 2 ? 580 : 180,
          carrierTo: i % 2 ? 90 : 650,
          modFreq: 320,
          modIndex: 4.5,
          duration: 0.12,
          peak: 0.07,
          drive: 2.4,
          pan,
        });
      });
      return true;
    case 'void_step':
      voidVortex(ctx, d, t, 0.18);
      subImpact(ctx, d, t + 0.16, 1.2);
      return true;
    case 'abyssal_nova_spread':
      subImpact(ctx, d, t, 1.6);
      voidVortex(ctx, d, t + 0.05, 0.7);
      return true;
  }
  return false;
}

// ——— FLOOR 5: Archon of Nothingness (Cosmic Energy & Stellar Power) ———
function archon(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'celestial_supernova_ring':
      pulseTrain(t, 5, 0.03, (at, i) => {
        fmVoice(ctx, d, at, {
          carrierFreq: 523 + i * 150,
          modFreq: 784,
          modIndex: 1.2,
          duration: 0.2,
          peak: 0.04,
          pan: (i - 2) * 0.2,
        });
      });
      subImpact(ctx, d, t + 0.14, 1.5);
      noiseTexture(ctx, d, t + 0.15, {
        duration: 0.5,
        peak: 0.08,
        filter: 'highpass',
        from: 9200,
        to: 2200,
        q: 0.7,
      });
      return true;
    case 'orbital_starlight_beams':
      pulseTrain(t, 4, 0.12, (at, i) => {
        const pan = (i - 1.5) * 0.4;
        fmVoice(ctx, d, at, {
          carrierFreq: 1420 - i * 180,
          carrierTo: 220,
          modFreq: 880,
          modIndex: 3.0,
          duration: 0.18,
          peak: 0.08,
          drive: 1.8,
          pan,
        });
      });
      return true;
    case 'cosmic_shard_volley':
      pulseTrain(t, 6, 0.075, (at, i) => {
        crystalShatter(ctx, d, at, 1050 + i * 120, 0.8, (i - 2.5) * 0.25);
      });
      return true;
    case 'astral_constellation_spiral':
      pulseTrain(t, 8, 0.06, (at, i) => {
        cathedralBell(ctx, d, at, 440 + i * 55, 0.5, Math.sin(i) * 0.5);
      });
      subImpact(ctx, d, t + 0.5, 1.3);
      return true;
  }
  return false;
}

// ——— FLOOR 6: Elyndor, Keeper of the Last Hymn (Ethereal Hymns & Chimes) ———
function elyndor(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'hymn_of_reflection':
    case 'resonant_crescendo':
    case 'elyndor_hymn_of_reflection':
    case 'elyndor_resonant_crescendo':
      cathedralBell(ctx, d, t, 523.25, 1.3, -0.2); // C5
      cathedralBell(ctx, d, t + 0.12, 659.25, 1.1, 0.2); // E5
      cathedralBell(ctx, d, t + 0.24, 783.99, 1.2, 0.0); // G5
      subImpact(ctx, d, t + 0.25, 1.1);
      return true;
    case 'radiant_harmonics':
    case 'lament_of_the_forgotten':
    case 'elyndor_radiant_harmonics':
    case 'elyndor_lament_of_the_forgotten':
      pulseTrain(t, 4, 0.14, (at, i) => {
        cathedralBell(ctx, d, at, 440 + i * 110, 0.8, (i - 1.5) * 0.3);
      });
      return true;
    case 'sanctified_chords':
    case 'divine_chorus_beams':
    case 'elyndor_sanctified_chords':
    case 'elyndor_divine_chorus_beams':
      subImpact(ctx, d, t, 1.2);
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        cathedralBell(ctx, d, t + i * 0.03, f, 0.9, (i - 1.5) * 0.2);
      });
      return true;
    case 'chorus_of_remembrance':
    case 'elyndor_chorus_of_remembrance':
      pulseTrain(t, 8, 0.05, (at, i) => {
        cathedralBell(ctx, d, at, 330 + i * 55, 0.6, (i - 3.5) * 0.2);
      });
      subImpact(ctx, d, t + 0.42, 1.4);
      return true;
  }
  return false;
}

// ——— FLOOR 7: Zadkiel, Keeper of the Ashen Reliquary (Ashen Flames & Chains) ———
function zadkiel(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'ashen_procession':
    case 'zadkiel_ashen_procession':
      chainRattle(ctx, d, t, 5, -0.2);
      fireBurst(ctx, d, t + 0.1, 1.1);
      return true;
    case 'chain_of_the_departed':
    case 'zadkiel_chain_of_the_departed':
      chainRattle(ctx, d, t, 6, 0.1);
      metalImpact(ctx, d, t + 0.22, 1.2);
      return true;
    case 'reliquary_awakening':
    case 'zadkiel_reliquary_awakening':
      metalImpact(ctx, d, t, 1.3);
      subImpact(ctx, d, t + 0.04, 1.3);
      fireBurst(ctx, d, t + 0.05, 1.3);
      return true;
    case 'judgment_of_the_departed':
    case 'zadkiel_judgment_of_the_departed':
      subImpact(ctx, d, t, 1.6);
      metalImpact(ctx, d, t + 0.02, 1.4);
      fireBurst(ctx, d, t + 0.05, 1.2);
      return true;
  }
  return false;
}

// ——— FLOOR 8: Sariel, Warden of the Veiled Scripture (Veiled Scriptures & Runes) ———
function sariel(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'scripture_of_binding':
    case 'sariel_scripture_of_binding':
      noiseTexture(ctx, d, t, {
        duration: 0.35,
        peak: 0.09,
        filter: 'bandpass',
        from: 3500,
        to: 450,
        q: 4.0,
      });
      subImpact(ctx, d, t + 0.2, 1.1);
      return true;
    case 'forbidden_verses':
    case 'sariel_forbidden_verses':
      pulseTrain(t, 5, 0.07, (at, i) => {
        fmVoice(ctx, d, at, {
          carrierFreq: 680 - i * 80,
          modFreq: 420,
          modIndex: 3.2,
          duration: 0.12,
          peak: 0.07,
          drive: 2.0,
          pan: (i - 2) * 0.25,
        });
      });
      return true;
    case 'seal_of_silence':
    case 'sariel_seal_of_silence':
      voidVortex(ctx, d, t, 0.2);
      subImpact(ctx, d, t + 0.18, 1.3);
      crystalShatter(ctx, d, t + 0.18, 1200, 1.0);
      return true;
    case 'heretical_volley':
    case 'sariel_heretical_volley':
      pulseTrain(t, 6, 0.055, (at, i) => {
        fmVoice(ctx, d, at, {
          carrierFreq: 850 + i * 110,
          carrierTo: 180,
          modFreq: 520,
          modIndex: 4.0,
          duration: 0.14,
          peak: 0.08,
          drive: 2.2,
          pan: (i - 2.5) * 0.28,
        });
      });
      return true;
  }
  return false;
}

// ——— FLOOR 9: Seraphel, Sentinel of the Final Seal (Seraphic Wings & Sword) ———
function seraphel(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'heavens_piercing_line':
    case 'seraphel_heavens_piercing_line':
      noiseTexture(ctx, d, t, {
        duration: 0.15,
        peak: 0.1,
        filter: 'highpass',
        from: 8500,
        to: 1200,
        q: 1.5,
      });
      subImpact(ctx, d, t + 0.1, 1.6);
      cathedralBell(ctx, d, t + 0.12, 880, 1.1);
      return true;
    case 'lancefall_sequence':
    case 'seraphel_lancefall_sequence':
      pulseTrain(t, 5, 0.08, (at, i) => {
        metalImpact(ctx, d, at, 0.9 + i * 0.15, (i - 2) * 0.25);
        subImpact(ctx, d, at + 0.02, 0.8 + i * 0.15);
      });
      return true;
    case 'aerial_judgment':
    case 'seraphel_aerial_judgment':
      noiseTexture(ctx, d, t, {
        duration: 0.25,
        peak: 0.08,
        filter: 'bandpass',
        from: 600,
        to: 4500,
        q: 2.0,
      });
      subImpact(ctx, d, t + 0.22, 1.7);
      metalImpact(ctx, d, t + 0.24, 1.4);
      cathedralBell(ctx, d, t + 0.25, 659.25, 1.2);
      return true;
    case 'sentinel_spearfall_cascade':
    case 'seraphel_sentinel_spearfall_cascade':
      pulseTrain(t, 8, 0.045, (at, i) => {
        const pan = (i - 3.5) * 0.25;
        metalImpact(ctx, d, at, 0.8, pan);
        crystalShatter(ctx, d, at + 0.01, 780 + i * 60, 0.6, pan);
      });
      return true;
  }
  return false;
}

// ——— FLOOR 10: Oriphiel, The Last Warden (Primal Titan & Cataclysm) ———
function oriphiel(ctx: AudioContext, d: AudioNode, a: string, t: number): boolean {
  switch (a) {
    case 'wardens_edict':
    case 'oriphiel_wardens_edict':
      // Titan Brass Horn Modeling
      [110, 220, 330].forEach((f, i) => {
        fmVoice(ctx, d, t, {
          carrierFreq: f,
          carrierTo: f * 1.05,
          modFreq: f * 2,
          modIndex: 2.5,
          duration: 0.5,
          peak: 0.08 / (i + 1),
          carrierType: 'sawtooth',
          drive: 2.2,
          pan: (i - 1) * 0.2,
        });
      });
      subImpact(ctx, d, t + 0.05, 1.4);
      return true;
    case 'unbroken_judgment':
    case 'oriphiel_unbroken_judgment':
      metalImpact(ctx, d, t, 1.6);
      subImpact(ctx, d, t + 0.02, 1.5);
      cathedralBell(ctx, d, t + 0.04, 440, 1.2);
      return true;
    case 'the_final_verdict_combo':
    case 'oriphiel_the_final_verdict_combo':
      pulseTrain(t, 3, 0.14, (at, i) => {
        metalImpact(ctx, d, at, 1.0 + i * 0.3, (i - 1) * 0.3);
        subImpact(ctx, d, at + 0.02, 1.0 + i * 0.3);
      });
      return true;
    case 'cataclysm_of_the_first_guard':
    case 'oriphiel_cataclysm_of_the_first_guard':
    case 'bastion_ground_shatter':
    case 'oriphiel_bastion_ground_shatter':
      // Ultimate world-shattering cataclysm
      subImpact(ctx, d, t, 2.0);
      metalImpact(ctx, d, t + 0.02, 1.6);
      fireBurst(ctx, d, t + 0.04, 1.6);
      voidVortex(ctx, d, t + 0.06, 0.6);
      return true;
  }
  return false;
}

/** Main dispatcher: returns true when any Floor 1–10 boss ability was scheduled */
export function playBossAbilitySfx(
  ctx: AudioContext,
  dest: AudioNode,
  boss: string,
  ability: string
): boolean {
  if (!ctx || !dest || ctx.state === 'closed') return false;

  const b = boss.toLowerCase().replace(/[^a-z]/g, '');
  const a = ability
    .toLowerCase()
    .replace(/['’]/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const t = ctx.currentTime + 0.008;

  const id: BossId | null =
    b.includes('malakor') || b === 'warden'
      ? 'malakor'
      : b.includes('vaelor') || b === 'archlich'
      ? 'vaelor'
      : b.includes('ignis') || b.includes('cinder')
      ? 'ignis'
      : b.includes('malice') || b.includes('void')
      ? 'malice'
      : b.includes('archon')
      ? 'archon'
      : b.includes('elyndor') || b.includes('hymn')
      ? 'elyndor'
      : b.includes('zadkiel') || b.includes('ashen') || b.includes('reliquary')
      ? 'zadkiel'
      : b.includes('sariel') || b.includes('scripture') || b.includes('veiled')
      ? 'sariel'
      : b.includes('seraphel') || b.includes('sentinel') || b.includes('seal')
      ? 'seraphel'
      : b.includes('oriphiel')
      ? 'oriphiel'
      : null;

  if (!id) return false;

  switch (id) {
    case 'malakor':
      return malakor(ctx, dest, a, t);
    case 'vaelor':
      return vaelor(ctx, dest, a, t);
    case 'ignis':
      return ignis(ctx, dest, a, t);
    case 'malice':
      return malice(ctx, dest, a, t);
    case 'archon':
      return archon(ctx, dest, a, t);
    case 'elyndor':
      return elyndor(ctx, dest, a, t);
    case 'zadkiel':
      return zadkiel(ctx, dest, a, t);
    case 'sariel':
      return sariel(ctx, dest, a, t);
    case 'seraphel':
      return seraphel(ctx, dest, a, t);
    case 'oriphiel':
      return oriphiel(ctx, dest, a, t);
  }
}
