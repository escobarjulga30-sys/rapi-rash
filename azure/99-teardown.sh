#!/usr/bin/env bash
# ============================================================
# Rapi Rash - Eliminar TODOS los recursos creados en Azure
# ============================================================
# Úsalo cuando termines de probar/exponer el proyecto para no seguir
# consumiendo el crédito de Azure for Students. Esto borra TODO
# (base de datos incluida) de forma irreversible.
#
# Uso:
#   ./azure/99-teardown.sh
# ============================================================

set -euo pipefail

if [ ! -f azure/.env.azure ]; then
  echo "ERROR: no se encontró azure/.env.azure."
  exit 1
fi
source azure/.env.azure

read -p "Esto eliminará TODO el grupo de recursos '$RESOURCE_GROUP'. Escribe 'eliminar' para confirmar: " CONFIRM
if [ "$CONFIRM" != "eliminar" ]; then
  echo "Cancelado."
  exit 0
fi

echo "==> Eliminando grupo de recursos $RESOURCE_GROUP (puede tardar varios minutos)..."
az group delete --name "$RESOURCE_GROUP" --yes --no-wait

echo "==> Solicitud de eliminación enviada. Puedes verificar el progreso con:"
echo "    az group show --name $RESOURCE_GROUP"
