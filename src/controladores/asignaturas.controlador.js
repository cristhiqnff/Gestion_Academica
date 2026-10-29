'use strict';

const asignaturasRepositorio = require('../repositorios/asignaturas.repositorio');
const docentesRepositorio = require('../repositorios/docentes.repositorio');
const { validarAsignatura } = require('../servicios/validacionAsignatura');

const ESTADOS_VALIDOS = ['todos', 'activo', 'inactivo'];

function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function periodoActual() {
  return `${new Date().getFullYear()}-1`;
}

function valoresVacios() {
  return {
    codigo: '',
    nombre: '',
    creditos: '',
    periodo: periodoActual(),
    docente_id: '',
    peso1: '',
    peso2: '',
    peso3: '',
  };
}

function formatearPeso(valor) {
  return String(Number(valor));
}

function mapearErrorUnico(error) {
  const mensaje = String(error && error.message ? error.message : '');

  if (/UNIQUE constraint failed: asignaturas\.codigo, asignaturas\.periodo/i.test(mensaje)) {
    return { codigo: 'Ya existe una asignatura con ese código en el mismo periodo.' };
  }
  return null;
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Asignatura no encontrada',
    codigo: 404,
    mensaje: 'La asignatura solicitada no existe.',
  });
}

function renderizarFormulario(res, opciones) {
  const {
    titulo,
    modo,
    accion,
    valores,
    errores,
    asignaturaId = null,
    docenteActualId = null,
    estado = 200,
  } = opciones;

  return res.status(estado).render('asignaturas/formulario', {
    titulo,
    modo,
    accion,
    valores,
    errores,
    asignaturaId,
    docenteActualId,
    docentes: docentesRepositorio.listarTodos(),
  });
}

function listado(req, res) {
  const busqueda = String(req.query.q || '').trim();
  const estado = ESTADOS_VALIDOS.includes(req.query.estado) ? req.query.estado : 'todos';
  const docenteId = Number.parseInt(req.query.docente, 10) || null;
  const pagina = Number.parseInt(req.query.pagina, 10) || 1;
  const porPagina = Number.parseInt(req.query.porPagina, 10) || 10;

  const resultado = asignaturasRepositorio.listar({
    busqueda,
    estado,
    docenteId,
    pagina,
    porPagina,
  });

  return res.render('asignaturas/listado', {
    titulo: 'Asignaturas',
    ...resultado,
    busqueda,
    estado,
    docenteId,
    docentes: docentesRepositorio.listarTodos(),
  });
}

function nuevo(req, res) {
  return renderizarFormulario(res, {
    titulo: 'Nueva asignatura',
    modo: 'crear',
    accion: '/asignaturas',
    valores: valoresVacios(),
    errores: {},
  });
}

