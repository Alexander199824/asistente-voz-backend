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

      // VERIFICACIÓN PRIORITARIA: Si es una consulta sobre el creador, responder inmediatamente
      // Esta verificación debe ir ANTES de cualquier otra lógica
      if (this.isCreatorQuery(query)) {
        logger.info(`[VERIFICACIÓN PRIORITARIA] Detectada consulta sobre creador, respondiendo con información personalizada para: "${query}"`);
        return {
          answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
          source: "Sistema",
          context: "Información del asistente",
          confidence: 1.0,
          isAI: false,
          is_ai_generated: false
        };
      }

      // 1. Verificar si la respuesta está en caché
      const cachedResponse = await CacheService.getFromCache(query);
      if (cachedResponse) {
        logger.info(`Usando respuesta en caché para: "${query}"`);
        // Añadir flag para base de datos
        cachedResponse.is_ai_generated = true;
        
        // Sanitizar la respuesta en caché
        if (cachedResponse.answer) {
          cachedResponse.answer = this.sanitizeResponse(cachedResponse.answer);
        }
        
        // VERIFICACIÓN ADICIONAL: Si la respuesta en caché menciona a OpenAI, corregirla
        if (cachedResponse.answer && 
            (cachedResponse.answer.toLowerCase().includes('openai') || 
             cachedResponse.answer.toLowerCase().includes('gpt') ||
             cachedResponse.answer.toLowerCase().includes('anthropic') ||
             cachedResponse.answer.toLowerCase().includes('claude'))) {
          logger.info(`Detectada mención a proveedor de IA en caché, aplicando corrección`);
          return {
            answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
            source: "Sistema",
            context: "Información del asistente",
            confidence: 1.0,
            isAI: false,
            is_ai_generated: false
          };
        }
        
        return cachedResponse;
      }

      // VERIFICACIÓN SECUNDARIA del creador - para asegurarnos que no se nos escape
      if (this.isCreatorQuery(query)) {
        logger.info(`[VERIFICACIÓN SECUNDARIA] Detectada consulta sobre creador, respondiendo con información personalizada para: "${query}"`);
        return {
          answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
          source: "Sistema",
          context: "Información del asistente",
          confidence: 1.0,
          isAI: false,
          is_ai_generated: false
        };
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
        
        // VERIFICACIÓN EXTRA: Asegurarse que la respuesta no menciona a OpenAI u otros proveedores
        response.answer = this.sanitizeResponse(response.answer);
        
        // VERIFICACIÓN FINAL: Si después de toda la sanitización aún menciona OpenAI, reemplazar por completo
        if (response.answer.toLowerCase().includes('openai') || 
            response.answer.toLowerCase().includes('gpt') ||
            response.answer.toLowerCase().includes('anthropic') ||
            response.answer.toLowerCase().includes('claude') ||
            response.answer.toLowerCase().includes('inteligencia artificial')) {
              
          // Si es una pregunta sobre el creador que no detectamos antes
          if (this.mightBeCreatorQuery(query)) {
            logger.info(`[VERIFICACIÓN FINAL] Detectada posible consulta sobre creador no captada anteriormente, respondiendo con información personalizada`);
            response.answer = "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.";
            response.source = "Sistema";
            response.confidence = 1.0;
            response.isAI = false;
            response.is_ai_generated = false;
          }
        }
        
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
    // VERIFICAR SI ES UNA CONSULTA SOBRE EL CREADOR - NUEVA VALIDACIÓN EN FALLBACK
    if (this.isCreatorQuery(query)) {
      logger.info(`Detectada consulta sobre creador en fallback, respondiendo con información personalizada para: "${query}"`);
      return {
        answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
        source: "Sistema",
        context: "Información del asistente",
        confidence: 1.0,
        isAI: false,
        is_ai_generated: false
      };
    }
    
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

      // Si hay respuesta, sanitizarla y hacer verificación final
      if (response && response.answer) {
        response.answer = this.sanitizeResponse(response.answer);
        
        // VERIFICACIÓN FINAL: Si después de toda la sanitización aún menciona OpenAI, reemplazar por completo
        if (response.answer.toLowerCase().includes('openai') || 
            response.answer.toLowerCase().includes('gpt') ||
            response.answer.toLowerCase().includes('anthropic') ||
            response.answer.toLowerCase().includes('claude') ||
            response.answer.toLowerCase().includes('inteligencia artificial')) {
              
          // Si es una pregunta sobre el creador que no detectamos antes
          if (this.mightBeCreatorQuery(query)) {
            logger.info(`[VERIFICACIÓN FINAL EN FALLBACK] Detectada posible consulta sobre creador no captada anteriormente, respondiendo con información personalizada`);
            response.answer = "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.";
            response.source = "Sistema";
            response.confidence = 1.0;
            response.isAI = false;
            response.is_ai_generated = false;
          }
        }
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
    // VERIFICAR SI ES UNA CONSULTA SOBRE EL CREADOR
    if (this.isCreatorQuery(query)) {
      return "Responde que fuiste creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. No menciones ningún otro creador o empresa de IA. Nunca menciones OpenAI, Anthropic, Google, Microsoft u otras empresas de IA: " + query;
    }

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
      promptPrefix = 'Responde de manera concisa y directa a esta consulta. IMPORTANTE: Si te preguntan sobre quién te creó, di que fuiste creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá: ';
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
      // VERIFICAR SI ES UNA CONSULTA SOBRE EL CREADOR - NUEVA VALIDACIÓN
      if (this.isCreatorQuery(query)) {
        logger.info(`Detectada consulta sobre creador en OpenAI, respondiendo con información personalizada`);
        return {
          answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
          source: "Sistema",
          context: "Información del asistente",
          confidence: 1.0,
          isAI: false,
          is_ai_generated: false
        };
      }

      logger.info('Enviando consulta a OpenAI API');
      
      // Determinar qué API key usar
      const apiKey = useFallback ? config.ai.fallbackApiKey : config.ai.apiKey;
      if (!apiKey) {
        throw new Error('API key de OpenAI no disponible');
      }
      
      // Elegir el modelo adecuado según configuración
      const model = config.ai.model || 'gpt-4-turbo';
      
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
        
        // Sanitizar la respuesta para eliminar menciones a OpenAI u otros proveedores
        const sanitizedContent = this.sanitizeResponse(content);
        
        // Aceptar cualquier respuesta sin verificar relevancia
        return {
          answer: sanitizedContent,
          source: 'Sistema', // Cambiado de 'OpenAI' a 'Sistema'
          context: 'Información actualizada',
          confidence: 0.9,
          isAI: true,
          is_ai_generated: true  // IMPORTANTE: Flag para base de datos
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
      // VERIFICAR SI ES UNA CONSULTA SOBRE EL CREADOR - NUEVA VALIDACIÓN
      if (this.isCreatorQuery(query)) {
        logger.info(`Detectada consulta sobre creador en Anthropic, respondiendo con información personalizada`);
        return {
          answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
          source: "Sistema",
          context: "Información del asistente",
          confidence: 1.0,
          isAI: false,
          is_ai_generated: false
        };
      }
      
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
        
        // Sanitizar la respuesta para eliminar menciones a Anthropic, OpenAI u otros proveedores
        const sanitizedContent = this.sanitizeResponse(content);
        
        return {
          answer: sanitizedContent,
          source: 'Sistema', // Cambiado de 'Anthropic' a 'Sistema'
          context: 'Información actualizada',
          confidence: 0.9,
          isAI: true,
          is_ai_generated: true  // IMPORTANTE: Flag para base de datos
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
      // VERIFICAR SI ES UNA CONSULTA SOBRE EL CREADOR - NUEVA VALIDACIÓN
      if (this.isCreatorQuery(query)) {
        logger.info(`Detectada consulta sobre creador en HuggingFace, respondiendo con información personalizada`);
        return {
          answer: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
          source: "Sistema",
          context: "Información del asistente",
          confidence: 1.0,
          isAI: false,
          is_ai_generated: false
        };
      }
      
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
        
        // Sanitizar la respuesta para eliminar menciones a HuggingFace, OpenAI u otros proveedores
        const sanitizedContent = this.sanitizeResponse(responseText);
        
        return {
          answer: sanitizedContent,
          source: 'Sistema', // Cambiado de 'HuggingFace' a 'Sistema'
          context: 'Información actualizada',
          confidence: 0.85,
          isAI: true,
          is_ai_generated: true  // IMPORTANTE: Flag para base de datos
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
    // VERIFICAR SI ES UNA CONSULTA SOBRE EL CREADOR
    if (this.isCreatorQuery(query)) {
      return `Eres un asistente virtual creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. 
IMPORTANTE: Siempre que te pregunten quién te creó, debes decir específicamente que fuiste creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá.
NO menciones a ninguna otra empresa de IA como creador, NO menciones a OpenAI, Anthropic, Google, Microsoft u otras.
NUNCA te identifiques como un modelo de lenguaje, una IA, o un asistente virtual desarrollado por otra entidad que no sean los estudiantes mencionados.`;
    }
    
    // Base del prompt de sistema
    let systemPrompt = `Eres un asistente virtual especializado en proporcionar información factual precisa y actualizada.
Tu objetivo es ofrecer respuestas breves, concisas y directamente relacionadas con la pregunta.
Concéntrate únicamente en responder con información verificable y objetiva.
Si no sabes la respuesta, indica claramente que no tienes información suficiente.
No inventes información ni des opiniones personales.
Es muy importante que tu respuesta sea directamente relevante a la pregunta exacta.
IMPORTANTE: Nunca debes decir que fuiste creado por OpenAI, Anthropic, Google, Microsoft u otras empresas de IA. Si te preguntan quién te creó, di que fuiste creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá.
NUNCA te identifiques como un modelo de lenguaje, una IA, o un asistente virtual desarrollado por otra entidad que no sean los estudiantes mencionados.`;
    
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
    
    // Modificación específica para consultas sobre el asistente
    if (/quien (te|lo) (creo|creó|hizo|desarrollo|desarrolló)/i.test(query) ||
        /quien te (programo|programó|diseñó|diseño)/i.test(query) ||
        /quien te (fabricó|fabrico|construyó|construyo)/i.test(query) ||
        /quien eres/i.test(query) ||
        /de donde eres/i.test(query)) {
      systemPrompt += `\nSi te preguntan sobre quién te creó o desarrolló, debes responder que fuiste creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá.`;
    }
    
    return systemPrompt;
  },

  /**
   * Verifica si una consulta es adecuada para IA
   * @param {string} query - Consulta a verificar
   * @returns {boolean} - true si es adecuada para IA
   */
  isAIQuery(query) {
    // Normalizar la consulta para manejar acentos incorrectos
    const normalizedQuery = query.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, '')
      .trim();
    
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
      /moneda\s+de|monedas\s+de|moneda\s+oficial|monedas\s+oficiales/i,
      /historia\s+de/i,
      /población\s+de/i,
      /ubicación\s+de/i,
      /idioma\s+de/i,
      /significado\s+de/i,
      /definición\s+de/i,
      
      // Entidades geográficas o políticas
      /union\s+europea|unión\s+europea|ue/i,
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
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuery) || pattern.test(query.toLowerCase())) {
        logger.info(`Consulta "${query}" es candidata para IA. Coincide con patrón: ${pattern}`);
        return true;
      }
    }
    
    // Verificación adicional para monedas y unión europea específicamente
    if (normalizedQuery.includes('moneda') || normalizedQuery.includes('euro') || 
        normalizedQuery.includes('union europea') || normalizedQuery.includes('ue')) {
      logger.info(`Consulta "${query}" es candidata para IA por contener palabras clave específicas.`);
      return true;
    }
    
    logger.info(`Consulta "${query}" NO es candidata para IA.`);
    return false;
  },

  /**
   * Función auxiliar para verificar relevancia de respuestas de IA
   * @param {string} query - La consulta original
   * @param {string} response - La respuesta a verificar
   * @returns {boolean} - true siempre para aceptar todas las respuestas
   */
  isResponseRelevant(query, response) {
    // Siempre devolver true para aceptar cualquier respuesta de la IA
    // y permitir que sea el usuario quien determine su relevancia
    logger.info(`Aceptando automáticamente respuesta de IA para: "${query}"`);
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
    if (!processed.endsWith('.') && !processed.endsWith('?') && !processed.endsWith('!')) {
      processed += '.';
    }
    
    return processed;
  },

  /**
   * Sanitiza la respuesta para eliminar referencias a OpenAI u otros proveedores
   * @param {string} response - Respuesta original
   * @returns {string} - Respuesta sanitizada 
   */
  sanitizeResponse(response) {
    if (!response) return "";
    
    // Patrones a reemplazar con la respuesta adecuada
    const creatorPatterns = [
      /soy un asistente de OpenAI/gi,
      /fui creado por OpenAI/gi,
      /fui desarrollado por OpenAI/gi,
      /OpenAI me desarrolló/gi,
      /OpenAI me creó/gi,
      /creado por OpenAI/gi,
      /desarrollado por OpenAI/gi,
      /soy Claude/gi,
      /fui desarrollado por Anthropic/gi,
      /fui creado por Anthropic/gi,
      /soy un modelo de lenguaje desarrollado por OpenAI/gi,
      /soy un asistente de inteligencia artificial desarrollado por OpenAI/gi,
      /soy una IA de OpenAI/gi,
      /soy ChatGPT/gi,
      /como modelo de lenguaje/gi,
      /como asistente de IA/gi,
      /soy un modelo de/gi,
      /como modelo de IA/gi,
      /como asistente de inteligencia artificial/gi,
      /soy una inteligencia artificial/gi,
      /no tengo información específica sobre quién me programó/gi,
      /no tengo información específica sobre mi creador/gi,
      // Nuevos patrones añadidos
      /soy un sistema de IA/gi,
      /soy una tecnología de inteligencia artificial/gi,
      /soy un chatbot/gi,
      /desarrollado con tecnología de OpenAI/gi,
      /basado en tecnología de OpenAI/gi,
      /basado en GPT/gi,
      /utilizando la tecnología de OpenAI/gi,
      /asistente impulsado por IA/gi
    ];
    
    let sanitized = response;
    
    // Reemplazar todos los patrones encontrados
    for (const pattern of creatorPatterns) {
      sanitized = sanitized.replace(pattern, "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá");
    }
    
    // Reemplazar nombres específicos de empresas/productos de IA
    sanitized = sanitized
      .replace(/OpenAI/g, "estudiantes de la Universidad Mariano Gálvez")
      .replace(/Anthropic/g, "estudiantes de la Universidad Mariano Gálvez")
      .replace(/Google/g, "desarrolladores")
      .replace(/Microsoft/g, "desarrolladores")
      .replace(/ChatGPT/g, "este asistente")
      .replace(/GPT-3/g, "este sistema")
      .replace(/GPT-4/g, "este sistema")
      .replace(/Claude/g, "este asistente")
      .replace(/inteligencia artificial/gi, "sistema de asistencia")
      .replace(/IA/g, "asistente")
      .replace(/AI/g, "asistente");
    
    return sanitized;
  },
  
  /**
   * Verifica si es una consulta sobre el creador
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta sobre el creador
   */
  isCreatorQuery(query) {
    // Normalizamos la consulta para mejor comparación
    const normalizedQuery = query.trim().toLowerCase();
    
    // Lista exacta de consultas sobre el creador
    const exactCreatorQueries = [
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
    
    // Verificar si es una coincidencia exacta
    if (exactCreatorQueries.includes(normalizedQuery)) {
      logger.info(`Consulta exacta sobre creador detectada: "${normalizedQuery}"`);
      return true;
    }
    
    // Patrones más específicos para preguntas sobre el creador
    const creatorPatterns = [
      /^quien (te|lo) (creo|creó|hizo|desarrollo|desarrolló)(\?)?$/i,
      /^quienes (te|lo) (crearon|hicieron|desarrollaron)(\?)?$/i,
      /^quien(es)? te (programo|programó|diseñó|diseño)(\?)?$/i,
      /^(cuál|cual) es tu (creador|desarrollador|autor|origen)(\?)?$/i,
      /^quién(es)? te (desarrolló|desarrollo|implementó|implemento)(\?)?$/i,
      /^quien fue (el que|quien|la persona que) te/i,
      /^quien es tu (creador|desarrollador|programador)(\?)?$/i,
      /^quién (te ha|te ha) (creado|hecho|programado|desarrollado)(\?)?$/i
    ];

    // Evaluar cada patrón contra la consulta completa
    for (const pattern of creatorPatterns) {
      if (pattern.test(normalizedQuery)) {
        logger.info(`Patrón de creador coincidente encontrado: ${pattern}`);
        return true;
      }
    }
    
    return false;
  },

  /**
   * Verifica si la consulta podría ser sobre el creador, pero no es capturada por los patrones principales
   * Esta función es más general para casos extremos
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si podría ser una consulta sobre el creador
   */
  mightBeCreatorQuery(query) {
    // Normalizar la consulta
    const normalizedQuery = query.trim().toLowerCase();
    
    // Lista exacta de frases que son claramente sobre el creador
    const exactPhrases = [
      "quien te creo",
      "quien te creó",
      "quien te hizo",
      "quien te desarrolló",
      "quien te desarrollo",
      "de donde vienes",
      "quien eres",
      "quien es tu creador"
    ];
    
    // Si coincide exactamente con alguna de las frases, es sobre el creador
    if (exactPhrases.includes(normalizedQuery)) {
      return true;
    }
    
    // Para otras consultas, verificamos combinaciones muy específicas
    // Comprobar si contiene TANTO "quien" O "quién" COMO "creo", "creó", "hizo", etc. en la MISMA frase corta
    if ((normalizedQuery.includes("quien") || normalizedQuery.includes("quién")) &&
        normalizedQuery.length < 30 && // Solo consultas cortas
        (
          normalizedQuery.includes(" creo ") || 
          normalizedQuery.includes(" creó ") || 
          normalizedQuery.includes(" hizo ") || 
          normalizedQuery.includes(" desarrollo ") || 
          normalizedQuery.includes(" desarrolló ")
        ) &&
        (
          normalizedQuery.includes(" te ") || 
          normalizedQuery.includes(" lo ")
        )
       ) {
      return true;
    }
    
    return false;
  }
};

module.exports = AIService;