'use strict';

const { obtenerDb } = require('../db/conexion');

function contar(sql) {
  return obtenerDb().prepare(sql).get().c;
}

/**
 * Resumen para el panel de control.
 */
function obtenerResumen() {
  return {
    estudiantesActivos: contar('SELECT COUNT(*) AS c FROM estudiantes WHERE activo = 1'),
    docentesActivos: contar('SELECT COUNT(*) AS c FROM docentes WHERE activo = 1'),
    asignaturasActivas: contar('SELECT COUNT(*) AS c FROM asignaturas WHERE activo = 1'),
    matriculasActivas: contar("SELECT COUNT(*) AS c FROM matriculas WHERE estado = 'activa'"),
    calificacionesRegistradas: contar('SELECT COUNT(*) AS c FROM calificaciones'),
    notasPendientes: contar(
      `SELECT COUNT(*) AS c FROM matriculas m
        WHERE (SELECT COUNT(*) FROM calificaciones c WHERE c.matricula_id = m.id) < 3`
    ),
  };
}

module.exports = { obtenerResumen };
