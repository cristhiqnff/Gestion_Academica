'use strict';

const express = require('express');
const matriculasControlador = require('../controladores/matriculas.controlador');
const calificacionesControlador = require('../controladores/calificaciones.controlador');
const { requiereRol, requiereAutenticacion } = require('../middleware/auth');

const router = express.Router();

// Matrículas: administración exclusiva del rol ADMIN.
router.get('/matriculas', requiereRol('admin'), matriculasControlador.listado);
router.get('/matriculas/nueva', requiereRol('admin'), matriculasControlador.nuevo);
router.post('/matriculas', requiereRol('admin'), matriculasControlador.crear);

// Notas: ADMIN o DOCENTE propietario; la propiedad se valida en el controlador.
router.get('/matriculas/:id/notas', requiereAutenticacion, calificacionesControlador.verFormulario);
router.post('/matriculas/:id/notas', requiereAutenticacion, calificacionesControlador.guardar);

router.get('/matriculas/:id', requiereRol('admin'), matriculasControlador.ver);
router.post('/matriculas/:id/estado', requiereRol('admin'), matriculasControlador.cambiarEstado);

module.exports = router;
