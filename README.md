# Sistema de Gestión Académica

Aplicación web para administrar estudiantes, docentes, asignaturas, matrículas y
calificaciones, calcular la nota definitiva con ponderaciones configurables y
generar reportes académicos.

## Requisitos

- Node.js **22.5 o superior** (probado con Node.js 26.3.1). Se necesita una versión
  que incluya el módulo integrado `node:sqlite`.
- npm (incluido con Node.js).
- Windows, Linux o macOS.

## Puesta en marcha

```powershell
cd "C:\Users\camil\Documents\Default Project\gestion-academica"
npm install
Copy-Item .env.example .env
npm run db:preparar
npm start
```

Abre <http://localhost:3000>. Serás redirigido al inicio de sesión.

La primera vez que se ejecuta `npm start`, si la base de datos no existe, se crea
automáticamente con datos de prueba (solo en desarrollo). Para reiniciarla desde
cero usa `npm run db:preparar`.

## Comandos

| Comando | Descripción |
|---|---|
| `npm start` | Inicia el servidor en el puerto 3000 |
| `npm run dev` | Inicia con recarga automática |
| `npm run db:preparar` | Borra y recrea la base de datos con datos de prueba (desarrollo) |
| `npm run db:verificar` | Muestra tablas, conteos, integridad y definitivas calculadas |
| `npm test` | Ejecuta las pruebas automatizadas |

## Usuarios de demostración

| Rol | Correo | Contraseña inicial |
|---|---|---|
| Administrador | admin@institucion.edu.co | Admin123* |
| Docente | laura.gomez@institucion.edu.co | Docente123* |
| Docente | carlos.rios@institucion.edu.co | Docente123* |

Son cuentas **solo de demostración**, también en el despliegue de Render. Las
contraseñas iniciales se pueden sobrescribir al crear la base con
`ADMIN_PASSWORD` y `DOCENTE_PASSWORD` (mínimo 8 caracteres); nunca se imprimen en
los logs. El formulario muestra la ayuda de acceso únicamente cuando
`NODE_ENV` es distinto de `production`.

## Autenticación y sesiones

- Contraseñas almacenadas con **scrypt** y sal aleatoria (`src/servicios/password.js`).
- Comparación con `crypto.timingSafeEqual`; si el correo no existe se compara
  contra un hash ficticio para no revelar qué usuarios están registrados.
- El identificador de sesión se **regenera** al iniciar sesión (evita fijación).
- Cookie `HttpOnly`, `SameSite=Lax` y `Secure` cuando `NODE_ENV=production`
  (requiere HTTPS) o `COOKIE_SECURE=true`.
- Las sesiones se guardan en la tabla `sesiones` de SQLite mediante un almacén
  propio (`src/db/sesiones.store.js`). **No se usa `MemoryStore`**: las sesiones
  sobreviven a reinicios y no se pierden al escalar el proceso.
- Los datos de sesión solo contienen `id`, `nombre`, `email`, `rol` y `docenteId`;
  nunca contraseñas ni hashes.
- Todas las peticiones `POST` requieren token CSRF (`src/middleware/seguridad.js`).

## Roles

| Rol | Acceso |
|---|---|
| Administrador | `/admin`, gestión de estudiantes, docentes, asignaturas y matrículas; reportes globales |
| Docente | `/docente`, consulta de sus asignaturas, registro de notas propias y reportes de lo suyo |

Las restricciones se validan en el servidor con `requiereRol(...)`; un acceso no
autorizado devuelve **403**, no solo se oculta el enlace.

## Módulo de estudiantes

Disponible solo para el rol **Administrador** en `/estudiantes`.

| Método | Ruta | Acción |
|---|---|---|
| GET | `/estudiantes` | Listado con búsqueda, filtro por estado y paginación |
| GET | `/estudiantes/nuevo` | Formulario de registro |
| POST | `/estudiantes` | Crear estudiante (CSRF) |
| GET | `/estudiantes/:id` | Ficha con historial académico |
| GET | `/estudiantes/:id/editar` | Formulario de edición |
| POST | `/estudiantes/:id` | Actualizar estudiante (CSRF) |
| POST | `/estudiantes/:id/estado` | Activar o inactivar (CSRF) |

