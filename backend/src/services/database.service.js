import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import streamModule from 'stream';
import Docker from 'dockerode';
import { pool, dbConfig } from '../config/database.js';
import { DOCKER_SOCKET_PATH, BACKUP_DIR, MARIADB_CONTAINER_NAME } from '../config/paths.js';

const docker = new Docker({ socketPath: DOCKER_SOCKET_PATH });

/**
 * Lista de esquemas del sistema MariaDB protegidos contra eliminación y manipulación destructiva.
 */
export const SYSTEM_SCHEMAS = Object.freeze([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
  'test'
]);

/**
 * Lista de usuarios internos de MariaDB protegidos contra eliminación.
 */
export const SYSTEM_USERS = Object.freeze([
  'mariadb.sys',
  'mysql.sys',
  'mysql.session',
  'mysql.infoschema',
  'healthcheck'
]);

/**
 * Lista blanca de privilegios SQL permitidos.
 */
export const ALLOWED_PRIVILEGES = Object.freeze([
  'ALL PRIVILEGES',
  'ALL',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'CREATE',
  'DROP',
  'INDEX',
  'ALTER',
  'LOCK TABLES',
  'EXECUTE',
  'CREATE VIEW',
  'SHOW VIEW',
  'TRIGGER',
  'REFERENCES'
]);

/**
 * Validador estricto de identificadores SQL para bases de datos (letras, números y guiones bajos; máx 64 chars).
 */
export const isValidSqlIdentifier = (name) => {
  if (!name || typeof name !== 'string') return false;
  return /^[a-zA-Z0-9_]{1,64}$/.test(name);
};

/**
 * Validador de nombre de usuario de base de datos.
 */
export const isValidUserIdentifier = (name) => {
  if (!name || typeof name !== 'string') return false;
  return /^[a-zA-Z0-9_.-]{1,32}$/.test(name);
};

/**
 * Validador de host de base de datos (IP, %, localhost, FQDN).
 */
export const isValidHostIdentifier = (host) => {
  if (!host || typeof host !== 'string') return false;
  return host === '%' || /^[a-zA-Z0-9_.:%-]{1,255}$/.test(host);
};

/**
 * Sanitiza una lista de privilegios contra la lista blanca.
 */
export const sanitizePrivileges = (privs = 'ALL PRIVILEGES') => {
  if (typeof privs !== 'string') return 'ALL PRIVILEGES';
  const parts = privs.split(',').map(p => p.trim().toUpperCase());
  const valid = parts.filter(p => ALLOWED_PRIVILEGES.includes(p));
  if (valid.length === 0) return 'ALL PRIVILEGES';
  return valid.join(', ');
};

/**
 * Obtiene el directorio para almacenar respaldos (/srv/backups por defecto).
 * Si no se tienen permisos de escritura o no existe, usa fallback local.
 */
export const getBackupDir = () => {
  const targetDir = process.env.BACKUP_DIR || BACKUP_DIR || '/srv/backups';
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.accessSync(targetDir, fs.constants.W_OK);
    return targetDir;
  } catch {
    const fallback = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    return fallback;
  }
};

/**
 * Formatea un timestamp limpio y ordenable (YYYYMMDD_HHmmss) para nombres de archivo de respaldo.
 */
export const generateBackupTimestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const MM = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${MM}${dd}_${hh}${mm}${ss}`;
};

// ==============================================================================
// 1. GESTIÓN DE ESQUEMAS / BASES DE DATOS (CON BLOQUEO DE SISTEMA)
// ==============================================================================

/**
 * Crea un nuevo esquema / base de datos en MariaDB.
 */
export const createSchema = async (dbName, options = {}) => {
  if (!isValidSqlIdentifier(dbName)) {
    throw new Error('Nombre de base de datos inválido. Solo se permiten letras, números y guiones bajos (máx. 64 caracteres).');
  }

  const cleanName = dbName.toLowerCase();
  if (SYSTEM_SCHEMAS.includes(cleanName)) {
    throw new Error(`Operación denegada: "${dbName}" es un nombre reservado para esquemas del sistema.`);
  }

  const charset = options.charset || 'utf8mb4';
  const collation = options.collation || 'utf8mb4_unicode_ci';

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET ${charset} COLLATE ${collation};`);
    return {
      success: true,
      database: dbName,
      charset,
      collation,
      message: `Base de datos "${dbName}" creada exitosamente.`
    };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Elimina una base de datos con bloqueo estricto de esquemas del sistema.
 */
