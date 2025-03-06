// factualKnowledgeService.js - Mejorado con mejor detección y validación de respuestas
const axios = require('axios');
const { logger } = require('../config');

/**
 * Servicio para obtener conocimientos factuales en tiempo real
 */
const FactualKnowledgeService = {
  /**
   * Obtiene información en tiempo real de fuentes externas con validación de precisión
   * @param {string} query - Consulta del usuario
   * @returns {Promise<Object|null>} - Respuesta factual
   */
  async getRealTimeFactualResponse(query) {
    try {
      logger.info(`Buscando información factual para: "${query}"`);
      
      // Intentar obtener respuesta de Wikipedia primero
      const wikiResponse = await this.getWikipediaSummary(query);
      if (wikiResponse) return wikiResponse;
      
      // Intentar obtener respuesta de DuckDuckGo
      const duckResponse = await this.getDuckDuckGoAnswer(query);
      if (duckResponse) return duckResponse;
      
      // Si las fuentes principales fallan, intentar con WolframAlpha para datos científicos
      const wolframResponse = await this.getWolframAlphaResult(query);
      if (wolframResponse) return wolframResponse;
      
      return null;
    } catch (error) {
      logger.error(`Error obteniendo información factual para "${query}":`, error);
      return null;
    }
  },

  /**
   * Obtiene una respuesta directa para consultas factuales específicas
   * @param {string} query - Consulta del usuario 
   * @returns {Object|null} - Respuesta o null
   */
  getDirectFactualResponse(query) {
    try {
      // Normalizar la consulta
      const normalizedQuery = query.toLowerCase().trim();
      
      // Verificar si es una consulta factual directa
      if (!this.isDirectFactualQuery(normalizedQuery)) {
        return null;
      }
      
      // Categorizar la consulta
      const category = this.categorizeFactualQuery(normalizedQuery);
      
      // Buscar coincidencia en la base de conocimiento incorporada
      const factualMatch = this.findFactInDatabase(normalizedQuery, category);
      
      if (factualMatch) {
        logger.info(`Encontrada respuesta factual directa para: "${query}"`);
        return {
          response: factualMatch.answer,
          source: factualMatch.source || 'Base de datos interna',
          confidence: 0.95,
          context: factualMatch.context || category
        };
      }
      
      // Si hay configuración para búsqueda en tiempo real
      if (this.shouldUseRealTimeSearch(query, category)) {
        // Programar búsqueda en tiempo real (se ejecutará en segundo plano)
        this.scheduleRealTimeSearch(query, category);
        
        // No devolvemos la respuesta aquí, sino que dejamos que
        // el sistema continúe con otros métodos de búsqueda
      }
      
      return null;
    } catch (error) {
      logger.error(`Error al obtener respuesta factual directa para "${query}":`, error);
      return null;
    }
  },
  
  /**
   * Verifica si una consulta es directamente factual
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es factual directa
   */
  isDirectFactualQuery(query) {
    const factualPatterns = [
      /^qu[ié]n\s+(es|fue|era)\s+/i,                     // quién es/fue
      /^qu[ée]\s+(es|son|significa)\s+/i,                // qué es/son/significa
      /^cu[aá]l\s+(es|son|era|eran|fue)\s+/i,            // cuál es/son/era/fueron
      /^cu[aá]ndo\s+(es|fue|naci[óo]|muri[óo])\s+/i,     // cuándo es/fue/nació/murió
      /^d[oó]nde\s+(est[aá]|queda|se encuentra)\s+/i,    // dónde está/queda/se encuentra
      /^en\s+qu[ée]\s+(año|fecha|lugar|país|ciudad)\s+/i,// en qué año/fecha/lugar
      /capital\s+de\s+/i,                                // capital de
      /presidente\s+de\s+/i,                             // presidente de
      /población\s+de\s+/i,                              // población de
      /fundador\s+de\s+/i,                               // fundador de
      /color\s+de\s+/i,                                  // color de
      /autores?\s+de\s+/i,                               // autor(es) de
      /director\s+de\s+/i,                               // director de
      /altura\s+de\s+/i,                                 // altura de
      /tamaño\s+de\s+/i,                                 // tamaño de
      /creador\s+de\s+/i,                                // creador de
      /inventor\s+de\s+/i                                // inventor de
    ];
    
    return factualPatterns.some(pattern => pattern.test(query));
  },
  
  /**
   * Categoriza la consulta factual para mejor manejo
   * @param {string} query - Consulta normalizada
   * @returns {string} - Categoría de la consulta
   */
  categorizeFactualQuery(query) {
    // Definir categorías y sus patrones
    const categories = {
      'persona': /^qu[ié]n\s+(es|fue|era)\s+|autor\s+de|creador\s+de|inventor\s+de|fundador\s+de/i,
      'concepto': /^qu[ée]\s+(es|son|significa)\s+/i,
      'geografía': /capital\s+de|población\s+de|d[oó]nde\s+(est[aá]|queda|se encuentra)|país|ciudad|región|continente/i,
      'tiempo': /^cu[aá]ndo\s+|^en\s+qu[ée]\s+(año|fecha)|año\s+de|fecha\s+de/i,
      'política': /presidente\s+de|gobierno\s+de|primer ministro\s+de|gobernador\s+de/i,
      'ciencia': /temperatura\s+de|distancia\s+entre|masa\s+de|composición\s+de|fórmula\s+de/i,
      'arte': /autor\s+de|director\s+de|compositor\s+de|cantante\s+de|pintor\s+de/i,
      'medidas': /altura\s+de|longitud\s+de|tamaño\s+de|peso\s+de|área\s+de|volumen\s+de/i
    };
    
    // Buscar coincidencia con categorías
    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(query)) {
        return category;
      }
    }
    
    return 'general'; // Categoría por defecto
  },
  
  /**
   * Determina si debe usar búsqueda en tiempo real
   * @param {string} query - Consulta original
   * @param {string} category - Categoría de la consulta
   * @returns {boolean} - true si debería usar búsqueda en tiempo real
   */
  shouldUseRealTimeSearch(query, category) {
    // Consultas de actualidad que siempre deberían usar búsqueda en tiempo real
    const currentEventsKeywords = [
      'actual', 'último', 'reciente', 'hoy', 'ahora',
      'presidente actual', 'actual presidente',
      'este año', 'actualmente'
    ];
    
    // Si contiene palabras clave de eventos actuales
    if (currentEventsKeywords.some(keyword => query.includes(keyword))) {
      return true;
    }
    
    // Categorías que generalmente se benefician de búsqueda en tiempo real
    const realTimeCategories = ['política', 'tiempo', 'ciencia'];
    if (realTimeCategories.includes(category)) {
      return true;
    }
    
    return false; // Por defecto, no usar búsqueda en tiempo real
  },
  
  /**
   * Programa una búsqueda en tiempo real para actualizar la base de conocimiento
   * @param {string} query - Consulta original
   * @param {string} category - Categoría de la consulta
   */
  scheduleRealTimeSearch(query, category) {
    // Esta función solo marca la consulta para búsqueda en segundo plano
    logger.info(`Programando búsqueda en tiempo real para "${query}" (categoría: ${category})`);
    
    // Aquí se podría implementar un sistema para encolar consultas para búsqueda
    // en segundo plano, pero por ahora solo registramos la intención
  },
  
  /**
   * Busca en la base de datos interna de hechos factuales
   * @param {string} query - Consulta normalizada
   * @param {string} category - Categoría de la consulta
   * @returns {Object|null} - Respuesta encontrada o null
   */
  findFactInDatabase(query, category) {
    // Base de conocimiento básica incorporada (esto debería reemplazarse con una base de datos real)
    const knowledgeBase = [
      // Ejemplos de geografía
      {
        patterns: [/capital\s+de\s+españa/i, /cuál\s+es\s+la\s+capital\s+de\s+españa/i],
        answer: "La capital de España es Madrid.",
        category: "geografía",
        source: "Conocimiento incorporado"
      },
      {
        patterns: [/capital\s+de\s+francia/i, /cuál\s+es\s+la\s+capital\s+de\s+francia/i],
        answer: "La capital de Francia es París.",
        category: "geografía", 
        source: "Conocimiento incorporado"
      },
      // Ejemplos de conceptos
      {
        patterns: [/qué\s+es\s+fotosíntesis/i, /qué\s+significa\s+fotosíntesis/i],
        answer: "La fotosíntesis es el proceso por el cual las plantas y algunas bacterias utilizan la luz solar, el agua y el dióxido de carbono para crear oxígeno y energía en forma de azúcares.",
        category: "ciencia",
        source: "Conocimiento incorporado"
      },
      // Ejemplos de personajes
      {
        patterns: [/quién\s+es\s+cervantes/i, /quién\s+fue\s+miguel\s+de\s+cervantes/i],
        answer: "Miguel de Cervantes Saavedra fue un novelista, poeta, dramaturgo y soldado español. Es ampliamente considerado como la máxima figura de la literatura española y es universalmente conocido por haber escrito 'Don Quijote de la Mancha'.",
        category: "persona",
        source: "Conocimiento incorporado"
      }
      // Agregar más entradas según sea necesario
    ];
    
    // Buscar coincidencia en la base de conocimiento
    for (const entry of knowledgeBase) {
      if (entry.patterns.some(pattern => pattern.test(query)) && 
          (entry.category === category || category === 'general')) {
        return entry;
      }
    }
    
    return null; // No se encontró coincidencia
  },
  
  /**
   * Obtiene un resumen de Wikipedia
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object|null>} - Respuesta de Wikipedia
   */
  async getWikipediaSummary(query) {
    try {
      // Extraer palabra clave principal para la búsqueda
      const searchTerm = this.extractMainSearchTerm(query);
      if (!searchTerm) return null;
      
      logger.info(`Consultando Wikipedia para: "${searchTerm}"`);
      
      // Primero intentar con Wikipedia en español
      const url = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`;
      const response = await axios.get(url, { timeout: 5000 });
      
      if (response.data && response.data.extract && this.validateWikipediaResponse(response.data, query)) {
        return {
          response: response.data.extract,
          source: 'Wikipedia',
          confidence: 0.9,
          context: response.data.title
        };
      }
      
      // Si no hay resultados en español, intentar en inglés
      const enUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchTerm)}`;
      const enResponse = await axios.get(enUrl, { timeout: 5000 });
      
      if (enResponse.data && enResponse.data.extract && this.validateWikipediaResponse(enResponse.data, query)) {
        // Traducir manualmente en un entorno real
        return {
          response: enResponse.data.extract,
          source: 'Wikipedia (EN)',
          confidence: 0.85, // Menor confianza por estar en inglés
          context: enResponse.data.title
        };
      }
    } catch (error) {
      logger.warn(`Error al consultar Wikipedia: ${error.message}`);
    }
    
    return null;
  },
  
  /**
   * Valida la relevancia de una respuesta de Wikipedia
   * @param {Object} wikiData - Datos de respuesta de Wikipedia
   * @param {string} query - Consulta original
   * @returns {boolean} - true si la respuesta es relevante
   */
  validateWikipediaResponse(wikiData, query) {
    // Si la página es una desambiguación, no es una respuesta directa válida
    if (wikiData.type === 'disambiguation') {
      return false;
    }
    
    // Verificar si el extracto es muy corto
    if (!wikiData.extract || wikiData.extract.length < 20) {
      return false;
    }
    
    // Extraer palabras clave de la consulta
    const queryKeywords = query.toLowerCase()
      .replace(/[^\w\sáéíóúüñ]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Verificar si al menos algunas palabras clave están en el extracto
    const extractLower = wikiData.extract.toLowerCase();
    const matchingKeywords = queryKeywords.filter(keyword => extractLower.includes(keyword));
    
    return matchingKeywords.length >= 1;
  },
  
  /**
   * Extrae el término principal de búsqueda de una consulta
   * @param {string} query - Consulta original
   * @returns {string|null} - Término de búsqueda
   */
  extractMainSearchTerm(query) {
    // Intentar extraer entidad principal
    const patterns = [
      // Patrones de extracción para diferentes tipos de preguntas
      { pattern: /quién\s+(?:es|fue|era)\s+(.+?)(?:\?|$)/i, group: 1 },
      { pattern: /qué\s+(?:es|son|significa)\s+(.+?)(?:\?|$)/i, group: 1 },
      { pattern: /dónde\s+(?:está|queda|se encuentra)\s+(.+?)(?:\?|$)/i, group: 1 },
      { pattern: /capital\s+de\s+(.+?)(?:\?|$)/i, group: 1 },
      { pattern: /presidente\s+de\s+(.+?)(?:\?|$)/i, group: 1 },
      // Patrón genérico para capturar el tema principal si ninguno de los anteriores coincide
      { pattern: /(?:sobre|acerca de)\s+(.+?)(?:\?|$)/i, group: 1 }
    ];
    
    for (const {pattern, group} of patterns) {
      const match = query.match(pattern);
      if (match && match[group]) {
        return match[group].trim();
      }
    }
    
    // Si no se puede extraer, usar la consulta completa limpiando palabras comunes
    const cleanQuery = query.toLowerCase()
      .replace(/^(?:qué|quién|dónde|cuándo|cómo|cuál|por qué|cuánto|cuánta)\s+(?:es|son|está|fue|fueron|eran)\s+/i, '')
      .replace(/\?|\!/g, '')
      .trim();
    
    return cleanQuery.length > 0 ? cleanQuery : null;
  },
  
  /**
   * Obtiene respuesta de DuckDuckGo Instant Answer API
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object|null>} - Respuesta de DuckDuckGo
   */
  async getDuckDuckGoAnswer(query) {
    try {
      logger.info(`Consultando DuckDuckGo para: "${query}"`);
      
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          skip_disambig: 1,
          no_html: 1
        },
        timeout: 5000
      });
      
      const data = response.data;
      
      // Verificar si hay respuesta abstracta
      if (data.AbstractText && data.AbstractText.length > 20) {
        return {
          response: data.AbstractText,
          source: data.AbstractSource || 'DuckDuckGo',
          confidence: 0.85,
          context: data.Heading || query
        };
      }
      
      // Verificar si hay respuesta directa
      if (data.Answer && data.Answer.length > 5) {
        return {
          response: data.Answer,
          source: 'DuckDuckGo',
          confidence: 0.9, // Mayor confianza para respuestas directas
          context: data.AnswerType || 'Respuesta directa'
        };
      }
      
      // Verificar si hay definición
      if (data.Definition && data.Definition.length > 20) {
        return {
          response: data.Definition,
          source: data.DefinitionSource || 'DuckDuckGo',
          confidence: 0.85,
          context: 'Definición'
        };
      }
    } catch (error) {
      logger.warn(`Error al consultar DuckDuckGo: ${error.message}`);
    }
    
    return null;
  },
  
  /**
   * Obtiene resultado de WolframAlpha para consultas científicas/matemáticas
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object|null>} - Respuesta de WolframAlpha
   */
  async getWolframAlphaResult(query) {
    // Nota: Esta función requiere una API key de WolframAlpha
    // Implementación de ejemplo que podrías desarrollar con la API real
    try {
      // Verificar si hay API key configurada (esto debería estar en config)
      const apiKey = process.env.WOLFRAM_ALPHA_APP_ID;
      if (!apiKey) {
        logger.warn('WolframAlpha API Key no configurada');
        return null;
      }
      
      logger.info(`Consultando WolframAlpha para: "${query}"`);
      
      // Llamada a API de Wolfram Alpha
      const wolframUrl = `https://api.wolframalpha.com/v1/result?appid=${apiKey}&i=${encodeURIComponent(query)}`;
      const response = await axios.get(wolframUrl, { timeout: 5000 });
      
      if (response.data) {
        return {
          response: response.data,
          source: 'WolframAlpha',
          confidence: 0.9,
          context: 'Cálculo matemático/científico'
        };
      }
    } catch (error) {
      // WolframAlpha responde con status 501 si no tiene resultado
      if (error.response && error.response.status !== 501) {
        logger.warn(`Error al consultar WolframAlpha: ${error.message}`);
      }
    }
    
    return null;
  }
};

module.exports = FactualKnowledgeService;