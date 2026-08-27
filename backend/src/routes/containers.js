import { Router } from 'express';
import { getContainers } from '../controllers/dockerController.js';

const router = Router();

// GET /api/containers - Listar contenedores
router.get('/', getContainers);

export default router;
