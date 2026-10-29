'use strict';

const config = require('../config');
const { obtenerDb, cerrarDb } = require('./conexion');

/**
 * Comprueba la integridad y el contenido de la base de datos.
 * Uso: npm run db:verificar
 */
function verificar() {
  const db = obtenerDb();

  console.log('Archivo de base de datos:', config.rutaBaseDatos);
  console.log('\n--- Tablas ---');
  const tablas = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all();
  console.log(tablas.map((t) => t.name).join(', '));

  console.log('\n--- Conteo de registros ---');
  for (const { name } of tablas) {
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM ${name}`).get();
    console.log(`${name.padEnd(16)} ${c}`);
  }

  console.log('\n--- Integridad referencial (PRAGMA foreign_key_check) ---');
  const fallas = db.prepare('PRAGMA foreign_key_check').all();
  console.log(fallas.length === 0 ? 'OK: sin violaciones de llaves foráneas' : fallas);

  console.log('\n--- Suma de pesos por asignatura (debe ser 100) ---');
  const pesos = db
    .prepare(
      `SELECT codigo, periodo, peso1, peso2, peso3,
              ROUND(peso1 + peso2 + peso3, 2) AS suma
         FROM asignaturas ORDER BY codigo`
    )
    .all();
  console.table(pesos);

  console.log('\n--- Definitivas y estado académico (calculados) ---');
  const definitivas = db
    .prepare(
      `SELECT e.documento,
              e.nombres || ' ' || e.apellidos AS estudiante,
              a.codigo AS asignatura,
              COALESCE(c1.nota, NULL) AS corte1,
              COALESCE(c2.nota, NULL) AS corte2,
              COALESCE(c3.nota, NULL) AS corte3,
              CASE WHEN c1.nota IS NOT NULL AND c2.nota IS NOT NULL AND c3.nota IS NOT NULL
                   THEN ROUND(c1.nota * a.peso1 / 100.0 + c2.nota * a.peso2 / 100.0 + c3.nota * a.peso3 / 100.0, 2)
                   ELSE NULL END AS definitiva,
              CASE WHEN c1.nota IS NULL OR c2.nota IS NULL OR c3.nota IS NULL THEN 'Pendiente'
                   WHEN (c1.nota * a.peso1 / 100.0 + c2.nota * a.peso2 / 100.0 + c3.nota * a.peso3 / 100.0) >= 3.0
                   THEN 'Aprobado' ELSE 'Reprobado' END AS estado
         FROM matriculas m
         JOIN estudiantes e ON e.id = m.estudiante_id
         JOIN asignaturas a ON a.id = m.asignatura_id
         LEFT JOIN calificaciones c1 ON c1.matricula_id = m.id AND c1.corte = 1
         LEFT JOIN calificaciones c2 ON c2.matricula_id = m.id AND c2.corte = 2
         LEFT JOIN calificaciones c3 ON c3.matricula_id = m.id AND c3.corte = 3
        ORDER BY e.apellidos, a.codigo`
    )
    .all();
  console.table(definitivas);

  const pendientes = definitivas.filter((d) => d.estado === 'Pendiente').length;
  const aprobados = definitivas.filter((d) => d.estado === 'Aprobado').length;
  const reprobados = definitivas.filter((d) => d.estado === 'Reprobado').length;
  console.log(`Resumen: ${aprobados} aprobados, ${reprobados} reprobados, ${pendientes} pendientes.`);

  cerrarDb();
}

try {
  verificar();
} catch (error) {
  console.error('Error al verificar la base de datos:', error.message);
  process.exitCode = 1;
}
