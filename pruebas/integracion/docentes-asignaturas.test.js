'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { extraerCsrf, crearCliente, iniciarSesion } = require('../ayudas/cliente');

// Base de datos aislada: no toca datos/academico.db
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'secreto-solo-para-pruebas';
process.env.DB_PATH = path.join(__dirname, '..', '..', 'datos', 'pruebas-docentes-asignaturas.db');

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

async function sesionDocente() {
  const cliente = crearCliente(base);
  const login = await iniciarSesion(cliente, DOCENTE.email, DOCENTE.password);
  assert.equal(login.status, 302);
  return cliente;
}

async function tokenDe(cliente, ruta) {
  const res = await cliente.get(ruta);
  const html = await res.text();
  const csrf = extraerCsrf(html);
  assert.ok(csrf, `La página ${ruta} debe incluir el token CSRF`);
  return { res, html, csrf };
}

function datosDocente(cambios = {}) {
  return {
    documento: '30303030',
    nombres: 'Diana',
    apellidos: 'Suárez',
    email: 'diana.suarez@institucion.edu.co',
    telefono: '3009998877',
    especialidad: 'Ingeniería de Software',
    ...cambios,
  };
}

function datosAsignatura(cambios = {}) {
  return {
    codigo: 'SW401',
    nombre: 'Ingeniería de Software',
    creditos: '3',
    periodo: '2026-2',
    docente_id: '1',
    peso1: '30',
    peso2: '30',
    peso3: '40',
    ...cambios,
  };
}

function docentePorDocumento(documento) {
  return obtenerDb().prepare('SELECT * FROM docentes WHERE documento = ?').get(documento);
}

function asignaturaPorCodigo(codigo, periodo) {
  return obtenerDb()
    .prepare('SELECT * FROM asignaturas WHERE codigo = ? AND periodo = ?')
    .get(codigo, periodo);
}

function contar(sql, ...parametros) {
  return obtenerDb().prepare(sql).get(...parametros).c;
}

test('D01 - ADMIN puede listar docentes', async () => {
  const admin = await sesionAdmin();
  const { res, html } = await tokenDe(admin, '/docentes');

  assert.equal(res.status, 200);
  assert.match(html, /Docentes/);
  assert.match(html, /Gómez/);
  assert.match(html, /Ríos/);
});

test('D02 - sin autenticación se rechaza el acceso a docentes y asignaturas', async () => {
  const anonimo = crearCliente(base);

  const docentes = await anonimo.get('/docentes');
  assert.equal(docentes.status, 302);
  assert.match(docentes.headers.get('location'), /\/sesion\/iniciar/);

  const asignaturas = await anonimo.get('/asignaturas');
  assert.equal(asignaturas.status, 302);
  assert.match(asignaturas.headers.get('location'), /\/sesion\/iniciar/);
});

test('D03 - DOCENTE recibe 403 en rutas administrativas de docentes y asignaturas', async () => {
  const docente = await sesionDocente();

  const listado = await docente.get('/docentes');
  assert.equal(listado.status, 403);

  const detalle = await docente.get('/docentes/1');
  assert.equal(detalle.status, 403);

  const asignaturas = await docente.get('/asignaturas');
  assert.equal(asignaturas.status, 403);

  const { csrf } = await tokenDe(docente, '/docente');
  const intento = await docente.post('/docentes', { ...datosDocente(), _csrf: csrf });
  assert.equal(intento.status, 403);

  const intentoAsignatura = await docente.post('/asignaturas', {
    ...datosAsignatura(),
    _csrf: csrf,
  });
  assert.equal(intentoAsignatura.status, 403);
});

test('D04 - registro válido de un docente sin cuenta de acceso', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes/nuevo');

  const res = await admin.post('/docentes', { ...datosDocente(), _csrf: csrf });
  assert.equal(res.status, 302);

  const docente = docentePorDocumento('30303030');
  assert.ok(docente, 'El docente debe quedar guardado en SQLite');
  assert.equal(docente.nombres, 'Diana');
  assert.equal(docente.activo, 1);
  assert.equal(docente.usuario_id, null);
});

