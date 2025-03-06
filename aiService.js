const axios = require('axios');
const { logger, config } = require('../config');
const CacheService = require('./cacheService');

/**
 * Servicio para integración con APIs de IA
 */
const AIService = {
  // Contador para distribución de carga entre modelos
  requestCounter: 0,
  
  /**
   * Obtiene respuesta de IA para consultas factuales
   * @param {string} query - Consulta del usuario
   * @returns {Promise<Object|null>} - Respuesta de la IA o null
   */
  async getAIResponse(query) {
    try {
      logger.info(`Procesando consulta de IA para: "${query}"`);

      // 1. Verificar si la respuesta está en caché
      const cachedResponse = await CacheService.getFromCache(query);
      if (cachedResponse) {
        logger.info(`Usando respuesta en caché para: "${query}"`);
        return cachedResponse;
      }

      // 2. Verificar si está configurada la API key principal
      if (!config.ai || !config.ai.apiKey) {
        logger.warn('API key de IA principal no configurada');
        return this.tryFallbackProviders(query);
      }

      // 3. Verificar si el proveedor está configurado
      if (!config.ai.provider) {
        logger.warn('Proveedor de IA no configurado');
        return this.tryFallbackProviders(query);
      }

      // 4. Optimizar el prompt basado en el tipo de consulta
      const optimizedQuery = this.optimizePrompt(query);
      logger.info(`Consulta optimizada: "${optimizedQuery}"`);

      // 5. Gestión de cuota y límites de uso
      if (!this.checkQuotaAndLimits()) {
        logger.warn('Límite de cuota alcanzado, usando proveedor alternativo');
        return this.tryFallbackProviders(query);
      }

      // 6. Obtener respuesta del proveedor seleccionado
      let response = null;
      let attemptCount = 0;
      const maxAttempts = 2;
      const providers = this.getProvidersSequence();

      // Intentar con diferentes proveedores si hay errores
      while (attemptCount < maxAttempts && response === null) {
        const providerIndex = attemptCount % providers.length;
        const currentProvider = providers[providerIndex];

        try {
          logger.info(`Intentando con proveedor: ${currentProvider}, intento #${attemptCount + 1}`);
          
          switch(currentProvider) {
            case 'openai':
              response = await this.queryOpenAI(optimizedQuery);
              break;
            case 'anthropic':
              response = await this.queryAnthropic(optimizedQuery);
              break;
            case 'huggingface':
              response = await this.queryHuggingFace(optimizedQuery);
              break;
            default:
              logger.warn(`Proveedor de IA desconocido: ${currentProvider}`);
              break;
          }
        } catch (providerError) {
          logger.error(`Error en proveedor de IA (${currentProvider}):`, providerError);
          attemptCount++;
        }
      }

      // 7. Procesar respuesta antes de devolverla
      if (response && response.answer) {
        // Post-procesar respuesta
        response.answer = this.postProcessResponse(response.answer, query);
        
        // Guardar en caché
        await CacheService.saveToCache(query, response.answer, response.source || config.ai.provider);
        
        // Incrementar contador para distribución de carga
        this.requestCounter++;
        
        return response;
      }

      // 8. Si todos los intentos fallan, intentar con los proveedores alternativos
      return await this.tryFallbackProviders(query);
    } catch (error) {
      logger.error('Error al obtener respuesta de IA:', error);
      return null;
    }
  },

  /**
   * Intenta obtener respuesta de proveedores alternativos
   * @param {string} query - Consulta del usuario
   * @returns {Promise<Object|null>} - Respuesta o null
   */
  async tryFallbackProviders(query) {
    if (!config.ai || !config.ai.fallbackProvider) {
      return null;
    }
    
    try {
      logger.info(`Intentando con proveedor de respaldo: ${config.ai.fallbackProvider}`);
      
      let response = null;
      switch(config.ai.fallbackProvider) {
        case 'huggingface':
          if (config.ai.fallbackApiKey) {
            response = await this.queryHuggingFace(query, true);
          }
          break;
        case 'anthropic':
          if (config.ai.fallbackApiKey) {
            response = await this.queryAnthropic(query, true);
          }
          break;
        case 'openai':
          if (config.ai.fallbackApiKey) {
            response = await this.queryOpenAI(query, true);
          }
          break;
        default:
          return null;
      }
      
      return response;
    } catch (error) {
      logger.error(`Error en proveedor de respaldo:`, error);
      return null;
    }
  },

  /**
   * Optimiza el prompt según el tipo de consulta
   * @param {string} query - Consulta original
   * @returns {string} - Prompt optimizado
   */
  optimizePrompt(query) {
    // Detectar el tipo de consulta para optimizar el prompt
    let promptPrefix = '';
    
    // Consultas sobre definiciones
    if (/^qu[eé]\s+(es|son|significa)/i.test(query)) {
      promptPrefix = 'Define brevemente y con precisión: ';
    }
    // Consultas sobre personas
    else if (/^qui[eé]n\s+(es|fue|era)/i.test(query)) {
      promptPrefix = 'Proporciona información breve y precisa sobre esta persona: ';
    }
    // Consultas sobre lugares
    else if (/^d[oó]nde\s+(est[aá]|queda|se encuentra)/i.test(query)) {
      promptPrefix = 'Describe brevemente la ubicación de: ';
    }
    // Consultas sobre fechas
    else if (/^cu[aá]ndo\s+(es|fue|ocurri[oó])/i.test(query)) {
      promptPrefix = 'Indica la fecha o periodo exacto de: ';
    }
    // Consultas sobre cantidades o medidas
    else if (/^cu[aá]nto[s]?|^cu[aá]nta[s]?/i.test(query)) {
      promptPrefix = 'Proporciona el valor numérico exacto para: ';
    }
    // Por defecto para consultas generales
    else {
      promptPrefix = 'Responde de manera concisa y directa a esta consulta: ';
    }
    
    return promptPrefix + query;
  },

  /**
   * Verifica límites de cuota de API
   * @returns {boolean} - true si está dentro de los límites
   */
  checkQuotaAndLimits() {
    // Implementación simplificada - en un entorno real, esto verificaría
    // la base de datos para controlar uso diario/mensual
    
    // Verificar si la gestión de cuota está habilitada
    if (!config.ai.quotaManager || !config.ai.quotaManager.enabled) {
      return true; // No hay restricciones
    }
    
    // Simulamos verificar si estamos dentro del límite
    // En un sistema real, esto consultaría una base de datos
    const withinQuota = true; // Cambiar a lógica real
    
    return withinQuota;
  },

  /**
   * Devuelve la secuencia de proveedores a intentar
   * @returns {Array<string>} - Lista de proveedores en orden de prioridad
   */
  getProvidersSequence() {
    // Orden predeterminado
    const defaultOrder = [config.ai.provider];
    
    // Si hay un proveedor de respaldo, añadirlo a la lista
    if (config.ai.fallbackProvider && config.ai.fallbackProvider !== config.ai.provider) {
      defaultOrder.push(config.ai.fallbackProvider);
    }
    
    // Añadir el resto de proveedores conocidos no incluidos ya
    const allProviders = ['openai', 'anthropic', 'huggingface'];
    allProviders.forEach(provider => {
      if (!defaultOrder.includes(provider)) {
        defaultOrder.push(provider);
      }
    });
    
    return defaultOrder;
  },

  /**
   * Consulta a la API de OpenAI
   * @param {string} query - Consulta del usuario
   * @param {boolean} useFallback - Si debe usar API key de fallback
   * @returns {Promise<Object|null>} - Respuesta de OpenAI o null
   */
  async queryOpenAI(query, useFallback = false) {
    try {
      logger.info('Enviando consulta a OpenAI API');
      
      // Determinar qué API key usar
      const apiKey = useFallback ? config.ai.fallbackApiKey : config.ai.apiKey;
      if (!apiKey) {
        throw new Error('API key de OpenAI no disponible');
      }
      
      // Elegir el modelo adecuado según configuración
      const model = config.ai.model || 'gpt-4o-mini';
      
      // Construir sistema de prompt según tipo de consulta
      const systemPrompt = this.buildSystemPrompt(query);
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: model,
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: query
            }
          ],
          temperature: 0.1,  // Reducir para información factual precisa
          max_tokens: 150    // Respuestas concisas
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: config.ai.timeoutMs || 5000
        }
      );

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const content = response.data.choices[0].message.content.trim();
        logger.info(`Respuesta recibida de OpenAI: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
        
        // Siempre aceptar respuestas de OpenAI, sin validación de relevancia
        return {
          answer: content,
          source: 'OpenAI',
          context: 'Información actualizada',
          confidence: 0.9,
          isAI: true
        };
      }

      logger.warn('No se obtuvo una respuesta válida de OpenAI');
      return null;
    } catch (error) {
      logger.error('Error en consulta a OpenAI:', error.message);
      
      // Loguear detalles específicos de error de API
      if (error.response && error.response.data) {
        logger.error('Detalles de error de OpenAI API:', error.response.data);
      }
      
      throw error; // Propagar el error para manejo en getAIResponse
    }
  },

  /**
   * Consulta a la API de Anthropic
   * @param {string} query - Consulta del usuario
   * @param {boolean} useFallback - Si debe usar API key de fallback
   * @returns {Promise<Object|null>} - Respuesta de Anthropic o null
   */
  async queryAnthropic(query, useFallback = false) {
    try {
      logger.info('Enviando consulta a Anthropic API');
      
      // Determinar qué API key usar
      const apiKey = useFallback ? config.ai.fallbackApiKey : config.ai.apiKey;
      if (!apiKey) {
        throw new Error('API key de Anthropic no disponible');
      }
      
      // Elegir el modelo adecuado
      const model = config.ai.model || 'claude-3-haiku-20240307';
      
      // Construir el sistema de prompt
      const systemPrompt = this.buildSystemPrompt(query);
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: model,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 150,
          temperature: 0.2
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: config.ai.timeoutMs || 5000
        }
      );

      if (response.data && response.data.content) {
        const content = response.data.content[0].text;
        logger.info(`Respuesta recibida de Anthropic: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
        
        return {
          answer: content,
          source: 'Anthropic',
          context: 'Información actualizada',
          confidence: 0.9,
          isAI: true
        };
      }

      logger.warn('No se obtuvo una respuesta válida de Anthropic');
      return null;
    } catch (error) {
      logger.error('Error en consulta a Anthropic:', error.message);
      
      // Loguear detalles específicos de error de API
      if (error.response && error.response.data) {
        logger.error('Detalles de error de Anthropic API:', error.response.data);
      }
      
      throw error; // Propagar el error para manejo en getAIResponse
    }
  },

  /**
   * Consulta a la API de HuggingFace
   * @param {string} query - Consulta del usuario
   * @param {boolean} useFallback - Si debe usar API key de fallback
   * @returns {Promise<Object|null>} - Respuesta de HuggingFace o null
   */
  async queryHuggingFace(query, useFallback = false) {
    try {
      logger.info('Enviando consulta a HuggingFace API');
      
      // Determinar qué API key usar
      const apiKey = useFallback ? config.ai.fallbackApiKey : config.ai.apiKey;
      if (!apiKey) {
        throw new Error('API key de HuggingFace no disponible');
      }
      
      // Elegir el modelo adecuado según configuración
      const model = config.ai.model || 'mistralai/Mixtral-8x7B-Instruct-v0.1';
      
      // Crear el formato de prompt según el modelo
      const formattedQuery = `<s>[INST] ${query} [/INST]`;
      
      const response = await axios.post(
        `https://api-inference.huggingface.co/models/${model}`,
        {
          inputs: formattedQuery,
          parameters: {
            max_new_tokens: 150,
            temperature: 0.3,
            top_p: 0.9,
            do_sample: true
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: config.ai.timeoutMs || 8000 // HuggingFace puede ser más lento
        }
      );

      if (response.data && response.data[0] && response.data[0].generated_text) {
        // Extraer solo la respuesta (después de [/INST])
        const fullText = response.data[0].generated_text;
        const responseText = fullText.split('[/INST]').pop().trim();
        
        logger.info(`Respuesta recibida de HuggingFace: "${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}"`);
        
        return {
          answer: responseText,
          source: 'HuggingFace',
          context: 'Información actualizada',
          confidence: 0.85,
          isAI: true
        };
      }

      logger.warn('No se obtuvo una respuesta válida de HuggingFace');
      return null;
    } catch (error) {
      logger.error('Error en consulta a HuggingFace:', error.message);
      
      // Loguear detalles específicos de error de API
      if (error.response && error.response.data) {
        logger.error('Detalles de error de HuggingFace API:', error.response.data);
      }
      
      throw error; // Propagar el error para manejo en getAIResponse
    }
  },

  /**
   * Construye el prompt de sistema según el tipo de consulta
   * @param {string} query - Consulta del usuario
   * @returns {string} - Prompt de sistema
   */
  buildSystemPrompt(query) {
    // Base del prompt de sistema
    let systemPrompt = `Eres un asistente virtual especializado en proporcionar información factual precisa y actualizada.
Tu objetivo es ofrecer respuestas breves, concisas y directamente relacionadas con la pregunta.
Concéntrate únicamente en responder con información verificable y objetiva.
Si no sabes la respuesta, indica claramente que no tienes información suficiente.
No inventes información ni des opiniones personales.
Es muy importante que tu respuesta sea directamente relevante a la pregunta exacta.`;
    
    // Adaptar según tipo de consulta
    if (/^qu[eé]\s+(es|son|significa)/i.test(query)) {
      systemPrompt += `\nEstás respondiendo a una pregunta sobre definiciones. Define el concepto de manera clara y concisa.`;
    } else if (/^qui[eé]n\s+(es|fue|era)/i.test(query)) {
      systemPrompt += `\nEstás respondiendo a una pregunta sobre una persona. Proporciona datos clave: quién es/fue, por qué es conocido/a y fechas relevantes si aplica.`;
    } else if (/^d[oó]nde\s+(est[aá]|queda|se encuentra)/i.test(query)) {
      systemPrompt += `\nEstás respondiendo a una pregunta sobre ubicaciones. Proporciona información geográfica precisa y concisa.`;
    } else if (/capital\s+de|presidente\s+de|población\s+de/i.test(query)) {
      systemPrompt += `\nEstás respondiendo a una pregunta factual directa. Da solo la información específica solicitada, sin agregar contexto innecesario.`;
    }
    
    return systemPrompt;
  },

  /**
   * Verifica si una consulta es adecuada para IA
   * @param {string} query - Consulta a verificar
   * @returns {boolean} - true si es adecuada para IA
   */
  isAIQuery(query) {
    // Patrones mejorados para preguntas que deben usar IA
    const patterns = [
      // Preguntas de conocimiento general
      /quien|quienes|quién|quiénes/i,
      /cual|cuales|cuál|cuáles/i,
      /que|qué/i,
      /como|cómo/i,
      /donde|dónde/i,
      /cuando|cuándo/i,
      /cuantos|cuántos/i,
      /por que|por qué/i,
      
      // Tipos de conocimiento específico
      /capital\s+de/i,
      /presidente\s+de/i,
      /moneda\s+de/i,
      /historia\s+de/i,
      /población\s+de/i,
      /ubicación\s+de/i,
      /idioma\s+de/i,
      /significado\s+de/i,
      /definición\s+de/i,
      
      // Entidades geográficas o políticas
      /pais|país|paises|países/i,
      /ciudad|ciudades/i,
      /continente/i,
      /región|region|regiones/i,
      /estado|estados/i,
      /provincia/i,
      
      // Temas culturales o educativos
      /libro|libros|autor|autores/i,
      /película|pelicula|peliculas|películas/i,
      /descubrimiento|invento|inventor/i,
      /teoría|teoria|científico|cientifico/i
    ];

    // Comprobar si la consulta coincide con algún patrón
    const isCandidate = patterns.some(pattern => pattern.test(query.toLowerCase()));
    
    logger.info(`Verificando si la consulta es candidata para IA: "${query}" => ${isCandidate}`);
    return isCandidate;
  },

  /**
   * Función auxiliar para verificar relevancia de respuestas de IA
   * @param {string} query - La consulta original
   * @param {string} response - La respuesta a verificar
   * @returns {boolean} - true si la respuesta es relevante
   */
  isResponseRelevant(query, response) {
    // Siempre devolver true para todas las respuestas de IA
    return true;
  },

  /**
   * Determina si una respuesta parece actualizada basada en el texto
   * @param {string} response - Texto de respuesta
   * @returns {boolean} - true si parece desactualizada
   */
  isPotentiallyOutdated(response) {
    const outdatedPatterns = [
      /hasta\s+(?:20[0-1][0-9]|202[0-3])/i,  // Referencias a años pasados hasta 2023
      /en\s+(?:20[0-1][0-9]|202[0-3])/i,
      /actualmente\s+en\s+(?:20[0-1][0-9]|202[0-3])/i,
      /el\s+actual\s+presidente/i,           // Frases genéricas sobre actualidad
      /recientemente/i,
      /según\s+datos\s+(?:de|del)\s+(?:20[0-1][0-9]|202[0-3])/i
    ];

    const isOutdated = outdatedPatterns.some(pattern => pattern.test(response));
    if (isOutdated) {
      logger.info(`Respuesta potencialmente desactualizada detectada: "${response.substring(0, 100)}..."`);
    }
    return isOutdated;
  },
  
  /**
   * Post-procesa la respuesta de la IA
   * @param {string} response - Respuesta original de la IA
   * @param {string} query - Consulta original
   * @returns {string} - Respuesta procesada
   */
  postProcessResponse(response, query) {
    if (!response) return "";
    
    // 1. Eliminar prefijos comunes de IA
    let processed = response
      .replace(/^(lo siento, pero |según mi conocimiento, |basado en la información disponible, |te puedo decir que )/i, '')
      .replace(/^(debo señalar que |como asistente, puedo informarte que |la respuesta es(?: que)? )/i, '');
    
    // 2. Convertir listas en texto fluido para respuestas cortas
    if (processed.split('\n').length <= 3) {
      processed = processed.replace(/^[-*•]\s+/gm, '');
    }
    
    // 3. Eliminar frases de incertidumbre si la respuesta parece segura
    if (!processed.includes('no estoy seguro') && !processed.includes('podría ser')) {
      processed = processed
        .replace(/(?:creo que|considero que|pienso que|me parece que) /i, '')
        .replace(/ (?:si no me equivoco|si mal no recuerdo)\.?/i, '.');
    }
    
    // 4. Asegurar primera letra mayúscula y punto final
    processed = processed.charAt(0).toUpperCase() + processed.slice(1);
    if (!processed.endsWith('.') && !processed.endsWith('!') && !processed.endsWith('?')) {
      processed += '.';
    }
    
    return processed;
  }
};

module.exports = AIService;