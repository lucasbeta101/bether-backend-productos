const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// =================================================================
// ===== CONFIGURACIÓN DE LA BASE DE DATOS MONGODB =================
// =================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// Variable para reutilizar la conexión a la base de datos
let cachedClient = null;

/**
 * Conecta a la base de datos MongoDB, reutilizando la conexión si ya existe.
 * @returns {Promise<MongoClient>} Cliente de MongoDB conectado.
 */
async function connectToMongoDB() {
    if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
        return cachedClient;
    }
    console.log('🔌 [MONGODB] Creando nueva conexión a la base de datos...');
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        console.log('✅ [MONGODB] Conectado exitosamente a la base de datos:', DB_NAME);
        cachedClient = client;
        return client;
    } catch (error) {
        console.error('❌ [MONGODB] Error de conexión:', error);
        throw error;
    }
}

// =================================================================
// ===== CONSTANTES Y FUNCIONES AUXILIARES =========================
// =================================================================

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
function checkYearInRange(versionString, targetYear) {
  if (!versionString || !targetYear) return false;

  const version = String(versionString);
  const year = parseInt(targetYear);

  // Caso 1: Rango abierto hacia atrás, ej: (../81) o ../81
  let match = version.match(/\.\.\/(\d{2,4})/);
  if (match) {
      // Si el año es de 2 dígitos (ej. 81), lo convierte a 1981.
      const endYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
      return year <= endYear;
  }

  // Caso 2: Rango abierto hacia adelante, ej: (81/..) o 81/..
  match = version.match(/(\d{2,4})\/\.\./);
  if (match) {
      const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
      return year >= startYear;
  }

  // Caso 3: Rango cerrado, ej: (79/85) o 79/85
  match = version.match(/(\d{2,4})\/(\d{2,4})/);
  if (match) {
      const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
      const endYear = parseInt(match[2].length === 2 ? '19' + match[2] : match[2]);
      return year >= startYear && year <= endYear;
  }
  
  // Caso 4: Año único, ej: (1980) o (80) o 80
  match = version.match(/\(?(\d{2,4})\)?/);
  if (match) {
      const versionYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
      return year === versionYear;
  }

  return false;
}

function parseNaturalQuery(query) {
  console.log('🧐 [Parser v6] Iniciando parseo para:', query);
  const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'auto', 'modelo'];
  
  // ✅ LISTA DE KEYWORDS ACTUALIZADA CON TODAS LAS POSICIONES
  const productKeywords = ['amortiguador', 'pastilla', 'freno', 'disco', 'cazoleta', 'bieleta', 'rotula', 'embrague', 'brazo', 'extremo', 'axial', 'homocinetica', 'rodamiento', 'maza', 'semieje', 'soporte', 'parrilla', 'barra', 'caja', 'bomba', 'suspension'];
  const positionKeywords = [
      'delantero', 'trasero', 'izquierdo', 'derecho', 'superior', 'inferior',
      'del', 'pos', 'izq', 'der', 'sup', 'inf', // Abreviaturas
      'lado', 'porton', 'capot', 'baul', 'exterior', 'interior', 'diferencial',
      'extremo', 'fuelle', 'corona', 'lateral' // Nuevas palabras clave de tu lista
  ];
  
  const words = normalizeText(query).split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 1);
  const result = { product: null, position: null, year: null, vehicleTerms: [], isStructured: false, freeText: query };
  const remainingWords = [];

  for (const word of words) {
      if (!result.product && productKeywords.includes(word.replace(/s$/, ''))) {
          result.product = word.replace(/s$/, '');
      } else if (!result.position && positionKeywords.includes(word)) {
          // Si la palabra es un indicador de posición, la guardamos.
          result.position = word;
      } else if (!result.year && /^\d{4}$/.test(word)) { // Año de 4 dígitos
          result.year = word;
      } else if (!result.year && /^\d{2}$/.test(word)) { // Año de 2 dígitos
          result.year = String((parseInt(word) > 30 ? 1900 : 2000) + parseInt(word));
      } else {
          remainingWords.push(word);
      }
  }
  result.vehicleTerms = remainingWords;
  if (result.product || result.position || result.year || result.vehicleTerms.length > 0) {
      result.isStructured = true;
  }
  console.log('🧐 [Parser v6] Resultado:', result);
  return result;
}

