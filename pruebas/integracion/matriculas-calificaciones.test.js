'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { extraerCsrf, crearCliente, iniciarSesion } = require('../ayudas/cliente');
const { calcularResumen } = require('../../src/servicios/calificaciones');

// Base de datos aislada: no toca datos/academico.db
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'secreto-solo-para-pruebas';
process.env.DB_PATH = path.join(__dirname, '..', '..', 'datos', 'pruebas-matriculas-calificaciones.db');

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

function matriculaPorEstudianteAsignatura(estudianteId, asignaturaId) {
  return obtenerDb()
    .prepare('SELECT * FROM matriculas WHERE estudiante_id = ? AND asignatura_id = ?')
    .get(estudianteId, asignaturaId);
}

function notasDe(matriculaId) {
  const notas = { corte1: null, corte2: null, corte3: null };
  const filas = obtenerDb()
    .prepare('SELECT corte, nota FROM calificaciones WHERE matricula_id = ? ORDER BY corte')
    .all(matriculaId);
  for (const fila of filas) notas[`corte${fila.corte}`] = fila.nota;
  return notas;
}

function contar(sql, ...parametros) {
  return obtenerDb().prepare(sql).get(...parametros).c;
}

test('M01 - ADMIN lista matrículas con paginación y filtros', async () => {
  const admin = await sesionAdmin();
  const { res, html } = await tokenDe(admin, '/matriculas');

  assert.equal(res.status, 200);
  assert.match(html, /Matrículas/);
  assert.match(html, /Sofía Cárdenas/);
  assert.match(html, /INF101/);
  assert.match(html, /Mostrando <strong>10<\/strong> de <strong>15<\/strong> matrículas/);

  const filtrada = await tokenDe(admin, '/matriculas?q=INF101&estado=activa&periodo=2026-1&porPagina=5');
  assert.equal(filtrada.res.status, 200);
  assert.match(filtrada.html, /Programación I/);
  assert.match(filtrada.html, /Mostrando <strong>4<\/strong> de <strong>4<\/strong> matrículas/);

  const paginada = await tokenDe(admin, '/matriculas?porPagina=5');
  assert.equal(paginada.res.status, 200);
  assert.match(paginada.html, /Página 1 de 3/);
});

test('M02 - sin sesión, matrículas y notas redirigen al login', async () => {
  const anonimo = crearCliente(base);

  const listado = await anonimo.get('/matriculas');
  assert.equal(listado.status, 302);
  assert.match(listado.headers.get('location'), /\/sesion\/iniciar/);

  const notas = await anonimo.get('/matriculas/1/notas');
  assert.equal(notas.status, 302);
  assert.match(notas.headers.get('location'), /\/sesion\/iniciar/);
});

test('M03 - DOCENTE no puede administrar matrículas', async () => {
  const docente = await sesionDocente();
  const { csrf } = await tokenDe(docente, '/docente');

  const listado = await docente.get('/matriculas');
  assert.equal(listado.status, 403);

  const detalle = await docente.get('/matriculas/1');
  assert.equal(detalle.status, 403);

  const crear = await docente.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '6',
    asignatura_id: '4',
  });
  assert.equal(crear.status, 403);

  const estado = await docente.post('/matriculas/1/estado', {
    _csrf: csrf,
    accion: 'retirar',
  });
  assert.equal(estado.status, 403);
  assert.equal(obtenerDb().prepare('SELECT estado FROM matriculas WHERE id = 1').get().estado, 'activa');
});

test('M04 - DOCENTE accede a sus propias asignaturas y notas', async () => {
  const docente = await sesionDocente();

  const asignatura = await tokenDe(docente, '/docente/asignaturas/1');
  assert.equal(asignatura.res.status, 200);
  assert.match(asignatura.html, /INF101/);
  assert.match(asignatura.html, /Ana María Torres/);

  const notas = await tokenDe(docente, '/matriculas/1/notas');
  assert.equal(notas.res.status, 200);
  assert.match(notas.html, /4\.14/);
});

