const AssistantService = require('../services/assistantService');
const { logger } = require('../config');

/**
 * Controlador para las funcionalidades del asistente
 */
const AssistantController = {
  /**
   * Procesa una consulta del usuario
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async processQuery(req, res) {
    try {
      const { query, options } = req.body;
      
      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'La consulta es requerida'
        });
      }
      
      // Obtener el ID de usuario del token (si existe)
      const userId = req.user ? req.user.id : null;
      
      // Procesar la consulta - ahora incluye opciones para confirmaciones
      const result = await AssistantService.processQuery(query, userId, options || {});
      
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error al procesar consulta:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al procesar la consulta'
      });
    }
  },
  
  /**
   * Proporciona retroalimentación a una respuesta
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async provideFeedback(req, res) {
    try {
      const { conversationId, feedback } = req.body;
      
      if (!conversationId || feedback === undefined) {
        return res.status(400).json({
          success: false,
          message: 'El ID de conversación y el feedback son requeridos'
        });
      }
      
      // Validar el valor de feedback
      const feedbackValue = parseInt(feedback);
      if (![1, 0, -1].includes(feedbackValue)) {
        return res.status(400).json({
          success: false,
          message: 'El feedback debe ser 1 (positivo), 0 (neutral) o -1 (negativo)'
        });
      }
      
      // Procesar el feedback
      const result = await AssistantService.provideFeedback(conversationId, feedbackValue);
      
      return res.json({
        success: result,
        message: result ? 'Feedback registrado correctamente' : 'No se pudo registrar el feedback'
      });
    } catch (error) {
      logger.error('Error al procesar feedback:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al procesar el feedback'
      });
    }
  },
  
  /**
   * Obtiene el historial de conversaciones del usuario
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async getHistory(req, res) {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      // Obtener historial
      const history = await AssistantService.getUserHistory(userId, limit, offset);
      
      return res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Error al obtener historial:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener el historial de conversaciones'
      });
    }
  },
  
  /**
   * Elimina un conocimiento específico
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async deleteKnowledge(req, res) {
    try {
      const { knowledgeId } = req.params;
      const userId = req.user.id;
      
      if (!knowledgeId) {
        return res.status(400).json({
          success: false,
          message: 'El ID de conocimiento es requerido'
        });
      }
      
      // Eliminar conocimiento
      const result = await AssistantService.deleteKnowledge(knowledgeId, userId);
      
      return res.json({
        success: result,
        message: result 
          ? 'Conocimiento eliminado correctamente' 
          : 'No se pudo eliminar el conocimiento o no tienes permisos'
      });
    } catch (error) {
      logger.error('Error al eliminar conocimiento:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al eliminar el conocimiento'
      });
    }
  }
};

module.exports = AssistantController;