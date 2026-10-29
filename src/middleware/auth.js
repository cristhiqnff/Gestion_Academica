'use strict';

/**
 * Exige una sesión autenticada. Si no existe, redirige al login
 * conservando un mensaje comprensible.
 */
function requiereAutenticacion(req, res, next) {
  if (req.session && req.session.usuario) return next();

  req.session.error = 'Debes iniciar sesión para acceder a esta sección.';
  return res.redirect('/sesion/iniciar');
}

/**
 * Exige que el usuario tenga uno de los roles indicados.
 * Devuelve 403 (no 404) para que el estudiante pueda demostrar la restricción.
 */
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.session || !req.session.usuario) {
      req.session.error = 'Debes iniciar sesión para acceder a esta sección.';
      return res.redirect('/sesion/iniciar');
    }

    if (!rolesPermitidos.includes(req.session.usuario.rol)) {
      return res.status(403).render('error', {
        titulo: 'Acceso denegado',
        codigo: 403,
        mensaje: 'Tu rol no tiene permisos para acceder a esta sección.',
      });
    }

    return next();
  };
}

module.exports = { requiereAutenticacion, requiereRol };