test('M05 - DOCENTE recibe 403 en asignaturas y notas ajenas', async () => {
  const docente = await sesionDocente();

  const asignaturaAjena = await docente.get('/docente/asignaturas/2');
  assert.equal(asignaturaAjena.status, 403);

  const notasAjenas = await docente.get('/matriculas/2/notas');
  assert.equal(notasAjenas.status, 403);

  const inexistente = await docente.get('/docente/asignaturas/999999');
  assert.equal(inexistente.status, 404);
});

test('M06 - ADMIN consulta detalle y formulario de notas', async () => {
  const admin = await sesionAdmin();

  const detalle = await tokenDe(admin, '/matriculas/1');
  assert.equal(detalle.res.status, 200);
  assert.match(detalle.html, /Ana María Torres/);
  assert.match(detalle.html, /4\.14/);
  assert.match(detalle.html, /Aprobado/);
  assert.match(detalle.html, /30% \/ 30% \/ 40%/);

  const notas = await tokenDe(admin, '/matriculas/1/notas');
  assert.equal(notas.res.status, 200);
  assert.match(notas.html, /value="4"/);
  assert.match(notas.html, /value="3\.8"/);
  assert.match(notas.html, /value="4\.5"/);
});

test('M07 - matrícula válida de estudiante activo en asignatura activa', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/nueva');

  const res = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '5',
    asignatura_id: '3',
  });
  assert.equal(res.status, 302);

  const matricula = matriculaPorEstudianteAsignatura(5, 3);
  assert.ok(matricula, 'La matrícula debe persistir en SQLite');
  assert.equal(matricula.estado, 'activa');
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas'), 16);
});

test('M08 - matrícula duplicada se rechaza con 422', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/nueva');

  const res = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '5',
    asignatura_id: '3',
  });
  assert.equal(res.status, 422);
  const html = await res.text();
  assert.match(html, /Ya existe una matrícula para este estudiante en esta asignatura/);
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas WHERE estudiante_id = 5 AND asignatura_id = 3'), 1);
});

test('M09 - estudiante o asignatura inexistente se rechaza', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/nueva');

  const sinEstudiante = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '999999',
    asignatura_id: '1',
  });
  assert.equal(sinEstudiante.status, 422);
  assert.match(await sinEstudiante.text(), /El estudiante seleccionado no existe/);

  const sinAsignatura = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '1',
    asignatura_id: '999999',
  });
  assert.equal(sinAsignatura.status, 422);
  assert.match(await sinAsignatura.text(), /La asignatura seleccionada no existe/);
});

test('M10 - estudiante o asignatura inactivos se rechazan', async () => {
  const db = obtenerDb();
  db.prepare(
    `INSERT INTO estudiantes (documento, nombres, apellidos, email, programa, semestre, activo)
     VALUES ('90909090', 'Estudiante', 'Inactivo', 'inactivo@correo.edu.co', 'Ingeniería Informática', 1, 0)`
  ).run();
  db.prepare(
    `INSERT INTO asignaturas (codigo, nombre, creditos, periodo, docente_id, peso1, peso2, peso3, activo)
     VALUES ('ZZZ999', 'Asignatura inactiva', 3, '2026-8', 1, 33.33, 33.33, 33.34, 0)`
  ).run();

  const estudiante = db.prepare("SELECT id FROM estudiantes WHERE documento = '90909090'").get();
  const asignatura = db.prepare("SELECT id FROM asignaturas WHERE codigo = 'ZZZ999'").get();

  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/nueva');

  const inactivoEstudiante = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: String(estudiante.id),
    asignatura_id: '1',
  });
  assert.equal(inactivoEstudiante.status, 422);
  assert.match(await inactivoEstudiante.text(), /El estudiante debe estar activo para matricularse/);

  const inactivaAsignatura = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '1',
    asignatura_id: String(asignatura.id),
  });
  assert.equal(inactivaAsignatura.status, 422);
  assert.match(await inactivaAsignatura.text(), /La asignatura debe estar activa para matricularse/);
});

