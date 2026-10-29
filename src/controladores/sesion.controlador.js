'use strict';

const config = require('../config');
const { autenticar } = require('../servicios/autenticacion');

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function mostrarFormulario(req, res) {
  if (req.session.usuario) {
    return res.redirect(req.session.usuario.rol === 'admin' ? '/admin' : '/docente');
  }

  return res.render('sesion/iniciar', {
    titulo: 'Iniciar sesión',
    errorCredenciales: null,
    aviso: req.query.cerrado ? 'Sesión cerrada correctamente.' : null,
    mostrarAyuda: config.entorno !== 'production',
  });
}

async function iniciar(req, res, next) {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');

  const renderError = (estado, mensaje) =>
    res.status(estado).render('sesion/iniciar', {
      titulo: 'Iniciar sesión',
      errorCredenciales: mensaje,
      aviso: null,
      mostrarAyuda: config.entorno !== 'production',
      correo: email,
    });

  if (!email || !password) {
    return renderError(400, 'Completa el correo y la contraseña.');
  }
  if (!PATRON_CORREO.test(email)) {
    return renderError(400, 'Ingresa un correo electrónico válido.');
  }

  const usuario = autenticar(email, password);
  if (!usuario) {
    // Mensaje genérico: no revela si el correo existe o la contraseña es incorrecta.
    return renderError(401, 'Correo o contraseña incorrectos.');
  }

  try {
    // Regenerar el identificador de sesión evita fijación de sesiones.
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => (error ? reject(error) : resolve()));
    });

    req.session.usuario = usuario;

    await new Promise((resolve, reject) => {
      req.session.save((error) => (error ? reject(error) : resolve()));
    });

    return res.redirect(usuario.rol === 'admin' ? '/admin' : '/docente');
  } catch (error) {
    return next(error);
  }
}

function cerrar(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie(config.nombreCookieSesion);
    return res.redirect('/sesion/iniciar?cerrado=1');
  });
}

module.exports = { mostrarFormulario, iniciar, cerrar };
