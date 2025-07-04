const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// =================================================================
// ===== CONFIGURACIÓN OPTIMIZADA PARA MÁXIMO RENDIMIENTO ========
// =================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// 🚀 CONFIGURACIÓN DE RENDIMIENTO EXTREMO
const PERFORMANCE_CONFIG = {
  // Pool de conexiones optimizado
  maxPoolSize: 20,          // Más conexiones concurrentes
  minPoolSize: 5,           // Mantener conexiones mínimas
  maxIdleTimeMS: 60000,     // 1 minuto de timeout
  
  // Timeouts optimizados para Render.com
  serverSelectionTimeoutMS: 10000,  // 10 segundos
  socketTimeoutMS: 60000,           // 1 minuto
  connectTimeoutMS: 10000,          // 10 segundos
  
  // Compresión y optimización
  compressors: ['snappy', 'zlib'],
  zlibCompressionLevel: 6,
  
  // Read preferences para distribuir carga
  readPreference: 'secondaryPreferred',
  readConcern: { level: 'local' },
  
  // Write concerns optimizados
  writeConcern: { w: 'majority', j: false },
  
  // Buffer settings
  bufferMaxEntries: 0,
  bufferCommands: false
};

// 🔥 SISTEMA DE CACHE INTELIGENTE EN MEMORIA
const CACHE_SYSTEM = {
  // Cache principal
  cache: new Map(),
  
  // Configuración
  TTL: 10 * 60 * 1000,        // 10 minutos
  MAX_SIZE: 1000,             // Máximo 1000 entradas
  CLEANUP_INTERVAL: 5 * 60 * 1000,  // Limpiar cada 5 minutos
  
  // Métricas
  hits: 0,
  misses: 0,
  
  // Métodos
  set(key, data, customTTL = null) {
    const ttl = customTTL || this.TTL;
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
      accessed: Date.now(),
      hits: 0
    };
    
    // Limitar tamaño del cache
    if (this.cache.size >= this.MAX_SIZE) {
      this.evictOldest();
    }
    
    this.cache.set(key, entry);
    console.log(`💾 [CACHE] Guardado: ${key} (TTL: ${ttl}ms)`);
  },
  
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Verificar expiración
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    // Actualizar estadísticas
    entry.accessed = Date.now();
    entry.hits++;
    this.hits++;
    
    console.log(`⚡ [CACHE] Hit: ${key} (${entry.hits} hits)`);
    return entry.data;
  },
  
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessed < oldestTime) {
        oldestTime = entry.accessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`🗑️ [CACHE] Evicted: ${oldestKey}`);
    }
  },
  
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log('🧹 [CACHE] Cache limpiado');
  },
  
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      entries: this.cache.size
    };
  }
};

// Limpiar cache periódicamente
setInterval(() => {
  const now = Date.now();
  let expired = 0;
  
  for (const [key, entry] of CACHE_SYSTEM.cache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      CACHE_SYSTEM.cache.delete(key);
      expired++;
    }
  }
  
  if (expired > 0) {
    console.log(`🧹 [CACHE] ${expired} entradas expiradas eliminadas`);
  }
}, CACHE_SYSTEM.CLEANUP_INTERVAL);

// Variables globales optimizadas
let cachedClient = null;
let connectionAttempts = 0;
let lastConnectionError = null;

/**
 * Conexión optimizada a MongoDB con retry inteligente
 */
