// src/index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { logger, config } = require('./config');
const routes = require('./routes');
const KnowledgeModel = require('./models/knowledgeModel');
const db = require('./config/database');
const CacheService = require('./services/cacheService');

// Crear aplicación Express
const app = express();

// Middleware
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Rutas
app.use('/api', routes);

// Ruta de estado
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Manejador de errores
app.use((err, req, res, next) => {
  logger.error('Error no capturado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor'
  });
});

// Limpiar la base de conocimientos al inicio (para pruebas)
//async function resetKnowledgeBaseOnStartup() {
  //try {
    //logger.info('Limpiando base de conocimientos para iniciar desde cero...');
    // Verificamos primero la conexión a la base de datos
   // await db.query('SELECT NOW()');
    // Luego ejecutamos la limpieza
    //const count = await KnowledgeModel.clearAllKnowledge();
    //logger.info(`Base de conocimientos limpiada. ${count} registros eliminados.`);
  //} catch (error) {
    //logger.error('Error al limpiar base de conocimientos:', error);
  //}
//}

// Función para inicializar el sistema de caché
async function initializeCache() {
  try {
    logger.info('Inicializando sistema de caché...');
    
    // Crear la tabla de caché si no existe
    const initialized = await CacheService.initCacheTable();
    
    if (initialized) {
      // Limpiar entradas antiguas de la caché (mayores a 30 días)
      const cleaned = await CacheService.cleanOldCache(30);
      logger.info(`Caché inicializada, ${cleaned} registros antiguos eliminados`);
    } else {
      logger.warn('No se pudo inicializar el sistema de caché');
    }
  } catch (error) {
    logger.error('Error al inicializar sistema de caché:', error);
  }
}

// Verificar la conexión a la base de datos antes de iniciar
(async () => {
  try {
    const result = await db.query('SELECT NOW()');
    logger.info(`Conexión a la base de datos establecida correctamente. Hora del servidor: ${result.rows[0].now}`);
    
    // Iniciar servidor
    const PORT = config.port || 3001;
    app.listen(PORT, async () => {
      logger.info(`Servidor iniciado en puerto ${PORT} (${config.nodeEnv})`);
      
      // Primero limpiar la base de conocimientos (opcional, comentar si no deseas esta funcionalidad)
      await resetKnowledgeBaseOnStartup();
      
      // Inicializar el sistema de caché
      await initializeCache();
      
      // Configuración de IA
      if (config.ai && config.ai.enabled) {
        logger.info('Configuración de IA encontrada, inicializando servicios...');
        logger.info('Configuración de IA:', {
          enabled: config.ai.enabled,
          provider: config.ai.provider,
          model: config.ai.model,
          apiKey: config.ai.apiKey ? 'presente' : 'no configurada',
          priority: config.ai.priority,
          fallbackProvider: config.ai.fallbackProvider || 'ninguno' // Nuevo campo
        });
      } else {
        logger.info('Servicios de IA deshabilitados por configuración');
      }
    });
  } catch (error) {
    logger.error('Error al conectar con la base de datos:', error);
    process.exit(1);
  }
})();

// Manejo de cierre
process.on('SIGTERM', () => {
  logger.info('Cerrando servidor...');
  process.exit(0);
});

module.exports = app;