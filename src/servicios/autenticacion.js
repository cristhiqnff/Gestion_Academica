'use strict';

const usuariosRepositorio = require('../repositorios/usuarios.repositorio');
const { verificarPassword, hashPassword } = require('./password');

/**
 * Hash ficticio con el que se compara cuando el correo no existe.
 * Evita que el tiempo de respuesta revele si un usuario está registrado.
 */
const HASH_FICTICIO = hashPassword('usuario-inexistente-123');

/**
 * Autentica un usuario.
 * Devuelve datos públicos (sin contraseña ni hash) o null si falla.
 * El mensaje que se muestre al usuario siempre debe ser genérico.
 */
function autenticar(email, password) {
  const usuario = usuariosRepositorio.buscarPorEmail(email);
  const hash = usuario ? usuario.password_hash : HASH_FICTICIO;
  const coincide = verificarPassword(String(password || ''), hash);

  if (!usuario || !coincide || !usuario.activo) return null;

  const docente = usuario.rol === 'docente'
    ? usuariosRepositorio.buscarDocentePorUsuario(usuario.id)
    : null;

  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    docenteId: docente ? docente.id : null,
  };
}

module.exports = { autenticar };
