# Rapi Rash — Sistema distribuido de gestión de pedidos y repartidores

Implementación funcional del sistema descrito en el informe: 4 microservicios en Node.js/Express,
un API Gateway, base de datos PostgreSQL, contenedores Docker, y scripts para desplegar todo en
**Azure Container Apps** con tu cuenta de Azure for Students.

## Arquitectura

```
                         ┌──────────────┐
        Internet ──────▶ │   Gateway    │  (único punto público, puerto 8080)
                         └──────┬───────┘
                                │  /api/auth  /api/orders  /api/couriers  /api/tracking
        ┌───────────────┬──────┴───────┬────────────────┐
        ▼               ▼              ▼                ▼
 ┌─────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────────┐
 │auth-service │ │orders-service│ │couriers-service│ │tracking-service  │
 │  :4001      │ │  :4003       │ │   :4002        │ │    :4004         │
 └──────┬──────┘ └───┬───────┬──┘ └────────┬───────┘ └────────┬─────────┘
        │            │       └──────HTTP───┘                  │
        │            └───────────────────HTTP─────────────────┘
        ▼                                                       
 ┌─────────────────────────────────────────────────────────────┐
 │                      PostgreSQL                              │
 └─────────────────────────────────────────────────────────────┘
```

- **auth-service**: registro, login, JWT.
- **couriers-service**: perfil y estado de repartidores.
- **orders-service**: crea pedidos, asigna repartidor disponible automáticamente, orquesta llamadas a los otros dos servicios.
- **tracking-service**: historial de estados/ubicación de cada pedido.
- **gateway**: único punto de entrada público, enruta `/api/*` hacia cada microservicio.

## Estructura del proyecto

```
rapi-rash/
├── services/
│   ├── auth-service/
│   ├── couriers-service/
│   ├── orders-service/
│   └── tracking-service/
├── gateway/
├── db/init.sql              # esquema de la base de datos
├── docker-compose.yml       # para correr todo en tu máquina
├── .env.example
├── azure/                   # scripts de despliegue real a Azure
│   ├── 00-setup-infra.sh
│   ├── 01-init-database.sh
│   ├── 02-build-and-deploy.sh
│   ├── 03-create-github-credentials.sh
│   └── 99-teardown.sh
├── .github/workflows/deploy.yml  # CI/CD
└── postman_collection.json
```

---

## 1. Probar todo localmente primero (recomendado)

