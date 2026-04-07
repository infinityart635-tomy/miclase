const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const mime = require("mime-types");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const uploadsDir = path.join(__dirname, "uploads");
const dataFile = path.join(dataDir, "db.json");
const indexFile = path.join(publicDir, "index.html");
const swFile = path.join(publicDir, "sw.js");
const databaseUrl = String(process.env.DATABASE_URL || "").trim();
const hasDatabase = Boolean(databaseUrl);
const SESSION_SECRET =
  process.env.SESSION_SECRET || "miclase-dev-secret-change-me";
const AUTH_COOKIE_NAME = "miclase.auth";
const DELETE_VOTE_THRESHOLD = 3;
const CAREER_COLORS = [
  "#d56d4b",
  "#4c7aa8",
  "#5d9b7a",
  "#9f4c3c",
  "#7d62b5",
  "#c7923d",
];

let pool = null;
let appStateCache = { users: [], careers: [] };

function getAppVersion() {
  const watchedFiles = [
    __filename,
    indexFile,
    path.join(publicDir, "app.js"),
    path.join(publicDir, "styles.css"),
    swFile,
  ];
  const signature = watchedFiles
    .map((filePath) => {
      try {
        const stats = fs.statSync(filePath);
        return `${path.basename(filePath)}:${stats.size}:${Math.floor(stats.mtimeMs)}`;
      } catch (_) {
        return `${path.basename(filePath)}:missing`;
      }
    })
    .join("|");
  return crypto.createHash("sha1").update(signature).digest("hex").slice(0, 12);
}

function renderPublicTemplate(filePath) {
  const version = getAppVersion();
  const source = fs.readFileSync(filePath, "utf8");
  return source.replaceAll("__APP_VERSION__", version);
}

app.set("trust proxy", 1);

