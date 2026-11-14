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

export class VoiceClientManager {
  private room: Room | null = null;
  private currentRoomId: string | null = null;
  private isConnected = false;
  private isMicEnabled = false;
  private isDeafened = false;
  private locallyMutedUsers = new Set<string>();
  private listeners: (() => void)[] = [];
  private participantsState = new Map<string, VoiceParticipantState>();
  private audioElements = new Map<string, HTMLAudioElement>();

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
    if (this.isConnected && this.currentRoomId === roomId) return;
    await this.disconnect();

    this.currentRoomId = roomId;

    try {
      const res = await fetch(getApiEndpoint('/api/voice/token'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenAuthHeader ? { Authorization: tokenAuthHeader } : {}),
        },
        body: JSON.stringify({ roomId }),
      });

      if (!res.ok) {
        console.warn('Voice chat token request failed or LiveKit not configured.');
        return;
      }

      const data = (await res.json()) as { token: string; url: string };
      if (!data || !data.token || !data.url) return;

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
        this.isConnected = true;
        this.notify();
      });

      room.on(RoomEvent.Disconnected, () => {
        this.isConnected = false;
        this.currentRoomId = null;
        this.notify();
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
      this.notify();
    } catch (err) {
      console.error('Failed to connect to LiveKit voice room:', err);
      this.isConnected = false;
      this.currentRoomId = null;
      this.notify();
    }
  }

  public async disconnect() {
    if (this.room) {
      try {
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
    this.isConnected = false;
    this.currentRoomId = null;
    this.isMicEnabled = false;
    this.notify();
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
      console.error('Failed to toggle microphone:', err);
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
      console.error('Failed to set microphone enabled:', err);
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
      isConnected: this.isConnected,
      isMicEnabled: this.isMicEnabled,
      isDeafened: this.isDeafened,
      participants: Array.from(this.participantsState.values()),
    };
  }
}

export const voiceManager = new VoiceClientManager();
