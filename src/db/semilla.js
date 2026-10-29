'use strict';

const { hashPassword } = require('../servicios/password');

const CLAVES_DEMO = {
  admin: 'Admin123*',
  docente: 'Docente123*',
};

/**
 * Lee una contraseña inicial desde el entorno. Si no está definida, usa la de
 * demostración. Las variables permiten cambiar las claves al sembrar la base
 * sin escribirlas en el código ni imprimirlas en los logs.
 */
function claveInicial(nombreVariable, predeterminada) {
  const valor = process.env[nombreVariable];

  if (valor === undefined || String(valor) === '') return predeterminada;

  const texto = String(valor);
  if (texto.length < 8) {
    throw new Error(`${nombreVariable} debe tener al menos 8 caracteres.`);
  }

  return texto;
}

/**
 * Inserta datos de prueba realistas.
 * Contraseñas por defecto:
 *   admin@institucion.edu.co   -> Admin123*
 *   laura.gomez@... / carlos.rios@... -> Docente123*
 * Se pueden sobrescribir con ADMIN_PASSWORD y DOCENTE_PASSWORD.
 */
function sembrar(db) {
  const claveAdmin = claveInicial('ADMIN_PASSWORD', CLAVES_DEMO.admin);
  const claveDocente = claveInicial('DOCENTE_PASSWORD', CLAVES_DEMO.docente);

  const insertarUsuario = db.prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)'
  );
  const insertarDocente = db.prepare(
    `INSERT INTO docentes (documento, nombres, apellidos, email, telefono, especialidad, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertarEstudiante = db.prepare(
    `INSERT INTO estudiantes (documento, nombres, apellidos, email, fecha_nacimiento, programa, semestre)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertarAsignatura = db.prepare(
    `INSERT INTO asignaturas (codigo, nombre, creditos, periodo, docente_id, peso1, peso2, peso3)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertarMatricula = db.prepare(
    'INSERT INTO matriculas (estudiante_id, asignatura_id) VALUES (?, ?)'
  );
  const insertarNota = db.prepare(
    'INSERT INTO calificaciones (matricula_id, corte, nota) VALUES (?, ?, ?)'
  );

  db.exec('BEGIN');
  try {
    insertarUsuario.run('Administrador General', 'admin@institucion.edu.co', hashPassword(claveAdmin), 'admin');
    insertarUsuario.run('Laura Gómez', 'laura.gomez@institucion.edu.co', hashPassword(claveDocente), 'docente');
    insertarUsuario.run('Carlos Ríos', 'carlos.rios@institucion.edu.co', hashPassword(claveDocente), 'docente');

    insertarDocente.run('10101010', 'Laura', 'Gómez', 'laura.gomez@institucion.edu.co', '3001112233', 'Ingeniería de Sistemas', 2);
    insertarDocente.run('20202020', 'Carlos', 'Ríos', 'carlos.rios@institucion.edu.co', '3004445566', 'Matemáticas', 3);

    insertarEstudiante.run('1001', 'Ana María', 'Torres', 'ana.torres@correo.edu.co', '2004-03-12', 'Ingeniería Informática', 3);
    insertarEstudiante.run('1002', 'Luis Felipe', 'Ramírez', 'luis.ramirez@correo.edu.co', '2003-07-25', 'Ingeniería Informática', 5);
    insertarEstudiante.run('1003', 'Sofía', 'Cárdenas', 'sofia.cardenas@correo.edu.co', '2005-01-09', 'Ingeniería Informática', 1);
    insertarEstudiante.run('1004', 'Andrés', 'Mejía', 'andres.mejia@correo.edu.co', '2002-11-30', 'Ingeniería Informática', 7);
    insertarEstudiante.run('1005', 'Valentina', 'Ospina', 'valentina.ospina@correo.edu.co', '2004-06-18', 'Ingeniería Informática', 3);
    insertarEstudiante.run('1006', 'Mateo', 'Herrera', 'mateo.herrera@correo.edu.co', '2003-09-02', 'Ingeniería Informática', 5);

    // Pesos distintos a propósito: 30/30/40, 20/30/50, 25/25/50 y 33.33/33.33/33.34
    insertarAsignatura.run('INF101', 'Programación I', 4, '2026-1', 1, 30, 30, 40);
    insertarAsignatura.run('MAT101', 'Cálculo I', 4, '2026-1', 2, 20, 30, 50);
    insertarAsignatura.run('BD201', 'Bases de Datos', 3, '2026-1', 1, 25, 25, 50);
    insertarAsignatura.run('ING301', 'Inglés Técnico', 2, '2026-1', 2, 33.33, 33.33, 33.34);

    // Matrículas (estudiante, asignatura)
    const matriculas = [
      [1, 1], [1, 2], [1, 4],
      [2, 1], [2, 3],
      [3, 2], [3, 3],
      [4, 1], [4, 3], [4, 4],
      [5, 2], [5, 4],
      [6, 1], [6, 2], [6, 3],
    ];
    for (const [estudianteId, asignaturaId] of matriculas) {
      insertarMatricula.run(estudianteId, asignaturaId);
    }

    // Calificaciones: algunas completas, otras parciales y una sin notas
    const notas = [
      // matrícula 1 (Ana - Programación I): completa, aprueba
      [1, 1, 4.0], [1, 2, 3.8], [1, 3, 4.5],
      // matrícula 2 (Ana - Cálculo I): completa, aprueba
      [2, 1, 3.5], [2, 2, 3.2], [2, 3, 4.0],
      // matrícula 3 (Ana - Inglés): completa, aprueba
      [3, 1, 4.2], [3, 2, 4.5], [3, 3, 4.8],
      // matrícula 4 (Luis - Programación I): completa, reprueba
      [4, 1, 2.5], [4, 2, 2.8], [4, 3, 3.0],
      // matrícula 5 (Luis - Bases de Datos): parcial (2 notas)
      [5, 1, 3.9], [5, 2, 4.1],
      // matrícula 6 (Sofía - Cálculo I): completa, aprueba
      [6, 1, 3.0], [6, 2, 3.5], [6, 3, 3.6],
      // matrícula 7 (Sofía - Bases de Datos): completa, aprueba
      [7, 1, 4.0], [7, 2, 4.2], [7, 3, 3.9],
      // matrícula 8 (Andrés - Programación I): completa, aprueba
      [8, 1, 4.5], [8, 2, 4.0], [8, 3, 4.2],
      // matrícula 9 (Andrés - Bases de Datos): parcial (1 nota)
      [9, 1, 3.7],
      // matrícula 10 (Andrés - Inglés): completa, aprueba
      [10, 1, 3.8], [10, 2, 4.0], [10, 3, 4.1],
      // matrícula 11 (Valentina - Cálculo I): completa, reprueba
      [11, 1, 2.0], [11, 2, 2.5], [11, 3, 2.9],
      // matrícula 12 (Valentina - Inglés): completa, aprueba
      [12, 1, 4.0], [12, 2, 3.9], [12, 3, 4.4],
      // matrícula 13 (Mateo - Programación I): completa, aprueba
      [13, 1, 3.6], [13, 2, 3.4], [13, 3, 3.8],
      // matrícula 14 (Mateo - Cálculo I): parcial (2 notas)
      [14, 1, 3.2], [14, 2, 3.4],
      // matrícula 15 (Mateo - Bases de Datos): sin notas
    ];
    for (const [matriculaId, corte, nota] of notas) {
      insertarNota.run(matriculaId, corte, nota);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { sembrar, CLAVES_DEMO };
