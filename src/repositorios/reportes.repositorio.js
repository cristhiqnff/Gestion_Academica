'use strict';

const { obtenerDb } = require('../db/conexion');

/**
 * Proyección común para reportes: una fila por matrícula con las notas crudas.
 * La definitiva y el estado se calculan después en `servicios/reportes.js`,
 * nunca en SQL, para no duplicar la regla académica.
 */
const SELECT_REPORTE = `
  SELECT m.id AS matricula_id,
         m.estado AS matricula_estado,
         e.id AS estudiante_id,
         e.documento,
         e.nombres AS estudiante_nombres,
         e.apellidos AS estudiante_apellidos,
         e.programa,
         e.activo AS estudiante_activo,
         a.id AS asignatura_id,
         a.codigo,
         a.nombre AS asignatura_nombre,
         a.periodo,
         a.creditos,
         a.peso1, a.peso2, a.peso3,
         a.docente_id,
         d.nombres || ' ' || d.apellidos AS docente_nombre,
         c1.nota AS corte1,
         c2.nota AS corte2,
         c3.nota AS corte3
    FROM matriculas m
    JOIN estudiantes e ON e.id = m.estudiante_id
    JOIN asignaturas a ON a.id = m.asignatura_id
    JOIN docentes d ON d.id = a.docente_id
    LEFT JOIN calificaciones c1 ON c1.matricula_id = m.id AND c1.corte = 1
    LEFT JOIN calificaciones c2 ON c2.matricula_id = m.id AND c2.corte = 2
    LEFT JOIN calificaciones c3 ON c3.matricula_id = m.id AND c3.corte = 3
`;

const ORDEN = `
  ORDER BY a.periodo DESC, a.codigo COLLATE NOCASE,
           e.apellidos COLLATE NOCASE, e.nombres COLLATE NOCASE
`;

/**
 * Todas las matrículas visibles para un reporte. Si se indica `docenteId`,
 * se limita a las asignaturas de ese docente.
 */
function listarFilas({ docenteId = null } = {}) {
  const docente = Number(docenteId);
  if (Number.isInteger(docente) && docente > 0) {
    return obtenerDb()
      .prepare(`${SELECT_REPORTE} WHERE a.docente_id = ? ${ORDEN}`)
      .all(docente);
  }

  return obtenerDb().prepare(`${SELECT_REPORTE} ${ORDEN}`).all();
}

function listarFilasDeAsignatura(asignaturaId) {
  return obtenerDb()
    .prepare(`${SELECT_REPORTE} WHERE a.id = ? ${ORDEN}`)
    .all(asignaturaId);
}

function listarFilasDeEstudiante(estudianteId) {
  return obtenerDb()
    .prepare(`${SELECT_REPORTE} WHERE e.id = ? ${ORDEN}`)
    .all(estudianteId);
}

function listarEstudiantes() {
  return obtenerDb()
    .prepare(
      `SELECT id, documento, nombres, apellidos, programa, activo
         FROM estudiantes
        ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE`
    )
    .all();
}

module.exports = {
  listarFilas,
  listarFilasDeAsignatura,
  listarFilasDeEstudiante,
  listarEstudiantes,
};