test('D05 - registro válido de un docente con cuenta scrypt', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes/nuevo');

  const res = await admin.post('/docentes', {
    ...datosDocente({
      documento: '30303031',
      nombres: 'Jorge',
      apellidos: 'Salazar',
      email: 'jorge.salazar@institucion.edu.co',
    }),
    _csrf: csrf,
    crear_cuenta: 'on',
    password: 'Clave1234',
    password2: 'Clave1234',
  });
  assert.equal(res.status, 302);

  const docente = docentePorDocumento('30303031');
  assert.ok(docente.usuario_id);

  const usuario = obtenerDb()
    .prepare('SELECT * FROM usuarios WHERE id = ?')
    .get(docente.usuario_id);
  assert.equal(usuario.email, 'jorge.salazar@institucion.edu.co');
  assert.equal(usuario.rol, 'docente');
  assert.equal(usuario.activo, 1);
  assert.match(usuario.password_hash, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
  assert.notEqual(usuario.password_hash, 'Clave1234');

  const login = await iniciarSesion(
    crearCliente(base),
    'jorge.salazar@institucion.edu.co',
    'Clave1234'
  );
  assert.equal(login.status, 302);
  assert.match(login.headers.get('location'), /\/docente/);
});

test('D06 - se rechazan documentos duplicados', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes/nuevo');

  const res = await admin.post('/docentes', {
    ...datosDocente({ email: 'otro.correo@institucion.edu.co' }),
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Ya existe un docente registrado con ese documento/);
  assert.equal(contar('SELECT COUNT(*) AS c FROM docentes WHERE documento = ?', '30303030'), 1);
});

test('D07 - se rechazan correos duplicados sin distinguir mayúsculas', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes/nuevo');

  const res = await admin.post('/docentes', {
    ...datosDocente({ documento: '40404040', email: 'DIANA.SUAREZ@INSTITUCION.EDU.CO' }),
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Ya existe un docente registrado con ese correo electrónico/);
});

test('D08 - se validan campos obligatorios y formato del docente', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes/nuevo');

  const res = await admin.post('/docentes', {
    documento: 'abc',
    nombres: '',
    apellidos: 'X',
    email: 'correo-invalido',
    telefono: '12',
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /El documento debe contener entre 4 y 20 dígitos/);
  assert.match(html, /Los nombres son obligatorios/);
  assert.match(html, /Ingresa un correo electrónico válido/);
});

test('D09 - edición válida de un docente y sincronización de su cuenta', async () => {
  const admin = await sesionAdmin();
  const docente = docentePorDocumento('30303031');
  const { csrf } = await tokenDe(admin, `/docentes/${docente.id}/editar`);

  const res = await admin.post(`/docentes/${docente.id}`, {
    documento: '30303031',
    nombres: 'Jorge Andrés',
    apellidos: 'Salazar Ríos',
    email: 'jorge.andres@institucion.edu.co',
    telefono: '3012223344',
    especialidad: 'Arquitectura de Software',
    _csrf: csrf,
  });
  assert.equal(res.status, 302);

  const actualizado = docentePorDocumento('30303031');
  assert.equal(actualizado.nombres, 'Jorge Andrés');
  assert.equal(actualizado.email, 'jorge.andres@institucion.edu.co');

  const usuarios = obtenerDb()
    .prepare('SELECT * FROM usuarios WHERE id = ?')
    .get(actualizado.usuario_id);
  assert.equal(usuarios.nombre, 'Jorge Andrés Salazar Ríos');
  assert.equal(usuarios.email, 'jorge.andres@institucion.edu.co');
  assert.equal(
    contar('SELECT COUNT(*) AS c FROM usuarios WHERE email = ?', 'jorge.andres@institucion.edu.co'),
    1,
    'No debe duplicarse la cuenta al editar'
  );
});

