#!/bin/sh
# Copy the API keys from .env.local into Vercel's encrypted env settings, then redeploy.
# Run it yourself: sh scripts/push-keys.sh   (values are never printed)
cd "$(dirname "$0")/.." || exit 1
for k in TELEM_API_KEY TAVILY_API_KEY ANTHROPIC_API_KEY TELEM_BASE_URL; do
  v=$(grep -E "^$k=" .env.local | head -1 | cut -d= -f2-)
  [ -z "$v" ] && { echo "$k missing in .env.local, skipped"; continue; }
  vercel env rm "$k" production --yes >/dev/null 2>&1
  printf '%s' "$v" | vercel env add "$k" production >/dev/null 2>&1 && echo "$k saved to Vercel" || echo "$k FAILED"
done
printf '0' | vercel env add MOCK production >/dev/null 2>&1
vercel deploy --prod --yes 2>&1 | grep -E "Aliased|Error"
