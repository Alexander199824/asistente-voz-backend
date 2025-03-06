const express = require('express');
const router = express.Router();
const AssistantController = require('../controllers/assistantController');
const { authenticateJWT, optionalAuthJWT } = require('../utils/authMiddleware');

/**
 * @route POST /api/assistant/query
 * @desc Procesa una consulta del usuario
 * @access Public/Private (con autenticación opcional)
 */
router.post('/query', optionalAuthJWT, AssistantController.processQuery);

/**
 * @route POST /api/assistant/feedback
 * @desc Proporciona feedback a una respuesta
 * @access Private
 */
router.post('/feedback', authenticateJWT, AssistantController.provideFeedback);

/**
 * @route GET /api/assistant/history
 * @desc Obtiene el historial de conversaciones del usuario
 * @access Private
 */
router.get('/history', authenticateJWT, AssistantController.getHistory);

/**
 * @route DELETE /api/assistant/knowledge/:knowledgeId
 * @desc Elimina un conocimiento específico
 * @access Private
 */
router.delete('/knowledge/:knowledgeId', authenticateJWT, AssistantController.deleteKnowledge);

module.exports = router;