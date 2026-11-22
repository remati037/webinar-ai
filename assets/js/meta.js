// ============================================================
// Meta Conversions API za /ponuda i /ponuda-2.
// Piksel (init + PageView) je u <head> same stranice.
// window.metaDogadjaj(ime, podaci) salje isti dogadjaj pikselu i
// serveru (/api/meta) sa istim eventID-jem, pa ga Meta broji jednom.
// PageView ne ide na server: Meta mu sama dodeljuje eventID, pa bi
// se isti dogadjaj sa servera brojao dvaput.
// ============================================================
(function () {
  function noviId(ime) {
    var r = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return ime + "_" + r;
  }

  function server(ime, eventId, podaci) {
    var telo = JSON.stringify({ ime: ime, eventId: eventId, url: location.href, podaci: podaci || {} });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/meta", new Blob([telo], { type: "application/json" }))) return;
    } catch (e) {}
    try {
      fetch("/api/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: telo, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  window.metaDogadjaj = function (ime, podaci) {
    var eventId = noviId(ime);
    if (typeof window.fbq === "function") window.fbq("track", ime, podaci || {}, { eventID: eventId });
    // Mali razmak da fbevents.js stigne da upise _fbp kolacic pre slanja serveru.
    setTimeout(function () { server(ime, eventId, podaci); }, ime === "InitiateCheckout" ? 0 : 1500);
  };

  window.metaDogadjaj("ViewContent", { content_name: "InfoCash Metoda", value: 497, currency: "EUR" });
})();
