# Project log (read me first in every Claude session)

**Product:** learnCSinSimple, a static learning site (GitHub Pages) with 5 tracks, a progress tracker, and a daily Claude-curated news feed.

## Done
- [x] Static SPA (vanilla ES modules, strict CSP, no third-party scripts)
- [x] Curriculum: 30 lessons x 5 tracks (hardware, programming, networking, ai, cloud) + 29 resources
- [x] Tracker: XP, levels, streaks, daily goal, heatmap, badges, notes, bookmarks, export/import
- [x] Optional Supabase accounts + sync (REST, RLS) and `sources` table for the curated library
- [x] Daily updater (Claude API + web search restricted to allowlist, schema + grounding validation)
- [x] Claude Code hooks (web allowlist, secret guard, post-edit validation), CLAUDE.md, SECURITY.md
- [x] Workflows: CI, Pages deploy, daily update

## Next ideas
- [ ] More lessons per track (aim 12+), each with a hands-on exercise
- [ ] Weekly "digest" lesson generated from the week's news (human reviewed)
- [ ] Spaced-repetition review of past quiz questions
- [ ] Search across lessons; learning-path recommendations from `trending`

## Decisions
- Static hosting + JSON content: free, fast, no server to attack. Supabase only for optional accounts.
- AI content is never trusted: allowlist -> schema -> grounding (URL must appear in search results) -> text sanitiser -> rendered with textContent only.
- Anthropic API key lives ONLY in GitHub Actions secrets. The browser only ever sees the Supabase anon key.
