const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// =================================================================
// ===== CONFIGURACIÓN ROBUSTA PARA RENDER.COM ===================
// =================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// 🛡️ CONFIGURACIÓN DEFENSIVA PARA RENDER
const RENDER_CONFIG = {
  // Timeouts más conservadores para Render
  connectTimeoutMS: 20000,        // 20 segundos para conectar
  serverSelectionTimeoutMS: 15000, // 15 segundos para seleccionar servidor
  socketTimeoutMS: 45000,         // 45 segundos para socket
  maxIdleTimeMS: 30000,           // 30 segundos idle
  
  // Pool más pequeño para evitar sobrecarga
  maxPoolSize: 5,                 // Máximo 5 conexiones
  minPoolSize: 1,                 // Mínimo 1 conexión
  
  // Reintentos más agresivos
  maxRetries: 5,
  retryDelayMs: 2000,
  
  // Compresión deshabilitada para evitar problemas
  useCompression: false,
  
  // Buffer settings para Render
  bufferMaxEntries: 0,
  bufferCommands: false
};

// 🔄 SISTEMA DE REINTENTOS INTELIGENTE
class ConnectionManager {
  constructor() {
    this.client = null;
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.lastError = null;
    this.lastSuccessfulConnection = null;
  }
  
  async connect() {
    if (this.client && this.isConnected()) {
      return this.client;
    }
    
    if (this.isConnecting) {
      // Esperar a que termine el intento actual
      await this.waitForConnection();
      return this.client;
    }
    
    this.isConnecting = true;
    
    try {
      console.log(`🔌 [MongoDB] Intento de conexión ${this.connectionAttempts + 1}...`);
      
      this.client = new MongoClient(MONGODB_URI, {
        connectTimeoutMS: RENDER_CONFIG.connectTimeoutMS,
        serverSelectionTimeoutMS: RENDER_CONFIG.serverSelectionTimeoutMS,
        socketTimeoutMS: RENDER_CONFIG.socketTimeoutMS,
        maxIdleTimeMS: RENDER_CONFIG.maxIdleTimeMS,
        maxPoolSize: RENDER_CONFIG.maxPoolSize,
        minPoolSize: RENDER_CONFIG.minPoolSize,
        bufferMaxEntries: RENDER_CONFIG.bufferMaxEntries,
        bufferCommands: RENDER_CONFIG.bufferCommands,
        retryWrites: true,
        retryReads: true,
        readPreference: 'secondaryPreferred',
        readConcern: { level: 'local' },
        writeConcern: { w: 'majority', j: false, wtimeout: 10000 }
      });
      
      await this.client.connect();
      
      // Verificar conexión con ping
      await this.client.db(DB_NAME).command({ ping: 1 });
      
      this.connectionAttempts++;
      this.lastSuccessfulConnection = new Date();
      this.lastError = null;
      this.isConnecting = false;
      
      console.log(`✅ [MongoDB] Conectado exitosamente (intento ${this.connectionAttempts})`);
      console.log(`📊 [MongoDB] Base de datos: ${DB_NAME}`);
      
      return this.client;
      
    } catch (error) {
      this.lastError = error;
      this.isConnecting = false;
      
      console.error(`❌ [MongoDB] Error de conexión:`, {
        message: error.message,
        code: error.code,
        codeName: error.codeName,
        attempt: this.connectionAttempts + 1
      });
      
      throw error;
    }
  }
  
  isConnected() {
    return this.client && 
           this.client.topology && 
           this.client.topology.isConnected();
  }
  
  async waitForConnection() {
    let attempts = 0;
    while (this.isConnecting && attempts < 50) { // Max 5 segundos
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }
  
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        console.log('✅ [MongoDB] Desconectado limpiamente');
      } catch (error) {
        console.error('❌ [MongoDB] Error al desconectar:', error.message);
      }
      this.client = null;
    }
  }
  
  getStats() {
    return {
      connected: this.isConnected(),
      connecting: this.isConnecting,
      attempts: this.connectionAttempts,
      lastError: this.lastError?.message || null,
      lastSuccess: this.lastSuccessfulConnection
    };
  }
}

// Instancia global del manager
const connectionManager = new ConnectionManager();

