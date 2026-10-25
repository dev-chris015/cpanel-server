import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH } from '../config/paths.js';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

/**
 * Socket handler para streaming de logs de contenedores.
 * Permite suscribirse y desuscribirse limpiando el stream subyacente.
 */
export const registerLogsSocket = (io, socket) => {
  // Mapa de streams activos por contenedor en este socket: containerId -> stream
  const activeLogStreams = new Map();

  socket.on('subscribe-logs', async ({ containerId, tail = 100 } = {}) => {
    if (!containerId) {
      socket.emit('logs-error', { error: 'containerId es requerido para suscribirse a logs' });
      return;
    }

    // Si ya había una suscripción previa para este contenedor en este socket, limpiarla primero
    if (activeLogStreams.has(containerId)) {
      const existingStream = activeLogStreams.get(containerId);
      try {
        existingStream.destroy();
      } catch (err) {
        console.error(`Error destruyendo stream previo de logs para ${containerId}:`, err);
      }
      activeLogStreams.delete(containerId);
    }

    try {
      const container = docker.getContainer(containerId);
      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: Number(tail) || 100,
        timestamps: true
      });

      activeLogStreams.set(containerId, logStream);

      logStream.on('data', (chunk) => {
        // En Docker con TTY false cada frame tiene un encabezado de 8 bytes;
        // extraemos el texto omitiendo bytes de control o convirtiendo a utf8.
        const text = chunk.toString('utf8');
        socket.emit(`container-logs:${containerId}`, {
          containerId,
          log: text
        });
      });

      logStream.on('end', () => {
        socket.emit(`container-logs:${containerId}:ended`, { containerId });
        activeLogStreams.delete(containerId);
      });

      logStream.on('error', (err) => {
        socket.emit('logs-error', {
          containerId,
          error: err.message
        });
        activeLogStreams.delete(containerId);
      });
    } catch (error) {
      console.error(`Error al iniciar stream de logs para ${containerId}:`, error);
      socket.emit('logs-error', {
        containerId,
        error: error.message
      });
    }
  });

  const unsubscribe = (containerId) => {
    if (!containerId) return;
    const stream = activeLogStreams.get(containerId);
    if (stream) {
      try {
        stream.destroy();
      } catch (err) {
        console.error(`Error destruyendo stream de logs para ${containerId}:`, err);
      }
      activeLogStreams.delete(containerId);
      socket.emit(`container-logs:${containerId}:stopped`, { containerId });
    }
  };

  socket.on('unsubscribe-logs', ({ containerId } = {}) => {
    unsubscribe(containerId);
  });

  socket.on('disconnect', () => {
    for (const [containerId, stream] of activeLogStreams.entries()) {
      try {
        stream.destroy();
      } catch (err) {
        console.error(`Error cerrando stream en disconnect para ${containerId}:`, err);
      }
    }
    activeLogStreams.clear();
  });
};

export default registerLogsSocket;
