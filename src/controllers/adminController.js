const KnowledgeUpdateService = require('../services/knowledgeUpdateService');
const KnowledgeModel = require('../models/knowledgeModel');
const { logger, config } = require('../config');

/**
 * Controlador para tareas administrativas y actualización de conocimientos
 */
const AdminController = {
  /**
   * Ejecuta una actualización manual de conocimientos
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async updateKnowledge(req, res) {
    try {
      // Verificar si las actualizaciones de IA están habilitadas
      if (!config.ai || !config.ai.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Las actualizaciones de IA no están habilitadas en la configuración'
        });
      }

      // Obtener el límite de la consulta, por defecto 1 para evitar excesos
      const limit = req.query.limit ? parseInt(req.query.limit) : 1;
      
      // Validar que el límite sea razonable
      if (isNaN(limit) || limit < 1 || limit > 50) {
        return res.status(400).json({
          success: false,
          message: 'El límite debe ser un número entre 1 y 50'
        });
      }

      // Iniciar actualización en segundo plano
      // Esto permite devolver una respuesta rápida mientras el proceso continúa
      res.json({
        success: true,
        message: `Actualización de conocimientos iniciada en segundo plano con límite de ${limit} elementos`,
        estimatedTime: 'Este proceso puede tomar varios minutos dependiendo de la cantidad de conocimientos'
      });

      // Ejecutar actualización limitada después de enviar respuesta
      try {
        await KnowledgeUpdateService.runLimitedUpdate(limit);
        logger.info(`Actualización manual completada (límite: ${limit})`);
      } catch (updateError) {
        logger.error('Error en proceso de actualización manual:', updateError);
      }
    } catch (error) {
      logger.error('Error al iniciar actualización manual:', error);
      // Si llegamos aquí, es porque hubo un error antes de enviar la respuesta
      return res.status(500).json({
        success: false,
        message: 'Error al iniciar el proceso de actualización'
      });
    }
  },
  
  /**
   * Actualiza un conocimiento específico por ID
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async updateSingleKnowledge(req, res) {
    try {
      const { knowledgeId } = req.params;
      
      if (!knowledgeId) {
        return res.status(400).json({
          success: false,
          message: 'Se requiere un ID de conocimiento'
        });
      }
      
      // Verificar si las actualizaciones de IA están habilitadas
      if (!config.ai || !config.ai.enabled) {
        return res.status(400).json({
          success: false,
          message: 'Las actualizaciones de IA no están habilitadas en la configuración'
        });
      }
      
      // Obtener el conocimiento específico
      const knowledge = await KnowledgeModel.getById(knowledgeId);
      
      if (!knowledge) {
        return res.status(404).json({
          success: false,
          message: 'Conocimiento no encontrado'
        });
      }
      
      // Actualizar el conocimiento
      const result = await KnowledgeUpdateService.verifyAndUpdateKnowledge(knowledge);
      
      return res.json({
        success: true,
        message: result 
          ? 'Conocimiento actualizado correctamente' 
          : 'El conocimiento sigue siendo actual, no se necesita actualización',
        updated: result,
        knowledge: await KnowledgeModel.getById(knowledgeId) // Obtener el conocimiento actualizado
      });
    } catch (error) {
      logger.error(`Error al actualizar conocimiento específico:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error al actualizar el conocimiento'
      });
    }
  },

  /**
   * Lista todos los conocimientos disponibles con paginación
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async listKnowledge(req, res) {
    try {
      const page = parseInt(req.query.page) || 0;
      const limit = parseInt(req.query.limit) || 20;
      const offset = page * limit;
      
      const query = `
        SELECT id, query, source, confidence, times_used, updated_at
        FROM knowledge_base
        ORDER BY updated_at ASC
        LIMIT $1 OFFSET $2;
      `;
      
      const result = await db.query(query, [limit, offset]);
      
      return res.json({
        success: true,
        data: result.rows,
        page,
        limit
      });
    } catch (error) {
      logger.error('Error al listar conocimientos:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener la lista de conocimientos'
      });
    }
  },

  /**
   * Limpia la base de conocimientos (para pruebas)
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async clearKnowledgeBase(req, res) {
    try {
      // Verificar si el usuario tiene permisos adecuados (debe ser admin)
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'No tiene permisos para realizar esta acción'
        });
      }

      // Obtener confirmación para evitar eliminaciones accidentales
      const { confirm } = req.body;
      if (confirm !== 'CONFIRM_CLEAR') {
        return res.status(400).json({
          success: false,
          message: 'Se requiere confirmación expresa. Envíe { "confirm": "CONFIRM_CLEAR" } para proceder.'
        });
      }

      // Ejecutar la limpieza
      const count = await KnowledgeModel.clearAllKnowledge();
      
      return res.json({
        success: true,
        message: `Base de conocimientos limpiada exitosamente. ${count} registros eliminados.`,
        count
      });
    } catch (error) {
      logger.error('Error al limpiar base de conocimientos:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al limpiar la base de conocimientos'
      });
    }
  }
};

module.exports = AdminController;