import { Router } from 'express';
import { getMariaDbTelemetry } from '../services/database.service.js';

const router = Router();

/**
 * GET /api/databases/status
 * Telemetría de salud, conexiones activas y tamaños en MB.
 */
router.get('/status', async (req, res) => {
  try {
    const telemetry = await getMariaDbTelemetry();
    res.json({
      success: true,
      data: telemetry
    });
  } catch (error) {
    console.error('Error al obtener estado de la base de datos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar la telemetría de MariaDB',
      details: error.message
    });
  }
});

export default router;
