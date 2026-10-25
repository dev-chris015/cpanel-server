import si from 'systeminformation';

/**
 * Telemetría del sistema (Azure VM):
 * - Carga de CPU (actual, por núcleo, load average)
 * - Memoria RAM global (total, usada, libre, porcentaje)
 * - Espacio en discos: raíz '/' y SSD temporal '/mnt'
 */
export const getSystemTelemetry = async () => {
  try {
    const [cpuLoad, mem, fsSizes, currentLoad] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.fsSize(),
      si.currentLoad()
    ]);

    // Filtrar particiones relevantes: raíz '/' y temporal '/mnt' (o submontajes si aplican)
    const disks = fsSizes.map(disk => ({
      fs: disk.fs,
      type: disk.type,
      mount: disk.mount,
      sizeBytes: disk.size,
      usedBytes: disk.used,
      availableBytes: disk.available,
      usePercent: disk.use,
      sizeGb: Math.round((disk.size / (1024 ** 3)) * 100) / 100,
      usedGb: Math.round((disk.used / (1024 ** 3)) * 100) / 100,
      availableGb: Math.round((disk.available / (1024 ** 3)) * 100) / 100
    }));

    // Búsqueda específica de '/' y '/mnt'
    const rootDisk = disks.find(d => d.mount === '/') || null;
    const mntDisk = disks.find(d => d.mount === '/mnt' || d.mount.startsWith('/mnt')) || null;

    return {
      cpu: {
        manufacturer: cpuLoad.manufacturer,
        brand: cpuLoad.brand,
        cores: cpuLoad.cores,
        physicalCores: cpuLoad.physicalCores,
        speedGhz: cpuLoad.speed,
        currentLoadPercent: Math.round(currentLoad.currentLoad * 100) / 100,
        currentLoadUser: Math.round(currentLoad.currentLoadUser * 100) / 100,
        currentLoadSystem: Math.round(currentLoad.currentLoadSystem * 100) / 100,
        coresLoad: currentLoad.cpus ? currentLoad.cpus.map(c => Math.round(c.load * 100) / 100) : []
      },
      memory: {
        totalBytes: mem.total,
        usedBytes: mem.used,
        freeBytes: mem.free,
        availableBytes: mem.available,
        totalGb: Math.round((mem.total / (1024 ** 3)) * 100) / 100,
        usedGb: Math.round((mem.used / (1024 ** 3)) * 100) / 100,
        freeGb: Math.round((mem.free / (1024 ** 3)) * 100) / 100,
        usedPercent: Math.round(((mem.total - mem.available) / mem.total) * 10000) / 100
      },
      storage: {
        root: rootDisk,
        mnt: mntDisk,
        allDisks: disks
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error al obtener telemetría del sistema:', error);
    throw error;
  }
};

export default {
  getSystemTelemetry
};
