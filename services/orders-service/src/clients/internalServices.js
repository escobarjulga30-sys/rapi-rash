const axios = require("axios");

const COURIERS_SERVICE_URL = process.env.COURIERS_SERVICE_URL || "http://couriers-service:4002";
const TRACKING_SERVICE_URL = process.env.TRACKING_SERVICE_URL || "http://tracking-service:4004";

const TIMEOUT_MS = 5000;

/**
 * Busca el siguiente repartidor disponible en couriers-service.
 * Devuelve null si no hay ninguno (en vez de lanzar), para que el pedido
 * pueda quedar en estado "pending" a la espera de asignación manual.
 */
async function findAvailableCourier() {
  try {
    const { data } = await axios.get(`${COURIERS_SERVICE_URL}/couriers/available/next`, {
      timeout: TIMEOUT_MS,
    });
    return data; // { id, user_id }
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw new Error(`No se pudo consultar couriers-service: ${err.message}`);
  }
}

/**
 * Marca a un repartidor como "busy" u otro estado en couriers-service.
 */
async function setCourierStatus(courierId, status, authHeader) {
  await axios.patch(
    `${COURIERS_SERVICE_URL}/couriers/${courierId}/status`,
    { status },
    { timeout: TIMEOUT_MS, headers: { Authorization: authHeader } }
  );
}

/**
 * Registra un evento de seguimiento en tracking-service.
 * No debe tumbar la operación principal si falla: se registra el error y se continúa,
 * ya que perder un evento de tracking es preferible a fallar la creación/actualización del pedido.
 */
async function logTrackingEvent({ orderId, status, lat, lng, note }, authHeader) {
  try {
    await axios.post(
      `${TRACKING_SERVICE_URL}/tracking`,
      { orderId, status, lat, lng, note },
      { timeout: TIMEOUT_MS, headers: { Authorization: authHeader } }
    );
  } catch (err) {
    console.error("[orders-service] No se pudo registrar el evento de tracking:", err.message);
  }
}

module.exports = { findAvailableCourier, setCourierStatus, logTrackingEvent };
