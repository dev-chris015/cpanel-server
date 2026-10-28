import { Router } from 'express';
import {
  getMariaDbTelemetry,
  createSchema,
  dropSchema,
  listSchemas,
  createBackup,
  listBackups,
  getBackupFilePath,
  deleteBackup,
  listDatabaseUsers,
  getUserGrants,
  createDatabaseUser,
  dropDatabaseUser,
  modifyUserPrivileges,
  changeUserPassword
} from '../services/database.service.js';

const router = Router();

// ==============================================================================
// 1. TELEMETRÍA Y ESTADO
// ==============================================================================

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
    console.error('Error al obtener estado de MariaDB:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar la telemetría de MariaDB',
      details: error.message
    });
  }
});

// ==============================================================================
// 2. GESTIÓN DE ESQUEMAS / BASES DE DATOS (CON BLOQUEO DE SISTEMA)
// ==============================================================================

/**
 * GET /api/databases/schemas
 * Listar esquemas con tamaños en MB, conteo de tablas y flag de sistema.
 */
router.get('/schemas', async (req, res) => {
  try {
    const schemas = await listSchemas();
    res.json({
      success: true,
      count: schemas.length,
      data: schemas
    });
  } catch (error) {
    console.error('Error al listar esquemas de MariaDB:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar los esquemas de MariaDB',
      details: error.message
    });
  }
});

/**
 * POST /api/databases/schemas
 * Crear un nuevo esquema en MariaDB.
 */
router.post('/schemas', async (req, res) => {
  try {
    const { name, charset, collation } = req.body;
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'El nombre del esquema (name) es requerido.'
      });
    }

    const result = await createSchema(name, { charset, collation });
    res.status(201).json(result);
  } catch (error) {
    console.error('Error al crear esquema en MariaDB:', error);
    const statusCode = error.message.includes('Operación denegada') ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/databases/schemas/:name
 * Eliminar un esquema en MariaDB (con bloqueo de esquemas del sistema).
 */
router.delete('/schemas/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const result = await dropSchema(name);
    res.json(result);
  } catch (error) {
    console.error(`Error al eliminar esquema ${req.params.name}:`, error);
    const statusCode = error.statusCode || (error.message.includes('Operación denegada') ? 403 : 500);
    res.status(statusCode).json({
      success: false,
      error: error.message,
      isSystemSchema: Boolean(error.isSystemSchema)
    });
  }
});

// Alias para rutas directas
router.post('/', async (req, res, next) => {
  if (req.body && req.body.name) {
    return router.handle({ ...req, url: '/schemas' }, res, next);
  }
  next();
});

// ==============================================================================
// 3. COPIAS DE SEGURIDAD (VOLCADOS MANUALES MARIADB-DUMP, LISTAR, DESCARGAR, ELIMINAR)
// ==============================================================================

/**
 * POST /api/databases/backups
 * Disparar volcado manual mariadb-dump hacia /srv/backups/${dbName}_${timestamp}.sql
 */
router.post('/backups', async (req, res) => {
  try {
    const { database, name } = req.body;
    const dbName = database || name;

    if (!dbName) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de la base de datos a respaldar es requerido (campo "database" o "name").'
      });
    }

    const backupInfo = await createBackup(dbName);
    res.status(201).json({
      success: true,
      message: `Copia de seguridad generada exitosamente para la base de datos "${dbName}".`,
      data: backupInfo
    });
  } catch (error) {
    console.error('Error al disparar volcado de MariaDB:', error);
    res.status(500).json({
      success: false,
      error: 'Error al ejecutar el volcado de la base de datos',
      details: error.message
    });
  }
});

/**
 * POST /api/databases/schemas/:name/backup
 * Disparar volcado para un esquema específico por parámetro.
 */
