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
  // Kljuc nosi datum radionice, da kod sa proslog vebinara ne bi presao na ovaj.
  var KLJUC_REF = "vebinar_ref_2026-11-16";

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

  /* ---------- odakle je dosao (za /analiza) ---------- */

  // Pamti se PRVI dolazak sa izvorom: ako covek dodje sa oglasa, pa se
  // sutra vrati direktno i prijavi, prijava se racuna oglasu.
  var KLJUC_IZVOR = "vebinar_izvor_2026-11-16";
  var izvor = (function () {
    var q = new URLSearchParams(location.search);
    var novi = null;
    function u(k) { return (q.get(k) || "").trim().toLowerCase().slice(0, 80); }
    if (u("utm_source")) {
      novi = { izvor: u("utm_source"), medij: u("utm_medium"), kampanja: u("utm_campaign"), oglas: u("utm_content") };
    } else if (q.get("fbclid")) {
      novi = { izvor: "facebook", medij: "", kampanja: "", oglas: "" };
    } else if (q.get("gclid")) {
      novi = { izvor: "google", medij: "cpc", kampanja: "", oglas: "" };
    } else if (refKod) {
      novi = { izvor: "preporuka", medij: "referal", kampanja: "", oglas: "" };
    } else {
      var dom = "";
      try { dom = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : ""; } catch (e) {}
      if (dom && dom !== location.hostname.replace(/^www\./, "")) novi = { izvor: dom, medij: "referral", kampanja: "", oglas: "" };
    }
    var stari = null;
    try { stari = JSON.parse(procitaj(KLJUC_IZVOR) || "null"); } catch (e) {}
    if (stari && stari.izvor) return stari;
    if (novi) { zapamti(KLJUC_IZVOR, JSON.stringify(novi)); return novi; }
    return { izvor: "direktno", medij: "", kampanja: "", oglas: "" };
  })();

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

  /* ---------- telefon i pozivni broj ---------- */

  // [kod zemlje, pozivni, naziv, primer broja bez nule]
  // Prvo region, pa zemlje gde zivi najvise nasih ljudi, pa ostalo.
  var ZEMLJE = [
    ["RS", "+381", "Srbija", "65 132 4124"],
    ["BA", "+387", "BiH", "61 234 567"],
    ["ME", "+382", "Crna Gora", "67 123 456"],
    ["HR", "+385", "Hrvatska", "91 123 4567"],
    ["MK", "+389", "S. Makedonija", "70 123 456"],
    ["SI", "+386", "Slovenija", "31 234 567"],
    ["--"],
    ["DE", "+49", "Nemačka", "1512 3456789"],
    ["AT", "+43", "Austrija", "660 1234567"],
    ["CH", "+41", "Švajcarska", "78 123 45 67"],
    ["US", "+1", "SAD", "201 555 0123"],
    ["CA", "+1", "Kanada", "506 234 5678"],
    ["SE", "+46", "Švedska", "70 123 45 67"],
    ["NO", "+47", "Norveška", "406 12 345"],
    ["DK", "+45", "Danska", "20 12 34 56"],
    ["NL", "+31", "Holandija", "6 12345678"],
    ["BE", "+32", "Belgija", "470 12 34 56"],
    ["FR", "+33", "Francuska", "6 12 34 56 78"],
    ["IT", "+39", "Italija", "312 345 6789"],
    ["GB", "+44", "Velika Britanija", "7400 123456"],
    ["IE", "+353", "Irska", "85 012 3456"],
    ["AU", "+61", "Australija", "412 345 678"],
    ["--"],
    ["AE", "+971", "UAE", "50 123 4567"],
    ["BG", "+359", "Bugarska", "87 123 4567"],
    ["CY", "+357", "Kipar", "96 123456"],
    ["CZ", "+420", "Češka", "601 123 456"],
    ["ES", "+34", "Španija", "612 34 56 78"],
    ["FI", "+358", "Finska", "40 1234567"],
    ["GR", "+30", "Grčka", "691 234 5678"],
    ["HU", "+36", "Mađarska", "20 123 4567"],
    ["LU", "+352", "Luksemburg", "628 123 456"],
    ["MT", "+356", "Malta", "9696 1234"],
    ["PL", "+48", "Poljska", "512 345 678"],
    ["PT", "+351", "Portugal", "912 345 678"],
    ["RO", "+40", "Rumunija", "712 345 678"],
    ["RU", "+7", "Rusija", "912 345 6789"],
    ["SK", "+421", "Slovačka", "912 123 456"],
    ["TR", "+90", "Turska", "501 234 5678"],
    ["UA", "+380", "Ukrajina", "50 123 4567"]
  ];

  var pozivniPolje = document.getElementById("ml-pozivni");
  var KLJUC_ZEMLJA = "vebinar_zemlja";

  function zastava(kod) {
    return String.fromCodePoint(0x1F1E6 + kod.charCodeAt(0) - 65, 0x1F1E6 + kod.charCodeAt(1) - 65);
  }

  function popuniZemlje() {
    if (!pozivniPolje) return;
    pozivniPolje.innerHTML = "";
    var grupa = null;
    var nazivi = ["Region", "Dijaspora", "Ostale zemlje"];
    var g = 0;
    ZEMLJE.forEach(function (z, i) {
      if (i === 0 || z[0] === "--") {
        grupa = document.createElement("optgroup");
        grupa.label = nazivi[g++];
        pozivniPolje.appendChild(grupa);
        if (z[0] === "--") return;
      }
      var o = document.createElement("option");
      o.value = z[1];
      o.setAttribute("data-zemlja", z[0]);
      o.textContent = zastava(z[0]) + " " + z[2] + " " + z[1];
      grupa.appendChild(o);
    });
    izaberiZemlju(procitaj(KLJUC_ZEMLJA) || "RS");
  }

  function izaberiZemlju(kod) {
    if (!pozivniPolje || !kod) return false;
    var o = pozivniPolje.querySelector('option[data-zemlja="' + kod + '"]');
    if (!o) return false;
    o.selected = true;
    osveziPrimer();
    return true;
  }

  // Zatvoren select prikazuje samo zastavu i pozivni, a spisak pun naziv.
  var prikaz = document.getElementById("pozivni-prikaz");

  function osveziPrimer() {
    if (!pozivniPolje || !telefonPolje) return;
    var o = pozivniPolje.options[pozivniPolje.selectedIndex];
    var kod = o ? o.getAttribute("data-zemlja") : "RS";
    if (prikaz && o) prikaz.textContent = zastava(kod) + " " + o.value;
    for (var i = 0; i < ZEMLJE.length; i++) {
      if (ZEMLJE[i][0] === kod) { telefonPolje.placeholder = ZEMLJE[i][3]; return; }
    }
  }

  popuniZemlje();

  if (pozivniPolje) {
    pozivniPolje.addEventListener("change", function () {
      osveziPrimer();
      var o = pozivniPolje.options[pozivniPolje.selectedIndex];
      if (o) zapamti(KLJUC_ZEMLJA, o.getAttribute("data-zemlja"));
    });

    // Zemlja po IP adresi (Vercel je zna, nema spoljnog servisa).
    // Rucni izbor iz proslog puta ima prednost.
    if (!procitaj(KLJUC_ZEMLJA) && window.fetch) {
      fetch("/api/zemlja", { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.zemlja) izaberiZemlju(j.zemlja); })
        .catch(function () {});
    }
  }

  function pozivni() {
    return pozivniPolje && pozivniPolje.value ? pozivniPolje.value : POZIVNI;
  }

  // Broj u internacionalnom formatu. Ako je covek sam upisao +... ili 00...,
  // to postuje. Inace skida vodecu nulu i dodaje izabrani pozivni broj.
  // Backend radi istu proveru ponovo, ovo je samo da greska stigne odmah.
  function normalizujTelefon(unos) {
    var v = (unos || "").replace(/[\s\-(). ]/g, "");
    if (!v) return "";
    if (v.indexOf("00") === 0) v = "+" + v.slice(2);
    if (v.charAt(0) === "+") return /^\+\d{6,15}$/.test(v) ? v : "";
    if (!/^\d+$/.test(v)) return "";
    v = v.replace(/^0+/, "");
    if (v.length < 6 || v.length > 12) return "";
    return pozivni() + v;
  }

  /* ---------- validacija ---------- */

  var PRAVILA = [
    { id: "ml-ime", poruka: "Unesi svoje ime.", vazi: function (v) { return v.length > 0; } },
    { id: "ml-email", poruka: "Email adresa nije ispravna.", vazi: function (v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v); } },
    { id: "ml-telefon", poruka: "Broj telefona nije ispravan. Proveri pozivni broj i broj.", vazi: function (v) { return normalizujTelefon(v) !== ""; } }
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

    for (var i = 0; i < PRAVILA.length; i++) {
      var polje = document.getElementById(PRAVILA[i].id);
      if (!PRAVILA[i].vazi((polje.value || "").trim())) {
        prijaviGresku(PRAVILA[i].poruka, PRAVILA[i].id);
        return;
      }
    }

    var podaci = {
      ime: vrednost("ml-ime"),
      email: vrednost("ml-email"),
      telefon: normalizujTelefon(vrednost("ml-telefon")),
      pozivni: pozivni(),
      ref: refPolje.value,
      varijanta: document.documentElement.getAttribute("data-v") || "",
      izvor: izvor,
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
        // Samo domen (npr. gmail.com), da /hvala ponudi pravo dugme za sanduce.
        zapamti("vebinar_email_domen", (podaci.email.split("@")[1] || "").toLowerCase());
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
