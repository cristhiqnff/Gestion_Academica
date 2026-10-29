'use strict';

const express = require('express');
const sesionControlador = require('../controladores/sesion.controlador');

const router = express.Router();

router.get('/sesion/iniciar', sesionControlador.mostrarFormulario);
router.post('/sesion/iniciar', sesionControlador.iniciar);
router.post('/sesion/cerrar', sesionControlador.cerrar);

module.exports = router;
