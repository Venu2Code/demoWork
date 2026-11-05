// Security regression tests: static checks that fail if a protection is removed or a risky pattern is introduced.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const walk = (dir) => readdirSync(path.join(ROOT, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]; });
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
const workflows = () => readdirSync(path.join(ROOT, ".github/workflows")).filter((f) => f.endsWith(".yml")).map((f) => [f, read(`.github/workflows/${f}`)]);

test("website code never uses HTML-injection or code-evaluation sinks", () => {
  const bad = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function\b|setTimeout\(\s*["'`]|setInterval\(\s*["'`])|javascript:|\.srcdoc\b/;
  for (const f of walk("site/js").filter((x) => x.endsWith(".js"))) assert.ok(!bad.test(stripComments(read(f))), `${f} uses a dangerous sink`);
});

test("page security policy is strict: no inline code, no wildcards, connections only to our own Supabase host", () => {
  const html = read("site/index.html"), csp = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, "CSP meta tag missing");
  assert.match(csp, /default-src 'none'/); assert.match(csp, /script-src 'self'(;|$)/); assert.match(csp, /object-src 'none'/); assert.match(csp, /base-uri 'none'/); assert.match(csp, /form-action 'none'/);
  assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), "CSP must not contain unsafe-inline, unsafe-eval or wildcards");
  const host = new URL(read("site/js/config.js").match(/SUPABASE_URL = "([^"]+)"/)[1]).host;
  assert.ok(csp.match(/connect-src ([^;]+)/)[1].split(" ").includes(`https://${host}`), "connect-src must name the configured Supabase host");
  assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html), "no inline <script> blocks");
  assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "")), "no inline style or event-handler attributes");
  assert.ok(html.includes("js/framebust.js"), "clickjacking protection must be loaded");
  assert.match(read("site/js/framebust.js"), /window\.top !== window\.self/);
});

test("no secrets are committed (all tracked files)", () => {
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter((f) => f && !f.endsWith("package-lock.json") && !/\.(png|jpg|ico|woff2?)$/.test(f));
  const patterns = [["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{8,}/], ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{16,}/], ["AWS key", /\bAKIA[0-9A-Z]{16}\b/], ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}/], ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/]];
  for (const f of files) {
    const text = read(f);
    for (const [name, re] of patterns) assert.ok(!re.test(text), `${f} contains what looks like a ${name}`);
    for (const m of text.matchAll(/\beyJ[\w-]{10,}\.([\w-]{10,})\.[\w-]{5,}/g)) {
      let role = ""; try { role = JSON.parse(Buffer.from(m[1], "base64url").toString()).role; } catch { /* not a JWT */ }
      assert.notEqual(role, "service_role", `${f} contains a service_role JWT`);
    }
  }
  assert.match(read("site/js/config.js"), /SUPABASE_ANON_KEY = "(sb_publishable_[A-Za-z0-9_-]+|)"/, "only a PUBLISHABLE key may be in the website config");
  assert.ok(!/service/i.test(read("site/js/config.js").replace(/\/\/.*$/gm, "")), "config.js must not mention a service key outside comments");
});

test("only the website folder is published and it contains no private-looking files", () => {
  assert.match(read(".github/workflows/deploy.yml"), /path:\s*site\b/);
  for (const f of walk("site")) { assert.ok(/\.(html|css|js|json|svg)$/.test(f), `unexpected file type in site/: ${f}`); assert.ok(!/\.(env|pem|key|sql|map)$|\.env\./i.test(f), `private-looking file in site/: ${f}`); }
});

test("database: row level security everywhere, purchases locked to their owner, anonymous role has no access", () => {
  const sql = read("supabase/schema.sql");
  const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ["daily_prices", "forecasts", "ingest_status", "news_items", "price_ticks", "purchases"]);
  for (const t of tables) assert.match(sql, new RegExp(`alter table public\\.${t}\\s+enable row level security`), `RLS not enabled on ${t}`);
  const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.purchases for (\w+) to (\w+)/g)];
  assert.deepEqual(policies.map((p) => p[2]).sort(), ["delete", "insert", "select", "update"], "purchases needs exactly the four owner policies");
  assert.ok(policies.every((p) => p[3] === "authenticated"), "purchases policies must be 'to authenticated' only");
  const ownerOnly = sql.match(/create policy "owner[^;]+;/g); assert.ok(ownerOnly.every((p) => /auth\.uid\(\) = user_id/.test(p)), "every owner policy must compare auth.uid() with user_id");
  assert.match(sql, /revoke all on public\.purchases from anon/);
  assert.match(sql, /revoke truncate, references, trigger on public\.purchases from authenticated/);
  assert.match(sql, /revoke insert, update, delete, truncate on public\.price_ticks[^;]+from anon, authenticated/, "browsers must not be able to write public data");
  assert.ok(!/grant\s[^;]*\bto\s+(anon|authenticated|public)\b/i.test(sql), "no grants to browser roles");
  assert.ok(!/create policy [^;]*on public\.(price_ticks|daily_prices|ingest_status|news_items|forecasts) for (insert|update|delete|all)/.test(sql), "public tables must have no write policies");
  assert.match(sql, /source not like ''%:usage''/, "internal request counter must be hidden from the public (quotes are doubled because the policy is built inside a quoted string)");
  assert.match(sql, /purchases_limit/, "per-account row cap must exist");
  assert.match(sql, /user_id\s+uuid not null default auth\.uid\(\) references auth\.users/);
});