if (hasDatabase) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getCookieSettings() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function signAuthValue(userId) {
  const payload = String(userId || "").trim();
  const signature = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${signature}`;
}

function verifyAuthValue(rawValue) {
  const value = String(rawValue || "");
  const splitIndex = value.lastIndexOf(".");
  if (splitIndex <= 0) return "";
  const payload = value.slice(0, splitIndex);
  const signature = value.slice(splitIndex + 1);
  const expected = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(payload)
    .digest("hex");
  try {
    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
    return valid ? payload : "";
  } catch (_) {
    return "";
  }
}

function parseCookies(header) {
  return String(header || "")
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, chunk) => {
      const index = chunk.indexOf("=");
      if (index <= 0) return acc;
      const key = chunk.slice(0, index).trim();
      const value = chunk.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeStudyYear(value) {
  const raw = normalizeText(value).toLowerCase();
  const map = new Map([
    ["1", "1ro"],
    ["1ro", "1ro"],
    ["primero", "1ro"],
    ["2", "2do"],
    ["2do", "2do"],
    ["segundo", "2do"],
    ["3", "3ro"],
    ["3ro", "3ro"],
    ["tercero", "3ro"],
    ["4", "4to"],
    ["4to", "4to"],
    ["cuarto", "4to"],
    ["5", "5to"],
    ["5to", "5to"],
    ["quinto", "5to"],
    ["6", "6to"],
    ["6to", "6to"],
    ["sexto", "6to"],
  ]);
  return map.get(raw) || "";
}

function normalizeDay(value) {
  const raw = normalizeText(value).toLowerCase();
  const map = new Map([
    ["lunes", "Lunes"],
    ["martes", "Martes"],
    ["miercoles", "Miercoles"],
    ["miércoles", "Miercoles"],
    ["jueves", "Jueves"],
    ["viernes", "Viernes"],
  ]);
  return map.get(raw) || "";
}

function getFullName(firstName, lastName) {
  return `${normalizeText(firstName)} ${normalizeText(lastName)}`.trim();
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    fullName: user.fullName || getFullName(user.firstName, user.lastName),
    email: user.email || "",
    role: user.role || "student",
    resetRequested: Boolean(user.resetRequested),
  };
}

function normalizeMaterial(material) {
  return {
    id: material.id || createId("mat"),
    itemType: material.itemType || "file",
    title: material.title || "Sin titulo",
    content: material.content || "",
    fileName: material.fileName || "",
    originalName: material.originalName || "",
    mimeType: material.mimeType || "",
    parentFolderId: material.parentFolderId || "",
    uploadedAt: material.uploadedAt || new Date().toISOString(),
    uploadedBy: material.uploadedBy || "",
  };
}

function normalizeSubject(subject) {
  return {
    id: subject.id || createId("sub"),
    name: subject.name || "",
    teacher: subject.teacher || "",
    description: subject.description || "",
    year: normalizeStudyYear(subject.year) || "",
    materials: Array.isArray(subject.materials)
      ? subject.materials.map(normalizeMaterial)
      : [],
    deleteVotes: Array.isArray(subject.deleteVotes) ? subject.deleteVotes : [],
  };
}

function normalizeBoard(board) {
  return {
    id: board.id || createId("board"),
    name: board.name || "Planilla 1",
    entries: Array.isArray(board.entries)
      ? board.entries.map((entry) => ({
          id: entry.id || createId("sched"),
          boardId: entry.boardId || board.id || "",
          day: normalizeDay(entry.day) || entry.day || "",
          start: entry.start || "",
          end: entry.end || "",
          subjectId: entry.subjectId || "",
          subject: entry.subject || "",
          teacher: entry.teacher || "",
          description: entry.description || "",
          year: normalizeStudyYear(entry.year) || "",
        }))
      : [],
  };
}

function normalizeCareer(career, index) {
  const subjects = Array.isArray(career.subjects)
    ? career.subjects.map(normalizeSubject)
    : [];
  const scheduleBoards = Array.isArray(career.scheduleBoards)
    ? career.scheduleBoards.map(normalizeBoard)
    : [];
  const studyYears = Array.isArray(career.studyYears)
    ? [...new Set(career.studyYears.map(normalizeStudyYear).filter(Boolean))]
    : [];

  return {
    id: career.id || createId("car"),
    name: career.name || "Carrera",
    color: career.color || CAREER_COLORS[index % CAREER_COLORS.length],
    createdAt: career.createdAt || new Date().toISOString(),
    delegate: career.delegate || null,
    studyYears,
    subjects,
    scheduleBoards:
      scheduleBoards.length > 0
        ? scheduleBoards
        : [{ id: createId("board"), name: "Planilla 1", entries: [] }],
  };
}

function normalizeState(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    users: Array.isArray(source.users)
      ? source.users.map((user, index) => ({
          id: user.id || createId("usr"),
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          fullName:
            user.fullName || getFullName(user.firstName, user.lastName) || "",
          email: normalizeEmail(user.email),
          password: user.password || "",
          role: user.role || (index === 0 ? "admin" : "student"),
          resetRequested: Boolean(user.resetRequested),
          createdAt: user.createdAt || new Date().toISOString(),
        }))
      : [],
    careers: Array.isArray(source.careers)
      ? source.careers.map((career, index) => normalizeCareer(career, index))
      : [],
  };
}

function getPublicState(state) {
  return {
    users: state.users.map(sanitizeUser),
    careers: state.careers,
  };
}

async function ensureDirectories() {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(uploadsDir, { recursive: true });
}

async function writeFileState(state) {
  await fsp.writeFile(dataFile, JSON.stringify(state, null, 2), "utf8");
}

async function loadFileState() {
  try {
    const raw = await fsp.readFile(dataFile, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    const state = normalizeState({ users: [], careers: [] });
    await writeFileState(state);
    return state;
  }
}

async function initializeDatabase() {
  if (!pool) {
    appStateCache = await loadFileState();
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_meta (
      id SERIAL PRIMARY KEY,
      app_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS uploaded_files (
      file_name TEXT PRIMARY KEY,
      original_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      content BYTEA NOT NULL,
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

  const existing = await pool.query(
    "SELECT payload FROM app_state WHERE id = 1 LIMIT 1"
  );
  if (!existing.rows.length) {
    const seed = normalizeState({ users: [], careers: [] });
    await pool.query(
      `
        INSERT INTO app_state (id, payload, updated_at)
        VALUES (1, $1::jsonb, NOW())
      `,
      [JSON.stringify(seed)]
    );
    appStateCache = seed;
    return true;
  }

  appStateCache = normalizeState(existing.rows[0].payload);
  return true;
}

async function readState() {
  if (!pool) {
    appStateCache = await loadFileState();
    return clone(appStateCache);
  }

  const result = await pool.query(
    "SELECT payload FROM app_state WHERE id = 1 LIMIT 1"
  );
  appStateCache = normalizeState(result.rows[0]?.payload || {});
  return clone(appStateCache);
}

async function saveState(state) {
  const normalized = normalizeState(state);
  appStateCache = normalized;

  if (!pool) {
    await writeFileState(normalized);
    return clone(normalized);
  }

  await pool.query(
    `
      INSERT INTO app_state (id, payload, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [JSON.stringify(normalized)]
  );
  return clone(normalized);
}

