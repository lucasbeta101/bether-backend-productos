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

    console.log('🔍 [BÚSQUEDA BACKEND] Query recibida:', q);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // ✅ PARSEAR QUERY CON PATRONES INTELIGENTES
    const parsedQuery = parseNaturalQuery(q.trim());
    console.log('🧠 [BACKEND] Query parseada:', parsedQuery);

    // ✅ CONSTRUIR PIPELINE DE AGREGACIÓN
    const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit), parseInt(offset));
    console.log('📋 [BACKEND] Pipeline construido:', JSON.stringify(pipeline, null, 2));

    // ✅ EJECUTAR BÚSQUEDA
    const startTime = Date.now();
    const results = await collection.aggregate(pipeline).toArray();
    const processingTime = Date.now() - startTime;

    console.log(`✅ [BACKEND] ${results.length} resultados encontrados en ${processingTime}ms`);
    
    // ✅ DEBUG: Mostrar algunos resultados
    if (results.length > 0) {
      console.log('📦 [BACKEND] Primeros 3 resultados:');
      results.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.codigo} - ${result.categoria} - ${result.nombre}`);
      });
    } else {
      console.log('❌ [BACKEND] No se encontraron resultados - revisando pipeline...');
    }

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
    console.error('❌ [BÚSQUEDA BACKEND] Error:', error);
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

function parseNaturalQuery(query) {
  const normalized = normalizeText(query);
  console.log('🔍 [BACKEND MEJORADO] Parseando query:', normalized);

  // ✅ NUEVOS PATRONES ESPECÍFICOS PARA TUS CASOS
  const enhancedPatterns = [
    
    // "amortiguador trasero corolla 2009" - PRODUCTO POSICIÓN MODELO AÑO
    {
      pattern: /^(amortiguador|amortiguadores|pastilla|pastillas|disco|discos|embrague|embragues|rotula|rotulas|brazo|brazos|extremo|extremos|bieleta|bieletas|axial|axiales|homocinetica|homocinéticas|rodamiento|rodamientos|maza|mazas|semieje|semiejes|soporte|soportes|parrilla|parrillas|cazoleta|cazoletas|barra|barras|caja|cajas|bomba|bombas)\s+(delantero|delanteros|trasero|traseros|anterior|posterior|del|pos|izq|der|izquierdo|derecho|superior|inferior)\s+([a-z0-9]+)\s+(\d{4})$/i,
      extract: (match) => ({
        product: match[1].trim(),
        position: match[2].trim(),
        model: match[3].trim(),
        year: match[4].trim(),
        isStructured: true,
        searchType: 'producto_posicion_modelo_año'
      })
    },

    // "pastillas de freno hilux 2016" - PRODUCTO COMPLEJO MODELO AÑO
    {
      pattern: /^(pastillas?\s+de\s+freno|discos?\s+de\s+freno|amortiguadores?|rotulas?|bieletas?|extremos?|brazos?\s+de\s+suspension)\s+([a-z0-9]+)\s+(\d{4})$/i,
      extract: (match) => ({
        product: normalizeComplexProduct(match[1].trim()),
        model: match[2].trim(),
        year: match[3].trim(),
        isStructured: true,
        searchType: 'producto_complejo_modelo_año'
      })
    },

    // "disco de freno delantera peugeot 308 2018" - PRODUCTO COMPLEJO POSICIÓN MARCA MODELO AÑO
    {
      pattern: /^(pastillas?\s+de\s+freno|discos?\s+de\s+freno|amortiguadores?|rotulas?|bieletas?|extremos?)\s+(delantero|delanteros|trasero|traseros|delantera|delanteras|trasera|traseras|del|pos)\s+([a-z]+)\s+([a-z0-9]+)\s+(\d{4})$/i,
      extract: (match) => ({
        product: normalizeComplexProduct(match[1].trim()),
        position: match[2].trim(),
        brand: match[3].trim(),
        model: match[4].trim(),
        year: match[5].trim(),
        isStructured: true,
        searchType: 'producto_complejo_posicion_marca_modelo_año'
      })
    },

    // "pastillas hilux" - PRODUCTO MODELO (sin año)
    {
      pattern: /^(amortiguador|amortiguadores|pastilla|pastillas|disco|discos|embrague|embragues|rotula|rotulas|brazo|brazos|extremo|extremos|bieleta|bieletas)\s+([a-z0-9]+)$/i,
      extract: (match) => ({
        product: match[1].trim(),
        model: match[2].trim(),
        isStructured: true,
        searchType: 'producto_modelo_simple'
      })
    },

    // "corolla 2009" - SOLO MODELO Y AÑO
    {
      pattern: /^([a-z0-9]+)\s+(\d{4})$/i,
      extract: (match) => ({
        model: match[1].trim(),
        year: match[2].trim(),
        isStructured: true,
        searchType: 'solo_modelo_año'
      })
    },

    
    // "bieleta fiat 500 2009 izquierda y derecha"
    {
      pattern: /^(amortiguador|pastilla|disco|bieleta|rotula|cazoleta|embrague|brazo|extremo|axial|homocinetica|rodamiento|maza|semieje|soporte|parrilla|barra|caja|bomba)\s+([a-z]+)\s+([a-z0-9]+)\s+(\d{2,4})\s+(izquierda\s+y\s+derecha|izq\s+y\s+der|bilateral|ambos\s+lados|par)$/i,
      extract: (match) => ({
        product: match[1].trim(),
        brand: match[2].trim(),
        model: match[3].trim(),
        year: match[4].trim(),
        position: 'ambos_lados',
        isStructured: true,
        searchType: 'ultra_specific_bilateral'
      })
    },

    // "bieleta izquierda fiat 500 2009"
    {
      pattern: /^(amortiguador|pastilla|disco|bieleta|rotula|cazoleta|embrague|brazo|extremo|axial|homocinetica|rodamiento|maza|semieje|soporte|parrilla|barra|caja|bomba)\s+(delantero|trasero|izquierdo|derecho|izquierda|del|pos|izq|der)\s+([a-z]+)\s+([a-z0-9]+)\s+(\d{2,4})$/i,
      extract: (match) => ({
        product: match[1].trim(),
        position: match[2].trim(),
        brand: match[3].trim(),
        model: match[4].trim(),
        year: match[5].trim(),
        isStructured: true,
        searchType: 'ultra_specific_position_first'
      })
    },

    // "bieleta fiat 500 2009"
    {
      pattern: /^(amortiguador|pastilla|disco|bieleta|rotula|cazoleta|embrague|brazo|extremo|axial|homocinetica|rodamiento|maza|semieje|soporte|parrilla|barra|caja|bomba)\s+([a-z]+)\s+([a-z0-9]+)\s+(\d{2,4})$/i,
      extract: (match) => ({
        product: match[1].trim(),
        brand: match[2].trim(),
        model: match[3].trim(),
        year: match[4].trim(),
        isStructured: true,
        searchType: 'ultra_specific_simple'
      })
    },

    // PATRONES EXISTENTES con "para"
    {
      pattern: /^(amortiguador|pastilla|disco|bieleta|rotula|cazoleta|embrague|brazo|extremo|axial|homocinetica|rodamiento|maza|semieje|soporte|parrilla|barra|caja|bomba)\s+(delantero|trasero|del|pos|izq|der|superior|inferior)\s+para\s+([a-z]+)\s+([a-z0-9]+)\s+(\d{2,4})\s+([a-z0-9]+)$/i,
      extract: (match) => ({
        product: match[1].trim(),
        position: match[2].trim(),
        brand: match[3].trim(),
        model: match[4].trim(),
        year: match[5].trim(),
        version: match[6].trim(),
        isStructured: true,
        searchType: 'ultra_specific_perfect'
      })
    },
    
    {
      pattern: /^(amortiguador|pastilla|disco|bieleta|rotula|cazoleta|embrague|brazo|extremo|axial|homocinetica|rodamiento|maza|semieje|soporte|parrilla|barra|caja|bomba)\s+para\s+([a-z]+)\s+([a-z0-9]+)\s+(\d{2,4})\s+([a-z0-9]+)$/i,
      extract: (match) => ({
        product: match[1].trim(),
        brand: match[2].trim(),
        model: match[3].trim(),
        year: match[4].trim(),
        version: match[5].trim(),
        isStructured: true,
        searchType: 'specific_with_para'
      })
    }
  ];

  // ✅ PROBAR PATRONES MEJORADOS PRIMERO
  for (const pattern of enhancedPatterns) {
    const match = normalized.match(pattern.pattern);
    if (match) {
      const parsed = pattern.extract(match);
      console.log('✅ [BACKEND] Patrón mejorado encontrado:', parsed);
      return parsed;
    }
  }

  console.log('🔍 [BACKEND] Usando búsqueda libre para:', normalized);
  return { freeText: normalized };
}
function normalizeComplexProduct(productName) {
  const productMap = {
    'pastillas de freno': 'pastilla',
    'pastilla de freno': 'pastilla',
    'discos de freno': 'disco',
    'disco de freno': 'disco',
    'brazos de suspension': 'brazo',
    'brazo de suspension': 'brazo',
    'amortiguadores': 'amortiguador'
  };
  
  const normalized = productName.toLowerCase().trim();
  return productMap[normalized] || productName;
}



// ===== FUNCIÓN buildSearchPipeline COMPLETA Y MEJORADA =====

function buildSearchPipeline(parsedQuery, limit, offset) {
  const pipeline = [];
  
  console.log('🔧 [PIPELINE] Construyendo pipeline MEJORADO para:', parsedQuery);
  
  if (parsedQuery.freeText) {
    // ✅ BÚSQUEDA DE TEXTO LIBRE
    const searchText = parsedQuery.freeText.trim();
    const escapedSearchText = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    console.log('🔧 [PIPELINE] Búsqueda libre:', searchText);
    
    const searchConditions = [
      { codigo: { $regex: escapedSearchText, $options: 'i' } },
      { nombre: { $regex: escapedSearchText, $options: 'i' } },
      { categoria: { $regex: escapedSearchText, $options: 'i' } },
      { marca: { $regex: escapedSearchText, $options: 'i' } },
      { "aplicaciones.marca": { $regex: escapedSearchText, $options: 'i' } },
      { "aplicaciones.modelo": { $regex: escapedSearchText, $options: 'i' } },
      { "aplicaciones.version": { $regex: escapedSearchText, $options: 'i' } },
      { "equivalencias.codigo": { $regex: escapedSearchText, $options: 'i' } },
      { "equivalencias.marca": { $regex: escapedSearchText, $options: 'i' } }
    ];
    
    pipeline.push({ $match: { $or: searchConditions } });
    
  } else if (parsedQuery.isStructured) {
    // ✅ BÚSQUEDA ESTRUCTURADA MEJORADA
    console.log('🔧 [PIPELINE] Búsqueda estructurada MEJORADA');
    
    const matchConditions = { 
      tiene_precio_valido: true 
    };
    
    // ✅ 1. FILTRAR POR PRODUCTO/CATEGORÍA (MEJORADO)
    if (parsedQuery.product) {
      const validCategories = getValidCategoriesForProduct(parsedQuery.product);
      console.log('🔧 [PIPELINE] Categorías válidas para', parsedQuery.product, ':', validCategories);
      
      if (validCategories.length > 0) {
        matchConditions.categoria = { $in: validCategories };
      } else {
        // ✅ NUEVO: Si no hay categorías específicas, buscar en nombres y categorías
        console.log('🔧 [PIPELINE] Buscando en nombres y categorías para:', parsedQuery.product);
        matchConditions.$or = [
          { nombre: { $regex: parsedQuery.product, $options: 'i' } },
          { categoria: { $regex: parsedQuery.product, $options: 'i' } }
        ];
      }
    }
    
    // ✅ 2. FILTRAR POR VEHÍCULO - LÓGICA MEJORADA Y FLEXIBLE
    let vehicleCondition = null;
    
    // Caso 1: Tenemos marca Y modelo
    if (parsedQuery.brand && parsedQuery.model) {
      console.log('🔧 [PIPELINE] Filtrando por MARCA + MODELO:', parsedQuery.brand, parsedQuery.model);
      
      vehicleCondition = {
        $elemMatch: {
          marca: { $regex: parsedQuery.brand, $options: 'i' },
          modelo: { $regex: parsedQuery.model, $options: 'i' }
        }
      };
    }
    // Caso 2: Solo modelo (SIN marca) - NUEVO Y CLAVE
    else if (parsedQuery.model) {
      console.log('🔧 [PIPELINE] Filtrando SOLO por MODELO:', parsedQuery.model);
      
      vehicleCondition = {
        $elemMatch: {
          modelo: { $regex: parsedQuery.model, $options: 'i' }
        }
      };
    }
    // Caso 3: Solo marca (sin modelo)
    else if (parsedQuery.brand) {
      console.log('🔧 [PIPELINE] Filtrando SOLO por MARCA:', parsedQuery.brand);
      
      vehicleCondition = {
        $elemMatch: {
          marca: { $regex: parsedQuery.brand, $options: 'i' }
        }
      };
    }
    
    // ✅ 3. AGREGAR FILTRO DE AÑO A LA CONDICIÓN DE VEHÍCULO
    if (parsedQuery.year && vehicleCondition) {
      console.log('🔧 [PIPELINE] Agregando filtro de AÑO:', parsedQuery.year);
      
      const year2digit = parsedQuery.year.slice(-2);
      console.log('🔧 [PIPELINE] Año 2 dígitos:', year2digit);
      
      // ✅ PATRONES DE BÚSQUEDA DE AÑO MEJORADOS
      const yearPatterns = [
        `\\(${year2digit}/`,           // (09/..
        `\\(${parsedQuery.year}`,      // (2009
        `/${year2digit}\\)`,           // ../09)
        `/${parsedQuery.year}\\)`,     // ../2009)
        `\\(${year2digit}\\)`,         // (09)
        `\\(${parsedQuery.year}\\)`,   // (2009)
        year2digit,                    // solo 09
        parsedQuery.year               // solo 2009
      ];
      
      // Agregar condiciones de año al $elemMatch existente
      vehicleCondition.$elemMatch.$or = yearPatterns.map(pattern => ({
        version: { $regex: pattern, $options: 'i' }
      }));
    }
    
    // Aplicar condición de vehículo si existe
    if (vehicleCondition) {
      if (matchConditions.$or) {
        // Ya existe $or (de búsqueda de producto), usar $and
        matchConditions.$and = [
          { $or: matchConditions.$or },
          { aplicaciones: vehicleCondition }
        ];
        delete matchConditions.$or;
      } else {
        matchConditions.aplicaciones = vehicleCondition;
      }
    }
    
    // ✅ 4. FILTRAR POR POSICIÓN (MEJORADO)
    if (parsedQuery.position) {
      const mappedPosition = mapPositionForSearch(parsedQuery.position);
      console.log('🔧 [PIPELINE] Filtrando por POSICIÓN:', parsedQuery.position, '→', mappedPosition);
      
      const positionCondition = {
        "detalles_tecnicos.Posición de la pieza": { 
          $regex: mappedPosition, 
          $options: 'i' 
        }
      };
      
      // Combinar con condiciones existentes
      if (matchConditions.$and) {
        matchConditions.$and.push(positionCondition);
      } else if (matchConditions.$or) {
        matchConditions.$and = [
          { $or: matchConditions.$or },
          positionCondition
        ];
        delete matchConditions.$or;
      } else {
        Object.assign(matchConditions, positionCondition);
      }
    }
    
    // ✅ 5. MANEJAR CASOS ESPECIALES DE BÚSQUEDA
    // Caso: Solo año sin modelo ni marca
    if (parsedQuery.year && !parsedQuery.model && !parsedQuery.brand) {
      console.log('🔧 [PIPELINE] Filtrando SOLO por AÑO:', parsedQuery.year);
      
      const year2digit = parsedQuery.year.slice(-2);
      const yearOnlyConditions = [
        { "aplicaciones.version": { $regex: `\\(${year2digit}/`, $options: 'i' } },
        { "aplicaciones.version": { $regex: parsedQuery.year, $options: 'i' } }
      ];
      
      if (matchConditions.$and) {
        matchConditions.$and.push({ $or: yearOnlyConditions });
      } else if (matchConditions.$or) {
        matchConditions.$and = [
          { $or: matchConditions.$or },
          { $or: yearOnlyConditions }
        ];
        delete matchConditions.$or;
      } else {
        matchConditions.$or = yearOnlyConditions;
      }
    }
    
    console.log('🔧 [PIPELINE] Condiciones finales del match:', JSON.stringify(matchConditions, null, 2));
    pipeline.push({ $match: matchConditions });
    
  } else {
    // ✅ FALLBACK: Búsqueda básica
    console.log('🔧 [PIPELINE] Búsqueda fallback - productos con precio válido');
    pipeline.push({ 
      $match: { 
        tiene_precio_valido: true 
      } 
    });
  }
  
  // ✅ 6. SCORING INTELIGENTE Y MEJORADO
  pipeline.push({
    $addFields: {
      relevanceScore: {
        $add: [
          // Score base por existir
          10,
          
          // Score alto por tener nombre relevante
          { $cond: [{ $ne: ["$nombre", null] }, 100, 0] },
          
          // Score por cantidad de aplicaciones (más aplicaciones = más versátil)
          { $multiply: [{ $size: { $ifNull: ["$aplicaciones", []] } }, 15] },
          
          // Score por tener detalles técnicos completos
          { $cond: [{ $ne: ["$detalles_tecnicos", null] }, 50, 0] },
          
          // Score por tener equivalencias (compatibilidad)
          { $multiply: [{ $size: { $ifNull: ["$equivalencias", []] } }, 20] },
          
          // Score por tener imagen
          { $cond: [{ $and: [
            { $ne: ["$imagen", null] },
            { $not: { $regexMatch: { input: "$imagen", regex: "noimage" } } }
          ]}, 25, 0] },
          
          // ✅ NUEVO: Score específico según tipo de búsqueda
          { $cond: [
            { $regexMatch: { input: "$codigo", regex: "^[0-9]+[A-Z]*$" } }, // Código numérico + letras
            30, 0
          ]},
          
          // Score por marca reconocida
          { $cond: [{ $in: ["$marca", ["CORVEN", "SADAR", "FERODO", "JURID", "VALEO"]] }, 40, 0] }
        ]
      }
    }
  });
  
  // ✅ 7. ORDENAMIENTO INTELIGENTE
  pipeline.push({ 
    $sort: { 
      relevanceScore: -1,  // Mayor relevancia primero
      codigo: 1            // Luego por código alfabéticamente
    } 
  });
  
  // ✅ 8. PAGINACIÓN
  if (offset > 0) {
    pipeline.push({ $skip: offset });
  }
  
  pipeline.push({ $limit: limit });
  
  // ✅ 9. PROYECCIÓN FINAL (limpiar campos internos)
  pipeline.push({ 
    $project: { 
      relevanceScore: 0,  // No mostrar score en respuesta
      _id: 0              // No mostrar _id de MongoDB
    } 
  });
  
  console.log('🔧 [PIPELINE] Pipeline completo construido con', pipeline.length, 'etapas');
  
  return pipeline;
}

function getValidCategoriesForProduct(product) {
  const categoryMap = {
    'amortiguador': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
    'amortiguadores': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
    
    'pastilla': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'pastillas': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'freno': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'frenos': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    
    'disco': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'discos': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'campana': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'campanas': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    
    'cazoleta': ['Cazoletas CORVEN', 'Cazoletas SADAR'],
    'cazoletas': ['Cazoletas CORVEN', 'Cazoletas SADAR'],
    
    'bieleta': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'bieletas': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'biela': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'bielas': ['Bieletas CORVEN', 'Bieletas SADAR'],
    
    'rotula': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'rotulas': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'rótula': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'rótulas': ['Rotulas CORVEN', 'Rotulas SADAR'],
    
    'embrague': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    'embragues': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    'clutch': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    
    'brazo': ['Brazos Susp CORVEN', 'Brazos Susp SADAR'],
    'brazos': ['Brazos Susp CORVEN', 'Brazos Susp SADAR'],
    
    'extremo': ['Extremos CORVEN', 'Extremos SADAR'],
    'extremos': ['Extremos CORVEN', 'Extremos SADAR'],
    
    'axial': ['Axiales CORVEN', 'Axiales SADAR'],
    'axiales': ['Axiales CORVEN', 'Axiales SADAR'],
    
    'homocinetica': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'homocinéticas': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'homocinética': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'junta': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'juntas': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    
    'rodamiento': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'rodamientos': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'ruleman': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'rulemanes': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    
    'maza': ['Mazas CORVEN', 'Mazas HF'],
    'mazas': ['Mazas CORVEN', 'Mazas HF'],
    'buje': ['Mazas CORVEN', 'Mazas HF'],
    'bujes': ['Mazas CORVEN', 'Mazas HF'],
    
    'semieje': ['Semiejes CORVEN'],
    'semiejes': ['Semiejes CORVEN'],
    'eje': ['Semiejes CORVEN'],
    'ejes': ['Semiejes CORVEN'],
    
    'soporte': ['Soporte Motor CORVEN'],
    'soportes': ['Soporte Motor CORVEN'],
    
    'parrilla': ['Parrillas CORVEN', 'Parrillas SADAR'],
    'parrillas': ['Parrillas CORVEN', 'Parrillas SADAR'],
    
    'barra': ['Barras HD SADAR'],
    'barras': ['Barras HD SADAR'],
    
    'caja': ['Cajas Mec CORVEN', 'Cajas Hid CORVEN'],
    'cajas': ['Cajas Mec CORVEN', 'Cajas Hid CORVEN'],
    'bomba': ['Bombas Hid CORVEN'],
    'bombas': ['Bombas Hid CORVEN'],
    
    'suspension': ['Susp Neumática SADAR'],
    'suspensión': ['Susp Neumática SADAR'],
    'neumática': ['Susp Neumática SADAR'],
    'neumatica': ['Susp Neumática SADAR']
  };
  
  const normalizedProduct = product.toLowerCase().trim();
  return categoryMap[normalizedProduct] || [];
}


function mapPositionForSearch(position) {
  const positionMap = {
    'delantero': 'Delantero',
    'delanteros': 'Delantero',
    'del': 'Delantero',
    'anterior': 'Delantero',
    'frontal': 'Delantero',
    'delantera': 'Delantero',
    'delanteras': 'Delantero',
    
    'trasero': 'Trasero',
    'traseros': 'Trasero', 
    'pos': 'Trasero',
    'posterior': 'Trasero',
    'trasera': 'Trasero',
    'traseras': 'Trasero',
    
    'izquierdo': 'Izquierdo',
    'izquierda': 'Izquierdo',
    'izq': 'Izquierdo',
    
    'derecho': 'Derecho',
    'derecha': 'Derecho',
    'der': 'Derecho',
    
    'superior': 'Superior',
    'sup': 'Superior',
    'arriba': 'Superior',
    
    'inferior': 'Inferior',
    'inf': 'Inferior',
    'abajo': 'Inferior',
    
    'ambos_lados': '(Izquierdo|Derecho|Bilateral|izquierda y derecha)',
    'bilateral': '(Izquierdo|Derecho|Bilateral)'
  };
  
  const normalizedPosition = position.toLowerCase().trim();
  return positionMap[normalizedPosition] || position;
}