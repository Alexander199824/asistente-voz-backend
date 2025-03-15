const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { logger, config } = require('./config');
const routes = require('./routes');
const db = require('./config/database');
const fs = require('fs');
const path = require('path');

// Función para ejecutar migraciones
async function runMigrations() {
  try {
    logger.info('Iniciando proceso de migraciones...');
    
    // Ruta a los archivos de migración
    const migrationPath = path.join(__dirname, '../database/migrations');
    
    
    // Leer archivos de migración
    const migrationFiles = fs.readdirSync(migrationPath)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ordenar para ejecutar migraciones en orden
    
    // Ejecutar cada migración
    for (const file of migrationFiles) {
      try {
        const migrationSQL = fs.readFileSync(path.join(migrationPath, file), 'utf8');
        
        logger.info(`Ejecutando migración: ${file}`);
        await db.query(migrationSQL);
        
        logger.info(`Migración ${file} completada con éxito`);
      } catch (migrationError) {
        logger.error(`Error en migración ${file}:`, migrationError);
        // Continuar con las siguientes migraciones incluso si una falla
      }
    }
    
    logger.info('Proceso de migraciones completado');
  } catch (error) {
    logger.error('Error crítico durante las migraciones:', error);
    // En producción, podrías querer detener la inicialización del servidor
    throw error;
  }
}

// Función principal de inicialización
async function initializeSystem() {
  try {
    // Verificar conexión a la base de datos
    const result = await db.query('SELECT NOW()');
    logger.info(`Conexión a la base de datos establecida correctamente. Hora del servidor: ${result.rows[0].now}`);
    
    // Ejecutar migraciones
    await runMigrations();
    
    // Inicializar otros servicios
    await initializeAdditionalServices();
    
  } catch (error) {
    logger.error('Error crítico durante la inicialización del sistema:', error);
    process.exit(1);
  }
}

// Función para inicializar servicios adicionales
async function initializeAdditionalServices() {
  try {
    // Inicializar caché
    const CacheService = require('./services/cacheService');
    await CacheService.initCacheTable();
    
    // Limpiar caché antigua
    await CacheService.cleanOldCache(30);
    
    // Cualquier otra inicialización de servicios
    logger.info('Servicios adicionales inicializados correctamente');
  } catch (error) {
    logger.error('Error al inicializar servicios adicionales:', error);
    // No detenemos la inicialización si hay un error en servicios adicionales
  }
}

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

// Iniciar servidor
const PORT = config.port || 3001;

// Inicializar sistema y luego iniciar servidor
initializeSystem()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Servidor iniciado en puerto ${PORT} (${config.nodeEnv})`);
      
      // Configuración de IA
      if (config.ai && config.ai.enabled) {
        logger.info('Configuración de IA encontrada, inicializando servicios...');
        logger.info('Configuración de IA:', {
          enabled: config.ai.enabled,
          provider: config.ai.provider,
          model: config.ai.model,
          apiKey: config.ai.apiKey ? 'presente' : 'no configurada',
          priority: config.ai.priority,
          fallbackProvider: config.ai.fallbackProvider || 'ninguno'
        });
      } else {
        logger.info('Servicios de IA deshabilitados por configuración');
      }
    });
  })
  .catch(error => {
    logger.error('Error crítico durante la inicialización:', error);
    process.exit(1);
  });

module.exports = app;