'use strict';

const PATRON_CODIGO = /^[A-Z0-9-]{2,20}$/;
const PATRON_PERIODO = /^\d{4}-[0-9]$/;
const PATRON_PESO = /^\d{1,3}(\.\d{1,2})?$/;
const TOLERANCIA_PESOS = 0.011;

function limpiarTexto(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Valida y normaliza una asignatura.
 * Los pesos son obligatorios y deben sumar 100 (tolerancia 0.011, igual que el esquema).
 */
function validarAsignatura(entrada = {}) {
  const valores = {
    codigo: limpiarTexto(entrada.codigo).toUpperCase(),
    nombre: limpiarTexto(entrada.nombre),
    creditos: limpiarTexto(entrada.creditos),
    periodo: limpiarTexto(entrada.periodo),
    docente_id: limpiarTexto(entrada.docente_id),
    peso1: limpiarTexto(entrada.peso1),
    peso2: limpiarTexto(entrada.peso2),
    peso3: limpiarTexto(entrada.peso3),
  };

  const errores = {};

  if (!valores.codigo) {
    errores.codigo = 'El código es obligatorio.';
  } else if (!PATRON_CODIGO.test(valores.codigo)) {
    errores.codigo = 'El código debe tener entre 2 y 20 caracteres (letras, números o guiones).';
  }

  if (!valores.nombre) {
    errores.nombre = 'El nombre de la asignatura es obligatorio.';
  } else if (valores.nombre.length < 3 || valores.nombre.length > 100) {
    errores.nombre = 'El nombre debe tener entre 3 y 100 caracteres.';
  }

  if (!valores.creditos) {
    errores.creditos = 'Los créditos son obligatorios.';
  } else if (!/^\d+$/.test(valores.creditos)) {
    errores.creditos = 'Los créditos deben ser un número entero.';
  } else {
    const creditos = Number(valores.creditos);
    if (creditos < 1 || creditos > 10) {
      errores.creditos = 'Los créditos deben estar entre 1 y 10.';
    }
  }

  if (!valores.periodo) {
    errores.periodo = 'El periodo es obligatorio.';
  } else if (!PATRON_PERIODO.test(valores.periodo)) {
    errores.periodo = 'El periodo debe tener el formato AAAA-N (por ejemplo, 2026-1).';
  }

  if (!valores.docente_id) {
    errores.docente_id = 'Debes seleccionar un docente responsable.';
  } else if (!/^\d+$/.test(valores.docente_id) || Number(valores.docente_id) < 1) {
    errores.docente_id = 'El docente seleccionado no es válido.';
  }

  const pesos = { peso1: null, peso2: null, peso3: null };
  for (const campo of ['peso1', 'peso2', 'peso3']) {
    const valor = valores[campo];
    if (!valor) {
      errores[campo] = 'El porcentaje es obligatorio.';
      continue;
    }
    if (!PATRON_PESO.test(valor)) {
      errores[campo] = 'Usa un número entre 0 y 100 con máximo dos decimales.';
      continue;
    }
    const numero = Number(valor);
    if (numero < 0 || numero > 100) {
      errores[campo] = 'El porcentaje debe estar entre 0 y 100.';
      continue;
    }
    pesos[campo] = numero;
  }

  if (pesos.peso1 !== null && pesos.peso2 !== null && pesos.peso3 !== null) {
    const suma = pesos.peso1 + pesos.peso2 + pesos.peso3;
    if (Math.abs(suma - 100) >= TOLERANCIA_PESOS) {
      errores.pesos = `La suma de los tres porcentajes debe ser 100%. Actualmente suma ${suma.toFixed(2)}%.`;
    }
  }

  const valido = Object.keys(errores).length === 0;

  return {
    valido,
    errores,
    valores,
    datos: valido
      ? {
          codigo: valores.codigo,
          nombre: valores.nombre,
          creditos: Number(valores.creditos),
          periodo: valores.periodo,
          docente_id: Number(valores.docente_id),
          peso1: pesos.peso1,
          peso2: pesos.peso2,
          peso3: pesos.peso3,
        }
      : null,
  };
}

module.exports = { validarAsignatura, TOLERANCIA_PESOS };
