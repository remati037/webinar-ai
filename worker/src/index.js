// ============================================================
// Uzivo deo vebinara.
//
//   POST /ulaz                      ime + email -> ulaznica (potpisan token)
//   GET  /ws?t=ULAZNICA             WebSocket ucesnika (chat, objave, ankete)
//   GET  /ws-studio?k=KLJUC         WebSocket tima (/studio)
//   GET  /stream/ULAZNICA/live.m3u8 "live" playlista: samo ono sto je vec emitovano
//   GET  /stream/ULAZNICA/s/IME.ts  deo videa, samo ako je njegovo vreme proslo
//   GET  /studio/stats?k=KLJUC      analitika gledanja
//
// Sve stanje je u jednom Durable Object-u (Soba), sa SQLite bazom.
// Konekcije koriste hibernaciju: dok niko nista ne salje, Soba spava i ne kosta.
// ============================================================

import { DurableObject } from "cloudflare:workers";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(telo, status = 200, dodatno = {}) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...dodatno },
  });
}

// ---------- ulaznica (HMAC potpis) ----------

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlTekst = (s) => b64url(enc.encode(s));
function izB64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
}

let _kljuc = null;
async function hmacKljuc(env) {
  if (!_kljuc) {
    if (!env.LIVE_TAJNA) throw new Error("LIVE_TAJNA nije podesena");
    _kljuc = await crypto.subtle.importKey("raw", enc.encode(env.LIVE_TAJNA), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }
  return _kljuc;
}

async function potpis(env, telo) {
  return b64url(await crypto.subtle.sign("HMAC", await hmacKljuc(env), enc.encode(telo))).slice(0, 32);
}

async function napraviUlaznicu(env, podaci) {
  const telo = b64urlTekst(JSON.stringify(podaci));
  return `${telo}.${await potpis(env, telo)}`;
}

async function proveriUlaznicu(env, ulaznica) {
  if (!ulaznica || typeof ulaznica !== "string") return null;
  const [telo, sig] = ulaznica.split(".");
  if (!telo || !sig) return null;
  const ocekivan = await potpis(env, telo);
  if (ocekivan.length !== sig.length) return null;
  let r = 0;
  for (let i = 0; i < sig.length; i++) r |= sig.charCodeAt(i) ^ ocekivan.charCodeAt(i);
  if (r !== 0) return null;
  try { return JSON.parse(izB64url(telo)); } catch { return null; }
}

function istiKljuc(a, b) {
  a = String(a || ""); b = String(b || "");
  if (!a || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function uidZaEmail(email) {
  const h = await crypto.subtle.digest("SHA-256", enc.encode(email));
  return [...new Uint8Array(h)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ocisti = (v, maks = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, maks);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function uredjaj(ua) {
  const s = String(ua || "");
  if (/ipad|tablet|(android(?!.*mobile))/i.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(s)) return "mobilni";
  return "racunar";
}

// ---------- video: playlista iz R2 ----------

let _video = null; // { segmenti: [{uri, dur, od}], ukupno, target }
let _videoVreme = 0;

async function ucitajVideo(env) {
  if (_video && Date.now() - _videoVreme < 60_000) return _video;
  const obj = await env.VIDEO.get("video/index.m3u8");
  if (!obj) return null;
  const tekst = await obj.text();
  const segmenti = [];
  let dur = 0, od = 0, target = 6;
  for (const red of tekst.split("\n").map((r) => r.trim())) {
    if (red.startsWith("#EXT-X-TARGETDURATION:")) target = parseInt(red.split(":")[1], 10) || 6;
    else if (red.startsWith("#EXTINF:")) dur = parseFloat(red.slice(8));
    else if (red && !red.startsWith("#")) {
      segmenti.push({ uri: red, dur, od });
      od += dur;
    }
  }
  _video = { segmenti, ukupno: od, target };
  _videoVreme = Date.now();
  return _video;
}

let _cfg = null;
let _cfgVreme = 0;
async function javnaPodesavanja(env) {
  if (_cfg && Date.now() - _cfgVreme < 5_000) return _cfg;
  const stub = env.SOBA.get(env.SOBA.idFromName("glavna"));
  _cfg = await (await stub.fetch("https://soba/cfg")).json();
  _cfgVreme = Date.now();
  return _cfg;
}

const PROZOR = 5; // koliko delova je u "live" playlisti

async function playlista(env) {
  const video = await ucitajVideo(env);
  if (!video) return new Response("nema", { status: 404, headers: CORS });
  const cfg = await javnaPodesavanja(env);
  const proteklo = (Date.now() - cfg.start) / 1000;
  if (proteklo < 0) return new Response("jos nije pocelo", { status: 404, headers: { ...CORS, "Cache-Control": "no-store" } });

  const zavrseno = proteklo >= video.ukupno;
  // Deo je "emitovan" cim je njegov pocetak prosao, kao kod pravog prenosa.
  let poslednji = video.segmenti.findIndex((s) => s.od > proteklo) - 1;
  if (poslednji < 0) poslednji = video.segmenti.length - 1;
  const prvi = Math.max(0, poslednji - PROZOR + 1);

  let out = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${video.target}\n#EXT-X-MEDIA-SEQUENCE:${prvi}\n`;
  for (let i = prvi; i <= poslednji; i++) {
    const s = video.segmenti[i];
    out += `#EXTINF:${s.dur.toFixed(3)},\ns/${s.uri}\n`;
  }
  if (zavrseno) out += "#EXT-X-ENDLIST\n";
  return new Response(out, {
    headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "no-store" },
  });
}

async function deoVidea(env, ime, request, ctx) {
  const video = await ucitajVideo(env);
  if (!video) return new Response("nema", { status: 404, headers: CORS });
  const seg = video.segmenti.find((s) => s.uri === ime);
  if (!seg) return new Response("nema", { status: 404, headers: CORS });
  const cfg = await javnaPodesavanja(env);
  const proteklo = (Date.now() - cfg.start) / 1000;
  if (seg.od > proteklo + 2) return new Response("nema", { status: 404, headers: CORS });

  // Kes na ivici: isti deo gleda hiljade ljudi u istom trenutku.
  const cache = caches.default;
  const kesKljuc = new Request(new URL(`/__seg/${ime}`, request.url).toString());
  let odg = await cache.match(kesKljuc);
  if (!odg) {
    const obj = await env.VIDEO.get(`video/${ime}`);
    if (!obj) return new Response("nema", { status: 404, headers: CORS });
    odg = new Response(obj.body, { headers: { "Content-Type": "video/mp2t", "Cache-Control": "public, max-age=86400" } });
    ctx.waitUntil(cache.put(kesKljuc, odg.clone()));
  }
  return new Response(odg.body, { headers: { ...CORS, "Content-Type": "video/mp2t", "Cache-Control": "private, max-age=3600" } });
}

// ---------- Neon (opciono) ----------

async function upisiUNeon(env, p) {
  if (!env.DATABASE_URL) return;
  try {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(env.DATABASE_URL);
    await sql`
      INSERT INTO uzivo_ucesnici (vebinar, uid, ime, email, uredjaj, izvor, prijava_id)
      VALUES (${env.VEBINAR_ID || "2026-11-16"}, ${p.uid}, ${p.ime}, ${p.email}, ${p.uredjaj}, ${p.izvor || null},
              (SELECT id FROM prijave WHERE email = ${p.email} ORDER BY kreirano DESC LIMIT 1))
      ON CONFLICT (vebinar, email) DO UPDATE SET poslednji_ulaz = NOW(), ulazaka = uzivo_ucesnici.ulazaka + 1`;
  } catch (e) {
    console.log("Neon upis nije uspeo:", e.message);
  }
}

// ---------- ruter ----------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    try {
      if (p === "/ulaz" && request.method === "POST") {
        const telo = await request.json().catch(() => ({}));
        const ime = ocisti(telo.ime, 60);
        const email = ocisti(telo.email, 160).toLowerCase();
        if (ime.length < 2) return json({ ok: false, poruka: "Upiši ime." }, 400);
        if (!EMAIL_RE.test(email)) return json({ ok: false, poruka: "Email adresa nije ispravna." }, 400);
        const uid = await uidZaEmail(email);
        const podaci = { u: uid, i: ime, e: email, d: uredjaj(request.headers.get("user-agent")), z: ocisti(telo.izvor, 60) };
        const ulaznica = await napraviUlaznicu(env, podaci);
        ctx.waitUntil(upisiUNeon(env, { uid, ime, email, uredjaj: podaci.d, izvor: podaci.z }));
        return json({ ok: true, ulaznica, ime });
      }

      if (p === "/ws") {
        if (request.headers.get("Upgrade") !== "websocket") return new Response("ocekuje websocket", { status: 426 });
        const podaci = await proveriUlaznicu(env, url.searchParams.get("t"));
        if (!podaci) return new Response("neispravna ulaznica", { status: 401 });
        const stub = env.SOBA.get(env.SOBA.idFromName("glavna"));
        const h = new Headers(request.headers);
        h.set("x-ucesnik", b64urlTekst(JSON.stringify(podaci)));
        return stub.fetch(new Request("https://soba/ws", { headers: h }));
      }

      if (p === "/ws-studio") {
        if (request.headers.get("Upgrade") !== "websocket") return new Response("ocekuje websocket", { status: 426 });
        if (!istiKljuc(url.searchParams.get("k"), env.STUDIO_KLJUC)) return new Response("pogresna sifra", { status: 401 });
        const stub = env.SOBA.get(env.SOBA.idFromName("glavna"));
        return stub.fetch(new Request("https://soba/ws-studio", { headers: request.headers }));
      }

      if (p === "/studio/stats") {
        if (!istiKljuc(url.searchParams.get("k"), env.STUDIO_KLJUC)) return json({ ok: false }, 401);
        const stub = env.SOBA.get(env.SOBA.idFromName("glavna"));
        const video = await ucitajVideo(env);
        const odg = await stub.fetch(`https://soba/stats?trajanje=${video ? video.ukupno : 0}`);
        return json(await odg.json());
      }

      if (p === "/studio/proveri") {
        return json({ ok: istiKljuc(url.searchParams.get("k"), env.STUDIO_KLJUC) });
      }

      const m = p.match(/^\/stream\/([^/]+)\/(live\.m3u8|s\/([\w.-]+\.ts))$/);
      if (m) {
        if (!(await proveriUlaznicu(env, decodeURIComponent(m[1])))) return new Response("ne", { status: 401, headers: CORS });
        if (m[2] === "live.m3u8") return playlista(env);
        return deoVidea(env, m[3], request, ctx);
      }

      if (p === "/") return new Response("ok", { headers: CORS });
      return new Response("nema", { status: 404, headers: CORS });
    } catch (e) {
      console.log("greska", e.stack || e.message);
      return json({ ok: false, poruka: "Greška na serveru." }, 500);
    }
  },
};

// ============================================================
// Soba: jedan Durable Object za ceo vebinar
// ============================================================

const PODRAZUMEVANO = {
  naslov: "Besplatna radionica: Nađi nišu za digitalni proizvod",
  voditelj: "Vladimir Stanković",
  // 16.11.2026. u 18:58 po beogradskom vremenu (UTC+1)
  start: Date.parse("2026-11-16T17:58:00Z"),
  vrata: 30, // koliko minuta pre pocetka se otvara cekaonica (pre toga: "jos nije otvoreno")
  dobrodoslica: "Zdravo {ime}, dobro došao/la! 👋 Ako imaš pitanje tokom radionice, piši ovde. Tim odgovara uživo.",
  dobrodoslicaOd: "Marko",
  ponuda: {
    naslov: "InfoCash program",
    opis: "Specijalna ponuda samo za učesnike radionice.",
    link: "",
    dugme: "Želim da se prijavim",
  },
  autoPonudaMinut: null, // minut snimka kad se ponuda sama pojavi ako je niko ne posalje rucno
  krajPoruka: "Radionica je završena. Hvala što si bio/la sa nama!",
};

export class Soba extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS ucesnici (
        uid TEXT PRIMARY KEY, ime TEXT, email TEXT, uredjaj TEXT, izvor TEXT,
        prvi INTEGER, poslednji INTEGER, klik INTEGER DEFAULT 0, reakcije INTEGER DEFAULT 0,
        neprocitano INTEGER DEFAULT 0, poslednja_poruka INTEGER
      );
      CREATE TABLE IF NOT EXISTS intervali (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, od INTEGER, do_ INTEGER);
      CREATE INDEX IF NOT EXISTS intervali_uid ON intervali(uid);
      CREATE TABLE IF NOT EXISTS poruke (
        id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT, ko TEXT, ime_tima TEXT, tekst TEXT, ts INTEGER
      );
      CREATE INDEX IF NOT EXISTS poruke_uid ON poruke(uid, id);
      CREATE TABLE IF NOT EXISTS objave (id INTEGER PRIMARY KEY AUTOINCREMENT, vrsta TEXT, tekst TEXT, podaci TEXT, ts INTEGER, od TEXT);
      CREATE TABLE IF NOT EXISTS ankete (id INTEGER PRIMARY KEY AUTOINCREMENT, pitanje TEXT, opcije TEXT, ts INTEGER, zatvorena INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS glasovi (anketa INTEGER, uid TEXT, opcija INTEGER, PRIMARY KEY (anketa, uid));
      CREATE TABLE IF NOT EXISTS reakcije (e TEXT, minut INTEGER, broj INTEGER, PRIMARY KEY (e, minut));
    `);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async cfg() {
    return { ...PODRAZUMEVANO, ...((await this.ctx.storage.get("cfg")) || {}) };
  }

  async trajanje() {
    const v = await ucitajVideo(this.env);
    return v ? v.ukupno : 0;
  }

  async javniCfg() {
    const c = await this.cfg();
    return {
      naslov: c.naslov, voditelj: c.voditelj, start: c.start, vrata: c.vrata,
      trajanje: await this.trajanje(), autoPonudaMinut: c.autoPonudaMinut, krajPoruka: c.krajPoruka,
      ponuda: c.ponuda,
    };
  }

  // ---------- HTTP ulaz u sobu ----------

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/cfg") return Response.json(await this.javniCfg());

    if (url.pathname === "/stats") return Response.json(await this.statistika(Number(url.searchParams.get("trajanje")) || 0));

    if (url.pathname === "/ws") {
      const u = JSON.parse(izB64url(request.headers.get("x-ucesnik")));
      const sad = Date.now();
      const postoji = this.sql.exec("SELECT uid FROM ucesnici WHERE uid = ?", u.u).toArray().length > 0;
      if (postoji) {
        this.sql.exec("UPDATE ucesnici SET ime = ?, poslednji = ? WHERE uid = ?", u.i, sad, u.u);
      } else {
        this.sql.exec("INSERT INTO ucesnici (uid, ime, email, uredjaj, izvor, prvi, poslednji) VALUES (?,?,?,?,?,?,?)",
          u.u, u.i, u.e, u.d || null, u.z || null, sad, sad);
        const c = await this.cfg();
        if (c.dobrodoslica) {
          const tekst = c.dobrodoslica.replaceAll("{ime}", u.i.split(" ")[0]);
          this.sql.exec("INSERT INTO poruke (uid, ko, ime_tima, tekst, ts) VALUES (?,?,?,?,?)", u.u, "t", c.dobrodoslicaOd, tekst, sad);
        }
      }
      const iv = this.sql.exec("INSERT INTO intervali (uid, od, do_) VALUES (?,?,?) RETURNING id", u.u, sad, sad).one().id;

      const [klijent, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ["u", `u:${u.u}`]);
      server.serializeAttachment({ uid: u.u, ime: u.i, iv, z: 0 });
      server.send(JSON.stringify(await this.initUcesnik(u.u)));
      if (!postoji) this.studiju({ t: "ucesnik", u: this.ucesnikZaStudio(u.u) });
      this.javiBroj();
      return new Response(null, { status: 101, webSocket: klijent });
    }

    if (url.pathname === "/ws-studio") {
      const [klijent, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ["s"]);
      server.serializeAttachment({ studio: true });
      server.send(JSON.stringify(await this.initStudio()));
      return new Response(null, { status: 101, webSocket: klijent });
    }

    return new Response("nema", { status: 404 });
  }

  async initUcesnik(uid) {
    const poruke = this.sql.exec("SELECT id, ko, ime_tima, tekst, ts FROM poruke WHERE uid = ? ORDER BY id DESC LIMIT 100", uid).toArray().reverse();
    const objave = this.sql.exec("SELECT id, vrsta, tekst, podaci, ts, od FROM objave ORDER BY id DESC LIMIT 30").toArray().reverse().map(this.objavaZaSlanje);
    const anketa = this.aktivnaAnketa();
    let glasao = null;
    if (anketa) {
      const g = this.sql.exec("SELECT opcija FROM glasovi WHERE anketa = ? AND uid = ?", anketa.id, uid).toArray();
      glasao = g.length ? g[0].opcija : null;
    }
    return { t: "init", sad: Date.now(), cfg: await this.javniCfg(), poruke, objave, anketa, glasao };
  }

  objavaZaSlanje(o) {
    return { id: o.id, vrsta: o.vrsta, tekst: o.tekst, podaci: o.podaci ? JSON.parse(o.podaci) : null, ts: o.ts, od: o.od };
  }

  aktivnaAnketa() {
    const r = this.sql.exec("SELECT id, pitanje, opcije FROM ankete WHERE zatvorena = 0 ORDER BY id DESC LIMIT 1").toArray();
    if (!r.length) return null;
    return { id: r[0].id, pitanje: r[0].pitanje, opcije: JSON.parse(r[0].opcije) };
  }

  rezultatiAnkete(id) {
    const r = this.sql.exec("SELECT opcija, COUNT(*) AS n FROM glasovi WHERE anketa = ? GROUP BY opcija", id).toArray();
    const out = {};
    for (const x of r) out[x.opcija] = x.n;
    return out;
  }

  ucesnikZaStudio(uid) {
    const r = this.sql.exec(`
      SELECT u.uid, u.ime, u.email, u.neprocitano, u.poslednja_poruka, u.klik,
        (SELECT tekst FROM poruke p WHERE p.uid = u.uid ORDER BY id DESC LIMIT 1) AS poslednja
      FROM ucesnici u WHERE u.uid = ?`, uid).toArray();
    return r[0] || null;
  }

  async initStudio() {
    const razgovori = this.sql.exec(`
      SELECT u.uid, u.ime, u.email, u.neprocitano, u.poslednja_poruka, u.klik,
        (SELECT tekst FROM poruke p WHERE p.uid = u.uid ORDER BY id DESC LIMIT 1) AS poslednja
      FROM ucesnici u WHERE u.poslednja_poruka IS NOT NULL ORDER BY u.poslednja_poruka DESC LIMIT 2000`).toArray();
    const ankete = this.sql.exec("SELECT id, pitanje, opcije, zatvorena, ts FROM ankete ORDER BY id DESC LIMIT 20").toArray()
      .map((a) => ({ ...a, opcije: JSON.parse(a.opcije), rezultati: this.rezultatiAnkete(a.id) }));
    const objave = this.sql.exec("SELECT id, vrsta, tekst, podaci, ts, od FROM objave ORDER BY id DESC LIMIT 50").toArray().map(this.objavaZaSlanje);
    const reakcije = this.sql.exec("SELECT e, SUM(broj) AS n FROM reakcije GROUP BY e").toArray();
    return {
      t: "init", sad: Date.now(), cfg: await this.cfg(), trajanje: await this.trajanje(),
      razgovori, ankete, objave, reakcije, online: this.brojOnline(),
      ukupno: this.sql.exec("SELECT COUNT(*) AS n FROM ucesnici").one().n,
    };
  }

  // ---------- slanje ----------

  posalji(ws, poruka) {
    try { ws.send(typeof poruka === "string" ? poruka : JSON.stringify(poruka)); } catch {}
  }

  svima(poruka) {
    const s = JSON.stringify(poruka);
    for (const ws of this.ctx.getWebSockets("u")) this.posalji(ws, s);
  }

  studiju(poruka) {
    const s = JSON.stringify(poruka);
    for (const ws of this.ctx.getWebSockets("s")) this.posalji(ws, s);
  }

  ucesniku(uid, poruka) {
    const s = JSON.stringify(poruka);
    for (const ws of this.ctx.getWebSockets(`u:${uid}`)) this.posalji(ws, s);
  }

  brojOnline() {
    const set = new Set();
    for (const ws of this.ctx.getWebSockets("u")) {
      const a = ws.deserializeAttachment();
      if (a && a.uid) set.add(a.uid);
    }
    return set.size;
  }

  javiBroj() {
    // Studio dobija broj najvise jednom u 3 sekunde, da 1000 ulazaka u minuti ne zatrpa tim.
    if (this._brojZakazan) return;
    this._brojZakazan = true;
    setTimeout(() => {
      this._brojZakazan = false;
      this.studiju({ t: "online", n: this.brojOnline(), ukupno: this.sql.exec("SELECT COUNT(*) AS n FROM ucesnici").one().n });
    }, 3000);
  }

  // ---------- poruke sa konekcija ----------

  async webSocketMessage(ws, poruka) {
    let m;
    try { m = JSON.parse(poruka); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    if (a.studio) return this.odStudija(ws, m);
    return this.odUcesnika(ws, a, m);
  }

  async odUcesnika(ws, a, m) {
    const sad = Date.now();
    const uid = a.uid;
    if (!uid) return;

    if (m.t === "ziv") {
      this.sql.exec("UPDATE intervali SET do_ = ? WHERE id = ?", sad, a.iv);
      return;
    }

    if (m.t === "poruka") {
      const tekst = ocisti(m.tekst, 1000);
      if (!tekst) return;
      if (a.z && sad - a.z < 800) return; // najvise jedna poruka u sekundi
      a.z = sad;
      ws.serializeAttachment(a);
      const id = this.sql.exec("INSERT INTO poruke (uid, ko, ime_tima, tekst, ts) VALUES (?,?,?,?,?) RETURNING id", uid, "u", null, tekst, sad).one().id;
      this.sql.exec("UPDATE ucesnici SET neprocitano = neprocitano + 1, poslednja_poruka = ? WHERE uid = ?", sad, uid);
      const p = { id, uid, ko: "u", ime_tima: null, tekst, ts: sad, c: m.c };
      this.ucesniku(uid, { t: "poruka", p });
      this.studiju({ t: "poruka", p, u: this.ucesnikZaStudio(uid) });
      return;
    }

    if (m.t === "reakcija") {
      const e = ["👍", "❤️", "😂", "😮", "👏", "🔥"].includes(m.e) ? m.e : null;
      if (!e) return;
      const c = await this.cfg();
      const minut = Math.max(0, Math.floor((sad - c.start) / 60000));
      this.sql.exec("INSERT INTO reakcije (e, minut, broj) VALUES (?,?,1) ON CONFLICT(e, minut) DO UPDATE SET broj = broj + 1", e, minut);
      this.sql.exec("UPDATE ucesnici SET reakcije = reakcije + 1 WHERE uid = ?", uid);
      this.studiju({ t: "reakcija", e });
      return;
    }

    if (m.t === "glas") {
      const an = this.aktivnaAnketa();
      if (!an || an.id !== m.anketa) return;
      const opcija = Number(m.opcija);
      if (!Number.isInteger(opcija) || opcija < 0 || opcija >= an.opcije.length) return;
      this.sql.exec("INSERT INTO glasovi (anketa, uid, opcija) VALUES (?,?,?) ON CONFLICT DO NOTHING", an.id, uid, opcija);
      this.posalji(ws, { t: "glas_ok", anketa: an.id, opcija });
      this.studiju({ t: "glasovi", anketa: an.id, rezultati: this.rezultatiAnkete(an.id) });
      return;
    }

    if (m.t === "klik") {
      this.sql.exec("UPDATE ucesnici SET klik = klik + 1 WHERE uid = ?", uid);
      this.studiju({ t: "klik", uid });
      return;
    }
  }

  async odStudija(ws, m) {
    const sad = Date.now();

    if (m.t === "odgovor") {
      const tekst = ocisti(m.tekst, 2000);
      const ime = ocisti(m.ime, 40) || "Tim";
      if (!tekst || !m.uid) return;
      const id = this.sql.exec("INSERT INTO poruke (uid, ko, ime_tima, tekst, ts) VALUES (?,?,?,?,?) RETURNING id", m.uid, "t", ime, tekst, sad).one().id;
      this.sql.exec("UPDATE ucesnici SET neprocitano = 0, poslednja_poruka = ? WHERE uid = ?", sad, m.uid);
      const p = { id, uid: m.uid, ko: "t", ime_tima: ime, tekst, ts: sad };
      this.ucesniku(m.uid, { t: "poruka", p });
      this.studiju({ t: "poruka", p, u: this.ucesnikZaStudio(m.uid) });
      return;
    }

    if (m.t === "razgovor") {
      const poruke = this.sql.exec("SELECT id, uid, ko, ime_tima, tekst, ts FROM poruke WHERE uid = ? ORDER BY id", m.uid).toArray();
      const u = this.ucesnikZaStudio(m.uid);
      const online = this.ctx.getWebSockets(`u:${m.uid}`).length > 0;
      this.posalji(ws, { t: "razgovor", uid: m.uid, poruke, u, online });
      return;
    }

    if (m.t === "procitano") {
      this.sql.exec("UPDATE ucesnici SET neprocitano = 0 WHERE uid = ?", m.uid);
      this.studiju({ t: "procitano", uid: m.uid });
      return;
    }

    if (m.t === "objava" || m.t === "ponuda") {
      const c = await this.cfg();
      const vrsta = m.t === "ponuda" ? "ponuda" : "tekst";
      const tekst = vrsta === "ponuda" ? (ocisti(m.tekst, 1000) || c.ponuda.opis) : ocisti(m.tekst, 2000);
      if (!tekst) return;
      const podaci = vrsta === "ponuda" ? JSON.stringify(c.ponuda) : null;
      const od = ocisti(m.ime, 40) || c.voditelj;
      const id = this.sql.exec("INSERT INTO objave (vrsta, tekst, podaci, ts, od) VALUES (?,?,?,?,?) RETURNING id", vrsta, tekst, podaci, sad, od).one().id;
      const o = this.objavaZaSlanje({ id, vrsta, tekst, podaci, ts: sad, od });
      this.svima({ t: "objava", o });
      this.studiju({ t: "objava", o });
      return;
    }

    if (m.t === "obrisi_objavu") {
      this.sql.exec("DELETE FROM objave WHERE id = ?", m.id);
      this.svima({ t: "obrisi_objavu", id: m.id });
      this.studiju({ t: "obrisi_objavu", id: m.id });
      return;
    }

    if (m.t === "anketa") {
      const pitanje = ocisti(m.pitanje, 300);
      const opcije = (Array.isArray(m.opcije) ? m.opcije : []).map((o) => ocisti(o, 120)).filter(Boolean).slice(0, 6);
      if (!pitanje || opcije.length < 2) return;
      this.sql.exec("UPDATE ankete SET zatvorena = 1 WHERE zatvorena = 0");
      const id = this.sql.exec("INSERT INTO ankete (pitanje, opcije, ts) VALUES (?,?,?) RETURNING id", pitanje, JSON.stringify(opcije), sad).one().id;
      const an = { id, pitanje, opcije };
      this.svima({ t: "anketa", anketa: an });
      this.studiju({ t: "anketa", anketa: { ...an, zatvorena: 0, ts: sad, rezultati: {} } });
      return;
    }

    if (m.t === "anketa_zatvori") {
      this.sql.exec("UPDATE ankete SET zatvorena = 1 WHERE id = ?", m.id);
      this.svima({ t: "anketa_kraj", id: m.id, rezultati: this.rezultatiAnkete(m.id) });
      this.studiju({ t: "anketa_zatvorena", id: m.id });
      return;
    }

    if (m.t === "cfg") {
      const staro = await this.cfg();
      const novo = { ...staro };
      for (const k of ["naslov", "voditelj", "dobrodoslica", "dobrodoslicaOd", "krajPoruka"]) {
        if (typeof m.cfg[k] === "string") novo[k] = m.cfg[k].slice(0, 1000);
      }
      if (Number.isFinite(m.cfg.start)) novo.start = m.cfg.start;
      if (Number.isFinite(m.cfg.vrata)) novo.vrata = m.cfg.vrata;
      novo.autoPonudaMinut = Number.isFinite(m.cfg.autoPonudaMinut) ? m.cfg.autoPonudaMinut : null;
      if (m.cfg.ponuda && typeof m.cfg.ponuda === "object") {
        novo.ponuda = {};
        for (const k of ["naslov", "opis", "link", "dugme"]) novo.ponuda[k] = ocisti(m.cfg.ponuda[k], 500);
      }
      await this.ctx.storage.put("cfg", novo);
      const javni = await this.javniCfg();
      this.svima({ t: "cfg", cfg: javni, sad });
      this.studiju({ t: "cfg", cfg: novo, sad });
      return;
    }

    if (m.t === "resetuj_sve" && m.potvrda === "OBRISI") {
      // Samo za probe pre vebinara: brise sve poruke, objave, ankete, ucesnike i statistiku.
      this.sql.exec("DELETE FROM poruke; DELETE FROM objave; DELETE FROM ankete; DELETE FROM glasovi; DELETE FROM reakcije; DELETE FROM intervali; DELETE FROM ucesnici;");
      for (const w of this.ctx.getWebSockets("u")) { try { w.close(4000, "reset"); } catch {} }
      this.studiju(await this.initStudio());
      return;
    }
  }

  async webSocketClose(ws, kod) {
    this.zatvori(ws);
    try { ws.close(kod === 1005 ? 1000 : kod, "kraj"); } catch {}
  }

  async webSocketError(ws) {
    this.zatvori(ws);
  }

  zatvori(ws) {
    const a = ws.deserializeAttachment() || {};
    if (a.uid && a.iv && !a.zatvoren) {
      const sad = Date.now();
      this.sql.exec("UPDATE intervali SET do_ = ? WHERE id = ?", sad, a.iv);
      this.sql.exec("UPDATE ucesnici SET poslednji = ? WHERE uid = ?", sad, a.uid);
      a.zatvoren = true;
      try { ws.serializeAttachment(a); } catch {}
      this.javiBroj();
    }
  }

  // ---------- analitika ----------

  async statistika(trajanje) {
    const c = await this.cfg();
    const start = c.start;
    const kraj = start + trajanje * 1000;
    const sad = Date.now();
    const minuta = Math.max(1, Math.ceil(trajanje / 60));

    const ucesnici = this.sql.exec("SELECT uid, ime, email, uredjaj, izvor, prvi, poslednji, klik, reakcije FROM ucesnici").toArray();
    const poruka = {};
    for (const r of this.sql.exec("SELECT uid, COUNT(*) AS n FROM poruke WHERE ko = 'u' GROUP BY uid").toArray()) poruka[r.uid] = r.n;
    const glasova = {};
    for (const r of this.sql.exec("SELECT uid, COUNT(*) AS n FROM glasovi GROUP BY uid").toArray()) glasova[r.uid] = r.n;

    const online = new Set();
    for (const ws of this.ctx.getWebSockets("u")) {
      const a = ws.deserializeAttachment();
      if (a && a.uid && !a.zatvoren) online.add(a.uid);
    }

    const poUid = {};
    for (const iv of this.sql.exec("SELECT uid, od, do_ FROM intervali").toArray()) {
      (poUid[iv.uid] ||= []).push(iv);
    }

    const zadrzavanje = new Array(minuta).fill(0);
    const redovi = ucesnici.map((u) => {
      const ivs = poUid[u.uid] || [];
      let gledao = 0;
      let doMinuta = -1;
      const minuti = new Set();
      for (const iv of ivs) {
        let d = iv.do_;
        if (online.has(u.uid) && d < sad && sad - d < 90_000) d = sad; // jos je tu, "ziv" stize na minut
        const od = Math.max(iv.od, start);
        const doo = Math.min(d, kraj);
        if (doo > od) {
          gledao += doo - od;
          const m0 = Math.floor((od - start) / 60000);
          const m1 = Math.min(minuta - 1, Math.floor((doo - start - 1) / 60000));
          for (let m = m0; m <= m1; m++) minuti.add(m);
          doMinuta = Math.max(doMinuta, m1);
        }
      }
      for (const m of minuti) zadrzavanje[m]++;
      return {
        uid: u.uid, ime: u.ime, email: u.email, uredjaj: u.uredjaj, izvor: u.izvor,
        prvi: u.prvi, poslednji: u.poslednji, online: online.has(u.uid),
        gledao: Math.round(gledao / 1000), doMinuta: doMinuta >= 0 ? doMinuta + 1 : 0,
        klik: u.klik, reakcije: u.reakcije, poruka: poruka[u.uid] || 0, glasova: glasova[u.uid] || 0,
      };
    });

    const objave = this.sql.exec("SELECT id, vrsta, ts FROM objave ORDER BY id").toArray()
      .map((o) => ({ ...o, minut: Math.floor((o.ts - start) / 60000) }));
    const reakcije = this.sql.exec("SELECT e, minut, broj FROM reakcije").toArray();

    return { ok: true, start, trajanje, sad, ucesnici: redovi, zadrzavanje, objave, reakcije, online: online.size };
  }
}
