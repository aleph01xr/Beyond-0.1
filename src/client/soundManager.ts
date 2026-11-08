/**
 * Centralized SoundManager Architecture for "Beyond"
 *
 * Provides a scalable, robust, and modular audio system:
 * - Sound Pooling & Voice Recycling (Node reuse, active instance tracking, voice stealing, priority eviction)
 * - Three Independent Volume Channels (Master, Music, SFX) with live gain updates and persistent storage
 * - 2D Spatial Audio (Listener position, distance-based attenuation, horizontal stereo panning)
 * - Centralized Sound Registry (Sound metadata, concurrency limits, cooldowns, asset paths)
 * - Safe Lifecycle & Autoplay Handling (Lazy context creation, user-gesture unlock, graceful degradation)
 */

export type SoundCategory = 'sfx' | 'music';

export interface SpatialConfig {
  minDistance?: number; // Distance within which sound plays at 100% volume (default: 120 units)
  maxDistance?: number; // Distance beyond which sound is completely inaudible (default: 1200 units)
  panSpread?: number;   // Horizontal offset at which stereo panning reaches ±1.0 (default: 600 units)
  attenuation?: 'linear' | 'logarithmic'; // Attenuation curve (default: 'logarithmic')
}

export interface SoundDefinition {
  id: string;
  url: string;
  category: SoundCategory;
  defaultVolume?: number; // 0.0 - 1.0 (default: 1.0)
  spatial?: boolean | SpatialConfig;
  maxInstances?: number;  // Maximum simultaneous instances of this sound (default: 4)
  cooldownMs?: number;    // Minimum ms between playback triggers (default: 0)
  priority?: number;      // 0 - 100, where higher numbers survive voice eviction (default: 50)
  loop?: boolean;         // Loop playback (default: false)
}

export interface PlaySoundOptions {
  volume?: number;                        // Relative volume multiplier (0.0 to 1.0, default: 1.0)
  playbackRate?: number;                  // Playback speed / pitch multiplier (default: 1.0)
  position?: { x: number; y: number };    // 2D world coordinates for spatial playback
  loop?: boolean;                         // Override sound definition loop setting
  priority?: number;                      // Override sound definition priority
  onEnded?: () => void;                   // Callback when sound playback finishes
}

export interface SoundInstanceHandle {
  readonly instanceId: number;
  readonly soundId: string;
  readonly category: SoundCategory;
  readonly isPlaying: boolean;
  stop: (fadeDurationMs?: number) => void;
  setVolume: (volume: number) => void;
  setPosition: (x: number, y: number) => void;
}

export interface SoundManagerMetrics {
  activeVoices: number;
  maxVoices: number;
  pooledNodes: number;
  cachedBuffers: number;
  registeredSounds: number;
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  isMasterMuted: boolean;
  isSfxMuted: boolean;
  isMusicMuted: boolean;
  listenerPosition: { x: number; y: number };
}

interface PooledVoiceNode {
  gainNode: GainNode;
  pannerNode: StereoPannerNode | null;
  inUse: boolean;
}

interface ActiveInstance {
  instanceId: number;
  soundId: string;
  category: SoundCategory;
  source: AudioBufferSourceNode;
  voice: PooledVoiceNode;
  priority: number;
  startTime: number;
  volume: number;
  spatial: boolean;
  spatialConfig: SpatialConfig;
  worldPos: { x: number; y: number } | null;
  onEnded?: () => void;
  isStopping: boolean;
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  // Volume channels (0.0 - 1.0)
  private masterVolume = 0.85;
  private sfxVolume = 0.85;
  private musicVolume = 0.70;

  // Independent mute states
  private masterMuted = false;
  private sfxMuted = false;
  private musicMuted = false;

  // Spatial Listener Position (Player or camera center in world units)
  private listenerX = 0;
  private listenerY = 0;

  // Sound Registry & Asset Buffer Cache
  private registry = new Map<string, SoundDefinition>();
  private bufferCache = new Map<string, AudioBuffer>();
  private pendingBufferLoads = new Map<string, Promise<AudioBuffer | null>>();

