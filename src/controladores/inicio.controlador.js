'use strict';

const panelRepositorio = require('../repositorios/panel.repositorio');

function salud(req, res) {
  const resumen = panelRepositorio.obtenerResumen();
  res.json({
    estado: 'ok',
    servicio: 'gestion-academica',
    baseDatos: 'conectada',
    resumen,
    fecha: new Date().toISOString(),
  });
}

module.exports = { salud };
