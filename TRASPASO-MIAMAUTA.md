# Traspaso de "Amauta Local" → MiAmauta

> 📍 **Dónde se corre:** PASO **A** — en la **PC del dev**, con **su Claude organización**, sobre el clon de `Cuffa28/amauta-research`. (El colector es aparte: PASO B, ver `TRASPASO-2-COLECTOR-REUTERS.md`.) Ver el mapa en `TRASPASO-0-EMPEZAR-Y-PROMPT.md`.

Documento para **replicar** lo que armamos en **Amauta Local** dentro de **MiAmauta** (el portal que está construyendo el dev del equipo). Facundo **no construye nada**: solo entrega código, esquema y esta guía. La web Local actual (`amauta-research.vercel.app`) **queda intacta**.

Decisiones tomadas: infra nueva **bajo cuentas de Amauta**; **Supabase nuevo y aislado** para MiAmauta (no se comparte el de producción, que tiene el CRM); dev **interno de confianza**.

---

## PARTE 1 — A qué darle acceso (y a qué NO)

### ✅ Darle
| Recurso | Acceso | Cómo |
|---|---|---|
| Repo `Cuffa28/amauta-research` (código de Amauta Local) | **Collaborator (read/write)** | GitHub → Settings → Collaborators. Es seguro: **no hay secretos commiteados** (`.env.local` está en `.gitignore`). |
| Repo `Cuffa28/monitor-fci-amauta` | Collaborator *(solo si va a replicar el Monitor FCIs)* | idem |
| Repo `Cuffa28/amauta-chat-financiero` | Collaborator *(solo si va a replicar el Chat)* | idem |
| Este documento + `supabase/schema-portal.sql` | Enviárselos | van en el repo |
| Org de Vercel de Amauta | **Member** | Vercel → Team → Members → Invite (para deployar bajo Amauta) |

### ⛔ NO darle (todavía / nunca)
- **El proyecto Supabase de producción `jfjqydgqzlwnyngcmzwu`.** Contiene tu **CRM (1.409 clientes)**, prospectos y financiamiento. Él arma **su propio** Supabase con `schema-portal.sql`.
- **El archivo `amauta-local/.env.local`.** Tiene **claves vivas** (service_role de FCI, `CRON_SECRET`, key de fonditos). Él genera **sus propias** claves en sus propios proyectos. Nunca reutilizar estos valores.
- **Credenciales de Reuters/LSEG.** Ver Parte 4.

---

## PARTE 2 — Qué preparamos NOSOTROS antes de pasárselo

1. **GitHub**: agregarlo como collaborator a `Cuffa28/amauta-research` (y los otros dos si aplica).
2. **Vercel**: invitarlo a la org de Amauta (`amautaproyectos` / la que tenga los deploys). Definir si MiAmauta se deploya ahí o se transfiere a Amauta después.
3. **Supabase**: **no** tocar producción. Solo entregarle `supabase/schema-portal.sql`. Si además querés que arranque con datos de ejemplo (research/CEDEARs) sin esperar al colector, avisame y **exporto un seed** de `instruments`, `instrument_blocks` y una foto de `cedears_live/params/series` (sin nada de `crm_*`).
4. **Reuters/LSEG (el `.bat`/colector)**: nada que preparar — el colector vive en la **PC de Reuters** y el dev **ya tiene acceso**. Él lo replica con su Claude siguiendo **[TRASPASO-2-COLECTOR-REUTERS.md](TRASPASO-2-COLECTOR-REUTERS.md)**.
5. **Confirmar** que no le pasás ningún `.env.local`.

> Facundo **no configura nada técnico**: solo tilda accesos. Todo lo demás lo ejecuta el dev con su Claude (ver [TRASPASO-0-EMPEZAR-Y-PROMPT.md](TRASPASO-0-EMPEZAR-Y-PROMPT.md)).

---

## PARTE 3 — Instructivo para el dev (cómo replicar la web/app)

### Qué es Amauta Local
Portal interno **Next.js** (deploy en Vercel). Lo estático viejo quedó en `legacy/` y `public/`. Detrás de **login de equipo por email (OTP de Supabase)**. Secciones integradas en una sola app (sidebar):
- **Research** (instrumentos, nativo) · **Monitor CEDEARs** (nativo) · **Noticias Reuters** (nativo) · **Monitor FCIs** (iframe) · **Chat Financiero** (iframe) · **Simulador** ("Próximamente").