  // Cooldown tracking per sound ID
  private lastPlayedTimestamps = new Map<string, number>();

  // Instance & Voice Pooling
  private nextInstanceId = 1;
  private maxGlobalVoices = 32;
  private maxPooledNodes = 24;
  private voiceNodePool: PooledVoiceNode[] = [];
  private activeInstances = new Map<number, ActiveInstance>();
  private instancesBySoundId = new Map<string, Set<number>>();

  // Listener change listeners for reactive UI/diagnostics
  private stateChangeListeners = new Set<() => void>();

  constructor() {
    this.loadPersistedSettings();
  }

  // ==========================================
  // PERSISTENCE & INITIALIZATION
  // ==========================================

  private loadPersistedSettings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedMasterVol = localStorage.getItem('beyond_audio_master_vol');
      if (savedMasterVol !== null) this.masterVolume = Math.max(0, Math.min(1, parseFloat(savedMasterVol) || 0.85));

      const savedSfxVol = localStorage.getItem('beyond_audio_sfx_vol');
      if (savedSfxVol !== null) this.sfxVolume = Math.max(0, Math.min(1, parseFloat(savedSfxVol) || 0.85));

      const savedMusicVol = localStorage.getItem('beyond_audio_music_vol');
      if (savedMusicVol !== null) this.musicVolume = Math.max(0, Math.min(1, parseFloat(savedMusicVol) || 0.70));

      const savedMasterMute = localStorage.getItem('beyond_audio_master_muted');
      if (savedMasterMute !== null) this.masterMuted = savedMasterMute === 'true';

      const savedSfxMute = localStorage.getItem('beyond_audio_sfx_muted');
      if (savedSfxMute !== null) this.sfxMuted = savedSfxMute === 'true';

      const savedMusicMute = localStorage.getItem('beyond_audio_music_muted');
      if (savedMusicMute !== null) this.musicMuted = savedMusicMute === 'true';

