const db = require('../config/database');
const { logger } = require('../config');
const { v4: uuidv4 } = require('uuid');

const KnowledgeModel = {
  /**
   * Busca respuestas basadas en una consulta (versión mejorada)
   * @param {string} query - Consulta del usuario
   * @param {number} confidence - Umbral de confianza (0-1)
   * @param {string} userId - ID de usuario (opcional)
   * @returns {Promise<Array>} - Lista de posibles respuestas
   */
  async findAnswers(query, confidence = 0.65, userId = null) {
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
              WHEN LOWER(k.query) = LOWER($1) THEN 5         -- Coincidencia exacta (ignorando mayúsculas/minúsculas)
              WHEN k.query ILIKE $1 THEN 4                   -- Coincidencia exacta (ignorando mayúsculas/minúsculas y acentos)
              WHEN k.query ILIKE $1 || '%' THEN 3            -- Empieza con
              WHEN k.query ILIKE '%' || $1 THEN 3            -- Termina con
              WHEN k.query ILIKE '%' || $1 || '%' THEN 2     -- Contiene
              ELSE 0
            END as match_type,
            -- Añadir puntuación para coincidencia de palabras clave
            (
              SELECT COUNT(*) 
              FROM unnest(string_to_array($1, ' ')) as word 
              WHERE LENGTH(word) > 2 AND k.query ILIKE '%' || word || '%'
            ) as keyword_matches
          FROM 
            knowledge_base k
          WHERE 
            (SIMILARITY(k.query, $1) > $2 OR 
             k.query ILIKE '%' || $1 || '%' OR
             $1 ILIKE '%' || k.query || '%' OR
             EXISTS (
               SELECT 1 
               FROM unnest(string_to_array($1, ' ')) as word 
               WHERE LENGTH(word) > 3 AND k.query ILIKE '%' || word || '%'
             ))
            AND (k.user_id = $3 OR k.user_id IS NULL OR k.is_public = true)
        )
        SELECT * FROM ranked_results
        ORDER BY 
          match_type DESC,        -- Priorizar tipo de coincidencia
          similarity DESC,        -- Luego por similitud textual
          keyword_matches DESC,   -- Luego por coincidencias de palabras clave
          confidence DESC,        -- Luego por confianza
          times_used DESC         -- Finalmente por uso
        LIMIT 10;
      `;
      
      const result = await db.query(queryText, [normalizedQuery, confidence, userId]);
      
      // Aplicar filtrado de resultados más inteligente
      const filteredResults = result.rows.filter(row => {
        // Verificar si hay coincidencia exacta de palabras clave
        const queryWords = normalizedQuery.split(/\s+/);
        const rowQueryWords = row.query.toLowerCase().split(/\s+/);
        
        // Verificar coincidencia exacta (ignorando mayúsculas/minúsculas)
        if (row.query.toLowerCase() === normalizedQuery) {
          return true;
        }
        
        // Calcular cuántas palabras clave coinciden (solo palabras significativas)
        const matchingWords = queryWords.filter(word => 
          word.length > 2 && rowQueryWords.some(rowWord => rowWord.includes(word))
        );
        
        // Verificar si hay palabras clave significativas en común
        const keywordMatch = matchingWords.length > 0;
        
        // Si la consulta es muy corta (1-2 palabras), ser más permisivo
        if (queryWords.length <= 2 && keywordMatch) {
          return true;
        }
        
        // Criterios para considerar un resultado válido:
        return (
          // Alta similitud (> 0.70)
          row.similarity > 0.70 ||
          // O tipo de coincidencia directo (exacta, empieza con, termina con)
          row.match_type >= 2 ||
          // O coincidencia de palabras clave con similitud decente
          (keywordMatch && row.similarity > 0.55) ||
          // O múltiples palabras clave coincidentes (> 1/3 de las palabras)
          (queryWords.length > 2 && matchingWords.length >= queryWords.length / 3)
        );
      });
      
      if (filteredResults.length > 0 && filteredResults[0].similarity > 0.55) {
        // Incrementamos el contador de uso para la mejor coincidencia
        await this.incrementUsageCount(filteredResults[0].id);
        
        // Loguear para depuración
        logger.info(`Encontrada coincidencia en BD: "${filteredResults[0].query}" (similitud: ${filteredResults[0].similarity.toFixed(2)})`);
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
            k.query ILIKE '%' || $1 || '%' OR
            $1 ILIKE '%' || k.query || '%'
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
  async addKnowledge({ 
    query, 
    response, 
    context = null, 
    source = 'user', 
    confidence = 1.0, 
    userId = null, 
    isPublic = false, 
    isAIGenerated = false,
    aiProvider = null
  }) {
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
            is_ai_generated = $4,
            ai_provider = $5,
            last_verified_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $6
          RETURNING *;
        `;
        
        const result = await db.query(updateQuery, [
          response, 
          context,
          Math.max(confidence, existingEntry.rows[0].confidence),
          isAIGenerated,
          aiProvider,
          existingEntry.rows[0].id
        ]);
        
        logger.info(`Conocimiento actualizado: "${normalizedQuery}"`);
        return result.rows[0];
      }
      
      // Si no existe, insertamos nuevo conocimiento
      const insertQuery = `
        INSERT INTO knowledge_base (
          id,
          query, 
          response, 
          context, 
          source, 
          confidence, 
          user_id, 
          is_public,
          is_ai_generated,
          ai_provider,
          last_verified_at
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        RETURNING *;
      `;
      
      const result = await db.query(insertQuery, [
        uuidv4(),
        normalizedQuery,
        response,
        context,
        source,
        confidence,
        userId,
        isPublic,
        isAIGenerated,
        aiProvider
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
  async updateKnowledge(id, { response, context, source, confidence, is_ai_generated, ai_provider, updated_at }) {
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
      
      // Nuevos campos
      if (is_ai_generated !== undefined) {
        updateFields.push(`is_ai_generated = $${paramCounter}`);
        queryParams.push(is_ai_generated);
        paramCounter++;
      }
      
      if (ai_provider !== undefined) {
        updateFields.push(`ai_provider = $${paramCounter}`);
        queryParams.push(ai_provider);
        paramCounter++;
      }
      
      // Siempre actualizar last_verified_at cuando se modifica
      updateFields.push(`last_verified_at = CURRENT_TIMESTAMP`);
      
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