# Traspaso Amauta Local → MiAmauta — EMPEZÁ ACÁ

Este repo es **Amauta Local** (el portal interno que hay que replicar dentro de **MiAmauta**). Todo lo técnico lo ejecutás **vos (el dev) con tu Claude Code**. Facundo solo te da accesos (lista al final) — él no configura nada.

**Objetivo:** levantar una **copia funcional** de Amauta Local, con su **propia infraestructura nueva** (repo/Vercel bajo Amauta, Supabase nuevo), y meterla como sección dentro de MiAmauta. La web Local de producción **no se toca**.

---

## 🧭 MAPA DE EJECUCIÓN — quién corre qué, dónde (leé esto primero)

Hay **dos lugares** donde se trabaja, con **dos sesiones de Claude distintas**. No mezclar.

| # | Dónde | Qué Claude | Carpeta de trabajo | Qué hace | Doc que usa |
|---|---|---|---|---|---|
| **A** | **Tu PC** (la del dev) | **Tu Claude organización** | El clon de `Cuffa28/amauta-research` que vas a bajar | Replicar la **web** + crear **Supabase nuevo** + **auth** + **deploy Vercel** + integrar en MiAmauta | Prompt A (abajo) → `TRASPASO-MIAMAUTA.md` |
| **B** | **PC de Reuters** | La sesión de Claude que ya está logueada ahí (misma cuenta de Amauta) — **vos tenés acceso** | La carpeta del **colector** que ya existe en esa PC (fuera de este repo) | Replicar / **re-apuntar el colector** para que además escriba a **TU Supabase nuevo** | Prompt B (abajo) → `TRASPASO-2-COLECTOR-REUTERS.md` |

**Orden correcto:** primero **A** (hasta tener tu Supabase nuevo creado y su `service_role` key a mano) → después **B** (porque el colector necesita esa key para escribir a tu base).

**Flujo del secreto (clave para 0 errores):** el único dato que viaja de A → B es la **URL + `service_role` key de TU Supabase nuevo**. La generás en el paso A (Supabase → Project Settings → API) y la usás en la PC de Reuters en el paso B. Nunca al revés, y nunca toques las keys de producción.

---

## Orden de lectura (todo está en este repo)
1. **Este archivo** — panorama, prompt para tu Claude, y accesos.
2. **[TRASPASO-MIAMAUTA.md](TRASPASO-MIAMAUTA.md)** — runbook detallado de la **web + Supabase + auth**.
3. **[TRASPASO-2-COLECTOR-REUTERS.md](TRASPASO-2-COLECTOR-REUTERS.md)** — cómo replicar el **colector LSEG/Reuters** y su `.bat` (corré esto en la **PC de Reuters**, a la que tenés acceso).
4. **[supabase/schema-portal.sql](supabase/schema-portal.sql)** — el esquema de la base, listo para correr en tu Supabase nuevo.
5. **[CLAUDE.md](CLAUDE.md)** y **[HANDOFF.md](HANDOFF.md)** — contexto del proyecto.

---

## Prompt A — en TU PC, con tu Claude organización (replicar la web)

> Copiá esto en Claude Code **con el clon de `amauta-research` abierto como carpeta de trabajo**. Hacelo por fases; no ejecutes deploys ni cambios en producción de Amauta.

