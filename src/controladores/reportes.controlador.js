'use strict';

const reportesRepositorio = require('../repositorios/reportes.repositorio');
const asignaturasRepositorio = require('../repositorios/asignaturas.repositorio');
const estudiantesRepositorio = require('../repositorios/estudiantes.repositorio');
const {
  resumir,
  agruparPorAsignatura,
  resumirPorEstudiante,
} = require('../servicios/reportes');
const { generarCsv, nombreArchivoSeguro } = require('../servicios/csv');

const TIPO_CSV = 'text/csv; charset=utf-8';

function parsearId(valor) {
  const id = Number(valor);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function esAdmin(req) {
  return Boolean(req.session.usuario && req.session.usuario.rol === 'admin');
}

function docenteIdDe(req) {
  const valor = Number(req.session.usuario && req.session.usuario.docenteId);
  return Number.isInteger(valor) && valor > 0 ? valor : null;
}

function responderNoEncontrado(res, titulo, mensaje) {
  return res.status(404).render('error', { titulo, codigo: 404, mensaje });
}

function responderProhibido(res, mensaje) {
  return res.status(403).render('error', {
    titulo: 'Acceso denegado',
    codigo: 403,
    mensaje,
  });
}

/**
 * ADMIN ve cualquier asignatura. DOCENTE solo las que tiene asignadas en su
 * perfil (docentes.usuario_id -> asignaturas.docente_id).
 */
function puedeVerAsignatura(req, asignatura) {
  if (esAdmin(req)) return true;
  if (!req.session.usuario || req.session.usuario.rol !== 'docente') return false;

  const docenteId = docenteIdDe(req);
  return docenteId !== null && asignatura.docente_id === docenteId;
}

function enviarCsv(res, nombre, filas) {
  res.setHeader('Content-Type', TIPO_CSV);
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivoSeguro(nombre)}"`);
  return res.send(generarCsv(filas));
}

function contextoPanel(req) {
  const admin = esAdmin(req);
  const docenteId = admin ? null : docenteIdDe(req);

  let filas = [];
  if (admin) {
    filas = reportesRepositorio.listarFilas();
  } else if (docenteId !== null) {
    filas = reportesRepositorio.listarFilas({ docenteId });
  }

  return {
    esAdmin: admin,
    sinPerfil: !admin && docenteId === null,
    resumen: resumir(filas),
    asignaturas: agruparPorAsignatura(filas),
  };
}

/**
 * Panel de estadísticas. ADMIN ve todas las asignaturas; DOCENTE solo las suyas.
 */
function panel(req, res) {
  const contexto = contextoPanel(req);

  return res.render('reportes/panel', {
    titulo: contexto.esAdmin ? 'Reportes y estadísticas' : 'Reportes de mis asignaturas',
    ...contexto,
  });
}

function buscarAsignatura(req, res) {
  const id = parsearId(req.params.id);
  const asignatura = id ? asignaturasRepositorio.obtenerPorId(id) : null;

  if (!asignatura) {
    responderNoEncontrado(
      res,
      'Asignatura no encontrada',
      'La asignatura solicitada no existe.'
    );
    return null;
  }

  if (!puedeVerAsignatura(req, asignatura)) {
    responderProhibido(res, 'Solo puedes consultar reportes de tus propias asignaturas.');
    return null;
  }

  return asignatura;
}

function reporteDeAsignatura(asignatura) {
  const filas = reportesRepositorio.listarFilasDeAsignatura(asignatura.id);
  return { asignatura, reporte: resumir(filas) };
}

function verAsignatura(req, res) {
  const asignatura = buscarAsignatura(req, res);
  if (!asignatura) return undefined;

  return res.render('reportes/asignatura', {
    titulo: `Reporte · ${asignatura.codigo}`,
    esAdmin: esAdmin(req),
    ...reporteDeAsignatura(asignatura),
  });
}

function filaResumenAsignatura(asignatura) {
  return [
    asignatura.nombre,
    asignatura.codigo,
    asignatura.periodo,
    asignatura.docente_nombre,
    asignatura.matriculados,
    asignatura.retiradas,
    asignatura.conDefinitiva,
    asignatura.promedio,
    asignatura.aprobados,
    asignatura.reprobados,
    asignatura.pendientes,
    asignatura.maxima,
    asignatura.minima,
  ];
}

const CABECERA_ASIGNATURAS = [
  'Asignatura',
  'Código',
  'Periodo',
  'Docente',
  'Matriculados activos',
  'Retiradas (excluidas)',
  'Con definitiva',
  'Promedio',
  'Aprobados',
  'Reprobados',
  'Pendientes',
  'Nota máxima',
  'Nota mínima',
];

/**
 * Exporta el resumen de asignaturas. El ADMIN obtiene todas; el DOCENTE, las suyas.
 */
