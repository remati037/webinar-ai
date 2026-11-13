# Radionica uživo: postavljanje

Platforma ima tri dela:

| Deo | Gde | Šta radi |
|---|---|---|
| `/uzivo` | Vercel (`uzivo.html`, `assets/js/uzivo.js`) | ulaz sa imenom i emailom, prenos, chat, ankete, reakcije, ponuda |
| `/studio` | Vercel (`studio.html`, `assets/js/studio.js`), zaključano šifrom `AB_KLJUC` | razgovori, poruke svima, ponuda, ankete, podešavanja, analitika |
| Worker | Cloudflare (`worker/`) | WebSocket soba, video stream iz R2, sva statistika |

Video se pušta kao prenos uživo: svi gledaju isti trenutak, nema premotavanja ni pauze,
a delovi videa koji još nisu „emitovani" ne mogu da se preuzmu.

## 1. Cloudflare nalog (jednom)

1. Otvori nalog na [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Plans → Workers Paid** (5 dolara mesečno). Otkaži posle radionice.
3. **R2 → Purchase R2 / Enable** (prvih 10 GB je besplatno, preuzimanje se ne naplaćuje).

## 2. Povezivanje i postavljanje Worker-a

```bash
cd worker
npm install
npx wrangler login
npx wrangler r2 bucket create vebinar-video
npx wrangler secret put LIVE_TAJNA       # bilo koja duga nasumična lozinka
npx wrangler secret put STUDIO_KLJUC     # šifra za /studio
npx wrangler secret put DATABASE_URL     # (opciono) isti Neon URL kao na Vercelu
npx wrangler deploy
```

`deploy` ispiše adresu, npr. `https://vebinar-stream.vladimirst95.workers.dev`.
Tu adresu upiši u `<meta name="live-api">` u **`uzivo.html`** i **`studio.html`**, pa push na GitHub.

Ako je postavljen `DATABASE_URL`, pokreni i `db/migracija-uzivo.sql` u Neon SQL Editor-u.

## 3. Video

```bash
cd worker
./skripte/pripremi-video.sh /putanja/do/radionica.mp4
```

Skripta pretvara video u HLS (delovi od 6 sekundi), normalizuje jačinu zvuka i šalje ga u R2. Za video od 90 minuta
traje nekoliko minuta. Za zamenu videa samo je pokreni ponovo sa novim fajlom.

## 4. Podešavanja u /studio

**Podešavanja**: vreme početka videa, link za kupovinu, tekst ponude, minut za automatsku
ponudu (rezerva ako niko ne klikne „Pošalji ponudu"), poruka dobrodošlice.
Sve se menja bez novog deploy-a i učesnici odmah vide promenu.

Lokalno ime za odgovaranje upiše svako ko odgovara, gore desno na tabu **Uživo**.

## 5. Link u mejlovima

```
https://TVOJ-DOMEN/uzivo?ime={$name}&email={$email}
```

Ko klikne link iz mejla ulazi odmah, bez kucanja. Bez parametara dobija formu.

## 6. Proba pre radionice

1. `/studio` → Podešavanja → **Počni za 1 min**, uđi na `/uzivo` sa telefona i računara.
2. Test opterećenja (2000 lažnih učesnika, 2 minuta):
   ```bash
   cd worker
   node skripte/test-opterecenja.mjs https://vebinar-stream.vladimirst95.workers.dev 2000 120
   ```
3. Posle probe: **Obriši sve podatke** i **Vrati na 16.11. 18:58**.

## Lokalni rad

```bash
cd worker && npm run dev          # Worker na http://localhost:8787 (tajne u worker/.dev.vars)
python3 -m http.server 4173       # stranice: /uzivo.html i /studio.html
./skripte/pripremi-video.sh video.mp4 --local
```

Na `localhost` stranice same koriste lokalni Worker.

## Šta se gde menja

| Šta | Gde |
|---|---|
| Vreme, ponuda, dobrodošlica, tekst na kraju | `/studio` → Podešavanja |
| Brzi odgovori u studiju | `assets/js/studio.js`, `BRZI` |
| Rezerva i sinhronizacija prenosa | `PRED` u `worker/src/index.js` i `liveSyncDuration` u `assets/js/uzivo.js` (drugi broj treba da bude za oko 3 veći) |
| Izgled sobe | `assets/css/uzivo.css` |

Posle izmene JS ili CSS fajla promeni broj `?v=` u `uzivo.html` / `studio.html`. Fajlovi se keširaju 7 dana, pa bez toga ljudi koji su već bili na stranici dobijaju staru verziju.
