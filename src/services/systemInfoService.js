const { logger } = require('../config');

/**
 * Servicio para proporcionar información sobre el sistema
 */
const SystemInfoService = {
  /**
   * Verifica si una consulta es sobre información del sistema
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta sobre el sistema
   */
  isSystemInfoQuery(query) {
    // Normalizar la consulta para la comparación
    const normalizedQuery = query.toLowerCase().trim();
    
    // PRIMERA VERIFICACIÓN: Si contiene palabras clave específicas sobre creador
    if (this.quickCreatorCheck(normalizedQuery)) {
      logger.info(`[VERIFICACIÓN RÁPIDA] Detectada consulta sobre creador: "${query}"`);
      return true;
    }
    
    const systemPatterns = [
      // Patrones exactos para mayor prioridad - AMPLIADOS PARA DETECTAR MÁS VARIACIONES
      /quien (te|lo) (creo|creó|hizo|desarrollo|desarrolló)/i,
      /quienes (te|lo) (crearon|hicieron|desarrollaron)/i,
      /quien(es)? (te|lo) (programo|programó|diseñó|diseño)/i,
      /quien(es)? te (fabricó|fabrico|construyó|construyo)/i,
      /quien(es)? te (desarrolló|desarrollo|implementó|implemento)/i,
      /quién(es)? te (programó|programo|diseño|diseñó)/i,
      /quien fue (el que|quien|la persona (que)?) te (hizo|creó|creo|programó|programo)/i,
      /(dime|me dices) quien(es)? te (hizo|creó|creo|desarrolló|desarrollo)/i,
      /fuiste (hecho|creado|desarrollado) por/i,
      /(cuál|cual) es tu (creador|desarrollador|autor|origen)/i,
      /quién(es)? está(n)? (detrás|detras) de (ti|este asistente|este sistema)/i,
      /de donde (eres|vienes|provienes|surgiste|naces|naciste)/i,
      /qué (universidad|institución|institución educativa) te (creó|creo|desarrolló|desarrollo)/i,
      /dónde (fuiste creado|te crearon|fuiste desarrollado|te desarrollaron)/i,
      /qué (estudiantes|alumnos) te (desarrollaron|crearon)/i,
      /de qué (universidad|facultad|carrera) eres/i,
      // NUEVOS PATRONES MÁS GENERALES SOBRE CREACIÓN
      /quien te (creo|creó|hizo)/i,
      /quien (te ha|te ha) (creado|hecho|programado|desarrollado)/i,
      /de donde eres/i,
      /quien te (inventó|invento)/i,
      /quien eres tu/i,
      /quien esta detras de ti/i,
      /quien es tu (creador|desarrollador|programador)/i,
      
      // Patrones más generales (menor prioridad)
      /quien (eres|es el asistente|es este asistente)/i,
      /que (eres|hace este asistente|puedes hacer)/i,
      /información (sobre ti|acerca de ti|del asistente|del sistema)/i,
      /(dime|cuentame|cuéntame) (sobre ti|acerca de ti|quien eres)/i,
      /como (te llamas|te haces llamar)/i,
      /cual es tu (nombre|función|funcion|propósito|proposito)/i,
      /para que (sirves|fuiste creado|fuiste hecho)/i,
      /tu (propósito|proposito|objetivo|meta)/i,
      /como (funcionas|trabajas)/i,
      /(háblame|hablame|cuéntame|cuentame) (sobre ti|de ti|acerca de ti)/i,
      
      // Patrones de sede o ubicación
      /donde (estás|estas|te encuentras|fuiste creado|fuiste desarrollado)/i,
      /en qué (sede|campus|lugar) (fuiste creado|te crearon|fuiste desarrollado)/i,
      /qué (sede|campus|lugar) (te creó|te creo|te desarrolló|te desarrollo)/i
    ];

    // Comprobar patrones
    const isSystemQuery = systemPatterns.some(pattern => pattern.test(normalizedQuery));
    
    // Log para diagnóstico
    if (isSystemQuery) {
      logger.info(`Detectada consulta sobre información del sistema: "${query}"`);
    }
    
    return isSystemQuery;
  },

  /**
   * Verificación rápida y simple para consultas sobre el creador
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta sobre el creador
   */
  quickCreatorCheck(query) {
    // Lista de patrones simples y directos para detección rápida
    const simplePatterns = [
      "quien te creo", 
      "quien te creó", 
      "quien te hizo", 
      "quien te desarrollo", 
      "quien te desarrolló",
      "quién te creó",
      "quién te hizo",
      "quién te desarrolló",
      "quien es tu creador",
      "de donde vienes",
      "quien eres"
    ];
    
    return simplePatterns.some(pattern => query === pattern);
  },

  /**
   * Obtiene información sobre el sistema basado en el tipo de consulta
   * @param {string} query - Consulta original
   * @returns {Object} - Respuesta con información del sistema
   */
  getSystemInfo(query) {
    // Normalizar la consulta para análisis
    const lowerQuery = query.toLowerCase().trim();
    
    // RESPUESTA ESTÁNDAR MEJORADA PARA TODAS LAS CONSULTAS SOBRE CREADOR
    if (this.isCreatorQuery(lowerQuery) || this.quickCreatorCheck(lowerQuery)) {
      logger.info(`Respondiendo sobre el creador para: "${query}"`);
      return {
        response: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
        source: "system_info",
        confidence: 1.0
      };
    }
    
    // Información sobre la sede
    if (this.isLocationQuery(lowerQuery)) {
      logger.info(`Respondiendo sobre la ubicación para: "${query}"`);
      return {
        response: "Fui desarrollado en la sede de Salamá de la Universidad Mariano Gálvez de Guatemala, por estudiantes de la carrera de Ingeniería en Sistemas.",
        source: "system_info",
        confidence: 1.0
      };
    }
    
    // Información general sobre el asistente
    if (this.isGeneralAssistantQuery(lowerQuery)) {
      logger.info(`Respondiendo información general para: "${query}"`);
      return {
        response: "Soy un asistente virtual desarrollado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Estoy diseñado para responder a tus preguntas, aprender de nuestras conversaciones y proporcionarte información útil.",
        source: "system_info",
        confidence: 1.0
      };
    }
    
    // Respuesta por defecto sobre el sistema
    logger.info(`Usando respuesta por defecto para: "${query}"`);
    return {
      response: "Soy un asistente virtual creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Estoy aquí para responder tus preguntas y aprender de nuestras interacciones.",
      source: "system_info",
      confidence: 1.0
    };
  },

  /**
   * Verifica si es una consulta sobre el creador
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta sobre el creador
   */
  isCreatorQuery(query) {
    // Primero hacer la verificación rápida
    if (this.quickCreatorCheck(query)) {
      return true;
    }
    
    // Normalizamos la consulta para mejor comparación
    const normalizedQuery = query.trim().toLowerCase();
    
    // Lista exhaustiva de patrones para detectar preguntas sobre el creador
    const creatorPatterns = [
      // Patrones directos - AMPLIADOS Y MEJORADOS
      /quien (te|lo) (creo|creó|hizo|desarrollo|desarrolló)/i,
      /quienes (te|lo) (crearon|hicieron|desarrollaron)/i,
      /quien(es)? te (programo|programó|diseñó|diseño)/i,
      /(cuál|cual) es tu (creador|desarrollador|autor|origen)/i,
      /quién(es)? te (desarrolló|desarrollo|implementó|implemento)/i,
      /fuiste (hecho|creado|desarrollado) por/i,
      /quién(es)? está(n)? (detrás|detras) de (ti|este asistente)/i,
      /qué (estudiantes|alumnos) te (desarrollaron|crearon)/i,
      /qué (universidad|institución) te (creó|creo|desarrolló)/i,
      /quién(es)? te (hizo|fabricó|fabrico|construyó|construyo)/i,
      /quien fue (el que|quien|la persona que) te/i,
      /quien te (programo|programó|diseñó|diseño)/i,
      
      // NUEVOS PATRONES ADICIONALES
      /tu (fabricante|constructor|inventor)/i,
      /tu (equipo de desarrollo|equipo creador|equipo programador)/i,
      /quién (implementó|construyó) tu (sistema|software|programa|código)/i,
      /quién te (configuró|armó|constituyó|conformó)/i,
      /a quién (perteneces|representas)/i,
      /organización (detrás|detras) de (ti|este asistente|este sistema)/i,
      
      // Patrones con formulación diferente
      /quien (te hizo|te desarrolló|te creó|te programó)/i,
      /quienes fueron (los que te hicieron|quienes te programaron|tus creadores)/i,
      /de (quien|quienes) (eres creación|eres producto|provienes)/i,
      /quién(es)? (son|es) (tu|tus) (creador|creadores|desarrollador|desarrolladores)/i,
      /quién(es)? (te dio|te dieron) (vida|existencia)/i,
      /quién(es)? (te concibió|te concibieron|te ideó|te idearon)/i,
      /quién(es)? (te implementó|te programó|te codificó)/i,
      /a quién(es)? (le|les) debes tu (existencia|creación)/i,
      /quién fue( el)? responsable de (crearte|desarrollarte|programarte)/i,
      /quién(es)? (se encargó|se encargaron) de (tu desarrollo|tu creación|tu programación)/i,
      /quién(es)? (te puso|te pusieron) en funcionamiento/i,
      /quién(es)? te (trajo|trajeron) a la existencia/i,
      /quién(es)? te (construyó|construyeron)/i,
      /quién(es)? (te inventó|te inventaron)/i,
      /quién(es)? (te generó|te generaron|te produjo|te produjeron)/i,
      /quién(es)? (es|son) (el autor|los autores) de (tu código|tu programa|tu desarrollo)/i,
      /quién(es)? (está|están) (atrás|detrás) de (tu creación|tu desarrollo)/i
    ];

    // Evaluar cada patrón contra la consulta
    for (const pattern of creatorPatterns) {
      if (pattern.test(normalizedQuery)) {
        logger.info(`Patrón de creador coincidente encontrado: ${pattern}`);
        return true;
      }
    }
    
    // Verificación adicional para consultas muy simples y directas
    if (normalizedQuery.includes('quien') && 
        (normalizedQuery.includes('creo') || normalizedQuery.includes('creó') || 
         normalizedQuery.includes('hizo') || normalizedQuery.includes('programo') || 
         normalizedQuery.includes('programó') || normalizedQuery.includes('desarrollo') || 
         normalizedQuery.includes('desarrolló'))) {
      logger.info(`Consulta de creador detectada por análisis de palabras clave: "${normalizedQuery}"`);
      return true;
    }
    
    return false;
  },

  /**
   * Verifica si es una consulta sobre la ubicación o sede
   * @param {string} query - Consulta normalizada 
   * @returns {boolean} - true si es una consulta sobre ubicación/sede
   */
  isLocationQuery(query) {
    const locationPatterns = [
      /donde (estás|estas|te encuentras|fuiste creado|fuiste desarrollado)/i,
      /en qué (sede|campus|lugar) (fuiste creado|te crearon|fuiste desarrollado)/i,
      /qué (sede|campus|lugar) (te creó|te creo|te desarrolló|te desarrollo)/i,
      /de donde (eres|vienes|provienes|surgiste|naces|naciste)/i,
      /dónde (fuiste creado|te crearon|fuiste desarrollado|te desarrollaron)/i,
      /de qué (universidad|facultad|carrera) eres/i,
      /en dónde (naciste|te programaron|te hicieron|te desarrollaron)/i,
      /cuál es (tu lugar de origen|tu lugar de creación|tu lugar de desarrollo)/i,
      /dónde (te construyeron|te ensamblaron|te programaron)/i,
      /de qué (lugar|sitio|universidad|institución) vienes/i,
      /dónde está (tu origen|tu sede|tu centro de desarrollo)/i,
      /dónde fue tu (creación|desarrollo|programación)/i,
      /en qué (institución|universidad|escuela|facultad) fuiste (desarrollado|creado|programado)/i,
      /cuál es tu (sede|campus|ubicación) de (origen|desarrollo)/i
    ];

    return locationPatterns.some(pattern => pattern.test(query));
  },

  /**
   * Verifica si es una consulta general sobre el asistente
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta general sobre el asistente
   */
  isGeneralAssistantQuery(query) {
    const generalPatterns = [
      /quien (eres|es el asistente|es este asistente)/i,
      /que (eres|hace este asistente|puedes hacer)/i,
      /información (sobre ti|acerca de ti|del asistente|del sistema)/i,
      /(dime|cuentame|cuéntame) (sobre ti|acerca de ti|quien eres)/i,
      /como (te llamas|te haces llamar)/i,
      /cual es tu (nombre|función|funcion|propósito|proposito)/i,
      /para que (sirves|fuiste creado|fuiste hecho)/i,
      /tu (propósito|proposito|objetivo|meta)/i,
      /como (funcionas|trabajas)/i,
      /(háblame|hablame|cuéntame|cuentame) (sobre ti|de ti|acerca de ti)/i,
      /qué (tipo de asistente|clase de sistema|tipo de IA) eres/i,
      /cuál es tu (propósito|objetivo|finalidad|meta)/i,
      /para qué fuiste (creado|diseñado|desarrollado)/i,
      /qué (sabes hacer|puedes hacer|haces)/i,
      /cómo (funcionas|operas|trabajas)/i,
      /qué tipo de (tareas|preguntas|consultas) puedes (responder|manejar|procesar)/i,
      /explícame (qué eres|cómo funcionas|para qué sirves)/i,
      /qué (capacidades|habilidades|funciones) tienes/i,
      /cuéntame (sobre ti|acerca de ti|sobre tus funciones)/i,
      /describe (tu funcionamiento|tus capacidades|tu propósito)/i
    ];

    return generalPatterns.some(pattern => pattern.test(query));
  }
};

module.exports = SystemInfoService;