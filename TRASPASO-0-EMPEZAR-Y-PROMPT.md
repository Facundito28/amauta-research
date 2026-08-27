# Traspaso Amauta Local → MiAmauta — EMPEZÁ ACÁ

Este repo es **Amauta Local** (el portal interno que hay que replicar dentro de **MiAmauta**). Todo lo técnico lo ejecutás **vos (el dev) con tu Claude Code**. Facundo solo te da accesos (lista al final) — él no configura nada.

**Objetivo:** levantar una **copia funcional** de Amauta Local, con su **propia infraestructura nueva** (repo/Vercel bajo Amauta, Supabase nuevo), y meterla como sección dentro de MiAmauta. La web Local de producción **no se toca**.

## Orden de lectura (todo está en este repo)
1. **Este archivo** — panorama, prompt para tu Claude, y accesos.
2. **[TRASPASO-MIAMAUTA.md](TRASPASO-MIAMAUTA.md)** — runbook detallado de la **web + Supabase + auth**.
3. **[TRASPASO-2-COLECTOR-REUTERS.md](TRASPASO-2-COLECTOR-REUTERS.md)** — cómo replicar el **colector LSEG/Reuters** y su `.bat` (corré esto en la **PC de Reuters**, a la que tenés acceso).
4. **[supabase/schema-portal.sql](supabase/schema-portal.sql)** — el esquema de la base, listo para correr en tu Supabase nuevo.
5. **[CLAUDE.md](CLAUDE.md)** y **[HANDOFF.md](HANDOFF.md)** — contexto del proyecto.

---

## Prompt para pegar en TU Claude Code

> Copiá esto en Claude Code con este repo abierto como carpeta de trabajo. Hacelo por fases; no ejecutes deploys ni cambios en producción de Amauta.

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
Fase 3 — Colector Reuters (en la PC de Reuters): seguir TRASPASO-2-COLECTOR-REUTERS.md
  para ubicar el colector y su .bat, y hacer que escriba a MI Supabase nuevo.
Fase 4 — Deploy en Vercel (org Amauta) + crons + integrar como sección en MiAmauta.

Empezá leyendo los archivos y proponéme el plan de Fase 1.
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
