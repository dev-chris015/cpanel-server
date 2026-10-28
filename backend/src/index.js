import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';

import authRoutes from './routes/auth.routes.js';
import containerRoutes from './routes/containers.routes.js';
import databaseRoutes from './routes/databases.routes.js';
import systemRoutes from './routes/system.routes.js';
import deployRoutes from './routes/deploy.js';
import proxyRoutes from './routes/proxy.routes.js';

import { authenticateToken, socketAuthMiddleware } from './middleware/auth.js';

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
// Rutas públicas
app.use('/api/auth', authRoutes);

// Rutas protegidas
app.use('/api/containers', authenticateToken, containerRoutes);
app.use('/api/databases', authenticateToken, databaseRoutes);
app.use('/api/system', authenticateToken, systemRoutes);
app.use('/api/deploy', authenticateToken, deployRoutes);
app.use('/api/proxy', authenticateToken, proxyRoutes);

// Servidor HTTP + WebSockets (Socket.io)
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware de autenticación para Socket.io
io.use(socketAuthMiddleware);

io.on('connection', (socket) => {
  // Registrar manejadores de eventos socket
  registerLogsSocket(io, socket);
  registerStatsSocket(io, socket);
  registerContainerStatsSocket(io, socket);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend de cPanel corriendo en http://0.0.0.0:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('Error no capturado (uncaughtException):', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada no manejada (unhandledRejection):', reason);
});

export { app, server, io };
