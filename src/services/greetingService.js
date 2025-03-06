const { logger } = require('../config');

/**
 * Servicio para manejar saludos
 */
const GreetingService = {
  /**
   * Detecta si una consulta es un saludo
   * @param {string} query - Consulta del usuario
   * @returns {boolean} - true si es un saludo
   */
  isGreeting(query) {
    const greetingPatterns = [
      /^hola\b/i,
      /^(buenos|buen)\s+(días|dia|día|tardes|noches)/i,
      /^saludos\b/i,
      /^qué\s+tal\b/i,
      /^cómo\s+estás\b/i,
      /^hey\b/i,
      /^hi\b/i,
      /^hello\b/i
    ];

    return greetingPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Genera una respuesta apropiada para un saludo
   * @param {string} query - Consulta del usuario
   * @returns {Object} - Respuesta al saludo
   */
  getGreetingResponse(query) {
    try {
      // Determinar el tipo de saludo para dar una respuesta contextual
      const lowerQuery = query.toLowerCase();
      
      // Saludos basados en el momento del día
      if (lowerQuery.includes('buenos días') || lowerQuery.includes('buen día') || lowerQuery.includes('buen dia')) {
        return {
          response: '¡Buenos días! ¿En qué puedo ayudarte hoy?',
          source: 'greeting',
          confidence: 1.0
        };
      }
      
      if (lowerQuery.includes('buenas tardes')) {
        return {
          response: '¡Buenas tardes! ¿En qué puedo asistirte?',
          source: 'greeting',
          confidence: 1.0
        };
      }
      
      if (lowerQuery.includes('buenas noches')) {
        return {
          response: '¡Buenas noches! ¿En qué puedo ayudarte antes de terminar el día?',
          source: 'greeting',
          confidence: 1.0
        };
      }
      
      // Para "hola" y saludos genéricos, usar variaciones aleatorias
      const genericResponses = [
        '¡Hola! ¿En qué puedo ayudarte?',
        '¡Hola! ¿Cómo puedo asistirte hoy?',
        '¡Saludos! ¿En qué puedo ayudarte?',
        '¡Hola! Estoy aquí para ayudarte. ¿Qué necesitas?'
      ];
      
      const randomIndex = Math.floor(Math.random() * genericResponses.length);
      
      return {
        response: genericResponses[randomIndex],
        source: 'greeting',
        confidence: 1.0
      };
    } catch (error) {
      logger.error('Error al generar respuesta de saludo:', error);
      
      // Respuesta por defecto en caso de error
      return {
        response: '¡Hola! ¿En qué puedo ayudarte?',
        source: 'greeting',
        confidence: 1.0
      };
    }
  }
};

module.exports = GreetingService;