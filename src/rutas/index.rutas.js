'use strict';

const express = require('express');
const inicioControlador = require('../controladores/inicio.controlador');
const sesionRutas = require('./sesion.rutas');
const panelRutas = require('./panel.rutas');
const estudiantesRutas = require('./estudiantes.rutas');
const docentesRutas = require('./docentes.rutas');
const asignaturasRutas = require('./asignaturas.rutas');
const matriculasRutas = require('./matriculas.rutas');
const reportesRutas = require('./reportes.rutas');

const router = express.Router();

// Endpoint público de salud (útil para monitoreo y pruebas de rendimiento)
router.get('/salud', inicioControlador.salud);

router.use(sesionRutas);
router.use(panelRutas);
router.use(estudiantesRutas);
router.use(docentesRutas);
router.use(asignaturasRutas);
router.use(matriculasRutas);
router.use(reportesRutas);

module.exports = router;
