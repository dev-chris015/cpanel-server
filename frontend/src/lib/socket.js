import { io } from 'socket.io-client';

/**
 * Instancia singleton de Socket.IO conectada al origen relativo window.location.origin.
 */
let socketInstance = null;

export function getSocket(options = {}) {
  if (!socketInstance) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    socketInstance = io(origin, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      ...options
    });
  }
  return socketInstance;
}

export const socket = typeof window !== 'undefined' ? getSocket() : null;

export default socket;
