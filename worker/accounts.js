/* Account di Pronostici: email e password, Google, e copia dei dati del telefono sul server.
   Durable Object con archivio SQLite (piano gratuito). Nessuna libreria: password con PBKDF2 (WebCrypto),
   accesso Google verificando il token firmato con le chiavi pubbliche di Google.
   API (tutte sotto /api/account/):
     GET  config                       → { google: client id o null }
     POST register {email, password}   → { token, recovery }   (codice di recupero mostrato una volta sola)
     POST login    {email, password}   → { token }
     POST google   {credential}        → { token }
     POST reset    {email, recovery, password} → { token, recovery }
     GET  me                           → { email, google, updated }        (Authorization: Bearer <token>)
     POST password {old, password}     → { ok }
     GET  data                         → { blob, updated }
     PUT  data     {blob, base}        → { updated } oppure 409 { updated } se sul server c'è una copia più nuova
     POST logout / POST delete {password?} */

import { DurableObject } from "cloudflare:workers";

const MAX_BLOB = 1_500_000;
const PBKDF2_ITER = 100000;
const enc = new TextEncoder();
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const sha = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const b64url = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cleanEmail = e => String(e || "").trim().toLowerCase().slice(0, 200);
const okEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256));
}
async function hashPw(password) { const salt = rand(16); return `${salt}:${await pbkdf2(password, salt)}`; }
async function checkPw(password, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(":");
  const got = await pbkdf2(password, salt);
  let d = got.length ^ h.length;
  for (let i = 0; i < Math.min(got.length, h.length); i++) d |= got.charCodeAt(i) ^ h.charCodeAt(i);
  return d === 0;
}
const recoveryCode = () => rand(10).toUpperCase().match(/.{4}/g).join("-");   // es. 3F9A-0C21-...