      // Backwards compatibility with previous sfx mute key
      const legacyMuted = localStorage.getItem('beyond_sfx_muted');
      if (legacyMuted !== null && savedMasterMute === null) {
        this.masterMuted = legacyMuted === 'true';
      }
    } catch {
      // Storage unavailable in private browsing or sandboxed iframe
    }
  }

  private saveSetting(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  /**
   * Lazily initializes the Web Audio API context and channel routing graph.
   * Audio Graph:
   *   [Voices] -> [Voice Gain] -> [Voice Panner]
   *                   \                    /
   *                    +---> [sfxGain]   -+
   *                    +---> [musicGain] -+
   *                                  |
   *                                  v
   *                             [masterGain]
   *                                  |
   *                                  v
   *                         [ctx.destination]
   */
  public ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) {
        console.warn('[SoundManager] Web Audio API is not supported in this environment.');
        return null;
      }

      try {
        this.ctx = new AudioCtx();
        const now = this.ctx.currentTime;

        // Master Bus
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.masterMuted ? 0 : this.masterVolume, now);
        this.masterGain.connect(this.ctx.destination);

        // SFX Sub-bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxMuted ? 0 : this.sfxVolume, now);
        this.sfxGain.connect(this.masterGain);

        // Music Sub-bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicMuted ? 0 : this.musicVolume, now);
        this.musicGain.connect(this.masterGain);
      } catch (err) {
        console.error('[SoundManager] Failed to create AudioContext:', err);
        return null;
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Unlocks AudioContext on early user gesture (pointerdown/touchstart/keydown).
   */
  public unlockAudio(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  public getAudioContext(): AudioContext | null {
    return this.ensureContext();
  }

  public getMasterDestination(): AudioNode | null {
    this.ensureContext();
    return this.masterGain;
  }

  public getSfxDestination(): AudioNode | null {
    this.ensureContext();
    return this.sfxGain;
  }

  public getMusicDestination(): AudioNode | null {
    this.ensureContext();
    return this.musicGain;
  }

  // ==========================================
  // VOLUME & MUTE MANAGEMENT
  // ==========================================

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    this.saveSetting('beyond_audio_master_vol', String(this.masterVolume));
    if (this.masterGain && this.ctx && !this.masterMuted) {
      this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);
    }
    this.notifyStateChange();
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    this.saveSetting('beyond_audio_sfx_vol', String(this.sfxVolume));
    if (this.sfxGain && this.ctx && !this.sfxMuted) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
    this.notifyStateChange();
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    this.saveSetting('beyond_audio_music_vol', String(this.musicVolume));
    if (this.musicGain && this.ctx && !this.musicMuted) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
    this.notifyStateChange();
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public setMasterMuted(muted: boolean): boolean {
    this.masterMuted = muted;
    this.saveSetting('beyond_audio_master_muted', String(this.masterMuted));
    this.saveSetting('beyond_sfx_muted', String(this.masterMuted)); // keep legacy in sync
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.masterMuted ? 0 : this.masterVolume,
        this.ctx.currentTime
      );
    }
    this.notifyStateChange();
    return this.masterMuted;
  }

  public toggleMasterMute(): boolean {
    return this.setMasterMuted(!this.masterMuted);
  }

  public isMasterMuted(): boolean {
    return this.masterMuted;
  }

  public setSfxMuted(muted: boolean): boolean {
    this.sfxMuted = muted;
    this.saveSetting('beyond_audio_sfx_muted', String(this.sfxMuted));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(
        this.sfxMuted ? 0 : this.sfxVolume,
        this.ctx.currentTime
      );
    }
    this.notifyStateChange();
    return this.sfxMuted;
  }

  public toggleSfxMute(): boolean {
    return this.setSfxMuted(!this.sfxMuted);
  }

  public isSfxMuted(): boolean {
    return this.sfxMuted;
  }

  public setMusicMuted(muted: boolean): boolean {
    this.musicMuted = muted;
    this.saveSetting('beyond_audio_music_muted', String(this.musicMuted));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(
        this.musicMuted ? 0 : this.musicVolume,
        this.ctx.currentTime
      );
    }
    this.notifyStateChange();
    return this.musicMuted;
  }

  public toggleMusicMute(): boolean {
    return this.setMusicMuted(!this.musicMuted);
  }

  public isMusicMuted(): boolean {
    return this.musicMuted;
  }

  // ==========================================
  // SPATIAL AUDIO CALCULATIONS
  // ==========================================

  /**
   * Sets the 2D world coordinates of the listener (player or camera focal point).
   * Automatically recalculates volume and panning for all active spatial sounds.
   */
  public setListenerPosition(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
    this.updateActiveSpatialInstances();
  }

  public getListenerPosition(): { x: number; y: number } {
    return { x: this.listenerX, y: this.listenerY };
  }

  /**
   * Updates an individual active sound instance's world position.
   */
  public setSoundPosition(instanceId: number, x: number, y: number): void {
    const inst = this.activeInstances.get(instanceId);
    if (!inst || !inst.spatial) return;
    inst.worldPos = { x, y };
    this.applySpatialParameters(inst);
  }

  /**
   * Computes distance attenuation and horizontal stereo panning for a world position.
   */
  public calculateSpatialParameters(
    worldPos: { x: number; y: number },
    config: SpatialConfig
  ): { volume: number; pan: number; inAudible: boolean } {
    const minDistance = config.minDistance ?? 120;
    const maxDistance = config.maxDistance ?? 1200;
    const panSpread = config.panSpread ?? 600;
    const attenuation = config.attenuation ?? 'logarithmic';

    const dx = worldPos.x - this.listenerX;
    const dy = worldPos.y - this.listenerY;
    const distance = Math.hypot(dx, dy);

    if (distance >= maxDistance) {
      return { volume: 0, pan: 0, inAudible: true };
    }

    let distVol = 1;
    if (distance > minDistance) {
      if (attenuation === 'linear') {
        distVol = Math.max(0, 1 - (distance - minDistance) / (maxDistance - minDistance));
      } else {
        // Logarithmic rolloff with smooth threshold
        const range = maxDistance - minDistance;
        const normalized = (distance - minDistance) / range;
        distVol = Math.max(0, Math.pow(1 - normalized, 2));
      }
    }

    // Horizontal stereo pan clamped between -1.0 (full left) and +1.0 (full right)
    const pan = Math.max(-1, Math.min(1, dx / panSpread));

    return { volume: distVol, pan, inAudible: false };
  }

  private applySpatialParameters(inst: ActiveInstance): void {
    if (!inst.worldPos || !this.ctx) return;
    const now = this.ctx.currentTime;
    const { volume: distVol, pan } = this.calculateSpatialParameters(inst.worldPos, inst.spatialConfig);

    const finalGain = inst.volume * distVol;
    inst.voice.gainNode.gain.setValueAtTime(finalGain, now);

    if (inst.voice.pannerNode) {
      inst.voice.pannerNode.pan.setValueAtTime(pan, now);
    }
  }

  private updateActiveSpatialInstances(): void {
    if (!this.ctx) return;
    for (const inst of this.activeInstances.values()) {
      if (inst.spatial && inst.worldPos && !inst.isStopping) {
        this.applySpatialParameters(inst);
      }
    }
  }

  // ==========================================
  // SOUND REGISTRY
  // ==========================================

  public registerSound(def: SoundDefinition): void {
    if (!def.id) {
      console.warn('[SoundManager] Cannot register sound without ID.');
      return;
    }
    this.registry.set(def.id, {
      ...def,
      defaultVolume: def.defaultVolume ?? 1.0,
      maxInstances: Math.max(1, def.maxInstances ?? 4),
      cooldownMs: Math.max(0, def.cooldownMs ?? 0),
      priority: Math.max(0, Math.min(100, def.priority ?? 50)),
      loop: !!def.loop,
    });
  }

  public registerSounds(defs: SoundDefinition[]): void {
    for (const def of defs) {
      this.registerSound(def);
    }
  }

  public getSoundDefinition(id: string): SoundDefinition | undefined {
    return this.registry.get(id);
  }

  public hasSound(id: string): boolean {
    return this.registry.has(id);
  }

  public unregisterSound(id: string): boolean {
    this.stopSound(id);
    return this.registry.delete(id);
  }

  public clearRegistry(): void {
    this.stopAll();
    this.registry.clear();
  }

  // ==========================================
  // BUFFER PRELOADING & CACHING
  // ==========================================

  /**
   * Preloads an audio file into an AudioBuffer safely without blocking gameplay.
   */
  public async preloadSound(soundId: string): Promise<AudioBuffer | null> {
    const cached = this.bufferCache.get(soundId);
    if (cached) return cached;

    const pending = this.pendingBufferLoads.get(soundId);
    if (pending) return pending;

    const def = this.registry.get(soundId);
    if (!def) {
      console.warn(`[SoundManager] Cannot preload unregistered sound "${soundId}".`);
      return null;
    }

    const ctx = this.ensureContext();
    if (!ctx) return null;

    const loadPromise = (async () => {
      try {
        const response = await fetch(def.url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        this.bufferCache.set(soundId, audioBuffer);
        return audioBuffer;
      } catch (err) {
        console.warn(`[SoundManager] Failed to load audio asset for "${soundId}" from "${def.url}":`, err);
        return null;
      } finally {
        this.pendingBufferLoads.delete(soundId);
      }
    })();

    this.pendingBufferLoads.set(soundId, loadPromise);
    return loadPromise;
  }

  public async preloadCategory(category: SoundCategory): Promise<void> {
    const promises: Promise<AudioBuffer | null>[] = [];
    for (const [id, def] of this.registry.entries()) {
      if (def.category === category) {
        promises.push(this.preloadSound(id));
      }
    }
    await Promise.all(promises);
  }

  public clearBufferCache(): void {
    this.bufferCache.clear();
  }

  // ==========================================
  // VOICE & NODE POOLING
  // ==========================================

  /**
   * Acquires a pooled voice node (GainNode + optional StereoPannerNode).
   * Reuses idle nodes to minimize GC pressure during heavy combat.
   */
  private acquireVoiceNode(category: SoundCategory): PooledVoiceNode | null {
    const ctx = this.ensureContext();
    if (!ctx) return null;

    // Check pool for an idle voice node
    for (const voice of this.voiceNodePool) {
      if (!voice.inUse) {
        voice.inUse = true;
        // Reconnect to appropriate category bus
        const dest = category === 'music' ? this.musicGain : this.sfxGain;
        if (dest) {
          if (voice.pannerNode) {
            voice.pannerNode.connect(dest);
          } else {
            voice.gainNode.connect(dest);
          }
        }
        return voice;
      }
    }

    // Allocate a new voice node if under pool limit
    const gainNode = ctx.createGain();
    let pannerNode: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      try {
        pannerNode = ctx.createStereoPanner();
        gainNode.connect(pannerNode);
      } catch {
        pannerNode = null;
      }
    }

    const dest = category === 'music' ? this.musicGain : this.sfxGain;
    if (dest) {
      if (pannerNode) {
        pannerNode.connect(dest);
      } else {
        gainNode.connect(dest);
      }
    }

    const voice: PooledVoiceNode = {
      gainNode,
      pannerNode,
      inUse: true,
    };

    if (this.voiceNodePool.length < this.maxPooledNodes) {
      this.voiceNodePool.push(voice);
    }

    return voice;
  }

  /**
   * Releases a voice node back to the pool and disconnects upstream nodes.
   */
  private releaseVoiceNode(voice: PooledVoiceNode): void {
    voice.inUse = false;
    try {
      if (voice.pannerNode) {
        voice.pannerNode.disconnect();
      } else {
        voice.gainNode.disconnect();
      }
    } catch {
      // ignore
    }
  }

  // ==========================================
  // PLAYBACK & CONCURRENCY
  // ==========================================

  /**
   * Plays a registered sound effect or music track.
   * Handles concurrency limits, cooldowns, voice stealing, spatial audio, and pooling.
   */
  public play(soundId: string, options: PlaySoundOptions = {}): SoundInstanceHandle | null {
    const def = this.registry.get(soundId);
    if (!def) {
      console.warn(`[SoundManager] Attempted to play unregistered sound "${soundId}".`);
      return null;
    }

    // Check cooldown
    const nowMs = performance.now();
    const lastPlayed = this.lastPlayedTimestamps.get(soundId) || 0;
    if (def.cooldownMs && def.cooldownMs > 0 && nowMs - lastPlayed < def.cooldownMs) {
      return null; // Throttled by cooldown
    }

    const ctx = this.ensureContext();
    if (!ctx) return null;

    const buffer = this.bufferCache.get(soundId);
    if (!buffer) {
      // Initiate background preload if not yet available
      this.preloadSound(soundId);
      return null;
    }

    const priority = options.priority ?? def.priority ?? 50;

    // Concurrency Limit Check per sound ID
    const soundInstances = this.instancesBySoundId.get(soundId) || new Set<number>();
    const maxInstances = def.maxInstances ?? 4;
    if (soundInstances.size >= maxInstances) {
      // Find oldest active instance of this sound
      let oldestId: number | null = null;
      let oldestTime = Infinity;
      for (const id of soundInstances) {
        const inst = this.activeInstances.get(id);
        if (inst && inst.startTime < oldestTime) {
          oldestTime = inst.startTime;
          oldestId = id;
        }
      }

      if (oldestId !== null) {
        const oldest = this.activeInstances.get(oldestId);
        if (oldest && priority >= oldest.priority) {
          // Voice steal: smoothly fade out oldest instance to avoid clicks
          this.stopInstance(oldestId, 25);
        } else {
          // New sound has lower priority than all active instances; drop it
          return null;
        }
      }
    }

    // Global Voice Pool Capacity Check
    if (this.activeInstances.size >= this.maxGlobalVoices) {
      // Evict lowest priority active sound globally
      let candidateId: number | null = null;
      let lowestPriority = Infinity;
      let oldestTime = Infinity;

      for (const [id, inst] of this.activeInstances.entries()) {
        if (
          inst.priority < lowestPriority ||
          (inst.priority === lowestPriority && inst.startTime < oldestTime)
        ) {
          lowestPriority = inst.priority;
          oldestTime = inst.startTime;
          candidateId = id;
        }
      }

      if (candidateId !== null && priority >= lowestPriority) {
        this.stopInstance(candidateId, 25);
      } else {
        return null; // Global voice limit reached by higher-priority sounds
      }
    }

    // Acquire pooled voice node
    const voice = this.acquireVoiceNode(def.category);
    if (!voice) return null;

    // Create AudioBufferSourceNode
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? def.loop ?? false;
    if (options.playbackRate !== undefined && options.playbackRate > 0) {
      source.playbackRate.setValueAtTime(options.playbackRate, ctx.currentTime);
    }

    // Setup instance tracking
    const instanceId = this.nextInstanceId++;
    const baseVolume = (def.defaultVolume ?? 1.0) * (options.volume ?? 1.0);
    const spatial = !!(options.position && (def.spatial || options.position));
    const spatialConfig: SpatialConfig =
      typeof def.spatial === 'object' ? def.spatial : {};

    const activeInstance: ActiveInstance = {
      instanceId,
      soundId,
      category: def.category,
      source,
      voice,
      priority,
      startTime: ctx.currentTime,
      volume: baseVolume,
      spatial,
      spatialConfig,
      worldPos: options.position ? { ...options.position } : null,
      onEnded: options.onEnded,
      isStopping: false,
    };

    // Connect source to voice gain
    source.connect(voice.gainNode);

    // Apply volume and spatial parameters
    if (spatial && activeInstance.worldPos) {
      this.applySpatialParameters(activeInstance);
    } else {
      voice.gainNode.gain.setValueAtTime(baseVolume, ctx.currentTime);
      if (voice.pannerNode) {
        voice.pannerNode.pan.setValueAtTime(0, ctx.currentTime);
      }
    }

    // Register active instance
    this.activeInstances.set(instanceId, activeInstance);
    if (!this.instancesBySoundId.has(soundId)) {
      this.instancesBySoundId.set(soundId, new Set());
    }
    this.instancesBySoundId.get(soundId)!.add(instanceId);
    this.lastPlayedTimestamps.set(soundId, nowMs);

    // Cleanup on buffer finish
    source.onended = () => {
      this.handleSourceEnded(instanceId);
    };

    // Start playback
    try {
      source.start(ctx.currentTime);
    } catch (err) {
      console.warn(`[SoundManager] Playback start failed for "${soundId}":`, err);
      this.handleSourceEnded(instanceId);
      return null;
    }

    this.notifyStateChange();

    return {
      instanceId,
      soundId,
      category: def.category,
      get isPlaying() {
        return soundManager.isInstancePlaying(instanceId);
      },
      stop: (fadeDurationMs?: number) => {
        this.stopInstance(instanceId, fadeDurationMs);
      },
      setVolume: (v: number) => {
        this.setInstanceVolume(instanceId, v);
      },
      setPosition: (x: number, y: number) => {
        this.setSoundPosition(instanceId, x, y);
      },
    };
  }

  public isInstancePlaying(instanceId: number): boolean {
    const inst = this.activeInstances.get(instanceId);
    return !!(inst && !inst.isStopping);
  }

  private handleSourceEnded(instanceId: number): void {
    const inst = this.activeInstances.get(instanceId);
    if (!inst) return;

    this.activeInstances.delete(instanceId);
    const soundInstances = this.instancesBySoundId.get(inst.soundId);
    if (soundInstances) {
      soundInstances.delete(instanceId);
      if (soundInstances.size === 0) {
        this.instancesBySoundId.delete(inst.soundId);
      }
    }

    this.releaseVoiceNode(inst.voice);
    if (inst.onEnded) {
      try {
        inst.onEnded();
      } catch {
        // ignore callback exceptions
      }
    }

    this.notifyStateChange();
  }

  /**
   * Stops an active sound instance with an optional quick anti-click fade out.
   */
  public stopInstance(instanceId: number, fadeDurationMs = 15): boolean {
    const inst = this.activeInstances.get(instanceId);
    if (!inst || inst.isStopping) return false;
    inst.isStopping = true;

    if (!this.ctx) {
      this.handleSourceEnded(instanceId);
      return true;
    }

    const now = this.ctx.currentTime;
    const fadeSec = Math.max(0.005, fadeDurationMs / 1000);

    try {
      inst.voice.gainNode.gain.setValueAtTime(inst.voice.gainNode.gain.value, now);
      inst.voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      setTimeout(() => {
        try {
          inst.source.stop();
        } catch {
          // ignore if already stopped
        }
        this.handleSourceEnded(instanceId);
      }, fadeDurationMs + 10);
    } catch {
      try {
        inst.source.stop();
      } catch {
        // ignore
      }
      this.handleSourceEnded(instanceId);
    }

    return true;
  }

  public setInstanceVolume(instanceId: number, volume: number): void {
    const inst = this.activeInstances.get(instanceId);
    if (!inst || !this.ctx || inst.isStopping) return;
    inst.volume = Math.max(0, Math.min(1, volume));
    if (inst.spatial && inst.worldPos) {
      this.applySpatialParameters(inst);
    } else {
      inst.voice.gainNode.gain.setValueAtTime(inst.volume, this.ctx.currentTime);
    }
  }

  /**
   * Stops all active instances of a specific sound ID.
   */
  public stopSound(soundId: string, fadeDurationMs = 20): void {
    const instances = this.instancesBySoundId.get(soundId);
    if (!instances) return;
    for (const id of Array.from(instances)) {
      this.stopInstance(id, fadeDurationMs);
    }
  }

  /**
   * Stops all active audio within a category ('sfx' or 'music').
   */
  public stopCategory(category: SoundCategory, fadeDurationMs = 30): void {
    for (const [id, inst] of this.activeInstances.entries()) {
      if (inst.category === category) {
        this.stopInstance(id, fadeDurationMs);
      }
    }
  }

  /**
   * Stops all currently playing sounds across all channels immediately or with a short fade.
   */
  public stopAll(fadeDurationMs = 20): void {
    for (const id of Array.from(this.activeInstances.keys())) {
      this.stopInstance(id, fadeDurationMs);
    }
  }

  // ==========================================
  // METRICS & DIAGNOSTICS
  // ==========================================

  public getMetrics(): SoundManagerMetrics {
    return {
      activeVoices: this.activeInstances.size,
      maxVoices: this.maxGlobalVoices,
      pooledNodes: this.voiceNodePool.length,
      cachedBuffers: this.bufferCache.size,
      registeredSounds: this.registry.size,
      masterVolume: this.masterVolume,
      sfxVolume: this.sfxVolume,
      musicVolume: this.musicVolume,
      isMasterMuted: this.masterMuted,
      isSfxMuted: this.sfxMuted,
      isMusicMuted: this.musicMuted,
      listenerPosition: { x: this.listenerX, y: this.listenerY },
    };
  }

  public subscribe(listener: () => void): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  private notifyStateChange(): void {
    for (const listener of this.stateChangeListeners) {
      try {
        listener();
      } catch {
        // ignore
      }
    }
  }
}

// Global Singleton Instance
export const soundManager = new SoundManager();

// Window-level gesture unlocker
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    soundManager.unlockAudio();
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('touchstart', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}
