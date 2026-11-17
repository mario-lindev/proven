#!/bin/sh
# Apply the local provider configuration to the linked Vercel project.
set -eu
cd "$(dirname "$0")/.."
command -v vercel >/dev/null || { echo "Install and sign in to the Vercel CLI first." >&2; exit 1; }
test -f .vercel/project.json || { echo "Link the Proven Vercel project first." >&2; exit 1; }
test -r .env.local || { echo "Create .env.local from .env.example first." >&2; exit 1; }

keys="TELEM_API_KEY TAVILY_API_KEY ANTHROPIC_API_KEY"
settings="TELEM_BASE_URL TELEM_MCP_URL TAVILY_BASE_URL ANTHROPIC_BASE_URL ANTHROPIC_MODEL MOCK"

value() {
  sed -n "s/^$1=//p" .env.local | tail -n 1
}

for name in $keys $settings; do
  if [ -z "$(value "$name")" ]; then
    echo "$name is missing from .env.local." >&2
    exit 1
  fi
done

upload() {
  if ! value "$1" | vercel env add "$1" production --force --type "$2" >/dev/null 2>&1; then
    echo "Could not update $1 in Vercel." >&2
    exit 1
  fi
  echo "$1 saved to Vercel."
}

for name in $settings; do upload "$name" config; done
for name in $keys; do upload "$name" secret; done
echo "Provider settings saved. Redeploy the linked project to apply them."
