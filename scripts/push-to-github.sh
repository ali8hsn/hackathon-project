#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! gh auth status &>/dev/null; then
  echo "Not logged in. Run this first in Terminal, then complete the browser step:"
  echo "  gh auth login -h github.com -p https --web"
  exit 1
fi

REPO_NAME="${1:-aria911}"
USER="$(gh api user -q .login)"
echo "Creating https://github.com/${USER}/${REPO_NAME} and pushing..."

if git remote get-url origin &>/dev/null; then
  git push -u origin main
else
  gh repo create "${REPO_NAME}" --public --source=. --remote=origin --push
fi

echo "Done: https://github.com/${USER}/${REPO_NAME}"
