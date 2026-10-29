'use strict';

const docentesRepositorio = require('../repositorios/docentes.repositorio');
const { validarDocente } = require('../servicios/validacionDocente');
const { hashPassword } = require('../servicios/password');

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
    telefono: '',
    especialidad: '',
    crear_cuenta: true,
  };
}

function mapearErrorUnico(error) {
  const mensaje = String(error && error.message ? error.message : '');

  if (/UNIQUE constraint failed: docentes\.documento/i.test(mensaje)) {
    return { documento: 'Ya existe un docente registrado con ese documento.' };
  }
  if (/UNIQUE constraint failed: docentes\.email/i.test(mensaje)) {
    return { email: 'Ya existe un docente registrado con ese correo electrónico.' };
  }
  if (/UNIQUE constraint failed: usuarios\.email/i.test(mensaje)) {
    return { email: 'Ya existe una cuenta de usuario con ese correo electrónico.' };
  }
  return null;
}

function responderNoEncontrado(res) {
  return res.status(404).render('error', {
    titulo: 'Docente no encontrado',
    codigo: 404,
    mensaje: 'El docente solicitado no existe.',
  });
}

function renderizarFormulario(res, opciones) {
  const {
    titulo,
    modo,
    accion,
    valores,
    errores,
    docenteId = null,
    tieneCuenta = false,
    cuentaEmail = null,
    estado = 200,
  } = opciones;

  return res.status(estado).render('docentes/formulario', {
    titulo,
    modo,
    accion,
    valores,
    errores,
    docenteId,
    tieneCuenta,
    cuentaEmail,
  });
}

function duplicadosBase(valores, excluirDocenteId = null, excluirUsuarioId = null, revisarCuenta = false) {
  const errores = {};

  if (docentesRepositorio.buscarPorDocumento(valores.documento, excluirDocenteId)) {
    errores.documento = 'Ya existe un docente registrado con ese documento.';
  }
  if (docentesRepositorio.buscarPorEmail(valores.email, excluirDocenteId)) {
    errores.email = 'Ya existe un docente registrado con ese correo electrónico.';
  }
  if (revisarCuenta && docentesRepositorio.buscarUsuarioPorEmail(valores.email, excluirUsuarioId)) {
    errores.email = 'Ya existe una cuenta de usuario con ese correo electrónico.';
  }

  return errores;
}

function listado(req, res) {
  const busqueda = String(req.query.q || '').trim();
  const estado = ESTADOS_VALIDOS.includes(req.query.estado) ? req.query.estado : 'todos';
  const pagina = Number.parseInt(req.query.pagina, 10) || 1;
  const porPagina = Number.parseInt(req.query.porPagina, 10) || 10;

  const resultado = docentesRepositorio.listar({ busqueda, estado, pagina, porPagina });

  return res.render('docentes/listado', {
    titulo: 'Docentes',
    ...resultado,
    busqueda,
    estado,
  });
}

function nuevo(req, res) {
  return renderizarFormulario(res, {
    titulo: 'Nuevo docente',
    modo: 'crear',
    accion: '/docentes',
    valores: valoresVacios(),
    errores: {},
  });
}

