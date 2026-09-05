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

## 4. Napravi tri custom polja u MailerLite-u

Bez ovih polja mejl ne može da nosi lični referal link.

MailerLite → **Subscribers** → **Fields** → **Create field**, tri puta:

| Naziv polja | Tip  | Ime u kodu (mora tačno ovako) | Šta sadrži |
|---|---|---|---|
| Referal kod    | Text | `referal_kod`    | `k7m2xq` |
| Referal link   | Text | `referal_link`   | link koji čovek deli drugima |
| Referal tabela | Text | `referal_tabela` | link ka njegovoj ličnoj tabeli prijava |

> MailerLite obično sam pravi `ime_polja` iz naziva. Proveri da su baš
> `referal_kod`, `referal_link` i `referal_tabela`, bez velikih slova i bez crtica.
>
> Ako polja ne postoje, sajt i dalje radi: prijava prolazi, čovek upada u grupu
> i vidi svoj referal link na `/hvala`. Samo mu linkovi neće stići u mejlu.

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

## 8. Napravi welcome mejl sa referal linkom

Ovo je mejl koji stiže odmah posle prijave. Nosi potvrdu, termin, dugmad za
kalendar i lični referal link. Gotov HTML je u
[mejlovi/dobrodoslica.html](mejlovi/dobrodoslica.html).

### 8.1 Napravi automation

1. MailerLite → **Automations** → **Create automation**, nazovi ga `Vebinar prijava`.
2. Trigger: **When subscriber joins a group** → izaberi grupu „Vebinar 14.9."
3. Dodaj korak **Email**.

> Bez čekanja pre prvog mejla. Referal polja i upis u grupu idu u istom API
> pozivu, pa su popunjena u trenutku kad se automation okine.

### 8.2 Podesi zaglavlje mejla

| Polje | Vrednost |
|---|---|
| Subject | `Mesto je rezervisano. Evo tvog linka za pozivanje prijatelja` |
| From name | Vladimir Stanković |
| From email | tvoja adresa na verifikovanom domenu |

### 8.3 Ubaci sadržaj

Mejl ide u **dva HTML bloka**, a između njih dolazi MailerLite-ovo dugme.
Razlog je u 8.4, pročitaj ga pre nego što kreneš.

1. U editoru izaberi **prazan template** (blank), ne gotov dizajn.
2. Otvori [mejlovi/dobrodoslica.html](mejlovi/dobrodoslica.html).
3. Prevuci **HTML** blok i nalepi u njega deo označen `BLOK 1`.
4. Ispod njega prevuci **Button** blok i podesi:

   | Podešavanje | Vrednost |
   |---|---|
   | Tekst | `Pogledaj svoje prijave` |
   | Link | custom polje **Referal tabela** |
   | Pozadina | `#2E90FF` |
   | Boja teksta | `#FFFFFF` |
   | Font | bold, 16px |
   | Zaobljenje | 12px |
   | Padding | 16px gore/dole, 32px levo/desno |
   | Poravnanje | levo |

   Link se bira iz padajućeg menija za promenljive, **ne kuca se rukom**.
   Ako otkucaš adresu, svi dobijaju isti link i vide tuđe prijave.

5. Ispod dugmeta prevuci još jedan **HTML** blok i nalepi deo označen `BLOK 2`.
6. **Zameni `TVOJ-DOMEN.com`** svojim domenom. Pojavljuje se jednom, u linku za
   `.ics` fajl. U mejlu linkovi moraju biti apsolutni, relativna putanja ne radi.
7. Ako editor ima podrazumevani footer sa adresom pošiljaoca, ostavi ga.
   Zakonski je obavezan.

### 8.4 Zašto dugme ne sme da bude u HTML bloku

MailerLite prepakuje svaki `href` u svoju adresu za praćenje klikova
(`...clicks.mlsend.com/tf/c/...`). U sirovom HTML bloku to uradi **pre** nego što
razreši promenljivu, pa dugme završi na praznom tracking linku koji otvara
njihov preview umesto tvoje stranice.

Njihov **Button** blok to radi ispravno, jer se promenljiva razrešava pri slanju.
Zato svaki link koji se razlikuje od čoveka do čoveka mora da ide kroz njihov
element. Isto važi i za dugme za potvrdu u opt-in mejlu.

Iz istog razloga je referal link u BLOKU 1 **običan tekst, a ne link**. On se
kopira i šalje dalje. Da je klikabilan, praćenje klikova bi ga pretvorilo u
tracking adresu, pa bi ljudi prijateljima slali link koji vodi na tuđ nalog.

> Ako baš hoćeš sve u jednom HTML bloku, alternativa je da isključiš praćenje
> klikova za ovaj mejl. Onda `href` ostaje netaknut, ali gubiš statistiku klikova.
> Preporučujem Button blok.

### 8.5 Pošalji test

**Preview and test** → **Send test email** sebi. Proveri:

- da li se `{$name}` popunilo
- da li referal link u okviru izgleda kao `tvoj-domen.com/?ref=NEKI-KOD`
- da li dugme **Pogledaj svoje prijave** otvara tvoju `/hvala` stranicu sa tabelom
- da li rezervni link ispod dugmeta pokazuje istu adresu
- da li **Apple / Outlook** dugme preuzima `.ics` fajl
- kako izgleda na telefonu

> **Test mejl nije dokaz.** MailerLite u testu često ne popunjava custom polja,
> pa dugme može da vodi na prazan tracking link iako je sve ispravno podešeno.
> Pravu proveru radi tako što se prijaviš sa svoje adrese kroz formu na sajtu
> i klikneš dugme u mejlu koji ti tada stigne.

### 8.6 Uključi automation

Gore desno **Start automation**. Od tog trenutka mejl kreće svakome ko se prijavi.
Ljudi koji su se prijavili pre uključivanja ga neće dobiti automatski.

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
