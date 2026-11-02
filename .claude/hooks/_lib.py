"""Shared helpers for learnCSinSimple Claude Code hooks (stdlib only)."""
import json, os, re, sys
from urllib.parse import urlparse

ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def load_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}

def allowlist():
    with open(os.path.join(ROOT, "site", "data", "allowed-domains.json")) as f:
        return json.load(f)

def host_ok(host, lst=None):
    lst = lst or allowlist()
    host = (host or "").lower().rstrip(".")
    m = lambda d: host == d or host.endswith("." + d)
    return not any(m(d) for d in lst["blocked"]) and any(m(d) for d in lst["allowed"])

def block(msg):
    """Exit code 2 = block the tool call and feed msg back to Claude."""
    print(f"BLOCKED by learnCSinSimple policy: {msg}", file=sys.stderr)
    sys.exit(2)

def ask(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": reason}}))
    sys.exit(0)

URL_RE = re.compile(r"""https?://[^\s'"<>)\]]+""", re.I)
def hosts_in(text):
    return {(urlparse(u).hostname or "") for u in URL_RE.findall(text or "")}
