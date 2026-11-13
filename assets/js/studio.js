// ============================================================
// /studio: razgovori sa ucesnicima, poruke svima, ponuda, ankete,
// podesavanja i analitika. Server: worker/src/index.js
// ============================================================
(function () {
  "use strict";
  const LOKALNO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = LOKALNO ? "http://localhost:8787" : document.querySelector('meta[name="live-api"]').content.replace(/\/+$/, "");
  const WS = API.replace(/^http/, "ws");

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, tekst) => { const e = document.createElement(tag); if (cls) e.className = cls; if (tekst != null) e.textContent = tekst; return e; };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  let kljuc = ls.get("studio_kljuc") || "";
  let ws = null, otvoren = false, pomak = 0;
  let cfg = null, trajanje = 0;
  const razgovori = new Map();
  let izabran = null;
  let objave = [];
  let ankete = [];
  const reakcije = {};
  let stats = null;
  const sad = () => Date.now() + pomak;

  // ---------- prijava ----------

  $("forma-kljuc").addEventListener("submit", (e) => {
    e.preventDefault();
    kljuc = e.target.k.value.trim();
    poveziSe(true);
  });

  function prikaziPrijavu(greska) {
    $("prijava").hidden = false;
    $("app").hidden = true;
    $("kljuc-greska").textContent = greska || "";
  }

  function poveziSe(prvi) {
    if (!kljuc) return prikaziPrijavu();
    ws = new WebSocket(`${WS}/ws-studio?k=${encodeURIComponent(kljuc)}`);
    let ping;
    ws.onopen = () => {
      otvoren = true;
      ls.set("studio_kljuc", kljuc);
      $("prijava").hidden = true; $("app").hidden = false;
      $("st-veza").classList.remove("ne");
      ping = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000);
    };
    ws.onmessage = (e) => { if (e.data !== "pong") primi(JSON.parse(e.data)); };
    ws.onclose = () => {
      clearInterval(ping);
      $("st-veza").classList.add("ne");
      if (!otvoren) {
        // Nije ni otvoreno: najverovatnije pogresna sifra.
        if (prvi) return prikaziPrijavu("Pogrešna šifra ili server nije dostupan.");
      }
      otvoren = false;
      setTimeout(() => poveziSe(false), 2000);
    };
  }

  function posalji(m) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(m)); return true; }
    alert("Nema veze sa serverom. Sačekaj par sekundi.");
    return false;
  }

  // ---------- poruke sa servera ----------

  function primi(m) {
    switch (m.t) {
      case "init":
        pomak = m.sad - Date.now();
        cfg = m.cfg; trajanje = m.trajanje;
        razgovori.clear();
        for (const r of m.razgovori) razgovori.set(r.uid, r);
        objave = m.objave; ankete = m.ankete;
        for (const r of m.reakcije) reakcije[r.e] = r.n;
        $("st-online").textContent = m.online; $("st-ukupno").textContent = m.ukupno;
        nacrtajListu(); nacrtajObjave(); nacrtajAnkete(); nacrtajReakcije(); popuniCfg();
        if (izabran) posalji({ t: "razgovor", uid: izabran });
        break;
      case "poruka": {
        const staro = razgovori.get(m.p.uid) || {};
        razgovori.set(m.p.uid, { ...staro, ...m.u });
        if (izabran === m.p.uid) {
          dodajPoruku(m.p);
          if (m.p.ko === "u" && !document.hidden) posalji({ t: "procitano", uid: izabran });
        }
        if (m.p.ko === "u") { zvuk(); naslovBrojac(); }
        nacrtajListu();
        break;
      }
      case "razgovor":
        if (m.uid !== izabran) return;
        if (m.u) razgovori.set(m.uid, { ...(razgovori.get(m.uid) || {}), ...m.u });
        nacrtajRazgovor(m);
        break;
      case "procitano": {
        const r = razgovori.get(m.uid); if (r) r.neprocitano = 0; nacrtajListu(); naslovBrojac(); break;
      }
      case "online": $("st-online").textContent = m.n; $("st-ukupno").textContent = m.ukupno; break;
      case "objava": objave.unshift(m.o); nacrtajObjave(); break;
      case "obrisi_objavu": objave = objave.filter((o) => o.id !== m.id); nacrtajObjave(); break;
      case "anketa": ankete.forEach((a) => (a.zatvorena = 1)); ankete.unshift(m.anketa); nacrtajAnkete(); break;
      case "anketa_zatvorena": { const a = ankete.find((x) => x.id === m.id); if (a) a.zatvorena = 1; nacrtajAnkete(); break; }
      case "glasovi": { const a = ankete.find((x) => x.id === m.anketa); if (a) a.rezultati = m.rezultati; nacrtajAnkete(); break; }
      case "reakcija": reakcije[m.e] = (reakcije[m.e] || 0) + 1; nacrtajReakcije(); break;
      case "klik": { const r = razgovori.get(m.uid); if (r) r.klik = (r.klik || 0) + 1; break; }
      case "cfg": pomak = m.sad - Date.now(); cfg = m.cfg; popuniCfg(); break;
    }
  }

  // ---------- faza (gore desno) ----------

  const dc = (n) => String(n).padStart(2, "0");
  const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${dc(Math.floor(s / 3600))}:${dc(Math.floor(s % 3600 / 60))}:${dc(s % 60)}`; };
  setInterval(() => {
    if (!cfg) return;
    const t = sad(), f = $("st-faza");
    f.classList.remove("uzivo");
    if (t < cfg.start) f.textContent = "Počinje za " + hms(cfg.start - t);
    else if (t < cfg.start + trajanje * 1000) { f.classList.add("uzivo"); f.textContent = `UŽIVO ${hms(t - cfg.start)}`; }
    else f.textContent = "Završeno";
  }, 500);

  // ---------- lista razgovora ----------

  const vreme = (ts) => (ts ? new Date(ts).toLocaleTimeString("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" }) : "");

  function nacrtajListu() {
    const q = $("pretraga").value.trim().toLowerCase();
    const samoNove = $("samo-neprocitane").checked;
    const lista = [...razgovori.values()]
      .filter((r) => r.poslednja_poruka)
      .filter((r) => !q || (r.ime || "").toLowerCase().includes(q) || (r.email || "").includes(q))
      .filter((r) => !samoNove || r.neprocitano > 0)
      .sort((a, b) => (b.neprocitano > 0) - (a.neprocitano > 0) || b.poslednja_poruka - a.poslednja_poruka);
    const k = $("razgovori");
    k.textContent = "";
    if (!lista.length) { k.append(el("p", "lista-prazno", "Još nema poruka od učesnika.")); return; }
    for (const r of lista.slice(0, 400)) {
      const b = el("button", "stavka" + (r.uid === izabran ? " izabrana" : "") + (r.neprocitano > 0 ? " nova" : ""));
      const ime = el("div", "ime"); ime.append(el("span", null, r.ime || r.email), el("time", null, vreme(r.poslednja_poruka)));
      b.append(ime, el("div", "zadnja", r.poslednja || ""));
      if (r.neprocitano > 0) b.append(el("span", "br", r.neprocitano));
      b.onclick = () => izaberi(r.uid);
      k.append(b);
    }
  }
  $("pretraga").addEventListener("input", nacrtajListu);
  $("samo-neprocitane").addEventListener("change", nacrtajListu);

  function izaberi(uid) {
    izabran = uid;
    $("poruke").textContent = "";
    posalji({ t: "razgovor", uid });
    posalji({ t: "procitano", uid });
    const r = razgovori.get(uid); if (r) r.neprocitano = 0;
    $("forma-odgovor").hidden = false;
    $("brzi-odgovori").hidden = false;
    nacrtajListu(); naslovBrojac();
    $("tekst-odgovor").focus();
  }

  function nacrtajRazgovor(m) {
    const v = $("razgovor-vrh");
    v.textContent = "";
    const u = m.u || {};
    v.append(el("strong", null, u.ime || ""), el("span", "mali", `${u.email || ""} · ${m.online ? "na radionici" : "nije na stranici"}${u.klik ? " · kliknuo/la na ponudu" : ""}`));
    $("poruke").textContent = "";
    for (const p of m.poruke) dodajPoruku(p);
  }

  function dodajPoruku(p) {
    const k = $("poruke");
    if (k.querySelector(`[data-id="${p.id}"]`)) return;
    const d = el("div", "p " + p.ko);
    d.dataset.id = p.id;
    d.append(el("div", "ko", (p.ko === "u" ? "Učesnik" : p.ime_tima + " (tim)") + " · " + vreme(p.ts)), el("div", "b", p.tekst));
    k.append(d);
    k.scrollTop = k.scrollHeight;
  }

  // ---------- odgovor ----------

  $("moje-ime").value = ls.get("studio_ime") || "";
  $("moje-ime").addEventListener("input", (e) => ls.set("studio_ime", e.target.value.trim()));

  function mojeIme() {
    const i = $("moje-ime").value.trim();
    if (!i) { $("moje-ime").focus(); alert("Upiši svoje ime (desno gore) pre slanja."); return null; }
    return i;
  }

  function posaljiOdgovor(tekst) {
    const ime = mojeIme();
    if (!ime || !izabran || !tekst) return;
    if (posalji({ t: "odgovor", uid: izabran, tekst, ime })) $("tekst-odgovor").value = "";
  }

  $("forma-odgovor").addEventListener("submit", (e) => { e.preventDefault(); posaljiOdgovor($("tekst-odgovor").value.trim()); });
  $("tekst-odgovor").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("forma-odgovor").requestSubmit(); }
  });

  const BRZI = [
    "Hvala na pitanju! Vlada će to objasniti malo kasnije u radionici. 🙌",
    "Odlično pitanje, zapisali smo ga. 👍",
    "Link za prijavu je u kartici sa ponudom, iznad chata.",
    "Ako ne čuješ zvuk, klikni na dugme „Zvuk\" dole levo ili osveži stranicu.",
  ];
  for (const t of BRZI) {
    const b = el("button", null, t.length > 38 ? t.slice(0, 36) + "…" : t);
    b.title = t;
    b.type = "button";
    b.onclick = () => { $("tekst-odgovor").value = t; $("tekst-odgovor").focus(); };
    $("brzi-odgovori").append(b);
  }

  // ---------- objave i ponuda ----------

  $("posalji-objavu").addEventListener("click", () => {
    const tekst = $("tekst-objava").value.trim();
    if (!tekst) return;
    if (!confirm("Poslati ovu poruku SVIM učesnicima?")) return;
    if (posalji({ t: "objava", tekst, ime: $("objava-od").value.trim() })) $("tekst-objava").value = "";
  });

  $("posalji-ponudu").addEventListener("click", () => {
    if (!cfg || !cfg.ponuda || !cfg.ponuda.link) { alert("Prvo upiši link za kupovinu u Podešavanjima."); return; }
    if (!confirm(`Poslati ponudu „${cfg.ponuda.naslov}" svima?`)) return;
    posalji({ t: "ponuda" });
  });

  function nacrtajObjave() {
    const k = $("objave");
    k.textContent = "";
    for (const o of objave.slice(0, 20)) {
      const d = el("div", "objava");
      d.append(el("span", null, `${vreme(o.ts)} · ${o.vrsta === "ponuda" ? "🛒 PONUDA" : o.tekst}`));
      const x = el("button", null, "Skloni");
      x.onclick = () => { if (confirm("Skloniti ovu poruku kod svih učesnika?")) posalji({ t: "obrisi_objavu", id: o.id }); };
      d.append(x);
      k.append(d);
    }
  }

  // ---------- ankete ----------

  $("pokreni-anketu").addEventListener("click", () => {
    const pitanje = $("anketa-pitanje").value.trim();
    const opcije = $("anketa-opcije").value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!pitanje || opcije.length < 2 || opcije.length > 6) { alert("Upiši pitanje i 2 do 6 odgovora."); return; }
    if (!confirm("Pokrenuti anketu? Iskočiće svim učesnicima.")) return;
    if (posalji({ t: "anketa", pitanje, opcije })) { $("anketa-pitanje").value = ""; $("anketa-opcije").value = ""; }
  });

  function nacrtajAnkete() {
    const k = $("ankete");
    k.textContent = "";
    for (const a of ankete.slice(0, 5)) {
      const d = el("div", "anketa-rez");
      d.append(el("strong", null, (a.zatvorena ? "" : "🟢 ") + a.pitanje));
      const ukupno = Object.values(a.rezultati || {}).reduce((x, y) => x + y, 0);
      a.opcije.forEach((o, i) => {
        const n = (a.rezultati || {})[i] || 0;
        const proc = ukupno ? Math.round((n / ukupno) * 100) : 0;
        const t = el("div", "traka");
        const bar = el("div", "bar");
        const i2 = el("i"); i2.style.width = proc + "%";
        bar.append(i2, el("span", null, o));
        t.append(bar, el("span", null, `${n} · ${proc}%`));
        d.append(t);
      });
      d.append(el("p", "mali", `Ukupno glasova: ${ukupno}`));
      if (!a.zatvorena) {
        const z = el("button", "dugme sivo", "Zatvori anketu");
        z.onclick = () => posalji({ t: "anketa_zatvori", id: a.id });
        d.append(z);
      }
      k.append(d);
    }
  }

  function nacrtajReakcije() {
    const k = $("reakcije");
    k.textContent = "";
    for (const e of ["👍", "❤️", "😂", "😮", "👏", "🔥"]) {
      const s = el("span", null, e); s.append(el("b", null, reakcije[e] || 0)); k.append(s);
    }
  }

  // ---------- obavestenja ----------

  let ctx = null;
  function zvuk() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.frequency.value = 660; g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.2);
    } catch {}
  }
  function naslovBrojac() {
    const n = [...razgovori.values()].reduce((s, r) => s + (r.neprocitano > 0 ? 1 : 0), 0);
    document.title = (n ? `(${n}) ` : "") + "Studio · Radionica uživo";
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && izabran) posalji({ t: "procitano", uid: izabran }); });

  // ---------- tabovi ----------

  document.querySelectorAll(".tabovi button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tabovi button").forEach((x) => x.classList.toggle("aktivan", x === b));
    document.querySelectorAll("main.tab").forEach((t) => (t.hidden = t.dataset.tab !== b.dataset.tab));
    if (b.dataset.tab === "analitika") ucitajStats();
  }));

  // ---------- podesavanja ----------

  const uLokalno = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 19);

  function popuniCfg() {
    if (!cfg) return;
    const f = $("forma-cfg");
    if (f.contains(document.activeElement)) return; // ne gazi ono sto se upravo kuca
    f.naslov.value = cfg.naslov; f.voditelj.value = cfg.voditelj;
    f.start.value = uLokalno(cfg.start); f.vrata.value = cfg.vrata;
    f.p_naslov.value = cfg.ponuda.naslov || ""; f.p_opis.value = cfg.ponuda.opis || "";
    f.p_link.value = cfg.ponuda.link || ""; f.p_dugme.value = cfg.ponuda.dugme || "";
    f.autoPonudaMinut.value = cfg.autoPonudaMinut ?? "";
    f.dobrodoslica.value = cfg.dobrodoslica; f.dobrodoslicaOd.value = cfg.dobrodoslicaOd; f.krajPoruka.value = cfg.krajPoruka;
    const kraj = new Date(cfg.start + trajanje * 1000);
    $("cfg-trajanje").textContent = trajanje
      ? `Video traje ${hms(trajanje * 1000)}. Završava se u ${kraj.toLocaleString("sr-Latn-RS")}.`
      : "Video još nije postavljen u R2.";
    $("ponuda-pregled").textContent = cfg.ponuda.link ? `${cfg.ponuda.naslov} → ${cfg.ponuda.link}` : "Link za kupovinu nije upisan (Podešavanja).";
  }

  function sacuvajCfg(izmene) {
    const novo = { ...cfg, ...izmene };
    posalji({ t: "cfg", cfg: novo });
    $("cfg-sacuvano").textContent = "Sačuvano " + new Date().toLocaleTimeString("sr-Latn-RS");
  }

  $("forma-cfg").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target;
    const start = new Date(f.start.value).getTime();
    if (!Number.isFinite(start)) { alert("Proveri vreme početka."); return; }
    const auto = f.autoPonudaMinut.value === "" ? null : Number(f.autoPonudaMinut.value);
    sacuvajCfg({
      naslov: f.naslov.value.trim(), voditelj: f.voditelj.value.trim(), start, vrata: Number(f.vrata.value) || 0,
      ponuda: { naslov: f.p_naslov.value.trim(), opis: f.p_opis.value.trim(), link: f.p_link.value.trim(), dugme: f.p_dugme.value.trim() },
      autoPonudaMinut: auto, dobrodoslica: f.dobrodoslica.value, dobrodoslicaOd: f.dobrodoslicaOd.value.trim(), krajPoruka: f.krajPoruka.value.trim(),
    });
    document.activeElement.blur();
  });

  document.querySelectorAll("[data-za]").forEach((b) => b.addEventListener("click", () => {
    if (!confirm("Pomeriti početak prenosa? Svi učesnici odmah vide promenu.")) return;
    sacuvajCfg({ start: sad() + Number(b.dataset.za) * 60000 });
  }));
  $("vrati-start").addEventListener("click", () => sacuvajCfg({ start: Date.parse("2026-11-16T17:58:00Z") }));
  $("resetuj").addEventListener("click", () => {
    const p = prompt("Ovo briše SVE poruke, ankete, objave i statistiku. Upiši OBRISI za potvrdu.");
    if (p === "OBRISI") posalji({ t: "resetuj_sve", potvrda: "OBRISI" });
  });

  // ---------- analitika ----------

  async function ucitajStats() {
    try {
      const r = await fetch(`${API}/studio/stats?k=${encodeURIComponent(kljuc)}`);
      stats = await r.json();
      nacrtajStats();
    } catch { alert("Analitika trenutno nije dostupna."); }
  }
  $("osvezi-stats").addEventListener("click", ucitajStats);

  const minuti = (s) => (s / 60).toFixed(1).replace(".", ",");

  function nacrtajStats() {
    const u = stats.ucesnici;
    const gledali = u.filter((x) => x.gledao > 0);
    const ponuda = stats.objave.find((o) => o.vrsta === "ponuda");
    const prosek = gledali.length ? gledali.reduce((s, x) => s + x.gledao, 0) / gledali.length : 0;
    const naPonudi = ponuda && stats.zadrzavanje[ponuda.minut] != null ? stats.zadrzavanje[ponuda.minut] : null;
    const kpi = [
      ["Ušlo u sobu", u.length],
      ["Gledalo prenos", gledali.length],
      ["Prosečno gledanje", minuti(prosek) + " min"],
      ["Bilo na ponudi", naPonudi ?? "—"],
      ["Kliknulo na ponudu", u.filter((x) => x.klik > 0).length],
      ["Pisalo u chat", u.filter((x) => x.poruka > 0).length],
      ["Sada online", stats.online],
    ];
    const k = $("kpi"); k.textContent = "";
    for (const [n, v] of kpi) { const d = el("div"); d.append(el("b", null, v), el("span", null, n)); k.append(d); }
    nacrtajGrafikon();
    nacrtajTabelu();
  }

  function nacrtajGrafikon() {
    const z = stats.zadrzavanje, n = z.length, max = Math.max(1, ...z);
    const W = 1000, H = 220, pad = 28;
    const bw = (W - pad) / n;
    let s = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Gledaoci po minutu">`;
    s += `<text x="0" y="12" font-size="11" fill="#6b7079">${max}</text><line x1="${pad}" x2="${W}" y1="${H - 18}" y2="${H - 18}" stroke="#e3e5e9"/>`;
    z.forEach((v, i) => {
      const h = ((H - 34) * v) / max;
      s += `<rect x="${pad + i * bw + 0.5}" y="${H - 18 - h}" width="${Math.max(1, bw - 1)}" height="${h}" fill="#2D8CFF" rx="1"><title>Minut ${i + 1}: ${v}</title></rect>`;
      if (i % 10 === 0) s += `<text x="${pad + i * bw}" y="${H - 4}" font-size="11" fill="#6b7079">${i}′</text>`;
    });
    for (const o of stats.objave.filter((o) => o.vrsta === "ponuda" && o.minut >= 0 && o.minut < n)) {
      const x = pad + o.minut * bw;
      s += `<line x1="${x}" x2="${x}" y1="4" y2="${H - 18}" stroke="#F26A1F" stroke-width="2" stroke-dasharray="4 3"/><text x="${x + 4}" y="14" font-size="11" fill="#F26A1F">ponuda</text>`;
    }
    $("grafikon").innerHTML = s + "</svg>";
  }

  let sortKolona = "gledao", sortSmer = -1;
  const KOLONE = [
    ["ime", "Ime"], ["email", "Email"], ["gledao", "Gledao (min)"], ["doMinuta", "Do minuta"], ["klik", "Klik ponuda"],
    ["poruka", "Poruka"], ["reakcije", "Reakcija"], ["glasova", "Glasova"], ["uredjaj", "Uređaj"], ["izvor", "Izvor"], ["prvi", "Ušao"],
  ];
  function nacrtajTabelu() {
    const t = $("tabela");
    t.textContent = "";
    const zag = el("tr");
    for (const [k, n] of KOLONE) {
      const th = el("th", null, n + (sortKolona === k ? (sortSmer < 0 ? " ↓" : " ↑") : ""));
      th.onclick = () => { sortSmer = sortKolona === k ? -sortSmer : -1; sortKolona = k; nacrtajTabelu(); };
      zag.append(th);
    }
    const thead = el("thead"); thead.append(zag); t.append(thead);
    const tb = el("tbody");
    const redovi = [...stats.ucesnici].sort((a, b) => {
      const x = a[sortKolona] ?? "", y = b[sortKolona] ?? "";
      return (x > y ? 1 : x < y ? -1 : 0) * sortSmer;
    });
    for (const r of redovi) {
      const tr = el("tr");
      for (const [k] of KOLONE) {
        let v = r[k];
        if (k === "gledao") v = minuti(v);
        if (k === "prvi") v = vreme(v);
        const td = el("td", ["gledao", "doMinuta", "klik", "poruka", "reakcije", "glasova"].includes(k) ? "br" : null);
        if (k === "ime" && r.online) td.append(el("span", "tacka-on"));
        td.append(v ?? "");
        tr.append(td);
      }
      tb.append(tr);
    }
    t.append(tb);
  }

  $("izvoz-csv").addEventListener("click", () => {
    if (!stats) return;
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const red = KOLONE.map(([, n]) => esc(n)).join(",");
    const telo = stats.ucesnici.map((r) => KOLONE.map(([k]) => esc(k === "gledao" ? minuti(r[k]) : k === "prvi" ? new Date(r[k]).toLocaleString("sr-Latn-RS") : r[k])).join(","));
    const blob = new Blob(["﻿" + [red, ...telo].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a"); a.href = URL.createObjectURL(blob); a.download = "radionica-ucesnici.csv"; a.click();
  });

  // ---------- start ----------
  if (kljuc) poveziSe(true); else prikaziPrijavu();
})();
