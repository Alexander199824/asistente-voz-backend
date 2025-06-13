const KnowledgeModel = require('../models/knowledgeModel');
const ConversationModel = require('../models/conversationModel');
const { logger, config } = require('../config');
const webSearchService = require('./webSearchService');
const programmingService = require('../services/programmingService');
const greetingService = require('../services/greetingService');
const knowledgeResponseService = require('../services/knowledgeResponseService');
const factualKnowledgeService = require('../services/factualKnowledgeService');
const systemInfoService = require('../services/systemInfoService');
const AIService = require('./aiService');
const db = require('../config/database');

/**
 * Servicio principal del asistente de voz
 */
const AssistantService = {
  /**
   * Detecta la intención del usuario en una consulta
   * @param {string} query - Consulta normalizada
   * @returns {Object} - Información sobre la intención detectada
   */
  detectUserIntent(query) {
    // Normalizar para análisis
    const normalizedQuery = query.toLowerCase().trim();
    
    // Posibles intenciones
    const intents = {
      // Intención de aprendizaje (enseñarle algo al sistema)
      learning: {
        patterns: [
          /(?:aprende|aprender|enseña|enseñar|memoriza|memorizar|guarda|guardar|recuerda|recordar)/i,
          /(?:quiero|necesito|me gustaría|quisiera) que (?:aprendas|sepas|recuerdes|guardes|memorices)/i,
          /(?:debes|deberías|podrías|puedes) (?:aprender|saber|recordar|guardar|memorizar)/i,
          /(?:significa|se define como|es igual a|se refiere a|es básicamente)/i,
          /^no,? .+ (?:es|significa|equivale a|se refiere a) .+$/i,
          /^incorrecto,? .+ (?:es|significa|equivale a|se refiere a) .+$/i,
          /^te equivocas,? .+ (?:es|significa|equivale a|se refiere a) .+$/i,
          /^la definición de .+ es .+$/i,
          /^(.+): (.+)$/i,
          /^cuando (?:te pregunten|pregunte|alguien pregunte) (?:sobre|acerca de|por) (.+), (?:di|responde|contesta) (.+)$/i
        ],
        confidence: 0,
        details: null
      },
      
      // Intención de pregunta (solicitar información)
      question: {
        patterns: [
          /^(?:qué|que|cuál|cual|quién|quien|cómo|como|dónde|donde|cuándo|cuando|cuánto|cuanto|por qué|por que|para qué|para que)/i,
          /^(?:sabes|conoces|me puedes decir|puedes decirme|dime|explícame|explica|cuéntame|cuenta)/i,
          /^(?:qué|que) (?:es|son|significa|significan) /i,
          /^(?:quién|quien) (?:es|fue|son|fueron) /i,
          /^(?:cómo|como) (?:se|se puede|puedo|funciona|hacer|se hace) /i,
          /\?$/
        ],
        confidence: 0,
        details: null
      },
      
      // Intención de corrección (corregir al sistema)
      correction: {
        patterns: [
          /^(?:no|incorrecto|falso|equivocado|error|erróneo|te equivocas|eso no es cierto|eso es falso)/i,
          /^(?:en realidad|de hecho|realmente) (?:no|es incorrecto)/i,
          /^(?:la respuesta correcta|lo correcto|lo verdadero) (?:es|sería|debería ser)/i,
          /^(?:deberías|debes) (?:saber|aprender|recordar|memorizar) que/i
        ],
        confidence: 0,
        details: null
      },
      
      // Intención de saludo/despedida
      greeting: {
        patterns: [
          /^(?:hola|saludos|buenos días|buenas tardes|buenas noches|buen día|hey|hi|hello)/i,
          /^(?:adiós|adios|chao|hasta luego|nos vemos|bye|goodbye|hasta pronto|hasta mañana)/i
        ],
        confidence: 0,
        details: null
      }
    };
    
    // Evaluar cada intención
    for (const [intentName, intent] of Object.entries(intents)) {
      // Revisar coincidencia con cada patrón
      for (const pattern of intent.patterns) {
        if (pattern.test(normalizedQuery)) {
          // Incrementar la confianza por cada patrón que coincide
          intent.confidence += 0.25;
          
          // Capturar detalles específicos si hay grupos de captura
          const match = normalizedQuery.match(pattern);
          if (match && match.length > 1) {
            intent.details = match.slice(1).filter(Boolean);
          }
        }
      }
      
      // Limitar la confianza a un máximo de 1.0
      intent.confidence = Math.min(intent.confidence, 1.0);
    }
    
    // Determinar la intención principal
    let primaryIntent = null;
    let highestConfidence = 0;
    
    for (const [intentName, intent] of Object.entries(intents)) {
      if (intent.confidence > highestConfidence) {
        highestConfidence = intent.confidence;
        primaryIntent = {
          name: intentName,
          confidence: intent.confidence,
          details: intent.details
        };
      }
    }
    
    // Si no hay intención clara, asumir pregunta
    if (!primaryIntent || primaryIntent.confidence < 0.25) {
      primaryIntent = {
        name: 'question',
        confidence: 0.5,
        details: null
      };
    }
    
    logger.info(`Intención detectada: ${primaryIntent.name} (confianza: ${primaryIntent.confidence.toFixed(2)})`);
    return primaryIntent;
  },
  



 



/**
 * MÉTODO COMPLETO CON MEJORAS - Reemplazar en AssistantService en src/services/assistantService.js
 * Procesa una consulta del usuario y devuelve una respuesta
 * @param {string} query - Consulta del usuario
 * @param {string} userId - ID del usuario (opcional)
 * @param {Object} options - Opciones adicionales (confirmar búsqueda/actualización)
 * @returns {Promise<Object>} - Objeto con la respuesta y metadatos
 */
async processQuery(query, userId = null, options = {}) {
  try {
    // 1. Normalizar la consulta (ahora incluye corrección ortográfica)
    const normalizedQuery = this.normalizeQuery(query);
    
    // Iniciar el logging detallado de la consulta
    logger.info(`Procesando consulta: "${normalizedQuery}" (usuario: ${userId || 'anónimo'})`);
    
    // Si la consulta está vacía, retornar mensaje adecuado
    if (!normalizedQuery) {
      return {
        response: "Lo siento, no pude entender tu consulta. ¿Puedes intentar de nuevo?",
        source: "system",
        confidence: 1.0
      };
    }

    // Verificar si es una respuesta a una pregunta anterior sobre buscar en la web
    if (options.awaitingWebSearchConfirmation) {
      logger.info(`Procesando confirmación de búsqueda web para: "${options.originalQuery}"`);
      logger.info(`Valor de isConfirmed: ${options.isConfirmed}, tipo: ${typeof options.isConfirmed}`);
      
      // Hacer más robusta la verificación de confirmación
      if (options.isConfirmed === true || 
          options.isConfirmed === 'true' || 
          options.isConfirmed === 1 ||
          options.isConfirmed === '1') {
        
        logger.info(`Usuario confirmó búsqueda web para: "${options.originalQuery}"`);
        
        // Ejecutar búsqueda web + IA
        return await this.executeWebAndAISearch(options.originalQuery, userId);
      } 
      // También verificar si la respuesta del usuario contiene palabras de confirmación
      else if (typeof normalizedQuery === 'string' && 
              (normalizedQuery.match(/^s[ií]/i) || 
               normalizedQuery.match(/^yes/i) ||
               normalizedQuery.includes('busca') || 
               normalizedQuery.includes('buscar') ||
               normalizedQuery.includes('claro') ||
               normalizedQuery.includes('adelante') ||
               normalizedQuery.includes('por favor'))) {
        
        logger.info(`Usuario confirmó búsqueda web a través de texto: "${normalizedQuery}"`);
        return await this.executeWebAndAISearch(options.originalQuery, userId);
      } 
      else {
        logger.info(`Usuario rechazó búsqueda web para: "${options.originalQuery}"`);
        
        return {
          response: "De acuerdo, no buscaré en fuentes externas. Si deseas enseñarme sobre este tema, puedes usar formatos súper fáciles como 'París es la capital de Francia' o 'Recuerda: [tu información]'.",
          source: "system",
          confidence: 1.0
        };
      }
    }
          
    // Verificar si es una respuesta a una pregunta anterior sobre actualizar información
    if (options.awaitingUpdateConfirmation && 
        (normalizedQuery.match(/^s[ií]/i) || normalizedQuery.match(/^yes/i) || 
         normalizedQuery.includes('actual') || normalizedQuery.includes('updat'))) {
      
      logger.info(`Usuario confirmó actualización para: "${options.originalQuery}"`);
      
      // Ejecutar actualización con IA
      return await this.executeKnowledgeUpdate(options.knowledgeId, options.originalQuery, userId);
    }
    
    // Verificar si es una respuesta negativa a actualizar información
    if (options.awaitingUpdateConfirmation && 
        (normalizedQuery.match(/^no/i) || normalizedQuery.includes('no actualices'))) {
      
      return {
        response: "De acuerdo, mantendré la información actual sin actualizarla.",
        source: "system",
        confidence: 1.0
      };
    }

    // NUEVO: Detectar la intención del usuario
    const userIntent = this.detectUserIntent(normalizedQuery);

    // Procesar según la intención detectada
    if (userIntent.name === 'learning' && userIntent.confidence >= 0.5) {
      logger.info(`Detectada intención de aprendizaje con alta confianza (${userIntent.confidence.toFixed(2)})`);
      return await this.handleLearningCommand(normalizedQuery, userId);
    }

    if (userIntent.name === 'greeting' && userIntent.confidence >= 0.5) {
      logger.info(`Detectado saludo/despedida con alta confianza (${userIntent.confidence.toFixed(2)})`);
      const greetingResponse = greetingService.getGreetingResponse(normalizedQuery);
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: greetingResponse.response,
        confidence: greetingResponse.confidence
      });
      
      return greetingResponse;
    }

    if (userIntent.name === 'correction' && userIntent.confidence >= 0.6) {
      logger.info(`Detectada corrección con alta confianza (${userIntent.confidence.toFixed(2)})`);
      // Intentar extraer un formato de aprendizaje de la corrección
      const correctionText = normalizedQuery.replace(/^(no|incorrecto|falso|te equivocas)[,.]?\s+/i, '');
      return await this.handleLearningCommand(correctionText, userId);
    }
    
    // BLOQUEO PRIORITARIO: Detección y manejo de consultas sobre el creador
    // Esta verificación debe ejecutarse antes que cualquier otra
    const exactCreatorQueries = [
      "quien eres", 
      "quien te creo", 
      "quien te creó", 
      "quien te hizo", 
      "quien te desarrollo", 
      "quien te desarrolló",
      "quien es tu creador",
      "de donde vienes"
    ];

    if (exactCreatorQueries.includes(normalizedQuery)) {
      logger.info(`[BLOQUEO PRIORITARIO] Detectada consulta exacta sobre creador: "${normalizedQuery}"`);
      const creatorResponse = {
        response: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Ellos me desarrollaron como un asistente virtual capaz de responder preguntas y aprender de las interacciones con los usuarios.",
        source: "system_info",
        confidence: 1.0
      };
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: creatorResponse.response,
        confidence: creatorResponse.confidence
      });
      
      return creatorResponse;
    }
    
    // 2. Detectar si es un comando de aprendizaje (MEJORADO)
    if (this.isLearningCommand(normalizedQuery)) {
      logger.info(`Detectado comando de aprendizaje: "${normalizedQuery}"`);
      return await this.handleLearningCommand(normalizedQuery, userId);
    }
    
    // NUEVO: Detección inteligente de aprendizaje para consultas ambiguas
    if (!this.isGreeting(normalizedQuery)) {
      // Verificar si podría ser un intento de aprendizaje mal formateado
      const mightBeLearning = this.detectPotentialLearning(normalizedQuery);
      
      if (mightBeLearning.isLikely) {
        logger.info(`Posible intento de aprendizaje detectado: "${normalizedQuery}"`);
        
        // Ofrecer ayuda para reformular
        const helpResponse = `Me parece que quieres enseñarme algo, pero no estoy seguro del formato. 

¿Quisiste decir algo como esto?
• "${mightBeLearning.suggestion}"
• O simplemente: "${mightBeLearning.simpleSuggestion}"

También puedes usar formatos súper fáciles como:
• "París es la capital de Francia"
• "Recuerda: mi cumpleaños es el 15 de mayo"
• "Mi nombre es Juan"`;

        await this.logConversation({
          userId,
          query: normalizedQuery,
          response: helpResponse,
          confidence: 0.7
        });

        return {
          response: helpResponse,
          source: "learning_assistance",
          confidence: 0.7,
          suggestions: {
            formal: mightBeLearning.suggestion,
            simple: mightBeLearning.simpleSuggestion
          }
        };
      }
    }
    
    // 3. Detectar y manejar saludos
    if (this.isGreeting(normalizedQuery)) {
      logger.info(`Detectado saludo: "${normalizedQuery}"`);
      const greetingResponse = greetingService.getGreetingResponse(normalizedQuery);
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: greetingResponse.response,
        confidence: greetingResponse.confidence
      });
      
      return greetingResponse;
    }

    // 4. PRIORIDAD ALTA: Detectar y manejar consultas sobre información del sistema
    // Esta verificación DEBE ir antes de las consultas de IA y tiene prioridad absoluta
    if (systemInfoService.isSystemInfoQuery(normalizedQuery)) {
      logger.info(`Detectada consulta sobre información del sistema: "${normalizedQuery}"`);
      const systemResponse = systemInfoService.getSystemInfo(normalizedQuery);
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: systemResponse.response,
        confidence: systemResponse.confidence
      });
      
      return systemResponse;
    }
    
    // 5. Verificación SECUNDARIA para consultas sobre el creador que pudieran escapar
    // a la detección principal en systemInfoService.isSystemInfoQuery
    const secondaryCreatorPatterns = [
      /^quien (te|lo) (creo|creó|hizo|desarrollo|desarrolló)(\?)?$/i,
      /^quienes (te|lo) (crearon|hicieron|desarrollaron)(\?)?$/i,
      /^quien(es)? te (programo|programó|diseñó|diseño)(\?)?$/i
    ];

    let isSecondaryCreatorQuery = false;
    for (const pattern of secondaryCreatorPatterns) {
      if (pattern.test(normalizedQuery)) {
        isSecondaryCreatorQuery = true;
        break;
      }
    }

    if (isSecondaryCreatorQuery) {
      logger.info(`Detectada consulta secundaria sobre creador: "${normalizedQuery}"`);
      const systemResponse = {
        response: "Fui creado por estudiantes de Ingeniería en Sistemas de la Universidad Mariano Gálvez de Guatemala, sede Salamá. Estoy aquí para responder tus preguntas y aprender de nuestras interacciones.",
        source: "system_info",
        confidence: 1.0
      };
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: systemResponse.response,
        confidence: systemResponse.confidence
      });
      
      return systemResponse;
    }
    
    // 6. Detectar y manejar cálculos matemáticos
    if (this.isCalculationQuery(normalizedQuery)) {
      logger.info(`Detectada consulta matemática: "${normalizedQuery}"`);
      const calculationResult = this.handleCalculationQuery(normalizedQuery);
      if (calculationResult) {
        // Registrar en el historial
        await this.logConversation({
          userId,
          query: normalizedQuery,
          response: calculationResult.response,
          confidence: calculationResult.confidence
        });
        
        return calculationResult;
      }
    }
    
    // 7. Detectar y manejar consultas de programación
    if (this.isProgrammingQuery(normalizedQuery)) {
      logger.info(`Detectada consulta de programación: "${normalizedQuery}"`);
      // Primero intentar con la API de Stack Overflow
      try {
        const codeResult = await programmingService.searchCode(normalizedQuery);
        if (codeResult && codeResult.answer) {
          // Registrar en el historial
          await this.logConversation({
            userId,
            query: normalizedQuery,
            response: codeResult.answer,
            confidence: 0.9
          });
          
          return {
            response: codeResult.answer,
            source: codeResult.source,
            confidence: 0.9,
            context: codeResult.context,
            url: codeResult.url
          };
        }
      } catch (codeError) {
        logger.error('Error al buscar código de programación:', codeError);
      }
      
      // Si falla la API, intentar con la biblioteca local de algoritmos
      try {
        const specificAlgorithm = programmingService.getSpecificAlgorithm(normalizedQuery);
        if (specificAlgorithm && specificAlgorithm.answer) {
          // Registrar en el historial
          await this.logConversation({
            userId,
            query: normalizedQuery,
            response: specificAlgorithm.answer,
            confidence: 0.8
          });
          
          return {
            response: specificAlgorithm.answer,
            source: specificAlgorithm.source,
            confidence: 0.8,
            context: specificAlgorithm.context
          };
        }
        
        const basicAlgorithm = programmingService.getBasicAlgorithm(normalizedQuery);
        if (basicAlgorithm && basicAlgorithm.answer) {
          // Registrar en el historial
          await this.logConversation({
            userId,
            query: normalizedQuery,
            response: basicAlgorithm.answer,
            confidence: 0.8
          });
          
          return {
            response: basicAlgorithm.answer,
            source: basicAlgorithm.source,
            confidence: 0.8,
            context: basicAlgorithm.context
          };
        }
      } catch (algorithmError) {
        logger.error('Error al generar algoritmo básico:', algorithmError);
      }
    }
    
    // 8. Detectar y manejar consultas factuales directas
    if (this.isDirectFactualQuery(normalizedQuery)) {
      logger.info(`Detectada consulta factual directa: "${normalizedQuery}"`);
      const factualResponse = factualKnowledgeService.getDirectFactualResponse(normalizedQuery);
      if (factualResponse) {
        logger.info(`Respondiendo con información factual: "${factualResponse.response}"`);
        
        // Registrar en el historial
        await this.logConversation({
          userId,
          query: normalizedQuery,
          response: factualResponse.response,
          confidence: factualResponse.confidence
        });
        
        return factualResponse;
      } else {
        logger.info('No se encontró información factual directa, continuando con otros métodos');
      }
    }
    
    // 9. Determinar si es una pregunta factual o candidata para IA
    const isFactual = knowledgeResponseService.isFactualQuestion(normalizedQuery);
    const isAICandidate = AIService.isAIQuery(normalizedQuery);

    // Logging detallado para diagnóstico
    logger.info(`Análisis de consulta: isFactual=${isFactual}, isAICandidate=${isAICandidate}`);
    logger.info(`Estado de IA: enabled=${config.ai && config.ai.enabled}, priority=${config.ai ? config.ai.priority : 'no configurado'}`);

    // 10. PRIMERA BÚSQUEDA: Base de conocimientos - MEJORADA
    logger.info(`PASO 1: Buscando respuesta en base de conocimientos para: "${normalizedQuery}"`);

    let knowledgeResults = [];
    try {
      // Usar un umbral de confianza más bajo para mejorar la coincidencia
      knowledgeResults = await KnowledgeModel.findAnswers(
        normalizedQuery, 
        config.assistant.minConfidenceThreshold || 0.6, // Umbral reducido (antes era 0.7)
        userId
      );
      logger.info(`Resultados de base de conocimientos: ${knowledgeResults.length} encontrados`);
      
      // Logging detallado para diagnóstico
      if (knowledgeResults.length > 0) {
        knowledgeResults.forEach((result, index) => {
          logger.info(`Coincidencia #${index + 1}: "${result.query}" (similitud: ${result.similarity.toFixed(2)}, confianza: ${result.confidence.toFixed(2)})`);
        });
      }
    } catch (knowledgeError) {
      logger.error('Error al buscar en la base de conocimientos:', knowledgeError);
    }
    
    // Si hay una buena coincidencia en la base de conocimientos (similitud > 0.75)
    if (knowledgeResults.length > 0 && knowledgeResults[0].similarity > 0.75) {
      const bestMatch = knowledgeResults[0];
      logger.info(`Mejor coincidencia encontrada en BD: "${bestMatch.query}" (similitud: ${bestMatch.similarity.toFixed(2)}, confianza: ${bestMatch.confidence.toFixed(2)})`);
      
      // Verificar si la respuesta parece desactualizada y la consulta es candidata para IA
      const potentiallyOutdated = AIService.isPotentiallyOutdated(bestMatch.response);
      
      // NUEVO: Preguntar al usuario si desea actualizar la información
      if (potentiallyOutdated && (isAICandidate || isFactual)) {
        const response = bestMatch.response;
        
        // Registrar en el historial
        await this.logConversation({
          userId,
          query: normalizedQuery,
          response: response + "\n\n¿Deseas que busque información más actualizada sobre este tema?",
          knowledgeId: bestMatch.id,
          confidence: bestMatch.confidence
        });
        
        return {
          response: response + "\n\n¿Deseas que busque información más actualizada sobre este tema?",
          source: bestMatch.source,
          confidence: bestMatch.confidence,
          knowledgeId: bestMatch.id,
          awaitingUpdateConfirmation: true,
          originalQuery: normalizedQuery
        };
      }
      
      // Verificar si la respuesta necesita ser refinada (para preguntas factuales)
      let finalResponse = bestMatch.response;
      if (isFactual) {
        logger.info('Refinando respuesta factual');
        finalResponse = knowledgeResponseService.refineFactualResponse(normalizedQuery, finalResponse);
      }
      
      // Corregir problemas de codificación en la respuesta
      finalResponse = this.fixEncoding(finalResponse);
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: finalResponse,
        knowledgeId: bestMatch.id,
        confidence: bestMatch.confidence
      });
      
      return {
        response: finalResponse,
        source: bestMatch.source,
        confidence: bestMatch.confidence,
        knowledgeId: bestMatch.id
      };
    } else if (knowledgeResults.length > 0) {
      logger.info(`Coincidencias encontradas pero con baja similitud: ${knowledgeResults[0].similarity.toFixed(2)}`);
    } else {
      logger.info('No se encontraron coincidencias en la base de conocimientos');
    }
    
    // MEJORADO: Ofrecer múltiples opciones cuando no sabe algo
    logger.info('No se encontró información en BD. Ofreciendo opciones de aprendizaje mejoradas.');

    // MEJORADO: Ofrecer múltiples opciones cuando no sabe algo
    logger.info('No se encontró información en BD. Ofreciendo opciones de aprendizaje mejoradas.');

    const enhancedMessage = `No tengo información sobre "${normalizedQuery}".

Puedes hacer esto:

1. ENSEÑARME SUPER FACIL:
   - "${normalizedQuery.replace(/^(qué es|quién es|dónde está|cuándo|cómo)/, '').trim()} es [tu respuesta]"
   - "Recuerda: [la información que quieres que sepa]"
   - "Mi [algo] es [respuesta]" (para cosas personales)

2. O BUSCAR EN INTERNET:
   - Responde "busca en internet" o "si"

Ejemplos super faciles:
- "Paris es la capital de Francia"
- "Einstein nacio en Alemania" 
- "Recuerda: mi cumpleanos es el 15 de mayo"
- "Mi color favorito es azul"

¿Que prefieres?`;

    // Registrar en el historial
    await this.logConversation({
      userId,
      query: normalizedQuery,
      response: enhancedMessage,
      confidence: 0.8
    });

    return {
      response: enhancedMessage,
      source: "enhanced_learning_prompt",
      confidence: 0.8,
      awaitingWebSearchConfirmation: true,
      awaitingLearningHelp: true,
      originalQuery: normalizedQuery
    };
    
  } catch (error) {
    logger.error('Error al procesar consulta:', error);
    return {
      response: "Lo siento, ocurrió un error al procesar tu consulta. Por favor, intenta de nuevo.",
      source: "error",
      confidence: 0
    };
  }
},

