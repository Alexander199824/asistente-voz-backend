-- Migración de base de datos para el Sistema de Asistente de Voz
-- Fecha: 15 de marzo de 2024
-- Versión: 1.0.0

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Modificar tabla knowledge_base para añadir campos de IA
ALTER TABLE knowledge_base 
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP DEFAULT NULL;

-- Actualizar índice para búsquedas de conocimiento
DROP INDEX IF EXISTS knowledge_query_idx;
CREATE INDEX knowledge_query_idx ON knowledge_base USING gin(query gin_trgm_ops);

-- Crear tabla para seguimiento de actualizaciones de conocimiento
CREATE TABLE IF NOT EXISTS knowledge_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  knowledge_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  previous_response TEXT NOT NULL,
  new_response TEXT NOT NULL,
  update_reason VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT knowledge_updates_knowledge_id_fk
    FOREIGN KEY (knowledge_id)
    REFERENCES knowledge_base(id)
    ON DELETE CASCADE
);

-- Crear índice para las actualizaciones de conocimiento
CREATE INDEX IF NOT EXISTS knowledge_updates_knowledge_id_idx 
ON knowledge_updates(knowledge_id);

-- Crear tabla de caché para IA
CREATE TABLE IF NOT EXISTS ia_cache (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,
  query_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  source VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(query_hash)
);

-- Crear índice para búsquedas rápidas en caché
CREATE INDEX IF NOT EXISTS query_hash_idx ON ia_cache(query_hash);

-- Añadir columna de rol a la tabla de usuarios
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Crear índice para búsquedas por rol
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

-- Crear usuario administrador por defecto
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin' LIMIT 1) THEN 
    -- Contraseña temporal (debe cambiarse después del primer inicio de sesión)
    -- Hash generado para la contraseña '123456'
    INSERT INTO users (
      username, 
      email, 
      password_hash, 
      role, 
      is_active
    ) VALUES (
      'admin',
      'admin@sistema.local',
      '$2a$10$vI8aWBnW3fID.ZQ4/zo1G.q1lRps.9cGLcZEiGDMVr5yUP1KUOYTa',
      'admin',
      true
    );
    
    -- Crear preferencias por defecto para el admin
    INSERT INTO user_preferences (user_id)
    SELECT id FROM users WHERE username = 'admin';
  END IF; 
END $$;

-- Asegurar columna is_ai_generated en knowledge_base
ALTER TABLE knowledge_base 
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT false;

-- Comentario final de migración
--COMMENT ON DATABASE current_database() IS 'Base de datos con soporte para generación de conocimiento por IA, seguimiento de actualizaciones y rol de usuario';