function buildSearchPipeline(parsedQuery, limit, offset) {
  let matchConditions = { tiene_precio_valido: true };
  console.log('🛠️ [Pipeline sin Año] Query Recibida:', JSON.stringify(parsedQuery, null, 2));

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

  console.log('🚨 [Pipeline sin Año] CONSULTA FINAL $match:', JSON.stringify(matchConditions, null, 2));
  
  const pipeline = [ { $match: matchConditions }, { $sort: { codigo: 1 } } ];

  if(offset > 0) {
      pipeline.push({ $skip: offset });
  }

  pipeline.push({ $limit: limit });
  pipeline.push({ $project: { _id: 0 } });

  return pipeline;
}

// =================================================================
// ===== DEFINICIÓN DE RUTAS DE LA API =============================
// =================================================================

// 1. RUTA DE BÚSQUEDA INTELIGENTE
router.get('/metadatos', async (req, res) => {
  try {
      console.log('📋 [METADATOS] Iniciando carga de metadatos para el catálogo...');
      const client = await connectToMongoDB();
      const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
      const metadatos = await collection.find({}, {
          projection: { codigo: 1, categoria: 1, marca: 1, nombre: 1, aplicaciones: 1, "detalles_tecnicos.Posición de la pieza": 1, _id: 0 }
      }).toArray();
      console.log(`✅ [METADATOS] ${metadatos.length} metadatos cargados.`);
      res.json({ success: true, count: metadatos.length, data: metadatos });
  } catch (error) {
      console.error('❌ [METADATOS] Error:', error);
      res.status(500).json({ success: false, error: 'Error al obtener metadatos' });
  }
});
router.get('/busqueda', async (req, res) => {
  try {
      const { q, limit = 20, offset = 0 } = req.query;
      if (!q || q.trim().length < 2) {
          return res.status(400).json({ success: false, error: 'Consulta requerida' });
      }

      const client = await connectToMongoDB();
      const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
      
      const parsedQuery = parseNaturalQuery(q.trim());
      
      // Pedimos más resultados a la BD para tener margen para filtrar por año
      const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit) * 5, parseInt(offset));

      let results = await collection.aggregate(pipeline).toArray();
      
      // ✅ FILTRADO POR RANGO DE AÑO EN JAVASCRIPT
      if (parsedQuery.year && results.length > 0) {
          console.log(`[FILTRO JS] Filtrando ${results.length} resultados para el año ${parsedQuery.year}...`);
          const targetYear = parseInt(parsedQuery.year);
          
          results = results.filter(product => {
              if (!product.aplicaciones || product.aplicaciones.length === 0) {
                  return false;
              }
              // Mantenemos el producto si CUALQUIERA de sus aplicaciones coincide con el rango de año
              return product.aplicaciones.some(app => checkYearInRange(app.version, targetYear));
          });

          console.log(`[FILTRO JS] ${results.length} resultados restantes después del filtro de año.`);
      }

      // Aplicamos el límite final después de todo el filtrado
      const finalResults = results.slice(0, parseInt(limit));

      res.json({
          success: true,
          query: q,
          parsedQuery: parsedQuery,
          results: finalResults,
          totalResults: finalResults.length,
      });

  } catch (error) {
      console.error('❌ [BÚSQUEDA] Error en la ruta /busqueda:', error);
      res.status(500).json({ success: false, error: 'Error en búsqueda', details: error.message });
  }
});