// TAMBIÉN AGREGAR ESTE MÉTODO a AssistantService para evitar más errores

/**
 * NUEVO MÉTODO - Agregar a AssistantService
 * Detecta intentos potenciales de aprendizaje mal formateados
 * @param {string} query - Consulta normalizada
 * @returns {Object} - Resultado de la detección con sugerencias
 */
detectPotentialLearning(query) {
  if (!query) return { isLikely: false };
  
  const indicators = [
    // Frases que sugieren intento de enseñar
    { pattern: /quiero enseñarte/i, isLikely: true },
    { pattern: /tienes que saber/i, isLikely: true },
    { pattern: /deberías saber/i, isLikely: true },
    { pattern: /para que sepas/i, isLikely: true },
    { pattern: /necesitas saber/i, isLikely: true },
    
    // Declaraciones que parecen información pero no están bien formateadas
    { pattern: /(.+) (debería ser|tendría que ser) (.+)/i, isLikely: true, 
      suggestion: (m) => `aprende que ${m[1]} es ${m[3]}`,
      simple: (m) => `${m[1]} es ${m[3]}` },
    
    { pattern: /la respuesta correcta (de|para) (.+) es (.+)/i, isLikely: true,
      suggestion: (m) => `aprende que ${m[2]} es ${m[3]}`,
      simple: (m) => `${m[2]} es ${m[3]}` },
    
    { pattern: /(.+) en realidad es (.+)/i, isLikely: true,
      suggestion: (m) => `aprende que ${m[1]} es ${m[2]}`,
      simple: (m) => `${m[1]} es ${m[2]}` },
    
    { pattern: /no es (.+), es (.+)/i, isLikely: true,
      suggestion: (m) => `incorrecto, es ${m[2]}`,
      simple: (m) => `es ${m[2]}` },
    
    // Información personal indirecta
    { pattern: /mi (.+) se llama (.+)/i, isLikely: true,
      suggestion: (m) => `recuerda que mi ${m[1]} se llama ${m[2]}`,
      simple: (m) => `mi ${m[1]} se llama ${m[2]}` },
    
    // Correcciones indirectas
    { pattern: /eso no es cierto, (.+)/i, isLikely: true,
      suggestion: (m) => `incorrecto, ${m[1]}`,
      simple: (m) => m[1] },
    
    { pattern: /te equivocaste, (.+)/i, isLikely: true,
      suggestion: (m) => `te equivocas, ${m[1]}`,
      simple: (m) => m[1] }
  ];
  
  for (const indicator of indicators) {
    const match = query.match(indicator.pattern);
    if (match) {
      let suggestion = indicator.suggestion ? indicator.suggestion(match) : `aprende que ${query}`;
      let simpleSuggestion = indicator.simple ? indicator.simple(match) : query;
      
      return {
        isLikely: indicator.isLikely,
        confidence: 0.8,
        reason: `Coincide con patrón: ${indicator.pattern}`,
        suggestion: suggestion,
        simpleSuggestion: simpleSuggestion
      };
    }
  }
  
  // Detección heurística básica
  if (query.includes('es') || query.includes('son') || query.includes('significa')) {
    return {
      isLikely: true,
      confidence: 0.6,
      reason: 'Parece contener información factual',
      suggestion: `aprende que ${query}`,
      simpleSuggestion: query
    };
  }
  
  return { isLikely: false };
},


