const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// =================================================================
// ===== CONFIGURACIÓN DE LA BASE DE DATOS MONGODB =================
// =================================================================
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lucasbeta101:rEeTjUzGt9boy4Zy@bether.qxglnnl.mongodb.net/?retryWrites=true&w=majority&appName=Bether";
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

let cachedClient = null;

async function connectToMongoDB() {
    if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
        return cachedClient;
    }
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    cachedClient = client;
    return client;
}

// =================================================================
// ===== CONSTANTES Y FUNCIONES AUXILIARES =========================
// =================================================================

const CATEGORIAS = {
    "Amortiguadores": ["Amort CORVEN", "Amort SADAR", "Amort SUPER PICKUP", "Amort LIP", "Amort PRO TUNNING"],
    "Barras": ["Barras HD SADAR"], "Bieletas": ["Bieletas CORVEN", "Bieletas SADAR"], "Brazos Suspension": ["Brazos Susp CORVEN", "Brazos Susp SADAR"],
    "Cazoletas": ["Cazoletas CORVEN", "Cazoletas SADAR"], "Discos y Campanas": ["Discos y Camp HF", "Discos y Camp CORVEN"],
    "Extremos": ["Extremos CORVEN", "Extremos SADAR"], "Axiales": ["Axiales CORVEN", "Axiales SADAR"], "Homocinéticas": ["Homocinéticas CORVEN", "Homocinéticas SADAR"],
    "Parrillas": ["Parrillas CORVEN", "Parrillas SADAR"], "Pastillas de Freno": ["Pastillas CORVEN C", "Pastillas CORVEN HT", "Pastillas FERODO", "Pastillas JURID"],
    "Rótulas": ["Rotulas CORVEN", "Rotulas SADAR"], "Embragues": ["Embragues CORVEN", "Embragues SADAR", "Embragues VALEO"],
    "Cajas y Bombas": ["Bombas Hid CORVEN", "Cajas Hid CORVEN", "Cajas Mec CORVEN"], "Rodamientos": ["Rodamientos CORVEN", "Rodamientos SADAR"],
    "Mazas": ["Mazas CORVEN", "Mazas HF"], "Semiejes": ["Semiejes CORVEN"], "Soportes Motor": ["Soporte Motor CORVEN"],
    "Suspensión Neumática": ["Susp Neumática SADAR"], "CTR": ["CTR"], "FTE": ["FTE"], "Gas Spring Stabilus": ["Gas Spring Stabilus"], "Otros": ["Otros"]
};

function normalizeText(text) {
    if (!text) return '';
    return text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\/\.\-]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
}

function getValidCategoriesForProduct(product) {
    const categoryMap = {
        'amortiguador': CATEGORIAS.Amortiguadores, 'pastilla': CATEGORIAS["Pastillas de Freno"], 'freno': [...CATEGORIAS["Pastillas de Freno"], ...CATEGORIAS["Discos y Campanas"]],
        'disco': CATEGORIAS["Discos y Campanas"], 'cazoleta': CATEGORIAS.Cazoletas, 'bieleta': CATEGORIAS.Bieletas, 'rotula': CATEGORIAS.Rótulas,
        'embrague': CATEGORIAS.Embragues, 'brazo': CATEGORIAS["Brazos Suspension"], 'extremo': CATEGORIAS.Extremos, 'axial': CATEGORIAS.Axiales,
        'homocinetica': CATEGORIAS.Homocinéticas, 'rodamiento': CATEGORIAS.Rodamientos, 'maza': CATEGORIAS.Mazas, 'semieje': CATEGORIAS.Semiejes,
        'soporte': CATEGORIAS["Soportes Motor"], 'parrilla': CATEGORIAS.Parrillas, 'barra': CATEGORIAS.Barras, 'caja': CATEGORIAS["Cajas y Bombas"],
        'bomba': CATEGORIAS["Cajas y Bombas"], 'suspension': CATEGORIAS["Suspensión Neumática"]
    };
    const normalizedProduct = normalizeText(product).replace(/s$/, '');
    return categoryMap[normalizedProduct] || [];
}

function mapPositionForSearch(position) {
    const positionMap = {
        'delantero': 'Delantero', 'del': 'Delantero', 'trasero': 'Trasero', 'pos': 'Trasero', 'izquierdo': 'Izquierdo', 'izq': 'Izquierdo',
        'derecho': 'Derecho', 'der': 'Derecho', 'superior': 'Superior', 'sup': 'Superior', 'inferior': 'Inferior', 'inf': 'Inferior',
    };
    return positionMap[normalizeText(position)] || position;
}

/**
 * ✅ NUEVA FUNCIÓN HELPER: Parsea una versión y determina si el año objetivo está en el rango.
 * Esta función es la clave para la lógica de rangos.
 */