// 2. RUTA DE PRODUCTOS (con filtros)
router.get('/productos', async (req, res) => {
    try {
        const { categoria, marca, modelo, version, posicion, pagina = 1, limite = 15, ordenar = 'codigo' } = req.query;
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const filtros = { tiene_precio_valido: true };
        if (categoria && categoria !== 'todos') {
            filtros.categoria = CATEGORIAS[categoria] ? { $in: CATEGORIAS[categoria] } : categoria;
        }
        const aplicacionesFiltro = {};
        if (marca) aplicacionesFiltro["aplicaciones.marca"] = marca;
        if (modelo) aplicacionesFiltro["aplicaciones.modelo"] = modelo;
        if (version) aplicacionesFiltro["aplicaciones.version"] = version;
        if (marca || modelo || version) {
            Object.assign(filtros, aplicacionesFiltro);
        }
        if (posicion) {
            filtros["detalles_tecnicos.Posición de la pieza"] = posicion;
        }
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const limiteInt = parseInt(limite);
        const sort = { [ordenar]: 1 };
        const pipeline = [
            { $match: filtros },
            { $sort: sort },
            { $facet: {
                data: [{ $skip: skip }, { $limit: limiteInt }],
                totalCount: [{ $count: "count" }]
            }}
        ];
        const result = await collection.aggregate(pipeline).toArray();
        const productos = result[0].data;
        const totalProductos = result[0].totalCount[0]?.count || 0;
        const totalPaginas = Math.ceil(totalProductos / limiteInt);
        res.json({
            success: true,
            data: productos,
            pagination: { currentPage: parseInt(pagina), totalPages: totalPaginas, totalProducts: totalProductos, productsPerPage: limiteInt },
            filters: { categoria, marca, modelo, version, posicion }
        });
    } catch (error) {
        console.error('❌ [PRODUCTOS] Error:', error);
        res.status(500).json({ success: false, error: 'Error al obtener productos', details: error.message });
    }
});

// 3. RUTA DE PRODUCTO INDIVIDUAL
router.get('/producto/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        if (!codigo) {
            return res.status(400).json({ success: false, error: 'Código de producto requerido' });
        }
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const producto = await collection.findOne({ codigo: codigo }, { projection: { _id: 0 } });
        if (!producto) {
            return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        }
        res.json({ success: true, data: producto });
    } catch (error) {
        console.error('❌ [PRODUCTO] Error:', error);
        res.status(500).json({ success: false, error: 'Error al obtener producto', details: error.message });
    }
});

// 4. RUTA PARA OBTENER FILTROS DINÁMICOS (marcas, modelos, etc.)
router.get('/filtros/:tipo', async (req, res) => {
    try {
        const { tipo } = req.params;
        const { categoria, marca, modelo } = req.query;
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const filtrosBase = {};
        if (categoria && categoria !== 'todos') {
            filtrosBase.categoria = CATEGORIAS[categoria] ? { $in: CATEGORIAS[categoria] } : categoria;
        }
        let pipeline;
        switch (tipo) {
            case 'marcas':
                pipeline = [{ $match: filtrosBase }, { $unwind: "$aplicaciones" }, { $group: { _id: "$aplicaciones.marca" } }, { $sort: { _id: 1 } }, { $project: { _id: 0, marca: "$_id" } }];
                break;
            case 'modelos':
                if (!marca) return res.status(400).json({ success: false, error: 'Marca requerida' });
                pipeline = [{ $match: { ...filtrosBase, "aplicaciones.marca": marca } }, { $unwind: "$aplicaciones" }, { $match: { "aplicaciones.marca": marca } }, { $group: { _id: "$aplicaciones.modelo" } }, { $sort: { _id: 1 } }, { $project: { _id: 0, modelo: "$_id" } }];
                break;
            case 'versiones':
                 if (!marca || !modelo) return res.status(400).json({ success: false, error: 'Marca y modelo requeridos' });
                pipeline = [{ $match: { ...filtrosBase, "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } }, { $unwind: "$aplicaciones" }, { $match: { "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } }, { $group: { _id: "$aplicaciones.version" } }, { $sort: { _id: 1 } }, { $project: { _id: 0, version: "$_id" } }];
                break;
            case 'posiciones':
                if (marca) filtrosBase["aplicaciones.marca"] = marca;
                if (modelo) filtrosBase["aplicaciones.modelo"] = modelo;
                pipeline = [{ $match: filtrosBase }, { $group: { _id: "$detalles_tecnicos.Posición de la pieza" } }, { $match: { _id: { $ne: null, $exists: true } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, posicion: "$_id" } }];
                break;
            default:
                return res.status(400).json({ success: false, error: 'Tipo de filtro inválido' });
        }
        const resultado = await collection.aggregate(pipeline).toArray();
        res.json({ success: true, tipo: tipo, data: resultado, count: resultado.length });
    } catch (error) {
        console.error('❌ [FILTROS] Error:', error);
        res.status(500).json({ success: false, error: 'Error al obtener filtros', details: error.message });
    }
});