### Paso a paso
1. **Clonar** `Cuffa28/amauta-research` y `npm install`.
2. **Crear su Supabase nuevo** y correr `supabase/schema-portal.sql` (SQL Editor). Cambiar el email admin sembrado por el suyo.
3. **Authentication (Supabase)**: habilitar Email; en el template "Magic Link" incluir `{{ .Token }}` (para que llegue **código de 6 dígitos**); (opcional) desactivar "Confirm email"; Site URL + Redirect URLs con su dominio y `http://localhost:3000`.
4. **Edge Function `admin-write`**: deployar `supabase/functions/admin-write/index.ts` con secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` **de su proyecto**. (Autoriza escrituras solo a `team_members` con rol `admin`.)
5. **Variables de entorno** (crear su propio `.env.local`, NO reusar el nuestro). Nombres que usa el código:
   - Portal: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o el hardcode en `public/js/config.js` — actualizar a SU proyecto).
   - FCIs/cron (si replica el monitor): `NEXT_PUBLIC_FCI_SUPABASE_URL`, FCI publishable key, `FCI_SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, opcional `FONDITOS_API_KEY`/`FONDITOS_MCP_URL`.
   - Chat (si replica el chat): `NEXT_PUBLIC_SUPABASE_URL`+anon+`SUPABASE_SERVICE_KEY` de su Supabase de chat, `ANTHROPIC_API_KEY`, `FRED_API_KEY`, `BEA_API_KEY`, opcional `BLS_API_KEY`.
6. **`public/js/config.js`**: apuntar `SUPABASE_URL`/`SUPABASE_KEY` a SU proyecto y ajustar `EMBEDS` (URLs de FCIs/Chat/Simulador) a sus deploys.
7. **Deploy en Vercel** (org Amauta). Configurar los **Vercel Cron** de `vercel.json` (`/api/cron/snapshot-cafci` diario, `/api/cron/snapshot-carteras` semanal) con su `CRON_SECRET`.
8. **Gotcha del Service Worker**: al cambiar archivos del shell, **bumpear `CACHE`** en `public/sw.js` o los usuarios ven assets viejos.

### Auth — cómo funciona (para integrarlo con el login de MiAmauta)
- `sendOtp(email)` → Supabase manda código → `verifyOtp` → se valida contra `team_members` (activo). Rol `admin` habilita edición de Research. Toda la app queda detrás de `body.authed`.
- Si MiAmauta ya tiene su propio login, puede saltear esto y **gatear las secciones con su sesión**, usando `team_members` (o su equivalente) como allowlist.

---

## PARTE 4 — La parte difícil: datos en vivo (CEDEARs, Reuters, el `.bat`)

**Esto es lo único que NO está en ningún repo** y es lo que más hay que aclararle:

- El **Monitor CEDEARs** y las **Noticias Reuters** NO se alimentan desde la web. Los llena un **colector externo** que corre en una **máquina local (Windows)**, disparado por un **`.bat` / Programador de tareas**, y que baja datos de **LSEG Refinitiv / Reuters Eikon** (feed licenciado). Escribe con **service_role** a las tablas `cedears_live`, `cedears_params` (heartbeat cada pocos min), `cedears_series`, `cedears_news`.
- El **Chat** usa el mismo patrón: encola pedidos (`solicitudes`, `noticias_pedidos`) y un **worker Reuters** los completa (`series`, `observaciones`, `noticias`).
- **En cambio, los FCIs SÍ están en el repo**: son Vercel Cron (`/api/cron/snapshot-cafci` y `snapshot-carteras`) que scrapean CAFCI (público, sin credenciales).

**Qué necesita el dev para tener CEDEARs/Reuters vivos en MiAmauta — dos caminos:**
1. **Correr su propio colector** → necesita el **código del colector externo** (hay que ubicarlo en la máquina donde corre hoy, fuera de esta carpeta) **+ una licencia Refinitiv/Eikon propia** + el service_role de su Supabase. Es lo más aislado pero implica costo de licencia.
2. **Leer del feed que ya tenemos** → dejar que MiAmauta lea `cedears_*` de nuestro Supabase de producción con la **anon key** (solo lectura, RLS lo permite). Evita la licencia, pero acopla MiAmauta a nuestro proyecto (el que tiene el CRM). Si se elige esto, conviene una **anon key** y nada más — nunca el service_role.

> El colector vive en la **PC de Reuters** (el dev tiene acceso). El paso a paso para ubicarlo y re-apuntarlo a su Supabase está en **[TRASPASO-2-COLECTOR-REUTERS.md](TRASPASO-2-COLECTOR-REUTERS.md)** — lo corre su Claude ahí. Facundo no interviene.

---

## Resumen de arquitectura (para que él lo entienda de una)

```
LSEG/Reuters Eikon ──(colector externo + .bat, máquina local)──▶ Supabase portal: cedears_*, noticias
CAFCI (público)   ──(Vercel Cron, EN EL REPO)────────────────────▶ Supabase FCI: fci_*
BLS/FRED/BEA/BCRA ──(Chat /api/chat con Claude)──────────────────▶ Supabase chat: series/observaciones

Web Amauta Local (Next.js, Vercel) ── login OTP (team_members) ── lee todo con anon key
   ├─ Research + CEDEARs + Noticias  (nativo)
   ├─ Monitor FCIs   (iframe)
   └─ Chat Financiero (iframe)
```

## Archivos que le pasás
- Repo `Cuffa28/amauta-research` (código).
- `supabase/schema-portal.sql` (esquema de su base nueva).
- `supabase/functions/admin-write/index.ts` (edge function).
- Este `TRASPASO-MIAMAUTA.md`.
- `CLAUDE.md` + `HANDOFF.md` (contexto del proyecto).
