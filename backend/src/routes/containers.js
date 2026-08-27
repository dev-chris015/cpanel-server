import { Router } from 'express';
import { 
  getContainers, 
  startContainer, 
  stopContainer, 
  restartContainer, 
  removeContainer, 
  inspectContainer, 
  getContainerLogs,
  streamContainerLogs,
  execContainerCommand
} from '../controllers/dockerController.js';

const router = Router();

// GET /api/containers - Listar contenedores
router.get('/', getContainers);

// Endpoints de gestión de ciclo de vida
router.post('/:id/start', startContainer);
router.post('/:id/stop', stopContainer);
router.post('/:id/restart', restartContainer);
router.delete('/:id', removeContainer);
router.get('/:id/inspect', inspectContainer);
router.get('/:id/logs', getContainerLogs);
router.get('/:id/logs/stream', streamContainerLogs);
router.post('/:id/exec', execContainerCommand);

export default router;