// 5. RUTA DE PING
router.get('/ping', async (req, res) => {
    try {
        const client = await connectToMongoDB();
        await client.db(DB_NAME).command({ ping: 1 });
        res.json({ success: true, message: 'Pong! Conexión a MongoDB OK.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error al conectar con MongoDB.', error: error.message });
    }
});

// 6. RUTA DE METADATOS PARA BÚSQUEDA (LA QUE FALTABA)
router.get('/metadatos-busqueda', async (req, res) => {
    try {
        console.log('🧠 [METADATOS-BÚSQUEDA] Cargando datos livianos...');
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const metadatos = await collection.find({}, {
            projection: {
                codigo: 1, nombre: 1, categoria: 1, marca: 1,
                "aplicaciones.marca": 1, "aplicaciones.modelo": 1, "aplicaciones.version": 1,
                _id: 0
            }
        }).toArray();
        const searchIndex = {
            codes: [], brands: new Set(), models: new Set(), categories: new Set(), vehicles: new Set()
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
        res.status(500).json({ success: false, error: 'Error al obtener metadatos de búsqueda', details: error.message });
    }
});

// 7. RUTA DE SUGERENCIAS PARA AUTOCOMPLETADO
router.get('/sugerencias', async (req, res) => {
    try {
        const { q, limit = 8 } = req.query;
        if (!q || q.trim().length < 2) {
            return res.json({ success: true, suggestions: [] });
        }
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const suggestions = new Set();
        const normalizedQuery = normalizeText(q);

        const codigoMatches = await collection.find(
            { codigo: { $regex: `^${normalizedQuery}`, $options: 'i' } },
            { projection: { codigo: 1, _id: 0 }, limit: 3 }
        ).toArray();
        codigoMatches.forEach(p => suggestions.add(p.codigo));

        const vehicleMatches = await collection.aggregate([
            { $unwind: "$aplicaciones" },
            { $match: { 
                $or: [
                    { "aplicaciones.marca": { $regex: `^${normalizedQuery}`, $options: 'i' } },
                    { "aplicaciones.modelo": { $regex: `^${normalizedQuery}`, $options: 'i' } }
                ]
            }},
            { $group: { _id: null, marcas: { $addToSet: "$aplicaciones.marca" }, modelos: { $addToSet: "$aplicaciones.modelo" }}},
            { $limit: 1 }
        ]).toArray();

        if (vehicleMatches.length > 0) {
            const { marcas, modelos } = vehicleMatches[0];
            marcas.slice(0, 2).forEach(marca => suggestions.add(marca));
            modelos.slice(0, 2).forEach(modelo => suggestions.add(modelo));
        }

        const finalSuggestions = Array.from(suggestions).slice(0, parseInt(limit));
        res.json({ success: true, query: q, suggestions: finalSuggestions, count: finalSuggestions.length });
    } catch (error) {
        console.error('❌ [SUGERENCIAS] Error:', error);
        res.status(500).json({ success: false, error: 'Error al obtener sugerencias' });
    }
});

// =================================================================
// ===== EXPORTACIÓN DEL ROUTER ====================================
// =================================================================
// ¡IMPORTANTE! Esta línea debe ser la última del archivo.
module.exports = router;
