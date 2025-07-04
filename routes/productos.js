const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

// ===== CONFIGURACIÓN =====
const app = express();
const PORT = process.env.PORT || 3001; // Puerto 3001 para separar del frontend

// MONGODB
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// ===== CONFIGURACIÓN CORS =====
const allowedOrigins = [
  'http://localhost:3000',    // Tu frontend
  'http://127.0.0.1:3000',
  'https://bethersa.com.ar',
  'https://www.bethersa.com.ar',
  'https://bethersa.online',
  'https://www.bethersa.online'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (Postman, aplicaciones móviles, etc.)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn('❌ [CORS] Origen no permitido:', origin);
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());


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
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    console.log('📱 [MONGODB] Usando conexión existente');
    return cachedClient;
  }

  console.log('🔌 [MONGODB] Creando nueva conexión...');
  
  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 5000,
    retryWrites: true,
    retryReads: true
  });

  try {
    await client.connect();
    console.log('✅ [MONGODB] Conectado exitosamente a:', DB_NAME);
    cachedClient = client;
    return client;
  } catch (error) {
    console.error('❌ [MONGODB] Error de conexión:', error);
    throw error;
  }
}

// ===== MIDDLEWARE =====
app.use((req, res, next) => {
  console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});


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



app.get('/api/ping', async (req, res) => {
  try {
    console.log('🏥 [PING] Verificando conexión MongoDB...');
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    
    // Ping básico
    await db.command({ ping: 1 });
    
    // Contar documentos
    const count = await db.collection(COLLECTION_NAME).countDocuments();
    
    console.log('✅ [PING] MongoDB conectado OK');

    res.json({
      success: true,
      message: 'MongoDB conectado exitosamente',
      database: DB_NAME,
      collection: COLLECTION_NAME,
      totalProducts: count,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [PING] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error de conexión MongoDB'
    });
  }
});

app.get('/api/productos', async (req, res) => {
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

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtros
    const filtros = {};

    // Filtro por categoría
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    // Filtros de vehículo
    if (marca || modelo || version) {
      const aplicacionesFiltro = {};
      if (marca) aplicacionesFiltro["aplicaciones.marca"] = marca;
      if (modelo) aplicacionesFiltro["aplicaciones.modelo"] = modelo;
      if (version) aplicacionesFiltro["aplicaciones.version"] = version;
      
      Object.assign(filtros, aplicacionesFiltro);
    }

    // Filtro por posición
    if (posicion) {
      filtros["detalles_tecnicos.Posición de la pieza"] = posicion;
    }

    // Solo productos con precio válido
    filtros.tiene_precio_valido = true;

    console.log('🔍 [PRODUCTOS] Filtros construidos:', JSON.stringify(filtros, null, 2));

    // Paginación
    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const limiteInt = parseInt(limite);

    // Ordenamiento
    const sort = {};
    sort[ordenar] = 1;

    // Ejecutar consulta con agregación
    const pipeline = [
      { $match: filtros },
      { $sort: sort },
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limiteInt }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ];

    const result = await collection.aggregate(pipeline).toArray();
    const productos = result[0].data;
    const totalProductos = result[0].totalCount[0]?.count || 0;
    const totalPaginas = Math.ceil(totalProductos / limiteInt);

    console.log(`✅ [PRODUCTOS] ${productos.length} productos encontrados (${totalProductos} total)`);

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
      filters: {
        categoria, marca, modelo, version, posicion
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [PRODUCTOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener productos'
    });
  }
});

