import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DungeonRunView } from './components/DungeonRunView.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { PartyLobbyView } from './components/PartyLobbyView.tsx';
import { SanctuaryLobby } from './components/SanctuaryLobby.tsx';
import { getApiEndpoint, getWsUrl } from './client/apiConfig.ts';
import {
  buildLobbyRoomsKey,
  buildSnapshotHudKey,
  CLIENT_PING_INTERVAL_ACTIVE_MS,
  CLIENT_WS_BACKPRESSURE_LIMIT_BYTES,
  HUD_MAX_STALE_MS,
  PingTracker,
  ReliableInputDispatcher,
  type PingDiagnostics,
} from './client/networkStats.ts';
import { applySnapshotDelta } from './shared/snapshotDelta.ts';
import type {
  ChatMessage,
  ClientMessage,
  DifficultyTier,
  DungeonMap,
  GameSnapshot,
  HeroClassId,
  PlayerInputState,
  RoomSummary,
  ServerMessage,
  UserProfile,
} from './shared/types.ts';

type ScreenState = 'AUTH' | 'LOBBY' | 'PLAYING';

const SESSION_TOKEN_KEY = 'beyond_session_token';
const ACTIVE_ROOM_KEY = 'beyond_active_room_id';

function saveActiveRoomId(roomId: string | null): void {
  try {
    if (roomId && roomId !== 'TAVERN-HUB') {
      sessionStorage.setItem(ACTIVE_ROOM_KEY, roomId);
    } else {
      sessionStorage.removeItem(ACTIVE_ROOM_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function loadSavedActiveRoomId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_ROOM_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<UserProfile | null>(null);
  const [screen, setScreen] = useState<ScreenState>('AUTH');
  const [selectedClass, setSelectedClass] = useState<HeroClassId>('vanguard');

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [playerId, setPlayerId] = useState<string>('');
  const [dungeonMap, setDungeonMap] = useState<DungeonMap | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const pingTrackerRef = useRef<PingTracker>(new PingTracker(10));
  const [pingDiagnostics, setPingDiagnostics] = useState<PingDiagnostics>(() =>
    pingTrackerRef.current.getDiagnostics()
  );

  const latestSnapshotRef = useRef<GameSnapshot | null>(null);
  const snapshotSeqRef = useRef<number>(0);
  const lastResyncRequestAtRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomIdRef = useRef<string | null>(loadSavedActiveRoomId());
  const activePlayerIdRef = useRef<string>('');
  const dungeonMapRef = useRef<DungeonMap | null>(null);
  const lastHudKeyRef = useRef<string>('');
  const lastHudSyncAtRef = useRef<number>(0);
  const lastLobbyKeyRef = useRef<string>('');
  const inputDispatcherRef = useRef<ReliableInputDispatcher>(new ReliableInputDispatcher());
  const latestInputSeqRef = useRef<number>(0);
  const pingMsRef = useRef<number>(pingDiagnostics.pingMs);
  const screenRef = useRef<ScreenState>(screen);
  screenRef.current = screen;
  const inputFlushTimerRef = useRef<number | null>(null);
  const selectedClassRef = useRef<HeroClassId>(selectedClass);
  selectedClassRef.current = selectedClass;

  const sendWs = useCallback((msg: ClientMessage): boolean => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    if (
      (msg.type === 'player:input' || msg.type === 'ping') &&
      ws.bufferedAmount > CLIENT_WS_BACKPRESSURE_LIMIT_BYTES
    ) {
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }, []);

  // Restore session if token exists in sessionStorage
  useEffect(() => {
    if (!token || user) return;
    let cancelled = false;
    fetch(getApiEndpoint('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Invalid session');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setSelectedClass(data.user.preferredClass || 'vanguard');
        setScreen('LOBBY');
      })
      .catch(() => {
        if (cancelled) return;
        try {
          sessionStorage.removeItem(SESSION_TOKEN_KEY);
        } catch {
          // ignore
        }
        setToken(null);
        setScreen('AUTH');
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  // Connect & auto-reconnect WebSocket whenever authenticated
  useEffect(() => {
    if (!token || !user) return;

    let disposed = false;
    let reconnectTimer: number | undefined;
    pingTrackerRef.current.reset();

    const sendPingProbe = () => {
      const ws = wsRef.current;
      if (
        ws &&
        ws.readyState === WebSocket.OPEN &&
        ws.bufferedAmount <= CLIENT_WS_BACKPRESSURE_LIMIT_BYTES
      ) {
        ws.send(
          JSON.stringify({
            type: 'ping',
            t: performance.now(),
          } satisfies ClientMessage)
        );
      }
    };

    const connect = () => {
      if (disposed) return;
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl, [token]);
      wsRef.current = ws;

      ws.onopen = () => {
        setErrorBanner(null);
        sendPingProbe();
        if (activeRoomIdRef.current) {
          // Rejoin active room seamlessly on reconnect
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomId: activeRoomIdRef.current,
              heroClass: selectedClassRef.current,
            } satisfies ClientMessage)
          );
        } else {
          ws.send(
            JSON.stringify({ type: 'lobby:subscribe' } satisfies ClientMessage)
          );
        }
      };

      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }

        const applyIncomingSnapshot = (nextSnap: GameSnapshot) => {
          // Canvas always consumes latest 40Hz snapshot via ref with zero React re-render overhead
          latestSnapshotRef.current = nextSnap;
          const now = performance.now();
          const nextHudKey = buildSnapshotHudKey(
            nextSnap,
            activePlayerIdRef.current,
            dungeonMapRef.current
          );
          if (
            nextHudKey !== lastHudKeyRef.current ||
            now - lastHudSyncAtRef.current >= HUD_MAX_STALE_MS
          ) {
            lastHudKeyRef.current = nextHudKey;
            lastHudSyncAtRef.current = now;
            setSnapshot(nextSnap);
          }
        };

        if (msg.type === 'lobby:rooms') {
          const lobbyKey = buildLobbyRoomsKey(msg.rooms, msg.onlineCount);
          if (lobbyKey !== lastLobbyKeyRef.current) {
            lastLobbyKeyRef.current = lobbyKey;
            setRooms(msg.rooms);
            setOnlineCount(msg.onlineCount);
          }
        } else if (msg.type === 'room:joined') {
          activeRoomIdRef.current = msg.roomId;
          saveActiveRoomId(msg.roomId);
          activePlayerIdRef.current = msg.playerId;
          dungeonMapRef.current = msg.map;
          snapshotSeqRef.current = 0;
          lastResyncRequestAtRef.current = 0;
          lastHudKeyRef.current = buildSnapshotHudKey(msg.snapshot, msg.playerId, msg.map);
          lastHudSyncAtRef.current = performance.now();
          inputDispatcherRef.current.reset();
          latestInputSeqRef.current = 0;
          if (inputFlushTimerRef.current !== null) {
            window.clearTimeout(inputFlushTimerRef.current);
            inputFlushTimerRef.current = null;
          }
          setPlayerId(msg.playerId);
          setDungeonMap(msg.map);
          latestSnapshotRef.current = msg.snapshot;
          setSnapshot(msg.snapshot);
          setChatMessages(msg.chat);
          setErrorBanner(null);
          setScreen('PLAYING');
          sendPingProbe();
        } else if (msg.type === 'room:map') {
          dungeonMapRef.current = msg.map;
          snapshotSeqRef.current = 0;
          lastResyncRequestAtRef.current = 0;
          lastHudKeyRef.current = '';
          setDungeonMap(msg.map);
        } else if (msg.type === 'room:tick') {
          snapshotSeqRef.current = typeof msg.seq === 'number' ? msg.seq : 0;
          lastResyncRequestAtRef.current = 0;
          applyIncomingSnapshot(msg.snapshot);
        } else if (msg.type === 'room:delta') {
          const prevSnap = latestSnapshotRef.current;
          if (
            prevSnap &&
            snapshotSeqRef.current > 0 &&
            msg.delta.baseSeq === snapshotSeqRef.current
          ) {
            const reconstructed = applySnapshotDelta(prevSnap, msg.delta);
            snapshotSeqRef.current = msg.delta.seq;
            applyIncomingSnapshot(reconstructed);
          } else {
            const now = performance.now();
            if (
              snapshotSeqRef.current > 0 &&
              now - lastResyncRequestAtRef.current > 180
            ) {
              lastResyncRequestAtRef.current = now;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'room:resync' } satisfies ClientMessage));
              }
            }
          }
        } else if (msg.type === 'chat:message') {
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === msg.message.id)) return prev;
            return [...prev.slice(-39), msg.message];
          });
        } else if (msg.type === 'room:left') {
          activeRoomIdRef.current = null;
          saveActiveRoomId(null);
          activePlayerIdRef.current = '';
          dungeonMapRef.current = null;
          snapshotSeqRef.current = 0;
          lastResyncRequestAtRef.current = 0;
          lastHudKeyRef.current = '';
          latestSnapshotRef.current = null;
          inputDispatcherRef.current.reset();
          latestInputSeqRef.current = 0;
          if (inputFlushTimerRef.current !== null) {
            window.clearTimeout(inputFlushTimerRef.current);
            inputFlushTimerRef.current = null;
          }
          setSnapshot(null);
          setDungeonMap(null);
          setScreen('LOBBY');
          // Refresh user career stats
          fetch(getApiEndpoint('/api/auth/me'), {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => {
              if (d?.user) setUser(d.user);
            })
            .catch(() => {});
        } else if (msg.type === 'error') {
          setErrorBanner(msg.message);
          if (
            msg.message.includes('was not found or has closed') &&
            screenRef.current !== 'PLAYING'
          ) {
            activeRoomIdRef.current = null;
            saveActiveRoomId(null);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'lobby:subscribe' } satisfies ClientMessage));
            }
          }
        } else if (msg.type === 'pong') {
          const rtt = performance.now() - msg.t;
          if (Number.isFinite(rtt) && rtt >= 0 && rtt < 15000) {
            const diag = pingTrackerRef.current.recordSample(rtt, msg.tickMs);
            pingMsRef.current = diag.pingMs;
            setPingDiagnostics(diag);
          }
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();

    let pingCycle = 0;
    const pingInterval = window.setInterval(() => {
      pingCycle++;
      if (screenRef.current === 'PLAYING' || pingCycle % 2 === 0) {
        sendPingProbe();
      }
    }, CLIENT_PING_INTERVAL_ACTIVE_MS);

    return () => {
      disposed = true;
      window.clearInterval(pingInterval);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (inputFlushTimerRef.current !== null) {
        window.clearTimeout(inputFlushTimerRef.current);
        inputFlushTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token, user?.id]);

  const handleAuthenticated = (newToken: string, profile: UserProfile) => {
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, newToken);
    } catch {
      // ignore
    }
    setToken(newToken);
    setUser(profile);
    setSelectedClass(profile.preferredClass || 'vanguard');
    setScreen('LOBBY');
  };

  const handleLogout = () => {
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      // ignore
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    activeRoomIdRef.current = null;
    saveActiveRoomId(null);
    setToken(null);
    setUser(null);
    setScreen('AUTH');
  };

  const handleCreateRoom = useCallback(
    (opts: {
      name: string;
      difficulty: DifficultyTier;
      seed?: number;
      heroClass: HeroClassId;
    }) => {
      setErrorBanner(null);
      sendWs({
        type: 'room:create',
        ...opts,
      });
    },
    [sendWs]
  );

  const handleJoinRoom = useCallback(
    (roomId: string, heroClass: HeroClassId) => {
      setErrorBanner(null);
      sendWs({
        type: 'room:join',
        roomId,
        heroClass,
      });
    },
    [sendWs]
  );

  const handleSendInput = useCallback(
    (rawInput: PlayerInputState) => {
      const scheduleFlush = (delayMs: number) => {
        if (inputFlushTimerRef.current !== null) return;
        inputFlushTimerRef.current = window.setTimeout(function retryFlush() {
          inputFlushTimerRef.current = null;
          const flushRes = inputDispatcherRef.current.flushPending(performance.now(), (pkt) => {
            const ok = sendWs(pkt);
            if (ok) {
              latestInputSeqRef.current = pkt.seq;
            }
            return ok;
          });
          if (!flushRes.sent && flushRes.retryDelayMs !== undefined) {
            inputFlushTimerRef.current = window.setTimeout(retryFlush, flushRes.retryDelayMs);
          }
        }, delayMs);
      };

      const res = inputDispatcherRef.current.submit(rawInput, performance.now(), (pkt) => {
        const ok = sendWs(pkt);
        if (ok) {
          latestInputSeqRef.current = pkt.seq;
        }
        return ok;
      });

      if (res.status === 'sent') {
        if (inputFlushTimerRef.current !== null) {
          window.clearTimeout(inputFlushTimerRef.current);
          inputFlushTimerRef.current = null;
        }
      } else if (res.retryDelayMs !== undefined) {
        scheduleFlush(res.retryDelayMs);
      }
    },
    [sendWs]
  );

  const handleTriggerAction = useCallback(
    (
      action: 'tactical' | 'ult' | 'potion' | 'interact' | 'dash',
      aimAngle: number,
      opts?: { aimDistance?: number; explicitAim?: boolean }
    ) => {
      sendWs({
        type: 'player:action',
        action,
        aimAngle,
        ...(opts?.aimDistance !== undefined ? { aimDistance: opts.aimDistance } : {}),
        ...(opts?.explicitAim ? { explicitAim: true } : {}),
      });
    },
    [sendWs]
  );

  const handleSelectRelic = useCallback(
    (relicId: string) => {
      sendWs({ type: 'player:select_relic', relicId });
    },
    [sendWs]
  );

  const handleCloseChest = useCallback(() => {
    sendWs({ type: 'player:close_chest' });
  }, [sendWs]);

  const handleChangeClass = useCallback(
    (heroClass: HeroClassId) => {
      setSelectedClass(heroClass);
      sendWs({ type: 'player:change_class', heroClass });
    },
    [sendWs]
  );

  const handleSendPing = useCallback(
    (label: string, x: number, y: number) => {
      sendWs({ type: 'player:ping', label, x, y });
    },
    [sendWs]
  );

  const handleSendChat = useCallback(
    (text: string) => {
      sendWs({ type: 'chat:send', text });
    },
    [sendWs]
  );

  const handleStartExpedition = useCallback(() => {
    setErrorBanner(null);
    sendWs({ type: 'room:start' });
  }, [sendWs]);

  const handleToggleReady = useCallback(
    (ready?: boolean) => {
      setErrorBanner(null);
      sendWs({
        type: 'room:set_ready',
        ...(ready !== undefined ? { ready } : {}),
      });
    },
    [sendWs]
  );

  const handleReturnToPartyLobby = useCallback(() => {
    setErrorBanner(null);
    sendWs({ type: 'room:return_to_lobby' });
  }, [sendWs]);

  const handleRestartRun = useCallback(() => {
    setErrorBanner(null);
    sendWs({ type: 'room:restart' });
  }, [sendWs]);

  const handleLeaveRoom = useCallback(() => {
    setErrorBanner(null);
    sendWs({ type: 'room:leave' });
  }, [sendWs]);

  const handleDismissError = useCallback(() => {
    setErrorBanner(null);
  }, []);

  if (screen === 'AUTH' || !user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  if (screen === 'PLAYING' && dungeonMap && snapshot) {
    if (snapshot.roomId !== 'TAVERN-HUB' && snapshot.status === 'waiting') {
      return (
        <PartyLobbyView
          playerId={playerId}
          snapshot={snapshot}
          chatMessages={chatMessages}
          errorBanner={errorBanner}
          onDismissError={handleDismissError}
          onStartExpedition={handleStartExpedition}
          onToggleReady={handleToggleReady}
          onLeaveRoom={handleLeaveRoom}
          onReturnToTavern={() => handleJoinRoom('TAVERN-HUB', selectedClass)}
          onSendChat={handleSendChat}
          onSendCommand={sendWs}
        />
      );
    }

    return (
      <DungeonRunView
        authToken={token || ''}
        playerId={playerId}
        map={dungeonMap}
        snapshot={snapshot}
        latestSnapshotRef={latestSnapshotRef}
        chatMessages={chatMessages}
        onSendInput={handleSendInput}
        onTriggerAction={handleTriggerAction}
        onSelectRelic={handleSelectRelic}
        onCloseChest={handleCloseChest}
        onChangeClass={handleChangeClass}
        onSendPing={handleSendPing}
        onSendChat={handleSendChat}
        onRestartRun={handleRestartRun}
        onLeaveRoom={handleLeaveRoom}
        onReturnToPartyLobby={handleReturnToPartyLobby}
        onSendAdminCommand={sendWs}
        pingMs={pingDiagnostics.pingMs}
        pingDiagnostics={pingDiagnostics}
        latestInputSeqRef={latestInputSeqRef}
        pingMsRef={pingMsRef}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        onReturnToTavern={() => handleJoinRoom('TAVERN-HUB', selectedClass)}
        errorBanner={errorBanner}
        onDismissError={handleDismissError}
        rooms={rooms}
      />
    );
  }

  return (
    <SanctuaryLobby
      user={user}
      rooms={rooms}
      onlineCount={onlineCount}
      selectedClass={selectedClass}
      onSelectClass={setSelectedClass}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onLogout={handleLogout}
      errorBanner={errorBanner}
    />
  );
}

export default App;
