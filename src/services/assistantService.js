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
   * Procesa una consulta del usuario y devuelve una respuesta
   * @param {string} query - Consulta del usuario
   * @param {string} userId - ID del usuario (opcional)
   * @returns {Promise<Object>} - Objeto con la respuesta y metadatos
   */
  async processQuery(query, userId = null) {
    try {
      // 1. Normalizar la consulta
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
      
      // 2. Detectar si es un comando de aprendizaje
      if (this.isLearningCommand(normalizedQuery)) {
        logger.info(`Detectado comando de aprendizaje: "${normalizedQuery}"`);
        return await this.handleLearningCommand(normalizedQuery, userId);
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
      // 4. Detectar y manejar consultas sobre información del sistema
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
      
      // 5. Detectar y manejar cálculos matemáticos
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
      
      // 6. Detectar y manejar consultas de programación
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
      
      // 7. Detectar y manejar consultas factuales directas
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
      
      // 8. Determinar si es una pregunta factual o candidata para IA
      const isFactual = knowledgeResponseService.isFactualQuestion(normalizedQuery);
      const isAICandidate = AIService.isAIQuery(normalizedQuery);

      // Logging detallado para diagnóstico
      logger.info(`Análisis de consulta: isFactual=${isFactual}, isAICandidate=${isAICandidate}`);
      logger.info(`Estado de IA: enabled=${config.ai && config.ai.enabled}, priority=${config.ai ? config.ai.priority : 'no configurado'}`);

     // 9. PRIMERA BÚSQUEDA: Base de conocimientos - MEJORADA
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
        
        if (config.ai && config.ai.enabled && isAICandidate && potentiallyOutdated) {
          logger.info(`La respuesta existente parece desactualizada, consultando IA para actualización`);
          try {
            // Intentar obtener información actualizada de la IA
            const aiResult = await AIService.getAIResponse(normalizedQuery);
            
            if (aiResult && aiResult.answer) {
              logger.info(`Respuesta actualizada recibida de IA: "${aiResult.answer}"`);
              
              // Actualizar el conocimiento existente con la nueva respuesta
              try {
                await KnowledgeModel.updateKnowledge(bestMatch.id, {
                  response: aiResult.answer,
                  confidence: Math.max(bestMatch.confidence, 0.9),
                  source: aiResult.source || 'IA actualizada',
                  is_ai_generated: true,
                  updated_at: new Date()
                });
                logger.info(`Conocimiento actualizado en base de datos, ID: ${bestMatch.id}`);
              } catch (updateError) {
                logger.error('Error al actualizar conocimiento con IA:', updateError);
              }
              
              // Registrar en el historial
              await this.logConversation({
                userId,
                query: normalizedQuery,
                response: aiResult.answer,
                knowledgeId: bestMatch.id,
                confidence: 0.9
              });
              
              return {
                response: aiResult.answer,
                source: aiResult.source || 'IA actualizada',
                confidence: 0.9,
                knowledgeId: bestMatch.id,
                isAI: true
              };
            } else {
              logger.warn('No se obtuvo respuesta actualizada de IA, usando respuesta existente');
            }
          } catch (aiError) {
            logger.error('Error al verificar actualización con IA:', aiError);
          }
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
      
      if (config.assistant.webSearchEnabled) {
        logger.info(`PASO 2: Intentando búsqueda web para: "${normalizedQuery}"`);
        try {
          const webResult = await webSearchService.search(normalizedQuery);
          
          if (webResult && webResult.answer) {
            logger.info(`Resultado encontrado en búsqueda web desde: ${webResult.source}`);
            
            // Verificar si la respuesta web es relevante
            if (!this.isWebResponseRelevant(normalizedQuery, webResult.answer)) {
              logger.warn(`Respuesta web descartada por irrelevante: "${webResult.answer.substring(0, 100)}..."`);
            } else {
              // Refinar la respuesta si es una pregunta factual
              let finalAnswer = webResult.answer;
              if (isFactual) {
                logger.info('Refinando respuesta web factual');
                finalAnswer = knowledgeResponseService.refineFactualResponse(normalizedQuery, finalAnswer);
              }
              
              // Corregir problemas de codificación
              finalAnswer = this.fixEncoding(finalAnswer);
              
              // Verificar si existe una consulta similar antes de guardar
              const existingEntries = await KnowledgeModel.findAnswers(
                normalizedQuery,
                0.75, // Umbral más bajo para verificar duplicados
                userId
              );
              
              let knowledgeId = null;
              // Guardar el resultado de la web en la base de conocimientos
              try {
                if (existingEntries.length > 0 && existingEntries[0].similarity > 0.8) {
                  // Si existe una entrada muy similar, actualizarla en lugar de crear una nueva
                  const existingEntry = existingEntries[0];
                  logger.info(`Encontrada entrada similar existente para resultado web (similitud: ${existingEntry.similarity.toFixed(2)}), actualizando en lugar de crear nueva`);
                  
                  await KnowledgeModel.updateKnowledge(existingEntry.id, {
                    response: finalAnswer,
                    context: webResult.context || null,
                    source: 'web',
                    confidence: Math.max(existingEntry.confidence, 0.85),
                    updated_at: new Date()
                  });
                  
                  knowledgeId = existingEntry.id;
                  logger.info(`Conocimiento existente actualizado con respuesta web, ID: ${knowledgeId}`);
                } else {
                  // Guardar como nuevo conocimiento
                  const newKnowledge = await KnowledgeModel.addKnowledge({
                    query: normalizedQuery,
                    response: finalAnswer,
                    context: webResult.context || null,
                    source: 'web',
                    confidence: 0.85,
                    userId: null,
                    isPublic: true,
                    created_at: new Date(),
                    updated_at: new Date()
                  });
                  
                  knowledgeId = newKnowledge.id;
                  logger.info(`Resultado web guardado en base de conocimientos, ID: ${knowledgeId}`);
                }
              } catch (knowledgeAddError) {
                logger.error('Error al guardar conocimiento de web:', knowledgeAddError);
              }
              
              // Registrar en el historial
              await this.logConversation({
                userId,
                query: normalizedQuery,
                response: finalAnswer,
                knowledgeId: knowledgeId,
                confidence: 0.85
              });
              
              return {
                response: finalAnswer,
                source: 'web',
                confidence: 0.85,
                knowledgeId: knowledgeId,
                attribution: webResult.source
              };
            }
          } else {
            logger.info('Búsqueda web sin resultados relevantes');
          }
        } catch (error) {
          logger.error('Error en la búsqueda web:', error);
        }
      } else {
        logger.info('Búsqueda web deshabilitada en configuración');
      }
      
      
      // 11. TERCERA BÚSQUEDA: IA como último recurso
     // Solo usar IA como último recurso si la prioridad está configurada como 'fallback'
if (config.ai && config.ai.enabled && (isFactual || isAICandidate) && 
(config.ai.priority === 'fallback' || config.assistant.sourcePriority?.ai === 3)) {
logger.info(`PASO 3: Consultando IA como último recurso para: "${normalizedQuery}"`);
try {
const aiResult = await AIService.getAIResponse(normalizedQuery);

if (aiResult && aiResult.answer) {
  logger.info(`Respuesta de último recurso recibida de IA: "${aiResult.answer}"`);
  
  // Guardar el resultado de IA en la base de conocimientos
  let newKnowledge;
  try {
    // Verificar si ya existe una entrada similar antes de crear nueva
    const existingEntries = await KnowledgeModel.findAnswers(
      normalizedQuery,
      0.75, // Umbral más bajo para duplicados
      userId
    );
    
    if (existingEntries.length > 0 && existingEntries[0].similarity > 0.8) {
      // Actualizar entrada existente
      const existingEntry = existingEntries[0];
      await KnowledgeModel.updateKnowledge(existingEntry.id, {
        response: aiResult.answer,
        context: aiResult.context || null,
        source: aiResult.source || 'IA',
        confidence: 0.9,
        is_ai_generated: true,
        updated_at: new Date()
      });
      newKnowledge = await KnowledgeModel.getById(existingEntry.id);
    } else {
      // Crear nueva entrada
      newKnowledge = await KnowledgeModel.addKnowledge({
        query: normalizedQuery,
        response: aiResult.answer,
        context: aiResult.context || null,
        source: aiResult.source || 'IA',
        confidence: 0.85,
        userId: null,
        isPublic: true,
        is_ai_generated: true,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    logger.info(`Respuesta de IA (último recurso) guardada en base de conocimientos, ID: ${newKnowledge ? newKnowledge.id : 'error'}`);
  } catch (knowledgeAddError) {
    logger.error('Error al guardar conocimiento de IA:', knowledgeAddError);
    
    // Intento alternativo en caso de fallo
    try {
      newKnowledge = await KnowledgeModel.addKnowledge({
        query: normalizedQuery,
        response: aiResult.answer,
        source: 'IA fallback',
        confidence: 0.85,
        isPublic: true
      });
    } catch (fallbackError) {
      logger.error('También falló método alternativo:', fallbackError);
    }
  }
  
  // Registrar en el historial
  await this.logConversation({
    userId,
    query: normalizedQuery,
    response: aiResult.answer,
    knowledgeId: newKnowledge ? newKnowledge.id : null,
    confidence: 0.85
  });
  
  return {
    response: aiResult.answer,
    source: aiResult.source || 'IA',
    confidence: 0.85,
    knowledgeId: newKnowledge ? newKnowledge.id : null,
    isAI: true
  };
} else {
  logger.warn('No se obtuvo respuesta de IA como último recurso');
}
} catch (aiError) {
logger.error('Error en consulta a IA como último recurso:', aiError);
}
}
      
      // 12. Si todo lo demás falla, dar una respuesta genérica
      logger.info(`No se encontró respuesta para "${normalizedQuery}", respondiendo con mensaje por defecto`);
      const defaultResponse = "Lo siento, no tengo una respuesta para eso. ¿Quieres enseñarme diciendo 'aprende que [pregunta] es [respuesta]'?";
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query: normalizedQuery,
        response: defaultResponse,
        confidence: 0.1
      });
      
      return {
        response: defaultResponse,
        source: "system",
        confidence: 0.1
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

  /**
   * Normaliza una consulta de usuario
   * @param {string} query - Consulta original
   * @returns {string} - Consulta normalizada
   */
  normalizeQuery(query) {
    if (!query || typeof query !== 'string') {
      return '';
    }
    
    // Corregir problemas de codificación
    let normalized = query
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
    
    // Convertir a minúsculas y eliminar espacios extra al inicio y final
    normalized = normalized.toLowerCase().trim();
    
    // Eliminar signos de puntuación excesivos o repetidos
    normalized = normalized.replace(/([.!?])\1+/g, '$1');
    
    // Eliminar caracteres no alfanuméricos al inicio y final de la consulta
    normalized = normalized.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    
    // Separar palabras pegadas entre signos de puntuación (caso común)
    normalized = normalized.replace(/([a-z])([.,:;!?])([a-z])/g, '$1 $3');
    
    // Reemplazar múltiples espacios con uno solo
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Limitar la longitud de la consulta
    if (normalized.length > config.assistant.maxQueryLength) {
      normalized = normalized.substring(0, config.assistant.maxQueryLength);
    }
    
    // Eliminar palabras comunes al inicio que no aportan valor semántico
    // pero pueden afectar la coincidencia en la base de conocimientos
    const commonPrefixes = [
      'dime', 'me puedes decir', 'sabrias decirme', 'sabrías decirme',
      'puedes decirme', 'podrias decirme', 'podrías decirme',
      'quiero saber', 'necesito saber', 'quisiera saber',
      'me gustaria saber', 'me gustaría saber'
    ];
    
    for (const prefix of commonPrefixes) {
      if (normalized.startsWith(prefix + ' ')) {
        normalized = normalized.substring(prefix.length).trim();
        break;
      }
    }
    
    return normalized;
  },
  
  /**
 * Verifica si una consulta es un comando de aprendizaje (detección mejorada)
 * @param {string} query - Consulta normalizada
 * @returns {boolean} - true si es un comando de aprendizaje
 */
isLearningCommand(query) {
  // Patrones explícitos de comando de aprendizaje (los existentes)
  const explicitPatterns = [
    /^aprende que (.+) es (.+)$/i,
    /^aprende (.+) es (.+)$/i,
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
  
  // Nuevos patrones más naturales
  const naturalPatterns = [
    // Patrones de tipo conversacional
    /(?:quiero|necesito|me gustaría|quisiera) que (aprendas|sepas|recuerdes|guardes) que (.+) es (.+)$/i,
    /(?:debes|deberías|podrías|puedes) (aprender|saber|recordar|guardar) que (.+) es (.+)$/i,
    /(.+) significa (.+)$/i,
    /(.+) se define como (.+)$/i,
    /(.+) es igual a (.+)$/i,
    /(.+) se refiere a (.+)$/i,
    /la definición de (.+) es (.+)$/i,
    
    // Patrones de corrección
    /^no,? (.+) (?:es|significa|equivale a|se refiere a) (.+)$/i,
    /^incorrecto,? (.+) (?:es|significa|equivale a|se refiere a) (.+)$/i,
    /^te equivocas,? (.+) (?:es|significa|equivale a|se refiere a) (.+)$/i,
    
    // Patrón simplificado de asociación directa
    /^(.+): (.+)$/i
  ];
  
  // Verificar patrones explícitos primero
  for (const pattern of explicitPatterns) {
    if (pattern.test(query)) {
      return true;
    }
  }
  
  // Verificar patrones naturales
  for (const pattern of naturalPatterns) {
    if (pattern.test(query)) {
      return true;
    }
  }
  
  return false;
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
 * Procesa un comando de aprendizaje con mejor detección
 * @param {string} query - Consulta completa
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
async handleLearningCommand(query, userId) {
  try {
    // Verificar si el aprendizaje está habilitado
    if (!config.assistant.learningEnabled) {
      return {
        response: "Lo siento, el aprendizaje está deshabilitado actualmente.",
        source: "system",
        confidence: 1.0
      };
    }
    
    // Extraer la pregunta y respuesta del comando
    let question, answer;
    
    // Patrones explícitos (los existentes)
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
    
    // Nuevos patrones (conversacionales)
    const naturalPatterns = [
      // Patrones conversacionales - grupo 2, 3
      {
        regex: /(?:quiero|necesito|me gustaría|quisiera) que (?:aprendas|sepas|recuerdes|guardes) que (.+) es (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /(?:debes|deberías|podrías|puedes) (?:aprender|saber|recordar|guardar) que (.+) es (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      // Definiciones - grupo 1, 2
      {
        regex: /(.+) significa (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /(.+) se define como (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /(.+) es igual a (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /(.+) se refiere a (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /la definición de (.+) es (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      // Correcciones - grupo 1, 2
      {
        regex: /^no,? (.+) (?:es|significa|equivale a|se refiere a) (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /^incorrecto,? (.+) (?:es|significa|equivale a|se refiere a) (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      {
        regex: /^te equivocas,? (.+) (?:es|significa|equivale a|se refiere a) (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      },
      // Formato simplificado - grupo 1, 2
      {
        regex: /^(.+): (.+)$/i,
        questionIndex: 1,
        answerIndex: 2
      }
    ];
    
    // Intentar patrones explícitos primero
    for (const pattern of explicitPatterns) {
      const match = query.match(pattern);
      if (match) {
        question = match[1].trim();
        answer = match[2].trim();
        break;
      }
    }
    
    // Si no hay coincidencia, intentar los patrones naturales
    if (!question || !answer) {
      for (const { regex, questionIndex, answerIndex } of naturalPatterns) {
        const match = query.match(regex);
        if (match) {
          question = match[questionIndex].trim();
          answer = match[answerIndex].trim();
          break;
        }
      }
    }
    
    // Si no pudimos extraer pregunta y respuesta
    if (!question || !answer) {
      return {
        response: "No estoy seguro de qué debo aprender. Puedes usar formatos como 'aprende que X es Y' o simplemente 'X significa Y'.",
        source: "system",
        confidence: 1.0
      };
    }
    
    // Normalizar la pregunta para mejorar búsquedas futuras
    question = this.normalizeQuery(question);
    
    // Verificar si ya existe una pregunta similar
    const existingEntries = await KnowledgeModel.findAnswers(
      question,
      0.75, // Umbral más bajo para verificar duplicados
      userId
    );
    
    let knowledgeId;
    
    if (existingEntries.length > 0 && existingEntries[0].similarity > 0.8) {
      // Si ya existe una entrada muy similar, actualizarla
      const existingEntry = existingEntries[0];
      logger.info(`Actualizando conocimiento existente (${existingEntry.id}) con nueva respuesta`);
      
      try {
        await KnowledgeModel.updateKnowledge(existingEntry.id, {
          response: answer,
          confidence: Math.max(existingEntry.confidence, 0.95), // Incrementar confianza 
          source: 'user_explicit' // Marcar como explícitamente añadido por el usuario
        });
        
        knowledgeId = existingEntry.id;
      } catch (error) {
        logger.error('Error al actualizar conocimiento existente:', error);
        return {
          response: "Lo siento, hubo un problema al actualizar el conocimiento. Por favor, intenta nuevamente.",
          source: "error",
          confidence: 0
        };
      }
      
      // Corregir cualquier problema de codificación
      const fixedQuestion = this.fixEncoding(existingEntry.query);
      const fixedAnswer = this.fixEncoding(answer);
      
      const confirmationResponse = `He actualizado mi conocimiento. Ahora sé que "${fixedQuestion}" es "${fixedAnswer}".`;
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query,
        response: confirmationResponse,
        knowledgeId,
        confidence: 1.0
      });
      
      return {
        response: confirmationResponse,
        source: "learning",
        confidence: 1.0,
        knowledgeId
      };
      
    } else {
      // Añadir el nuevo conocimiento
      try {
        const newKnowledge = await KnowledgeModel.addKnowledge({
          query: question,
          response: answer,
          context: null,
          source: 'user',
          confidence: 0.95, // Alta confianza para conocimientos explícitos del usuario
          userId,
          isPublic: userId ? false : true // Solo públicos si no hay usuario
        });
        
        knowledgeId = newKnowledge.id;
      } catch (error) {
        logger.error('Error al añadir conocimiento en comando de aprendizaje:', error);
        return {
          response: "Lo siento, hubo un problema al guardar el conocimiento. Por favor, intenta nuevamente.",
          source: "error",
          confidence: 0
        };
      }
      
      // Corregir cualquier problema de codificación
      const fixedQuestion = this.fixEncoding(question);
      const fixedAnswer = this.fixEncoding(answer);
      
      const confirmationResponse = `¡Gracias! He aprendido que "${fixedQuestion}" es "${fixedAnswer}".`;
      
      // Registrar en el historial
      await this.logConversation({
        userId,
        query,
        response: confirmationResponse,
        knowledgeId,
        confidence: 1.0
      });
      
      return {
        response: confirmationResponse,
        source: "learning",
        confidence: 1.0,
        knowledgeId
      };
    }
  } catch (error) {
    logger.error('Error al procesar comando de aprendizaje:', error);
    return {
      response: "Lo siento, ocurrió un error al intentar aprender. Por favor, intenta de nuevo.",
      source: "error",
      confidence: 0
    };
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
   * Función para verificar si una respuesta web es relevante para la consulta
   * @param {string} query - Consulta original
   * @param {string} response - Respuesta a evaluar
   * @returns {boolean} - true si la respuesta es relevante
   */
  isWebResponseRelevant(query, response) {
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
      
      // Evaluación del tipo de consulta
      const isFactual = knowledgeResponseService.isFactualQuestion(query);
      
      // Reglas para determinar relevancia
      let isRelevant = false;
      
      if (isFactual) {
        // Preguntas factuales necesitan alta coincidencia o frase
        isRelevant = keywordMatchRatio >= 0.6 || (keywordMatchRatio >= 0.4 && phraseMatch);
      } else {
        // Otras consultas pueden ser más flexibles
        isRelevant = (keywordMatchRatio >= 0.4) || 
                     (keywordMatchRatio >= 0.3 && phraseMatch) ||
                     (keywordMatches.length >= 3);
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