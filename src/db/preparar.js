'use strict';

const fs = require('node:fs');
const path = require('node:path');
const config = require('../config');
const { obtenerDb, cerrarDb } = require('./conexion');
const { sembrar } = require('./semilla');

/**
 * Borra la base de datos existente y la vuelve a crear desde cero.
 * Uso: npm run db:preparar
 */
function prepararDesdeCero() {
  for (const sufijo of ['', '-wal', '-shm']) {
    const archivo = config.rutaBaseDatos + sufijo;
    if (fs.existsSync(archivo)) fs.rmSync(archivo);
  }

  const db = obtenerDb();
  const esquema = fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8');

  db.exec(esquema);
  sembrar(db);

  const tablas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((fila) => fila.name);

  console.log('Base de datos creada correctamente en:', config.rutaBaseDatos);
  console.log('Tablas creadas:', tablas.join(', '));
  cerrarDb();
}

try {
  prepararDesdeCero();
} catch (error) {
  console.error('Error al preparar la base de datos:', error.message);
  console.error(error.stack);
  process.exitCode = 1;
}
