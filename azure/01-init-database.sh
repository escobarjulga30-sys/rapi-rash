#!/usr/bin/env bash
# ============================================================
# Rapi Rash - Paso 2: Inicializar el esquema en la base de datos de Azure
# ============================================================
# Requiere el cliente "psql" instalado localmente:
#   - Windows: instalar PostgreSQL (incluye psql) o usar WSL
#   - macOS:   brew install libpq && brew link --force libpq
#   - Linux:   sudo apt install postgresql-client
#
# Uso:
#   ./azure/01-init-database.sh
# ============================================================

set -euo pipefail

if [ ! -f azure/.env.azure ]; then
  echo "ERROR: no se encontró azure/.env.azure. Ejecuta primero ./azure/00-setup-infra.sh"
  exit 1
fi
source azure/.env.azure

CONNECTION_STRING="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

echo "==> Aplicando db/init.sql sobre $DB_SERVER_NAME.postgres.database.azure.com"
psql "$CONNECTION_STRING" -f db/init.sql

echo ""
echo "============================================================"
echo " Esquema de base de datos creado correctamente."
echo " Siguiente paso: ejecutar ./azure/02-build-and-deploy.sh"
echo "============================================================"
