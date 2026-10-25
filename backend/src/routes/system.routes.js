import { Router } from 'express';
import { getSystemTelemetry } from '../services/system.service.js';

const router = Router();

/**
 * GET /api/system/metrics
 * Información de CPU, memoria y discos (/ y /mnt).
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getSystemTelemetry();
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Error al obtener métricas del sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar las métricas del sistema',
      details: error.message
    });
  }
});

export default router;