/**
 * NUEVO MÉTODO - Agregar a AssistantService en src/services/assistantService.js
 * Detecta si es una pregunta para evitar confusión con aprendizaje
 * @param {string} query - Consulta normalizada
 * @returns {boolean} - true si es una pregunta
 */
isQuestion(query) {
  if (!query || typeof query !== 'string') return false;
  
  const questionPatterns = [
    // Palabras interrogativas al inicio
    /^(qué|que|cuál|cual|quién|quien|cómo|como|dónde|donde|cuándo|cuando|por qué|por que|para qué|para que)/i,
    
    // Signos de interrogación
    /\?$/,
    /¿/,
    
    // Patrones de solicitud de información
    /^(sabes|conoces|me puedes decir|puedes decirme|podrías decirme)/i,
    /^(dime|cuentame|cuéntame|explícame|explica|dime)/i,
    /^(me dices|me dirías|me explicarías)/i,
    
    // Patrones de consulta indirecta
    /^(quisiera saber|quiero saber|necesito saber)/i,
    /^(me gustaría saber|me interesa saber)/i,
    
    // Patrones específicos de consulta
    /^(busca|encuentra|localiza|ubica)/i,
    /^(investiga|averigua|consulta)/i,
    
    // Verificaciones
    /^(es cierto que|es verdad que|confirma)/i,
    /^(puedes confirmar|podrías confirmar)/i
  ];
  
  // Verificar patrones de pregunta
  const isQuestionPattern = questionPatterns.some(pattern => pattern.test(query));
  
  // Verificación adicional: si termina en signo de interrogación
  const hasQuestionMark = query.endsWith('?') || query.includes('¿');
  
  // Log para diagnóstico
  if (isQuestionPattern || hasQuestionMark) {
    logger.info(`Detectada pregunta: "${query}" (patrón: ${isQuestionPattern}, signo: ${hasQuestionMark})`);
  }
  
  return isQuestionPattern || hasQuestionMark;
},



  /**
   * Ejecuta una búsqueda web y de IA para actualizar el conocimiento
   * @param {string} query - Consulta original
   * @param {string} userId - ID del usuario
   * @returns {Promise<Object>} - Respuesta con información actualizada
   */
  async executeWebAndAISearch(query, userId) {
    try {
      logger.info(`Ejecutando búsqueda web y de IA para: "${query}"`);
      
      // 1. Intentar búsqueda en la web
      let webResult = null;
      try {
        webResult = await webSearchService.search(query);
      } catch (webError) {
        logger.error('Error en búsqueda web:', webError);
      }
      
      // 2. Intentar obtener respuesta de IA
      let aiResult = null;
      try {
        if (config.ai && config.ai.enabled) {
          aiResult = await AIService.getAIResponse(query);
        }
      } catch (aiError) {
        logger.error('Error en consulta a IA:', aiError);
      }
      
      // 3. Determinar la mejor respuesta
      let finalResult = null;
      
      if (webResult && aiResult) {
        // Si tenemos ambas respuestas, elegir la más completa o relevante
        const webAnswerLength = webResult.answer ? webResult.answer.length : 0;
        const aiAnswerLength = aiResult.answer ? aiResult.answer.length : 0;
        
        finalResult = (aiAnswerLength > webAnswerLength * 1.2) ? aiResult : webResult;
      } else if (webResult) {
        finalResult = webResult;
      } else if (aiResult) {
        finalResult = aiResult;
      } else {
        // Si ambas búsquedas fallaron
        return {
          response: "Lo siento, no pude encontrar información relevante sobre esto en fuentes externas.",
          source: "system",
          confidence: 0.5
        };
      }
      
      // 4. Guardar el conocimiento en la base de datos
      const answer = finalResult.answer;
      const source = finalResult.source || 'búsqueda externa';
      
      let knowledgeId = null;
      try {
        // Verificar primero si ya existe una entrada similar
        const existingEntries = await KnowledgeModel.findAnswers(
          query,
          0.75,
          userId
        );
        
        if (existingEntries.length > 0 && existingEntries[0].similarity > 0.8) {
          // Actualizar conocimiento existente
          await KnowledgeModel.updateKnowledge(existingEntries[0].id, {
            response: answer,
            source: source,
            context: finalResult.context || null,
            confidence: 0.85,
            is_ai_generated: !!aiResult,
            updated_at: new Date()
          });
          
          knowledgeId = existingEntries[0].id;
          logger.info(`Conocimiento existente actualizado: ID ${knowledgeId}`);
        } else {
          // Crear nuevo conocimiento
          const newKnowledge = await KnowledgeModel.addKnowledge({
            query: query,
            response: answer,
            source: source,
            context: finalResult.context || null,
            confidence: 0.85,
            userId: null, // Público
            isPublic: true,
            is_ai_generated: !!aiResult
          });
          
          knowledgeId = newKnowledge.id;
          logger.info(`Nuevo conocimiento guardado en BD: ID ${knowledgeId}`);
        }
      } catch (dbError) {
        logger.error('Error al guardar conocimiento en BD:', dbError);
      }
      
      // 5. Registrar en el historial y retornar
      await this.logConversation({
        userId,
        query,
        response: answer,
        knowledgeId,
        confidence: 0.85
      });
      
      return {
        response: answer,
        source: source,
        confidence: 0.85,
        knowledgeId,
        context: finalResult.context || null
      };
    } catch (error) {
      logger.error('Error en búsqueda externa:', error);
      return {
        response: "Lo siento, ocurrió un error al buscar información. Por favor, intenta de nuevo más tarde.",
        source: "error",
        confidence: 0
      };
    }
  },

  /**
   * Ejecuta una actualización de conocimiento usando IA
   * @param {string} knowledgeId - ID del conocimiento a actualizar
   * @param {string} query - Consulta original
   * @param {string} userId - ID del usuario
   * @returns {Promise<Object>} - Respuesta con información actualizada
   */
  async executeKnowledgeUpdate(knowledgeId, query, userId) {
    try {
      logger.info(`Ejecutando actualización de conocimiento ID ${knowledgeId} para: "${query}"`);
      
      // 1. Obtener el conocimiento existente
      const existingKnowledge = await KnowledgeModel.getById(knowledgeId);
      if (!existingKnowledge) {
        return {
          response: "Lo siento, no pude encontrar el conocimiento a actualizar.",
          source: "system",
          confidence: 0.5
        };
      }
      
      // 2. Obtener información actualizada
      let updatedInfo = null;
      
      // Intentar primero con IA por ser generalmente más completa
      if (config.ai && config.ai.enabled) {
        try {
          const aiResult = await AIService.getAIResponse(query);
          if (aiResult && aiResult.answer) {
            updatedInfo = {
              answer: aiResult.answer,
              source: aiResult.source || 'IA',
              isAI: true
            };
          }
        } catch (aiError) {
          logger.error('Error al obtener información actualizada de IA:', aiError);
        }
      }
      
      // Si falla la IA, intentar con búsqueda web
      if (!updatedInfo) {
        try {
          const webResult = await webSearchService.search(query);
          if (webResult && webResult.answer) {
            updatedInfo = {
              answer: webResult.answer,
              source: webResult.source || 'Web',
              isAI: false
            };
          }
        } catch (webError) {
          logger.error('Error al obtener información actualizada de web:', webError);
        }
      }
      
      // Si no pudimos obtener información actualizada
      if (!updatedInfo) {
        return {
          response: "Lo siento, no pude encontrar información actualizada sobre este tema.",
          source: "system",
          confidence: 0.6
        };
      }
      
      // 3. Actualizar el conocimiento en la base de datos
      try {
        await KnowledgeModel.updateKnowledge(knowledgeId, {
          response: updatedInfo.answer,
          source: updatedInfo.source,
          confidence: Math.max(existingKnowledge.confidence, 0.85),
          is_ai_generated: updatedInfo.isAI,
          updated_at: new Date()
        });
        
        logger.info(`Conocimiento ID ${knowledgeId} actualizado correctamente`);
        
        // 4. Registrar actualización en historial si existe tabla para ello
        try {
          await db.query(
            `INSERT INTO knowledge_updates (knowledge_id, previous_response, new_response, update_reason, source)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              knowledgeId,
              existingKnowledge.response,
              updatedInfo.answer,
              'Actualización solicitada por usuario',
              updatedInfo.source
            ]
          );
        } catch (historyError) {
          logger.warn('No se pudo registrar historial de actualización:', historyError);
        }
      } catch (updateError) {
        logger.error(`Error al actualizar conocimiento en BD:`, updateError);
        return {
          response: "Lo siento, ocurrió un error al actualizar la información. Sin embargo, puedo proporcionarte la información actualizada que encontré: \n\n" + updatedInfo.answer,
          source: updatedInfo.source,
          confidence: 0.7
        };
      }
      
      // 5. Registrar en el historial de conversaciones y retornar
      const finalResponse = `He actualizado mi conocimiento sobre "${query}":\n\n${updatedInfo.answer}`;
      
      await this.logConversation({
        userId,
        query,
        response: finalResponse,
        knowledgeId,
        confidence: 0.9
      });
      
      return {
        response: finalResponse,
        source: updatedInfo.source,
        confidence: 0.9,
        knowledgeId
      };
    } catch (error) {
      logger.error('Error en actualización de conocimiento:', error);
      return {
        response: "Lo siento, ocurrió un error al actualizar la información. Por favor, intenta de nuevo más tarde.",
        source: "error",
        confidence: 0
      };
    }
  },

  /**
 * MODIFICAR MÉTODO EXISTENTE en AssistantService en src/services/assistantService.js
 * Normaliza una consulta de usuario CON corrección ortográfica integrada
 * @param {string} query - Consulta original
 * @returns {string} - Consulta normalizada y corregida
 */
normalizeQuery(query) {
  if (!query || typeof query !== 'string') {
    return '';
  }
  
  // PASO 1: Corrección ortográfica ANTES de normalizar
  let normalized = this.correctSpelling(query);
  
  // PASO 2: Corregir problemas de codificación (MANTENER código original)
  normalized = normalized
    .replace(/\u00e1|\u00e2|\u00e0|\u00e4|\u00e3|\u00e5|\u00e6|\u0103|\u0105|\u0101|\u00c1|\u00c2|\u00c0|\u00c4|\u00c3|\u00c5|\u00c6|\u0102|\u0104|\u0100/g, 'a')
    .replace(/\u00e9|\u00ea|\u00e8|\u00eb|\u0119|\u0117|\u0113|\u011b|\u00c9|\u00ca|\u00c8|\u00cb|\u0118|\u0116|\u0112|\u011a/g, 'e')
    .replace(/\u00ed|\u00ee|\u00ec|\u00ef|\u0129|\u012b|\u012f|\u00cd|\u00ce|\u00cc|\u00cf|\u0128|\u012a|\u012e/g, 'i')
    .replace(/\u00f3|\u00f4|\u00f2|\u00f6|\u00f5|\u014d|\u014f|\u0151|\u00d3|\u00d4|\u00d2|\u00d6|\u00d5|\u014c|\u014e|\u0150/g, 'o')
    .replace(/\u00fa|\u00fb|\u00f9|\u00fc|\u0169|\u016b|\u016d|\u016f|\u00da|\u00db|\u00d9|\u00dc|\u0168|\u016a|\u016c|\u016e/g, 'u')
    .replace(/\u00f1|\u00d1/g, 'n')
    .replace(/\u00e7|\u00c7/g, 'c')
    .replace(/\u00bf/g, '')  // ¿
    .replace(/\u00a1/g, '')  // ¡
    .replace(/�/g, '');      // Cualquier otro carácter no reconocido
  
  // PASO 3: Convertir a minúsculas y eliminar espacios extra (MANTENER)
  normalized = normalized.toLowerCase().trim();
  
  // PASO 4: Eliminar signos de puntuación excesivos o repetidos (MANTENER)
  normalized = normalized.replace(/([.!?])\1+/g, '$1');
  
  // PASO 5: Eliminar caracteres no alfanuméricos al inicio y final (MANTENER)
  normalized = normalized.replace(/^[^a-z0-9áéíóúüñ]+|[^a-z0-9áéíóúüñ]+$/g, '');
  
  // PASO 6: Separar palabras pegadas entre signos de puntuación (MANTENER)
  normalized = normalized.replace(/([a-záéíóúüñ])([.,:;!?])([a-záéíóúüñ])/g, '$1 $3');
  
  // PASO 7: Reemplazar múltiples espacios con uno solo (MANTENER)
  normalized = normalized.replace(/\s+/g, ' ');
  
  // PASO 8: Limitar la longitud de la consulta (MANTENER)
  const maxLength = config && config.assistant && config.assistant.maxQueryLength ? config.assistant.maxQueryLength : 500;
  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength);
  }
  
  // PASO 9: Eliminar palabras comunes al inicio (MANTENER pero mejorar)
  const commonPrefixes = [
    'dime', 'me puedes decir', 'sabrias decirme', 'sabrías decirme',
    'puedes decirme', 'podrias decirme', 'podrías decirme',
    'quiero saber', 'necesito saber', 'quisiera saber',
    'me gustaria saber', 'me gustaría saber',
    // NUEVOS prefijos comunes agregados
    'me dices', 'me dirías', 'me explicarías', 'explícame',
    'por favor dime', 'ayúdame con', 'ayudame con'
  ];
  
  for (const prefix of commonPrefixes) {
    if (normalized.startsWith(prefix + ' ')) {
      normalized = normalized.substring(prefix.length).trim();
      break;
    }
  }
  
  // PASO 10: Log si se aplicaron correcciones
  if (normalized !== query.toLowerCase().trim()) {
    logger.info(`Normalización aplicada: "${query}" → "${normalized}"`);
  }
  
  return normalized;
},

/**
 * REEMPLAZAR MÉTODO EXISTENTE en AssistantService en src/services/assistantService.js
 * Verifica si una consulta es un comando de aprendizaje (VERSIÓN MEJORADA)
 * @param {string} query - Consulta normalizada
 * @returns {boolean} - true si es un comando de aprendizaje
 */
isLearningCommand(query) {
  if (!query || typeof query !== 'string') return false;
  
  // PRIMERO: Aplicar corrección ortográfica
  const correctedQuery = this.correctSpelling(query);
  const lowerQuery = correctedQuery.toLowerCase().trim();
  
  // SEGUNDO: Si es una pregunta clara, NO es aprendizaje
  if (this.isQuestion(lowerQuery)) {
    return false;
  }
  
  // TERCERO: Patrones súper fáciles (NUEVOS - agregados a los existentes)
  const easyLearningPatterns = [
    // Declaraciones directas simples
    /^([^¿?]+) es ([^¿?]+)$/i,                    // "París es la capital de Francia"
    /^([^¿?]+) son ([^¿?]+)$/i,                   // "Los gatos son animales"
    /^([^¿?]+) significa ([^¿?]+)$/i,             // "Hola significa saludo"
    /^([^¿?]+) se llama ([^¿?]+)$/i,              // "Mi perro se llama Max"
    /^([^¿?]+) tiene (.+ habitantes|.+ millones|.+ población)$/i, // "España tiene 47 millones"
    /^([^¿?]+) está en ([^¿?]+)$/i,               // "Madrid está en España"
    /^([^¿?]+) fue ([^¿?]+)$/i,                   // "Shakespeare fue un escritor"
    /^([^¿?]+) nació en ([^¿?]+)$/i,              // "Einstein nació en Alemania"
    /^([^¿?]+) murió en ([^¿?]+)$/i,              // "Mozart murió en 1791"
    /^([^¿?]+) vive en ([^¿?]+)$/i,               // "Mi hermana vive en Barcelona"
    /^([^¿?]+) trabaja en ([^¿?]+)$/i,            // "Juan trabaja en Google"
    
    // Correcciones súper simples
    /^no[,.]?\s*([^¿?]+) es ([^¿?]+)$/i,          // "No, París es la capital"
    /^incorrecto[,.]?\s*([^¿?]+) es ([^¿?]+)$/i,  // "Incorrecto, la capital es Madrid"
    /^está mal[,.]?\s*([^¿?]+)$/i,                // "Está mal, la verdad es que..."
    /^te equivocas[,.]?\s*([^¿?]+)$/i,            // "Te equivocas, en realidad es..."
    /^error[,.]?\s*([^¿?]+)$/i,                   // "Error, la respuesta correcta es..."
    /^mentira[,.]?\s*([^¿?]+)$/i,                 // "Mentira, la verdad es..."
    /^falso[,.]?\s*([^¿?]+)$/i,                   // "Falso, en realidad es..."
    
    // Comandos con "recuerda", "anota", etc.
    /^(recuerda|anota|guarda|apunta)[:]?\s*([^¿?]+)$/i,
    
    // Comandos de voz naturales
    /^(dile|di) que ([^¿?]+)$/i,                  // "Dile que París es la capital"
    /^te digo que ([^¿?]+)$/i,                    // "Te digo que mañana es mi cumpleaños"
    /^quiero que sepas que ([^¿?]+)$/i,           // "Quiero que sepas que soy vegetariano"
    /^debes saber que ([^¿?]+)$/i,                // "Debes saber que trabajo en Google"
    /^tienes que recordar que ([^¿?]+)$/i,        // "Tienes que recordar que soy alérgico"
    
    // Patrones con confirmación
    /^([^¿?]+), ¿(ok|vale|entendido|de acuerdo|cierto)\?$/i,
    
    // Información personal fácil
    /^mi ([^¿?]+) es ([^¿?]+)$/i,                 // "Mi nombre es Juan"
    /^mi ([^¿?]+) son ([^¿?]+)$/i,                // "Mis hobbies son leer y nadar"
    /^soy ([^¿?]+)$/i,                            // "Soy ingeniero"
    /^trabajo en ([^¿?]+)$/i,                     // "Trabajo en Microsoft"
    /^estudio ([^¿?]+)$/i,                        // "Estudio medicina"
    /^vivo en ([^¿?]+)$/i,                        // "Vivo en Madrid"
    /^me llamo ([^¿?]+)$/i,                       // "Me llamo Ana"
    /^tengo (.+ años)$/i,                         // "Tengo 25 años"
    
    // Definiciones simples
    /^(.+) quiere decir (.+)$/i,                 // "Amor quiere decir cariño"
    /^(.+) es lo mismo que (.+)$/i,              // "Auto es lo mismo que carro"
    
    // Relaciones familiares/personales
    /^(.+) es mi (.+)$/i,                        // "Juan es mi hermano"
    /^(.+) es el (.+) de (.+)$/i,                // "Pedro es el padre de Ana"
    
    // Fechas y eventos
    /^(.+) es el (.+ de .+)$/i,                  // "Mi cumpleaños es el 15 de mayo"
    /^(.+) será (.+)$/i,                         // "La reunión será mañana"
    
    // Ubicaciones y direcciones
    /^(.+) queda en (.+)$/i,                     // "El banco queda en la esquina"
    /^(.+) se encuentra en (.+)$/i,              // "La oficina se encuentra en el centro"
  ];
  
  // Verificar patrones fáciles PRIMERO
  for (const pattern of easyLearningPatterns) {
    if (pattern.test(lowerQuery)) {
      logger.info(`Patrón fácil de aprendizaje detectado para: "${lowerQuery}"`);
      return true;
    }
  }
  
  // MANTENER todos los patrones originales (NO TOCAR - para compatibilidad)
  const originalPatterns = [
    /^aprende que (.+) es (.+)$/i,
    /^aprende que (.+) significa (.+)$/i,
    /^aprende que (.+) son (.+)$/i,
    /^aprende (.+) es (.+)$/i,
    /^aprende (.+) significa (.+)$/i,
    /^aprende (.+) son (.+)$/i,
    /^aprende (.+) como (.+)$/i,
    /^ensena que (.+) es (.+)$/i,
    /^ensena (.+) es (.+)$/i,
    /^enseña que (.+) es (.+)$/i,
    /^enseña (.+) es (.+)$/i,
    /^recuerda que (.+) es (.+)$/i,
    /^recuerda (.+) es (.+)$/i,
    /^guarda que (.+) es (.+)$/i,
    /^guarda (.+) es (.+)$/i,
    /^memoriza que (.+) es (.+)$/i
  ];
  
  // Verificar patrones originales
  for (const pattern of originalPatterns) {
    if (pattern.test(lowerQuery)) {
      return true;
    }
  }
  
  // Detección inteligente adicional
  const learningIndicators = [
    'es', 'son', 'significa', 'tiene', 'está en', 'se llama', 
    'fue', 'nació', 'murió', 'vive', 'trabaja'
  ];
  
  const hasLearningIndicator = learningIndicators.some(indicator => {
    const regex = new RegExp(`\\b${indicator}\\b`, 'i');
    return regex.test(lowerQuery);
  });
  
  // Solo considerar aprendizaje si:
  // 1. Tiene indicador de aprendizaje
  // 2. NO es una pregunta
  // 3. Tiene al menos 3 palabras (evitar frases muy cortas)
  if (hasLearningIndicator && 
      !this.isQuestion(lowerQuery) && 
      lowerQuery.split(' ').length >= 3) {
    logger.info(`Detección inteligente de aprendizaje para: "${lowerQuery}"`);
    return true;
  }
  
  return false;
},

// AGREGAR ESTE MÉTODO INMEDIATAMENTE a AssistantService en src/services/assistantService.js
// (agregar antes del método normalizeQuery)

/**
 * NUEVO MÉTODO - AGREGAR URGENTE para solucionar el error
 * Corrige errores ortográficos comunes en español
 * @param {string} text - Texto a corregir
 * @returns {string} - Texto corregido
 */
correctSpelling(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Diccionario de correcciones ortográficas comunes
  const corrections = {
    // Errores con acentos en preguntas
    'que': 'qué',           // Solo cuando es pregunta
    'como': 'cómo',         // Solo cuando es pregunta
    'cuando': 'cuándo',     // Solo cuando es pregunta
    'donde': 'dónde',       // Solo cuando es pregunta
    'quien': 'quién',       // Solo cuando es pregunta
    'cual': 'cuál',         // Solo cuando es pregunta
    
    // Errores de escritura comunes
    'saves': 'sabes',
    'saver': 'saber',
    'tanbien': 'también',
    'tambien': 'también',
    'ahi': 'ahí',
    'ay': 'hay',
    'porqué': 'por qué',
    'porque': 'porque',
    'atravez': 'a través',
    'asia': 'hacia',
    'aser': 'hacer',
    'acer': 'hacer',
    'nose': 'no sé',
    'noce': 'no sé',
    
    // Errores específicos de aprendizaje
    'apreder': 'aprender',
    'aprede': 'aprende',
    'ensena': 'enseña',
    'enceña': 'enseña',
    'significar': 'significa',
    'sinifica': 'significa',
    
    // Palabras mal escritas comunes
    'haora': 'ahora',
    'ora': 'ahora',
    'nesesito': 'necesito',
    'nesecito': 'necesito',
    'quiero': 'quiero',
    'kiero': 'quiero',
    'dimelo': 'dímelo',
    'esplicame': 'explícame',
    'esplica': 'explica'
  };
  
  let correctedText = text;
  
  // Aplicar correcciones palabra por palabra
  for (const [wrong, correct] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${wrong}\\b`, 'gi');
    correctedText = correctedText.replace(regex, correct);
  }
  
  // Limpiar espacios extra
  correctedText = correctedText.replace(/\s+/g, ' ').trim();
  
  // Log si se hicieron correcciones
  if (correctedText !== text) {
    logger.info(`Corrección ortográfica aplicada: "${text}" → "${correctedText}"`);
  }
  
  return correctedText;
},



/**
 * NUEVO MÉTODO - Agregar a AssistantService en src/services/assistantService.js
 * Extrae pregunta de una declaración para crear entrada en base de conocimientos
 * @param {string} statement - Declaración del usuario
 * @returns {string} - Pregunta generada
 */
extractQuestionFromStatement(statement) {
  if (!statement) return statement;
  
  // Aplicar corrección ortográfica primero
  const correctedStatement = this.correctSpelling(statement);
  
  const patterns = [
    // Patrones básicos de información
    { pattern: /(.+) es (.+)/i, question: (m) => `qué es ${m[1].trim()}` },
    { pattern: /(.+) son (.+)/i, question: (m) => `qué son ${m[1].trim()}` },
    { pattern: /(.+) significa (.+)/i, question: (m) => `qué significa ${m[1].trim()}` },
    { pattern: /(.+) quiere decir (.+)/i, question: (m) => `qué significa ${m[1].trim()}` },
    
    // Patrones de ubicación
    { pattern: /(.+) está en (.+)/i, question: (m) => `dónde está ${m[1].trim()}` },
    { pattern: /(.+) queda en (.+)/i, question: (m) => `dónde queda ${m[1].trim()}` },
    { pattern: /(.+) se encuentra en (.+)/i, question: (m) => `dónde se encuentra ${m[1].trim()}` },
    { pattern: /(.+) vive en (.+)/i, question: (m) => `dónde vive ${m[1].trim()}` },
    
    // Patrones de cantidad/medida
    { pattern: /(.+) tiene (.+)/i, question: (m) => `cuánto tiene ${m[1].trim()}` },
    { pattern: /(.+) mide (.+)/i, question: (m) => `cuánto mide ${m[1].trim()}` },
    { pattern: /(.+) pesa (.+)/i, question: (m) => `cuánto pesa ${m[1].trim()}` },
    
    // Patrones temporales
    { pattern: /(.+) nació en (.+)/i, question: (m) => `cuándo nació ${m[1].trim()}` },
    { pattern: /(.+) murió en (.+)/i, question: (m) => `cuándo murió ${m[1].trim()}` },
    { pattern: /(.+) fue (.+)/i, question: (m) => `quién fue ${m[1].trim()}` },
    { pattern: /(.+) será (.+)/i, question: (m) => `cuándo será ${m[1].trim()}` },
    
    // Patrones de trabajo/profesión
    { pattern: /(.+) trabaja en (.+)/i, question: (m) => `dónde trabaja ${m[1].trim()}` },
    { pattern: /(.+) es (.+) de profesión/i, question: (m) => `qué es ${m[1].trim()}` },
    
    // Patrones personales (para conversaciones con el usuario)
    { pattern: /mi (.+) es (.+)/i, question: (m) => `cuál es tu ${m[1].trim()}` },
    { pattern: /mi (.+) son (.+)/i, question: (m) => `cuáles son tus ${m[1].trim()}` },
    { pattern: /soy (.+)/i, question: (m) => `qué eres` },
    { pattern: /me llamo (.+)/i, question: (m) => `cómo te llamas` },
    { pattern: /trabajo en (.+)/i, question: (m) => `dónde trabajas` },
    { pattern: /vivo en (.+)/i, question: (m) => `dónde vives` },
    { pattern: /estudio (.+)/i, question: (m) => `qué estudias` },
    { pattern: /tengo (.+ años)/i, question: (m) => `cuántos años tienes` },
    
    // Patrones de relaciones
    { pattern: /(.+) es mi (.+)/i, question: (m) => `quién es tu ${m[2].trim()}` },
    { pattern: /(.+) es el (.+) de (.+)/i, question: (m) => `quién es el ${m[2].trim()} de ${m[3].trim()}` },
    
    // Patrones con nombres
    { pattern: /(.+) se llama (.+)/i, question: (m) => `cómo se llama ${m[1].trim()}` },
    
    // Fechas y eventos especiales
    { pattern: /(.+) es el (.+ de .+)/i, question: (m) => `cuándo es ${m[1].trim()}` },
    
    // Correcciones (extraer de la corrección)
    { pattern: /no[,.]?\s*(.+) es (.+)/i, question: (m) => `qué es ${m[1].trim()}` },
    { pattern: /incorrecto[,.]?\s*(.+) es (.+)/i, question: (m) => `qué es ${m[1].trim()}` },
    { pattern: /está mal[,.]?\s*(.+) es (.+)/i, question: (m) => `qué es ${m[1].trim()}` },
    
    // Patrones con "recuerda", "anota", etc.
    { pattern: /recuerda[:]?\s*(.+)/i, question: (m) => this.extractQuestionFromStatement(m[1].trim()) },
    { pattern: /anota[:]?\s*(.+)/i, question: (m) => this.extractQuestionFromStatement(m[1].trim()) },
    { pattern: /guarda[:]?\s*(.+)/i, question: (m) => this.extractQuestionFromStatement(m[1].trim()) },
  ];
  
  // Intentar con cada patrón
  for (const p of patterns) {
    const match = correctedStatement.match(p.pattern);
    if (match) {
      const question = p.question(match);
      logger.info(`Pregunta extraída: "${correctedStatement}" → "${question}"`);
      return question;
    }
  }
  
  // Si no coincide con ningún patrón, crear pregunta genérica
  const words = correctedStatement.split(' ');
  if (words.length > 0) {
    // Tomar las primeras 2-3 palabras para crear una pregunta genérica
    const mainSubject = words.slice(0, Math.min(3, words.length)).join(' ');
    return `información sobre ${mainSubject}`;
  }
  
  return correctedStatement;
},


/**
 * NUEVO MÉTODO - Agregar a AssistantService en src/services/assistantService.js
 * Extrae respuesta de una declaración para almacenar en base de conocimientos
 * @param {string} statement - Declaración del usuario
 * @returns {string} - Respuesta generada
 */
extractAnswerFromStatement(statement) {
  if (!statement) return statement;
  
  // Aplicar corrección ortográfica primero
  const correctedStatement = this.correctSpelling(statement);
  
  const patterns = [
    // Patrones básicos - extraer la parte después del verbo
    { pattern: /(.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /(.+) son (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /(.+) significa (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /(.+) quiere decir (.+)/i, answer: (m) => m[2].trim() },
    
    // Patrones de ubicación - mantener contexto
    { pattern: /(.+) está en (.+)/i, answer: (m) => `está en ${m[2].trim()}` },
    { pattern: /(.+) queda en (.+)/i, answer: (m) => `queda en ${m[2].trim()}` },
    { pattern: /(.+) se encuentra en (.+)/i, answer: (m) => `se encuentra en ${m[2].trim()}` },
    { pattern: /(.+) vive en (.+)/i, answer: (m) => `vive en ${m[2].trim()}` },
    
    // Patrones de cantidad/medida - mantener contexto
    { pattern: /(.+) tiene (.+)/i, answer: (m) => `tiene ${m[2].trim()}` },
    { pattern: /(.+) mide (.+)/i, answer: (m) => `mide ${m[2].trim()}` },
    { pattern: /(.+) pesa (.+)/i, answer: (m) => `pesa ${m[2].trim()}` },
    
    // Patrones temporales - mantener contexto
    { pattern: /(.+) nació en (.+)/i, answer: (m) => `nació en ${m[2].trim()}` },
    { pattern: /(.+) murió en (.+)/i, answer: (m) => `murió en ${m[2].trim()}` },
    { pattern: /(.+) fue (.+)/i, answer: (m) => `fue ${m[2].trim()}` },
    { pattern: /(.+) será (.+)/i, answer: (m) => `será ${m[2].trim()}` },
    
    // Patrones de trabajo/profesión
    { pattern: /(.+) trabaja en (.+)/i, answer: (m) => `trabaja en ${m[2].trim()}` },
    { pattern: /(.+) es (.+) de profesión/i, answer: (m) => `es ${m[2].trim()} de profesión` },
    
    // Patrones personales del usuario - adaptar para respuesta en segunda persona
    { pattern: /mi (.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /mi (.+) son (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /soy (.+)/i, answer: (m) => `eres ${m[1].trim()}` },
    { pattern: /me llamo (.+)/i, answer: (m) => `te llamas ${m[1].trim()}` },
    { pattern: /trabajo en (.+)/i, answer: (m) => `trabajas en ${m[1].trim()}` },
    { pattern: /vivo en (.+)/i, answer: (m) => `vives en ${m[1].trim()}` },
    { pattern: /estudio (.+)/i, answer: (m) => `estudias ${m[1].trim()}` },
    { pattern: /tengo (.+ años)/i, answer: (m) => `tienes ${m[1].trim()}` },
    
    // Patrones de relaciones
    { pattern: /(.+) es mi (.+)/i, answer: (m) => `es tu ${m[2].trim()}` },
    { pattern: /(.+) es el (.+) de (.+)/i, answer: (m) => `es el ${m[2].trim()} de ${m[3].trim()}` },
    
    // Patrones con nombres
    { pattern: /(.+) se llama (.+)/i, answer: (m) => `se llama ${m[2].trim()}` },
    
    // Fechas y eventos especiales
    { pattern: /(.+) es el (.+ de .+)/i, answer: (m) => `es el ${m[2].trim()}` },
    
    // Correcciones - extraer la parte correcta
    { pattern: /no[,.]?\s*(.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /incorrecto[,.]?\s*(.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /está mal[,.]?\s*(.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /te equivocas[,.]?\s*(.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /error[,.]?\s*(.+) es (.+)/i, answer: (m) => m[2].trim() },
    { pattern: /falso[,.]?\s*(.+) es (.+)/i, answer: (m) => m[2].trim() },
    
    // Patrones con comandos - recursivo
    { pattern: /recuerda[:]?\s*(.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    { pattern: /anota[:]?\s*(.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    { pattern: /guarda[:]?\s*(.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    { pattern: /apunta[:]?\s*(.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    
    // Patrones con "dile que", "te digo que"
    { pattern: /dile que (.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    { pattern: /te digo que (.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    { pattern: /quiero que sepas que (.+)/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) },
    
    // Patrones con confirmación - quitar la confirmación
    { pattern: /(.+), ¿(ok|vale|entendido|de acuerdo|cierto)\?$/i, answer: (m) => this.extractAnswerFromStatement(m[1].trim()) }
  ];
  
  // Intentar con cada patrón
  for (const p of patterns) {
    const match = correctedStatement.match(p.pattern);
    if (match) {
      const answer = p.answer(match);
      logger.info(`Respuesta extraída: "${correctedStatement}" → "${answer}"`);
      return answer;
    }
  }
  
  // Si no coincide con ningún patrón, usar la declaración completa como respuesta
  // pero limpiando comandos innecesarios
  let cleanAnswer = correctedStatement
    .replace(/^(recuerda|anota|guarda|apunta)[:]?\s*/i, '')
    .replace(/^(dile que|te digo que|quiero que sepas que)\s*/i, '')
    .replace(/^(no|incorrecto|está mal|te equivocas|error|falso)[,.]?\s*/i, '')
    .replace(/, ¿(ok|vale|entendido|de acuerdo|cierto)\?$/i, '')
    .trim();
  
  return cleanAnswer || correctedStatement;
},

  /**
   * Verifica si una consulta es un saludo
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es un saludo
   */
  isGreeting(query) {
    return greetingService.isGreeting(query);
  },
  
  /**
   * Verifica si una consulta es sobre programación
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta de programación
   */
  isProgrammingQuery(query) {
    return programmingService.isProgrammingQuery(query);
  },
  
  /**
   * Verifica si una consulta es sobre conocimiento factual directo
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es una consulta factual directa
   */
  isDirectFactualQuery(query) {
    return factualKnowledgeService.isDirectFactualQuery(query);
  },
  
  /**
   * Detecta si la consulta es matemática
   * @param {string} query - Consulta normalizada
   * @returns {boolean} - true si es consulta matemática
   */
  isCalculationQuery(query) {
    // Detectar si la consulta contiene operadores matemáticos y números
    const mathPattern = /(\d+\s*[\+\-\*\/]\s*\d+)|(\bcuanto\s+(es|son|vale|valen)\s+.*?\d+\s*[\+\-\*\/]\s*\d+)/i;
    return mathPattern.test(query);
  },

  /**
   * Resuelve consultas matemáticas
   * @param {string} query - Consulta normalizada
   * @returns {Object|null} - Resultado del cálculo o null
   */
  handleCalculationQuery(query) {
    try {
      // Extraer la expresión matemática
      let mathExpression = query.replace(/[^\d\+\-\*\/\(\)\.\s]/g, '').trim();
      
      // Si no hay expresión clara, intentar extraer números y operadores
      if (!mathExpression) {
        const matches = query.match(/\d+\s*[\+\-\*\/]\s*\d+/g);
        if (matches && matches.length > 0) {
          mathExpression = matches[0].trim();
        }
      }
      
      if (mathExpression) {
        // Evaluar la expresión matemática (con precaución)
        // Nota: eval es peligroso para entrada del usuario, pero aquí ya filtramos caracteres
        const result = eval(mathExpression);
        
        // Crear respuesta
        const response = `El resultado de ${mathExpression} es ${result}.`;
        return {
          response,
          source: "system",
          confidence: 1.0,
          isCalculated: true
        };
      }
    } catch (error) {
      logger.error('Error al procesar cálculo matemático:', error);
    }
    
    return null;
  },
  
 /**
 * REEMPLAZAR MÉTODO EXISTENTE en AssistantService en src/services/assistantService.js
 * Procesa un comando de aprendizaje con mejor detección y corrección ortográfica
 * @param {string} query - Consulta completa
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async handleLearningCommand(query, userId) {
  try {
    if (!config.assistant.learningEnabled) {
      return {
        response: "Lo siento, el aprendizaje está deshabilitado actualmente.",
        source: "system",
        confidence: 1.0
      };
    }
    
    // PASO 1: Aplicar corrección ortográfica
    const correctedQuery = this.correctSpelling(query);
    const lowerQuery = correctedQuery.toLowerCase().trim();
    
    let question, answer;
    
    // PASO 2: Usar extractores inteligentes (NUEVOS)
    try {
      question = this.extractQuestionFromStatement(correctedQuery);
      answer = this.extractAnswerFromStatement(correctedQuery);
      
      // Verificar que tenemos pregunta y respuesta válidas
      if (question && answer && question.trim() !== answer.trim()) {
        logger.info(`Extracción exitosa - Pregunta: "${question}", Respuesta: "${answer}"`);
      } else {
        // Si la extracción automática falla, usar métodos originales
        throw new Error('Extracción automática falló, usando métodos originales');
      }
    } catch (extractError) {
      logger.info('Usando métodos de extracción originales como respaldo');
      
      // PASO 3: Métodos originales como respaldo (MANTENER - no tocar)
      const explicitPatterns = [
        /^aprende que (.+) es (.+)$/i,
        /^aprende que (.+) significa (.+)$/i,
        /^aprende que (.+) son (.+)$/i,
        /^aprende (.+) es (.+)$/i,
        /^aprende (.+) significa (.+)$/i,
        /^aprende (.+) son (.+)$/i,
        /^aprende (.+) como (.+)$/i,
        /^ensena que (.+) es (.+)$/i,
        /^ensena (.+) es (.+)$/i,
        /^enseña que (.+) es (.+)$/i,
        /^enseña (.+) es (.+)$/i,
        /^recuerda que (.+) es (.+)$/i,
        /^recuerda (.+) es (.+)$/i,
        /^guarda que (.+) es (.+)$/i,
        /^guarda (.+) es (.+)$/i,
        /^memoriza que (.+) es (.+)$/i
      ];
      
      // Verificar patrones originales
      for (const pattern of explicitPatterns) {
        const match = lowerQuery.match(pattern);
        if (match) {
          question = match[1].trim();
          answer = match[2].trim();
          break;
        }
      }
      
      // Si aún no tenemos pregunta y respuesta, mostrar error amigable
      if (!question || !answer) {
        return {
          response: `No pude entender cómo enseñarte eso. Prueba con formatos más simples como:
• "${correctedQuery.replace(/^.+/, 'París')} es la capital de Francia"
• "Recuerda: mi color favorito es azul"
• "Mi nombre es Juan"
• "Aprende que el agua hierve a 100°C"`,
          source: "learning_help",
          confidence: 1.0
        };
      }
    }
    
    // PASO 4: Normalizar la pregunta
    question = this.normalizeQuery(question);
    
    // PASO 5: Buscar conocimiento existente
    const existingEntries = await KnowledgeModel.findAnswers(question, 0.75, userId);
    
    let knowledgeId;
    let confirmationResponse;
    let isUpdate = false;
    
    if (existingEntries.length > 0 && existingEntries[0].similarity > 0.8) {
      // ACTUALIZAR conocimiento existente
      await KnowledgeModel.updateKnowledge(existingEntries[0].id, {
        response: answer,
        confidence: Math.max(existingEntries[0].confidence, 0.95),
        source: 'user_explicit',
        updated_at: new Date()
      });
      
      knowledgeId = existingEntries[0].id;
      isUpdate = true;
      
      // Mensaje más amigable para actualizaciones
      confirmationResponse = `✅ ¡Perfecto! He actualizado mi conocimiento. Ahora sé que ${this.formatLearningConfirmation(question, answer)}.`;
      
      logger.info(`Conocimiento actualizado: "${question}" → "${answer}"`);
    } else {
      // CREAR nuevo conocimiento
      const newKnowledge = await KnowledgeModel.addKnowledge({
        query: question,
        response: answer,
        context: null,
        source: 'user',
        confidence: 0.95,
        userId,
        isPublic: userId ? false : true
      });
      
      knowledgeId = newKnowledge.id;
      isUpdate = false;
      
      // Mensaje más amigable para nuevos aprendizajes
      confirmationResponse = `✅ ¡Aprendido! Ahora sé que ${this.formatLearningConfirmation(question, answer)}.`;
      
      logger.info(`Nuevo conocimiento creado: "${question}" → "${answer}"`);
    }
    
    // PASO 6: Registrar en el historial
    await this.logConversation({
      userId,
      query: correctedQuery, // Usar la versión corregida
      response: confirmationResponse,
      knowledgeId,
      confidence: 1.0
    });
    
    // PASO 7: Retornar respuesta exitosa
    return {
      response: confirmationResponse,
      source: "learning",
      confidence: 1.0,
      knowledgeId,
      isUpdate,
      originalQuery: query,
      correctedQuery: correctedQuery !== query ? correctedQuery : null
    };
    
  } catch (error) {
    logger.error('Error al procesar comando de aprendizaje:', error);
    return {
      response: "Lo siento, ocurrió un error al intentar aprender. Por favor, intenta de nuevo con un formato más simple como 'París es la capital de Francia'.",
      source: "error",
      confidence: 0
    };
  }
},

/**
 * NUEVO MÉTODO - Agregar a AssistantService en src/services/assistantService.js
 * Formatea la confirmación de aprendizaje de manera más natural y amigable
 * @param {string} question - Pregunta generada
 * @param {string} answer - Respuesta a almacenar
 * @returns {string} - Confirmación formateada
 */
formatLearningConfirmation(question, answer) {
  if (!question || !answer) return `${question} ${answer}`;
  
  // Limpiar la pregunta de palabras interrogativas para hacer la confirmación más natural
  let cleanQuestion = question
    .replace(/^(qué es|qué son|quién es|quién fue|dónde está|dónde queda|cuándo es|cuándo fue|cómo se|cuánto tiene|cuántos años|cuál es|cuáles son)\s*/i, '')
    .replace(/^(información sobre|datos de|detalles de)\s*/i, '')
    .trim();
  
  // Si la pregunta es muy genérica, usar la respuesta como base
  if (cleanQuestion.length < 3) {
    return answer;
  }
  
  // Casos especiales para diferentes tipos de respuestas
  const specialCases = [
    // Ubicaciones
    { pattern: /^(está en|queda en|se encuentra en|vive en|trabaja en) (.+)$/i, 
      format: (match, q) => `${q} ${match[0]}` },
    
    // Cantidades/medidas
    { pattern: /^(tiene|mide|pesa) (.+)$/i, 
      format: (match, q) => `${q} ${match[0]}` },
    
    // Fechas/tiempo
    { pattern: /^(nació en|murió en|será el|es el) (.+)$/i, 
      format: (match, q) => `${q} ${match[0]}` },
    
    // Profesiones/roles
    { pattern: /^(fue|es) (.+)$/i, 
      format: (match, q) => `${q} ${match[0]}` },
    
    // Información personal del usuario
    { pattern: /^(eres|te llamas|trabajas en|vives en|estudias|tienes) (.+)$/i, 
      format: (match, q) => `${match[0]}` },
    
    // Nombres
    { pattern: /^se llama (.+)$/i, 
      format: (match, q) => `${q} se llama ${match[1]}` }
  ];
  
  // Verificar casos especiales
  for (const specialCase of specialCases) {
    const match = answer.match(specialCase.pattern);
    if (match) {
      return specialCase.format(match, cleanQuestion);
    }
  }
  
  // Formateo por defecto basado en el tipo de pregunta original
  if (question.startsWith('qué es') || question.startsWith('qué son')) {
    return `${cleanQuestion} es ${answer}`;
  } else if (question.startsWith('quién es') || question.startsWith('quién fue')) {
    return `${cleanQuestion} ${answer}`;
  } else if (question.startsWith('dónde')) {
    return `${cleanQuestion} ${answer}`;
  } else if (question.startsWith('cuándo')) {
    return `${cleanQuestion} ${answer}`;
  } else if (question.startsWith('cuánto') || question.startsWith('cuántos')) {
    return `${cleanQuestion} ${answer}`;
  } else if (question.startsWith('cómo')) {
    return `${cleanQuestion} ${answer}`;
  } else if (question.startsWith('cuál es') || question.startsWith('cuáles son')) {
    return `${cleanQuestion} ${answer}`;
  }
  
  // Formateo genérico
  if (answer.includes('es') || answer.includes('son') || answer.includes('está') || answer.includes('tiene')) {
    return `${cleanQuestion} ${answer}`;
  } else {
    return `${cleanQuestion} es ${answer}`;
  }
},

  /**
   * Corrige problemas de codificación en el texto
   * @param {string} text - Texto a corregir
   * @returns {string} - Texto corregido
   */
  fixEncoding(text) {
    if (!text) return text;
    
    // Reemplazar caracteres mal codificados con sus equivalentes correctos
    return text
      .replace(/\u00e1/g, 'á')
      .replace(/\u00e9/g, 'é')
      .replace(/\u00ed/g, 'í')
      .replace(/\u00f3/g, 'ó')
      .replace(/\u00fa/g, 'ú')
      .replace(/\u00c1/g, 'Á')
      .replace(/\u00c9/g, 'É')
      .replace(/\u00cd/g, 'Í')
      .replace(/\u00d3/g, 'Ó')
      .replace(/\u00da/g, 'Ú')
      .replace(/\u00f1/g, 'ñ')
      .replace(/\u00d1/g, 'Ñ')
      .replace(/\u00fc/g, 'ü')
      .replace(/\u00dc/g, 'Ü')
      .replace(/�/g, 'í') // Reemplazar � con la letra más probable
      .replace(/par�s/gi, 'París')
      .replace(/m�xico/gi, 'México');
  },
  
  /**
   * Registra una conversación en el historial
   * @param {Object} data - Datos de la conversación
   * @returns {Promise<Object>} - Conversación registrada
   */
  async logConversation({ userId, query, response, knowledgeId = null, confidence = null }) {
    try {
      return await ConversationModel.logConversation({
        userId,
        query,
        response,
        knowledgeId,
        confidence
      });
    } catch (error) {
      logger.error('Error al registrar conversación:', error);
      // No lanzamos el error para que no afecte el flujo principal
      return null;
    }
  },
  
  /**
   * Proporciona retroalimentación a una respuesta
   * @param {string} conversationId - ID de la conversación
   * @param {number} feedback - Valor de feedback (-1, 0, 1)
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  async provideFeedback(conversationId, feedback) {
    try {
      let updatedConversation;
      try {
        updatedConversation = await ConversationModel.updateFeedback(
          conversationId,
          feedback
        );
      } catch (error) {
        logger.error(`Error al actualizar feedback para conversación ${conversationId}:`, error);
        return false;
      }
      
      // Si hay un conocimiento asociado, actualizar su confianza
      if (updatedConversation && updatedConversation.knowledge_id) {
        try {
          await KnowledgeModel.updateConfidence(
            updatedConversation.knowledge_id,
            feedback
          );
        } catch (error) {
          logger.error(`Error al actualizar confianza para conocimiento ${updatedConversation.knowledge_id}:`, error);
          // Continuamos aunque falle la actualización de confianza
        }
      }
      
      return true;
    } catch (error) {
      logger.error(`Error al proporcionar feedback para conversación ${conversationId}:`, error);
      return false;
    }
  },
  
  /**
   * Obtiene el historial de conversaciones de un usuario
   * @param {string} userId - ID del usuario
   * @param {number} limit - Límite de resultados
   * @param {number} offset - Offset para paginación
   * @returns {Promise<Array>} - Lista de conversaciones
   */
  async getUserHistory(userId, limit = 50, offset = 0) {
    try {
      return await ConversationModel.getUserHistory(userId, limit, offset);
    } catch (error) {
      logger.error(`Error al obtener historial para usuario ${userId}:`, error);
      return [];
    }
  },
  
  /**
   * Permite al usuario eliminar un conocimiento específico
   * @param {string} knowledgeId - ID del conocimiento
   * @param {string} userId - ID del usuario
   * @returns {Promise<boolean>} - Resultado de la operación
   */
  async deleteKnowledge(knowledgeId, userId) {
    try {
      return await KnowledgeModel.deleteKnowledge(knowledgeId, userId);
    } catch (error) {
      logger.error(`Error al eliminar conocimiento ${knowledgeId}:`, error);
      return false;
    }
  }
};

module.exports = AssistantService;