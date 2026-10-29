'use strict';

const { calcularResumen, redondear2 } = require('./calificaciones');

/**
 * Promedio de una lista de valores, redondeado a dos decimales.
 * Devuelve null cuando no hay valores: un pendiente no equivale a cero.
 */
function promedio(valores) {
  const numeros = valores.filter((valor) => typeof valor === 'number' && Number.isFinite(valor));
  if (numeros.length === 0) return null;

  return redondear2(numeros.reduce((total, valor) => total + valor, 0) / numeros.length);
}

/**
 * Añade la definitiva y el estado calculados con el servicio central.
 * La definitiva nunca se lee de la base de datos porque no se almacena.
 */
function decorar(fila) {
  const resumen = calcularResumen(
    { corte1: fila.corte1, corte2: fila.corte2, corte3: fila.corte3 },
    fila
  );

  return {
    ...fila,
    definitiva: resumen.definitiva,
    estado: resumen.estado,
    notas_registradas: resumen.registradas,
  };
}

/**
 * Calcula las métricas de un conjunto de matrículas.
 *
 * Regla de los reportes:
 * - Solo las matrículas `activa` entran en conteos y promedios.
 * - Las `retirada` se informan aparte y se excluyen del cálculo.
 * - Los pendientes (definitiva null) no entran en el promedio ni en máx/mín.
 */
function resumir(filas) {
  const decoradas = filas.map(decorar);
  const activas = decoradas.filter((fila) => fila.matricula_estado === 'activa');
  const retiradas = decoradas.filter((fila) => fila.matricula_estado === 'retirada');
  const conDefinitiva = activas.filter((fila) => fila.definitiva !== null);
  const definitivas = conDefinitiva.map((fila) => fila.definitiva);

  return {
    filas: decoradas,
    matriculados: activas.length,
    retiradas: retiradas.length,
    conDefinitiva: conDefinitiva.length,
    promedio: promedio(definitivas),
    maxima: definitivas.length > 0 ? Math.max(...definitivas) : null,
    minima: definitivas.length > 0 ? Math.min(...definitivas) : null,
    aprobados: activas.filter((fila) => fila.estado === 'Aprobado').length,
    reprobados: activas.filter((fila) => fila.estado === 'Reprobado').length,
    pendientes: activas.filter((fila) => fila.estado === 'Pendiente').length,
  };
}

/**
 * Agrupa las matrículas por asignatura y calcula sus métricas.
 * Las asignaturas se ordenan por periodo y código.
 */
function agruparPorAsignatura(filas) {
  const grupos = new Map();

  for (const fila of filas) {
    if (!grupos.has(fila.asignatura_id)) grupos.set(fila.asignatura_id, []);
    grupos.get(fila.asignatura_id).push(fila);
  }

  return [...grupos.values()]
    .map((grupo) => {
      const resumen = resumir(grupo);
      const primera = grupo[0];

      return {
        id: primera.asignatura_id,
        codigo: primera.codigo,
        nombre: primera.asignatura_nombre,
        periodo: primera.periodo,
        creditos: primera.creditos,
        docente_id: primera.docente_id,
        docente_nombre: primera.docente_nombre,
        peso1: primera.peso1,
        peso2: primera.peso2,
        peso3: primera.peso3,
        ...resumen,
      };
    })
    .sort(
      (a, b) =>
        String(b.periodo).localeCompare(String(a.periodo)) ||
        String(a.codigo).localeCompare(String(b.codigo), 'es')
    );
}

/**
 * Combina la lista de estudiantes con las métricas de sus matrículas.
 */
function resumirPorEstudiante(estudiantes, filas) {
  const porEstudiante = new Map();

  for (const fila of filas) {
    if (!porEstudiante.has(fila.estudiante_id)) porEstudiante.set(fila.estudiante_id, []);
    porEstudiante.get(fila.estudiante_id).push(fila);
  }

  return estudiantes.map((estudiante) => {
    const resumen = resumir(porEstudiante.get(estudiante.id) || []);
    const { filas: _filas, ...metricas } = resumen;
    return { ...estudiante, ...metricas };
  });
}

module.exports = {
  promedio,
  decorar,
  resumir,
  agruparPorAsignatura,
  resumirPorEstudiante,
};
