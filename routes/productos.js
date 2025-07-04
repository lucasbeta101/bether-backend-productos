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

function buildSearchPipelineWithLogs(parsedQuery, limit, offset) {
  console.log('🔧 [PIPELINE DEBUG] Construyendo pipeline con logs detallados...');
  console.log('📋 [PIPELINE DEBUG] Query recibida:', JSON.stringify(parsedQuery, null, 2));
  
  let matchConditions = { tiene_precio_valido: true };
  
  // Log inicial
  console.log('🏁 [PIPELINE DEBUG] Condiciones iniciales:', JSON.stringify(matchConditions, null, 2));

  if (parsedQuery.isStructured) {
    console.log('🎯 [PIPELINE DEBUG] Búsqueda estructurada detectada');
    
    // Producto/Categoría
    if (parsedQuery.product) {
      console.log(`🔍 [PIPELINE DEBUG] Procesando producto: "${parsedQuery.product}"`);
      const validCategories = getValidCategoriesForProduct(parsedQuery.product);
      console.log(`📋 [PIPELINE DEBUG] Categorías válidas:`, validCategories);
      
      if (validCategories.length > 0) {
        matchConditions.categoria = { $in: validCategories };
        console.log(`✅ [PIPELINE DEBUG] Filtro de categoría aplicado:`, matchConditions.categoria);
      } else {
        console.log(`⚠️ [PIPELINE DEBUG] No se encontraron categorías para "${parsedQuery.product}"`);
      }
    }
    
    // Posición
    if (parsedQuery.position) {
      console.log(`🔍 [PIPELINE DEBUG] Procesando posición: "${parsedQuery.position}"`);
      const mappedPosition = mapPositionForSearch(parsedQuery.position);
      console.log(`📋 [PIPELINE DEBUG] Posición mapeada: "${mappedPosition}"`);
      
      matchConditions["detalles_tecnicos.Posición de la pieza"] = { $regex: mappedPosition, $options: 'i' };
      console.log(`✅ [PIPELINE DEBUG] Filtro de posición aplicado:`, matchConditions["detalles_tecnicos.Posición de la pieza"]);
    }
    
    // Aplicaciones de vehículo
    const elemMatchAndConditions = [];
    
    if (parsedQuery.vehicleTerms && parsedQuery.vehicleTerms.length > 0) {
      console.log(`🚗 [PIPELINE DEBUG] Procesando términos de vehículo:`, parsedQuery.vehicleTerms);
      
      const vehicleConditions = parsedQuery.vehicleTerms.map(term => {
        console.log(`🔍 [PIPELINE DEBUG] Creando condición para término: "${term}"`);
        return {
          $or: [
            { "marca": { $regex: term, $options: 'i' } }, 
            { "modelo": { $regex: term, $options: 'i' } }
          ]
        };
      });
      
      elemMatchAndConditions.push(...vehicleConditions);
      console.log(`✅ [PIPELINE DEBUG] Condiciones de vehículo agregadas:`, vehicleConditions.length);
    }
    
    // Año
    if (parsedQuery.year) {
      console.log(`📅 [PIPELINE DEBUG] Procesando año: "${parsedQuery.year}"`);
      const yearRegex = `(${parsedQuery.year}|${parsedQuery.year.slice(-2)})`;
      console.log(`📅 [PIPELINE DEBUG] Regex de año: "${yearRegex}"`);
      
      elemMatchAndConditions.push({ 
        'version': { $regex: yearRegex, $options: 'i' } 
      });
      console.log(`✅ [PIPELINE DEBUG] Condición de año agregada`);
    }
    
    // Aplicar condiciones de aplicaciones
    if (elemMatchAndConditions.length > 0) {
      matchConditions.aplicaciones = { 
        $elemMatch: { $and: elemMatchAndConditions } 
      };
      console.log(`✅ [PIPELINE DEBUG] Filtro de aplicaciones aplicado con ${elemMatchAndConditions.length} condiciones`);
      console.log(`📋 [PIPELINE DEBUG] Condiciones completas:`, JSON.stringify(elemMatchAndConditions, null, 2));
    }
    
  } else {
    console.log('🔍 [PIPELINE DEBUG] Búsqueda no estructurada - usando fallback');
    
    // Fallback para búsqueda no estructurada
    const freeText = parsedQuery.freeText || "";
    const keywords = normalizeText(freeText).split(' ').filter(k => k.length > 0);
    
    console.log(`🔍 [PIPELINE DEBUG] Texto libre: "${freeText}"`);
    console.log(`🔍 [PIPELINE DEBUG] Keywords extraídas:`, keywords);
    
    if (keywords.length > 0) {
      matchConditions.$and = keywords.map(word => {
        console.log(`🔍 [PIPELINE DEBUG] Creando condición OR para: "${word}"`);
        return {
          $or: [
            { codigo: { $regex: word, $options: 'i' } },
            { nombre: { $regex: word, $options: 'i' } },
            { "aplicaciones.marca": { $regex: word, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: word, $options: 'i' } }
          ]
        };
      });
      console.log(`✅ [PIPELINE DEBUG] ${keywords.length} condiciones de texto libre aplicadas`);
    }
  }

  console.log('🚨 [PIPELINE DEBUG] CONSULTA FINAL $match:', JSON.stringify(matchConditions, null, 2));
  
  // Construir pipeline
  const pipeline = [
    { $match: matchConditions },
    { $sort: { codigo: 1 } }
  ];

  if (offset > 0) {
    pipeline.push({ $skip: offset });
    console.log(`⏭️ [PIPELINE DEBUG] Skip agregado: ${offset}`);
  }

  pipeline.push({ $limit: limit });
  console.log(`📏 [PIPELINE DEBUG] Limit agregado: ${limit}`);
  
  pipeline.push({ $project: { _id: 0 } });
  console.log(`📋 [PIPELINE DEBUG] Projection agregada`);

  console.log(`🏗️ [PIPELINE DEBUG] Pipeline final con ${pipeline.length} etapas`);
  console.log(`📋 [PIPELINE DEBUG] Pipeline completo:`, JSON.stringify(pipeline, null, 2));

  return pipeline;
}
// ===== FUNCIÓN AUXILIAR PARA VERIFICAR SI UN AÑO ESTÁ EN RANGO BIDIRECCIONAL =====

