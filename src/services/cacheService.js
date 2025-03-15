const { logger } = require('../config');
const db = require('../config/database');

const CacheService = {
  /**
   * Inicializar tabla de caché
   * @returns {Promise<boolean>}
   */
  async initCacheTable() {
    try {
      // Crear tabla de caché de IA si no existe
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
      
      // Crear índice para búsquedas rápidas
      await db.query(`
        CREATE INDEX IF NOT EXISTS query_hash_idx ON ia_cache(query_hash)
      `);
      
      logger.info('Tabla de caché de IA inicializada correctamente');
      return true;
    } catch (error) {
      logger.error('Error al inicializar tabla de caché de IA:', error);
      return false;
    }
  },

  /**
   * Buscar en caché
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object|null>}
   */
  async getFromCache(query) {
    try {
      // Generar hash de consulta
      const queryHash = this.generateQueryHash(query);
      
      // Buscar en caché
      const result = await db.query(`
        SELECT query, response, source, created_at
        FROM ia_cache
        WHERE query_hash = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [queryHash]);
      
      if (result.rows.length > 0) {
        const cachedItem = result.rows[0];
        
        // Verificar antigüedad de caché (7 días)
        const cacheAge = Date.now() - new Date(cachedItem.created_at).getTime();
        const maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos
        
        if (cacheAge < maxCacheAge) {
          logger.info(`Respuesta encontrada en caché para: "${query}"`);
          return {
            answer: cachedItem.response,
            source: cachedItem.source || 'caché',
            fromCache: true
          };
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Error al buscar en caché:', error);
      return null;
    }
  },

  /**
   * Guardar en caché
   * @param {string} query - Consulta
   * @param {string} response - Respuesta
   * @param {string} source - Fuente de la respuesta
   * @returns {Promise<boolean>}
   */
  async saveToCache(query, response, source) {
    try {
      const queryHash = this.generateQueryHash(query);
      
      await db.query(`
        INSERT INTO ia_cache (query, query_hash, response, source, created_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (query_hash) DO UPDATE SET 
          response = $3,
          source = $4,
          created_at = CURRENT_TIMESTAMP
      `, [query, queryHash, response, source]);
      
      logger.info(`Respuesta guardada en caché: "${query.substring(0, 50)}..."`);
      return true;
    } catch (error) {
      logger.error('Error al guardar en caché:', error);
      return false;
    }
  },

  /**
   * Generar hash de consulta
   * @param {string} query - Consulta a hashear
   * @returns {string} - Hash de consulta
   */
  generateQueryHash(query) {
    const simplifiedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
    
    let hash = 0;
    for (let i = 0; i < simplifiedQuery.length; i++) {
      const char = simplifiedQuery.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convertir a entero de 32 bits
    }
    
    return Math.abs(hash).toString();
  },

  /**
   * Limpiar caché antigua
   * @param {number} days - Días máximos de antigüedad
   * @returns {Promise<number>} - Registros eliminados
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