// 🧠 METADATOS PARA BÚSQUEDA
app.get('/api/metadatos-busqueda', async (req, res) => {
  try {
    console.log('🧠 [METADATOS-BÚSQUEDA] Cargando...');

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const metadatos = await collection.find(
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
        limit: 1000
      }
    ).toArray();

    // Crear índice de búsqueda
    const searchIndex = {
      codes: [],
      brands: new Set(),
      models: new Set(),
      categories: new Set(),
      vehicles: new Set()
    };

    metadatos.forEach(product => {
      searchIndex.codes.push(product.codigo);
      searchIndex.categories.add(product.categoria);
      if (product.marca) searchIndex.brands.add(product.marca);
      
      if (product.aplicaciones) {
        product.aplicaciones.forEach(app => {
          if (app.marca) searchIndex.brands.add(app.marca);
          if (app.modelo) searchIndex.models.add(app.modelo);
          if (app.marca && app.modelo) {
            searchIndex.vehicles.add(`${app.marca} ${app.modelo}`);
          }
        });
      }
    });

    // Convertir Sets a Arrays
    const finalIndex = {
      codes: searchIndex.codes.slice(0, 500),
      brands: Array.from(searchIndex.brands).sort().slice(0, 100),
      models: Array.from(searchIndex.models).sort().slice(0, 200),
      categories: Array.from(searchIndex.categories).sort(),
      vehicles: Array.from(searchIndex.vehicles).sort().slice(0, 300)
    };

    console.log(`✅ [METADATOS-BÚSQUEDA] ${metadatos.length} productos indexados`);

    res.json({
      success: true,
      count: metadatos.length,
      searchIndex: finalIndex,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [METADATOS-BÚSQUEDA] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener metadatos de búsqueda'
    });
  }
});

app.get('/api/producto/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Código de producto requerido'
      });
    }

    console.log('🔍 [PRODUCTO] Buscando producto:', codigo);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const producto = await collection.findOne(
      { codigo: codigo },
      { projection: { _id: 0 } }
    );

    if (!producto) {
      console.log('❌ [PRODUCTO] No encontrado:', codigo);
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    console.log('✅ [PRODUCTO] Encontrado:', codigo);

    res.json({
      success: true,
      data: producto,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [PRODUCTO] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener producto'
    });
  }
});


app.get('/api/filtros/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const { categoria, marca, modelo } = req.query;

    console.log('🚗 [FILTROS] Obteniendo:', tipo, 'para:', { categoria, marca, modelo });

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtros base
    const filtros = {};
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    let pipeline = [{ $match: filtros }];

    // Agregación según el tipo solicitado
    switch (tipo) {
      case 'marcas':
        pipeline.push(
          { $unwind: "$aplicaciones" },
          { $group: { _id: "$aplicaciones.marca" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, marca: "$_id" } }
        );
        break;

      case 'modelos':
        if (!marca) {
          return res.status(400).json({ 
            success: false, 
            error: 'Marca requerida para obtener modelos' 
          });
        }
        pipeline.push(
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca } },
          { $group: { _id: "$aplicaciones.modelo" } },
          { $match: { _id: { $ne: null, $ne: "" } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, modelo: "$_id" } }
        );
        break;

      case 'versiones':
        if (!marca || !modelo) {
          return res.status(400).json({ 
            success: false, 
            error: 'Marca y modelo requeridos para obtener versiones' 
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
          { $project: { _id: 0, version: "$_id" } }
        );
        break;

      case 'posiciones':
        // Agregar filtros de vehículo si existen
        if (marca) filtros["aplicaciones.marca"] = marca;
        if (modelo) filtros["aplicaciones.modelo"] = modelo;
        
        pipeline = [
          { $match: filtros },
          { $group: { _id: "$detalles_tecnicos.Posición de la pieza" } },
          { $match: { _id: { $ne: null, $ne: "", $exists: true } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, posicion: "$_id" } }
        ];
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Tipo de filtro inválido. Use: marcas, modelos, versiones, posiciones'
        });
    }

    const resultado = await collection.aggregate(pipeline).toArray();

    console.log(`✅ [FILTROS] ${resultado.length} ${tipo} encontrados`);

    res.json({
      success: true,
      tipo: tipo,
      data: resultado,
      count: resultado.length,
      filters: { categoria, marca, modelo },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [FILTROS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener filtros'
    });
  }
});


