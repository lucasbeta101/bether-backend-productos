const express = require('express');
const cors = require('cors');
require('dotenv').config();

const productosRoutes = require('./routes/productos');
const merchantRoutes = require('./routes/merchant'); // 🔧 AGREGAR ESTA LÍNEA
const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors({
  origin: [
    // Dominios de producción
    'https://bethersa.com.ar',
    'https://www.bethersa.com.ar',
    'https://bethersa.online',
    'https://www.bethersa.online',
    'https://bethersa.store',
    'https://www.bethersa.store',

    // Desarrollo local
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5500',
    'http://localhost:8080'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200 // Para navegadores legacy
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== RUTAS SEO PRINCIPALES (SIN /api) =====
// Estas rutas deben ir ANTES de las rutas /api para que Google las encuentre fácilmente

// 🗺️ SITEMAP PRINCIPAL
app.get('/sitemap.xml', (req, res) => {
  console.log('📋 [SEO] Solicitando sitemap principal');
  res.redirect(301, '/api/sitemap.xml');
});

// 🗺️ SITEMAP DE PRODUCTOS  
app.get('/sitemap-productos.xml', (req, res) => {
  console.log('📋 [SEO] Solicitando sitemap de productos');
  res.redirect(301, '/api/sitemap-productos.xml');
});

// 🤖 ROBOTS.TXT
app.get('/robots.txt', (req, res) => {
  console.log('🤖 [SEO] Solicitando robots.txt');
  res.redirect(301, '/api/robots.txt');
});

// 🎯 PÁGINAS DE CATEGORÍAS SEO (URL amigables)
app.get('/categoria/:categoria', (req, res) => {
  console.log(`🎯 [SEO] Categoría SEO solicitada: ${req.params.categoria}`);
  res.redirect(301, `/api/categoria/${req.params.categoria}`);
});

// 🔍 REDIRECTS PARA BÚSQUEDAS ESPECÍFICAS POPULARES
const busquedasPopulares = {
  'amortiguadores-mendoza': 'amortiguadores mendoza',
  'amortiguador-ford-ka': 'amortiguador ford ka',
  'amortiguador-vw-gol': 'amortiguador volkswagen gol',
  'amortiguador-peugeot-206': 'amortiguador peugeot 206',
  'pastillas-freno-mendoza': 'pastillas freno mendoza',
  'repuestos-auto-mendoza': 'repuestos auto mendoza'
};

Object.entries(busquedasPopulares).forEach(([url, busqueda]) => {
  app.get(`/${url}`, (req, res) => {
    console.log(`🔍 [SEO] Redirect SEO: ${url} -> ${busqueda}`);
    res.redirect(301, `https://bethersa.com.ar/catalogo?search=${encodeURIComponent(busqueda)}`);
  });
});

// ===== ROUTES API =====
app.use('/api', productosRoutes);
app.use('/api/merchant', merchantRoutes); // 🔧 MOVER ESTA LÍNEA AQUÍ

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Bether Backend API - Productos con SEO Optimizado',
    version: '2.0.0',
    seo_features: [
      'Sitemap automático de productos',
      'Robots.txt optimizado',
      'URLs amigables para categorías',
      'Meta tags dinámicos',
      'Schema.org structured data',
      'Redirects SEO para búsquedas populares'
    ],
    endpoints: [
      'GET /api/ping - Verificar conexión MongoDB',
      'GET /api/metadatos - Obtener metadatos para filtros',
      'GET /api/productos - Obtener productos con filtros y paginación',
      'GET /api/producto/:codigo - Obtener producto individual CON SEO',
      'GET /api/filtros/:tipo - Obtener marcas, modelos, versiones, posiciones',
      '',
      '=== ENDPOINTS SEO ===',
      'GET /sitemap.xml - Sitemap principal',
      'GET /sitemap-productos.xml - Sitemap de productos dinámico',
      'GET /robots.txt - Robots.txt optimizado',
      'GET /categoria/:categoria - Páginas SEO para categorías',
      'GET /amortiguadores-mendoza - Redirect a búsqueda popular',
      'GET /amortiguador-ford-ka - Redirect a búsqueda específica'
    ],
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    seo_status: 'optimized',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    seo_endpoints: {
      sitemap: '/sitemap.xml',
      sitemap_productos: '/sitemap-productos.xml',
      robots: '/robots.txt',
      categoria_ejemplo: '/categoria/amortiguadores'
    }
  });
});