test('M11 - retirar y reactivar conserva las calificaciones', async () => {
  const admin = await sesionAdmin();
  const antes = notasDe(1);
  assert.deepEqual(antes, { corte1: 4, corte2: 3.8, corte3: 4.5 });

  const { csrf } = await tokenDe(admin, '/matriculas/1');
  const retirar = await admin.post('/matriculas/1/estado', { _csrf: csrf, accion: 'retirar' });
  assert.equal(retirar.status, 302);

  assert.equal(obtenerDb().prepare('SELECT estado FROM matriculas WHERE id = 1').get().estado, 'retirada');
  assert.deepEqual(notasDe(1), antes);
  assert.equal(contar('SELECT COUNT(*) AS c FROM calificaciones WHERE matricula_id = 1'), 3);

  const detalle = await tokenDe(admin, '/matriculas/1');
  assert.match(detalle.html, /Retirada/);

  const reactivar = await admin.post('/matriculas/1/estado', { _csrf: csrf, accion: 'reactivar' });
  assert.equal(reactivar.status, 302);
  assert.equal(obtenerDb().prepare('SELECT estado FROM matriculas WHERE id = 1').get().estado, 'activa');
  assert.deepEqual(notasDe(1), antes);
});

test('M12 - crear matrícula sin CSRF devuelve 403 y no escribe', async () => {
  const admin = await sesionAdmin();
  const antes = contar('SELECT COUNT(*) AS c FROM matriculas');

  const res = await admin.post('/matriculas', { estudiante_id: '6', asignatura_id: '4' });
  assert.equal(res.status, 403);
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas'), antes);
  assert.equal(matriculaPorEstudianteAsignatura(6, 4), undefined);
});

test('M13 - recursos inexistentes devuelven 404 con token válido', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas');

  const detalle = await admin.get('/matriculas/999999');
  assert.equal(detalle.status, 404);

  const notas = await admin.get('/matriculas/999999/notas');
  assert.equal(notas.status, 404);

  const guardar = await admin.post('/matriculas/999999/notas', {
    _csrf: csrf,
    nota1: '4',
    nota2: '4',
    nota3: '4',
  });
  assert.equal(guardar.status, 404);

  const estado = await admin.post('/matriculas/999999/estado', {
    _csrf: csrf,
    accion: 'retirar',
  });
  assert.equal(estado.status, 404);
});

test('M14 - nota válida y definitiva 4.14 con pesos 30/30/40', async () => {
  const admin = await sesionAdmin();
  const pesosAntes = obtenerDb().prepare('SELECT peso1, peso2, peso3 FROM asignaturas WHERE id = 1').get();
  const { csrf } = await tokenDe(admin, '/matriculas/1/notas');

  const res = await admin.post('/matriculas/1/notas', {
    _csrf: csrf,
    nota1: '4',
    nota2: '3.8',
    nota3: '4.5',
  });
  assert.equal(res.status, 302);

  assert.deepEqual(notasDe(1), { corte1: 4, corte2: 3.8, corte3: 4.5 });
  const pagina = await tokenDe(admin, '/matriculas/1/notas');
  assert.match(pagina.html, /4\.14/);
  assert.match(pagina.html, /Aprobado/);

  const pesosDespues = obtenerDb().prepare('SELECT peso1, peso2, peso3 FROM asignaturas WHERE id = 1').get();
  assert.deepEqual(pesosDespues, pesosAntes);
});

test('M15 - notas fuera de rango o no numéricas se rechazan', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/1/notas');
  const antes = notasDe(1);

  const fuera = await admin.post('/matriculas/1/notas', {
    _csrf: csrf,
    nota1: '5.1',
    nota2: '3.8',
    nota3: '4.5',
  });
  assert.equal(fuera.status, 422);
  assert.match(await fuera.text(), /La nota debe estar entre 0\.0 y 5\.0/);
  assert.deepEqual(notasDe(1), antes);

  const texto = await admin.post('/matriculas/1/notas', {
    _csrf: csrf,
    nota1: 'abc',
    nota2: '3.8',
    nota3: '4.5',
  });
  assert.equal(texto.status, 422);
  assert.match(await texto.text(), /Ingresa una nota numérica/);
  assert.deepEqual(notasDe(1), antes);
});

