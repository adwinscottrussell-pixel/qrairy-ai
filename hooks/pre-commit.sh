#!/usr/bin/env bash
# Git pre-commit hook: prevents committing env files or obvious secrets.
# Install with (PowerShell or bash, from repo root):
#   Copy-Item hooks\pre-commit.sh .git\hooks\pre-commit   (Windows/PowerShell)
#   cp hooks/pre-commit.sh .git/hooks/pre-commit          (macOS/Linux)
# Then ensure it's executable: chmod +x .git/hooks/pre-commit (not needed on Windows)

set -euo pipefail

echo "Running QRAIVY pre-commit checks..."

# 1. Prevent committing any .env variant (root .gitignore only lists .env,
#    backend/.gitignore correctly covers .env.* — this check backstops both)
if git diff --cached --name-only | grep -E '(^|/)\.env(\..+)?$' | grep -v '\.env\.example$'; then
  echo "ERROR: attempting to commit an .env file. Only .env.example should be committed." >&2
  exit 1
fi

# 2. Basic secret pattern scan on staged changes — tuned to this project's
#    actual providers (Clerk, Stripe, Cloudinary, Resend, Anthropic, Google,
#    VAPID/web-push keys) plus generic api_key/secret/password patterns.
if git diff --cached | grep -Ei "(sk_live_|sk_test_|clerk_secret|CLOUDINARY_URL=cloudinary://|re_[a-zA-Z0-9]{20,}|sk-ant-|VAPID_PRIVATE_KEY|api_key|secret|password)\s*[:=]\s*['\"][^'\"]{8,}"; then
  echo "WARNING: possible hardcoded secret/key in staged changes. Review before committing." >&2
  exit 1
fi

echo "Pre-commit checks passed."
