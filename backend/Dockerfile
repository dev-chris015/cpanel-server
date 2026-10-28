FROM node:20-alpine

WORKDIR /app

# Instalar Nginx para validación sintáctica (nginx -t) y cliente MariaDB para mariadb-dump
RUN apk add --no-cache nginx mariadb-client

COPY package*.json ./

RUN npm install --production

COPY . .

# Garantizar ejecución bajo USER root para interactuar con /var/run/docker.sock sin problemas de permisos
USER root

EXPOSE 5000

ENV PORT=5000
ENV DOCKER_SOCKET_PATH=/var/run/docker.sock

CMD ["node", "src/index.js"]

