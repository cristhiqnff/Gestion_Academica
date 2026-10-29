'use strict';

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_DOCUMENTO = /^[0-9]{4,20}$/;
const PATRON_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function limpiarTexto(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

function fechaValida(texto) {
  if (!PATRON_FECHA.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

/**
 * Valida y normaliza los datos de un estudiante.
 * Devuelve { valido, errores, valores, datos }.
 * `valores` conserva lo escrito por el usuario para volver a mostrarlo.
 */
function validarEstudiante(entrada = {}) {
  const valores = {
    documento: limpiarTexto(entrada.documento),
    nombres: limpiarTexto(entrada.nombres),
    apellidos: limpiarTexto(entrada.apellidos),
    email: limpiarTexto(entrada.email).toLowerCase(),
    fecha_nacimiento: limpiarTexto(entrada.fecha_nacimiento),
    programa: limpiarTexto(entrada.programa),
    semestre: limpiarTexto(entrada.semestre),
  };

  const errores = {};

  if (!valores.documento) {
    errores.documento = 'El documento es obligatorio.';
  } else if (!PATRON_DOCUMENTO.test(valores.documento)) {
    errores.documento = 'El documento debe contener entre 4 y 20 dígitos, sin espacios ni letras.';
  }

  if (!valores.nombres) {
    errores.nombres = 'Los nombres son obligatorios.';
  } else if (valores.nombres.length < 2 || valores.nombres.length > 80) {
    errores.nombres = 'Los nombres deben tener entre 2 y 80 caracteres.';
  } else if (!PATRON_NOMBRE.test(valores.nombres)) {
    errores.nombres = 'Los nombres solo pueden incluir letras, espacios, guiones y apóstrofes.';
  }

  if (!valores.apellidos) {
    errores.apellidos = 'Los apellidos son obligatorios.';
  } else if (valores.apellidos.length < 2 || valores.apellidos.length > 80) {
    errores.apellidos = 'Los apellidos deben tener entre 2 y 80 caracteres.';
  } else if (!PATRON_NOMBRE.test(valores.apellidos)) {
    errores.apellidos = 'Los apellidos solo pueden incluir letras, espacios, guiones y apóstrofes.';
  }

  if (!valores.email) {
    errores.email = 'El correo electrónico es obligatorio.';
  } else if (valores.email.length > 120) {
    errores.email = 'El correo electrónico no puede superar los 120 caracteres.';
  } else if (!PATRON_CORREO.test(valores.email)) {
    errores.email = 'Ingresa un correo electrónico válido.';
  }

  if (valores.fecha_nacimiento) {
    if (!fechaValida(valores.fecha_nacimiento)) {
      errores.fecha_nacimiento = 'La fecha de nacimiento no es válida.';
    } else {
      const fecha = new Date(`${valores.fecha_nacimiento}T00:00:00Z`);
      const hoy = new Date();
      const minima = new Date('1900-01-01T00:00:00Z');
      if (fecha > hoy) {
        errores.fecha_nacimiento = 'La fecha de nacimiento no puede ser futura.';
      } else if (fecha < minima) {
        errores.fecha_nacimiento = 'La fecha de nacimiento no puede ser anterior a 1900.';
      }
    }
  }

  if (!valores.programa) {
    errores.programa = 'El programa académico es obligatorio.';
  } else if (valores.programa.length < 3 || valores.programa.length > 100) {
    errores.programa = 'El programa debe tener entre 3 y 100 caracteres.';
  }

  if (!valores.semestre) {
    errores.semestre = 'El semestre es obligatorio.';
  } else if (!/^\d+$/.test(valores.semestre)) {
    errores.semestre = 'El semestre debe ser un número entero.';
  } else {
    const semestre = Number(valores.semestre);
    if (semestre < 1 || semestre > 12) {
      errores.semestre = 'El semestre debe estar entre 1 y 12.';
    }
  }

  const valido = Object.keys(errores).length === 0;

  return {
    valido,
    errores,
    valores,
    datos: valido
      ? {
          documento: valores.documento,
          nombres: valores.nombres,
          apellidos: valores.apellidos,
          email: valores.email,
          fecha_nacimiento: valores.fecha_nacimiento || null,
          programa: valores.programa,
          semestre: Number(valores.semestre),
          activo: 1,
        }
      : null,
  };
}

module.exports = { validarEstudiante };
