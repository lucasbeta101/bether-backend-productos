const express = require('express');
const router = express.Router();
const { MongoClient, ServerApiVersion } = require('mongodb');

// ===== CONFIGURACIÓN MONGODB =====
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// Cliente MongoDB reutilizable
let cachedClient = null;

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

// ===== MIDDLEWARE DE LOGGING =====
router.use((req, res, next) => {
  console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const CATEGORIAS = {
  "Amortiguadores": [
    "Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP",
    "Amort LIP", "Amort PRO TUNNING"
  ],
  "Barras": ["Barras HD SADAR"],
  "Bieletas": ["Bieletas CORVEN", "Bieletas SADAR"],
  "Brazos Suspension": ["Brazos Susp CORVEN","Brazos Susp SADAR",],
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


// ===== FUNCIONES AUXILIARES SIMPLES =====
function normalizeText(text) {
  if (!text) return '';
  return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\/]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

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
      'homocinetica': ['Homocinéticas CORVEN', 'Homocinéticas SADAR']
  };
  const normalizedProduct = normalizeText(product).replace(/s$/, '');
  return categoryMap[normalizedProduct] || [];
}

function mapPositionForSearch(position) {
  const positionMap = {
      'delantero': 'Delantero', 'del': 'Delantero',
      'trasero': 'Trasero', 'pos': 'Trasero',
      'izquierdo': 'Izquierdo', 'izq': 'Izquierdo',
      'derecho': 'Derecho', 'der': 'Derecho'
  };
  const normalizedPosition = normalizeText(position);
  return positionMap[normalizedPosition] || position;
}

// ===== PARSER SIMPLE (UNA SOLA FUNCIÓN) =====
function parseNaturalQuery(query) {
  console.log('🧐 [PARSER] Analizando:', query);
  
  const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'auto'];
  const productKeywords = ['amortiguador', 'pastilla', 'freno', 'disco', 'cazoleta', 'bieleta', 'rotula', 'embrague', 'brazo', 'extremo', 'axial', 'homocinetica'];
  const positionKeywords = ['delantero', 'trasero', 'izquierdo', 'derecho', 'del', 'pos', 'izq', 'der'];
  
  // 🆕 DETECCIÓN DE CÓDIGO EXACTO
  const trimmedQuery = query.trim();
  const isLikelyCode = /^[A-Za-z0-9\-_]+$/.test(trimmedQuery) && trimmedQuery.length >= 3;
  
  const normalized = normalizeText(query);
  const words = normalized.split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 1);
  
  const result = { 
    product: null, 
    position: null, 
    year: null, 
    vehicleTerms: [], 
    isStructured: false,
    // 🆕 NUEVAS PROPIEDADES PARA CÓDIGO
    isExactCode: isLikelyCode,
    exactCode: isLikelyCode ? trimmedQuery : null,
    freeText: query 
  };

  const remainingWords = [];
  for (const word of words) {
      if (!result.product && productKeywords.includes(word.replace(/s$/, ''))) {
          result.product = word.replace(/s$/, '');
      } else if (!result.position && positionKeywords.includes(word)) {
          result.position = word;
      } else if (!result.year && /^\d{4}$/.test(word)) {
          result.year = word;
      } else if (!result.year && /^\d{2}$/.test(word)) {
          const yearNum = parseInt(word, 10);
          result.year = yearNum > 30 ? (1900 + yearNum).toString() : (2000 + yearNum).toString();
      } else {
          remainingWords.push(word);
      }
  }

  result.vehicleTerms = remainingWords;
  if (result.product || result.position || result.year || result.vehicleTerms.length > 0) {
      result.isStructured = true;
  }
  
  console.log('🧐 [PARSER] Resultado:', result);
  return result;
}

