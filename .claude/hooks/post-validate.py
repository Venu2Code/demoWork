#!/usr/bin/env python3
"""PostToolUse (Write|Edit): re-validate content whenever data or the allowlist changes."""
import subprocess, sys
from _lib import load_input, ROOT

p = load_input().get("tool_input", {}).get("file_path", "") or ""
if "/site/data/" in p or p.startswith("site/data/"):
    r = subprocess.run(["node", "scripts/validate-content.mjs"], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr or r.stdout, file=sys.stderr); sys.exit(2)
