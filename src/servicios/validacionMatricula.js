'use strict';

/**
 * Valida los identificadores de una matrícula.
 * La existencia y el estado activo se comprueban contra la base de datos.
 */
function validarMatricula(entrada = {}) {
  const valores = {
    estudiante_id: String(entrada.estudiante_id ?? '').trim(),
    asignatura_id: String(entrada.asignatura_id ?? '').trim(),
  };

  const errores = {};

  if (!valores.estudiante_id) {
    errores.estudiante_id = 'Debes seleccionar un estudiante.';
  } else if (!/^\d+$/.test(valores.estudiante_id) || Number(valores.estudiante_id) < 1) {
    errores.estudiante_id = 'El estudiante seleccionado no es válido.';
  }

  if (!valores.asignatura_id) {
    errores.asignatura_id = 'Debes seleccionar una asignatura.';
  } else if (!/^\d+$/.test(valores.asignatura_id) || Number(valores.asignatura_id) < 1) {
    errores.asignatura_id = 'La asignatura seleccionada no es válida.';
  }

  const valido = Object.keys(errores).length === 0;

  return {
    valido,
    errores,
    valores,
    datos: valido
      ? {
          estudiante_id: Number(valores.estudiante_id),
          asignatura_id: Number(valores.asignatura_id),
        }
      : null,
  };
}

module.exports = { validarMatricula };
