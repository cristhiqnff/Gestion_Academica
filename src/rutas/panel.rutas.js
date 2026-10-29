'use strict';

const express = require('express');
const panelControlador = require('../controladores/panel.controlador');
const { requiereRol } = require('../middleware/auth');

const router = express.Router();

router.get('/', panelControlador.redirigirInicio);
router.get('/admin', requiereRol('admin'), panelControlador.admin);
router.get('/docente', requiereRol('docente'), panelControlador.docente);
router.get('/docente/asignaturas/:id', requiereRol('docente'), panelControlador.asignaturaDocente);

module.exports = router;