async function saveUploadedFile({ fileName, originalName, mimeType, buffer }) {
  if (!fileName || !buffer) {
    throw new Error("Missing file payload.");
  }
  if (!pool) {
    const filePath = path.join(uploadsDir, fileName);
    await fsp.writeFile(filePath, buffer);
    return;
  }
  await pool.query(
    `
      INSERT INTO uploaded_files (file_name, original_name, mime_type, content, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (file_name)
      DO UPDATE SET
        original_name = EXCLUDED.original_name,
        mime_type = EXCLUDED.mime_type,
        content = EXCLUDED.content,
        created_at = NOW()
    `,
    [fileName, originalName || "", mimeType || "application/octet-stream", buffer]
  );
}

async function readUploadedFile(fileName) {
  if (!fileName) return null;
  if (!pool) {
    const filePath = path.join(uploadsDir, fileName);
    try {
      const content = await fsp.readFile(filePath);
      return {
        fileName,
        mimeType: mime.lookup(fileName) || "application/octet-stream",
        content,
      };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  const result = await pool.query(
    `
      SELECT file_name, original_name, mime_type, content
      FROM uploaded_files
      WHERE file_name = $1
      LIMIT 1
    `,
    [fileName]
  );
  if (!result.rows.length) {
    const fallbackPath = path.join(uploadsDir, fileName);
    try {
      const content = await fsp.readFile(fallbackPath);
      return {
        fileName,
        mimeType: mime.lookup(fileName) || "application/octet-stream",
        content,
      };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }
  return {
    fileName: result.rows[0].file_name,
    originalName: result.rows[0].original_name,
    mimeType: result.rows[0].mime_type,
    content: result.rows[0].content,
  };
}

async function removeUploadedFile(fileName) {
  if (!fileName) return;
  if (!pool) {
    const filePath = path.join(uploadsDir, fileName);
    try {
      await fsp.unlink(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    return;
  }
  await pool.query("DELETE FROM uploaded_files WHERE file_name = $1", [fileName]);
  const fallbackPath = path.join(uploadsDir, fileName);
  try {
    await fsp.unlink(fallbackPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function getDatabaseHealth() {
  if (!pool) {
    return {
      enabled: false,
      ok: true,
      reason: "Using local JSON persistence",
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

function getCurrentUser(req, state) {
  const userId = req.session?.userId || "";
  return state.users.find((user) => user.id === userId) || null;
}

function ensureAuth(req, res, next) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Inicia sesion para continuar." });
    return;
  }
  next();
}

function findCareer(state, careerId) {
  return state.careers.find((career) => career.id === careerId) || null;
}

function findSubject(career, subjectId) {
  return (career.subjects || []).find((subject) => subject.id === subjectId) || null;
}

function getIdentifierCandidates(user) {
  return [
    normalizeText(user.firstName).toLowerCase(),
    normalizeText(user.lastName).toLowerCase(),
    normalizeText(user.fullName).toLowerCase(),
    normalizeEmail(user.email),
  ].filter(Boolean);
}

function findUserByIdentifier(state, identifier) {
  const normalized = normalizeText(identifier).toLowerCase();
  if (!normalized) return null;
  return (
    state.users.find((user) => getIdentifierCandidates(user).includes(normalized)) ||
    null
  );
}

function getBoard(career, boardId) {
  return (career.scheduleBoards || []).find((board) => board.id === boardId) || null;
}

function findScheduleEntry(career, entryId) {
  for (const board of career.scheduleBoards || []) {
    const entry = (board.entries || []).find((item) => item.id === entryId);
    if (entry) {
      return { board, entry };
    }
  }
  return null;
}

function findMaterial(subject, materialId) {
  return (subject.materials || []).find((item) => item.id === materialId) || null;
}

function collectMaterialIds(materials, rootId) {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of materials) {
      if (result.has(item.id)) continue;
      if (result.has(item.parentFolderId || "")) {
        result.add(item.id);
        changed = true;
      }
    }
  }
  return [...result];
}

async function removeUploadedFiles(materials) {
  for (const item of materials) {
    if (!item.fileName) continue;
    await removeUploadedFile(item.fileName);
  }
}

function pickCareerColor(state) {
  return CAREER_COLORS[state.careers.length % CAREER_COLORS.length];
}

function toSafeFileComponent(value) {
  return String(value || "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});
const uploadSingleMaterial = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "El archivo supera el limite de 25 MB." });
        return;
      }
      res.status(400).json({ error: error.message || "No se pudo subir el archivo." });
      return;
    }

    next(error);
  });
};

function parseTitleFromFile(file) {
  const originalName = String(file?.originalname || "").trim();
  const ext = path.extname(originalName);
  return originalName ? path.basename(originalName, ext) : "Archivo";
}

function buildUploadFileName(file) {
  const ext = path.extname(file?.originalname || "");
  const base = path.basename(file?.originalname || "archivo", ext);
  const safeBase = toSafeFileComponent(base) || "archivo";
  return `${Date.now()}-${crypto.randomUUID()}-${safeBase}${ext}`;
}

function isDescendantFolder(materials, materialId, targetFolderId) {
  if (!targetFolderId) return false;
  let current = findMaterial({ materials }, targetFolderId);
  while (current) {
    if (current.id === materialId) return true;
    current = findMaterial({ materials }, current.parentFolderId || "");
  }
  return false;
}

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: "miclase.sid",
    secret: SESSION_SECRET,
    proxy: process.env.NODE_ENV === "production",
    resave: false,
    saveUninitialized: false,
    cookie: getCookieSettings(),
  })
);
app.use((req, res, next) => {
  if (req.session?.userId) {
    next();
    return;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const persistedUserId = verifyAuthValue(cookies[AUTH_COOKIE_NAME] || "");
  if (persistedUserId) {
    req.session.userId = persistedUserId;
  }
  next();
});
app.get("/sw.js", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.type("application/javascript");
  res.send(renderPublicTemplate(swFile));
});
app.use(express.static(publicDir, { index: false }));
app.get("/files/:fileName", async (req, res) => {
  try {
    const fileName = String(req.params.fileName || "").trim();
    const file = await readUploadedFile(fileName);
    if (!file) {
      res.status(404).json({
        error: "No encontre ese archivo.",
      });
      return;
    }
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    res.type(file.mimeType || mime.lookup(file.fileName) || "application/octet-stream");
    res.send(file.content);
  } catch (error) {
    console.error("MiClase file read error:", error);
    res.status(500).json({
      error: "No pude leer el archivo.",
    });
  }
});

