import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH, DEFAULT_DOCKER_NETWORK } from '../config/paths.js';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause'];

/**
 * Obtener listado de contenedores con su estado y puertos formateados.
 */
export const listContainers = async () => {
  const containers = await docker.listContainers({ all: true });
  return containers.map(container => ({
    id: container.Id,
    names: container.Names,
    name: container.Names && container.Names.length > 0 ? container.Names[0].replace(/^\//, '') : container.Id.substring(0, 12),
    image: container.Image,
    imageId: container.ImageID,
    state: container.State,
    status: container.Status,
    created: container.Created,
    ports: container.Ports || []
  }));
};

/**
 * Ejecutar una acción sobre un contenedor ('start', 'stop', 'restart', 'pause', 'unpause').
 */
export const containerAction = async (id, action) => {
  const normalizedAction = (action || '').toLowerCase().trim();

  if (!ALLOWED_ACTIONS.includes(normalizedAction)) {
    throw new Error(`Acción no permitida: "${action}". Las acciones válidas son: ${ALLOWED_ACTIONS.join(', ')}`);
  }

  const container = docker.getContainer(id);

  switch (normalizedAction) {
    case 'start':
      return await container.start();
    case 'stop':
      return await container.stop();
    case 'restart':
      return await container.restart();
    case 'pause':
      return await container.pause();
    case 'unpause':
      return await container.unpause();
    default:
      throw new Error(`Acción no soportada: ${normalizedAction}`);
  }
};

/**
 * Enmascara valores de variables de entorno sensibles (PASS, KEY, SECRET, TOKEN).
 */
const sanitizeEnvList = (envList = []) => {
  const SENSITIVE_REGEX = /(PASS|KEY|SECRET|TOKEN)/i;
  return envList.map(item => {
    if (typeof item !== 'string') return item;
    const splitIndex = item.indexOf('=');
    if (splitIndex === -1) return item;

    const key = item.substring(0, splitIndex);
    if (SENSITIVE_REGEX.test(key)) {
      return `${key}=********`;
    }
    return item;
  });
};

/**
 * Inspecciona un contenedor sanitizando variables sensibles.
 */
export const inspectContainer = async (id) => {
  const container = docker.getContainer(id);
  const data = await container.inspect();

  // Clonar y sanitizar Env si existe en Config
  const sanitized = JSON.parse(JSON.stringify(data));

  if (sanitized.Config && Array.isArray(sanitized.Config.Env)) {
    sanitized.Config.Env = sanitizeEnvList(sanitized.Config.Env);
  }

  return sanitized;
};

/**
 * Asegura la existencia de una red Docker tipo bridge (por defecto server-net).
 */
export const ensureNetwork = async (networkName = DEFAULT_DOCKER_NETWORK) => {
  const targetNetwork = networkName || DEFAULT_DOCKER_NETWORK;
  try {
    const net = docker.getNetwork(targetNetwork);
    await net.inspect();
    return targetNetwork;
  } catch (error) {
    if (error.statusCode === 404) {
      await docker.createNetwork({
        Name: targetNetwork,
        Driver: 'bridge',
        CheckDuplicate: true
      });
      return targetNetwork;
    }
    throw error;
  }
};

/**
 * Asegura la existencia de un volumen persistente nombrado en Docker.
 */
export const ensureNamedVolume = async (volumeName, labels = {}) => {
  if (!volumeName || typeof volumeName !== 'string') return;
  try {
    const vol = docker.getVolume(volumeName);
    await vol.inspect();
  } catch (error) {
    if (error.statusCode === 404) {
      await docker.createVolume({
        Name: volumeName,
        Labels: {
          'cpanel.managed': 'true',
          ...labels
        }
      });
    } else {
      throw error;
    }
  }
};

/**
 * Normaliza y asocia volúmenes persistentes nombrados.
 * Acepta binds simples ('vol_name:/container/path' o 'vol_name:/container/path:ro')
 * o especificaciones de volúmenes con autogeneración basada en el nombre del contenedor.
 */
export const resolvePersistentVolumes = async ({ binds = [], volumes = [], containerName, image }) => {
  const resolvedBinds = [...(Array.isArray(binds) ? binds : [])];

  // Si se envían volúmenes específicos
  if (Array.isArray(volumes) && volumes.length > 0) {
    for (const v of volumes) {
      if (typeof v === 'string') {
        resolvedBinds.push(v);
      } else if (v && typeof v === 'object' && v.containerPath) {
        const volName = v.name || `vol_${containerName || 'app'}_${v.containerPath.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '')}`;
        const mode = v.mode ? `:${v.mode}` : '';
        resolvedBinds.push(`${volName}:${v.containerPath}${mode}`);
      }
    }
  }

  // Si no se proporcionaron binds ni volúmenes, asociar automáticamente un volumen persistente nombrado
  if (resolvedBinds.length === 0) {
    const safeBase = (containerName || image?.split(':')[0]?.replace(/[^a-zA-Z0-9_-]/g, '_') || 'app').replace(/^\/+/, '');
    const defaultVolName = `${safeBase}_data`;
    // Rutas comunes según imagen
    const isWp = /wordpress/i.test(image || '') || /wordpress/i.test(containerName || '');
    const isNginx = /nginx/i.test(image || '');
    const targetPath = isWp ? '/var/www/html' : (isNginx ? '/usr/share/nginx/html' : '/data');
    resolvedBinds.push(`${defaultVolName}:${targetPath}`);
  }

  // Asegurar que cada volumen nombrado existente en binds sea creado explícitamente si no es una ruta host absoluta
  for (const bind of resolvedBinds) {
    if (typeof bind === 'string') {
      const parts = bind.split(':');
      const source = parts[0];
      // Si no empieza con '/' ni '.', es un volumen nombrado
      if (source && !source.startsWith('/') && !source.startsWith('.')) {
        await ensureNamedVolume(source);
      }
    }
  }

  return resolvedBinds;
};

/**
 * Descarga una imagen de Docker si no está presente localmente o reporta progreso.
 */
export const pullImageIfNeeded = async (image) => {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (followErr, output) => {
        if (followErr) return reject(followErr);
        resolve(output);
      });
    });
  });
};

