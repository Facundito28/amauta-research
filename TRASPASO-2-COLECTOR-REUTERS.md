# Colector LSEG/Reuters + el `.bat` — runbook

El **Monitor CEDEARs** y las **Noticias Reuters** de Amauta Local **no** se alimentan desde la web: los llena un **colector externo** que corre en la **PC de Reuters** (Windows) y baja datos de **LSEG Refinitiv / Reuters Eikon**. Escribe directo a Supabase con la **service_role key**. Este colector **no está en ningún repo** — vive solo en esa PC (a la que ya tenés acceso).

> Este runbook es para correr **en la PC de Reuters, con tu Claude Code**. Objetivo: ubicar el colector, entenderlo, y hacer que además (o en vez de) escribir al Supabase de producción, escriba a **TU Supabase nuevo**. No rompas el colector de producción: **duplicá y apuntá a lo tuyo**.

## Paso 1 — Ubicar el colector y el `.bat`
En la PC de Reuters, pedile a tu Claude:
- Buscar el `.bat` en el **Programador de tareas de Windows** (`schtasks /query /fo LIST /v`) y en carpetas típicas (Escritorio, Documentos, `C:\`, `C:\scripts`, `C:\colector`, o donde esté Eikon).
- Buscar archivos que mencionen las tablas objetivo o Eikon:
  ```
  findstr /s /i /m "cedears_live cedears_params cedears_news eikon refinitiv service_role" C:\*.py C:\*.js C:\*.ps1 C:\*.bat
  ```
- Identificar runtime (Python + `eikon`/`refinitiv-data`/`lseg-data`, o Node), el script principal, la frecuencia (el `.bat`/tarea programada), y **de dónde saca la service_role key** (config/`.env`).

## Paso 2 — Entender qué escribe (contrato de tablas)
El colector debe mantener estas tablas de **tu** Supabase (mismo esquema que `supabase/schema-portal.sql`):

| Tabla | Frecuencia | Contenido clave |
|---|---|---|
| `cedears_live` | intradía | 1 fila por especie: `precio_usd/ars`, `var`, `ccl`, `fair_value`, `dif_fv`, `estado_fv`, fundamentals (`pe`,`pb`,`ev_ebitda`,`mg_*`,`div_yield`), consenso (`rec`,`target*`,`upside`), retornos (`ret_1m/3m/ytd/1y`), `prices_updated_at`, `fundamentals_updated_at`. |
| `cedears_params` (`id=1`) | **cada pocos minutos** | `ccl_ref`, `mep`, `al30*`, `market_open`, `collector_status`, `collector_error`, **`updated_at` = heartbeat**. ⚠️ La web muestra "Colector offline" si `updated_at` tiene >15 min. Mantené este latido. |
| `cedears_series` | diario (cierre) | histórico OHLC: `close_ars`, `close_usd`, `vol_ars` por `(especie,fecha)`. |
| `cedears_history` | diario | `precio_ars/usd`, `ccl`, `dif_fv`, `valuacion` por `(especie,fecha)`. |
| `cedears_news` | cada hora | titulares Reuters: `story_id` (PK, para dedupe), `especie`, `headline`, `source`, `published_at`. |

Fuente de datos: **LSEG Refinitiv/Eikon** (RICs en `cedears_live.ric_usd`/`ric_ars`). Requiere la **app key / sesión de Eikon** que ya está configurada en esa PC.

## Paso 3 — Re-apuntar a TU Supabase
1. En la config del colector, cambiar `SUPABASE_URL` y `SERVICE_ROLE_KEY` por los de **tu** proyecto nuevo (los sacás de Supabase → Project Settings → API). **No** commitees esa key a ningún repo.
2. Correr una pasada manual y verificar que se poblaron `cedears_live` y `cedears_params` (y que `updated_at` late).
3. Programar el `.bat` en el Task Scheduler con la misma frecuencia (o duplicar la tarea existente apuntando a tu config).

## Paso 4 — El worker de Chat (opcional, solo si replicás el Chat)
El Chat Financiero usa el mismo patrón de cola: la web encola pedidos en `solicitudes` / `noticias_pedidos` y un **worker Reuters** los completa en `series` / `observaciones` / `noticias` (Supabase del chat). Si replicás el chat, ubicá ese worker en la misma PC y apuntalo a tu Supabase de chat. Si no, salteá esto.

## Alternativa sin licencia propia (camino corto)
Si NO querés correr tu propio colector, MiAmauta puede **leer** los `cedears_*` del Supabase de producción con la **anon key** (solo lectura; el RLS lo permite). Evita la licencia Refinitiv, pero acopla MiAmauta a ese proyecto. En ese caso: pedile a Facundo la **anon key** (nunca la service_role) y apuntá solo las lecturas de CEDEARs ahí; el resto (research, auth, etc.) va a tu Supabase nuevo.

## Reglas de oro
- **No rompas producción**: duplicá la tarea/config; no reescribas la que ya corre.
- La **service_role** solo vive en la PC del colector / en secrets del server. Nunca en el repo ni en el navegador.
- Mantené el **heartbeat** de `cedears_params.updated_at` o la web se ve "offline".
