import si from 'systeminformation';
import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH } from '../config/paths.js';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

// URL del agente Netdata en la red interna de Docker
const NETDATA_BASE_URL = process.env.NETDATA_URL || 'http://netdata:19999';

/**
 * Patrones de nombres de volúmenes críticos protegidos contra mantenimiento/prune accidental.
 * Protege bases de datos y almacenes persistentes de WordPress, MariaDB, Postgres, MinIO, Redis, Portainer.
 */
export const PROTECTED_VOLUME_PATTERNS = Object.freeze([
  /mariadb/i,
  /mysql/i,
  /postgres/i,
  /wordpress/i,
  /minio/i,
  /redis/i,
  /portainer/i,
  /db[_-]?data/i,
  /database/i,
  /backup/i,
  /cpanel[_-]?data/i
]);

/**
 * Verifica si un volumen de Docker está protegido contra eliminación.
 */
export const isVolumeProtected = (volumeName, labels = {}) => {
  if (!volumeName || typeof volumeName !== 'string') return true;

  // 1. Comprobar etiquetas explícitas de protección
  if (
    labels['cpanel.protected'] === 'true' ||
    labels['cpanel.protect'] === 'true' ||
    labels['protected'] === 'true' ||
    labels['keep'] === 'true'
  ) {
    return true;
  }

  // 2. Comprobar variables de entorno con lista personalizada de volúmenes protegidos
  if (process.env.PROTECTED_VOLUMES) {
    const customProtected = process.env.PROTECTED_VOLUMES.split(',').map(v => v.trim().toLowerCase());
    if (customProtected.includes(volumeName.toLowerCase())) {
      return true;
    }
  }

  // 3. Comprobar contra lista de patrones de bases de datos y persistencia crítica
  return PROTECTED_VOLUME_PATTERNS.some(pattern => pattern.test(volumeName));
};

// ==============================================================================
// 1. TELEMETRÍA HÍBRIDA (NETDATA API CON FALLBACK A SYSTEMINFORMATION)
// ==============================================================================

/**
 * Intenta consultar telemetría en tiempo real desde la API v1 local de Netdata.
 * Endpoint: http://netdata:19999/api/v1/data
 */