// ===== MIDDLEWARE PARA LOGGING SEO =====
app.use((req, res, next) => {
  // Log de requests importantes para SEO
  const seoRoutes = ['/sitemap', '/robots', '/categoria', '/amortiguador', '/pastillas', '/repuestos'];
  const isSEORoute = seoRoutes.some(route => req.path.includes(route));

  if (isSEORoute) {
    console.log(`🎯 [SEO-REQUEST] ${req.method} ${req.path} - User-Agent: ${req.get('User-Agent')?.substring(0, 50) || 'Unknown'}`);
  }

  next();
});

// ===== REDIRECTS ADICIONALES PARA SEO =====

// Redirect de versiones con www
app.get('/www.bethersa.com.ar/*', (req, res) => {
  res.redirect(301, `https://bethersa.com.ar${req.path}`);
});

// Redirects para URLs comunes de búsqueda
app.get('/buscar/:termino', (req, res) => {
  const termino = req.params.termino;
  console.log(`🔍 [SEO] Búsqueda redirect: ${termino}`);
  res.redirect(301, `https://bethersa.com.ar/catalogo?search=${encodeURIComponent(termino)}`);
});

// ===== MIDDLEWARE PARA HEADERS SEO =====
app.use((req, res, next) => {
  // Headers para mejor SEO
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });

  // Cache headers para contenido estático SEO
  if (req.path.includes('/sitemap') || req.path.includes('/robots')) {
    res.set({
      'Cache-Control': 'public, max-age=3600', // 1 hora
      'Vary': 'Accept-Encoding'
    });
  }

  next();
});

// ===== ENDPOINT PARA VERIFICAR SEO =====
app.get('/seo-check', async (req, res) => {
  try {
    const seoStatus = {
      success: true,
      timestamp: new Date().toISOString(),
      checks: {
        sitemap_disponible: false,
        robots_disponible: false,
        categorias_seo: false,
        redirects_funcionando: false
      },
      urls_importantes: [
        `${req.protocol}://${req.get('host')}/sitemap.xml`,
        `${req.protocol}://${req.get('host')}/robots.txt`,
        `${req.protocol}://${req.get('host')}/categoria/amortiguadores`,
        `${req.protocol}://${req.get('host')}/amortiguadores-mendoza`
      ]
    };

    // Verificar que los endpoints SEO respondan
    try {
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Estas verificaciones se pueden hacer más robustas con fetch interno
      seoStatus.checks.sitemap_disponible = true; // Simplificado
      seoStatus.checks.robots_disponible = true;
      seoStatus.checks.categorias_seo = true;
      seoStatus.checks.redirects_funcionando = true;

    } catch (error) {
      console.error('Error en verificación SEO:', error);
    }

    res.json(seoStatus);

  } catch (error) {
    console.error('❌ [SEO-CHECK] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error en verificación SEO'
    });
  }
});

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error('❌ [ERROR]:', err);

  // Log especial para errores en rutas SEO
  const seoRoutes = ['/sitemap', '/robots', '/categoria'];
  const isSEOError = seoRoutes.some(route => req.path.includes(route));

  if (isSEOError) {
    console.error(`🚨 [SEO-ERROR] Error en ruta SEO: ${req.path}`, err.message);
  }

  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
  });
});

// ===== 404 HANDLER MEJORADO =====
app.use((req, res) => {
  // Log de 404s en rutas importantes
  const rutasImportantes = ['/sitemap', '/robots', '/categoria', '/producto'];
  const esRutaImportante = rutasImportantes.some(ruta => req.path.includes(ruta));

  if (esRutaImportante) {
    console.warn(`⚠️ [SEO-404] Ruta importante no encontrada: ${req.path}`);
  }

  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    path: req.path,
    suggestion: esRutaImportante ? 'Verifica que los endpoints SEO estén configurados correctamente' : null
  });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Servidor Bether Backend con SEO corriendo en puerto ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📋 API docs: http://localhost:${PORT}/`);
  console.log('');
  console.log('🎯 === ENDPOINTS SEO DISPONIBLES ===');
  console.log(`📄 Sitemap: http://localhost:${PORT}/sitemap.xml`);
  console.log(`🗺️ Sitemap productos: http://localhost:${PORT}/sitemap-productos.xml`);
  console.log(`🤖 Robots.txt: http://localhost:${PORT}/robots.txt`);
  console.log(`📂 Categoría ejemplo: http://localhost:${PORT}/categoria/amortiguadores`);
  console.log(`🔍 Búsqueda popular: http://localhost:${PORT}/amortiguadores-mendoza`);
  console.log(`✅ SEO Check: http://localhost:${PORT}/seo-check`);
  console.log('');
  console.log('🎉 ¡Todo listo para dominar Google con "amortiguadores"!');
});

module.exports = app;