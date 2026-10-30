import dotenv from 'dotenv';
dotenv.config();

export const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
export const DEFAULT_DOCKER_NETWORK = process.env.DEFAULT_DOCKER_NETWORK || 'server-net';
export const NGINX_VHOSTS_DIR = process.env.NGINX_VHOSTS_DIR || '/etc/nginx/conf.d';
export const NGINX_CONTAINER_NAME = process.env.NGINX_CONTAINER_NAME || 'cpanel-frontend';
export const BACKUP_DIR = process.env.BACKUP_DIR || '/srv/backups';
export const MARIADB_CONTAINER_NAME = process.env.MARIADB_CONTAINER_NAME || 'wordpress_org_db';

export default {
  DOCKER_SOCKET_PATH,
  DEFAULT_DOCKER_NETWORK,
  NGINX_VHOSTS_DIR,
  NGINX_CONTAINER_NAME,
  BACKUP_DIR,
  MARIADB_CONTAINER_NAME
};