// ===== PIPELINE DE BÚSQUEDA PRINCIPAL =====
function buildSearchPipeline(parsedQuery, limit, offset) {
  console.log('🔧 [PIPELINE] Construyendo búsqueda...');
  
  let matchConditions = { tiene_precio_valido: true };
  
  // 🆕 PRIORIDAD PARA CÓDIGOS EXACTOS
  if (parsedQuery.isExactCode) {
    console.log('🔍 [PIPELINE] Búsqueda por código exacto:', parsedQuery.exactCode);
    
    matchConditions = {
      tiene_precio_valido: true,
      $or: [
        { codigo: parsedQuery.exactCode },
        { codigo: { $regex: parsedQuery.exactCode, $options: 'i' } },
        { nombre: { $regex: parsedQuery.exactCode, $options: 'i' } }
      ]
    };
    
    const pipeline = [
      { $match: matchConditions },
      {
        $addFields: {
          exactMatch: {
            $cond: {
              if: { $eq: ["$codigo", parsedQuery.exactCode] },
              then: 1,
              else: 0
            }
          }
        }
      },
      { $sort: { exactMatch: -1, codigo: 1 } },
      { $project: { exactMatch: 0, _id: 0 } }
    ];

    if (offset > 0) pipeline.push({ $skip: offset });
    pipeline.push({ $limit: limit });
    return pipeline;
  }
  
  // RESTO DE LA LÓGICA ORIGINAL SIN CAMBIOS
  if (parsedQuery.isStructured) {
    console.log('🎯 [PIPELINE] Búsqueda estructurada');
    
    // Producto/Categoría
    if (parsedQuery.product) {
      const validCategories = getValidCategoriesForProduct(parsedQuery.product);
      if (validCategories.length > 0) {
        matchConditions.categoria = { $in: validCategories };
      }
    }
    
    // Posición
    if (parsedQuery.position) {
      const mappedPosition = mapPositionForSearch(parsedQuery.position);
      matchConditions["detalles_tecnicos.Posición de la pieza"] = { $regex: mappedPosition, $options: 'i' };
    }
    
    // Aplicaciones de vehículo
    const elemMatchAndConditions = [];
    
    if (parsedQuery.vehicleTerms && parsedQuery.vehicleTerms.length > 0) {
      const vehicleConditions = parsedQuery.vehicleTerms.map(term => ({
        $or: [
          { "marca": { $regex: term, $options: 'i' } }, 
          { "modelo": { $regex: term, $options: 'i' } }
        ]
      }));
      elemMatchAndConditions.push(...vehicleConditions);
    }
    
    // Año
    if (parsedQuery.year) {
      const yearRegex = `(${parsedQuery.year}|${parsedQuery.year.slice(-2)})`;
      elemMatchAndConditions.push({ 
        'version': { $regex: yearRegex, $options: 'i' } 
      });
    }
    
    if (elemMatchAndConditions.length > 0) {
      matchConditions.aplicaciones = { 
        $elemMatch: { $and: elemMatchAndConditions } 
      };
    }
    
  } else {
    console.log('🔍 [PIPELINE] Búsqueda libre');
    
    const freeText = parsedQuery.freeText || "";
    const keywords = normalizeText(freeText).split(' ').filter(k => k.length > 0);
    
    if (keywords.length > 0) {
      matchConditions.$and = keywords.map(word => ({
        $or: [
          { codigo: { $regex: word, $options: 'i' } },
          { nombre: { $regex: word, $options: 'i' } },
          { "aplicaciones.marca": { $regex: word, $options: 'i' } },
          { "aplicaciones.modelo": { $regex: word, $options: 'i' } }
        ]
      }));
    }
  }

  console.log('🚨 [PIPELINE] Consulta final:', JSON.stringify(matchConditions, null, 2));
  
  const pipeline = [
    { $match: matchConditions },
    { $sort: { codigo: 1 } }
  ];

  if (offset > 0) pipeline.push({ $skip: offset });
  pipeline.push({ $limit: limit });
  pipeline.push({ $project: { _id: 0 } });

  return pipeline;
}

// ===== ENDPOINTS PRINCIPALES =====

