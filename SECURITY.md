# Security model

learnCSinSimple is a static site, so there is no server or database to break into. The main risks are (1) malicious or low-quality content entering via the AI pipeline, (2) leaked keys, and (3) XSS. Defences:

| Threat | Control |
|---|---|
| AI pulls content from unwanted sites | Claude's web search is restricted to `allowed_domains`; every item URL is re-checked (https, allowlist, blocklist, no credentials/odd ports) and must appear in the actual search results ("grounding") |
| Prompt injection from web pages | System prompt marks results as untrusted data; text is sanitised (control chars/`<>` stripped, length caps, suspicious-phrase rejection); the model has no tools except search |
| Malicious content reaching visitors | Rendered with `textContent` only; links re-validated in the browser; `rel="noopener noreferrer nofollow"` |
| XSS | Strict CSP (`script-src 'self'`, no inline code, no third-party scripts), no `innerHTML`/`eval` |
| Leaked API keys | Key only in GitHub Actions secrets; Claude Code hooks block writing key patterns and reading `.env`; `.gitignore` covers env files |
| Data tampering / accounts | Supabase Row Level Security: users can touch only their own `progress` row; `sources` is read-only to the public |
| Runaway cost / bad data | Daily job is capped (`max_uses`, one run/day, 300 items kept); empty/invalid output leaves data untouched |
| Claude Code (dev-time) misuse | `.claude/hooks`: web allowlist for `WebFetch`/shell network commands, secret guard, allowlist/hook edits require confirmation, post-edit content validation |

Report vulnerabilities privately via GitHub Security Advisories on this repository.
