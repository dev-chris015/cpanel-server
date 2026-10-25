import Docker from 'dockerode';
import { DOCKER_SOCKET_PATH } from '../config/paths.js';

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

export default {
  listContainers,
  containerAction,
  inspectContainer
};
