const express = require("express");
const path = require("path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");

app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "MiClase",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: "MiClase",
    environment: process.env.NODE_ENV || "development",
  });
});

app.get("/{*any}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  return res.sendFile(path.join(publicDir, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path,
  });
});

app.listen(port, () => {
  console.log(`MiClase running on port ${port}`);
});
