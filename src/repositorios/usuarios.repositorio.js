'use strict';

const { obtenerDb } = require('../db/conexion');

/**
 * Busca un usuario por correo incluyendo el hash (solo para autenticar).
 */
function buscarPorEmail(email) {
  return obtenerDb()
    .prepare(
      `SELECT id, nombre, email, password_hash, rol, activo
         FROM usuarios
        WHERE email = ? COLLATE NOCASE`
    )
    .get(String(email || '').trim());
}

/**
 * Datos públicos del usuario (sin hash) para la sesión.
 */
function buscarPorId(id) {
  return obtenerDb()
    .prepare('SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = ?')
    .get(id);
}

/**
 * Obtiene el docente asociado a un usuario, si existe.
 */
function buscarDocentePorUsuario(usuarioId) {
  return obtenerDb()
    .prepare('SELECT id, nombres, apellidos FROM docentes WHERE usuario_id = ? AND activo = 1')
    .get(usuarioId);
}

module.exports = { buscarPorEmail, buscarPorId, buscarDocentePorUsuario };
