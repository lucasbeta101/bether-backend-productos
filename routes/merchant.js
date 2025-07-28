// routes/merchant.js - Nueva ruta para Google Merchant Center
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { MongoClient } = require('mongodb');

// ===== CONFIGURACIÓN =====
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "autopartes";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "productos";

// Configuración Google Merchant
const GOOGLE_MERCHANT_ID = process.env.GOOGLE_MERCHANT_ID;
const GOOGLE_CREDENTIALS = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');

// Cliente MongoDB reutilizable
let cachedClient = null;

async function connectToMongoDB() {
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    return cachedClient;
  }

  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  await client.connect();
  cachedClient = client;
  return client;
}

// ===== CONFIGURAR GOOGLE MERCHANT API =====
async function initGoogleMerchant() {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: GOOGLE_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/content']
    });

    const authClient = await auth.getClient();
    const content = google.content({ version: 'v2.1', auth: authClient });
    
    return content;
  } catch (error) {
    console.error('❌ [MERCHANT] Error inicializando API:', error);
    throw error;
  }
}

// ===== TRANSFORMAR PRODUCTO A FORMATO GOOGLE MERCHANT =====
function transformarProductoMerchant(producto) {
  // Extraer marca del nombre del producto
  const extraerMarca = (nombre) => {
    const marcas = ['VALEO', 'CORVEN', 'SADAR', 'FERODO', 'JURID', 'LIP', 'SUPER PICKUP'];
    for (const marca of marcas) {
      if (nombre.toUpperCase().includes(marca)) {
        return marca;
      }
    }
    return producto.marca || 'BETHERSA';
  };

  // Determinar disponibilidad
  const mapearDisponibilidad = (stockStatus) => {
    const stockMap = {
      'Stock alto': 'in stock',
      'Stock medio': 'in stock',
      'Stock bajo': 'limited availability',
      'Sin stock': 'out of stock'
    };
    return stockMap[stockStatus] || 'in stock';
  };

  // Crear descripción rica
  const crearDescripcion = (producto) => {
    let descripcion = producto.nombre;
    
    // Agregar detalles técnicos
    if (producto.detalles_tecnicos) {
      const detalles = Object.entries(producto.detalles_tecnicos)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      descripcion += `\n\nEspecificaciones: ${detalles}`;
    }
    
    // Agregar aplicaciones (primeras 5)
    if (producto.aplicaciones && producto.aplicaciones.length > 0) {
      const aplicaciones = producto.aplicaciones
        .slice(0, 5)
        .map(app => `${app.marca} ${app.modelo} ${app.version || ''}`.trim())
        .join(', ');
      descripcion += `\n\nCompatible con: ${aplicaciones}`;
    }
    
    // Agregar equivalencias
    if (producto.equivalencias && producto.equivalencias.length > 0) {
      const equivalencias = producto.equivalencias
        .map(eq => `${eq.marca}: ${eq.codigo}`)
        .join(', ');
      descripcion += `\n\nEquivalencias: ${equivalencias}`;
    }
    
    return descripcion.substring(0, 5000); // Google limit
  };

  // Categorizar producto
  const categorizarProducto = (categoria) => {
    const categoriaMap = {
      'Amort': 'Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Suspension Parts > Motor Vehicle Shock Absorbers',
      'Pastillas': 'Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Brake Parts > Motor Vehicle Brake Pads',
      'Embragues': 'Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Transmission Parts > Motor Vehicle Clutches',
      'Discos y Camp': 'Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Brake Parts > Motor Vehicle Brake Rotors',
      'Rotulas': 'Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Suspension Parts',
      'Brazos Susp': 'Vehicle Parts & Accessories > Motor Vehicle Parts > Motor Vehicle Suspension Parts'
    };
    
    for (const [key, value] of Object.entries(categoriaMap)) {
      if (categoria.includes(key)) {
        return value;
      }
    }
    return 'Vehicle Parts & Accessories > Motor Vehicle Parts';
  };

  const marca = extraerMarca(producto.nombre);
  const precio = parseFloat(producto.precio_numerico) || 0;
  
  return {
    offerId: producto.codigo,
    title: producto.nombre.substring(0, 150), // Google limit
    description: crearDescripcion(producto),
    link: `https://bethersa.com.ar/producto?id=${producto.codigo}`,
    imageLink: producto.imagenes?.[0] || 'https://bethersa.com.ar/img/placeholder-producto.webp',
    contentLanguage: 'es',
    targetCountry: 'AR',
    channel: 'online',
    availability: mapearDisponibilidad(producto.stock_status),
    condition: 'new',
    googleProductCategory: categorizarProducto(producto.categoria),
    productType: producto.categoria,
    brand: marca,
    mpn: producto.codigo,
    price: {
      value: precio.toString(),
      currency: 'ARS'
    },
    gtin: undefined, // No tenemos códigos de barras
    customAttributes: [
      {
        name: 'posicion',
        value: producto.detalles_tecnicos?.["Posición de la pieza"] || 'No especificada'
      },
      {
        name: 'aplicaciones_count',
        value: producto.cantidad_aplicaciones?.toString() || '0'
      }
    ]
  };
}

