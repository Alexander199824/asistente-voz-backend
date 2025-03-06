const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { authenticateJWT } = require('../utils/authMiddleware');

/**
 * @route POST /api/auth/login
 * @desc Inicia sesión para un usuario
 * @access Public
 */
router.post('/login', AuthController.login);

/**
 * @route POST /api/auth/register
 * @desc Registra un nuevo usuario
 * @access Public
 */
router.post('/register', AuthController.register);

/**
 * @route GET /api/auth/profile
 * @desc Obtiene el perfil del usuario actual
 * @access Private
 */
router.get('/profile', authenticateJWT, AuthController.getProfile);

/**
 * @route PUT /api/auth/preferences
 * @desc Actualiza las preferencias del usuario
 * @access Private
 */
router.put('/preferences', authenticateJWT, AuthController.updatePreferences);

module.exports = router;