```
Sos mi copiloto para replicar el portal "Amauta Local" dentro de "MiAmauta".
Contexto y pasos están en estos archivos del repo: TRASPASO-0-EMPEZAR-Y-PROMPT.md,
TRASPASO-MIAMAUTA.md, TRASPASO-2-COLECTOR-REUTERS.md, supabase/schema-portal.sql,
CLAUDE.md y HANDOFF.md. Leelos primero y hacé un plan.

Reglas:
- NO tocar la infraestructura de producción de Amauta (repo amauta-research, su Vercel,
  ni el Supabase jfjqydgqzlwnyngcmzwu que tiene el CRM de clientes). Trabajamos con
  infraestructura NUEVA y aislada.
- Pedime a MÍ los valores que no podés saber (URLs y keys de MIS proyectos Supabase,
  ANTHROPIC_API_KEY, FRED/BEA keys, credenciales Refinitiv). Nunca reutilizar secretos
  que veas en archivos .env de otros.
- Andá por fases y confirmá conmigo antes de cada deploy.

Fase 1 — Web/app: clonar, npm install, crear mi .env.local, apuntar public/js/config.js
  a MI Supabase, ajustar EMBEDS, correr en local.
Fase 2 — Supabase + auth: crear proyecto nuevo, correr supabase/schema-portal.sql,
  deployar la Edge Function admin-write con MIS secrets, y configurar Auth (OTP + template
  con {{ .Token }}). Sembrar mi email como admin en team_members.
Fase 3 — Deploy en Vercel (org Amauta) + crons + integrar como sección en MiAmauta.

Cuando termine la Fase 2, recordame anotar la URL y el service_role de mi Supabase nuevo:
los voy a necesitar en OTRA sesión de Claude, en la PC de Reuters (colector). El colector NO
se hace en esta sesión.

Empezá leyendo los archivos y proponéme el plan de Fase 1.
```

---

## Prompt B — en la PC de Reuters, en la sesión de Claude de ahí (colector)

> Hacé esto **después** del Prompt A (necesitás la URL + `service_role` de tu Supabase nuevo). Abrí Claude Code en la PC de Reuters. **No** hace falta abrir este repo ahí: el colector es una carpeta aparte en esa misma PC. Copiá este repo (o solo el archivo `TRASPASO-2-COLECTOR-REUTERS.md`) a esa PC, o pegá el prompt y seguí sus pasos.

```
Estoy en la PC de Reuters. Objetivo: replicar/re-apuntar el COLECTOR que baja datos de
LSEG/Reuters Eikon y los escribe a Supabase, para que ADEMÁS escriba a MI Supabase nuevo
(proyecto de MiAmauta). Seguí el runbook TRASPASO-2-COLECTOR-REUTERS.md.

Datos que te paso yo:
- SUPABASE_URL (mi proyecto nuevo): <la pego>
- SUPABASE_SERVICE_ROLE_KEY (mi proyecto nuevo): <la pego>

Reglas:
- NO rompas el colector de producción que ya corre: DUPLICÁ la config/tarea y apuntá la
  copia a MI Supabase. La tarea original queda intacta.
- La service_role solo vive en esta PC (config del colector). Nunca en un repo ni en el browser.
- Mantené el heartbeat de cedears_params.updated_at.

Paso 1: ubicá el colector y su .bat (Programador de tareas + findstr). Mostrame qué encontraste
antes de tocar nada.
```

---

## Accesos que Facundo te da (lo ÚNICO que hace Facundo)

- [ ] **GitHub** — Collaborator en `Cuffa28/amauta-research` (y en `monitor-fci-amauta` / `amauta-chat-financiero` si vas a replicar esas secciones).
- [ ] **Vercel** — Member en la org de Amauta (para deployar ahí).
- [ ] **PC de Reuters** — ya tenés acceso (confirmado); ahí vive el colector + el `.bat`.
- [ ] **(Opcional) Datos semilla** — si querés arrancar con contenido de ejemplo (research + foto de CEDEARs), Facundo pide un export **sin datos de clientes**.

## Lo que Facundo NO te pasa (y por qué)
- ❌ El **Supabase de producción** `jfjqydgqzlwnyngcmzwu` → tiene el **CRM (1.409 clientes)**. Vos armás el tuyo.
- ❌ El **`.env.local`** del repo → tiene **claves vivas** (service_role, CRON_SECRET, fonditos). Vos generás las tuyas.
- ❌ Credenciales de Refinitiv que no sean las de la propia PC de Reuters.