app.get('/api/busqueda', async (req, res) => {
  try {
    const { 
      q,           
      limit = 20,  
      offset = 0   
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query de búsqueda requerida (mínimo 2 caracteres)'
      });
    }

    console.log('🔍 [BÚSQUEDA] Query:', q);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Búsqueda simple pero efectiva
    const searchTerms = normalizeText(q.trim()).split(' ').filter(t => t.length > 1);
    
    const matchConditions = {
      tiene_precio_valido: true,
      $or: [
        { codigo: { $regex: q, $options: 'i' } },
        { nombre: { $regex: q, $options: 'i' } },
        ...searchTerms.slice(0, 4).map(term => ({
          $or: [
            { codigo: { $regex: term, $options: 'i' } },
            { nombre: { $regex: term, $options: 'i' } },
            { "aplicaciones.marca": { $regex: term, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: term, $options: 'i' } }
          ]
        }))
      ]
    };

    const maxResults = Math.min(parseInt(limit), 50);

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
          detalles_tecnicos: 1,
          tiene_precio_valido: 1
        }
      }
    ];

    const results = await collection.aggregate(pipeline).toArray();

    console.log(`✅ [BÚSQUEDA] ${results.length} resultados encontrados`);

    res.json({
      success: true,
      query: q.trim(),
      results: results,
      totalResults: results.length,
      hasMore: results.length >= maxResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [BÚSQUEDA] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error en búsqueda'
    });
  }
});

// 💡 SUGERENCIAS
app.get('/api/sugerencias', async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
        query: q || ''
      });
    }

    console.log('💡 [SUGERENCIAS] Para:', q);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const suggestions = new Set();
    const normalizedQuery = normalizeText(q);
    const maxSuggestions = Math.min(parseInt(limit), 8);

    // Búsqueda simple de códigos
    const codigoMatches = await collection.find(
      { 
        codigo: { $regex: `^${normalizedQuery}`, $options: 'i' },
        tiene_precio_valido: true
      },
      { projection: { codigo: 1, _id: 0 }, limit: maxSuggestions }
    ).toArray();

    codigoMatches.forEach(p => suggestions.add(p.codigo));

    const finalSuggestions = Array.from(suggestions).slice(0, maxSuggestions);

    console.log(`✅ [SUGERENCIAS] ${finalSuggestions.length} resultados`);

    res.json({
      success: true,
      query: q.trim(),
      suggestions: finalSuggestions,
      count: finalSuggestions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [SUGERENCIAS] Error:', error);
    res.json({
      success: true,
      query: req.query.q || '',
      suggestions: [],
      count: 0,
      error: error.message
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
app.use((error, req, res, next) => {
  console.error('❌ [ERROR HANDLER]:', {
    message: error.message,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  if (error.name === 'MongoTimeoutError') {
    return res.status(504).json({
      success: false,
      error: 'Timeout de base de datos',
      retry: true
    });
  }

  if (error.name === 'MongoNetworkError') {
    return res.status(503).json({
      success: false,
      error: 'Error de conexión a base de datos',
      retry: true
    });
  }

  res.status(500).json({
    success: false,
    error: 'Error interno del servidor',
    timestamp: new Date().toISOString()
  });
});


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
  await gracefulDisconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 [SHUTDOWN] Recibida señal SIGTERM...');
  await gracefulDisconnect();
  process.exit(0);
});

// ===== INICIAR SERVIDOR =====
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BACKEND MONGODB INICIADO');
  console.log('='.repeat(60));
  console.log(`🌐 Servidor ejecutándose en: http://localhost:${PORT}`);
  console.log(`📊 Base de datos: ${DB_NAME}.${COLLECTION_NAME}`);
  console.log('🔗 Endpoints disponibles:');
  console.log(`  • GET http://localhost:${PORT}/api/ping`);
  console.log(`  • GET http://localhost:${PORT}/api/productos`);
  console.log(`  • GET http://localhost:${PORT}/api/busqueda?q=...`);
  console.log(`  • GET http://localhost:${PORT}/api/filtros/marcas`);
  console.log(`  • GET http://localhost:${PORT}/api/producto/:codigo`);
  console.log(`  • GET http://localhost:${PORT}/api/sugerencias?q=...`);
  console.log(`  • GET http://localhost:${PORT}/api/metadatos-busqueda`);
  console.log('='.repeat(60));
  console.log('✅ Listo para recibir peticiones del frontend\n');
});


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
module.exports = app;