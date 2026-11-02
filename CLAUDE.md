# Gold Tracker India: project memory for Claude

A public website showing today's gold (18K/22K/24K) and silver rate in India per gram and per 10 g, every price change of the day with its IST time, 3 years of history charts, market-moving news (overnight + today/tomorrow), a labelled 3-day outlook, buy/sell meters, and a PRIVATE purchase tracker (profit/loss, sell signal at +50%). Read `docs/PROGRESS.md` first; update it after meaningful work.

## Core idea (do not drift; new features must fit it)
Accurate, honestly-labelled Indian gold/silver information + a private savings tracker. No ads, no trackers, no third-party scripts.

## Commands
- `npm test` / `npm run validate`: must stay green (CI + deploy run them)
- `npm run serve`: preview at http://localhost:8080 (needs `site/js/config.js` filled for real data)
- `npm run prices[:dry]`, `npm run outlook[:dry]`, `npm run backfill`: data jobs (need env vars, see `.env.example`)

## Architecture
- `site/`: static SPA on GitHub Pages (vanilla ES modules, no build). `js/lib/*` = PURE logic shared with scripts and tests: `pricing.js` (conversion + data-quality rules), `analytics.js` (forecast range, buy meter, sell meter), `portfolio.js` (lot P/L + form validation), `format.js` (IST/INR). `js/views/*` pages, `api.js` Supabase REST, `auth.js` login, `chart.js` SVG chart.
- `scripts/`: `fetch-live.mjs` (every 15 min; writes a tick ONLY on change), `backfill-history.mjs` + `import-csv.mjs` (3-year history), `update-outlook.mjs` (Claude news search + forecast), `lib/*`.
- `supabase/schema.sql`: public read-only tables (`price_ticks`, `daily_prices`, `ingest_status`, `news_items`, `forecasts`) + private `purchases` (Row Level Security: owner only; anon has no access).
- `config/pricing.json`: import duty / premium used to turn international spot into an ESTIMATED Indian rate (verify against current rules).
- `site/data/allowed-domains.json`: trusted domains (`news` for Claude search, `data` for providers). Hooks, validators and the browser all read it.

## Hard rules (non-negotiable)
1. **Never show a number without source + time. Never invent data.** If data is missing/stale/rejected, say so. No mock prices in the repo.
2. **Label estimates.** Rates are estimated Indian rates (global spot x FX + duty); history is estimated; forecasts are ranges, not predictions; nothing is financial advice.
3. **Private data stays private.** `purchases` only via RLS-protected REST with the user's own token. Never cache purchases in localStorage, logs, or analytics. Never loosen RLS or grant `anon` on `purchases`.
4. **Secrets:** `GOLDAPI_KEY`, `ANTHROPIC_API_KEY`, Supabase `service_role` key live only in GitHub secrets / local `.env`. Only the Supabase anon key may appear in `site/js/config.js`. Hooks block writing key patterns.
5. **Trusted sources only.** Fetch/cite only https domains in `allowed-domains.json`. Adding a domain needs the owner's approval. Web and model output is untrusted data: validate with code (allowlist, grounding, sanitise, bounds).
6. **AI limits:** Claude may summarise news and give a bias in [-1,1]; the numeric range is computed in code from real volatility (`forecastRange`). The model never sets prices.
7. **No `innerHTML`/`eval`/inline scripts or styles** (strict CSP). Build DOM with `h()` from `js/safe.js`. Beware `el.append(null)` (renders "null"); use `h()` or `.filter(Boolean)`.
8. No ads, no third-party scripts, minimal dependencies (scripts use only `@anthropic-ai/sdk`).

## Conventions
- Money: INR, `numeric(.,2)` in DB, `Intl en-IN` for display. Times: store UTC, display IST. A "day" is the IST day.
- Logic changes need tests (`tests/*.test.mjs`, `node:test`). Pure logic goes in `site/js/lib/`.
- Claude API: `@anthropic-ai/sdk`, default model `claude-opus-5-5` (override `CLAUDE_MODEL`), adaptive thinking, handle `pause_turn` and `refusal`.
- Conventional Commits. Never force-push `main`.