export const dropSchema = async (dbName) => {
  if (!isValidSqlIdentifier(dbName)) {
    throw new Error('Nombre de base de datos inválido.');
  }

  const cleanName = dbName.toLowerCase();
  if (SYSTEM_SCHEMAS.includes(cleanName)) {
    const error = new Error(`Operación denegada: El esquema "${dbName}" es un esquema reservado del sistema MariaDB y no puede ser eliminado.`);
    error.statusCode = 403;
    error.isSystemSchema = true;
    throw error;
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(`DROP DATABASE \`${dbName}\`;`);
    return {
      success: true,
      database: dbName,
      message: `Base de datos "${dbName}" eliminada correctamente.`
    };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Lista todos los esquemas con su peso en MB, tablas y flag isSystem.
 */
export const listSchemas = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(`
      SELECT 
        s.schema_name AS name,
        s.default_character_set_name AS charset,
        s.default_collation_name AS collation,
        COALESCE(ROUND(SUM(t.data_length + t.index_length) / 1024 / 1024, 2), 0) AS size_mb,
        COUNT(t.table_name) AS tables_count
      FROM information_schema.SCHEMATA s
      LEFT JOIN information_schema.TABLES t ON s.schema_name = t.table_schema
      GROUP BY s.schema_name, s.default_character_set_name, s.default_collation_name
      ORDER BY s.schema_name ASC;
    `);

    return rows.map(r => ({
      name: r.name,
      charset: r.charset,
      collation: r.collation,
      sizeMb: parseFloat(r.size_mb) || 0,
      tablesCount: parseInt(r.tables_count, 10) || 0,
      isSystem: SYSTEM_SCHEMAS.includes(r.name.toLowerCase())
    }));
  } finally {
    if (connection) connection.release();
  }
};

// ==============================================================================
// 2. DISPARO DE VOLCADOS MANUALES CON MARIADB-DUMP
// ==============================================================================

/**
 * Ejecuta un volcado manual con mariadb-dump (o mysqldump) hacia /srv/backups/${dbName}_${timestamp}.sql.
 * Soporta ejecución local mediante binario CLI o ejecución dentro del contenedor Docker de MariaDB.
 */
