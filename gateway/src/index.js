require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();
const PORT = process.env.PORT || 8080;

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || "http://auth-service:4001";
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || "http://orders-service:4003";
const COURIERS_SERVICE_URL = process.env.COURIERS_SERVICE_URL || "http://couriers-service:4002";
const TRACKING_SERVICE_URL = process.env.TRACKING_SERVICE_URL || "http://tracking-service:4004";

app.use(helmet());
app.use(cors());
app.use(morgan("tiny"));

// Límite básico para mitigar abuso / picos de tráfico anómalos
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (req, res) => res.json({ status: "ok", service: "gateway" }));

// NOTA: no se usa express.json() aquí a nivel global porque http-proxy-middleware
// necesita el stream del request intacto para reenviarlo tal cual al microservicio.

app.use(
  "/api/auth",
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/auth": "/auth" },
  })
);

app.use(
  "/api/orders",
  createProxyMiddleware({
    target: ORDERS_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/orders": "/orders" },
  })
);

app.use(
  "/api/couriers",
  createProxyMiddleware({
    target: COURIERS_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/couriers": "/couriers" },
  })
);

app.use(
  "/api/tracking",
  createProxyMiddleware({
    target: TRACKING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: { "^/api/tracking": "/tracking" },
  })
);

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada en el gateway" }));

app.listen(PORT, () => {
  console.log(`[gateway] escuchando en el puerto ${PORT}`);
  console.log(`[gateway] -> auth: ${AUTH_SERVICE_URL} | orders: ${ORDERS_SERVICE_URL} | couriers: ${COURIERS_SERVICE_URL} | tracking: ${TRACKING_SERVICE_URL}`);
});