// 🛡️ FUNCIÓN DE CONEXIÓN CON REINTENTOS
async function connectWithRetry(maxRetries = RENDER_CONFIG.maxRetries) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await connectionManager.connect();
      return client;
      
    } catch (error) {
      lastError = error;
      
      console.error(`❌ [Retry ${attempt}/${maxRetries}] Error:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = RENDER_CONFIG.retryDelayMs * attempt;
        console.log(`⏳ [Retry] Esperando ${delay}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`💥 [MongoDB] Todos los intentos de conexión fallaron`);
  throw lastError;
}

// =================================================================
// ===== DATOS DE FALLBACK PARA MODO OFFLINE =====================
// =================================================================

const FALLBACK_DATA = {
  productos: [
    {
      codigo: "SIN-CONEXION-001",
      nombre: "Producto de ejemplo - Sin conexión a base de datos",
      categoria: "Sistema",
      marca: "Sistema",
      precio_lista_con_iva: "$0,00",
      image: "/img/placeholder-producto.webp",
      aplicaciones: [{ marca: "Universal", modelo: "Ejemplo", version: "2024" }],
      detalles_tecnicos: { "Posición de la pieza": "Universal" },
      tiene_precio_valido: true
    }
  ],
  metadatos: {
    codes: ["SIN-CONEXION-001"],
    brands: ["Sistema"],
    models: ["Ejemplo"],
    categories: ["Sistema"],
    vehicles: ["Universal Ejemplo"]
  }
};

// =================================================================
// ===== FUNCIONES AUXILIARES ROBUSTAS ===========================
// =================================================================

function normalizeText(text) {
  if (!text) return '';
  try {
    return text.toString()
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

// Categorías simplificadas para evitar errores
const CATEGORIAS = {
  "Amortiguadores": ["Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP", "Amort LIP", "Amort PRO TUNNING"],
  "Pastillas de Freno": ["Pastillas CORVEN C", "Pastillas CORVEN HT", "Pastillas FERODO", "Pastillas JURID"],
  "Embragues": ["Embragues CORVEN", "Embragues SADAR", "Embragues VALEO"],
  "Discos y Campanas": ["Discos y Camp HF", "Discos y Camp CORVEN"],
  "Rótulas": ["Rotulas CORVEN", "Rotulas SADAR"],
  "Otros": ["CTR", "FTE", "Gas Spring Stabilus", "Otros"]
};

// =================================================================
// ===== MIDDLEWARE DE MANEJO DE ERRORES ==========================
// =================================================================

// Middleware para manejar errores de MongoDB
function handleMongoError(error, req, res, next) {
  console.error('❌ [MongoDB Error]:', {
    message: error.message,
    code: error.code,
    codeName: error.codeName,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Errores específicos de MongoDB
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'Conflicto de datos',
      fallback: true
    });
  }
  
  if (error.name === 'MongoTimeoutError' || error.code === 'ETIMEDOUT') {
    return res.status(504).json({
      success: false,
      error: 'Timeout de base de datos',
      fallback: true,
      retry: true
    });
  }
  
  if (error.name === 'MongoNetworkError') {
    return res.status(503).json({
      success: false,
      error: 'Error de red de base de datos',
      fallback: true,
      retry: true
    });
  }
  
  // Error genérico
  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    fallback: true,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}

// Middleware para timeout de requests
function requestTimeout(timeoutMs = 25000) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          timeout: timeoutMs,
          fallback: true
        });
      }
    }, timeoutMs);
    
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    
    next();
  };
}

// Aplicar middleware global
router.use(requestTimeout(25000));

// =================================================================
// ===== RUTAS DE LA API ROBUSTAS =================================
// =================================================================

