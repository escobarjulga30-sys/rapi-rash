#!/usr/bin/env bash
# ============================================================
# Rapi Rash - Paso 4 (opcional): credenciales para GitHub Actions
# ============================================================
# Genera un "service principal" que GitHub Actions usará para autenticarse
# en Azure y poder redesplegar automáticamente en cada push (CI/CD).
#
# Uso:
#   ./azure/03-create-github-credentials.sh
# ============================================================

set -euo pipefail

if [ ! -f azure/.env.azure ]; then
  echo "ERROR: no se encontró azure/.env.azure. Ejecuta primero ./azure/00-setup-infra.sh"
  exit 1
fi
source azure/.env.azure

SUBSCRIPTION_ID=$(az account show --query id -o tsv)

echo "==> Creando service principal con permisos sobre $RESOURCE_GROUP"
CREDS_JSON=$(az ad sp create-for-rbac \
  --name "sp-rapirash-github" \
  --role contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP" \
  --sdk-auth)

echo ""
echo "============================================================"
echo " Copia y pega ESTE JSON completo en GitHub:"
echo " Repositorio -> Settings -> Secrets and variables -> Actions"
echo " -> New repository secret -> Nombre: AZURE_CREDENTIALS"
echo "============================================================"
echo "$CREDS_JSON"
echo "============================================================"
echo ""
echo " Crea también estos dos secretos adicionales en GitHub:"
echo "   AZURE_RESOURCE_GROUP = $RESOURCE_GROUP"
echo "   AZURE_ACR_NAME       = $ACR_NAME"
echo "============================================================"