async function connectToMongoDB() {
  // Verificar conexión existente
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    return cachedClient;
  }
  
  console.log('🔌 [MONGODB] Creando conexión optimizada...');
  connectionAttempts++;
  
  const client = new MongoClient(MONGODB_URI, {
    // Pool settings
    maxPoolSize: PERFORMANCE_CONFIG.maxPoolSize,
    minPoolSize: PERFORMANCE_CONFIG.minPoolSize,
    maxIdleTimeMS: PERFORMANCE_CONFIG.maxIdleTimeMS,
    
    // Timeout settings
    serverSelectionTimeoutMS: PERFORMANCE_CONFIG.serverSelectionTimeoutMS,
    socketTimeoutMS: PERFORMANCE_CONFIG.socketTimeoutMS,
    connectTimeoutMS: PERFORMANCE_CONFIG.connectTimeoutMS,
    
    // Compression
    compressors: PERFORMANCE_CONFIG.compressors,
    zlibCompressionLevel: PERFORMANCE_CONFIG.zlibCompressionLevel,
    
    // Read/Write preferences
    readPreference: PERFORMANCE_CONFIG.readPreference,
    readConcern: PERFORMANCE_CONFIG.readConcern,
    writeConcern: PERFORMANCE_CONFIG.writeConcern,
    
    // Buffer settings
    bufferMaxEntries: PERFORMANCE_CONFIG.bufferMaxEntries,
    bufferCommands: PERFORMANCE_CONFIG.bufferCommands,
    
    // Additional optimizations
    retryWrites: true,
    retryReads: true,
    maxStalenessSeconds: 90,
    heartbeatFrequencyMS: 10000
  });
  
  try {
    await client.connect();
    
    console.log(`✅ [MONGODB] Conectado exitosamente (intento ${connectionAttempts})`);
    console.log(`🎯 [MONGODB] Pool: ${PERFORMANCE_CONFIG.maxPoolSize} max, ${PERFORMANCE_CONFIG.minPoolSize} min`);
    
    // Crear índices si es la primera conexión
    if (connectionAttempts === 1) {
      await crearIndicesOptimizados(client);
    }
    
    cachedClient = client;
    lastConnectionError = null;
    
    return client;
    
  } catch (error) {
    console.error(`❌ [MONGODB] Error conexión (intento ${connectionAttempts}):`, error.message);
    lastConnectionError = error;
    
    // Retry con backoff exponencial
    if (connectionAttempts < 3) {
      const delay = Math.pow(2, connectionAttempts) * 1000;
      console.log(`🔄 [MONGODB] Reintentando en ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return await connectToMongoDB();
    }
    
    throw error;
  }
}

/**
 * Crear índices optimizados para máximo rendimiento
 */
async function crearIndicesOptimizados(client) {
  try {
    console.log('🏗️ [INDICES] Creando índices optimizados...');
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Índices compuestos para consultas frecuentes
    const indices = [
      // 🚀 Índice principal para productos con precio válido
      { 
        tiene_precio_valido: 1, 
        categoria: 1, 
        codigo: 1 
      },
      
      // 🚀 Índices para filtros de vehículo (más usados)
      { 
        "aplicaciones.marca": 1, 
        "aplicaciones.modelo": 1,
        tiene_precio_valido: 1
      },
      
      // 🚀 Índice para búsquedas por código (muy frecuente)
      { 
        codigo: 1 
      },
      
      // 🚀 Índice para categorías con paginación
      { 
        categoria: 1, 
        codigo: 1,
        tiene_precio_valido: 1
      },
      
      // 🚀 Índice para posiciones
      { 
        "detalles_tecnicos.Posición de la pieza": 1,
        categoria: 1
      },
      
      // 🚀 Índice para búsquedas de texto
      { 
        nombre: "text", 
        codigo: "text" 
      },
      
      // 🚀 Índice para aplicaciones específicas
      {
        "aplicaciones.marca": 1,
        "aplicaciones.modelo": 1,
        "aplicaciones.version": 1
      }
    ];
    
    // Crear índices en paralelo para mayor velocidad
    const promesasIndices = indices.map(async (index, i) => {
      try {
        await collection.createIndex(index, { 
          background: true,
          name: `optimized_index_${i + 1}`
        });
        console.log(`✅ [INDICES] Índice ${i + 1} creado`);
      } catch (error) {
        console.warn(`⚠️ [INDICES] Error creando índice ${i + 1}:`, error.message);
      }
    });
    
    await Promise.allSettled(promesasIndices);
    console.log('🎯 [INDICES] Proceso de creación completado');
    
  } catch (error) {
    console.warn('⚠️ [INDICES] Error general:', error.message);
  }
}

// =================================================================
// ===== FUNCIONES AUXILIARES ULTRA OPTIMIZADAS ==================
// =================================================================

// Cache para normalizaciones de texto
const textNormalizationCache = new Map();

function normalizeText(text) {
  if (!text) return '';
  
  const textStr = text.toString();
  
  // Verificar cache
  if (textNormalizationCache.has(textStr)) {
    return textNormalizationCache.get(textStr);
  }
  
  const normalized = textStr
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
  
  // Guardar en cache (limitar tamaño)
  if (textNormalizationCache.size > 1000) {
    const firstKey = textNormalizationCache.keys().next().value;
    textNormalizationCache.delete(firstKey);
  }
  
  textNormalizationCache.set(textStr, normalized);
  return normalized;
}

// Categorías optimizadas con lookup rápido
const CATEGORIAS = {
  "Amortiguadores": ["Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP", "Amort LIP", "Amort PRO TUNNING"],
  "Barras": ["Barras HD SADAR"],
  "Bieletas": ["Bieletas CORVEN", "Bieletas SADAR"],
  "Brazos Suspension": ["Brazos Susp CORVEN", "Brazos Susp SADAR"],
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

// Crear lookup inverso para búsquedas rápidas
const CATEGORIA_LOOKUP = {};
Object.entries(CATEGORIAS).forEach(([categoria, subcategorias]) => {
  subcategorias.forEach(subcat => {
    CATEGORIA_LOOKUP[subcat] = categoria;
  });
});

// 🚀 PIPELINE OPTIMIZADO PARA PRODUCTOS
function buildOptimizedProductsPipeline(filters, limit, offset) {
  console.time('⚡ Pipeline Build');
  
  // Condición base optimizada
  const matchConditions = { tiene_precio_valido: true };
  
  // Filtro de categoría optimizado
  if (filters.categoria && filters.categoria !== 'todos') {
    if (CATEGORIAS[filters.categoria]) {
      // Es una categoría principal, buscar todas las subcategorías
      matchConditions.categoria = { $in: CATEGORIAS[filters.categoria] };
    } else {
      // Es una subcategoría específica
      matchConditions.categoria = filters.categoria;
    }
  }
  
  // Filtros de aplicaciones (optimizados para índices)
  if (filters.marca) {
    matchConditions["aplicaciones.marca"] = filters.marca;
  }
  
  if (filters.modelo) {
    matchConditions["aplicaciones.modelo"] = filters.modelo;
  }
  
  if (filters.version) {
    matchConditions["aplicaciones.version"] = filters.version;
  }
  
  // Filtro de posición
  if (filters.posicion) {
    matchConditions["detalles_tecnicos.Posición de la pieza"] = filters.posicion;
  }
  
  // Pipeline optimizado con proyección temprana
  const pipeline = [
    // 1. Match con índices optimizados
    { $match: matchConditions },
    
    // 2. Proyección temprana para reducir datos transferidos
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
    },
    
    // 3. Sort optimizado (usar índice)
    { $sort: { codigo: 1 } },
    
    // 4. Paginación
    { $skip: offset },
    { $limit: limit }
  ];
  
  console.timeEnd('⚡ Pipeline Build');
  console.log(`🎯 [PIPELINE] Condiciones:`, matchConditions);
  
  return pipeline;
}

// 🚀 PIPELINE PARA COUNT OPTIMIZADO
function buildCountPipeline(filters) {
  const matchConditions = { tiene_precio_valido: true };
  
  if (filters.categoria && filters.categoria !== 'todos') {
    matchConditions.categoria = CATEGORIAS[filters.categoria] 
      ? { $in: CATEGORIAS[filters.categoria] } 
      : filters.categoria;
  }
  
  if (filters.marca) matchConditions["aplicaciones.marca"] = filters.marca;
  if (filters.modelo) matchConditions["aplicaciones.modelo"] = filters.modelo;
  if (filters.version) matchConditions["aplicaciones.version"] = filters.version;
  if (filters.posicion) matchConditions["detalles_tecnicos.Posición de la pieza"] = filters.posicion;
  
  return [
    { $match: matchConditions },
    { $count: "total" }
  ];
}

// Funciones auxiliares optimizadas (mantenidas del original)
function getValidCategoriesForProduct(product) {
  const categoryMap = {
    'amortiguador': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
    'pastilla': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'freno': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C', 'Discos y Camp CORVEN', 'Discos y Camp HF'],
    'disco': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'cazoleta': ['Cazoletas CORVEN', 'Cazoletas SADAR'],
    'bieleta': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'rotula': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'embrague': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    'brazo': ['Brazos Susp CORVEN', 'Brazos Susp SADAR'],
    'extremo': ['Extremos CORVEN', 'Extremos SADAR'],
    'axial': ['Axiales CORVEN', 'Axiales SADAR'],
    'homocinetica': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'rodamiento': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'maza': ['Mazas CORVEN', 'Mazas HF'],
    'semieje': ['Semiejes CORVEN'],
    'soporte': ['Soporte Motor CORVEN'],
    'parrilla': ['Parrillas CORVEN', 'Parrillas SADAR'],
    'barra': ['Barras HD SADAR'],
    'caja': ['Cajas Mec CORVEN', 'Cajas Hid CORVEN'],
    'bomba': ['Bombas Hid CORVEN'],
    'suspension': ['Susp Neumática SADAR', 'Amort CORVEN', 'Cazoletas CORVEN', 'Parrillas CORVEN'],
  };
  const normalizedProduct = normalizeText(product).replace(/s$/, '');
  return categoryMap[normalizedProduct] || [];
}

function mapPositionForSearch(position) {
  const positionMap = {
    'delantero': 'Delantero', 'del': 'Delantero',
    'trasero': 'Trasero', 'pos': 'Trasero',
    'izquierdo': 'Izquierdo', 'izq': 'Izquierdo',
    'derecho': 'Derecho', 'der': 'Derecho',
    'superior': 'Superior', 'sup': 'Superior',
    'inferior': 'Inferior', 'inf': 'Inferior',
    'delantera': 'Delantero', 'trasera': 'Trasero',
    'izquierda': 'Izquierdo', 'derecha': 'Derecho',
    'posterior': 'Trasero', 'anterior': 'Delantero'
  };
  const normalizedPosition = normalizeText(position);
  return positionMap[normalizedPosition] || position;
}

function checkYearInRange(versionString, targetYear) {
  if (!versionString || !targetYear) return false;
  
  const version = String(versionString);
  const year = parseInt(targetYear);
  
  // Casos de rango (mantenidos del original)
  let match = version.match(/\.\.\/(\d{2,4})/);
  if (match) {
    const endYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
    return year <= endYear;
  }
  
  match = version.match(/(\d{2,4})\/\.\./);
  if (match) {
    const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
    return year >= startYear;
  }
  
  match = version.match(/(\d{2,4})\/(\d{2,4})/);
  if (match) {
    const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
    const endYear = parseInt(match[2].length === 2 ? '19' + match[2] : match[2]);
    return year >= startYear && year <= endYear;
  }
  
  match = version.match(/\(?(\d{2,4})\)?/);
  if (match) {
    const versionYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
    return year === versionYear;
  }
  
  return false;
}

function parseNaturalQuery(query) {
  console.log('🧐 [Parser Optimizado] Procesando:', query);
  
  const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'auto', 'modelo'];
  const productKeywords = ['amortiguador', 'pastilla', 'freno', 'disco', 'cazoleta', 'bieleta', 'rotula', 'embrague', 'brazo', 'extremo', 'axial', 'homocinetica', 'rodamiento', 'maza', 'semieje', 'soporte', 'parrilla', 'barra', 'caja', 'bomba', 'suspension'];
  const positionKeywords = ['delantero', 'trasero', 'izquierdo', 'derecho', 'superior', 'inferior', 'del', 'pos', 'izq', 'der', 'sup', 'inf', 'lado', 'porton', 'capot', 'baul', 'exterior', 'interior', 'diferencial', 'extremo', 'fuelle', 'corona', 'lateral','delantera', 'trasera', 'izquierda', 'derecha', 'posterior', 'anterior'];
  
  const words = normalizeText(query).split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 1);
  const result = { product: null, position: null, year: null, vehicleTerms: [], isStructured: false, freeText: query };
  const remainingWords = [];

  for (const word of words) {
    if (!result.product && productKeywords.includes(word.replace(/s$/, ''))) {
      result.product = word.replace(/s$/, '');
    } else if (!result.position && positionKeywords.includes(word)) {
      result.position = word;
    } else if (!result.year && /^\d{4}$/.test(word)) {
      result.year = word;
    } else if (!result.year && /^\d{2}$/.test(word)) {
      result.year = String((parseInt(word) > 30 ? 1900 : 2000) + parseInt(word));
    } else {
      remainingWords.push(word);
    }
  }
  
  result.vehicleTerms = remainingWords;
  result.isStructured = result.product || result.position || result.year || result.vehicleTerms.length > 0;
  
  console.log('🎯 [Parser] Resultado:', result);
  return result;
}

function buildSearchPipeline(parsedQuery, limit, offset) {
  let matchConditions = { tiene_precio_valido: true };
  
  if (parsedQuery.isStructured) {
    const andConditions = [];

    if (parsedQuery.product) {
      const validCategories = getValidCategoriesForProduct(parsedQuery.product);
      if (validCategories.length > 0) {
        andConditions.push({ categoria: { $in: validCategories } });
      }
    }
    
    if (parsedQuery.position) {
      const mappedPosition = mapPositionForSearch(parsedQuery.position);
      andConditions.push({ "detalles_tecnicos.Posición de la pieza": { $regex: mappedPosition, $options: 'i' } });
    }
    
    const elemMatchConditions = { $and: [] };
    if (parsedQuery.vehicleTerms && parsedQuery.vehicleTerms.length > 0) {
      const vehicleConditions = parsedQuery.vehicleTerms.map(term => ({
        $or: [{ "marca": { $regex: term, $options: 'i' } }, { "modelo": { $regex: term, $options: 'i' } }]
      }));
      elemMatchConditions.$and.push(...vehicleConditions);
    }

    if (elemMatchConditions.$and.length > 0) {
      andConditions.push({ aplicaciones: { $elemMatch: elemMatchConditions } });
    }
    
    if(andConditions.length > 0) {
      matchConditions = { ...matchConditions, $and: andConditions };
    }
  } else {
    const freeText = parsedQuery.freeText || "";
    const keywords = normalizeText(freeText).split(' ').filter(k => k.length > 0);
    if (keywords.length > 0) {
      matchConditions.$and = keywords.map(word => ({
        $or: [ { codigo: { $regex: word, $options: 'i' } }, { nombre: { $regex: word, $options: 'i' } } ]
      }));
    }
  }

  const pipeline = [ 
    { $match: matchConditions }, 
    { $sort: { codigo: 1 } },
    { $skip: offset },
    { $limit: limit },
    { $project: { _id: 0 } }
  ];

  return pipeline;
}

// =================================================================
// ===== RUTAS DE LA API ULTRA OPTIMIZADAS =======================
// =================================================================

// 🚀 1. RUTA DE PRODUCTOS ULTRA OPTIMIZADA
router.get('/productos', async (req, res) => {
  console.time('⚡ /productos Total');
  
  try {
    const { categoria, marca, modelo, version, posicion, pagina = 1, limite = 15, ordenar = 'codigo' } = req.query;
    
    // Crear clave de cache
    const cacheKey = `productos:${categoria || 'all'}:${marca || 'all'}:${modelo || 'all'}:${version || 'all'}:${posicion || 'all'}:${pagina}:${limite}:${ordenar}`;
    
    // Verificar cache
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /productos Total');
      return res.json(cached);
    }
    
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Preparar filtros
    const filters = {
      categoria: categoria && categoria !== 'todos' ? categoria : null,
      marca,
      modelo,
      version,
      posicion
    };
    
    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const limiteInt = parseInt(limite);
    
    console.time('⚡ MongoDB Query');
    
    // Ejecutar consultas en paralelo para máximo rendimiento
    const [productosResult, countResult] = await Promise.all([
      // Consulta de productos
      collection.aggregate(buildOptimizedProductsPipeline(filters, limiteInt, skip)).toArray(),
      
      // Consulta de conteo (en paralelo)
      collection.aggregate(buildCountPipeline(filters)).toArray()
    ]);
    
    console.timeEnd('⚡ MongoDB Query');
    
    const productos = productosResult;
    const totalProductos = countResult[0]?.total || 0;
    const totalPaginas = Math.ceil(totalProductos / limiteInt);
    const hasNextPage = parseInt(pagina) < totalPaginas;
    const hasPrevPage = parseInt(pagina) > 1;
    
    const resultado = {
      success: true,
      data: productos,
      pagination: {
        currentPage: parseInt(pagina),
        totalPages: totalPaginas,
        totalProducts: totalProductos,
        productsPerPage: limiteInt,
        hasNextPage,
        hasPrevPage
      },
      filters: { categoria, marca, modelo, version, posicion },
      cached: false,
      queryTime: Date.now()
    };
    
    // Guardar en cache (TTL más largo para consultas de productos)
    CACHE_SYSTEM.set(cacheKey, resultado, 15 * 60 * 1000); // 15 minutos
    
    console.timeEnd('⚡ /productos Total');
    console.log(`✅ [PRODUCTOS] ${productos.length} productos retornados (${totalProductos} total)`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /productos Total');
    console.error('❌ [PRODUCTOS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener productos', 
      details: error.message,
      timestamp: Date.now()
    });
  }
});

// 🚀 2. RUTA DE METADATOS OPTIMIZADA CON CACHE AGRESIVO
router.get('/metadatos-busqueda', async (req, res) => {
  console.time('⚡ /metadatos-busqueda');
  
  try {
    const cacheKey = 'metadatos_busqueda_optimizado';
    
    // Cache muy agresivo para metadatos (30 minutos)
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /metadatos-busqueda');
      return res.json({ ...cached, cached: true });
    }
    
    console.log('🧠 [METADATOS] Generando índice de búsqueda optimizado...');
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    console.time('⚡ MongoDB Metadatos');
    
    // Proyección ultra mínima para máxima velocidad
    const metadatos = await collection.find(
      { tiene_precio_valido: true },
      {
        projection: {
          codigo: 1,
          nombre: 1,
          categoria: 1,
          marca: 1,
          "aplicaciones.marca": 1,
          "aplicaciones.modelo": 1,
          _id: 0
        }
      }
    ).toArray();
    
    console.timeEnd('⚡ MongoDB Metadatos');
    console.time('⚡ Procesamiento Index');
    
    // Procesar con Sets para evitar duplicados de forma eficiente
    const searchIndex = {
      codes: new Set(),
      brands: new Set(),
      models: new Set(),
      categories: new Set(),
      vehicles: new Set()
    };
    
    // Procesamiento optimizado en un solo loop
    metadatos.forEach(product => {
      // Códigos y categorías
      searchIndex.codes.add(product.codigo);
      searchIndex.categories.add(product.categoria);
      
      // Marca del producto
      if (product.marca) {
        searchIndex.brands.add(product.marca);
      }
      
      // Aplicaciones
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
    
    // Convertir Sets a Arrays una sola vez
    const finalIndex = {
      codes: Array.from(searchIndex.codes),
      brands: Array.from(searchIndex.brands).sort(),
      models: Array.from(searchIndex.models).sort(),
      categories: Array.from(searchIndex.categories).sort(),
      vehicles: Array.from(searchIndex.vehicles).sort()
    };
    
    console.timeEnd('⚡ Procesamiento Index');
    
    const resultado = {
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
      timestamp: new Date().toISOString(),
      cached: false
    };
    
    // Cache agresivo para metadatos
    CACHE_SYSTEM.set(cacheKey, resultado, 30 * 60 * 1000); // 30 minutos
    
    console.timeEnd('⚡ /metadatos-busqueda');
    console.log(`✅ [METADATOS] Índice generado: ${metadatos.length} productos, ${finalIndex.brands.length} marcas`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /metadatos-busqueda');
    console.error('❌ [METADATOS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener metadatos de búsqueda', 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 3. RUTA DE BÚSQUEDA ULTRA OPTIMIZADA
router.get('/busqueda', async (req, res) => {
  console.time('⚡ /busqueda Total');
  
  try {
    const { q, limit = 20, offset = 0 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        error: 'Consulta requerida (mínimo 2 caracteres)' 
      });
    }
    
    const queryTrimmed = q.trim();
    const cacheKey = `busqueda:${queryTrimmed}:${limit}:${offset}`;
    
    // Verificar cache
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /busqueda Total');
      return res.json({ ...cached, cached: true });
    }
    
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    console.time('⚡ Parse Query');
    const parsedQuery = parseNaturalQuery(queryTrimmed);
    console.timeEnd('⚡ Parse Query');
    
    console.time('⚡ MongoDB Búsqueda');
    
    // Pipeline optimizado para búsqueda
    const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit) * 3, parseInt(offset));
    let results = await collection.aggregate(pipeline).toArray();
    
    console.timeEnd('⚡ MongoDB Búsqueda');
    
    // Filtrado por año en JavaScript si es necesario
    if (parsedQuery.year && results.length > 0) {
      console.time('⚡ Filtro Año');
      const targetYear = parseInt(parsedQuery.year);
      
      results = results.filter(product => {
        if (!product.aplicaciones || product.aplicaciones.length === 0) {
          return false;
        }
        return product.aplicaciones.some(app => checkYearInRange(app.version, targetYear));
      });
      
      console.timeEnd('⚡ Filtro Año');
      console.log(`[FILTRO] ${results.length} productos después del filtro de año ${parsedQuery.year}`);
    }
    
    // Aplicar límite final
    const finalResults = results.slice(0, parseInt(limit));
    
    const resultado = {
      success: true,
      query: queryTrimmed,
      parsedQuery: parsedQuery,
      results: finalResults,
      totalResults: finalResults.length,
      hasMore: results.length > parseInt(limit),
      cached: false,
      timestamp: new Date().toISOString()
    };
    
    // Cache de búsquedas (5 minutos)
    CACHE_SYSTEM.set(cacheKey, resultado, 5 * 60 * 1000);
    
    console.timeEnd('⚡ /busqueda Total');
    console.log(`✅ [BÚSQUEDA] ${finalResults.length} resultados para: "${queryTrimmed}"`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /busqueda Total');
    console.error('❌ [BÚSQUEDA] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error en búsqueda', 
      details: error.message,
      query: req.query.q
    });
  }
});

// 🚀 4. RUTA DE FILTROS ULTRA OPTIMIZADA
router.get('/filtros/:tipo', async (req, res) => {
  console.time('⚡ /filtros');
  
  try {
    const { tipo } = req.params;
    const { categoria, marca, modelo } = req.query;
    
    // Validar tipo
    const tiposValidos = ['marcas', 'modelos', 'versiones', 'posiciones'];
    if (!tiposValidos.includes(tipo)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tipo de filtro inválido',
        tiposValidos
      });
    }
    
    // Cache por tipo y parámetros
    const cacheKey = `filtros:${tipo}:${categoria || 'all'}:${marca || 'all'}:${modelo || 'all'}`;
    
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /filtros');
      return res.json({ ...cached, cached: true });
    }
    
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    // Filtros base optimizados
    const filtrosBase = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      filtrosBase.categoria = CATEGORIAS[categoria] ? { $in: CATEGORIAS[categoria] } : categoria;
    }
    
    let pipeline;
    console.time('⚡ MongoDB Filtros');
    
    switch (tipo) {
      case 'marcas':
        pipeline = [
          { $match: filtrosBase },
          { $unwind: "$aplicaciones" },
          { $group: { _id: "$aplicaciones.marca" } },
          { $match: { _id: { $ne: null } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, marca: "$_id" } }
        ];
        break;
        
      case 'modelos':
        if (!marca) {
          return res.status(400).json({ success: false, error: 'Marca requerida para obtener modelos' });
        }
        pipeline = [
          { $match: { ...filtrosBase, "aplicaciones.marca": marca } },
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca } },
          { $group: { _id: "$aplicaciones.modelo" } },
          { $match: { _id: { $ne: null } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, modelo: "$_id" } }
        ];
        break;
        
      case 'versiones':
        if (!marca || !modelo) {
          return res.status(400).json({ success: false, error: 'Marca y modelo requeridos para obtener versiones' });
        }
        pipeline = [
          { $match: { ...filtrosBase, "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } },
          { $unwind: "$aplicaciones" },
          { $match: { "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } },
          { $group: { _id: "$aplicaciones.version" } },
          { $match: { _id: { $ne: null } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, version: "$_id" } }
        ];
        break;
        
      case 'posiciones':
        if (marca) filtrosBase["aplicaciones.marca"] = marca;
        if (modelo) filtrosBase["aplicaciones.modelo"] = modelo;
        
        pipeline = [
          { $match: filtrosBase },
          { $group: { _id: "$detalles_tecnicos.Posición de la pieza" } },
          { $match: { _id: { $ne: null, $exists: true } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, posicion: "$_id" } }
        ];
        break;
    }
    
    const resultado_db = await collection.aggregate(pipeline).toArray();
    console.timeEnd('⚡ MongoDB Filtros');
    
    const resultado = {
      success: true,
      tipo: tipo,
      data: resultado_db,
      count: resultado_db.length,
      filters: { categoria, marca, modelo },
      cached: false,
      timestamp: new Date().toISOString()
    };
    
    // Cache de filtros (10 minutos)
    CACHE_SYSTEM.set(cacheKey, resultado, 10 * 60 * 1000);
    
    console.timeEnd('⚡ /filtros');
    console.log(`✅ [FILTROS] ${tipo}: ${resultado_db.length} elementos`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /filtros');
    console.error('❌ [FILTROS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener filtros', 
      details: error.message,
      tipo: req.params.tipo
    });
  }
});

// 🚀 5. RUTA DE PRODUCTO INDIVIDUAL OPTIMIZADA
router.get('/producto/:codigo', async (req, res) => {
  console.time('⚡ /producto');
  
  try {
    const { codigo } = req.params;
    
    if (!codigo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Código de producto requerido' 
      });
    }
    
    const cacheKey = `producto:${codigo}`;
    
    // Verificar cache
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /producto');
      return res.json({ ...cached, cached: true });
    }
    
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    console.time('⚡ MongoDB Producto');
    
    // Búsqueda optimizada por código (usa índice)
    const producto = await collection.findOne(
      { codigo: codigo },
      { projection: { _id: 0 } }
    );
    
    console.timeEnd('⚡ MongoDB Producto');
    
    if (!producto) {
      return res.status(404).json({ 
        success: false, 
        error: 'Producto no encontrado',
        codigo: codigo
      });
    }
    
    const resultado = {
      success: true,
      data: producto,
      cached: false,
      timestamp: new Date().toISOString()
    };
    
    // Cache de productos individuales (20 minutos)
    CACHE_SYSTEM.set(cacheKey, resultado, 20 * 60 * 1000);
    
    console.timeEnd('⚡ /producto');
    console.log(`✅ [PRODUCTO] ${codigo} encontrado: ${producto.nombre}`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /producto');
    console.error('❌ [PRODUCTO] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener producto', 
      details: error.message,
      codigo: req.params.codigo
    });
  }
});

// 🚀 6. RUTA DE SUGERENCIAS OPTIMIZADA
router.get('/sugerencias', async (req, res) => {
  console.time('⚡ /sugerencias');
  
  try {
    const { q, limit = 8 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.json({ 
        success: true, 
        suggestions: [],
        query: q
      });
    }
    
    const queryTrimmed = q.trim();
    const cacheKey = `sugerencias:${queryTrimmed}:${limit}`;
    
    // Cache de sugerencias
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /sugerencias');
      return res.json({ ...cached, cached: true });
    }
    
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    const suggestions = new Set();
    const normalizedQuery = normalizeText(queryTrimmed);
    
    console.time('⚡ MongoDB Sugerencias');
    
    // Búsquedas en paralelo para mejor rendimiento
    const [codigoMatches, vehicleMatches] = await Promise.all([
      // Códigos que empiecen con la consulta
      collection.find(
        { 
          codigo: { $regex: `^${normalizedQuery}`, $options: 'i' },
          tiene_precio_valido: true
        },
        { projection: { codigo: 1, _id: 0 }, limit: 3 }
      ).toArray(),
      
      // Marcas y modelos que empiecen con la consulta
      collection.aggregate([
        { $match: { tiene_precio_valido: true } },
        { $unwind: "$aplicaciones" },
        { 
          $match: { 
            $or: [
              { "aplicaciones.marca": { $regex: `^${normalizedQuery}`, $options: 'i' } },
              { "aplicaciones.modelo": { $regex: `^${normalizedQuery}`, $options: 'i' } }
            ]
          }
        },
        { 
          $group: { 
            _id: null, 
            marcas: { $addToSet: "$aplicaciones.marca" }, 
            modelos: { $addToSet: "$aplicaciones.modelo" }
          }
        },
        { $limit: 1 }
      ]).toArray()
    ]);
    
    console.timeEnd('⚡ MongoDB Sugerencias');
    
    // Procesar resultados
    codigoMatches.forEach(p => suggestions.add(p.codigo));
    
    if (vehicleMatches.length > 0) {
      const { marcas, modelos } = vehicleMatches[0];
      
      // Filtrar y agregar marcas relevantes
      marcas
        .filter(marca => marca && normalizeText(marca).startsWith(normalizedQuery))
        .slice(0, 2)
        .forEach(marca => suggestions.add(marca));
      
      // Filtrar y agregar modelos relevantes
      modelos
        .filter(modelo => modelo && normalizeText(modelo).startsWith(normalizedQuery))
        .slice(0, 2)
        .forEach(modelo => suggestions.add(modelo));
    }
    
    const finalSuggestions = Array.from(suggestions).slice(0, parseInt(limit));
    
    const resultado = {
      success: true,
      query: queryTrimmed,
      suggestions: finalSuggestions,
      count: finalSuggestions.length,
      cached: false,
      timestamp: new Date().toISOString()
    };
    
    // Cache de sugerencias (5 minutos)
    CACHE_SYSTEM.set(cacheKey, resultado, 5 * 60 * 1000);
    
    console.timeEnd('⚡ /sugerencias');
    console.log(`✅ [SUGERENCIAS] ${finalSuggestions.length} sugerencias para: "${queryTrimmed}"`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /sugerencias');
    console.error('❌ [SUGERENCIAS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener sugerencias',
      details: error.message,
      query: req.query.q
    });
  }
});

// 🚀 7. RUTA DE METADATOS BÁSICOS (LEGACY COMPATIBILITY)
router.get('/metadatos', async (req, res) => {
  console.time('⚡ /metadatos');
  
  try {
    const cacheKey = 'metadatos_basicos';
    
    const cached = CACHE_SYSTEM.get(cacheKey);
    if (cached) {
      console.timeEnd('⚡ /metadatos');
      return res.json({ ...cached, cached: true });
    }
    
    console.log('📋 [METADATOS] Cargando metadatos básicos...');
    const client = await connectToMongoDB();
    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
    
    console.time('⚡ MongoDB Metadatos Básicos');
    
    const metadatos = await collection.find(
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
        }
      }
    ).toArray();
    
    console.timeEnd('⚡ MongoDB Metadatos Básicos');
    
    const resultado = {
      success: true,
      count: metadatos.length,
      data: metadatos,
      cached: false,
      timestamp: new Date().toISOString()
    };
    
    // Cache de 15 minutos
    CACHE_SYSTEM.set(cacheKey, resultado, 15 * 60 * 1000);
    
    console.timeEnd('⚡ /metadatos');
    console.log(`✅ [METADATOS] ${metadatos.length} metadatos básicos cargados`);
    
    res.json(resultado);
    
  } catch (error) {
    console.timeEnd('⚡ /metadatos');
    console.error('❌ [METADATOS] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error al obtener metadatos',
      details: error.message
    });
  }
});

// 🚀 8. RUTA DE PING CON ESTADÍSTICAS
router.get('/ping', async (req, res) => {
  try {
    const startTime = Date.now();
    
    const client = await connectToMongoDB();
    await client.db(DB_NAME).command({ ping: 1 });
    
    const responseTime = Date.now() - startTime;
    const cacheStats = CACHE_SYSTEM.getStats();
    
    res.json({
      success: true,
      message: 'Pong! Sistema optimizado funcionando',
      responseTime: `${responseTime}ms`,
      database: {
        name: DB_NAME,
        collection: COLLECTION_NAME,
        connected: true
      },
      cache: cacheStats,
      performance: {
        connectionAttempts,
        lastConnectionError: lastConnectionError?.message || null,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error al conectar con MongoDB',
      error: error.message,
      connectionAttempts,
      timestamp: new Date().toISOString()
    });
  }
});

// 🚀 9. RUTA DE ADMINISTRACIÓN DE CACHE
router.get('/admin/cache', (req, res) => {
  const { action } = req.query;
  
  try {
    if (action === 'clear') {
      CACHE_SYSTEM.clear();
      return res.json({
        success: true,
        message: 'Cache limpiado exitosamente',
        timestamp: new Date().toISOString()
      });
    }
    
    if (action === 'stats') {
      const stats = CACHE_SYSTEM.getStats();
      const entries = Array.from(CACHE_SYSTEM.cache.entries()).map(([key, entry]) => ({
        key,
        size: JSON.stringify(entry.data).length,
        hits: entry.hits,
        age: Date.now() - entry.timestamp,
        ttl: entry.ttl
      }));
      
      return res.json({
        success: true,
        stats,
        entries: entries.slice(0, 20), // Solo las primeras 20
        totalEntries: entries.length,
        timestamp: new Date().toISOString()
      });
    }
    
    // Mostrar estadísticas por defecto
    res.json({
      success: true,
      cache: CACHE_SYSTEM.getStats(),
      actions: ['clear', 'stats'],
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error en administración de cache',
      details: error.message
    });
  }
});

// 🚀 10. MIDDLEWARE DE COMPRESIÓN RESPONSE
router.use((req, res, next) => {
  // Añadir headers de optimización
  res.set({
    'Cache-Control': 'public, max-age=300', // 5 minutos
    'X-Powered-By': 'MongoDB-Express-Optimized',
    'X-Response-Time': Date.now()
  });
  
  next();
});

// =================================================================
// ===== SISTEMA DE MONITOREO Y ESTADÍSTICAS =====================
// =================================================================

// Métricas globales
const METRICS = {
  requests: 0,
  errors: 0,
  totalResponseTime: 0,
  slowQueries: 0,
  cacheHitRate: 0,
  startTime: Date.now(),
  
  increment(metric, value = 1) {
    this[metric] = (this[metric] || 0) + value;
  },
  
  getStats() {
    const uptime = Date.now() - this.startTime;
    const avgResponseTime = this.requests > 0 ? this.totalResponseTime / this.requests : 0;
    
    return {
      uptime: `${Math.floor(uptime / 1000)}s`,
      requests: this.requests,
      errors: this.errors,
      errorRate: `${this.requests > 0 ? ((this.errors / this.requests) * 100).toFixed(2) : 0}%`,
      avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
      slowQueries: this.slowQueries,
      cache: CACHE_SYSTEM.getStats()
    };
  }
};

// Middleware de métricas
router.use((req, res, next) => {
  const start = Date.now();
  
  METRICS.increment('requests');
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    METRICS.increment('totalResponseTime', duration);
    
    if (duration > 1000) { // Consultas lentas > 1s
      METRICS.increment('slowQueries');
      console.warn(`🐌 [SLOW] ${req.method} ${req.path} - ${duration}ms`);
    }
    
    if (res.statusCode >= 400) {
      METRICS.increment('errors');
    }
  });
  
  next();
});

// Ruta de estadísticas del sistema
router.get('/admin/stats', (req, res) => {
  res.json({
    success: true,
    metrics: METRICS.getStats(),
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    },
    database: {
      connectionAttempts,
      lastError: lastConnectionError?.message || null
    },
    timestamp: new Date().toISOString()
  });
});

// =================================================================
// ===== EXPORTACIÓN Y CONFIGURACIÓN FINAL =======================
// =================================================================

// Log de inicialización
console.log('🚀 [INIT] Backend ultra optimizado inicializado');
console.log('⚡ [CACHE] Sistema de cache en memoria activado');
console.log('📊 [METRICS] Sistema de métricas habilitado');
console.log('🔗 [MONGODB] Configuración de alta performance aplicada');

// Manejo de shutdown graceful
process.on('SIGINT', async () => {
  console.log('🛑 [SHUTDOWN] Cerrando conexiones...');
  
  if (cachedClient) {
    await cachedClient.close();
    console.log('✅ [SHUTDOWN] MongoDB desconectado');
  }
  
  CACHE_SYSTEM.clear();
  console.log('✅ [SHUTDOWN] Cache limpiado');
  
  console.log('👋 [SHUTDOWN] Proceso terminado limpiamente');
  process.exit(0);
});

// Exportar router
module.exports = router;