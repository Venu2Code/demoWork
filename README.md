# Gold Tracker India

Today's **gold (18K / 22K / 24K) and silver rate in India**, per gram and per 10 g, with every price change of the day and its **IST time**, 3 years of price history, news that can move tomorrow's rate, a clearly labelled 3-day outlook, "good time to buy?" and "reached your sell target?" meters, and a **private tracker** for your own purchases (profit or loss including GST and charges).

> Information only, not financial advice. Rates are **estimates** (international price converted to INR plus import duty). Your jeweller's rate, GST and making charges will differ. See `SECURITY.md` for how wrong data is prevented.

## How it works
- **Live prices**: a GitHub Action calls a metals API every 15 minutes, validates the numbers, and saves a row only when the price changes.
- **History**: ~3 years of daily estimates built from open data (global price x official USD/INR x duty), or from your own CSV.
- **News + outlook**: each morning Claude searches a fixed list of trusted sites for overnight and upcoming events. Code checks every item. The 3-day range is computed from real price swings; the AI can only nudge it slightly.
- **Your gold**: sign in, record each purchase (date, grams, total paid incl. GST/charges). Each row is locked to your account by Postgres Row Level Security.

## Setup (about 30 minutes)
1. **Rename the repo** if you like (GitHub, Settings, General). The site uses relative paths.
2. **Supabase** (free): create a project, open *SQL Editor*, paste and run `supabase/schema.sql`. Authentication, Providers, Email: enable; turn on *Confirm email*; set minimum password length to 12; consider MFA. Copy the *Project URL* and the **publishable key** (starts with `sb_publishable_`; older projects call it the *anon* key) into `site/js/config.js`. It is public by design.
3. **Price provider**: create an account at goldapi.io and copy the API key.
4. **GitHub secrets** (Settings, Secrets and variables, Actions): `GOLDAPI_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (the **secret key**, starts with `sb_secret_`; older projects call it *service_role*. Server-side only: never put it in `site/` or share it). Optional variable `CLAUDE_MODEL`.
5. **Duty**: check `config/pricing.json` (`import_duty_pct`) against the current rule.
6. Run the workflows once from the Actions tab, in this order: **Backfill 3-year history**, **Live prices**, **Daily news and forecast**. Read each log: the jobs refuse to write data that fails checks and say why.
7. **Pages**: merge to `main`, then Settings, Pages, Source: GitHub Actions. Your site: `https://<you>.github.io/<repo>/`.

If the free history sources are unreachable, use your own file: `node scripts/import-csv.mjs file.csv gold usd-oz` (see header comment for formats).

## Local development
```bash
npm install
npm test && npm run validate
npm run serve           # http://localhost:8080
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
tests/       node:test suites
```
