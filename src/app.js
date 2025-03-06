// Aplicación principal - app.js

// Importar dependencias
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { logger, config } = require('./config');
const routes = require('./routes');
const KnowledgeModel = require('./models/knowledgeModel');

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
async function resetKnowledgeBaseOnStartup() {
  try {
    logger.info('Limpiando base de conocimientos para iniciar desde cero...');
    const count = await KnowledgeModel.clearAllKnowledge();
    logger.info(`Base de conocimientos limpiada. ${count} registros eliminados.`);
  } catch (error) {
    logger.error('Error al limpiar base de conocimientos:', error);
  }
}

// Iniciar servidor
const PORT = config.port || 3001;
app.listen(PORT, async () => {
  logger.info(`Servidor iniciado en el puerto ${PORT} (${config.nodeEnv})`);
  
  // Limpiar la base de conocimientos al iniciar
  await resetKnowledgeBaseOnStartup();
  
  // Inicialización de servicios
  logger.info('Inicializando servicios...');
  
  // NO iniciar actualización automática de conocimientos al arrancar
  // if (config.ai && config.ai.enabled) {
  //   logger.info('Iniciando servicio de actualización de conocimientos...');
  //   KnowledgeUpdateService.startAutomaticUpdates(24); // 24 horas
  // } else {
  //   logger.info('Servicio de actualización de conocimientos deshabilitado');
  // }
  
  logger.info('Sistema listo para procesar consultas');
});

// Manejo de cierre
process.on('SIGTERM', () => {
  logger.info('Cerrando servidor...');
  process.exit(0);
});

module.exports = app;