function checkYearInRangeBidirectional(versionString, targetYear) {
  console.log('📅 [YEAR CHECK BIDIRECTIONAL] Verificando:', versionString, 'para año', targetYear);
  
  if (!versionString || !targetYear) return false;
  
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


function getValidCategoriesForProductEnhanced(product) {
  const categoryMap = {
    // Amortiguadores - todas las variantes
    'amortiguador': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
    'amortiguadores': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
    'amort': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'],
    
    // Pastillas de freno
    'pastilla': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'pastillas': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'freno': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C', 'Discos y Camp CORVEN', 'Discos y Camp HF'],
    'frenos': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C', 'Discos y Camp CORVEN', 'Discos y Camp HF'],
    
    // Discos y campanas
    'disco': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'discos': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'campana': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'campanas': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    
    // Cazoletas
    'cazoleta': ['Cazoletas CORVEN', 'Cazoletas SADAR'],
    'cazoletas': ['Cazoletas CORVEN', 'Cazoletas SADAR'],
    
    // Bieletas
    'bieleta': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'bieletas': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'biela': ['Bieletas CORVEN', 'Bieletas SADAR'],
    'bielas': ['Bieletas CORVEN', 'Bieletas SADAR'],
    
    // Rótulas
    'rotula': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'rotulas': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'rótula': ['Rotulas CORVEN', 'Rotulas SADAR'],
    'rótulas': ['Rotulas CORVEN', 'Rotulas SADAR'],
    
    // Embragues
    'embrague': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    'embragues': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    'clutch': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    
    // Brazos
    'brazo': ['Brazos Susp CORVEN', 'Brazos Susp SADAR'],
    'brazos': ['Brazos Susp CORVEN', 'Brazos Susp SADAR'],
    
    // Extremos
    'extremo': ['Extremos CORVEN', 'Extremos SADAR'],
    'extremos': ['Extremos CORVEN', 'Extremos SADAR'],
    
    // Axiales
    'axial': ['Axiales CORVEN', 'Axiales SADAR'],
    'axiales': ['Axiales CORVEN', 'Axiales SADAR'],
    
    // Homocinéticas
    'homocinetica': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'homocinéticas': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'homocinética': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'junta': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    'juntas': ['Homocinéticas CORVEN', 'Homocinéticas SADAR'],
    
    // Rodamientos
    'rodamiento': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'rodamientos': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'ruleman': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    'rulemanes': ['Rodamientos CORVEN', 'Rodamientos SADAR'],
    
    // Mazas
    'maza': ['Mazas CORVEN', 'Mazas HF'],
    'mazas': ['Mazas CORVEN', 'Mazas HF'],
    'buje': ['Mazas CORVEN', 'Mazas HF'],
    'bujes': ['Mazas CORVEN', 'Mazas HF'],
    
    // Semiejes
    'semieje': ['Semiejes CORVEN'],
    'semiejes': ['Semiejes CORVEN'],
    'eje': ['Semiejes CORVEN'],
    'ejes': ['Semiejes CORVEN'],
    
    // Soportes
    'soporte': ['Soporte Motor CORVEN'],
    'soportes': ['Soporte Motor CORVEN'],
    
    // Parrillas
    'parrilla': ['Parrillas CORVEN', 'Parrillas SADAR'],
    'parrillas': ['Parrillas CORVEN', 'Parrillas SADAR'],
    
    // Barras
    'barra': ['Barras HD SADAR'],
    'barras': ['Barras HD SADAR'],
    
    // Cajas y bombas
    'caja': ['Cajas Mec CORVEN', 'Cajas Hid CORVEN'],
    'cajas': ['Cajas Mec CORVEN', 'Cajas Hid CORVEN'],
    'bomba': ['Bombas Hid CORVEN'],
    'bombas': ['Bombas Hid CORVEN'],
    
    // Suspensión
    'suspension': ['Susp Neumática SADAR'],
    'suspensión': ['Susp Neumática SADAR'],
    'neumática': ['Susp Neumática SADAR'],
    'neumatica': ['Susp Neumática SADAR']
  };
  
  const normalizedProduct = normalizeText(product).toLowerCase().trim();
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
  };
  const normalizedPosition = normalizeText(position);
  return positionMap[normalizedPosition] || position;
}

