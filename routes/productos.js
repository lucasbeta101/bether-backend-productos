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

// ===== CATEGORÍAS SIMPLIFICADAS =====
const CATEGORIAS = {
  "Amortiguadores": [
    "Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP",
    "Amort LIP", "Amort PRO TUNNING"
  ],
  "Pastillas de Freno": ["Pastillas CORVEN C", "Pastillas CORVEN HT", "Pastillas FERODO", "Pastillas JURID"],
  "Discos y Campanas": ["Discos y Camp HF", "Discos y Camp CORVEN"],
  "Embragues": ["Embragues CORVEN", "Embragues SADAR", "Embragues VALEO"],
  "Suspension": ["Bieletas CORVEN", "Bieletas SADAR", "Cazoletas CORVEN", "Cazoletas SADAR", "Rotulas CORVEN", "Rotulas SADAR"],
  "Direccion": ["Extremos CORVEN", "Extremos SADAR", "Axiales CORVEN", "Axiales SADAR"],
  "Otros": ["Brazos Susp CORVEN", "Brazos Susp SADAR", "Barras HD SADAR", "Homocinéticas CORVEN", "Homocinéticas SADAR"]
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
  
  const normalized = normalizeText(query);
  const words = normalized.split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 1);
  
  const result = { 
    product: null, 
    position: null, 
    year: null, 
    vehicleTerms: [], 
    isStructured: false, 
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

// 📋 METADATOS - Para inicialización del frontend
router.get('/metadatos', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const metadatos = await collection.find({}, {
      projection: {
        codigo: 1,
        categoria: 1,
        marca: 1,
        nombre: 1,
        aplicaciones: 1,
        detalles_tecnicos: 1,
        precio_lista_con_iva: 1,
        precio_numerico: 1,
        tiene_precio_valido: 1,
        imagen: 1,
        equivalencias: 1,
        _id: 0
      }
    }).toArray();

    res.json({
      success: true,
      count: metadatos.length,
      data: metadatos
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;