app.get("/api/health", async (_req, res) => {
  const database = await getDatabaseHealth();
  res.status(database.ok ? 200 : 503).json({
    ok: database.ok,
    service: "MiClase",
    timestamp: new Date().toISOString(),
    database,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    appName: "MiClase",
    version: getAppVersion(),
    environment: process.env.NODE_ENV || "development",
    database: {
      provider: "postgres",
      configured: hasDatabase,
    },
  });
});

app.get("/api/version", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.json({
    version: getAppVersion(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/session", async (req, res) => {
  const state = await readState();
  const user = getCurrentUser(req, state);
  res.json({ user: sanitizeUser(user) });
});

app.get("/api/data", ensureAuth, async (_req, res) => {
  const state = await readState();
  res.json(getPublicState(state));
});

app.post("/api/register", async (req, res) => {
  const firstName = normalizeText(req.body.firstName);
  const lastName = normalizeText(req.body.lastName);
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  if (!firstName || !lastName || !email || !password) {
    res.status(400).json({ error: "Completa todos los campos." });
    return;
  }

  const state = await readState();
  if (state.users.some((user) => normalizeEmail(user.email) === email)) {
    res.status(400).json({ error: "Ese Gmail ya esta registrado." });
    return;
  }

  const user = {
    id: createId("usr"),
    firstName,
    lastName,
    fullName: getFullName(firstName, lastName),
    email,
    password,
    role: state.users.length === 0 ? "admin" : "student",
    resetRequested: false,
    createdAt: new Date().toISOString(),
  };
  state.users.push(user);
  await saveState(state);
  req.session.userId = user.id;
  res.cookie(AUTH_COOKIE_NAME, signAuthValue(user.id), getCookieSettings());
  res.json({ user: sanitizeUser(user), mode: "register" });
});

app.post("/api/login", async (req, res) => {
  const identifier = normalizeText(req.body.identifier);
  const password = String(req.body.password || "");
  const state = await readState();
  const user = findUserByIdentifier(state, identifier);

  if (!user || user.password !== password) {
    res.status(400).json({ error: "Usuario o contrasena incorrectos." });
    return;
  }

  req.session.userId = user.id;
  res.cookie(AUTH_COOKIE_NAME, signAuthValue(user.id), getCookieSettings());
  res.json({ user: sanitizeUser(user), mode: "login" });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/password-reset/request", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const state = await readState();
  const user = state.users.find((item) => normalizeEmail(item.email) === email);

  if (!user) {
    res.status(400).json({ error: "No encontre una cuenta con ese Gmail." });
    return;
  }

  user.resetRequested = true;
  user.resetRequestedAt = new Date().toISOString();
  await saveState(state);
  res.json({
    ok: true,
    message: "Pedido registrado. Ya puedes escribir una nueva contrasena.",
  });
});

app.post("/api/password-reset/complete", async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const passwordRepeat = String(req.body.passwordRepeat || "");
  const state = await readState();
  const user = state.users.find((item) => normalizeEmail(item.email) === email);

  if (!user) {
    res.status(400).json({ error: "No encontre una cuenta con ese Gmail." });
    return;
  }
  if (!password || password !== passwordRepeat) {
    res.status(400).json({ error: "Las contrasenas no coinciden." });
    return;
  }
  if (!user.resetRequested) {
    res.status(400).json({ error: "Primero pide el cambio de contrasena." });
    return;
  }

  user.password = password;
  user.resetRequested = false;
  delete user.resetRequestedAt;
  await saveState(state);
  res.json({ ok: true, message: "Contrasena actualizada." });
});

app.post("/api/careers", ensureAuth, async (req, res) => {
  const state = await readState();
  const name = normalizeText(req.body.name);

  if (!name) {
    res.status(400).json({ error: "Escribe un nombre para la carrera." });
    return;
  }

  const career = normalizeCareer(
    {
      id: createId("car"),
      name,
      color: pickCareerColor(state),
      createdAt: new Date().toISOString(),
      studyYears: [],
      subjects: [],
      scheduleBoards: [{ id: createId("board"), name: "Planilla 1", entries: [] }],
    },
    state.careers.length
  );
  state.careers.push(career);
  await saveState(state);
  res.status(201).json(career);
});

app.put("/api/careers/:careerId", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  if (!career) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const name = normalizeText(req.body.name);
  if (!name) {
    res.status(400).json({ error: "Escribe un nombre valido." });
    return;
  }

  career.name = name;
  await saveState(state);
  res.json(career);
});

