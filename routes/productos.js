const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// =================================================================
// ===== CONFIGURACIÓN ULTRA ROBUSTA PARA RENDER.COM =============
// =================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// 🚨 CONFIGURACIÓN ESPECIAL PARA COLD STARTS EN RENDER
const RENDER_OPTIMIZATIONS = {
  isColdStart: true,
  startTime: Date.now(),
  healthCheck: {
    status: 'starting',
    mongodb: 'disconnected',
    lastPing: null,
    uptime: 0,
    errors: [],
    lastError: null,
    consecutiveErrors: 0
  },
  renderTimeouts: {
    coldStartTimeout: 90000,      // 90 segundos para cold start
    normalTimeout: 30000,         // 30 segundos para operaciones normales
    healthCheckTimeout: 8000,     // 8 segundos para health checks
    mongoInitTimeout: 60000       // 60 segundos para inicializar MongoDB
  }
};

// 🛡️ CONFIGURACIÓN DEFENSIVA MEJORADA PARA RENDER
const RENDER_CONFIG = {
  // Timeouts básicos
  connectTimeoutMS: 60000,
  serverSelectionTimeoutMS: 45000,
  socketTimeoutMS: 60000,
  maxIdleTimeMS: 120000,
  
  // Pool de conexiones
  maxPoolSize: 3,
  minPoolSize: 1,
  
  // Configuraciones de escritura/lectura
  writeConcern: { w: 'majority', j: false, wtimeout: 30000 },
  readConcern: { level: 'local' },
  readPreference: 'secondaryPreferred',
  
  // Configuraciones de retry - NAMES CORREGIDOS
  retryWrites: true,
  retryReads: true,
  
  // Configuraciones de compresión
  compressors: [],
  
  // Configuraciones de heartbeat
  heartbeatFrequencyMS: 30000,
  maxConnecting: 2,
  
  // Variables para el sistema de retry manual
  maxRetries: 6,
  retryDelayMs: 3000
};


// 🔄 SISTEMA DE CONEXIÓN INTELIGENTE PARA RENDER
class RenderConnectionManager {
  constructor() {
    this.client = null;
    this.isConnecting = false;
    this.connectionAttempts = 0;
    this.lastError = null;
    this.lastSuccessfulConnection = null;
    this.consecutiveFailures = 0;
    this.connectionState = 'disconnected';
    this.warmupCompleted = false;
    
    // Inicializar health check
    this.updateHealthStatus('initializing', 'Iniciando sistema...');
  }
  
  updateHealthStatus(status, message = '', error = null) {
    RENDER_OPTIMIZATIONS.healthCheck.status = status;
    RENDER_OPTIMIZATIONS.healthCheck.uptime = Date.now() - RENDER_OPTIMIZATIONS.startTime;
    RENDER_OPTIMIZATIONS.healthCheck.lastPing = new Date().toISOString();
    
    if (error) {
      RENDER_OPTIMIZATIONS.healthCheck.lastError = error.message;
      RENDER_OPTIMIZATIONS.healthCheck.errors.push({
        timestamp: new Date().toISOString(),
        message: error.message,
        code: error.code
      });
      
      // Mantener solo los últimos 10 errores
      if (RENDER_OPTIMIZATIONS.healthCheck.errors.length > 10) {
        RENDER_OPTIMIZATIONS.healthCheck.errors = RENDER_OPTIMIZATIONS.healthCheck.errors.slice(-10);
      }
      
      this.consecutiveFailures++;
      RENDER_OPTIMIZATIONS.healthCheck.consecutiveErrors = this.consecutiveFailures;
    } else {
      this.consecutiveFailures = 0;
      RENDER_OPTIMIZATIONS.healthCheck.consecutiveErrors = 0;
    }
    
    console.log(`🏥 [HEALTH] ${status.toUpperCase()}: ${message}`);
  }
  
  async connect() {
    if (this.client && this.isConnected()) {
      this.updateHealthStatus('connected', 'Conexión activa');
      return this.client;
    }
    
    if (this.isConnecting) {
      await this.waitForConnection();
      return this.client;
    }
    
    this.isConnecting = true;
    this.connectionState = 'connecting';
    
    try {
      const isColdStart = this.detectColdStart();
      const timeout = isColdStart ? 
        RENDER_CONFIG.connectTimeoutMS : 
        RENDER_CONFIG.connectTimeoutMS / 2;
      
      this.updateHealthStatus('connecting', `Conectando a MongoDB (${isColdStart ? 'Cold Start' : 'Normal'})...`);
      
      console.log(`🔌 [MongoDB] Intento ${this.connectionAttempts + 1} - ${isColdStart ? 'COLD START' : 'Normal'}`);
      console.log(`⏱️ [MongoDB] Timeout configurado: ${timeout}ms`);
      
      this.client = new MongoClient(MONGODB_URI, {
        // Timeouts
        connectTimeoutMS: timeout,
        serverSelectionTimeoutMS: RENDER_CONFIG.serverSelectionTimeoutMS,
        socketTimeoutMS: RENDER_CONFIG.socketTimeoutMS,
        maxIdleTimeMS: RENDER_CONFIG.maxIdleTimeMS,
        
        // Pool
        maxPoolSize: RENDER_CONFIG.maxPoolSize,
        minPoolSize: RENDER_CONFIG.minPoolSize,
        
        // Retry y configuraciones básicas
        retryWrites: true,
        retryReads: true,
        readPreference: RENDER_CONFIG.readPreference,
        readConcern: RENDER_CONFIG.readConcern,
        writeConcern: RENDER_CONFIG.writeConcern,
        
        // Configuraciones de heartbeat
        heartbeatFrequencyMS: 30000,
        maxConnecting: 2,
        
        // Sin compresión
        compressors: []
      });
      
      // Conectar con timeout personalizado
      await Promise.race([
        this.client.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout)
        )
      ]);
      