// ===== ENDPOINTS =====

// 🔧 TEST: Verificar configuración
router.get('/test-config', async (req, res) => {
  try {
    const hasCredentials = !!GOOGLE_CREDENTIALS.type;
    const hasMerchantId = !!GOOGLE_MERCHANT_ID;
    
    if (!hasCredentials || !hasMerchantId) {
      return res.json({
        success: false,
        error: 'Configuración incompleta',
        config: {
          hasCredentials,
          hasMerchantId,
          credentialsType: GOOGLE_CREDENTIALS.type || 'missing'
        }
      });
    }

    // Test API connection
    const content = await initGoogleMerchant();
    
    res.json({
      success: true,
      message: 'Configuración correcta',
      merchantId: GOOGLE_MERCHANT_ID,
      credentialsType: GOOGLE_CREDENTIALS.type
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔄 TEST: Transformar un producto individual
router.get('/test-transform/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    const producto = await collection.findOne({ codigo: codigo });
    
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const productoTransformado = transformarProductoMerchant(producto);
    
    res.json({
      success: true,
      original: producto,
      transformed: productoTransformado
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 📤 Subir producto individual a Google Merchant
router.post('/upload-product/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    const producto = await collection.findOne({ codigo: codigo });
    
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const content = await initGoogleMerchant();
    const productoTransformado = transformarProductoMerchant(producto);
    
    console.log(`📤 [MERCHANT] Subiendo producto ${codigo}...`);
    
    const request = {
      merchantId: GOOGLE_MERCHANT_ID,
      requestBody: productoTransformado
    };
    
    const response = await content.products.insert(request);
    
    console.log(`✅ [MERCHANT] Producto ${codigo} subido exitosamente`);
    
    res.json({
      success: true,
      productId: codigo,
      merchantResponse: response.data
    });
    
  } catch (error) {
    console.error(`❌ [MERCHANT] Error subiendo ${req.params.codigo}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || null
    });
  }
});

// 📤 Subida masiva por lotes
router.post('/upload-batch', async (req, res) => {
  try {
    const { limit = 100, categoria = null } = req.body;
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Filtros
    let matchConditions = { 
      tiene_precio_valido: true,
      datos_completos: true 
    };
    
    if (categoria) {
      matchConditions.categoria = categoria;
    }
    
    const productos = await collection
      .find(matchConditions)
      .limit(parseInt(limit))
      .toArray();
    
    console.log(`📦 [MERCHANT] Procesando lote de ${productos.length} productos...`);
    
    const content = await initGoogleMerchant();
    const batchSize = 100; // Google Merchant limit
    const results = [];
    
    // Procesar en lotes de 100
    for (let i = 0; i < productos.length; i += batchSize) {
      const batch = productos.slice(i, i + batchSize);
      
      const entries = batch.map((producto, index) => ({
        batchId: (i + index + 1).toString(),
        merchantId: GOOGLE_MERCHANT_ID,
        method: 'insert',
        product: transformarProductoMerchant(producto)
      }));
      
      try {
        const batchRequest = {
          requestBody: { entries }
        };
        
        const response = await content.products.custombatch(batchRequest);
        
        console.log(`✅ [MERCHANT] Lote ${Math.floor(i/batchSize) + 1} procesado`);
        
        results.push({
          batchIndex: Math.floor(i/batchSize) + 1,
          productsCount: batch.length,
          response: response.data
        });
        
        // Pausa entre lotes para evitar rate limits
        if (i + batchSize < productos.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
      } catch (batchError) {
        console.error(`❌ [MERCHANT] Error en lote ${Math.floor(i/batchSize) + 1}:`, batchError);
        results.push({
          batchIndex: Math.floor(i/batchSize) + 1,
          productsCount: batch.length,
          error: batchError.message
        });
      }
    }
    
    res.json({
      success: true,
      totalProducts: productos.length,
      totalBatches: Math.ceil(productos.length / batchSize),
      results: results
    });
    
  } catch (error) {
    console.error('❌ [MERCHANT] Error en subida masiva:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔄 Sincronización completa
router.post('/sync-all', async (req, res) => {
  try {
    const { dryRun = false } = req.body;
    
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    const totalProductos = await collection.countDocuments({
      tiene_precio_valido: true,
      datos_completos: true
    });
    
    console.log(`🔄 [MERCHANT] Iniciando sincronización de ${totalProductos} productos (DryRun: ${dryRun})`);
    
    if (dryRun) {
      // Solo análisis, no subir nada
      const productos = await collection.find({
        tiene_precio_valido: true,
        datos_completos: true
      }).limit(10).toArray();
      
      const ejemplosTransformados = productos.map(transformarProductoMerchant);
      
      return res.json({
        success: true,
        dryRun: true,
        totalProductos: totalProductos,
        ejemplos: ejemplosTransformados
      });
    }
    
    // Sincronización real
    res.json({
      success: true,
      message: `Sincronización iniciada para ${totalProductos} productos`,
      totalProductos: totalProductos,
      estimatedTime: `${Math.ceil(totalProductos / 100)} minutos aproximadamente`
    });
    
    // Proceso async para no bloquear la respuesta
    setTimeout(async () => {
      try {
        await processFullSync(collection, totalProductos);
        console.log('✅ [MERCHANT] Sincronización completa finalizada');
      } catch (error) {
        console.error('❌ [MERCHANT] Error en sincronización completa:', error);
      }
    }, 1000);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Función para procesar sincronización completa
async function processFullSync(collection, totalProductos) {
  const content = await initGoogleMerchant();
  const batchSize = 100;
  let processed = 0;
  
  const cursor = collection.find({
    tiene_precio_valido: true,
    datos_completos: true
  });
  
  const productos = [];
  
  for await (const producto of cursor) {
    productos.push(producto);
    
    if (productos.length === batchSize) {
      await processBatch(content, productos);
      processed += productos.length;
      console.log(`📊 [MERCHANT] Progreso: ${processed}/${totalProductos} (${Math.round(processed/totalProductos*100)}%)`);
      productos.length = 0; // Clear array
      
      // Pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Procesar último lote si queda algo
  if (productos.length > 0) {
    await processBatch(content, productos);
    processed += productos.length;
    console.log(`📊 [MERCHANT] Progreso final: ${processed}/${totalProductos} (100%)`);
  }
}

async function processBatch(content, productos) {
  const entries = productos.map((producto, index) => ({
    batchId: (index + 1).toString(),
    merchantId: GOOGLE_MERCHANT_ID,
    method: 'insert',
    product: transformarProductoMerchant(producto)
  }));
  
  const batchRequest = { requestBody: { entries } };
  return await content.products.custombatch(batchRequest);
}

// 📊 Estado de sincronización
router.get('/sync-status', async (req, res) => {
  try {
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    const stats = await collection.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          conPrecio: { $sum: { $cond: ["$tiene_precio_valido", 1, 0] } },
          datosCompletos: { $sum: { $cond: ["$datos_completos", 1, 0] } },
          listoParaMerchant: { 
            $sum: { 
              $cond: [
                { $and: ["$tiene_precio_valido", "$datos_completos"] }, 
                1, 
                0
              ] 
            } 
          }
        }
      }
    ]).toArray();
    
    const estadisticas = stats[0] || {
      total: 0,
      conPrecio: 0,
      datosCompletos: 0,
      listoParaMerchant: 0
    };
    
    res.json({
      success: true,
      estadisticas,
      porcentajes: {
        conPrecio: Math.round((estadisticas.conPrecio / estadisticas.total) * 100),
        datosCompletos: Math.round((estadisticas.datosCompletos / estadisticas.total) * 100),
        listoParaMerchant: Math.round((estadisticas.listoParaMerchant / estadisticas.total) * 100)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;