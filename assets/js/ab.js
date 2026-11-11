// ============================================================
// A/B test forme za prijavu.
//
// Varijantu bira skripta u <head> index.html i upisuje je u
// <html data-v="a|b">. Ovde:
//  * belezimo posetu (jednom po posetiocu) za racunanje konverzije
//  * u varijanti B selimo formu u popup i otvaramo ga na svako dugme
//    sa data-cta, a belezimo i da je popup otvoren
// Sa ?v=a ili ?v=b u adresi (pregled) nista se ne belezi.
// ============================================================

(function () {
  "use strict";

  var html = document.documentElement;
  var VARIJANTA = html.getAttribute("data-v") === "b" ? "b" : "a";
  var PREGLED = html.hasAttribute("data-pregled");
  var KLJUC_POSETILAC = "ab_posetilac";

  window.AB_VARIJANTA = VARIJANTA;

  /* ---------- belezenje ---------- */

  function posetilac() {
    var id = "";
    try { id = localStorage.getItem(KLJUC_POSETILAC) || ""; } catch (e) {}
    if (!/^[a-z0-9]{8,40}$/i.test(id)) {
      id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 24);
      try { localStorage.setItem(KLJUC_POSETILAC, id); } catch (e) {}
    }
    return id;
  }

  function zabelezi(dogadjaj) {
    if (PREGLED) return;
    var telo = JSON.stringify({ varijanta: VARIJANTA, dogadjaj: dogadjaj, posetilac: posetilac() });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/ab", telo)) return;
    } catch (e) {}
    try {
      fetch("/api/ab", { method: "POST", body: telo, keepalive: true, headers: { "Content-Type": "text/plain" } });
    } catch (e) {}
  }

  zabelezi("poseta");

  if (VARIJANTA !== "b") return;

  /* ---------- varijanta B: popup ---------- */

  var modal = document.getElementById("prijava-modal");
  var mesto = document.getElementById("modal-mesto");
  var forma = document.getElementById("forma-mesto");
  if (!modal || !mesto || !forma) return;

  mesto.appendChild(forma);

  var poslednjiFokus = null;
  var popupZabelezen = false;

  function otvori(e) {
    if (e) e.preventDefault();
    if (!modal.hidden) return;
    poslednjiFokus = document.activeElement;
    modal.hidden = false;
    // Citanje offsetWidth natera browser da prvo nacrta zatvoreno stanje,
    // pa animacija krene. (requestAnimationFrame ume da kasni ili ne okine.)
    void modal.offsetWidth;
    modal.classList.add("otvoren");
    html.classList.add("modal-otvoren");
    setTimeout(function () {
      var prvo = document.getElementById("ml-ime");
      if (prvo) prvo.focus({ preventScroll: true });
    }, 120);
    if (!popupZabelezen) { popupZabelezen = true; zabelezi("popup"); }
    if (typeof window.fbq === "function") window.fbq("trackCustom", "OtvorioPrijavu");
  }

  function zatvori(e) {
    if (e) e.preventDefault();
    if (modal.hidden) return;
    modal.classList.remove("otvoren");
    html.classList.remove("modal-otvoren");
    setTimeout(function () { modal.hidden = true; }, 180);
    if (poslednjiFokus && poslednjiFokus.focus) poslednjiFokus.focus({ preventScroll: true });
  }

  document.addEventListener("click", function (e) {
    var cta = e.target.closest("[data-cta]");
    if (cta) return otvori(e);
    if (e.target.closest("[data-zatvori]")) return zatvori(e);
  });

  document.addEventListener("keydown", function (e) {
    if (modal.hidden) return;
    if (e.key === "Escape") return zatvori(e);
    // Tab ostaje u popupu
    if (e.key === "Tab") {
      var fokusabilni = modal.querySelectorAll("button:not([disabled]), input:not([tabindex='-1']), select, a[href]");
      var vidljivi = Array.prototype.filter.call(fokusabilni, function (el) { return el.offsetParent !== null; });
      if (!vidljivi.length) return;
      var prvi = vidljivi[0], poslednji = vidljivi[vidljivi.length - 1];
      if (e.shiftKey && document.activeElement === prvi) { e.preventDefault(); poslednji.focus(); }
      else if (!e.shiftKey && document.activeElement === poslednji) { e.preventDefault(); prvi.focus(); }
    }
  });

  // Link sa #prijava na kraju (npr. iz mejla) odmah otvara popup.
  if (location.hash === "#prijava") otvori();
})();
