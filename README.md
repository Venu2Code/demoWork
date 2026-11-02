# learnCSinSimple

Learn **Hardware, Programming, Networking, AI and Cloud** from foundations to advanced, track your progress (XP, levels, streaks, badges), and stay current with a **daily news and resource feed curated by Claude** from trusted sources only.

- 30 lessons across 5 tracks (each with key ideas, a quiz, notes, vetted resources) + a resource library
- Progress tracker: daily goal ring, streaks, 15-week activity heatmap, badges, bookmarks, export/import
- Daily auto-update: GitHub Action -> Claude API (web search limited to an allowlist) -> validated -> committed -> redeployed
- Optional accounts + cross-device sync with Supabase (free tier)
- Hosted free on GitHub Pages. No build step, no front-end dependencies.

## Quick start (local)
```bash
npm install
npm run serve        # http://localhost:8080
npm test && npm run validate
```

## Deploy on GitHub Pages
1. Rename the repository to **learnCSinSimple** (GitHub -> Settings -> General -> Repository name). The site uses relative paths, so no code changes are needed.
2. Merge this branch into `main` (open a pull request).
3. Settings -> **Pages** -> Build and deployment -> Source: **GitHub Actions**.
4. The `Deploy to GitHub Pages` workflow publishes `site/`. Your URL: `https://<your-username>.github.io/learnCSinSimple/`.

## Daily updates with Claude
1. Create an API key in the Anthropic Console.
2. Repo -> Settings -> Secrets and variables -> Actions -> **New repository secret** `ANTHROPIC_API_KEY`. (Optional variable `CLAUDE_MODEL`, default `claude-opus-5-5`; a cheaper model such as `claude-sonnet-5-5` works too.)
3. Actions -> **Daily learning update** -> Run workflow to test. It then runs every day at 05:17 UTC.
4. Local test: copy `.env.example` to `.env`, set the key, run `export $(grep -v '^#' .env | xargs) && npm run update:dry`.

How it stays safe: the search tool is limited to `site/data/allowed-domains.json`; each item is validated (https, allowlisted host, no shorteners, sanitised text, URL must appear in real search results); if nothing valid comes back, nothing is changed. Add a trusted site by editing the allowlist (max 64 domains) and opening a PR.

## Accounts & database (Supabase)
1. Create a free project at supabase.com. SQL Editor -> paste and run `supabase/schema.sql`.
2. Authentication -> Providers -> Email: enabled (turn "Confirm email" on for production).
3. Settings -> API: copy **Project URL** and the **anon public** key into `site/js/config.js` (these are public by design; Row Level Security protects data).
4. Optional: add repository secrets `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` so the daily job also stores every curated source in the `sources` table (your single library of materials). **Never** put the service key in `config.js`.

## Working with Claude Code on this project
- `CLAUDE.md` is the project memory (architecture, commands, hard rules). `docs/PROGRESS.md` is the running log.
- `.claude/settings.json` + `.claude/hooks/` enforce: allowlisted web access only, no secrets written or `.env` read, confirmation before changing the allowlist or hooks, automatic content validation after data edits. See `SECURITY.md`.
- To make this a Claude *Project* on claude.ai: create a project, add `CLAUDE.md`, `README.md`, `SECURITY.md` and `docs/PROGRESS.md` as project knowledge, and keep `docs/PROGRESS.md` updated after each session.

## Adding content
Edit `site/data/curriculum.json` (see `CLAUDE.md` for the lesson shape), run `npm run validate`, commit. Ideas live in `docs/PROGRESS.md`.

## Layout
```
site/            deployed static site (index.html, css/, js/, data/)
scripts/         daily updater, validator, shared rules, dev server
supabase/        schema.sql (tables + Row Level Security)
.github/         CI, Pages deploy, daily update workflows
.claude/         Claude Code settings + guard hooks
tests/           node:test suites
```
