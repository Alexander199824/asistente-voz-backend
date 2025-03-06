const { logger } = require('../config');

/**
 * Servicio para formar respuestas concisas de conocimiento general
 */
const KnowledgeResponseService = {
  /**
   * Detecta si una consulta es de tipo quién/qué/cuál
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta de información factual
   */
  isFactualQuestion(query) {
    // Normalizar la consulta para manejar acentos incorrectos
    const normalizedQuery = query.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
      
    const factualPatterns = [
      /^(quien|quién|quienes|quiénes)(\s+es|\s+son|\s+fue|\s+fueron)/i,
      /^(cual|cuál|cuales|cuáles)(\s+es|\s+son|\s+fue|\s+fueron)/i,
      /^(que|qué)(\s+es|\s+son|\s+fue|\s+fueron)/i,
      /^(donde|dónde)(\s+es|\s+está|\s+se encuentra|\s+se ubica|\s+queda)/i,
      /^(cuando|cuándo)(\s+es|\s+fue|\s+ocurrió|\s+sucedió|\s+nació|\s+murió)/i,
      /^(como|cómo)(\s+se|\s+es|\s+fue|\s+funciona)/i,
      /^(por que|por qué)(\s+es|\s+son|\s+fue|\s+fueron)/i,
      // Patrones específicos para monedas
      /moneda(s)?\s+(?:oficial(?:es)?)?(\s+de|\s+del|\s+en)/i,
      /que\s+moneda(s)?/i, 
      /cuales?\s+(?:es|son)\s+(?:la|las)\s+moneda(s)?/i,
      // Otros patrones factales
      /capital\s+de/i,
      /presidente\s+de/i,
      /población\s+de/i,
      /ubicación\s+de/i,
      /fecha\s+de/i,
      /año\s+de/i,
      /fundación\s+de/i,
      /significado\s+de/i,
      /definición\s+de/i,
      /cuantos|cuántos|cuantas|cuántas/i
    ];

    // Check if any pattern matches
    for (const pattern of factualPatterns) {
      if (pattern.test(normalizedQuery) || pattern.test(query.toLowerCase())) {
        return true;
      }
    }

    // Verificación adicional para monedas y unión europea específicamente
    if (normalizedQuery.includes('moneda') || normalizedQuery.includes('union europea') || 
        normalizedQuery.includes('ue') || normalizedQuery.includes('euro')) {
      logger.info(`Consulta "${query}" detectada como factual por palabras clave específicas.`);
      return true;
    }

    return false;
  },

  /**
   * Identifica categorías específicas de preguntas factuales para procesamiento especializado
   * @param {string} query - Consulta normalizada
   * @returns {string|null} - Categoría de la pregunta o null
   */
  identifyQuestionCategory(query) {
    // Normalizar la consulta
    const normalizedQuery = query.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
      
    // Patrones para diferentes categorías de preguntas
    const categories = {
      'definición': /^(que|qué)\s+es\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'persona': /^(quien|quién)\s+(es|fue)\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'lugar': /^(donde|dónde)\s+(está|queda|se encuentra|se ubica)\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'fecha': /^(cuando|cuándo)\s+(fue|es|ocurrió|sucedió|nació|murió)\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'cantidad': /^(cuantos|cuántos|cuantas|cuántas)\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'razón': /^(por que|por qué)\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'método': /^(como|cómo)\s+(se|es|fue|funciona)\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'capital': /capital\s+de\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'presidente': /presidente\s+de\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'población': /población\s+de\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i,
      'moneda': /moneda(s)?\s+(?:oficial(?:es)?)?\s+de\s+[a-z0-9áéíóúüñ\s]+(\?)?$/i
    };

    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(normalizedQuery) || pattern.test(query.toLowerCase())) {
        return category;
      }
    }
    
    // Verificación adicional para monedas
    if (normalizedQuery.includes('moneda') || normalizedQuery.includes('euro')) {
      return 'moneda';
    }

    return null;
  },

  /**
   * Detecta patrones específicos y proporciona respuestas breves y precisas
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original (posiblemente extensa)
   * @returns {string} - Respuesta refinada o la original si no aplica
   */
  refineFactualResponse(query, response) {
    try {
      if (!query || !response) return response;
      
      // Normalizar la consulta
      const lowerQuery = query.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim();
        
      const category = this.identifyQuestionCategory(lowerQuery);
      
      logger.info(`Refinando respuesta para consulta de tipo: ${category || 'general'}`);
      
      // Si identificamos una categoría específica, aplicar refinamiento especializado
      if (category) {
        switch (category) {
          case 'definición':
            return this.refineDefinitionResponse(query, response);
          case 'persona':
            return this.refinePersonResponse(query, response);
          case 'lugar':
            return this.refineLocationResponse(query, response);
          case 'capital':
            return this.refineCapitalResponse(query, response);
          case 'presidente':
            return this.refinePresidentResponse(query, response);
          case 'población':
            return this.refinePopulationResponse(query, response);
          case 'cantidad':
            return this.refineQuantityResponse(query, response);
          case 'moneda':
            return this.refineCurrencyResponse(query, response);
          default:
            // Para otras categorías, aplicar refinamiento general
            break;
        }
      }
      
      // Preguntas de "quién es"
      if (/^(quien|quién)\s+es\s+(.+?)(\?)?$/i.test(query)) {
        const match = query.match(/^(quien|quién)\s+es\s+(.+?)(\?)?$/i);
        const person = match[2].trim();
        
        // Intentar extraer una respuesta concisa
        const conciseResponse = this.extractConciseDefinition(person, response);
        if (conciseResponse) {
          return conciseResponse;
        }
      }
      
      // Preguntas de "cuál es la capital de"
      if (lowerQuery.includes('capital') && lowerQuery.includes('de')) {
        const country = query.match(/capital\s+de\s+(.+?)(\?)?$/i)?.[1]?.trim();
        if (country && response.length > 100) {
          // Si la respuesta es demasiado larga, intentar extraer solo la capital
          const capital = this.extractCapitalFromResponse(response);
          if (capital) {
            return `La capital de ${country} es ${capital}.`;
          }
        }
      }
      
      // Preguntas de "quién es el presidente de"
      if ((lowerQuery.includes('presidente') || lowerQuery.includes('presidenta')) && lowerQuery.includes('de')) {
        const country = query.match(/(presidente|presidenta)\s+de\s+(.+?)(\?)?$/i)?.[2]?.trim();
        if (country && response.length > 100) {
          // Si la respuesta es demasiado larga, intentar extraer solo el nombre
          const president = this.extractPresidentFromResponse(response, country);
          if (president) {
            return `El presidente de ${country} es ${president}.`;
          }
        }
      }
      
      // Preguntas sobre monedas
      if (lowerQuery.includes('moneda') || lowerQuery.includes('euro')) {
        const entity = this.extractEntityFromMoneyQuery(lowerQuery);
        if (entity && response.length > 100) {
          // Intentar extraer solo la moneda
          const currency = this.extractCurrencyFromResponse(response, entity);
          if (currency) {
            return `La moneda ${lowerQuery.includes('oficial') ? 'oficial ' : ''}de ${entity} es ${currency}.`;
          }
        }
      }
      
      // Si la respuesta es muy larga para una pregunta factual, acortarla
      if (this.isFactualQuestion(query) && response.length > 150) {
        const shortResponse = this.truncateToRelevantContent(response);
        if (shortResponse && shortResponse.length < response.length) {
          return shortResponse;
        }
      }
      
      // Si no hay coincidencia con patrones específicos o no se pudo refinar, devolver la original
      return response;
    } catch (error) {
      logger.error('Error al refinar respuesta factual:', error);
      return response; // En caso de error, devolver la respuesta original
    }
  },
  
  /**
   * Extrae entidad de una consulta sobre moneda
   * @param {string} query - Consulta normalizada 
   * @returns {string|null} - Entidad o null
   */
  extractEntityFromMoneyQuery(query) {
    const patterns = [
      /moneda[s]?\s+(?:oficial(?:es)?)?\s+de\s+(.+?)(?:\?|$)/i,
      /que\s+moneda[s]?\s+(?:se\s+usa[n]?\s+en)\s+(.+?)(?:\?|$)/i,
      /moneda[s]?\s+(?:que\s+)?(?:se\s+usa[n]?\s+en)\s+(.+?)(?:\?|$)/i,
      /cual(?:es)?\s+(?:es|son)\s+la[s]?\s+moneda[s]\s+(?:oficial(?:es)?)?\s+de\s+(.+?)(?:\?|$)/i
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Si es específicamente sobre la Unión Europea
    if (query.includes('union europea') || query.includes('unión europea') || query.includes('ue')) {
      return 'la Unión Europea';
    }
    
    return null;
  },
  
  /**
   * Extrae el nombre de la moneda de una respuesta
   * @param {string} response - Texto de respuesta
   * @param {string} entity - Entidad (país, región)
   * @returns {string|null} - Nombre de la moneda o null
   */
  extractCurrencyFromResponse(response, entity) {
    // Patrones para extraer nombres de monedas
    const patterns = [
      /moneda\s+(?:oficial)?\s+(?:es|de)\s+(?:el|la)?\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i,
      /(?:utiliza|usa)\s+(?:como\s+)?moneda\s+(?:oficial)?\s+(?:el|la)?\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i,
      /moneda\s+(?:oficial)?\s+(?:(?:es|se\s+llama)\s+)(?:el|la)?\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i
    ];
    
    // Patrones específicos para el euro
    if (entity.toLowerCase().includes('union europea') || entity.toLowerCase().includes('unión europea') || entity.toLowerCase().includes('ue')) {
      if (response.toLowerCase().includes('euro')) {
        return 'el euro';
      }
    }
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Buscar menciones directas de monedas comunes
    const commonCurrencies = [
      'euro', 'dólar', 'peso', 'libra', 'yen', 'franco', 'real', 
      'rupia', 'yuan', 'won', 'rublo', 'corona', 'zloty', 'rand'
    ];
    
    for (const currency of commonCurrencies) {
      if (response.toLowerCase().includes(currency)) {
        const surrounding = this.extractSurroundingContext(response, currency, 30);
        if (surrounding) {
          return surrounding;
        }
        return `el ${currency}`;
      }
    }
    
    return null;
  },
  
  /**
   * Extrae contexto alrededor de una palabra clave
   * @param {string} text - Texto completo
   * @param {string} keyword - Palabra clave a buscar
   * @param {number} windowSize - Tamaño de la ventana de contexto
   * @returns {string|null} - Contexto o null
   */
  extractSurroundingContext(text, keyword, windowSize) {
    const lowercaseText = text.toLowerCase();
    const index = lowercaseText.indexOf(keyword);
    
    if (index === -1) return null;
    
    const start = Math.max(0, index - windowSize);
    const end = Math.min(text.length, index + keyword.length + windowSize);
    
    // Extraer el fragmento
    let fragment = text.substring(start, end);
    
    // Ajustar para no cortar palabras
    if (start > 0) {
      const firstSpace = fragment.indexOf(' ');
      if (firstSpace > 0) {
        fragment = fragment.substring(firstSpace + 1);
      }
    }
    
    if (end < text.length) {
      const lastSpace = fragment.lastIndexOf(' ');
      if (lastSpace > 0) {
        fragment = fragment.substring(0, lastSpace);
      }
    }
    
    return fragment.trim();
  },
    
  /**
   * Refine específico para preguntas sobre monedas
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refineCurrencyResponse(query, response) {
    // Extraer la entidad (país, región)
    const normalizedQuery = query.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim();
      
    const entity = this.extractEntityFromMoneyQuery(normalizedQuery);
    
    if (!entity) return response;
    
    // Extraer la moneda de la respuesta
    const currency = this.extractCurrencyFromResponse(response, entity);
    
    if (currency) {
      if (entity.toLowerCase().includes('union europea') || entity.toLowerCase().includes('unión europea') || entity.toLowerCase().includes('ue')) {
        return `La moneda oficial de la Unión Europea es ${currency}.`;
      }
      return `La moneda ${normalizedQuery.includes('oficial') ? 'oficial ' : ''}de ${entity} es ${currency}.`;
    }
    
    // Si no se pudo extraer la moneda, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una definición concisa de una entidad
   * @param {string} entity - Entidad a definir
   * @param {string} fullText - Texto completo
   * @returns {string|null} - Definición concisa o null
   */
  extractConciseDefinition(entity, fullText) {
    try {
      // Patrones comunes para definiciones
      const patterns = [
        new RegExp(`${entity}\\s+(?:es|fue)\\s+([^.]+)\\.`, 'i'),
        new RegExp(`${entity}\\s+(?:es conocido|se conoce)\\s+(?:como|por)\\s+([^.]+)\\.`, 'i'),
        new RegExp(`${entity},\\s+([^.]+)\\.`, 'i'),
        /^([^.]+)\./  // La primera oración completa
      ];
      
      for (const pattern of patterns) {
        const match = fullText.match(pattern);
        if (match && match[1]) {
          return `${entity} es ${match[1]}.`;
        }
      }
      
      // Si el texto es corto (menos de 200 caracteres), devolverlo completo
      if (fullText.length < 200) {
        return fullText;
      }
      
      // Si no se encontró una definición concisa, truncar al primer párrafo
      const firstParagraph = fullText.split('\n')[0];
      if (firstParagraph && firstParagraph.length < 200) {
        return firstParagraph;
      }
      
      // Si el párrafo es muy largo, truncar a la primera oración
      const firstSentence = this.truncateToFirstSentence(fullText);
      if (firstSentence) {
        return firstSentence;
      }
      
      return null;
    } catch (error) {
      logger.error('Error al extraer definición concisa:', error);
      return null;
    }
  },
  
  /**
   * Extrae el nombre de una capital de una respuesta
   * @param {string} response - Texto de respuesta
   * @returns {string|null} - Nombre de la capital o null
   */
  extractCapitalFromResponse(response) {
    // Patrones para extraer nombres de capitales
    const patterns = [
      /capital\s+es\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i,
      /capital\s+de[l]?\s+país\s+es\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i,
      /ciudad\s+capital\s+es\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i,
      /capital,\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i
    ];
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  },
  
  /**
   * Extrae el nombre de un presidente de una respuesta
   * @param {string} response - Texto de respuesta
   * @param {string} country - País
   * @returns {string|null} - Nombre del presidente o null
   */
  extractPresidentFromResponse(response, country) {
    // Patrones para extraer nombres de presidentes
    const patterns = [
      new RegExp(`presidente\\s+(?:actual\\s+)?(?:de\\s+${country}\\s+)?es\\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\\s]+?)(\\.|\,)`, 'i'),
      new RegExp(`actual\\s+presidente\\s+(?:de\\s+${country}\\s+)?es\\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\\s]+?)(\\.|\,)`, 'i'),
      new RegExp(`mandatario\\s+(?:de\\s+${country}\\s+)?es\\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\\s]+?)(\\.|\,)`, 'i'),
      /presidente\s+(?:actual\s+)?es\s+([A-Za-zÁáÉéÍíÓóÚúÑñ\s]+?)(\.|,)/i
    ];
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Si no encontramos un patrón específico, buscar algún nombre propio en la primera oración
    const firstSentence = this.truncateToFirstSentence(response);
    const namePattern = /([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+){1,4})/g;
    const nameMatches = [...firstSentence.matchAll(namePattern)];
    
    if (nameMatches && nameMatches.length > 0) {
      // Preferir el nombre que no contiene el nombre del país
      const filteredMatches = nameMatches.filter(match => {
        const name = match[1];
        return !name.toLowerCase().includes(country.toLowerCase());
      });
      
      if (filteredMatches.length > 0) {
        return filteredMatches[0][1].trim();
      }
    }
    
    return null;
  },
  
  /**
   * Extrae una respuesta concisa para preguntas de definición
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refineDefinitionResponse(query, response) {
    // Extraer el término a definir
    const match = query.match(/^(que|qué)\s+es\s+(.+?)(\?)?$/i);
    if (!match) return response;
    
    const term = match[2].trim();
    
    // Patrones de definición
    const definitionPatterns = [
      new RegExp(`${term}\\s+es\\s+([^.]+)\\.`, 'i'),
      new RegExp(`${term}\\s+se\\s+define\\s+como\\s+([^.]+)\\.`, 'i'),
      new RegExp(`${term}\\s+se\\s+refiere\\s+a\\s+([^.]+)\\.`, 'i'),
      new RegExp(`${term}\\s+significa\\s+([^.]+)\\.`, 'i'),
      new RegExp(`El\\s+término\\s+${term}\\s+([^.]+)\\.`, 'i')
    ];
    
    for (const pattern of definitionPatterns) {
      const definitionMatch = response.match(pattern);
      if (definitionMatch && definitionMatch[1]) {
        return `${term} es ${definitionMatch[1]}.`;
      }
    }
    
    // Si no se encuentra un patrón específico, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una respuesta concisa para preguntas sobre personas
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refinePersonResponse(query, response) {
    // Extraer el nombre de la persona
    const match = query.match(/^(quien|quién)\s+(es|fue)\s+(.+?)(\?)?$/i);
    if (!match) return response;
    
    const person = match[3].trim();
    
    // Patrones para información biográfica
    const bioPatterns = [
      new RegExp(`${person}\\s+(es|fue)\\s+([^.]+)\\.`, 'i'),
      new RegExp(`${person}\\s+(es|fue)\\s+([^,]+),`, 'i'),
      new RegExp(`${person},\\s+([^.]+)\\.`, 'i')
    ];
    
    for (const pattern of bioPatterns) {
      const bioMatch = response.match(pattern);
      if (bioMatch) {
        const verb = bioMatch[1] || (match[2] === 'es' ? 'es' : 'fue');
        const description = bioMatch[2] || bioMatch[1];
        return `${person} ${verb} ${description}.`;
      }
    }
    
    // Si no hay coincidencia específica, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una respuesta concisa para preguntas sobre ubicaciones
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refineLocationResponse(query, response) {
    // Extraer el lugar
    const match = query.match(/^(donde|dónde)\s+(está|queda|se encuentra|se ubica)\s+(.+?)(\?)?$/i);
    if (!match) return response;
    
    const place = match[3].trim();
    
    // Patrones para ubicaciones
    const locationPatterns = [
      new RegExp(`${place}\\s+(está|se encuentra|se ubica|queda)\\s+en\\s+([^.]+)\\.`, 'i'),
      new RegExp(`${place}\\s+es\\s+(?:una ciudad|un país|una localidad|una región)\\s+(?:ubicada?|situada?)\\s+en\\s+([^.]+)\\.`, 'i'),
      new RegExp(`${place}\\s+está\\s+([^.]+)\\.`, 'i')
    ];
    
    for (const pattern of locationPatterns) {
      const locationMatch = response.match(pattern);
      if (locationMatch) {
        const verb = locationMatch[1] || 'está';
        const location = locationMatch[2] || locationMatch[1];
        return `${place} ${verb} en ${location}.`;
      }
    }
    
    // Si no se encuentra un patrón específico, buscar frases que contengan ubicaciones
    const locationKeywords = ['en', 'entre', 'cerca de', 'dentro de', 'al norte de', 'al sur de', 'al este de', 'al oeste de'];
    
    const sentences = response.split(/\.|\?|\!/);
    for (const sentence of sentences) {
      for (const keyword of locationKeywords) {
        if (sentence.toLowerCase().includes(keyword)) {
          return sentence.trim() + '.';
        }
      }
    }
    
    // Si no hay coincidencia específica, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una respuesta concisa para preguntas sobre capitales
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refineCapitalResponse(query, response) {
    // Extraer el país
    const match = query.match(/capital\s+de\s+(.+?)(\?)?$/i);
    if (!match) return response;
    
    const country = match[1].trim();
    const capital = this.extractCapitalFromResponse(response);
    
    if (capital) {
      return `La capital de ${country} es ${capital}.`;
    }
    
    // Si no se pudo extraer la capital, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una respuesta concisa para preguntas sobre presidentes
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refinePresidentResponse(query, response) {
    // Extraer el país
    const match = query.match(/(presidente|presidenta)\s+de\s+(.+?)(\?)?$/i);
    if (!match) return response;
    
    const country = match[2].trim();
    const president = this.extractPresidentFromResponse(response, country);
    
    if (president) {
      const presidentTitle = match[1].toLowerCase() === 'presidenta' ? 'presidenta' : 'presidente';
      return `El ${presidentTitle} de ${country} es ${president}.`;
    }
    
    // Si no se pudo extraer el presidente, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una respuesta concisa para preguntas sobre población
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refinePopulationResponse(query, response) {
    // Extraer el lugar
    const match = query.match(/población\s+de\s+(.+?)(\?)?$/i);
    if (!match) return response;
    
    const place = match[1].trim();
    
    // Patrones para extraer cifras de población
    const populationPatterns = [
      new RegExp(`(?:población|habitantes)\\s+de\\s+${place}\\s+es\\s+de\\s+([\\d.,]+)\\s+(?:habitantes|personas)`, 'i'),
      new RegExp(`${place}\\s+tiene\\s+(?:una población de|alrededor de)?\\s+([\\d.,]+)\\s+(?:habitantes|personas)`, 'i'),
      new RegExp(`(?:población|habitantes)\\s+(?:es|alcanza)\\s+(?:los|las)?\\s+([\\d.,]+)`, 'i'),
      /(\d{1,3}(?:[.,]\d{3})+|\d+)\s+(?:habitantes|personas)/i
    ];
    
    for (const pattern of populationPatterns) {
      const populationMatch = response.match(pattern);
      if (populationMatch && populationMatch[1]) {
        return `La población de ${place} es de ${populationMatch[1]} habitantes.`;
      }
    }
    
    // Si no se pudo extraer la cifra de población, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Extrae una respuesta concisa para preguntas sobre cantidades
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta refinada
   */
  refineQuantityResponse(query, response) {
    // Buscar números en la respuesta
    const numberPattern = /\b\d+(?:[.,]\d+)*\b/g;
    const numbers = response.match(numberPattern);
    
    if (numbers && numbers.length > 0) {
      // Buscar la oración que contiene el primer número
      const sentences = response.split(/\.|\?|\!/);
      for (const sentence of sentences) {
        if (sentence.match(numberPattern)) {
          return sentence.trim() + '.';
        }
      }
    }
    
    // Si no se pudo extraer una cantidad específica, devolver la primera oración
    return this.truncateToFirstSentence(response);
  },
  
  /**
   * Trunca un texto a la primera oración
   * @param {string} text - Texto a truncar
   * @returns {string} - Primera oración
   */
  truncateToFirstSentence(text) {
    // Buscar puntos seguidos de espacio o final de cadena
    const match = text.match(/^[^.!?]+[.!?]/);
    if (match) {
      return match[0].trim();
    }
    
    // Si no hay puntuación clara, limitar a los primeros 100 caracteres
    if (text.length > 100) {
      return text.substring(0, 97) + '...';
    }
    
    return text;
  },
  
  /**
   * Trunca un texto al contenido más relevante
   * @param {string} text - Texto completo
   * @returns {string} - Contenido relevante
   */
  truncateToRelevantContent(text) {
    // Dividir en oraciones
    const sentences = text.split(/\.|\?|\!/).filter(s => s.trim().length > 0);
    
    // Si hay pocas oraciones, devolver todo
    if (sentences.length <= 2) {
      return text;
    }
    
    // Para respuestas largas, devolver solo las primeras 2-3 oraciones
    const relevantSentences = sentences.slice(0, 3);
    let result = relevantSentences.join('. ').trim();
    if (!result.endsWith('.')) {
      result += '.';
    }
    
    return result;
  }
};

module.exports = KnowledgeResponseService;