test("workflows: least privilege, no pull_request_target, jobs with secrets install runtime packages only", () => {
  for (const [name, y] of workflows()) {
    assert.ok(!/pull_request_target/.test(y), `${name} uses pull_request_target`);
    assert.match(y, /^permissions:\s*\n\s+contents: read/m, `${name} must declare read-only contents permission`);
    assert.ok(!/contents:\s*write|permissions:\s*write-all/.test(y), `${name} has write access it should not need`);
    if (/secrets\.(SUPABASE|GOLDAPI|TWELVEDATA|ANTHROPIC)/.test(y)) assert.match(y, /npm ci --omit=dev/, `${name} holds secrets so it must install runtime packages only`);
    assert.ok(!/\$\{\{\s*github\.event\.(issue|pull_request|comment|head_commit)[^}]*\}\}\s*$/m.test(y.replace(/display_title/g, "")), `${name} interpolates untrusted event text into a shell`);
  }
  const ci = read(".github/workflows/ci.yml"); assert.ok(!/secrets\./.test(ci), "CI runs on pull requests and must never see secrets");
  assert.match(read(".github/dependabot.yml"), /package-ecosystem: "npm"[\s\S]*package-ecosystem: "github-actions"/);
});

test("jobs: no third-party AI library runs beside the database secret by default; dev server is loopback only", () => {
  for (const f of walk("scripts").filter((x) => x.endsWith(".mjs"))) assert.ok(!/^import [^\n]*@anthropic-ai\/sdk/m.test(read(f)), `${f} must load the AI library lazily (only in the optional paid mode)`);
  assert.match(read("scripts/update-outlook.mjs"), /await import\("@anthropic-ai\/sdk"\)/);
  assert.match(read("scripts/serve.mjs"), /listen\([^)]*"127\.0\.0\.1"/);
  for (const f of ["scripts/fetch-live.mjs", "scripts/backfill-history.mjs", "scripts/update-outlook.mjs"]) assert.match(read(f), /readLimited/, `${f} must cap response sizes`);
  assert.match(read("scripts/lib/common.mjs"), /redirect: "manual"/, "redirects must be checked hop by hop");
});

test("trusted-domain list has no wildcards, IPs or plain-http entries, and keeps the shortener blocklist", () => {
  const list = JSON.parse(read("site/data/allowed-domains.json"));
  for (const d of [...list.allowed, ...list.news, ...list.data]) { assert.match(d, /^[a-z0-9.-]+\.[a-z]{2,}$/, `bad domain ${d}`); assert.ok(!/^\d+\.\d+\.\d+\.\d+$/.test(d), `IP address ${d}`); }
  for (const d of ["bit.ly", "t.co", "tinyurl.com", "pastebin.com"]) assert.ok(list.blocked.includes(d), `${d} must stay blocked`);
});
