// Vercel Routing Middleware. /snimak, /studio, /start i /ponuda su zakljucani sifrom.
// /start i /ponuda su privremeno iza sifre dok se ponuda ne pusti javno:
// tada samo izbaci njihove putanje iz matcher-a.
// /snimak i /studio: ista sifra kao za /ab i /analiza (AB_KLJUC na Vercelu).
// /start i /ponuda: posebna sifra (PONUDA_KLJUC na Vercelu).
// Pregledac sam otvara prozor za korisnicko ime i sifru: ime moze biti bilo sta,
// bitna je samo sifra. Pokriva i /snimak.html da se ne bi zaobislo.

export const config = {
  matcher: ["/snimak", "/snimak/", "/snimak.html", "/studio", "/studio/", "/studio.html",
    "/start", "/start/", "/start.html", "/ponuda", "/ponuda/", "/ponuda.html"],
};

function istiTekst(a, b) {
  if (a.length !== b.length) return false;
  let razlika = 0;
  for (let i = 0; i < a.length; i++) razlika |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return razlika === 0;
}

export default function middleware(request) {
  const putanja = new URL(request.url).pathname;
  const ponuda = /^\/(start|ponuda)(\/|\.html)?$/.test(putanja);
  const tajna = ponuda ? process.env.PONUDA_KLJUC : process.env.AB_KLJUC;
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
      "WWW-Authenticate": ponuda
        ? 'Basic realm="Ponuda", charset="UTF-8"'
        : 'Basic realm="Interno", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
