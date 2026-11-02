# Project log (read me first in every Claude session)

**Product:** Gold Tracker India. Public rates + private purchase tracker. See CLAUDE.md for the core idea and rules.
**Live site:** https://venu2code.github.io/demoWork/ (GitHub Pages, deploys from `main`)
**Repo:** Venu2Code/demoWork (owner may rename it). Work on branch `claude/laughing-meitner-539u40`; PRs go into `main`.

## State at end of session 1 (2026-11-02)
Built, merged and deployed: static site, Supabase schema (run successfully in the project), 4 workflows, 23 passing tests.
Site is connected to Supabase (`site/js/config.js` has the project URL + publishable key). It shows "No prices yet" because no data job has run successfully yet.

GitHub repo secrets are set: `GOLDAPI_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret key, `sb_secret_...`).
GitHub fix already applied: Settings > Environments > github-pages > deployment branches must allow `main`.

## NEXT (in order; always run workflows from branch `main`)
1. Actions > **Backfill 3-year history**: loads `daily_prices`. Not yet run or result unknown. If red, get the error text, fix (likely sources Stooq/Frankfurter format or reachability; fallback `scripts/import-csv.mjs`).
2. Actions > **Live prices**: fills `price_ticks`; this clears the "No prices yet" message. First real test of `parseGoldApi` (assumes JSON `{price: INR per troy oz, timestamp: unix s}` from the GoldAPI XAU/INR and XAG/INR endpoints). Check GoldAPI free-tier limit vs the 15-minute schedule; reduce frequency in `.github/workflows/live-prices.yml` if needed.
3. Actions > **Daily news and forecast**: first real Claude run; read the log for rejected items.
4. Privacy test with two accounts (A must not see B's purchases; signed-out sees nothing). Supabase Auth settings: Confirm email ON, min password length 12, consider MFA.
5. Confirm `config/pricing.json` import duty (currently 6%, from memory) and compare estimated rates with a local jeweller for a few days; tune `local_premium_pct`.

## Facts learned
- The dev sandbox cannot reach external data hosts (IBJA, GoldAPI, Stooq, Frankfurter, Supabase). Everything live must be tested via GitHub Actions or the user's browser. Never mock prices in the repo.
- Supabase now issues publishable / secret keys; send them in the `apikey` header only (already handled in `site/js/api.js` and `scripts/lib/db.mjs`).
- `supabase/schema.sql` must be pasted whole with all text selected (a partial selection caused a false syntax error).
- Pages deploys only from `main`; the hooks in `.claude/` block non-allowlisted network use and key patterns (this blocks even test strings: build fake keys in code).
- Force-pushes are denied by the session's permission classifier; the feature branch can be fast-forwarded to `main` and pushed normally.

## Ideas for later (keep within the core idea)
- Second price provider to cross-check (reject if they differ >3%); city-wise rates; email price alerts; FIFO sell lots with capital-gains notes; PWA/offline; Hindi UI.
