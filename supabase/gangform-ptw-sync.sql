create table if not exists public.sfcs_gangform_ptw_state (
  building_id text primary key,
  payload jsonb not null,
  status text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  requested_at timestamptz,
  approved_at timestamptz,
  completed_at timestamptz
);

alter table public.sfcs_gangform_ptw_state replica identity full;

alter publication supabase_realtime add table public.sfcs_gangform_ptw_state;

create index if not exists sfcs_gangform_ptw_state_updated_at_idx
  on public.sfcs_gangform_ptw_state (updated_at desc);
