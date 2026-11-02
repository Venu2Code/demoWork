# Project log (read me first in every Claude session)

**Product:** Gold Tracker India. Public rates + private purchase tracker. See CLAUDE.md for the core idea and rules.

## Status
- [x] Pure logic + 23 tests: unit conversion, data-quality rules, forecast range, buy/sell meters, P/L, form validation, history building, news validation
- [x] Supabase schema (public price/news tables, private `purchases` with RLS), SQL syntax-checked (not executed against a live DB yet)
- [x] Site: Today (market watch, price cards, change log with IST times, 3-day outlook, buy meters), Price history chart, My Gold (login, add purchase, P/L, sell alert, CSV export), How it works
- [x] Jobs/workflows: live prices (15 min), daily outlook (06:00 IST), manual 3-year backfill, CI, Pages deploy
- [x] UI tested in a real browser against a fake in-memory Supabase (fixture, not committed)

## NOT yet verified against real services (do this first)
- [ ] Create Supabase project, run `supabase/schema.sql`, check RLS with two test users (user A must not see user B's purchases; anon must get 401/empty)
- [ ] GoldAPI.io: confirm the response has `price` (INR per troy oz) + `timestamp`, check the free-tier limits vs a 15-minute schedule; adjust `parseGoldApi` if the shape differs
- [ ] Backfill: confirm Stooq CSV + Frankfurter work from GitHub runners and cover >= 1095 days; else use `scripts/import-csv.mjs`
- [ ] Check `config/pricing.json` import duty against the current Indian customs rate; compare estimated rate with a local jeweller / IBJA for a few days and tune `local_premium_pct`
- [ ] First `daily-outlook` run: inspect rejected items in the log; confirm search results/links are on the allowlist

## Ideas for later (keep within the core idea)
- City-wise rates; price alerts by email; sell-lot ordering (FIFO) with capital-gains notes; silver purchases insights; PWA/offline; Hindi UI; second price provider for cross-checking (reject if they differ >3%)

## Decisions
- IBJA could not be reached from the dev sandbox, so the hybrid source was chosen: open data for history, a metals API for live prices, duty applied in config, everything labelled as estimated.
- Static site + Supabase: free, fast, few moving parts; all private data behind RLS.
