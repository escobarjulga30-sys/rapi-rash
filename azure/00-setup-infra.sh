#!/usr/bin/env bash
# ============================================================
# Rapi Rash - Paso 1: Crear la infraestructura base en Azure
# ============================================================
# Requisitos previos:
#   1. Tener la Azure CLI instalada: https://learn.microsoft.com/cli/azure/install-azure-cli
#   2. Haber iniciado sesión:  az login
#   3. Tener seleccionada la suscripción de Azure for Students:
#        az account set --subscription "<nombre-o-id-de-tu-suscripcion>"
#
# Uso:
#   chmod +x azure/*.sh
#   ./azure/00-setup-infra.sh
#
# Este script es idempotente: si vuelves a ejecutarlo, Azure simplemente
# actualizará los recursos existentes en vez de fallar.
# ============================================================

set -euo pipefail

# ---------- Variables (ajusta si lo necesitas) ----------
LOCATION="eastus"                      # Azure for Students no siempre tiene todas las regiones; eastus es segura
RESOURCE_GROUP="rg-rapirash"
ACR_NAME="acrrapirash$RANDOM"          # el nombre del ACR debe ser único a nivel global
LOG_ANALYTICS_NAME="log-rapirash"
CONTAINERAPPS_ENV="env-rapirash"
DB_SERVER_NAME="psql-rapirash-$RANDOM" # también debe ser único globalmente
DB_ADMIN_USER="rapirashadmin"
DB_ADMIN_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)Aa1!"
DB_NAME="rapirash"
JWT_SECRET="$(openssl rand -base64 48)"

# Guarda estos valores para los siguientes scripts
cat > azure/.env.azure <<EOF
LOCATION=$LOCATION
RESOURCE_GROUP=$RESOURCE_GROUP
ACR_NAME=$ACR_NAME
LOG_ANALYTICS_NAME=$LOG_ANALYTICS_NAME
CONTAINERAPPS_ENV=$CONTAINERAPPS_ENV
DB_SERVER_NAME=$DB_SERVER_NAME
DB_ADMIN_USER=$DB_ADMIN_USER
DB_ADMIN_PASSWORD=$DB_ADMIN_PASSWORD
DB_NAME=$DB_NAME
JWT_SECRET=$JWT_SECRET
EOF

echo "==> Variables guardadas en azure/.env.azure (NO subas este archivo a GitHub)"
echo "==> Creando grupo de recursos: $RESOURCE_GROUP"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

echo "==> Creando Azure Container Registry: $ACR_NAME"
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  --output none

echo "==> Creando espacio de trabajo de Log Analytics: $LOG_ANALYTICS_NAME"
az monitor log-analytics workspace create \
  --resource-group "$RESOURCE_GROUP" \
  --workspace-name "$LOG_ANALYTICS_NAME" \
  --output none

LOG_ANALYTICS_CLIENT_ID=$(az monitor log-analytics workspace show \
  --resource-group "$RESOURCE_GROUP" --workspace-name "$LOG_ANALYTICS_NAME" \
  --query customerId -o tsv)
LOG_ANALYTICS_CLIENT_SECRET=$(az monitor log-analytics workspace get-shared-keys \
  --resource-group "$RESOURCE_GROUP" --workspace-name "$LOG_ANALYTICS_NAME" \
  --query primarySharedKey -o tsv)

echo "==> Instalando la extensión containerapp (si falta)"
az extension add --name containerapp --upgrade --only-show-errors

echo "==> Registrando el proveedor Microsoft.App (si falta)"
az provider register --namespace Microsoft.App --wait

echo "==> Creando el entorno de Container Apps: $CONTAINERAPPS_ENV"
az containerapp env create \
  --name "$CONTAINERAPPS_ENV" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --logs-workspace-id "$LOG_ANALYTICS_CLIENT_ID" \
  --logs-workspace-key "$LOG_ANALYTICS_CLIENT_SECRET" \
  --output none

echo "==> Creando Azure Database for PostgreSQL Flexible Server: $DB_SERVER_NAME"
echo "    (SKU Standard_B1ms, el más económico - cubierto por el crédito de Azure for Students)"
az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_SERVER_NAME" \
  --location "$LOCATION" \
  --admin-user "$DB_ADMIN_USER" \
  --admin-password "$DB_ADMIN_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0-255.255.255.255 \
  --database-name "$DB_NAME" \
  --yes \
  --output none

echo "==> Permitiendo que los servicios de Azure (Container Apps) accedan a la base de datos"
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_SERVER_NAME" \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output none

echo ""
echo "============================================================"
echo " Infraestructura base creada correctamente."
echo " Servidor de base de datos: $DB_SERVER_NAME.postgres.database.azure.com"
echo " Registro de contenedores: $ACR_NAME.azurecr.io"
echo ""
echo " Siguiente paso: ejecutar ./azure/01-init-database.sh"
echo "============================================================"
