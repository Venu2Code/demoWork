#!/usr/bin/env bash
# SessionStart: give Claude the current project state so every session picks up where the last left off.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
echo "learnCSinSimple session context:"
[ -f docs/PROGRESS.md ] && sed -n '1,40p' docs/PROGRESS.md
node scripts/validate-content.mjs 2>&1 | tail -3
