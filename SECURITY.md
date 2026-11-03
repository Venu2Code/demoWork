# Security and data-accuracy model

| Concern | Control |
|---|---|
| Someone reading another user's gold savings | Postgres Row Level Security on `purchases`: policies are `to authenticated` and require `auth.uid() = user_id`; the anonymous role is revoked entirely. Even with the public anon key, the API returns nothing |
| Stolen/shared device | Session token only in localStorage (never purchases); auto sign-out after 30 min idle; purchases are held in memory only and cleared on sign-out |
| Weak accounts | Passwords of 12+ characters enforced in the UI. In Supabase, also turn on "Confirm email", set the minimum password length to 12 and enable MFA (TOTP) |
| Tampering with public data | `price_ticks`, `daily_prices`, `news_items`, `forecasts` have no insert/update/delete policy and write privileges are revoked: only the server-side secret key (legacy name: service_role; stored as a GitHub Actions secret) can write |
| Wrong prices | Ingest rejects non-positive, out-of-range or >8% jumps and inconsistent 18K/22K/24K; the UI shows source + IST time, warns when data is over 3 hours old, flags history and rates as estimates |
| Bad or injected news content | Default path has no AI: headlines come from a fixed list of feeds on the trusted-domain list, links must be https + allowlisted, text is stripped of markup, cleaned and screened, dates are checked, and everything is rendered as plain text. Events come from the BLS calendar. Feed failures are logged and skipped. If the optional Claude mode is used: it may only search allowlisted domains, links must come from real search results, and its bias is clamped to [-1,1] |
| XSS | Strict CSP (`script-src 'self'`, no inline code, `connect-src` only self + Supabase), no `innerHTML`/`eval`, no third-party scripts |
| Leaked keys | Keys only in GitHub secrets; Claude Code hooks block writing key patterns, reading `.env`, and edits to the allowlist/hooks without confirmation; the secret/service_role key is never in `site/` |
| Claude Code misuse in development | `.claude/hooks`: web/network allowlist, secret guard, post-edit validation |

Report vulnerabilities privately via GitHub Security Advisories.
