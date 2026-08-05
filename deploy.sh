#!/usr/bin/env bash
# deploy.sh — rebuild and redeploy the serenity production app safely.
#
# Build FIRST, restart only if the build succeeds. The old server keeps
# serving the previous build while npm run build runs; if the build fails,
# the running server is left untouched (never serve a broken .next).
#
# NEVER run `npm run dev` (or next dev) in this repo while the PM2
# production server is running — dev-mode artifacts corrupt .next and the
# prod server serves missing chunks (503/500, watchdog alerts) until rebuilt.
set -euo pipefail
cd "$(dirname "$0")"

echo "→ Building (old build keeps serving until this succeeds)..."
npm run build

echo "→ Restarting serenity..."
pm2 restart serenity --update-env
pm2 save >/dev/null 2>&1 || true

echo "✓ Deployed — http://72.61.136.176:3000"
echo "  Check: pm2 status / tail -f /root/.pm2/logs/serenity-out.log"
