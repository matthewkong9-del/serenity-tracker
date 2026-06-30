#!/bin/bash
# Serenity Tracker — automated DB backup to private GitHub repo
# Safe for running while the app is live (uses sqlite3 .backup for consistency)
set -e

cd /root/serenity-tracker
DATE=$(date '+%Y-%m-%d %H:%M')

echo "[backup] $(date '+%H:%M:%S') — creating safe DB snapshot..."
sqlite3 data/tracker.db ".backup /tmp/tracker-backup.db"

# Only commit if the DB actually changed since last commit
if git diff --quiet HEAD -- data/tracker.db 2>/dev/null && \
   diff -q /tmp/tracker-backup.db data/tracker.db > /dev/null 2>&1; then
    echo "[backup] $(date '+%H:%M:%S') — no changes, skipping"
    rm /tmp/tracker-backup.db
    exit 0
fi

cp /tmp/tracker-backup.db data/tracker.db
rm /tmp/tracker-backup.db

git add data/tracker.db
git commit -m "backup: auto-commit tracker.db — $DATE" 2>/dev/null || {
    echo "[backup] $(date '+%H:%M:%S') — nothing to commit"
    exit 0
}
git push origin master
echo "[backup] $(date '+%H:%M:%S') — done, pushed to remote"
