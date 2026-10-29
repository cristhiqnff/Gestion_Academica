'use strict';

const express = require('express');
const docentesControlador = require('../controladores/docentes.controlador');
const { requiereRol } = require('../middleware/auth');

const router = express.Router();

router.use('/docentes', requiereRol('admin'));

router.get('/docentes', docentesControlador.listado);
router.get('/docentes/nuevo', docentesControlador.nuevo);
router.post('/docentes', docentesControlador.crear);
router.get('/docentes/:id', docentesControlador.ver);
router.get('/docentes/:id/editar', docentesControlador.editarFormulario);
router.post('/docentes/:id', docentesControlador.actualizar);
router.post('/docentes/:id/estado', docentesControlador.cambiarEstado);

module.exports = router;
