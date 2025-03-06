const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');
const { logger, config } = require('../config');

/**
 * Servicio para gestión de autenticación
 */
const AuthService = {
  /**
   * Autentica a un usuario y genera un token JWT
   * @param {string} username - Nombre de usuario o email
   * @param {string} password - Contraseña
   * @returns {Promise<Object>} - Información de la sesión con token
   */
  async login(username, password) {
    try {
      // Verificar credenciales
      const user = await UserModel.verifyCredentials(username, password);
      
      if (!user) {
        return {
          success: false,
          message: 'Credenciales inválidas'
        };
      }
      
      // Generar token JWT
      const token = this.generateToken(user);
      
      // Obtener preferencias del usuario
      const preferences = await UserModel.getPreferences(user.id);
      
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          preferences
        },
        token
      };
    } catch (error) {
      logger.error('Error en autenticación:', error);
      throw error;
    }
  },
  
  /**
   * Registra un nuevo usuario
   * @param {Object} userData - Datos del usuario a registrar
   * @returns {Promise<Object>} - Resultado del registro
   */
  async register({ username, email, password }) {
    try {
      // Verificar si el usuario o email ya existen
      const existingUser = await UserModel.getUserByIdentifier(username) || 
                           await UserModel.getUserByIdentifier(email);
      
      if (existingUser) {
        return {
          success: false,
          message: 'El nombre de usuario o email ya están en uso'
        };
      }
      
      // Crear el nuevo usuario
      const newUser = await UserModel.createUser({
        username,
        email,
        password
      });
      
      // Generar token JWT
      const token = this.generateToken(newUser);
      
      // Obtener preferencias (recién creadas)
      const preferences = await UserModel.getPreferences(newUser.id);
      
      return {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          preferences
        },
        token
      };
    } catch (error) {
      logger.error('Error en registro de usuario:', error);
      throw error;
    }
  },
  
  /**
   * Genera un token JWT para un usuario
   * @param {Object} user - Datos del usuario
   * @returns {string} - Token JWT generado
   */
  generateToken(user) {
    try {
      const payload = {
        id: user.id,
        username: user.username,
        email: user.email
      };
      
      return jwt.sign(
        payload,
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );
    } catch (error) {
      logger.error('Error al generar token JWT:', error);
      throw error;
    }
  },
  
  /**
   * Verifica y decodifica un token JWT
   * @param {string} token - Token JWT a verificar
   * @returns {Object|null} - Payload decodificado o null si es inválido
   */
  verifyToken(token) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      return decoded;
    } catch (error) {
      logger.warn('Token JWT inválido:', error.message);
      return null;
    }
  }
};

module.exports = AuthService;