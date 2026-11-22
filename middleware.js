// Vercel Routing Middleware.
//
// 1) Upis je zatvoren: sve javne stranice (/, /ponuda, /ponuda-2, /start, /uzivo, /hvala)
//    umesto sadrzaja prikazuju /zakljucano (lista cekanja + "Imaš lozinku?").
//    Ko unese tacnu lozinku (LOZINKA_UPISA na Vercelu) dobija kolacic preko
//    /api/otkljucaj i vidi prave stranice 30 dana. Promena lozinke na Vercelu
//    ponistava sve stare kolacice. Da se upis ponovo otvori za sve: izbaci
//    te putanje iz matcher-a (ili obrisi ZAKLJUCANE).
//
// 2) /snimak i /studio su interni: pregledac trazi sifru (AB_KLJUC na Vercelu),
//    ime moze biti bilo sta. Pokriva i .html da se ne bi zaobislo.

export const config = {
  matcher: [
    "/", "/index", "/index.html",
    "/ponuda", "/ponuda/", "/ponuda.html",
    "/ponuda-2", "/ponuda-2/", "/ponuda-2.html",
    "/start", "/start/", "/start.html",
    "/uzivo", "/uzivo/", "/uzivo.html",
    "/hvala", "/hvala/", "/hvala.html",
    "/zakljucano", "/zakljucano.html",
    "/snimak", "/snimak/", "/snimak.html",
    "/studio", "/studio/", "/studio.html",
  ],
};

const ZAKLJUCANE = /^\/(|index|ponuda|ponuda-2|start|uzivo|hvala)(\/|\.html)?$/;
const STRANA_ZAKLJUCANO = /^\/zakljucano(\.html)?$/;
const KOLACIC = "upis_otkljucan";

function istiTekst(a, b) {
  if (a.length !== b.length) return false;
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return razlika === 0;
}

// Isti potpis pravi i api/otkljucaj.js (HMAC-SHA256 lozinkom, hex).
async function potpis(lozinka) {
  const kljuc = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(lozinka), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", kljuc, new TextEncoder().encode("upis-otkljucan-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function kolacic(request, ime) {
  const sve = request.headers.get("cookie") || "";
  for (const deo of sve.split(";")) {
    const i = deo.indexOf("=");
    if (i > -1 && deo.slice(0, i).trim() === ime) return deo.slice(i + 1).trim();
  }
  return "";
}

async function otkljucan(request) {
  const lozinka = process.env.LOZINKA_UPISA;
  const imam = kolacic(request, KOLACIC);
  if (!lozinka || !imam) return false;
  return istiTekst(imam, await potpis(lozinka));
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const putanja = url.pathname;

  if (ZAKLJUCANE.test(putanja)) {
    if (await otkljucan(request)) return; // pusti dalje na pravu stranicu
    return new Response(null, {
      headers: {
        "x-middleware-rewrite": new URL("/zakljucano", url).toString(),
        "Cache-Control": "no-store",
      },
    });
  }

  if (STRANA_ZAKLJUCANO.test(putanja)) {
    // Ko je vec otkljucao, a otvori /zakljucano direktno, ide na ponudu.
    if (await otkljucan(request)) return Response.redirect(new URL("/ponuda-2", url), 302);
    return;
  }

  return internaSifra(request);
}

function internaSifra(request) {
  const tajna = process.env.AB_KLJUC;
  if (!tajna) {
    return new Response("Stranica nije dostupna.", { status: 503 });
  }

  const zaglavlje = request.headers.get("authorization") || "";
  if (zaglavlje.startsWith("Basic ")) {
    try {
      const dekodirano = atob(zaglavlje.slice(6));
      const sifra = dekodirano.slice(dekodirano.indexOf(":") + 1);
      if (istiTekst(sifra, tajna)) return; // pusti dalje na stranicu
    } catch {}
  }

  return new Response("Potrebna je šifra.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Interno", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
