'use strict';

const express = require('express');
const reportesControlador = require('../controladores/reportes.controlador');
const { requiereRol } = require('../middleware/auth');

const router = express.Router();

// Panel y reportes de asignaturas: ADMIN y DOCENTE (el docente solo las suyas).
router.get('/reportes', requiereRol('admin', 'docente'), reportesControlador.panel);
router.get(
  '/reportes/exportar.csv',
  requiereRol('admin', 'docente'),
  reportesControlador.exportarAsignaturas
);

// Rutas estáticas antes de /:id para que "exportar.csv" no se interprete como id.
router.get(
  '/reportes/estudiantes/exportar.csv',
  requiereRol('admin'),
  reportesControlador.exportarEstudiantes
);
router.get('/reportes/asignaturas/:id', requiereRol('admin', 'docente'), reportesControlador.verAsignatura);
router.get(
  '/reportes/asignaturas/:id/exportar.csv',
  requiereRol('admin', 'docente'),
  reportesControlador.exportarAsignatura
);

// Reportes por estudiante: solo ADMIN (el historial cruza todas las asignaturas).
router.get('/reportes/estudiantes', requiereRol('admin'), reportesControlador.estudiantes);
router.get('/reportes/estudiantes/:id', requiereRol('admin'), reportesControlador.verEstudiante);
router.get(
  '/reportes/estudiantes/:id/exportar.csv',
  requiereRol('admin'),
  reportesControlador.exportarEstudiante
);

module.exports = router;
