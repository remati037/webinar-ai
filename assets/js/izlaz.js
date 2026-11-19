// Popup pri izlasku sa stranice (/ponuda i /ponuda-2).
// Nudi poziv za pitanja i naglašava da upis traje do nedelje.
//
// Uključuje se ovako (posle glavnog skripta stranice):
//   <script src="/assets/js/izlaz.js?v=1" data-poziv="LINK_ZA_ZAKAZIVANJE" data-rok="2026-11-23T00:00:00+01:00" defer></script>
//
// Okidači:
//   desktop  · miš izađe kroz gornju ivicu prozora (ka tabovima, adresi, X)
//   telefon  · dugme "nazad" (jednom ga presretnemo) ili brz skrol nagore posle čitanja
// Prikazuje se najviše jednom po poseti, ne pre 8 sekundi na stranici,
// ne posle klika na upis i ne kad ponuda istekne.
(function () {
  var skript = document.currentScript;
  var LINK_POZIV = (skript && skript.getAttribute("data-poziv")) || "#";
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
  var prikazan = procitaj(KLJUC) === "1";
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
    ".izl-rok{margin:20px 0 22px;padding:14px 16px;border-radius:14px;background:var(--narandza-svetla,#FFF1E8);",
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
      '<h2 id="izl-naslov">Imaš pitanje pre upisa?</h2>' +
      '<p>Zakaži kratak poziv. Odgovorićemo na sve što te zanima, da odluku doneseš bez nagađanja.</p>' +
      '<div class="izl-rok">Upis je otvoren <b>samo do nedelje u ponoć</b>. Posle toga ponuda se zatvara.' +
        '<span class="izl-sat" data-izl-sat></span></div>' +
      '<a class="izl-dugme" data-izl-poziv href="' + LINK_POZIV + '" target="_blank" rel="noopener">Zakaži poziv</a>' +
      '<a class="izl-drugo" data-izl-upis href="#">Upiši se odmah za 497 €</a>' +
      '<button type="button" class="izl-ne" data-izl-zatvori>Ne, hvala</button>' +
    '</div>';
  document.body.appendChild(el);

  var kutija = el.querySelector(".izl-kutija");
  var sat = el.querySelector("[data-izl-sat]");
  var upis = el.querySelector("[data-izl-upis]");

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
  function otvori(okidac) {
    if (prikazan || otvoren) return;
    if (Date.now() - pocetak < MIN_MS) return;
    if (procitaj("izlaz_upis_klik") === "1") return;
    if (document.body.classList.contains("isteklo-sve")) return;
    prikazan = otvoren = true;
    upisi(KLJUC, "1");

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
    setTimeout(function () { kutija.focus({ preventScroll: true }); }, 50);
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
      var f = kutija.querySelectorAll("a[href]:not([style*='none']),button");
      if (!f.length) return;
      var prvi = f[0], poslednji = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === prvi || document.activeElement === kutija)) { e.preventDefault(); poslednji.focus(); }
      else if (!e.shiftKey && document.activeElement === poslednji) { e.preventDefault(); prvi.focus(); }
    }
  });
  el.querySelector("[data-izl-poziv]").addEventListener("click", function () {
    salji("izlaz_popup_klik", { akcija: "zakazi_poziv" });
    zatvori();
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
