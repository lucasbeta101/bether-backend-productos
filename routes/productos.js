const express = require('express');
const router = express.Router();
const { MongoClient, ServerApiVersion } = require('mongodb');
const ExcelJS = require('exceljs');

// ===== CONFIGURACIÓN MONGODB =====
const MONGODB_URI = process.env.MONGODB_URI;
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
const GRUPOS_CATEGORIAS = {
  "suspension-direccion": [
    "Amortiguadores", "Barras", "Bieletas", "Brazos Suspension", "Cazoletas",
    "Discos y Campanas", "Extremos", "Axiales", "Homocinéticas", "Parrillas",
    "Pastillas de Freno", "Rótulas", "Embragues", "Cajas y Bombas", "Rodamientos",
    "Mazas", "Semiejes", "Soportes Motor", "Suspensión Neumática", "CTR", "FTE",
    "Gas Spring Stabilus", "Otros"
  ],
  "frenos-embrague": [
    "Cilindros de Rueda y Componentes", "LPR", "Bombas de Freno", "Bombas de Embrague",
    "Bombines de Embrague", "Mordazas y Pistones", "Kits de Reparación Generales",
    "Flexibles de Freno", "Válvulas Hidráulicas", "Purga y Depósitos",
    "Bombas de vacío", "Guardapolvos y Sellos", "Varios", "Pistones Servo Freno"
  ],
  "yokomitsu": [
    "Parrillas Suspensión", "Cremalleras", "Amortiguadores YK", "Extremos YK",
    "Bombas Hidráulicas", "Bieletas YK", "Axiales YK", "Rótulas YK",
    "Homocínéticas YK", "Semiejes YK", "Mazas de Rueda", "Depósitos",
    "Bomba combustible", "Electroventilador"
  ],
  "carroceria": [
    "Paragolpes", "Guardabarros", "Puertas", "Rejilla Parrilla", "Marco Cubre Faro",
    "Capot", "Pasa Ruedas", "Portón Trasero", "Molduras"
  ]
};

// 🆕 FUNCIÓN PARA OBTENER CATEGORÍAS DE UN GRUPO
function getCategoriasPorGrupo(grupo) {
  if (!grupo || !GRUPOS_CATEGORIAS[grupo]) {
    return null;
  }

  const categoriasGrupo = GRUPOS_CATEGORIAS[grupo];
  const subcategoriasGrupo = [];

  // Extraer todas las subcategorías del grupo
  categoriasGrupo.forEach(categoria => {
    if (CATEGORIAS[categoria]) {
      subcategoriasGrupo.push(...CATEGORIAS[categoria]);
    } else {
      // Si no es una categoría principal, agregarla directamente
      subcategoriasGrupo.push(categoria);
    }
  });

  return subcategoriasGrupo;
}
const CATEGORIAS = {
  // --- CATEGORÍAS EXISTENTES (NO MODIFICADAS) ---
  "Amortiguadores": [
    "Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP",
    "Amort LIP", "Amort PRO TUNNING"
  ],
  "Barras": ["Barras HD SADAR"],
  "Bieletas": ["Bieletas CORVEN", "Bieletas SADAR"],
  "Brazos Suspension": ["Brazos Susp CORVEN", "Brazos Susp SADAR",],
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
  "Otros": ["Otros"],

  // --- NUEVAS CATEGORÍAS AGREGADAS ---
  "Cilindros de Rueda y Componentes": [
    "CILINDRO RUEDA",
    "PISTON CILINDRO RUEDA",
    "CUBETA CILINDRO RUEDA",
    "GUARDAPOLVO CILINDRO RUEDA (1)"
  ],
  "Bombas de Freno": [
    "BOMBA FRENO",
    "CUBETA PRIMARIA BOMBA FRENO",
    "CUBETA SECUNDARIA BOMBA FRENO",
    "Kit Reparación BOMBA FRENO"
  ],
  "Bombas de Embrague": [
    "BOMBA EMBRAGUE",
    "Kit Reparación BOMBA EMBRAGUE"
  ],
  "Bombines de Embrague": [
    "BOMBIN EMBRAGUE",
    "Kit Reparación BOMBIN EMBRAGUE"
  ],
  "Mordazas y Pistones": [
    "PISTON MORDAZA",
    "KIT MORDAZA",
    "Kit Reparación MORDAZA",
    "PISTON AUTORREGULABLE"
  ],
  "Kits de Reparación Generales": [
    "Kit Reparación Cilindro",
    "Kit Reparación Servo Freno",
    "KIT PERNOS",
    "KIT BUJES"
  ],
  "Flexibles de Freno": [
    "FLEXIBLE"
  ],
  "Válvulas Hidráulicas": [
    "VALVULA LIMITADORA",
    "VALVULA RETENCION",
    "VALVULA EQUALIZADORA",
    "VALVULA CONTROL",
    "VALVULA VACIO",
    "ASIENTO VALVULA",
    "CUERPO VALVULA"
  ],
  "Purga y Depósitos": [
    "PURGADORES",
    "DEPOSITO LIQUIDO"
  ],
  "Bombas de vacío": [
    "BOMBA VACIO"
  ],
  "Guardapolvos y Sellos": [
    "GUARDAPOLVO RUEDA",
    "GUARDAPOLVO BOMBIN",
    "GUARDAPOLVO FUELLE",
    "SELLOS"
  ],
  "LPR": ["LPR"],
  "Varios": [
    "VARIOS"
  ],
  "Pistones Servo Freno": [
    "PISTON SERVOFRENO"
  ],
  "Parrillas Suspensión": ["Parrilla suspensión"],
  "Cremalleras": ["Cremallera"],
  "Amortiguadores YK": ["Amortiguadores YK"],
  "Extremos YK": ["Extremos YK"],
  "Bombas Hidráulicas": ["Bomba hidraulica"],
  "Bieletas YK": ["Bieleta"],
  "Axiales YK": ["Axialprecap"],
  "Rótulas YK": ["Rotula"],
  "Homocínéticas YK": ["Homocinética"],
  "Semiejes YK": ["Semieje"],
  "Mazas de Rueda": ["Maza de Rueda"],
  "Depósitos": ["Depósito de Agua"],
  "Bomba combustible": ["Bomba combustible"],
  "Electroventilador": ["Electroventilador"],
  "Paragolpes": ["Paragolpes"],
  "Guardabarros": ["Guardabarros"],
  "Puertas": ["Puertas"],
  "Rejilla Parrilla": ["Rejilla parrilla"],
  "Marco Cubre Faro": ["Marco cubre faro"],
  "Capot": ["Capot"],
  "Pasa Ruedas": ["Pasa Ruedas"],
  "Portón Trasero": ["Portón trasero"],
  "Molduras": [
    "Moldura de paragolpe",
    "Moldura de rejilla parrilla",
    "Moldura de capot"
  ]

};


// ===== FUNCIONES AUXILIARES SIMPLES =====
function normalizeText(text) {
  if (!text) return '';
  return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\/]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

function getValidCategoriesForProduct(product) {
  const categoryMap = {
    'amortiguador': ['Amort CORVEN', 'Amort LIP', 'Amort SADAR', 'Amort SUPER PICKUP', 'Amort PRO TUNNING', 'Amortiguadores'],
    'pastilla': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'pastillas de freno': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C'],
    'freno': ['Pastillas FERODO', 'Pastillas JURID', 'Pastillas CORVEN HT', 'Pastillas CORVEN C', 'Discos y Camp CORVEN', 'Discos y Camp HF'],
    'disco': ['Discos y Camp CORVEN', 'Discos y Camp HF'],
    'cazoleta': ['Cazoletas CORVEN', 'Cazoletas SADAR'],
    'bieleta': ['Bieletas CORVEN', 'Bieletas SADAR', 'Bieleta'],
    'rotula': ['Rotulas CORVEN', 'Rotulas SADAR', 'Rotula'],
    'embrague': ['Embragues CORVEN', 'Embragues SADAR', 'Embragues VALEO'],
    'brazo': ['Brazos Susp CORVEN', 'Brazos Susp SADAR'],
    'extremo': ['Extremos CORVEN', 'Extremos SADAR', 'Extremos'],
    'axial': ['Axiales CORVEN', 'Axiales SADAR', 'Axialprecap'],
    'homocinetica': ['Homocinéticas CORVEN', 'Homocinéticas SADAR', 'Homocinética'],
    'parrilla': ['Parrillas CORVEN', 'Parrillas SADAR', 'Parrilla suspensión'],
    'cremallera': ['Cremallera'],
    'cilindro': ['Cilindros de Rueda y Componentes'],
    'piston': ['Cilindros de Rueda y Componentes', 'Mordazas y Pistones', 'Pistones Servo Freno'],
    'bomba': ['Bombas de Freno', 'Bombas de Embrague', 'Bombas de vacío', 'Bomba hidraulica', 'Bomba combustible'],
    'cubeta': ['Cilindros de Rueda y Componentes', 'Bombas de Freno'],
    'guardapolvo': ['Cilindros de Rueda y Componentes', 'Guardapolvos y Sellos'],
    'bombin': ['Bombines de Embrague'],
    'mordaza': ['Mordazas y Pistones'],
    'kit': ['Kits de Reparación Generales', 'Mordazas y Pistones', 'Bombas de Freno', 'Bombas de Embrague', 'Bombines de Embrague'],
    'flexible': ['Flexibles de Freno'],
    'valvula': ['Válvulas Hidráulicas'],
    'asiento': ['Válvulas Hidráulicas'],
    'cuerpo': ['Válvulas Hidráulicas'],
    'purgador': ['Purga y Depósitos'],
    'deposito': ['Purga y Depósitos', 'Depósito de Agua'],
    'servo': ['Pistones Servo Freno', 'Kits de Reparación Generales'],
    'sello': ['Guardapolvos y Sellos'],
    'maza': ['Mazas CORVEN', 'Mazas HF', 'Maza de Rueda'],
    'semieje': ['Semiejes CORVEN', 'Semieje'],
    'paragolpe': ['Paragolpes'],
    'guardabarro': ['Guardabarros'],
    'electro': ['Electroventilador'],
    'puerta': ['Puertas'],
    'rejilla': ['Rejilla Parrilla'],
    'marco': ['Marco Cubre Faro'],
    'faro': ['Marco Cubre Faro'],
    'capot': ['Capot'],
    'pasarueda': ['Pasa Ruedas'],
    'porton': ['Portón Trasero'],
    'moldura': ['Molduras']
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

function parseNaturalQuery(query) {
  console.log('🧠 [PARSER] Analizando:', query);

  const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'auto'];
  const productKeywords = [
    'amortiguador', 'pastilla', 'freno', 'disco', 'cazoleta', 'bieleta',
    'rotula', 'embrague', 'brazo', 'extremo', 'axial', 'homocinetica',
    'cilindro', 'piston', 'bomba', 'cubeta', 'guardapolvo', 'bombin',
    'mordaza', 'kit', 'flexible', 'valvula', 'asiento', 'cuerpo',
    'purgador', 'deposito', 'servo', 'sello',
    'parrilla', 'cremallera', 'maza', 'semieje',
    // 🆕 PALABRAS CLAVE DE CARROCERÍA Y CHAPA
    'paragolpe', 'guardabarro', 'puerta', 'rejilla', 'marco', 'faro',
    'capot', 'pasarueda', 'porton', 'moldura'
  ];
  const positionKeywords = ['delantero', 'trasero', 'izquierdo', 'derecho', 'del', 'pos', 'izq', 'der'];

  // 🆕 DETECCIÓN DE FILTROS FORMATEADOS
  const filterPattern = /(categoria|marca|modelo|version):"([^"]+)"/g;
  const filterMatches = [...query.matchAll(filterPattern)];

  if (filterMatches.length > 0) {
    console.log('🎯 [PARSER] Filtros detectados en query:', filterMatches);

    const extractedFilters = {};
    filterMatches.forEach(match => {
      const [, filterType, filterValue] = match;
      extractedFilters[filterType] = filterValue;
    });

    return {
      product: null,
      position: null,
      year: null,
      vehicleTerms: [],
      isStructured: true,
      // 🆕 NUEVAS PROPIEDADES PARA FILTROS
      isFilterQuery: true,
      extractedFilters: extractedFilters,
      originalQuery: query,
      freeText: query.replace(filterPattern, '').trim()
    };
  }

  // DETECCIÓN DE CÓDIGO EXACTO
  // Un código real de autoparte siempre tiene dígitos, guiones o underscores.
  // Palabras simples como 'corsa', 'ford', 'frenos' NO son códigos.
  const trimmedQuery = query.trim();
  const isLikelyCode = /^[A-Za-z0-9\-_]+$/.test(trimmedQuery) &&
    trimmedQuery.length >= 3 &&
    (/\d/.test(trimmedQuery) || trimmedQuery.includes('-') || trimmedQuery.includes('_'));

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
    isFilterQuery: false,
    extractedFilters: null,
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

  console.log('🧠 [PARSER] Resultado:', result);
  return result;
}

