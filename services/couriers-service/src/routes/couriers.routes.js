const express = require("express");
const pool = require("../db/pool");
const verifyToken = require("../middleware/verifyToken");
const { requireRole } = require("../middleware/verifyToken");

const router = express.Router();

// GET /couriers?status=available  -> lista repartidores, filtrable por estado
router.get("/", verifyToken, async (req, res) => {
  try {
    const { status } = req.query;
    let query = `SELECT c.id, c.user_id, u.name, c.status, c.current_lat, c.current_lng, c.updated_at
                 FROM couriers c JOIN users u ON u.id = c.user_id`;
    const params = [];
    if (status) {
      params.push(status);
      query += ` WHERE c.status = $1`;
    }
    query += " ORDER BY c.updated_at DESC";
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error("[couriers-service] Error en GET /couriers:", err);
    return res.status(500).json({ error: "Error interno al listar repartidores" });
  }
});

// GET /couriers/:id
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.user_id, u.name, c.status, c.current_lat, c.current_lng, c.updated_at
       FROM couriers c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Repartidor no encontrado" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[couriers-service] Error en GET /couriers/:id:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

// GET /couriers/available/next -> uso interno: primer repartidor disponible
// (usado por orders-service para asignación automática)
router.get("/available/next", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id FROM couriers WHERE status = 'available' ORDER BY updated_at ASC LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No hay repartidores disponibles" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[couriers-service] Error en GET /couriers/available/next:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

// PATCH /couriers/:id/status  { status: 'available' | 'busy' | 'offline' }
router.patch("/:id/status", verifyToken, requireRole("courier", "admin"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!["available", "busy", "offline"].includes(status)) {
      return res.status(400).json({ error: "status inválido" });
    }
    const result = await pool.query(
      `UPDATE couriers SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Repartidor no encontrado" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[couriers-service] Error en PATCH /couriers/:id/status:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

// PATCH /couriers/:id/location  { lat, lng }
router.patch("/:id/location", verifyToken, requireRole("courier", "admin"), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat y lng deben ser numéricos" });
    }
    const result = await pool.query(
      `UPDATE couriers SET current_lat = $1, current_lng = $2, updated_at = now() WHERE id = $3 RETURNING *`,
      [lat, lng, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Repartidor no encontrado" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[couriers-service] Error en PATCH /couriers/:id/location:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;