test('D10 - edición rechaza documento y correo de otro docente', async () => {
  const admin = await sesionAdmin();
  const docente = docentePorDocumento('30303030');
  const { csrf } = await tokenDe(admin, `/docentes/${docente.id}/editar`);

  const res = await admin.post(`/docentes/${docente.id}`, {
    documento: '10101010',
    nombres: 'Diana',
    apellidos: 'Suárez',
    email: 'laura.gomez@institucion.edu.co',
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Ya existe un docente registrado con ese documento/);
  assert.match(html, /Ya existe un docente registrado con ese correo electrónico/);
});

test('D11 - docente y asignatura inexistentes responden 404 con token válido', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes');

  const docente = await admin.get('/docentes/999999');
  assert.equal(docente.status, 404);

  const asignatura = await admin.get('/asignaturas/999999');
  assert.equal(asignatura.status, 404);

  const editarDocente = await admin.post('/docentes/999999', {
    ...datosDocente({ documento: '50505050', email: 'nadie@institucion.edu.co' }),
    _csrf: csrf,
  });
  assert.equal(editarDocente.status, 404);

  const editarAsignatura = await admin.post('/asignaturas/999999', {
    ...datosAsignatura({ codigo: 'XX999' }),
    _csrf: csrf,
  });
  assert.equal(editarAsignatura.status, 404);
});

test('D12 - inactivar docente deshabilita su cuenta y bloquea el login', async () => {
  const admin = await sesionAdmin();
  const docente = docentePorDocumento('30303031');
  const { csrf } = await tokenDe(admin, `/docentes/${docente.id}`);

  const res = await admin.post(`/docentes/${docente.id}/estado`, {
    _csrf: csrf,
    accion: 'inactivar',
  });
  assert.equal(res.status, 302);

  const inactivo = docentePorDocumento('30303031');
  assert.equal(inactivo.activo, 0);
  const usuario = obtenerDb().prepare('SELECT activo FROM usuarios WHERE id = ?').get(inactivo.usuario_id);
  assert.equal(usuario.activo, 0);

  const login = await iniciarSesion(
    crearCliente(base),
    'jorge.andres@institucion.edu.co',
    'Clave1234'
  );
  assert.equal(login.status, 401);
});

test('D13 - reactivar docente habilita su cuenta de nuevo', async () => {
  const admin = await sesionAdmin();
  const docente = docentePorDocumento('30303031');
  const { csrf } = await tokenDe(admin, `/docentes/${docente.id}`);

  const res = await admin.post(`/docentes/${docente.id}/estado`, {
    _csrf: csrf,
    accion: 'activar',
  });
  assert.equal(res.status, 302);

  const activo = docentePorDocumento('30303031');
  assert.equal(activo.activo, 1);
  const usuario = obtenerDb().prepare('SELECT activo FROM usuarios WHERE id = ?').get(activo.usuario_id);
  assert.equal(usuario.activo, 1);

  const login = await iniciarSesion(
    crearCliente(base),
    'jorge.andres@institucion.edu.co',
    'Clave1234'
  );
  assert.equal(login.status, 302);
});

test('D14 - no se exponen hashes ni contraseñas en las vistas de docentes', async () => {
  const admin = await sesionAdmin();
  const docente = docentePorDocumento('30303031');

  for (const ruta of ['/docentes', `/docentes/${docente.id}`, `/docentes/${docente.id}/editar`]) {
    const { html } = await tokenDe(admin, ruta);
    assert.doesNotMatch(html, /scrypt\$/);
    assert.doesNotMatch(html, /Clave1234/);
    assert.doesNotMatch(html, /password_hash/);
  }
});

test('A01 - ADMIN puede listar asignaturas con su docente y ponderaciones', async () => {
  const admin = await sesionAdmin();
  const { res, html } = await tokenDe(admin, '/asignaturas');

  assert.equal(res.status, 200);
  assert.match(html, /INF101/);
  assert.match(html, /Programación I/);
  assert.match(html, /Gómez/);
  assert.match(html, /30% \/ 30% \/ 40%/);
});

