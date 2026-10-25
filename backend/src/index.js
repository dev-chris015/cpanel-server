import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

import containerRoutes from './routes/containers.routes.js';
import databaseRoutes from './routes/databases.routes.js';
import systemRoutes from './routes/system.routes.js';
import deployRoutes from './routes/deploy.js';

import { registerLogsSocket } from './sockets/logs.socket.js';
import { registerStatsSocket } from './sockets/stats.socket.js';
import { registerContainerStatsSocket } from './sockets/container-stats.socket.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Configuración de middlewares
app.use(cors());
app.use(express.json());

// Verificación de salud del servidor
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas REST
app.use('/api/containers', containerRoutes);
app.use('/api/databases', databaseRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/deploy', deployRoutes);

// Servidor HTTP + WebSockets (Socket.io)
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  // Registrar manejadores de eventos socket
  registerLogsSocket(io, socket);
  registerStatsSocket(io, socket);
  registerContainerStatsSocket(io, socket);
});

server.listen(PORT, () => {
  console.log(`Backend de cPanel corriendo en el puerto ${PORT}`);
});

export { app, server, io };