app.delete("/api/careers/:careerId", ensureAuth, async (req, res) => {
  const state = await readState();
  const index = state.careers.findIndex((career) => career.id === req.params.careerId);
  if (index < 0) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const career = state.careers[index];
  const files = (career.subjects || []).flatMap((subject) =>
    (subject.materials || []).filter((item) => item.fileName)
  );
  await removeUploadedFiles(files);
  state.careers.splice(index, 1);
  await saveState(state);
  res.json({ ok: true });
});

app.put("/api/careers/:careerId/delegate", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  if (!career) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const identifier = normalizeText(req.body.identifier);
  if (!identifier) {
    career.delegate = null;
    await saveState(state);
    res.json({ ok: true, delegate: null });
    return;
  }

  const user = findUserByIdentifier(state, identifier);
  if (!user) {
    res.status(400).json({ error: "No encontre ese usuario." });
    return;
  }

  career.delegate = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
  };
  await saveState(state);
  res.json({ ok: true, delegate: career.delegate });
});

app.post("/api/careers/:careerId/study-years", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  if (!career) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const year = normalizeStudyYear(req.body.year);
  if (!year) {
    res.status(400).json({ error: "Escribe un ano valido." });
    return;
  }
  if (career.studyYears.includes(year)) {
    res.status(400).json({ error: "Ese ano ya existe." });
    return;
  }

  career.studyYears.push(year);
  career.studyYears = [...new Set(career.studyYears.map(normalizeStudyYear).filter(Boolean))];
  await saveState(state);
  res.status(201).json({ ok: true, year });
});