- **Búsqueda:** por nombres, apellidos, documento o correo, con `LIKE` parametrizado.
- **Filtro:** todos, activos o inactivos.
- **Paginación:** 5, 10 o 20 registros por página.
- **Validaciones:** documento de 4 a 20 dígitos, nombres y apellidos de 2 a 80
  caracteres, correo válido y único, fecha no futura, programa de 3 a 100
  caracteres y semestre entre 1 y 12.
- **Duplicados:** se comprueban antes de guardar y la base de datos los vuelve a
  rechazar mediante `UNIQUE` si hay concurrencia.
- **Inactivación lógica:** no existe borrado físico. Un estudiante inactivo
  conserva sus matrículas y calificaciones, y su historial sigue visible.
- Los formularios conservan los datos escritos cuando hay errores de validación.
- Todas las vistas escapan los datos con `<%= %>` de EJS.

## Módulo de docentes

Disponible solo para el rol **Administrador** en `/docentes`.

| Método | Ruta | Acción |
|---|---|---|
| GET | `/docentes` | Listado con búsqueda, filtro por estado y paginación |
| GET | `/docentes/nuevo` | Formulario de registro |
| POST | `/docentes` | Crear docente y, opcionalmente, su cuenta (CSRF) |
| GET | `/docentes/:id` | Ficha con cuenta y asignaturas asignadas |
| GET | `/docentes/:id/editar` | Formulario de edición |
| POST | `/docentes/:id` | Actualizar docente (CSRF) |
| POST | `/docentes/:id/estado` | Activar o inactivar docente y su cuenta (CSRF) |

- **Búsqueda:** por nombres, apellidos, documento o correo.
- **Cuenta de acceso opcional:** `docentes.usuario_id` es opcional y único. Al
  crear un docente se puede marcar la casilla para generar una cuenta con rol
  DOCENTE; la contraseña se guarda con **scrypt** y nunca se muestra ni se
  devuelve en las respuestas. Si no se marca, el docente queda sin acceso.
- **Edición sin duplicar cuentas:** si el docente ya tiene cuenta, se actualizan
  nombre y correo de esa misma cuenta; la contraseña solo cambia si se escribe
  una nueva. Si no tiene cuenta, la casilla permite crearla una sola vez.
- **Duplicados:** documento y correo son únicos (el correo sin distinguir
  mayúsculas). También se valida que el correo no pertenezca a otro usuario.
- **Inactivación lógica:** no existe borrado físico. Al inactivar un docente
  también se deshabilita su cuenta de acceso, pero se conservan sus asignaturas,
  matrículas y calificaciones. Al reactivarlo, la cuenta vuelve a habilitarse.
- No se puede eliminar un docente con asignaturas relacionadas: la aplicación no
  expone borrado y la FK `asignaturas.docente_id` usa `ON DELETE RESTRICT`.

## Módulo de asignaturas

Disponible solo para el rol **Administrador** en `/asignaturas`.

| Método | Ruta | Acción |
|---|---|---|
| GET | `/asignaturas` | Listado con búsqueda, filtro por docente/estado y paginación |
| GET | `/asignaturas/nuevo` | Formulario de registro |
| POST | `/asignaturas` | Crear asignatura (CSRF) |
| GET | `/asignaturas/:id` | Detalle con docente, matrículas y notas calculadas |
| GET | `/asignaturas/:id/editar` | Formulario de edición |
| POST | `/asignaturas/:id` | Actualizar asignatura (CSRF) |
| POST | `/asignaturas/:id/estado` | Activar o inactivar (CSRF) |

- **Docente responsable:** obligatorio y debe estar activo (o ser el docente
  actual al editar). La FK impide referencias inexistentes.
- **Unicidad:** `UNIQUE (codigo, periodo)`; el mismo código puede existir en otro
  periodo.
- **Validaciones:** código de 2 a 20 caracteres, nombre de 3 a 100, créditos
  enteros entre 1 y 10 y periodo con formato `AAAA-N`.
- **Ponderaciones:** tres cortes configurables que deben sumar 100 % (tolerancia
  `0.011`, igual que el `CHECK` de SQLite). No se asumen pesos iguales.
- **Edición segura:** si el formulario no envía las ponderaciones, se conservan
  las existentes. Cambiar nombre, docente u otros campos no las reinicia.
- **Nota definitiva:** no se almacena; se calcula a partir de las notas de los
  tres cortes y las ponderaciones de la asignatura.
