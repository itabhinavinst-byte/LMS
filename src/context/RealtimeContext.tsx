import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';

type RealtimeHandler = (event: { type: string; meta?: Record<string, unknown>; timestamp?: string }) => void;

interface RealtimeContextValue {
  subscribe: (eventTypes: string[], handler: RealtimeHandler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const listenersRef = useRef<Set<{ types: string[]; handler: RealtimeHandler }>>(new Set());

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(String(evt.data));
          if (!parsed || typeof parsed.type !== 'string') return;
          listenersRef.current.forEach((entry) => {
            if (entry.types.includes('*') || entry.types.includes(parsed.type)) {
              entry.handler(parsed);
            }
          });
        } catch {
          // Ignore invalid payloads
        }
      };

      ws.onclose = () => {
        if (!closed) scheduleReconnect();
      };

      ws.onerror = () => {
        // Error leads to onclose reconnect
      };
    };

    const scheduleReconnect = () => {
      attempt += 1;
      const delay = Math.min(15000, 1000 * Math.pow(1.6, attempt));
      reconnectTimer = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const subscribe = useCallback((eventTypes: string[], handler: RealtimeHandler) => {
    const entry = { types: eventTypes, handler };
    listenersRef.current.add(entry);
    return () => {
      listenersRef.current.delete(entry);
    };
  }, []);

  return <RealtimeContext.Provider value={{ subscribe }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(eventTypes: string[], handler: RealtimeHandler) {
  const ctx = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const key = eventTypes.join(',');

  useEffect(() => {
    if (!ctx) return;
    const types = key.split(',').filter(Boolean);
    return ctx.subscribe(types, (evt) => handlerRef.current(evt));
  }, [ctx, key]);
}