test('A02 - registro válido de una asignatura', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const res = await admin.post('/asignaturas', { ...datosAsignatura(), _csrf: csrf });
  assert.equal(res.status, 302);

  const asignatura = asignaturaPorCodigo('SW401', '2026-2');
  assert.ok(asignatura, 'La asignatura debe quedar guardada en SQLite');
  assert.equal(asignatura.docente_id, 1);
  assert.equal(asignatura.creditos, 3);
  assert.equal(asignatura.peso1, 30);
  assert.equal(asignatura.peso2, 30);
  assert.equal(asignatura.peso3, 40);
  assert.equal(asignatura.activo, 1);
});

test('A03 - se rechaza un código duplicado en el mismo periodo', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const res = await admin.post('/asignaturas', {
    ...datosAsignatura({ nombre: 'Otra programación' }),
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Ya existe una asignatura con ese código en el mismo periodo/);
  assert.equal(
    contar('SELECT COUNT(*) AS c FROM asignaturas WHERE codigo = ? AND periodo = ?', 'SW401', '2026-2'),
    1
  );
});

test('A04 - el mismo código se acepta en otro periodo', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const res = await admin.post('/asignaturas', {
    ...datosAsignatura({ periodo: '2027-1' }),
    _csrf: csrf,
  });
  assert.equal(res.status, 302);
  assert.ok(asignaturaPorCodigo('SW401', '2027-1'));
});

test('A05 - se rechazan ponderaciones que no suman 100', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const res = await admin.post('/asignaturas', {
    ...datosAsignatura({ codigo: 'SW402', peso1: '30', peso2: '30', peso3: '30' }),
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /La suma de los tres porcentajes debe ser 100%/);
  assert.equal(asignaturaPorCodigo('SW402', '2026-2'), undefined);
});

test('A06 - se aceptan ponderaciones distintas que suman 100', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const res = await admin.post('/asignaturas', {
    ...datosAsignatura({
      codigo: 'SW403',
      nombre: 'Pruebas de Software',
      peso1: '20',
      peso2: '30',
      peso3: '50',
    }),
    _csrf: csrf,
  });
  assert.equal(res.status, 302);

  const asignatura = asignaturaPorCodigo('SW403', '2026-2');
  assert.equal(asignatura.peso1, 20);
  assert.equal(asignatura.peso2, 30);
  assert.equal(asignatura.peso3, 50);
});

test('A07 - se rechazan créditos y periodos inválidos', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const res = await admin.post('/asignaturas', {
    ...datosAsignatura({ codigo: 'SW404', creditos: '11', periodo: '2026/1' }),
    _csrf: csrf,
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Los créditos deben estar entre 1 y 10/);
  assert.match(html, /El periodo debe tener el formato AAAA-N/);
  assert.equal(asignaturaPorCodigo('SW404', '2026/1'), undefined);
});

test('A08 - se rechaza un docente inexistente o inactivo', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/asignaturas/nuevo');

  const inexistente = await admin.post('/asignaturas', {
    ...datosAsignatura({ codigo: 'SW405', docente_id: '999999' }),
    _csrf: csrf,
  });
  assert.equal(inexistente.status, 422);
  assert.match(await inexistente.text(), /Selecciona un docente activo/);

  // Se crea y luego se inactiva un docente para validar la regla.
  const alta = await admin.post('/docentes', {
    ...datosDocente({
      documento: '60606060',
      nombres: 'Pedro',
      apellidos: 'Inactivo',
      email: 'pedro.inactivo@institucion.edu.co',
    }),
    _csrf: csrf,
  });
  assert.equal(alta.status, 302);
  const docente = docentePorDocumento('60606060');
  const estado = await admin.post(`/docentes/${docente.id}/estado`, {
    _csrf: csrf,
    accion: 'inactivar',
  });
  assert.equal(estado.status, 302);

  const inactivo = await admin.post('/asignaturas', {
    ...datosAsignatura({ codigo: 'SW406', docente_id: String(docente.id) }),
    _csrf: csrf,
  });
  assert.equal(inactivo.status, 422);
  assert.match(await inactivo.text(), /Selecciona un docente activo/);
});