export const fetchNetdataMetrics = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  try {
    const [cpuRes, ramRes] = await Promise.all([
      fetch(`${NETDATA_BASE_URL}/api/v1/data?chart=system.cpu&points=1&format=json`, { signal: controller.signal }),
      fetch(`${NETDATA_BASE_URL}/api/v1/data?chart=system.ram&points=1&format=json`, { signal: controller.signal })
    ]);

    if (!cpuRes.ok || !ramRes.ok) {
      throw new Error(`Netdata HTTP error: ${cpuRes.status}/${ramRes.status}`);
    }

    const cpuJson = await cpuRes.json();
    const ramJson = await ramRes.json();

    // 1. Extraer carga de CPU (suma de valores de dimensiones excepto idle)
    // Dimensiones típicas: ["guest_nice", "guest", "steal", "softirq", "irq", "user", "system", "nice", "iowait"]
    const cpuValues = (cpuJson.data && cpuJson.data[0]) ? cpuJson.data[0].slice(1) : (cpuJson.latest_values || []);
    const totalCpuPercent = cpuValues.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);

    // 2. Extraer memoria RAM (dimensiones en Netdata: "free", "used", "cached", "buffers" en MB)
    const ramDims = ramJson.dimensions || [];
    const ramVals = (ramJson.data && ramJson.data[0]) ? ramJson.data[0].slice(1) : (ramJson.latest_values || []);
    const ramMap = {};
    ramDims.forEach((dim, i) => {
      ramMap[dim] = parseFloat(ramVals[i]) || 0;
    });

    const usedMb = ramMap['used'] || 0;
    const freeMb = ramMap['free'] || 0;
    const cachedMb = ramMap['cached'] || 0;
    const buffersMb = ramMap['buffers'] || 0;
    const totalMb = usedMb + freeMb + cachedMb + buffersMb;
    const usedPercent = totalMb > 0 ? Math.round((usedMb / totalMb) * 10000) / 100 : 0;

    return {
      source: 'netdata',
      cpu: {
        currentLoadPercent: Math.round(totalCpuPercent * 100) / 100,
        brand: 'Host CPU (vía Netdata)',
        cores: cpuJson.view_update_every || 1
      },
      memory: {
        totalGb: Math.round((totalMb / 1024) * 100) / 100,
        usedGb: Math.round((usedMb / 1024) * 100) / 100,
        freeGb: Math.round((freeMb / 1024) * 100) / 100,
        usedPercent
      }
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Obtiene la telemetría híbrida del sistema:
 * - Intenta primero Netdata API local (http://netdata:19999/api/v1/data).
 * - En caso de indisponibilidad o timeout, recurre a systeminformation de forma transparente.
 * - Siempre incluye el desglose de discos ('/' y '/mnt').
 */
export const getSystemTelemetry = async () => {
  // 1. Obtener discos mediante systeminformation
  let fsSizes = [];
  try {
    fsSizes = await si.fsSize();
  } catch (fsErr) {
    console.warn('Advertencia al consultar fsSize con systeminformation:', fsErr.message);
  }

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

  const rootDisk = disks.find(d => d.mount === '/') || null;
  const mntDisk = disks.find(d => d.mount === '/mnt' || d.mount.startsWith('/mnt')) || null;

  // 2. Intentar Netdata API
  try {
    const netdataMetrics = await fetchNetdataMetrics();
    return {
      source: 'netdata',
      cpu: netdataMetrics.cpu,
      memory: netdataMetrics.memory,
      storage: {
        root: rootDisk,
        mnt: mntDisk,
        allDisks: disks
      },
      timestamp: new Date().toISOString()
    };
  } catch (netdataErr) {
    // 3. Fallback a systeminformation
    const [cpuLoad, mem, currentLoad] = await Promise.all([
      si.cpu(),
      si.mem(),
      si.currentLoad()
    ]);

    return {
      source: 'systeminformation',
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
      fallbackReason: netdataErr.message,
      timestamp: new Date().toISOString()
    };
  }
};

// ==============================================================================
// 2. MANTENIMIENTO DOCKER (PRUNE DE CONTENEDORES, IMÁGENES Y VOLÚMENES PROTEGIDOS)
// ==============================================================================

/**
 * Limpieza de contenedores detenidos (docker container prune).
 */
export const pruneContainers = async () => {
  try {
    const result = await docker.pruneContainers();
    return {
      success: true,
      containersDeleted: result.ContainersDeleted || [],
      spaceReclaimed: result.SpaceReclaimed || 0
    };
  } catch (error) {
    console.error('Error al ejecutar prune de contenedores:', error);
    throw new Error(`Fallo en prune de contenedores: ${error.message}`);
  }
};

/**
 * Limpieza de imágenes Docker huérfanas o sin usar (docker image prune).
 */
export const pruneImages = async ({ all = false } = {}) => {
  try {
    // Si all es true, elimina todas las imágenes no asociadas a un contenedor, no solo las dangling
    const opts = all ? { filters: { dangling: { false: false } } } : {};
    const result = await docker.pruneImages(opts);
    return {
      success: true,
      imagesDeleted: result.ImagesDeleted || [],
      spaceReclaimed: result.SpaceReclaimed || 0
    };
  } catch (error) {
    console.error('Error al ejecutar prune de imágenes:', error);
    throw new Error(`Fallo en prune de imágenes: ${error.message}`);
  }
};

/**
 * Limpieza de volúmenes Docker no utilizados con PROTECCIÓN ESTRICTA de volúmenes persistentes y de bases de datos.
 */
export const pruneVolumesSafe = async () => {
  try {
    // 1. Obtener lista completa de volúmenes
    const volumesList = await docker.listVolumes();
    const allVolumes = volumesList.Volumes || [];

    // 2. Obtener volúmenes actualmente montados por contenedores activos o detenidos
    const containers = await docker.listContainers({ all: true });
    const usedVolumeNames = new Set();

    for (const c of containers) {
      if (Array.isArray(c.Mounts)) {
        for (const mount of c.Mounts) {
          if (mount.Type === 'volume' && mount.Name) {
            usedVolumeNames.add(mount.Name);
          }
        }
      }
    }

    // 3. Evaluar volúmenes no usados
    const deletedVolumes = [];
    const protectedSkipped = [];
    let spaceReclaimedEstimate = 0;

    for (const vol of allVolumes) {
      const volName = vol.Name;

      // Si el volumen está actualmente en uso por algún contenedor, omitirlo
      if (usedVolumeNames.has(volName)) {
        continue;
      }

      // Si el volumen está protegido por patrón, etiqueta o configuración
      if (isVolumeProtected(volName, vol.Labels || {})) {
        protectedSkipped.push({
          name: volName,
          driver: vol.Driver,
          reason: 'Protegido por patrón crítico de base de datos/persistencia'
        });
        continue;
      }

      // Si es un volumen no utilizado y NO está protegido, eliminarlo con seguridad
      try {
        const volumeInstance = docker.getVolume(volName);
        await volumeInstance.remove();
        deletedVolumes.push(volName);
      } catch (removeErr) {
        console.warn(`No se pudo eliminar volumen ${volName}:`, removeErr.message);
      }
    }

    return {
      success: true,
      volumesDeleted: deletedVolumes,
      spaceReclaimed: spaceReclaimedEstimate,
      protectedVolumesSkipped: protectedSkipped,
      totalVolumesInspected: allVolumes.length
    };
  } catch (error) {
    console.error('Error al ejecutar prune seguro de volúmenes:', error);
    throw new Error(`Fallo en prune seguro de volúmenes: ${error.message}`);
  }
};

/**
 * Obtiene el diagnóstico de uso de disco en Docker (docker system df).
 */
export const getDockerDiskUsage = async () => {
  try {
    const dfData = await docker.df();
    // dfData contiene: LayersSize, Images, Containers, Volumes, BuildCache
    const images = dfData.Images || [];
    const containers = dfData.Containers || [];
    const volumes = dfData.Volumes || [];
    const buildCache = dfData.BuildCache || [];

    const calculateSize = (items, sizeField = 'Size') => 
      items.reduce((acc, item) => acc + (Number(item[sizeField]) || 0), 0);

    const imagesTotalSize = calculateSize(images);
    const containersTotalSize = calculateSize(containers, 'SizeRw');
    const volumesTotalSize = calculateSize(volumes, 'UsageData.Size' in (volumes[0] || {}) ? 'UsageData' : 'Size');
    const buildCacheTotalSize = calculateSize(buildCache);

    // Calcular imágenes huérfanas/dangling
    const danglingImages = images.filter(img => img.RepoTags?.includes('<none>:<none>') || img.Dangling);

    return {
      success: true,
      raw: {
        imagesCount: images.length,
        danglingImagesCount: danglingImages.length,
        containersCount: containers.length,
        volumesCount: volumes.length
      },
      layersSizeBytes: dfData.LayersSize || 0,
      imagesSizeBytes: imagesTotalSize,
      containersSizeBytes: containersTotalSize,
      volumesSizeBytes: volumesTotalSize,
      buildCacheSizeBytes: buildCacheTotalSize,
      totalSizeBytes: (dfData.LayersSize || imagesTotalSize) + containersTotalSize + volumesTotalSize + buildCacheTotalSize
    };
  } catch (error) {
    console.error('Error al obtener docker df:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Tarea integral de mantenimiento del sistema:
 * Ejecuta prune de contenedores, imágenes y volúmenes protegidos.
 */
export const runSystemMaintenance = async ({ pruneVolumes = true, allImages = false } = {}) => {
  const report = {
    timestamp: new Date().toISOString(),
    containers: null,
    images: null,
    volumes: null,
    totalSpaceReclaimed: 0
  };

  // 1. Prune de contenedores detenidos
  try {
    report.containers = await pruneContainers();
    report.totalSpaceReclaimed += (report.containers.spaceReclaimed || 0);
  } catch (err) {
    report.containers = { success: false, error: err.message };
  }

  // 2. Prune de imágenes
  try {
    report.images = await pruneImages({ all: allImages });
    report.totalSpaceReclaimed += (report.images.spaceReclaimed || 0);
  } catch (err) {
    report.images = { success: false, error: err.message };
  }

  // 3. Prune de volúmenes protegidos (opcional)
  if (pruneVolumes) {
    try {
      report.volumes = await pruneVolumesSafe();
      report.totalSpaceReclaimed += (report.volumes.spaceReclaimed || 0);
    } catch (err) {
      report.volumes = { success: false, error: err.message };
    }
  }

  return {
    success: true,
    message: 'Mantenimiento del sistema ejecutado exitosamente.',
    data: report
  };
};

export default {
  PROTECTED_VOLUME_PATTERNS,
  isVolumeProtected,
  fetchNetdataMetrics,
  getSystemTelemetry,
  pruneContainers,
  pruneImages,
  pruneVolumesSafe,
  runSystemMaintenance,
  getDockerDiskUsage
};
