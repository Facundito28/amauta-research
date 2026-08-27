-- =====================================================================
-- Amauta Local — Esquema del proyecto Supabase "portal" (research + CEDEARs + auth)
-- Reconstruido desde el proyecto de producción jfjqydgqzlwnyngcmzwu.
-- Correr TODO esto en un proyecto Supabase NUEVO y VACÍO (SQL Editor).
-- NO incluye datos ni las tablas de CRM (crm_*) ni financiamiento — a propósito.
-- =====================================================================

-- ---------- RESEARCH: instrumentos ----------
create table if not exists public.instruments (
  id           text primary key,
  ticker       text not null,
  name         text not null,
  type         text,                              -- 'equity' | 'renta-fija' | ...
  category     text,                              -- 'Equity US' | 'Renta Fija AR' | ...
  status       text not null default 'empty',     -- 'ready' | 'wip' | 'empty'
  tv_symbol    text,
  price        text default '',
  change_text  text,
  change_dir   text default 'up',                 -- 'up' | 'down'
  updated_text text,
  top_metrics  jsonb default '{}'::jsonb,
  tabs         jsonb default '[]'::jsonb,
  sort_order   integer default 100,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.instrument_blocks (
  id            uuid primary key default gen_random_uuid(),
  instrument_id text not null references public.instruments(id) on delete cascade,
  tab_index     integer not null,
  block_order   integer not null default 10,
  block_type    text not null,                    -- paragraph|thesis_box|stat_grid|chart|risk_list|html_raw|heading
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists instrument_blocks_by_instrument
  on public.instrument_blocks (instrument_id, tab_index, block_order);

-- ---------- CEDEARs (los llena el COLECTOR externo LSEG/Reuters — ver TRASPASO) ----------
create table if not exists public.cedears_live (
  especie text primary key,
  nombre text, sector text, ric_usd text, ric_ars text,
  ratio numeric, precio_usd numeric, precio_ars numeric, var numeric, volumen numeric,
  ccl numeric, fair_value numeric, dif_fv numeric, estado_fv text,
  pe numeric, pb numeric, ev_ebitda numeric, pe_fwd numeric,
  mg_op numeric, mg_net numeric, div_yield numeric,
  rec numeric, rec_label text, vs_sector numeric, vs_hist numeric, desv numeric, valuacion text,
  prices_updated_at timestamptz, fundamentals_updated_at timestamptz,
  target numeric, target_high numeric, target_low numeric, upside numeric,
  ret_1m numeric, ret_3m numeric, ret_ytd numeric, ret_1y numeric
);

create table if not exists public.cedears_params (
  id integer primary key default 1,
  al30_ars numeric, al30c numeric, al30d numeric, ccl_ref numeric, mep numeric,
  market_open boolean default false,
  collector_status text, collector_error text,
  updated_at timestamptz default now()               -- heartbeat del colector (>15 min = "offline")
);

create table if not exists public.cedears_history (
  especie text, fecha date,
  precio_ars numeric, precio_usd numeric, ccl numeric, dif_fv numeric, valuacion text,
  primary key (especie, fecha)
);

create table if not exists public.cedears_series (
  especie text, fecha date,
  close_ars numeric, vol_ars numeric, close_usd numeric,
  primary key (especie, fecha)
);

create table if not exists public.cedears_news (
  story_id text primary key,
  especie text not null,
  headline text not null,
  source text,
  published_at timestamptz not null
);

-- ---------- AUTH: allowlist del equipo ----------
create table if not exists public.team_members (
  email      text primary key,
  role       text not null default 'member' check (role in ('member','admin')),
  active     boolean not null default true,
  full_name  text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- RLS: lectura pública (anon) de research/CEDEARs; escritura SOLO service_role.
-- team_members: cada usuario autenticado lee SOLO su fila.
-- =====================================================================
alter table public.instruments        enable row level security;
alter table public.instrument_blocks  enable row level security;
alter table public.cedears_live        enable row level security;
alter table public.cedears_params      enable row level security;
alter table public.cedears_history     enable row level security;
alter table public.cedears_series      enable row level security;
alter table public.cedears_news        enable row level security;
alter table public.team_members        enable row level security;

create policy instruments_select       on public.instruments       for select to anon, authenticated using (true);
create policy instrument_blocks_select on public.instrument_blocks for select to anon, authenticated using (true);
create policy cedears_live_select      on public.cedears_live      for select to anon, authenticated using (true);
create policy cedears_params_select    on public.cedears_params    for select to anon, authenticated using (true);
create policy cedears_history_select   on public.cedears_history   for select to anon, authenticated using (true);
create policy cedears_series_select    on public.cedears_series    for select to anon, authenticated using (true);
create policy cedears_news_select      on public.cedears_news      for select to anon, authenticated using (true);

create policy team_members_select_own on public.team_members for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
grant select on public.team_members to authenticated;

-- Sembrar el primer admin (cambiar por el correo real del equipo)
insert into public.team_members (email, role, active, full_name)
values ('facundo@amautainversiones.com', 'admin', true, 'Facundo Argañaraz')
on conflict (email) do update set role = excluded.role, active = excluded.active;

-- =====================================================================
-- Realtime: la web escucha cambios en cedears_params (y instruments).
-- =====================================================================
alter publication supabase_realtime add table public.cedears_params;
alter publication supabase_realtime add table public.instruments;

-- =====================================================================
-- FALTA (fuera de este SQL):
--  • Edge Function `admin-write` (supabase/functions/admin-write/index.ts) con secrets
--    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
--  • Authentication → Email: habilitar OTP; template Magic Link con {{ .Token }};
--    (opcional) desactivar "Confirm email".
--  • El COLECTOR externo LSEG/Reuters que escribe cedears_* (ver TRASPASO-MIAMAUTA.md).
-- =====================================================================
