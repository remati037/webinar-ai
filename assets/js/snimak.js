/* ============================================================
   /snimak - odbrojavanje do kraja ponude i Meta InitiateCheckout.
   Rok (window.ROK_PONUDE) je u <head> stranice snimak.html.
   Scroll reveal dolazi iz main.js.
   ============================================================ */

(function () {
  "use strict";

  var rok = window.ROK_PONUDE;

  // ---------- odbrojavanje ----------

  var odbrojavanja = document.querySelectorAll("[data-rok]");
  var tajmer = null;

  function osvezi() {
    var razlika = rok - new Date();
    if (razlika <= 0) {
      // Rok je istekao dok je stranica otvorena: ponuda se sklanja
      // isto kao pri ucitavanju, ostaje samo snimak.
      document.documentElement.classList.add("ponuda-istekla");
      if (tajmer) clearInterval(tajmer);
      return;
    }
    var vrednosti = {
      dana: Math.floor(razlika / 86400000),
      sati: Math.floor((razlika % 86400000) / 3600000),
      min: Math.floor((razlika % 3600000) / 60000),
      sek: Math.floor((razlika % 60000) / 1000),
    };
    odbrojavanja.forEach(function (el) {
      el.querySelectorAll("[data-jedinica]").forEach(function (broj) {
        broj.textContent = vrednosti[broj.getAttribute("data-jedinica")];
      });
    });
  }

  if (rok instanceof Date && !isNaN(rok)) {
    osvezi();
    tajmer = setInterval(osvezi, 1000);
  }

  // ---------- video ----------

  // Player se ucitava tek na klik. YouTube odbija da pusti ugradjen
  // video (greska 153) kada stranica ne posalje svoju adresu, a to se
  // desava kad je HTML otvoren kao fajl. Tada klik otvara video na
  // YouTube-u. Bez JS-a link radi isto, jer vodi na youtu.be.
  var pokreni = document.querySelector("[data-video]");
  if (pokreni) {
    pokreni.addEventListener("click", function (e) {
      if (location.protocol === "file:") return;
      e.preventDefault();

      var iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube.com/embed/" + pokreni.getAttribute("data-video") +
        "?autoplay=1&rel=0&playsinline=1";
      iframe.title = pokreni.getAttribute("aria-label") || "Snimak vebinara";
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      pokreni.replaceWith(iframe);
      iframe.focus();
    });
  }

  // ---------- Meta InitiateCheckout ----------

  document.querySelectorAll("a[data-checkout]").forEach(function (a) {
    a.addEventListener("click", function () {
      if (typeof window.fbq !== "function") return;
      window.fbq("track", "InitiateCheckout", {
        content_name: "InfoCash Akcelerator",
        value: Number(a.getAttribute("data-vrednost")) || 0,
        currency: "EUR",
      });
    });
  });
})();