test('A09 - editar una asignatura sin ponderaciones conserva pesos, matrículas y notas', async () => {
  const admin = await sesionAdmin();
  const antes = obtenerDb().prepare('SELECT * FROM asignaturas WHERE id = 1').get();
  const matriculasAntes = contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 1');
  const notasAntes = contar(
    `SELECT COUNT(*) AS c FROM calificaciones c
      JOIN matriculas m ON m.id = c.matricula_id
     WHERE m.asignatura_id = 1`
  );
  assert.equal(antes.peso1, 30);
  assert.equal(antes.peso2, 30);
  assert.equal(antes.peso3, 40);

  const { csrf } = await tokenDe(admin, '/asignaturas/1/editar');
  const res = await admin.post('/asignaturas/1', {
    codigo: 'INF101',
    nombre: 'Programación I (actualizada)',
    creditos: '4',
    periodo: '2026-1',
    docente_id: '1',
    _csrf: csrf,
  });
  assert.equal(res.status, 302);

  const despues = obtenerDb().prepare('SELECT * FROM asignaturas WHERE id = 1').get();
  assert.equal(despues.nombre, 'Programación I (actualizada)');
  assert.equal(despues.peso1, 30);
  assert.equal(despues.peso2, 30);
  assert.equal(despues.peso3, 40);
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 1'), matriculasAntes);
  assert.equal(
    contar(
      `SELECT COUNT(*) AS c FROM calificaciones c
        JOIN matriculas m ON m.id = c.matricula_id
       WHERE m.asignatura_id = 1`
    ),
    notasAntes
  );
});

test('A10 - cambiar ponderaciones no borra matrículas ni calificaciones', async () => {
  const admin = await sesionAdmin();
  const matriculasAntes = contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 2');
  const notasAntes = contar(
    `SELECT COUNT(*) AS c FROM calificaciones c
      JOIN matriculas m ON m.id = c.matricula_id
     WHERE m.asignatura_id = 2`
  );

  const { csrf } = await tokenDe(admin, '/asignaturas/2/editar');
  const res = await admin.post('/asignaturas/2', {
    codigo: 'MAT101',
    nombre: 'Cálculo I',
    creditos: '4',
    periodo: '2026-1',
    docente_id: '2',
    peso1: '25',
    peso2: '35',
    peso3: '40',
    _csrf: csrf,
  });
  assert.equal(res.status, 302);

  const despues = obtenerDb().prepare('SELECT * FROM asignaturas WHERE id = 2').get();
  assert.equal(despues.peso1, 25);
  assert.equal(despues.peso2, 35);
  assert.equal(despues.peso3, 40);
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 2'), matriculasAntes);
  assert.equal(
    contar(
      `SELECT COUNT(*) AS c FROM calificaciones c
        JOIN matriculas m ON m.id = c.matricula_id
       WHERE m.asignatura_id = 2`
    ),
    notasAntes
  );
});

test('A11 - inactivar asignatura conserva matrículas y calificaciones', async () => {
  const admin = await sesionAdmin();
  const matriculasAntes = contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 3');
  const notasAntes = contar(
    `SELECT COUNT(*) AS c FROM calificaciones c
      JOIN matriculas m ON m.id = c.matricula_id
     WHERE m.asignatura_id = 3`
  );

  const { csrf } = await tokenDe(admin, '/asignaturas/3');
  const res = await admin.post('/asignaturas/3/estado', {
    _csrf: csrf,
    accion: 'inactivar',
  });
  assert.equal(res.status, 302);

  assert.equal(obtenerDb().prepare('SELECT activo FROM asignaturas WHERE id = 3').get().activo, 0);
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 3'), matriculasAntes);
  assert.equal(
    contar(
      `SELECT COUNT(*) AS c FROM calificaciones c
        JOIN matriculas m ON m.id = c.matricula_id
       WHERE m.asignatura_id = 3`
    ),
    notasAntes
  );

  const reactivar = await admin.post('/asignaturas/3/estado', {
    _csrf: csrf,
    accion: 'activar',
  });
  assert.equal(reactivar.status, 302);
  assert.equal(obtenerDb().prepare('SELECT activo FROM asignaturas WHERE id = 3').get().activo, 1);
});

