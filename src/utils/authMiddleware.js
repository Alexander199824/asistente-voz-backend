const AuthService = require('../services/authService');
const { logger } = require('../config');

/**
 * Middleware para verificar autenticación JWT
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const authenticateJWT = (req, res, next) => {
  try {
    // Obtener el token del encabezado de autorización
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Se requiere token de autenticación'
      });
    }
    
    // Extraer el token
    const token = authHeader.split(' ')[1];
    
    // Verificar el token
    const decoded = AuthService.verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Token inválido o expirado'
      });
    }
    
    // Añadir información del usuario a la solicitud
    req.user = decoded;
    
    // Continuar
    next();
  } catch (error) {
    logger.error('Error en middleware de autenticación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la autenticación'
    });
  }
};

/**
 * Middleware para autenticación opcional
 * Si hay token, verifica y añade info del usuario
 * Si no hay token, continúa sin añadir info
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const optionalAuthJWT = (req, res, next) => {
  try {
    // Obtener el token del encabezado de autorización
    const authHeader = req.headers.authorization;
    
    // Si no hay token, continuar sin agregar info de usuario
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }
    
    // Extraer el token
    const token = authHeader.split(' ')[1];
    
    // Verificar el token
    const decoded = AuthService.verifyToken(token);
    
    // Si el token es válido, añadir info del usuario
    if (decoded) {
      req.user = decoded;
    }
    
    // Continuar
    next();
  } catch (error) {
    logger.error('Error en middleware de autenticación opcional:', error);
    // En caso de error, continuar sin agregar info de usuario
    next();
  }
};

module.exports = {
  authenticateJWT,
  optionalAuthJWT
};