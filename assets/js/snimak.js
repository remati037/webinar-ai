/* ============================================================
   /snimak - video player, odbrojavanje do kraja ponude i Meta
   InitiateCheckout. Rok (window.ROK_PONUDE) je u <head> stranice
   snimak.html. Scroll reveal dolazi iz main.js.
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

  // Snimak ide kroz YouTube IFrame API, ali bez YouTube-ovog interfejsa.
  // Iframe je duplo visi od okvira, pa naslov i logo sa linkom padnu van
  // slike, a preko njega stoji providan sloj (.video-stit) koji prima sve
  // klikove. Kontrole su nase, pa sa stranice nema izlaza na YouTube.
  var okvir = document.querySelector(".video-okvir[data-video]");
  if (okvir) snimakPlayer(okvir);

  function snimakPlayer(okvir) {
    var BRZINE = [1, 1.25, 1.5, 1.75, 2];

    function el(s) { return okvir.querySelector(s); }
    var stit = el(".video-stit");
    var kontrole = el(".video-kontrole");
    var traka = el("[data-video-traka]");
    var jacina = el("[data-video-jacina]");
    var dugmeIgra = el("[data-video-igra]");
    var dugmeZvuk = el("[data-video-zvuk]");
    var dugmeBrzina = el("[data-video-brzina]");
    var dugmeEkran = el("[data-video-ekran]");
    var dugmePonovo = el("[data-video-ponovo]");
    var poruka = el("[data-video-poruka]");
    var sadaEl = el("[data-video-sada]");
    var ukupnoEl = el("[data-video-ukupno]");
    var mozeHover = window.matchMedia("(hover: hover)");

    var yt = null;
    var pokrenut = false;     // API je zatrazen
    var apiPao = false;       // skripta sa YouTube-a nije ucitana
    var spreman = false;
    var vecIgrao = false;
    var pustiKadBude = false;
    var pomera = false;       // korisnik vuce traku
    var utisan = false;
    var jacinaPre = 100;
    var brzina = 1;
    var bioSkriven = false;
    var dodirom = false;
    var ticker = null, skrivanje = null, provera = null, cekanje = null;

    // ---- prikaz ----

    function stanje(s) {
      okvir.setAttribute("data-stanje", s);
      dugmeIgra.setAttribute("aria-label", s === "igra" ? "Pauziraj" : "Pusti");
    }
    function je(s) { return okvir.getAttribute("data-stanje") === s; }

    function javi(tekst) {
      poruka.textContent = tekst || "";
      poruka.hidden = !tekst;
    }

    function vreme(sek) {
      sek = Math.max(0, Math.floor(sek || 0));
      var h = Math.floor(sek / 3600);
      var m = Math.floor((sek % 3600) / 60);
      var s = sek % 60;
      var ss = (s < 10 ? "0" : "") + s;
      return h ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
    }

    function popuni(input, pct, buf) {
      input.style.setProperty("--pct", pct + "%");
      input.style.setProperty("--buf", (buf == null ? pct : buf) + "%");
    }

    function osveziTraku(sek) {
      if (!spreman || pomera) return;
      var ukupno = yt.getDuration() || 0;
      var sada = sek != null ? sek : yt.getCurrentTime() || 0;
      var pct = ukupno ? Math.min(sada / ukupno, 1) * 100 : 0;
      traka.value = Math.round(pct * 10);
      traka.setAttribute("aria-valuetext", vreme(sada) + " od " + vreme(ukupno));
      popuni(traka, pct, (yt.getVideoLoadedFraction() || 0) * 100);
      sadaEl.textContent = vreme(sada);
      ukupnoEl.textContent = vreme(ukupno);
    }

    function osveziZvuk() {
      okvir.classList.toggle("bez-zvuka", utisan);
      dugmeZvuk.setAttribute("aria-label", utisan ? "Uključi zvuk" : "Isključi zvuk");
      var v = utisan ? 0 : jacinaPre;
      jacina.value = v;
      popuni(jacina, v);
    }

    function fokusNaKontroli() {
      try { return !!kontrole.querySelector(":focus-visible"); } catch (e) { return false; }
    }

    // Kontrole se sklanjaju posle 2,6 s bez pomeranja misa dok video ide.
    function pokaziKontrole() {
      okvir.classList.remove("skriveno");
      clearTimeout(skrivanje);
      if (!je("igra")) return;
      skrivanje = setTimeout(function () {
        var misNaKontrolama = mozeHover.matches && kontrole.matches(":hover");
        if (je("igra") && !pomera && !misNaKontrolama && !fokusNaKontroli()) {
          okvir.classList.add("skriveno");
        }
      }, 2600);
    }

    // ---- YouTube ----

    function pokreni() {
      if (pokrenut || location.protocol === "file:") return;
      pokrenut = true;
      if (window.YT && window.YT.Player) return napravi();
      var prethodni = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prethodni === "function") prethodni();
        napravi();
      };
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = function () {
        apiPao = true;
        if (pustiKadBude) greska();
      };
      document.head.appendChild(s);
    }

    function sakrijIframe() {
      var iframe = okvir.querySelector("iframe");
      if (!iframe) return;
      iframe.tabIndex = -1;
      iframe.setAttribute("aria-hidden", "true");
    }

    function napravi() {
      yt = new window.YT.Player(el("[data-video-mesto]"), {
        videoId: okvir.getAttribute("data-video"),
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          modestbranding: 1,
          origin: location.origin,
        },
        events: { onReady: naSpreman, onStateChange: naPromenu, onError: greska },
      });
      sakrijIframe();
    }

    function naSpreman() {
      spreman = true;
      sakrijIframe();
      utisan = yt.isMuted();
      jacinaPre = yt.getVolume() || 100;
      osveziZvuk();
      osveziTraku();
      if (pustiKadBude) pusti();
    }

    function naPromenu(e) {
      var S = window.YT.PlayerState;
      if (e.data === S.BUFFERING) okvir.setAttribute("data-baferuje", "");
      else okvir.removeAttribute("data-baferuje");

      if (e.data === S.PLAYING) {
        vecIgrao = true;
        clearTimeout(provera);
        javi("");
        stanje("igra");
        clearInterval(ticker);
        ticker = setInterval(osveziTraku, 250);
        osveziTraku();
        pokaziKontrole();
      } else if (e.data === S.PAUSED) {
        clearInterval(ticker);
        osveziTraku();
        if (vecIgrao) {
          stanje("pauza");
          pokaziKontrole();
        } else if (je("ucitava")) {
          naDodir();
        }
      } else if (e.data === S.ENDED) {
        clearInterval(ticker);
        stanje("kraj");
        okvir.classList.remove("skriveno");
        if (okvir.contains(document.activeElement)) dugmePonovo.focus({ preventScroll: true });
      }
    }

    function pusti() {
      if (location.protocol === "file:" || apiPao) return greska();
      if (!je("igra") && !je("pauza")) stanje("ucitava");
      javi("");

      if (!spreman) {
        pustiKadBude = true;
        pokreni();
        clearTimeout(cekanje);
        cekanje = setTimeout(function () { if (!spreman) greska(); }, 15000);
        return;
      }

      pustiKadBude = false;
      yt.playVideo();
      if (vecIgrao) return;

      // Neki telefoni (najcesce iPhone) ne puste video koji pokrene sama
      // stranica. Ako posle 3 s nije krenuo, sloj preko videa se sklanja
      // i dodir ide pravo na video. Naslov i logo su i tada van okvira,
      // a cim video krene, sloj se vraca.
      clearTimeout(provera);
      provera = setTimeout(function () { if (!vecIgrao) naDodir(); }, 3000);
    }

    function naDodir() {
      clearTimeout(provera);
      stanje("dodir");
      javi("Dodirni video da krene");
    }

    function greska() {
      clearTimeout(provera);
      clearTimeout(cekanje);
      clearInterval(ticker);
      pustiKadBude = false;
      stanje("greska");
      javi(location.protocol === "file:"
        ? "Snimak se pušta tek kad je stranica na serveru, ne iz otvorenog fajla."
        : "Snimak trenutno ne može da se pusti. Osveži stranicu i probaj ponovo.");
    }

    // ---- kontrole ----

    function igraPauza() {
      if (je("igra")) yt.pauseVideo();
      else if (je("kraj")) ponovo();
      else pusti();
    }

    function ponovo() {
      if (spreman) yt.seekTo(0, true);
      pusti();
    }

    function skok(sek) {
      if (!spreman) return;
      var ukupno = yt.getDuration() || 0;
      var cilj = Math.max(0, Math.min(yt.getCurrentTime() + sek, ukupno - 1));
      yt.seekTo(cilj, true);
      osveziTraku(cilj);
    }

    function zvuk() {
      if (!spreman) return;
      if (utisan) {
        yt.unMute();
        yt.setVolume(jacinaPre);
        utisan = false;
      } else {
        yt.mute();
        utisan = true;
      }
      osveziZvuk();
    }

    function uPunomEkranu() {
      return document.fullscreenElement === okvir || document.webkitFullscreenElement === okvir;
    }

    function osveziEkran() {
      var pun = uPunomEkranu() || okvir.classList.contains("pun-ekran-css");
      okvir.classList.toggle("pun-ekran", pun);
      dugmeEkran.setAttribute("aria-label", pun ? "Izađi iz celog ekrana" : "Ceo ekran");
    }

    // iPhone nema Fullscreen API za obican element, pa dobija fiksni okvir.
    function pseudoEkran(ukljuci) {
      okvir.classList.toggle("pun-ekran-css", ukljuci);
      document.documentElement.classList.toggle("video-zakljucan", ukljuci);
      osveziEkran();
    }

    function ekran() {
      if (okvir.classList.contains("pun-ekran-css")) return pseudoEkran(false);
      if (uPunomEkranu()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return;
      }
      var zahtev = okvir.requestFullscreen || okvir.webkitRequestFullscreen;
      if (!zahtev) return pseudoEkran(true);
      var obecanje = zahtev.call(okvir);
      if (obecanje && obecanje.catch) obecanje.catch(function () { pseudoEkran(true); });
    }

    el("[data-video-pusti]").addEventListener("click", pusti);
    dugmePonovo.addEventListener("click", ponovo);
    dugmeIgra.addEventListener("click", igraPauza);
    el("[data-video-nazad]").addEventListener("click", function () { skok(-10); });
    el("[data-video-napred]").addEventListener("click", function () { skok(10); });
    dugmeZvuk.addEventListener("click", zvuk);
    dugmeEkran.addEventListener("click", ekran);
    document.addEventListener("fullscreenchange", osveziEkran);
    document.addEventListener("webkitfullscreenchange", osveziEkran);

    dugmeBrzina.addEventListener("click", function () {
      if (!spreman) return;
      var ima = yt.getAvailablePlaybackRates() || [];
      var lista = BRZINE.filter(function (b) { return ima.indexOf(b) !== -1; });
      if (!lista.length) lista = [1];
      brzina = lista[(lista.indexOf(brzina) + 1) % lista.length];
      yt.setPlaybackRate(brzina);
      var tekst = String(brzina).replace(".", ",") + "x";
      dugmeBrzina.textContent = tekst;
      dugmeBrzina.setAttribute("aria-label", "Brzina reprodukcije " + tekst);
    });

    traka.addEventListener("input", function () {
      if (!spreman) return;
      pomera = true;
      var sek = (traka.value / 1000) * (yt.getDuration() || 0);
      sadaEl.textContent = vreme(sek);
      popuni(traka, traka.value / 10, null);
    });
    traka.addEventListener("change", function () {
      if (!spreman) return;
      var sek = (traka.value / 1000) * (yt.getDuration() || 0);
      pomera = false;
      yt.seekTo(sek, true);
      osveziTraku(sek);
    });

    jacina.addEventListener("input", function () {
      if (!spreman) return;
      var v = Number(jacina.value);
      if (v > 0) {
        jacinaPre = v;
        yt.setVolume(v);
        if (utisan) { yt.unMute(); utisan = false; }
      } else if (!utisan) {
        yt.mute();
        utisan = true;
      }
      osveziZvuk();
    });

    // Klik na video pauzira i pusti. Na telefonu prvi dodir preko
    // skrivenih kontrola samo ih vrati, kao na YouTube aplikaciji.
    stit.addEventListener("pointerdown", function (e) {
      bioSkriven = okvir.classList.contains("skriveno");
      dodirom = e.pointerType !== "mouse";
    });
    stit.addEventListener("click", function () {
      okvir.focus({ preventScroll: true });
      if (dodirom && bioSkriven) return pokaziKontrole();
      igraPauza();
      pokaziKontrole();
    });

    okvir.addEventListener("mousemove", pokaziKontrole);
    okvir.addEventListener("focusin", pokaziKontrole);
    okvir.addEventListener("mouseleave", function () {
      if (!je("igra") || fokusNaKontroli()) return;
      clearTimeout(skrivanje);
      okvir.classList.add("skriveno");
    });

    // Tastatura: razmak ili K pusta i pauzira, strelice ili J i L
    // pomeraju 10 s, M gasi zvuk, F ceo ekran.
    okvir.addEventListener("keydown", function (e) {
      if (!spreman || !vecIgrao || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = e.target.tagName;
      var k = e.key;
      if (k === " " && (tag === "BUTTON" || tag === "A")) return;
      if (tag === "INPUT" && (k.indexOf("Arrow") === 0 || k === "Home" || k === "End" || k === "PageUp" || k === "PageDown")) return;

      if (k === " " || k === "k" || k === "K") igraPauza();
      else if (k === "ArrowLeft" || k === "j" || k === "J") skok(-10);
      else if (k === "ArrowRight" || k === "l" || k === "L") skok(10);
      else if (k === "m" || k === "M") zvuk();
      else if (k === "f" || k === "F") ekran();
      else if (k === "Escape" && okvir.classList.contains("pun-ekran-css")) pseudoEkran(false);
      else return;

      e.preventDefault();
      pokaziKontrole();
    });

    // API se ucitava cim se stranica ucita, da bi klik na snimak odmah
    // pustio video. Slika preko playera se prikazuje pre toga, pa ovo ne
    // usporava prvi prikaz stranice.
    if (document.readyState === "complete") pokreni();
    else window.addEventListener("load", pokreni);
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
