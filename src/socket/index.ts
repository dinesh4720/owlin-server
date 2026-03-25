import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { getEnv } from '../config/env.js';

let _io: SocketServer | null = null;

export function setupSocket(httpServer: HttpServer): SocketServer {
  const env = getEnv();
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim());

  _io = new SocketServer(httpServer, {
    cors: {
      origin: origins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60_000,
    pingInterval: 25_000,
  });

  _io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    socket.on('subscribe:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('unsubscribe:project', (projectId: string) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Socket.IO ready');
  return _io;
}

export function getIO(): SocketServer {
  if (!_io) throw new Error('Socket.IO not initialized');
  return _io;
}

/** Broadcast a new event to all connected dashboards. */
export function broadcastEvent(projectId: string, event: any): void {
  if (!_io) return;
  _io.to(`project:${projectId}`).emit('event:new', event);
  _io.emit('event:new', event); // Also broadcast globally for admin dashboard
}

/** Broadcast a batch of events. */
export function broadcastBatch(projectId: string, events: any[]): void {
  if (!_io) return;
  _io.to(`project:${projectId}`).emit('events:batch', events);
  _io.emit('events:batch', events);
}

/** Broadcast a new error incident. */
export function broadcastError(projectId: string, error: any): void {
  if (!_io) return;
  _io.to(`project:${projectId}`).emit('error:new', error);
  _io.emit('error:new', error);
}

/** Broadcast session events. */
export function broadcastSession(projectId: string, type: 'started' | 'ended', session: any): void {
  if (!_io) return;
  _io.to(`project:${projectId}`).emit(`session:${type}`, session);
  _io.emit(`session:${type}`, session);
}
