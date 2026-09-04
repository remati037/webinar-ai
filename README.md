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
│   └── img/
│       ├── vladimir-stankovic.webp       # fotografija voditelja (800x1000)
│       ├── vladimir-stankovic-400.webp   # ista slika za manje ekrane
│       ├── og-image.jpg                  # slika za deljenje na mrežama (1200x630)
│       ├── favicon.svg
│       └── placeholder-rezultat-1..4.svg # placeholderi za sekciju „rezultati"
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
| Datum i vreme vebinara (countdown) | `assets/js/main.js`, promenljiva `VEBINAR_DATUM` |
| Broj prijavljenih / ukupno mesta | `assets/js/main.js`, `PRIJAVLJENO` i `UKUPNO_MESTA` |
| Boje i tipografija | `assets/css/style.css`, blok `:root` na vrhu |
| Tekstovi, FAQ, sekcije | `index.html` |
| Domen u SEO tagovima | `index.html`, sve pojave `https://vebinar.vladsdigital.com/` (canonical, og:url, og:image, JSON-LD) |

> **Važno pre lansiranja:** zameni domen `vebinar.vladsdigital.com` pravim domenom
> u `index.html`, inače će deljenje na društvenim mrežama pokazivati pogrešnu adresu.

## Zamena slika u sekciji „rezultati"

Ubaci screenshotove u `assets/img/` (najbolje u odnosu 16:10, npr. 1280x800, `.webp` ili `.jpg`)
i u `index.html` promeni `src` unutar `.dokazi-mreza`:

```html
<img src="/assets/img/rezultat-1.webp" width="1280" height="800" loading="lazy" decoding="async" alt="...">
```

Ako imaš manje od 4 slike, jednostavno obriši cele `<figure>` blokove koji ti ne trebaju —
mreža se sama prilagodi.

## Ubacivanje MailerLite forme

U `index.html` pronađi blok između komentara
`MAILERLITE PLACEHOLDER` i `KRAJ PLACEHOLDER FORME` i zameni ga MailerLite embed kodom.
Posle toga možeš da obrišeš i „Placeholder forma" blok na dnu `assets/js/main.js`.
