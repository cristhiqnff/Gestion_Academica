'use strict';

const { obtenerDb } = require('../db/conexion');

const TAMANOS_PAGINA = [5, 10, 20];

function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

function listar({ busqueda = '', estado = 'todos', docenteId = null, pagina = 1, porPagina = 10 } = {}) {
  const db = obtenerDb();
  const condiciones = [];
  const parametros = [];

  const texto = String(busqueda || '').trim();
  if (texto) {
    const patron = `%${escaparLike(texto)}%`;
    condiciones.push(
      `(a.codigo LIKE ? ESCAPE '\\' OR a.nombre LIKE ? ESCAPE '\\')`
    );
    parametros.push(patron, patron);
  }

  if (estado === 'activo' || estado === 'inactivo') {
    condiciones.push('a.activo = ?');
    parametros.push(estado === 'activo' ? 1 : 0);
  }

  const docente = Number(docenteId);
  if (Number.isInteger(docente) && docente > 0) {
    condiciones.push('a.docente_id = ?');
    parametros.push(docente);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM asignaturas a ${where}`)
    .get(...parametros).c;

  const tamano = TAMANOS_PAGINA.includes(Number(porPagina)) ? Number(porPagina) : 10;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const paginaActual = Math.min(Math.max(1, Number.parseInt(pagina, 10) || 1), totalPaginas);
  const desplazamiento = (paginaActual - 1) * tamano;

  const filas = db
    .prepare(
      `SELECT a.id, a.codigo, a.nombre, a.creditos, a.periodo, a.peso1, a.peso2, a.peso3,
              a.activo, a.docente_id,
              d.nombres || ' ' || d.apellidos AS docente_nombre,
              COUNT(m.id) AS matriculados
         FROM asignaturas a
         JOIN docentes d ON d.id = a.docente_id
         LEFT JOIN matriculas m ON m.asignatura_id = a.id
         ${where}
        GROUP BY a.id
        ORDER BY a.periodo DESC, a.codigo COLLATE NOCASE
        LIMIT ? OFFSET ?`
    )
    .all(...parametros, tamano, desplazamiento);

  return {
    filas,
    total,
    pagina: paginaActual,
    porPagina: tamano,
    totalPaginas,
    tamanosPagina: TAMANOS_PAGINA,
  };
}

function obtenerPorId(id) {
  return obtenerDb()
    .prepare(
      `SELECT a.*, d.nombres || ' ' || d.apellidos AS docente_nombre,
              d.email AS docente_email, d.activo AS docente_activo
         FROM asignaturas a
         JOIN docentes d ON d.id = a.docente_id
        WHERE a.id = ?`
    )
    .get(id);
}

function buscarPorCodigoPeriodo(codigo, periodo, excluirId = null) {
  const db = obtenerDb();
  if (excluirId) {
    return db
      .prepare(
        'SELECT id, codigo, periodo FROM asignaturas WHERE codigo = ? AND periodo = ? AND id <> ?'
      )
      .get(codigo, periodo, excluirId);
  }
  return db
    .prepare('SELECT id, codigo, periodo FROM asignaturas WHERE codigo = ? AND periodo = ?')
    .get(codigo, periodo);
}

function crear(datos) {
  const resultado = obtenerDb()
    .prepare(
      `INSERT INTO asignaturas
         (codigo, nombre, creditos, periodo, docente_id, peso1, peso2, peso3, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      datos.codigo,
      datos.nombre,
      datos.creditos,
      datos.periodo,
      datos.docente_id,
      datos.peso1,
      datos.peso2,
      datos.peso3
    );

  return Number(resultado.lastInsertRowid);
}

function actualizar(id, datos) {
  const resultado = obtenerDb()
    .prepare(
      `UPDATE asignaturas
          SET codigo = ?, nombre = ?, creditos = ?, periodo = ?, docente_id = ?,
              peso1 = ?, peso2 = ?, peso3 = ?
        WHERE id = ?`
    )
    .run(
      datos.codigo,
      datos.nombre,
      datos.creditos,
      datos.periodo,
      datos.docente_id,
      datos.peso1,
      datos.peso2,
      datos.peso3,
      id
    );

  return resultado.changes;
}

/**
 * Activa o inactiva la asignatura. Conserva matrículas y calificaciones.
 */
function cambiarEstado(id, activo) {
  const resultado = obtenerDb()
    .prepare('UPDATE asignaturas SET activo = ? WHERE id = ?')
    .run(activo ? 1 : 0, id);

  return resultado.changes;
}

function contarMatriculas(id) {
  return obtenerDb()
    .prepare('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = ?')
    .get(id).c;
}

/**
 * Matrículas de la asignatura con notas y definitiva calculada.
 * Las notas se administran desde el flujo de matrículas.
 */
function listarMatriculasDeAsignatura(id) {
  return obtenerDb()
    .prepare(
      `SELECT m.id AS matricula_id, e.documento,
              e.nombres || ' ' || e.apellidos AS estudiante,
              m.estado AS matricula_estado,
              c1.nota AS corte1,
              c2.nota AS corte2,
              c3.nota AS corte3,
              CASE WHEN c1.nota IS NOT NULL AND c2.nota IS NOT NULL AND c3.nota IS NOT NULL
                   THEN ROUND(c1.nota * a.peso1 / 100.0 + c2.nota * a.peso2 / 100.0 + c3.nota * a.peso3 / 100.0, 2)
                   ELSE NULL END AS definitiva,
              CASE WHEN c1.nota IS NULL OR c2.nota IS NULL OR c3.nota IS NULL THEN 'Pendiente'
                   WHEN (c1.nota * a.peso1 / 100.0 + c2.nota * a.peso2 / 100.0 + c3.nota * a.peso3 / 100.0) >= 3.0
                   THEN 'Aprobado' ELSE 'Reprobado' END AS estado
         FROM matriculas m
         JOIN estudiantes e ON e.id = m.estudiante_id
         JOIN asignaturas a ON a.id = m.asignatura_id
         LEFT JOIN calificaciones c1 ON c1.matricula_id = m.id AND c1.corte = 1
         LEFT JOIN calificaciones c2 ON c2.matricula_id = m.id AND c2.corte = 2
         LEFT JOIN calificaciones c3 ON c3.matricula_id = m.id AND c3.corte = 3
        WHERE m.asignatura_id = ?
        ORDER BY e.apellidos COLLATE NOCASE, e.nombres COLLATE NOCASE`
    )
    .all(id);
}

module.exports = {
  TAMANOS_PAGINA,
  listar,
  obtenerPorId,
  buscarPorCodigoPeriodo,
  crear,
  actualizar,
  cambiarEstado,
  contarMatriculas,
  listarMatriculasDeAsignatura,
};