      // Verificar conexión con ping
      await Promise.race([
        this.client.db(DB_NAME).command({ ping: 1 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Ping timeout')), 10000)
        )
      ]);
      
      this.connectionAttempts++;
      this.lastSuccessfulConnection = new Date();
      this.lastError = null;
      this.isConnecting = false;
      this.connectionState = 'connected';
      this.warmupCompleted = true;
      
      // Actualizar estado de MongoDB en health
      RENDER_OPTIMIZATIONS.healthCheck.mongodb = 'connected';
      this.updateHealthStatus('connected', `Conectado exitosamente (intento ${this.connectionAttempts})`);
      
      console.log(`✅ [MongoDB] Conectado exitosamente`);
      console.log(`📊 [MongoDB] Base de datos: ${DB_NAME}`);
      console.log(`🎯 [MongoDB] Colección: ${COLLECTION_NAME}`);
      
      // Si es cold start, marcar como completado
      if (isColdStart) {
        RENDER_OPTIMIZATIONS.isColdStart = false;
        console.log(`🔥 [COLD START] Completado exitosamente`);
      }
      
      return this.client;
      
    } catch (error) {
      this.lastError = error;
      this.isConnecting = false;
      this.connectionState = 'error';
      
      // Actualizar estado de error
      RENDER_OPTIMIZATIONS.healthCheck.mongodb = 'error';
      this.updateHealthStatus('error', `Error de conexión (intento ${this.connectionAttempts + 1})`, error);
      
      console.error(`❌ [MongoDB] Error de conexión:`, {
        message: error.message,
        code: error.code,
        codeName: error.codeName,
        attempt: this.connectionAttempts + 1,
        consecutiveFailures: this.consecutiveFailures,
        isColdStart: this.detectColdStart()
      });
      
      throw error;
    }
  }
  
  detectColdStart() {
    const uptime = Date.now() - RENDER_OPTIMIZATIONS.startTime;
    return uptime < 120000 || !this.warmupCompleted; // Primeros 2 minutos o no warmed up
  }
  
  isConnected() {
    try {
      return this.client && 
             this.client.topology && 
             this.client.topology.isConnected();
    } catch (error) {
      console.warn('Error verificando conexión:', error.message);
      return false;
    }
  }
  
  async waitForConnection() {
    let attempts = 0;
    while (this.isConnecting && attempts < 100) { // Max 10 segundos
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
  }
  
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        this.connectionState = 'disconnected';
        RENDER_OPTIMIZATIONS.healthCheck.mongodb = 'disconnected';
        this.updateHealthStatus('disconnected', 'Desconectado limpiamente');
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
      state: this.connectionState,
      attempts: this.connectionAttempts,
      lastError: this.lastError?.message || null,
      lastSuccess: this.lastSuccessfulConnection,
      consecutiveFailures: this.consecutiveFailures,
      warmupCompleted: this.warmupCompleted,
      uptime: Date.now() - RENDER_OPTIMIZATIONS.startTime
    };
  }
}

// Instancia global del manager
const connectionManager = new RenderConnectionManager();

