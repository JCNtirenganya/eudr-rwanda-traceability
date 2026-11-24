-- Run once in the Supabase SQL editor. Chain records only.
-- Real farms, farmers and CWS stay in ArcGIS Portal; the app reads them directly with the Portal token.
-- The browser never talks to this table: all traffic goes through functions/v1/api.

create table if not exists public.records (
  id bigint generated always as identity primary key,
  model text not null check (model in (
    'cherry_delivery','lot','lot_delivery','export_batch','batch_lot','exporter','importer'
  )),
  rec_key text not null,
  attrs jsonb not null default '{}'::jsonb,
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

-- Direct anon/authenticated access is deliberately off. The Edge Function uses the
-- service role and checks the Portal token itself before reading or writing.
alter table public.records enable row level security;
revoke all on public.records from anon, authenticated;
