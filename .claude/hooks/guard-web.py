#!/usr/bin/env python3
"""PreToolUse (WebFetch|Bash): Claude may only pull content from allowlisted domains."""
import re
from urllib.parse import urlparse
from _lib import load_input, host_ok, hosts_in, block

d = load_input(); tool = d.get("tool_name"); ti = d.get("tool_input", {})

# Real network clients only. Plain words like "https" in prose are not commands.
NET = re.compile(r"(^|[;&|(]\s*|\s)(curl|wget|httpie|Invoke-WebRequest|nc|ncat|ssh|scp|git\s+clone|pip\s+install\s+git\+|npm\s+i(nstall)?\s+(git\+|https?:))(\s|$)")
# Commit/PR/log text may legitimately contain URLs (attribution links), so these are never inspected.
TEXT_ONLY = re.compile(r"\s*git\s+(commit|push|log|status|diff|add|branch|checkout)\b")
DEV_HOSTS = {"localhost", "127.0.0.1", "registry.npmjs.org", "github.com", "api.anthropic.com", "claude.ai"}

if tool == "WebFetch":
    host = urlparse(ti.get("url", "")).hostname
    if not host_ok(host):
        block(f"'{host}' is not on the trusted-source allowlist (site/data/allowed-domains.json). Use an allowlisted source or ask the owner to approve adding the domain.")
elif tool == "Bash":
    cmd = ti.get("command", "")
    if not TEXT_ONLY.match(cmd) and NET.search(cmd):
        for h in hosts_in(cmd):
            if h in DEV_HOSTS or host_ok(h):
                continue
            block(f"network command targets '{h}', which is not allowlisted.")
