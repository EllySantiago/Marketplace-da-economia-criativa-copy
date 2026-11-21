#!/bin/sh
# Roda os scripts do backend (em ordem alfabética, como o Postgres faria) e depois a carga.
set -e
for arquivo in /base/*.sql /carga/carga.sql; do
  echo "iniciar.sh: $arquivo"
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q -f "$arquivo"
done
