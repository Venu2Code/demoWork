-- learnCSinSimple database. Run once in Supabase Dashboard -> SQL Editor.
-- Two tables: per-user progress (private) and the shared curated source library (public read, server-only write).

create table if not exists public.progress (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.progress enable row level security;

drop policy if exists "own progress read"   on public.progress;
drop policy if exists "own progress insert" on public.progress;
drop policy if exists "own progress update" on public.progress;
drop policy if exists "own progress delete" on public.progress;
create policy "own progress read"   on public.progress for select using (auth.uid() = user_id);
create policy "own progress insert" on public.progress for insert with check (auth.uid() = user_id);
create policy "own progress update" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own progress delete" on public.progress for delete using (auth.uid() = user_id);

-- Guardrail: cap document size (1 MB) and stamp updated_at.
alter table public.progress drop constraint if exists progress_size;
alter table public.progress add constraint progress_size check (pg_column_size(data) < 1048576);
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress for each row execute function public.touch_updated_at();

-- Curated sources/materials: one place for everything the daily job collects.
create table if not exists public.sources (
  id             text primary key,
  url            text not null unique check (url ~ '^https://'),
  title          text not null,
  summary        text not null,
  why_it_matters text,
  category       text not null check (category in ('hardware','programming','networking','ai','cloud','security','industry')),
  level          text not null default 'intermediate',
  tags           text[] not null default '{}',
  source         text not null,
  published      date,
  added_at       timestamptz not null default now()
);
alter table public.sources enable row level security;
drop policy if exists "sources are public" on public.sources;
create policy "sources are public" on public.sources for select using (true);
-- No insert/update/delete policies: only the service_role key (GitHub Action) can write, because it bypasses RLS.
create index if not exists sources_category_idx on public.sources (category, published desc);