app.post("/api/careers/:careerId/subjects", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  if (!career) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const name = normalizeText(req.body.name);
  const teacher = normalizeText(req.body.teacher);
  const year = normalizeStudyYear(req.body.year);
  if (!name || !teacher || !year) {
    res.status(400).json({ error: "Completa nombre, docente y ano." });
    return;
  }

  const subject = normalizeSubject({
    id: createId("sub"),
    name,
    teacher,
    year,
    materials: [],
    deleteVotes: [],
  });
  career.subjects.push(subject);
  if (!career.studyYears.includes(year)) {
    career.studyYears.push(year);
  }
  await saveState(state);
  res.status(201).json(subject);
});

app.put("/api/careers/:careerId/subjects/:subjectId", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  const subject = career ? findSubject(career, req.params.subjectId) : null;
  if (!career || !subject) {
    res.status(404).json({ error: "No encontre esa materia." });
    return;
  }

  const name = normalizeText(req.body.name);
  const teacher = normalizeText(req.body.teacher);
  if (!name || !teacher) {
    res.status(400).json({ error: "Completa nombre y docente." });
    return;
  }

  subject.name = name;
  subject.teacher = teacher;
  for (const board of career.scheduleBoards || []) {
    for (const entry of board.entries || []) {
      if (entry.subjectId === subject.id) {
        entry.subject = name;
        entry.teacher = teacher;
        entry.year = subject.year;
      }
    }
  }
  await saveState(state);
  res.json(subject);
});

app.post(
  "/api/careers/:careerId/subjects/:subjectId/delete-votes",
  ensureAuth,
  async (req, res) => {
    const state = await readState();
    const career = findCareer(state, req.params.careerId);
    const subject = career ? findSubject(career, req.params.subjectId) : null;
    const user = getCurrentUser(req, state);
    if (!career || !subject || !user) {
      res.status(404).json({ error: "No encontre esa materia." });
      return;
    }

    subject.deleteVotes = Array.isArray(subject.deleteVotes) ? subject.deleteVotes : [];
    if (subject.deleteVotes.includes(user.id)) {
      res.status(400).json({ error: "Ya votaste para eliminar esta materia." });
      return;
    }

    subject.deleteVotes.push(user.id);
    if (subject.deleteVotes.length >= DELETE_VOTE_THRESHOLD) {
      const files = (subject.materials || []).filter((item) => item.fileName);
      await removeUploadedFiles(files);
      career.subjects = career.subjects.filter((item) => item.id !== subject.id);
      for (const board of career.scheduleBoards || []) {
        board.entries = (board.entries || []).filter(
          (entry) => entry.subjectId !== subject.id
        );
      }
      await saveState(state);
      res.json({ deleted: true, votes: DELETE_VOTE_THRESHOLD, required: DELETE_VOTE_THRESHOLD });
      return;
    }

    await saveState(state);
    res.json({
      deleted: false,
      votes: subject.deleteVotes.length,
      required: DELETE_VOTE_THRESHOLD,
    });
  }
);

app.post("/api/careers/:careerId/schedule-boards", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  if (!career) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const name =
    normalizeText(req.body.name) ||
    `Planilla ${(career.scheduleBoards || []).length + 1}`;
  const board = normalizeBoard({
    id: createId("board"),
    name,
    entries: [],
  });
  career.scheduleBoards.push(board);
  await saveState(state);
  res.status(201).json(board);
});

