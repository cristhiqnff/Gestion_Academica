'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { extraerCsrf, crearCliente, iniciarSesion } = require('../ayudas/cliente');

// Entorno de pruebas aislado: nunca usa datos/academico.db
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'secreto-solo-para-pruebas';
process.env.DB_PATH = path.join(__dirname, '..', '..', 'datos', 'pruebas-auth.db');

const archivoBd = process.env.DB_PATH;
for (const sufijo of ['', '-wal', '-shm']) {
  fs.rmSync(archivoBd + sufijo, { force: true });
}

const { asegurarBaseDatos } = require('../../src/db/inicializar');
asegurarBaseDatos();

const app = require('../../src/app');
const { obtenerDb, cerrarDb } = require('../../src/db/conexion');

let servidor;
let base;

before(async () => {
  await new Promise((resolve) => {
    servidor = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
  await new Promise((resolve) => servidor.close(resolve));
  cerrarDb();
  for (const sufijo of ['', '-wal', '-shm']) {
    fs.rmSync(archivoBd + sufijo, { force: true });
  }
});

const ADMIN = { email: 'admin@institucion.edu.co', password: 'Admin123*' };
const DOCENTE = { email: 'laura.gomez@institucion.edu.co', password: 'Docente123*' };

test('T01 - La pantalla de inicio de sesión responde y muestra el formulario', async () => {
  const cliente = crearCliente(base);
  const res = await cliente.get('/sesion/iniciar');
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(html, /Iniciar sesión/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.ok(extraerCsrf(html));
});

test('T02 - Inicio de sesión válido redirige al panel admin y cambia la cookie', async () => {
  const cliente = crearCliente(base);
  const pagina = await cliente.get('/sesion/iniciar');
  const cookieAntes = cliente.cookie;
  assert.ok(cookieAntes);

  const csrf = extraerCsrf(await pagina.text());
  const res = await cliente.post('/sesion/iniciar', { _csrf: csrf, ...ADMIN });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/admin');
  assert.ok(cliente.cookie);
  assert.notEqual(cliente.cookie, cookieAntes, 'El ID de sesión debe regenerarse');

  const panel = await cliente.get('/admin');
  const html = await panel.text();
  assert.equal(panel.status, 200);
  assert.match(html, /Panel administrativo/);
  assert.match(html, /Administrador General/);
});

test('T03 - Credenciales incorrectas se rechazan con mensaje genérico', async () => {
  const cliente = crearCliente(base);
  const res = await iniciarSesion(cliente, ADMIN.email, 'ClaveIncorrecta1*');
  const html = await res.text();

  assert.equal(res.status, 401);
  assert.match(html, /Correo o contraseña incorrectos/);
  assert.doesNotMatch(html, /no existe/i);
});

test('T04 - Usuario no autenticado no puede acceder a /admin', async () => {
  const cliente = crearCliente(base);
  const res = await cliente.get('/admin');

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/sesion/iniciar');
});

test('T05 - Un docente recibe 403 en rutas de administrador', async () => {
  const cliente = crearCliente(base);
  const login = await iniciarSesion(cliente, DOCENTE.email, DOCENTE.password);
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/docente');

  const res = await cliente.get('/admin');
  const html = await res.text();
  assert.equal(res.status, 403);
  assert.match(html, /Acceso denegado/);
});

test('T06 - Un administrador recibe 403 en rutas exclusivas de docente', async () => {
  const cliente = crearCliente(base);
  const login = await iniciarSesion(cliente, ADMIN.email, ADMIN.password);
  assert.equal(login.status, 302);

  const res = await cliente.get('/docente');
  const html = await res.text();
  assert.equal(res.status, 403);
  assert.match(html, /Acceso denegado/);
});

test('T07 - Cierre de sesión con POST y CSRF válido', async () => {
  const cliente = crearCliente(base);
  await iniciarSesion(cliente, ADMIN.email, ADMIN.password);

  const panel = await cliente.get('/admin');
  const csrf = extraerCsrf(await panel.text());
  assert.ok(csrf);

  const res = await cliente.post('/sesion/cerrar', { _csrf: csrf });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/sesion/iniciar?cerrado=1');
  assert.equal(cliente.cookie, '', 'La cookie de sesión debe eliminarse');
});

test('T08 - La sesión queda invalidada después de cerrar sesión', async () => {
  const cliente = crearCliente(base);
  await iniciarSesion(cliente, ADMIN.email, ADMIN.password);

  const panel = await cliente.get('/admin');
  const csrf = extraerCsrf(await panel.text());
  await cliente.post('/sesion/cerrar', { _csrf: csrf });

  const res = await cliente.get('/admin');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/sesion/iniciar');
});

test('T09 - CSRF: login y logout sin token son rechazados', async () => {
  const cliente = crearCliente(base);

  // Login sin token
  const pagina = await cliente.get('/sesion/iniciar');
  assert.equal(pagina.status, 200);
  const sinToken = await cliente.post('/sesion/iniciar', { ...ADMIN });
  assert.equal(sinToken.status, 403);
  assert.match(await sinToken.text(), /formulario expiró/);

  // Login correcto y logout con token inválido
  await iniciarSesion(cliente, ADMIN.email, ADMIN.password);
  const panel = await cliente.get('/admin');
  const csrfValido = extraerCsrf(await panel.text());

  const logoutInvalido = await cliente.post('/sesion/cerrar', { _csrf: 'token-falso' });
  assert.equal(logoutInvalido.status, 403);

  // La sesión sigue activa: el ataque no la cerró
  const sigueActiva = await cliente.get('/admin');
  assert.equal(sigueActiva.status, 200);
  assert.ok(csrfValido);
});

test('T10 - La base de datos persiste y el panel funciona tras autenticarse', async () => {
  const antes = await (await (crearCliente(base)).get('/salud')).json();

  const cliente = crearCliente(base);
  await iniciarSesion(cliente, ADMIN.email, ADMIN.password);
  const panel = await cliente.get('/admin');
  assert.equal(panel.status, 200);

  const despues = await (await (crearCliente(base)).get('/salud')).json();
  assert.equal(despues.resumen.estudiantesActivos, antes.resumen.estudiantesActivos);
  assert.equal(despues.resumen.calificacionesRegistradas, antes.resumen.calificacionesRegistradas);
  assert.equal(despues.resumen.notasPendientes, antes.resumen.notasPendientes);
  assert.equal(antes.resumen.estudiantesActivos, 6);
  assert.equal(antes.resumen.calificacionesRegistradas, 38);
});

test('T11 - Un usuario autenticado no vuelve a iniciar sesión desde el formulario', async () => {
  const cliente = crearCliente(base);
  await iniciarSesion(cliente, DOCENTE.email, DOCENTE.password);

  const res = await cliente.get('/sesion/iniciar');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/docente');
});

test('T12 - La raíz redirige según el estado de la sesión', async () => {
  const anonimo = crearCliente(base);
  const sinSesion = await anonimo.get('/');
  assert.equal(sinSesion.status, 302);
  assert.equal(sinSesion.headers.get('location'), '/sesion/iniciar');

  const admin = crearCliente(base);
  await iniciarSesion(admin, ADMIN.email, ADMIN.password);
  const conSesion = await admin.get('/');
  assert.equal(conSesion.status, 302);
  assert.equal(conSesion.headers.get('location'), '/admin');
});

test('T13 - La sesión no almacena contraseñas ni hashes', async () => {
  const cliente = crearCliente(base);
  await iniciarSesion(cliente, ADMIN.email, ADMIN.password);

  const filas = obtenerDb().prepare('SELECT sid, sess FROM sesiones').all();
  const contenido = filas.map((f) => f.sess).join(' ');

  assert.ok(contenido.includes(ADMIN.email), 'La sesión debe contener el correo del usuario');
  assert.doesNotMatch(contenido, /password/i);
  assert.doesNotMatch(contenido, /scrypt\$/);
  assert.doesNotMatch(contenido, /Admin123\*/);
});
