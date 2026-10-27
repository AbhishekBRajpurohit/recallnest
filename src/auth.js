import {
  randomBytes,
  scrypt as rawScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { db, transaction } from "./db.js";
const scrypt = promisify(rawScrypt),
  digest = (s) => createHash("sha256").update(s).digest("hex");
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner INTEGER NOT NULL,expires INTEGER NOT NULL);`);
const attempts = new Map();
function limited(req, fail) {
  const key = req.socket.remoteAddress,
    now = Date.now();
  if (attempts.size > 10000) attempts.clear();
  const a = attempts.get(key);
  if (!a || a.until < now) {
    attempts.set(key, { count: 1, until: now + 60000 });
    return;
  }
  if (++a.count > 20) fail(429, "Too many attempts; wait one minute");
}
const token = (req) =>
  (req.headers.cookie || "")
    .split("; ")
    .find((s) => s.startsWith("session="))
    ?.slice(8);
export function authenticate(req) {
  const t = token(req);
  return t
    ? db
        .prepare("SELECT owner FROM sessions WHERE token=? AND expires>?")
        .get(digest(t), Date.now())?.owner
    : null;
}
function cookie(res, value, age) {
  res.setHeader(
    "Set-Cookie",
    `session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.APP_ORIGIN?.startsWith("https:") ? "; Secure" : ""}`,
  );
}
export function register({ route, json, body, fail }) {
  for (const action of ["register", "login"])
    route("POST", new RegExp("^/api/auth/" + action + "$"), async (c) => {
      limited(c.req, fail);
      const b = await body(c.req),
        email = String(b.email || "")
          .trim()
          .toLowerCase(),
        password = String(b.password || "");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        password.length < 8 ||
        password.length > 128
      )
        fail(400, "Valid email and password of 8–128 characters required");
      let user = db.prepare("SELECT * FROM users WHERE email=?").get(email);
      if (action === "register") {
        if (user) fail(409, "Account already exists");
        const name = String(b.name || email.split("@")[0]).slice(0, 80),
          salt = randomBytes(16).toString("hex"),
          hash = (await scrypt(password, salt, 64)).toString("hex");
        user = transaction(() => {
          const id = Number(
            db
              .prepare("INSERT INTO users(email,name,password) VALUES(?,?,?)")
              .run(email, name, salt + ":" + hash).lastInsertRowid,
          );
          if (db.prepare("SELECT count(*) AS n FROM users").get().n === 1)
            db.prepare("UPDATE notes SET owner=? WHERE owner=0").run(id);
          return { id, email, name };
        });
      } else {
        const [salt, hash] = (
          user?.password || "dummy:" + "00".repeat(64)
        ).split(":");
        const computed = await scrypt(password, salt, 64);
        if (!user || !timingSafeEqual(Buffer.from(hash, "hex"), computed))
          fail(401, "Invalid email or password");
      }
      const raw = randomBytes(32).toString("hex");
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        digest(raw),
        user.id,
        Date.now() + 7 * 86400000,
      );
      cookie(c.res, raw, 7 * 86400);
      json(c.res, { id: user.id, name: user.name, email: user.email });
    });
  route("GET", /^\/api\/me$/, async (c) =>
    json(
      c.res,
      db.prepare("SELECT id,name,email FROM users WHERE id=?").get(c.user),
    ),
  );
  route("PUT", /^\/api\/me$/, async (c) => {
    const b = await body(c.req),
      name = String(b.name || "").trim();
    if (!name || name.length > 80) fail(400, "Name must have 1–80 characters");
    db.prepare("UPDATE users SET name=? WHERE id=?").run(name, c.user);
    json(
      c.res,
      db.prepare("SELECT id,name,email FROM users WHERE id=?").get(c.user),
    );
  });
  route("POST", /^\/api\/logout$/, async (c) => {
    const t = token(c.req);
    if (t) db.prepare("DELETE FROM sessions WHERE token=?").run(digest(t));
    cookie(c.res, "", 0);
    json(c.res, { ok: true });
  });
}