- **Inactivación lógica:** conserva matrículas y calificaciones. El detalle incluye
  enlaces al flujo de matrículas, donde se consultan y registran las notas.

## Módulo de matrículas y calificaciones

La administración de matrículas está disponible solo para **Administrador** en
`/matriculas`. Los docentes acceden a las notas de sus propias asignaturas desde
`/docente` y `/docente/asignaturas/:id`.

| Método | Ruta | Rol | Acción |
|---|---|---|---|
| GET | `/matriculas` | ADMIN | Listado con búsqueda, filtros y paginación |
| GET | `/matriculas/nueva` | ADMIN | Formulario de matrícula |
| POST | `/matriculas` | ADMIN | Crear matrícula (CSRF) |
| GET | `/matriculas/:id` | ADMIN | Detalle de la matrícula |
| POST | `/matriculas/:id/estado` | ADMIN | Retirar o reactivar (CSRF) |
| GET | `/matriculas/:id/notas` | ADMIN / DOCENTE propietario | Formulario de notas |
| POST | `/matriculas/:id/notas` | ADMIN / DOCENTE propietario | Guardar notas (CSRF) |
| GET | `/docente/asignaturas/:id` | DOCENTE propietario | Estudiantes y notas de su asignatura |

- **Listado:** búsqueda por estudiante, documento, código o nombre de asignatura;
  filtros por estudiante, asignatura, periodo y estado; paginación de 5, 10 o 20.
- **Matriculación:** solo estudiantes y asignaturas activos. La combinación
  estudiante + asignatura es única; un duplicado devuelve **422** con el mensaje
  para reactivar la matrícula existente en lugar de crear otra.
- **Retiro lógico:** el estado pasa de `activa` a `retirada` y viceversa. No se
  eliminan la matrícula ni sus calificaciones.
- **Notas:** los tres cortes se guardan en `calificaciones` con `UNIQUE
  (matricula_id, corte)`. Cada nota debe estar entre **0.0 y 5.0**.
- **Nota pendiente:** un campo vacío se guarda como **ausente** (se elimina la fila
  de ese corte), nunca como `0`. El esquema define `nota NOT NULL`, por lo que la
  ausencia se representa con la fila inexistente.
- **Definitiva:** se calcula como
  `nota1 * peso1 / 100 + nota2 * peso2 / 100 + nota3 * peso3 / 100`, redondeada a
  dos decimales. **No se almacena** en la base de datos.
- **Estado académico:** si falta al menos una nota es **Pendiente**; con las tres
  notas, es **Aprobado** si la definitiva es mayor o igual a **3.0** y **Reprobado**
  en caso contrario. Con los datos de prueba se obtienen 9 aprobados, 2 reprobados
  y 4 pendientes.
- **Permisos docentes:** un DOCENTE solo puede ver y registrar notas si
  `docentes.usuario_id` corresponde a su usuario y `asignaturas.docente_id`
  coincide con su perfil. Cualquier asignatura ajena devuelve **403**. Un ADMIN
  puede operar sobre todas.
- **Edición de notas:** no modifica las ponderaciones de la asignatura ni las
  matrículas. Los cambios quedan sujetos a CSRF y se registran en SQLite.

## Módulo de reportes y estadísticas

El panel está en `/reportes`. El **Administrador** ve todas las asignaturas y
puede consultar el reporte por estudiante; el **Docente** ve únicamente las
asignaturas vinculadas a su perfil (`docentes.usuario_id` →
`asignaturas.docente_id`). Una asignatura ajena devuelve **403** y un recurso
inexistente **404**.

| Método | Ruta | Rol | Acción |
|---|---|---|---|
| GET | `/reportes` | ADMIN / DOCENTE | Panel de estadísticas y resumen por asignatura |
| GET | `/reportes/exportar.csv` | ADMIN / DOCENTE | CSV del resumen (global o de sus asignaturas) |
| GET | `/reportes/asignaturas/:id` | ADMIN / DOCENTE propietario | Reporte detallado de la asignatura |
| GET | `/reportes/asignaturas/:id/exportar.csv` | ADMIN / DOCENTE propietario | CSV del detalle de la asignatura |
| GET | `/reportes/estudiantes` | ADMIN | Listado con promedio general por estudiante |
| GET | `/reportes/estudiantes/exportar.csv` | ADMIN | CSV del listado de estudiantes |
| GET | `/reportes/estudiantes/:id` | ADMIN | Historial académico y promedio general |
| GET | `/reportes/estudiantes/:id/exportar.csv` | ADMIN | CSV del historial del estudiante |

