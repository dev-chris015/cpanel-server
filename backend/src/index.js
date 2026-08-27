import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import containerRoutes from './routes/containers.js';
import deployRoutes from './routes/deploy.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Endpoint de verificación de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas principales
app.use('/api/containers', containerRoutes);
app.use('/api/deploy', deployRoutes);

app.listen(PORT, () => {
  console.log(`Backend de cPanel corriendo en el puerto ${PORT}`);
});