router.post('/schemas/:name/backup', async (req, res) => {
  try {
    const { name } = req.params;
    const backupInfo = await createBackup(name);
    res.status(201).json({
      success: true,
      message: `Copia de seguridad generada exitosamente para la base de datos "${name}".`,
      data: backupInfo
    });
  } catch (error) {
    console.error(`Error al disparar volcado de ${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Error al ejecutar el volcado de la base de datos',
      details: error.message
    });
  }
});

/**
 * GET /api/databases/backups
 * Listar todas las copias de seguridad disponibles en /srv/backups.
 */
router.get('/backups', (req, res) => {
  try {
    const { backupDir, backups } = listBackups();
    res.json({
      success: true,
      count: backups.length,
      backupDir,
      data: backups
    });
  } catch (error) {
    console.error('Error al listar respaldos de bases de datos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al listar las copias de seguridad',
      details: error.message
    });
  }
});

/**
 * GET /api/databases/backups/:filename/download y GET /api/databases/backups/download/:filename
 * Descargar un archivo de volcado SQL.
 */
const downloadBackupHandler = (req, res) => {
  try {
    const { filename } = req.params;
    const fullPath = getBackupFilePath(filename);

    res.download(fullPath, filename, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error al transferir el archivo de respaldo',
          details: err.message
        });
      }
    });
  } catch (error) {
    console.error(`Error al preparar descarga de ${req.params.filename}:`, error);
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
};

router.get('/backups/:filename/download', downloadBackupHandler);
router.get('/backups/download/:filename', downloadBackupHandler);

/**
 * DELETE /api/databases/backups/:filename
 * Eliminar una copia de seguridad específica de /srv/backups.
 */
router.delete('/backups/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const result = deleteBackup(filename);
    res.json(result);
  } catch (error) {
    console.error(`Error al eliminar respaldo ${req.params.filename}:`, error);
    const statusCode = error.statusCode || 400;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

// ==============================================================================
// 4. GESTIÓN DE USUARIOS Y PERMISOS (mysql.user)
// ==============================================================================

/**
 * GET /api/databases/users
 * Listar usuarios en MariaDB consultando mysql.user.
 */
router.get('/users', async (req, res) => {
  try {
    const users = await listDatabaseUsers();
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('Error al listar usuarios de MariaDB:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar los usuarios de MariaDB',
      details: error.message
    });
  }
});

/**
 * GET /api/databases/users/:username/grants
 * Consultar permisos actuales de un usuario.
 */
router.get('/users/:username/grants', async (req, res) => {
  try {
    const { username } = req.params;
    const host = req.query.host || '%';

    const grants = await getUserGrants(username, host);
    res.json({
      success: true,
      user: username,
      host,
      data: grants
    });
  } catch (error) {
    console.error(`Error al obtener permisos para usuario ${req.params.username}:`, error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/databases/users
 * Crear un nuevo usuario en MariaDB con opción de asignar permisos.
 */
router.post('/users', async (req, res) => {
  try {
    const { username, password, host, database, privileges } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'El nombre de usuario (username) y la contraseña (password) son requeridos.'
      });
    }

    const result = await createDatabaseUser({
      username,
      password,
      host: host || '%',
      database,
      privileges
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Error al crear usuario en MariaDB:', error);
    const statusCode = error.message.includes('Operación denegada') ? 403 : 400;
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/databases/users/:username
 * Eliminar un usuario de MariaDB garantizando protección de usuarios del sistema y root.
 */
router.delete('/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const host = req.query.host || req.body?.host || '%';

    const result = await dropDatabaseUser(username, host);
    res.json(result);
  } catch (error) {
    console.error(`Error al eliminar usuario ${req.params.username}:`, error);
    const statusCode = error.statusCode || (error.message.includes('Operación denegada') ? 403 : 400);
    res.status(statusCode).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/databases/users/:username/privileges
 * Otorgar o revocar permisos (GRANT / REVOKE) a un usuario.
 */
router.post('/users/:username/privileges', async (req, res) => {
  try {
    const { username } = req.params;
    const { host, database, privileges, action } = req.body;

    const result = await modifyUserPrivileges({
      username,
      host: host || '%',
      database: database || '*',
      privileges: privileges || 'ALL PRIVILEGES',
      action: action || 'GRANT'
    });

    res.json(result);
  } catch (error) {
    console.error(`Error al modificar permisos para ${req.params.username}:`, error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/databases/users/:username/privileges
 * Revocar permisos a un usuario.
 */
router.delete('/users/:username/privileges', async (req, res) => {
  try {
    const { username } = req.params;
    const host = req.query.host || req.body?.host || '%';
    const database = req.query.database || req.body?.database || '*';
    const privileges = req.query.privileges || req.body?.privileges || 'ALL PRIVILEGES';

    const result = await modifyUserPrivileges({
      username,
      host,
      database,
      privileges,
      action: 'REVOKE'
    });

    res.json(result);
  } catch (error) {
    console.error(`Error al revocar permisos para ${req.params.username}:`, error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/databases/users/:username/password y POST /api/databases/users/:username/password
 * Cambiar contraseña de un usuario en MariaDB.
 */
const changePasswordHandler = async (req, res) => {
  try {
    const { username } = req.params;
    const { newPassword, password, host } = req.body;
    const pwd = newPassword || password;

    if (!pwd) {
      return res.status(400).json({
        success: false,
        error: 'El campo "newPassword" o "password" es requerido.'
      });
    }

    const result = await changeUserPassword(username, host || '%', pwd);
    res.json(result);
  } catch (error) {
    console.error(`Error al cambiar contraseña de usuario ${req.params.username}:`, error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

router.put('/users/:username/password', changePasswordHandler);
router.post('/users/:username/password', changePasswordHandler);

export default router;
