/* ============================================================
   PODESAVANJA. Jedino mesto koje menjas rukom.
   ============================================================ */

// Datum i vreme vebinara (srpska vremenska zona, CEST = +02:00)
var VEBINAR_DATUM = new Date("2026-09-14T19:00:00+02:00");

// Broj vec prijavljenih. Azuriraj povremeno stvarnim brojem iz MailerLite-a.
// Dok je 0, prikazuje se samo "Ograniceno na 200 mesta".
var PRIJAVLJENO = 0;
var UKUPNO_MESTA = 200;

/* ============================================================ */

// Brojac mesta
(function () {
  var el = document.getElementById("mesta-info");
  if (!el) return;
  if (PRIJAVLJENO > 0) {
    var ostalo = Math.max(UKUPNO_MESTA - PRIJAVLJENO, 0);
    el.textContent = ostalo > 0
      ? "Ostalo još " + ostalo + " od " + UKUPNO_MESTA + " mesta"
      : "Sva mesta su popunjena";
  }
})();

// Countdown
function osveziCountdown() {
  var sad = new Date();
  var razlika = VEBINAR_DATUM - sad;
  var d = 0, h = 0, m = 0, s = 0;
  if (razlika > 0) {
    d = Math.floor(razlika / 86400000);
    h = Math.floor((razlika % 86400000) / 3600000);
    m = Math.floor((razlika % 3600000) / 60000);
    s = Math.floor((razlika % 60000) / 1000);
  }
  ["", "2"].forEach(function (n) {
    var dana = document.getElementById("cd" + n + "-dana");
    if (!dana) return;
    dana.textContent = d;
    document.getElementById("cd" + n + "-sati").textContent = h;
    document.getElementById("cd" + n + "-min").textContent = m;
    document.getElementById("cd" + n + "-sek").textContent = s;
  });
}
osveziCountdown();
setInterval(osveziCountdown, 1000);

// Scroll reveal
(function () {
  var mediji = window.matchMedia("(prefers-reduced-motion: reduce)");
  var elementi = document.querySelectorAll(".rv");
  if (mediji.matches || !("IntersectionObserver" in window)) {
    elementi.forEach(function (el) { el.classList.add("vidljiv"); });
    return;
  }
  var posmatrac = new IntersectionObserver(function (unosi) {
    unosi.forEach(function (u) {
      if (u.isIntersecting) {
        u.target.classList.add("vidljiv");
        posmatrac.unobserve(u.target);
      }
    });
  }, { threshold: 0.12 });
  elementi.forEach(function (el) { posmatrac.observe(el); });
})();

// Telefon: MailerLite prima broj samo u internacionalnom formatu (+381...),
// pa domaci zapis (065..., 00381...) prevodimo pre slanja.
(function () {
  var POZIVNI = "+381"; // podrazumevana zemlja za brojeve koji pocinju sa 0

  var polje = document.getElementById("ml-telefon");
  if (!polje) return;

  function normalizuj(unos) {
    var v = (unos || "").replace(/[\s\-(). ]/g, "");
    if (!v) return unos;

    if (v.indexOf("00") === 0) v = "+" + v.slice(2);

    // vec je internacionalni format
    if (v.charAt(0) === "+") return /^\+\d{6,15}$/.test(v) ? v : unos;

    // sve osim cifara ostavljamo korisniku da sam ispravi
    if (!/^\d+$/.test(v)) return unos;

    if (v.charAt(0) === "0") v = v.slice(1);
    if (v.length < 6 || v.length > 12) return unos;

    return POZIVNI + v;
  }

  function primeni() {
    var novo = normalizuj(polje.value);
    if (novo === polje.value) return;
    polje.value = novo;

    // MailerLite mozda vec oznacio polje kao gresku pre nego sto smo ispravili broj
    var cvor = polje.parentNode;
    while (cvor && cvor.classList) {
      cvor.classList.remove("ml-error");
      if (cvor.classList.contains("ml-form-fieldRow")) break;
      cvor = cvor.parentNode;
    }
    polje.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // blur pokriva i klik na dugme (input izgubi fokus pre submita)
  polje.addEventListener("blur", primeni);
  // sigurnosna mreza: capture na document se izvrsava pre MailerLite handlera
  document.addEventListener("submit", primeni, true);
})();