// 🏥 PING - Verificar conexión
router.get('/ping', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    await db.command({ ping: 1 });
    const count = await db.collection(COLLECTION_NAME).countDocuments();
    
    res.json({
      success: true,
      message: 'MongoDB conectado exitosamente',
      totalProducts: count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/metadatos', async (req, res) => {
  try {
    const { 
      pagina = null,        // 🔄 CAMBIO: null por defecto
      limite = null,        // 🔄 CAMBIO: null por defecto 
      categoria = null,
      solo_conteo = false
    } = req.query;

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Si solo necesita el conteo (para inicialización rápida)
    if (solo_conteo === 'true') {
      const totalCount = await collection.countDocuments({ tiene_precio_valido: true });
      return res.json({
        success: true,
        count: totalCount,
        data: [],
        pagination: {
          totalProductos: totalCount,
          totalPaginas: Math.ceil(totalCount / 50)
        }
      });
    }

    // Filtros base
    let matchConditions = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // 🚀 DETERMINAR SI ES PAGINADO O COMPLETO
    const esPaginado = pagina !== null && limite !== null;
    
    console.log(`📦 [METADATOS] Solicitud ${esPaginado ? 'PAGINADA' : 'COMPLETA'}`);
    
    if (esPaginado) {
      // 📄 MODO PAGINADO - Para carga inicial de 9 productos
      const pipeline = [
        { $match: matchConditions },
        { $sort: { codigo: 1 } },
        {
          $facet: {
            productos: [
              { $skip: (parseInt(pagina) - 1) * parseInt(limite) },
              { $limit: parseInt(limite) },
              { 
                $project: { 
                  _id: 0,
                  codigo: 1,
                  nombre: 1,
                  categoria: 1,
                  marca: 1,
                  precio_lista_con_iva: 1,
                  precio_numerico: 1,
                  tiene_precio_valido: 1,
                  imagen: { $ifNull: ["$imagen", "/img/placeholder-producto.webp"] },
                  aplicaciones: { $slice: ["$aplicaciones", 2] },
                  "detalles_tecnicos.Posición de la pieza": "$detalles_tecnicos.Posición de la pieza"
                } 
              }
            ],
            totalCount: [
              { $count: "count" }
            ]
          }
        }
      ];

      const startTime = Date.now();
      const results = await collection.aggregate(pipeline).toArray();
      const processingTime = Date.now() - startTime;

      const productos = results[0].productos || [];
      const totalProductos = results[0].totalCount[0]?.count || 0;

      console.log(`✅ [METADATOS-PAGINADO] ${productos.length} productos en página ${pagina} (${processingTime}ms)`);

      res.json({
        success: true,
        count: productos.length,
        data: productos,
        pagination: {
          paginaActual: parseInt(pagina),
          limite: parseInt(limite),
          totalProductos: totalProductos,
          totalPaginas: Math.ceil(totalProductos / parseInt(limite)),
          tieneMas: productos.length === parseInt(limite)
        },
        processingTime: processingTime,
        timestamp: new Date().toISOString()
      });

    } else {
      // 🚀 MODO COMPLETO - Todos los productos de una vez
      console.log(`🔥 [METADATOS-COMPLETO] Cargando TODOS los productos...`);
      
      const pipeline = [
        { $match: matchConditions },
        { $sort: { codigo: 1 } },
        { 
          $project: { 
            _id: 0,
            codigo: 1,
            nombre: 1,
            categoria: 1,
            marca: 1,
            precio_lista_con_iva: 1,
            precio_numerico: 1,
            tiene_precio_valido: 1,
            imagen: 1,
            aplicaciones: 1, // 🔄 TODOS los datos de aplicaciones
            detalles_tecnicos: 1, // 🔄 TODOS los detalles técnicos
            equivalencias: 1
          } 
        }
      ];

      const startTime = Date.now();
      const productos = await collection.aggregate(pipeline).toArray();
      const processingTime = Date.now() - startTime;

      console.log(`🎉 [METADATOS-COMPLETO] ${productos.length} productos cargados en ${processingTime}ms`);

      // 🎯 RESPUESTA COMPATIBLE PERO SIN PAGINACIÓN
      res.json({
        success: true,
        count: productos.length,
        data: productos,
        // 📊 Info para compatibilidad
        pagination: {
          totalProductos: productos.length,
          cargaCompleta: true
        },
        processingTime: processingTime,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ [METADATOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/filtros-rapidos', async (req, res) => {
  try {
    const { categoria = null } = req.query;
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    let matchConditions = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // Pipeline súper optimizado para filtros
    const pipeline = [
      { $match: matchConditions },
      { $unwind: "$aplicaciones" },
      {
        $group: {
          _id: null,
          marcas: { $addToSet: "$aplicaciones.marca" },
          modelos: { $addToSet: "$aplicaciones.modelo" }
        }
      },
      {
        $project: {
          _id: 0,
          marcas: { $sortArray: { input: "$marcas", sortBy: 1 } },
          modelos: { $sortArray: { input: "$modelos", sortBy: 1 } }
        }
      }
    ];

    const resultado = await collection.aggregate(pipeline).toArray();
    const filtros = resultado[0] || { marcas: [], modelos: [] };

    res.json({
      success: true,
      data: filtros,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [FILTROS-RAPIDOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 ENDPOINT PARA CARGAR DETALLES COMPLETOS DE PRODUCTOS (lazy loading)
router.get('/producto-completo/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Cargar producto con TODOS los detalles
    const producto = await collection.findOne(
      { codigo: codigo },
      { 
        projection: { _id: 0 } // Todos los campos
      }
    );

    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: producto
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔍 BÚSQUEDA PRINCIPAL
router.get('/busqueda', async (req, res) => {
  try {
    const { q, limit = 20, offset = 0 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query requerida (mínimo 2 caracteres)'
      });
    }

    console.log('🔍 [BÚSQUEDA] Query:', q);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Parsear query
    const parsedQuery = parseNaturalQuery(q.trim());
    console.log('🧠 [BÚSQUEDA] Query parseada:', parsedQuery);

    // Construir pipeline
    const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit), parseInt(offset));
    
    // Ejecutar búsqueda
    const startTime = Date.now();
    const results = await collection.aggregate(pipeline).toArray();
    const processingTime = Date.now() - startTime;

    console.log(`📊 [BÚSQUEDA] ${results.length} resultados en ${processingTime}ms`);

    res.json({
      success: true,
      query: q,
      parsedQuery: parsedQuery,
      results: results,
      totalResults: results.length,
      processingTime: processingTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [BÚSQUEDA] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔍 PRODUCTO INDIVIDUAL
router.get('/producto/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const producto = await collection.findOne(
      { codigo: codigo },
      { projection: { _id: 0 } }
    );

    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    res.json({
      success: true,
      data: producto
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 💡 SUGERENCIAS
router.get('/sugerencias', async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const suggestions = new Set();
    const normalizedQuery = normalizeText(q);

    // Sugerencias de códigos
    const codigoMatches = await collection.find(
      { codigo: { $regex: normalizedQuery, $options: 'i' } },
      { projection: { codigo: 1, _id: 0 }, limit: 3 }
    ).toArray();
    
    codigoMatches.forEach(p => suggestions.add(p.codigo));

    // Sugerencias de marcas y modelos
    const vehicleMatches = await collection.aggregate([
      { $unwind: "$aplicaciones" },
      { $match: { 
        $or: [
          { "aplicaciones.marca": { $regex: normalizedQuery, $options: 'i' } },
          { "aplicaciones.modelo": { $regex: normalizedQuery, $options: 'i' } }
        ]
      }},
      { $group: { 
        _id: null, 
        marcas: { $addToSet: "$aplicaciones.marca" },
        modelos: { $addToSet: "$aplicaciones.modelo" }
      }},
      { $limit: 1 }
    ]).toArray();

    if (vehicleMatches.length > 0) {
      const { marcas, modelos } = vehicleMatches[0];
      marcas.slice(0, 2).forEach(marca => {
        if (marca.toLowerCase().includes(normalizedQuery)) {
          suggestions.add(marca);
        }
      });
      modelos.slice(0, 2).forEach(modelo => {
        if (modelo.toLowerCase().includes(normalizedQuery)) {
          suggestions.add(modelo);
        }
      });
    }

    const finalSuggestions = Array.from(suggestions).slice(0, parseInt(limit));

    res.json({
      success: true,
      suggestions: finalSuggestions,
      count: finalSuggestions.length
    });

  } catch (error) {
    res.status(501).json({
      success: false,
      error: error.message
    });
  }
});
// ===== ENDPOINTS PARA FILTROS DE BÚSQUEDA =====
// Agregar estos endpoints a tu productos.js

// 📂 CATEGORÍAS
router.get('/categorias', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Obtener todas las categorías únicas con productos válidos
    const categorias = await collection.distinct('categoria', { 
      tiene_precio_valido: true 
    });

    // Ordenar alfabéticamente
    categorias.sort();

    console.log(`📂 [CATEGORIAS] ${categorias.length} categorías encontradas`);

    res.json({
      success: true,
      data: categorias,
      count: categorias.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [CATEGORIAS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🚗 MARCAS (filtradas por categoría)
router.get('/marcas', async (req, res) => {
  try {
    const { categoria } = req.query;
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtro base
    let matchConditions = { tiene_precio_valido: true };
    
    // Filtrar por categoría si se especifica
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // Pipeline para obtener marcas únicas
    const pipeline = [
      { $match: matchConditions },
      { $unwind: "$aplicaciones" },
      { 
        $group: { 
          _id: null, 
          marcas: { $addToSet: "$aplicaciones.marca" } 
        } 
      },
      {
        $project: {
          _id: 0,
          marcas: { 
            $sortArray: { 
              input: { $filter: { input: "$marcas", cond: { $ne: ["$$this", null] } } }, 
              sortBy: 1 
            } 
          }
        }
      }
    ];

    const resultado = await collection.aggregate(pipeline).toArray();
    const marcas = resultado[0]?.marcas || [];

    console.log(`🚗 [MARCAS] ${marcas.length} marcas encontradas para categoría: ${categoria || 'todas'}`);

    res.json({
      success: true,
      data: marcas,
      count: marcas.length,
      filtros: { categoria },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [MARCAS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🚙 MODELOS (filtrados por categoría y marca)
router.get('/modelos', async (req, res) => {
  try {
    const { categoria, marca } = req.query;
    
    if (!marca) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro "marca" requerido'
      });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtro base
    let matchConditions = { tiene_precio_valido: true };
    
    // Filtrar por categoría si se especifica
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // Pipeline para obtener modelos únicos de una marca específica
    const pipeline = [
      { $match: matchConditions },
      { $unwind: "$aplicaciones" },
      { 
        $match: { 
          "aplicaciones.marca": marca 
        } 
      },
      { 
        $group: { 
          _id: null, 
          modelos: { $addToSet: "$aplicaciones.modelo" } 
        } 
      },
      {
        $project: {
          _id: 0,
          modelos: { 
            $sortArray: { 
              input: { $filter: { input: "$modelos", cond: { $ne: ["$$this", null] } } }, 
              sortBy: 1 
            } 
          }
        }
      }
    ];

    const resultado = await collection.aggregate(pipeline).toArray();
    const modelos = resultado[0]?.modelos || [];

    console.log(`🚙 [MODELOS] ${modelos.length} modelos encontrados para marca: ${marca}`);

    res.json({
      success: true,
      data: modelos,
      count: modelos.length,
      filtros: { categoria, marca },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [MODELOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ⚙️ VERSIONES (filtradas por categoría, marca y modelo)
router.get('/versiones', async (req, res) => {
  try {
    const { categoria, marca, modelo } = req.query;
    
    if (!marca || !modelo) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros "marca" y "modelo" requeridos'
      });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtro base
    let matchConditions = { tiene_precio_valido: true };
    
    // Filtrar por categoría si se especifica
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // Pipeline para obtener versiones únicas de una marca y modelo específicos
    const pipeline = [
      { $match: matchConditions },
      { $unwind: "$aplicaciones" },
      { 
        $match: { 
          "aplicaciones.marca": marca,
          "aplicaciones.modelo": modelo
        } 
      },
      { 
        $group: { 
          _id: null, 
          versiones: { $addToSet: "$aplicaciones.version" } 
        } 
      },
      {
        $project: {
          _id: 0,
          versiones: { 
            $sortArray: { 
              input: { $filter: { input: "$versiones", cond: { $ne: ["$this", null] } } }, 
              sortBy: 1 
            } 
          }
        }
      }
    ];

    const resultado = await collection.aggregate(pipeline).toArray();
    const versiones = resultado[0]?.versiones || [];

    console.log(`⚙️ [VERSIONES] ${versiones.length} versiones encontradas para ${marca} ${modelo}`);

    res.json({
      success: true,
      data: versiones,
      count: versiones.length,
      filtros: { categoria, marca, modelo },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [VERSIONES] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔍 BÚSQUEDA CON FILTROS COMBINADOS
router.get('/busqueda-filtrada', async (req, res) => {
  try {
    const { 
      categoria, 
      marca, 
      modelo, 
      version, 
      limit = 20, 
      offset = 0 
    } = req.query;

    // Validar que al menos un filtro esté presente
    if (!categoria && !marca && !modelo && !version) {
      return res.status(400).json({
        success: false,
        error: 'Al menos un filtro debe estar especificado'
      });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    console.log('🔍 [BÚSQUEDA-FILTRADA] Filtros recibidos:', { categoria, marca, modelo, version });

    // Construir condiciones de filtrado
    let matchConditions = { tiene_precio_valido: true };

    // Filtro por categoría
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // Filtros de aplicaciones (marca, modelo, versión)
    const aplicacionFilters = [];
    
    if (marca) {
      aplicacionFilters.push({ "aplicaciones.marca": marca });
    }
    
    if (modelo) {
      aplicacionFilters.push({ "aplicaciones.modelo": modelo });
    }
    
    if (version) {
      aplicacionFilters.push({ "aplicaciones.version": version });
    }

    // Si hay filtros de aplicación, usar $elemMatch
    if (aplicacionFilters.length > 0) {
      matchConditions.aplicaciones = {
        $elemMatch: {
          $and: aplicacionFilters.map(filter => {
            const key = Object.keys(filter)[0].replace('aplicaciones.', '');
            return { [key]: filter[Object.keys(filter)[0]] };
          })
        }
      };
    }

    console.log('🔧 [BÚSQUEDA-FILTRADA] Condiciones MongoDB:', JSON.stringify(matchConditions, null, 2));

    // Pipeline de búsqueda
    const pipeline = [
      { $match: matchConditions },
      { $sort: { codigo: 1 } }
    ];

    // Paginación
    if (parseInt(offset) > 0) {
      pipeline.push({ $skip: parseInt(offset) });
    }
    
    pipeline.push({ $limit: parseInt(limit) });
    pipeline.push({ $project: { _id: 0 } });

    // Ejecutar búsqueda
    const startTime = Date.now();
    const productos = await collection.aggregate(pipeline).toArray();
    const processingTime = Date.now() - startTime;

    // Contar total de resultados (sin paginación)
    const countPipeline = [
      { $match: matchConditions },
      { $count: "total" }
    ];
    
    const countResult = await collection.aggregate(countPipeline).toArray();
    const totalResultados = countResult[0]?.total || 0;

    console.log(`✅ [BÚSQUEDA-FILTRADA] ${productos.length}/${totalResultados} productos encontrados en ${processingTime}ms`);

    res.json({
      success: true,
      results: productos,
      count: productos.length,
      totalResults: totalResultados,
      filtros: { categoria, marca, modelo, version },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + productos.length) < totalResultados
      },
      processingTime: processingTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [BÚSQUEDA-FILTRADA] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 📊 ESTADÍSTICAS DE FILTROS (opcional - para mostrar contadores)
router.get('/filtros-stats', async (req, res) => {
  try {
    const { categoria } = req.query;

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtro base
    let matchConditions = { tiene_precio_valido: true };
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

    // Pipeline para estadísticas completas
    const pipeline = [
      { $match: matchConditions },
      { $unwind: "$aplicaciones" },
      {
        $group: {
          _id: null,
          totalProductos: { $sum: 1 },
          marcas: { $addToSet: "$aplicaciones.marca" },
          modelos: { $addToSet: "$aplicaciones.modelo" },
          versiones: { $addToSet: "$aplicaciones.version" },
          categorias: { $addToSet: "$categoria" }
        }
      },
      {
        $project: {
          _id: 0,
          totalProductos: 1,
          totalMarcas: { $size: "$marcas" },
          totalModelos: { $size: "$modelos" },
          totalVersiones: { $size: "$versiones" },
          totalCategorias: { $size: "$categorias" }
        }
      }
    ];

    const stats = await collection.aggregate(pipeline).toArray();
    const estadisticas = stats[0] || {
      totalProductos: 0,
      totalMarcas: 0,
      totalModelos: 0,
      totalVersiones: 0,
      totalCategorias: 0
    };

    console.log('📊 [FILTROS-STATS] Estadísticas calculadas:', estadisticas);

    res.json({
      success: true,
      data: estadisticas,
      filtros: { categoria },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [FILTROS-STATS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 ENDPOINT PARA AUTOCOMPLETAR FILTROS (búsqueda rápida)
router.get('/filtros-autocomplete', async (req, res) => {
  try {
    const { q, tipo = 'all', limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: [],
        count: 0
      });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const query = q.trim();
    const suggestions = new Set();

    // Buscar en diferentes campos según el tipo
    const searchFields = [];
    
    if (tipo === 'all' || tipo === 'marca') {
      searchFields.push('aplicaciones.marca');
    }
    if (tipo === 'all' || tipo === 'modelo') {
      searchFields.push('aplicaciones.modelo');
    }
    if (tipo === 'all' || tipo === 'categoria') {
      searchFields.push('categoria');
    }

    // Pipeline para autocompletar
    for (const field of searchFields) {
      const pipeline = [
        { $match: { tiene_precio_valido: true } },
        { $unwind: field.includes('aplicaciones') ? "$aplicaciones" : "$categoria" },
        { 
          $match: { 
            [field]: { $regex: query, $options: 'i' } 
          } 
        },
        { $group: { _id: `${field}` } },
        { $limit: parseInt(limit) }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      results.forEach(result => {
        if (result._id && result._id.toLowerCase().includes(query.toLowerCase())) {
          suggestions.add(result._id);
        }
      });
    }

    const finalSuggestions = Array.from(suggestions)
      .slice(0, parseInt(limit))
      .sort();

    res.json({
      success: true,
      suggestions: finalSuggestions,
      count: finalSuggestions.length,
      query: query,
      tipo: tipo
    });

  } catch (error) {
    console.error('❌ [FILTROS-AUTOCOMPLETE] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Al final de productos.js, reemplazar las líneas problemáticas por:

// 🚀 FUNCIÓN PARA CREAR ÍNDICES (ejecutar manualmente desde MongoDB Compass o shell)
// ESTOS COMANDOS DEBEN EJECUTARSE DIRECTAMENTE EN MONGODB, NO EN NODE.JS:
//
// db.productos.createIndex({ "tiene_precio_valido": 1, "codigo": 1 })
// db.productos.createIndex({ "categoria": 1, "codigo": 1 })
// db.productos.createIndex({ "aplicaciones.marca": 1 })
// db.productos.createIndex({ "aplicaciones.modelo": 1 })
// db.productos.createIndex({ "codigo": 1 }, { unique: true })

module.exports = router;