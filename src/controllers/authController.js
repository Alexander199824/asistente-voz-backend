const AuthService = require('../services/authService');
const UserModel = require('../models/userModel');
const { logger } = require('../config');

/**
 * Controlador para gestión de autenticación
 */
const AuthController = {
  /**
   * Inicia sesión para un usuario
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Nombre de usuario y contraseña son requeridos'
        });
      }
      
      // Intentar autenticar
      const authResult = await AuthService.login(username, password);
      
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          message: authResult.message || 'Credenciales inválidas'
        });
      }
      
      return res.json({
        success: true,
        message: 'Inicio de sesión exitoso',
        data: {
          user: authResult.user,
          token: authResult.token
        }
      });
    } catch (error) {
      logger.error('Error en inicio de sesión:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor al procesar la solicitud'
      });
    }
  },
  
  /**
   * Registra un nuevo usuario
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async register(req, res) {
    try {
      const { username, email, password } = req.body;
      
      // Validar datos de entrada
      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Todos los campos son requeridos: username, email y password'
        });
      }
      
      // Validar formato de email (implementación básica)
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Formato de email inválido'
        });
      }
      
      // Validar longitud de contraseña
      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'La contraseña debe tener al menos 6 caracteres'
        });
      }
      
      // Intentar registrar
      const registerResult = await AuthService.register({
        username,
        email,
        password
      });
      
      if (!registerResult.success) {
        return res.status(400).json({
          success: false,
          message: registerResult.message || 'Error al registrar usuario'
        });
      }
      
      return res.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          user: registerResult.user,
          token: registerResult.token
        }
      });
    } catch (error) {
      logger.error('Error en registro de usuario:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor al procesar la solicitud'
      });
    }
  },
  
  /**
   * Obtiene el perfil del usuario actual
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      
      // Obtener datos completos del usuario
      const user = await UserModel.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Usuario no encontrado'
        });
      }
      
      // Obtener preferencias
      const preferences = await UserModel.getPreferences(userId);
      
      return res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            createdAt: user.created_at,
            updatedAt: user.updated_at
          },
          preferences
        }
      });
    } catch (error) {
      logger.error('Error al obtener perfil de usuario:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor al procesar la solicitud'
      });
    }
  },
  
  /**
   * Actualiza las preferencias del usuario
   * @param {Object} req - Objeto de solicitud
   * @param {Object} res - Objeto de respuesta
   */
  async updatePreferences(req, res) {
    try {
      const userId = req.user.id;
      const { voice_type, voice_speed, wake_word, theme } = req.body;
      
      // Validar datos
      if (voice_speed && (voice_speed < 0.5 || voice_speed > 2.0)) {
        return res.status(400).json({
          success: false,
          message: 'La velocidad de voz debe estar entre 0.5 y 2.0'
        });
      }
      
      // Actualizar preferencias
      const updatedPreferences = await UserModel.updatePreferences(userId, {
        voice_type,
        voice_speed,
        wake_word,
        theme
      });
      
      return res.json({
        success: true,
        message: 'Preferencias actualizadas correctamente',
        data: updatedPreferences
      });
    } catch (error) {
      logger.error('Error al actualizar preferencias:', error);
      return res.status(500).json({
        success: false,
        message: 'Error en el servidor al procesar la solicitud'
      });
    }
  }
};

module.exports = AuthController;