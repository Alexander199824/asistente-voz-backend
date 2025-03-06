const db = require('../config/database');
const { logger } = require('../config');
const bcrypt = require('bcrypt');

// Modelo para gestión de usuarios
const UserModel = {
  /**
   * Crea un nuevo usuario
   * @param {Object} user - Datos del usuario
   * @returns {Promise<Object>} - Usuario creado
   */
  async createUser({ username, email, password }) {
    const client = await db.getClient();
    
    try {
      // Iniciar transacción
      await client.query('BEGIN');
      
      // Generar hash de la contraseña
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Insertar usuario
      const userQuery = `
        INSERT INTO users (username, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, username, email, is_active, created_at;
      `;
      
      const userResult = await client.query(userQuery, [
        username,
        email.toLowerCase(),
        passwordHash
      ]);
      
      // Crear preferencias por defecto
      const prefsQuery = `
        INSERT INTO user_preferences (user_id)
        VALUES ($1)
        RETURNING *;
      `;
      
      await client.query(prefsQuery, [userResult.rows[0].id]);
      
      // Confirmar transacción
      await client.query('COMMIT');
      
      logger.info(`Nuevo usuario creado: ${username} (${email})`);
      return userResult.rows[0];
    } catch (error) {
      // Revertir en caso de error
      await client.query('ROLLBACK');
      logger.error('Error al crear usuario:', error);
      throw error;
    } finally {
      // Liberar el cliente
      client.release();
    }
  },
  
  /**
   * Busca un usuario por su ID
   * @param {string} id - ID del usuario
   * @returns {Promise<Object>} - Usuario encontrado
   */
  async getUserById(id) {
    try {
      const query = `
        SELECT id, username, email, is_active, created_at, updated_at
        FROM users
        WHERE id = $1;
      `;
      
      const result = await db.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error al buscar usuario por ID ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Busca un usuario por su nombre de usuario o email
   * @param {string} identifier - Nombre de usuario o email
   * @returns {Promise<Object>} - Usuario encontrado
   */
  async getUserByIdentifier(identifier) {
    try {
      const query = `
        SELECT id, username, email, password_hash, is_active, created_at, updated_at
        FROM users
        WHERE username = $1 OR email = $1;
      `;
      
      const result = await db.query(query, [identifier.toLowerCase()]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error al buscar usuario por identificador ${identifier}:`, error);
      throw error;
    }
  },
  
  /**
   * Actualiza datos de un usuario
   * @param {string} id - ID del usuario
   * @param {Object} updates - Datos a actualizar
   * @returns {Promise<Object>} - Usuario actualizado
   */
  async updateUser(id, { username, email, password, is_active }) {
    try {
      let updateFields = [];
      let queryParams = [];
      let paramCounter = 1;
      
      // Construir dinámicamente la consulta según los campos proporcionados
      if (username) {
        updateFields.push(`username = $${paramCounter}`);
        queryParams.push(username);
        paramCounter++;
      }
      
      if (email) {
        updateFields.push(`email = $${paramCounter}`);
        queryParams.push(email.toLowerCase());
        paramCounter++;
      }
      
      if (password) {
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        updateFields.push(`password_hash = $${paramCounter}`);
        queryParams.push(passwordHash);
        paramCounter++;
      }
      
      if (is_active !== undefined) {
        updateFields.push(`is_active = $${paramCounter}`);
        queryParams.push(is_active);
        paramCounter++;
      }
      
      // Si no hay campos para actualizar, retornar
      if (updateFields.length === 0) {
        return await this.getUserById(id);
      }
      
      // Añadir ID al final de los parámetros
      queryParams.push(id);
      
      const query = `
        UPDATE users
        SET ${updateFields.join(', ')}
        WHERE id = $${paramCounter}
        RETURNING id, username, email, is_active, created_at, updated_at;
      `;
      
      const result = await db.query(query, queryParams);
      logger.info(`Usuario ${id} actualizado`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error al actualizar usuario ${id}:`, error);
      throw error;
    }
  },
  
  /**
   * Actualiza las preferencias de un usuario
   * @param {string} userId - ID del usuario
   * @param {Object} preferences - Preferencias a actualizar
   * @returns {Promise<Object>} - Preferencias actualizadas
   */
  async updatePreferences(userId, { voice_type, voice_speed, wake_word, theme }) {
    try {
      let updateFields = [];
      let queryParams = [];
      let paramCounter = 1;
      
      // Construir dinámicamente la consulta según los campos proporcionados
      if (voice_type) {
        updateFields.push(`voice_type = $${paramCounter}`);
        queryParams.push(voice_type);
        paramCounter++;
      }
      
      if (voice_speed !== undefined) {
        updateFields.push(`voice_speed = $${paramCounter}`);
        queryParams.push(voice_speed);
        paramCounter++;
      }
      
      if (wake_word) {
        updateFields.push(`wake_word = $${paramCounter}`);
        queryParams.push(wake_word);
        paramCounter++;
      }
      
      if (theme) {
        updateFields.push(`theme = $${paramCounter}`);
        queryParams.push(theme);
        paramCounter++;
      }
      
      // Si no hay campos para actualizar, retornar preferencias actuales
      if (updateFields.length === 0) {
        const currentPrefs = await db.query(
          'SELECT * FROM user_preferences WHERE user_id = $1',
          [userId]
        );
        return currentPrefs.rows[0];
      }
      
      // Añadir ID al final de los parámetros
      queryParams.push(userId);
      
      const query = `
        UPDATE user_preferences
        SET ${updateFields.join(', ')}
        WHERE user_id = $${paramCounter}
        RETURNING *;
      `;
      
      const result = await db.query(query, queryParams);
      
      if (result.rows.length === 0) {
        // Si no existe registro de preferencias, crear uno nuevo
        const insertQuery = `
          INSERT INTO user_preferences (user_id, voice_type, voice_speed, wake_word, theme)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *;
        `;
        
        const defaultPrefs = {
          voice_type: voice_type || 'standard',
          voice_speed: voice_speed || 1.0,
          wake_word: wake_word || 'asistente',
          theme: theme || 'light'
        };
        
        const insertResult = await db.query(insertQuery, [
          userId,
          defaultPrefs.voice_type,
          defaultPrefs.voice_speed,
          defaultPrefs.wake_word,
          defaultPrefs.theme
        ]);
        
        return insertResult.rows[0];
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error(`Error al actualizar preferencias para usuario ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Obtiene las preferencias de un usuario
   * @param {string} userId - ID del usuario
   * @returns {Promise<Object>} - Preferencias del usuario
   */
  async getPreferences(userId) {
    try {
      const query = 'SELECT * FROM user_preferences WHERE user_id = $1';
      const result = await db.query(query, [userId]);
      
      if (result.rows.length === 0) {
        // Si no hay preferencias, crear con valores por defecto
        const insertQuery = `
          INSERT INTO user_preferences (user_id)
          VALUES ($1)
          RETURNING *;
        `;
        
        const insertResult = await db.query(insertQuery, [userId]);
        return insertResult.rows[0];
      }
      
      return result.rows[0];
    } catch (error) {
      logger.error(`Error al obtener preferencias para usuario ${userId}:`, error);
      throw error;
    }
  },
  
  /**
   * Verifica las credenciales de un usuario
   * @param {string} identifier - Nombre de usuario o email
   * @param {string} password - Contraseña a verificar
   * @returns {Promise<Object|null>} - Usuario si las credenciales son correctas, null en caso contrario
   */
  async verifyCredentials(identifier, password) {
    try {
      const user = await this.getUserByIdentifier(identifier);
      
      if (!user || !user.is_active) {
        return null;
      }
      
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isPasswordValid) {
        return null;
      }
      
      // No devolver el hash de la contraseña
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } catch (error) {
      logger.error(`Error al verificar credenciales para ${identifier}:`, error);
      throw error;
    }
  }
};

module.exports = UserModel;