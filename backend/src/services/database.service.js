import { pool } from '../config/database.js';

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
  getMariaDbTelemetry
};
