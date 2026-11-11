// ============================================================
// GET /api/analiza?vebinar=2026-11-16   (zaglavlje X-AB-Kljuc: KLJUC)
// GET /api/analiza?vebinar=...&format=csv  -> sve prijave kao CSV
//
// Brojke za internu stranicu /analiza: koliko prijava, kada, odakle,
// sa kog uredjaja, iz koje zemlje, ko najvise preporucuje i poredjenje
// sa proslim vebinarom. Isti kljuc kao /ab (AB_KLJUC na Vercelu).
// ============================================================

import { VEBINAR, db, json, greska, ocisti, proveriKljuc } from "./_lib.js";

// Pozivni broj -> zemlja. Duzi prefiksi prvi, da +387 ne upadne u +38.
const POZIVNI = [
  ["+381", "RS"], ["+387", "BA"], ["+382", "ME"], ["+385", "HR"], ["+389", "MK"], ["+386", "SI"],
  ["+383", "XK"], ["+353", "IE"], ["+352", "LU"], ["+356", "MT"], ["+357", "CY"], ["+358", "FI"],
  ["+359", "BG"], ["+351", "PT"], ["+380", "UA"], ["+420", "CZ"], ["+421", "SK"], ["+971", "AE"],
  ["+43", "AT"], ["+41", "CH"], ["+46", "SE"], ["+47", "NO"], ["+45", "DK"], ["+31", "NL"],
  ["+32", "BE"], ["+33", "FR"], ["+39", "IT"], ["+44", "GB"], ["+49", "DE"], ["+61", "AU"],
  ["+34", "ES"], ["+30", "GR"], ["+36", "HU"], ["+48", "PL"], ["+40", "RO"], ["+90", "TR"],
  ["+1", "US/CA"], ["+7", "RU"],
].sort((a, b) => b[0].length - a[0].length);

function zemljaPoTelefonu(tel) {
  const t = String(tel || "");
  for (const [p, z] of POZIVNI) if (t.startsWith(p)) return z;
  return t ? "ostalo" : "-";
}