function buildSearchPipeline(parsedQuery, limit, offset) {
  console.log('🔧 [PIPELINE] Construyendo búsqueda...');

  let matchConditions = { tiene_precio_valido: true };

  // 🆕 PRIORIDAD PARA QUERIES CON FILTROS EXTRAÍDOS
  if (parsedQuery.isFilterQuery && parsedQuery.extractedFilters) {
    console.log('🎯 [PIPELINE] Búsqueda con filtros extraídos:', parsedQuery.extractedFilters);

    const filters = parsedQuery.extractedFilters;

    // Filtro por categoría principal
    if (filters.categoria) {
      if (CATEGORIAS[filters.categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[filters.categoria] };
      } else {
        matchConditions.categoria = filters.categoria;
      }
    }

    // Filtros de aplicaciones
    const aplicacionFilters = [];

    if (filters.marca) {
      aplicacionFilters.push({ "aplicaciones.marca": filters.marca });
    }

    if (filters.modelo) {
      aplicacionFilters.push({ "aplicaciones.modelo": filters.modelo });
    }

    if (filters.version) {
      aplicacionFilters.push({ "aplicaciones.version": filters.version });
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

    const pipeline = [
      { $match: matchConditions },
      { $sort: { codigo: 1 } }
    ];

    if (offset > 0) pipeline.push({ $skip: offset });
    pipeline.push({ $limit: limit });
    pipeline.push({ $project: { _id: 0 } });

    return pipeline;
  }

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

    // Aplicaciones de vehículo + año → búsqueda por índice $text
    // Usamos $text en lugar de $regex para: mayor robustez con caracteres especiales
    // (paréntesis, barras, puntos) y mejor rendimiento con el índice ya creado.
    const textParts = [];

    if (parsedQuery.vehicleTerms && parsedQuery.vehicleTerms.length > 0) {
      parsedQuery.vehicleTerms.forEach(term => {
        // Limpiar caracteres que pueden romper $text o $regex: ()/.\\,;:!?*[]{}^$|
        const cleaned = term.replace(/[()\/\\.,;:!?*\[\]{}^$|]/g, ' ').trim();
        // Dividir en sub-palabras por si había chars pegados (ej: "Pick-Up" → "Pick Up")
        cleaned.split(/\s+/).forEach(sub => {
          if (sub.length > 1) textParts.push(sub);
        });
      });
    }

    // Agregar el año si fue detectado
    if (parsedQuery.year) {
      textParts.push(parsedQuery.year);
    }

    if (textParts.length > 0) {
      matchConditions.$text = { $search: textParts.join(' ') };
    }

  } else {
    console.log('🔍 [PIPELINE] Búsqueda libre con índice de texto');

    const freeText = parsedQuery.freeText || "";

    if (freeText.trim().length > 0) {
      // Usar índice $text de MongoDB para búsqueda eficiente y relevante.
      // Cubre los campos indexados: nombre, aplicaciones.marca, aplicaciones.modelo
      matchConditions.$text = { $search: freeText.trim() };
    }
  }

  console.log('🚨 [PIPELINE] Consulta final:', JSON.stringify(matchConditions, null, 2));

  // Si hay búsqueda de texto libre, ordenar por relevancia textual
  const usaTextSearch = !!matchConditions.$text;

  const pipeline = [
    { $match: matchConditions }
  ];

  if (usaTextSearch) {
    // Agregar score de relevancia y ordenar por él
    pipeline.push({ $addFields: { _textScore: { $meta: 'textScore' } } });
    pipeline.push({ $sort: { _textScore: -1 } });
  } else {
    pipeline.push({ $sort: { codigo: 1 } });
  }

  if (offset > 0) pipeline.push({ $skip: offset });
  pipeline.push({ $limit: limit });
  pipeline.push({ $project: { _id: 0, _textScore: 0 } });

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
      pagina = null,
      limite = null,
      categoria = null,
      grupo = null,  // 🆕 AGREGAR PARÁMETRO GRUPO
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

    // 🆕 MANEJO DEL PARÁMETRO GRUPO
    if (grupo && grupo !== 'todos') {
      const categoriasGrupo = getCategoriasPorGrupo(grupo);

      if (categoriasGrupo) {
        console.log(`📦 [METADATOS] Filtrando por grupo: ${grupo}, categorías: ${categoriasGrupo.length}`);
        matchConditions.categoria = { $in: categoriasGrupo };
      } else {
        console.log(`⚠️ [METADATOS] Grupo no reconocido: ${grupo}`);
        return res.status(400).json({
          success: false,
          error: `Grupo "${grupo}" no reconocido`
        });
      }
    }
    // Filtro por categoría existente (con prioridad si ambos parámetros están presentes)
    else if (categoria && categoria !== 'todos') {
      if (CATEGORIAS[categoria]) {
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        matchConditions.categoria = categoria;
      }
    }

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
                  // 🆕 USAR PRIMERA IMAGEN DEL ARRAY
                  imagen: {
                    $cond: {
                      if: { $isArray: "$imagenes" },
                      then: { $arrayElemAt: ["$imagenes", 0] },
                      else: { $ifNull: ["$imagen", "/img/placeholder-producto.webp"] }
                    }
                  },
                  // 🆕 MANTENER ARRAY COMPLETO PARA DETALLES
                  imagenes: 1,
                  aplicaciones: { $slice: ["$aplicaciones", 2] },
                  "detalles_tecnicos.Posición de la pieza": "$detalles_tecnicos.Posición de la pieza",
                  stock_status: 1
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
            // 🆕 USAR PRIMERA IMAGEN DEL ARRAY
            imagen: {
              $cond: {
                if: { $isArray: "$imagenes" },
                then: { $arrayElemAt: ["$imagenes", 0] },
                else: { $ifNull: ["$imagen", "/img/placeholder-producto.webp"] }
              }
            },
            // 🆕 MANTENER ARRAY COMPLETO PARA DETALLES
            imagenes: 1,
            aplicaciones: 1,
            detalles_tecnicos: 1,
            equivalencias: 1,
            stock_status: 1
          }
        }
      ];

      const startTime = Date.now();
      const productos = await collection.aggregate(pipeline).toArray();
      const processingTime = Date.now() - startTime;

      console.log(`🎉 [METADATOS-COMPLETO] ${productos.length} productos cargados en ${processingTime}ms`);

      res.json({
        success: true,
        count: productos.length,
        data: productos,
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
    const { categoria = null, grupo = null } = req.query;  // 🆕 AGREGAR PARÁMETRO GRUPO

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    let matchConditions = { tiene_precio_valido: true };

    // 🆕 MANEJO DEL PARÁMETRO GRUPO
    if (grupo && grupo !== 'todos') {
      const categoriasGrupo = getCategoriasPorGrupo(grupo);

      if (categoriasGrupo) {
        console.log(`🔍 [FILTROS-RAPIDOS] Filtrando por grupo: ${grupo}, categorías: ${categoriasGrupo.length}`);
        matchConditions.categoria = { $in: categoriasGrupo };
      } else {
        console.log(`⚠️ [FILTROS-RAPIDOS] Grupo no reconocido: ${grupo}`);
        return res.status(400).json({
          success: false,
          error: `Grupo "${grupo}" no reconocido`
        });
      }
    }
    // Filtro por categoría existente (con prioridad si ambos parámetros están presentes)
    else if (categoria && categoria !== 'todos') {
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

router.post('/busqueda-codigos-lote', async (req, res) => {
  try {
    const { codigos } = req.body;

    if (!codigos || !Array.isArray(codigos) || codigos.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array de códigos requerido'
      });
    }

    // Limpiar y normalizar códigos
    const codigosLimpios = codigos
      .filter(codigo => codigo && typeof codigo === 'string')
      .map(codigo => codigo.toString().trim())
      .filter(codigo => codigo.length > 0);

    if (codigosLimpios.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No hay códigos válidos para buscar'
      });
    }

    console.log(`🔍 [BUSQUEDA-LOTE] Buscando ${codigosLimpios.length} productos...`);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Buscar todos los productos en una sola consulta
    const startTime = Date.now();

    const productos = await collection.find(
      {
        codigo: { $in: codigosLimpios },
        tiene_precio_valido: true
      },
      {
        projection: {
          _id: 0,
          codigo: 1,
          nombre: 1,
          categoria: 1,
          marca: 1,
          precio_lista_con_iva: 1,
          aplicaciones: 1,
          detalles_tecnicos: 1
        }
      }
    ).toArray();

    const processingTime = Date.now() - startTime;

    // Crear mapa de códigos encontrados vs no encontrados
    const productosEncontrados = productos.map(p => p.codigo);
    const codigosNoEncontrados = codigosLimpios.filter(codigo =>
      !productosEncontrados.includes(codigo)
    );

    console.log(`✅ [BUSQUEDA-LOTE] ${productos.length}/${codigosLimpios.length} productos encontrados en ${processingTime}ms`);

    if (codigosNoEncontrados.length > 0) {
      console.log(`⚠️ [BUSQUEDA-LOTE] Códigos no encontrados:`, codigosNoEncontrados.slice(0, 10));
    }

    res.json({
      success: true,
      data: productos,
      stats: {
        solicitados: codigosLimpios.length,
        encontrados: productos.length,
        noEncontrados: codigosNoEncontrados.length,
        codigosNoEncontrados: codigosNoEncontrados.slice(0, 20), // Solo primeros 20 para no saturar respuesta
        processingTime: processingTime
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [BUSQUEDA-LOTE] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === ENDPOINT ALTERNATIVO PARA VERIFICAR EXISTENCIA RÁPIDA ===
router.post('/verificar-codigos-existencia', async (req, res) => {
  try {
    const { codigos } = req.body;

    if (!codigos || !Array.isArray(codigos)) {
      return res.status(400).json({
        success: false,
        error: 'Array de códigos requerido'
      });
    }

    const codigosLimpios = codigos
      .map(codigo => codigo.toString().trim())
      .filter(codigo => codigo.length > 0);

    console.log(`🔍 [VERIFICAR-EXISTENCIA] Verificando ${codigosLimpios.length} códigos...`);

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Solo verificar existencia (más rápido)
    const productosExistentes = await collection.find(
      {
        codigo: { $in: codigosLimpios },
        tiene_precio_valido: true
      },
      { projection: { codigo: 1, _id: 0 } }
    ).toArray();

    const codigosExistentes = productosExistentes.map(p => p.codigo);
    const codigosNoExistentes = codigosLimpios.filter(codigo =>
      !codigosExistentes.includes(codigo)
    );

    res.json({
      success: true,
      existentes: codigosExistentes,
      noExistentes: codigosNoExistentes,
      stats: {
        total: codigosLimpios.length,
        existentes: codigosExistentes.length,
        noExistentes: codigosNoExistentes.length
      }
    });

  } catch (error) {
    console.error('❌ [VERIFICAR-EXISTENCIA] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// === ENDPOINT PARA BUSCAR PRODUCTO INDIVIDUAL (OPTIMIZADO) ===
router.get('/producto-rapido/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    if (!codigo || codigo.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Código requerido'
      });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const producto = await collection.findOne(
      {
        codigo: codigo.trim(),
        tiene_precio_valido: true
      },
      {
        projection: {
          _id: 0,
          codigo: 1,
          nombre: 1,
          categoria: 1,
          marca: 1,
          proveedor: 1  // ✅ AGREGAR ESTA LÍNEA
        }
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
    console.error('❌ [PRODUCTO-RAPIDO] Error:', error);
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

    // 🆕 AGREGAR PROYECCIÓN PARA MANEJAR IMÁGENES
    pipeline.push({
      $addFields: {
        imagen: {
          $cond: {
            if: { $isArray: "$imagenes" },
            then: { $arrayElemAt: ["$imagenes", 0] },
            else: { $ifNull: ["$imagen", "/img/placeholder-producto.webp"] }
          }
        }
      }
    });

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

    // 🆕 PROCESAR IMÁGENES PARA COMPATIBILIDAD
    if (producto.imagenes && Array.isArray(producto.imagenes) && producto.imagenes.length > 0) {
      // Si existe el array de imágenes, usar la primera como imagen principal
      producto.imagen = producto.imagenes[0];
    } else if (!producto.imagen) {
      // Si no hay imagen principal ni array, usar placeholder
      producto.imagen = "/img/placeholder-producto.webp";
    }

    // ✅ PROCESAR PRODUCTO CON DATOS SEO
    const productoConSEO = procesarProductoConSEO(producto);

    console.log(`✅ [PRODUCTO-SEO] ${codigo}: "${productoConSEO.nombre_descriptivo}"`);

    res.json({
      success: true,
      data: productoConSEO
    });
  } catch (error) {
    console.error('❌ [PRODUCTO] Error:', error);
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
      {
        $match: {
          $or: [
            { "aplicaciones.marca": { $regex: normalizedQuery, $options: 'i' } },
            { "aplicaciones.modelo": { $regex: normalizedQuery, $options: 'i' } }
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
    console.log('📂 [CATEGORIAS] Solicitando categorías principales...');

    // 🎯 SOLO CATEGORÍAS PRINCIPALES (las keys del objeto CATEGORIAS)
    const categoriasPrincipales = Object.keys(CATEGORIAS).sort();

    console.log(`📂 [CATEGORIAS] ${categoriasPrincipales.length} categorías principales:`, categoriasPrincipales);

    res.json({
      success: true,
      data: categoriasPrincipales,
      count: categoriasPrincipales.length,
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
router.get('/categoria/:categoria', async (req, res) => {
  try {
    const { categoria } = req.params;

    // Mapear categorías URL-friendly a categorías reales
    const mapeoCategories = {
      'amortiguadores': 'Amortiguadores',
      'amortiguadores-corven': 'Amort CORVEN',
      'amortiguadores-sadar': 'Amort SADAR',
      'amortiguadores-lip': 'Amort LIP',
      'pastillas-freno': 'Pastillas de Freno',
      'suspension': 'Brazos Suspension',
      'embragues': 'Embragues',
      'rotulas': 'Rótulas'
    };

    const categoriaReal = mapeoCategories[categoria];
    if (!categoriaReal) {
      return res.status(404).send('Categoría no encontrada');
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Obtener productos de la categoría
    let matchConditions = { tiene_precio_valido: true };

    if (CATEGORIAS[categoriaReal]) {
      matchConditions.categoria = { $in: CATEGORIAS[categoriaReal] };
    } else {
      matchConditions.categoria = categoriaReal;
    }

    const productos = await collection.find(matchConditions)
      .limit(50)
      .toArray();

    // Generar contenido SEO específico
    const contenidoSEO = generarContenidoCategoriaSEO(categoriaReal, productos);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${contenidoSEO.titulo}</title>
    <meta name="description" content="${contenidoSEO.descripcion}">
    <meta name="keywords" content="${contenidoSEO.keywords}">
    
    <!-- Open Graph -->
    <meta property="og:title" content="${contenidoSEO.titulo}">
    <meta property="og:description" content="${contenidoSEO.descripcion}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://bethersa.com.ar/api/categoria/${categoria}">
    <meta property="og:image" content="https://bethersa.com.ar/Imagenes/Logos/Empresa/Bether.png">
    
    <!-- Canonical -->
    <link rel="canonical" href="https://bethersa.com.ar/api/categoria/${categoria}">
    
    <!-- Schema.org -->
    <script type="application/ld+json">
    ${JSON.stringify(contenidoSEO.schema, null, 2)}
    </script>
    
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 40px; }
        .productos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
        .producto-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
        .producto-card h3 { margin: 0 0 10px 0; color: #333; }
        .precio { color: #e63946; font-weight: bold; }
        .aplicaciones { font-size: 12px; color: #666; margin-top: 10px; }
        .cta-section { background: #f8f9fa; padding: 30px; margin: 40px 0; text-align: center; border-radius: 8px; }
        .btn-catalogo { background: #e63946; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${contenidoSEO.h1}</h1>
        <p>${contenidoSEO.descripcionLarga}</p>
    </div>

    <div class="productos-grid">
        ${productos.map(producto => {
      const productoConSEO = procesarProductoConSEO(producto);
      return `
            <div class="producto-card">
                <h3>${productoConSEO.nombre_descriptivo}</h3>
                <p><strong>Código:</strong> ${producto.codigo}</p>
                <p class="precio">${producto.precio_lista_con_iva || 'Consultar'}</p>
                ${producto.aplicaciones ? `
                    <div class="aplicaciones">
                        <strong>Compatible con:</strong> 
                        ${producto.aplicaciones.slice(0, 3).map(app => `${app.marca} ${app.modelo}`).join(', ')}
                    </div>
                ` : ''}
                <a href="/producto?id=${producto.codigo}" style="color: #e63946;">Ver detalles</a>
            </div>
          `;
    }).join('')}
    </div>

    <div class="cta-section">
        <h2>¿Necesitás ayuda para encontrar tu repuesto?</h2>
        <p>Nuestro equipo te ayuda a encontrar el repuesto exacto para tu vehículo</p>
        <a href="/catalogo" class="btn-catalogo">Ver catálogo completo</a>
        <a href="https://wa.me/5492613533219" class="btn-catalogo">Consultar por WhatsApp</a>
    </div>

    <div style="margin-top: 40px;">
        <h2>Bethersa - Tu distribuidora de confianza en Mendoza</h2>
        <p>Desde hace años, Bethersa es líder en la distribución de autopartes en Mendoza y toda la región de Cuyo. 
        Trabajamos con las mejores marcas como CORVEN, SADAR, FERODO, JURID y VALEO para ofrecerte repuestos 
        de calidad garantizada.</p>
        
        <p>📍 <strong>Ubicación:</strong> Minuzzi 428, Godoy Cruz, Mendoza</p>
        <p>📞 <strong>Teléfono:</strong> 2613 53-3219</p>
        <p>✉️ <strong>Email:</strong> info@bethersa.com.ar</p>
    </div>
</body>
</html>`;

    res.send(html);

  } catch (error) {
    console.error('❌ [CATEGORIA-SEO] Error:', error);
    res.status(500).send('Error interno del servidor');
  }
});

/**
 * Genera contenido SEO específico para cada categoría
 */
function generarContenidoCategoriaSEO(categoria, productos) {
  const contenidoPorCategoria = {
    'Amortiguadores': {
      titulo: 'Amortiguadores para Auto - CORVEN, SADAR, LIP | Bethersa Mendoza',
      h1: 'Amortiguadores de Calidad para tu Vehículo',
      descripcion: 'Amortiguadores CORVEN, SADAR y LIP en Mendoza. Stock permanente para todas las marcas. ✅ Garantía ✅ Entrega inmediata ✅ Mejores precios',
      descripcionLarga: 'Encontrá el amortiguador perfecto para tu auto en Bethersa. Trabajamos con las mejores marcas: CORVEN, SADAR, LIP, SUPER PICKUP y PRO TUNNING. Stock permanente para Ford, Volkswagen, Chevrolet, Peugeot, Renault, Fiat, Toyota y más.',
      keywords: 'amortiguadores, amortiguador corven, amortiguador sadar, amortiguadores mendoza, repuestos auto mendoza, amortiguador delantero, amortiguador trasero, bethersa'
    },
    'Amort CORVEN': {
      titulo: 'Amortiguadores CORVEN - Línea Completa | Bethersa Mendoza',
      h1: 'Amortiguadores CORVEN - Máxima Calidad y Durabilidad',
      descripcion: 'Amortiguadores CORVEN originales en Mendoza. Línea completa para todas las marcas de autos. ✅ Garantía de fábrica ✅ Stock inmediato ✅ Instalación',
      descripcionLarga: 'Los amortiguadores CORVEN son sinónimo de calidad y durabilidad. En Bethersa tenemos la línea completa: delanteros, traseros, para todas las marcas y modelos. Con más de 30 años en el mercado, CORVEN es tu garantía de seguridad.',
      keywords: 'amortiguador corven, corven argentina, amortiguadores corven mendoza, repuestos corven, amortiguador gas corven'
    },
    'Pastillas de Freno': {
      titulo: 'Pastillas de Freno FERODO, JURID, CORVEN | Bethersa Mendoza',
      h1: 'Pastillas de Freno de Primera Calidad',
      descripcion: 'Pastillas de freno FERODO, JURID y CORVEN en Mendoza. Máxima seguridad para tu frenado. ✅ Instalación profesional ✅ Garantía ✅ Stock permanente',
      descripcionLarga: 'La seguridad al frenar no tiene precio. En Bethersa encontrás pastillas de freno de las mejores marcas: FERODO, JURID y CORVEN. Para todas las marcas de autos, con garantía de fábrica.',
      keywords: 'pastillas freno, pastillas ferodo, pastillas jurid, pastillas corven, frenos mendoza, pastillas freno mendoza'
    },
    // 🆕 CATEGORÍAS DE CARROCERÍA Y CHAPA
    'Paragolpes': {
      titulo: 'Paragolpes para Auto - Todas las Marcas | Bethersa Mendoza',
      h1: 'Paragolpes de Calidad para tu Vehículo',
      descripcion: 'Paragolpes delanteros y traseros en Mendoza. Stock permanente para todas las marcas. ✅ Entrega inmediata ✅ Mejor precio ✅ Garantía',
      descripcionLarga: 'Encontrá el paragolpes que necesitás para tu auto en Bethersa. Contamos con stock de paragolpes delanteros y traseros para Ford, Volkswagen, Chevrolet, Peugeot, Renault, Fiat, Toyota y más marcas.',
      keywords: 'paragolpes, paragolpe delantero, paragolpe trasero, carroceria auto, chapa auto mendoza, paragolpes mendoza, bethersa'
    },
    'Guardabarros': {
      titulo: 'Guardabarros para Auto - Stock Permanente | Bethersa Mendoza',
      h1: 'Guardabarros de Reposición',
      descripcion: 'Guardabarros delanteros y traseros en Mendoza. Para todas las marcas de autos. ✅ Stock inmediato ✅ Mejor precio',
      descripcionLarga: 'Guardabarros de calidad para tu vehículo. En Bethersa tenemos guardabarros delanteros y traseros para la mayoría de marcas y modelos.',
      keywords: 'guardabarros, guardabarro delantero, guardabarro trasero, carroceria, chapa auto, guardabarros mendoza'
    },
    'Puertas': {
      titulo: 'Puertas para Auto - Carrocería | Bethersa Mendoza',
      h1: 'Puertas de Reposición para Vehículos',
      descripcion: 'Puertas delanteras y traseras para autos en Mendoza. Stock para múltiples marcas. ✅ Consultar disponibilidad',
      descripcionLarga: 'Puertas de carrocería para tu auto. Consulta disponibilidad para tu marca y modelo específico.',
      keywords: 'puertas auto, puerta delantera, puerta trasera, carroceria, chapa mendoza'
    },
    'Rejilla Parrilla': {
      titulo: 'Rejillas Parrilla para Auto | Bethersa Mendoza',
      h1: 'Rejillas Parrilla Delanteras',
      descripcion: 'Rejillas parrilla para autos en Mendoza. Stock permanente. ✅ Entrega inmediata ✅ Consultar compatibilidad',
      descripcionLarga: 'Rejillas parrilla delantera para múltiples marcas y modelos. Consulta por tu vehículo específico.',
      keywords: 'rejilla parrilla, parrilla delantera, parrilla auto, carroceria mendoza'
    },
    'Marco Cubre Faro': {
      titulo: 'Marco Cubre Faro - Accesorios Carrocería | Bethersa Mendoza',
      h1: 'Marcos Cubre Faro para Auto',
      descripcion: 'Marcos cubre faro delanteros y traseros en Mendoza. ✅ Stock disponible ✅ Consultar por tu modelo',
      descripcionLarga: 'Marcos cubre faro de calidad para proteger y embellecer tu vehículo.',
      keywords: 'marco cubre faro, marco faro, cubre optica, accesorios carroceria'
    },
    'Capot': {
      titulo: 'Capot para Auto - Carrocería | Bethersa Mendoza',
      h1: 'Capot de Reposición',
      descripcion: 'Capot delantero para autos en Mendoza. Consultar disponibilidad por marca y modelo.',
      descripcionLarga: 'Capot de carrocería para tu vehículo. Stock para marcas seleccionadas.',
      keywords: 'capot, capo auto, carroceria delantera, chapa mendoza'
    },
    'Pasa Ruedas': {
      titulo: 'Pasa Ruedas para Auto | Bethersa Mendoza',
      h1: 'Pasa Ruedas de Reposición',
      descripcion: 'Pasa ruedas delanteros y traseros en Mendoza. ✅ Stock disponible',
      descripcionLarga: 'Pasa ruedas de calidad para proteger la carrocería de tu auto.',
      keywords: 'pasa ruedas, pasaruedas, guardabarro interno, carroceria'
    },
    'Portón Trasero': {
      titulo: 'Portón Trasero para Auto | Bethersa Mendoza',
      h1: 'Portón Trasero de Reposición',
      descripcion: 'Portones traseros para autos en Mendoza. Consultar disponibilidad por modelo.',
      descripcionLarga: 'Portón trasero de carrocería. Consulta por tu marca y modelo específico.',
      keywords: 'porton trasero, puerta trasera, carroceria trasera, chapa'
    },
    'Molduras': {
      titulo: 'Molduras para Auto - Paragolpes, Capot, Rejilla | Bethersa Mendoza',
      h1: 'Molduras de Carrocería',
      descripcion: 'Molduras de paragolpes, capot y rejilla parrilla en Mendoza. ✅ Stock permanente ✅ Todas las marcas',
      descripcionLarga: 'Molduras de carrocería para embellecer tu auto: molduras de paragolpes, molduras de capot, molduras de rejilla parrilla. Consulta por tu modelo.',
      keywords: 'molduras auto, moldura paragolpe, moldura capot, moldura rejilla, accesorios carroceria'
    }
  };

  const contenido = contenidoPorCategoria[categoria] || {
    titulo: `${categoria} | Bethersa Mendoza`,
    h1: categoria,
    descripcion: `${categoria} de calidad en Bethersa Mendoza. Stock permanente y mejores precios.`,
    descripcionLarga: `Encontrá ${categoria.toLowerCase()} de calidad en Bethersa, tu distribuidora de confianza en Mendoza.`,
    keywords: `${categoria.toLowerCase()}, repuestos auto mendoza, bethersa`
  };

  // Agregar Schema.org
  contenido.schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": contenido.h1,
    "description": contenido.descripcion,
    "numberOfItems": productos.length,
    "itemListElement": productos.slice(0, 10).map((producto, index) => ({
      "@type": "Product",
      "position": index + 1,
      "name": producto.nombre,
      "sku": producto.codigo,
      "offers": {
        "@type": "Offer",
        "priceCurrency": "ARS",
        "availability": "https://schema.org/InStock",
        "seller": {
          "@type": "Organization",
          "name": "Bethersa S.A."
        }
      }
    }))
  };

  return contenido;
}
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

    // 🎯 FILTRO POR CATEGORÍA PRINCIPAL
    if (categoria && categoria !== 'todos') {
      // Verificar si es una categoría principal válida
      if (CATEGORIAS[categoria]) {
        console.log(`🎯 Categoría principal: ${categoria}`);
        console.log(`📋 Buscando en subcategorías:`, CATEGORIAS[categoria]);

        // Buscar en todas las subcategorías que pertenecen a esta categoría principal
        matchConditions.categoria = { $in: CATEGORIAS[categoria] };
      } else {
        console.log(`⚠️ Categoría no reconocida: ${categoria}`);
        // Si no es una categoría principal válida, no devolver resultados
        return res.json({
          success: true,
          results: [],
          count: 0,
          totalResults: 0,
          filtros: { categoria, marca, modelo, version },
          error: `Categoría "${categoria}" no encontrada`,
          timestamp: new Date().toISOString()
        });
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

    // Info adicional sobre la búsqueda
    const infoAdicional = {};
    if (categoria && CATEGORIAS[categoria]) {
      infoAdicional.subcategoriasIncluidas = CATEGORIAS[categoria];
      infoAdicional.totalSubcategorias = CATEGORIAS[categoria].length;
    }

    res.json({
      success: true,
      results: productos,
      count: productos.length,
      totalResults: totalResultados,
      filtros: { categoria, marca, modelo, version },
      busquedaInfo: infoAdicional,
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
// 🗺️ ENDPOINT PARA SITEMAP XML DINÁMICO CON TODOS LOS PRODUCTOS
router.get('/sitemap-productos.xml', async (req, res) => {
  try {
    console.log('🗺️ [SITEMAP] Generando sitemap completo...');

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Obtener productos más populares/importantes (amortiguadores primero)
    const productos = await collection.find(
      { tiene_precio_valido: true },
      {
        projection: {
          codigo: 1,
          categoria: 1,
          aplicaciones: 1,
          detalles_tecnicos: 1,
          marca: 1,
          convertido_timestamp: 1
        }
      }
    ).limit(1000) // Limitar para no sobrecargar el sitemap
      .toArray();

    console.log(`🗺️ [SITEMAP] ${productos.length} productos procesando...`);

    const fechaActual = new Date().toISOString().split('T')[0];

    // Generar XML del sitemap
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Páginas principales con máxima prioridad
    xml += `
  <url>
    <loc>https://bethersa.com.ar/</loc>
    <lastmod>${fechaActual}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  
  <url>
    <loc>https://bethersa.com.ar/catalogo</loc>
    <lastmod>${fechaActual}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>https://bethersa.com.ar/catalogo?cat=Amortiguadores</loc>
    <lastmod>${fechaActual}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.95</priority>
  </url>`;

    // Agrupar productos por categoría para priorizar amortiguadores
    const productosPorCategoria = productos.reduce((acc, producto) => {
      const categoria = producto.categoria || 'Otros';
      if (!acc[categoria]) acc[categoria] = [];
      acc[categoria].push(producto);
      return acc;
    }, {});

    // Procesar amortiguadores primero (máxima prioridad)
    const categoriesAmortiguadores = Object.keys(productosPorCategoria)
      .filter(cat => cat.includes('Amort'));

    categoriesAmortiguadores.forEach(categoria => {
      const productosCategoria = productosPorCategoria[categoria];

      productosCategoria.forEach(producto => {
        const productoConSEO = procesarProductoConSEO(producto);
        const lastmod = producto.convertido_timestamp ?
          new Date(producto.convertido_timestamp).toISOString().split('T')[0] :
          fechaActual;

        // URL del producto individual
        xml += `
  <url>
    <loc>https://bethersa.com.ar/producto?id=${encodeURIComponent(producto.codigo)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;

        // Si el producto tiene aplicaciones, crear URLs específicas
        if (producto.aplicaciones && producto.aplicaciones.length > 0) {
          producto.aplicaciones.slice(0, 3).forEach(app => { // Solo primeras 3 aplicaciones
            if (app.marca && app.modelo) {
              const searchQuery = `amortiguador ${app.marca} ${app.modelo}`.toLowerCase();
              xml += `
  <url>
    <loc>https://bethersa.com.ar/catalogo?search=${encodeURIComponent(searchQuery)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>`;
            }
          });
        }
      });
    });

    // Resto de productos (menor prioridad)
    const otrasCategories = Object.keys(productosPorCategoria)
      .filter(cat => !cat.includes('Amort'))
      .slice(0, 10); // Limitar otras categorías

    otrasCategories.forEach(categoria => {
      const productosCategoria = productosPorCategoria[categoria].slice(0, 20); // Máximo 20 por categoría

      productosCategoria.forEach(producto => {
        const lastmod = producto.convertido_timestamp ?
          new Date(producto.convertido_timestamp).toISOString().split('T')[0] :
          fechaActual;

        xml += `
  <url>
    <loc>https://bethersa.com.ar/producto?id=${encodeURIComponent(producto.codigo)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
      });
    });

    // Búsquedas estratégicas de marcas populares
    const marcasPopulares = ['ford', 'volkswagen', 'chevrolet', 'peugeot', 'renault', 'fiat', 'toyota'];
    const modelosPopulares = {
      ford: ['ka', 'fiesta', 'focus', 'escort', 'ranger'],
      volkswagen: ['gol', 'polo', 'suran', 'saveiro'],
      chevrolet: ['corsa', 'celta', 'prisma', 's10'],
      peugeot: ['206', '207', '208', '306', '307', '405', '504'],
      renault: ['clio', 'megane', 'sandero', 'logan'],
      fiat: ['palio', 'siena', 'uno'],
      toyota: ['corolla', 'hilux', 'etios']
    };

    marcasPopulares.forEach(marca => {
      const modelos = modelosPopulares[marca] || [];
      modelos.forEach(modelo => {
        xml += `
  <url>
    <loc>https://bethersa.com.ar/catalogo?search=${encodeURIComponent(`amortiguador ${marca} ${modelo}`)}</loc>
    <lastmod>${fechaActual}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      });
    });

    // Búsquedas geográficas
    xml += `
  <url>
    <loc>https://bethersa.com.ar/catalogo?search=${encodeURIComponent('amortiguadores mendoza')}</loc>
    <lastmod>${fechaActual}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  
  <url>
    <loc>https://bethersa.com.ar/catalogo?search=${encodeURIComponent('repuestos auto mendoza')}</loc>
    <lastmod>${fechaActual}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.85</priority>
  </url>`;

    xml += '\n</urlset>';

    console.log(`✅ [SITEMAP] Sitemap generado con ${(xml.match(/<url>/g) || []).length} URLs`);

    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
    });

    res.send(xml);

  } catch (error) {
    console.error('❌ [SITEMAP] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🗺️ ENDPOINT PARA SITEMAP INDEX (para manejar múltiples sitemaps)
router.get('/sitemap.xml', async (req, res) => {
  try {
    const fechaActual = new Date().toISOString().split('T')[0];

    const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://bethersa.com.ar/api/sitemap-productos.xml</loc>
    <lastmod>${fechaActual}</lastmod>
  </sitemap>
</sitemapindex>`;

    res.set({
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600'
    });

    res.send(sitemapIndex);

  } catch (error) {
    console.error('❌ [SITEMAP-INDEX] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.get('/producto-por-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Buscar todos los productos y comparar slugs
    const productos = await collection.find({ tiene_precio_valido: true }).limit(500).toArray();

    const producto = productos.find(p => {
      const slugGenerado = crearSlugSimple(p);
      return slugGenerado === slug;
    });

    if (!producto) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const productoConSEO = procesarProductoConSEO(producto);

    res.json({
      success: true,
      data: productoConSEO
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🛠️ FUNCIÓN SIMPLE PARA CREAR SLUG
function crearSlugSimple(producto) {
  const nombre = producto.nombre_descriptivo || producto.nombre || '';

  return nombre
    .replace(/\s*-\s*[\w\d]+\.-[A-Z]+.*$/i, '') // Quitar código del final
    .replace(/\bpara\b/gi, '')                    // Quitar "para"
    .replace(/\bSIN ESPECIFICAR\b/gi, '')        // Quitar "SIN ESPECIFICAR"
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')             // Quitar acentos
    .replace(/[^\w\s-]/g, ' ')                   // Solo letras y números
    .replace(/\s+/g, '-')                        // Espacios a guiones
    .replace(/--+/g, '-')                        // Múltiples guiones a uno
    .replace(/^-|-$/g, '')                       // Quitar guiones extremos
    .substring(0, 80);                           // Máximo 80 caracteres
}

// 🎯 ENDPOINT PARA GENERAR SLUG (testing)
router.get('/generar-slug/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const producto = await collection.findOne({ codigo: codigo });

    if (!producto) {
      return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const productoConSEO = procesarProductoConSEO(producto);
    const slug = crearSlugSimple(productoConSEO);

    res.json({
      success: true,
      codigo: codigo,
      slug: slug,
      nombre_descriptivo: productoConSEO.nombre_descriptivo,
      url_legacy: `/producto?id=${codigo}`,
      url_seo: `/producto-${slug}`
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
function generarNombreDescriptivo(producto) {
  // ✅ EXCEPCIÓN PARA MARROSE CON CTR O FTE
  if ((producto.categoria === 'CTR' ||
    producto.categoria === 'FTE' ||
    producto.categoria === 'Susp Neumática SADAR') &&
    producto.proveedor === 'Corven') {
    return producto.nombre || '';
  }

  // ✅ EXCEPCIÓN 2: Productos de Marrose (cualquier categoría)
  if (producto.proveedor === 'Marrose') {
    return producto.nombre || '';
  }

  // ✅ EXCEPCIÓN 3: Productos de Yokomitsu (cualquier categoría)
  if (producto.proveedor === 'Yokomitsu') {
    return producto.nombre || '';
  }


  // Extraer categoría base (sin marca)
  const categoriaBase = producto.categoria?.replace(/^(Amort|Pastillas|Embragues|Discos y Camp|Rotulas|Brazos Susp)\s+\w+$/, '$1') || '';

  // Mapear categorías a nombres más descriptivos
  const categoriasDescriptivas = {
    'Amort': 'Amortiguador',
    'Pastillas': 'Pastillas de Freno',
    'Embragues': 'Kit de Embrague',
    'Discos y Camp': 'Disco de Freno',
    'Rotulas': 'Rótula',
    'Brazos Susp': 'Brazo de Suspensión',
    'Pulmon frenos': 'Cilindro de Freno',
    'Parrillas': 'Parrilla',
    'Axiales': 'Axial',
    'Bieletas': 'Bieleta',
    'Cazoletas': 'Cazoleta',
    'Extremos': 'Extremo de Dirección',
    'Cajas Mec': 'Caja Mecánica',
    'Bombas Hid': 'Bomba Hidráulica',
    'Homocinéticas': 'Homocinética',
    'Rodamientos': 'Rodamiento',
    'Semiejes': 'Semieje',
    'Mazas': 'Maza',
    'Soporte Motor': 'Soporte de Motor',
    // 🆕 CATEGORÍAS DE CARROCERÍA Y CHAPA
    'Paragolpes': 'Paragolpes',
    'Guardabarros': 'Guardabarros',
    'Puertas': 'Puerta',
    'Rejilla Parrilla': 'Rejilla Parrilla',
    'Marco Cubre Faro': 'Marco Cubre Faro',
    'Capot': 'Capot',
    'Pasa Ruedas': 'Pasa Ruedas',
    'Portón Trasero': 'Portón Trasero',
    'Molduras': 'Moldura'
  };

  const categoriaDescriptiva = categoriasDescriptivas[categoriaBase] || categoriaBase;

  // Obtener posición si existe
  const posicion = producto.detalles_tecnicos?.["Posición de la pieza"];
  const posicionTexto = posicion ? posicion.toLowerCase() : '';

  // Formatear aplicaciones
  const aplicacionesTexto = formatearAplicaciones(producto.aplicaciones);

  // Construir nombre descriptivo
  let nombreDescriptivo = categoriaDescriptiva;

  if (posicionTexto) {
    nombreDescriptivo += ` ${posicionTexto}`;
  }

  if (aplicacionesTexto) {
    nombreDescriptivo += ` para ${aplicacionesTexto}`;
  }

  // Agregar código al final
  nombreDescriptivo += ` - ${producto.codigo}`;

  return nombreDescriptivo;
}

/**
 * Formatea las aplicaciones de un producto de manera legible
 */
/**
 * Formatea las aplicaciones de un producto de manera legible
 */
function formatearAplicaciones(aplicaciones) {
  if (!aplicaciones || aplicaciones.length === 0) return '';

  // Agrupar por marca
  const porMarca = aplicaciones.reduce((acc, app) => {
    if (!acc[app.marca]) acc[app.marca] = [];
    acc[app.marca].push(app);
    return acc;
  }, {});

  const textosFormateados = Object.entries(porMarca).map(([marca, apps]) => {
    // Agrupar modelos de la misma marca
    const modelos = apps.map(app => {
      let modelo = app.modelo;

      // Interpretar versiones especiales
      if (app.version) {
        const version = app.version.toLowerCase();

        // 🔧 FIX: Formato ../11 significa hasta 2011 (NO 1911)
        if (version.includes('../')) {
          const año = version.match(/(\d{2,4})/)?.[1];
          if (año) {
            let añoCompleto;
            if (año.length === 2) {
              const añoNum = parseInt(año, 10);
              // ✅ LÓGICA CORREGIDA: 00-30 = 2000s, 31-99 = 1900s
              if (añoNum <= 30) {
                añoCompleto = `20${año.padStart(2, '0')}`;
              } else {
                añoCompleto = `19${año}`;
              }
            } else {
              añoCompleto = año;
            }
            modelo += ` (hasta ${añoCompleto})`;
          }
        }
        // 🔧 FIX: Formato 11/.. significa desde 2011 (NO 1911)
        else if (version.includes('/..')) {
          const año = version.match(/(\d{2,4})/)?.[1];
          if (año) {
            let añoCompleto;
            if (año.length === 2) {
              const añoNum = parseInt(año, 10);
              // ✅ LÓGICA CORREGIDA
              if (añoNum <= 30) {
                añoCompleto = `20${año.padStart(2, '0')}`;
              } else {
                añoCompleto = `19${año}`;
              }
            } else {
              añoCompleto = año;
            }
            modelo += ` (desde ${añoCompleto})`;
          }
        }
        // 🔧 FIX: Rango de años 03/11 = 2003-2011 (NO 1903-1911)
        else if (version.match(/\d{2,4}\/\d{2,4}/)) {
          const [año1, año2] = version.match(/(\d{2,4})\/(\d{2,4})/).slice(1);

          // ✅ FUNCIÓN PARA CONVERTIR AÑOS CORRECTAMENTE
          const convertirAño = (año) => {
            if (año.length === 2) {
              const añoNum = parseInt(año, 10);
              // Regla: 00-30 = 2000s, 31-99 = 1900s
              if (añoNum <= 30) {
                return `20${año.padStart(2, '0')}`;
              } else {
                return `19${año}`;
              }
            }
            return año; // Si ya tiene 4 dígitos, no cambiar
          };

          const año1Completo = convertirAño(año1);
          const año2Completo = convertirAño(año2);
          modelo += ` (${año1Completo}-${año2Completo})`;
        }
        // Otros formatos (mantener igual)
        else if (!version.includes('(') && version.trim()) {
          modelo += ` ${app.version}`;
        }
      }

      return modelo;
    });

    return `${marca} ${modelos.join(', ')}`;
  });

  return textosFormateados.join(' y ');
}

/**
 * Genera título SEO optimizado
 */
function generarTituloSEO(producto) {
  const nombreDescriptivo = generarNombreDescriptivo(producto);
  const marca = producto.marca || 'Repuesto';

  return `${nombreDescriptivo} ${marca} | Repuestos Bethersa`;
}

/**
 * Genera descripción SEO optimizada
 */
function generarDescripcionSEO(producto) {
  const nombreDescriptivo = generarNombreDescriptivo(producto);
  const aplicaciones = formatearAplicaciones(producto.aplicaciones);

  let descripcion = `${nombreDescriptivo} de la marca ${producto.marca || 'original'}`;

  if (aplicaciones) {
    descripcion += `. Compatible con ${aplicaciones}`;
  }

  // Agregar detalles técnicos relevantes
  const detalles = [];
  if (producto.detalles_tecnicos) {
    if (producto.detalles_tecnicos["Largo Extendido"]) {
      detalles.push(`Largo extendido: ${producto.detalles_tecnicos["Largo Extendido"]}`);
    }
    if (producto.detalles_tecnicos["Anclaje Superior"]) {
      detalles.push(`Anclaje: ${producto.detalles_tecnicos["Anclaje Superior"]}`);
    }
  }

  if (detalles.length > 0) {
    descripcion += `. ${detalles.join(', ')}`;
  }

  descripcion += `. Código: ${producto.codigo}`;

  // Truncar a 160 caracteres para SEO
  return descripcion.substring(0, 160);
}

/**
 * Genera keywords SEO
 */
function generarKeywords(producto) {
  const keywords = [];

  // Categoría base
  const categoriaBase = producto.categoria?.replace(/^(Amort|Pastillas|Embragues|Discos y Camp|Rotulas|Brazos Susp)\s+\w+$/, '$1') || '';
  if (categoriaBase) keywords.push(categoriaBase.toLowerCase());

  // Posición
  const posicion = producto.detalles_tecnicos?.["Posición de la pieza"];
  if (posicion) keywords.push(posicion.toLowerCase());

  // Aplicaciones
  if (producto.aplicaciones) {
    producto.aplicaciones.forEach(app => {
      keywords.push(app.marca.toLowerCase());
      keywords.push(app.modelo.toLowerCase());
      keywords.push(`${app.marca.toLowerCase()} ${app.modelo.toLowerCase()}`);
    });
  }

  // Marca
  if (producto.marca) keywords.push(producto.marca.toLowerCase());

  // Código
  keywords.push(producto.codigo);

  // Keywords generales
  keywords.push('repuestos', 'auto', 'repuestos auto', 'autopartes', 'bethersa', 'mendoza');

  // Equivalencias
  if (producto.equivalencias) {
    producto.equivalencias.forEach(eq => {
      keywords.push(eq.codigo);
      keywords.push(eq.marca.toLowerCase());
    });
  }

  // Remover duplicados y unir
  return [...new Set(keywords)].join(', ');
}

/**
 * Genera URL amigable
 */
function generarURLAmigable(producto) {
  const categoriaBase = producto.categoria?.replace(/^(Amort|Pastillas|Embragues|Discos y Camp|Rotulas|Brazos Susp)\s+\w+$/, '$1') || '';
  const posicion = producto.detalles_tecnicos?.["Posición de la pieza"];

  // Obtener primera aplicación principal
  const primeraApp = producto.aplicaciones?.[0];

  const partes = [];

  if (categoriaBase) partes.push(categoriaBase.toLowerCase());
  if (posicion) partes.push(posicion.toLowerCase());
  if (primeraApp) {
    partes.push(primeraApp.marca.toLowerCase());
    partes.push(primeraApp.modelo.toLowerCase());
  }
  partes.push(producto.codigo);

  return partes
    .join('-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^\w-]/g, '')          // Solo letras, números y guiones
    .replace(/--+/g, '-')            // Múltiples guiones a uno
    .replace(/^-|-$/g, '');          // Remover guiones al inicio/final
}

/**
 * Genera datos estructurados Schema.org
 */
function generarDatosEstructurados(producto, nombreDescriptivo, descripcionSEO) {
  const precioNumerico = parseFloat(
    (producto.precio_lista_con_iva || '0').replace(/[$.]/g, '').replace(',', '.')
  ) || 0;

  const datosEstructurados = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": nombreDescriptivo,
    "description": descripcionSEO,
    "sku": producto.codigo,
    "mpn": producto.codigo,
    "brand": {
      "@type": "Brand",
      "name": producto.marca || "Bethersa"
    },
    "category": producto.categoria,
    "image": [
      producto.imagen || "/img/placeholder-producto.webp"
    ],
    "offers": {
      "@type": "Offer",
      "url": `https://bethersa.com.ar/producto?id=${producto.codigo}`,
      "priceCurrency": "ARS",
      "price": precioNumerico,
      "availability": "https://schema.org/InStock",
      "seller": {
        "@type": "Organization",
        "name": "Bethersa S.A.",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Mendoza",
          "addressCountry": "AR"
        }
      }
    }
  };

  // ✅ VEHÍCULOS CON PRECIO INCLUIDO EN OFFERS
  if (producto.aplicaciones && producto.aplicaciones.length > 0) {
    datosEstructurados.isCompatibleWith = producto.aplicaciones.map(app => ({
      "@type": "Vehicle",
      "name": `${app.marca} ${app.modelo}${app.version && app.version !== 'SIN ESPECIFICAR' ? ` ${app.version}` : ''}`,
      "brand": app.marca,
      "model": app.modelo,
      "productionDate": app.version,
      "image": producto.imagen || "/img/placeholder-producto.webp",  // ✅ NUEVO: Campo imagen
      "offers": {
        "@type": "Offer",
        "price": precioNumerico,
        "priceCurrency": "ARS",
        "availability": "https://schema.org/InStock",
        "description": "Repuesto disponible en Mendoza",
        "url": `https://bethersa.com.ar/producto?id=${producto.codigo}`,
        "seller": {
          "@type": "Organization",
          "name": "Bethersa S.A.",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Mendoza",
            "addressCountry": "AR"
          }
        }
      }
    }));
  }

  return datosEstructurados;
}

/**
 * Procesa un producto agregando todos los campos SEO
 */
function procesarProductoConSEO(producto) {
  const nombreDescriptivo = generarNombreDescriptivo(producto);
  const tituloSEO = generarTituloSEO(producto);
  const descripcionSEO = generarDescripcionSEO(producto);
  const keywords = generarKeywords(producto);
  const urlAmigable = generarURLAmigable(producto);
  const datosEstructurados = generarDatosEstructurados(producto, nombreDescriptivo, descripcionSEO);

  return {
    ...producto,
    // Campos SEO generados
    nombre_descriptivo: nombreDescriptivo,
    titulo_seo: tituloSEO,
    descripcion_seo: descripcionSEO,
    keywords_seo: keywords,
    url_amigable: urlAmigable,
    datos_estructurados: datosEstructurados
  };
}

// 🆕 ENDPOINT PARA OBTENER PROVEEDORES Y CATEGORÍAS DISPONIBLES
router.get('/metadatos-filtros', async (req, res) => {
  try {
    const { proveedores } = req.query;

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    let query = { tiene_precio_valido: true };

    // 🆕 Si se especifican proveedores, filtrar categorías por esos proveedores
    if (proveedores) {
      const listaProveedores = proveedores.split(',').map(p => p.trim());
      query.proveedor = { $in: listaProveedores };
    }

    // Obtener proveedores únicos (siempre todos)
    const proveedoresDisponibles = await collection.distinct('proveedor', { tiene_precio_valido: true });

    // Obtener categorías (filtradas si hay proveedores seleccionados)
    const categoriasDisponibles = await collection.distinct('categoria', query);

    res.json({
      success: true,
      proveedores: proveedoresDisponibles.filter(p => p).sort(),
      categorias: categoriasDisponibles.filter(c => c).sort()
    });

  } catch (error) {
    console.error('❌ [METADATOS] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener metadatos',
      details: error.message
    });
  }
});

// ===== ENDPOINT MODIFICADO: /exportar-excel CON FILTROS =====
// Reemplazar desde la línea 2739 hasta 3061 en productos.js

router.get('/exportar-excel', async (req, res) => {
  try {
    console.log('📊 [EXCEL] Iniciando exportación optimizada...');

    // 🆕 LEER PARÁMETROS DE FILTRADO
    const { proveedores, categorias } = req.query;

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // 🆕 CONSTRUIR QUERY CON FILTROS
    let query = { tiene_precio_valido: true };

    // Filtro de proveedores
    if (proveedores) {
      const listaProveedores = proveedores.split(',').map(p => p.trim());
      query.proveedor = { $in: listaProveedores };
      console.log(`🔍 [EXCEL] Filtrando por proveedores: ${listaProveedores.join(', ')}`);
    }

    // Filtro de categorías
    if (categorias) {
      const listaCategorias = categorias.split(',').map(c => c.trim());
      query.categoria = { $in: listaCategorias };
      console.log(`🔍 [EXCEL] Filtrando por categorías: ${listaCategorias.join(', ')}`);
    }

    // 🆕 CONTAR TOTAL DE PRODUCTOS CON FILTROS
    const totalProductos = await collection.countDocuments(query);
    console.log(`📦 [EXCEL] Total de productos a procesar: ${totalProductos}`);

    // Si no hay productos que cumplan los filtros
    if (totalProductos === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontraron productos con los filtros seleccionados'
      });
    }

    // 2️⃣ CREAR LIBRO DE EXCEL
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bethersa';
    workbook.created = new Date();

    // 🆕 DESCARGAR LOGO (con timeout)
    let logoId;
    try {
      const https = require('https');
      const logoUrl = 'https://bethersa.com.ar/Imagenes/Logos/Empresa/Bether.png';

      const logoBuffer = await Promise.race([
        new Promise((resolve, reject) => {
          https.get(logoUrl, (response) => {
            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
          }).on('error', reject);
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
      ]);

      logoId = workbook.addImage({
        buffer: logoBuffer,
        extension: 'png',
      });
      console.log('✅ [EXCEL] Logo cargado');
    } catch (logoError) {
      console.warn('⚠️ [EXCEL] Logo no disponible:', logoError.message);
    }

    // 3️⃣ AGRUPAR POR PROVEEDOR (USANDO CURSOR PARA NO CARGAR TODO EN MEMORIA)
    // 🆕 Usar el query con filtros
    const proveedoresEncontrados = await collection.distinct('proveedor', query);
    console.log(`🏢 [EXCEL] ${proveedoresEncontrados.length} proveedores encontrados`);

    // 4️⃣ PROCESAR UN PROVEEDOR A LA VEZ
    for (const proveedor of proveedoresEncontrados.sort()) {
      const nombreProveedor = proveedor || 'Sin Proveedor';
      console.log(`\n📄 [EXCEL] Procesando: ${nombreProveedor}`);

      // Crear hoja
      const nombreHoja = nombreProveedor.substring(0, 31);
      const worksheet = workbook.addWorksheet(nombreHoja);

      let filaActual = 1;

      // AGREGAR LOGO
      if (logoId !== undefined) {
        worksheet.addImage(logoId, {
          tl: { col: 1.8, row: 0 },
          ext: { width: 300, height: 180 }
        });

        for (let i = 1; i <= 5; i++) {
          worksheet.getRow(i).height = 22;
        }

        filaActual = 6;
      }

      // TÍTULO Y FECHA
      const filaTitulo = worksheet.getRow(filaActual);
      filaTitulo.getCell('A').value = 'LISTA DE PRECIOS - BETHERSA';
      worksheet.mergeCells(`A${filaActual}:D${filaActual}`);
      filaTitulo.font = { bold: true, size: 14, color: { argb: 'FF000000' } };
      filaTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
      filaTitulo.height = 25;
      filaActual++;

      const filaFecha = worksheet.getRow(filaActual);
      filaFecha.getCell('A').value = `Fecha: ${new Date().toLocaleDateString('es-AR')}`;
      worksheet.mergeCells(`A${filaActual}:D${filaActual}`);
      filaFecha.font = { size: 11, color: { argb: 'FF666666' } };
      filaFecha.alignment = { horizontal: 'center', vertical: 'middle' };
      filaFecha.height = 20;
      filaActual += 2;

      // CONFIGURAR COLUMNAS
      worksheet.columns = [
        { key: 'codigo', width: 15 },
        { key: 'descripcion', width: 50 },
        { key: 'stock', width: 15 },
        { key: 'precio', width: 15 },
        { key: 'tipo', width: 10 }
      ];

      // ENCABEZADO
      const headerRow = worksheet.getRow(filaActual);
      headerRow.getCell('A').value = 'Código';
      headerRow.getCell('B').value = 'Descripción';
      headerRow.getCell('C').value = 'Stock';
      headerRow.getCell('D').value = 'Precio sin IVA';
      headerRow.getCell('E').value = 'Tipo';

      ['A', 'B', 'C', 'D'].forEach(col => {
        const cell = headerRow.getCell(col);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF366092' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      headerRow.height = 25;
      filaActual++;

      // 🆕 OBTENER MARCAS PARA ESTE PROVEEDOR (SIN CARGAR PRODUCTOS)
      // Aplicar filtros también aquí
      const queryMarcas = {
        ...query,
        proveedor: nombreProveedor
      };

      const marcas = await collection.distinct('aplicaciones.marca', queryMarcas);

      console.log(`  🚗 ${marcas.length} marcas en este proveedor`);

      // 🆕 PROCESAR MARCA POR MARCA
      for (const marca of marcas.filter(m => m).sort()) {
        // Agregar fila de MARCA
        const filaMarca = worksheet.getRow(filaActual);
        filaMarca.getCell('codigo').value = `*** ${marca} ***`;
        filaMarca.getCell('tipo').value = 'MARCA';

        worksheet.mergeCells(`A${filaActual}:D${filaActual}`);

        const celdaMarca = filaMarca.getCell('A');
        celdaMarca.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
        celdaMarca.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        celdaMarca.alignment = { horizontal: 'center', vertical: 'middle' };
        filaMarca.height = 30;

        filaActual++;

        // 🆕 OBTENER PRODUCTOS DE ESTA MARCA (CURSOR PARA LIBERAR MEMORIA)
        // Aplicar todos los filtros
        const queryProductos = {
          ...query,
          proveedor: nombreProveedor,
          'aplicaciones.marca': marca
        };

        const cursor = collection.find(
          queryProductos,
          {
            projection: {
              _id: 0,
              codigo: 1,
              nombre: 1,
              categoria: 1,
              stock_status: 1,
              precio_numerico: 1,
              precio_lista_con_iva: 1,
              aplicaciones: 1
            }
          }
        );

        // Agrupar productos únicos
        const productosUnicos = new Map();

        for await (const p of cursor) {
          const aplicMarca = p.aplicaciones?.filter(app => app.marca === marca) || [];

          const modelosCompatibles = new Set();
          aplicMarca.forEach(app => {
            if (app.modelo) modelosCompatibles.add(app.modelo);
          });

          if (modelosCompatibles.size === 0) {
            modelosCompatibles.add('Sin Modelo');
          }

          const claveUnica = `${p.codigo}_${marca}`;

          if (productosUnicos.has(claveUnica)) {
            const productoExistente = productosUnicos.get(claveUnica);
            modelosCompatibles.forEach(m => productoExistente.modelos.add(m));
          } else {
            const precio = p.precio_numerico || p.precio_lista_con_iva || 0;
            const precioSinIVA = (precio / 1.21).toFixed(2);

            productosUnicos.set(claveUnica, {
              codigo: p.codigo,
              descripcion: p.nombre,
              stock: p.stock_status || 'Sin información',
              precio: `$${precioSinIVA}`,
              categoria: p.categoria || 'Sin Categoría',
              modelos: new Set(modelosCompatibles)
            });
          }
        }

        // Agrupar por modelo
        const productosPorModelo = {};
        productosUnicos.forEach(producto => {
          producto.modelos.forEach(modelo => {
            if (!productosPorModelo[modelo]) {
              productosPorModelo[modelo] = {};
            }

            const categoria = producto.categoria;
            if (!productosPorModelo[modelo][categoria]) {
              productosPorModelo[modelo][categoria] = [];
            }

            productosPorModelo[modelo][categoria].push({
              codigo: producto.codigo,
              descripcion: producto.descripcion,
              stock: producto.stock,
              precio: producto.precio
            });
          });
        });

        // Limpiar memoria
        productosUnicos.clear();

        // Escribir modelos
        const modelos = Object.keys(productosPorModelo).sort();

        for (const modelo of modelos) {
          const filaModelo = worksheet.getRow(filaActual);
          filaModelo.getCell('codigo').value = `  >> ${modelo}`;
          filaModelo.getCell('tipo').value = 'MODELO';

          worksheet.mergeCells(`A${filaActual}:D${filaActual}`);

          const celdaModelo = filaModelo.getCell('A');
          celdaModelo.font = { bold: true, size: 11, color: { argb: 'FF000000' } };
          celdaModelo.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC000' }
          };
          celdaModelo.alignment = { horizontal: 'left', vertical: 'middle' };
          filaModelo.height = 24;

          filaActual++;

          const categorias = Object.keys(productosPorModelo[modelo]).sort();

          for (const categoria of categorias) {
            const filaCategoria = worksheet.getRow(filaActual);
            filaCategoria.getCell('codigo').value = `    • ${categoria}`;
            filaCategoria.getCell('tipo').value = 'CATEGORIA';

            worksheet.mergeCells(`A${filaActual}:D${filaActual}`);

            const celdaCategoria = filaCategoria.getCell('A');
            celdaCategoria.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
            celdaCategoria.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FF70AD47' }
            };
            celdaCategoria.alignment = { horizontal: 'left', vertical: 'middle' };
            filaCategoria.height = 20;

            filaActual++;

            const productosCategoria = productosPorModelo[modelo][categoria];

            productosCategoria.forEach(prod => {
              const filaProd = worksheet.getRow(filaActual);
              filaProd.getCell('codigo').value = prod.codigo;
              filaProd.getCell('descripcion').value = prod.descripcion;
              filaProd.getCell('stock').value = prod.stock;
              filaProd.getCell('precio').value = prod.precio;
              filaProd.getCell('tipo').value = 'PRODUCTO';
              filaProd.alignment = { vertical: 'middle' };
              filaActual++;
            });
          }
        }

        // Limpiar memoria después de cada marca
        for (const modelo in productosPorModelo) {
          delete productosPorModelo[modelo];
        }
      }

      worksheet.getColumn('tipo').hidden = true;
      console.log(`  ✅ Hoja "${nombreHoja}" completada`);
    }

    // GENERAR Y ENVIAR
    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date().toISOString().split('T')[0];

    // 🆕 Nombre de archivo personalizado según filtros
    let nombreArchivo = `productos_bethersa_${timestamp}`;
    if (proveedores) {
      nombreArchivo += `_${proveedores.split(',').join('-')}`;
    }
    if (categorias) {
      nombreArchivo += `_${categorias.split(',').slice(0, 2).join('-')}`;
    }
    nombreArchivo += '.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Length', buffer.length);

    console.log(`\n✅ [EXCEL] Exportación completada: ${nombreArchivo}`);
    console.log(`📊 Memoria usada: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);

    res.send(buffer);

  } catch (error) {
    console.error('❌ [EXCEL] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar el archivo Excel',
      details: error.message
    });
  }
});

// ===========================================================================
// ✏️ ENDPOINTS DE GESTIÓN DE PRODUCTOS
// ===========================================================================

// ---------------------------------------------------------------------------
// GET /api/categorias — Lista de categorías principales definidas en config
// ---------------------------------------------------------------------------
router.get('/categorias', (req, res) => {
  try {
    // Devuelve las claves del objeto CATEGORIAS ("Amortiguadores", "Bombas de Freno", etc.)
    const ordenadas = Object.keys(CATEGORIAS).sort((a, b) => a.localeCompare(b, 'es'));
    res.json({ success: true, data: ordenadas, total: ordenadas.length });
  } catch (error) {
    console.error('❌ [CATEGORIAS] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/producto/:codigo — Buscar producto por código exacto (acepta puntos y caracteres especiales)
// ---------------------------------------------------------------------------
router.get('/producto/:codigo(*)', async (req, res) => {
  try {
    const codigo = req.params.codigo.trim();
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Búsqueda exacta primero, luego fallback case-insensitive
    let producto = await collection.findOne(
      { codigo: codigo },
      { projection: { _id: 0 } }
    );

    if (!producto) {
      // Fallback: búsqueda case-insensitive
      producto = await collection.findOne(
        { codigo: { $regex: `^${codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        { projection: { _id: 0 } }
      );
    }

    if (!producto) {
      return res.status(404).json({
        success: false,
        error: `Producto con código "${codigo}" no encontrado`
      });
    }

    console.log(`✅ [GET-PRODUCTO] Código: ${codigo}`);
    res.json({ success: true, data: producto });

  } catch (error) {
    console.error('❌ [GET-PRODUCTO] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/producto/:codigo — Actualizar cualquier campo (body parcial)
// ---------------------------------------------------------------------------
router.patch('/producto/:codigo(*)', async (req, res) => {
  try {
    const { codigo } = req.params;
    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return res.status(400).json({ success: false, error: 'Body vacío, no hay campos para actualizar' });
    }

    // Campos que NO se pueden modificar vía esta ruta
    const camposProtegidos = ['_id', 'codigo'];
    camposProtegidos.forEach(c => delete body[c]);

    // Si viene precio_numerico, recalcular precio_lista_con_iva formateado
    if (body.precio_numerico !== undefined) {
      const num = parseFloat(body.precio_numerico);
      if (!isNaN(num)) {
        body.precio_numerico = num;
        body.tiene_precio_valido = num > 0;
        // Formato: "$1.234,56"
        body.precio_lista_con_iva = '$' + num.toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    }

    // Validar estructura de aplicaciones si viene en el body
    if (body.aplicaciones !== undefined) {
      if (!Array.isArray(body.aplicaciones)) {
        return res.status(400).json({ success: false, error: 'aplicaciones debe ser un array' });
      }
      for (const ap of body.aplicaciones) {
        if (typeof ap !== 'object' || !ap.marca || !ap.modelo || !ap.version) {
          return res.status(400).json({
            success: false,
            error: 'Cada aplicación debe tener { marca, modelo, version }'
          });
        }
      }
    }

    // Validar estructura de detalles_tecnicos
    if (body.detalles_tecnicos !== undefined) {
      if (typeof body.detalles_tecnicos !== 'object' || Array.isArray(body.detalles_tecnicos)) {
        return res.status(400).json({ success: false, error: 'detalles_tecnicos debe ser un objeto { Clave: Valor }' });
      }
    }

    // Validar estructura de equivalencias
    if (body.equivalencias !== undefined) {
      if (!Array.isArray(body.equivalencias)) {
        return res.status(400).json({ success: false, error: 'equivalencias debe ser un array' });
      }
      for (const eq of body.equivalencias) {
        if (typeof eq !== 'object' || !eq.marca || !eq.codigo) {
          return res.status(400).json({ success: false, error: 'Cada equivalencia requiere { marca, codigo }' });
        }
      }
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Búsqueda exacta primero
    let filtro = { codigo: codigo.trim() };

    // Verificar si existe con el trim exacto
    let productoExistente = await collection.findOne(filtro);

    // Fallback: case-insensitive y sin regex chars
    if (!productoExistente) {
      const cleanCod = codigo.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filtro = { codigo: { $regex: `^${cleanCod}$`, $options: 'i' } };
      productoExistente = await collection.findOne(filtro);
    }

    if (!productoExistente) {
      return res.status(404).json({ success: false, error: `Producto "${codigo}" no encontrado` });
    }

    // Actualizar usando el _id encontrado para evitar duplicados o errores en la query
    const result = await collection.updateOne(
      { _id: productoExistente._id },
      { $set: body }
    );

    console.log(`✅ [PATCH-PRODUCTO] Código: ${codigo} — Campos actualizados: ${Object.keys(body).join(', ')}`);
    res.json({
      success: true,
      message: `Producto ${codigo} actualizado correctamente`,
      camposActualizados: Object.keys(body)
    });

  } catch (error) {
    console.error('❌ [PATCH-PRODUCTO] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/categoria/:categoria/conteo — Conteo y precio promedio para preview
// ---------------------------------------------------------------------------
router.get('/categoria/:categoria/conteo', async (req, res) => {
  try {
    const { categoria } = req.params;
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const subcategorias = CATEGORIAS[categoria] || null;
    const filtro = subcategorias
      ? { categoria: { $in: subcategorias }, tiene_precio_valido: true }
      : { categoria: categoria, tiene_precio_valido: true };

    const [total, agg] = await Promise.all([
      collection.countDocuments(filtro),
      collection.aggregate([
        { $match: filtro },
        { $group: { _id: null, promedio: { $avg: '$precio_numerico' } } }
      ]).toArray()
    ]);

    const promedio = agg[0]?.promedio || 0;
    res.json({ success: true, total, promedio });

  } catch (error) {
    console.error('❌ [CONTEO-CATEGORIA] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/categoria/:categoria/precio-masivo — Aumento % en una categoría
// ---------------------------------------------------------------------------
router.patch('/categoria/:categoria/precio-masivo', async (req, res) => {
  try {
    const { categoria } = req.params;
    const { porcentaje } = req.body;

    if (porcentaje === undefined || isNaN(parseFloat(porcentaje))) {
      return res.status(400).json({ success: false, error: 'Se requiere "porcentaje" numérico en el body' });
    }

    const pct = parseFloat(porcentaje);
    if (pct <= -100) {
      return res.status(400).json({ success: false, error: 'El porcentaje no puede ser menor o igual a -100%' });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Obtener los productos de la categoría para recalcular precio_lista_con_iva
    const subcategorias = CATEGORIAS[categoria] || null;
    const filtroCategoria = subcategorias
      ? { categoria: { $in: subcategorias }, tiene_precio_valido: true }
      : { categoria: categoria, tiene_precio_valido: true };

    const productos = await collection.find(filtroCategoria, {
      projection: { _id: 1, codigo: 1, precio_numerico: 1 }
    }).toArray();

    if (productos.length === 0) {
      return res.status(404).json({ success: false, error: `No se encontraron productos en la categoría "${categoria}"` });
    }

    const factor = 1 + pct / 100;
    const bulkOps = productos.map(prod => {
      const nuevoPrecio = parseFloat((prod.precio_numerico * factor).toFixed(2));
      return {
        updateOne: {
          filter: { _id: prod._id },
          update: {
            $set: {
              precio_numerico: nuevoPrecio,
              precio_lista_con_iva: '$' + nuevoPrecio.toLocaleString('es-AR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })
            }
          }
        }
      };
    });

    const result = await collection.bulkWrite(bulkOps, { ordered: false });

    console.log(`✅ [PRECIO-MASIVO] Categoría: ${categoria} — Porcentaje: ${pct}% — Actualizados: ${result.modifiedCount}`);
    res.json({
      success: true,
      message: `Aumento del ${pct}% aplicado en la categoría "${categoria}"`,
      productosAfectados: result.modifiedCount
    });

  } catch (error) {
    console.error('❌ [PRECIO-MASIVO] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/importar-precios — Actualizar precios en lote desde array
// Body: { productos: [{codigo, precio_numerico}] }
// ---------------------------------------------------------------------------
router.post('/importar-precios', async (req, res) => {
  try {
    const { productos } = req.body;

    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ success: false, error: 'Se requiere array "productos" con al menos un elemento' });
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const bulkOps = [];
    const errores = [];

    for (const item of productos) {
      const { codigo, precio_numerico } = item;
      if (!codigo) { errores.push(`Fila sin código`); continue; }
      const num = parseFloat(precio_numerico);
      if (isNaN(num) || num <= 0) { errores.push(`Código ${codigo}: precio inválido`); continue; }

      bulkOps.push({
        updateOne: {
          filter: { codigo: String(codigo) },
          update: {
            $set: {
              precio_numerico: num,
              precio_lista_con_iva: '$' + num.toLocaleString('es-AR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }),
              tiene_precio_valido: true
            }
          }
        }
      });
    }

    let actualizados = 0;
    let noEncontrados = 0;

    if (bulkOps.length > 0) {
      const result = await collection.bulkWrite(bulkOps, { ordered: false });
      actualizados = result.modifiedCount;
      noEncontrados = bulkOps.length - actualizados;
    }

    console.log(`✅ [IMPORTAR-PRECIOS] Actualizados: ${actualizados}, No encontrados: ${noEncontrados}, Errores de validación: ${errores.length}`);
    res.json({
      success: true,
      actualizados,
      noEncontrados,
      erroresValidacion: errores.length,
      detalleErrores: errores.slice(0, 20) // Máximo 20 errores en la respuesta
    });

  } catch (error) {
    console.error('❌ [IMPORTAR-PRECIOS] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/producto — Crear un producto nuevo
// ---------------------------------------------------------------------------
router.post('/producto', async (req, res) => {
  try {
    const body = req.body;

    // Validaciones mínimas obligatorias
    if (!body.codigo || !body.nombre) {
      return res.status(400).json({ success: false, error: 'Los campos "codigo" y "nombre" son obligatorios' });
    }

    // Validar estructura de aplicaciones
    if (body.aplicaciones && !Array.isArray(body.aplicaciones)) {
      return res.status(400).json({ success: false, error: 'aplicaciones debe ser un array' });
    }
    if (Array.isArray(body.aplicaciones)) {
      for (const ap of body.aplicaciones) {
        if (!ap.marca || !ap.modelo || !ap.version) {
          return res.status(400).json({ success: false, error: 'Cada aplicación requiere { marca, modelo, version }' });
        }
      }
    }

    // Validar estructura de equivalencias
    if (body.equivalencias && !Array.isArray(body.equivalencias)) {
      return res.status(400).json({ success: false, error: 'equivalencias debe ser un array' });
    }
    if (Array.isArray(body.equivalencias)) {
      for (const eq of body.equivalencias) {
        if (!eq.marca || !eq.codigo) {
          return res.status(400).json({ success: false, error: 'Cada equivalencia requiere { marca, codigo }' });
        }
      }
    }

    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // Verificar que el código no exista (409 si ya existe)
    const existe = await collection.findOne({ codigo: String(body.codigo) }, { projection: { _id: 1 } });
    if (existe) {
      return res.status(409).json({
        success: false,
        error: `Ya existe un producto con el código "${body.codigo}"`
      });
    }

    // Calcular precio formateado si viene precio_numerico
    const nuevoProd = {
      codigo: String(body.codigo),
      nombre: body.nombre,
      marca: body.marca || 'SIN MARCA',
      categoria: body.categoria || '',
      proveedor: body.proveedor || '',
      url: body.url || '',
      imagenes: Array.isArray(body.imagenes) ? body.imagenes : [],
      aplicaciones: Array.isArray(body.aplicaciones) ? body.aplicaciones : [],
      equivalencias: Array.isArray(body.equivalencias) ? body.equivalencias : [],
      detalles_tecnicos: (typeof body.detalles_tecnicos === 'object' && !Array.isArray(body.detalles_tecnicos))
        ? body.detalles_tecnicos : {},
      precio_numerico: 0,
      precio_lista_con_iva: '$0,00',
      tiene_precio_valido: false,
      stock_status: body.stock_status || 'Consultar Stock',
      datos_completos: true,
      convertido_timestamp: new Date().toISOString()
    };

    if (body.precio_numerico) {
      const num = parseFloat(body.precio_numerico);
      if (!isNaN(num) && num > 0) {
        nuevoProd.precio_numerico = num;
        nuevoProd.tiene_precio_valido = true;
        nuevoProd.precio_lista_con_iva = '$' + num.toLocaleString('es-AR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
    }

    const result = await collection.insertOne(nuevoProd);

    console.log(`✅ [CREAR-PRODUCTO] Código: ${nuevoProd.codigo} — ID: ${result.insertedId}`);
    res.status(201).json({
      success: true,
      message: `Producto "${nuevoProd.codigo}" creado correctamente`,
      codigo: nuevoProd.codigo
    });

  } catch (error) {
    console.error('❌ [CREAR-PRODUCTO] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;