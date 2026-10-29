'use strict';

const { obtenerDb, enTransaccion } = require('../db/conexion');

/**
 * Devuelve las notas de una matrícula con la forma { corte1, corte2, corte3 }.
 * Un corte sin fila en la base de datos es una nota pendiente (null).
 */
function obtenerPorMatricula(matriculaId) {
  const filas = obtenerDb()
    .prepare('SELECT corte, nota FROM calificaciones WHERE matricula_id = ? ORDER BY corte')
    .all(matriculaId);

  const notas = { corte1: null, corte2: null, corte3: null };
  for (const fila of filas) {
    notas[`corte${fila.corte}`] = fila.nota;
  }
  return notas;
}

/**
 * Guarda las notas indicadas en una transacción.
 * - Un corte ausente del objeto no se modifica.
 * - Un corte con valor null elimina su fila (nota ausente/pendiente).
 * - Un corte con número hace INSERT o UPDATE.
 */
function guardar(matriculaId, datos) {
  return enTransaccion((db) => {
    const eliminar = db.prepare(
      'DELETE FROM calificaciones WHERE matricula_id = ? AND corte = ?'
    );
    const guardarNota = db.prepare(
      `INSERT INTO calificaciones (matricula_id, corte, nota, actualizado_en)
       VALUES (?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT (matricula_id, corte)
       DO UPDATE SET nota = excluded.nota,
                     actualizado_en = datetime('now', 'localtime')`
    );

    for (const corte of [1, 2, 3]) {
      if (!Object.prototype.hasOwnProperty.call(datos, corte)) continue;

      const nota = datos[corte];
      if (nota === null) {
        eliminar.run(matriculaId, corte);
      } else {
        guardarNota.run(matriculaId, corte, nota);
      }
    }
  });
}

function contarPorMatricula(matriculaId) {
  return obtenerDb()
    .prepare('SELECT COUNT(*) AS c FROM calificaciones WHERE matricula_id = ?')
    .get(matriculaId).c;
}

module.exports = { obtenerPorMatricula, guardar, contarPorMatricula };
