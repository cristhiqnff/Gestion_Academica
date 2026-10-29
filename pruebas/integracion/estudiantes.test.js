'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { extraerCsrf, crearCliente, iniciarSesion } = require('../ayudas/cliente');

// Base de datos aislada: no toca datos/academico.db
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'secreto-solo-para-pruebas';
process.env.DB_PATH = path.join(__dirname, '..', '..', 'datos', 'pruebas-estudiantes.db');

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

async function sesionAdmin() {
  const cliente = crearCliente(base);
  const login = await iniciarSesion(cliente, ADMIN.email, ADMIN.password);
  assert.equal(login.status, 302);
  return cliente;
}

function datosEstudiante(cambios = {}) {
  return {
    documento: '2001',
    nombres: 'Camila',
    apellidos: 'Restrepo',
    email: 'camila.restrepo@correo.edu.co',
    fecha_nacimiento: '2004-05-10',
    programa: 'Ingeniería Informática',
    semestre: '4',
    ...cambios,
  };
}

async function tokenDe(cliente, ruta = '/estudiantes') {
  const res = await cliente.get(ruta);
  const html = await res.text();
  const csrf = extraerCsrf(html);
  assert.ok(csrf, `La página ${ruta} debe incluir el token CSRF`);
  return { res, html, csrf };
}

function contarFilas(html) {
  return (html.match(/class="fila-estudiante"/g) || []).length;
}

function contarEstudiantes() {
  return obtenerDb().prepare('SELECT COUNT(*) AS c FROM estudiantes').get().c;
}

test('E01 - Listado de estudiantes con sesión ADMIN', async () => {
  const cliente = await sesionAdmin();
  const res = await cliente.get('/estudiantes');
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(html, /Ana María/);
  assert.match(html, /1001/);
  assert.match(html, /Nuevo estudiante/);
  assert.ok(contarFilas(html) > 0);
});

test('E02 - Sin autenticación, el listado redirige al login', async () => {
  const cliente = crearCliente(base);
  const res = await cliente.get('/estudiantes');

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/sesion/iniciar');
});

test('E03 - Un DOCENTE recibe 403 en todas las rutas administrativas', async () => {
  const cliente = crearCliente(base);
  await iniciarSesion(cliente, DOCENTE.email, DOCENTE.password);

  for (const ruta of ['/estudiantes', '/estudiantes/nuevo', '/estudiantes/1', '/estudiantes/1/editar']) {
    const res = await cliente.get(ruta);
    assert.equal(res.status, 403, `La ruta ${ruta} debe devolver 403`);
  }
});

test('E04 - Registro correcto de un estudiante', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/nuevo');
  const antes = contarEstudiantes();

  const res = await cliente.post('/estudiantes', { _csrf: csrf, ...datosEstudiante() });

  assert.equal(res.status, 302);
  const ubicacion = res.headers.get('location');
  assert.match(ubicacion, /^\/estudiantes\/\d+$/);
  assert.equal(contarEstudiantes(), antes + 1);

  const id = Number(ubicacion.split('/').pop());
  const fila = obtenerDb().prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
  assert.equal(fila.documento, '2001');
  assert.equal(fila.email, 'camila.restrepo@correo.edu.co');
  assert.equal(fila.semestre, 4);
  assert.equal(fila.activo, 1);

  const detalle = await cliente.get(ubicacion);
  assert.equal(detalle.status, 200);
  assert.match(await detalle.text(), /Camila/);
});

test('E05 - Rechazo de documento duplicado', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/nuevo');
  const antes = contarEstudiantes();

  const res = await cliente.post('/estudiantes', {
    _csrf: csrf,
    ...datosEstudiante({ documento: '1001', email: 'nuevo.documento@correo.edu.co' }),
  });
  const html = await res.text();

  assert.equal(res.status, 422);
  assert.match(html, /Ya existe un estudiante registrado con ese documento/);
  assert.equal(contarEstudiantes(), antes);
});

test('E06 - Rechazo de correo duplicado (sin distinguir mayúsculas)', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/nuevo');
  const antes = contarEstudiantes();

  const res = await cliente.post('/estudiantes', {
    _csrf: csrf,
    ...datosEstudiante({ documento: '2099', email: 'ANA.TORRES@correo.edu.co' }),
  });
  const html = await res.text();

  assert.equal(res.status, 422);
  assert.match(html, /Ya existe un estudiante registrado con ese correo electrónico/);
  assert.equal(contarEstudiantes(), antes);
});

test('E07 - Validación de campos obligatorios', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/nuevo');
  const res = await cliente.post('/estudiantes', { _csrf: csrf });
  const html = await res.text();

  assert.equal(res.status, 422);
  assert.match(html, /El documento es obligatorio/);
  assert.match(html, /Los nombres son obligatorios/);
  assert.match(html, /Los apellidos son obligatorios/);
  assert.match(html, /El correo electrónico es obligatorio/);
  assert.match(html, /El programa académico es obligatorio/);
  assert.match(html, /El semestre es obligatorio/);
});

