require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const ordersRoutes = require("./routes/orders.routes");

const app = express();
const PORT = process.env.PORT || 4003;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

app.get("/health", (req, res) => res.json({ status: "ok", service: "orders-service" }));

app.use("/orders", ordersRoutes);

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

app.listen(PORT, () => {
  console.log(`[orders-service] escuchando en el puerto ${PORT}`);
});
