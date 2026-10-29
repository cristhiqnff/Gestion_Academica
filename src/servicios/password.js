'use strict';

const crypto = require('node:crypto');

const LONGITUD_CLAVE = 64;

/**
 * Genera un hash scrypt con sal aleatoria.
 * Formato almacenado: scrypt$<sal_hex>$<hash_hex>
 */
function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, sal, LONGITUD_CLAVE).toString('hex');
  return `scrypt$${sal}$${hash}`;
}

/**
 * Compara una contraseña en texto plano con el hash almacenado.
 * Usa timingSafeEqual para evitar ataques de temporización.
 */
function verificarPassword(password, almacenado) {
  if (typeof password !== 'string' || typeof almacenado !== 'string') return false;
  const partes = almacenado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

  const [, sal, hashGuardado] = partes;
  try {
    const hashCalculado = crypto.scryptSync(password, sal, LONGITUD_CLAVE);
    const hashEsperado = Buffer.from(hashGuardado, 'hex');
    if (hashCalculado.length !== hashEsperado.length) return false;
    return crypto.timingSafeEqual(hashCalculado, hashEsperado);
  } catch {
    return false;
  }
}

module.exports = { hashPassword, verificarPassword };
