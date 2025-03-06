const { Pool } = require('pg');
const winston = require('winston');
const path = require('path');
require('dotenv').config();

// Configuración de logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'database-service' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/database.log' 
    })
  ],
});

// Asegurar que existe el directorio de logs
const fs = require('fs');
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Depuración de configuración
logger.info('Configuración de base de datos:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  ssl: process.env.DB_SSL || process.env.NODE_ENV === 'production'
});

// Configuración de conexión a PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10, // Reducido para evitar sobrecarga
  idleTimeoutMillis: 30000, 
  connectionTimeoutMillis: 5000, // Aumentado para dar más tiempo en redes lentas
  ssl: { rejectUnauthorized: false } // Siempre usar SSL con rejectUnauthorized: false para Render
});

// Evento cuando se crea un cliente
pool.on('connect', client => {
  logger.info('Nuevo cliente de base de datos conectado');
});

// Evento cuando hay un error
pool.on('error', (err, client) => {
  logger.error('Error inesperado en el cliente de PostgreSQL', err);
  
  // Manejo básico de reconexión
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'EPIPE') {
    logger.info('Intentando reconexión a la base de datos...');
  }
});

// Función para ejecutar queries con retry
const query = async (text, params, retries = 3) => {
  const start = Date.now();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      logger.info('DB query ejecutada', { 
        text, 
        duration, 
        rows: res.rowCount 
      });
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      
      // Si es el último intento, lanzar el error
      if (attempt === retries) {
        logger.error('Error al ejecutar query después de todos los intentos', { 
          text, 
          duration,
          error: error.message 
        });
        throw error;
      }
      
      // Si es un error de conexión, esperar antes del siguiente intento
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'EPIPE') {
        logger.warn(`Error de conexión en el intento ${attempt}/${retries}, reintentando...`, {
          text,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Espera incremental
      } else {
        // Si no es un error de conexión, lanzar inmediatamente
        logger.error('Error al ejecutar query', { 
          text, 
          error: error.message 
        });
        throw error;
      }
    }
  }
};

// Función para obtener un cliente del pool
const getClient = async () => {
  try {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;

    // Reemplazamos la función release para hacer tracking
    client.release = () => {
      release.apply(client);
      logger.info('Cliente de DB devuelto al pool');
    };

    // Reemplazamos la función query para agregar logging
    client.query = async (text, params) => {
      const start = Date.now();
      try {
        const res = await query.apply(client, [text, params]);
        const duration = Date.now() - start;
        logger.info('DB client query ejecutada', { 
          text, 
          duration, 
          rows: res.rowCount 
        });
        return res;
      } catch (error) {
        logger.error('Error al ejecutar client query', { 
          text, 
          error: error.message 
        });
        throw error;
      }
    };

    return client;
  } catch (error) {
    logger.error('Error al obtener cliente de pool', error);
    throw error;
  }
};

// Verificar conexión al inicio
(async () => {
  try {
    await pool.query('SELECT NOW()');
    logger.info('Conexión inicial a la base de datos establecida correctamente');
  } catch (error) {
    logger.error('Error en la conexión inicial a la base de datos:', error);
  }
})();

module.exports = {
  query,
  getClient,
  pool
};