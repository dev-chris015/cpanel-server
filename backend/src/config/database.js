import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || process.env.MARIADB_HOST || 'mariadb',
  port: parseInt(process.env.DB_PORT || process.env.MARIADB_PORT || '3306', 10),
  user: process.env.DB_USER || process.env.MARIADB_USER || process.env.MARIADB_ROOT_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || process.env.MARIADB_ROOT_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 5000
};

export const pool = mysql.createPool(dbConfig);
export { dbConfig };

export default pool;
