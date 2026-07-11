#!/usr/bin/env bash
# ============================================================
# Rapi Rash - Paso 3: Construir imágenes y desplegar los 5 servicios
# ============================================================
# Este script usa "az acr build", que construye las imágenes Docker
# directamente en la nube (no necesitas Docker instalado localmente).
#
# Uso:
#   ./azure/02-build-and-deploy.sh
# ============================================================

set -euo pipefail

if [ ! -f azure/.env.azure ]; then
  echo "ERROR: no se encontró azure/.env.azure. Ejecuta primero ./azure/00-setup-infra.sh"
  exit 1
fi
source azure/.env.azure

TAG="v1"
DATABASE_URL="postgresql://${DB_ADMIN_USER}:${DB_ADMIN_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

echo "==> Construyendo imágenes en Azure Container Registry (esto toma varios minutos)"
for svc in auth-service couriers-service orders-service tracking-service; do
  echo "    - Construyendo $svc..."
  az acr build --registry "$ACR_NAME" --image "rapirash/$svc:$TAG" "services/$svc" --output none
done
echo "    - Construyendo gateway..."
az acr build --registry "$ACR_NAME" --image "rapirash/gateway:$TAG" "gateway" --output none

common_env=(
  "DATABASE_URL=secretref:database-url"
  "DB_SSL=true"
  "JWT_SECRET=secretref:jwt-secret"
)

echo ""
echo "==> Desplegando auth-service (interno)"
az containerapp create \
  --name auth-service \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "$ACR_LOGIN_SERVER/rapirash/auth-service:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 4001 \
  --ingress internal \
  --min-replicas 1 --max-replicas 3 \
  --cpu 0.25 --memory 0.5Gi \
  --secrets "database-url=$DATABASE_URL" "jwt-secret=$JWT_SECRET" \
  --env-vars "${common_env[@]}" "PORT=4001" "JWT_EXPIRES_IN=8h" \
  --output none

echo "==> Desplegando couriers-service (interno)"
az containerapp create \
  --name couriers-service \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "$ACR_LOGIN_SERVER/rapirash/couriers-service:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 4002 \
  --ingress internal \
  --min-replicas 1 --max-replicas 5 \
  --scale-rule-name http-scale \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50 \
  --cpu 0.25 --memory 0.5Gi \
  --secrets "database-url=$DATABASE_URL" "jwt-secret=$JWT_SECRET" \
  --env-vars "${common_env[@]}" "PORT=4002" \
  --output none

echo "==> Desplegando tracking-service (interno)"
az containerapp create \
  --name tracking-service \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "$ACR_LOGIN_SERVER/rapirash/tracking-service:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 4004 \
  --ingress internal \
  --min-replicas 1 --max-replicas 5 \
  --scale-rule-name http-scale \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50 \
  --cpu 0.25 --memory 0.5Gi \
  --secrets "database-url=$DATABASE_URL" "jwt-secret=$JWT_SECRET" \
  --env-vars "${common_env[@]}" "PORT=4004" \
  --output none

COURIERS_FQDN=$(az containerapp show --name couriers-service --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)
TRACKING_FQDN=$(az containerapp show --name tracking-service --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)

echo "==> Desplegando orders-service (interno, depende de couriers y tracking)"
az containerapp create \
  --name orders-service \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "$ACR_LOGIN_SERVER/rapirash/orders-service:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 4003 \
  --ingress internal \
  --min-replicas 1 --max-replicas 5 \
  --scale-rule-name http-scale \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50 \
  --cpu 0.25 --memory 0.5Gi \
  --secrets "database-url=$DATABASE_URL" "jwt-secret=$JWT_SECRET" \
  --env-vars "${common_env[@]}" "PORT=4003" \
    "COURIERS_SERVICE_URL=https://$COURIERS_FQDN" \
    "TRACKING_SERVICE_URL=https://$TRACKING_FQDN" \
  --output none

AUTH_FQDN=$(az containerapp show --name auth-service --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)
ORDERS_FQDN=$(az containerapp show --name orders-service --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)

echo "==> Desplegando gateway (público)"
az containerapp create \
  --name gateway \
  --resource-group "$RESOURCE_GROUP" \
  --environment "$CONTAINERAPPS_ENV" \
  --image "$ACR_LOGIN_SERVER/rapirash/gateway:$TAG" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 8080 \
  --ingress external \
  --min-replicas 1 --max-replicas 5 \
  --scale-rule-name http-scale \
  --scale-rule-type http \
  --scale-rule-http-concurrency 50 \
  --cpu 0.25 --memory 0.5Gi \
  --env-vars "PORT=8080" \
    "AUTH_SERVICE_URL=https://$AUTH_FQDN" \
    "ORDERS_SERVICE_URL=https://$ORDERS_FQDN" \
    "COURIERS_SERVICE_URL=https://$COURIERS_FQDN" \
    "TRACKING_SERVICE_URL=https://$TRACKING_FQDN" \
  --output none

GATEWAY_FQDN=$(az containerapp show --name gateway --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)

echo ""
echo "============================================================"
echo " ¡Despliegue completo!"
echo ""
echo " URL pública de tu API:  https://$GATEWAY_FQDN"
echo ""
echo " Pruébala con:"
echo "   curl https://$GATEWAY_FQDN/health"
echo ""
echo " Guarda esta URL, la necesitarás para configurar Postman"
echo " y para los secretos del pipeline de CI/CD (ver README.md)."
echo "============================================================"