app.post("/api/careers/:careerId/schedule", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  if (!career) {
    res.status(404).json({ error: "No encontre esa carrera." });
    return;
  }

  const board = getBoard(career, req.body.boardId);
  const subject = findSubject(career, req.body.subjectId);
  const day = normalizeDay(req.body.day);
  const start = normalizeText(req.body.start);
  const end = normalizeText(req.body.end);

  if (!board || !subject || !day || !start || !end) {
    res.status(400).json({ error: "Completa planilla, materia, dia e intervalo." });
    return;
  }

  const entry = {
    id: createId("sched"),
    boardId: board.id,
    day,
    start,
    end,
    subjectId: subject.id,
    subject: subject.name,
    teacher: subject.teacher,
    description: subject.description || "",
    year: subject.year || "",
  };
  board.entries.push(entry);
  await saveState(state);
  res.status(201).json(entry);
});

app.put("/api/careers/:careerId/schedule/:entryId", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  const match = career ? findScheduleEntry(career, req.params.entryId) : null;
  if (!career || !match) {
    res.status(404).json({ error: "No encontre ese horario." });
    return;
  }

  const subject = findSubject(career, req.body.subjectId);
  const day = normalizeDay(req.body.day);
  const start = normalizeText(req.body.start);
  const end = normalizeText(req.body.end);
  if (!subject || !day || !start || !end) {
    res.status(400).json({ error: "Completa materia, dia e intervalo." });
    return;
  }

  match.entry.day = day;
  match.entry.start = start;
  match.entry.end = end;
  match.entry.subjectId = subject.id;
  match.entry.subject = subject.name;
  match.entry.teacher = subject.teacher;
  match.entry.description = subject.description || "";
  match.entry.year = subject.year || "";
  await saveState(state);
  res.json(match.entry);
});

app.delete("/api/careers/:careerId/schedule/:entryId", ensureAuth, async (req, res) => {
  const state = await readState();
  const career = findCareer(state, req.params.careerId);
  const match = career ? findScheduleEntry(career, req.params.entryId) : null;
  if (!career || !match) {
    res.status(404).json({ error: "No encontre ese horario." });
    return;
  }

  match.board.entries = (match.board.entries || []).filter(
    (entry) => entry.id !== req.params.entryId
  );
  await saveState(state);
  res.json({ ok: true });
});

app.post(
  "/api/careers/:careerId/subjects/:subjectId/materials",
  ensureAuth,
  uploadSingleMaterial,
  async (req, res) => {
    const state = await readState();
    const career = findCareer(state, req.params.careerId);
    const subject = career ? findSubject(career, req.params.subjectId) : null;
    const user = getCurrentUser(req, state);

    if (!career || !subject || !user) {
      if (req.file?.path) {
        await fsp.unlink(req.file.path).catch(() => {});
      }
      res.status(404).json({ error: "No encontre esa materia." });
      return;
    }

    const itemType = normalizeText(req.body.itemType) || "file";
    const parentFolderId = normalizeText(req.body.parentFolderId);
    const content = normalizeText(req.body.content);
    const url = normalizeText(req.body.url);
    let title = normalizeText(req.body.title);

    if (parentFolderId) {
      const parentFolder = findMaterial(subject, parentFolderId);
      if (!parentFolder || parentFolder.itemType !== "folder") {
        if (req.file?.path) {
          await fsp.unlink(req.file.path).catch(() => {});
        }
        res.status(400).json({ error: "No encontre la carpeta elegida." });
        return;
      }
    }

    const material = {
      id: createId("mat"),
      itemType,
      title: "",
      content: "",
      fileName: "",
      originalName: "",
      mimeType: "",
      parentFolderId,
      uploadedAt: new Date().toISOString(),
      uploadedBy: user.id,
    };

    if (itemType === "folder") {
      material.title = title || "Nueva carpeta";
    } else if (itemType === "note") {
      material.title = title || "Nota";
      material.content = content;
    } else if (itemType === "link") {
      if (!url) {
        res.status(400).json({ error: "Escribe una URL." });
        return;
      }
      material.title = title || url;
      material.content = url;
    } else {
      if (!req.file) {
        res.status(400).json({ error: "Selecciona un archivo." });
        return;
      }
      const storedFileName = buildUploadFileName(req.file);
      const resolvedMimeType =
        req.file.mimetype ||
        mime.lookup(req.file.originalname || "") ||
        "application/octet-stream";
      try {
        await saveUploadedFile({
          fileName: storedFileName,
          originalName: req.file.originalname,
          mimeType: resolvedMimeType,
          buffer: req.file.buffer,
        });
      } catch (error) {
        console.error("MiClase upload write error:", error);
        res.status(500).json({ error: "No pude guardar el archivo subido." });
        return;
      }
      material.title = title || parseTitleFromFile(req.file);
      material.content = content;
      material.fileName = storedFileName;
      material.originalName = req.file.originalname;
      material.mimeType = resolvedMimeType;
    }

    subject.materials.push(material);
    await saveState(state);
    res.status(201).json(material);
  }
);

