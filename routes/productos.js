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

// ===== CATEGORÍAS (igual que tu frontend) =====
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

// 🏥 PING - Verificar conexión MongoDB
router.get('/ping', async (req, res) => {
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

// 📋 METADATOS - Para filtros
router.get('/metadatos', async (req, res) => {
  try {
    console.log('📋 [METADATOS] Iniciando carga de metadatos...');
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // ✅ PROYECCIÓN: Solo campos necesarios para filtros
    const metadatos = await collection.find({}, {
      projection: {
        codigo: 1,
        categoria: 1,
        marca: 1,
        nombre: 1,
        aplicaciones: 1,
        "detalles_tecnicos.Posición de la pieza": 1,
        _id: 0 // Excluir _id para reducir tamaño
      }
    }).toArray();

    console.log(`✅ [METADATOS] ${metadatos.length} metadatos cargados`);

    res.json({
      success: true,
      count: metadatos.length,
      data: metadatos,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [METADATOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener metadatos'
    });
  }
});

// 📦 PRODUCTOS - Con filtros y paginación
router.get('/productos', async (req, res) => {
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

    // ✅ CONSTRUIR FILTROS DINÁMICAMENTE
    const filtros = {};

    // Filtro por categoría
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        // Es categoría principal, buscar en subcategorías
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        // Es subcategoría específica
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

    // ✅ PAGINACIÓN
    const skip = (parseInt(pagina) - 1) * parseInt(limite);
    const limiteInt = parseInt(limite);

    // ✅ ORDENAMIENTO
    const sort = {};
    sort[ordenar] = 1;

    // ✅ EJECUTAR CONSULTA CON AGREGACIÓN
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

// 🔍 PRODUCTO INDIVIDUAL - Por código
router.get('/producto/:codigo', async (req, res) => {
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

    // ✅ BUSCAR POR CÓDIGO
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

// 🚗 FILTROS VEHÍCULO - Marcas, modelos, versiones, posiciones
router.get('/filtros/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const { categoria, marca, modelo } = req.query;

    console.log('🚗 [FILTROS] Obteniendo:', tipo, 'para:', { categoria, marca, modelo });

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // ✅ CONSTRUIR FILTROS BASE
    const filtros = {};
    
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    let pipeline = [{ $match: filtros }];

    // ✅ AGREGACIÓN SEGÚN EL TIPO SOLICITADO
    switch (tipo) {
      case 'marcas':
        pipeline.push(
          { $unwind: "$aplicaciones" },
          { $group: { _id: "$aplicaciones.marca" } },
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
          { $match: { _id: { $ne: null, $exists: true } } },
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
module.exports = router;
// ===== AGREGAR ESTOS ENDPOINTS A TU productos.js =====

// 🔍 BÚSQUEDA INTELIGENTE - Endpoint principal
router.get('/busqueda', async (req, res) => {
  try {
    const { 
      q,           // Query de búsqueda
      limit = 20,  // Límite de resultados
      offset = 0   // Para paginación
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

    // ✅ PARSEAR QUERY CON PATRONES INTELIGENTES
    const parsedQuery = parseNaturalQuery(q.trim());
    console.log('🧠 [BÚSQUEDA] Query parseada:', parsedQuery);

    // ✅ CONSTRUIR PIPELINE DE AGREGACIÓN
    const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit), parseInt(offset));
    console.log('📋 [BÚSQUEDA] Pipeline:', JSON.stringify(pipeline, null, 2));

    // ✅ EJECUTAR BÚSQUEDA
    const startTime = Date.now();
    const results = await collection.aggregate(pipeline).toArray();
    const processingTime = Date.now() - startTime;

    console.log(`✅ [BÚSQUEDA] ${results.length} resultados en ${processingTime}ms`);

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
      error: error.message || 'Error en búsqueda'
    });
  }
});

// 💡 SUGERENCIAS - Para auto-completado
router.get('/sugerencias', async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    console.log('💡 [SUGERENCIAS] Query:', q);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const suggestions = new Set();
    const normalizedQuery = normalizeText(q);

    // ✅ SUGERENCIAS DE CÓDIGOS
    const codigoMatches = await collection.find(
      { codigo: { $regex: normalizedQuery, $options: 'i' } },
      { projection: { codigo: 1, _id: 0 }, limit: 3 }
    ).toArray();
    
    codigoMatches.forEach(p => suggestions.add(p.codigo));

    // ✅ SUGERENCIAS DE MARCAS Y MODELOS
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

    // ✅ SUGERENCIAS DE PRODUCTOS
    const productMatches = await collection.find(
      { nombre: { $regex: normalizedQuery, $options: 'i' } },
      { projection: { nombre: 1, _id: 0 }, limit: 2 }
    ).toArray();
    
    productMatches.forEach(p => {
      const words = p.nombre.split(' ').slice(0, 3).join(' ');
      suggestions.add(words);
    });

    const finalSuggestions = Array.from(suggestions).slice(0, parseInt(limit));

    console.log(`💡 [SUGERENCIAS] ${finalSuggestions.length} sugerencias generadas`);

    res.json({
      success: true,
      query: q,
      suggestions: finalSuggestions,
      count: finalSuggestions.length
    });

  } catch (error) {
    console.error('❌ [SUGERENCIAS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener sugerencias'
    });
  }
});

// 🧠 METADATOS PARA BÚSQUEDA - Datos livianos para el cliente
router.get('/metadatos-busqueda', async (req, res) => {
  try {
    console.log('🧠 [METADATOS-BÚSQUEDA] Cargando datos livianos...');

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // ✅ SOLO CAMPOS NECESARIOS PARA BÚSQUEDA CLIENT-SIDE
    const metadatos = await collection.find({}, {
      projection: {
        codigo: 1,
        nombre: 1,
        categoria: 1,
        marca: 1,
        "aplicaciones.marca": 1,
        "aplicaciones.modelo": 1,
        "aplicaciones.version": 1,
        _id: 0
      }
    }).toArray();

    // ✅ CREAR ÍNDICE DE BÚSQUEDA LIVIANO
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
      codes: searchIndex.codes,
      brands: Array.from(searchIndex.brands),
      models: Array.from(searchIndex.models), 
      categories: Array.from(searchIndex.categories),
      vehicles: Array.from(searchIndex.vehicles)
    };

    console.log(`🧠 [METADATOS-BÚSQUEDA] Índice generado: ${metadatos.length} productos`);

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

// ===== FUNCIONES AUXILIARES =====

// 🔤 NORMALIZAR TEXTO
function normalizeText(text) {
  if (!text) return '';
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar tildes
    .replace(/[^\w\s\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}
// 🎯 FORMATEAR QUERY PARA BÚSQUEDA INTELIGENTE
function formatearParaBusqueda(query) {
  const formatted = {
    categoria: null,
    posicion: null,
    marca: null,
    modelo: null,
    version: null
  };

  // ✅ MAPEAR CATEGORÍAS
  const categoriasMap = {
    'amortiguador': 'Amort CORVEN',
    'amortiguadores': 'Amort CORVEN', 
    'pastilla': 'Pastillas CORVEN HT',
    'pastillas': 'Pastillas CORVEN HT',
    'disco': 'Discos y Camp CORVEN',
    'discos': 'Discos y Camp CORVEN',
    'rotula': 'Rotulas CORVEN',
    'rotulas': 'Rotulas CORVEN',
    'brazo': 'Brazos Susp CORVEN',
    'brazos': 'Brazos Susp CORVEN',
    'extremo': 'Extremos CORVEN',
    'extremos': 'Extremos CORVEN',
    'bieleta': 'Bieletas CORVEN',
    'bieletas': 'Bieletas CORVEN'
  };

  // ✅ MAPEAR POSICIONES
  const posicionesMap = {
    'delantero': 'Delantero',
    'delanteros': 'Delantero',
    'del': 'Delantero',
    'trasero': 'Trasero', 
    'traseros': 'Trasero',
    'pos': 'Trasero'
  };

  // ✅ MAPEAR MARCAS
  const marcasMap = {
    'ford': 'FORD',
    'vw': 'VOLKSWAGEN',
    'volkswagen': 'VOLKSWAGEN',
    'chevrolet': 'CHEVROLET',
    'chevy': 'CHEVROLET',
    'peugeot': 'PEUGEOT',
    'renault': 'RENAULT'
  };

  // ✅ NORMALIZAR MODELOS
  const modelosMap = {
    'ka': 'KA',
    'escort': 'ESCORT',
    'focus': 'FOCUS',
    'gol': 'GOL',
    '206': '206',
    '207': '207'
  };

  // ✅ PROCESAR QUERY
  const terms = normalizeText(query).split(/\s+/);
  
  terms.forEach(term => {
    if (categoriasMap[term]) formatted.categoria = categoriasMap[term];
    if (posicionesMap[term]) formatted.posicion = posicionesMap[term];
    if (marcasMap[term]) formatted.marca = marcasMap[term];
    if (modelosMap[term]) formatted.modelo = modelosMap[term];
    
    // Versiones/años
    if (/^\d{2,4}$/.test(term)) {
      formatted.version = term.length === 2 ? `(${term}/` : `(${term.slice(-2)}/`;
    }
  });

  return formatted;
}
// 🧠 PARSEAR CONSULTA NATURAL
function parseNaturalQuery(query) {
  const normalized = normalizeText(query);
  console.log('🔍 Parseando query:', normalized);

  // ✅ PATRONES DE BÚSQUEDA (manteniendo la lógica original)
  const patterns = [
    // "producto posicion para marca modelo"
    {
      pattern: /^(.+?)\s+(delantero|trasero|anterior|posterior|izquierdo|derecho|del|pos|izq|der|superior|inferior|sup|inf)\s+para\s+(.+?)\s+(.+?)(?:\s+(.+))?$/i,
      extract: (match) => ({
        product: match[1].trim(),
        position: match[2].trim(),
        brand: match[3].trim(),
        model: match[4].trim(),
        version: match[5]?.trim() || null
      })
    },
    
    // "producto para marca modelo"
    {
      pattern: /^(.+?)\s+para\s+(.+?)\s+(.+?)(?:\s+(.+))?$/i,
      extract: (match) => ({
        product: match[1].trim(),
        brand: match[2].trim(),
        model: match[3].trim(),
        version: match[4]?.trim() || null
      })
    },
    
    // "marca modelo producto"
    {
      pattern: /^(ford|chevrolet|volkswagen|vw|peugeot|renault|fiat|toyota|nissan|honda|hyundai|kia|mazda|mitsubishi|bmw|audi|mercedes|citroen|opel|seat|volvo|subaru|suzuki)\s+([a-z0-9]+)\s+(.+)$/i,
      extract: (match) => ({
        brand: match[1].trim(),
        model: match[2].trim(),
        product: match[3].trim()
      })
    }
  ];

  // Intentar cada patrón
  for (const pattern of patterns) {
    const match = normalized.match(pattern.pattern);
    if (match) {
      const parsed = pattern.extract(match);
      console.log('✅ Patrón encontrado:', parsed);
      return parsed;
    }
  }

  console.log('🔍 Búsqueda libre para:', normalized);
  return { freeText: normalized };
}


// 🏗 CONSTRUIR PIPELINE DE BÚSQUEDA MEJORADO - CORREGIDO
// 🏗 CONSTRUIR PIPELINE DE BÚSQUEDA - REGEX SEGURO
function buildSearchPipeline(parsedQuery, limit, offset) {
  const pipeline = [];
  
  if (parsedQuery.freeText) {
    const formatted = formatearParaBusqueda(parsedQuery.freeText);
    const searchText = parsedQuery.freeText.trim();
    
    // ✅ ESCAPAR CARACTERES ESPECIALES PARA REGEX
    const escapedSearchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    console.log('🎯 [FORMATO] Query original:', searchText);
    console.log('🎯 [FORMATO] Query escapada:', escapedSearchText);
    console.log('🎯 [FORMATO] Query formateada:', formatted);
    
    const searchConditions = [];
    
    // 1. BÚSQUEDA EXACTA POR CÓDIGO (sin regex)
    searchConditions.push({ codigo: searchText });
    
    // 2. BÚSQUEDA POR CÓDIGO CON REGEX SEGURO
    if (searchText.length > 2) {
      searchConditions.push({ codigo: { $regex: escapedSearchText, $options: 'i' } });
    }
    
    // 3. EQUIVALENCIAS EXACTAS
    searchConditions.push({ "equivalencias.codigo": searchText });
    
    // 4. EQUIVALENCIAS CON REGEX SEGURO
    if (searchText.length > 2) {
      searchConditions.push({ "equivalencias.codigo": { $regex: escapedSearchText, $options: 'i' } });
    }
    
    // 5. BÚSQUEDA CON ÍNDICE COMPUESTO (si tenemos datos formateados)
    if (formatted.categoria && formatted.posicion && formatted.marca && formatted.modelo) {
      const compoundMatch = {
        categoria: formatted.categoria,
        "detalles_tecnicos.Posición de la pieza": formatted.posicion,
        "aplicaciones.marca": formatted.marca,
        "aplicaciones.modelo": formatted.modelo
      };
      searchConditions.push(compoundMatch);
    }
    
    // 6. BÚSQUEDAS INDIVIDUALES CON REGEX SEGURO
    if (escapedSearchText.length > 2) {
      searchConditions.push(
        { nombre: { $regex: escapedSearchText, $options: 'i' } },
        { categoria: { $regex: escapedSearchText, $options: 'i' } },
        { "aplicaciones.marca": { $regex: escapedSearchText, $options: 'i' } },
        { "aplicaciones.modelo": { $regex: escapedSearchText, $options: 'i' } }
      );
    }
    
    // 7. BÚSQUEDAS POR TÉRMINOS INDIVIDUALES
    const terms = searchText.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    terms.forEach(term => {
      const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      searchConditions.push(
        { codigo: { $regex: escapedTerm, $options: 'i' } },
        { nombre: { $regex: escapedTerm, $options: 'i' } },
        { categoria: { $regex: escapedTerm, $options: 'i' } },
        { "aplicaciones.marca": { $regex: escapedTerm, $options: 'i' } },
        { "aplicaciones.modelo": { $regex: escapedTerm, $options: 'i' } },
        { "equivalencias.codigo": { $regex: escapedTerm, $options: 'i' } }
      );
    });
    
    pipeline.push({ $match: { $or: searchConditions } });
    
  } else {
    // ✅ BÚSQUEDA ESTRUCTURADA (mantener)
    const conditions = [];
    
    if (parsedQuery.product) {
      const escapedProduct = parsedQuery.product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conditions.push({
        $or: [
          { categoria: { $regex: escapedProduct, $options: 'i' } },
          { nombre: { $regex: escapedProduct, $options: 'i' } }
        ]
      });
    }
    
    if (parsedQuery.brand && parsedQuery.model) {
      const escapedBrand = parsedQuery.brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedModel = parsedQuery.model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      conditions.push({
        "aplicaciones.marca": { $regex: escapedBrand, $options: 'i' },
        "aplicaciones.modelo": { $regex: escapedModel, $options: 'i' }
      });
    }
    
    pipeline.push({
      $match: conditions.length > 0 ? { $and: conditions } : {}
    });
  }
  
  // ✅ SCORING MEJORADO
  pipeline.push({
    $addFields: {
      relevanceScore: {
        $add: [
          // Código exacto = 1000
          { $cond: [{ $eq: ["$codigo", parsedQuery.freeText || ""] }, 1000, 0] },
          
          // Equivalencia exacta = 900
          { $cond: [{ $in: [parsedQuery.freeText || "", "$equivalencias.codigo"] }, 900, 0] },
          
          // Código contiene (para códigos como 0714FN-K) = 800
          { $cond: [
            { $regexMatch: { 
              input: "$codigo", 
              regex: (parsedQuery.freeText || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
              options: "i" 
            }},
            800, 0
          ]},
          
          // Nombre contiene = 300
          { $cond: [
            { $regexMatch: { 
              input: "$nombre", 
              regex: (parsedQuery.freeText || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
              options: "i" 
            }},
            300, 0
          ]},
          
          // Categoría = 200
          { $cond: [
            { $regexMatch: { 
              input: "$categoria", 
              regex: (parsedQuery.freeText || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
              options: "i" 
            }},
            200, 0
          ]},
          
          // Aplicación marca/modelo = 400
          { $cond: [
            { $gt: [
              { $size: {
                $filter: {
                  input: "$aplicaciones",
                  cond: {
                    $or: [
                      { $regexMatch: { 
                        input: "$$this.marca", 
                        regex: (parsedQuery.freeText || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
                        options: "i" 
                      }},
                      { $regexMatch: { 
                        input: "$$this.modelo", 
                        regex: (parsedQuery.freeText || "").replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 
                        options: "i" 
                      }}
                    ]
                  }
                }
              }},
              0
            ]},
            400, 0
          ]}
        ]
      }
    }
  });
  
  // ✅ ORDENAR Y PAGINAR
  pipeline.push({ $sort: { relevanceScore: -1, codigo: 1 } });
  if (offset > 0) pipeline.push({ $skip: offset });
  pipeline.push({ $limit: limit });
  pipeline.push({ $project: { relevanceScore: 0, _id: 0 } });
  
  return pipeline;
}

// ===== SINÓNIMOS Y MAPEOS (del frontend original) =====
const BRAND_SYNONYMS = {
  'vw': 'volkswagen',
  'volks': 'volkswagen', 
  'chevy': 'chevrolet',
  'chev': 'chevrolet',
  'mercedes': 'mercedes benz',
  'benz': 'mercedes benz'
};

const PRODUCT_CATEGORIES = {
  'amortiguador': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
  'amortiguadores': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
  'pastilla': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
  'pastillas': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
  'freno': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
  'frenos': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
  'disco': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
  'discos': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
  'embrague': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
  'embragues': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
  'rotula': ['Rotulas CORVEN', 'Rotulas SADAR'],
  'rotulas': ['Rotulas CORVEN', 'Rotulas SADAR']
};
