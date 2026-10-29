'use strict';

const assert = require('node:assert/strict');

function extraerCsrf(html) {
  const coincidencia = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return coincidencia ? coincidencia[1] : null;
}

/**
 * Cliente HTTP mínimo con manejo manual de cookies y redirecciones.
 * Se usa en las pruebas de integración para simular un navegador.
 */
function crearCliente(base) {
  let cookie = '';

  const guardarCookie = (res) => {
    const cabeceras = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
    for (const linea of cabeceras) {
      const [par] = linea.split(';');
      const [nombre, ...resto] = par.split('=');
      if (nombre.trim() !== 'ga.sid') continue;
      const valor = resto.join('=');
      const expirada = /Expires=Thu, 01 Jan 1970/i.test(linea);
      cookie = !valor || expirada ? '' : `ga.sid=${valor}`;
    }
  };

  return {
    get cookie() {
      return cookie;
    },
    async get(ruta) {
      const res = await fetch(base + ruta, {
        redirect: 'manual',
        headers: cookie ? { cookie } : {},
      });
      guardarCookie(res);
      return res;
    },
    async post(ruta, datos) {
      const res = await fetch(base + ruta, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          ...(cookie ? { cookie } : {}),
        },
        body: new URLSearchParams(datos).toString(),
      });
      guardarCookie(res);
      return res;
    },
  };
}

async function iniciarSesion(cliente, email, password) {
  const pagina = await cliente.get('/sesion/iniciar');
  assert.equal(pagina.status, 200);
  const csrf = extraerCsrf(await pagina.text());
  assert.ok(csrf, 'La página de login debe incluir el token CSRF');
  return cliente.post('/sesion/iniciar', { _csrf: csrf, email, password });
}

module.exports = { extraerCsrf, crearCliente, iniciarSesion };
