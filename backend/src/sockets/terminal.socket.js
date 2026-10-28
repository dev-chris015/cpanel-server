import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH } from '../config/paths.js';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

/**
 * Socket handler para sesiones de terminal interactiva Xterm con TTY hijack.
 * Garantiza destrucción limpia y segura de streams y procesos en desconexión.
 * 
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
export const registerTerminalSocket = (io, socket) => {
  // Mapa de sesiones activas en este socket: sessionId -> { exec, stream, containerId, active }
  const activeSessions = new Map();

  /**
   * Destruye de forma limpia y segura una sesión interactiva y sus flujos asociados.
   * 
   * @param {string} sessionId
   */
  const cleanUpSession = (sessionId) => {
    if (!sessionId || !activeSessions.has(sessionId)) return;

    const session = activeSessions.get(sessionId);
    session.active = false;

    if (session.stream) {
      try {
        session.stream.removeAllListeners();
        // Enviar EOF y destruir socket TCP / TTY hijacked stream
        if (!session.stream.destroyed) {
          session.stream.end();
          session.stream.destroy();
        }
      } catch (err) {
        console.error(`Error al destruir stream de terminal (${sessionId}):`, err.message);
      }
    }

    activeSessions.delete(sessionId);
    socket.emit('terminal:closed', { sessionId, containerId: session.containerId });
  };

  /**
   * Inicializar sesión interactiva de terminal en un contenedor Docker con TTY Hijack.
   * Eventos admitidos: 'terminal:init' y 'terminal-init'
   */
  const handleTerminalInit = async ({
    containerId,
    cols = 80,
    rows = 24,
    shell
  } = {}) => {
    if (!containerId) {
      socket.emit('terminal:error', { error: 'containerId es requerido para iniciar la terminal' });
      return;
    }

    const sessionId = `${socket.id}:${containerId}`;

    // Si ya existía una sesión previa para este contenedor en este socket, limpiarla primero
    if (activeSessions.has(sessionId)) {
      cleanUpSession(sessionId);
    }

    try {
      const container = docker.getContainer(containerId);
      const inspectData = await container.inspect();

      if (!inspectData.State || !inspectData.State.Running) {
        socket.emit('terminal:error', {
          containerId,
          error: `El contenedor ${inspectData.Name || containerId} no está en ejecución (Estado: ${inspectData.State?.Status || 'detenido'}).`
        });
        return;
      }

      // Detectar shell preferido o intentar /bin/sh
      const targetShell = shell || '/bin/sh';

      // 1. Crear Exec con TTY y Stdin adjunto para sesión interactiva completa
      const exec = await container.exec({
        Cmd: [targetShell],
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true
      });

      // 2. Iniciar exec con Hijack activado (TTY Hijack)
      const stream = await exec.start({
        hijack: true,
        stdin: true
      });

      // Registrar sesión activa
      const session = {
        exec,
        stream,
        containerId,
        sessionId,
        active: true
      };
      activeSessions.set(sessionId, session);

      // 3. Ajustar tamaño inicial de la PTY (rows & cols)
      try {
        await exec.resize({
          w: parseInt(cols, 10) || 80,
          h: parseInt(rows, 10) || 24
        });
      } catch (resizeErr) {
        // Ignorar fallo no crítico de resize inicial
      }

      // 4. Conectar flujo de salida (TTY hijack output) al cliente Xterm mediante WebSockets
      stream.on('data', (chunk) => {
        if (!session.active) return;
        const text = chunk.toString('utf8');
        socket.emit('terminal:data', text);
        socket.emit(`terminal:data:${containerId}`, text);
      });

      stream.on('end', () => {
        socket.emit('terminal:exit', {
          containerId,
          sessionId,
          message: 'La sesión interactiva ha finalizado'
        });
        cleanUpSession(sessionId);
      });

      stream.on('error', (err) => {
        console.error(`Error en stream TTY de ${containerId}:`, err.message);
        socket.emit('terminal:error', {
          containerId,
          sessionId,
          error: err.message
        });
        cleanUpSession(sessionId);
      });

      // Confirmar al cliente que la terminal interactiva está lista
      socket.emit('terminal:ready', {
        containerId,
        sessionId,
        cols,
        rows
      });

    } catch (error) {
      console.error(`Error iniciando sesión interactiva en contenedor ${containerId}:`, error);
      socket.emit('terminal:error', {
        containerId,
        error: error.message || 'Fallo al iniciar sesión TTY interactiva'
      });
      cleanUpSession(sessionId);
    }
  };

  socket.on('terminal:init', handleTerminalInit);
  socket.on('terminal-init', handleTerminalInit);

  /**
   * Entrada de usuario hacia la PTY (teclas, comandos, secuencias de escape).
   * Eventos admitidos: 'terminal:input' y 'terminal-input'
   */
  const handleTerminalInput = (data, payloadContainerId) => {
    // Si data es un objeto con estructura { data, containerId }
    let rawInput = data;
    let targetContainerId = payloadContainerId;

    if (typeof data === 'object' && data !== null) {
      rawInput = data.data ?? data.input ?? '';
      targetContainerId = data.containerId || payloadContainerId;
    }

    if (targetContainerId) {
      const sessionId = `${socket.id}:${targetContainerId}`;
      const session = activeSessions.get(sessionId);
      if (session && session.active && session.stream && !session.stream.destroyed) {
        session.stream.write(rawInput);
        return;
      }
    }

    // Si no se especificó containerId, enviar a la primera sesión activa del socket
    for (const session of activeSessions.values()) {
      if (session.active && session.stream && !session.stream.destroyed) {
        session.stream.write(rawInput);
        break;
      }
    }
  };

  socket.on('terminal:input', handleTerminalInput);
  socket.on('terminal-input', handleTerminalInput);
  socket.on('terminal:write', handleTerminalInput);

  /**
   * Redimensión de la ventana de la PTY (FitAddon de Xterm).
   * Eventos admitidos: 'terminal:resize' y 'terminal-resize'
   */
  const handleTerminalResize = ({ containerId, cols, rows, w, h } = {}) => {
    const width = parseInt(cols || w, 10);
    const height = parseInt(rows || h, 10);

    if (!width || !height) return;

    if (containerId) {
      const sessionId = `${socket.id}:${containerId}`;
      const session = activeSessions.get(sessionId);
      if (session && session.exec) {
        session.exec.resize({ w: width, h: height }).catch(() => {});
        return;
      }
    }

    // Redimensionar todas las sesiones activas del socket si no se especificó containerId
    for (const session of activeSessions.values()) {
      if (session.exec) {
        session.exec.resize({ w: width, h: height }).catch(() => {});
      }
    }
  };

  socket.on('terminal:resize', handleTerminalResize);
  socket.on('terminal-resize', handleTerminalResize);

  /**
   * Cierre voluntario de sesión de terminal por parte del cliente.
   */
  const handleTerminalClose = ({ containerId, sessionId } = {}) => {
    if (sessionId) {
      cleanUpSession(sessionId);
    } else if (containerId) {
      cleanUpSession(`${socket.id}:${containerId}`);
    } else {
      for (const key of activeSessions.keys()) {
        cleanUpSession(key);
      }
    }
  };

  socket.on('terminal:close', handleTerminalClose);
  socket.on('terminal-close', handleTerminalClose);
  socket.on('terminal:destroy', handleTerminalClose);

  /**
   * DESTRUCCIÓN LIMPIA EN DESCONEXIÓN:
   * Al desconectarse el socket, se destruyen todos los streams TTY hijacked y se limpian recursos.
   */
  socket.on('disconnect', () => {
    for (const [sessionId, session] of activeSessions.entries()) {
      try {
        if (session.stream) {
          session.stream.removeAllListeners();
          if (!session.stream.destroyed) {
            session.stream.end();
            session.stream.destroy();
          }
        }
      } catch (err) {
        console.error(`Error al limpiar sesión ${sessionId} en disconnect:`, err.message);
      }
    }
    activeSessions.clear();
  });
};

export default registerTerminalSocket;
