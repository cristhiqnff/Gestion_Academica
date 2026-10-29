'use strict';

const { Store } = require('express-session');
const { obtenerDb } = require('./conexion');

/**
 * Almacén de sesiones en SQLite.
 * Sustituye a MemoryStore: las sesiones sobreviven a reinicios y no se
 * pierden ni consumen memoria del proceso.
 */
class SesionesStore extends Store {
  constructor(opciones = {}) {
    super();
    this.ttlMs = opciones.ttlMs || 1000 * 60 * 60 * 2;
    this.db = obtenerDb();

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sesiones (
        sid    TEXT PRIMARY KEY,
        sess   TEXT NOT NULL,
        expira INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira);
    `);

    this.db.prepare('DELETE FROM sesiones WHERE expira < ?').run(Date.now());

    this.sqlObtener = this.db.prepare('SELECT sess, expira FROM sesiones WHERE sid = ?');
    this.sqlGuardar = this.db.prepare(
      `INSERT INTO sesiones (sid, sess, expira) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expira = excluded.expira`
    );
    this.sqlEliminar = this.db.prepare('DELETE FROM sesiones WHERE sid = ?');
    this.sqlTocar = this.db.prepare('UPDATE sesiones SET expira = ? WHERE sid = ?');
    this.sqlLimpiar = this.db.prepare('DELETE FROM sesiones');
    this.sqlContar = this.db.prepare('SELECT COUNT(*) AS c FROM sesiones WHERE expira >= ?');
  }

  calcularExpiracion(sess) {
    const expiraCookie = sess && sess.cookie && sess.cookie.expires;
    if (!expiraCookie) return Date.now() + this.ttlMs;
    const valor = new Date(expiraCookie).getTime();
    return Number.isNaN(valor) ? Date.now() + this.ttlMs : valor;
  }

  get(sid, callback) {
    try {
      const fila = this.sqlObtener.get(sid);
      if (!fila) return callback(null, null);
      if (fila.expira < Date.now()) {
        this.sqlEliminar.run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(fila.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const expira = this.calcularExpiracion(sess);
      this.sqlGuardar.run(sid, JSON.stringify(sess), expira);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.sqlEliminar.run(sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  touch(sid, sess, callback) {
    try {
      this.sqlTocar.run(this.calcularExpiracion(sess), sid);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  clear(callback) {
    try {
      this.sqlLimpiar.run();
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  length(callback) {
    try {
      const { c } = this.sqlContar.get(Date.now());
      return callback(null, c);
    } catch (error) {
      return callback(error);
    }
  }
}

module.exports = { SesionesStore };
