const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dataDir = path.join(root, "data");
const dbFile = path.join(dataDir, "wishes.json");
const port = process.env.PORT || 3000;

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, "[]");

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
    return serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "server_error" }));
  }
});

function readWishes() {
  return JSON.parse(fs.readFileSync(dbFile, "utf8")).slice(-100).reverse();
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2000) req.destroy();
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
