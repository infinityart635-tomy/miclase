const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const databaseUrl = process.env.DATABASE_URL || "";
const hasDatabase = Boolean(databaseUrl);

let pool = null;

if (hasDatabase) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
}

async function initializeDatabase() {
  if (!pool) {
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      id SERIAL PRIMARY KEY,
      app_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `
      INSERT INTO app_meta (app_name)
      SELECT $1
      WHERE NOT EXISTS (SELECT 1 FROM app_meta)
    `,
    ["MiClase"]
  );

  return true;
}

async function getDatabaseHealth() {
  if (!pool) {
    return {
      enabled: false,
      ok: false,
      reason: "DATABASE_URL is not configured",
    };
  }

  try {
    const result = await pool.query("SELECT NOW() AS now");

    return {
      enabled: true,
      ok: true,
      serverTime: result.rows[0].now,
    };
  } catch (error) {
    return {
      enabled: true,
      ok: false,
      reason: error.message,
    };
  }
}

app.disable("x-powered-by");
app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", async (_req, res) => {
  const database = await getDatabaseHealth();

  res.status(database.ok || !database.enabled ? 200 : 503).json({
    ok: true,
    service: "MiClase",
    timestamp: new Date().toISOString(),
    database,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: "MiClase",
    environment: process.env.NODE_ENV || "development",
    database: {
      provider: "postgres",
      configured: hasDatabase,
    },
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

initializeDatabase()
  .then((initialized) => {
    if (initialized) {
      console.log("PostgreSQL initialized");
    } else {
      console.log("PostgreSQL not configured yet");
    }

    app.listen(port, () => {
      console.log(`MiClase running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize PostgreSQL:", error.message);
    process.exit(1);
  });
