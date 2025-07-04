const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// ===== CONFIGURACIÓN MONGODB =====
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// 🚨 CONFIGURACIÓN ESPECIAL PARA RENDER.COM
const RENDER_CONFIG = {
  // Timeouts conservadores pero funcionales
  connectTimeoutMS: 30000,
  serverSelectionTimeoutMS: 25000,
  socketTimeoutMS: 45000,
  maxIdleTimeMS: 120000,
  
  // Pool de conexiones simple
  maxPoolSize: 5,
  minPoolSize: 1,
  
  // Configuraciones básicas
  retryWrites: true,
  retryReads: true,
  readPreference: 'secondaryPreferred'
};

// 🔄 SISTEMA DE CONEXIÓN SIMPLIFICADO
let cachedClient = null;
let isConnecting = false;
let connectionAttempts = 0;
let lastError = null;

// Variables para health check
let serverStartTime = Date.now();
let healthStatus = {
  status: 'starting',
  mongodb: 'disconnected',
  lastPing: null,
  uptime: 0,
  errors: []
};

async function connectToMongoDB() {
  // Si ya hay una conexión activa, usarla
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    console.log('📱 [MONGODB] Usando conexión existente');
    healthStatus.mongodb = 'connected';
    return cachedClient;
  }

  // Si ya se está conectando, esperar
  if (isConnecting) {
    console.log('⏳ [MONGODB] Esperando conexión en progreso...');
    let attempts = 0;
    while (isConnecting && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (cachedClient) return cachedClient;
  }

  isConnecting = true;
  connectionAttempts++;
  
  console.log(`🔌 [MONGODB] Intento de conexión ${connectionAttempts}`);
  
  try {
    // Detectar si es cold start
    const uptime = Date.now() - serverStartTime;
    const isColdStart = uptime < 120000; // Primeros 2 minutos
    
    // Timeouts adaptativos
    const timeouts = isColdStart ? {
      connectTimeoutMS: 45000,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000
    } : RENDER_CONFIG;
    
    console.log(`🔌 [MONGODB] Configuración: Cold Start=${isColdStart}, Timeout=${timeouts.connectTimeoutMS}ms`);
    
    const client = new MongoClient(MONGODB_URI, {
      ...timeouts,
      maxPoolSize: RENDER_CONFIG.maxPoolSize,
      minPoolSize: RENDER_CONFIG.minPoolSize,
      retryWrites: RENDER_CONFIG.retryWrites,
      retryReads: RENDER_CONFIG.retryReads,
      readPreference: RENDER_CONFIG.readPreference
    });

    // Conectar con timeout personalizado
    await Promise.race([
      client.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Connection timeout after ${timeouts.connectTimeoutMS}ms`)), timeouts.connectTimeoutMS)
      )
    ]);

    // Verificar conexión con ping
    await client.db(DB_NAME).command({ ping: 1 });
    
    cachedClient = client;
    lastError = null;
    isConnecting = false;
    healthStatus.mongodb = 'connected';
    healthStatus.status = 'connected';
    
    console.log('✅ [MONGODB] Conectado exitosamente');
    console.log(`📊 [MONGODB] Base de datos: ${DB_NAME}, Colección: ${COLLECTION_NAME}`);
    
    return client;
    
  } catch (error) {
    lastError = error;
    isConnecting = false;
    healthStatus.mongodb = 'error';
    healthStatus.status = 'error';
    healthStatus.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      attempt: connectionAttempts
    });
    
    console.error(`❌ [MONGODB] Error de conexión (intento ${connectionAttempts}):`, {
      message: error.message,
      code: error.code,
      uptime: Date.now() - serverStartTime
    });
    
    throw error;
  }
}

// Función de conexión con reintentos
async function connectWithRetry(maxRetries = 3, context = 'general') {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await connectToMongoDB();
    } catch (error) {
      console.error(`❌ [RETRY ${attempt}/${maxRetries}] ${context}:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = 2000 * attempt; // Delay progresivo
        console.log(`⏳ [RETRY] Esperando ${delay}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error; // Último intento falló
      }
    }
  }
}

// ===== MIDDLEWARE =====

// Middleware de logging
router.use((req, res, next) => {
  console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Middleware para cold start detection
router.use((req, res, next) => {
  const uptime = Date.now() - serverStartTime;
  req.isColdStart = uptime < 120000;
  req.uptime = uptime;
  
  // Headers informativos
  res.set({
    'X-Cold-Start': req.isColdStart.toString(),
    'X-Server-Uptime': uptime.toString(),
    'X-Render-Status': req.isColdStart ? 'warming-up' : 'ready'
  });
  
  next();
});

// Middleware de timeout adaptativo
router.use((req, res, next) => {
  const timeoutMs = req.isColdStart ? 60000 : 30000; // Más tiempo para cold starts
  
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      console.warn(`⏰ [TIMEOUT] Request timeout después de ${timeoutMs}ms`);
      res.status(408).json({
        success: false,
        error: 'Request timeout',
        coldStart: req.isColdStart,
        timeout: timeoutMs,
        fallback: true
      });
    }
  }, timeoutMs);
  
  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  
  next();
});

// ===== DATOS DE FALLBACK =====
const FALLBACK_DATA = {
  productos: [
    {
      codigo: "RENDER-001",
      nombre: "Servidor iniciándose - Por favor espera",
      categoria: "Sistema",
      marca: "Render",
      precio_lista_con_iva: "$0,00",
      image: "/img/placeholder-producto.webp",
      aplicaciones: [{ marca: "Sistema", modelo: "Cold Start", version: "2024" }],
      detalles_tecnicos: { "Posición de la pieza": "Servidor" },
      tiene_precio_valido: true,
      observaciones: "El servidor está iniciándose. Los servidores gratuitos de Render.com tardan 30-60 segundos en activarse."
    }
  ],
  metadatos: {
    codes: ["RENDER-001"],
    brands: ["Sistema", "Render"],
    models: ["Cold Start"],
    categories: ["Sistema"],
    vehicles: ["Sistema Cold Start"]
  }
};

// ===== CATEGORÍAS =====
const CATEGORIAS = {
  "Amortiguadores": [
    "Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP",
    "Amort LIP", "Amort PRO TUNNING"
  ],
  "Barras": ["Barras HD SADAR"],
  "Bieletas": ["Bieletas CORVEN", "Bieletas SADAR"],
  "Brazos Suspension": ["Brazos Susp CORVEN","Brazos Susp SADAR"],
  "Cazoletas": ["Cazoletas CORVEN", "Cazoletas SADAR"],
  "Discos y Campanas": ["Discos y Camp HF", "Discos y Camp CORVEN"],
  "Extremos": ["Extremos CORVEN", "Extremos SADAR"],
  "Axiales": ["Axiales CORVEN", "Axiales SADAR"],
  "Homocinéticas": ["Homocinéticas CORVEN", "Homocinéticas SADAR"],
  "Parrillas": ["Parrillas CORVEN", "Parrillas SADAR"],
  "Pastillas de Freno": ["Pastillas CORVEN C", "Pastillas CORVEN HT", "Pastillas FERODO", "Pastillas JURID"],
  "Rótulas": ["Rotulas CORVEN", "Rotulas SADAR"],
  "Embragues": ["Embragues CORVEN", "Embragues SADAR", "Embragues VALEO"],
  "Cajas y Bombas": ["Bombas Hid CORVEN", "Cajas Hid CORVEN", "Cajas Mec CORVEN"],
  "Rodamientos": ["Rodamientos CORVEN", "Rodamientos SADAR"],
  "Mazas": ["Mazas CORVEN", "Mazas HF"],
  "Semiejes": ["Semiejes CORVEN"],
  "Soportes Motor": ["Soporte Motor CORVEN"],
  "Suspensión Neumática": ["Susp Neumática SADAR"],
  "CTR": ["CTR"],
  "FTE": ["FTE"],
  "Gas Spring Stabilus": ["Gas Spring Stabilus"],
  "Otros": ["Otros"]
};

// ===== RUTAS =====

// 🏥 PING - Health check mejorado
router.get('/ping', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🏥 [PING] Iniciando health check...');
    
    // Actualizar health status
    healthStatus.uptime = Date.now() - serverStartTime;
    healthStatus.lastPing = new Date().toISOString();
    
    // Intentar conectar con menos reintentos para ping
    const client = await connectWithRetry(req.isColdStart ? 2 : 3, 'ping');
    
    // Test de ping
    await client.db(DB_NAME).command({ ping: 1 });
    
    // Contar documentos básico
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    const count = await collection.estimatedDocumentCount();
    
    const responseTime = Date.now() - startTime;
    healthStatus.status = 'healthy';
    
    console.log(`✅ [PING] Health check exitoso (${responseTime}ms)`);

    res.json({
      success: true,
      message: `MongoDB conectado exitosamente ${req.isColdStart ? '(Cold Start)' : '(Ready)'}`,
      responseTime: `${responseTime}ms`,
      
      // Información del servidor
      server: {
        status: req.isColdStart ? 'warming-up' : 'ready',
        uptime: req.uptime,
        coldStart: req.isColdStart,
        environment: process.env.NODE_ENV || 'unknown'
      },
      
      // Información de la base de datos
      database: {
        name: DB_NAME,
        collection: COLLECTION_NAME,
        totalProducts: count,
        connected: true
      },
      
      // Health status
      health: healthStatus,
      
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.error(`❌ [PING] Health check falló (${responseTime}ms):`, error.message);
    
    healthStatus.status = 'error';
    healthStatus.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message,
      context: 'ping'
    });
    
    res.status(503).json({
      success: false,
      message: `Error de conexión ${req.isColdStart ? '(Cold Start)' : '(Ready)'}`,
      responseTime: `${responseTime}ms`,
      error: {
        message: error.message,
        code: error.code,
        type: error.name
      },
      server: {
        status: req.isColdStart ? 'cold-start-error' : 'connection-error',
        uptime: req.uptime,
        coldStart: req.isColdStart
      },
      health: healthStatus,
      fallback: true,
      timestamp: new Date().toISOString()
    });
  }
});

// 📦 PRODUCTOS - Con filtros y paginación mejorados
router.get('/productos', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      categoria, 
      marca, 
      modelo, 
      version, 
      posicion,
      pagina = 1, 
      limite = 15,
      ordenar = 'codigo'
    } = req.query;

    console.log('📦 [PRODUCTOS] Parámetros:', {
      categoria, marca, modelo, version, posicion, pagina, limite
    });

    // Si es cold start con muchos errores, usar fallback inmediato
    if (req.isColdStart && healthStatus.errors.length > 3) {
      console.log('🥶 [PRODUCTOS] Cold start con errores - Usando fallback');
      
      return res.json({
        success: true,
        data: FALLBACK_DATA.productos,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalProducts: FALLBACK_DATA.productos.length,
          productsPerPage: FALLBACK_DATA.productos.length,
          hasNextPage: false,
          hasPrevPage: false
        },
        fallback: {
          active: true,
          reason: 'cold-start-with-errors',
          message: 'Datos temporales mientras el servidor se inicia'
        },
        server: {
          coldStart: true,
          uptime: req.uptime
        },
        timestamp: new Date().toISOString()
      });
    }

    const client = await connectWithRetry(req.isColdStart ? 3 : 5, 'productos');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    // ✅ CONSTRUIR FILTROS DINÁMICAMENTE
    const filtros = { tiene_precio_valido: true };

    // Filtro por categoría
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    // Filtros de vehículo
    if (marca) filtros["aplicaciones.marca"] = marca;
    if (modelo) filtros["aplicaciones.modelo"] = modelo;
    if (version) filtros["aplicaciones.version"] = version;

    // Filtro por posición
    if (posicion) {
      filtros["detalles_tecnicos.Posición de la pieza"] = posicion;
    }

    console.log('🔍 [PRODUCTOS] Filtros construidos:', JSON.stringify(filtros, null, 2));

    // ✅ PAGINACIÓN
    const skip = Math.max(0, (parseInt(pagina) - 1) * parseInt(limite));
    const limiteInt = Math.min(parseInt(limite), req.isColdStart ? 20 : 50);

    // ✅ EJECUTAR CONSULTA CON AGREGACIÓN Y TIMEOUT
    const pipeline = [
      { $match: filtros },
      { $sort: { [ordenar]: 1 } },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limiteInt },
            {
              $project: {
                _id: 0,
                codigo: 1,
                nombre: 1,
                categoria: 1,
                marca: 1,
                precio_lista_con_iva: 1,
                precio: 1,
                image: 1,
                imagen: 1,
                aplicaciones: 1,
                "detalles_tecnicos.Posición de la pieza": 1,
                tiene_precio_valido: 1
              }
            }
          ],
          totalCount: [{ $count: "count" }]
        }
      }
    ];

    // Timeout adaptativo
    const queryTimeout = req.isColdStart ? 45000 : 25000;
    
    const result = await Promise.race([
      collection.aggregate(pipeline).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Query timeout after ${queryTimeout}ms`)), queryTimeout)
      )
    ]);

    const productos = result[0]?.data || [];
    const totalProductos = result[0]?.totalCount[0]?.count || 0;
    const totalPaginas = Math.ceil(totalProductos / limiteInt);
    const responseTime = Date.now() - startTime;

    console.log(`✅ [PRODUCTOS] ${productos.length} productos encontrados (${responseTime}ms)`);

    res.json({
      success: true,
      data: productos,
      pagination: {
        currentPage: parseInt(pagina),
        totalPages: totalPaginas,
        totalProducts: totalProductos,
        productsPerPage: limiteInt,
        hasNextPage: parseInt(pagina) < totalPaginas,
        hasPrevPage: parseInt(pagina) > 1
      },
      filters: { categoria, marca, modelo, version, posicion },
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: req.isColdStart,
        uptime: req.uptime
      },
      server: {
        status: req.isColdStart ? 'warming-up' : 'ready'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [PRODUCTOS] Error (${responseTime}ms):`, error.message);

    // Respuesta de fallback
    res.status(500).json({
      success: false,
      error: 'Error al obtener productos',
      fallback: {
        success: true,
        data: FALLBACK_DATA.productos,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalProducts: FALLBACK_DATA.productos.length,
          productsPerPage: FALLBACK_DATA.productos.length,
          hasNextPage: false,
          hasPrevPage: false
        },
        reason: req.isColdStart ? 'cold-start-error' : 'database-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🧠 METADATOS PARA BÚSQUEDA - Optimizado
router.get('/metadatos-busqueda', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('🧠 [METADATOS-BÚSQUEDA] Generando índice...');

    // Fallback rápido para cold start con errores
    if (req.isColdStart && healthStatus.errors.length > 2) {
      console.log('🥶 [METADATOS] Cold start con errores - Usando fallback');
      
      return res.json({
        success: true,
        count: FALLBACK_DATA.metadatos.codes.length,
        searchIndex: FALLBACK_DATA.metadatos,
        fallback: {
          active: true,
          reason: 'cold-start-with-errors'
        },
        server: { coldStart: true },
        timestamp: new Date().toISOString()
      });
    }

    const client = await connectWithRetry(req.isColdStart ? 2 : 4, 'metadatos');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    // Límites adaptativos
    const documentLimit = req.isColdStart ? 1500 : 3000;
    const queryTimeout = req.isColdStart ? 30000 : 20000;

    // Query optimizada
    const metadatos = await Promise.race([
      collection.find(
        { tiene_precio_valido: true },
        {
          projection: {
            codigo: 1,
            categoria: 1,
            marca: 1,
            "aplicaciones.marca": 1,
            "aplicaciones.modelo": 1,
            _id: 0
          },
          limit: documentLimit
        }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Metadatos timeout after ${queryTimeout}ms`)), queryTimeout)
      )
    ]);

    // Procesar de forma eficiente
    const searchIndex = {
      codes: new Set(),
      brands: new Set(),
      models: new Set(),
      categories: new Set(),
      vehicles: new Set()
    };

    metadatos.forEach(product => {
      if (product.codigo) searchIndex.codes.add(product.codigo);
      if (product.categoria) searchIndex.categories.add(product.categoria);
      if (product.marca) searchIndex.brands.add(product.marca);
      
      if (product.aplicaciones && Array.isArray(product.aplicaciones)) {
        product.aplicaciones.forEach(app => {
          if (app.marca) {
            searchIndex.brands.add(app.marca);
            if (app.modelo) {
              searchIndex.models.add(app.modelo);
              searchIndex.vehicles.add(`${app.marca} ${app.modelo}`);
            }
          }
        });
      }
    });

    // Convertir a arrays con límites
    const maxItems = req.isColdStart ? 500 : 1000;
    const finalIndex = {
      codes: Array.from(searchIndex.codes).slice(0, maxItems),
      brands: Array.from(searchIndex.brands).sort().slice(0, 200),
      models: Array.from(searchIndex.models).sort().slice(0, 400),
      categories: Array.from(searchIndex.categories).sort(),
      vehicles: Array.from(searchIndex.vehicles).sort().slice(0, 600)
    };

    const responseTime = Date.now() - startTime;

    console.log(`✅ [METADATOS] Índice generado (${responseTime}ms): ${metadatos.length} productos`);

    res.json({
      success: true,
      count: metadatos.length,
      searchIndex: finalIndex,
      stats: {
        totalProducts: metadatos.length,
        brands: finalIndex.brands.length,
        models: finalIndex.models.length,
        categories: finalIndex.categories.length,
        vehicles: finalIndex.vehicles.length
      },
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: req.isColdStart,
        documentLimit: documentLimit
      },
      server: {
        status: req.isColdStart ? 'warming-up' : 'ready'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [METADATOS] Error (${responseTime}ms):`, error.message);

    res.status(500).json({
      success: false,
      error: 'Error al obtener metadatos',
      fallback: {
        success: true,
        count: FALLBACK_DATA.metadatos.codes.length,
        searchIndex: FALLBACK_DATA.metadatos,
        reason: req.isColdStart ? 'cold-start-error' : 'database-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🔍 PRODUCTO INDIVIDUAL
router.get('/producto/:codigo', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { codigo } = req.params;

    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Código de producto requerido',
        coldStart: req.isColdStart
      });
    }

    console.log('🔍 [PRODUCTO] Buscando:', codigo);

    const client = await connectWithRetry(req.isColdStart ? 2 : 3, 'producto');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    const queryTimeout = req.isColdStart ? 15000 : 8000;
    
    const producto = await Promise.race([
      collection.findOne(
        { codigo: codigo },
        { projection: { _id: 0 } }
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Producto timeout after ${queryTimeout}ms`)), queryTimeout)
      )
    ]);

    const responseTime = Date.now() - startTime;

    if (!producto) {
      console.log(`❌ [PRODUCTO] No encontrado: ${codigo}`);
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
        codigo: codigo,
        performance: {
          responseTime: `${responseTime}ms`,
          coldStart: req.isColdStart
        }
      });
    }

    console.log(`✅ [PRODUCTO] Encontrado: ${codigo} (${responseTime}ms)`);

    res.json({
      success: true,
      data: producto,
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [PRODUCTO] Error (${responseTime}ms):`, error.message);

    res.status(500).json({
      success: false,
      error: 'Error al obtener producto',
      codigo: req.params.codigo,
      fallback: {
        success: true,
        data: FALLBACK_DATA.productos[0],
        reason: req.isColdStart ? 'cold-start-error' : 'product-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚗 FILTROS VEHÍCULO
router.get('/filtros/:tipo', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { tipo } = req.params;
    const { categoria, marca, modelo } = req.query;

    const tiposValidos = ['marcas', 'modelos', 'versiones', 'posiciones'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de filtro inválido',
        tiposValidos,
        coldStart: req.isColdStart
      });
    }

    console.log('🚗 [FILTROS] Obteniendo:', tipo, 'para:', { categoria, marca, modelo });

    const client = await connectWithRetry(req.isColdStart ? 2 : 3, 'filtros');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    // Construir filtros base
    const filtros = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    let pipeline = [{ $match: filtros }];
    const timeoutMs = req.isColdStart ? 15000 : 10000;
    const resultLimit = req.isColdStart ? 50 : 100;

    // Agregación según el tipo
    switch (tipo) {
      case 'marcas':
        pipeline.push(
          { $unwind: "$aplicaciones" },
          { $group: { _id: "$aplicaciones.marca" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: resultLimit },
          { $project: { _id: 0, marca: "$_id" } }
        );
        break;

      case 'modelos':
        if (!marca) {
          return res.status(400).json({ 
            success: false, 
            error: 'Marca requerida para obtener modelos',
            coldStart: req.isColdStart
          });
        }
        pipeline.push(
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca } },
          { $group: { _id: "$aplicaciones.modelo" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: resultLimit },
          { $project: { _id: 0, modelo: "$_id" } }
        );
        break;

      case 'versiones':
        if (!marca || !modelo) {
          return res.status(400).json({ 
            success: false, 
            error: 'Marca y modelo requeridos para obtener versiones',
            coldStart: req.isColdStart
          });
        }
        pipeline.push(
          { $unwind: "$aplicaciones" },
          { $match: { 
            "aplicaciones.marca": marca,
            "aplicaciones.modelo": modelo 
          }},
          { $group: { _id: "$aplicaciones.version" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: Math.min(resultLimit, 30) },
          { $project: { _id: 0, version: "$_id" } }
        );
        break;

      case 'posiciones':
        if (marca) filtros["aplicaciones.marca"] = marca;
        if (modelo) filtros["aplicaciones.modelo"] = modelo;
        
        pipeline = [
          { $match: filtros },
          { $group: { _id: "$detalles_tecnicos.Posición de la pieza" } },
          { $match: { _id: { $ne: null, $ne: "", $exists: true } } },
          { $sort: { _id: 1 } },
          { $limit: Math.min(resultLimit, 30) },
          { $project: { _id: 0, posicion: "$_id" } }
        ];
        break;
    }

    const resultado = await Promise.race([
      collection.aggregate(pipeline).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Filtros timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);

    const responseTime = Date.now() - startTime;

    console.log(`✅ [FILTROS] ${resultado.length} ${tipo} encontrados (${responseTime}ms)`);

    res.json({
      success: true,
      tipo: tipo,
      data: resultado,
      count: resultado.length,
      filters: { categoria, marca, modelo },
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: req.isColdStart,
        resultLimit: resultLimit
      },
      server: {
        status: req.isColdStart ? 'warming-up' : 'ready'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [FILTROS] Error (${responseTime}ms):`, error.message);

    res.status(500).json({
      success: false,
      error: 'Error al obtener filtros',
      fallback: {
        success: true,
        tipo: req.params.tipo,
        data: [],
        count: 0,
        reason: req.isColdStart ? 'cold-start-error' : 'filter-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🔍 BÚSQUEDA SIMPLIFICADA
router.get('/busqueda', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      q,           
      limit = 20,  
      offset = 0   
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query de búsqueda requerida (mínimo 2 caracteres)',
        coldStart: req.isColdStart
      });
    }

    console.log('🔍 [BÚSQUEDA] Query:', q);

    const client = await connectWithRetry(req.isColdStart ? 2 : 4, 'busqueda');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    // Búsqueda simplificada pero efectiva
    const searchTerms = normalizeText(q.trim()).split(' ').filter(t => t.length > 1);
    
    const matchConditions = {
      tiene_precio_valido: true,
      $or: [
        { codigo: { $regex: q, $options: 'i' } },
        { nombre: { $regex: q, $options: 'i' } },
        ...searchTerms.slice(0, req.isColdStart ? 2 : 4).map(term => ({
          $or: [
            { codigo: { $regex: term, $options: 'i' } },
            { nombre: { $regex: term, $options: 'i' } },
            { "aplicaciones.marca": { $regex: term, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: term, $options: 'i' } }
          ]
        }))
      ]
    };

    const searchTimeout = req.isColdStart ? 20000 : 15000;
    const maxResults = Math.min(parseInt(limit), req.isColdStart ? 30 : 50);

    const pipeline = [
      { $match: matchConditions },
      { $sort: { codigo: 1 } },
      { $skip: parseInt(offset) },
      { $limit: maxResults },
      {
        $project: {
          _id: 0,
          codigo: 1,
          nombre: 1,
          categoria: 1,
          marca: 1,
          precio_lista_con_iva: 1,
          image: 1,
          imagen: 1,
          aplicaciones: 1,
          tiene_precio_valido: 1
        }
      }
    ];

    const results = await Promise.race([
      collection.aggregate(pipeline).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Search timeout after ${searchTimeout}ms`)), searchTimeout)
      )
    ]);

    const responseTime = Date.now() - startTime;

    console.log(`✅ [BÚSQUEDA] ${results.length} resultados (${responseTime}ms)`);

    res.json({
      success: true,
      query: q.trim(),
      results: results,
      totalResults: results.length,
      hasMore: results.length >= maxResults,
      performance: {
        responseTime: `${responseTime}ms`,
        searchTerms: searchTerms.length,
        coldStart: req.isColdStart,
        maxResults: maxResults
      },
      server: {
        status: req.isColdStart ? 'warming-up' : 'ready'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [BÚSQUEDA] Error (${responseTime}ms):`, error.message);

    res.status(500).json({
      success: false,
      error: 'Error en búsqueda',
      fallback: {
        success: true,
        query: req.query.q,
        results: [],
        totalResults: 0,
        hasMore: false,
        reason: req.isColdStart ? 'cold-start-error' : 'search-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 💡 SUGERENCIAS
router.get('/sugerencias', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { q, limit = 8 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
        query: q || '',
        coldStart: req.isColdStart
      });
    }

    console.log('💡 [SUGERENCIAS] Para:', q);

    const client = await connectWithRetry(req.isColdStart ? 1 : 2, 'sugerencias');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    const suggestions = new Set();
    const normalizedQuery = normalizeText(q);
    const maxSuggestions = Math.min(parseInt(limit), req.isColdStart ? 5 : 8);
    const queryTimeout = req.isColdStart ? 8000 : 5000;

    // Búsqueda simple de códigos
    const codigoMatches = await Promise.race([
      collection.find(
        { 
          codigo: { $regex: `^${normalizedQuery}`, $options: 'i' },
          tiene_precio_valido: true
        },
        { projection: { codigo: 1, _id: 0 }, limit: maxSuggestions }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Sugerencias timeout after ${queryTimeout}ms`)), queryTimeout)
      )
    ]);

    codigoMatches.forEach(p => suggestions.add(p.codigo));

    const finalSuggestions = Array.from(suggestions).slice(0, maxSuggestions);
    const responseTime = Date.now() - startTime;

    console.log(`✅ [SUGERENCIAS] ${finalSuggestions.length} resultados (${responseTime}ms)`);

    res.json({
      success: true,
      query: q.trim(),
      suggestions: finalSuggestions,
      count: finalSuggestions.length,
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: req.isColdStart,
        maxSuggestions: maxSuggestions
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [SUGERENCIAS] Error (${responseTime}ms):`, error.message);

    res.json({
      success: true,
      query: req.query.q || '',
      suggestions: [],
      count: 0,
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      fallback: {
        active: true,
        reason: req.isColdStart ? 'cold-start-error' : 'suggestions-error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 📋 METADATOS LEGACY
router.get('/metadatos', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log('📋 [METADATOS LEGACY] Cargando...');

    const client = await connectWithRetry(req.isColdStart ? 2 : 3, 'metadatos-legacy');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    const documentLimit = req.isColdStart ? 500 : 1000;
    const queryTimeout = req.isColdStart ? 20000 : 15000;

    const metadatos = await Promise.race([
      collection.find(
        { tiene_precio_valido: true },
        {
          projection: {
            codigo: 1,
            categoria: 1,
            marca: 1,
            nombre: 1,
            aplicaciones: 1,
            "detalles_tecnicos.Posición de la pieza": 1,
            _id: 0
          },
          limit: documentLimit
        }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Metadatos legacy timeout after ${queryTimeout}ms`)), queryTimeout)
      )
    ]);

    const responseTime = Date.now() - startTime;

    console.log(`✅ [METADATOS LEGACY] ${metadatos.length} elementos (${responseTime}ms)`);

    res.json({
      success: true,
      count: metadatos.length,
      data: metadatos,
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: req.isColdStart,
        documentLimit: documentLimit
      },
      server: {
        status: req.isColdStart ? 'warming-up' : 'ready'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [METADATOS LEGACY] Error (${responseTime}ms):`, error.message);

    res.status(500).json({
      success: false,
      error: 'Error al obtener metadatos',
      fallback: {
        success: true,
        count: 1,
        data: [FALLBACK_DATA.productos[0]],
        reason: req.isColdStart ? 'cold-start-error' : 'legacy-metadatos-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: req.isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// ===== FUNCIONES AUXILIARES =====

function normalizeText(text) {
  if (!text) return '';
  try {
    return text
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s\/]/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim();
  } catch (error) {
    console.warn('Error normalizando texto:', error);
    return text.toString().toLowerCase().trim();
  }
}

// ===== MANEJO DE ERRORES =====

router.use((error, req, res, next) => {
  const isColdStart = req.isColdStart || false;
  
  console.error('❌ [ERROR HANDLER]:', {
    message: error.message,
    code: error.code,
    url: req.url,
    method: req.method,
    coldStart: isColdStart,
    timestamp: new Date().toISOString()
  });

  // Actualizar health status
  healthStatus.errors.push({
    timestamp: new Date().toISOString(),
    message: error.message,
    url: req.url
  });

  // Mantener solo los últimos 10 errores
  if (healthStatus.errors.length > 10) {
    healthStatus.errors = healthStatus.errors.slice(-10);
  }

  // Errores específicos de MongoDB
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Conflicto de datos',
      fallback: true,
      coldStart: isColdStart
    });
  }

  if (error.name === 'MongoTimeoutError' || error.code === 'ETIMEDOUT') {
    return res.status(504).json({
      success: false,
      error: isColdStart ? 
        'El servidor está iniciándose, por favor intenta nuevamente' : 
        'Timeout de base de datos',
      fallback: true,
      retry: true,
      coldStart: isColdStart,
      retryAfter: isColdStart ? 30 : 10
    });
  }

  if (error.name === 'MongoNetworkError' || error.name === 'MongoServerSelectionError') {
    return res.status(503).json({
      success: false,
      error: isColdStart ?
        'Conectando a la base de datos, por favor espera...' :
        'Error de conexión a base de datos',
      fallback: true,
      retry: true,
      coldStart: isColdStart,
      retryAfter: isColdStart ? 45 : 15
    });
  }

  // Error genérico
  res.status(500).json({
    success: false,
    error: isColdStart ? 
      'El servidor se está iniciando, por favor intenta nuevamente en 30-60 segundos' :
      'Error interno del servidor',
    fallback: true,
    coldStart: isColdStart,
    retryAfter: isColdStart ? 60 : 30,
    timestamp: new Date().toISOString()
  });
});

// ===== CLEANUP Y MANEJO DE SEÑALES =====

async function gracefulDisconnect() {
  if (cachedClient) {
    try {
      await cachedClient.close();
      console.log('✅ [MONGODB] Desconectado limpiamente');
    } catch (error) {
      console.error('❌ [MONGODB] Error al desconectar:', error.message);
    }
    cachedClient = null;
  }
}

process.on('SIGINT', async () => {
  console.log('🛑 [SHUTDOWN] Recibida señal SIGINT...');
  healthStatus.status = 'shutting-down';
  await gracefulDisconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 [SHUTDOWN] Recibida señal SIGTERM...');
  healthStatus.status = 'shutting-down';
  await gracefulDisconnect();
  process.exit(0);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('💥 [UNCAUGHT EXCEPTION]:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  healthStatus.status = 'critical';
  healthStatus.errors.push({
    timestamp: new Date().toISOString(),
    message: `Uncaught: ${error.message}`,
    critical: true
  });
  
  if (process.env.NODE_ENV === 'production') {
    console.log('🏥 [RECOVERY] Intentando continuar...');
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [UNHANDLED REJECTION]:', {
    reason: reason,
    promise: promise,
    timestamp: new Date().toISOString()
  });
  
  healthStatus.errors.push({
    timestamp: new Date().toISOString(),
    message: `Unhandled rejection: ${reason}`,
    warning: true
  });
});

// ===== WARMUP AUTOMÁTICO =====

async function performWarmup() {
  console.log('🔥 [WARMUP] Iniciando warmup automático...');
  
  try {
    const client = await connectWithRetry(2, 'warmup');
    
    if (client) {
      const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
      
      // Query de warmup simple
      await collection.findOne(
        { tiene_precio_valido: true },
        { projection: { codigo: 1 }, limit: 1 }
      );
      
      console.log('✅ [WARMUP] Completado exitosamente');
      healthStatus.status = 'ready';
    }
    
  } catch (error) {
    console.warn('⚠️ [WARMUP] Falló, pero continuando:', error.message);
    healthStatus.status = 'warming';
  }
}

// Ejecutar warmup después de 5 segundos
setTimeout(() => {
  const uptime = Date.now() - serverStartTime;
  if (uptime < 180000) { // Solo si es cold start (primeros 3 minutos)
    performWarmup();
  }
}, 5000);

// ===== LOGGING E INFORMACIÓN DEL SISTEMA =====

console.log('\n' + '='.repeat(60));
console.log('🛡️ BACKEND ADAPTADO Y FUNCIONAL PARA RENDER.COM v1.0');
console.log('='.repeat(60));

console.log('⚙️ Configuración aplicada:');
console.log('  📊 Timeouts:');
console.log(`    • Conexión: ${RENDER_CONFIG.connectTimeoutMS}ms`);
console.log(`    • Socket: ${RENDER_CONFIG.socketTimeoutMS}ms`);
console.log(`    • Pool: ${RENDER_CONFIG.minPoolSize}-${RENDER_CONFIG.maxPoolSize}`);

console.log('🌐 Endpoints disponibles:');
console.log('  • GET /ping - Health check');
console.log('  • GET /productos - Lista con filtros');
console.log('  • GET /metadatos-busqueda - Índice optimizado');
console.log('  • GET /busqueda?q=... - Búsqueda');
console.log('  • GET /filtros/:tipo - Filtros');
console.log('  • GET /producto/:codigo - Producto individual');
console.log('  • GET /sugerencias?q=... - Sugerencias');
console.log('  • GET /metadatos - Legacy endpoint');

console.log('🔧 Optimizaciones:');
console.log('  • Cold start detection automático');
console.log('  • Timeouts adaptativos');
console.log('  • Fallbacks inteligentes');
console.log('  • Reintentos automáticos');
console.log('  • Health monitoring');

console.log(`📊 Estado inicial: Servidor iniciado a las ${new Date().toISOString()}`);
console.log(`🗄️ MongoDB: ${DB_NAME}.${COLLECTION_NAME}`);

console.log('='.repeat(60) + '\n');

console.log('✅ Backend adaptado iniciado exitosamente');
console.log('🎯 Basado en código funcional de productos1.js');
console.log('⏱️ Cold start detection activo\n');

// Inicializar health status
healthStatus.status = 'initialized';

module.exports = router;