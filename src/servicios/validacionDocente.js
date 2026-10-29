'use strict';

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PATRON_DOCUMENTO = /^[0-9]{4,20}$/;
const PATRON_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
const PATRON_TELEFONO = /^[0-9+() -]{7,20}$/;

function limpiarTexto(valor) {
  return String(valor ?? '').trim().replace(/\s+/g, ' ');
}

/**
 * Valida los datos del docente.
 * `requierePassword` se activa al crear una cuenta nueva.
 * Las contraseñas NUNCA se devuelven en `valores` para no re-renderizarlas.
 */
function validarDocente(entrada = {}, { requierePassword = false } = {}) {
  const valores = {
    documento: limpiarTexto(entrada.documento),
    nombres: limpiarTexto(entrada.nombres),
    apellidos: limpiarTexto(entrada.apellidos),
    email: limpiarTexto(entrada.email).toLowerCase(),
    telefono: limpiarTexto(entrada.telefono),
    especialidad: limpiarTexto(entrada.especialidad),
    crear_cuenta: entrada.crear_cuenta === 'on',
  };

  const errores = {};

  if (!valores.documento) {
    errores.documento = 'El documento es obligatorio.';
  } else if (!PATRON_DOCUMENTO.test(valores.documento)) {
    errores.documento = 'El documento debe contener entre 4 y 20 dígitos.';
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

  if (valores.telefono && !PATRON_TELEFONO.test(valores.telefono)) {
    errores.telefono = 'El teléfono debe tener entre 7 y 20 caracteres numéricos.';
  }

  if (valores.especialidad && (valores.especialidad.length < 3 || valores.especialidad.length > 100)) {
    errores.especialidad = 'La especialidad debe tener entre 3 y 100 caracteres.';
  }

  const password = String(entrada.password || '');
  const password2 = String(entrada.password2 || '');
  const hayPassword = password.length > 0 || password2.length > 0;

  if (requierePassword && !password) {
    errores.password = 'La contraseña es obligatoria para crear la cuenta.';
  }

  if (hayPassword || (requierePassword && password)) {
    if (password.length < 8 || password.length > 72) {
      errores.password = 'La contraseña debe tener entre 8 y 72 caracteres.';
    } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      errores.password = 'La contraseña debe incluir al menos una letra y un número.';
    }
    if (password !== password2) {
      errores.password2 = 'Las contraseñas no coinciden.';
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
          telefono: valores.telefono || null,
          especialidad: valores.especialidad || null,
        }
      : null,
  };
}

module.exports = { validarDocente };
