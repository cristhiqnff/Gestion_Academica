-- =====================================================================
-- Sistema de Gestión Académica - Esquema de base de datos (SQLite)
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------
-- Usuarios del sistema (Administrador y Docente)
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre        TEXT    NOT NULL,
  email         TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT    NOT NULL,
  rol           TEXT    NOT NULL CHECK (rol IN ('admin', 'docente')),
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Docentes
-- ---------------------------------------------------------------------
CREATE TABLE docentes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  documento     TEXT    NOT NULL UNIQUE,
  nombres       TEXT    NOT NULL,
  apellidos     TEXT    NOT NULL,
  email         TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  telefono      TEXT,
  especialidad  TEXT,
  usuario_id    INTEGER UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL,
  activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Estudiantes
-- ---------------------------------------------------------------------
CREATE TABLE estudiantes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  documento        TEXT    NOT NULL UNIQUE,
  nombres          TEXT    NOT NULL,
  apellidos        TEXT    NOT NULL,
  email            TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  fecha_nacimiento TEXT,
  programa         TEXT    NOT NULL,
  semestre         INTEGER NOT NULL CHECK (semestre BETWEEN 1 AND 12),
  activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ---------------------------------------------------------------------
-- Asignaturas (una por código y periodo)
-- Los pesos de los tres cortes son configurables y deben sumar 100.
-- ---------------------------------------------------------------------
CREATE TABLE asignaturas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo      TEXT    NOT NULL,
  nombre      TEXT    NOT NULL,
  creditos    INTEGER NOT NULL CHECK (creditos BETWEEN 1 AND 10),
  periodo     TEXT    NOT NULL CHECK (periodo GLOB '[0-9][0-9][0-9][0-9]-[0-9]'),
  docente_id  INTEGER NOT NULL REFERENCES docentes(id) ON DELETE RESTRICT,
  peso1       REAL    NOT NULL DEFAULT 33.33 CHECK (peso1 BETWEEN 0 AND 100),
  peso2       REAL    NOT NULL DEFAULT 33.33 CHECK (peso2 BETWEEN 0 AND 100),
  peso3       REAL    NOT NULL DEFAULT 33.34 CHECK (peso3 BETWEEN 0 AND 100),
  activo      INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (codigo, periodo),
  CHECK (ABS(peso1 + peso2 + peso3 - 100) < 0.011)
);

-- ---------------------------------------------------------------------
-- Matrículas: un estudiante no puede repetir la misma asignatura
-- (las asignaturas ya están separadas por periodo).
-- ---------------------------------------------------------------------
CREATE TABLE matriculas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  estudiante_id INTEGER NOT NULL REFERENCES estudiantes(id) ON DELETE RESTRICT,
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE RESTRICT,
  estado        TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'retirada')),
  creado_en     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (estudiante_id, asignatura_id)
);

-- ---------------------------------------------------------------------
-- Calificaciones: exactamente tres cortes por matrícula
-- ---------------------------------------------------------------------
CREATE TABLE calificaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  matricula_id   INTEGER NOT NULL REFERENCES matriculas(id) ON DELETE CASCADE,
  corte          INTEGER NOT NULL CHECK (corte IN (1, 2, 3)),
  nota           REAL    NOT NULL CHECK (nota >= 0 AND nota <= 5),
  actualizado_en TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  UNIQUE (matricula_id, corte)
);

-- Índices para búsquedas y reportes
CREATE INDEX idx_estudiantes_apellidos ON estudiantes (apellidos, nombres);
CREATE INDEX idx_docentes_apellidos    ON docentes (apellidos, nombres);
CREATE INDEX idx_asignaturas_docente   ON asignaturas (docente_id);
CREATE INDEX idx_matriculas_estudiante ON matriculas (estudiante_id);
CREATE INDEX idx_matriculas_asignatura ON matriculas (asignatura_id);
CREATE INDEX idx_calificaciones_matr   ON calificaciones (matricula_id);

-- ---------------------------------------------------------------------
-- Sesiones (almacén de express-session en SQLite)
-- No guarda contraseñas ni hashes: solo los datos públicos del usuario.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesiones (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expira INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira);