function exportarAsignaturas(req, res) {
  const contexto = contextoPanel(req);
  const filas = contexto.asignaturas.map(filaResumenAsignatura);
  const nombre = contexto.esAdmin
    ? 'reporte-asignaturas.csv'
    : 'reporte-mis-asignaturas.csv';

  return enviarCsv(res, nombre, [CABECERA_ASIGNATURAS, ...filas]);
}

function filaMatricula(fila) {
  return [
    fila.documento,
    `${fila.estudiante_nombres} ${fila.estudiante_apellidos}`,
    fila.matricula_estado === 'activa' ? 'Activa' : 'Retirada',
    fila.corte1,
    fila.corte2,
    fila.corte3,
    fila.definitiva,
    fila.estado,
  ];
}

const CABECERA_MATRICULAS = [
  'Documento',
  'Estudiante',
  'Estado matrícula',
  'Corte 1',
  'Corte 2',
  'Corte 3',
  'Definitiva',
  'Estado académico',
];

function exportarAsignatura(req, res) {
  const asignatura = buscarAsignatura(req, res);
  if (!asignatura) return undefined;

  const { reporte } = reporteDeAsignatura(asignatura);
  const filas = reporte.filas.map(filaMatricula);

  return enviarCsv(
    res,
    `reporte-asignatura-${asignatura.codigo}.csv`,
    [CABECERA_MATRICULAS, ...filas]
  );
}

/**
 * Listado de estudiantes con su promedio general. Exclusivo del ADMIN:
 * el historial de un estudiante puede incluir asignaturas de otros docentes.
 */
function estudiantes(req, res) {
  const lista = resumirPorEstudiante(
    reportesRepositorio.listarEstudiantes(),
    reportesRepositorio.listarFilas()
  );

  return res.render('reportes/estudiantes', {
    titulo: 'Reporte por estudiante',
    estudiantes: lista,
  });
}

function filaEstudiante(estudiante) {
  return [
    estudiante.documento,
    `${estudiante.nombres} ${estudiante.apellidos}`,
    estudiante.programa,
    estudiante.activo ? 'Activo' : 'Inactivo',
    estudiante.matriculados,
    estudiante.retiradas,
    estudiante.conDefinitiva,
    estudiante.promedio,
    estudiante.aprobados,
    estudiante.reprobados,
    estudiante.pendientes,
  ];
}

const CABECERA_ESTUDIANTES = [
  'Documento',
  'Estudiante',
  'Programa',
  'Estado',
  'Matrículas activas',
  'Retiradas (excluidas)',
  'Con definitiva',
  'Promedio general',
  'Aprobadas',
  'Reprobadas',
  'Pendientes',
];

function exportarEstudiantes(req, res) {
  const lista = resumirPorEstudiante(
    reportesRepositorio.listarEstudiantes(),
    reportesRepositorio.listarFilas()
  );

  return enviarCsv(res, 'reporte-estudiantes.csv', [
    CABECERA_ESTUDIANTES,
    ...lista.map(filaEstudiante),
  ]);
}

function contextoEstudiante(estudiante) {
  const filas = reportesRepositorio.listarFilasDeEstudiante(estudiante.id);
  return { estudiante, reporte: resumir(filas) };
}

function verEstudiante(req, res) {
  const id = parsearId(req.params.id);
  const estudiante = id ? estudiantesRepositorio.obtenerPorId(id) : null;

  if (!estudiante) {
    return responderNoEncontrado(
      res,
      'Estudiante no encontrado',
      'El estudiante solicitado no existe.'
    );
  }

  return res.render('reportes/estudiante', {
    titulo: `Reporte · ${estudiante.nombres} ${estudiante.apellidos}`,
    ...contextoEstudiante(estudiante),
  });
}

const CABECERA_HISTORIAL = [
  'Código',
  'Asignatura',
  'Periodo',
  'Estado matrícula',
  'Corte 1',
  'Corte 2',
  'Corte 3',
  'Definitiva',
  'Estado académico',
];

function exportarEstudiante(req, res) {
  const id = parsearId(req.params.id);
  const estudiante = id ? estudiantesRepositorio.obtenerPorId(id) : null;

  if (!estudiante) {
    return responderNoEncontrado(
      res,
      'Estudiante no encontrado',
      'El estudiante solicitado no existe.'
    );
  }

  const { reporte } = contextoEstudiante(estudiante);
  const filas = reporte.filas.map((fila) => [
    fila.codigo,
    fila.asignatura_nombre,
    fila.periodo,
    fila.matricula_estado === 'activa' ? 'Activa' : 'Retirada',
    fila.corte1,
    fila.corte2,
    fila.corte3,
    fila.definitiva,
    fila.estado,
  ]);

  return enviarCsv(
    res,
    `reporte-estudiante-${estudiante.documento}.csv`,
    [CABECERA_HISTORIAL, ...filas]
  );
}

module.exports = {
  panel,
  verAsignatura,
  exportarAsignaturas,
  exportarAsignatura,
  estudiantes,
  exportarEstudiantes,
  verEstudiante,
  exportarEstudiante,
};
