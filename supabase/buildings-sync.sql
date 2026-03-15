create table if not exists public.sfcs_buildings (
  id text primary key,
  name text not null,
  total_floors integer not null,
  floors jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.sfcs_buildings replica identity full;

alter publication supabase_realtime add table public.sfcs_buildings;

create index if not exists sfcs_buildings_updated_at_idx
  on public.sfcs_buildings (updated_at desc);
