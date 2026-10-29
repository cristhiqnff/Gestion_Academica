'use strict';

const { obtenerDb } = require('../db/conexion');

const TAMANOS_PAGINA = [5, 10, 20];

const SELECT_MATRICULA = `
  SELECT m.id, m.estado, m.creado_en,
         m.estudiante_id, m.asignatura_id,
         e.documento AS estudiante_documento,
         e.nombres AS estudiante_nombres,
         e.apellidos AS estudiante_apellidos,
         e.email AS estudiante_email,
         e.programa AS estudiante_programa,
         e.activo AS estudiante_activo,
         a.codigo AS asignatura_codigo,
         a.nombre AS asignatura_nombre,
         a.periodo AS asignatura_periodo,
         a.creditos AS asignatura_creditos,
         a.activo AS asignatura_activo,
         a.peso1, a.peso2, a.peso3,
         a.docente_id,
         d.nombres || ' ' || d.apellidos AS docente_nombre,
         c1.nota AS corte1,
         c2.nota AS corte2,
         c3.nota AS corte3,
         (SELECT COUNT(*) FROM calificaciones c WHERE c.matricula_id = m.id) AS notas_registradas
    FROM matriculas m
    JOIN estudiantes e ON e.id = m.estudiante_id
    JOIN asignaturas a ON a.id = m.asignatura_id
    JOIN docentes d ON d.id = a.docente_id
    LEFT JOIN calificaciones c1 ON c1.matricula_id = m.id AND c1.corte = 1
    LEFT JOIN calificaciones c2 ON c2.matricula_id = m.id AND c2.corte = 2
    LEFT JOIN calificaciones c3 ON c3.matricula_id = m.id AND c3.corte = 3
`;

function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

/**
 * Lista matrículas con búsqueda, filtros y paginación.
 * Devuelve las notas crudas; la definitiva se calcula en el servicio.
 */
function listar({
  busqueda = '',
  estado = 'todos',
  estudianteId = null,
  asignaturaId = null,
  periodo = '',
  pagina = 1,
  porPagina = 10,
} = {}) {
  const db = obtenerDb();
  const condiciones = [];
  const parametros = [];

  const texto = String(busqueda || '').trim();
  if (texto) {
    const patron = `%${escaparLike(texto)}%`;
    condiciones.push(
      `(e.nombres LIKE ? ESCAPE '\\' OR e.apellidos LIKE ? ESCAPE '\\'
        OR e.documento LIKE ? ESCAPE '\\' OR a.codigo LIKE ? ESCAPE '\\'
        OR a.nombre LIKE ? ESCAPE '\\')`
    );
    parametros.push(patron, patron, patron, patron, patron);
  }

  if (estado === 'activa' || estado === 'retirada') {
    condiciones.push('m.estado = ?');
    parametros.push(estado);
  }

  const estudiante = Number(estudianteId);
  if (Number.isInteger(estudiante) && estudiante > 0) {
    condiciones.push('m.estudiante_id = ?');
    parametros.push(estudiante);
  }

  const asignatura = Number(asignaturaId);
  if (Number.isInteger(asignatura) && asignatura > 0) {
    condiciones.push('m.asignatura_id = ?');
    parametros.push(asignatura);
  }

  const periodoTexto = String(periodo || '').trim();
  if (periodoTexto) {
    condiciones.push('a.periodo = ?');
    parametros.push(periodoTexto);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM matriculas m
         JOIN estudiantes e ON e.id = m.estudiante_id
         JOIN asignaturas a ON a.id = m.asignatura_id
         ${where}`
    )
    .get(...parametros).c;

  const tamano = TAMANOS_PAGINA.includes(Number(porPagina)) ? Number(porPagina) : 10;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const paginaActual = Math.min(Math.max(1, Number.parseInt(pagina, 10) || 1), totalPaginas);
  const desplazamiento = (paginaActual - 1) * tamano;

  const filas = db
    .prepare(
      `${SELECT_MATRICULA}
       ${where}
       ORDER BY e.apellidos COLLATE NOCASE, e.nombres COLLATE NOCASE,
                a.periodo DESC, a.codigo COLLATE NOCASE
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
    .prepare(`${SELECT_MATRICULA} WHERE m.id = ?`)
    .get(id);
}

/**
 * Busca cualquier matrícula del estudiante en la asignatura, sin importar su estado.
 * El esquema impide duplicados incluso si la matrícula está retirada.
 */
function buscarDuplicado(estudianteId, asignaturaId) {
  return obtenerDb()
    .prepare(
      'SELECT id, estado FROM matriculas WHERE estudiante_id = ? AND asignatura_id = ?'
    )
    .get(estudianteId, asignaturaId);
}

function crear(estudianteId, asignaturaId) {
  const resultado = obtenerDb()
    .prepare(
      `INSERT INTO matriculas (estudiante_id, asignatura_id, estado)
       VALUES (?, ?, 'activa')`
    )
    .run(estudianteId, asignaturaId);

  return Number(resultado.lastInsertRowid);
}

/**
 * Cambia el estado lógico de la matrícula. No elimina notas ni relaciones.
 */
function cambiarEstado(id, estado) {
  const resultado = obtenerDb()
    .prepare('UPDATE matriculas SET estado = ? WHERE id = ?')
    .run(estado, id);

  return resultado.changes;
}

function listarEstudiantesSelector({ soloActivos = true } = {}) {
  const filtro = soloActivos ? 'WHERE activo = 1' : '';
  return obtenerDb()
    .prepare(
      `SELECT id, documento, nombres, apellidos, activo
         FROM estudiantes
         ${filtro}
        ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE`
    )
    .all();
}

function listarAsignaturasSelector({ soloActivas = true } = {}) {
  const filtro = soloActivas ? 'WHERE a.activo = 1' : '';
  return obtenerDb()
    .prepare(
      `SELECT a.id, a.codigo, a.nombre, a.periodo, a.activo,
              d.nombres || ' ' || d.apellidos AS docente_nombre
         FROM asignaturas a
         JOIN docentes d ON d.id = a.docente_id
         ${filtro}
        ORDER BY a.periodo DESC, a.codigo COLLATE NOCASE`
    )
    .all();
}

function listarPeriodos() {
  return obtenerDb()
    .prepare('SELECT DISTINCT periodo FROM asignaturas ORDER BY periodo DESC')
    .all()
    .map((fila) => fila.periodo);
}

module.exports = {
  TAMANOS_PAGINA,
  listar,
  obtenerPorId,
  buscarDuplicado,
  crear,
  cambiarEstado,
  listarEstudiantesSelector,
  listarAsignaturasSelector,
  listarPeriodos,
};
