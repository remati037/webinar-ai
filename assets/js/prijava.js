// ============================================================
// Slanje forme za prijavu.
//
// Ranije je ovo radio MailerLite embed (webforms.min.js) direktno.
// Sada forma ide na nasu rutu /api/prijava, jer pored upisa u
// MailerLite treba i da se dodeli referal kod. Posle uspeha covek
// zavrsava na /hvala?k=TOKEN&novo=1.
// ============================================================

(function () {
  "use strict";

  var POZIVNI = "+381";        // podrazumevana zemlja za brojeve koji pocinju sa 0
  var KLJUC_REF = "vebinar_ref";

  var forma = document.getElementById("prijava-forma");
  if (!forma) return;

  var dugme = document.getElementById("prijava-dugme");
  var loading = document.getElementById("prijava-loading");
  var greskaEl = document.getElementById("prijava-greska");
  var refPolje = document.getElementById("prijava-ref");
  var telefonPolje = document.getElementById("ml-telefon");

  /* ---------- ko ga je pozvao ---------- */

  // Kod iz ?ref= pamtimo, da prezivi skrolovanje, osvezavanje i povratak
  // na stranicu pre nego sto se covek stvarno prijavi.
  var refKod = (function () {
    var izUrl = (new URLSearchParams(location.search).get("ref") || "").trim().toLowerCase();
    if (izUrl) {
      zapamti(KLJUC_REF, izUrl);
      return izUrl;
    }
    return procitaj(KLJUC_REF);
  })();

  if (refKod) {
    refPolje.value = refKod;
    oznaciPreporuku();
  }

  function oznaciPreporuku() {
    var mesta = document.getElementById("mesta-info");
    if (!mesta) return;
    var znak = document.createElement("span");
    znak.className = "preporuka-znak";
    // Namerno bez imena posiljaoca: kod je nasumican bas zato da se
    // iz linka ne moze zakljuciti ko ga je poslao.
    znak.textContent = "Stigao/la si preko preporuke";
    mesta.insertAdjacentElement("afterend", znak);
  }

  /* ---------- telefon ---------- */

  // MailerLite prima broj samo u internacionalnom formatu, pa domaci
  // zapis (065..., 00381...) prevodimo jos u polju da covek vidi sta salje.
  // Backend radi istu proveru ponovo, ovo je samo zbog jasnoce.
  function normalizujTelefon(unos) {
    var v = (unos || "").replace(/[\s\-(). ]/g, "");
    if (!v) return unos;
    if (v.indexOf("00") === 0) v = "+" + v.slice(2);
    if (v.charAt(0) === "+") return /^\+\d{6,15}$/.test(v) ? v : unos;
    if (!/^\d+$/.test(v)) return unos;
    if (v.charAt(0) === "0") v = v.slice(1);
    if (v.length < 6 || v.length > 12) return unos;
    return POZIVNI + v;
  }

  if (telefonPolje) {
    telefonPolje.addEventListener("blur", function () {
      telefonPolje.value = normalizujTelefon(telefonPolje.value);
    });
  }

  /* ---------- validacija ---------- */

  var PRAVILA = [
    { id: "ml-ime", poruka: "Unesi svoje ime.", vazi: function (v) { return v.length > 0; } },
    { id: "ml-email", poruka: "Email adresa nije ispravna.", vazi: function (v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v); } },
    { id: "ml-telefon", poruka: "Broj telefona nije ispravan. Primer: 065 132 4124", vazi: function (v) { return /^\+\d{6,15}$/.test(normalizujTelefon(v)); } }
  ];

  function ocistiGreske() {
    forma.querySelectorAll(".ml-error").forEach(function (el) { el.classList.remove("ml-error"); });
    greskaEl.hidden = true;
    greskaEl.textContent = "";
  }

  function prijaviGresku(poruka, poljeId) {
    greskaEl.textContent = poruka;
    greskaEl.hidden = false;
    if (poljeId) {
      var polje = document.getElementById(poljeId);
      if (polje) {
        var grupa = polje.closest(".ml-field-group");
        if (grupa) grupa.classList.add("ml-error");
        polje.focus();
      }
    }
  }

  /* ---------- slanje ---------- */

  forma.addEventListener("submit", function (dogadjaj) {
    dogadjaj.preventDefault();
    ocistiGreske();

    if (telefonPolje) telefonPolje.value = normalizujTelefon(telefonPolje.value);

    for (var i = 0; i < PRAVILA.length; i++) {
      var polje = document.getElementById(PRAVILA[i].id);
      if (!PRAVILA[i].vazi((polje.value || "").trim())) {
        prijaviGresku(PRAVILA[i].poruka, PRAVILA[i].id);
        return;
      }
    }

    var podaci = {
      ime: vrednost("ml-ime"),
      prezime: vrednost("ml-prezime"),
      email: vrednost("ml-email"),
      telefon: vrednost("ml-telefon"),
      ref: refPolje.value,
      zamka: (document.getElementById("prijava-zamka") || {}).value || ""
    };

    ucitavanje(true);

    fetch("/api/prijava", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(podaci)
    })
      .then(function (r) {
        return r.json().then(function (telo) {
          if (!r.ok) throw new Error(telo && telo.poruka ? telo.poruka : "Greška " + r.status);
          return telo;
        });
      })
      .then(function (telo) {
        // Bez tokena nemamo gde da posaljemo coveka. Desava se samo ako je
        // zamka za botove nekako popunjena, pa mu dajemo priliku da pokusa ponovo.
        if (!telo.token) throw new Error("Prijava nije prošla. Osveži stranicu i pokušaj ponovo.");

        // Kod pozivaoca je iskoriscen, da se ne lepi na sledecu prijavu
        // sa istog uredjaja (npr. kad se prijavljuju dvoje sa istog laptopa).
        obrisi(KLJUC_REF);
        location.href = "/hvala?k=" + encodeURIComponent(telo.token) + "&novo=1";
      })
      .catch(function (e) {
        ucitavanje(false);
        prijaviGresku(e.message || "Prijava nije prošla. Pokušaj ponovo.", null);
      });
  });

  function ucitavanje(radi) {
    dugme.style.display = radi ? "none" : "";
    loading.style.display = radi ? "flex" : "none";
  }

  function vrednost(id) {
    var el = document.getElementById(id);
    return el ? (el.value || "").trim() : "";
  }

  /* ---------- localStorage koji ne puca u privatnom rezimu ---------- */

  function zapamti(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function procitaj(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function obrisi(k) { try { localStorage.removeItem(k); } catch (e) {} }
})();
