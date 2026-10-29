'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { extraerCsrf, crearCliente, iniciarSesion } = require('../ayudas/cliente');
const { escaparCelda } = require('../../src/servicios/csv');

// Base aislada: nunca se abre datos/academico.db desde estas pruebas.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'secreto-solo-para-pruebas-etapa6';
process.env.DB_PATH = path.join(__dirname, '..', '..', 'datos', 'pruebas-etapa6.db');

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

function contar(sql, ...parametros) {
  return obtenerDb().prepare(sql).get(...parametros).c;
}

function huellaAcademica() {
  const db = obtenerDb();
  return {
    matriculas: contar('SELECT COUNT(*) AS c FROM matriculas'),
    calificaciones: contar('SELECT COUNT(*) AS c FROM calificaciones'),
    sumaNotas: db.prepare('SELECT COALESCE(SUM(nota), 0) AS s FROM calificaciones').get().s,
    estados: db
      .prepare('SELECT estado, COUNT(*) AS c FROM matriculas GROUP BY estado ORDER BY estado')
      .all()
      .map((fila) => ({ estado: fila.estado, c: fila.c }),
    ),
  };
}

function insertarEstudiante({ documento, nombres, apellidos, programa }) {
  return obtenerDb()
    .prepare(
      `INSERT INTO estudiantes
         (documento, nombres, apellidos, email, programa, semestre, activo)
       VALUES (?, ?, ?, ?, ?, 1, 1)`
    )
    .run(documento, nombres, apellidos, `${documento}@correo.edu.co`, programa);
}

const CABECERA_ASIGNATURAS =
  'Asignatura,Código,Periodo,Docente,Matriculados activos,Retiradas (excluidas),Con definitiva,Promedio,Aprobados,Reprobados,Pendientes,Nota máxima,Nota mínima';
const CABECERA_MATRICULAS =
  'Documento,Estudiante,Estado matrícula,Corte 1,Corte 2,Corte 3,Definitiva,Estado académico';
const CABECERA_ESTUDIANTES =
  'Documento,Estudiante,Programa,Estado,Matrículas activas,Retiradas (excluidas),Con definitiva,Promedio general,Aprobadas,Reprobadas,Pendientes';
const CABECERA_HISTORIAL =
  'Código,Asignatura,Periodo,Estado matrícula,Corte 1,Corte 2,Corte 3,Definitiva,Estado académico';

test('R01 - sin sesión, reportes y CSV redirigen al login', async () => {
  const anonimo = crearCliente(base);
  const rutas = [
    '/reportes',
    '/reportes/exportar.csv',
    '/reportes/asignaturas/1',
    '/reportes/asignaturas/1/exportar.csv',
    '/reportes/estudiantes',
    '/reportes/estudiantes/1',
    '/reportes/estudiantes/1/exportar.csv',
  ];

  for (const ruta of rutas) {
    const res = await anonimo.get(ruta);
    assert.equal(res.status, 302, `${ruta} debe redirigir`);
    assert.match(res.headers.get('location'), /\/sesion\/iniciar/);
  }
});

test('R02 - ADMIN ve el panel global con los totales del seed', async () => {
  const admin = await sesionAdmin();
  const { res, html } = await tokenDe(admin, '/reportes');

  assert.equal(res.status, 200);
  assert.match(html, /Reportes y estadísticas/);

  // 15 activas, 11 con definitiva, promedio 3.73, 9 aprobados, 2 reprobados, 4 pendientes.
  assert.match(html, /<span class="indicador__valor">15<\/span>/);
  assert.match(html, /<span class="indicador__valor">11<\/span>/);
  assert.match(html, /<span class="indicador__valor">3\.73<\/span>/);
  assert.match(html, /<span class="indicador__valor">9<\/span>/);
  assert.match(html, /<span class="indicador__valor">2<\/span>/);
  assert.match(html, /<span class="indicador__valor">4<\/span>/);

  // Promedios por asignatura: INF101 3.70, MAT101 3.24, BD201 4, ING301 4.19.
  assert.match(html, /INF101/);
  assert.match(html, /3\.7/);
  assert.match(html, /3\.24/);
  assert.match(html, /4\.19/);

  // La regla de exclusión debe estar visible.
  assert.match(html, /retiradas/i);
  assert.match(html, /pendientes/i);
  assert.doesNotMatch(html, /password_hash|scrypt/i);
});

