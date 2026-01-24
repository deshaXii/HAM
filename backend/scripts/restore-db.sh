#!/usr/bin/env bash
set -euo pipefail

# Restore a backup created by backup-db.sh
# Usage:
#   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=fleet_planner ./scripts/restore-db.sh ./backups/file.sql.gz

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-fleet_planner}"

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "Missing backup file path"
  exit 1
fi

if [[ -n "$DB_PASSWORD" ]]; then
  gunzip -c "$FILE" | mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME"
else
  gunzip -c "$FILE" | mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" "$DB_NAME"
fi

echo "Restore complete from: $FILE"
