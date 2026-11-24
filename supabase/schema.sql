-- Run once in the Supabase SQL editor. The browser never talks to these tables directly:
-- all app traffic goes through functions/v1/api, the importer uses the service key.
-- Model definitions stay in models/seed.json; questionnaires are built from the layer
-- metadata cached below, so no model is discovered from the Portal at runtime.

create table if not exists public.profiles (
  portal_username text primary key,
  full_name text,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  stations text[] not null default '{}'
);

create table if not exists public.records (
  id bigint generated always as identity primary key,
  model text not null,
  rec_key text not null,
  attrs jsonb not null default '{}'::jsonb,
  geometry jsonb,
  data_source text not null default 'recorded',
  is_deleted boolean not null default false,
  created_user text,
  created_date timestamptz,
  last_edited_user text,
  last_edited_date timestamptz,
  deleted_by text,
  deleted_at timestamptz,
  unique (model, rec_key)
);
create index if not exists records_model_live on public.records (model) where not is_deleted;

-- De-identified mirror of the two ArcGIS layers. No farmer_name, phone or national_id here.
create table if not exists public.source_farms (
  plot_id text primary key,
  attrs jsonb not null default '{}'::jsonb,
  geometry jsonb,
  active boolean not null default true,
  seen_at timestamptz not null default now()
);
create table if not exists public.source_stations (
  cws_uid text primary key,
  attrs jsonb not null default '{}'::jsonb,
  geometry jsonb,
  active boolean not null default true,
  seen_at timestamptz not null default now()
);
create table if not exists public.source_meta (
  id boolean primary key default true check (id),
  conv_field text,
  farm_meta jsonb not null default '{}'::jsonb,
  station_meta jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
insert into public.source_meta(id) values (true) on conflict do nothing;

-- Direct anon/authenticated access is deliberately off. The Edge Function uses the
-- service role, which bypasses RLS; identity and permissions are checked there.
alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.source_farms enable row level security;
alter table public.source_stations enable row level security;
alter table public.source_meta enable row level security;
revoke all on public.profiles, public.records, public.source_farms, public.source_stations, public.source_meta from anon, authenticated;
