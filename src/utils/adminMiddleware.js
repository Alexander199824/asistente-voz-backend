const { logger } = require('../config');

/**
 * Middleware para verificar rol de administrador
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 * @param {Function} next - Función para continuar al siguiente middleware
 */
const isAdmin = (req, res, next) => {
  try {
    // Verificar que el usuario está autenticado y tiene la información del usuario
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Acceso no autorizado. Se requiere autenticación'
      });
    }
    
    // Verificar si el usuario tiene rol de administrador
    if (!req.user.role || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Acceso prohibido. Se requieren privilegios de administrador'
      });
    }
    
    // Si el usuario es administrador, continuar
    next();
  } catch (error) {
    logger.error('Error en middleware de verificación de administrador:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al procesar la autorización'
    });
  }
};

module.exports = isAdmin;