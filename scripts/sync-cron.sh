#!/bin/bash
# Hourly tweet sync — calls the app's /api/sync endpoint.
# Run by cron. Logs results to scripts/sync-cron.log.
set -euo pipefail

LOG_DIR="$(dirname "$0")"
LOG_FILE="$LOG_DIR/sync-cron.log"
APP_URL="${APP_URL:-http://localhost:3000}"
CSV_URL="https://docs.google.com/spreadsheets/d/e/2PACX-1vTOkvJt78q-g8yiksB3gf80Cqsc-UGwFeFjEoA9Lfh_x5PZ69md0YS9MCrkVBP-tbVILYyKx_mFI1DZ/pub?gid=1420895083&single=true&output=csv"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

RESPONSE=$(curl -s -X POST "$APP_URL/api/sync" \
  -H 'Content-Type: application/json' \
  -d "{\"csvUrl\":\"$CSV_URL\"}" \
  --max-time 120 2>&1) || true

# Extract summary fields from JSON response
NEW=$(echo "$RESPONSE" | grep -o '"newTweets":[0-9]*' | grep -o '[0-9]*' || echo "?")
SKIPPED=$(echo "$RESPONSE" | grep -o '"skippedTweets":[0-9]*' | grep -o '[0-9]*' || echo "?")
CLAIMS=$(echo "$RESPONSE" | grep -o '"totalClaims":[0-9]*' | grep -o '[0-9]*' || echo "?")

echo "[$TIMESTAMP] new=$NEW skipped=$SKIPPED claims=$CLAIMS" >> "$LOG_FILE"

# Log the full response only if there were actual new tweets or an error
if [ "$NEW" != "0" ] && [ "$NEW" != "?" ]; then
  echo "  ↳ $RESPONSE" >> "$LOG_FILE"
fi
if echo "$RESPONSE" | grep -q '"error"'; then
  echo "  ↳ ERROR: $RESPONSE" >> "$LOG_FILE"
fi