// 🚀 1. RUTA DE PING MEJORADA
router.get('/ping', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const client = await connectWithRetry(2); // Solo 2 intentos para ping
    await client.db(DB_NAME).command({ ping: 1 });
    
    const responseTime = Date.now() - startTime;
    const stats = connectionManager.getStats();
    
    res.json({
      success: true,
      message: 'Pong! Conexión OK',
      responseTime: `${responseTime}ms`,
      database: {
        name: DB_NAME,
        collection: COLLECTION_NAME,
        connected: true
      },
      connection: stats,
      server: {
        environment: process.env.NODE_ENV || 'unknown',
        memory: process.memoryUsage(),
        uptime: process.uptime()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    res.status(503).json({
      success: false,
      message: 'Error de conexión a base de datos',
      responseTime: `${responseTime}ms`,
      error: error.message,
      connection: connectionManager.getStats(),
      fallback: true,
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 2. RUTA DE PRODUCTOS ROBUSTA
router.get('/productos', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { categoria, marca, modelo, version, posicion, pagina = 1, limite = 15, ordenar = 'codigo' } = req.query;
    
    console.log(`📦 [Productos] Request: página ${pagina}, límite ${limite}`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Construir filtros de forma segura
    const filtros = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }
    
    // Filtros de aplicaciones
    if (marca) filtros["aplicaciones.marca"] = marca;
    if (modelo) filtros["aplicaciones.modelo"] = modelo;
    if (version) filtros["aplicaciones.version"] = version;
    if (posicion) filtros["detalles_tecnicos.Posición de la pieza"] = posicion;
    
    const skip = Math.max(0, (parseInt(pagina) - 1) * parseInt(limite));
    const limiteInt = Math.min(parseInt(limite), 50); // Máximo 50 por página
    
    console.log(`🔍 [Productos] Filtros:`, filtros);
    console.log(`📄 [Productos] Paginación: skip=${skip}, limit=${limiteInt}`);
    
    // Pipeline optimizado con timeout
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
    
    // Ejecutar con timeout
    const result = await Promise.race([
      collection.aggregate(pipeline).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout')), 20000)
      )
    ]);
    
    const productos = result[0]?.data || [];
    const totalProductos = result[0]?.totalCount[0]?.count || 0;
    const totalPaginas = Math.ceil(totalProductos / limiteInt);
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [Productos] ${productos.length} productos encontrados (${responseTime}ms)`);
    
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
        queryComplexity: 'normal'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Productos] Error (${responseTime}ms):`, error.message);
    
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
        }
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 3. RUTA DE METADATOS ROBUSTA
router.get('/metadatos-busqueda', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log(`🧠 [Metadatos] Generando índice de búsqueda...`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Query simplificada para evitar timeouts
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
          limit: 5000 // Limitar para evitar timeouts
        }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Metadatos query timeout')), 15000)
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
    const finalIndex = {
      codes: Array.from(searchIndex.codes).slice(0, 1000),
      brands: Array.from(searchIndex.brands).sort().slice(0, 200),
      models: Array.from(searchIndex.models).sort().slice(0, 500),
      categories: Array.from(searchIndex.categories).sort(),
      vehicles: Array.from(searchIndex.vehicles).sort().slice(0, 800)
    };
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [Metadatos] Índice generado (${responseTime}ms): ${metadatos.length} productos procesados`);
    
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
        processingComplexity: 'optimized'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Metadatos] Error (${responseTime}ms):`, error.message);
    
    // Fallback con datos básicos
    res.status(500).json({
      success: false,
      error: 'Error al obtener metadatos',
      fallback: {
        success: true,
        count: FALLBACK_DATA.metadatos.codes.length,
        searchIndex: FALLBACK_DATA.metadatos,
        stats: {
          totalProducts: 1,
          brands: 1,
          models: 1,
          categories: 1,
          vehicles: 1
        }
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 4. RUTA DE BÚSQUEDA SIMPLIFICADA
router.get('/busqueda', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Consulta requerida (mínimo 2 caracteres)'
      });
    }
    
    const queryTrimmed = q.trim();
    console.log(`🔍 [Búsqueda] Procesando: "${queryTrimmed}"`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Búsqueda simplificada para evitar timeouts
    const searchTerms = normalizeText(queryTrimmed).split(' ').filter(t => t.length > 1);
    
    const matchConditions = {
      tiene_precio_valido: true,
      $or: [
        { codigo: { $regex: queryTrimmed, $options: 'i' } },
        { nombre: { $regex: queryTrimmed, $options: 'i' } },
        ...searchTerms.map(term => ({
          $or: [
            { codigo: { $regex: term, $options: 'i' } },
            { nombre: { $regex: term, $options: 'i' } },
            { "aplicaciones.marca": { $regex: term, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: term, $options: 'i' } }
          ]
        }))
      ]
    };
    
    const pipeline = [
      { $match: matchConditions },
      { $sort: { codigo: 1 } },
      { $skip: parseInt(offset) },
      { $limit: Math.min(parseInt(limit), 50) },
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
        setTimeout(() => reject(new Error('Search timeout')), 15000)
      )
    ]);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [Búsqueda] ${results.length} resultados (${responseTime}ms)`);
    
    res.json({
      success: true,
      query: queryTrimmed,
      results: results,
      totalResults: results.length,
      hasMore: results.length >= parseInt(limit),
      performance: {
        responseTime: `${responseTime}ms`,
        searchTerms: searchTerms.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Búsqueda] Error (${responseTime}ms):`, error.message);
    
    res.status(500).json({
      success: false,
      error: 'Error en búsqueda',
      fallback: {
        success: true,
        query: req.query.q,
        results: [],
        totalResults: 0,
        hasMore: false
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 5. RUTA DE FILTROS SIMPLIFICADA
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
        tiposValidos
      });
    }
    
    console.log(`🔧 [Filtros] Tipo: ${tipo}, categoria: ${categoria || 'todas'}`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    const filtrosBase = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtrosBase.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtrosBase.categoria = categoria;
      }
    }
    
    let pipeline;
    let timeoutMs = 10000; // 10 segundos para filtros
    
    switch (tipo) {
      case 'marcas':
        pipeline = [
          { $match: filtrosBase },
          { $unwind: "$aplicaciones" },
          { $group: { _id: "$aplicaciones.marca" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: 100 }, // Limitar resultados
          { $project: { _id: 0, marca: "$_id" } }
        ];
        break;
        
      case 'modelos':
        if (!marca) {
          return res.status(400).json({
            success: false,
            error: 'Marca requerida para obtener modelos'
          });
        }
        pipeline = [
          { $match: { ...filtrosBase, "aplicaciones.marca": marca } },
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca } },
          { $group: { _id: "$aplicaciones.modelo" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: 100 },
          { $project: { _id: 0, modelo: "$_id" } }
        ];
        break;
        
      case 'versiones':
        if (!marca || !modelo) {
          return res.status(400).json({
            success: false,
            error: 'Marca y modelo requeridos para obtener versiones'
          });
        }
        pipeline = [
          { $match: { ...filtrosBase, "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } },
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } },
          { $group: { _id: "$aplicaciones.version" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: 50 },
          { $project: { _id: 0, version: "$_id" } }
        ];
        break;
        
      case 'posiciones':
        if (marca) filtrosBase["aplicaciones.marca"] = marca;
        if (modelo) filtrosBase["aplicaciones.modelo"] = modelo;
        
        pipeline = [
          { $match: filtrosBase },
          { $group: { _id: "$detalles_tecnicos.Posición de la pieza" } },
          { $match: { _id: { $ne: null, $ne: "", $exists: true } } },
          { $sort: { _id: 1 } },
          { $limit: 50 },
          { $project: { _id: 0, posicion: "$_id" } }
        ];
        break;
    }
    
    const resultado = await Promise.race([
      collection.aggregate(pipeline).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Filtros timeout')), timeoutMs)
      )
    ]);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [Filtros] ${tipo}: ${resultado.length} elementos (${responseTime}ms)`);
    
    res.json({
      success: true,
      tipo: tipo,
      data: resultado,
      count: resultado.length,
      filters: { categoria, marca, modelo },
      performance: {
        responseTime: `${responseTime}ms`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Filtros] Error (${responseTime}ms):`, error.message);
    
    res.status(500).json({
      success: false,
      error: 'Error al obtener filtros',
      fallback: {
        success: true,
        tipo: req.params.tipo,
        data: [],
        count: 0
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 6. RUTA DE PRODUCTO INDIVIDUAL
router.get('/producto/:codigo', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { codigo } = req.params;
    
    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Código de producto requerido'
      });
    }
    
    console.log(`🔍 [Producto] Buscando: ${codigo}`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    const producto = await Promise.race([
      collection.findOne(
        { codigo: codigo },
        { projection: { _id: 0 } }
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Producto timeout')), 8000)
      )
    ]);
    
    const responseTime = Date.now() - startTime;
    
    if (!producto) {
      console.log(`❌ [Producto] No encontrado: ${codigo} (${responseTime}ms)`);
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
        codigo: codigo,
        performance: {
          responseTime: `${responseTime}ms`
        }
      });
    }
    
    console.log(`✅ [Producto] Encontrado: ${codigo} (${responseTime}ms)`);
    
    res.json({
      success: true,
      data: producto,
      performance: {
        responseTime: `${responseTime}ms`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Producto] Error (${responseTime}ms):`, error.message);
    
    res.status(500).json({
      success: false,
      error: 'Error al obtener producto',
      codigo: req.params.codigo,
      fallback: {
        success: true,
        data: FALLBACK_DATA.productos[0]
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 7. RUTA DE SUGERENCIAS BÁSICA
router.get('/sugerencias', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { q, limit = 8 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
        query: q || ''
      });
    }
    
    const queryTrimmed = q.trim();
    console.log(`💡 [Sugerencias] Para: "${queryTrimmed}"`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    const suggestions = new Set();
    const normalizedQuery = normalizeText(queryTrimmed);
    
    // Búsqueda simple de códigos
    const codigoMatches = await Promise.race([
      collection.find(
        { 
          codigo: { $regex: `^${normalizedQuery}`, $options: 'i' },
          tiene_precio_valido: true
        },
        { projection: { codigo: 1, _id: 0 }, limit: 3 }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sugerencias timeout')), 5000)
      )
    ]);
    
    codigoMatches.forEach(p => suggestions.add(p.codigo));
    
    const finalSuggestions = Array.from(suggestions).slice(0, parseInt(limit));
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [Sugerencias] ${finalSuggestions.length} resultados (${responseTime}ms)`);
    
    res.json({
      success: true,
      query: queryTrimmed,
      suggestions: finalSuggestions,
      count: finalSuggestions.length,
      performance: {
        responseTime: `${responseTime}ms`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Sugerencias] Error (${responseTime}ms):`, error.message);
    
    res.json({
      success: true,
      query: req.query.q || '',
      suggestions: [],
      count: 0,
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 8. RUTA DE METADATOS BÁSICOS (LEGACY)
router.get('/metadatos', async (req, res) => {
  const startTime = Date.now();
  
  try {
    console.log(`📋 [Metadatos Legacy] Cargando...`);
    
    const client = await connectWithRetry();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
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
          limit: 1000 // Limitar para evitar problemas
        }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Metadatos legacy timeout')), 15000)
      )
    ]);
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [Metadatos Legacy] ${metadatos.length} elementos (${responseTime}ms)`);
    
    res.json({
      success: true,
      count: metadatos.length,
      data: metadatos,
      performance: {
        responseTime: `${responseTime}ms`
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [Metadatos Legacy] Error (${responseTime}ms):`, error.message);
    
    res.status(500).json({
      success: false,
      error: 'Error al obtener metadatos',
      fallback: {
        success: true,
        count: 1,
        data: [FALLBACK_DATA.productos[0]]
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

// =================================================================
// ===== MIDDLEWARE DE ERROR HANDLING ============================
// =================================================================

// Aplicar manejo de errores a todas las rutas
router.use(handleMongoError);

// =================================================================
// ===== CLEANUP Y MANEJO DE SEÑALES =============================
// =================================================================

// Manejo de shutdown graceful
process.on('SIGINT', async () => {
  console.log('🛑 [Shutdown] Recibida señal SIGINT...');
  await connectionManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 [Shutdown] Recibida señal SIGTERM...');
  await connectionManager.disconnect();
  process.exit(0);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('💥 [Uncaught Exception]:', error);
  // No terminar el proceso en producción para Render
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [Unhandled Rejection]:', reason);
  // Continuar en producción
});

// =================================================================
// ===== LOGGING E INFORMACIÓN DEL SISTEMA =======================
// =================================================================

console.log('🛡️ Backend Defensivo para Render.com inicializado');
console.log('⚙️ Configuración aplicada:', {
  timeouts: {
    connect: RENDER_CONFIG.connectTimeoutMS + 'ms',
    query: '20000ms',
    socket: RENDER_CONFIG.socketTimeoutMS + 'ms'
  },
  limits: {
    maxRetries: RENDER_CONFIG.maxRetries,
    maxPoolSize: RENDER_CONFIG.maxPoolSize,
    minPoolSize: RENDER_CONFIG.minPoolSize
  },
  features: {
    compression: RENDER_CONFIG.useCompression,
    buffering: RENDER_CONFIG.bufferCommands
  }
});

console.log('🌐 Endpoints disponibles:');
console.log('  • GET /ping - Estado del sistema');
console.log('  • GET /productos - Lista de productos');
console.log('  • GET /metadatos-busqueda - Índice de búsqueda');
console.log('  • GET /busqueda?q=... - Búsqueda de productos');
console.log('  • GET /filtros/:tipo - Filtros dinámicos');
console.log('  • GET /producto/:codigo - Producto individual');
console.log('  • GET /sugerencias?q=... - Sugerencias de búsqueda');
console.log('  • GET /metadatos - Metadatos legacy');

// Exportar router
module.exports = router;