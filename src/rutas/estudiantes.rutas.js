'use strict';

const express = require('express');
const estudiantesControlador = require('../controladores/estudiantes.controlador');
const { requiereRol } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas del módulo exigen sesión y rol ADMIN.
router.use('/estudiantes', requiereRol('admin'));

router.get('/estudiantes', estudiantesControlador.listado);
router.get('/estudiantes/nuevo', estudiantesControlador.nuevo);
router.post('/estudiantes', estudiantesControlador.crear);
router.get('/estudiantes/:id', estudiantesControlador.ver);
router.get('/estudiantes/:id/editar', estudiantesControlador.editarFormulario);
router.post('/estudiantes/:id', estudiantesControlador.actualizar);
router.post('/estudiantes/:id/estado', estudiantesControlador.cambiarEstado);

module.exports = router;
