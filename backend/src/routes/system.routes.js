import { Router } from 'express';
import {
  getSystemTelemetry,
  pruneContainers,
  pruneImages,
  pruneVolumesSafe,
  runSystemMaintenance
} from '../services/system.service.js';

const router = Router();

/**
 * GET /api/system/metrics
 * Telemetría híbrida del host:
 * Intenta consultar Netdata API (http://netdata:19999/api/v1/data) y recurre a systeminformation si no está disponible.
 * Incluye carga de CPU, uso de RAM y almacenamiento ('/' y '/mnt').
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

// ==============================================================================
// ENDPOINTS DE MANTENIMIENTO DOCKER (PRUNE)
// ==============================================================================

/**
 * POST /api/system/prune/containers
 * Limpieza de contenedores detenidos.
 */
router.post('/prune/containers', async (req, res) => {
  try {
    const result = await pruneContainers();
    res.json({
      success: true,
      message: 'Limpieza de contenedores detenidos completada.',
      data: result
    });
  } catch (error) {
    console.error('Error en prune de contenedores:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/system/prune/images
 * Limpieza de imágenes huérfanas o sin usar.
 */
router.post('/prune/images', async (req, res) => {
  try {
    const { all } = req.body || {};
    const result = await pruneImages({ all: Boolean(all) });
    res.json({
      success: true,
      message: 'Limpieza de imágenes completada.',
      data: result
    });
  } catch (error) {
    console.error('Error en prune de imágenes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/system/prune/volumes
 * Limpieza de volúmenes Docker no utilizados con PROTECCIÓN ESTRICTA de volúmenes de base de datos.
 */
router.post('/prune/volumes', async (req, res) => {
  try {
    const result = await pruneVolumesSafe();
    res.json({
      success: true,
      message: 'Limpieza de volúmenes completada (volúmenes de persistencia/DB protegidos).',
      data: result
    });
  } catch (error) {
    console.error('Error en prune seguro de volúmenes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/system/prune y POST /api/system/maintenance
 * Mantenimiento global de Docker: prune de contenedores, imágenes y volúmenes protegidos.
 */
const handleMaintenance = async (req, res) => {
  try {
    const { pruneVolumes = true, allImages = false } = req.body || {};
    const result = await runSystemMaintenance({
      pruneVolumes: Boolean(pruneVolumes),
      allImages: Boolean(allImages)
    });
    res.json(result);
  } catch (error) {
    console.error('Error en mantenimiento del sistema:', error);
    res.status(500).json({
      success: false,
      error: 'Error al ejecutar el mantenimiento del sistema',
      details: error.message
    });
  }
};

router.post('/prune', handleMaintenance);
router.post('/maintenance', handleMaintenance);

export default router;
