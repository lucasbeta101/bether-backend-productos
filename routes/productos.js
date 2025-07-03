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
    console.log('🧠 [BACKEND] Iniciando parseNaturalQuery...');
    const parsedQuery = parseNaturalQuery(q.trim());
    console.log('🧠 [BACKEND] Query parseada:', JSON.stringify(parsedQuery, null, 2));

    // ✅ VERIFICAR SI ES BÚSQUEDA ESTRUCTURADA
    if (parsedQuery.isStructured) {
      console.log('🎯 [BACKEND] Búsqueda ESTRUCTURADA detectada');
      console.log('📋 [BACKEND] Detalles:', {
        product: parsedQuery.product,
        position: parsedQuery.position,
        model: parsedQuery.model,
        brand: parsedQuery.brand,
        year: parsedQuery.year,
        searchType: parsedQuery.searchType
      });
    } else {
      console.log('🔍 [BACKEND] Búsqueda LIBRE detectada');
      console.log('📋 [BACKEND] Texto libre:', parsedQuery.freeText);
    }

    // ✅ CONSTRUIR PIPELINE DE AGREGACIÓN
    console.log('🔧 [BACKEND] Construyendo pipeline...');
    const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit), parseInt(offset));
    console.log('📋 [BACKEND] Pipeline construido con', pipeline.length, 'etapas');
    console.log('📋 [BACKEND] Pipeline completo:', JSON.stringify(pipeline, null, 2));

    // ✅ VERIFICAR CONEXIÓN Y COLECCIÓN
    console.log('🔗 [BACKEND] Verificando conexión MongoDB...');
    const collectionExists = await db.listCollections({ name: COLLECTION_NAME }).hasNext();
    console.log('🔗 [BACKEND] Colección existe:', collectionExists);

    if (!collectionExists) {
      console.error('❌ [BACKEND] La colección no existe:', COLLECTION_NAME);
      return res.status(500).json({
        success: false,
        error: `Colección ${COLLECTION_NAME} no encontrada`
      });
    }

    // ✅ CONTAR DOCUMENTOS TOTAL PARA VERIFICAR
    const totalDocs = await collection.countDocuments();
    console.log('📊 [BACKEND] Total documentos en colección:', totalDocs);

    if (totalDocs === 0) {
      console.error('❌ [BACKEND] La colección está vacía');
      return res.status(500).json({
        success: false,
        error: 'Base de datos vacía'
      });
    }

    // ✅ EJECUTAR BÚSQUEDA
    console.log('🚀 [BACKEND] Ejecutando agregación...');
    const startTime = Date.now();
    const results = await collection.aggregate(pipeline).toArray();
    const processingTime = Date.now() - startTime;

    console.log(`📊 [BACKEND] Agregación completada: ${results.length} resultados en ${processingTime}ms`);
    
    // ✅ DEBUG DETALLADO DE RESULTADOS
    if (results.length > 0) {
      console.log('📦 [BACKEND] Primeros 3 resultados encontrados:');
      results.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. Código: ${result.codigo}`);
        console.log(`     Nombre: ${result.nombre}`);
        console.log(`     Categoría: ${result.categoria}`);
        console.log(`     Aplicaciones: ${result.aplicaciones?.length || 0}`);
        if (result.aplicaciones && result.aplicaciones.length > 0) {
          const app = result.aplicaciones[0];
          console.log(`     Primera aplicación: ${app.marca} ${app.modelo} ${app.version || 'N/A'}`);
        }
        console.log(`     Posición: ${result.detalles_tecnicos?.["Posición de la pieza"] || 'N/A'}`);
        console.log('     ---');
      });
    } else {
      console.log('❌ [BACKEND] No se encontraron resultados');
      
      // ✅ DEBUG ADICIONAL: Probar consultas más simples
      console.log('🔍 [DEBUG] Probando consultas más simples...');
      
      // Test 1: Buscar por categoría solamente
      if (parsedQuery.product) {
        const validCategories = getValidCategoriesForProduct(parsedQuery.product);
        console.log('🧪 [DEBUG] Categorías válidas:', validCategories);
        
        const categoryResults = await collection.find({
          categoria: { $in: validCategories }
        }).limit(3).toArray();
        
        console.log(`🧪 [DEBUG] Productos con esas categorías: ${categoryResults.length}`);
        if (categoryResults.length > 0) {
          console.log('🧪 [DEBUG] Ejemplo:', categoryResults[0].codigo, '-', categoryResults[0].categoria);
        }
      }
      
      // Test 2: Buscar por modelo solamente
      if (parsedQuery.model) {
        const modelResults = await collection.find({
          'aplicaciones.modelo': { $regex: parsedQuery.model, $options: 'i' }
        }).limit(3).toArray();
        
        console.log(`🧪 [DEBUG] Productos para modelo ${parsedQuery.model}: ${modelResults.length}`);
        if (modelResults.length > 0) {
          console.log('🧪 [DEBUG] Ejemplo:', modelResults[0].codigo, '-', modelResults[0].aplicaciones?.[0]?.modelo);
        }
      }
      
      // Test 3: Buscar por año solamente
      if (parsedQuery.year) {
        const year2digit = parsedQuery.year.slice(-2);
        const yearResults = await collection.find({
          'aplicaciones.version': { $regex: `\\(${year2digit}/`, $options: 'i' }
        }).limit(3).toArray();
        
        console.log(`🧪 [DEBUG] Productos para año ${parsedQuery.year}: ${yearResults.length}`);
        if (yearResults.length > 0) {
          console.log('🧪 [DEBUG] Ejemplo:', yearResults[0].codigo, '-', yearResults[0].aplicaciones?.[0]?.version);
        }
      }
    }

    // ✅ RESPUESTA MEJORADA
    const response = {
      success: true,
      query: q,
      parsedQuery: parsedQuery,
      results: results,
      totalResults: results.length,
      processingTime: processingTime,
      debug: {
        collectionName: COLLECTION_NAME,
        totalDocuments: totalDocs,
        pipelineStages: pipeline.length,
        isStructuredSearch: !!parsedQuery.isStructured
      },
      timestamp: new Date().toISOString()
    };

    // ✅ LOG FINAL
    console.log('✅ [BACKEND] Respuesta enviada:', {
      success: true,
      totalResults: results.length,
      processingTime: processingTime
    });

    res.json(response);

  } catch (error) {
    console.error('❌ [BÚSQUEDA BACKEND] Error completo:', error);
    console.error('❌ [BÚSQUEDA BACKEND] Stack trace:', error.stack);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Error en búsqueda',
      debug: {
        errorType: error.constructor.name,
        timestamp: new Date().toISOString()
      }
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

const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'para', 'auto'];

// ✅ 2. LUEGO, REEMPLAZA TU FUNCIÓN parseNaturalQuery COMPLETA POR ESTA:
function parseNaturalQuery(query) {
  const normalized = normalizeText(query);
  console.log('🧠 [PARSER INTELIGENTE] Parseando query:', normalized);

  const words = normalized.split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 0);
  console.log('🧠 [PARSER INTELIGENTE] Palabras clave filtradas:', words);

  const result = {
    product: null,
    position: null,
    year: null,
    vehicleTerms: [], // Para marca, modelo, versión, etc.
    isStructured: false
  };

  const productKeywords = Object.keys(getValidCategoriesForProduct('all')); // Obtener todas las keywords de productos
  const positionKeywords = Object.keys(mapPositionForSearch('all')); // Obtener todas las keywords de posición

  // Identificar componentes sin importar el orden
  const remainingWords = [];
  for (const word of words) {
    if (!result.product && productKeywords.includes(word)) {
      result.product = word;
    } else if (!result.position && positionKeywords.includes(word)) {
      result.position = word;
    } else if (!result.year && /^\d{4}$/.test(word)) {
      result.year = word;
    } else if (!result.year && /^\d{2}$/.test(word)) {
      // Convertir año de 2 dígitos a 4
      const yearNum = parseInt(word, 10);
      result.year = yearNum > 30 ? (1900 + yearNum).toString() : (2000 + yearNum).toString();
    } else {
      remainingWords.push(word);
    }
  }

  result.vehicleTerms = remainingWords;

  // Se considera estructurada si encontró al menos un componente clave
  if (result.product || result.position || result.year || result.vehicleTerms.length > 0) {
    result.isStructured = true;
    console.log('🎯 [PARSER INTELIGENTE] Búsqueda ESTRUCTURADA detectada:', result);
    return result;
  }

  console.log('🔍 [PARSER INTELIGENTE] Usando búsqueda LIBRE para:', normalized);
  return { freeText: normalized };
}

// ✅ 3. TAMBIÉN NECESITAS MODIFICAR ESTAS DOS FUNCIONES HELPER PARA QUE DEVUELVAN TODAS LAS KEYS
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
  if (product === 'all') return categoryMap; // <-- AÑADIR ESTA LÍNEA
  const normalizedProduct = product.toLowerCase().trim();
  return categoryMap[normalizedProduct] || [];
}

function mapPositionForSearch(position) {
    const positionMap = { 
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
   if (position === 'all') return positionMap; // <-- AÑADIR ESTA LÍNEA
  const normalizedPosition = position.toLowerCase().trim();
  return positionMap[normalizedPosition] || position;
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
  const matchConditions = { tiene_precio_valido: true };

  console.log('🔧 [PIPELINE v3] ===== INICIO CONSTRUCCIÓN CON ELEMMATCH =====');
  console.log('🔧 [PIPELINE v3] Query parseada:', parsedQuery);

  if (parsedQuery.isStructured) {
    console.log('🎯 [PIPELINE v3] Construyendo desde búsqueda ESTRUCTURADA');

    // --- FILTRO DE PRODUCTO/CATEGORÍA (sin cambios) ---
    if (parsedQuery.product) {
      const validCategories = getValidCategoriesForProduct(parsedQuery.product);
      if (validCategories.length > 0) {
        matchConditions.categoria = { $in: validCategories };
        console.log('✅ [PIPELINE v3] Condición de categoría agregada');
      }
    }

    // --- FILTRO DE POSICIÓN (sin cambios) ---
    if (parsedQuery.position) {
      const mappedPosition = mapPositionForSearch(parsedQuery.position);
      matchConditions["detalles_tecnicos.Posición de la pieza"] = {
        $regex: mappedPosition,
        $options: 'i'
      };
      console.log('✅ [PIPELINE v3] Condición de posición agregada');
    }

    // --- FILTRO DE VEHÍCULO Y AÑO (LÓGICA CORREGIDA) ---
    const elemMatchConditions = { $and: [] };

    // 1. Añadir condiciones para cada término del vehículo
    if (parsedQuery.vehicleTerms.length > 0) {
      const vehicleConditions = parsedQuery.vehicleTerms.map(term => ({
        $or: [
          { "marca": { $regex: term, $options: 'i' } },
          { "modelo": { $regex: term, $options: 'i' } }
        ]
      }));
      elemMatchConditions.$and.push(...vehicleConditions);
      console.log(`✅ [PIPELINE v3] ${vehicleConditions.length} condiciones de vehículo para $elemMatch`);
    }

    // 2. Añadir condición de año
    if (parsedQuery.year) {
      // Usamos una regex que busca el año completo (1988) o los dos últimos dígitos (88)
      // para mayor compatibilidad con tu data.
      const yearRegex = `(${parsedQuery.year}|${parsedQuery.year.slice(-2)})`;
      const yearCondition = { 'version': { $regex: yearRegex, $options: 'i' } };
      elemMatchConditions.$and.push(yearCondition);
      console.log('✅ [PIPELINE v3] Condición de año agregada a $elemMatch');
    }

    // 3. Aplicar $elemMatch solo si contiene condiciones
    if (elemMatchConditions.$and.length > 0) {
      matchConditions.aplicaciones = { $elemMatch: elemMatchConditions };
      console.log('✅ [PIPELINE v3] Condición $elemMatch final construida');
    }
    
    pipeline.push({ $match: matchConditions });

  } else if (parsedQuery.freeText) {
    // La búsqueda libre mejorada que te di antes sigue siendo válida
    console.log('📝 [PIPELINE v3] Construyendo desde búsqueda LIBRE');
    const keywords = parsedQuery.freeText.split(' ').filter(k => k.length > 0);
    const keywordConditions = keywords.map(word => ({
        $or: [
            { codigo: { $regex: word, $options: 'i' } },
            { nombre: { $regex: word, $options: 'i' } },
            { categoria: { $regex: word, $options: 'i' } },
            { "aplicaciones.marca": { $regex: word, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: word, $options: 'i' } },
        ]
    }));
    if(keywordConditions.length > 0) {
        pipeline.push({ $match: { $and: keywordConditions } });
    }
  }

  // --- RESTO DEL PIPELINE (SORT, LIMIT, ETC.) ---
  pipeline.push({ $sort: { codigo: 1 } });
  if (offset > 0) pipeline.push({ $skip: offset });
  pipeline.push({ $limit: limit });
  pipeline.push({ $project: { _id: 0 } });

  console.log('🏗️ [PIPELINE v3] Pipeline final:', JSON.stringify(pipeline, null, 2));
  return pipeline;
}

// ===== FUNCIÓN AUXILIAR PARA VERIFICAR SI UN AÑO ESTÁ EN RANGO BIDIRECCIONAL =====

function checkYearInRangeBidirectional(versionString, targetYear) {
  console.log('📅 [YEAR CHECK BIDIRECTIONAL] Verificando:', versionString, 'para año', targetYear);
  
  // Patrón (08/..) = desde 2008 hasta infinito
  const openRangeForwardMatch = versionString.match(/\(?(\d{2})\/\.\.\)?/);
  if (openRangeForwardMatch) {
    const startYear = parseInt('20' + openRangeForwardMatch[1]);
    const isInRange = targetYear >= startYear;
    console.log('📅 [YEAR CHECK] Rango abierto hacia adelante:', startYear, '<=', targetYear, '=', isInRange);
    return isInRange;
  }
  
  // Patrón (../09) = hasta 2009 (hacia atrás)
  const openRangeBackwardMatch = versionString.match(/\(?\.\.\/?(\d{2})\)?/);
  if (openRangeBackwardMatch) {
    const endYear = parseInt('20' + openRangeBackwardMatch[1]);
    const isInRange = targetYear <= endYear;
    console.log('📅 [YEAR CHECK] Rango abierto hacia atrás:', targetYear, '<=', endYear, '=', isInRange);
    return isInRange;
  }
  
  // Patrón (07/12) = desde 2007 hasta 2012  
  const closedRangeMatch = versionString.match(/\(?(\d{2})\/(\d{2})\)?/);
  if (closedRangeMatch) {
    const startYear = parseInt('20' + closedRangeMatch[1]);
    const endYear = parseInt('20' + closedRangeMatch[2]);
    const isInRange = targetYear >= startYear && targetYear <= endYear;
    console.log('📅 [YEAR CHECK] Rango cerrado:', startYear, '<=', targetYear, '<=', endYear, '=', isInRange);
    return isInRange;
  }
  
  // Año específico (09) o (2009)
  const specificYearMatch = versionString.match(/\(?(\d{2,4})\)?/);
  if (specificYearMatch) {
    const yearStr = specificYearMatch[1];
    const versionYear = yearStr.length === 2 ? parseInt('20' + yearStr) : parseInt(yearStr);
    const isMatch = targetYear === versionYear;
    console.log('📅 [YEAR CHECK] Año específico:', versionYear, '=', targetYear, '=', isMatch);
    return isMatch;
  }
  
  console.log('📅 [YEAR CHECK] No se pudo parsear:', versionString);
  return false;
}

// ===== FUNCIÓN AUXILIAR PARA PROBAR PATRONES DE AÑOS =====

function testYearPatterns() {
  console.log('🧪 [TEST YEAR PATTERNS] ===== INICIO PRUEBAS =====');
  
  const testCases = [
    // Rangos hacia adelante
    { version: "(08/..)", targetYear: 2009, expected: true, description: "Rango adelante con paréntesis" },
    { version: "08/..", targetYear: 2009, expected: true, description: "Rango adelante sin paréntesis" },
    { version: "(10/..)", targetYear: 2009, expected: false, description: "Rango adelante que no incluye" },
    
    // Rangos hacia atrás
    { version: "(../09)", targetYear: 2009, expected: true, description: "Rango atrás con paréntesis" },
    { version: "../09", targetYear: 2009, expected: true, description: "Rango atrás sin paréntesis" },
    { version: "(../08)", targetYear: 2009, expected: false, description: "Rango atrás que no incluye" },
    
    // Rangos cerrados
    { version: "(07/12)", targetYear: 2009, expected: true, description: "Rango cerrado que incluye" },
    { version: "07/12", targetYear: 2009, expected: true, description: "Rango cerrado sin paréntesis" },
    { version: "(10/15)", targetYear: 2009, expected: false, description: "Rango cerrado que no incluye" },
    
    // Años específicos
    { version: "(09)", targetYear: 2009, expected: true, description: "Año específico 2 dígitos" },
    { version: "(2009)", targetYear: 2009, expected: true, description: "Año específico 4 dígitos" },
    { version: "(08)", targetYear: 2009, expected: false, description: "Año específico diferente" }
  ];
  
  console.log('🧪 [TEST YEAR PATTERNS] Ejecutando', testCases.length, 'casos de prueba...');
  
  testCases.forEach((testCase, index) => {
    const result = checkYearInRangeBidirectional(testCase.version, testCase.targetYear);
    const passed = result === testCase.expected;
    
    console.log(`🧪 [TEST ${index + 1}] ${testCase.description}:`);
    console.log(`    Versión: ${testCase.version} | Año: ${testCase.targetYear}`);
    console.log(`    Resultado: ${result} | Esperado: ${testCase.expected} | ${passed ? '✅ PASS' : '❌ FAIL'}`);
    
    if (!passed) {
      console.error(`❌ [FAIL] Test ${index + 1} falló: ${testCase.description}`);
    }
  });
  
  console.log('🧪 [TEST YEAR PATTERNS] ===== FIN PRUEBAS =====');
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
  console.log('📍 [POSITION MAP] ===== INICIO MAPEO POSICIÓN =====');
  console.log('📍 [POSITION MAP] Entrada original:', position);
  console.log('📍 [POSITION MAP] Tipo de entrada:', typeof position);
  
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
  
  console.log('📍 [POSITION MAP] Mapa de posiciones disponible:', Object.keys(positionMap));
  
  const normalizedPosition = position.toLowerCase().trim();
  console.log('📍 [POSITION MAP] Posición normalizada:', normalizedPosition);
  
  const mappedPosition = positionMap[normalizedPosition] || position;
  console.log('📍 [POSITION MAP] Posición mapeada:', mappedPosition);
  
  // ✅ VERIFICAR SI SE ENCONTRÓ MAPEO
  if (positionMap[normalizedPosition]) {
    console.log('✅ [POSITION MAP] Mapeo ENCONTRADO en diccionario');
  } else {
    console.log('⚠️ [POSITION MAP] Mapeo NO encontrado, usando original');
  }
  
  console.log('📍 [POSITION MAP] ===== FIN MAPEO POSICIÓN =====');
  
  return mappedPosition;
}

router.get('/test-parser', async (req, res) => {
  const testQuery = 'amortiguador trasero corolla 2009';
  const parsed = parseNaturalQuery(testQuery);
  
  console.log('🧪 [TEST PARSER]:', JSON.stringify(parsed, null, 2));
  
  res.json({
    success: true,
    query: testQuery,
    parsed: parsed
  });
});

// Test de categorías
router.get('/test-categories', async (req, res) => {
  const categories = getValidCategoriesForProduct('amortiguador');
  
  console.log('🧪 [TEST CATEGORIES]:', categories);
  
  res.json({
    success: true,
    product: 'amortiguador',
    categories: categories
  });
});

// Test de datos
router.get('/test-data', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const totalCount = await collection.countDocuments();
    const amortiguadorCount = await collection.countDocuments({
      categoria: { $in: ['Amort CORVEN', 'Amort LIP', 'Amort SADAR'] }
    });

    res.json({
      success: true,
      totalProducts: totalCount,
      amortiguadores: amortiguadorCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
router.get('/test-pipeline', async (req, res) => {
  try {
    console.log('🧪 [TEST PIPELINE] Iniciando test específico...');
    
    // Test con tu query exacta
    const testQuery = 'amortiguador trasero corolla 2009';
    const parsedQuery = parseNaturalQuery(testQuery);
    
    console.log('🧪 [TEST PIPELINE] Query parseada:', JSON.stringify(parsedQuery, null, 2));
    
    // Construir pipeline con debug
    const pipeline = buildSearchPipeline(parsedQuery, 5, 0);
    
    console.log('🧪 [TEST PIPELINE] Pipeline construido:', JSON.stringify(pipeline, null, 2));
    
    // Ejecutar en MongoDB
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    console.log('🧪 [TEST PIPELINE] Ejecutando en MongoDB...');
    const results = await collection.aggregate(pipeline).toArray();
    
    console.log(`🧪 [TEST PIPELINE] Resultados: ${results.length}`);
    
    // Test individual de cada filtro
    console.log('🔬 [TEST INDIVIDUAL] Probando filtros por separado...');
    
    // Test 1: Solo categoría
    const categoryTest = await collection.find({
      categoria: { $in: ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'] }
    }).limit(5).toArray();
    console.log(`🔬 [TEST] Solo categoría: ${categoryTest.length} productos`);
    
    // Test 2: Solo modelo COROLLA
    const modelTest = await collection.find({
      'aplicaciones.modelo': { $regex: 'COROLLA', $options: 'i' }
    }).limit(5).toArray();
    console.log(`🔬 [TEST] Solo modelo COROLLA: ${modelTest.length} productos`);
    
    // Test 3: Solo año 2009
    const yearTest = await collection.find({
      'aplicaciones.version': { $regex: '\\(09/', $options: 'i' }
    }).limit(5).toArray();
    console.log(`🔬 [TEST] Solo año 2009: ${yearTest.length} productos`);
    
    // Test 4: Categoría + modelo
    const categoryModelTest = await collection.find({
      categoria: { $in: ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'] },
      'aplicaciones.modelo': { $regex: 'COROLLA', $options: 'i' }
    }).limit(5).toArray();
    console.log(`🔬 [TEST] Categoría + modelo: ${categoryModelTest.length} productos`);
    
    // Test 5: Todo combinado
    const allCombinedTest = await collection.find({
      categoria: { $in: ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'] },
      'aplicaciones.modelo': { $regex: 'COROLLA', $options: 'i' },
      'aplicaciones.version': { $regex: '\\(09/', $options: 'i' }
    }).limit(5).toArray();
    console.log(`🔬 [TEST] Todo combinado: ${allCombinedTest.length} productos`);
    
    // Test 6: Con posición trasero
    const positionTest = await collection.find({
      categoria: { $in: ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'] },
      'aplicaciones.modelo': { $regex: 'COROLLA', $options: 'i' },
      'aplicaciones.version': { $regex: '\\(09/', $options: 'i' },
      'detalles_tecnicos.Posición de la pieza': { $regex: 'Trasero', $options: 'i' }
    }).limit(5).toArray();
    console.log(`🔬 [TEST] Con posición trasero: ${positionTest.length} productos`);
    
    // Mostrar ejemplos de productos encontrados
    if (categoryTest.length > 0) {
      console.log('📋 [EJEMPLO] Amortiguador COROLLA encontrado:');
      const ejemplo = categoryTest.find(p => p.aplicaciones?.some(app => 
        app.modelo?.toLowerCase().includes('corolla')
      ));
      if (ejemplo) {
        console.log(`    Código: ${ejemplo.codigo}`);
        console.log(`    Categoría: ${ejemplo.categoria}`);
        console.log(`    Posición: ${ejemplo.detalles_tecnicos?.["Posición de la pieza"] || 'N/A'}`);
        const corollaApp = ejemplo.aplicaciones?.find(app => 
          app.modelo?.toLowerCase().includes('corolla')
        );
        if (corollaApp) {
          console.log(`    Aplicación: ${corollaApp.marca} ${corollaApp.modelo} ${corollaApp.version}`);
        }
      }
    }
    
    res.json({
      success: true,
      query: testQuery,
      parsedQuery: parsedQuery,
      pipelineResults: results.length,
      individualTests: {
        categoryOnly: categoryTest.length,
        modelOnly: modelTest.length,
        yearOnly: yearTest.length,
        categoryAndModel: categoryModelTest.length,
        allCombined: allCombinedTest.length,
        withPosition: positionTest.length
      },
      examples: {
        pipelineResults: results.slice(0, 2).map(r => ({
          codigo: r.codigo,
          categoria: r.categoria,
          aplicaciones: r.aplicaciones?.length || 0,
          posicion: r.detalles_tecnicos?.["Posición de la pieza"] || 'N/A'
        })),
        categoryExample: categoryTest.slice(0, 2).map(r => ({
          codigo: r.codigo,
          categoria: r.categoria,
          aplicaciones: r.aplicaciones?.map(a => `${a.marca} ${a.modelo} ${a.version}`) || []
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ [TEST PIPELINE] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});
router.get('/test-pipeline-detailed', async (req, res) => {
  try {
    console.log('🧪 [TEST DETAILED] ===== INICIANDO TEST DETALLADO =====');
    
    const testQuery = 'amortiguador trasero corolla 2009';
    console.log('🧪 [TEST DETAILED] Query de prueba:', testQuery);
    
    // Parse de la query
    const parsedQuery = parseNaturalQuery(testQuery);
    console.log('🧪 [TEST DETAILED] Query parseada:', JSON.stringify(parsedQuery, null, 2));
    
    // Construir pipeline con logs detallados
    const pipeline = buildSearchPipelineWithLogs(parsedQuery, 10, 0);
    
    // Conectar y ejecutar
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    console.log('🧪 [TEST DETAILED] ===== EJECUTANDO EN MONGODB =====');
    const results = await collection.aggregate(pipeline).toArray();
    
    console.log('🧪 [TEST DETAILED] ===== RESULTADOS =====');
    console.log(`🧪 [TEST DETAILED] Total resultados: ${results.length}`);
    
    if (results.length > 0) {
      console.log('🧪 [TEST DETAILED] Primeros resultados:');
      results.slice(0, 3).forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.codigo} - ${result.categoria}`);
        console.log(`     Posición: ${result.detalles_tecnicos?.["Posición de la pieza"] || 'N/A'}`);
        if (result.aplicaciones && result.aplicaciones.length > 0) {
          const corollaApp = result.aplicaciones.find(app => 
            app.modelo?.toLowerCase().includes('corolla')
          );
          if (corollaApp) {
            console.log(`     Aplicación COROLLA: ${corollaApp.marca} ${corollaApp.modelo} ${corollaApp.version}`);
          }
        }
      });
    } else {
      console.log('❌ [TEST DETAILED] No se encontraron resultados');
    }
    
    res.json({
      success: true,
      query: testQuery,
      parsedQuery: parsedQuery,
      results: results.length,
      examples: results.slice(0, 5).map(r => ({
        codigo: r.codigo,
        categoria: r.categoria,
        posicion: r.detalles_tecnicos?.["Posición de la pieza"] || 'N/A',
        aplicaciones: r.aplicaciones?.map(a => `${a.marca} ${a.modelo} ${a.version}`) || []
      }))
    });
    
  } catch (error) {
    console.error('❌ [TEST DETAILED] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
