'use strict';

const { obtenerDb } = require('../db/conexion');

const TAMANOS_PAGINA = [5, 10, 20];

function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

/**
 * Lista estudiantes con búsqueda, filtro por estado y paginación.
 * Todas las consultas son parametrizadas.
 */
function listar({ busqueda = '', estado = 'todos', pagina = 1, porPagina = 10 } = {}) {
  const db = obtenerDb();
  const condiciones = [];
  const parametros = [];

  const texto = String(busqueda || '').trim();
  if (texto) {
    const patron = `%${escaparLike(texto)}%`;
    condiciones.push(
      `(nombres LIKE ? ESCAPE '\\' OR apellidos LIKE ? ESCAPE '\\'
        OR documento LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')`
    );
    parametros.push(patron, patron, patron, patron);
  }

  if (estado === 'activo' || estado === 'inactivo') {
    condiciones.push('activo = ?');
    parametros.push(estado === 'activo' ? 1 : 0);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM estudiantes ${where}`)
    .get(...parametros).c;

  const tamano = TAMANOS_PAGINA.includes(Number(porPagina)) ? Number(porPagina) : 10;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const paginaActual = Math.min(Math.max(1, Number.parseInt(pagina, 10) || 1), totalPaginas);
  const desplazamiento = (paginaActual - 1) * tamano;

  const filas = db
    .prepare(
      `SELECT id, documento, nombres, apellidos, email, fecha_nacimiento,
              programa, semestre, activo, creado_en
         FROM estudiantes
         ${where}
        ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE
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
    .prepare('SELECT * FROM estudiantes WHERE id = ?')
    .get(id);
}

function buscarPorDocumento(documento, excluirId = null) {
  const db = obtenerDb();
  if (excluirId) {
    return db
      .prepare('SELECT id, documento FROM estudiantes WHERE documento = ? AND id <> ?')
      .get(documento, excluirId);
  }
  return db.prepare('SELECT id, documento FROM estudiantes WHERE documento = ?').get(documento);
}

function buscarPorEmail(email, excluirId = null) {
  const db = obtenerDb();
  if (excluirId) {
    return db
      .prepare('SELECT id, email FROM estudiantes WHERE email = ? COLLATE NOCASE AND id <> ?')
      .get(email, excluirId);
  }
  return db
    .prepare('SELECT id, email FROM estudiantes WHERE email = ? COLLATE NOCASE')
    .get(email);
}

function crear(datos) {
  const resultado = obtenerDb()
    .prepare(
      `INSERT INTO estudiantes
         (documento, nombres, apellidos, email, fecha_nacimiento, programa, semestre, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      datos.documento,
      datos.nombres,
      datos.apellidos,
      datos.email,
      datos.fecha_nacimiento,
      datos.programa,
      datos.semestre,
      datos.activo
    );

  return Number(resultado.lastInsertRowid);
}

function actualizar(id, datos) {
  const resultado = obtenerDb()
    .prepare(
      `UPDATE estudiantes
          SET documento = ?, nombres = ?, apellidos = ?, email = ?,
              fecha_nacimiento = ?, programa = ?, semestre = ?
        WHERE id = ?`
    )
    .run(
      datos.documento,
      datos.nombres,
      datos.apellidos,
      datos.email,
      datos.fecha_nacimiento,
      datos.programa,
      datos.semestre,
      id
    );

  return resultado.changes;
}

/**
 * Activa o inactiva lógicamente. No elimina matrículas ni calificaciones.
 */
function cambiarEstado(id, activo) {
  const resultado = obtenerDb()
    .prepare('UPDATE estudiantes SET activo = ? WHERE id = ?')
    .run(activo ? 1 : 0, id);

  return resultado.changes;
}

function listarProgramas() {
  return obtenerDb()
    .prepare(
      `SELECT DISTINCT programa FROM estudiantes
        WHERE programa IS NOT NULL AND TRIM(programa) <> ''
        ORDER BY programa COLLATE NOCASE`
    )
    .all()
    .map((fila) => fila.programa);
}

function contarDependencias(id) {
  const db = obtenerDb();
  const matriculas = db
    .prepare('SELECT COUNT(*) AS c FROM matriculas WHERE estudiante_id = ?')
    .get(id).c;
  const calificaciones = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM calificaciones c
         JOIN matriculas m ON m.id = c.matricula_id
        WHERE m.estudiante_id = ?`
    )
    .get(id).c;

  return { matriculas, calificaciones };
}

/**
 * Historial académico del estudiante con definitiva calculada según los pesos.
 */
function listarHistorialAcademico(id) {
  return obtenerDb()
    .prepare(
      `SELECT m.id AS matricula_id,
              m.estado AS matricula_estado,
              a.codigo,
              a.nombre AS asignatura,
              a.periodo,
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
         JOIN asignaturas a ON a.id = m.asignatura_id
         LEFT JOIN calificaciones c1 ON c1.matricula_id = m.id AND c1.corte = 1
         LEFT JOIN calificaciones c2 ON c2.matricula_id = m.id AND c2.corte = 2
         LEFT JOIN calificaciones c3 ON c3.matricula_id = m.id AND c3.corte = 3
        WHERE m.estudiante_id = ?
        ORDER BY a.periodo DESC, a.codigo COLLATE NOCASE`
    )
    .all(id);
}

module.exports = {
  TAMANOS_PAGINA,
  listar,
  obtenerPorId,
  buscarPorDocumento,
  buscarPorEmail,
  crear,
  actualizar,
  cambiarEstado,
  listarProgramas,
  contarDependencias,
  listarHistorialAcademico,
};
