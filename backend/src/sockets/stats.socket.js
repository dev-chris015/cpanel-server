import { getSystemTelemetry } from '../services/system.service.js';

let statsInterval = null;
let activeClients = 0;

/**
 * Socket handler para estadísticas globales del sistema.
 * Emite periódicamente cada 2s CPU y RAM general del servidor.
 */
export const registerStatsSocket = (io, socket) => {
  activeClients++;

  // Iniciar el intervalo global solo si es el primer cliente conectado
  if (!statsInterval) {
    statsInterval = setInterval(async () => {
      try {
        const telemetry = await getSystemTelemetry();
        io.emit('server-stats', {
          cpu: {
            currentLoadPercent: telemetry.cpu.currentLoadPercent,
            coresLoad: telemetry.cpu.coresLoad,
            cores: telemetry.cpu.cores
          },
          memory: {
            totalBytes: telemetry.memory.totalBytes,
            usedBytes: telemetry.memory.usedBytes,
            freeBytes: telemetry.memory.freeBytes,
            availableBytes: telemetry.memory.availableBytes,
            usedPercent: telemetry.memory.usedPercent,
            totalGb: telemetry.memory.totalGb,
            usedGb: telemetry.memory.usedGb
          },
          timestamp: telemetry.timestamp
        });
      } catch (error) {
        console.error('Error emitiendo stats periódicos:', error.message);
      }
    }, 2000);
  }

  // Enviar inmediatamente una primera muestra al cliente recién conectado
  getSystemTelemetry()
    .then(telemetry => {
      socket.emit('server-stats', {
        cpu: {
          currentLoadPercent: telemetry.cpu.currentLoadPercent,
          coresLoad: telemetry.cpu.coresLoad,
          cores: telemetry.cpu.cores
        },
        memory: {
          totalBytes: telemetry.memory.totalBytes,
          usedBytes: telemetry.memory.usedBytes,
          freeBytes: telemetry.memory.freeBytes,
          availableBytes: telemetry.memory.availableBytes,
          usedPercent: telemetry.memory.usedPercent,
          totalGb: telemetry.memory.totalGb,
          usedGb: telemetry.memory.usedGb
        },
        timestamp: telemetry.timestamp
      });
    })
    .catch(() => {});

  socket.on('disconnect', () => {
    activeClients--;
    if (activeClients <= 0) {
      activeClients = 0;
      if (statsInterval) {
        clearInterval(statsInterval);
        statsInterval = null;
      }
    }
  });
};

export default registerStatsSocket;
