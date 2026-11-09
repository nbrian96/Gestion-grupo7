# CoopGestión — Administrador + Asociado + PostgreSQL

Esta versión reemplaza el login y los datos compartidos en `localStorage` por un backend real con **Node.js + Express + PostgreSQL**.

## Qué queda guardado en la base

El archivo `sql/schema.sql` crea, entre otras, las tablas:

- `members`: socios, capital y estado de monotributo.
- `users`: usuarios de inicio de sesión vinculados a un socio mediante `member_id`.
- `authorities`: Presidente, Secretario y Tesorero.
- `work_logs`: cargas de horas. Tiene `UNIQUE(member_id, work_date)`.
- `retribution_settings`: valor de hora habitual y especial.
- `holidays`: feriados globales.
- `retribution_transfers`: transferencias registradas.
- `motions`: mociones ordinarias y extraordinarias.
- `votes`: votos. Su PK `(motion_id, member_id)` implementa **1 socio = 1 voto por moción**.
- `minutes_drafts`: borrador de acta.
- `financial_movements` y `fund_movements`: estructura preparada para migrar también finanzas y fondos.

## Usuarios demo

Se crean desde SQL y las contraseñas se guardan hasheadas con `pgcrypto`.

- Administrador: `admin` / `admin`
- Asociado Ana Gómez: `ana` / `1234`
- Asociado Juan Pérez: `juan` / `1234`
- Asociada María Ríos: `maria` / `1234`

Carlos se deja pendiente/no habilitado para representar el flujo de verificación.

## Opción recomendada: ejecutar todo con Docker

Con Docker Desktop instalado:

```bash
docker compose up --build
```

Luego abrir:

```text
http://localhost:3000
```

La base PostgreSQL queda en el volumen `coopgestion_pgdata` y los datos sobreviven al reinicio de los contenedores.

Para borrar la base y volver a ejecutar los seeds:

```bash
docker compose down -v
docker compose up --build
```

## Ejecutarlo sin Docker

1. Crear una base PostgreSQL llamada `coopgestion`.
2. Ejecutar `sql/schema.sql` sobre esa base (o correr `npm run db:init` con `DATABASE_URL` configurada).
3. Copiar `.env.example` a `.env` y ajustar `DATABASE_URL`.
4. Ejecutar:

```bash
npm install
npm start
```

5. Abrir `http://localhost:3000`.

## Flujo para probar la sincronización

1. Abrir una ventana normal y entrar con `admin / admin`.
2. Abrir otra ventana o navegador y entrar con `ana / 1234`.
3. Como Ana, entrar en **Mis horas** y registrar una carga.
4. Volver a Administración → **Trabajo**. La carga aparece desde PostgreSQL.
5. Como Administrador, crear una moción.
6. Como Ana, entrar en **Asamblea** y votar.
7. Volver a Administración → **Asamblea**. El cómputo refleja el voto.

La interfaz consulta de nuevo al backend cada pocos segundos, por lo que también funciona entre dispositivos distintos siempre que ambos puedan acceder al mismo backend.

## Arquitectura

```text
Navegador Administrador ─┐
                         ├── HTTP/JSON ──> Node + Express ──> PostgreSQL
Navegador Asociado ──────┘
```

El frontend en `public/` es servido directamente por el backend de Express. No hay problemas de CORS ni orígenes cruzados.

## Despliegue en Railway

La aplicación está lista para desplegarse como servicio unificado (backend Express + frontend en `public/`) junto a una base PostgreSQL en Railway:

