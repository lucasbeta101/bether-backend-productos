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