test('M16 - nota vacía queda pendiente y no se guarda como cero', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/1/notas');

  const vaciar = await admin.post('/matriculas/1/notas', {
    _csrf: csrf,
    nota1: '',
    nota2: '3.8',
    nota3: '4.5',
  });
  assert.equal(vaciar.status, 302);

  assert.deepEqual(notasDe(1), { corte1: null, corte2: 3.8, corte3: 4.5 });
  assert.equal(contar('SELECT COUNT(*) AS c FROM calificaciones WHERE matricula_id = 1'), 2);

  const pagina = await tokenDe(admin, '/matriculas/1/notas');
  assert.match(pagina.html, /Pendiente/);
  assert.match(pagina.html, /—/);

  const restaurar = await admin.post('/matriculas/1/notas', {
    _csrf: csrf,
    nota1: '4',
    nota2: '3.8',
    nota3: '4.5',
  });
  assert.equal(restaurar.status, 302);
  assert.equal(contar('SELECT COUNT(*) AS c FROM calificaciones WHERE matricula_id = 1'), 3);
});

test('M17 - DOCENTE registra notas en su propia asignatura', async () => {
  const docente = await sesionDocente();
  const { csrf } = await tokenDe(docente, '/matriculas/13/notas');

  const res = await docente.post('/matriculas/13/notas', {
    _csrf: csrf,
    nota1: '4',
    nota2: '4',
    nota3: '4',
  });
  assert.equal(res.status, 302);
  assert.deepEqual(notasDe(13), { corte1: 4, corte2: 4, corte3: 4 });

  const pagina = await tokenDe(docente, '/matriculas/13/notas');
  assert.equal(pagina.res.status, 200);
  assert.match(pagina.html, /4/);
  assert.match(pagina.html, /Aprobado/);
});

test('M18 - DOCENTE no puede registrar notas en una asignatura ajena', async () => {
  const docente = await sesionDocente();
  const { csrf } = await tokenDe(docente, '/matriculas/13/notas');
  const antes = notasDe(2);

  const res = await docente.post('/matriculas/2/notas', {
    _csrf: csrf,
    nota1: '1',
    nota2: '1',
    nota3: '1',
  });
  assert.equal(res.status, 403);
  assert.deepEqual(notasDe(2), antes);
});

test('M19 - definitiva con pesos 33.33/33.33/33.34 se redondea a 4.5', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/3/notas');

  const res = await admin.post('/matriculas/3/notas', {
    _csrf: csrf,
    nota1: '4.2',
    nota2: '4.5',
    nota3: '4.8',
  });
  assert.equal(res.status, 302);

  const pagina = await tokenDe(admin, '/matriculas/3/notas');
  assert.match(pagina.html, /4\.5/);
  assert.doesNotMatch(pagina.html, /4\.50003/);

  const pesos = obtenerDb().prepare('SELECT peso1, peso2, peso3 FROM asignaturas WHERE id = 4').get();
  assert.equal(pesos.peso1, 33.33);
  assert.equal(pesos.peso2, 33.33);
  assert.equal(pesos.peso3, 33.34);
});

test('M20 - estados académicos del seed: 9 aprobados, 2 reprobados, 4 pendientes', () => {
  const filas = obtenerDb()
    .prepare(
      `SELECT m.id, a.peso1, a.peso2, a.peso3,
              c1.nota AS corte1, c2.nota AS corte2, c3.nota AS corte3
         FROM matriculas m
         JOIN asignaturas a ON a.id = m.asignatura_id
         LEFT JOIN calificaciones c1 ON c1.matricula_id = m.id AND c1.corte = 1
         LEFT JOIN calificaciones c2 ON c2.matricula_id = m.id AND c2.corte = 2
         LEFT JOIN calificaciones c3 ON c3.matricula_id = m.id AND c3.corte = 3
        WHERE m.id <= 15`
    )
    .all();

  const resumenes = filas.map((fila) =>
    calcularResumen(
      { corte1: fila.corte1, corte2: fila.corte2, corte3: fila.corte3 },
      fila
    )
  );

  assert.equal(resumenes.filter((r) => r.estado === 'Aprobado').length, 9);
  assert.equal(resumenes.filter((r) => r.estado === 'Reprobado').length, 2);
  assert.equal(resumenes.filter((r) => r.estado === 'Pendiente').length, 4);

  const reprobada = resumenes.find((r) => r.estado === 'Reprobado');
  assert.equal(reprobada.definitiva, 2.79);

  const pendiente = resumenes.find((r) => r.estado === 'Pendiente');
  assert.equal(pendiente.definitiva, null);
});

