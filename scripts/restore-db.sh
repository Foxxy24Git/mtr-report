#!/usr/bin/env bash
# Restore dump PostgreSQL (biasanya backup dari production) ke database lokal.
#
# Pakai:
#   ./scripts/restore-db.sh backup-20260917.dump
#
# Kredensial diambil otomatis dari DATABASE_URL di .env — jangan hardcode di sini.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -lt 1 ]; then
  echo "Pakai: $0 <file.dump>"
  exit 1
fi

DUMP_FILE="$1"

if [ ! -f "$DUMP_FILE" ]; then
  echo "File tidak ditemukan: $DUMP_FILE"
  exit 1
fi

if [ ! -f .env ]; then
  echo ".env tidak ditemukan di root project"
  exit 1
fi

DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d '=' -f2- | tr -d '"')

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL tidak ditemukan di .env"
  exit 1
fi

# Parse postgresql://user:pass@host:port/dbname?schema=public
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|^postgresql://([^:]+):.*|\1|')
DB_PASS=$(echo "$DATABASE_URL" | sed -E 's|^postgresql://[^:]+:([^@]+)@.*|\1|')
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')

echo "=== Restore DB lokal ==="
echo "Host  : $DB_HOST:$DB_PORT"
echo "DB    : $DB_NAME"
echo "User  : $DB_USER"
echo "Dump  : $DUMP_FILE"
echo ""
echo "PERINGATAN: ini akan MENIMPA semua data yang ada di database lokal di atas."
read -r -p "Ketik 'ya' untuk lanjut: " CONFIRM

if [ "$CONFIRM" != "ya" ]; then
  echo "Dibatalkan."
  exit 1
fi

PGPASSWORD="$DB_PASS" pg_restore --clean --if-exists --no-owner --no-privileges \
  -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$DUMP_FILE"

echo ""
echo "=== Restore selesai. Sanity check ==="
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -c "SELECT count(*) AS tickets FROM tickets;" \
  -c "SELECT count(*) AS users FROM users;" \
  -c "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 1;"

echo ""
echo "Cek juga: migration_name di atas harus sama dengan folder migration terbaru di prisma/migrations/"
echo "Kalau beda (DB lebih lama dari repo), jalankan: ./node_modules/.bin/prisma migrate deploy"
