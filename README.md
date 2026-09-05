# Vebinar landing page

Landing stranica za besplatan vebinar „Kako da prodaš svoj prvi digitalni proizvod",
sa referal sistemom. Bez build koraka i bez framework-a: čist HTML, CSS i JS, plus
nekoliko Vercel serverless funkcija i Neon Postgres baza za prijave i referale.

## Struktura

```
.
├── index.html                  # landing stranica
├── hvala.html                  # licna stranica: referal link + tabela prijava
├── api/
│   ├── prijava.js              # POST: upis u bazu + slanje u MailerLite
│   ├── referali.js             # GET: podaci za licnu tabelu
│   ├── status.js               # GET: provera da li je okruzenje podeseno
│   ├── _lib.js                 # baza, validacija, maskiranje podataka
│   └── _mailerlite.js          # MailerLite API klijent
├── db/schema.sql               # sema baze, pokrece se jednom u Neon-u
├── assets/
│   ├── css/style.css           # svi stilovi
│   ├── js/main.js              # countdown, brojač mesta, scroll reveal
│   ├── js/prijava.js           # validacija i slanje forme
│   ├── js/hvala.js             # referal link i tabela prijava
│   ├── vebinar.ics             # termin za dodavanje u kalendar
│   └── img/
│       ├── vladimir-stankovic.webp       # fotografija voditelja (840x1260)
│       ├── vladimir-stankovic-560.webp   # ista slika za manje ekrane
│       ├── og-image.jpg                  # slika za deljenje na mrežama (1200x630)
│       ├── rezultat.jpeg                # screenshot u sekciji „rezultati"
│       ├── favicon.svg / favicon-32.png
│       └── apple-touch-icon.png          # ikona za home screen
├── mejlovi/
│   ├── dobrodoslica.html       # welcome mejl: potvrda prijave + referal link
│   └── potvrda-prijave.html    # opt-in mejl (neaktivan, double opt-in je iskljucen)
├── uputstvo-referal.md         # podesavanje baze, kljuceva i referal sistema
├── uputstvo-mailerlite-v4.md   # sve oko forme za prijavu i MailerLite-a
├── package.json                # jedina zavisnost: Neon drajver za /api funkcije
├── vercel.json                 # cache i security headeri
├── robots.txt
└── .gitignore
```

## Lokalni pregled

```bash
python3 -m http.server 8000
# pa otvori http://localhost:8000
```

Ovo servira samo statiku — dovoljno za rad na izgledu, ali **forma neće raditi** jer
`/api` rute nisu pokrenute. Za pun rad lokalno:

```bash
npm install
npx vercel dev     # sajt + /api rute na http://localhost:3000
```

## Push na GitHub

```bash
git remote add origin git@github.com:KORISNIK/REPO.git
git branch -M main
git push -u origin main
```

## Povezivanje sa Vercelom

1. Na [vercel.com](https://vercel.com) → **Add New… → Project** → izaberi ovaj GitHub repo.
2. **Framework Preset: Other.** Build Command i Output Directory ostavi prazne —
   stranice se serviraju direktno iz root-a, a Vercel sam prepoznaje `/api` folder
   kao serverless funkcije i instalira zavisnosti iz `package.json`.
3. **Deploy.** Svaki sledeći `git push` na `main` automatski pravi novi deploy.
4. Domen: **Project → Settings → Domains** → dodaj svoj domen (npr. `vebinar.vladsdigital.com`)
   i kod registrara podesi CNAME koji ti Vercel prikaže.

## Šta se najčešće menja

| Šta | Gde |
|---|---|
| Datum i vreme vebinara | `assets/js/main.js` (`VEBINAR_DATUM`), `assets/vebinar.ics` i Google Calendar link u `index.html` **i** `hvala.html` |
| Broj prijavljenih / ukupno mesta | `assets/js/main.js`, `PRIJAVLJENO` i `UKUPNO_MESTA` |
| Boje i tipografija | `assets/css/style.css`, blok `:root` na vrhu |
| Tekstovi, FAQ, sekcije | `index.html` |
| Domen u SEO tagovima | `index.html`, komentar `DOMEN` na vrhu `<head>` |

> **Pre lansiranja:** kad znaš konačan domen, dodaj `canonical` i `og:url` po uputstvu
> u komentaru na vrhu `<head>`. Do tada preview pri deljenju linka radi bez njih, jer
> crawler koristi adresu sa koje je stranicu povukao.

## Sekcija „rezultati"

Prikazuje jedan screenshot: `assets/img/rezultat.jpeg` (1600x400).

Za zamenu ubaci novu sliku u `assets/img/` i u `index.html` promeni `src` **i**
`width`/`height` na stvarne dimenzije slike — po njima se računa odnos stranica,
pa se slika ne deformiše i ne pomera layout dok se učitava.

Slika se prikazuje u punoj širini, bez sečenja. Na telefonu se ne smanjuje ispod
620px nego se okvir skroluje vodoravno, da brojevi ostanu čitljivi.

## Forma i MailerLite

Forma se šalje na `/api/prijava`, koja upisuje prijavu u bazu, dodeljuje referal kod
i prosleđuje kontakt MailerLite-u preko njihovog API-ja. Detalji su u
[uputstvo-mailerlite-v4.md](uputstvo-mailerlite-v4.md).

## Referal sistem

Svako ko se prijavi dobija lični link (`/?ref=k7m2xq`) i privatnu stranicu `/hvala`
sa tabelom ko se prijavio preko njega. Nagrada za određen broj referala još nije
uvedena, pa je stranica za sada samo link i pregled prijava. Kod je gotov, ali **traži jednokratno
podešavanje** baze, API ključa i dva polja u MailerLite-u —
korak po korak u [uputstvo-referal.md](uputstvo-referal.md).

Posle podešavanja, `https://tvoj-domen.com/api/status` pokazuje da li je sve na mestu.
