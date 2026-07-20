#!/bin/bash
# Daily price refresh — calls /api/prices/refresh to update stock prices from Finnhub.
# Run by cron. Logs to scripts/price-cron.log.
set -euo pipefail

LOG_DIR="$(dirname "$0")"
LOG_FILE="$LOG_DIR/price-cron.log"
APP_URL="${APP_URL:-http://localhost:3000}"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

RESPONSE=$(curl -s -X POST "$APP_URL/api/prices/refresh" --max-time 300 2>&1) || true

PRICED=$(echo "$RESPONSE" | grep -o '"priced":[0-9]*' | grep -o '[0-9]*' || echo "?")
FAILED=$(echo "$RESPONSE" | grep -o '"failed":[0-9]*' | grep -o '[0-9]*' || echo "?")
FMPB=$(echo "$RESPONSE" | grep -o '"withPb":[0-9]*' | grep -o '[0-9]*' || echo "?")

echo "[$TIMESTAMP] priced=$PRICED withPb=$FMPB failed=$FAILED" >> "$LOG_FILE"