/**
 * Crea y despliega un contenedor conectándolo automáticamente a la red especificada (server-net por defecto)
 * y asociando volúmenes persistentes nombrados.
 */
export const createAndDeployContainer = async ({
  image,
  name,
  ports = [],
  env = [],
  network = DEFAULT_DOCKER_NETWORK,
  binds = [],
  volumes = [],
  labels = {}
}) => {
  if (!image) {
    throw new Error('El nombre de la imagen es requerido (ej. nginx:latest)');
  }

  // 1. Conectar automáticamente a la red especificada (server-net por defecto)
  const targetNetwork = network || DEFAULT_DOCKER_NETWORK;
  await ensureNetwork(targetNetwork);

  // 2. Resolver y asegurar volúmenes persistentes nombrados
  const resolvedBinds = await resolvePersistentVolumes({
    binds,
    volumes,
    containerName: name,
    image
  });

  // 3. Asegurar descarga de imagen
  await pullImageIfNeeded(image);

  // 4. Mapeo de puertos opcionales
  const ExposedPorts = {};
  const PortBindings = {};
  if (ports && Array.isArray(ports)) {
    ports.forEach(({ hostPort, containerPort }) => {
      if (containerPort) {
        const key = `${containerPort}/tcp`;
        ExposedPorts[key] = {};
        if (hostPort) {
          PortBindings[key] = [{ HostPort: String(hostPort) }];
        }
      }
    });
  }

  const hostConfig = {
    PortBindings,
    AutoRemove: false,
    NetworkMode: targetNetwork,
    Binds: resolvedBinds
  };

  const containerOptions = {
    Image: image,
    name: name || undefined,
    ExposedPorts,
    HostConfig: hostConfig,
    Env: Array.isArray(env) ? env : [],
    Labels: labels
  };

  const container = await docker.createContainer(containerOptions);
  await container.start();

  const info = await container.inspect();

  return {
    id: info.Id,
    name: info.Name ? info.Name.replace(/^\//, '') : name,
    status: info.State?.Status || 'running',
    network: targetNetwork,
    binds: resolvedBinds,
    inspect: info
  };
};

export default {
  listContainers,
  containerAction,
  inspectContainer,
  ensureNetwork,
  ensureNamedVolume,
  resolvePersistentVolumes,
  pullImageIfNeeded,
  createAndDeployContainer
};
