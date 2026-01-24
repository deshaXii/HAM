#!/usr/bin/env bash
set -euo pipefail

# Simple MySQL backup (schema + data)
# Usage:
#   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD= DB_NAME=fleet_planner ./scripts/backup-db.sh
#
# Output: ./backups/<db>_YYYYmmdd_HHMMSS.sql.gz

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-fleet_planner}"

OUT_DIR="./backups"
mkdir -p "$OUT_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/${DB_NAME}_${TS}.sql.gz"

# NOTE: on some systems you may need to install mysqldump.
if [[ -n "$DB_PASSWORD" ]]; then
  mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASSWORD" --single-transaction --routines --triggers "$DB_NAME" | gzip > "$OUT_FILE"
else
  mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --single-transaction --routines --triggers "$DB_NAME" | gzip > "$OUT_FILE"
fi

echo "Backup written to: $OUT_FILE"
