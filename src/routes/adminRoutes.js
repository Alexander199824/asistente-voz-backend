const express = require('express');
const router = express.Router();
const AdminController = require('../controllers/adminController');
const { authenticateJWT } = require('../utils/authMiddleware');
const isAdmin = require('../utils/adminMiddleware');

/**
 * @route POST /api/admin/update-knowledge
 * @desc Inicia una actualización manual de la base de conocimientos (con límite)
 * @access Private (solo admin)
 * @param {number} limit - Número máximo de elementos a actualizar (opcional, por defecto 1)
 */
router.post('/update-knowledge', authenticateJWT, isAdmin, AdminController.updateKnowledge);

/**
 * @route POST /api/admin/update-knowledge/:knowledgeId
 * @desc Actualiza un conocimiento específico por ID
 * @access Private (solo admin)
 */
router.post('/update-knowledge/:knowledgeId', authenticateJWT, isAdmin, AdminController.updateSingleKnowledge);

/**
 * @route GET /api/admin/knowledge
 * @desc Lista todos los conocimientos con paginación
 * @access Private (solo admin)
 */
router.get('/knowledge', authenticateJWT, isAdmin, AdminController.listKnowledge);

/**
 * @route POST /api/admin/clear-knowledge
 * @desc Limpia la base de conocimientos (para pruebas)
 * @access Private (solo admin)
 */
router.post('/clear-knowledge', authenticateJWT, isAdmin, AdminController.clearKnowledgeBase);

module.exports = router;