app.put(
  "/api/careers/:careerId/subjects/:subjectId/materials/:materialId",
  ensureAuth,
  async (req, res) => {
    const state = await readState();
    const career = findCareer(state, req.params.careerId);
    const subject = career ? findSubject(career, req.params.subjectId) : null;
    const material = subject ? findMaterial(subject, req.params.materialId) : null;
    if (!career || !subject || !material) {
      res.status(404).json({ error: "No encontre esa publicacion." });
      return;
    }

    const nextTitle = normalizeText(req.body.title);
    const nextParentFolderId = Object.prototype.hasOwnProperty.call(
      req.body,
      "parentFolderId"
    )
      ? normalizeText(req.body.parentFolderId)
      : null;

    if (nextTitle) {
      material.title = nextTitle;
    }

    if (nextParentFolderId !== null) {
      if (!nextParentFolderId) {
        material.parentFolderId = "";
      } else {
        const parentFolder = findMaterial(subject, nextParentFolderId);
        if (!parentFolder || parentFolder.itemType !== "folder") {
          res.status(400).json({ error: "No encontre la carpeta elegida." });
          return;
        }
        if (material.id === parentFolder.id) {
          res.status(400).json({ error: "No puedes mover un elemento dentro de si mismo." });
          return;
        }
        if (isDescendantFolder(subject.materials || [], material.id, parentFolder.id)) {
          res.status(400).json({ error: "No puedes mover una carpeta dentro de una subcarpeta suya." });
          return;
        }
        material.parentFolderId = parentFolder.id;
      }
    }

    await saveState(state);
    res.json(material);
  }
);

app.delete(
  "/api/careers/:careerId/subjects/:subjectId/materials/:materialId",
  ensureAuth,
  async (req, res) => {
    const state = await readState();
    const career = findCareer(state, req.params.careerId);
    const subject = career ? findSubject(career, req.params.subjectId) : null;
    const material = subject ? findMaterial(subject, req.params.materialId) : null;
    if (!career || !subject || !material) {
      res.status(404).json({ error: "No encontre esa publicacion." });
      return;
    }

    const ids = collectMaterialIds(subject.materials || [], material.id);
    const deleting = (subject.materials || []).filter((item) => ids.includes(item.id));
    await removeUploadedFiles(deleting);
    subject.materials = (subject.materials || []).filter((item) => !ids.includes(item.id));
    await saveState(state);
    res.json({ ok: true });
  }
);

app.get("/{*any}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.setHeader("Cache-Control", "no-cache");
  res.type("html");
  res.send(renderPublicTemplate(indexFile));
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Not found",
    path: req.path,
  });
});

app.use((error, _req, res, _next) => {
  console.error("MiClase server error:", error);
  res.status(500).json({
    error: "Ocurrio un error en el servidor.",
  });
});

ensureDirectories()
  .then(() => initializeDatabase())
  .then((initialized) => {
    if (initialized) {
      console.log("MiClase storage ready");
    } else {
      console.log("MiClase local storage ready");
    }

    app.listen(port, () => {
      console.log(`MiClase running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize MiClase:", error.message);
    process.exit(1);
  });
