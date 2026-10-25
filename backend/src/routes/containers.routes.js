import { Router } from 'express';
import { listContainers, containerAction, inspectContainer } from '../services/docker.service.js';

const router = Router();
const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause'];

/**
 * GET /api/containers
 * Lista de contenedores con estado y puertos.
 */
router.get('/', async (req, res) => {
  try {
    const containers = await listContainers();
    res.json({
      success: true,
      count: containers.length,
      data: containers
    });
  } catch (error) {
    console.error('Error al listar contenedores:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar los contenedores',
      details: error.message
    });
  }
});

/**
 * GET /api/containers/:id/inspect
 * Retorna la configuración del contenedor sanitizada/enmascarando variables sensibles.
 */
router.get('/:id/inspect', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await inspectContainer(id);
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error(`Error al inspeccionar contenedor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: `Error al inspeccionar contenedor ${req.params.id}`,
      details: error.message
    });
  }
});

/**
 * POST /api/containers/:id/:action
 * Ejecuta una acción validada contra lista blanca ('start', 'stop', 'restart', 'pause', 'unpause').
 */
router.post('/:id/:action', async (req, res) => {
  try {
    const { id, action } = req.params;
    const normalizedAction = (action || '').toLowerCase().trim();

    if (!ALLOWED_ACTIONS.includes(normalizedAction)) {
      return res.status(400).json({
        success: false,
        error: `Acción no permitida: "${action}". Lista permitida: ${ALLOWED_ACTIONS.join(', ')}`
      });
    }

    await containerAction(id, normalizedAction);

    res.json({
      success: true,
      message: `Acción "${normalizedAction}" ejecutada exitosamente sobre el contenedor ${id}`
    });
  } catch (error) {
    console.error(`Error al ejecutar acción "${req.params.action}" en contenedor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: `Fallo al ejecutar la acción "${req.params.action}"`,
      details: error.message
    });
  }
});

export default router;
