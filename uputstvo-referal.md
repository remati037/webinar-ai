# Referal sistem — podešavanje

Sve je već napisano u kodu. Ostaje da se naprave baza, ključ i dva polja u
MailerLite-u. Ukupno oko 15 minuta klikanja. Idi redom.

---

## 1. Napravi bazu (Neon preko Vercela)

1. Otvori svoj projekat na [vercel.com](https://vercel.com) → tab **Storage**.
2. **Create Database** → **Neon** (Serverless Postgres) → region **Frankfurt**
   (najbliži, najmanje kašnjenje) → **Create**.
3. Kad se napravi, klikni **Connect Project** i poveži je sa ovim projektom.
   Vercel sam ubacuje `DATABASE_URL` u Environment Variables — ne kucaš ga ručno.
4. Klikni **Open in Neon** → u levom meniju **SQL Editor**.
5. Otvori fajl [db/schema.sql](db/schema.sql) iz ovog repoa, kopiraj **ceo sadržaj**,
   nalepi u SQL Editor i klikni **Run**.
   Treba da piše da je uspelo. Ako pokreneš dvaput, ništa se ne lomi.

---

## 2. Uzmi MailerLite API ključ

1. MailerLite → **Integrations** → **MailerLite API** → **Use**.
2. **Generate new token**, nazovi ga `vebinar-sajt`, kopiraj ključ.
   > Prikazuje se **samo jednom**. Ako ga izgubiš, napravi novi.

---

## 3. Nađi ID grupe

1. MailerLite → **Subscribers** → **Groups** → otvori grupu „Vebinar 14.9.".
2. Pogledaj adresu u pretraživaču:
   `...mailerlite.com/subscribers/groups/123456789/...`
   Onaj dugačak broj je ID grupe.

---

## 4. Napravi dva custom polja u MailerLite-u

Bez ovih polja mejl ne može da nosi lični referal link.

MailerLite → **Subscribers** → **Fields** → **Create field**, dva puta:

| Naziv polja | Tip  | Ime u kodu (mora tačno ovako) |
|---|---|---|
| Referal kod  | Text | `referal_kod`  |
| Referal link | Text | `referal_link` |

> MailerLite obično sam pravi `ime_polja` iz naziva. Proveri da je baš
> `referal_kod` i `referal_link`, bez velikih slova i bez crtica.
>
> Ako polja ne postoje, sajt i dalje radi — prijava prolazi, čovek dobija Zoom link
> i vidi svoj referal link na `/hvala`. Samo mu link neće stići u mejlu.

---

## 5. Upiši promenljive na Vercelu

Vercel → projekat → **Settings** → **Environment Variables**:

| Ime | Vrednost | Okruženja | Obavezno |
|---|---|---|---|
| `MAILERLITE_API_KEY` | ključ iz koraka 2 | sva tri | da |
| `MAILERLITE_GROUP_ID` | broj iz koraka 3 | sva tri | da |
| `SITE_URL` | `https://tvoj-domen.com` (bez `/` na kraju) | **samo Production** | da |
| `DATABASE_URL` | — | — | Vercel ga je već dodao u koraku 1 |

> **`SITE_URL` upiši samo za Production.** Iz njega se sastavlja referal link koji
> ljudi dele, pa na produkciji mora da bude tvoj pravi domen. Ako ga ostaviš prazan
> za Preview i Development, sistem uzima adresu sa koje je zahtev stigao — što je
> baš ono što treba na preview deployu, jer tamo linkovi pokazuju na sam preview
> a ne na produkciju.

Posle dodavanja promenljivih uradi **Redeploy** (Deployments → … → Redeploy).
Vercel ih ne ubacuje u već postojeći deploy.

---

## 6. Proveri da li je sve na mestu

Otvori `https://tvoj-domen.com/api/status`. Treba da vidiš:

```json
{"ok":true,"env":{"DATABASE_URL":true,"MAILERLITE_API_KEY":true,
 "MAILERLITE_GROUP_ID":true,"SITE_URL":true},"baza":"povezana","tabela_prijave":true}
```

Ako je nešto `false`, tu ti i piše šta fali.

---

## 7. Testiraj ceo lanac

1. Prijavi se svojom adresom na `/`.
2. Treba da te odvede na `/hvala?k=...` sa tvojim referal linkom.
3. **Kopiraj taj link**, otvori ga u privatnom prozoru i prijavi se drugom adresom.
4. Vrati se na svoju `/hvala` stranicu i osveži — nova prijava mora da bude u tabeli.
5. Proveri da su obe adrese upale u MailerLite grupu i da su dobile Zoom link.

Kad testiraš, obriši probne prijave da ti ne kvare brojeve:

```sql
-- u Neon SQL Editor-u
DELETE FROM prijave WHERE email IN ('tvoj@email.com', 'test@email.com');
```

---

## 8. Ubaci referal link u welcome mejl

MailerLite → **Automations** → automation koji šalje Zoom link → u telo mejla
dodaj nešto ovako:

> Usput, ako ti se vebinar čini korisnim, pozovi nekoga. Evo tvog ličnog linka:
>
> `{$referal_link}`
>
> Na istom linku uvek vidiš ko se prijavio preko tebe.

Personalizaciju ubacuješ preko dugmeta **Personalization** u editoru, ne kucanjem —
tako si siguran da je tačan naziv polja.

> **Redosled je bitan.** Automation šalje mejl čim čovek uđe u grupu, a referal
> polje se upisuje u istom trenutku. Ako u testu vidiš prazan link, stavi u
> automation kratko čekanje (npr. 1 minut) pre slanja mejla.

---

## Šta gde stoji

| Deo | Fajl |
|---|---|
| Šema baze | [db/schema.sql](db/schema.sql) |
| Prijava (upis + MailerLite) | [api/prijava.js](api/prijava.js) |
| Podaci za ličnu tabelu | [api/referali.js](api/referali.js) |
| Provera podešavanja | [api/status.js](api/status.js) |
| Zajedničke funkcije | [api/_lib.js](api/_lib.js) |
| MailerLite klijent | [api/_mailerlite.js](api/_mailerlite.js) |
| Slanje forme sa landinga | [assets/js/prijava.js](assets/js/prijava.js) |
| Stranica `/hvala` | [hvala.html](hvala.html), [assets/js/hvala.js](assets/js/hvala.js) |

---

## Kako sistem radi

1. Neko otvori `tvoj-domen.com/?ref=k7m2xq`. `prijava.js` zapamti kod `k7m2xq`
   u `localStorage`, da preživi skrolovanje i osvežavanje stranice.
2. Prijavi se → `POST /api/prijava` sa podacima i kodom pozivaoca.
3. Backend proveri podatke, nađe pozivaoca po kodu, upiše novu prijavu u bazu i
   dodeli joj **sopstveni** referal kod i tajni token.
4. Kontakt se prosleđuje MailerLite-u zajedno sa referal linkom u custom polju.
5. Čovek završi na `/hvala?k=TOKEN&novo=1` gde vidi svoj link i tabelu.
6. Kasnije se na istu stranicu vraća preko linka iz mejla ili iz bookmarks-a.

### Zaštita koja je već ugrađena

- **Email je jedinstven.** Ista adresa se ne može brojati dvaput; ponovna prijava
  samo osveži podatke i vrati isti token.
- **Niko ne može da preporuči sam sebe** — poredi se email pozivaoca i prijavljenog.
- **Najviše 8 prijava sa iste IP adrese u 15 minuta.** Menja se u
  [api/prijava.js](api/prijava.js), konstante `MAKS_PO_IP` i `PROZOR_MIN`.
- **Skriveno polje kao zamka za botove** — čovek ga ne vidi, bot ga popuni i prijava
  se tiho odbaci.
- **Tuđi podaci se ne prikazuju u celosti.** U tabeli stoji „Marko P." i
  „mar***@gmail.com", nikad pun email. Maskiranje radi backend, tako da pun email
  nikad ni ne stigne do pretraživača.

### Kolona `status`

Sada su sve prijave odmah `potvrdjen`, jer je double opt-in u MailerLite-u isključen.
Kolona i prikaz „Čeka potvrdu" u tabeli već postoje, pa ako kasnije uključiš
double opt-in treba samo da se doda MailerLite webhook koji red prebacuje iz
`prijavljen` u `potvrdjen`.

---

## Lokalni razvoj

`python3 -m http.server` servira samo statiku — `/api` rute neće raditi.
Za pun rad lokalno:

```bash
npm install -g vercel
vercel link          # poveži folder sa Vercel projektom
vercel env pull      # povuče promenljive u .env.local
vercel dev           # sajt + /api rute na http://localhost:3000
```

> Za lokalno testiranje napravi u Neon-u zaseban **branch** baze i njegov
> connection string stavi u `.env.local`. Tako ti probne prijave ne ulaze
> u pravu tabelu.

---

## Kasniji koraci (još nije napravljeno)

- **Admin pregled** — ko ima najviše referala. Podaci su već u bazi, treba samo
  ruta `/api/admin` zaštićena lozinkom i stranica sa rang listom.
- **Webhook za double opt-in** — ako ga uključiš, videti odeljak „Kolona `status`".
- **Nagrada za određen broj referala** — nije uvedena. Kada se odlučiš šta nosi
  koliko referala, vraća se brojač napretka na `/hvala` i obaveštenje kada neko
  pređe prag. Podaci za to su već u bazi.
- **Dugmad za deljenje** (WhatsApp, Viber, Telegram, Facebook, email) su bila
  napravljena pa uklonjena na zahtev. Vraćaju se lako iz istorije commita.
