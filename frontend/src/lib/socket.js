import { io } from 'socket.io-client';

/**
 * Instancia singleton de Socket.IO conectada al origen relativo window.location.origin.
 */
let socketInstance = null;

/**
 * Obtiene o inicializa la instancia singleton de Socket.IO configurando autenticación con el token almacenado.
 * @param {object} [options={}] - Opciones adicionales de Socket.IO
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket(options = {}) {
  if (!socketInstance) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('cpanel_token') : null;

    socketInstance = io(origin, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: {
        token: token || undefined
      },
      ...options
    });

    socketInstance.reconnect = reconnectSocket;
  }
  return socketInstance;
}

/**
 * Función para reconectar el socket al iniciar o cerrar sesión.
 * Actualiza el objeto de autenticación con el token provisto o el actual de localStorage.
 * @param {string|null} [newToken] - Token explícito (opcional). Si no se pasa, lo lee de localStorage.
 * @returns {import('socket.io-client').Socket}
 */
export function reconnectSocket(newToken = undefined) {
  const token = newToken !== undefined
    ? newToken
    : (typeof localStorage !== 'undefined' ? localStorage.getItem('cpanel_token') : null);

  const instance = getSocket();

  // Actualizar auth en la instancia para los siguientes handshakes
  instance.auth = {
    token: token || undefined
  };

  if (instance.connected) {
    instance.disconnect();
  }

  return instance.connect();
}

/**
 * Cierra la conexión del socket si está conectado.
 */
export function disconnectSocket() {
  if (socketInstance && socketInstance.connected) {
    socketInstance.disconnect();
  }
}

// Desconectar socket y limpiar auth si se detecta sesión inválida (401)
if (typeof window !== 'undefined') {
  window.addEventListener('cpanel:unauthorized', () => {
    if (socketInstance) {
      instanceAuthReset();
    }
  });
}

function instanceAuthReset() {
  if (socketInstance) {
    socketInstance.auth = { token: undefined };
    if (socketInstance.connected) {
      socketInstance.disconnect();
    }
  }
}

export const socket = typeof window !== 'undefined' ? getSocket() : null;

export default socket;