function crear(req, res, next) {
  const crearCuenta = req.body.crear_cuenta === 'on';
  const { valido, errores, valores, datos } = validarDocente(req.body, {
    requierePassword: crearCuenta,
  });

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Nuevo docente',
      modo: 'crear',
      accion: '/docentes',
      valores,
      errores,
      estado: 422,
    });
  }

  const duplicados = duplicadosBase(valores, null, null, crearCuenta);
  if (Object.keys(duplicados).length > 0) {
    return renderizarFormulario(res, {
      titulo: 'Nuevo docente',
      modo: 'crear',
      accion: '/docentes',
      valores,
      errores: duplicados,
      estado: 422,
    });
  }

  try {
    const passwordHash = crearCuenta ? hashPassword(String(req.body.password)) : null;
    const id = docentesRepositorio.crear(datos, passwordHash);
    req.session.mensaje = crearCuenta
      ? 'Docente registrado con su cuenta de acceso.'
      : 'Docente registrado sin cuenta de acceso.';
    return res.redirect(`/docentes/${id}`);
  } catch (error) {
    const unicos = mapearErrorUnico(error);
    if (unicos) {
      return renderizarFormulario(res, {
        titulo: 'Nuevo docente',
        modo: 'crear',
        accion: '/docentes',
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
  const docente = id ? docentesRepositorio.obtenerPorId(id) : null;
  if (!docente) return responderNoEncontrado(res);

  const asignaturas = docentesRepositorio.listarAsignaturas(id);

  return res.render('docentes/detalle', {
    titulo: `${docente.nombres} ${docente.apellidos}`,
    docente,
    asignaturas,
    resumen: {
      asignaturas: asignaturas.length,
      activas: asignaturas.filter((a) => a.activo).length,
      matriculados: asignaturas.reduce((total, a) => total + a.matriculados, 0),
    },
  });
}

function editarFormulario(req, res) {
  const id = parsearId(req.params.id);
  const docente = id ? docentesRepositorio.obtenerPorId(id) : null;
  if (!docente) return responderNoEncontrado(res);

  return renderizarFormulario(res, {
    titulo: 'Editar docente',
    modo: 'editar',
    accion: `/docentes/${docente.id}`,
    docenteId: docente.id,
    tieneCuenta: Boolean(docente.usuario_id),
    cuentaEmail: docente.usuario_email,
    valores: {
      documento: docente.documento,
      nombres: docente.nombres,
      apellidos: docente.apellidos,
      email: docente.email,
      telefono: docente.telefono || '',
      especialidad: docente.especialidad || '',
      crear_cuenta: false,
    },
    errores: {},
  });
}

function actualizar(req, res, next) {
  const id = parsearId(req.params.id);
  const existente = id ? docentesRepositorio.obtenerPorId(id) : null;
  if (!existente) return responderNoEncontrado(res);

  const tieneCuenta = Boolean(existente.usuario_id);
  const crearCuenta = req.body.crear_cuenta === 'on';
  const password = String(req.body.password || '');
  const cambiaraPassword = tieneCuenta && password.length > 0;

  const { valido, errores, valores, datos } = validarDocente(req.body, {
    requierePassword: !tieneCuenta && crearCuenta,
  });

  if (!valido) {
    return renderizarFormulario(res, {
      titulo: 'Editar docente',
      modo: 'editar',
      accion: `/docentes/${id}`,
      docenteId: id,
      tieneCuenta,
      cuentaEmail: existente.usuario_email,
      valores,
      errores,
      estado: 422,
    });
  }

  const revisarCuenta = tieneCuenta || crearCuenta;
  const duplicados = duplicadosBase(
    valores,
    id,
    existente.usuario_id || null,
    revisarCuenta
  );

  if (Object.keys(duplicados).length > 0) {
    return renderizarFormulario(res, {
      titulo: 'Editar docente',
      modo: 'editar',
      accion: `/docentes/${id}`,
      docenteId: id,
      tieneCuenta,
      cuentaEmail: existente.usuario_email,
      valores,
      errores: duplicados,
      estado: 422,
    });
  }

  try {
    const passwordHash = cambiaraPassword || (!tieneCuenta && crearCuenta)
      ? hashPassword(password)
      : null;

    const cambios = docentesRepositorio.actualizar(id, datos, {
      passwordHash,
      crearCuenta: !tieneCuenta && crearCuenta,
    });

    if (!cambios) return responderNoEncontrado(res);

    req.session.mensaje = 'Datos del docente actualizados correctamente.';
    return res.redirect(`/docentes/${id}`);
  } catch (error) {
    const unicos = mapearErrorUnico(error);
    if (unicos) {
      return renderizarFormulario(res, {
        titulo: 'Editar docente',
        modo: 'editar',
        accion: `/docentes/${id}`,
        docenteId: id,
        tieneCuenta,
        cuentaEmail: existente.usuario_email,
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
  const docente = id ? docentesRepositorio.obtenerPorId(id) : null;
  if (!docente) return responderNoEncontrado(res);

  const accion = String(req.body.accion || '');
  if (accion !== 'activar' && accion !== 'inactivar') {
    return res.status(400).render('error', {
      titulo: 'Solicitud inválida',
      codigo: 400,
      mensaje: 'La acción solicitada no es válida.',
    });
  }

  const activar = accion === 'activar';
  docentesRepositorio.cambiarEstado(id, activar);
  req.session.mensaje = activar
    ? 'Docente y cuenta de acceso activados.'
    : 'Docente inactivado. Sus asignaturas e historial se conservan.';

  return res.redirect(`/docentes/${id}`);
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
