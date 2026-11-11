/* ============================================================
   PODESAVANJA. Jedino mesto koje menjas rukom.
   ============================================================ */

// Datum i vreme radionice. U novembru je zimsko vreme, CET = +01:00.
var VEBINAR_DATUM = new Date("2026-11-16T19:00:00+01:00");

// Slobodna mesta. Broj NE dolazi iz baze: racuna se iz vremena, pa
// polako pada od MESTA_NA_POCETKU (kad su prijave otvorene) do
// MESTA_NA_KRAJU (u trenutku pocetka radionice). Svi posetioci u istom
// trenutku vide isti broj, i broj nikad ne raste.
// UKUPNO_MESTA mora da se slaze sa "400" u index.html.
var UKUPNO_MESTA = 400;
var PRIJAVE_OTVORENE = new Date("2026-11-09T00:00:00+01:00");
var MESTA_NA_POCETKU = 160;
var MESTA_NA_KRAJU = 23;

/* ============================================================ */

// Brojac mesta: popunjava svaki element sa data-mesta-ostalo.
function slobodnaMesta(sad) {
  var ukupno = VEBINAR_DATUM - PRIJAVE_OTVORENE;
  var proslo = Math.min(Math.max((sad - PRIJAVE_OTVORENE) / ukupno, 0), 1);
  // Brze pada pred kraj, kao kad se prijave stvarno ubrzaju.
  var udeo = Math.pow(1 - proslo, 1.4);
  return Math.round(MESTA_NA_KRAJU + (MESTA_NA_POCETKU - MESTA_NA_KRAJU) * udeo);
}
function osveziMesta() {
  var broj = String(slobodnaMesta(new Date()));
  document.querySelectorAll("[data-mesta-ostalo]").forEach(function (el) {
    if (el.textContent !== broj) el.textContent = broj;
  });
}
osveziMesta();
setInterval(osveziMesta, 60000);

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

// Prica: linija se puni do linije citanja (55% visine ekrana),
// a svaki trenutak se pali kad ga linija stigne.
(function () {
  var linija = document.getElementById("linija");
  if (!linija) return;
  var trenuci = [].slice.call(linija.querySelectorAll(".trenutak"));
  var ceka = false;
  function osvezi() {
    ceka = false;
    var r = linija.getBoundingClientRect();
    var pun = Math.max(0, Math.min(r.height, window.innerHeight * 0.55 - r.top));
    linija.style.setProperty("--pun", pun + "px");
    trenuci.forEach(function (t) {
      t.classList.toggle("upaljen", t.offsetTop + 14 <= pun);
    });
  }
  function naSkrol() { if (!ceka) { ceka = true; requestAnimationFrame(osvezi); } }
  window.addEventListener("scroll", naSkrol, { passive: true });
  window.addEventListener("resize", naSkrol);
  osvezi();
})();

// Traka sa dugmetom na mobilnom: vidi se kad covek odskroluje sa vrha,
// a nestaje dok su forma ili finale na ekranu (tad dugme vec postoji).
(function () {
  var traka = document.getElementById("lepljivo");
  var forma = document.getElementById("prijava");
  var finale = document.querySelector(".finale");
  if (!traka || !forma || !("IntersectionObserver" in window)) return;
  var vidi = { forma: false, finale: false };
  function osvezi() {
    var prikazi = window.scrollY > 500 && !vidi.forma && !vidi.finale;
    traka.classList.toggle("vidljivo", prikazi);
  }
  new IntersectionObserver(function (u) { vidi.forma = u[0].isIntersecting; osvezi(); }).observe(forma);
  if (finale) new IntersectionObserver(function (u) { vidi.finale = u[0].isIntersecting; osvezi(); }).observe(finale);
  window.addEventListener("scroll", osvezi, { passive: true });
})();
