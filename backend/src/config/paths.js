import dotenv from 'dotenv';
dotenv.config();

export const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';

export default {
  DOCKER_SOCKET_PATH
};