test('M21 - editar notas no modifica ponderaciones ni matrículas', async () => {
  const admin = await sesionAdmin();
  const antes = obtenerDb().prepare('SELECT peso1, peso2, peso3 FROM asignaturas WHERE id = 2').get();
  const matriculasAntes = contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 2');

  const { csrf } = await tokenDe(admin, '/matriculas/2/notas');
  const res = await admin.post('/matriculas/2/notas', {
    _csrf: csrf,
    nota1: '3.5',
    nota2: '3.2',
    nota3: '4',
  });
  assert.equal(res.status, 302);

  assert.deepEqual(
    obtenerDb().prepare('SELECT peso1, peso2, peso3 FROM asignaturas WHERE id = 2').get(),
    antes
  );
  assert.equal(contar('SELECT COUNT(*) AS c FROM matriculas WHERE asignatura_id = 2'), matriculasAntes);
  assert.equal(contar('SELECT COUNT(*) AS c FROM calificaciones WHERE matricula_id = 2'), 3);
});

test('M22 - guardar notas sin CSRF devuelve 403 y no escribe', async () => {
  const admin = await sesionAdmin();
  const antes = notasDe(1);

  const res = await admin.post('/matriculas/1/notas', {
    nota1: '1',
    nota2: '1',
    nota3: '1',
  });
  assert.equal(res.status, 403);
  assert.deepEqual(notasDe(1), antes);
});

test('M23 - la matrícula y las notas persisten desde otra conexión SQLite', () => {
  const otra = new DatabaseSync(archivoBd);
  try {
    const matricula = otra
      .prepare('SELECT id, estado FROM matriculas WHERE estudiante_id = 5 AND asignatura_id = 3')
      .get();
    assert.ok(matricula);
    assert.equal(matricula.estado, 'activa');

    const notas = otra
      .prepare('SELECT corte, nota FROM calificaciones WHERE matricula_id = 13 ORDER BY corte')
      .all()
      .map((fila) => ({ corte: fila.corte, nota: fila.nota }));
    assert.deepEqual(notas, [
      { corte: 1, nota: 4 },
      { corte: 2, nota: 4 },
      { corte: 3, nota: 4 },
    ]);
  } finally {
    otra.close();
  }
});

test('M24 - integridad referencial después de matrículas y notas', () => {
  const db = obtenerDb();

  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);

  assert.equal(
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM matriculas m
           LEFT JOIN estudiantes e ON e.id = m.estudiante_id
           LEFT JOIN asignaturas a ON a.id = m.asignatura_id
          WHERE e.id IS NULL OR a.id IS NULL`
      )
      .get().c,
    0
  );

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

test('M25 - no se puede volver a matricular una matrícula retirada', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas');
  const matricula = matriculaPorEstudianteAsignatura(5, 3);
  assert.ok(matricula);

  const retirar = await admin.post(`/matriculas/${matricula.id}/estado`, {
    _csrf: csrf,
    accion: 'retirar',
  });
  assert.equal(retirar.status, 302);

  const repetir = await admin.post('/matriculas', {
    _csrf: csrf,
    estudiante_id: '5',
    asignatura_id: '3',
  });
  assert.equal(repetir.status, 422);
  assert.match(await repetir.text(), /Ya existe una matrícula para este estudiante en esta asignatura/);

  const reactivar = await admin.post(`/matriculas/${matricula.id}/estado`, {
    _csrf: csrf,
    accion: 'reactivar',
  });
  assert.equal(reactivar.status, 302);
  assert.equal(
    obtenerDb().prepare('SELECT estado FROM matriculas WHERE id = ?').get(matricula.id).estado,
    'activa'
  );
});

test('M26 - acciones de estado inválidas devuelven 400 sin cambios', async () => {
  const admin = await sesionAdmin();
  const { csrf } = await tokenDe(admin, '/matriculas/1');

  const res = await admin.post('/matriculas/1/estado', {
    _csrf: csrf,
    accion: 'eliminar',
  });
  assert.equal(res.status, 400);
  assert.equal(obtenerDb().prepare('SELECT estado FROM matriculas WHERE id = 1').get().estado, 'activa');
});
