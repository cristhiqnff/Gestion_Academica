'use strict';

/**
 * Generación de CSV segura.
 *
 * - Escapa comillas dobles, comas y saltos de línea según RFC 4180.
 * - Neutraliza la inyección de fórmulas: si una celda comienza por =, +, -,
 *   @, tabulador o retorno de carro, se antepone un apóstrofo. Así una hoja
 *   de cálculo no interpreta el contenido como fórmula.
 */

const PREFIJOS_PELIGROSOS = /^[=+\-@\t\r]/;

function escaparCelda(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);

  if (PREFIJOS_PELIGROSOS.test(texto)) {
    texto = `'${texto}`;
  }

  if (/[",\r\n]/.test(texto)) {
    texto = `"${texto.replace(/"/g, '""')}"`;
  }

  return texto;
}

/**
 * Convierte una matriz de filas en texto CSV con terminación CRLF.
 * La primera fila se usa como cabecera.
 */
function generarCsv(filas) {
  return `${filas.map((fila) => fila.map(escaparCelda).join(',')).join('\r\n')}\r\n`;
}

/**
 * Limpia un nombre de archivo para usarlo en Content-Disposition.
 */
function nombreArchivoSeguro(valor) {
  const limpio = String(valor || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return limpio || 'reporte';
}

module.exports = { escaparCelda, generarCsv, nombreArchivoSeguro };