- **Métricas por asignatura:** matrículas activas, retiradas, estudiantes con
  definitiva, promedio, aprobados, reprobados, pendientes, nota máxima y mínima.
- **Métricas por estudiante:** historial de asignaturas con notas, definitiva y
  estado, además del promedio general.
- **Definitiva:** se calcula al consultar con `src/servicios/calificaciones.js`
  (misma regla de la Etapa 5: suma ponderada, umbral **3.0** y redondeo a dos
  decimales). No se almacena ni se duplica la fórmula en SQL.
- **Pendientes:** una nota ausente no vale cero. Las matrículas con menos de tres
  notas no entran en promedios, máximas ni mínimas; se contabilizan como
  pendientes.
- **Retiradas:** el criterio de los reportes es **excluirlas** de los conteos,
  promedios y notas máxima/mínima. Se muestran en el detalle con su estado y se
  informan en una columna/contador aparte. El criterio aparece en pantalla y en
  este README.
- **Alcance del docente:** sus estadísticas se limitan a sus asignaturas. El
  reporte por estudiante es exclusivo del ADMIN porque cruza todas las
  asignaturas del sistema.
- **CSV:** `Content-Type: text/csv; charset=utf-8` y `Content-Disposition:
  attachment`. Se escapan comillas dobles, comas y saltos de línea según RFC
  4180. Las celdas que comienzan por `=`, `+`, `-`, `@`, tabulador o retorno de
  carro se prefijan con un apóstrofo para prevenir inyección de fórmulas.
- Los reportes son de solo lectura: no modifican matrículas, calificaciones ni
  ponderaciones.

## Pruebas automatizadas

`npm test` ejecuta **105 pruebas** de integración con `node:test`:

- 13 de autenticación, sesiones, roles y CSRF.
- 17 del módulo de estudiantes.
- 29 de docentes y asignaturas (permisos, cuentas, duplicados, ponderaciones,
  persistencia, conservación de matrículas/notas e integridad referencial).
- 26 de matrículas y calificaciones (acceso, duplicados, retiro/reactivación,
  notas válidas e inválidas, definitiva, permisos docentes, CSRF, persistencia e
  integridad referencial).
- 20 de reportes (permisos, totales del seed, exclusión de pendientes y retiradas,
  promedio, CSV con escape e inyección de fórmulas, 404 y solo lectura).

Cada archivo de prueba usa su propia base de datos aislada en `datos/` y la
elimina al terminar; la base real `datos/academico.db` no se toca.

## Despliegue en Render (plan gratuito)

El proyecto incluye `Dockerfile`, `.dockerignore` y `render.yaml` para desplegar
como servicio web Docker. La imagen usa `node:26-bookworm-slim` (tag oficial
verificado) y ejecuta la aplicación con un usuario sin privilegios.

### Variables de entorno

| Variable | Obligatoria | Valor |
|---|---|---|
| `NODE_ENV` | Sí | `production` |
| `SESSION_SECRET` | Sí | Secreto largo; en `render.yaml` usa `generateValue: true` |
| `DB_PATH` | Recomendada | `/app/datos/academico.db` (directorio escribible del contenedor) |
| `PORT` | La define Render | El servidor escucha en `0.0.0.0:$PORT` |
| `ADMIN_PASSWORD` | No | Sobrescribe la clave inicial del administrador (mín. 8) |
| `DOCENTE_PASSWORD` | No | Sobrescribe la clave inicial de ambos docentes (mín. 8) |

Si falta `SESSION_SECRET` con `NODE_ENV=production`, la aplicación **no arranca**.
No hay secretos escritos en el código ni en `render.yaml`.

### Pasos en GitHub

1. Crea un repositorio vacío en GitHub (puede ser privado).
2. Desde la carpeta `gestion-academica`:

   ```powershell
   git init
   git add .
   git commit -m "Preparar despliegue en Render"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
   git push -u origin main
   ```

