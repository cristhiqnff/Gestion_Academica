'use strict';

const { obtenerDb } = require('../db/conexion');

/**
 * Asignaturas asignadas a un docente, con el número de estudiantes matriculados.
 */
function listarAsignaturasPorDocente(docenteId) {
  return obtenerDb()
    .prepare(
      `SELECT a.id, a.codigo, a.nombre, a.periodo, a.creditos,
              ROUND(a.peso1, 2) AS peso1, ROUND(a.peso2, 2) AS peso2, ROUND(a.peso3, 2) AS peso3,
              COUNT(m.id) AS matriculados
         FROM asignaturas a
         LEFT JOIN matriculas m ON m.asignatura_id = a.id AND m.estado = 'activa'
        WHERE a.docente_id = ? AND a.activo = 1
        GROUP BY a.id
        ORDER BY a.codigo`
    )
    .all(docenteId);
}

module.exports = { listarAsignaturasPorDocente };
