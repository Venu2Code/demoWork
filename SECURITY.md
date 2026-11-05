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

## Security review (2026-11-05)

Scope: website code, login/session handling, database rules, scheduled jobs, workflows, dependencies and git history.

**Checked and clean:** no HTML-injection or code-evaluation sinks in the website; no secrets in any commit on any branch; 0 known vulnerabilities in dependencies (`npm audit`); workflows have read-only permissions, never use `pull_request_target`, and CI never sees secrets.

**Weaknesses found and fixed in code** (each has an automatic test, in `tests/security.test.mjs`, `tests/auth.test.mjs`, `tests/safe-fetch.test.mjs`, `tests/e2e/`):

| # | Weakness | Fix |
|---|---|---|
| 1 | The 30-minute auto sign-out only worked while the tab stayed open; reopening the site later restored the session | Last-activity time is stored with the session and checked on page load, on every use and when the tab becomes visible |
| 2 | "Sign out" did not revoke the session on the server, so a copied refresh token kept working | Sign-out calls Supabase logout (this device) before clearing local data |
| 3 | The job fetch helper followed redirects automatically, so a trusted host could send a job to an untrusted one | Redirects are followed by hand (max 3) and every hop must be on the trusted list; responses are size-capped |
| 4 | The page policy allowed connections to ANY Supabase project (an exfiltration route if XSS ever appeared) | `connect-src` now names only this project's host; a test keeps it equal to `site/js/config.js` |
| 5 | No clickjacking protection (GitHub Pages cannot send frame headers) | `site/js/framebust.js` hides the page if it is framed and tries to break out |
| 6 | Jobs holding secret keys installed test tooling and always loaded the AI library | Those jobs use `npm ci --omit=dev`; the AI library is loaded only in the optional paid mode |
| 7 | Database: unneeded privileges on `purchases`, no cap on rows per account, internal request counter visible to the public | Privileges revoked, 5000 purchases per account cap, counter row hidden by the read policy (**re-run `supabase/schema.sql`**) |
| 8 | Dev server listened on all network interfaces | Loopback only |
| 9 | No automatic dependency updates | `.github/dependabot.yml` (npm and GitHub Actions, weekly) |

**Still your job (cannot be fixed in code):**

- **Supabase, Authentication settings:** set the minimum password length to **12** (the 12-character rule in the page can be bypassed by calling the API directly; Supabase's default is 6), keep "Confirm email" on, set Site URL and Redirect URLs to your Pages address only, and switch on CAPTCHA protection for sign-up and sign-in. "Prevent use of leaked passwords" and MFA are available on some plans.
- **GitHub:** turn on two-factor authentication; protect `main` (require a pull request and passing CI); turn on secret scanning, push protection and Dependabot alerts; keep Actions' default workflow permission on read-only.
- **Provider accounts** (Supabase, GoldAPI, Twelve Data, Anthropic if used): two-factor authentication; rotate a key immediately if it is ever pasted somewhere public.
- **Pin GitHub Actions to commit hashes** instead of version tags (Dependabot will propose updates). Not done here because commit hashes could not be looked up offline.

**Accepted risks, stated honestly:** the login token lives in the browser's storage (an XSS bug would expose it; the strict page policy and the no-HTML-injection rule are the defence); public price tables can be read by anyone, so heavy scraping could use up the free database quota; if "Confirm email" is off, the sign-up message can reveal whether an email already has an account; on a shared computer, sign out when you finish.

Report vulnerabilities privately via GitHub Security Advisories.