Necesitas [Docker](https://www.docker.com/products/docker-desktop/) instalado.

```bash
cd rapi-rash
cp .env.example .env
# abre .env y cambia POSTGRES_PASSWORD y JWT_SECRET por valores propios

docker compose up --build
```

Espera a ver los 5 servicios levantados. Prueba que todo responde:

```bash
curl http://localhost:8080/health
```

### Probar el flujo completo

Importa `postman_collection.json` en Postman y ejecuta las peticiones en orden (1 a 9), o usa `curl`:

```bash
# 1. Registrar un cliente
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana Cliente","email":"ana@rapirash.pe","password":"Password123!","role":"client"}'

# 2. Registrar un repartidor (guarda el "token" y el id de usuario de la respuesta)
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Luis Repartidor","email":"luis@rapirash.pe","password":"Password123!","role":"courier"}'

# 3. El repartidor se marca "available" (usa su token y el id de couriers, no el de users)
curl -X GET http://localhost:8080/api/couriers -H "Authorization: Bearer <TOKEN_REPARTIDOR>"
curl -X PATCH http://localhost:8080/api/couriers/<COURIER_ID>/status \
  -H "Authorization: Bearer <TOKEN_REPARTIDOR>" -H "Content-Type: application/json" \
  -d '{"status":"available"}'

# 4. El cliente crea un pedido (se asigna repartidor automáticamente si hay uno disponible)
curl -X POST http://localhost:8080/api/orders \
  -H "Authorization: Bearer <TOKEN_CLIENTE>" -H "Content-Type: application/json" \
  -d '{"items":[{"name":"Hamburguesa","qty":2}],"address":"Av. Los Próceres 123, Lima"}'

# 5. Ver el historial de seguimiento del pedido
curl http://localhost:8080/api/tracking/<ORDER_ID> -H "Authorization: Bearer <TOKEN_CLIENTE>"
```

Para apagar todo: `docker compose down` (agrega `-v` si además quieres borrar la base de datos).

---

## 2. Desplegar de verdad en Azure (Azure for Students)

### Requisitos

1. Cuenta activada en [Azure for Students](https://azure.microsoft.com/free/students/) (crédito gratuito, no requiere tarjeta).
2. [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) instalada.
3. Cliente `psql` instalado (para inicializar la base de datos).
4. Iniciar sesión:
   ```bash
   az login
   az account set --subscription "<tu-suscripción-de-Azure-for-Students>"
   ```

### Paso a paso

```bash
cd rapi-rash
chmod +x azure/*.sh

# 1. Crea grupo de recursos, ACR, entorno de Container Apps y base de datos PostgreSQL
./azure/00-setup-infra.sh

# 2. Crea las tablas en la base de datos recién creada
./azure/01-init-database.sh

# 3. Construye las 5 imágenes en la nube (az acr build) y despliega los 5 Container Apps
./azure/02-build-and-deploy.sh
```

Al finalizar el paso 3 verás algo como:

```
URL pública de tu API:  https://gateway.xxxxxxx.eastus.azurecontainerapps.io
```

Usa esa URL en Postman (cambia la variable `base_url` a `https://<esa-url>/api`) y repite las
mismas pruebas del flujo local — ahora corriendo 100% en Azure, con autoescalado real activado
en `orders-service`, `couriers-service`, `tracking-service` y `gateway` (1 a 5 réplicas según
la carga, tal como se describe en la sección 5.3 del informe).

### Activar el despliegue automático (CI/CD)

```bash
./azure/03-create-github-credentials.sh
```

Copia el JSON que imprime y créalo como secreto `AZURE_CREDENTIALS` en tu repositorio de GitHub
(`Settings → Secrets and variables → Actions → New repository secret`). Crea también
`AZURE_RESOURCE_GROUP` y `AZURE_ACR_NAME` con los valores que el mismo script te muestra.

Desde ese momento, cada `git push` a la rama `main` reconstruye y redespliega automáticamente
solo los servicios que cambiaron (ver `.github/workflows/deploy.yml`).

### Apagar todo (importante para no gastar tu crédito)

Cuando termines de usar/exponer el proyecto (por ejemplo, después de la sustentación):

```bash
./azure/99-teardown.sh
```

Esto borra el grupo de recursos completo. Puedes volver a desplegar todo desde cero repitiendo
los pasos 1 a 3 cuando lo necesites.

---

## 3. Variables de entorno relevantes

| Variable | Servicio(s) | Descripción |
|---|---|---|
| `DATABASE_URL` | todos menos gateway | cadena de conexión a PostgreSQL |
| `DB_SSL` | todos menos gateway | `"true"` en Azure, `"false"` en local |
| `JWT_SECRET` | todos menos gateway | secreto compartido para firmar/verificar JWT |
| `COURIERS_SERVICE_URL` | orders-service, gateway | URL interna de couriers-service |
| `TRACKING_SERVICE_URL` | orders-service, gateway | URL interna de tracking-service |
| `AUTH_SERVICE_URL` / `ORDERS_SERVICE_URL` | gateway | URLs internas de auth y orders |

## 4. Notas de seguridad para producción

Este proyecto tiene fines académicos. Antes de usarlo con datos reales:

- Restringe el firewall de PostgreSQL a las IP salientes reales de Container Apps en vez de `0.0.0.0-255.255.255.255`.
- Mueve `JWT_SECRET` y la contraseña de la base de datos a **Azure Key Vault** en vez de secretos de Container Apps.
- Agrega pruebas automatizadas y un paso de *pentesting* antes de ir a producción (ver sección 6.1 del informe).
- Activa autenticación multifactor en la cuenta de Azure que administra estos recursos.

## 5. Relación con el informe

Este código implementa exactamente lo descrito en las secciones III (arquitectura de
microservicios), IV.1 (contenerización, CI/CD, autoescalado) y V (pruebas y métricas) del
informe de "Rapi Rash". Los nombres de servicios, puertos y flujo de asignación automática de
repartidores corresponden 1 a 1 con los diagramas y tablas ya incluidos en el documento Word.
