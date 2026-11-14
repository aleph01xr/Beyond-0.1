import { Room, RoomEvent, Track, Participant } from 'livekit-client';
import { getApiEndpoint } from '../apiConfig.ts';

export interface VoiceParticipantState {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMutedLocally: boolean;
  distance?: number;
  volume: number;
}

export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export class VoiceClientManager {
  private room: Room | null = null;
  private currentRoomId: string | null = null;
  private isMicEnabled = false;
  private isDeafened = false;
  private locallyMutedUsers = new Set<string>();
  private listeners: (() => void)[] = [];
  private participantsState = new Map<string, VoiceParticipantState>();
  private audioElements = new Map<string, HTMLAudioElement>();
  private abortController: AbortController | null = null;

  public connectionState: VoiceConnectionState = 'disconnected';
  public lastError: string | null = null;
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

  public async connect(roomId: string, tokenAuthHeader: string, userId: string, username: string) {
    if (this.connectionState === 'connected' && this.currentRoomId === roomId) {
      return;
    }

    // Cancel any ongoing connection attempt
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    await this.disconnectInternal();

    this.currentRoomId = roomId;
    this.connectionState = 'connecting';
    this.lastError = null;
    this.httpStatus = null;
    this.notify();

    console.log(`[VoiceClient] Requesting token for room: ${roomId}`);

    try {
      const res = await fetch(getApiEndpoint('/api/voice/token'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenAuthHeader ? { Authorization: tokenAuthHeader } : {}),
        },
        body: JSON.stringify({ roomId }),
        signal: this.abortController.signal,
      });

      this.httpStatus = res.status;

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMessage = errData.error || `Server responded with status ${res.status}`;
        console.warn(`[VoiceClient] Token request failed (${res.status}):`, errMessage);
        this.connectionState = 'error';
        this.lastError = errMessage;
        this.notify();
        return;
      }

      const data = (await res.json()) as { token: string; url: string };
      if (!data || !data.token || !data.url) {
        throw new Error('Invalid token response received from server.');
      }

      console.log('[VoiceClient] Token received successfully. Connecting to LiveKit...');

      // Guard against stale room changes during async fetch
      if (this.currentRoomId !== roomId || this.abortController.signal.aborted) {
        return;
      }

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
        if (this.currentRoomId !== roomId) return;
        this.connectionState = 'connected';
        this.lastError = null;
        console.log(`[VoiceClient] Successfully confirmed LiveKit connection to room: ${roomId}`);
        this.notify();
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        console.log('[VoiceClient] Disconnected from LiveKit room, reason:', reason);
        if (this.currentRoomId === roomId) {
          this.connectionState = 'disconnected';
          this.notify();
        }
      });

      room.on(RoomEvent.ParticipantConnected, (p) => {
        this.updateParticipantState(p);
      });

      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        this.participantsState.delete(p.identity);
        const audio = this.audioElements.get(p.identity);
        if (audio) {
          audio.pause();
          audio.remove();
          this.audioElements.delete(p.identity);
        }
        this.notify();
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const speakerIds = new Set(speakers.map((s) => s.identity));
        for (const [id, state] of this.participantsState.entries()) {
          state.isSpeaking = speakerIds.has(id);
        }
        this.notify();
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const element = track.attach();
          element.autoplay = true;
          element.setAttribute('playsinline', 'true');
          document.body.appendChild(element);
          this.audioElements.set(participant.identity, element);
          this.updateParticipantAudioVolume(participant.identity);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const audio = this.audioElements.get(participant.identity);
          if (audio) {
            audio.pause();
            audio.remove();
            this.audioElements.delete(participant.identity);
          }
        }
      });

      await room.connect(data.url, data.token);
      await room.localParticipant.setMicrophoneEnabled(false);
      this.isMicEnabled = false;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[VoiceClient] Connection attempt aborted.');
        return;
      }
      console.error('[VoiceClient] Connection failure:', err);
      this.connectionState = 'error';
      this.lastError = err.message || 'Failed to establish voice connection.';
      this.notify();
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
    for (const audio of this.audioElements.values()) {
      audio.pause();
      audio.remove();
    }
    this.audioElements.clear();
    this.participantsState.clear();
  }

  public async disconnect() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    await this.disconnectInternal();
    this.connectionState = 'disconnected';
    this.currentRoomId = null;
    this.isMicEnabled = false;
    this.notify();
  }

  public get isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  public async toggleMicrophone(): Promise<boolean> {
    if (!this.room || !this.isConnected) return false;
    if (this.isDeafened) return false;

    const nextState = !this.isMicEnabled;
    try {
      await this.room.localParticipant.setMicrophoneEnabled(nextState);
      this.isMicEnabled = nextState;
      this.notify();
    } catch (err) {
      console.error('[VoiceClient] Failed to toggle microphone:', err);
    }
    return this.isMicEnabled;
  }

  public async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.room || !this.isConnected) return;
    if (this.isDeafened && enabled) return;

    try {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.isMicEnabled = enabled;
      this.notify();
    } catch (err) {
      console.error('[VoiceClient] Failed to set microphone enabled:', err);
    }
  }

  public setDeafened(deafened: boolean) {
    this.isDeafened = deafened;
    if (deafened && this.isMicEnabled) {
      this.setMicrophoneEnabled(false);
    }
    for (const [id, audio] of this.audioElements.entries()) {
      audio.muted = deafened || this.locallyMutedUsers.has(id);
    }
    this.notify();
  }

  public toggleUserMute(identity: string) {
    if (this.locallyMutedUsers.has(identity)) {
      this.locallyMutedUsers.delete(identity);
    } else {
      this.locallyMutedUsers.add(identity);
    }
    this.updateParticipantAudioVolume(identity);
    this.notify();
  }

  public isUserMutedLocally(identity: string): boolean {
    return this.locallyMutedUsers.has(identity);
  }

  public updateProximityVolumes(
    myPos: { x: number; y: number },
    otherPlayers: { id: string; x: number; y: number }[]
  ) {
    const maxDist = 600; // 600 world pixels hearing radius

    const posMap = new Map<string, { x: number; y: number }>();
    for (const p of otherPlayers) {
      posMap.set(p.id, { x: p.x, y: p.y });
    }

    if (!this.room) return;

    for (const [identity, participant] of this.room.remoteParticipants.entries()) {
      const remotePos = posMap.get(identity);
      const audio = this.audioElements.get(identity);

      let volume = 1.0;
      let dist = 0;

      if (remotePos) {
        dist = Math.hypot(remotePos.x - myPos.x, remotePos.y - myPos.y);
        if (dist > maxDist || this.isDeafened || this.locallyMutedUsers.has(identity)) {
          volume = 0;
        } else {
          volume = Math.max(0, 1 - dist / maxDist);
        }
      } else {
        volume = this.isDeafened || this.locallyMutedUsers.has(identity) ? 0 : 0.5;
      }

      if (audio) {
        audio.volume = volume;
      }

      const state = this.participantsState.get(identity) || {
        identity,
        name: participant.name || identity,
        isSpeaking: participant.isSpeaking,
        isMutedLocally: this.locallyMutedUsers.has(identity),
        volume,
      };
      state.distance = dist;
      state.volume = volume;
      state.isMutedLocally = this.locallyMutedUsers.has(identity);
      this.participantsState.set(identity, state);
    }
  }

  private updateParticipantState(p: Participant) {
    this.participantsState.set(p.identity, {
      identity: p.identity,
      name: p.name || p.identity,
      isSpeaking: p.isSpeaking,
      isMutedLocally: this.locallyMutedUsers.has(p.identity),
      volume: 1.0,
    });
    this.notify();
  }

  private updateParticipantAudioVolume(identity: string) {
    const audio = this.audioElements.get(identity);
    if (audio) {
      const isMuted = this.isDeafened || this.locallyMutedUsers.has(identity);
      audio.muted = isMuted;
    }
  }

  public getStatus() {
    return {
      connectionState: this.connectionState,
      isConnected: this.isConnected,
      isMicEnabled: this.isMicEnabled,
      isDeafened: this.isDeafened,
      lastError: this.lastError,
      httpStatus: this.httpStatus,
      participants: Array.from(this.participantsState.values()),
    };
  }
}

export const voiceManager = new VoiceClientManager();
