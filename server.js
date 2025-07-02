const express = require('express');
const cors = require('cors');
require('dotenv').config();

const productosRoutes = require('./routes/productos');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors({
  origin: ['https://bethersa.com.ar', 'http://localhost:3000', 'http://127.0.0.1:5500'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== ROUTES =====
app.use('/api', productosRoutes);

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bether Backend API - Productos',
    version: '1.0.0',
    endpoints: [
      'GET /api/ping - Verificar conexión MongoDB',
      'GET /api/metadatos - Obtener metadatos para filtros',
      'GET /api/productos - Obtener productos con filtros y paginación',
      'GET /api/producto/:codigo - Obtener producto individual',
      'GET /api/filtros/:tipo - Obtener marcas, modelos, versiones, posiciones'
    ],
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

// ===== 404 HANDLER =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    path: req.path
  });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Servidor Bether Backend corriendo en puerto ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 API docs: http://localhost:${PORT}/`);
});

module.exports = app;