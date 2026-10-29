'use strict';

const { obtenerDb, enTransaccion } = require('../db/conexion');

const TAMANOS_PAGINA = [5, 10, 20];

function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

function listar({ busqueda = '', estado = 'todos', pagina = 1, porPagina = 10 } = {}) {
  const db = obtenerDb();
  const condiciones = [];
  const parametros = [];

  const texto = String(busqueda || '').trim();
  if (texto) {
    const patron = `%${escaparLike(texto)}%`;
    condiciones.push(
      `(d.nombres LIKE ? ESCAPE '\\' OR d.apellidos LIKE ? ESCAPE '\\'
        OR d.documento LIKE ? ESCAPE '\\' OR d.email LIKE ? ESCAPE '\\')`
    );
    parametros.push(patron, patron, patron, patron);
  }

  if (estado === 'activo' || estado === 'inactivo') {
    condiciones.push('d.activo = ?');
    parametros.push(estado === 'activo' ? 1 : 0);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM docentes d ${where}`)
    .get(...parametros).c;

  const tamano = TAMANOS_PAGINA.includes(Number(porPagina)) ? Number(porPagina) : 10;
  const totalPaginas = Math.max(1, Math.ceil(total / tamano));
  const paginaActual = Math.min(Math.max(1, Number.parseInt(pagina, 10) || 1), totalPaginas);
  const desplazamiento = (paginaActual - 1) * tamano;

  const filas = db
    .prepare(
      `SELECT d.id, d.documento, d.nombres, d.apellidos, d.email, d.telefono,
              d.especialidad, d.usuario_id, d.activo, d.creado_en,
              u.email AS usuario_email, u.activo AS usuario_activo,
              (SELECT COUNT(*) FROM asignaturas a WHERE a.docente_id = d.id) AS asignaturas
         FROM docentes d
         LEFT JOIN usuarios u ON u.id = d.usuario_id
         ${where}
        ORDER BY d.apellidos COLLATE NOCASE, d.nombres COLLATE NOCASE
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
      `SELECT d.*, u.email AS usuario_email, u.activo AS usuario_activo, u.rol AS usuario_rol
         FROM docentes d
         LEFT JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.id = ?`
    )
    .get(id);
}

function buscarPorDocumento(documento, excluirId = null) {
  const db = obtenerDb();
  if (excluirId) {
    return db
      .prepare('SELECT id, documento FROM docentes WHERE documento = ? AND id <> ?')
      .get(documento, excluirId);
  }
  return db.prepare('SELECT id, documento FROM docentes WHERE documento = ?').get(documento);
}

function buscarPorEmail(email, excluirId = null) {
  const db = obtenerDb();
  if (excluirId) {
    return db
      .prepare('SELECT id, email FROM docentes WHERE email = ? COLLATE NOCASE AND id <> ?')
      .get(email, excluirId);
  }
  return db.prepare('SELECT id, email FROM docentes WHERE email = ? COLLATE NOCASE').get(email);
}

/**
 * Verifica si un correo ya pertenece a otra cuenta de usuario.
 */
function buscarUsuarioPorEmail(email, excluirUsuarioId = null) {
  const db = obtenerDb();
  if (excluirUsuarioId) {
    return db
      .prepare('SELECT id, email FROM usuarios WHERE email = ? COLLATE NOCASE AND id <> ?')
      .get(email, excluirUsuarioId);
  }
  return db.prepare('SELECT id, email FROM usuarios WHERE email = ? COLLATE NOCASE').get(email);
}

/**
 * Crea el docente y, si se recibe passwordHash, su cuenta de acceso.
 * Todo ocurre en una transacción.
 */
