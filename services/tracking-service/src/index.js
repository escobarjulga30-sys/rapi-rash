require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const trackingRoutes = require("./routes/tracking.routes");

const app = express();
const PORT = process.env.PORT || 4004;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));

app.get("/health", (req, res) => res.json({ status: "ok", service: "tracking-service" }));

app.use("/tracking", trackingRoutes);

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

app.listen(PORT, () => {
  console.log(`[tracking-service] escuchando en el puerto ${PORT}`);
});
