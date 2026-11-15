import {
  ConnectionState,
  Participant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { getApiEndpoint } from '../apiConfig.ts';

export interface VoiceParticipantState {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMutedLocally: boolean;
  isMutedRemote: boolean;
  distance?: number;
  volume: number;
  pan: number;
}

export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
export type MicMode = 'toggle' | 'hold';

interface RemoteAudioPipeline {
  element: HTMLAudioElement;
  source?: MediaStreamAudioSourceNode;
  panner?: StereoPannerNode;
  gain?: GainNode;
  usingWebAudio: boolean;
}

const MAX_HEAR_DISTANCE_PX = 600;
const STEREO_PAN_SPAN_PX = 360;

export class VoiceClientManager {
  private room: Room | null = null;
  private currentRoomId: string | null = null;
  private currentAuthHeader = '';
  private isMicEnabled = false;
  private isDeafened = false;
  private micMode: MicMode = 'toggle';
  private locallyMutedUsers = new Set<string>();
  private listeners: (() => void)[] = [];
  private participantsState = new Map<string, VoiceParticipantState>();
  private audioPipelines = new Map<string, RemoteAudioPipeline>();
  private speakingIds = new Set<string>();
  private audioCtx: AudioContext | null = null;
  private abortController: AbortController | null = null;
  private attemptSeq = 0;

  public connectionState: VoiceConnectionState = 'disconnected';
  public isReconnecting = false;
  public canPlaybackAudio = true;
  public lastError: string | null = null;
  public micError: string | null = null;
  public httpStatus: number | null = null;

  constructor() {}

  public subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    for (const l of this.listeners) {
      l();
    }
  }

  public getSpeakingParticipantIds(): ReadonlySet<string> {
    return this.speakingIds;
  }

  public getMicMode(): MicMode {
    return this.micMode;
  }

  public setMicMode(mode: MicMode) {
    if (this.micMode === mode) return;
    this.micMode = mode;
    if (mode === 'hold' && this.isMicEnabled) {
      void this.setMicrophoneEnabled(false);
    }
    this.notify();
  }

  private ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  public async unlockAudio(): Promise<void> {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      try {
        await this.audioCtx.resume();
      } catch {
        // ignore
      }
    }
    if (this.room) {
      try {
        await this.room.startAudio();
        this.canPlaybackAudio = this.room.canPlaybackAudio;
      } catch {
        // ignore
      }
    }
    for (const pipeline of this.audioPipelines.values()) {
      if (pipeline.element.paused) {
        pipeline.element.play().catch(() => {});
      }
    }
    this.notify();
  }

  public async connect(
    roomId: string,
    tokenAuthHeader: string,
    _userId: string,
    _username: string
  ) {
    if (
      this.connectionState === 'connected' &&
      this.currentRoomId === roomId &&
      this.currentAuthHeader === tokenAuthHeader
    ) {
      return;
    }

    const attemptId = ++this.attemptSeq;

    if (this.abortController) {
      this.abortController.abort();
    }
    const controller = new AbortController();
    this.abortController = controller;

    await this.disconnectInternal();
    if (attemptId !== this.attemptSeq) return;

    this.currentRoomId = roomId;
    this.currentAuthHeader = tokenAuthHeader;
    this.isReconnecting = false;
    this.lastError = null;
    this.micError = null;
    this.httpStatus = null;

    if (!tokenAuthHeader) {
      this.connectionState = 'error';
      this.httpStatus = 401;
      this.lastError = 'Authentication required for voice chat (missing session token).';
      console.warn('[VoiceClient] Connection aborted: missing Authorization header.');
      this.notify();
      return;
    }

    this.connectionState = 'connecting';
    this.notify();

    console.log(`[VoiceClient] Requesting voice token for room: ${roomId}`);

    const fetchTimeoutId = window.setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(getApiEndpoint('/api/voice/token'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: tokenAuthHeader,
        },
        body: JSON.stringify({ roomId }),
        signal: controller.signal,
      });

      window.clearTimeout(fetchTimeoutId);
      if (attemptId !== this.attemptSeq) return;

      this.httpStatus = res.status;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMessage = errData.error || `Server responded with HTTP ${res.status}`;
        console.warn(`[VoiceClient] Token request failed (${res.status}): ${errMessage}`);
        this.connectionState = 'error';
        this.lastError = errMessage;
        this.notify();
        return;
      }

      const data = (await res.json()) as { token?: string; url?: string };
      if (!data?.token || !data?.url) {
        throw new Error('Invalid voice token payload received from server.');
      }

      if (attemptId !== this.attemptSeq || controller.signal.aborted || this.currentRoomId !== roomId) {
        return;
      }

      console.log(`[VoiceClient] Voice token acquired. Connecting to LiveKit for room: ${roomId}`);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      this.room = room;

      room.on(RoomEvent.Connected, () => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.connectionState = 'connected';
        this.isReconnecting = false;
        this.lastError = null;
        this.canPlaybackAudio = room.canPlaybackAudio;
        console.log(`[VoiceClient] LiveKit connected to room: ${roomId}`);

        // Sync any participants & tracks already present in the room
        for (const participant of room.remoteParticipants.values()) {
          this.updateParticipantState(participant);
          for (const pub of participant.trackPublications.values()) {
            if (pub.track && pub.track.kind === Track.Kind.Audio && pub.isSubscribed) {
              this.attachRemoteAudioTrack(pub.track, participant);
            }
          }
        }
        this.notify();
      });

      room.on(RoomEvent.Reconnecting, () => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.isReconnecting = true;
        console.warn(`[VoiceClient] Reconnecting to LiveKit room: ${roomId}`);
        this.notify();
      });

      room.on(RoomEvent.Reconnected, () => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.isReconnecting = false;
        this.connectionState = 'connected';
        this.lastError = null;
        console.log(`[VoiceClient] Reconnected to LiveKit room: ${roomId}`);
        this.notify();
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        console.warn('[VoiceClient] Disconnected from LiveKit room. Reason:', reason);
        this.isReconnecting = false;
        this.connectionState = 'disconnected';
        this.isMicEnabled = false;
        this.cleanupAllAudioPipelines();
        this.participantsState.clear();
        this.speakingIds.clear();
        this.notify();
      });

      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.canPlaybackAudio = room.canPlaybackAudio;
        this.notify();
      });

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.updateParticipantState(participant);
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.participantsState.delete(participant.identity);
        this.speakingIds.delete(participant.identity);
        this.cleanupRemoteAudioPipeline(participant.identity);
        this.notify();
      });

      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        if (track.kind === Track.Kind.Audio) {
          this.attachRemoteAudioTrack(track, participant);
          this.updateParticipantState(participant);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        if (track.kind === Track.Kind.Audio) {
          this.cleanupRemoteAudioPipeline(participant.identity);
        }
      });

      room.on(RoomEvent.TrackMuted, (_pub, participant) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.updateParticipantState(participant);
      });

      room.on(RoomEvent.TrackUnmuted, (_pub, participant) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        this.updateParticipantState(participant);
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (attemptId !== this.attemptSeq || this.room !== room) return;
        const nextSpeaking = new Set(speakers.map((s) => s.identity));
        this.speakingIds = nextSpeaking;
        for (const [id, state] of this.participantsState.entries()) {
          state.isSpeaking = nextSpeaking.has(id);
        }
        this.notify();
      });

      await room.connect(data.url, data.token);

      if (attemptId !== this.attemptSeq) {
        room.removeAllListeners();
        await room.disconnect().catch(() => {});
        return;
      }

      // Always join voice rooms with the microphone disabled by default
      await room.localParticipant.setMicrophoneEnabled(false);
      this.isMicEnabled = false;
      this.canPlaybackAudio = room.canPlaybackAudio;

      if (room.state === ConnectionState.Connected) {
        this.connectionState = 'connected';
      }
      this.notify();
    } catch (err: unknown) {
      window.clearTimeout(fetchTimeoutId);
      if (attemptId !== this.attemptSeq) return;
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') {
        if (controller.signal.aborted && this.connectionState === 'connecting') {
          this.connectionState = 'error';
          this.lastError = 'Voice server request timed out. Please retry.';
          this.notify();
        }
        return;
      }
      console.error('[VoiceClient] LiveKit connection failed:', err);
      await this.disconnectInternal();
      this.connectionState = 'error';
      this.lastError = e?.message || 'Failed to connect to LiveKit voice server.';
      this.notify();
    }
  }

  private attachRemoteAudioTrack(track: Track, participant: Participant) {
    const identity = participant.identity;
    this.cleanupRemoteAudioPipeline(identity);

    const element = track.attach() as HTMLAudioElement;
    element.autoplay = true;
    element.setAttribute('playsinline', 'true');
    element.style.display = 'none';
    document.body.appendChild(element);

    const pipeline: RemoteAudioPipeline = {
      element,
      usingWebAudio: false,
    };

    try {
      const ctx = this.ensureAudioContext();
      if (ctx && track.mediaStreamTrack) {
        const stream = new MediaStream([track.mediaStreamTrack]);
        const source = ctx.createMediaStreamSource(stream);
        const panner =
          typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : undefined;
        const gain = ctx.createGain();

        if (panner) {
          source.connect(panner);
          panner.connect(gain);
        } else {
          source.connect(gain);
        }
        gain.connect(ctx.destination);

        // Keep HTMLAudioElement muted so Chromium decodes the WebRTC track without double playback
        element.muted = true;
        pipeline.source = source;
        pipeline.panner = panner;
        pipeline.gain = gain;
        pipeline.usingWebAudio = true;
      }
    } catch (err) {
      console.warn('[VoiceClient] Web Audio routing unavailable, falling back to HTMLAudioElement:', err);
    }

    element.play().catch(() => {
      // Browser autoplay restriction; resolved when unlockAudio() runs on gesture
    });

    this.audioPipelines.set(identity, pipeline);
    this.applyAudioPipelineState(identity);
  }

  private cleanupRemoteAudioPipeline(identity: string) {
    const pipeline = this.audioPipelines.get(identity);
    if (!pipeline) return;
    try {
      pipeline.source?.disconnect();
      pipeline.panner?.disconnect();
      pipeline.gain?.disconnect();
    } catch {
      // ignore
    }
    try {
      pipeline.element.pause();
      pipeline.element.srcObject = null;
      pipeline.element.remove();
    } catch {
      // ignore
    }
    this.audioPipelines.delete(identity);
  }

  private cleanupAllAudioPipelines() {
    for (const identity of Array.from(this.audioPipelines.keys())) {
      this.cleanupRemoteAudioPipeline(identity);
    }
  }

  private async disconnectInternal() {
    if (this.room) {
      try {
        this.room.removeAllListeners();
        await this.room.disconnect();
      } catch {
        // ignore
      }
      this.room = null;
    }
    this.cleanupAllAudioPipelines();
    this.participantsState.clear();
    this.speakingIds.clear();
    this.isReconnecting = false;
  }

  public async disconnect() {
    this.attemptSeq++;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    await this.disconnectInternal();
    this.connectionState = 'disconnected';
    this.currentRoomId = null;
    this.currentAuthHeader = '';
    this.isMicEnabled = false;
    this.lastError = null;
    this.micError = null;
    this.httpStatus = null;
    this.notify();
  }

  public get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  public async toggleMicrophone(): Promise<boolean> {
    if (!this.room || !this.isConnected) return false;
    if (this.isDeafened) return false;

    await this.unlockAudio();
    const nextState = !this.isMicEnabled;
    await this.setMicrophoneEnabled(nextState);
    return this.isMicEnabled;
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room || !this.isConnected) return;
    if (this.isDeafened && enabled) return;

    if (enabled) {
      await this.unlockAudio();
    }

    try {
      this.micError = null;
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.isMicEnabled = this.room.localParticipant.isMicrophoneEnabled;
      if (!this.isMicEnabled) {
        this.speakingIds.delete(this.room.localParticipant.identity);
      }
      this.notify();
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      console.error('[VoiceClient] Failed to set microphone state:', err);
      if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
        this.micError = 'Microphone permission denied. Allow mic access in browser settings.';
      } else if (e?.name === 'NotFoundError' || e?.name === 'DevicesNotFoundError') {
        this.micError = 'No microphone device found.';
      } else {
        this.micError = e?.message || 'Unable to access microphone.';
      }
      this.isMicEnabled = false;
      this.notify();
    }
  }

  public setDeafened(deafened: boolean) {
    this.isDeafened = deafened;
    if (deafened && this.isMicEnabled) {
      void this.setMicrophoneEnabled(false);
    }
    for (const identity of this.audioPipelines.keys()) {
      this.applyAudioPipelineState(identity);
    }
    this.notify();
  }

  public toggleUserMute(identity: string) {
    if (this.locallyMutedUsers.has(identity)) {
      this.locallyMutedUsers.delete(identity);
    } else {
      this.locallyMutedUsers.add(identity);
    }
    this.applyAudioPipelineState(identity);
    this.notify();
  }

  public isUserMutedLocally(identity: string): boolean {
    return this.locallyMutedUsers.has(identity);
  }

  private applyAudioPipelineState(identity: string) {
    const pipeline = this.audioPipelines.get(identity);
    if (!pipeline) return;
    const state = this.participantsState.get(identity);
    const muted = this.isDeafened || this.locallyMutedUsers.has(identity);
    const targetVolume = muted ? 0 : (state?.volume ?? 1);
    const targetPan = state?.pan ?? 0;

    if (pipeline.usingWebAudio && pipeline.gain) {
      pipeline.element.muted = true;
      pipeline.gain.gain.value = targetVolume;
      if (pipeline.panner) {
        pipeline.panner.pan.value = targetPan;
      }
    } else {
      pipeline.element.muted = muted || targetVolume <= 0;
      pipeline.element.volume = Math.max(0, Math.min(1, targetVolume));
    }
  }

  public updateProximityVolumes(
    myPos: { x: number; y: number },
    otherPlayers: { id: string; x: number; y: number }[]
  ) {
    if (!this.room || !this.isConnected) return;

    const posMap = new Map<string, { x: number; y: number }>();
    for (const p of otherPlayers) {
      posMap.set(p.id, { x: p.x, y: p.y });
    }

    for (const [identity, participant] of this.room.remoteParticipants.entries()) {
      const remotePos = posMap.get(identity);
      const isLocallyMuted = this.locallyMutedUsers.has(identity);

      let volume = 0;
      let dist: number | undefined = undefined;
      let pan = 0;

      if (remotePos) {
        dist = Math.hypot(remotePos.x - myPos.x, remotePos.y - myPos.y);
        if (dist > MAX_HEAR_DISTANCE_PX || this.isDeafened || isLocallyMuted) {
          volume = 0;
        } else {
          volume = Math.max(0, Math.min(1, 1 - dist / MAX_HEAR_DISTANCE_PX));
        }
        pan = Math.max(-1, Math.min(1, (remotePos.x - myPos.x) / STEREO_PAN_SPAN_PX));
      } else {
        // Player exists in voice room but has no world coordinate in current snapshot
        volume = 0;
      }

      const existing = this.participantsState.get(identity);
      const nextState: VoiceParticipantState = {
        identity,
        name: participant.name || identity,
        isSpeaking: this.speakingIds.has(identity) || participant.isSpeaking,
        isMutedLocally: isLocallyMuted,
        isMutedRemote: !participant.isMicrophoneEnabled,
        distance: dist,
        volume,
        pan,
      };

      this.participantsState.set(identity, nextState);
      this.applyAudioPipelineState(identity);

      if (
        !existing ||
        existing.isMutedRemote !== nextState.isMutedRemote ||
        Math.round((existing.distance ?? -1) / 25) !== Math.round((dist ?? -1) / 25)
      ) {
        this.notify();
      }
    }
  }

  private updateParticipantState(p: Participant) {
    const existing = this.participantsState.get(p.identity);
    this.participantsState.set(p.identity, {
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: this.speakingIds.has(p.identity) || p.isSpeaking,
      isMutedLocally: this.locallyMutedUsers.has(p.identity),
      isMutedRemote: !p.isMicrophoneEnabled,
      distance: existing?.distance,
      volume: existing?.volume ?? 0,
      pan: existing?.pan ?? 0,
    });
    this.notify();
  }

  public getStatus() {
    return {
      connectionState: this.connectionState,
      isConnected: this.isConnected,
      isReconnecting: this.isReconnecting,
      canPlaybackAudio: this.canPlaybackAudio,
      isMicEnabled: this.isMicEnabled,
      isDeafened: this.isDeafened,
      micMode: this.micMode,
      lastError: this.lastError,
      micError: this.micError,
      httpStatus: this.httpStatus,
      participants: Array.from(this.participantsState.values()),
    };
  }
}

export const voiceManager = new VoiceClientManager();
