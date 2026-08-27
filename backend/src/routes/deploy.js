import { Router } from 'express';
import { deployContainer } from '../controllers/dockerController.js';

const router = Router();

// POST /api/deploy - Desplegar un contenedor
router.post('/', deployContainer);

export default router;
