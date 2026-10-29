'use strict';

const path = require('node:path');

const entorno = process.env.NODE_ENV || 'development';
const raiz = path.resolve(__dirname, '..');

function obtenerSecreto(entornoActual) {
  const secreto = String(process.env.SESSION_SECRET || '').trim();

  if (entornoActual === 'production' && !secreto) {
    throw new Error(
      'SESSION_SECRET es obligatorio en producción. Defínelo en el entorno antes de iniciar.'
    );
  }

  return secreto || 'clave-de-desarrollo-no-usar-en-produccion';
}

module.exports = {
  raiz,
  entorno,
  host: process.env.HOST || '0.0.0.0',
  puerto: Number(process.env.PORT || 3000),
  sesionSecreto: obtenerSecreto(entorno),
  nombreCookieSesion: 'ga.sid',
  sesionMaximaMs: 1000 * 60 * 60 * 2, // 2 horas
  // Secure solo cuando el sitio se sirve por HTTPS (producción con TLS)
  cookieSegura: entorno === 'production' || process.env.COOKIE_SECURE === 'true',
  rutaBaseDatos: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(raiz, 'datos', 'academico.db'),
};
