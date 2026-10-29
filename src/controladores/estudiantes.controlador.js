'use strict';

const estudiantesRepositorio = require('../repositorios/estudiantes.repositorio');
const { validarEstudiante } = require('../servicios/validacionEstudiante');

const ESTADOS_VALIDOS = ['todos', 'activo', 'inactivo'];

function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function valoresVacios() {
  return {
    documento: '',
    nombres: '',
    apellidos: '',
    email: '',
    fecha_nacimiento: '',
    programa: '',
    semestre: '',
  };
}

function buscarDuplicados(valores, excluirId = null) {
  const errores = {};

  if (estudiantesRepositorio.buscarPorDocumento(valores.documento, excluirId)) {
    errores.documento = 'Ya existe un estudiante registrado con ese documento.';
  }
  if (estudiantesRepositorio.buscarPorEmail(valores.email, excluirId)) {
    errores.email = 'Ya existe un estudiante registrado con ese correo electrónico.';
  }

  return errores;
}

/**
 * Traduce los errores UNIQUE de SQLite a mensajes por campo.
 * La base de datos sigue siendo la última defensa ante condiciones de carrera.
 */
function mapearErrorUnico(error) {
  const mensaje = String(error && error.message ? error.message : '');

  if (/UNIQUE constraint failed: estudiantes\.documento/i.test(mensaje)) {
    return { documento: 'Ya existe un estudiante registrado con ese documento.' };
  }
  if (/UNIQUE constraint failed: estudiantes\.email/i.test(mensaje)) {
    return { email: 'Ya existe un estudiante registrado con ese correo electrónico.' };
  }
  return null;
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Estudiante no encontrado',
    codigo: 404,
    mensaje: 'El estudiante solicitado no existe o fue eliminado.',
  });
}

function renderizarFormulario(res, { titulo, modo, accion, valores, errores, estudianteId = null, estado = 200 }) {
  return res.status(estado).render('estudiantes/formulario', {
    titulo,
    modo,
    accion,
    valores,
    errores,
    estudianteId,
    programas: estudiantesRepositorio.listarProgramas(),
  });
}

function listado(req, res) {
  const busqueda = String(req.query.q || '').trim();
  const estado = ESTADOS_VALIDOS.includes(req.query.estado) ? req.query.estado : 'todos';
  const pagina = Number.parseInt(req.query.pagina, 10) || 1;
  const porPagina = Number.parseInt(req.query.porPagina, 10) || 10;

  const resultado = estudiantesRepositorio.listar({ busqueda, estado, pagina, porPagina });

  return res.render('estudiantes/listado', {
    titulo: 'Estudiantes',
    ...resultado,
    busqueda,
    estado,
  });
}

function nuevo(req, res) {
  return renderizarFormulario(res, {
    titulo: 'Nuevo estudiante',
    modo: 'crear',
    accion: '/estudiantes',
    valores: valoresVacios(),
    errores: {},
  });
}

function crear(req, res, next) {
  const { valido, errores, valores, datos } = validarEstudiante(req.body);

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Nuevo estudiante',
      modo: 'crear',
      accion: '/estudiantes',
      valores,
      errores,
      estado: 422,
    });
  }

  const duplicados = buscarDuplicados(valores);
  if (Object.keys(duplicados).length > 0) {
    return renderizarFormulario(res, {
      titulo: 'Nuevo estudiante',
      modo: 'crear',
      accion: '/estudiantes',
      valores,
      errores: duplicados,
      estado: 422,
    });
  }

  try {
    const id = estudiantesRepositorio.crear(datos);
    req.session.mensaje = 'Estudiante registrado correctamente.';
    return res.redirect(`/estudiantes/${id}`);
  } catch (error) {
    const unicos = mapearErrorUnico(error);
    if (unicos) {
      return renderizarFormulario(res, {
        titulo: 'Nuevo estudiante',
        modo: 'crear',
        accion: '/estudiantes',
        valores,
        errores: unicos,
        estado: 422,
      });
    }
    return next(error);
  }
}