function checkYearInRange(versionString, targetYear) {
    if (!versionString || !targetYear) return false;

    const version = String(versionString);
    const year = parseInt(targetYear);

    // Caso 1: Rango abierto hacia atrás, ej: (../81)
    let match = version.match(/\.\.\/(\d{2,4})/);
    if (match) {
        const endYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
        return year <= endYear;
    }

    // Caso 2: Rango abierto hacia adelante, ej: (81/..)
    match = version.match(/(\d{2,4})\/\.\./);
    if (match) {
        const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
        return year >= startYear;
    }

    // Caso 3: Rango cerrado, ej: (79/85)
    match = version.match(/(\d{2,4})\/(\d{2,4})/);
    if (match) {
        const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
        const endYear = parseInt(match[2].length === 2 ? '19' + match[2] : match[2]);
        return year >= startYear && year <= endYear;
    }
    
    // Caso 4: Año único, ej: (1980) o (80)
    match = version.match(/\(?(\d{2,4})\)?/);
    if (match) {
        const versionYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
        return year === versionYear;
    }

    return false;
}

/**
 * ✅ FUNCIÓN MODIFICADA: `parseNaturalQuery`
 * Ahora extrae el año de forma más robusta.
 */
function parseNaturalQuery(query) {
    const STOP_WORDS = ['para', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'con', 'mi', 'auto', 'modelo'];
    const productKeywords = ['amortiguador', 'pastilla', 'freno', 'disco', 'cazoleta', 'bieleta', 'rotula', 'embrague', 'brazo', 'extremo', 'axial', 'homocinetica', 'rodamiento', 'maza', 'semieje', 'soporte', 'parrilla', 'barra', 'caja', 'bomba', 'suspension'];
    const positionKeywords = ['delantero', 'trasero', 'izquierdo', 'derecho', 'superior', 'inferior', 'del', 'pos', 'izq', 'der', 'sup', 'inf'];
    const words = normalizeText(query).split(' ').filter(word => !STOP_WORDS.includes(word) && word.length > 1);
    const result = { product: null, position: null, year: null, vehicleTerms: [], isStructured: false, freeText: query };
    const remainingWords = [];

    for (const word of words) {
        if (!result.product && productKeywords.includes(word.replace(/s$/, ''))) {
            result.product = word.replace(/s$/, '');
        } else if (!result.position && positionKeywords.includes(word)) {
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
    console.log('🧐 [Parser con Rangos] Resultado:', result);
    return result;
}

/**
 * ✅ FUNCIÓN MODIFICADA: `buildSearchPipeline`
 * Ahora usa `$expr` para la lógica de rangos de años.
 */
function buildSearchPipeline(parsedQuery, limit, offset) {
    let matchConditions = { tiene_precio_valido: true };
    const andConditions = [];

    if (parsedQuery.isStructured) {
        if (parsedQuery.product) {
            const validCategories = getValidCategoriesForProduct(parsedQuery.product);
            if (validCategories.length > 0) {
                andConditions.push({ categoria: { $in: validCategories } });
            }
        }
        if (parsedQuery.position) {
            andConditions.push({ "detalles_tecnicos.Posición de la pieza": { $regex: mapPositionForSearch(parsedQuery.position), $options: 'i' } });
        }
        
        const vehicleTermsConditions = parsedQuery.vehicleTerms.map(term => ({ 
            "aplicaciones": { 
                $elemMatch: { 
                    $or: [
                        { "marca": { $regex: term, $options: 'i' } }, 
                        { "modelo": { $regex: term, $options: 'i' } }
                    ]
                }
            }
        }));
        if(vehicleTermsConditions.length > 0) {
            andConditions.push(...vehicleTermsConditions);
        }

        // --- LÓGICA DE RANGOS DE AÑO ---
        if (parsedQuery.year) {
            const targetYear = parseInt(parsedQuery.year);
            andConditions.push({
                "aplicaciones": {
                    $elemMatch: {
                        $expr: {
                            $function: {
                                body: `function(versionString, targetYear) {
                                    if (!versionString || !targetYear) return false;
                                    const version = String(versionString);
                                    const year = parseInt(targetYear);

                                    let match = version.match(/\\.\\.\\/(\\d{2,4})/);
                                    if (match) {
                                        const endYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
                                        return year <= endYear;
                                    }
                                    match = version.match(/(\\d{2,4})\\/\\.\\./);
                                    if (match) {
                                        const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
                                        return year >= startYear;
                                    }
                                    match = version.match(/(\\d{2,4})\\/(\\d{2,4})/);
                                    if (match) {
                                        const startYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
                                        const endYear = parseInt(match[2].length === 2 ? '19' + match[2] : match[2]);
                                        return year >= startYear && year <= endYear;
                                    }
                                    match = version.match(/\\(?(\\d{2,4})\\)?/);
                                    if (match) {
                                        const versionYear = parseInt(match[1].length === 2 ? '19' + match[1] : match[1]);
                                        return year === versionYear;
                                    }
                                    return false;
                                }`,
                                args: ["$version", targetYear],
                                lang: "js"
                            }
                        }
                    }
                }
            });
        }
        
        if(andConditions.length > 0) {
            matchConditions.$and = andConditions;
        }

    } else {
        const keywords = normalizeText(parsedQuery.freeText).split(' ').filter(k => k.length > 0);
        if (keywords.length > 0) {
            matchConditions.$and = keywords.map(word => ({ $or: [{ codigo: { $regex: word, $options: 'i' } }, { nombre: { $regex: word, $options: 'i' } }] }));
        }
    }

    console.log('🚨 [Pipeline con Rangos] $match final:', JSON.stringify(matchConditions));
    return [{ $match: matchConditions }, { $sort: { codigo: 1 } }, { $skip: offset }, { $limit: limit }, { $project: { _id: 0 } }];
}


// =================================================================
// ===== DEFINICIÓN DE RUTAS DE LA API (Sin cambios) ===============
// =================================================================

router.get('/ping', async (req, res) => {
    try {
        const client = await connectToMongoDB();
        await client.db(DB_NAME).command({ ping: 1 });
        res.json({ success: true, message: 'Pong! Conexión a MongoDB OK.' });
    } catch (error) { res.status(500).json({ success: false, message: 'Error al conectar con MongoDB.', error: error.message }); }
});

router.get('/metadatos', async (req, res) => {
    try {
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const metadatos = await collection.find({}, {
            projection: { codigo: 1, categoria: 1, marca: 1, nombre: 1, aplicaciones: 1, "detalles_tecnicos.Posición de la pieza": 1, _id: 0 }
        }).toArray();
        res.json({ success: true, count: metadatos.length, data: metadatos });
    } catch (error) { res.status(500).json({ success: false, error: 'Error al obtener metadatos' }); }
});

router.get('/productos', async (req, res) => {
    try {
        const { categoria, marca, modelo, version, posicion, pagina = 1, limite = 15 } = req.query;
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const filtros = { tiene_precio_valido: true };
        if (categoria && categoria !== 'todos') filtros.categoria = CATEGORIAS[categoria] ? { $in: CATEGORIAS[categoria] } : categoria;
        if (marca) filtros["aplicaciones.marca"] = marca;
        if (modelo) filtros["aplicaciones.modelo"] = modelo;
        if (version) filtros["aplicaciones.version"] = version;
        if (posicion) filtros["detalles_tecnicos.Posición de la pieza"] = posicion;
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const totalProductos = await collection.countDocuments(filtros);
        const productos = await collection.find(filtros).sort({ codigo: 1 }).skip(skip).limit(parseInt(limite)).toArray();
        res.json({ success: true, data: productos, pagination: { currentPage: parseInt(pagina), totalPages: Math.ceil(totalProductos / limite), totalProducts: totalProductos } });
    } catch (error) { res.status(500).json({ success: false, error: 'Error al obtener productos' }); }
});

router.get('/producto/:codigo', async (req, res) => {
    try {
        const { codigo } = req.params;
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const producto = await collection.findOne({ codigo }, { projection: { _id: 0 } });
        if (!producto) return res.status(404).json({ success: false, error: 'Producto no encontrado' });
        res.json({ success: true, data: producto });
    } catch (error) { res.status(500).json({ success: false, error: 'Error al obtener producto' }); }
});

router.get('/filtros/:tipo', async (req, res) => {
    try {
        const { tipo } = req.params;
        const { categoria, marca, modelo } = req.query;
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const filtrosBase = {};
        if (categoria && categoria !== 'todos') filtrosBase.categoria = CATEGORIAS[categoria] ? { $in: CATEGORIAS[categoria] } : categoria;
        let pipeline;
        switch (tipo) {
            case 'marcas': pipeline = [{ $match: filtrosBase }, { $unwind: "$aplicaciones" }, { $group: { _id: "$aplicaciones.marca" } }, { $sort: { _id: 1 } }, { $project: { _id: 0, marca: "$_id" } }]; break;
            case 'modelos': if (!marca) return res.status(400).json({ success: false, error: 'Marca requerida' }); pipeline = [{ $match: { ...filtrosBase, "aplicaciones.marca": marca } }, { $unwind: "$aplicaciones" }, { $match: { "aplicaciones.marca": marca } }, { $group: { _id: "$aplicaciones.modelo" } }, { $sort: { _id: 1 } }, { $project: { _id: 0, modelo: "$_id" } }]; break;
            case 'versiones': if (!marca || !modelo) return res.status(400).json({ success: false, error: 'Marca y modelo requeridos' }); pipeline = [{ $match: { ...filtrosBase, "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } }, { $unwind: "$aplicaciones" }, { $match: { "aplicaciones.marca": marca, "aplicaciones.modelo": modelo } }, { $group: { _id: "$aplicaciones.version" } }, { $sort: { _id: 1 } }, { $project: { _id: 0, version: "$_id" } }]; break;
            case 'posiciones': if (marca) filtrosBase["aplicaciones.marca"] = marca; if (modelo) filtrosBase["aplicaciones.modelo"] = modelo; pipeline = [{ $match: filtrosBase }, { $group: { _id: "$detalles_tecnicos.Posición de la pieza" } }, { $match: { _id: { $ne: null, $exists: true } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, posicion: "$_id" } }]; break;
            default: return res.status(400).json({ success: false, error: 'Tipo de filtro inválido' });
        }
        const resultado = await collection.aggregate(pipeline).toArray();
        res.json({ success: true, data: resultado });
    } catch (error) { res.status(500).json({ success: false, error: 'Error al obtener filtros' }); }
});

router.get('/metadatos-busqueda', async (req, res) => {
    try {
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const metadatos = await collection.find({}, { projection: { codigo: 1, nombre: 1, categoria: 1, marca: 1, "aplicaciones.marca": 1, "aplicaciones.modelo": 1, _id: 0 } }).toArray();
        const searchIndex = { codes: new Set(), brands: new Set(), models: new Set(), categories: new Set(), vehicles: new Set() };
        metadatos.forEach(p => {
            searchIndex.codes.add(p.codigo); searchIndex.categories.add(p.categoria); if (p.marca) searchIndex.brands.add(p.marca);
            p.aplicaciones?.forEach(a => { if (a.marca) searchIndex.brands.add(a.marca); if (a.modelo) searchIndex.models.add(a.modelo); if (a.marca && a.modelo) searchIndex.vehicles.add(`${a.marca} ${a.modelo}`); });
        });
        res.json({ success: true, count: metadatos.length, searchIndex: { codes: [...searchIndex.codes], brands: [...searchIndex.brands], models: [...searchIndex.models], categories: [...searchIndex.categories], vehicles: [...searchIndex.vehicles] } });
    } catch (error) { res.status(500).json({ success: false, error: 'Error al obtener metadatos para búsqueda' }); }
});

router.get('/sugerencias', async (req, res) => {
    try {
        const { q, limit = 8 } = req.query;
        if (!q || q.trim().length < 2) return res.json({ success: true, suggestions: [] });
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const regex = new RegExp(`^${normalizeText(q)}`, 'i');
        const pipeline = [
            { $match: { $or: [{ codigo: regex }, { nombre: regex }, { "aplicaciones.marca": regex }, { "aplicaciones.modelo": regex }] } },
            { $limit: 20 },
            { $project: { codigo: 1, nombre: 1, "aplicaciones.marca": 1, "aplicaciones.modelo": 1, _id: 0 } }
        ];
        const results = await collection.aggregate(pipeline).toArray();
        const suggestions = new Set();
        results.forEach(p => {
            if (p.codigo.match(regex)) suggestions.add(p.codigo);
            p.aplicaciones?.forEach(a => { if (a.marca?.match(regex)) suggestions.add(a.marca); if (a.modelo?.match(regex)) suggestions.add(a.modelo); });
        });
        res.json({ success: true, suggestions: Array.from(suggestions).slice(0, parseInt(limit)) });
    } catch (error) { res.status(500).json({ success: false, error: 'Error al obtener sugerencias' }); }
});

router.get('/busqueda', async (req, res) => {
    try {
        const { q, limit = 20, offset = 0 } = req.query;
        if (!q || q.trim().length < 2) return res.status(400).json({ success: false, error: 'Consulta requerida' });
        const client = await connectToMongoDB();
        const collection = client.db(DB_NAME).collection(COLLECTION_NAME);
        const parsedQuery = parseNaturalQuery(q);
        const pipeline = buildSearchPipeline(parsedQuery, parseInt(limit), parseInt(offset));
        const results = await collection.aggregate(pipeline).toArray();
        res.json({ success: true, query: q, parsedQuery, results, totalResults: results.length });
    } catch (error) { res.status(500).json({ success: false, error: 'Error en búsqueda', details: error.message }); }
});

// =================================================================
// ===== EXPORTACIÓN DEL ROUTER ====================================
// =================================================================
module.exports = router;