function crear(req, res, next) {
  const { valido, errores, valores, datos } = validarAsignatura(req.body);

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Nueva asignatura',
      modo: 'crear',
      accion: '/asignaturas',
      valores,
      errores,
      estado: 422,
    });
  }

  const docente = docentesRepositorio.obtenerPorId(datos.docente_id);
  if (!docente || !docente.activo) {
    return renderizarFormulario(res, {
      titulo: 'Nueva asignatura',
      modo: 'crear',
      accion: '/asignaturas',
      valores,
      errores: { docente_id: 'Selecciona un docente activo.' },
      estado: 422,
    });
  }

  if (asignaturasRepositorio.buscarPorCodigoPeriodo(datos.codigo, datos.periodo)) {
    return renderizarFormulario(res, {
      titulo: 'Nueva asignatura',
      modo: 'crear',
      accion: '/asignaturas',
      valores,
      errores: { codigo: 'Ya existe una asignatura con ese código en el mismo periodo.' },
      estado: 422,
    });
  }

  try {
    const id = asignaturasRepositorio.crear(datos);
    req.session.mensaje = 'Asignatura registrada correctamente.';
    return res.redirect(`/asignaturas/${id}`);
  } catch (error) {
    const unicos = mapearErrorUnico(error);
    if (unicos) {
      return renderizarFormulario(res, {
        titulo: 'Nueva asignatura',
        modo: 'crear',
        accion: '/asignaturas',
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
  const asignatura = id ? asignaturasRepositorio.obtenerPorId(id) : null;
  if (!asignatura) return responderNoEncontrado(res);

  const matriculas = asignaturasRepositorio.listarMatriculasDeAsignatura(id);
  const resumen = {
    matriculados: matriculas.length,
    aprobados: matriculas.filter((fila) => fila.estado === 'Aprobado').length,
    reprobados: matriculas.filter((fila) => fila.estado === 'Reprobado').length,
    pendientes: matriculas.filter((fila) => fila.estado === 'Pendiente').length,
    calificaciones: matriculas.reduce(
      (total, fila) =>
        total + [fila.corte1, fila.corte2, fila.corte3].filter((nota) => nota !== null).length,
      0
    ),
  };

  return res.render('asignaturas/detalle', {
    titulo: `${asignatura.codigo} · ${asignatura.nombre}`,
    asignatura,
    matriculas,
    resumen,
  });
}

function editarFormulario(req, res) {
  const id = parsearId(req.params.id);
  const asignatura = id ? asignaturasRepositorio.obtenerPorId(id) : null;
  if (!asignatura) return responderNoEncontrado(res);

  return renderizarFormulario(res, {
    titulo: 'Editar asignatura',
    modo: 'editar',
    accion: `/asignaturas/${asignatura.id}`,
    asignaturaId: asignatura.id,
    docenteActualId: asignatura.docente_id,
    valores: {
      codigo: asignatura.codigo,
      nombre: asignatura.nombre,
      creditos: String(asignatura.creditos),
      periodo: asignatura.periodo,
      docente_id: String(asignatura.docente_id),
      peso1: formatearPeso(asignatura.peso1),
      peso2: formatearPeso(asignatura.peso2),
      peso3: formatearPeso(asignatura.peso3),
    },
    errores: {},
  });
}

function actualizar(req, res, next) {
  const id = parsearId(req.params.id);
  const existente = id ? asignaturasRepositorio.obtenerPorId(id) : null;
  if (!existente) return responderNoEncontrado(res);

  const cuerpo = { ...req.body };

  // Si el formulario no envía ponderaciones (por ejemplo, una edición parcial),
  // se conservan las que ya tenía la asignatura.
  const pesosVacios = ['peso1', 'peso2', 'peso3'].every(
    (campo) => String(cuerpo[campo] ?? '').trim() === ''
  );
  if (pesosVacios) {
    cuerpo.peso1 = existente.peso1;
    cuerpo.peso2 = existente.peso2;
    cuerpo.peso3 = existente.peso3;
  }

  const { valido, errores, valores, datos } = validarAsignatura(cuerpo);

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Editar asignatura',
      modo: 'editar',
      accion: `/asignaturas/${id}`,
      asignaturaId: id,
      docenteActualId: existente.docente_id,
      valores,
      errores,
      estado: 422,
    });
  }

  const docente = docentesRepositorio.obtenerPorId(datos.docente_id);
  const docenteValido = docente && (docente.activo || datos.docente_id === existente.docente_id);
  if (!docenteValido) {
    return renderizarFormulario(res, {
      titulo: 'Editar asignatura',
      modo: 'editar',
      accion: `/asignaturas/${id}`,
      asignaturaId: id,
      docenteActualId: existente.docente_id,
      valores,
      errores: { docente_id: 'Selecciona un docente activo.' },
      estado: 422,
    });
  }

  if (asignaturasRepositorio.buscarPorCodigoPeriodo(datos.codigo, datos.periodo, id)) {
    return renderizarFormulario(res, {
      titulo: 'Editar asignatura',
      modo: 'editar',
      accion: `/asignaturas/${id}`,
      asignaturaId: id,
      docenteActualId: existente.docente_id,
      valores,
      errores: { codigo: 'Ya existe una asignatura con ese código en el mismo periodo.' },
      estado: 422,
    });
  }

  try {
    const cambios = asignaturasRepositorio.actualizar(id, datos);
    if (!cambios) return responderNoEncontrado(res);

    req.session.mensaje = 'Asignatura actualizada correctamente.';
    return res.redirect(`/asignaturas/${id}`);
  } catch (error) {
    const unicos = mapearErrorUnico(error);
    if (unicos) {
      return renderizarFormulario(res, {
        titulo: 'Editar asignatura',
        modo: 'editar',
        accion: `/asignaturas/${id}`,
        asignaturaId: id,
        docenteActualId: existente.docente_id,
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
  const asignatura = id ? asignaturasRepositorio.obtenerPorId(id) : null;
  if (!asignatura) return responderNoEncontrado(res);

  const accion = String(req.body.accion || '');
  if (accion !== 'activar' && accion !== 'inactivar') {
    return res.status(400).render('error', {
      titulo: 'Solicitud inválida',
      codigo: 400,
      mensaje: 'La acción solicitada no es válida.',
    });
  }

  const activar = accion === 'activar';
  asignaturasRepositorio.cambiarEstado(id, activar);
  req.session.mensaje = activar
    ? 'Asignatura activada correctamente.'
    : 'Asignatura inactivada. Sus matrículas y calificaciones se conservan.';

  return res.redirect(`/asignaturas/${id}`);
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