export const createBackup = async (dbName) => {
  if (!isValidSqlIdentifier(dbName)) {
    throw new Error('Nombre de base de datos inválido.');
  }

  const backupDir = getBackupDir();
  const timestamp = generateBackupTimestamp();
  const fileName = `${dbName}_${timestamp}.sql`;
  const filePath = path.join(backupDir, fileName);

  const host = dbConfig.host;
  const port = String(dbConfig.port);
  const user = dbConfig.user;
  const password = dbConfig.password;

  // 1. Intentar ejecución mediante binario CLI local si existe
  const tryLocalDump = async () => {
    return new Promise((resolve, reject) => {
      // Probar mariadb-dump o mysqldump
      const dumpCmd = 'mariadb-dump';
      const dumpArgs = [
        '-h', host,
        '-P', port,
        '-u', user,
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        dbName
      ];

      const child = spawn(dumpCmd, dumpArgs, {
        env: {
          ...process.env,
          MYSQL_PWD: password
        }
      });

      const writeStream = fs.createWriteStream(filePath);
      let stderrOutput = '';

      child.stdout.pipe(writeStream);
      child.stderr.on('data', chunk => { stderrOutput += chunk.toString(); });

      child.on('error', (err) => {
        // Si no se encuentra el comando local, intentar con mysqldump
        if (err.code === 'ENOENT') {
          const fallbackChild = spawn('mysqldump', dumpArgs, {
            env: { ...process.env, MYSQL_PWD: password }
          });
          const fbWriteStream = fs.createWriteStream(filePath);
          let fbStderr = '';
          fallbackChild.stdout.pipe(fbWriteStream);
          fallbackChild.stderr.on('data', chunk => { fbStderr += chunk.toString(); });
          fallbackChild.on('error', reject);
          fallbackChild.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(fbStderr || `mysqldump falló con código ${code}`));
          });
        } else {
          reject(err);
        }
      });

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderrOutput || `mariadb-dump falló con código ${code}`));
      });
    });
  };

  // 2. Intentar ejecución dentro del contenedor Docker de MariaDB
  const tryDockerDump = async () => {
    const containerNames = [
      process.env.MARIADB_CONTAINER_NAME,
      MARIADB_CONTAINER_NAME,
      'wordpress_org_db',
      'mariadb'
    ].filter(Boolean);

    let lastError = null;

    for (const cName of containerNames) {
      try {
        const container = docker.getContainer(cName);
        const dumpArgs = [
          'mariadb-dump',
          '-u', user,
          `--password=${password}`,
          '--single-transaction',
          '--quick',
          '--routines',
          '--triggers',
          dbName
        ];

        const execInstance = await container.exec({
          Cmd: dumpArgs,
          AttachStdout: true,
          AttachStderr: true,
          Tty: false
        });

        const stream = await execInstance.start({});
        const outStream = fs.createWriteStream(filePath);
        let errOutput = '';
        const errStream = new streamModule.Writable({
          write(chunk, enc, cb) {
            errOutput += chunk.toString();
            cb();
          }
        });

        docker.modem.demuxStream(stream, outStream, errStream);

        await new Promise((resolve, reject) => {
          stream.on('end', () => {
            outStream.end(() => resolve());
          });
          stream.on('error', reject);
          outStream.on('error', reject);
        });

        const inspectData = await execInstance.inspect();
        if (inspectData.ExitCode === 0 && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          return true;
        } else {
          lastError = new Error(errOutput || 'El volcado en el contenedor Docker devolvió un archivo vacío.');
        }
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('No se encontró un contenedor MariaDB activo para ejecutar el volcado.');
  };

  try {
    try {
      await tryLocalDump();
    } catch {
      await tryDockerDump();
    }

    if (!fs.existsSync(filePath)) {
      throw new Error('El archivo de respaldo no fue generado.');
    }

    const stats = fs.statSync(filePath);
    return {
      success: true,
      fileName,
      filePath,
      dbName,
      sizeBytes: stats.size,
      sizeMb: Math.round((stats.size / 1024 / 1024) * 100) / 100,
      timestamp,
      createdAt: stats.birthtime || stats.mtime
    };
  } catch (error) {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
    throw new Error(`Fallo al generar el volcado manual de "${dbName}": ${error.message}`);
  }
};

// ==============================================================================
// 3. GESTIÓN DE COPIAS DE SEGURIDAD (LISTAR, DESCARGAR, ELIMINAR)
// ==============================================================================

/**
 * Lista las copias de seguridad existentes en /srv/backups.
 */
export const listBackups = () => {
  const backupDir = getBackupDir();
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.sql'));

  const backups = files.map(fileName => {
    const filePath = path.join(backupDir, fileName);
    const stats = fs.statSync(filePath);

    // Extraer dbName y timestamp de ${dbName}_${timestamp}.sql
    const nameWithoutExt = fileName.slice(0, -4);
    const match = fileName.match(/^(.+?)_(\d{8}_\d{6}|\d{14}|\d{4}-\d{2}-\d{2}[-_]\d{2}-\d{2}-\d{2}|\d{10,13})\.sql$/);
    const lastUnderscore = nameWithoutExt.lastIndexOf('_');
    const dbName = match ? match[1] : (lastUnderscore !== -1 ? nameWithoutExt.substring(0, lastUnderscore) : nameWithoutExt);
    const timestamp = match ? match[2] : (lastUnderscore !== -1 ? nameWithoutExt.substring(lastUnderscore + 1) : null);

    return {
      fileName,
      filePath,
      dbName,
      timestamp,
      sizeBytes: stats.size,
      sizeMb: Math.round((stats.size / 1024 / 1024) * 100) / 100,
      createdAt: stats.birthtime || stats.mtime
    };
  });

  // Ordenar de más reciente a más antiguo
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    backupDir,
    backups
  };
};

