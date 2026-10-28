import dotenv from 'dotenv';
dotenv.config();

export const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
export const NGINX_VHOSTS_DIR = process.env.NGINX_VHOSTS_DIR || '/etc/nginx/conf.d';
export const NGINX_CONTAINER_NAME = process.env.NGINX_CONTAINER_NAME || 'cpanel-frontend';

export default {
  DOCKER_SOCKET_PATH,
  NGINX_VHOSTS_DIR,
  NGINX_CONTAINER_NAME
};

