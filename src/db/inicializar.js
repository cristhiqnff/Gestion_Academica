'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { obtenerDb, cerrarDb } = require('./conexion');
const { sembrar } = require('./semilla');

/**
 * Indica si el archivo ya contiene una base inicializada de verdad.
 * No basta con que el archivo exista: el almacén de sesiones puede haber
 * creado un SQLite vacío. Se comprueba la tabla principal del esquema.
 */
function baseInicializada(db) {
  if (!fs.existsSync(config.rutaBaseDatos)) return false;

  const tabla = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'")
    .get();

  return Boolean(tabla);
}

/**
 * Crea la base de datos con el esquema y los datos de demostración solo si el
 * archivo no existe (o si existe pero está vacío, sin esquema). Si ya contiene
 * una base inicializada, no la toca.
 *
 * Este comportamiento es intencional para el despliegue gratuito en Render: el
 * disco es efímero y la base se recrea en cada arranque. En un entorno real con
 * datos persistentes habría que desactivar la siembra de demostración.
 */
function asegurarBaseDatos() {
  const db = obtenerDb();

  if (baseInicializada(db)) return { creada: false };

  const esquema = fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8');
  db.exec(esquema);
  sembrar(db);

  return { creada: true };
}

if (require.main === module) {
  try {
    const resultado = asegurarBaseDatos();
    console.log(
      resultado.creada
        ? `Base de datos creada en: ${config.rutaBaseDatos}`
        : `La base de datos ya existe: ${config.rutaBaseDatos}`
    );
    cerrarDb();
  } catch (error) {
    console.error('No fue posible inicializar la base de datos:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { asegurarBaseDatos };
