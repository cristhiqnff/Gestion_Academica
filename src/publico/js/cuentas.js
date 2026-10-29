'use strict';

// Muestra u oculta los campos de contraseña al crear la cuenta del docente.
document.addEventListener('DOMContentLoaded', function () {
  const casilla = document.getElementById('crear_cuenta');
  const campos = document.getElementById('campos-password');
  if (!casilla || !campos) return;

  const sincronizar = function () {
    campos.classList.toggle('oculto', !casilla.checked);
  };

  casilla.addEventListener('change', sincronizar);
  sincronizar();
});
