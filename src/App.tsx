import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DungeonRunView } from './components/DungeonRunView.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { SanctuaryLobby } from './components/SanctuaryLobby.tsx';
import { getApiEndpoint, getWsUrl } from './client/apiConfig.ts';
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
  const [pingMs, setPingMs] = useState<number>(18);

  const latestSnapshotRef = useRef<GameSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const selectedClassRef = useRef<HeroClassId>(selectedClass);
  selectedClassRef.current = selectedClass;

  const sendWs = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
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

    const connect = () => {
      if (disposed) return;
      const wsUrl = getWsUrl(token);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setErrorBanner(null);
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

        if (msg.type === 'lobby:rooms') {
          setRooms(msg.rooms);
          setOnlineCount(msg.onlineCount);
        } else if (msg.type === 'room:joined') {
          activeRoomIdRef.current = msg.roomId;
          setPlayerId(msg.playerId);
          setDungeonMap(msg.map);
          latestSnapshotRef.current = msg.snapshot;
          setSnapshot(msg.snapshot);
          setChatMessages(msg.chat);
          setErrorBanner(null);
          setScreen('PLAYING');
        } else if (msg.type === 'room:map') {
          setDungeonMap(msg.map);
        } else if (msg.type === 'room:tick') {
          latestSnapshotRef.current = msg.snapshot;
          setSnapshot(msg.snapshot);
        } else if (msg.type === 'chat:message') {
          setChatMessages((prev) => {
            if (prev.some((m) => m.id === msg.message.id)) return prev;
            return [...prev.slice(-39), msg.message];
          });
        } else if (msg.type === 'room:left') {
          activeRoomIdRef.current = null;
          latestSnapshotRef.current = null;
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
        } else if (msg.type === 'pong') {
          setPingMs(Math.max(1, Math.round(performance.now() - msg.t)));
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
    };

    connect();

    const pingInterval = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'ping',
            t: performance.now(),
          } satisfies ClientMessage)
        );
      }
    }, 3000);

    return () => {
      disposed = true;
      window.clearInterval(pingInterval);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
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
    (input: PlayerInputState) => {
      sendWs({ type: 'player:input', input });
    },
    [sendWs]
  );

  const handleTriggerAction = useCallback(
    (action: 'tactical' | 'ult' | 'potion' | 'interact', aimAngle: number) => {
      sendWs({ type: 'player:action', action, aimAngle });
    },
    [sendWs]
  );

  const handleSelectRelic = useCallback(
    (relicId: string) => {
      sendWs({ type: 'player:select_relic', relicId });
    },
    [sendWs]
  );

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

  const handleRestartRun = useCallback(() => {
    sendWs({ type: 'room:restart' });
  }, [sendWs]);

  const handleLeaveRoom = useCallback(() => {
    sendWs({ type: 'room:leave' });
  }, [sendWs]);

  if (screen === 'AUTH' || !user) {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }

  if (screen === 'PLAYING' && dungeonMap && snapshot) {
    return (
      <DungeonRunView
        playerId={playerId}
        map={dungeonMap}
        snapshot={snapshot}
        latestSnapshotRef={latestSnapshotRef}
        chatMessages={chatMessages}
        onSendInput={handleSendInput}
        onTriggerAction={handleTriggerAction}
        onSelectRelic={handleSelectRelic}
        onChangeClass={handleChangeClass}
        onSendPing={handleSendPing}
        onSendChat={handleSendChat}
        onRestartRun={handleRestartRun}
        onLeaveRoom={handleLeaveRoom}
        pingMs={pingMs}
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