/**
 * Valida y obtiene la ruta absoluta segura de un archivo de respaldo.
 * Garantiza el uso estricto de path.basename(), bloqueo contra path traversal
 * ('..', '/', '\', caracteres de control) y verificación de frontera de directorio.
 */
export const getBackupFilePath = (fileName) => {
  if (!fileName || typeof fileName !== 'string') {
    throw new Error('Nombre de archivo de respaldo inválido.');
  }

  // 1. Extraer nombre base estricto sin componentes de ruta
  const safeBaseName = path.basename(fileName.trim());

  // 2. Prevenir Directory Traversal y secuencias no autorizadas
  if (
    fileName.trim() !== safeBaseName ||
    safeBaseName.includes('..') ||
    safeBaseName.includes('/') ||
    safeBaseName.includes('\\') ||
    !safeBaseName.endsWith('.sql') ||
    /[\x00-\x1f\x7f]/.test(safeBaseName)
  ) {
    const error = new Error('Nombre de archivo no permitido: contiene secuencias de ruta o caracteres de escape.');
    error.statusCode = 400;
    throw error;
  }

  const backupDir = getBackupDir();
  const resolvedDir = path.resolve(backupDir);
  const fullPath = path.resolve(backupDir, safeBaseName);

  // 3. Verificación de frontera de directorio: la ruta resuelta DEBE pertenecer a backupDir
  if (!fullPath.startsWith(resolvedDir + path.sep)) {
    const error = new Error('Violación de seguridad: intento de acceso fuera del directorio de respaldos.');
    error.statusCode = 403;
    throw error;
  }

  if (!fs.existsSync(fullPath)) {
    const error = new Error(`El archivo de respaldo "${safeBaseName}" no existe.`);
    error.statusCode = 404;
    throw error;
  }

  return fullPath;
};

/**
 * Elimina una copia de seguridad específica.
 */
export const deleteBackup = (fileName) => {
  const filePath = getBackupFilePath(fileName);
  fs.unlinkSync(filePath);
  return {
    success: true,
    fileName,
    message: `Copia de seguridad "${fileName}" eliminada exitosamente.`
  };
};

// ==============================================================================
// 4. GESTIÓN DE USUARIOS Y PERMISOS EN MARIADB (mysql.user)
// ==============================================================================

/**
 * Lista todos los usuarios registrados en MariaDB consultando mysql.user.
 */
export const listDatabaseUsers = async () => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(`
      SELECT 
        User AS user,
        Host AS host,
        plugin
      FROM mysql.user
      ORDER BY User ASC, Host ASC;
    `);

    return rows.map(r => ({
      user: r.user,
      host: r.host,
      plugin: r.plugin,
      isSystemUser: SYSTEM_USERS.includes(r.user.toLowerCase()) || r.user.toLowerCase() === 'root'
    }));
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Obtiene los permisos (GRANTS) de un usuario específico.
 */
