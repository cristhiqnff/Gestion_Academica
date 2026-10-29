'use strict';

const panelRepositorio = require('../repositorios/panel.repositorio');
const docenteRepositorio = require('../repositorios/docente.repositorio');
const asignaturasRepositorio = require('../repositorios/asignaturas.repositorio');
const { calcularResumen } = require('../servicios/calificaciones');

/**
 * Redirige al panel correspondiente según el rol.
 */
function redirigirInicio(req, res) {
  const usuario = req.session.usuario;
  if (!usuario) return res.redirect('/sesion/iniciar');
  return res.redirect(usuario.rol === 'admin' ? '/admin' : '/docente');
}

/**
 * Panel exclusivo del administrador.
 */
function admin(req, res) {
  const resumen = panelRepositorio.obtenerResumen();
  return res.render('admin/panel', {
    titulo: 'Panel administrativo',
    resumen,
  });
}

/**
 * Panel exclusivo del docente: solo sus asignaturas.
 */
function docente(req, res) {
  const { docenteId, nombre } = req.session.usuario;
  const asignaturas = docenteId
    ? docenteRepositorio.listarAsignaturasPorDocente(docenteId)
    : [];

  return res.render('docente/panel', {
    titulo: 'Mis asignaturas',
    asignaturas,
    nombre,
    sinPerfil: !docenteId,
  });
}

/**
 * Detalle de una asignatura propia del docente, con sus matrículas y notas.
 * El docente solo puede acceder a las asignaturas vinculadas a su perfil.
 */
function asignaturaDocente(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(404).render('error', {
      titulo: 'Asignatura no encontrada',
      codigo: 404,
      mensaje: 'La asignatura solicitada no existe.',
    });
  }

  const asignatura = asignaturasRepositorio.obtenerPorId(id);
  if (!asignatura) {
    return res.status(404).render('error', {
      titulo: 'Asignatura no encontrada',
      codigo: 404,
      mensaje: 'La asignatura solicitada no existe.',
    });
  }

  const docenteId = Number(req.session.usuario.docenteId);
  if (!Number.isInteger(docenteId) || docenteId < 1 || asignatura.docente_id !== docenteId) {
    return res.status(403).render('error', {
      titulo: 'Acceso denegado',
      codigo: 403,
      mensaje: 'Solo puedes consultar las asignaturas que tienes asignadas.',
    });
  }

  const matriculas = asignaturasRepositorio
    .listarMatriculasDeAsignatura(id)
    .map((fila) => {
      const resumen = calcularResumen(
        { corte1: fila.corte1, corte2: fila.corte2, corte3: fila.corte3 },
        asignatura
      );
      return {
        ...fila,
        definitiva: resumen.definitiva,
        estado_academico: resumen.estado,
        notas_registradas: resumen.registradas,
      };
    });

  return res.render('docente/asignatura', {
    titulo: `${asignatura.codigo} · ${asignatura.nombre}`,
    asignatura,
    matriculas,
  });
}

module.exports = { redirigirInicio, admin, docente, asignaturaDocente };
