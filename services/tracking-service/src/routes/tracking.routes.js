const express = require("express");
const pool = require("../db/pool");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();

// POST /tracking  { orderId, status, lat?, lng?, note? }
// Llamado por orders-service cada vez que un pedido cambia de estado,
// o directamente por el repartidor para reportar su posición sobre un pedido activo.
router.post("/", verifyToken, async (req, res) => {
  try {
    const { orderId, status, lat, lng, note } = req.body;
    if (!orderId || !status) {
      return res.status(400).json({ error: "orderId y status son obligatorios" });
    }
    const result = await pool.query(
      `INSERT INTO tracking_events (order_id, status, lat, lng, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, status, lat ?? null, lng ?? null, note ?? null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[tracking-service] Error en POST /tracking:", err);
    return res.status(500).json({ error: "Error interno al registrar el evento" });
  }
});

// GET /tracking/:orderId -> historial completo de un pedido, ordenado cronológicamente
router.get("/:orderId", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tracking_events WHERE order_id = $1 ORDER BY created_at ASC`,
      [req.params.orderId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("[tracking-service] Error en GET /tracking/:orderId:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

// GET /tracking/:orderId/last -> último evento registrado (estado/ubicación actual)
router.get("/:orderId/last", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM tracking_events WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.orderId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Sin eventos de seguimiento para este pedido" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[tracking-service] Error en GET /tracking/:orderId/last:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;
