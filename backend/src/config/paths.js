import dotenv from 'dotenv';
dotenv.config();

export const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
export const DEFAULT_DOCKER_NETWORK = process.env.DEFAULT_DOCKER_NETWORK || 'server-net';
export const NGINX_VHOSTS_DIR = process.env.NGINX_CONF_DIR || process.env.NGINX_VHOSTS_DIR || '/srv/nginx/conf.d';
export const NGINX_CONTAINER_NAME = process.env.NGINX_CONTAINER_NAME || 'nginx-proxy';
export const CERTS_DIR = process.env.CERTS_DIR || '/srv/nginx/certs';
export const BACKUP_DIR = process.env.BACKUP_DIR || '/srv/backups';
export const MARIADB_CONTAINER_NAME = process.env.MARIADB_CONTAINER_NAME || 'wordpress_org_db';
export const HOST_CERTBOT_CONF_DIR = process.env.HOST_CERTBOT_CONF_DIR || '/home/azureuser/server/certbot/conf';
export const HOST_CERTBOT_WWW_DIR = process.env.HOST_CERTBOT_WWW_DIR || '/home/azureuser/server/certbot/www';

export default {
  DOCKER_SOCKET_PATH,
  DEFAULT_DOCKER_NETWORK,
  NGINX_VHOSTS_DIR,
  NGINX_CONTAINER_NAME,
  CERTS_DIR,
  BACKUP_DIR,
  MARIADB_CONTAINER_NAME,
  HOST_CERTBOT_CONF_DIR,
  HOST_CERTBOT_WWW_DIR
};

