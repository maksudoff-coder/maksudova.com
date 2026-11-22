/* Tutor Maksudova — server API (Cloudflare Pages Functions + D1)
   /api/auth/*   sign-in, sessions and accounts (passwords are hashed with PBKDF2)
   /api/db/*     a small document store; every read and write is checked by the rules below */

const PBKDF2_ITER = 20000;
const DAY = 86400000;

let ready = null;
function schema(env){
  if(!ready) ready = env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, parent TEXT NOT NULL, data TEXT NOT NULL, updated INTEGER NOT NULL)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS docs_parent ON docs(parent)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS users (uid TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL, ref TEXT, gen INTEGER NOT NULL DEFAULT 1, created INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS fails (login TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)")
  ]).catch(e => { ready = null; throw e; });
  return ready;
}

/* ---------------- helpers ---------------- */
const enc = new TextEncoder();
function json(o, status){ return new Response(JSON.stringify(o), { status: status || 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }); }
function fail(status, msg, code){ return json({ error: msg, code: code || "" }, status); }
function b64u(buf){ let s = btoa(String.fromCharCode(...new Uint8Array(buf))); return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64uStr(str){ return b64u(enc.encode(str)); }
function unb64u(s){ s = s.replace(/-/g, "+").replace(/_/g, "/"); while(s.length % 4) s += "="; return atob(s); }
function rid(n){ const a = new Uint8Array(n || 15); crypto.getRandomValues(a); return b64u(a).slice(0, 20); }
function safeEq(a, b){ if(a.length !== b.length) return false; let r = 0; for(let i=0;i<a.length;i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function hashPw(pass, salt){
  const key = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: PBKDF2_ITER }, key, 256);
  return b64u(bits);
}
async function hmac(secret, msg){
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
async function makeToken(env, user, remember){
  const body = b64uStr(JSON.stringify({ u: user.uid, g: user.gen, e: Date.now() + (remember === false ? DAY : 60 * DAY) }));
  return body + "." + await hmac(env.SESSION_SECRET, body);
}
async function userFromToken(env, req){
  const h = req.headers.get("authorization") || "", t = h.startsWith("Bearer ") ? h.slice(7) : "";
  if(!t || t.indexOf(".") < 0) return null;
  const [body, sig] = t.split(".");
  if(!safeEq(sig, await hmac(env.SESSION_SECRET, body))) return null;
  let p; try{ p = JSON.parse(unb64u(body)); }catch(e){ return null; }
  if(!p || p.e < Date.now()) return null;
  const u = await env.DB.prepare("SELECT uid, login, role, ref, gen FROM users WHERE uid = ?").bind(p.u).first();
  if(!u || u.gen !== p.g) return null;
  return u;
}
function pub(u){ return { uid: u.uid, login: u.login, role: u.role, sid: u.role === "student" ? u.ref : null, tid: u.role === "teacher" ? u.ref : null }; }
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

/* ---------------- documents ---------------- */
function parentOf(path){ const s = path.split("/"); s.pop(); return s.join("/"); }
function validPath(p, isDoc){ if(typeof p !== "string" || !p || p.length > 300 || p.startsWith("/") || p.endsWith("/") || p.indexOf("//") >= 0) return false; const n = p.split("/").length; return isDoc ? n % 2 === 0 : n % 2 === 1; }
async function getDoc(env, path){ const r = await env.DB.prepare("SELECT data FROM docs WHERE path = ?").bind(path).first(); return r ? JSON.parse(r.data) : null; }
function isPlain(v){ return v && typeof v === "object" && !Array.isArray(v) && !v.__fv; }
function applyOps(base, patch, deep){
  const out = Object.assign({}, base || {});
  for(const k of Object.keys(patch)){
    const v = patch[k];
    if(v && typeof v === "object" && v.__fv){
      if(v.__fv === "del") delete out[k];
      else if(v.__fv === "inc") out[k] = (typeof out[k] === "number" ? out[k] : 0) + (+v.n || 0);
      else if(v.__fv === "union"){ const a = Array.isArray(out[k]) ? out[k].slice() : []; (v.v || []).forEach(x => { if(!a.some(y => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); out[k] = a; }
    } else if(deep && isPlain(v) && isPlain(out[k])) out[k] = applyOps(out[k], v, true);
    else out[k] = isPlain(v) ? applyOps({}, v, true) : v;
  }
  return out;
}

/* ---------------- rules ---------------- */
function Ctx(env, u){
  const cache = {};
  const c = {
    u, owner: !!u && u.role === "owner", teacher: !!u && u.role === "teacher", student: !!u && u.role === "student", signed: !!u,
    async stTeacher(sid){ if(!(sid in cache)){ const d = await getDoc(env, "students/" + sid); cache[sid] = d ? (d.teacherId || "") : null; } return cache[sid]; },
    async mgr(sid){ if(c.owner) return true; if(!c.teacher) return false; const t = await c.stTeacher(sid); return t !== null && t === u.ref; },
    self(sid){ return c.student && u.ref === sid; }
  };
  return c;
}
async function canRead(c, path, data){
  const s = path.split("/"), col = s[0], id = s[1];
  switch(col){
    case "site": return id === "public" || c.signed;
    case "private": return c.owner;
    case "teachers": return c.owner || (c.teacher && id === c.u.ref);
    case "students": return c.self(id) || await c.mgr(id);
    case "topics": case "assignments": return c.signed;
    case "quizzes": if(s.length === 2) return c.signed; return c.self(s[3]) || await c.mgr(s[3]);
    case "posts": return c.owner || !!(data && data.published);
    case "postImages": return true;
    case "consents": return c.self(id) || await c.mgr(id);
    case "billing": case "bookings": case "outbox": return c.owner;
    case "reviews": return c.owner || !!(data && data.approved);
    case "chats": case "boards": return c.self(id) || await c.mgr(id);
  }
  return false;
}
function ownTeacherItem(c, before, after){ return c.owner || (c.teacher && (!before || before.teacherId === c.u.ref) && (!after || after.teacherId === c.u.ref)); }
async function canWrite(c, path, before, after){
  const s = path.split("/"), col = s[0], id = s[1];
  switch(col){
    case "site": case "private": case "teachers": case "posts": case "postImages": case "billing": return c.owner;
    case "students":
      if(s.length > 2) return c.self(id) || await c.mgr(id);
      if(c.owner) return true;
      if(c.teacher) return ownTeacherItem(c, before, after);
      if(c.self(id) && before && after){ const keys = new Set(Object.keys(before).concat(Object.keys(after))); for(const k of keys){ if(k !== "lastActive" && JSON.stringify(before[k]) !== JSON.stringify(after[k])) return false; } return true; }
      return false;
    case "topics": case "assignments": return ownTeacherItem(c, before, after);
    case "quizzes":
      if(s.length === 2) return ownTeacherItem(c, before, after);
      if(c.self(s[3])) return !!after;
      return await c.mgr(s[3]);
    case "consents": if(!before && after) return true; return await c.mgr(id);
    case "reviews": if(!before && after) return after.approved !== true || c.owner; return c.owner;
    case "bookings": if(!before && after) return true; return c.owner;
    case "outbox": if(!before && after) return c.signed; return c.owner;
    case "chats": case "boards": return c.self(id) || await c.mgr(id);
  }
  return false;
}

/* ---------------- handlers ---------------- */
async function readBody(req){ try{ return await req.json(); }catch(e){ return {}; } }
async function siteLogin(env){ const s = await getDoc(env, "site/public"); return (s && s.teacherLogin) || "teacher"; }
async function ownerExists(env){ return !!(await env.DB.prepare("SELECT uid FROM users WHERE role = 'owner' LIMIT 1").first()); }
async function newUser(env, login, pass, role, ref){
  login = String(login || "").trim().toLowerCase();
  if(!LOGIN_RE.test(login)) throw { status: 400, msg: "Login: 3 to 30 characters, only letters, numbers, dots, dashes or underscores." };
  if(String(pass || "").length < 6) throw { status: 400, msg: "The password should be at least 6 characters.", code: "auth/weak-password" };
  if(await env.DB.prepare("SELECT uid FROM users WHERE login = ?").bind(login).first()) throw { status: 409, msg: "This login is already taken. Choose another one.", code: "auth/login-taken" };
  const uid = rid(), salt = rid();
  await env.DB.prepare("INSERT INTO users (uid, login, salt, hash, role, ref, gen, created) VALUES (?,?,?,?,?,?,1,?)").bind(uid, login, salt, await hashPw(pass, salt), role, ref || null, Date.now()).run();
  return { uid, login, role, ref: ref || null, gen: 1 };
}

async function auth(env, req, action, u){
  const b = req.method === "POST" ? await readBody(req) : {};
  if(action === "login"){
    const login = String(b.login || "").trim().toLowerCase(), now = Date.now();
    const f = await env.DB.prepare("SELECT n, until FROM fails WHERE login = ?").bind(login).first();
    if(f && f.n >= 8 && f.until > now) return fail(429, "Too many attempts. Please wait a few minutes and try again.", "auth/too-many-requests");
    const row = await env.DB.prepare("SELECT * FROM users WHERE login = ?").bind(login).first();
    if(!row){
      if(!(await ownerExists(env)) && login === await siteLogin(env)) return json({ setup: true });
      await env.DB.prepare("INSERT INTO fails (login, n, until) VALUES (?, 1, ?) ON CONFLICT(login) DO UPDATE SET n = CASE WHEN until < ? THEN 1 ELSE n + 1 END, until = ?").bind(login, now + 15*60000, now, now + 15*60000).run();
      return json({ ok: false });
    }
    if(!safeEq(row.hash, await hashPw(String(b.pass || ""), row.salt))){
      await env.DB.prepare("INSERT INTO fails (login, n, until) VALUES (?, 1, ?) ON CONFLICT(login) DO UPDATE SET n = CASE WHEN until < ? THEN 1 ELSE n + 1 END, until = ?").bind(login, now + 15*60000, now, now + 15*60000).run();
      return json({ ok: false });
    }
    await env.DB.prepare("DELETE FROM fails WHERE login = ?").bind(login).run();
    return json({ ok: true, token: await makeToken(env, row, b.remember), user: pub(row) });
  }
  if(action === "setup"){
    if(await ownerExists(env)) return fail(403, "The teacher account already exists.");
    const login = String(b.login || "").trim().toLowerCase();
    if(login !== await siteLogin(env)) return fail(403, "Use the teacher login.");
    const row = await newUser(env, login, b.pass, "owner", null);
    return json({ ok: true, token: await makeToken(env, row, b.remember), user: pub(row) });
  }
  if(action === "exists"){
    if(!u || u.role === "student") return fail(403, "You don't have permission to do that.", "permission-denied");
    const login = String(b.login || "").trim().toLowerCase();
    const taken = !!(await env.DB.prepare("SELECT uid FROM users WHERE login = ?").bind(login).first()) || (!(await ownerExists(env)) && login === await siteLogin(env));
    return json({ taken });
  }
  if(!u) return fail(401, "Please sign in again.", "unauthenticated");
  const c = Ctx(env, u);
  if(action === "me") return json({ user: pub(u) });
  if(action === "create"){
    const role = b.role === "teacher" ? "teacher" : "student";
    if(role === "teacher" && !c.owner) return fail(403, "You don't have permission to do that.", "permission-denied");
    if(role === "student" && !(c.owner || c.teacher)) return fail(403, "You don't have permission to do that.", "permission-denied");
    if(!b.ref || typeof b.ref !== "string" || b.ref.length > 40) return fail(400, "Missing record id.");
    const row = await newUser(env, b.login, b.pass, role, b.ref);
    return json({ uid: row.uid });
  }
  // target: someone else's account (by uid) or the caller's own
  let target = u;
  if(b.uid && b.uid !== u.uid){
    target = await env.DB.prepare("SELECT uid, login, role, ref, gen FROM users WHERE uid = ?").bind(b.uid).first();
    if(!target) return fail(404, "Account not found.");
    const ok = c.owner ? target.role !== "owner" : (c.teacher && target.role === "student" && await c.mgr(target.ref));
    if(!ok) return fail(403, "You don't have permission to do that.", "permission-denied");
  }
  if(action === "password"){
    const pass = String(b.pass || "");
    if(pass.length < 6) return fail(400, "The password should be at least 6 characters.", "auth/weak-password");
    const salt = rid();
    await env.DB.prepare("UPDATE users SET salt = ?, hash = ?, gen = gen + 1 WHERE uid = ?").bind(salt, await hashPw(pass, salt), target.uid).run();
    if(target.uid === u.uid){ const row = await env.DB.prepare("SELECT * FROM users WHERE uid = ?").bind(u.uid).first(); return json({ ok: true, token: await makeToken(env, row, b.remember) }); }
    return json({ ok: true });
  }
  if(action === "login-name"){
    const login = String(b.login || "").trim().toLowerCase();
    if(!LOGIN_RE.test(login)) return fail(400, "Login: 3 to 30 characters, only letters, numbers, dots, dashes or underscores.");
    const other = await env.DB.prepare("SELECT uid FROM users WHERE login = ?").bind(login).first();
    if(other && other.uid !== target.uid) return fail(409, "This login is already taken. Choose another one.", "auth/login-taken");
    await env.DB.prepare("UPDATE users SET login = ? WHERE uid = ?").bind(login, target.uid).run();
    return json({ ok: true });
  }
  if(action === "delete"){
    if(target.uid === u.uid) return fail(400, "You can't delete your own account here.");
    await env.DB.prepare("DELETE FROM users WHERE uid = ?").bind(target.uid).run();
    return json({ ok: true });
  }
  return fail(404, "Unknown action.");
}

async function dbApi(env, req, action, u){
  const b = await readBody(req), c = Ctx(env, u);
  if(action === "get"){
    if(!validPath(b.path, true)) return fail(400, "Bad path.");
    const data = await getDoc(env, b.path);
    if(!(await canRead(c, b.path, data))) return fail(403, "You don't have permission to do that.", "permission-denied");
    return json({ exists: !!data, data });
  }
  if(action === "query"){
    if(!validPath(b.path, false)) return fail(400, "Bad path.");
    const rows = (await env.DB.prepare("SELECT path, data FROM docs WHERE parent = ?").bind(b.path).all()).results || [];
    let docs = rows.map(r => ({ id: r.path.slice(b.path.length + 1), data: JSON.parse(r.data), path: r.path }));
    (b.where || []).forEach(w => { docs = docs.filter(d => JSON.stringify(d.data[w[0]]) === JSON.stringify(w[1])); });
    const out = [];
    for(const d of docs){ if(await canRead(c, d.path, d.data)) out.push({ id: d.id, data: d.data }); }
    if(b.orderBy){ const f = b.orderBy; out.sort((x, y) => (x.data[f] > y.data[f] ? 1 : x.data[f] < y.data[f] ? -1 : 0)); }
    let res = out;
    if(b.last) res = out.slice(-b.last); else if(b.limit) res = out.slice(0, b.limit);
    return json({ docs: res });
  }
  if(action === "write"){
    const ops = Array.isArray(b.ops) ? b.ops : [];
    if(!ops.length || ops.length > 500) return fail(400, "Bad write.");
    const state = {}, stmts = [], now = Date.now();
    for(const op of ops){
      if(!validPath(op.path, true)) return fail(400, "Bad path.");
      const before = op.path in state ? state[op.path] : await getDoc(env, op.path);
      let after;
      if(op.op === "delete") after = null;
      else if(op.op === "update"){ if(!before) return fail(404, "No document to update.", "not-found"); after = applyOps(before, op.data || {}, false); }
      else if(op.op === "set") after = op.merge ? applyOps(before, op.data || {}, true) : applyOps({}, op.data || {}, true);
      else return fail(400, "Bad write.");
      if(after && JSON.stringify(after).length > 1500000) return fail(400, "That is too large to save.");
      if(!(await canWrite(c, op.path, before, after))) return fail(403, "You don't have permission to do that.", "permission-denied");
      state[op.path] = after;
    }
    for(const p of Object.keys(state)){
      if(state[p] === null) stmts.push(env.DB.prepare("DELETE FROM docs WHERE path = ?").bind(p));
      else stmts.push(env.DB.prepare("INSERT INTO docs (path, parent, data, updated) VALUES (?,?,?,?) ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated = excluded.updated").bind(p, parentOf(p), JSON.stringify(state[p]), now));
    }
    await env.DB.batch(stmts);
    return json({ ok: true });
  }
  return fail(404, "Unknown action.");
}

export async function onRequest(ctx){
  const { request: req, env, params } = ctx;
  const parts = [].concat(params.path || []);
  try{
    if(!env.DB || !env.SESSION_SECRET) return fail(503, "The server is not set up yet.", "unavailable");
    await schema(env);
    const u = await userFromToken(env, req);
    if(parts[0] === "auth") return await auth(env, req, parts[1], u);
    if(parts[0] === "db" && req.method === "POST") return await dbApi(env, req, parts[1], u);
    return fail(404, "Not found.");
  }catch(e){
    if(e && e.status) return fail(e.status, e.msg, e.code);
    return fail(500, "Something went wrong on the server. Please try again.", "internal");
  }
}
