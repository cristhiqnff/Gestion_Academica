'use strict';

const matriculasRepositorio = require('../repositorios/matriculas.repositorio');
const estudiantesRepositorio = require('../repositorios/estudiantes.repositorio');
const asignaturasRepositorio = require('../repositorios/asignaturas.repositorio');
const { validarMatricula } = require('../servicios/validacionMatricula');
const { calcularResumen } = require('../servicios/calificaciones');

const ESTADOS_VALIDOS = ['todos', 'activa', 'retirada'];

function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function decorar(fila) {
  const resumen = calcularResumen(
    { corte1: fila.corte1, corte2: fila.corte2, corte3: fila.corte3 },
    fila
  );

  return {
    ...fila,
    definitiva: resumen.definitiva,
    estado_academico: resumen.estado,
    notas_registradas: resumen.registradas,
  };
}

function valoresVacios(asignaturaId = '') {
  return {
    estudiante_id: '',
    asignatura_id: asignaturaId,
  };
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Matrícula no encontrada',
    codigo: 404,
    mensaje: 'La matrícula solicitada no existe.',
  });
}

function mapearErrorUnico(error) {
  const mensaje = String(error && error.message ? error.message : '');
  if (/UNIQUE constraint failed: matriculas\.estudiante_id, matriculas\.asignatura_id/i.test(mensaje)) {
    return {
      asignatura_id:
        'Ya existe una matrícula para este estudiante en esta asignatura. Reactívala en lugar de crear otra.',
    };
  }
  return null;
}

function renderizarFormulario(res, { titulo, accion, valores, errores, estado = 200 }) {
  return res.status(estado).render('matriculas/formulario', {
    titulo,
    accion,
    valores,
    errores,
    estudiantes: matriculasRepositorio.listarEstudiantesSelector({ soloActivos: true }),
    asignaturas: matriculasRepositorio.listarAsignaturasSelector({ soloActivas: true }),
  });
}

function listado(req, res) {
  const busqueda = String(req.query.q || '').trim();
  const estado = ESTADOS_VALIDOS.includes(req.query.estado) ? req.query.estado : 'todos';
  const estudianteId = Number.parseInt(req.query.estudiante, 10) || null;
  const asignaturaId = Number.parseInt(req.query.asignatura, 10) || null;
  const periodo = String(req.query.periodo || '').trim();
  const pagina = Number.parseInt(req.query.pagina, 10) || 1;
  const porPagina = Number.parseInt(req.query.porPagina, 10) || 10;

  const resultado = matriculasRepositorio.listar({
    busqueda,
    estado,
    estudianteId,
    asignaturaId,
    periodo,
    pagina,
    porPagina,
  });

  return res.render('matriculas/listado', {
    titulo: 'Matrículas',
    ...resultado,
    filas: resultado.filas.map(decorar),
    busqueda,
    estado,
    estudianteId,
    asignaturaId,
    periodo,
    estudiantes: matriculasRepositorio.listarEstudiantesSelector({ soloActivos: false }),
    asignaturas: matriculasRepositorio.listarAsignaturasSelector({ soloActivas: false }),
    periodos: matriculasRepositorio.listarPeriodos(),
  });
}

function nuevo(req, res) {
  const sugerida = Number(req.query.asignatura);
  const asignaturaId = Number.isInteger(sugerida) && sugerida > 0 ? String(sugerida) : '';

  return renderizarFormulario(res, {
    titulo: 'Nueva matrícula',
    accion: '/matriculas',
    valores: valoresVacios(asignaturaId),
    errores: {},
  });
}

function crear(req, res, next) {
  const { valido, errores, valores, datos } = validarMatricula(req.body);

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Nueva matrícula',
      accion: '/matriculas',
      valores,
      errores,
      estado: 422,
    });
  }

  const estudiante = estudiantesRepositorio.obtenerPorId(datos.estudiante_id);
  const asignatura = asignaturasRepositorio.obtenerPorId(datos.asignatura_id);
  const erroresDatos = {};

  if (!estudiante) {
    erroresDatos.estudiante_id = 'El estudiante seleccionado no existe.';
  } else if (!estudiante.activo) {
    erroresDatos.estudiante_id = 'El estudiante debe estar activo para matricularse.';
  }

  if (!asignatura) {
    erroresDatos.asignatura_id = 'La asignatura seleccionada no existe.';
  } else if (!asignatura.activo) {
    erroresDatos.asignatura_id = 'La asignatura debe estar activa para matricularse.';
  }

  if (Object.keys(erroresDatos).length === 0) {
    const duplicado = matriculasRepositorio.buscarDuplicado(
      datos.estudiante_id,
      datos.asignatura_id
    );
    if (duplicado) {
      erroresDatos.asignatura_id =
        'Ya existe una matrícula para este estudiante en esta asignatura. Reactívala en lugar de crear otra.';
    }
  }

  if (Object.keys(erroresDatos).length > 0) {
    return renderizarFormulario(res, {
      titulo: 'Nueva matrícula',
      accion: '/matriculas',
      valores,
      errores: erroresDatos,
      estado: 422,
    });
  }

  try {
    const id = matriculasRepositorio.crear(datos.estudiante_id, datos.asignatura_id);
    req.session.mensaje = 'Estudiante matriculado correctamente.';
    return res.redirect(`/matriculas/${id}`);
  } catch (error) {
    const unico = mapearErrorUnico(error);
    if (unico) {
      return renderizarFormulario(res, {
        titulo: 'Nueva matrícula',
        accion: '/matriculas',
        valores,
        errores: unico,
        estado: 422,
      });
    }
    return next(error);
  }
}

function ver(req, res) {
  const id = parsearId(req.params.id);
  const matricula = id ? matriculasRepositorio.obtenerPorId(id) : null;
  if (!matricula) return responderNoEncontrado(res);

  return res.render('matriculas/detalle', {
    titulo: `Matrícula ${matricula.estudiante_nombres} ${matricula.estudiante_apellidos}`,
    matricula,
    resumen: calcularResumen(
      { corte1: matricula.corte1, corte2: matricula.corte2, corte3: matricula.corte3 },
      matricula
    ),
  });
}

function cambiarEstado(req, res) {
  const id = parsearId(req.params.id);
  const matricula = id ? matriculasRepositorio.obtenerPorId(id) : null;
  if (!matricula) return responderNoEncontrado(res);

  const accion = String(req.body.accion || '');
  if (accion !== 'retirar' && accion !== 'reactivar') {
    return res.status(400).render('error', {
      titulo: 'Solicitud inválida',
      codigo: 400,
      mensaje: 'La acción solicitada para la matrícula no es válida.',
    });
  }

  const retirar = accion === 'retirar';
  matriculasRepositorio.cambiarEstado(id, retirar ? 'retirada' : 'activa');
  req.session.mensaje = retirar
    ? 'Matrícula retirada. Sus calificaciones se conservan.'
    : 'Matrícula reactivada. Sus calificaciones se conservan.';

  return res.redirect(`/matriculas/${id}`);
}

module.exports = {
  listado,
  nuevo,
  crear,
  ver,
  cambiarEstado,
  decorar,
};