3. Confirma que `Dockerfile`, `.dockerignore` y `render.yaml` están en la raíz del
   repositorio y que `datos/*.db`, `.env` y `node_modules` **no** se subieron.

### Pasos en Render

1. Entra en <https://dashboard.render.com> y elige **New → Blueprint**.
2. Conecta el repositorio de GitHub. Render leerá `render.yaml`.
3. Revisa el servicio `gestion-academica` (runtime Docker, plan **free**,
   health check `/salud`) y pulsa **Apply**.
4. Espera el build. La primera petición puede tardar por el arranque en frío.
5. Comprueba `https://TU-SERVICIO.onrender.com/salud`: debe responder `200` con
   `estado: "ok"` sin iniciar sesión.
6. Opcional: en **Environment** del servicio agrega `ADMIN_PASSWORD` y
   `DOCENTE_PASSWORD` antes del primer arranque si no quieres las claves de demo.
   Si la base ya se creó, cámbialas desde la aplicación o recrea el servicio.
7. Cada push a la rama conectada vuelve a desplegar automáticamente.

### Verificación local con Docker

```powershell
docker build -t gestion-academica .
docker run --rm -p 3000:3000 `
  -e SESSION_SECRET="una-clave-larga-y-aleatoria" `
  -e ADMIN_PASSWORD="DemoAdmin123*" `
  gestion-academica
```

Abre <http://localhost:3000>. El contenedor usa
`DB_PATH=/app/datos/academico.db`; al ser un disco efímero, al eliminar el
contenedor se pierde la base y el siguiente arranque la recrea.

Si Docker no está disponible, se puede simular producción sobre una copia
aislada:

```powershell
$env:NODE_ENV='production'
$env:SESSION_SECRET='una-clave-larga-y-aleatoria'
$env:DB_PATH="$env:TEMP\academico-prueba.db"
$env:PORT='3000'
npm start
```

### Limitaciones del plan gratuito

- **La base de datos es efímera.** Render no ofrece disco persistente en el plan
  gratuito: la base SQLite se pierde en cada reinicio, redespliegue o despertar
  tras la suspensión. En cada arranque, si el archivo no existe, la aplicación
  crea el esquema y carga los datos de demostración. Los datos creados desde la
  web **no sobreviven**.
- **El servicio se suspende** tras unos 15 minutos sin tráfico y el primer
  acceso tarda aproximadamente 30–60 segundos. El health check puede fallar
  durante ese arranque; es normal.
- Una sola instancia: SQLite no está pensado para varias réplicas ni para
  escritura concurrente intensa.
- Es una **demo**. Para datos reales usa un disco persistente de pago o una base
  gestionada, y desactiva la siembra automática de demostración.

## Producción

1. Define `SESSION_SECRET` (obligatorio; la aplicación no arranca sin él).
2. Define `NODE_ENV=production` y sirve la aplicación por HTTPS.
3. Define `DB_PATH` en un directorio escribible y persistente si necesitas
   conservar datos. Si el archivo no existe, se crea con el esquema y el seed de
   demostración.
4. `npm run db:preparar` es exclusivamente para desarrollo: borra la base.

## Estructura

```text
src/
├─ config.js
├─ app.js / server.js
├─ db/            conexión, esquema, semilla, sesiones, verificación
├─ repositorios/  acceso a datos
├─ servicios/     autenticación y contraseñas
├─ controladores/ lógica de las pantallas
├─ middleware/    autenticación, roles y CSRF
├─ rutas/         definición de endpoints
├─ vistas/        plantillas EJS
└─ publico/       CSS y JavaScript del navegador
pruebas/          pruebas de integración con node:test
```

## Estado del proyecto

- [x] Etapa 1: estructura, base de datos, datos de prueba, conexión y panel inicial
- [x] Etapa 2: autenticación, sesiones en SQLite, roles y CSRF
- [x] Etapa 3: módulo de estudiantes (listado, búsqueda, CRUD lógico y pruebas)
- [x] Etapa 4: módulo de docentes y asignaturas con cuentas, ponderaciones y pruebas
- [x] Etapa 5: matrículas y calificaciones con permisos docentes y definitiva calculada
- [x] Etapa 6: reportes, estadísticas y exportación CSV con permisos por rol
- [ ] Etapa 7: pruebas y rendimiento
- [ ] Etapa 8: documentación y trazabilidad