test('E08 - Búsqueda por nombre, documento, correo y sin resultados', async () => {
  const cliente = await sesionAdmin();

  const porNombre = await (await cliente.get('/estudiantes?q=Sof%C3%ADa')).text();
  assert.match(porNombre, /Sofía Cárdenas/);
  assert.doesNotMatch(porNombre, /Ana María Torres/);

  const porDocumento = await (await cliente.get('/estudiantes?q=1004')).text();
  assert.match(porDocumento, /Andrés Mejía/);
  assert.doesNotMatch(porDocumento, /Sofía Cárdenas/);

  const porCorreo = await (await cliente.get('/estudiantes?q=mateo.herrera%40correo.edu.co')).text();
  assert.match(porCorreo, /Mateo Herrera/);

  const sinResultados = await (await cliente.get('/estudiantes?q=zzzzzz')).text();
  assert.match(sinResultados, /No se encontraron estudiantes/);
});

test('E09 - Edición correcta de un estudiante', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/1/editar');

  const res = await cliente.post('/estudiantes/1', {
    _csrf: csrf,
    documento: '1001',
    nombres: 'Ana María',
    apellidos: 'Torres',
    email: 'ana.torres@correo.edu.co',
    fecha_nacimiento: '2004-03-12',
    programa: 'Ingeniería de Software',
    semestre: '6',
  });

  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/estudiantes/1');

  const fila = obtenerDb().prepare('SELECT * FROM estudiantes WHERE id = 1').get();
  assert.equal(fila.programa, 'Ingeniería de Software');
  assert.equal(fila.semestre, 6);

  const detalle = await (await cliente.get('/estudiantes/1')).text();
  assert.match(detalle, /Ingeniería de Software/);
});

test('E10 - Edición de un estudiante inexistente devuelve 404', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente);

  assert.equal((await cliente.get('/estudiantes/99999')).status, 404);
  assert.equal((await cliente.get('/estudiantes/99999/editar')).status, 404);
  assert.equal(
    (await cliente.post('/estudiantes/99999', {
      _csrf: csrf,
      ...datosEstudiante({ documento: '3001', email: 'x@y.edu.co' }),
    })).status,
    404
  );
  assert.equal(
    (await cliente.post('/estudiantes/99999/estado', { _csrf: csrf, accion: 'inactivar' })).status,
    404
  );
});

test('E11 - Inactivación y activación lógica', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/1');

  const inactivar = await cliente.post('/estudiantes/1/estado', { _csrf: csrf, accion: 'inactivar' });
  assert.equal(inactivar.status, 302);
  assert.equal(obtenerDb().prepare('SELECT activo FROM estudiantes WHERE id = 1').get().activo, 0);

  const detalleInactivo = await (await cliente.get('/estudiantes/1')).text();
  assert.match(detalleInactivo, /Inactivo/);

  const activar = await cliente.post('/estudiantes/1/estado', { _csrf: csrf, accion: 'activar' });
  assert.equal(activar.status, 302);
  assert.equal(obtenerDb().prepare('SELECT activo FROM estudiantes WHERE id = 1').get().activo, 1);
});

test('E12 - CSRF obligatorio en creación y cambio de estado', async () => {
  const cliente = await sesionAdmin();
  const antes = contarEstudiantes();

  const creacionSinToken = await cliente.post('/estudiantes', datosEstudiante({
    documento: '4001',
    email: 'sin.token@correo.edu.co',
  }));
  assert.equal(creacionSinToken.status, 403);
  assert.equal(contarEstudiantes(), antes);

  const estadoSinToken = await cliente.post('/estudiantes/1/estado', { accion: 'inactivar' });
  assert.equal(estadoSinToken.status, 403);
  assert.equal(obtenerDb().prepare('SELECT activo FROM estudiantes WHERE id = 1').get().activo, 1);
});

test('E13 - Inactivar conserva matrículas y calificaciones', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/1');

  const db = obtenerDb();
  const antesMatriculas = db.prepare('SELECT COUNT(*) AS c FROM matriculas WHERE estudiante_id = 1').get().c;
  const antesNotas = db.prepare(
    `SELECT COUNT(*) AS c FROM calificaciones c
      JOIN matriculas m ON m.id = c.matricula_id
     WHERE m.estudiante_id = 1`
  ).get().c;

  assert.ok(antesMatriculas > 0);
  assert.ok(antesNotas > 0);

  await cliente.post('/estudiantes/1/estado', { _csrf: csrf, accion: 'inactivar' });

  const despuesMatriculas = db.prepare('SELECT COUNT(*) AS c FROM matriculas WHERE estudiante_id = 1').get().c;
  const despuesNotas = db.prepare(
    `SELECT COUNT(*) AS c FROM calificaciones c
      JOIN matriculas m ON m.id = c.matricula_id
     WHERE m.estudiante_id = 1`
  ).get().c;

  assert.equal(despuesMatriculas, antesMatriculas);
  assert.equal(despuesNotas, antesNotas);

  const detalle = await (await cliente.get('/estudiantes/1')).text();
  assert.match(detalle, /Programación I/);
  assert.match(detalle, /conserva/);

  await cliente.post('/estudiantes/1/estado', { _csrf: csrf, accion: 'activar' });
});

