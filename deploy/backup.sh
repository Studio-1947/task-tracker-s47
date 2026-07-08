#!/usr/bin/env bash
# Daily Postgres backup with 14-day rotation (PRD §11.8).
# Run from the repo root, or via cron with an absolute path.
set -euo pipefail

cd "$(dirname "$0")/.."

# Load env (POSTGRES_USER / POSTGRES_DB).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%F)"
mkdir -p "$BACKUP_DIR"

OUT="$BACKUP_DIR/${POSTGRES_DB:-task_tracker}-${STAMP}.sql.gz"

echo "[$(date -Is)] Dumping ${POSTGRES_DB} -> ${OUT}"
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "$OUT"

# Rotate: delete dumps older than RETENTION_DAYS.
find "$BACKUP_DIR" -name "*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Is)] Backup complete. Kept last ${RETENTION_DAYS} days."
