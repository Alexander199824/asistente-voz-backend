const axios = require('axios');
const { logger, config } = require('../config');
const cheerio = require('cheerio'); // Asegúrate de instalar esta dependencia: npm install cheerio

/**
 * Servicio para búsquedas en la web
 */
const WebSearchService = {
  /**
   * Realiza una búsqueda web para una consulta
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object>} - Resultado de la búsqueda
   */
  async search(query) {
    try {
      logger.info(`Realizando búsqueda web para: "${query}"`);
      
      // NUEVO: Primero intentar resolver si es una operación matemática
      const calculationResult = this.detectAndSolveCalculation(query);
      if (calculationResult) {
        return calculationResult;
      }
      
      // Marcar el inicio del tiempo para estadísticas
      const startTime = Date.now();
      
      // Array para almacenar resultados de múltiples fuentes
      let results = [];
      let errors = [];
      
      // 1. Intentar con DuckDuckGo (no requiere API key)
      try {
        const duckResult = await this.searchDuckDuckGo(query);
        if (duckResult && duckResult.answer) {
          // Verificar relevancia de la respuesta
          if (this.isRelevantResponse(query, duckResult.answer)) {
            logger.info(`Respuesta relevante encontrada en DuckDuckGo: "${duckResult.answer.substring(0, 100)}..."`);
            results.push({
              answer: duckResult.answer,
              source: 'DuckDuckGo',
              confidence: 0.8,
              context: duckResult.context || null,
              url: duckResult.url || null
            });
          } else {
            logger.warn(`Respuesta de DuckDuckGo descartada por baja relevancia para: "${query}"`);
          }
        }
      } catch (error) {
        logger.warn('Error en búsqueda con DuckDuckGo:', error.message);
        errors.push({ source: 'DuckDuckGo', error: error.message });
      }
      
      // 2. Intentar con Wikipedia en paralelo
      try {
        const wikiResult = await this.searchWikipedia(query);
        if (wikiResult && wikiResult.answer) {
          // Verificar relevancia de la respuesta
          if (this.isRelevantResponse(query, wikiResult.answer)) {
            logger.info(`Respuesta relevante encontrada en Wikipedia: "${wikiResult.answer.substring(0, 100)}..."`);
            results.push({
              answer: wikiResult.answer,
              source: 'Wikipedia',
              confidence: 0.85, // Wikipedia suele ser más confiable
              context: wikiResult.context || null,
              url: wikiResult.url || null
            });
          } else {
            logger.warn(`Respuesta de Wikipedia descartada por baja relevancia para: "${query}"`);
          }
        }
      } catch (error) {
        logger.warn('Error en búsqueda con Wikipedia:', error.message);
        errors.push({ source: 'Wikipedia', error: error.message });
      }
      
      // 3. Si tenemos configurada la API de Bing o Google, intentar también con ella
      if (config.webSearch && config.webSearch.apiKey) {
        try {
          let searchApiResult = null;
          if (config.webSearch.provider === 'bing') {
            searchApiResult = await this.searchBing(query);
          } else if (config.webSearch.provider === 'google') {
            searchApiResult = await this.searchGoogle(query);
          }
          
          if (searchApiResult && searchApiResult.answer) {
            // Verificar relevancia
            if (this.isRelevantResponse(query, searchApiResult.answer)) {
              logger.info(`Respuesta relevante encontrada en ${config.webSearch.provider}: "${searchApiResult.answer.substring(0, 100)}..."`);
              results.push({
                answer: searchApiResult.answer,
                source: config.webSearch.provider,
                confidence: 0.83,
                context: searchApiResult.context || null,
                url: searchApiResult.url || null
              });
            } else {
              logger.warn(`Respuesta de ${config.webSearch.provider} descartada por baja relevancia para: "${query}"`);
            }
          }
        } catch (error) {
          logger.warn(`Error en búsqueda con ${config.webSearch.provider}:`, error.message);
          errors.push({ source: config.webSearch.provider, error: error.message });
        }
      }
      
      // 4. NUEVA CARACTERÍSTICA: Búsqueda web directa como último recurso
      if (results.length === 0 && errors.length > 0) {
        try {
          logger.info('Intentando búsqueda web directa como último recurso');
          const directResult = await this.performDirectWebSearch(query);
          if (directResult && directResult.answer) {
            if (this.isRelevantResponse(query, directResult.answer)) {
              logger.info(`Respuesta encontrada mediante búsqueda directa: "${directResult.answer.substring(0, 100)}..."`);
              results.push({
                answer: directResult.answer,
                source: directResult.source || 'Web',
                confidence: 0.7, // Menor confianza por ser búsqueda directa
                context: directResult.context || null,
                url: directResult.url || null
              });
            }
          }
        } catch (directError) {
          logger.warn('Error en búsqueda web directa:', directError.message);
        }
      }
      
      // Calcular tiempo total de búsqueda
      const searchTime = Date.now() - startTime;
      logger.info(`Búsqueda web completada en ${searchTime}ms. Resultados encontrados: ${results.length}`);
      
      // Si no hay resultados, retornar null
      if (results.length === 0) {
        logger.info('No se encontraron resultados relevantes en ninguna fuente');
        return null;
      }
      
      // Seleccionar el mejor resultado basado en confianza
      results.sort((a, b) => b.confidence - a.confidence);
      const bestResult = results[0];
      
      // Limpiar y mejorar la respuesta final
      bestResult.answer = this.cleanupAnswer(bestResult.answer);
      
      return bestResult;
    } catch (error) {
      logger.error('Error general en búsqueda web:', error);
      // En lugar de propagar el error, devolvemos null
      return null;
    }
  },
  
  /**
   * Verifica si una respuesta es relevante a la consulta
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta a verificar
   * @returns {boolean} - true si la respuesta parece relevante
   */
  isRelevantResponse(query, response) {
    try {
      if (!query || !response) return false;
      
      // Palabras comunes que no aportan valor semántico (stop words)
      const stopwords = [
        'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 
        'de', 'del', 'a', 'al', 'y', 'o', 'que', 'en', 'con', 
        'por', 'para', 'como', 'se', 'su', 'sus', 'mi', 'mis', 
        'tu', 'tus', 'es', 'son', 'fue', 'fueron', 'ser', 'estar',
        'hay', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
        'esos', 'esas', 'aquel', 'aquella', 'desde', 'hasta',
        'cada', 'sobre', 'entre', 'hacia', 'sin', 'contra', 'durante',
        'muy', 'más', 'menos'
      ];
      
      // Normalizar la consulta
      const normalizedQuery = query.toLowerCase()
        .replace(/[.,;:!?¿¡]/g, '') // Eliminar puntuación
        .replace(/\s+/g, ' ')       // Normalizar espacios
        .trim();
      
      // Normalizar la respuesta
      const normalizedResponse = response.toLowerCase();
      
      // Extraer palabras clave (no stopwords, longitud > 2)
      const queryWords = normalizedQuery
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopwords.includes(word));
      
      if (queryWords.length === 0) {
        logger.warn(`No se encontraron palabras clave significativas en la consulta: "${query}"`);
        return false; // No podemos evaluar sin palabras clave
      }
      
      // Evaluación a nivel de palabras clave
      const keywordMatches = queryWords.filter(word => 
        normalizedResponse.includes(word)
      );
      
      const keywordMatchRatio = keywordMatches.length / queryWords.length;
      
      // Evaluación a nivel de frases (buscar secuencias de palabras)
      let phraseMatch = false;
      if (queryWords.length >= 2) {
        // Buscar coincidencias de pares de palabras en secuencia
        for (let i = 0; i < queryWords.length - 1; i++) {
          const phrase = `${queryWords[i]} ${queryWords[i+1]}`;
          if (normalizedResponse.includes(phrase)) {
            phraseMatch = true;
            break;
          }
        }
      }
      
      // Análisis de longitud de la respuesta
      const isTooShort = normalizedResponse.length < 20;
      const isTooGeneric = normalizedResponse.length < 60 && 
                           !normalizedResponse.includes(queryWords[0]) &&
                           keywordMatchRatio < 0.4;
      
      // Reglas para determinar relevancia
      let isRelevant = false;
      
      // Análisis basado en la consulta y la respuesta
      if (phraseMatch) {
        // Si hay coincidencia de frase, darle mayor peso
        isRelevant = keywordMatchRatio >= 0.3 || keywordMatches.length >= 2;
      } else {
        // Sin coincidencia de frase, exigir más coincidencias de palabras clave
        isRelevant = keywordMatchRatio >= 0.5 || keywordMatches.length >= 3;
      }
      
      // Reglas adicionales
      if (isTooShort || isTooGeneric) {
        isRelevant = false; // Descartar respuestas demasiado cortas o genéricas
      }
      
      // Log para diagnóstico
      logger.info(`Evaluación de relevancia para consulta "${query}": 
        - Coincidencia de palabras clave: ${keywordMatchRatio.toFixed(2)} (${keywordMatches.length}/${queryWords.length})
        - Coincidencia de frases: ${phraseMatch ? 'SÍ' : 'NO'}
        - Respuesta demasiado corta: ${isTooShort ? 'SÍ' : 'NO'}
        - Respuesta genérica: ${isTooGeneric ? 'SÍ' : 'NO'}
        - Resultado: ${isRelevant ? 'RELEVANTE' : 'NO RELEVANTE'}`);
      
      return isRelevant;
      
    } catch (error) {
      logger.error('Error al evaluar relevancia de respuesta:', error);
      // En caso de error, asumir que la respuesta no es relevante por seguridad
      return false;
    }
  },
  
  /**
   * Detecta y resuelve operaciones matemáticas básicas
   * @param {string} query - Consulta a analizar
   * @returns {Object|null} - Resultado de la operación o null
   */
  detectAndSolveCalculation(query) {
    try {
      // Patrones para detectar operaciones matemáticas
      const patterns = [
        // Patrones para expresiones directas como "2+2" o "5*3"
        /(\d+\s*[\+\-\*\/]\s*\d+)/,
        // Patrones para preguntas como "cuánto es 2+2" o "cuanto son 5*3"
        /cu[aá]nto\s+(es|son|vale|valen)\s+(.*?(\d+\s*[\+\-\*\/]\s*\d+))/i,
        // Patrón para "sumame 2+2" u otras variaciones
        /(sum[aá]n?[me]e|calcula|resuelve|opera)\s+(.*?(\d+\s*[\+\-\*\/]\s*\d+))/i
      ];
      
      let expressionToEvaluate = null;
      
      // Buscar una expresión matemática que coincida con los patrones
      for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match) {
          // Si encontramos una expresión matemática directa (patrón 1)
          if (match[1] && match[1].match(/\d+\s*[\+\-\*\/]\s*\d+/)) {
            expressionToEvaluate = match[1];
          }
          // Si encontramos una expresión en una pregunta (patrones 2 y 3)
          else if (match[3] && match[3].match(/\d+\s*[\+\-\*\/]\s*\d+/)) {
            expressionToEvaluate = match[3];
          }
          break;
        }
      }
      
      if (expressionToEvaluate) {
        // Limpiar la expresión
        expressionToEvaluate = expressionToEvaluate.replace(/[^\d\+\-\*\/\(\)\.]/g, '');
        
        // Evaluar la expresión
        const result = eval(expressionToEvaluate);
        
        return {
          answer: `El resultado de ${expressionToEvaluate} es ${result}.`,
          source: 'Cálculo matemático',
          context: `Operación: ${expressionToEvaluate}`,
          url: null
        };
      }
      
      return null;
    } catch (error) {
      logger.warn('Error al evaluar expresión matemática:', error);
      return null;
    }
  },
  
  /**
   * Busca en DuckDuckGo Instant Answer API
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object>} - Resultado de la búsqueda
   */
  async searchDuckDuckGo(query) {
    try {
      logger.info(`Consultando API de DuckDuckGo para: "${query}"`);
      
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
          skip_disambig: 1
        },
        timeout: config.webSearch.timeoutMs || 5000
      });
      
      const data = response.data;
      
      // DuckDuckGo tiene varios tipos de respuestas, intentamos extraer la más relevante
      if (data.AbstractText) {
        return {
          answer: data.AbstractText,
          source: 'DuckDuckGo',
          context: data.AbstractSource,
          url: data.AbstractURL
        };
      } else if (data.Answer) {
        return {
          answer: data.Answer,
          source: 'DuckDuckGo',
          context: 'Respuesta directa',
          url: null
        };
      } else if (data.Definition) {
        return {
          answer: data.Definition,
          source: 'DuckDuckGo',
          context: data.DefinitionSource,
          url: null
        };
      } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        // Extraer textos de temas relacionados y combinarlos
        const relatedInfo = data.RelatedTopics
          .slice(0, 3)
          .map(topic => topic.Text)
          .filter(text => text && text.length > 0)
          .join('\n\n');
          
        if (relatedInfo) {
          return {
            answer: relatedInfo,
            source: 'DuckDuckGo',
            context: 'Temas relacionados',
            url: null
          };
        }
      }
      
      logger.info('No se encontraron resultados útiles en DuckDuckGo');
      // No se encontró información útil
      return null;
    } catch (error) {
      logger.error('Error en búsqueda DuckDuckGo:', error);
      // En lugar de lanzar un error, devolvemos null
      return null;
    }
  },
  
  /**
   * Busca en la API de Wikipedia
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object>} - Resultado de la búsqueda
   */
  async searchWikipedia(query) {
    try {
      logger.info(`Consultando API de Wikipedia para: "${query}"`);
      
      // Intentar primero con Wikipedia en español
      const searchResponse = await axios.get('https://es.wikipedia.org/w/api.php', {
        params: {
          action: 'query',
          list: 'search',
          srsearch: query,
          format: 'json',
          utf8: 1,
          srlimit: 5
        },
        timeout: config.webSearch.timeoutMs || 5000
      });
      
      const searchData = searchResponse.data;
      
      if (!searchData.query || !searchData.query.search || searchData.query.search.length === 0) {
        // Si no hay resultados en español, intentar con Wikipedia en inglés
        logger.info('No se encontraron resultados en Wikipedia en español, intentando en inglés');
        const englishSearchResponse = await axios.get('https://en.wikipedia.org/w/api.php', {
          params: {
            action: 'query',
            list: 'search',
            srsearch: query,
            format: 'json',
            utf8: 1,
            srlimit: 5
          },
          timeout: config.webSearch.timeoutMs || 5000
        });
        
        if (!englishSearchResponse.data.query || !englishSearchResponse.data.query.search || 
            englishSearchResponse.data.query.search.length === 0) {
          logger.info('No se encontraron resultados en la búsqueda de Wikipedia');
          return null; // No hay resultados
        }
        
        searchData.query = englishSearchResponse.data.query;
      }
      
      // Obtener resultados
      const searchResults = searchData.query.search;
      
      // Verificar relevancia de los títulos
      const queryWords = query.toLowerCase().split(/\s+/);
      
      // Buscar la mejor coincidencia basada en palabras clave
      let bestMatch = null;
      let highestScore = 0;
      
      for (const result of searchResults) {
        const titleWords = result.title.toLowerCase().split(/\s+/);
        let score = 0;
        
        // Calcular puntaje de coincidencia
        for (const queryWord of queryWords) {
          if (queryWord.length > 3 && titleWords.some(titleWord => titleWord.includes(queryWord))) {
            score += 1;
          }
        }
        
        // Si encontramos una coincidencia con mejor puntaje
        if (score > highestScore) {
          highestScore = score;
          bestMatch = result;
        }
      }
      
      // Si no hay buena coincidencia, usar el primer resultado
      const pageTitle = bestMatch ? bestMatch.title : searchResults[0].title;
      logger.info(`Mejor coincidencia en Wikipedia: "${pageTitle}" (puntaje: ${highestScore})`);
      
      // Decidir qué API de Wikipedia usar basado en dónde encontramos resultados
      const apiBase = searchData.query.search === englishSearchResponse?.data?.query?.search ?
          'https://en.wikipedia.org/w/api.php' : 'https://es.wikipedia.org/w/api.php';
      
      // Obtener el extracto de esa página
      const extractResponse = await axios.get(apiBase, {
        params: {
          action: 'query',
          prop: 'extracts',
          exintro: 1, // Solo introducción
          explaintext: 1, // Texto plano, no HTML
          titles: pageTitle,
          format: 'json',
          utf8: 1
        },
        timeout: config.webSearch.timeoutMs || 5000
      });
      
      const extractData = extractResponse.data;
      const pages = extractData.query.pages;
      const pageId = Object.keys(pages)[0];
      
      if (pageId === '-1' || !pages[pageId].extract) {
        logger.info('No se encontró extracto en la página de Wikipedia');
        return null; // No hay extracto disponible
      }
      
      const extract = pages[pageId].extract;
      
      // Limitar la longitud del extracto
      const maxLength = 500;
      let answer = extract.length > maxLength
        ? extract.substring(0, 500) + '...'
        : extract;
      
      // Construir la URL para la página de Wikipedia
      const wikiLang = apiBase.includes('en.wikipedia') ? 'en' : 'es';
      const wikiUrl = `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`;
      
      return {
        answer,
        source: 'Wikipedia',
        context: pageTitle,
        url: wikiUrl
      };
    } catch (error) {
      logger.error('Error en búsqueda Wikipedia:', error);
      return null;
    }
  },
  
  /**
   * Busca en la API de Bing
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object>} - Resultado de la búsqueda
   */
  async searchBing(query) {
    try {
      if (!config.webSearch || !config.webSearch.apiKey) {
        logger.warn('API Key de Bing no configurada');
        return null;
      }
      
      logger.info(`Consultando API de Bing para: "${query}"`);
      
      const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
        params: {
          q: query,
          count: 5,
          responseFilter: 'Webpages,News',
          mkt: 'es-ES'
        },
        headers: {
          'Ocp-Apim-Subscription-Key': config.webSearch.apiKey
        },
        timeout: config.webSearch.timeoutMs || 5000
      });
      
      const data = response.data;
      
      if (data.webPages && data.webPages.value && data.webPages.value.length > 0) {
        // Obtener el primer resultado
        const firstResult = data.webPages.value[0];
        
        // Si el resultado tiene un snippet, usarlo como respuesta
        if (firstResult.snippet) {
          return {
            answer: firstResult.snippet,
            source: 'Bing',
            context: firstResult.name,
            url: firstResult.url
          };
        }
        
        // Si no hay snippet, intentar extraer contenido de la página
        try {
          const pageContent = await this.extractContentFromUrl(firstResult.url);
          if (pageContent) {
            return {
              answer: pageContent,
              source: 'Bing',
              context: firstResult.name,
              url: firstResult.url
            };
          }
        } catch (extractError) {
          logger.warn(`Error al extraer contenido de ${firstResult.url}:`, extractError.message);
        }
      }
      
      logger.info('No se encontraron resultados útiles en Bing');
      return null;
    } catch (error) {
      logger.error('Error en búsqueda Bing:', error);
      return null;
    }
  },
  
  /**
   * Busca en la API de Google Custom Search
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object>} - Resultado de la búsqueda
   */
  async searchGoogle(query) {
    try {
      if (!config.webSearch || !config.webSearch.apiKey || !config.webSearch.cx) {
        logger.warn('API Key de Google o CX no configurados');
        return null;
      }
      
      logger.info(`Consultando API de Google para: "${query}"`);
      
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: config.webSearch.apiKey,
          cx: config.webSearch.cx,
          q: query,
          num: 5
        },
        timeout: config.webSearch.timeoutMs || 5000
      });
      
      const data = response.data;
      
      if (data.items && data.items.length > 0) {
        // Obtener el primer resultado
        const firstResult = data.items[0];
        
        // Si el resultado tiene un snippet, usarlo como respuesta
        if (firstResult.snippet) {
          return {
            answer: firstResult.snippet,
            source: 'Google',
            context: firstResult.title,
            url: firstResult.link
          };
        }
        
        // Si no hay snippet, intentar extraer contenido de la página
        try {
          const pageContent = await this.extractContentFromUrl(firstResult.link);
          if (pageContent) {
            return {
              answer: pageContent,
              source: 'Google',
              context: firstResult.title,
              url: firstResult.link
            };
          }
        } catch (extractError) {
          logger.warn(`Error al extraer contenido de ${firstResult.link}:`, extractError.message);
        }
      }
      
      logger.info('No se encontraron resultados útiles en Google');
      return null;
    } catch (error) {
      logger.error('Error en búsqueda Google:', error);
      return null;
    }
  },
  
  /**
   * NUEVA FUNCIÓN: Realiza una búsqueda web directa usando axios y cheerio
   * @param {string} query - Consulta a buscar
   * @returns {Promise<Object>} - Resultado de la búsqueda
   */
  async performDirectWebSearch(query) {
    try {
      // Usar un motor de búsqueda público con formato de URL simple
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      logger.info(`Realizando búsqueda web directa en: ${searchUrl}`);
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
        },
        timeout: 8000
      });
      
      // Cargar HTML en cheerio
      const $ = cheerio.load(response.data);
      
      // Extraer resultados de búsqueda
      const results = [];
      
      $('.result').each((i, el) => {
        if (i < 3) { // Limitar a los 3 primeros resultados
          const titleEl = $(el).find('.result__title');
          const snippetEl = $(el).find('.result__snippet');
          const linkEl = $(el).find('.result__url');
          
          const title = titleEl.text().trim();
          const snippet = snippetEl.text().trim();
          const url = linkEl.attr('href') || '';
          
          if (title && snippet) {
            results.push({
              title,
              snippet,
              url
            });
          }
        }
      });
      
      if (results.length === 0) {
        logger.info('No se encontraron resultados en la búsqueda web directa');
        return null;
      }
      
      // Tomar el primer resultado con snippet
      const bestResult = results[0];
      
      // Intentar extraer más contenido de la URL del primer resultado
      let fullContent = bestResult.snippet;
      
      try {
        const extractedContent = await this.extractContentFromUrl(bestResult.url);
        if (extractedContent && extractedContent.length > fullContent.length) {
          fullContent = extractedContent;
        }
      } catch (extractError) {
        logger.warn(`No se pudo extraer contenido adicional de ${bestResult.url}:`, extractError.message);
      }
      
      return {
        answer: fullContent,
        source: 'Búsqueda web',
        context: bestResult.title,
        url: bestResult.url
      };
    } catch (error) {
      logger.error('Error en búsqueda web directa:', error);
      return null;
    }
  },
  
  /**
   * NUEVA FUNCIÓN: Extrae contenido relevante de una URL
   * @param {string} url - URL a extraer
   * @returns {Promise<string>} - Contenido extraído
   */
  async extractContentFromUrl(url) {
    try {
      logger.info(`Extrayendo contenido de: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
        },
        timeout: 5000
      });
      
      // Cargar HTML en cheerio
      const $ = cheerio.load(response.data);
      
      // Remover elementos no deseados
      $('script, style, nav, header, footer, aside, .ads, .comments, .sidebar').remove();
      
      // Extraer contenido principal
      let mainContent = '';
      
      // Intentar extraer de elementos semánticos comunes
      const contentSelectors = [
        'article', 'main', '.content', '.main-content', '.post-content',
        '.article', '.entry-content', '#content', '.body', '.post'
      ];
      
      // Probar cada selector
      for (const selector of contentSelectors) {
        const element = $(selector);
        if (element.length > 0) {
          mainContent = element.text();
          break;
        }
      }
      
      // Si no se encontró contenido en elementos semánticos, buscar párrafos
      if (!mainContent) {
        const paragraphs = $('p');
        if (paragraphs.length > 0) {
          // Tomar solo los primeros párrafos (máximo 5)
          const relevantParagraphs = [];
          paragraphs.each((i, el) => {
            if (i < 5) {
              const text = $(el).text().trim();
              if (text.length > 50) { // Solo párrafos con contenido significativo
                relevantParagraphs.push(text);
              }
            }
          });
          
          mainContent = relevantParagraphs.join('\n\n');
        }
      }
      
      // Si no se pudo extraer texto, intentar con todo el body
      if (!mainContent) {
        mainContent = $('body').text();
      }
      
      // Limpiar y truncar el contenido
      mainContent = this.cleanupText(mainContent);
      
      // Limitar longitud
      const maxLength = 500;
      if (mainContent.length > maxLength) {
        mainContent = mainContent.substring(0, maxLength) + '...';
      }
      
      return mainContent;
    } catch (error) {
      logger.error(`Error al extraer contenido de ${url}:`, error);
      return null;
    }
  },
  
  /**
   * Limpia el texto extraído de páginas web
   * @param {string} text - Texto a limpiar
   * @returns {string} - Texto limpio
   */
  cleanupText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ') // Normalizar espacios
      .replace(/\n\s*\n/g, '\n\n') // Normalizar saltos de línea
      .replace(/\t/g, ' ') // Reemplazar tabulaciones
      .trim();
  },
  
  /**
   * Limpia y mejora la respuesta final
   * @param {string} answer - Respuesta a limpiar
   * @returns {string} - Respuesta mejorada
   */
  cleanupAnswer(answer) {
    if (!answer) return '';
    
    // Limpieza básica
    let cleaned = this.cleanupText(answer);
    
    // Eliminar URLs sueltas
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '');
    
    // Eliminar información redundante o inútil
    const uselessPhrases = [
      'Para obtener más información,',
      'Haga clic aquí para',
      'Visite nuestro sitio web',
      'Lea más en',
      'Más información:',
      'Términos y condiciones'
    ];
    
    for (const phrase of uselessPhrases) {
      cleaned = cleaned.replace(new RegExp(`${phrase}.*?(\\.|\$)`, 'gi'), '.');
    }
    
    // Asegurar finalización adecuada de la respuesta
    if (!cleaned.endsWith('.') && !cleaned.endsWith('?') && !cleaned.endsWith('!')) {
      cleaned += '.';
    }
    
    return cleaned;
  }
};

module.exports = WebSearchService;