// Popup pri izlasku sa stranice (/ponuda i /ponuda-2).
// Posetilac ostavi ime i broj (ide na /api/poziv, pregled na /pozivi),
// Vladimir ga zove. Naglašava da upis traje do nedelje.
//
// Uključuje se ovako (posle glavnog skripta stranice):
//   <script src="/assets/js/izlaz.js?v=2" data-rok="2026-11-23T00:00:00+01:00" defer></script>
//
// Linkovi sa data-pitanja (npr. u čestim pitanjima) otvaraju isti popup na klik.
//
// Okidači:
//   desktop  · miš izađe kroz gornju ivicu prozora (ka tabovima, adresi, X)
//   telefon  · dugme "nazad" (jednom ga presretnemo) ili brz skrol nagore posle čitanja
// Prikazuje se najviše jednom po poseti, ne pre 8 sekundi na stranici,
// ne posle klika na upis i ne kad ponuda istekne.
(function () {
  var skript = document.currentScript;
  var API = "/api/poziv";
  var ROK = (skript && skript.getAttribute("data-rok")) || "2026-11-23T00:00:00+01:00";
  var KLJUC = "izlaz_popup_" + location.pathname;
  var MIN_MS = 8000;

  var kraj = new Date(ROK).getTime();
  if (!(kraj > Date.now())) return;

  function procitaj(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function upisi(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function salji(ime, svojstva) {
    if (window.posthog && typeof window.posthog.capture === "function") window.posthog.capture(ime, svojstva || {});
  }

  var pocetak = Date.now();
  var prikazan = procitaj(KLJUC) === "1" || procitaj("izlaz_poslato") === "1";
  var otvoren = false;

  // ---------- izgled ----------
  var css = [
    ".izl{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;",
    "background:rgba(28,25,22,.55);opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s}",
    ".izl.otvoren{opacity:1;visibility:visible}",
    ".izl-kutija{position:relative;width:100%;max-width:460px;max-height:calc(100vh - 32px);overflow:auto;background:var(--belo,#fff);",
    "color:var(--tekst,#1C1916);border-radius:20px;padding:32px 28px 24px;box-shadow:0 24px 60px rgba(28,25,22,.28);",
    "text-align:center;transform:translateY(16px) scale(.98);transition:transform .3s cubic-bezier(.2,.8,.2,1)}",
    ".izl.otvoren .izl-kutija{transform:none}",
    ".izl-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:50%;background:transparent;",
    "color:var(--siva,#6E665E);font-size:26px;line-height:1;cursor:pointer}",
    ".izl-x:hover{background:var(--bg,#FAF8F5)}",
    ".izl-nad{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;",
    "color:var(--narandza,#E8601C);background:var(--narandza-svetla,#FFF1E8);padding:5px 12px;border-radius:999px;margin-bottom:14px}",
    ".izl h2{font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-.02em;margin:0 0 10px}",
    ".izl p{font-size:16px;line-height:1.5;color:var(--siva,#6E665E);margin:0}",
    ".izl-rok{margin:18px 0 18px;padding:14px 16px;border-radius:14px;background:var(--narandza-svetla,#FFF1E8);",
    "border:1px solid rgba(232,96,28,.25);color:var(--tekst,#1C1916);font-size:15px;line-height:1.45}",
    ".izl-rok b{color:var(--narandza-tamna,#CF5112)}",
    ".izl-rok .izl-sat{display:block;margin-top:4px;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--narandza-tamna,#CF5112)}",
    ".izl-dugme{display:block;width:100%;padding:16px 20px;border-radius:12px;font-size:17px;font-weight:700;text-decoration:none;",
    "background:var(--narandza,#E8601C);color:#fff;transition:background .2s}",
    ".izl-dugme:hover{background:var(--narandza-tamna,#CF5112)}",
    ".izl-drugo{display:block;width:100%;margin-top:10px;padding:14px 20px;border-radius:12px;font-size:16px;font-weight:600;",
    "text-decoration:none;color:var(--tekst,#1C1916);border:1.5px solid var(--linija,#E9E4DD);background:transparent}",
    ".izl-drugo:hover{border-color:var(--tekst,#1C1916)}",
    ".izl-ne{margin-top:14px;border:0;background:none;font:inherit;font-size:14px;color:var(--siva,#6E665E);",
    "text-decoration:underline;cursor:pointer;padding:6px}",
    ".izl-forma{display:grid;gap:10px;text-align:left}",
    ".izl-forma label{display:block;font-size:13px;font-weight:600;color:var(--tekst,#1C1916);margin-bottom:4px}",
    ".izl-forma input{width:100%;font:inherit;font-size:16px;padding:13px 14px;border-radius:12px;border:1.5px solid var(--linija,#E9E4DD);",
    "background:var(--bg,#FAF8F5);color:var(--tekst,#1C1916);outline:none;transition:border-color .2s}",
    ".izl-forma input:focus{border-color:var(--narandza,#E8601C);background:#fff}",
    ".izl-forma .izl-dugme{border:0;cursor:pointer;font:inherit;font-size:17px;font-weight:700;margin-top:4px}",
    ".izl-forma .izl-dugme[disabled]{opacity:.6;cursor:wait}",
    ".izl-zamka{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}",
    ".izl-greska{color:#C2331F!important;font-size:14px!important;text-align:center;min-height:0}",
    ".izl-greska:empty{display:none}",
    ".izl-mala{font-size:13px!important;text-align:center;margin-top:2px!important}",
    ".izl-hvala{display:none}",
    ".izl.poslato .izl-hvala{display:block}",
    ".izl.poslato .izl-pre{display:none}",
    ".izl-hvala .izl-kvacica{width:56px;height:56px;margin:4px auto 14px;border-radius:50%;background:var(--zelena-svetla,#E6F4EC);",
    "color:var(--zelena,#1E8A4C);display:flex;align-items:center;justify-content:center}",
    "@media (max-width:560px){.izl{align-items:flex-end;padding:0}",
    ".izl-kutija{max-width:none;border-radius:20px 20px 0 0;padding:28px 16px calc(18px + env(safe-area-inset-bottom));",
    "max-height:92vh;transform:translateY(100%)}",
    ".izl h2{font-size:23px}}",
    "@media (prefers-reduced-motion:reduce){.izl,.izl-kutija{transition:none}}",
    "body.izl-zakljucan{overflow:hidden}"
  ].join("");
  var stil = document.createElement("style");
  stil.textContent = css;
  document.head.appendChild(stil);

  var el = document.createElement("div");
  el.className = "izl";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="izl-kutija" role="dialog" aria-modal="true" aria-labelledby="izl-naslov" tabindex="-1">' +
      '<button type="button" class="izl-x" data-izl-zatvori aria-label="Zatvori">&times;</button>' +
      '<span class="izl-nad">Pre nego što odeš</span>' +
      '<div class="izl-pre">' +
        '<h2 id="izl-naslov">Imaš pitanje pre upisa?</h2>' +
        '<p>Ostavi ime i broj. Vladimir te zove lično i odgovara na sve što te zanima.</p>' +
        '<div class="izl-rok">Upis je otvoren <b>samo do nedelje u ponoć</b>. Posle toga ponuda se zatvara.' +
          '<span class="izl-sat" data-izl-sat></span></div>' +
        '<form class="izl-forma" data-izl-forma novalidate>' +
          '<div><label for="izl-ime">Ime</label>' +
          '<input id="izl-ime" name="ime" type="text" autocomplete="given-name" maxlength="60" required></div>' +
          '<div><label for="izl-tel">Broj telefona</label>' +
          '<input id="izl-tel" name="telefon" type="tel" inputmode="tel" autocomplete="tel" placeholder="06x xxx xxxx" maxlength="20" required></div>' +
          '<div class="izl-zamka" aria-hidden="true"><input name="zamka" tabindex="-1" autocomplete="off"></div>' +
          '<p class="izl-greska" data-izl-greska role="alert"></p>' +
          '<button type="submit" class="izl-dugme">Pozovite me</button>' +
          '<p class="izl-mala">Zovemo svakog dana od 10 do 17h.</p>' +
        '</form>' +
      '</div>' +
      '<div class="izl-hvala" role="status">' +
        '<div class="izl-kvacica"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg></div>' +
        '<h2>Hvala<span data-izl-hvala-ime></span>!</h2>' +
        '<p>Vladimir te zove između 10 i 17h. Javi se kad zazvoni nepoznat broj.</p>' +
        '<div class="izl-rok">Ne zaboravi: upis je otvoren <b>samo do nedelje u ponoć</b>.</div>' +
      '</div>' +
      '<a class="izl-drugo" data-izl-upis href="#">Upiši se odmah za 497 €</a>' +
      '<button type="button" class="izl-ne" data-izl-zatvori>Ne, hvala</button>' +
    '</div>';
  document.body.appendChild(el);

  var kutija = el.querySelector(".izl-kutija");
  var sat = el.querySelector("[data-izl-sat]");
  var upis = el.querySelector("[data-izl-upis]");
  var forma = el.querySelector("[data-izl-forma]");
  var greskaEl = el.querySelector("[data-izl-greska]");

  // ---------- odbrojavanje u popupu ----------
  var dv = function (n) { return n < 10 ? "0" + n : String(n); };
  var satInterval;
  function tik() {
    var ms = kraj - Date.now();
    if (ms <= 0) { sat.textContent = "Ponuda je istekla"; clearInterval(satInterval); return; }
    var s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sek = s % 60;
    sat.textContent = "Ističe za " + (d > 0 ? d + "d " : "") + dv(h) + ":" + dv(m) + ":" + dv(sek);
  }

  // ---------- otvaranje i zatvaranje ----------
  var prethodniFokus = null;
  // rucno = otvoren klikom na link (npr. "Imaš pitanje?"), tada ne važe pravila za izlazak.
  function otvori(okidac, rucno) {
    if (otvoren) return;
    if (!rucno) {
      if (prikazan) return;
      if (Date.now() - pocetak < MIN_MS) return;
      if (procitaj("izlaz_upis_klik") === "1") return;
      if (document.body.classList.contains("isteklo-sve")) return;
      upisi(KLJUC, "1");
    }
    prikazan = otvoren = true;

    // Dugme za upis vodi na isti checkout kao glavno dugme na stranici.
    var glavno = document.querySelector('a[data-checkout][data-plan="jednokratno"]');
    if (glavno && glavno.href && glavno.getAttribute("href") !== "#") {
      upis.href = glavno.href;
    } else {
      upis.style.display = "none";
    }

    tik();
    satInterval = setInterval(tik, 1000);
    prethodniFokus = document.activeElement;
    el.setAttribute("aria-hidden", "false");
    el.classList.add("otvoren");
    document.body.classList.add("izl-zakljucan");
    setTimeout(function () {
      var prvo = rucno && !el.classList.contains("poslato") ? el.querySelector("#izl-ime") : kutija;
      prvo.focus({ preventScroll: true });
    }, 50);
    salji("izlaz_popup_prikazan", { okidac: okidac });
  }
  function zatvori(nacin) {
    if (!otvoren) return;
    otvoren = false;
    clearInterval(satInterval);
    el.classList.remove("otvoren");
    el.setAttribute("aria-hidden", "true");
    document.body.classList.remove("izl-zakljucan");
    if (prethodniFokus && prethodniFokus.focus) prethodniFokus.focus({ preventScroll: true });
    if (nacin) salji("izlaz_popup_zatvoren", { nacin: nacin });
  }

  el.addEventListener("click", function (e) {
    if (e.target === el) zatvori("pozadina");
    else if (e.target.closest("[data-izl-zatvori]")) zatvori("dugme");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") zatvori("esc");
    if (e.key === "Tab" && otvoren) {
      var f = Array.prototype.filter.call(kutija.querySelectorAll("a[href],button,input:not([tabindex='-1'])"), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var prvi = f[0], poslednji = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === prvi || document.activeElement === kutija)) { e.preventDefault(); poslednji.focus(); }
      else if (!e.shiftKey && document.activeElement === poslednji) { e.preventDefault(); prvi.focus(); }
    }
  });
  // ---------- slanje imena i broja ----------
  forma.addEventListener("submit", function (e) {
    e.preventDefault();
    var ime = forma.ime.value.trim();
    var telefon = forma.telefon.value.trim();
    greskaEl.textContent = "";
    if (!ime) { greskaEl.textContent = "Upiši svoje ime."; forma.ime.focus(); return; }
    if (telefon.replace(/\D/g, "").length < 8) { greskaEl.textContent = "Upiši ceo broj telefona."; forma.telefon.focus(); return; }
    var dugme = forma.querySelector("button[type=submit]");
    dugme.disabled = true;
    dugme.textContent = "Šaljem...";
    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ime: ime, telefon: telefon, stranica: location.pathname.replace(/\.html$/, ""), zamka: forma.zamka.value })
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.poruka) || "Nije poslato. Pokušaj ponovo.");
        upisi("izlaz_poslato", "1");
        el.querySelector("[data-izl-hvala-ime]").textContent = ", " + ime.split(" ")[0];
        el.classList.add("poslato");
        el.querySelector(".izl-ne").textContent = "Zatvori";
        kutija.focus({ preventScroll: true });
        salji("izlaz_popup_klik", { akcija: "ostavio_broj" });
      })
      .catch(function (err) {
        greskaEl.textContent = err.message || "Nije poslato. Pokušaj ponovo.";
      })
      .then(function () {
        dugme.disabled = false;
        dugme.textContent = "Pozovite me";
      });
  });

  // Linkovi "Imaš pitanje?" na stranici otvaraju isti popup.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-pitanja]");
    if (!a) return;
    e.preventDefault();
    salji("izlaz_popup_klik", { akcija: "link_pitanja" });
    otvori("link_pitanja", true);
  });
  upis.addEventListener("click", function () {
    upisi("izlaz_upis_klik", "1");
    salji("izlaz_popup_klik", { akcija: "upis" });
    salji("checkout_klik", { plan: "jednokratno", vrednost: 497, valuta: "EUR", izvor: "izlaz_popup" });
    if (typeof window.metaDogadjaj === "function") {
      window.metaDogadjaj("InitiateCheckout", { content_name: "InfoCash Metoda", value: 497, currency: "EUR" });
    }
  });

  // Ko je kliknuo na upis bilo gde na stranici, ne dobija popup.
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a[data-checkout]")) upisi("izlaz_upis_klik", "1");
  }, true);

  // ---------- okidač: desktop, miš izlazi kroz vrh ----------
  var fino = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (fino) {
    document.documentElement.addEventListener("mouseleave", function (e) {
      if (e.clientY <= 0) otvori("mis_ka_vrhu");
    });
  }

  // ---------- okidač: dugme "nazad" (radi i na telefonu i na desktopu) ----------
  // Na trenutni unos istorije stavimo oznaku, pa dodamo još jedan sa istim URL-om.
  // Prvo "nazad" vraća na označeni unos: tada prikažemo popup umesto izlaska.
  // Hash linkovi (#sekcija) prave unose bez oznake, pa ih ignorišemo.
  var zamkaPostavljena = false;
  function postaviZamku() {
    if (zamkaPostavljena || prikazan || !history.pushState) return;
    zamkaPostavljena = true;
    try {
      history.replaceState(Object.assign({}, history.state || {}, { izlaz: "baza" }), "");
      history.pushState({ izlaz: "zamka" }, "");
    } catch (e) {}
  }
  // Brauzeri traže interakciju korisnika pre nego što priznaju dodati unos istorije.
  ["pointerdown", "touchstart", "keydown", "scroll"].forEach(function (tip) {
    window.addEventListener(tip, function jednom() {
      if (Date.now() - pocetak < 1500) return;
      window.removeEventListener(tip, jednom, true);
      postaviZamku();
    }, { capture: true, passive: true });
  });
  window.addEventListener("popstate", function (e) {
    if (!e.state || e.state.izlaz !== "baza") return;
    if (otvoren) { zatvori("nazad"); history.back(); return; }
    if (prikazan || Date.now() - pocetak < MIN_MS || procitaj("izlaz_upis_klik") === "1") { history.back(); return; }
    otvori("dugme_nazad");
  });

  // ---------- okidač: telefon, brz skrol nagore posle čitanja ----------
  if (!fino) {
    var poslY = window.scrollY, poslT = Date.now(), najdalje = 0;
    window.addEventListener("scroll", function () {
      var y = window.scrollY, t = Date.now();
      najdalje = Math.max(najdalje, y);
      var dt = t - poslT;
      if (dt > 40) {
        var brzina = (y - poslY) / dt; // px po ms, negativno = nagore
        if (brzina < -2.5 && najdalje > window.innerHeight * 2.5 && y > window.innerHeight * 0.5) otvori("brz_skrol_nagore");
        poslY = y; poslT = t;
      }
    }, { passive: true });
  }
})();
