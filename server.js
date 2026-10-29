import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
const routes = [];
export function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}
export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
export async function body(req) {
  let data = "";
  for await (const part of req) {
    data += part;
    if (Buffer.byteLength(data) > 1_000_000) fail(413, "Request too large");
  }
  try {
    const value = data ? JSON.parse(data) : {};
    if (!value || typeof value !== "object" || Array.isArray(value))
      fail(400, "JSON object required");
    return value;
  } catch {
    fail(400, "Invalid JSON object");
  }
}
export function json(res, value, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
const publicRoot = resolve("public");
route("GET", /^\/api\/health$/, async (c) => json(c.res, { ok: true }));
// Feature modules register routes here.
const { authenticate } = await import("./src/auth.js");
(await import("./src/auth.js")).register({ route, json, body, fail });
(await import("./src/notes.js")).register({ route, json, body, fail });
(await import("./src/search.js")).register({ route, json, body, fail });
(await import("./src/sync.js")).register({ route, json, body, fail });
(await import("./src/sharing.js")).register({ route, json, body, fail });
(await import("./src/ai.js")).register({ route, json, body, fail });
(await import("./src/semantic.js")).register({ route, json, body, fail });
(await import("./src/digest.js")).register({ route, json, body, fail });
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  );
  try {
    const url = new URL(req.url, "http://localhost");
    if (!["GET", "HEAD"].includes(req.method)) {
      const allowed = process.env.APP_ORIGIN || "http://localhost:3000";
      if (req.headers.origin && req.headers.origin !== allowed)
        fail(403, "Origin denied");
      if (!req.headers["content-type"]?.startsWith("application/json"))
        fail(415, "Use application/json");
    }
    let user = 0;
    if (
      url.pathname.startsWith("/api/") &&
      !(
        req.method === "GET" &&
        (url.pathname.startsWith("/api/shared/") ||
          url.pathname === "/api/public")
      ) &&
      !["/api/health", "/api/auth/login", "/api/auth/register"].includes(
        url.pathname,
      )
    ) {
      user = authenticate(req);
      if (!user) fail(401, "Please sign in");
    }
    for (const r of routes) {
      const match = url.pathname.match(r.pattern);
      if (r.method === req.method && match) {
        await r.handler({ req, res, url, match, user });
        return;
      }
    }
    if (url.pathname.startsWith("/api/")) fail(404, "API route not found");
    if (!["GET", "HEAD"].includes(req.method)) fail(405, "Method not allowed");
    const path = resolve(
      publicRoot,
      "." +
        decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
    );
    if (!path.startsWith(publicRoot + sep)) fail(403, "Path denied");
    let file;
    try {
      file = await readFile(path);
    } catch {
      fail(404, "File not found");
    }
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : file);
  } catch (e) {
    if (!res.headersSent)
      json(
        res,
        { error: e.status ? e.message : "Internal server error" },
        e.status || 500,
      );
    else res.end();
    if (!e.status) console.error(e);
  }
});
server.listen(
  Number(process.env.PORT ?? 3000),
  process.env.HOST || "127.0.0.1",
  () => console.log(`READY ${server.address().port}`),
);
