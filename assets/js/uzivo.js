// ============================================================
// /uzivo: ulaz, sinhronizovan prenos, privatni chat sa timom,
// objave, ponuda, ankete i podignuta ruka. Server: worker/src/index.js
// ============================================================
(function () {
  "use strict";

  const LOKALNO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = LOKALNO ? "http://localhost:8787" : document.querySelector('meta[name="live-api"]').content.replace(/\/+$/, "");
  const WS = API.replace(/^http/, "ws");
  const KLJUC = "uzivo_ulaznica_v1";

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, tekst) => { const e = document.createElement(tag); if (cls) e.className = cls; if (tekst != null) e.textContent = tekst; return e; };

  const skladiste = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // ---------- zastita od "inspect" i preuzimanja ----------
  document.addEventListener("contextmenu", (e) => { if (!e.target.closest("input, textarea")) e.preventDefault(); });
  document.addEventListener("dragstart", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    const k = (e.key || "").toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (k === "f12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (mod && e.altKey && ["i", "j", "c", "u"].includes(k)) || (mod && ["u", "s"].includes(k))) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);

  // ---------- stanje ----------
  let ulaznica = null;
  let ime = "";
  let cfg = null;
  let pomak = 0; // serverovo vreme - nase vreme
  let ws = null;
  let wsPokusaj = 0;
  let napustio = false;
  let hls = null;
  let prenosPokrenut = false;
  let utisano = false;
  let neprocitano = 0;
  let ponudaPrikazana = false;
  let ponudaObjava = null;
  let anketaId = null;
  let rukaGore = false;
  let cekaPocetak = false; // video se ucitava u cekaonici i krece tacno u trenutku pocetka
  let tajmerPocetka = null;
  const sad = () => Date.now() + pomak;

  // ============ ULAZ ============

  function prikaziUlaz() {
    $("ekran-ulaz").hidden = false;
    $("ekran-soba").hidden = true;
    const q = new URLSearchParams(location.search);
    const f = $("forma-ulaz");
    if (q.get("ime")) f.ime.value = q.get("ime").slice(0, 60);
    if (q.get("email")) f.email.value = q.get("email").slice(0, 160);
    // Link iz mejla sa imenom i emailom: ulazi odmah, bez kucanja.
    if (f.ime.value.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(f.email.value.trim())) uđi();
  }

  async function uđi(e) {
    if (e) e.preventDefault();
    const f = $("forma-ulaz");
    const podaci = { ime: f.ime.value.trim(), email: f.email.value.trim() };
    const greska = $("ulaz-greska");
    greska.textContent = "";
    if (podaci.ime.length < 2) { greska.textContent = "Upiši svoje ime."; f.ime.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(podaci.email)) { greska.textContent = "Proveri email adresu."; f.email.focus(); return; }
    const q = new URLSearchParams(location.search);
    podaci.izvor = q.get("utm_source") || q.get("izvor") || "";
    const dugme = $("dugme-ulaz");
    dugme.disabled = true; dugme.textContent = "Ulazim…";
    try {
      const r = await fetch(API + "/ulaz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(podaci) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.poruka || "Greška");
      ulaznica = j.ulaznica; ime = j.ime;
      skladiste.set(KLJUC, { ulaznica, ime });
      // Sklanjamo ime i email iz adrese da ne ostanu u istoriji.
      if (q.get("email")) history.replaceState(null, "", location.pathname);
      udjiUSobu(true);
    } catch (err) {
      greska.textContent = err.message && err.message !== "Failed to fetch" ? err.message : "Veza nije uspela. Pokušaj ponovo.";
    } finally {
      dugme.disabled = false; dugme.textContent = "Pridruži se radionici";
    }
  }
  $("forma-ulaz").addEventListener("submit", uđi);

  // ============ SOBA ============

  function udjiUSobu(saKlikom) {
    $("ekran-ulaz").hidden = true;
    $("ekran-soba").hidden = false;
    postaviPanel(!mobilni());
    zauzmiTab();
    poveziSe();
    setInterval(otkucaj, 500);
    otkucaj();
  }

  // ---------- WebSocket ----------

  function poveziSe() {
    if (napustio) return;
    try { ws && ws.close(); } catch {}
    const ovaj = new WebSocket(`${WS}/ws?t=${encodeURIComponent(ulaznica)}`);
    ws = ovaj;
    let ping, ziv;
    ovaj.onopen = () => {
      wsPokusaj = 0;
      postaviVezu("dobra");
      ping = setInterval(() => posalji("ping"), 25000);
      ziv = setInterval(() => posalji({ t: "ziv" }), 60000);
    };
    ovaj.onmessage = (e) => {
      if (e.data === "pong") return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      primi(m);
    };
    ovaj.onclose = (e) => {
      clearInterval(ping); clearInterval(ziv);
      if (ws !== ovaj) return; // zatvorena stara konekcija, nova je vec otvorena
      if (napustio) return;
      if (e.code === 4000) { location.reload(); return; }
      postaviVezu("nema");
      if (wsPokusaj === 3 && !cfg) {
        // Mozda ulaznica vise ne vazi (npr. promenjena tajna). Brisemo je samo ako
        // server to potvrdi; ako server privremeno ne radi, samo pokusavamo ponovo.
        fetch(adresaPrenosa()).then((r) => {
          if (r.status === 401) { skladiste.del(KLJUC); location.reload(); }
        }).catch(() => {});
      }
      wsPokusaj++;
      setTimeout(poveziSe, Math.min(15000, 600 * 2 ** Math.min(wsPokusaj, 5)) + Math.random() * 1000);
    };
  }

  function posalji(m) {
    if (ws && ws.readyState === 1) { ws.send(typeof m === "string" ? m : JSON.stringify(m)); return true; }
    return false;
  }

  function postaviVezu(stanje) {
    const v = $("oznaka-veza");
    v.classList.toggle("nema", stanje === "nema");
    v.classList.toggle("slaba", stanje === "slaba");
  }

  function primi(m) {
    if (m.t === "init") {
      pomak = m.sad - Date.now();
      cfg = m.cfg;
      primeniCfg();
      $("poruke").textContent = "";
      const sve = [
        ...m.poruke.map((p) => ({ ...p, _vrsta: "poruka" })),
        ...m.objave.map((o) => ({ ...o, _vrsta: "objava" })),
      ].sort((a, b) => a.ts - b.ts);
      for (const x of sve) x._vrsta === "poruka" ? dodajPoruku(x, false) : dodajObjavu(x, false);
      if (!sve.length) prazanChat();
      skrolujDole();
      if (m.anketa && m.glasao == null) prikaziAnketu(m.anketa, null);
      postaviRuku(!!m.ruka);
      const odTima = m.poruke.filter((p) => p.ko === "t").pop();
      if (odTima) $("mob-chat-pregled").textContent = `${odTima.ime_tima} (tim): ${odTima.tekst}`;
      return;
    }
    if (m.t === "poruka") {
      const p = m.p;
      if (p.ko === "u" && p.c) { const privremena = document.querySelector(`[data-c="${p.c}"]`); if (privremena) privremena.remove(); }
      dodajPoruku(p, true);
      if (p.ko === "t") obavestiOPoruci(p);
      return;
    }
    if (m.t === "objava") { dodajObjavu(m.o, true); return; }
    if (m.t === "obrisi_objavu") {
      document.querySelectorAll(`[data-objava="${m.id}"]`).forEach((x) => x.remove());
      if (ponudaObjava && ponudaObjava.id === m.id) { ponudaObjava = null; ponudaPrikazana = false; $("ponuda-plutajuca").hidden = true; $("ponuda-zakacena").hidden = true; $("mob-ponuda").textContent = ""; }
      return;
    }
    if (m.t === "anketa") { prikaziAnketu(m.anketa, null); return; }
    if (m.t === "anketa_kraj") { if (anketaId === m.id) $("anketa").hidden = true; return; }
    if (m.t === "glas_ok") { return; }
    if (m.t === "ruka") {
      postaviRuku(m.gore);
      if (!m.gore && m.tim) obavesti("Tim radionice", "Videli smo tvoju podignutu ruku. Odgovor stiže u chatu.");
      return;
    }
    if (m.t === "cfg") {
      const stari = cfg;
      pomak = m.sad - Date.now(); cfg = m.cfg; primeniCfg();
      // Video se ponovo pokrece samo ako se promenio pocetak ili video. Izmena teksta
      // ili linka ponude ne sme da zaustavi sliku gledaocima.
      if (prenosPokrenut && (!stari || stari.start !== cfg.start || stari.trajanje !== cfg.trajanje)) proveriVideoStanje();
      else if (!prenosPokrenut) { poslednjeStanje = ""; otkucaj(); }
      return;
    }
  }

  function primeniCfg() {
    $("soba-naslov").textContent = cfg.naslov;
    $("govornik-ime").textContent = cfg.voditelj;
    document.title = cfg.naslov + " · Uživo";
    $("kraj-tekst").textContent = cfg.krajPoruka;
    $("mob-naslov").textContent = cfg.naslov;
    $("mob-voditelj").textContent = cfg.voditelj;
  }

  // ---------- glavni otkucaj: koje stanje se prikazuje ----------

  const dvocifreno = (n) => String(n).padStart(2, "0");
  function trajanjeTekst(ms, saSatima) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (saSatima || h ? dvocifreno(h) + ":" : "") + dvocifreno(m) + ":" + dvocifreno(x);
  }

  let poslednjeStanje = "";
  function otkucaj() {
    if (!cfg || napustio) return;
    const t = sad();
    const kraj = cfg.start + cfg.trajanje * 1000;
    let stanje;
    if (!cfg.trajanje) stanje = "ceka";
    else if (t < cfg.start - cfg.vrata * 60000) stanje = "zatvoreno";
    else if (t < cfg.start) stanje = "ceka";
    else if (t < kraj) stanje = "uzivo";
    else stanje = "kraj";

    if (stanje === "zatvoreno") {
      $("odbrojavanje-2").textContent = trajanjeTekst(cfg.start - t, true);
      $("zatvoreno-tekst").textContent = `Radionica počinje ${new Date(cfg.start).toLocaleString("sr-Latn-RS", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. Soba se otvara ${cfg.vrata} minuta ranije.`;
    }
    if (stanje === "ceka") {
      $("odbrojavanje").textContent = trajanjeTekst(cfg.start - t);
      // 15 s pre pocetka plejer vec ucitava prve delove, a krece tacno u sekundi pocetka.
      if (!prenosPokrenut && cfg.start - t <= 15000) pokreniPrenos(true);
    }
    if (stanje === "uzivo") $("vreme-trajanja").textContent = trajanjeTekst(t - cfg.start, true);

    if (stanje !== poslednjeStanje) {
      poslednjeStanje = stanje;
      $("stanje-zatvoreno").hidden = stanje !== "zatvoreno";
      $("stanje-ceka").hidden = stanje !== "ceka";
      $("stanje-kraj").hidden = stanje !== "kraj";
      // Pre pocetka nema chata ni ruke, samo odbrojavanje.
      soba.classList.toggle("pre-pocetka", stanje === "zatvoreno" || stanje === "ceka");
      $("oznaka-uzivo").hidden = stanje !== "uzivo";
      $("vreme-trajanja").hidden = stanje !== "uzivo";
      $("govornik").hidden = stanje !== "uzivo";
      if (stanje === "uzivo") { if (prenosPokrenut && cekaPocetak) kreni(); else pokreniPrenos(false); }
      else if (stanje !== "ceka" || !cekaPocetak) zaustaviPrenos();
      if (stanje === "kraj") prikaziKraj();
    }

    // Rezerva: ponuda se sama pojavi u zadatom minutu ako je tim nije poslao.
    if (stanje === "uzivo" && !ponudaPrikazana && cfg.autoPonudaMinut != null && cfg.ponuda && cfg.ponuda.link) {
      if (t >= cfg.start + cfg.autoPonudaMinut * 60000) {
        prikaziPonudu({ id: "auto", tekst: cfg.ponuda.opis, podaci: cfg.ponuda, ts: cfg.start + cfg.autoPonudaMinut * 60000, od: cfg.voditelj }, true);
      }
    }
  }

  // ---------- prenos ----------

  const video = $("prenos");

  function adresaPrenosa() {
    return `${API}/stream/${encodeURIComponent(ulaznica)}/live.m3u8`;
  }

  function pokreniPrenos(unapred) {
    if (prenosPokrenut || drugiTab) return;
    prenosPokrenut = true;
    cekaPocetak = !!unapred;
    $("stanje-povezivanje").hidden = cekaPocetak;
    video.muted = utisano;
    if (cekaPocetak) {
      clearTimeout(tajmerPocetka);
      tajmerPocetka = setTimeout(kreni, Math.max(0, cfg.start - sad()));
    }

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({
        // Server daje delove 18 s unapred (PRED u worker/src/index.js), a plejer stoji
        // 21 s iza ivice. Tako je slika +-3 s od stvarnog "sada" i uvek ima rezervu,
        // pa nema zastoja (zastoj se cuje kao isecen zvuk). Ko zaostane vise od 45 s
        // (spavao telefon, losa mreza), plejer ga sam vraca na "uzivo".
        liveSyncDuration: 21,
        liveMaxLatencyDuration: 58,
        autoStartLoad: false, // pocetnu poziciju racunamo sami, vidi LEVEL_LOADED ispod
        maxBufferLength: 30,
        backBufferLength: 10,
        manifestLoadingMaxRetry: 20,
        manifestLoadingRetryDelay: 1500,
        levelLoadingMaxRetry: 20,
        fragLoadingMaxRetry: 10,
      });
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (window.__dijagHls) window.__dijagHls(d.details + (d.fatal ? " (fatalno)" : ""));
        if (!d.fatal) { if (d.details === "bufferStalledError") postaviVezu("slaba"); return; }
        postaviVezu("slaba");
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        // Mreza je pala duze od svih pokusaja: plejer krece ispocetka, na trenutak "uzivo".
        ponovoZa(3000);
      });
      hls.loadSource(adresaPrenosa());
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!cekaPocetak) pusti(); });
      // Ivica playliste je do 24 s ispred "sada" i pomera se u koracima od 6 s. Zato
      // pri ulasku racunamo tacno koliko je ivica ispred trenutnog vremena (po
      // EXT-X-PROGRAM-DATE-TIME) i toliko stojimo iza nje: ko je tu na pocetku,
      // gleda od nulte sekunde, a svi ostali tacno trenutak "uzivo".
      let pocetak = false;
      hls.on(Hls.Events.LEVEL_LOADED, (_, d) => {
        if (pocetak) return;
        pocetak = true;
        const f = d.details && d.details.fragments;
        const zadnji = f && f[f.length - 1];
        if (cekaPocetak && f && f.length) {
          // U cekaonici: ucitavamo od nulte sekunde videa.
          hls.startLoad(f[0].start);
          return;
        }
        if (zadnji && zadnji.programDateTime) {
          const ispred = (zadnji.programDateTime + zadnji.duration * 1000 - sad()) / 1000;
          if (ispred > 0.5 && ispred < 55) hls.config.liveSyncDuration = ispred;
        }
        hls.startLoad(-1);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = adresaPrenosa();
      video.onerror = () => { if (prenosPokrenut && !hls) ponovoZa(3000); };
      video.addEventListener("loadedmetadata", () => {
        // Safari (iPhone) sam bira mesto u prenosu; postavljamo ga na tacno "sada".
        const d = video.getStartDate && video.getStartDate();
        if (d && !isNaN(d.getTime())) {
          const cilj = Math.max(0, (sad() - d.getTime()) / 1000);
          if (Math.abs(video.currentTime - cilj) > 1) { try { video.currentTime = cilj; } catch {} }
        }
        if (!cekaPocetak) pusti();
      }, { once: true });
      video.load();
    }
  }

  if (LOKALNO) window.__uzivo = { get hls() { return hls; }, video };

  // Trenutak pocetka: video je vec ucitan na 00:00, samo krece.
  function kreni() {
    clearTimeout(tajmerPocetka);
    if (!prenosPokrenut || !cekaPocetak) return;
    cekaPocetak = false;
    $("stanje-ceka").hidden = true;
    pusti();
  }

  function zaustaviPrenos() {
    clearTimeout(tajmerPocetka);
    cekaPocetak = false;
    if (!prenosPokrenut) return;
    prenosPokrenut = false;
    if (hls) { hls.destroy(); hls = null; }
    video.onerror = null;
    video.removeAttribute("src");
    try { video.load(); } catch {}
    $("stanje-povezivanje").hidden = true;
    $("zvuk-kapija").hidden = true;
  }

  async function pusti() {
    if (cekaPocetak) return;
    try {
      video.muted = utisano;
      await video.play();
    } catch {
      // Pregledac ne da zvuk bez klika: pustamo bez zvuka i nudimo dugme.
      video.muted = true;
      try { await video.play(); } catch {}
      $("zvuk-kapija").hidden = false;
    }
  }

  let tajmerPonovo = null;
  function ponovoZa(ms) {
    clearTimeout(tajmerPonovo);
    zaustaviPrenos();
    $("stanje-povezivanje").hidden = false;
    tajmerPonovo = setTimeout(() => { poslednjeStanje = ""; otkucaj(); }, ms);
  }

  function proveriVideoStanje() {
    poslednjeStanje = "";
    zaustaviPrenos();
    otkucaj();
  }

  video.addEventListener("playing", () => { $("stanje-povezivanje").hidden = true; postaviVezu("dobra"); });
  video.addEventListener("waiting", () => { if (prenosPokrenut) postaviVezu("slaba"); });
  // Nema pauze: ako bilo sta zaustavi video (slusalice, tastatura, sistem), nastavlja se.
  video.addEventListener("pause", () => { if (prenosPokrenut && !cekaPocetak && !napustio) setTimeout(() => { if (prenosPokrenut && !cekaPocetak && video.paused) video.play().catch(() => {}); }, 300); });
  video.addEventListener("ratechange", () => { if (video.playbackRate !== 1) video.playbackRate = 1; });
  // Zakljucan telefon ili drugi tab pauziraju video. Po povratku nastavlja, a ako je
  // zaostao vise od pola minuta, vraca se na trenutak "uzivo".
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !prenosPokrenut || cekaPocetak || napustio) return;
    if (hls && hls.latency && hls.targetLatency && hls.latency - hls.targetLatency > 30) { ponovoZa(0); return; }
    if (video.paused) video.play().catch(() => { $("zvuk-kapija").hidden = false; });
  });
  if ("mediaSession" in navigator) {
    for (const a of ["pause", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"]) {
      try { navigator.mediaSession.setActionHandler(a, a === "pause" ? () => video.play() : () => {}); } catch {}
    }
  }

  // Ko je usao preko linka iz mejla nije nista kliknuo, pa bi mu pregledac pustio video
  // bez zvuka. Klik na ovo dugme u cekaonici dozvoljava zvuk unapred.
  let zvukDozvoljen = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
  function osveziDugmeZvuka() {
    $("ceka-zvuk").hidden = zvukDozvoljen;
    $("ceka-zvuk-ok").hidden = !zvukDozvoljen;
  }
  document.addEventListener("pointerdown", () => { if (!zvukDozvoljen) { zvukDozvoljen = true; osveziDugmeZvuka(); } }, { capture: true });
  $("ceka-zvuk").addEventListener("click", () => {
    zvukDozvoljen = true;
    utisano = false;
    $("alatka-zvuk").classList.remove("utisano");
    // Sam klik pregledacu dozvoljava zvuk; video se NE pokrece ovde (krenuo bi pre pocetka).
    osveziDugmeZvuka();
  });
  osveziDugmeZvuka();

  $("zvuk-kapija").addEventListener("click", () => {
    utisano = false;
    video.muted = false;
    video.play().catch(() => {});
    $("zvuk-kapija").hidden = true;
    $("alatka-zvuk").classList.remove("utisano");
  });

  $("alatka-zvuk").addEventListener("click", () => {
    utisano = !utisano;
    video.muted = utisano;
    $("alatka-zvuk").classList.toggle("utisano", utisano);
    if (!utisano) { $("zvuk-kapija").hidden = true; video.play().catch(() => {}); }
  });

  $("alatka-ekran").addEventListener("click", () => {
    const p = $("pozornica");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (p.requestFullscreen) p.requestFullscreen().catch(() => {});
  });

  // ---------- chat ----------

  function prazanChat() {
    if (!$("poruke").children.length) $("poruke").append(el("p", "poruke-prazno", "Imaš pitanje? Piši ovde, tim odgovara tokom radionice."));
  }

  function vremeKratko(ts) {
    return new Date(ts).toLocaleTimeString("sr-Latn-RS", { hour: "2-digit", minute: "2-digit" });
  }

  function blizuDna() {
    const p = $("poruke");
    return p.scrollHeight - p.scrollTop - p.clientHeight < 120;
  }
  function skrolujDole() { const p = $("poruke"); p.scrollTop = p.scrollHeight; }

  function dodajPoruku(p, uzivo) {
    const kontejner = $("poruke");
    const prazno = kontejner.querySelector(".poruke-prazno");
    if (prazno) prazno.remove();
    if (p.id && kontejner.querySelector(`[data-id="${p.id}"]`)) return;
    const dole = blizuDna();
    const ja = p.ko === "u";
    const red = el("div", "poruka " + (ja ? "ja" : "tim"));
    if (p.id) red.dataset.id = p.id;
    const ko = el("div", "ko");
    if (ja) ko.append("Ti");
    else { ko.append(el("b", null, p.ime_tima)); ko.append(" (tim)"); }
    ko.append(el("time", null, vremeKratko(p.ts)));
    red.append(ko, el("div", "balon", p.tekst));
    kontejner.append(red);
    if (dole || ja || !uzivo) skrolujDole();
    return red;
  }

  function dodajObjavu(o, uzivo) {
    if (o.vrsta === "ponuda") { prikaziPonudu(o, uzivo); return; }
    const kontejner = $("poruke");
    const prazno = kontejner.querySelector(".poruke-prazno");
    if (prazno) prazno.remove();
    const dole = blizuDna();
    const red = el("div", "poruka objava");
    red.dataset.objava = o.id;
    const ko = el("div", "ko");
    ko.append(el("b", null, o.od || cfg.voditelj), " · svima", el("time", null, vremeKratko(o.ts)));
    red.append(ko, el("div", "balon", o.tekst));
    kontejner.append(red);
    if (dole || !uzivo) skrolujDole();
    if (!uzivo) { $("mob-objava").textContent = ""; $("mob-objava").append(red.cloneNode(true)); }
    if (uzivo) {
      const traka = $("objava-traka");
      traka.textContent = "";
      const x = el("button", null, "×");
      x.setAttribute("aria-label", "Zatvori");
      x.onclick = () => (traka.hidden = true);
      traka.append(el("b", null, (o.od || cfg.voditelj) + " · poruka za sve"), el("p", null, o.tekst), x);
      traka.hidden = false;
      clearTimeout(traka._t);
      traka._t = setTimeout(() => (traka.hidden = true), 20000);
      zvucnik();
      const mob = $("mob-objava");
      mob.textContent = "";
      const kopija = red.cloneNode(true);
      mob.append(kopija);
      if (!panelOtvoren()) povecajNeprocitano();
    }
  }

  $("forma-poruka").addEventListener("submit", (e) => {
    e.preventDefault();
    const polje = $("unos-poruke");
    const tekst = polje.value.trim();
    if (!tekst) return;
    const c = Math.random().toString(36).slice(2, 10);
    if (!posalji({ t: "poruka", tekst, c })) { obavesti("Veza", "Nema veze. Poruka će moći da se pošalje čim se veza vrati."); return; }
    const privremena = dodajPoruku({ ko: "u", tekst, ts: sad() }, true);
    privremena.classList.add("salje");
    privremena.dataset.c = c;
    polje.value = "";
    polje.style.height = "";
  });
  $("unos-poruke").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("forma-poruka").requestSubmit(); }
  });
  $("unos-poruke").addEventListener("input", (e) => {
    e.target.style.height = "";
    e.target.style.height = Math.min(120, e.target.scrollHeight) + "px";
  });

  // ---------- panel, nepročitano, obaveštenja ----------

  const mobilni = () => matchMedia("(max-width: 900px)").matches;
  const soba = $("ekran-soba");
  const panelOtvoren = () => soba.classList.contains("chat-otvoren");

  function postaviPanel(otvoren) {
    soba.classList.toggle("chat-otvoren", otvoren);
    $("panel").classList.toggle("zatvoren", !otvoren);
    $("alatka-chat").classList.toggle("aktivna", otvoren);
    $("alatka-chat").setAttribute("aria-expanded", String(otvoren));
    if (otvoren) {
      neprocitano = 0;
      $("znacka-chat").hidden = true; $("znacka-mob").hidden = true; $("obavestenje").hidden = true;
      skrolujDole();
    } else {
      $("unos-poruke").blur();
    }
  }
  $("alatka-chat").addEventListener("click", () => postaviPanel(!panelOtvoren()));
  $("panel-zatvori").addEventListener("click", () => postaviPanel(false));
  $("mob-chat").addEventListener("click", () => { postaviPanel(true); $("unos-poruke").focus(); });

  // Telefon: visina sobe prati vidljivi deo ekrana (tastatura), a dok se kuca sklanjamo alatke.
  if (window.visualViewport) {
    const visina = () => {
      document.documentElement.style.setProperty("--app-h", window.visualViewport.height + "px");
      if (mobilni()) window.scrollTo(0, 0);
    };
    window.visualViewport.addEventListener("resize", visina);
    visina();
  }
  $("unos-poruke").addEventListener("focus", () => { if (mobilni()) soba.classList.add("kucanje"); });
  $("unos-poruke").addEventListener("blur", () => soba.classList.remove("kucanje"));

  function povecajNeprocitano() {
    neprocitano++;
    for (const id of ["znacka-chat", "znacka-mob"]) {
      const z = $(id);
      z.textContent = neprocitano > 9 ? "9+" : neprocitano;
      z.hidden = false;
    }
  }

  function obavesti(naslov, tekst, vrsta) {
    const o = $("obavestenje");
    o.dataset.vrsta = vrsta || "";
    o.textContent = "";
    o.append(el("b", null, naslov), el("p", null, tekst));
    o.hidden = false;
    clearTimeout(o._t);
    o._t = setTimeout(() => (o.hidden = true), 8000);
  }
  function sakrijObavestenje(vrsta) {
    const o = $("obavestenje");
    if (o.dataset.vrsta !== vrsta) return;
    clearTimeout(o._t);
    o.hidden = true;
  }
  $("obavestenje").addEventListener("click", () => { if (!soba.classList.contains("pre-pocetka")) postaviPanel(true); });

  function obavestiOPoruci(p) {
    zvucnik();
    $("mob-chat-pregled").textContent = `${p.ime_tima} (tim): ${p.tekst}`;
    if (!panelOtvoren()) { povecajNeprocitano(); obavesti(p.ime_tima + " (tim)", p.tekst); }
    if (document.hidden) {
      const stari = document.title;
      document.title = "(1) Nova poruka · " + stari.replace(/^\(1\) Nova poruka · /, "");
      const vrati = () => { document.title = stari.replace(/^\(1\) Nova poruka · /, ""); document.removeEventListener("visibilitychange", vrati); };
      document.addEventListener("visibilitychange", vrati);
    }
  }

  let zvukCtx = null;
  function zvucnik() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      // Audio kanal se otvara samo za signal i odmah gasi. Stalno otvoren kanal na
      // macOS-u ume da prebaci izlaz zvuka i izazove krcanje u videu.
      zvukCtx = zvukCtx || new C();
      if (zvukCtx.state === "suspended") zvukCtx.resume();
      clearTimeout(zvukCtx._t);
      zvukCtx._t = setTimeout(() => { try { zvukCtx.suspend(); } catch {} }, 700);
      const t = zvukCtx.currentTime;
      for (const [f, d] of [[880, 0], [1320, 0.09]]) {
        const o = zvukCtx.createOscillator(), g = zvukCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d);
        g.gain.exponentialRampToValueAtTime(0.12, t + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
        o.connect(g).connect(zvukCtx.destination);
        o.start(t + d); o.stop(t + d + 0.25);
      }
    } catch {}
  }

  // ---------- ponuda ----------

  function karticaPonude(o, mesto) {
    const pod = o.podaci || cfg.ponuda || {};
    const k = el("div", "ponuda");
    k.append(el("small", null, "Specijalna ponuda"), el("h4", null, pod.naslov || ""), el("p", null, o.tekst || pod.opis || ""));
    if (pod.link) {
      const a = el("a", null, pod.dugme || "Saznaj više");
      a.href = pod.link; a.target = "_blank"; a.rel = "noopener";
      a.addEventListener("click", () => posalji({ t: "klik", mesto }));
      k.append(a);
    }
    return k;
  }

  function prikaziPonudu(o, uzivo) {
    if (ponudaObjava && ponudaObjava.id !== "auto" && o.id === "auto") return;
    ponudaObjava = o;
    ponudaPrikazana = true;
    const z = $("ponuda-zakacena");
    z.textContent = ""; z.append(karticaPonude(o, "chat")); z.hidden = false;
    z.dataset.objava = o.id;
    const p = $("ponuda-plutajuca");
    p.textContent = "";
    p.append(karticaPonude(o, "video"));
    const x = el("button", "zatvori-ponudu", "×");
    x.setAttribute("aria-label", "Zatvori"); x.onclick = () => (p.hidden = true);
    p.firstChild.style.position = "relative";
    p.firstChild.append(x);
    p.dataset.objava = o.id;
    if (uzivo) { p.hidden = false; zvucnik(); }
    const mob = $("mob-ponuda");
    mob.textContent = ""; mob.append(karticaPonude(o, "telefon"));
    prikaziKraj();
  }

  function prikaziKraj() {
    const k = $("kraj-ponuda");
    k.textContent = "";
    const o = ponudaObjava || (cfg && cfg.ponuda && cfg.ponuda.link ? { id: "kraj", tekst: cfg.ponuda.opis, podaci: cfg.ponuda } : null);
    if (o) k.append(karticaPonude(o, "kraj"));
  }

  // ---------- ankete ----------

  function prikaziAnketu(a, glasao) {
    anketaId = a.id;
    $("anketa-pitanje").textContent = a.pitanje;
    const opcije = $("anketa-opcije");
    opcije.textContent = "";
    a.opcije.forEach((tekst, i) => {
      const b = el("button", null, tekst);
      b.onclick = () => {
        posalji({ t: "glas", anketa: a.id, opcija: i });
        opcije.querySelectorAll("button").forEach((x) => (x.disabled = true));
        b.classList.add("izabrano");
        $("anketa-hvala").hidden = false;
        setTimeout(() => { if (anketaId === a.id) $("anketa").hidden = true; }, 2500);
      };
      opcije.append(b);
    });
    $("anketa-hvala").hidden = true;
    $("anketa").hidden = false;
  }
  $("anketa-zatvori").addEventListener("click", () => ($("anketa").hidden = true));

  // ---------- podignuta ruka ----------

  function postaviRuku(gore) {
    rukaGore = !!gore;
    const b = $("alatka-ruka");
    b.setAttribute("aria-pressed", String(rukaGore));
    $("ruka-tekst").textContent = rukaGore ? "Spusti ruku" : "Podigni ruku";
    if (!rukaGore) sakrijObavestenje("ruka");
  }
  $("alatka-ruka").addEventListener("click", () => {
    const gore = !rukaGore;
    if (!posalji({ t: "ruka", gore })) { obavesti("Veza", "Nema veze. Pokušaj ponovo za par sekundi."); return; }
    postaviRuku(gore);
    if (gore) obavesti("Ruka je podignuta ✋", "Tim radionice vidi da imaš pitanje. Možeš i da ga napišeš u chatu.", "ruka");
  });

  // ---------- jedan tab ----------
  // Dva taba sa radionicom u istom pregledacu pustaju isti zvuk sa razmakom od par
  // desetina milisekundi, sto zvuci kao robot. Noviji tab preuzima, stariji staje.
  const mojTab = Math.random().toString(36).slice(2);
  let drugiTab = false;
  let kanal = null;
  try { kanal = new BroadcastChannel("uzivo-radionica"); } catch {}
  function zauzmiTab() {
    drugiTab = false;
    $("stanje-drugi-tab").hidden = true;
    if (kanal) kanal.postMessage({ t: "ovde", id: mojTab });
  }
  if (kanal) {
    kanal.onmessage = (e) => {
      const m = e.data || {};
      if (m.t === "ovde" && m.id !== mojTab && !drugiTab) {
        drugiTab = true;
        zaustaviPrenos();
        $("stanje-drugi-tab").hidden = false;
      }
      if (m.t === "ping" && m.id !== mojTab) kanal.postMessage({ t: "pong", id: mojTab });
      if (m.t === "pong" && m.id !== mojTab) dijagTabovi.add(m.id);
    };
  }
  $("dugme-ovde").addEventListener("click", () => { zauzmiTab(); poslednjeStanje = ""; otkucaj(); });

  // ---------- dijagnostika (/uzivo?dijagnostika=1) ----------
  const dijagTabovi = new Set();
  try { if (/[?&]dijagnostika=1/.test(location.search)) sessionStorage.setItem("dijag", "1"); } catch {}
  let dijagUkljucena = false;
  try { dijagUkljucena = sessionStorage.getItem("dijag") === "1"; } catch {}
  if (dijagUkljucena) {
    const d = $("dijag");
    d.hidden = false;
    const brojaci = { waiting: 0, stalled: 0, seeking: 0, ratechange: 0, pause: 0, hlsGreske: [] };
    ["waiting", "stalled", "seeking", "ratechange", "pause"].forEach((ev) => video.addEventListener(ev, () => brojaci[ev]++));
    let poslednjiOtkucaj = performance.now(), maxKasnjenje = 0, aud0 = 0, vreme0 = performance.now();
    setInterval(() => {
      const sadP = performance.now();
      maxKasnjenje = Math.max(maxKasnjenje, sadP - poslednjiOtkucaj - 250);
      poslednjiOtkucaj = sadP;
    }, 250);
    setInterval(() => {
      dijagTabovi.clear();
      if (kanal) kanal.postMessage({ t: "ping", id: mojTab });
      const sb = hls && hls.bufferController && hls.bufferController.sourceBuffer || {};
      const opsezi = (b) => { try { return b ? Array.from({ length: b.buffered.length }, (_, i) => b.buffered.start(i).toFixed(2) + "-" + b.buffered.end(i).toFixed(2)).join(" ") : "-"; } catch { return "?"; } };
      const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : {};
      const aud = video.webkitAudioDecodedByteCount || 0;
      const audBrzina = ((aud - aud0) / ((performance.now() - vreme0) / 1000) / 1024).toFixed(1);
      aud0 = aud; vreme0 = performance.now();
      const pd = hls && hls.playingDate;
      const red = [
        `stvarno ${cfg ? ((sad() - cfg.start) / 1000).toFixed(1) : "-"} s   video ${pd ? ((pd.getTime() - cfg.start) / 1000).toFixed(1) : "-"} s   t=${video.currentTime.toFixed(2)}`,
        `brzina ${video.playbackRate}  pauza ${video.paused}  utisan ${video.muted}  jacina ${video.volume}`,
        `bafer audio ${opsezi(sb.audio)}`,
        `bafer video ${opsezi(sb.video)}`,
        `bafer zajedno ${opsezi(sb.audiovideo)}`,
        `zastoji ${brojaci.waiting}  stalled ${brojaci.stalled}  premotavanja ${brojaci.seeking}  promene brzine ${brojaci.ratechange}  pauze ${brojaci.pause}`,
        `kadrovi izgubljeni ${q.droppedVideoFrames ?? "-"} od ${q.totalVideoFrames ?? "-"}   dekodiran zvuk ${audBrzina} KB/s`,
        `kasnjenje glavne niti max ${Math.round(maxKasnjenje)} ms   tab skriven ${document.hidden}`,
        `plejer ${hls ? "hls.js" : (video.currentSrc ? "Safari" : "nije pokrenut")}  kasnjenje ${hls && hls.latency ? hls.latency.toFixed(1) : "-"} s  propusnost ${hls && hls.bandwidthEstimate ? (hls.bandwidthEstimate / 1e6).toFixed(1) + " Mbit/s" : "-"}`,
        `drugih tabova sa radionicom ${dijagTabovi.size}`,
        `hls upozorenja: ${brojaci.hlsGreske.slice(-4).join(" | ") || "nema"}`,
        navigator.userAgent.replace(/\(KHTML.*$/, ""),
      ];
      d.textContent = red.join("\n");
      maxKasnjenje = 0;
    }, 1000);
    window.__dijagHls = (det) => { brojaci.hlsGreske.push(((sad() - (cfg ? cfg.start : 0)) / 1000).toFixed(0) + "s " + det); };
  }

  // ---------- izlazak ----------

  $("alatka-napusti").addEventListener("click", () => ($("modal-napusti").hidden = false));
  $("napusti-ne").addEventListener("click", () => ($("modal-napusti").hidden = true));
  $("napusti-da").addEventListener("click", () => {
    $("modal-napusti").hidden = true;
    napustio = true;
    zaustaviPrenos();
    try { ws && ws.close(1000); } catch {}
    ["stanje-ceka", "stanje-zatvoreno", "stanje-kraj", "stanje-povezivanje"].forEach((id) => ($(id).hidden = true));
    $("oznaka-uzivo").hidden = true; $("vreme-trajanja").hidden = true; $("govornik").hidden = true;
    $("stanje-napustio").hidden = false;
  });
  $("dugme-vrati").addEventListener("click", () => {
    napustio = false;
    poslednjeStanje = "";
    $("stanje-napustio").hidden = true;
    poveziSe();
  });

  // ---------- start ----------

  const sacuvano = skladiste.get(KLJUC);
  // Link iz mejla sa drugim emailom od sacuvanog (dve osobe na istom uredjaju, proba
  // tima): vazi link, ne stari ulaz.
  const emailIzLinka = (new URLSearchParams(location.search).get("email") || "").trim().toLowerCase();
  let emailSacuvan = "";
  try { emailSacuvan = JSON.parse(decodeURIComponent(escape(atob(sacuvano.ulaznica.split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))))).e || ""; } catch {}
  if (sacuvano && emailIzLinka && emailSacuvan && emailIzLinka !== emailSacuvan) skladiste.del(KLJUC);
  else if (sacuvano && sacuvano.ulaznica && emailIzLinka) history.replaceState(null, "", location.pathname);
  if (sacuvano && sacuvano.ulaznica && !(emailIzLinka && emailSacuvan && emailIzLinka !== emailSacuvan)) {
    ulaznica = sacuvano.ulaznica; ime = sacuvano.ime || "";
    udjiUSobu(false);
  } else {
    prikaziUlaz();
  }
})();
