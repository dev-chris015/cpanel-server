import { Router } from 'express';
import Docker from 'dockerode';
import { listContainers, containerAction, inspectContainer, removeContainerById } from '../services/docker.service.js';
import { checkContainerDatabase, dropSchema, dropDatabaseUser } from '../services/database.service.js';
import { deleteVHostWithAtomicRollback, getVHostsDir } from './proxy.routes.js';
import { DOCKER_SOCKET_PATH } from '../config/paths.js';
import fs from 'fs';
import path from 'path';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const router = Router();
const ALLOWED_ACTIONS = ['start', 'stop', 'restart', 'pause', 'unpause'];

// Contenedores del sistema base que NUNCA deben eliminarse por accidente
const PROTECTED_SYSTEM_CONTAINERS = [
  'cpanel-backend',
  'cpanel-frontend',
  'nginx-proxy',
  'mariadb',
  'netdata'
];

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

/**
 * DELETE /api/containers/:id
 * Elimina un contenedor Docker y, opcionalmente, su base de datos asociada en MariaDB,
 * sus volúmenes y sus Virtual Hosts Nginx vinculados.
 *
 * Query / Body params:
 * - deleteDatabase: boolean (default true para sitios WordPress / con BD asociada)
 * - deleteVolumes: boolean (default true)
 * - deleteVHost: boolean (default true)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteDatabase = req.query.deleteDatabase === 'true' || req.body?.deleteDatabase === true;
    const deleteVolumes = req.query.deleteVolumes !== 'false' && req.body?.deleteVolumes !== false;
    const deleteVHost = req.query.deleteVHost !== 'false' && req.body?.deleteVHost !== false;

    // 1. Inspeccionar el contenedor antes de eliminarlo para recopilar metadata
    const container = docker.getContainer(id);
    let inspectData = null;
    let containerName = id;

    try {
      inspectData = await container.inspect();
      containerName = (inspectData.Name || '').replace(/^\//, '') || id;
    } catch (inspectErr) {
      if (inspectErr.statusCode === 404) {
        return res.status(404).json({
          success: false,
          error: `Contenedor con ID o nombre "${id}" no encontrado.`
        });
      }
      throw inspectErr;
    }

    // 2. Proteger contenedores del sistema
    if (PROTECTED_SYSTEM_CONTAINERS.includes(containerName.toLowerCase())) {
      return res.status(403).json({
        success: false,
        error: `Operación denegada: El contenedor "${containerName}" es un componente crítico del sistema cPanel.`
      });
    }

    const report = {
      containerId: id,
      containerName,
      containerDeleted: false,
      databaseDeleted: null,
      databaseUserDeleted: null,
      vhostDeleted: null,
      volumesDeleted: false
    };

    // 3. Extraer información de Base de Datos antes de destruir el contenedor
    let targetDbName = null;
    let targetDbUser = null;

    if (inspectData?.Config?.Env && Array.isArray(inspectData.Config.Env)) {
      for (const envStr of inspectData.Config.Env) {
        const dbMatch = envStr.match(/^(?:WORDPRESS_DB_NAME|DB_NAME|MYSQL_DATABASE)=(.*)$/i);
        if (dbMatch && dbMatch[1]) targetDbName = dbMatch[1].trim();

        const userMatch = envStr.match(/^(?:WORDPRESS_DB_USER|DB_USER|MYSQL_USER)=(.*)$/i);
        if (userMatch && userMatch[1]) targetDbUser = userMatch[1].trim();
      }
    }

    // Si no se encontró por variable de entorno, buscar por convención o checkContainerDatabase
    if (!targetDbName) {
      try {
        const dbCheck = await checkContainerDatabase(containerName);
        if (dbCheck.hasDatabase && dbCheck.databaseName) {
          targetDbName = dbCheck.databaseName;
        }
      } catch (_) {}
    }

    // 4. Detener y remover el contenedor Docker
    try {
      await removeContainerById(id, { removeVolumes: deleteVolumes, force: true });
      report.containerDeleted = true;
      report.volumesDeleted = deleteVolumes;
    } catch (dockerDelErr) {
      console.error(`Error al eliminar contenedor ${containerName}:`, dockerDelErr);
      return res.status(500).json({
        success: false,
        error: `No se pudo eliminar el contenedor: ${dockerDelErr.message}`
      });
    }

    // 5. Eliminar base de datos y usuario de base de datos si fue solicitado
    if (deleteDatabase && targetDbName) {
      try {
        const dbResult = await dropSchema(targetDbName);
        report.databaseDeleted = {
          name: targetDbName,
          success: dbResult.success
        };
      } catch (dbErr) {
        console.warn(`Aviso al eliminar BD ${targetDbName}:`, dbErr.message);
        report.databaseDeleted = {
          name: targetDbName,
          success: false,
          error: dbErr.message
        };
      }

      // Eliminar usuario de BD si aplica y no es usuario del sistema ni root
      if (targetDbUser && targetDbUser.toLowerCase() !== 'root') {
        try {
          await dropDatabaseUser(targetDbUser);
          report.databaseUserDeleted = {
            username: targetDbUser,
            success: true
          };
        } catch (uErr) {
          console.warn(`Aviso al eliminar usuario de BD ${targetDbUser}:`, uErr.message);
          report.databaseUserDeleted = {
            username: targetDbUser,
            success: false,
            error: uErr.message
          };
        }
      }
    }

    // 6. Eliminar Virtual Host Nginx asociado si existía
    if (deleteVHost) {
      try {
        const vhostsDir = getVHostsDir();
        if (fs.existsSync(vhostsDir)) {
          const files = fs.readdirSync(vhostsDir).filter(f => f.endsWith('.conf'));
          for (const file of files) {
            const confPath = path.join(vhostsDir, file);
            const content = fs.readFileSync(confPath, 'utf8');
            const cleanDomain = file.replace(/\.conf$/, '');

            // Verificar si el upstream apunta a este contenedor
            const isTarget = content.includes(`http://${containerName}:`) ||
                             content.includes(`http://${containerName}/`) ||
                             content.includes(`http://${containerName};`) ||
                             content.includes(`"${containerName}:`) ||
                             content.includes(`set $backend_upstream "http://${containerName}`);

            if (isTarget) {
              const vhRes = await deleteVHostWithAtomicRollback(cleanDomain);
              report.vhostDeleted = {
                domain: cleanDomain,
                deleted: vhRes.deleted
              };
              break;
            }
          }
        }
      } catch (vhErr) {
        console.warn(`Aviso al limpiar VHost de ${containerName}:`, vhErr.message);
      }
    }

    res.json({
      success: true,
      message: `Contenedor "${containerName}" eliminado correctamente${report.databaseDeleted?.success ? ' junto con su base de datos' : ''}.`,
      data: report
    });
  } catch (error) {
    console.error(`Error general al eliminar contenedor ${req.params.id}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar la eliminación del contenedor',
      details: error.message
    });
  }
});

export default router;
