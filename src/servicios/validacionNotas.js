'use strict';

const { CORTES, NOTA_MINIMA, NOTA_MAXIMA } = require('./calificaciones');

/**
 * Valida las tres notas de una matrícula.
 * - Un campo ausente en el cuerpo no se modifica (permite ediciones parciales).
 * - Un campo presente y vacío representa una nota pendiente: se elimina su fila.
 * - Una nota numérica debe estar dentro del rango permitido por el esquema.
 */
function validarNotas(entrada = {}) {
  const valores = {};
  const errores = {};
  const datos = {};

  for (const corte of CORTES) {
    const campo = `nota${corte}`;
    const presente = Object.prototype.hasOwnProperty.call(entrada, campo);

    if (!presente) {
      valores[campo] = '';
      continue;
    }

    const texto = String(entrada[campo] ?? '').trim().replace(',', '.');
    valores[campo] = texto;

    if (texto === '') {
      datos[corte] = null;
      continue;
    }

    if (!/^[+-]?\d+(?:\.\d+)?$/.test(texto)) {
      errores[campo] = 'Ingresa una nota numérica o deja el campo vacío.';
      continue;
    }

    const numero = Number(texto);
    if (!Number.isFinite(numero) || numero < NOTA_MINIMA || numero > NOTA_MAXIMA) {
      errores[campo] = `La nota debe estar entre ${NOTA_MINIMA}.0 y ${NOTA_MAXIMA}.0.`;
      continue;
    }

    datos[corte] = numero;
  }

  return {
    valido: Object.keys(errores).length === 0,
    errores,
    valores,
    datos,
  };
}

module.exports = { validarNotas };