function parseNaturalQuery(query) {
  console.log('🧐 [Parser v5] Iniciando parseo para:', query);
  const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'auto'];
  const productKeywords = ['amortiguador', 'pastilla', 'freno', 'disco', 'cazoleta', 'bieleta', 'rotula', 'embrague', 'brazo', 'extremo', 'axial', 'homocinetica', 'rodamiento', 'maza', 'semieje', 'soporte', 'parrilla', 'barra', 'caja', 'bomba', 'suspension'];
  const positionKeywords = ['delantero', 'trasero', 'izquierdo', 'derecho', 'superior', 'inferior', 'del', 'pos', 'izq', 'der', 'sup', 'inf'];
  
  const normalized = normalizeText(query);
  const words = normalized.split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 1);
  
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
  
  console.log('🧐 [Parser v5] Resultado:', result);
  return result;
}

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


router.get('/metadatos', async (req, res) => {
  try {
    console.log('📋 [METADATOS] Iniciando carga de metadatos...');
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // ✅ PROYECCIÓN CORREGIDA: Incluir TODOS los campos de precio
    const metadatos = await collection.find({}, {
      projection: {
        codigo: 1,
        categoria: 1,
        marca: 1,
        nombre: 1,
        aplicaciones: 1,
        "detalles_tecnicos": 1, // Cambio: incluir TODO detalles_tecnicos
        // 🆕 TODOS LOS CAMPOS DE PRECIO POSIBLES
        precio_lista_con_iva: 1,
        precio_numerico: 1,
        tiene_precio_valido: 1,
        precio: 1,
        price: 1,
        precio_base: 1,
        precio_lista: 1,
        valor: 1,
        imagen: 1,
        url: 1,
        equivalencias: 1,
        _id: 0 // Excluir _id para reducir tamaño
      }
    }).toArray();

    console.log(`✅ [METADATOS] ${metadatos.length} metadatos cargados`);

    // 🔍 DEBUG MEJORADO: Verificar que los primeros productos tengan precios
    if (metadatos.length > 0) {
      console.log('🔍 [METADATOS] Verificando precios en primeros 3 productos:');
      metadatos.slice(0, 3).forEach((producto, index) => {
        console.log(`  Producto ${index + 1}:`, {
          codigo: producto.codigo,
          nombre: producto.nombre,
          precio_lista_con_iva: producto.precio_lista_con_iva,
          precio_numerico: producto.precio_numerico,
          tiene_precio_valido: producto.tiene_precio_valido,
          todosLosCampos: Object.keys(producto) // Ver qué campos están llegando
        });
      });

      // Contar productos con precio válido
      const conPrecio = metadatos.filter(p => p.tiene_precio_valido === true).length;
      const conPrecioNumerico = metadatos.filter(p => p.precio_numerico && p.precio_numerico > 0).length;
      console.log(`📊 [METADATOS] ${conPrecio} de ${metadatos.length} productos tienen tiene_precio_valido=true`);
      console.log(`📊 [METADATOS] ${conPrecioNumerico} de ${metadatos.length} productos tienen precio_numerico > 0`);
      
      if (conPrecio === 0 && conPrecioNumerico === 0) {
        console.warn('⚠️ NINGÚN producto tiene precio válido. Verificar estructura de datos en MongoDB.');
        
        // DEBUG adicional: Ver un producto completo
        console.log('🔬 [DEBUG] Producto completo de ejemplo:', JSON.stringify(metadatos[0], null, 2));
      }
    }

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

router.get('/productos-validos', async (req, res) => {
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

    console.log('📦 [PRODUCTOS-VALIDOS] Parámetros:', {
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

    // 🆕 SOLO PRODUCTOS CON PRECIO VÁLIDO
    filtros.tiene_precio_valido = true;

    console.log('🔍 [PRODUCTOS-VALIDOS] Filtros construidos:', JSON.stringify(filtros, null, 2));

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

    console.log(`✅ [PRODUCTOS-VALIDOS] ${productos.length} productos encontrados (${totalProductos} total)`);

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
    console.error('❌ [PRODUCTOS-VALIDOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al obtener productos válidos'
    });
  }
});

router.get('/debug/precios', async (req, res) => {
  try {
    console.log('🔍 [DEBUG PRECIOS] Analizando estructura...');
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Obtener muestra de productos
    const muestra = await collection.find({}).limit(10).toArray();

    // Analizar campos de precio
    const analisis = {
      totalProductos: await collection.countDocuments(),
      conPrecioValido: await collection.countDocuments({ tiene_precio_valido: true }),
      sinPrecioValido: await collection.countDocuments({ tiene_precio_valido: false }),
      conPrecioNumerico: await collection.countDocuments({ precio_numerico: { $gt: 0 } }),
      muestraProductos: muestra.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        precio_lista_con_iva: p.precio_lista_con_iva,
        precio_numerico: p.precio_numerico,
        tiene_precio_valido: p.tiene_precio_valido,
        todosLosCampos: Object.keys(p)
      }))
    };

    console.log('📊 [DEBUG PRECIOS] Análisis completado:', {
      total: analisis.totalProductos,
      conPrecio: analisis.conPrecioValido,
      sinPrecio: analisis.sinPrecioValido,
      conNumerico: analisis.conPrecioNumerico
    });

    res.json({
      success: true,
      analisis: analisis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [DEBUG PRECIOS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
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
router.get('/productos-por-aplicacion', async (req, res) => {
  try {
    const { marca, modelo, version, categoria, limit = 20 } = req.query;

    if (!marca || !modelo) {
      return res.status(400).json({
        success: false,
        error: 'Marca y modelo son requeridos'
      });
    }

    console.log('🚗 [APLICACIÓN] Buscando productos para:', { marca, modelo, version, categoria });

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtros
    const filtros = {
      tiene_precio_valido: true,
      aplicaciones: {
        $elemMatch: {
          marca: { $regex: marca, $options: 'i' },
          modelo: { $regex: modelo, $options: 'i' }
        }
      }
    };

    // Agregar filtro de versión si existe
    if (version) {
      filtros.aplicaciones.$elemMatch.version = { $regex: version, $options: 'i' };
    }

    // Agregar filtro de categoría si existe
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    const productos = await collection
      .find(filtros)
      .limit(parseInt(limit))
      .sort({ codigo: 1 })
      .toArray();

    console.log(`✅ [APLICACIÓN] ${productos.length} productos encontrados`);

    res.json({
      success: true,
      data: productos,
      count: productos.length,
      filters: { marca, modelo, version, categoria }
    });

  } catch (error) {
    console.error('❌ [APLICACIÓN] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/busqueda-avanzada', async (req, res) => {
  try {
    const {
      producto,
      marca,
      modelo,
      year,
      posicion,
      precio_min,
      precio_max,
      categoria,
      limit = 20,
      offset = 0,
      ordenar = 'codigo'
    } = req.query;

    console.log('🔍 [BÚSQUEDA AVANZADA] Parámetros:', req.query);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Construir filtros complejos
    const filtros = { tiene_precio_valido: true };

    // Filtro por producto/categoría
    if (producto) {
      const validCategories = getValidCategoriesForProductEnhanced(producto);
      if (validCategories.length > 0) {
        filtros.categoria = { $in: validCategories };
      }
    }

    // Filtro por categoría específica
    if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        filtros.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        filtros.categoria = categoria;
      }
    }

    // Filtro por posición
    if (posicion) {
      const mappedPosition = mapPositionForSearch(posicion);
      filtros["detalles_tecnicos.Posición de la pieza"] = { $regex: mappedPosition, $options: 'i' };
    }

    // Filtros de aplicación
    const elemMatchConditions = [];
    if (marca) {
      elemMatchConditions.push({ "marca": { $regex: marca, $options: 'i' } });
    }
    if (modelo) {
      elemMatchConditions.push({ "modelo": { $regex: modelo, $options: 'i' } });
    }
    if (year) {
      const yearRegex = `(${year}|${year.slice(-2)})`;
      elemMatchConditions.push({ 'version': { $regex: yearRegex, $options: 'i' } });
    }

    if (elemMatchConditions.length > 0) {
      filtros.aplicaciones = { $elemMatch: { $and: elemMatchConditions } };
    }

    // Filtros de precio
    if (precio_min || precio_max) {
      filtros.precio_numerico = {};
      if (precio_min) filtros.precio_numerico.$gte = parseFloat(precio_min);
      if (precio_max) filtros.precio_numerico.$lte = parseFloat(precio_max);
    }

    console.log('🔍 [BÚSQUEDA AVANZADA] Filtros:', JSON.stringify(filtros, null, 2));

    // Pipeline de agregación
    const pipeline = [
      { $match: filtros },
      { $sort: { [ordenar]: 1 } }
    ];

    if (parseInt(offset) > 0) {
      pipeline.push({ $skip: parseInt(offset) });
    }

    pipeline.push({ $limit: parseInt(limit) });
    pipeline.push({ $project: { _id: 0 } });

    const productos = await collection.aggregate(pipeline).toArray();

    console.log(`✅ [BÚSQUEDA AVANZADA] ${productos.length} productos encontrados`);

    res.json({
      success: true,
      data: productos,
      count: productos.length,
      filters: req.query,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [BÚSQUEDA AVANZADA] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/estadisticas-busqueda', async (req, res) => {
  try {
    console.log('📊 [ESTADÍSTICAS] Generando estadísticas...');

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Agregación para estadísticas
    const stats = await collection.aggregate([
      {
        $facet: {
          totalProductos: [
            { $count: "count" }
          ],
          productosConPrecio: [
            { $match: { tiene_precio_valido: true } },
            { $count: "count" }
          ],
          categorias: [
            { $group: { _id: "$categoria", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          marcasPopulares: [
            { $unwind: "$aplicaciones" },
            { $group: { _id: "$aplicaciones.marca", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          modelosPopulares: [
            { $unwind: "$aplicaciones" },
            { $group: { _id: "$aplicaciones.modelo", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ]
        }
      }
    ]).toArray();

    const estadisticas = stats[0];

    console.log('✅ [ESTADÍSTICAS] Estadísticas generadas');

    res.json({
      success: true,
      estadisticas: {
        totalProductos: estadisticas.totalProductos[0]?.count || 0,
        productosConPrecio: estadisticas.productosConPrecio[0]?.count || 0,
        categorias: estadisticas.categorias,
        marcasPopulares: estadisticas.marcasPopulares,
        modelosPopulares: estadisticas.modelosPopulares
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [ESTADÍSTICAS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/validar-compatibilidad', async (req, res) => {
  try {
    const { codigo, year } = req.query;

    if (!codigo || !year) {
      return res.status(400).json({
        success: false,
        error: 'Código y año son requeridos'
      });
    }

    console.log('🔧 [COMPATIBILIDAD] Validando:', codigo, 'para año', year);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const producto = await collection.findOne({ codigo: codigo });

    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    const targetYear = parseInt(year);
    let isCompatible = false;
    let compatibleVersions = [];

    if (producto.aplicaciones) {
      producto.aplicaciones.forEach(app => {
        if (app.version) {
          const versionCompatible = checkYearInRangeBidirectional(app.version, targetYear);
          if (versionCompatible) {
            isCompatible = true;
            compatibleVersions.push({
              marca: app.marca,
              modelo: app.modelo,
              version: app.version
            });
          }
        }
      });
    }

    console.log(`✅ [COMPATIBILIDAD] ${codigo} es ${isCompatible ? 'compatible' : 'no compatible'} con ${year}`);

    res.json({
      success: true,
      codigo: codigo,
      year: targetYear,
      isCompatible: isCompatible,
      compatibleVersions: compatibleVersions,
      totalVersions: producto.aplicaciones?.length || 0
    });

  } catch (error) {
    console.error('❌ [COMPATIBILIDAD] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/autocompletado', async (req, res) => {
  try {
    const { q, tipo = 'general', limit = 8 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        suggestions: []
      });
    }

    console.log('💡 [AUTOCOMPLETADO] Query:', q, 'Tipo:', tipo);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const normalizedQuery = normalizeText(q);
    const suggestions = new Set();

    switch (tipo) {
      case 'codigo':
        // Sugerencias de códigos
        const codigoMatches = await collection.find(
          { codigo: { $regex: normalizedQuery, $options: 'i' } },
          { projection: { codigo: 1, _id: 0 }, limit: parseInt(limit) }
        ).toArray();
        codigoMatches.forEach(p => suggestions.add(p.codigo));
        break;

      case 'vehiculo':
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
          marcas.slice(0, 4).forEach(marca => {
            if (marca.toLowerCase().includes(normalizedQuery)) {
              suggestions.add(marca);
            }
          });
          modelos.slice(0, 4).forEach(modelo => {
            if (modelo.toLowerCase().includes(normalizedQuery)) {
              suggestions.add(modelo);
            }
          });
        }
        break;

      default:
        // Sugerencias generales (códigos + vehículos + productos)
        const generalMatches = await collection.aggregate([
          {
            $facet: {
              codigos: [
                { $match: { codigo: { $regex: normalizedQuery, $options: 'i' } } },
                { $project: { codigo: 1, _id: 0 } },
                { $limit: 3 }
              ],
              vehiculos: [
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
              ],
              productos: [
                { $match: { nombre: { $regex: normalizedQuery, $options: 'i' } } },
                { $project: { nombre: 1, _id: 0 } },
                { $limit: 2 }
              ]
            }
          }
        ]).toArray();

        const general = generalMatches[0];

        // Agregar códigos
        general.codigos.forEach(p => suggestions.add(p.codigo));

        // Agregar vehículos
        if (general.vehiculos.length > 0) {
          const { marcas, modelos } = general.vehiculos[0];
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

        // Agregar productos
        general.productos.forEach(p => {
          const words = p.nombre.split(' ').slice(0, 3).join(' ');
          suggestions.add(words);
        });
        break;
    }

    const finalSuggestions = Array.from(suggestions).slice(0, parseInt(limit));

    console.log(`💡 [AUTOCOMPLETADO] ${finalSuggestions.length} sugerencias generadas`);

    res.json({
      success: true,
      query: q,
      tipo: tipo,
      suggestions: finalSuggestions,
      count: finalSuggestions.length
    });

  } catch (error) {
    console.error('❌ [AUTOCOMPLETADO] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/productos-similares/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    const { limit = 5 } = req.query;

    console.log('🏷️ [SIMILARES] Buscando productos similares a:', codigo);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Obtener producto original
    const producto = await collection.findOne({ codigo: codigo });
    
    if (!producto) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    // Buscar productos similares por categoría y aplicaciones
    const filtros = {
      codigo: { $ne: codigo }, // Excluir el producto actual
      categoria: producto.categoria,
      tiene_precio_valido: true
    };

    // Si el producto tiene aplicaciones, buscar productos compatibles
    if (producto.aplicaciones && producto.aplicaciones.length > 0) {
      const marcas = [...new Set(producto.aplicaciones.map(app => app.marca))];
      const modelos = [...new Set(producto.aplicaciones.map(app => app.modelo))];
      
      filtros.$or = [
        { "aplicaciones.marca": { $in: marcas } },
        { "aplicaciones.modelo": { $in: modelos } }
      ];
    }

    const similares = await collection
      .find(filtros)
      .limit(parseInt(limit))
      .sort({ codigo: 1 })
      .project({ _id: 0 })
      .toArray();

    console.log(`✅ [SIMILARES] ${similares.length} productos similares encontrados`);

    res.json({
      success: true,
      codigo: codigo,
      categoria: producto.categoria,
      similares: similares,
      count: similares.length
    });

  } catch (error) {
    console.error('❌ [SIMILARES] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/test-pipeline-detallado', async (req, res) => {
  try {
    console.log('🧪 [TEST DETALLADO] ===== INICIANDO TEST COMPLETO =====');
    
    const testQuery = req.query.q || 'amortiguador trasero corolla 2009';
    console.log('🧪 [TEST DETALLADO] Query de prueba:', testQuery);
    
    // Parse de la query
    const parsedQuery = parseNaturalQuery(testQuery);
    console.log('🧪 [TEST DETALLADO] Query parseada:', JSON.stringify(parsedQuery, null, 2));
    
    // Construir pipeline con logs detallados
    const pipeline = buildSearchPipelineWithLogs(parsedQuery, 10, 0);
    
    // Conectar y ejecutar
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    console.log('🧪 [TEST DETALLADO] ===== EJECUTANDO EN MONGODB =====');
    const startTime = Date.now();
    const results = await collection.aggregate(pipeline).toArray();
    const executionTime = Date.now() - startTime;
    
    console.log('🧪 [TEST DETALLADO] ===== RESULTADOS =====');
    console.log(`🧪 [TEST DETALLADO] Total resultados: ${results.length}`);
    console.log(`🧪 [TEST DETALLADO] Tiempo de ejecución: ${executionTime}ms`);
    
    if (results.length > 0) {
      console.log('🧪 [TEST DETALLADO] Primeros resultados:');
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
      console.log('❌ [TEST DETALLADO] No se encontraron resultados');
      
      // Tests individuales para debugging
      console.log('🔬 [DEBUG] Ejecutando tests individuales...');
      
      // Test 1: Solo categoría
      const categoryTest = await collection.find({
        categoria: { $in: ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING'] }
      }).limit(3).toArray();
      console.log(`🔬 [DEBUG] Solo categoría amortiguador: ${categoryTest.length} productos`);
      
      // Test 2: Solo modelo COROLLA
      const modelTest = await collection.find({
        'aplicaciones.modelo': { $regex: 'COROLLA', $options: 'i' }
      }).limit(3).toArray();
      console.log(`🔬 [DEBUG] Solo modelo COROLLA: ${modelTest.length} productos`);
      
      // Test 3: Solo año 2009
      const yearTest = await collection.find({
        'aplicaciones.version': { $regex: '(2009|09)', $options: 'i' }
      }).limit(3).toArray();
      console.log(`🔬 [DEBUG] Solo año 2009: ${yearTest.length} productos`);
    }
    
    res.json({
      success: true,
      query: testQuery,
      parsedQuery: parsedQuery,
      pipeline: pipeline,
      results: results.length,
      executionTime: executionTime,
      examples: results.slice(0, 5).map(r => ({
        codigo: r.codigo,
        categoria: r.categoria,
        posicion: r.detalles_tecnicos?.["Posición de la pieza"] || 'N/A',
        aplicaciones: r.aplicaciones?.map(a => `${a.marca} ${a.modelo} ${a.version}`) || []
      })),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [TEST DETALLADO] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});
router.post('/reindexar', async (req, res) => {
  try {
    console.log('🔧 [REINDEXAR] Iniciando proceso de reindexación...');
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Crear índices para mejorar performance
    const indices = [
      { codigo: 1 },
      { categoria: 1 },
      { tiene_precio_valido: 1 },
      { "aplicaciones.marca": 1 },
      { "aplicaciones.modelo": 1 },
      { "aplicaciones.version": 1 },
      { "detalles_tecnicos.Posición de la pieza": 1 },
      { nombre: "text", codigo: "text" } // Índice de texto para búsqueda
    ];
    
    console.log('🔧 [REINDEXAR] Creando índices...');
    
    for (const indice of indices) {
      try {
        await collection.createIndex(indice);
        console.log(`✅ [REINDEXAR] Índice creado:`, indice);
      } catch (error) {
        console.log(`⚠️ [REINDEXAR] Índice ya existe o error:`, indice, error.message);
      }
    }
    
    // Estadísticas después de reindexar
    const stats = await collection.stats();
    const totalDocs = await collection.countDocuments();
    const docsConPrecio = await collection.countDocuments({ tiene_precio_valido: true });
    
    console.log('✅ [REINDEXAR] Reindexación completada');
    
    res.json({
      success: true,
      message: 'Reindexación completada exitosamente',
      estadisticas: {
        totalDocumentos: totalDocs,
        documentosConPrecio: docsConPrecio,
        tamanioColeccion: stats.size,
        indicesCreados: indices.length
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [REINDEXAR] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/metricas-rendimiento', async (req, res) => {
  try {
    console.log('📈 [MÉTRICAS] Obteniendo métricas de rendimiento...');
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    const startTime = Date.now();
    
    // Test de consultas comunes
    const tests = {
      consultaSimple: null,
      consultaPorCodigo: null,
      consultaPorCategoria: null,
      consultaPorAplicacion: null,
      consultaCompleja: null
    };
    
    // Test 1: Consulta simple
    const start1 = Date.now();
    await collection.findOne();
    tests.consultaSimple = Date.now() - start1;
    
    // Test 2: Consulta por código
    const start2 = Date.now();
    await collection.findOne({ codigo: "10001" });
    tests.consultaPorCodigo = Date.now() - start2;
    
    // Test 3: Consulta por categoría
    const start3 = Date.now();
    await collection.find({ categoria: "Amort CORVEN" }).limit(10).toArray();
    tests.consultaPorCategoria = Date.now() - start3;
    
    // Test 4: Consulta por aplicación
    const start4 = Date.now();
    await collection.find({ "aplicaciones.marca": "FORD" }).limit(10).toArray();
    tests.consultaPorAplicacion = Date.now() - start4;
    
    // Test 5: Consulta compleja
    const start5 = Date.now();
    await collection.find({
      categoria: { $in: ["Amort CORVEN", "Amort SADAR"] },
      "aplicaciones.marca": "FORD",
      tiene_precio_valido: true
    }).limit(10).toArray();
    tests.consultaCompleja = Date.now() - start5;
    
    const totalTime = Date.now() - startTime;
    
    // Obtener estadísticas de la colección
    const stats = await db.runCommand({ collStats: COLLECTION_NAME });
    
    console.log('✅ [MÉTRICAS] Métricas obtenidas');
    
    res.json({
      success: true,
      metricas: {
        tiempoTotal: totalTime,
        testIndividuales: tests,
        estadisticasColeccion: {
          documentos: stats.count,
          tamanioPromedio: Math.round(stats.avgObjSize),
          tamanioTotal: stats.size,
          indices: stats.nindexes
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [MÉTRICAS] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
router.get('/busqueda-texto', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query requerida (mínimo 2 caracteres)'
      });
    }
    
    console.log('🔍 [TEXTO] Búsqueda por texto completo:', q);
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Búsqueda usando índice de texto
    const results = await collection
      .find(
        { 
          $text: { $search: q },
          tiene_precio_valido: true 
        },
        { 
          score: { $meta: "textScore" } 
        }
      )
      .sort({ score: { $meta: "textScore" } })
      .limit(parseInt(limit))
      .toArray();
    
    console.log(`✅ [TEXTO] ${results.length} resultados encontrados`);
    
    res.json({
      success: true,
      query: q,
      results: results,
      count: results.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [TEXTO] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

console.log('✅ [BACKEND] Funciones de búsqueda avanzada agregadas exitosamente');
console.log('🚀 [BACKEND] Endpoints disponibles:');
console.log('   - GET /productos-por-aplicacion');
console.log('   - GET /busqueda-avanzada'); 
console.log('   - GET /estadisticas-busqueda');
console.log('   - GET /validar-compatibilidad');
console.log('   - GET /autocompletado');
console.log('   - GET /productos-similares/:codigo');
console.log('   - GET /test-pipeline-detallado');
console.log('   - POST /reindexar');
console.log('   - GET /metricas-rendimiento');
console.log('   - GET /busqueda-texto');
module.exports = router;