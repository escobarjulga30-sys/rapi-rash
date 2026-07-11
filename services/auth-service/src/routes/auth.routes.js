const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/pool");
const verifyToken = require("../middleware/verifyToken");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h";

// POST /auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "name, email, password y role son obligatorios" });
    }
    if (!["client", "courier", "admin"].includes(role)) {
      return res.status(400).json({ error: "role debe ser 'client', 'courier' o 'admin'" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Ya existe un usuario con ese correo" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );

    const user = result.rows[0];

    // Si el usuario es repartidor, se crea automáticamente su perfil en couriers
    if (role === "courier") {
      await pool.query(
        `INSERT INTO couriers (user_id, status) VALUES ($1, 'offline')`,
        [user.id]
      );
    }

    const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.status(201).json({ user, token });
  } catch (err) {
    console.error("[auth-service] Error en /register:", err);
    return res.status(500).json({ error: "Error interno al registrar el usuario" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email y password son obligatorios" });
    }

    const result = await pool.query(
      "SELECT id, name, email, password_hash, role FROM users WHERE email = $1",
      [email]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = jwt.sign({ sub: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    delete user.password_hash;
    return res.json({ user, token });
  } catch (err) {
    console.error("[auth-service] Error en /login:", err);
    return res.status(500).json({ error: "Error interno al iniciar sesión" });
  }
});

// GET /auth/me  (requiere token)
router.get("/me", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
      [req.user.sub]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error("[auth-service] Error en /me:", err);
    return res.status(500).json({ error: "Error interno" });
  }
});

// GET /auth/verify (uso interno: otros servicios pueden validar un token aquí si lo prefieren
// en vez de verificarlo localmente con el mismo JWT_SECRET)
router.get("/verify", verifyToken, (req, res) => {
  return res.json({ valid: true, user: req.user });
});

module.exports = router;
