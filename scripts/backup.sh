#!/usr/bin/env bash
#
# cdn-split backup: tar the ./data directory (SQLite DB + encrypted tokens),
# keep the last N days, and optionally copy the archive off-server.
#
# Usage:
#   scripts/backup.sh                          # defaults, uses ./backups
#   BACKUP_DIR=/mnt/nas/cdn-split scripts/backup.sh
#   REMOTE_TARGET=user@nas:/backups/cdn-split scripts/backup.sh
#
# Cron (daily at 04:15):
#   15 4 * * * /opt/cdn-split/scripts/backup.sh >> /var/log/cdn-split-backup.log 2>&1
#
# NOTE: APP_SECRET_KEY must be stored separately (e.g. in a password manager).
# Without it the backed-up encrypted tokens cannot be decrypted.

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# rsync target for the off-server copy, e.g. user@nas:/volume1/backups/cdn-split
REMOTE_TARGET="${REMOTE_TARGET:-}"

ARCHIVE="$BACKUP_DIR/backup-$(date +%F).tgz"

cd "$APP_DIR"

if [ ! -d "data" ]; then
    echo "backup: data directory not found in $APP_DIR" >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"

# Briefly stop the stack for a consistent SQLite snapshot.
was_running=0
if [ -n "$(docker compose ps --status running --quiet 2>/dev/null)" ]; then
    was_running=1
    docker compose stop
fi

restore() {
    if [ "$was_running" = 1 ]; then
        docker compose up -d
    fi
}
trap restore EXIT

tar czf "$ARCHIVE" data
echo "backup: created $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# Retention: delete archives older than KEEP_DAYS.
find "$BACKUP_DIR" -name 'backup-*.tgz' -type f -mtime +"$KEEP_DAYS" -print -delete

# Off-server copy (optional).
if [ -n "$REMOTE_TARGET" ]; then
    if command -v rsync >/dev/null 2>&1 && rsync -a "$ARCHIVE" "$REMOTE_TARGET/"; then
        echo "backup: copied to $REMOTE_TARGET"
    else
        echo "backup: WARNING — off-server copy to $REMOTE_TARGET failed" >&2
    fi
elif ! command -v rsync >/dev/null 2>&1; then
    : # rsync not installed, nothing to do
else
    echo "backup: WARNING — REMOTE_TARGET is not set; no off-server copy was made" >&2
fi

if [ -z "${APP_SECRET_KEY:-}" ]; then
    echo "backup: reminder — keep APP_SECRET_KEY in a separate safe place, or tokens in this backup cannot be decrypted." >&2
fi