export const getUserGrants = async (username, host = '%') => {
  if (!isValidUserIdentifier(username) || !isValidHostIdentifier(host)) {
    throw new Error('Identificador de usuario o host inválido.');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.query(`SHOW GRANTS FOR \`${username}\`@\`${host}\`;`);
    return rows.map(r => Object.values(r)[0]);
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Crea un nuevo usuario en MariaDB con opción de asignar permisos iniciales a una base de datos.
 */
export const createDatabaseUser = async ({
  username,
  password,
  host = '%',
  database,
  privileges = 'ALL PRIVILEGES'
}) => {
  if (!isValidUserIdentifier(username)) {
    throw new Error('Nombre de usuario inválido. Solo se permiten caracteres alfanuméricos, guiones y guiones bajos (máx. 32 caracteres).');
  }
  if (!isValidHostIdentifier(host)) {
    throw new Error('Host inválido.');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('La contraseña es requerida.');
  }

  const cleanUser = username.toLowerCase();
  if (SYSTEM_USERS.includes(cleanUser) || cleanUser === 'root') {
    throw new Error(`Operación denegada: No se puede crear o sobrescribir el usuario protegido "${username}".`);
  }

  let connection;
  try {
    connection = await pool.getConnection();

    // 1. Crear usuario con contraseña protegida mediante escape
    await connection.query(
      `CREATE USER \`${username}\`@\`${host}\` IDENTIFIED BY ${connection.escape(password)};`
    );

    // 2. Si se proporcionó una base de datos, otorgar permisos
    let grantedPrivileges = null;
    if (database) {
      if (database !== '*' && !isValidSqlIdentifier(database)) {
        throw new Error('Nombre de base de datos para permisos inválido.');
      }
      const targetDb = database === '*' ? '*' : `\`${database}\``;
      grantedPrivileges = sanitizePrivileges(privileges);
      await connection.query(
        `GRANT ${grantedPrivileges} ON ${targetDb}.* TO \`${username}\`@\`${host}\`;`
      );
    }

    // 3. Aplicar privilegios
    await connection.query('FLUSH PRIVILEGES;');

    return {
      success: true,
      user: username,
      host,
      database: database || null,
      privileges: grantedPrivileges,
      message: `Usuario "${username}"@"${host}" creado exitosamente.`
    };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Elimina un usuario de MariaDB garantizando protección de usuarios del sistema y root.
 */
export const dropDatabaseUser = async (username, host = '%') => {
  if (!isValidUserIdentifier(username) || !isValidHostIdentifier(host)) {
    throw new Error('Identificador de usuario o host inválido.');
  }

  const cleanUser = username.toLowerCase();
  if (SYSTEM_USERS.includes(cleanUser) || cleanUser === 'root') {
    const error = new Error(`Operación denegada: El usuario "${username}" es un usuario protegido del sistema y no puede ser eliminado.`);
    error.statusCode = 403;
    throw error;
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(`DROP USER \`${username}\`@\`${host}\`;`);
    await connection.query('FLUSH PRIVILEGES;');
    return {
      success: true,
      user: username,
      host,
      message: `Usuario "${username}"@"${host}" eliminado exitosamente.`
    };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Otorga (GRANT) o revoca (REVOKE) permisos a un usuario en una base de datos.
 */
export const modifyUserPrivileges = async ({
  username,
  host = '%',
  database = '*',
  privileges = 'ALL PRIVILEGES',
  action = 'GRANT'
}) => {
  if (!isValidUserIdentifier(username) || !isValidHostIdentifier(host)) {
    throw new Error('Identificador de usuario o host inválido.');
  }
  if (database !== '*' && !isValidSqlIdentifier(database)) {
    throw new Error('Nombre de base de datos inválido.');
  }

  const normalizedAction = (action || 'GRANT').toUpperCase();
  if (normalizedAction !== 'GRANT' && normalizedAction !== 'REVOKE') {
    throw new Error('Acción no permitida. Debe ser "GRANT" o "REVOKE".');
  }

  const safePrivileges = sanitizePrivileges(privileges);
  const targetDb = database === '*' ? '*' : `\`${database}\``;

  let connection;
  try {
    connection = await pool.getConnection();

    if (normalizedAction === 'GRANT') {
      await connection.query(
        `GRANT ${safePrivileges} ON ${targetDb}.* TO \`${username}\`@\`${host}\`;`
      );
    } else {
      await connection.query(
        `REVOKE ${safePrivileges} ON ${targetDb}.* FROM \`${username}\`@\`${host}\`;`
      );
    }

    await connection.query('FLUSH PRIVILEGES;');

    return {
      success: true,
      user: username,
      host,
      database,
      privileges: safePrivileges,
      action: normalizedAction,
      message: `Privilegios ${normalizedAction === 'GRANT' ? 'otorgados' : 'revocados'} correctamente a "${username}"@"${host}".`
    };
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Cambia la contraseña de un usuario en MariaDB.
 */
export const changeUserPassword = async (username, host = '%', newPassword) => {
  if (!isValidUserIdentifier(username) || !isValidHostIdentifier(host)) {
    throw new Error('Identificador de usuario o host inválido.');
  }
  if (!newPassword || typeof newPassword !== 'string') {
    throw new Error('La nueva contraseña es requerida.');
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(
      `ALTER USER \`${username}\`@\`${host}\` IDENTIFIED BY ${connection.escape(newPassword)};`
    );
    await connection.query('FLUSH PRIVILEGES;');
    return {
      success: true,
      user: username,
      host,
      message: `Contraseña actualizada exitosamente para el usuario "${username}"@"${host}".`
    };
  } finally {
    if (connection) connection.release();
  }
};

// ==============================================================================
// 5. TELEMETRÍA EXISTENTE (COMPATIBILIDAD CON VISTAS DEL FRONTEND)
// ==============================================================================

/**
 * Obtiene telemetría de MariaDB:
 * - Tamaño en MB de cada base de datos (consultando information_schema.TABLES)
 * - Conexiones activas (SHOW GLOBAL STATUS LIKE 'Threads_connected' y 'Max_used_connections')
 */
export const getMariaDbTelemetry = async () => {
  let connection;
  try {
    connection = await pool.getConnection();

    // 1. Tamaño en MB de cada base de datos
    const [sizeRows] = await connection.query(`
      SELECT 
        table_schema AS \`database\`,
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
      FROM information_schema.TABLES
      GROUP BY table_schema
      ORDER BY size_mb DESC
    `);

    // 2. Conexiones y estado global
    const [statusRows] = await connection.query(`
      SHOW GLOBAL STATUS WHERE Variable_name IN (
        'Threads_connected',
        'Threads_running',
        'Max_used_connections',
        'Uptime',
        'Queries'
      )
    `);

    const statusMap = {};
    for (const row of statusRows) {
      statusMap[row.Variable_name] = row.Value;
    }

    const totalSizeMb = sizeRows.reduce((acc, curr) => acc + (parseFloat(curr.size_mb) || 0), 0);

    return {
      connected: true,
      connections: {
        active: parseInt(statusMap['Threads_connected'] || '0', 10),
        running: parseInt(statusMap['Threads_running'] || '0', 10),
        maxUsed: parseInt(statusMap['Max_used_connections'] || '0', 10)
      },
      uptimeSeconds: parseInt(statusMap['Uptime'] || '0', 10),
      totalQueries: parseInt(statusMap['Queries'] || '0', 10),
      databases: sizeRows.map(row => ({
        database: row.database,
        sizeMb: parseFloat(row.size_mb) || 0
      })),
      totalSizeMb: Math.round(totalSizeMb * 100) / 100
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
      connections: { active: 0, running: 0, maxUsed: 0 },
      databases: [],
      totalSizeMb: 0
    };
  } finally {
    if (connection) connection.release();
  }
};

export default {
  SYSTEM_SCHEMAS,
  SYSTEM_USERS,
  isValidSqlIdentifier,
  isValidUserIdentifier,
  isValidHostIdentifier,
  sanitizePrivileges,
  getBackupDir,
  generateBackupTimestamp,
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
  changeUserPassword,
  getMariaDbTelemetry
};
