// ============================================================
// /hvala - licna stranica prijavljenog.
// Tajni kljuc stoji u ?k= i sa njim se povlaci /api/referali.
// Ako je stigao pravo sa forme, u URL-u je i ?novo=1, pa se
// prikazuje i kartica sa potvrdom prijave.
// ============================================================

(function () {
  "use strict";

  var parametri = new URLSearchParams(location.search);
  var kljuc = (parametri.get("k") || "").trim();
  var svezaPrijava = parametri.get("novo") === "1";

  var el = {
    potvrda: document.getElementById("potvrda"),
    potvrdaIme: document.getElementById("potvrda-ime"),
    stanje: document.getElementById("stanje"),
    stanjeTekst: document.getElementById("stanje-tekst"),
    stanjeAkcija: document.getElementById("stanje-akcija"),
    referal: document.getElementById("referal"),
    linkPolje: document.getElementById("link-polje"),
    kopiraj: document.getElementById("kopiraj"),
    kopirajStatus: document.getElementById("kopiraj-status"),
    tabelaBlok: document.getElementById("tabela-blok"),
    tabelaBroj: document.getElementById("tabela-broj"),
    tabelaTelo: document.getElementById("tabela-telo"),
    praznaTabela: document.getElementById("prazna-tabela"),
  };

  if (svezaPrijava && el.potvrda) el.potvrda.hidden = false;

  if (!kljuc) {
    prikaziGresku("Ovaj link nema tvoj lični ključ, pa ne mogu da nađem tvoje podatke. Otvori link koji ti je stigao na email.", true);
    return;
  }

  fetch("/api/referali?k=" + encodeURIComponent(kljuc), { headers: { Accept: "application/json" } })
    .then(function (r) {
      return r.json().then(function (telo) {
        if (!r.ok) throw new Error(telo && telo.poruka ? telo.poruka : "Greška " + r.status);
        return telo;
      });
    })
    .then(nacrtaj)
    .catch(function (e) {
      prikaziGresku(e.message || "Ne mogu da učitam podatke. Osveži stranicu za koji trenutak.", false);
    });

  // ---------- crtanje ----------

  function nacrtaj(p) {
    el.stanje.hidden = true;

    if (svezaPrijava && el.potvrdaIme && p.ime) {
      el.potvrdaIme.textContent = ", " + p.ime;
    }

    // referal link
    el.linkPolje.value = p.ref_link;
    el.referal.hidden = false;

    // tabela
    if (p.lista.length) {
      el.tabelaBroj.textContent = "Do sada " + p.ukupno + " " +
        rec(p.ukupno, "prijava", "prijave", "prijava") + " preko tvog linka.";
      el.tabelaBroj.hidden = false;

      var delovi = p.lista.map(function (r) {
        return "<tr>" +
          "<td data-naslov=\"Ime\">" + bezbedno(r.ime) + "</td>" +
          "<td data-naslov=\"Email\">" + bezbedno(r.email) + "</td>" +
          "<td data-naslov=\"Prijavljen\">" + datum(r.datum) + "</td>" +
          "<td data-naslov=\"Status\"><span class=\"znak znak-" + (r.status === "potvrdjen" ? "ok" : "ceka") + "\">" +
            (r.status === "potvrdjen" ? "Potvrđen" : "Čeka potvrdu") +
          "</span></td>" +
        "</tr>";
      });
      el.tabelaTelo.innerHTML = delovi.join("");
    } else {
      el.tabelaBlok.querySelector(".tabela-okvir").hidden = true;
      el.praznaTabela.hidden = false;
    }
    el.tabelaBlok.hidden = false;
  }

  function prikaziGresku(poruka, ponudiPrijavu) {
    el.stanjeTekst.textContent = poruka;
    el.stanje.classList.add("stanje-greska");
    if (ponudiPrijavu) el.stanjeAkcija.hidden = false;
  }

  // ---------- kopiranje ----------

  el.kopiraj.addEventListener("click", function () {
    var tekst = el.linkPolje.value;
    if (!tekst) return;

    kopirajTekst(tekst).then(function (uspelo) {
      el.kopirajStatus.textContent = uspelo
        ? "Link je kopiran. Nalepi ga gde želiš."
        : "Ne mogu da kopiram sam. Označi link iznad i kopiraj ručno.";
      el.kopiraj.textContent = uspelo ? "Kopirano ✓" : "Kopiraj";
      if (uspelo) {
        setTimeout(function () { el.kopiraj.textContent = "Kopiraj"; }, 2500);
      }
    });
  });

  function kopirajTekst(tekst) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(tekst).then(function () { return true; },
                                                       function () { return rezervnoKopiranje(); });
    }
    return Promise.resolve(rezervnoKopiranje());
  }

  // Stariji pretrazivaci i in-app browseri bez Clipboard API-ja.
  function rezervnoKopiranje() {
    try {
      el.linkPolje.removeAttribute("readonly");
      el.linkPolje.select();
      el.linkPolje.setSelectionRange(0, 99999);
      var uspelo = document.execCommand("copy");
      el.linkPolje.setAttribute("readonly", "readonly");
      return uspelo;
    } catch (e) {
      return false;
    }
  }

  // ---------- pomocne ----------

  function bezbedno(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function datum(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "numeric", year: "numeric" });
  }

  // srpska mnozina: 1 prijava, 2-4 prijave, 5+ prijava
  function rec(n, jednina, malo, mnozina) {
    var d = n % 10, s = n % 100;
    if (d === 1 && s !== 11) return jednina;
    if (d >= 2 && d <= 4 && (s < 12 || s > 14)) return malo;
    return mnozina;
  }
})();
