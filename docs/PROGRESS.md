# Project log (read me first in every Claude session)

**Product:** Gold Tracker India. Public rates + private purchase tracker. See CLAUDE.md for the core idea and rules.
**Live site:** https://venu2code.github.io/demoWork/ (GitHub Pages, deploys from `main`)
**Repo:** Venu2Code/demoWork (owner may rename it). Work on branch `claude/laughing-meitner-539u40`; PRs go into `main`.

## State at end of session 1 (2026-11-02)
Built, merged and deployed: static site, Supabase schema (run successfully in the project), 4 workflows, 23 passing tests.
Site is connected to Supabase (`site/js/config.js` has the project URL + publishable key). It shows "No prices yet" because no data job has run successfully yet.

GitHub repo secrets are set: `GOLDAPI_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (secret key, `sb_secret_...`).
GitHub fix already applied: Settings > Environments > github-pages > deployment branches must allow `main`.

## Session 2 findings (2026-11-03)
- ROOT CAUSE of "no data" and the old README on GitHub: the repo's DEFAULT branch was still `claude/full-stack-calculator-app-i4ybvu` (old learning-platform content), not `main`. GitHub lists/schedules workflows only from the default branch, so Live prices / Backfill / Daily news never appeared and never ran. FIX (owner action): Settings > General > Default branch > `main`. The old `Daily learning update` workflow lives only on the old branch; it stops once the default is `main`.
- "Create account does nothing": the code did show messages but as small grey text with no button feedback. Now a prominent notice + busy buttons + plain-language errors (`auth.explain`).
- Tests added: `tests/auth.test.mjs` (auth unit tests) and `tests/e2e/` (18 browser tests incl. every sign-up outcome and the private-data journey). A deliberate bug made 7 of them fail, so they do catch regressions. CI runs both.

## Session 3 (2026-11-03)
- Live prices workflow ran green from `main` (data reaches Supabase). GoldAPI plan is 300 requests/month, so the 15-minute cron was replaced: 4 runs/day Mon-Sat (10:00, 13:00, 16:00, 19:00 IST), counter guard (250/month), schedule-aware 'out of date' warning (no false alarms overnight/Sundays) and a 'next update' time on the Today page. 37 unit + 20 browser tests pass.
- OWNER MUST: merge the PR into `main` (until then `main` still has the old 15-minute cron) and in the meantime disable the Live prices workflow.

- Backfill failed on 2026-11-03: Stooq returned HTTP 403 to GitHub's runners (automated traffic blocked); Frankfurter FX worked. Replaced Stooq with Twelve Data (`TWELVEDATA_API_KEY` secret, free plan, one request per metal returns up to 5000 daily rows). The job still writes nothing unless both metals cover >= 1095 days with plausible prices. API keys are redacted from all error text (tested). Owner must create the free Twelve Data account, add the secret, merge the PR, then re-run Backfill.

- Backfill run on merged code 2026-11-03: Twelve Data GOLD worked (XAU/USD, 788 trading days, 2023-10-30..2026-11-02, 1099 days) but SILVER (XAG/USD) returned HTTP 404 and the job threw the provider's message away. Fix: errors now include the provider's own message; `--allow-partial` saves the metal that passes and warns about the other. Silver cause still unknown until the next run shows the message (plan restriction vs symbol not found). Fallback for silver: `scripts/import-csv.mjs`.

## Session 3, later
- Backfill (after PR #4) GREEN: gold history saved (2364 rows = 788 trading days x 3 purities, 2023-10-30..2026-11-02). Silver NOT loaded: Twelve Data says XAG/USD needs the Grow/Venture plan (Basic = gold only). Basic plan is labelled 'internal non-display usage': check terms before public launch of the history chart.
- DECISION (owner): gold only for now. Silver hidden everywhere in the UI and not fetched (`metals: ["gold"]` in `site/data/schedule.json`); code path kept alive and covered by a browser test. Live prices now 8 runs/day Mon-Sat (09:30..20:00 IST every 90 min) = 208 of 300 requests/month; grace 60 min. 49 unit + 21 browser tests pass.
- OWNER: merge the PR, then run Daily news and forecast and compare 24K/22K with a local rate.

## NEXT (in order; always run workflows from branch `main`)
0. Owner: set default branch to `main`, then run workflows 1-3 below (they will now appear in the Actions list).
1. Actions > **Backfill 3-year history**: loads `daily_prices`. Not yet run or result unknown. If red, get the error text, fix (likely sources Stooq/Frankfurter format or reachability; fallback `scripts/import-csv.mjs`).
2. Actions > **Live prices**: fills `price_ticks`; this clears the "No prices yet" message. First real test of `parseGoldApi` (assumes JSON `{price: INR per troy oz, timestamp: unix s}` from the GoldAPI XAU/INR and XAG/INR endpoints). GoldAPI plan = 300 requests/month, so the schedule is 4 runs/day Mon-Sat (cron in `live-prices.yml` must equal `site/data/schedule.json`; test enforces). Quota guard stops calls at 250/month. DONE (Live prices ran green once on 2026-11-03).
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
