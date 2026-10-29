'use strict';

const matriculasRepositorio = require('../repositorios/matriculas.repositorio');
const calificacionesRepositorio = require('../repositorios/calificaciones.repositorio');
const { validarNotas } = require('../servicios/validacionNotas');
const {
  calcularResumen,
  formatearNota,
} = require('../servicios/calificaciones');

function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Matrícula no encontrada',
    codigo: 404,
    mensaje: 'La matrícula solicitada no existe.',
  });
}

function responderProhibido(res) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    codigo: 403,
    mensaje: 'Solo puedes consultar o registrar notas de tus propias asignaturas.',
  });
}

/**
 * ADMIN puede todo. DOCENTE solo si la asignatura de la matrícula está
 * asignada a su propio perfil (docentes.usuario_id -> asignaturas.docente_id).
 */
function tienePermiso(req, matricula) {
  const usuario = req.session.usuario;
  if (!usuario) return false;
  if (usuario.rol === 'admin') return true;
  if (usuario.rol !== 'docente') return false;
  const docenteId = Number(usuario.docenteId);
  return Number.isInteger(docenteId) && docenteId > 0 && matricula.docente_id === docenteId;
}

function contexto(req, matricula, notas, valores = null, errores = {}) {
  return {
    titulo: `Notas · ${matricula.asignatura_codigo}`,
    matricula,
    resumen: calcularResumen(notas, matricula),
    valores: valores || {
      nota1: formatearNota(notas.corte1),
      nota2: formatearNota(notas.corte2),
      nota3: formatearNota(notas.corte3),
    },
    errores,
    esDocente: req.session.usuario.rol === 'docente',
  };
}

function verFormulario(req, res) {
  const id = parsearId(req.params.id);
  const matricula = id ? matriculasRepositorio.obtenerPorId(id) : null;
  if (!matricula) return responderNoEncontrado(res);
  if (!tienePermiso(req, matricula)) return responderProhibido(res);

  const notas = calificacionesRepositorio.obtenerPorMatricula(id);

  return res.render('matriculas/notas', contexto(req, matricula, notas));
}

function guardar(req, res, next) {
  const id = parsearId(req.params.id);
  const matricula = id ? matriculasRepositorio.obtenerPorId(id) : null;
  if (!matricula) return responderNoEncontrado(res);
  if (!tienePermiso(req, matricula)) return responderProhibido(res);

  const { valido, errores, valores, datos } = validarNotas(req.body);
  const notasActuales = calificacionesRepositorio.obtenerPorMatricula(id);

  if (!valido) {
    return res.status(422).render(
      'matriculas/notas',
      contexto(req, matricula, notasActuales, valores, errores)
    );
  }

  try {
    calificacionesRepositorio.guardar(id, datos);
    req.session.mensaje = 'Calificaciones actualizadas correctamente.';
    return res.redirect(`/matriculas/${id}/notas`);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  verFormulario,
  guardar,
  tienePermiso,
};
