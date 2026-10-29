'use strict';

const express = require('express');
const asignaturasControlador = require('../controladores/asignaturas.controlador');
const { requiereRol } = require('../middleware/auth');

const router = express.Router();

router.use('/asignaturas', requiereRol('admin'));

router.get('/asignaturas', asignaturasControlador.listado);
router.get('/asignaturas/nuevo', asignaturasControlador.nuevo);
router.post('/asignaturas', asignaturasControlador.crear);
router.get('/asignaturas/:id', asignaturasControlador.ver);
router.get('/asignaturas/:id/editar', asignaturasControlador.editarFormulario);
router.post('/asignaturas/:id', asignaturasControlador.actualizar);
router.post('/asignaturas/:id/estado', asignaturasControlador.cambiarEstado);

module.exports = router;