export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE, pw TEXT, google TEXT UNIQUE, recovery TEXT, created INTEGER);
      CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uid TEXT, created INTEGER, used INTEGER);
      CREATE TABLE IF NOT EXISTS data (uid TEXT PRIMARY KEY, blob TEXT, updated INTEGER);
      CREATE TABLE IF NOT EXISTS tries (k TEXT PRIMARY KEY, n INTEGER, t INTEGER);`);
  }

  one(q, ...a) { return this.sql.exec(q, ...a).toArray()[0] || null; }

  // troppi tentativi sbagliati: 10 ogni 15 minuti per email e per indirizzo
  limited(keys) {
    const now = Date.now();
    return keys.some(k => { const r = this.one("SELECT n, t FROM tries WHERE k = ?", k); return r && now - r.t < 15 * 60e3 && r.n >= 10; });
  }
  fail(keys) {
    const now = Date.now();
    for (const k of keys) {
      const r = this.one("SELECT n, t FROM tries WHERE k = ?", k);
      const n = r && now - r.t < 15 * 60e3 ? r.n + 1 : 1;
      this.sql.exec("INSERT OR REPLACE INTO tries (k, n, t) VALUES (?, ?, ?)", k, n, r && n > 1 ? r.t : now);
    }
  }

  async session(uid) {
    const token = rand(32);
    this.sql.exec("INSERT INTO sessions (token, uid, created, used) VALUES (?, ?, ?, ?)", await sha(token), uid, Date.now(), Date.now());
    return token;
  }
  async user(request) {
    const m = (request.headers.get("authorization") || "").match(/^Bearer ([0-9a-f]{64})$/);
    if (!m) return null;
    const h = await sha(m[1]);
    const s = this.one("SELECT uid, used FROM sessions WHERE token = ?", h);
    if (!s) return null;
    if (Date.now() - s.used > 864e5) this.sql.exec("UPDATE sessions SET used = ? WHERE token = ?", Date.now(), h);
    return { ...this.one("SELECT * FROM users WHERE id = ?", s.uid), token: h };
  }

  async googleClaims(credential) {
    const cid = this.env.GOOGLE_CLIENT_ID;
    if (!cid) throw new Error("Accesso con Google non attivo");
    const [h, p, s] = String(credential || "").split(".");
    const head = JSON.parse(new TextDecoder().decode(b64url(h))), claims = JSON.parse(new TextDecoder().decode(b64url(p)));
    let keys = await this.ctx.storage.get("gkeys");
    if (!keys || Date.now() - keys.t > 6 * 3600e3 || !keys.k.some(k => k.kid === head.kid)) {
      const r = await fetch("https://www.googleapis.com/oauth2/v3/certs");
      keys = { t: Date.now(), k: (await r.json()).keys };
      await this.ctx.storage.put("gkeys", keys);
    }
    const jwk = keys.k.find(k => k.kid === head.kid);
    if (!jwk || head.alg !== "RS256") throw new Error("token non valido");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), enc.encode(`${h}.${p}`));
    if (!ok || claims.aud !== cid || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) || claims.exp * 1000 < Date.now())
      throw new Error("token non valido");
    return claims;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/account\/?/, "");
    const ip = request.headers.get("cf-connecting-ip") || "?";
    try {
      if (path === "config") return json({ google: this.env.GOOGLE_CLIENT_ID || null });
      const body = request.method === "GET" ? {} : JSON.parse((await request.text()).slice(0, MAX_BLOB + 10000) || "{}");

      if (path === "register" && request.method === "POST") {
        const email = cleanEmail(body.email), pw = String(body.password || "");
        if (!okEmail(email)) return json({ error: "Email non valida" }, 400);
        if (pw.length < 8) return json({ error: "La password deve avere almeno 8 caratteri" }, 400);
        if (this.limited(["ip:" + ip])) return json({ error: "Troppi tentativi: riprova tra un quarto d'ora" }, 429);
        if (this.one("SELECT id FROM users WHERE email = ?", email)) { this.fail(["ip:" + ip]); return json({ error: "Esiste già un account con questa email: accedi" }, 409); }
        const id = rand(12), rec = recoveryCode();
        this.sql.exec("INSERT INTO users (id, email, pw, recovery, created) VALUES (?, ?, ?, ?, ?)", id, email, await hashPw(pw), await hashPw(rec), Date.now());
        return json({ token: await this.session(id), recovery: rec, email });
      }
      if (path === "login" && request.method === "POST") {
        const email = cleanEmail(body.email), keys = ["ip:" + ip, "em:" + email];
        if (this.limited(keys)) return json({ error: "Troppi tentativi: riprova tra un quarto d'ora" }, 429);
        const u = this.one("SELECT * FROM users WHERE email = ?", email);
        if (!u || !(await checkPw(String(body.password || ""), u.pw))) {
          this.fail(keys);
          return json({ error: u && !u.pw ? "Questo account usa l'accesso con Google" : "Email o password sbagliate" }, 401);
        }
        return json({ token: await this.session(u.id), email });
      }
      if (path === "google" && request.method === "POST") {
        const c = await this.googleClaims(body.credential);
        const email = c.email_verified ? cleanEmail(c.email) : null;
        let u = this.one("SELECT * FROM users WHERE google = ?", c.sub);
        if (!u && email) {            // stessa email già registrata con password: la collego
          u = this.one("SELECT * FROM users WHERE email = ?", email);
          if (u) this.sql.exec("UPDATE users SET google = ? WHERE id = ?", c.sub, u.id);
        }
        if (!u) {
          const id = rand(12);
          this.sql.exec("INSERT INTO users (id, email, google, created) VALUES (?, ?, ?, ?)", id, email, c.sub, Date.now());
          u = { id, email };
        }
        return json({ token: await this.session(u.id), email: u.email || email, name: c.given_name || null });
      }
      if (path === "reset" && request.method === "POST") {
        const email = cleanEmail(body.email), keys = ["ip:" + ip, "rc:" + email], pw = String(body.password || "");
        if (this.limited(keys)) return json({ error: "Troppi tentativi: riprova tra un quarto d'ora" }, 429);
        if (pw.length < 8) return json({ error: "La password deve avere almeno 8 caratteri" }, 400);
        const u = this.one("SELECT * FROM users WHERE email = ?", email);
        const code = String(body.recovery || "").trim().toUpperCase().replace(/[^0-9A-F]/g, "").match(/.{1,4}/g)?.join("-") || "";
        if (!u || !(await checkPw(code, u.recovery))) { this.fail(keys); return json({ error: "Email o codice di recupero sbagliati" }, 401); }
        const rec = recoveryCode();
        this.sql.exec("UPDATE users SET pw = ?, recovery = ? WHERE id = ?", await hashPw(pw), await hashPw(rec), u.id);
        this.sql.exec("DELETE FROM sessions WHERE uid = ?", u.id);
        return json({ token: await this.session(u.id), recovery: rec, email });
      }

      const u = await this.user(request);
      if (!u) return json({ error: "Accesso scaduto: accedi di nuovo" }, 401);
      if (path === "me") {
        const d = this.one("SELECT updated, length(blob) AS size FROM data WHERE uid = ?", u.id);
        return json({ email: u.email, google: !!u.google, password: !!u.pw, updated: d?.updated || 0, size: d?.size || 0 });
      }
      if (path === "data" && request.method === "GET") {
        const d = this.one("SELECT blob, updated FROM data WHERE uid = ?", u.id);
        return json({ blob: d?.blob || null, updated: d?.updated || 0 });
      }
      if (path === "data" && request.method === "PUT") {
        const blob = typeof body.blob === "string" ? body.blob : JSON.stringify(body.blob || {});
        if (blob.length > MAX_BLOB) return json({ error: "Dati troppo grandi" }, 413);
        const cur = this.one("SELECT updated FROM data WHERE uid = ?", u.id);
        if (cur && body.base != null && cur.updated > Number(body.base)) return json({ updated: cur.updated, conflict: true }, 409);
        const now = Math.max(Date.now(), (cur?.updated || 0) + 1);
        this.sql.exec("INSERT OR REPLACE INTO data (uid, blob, updated) VALUES (?, ?, ?)", u.id, blob, now);
        return json({ updated: now });
      }
      if (path === "password" && request.method === "POST") {
        if (u.pw && !(await checkPw(String(body.old || ""), u.pw))) return json({ error: "La password attuale è sbagliata" }, 401);
        if (String(body.password || "").length < 8) return json({ error: "La password deve avere almeno 8 caratteri" }, 400);
        if (!u.email) return json({ error: "Account senza email" }, 400);
        const rec = u.recovery ? null : recoveryCode();
        this.sql.exec("UPDATE users SET pw = ?" + (rec ? ", recovery = ?" : "") + " WHERE id = ?", ...(rec ? [await hashPw(body.password), await hashPw(rec), u.id] : [await hashPw(body.password), u.id]));
        return json({ ok: true, recovery: rec });
      }
      if (path === "logout" && request.method === "POST") { this.sql.exec("DELETE FROM sessions WHERE token = ?", u.token); return json({ ok: true }); }
      if (path === "delete" && request.method === "POST") {
        if (u.pw && !(await checkPw(String(body.password || ""), u.pw))) return json({ error: "Password sbagliata" }, 401);
        this.sql.exec("DELETE FROM sessions WHERE uid = ?", u.id);
        this.sql.exec("DELETE FROM data WHERE uid = ?", u.id);
        this.sql.exec("DELETE FROM users WHERE id = ?", u.id);
        return json({ ok: true });
      }
      return json({ error: "richiesta sconosciuta" }, 404);
    } catch (e) {
      return json({ error: e?.message || "errore" }, 400);
    }
  }
}
