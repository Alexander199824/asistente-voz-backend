const db = require('../config/database');
const { logger } = require('../config');

// Modelo para la base de conocimientos
const KnowledgeModel = {
  /**
   * Busca respuestas basadas en una consulta
   * @param {string} query - Consulta del usuario
   * @param {number} confidence - Umbral de confianza (0-1)
   * @param {string} userId - ID de usuario (opcional)
   * @returns {Promise<Array>} - Lista de posibles respuestas
   */
  async findAnswers(query, confidence = 0.7, userId = null) {
    try {
      // Normalizamos la consulta (minúsculas, sin puntuación excesiva)
      const normalizedQuery = query.toLowerCase().trim();
      
      // Versión mejorada con múltiples estrategias de búsqueda
      const queryText = `
        WITH ranked_results AS (
          SELECT 
            k.*,
            SIMILARITY(k.query, $1) as similarity,
            -- Añadir ranking adicional para coincidencias parciales
            CASE 
              WHEN k.query ILIKE $1 THEN 3        -- Coincidencia exacta
              WHEN k.query ILIKE $1 || '%' THEN 2 -- Empieza con
              WHEN k.query ILIKE '%' || $1 THEN 2 -- Termina con
              WHEN k.query ILIKE '%' || $1 || '%' THEN 1 -- Contiene
              ELSE 0
            END as match_type,
            -- Añadir puntuación para coincidencia de palabras clave
            (
              SELECT COUNT(*) 
              FROM unnest(string_to_array($1, ' ')) as word 
              WHERE LENGTH(word) > 3 AND k.query ILIKE '%' || word || '%'
            ) as keyword_matches
          FROM 
            knowledge_base k
          WHERE 
            (SIMILARITY(k.query, $1) > $2 OR 
             k.query ILIKE '%' || $1 || '%' OR
             $1 ILIKE '%' || k.query || '%')
            AND (k.user_id = $3 OR k.user_id IS NULL OR k.is_public = true)
        )
        SELECT * FROM ranked_results
        ORDER BY 
          match_type DESC,        -- Priorizar tipo de coincidencia
          similarity DESC,        -- Luego por similitud textual
          keyword_matches DESC,   -- Luego por coincidencias de palabras clave
          confidence DESC,        -- Luego por confianza
          times_used DESC         -- Finalmente por uso
        LIMIT 7;
      `;
      
      const result = await db.query(queryText, [normalizedQuery, confidence, userId]);
      
      // Aplicar filtrado de resultados más inteligente
      const filteredResults = result.rows.filter(row => {
        // Verificar si hay coincidencia exacta de palabras clave
        const queryWords = normalizedQuery.split(/\s+/);
        const rowQueryWords = row.query.toLowerCase().split(/\s+/);
        
        // Calcular cuántas palabras clave coinciden (solo palabras significativas)
        const matchingWords = queryWords.filter(word => 
          word.length > 3 && rowQueryWords.some(rowWord => rowWord.includes(word))
        );
        
        // Verificar si hay palabras clave significativas en común
        const keywordMatch = matchingWords.length > 0;
        
        // Criterios para considerar un resultado válido:
        return (
          // Alta similitud (> 0.75)
          row.similarity > 0.75 ||
          // O tipo de coincidencia directo (exacta, empieza con, termina con)
          row.match_type >= 2 ||
          // O coincidencia de palabras clave con similitud decente
          (keywordMatch && row.similarity > 0.6) ||
          // O múltiples palabras clave coincidentes (> 1/3 de las palabras)
          (queryWords.length > 2 && matchingWords.length >= queryWords.length / 3)
        );
      });
      
      if (filteredResults.length > 0 && filteredResults[0].similarity > 0.65) {
        // Incrementamos el contador de uso para la mejor coincidencia
        await this.incrementUsageCount(filteredResults[0].id);
      }
      
      return filteredResults;
    } catch (error) {
      logger.error('Error al buscar respuestas en la base de conocimientos:', error);
      
      // En caso de error, intentar con una consulta más simple
      try {
        const simpleQueryText = `
          SELECT 
            k.*,
            SIMILARITY(k.query, $1) as similarity
          FROM 
            knowledge_base k
          WHERE 
            k.query ILIKE '%' || $1 || '%'
            AND (k.user_id = $2 OR k.user_id IS NULL OR k.is_public = true)
          ORDER BY 
            confidence DESC,
            times_used DESC
          LIMIT 5;
        `;
        
        const backupResult = await db.query(simpleQueryText, [query.toLowerCase().trim(), userId]);
        return backupResult.rows;
      } catch (backupError) {
        logger.error('Error en consulta de respaldo:', backupError);
        return [];
      }
    }
  },
  
  /**
   * Añade nuevo conocimiento a la base de datos
   * @param {Object} knowledge - Objeto con la información del conocimiento
   * @returns {Promise<Object>} - Conocimiento añadido
   */
  async addKnowledge({ query, response, context = null, source = 'user', confidence = 1.0, userId = null, isPublic = false }) {
    try {
      // Normalizamos la consulta
      const normalizedQuery = query.toLowerCase().trim();
      
      // Verificamos si ya existe una entrada similar
      const existingEntryQuery = `
        SELECT * FROM knowledge_base 
        WHERE SIMILARITY(query, $1) > 0.8
        AND (user_id = $2 OR user_id IS NULL OR is_public = true)
        LIMIT 1;
      `;
      
      const existingEntry = await db.query(existingEntryQuery, [normalizedQuery, userId]);
      
      // Si ya existe, actualizamos en lugar de insertar
      if (existingEntry.rows.length > 0) {
        const updateQuery = `
          UPDATE knowledge_base 
          SET 
            response = $1, 
            context = $2,
            confidence = $3,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
          RETURNING *;
        `;
        
        const result = await db.query(updateQuery, [
          response, 
          context,
          Math.max(confidence, existingEntry.rows[0].confidence),
          existingEntry.rows[0].id
        ]);
        
        logger.info(`Conocimiento actualizado: "${normalizedQuery}"`);
        return result.rows[0];
      }
      
      // Si no existe, insertamos nuevo conocimiento
      const insertQuery = `
        INSERT INTO knowledge_base (
          query, 
          response, 
          context, 
          source, 
          confidence, 
          user_id, 
          is_public
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *;
      `;
      
      const result = await db.query(insertQuery, [
        normalizedQuery,
        response,
        context,
        source,
        confidence,
        userId,
        isPublic
      ]);
      
      logger.info(`Nuevo conocimiento añadido: "${normalizedQuery}"`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error al añadir conocimiento:', error);
      throw error;
    }
  },
  
  /**
   * Incrementa el contador de uso de un conocimiento
   * @param {string} id - ID del conocimiento
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async incrementUsageCount(id) {
    try {
      const query = `
        UPDATE knowledge_base
        SET times_used = times_used + 1
        WHERE id = $1;
      `;
      
      await db.query(query, [id]);
      return true;
    } catch (error) {
      logger.error(`Error al incrementar contador de uso para conocimiento ${id}:`, error);
      return false;
    }
  },
  
  /**
   * Obtiene un conocimiento por su ID
   * @param {string} id - ID del conocimiento
   * @returns {Promise<Object>} - Conocimiento encontrado
   */
  async getById(id) {
    try {
      const query = 'SELECT * FROM knowledge_base WHERE id = $1';
      const result = await db.query(query, [id]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error al obtener conocimiento por ID ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Elimina un conocimiento por su ID
   * @param {string} id - ID del conocimiento
   * @param {string} userId - ID del usuario (para verificar permisos)
   * @returns {Promise<boolean>} - Éxito de la operación
   */
  async deleteKnowledge(id, userId) {
    try {
      let query;
      let params;
      
      if (userId) {
        // Si hay usuario, aseguramos que solo pueda eliminar sus propios conocimientos
        query = 'DELETE FROM knowledge_base WHERE id = $1 AND user_id = $2 RETURNING id';
        params = [id, userId];
      } else {
        // Sin usuario (admin), puede eliminar cualquier conocimiento
        query = 'DELETE FROM knowledge_base WHERE id = $1 RETURNING id';
        params = [id];
      }
      
      const result = await db.query(query, params);
      return result.rowCount > 0;
    } catch (error) {
      logger.error(`Error al eliminar conocimiento ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Actualiza la confianza de un conocimiento basado en feedback
   * @param {string} id - ID del conocimiento
   * @param {number} feedback - Valor de feedback (-1, 0, 1)
   * @returns {Promise<Object>} - Conocimiento actualizado
   */
  async updateConfidence(id, feedback) {
    try {
      // Ajustamos la confianza basada en el feedback
      // Feedback positivo aumenta, negativo disminuye
      const query = `
        UPDATE knowledge_base
        SET confidence = 
          CASE
            WHEN $2 > 0 THEN LEAST(confidence + 0.05, 1.0)
            WHEN $2 < 0 THEN GREATEST(confidence - 0.1, 0.1)
            ELSE confidence
          END
        WHERE id = $1
        RETURNING *;
      `;
      
      const result = await db.query(query, [id, feedback]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error al actualizar confianza para conocimiento ${id}:`, error);
      throw error;
    }
  },

  /**
   * Actualiza un conocimiento existente
   * @param {string} id - ID del conocimiento
   * @param {Object} updates - Campos a actualizar
   * @returns {Promise<Object>} - Conocimiento actualizado
   */
  async updateKnowledge(id, { response, context, source, confidence }) {
    try {
      let updateFields = [];
      let queryParams = [];
      let paramCounter = 1;
      
      // Construir dinámicamente la consulta según los campos proporcionados
      if (response) {
        updateFields.push(`response = $${paramCounter}`);
        queryParams.push(response);
        paramCounter++;
      }
      
      if (context !== undefined) {
        updateFields.push(`context = $${paramCounter}`);
        queryParams.push(context);
        paramCounter++;
      }
      
      if (source) {
        updateFields.push(`source = $${paramCounter}`);
        queryParams.push(source);
        paramCounter++;
      }
      
      if (confidence !== undefined) {
        updateFields.push(`confidence = $${paramCounter}`);
        queryParams.push(confidence);
        paramCounter++;
      }
      
      // Actualizar timestamp
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      
      // Si no hay campos para actualizar, retornar el conocimiento actual
      if (updateFields.length === 0) {
        return this.getById(id);
      }
      
      // Añadir ID al final de los parámetros
      queryParams.push(id);
      
      const query = `
        UPDATE knowledge_base
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCounter}
        RETURNING *;
      `;
      
      const result = await db.query(query, queryParams);
      logger.info(`Conocimiento ${id} actualizado`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error al actualizar conocimiento ${id}:`, error);
      throw error;
    }
  },

  /**
   * Limpia todos los conocimientos de la base de datos excepto los predefinidos
   * @returns {Promise<number>} - Cantidad de registros eliminados
   */
  async clearAllKnowledge() {
    try {
      // Primero respaldamos los conocimientos del sistema que queremos conservar
      await db.query(`
        CREATE TEMP TABLE IF NOT EXISTS system_knowledge AS
        SELECT * FROM knowledge_base 
        WHERE source = 'system' AND is_verified = true
      `);

      // Eliminamos todos los conocimientos
      const result = await db.query(`
        DELETE FROM knowledge_base
        RETURNING id
      `);

      // Restauramos los conocimientos del sistema
      await db.query(`
        INSERT INTO knowledge_base
        SELECT * FROM system_knowledge
      `);

      // Eliminamos la tabla temporal
      await db.query(`DROP TABLE IF EXISTS system_knowledge`);

      logger.info(`Base de conocimientos limpiada: ${result.rowCount} elementos eliminados`);
      return result.rowCount;
    } catch (error) {
      logger.error('Error al limpiar la base de conocimientos:', error);
      throw error;
    }
  }
};

module.exports = KnowledgeModel;