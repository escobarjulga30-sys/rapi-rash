const { Pool } = require("pg");

// DATABASE_URL ej: postgres://user:password@host:5432/rapirash
// En Azure Database for PostgreSQL Flexible Server, agrega ?sslmode=require
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("[auth-service] Error inesperado en el pool de Postgres:", err);
});

module.exports = pool;