1. Crear un proyecto en [Railway](https://railway.com/) y provisionar **PostgreSQL**.
2. Conectar el repositorio de GitHub como servicio web.
3. Configurar variables de entorno en el servicio web:
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}`
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: Clave secreta segura para firmar tokens JWT.
   - `MONOTRIBUTO_ALERT_DAYS`: `5`
4. Generar dominio público desde **Settings > Networking > Generate Domain**.
5. Al iniciar por primera vez, `scripts/init-db.js` creará automáticamente las tablas y semillas en la base de datos de Railway.

## Constancia de monotributo: almacenamiento real

La constancia ya no se guarda solamente como nombre de archivo en `members.monotributo_file`.
Los PDFs cargados en nuevas altas o reincorporaciones se almacenan en PostgreSQL en
`member_documents.content` (`BYTEA`), junto con nombre, MIME type, tamaño, fecha y el
resultado de la verificación automática. El límite del prototipo es 5 MB por PDF.

La tabla `members` conserva `monotributo_file` y los flags de estado como resumen rápido.
`member_documents` conserva el documento real y permite mantener historial cuando se carga
una nueva constancia en una reincorporación.

El Administrador puede descargar la última constancia desde el detalle del socio y el
asociado puede descargar su propia constancia desde Mi perfil.

Para comprobarlo directamente en PostgreSQL:

```sql
SELECT id, member_id, document_type, file_name, mime_type, file_size,
       auto_verified, cuit_matched, uploaded_at
FROM member_documents
ORDER BY uploaded_at DESC;
```

No conviene hacer `SELECT content` en la consola porque el `BYTEA` puede ser muy grande.

## Control de vencimiento de constancias de monotributo

La constancia actual queda almacenada en `member_documents` con fecha de emisión (si está disponible), fecha de vencimiento, estado de vigencia y resultado de la verificación. No se consulta ARCA ni se calcula una vigencia con reglas externas: la aplicación toma la fecha de vencimiento explícita del PDF y la compara con la fecha actual. Por defecto avisa 5 días antes; ese umbral se configura con `MONOTRIBUTO_ALERT_DAYS`.

- El asociado recibe una alerta en Inicio y Mi perfil cuando la constancia está por vencer o vencida.
- Desde Mi perfil puede subir una nueva constancia; el backend verifica tipo de documento, CUIT y vigencia antes de aceptarla.
- Administración ve en Socios y aportes una lista de asociados con constancias vencidas o próximas a vencer.
- Las constancias anteriores se conservan (`is_current=false`) y la última válida queda como actual.
- La validación final se realiza del lado servidor con `pdf-parse`. PDF.js queda como verificación previa visual en el alta administrativa.

### Criterio de vigencia simplificado

La vigencia se determina exclusivamente comparando `expires_at` con la fecha actual (`CURRENT_DATE` en PostgreSQL). No se realizan consultas oficiales a ARCA y no se infiere el vencimiento a partir de la fecha de emisión. Si el PDF no contiene una fecha de vencimiento reconocible, la carga queda como no verificable y se solicita una constancia donde esa fecha pueda leerse.

## Corrección: PDFs que `pdf-parse` no puede leer

La API usa `pdf-parse` en servidor. Algunos PDFs pueden ser legibles por PDF.js del navegador pero no por esa librería. En ese caso el frontend envía también el texto extraído por PDF.js y el backend vuelve a ejecutar sobre ese texto los controles de CUIT y vencimiento. Además se agregó `express-async-errors` para que un error de validación devuelva HTTP 400 sin detener el proceso Node.

## Historial de asambleas y exportación PDF

Las mociones cerradas ya no muestran el `closed_snapshot` como JSON. El historial presenta el resultado, tipo, regla de mayoría, fecha de cierre, cómputo final y una tabla de votos por asociado con los roles congelados al cierre. Administración puede exportar un PDF detallado generado por el backend a partir del snapshot histórico.

### Contraseñas de asociados
Las credenciales creadas por Administración usan una contraseña temporal. Los asociados deben cambiarla en su primer ingreso y luego pueden actualizarla desde **Mi perfil > Seguridad**.

## Reporte de gestión

La administración dispone de una vista consolidada por período con ingresos, gastos, saldo, horas, retribuciones estimadas, transferencias y fondos. El reporte puede exportarse a PDF. Los datos de prueba de noviembre de 2026 y de paginación de trabajo se aplican automáticamente al desplegar mediante las migraciones en `sql/migrations/`.
