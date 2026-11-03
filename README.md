# Gold Tracker India

Today's **gold (18K / 22K / 24K) and silver rate in India**, per gram and per 10 g, with every price change of the day and its **IST time**, 3 years of price history, news that can move tomorrow's rate, a clearly labelled 3-day outlook, "good time to buy?" and "reached your sell target?" meters, and a **private tracker** for your own purchases (profit or loss including GST and charges).

> Information only, not financial advice. Rates are **estimates** (international price converted to INR plus import duty). Your jeweller's rate, GST and making charges will differ. See `SECURITY.md` for how wrong data is prevented.

## How it works
- **Live prices**: a GitHub Action calls a metals API four times a day (10:00, 13:00, 16:00, 19:00 IST, Monday to Saturday), validates the numbers, and saves a row only when the price differs from the last check. This is sized for GoldAPI's 300 requests/month plan (4 runs x 2 requests x 26 days = 208), and a built-in counter refuses to call the API once 250 requests are used in a month (`GOLDAPI_MONTHLY_LIMIT` to change it). If you upgrade the plan, edit the cron in `.github/workflows/live-prices.yml` AND `site/data/schedule.json` together (a test checks they match). Change times are therefore 'when we noticed', not minute-exact.
- **History**: ~3 years of daily estimates (Twelve Data global price x official USD/INR from the ECB x duty), or from your own CSV. Check Twelve Data's terms for showing derived data on a public site.
- **News + outlook**: each morning Claude searches a fixed list of trusted sites for overnight and upcoming events. Code checks every item. The 3-day range is computed from real price swings; the AI can only nudge it slightly.
- **Your gold**: sign in, record each purchase (date, grams, total paid incl. GST/charges). Each row is locked to your account by Postgres Row Level Security.

## Setup (about 30 minutes)
0. **Make `main` the default branch** (GitHub, Settings, General, Default branch, switch to `main`). Scheduled jobs, the Actions list and the repo's front page all come from the default branch. If it points at an old branch you won't see the Live prices / Backfill / Daily news workflows and the README will be out of date.
1. **Rename the repo** if you like (GitHub, Settings, General). The site uses relative paths.
2. **Supabase** (free): create a project, open *SQL Editor*, paste and run `supabase/schema.sql`. Authentication, Providers, Email: enable; turn on *Confirm email*; set minimum password length to 12; consider MFA. Copy the *Project URL* and the **publishable key** (starts with `sb_publishable_`; older projects call it the *anon* key) into `site/js/config.js`. It is public by design.
3. **Price providers**: create a free account at goldapi.io (live prices) and at twelvedata.com (one-time 3-year history) and copy each API key.
4. **GitHub secrets** (Settings, Secrets and variables, Actions): `GOLDAPI_KEY`, `TWELVEDATA_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (the **secret key**, starts with `sb_secret_`; older projects call it *service_role*. Server-side only: never put it in `site/` or share it). Optional variable `CLAUDE_MODEL`.
5. **Duty**: check `config/pricing.json` (`import_duty_pct`) against the current rule.
6. Run the workflows once from the Actions tab, in this order: **Backfill 3-year history**, **Live prices**, **Daily news and forecast**. Read each log: the jobs refuse to write data that fails checks and say why.
7. **Pages**: merge to `main`, then Settings, Pages, Source: GitHub Actions. Your site: `https://<you>.github.io/<repo>/`.

If the history source is unreachable or too short, the job stops without writing anything. Use your own file instead: `node scripts/import-csv.mjs file.csv gold usd-oz` (see header comment for formats).

## Local development
```bash
npm install
npm test && npm run validate     # 32 unit tests: pricing rules, forecast, meters, profit/loss, history, news checks, auth
npm run test:e2e                   # 18 real-browser tests against a fake in-memory backend (needs: npx playwright install chromium)
npm run serve                      # http://localhost:8080
```
`npm run prices:dry` and `npm run outlook:dry` call the real APIs with keys from your environment and write nothing.

## Layout
```
site/        static site (index.html, css/, js/ with js/lib pure logic, views/, data/allowed-domains.json)
scripts/     data jobs: fetch-live, backfill-history, import-csv, update-outlook (+ lib/)
supabase/    schema.sql (tables + Row Level Security)
config/      pricing.json (duty/premium)
.github/     CI, Pages deploy, live-prices, daily-outlook, backfill workflows
.claude/     Claude Code settings + guard hooks; CLAUDE.md = project memory; docs/PROGRESS.md = running log
tests/       unit tests (node:test) and tests/e2e (Playwright + fake Supabase)
```
