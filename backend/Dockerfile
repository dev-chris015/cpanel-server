FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 5000

ENV PORT=5000
ENV DOCKER_SOCKET_PATH=/var/run/docker.sock

CMD ["node", "src/index.js"]
