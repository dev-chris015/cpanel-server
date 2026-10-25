FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

# Acceso como root para interactuar con /var/run/docker.sock
USER root

EXPOSE 5000

ENV PORT=5000
ENV DOCKER_SOCKET_PATH=/var/run/docker.sock

CMD ["node", "src/index.js"]
