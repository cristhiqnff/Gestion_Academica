'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

let db = null;

/**
 * Devuelve una única conexión reutilizable a la base de datos SQLite.
 * Activa las llaves foráneas y el modo WAL (mejor concurrencia en pruebas de carga).
 */
function obtenerDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.rutaBaseDatos), { recursive: true });

  db = new DatabaseSync(config.rutaBaseDatos);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  return db;
}

function cerrarDb() {
  if (!db) return;
  db.close();
  db = null;
}

/**
 * Ejecuta una función dentro de una transacción.
 * Si la función lanza un error, se revierte todo.
 */
function enTransaccion(fn) {
  const conexion = obtenerDb();
  conexion.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn(conexion);
    conexion.exec('COMMIT');
    return resultado;
  } catch (error) {
    try {
      conexion.exec('ROLLBACK');
    } catch {
      // Si el rollback falla, se propaga el error original.
    }
    throw error;
  }
}

module.exports = { obtenerDb, cerrarDb, enTransaccion };
