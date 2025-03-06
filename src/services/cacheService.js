/**
 * Servicio de caché para respuestas de IA
 * Reduce el número de llamadas a las APIs externas
 */
const { logger } = require('../config');
const db = require('../config/database');

const CacheService = {
  /**
   * Busca una respuesta en caché para una consulta específica
   * @param {string} query - La consulta normalizada
   * @returns {Promise<Object|null>} - Respuesta en caché o null si no existe
   */
  async getFromCache(query) {
    try {
      // Generar un hash simple para la consulta para facilitar búsquedas
      const queryHash = this.generateQueryHash(query);
      
      // Buscar en la tabla de caché
      const result = await db.query(`
        SELECT query, response, source, created_at
        FROM ia_cache
        WHERE query_hash = $1 OR query = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [queryHash, query]);
      
      if (result.rows.length > 0) {
        const cachedItem = result.rows[0];
        
        // Verificar si la caché está "fresca" (menos de 7 días)
        const cacheAge = Date.now() - new Date(cachedItem.created_at).getTime();
        const maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos
        
        if (cacheAge < maxCacheAge) {
          logger.info(`Respuesta encontrada en caché para: "${query}", edad: ${Math.round(cacheAge / (1000 * 60 * 60))} horas`);
          
          return {
            answer: cachedItem.response,
            source: cachedItem.source || 'caché',
            context: 'Respuesta en caché',
            confidence: 0.9,
            fromCache: true
          };
        } else {
          logger.info(`Caché obsoleta para: "${query}", edad: ${Math.round(cacheAge / (1000 * 60 * 60 * 24))} días`);
          return null;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error al buscar en caché:', error);
      return null;
    }
  },

  /**
   * Guarda una respuesta en la caché
   * @param {string} query - La consulta normalizada
   * @param {string} response - La respuesta de la IA
   * @param {string} source - Fuente de la respuesta (OpenAI, etc.)
   * @returns {Promise<boolean>} - true si se guardó correctamente
   */
  async saveToCache(query, response, source) {
    try {
      const queryHash = this.generateQueryHash(query);
      
      // Insertar en la tabla de caché, o actualizar si ya existe
      await db.query(`
        INSERT INTO ia_cache (query, query_hash, response, source, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (query_hash) 
        DO UPDATE SET 
          response = $3,
          source = $4,
          created_at = CURRENT_TIMESTAMP
      `, [query, queryHash, response, source]);
      
      logger.info(`Respuesta guardada en caché para: "${query}"`);
      return true;
    } catch (error) {
      logger.error('Error al guardar en caché:', error);
      return false;
    }
  },

  /**
   * Genera un hash simple para una consulta
   * @param {string} query - La consulta a hashear
   * @returns {string} - Hash de la consulta
   */
  generateQueryHash(query) {
    // Simplificar la consulta: eliminar espacios, convertir a minúsculas
    const simplifiedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
    
    // Crear un hash simple
    let hash = 0;
    for (let i = 0; i < simplifiedQuery.length; i++) {
      const char = simplifiedQuery.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convertir a entero de 32 bits
    }
    
    // Convertir a string positivo
    return Math.abs(hash).toString();
  },

  /**
   * Inicializa la tabla de caché en la base de datos
   */
  async initCacheTable() {
    try {
      // Crear la tabla ia_cache si no existe
      await db.query(`
        CREATE TABLE IF NOT EXISTS ia_cache (
          id SERIAL PRIMARY KEY,
          query TEXT NOT NULL,
          query_hash TEXT NOT NULL,
          response TEXT NOT NULL,
          source VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(query_hash)
        )
      `);
      
      // Crear índice para búsquedas más rápidas
      await db.query(`
        CREATE INDEX IF NOT EXISTS query_hash_idx ON ia_cache(query_hash)
      `);
      
      logger.info('Tabla de caché inicializada correctamente');
      return true;
    } catch (error) {
      logger.error('Error al inicializar tabla de caché:', error);
      return false;
    }
  },

  /**
   * Limpia entradas antiguas de la caché
   * @param {number} days - Edad máxima en días
   * @returns {Promise<number>} - Número de registros eliminados
   */
  async cleanOldCache(days = 30) {
    try {
      const result = await db.query(`
        DELETE FROM ia_cache
        WHERE created_at < NOW() - INTERVAL '${days} days'
        RETURNING id
      `);
      
      logger.info(`Limpieza de caché completada: ${result.rowCount} registros antiguos eliminados`);
      return result.rowCount;
    } catch (error) {
      logger.error('Error al limpiar caché antigua:', error);
      return 0;
    }
  }
};

module.exports = CacheService;