'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { protegerCsrf } = require('./middleware/seguridad');
const { SesionesStore } = require('./db/sesiones.store');
const rutas = require('./rutas/index.rutas');

const app = express();

if (config.entorno === 'production') {
  // Necesario para que la cookie Secure funcione detrás de un proxy con HTTPS.
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'vistas'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'publico')));

app.use(
  session({
    store: new SesionesStore({ ttlMs: config.sesionMaximaMs }),
    name: config.nombreCookieSesion,
    secret: config.sesionSecreto,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSegura,
      maxAge: config.sesionMaximaMs,
    },
  })
);

// Datos disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.usuario = req.session.usuario || null;
  res.locals.mensaje = req.session.mensaje || null;
  res.locals.error = req.session.error || null;
  delete req.session.mensaje;
  delete req.session.error;
  next();
});

app.use(protegerCsrf);
app.use(rutas);

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    titulo: 'Página no encontrada',
    codigo: 404,
    mensaje: 'La dirección solicitada no existe.',
  });
});

// Error interno
app.use((error, req, res, next) => {
  console.error('Error no controlado:', error);
  if (res.headersSent) return next(error);
  res.status(500).render('error', {
    titulo: 'Error del servidor',
    codigo: 500,
    mensaje: 'Ocurrió un error inesperado. Revisa la consola del servidor para más detalles.',
  });
});

module.exports = app;