test('R03 - DOCENTE ve solo las estadísticas de sus asignaturas', async () => {
  const docente = await sesionDocente();
  const { res, html } = await tokenDe(docente, '/reportes');

  assert.equal(res.status, 200);
  assert.match(html, /Reportes de mis asignaturas/);

  // Laura: INF101 (4 matrículas, 4 definitivas) + BD201 (4 matrículas, 1 definitiva).
  assert.match(html, /<span class="indicador__valor">8<\/span>/);
  assert.match(html, /<span class="indicador__valor">5<\/span>/);
  assert.match(html, /<span class="indicador__valor">3\.76<\/span>/);
  assert.match(html, /<span class="indicador__valor">4<\/span>/);
  assert.match(html, /<span class="indicador__valor">1<\/span>/);
  assert.match(html, /<span class="indicador__valor">3<\/span>/);

  assert.match(html, /INF101/);
  assert.match(html, /BD201/);
  assert.doesNotMatch(html, /MAT101/);
  assert.doesNotMatch(html, /ING301/);
});

test('R04 - DOCENTE consulta el reporte de una asignatura propia', async () => {
  const docente = await sesionDocente();
  const { res, html } = await tokenDe(docente, '/reportes/asignaturas/1');

  assert.equal(res.status, 200);
  assert.match(html, /INF101/);
  assert.match(html, /3\.7/);
  assert.match(html, /4\.23/);
  assert.match(html, /2\.79/);
  assert.match(html, /Ana María Torres/);
});

test('R05 - DOCENTE recibe 403 en asignaturas y CSV ajenos', async () => {
  const docente = await sesionDocente();

  const mat101 = await docente.get('/reportes/asignaturas/2');
  assert.equal(mat101.status, 403);

  const ing301 = await docente.get('/reportes/asignaturas/4');
  assert.equal(ing301.status, 403);

  const csvAjeno = await docente.get('/reportes/asignaturas/2/exportar.csv');
  assert.equal(csvAjeno.status, 403);
});

test('R06 - recursos inexistentes devuelven 404', async () => {
  const admin = await sesionAdmin();
  assert.equal((await admin.get('/reportes/asignaturas/999999')).status, 404);
  assert.equal((await admin.get('/reportes/asignaturas/999999/exportar.csv')).status, 404);
  assert.equal((await admin.get('/reportes/estudiantes/999999')).status, 404);
  assert.equal((await admin.get('/reportes/estudiantes/999999/exportar.csv')).status, 404);
  assert.equal((await admin.get('/reportes/estudiantes/abc')).status, 404);

  const docente = await sesionDocente();
  assert.equal((await docente.get('/reportes/asignaturas/999999')).status, 404);
});

test('R07 - ADMIN ve el reporte por estudiante con promedios generales', async () => {
  const admin = await sesionAdmin();
  const { res, html } = await tokenDe(admin, '/reportes/estudiantes');

  assert.equal(res.status, 200);
  assert.match(html, /Reporte por estudiante/);
  assert.match(html, /Ana María Torres/);
  assert.match(html, /4\.1/);
  assert.match(html, /2\.79/);
  assert.match(html, /3\.73/);
  assert.match(html, /3\.62/);
  assert.match(html, /Promedio general/);
});

test('R08 - historial por estudiante con definitiva y estado', async () => {
  const admin = await sesionAdmin();
  const { res, html } = await tokenDe(admin, '/reportes/estudiantes/1');

  assert.equal(res.status, 200);
  assert.match(html, /Ana María Torres/);
  assert.match(html, /4\.14/);
  assert.match(html, /3\.66/);
  assert.match(html, /4\.5/);
  assert.match(html, /4\.1/);
  assert.match(html, /Aprobado/);
});

test('R09 - DOCENTE no puede acceder a reportes por estudiante', async () => {
  const docente = await sesionDocente();

  assert.equal((await docente.get('/reportes/estudiantes')).status, 403);
  assert.equal((await docente.get('/reportes/estudiantes/1')).status, 403);
  assert.equal((await docente.get('/reportes/estudiantes/1/exportar.csv')).status, 403);
  assert.equal((await docente.get('/reportes/estudiantes/exportar.csv')).status, 403);
});

