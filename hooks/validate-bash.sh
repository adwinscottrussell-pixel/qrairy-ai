#!/usr/bin/env bash
# PreToolUse hook: blocks unsafe bash commands before Claude Code executes them.
# Wire this up in .claude/settings.json under hooks.PreToolUse if/when that
# file is added (not created in this phase).

set -euo pipefail

INPUT="$(cat)"
COMMAND="$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*: *"//;s/"$//' || true)"

BLOCKLIST=(
  "rm -rf /"
  "rm -rf ~"
  ":(){:|:&};:"
  "chmod -R 777"
  "curl .*| *sh"
  "wget .*| *sh"
  "prisma migrate deploy"   # production migration — should always be a deliberate, confirmed action
  "prisma migrate reset"    # destroys data
  "railway (up|deploy)"     # deploys should be confirmed explicitly, not auto-run
)

for pattern in "${BLOCKLIST[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: command matches guarded pattern: $pattern (confirm with the user first)" >&2
    exit 1
  fi
done

exit 0
