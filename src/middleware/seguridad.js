'use strict';

const crypto = require('node:crypto');

/**
 * Protección CSRF sencilla basada en sesión.
 * Genera un token por sesión y lo exige en cada petición que modifica datos.
 */
function protegerCsrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }

  res.locals.csrfToken = req.session.csrfToken;

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const enviado = (req.body && req.body._csrf) || req.get('x-csrf-token');
    if (!enviado || enviado !== req.session.csrfToken) {
      return res.status(403).render('error', {
        titulo: 'Solicitud rechazada',
        codigo: 403,
        mensaje: 'El formulario expiró o no es válido. Vuelve a cargar la página e inténtalo de nuevo.',
      });
    }
  }

  next();
}

module.exports = { protegerCsrf };