test('R10 - los pendientes no entran en el promedio (no valen cero)', async () => {
  const admin = await sesionAdmin();
  const { html } = await tokenDe(admin, '/reportes/estudiantes/2');

  // Luis: INF101 2.79 y BD201 pendiente. El promedio debe ser 2.79, no 1.4.
  assert.match(html, /<span class="indicador__valor">2\.79<\/span>/);
  assert.match(html, /Pendiente/);
  assert.doesNotMatch(html, />1\.4</);
});

test('R11 - las matrículas retiradas se excluyen y se informan aparte', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/1');

  const retirar = await admin.post('/matriculas/1/estado', { _csrf: csrf, accion: 'retirar' });
  assert.equal(retirar.status, 302);

  try {
    const asignatura = await tokenDe(admin, '/reportes/asignaturas/1');
    // Quedan 3 activas, 1 retirada, 3 con definitiva y promedio (2.79+3.62+4.23)/3 = 3.55.
    assert.match(asignatura.html, /<span class="indicador__valor">3<\/span>/);
    assert.match(asignatura.html, /<span class="indicador__valor">1<\/span>/);
    assert.match(asignatura.html, /<span class="indicador__valor">3\.55<\/span>/);
    assert.match(asignatura.html, /Retirada/);
    assert.match(asignatura.html, /Ana María Torres/);

    const panel = await tokenDe(admin, '/reportes');
    // 14 activas, 1 retirada, 10 con definitiva y promedio 36.92/10 = 3.69.
    assert.match(panel.html, /<span class="indicador__valor">14<\/span>/);
    assert.match(panel.html, /<span class="indicador__valor">10<\/span>/);
    assert.match(panel.html, /<span class="indicador__valor">3\.69<\/span>/);
    assert.match(panel.html, /<span class="indicador__valor">8<\/span>/);

    const estudiante = await tokenDe(admin, '/reportes/estudiantes/1');
    // Ana conserva 2 activas con definitiva: (3.66+4.5)/2 = 4.08.
    assert.match(estudiante.html, /<span class="indicador__valor">2<\/span>/);
    assert.match(estudiante.html, /<span class="indicador__valor">4\.08<\/span>/);
    assert.match(estudiante.html, /Retirada/);
  } finally {
    const reactivar = await admin.post('/matriculas/1/estado', { _csrf: csrf, accion: 'reactivar' });
    assert.equal(reactivar.status, 302);
  }

  const restaurado = await tokenDe(admin, '/reportes');
  assert.match(restaurado.html, /<span class="indicador__valor">15<\/span>/);
  assert.match(restaurado.html, /<span class="indicador__valor">3\.73<\/span>/);
});

test('R12 - CSV general del ADMIN con cabeceras y totales', async () => {
  const admin = await sesionAdmin();
  const res = await admin.get('/reportes/exportar.csv');

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(
    res.headers.get('content-disposition'),
    /^attachment; filename="reporte-asignaturas\.csv"$/
  );

  const texto = await res.text();
  assert.ok(texto.startsWith(`${CABECERA_ASIGNATURAS}\r\n`));
  assert.match(texto, /INF101/);
  assert.match(texto, /3\.7/);
  assert.match(texto, /3\.24/);
  assert.match(texto, /4\.19/);
});

test('R13 - CSV del DOCENTE contiene solo sus asignaturas', async () => {
  const docente = await sesionDocente();
  const res = await docente.get('/reportes/exportar.csv');

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(
    res.headers.get('content-disposition'),
    /filename="reporte-mis-asignaturas\.csv"/
  );

  const texto = await res.text();
  assert.ok(texto.startsWith(`${CABECERA_ASIGNATURAS}\r\n`));
  assert.match(texto, /INF101/);
  assert.match(texto, /BD201/);
  assert.doesNotMatch(texto, /MAT101/);
  assert.doesNotMatch(texto, /ING301/);
});

test('R14 - CSV por asignatura con notas y estados', async () => {
  const admin = await sesionAdmin();
  const res = await admin.get('/reportes/asignaturas/1/exportar.csv');

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(
    res.headers.get('content-disposition'),
    /filename="reporte-asignatura-INF101\.csv"/
  );

  const texto = await res.text();
  assert.ok(texto.startsWith(`${CABECERA_MATRICULAS}\r\n`));
  assert.match(texto, /1001,Ana María Torres,Activa,4,3\.8,4\.5,4\.14,Aprobado/);
  assert.match(texto, /1002,Luis Felipe Ramírez,Activa,2\.5,2\.8,3,2\.79,Reprobado/);
});