function crear(datos, passwordHash = null) {
  return enTransaccion((db) => {
    let usuarioId = null;

    if (passwordHash) {
      const usuario = db
        .prepare(
          `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
           VALUES (?, ?, ?, 'docente', 1)`
        )
        .run(`${datos.nombres} ${datos.apellidos}`, datos.email, passwordHash);
      usuarioId = Number(usuario.lastInsertRowid);
    }

    const docente = db
      .prepare(
        `INSERT INTO docentes
           (documento, nombres, apellidos, email, telefono, especialidad, usuario_id, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        datos.documento,
        datos.nombres,
        datos.apellidos,
        datos.email,
        datos.telefono,
        datos.especialidad,
        usuarioId
      );

    return Number(docente.lastInsertRowid);
  });
}

/**
 * Actualiza el docente. Mantiene la cuenta existente (sin duplicarla),
 * sincroniza nombre/correo y permite cambiar la contraseña si se indica.
 */
function actualizar(id, datos, opciones = {}) {
  return enTransaccion((db) => {
    const actual = db.prepare('SELECT usuario_id FROM docentes WHERE id = ?').get(id);
    if (!actual) return 0;

    let usuarioId = actual.usuario_id;
    const nombreCompleto = `${datos.nombres} ${datos.apellidos}`;

    if (usuarioId) {
      db.prepare('UPDATE usuarios SET nombre = ?, email = ? WHERE id = ?').run(
        nombreCompleto,
        datos.email,
        usuarioId
      );
      if (opciones.passwordHash) {
        db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(
          opciones.passwordHash,
          usuarioId
        );
      }
    } else if (opciones.crearCuenta && opciones.passwordHash) {
      const usuario = db
        .prepare(
          `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
           VALUES (?, ?, ?, 'docente', ?)`
        )
        .run(nombreCompleto, datos.email, opciones.passwordHash, datos.activo ?? 1);
      usuarioId = Number(usuario.lastInsertRowid);
    }

    const resultado = db
      .prepare(
        `UPDATE docentes
            SET documento = ?, nombres = ?, apellidos = ?, email = ?,
                telefono = ?, especialidad = ?, usuario_id = ?
          WHERE id = ?`
      )
      .run(
        datos.documento,
        datos.nombres,
        datos.apellidos,
        datos.email,
        datos.telefono,
        datos.especialidad,
        usuarioId,
        id
      );

    return resultado.changes;
  });
}

/**
 * Activa o inactiva el docente y su cuenta de acceso asociada.
 * No elimina asignaturas, matrículas ni calificaciones.
 */
function cambiarEstado(id, activo) {
  return enTransaccion((db) => {
    const docente = db.prepare('SELECT usuario_id FROM docentes WHERE id = ?').get(id);
    if (!docente) return 0;

    const resultado = db
      .prepare('UPDATE docentes SET activo = ? WHERE id = ?')
      .run(activo ? 1 : 0, id);

    if (docente.usuario_id) {
      db.prepare('UPDATE usuarios SET activo = ? WHERE id = ?').run(activo ? 1 : 0, docente.usuario_id);
    }

    return resultado.changes;
  });
}

function contarAsignaturas(id) {
  return obtenerDb()
    .prepare('SELECT COUNT(*) AS c FROM asignaturas WHERE docente_id = ?')
    .get(id).c;
}

function listarAsignaturas(id) {
  return obtenerDb()
    .prepare(
      `SELECT a.id, a.codigo, a.nombre, a.periodo, a.creditos, a.activo,
              a.peso1, a.peso2, a.peso3,
              COUNT(m.id) AS matriculados
         FROM asignaturas a
         LEFT JOIN matriculas m ON m.asignatura_id = a.id
        WHERE a.docente_id = ?
        GROUP BY a.id
        ORDER BY a.periodo DESC, a.codigo COLLATE NOCASE`
    )
    .all(id);
}

/**
 * Docentes para selectores (filtros y formularios), sin datos sensibles.
 */
function listarTodos() {
  return obtenerDb()
    .prepare(
      `SELECT id, documento, nombres, apellidos, email, activo
         FROM docentes
        ORDER BY apellidos COLLATE NOCASE, nombres COLLATE NOCASE`
    )
    .all();
}

module.exports = {
  TAMANOS_PAGINA,
  listar,
  obtenerPorId,
  buscarPorDocumento,
  buscarPorEmail,
  buscarUsuarioPorEmail,
  crear,
  actualizar,
  cambiarEstado,
  contarAsignaturas,
  listarAsignaturas,
  listarTodos,
};