// 🛡️ FUNCIÓN DE CONEXIÓN CON REINTENTOS MEJORADA
async function connectWithRetry(maxRetries = RENDER_CONFIG.maxRetries, operation = 'general') {
  let lastError;
  const isColdStart = connectionManager.detectColdStart();
  
  // Ajustar reintentos según el contexto
  if (operation === 'health' || operation === 'ping') {
    maxRetries = Math.min(maxRetries, 3); // Menos reintentos para health checks
  }
  
  console.log(`🔄 [RETRY] Iniciando ${operation} - ${maxRetries} intentos máximo (${isColdStart ? 'Cold Start' : 'Normal'})`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await connectionManager.connect();
      
      // Si llegamos aquí, la conexión fue exitosa
      console.log(`✅ [RETRY] ${operation} exitoso en intento ${attempt}/${maxRetries}`);
      return client;
      
    } catch (error) {
      lastError = error;
      
      console.error(`❌ [RETRY ${attempt}/${maxRetries}] ${operation} falló:`, {
        message: error.message,
        code: error.code,
        type: error.name
      });
      
      if (attempt < maxRetries) {
        // Calcular delay con backoff exponential y random jitter
        const baseDelay = RENDER_CONFIG.retryDelayMs;
        const exponentialDelay = baseDelay * Math.pow(1.5, attempt - 1);
        const jitter = Math.random() * 1000; // 0-1000ms de jitter
        const finalDelay = Math.min(exponentialDelay + jitter, 15000); // Max 15 segundos
        
        console.log(`⏳ [RETRY] Esperando ${Math.round(finalDelay)}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, finalDelay));
      }
    }
  }
  
  // Todos los intentos fallaron
  console.error(`💥 [RETRY] Todos los intentos para ${operation} fallaron después de ${maxRetries} intentos`);
  console.error(`💥 [RETRY] Último error:`, lastError?.message);
  
  // Actualizar health status
  connectionManager.updateHealthStatus('failed', `${operation} falló después de ${maxRetries} intentos`, lastError);
  
  throw lastError;
}

// =================================================================
// ===== DATOS DE FALLBACK MEJORADOS =============================
// =================================================================

const ENHANCED_FALLBACK_DATA = {
  productos: [
    {
      codigo: "RENDER-COLD-001",
      nombre: "Servidor iniciándose - Por favor espera",
      categoria: "Sistema",
      marca: "Render",
      precio_lista_con_iva: "$0,00",
      image: "/img/placeholder-producto.webp",
      aplicaciones: [{ marca: "Sistema", modelo: "Cold Start", version: "2024" }],
      detalles_tecnicos: { "Posición de la pieza": "Servidor" },
      tiene_precio_valido: true,
      observaciones: "El servidor está iniciándose. Los servidores gratuitos de Render.com tardan 30-60 segundos en activarse después de estar inactivos."
    },
    {
      codigo: "RENDER-COLD-002", 
      nombre: "Conexión a base de datos en progreso",
      categoria: "Sistema",
      marca: "MongoDB",
      precio_lista_con_iva: "$0,00",
      image: "/img/placeholder-producto.webp",
      aplicaciones: [{ marca: "Sistema", modelo: "Atlas", version: "2024" }],
      detalles_tecnicos: { "Posición de la pieza": "Base de datos" },
      tiene_precio_valido: true,
      observaciones: "Estableciendo conexión con MongoDB Atlas. Esto puede tomar unos momentos."
    }
  ],
  metadatos: {
    codes: ["RENDER-COLD-001", "RENDER-COLD-002"],
    brands: ["Sistema", "Render", "MongoDB"],
    models: ["Cold Start", "Atlas"],
    categories: ["Sistema"],
    vehicles: ["Sistema Cold Start", "Sistema Atlas"],
    status: "cold_start",
    message: "Datos de emergencia - Servidor iniciándose"
  }
};

// =================================================================
// ===== FUNCIONES AUXILIARES MEJORADAS ==========================
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

// Categorías optimizadas
const CATEGORIAS = {
  "Amortiguadores": ["Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP", "Amort LIP", "Amort PRO TUNNING"],
  "Pastillas de Freno": ["Pastillas CORVEN C", "Pastillas CORVEN HT", "Pastillas FERODO", "Pastillas JURID"],
  "Embragues": ["Embragues CORVEN", "Embragues SADAR", "Embragues VALEO"],
  "Discos y Campanas": ["Discos y Camp HF", "Discos y Camp CORVEN"],
  "Rótulas": ["Rotulas CORVEN", "Rotulas SADAR"],
  "Otros": ["CTR", "FTE", "Gas Spring Stabilus", "Otros"]
};

// =================================================================
// ===== MIDDLEWARE MEJORADO PARA RENDER ==========================
// =================================================================

// Middleware para detectar y manejar cold starts
function coldStartMiddleware(req, res, next) {
  const uptime = Date.now() - RENDER_OPTIMIZATIONS.startTime;
  const isColdStart = uptime < 120000; // Primeros 2 minutos
  
  req.isColdStart = isColdStart;
  req.uptime = uptime;
  
  // Headers especiales para cold starts
  if (isColdStart) {
    res.set({
      'X-Cold-Start': 'true',
      'X-Server-Uptime': uptime.toString(),
      'X-Render-Status': 'warming-up'
    });
  } else {
    res.set({
      'X-Cold-Start': 'false',
      'X-Server-Uptime': uptime.toString(),
      'X-Render-Status': 'ready'
    });
  }
  
  next();
}

// Middleware para timeout con cold start awareness
function renderAwareTimeout(baseTimeoutMs = 25000) {
  return (req, res, next) => {
    const isColdStart = req.isColdStart || connectionManager.detectColdStart();
    const timeoutMs = isColdStart ? baseTimeoutMs * 2 : baseTimeoutMs; // Doble timeout para cold starts
    
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        console.warn(`⏰ [TIMEOUT] Request timeout después de ${timeoutMs}ms (Cold Start: ${isColdStart})`);
        
        res.status(408).json({
          success: false,
          error: 'Request timeout',
          timeout: timeoutMs,
          coldStart: isColdStart,
          uptime: req.uptime,
          fallback: true,
          message: isColdStart ? 
            'El servidor está iniciándose. Por favor intenta nuevamente en unos segundos.' :
            'Timeout de request. El servidor puede estar sobrecargado.'
        });
      }
    }, timeoutMs);
    
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    
    next();
  };
}

// Middleware de manejo de errores mejorado
function enhancedErrorHandler(error, req, res, next) {
  const isColdStart = req.isColdStart || connectionManager.detectColdStart();
  
  console.error('❌ [ERROR HANDLER]:', {
    message: error.message,
    code: error.code,
    codeName: error.codeName,
    url: req.url,
    method: req.method,
    coldStart: isColdStart,
    uptime: req.uptime,
    timestamp: new Date().toISOString()
  });
  
  // Actualizar health check con error
  connectionManager.updateHealthStatus('error', `Error en ${req.method} ${req.url}`, error);
  
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
  
  // Error genérico con información de cold start
  res.status(500).json({
    success: false,
    error: isColdStart ? 
      'El servidor se está iniciando, por favor intenta nuevamente en 30-60 segundos' :
      'Error interno del servidor',
    fallback: true,
    coldStart: isColdStart,
    uptime: req.uptime,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    retryAfter: isColdStart ? 60 : 30
  });
}

// Aplicar middleware global
router.use(coldStartMiddleware);
router.use(renderAwareTimeout(30000)); // 30 segundos base, 60 para cold starts

// =================================================================
// ===== RUTAS DE LA API ULTRA ROBUSTAS =======================
// =================================================================

// 🚀 1. RUTA DE PING MEJORADA PARA RENDER
router.get('/ping', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    console.log(`🏥 [PING] Iniciando health check (Cold Start: ${isColdStart})`);
    
    // Para cold starts, usar menos reintentos
    const maxRetries = isColdStart ? 2 : 3;
    
    const client = await connectWithRetry(maxRetries, 'ping');
    
    // Test de ping simple
    await Promise.race([
      client.db(DB_NAME).command({ ping: 1 }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Ping command timeout')), 8000)
      )
    ]);
    
    const responseTime = Date.now() - startTime;
    const stats = connectionManager.getStats();
    const healthStatus = RENDER_OPTIMIZATIONS.healthCheck;
    
    // Actualizar health status exitoso
    connectionManager.updateHealthStatus('healthy', `Ping exitoso en ${responseTime}ms`);
    
    res.json({
      success: true,
      message: `Pong! Conexión OK ${isColdStart ? '(Cold Start)' : '(Ready)'}`,
      responseTime: `${responseTime}ms`,
      
      // Información del servidor
      server: {
        status: isColdStart ? 'warming-up' : 'ready',
        uptime: req.uptime,
        coldStart: isColdStart,
        environment: process.env.NODE_ENV || 'unknown',
        region: process.env.RENDER_REGION || 'unknown',
        memory: process.memoryUsage(),
        nodeVersion: process.version
      },
      
      // Información de la base de datos
      database: {
        name: DB_NAME,
        collection: COLLECTION_NAME,
        connected: true,
        status: 'healthy'
      },
      
      // Estadísticas de conexión
      connection: {
        ...stats,
        healthCheck: {
          status: healthStatus.status,
          mongodb: healthStatus.mongodb,
          lastError: healthStatus.lastError,
          consecutiveErrors: healthStatus.consecutiveErrors,
          uptime: healthStatus.uptime
        }
      },
      
      // Configuración para debugging
      config: {
        timeouts: RENDER_CONFIG,
        optimizations: {
          coldStartHandling: true,
          adaptiveTimeouts: true,
          enhancedRetries: true
        }
      },
      
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ [PING] Health check exitoso (${responseTime}ms) - Estado: ${isColdStart ? 'Cold Start' : 'Ready'}`);
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.error(`❌ [PING] Health check falló (${responseTime}ms):`, error.message);
    
    // Respuesta de error mejorada
    res.status(503).json({
      success: false,
      message: `Error de conexión ${isColdStart ? '(Cold Start en progreso)' : '(Servidor activo)'}`,
      responseTime: `${responseTime}ms`,
      
      error: {
        message: error.message,
        code: error.code,
        type: error.name
      },
      
      server: {
        status: isColdStart ? 'cold-start-error' : 'connection-error',
        uptime: req.uptime,
        coldStart: isColdStart
      },
      
      connection: connectionManager.getStats(),
      healthCheck: RENDER_OPTIMIZATIONS.healthCheck,
      
      // Instrucciones para el cliente
      clientInstructions: {
        retry: true,
        retryAfter: isColdStart ? 60 : 30,
        message: isColdStart ?
          'El servidor está iniciándose. Intenta nuevamente en 1 minuto.' :
          'Error temporal. Intenta nuevamente en 30 segundos.'
      },
      
      fallback: true,
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 2. RUTA DE PRODUCTOS ULTRA ROBUSTA
router.get('/productos', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    const { categoria, marca, modelo, version, posicion, pagina = 1, limite = 15, ordenar = 'codigo' } = req.query;
    
    console.log(`📦 [PRODUCTOS] Request: página ${pagina}, límite ${limite} (Cold Start: ${isColdStart})`);
    
    // Si es cold start, usar datos de fallback inmediatamente para respuesta rápida
    if (isColdStart && connectionManager.consecutiveFailures > 2) {
      console.log(`🥶 [PRODUCTOS] Cold start con errores - Usando fallback inmediato`);
      
      return res.json({
        success: true,
        data: ENHANCED_FALLBACK_DATA.productos,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalProducts: ENHANCED_FALLBACK_DATA.productos.length,
          productsPerPage: ENHANCED_FALLBACK_DATA.productos.length,
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
          uptime: req.uptime,
          status: 'warming-up'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const client = await connectWithRetry(isColdStart ? 4 : 6, 'productos');
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
    const limiteInt = Math.min(parseInt(limite), isColdStart ? 20 : 50); // Menos productos en cold start
    
    console.log(`🔍 [PRODUCTOS] Filtros:`, filtros);
    console.log(`📄 [PRODUCTOS] Paginación: skip=${skip}, limit=${limiteInt}`);
    
    // Pipeline optimizado con timeout adaptativo
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
    
    // Timeout adaptativo según cold start
    const queryTimeout = isColdStart ? 45000 : 25000;
    
    // Ejecutar con timeout
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
        queryComplexity: 'normal',
        coldStart: isColdStart,
        uptime: req.uptime
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready',
        coldStart: isColdStart
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [PRODUCTOS] Error (${responseTime}ms):`, error.message);
    
    // Respuesta de fallback mejorada
    res.status(500).json({
      success: false,
      error: 'Error al obtener productos',
      fallback: {
        success: true,
        data: ENHANCED_FALLBACK_DATA.productos,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalProducts: ENHANCED_FALLBACK_DATA.productos.length,
          productsPerPage: ENHANCED_FALLBACK_DATA.productos.length,
          hasNextPage: false,
          hasPrevPage: false
        },
        reason: isColdStart ? 'cold-start-error' : 'database-error',
        message: isColdStart ? 
          'Datos temporales - El servidor se está iniciando' :
          'Datos temporales - Error de base de datos'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: isColdStart
      },
      server: {
        status: isColdStart ? 'cold-start-error' : 'database-error',
        uptime: req.uptime
      },
      clientInstructions: {
        retry: true,
        retryAfter: isColdStart ? 60 : 30,
        useFallback: true
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 3. RUTA DE METADATOS ULTRA ROBUSTA
router.get('/metadatos-busqueda', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    console.log(`🧠 [METADATOS] Generando índice de búsqueda (Cold Start: ${isColdStart})...`);
    
    // Si es cold start con errores, devolver fallback inmediato
    if (isColdStart && connectionManager.consecutiveFailures > 1) {
      console.log(`🥶 [METADATOS] Cold start con errores - Usando fallback inmediato`);
      
      return res.json({
        success: true,
        count: ENHANCED_FALLBACK_DATA.metadatos.codes.length,
        searchIndex: ENHANCED_FALLBACK_DATA.metadatos,
        stats: {
          totalProducts: ENHANCED_FALLBACK_DATA.metadatos.codes.length,
          brands: ENHANCED_FALLBACK_DATA.metadatos.brands.length,
          models: ENHANCED_FALLBACK_DATA.metadatos.models.length,
          categories: ENHANCED_FALLBACK_DATA.metadatos.categories.length,
          vehicles: ENHANCED_FALLBACK_DATA.metadatos.vehicles.length
        },
        fallback: {
          active: true,
          reason: 'cold-start-with-errors',
          message: 'Índice temporal mientras el servidor se inicia'
        },
        performance: {
          responseTime: `${Date.now() - startTime}ms`,
          processingComplexity: 'fallback'
        },
        server: {
          coldStart: true,
          status: 'warming-up'
        },
        timestamp: new Date().toISOString()
      });
    }
    
    const client = await connectWithRetry(isColdStart ? 3 : 5, 'metadatos');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Timeout adaptativo para metadatos
    const queryTimeout = isColdStart ? 30000 : 20000;
    const documentLimit = isColdStart ? 2000 : 5000; // Menos documentos en cold start
    
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
          limit: documentLimit
        }
      ).toArray(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Metadatos query timeout after ${queryTimeout}ms`)), queryTimeout)
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
      codes: Array.from(searchIndex.codes).slice(0, isColdStart ? 500 : 1000),
      brands: Array.from(searchIndex.brands).sort().slice(0, isColdStart ? 100 : 200),
      models: Array.from(searchIndex.models).sort().slice(0, isColdStart ? 250 : 500),
      categories: Array.from(searchIndex.categories).sort(),
      vehicles: Array.from(searchIndex.vehicles).sort().slice(0, isColdStart ? 400 : 800)
    };
    
    const responseTime = Date.now() - startTime;
    
    console.log(`✅ [METADATOS] Índice generado (${responseTime}ms): ${metadatos.length} productos procesados`);
    
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
        processingComplexity: isColdStart ? 'simplified' : 'optimized',
        coldStart: isColdStart,
        documentLimit: documentLimit
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready',
        uptime: req.uptime
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [METADATOS] Error (${responseTime}ms):`, error.message);
    
    // Fallback con datos básicos
    res.status(500).json({
      success: false,
      error: 'Error al obtener metadatos',
      fallback: {
        success: true,
        count: ENHANCED_FALLBACK_DATA.metadatos.codes.length,
        searchIndex: ENHANCED_FALLBACK_DATA.metadatos,
        stats: {
          totalProducts: ENHANCED_FALLBACK_DATA.metadatos.codes.length,
          brands: ENHANCED_FALLBACK_DATA.metadatos.brands.length,
          models: ENHANCED_FALLBACK_DATA.metadatos.models.length,
          categories: ENHANCED_FALLBACK_DATA.metadatos.categories.length,
          vehicles: ENHANCED_FALLBACK_DATA.metadatos.vehicles.length
        },
        reason: isColdStart ? 'cold-start-error' : 'database-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: isColdStart
      },
      server: {
        status: isColdStart ? 'cold-start-error' : 'database-error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 4. RUTA DE BÚSQUEDA OPTIMIZADA
router.get('/busqueda', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Consulta requerida (mínimo 2 caracteres)',
        coldStart: isColdStart
      });
    }
    
    const queryTrimmed = q.trim();
    console.log(`🔍 [BÚSQUEDA] Procesando: "${queryTrimmed}" (Cold Start: ${isColdStart})`);
    
    const client = await connectWithRetry(isColdStart ? 2 : 4, 'busqueda');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Búsqueda simplificada para evitar timeouts
    const searchTerms = normalizeText(queryTrimmed).split(' ').filter(t => t.length > 1);
    
    const matchConditions = {
      tiene_precio_valido: true,
      $or: [
        { codigo: { $regex: queryTrimmed, $options: 'i' } },
        { nombre: { $regex: queryTrimmed, $options: 'i' } },
        ...searchTerms.slice(0, isColdStart ? 2 : 4).map(term => ({
          $or: [
            { codigo: { $regex: term, $options: 'i' } },
            { nombre: { $regex: term, $options: 'i' } },
            { "aplicaciones.marca": { $regex: term, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: term, $options: 'i' } }
          ]
        }))
      ]
    };
    
    const searchTimeout = isColdStart ? 20000 : 15000;
    const maxResults = Math.min(parseInt(limit), isColdStart ? 30 : 50);
    
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
      query: queryTrimmed,
      results: results,
      totalResults: results.length,
      hasMore: results.length >= maxResults,
      performance: {
        responseTime: `${responseTime}ms`,
        searchTerms: searchTerms.length,
        coldStart: isColdStart,
        maxResults: maxResults
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready'
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
        reason: isColdStart ? 'cold-start-error' : 'search-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 5. RUTA DE FILTROS SIMPLIFICADA
router.get('/filtros/:tipo', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    const { tipo } = req.params;
    const { categoria, marca, modelo } = req.query;
    
    const tiposValidos = ['marcas', 'modelos', 'versiones', 'posiciones'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de filtro inválido',
        tiposValidos,
        coldStart: isColdStart
      });
    }
    
    console.log(`🔧 [FILTROS] Tipo: ${tipo}, categoria: ${categoria || 'todas'} (Cold Start: ${isColdStart})`);
    
    const client = await connectWithRetry(isColdStart ? 2 : 3, 'filtros');
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
    const timeoutMs = isColdStart ? 15000 : 10000;
    const resultLimit = isColdStart ? 50 : 100;
    
    switch (tipo) {
      case 'marcas':
        pipeline = [
          { $match: filtrosBase },
          { $unwind: "$aplicaciones" },
          { $group: { _id: "$aplicaciones.marca" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: resultLimit },
          { $project: { _id: 0, marca: "$_id" } }
        ];
        break;
        
      case 'modelos':
        if (!marca) {
          return res.status(400).json({
            success: false,
            error: 'Marca requerida para obtener modelos',
            coldStart: isColdStart
          });
        }
        pipeline = [
          { $match: { ...filtrosBase, "aplicaciones.marca": marca } },
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca } },
          { $group: { _id: "$aplicaciones.modelo" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: resultLimit },
          { $project: { _id: 0, modelo: "$_id" } }
        ];
        break;
        
      case 'versiones':
        if (!marca || !modelo) {
          return res.status(400).json({
            success: false,
            error: 'Marca y modelo requeridos para obtener versiones',
            coldStart: isColdStart
          });
        }
        pipeline = [
          { $match: { ...filtrosBase, "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } },
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } },
          { $group: { _id: "$aplicaciones.version" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $limit: Math.min(resultLimit, 30) },
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
    
    console.log(`✅ [FILTROS] ${tipo}: ${resultado.length} elementos (${responseTime}ms)`);
    
    res.json({
      success: true,
      tipo: tipo,
      data: resultado,
      count: resultado.length,
      filters: { categoria, marca, modelo },
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: isColdStart,
        resultLimit: resultLimit
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready'
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
        reason: isColdStart ? 'cold-start-error' : 'filter-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 6. RUTA DE PRODUCTO INDIVIDUAL
router.get('/producto/:codigo', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    const { codigo } = req.params;
    
    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Código de producto requerido',
        coldStart: isColdStart
      });
    }
    
    console.log(`🔍 [PRODUCTO] Buscando: ${codigo} (Cold Start: ${isColdStart})`);
    
    const client = await connectWithRetry(isColdStart ? 2 : 3, 'producto');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    const queryTimeout = isColdStart ? 15000 : 8000;
    
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
      console.log(`❌ [PRODUCTO] No encontrado: ${codigo} (${responseTime}ms)`);
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado',
        codigo: codigo,
        performance: {
          responseTime: `${responseTime}ms`,
          coldStart: isColdStart
        },
        server: {
          status: isColdStart ? 'warming-up' : 'ready'
        }
      });
    }
    
    console.log(`✅ [PRODUCTO] Encontrado: ${codigo} (${responseTime}ms)`);
    
    res.json({
      success: true,
      data: producto,
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: isColdStart
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready'
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
        data: ENHANCED_FALLBACK_DATA.productos[0],
        reason: isColdStart ? 'cold-start-error' : 'product-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 7. RUTA DE SUGERENCIAS BÁSICA
router.get('/sugerencias', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    const { q, limit = 8 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
        query: q || '',
        coldStart: isColdStart
      });
    }
    
    const queryTrimmed = q.trim();
    console.log(`💡 [SUGERENCIAS] Para: "${queryTrimmed}" (Cold Start: ${isColdStart})`);
    
    const client = await connectWithRetry(isColdStart ? 1 : 2, 'sugerencias');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    const suggestions = new Set();
    const normalizedQuery = normalizeText(queryTrimmed);
    const maxSuggestions = Math.min(parseInt(limit), isColdStart ? 5 : 8);
    const queryTimeout = isColdStart ? 8000 : 5000;
    
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
      query: queryTrimmed,
      suggestions: finalSuggestions,
      count: finalSuggestions.length,
      performance: {
        responseTime: `${responseTime}ms`,
        coldStart: isColdStart,
        maxSuggestions: maxSuggestions
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready'
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
        coldStart: isColdStart
      },
      fallback: {
        active: true,
        reason: isColdStart ? 'cold-start-error' : 'suggestions-error'
      },
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 8. RUTA DE METADATOS BÁSICOS (LEGACY)
router.get('/metadatos', async (req, res) => {
  const startTime = Date.now();
  const isColdStart = req.isColdStart;
  
  try {
    console.log(`📋 [METADATOS LEGACY] Cargando (Cold Start: ${isColdStart})...`);
    
    const client = await connectWithRetry(isColdStart ? 2 : 3, 'metadatos-legacy');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    const documentLimit = isColdStart ? 500 : 1000;
    const queryTimeout = isColdStart ? 20000 : 15000;
    
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
        coldStart: isColdStart,
        documentLimit: documentLimit
      },
      server: {
        status: isColdStart ? 'warming-up' : 'ready'
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
        data: [ENHANCED_FALLBACK_DATA.productos[0]],
        reason: isColdStart ? 'cold-start-error' : 'legacy-metadatos-error'
      },
      performance: {
        responseTime: `${responseTime}ms`,
        error: error.message,
        coldStart: isColdStart
      },
      timestamp: new Date().toISOString()
    });
  }
});

// =================================================================
// ===== MIDDLEWARE DE ERROR HANDLING ============================
// =================================================================

// Aplicar manejo de errores a todas las rutas
router.use(enhancedErrorHandler);

// =================================================================
// ===== WARMUP Y HEALTH MONITORING ==============================
// =================================================================

// Función de warmup automático
async function performWarmup() {
  console.log('🔥 [WARMUP] Iniciando warmup automático...');
  
  try {
    // Conectar a MongoDB
    await connectWithRetry(2, 'warmup');
    
    // Test básico de queries
    const client = connectionManager.client;
    if (client) {
      const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
      
      // Query de warmup simple
      await collection.findOne(
        { tiene_precio_valido: true },
        { projection: { codigo: 1 }, limit: 1 }
      );
      
      console.log('✅ [WARMUP] Completado exitosamente');
      connectionManager.updateHealthStatus('ready', 'Warmup completado - Sistema listo');
    }
    
  } catch (error) {
    console.warn('⚠️ [WARMUP] Falló, pero continuando:', error.message);
    connectionManager.updateHealthStatus('warming', 'Warmup falló - Continuando con carga bajo demanda');
  }
}

// Ejecutar warmup después de 5 segundos de inicializar
setTimeout(() => {
  if (connectionManager.detectColdStart()) {
    performWarmup();
  }
}, 5000);

// Health monitoring periódico
setInterval(async () => {
  try {
    if (connectionManager.isConnected()) {
      const client = connectionManager.client;
      await client.db(DB_NAME).command({ ping: 1 });
      connectionManager.updateHealthStatus('healthy', 'Monitoring check OK');
    }
  } catch (error) {
    console.warn('⚠️ [HEALTH MONITOR] Check falló:', error.message);
    connectionManager.updateHealthStatus('unhealthy', 'Monitoring check falló', error);
  }
}, 60000); // Cada minuto

// =================================================================
// ===== CLEANUP Y MANEJO DE SEÑALES =============================
// =================================================================

// Manejo de shutdown graceful
process.on('SIGINT', async () => {
  console.log('🛑 [SHUTDOWN] Recibida señal SIGINT...');
  connectionManager.updateHealthStatus('shutting-down', 'Shutdown graceful iniciado');
  await connectionManager.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 [SHUTDOWN] Recibida señal SIGTERM...');
  connectionManager.updateHealthStatus('shutting-down', 'Shutdown graceful iniciado');
  await connectionManager.disconnect();
  process.exit(0);
});

// Manejo de errores no capturados mejorado
process.on('uncaughtException', (error) => {
  console.error('💥 [UNCAUGHT EXCEPTION]:', {
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  connectionManager.updateHealthStatus('critical', 'Uncaught exception', error);
  
  // En producción, intentar continuar
  if (process.env.NODE_ENV === 'production') {
    console.log('🏥 [RECOVERY] Intentando continuar en modo de recuperación...');
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
  
  connectionManager.updateHealthStatus('warning', 'Unhandled rejection', reason);
  
  // Continuar en producción
  if (process.env.NODE_ENV !== 'production') {
    console.log('⚠️ [WARNING] Unhandled rejection en desarrollo');
  }
});

// =================================================================
// ===== LOGGING E INFORMACIÓN DEL SISTEMA =======================
// =================================================================

// Banner de inicio
console.log('\n' + '='.repeat(60));
console.log('🛡️ BACKEND ULTRA ROBUSTO PARA RENDER.COM v2.0');
console.log('='.repeat(60));

console.log('⚙️ Configuración aplicada:');
console.log('  📊 Timeouts:');
console.log(`    • Conexión: ${RENDER_CONFIG.connectTimeoutMS}ms`);
console.log(`    • Query normal: 25000ms`);
console.log(`    • Query cold start: 45000ms`);
console.log(`    • Socket: ${RENDER_CONFIG.socketTimeoutMS}ms`);

console.log('  🔄 Reintentos:');
console.log(`    • Máximo: ${RENDER_CONFIG.maxRetries}`);
console.log(`    • Delay base: ${RENDER_CONFIG.retryDelayMs}ms`);
console.log(`    • Pool size: ${RENDER_CONFIG.minPoolSize}-${RENDER_CONFIG.maxPoolSize}`);

console.log('  🛡️ Características especiales:');
console.log('    • Cold start detection: ✅');
console.log('    • Adaptive timeouts: ✅');
console.log('    • Enhanced fallbacks: ✅');
console.log('    • Health monitoring: ✅');
console.log('    • Graceful degradation: ✅');

console.log('🌐 Endpoints optimizados disponibles:');
console.log('  • GET /ping - Health check con cold start detection');
console.log('  • GET /productos - Lista con fallback automático');
console.log('  • GET /metadatos-busqueda - Índice optimizado');
console.log('  • GET /busqueda?q=... - Búsqueda adaptativa');
console.log('  • GET /filtros/:tipo - Filtros con timeouts ajustables');
console.log('  • GET /producto/:codigo - Producto individual');
console.log('  • GET /sugerencias?q=... - Sugerencias rápidas');
console.log('  • GET /metadatos - Legacy endpoint');

console.log('🔧 Optimizaciones para Render.com:');
console.log('  • Cold start handling automático');
console.log('  • Timeouts adaptativos según estado del servidor');
console.log('  • Fallbacks inteligentes con datos útiles');
console.log('  • Reintentos exponenciales con jitter');
console.log('  • Health monitoring continuo');
console.log('  • Warmup automático post-inicialización');

console.log('📊 Estado inicial:');
console.log(`  • Servidor iniciado: ${new Date().toISOString()}`);
console.log(`  • Entorno: ${process.env.NODE_ENV || 'unknown'}`);
console.log(`  • Región Render: ${process.env.RENDER_REGION || 'unknown'}`);
console.log(`  • Node.js: ${process.version}`);
console.log(`  • Memoria inicial: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

console.log('\n🚨 NOTAS IMPORTANTES PARA RENDER.COM:');
console.log('  • Los servidores gratuitos se "duermen" después de 15 min de inactividad');
console.log('  • El primer request después del "sueño" puede tardar 30-60 segundos');
console.log('  • Este sistema detecta automáticamente cold starts y ajusta timeouts');
console.log('  • Los fallbacks proporcionan respuestas inmediatas durante cold starts');
console.log('  • El warmup automático mejora la performance después del cold start');

console.log('\n💡 MONITOREO Y DEBUG:');
console.log('  • Health status disponible en GET /ping');
console.log('  • Logs detallados con timestamps y contexto');
console.log('  • Headers de respuesta incluyen estado del servidor');
console.log('  • Fallbacks automáticos con explicación del motivo');

console.log('='.repeat(60) + '\n');

// Log de configuración de MongoDB
console.log('🗄️ Configuración de MongoDB:');
console.log(`  • URI: ${MONGODB_URI.replace(/:[^:@]*@/, ':***@')}`);
console.log(`  • Base de datos: ${DB_NAME}`);
console.log(`  • Colección: ${COLLECTION_NAME}`);
console.log(`  • Pool: ${RENDER_CONFIG.minPoolSize}-${RENDER_CONFIG.maxPoolSize} conexiones`);
console.log(`  • Timeouts: Connect ${RENDER_CONFIG.connectTimeoutMS}ms, Socket ${RENDER_CONFIG.socketTimeoutMS}ms`);

// Información del entorno Render
if (process.env.RENDER) {
  console.log('\n🏭 INFORMACIÓN DE RENDER:');
  console.log(`  • Service ID: ${process.env.RENDER_SERVICE_ID || 'N/A'}`);
  console.log(`  • Service Name: ${process.env.RENDER_SERVICE_NAME || 'N/A'}`);
  console.log(`  • Git Commit: ${process.env.RENDER_GIT_COMMIT || 'N/A'}`);
  console.log(`  • External URL: ${process.env.RENDER_EXTERNAL_URL || 'N/A'}`);
  console.log(`  • Instance ID: ${process.env.RENDER_INSTANCE_ID || 'N/A'}`);
}

// Estado inicial del health check
connectionManager.updateHealthStatus('initialized', 'Sistema inicializado - Listo para recibir requests');

console.log('\n✅ Backend ultra robusto iniciado exitosamente');
console.log('🎯 Configurado específicamente para máxima compatibilidad con Render.com');
console.log('⏱️ Cold start detection activo - Primeros requests serán optimizados automáticamente');
console.log('\n📡 Esperando conexiones...\n');

// Exportar router y utilidades
module.exports = router;

// Exportar funciones útiles para testing/debugging
module.exports.connectionManager = connectionManager;
module.exports.RENDER_OPTIMIZATIONS = RENDER_OPTIMIZATIONS;
module.exports.connectWithRetry = connectWithRetry;
module.exports.ENHANCED_FALLBACK_DATA = ENHANCED_FALLBACK_DATA;