test('A12 - las operaciones de escritura exigen token CSRF válido', async () => {
  const admin = await sesionAdmin();

  const docente = await admin.post('/docentes', datosDocente({ documento: '70707070' }));
  assert.equal(docente.status, 403);

  const asignatura = await admin.post('/asignaturas', datosAsignatura({ codigo: 'SW407' }));
  assert.equal(asignatura.status, 403);

  const invalido = await admin.post('/docentes', {
    ...datosDocente({ documento: '70707070' }),
    _csrf: 'token-falso',
  });
  assert.equal(invalido.status, 403);

  assert.equal(docentePorDocumento('70707070'), undefined);
  assert.equal(asignaturaPorCodigo('SW407', '2026-2'), undefined);
});

test('A13 - los cambios persisten al abrir otra conexión a SQLite', () => {
  const otra = new DatabaseSync(archivoBd);
  try {
    const docente = otra
      .prepare('SELECT documento, nombres, email FROM docentes WHERE documento = ?')
      .get('30303030');
    assert.ok(docente);
    assert.equal(docente.nombres, 'Diana');

    const asignatura = otra
      .prepare('SELECT codigo, nombre, peso1, peso2, peso3 FROM asignaturas WHERE codigo = ? AND periodo = ?')
      .get('SW403', '2026-2');
    assert.ok(asignatura);
    assert.equal(asignatura.peso1 + asignatura.peso2 + asignatura.peso3, 100);
  } finally {
    otra.close();
  }
});

test('A14 - integridad referencial y ponderaciones coherentes tras las operaciones', () => {
  const db = obtenerDb();

  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  assert.equal(
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM asignaturas a
           LEFT JOIN docentes d ON d.id = a.docente_id
          WHERE d.id IS NULL`
      )
      .get().c,
    0
  );

  assert.equal(
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM docentes d
           LEFT JOIN usuarios u ON u.id = d.usuario_id
          WHERE d.usuario_id IS NOT NULL AND u.id IS NULL`
      )
      .get().c,
    0
  );

  assert.equal(
    db
      .prepare('SELECT COUNT(*) AS c FROM asignaturas WHERE ABS(peso1 + peso2 + peso3 - 100) >= 0.011')
      .get().c,
    0
  );

  assert.equal(
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM asignaturas a
           JOIN docentes d ON d.id = a.docente_id
          WHERE d.id <> a.docente_id`
      )
      .get().c,
    0
  );
});

test('D15 - no se puede eliminar un docente con asignaturas relacionadas', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/docentes/1');

  // La aplicación no expone borrado: la ruta de eliminación no existe.
  const intento = await admin.post('/docentes/1/eliminar', { _csrf: csrf });
  assert.equal(intento.status, 404);

  // La FK ON DELETE RESTRICT también impide el borrado directo en SQLite.
  assert.throws(
    () => obtenerDb().prepare('DELETE FROM docentes WHERE id = 1').run(),
    /FOREIGN KEY constraint failed/
  );

  assert.ok(docentePorDocumento('10101010'), 'El docente debe seguir existiendo');
  const asignaturasRelacionadas = contar('SELECT COUNT(*) AS c FROM asignaturas WHERE docente_id = 1');
  assert.ok(asignaturasRelacionadas >= 2, 'Las asignaturas del docente deben conservarse');
  assert.deepEqual(obtenerDb().prepare('PRAGMA foreign_key_check').all(), []);
});