test('E14 - Persistencia de creación y edición en SQLite', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/nuevo');

  const alta = await cliente.post('/estudiantes', {
    _csrf: csrf,
    ...datosEstudiante({
      documento: '5001',
      nombres: 'Persistente',
      apellidos: 'Prueba',
      email: 'persistente.prueba@correo.edu.co',
    }),
  });
  assert.equal(alta.status, 302);
  const id = Number(alta.headers.get('location').split('/').pop());

  const creado = obtenerDb().prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
  assert.equal(creado.nombres, 'Persistente');

  const { csrf: csrfEdicion } = await tokenDe(cliente, `/estudiantes/${id}/editar`);
  const edicion = await cliente.post(`/estudiantes/${id}`, {
    _csrf: csrfEdicion,
    documento: '5001',
    nombres: 'Persistente',
    apellidos: 'Prueba',
    email: 'persistente.prueba@correo.edu.co',
    fecha_nacimiento: '',
    programa: 'Ingeniería de Sistemas',
    semestre: '8',
  });
  assert.equal(edicion.status, 302);

  const actualizado = obtenerDb().prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);
  assert.equal(actualizado.programa, 'Ingeniería de Sistemas');
  assert.equal(actualizado.semestre, 8);
  assert.equal(actualizado.fecha_nacimiento, null);
});

test('E15 - Gestión de datos inválidos', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/nuevo');

  const res = await cliente.post('/estudiantes', {
    _csrf: csrf,
    ...datosEstudiante({
      documento: 'ABC',
      email: 'correo-invalido',
      semestre: '13',
    }),
  });
  const html = await res.text();

  assert.equal(res.status, 422);
  assert.match(html, /entre 4 y 20 dígitos/);
  assert.match(html, /Ingresa un correo electrónico válido/);
  assert.match(html, /El semestre debe estar entre 1 y 12/);
  // Los datos escritos se conservan tras el error
  assert.match(html, /value="ABC"/);
  assert.match(html, /value="correo-invalido"/);
});

test('E17 - Rechazo de documento y correo duplicados al editar', async () => {
  const cliente = await sesionAdmin();
  const { csrf } = await tokenDe(cliente, '/estudiantes/2/editar');

  const duplicadoDocumento = await cliente.post('/estudiantes/2', {
    _csrf: csrf,
    documento: '1001',
    nombres: 'Luis Felipe',
    apellidos: 'Ramírez',
    email: 'luis.ramirez@correo.edu.co',
    fecha_nacimiento: '2003-07-25',
    programa: 'Ingeniería Informática',
    semestre: '5',
  });
  assert.equal(duplicadoDocumento.status, 422);
  assert.match(await duplicadoDocumento.text(), /Ya existe un estudiante registrado con ese documento/);

  const duplicadoCorreo = await cliente.post('/estudiantes/2', {
    _csrf: csrf,
    documento: '1002',
    nombres: 'Luis Felipe',
    apellidos: 'Ramírez',
    email: 'ana.torres@correo.edu.co',
    fecha_nacimiento: '2003-07-25',
    programa: 'Ingeniería Informática',
    semestre: '5',
  });
  assert.equal(duplicadoCorreo.status, 422);
  assert.match(await duplicadoCorreo.text(), /Ya existe un estudiante registrado con ese correo electrónico/);

  const fila = obtenerDb().prepare('SELECT documento, email FROM estudiantes WHERE id = 2').get();
  assert.equal(fila.documento, '1002');
  assert.equal(fila.email, 'luis.ramirez@correo.edu.co');
});

test('E16 - Paginación y filtro por estado', async () => {
  const cliente = await sesionAdmin();

  const pagina1 = await (await cliente.get('/estudiantes?porPagina=5')).text();
  assert.equal(contarFilas(pagina1), 5);
  assert.match(pagina1, /Página 1 de/);

  const pagina2 = await (await cliente.get('/estudiantes?porPagina=5&pagina=2')).text();
  assert.ok(contarFilas(pagina2) > 0);

  const activos = await (await cliente.get('/estudiantes?estado=activo')).text();
  assert.match(activos, /Ana María/);

  const inactivos = await (await cliente.get('/estudiantes?estado=inactivo')).text();
  assert.match(inactivos, /No se encontraron estudiantes/);
});
