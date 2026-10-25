import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH } from '../config/paths.js';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

/**
 * Calcula métricas en tiempo real de un contenedor a partir de su stream de estadísticas:
 * - CPU estándar: (delta_cpu / delta_system) * cpus * 100
 * - RAM usada: (usage - cache), límite y porcentaje
 * - Network I/O acumulado: rx_bytes, tx_bytes
 */
const calculateContainerMetrics = (stats) => {
  if (!stats || !stats.cpu_stats || !stats.precpu_stats) {
    return null;
  }

  // 1. Cálculo de CPU
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (stats.cpu_stats.system_cpu_usage || 0) - (stats.precpu_stats.system_cpu_usage || 0);
  const onlineCpus = stats.cpu_stats.online_cpus || 
    (stats.cpu_stats.cpu_usage.percpu_usage ? stats.cpu_stats.cpu_usage.percpu_usage.length : 1);

  let cpuPercent = 0.0;
  if (systemDelta > 0 && cpuDelta > 0) {
    cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100.0;
  }
  cpuPercent = Math.round(cpuPercent * 100) / 100;

  // 2. Cálculo de Memoria RAM
  // En cgroups v1 cache está en stats.memory_stats.stats.cache
  // En cgroups v2 cache/inactive_file está en stats.memory_stats.stats.inactive_file
  const memStats = stats.memory_stats || {};
  const memUsage = memStats.usage || 0;
  const memDetails = memStats.stats || {};
  const cache = memDetails.cache || memDetails.inactive_file || 0;
  
  const usedMemory = Math.max(0, memUsage - cache);
  const memoryLimit = memStats.limit || 0;
  const memoryPercent = memoryLimit > 0 
    ? Math.round((usedMemory / memoryLimit) * 10000) / 100 
    : 0;

  // 3. Network I/O acumulado (sumar todas las interfaces eth0, etc.)
  let rxBytes = 0;
  let txBytes = 0;
  if (stats.networks) {
    for (const net of Object.values(stats.networks)) {
      rxBytes += net.rx_bytes || 0;
      txBytes += net.tx_bytes || 0;
    }
  }

  return {
    cpu: {
      percent: cpuPercent,
      onlineCpus
    },
    memory: {
      usedBytes: usedMemory,
      totalBytes: memoryLimit,
      usedMb: Math.round((usedMemory / (1024 * 1024)) * 100) / 100,
      totalMb: Math.round((memoryLimit / (1024 * 1024)) * 100) / 100,
      percent: memoryPercent
    },
    network: {
      rxBytes,
      txBytes,
      rxMb: Math.round((rxBytes / (1024 * 1024)) * 100) / 100,
      txMb: Math.round((txBytes / (1024 * 1024)) * 100) / 100
    },
    timestamp: stats.read || new Date().toISOString()
  };
};

/**
 * Socket handler para estadísticas de contenedores individuales.
 */
export const registerContainerStatsSocket = (io, socket) => {
  // Mapa de streams activos: containerId -> stream
  const activeStatStreams = new Map();

  const cleanupStream = (containerId) => {
    if (activeStatStreams.has(containerId)) {
      const stream = activeStatStreams.get(containerId);
      try {
        if (stream && typeof stream.destroy === 'function') {
          stream.destroy();
        }
      } catch (err) {
        console.error(`Error destruyendo stream de stats de ${containerId}:`, err);
      }
      activeStatStreams.delete(containerId);
    }
  };

  socket.on('subscribe-container-stats', async ({ containerId } = {}) => {
    if (!containerId) {
      socket.emit('container-stats-error', { error: 'containerId es requerido' });
      return;
    }

    cleanupStream(containerId);

    try {
      const container = docker.getContainer(containerId);
      const statStream = await container.stats({ stream: true });

      activeStatStreams.set(containerId, statStream);

      let buffer = '';

      statStream.on('data', (chunk) => {
        buffer += chunk.toString('utf8');

        // Docker emite objetos JSON separados por newline
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Mantener el último segmento incompleto en el buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const rawJson = JSON.parse(trimmed);
            const metrics = calculateContainerMetrics(rawJson);
            if (metrics) {
              socket.emit(`container-stats:${containerId}`, {
                containerId,
                ...metrics
              });
            }
          } catch (parseErr) {
            // Fragmento JSON no parseable aún, ignorar
          }
        }
      });

      statStream.on('end', () => {
        cleanupStream(containerId);
        socket.emit(`container-stats:${containerId}:ended`, { containerId });
      });

      statStream.on('error', (err) => {
        cleanupStream(containerId);
        socket.emit('container-stats-error', {
          containerId,
          error: err.message
        });
      });
    } catch (error) {
      console.error(`Error suscribiendo a stats del contenedor ${containerId}:`, error);
      socket.emit('container-stats-error', {
        containerId,
        error: error.message
      });
    }
  });

  socket.on('unsubscribe-container-stats', ({ containerId } = {}) => {
    if (!containerId) return;
    cleanupStream(containerId);
    socket.emit(`container-stats:${containerId}:stopped`, { containerId });
  });

  socket.on('disconnect', () => {
    for (const [containerId] of activeStatStreams.entries()) {
      cleanupStream(containerId);
    }
    activeStatStreams.clear();
  });
};

export default registerContainerStatsSocket;
