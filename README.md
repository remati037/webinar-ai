# Vebinar landing page

Statična landing stranica za besplatan vebinar „Kako da prodaš svoj prvi digitalni proizvod".
Bez build koraka, bez framework-a. Čist HTML, CSS i JS, spremno za Vercel.

## Struktura

```
.
├── index.html                  # cela stranica (sadržaj)
├── assets/
│   ├── css/style.css           # svi stilovi
│   ├── js/main.js              # countdown, brojač mesta, scroll reveal
│   ├── vebinar.ics             # termin za dodavanje u kalendar
│   └── img/
│       ├── vladimir-stankovic.webp       # fotografija voditelja (840x1260)
│       ├── vladimir-stankovic-560.webp   # ista slika za manje ekrane
│       ├── og-image.jpg                  # slika za deljenje na mrežama (1200x630)
│       ├── rezultat.jpeg                # screenshot u sekciji „rezultati"
│       ├── favicon.svg / favicon-32.png
│       └── apple-touch-icon.png          # ikona za home screen
├── uputstvo-mailerlite-v4.md   # sve oko forme za prijavu
├── vercel.json                 # cache i security headeri
├── robots.txt
└── .gitignore
```

## Lokalni pregled

```bash
python3 -m http.server 8000
# pa otvori http://localhost:8000
```

(Otvaranje `index.html` duplim klikom takođe radi, ali putanje koje počinju sa `/`
rade ispravno samo preko servera, pa koristi komandu iznad.)

## Push na GitHub

```bash
git remote add origin git@github.com:KORISNIK/REPO.git
git branch -M main
git push -u origin main
```

## Povezivanje sa Vercelom

1. Na [vercel.com](https://vercel.com) → **Add New… → Project** → izaberi ovaj GitHub repo.
2. **Framework Preset: Other.** Build Command i Output Directory ostavi prazne —
   ovo je statična stranica i servira se direktno iz root-a.
3. **Deploy.** Svaki sledeći `git push` na `main` automatski pravi novi deploy.
4. Domen: **Project → Settings → Domains** → dodaj svoj domen (npr. `vebinar.vladsdigital.com`)
   i kod registrara podesi CNAME koji ti Vercel prikaže.

## Šta se najčešće menja

| Šta | Gde |
|---|---|
| Datum i vreme vebinara | `assets/js/main.js` (`VEBINAR_DATUM`), `assets/vebinar.ics` i Google Calendar link u `index.html` |
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

## MailerLite forma

Forma je već ubačena i povezana sa MailerLite nalogom, stilizovana u temu stranice,
sa porukom i dugmadima za kalendar posle uspešne prijave.
Detalji, kao i šta ostaje da se podesi u samom MailerLite panelu (grupa, automation,
double opt-in), su u [uputstvo-mailerlite-v4.md](uputstvo-mailerlite-v4.md).
