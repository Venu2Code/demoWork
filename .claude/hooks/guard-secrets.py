#!/usr/bin/env python3
"""PreToolUse (Write|Edit|Bash|Read): keep secrets out of the repo and protect the allowlist."""
import base64, json, re, os
from _lib import load_input, block, ask

d = load_input(); tool = d.get("tool_name"); ti = d.get("tool_input", {})
path = ti.get("file_path", "") or ""
text = " ".join(str(ti.get(k, "")) for k in ("content", "new_string", "command"))

if tool == "Read" and re.search(r"(^|/)\.env(\.(?!example$)[\w.-]+)?$", path):
    block("reading .env files is not allowed; ask the owner for the specific value you need.")
if tool in ("Write", "Edit") and re.search(r"(^|/)\.env(\.(?!example$)[\w.-]+)?$", path):
    block("never write real secrets to .env files in this repo (use .env.example placeholders + GitHub secrets).")

PATTERNS = {
    "Anthropic API key": r"sk-ant-[A-Za-z0-9_-]{20,}",
    "OpenAI-style key": r"\bsk-[A-Za-z0-9]{32,}\b",
    "AWS access key": r"\bAKIA[0-9A-Z]{16}\b",
    "GitHub token": r"\bgh[pousr]_[A-Za-z0-9]{30,}\b",
    "Private key": r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "Supabase secret key": r"\bsb_secret_[A-Za-z0-9_-]{16,}",
}
for name, rx in PATTERNS.items():
    if re.search(rx, text):
        block(f"possible {name} detected in content. Use environment variables / GitHub secrets instead.")
for tok in re.findall(r"eyJ[\w-]+\.([\w-]+)\.[\w-]+", text):  # Supabase JWT keys: anon is fine, service_role is not
    try:
        payload = json.loads(base64.urlsafe_b64decode(tok + "=" * (-len(tok) % 4)))
        if payload.get("role") == "service_role":
            block("Supabase service_role key detected. It must NEVER be committed or shipped to the browser.")
    except Exception:
        pass

if tool in ("Write", "Edit") and path.endswith("site/data/allowed-domains.json"):
    ask("You are changing the trusted-source allowlist. Confirm each domain is reputable.")
if tool in ("Write", "Edit") and re.search(r"\.claude/(settings\.json|hooks/)", path):
    ask("You are changing the security hooks/settings that protect this site.")