test('R15 - CSV del listado de estudiantes', async () => {
  const admin = await sesionAdmin();
  const res = await admin.get('/reportes/estudiantes/exportar.csv');

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(res.headers.get('content-disposition'), /filename="reporte-estudiantes\.csv"/);

  const texto = await res.text();
  assert.ok(texto.startsWith(`${CABECERA_ESTUDIANTES}\r\n`));
  assert.match(texto, /1001,Ana María Torres,[^,]+,Activo,3,0,3,4\.1,3,0,0/);
  assert.match(texto, /1002,Luis Felipe Ramírez,[^,]+,Activo,2,0,1,2\.79,0,1,1/);
});

test('R16 - CSV del historial de un estudiante', async () => {
  const admin = await sesionAdmin();
  const res = await admin.get('/reportes/estudiantes/1/exportar.csv');

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(
    res.headers.get('content-disposition'),
    /filename="reporte-estudiante-1001\.csv"/
  );

  const texto = await res.text();
  const lineas = texto.trimEnd().split('\r\n');
  assert.equal(lineas[0], CABECERA_HISTORIAL);
  assert.equal(lineas.length, 4);
  assert.match(texto, /INF101,Programación I,2026-1,Activa,4,3\.8,4\.5,4\.14,Aprobado/);
  assert.match(texto, /MAT101,Cálculo I,2026-1,Activa,3\.5,3\.2,4,3\.66,Aprobado/);
  assert.match(texto, /ING301,Inglés Técnico,2026-1,Activa,4\.2,4\.5,4\.8,4\.5,Aprobado/);
});

test('R17 - CSV escapa comillas, comas y saltos de línea', async () => {
  insertarEstudiante({
    documento: '99101',
    nombres: '=SUM(A1:A2)',
    apellidos: 'Pérez, "Ana"',
    programa: 'Línea1\nLínea2',
  });
  insertarEstudiante({
    documento: '99102',
    nombres: '+123',
    apellidos: 'Prueba',
    programa: 'Programa',
  });
  insertarEstudiante({
    documento: '99103',
    nombres: '-2+3',
    apellidos: 'Prueba',
    programa: 'Programa',
  });
  insertarEstudiante({
    documento: '99104',
    nombres: '@cmd',
    apellidos: 'Prueba',
    programa: 'Programa',
  });

  const admin = await sesionAdmin();
  const res = await admin.get('/reportes/estudiantes/exportar.csv');
  const texto = await res.text();

  // Comillas dobles, coma y salto de línea dentro de una celda entrecomillada.
  assert.ok(
    texto.includes('99101,"\'=SUM(A1:A2) Pérez, ""Ana""","Línea1\nLínea2",Activo'),
    'El CSV debe entrecomillar y duplicar comillas, comas y saltos de línea'
  );

  // Prefijos de fórmula neutralizados con apóstrofo.
  assert.match(texto, /,'\+123 Prueba,/);
  assert.match(texto, /,'-2\+3 Prueba,/);
  assert.match(texto, /,'@cmd Prueba,/);
});

test('R18 - escaparCelda neutraliza fórmulas y escapa correctamente', () => {
  assert.equal(escaparCelda('=1+1'), "'=1+1");
  assert.equal(escaparCelda('+1'), "'+1");
  assert.equal(escaparCelda('-1'), "'-1");
  assert.equal(escaparCelda('@cmd'), "'@cmd");
  assert.equal(escaparCelda('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(escaparCelda(null), '');
  assert.equal(escaparCelda(4.14), '4.14');
});

test('R19 - consultar reportes no modifica matrículas ni calificaciones', async () => {
  const admin = await sesionAdmin();
  const antes = huellaAcademica();

  await admin.get('/reportes');
  await admin.get('/reportes/exportar.csv');
  await admin.get('/reportes/asignaturas/1');
  await admin.get('/reportes/asignaturas/1/exportar.csv');
  await admin.get('/reportes/estudiantes');
  await admin.get('/reportes/estudiantes/exportar.csv');
  await admin.get('/reportes/estudiantes/1');
  await admin.get('/reportes/estudiantes/1/exportar.csv');

  const despues = huellaAcademica();
  assert.deepEqual(despues, antes);
});

test('R20 - integridad referencial después de los reportes', () => {
  const db = obtenerDb();
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  assert.equal(
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM calificaciones c
           LEFT JOIN matriculas m ON m.id = c.matricula_id
          WHERE m.id IS NULL`
      )
      .get().c,
    0
  );
});
