-- Gold Tracker India: database schema. Run once in Supabase Dashboard -> SQL Editor (safe to re-run).
--
-- PUBLIC data (anyone may read, only the server-side service_role key may write):
--   price_ticks, daily_prices, ingest_status, news_items, forecasts
-- PRIVATE data (only the signed-in owner can read/write their own rows):
--   purchases

-- ---------- PUBLIC: prices ----------
create table if not exists public.price_ticks (
  id             bigint generated always as identity primary key,
  metal          text not null check (metal in ('gold','silver')),
  purity         smallint not null check (purity in (24,22,18,999,925)),
  price_per_gram numeric(12,2) not null check (price_per_gram > 0),   -- estimated Indian rate, INR
  raw_per_gram   numeric(12,2) check (raw_per_gram > 0),              -- international spot converted to INR, before adjustment
  adj_pct        numeric(6,2) not null default 0,                     -- import duty / premium applied
  source         text not null,
  observed_at    timestamptz not null,                                -- when the provider says the price was true
  created_at     timestamptz not null default now(),
  unique (metal, purity, source, observed_at)
);
create index if not exists price_ticks_lookup on public.price_ticks (metal, purity, observed_at desc);

-- One row per IST day. History rows are ESTIMATES (global price x official FX x duty); live days are built from ticks.
create table if not exists public.daily_prices (
  day         date not null,
  metal       text not null check (metal in ('gold','silver')),
  purity      smallint not null check (purity in (24,22,18,999,925)),
  open        numeric(12,2) not null,
  high        numeric(12,2) not null,
  low         numeric(12,2) not null,
  close       numeric(12,2) not null,
  change_count int not null default 0,                                -- number of price changes seen that day
  source      text not null,
  is_estimate boolean not null default true,
  primary key (day, metal, purity),
  check (low <= high and open between low and high and close between low and high)
);

-- Heartbeat: when we last *checked* a source (so "no change" is distinguishable from "job is broken").
create table if not exists public.ingest_status (
  source       text primary key,
  last_checked timestamptz not null,
  last_ok      boolean not null,
  note         text
);

-- ---------- PUBLIC: news + forecast (written by the daily Claude job) ----------
create table if not exists public.news_items (
  id          text primary key,
  kind        text not null check (kind in ('overnight','upcoming')),
  title       text not null,
  summary     text not null,
  url         text check (url is null or url ~ '^https://'),
  source      text,
  impact      text not null check (impact in ('bullish','bearish','neutral','uncertain')),
  event_time  timestamptz,                                            -- for 'upcoming' (release/meeting time)
  for_date    date not null,                                          -- IST day the item is shown for
  created_at  timestamptz not null default now()
);
create index if not exists news_for_date on public.news_items (for_date desc, kind);

create table if not exists public.forecasts (
  generated_on date not null,
  metal        text not null check (metal in ('gold','silver')),
  purity       smallint not null,
  horizon      smallint not null check (horizon between 1 and 3),
  low          numeric(12,2) not null,
  center       numeric(12,2) not null,
  high         numeric(12,2) not null,
  bias         numeric(4,2) not null check (bias between -1 and 1),
  confidence   text not null check (confidence in ('low','medium','high')),
  rationale    text,
  model        text,
  generated_at timestamptz not null default now(),
  primary key (generated_on, metal, purity, horizon),
  check (low <= center and center <= high)
);

-- ---------- PRIVATE: purchases ----------
create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchased_on  date not null check (purchased_on <= current_date and purchased_on >= date '2000-01-01'),
  metal         text not null check (metal in ('gold','silver')),
  purity        smallint not null check (purity in (24,22,18,999,925)),
  form          text not null default 'other' check (form in ('coin','bar','jewellery','digital','other')),
  grams         numeric(12,3) not null check (grams > 0 and grams <= 100000),
  total_paid    numeric(14,2) not null check (total_paid > 0),          -- INCLUDING GST, making and other charges
  gst_amount    numeric(14,2) not null default 0 check (gst_amount >= 0),
  making_charges numeric(14,2) not null default 0 check (making_charges >= 0),
  other_charges numeric(14,2) not null default 0 check (other_charges >= 0),
  notes         text check (char_length(notes) <= 300),
  created_at    timestamptz not null default now(),
  check (gst_amount + making_charges + other_charges <= total_paid),
  check ((metal = 'gold' and purity in (24,22,18)) or (metal = 'silver' and purity in (999,925)))
);
create index if not exists purchases_owner on public.purchases (user_id, purchased_on desc);

-- ---------- Row Level Security ----------
alter table public.price_ticks   enable row level security;
alter table public.daily_prices  enable row level security;
alter table public.ingest_status enable row level security;
alter table public.news_items    enable row level security;
alter table public.forecasts     enable row level security;
alter table public.purchases     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['price_ticks','daily_prices','ingest_status','news_items','forecasts'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select to anon, authenticated using (true)', t);
    -- Deliberately NO insert/update/delete policy: only the service_role key (GitHub Actions) can write.
  end loop;
end $$;

drop policy if exists "owner select" on public.purchases;
drop policy if exists "owner insert" on public.purchases;
drop policy if exists "owner update" on public.purchases;
drop policy if exists "owner delete" on public.purchases;
-- 'to authenticated' => the anonymous role gets nothing at all, even by mistake.
create policy "owner select" on public.purchases for select to authenticated using (auth.uid() = user_id);
create policy "owner insert" on public.purchases for insert to authenticated with check (auth.uid() = user_id);
create policy "owner update" on public.purchases for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner delete" on public.purchases for delete to authenticated using (auth.uid() = user_id);

-- Belt and braces: remove table privileges the API roles should never have.
revoke all on public.purchases from anon;
revoke insert, update, delete, truncate on public.price_ticks, public.daily_prices, public.ingest_status, public.news_items, public.forecasts from anon, authenticated;
