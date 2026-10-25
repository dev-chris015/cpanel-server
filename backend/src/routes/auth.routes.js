import { Router } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { authenticateToken, JWT_SECRET } from '../middleware/auth.js';

dotenv.config();

const router = Router();

const ADMIN_USER = process.env.ADMIN_USER || 'superadmin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'nara5140';

/**
 * POST /api/auth/login
 * Recibe { username, password }
 * Valida contra ADMIN_USER / ADMIN_PASS (o superadmin / nara5140 por defecto)
 * Retorna JWT válido por 7 días.
 */
router.post(['/login', '/api/auth/login'], (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren username y password'
    });
  }

  if (username !== ADMIN_USER || password !== ADMIN_PASS) {
    return res.status(401).json({
      success: false,
      error: 'Credenciales inválidas'
    });
  }

  const payload = {
    username: ADMIN_USER,
    role: 'superadmin'
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

  return res.json({
    success: true,
    token,
    user: payload
  });
});

/**
 * GET /api/auth/me
 * Valida token JWT y retorna los datos del usuario autenticado.
 */
router.get(['/me', '/api/auth/me'], authenticateToken, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

export default router;
