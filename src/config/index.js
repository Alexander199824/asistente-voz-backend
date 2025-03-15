require('dotenv').config();
const winston = require('winston');
const path = require('path');

// Configuración de logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'asistente-voz' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/error.log'), 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: path.join(__dirname, '../../logs/combined.log') 
    })
  ],
});

// Crear directorio de logs si no existe
const fs = require('fs');
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configuración general de la aplicación
const config = {
  // Servidor
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Base de datos
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  
  // JWT (autenticación)
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  // Configuración del asistente de voz
  assistant: {
    defaultWakeWord: 'asistente',
    defaultVoiceType: 'standard',
    defaultVoiceSpeed: 1.0,
    minConfidenceThreshold: 0.6, // Reducido para permitir coincidencias más flexibles (era 0.7)
    webSearchEnabled: true,      // Habilitado para permitir búsquedas web
    learningEnabled: true,       // Habilitado para permitir aprendizaje
    maxQueryLength: 500, // Limitar la longitud de las consultas
    
    // Nueva configuración para priorización de fuentes
    sourcePriority: {
      knowledgeBase: 1, // Máxima prioridad para base de conocimientos
      web: 2,          // Segunda prioridad para búsqueda web
      ai: 3            // Última prioridad para IA
    }
  },
  
  // Configuración de búsqueda en la web
  webSearch: {
    maxResults: 3,
    timeoutMs: 5000,
    provider: process.env.WEB_SEARCH_PROVIDER || 'duckduckgo', // duckduckgo, google, bing
    apiKey: process.env.WEB_SEARCH_API_KEY,
    cx: process.env.GOOGLE_SEARCH_CX // Solo para búsquedas de Google
  },
  
  // Paths
  paths: {
    uploads: path.join(__dirname, '../../uploads'),
    logs: logDir,
  },
  
  // CORS
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://tudominio.com', 'https://api.tudominio.com'] 
      : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  
  // Configuración de servicios de IA
  ai: {
    enabled: process.env.AI_ENABLED === 'true' || true, // Habilitar por defecto
    provider: process.env.AI_PROVIDER || 'openai', // openai, anthropic, huggingface
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'huggingface', // Proveedor alternativo en caso de error
    apiKey: process.env.AI_API_KEY,
    fallbackApiKey: process.env.AI_FALLBACK_API_KEY,
    model: process.env.AI_MODEL || 'gpt-4o-mini', // Usar modelo más potente
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS) || 8000, // Aumentar timeout
    maxQueryLength: 500,
    minConfidence: 0.8,
    // Cambiar a 'fallback' para usar IA solo si otras fuentes fallan
    priority: process.env.AI_PRIORITY || 'fallback', // Cambiar a 'fallback' en lugar de 'preferred'
    // Categorías de consultas para enviar a la IA
    categories: ['factual', 'current_events', 'knowledge', 'general_culture', 'academic'],
    // Configuraciones de caché
    cache: {
      enabled: true,
      maxAgeDays: 30 // Máxima edad de las entradas en caché (días)
    },
    // Gestión de cuota
    quotaManager: {
      enabled: true,
      maxQueriesPerDay: 400, // Máximo de consultas por día
      resetPeriod: 'daily' // 'daily', 'weekly', 'monthly'
    }
  },
};


if (!fs.existsSync(config.paths.uploads)) {
  fs.mkdirSync(config.paths.uploads, { recursive: true });
}

module.exports = {
  config,
  logger
};