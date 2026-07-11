const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const dbFile = path.join(dataDir, "wishes.json");
const card6SettingsFile = path.join(dataDir, "card6-settings.json");
const card6PhotoFile = path.join(dataDir, "card6-photo");
const card6PhotoMetaFile = path.join(dataDir, "card6-photo.json");
const port = process.env.PORT || 3000;

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "[]");
ensureCard6Settings();

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp"
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/wishes" && req.method === "GET") return sendJson(res, readWishes());
    if (req.url === "/api/wishes" && req.method === "POST") return saveWish(req, res);
    if (req.url === "/api/card6/settings" && req.method === "GET") return sendJson(res, readCard6Settings());
    if (req.url === "/api/card6/settings" && req.method === "POST") return saveCard6Settings(req, res);
    if (req.url.startsWith("/api/card6/photo") && (req.method === "GET" || req.method === "HEAD")) return sendCard6Photo(req, res);
    if (req.url === "/api/card6/photo" && req.method === "POST") return saveCard6Photo(req, res);
    return serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "server_error" }));
  }
});

function readWishes() {
  return JSON.parse(fs.readFileSync(dbFile, "utf8")).slice(-100).reverse();
}

function defaultCard6Settings() {
  return {
    brand: "Rainbow Birthday Card",
    intro: "JOIN US AS WE THROW JANE<br>A VERY SPECIAL<br>3RD BIRTHDAY PARTY",
    headline: "young,<br>wild &<br>three",
    photoPlaceholder: "上传一张主角照片<br>它会显示在这里",
    date: "FRIDAY, AUGUST 24TH",
    time: "AT 4 P.M.",
    place: "OUR PLACE",
    saveButton: "保存文字",
    uploadButton: "上传照片",
    statusHint: "点击文字即可修改，保存后公网也会更新。",
    wishFormTitle: "给朋友发祝福",
    wishFormNote: "把这张卡发出去，大家写下的祝福会一起留在这里。",
    wishButton: "发送祝福",
    wishListTitle: "祝福留言"
  };
}

function readCard6Settings() {
  ensureCard6Settings();
  const settings = { ...defaultCard6Settings(), ...JSON.parse(fs.readFileSync(card6SettingsFile, "utf8")) };
  const meta = readCard6PhotoMeta();
  if (meta.updatedAt) settings.photoUpdatedAt = meta.updatedAt;
  return settings;
}

function ensureCard6Settings() {
  if (!fs.existsSync(card6SettingsFile)) fs.writeFileSync(card6SettingsFile, JSON.stringify(defaultCard6Settings(), null, 2));
}

async function saveCard6Settings(req, res) {
  const input = JSON.parse(await readBody(req) || "{}");
  const defaults = defaultCard6Settings();
  const settings = {};
  for (const key of Object.keys(defaults)) {
    settings[key] = cleanHtml(input[key] || defaults[key], 900);
  }
  fs.writeFileSync(card6SettingsFile, JSON.stringify(settings, null, 2));
  sendJson(res, { ok: true });
}

function readCard6PhotoMeta() {
  if (!fs.existsSync(card6PhotoMetaFile)) return {};
  return JSON.parse(fs.readFileSync(card6PhotoMetaFile, "utf8"));
}

function sendCard6Photo(req, res) {
  const meta = readCard6PhotoMeta();
  if (!meta.type || !fs.existsSync(card6PhotoFile)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : "Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": meta.type, "Cache-Control": "no-store" });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(card6PhotoFile).pipe(res);
}

async function saveCard6Photo(req, res) {
  const body = await readBody(req, 8_000_000);
  const input = JSON.parse(body || "{}");
  const match = String(input.image || "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return sendJson(res, { error: "invalid_image" }, 400);
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 5_000_000) return sendJson(res, { error: "image_too_large" }, 400);
  const updatedAt = new Date().toISOString();
  fs.writeFileSync(card6PhotoFile, buffer);
  fs.writeFileSync(card6PhotoMetaFile, JSON.stringify({ type: match[1], updatedAt }, null, 2));
  sendJson(res, { ok: true, photoUpdatedAt: updatedAt });
}

async function saveWish(req, res) {
  const body = await readBody(req);
  const input = JSON.parse(body || "{}");
  const name = clean(input.name, 40);
  const message = clean(input.message, 500);
  if (!name || !message) return sendJson(res, { error: "name_and_message_required" }, 400);
  const wishes = JSON.parse(fs.readFileSync(dbFile, "utf8"));
  wishes.push({ id: Date.now(), name, message, createdAt: new Date().toISOString() });
  fs.writeFileSync(dbFile, JSON.stringify(wishes.slice(-200), null, 2));
  sendJson(res, { ok: true });
}

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanHtml(value, max) {
  return String(value || "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .trim()
    .slice(0, max);
}

function readBody(req, limit = 2000) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > limit) req.destroy();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.resolve(root, url === "/" ? "index.html" : `.${url}`);
  if (url.endsWith("/")) filePath = path.resolve(root, `.${url}`, "index.html");
  if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

server.listen(port, () => {
  console.log(`Birthday card server running on http://localhost:${port}`);
});
