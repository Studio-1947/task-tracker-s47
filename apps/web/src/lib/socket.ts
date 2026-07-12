import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

/**
 * Singleton Socket.IO client for the chat namespace. Connects same-origin (the
 * Vite dev proxy / prod nginx upgrade `/socket.io`), authenticating with the
 * in-memory access token — re-read on every (re)connect so a refreshed token is
 * always used. The server verifies it on handshake (see ChatGateway).
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/chat', {
      autoConnect: false,
      // `auth` as a function is evaluated on each connection attempt → fresh token.
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

/** Emit an event and resolve with the server ack (or reject on failure/timeout). */
export function emitAck<T = unknown>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) {
      reject(new Error('not-connected'));
      return;
    }
    s.timeout(timeoutMs).emit(event, payload, (err: unknown, res: T) => {
      if (err) reject(new Error('timeout'));
      else resolve(res);
    });
  });
}