function ver(req, res) {
  const id = parsearId(req.params.id);
  const estudiante = id ? estudiantesRepositorio.obtenerPorId(id) : null;
  if (!estudiante) return responderNoEncontrado(res);

  const historial = estudiantesRepositorio.listarHistorialAcademico(id);
  const resumen = {
    matriculas: historial.length,
    aprobadas: historial.filter((fila) => fila.estado === 'Aprobado').length,
    reprobadas: historial.filter((fila) => fila.estado === 'Reprobado').length,
    pendientes: historial.filter((fila) => fila.estado === 'Pendiente').length,
    calificaciones: historial.reduce(
      (total, fila) =>
        total + [fila.corte1, fila.corte2, fila.corte3].filter((nota) => nota !== null).length,
      0
    ),
  };

  return res.render('estudiantes/detalle', {
    titulo: `${estudiante.nombres} ${estudiante.apellidos}`,
    estudiante,
    historial,
    resumen,
    dependencias: estudiantesRepositorio.contarDependencias(id),
  });
}

function editarFormulario(req, res) {
  const id = parsearId(req.params.id);
  const estudiante = id ? estudiantesRepositorio.obtenerPorId(id) : null;
  if (!estudiante) return responderNoEncontrado(res);

  return renderizarFormulario(res, {
    titulo: 'Editar estudiante',
    modo: 'editar',
    accion: `/estudiantes/${estudiante.id}`,
    estudianteId: estudiante.id,
    valores: {
      documento: estudiante.documento,
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      email: estudiante.email,
      fecha_nacimiento: estudiante.fecha_nacimiento || '',
      programa: estudiante.programa,
      semestre: String(estudiante.semestre),
    },
    errores: {},
  });
}

function actualizar(req, res, next) {
  const id = parsearId(req.params.id);
  const existente = id ? estudiantesRepositorio.obtenerPorId(id) : null;
  if (!existente) return responderNoEncontrado(res);

  const { valido, errores, valores, datos } = validarEstudiante(req.body);

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Editar estudiante',
      modo: 'editar',
      accion: `/estudiantes/${id}`,
      estudianteId: id,
      valores,
      errores,
      estado: 422,
    });
  }

  const duplicados = buscarDuplicados(valores, id);
  if (Object.keys(duplicados).length > 0) {
    return renderizarFormulario(res, {
      titulo: 'Editar estudiante',
      modo: 'editar',
      accion: `/estudiantes/${id}`,
      estudianteId: id,
      valores,
      errores: duplicados,
      estado: 422,
    });
  }

  try {
    const cambios = estudiantesRepositorio.actualizar(id, datos);
    if (!cambios) return responderNoEncontrado(res);

    req.session.mensaje = 'Datos del estudiante actualizados correctamente.';
    return res.redirect(`/estudiantes/${id}`);
  } catch (error) {
    const unicos = mapearErrorUnico(error);
    if (unicos) {
      return renderizarFormulario(res, {
        titulo: 'Editar estudiante',
        modo: 'editar',
        accion: `/estudiantes/${id}`,
        estudianteId: id,
        valores,
        errores: unicos,
        estado: 422,
      });
    }
    return next(error);
  }
}

function cambiarEstado(req, res) {
  const id = parsearId(req.params.id);
  const estudiante = id ? estudiantesRepositorio.obtenerPorId(id) : null;
  if (!estudiante) return responderNoEncontrado(res);

  const accion = String(req.body.accion || '');
  if (accion !== 'activar' && accion !== 'inactivar') {
    return res.status(400).render('error', {
      titulo: 'Solicitud inválida',
      codigo: 400,
      mensaje: 'La acción solicitada no es válida.',
    });
  }

  const activar = accion === 'activar';
  estudiantesRepositorio.cambiarEstado(id, activar);
  req.session.mensaje = activar
    ? 'Estudiante activado correctamente.'
    : 'Estudiante inactivado. Su historial académico se conserva.';

  return res.redirect(`/estudiantes/${id}`);
}

module.exports = {
  listado,
  nuevo,
  crear,
  ver,
  editarFormulario,
  actualizar,
  cambiarEstado,
};
