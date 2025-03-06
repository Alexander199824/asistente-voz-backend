const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
console.log('DB_HOST:', process.env.DB_HOST);
const { Pool } = require('pg');
const fs = require('fs');

console.log('Usando base de datos remota en Render. No se creará una nueva base de datos.');

async function initializeDatabase() {
  console.log('Inicializando estructura de base de datos en Render...');

  try {
    // Verificar variables de entorno
    console.log('Configuración de conexión:', {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL
    });

    // Configuración para la base de datos remota en Render
    const renderPool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10), // Convertir puerto a número
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    // Saltamos init.sql porque la estructura ya existe
    console.log('Saltando script de inicialización (init.sql) ya que la estructura ya existe...');

    // Solo cargamos los datos de seed.sql
    console.log('Cargando datos iniciales (seed.sql)...');
    try {
      const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
      await renderPool.query(seedSql);
      console.log('Datos iniciales cargados correctamente.');
    } catch (seedError) {
      console.warn('Advertencia al cargar datos iniciales:', seedError.message);
      console.log('Es posible que algunos datos ya existan, continuando...');
    }

    console.log('Base de datos inicializada correctamente.');
    await renderPool.end();
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    process.exit(1);
  }
}

// Ejecutar la función
initializeDatabase();