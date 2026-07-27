#!/bin/bash
# Batch summarize stocks in order of most claims (richest data first)
# Usage: ./scripts/summarize-batch.sh

TICKERS=(
  META NVDA AAOI MU LITE AEHR NBIS "005930.KS" SPCX AXTI
  GOOGL POET IREN XFAB INTC AMD "000660.KS" "SHA.DE" AMZN MSFT
  "2316.TW" TSLA ANTH RDDT JBL MRVL "093370.KS" TSEM "688017.SS"
  COHR IQE ALRIB WOLF AAPL AEVA
)

TOTAL=${#TICKERS[@]}
DONE=0
OK=0
FAIL=0

echo "=== Summarizing $TOTAL stocks ==="
echo "Started at $(date)"
echo ""

for TICKER in "${TICKERS[@]}"; do
  DONE=$((DONE + 1))
  echo "[$DONE/$TOTAL] Summarizing $TICKER ..."

  # URL-encode the ticker (handle dots)
  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TICKER'))")

  START=$(date +%s)
  RESPONSE=$(curl -s -X POST "http://localhost:3000/api/stocks/$ENCODED/summarize" \
    -H "Content-Type: application/json" \
    --max-time 120 2>&1)
  END=$(date +%s)
  ELAPSED=$((END - START))

  if echo "$RESPONSE" | grep -q '"summary"'; then
    # Extract chokepoint depth if present
    DEPTH=$(echo "$RESPONSE" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    summary = data.get('summary', '')
    import re
    m = re.search(r'Chokepoint Depth:\*?\*\s*(\d)/5', summary)
    if m:
        print(m.group(1))
except: pass
" 2>/dev/null)
    OK=$((OK + 1))
    echo "  ✅ OK (${ELAPSED}s)  depth: ${DEPTH:-N/A}"
  else
    FAIL=$((FAIL + 1))
    ERR=$(echo "$RESPONSE" | head -c 150)
    echo "  ❌ FAIL (${ELAPSED}s)  $ERR"
  fi

  # Brief pause between calls to avoid hammering DeepSeek
  sleep 2
done

echo ""
echo "=== Done at $(date) ==="
echo "Total: $TOTAL | OK: $OK | Failed: $FAIL"

# Show updated counts
echo ""
echo "--- DB state after run ---"
sqlite3 data/tracker.db "SELECT COUNT(*) as with_summary, COUNT(CASE WHEN chokepointDepth IS NOT NULL THEN 1 END) as with_depth FROM Stock WHERE summary IS NOT NULL AND summary != '';"
