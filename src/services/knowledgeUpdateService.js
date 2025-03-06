const db = require('../config/database');
const AIService = require('./aiService');
const KnowledgeModel = require('../models/knowledgeModel');
const { logger, config } = require('../config');

/**
 * Servicio para actualización automática de conocimientos
 */
const KnowledgeUpdateService = {
  /**
   * Inicia el proceso de verificación automática de conocimientos
   * @param {number} intervalHours - Intervalo de verificación en horas
   */
  startAutomaticUpdates(intervalHours = 24) {
    if (!config.ai || !config.ai.enabled) {
      logger.info('Actualizaciones automáticas deshabilitadas: IA no está configurada');
      return;
    }

    // MODIFICACIÓN: No ejecutar inmediatamente al iniciar
    logger.info(`Actualizaciones automáticas programadas cada ${intervalHours} horas`);
    
    // Solo programar la verificación periódica, no ejecutar inmediatamente
    setInterval(() => {
      // Log que la verificación está iniciando pero no ejecutarla automáticamente
      logger.info('Intervalo de actualización automática alcanzado, pero la ejecución está deshabilitada para evitar exceder límites.');
      // this.verifyOutdatedKnowledge(); // Comentada para evitar ejecución automática
    }, intervalHours * 60 * 60 * 1000);
  },
  
  /**
   * Verifica y actualiza conocimientos potencialmente desactualizados
   */
  async verifyOutdatedKnowledge() {
    try {
      logger.info('Iniciando verificación de conocimientos desactualizados...');
      
      // Obtener conocimientos candidatos a actualización
      const candidates = await this.getUpdateCandidates();
      logger.info(`Se encontraron ${candidates.length} conocimientos para verificar`);
      
      // Procesar cada candidato en batches para no sobrecargar la API
      const batchSize = 5;
      
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        
        // Procesar en paralelo cada batch
        await Promise.all(
          batch.map(async (knowledge) => {
            try {
              await this.verifyAndUpdateKnowledge(knowledge);
              // Esperar un poco entre cada llamada a la API
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (itemError) {
              logger.error(`Error al verificar conocimiento ${knowledge.id}:`, itemError);
            }
          })
        );
        
        // Esperar entre batches
        if (i + batchSize < candidates.length) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      logger.info('Verificación de conocimientos completada');
    } catch (error) {
      logger.error('Error en proceso de verificación de conocimientos:', error);
    }
  },
  
  /**
   * Obtiene candidatos para actualización de conocimientos
   * @returns {Promise<Array>} - Lista de conocimientos a verificar
   */
  async getUpdateCandidates() {
    try {
      // Consulta para obtener conocimientos que:
      // 1. Son factuales (relacionados con política, eventos, etc.)
      // 2. No se han verificado recientemente
      // 3. Tienen buena confianza (para evitar verificar conocimientos de baja calidad)
      const query = `
        SELECT * FROM knowledge_base 
        WHERE (
          -- Consultas sobre presidentes, capitales, etc.
          query ILIKE '%presidente%' OR
          query ILIKE '%capital%' OR
          query ILIKE '%población%' OR
          query ILIKE '%moneda%' OR
          -- Consultas sobre eventos actuales
          query ILIKE '%actual%' OR
          query ILIKE '%reciente%' OR
          query ILIKE '%último%' OR
          query ILIKE '%último%'
        )
        AND (
          last_verified_at IS NULL OR
          last_verified_at < NOW() - INTERVAL '30 days'
        )
        AND confidence > 0.7
        ORDER BY 
          -- Priorizar por popularidad y antigüedad
          times_used DESC,
          updated_at ASC
        LIMIT 50;
      `;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error al obtener candidatos para actualización:', error);
      return [];
    }
  },
  
  /**
   * Verifica y actualiza un conocimiento específico
   * @param {Object} knowledge - Conocimiento a verificar
   * @returns {Promise<boolean>} - true si se actualizó
   */
  async verifyAndUpdateKnowledge(knowledge) {
    try {
      logger.info(`Verificando conocimiento: "${knowledge.query}"`);
      
      // Obtener respuesta actualizada de la IA
      const aiResult = await AIService.getAIResponse(knowledge.query);
      
      if (!aiResult || !aiResult.answer) {
        logger.warn(`No se pudo obtener respuesta actualizada para: "${knowledge.query}"`);
        
        // Actualizar timestamp de verificación aunque no haya cambios
        await db.query(
          'UPDATE knowledge_base SET last_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
          [knowledge.id]
        );
        
        return false;
      }
      
      // Comparar respuestas
      const currentResponse = knowledge.response;
      const newResponse = aiResult.answer;
      
      // Si la respuesta es la misma o muy similar, solo actualizar timestamp
      if (this.areResponsesSimilar(currentResponse, newResponse)) {
        logger.info(`El conocimiento "${knowledge.query}" sigue siendo actual`);
        
        await db.query(
          'UPDATE knowledge_base SET last_verified_at = CURRENT_TIMESTAMP WHERE id = $1',
          [knowledge.id]
        );
        
        return false;
      }
      
      // Si hay una diferencia significativa, registrar la actualización
      logger.info(`Actualizando conocimiento: "${knowledge.query}"`);
      
      // Registrar historial de cambios
      await db.query(
        `INSERT INTO knowledge_updates
         (knowledge_id, previous_response, new_response, update_reason, source)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          knowledge.id,
          currentResponse,
          newResponse,
          'Actualización automática',
          aiResult.source || 'IA'
        ]
      );
      
      // Actualizar el conocimiento
      await db.query(
        `UPDATE knowledge_base 
         SET response = $1, 
             updated_at = CURRENT_TIMESTAMP, 
             last_verified_at = CURRENT_TIMESTAMP,
             is_ai_generated = TRUE,
             ai_provider = $2
         WHERE id = $3`,
        [
          newResponse,
          aiResult.source || 'IA',
          knowledge.id
        ]
      );
      
      logger.info(`Conocimiento "${knowledge.query}" actualizado correctamente`);
      return true;
    } catch (error) {
      logger.error(`Error al verificar/actualizar conocimiento "${knowledge.query}":`, error);
      return false;
    }
  },
  
  /**
   * Compara dos respuestas para determinar si son similares
   * @param {string} response1 - Respuesta original
   * @param {string} response2 - Respuesta nueva
   * @returns {boolean} - true si son similares
   */
  areResponsesSimilar(response1, response2) {
    // Normalizar textos para comparación
    const normalize = text => text
      .toLowerCase()
      .replace(/[.,;:!?()]/g, '') // Eliminar signos de puntuación
      .replace(/\s+/g, ' ')       // Normalizar espacios
      .trim();
    
    const normalized1 = normalize(response1);
    const normalized2 = normalize(response2);
    
    // Calcular similitud básica de Jaccard entre conjuntos de palabras
    const words1 = new Set(normalized1.split(' '));
    const words2 = new Set(normalized2.split(' '));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    const similarity = intersection.size / union.size;
    
    // Consideramos similares si tienen al menos 80% de palabras en común
    return similarity >= 0.8;
  },
  
  /**
   * Ejecuta una actualización manual de todos los conocimientos factuales
   * @returns {Promise<Object>} - Resultados de la actualización
   */
  async runManualUpdate() {
    try {
      logger.info('Iniciando actualización manual de conocimientos...');
      
      // Obtener todos los conocimientos factuales sin límite
      const query = `
        SELECT * FROM knowledge_base 
        WHERE (
          query ILIKE '%presidente%' OR
          query ILIKE '%capital%' OR
          query ILIKE '%población%' OR
          query ILIKE '%moneda%' OR
          query ILIKE '%actual%' OR
          query ILIKE '%reciente%'
        )
        AND confidence > 0.6
        ORDER BY times_used DESC;
      `;
      
      const result = await db.query(query);
      const candidates = result.rows;
      
      logger.info(`Actualización manual: ${candidates.length} conocimientos a verificar`);
      
      // Estadísticas de resultados
      const stats = {
        total: candidates.length,
        updated: 0,
        failed: 0,
        unchanged: 0
      };
      
      // Procesar en batches más pequeños para actualización manual
      const batchSize = 3;
      
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        
        // Procesar secuencialmente para mejor control
        for (const knowledge of batch) {
          try {
            const updated = await this.verifyAndUpdateKnowledge(knowledge);
            if (updated) {
              stats.updated++;
            } else {
              stats.unchanged++;
            }
            
            // Esperar para no sobrecargar la API
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (itemError) {
            logger.error(`Error en actualización manual para "${knowledge.query}":`, itemError);
            stats.failed++;
          }
        }
        
        // Esperar más tiempo entre batches en actualizaciones manuales
        if (i + batchSize < candidates.length) {
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
      
      logger.info('Actualización manual completada', stats);
      return stats;
    } catch (error) {
      logger.error('Error en actualización manual:', error);
      throw error;
    }
  },

  /**
   * Ejecuta una actualización manual limitada de conocimientos
   * @param {number} limit - Límite de elementos a actualizar (por defecto 1)
   * @returns {Promise<Object>} - Resultados de la actualización
   */
  async runLimitedUpdate(limit = 1) {
    try {
      logger.info(`Iniciando actualización limitada de conocimientos (límite: ${limit})...`);
      
      // Obtener candidatos para actualización con el límite especificado
      const query = `
        SELECT * FROM knowledge_base 
        WHERE (
          -- Consultas sobre presidentes, capitales, etc.
          query ILIKE '%presidente%' OR
          query ILIKE '%capital%' OR
          query ILIKE '%población%' OR
          query ILIKE '%moneda%' OR
          -- Consultas sobre eventos actuales
          query ILIKE '%actual%' OR
          query ILIKE '%reciente%' OR
          query ILIKE '%último%' OR
          query ILIKE '%último%'
        )
        AND (
          last_verified_at IS NULL OR
          last_verified_at < NOW() - INTERVAL '30 days'
        )
        AND confidence > 0.7
        ORDER BY 
          -- Priorizar por popularidad y antigüedad
          times_used DESC,
          updated_at ASC
        LIMIT $1;
      `;
      
      const result = await db.query(query, [limit]);
      const candidates = result.rows;
      
      logger.info(`Actualización limitada: ${candidates.length} conocimientos a verificar`);
      
      // Estadísticas de resultados
      const stats = {
        total: candidates.length,
        updated: 0,
        failed: 0,
        unchanged: 0,
        details: []
      };
      
      // Procesar los candidatos
      for (const knowledge of candidates) {
        try {
          logger.info(`Verificando conocimiento: "${knowledge.query}"`);
          const updated = await this.verifyAndUpdateKnowledge(knowledge);
          
          if (updated) {
            stats.updated++;
            stats.details.push({
              id: knowledge.id,
              query: knowledge.query,
              result: 'updated'
            });
          } else {
            stats.unchanged++;
            stats.details.push({
              id: knowledge.id,
              query: knowledge.query,
              result: 'unchanged'
            });
          }
          
          // Esperar para no sobrecargar la API
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (itemError) {
          logger.error(`Error en actualización para "${knowledge.query}":`, itemError);
          stats.failed++;
          stats.details.push({
            id: knowledge.id,
            query: knowledge.query,
            result: 'error',
            error: itemError.message
          });
        }
      }
      
      logger.info('Actualización limitada completada', stats);
      return stats;
    } catch (error) {
      logger.error('Error en actualización limitada:', error);
      throw error;
    }
  }
};

module.exports = KnowledgeUpdateService;