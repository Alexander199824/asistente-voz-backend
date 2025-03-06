const db = require('../config/database');
const { logger } = require('../config');

// Modelo para el historial de conversaciones
const ConversationModel = {
  /**
   * Registra una nueva conversación en el historial
   * @param {Object} conversation - Datos de la conversación
   * @returns {Promise<Object>} - Conversación registrada
   */
  async logConversation({ userId, query, response, knowledgeId = null, confidence = null, feedback = 0 }) {
    try {
      const queryText = `
        INSERT INTO conversation_history (
          user_id, 
          query, 
          response, 
          knowledge_id, 
          confidence, 
          feedback
        ) 
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
      `;
      
      const result = await db.query(queryText, [
        userId,
        query,
        response,
        knowledgeId,
        confidence,
        feedback
      ]);
      
      logger.info(`Nueva conversación registrada para usuario ${userId || 'anónimo'}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error al registrar conversación:', error);
      throw error;
    }
  },
  
  /**
   * Obtiene el historial de conversaciones de un usuario
   * @param {string} userId - ID del usuario
   * @param {number} limit - Límite de resultados
   * @param {number} offset - Offset para paginación
   * @returns {Promise<Array>} - Lista de conversaciones
   */
  async getUserHistory(userId, limit = 50, offset = 0) {
    try {
      const queryText = `
        SELECT * FROM conversation_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
      `;
      
      const result = await db.query(queryText, [userId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error(`Error al obtener historial de usuario ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Actualiza el feedback de una conversación
   * @param {string} id - ID de la conversación
   * @param {number} feedback - Valor de feedback (-1, 0, 1)
   * @returns {Promise<Object>} - Conversación actualizada
   */
  async updateFeedback(id, feedback) {
    try {
      const queryText = `
        UPDATE conversation_history
        SET feedback = $2
        WHERE id = $1
        RETURNING *;
      `;
      
      const result = await db.query(queryText, [id, feedback]);
      
      // Si hay un knowledge_id asociado, actualizamos también su confianza
      if (result.rows[0] && result.rows[0].knowledge_id) {
        await db.query(`
          UPDATE knowledge_base
          SET confidence = 
            CASE
              WHEN $2 > 0 THEN LEAST(confidence + 0.05, 1.0)
              WHEN $2 < 0 THEN GREATEST(confidence - 0.1, 0.1)
              ELSE confidence
            END
          WHERE id = $1;
        `, [result.rows[0].knowledge_id, feedback]);
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error(`Error al actualizar feedback para conversación ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Obtiene las últimas N conversaciones para contexto
   * @param {string} userId - ID del usuario
   * @param {number} count - Número de conversaciones a obtener
   * @returns {Promise<Array>} - Lista de conversaciones recientes
   */
  async getRecentConversations(userId, count = 5) {
    try {
      const queryText = `
        SELECT query, response 
        FROM conversation_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2;
      `;
      
      const result = await db.query(queryText, [userId, count]);
      return result.rows;
    } catch (error) {
      logger.error(`Error al obtener conversaciones recientes para usuario ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Elimina el historial de conversaciones de un usuario
   * @param {string} userId - ID del usuario
   * @returns {Promise<number>} - Número de registros eliminados
   */
  async clearUserHistory(userId) {
    try {
      const queryText = `
        DELETE FROM conversation_history
        WHERE user_id = $1
        RETURNING id;
      `;
      
      const result = await db.query(queryText, [userId]);
      logger.info(`Historial eliminado para usuario ${userId}: ${result.rowCount} conversaciones`);
      return result.rowCount;
    } catch (error) {
      logger.error(`Error al eliminar historial de usuario ${userId}:`, error);
      throw error;
    }
  }
};

module.exports = ConversationModel;