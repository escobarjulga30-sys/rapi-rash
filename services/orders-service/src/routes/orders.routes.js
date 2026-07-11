const express = require("express");
const pool = require("../db/pool");
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/verifyToken");
const { findAvailableCourier, setCourierStatus, logTrackingEvent } = require("../clients/internalServices");

const router = express.Router();

// POST /orders  { items: [...], address: "..." }
// El cliente autenticado crea un pedido. El servicio intenta asignar
// automáticamente un repartidor disponible (patrón de "hora punta" descrito
// en el informe: si no hay repartidores libres, el pedido queda "pending").
router.post("/", verifyToken, requireRole("client", "admin"), async (req, res) => {
  const authHeader = req.headers.authorization;
  try {
    const { items, address } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0 || !address) {
      return res.status(400).json({ error: "items (array) y address son obligatorios" });
    }

    const clientId = req.user.sub;
    const courier = await findAvailableCourier();

    const insertResult = await pool.query(
      `INSERT INTO orders (client_id, courier_id, items, address, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [clientId, courier ? courier.id : null, JSON.stringify(items), address, courier ? "assigned" : "pending"]
    );
    const order = insertResult.rows[0];

    if (courier) {
      await setCourierStatus(courier.id, "busy", authHeader);
    }

    await logTrackingEvent(
      { orderId: order.id, status: order.status, note: courier ? "Repartidor asignado automáticamente" : "En espera de repartidor" },
      authHeader
    );

    return res.status(201).json(order);
  } catch (err) {
    console.error("[orders-service] Error en POST /orders:", err.message);
    return res.status(500).json({ error: "Error interno al crear el pedido" });
  }
});

// GET /orders?status=&clientId=&courierId=
router.get("/", verifyToken, async (req, res) => {
  try {
    const { status, clientId, courierId } = req.query;
    const conditions = [];
    const params = [];

    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    if (clientId) { params.push(clientId); conditions.push(`client_id = $${params.length}`); }
    if (courierId) { params.push(courierId); conditions.push(`courier_id = $${params.length}`); }

    // Un cliente solo puede ver sus propios pedidos si no es admin
    if (req.user.role === "client") {
      params.push(req.user.sub);
      conditions.push(`client_id = $${params.length}`);
    }

    let query = "SELECT * FROM orders";
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error("[orders-service] Error en GET /orders:", err.message);
    return res.status(500).json({ error: "Error interno al listar pedidos" });
  }
});

// GET /orders/:id
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[orders-service] Error en GET /orders/:id:", err.message);
    return res.status(500).json({ error: "Error interno" });
  }
});

// PATCH /orders/:id/status  { status: 'picked_up' | 'on_the_way' | 'delivered' | 'cancelled' }
router.patch("/:id/status", verifyToken, requireRole("courier", "admin"), async (req, res) => {
  const authHeader = req.headers.authorization;
  try {
    const { status } = req.body;
    const validStatuses = ["assigned", "picked_up", "on_the_way", "delivered", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status debe ser uno de: ${validStatuses.join(", ")}` });
    }

    const result = await pool.query(
      `UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }
    const order = result.rows[0];

    await logTrackingEvent({ orderId: order.id, status }, authHeader);

    // Si el pedido se entregó o se canceló, el repartidor vuelve a estar disponible
    if ((status === "delivered" || status === "cancelled") && order.courier_id) {
      await setCourierStatus(order.courier_id, "available", authHeader);
    }

    return res.json(order);
  } catch (err) {
    console.error("[orders-service] Error en PATCH /orders/:id/status:", err.message);
    return res.status(500).json({ error: "Error interno al actualizar el pedido" });
  }
});

module.exports = router;
