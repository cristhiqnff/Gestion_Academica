'use strict';

const config = require('./config');
const { asegurarBaseDatos } = require('./db/inicializar');
const { cerrarDb } = require('./db/conexion');

// La base debe estar lista antes de cargar la aplicación: el almacén de
// sesiones abre SQLite al construirse y, si el archivo aún no existe, lo crea
// vacío. Inicializar primero evita que la comprobación "¿existe la base?"
// encuentre un archivo sin esquema.
const resultado = (() => {
  try {
    return asegurarBaseDatos();
  } catch (error) {
    console.error('ERROR al inicializar la base de datos:', error.message);
    process.exit(1);
  }
})();
if (resultado.creada) {
  console.log('Base de datos creada automáticamente con el esquema y los datos de demostración.');
}

const app = require('./app');

const servidor = app.listen(config.puerto, config.host, () => {
  console.log(`Sistema de Gestión Académica escuchando en ${config.host}:${config.puerto}`);
  console.log(`Entorno: ${config.entorno}`);
});

function apagar(senal) {
  console.log(`\nCerrando servidor (${senal})...`);
  servidor.close(() => {
    cerrarDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
