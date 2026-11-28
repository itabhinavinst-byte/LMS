import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

let wss: WebSocketServer | null = null;

export type RealtimeEventType =
  | 'settings:updated'
  | 'courses:changed'
  | 'applications:changed'
  | 'enrollments:changed'
  | 'students:changed'
  | 'resources:changed'
  | 'modules:changed'
  | 'assignments:changed'
  | 'announcements:changed'
  | 'meetings:changed'
  | 'notifications:new'
  | 'emails:changed'
  | 'inquiries:changed'
  | 'stats:updated';

export function initRealtimeServer(httpServer: HttpServer): void {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'connected',
        timestamp: new Date().toISOString(),
      })
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg && msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        }
      } catch {
        // Ignore malformed client frames
      }
    });
  });

  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, 30000);

  wss.on('close', () => clearInterval(interval));
}

export function broadcastEvent(type: RealtimeEventType, meta?: Record<string, unknown>): void {
  if (!wss) return;
  const payload = JSON.stringify({
    type,
    meta: meta || {},
    timestamp: new Date().toISOString(),
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}
