'use strict';

const CORTES = [1, 2, 3];
const NOTA_MINIMA = 0;
const NOTA_MAXIMA = 5;
const NOTA_APROBATORIA = 3;

/**
 * Redondea a dos decimales de forma estable.
 * Se usa para que la definitiva calculada coincida con la mostrada en la ficha
 * (por ejemplo 4.14 en INF101).
 */
function redondear2(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula la definitiva a partir de las tres notas y las ponderaciones.
 * Devuelve null si falta alguna nota: una ausencia no equivale a cero.
 */
function calcularDefinitiva(notas, pesos) {
  const valores = [notas.corte1, notas.corte2, notas.corte3];
  if (valores.some((valor) => valor === null || valor === undefined || valor === '')) {
    return null;
  }

  const suma =
    (Number(valores[0]) * Number(pesos.peso1) +
      Number(valores[1]) * Number(pesos.peso2) +
      Number(valores[2]) * Number(pesos.peso3)) /
    100;

  return redondear2(suma);
}

function calcularEstado(definitiva) {
  if (definitiva === null || definitiva === undefined) return 'Pendiente';
  return definitiva >= NOTA_APROBATORIA ? 'Aprobado' : 'Reprobado';
}

function contarNotas(notas) {
  return [notas.corte1, notas.corte2, notas.corte3].filter(
    (valor) => valor !== null && valor !== undefined && valor !== ''
  ).length;
}

function calcularResumen(notas, pesos) {
  const definitiva = calcularDefinitiva(notas, pesos);
  return {
    notas,
    definitiva,
    estado: calcularEstado(definitiva),
    registradas: contarNotas(notas),
  };
}

function formatearNota(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return String(Number(valor));
}

function formatearDefinitiva(valor) {
  if (valor === null || valor === undefined) return '—';
  return String(valor);
}

module.exports = {
  CORTES,
  NOTA_MINIMA,
  NOTA_MAXIMA,
  NOTA_APROBATORIA,
  redondear2,
  calcularDefinitiva,
  calcularEstado,
  contarNotas,
  calcularResumen,
  formatearNota,
  formatearDefinitiva,
};
