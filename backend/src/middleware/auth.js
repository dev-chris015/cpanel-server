import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const JWT_SECRET = process.env.JWT_SECRET || 'cpanel-secret-key-change-in-production';

/**
 * Middleware para validar token JWT en headers HTTP.
 * Espera el encabezado: Authorization: Bearer <token>
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader) {
    return res.status(401).json({
      success: false,
      error: 'Token de acceso no proporcionado'
    });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      success: false,
      error: 'Formato de autorización inválido. Debe ser: Bearer <token>'
    });
  }

  const token = parts[1];

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Token inválido o expirado'
      });
    }

    req.user = decoded;
    next();
  });
};

// Alias para compatibilidad de nomenclatura
export const verifyToken = authenticateToken;

/**
 * Middleware para Socket.io: io.use((socket, next) => { ... })
 * Valida el token provisto en socket.handshake.auth.token, cabeceras o parámetros query.
 */
export const socketAuthMiddleware = (socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers?.authorization &&
    socket.handshake.headers.authorization.startsWith('Bearer ')
      ? socket.handshake.headers.authorization.split(' ')[1]
      : socket.handshake.headers?.authorization) ||
    socket.handshake.query?.token;

  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error: Invalid or expired token'));
    }

    socket.user = decoded;
    next();
  });
};

export default {
  authenticateToken,
  verifyToken,
  socketAuthMiddleware,
  JWT_SECRET
};
