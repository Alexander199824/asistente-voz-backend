-- Insertar categorías de conocimiento predefinidas
INSERT INTO knowledge_categories (name, description)
VALUES 
    ('General', 'Conocimientos generales y respuestas comunes'),
    ('Tecnología', 'Información sobre tecnología y computación'),
    ('Ciencia', 'Información científica y datos'),
    ('Matemáticas', 'Operaciones y conceptos matemáticos'),
    ('Comandos', 'Comandos específicos del sistema'),
    ('Personal', 'Información personalizada del usuario')
ON CONFLICT (name) DO NOTHING;

-- Insertar conocimientos base iniciales
INSERT INTO knowledge_base (query, response, context, source, confidence, is_verified, is_public)
VALUES
    ('¿Cómo te llamas?', 'Soy tu asistente de voz inteligente. Puedes llamarme Asistente.', 'identidad', 'system', 1.0, true, true),
    ('Hola', 'Hola, ¿en qué puedo ayudarte hoy?', 'saludo', 'system', 1.0, true, true),
    ('Buenos días', 'Buenos días, ¿cómo puedo asistirte?', 'saludo', 'system', 1.0, true, true),
    ('Buenas tardes', 'Buenas tardes, estoy aquí para ayudarte.', 'saludo', 'system', 1.0, true, true),
    ('Buenas noches', 'Buenas noches, ¿necesitas algo antes de terminar el día?', 'saludo', 'system', 1.0, true, true),
    ('Gracias', 'De nada. Estoy aquí para ayudarte.', 'agradecimiento', 'system', 1.0, true, true),
    ('Adiós', 'Hasta luego. Estaré aquí cuando me necesites.', 'despedida', 'system', 1.0, true, true),
    ('¿Qué hora es?', 'Lo siento, necesito acceder a tu sistema para darte la hora actual.', 'tiempo', 'system', 1.0, true, true),
    ('¿Qué puedes hacer?', 'Puedo responder preguntas, aprender nuevas respuestas, buscar información en la web, y ayudarte con varias tareas. Simplemente pregúntame lo que necesites.', 'capacidades', 'system', 1.0, true, true),
    ('Aprende que', 'Para enseñarme algo nuevo, di "aprende que" seguido de la pregunta y respuesta. Por ejemplo: "aprende que mi color favorito es azul".', 'aprendizaje', 'system', 1.0, true, true)
ON CONFLICT DO NOTHING;

-- Insertar fuentes externas predefinidas
INSERT INTO external_sources (name, url, source_type, priority)
VALUES
    ('Wikipedia', 'https://es.wikipedia.org/api/rest_v1/', 'api', 8),
    ('Google', 'https://www.google.com/search', 'web', 7),
    ('DuckDuckGo', 'https://api.duckduckgo.com/', 'api', 6)
ON CONFLICT DO NOTHING;

-- Insertar un usuario de prueba (contraseña: test123)
INSERT INTO users (username, email, password_hash)
VALUES ('usuario_prueba', 'prueba@ejemplo.com', '$2b$10$K8ZpdrjJLfk6UUXJOzpV4OZUiSHL8.2W1gxtfQimx.9QvJEBxz1Uu')
ON CONFLICT DO NOTHING;

-- Configuración para el usuario de prueba
WITH u AS (SELECT id FROM users WHERE username = 'usuario_prueba')
INSERT INTO user_preferences (user_id, wake_word)
SELECT u.id, 'asistente' FROM u
ON CONFLICT DO NOTHING;