function csvPolje(v) {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function imaKolonu(sql, kolona) {
  const [r] = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'prijave' AND column_name = ${kolona}) AS ima`;
  return r.ima;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return greska(res, 405, "Dozvoljen je samo GET.");
  }
  if (!proveriKljuc(req, res)) return;

  const vebinar = ocisti(req.query.vebinar, 20) || VEBINAR;

  try {
    const sql = db();
    const imaIzvor = await imaKolonu(sql, "izvor");
    const imaVarijantu = await imaKolonu(sql, "varijanta");

    // ---------- CSV izvoz ----------
    if (req.query.format === "csv") {
      const redovi = imaIzvor
        ? await sql`
            SELECT p.kreirano, p.ime, p.prezime, p.email, p.telefon, p.status, p.ref_kod,
                   r.email AS preporucio, p.izvor, p.medij, p.kampanja, p.oglas, p.zemlja, p.uredjaj,
                   p.mailerlite_ok
            FROM prijave p LEFT JOIN prijave r ON r.id = p.ref_od_id
            WHERE p.vebinar = ${vebinar} ORDER BY p.kreirano`
        : await sql`
            SELECT p.kreirano, p.ime, p.prezime, p.email, p.telefon, p.status, p.ref_kod,
                   r.email AS preporucio, p.mailerlite_ok
            FROM prijave p LEFT JOIN prijave r ON r.id = p.ref_od_id
            WHERE p.vebinar = ${vebinar} ORDER BY p.kreirano`;
      const kolone = redovi.length ? Object.keys(redovi[0]) : ["kreirano", "ime", "email"];
      const telo = [kolone.join(",")]
        .concat(redovi.map((r) => kolone.map((k) => csvPolje(r[k] instanceof Date ? r[k].toISOString() : r[k])).join(",")))
        .join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Disposition", `attachment; filename="prijave-${vebinar}.csv"`);
      return res.status(200).send("﻿" + telo);
    }

    // ---------- svi vebinari, za izbor i poredjenje ----------
    const vebinari = await sql`
      SELECT vebinar, COUNT(*)::int AS broj FROM prijave GROUP BY 1 ORDER BY 1 DESC`;

    // ---------- glavne brojke ----------
    const [k] = await sql`
      SELECT
        COUNT(*)::int AS ukupno,
        COUNT(*) FILTER (WHERE (kreirano AT TIME ZONE 'Europe/Belgrade')::date
                             = (NOW() AT TIME ZONE 'Europe/Belgrade')::date)::int AS danas,
        COUNT(*) FILTER (WHERE (kreirano AT TIME ZONE 'Europe/Belgrade')::date
                             = (NOW() AT TIME ZONE 'Europe/Belgrade')::date - 1)::int AS juce,
        COUNT(*) FILTER (WHERE kreirano > NOW() - INTERVAL '24 hours')::int AS h24,
        COUNT(*) FILTER (WHERE kreirano > NOW() - INTERVAL '7 days')::int AS d7,
        COUNT(*) FILTER (WHERE ref_od_id IS NOT NULL)::int AS preko_preporuke,
        COUNT(*) FILTER (WHERE NOT mailerlite_ok)::int AS ml_greske,
        COUNT(*) FILTER (WHERE azurirano > kreirano + INTERVAL '1 minute')::int AS ponovljene,
        MIN(kreirano) AS prva, MAX(kreirano) AS poslednja
      FROM prijave WHERE vebinar = ${vebinar}`;

    // Jedinstveni posetioci landinga (beleze se za A/B test).
    let posete = null;
    try {
      const [p] = await sql`
        SELECT COUNT(*)::int AS broj FROM ab_dogadjaji
        WHERE vebinar = ${vebinar} AND dogadjaj = 'poseta'`;
      posete = p.broj;
    } catch { /* tabela jos ne postoji */ }

    // ---------- kada ----------
    const poDanima = await sql`
      SELECT to_char((kreirano AT TIME ZONE 'Europe/Belgrade')::date, 'YYYY-MM-DD') AS dan,
             COUNT(*)::int AS broj,
             COUNT(*) FILTER (WHERE ref_od_id IS NOT NULL)::int AS preporuka
      FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 1`;

    let posetePoDanima = [];
    try {
      posetePoDanima = await sql`
        SELECT to_char((kreirano AT TIME ZONE 'Europe/Belgrade')::date, 'YYYY-MM-DD') AS dan,
               COUNT(*)::int AS broj
        FROM ab_dogadjaji WHERE vebinar = ${vebinar} AND dogadjaj = 'poseta' GROUP BY 1`;
    } catch { /* tabela jos ne postoji */ }

    const poSatima = await sql`
      SELECT EXTRACT(HOUR FROM kreirano AT TIME ZONE 'Europe/Belgrade')::int AS sat, COUNT(*)::int AS broj
      FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 1`;

    const poDanuNedelje = await sql`
      SELECT EXTRACT(ISODOW FROM kreirano AT TIME ZONE 'Europe/Belgrade')::int AS dan, COUNT(*)::int AS broj
      FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 1`;

    // ---------- poredjenje: kumulativno po danima pre vebinara ----------
    // Oznaka vebinara je njegov datum, pa "dana pre" = datum - dan prijave.
    const poredjenje = await sql`
      SELECT vebinar,
             (vebinar::date - (kreirano AT TIME ZONE 'Europe/Belgrade')::date)::int AS dana_pre,
             COUNT(*)::int AS broj
      FROM prijave WHERE vebinar ~ '^\\d{4}-\\d{2}-\\d{2}$'
      GROUP BY 1, 2 ORDER BY 1, 2 DESC`;

    // ---------- ko, odakle ----------
    const telefoni = await sql`SELECT telefon FROM prijave WHERE vebinar = ${vebinar}`;
    const zemljeTel = {};
    for (const r of telefoni) {
      const z = zemljaPoTelefonu(r.telefon);
      zemljeTel[z] = (zemljeTel[z] || 0) + 1;
    }

    const domeni = await sql`
      SELECT lower(split_part(email, '@', 2)) AS domen, COUNT(*)::int AS broj
      FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;

    const preporucioci = await sql`
      SELECT r.ime, r.prezime, r.email, r.ref_kod, COUNT(*)::int AS broj
      FROM prijave p JOIN prijave r ON r.id = p.ref_od_id
      WHERE p.vebinar = ${vebinar}
      GROUP BY r.id, r.ime, r.prezime, r.email, r.ref_kod ORDER BY broj DESC, r.ime LIMIT 15`;

    const [ref] = await sql`
      SELECT COUNT(DISTINCT ref_od_id)::int AS aktivnih
      FROM prijave WHERE vebinar = ${vebinar} AND ref_od_id IS NOT NULL`;

    let izvori = [], kampanje = [], oglasi = [], uredjaji = [], zemljeIp = [];
    if (imaIzvor) {
      izvori = await sql`
        SELECT COALESCE(izvor, '(nije zabelezeno)') AS ime, COUNT(*)::int AS broj
        FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
      kampanje = await sql`
        SELECT kampanja AS ime, COUNT(*)::int AS broj
        FROM prijave WHERE vebinar = ${vebinar} AND kampanja IS NOT NULL AND kampanja <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
      oglasi = await sql`
        SELECT oglas AS ime, COUNT(*)::int AS broj
        FROM prijave WHERE vebinar = ${vebinar} AND oglas IS NOT NULL AND oglas <> ''
        GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
      uredjaji = await sql`
        SELECT COALESCE(uredjaj, '(nije zabelezeno)') AS ime, COUNT(*)::int AS broj
        FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 2 DESC`;
      zemljeIp = await sql`
        SELECT COALESCE(zemlja, '(nije zabelezeno)') AS ime, COUNT(*)::int AS broj
        FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
    }

    // ---------- poslednje prijave i problemi ----------
    const poslednje = imaIzvor
      ? await sql`
          SELECT p.kreirano, p.ime, p.prezime, p.email, p.telefon, p.mailerlite_ok,
                 r.ime AS preporucio, p.izvor, p.uredjaj, p.zemlja
          FROM prijave p LEFT JOIN prijave r ON r.id = p.ref_od_id
          WHERE p.vebinar = ${vebinar} ORDER BY p.kreirano DESC LIMIT 50`
      : await sql`
          SELECT p.kreirano, p.ime, p.prezime, p.email, p.telefon, p.mailerlite_ok,
                 r.ime AS preporucio
          FROM prijave p LEFT JOIN prijave r ON r.id = p.ref_od_id
          WHERE p.vebinar = ${vebinar} ORDER BY p.kreirano DESC LIMIT 50`;

    const mlProblemi = await sql`
      SELECT kreirano, ime, email, mailerlite_greska
      FROM prijave WHERE vebinar = ${vebinar} AND NOT mailerlite_ok
      ORDER BY kreirano DESC LIMIT 20`;

    let varijante = [];
    if (imaVarijantu) {
      varijante = await sql`
        SELECT COALESCE(varijanta, '-') AS ime, COUNT(*)::int AS broj
        FROM prijave WHERE vebinar = ${vebinar} GROUP BY 1 ORDER BY 1`;
    }

    return json(res, 200, {
      ok: true,
      vebinar,
      tekuci: VEBINAR,
      imaIzvor,
      vebinari,
      kljucne: { ...k, posete, aktivnih_preporucilaca: ref.aktivnih },
      poDanima,
      posetePoDanima,
      poSatima,
      poDanuNedelje,
      poredjenje,
      zemljeTelefon: Object.entries(zemljeTel).map(([ime, broj]) => ({ ime, broj })).sort((a, b) => b.broj - a.broj),
      zemljeIp,
      domeni,
      izvori,
      kampanje,
      oglasi,
      uredjaji,
      varijante,
      preporucioci,
      poslednje,
      mlProblemi,
    });
  } catch (e) {
    console.error("analiza:", e);
    return greska(res, 500, "Ne mogu da procitam bazu.");
  }
}
