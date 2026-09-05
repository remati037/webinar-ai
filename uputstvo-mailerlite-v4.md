# MailerLite — stanje i održavanje

Kontakti i dalje idu u MailerLite nalog `564683`, ali **više ne preko embed forme**.
Od uvođenja referal sistema forma se šalje na našu rutu `/api/prijava`, koja upisuje
prijavu u bazu i tek onda prosleđuje kontakt MailerLite-u preko njihovog zvaničnog API-ja.

Podešavanje ključa, grupe i custom polja je u [uputstvo-referal.md](uputstvo-referal.md).
Ovaj dokument pokriva samo ono što se tiče MailerLite-a.

---

## Šta je gde u kodu

| Šta | Gde |
|---|---|
| Markup forme (Ime, Prezime, Email, Telefon) | `index.html`, blok `FORMA ZA PRIJAVU` |
| Validacija i slanje forme | `assets/js/prijava.js` |
| Poziv MailerLite API-ja | `api/_mailerlite.js` |
| Stilizacija forme | `assets/css/style.css`, sekcija `FORMA ZA PRIJAVU` |
| Poruka posle prijave + dugmad za kalendar | `hvala.html` |
| Fajl za kalendar | `assets/vebinar.ics` |

Detalji koje je korisno znati pri kasnijim izmenama:

- **Klase koje počinju sa `ml-` su ostale**, iako MailerLite-ovog JavaScripta više nema.
  Na njih se oslanja CSS. Ako menjaš markup, menjaj i CSS blok `FORMA ZA PRIJAVU`.
- **MailerLite-ov CSS nikad nije ni bio uključen** — original nosi ~600 linija svog
  stila (bela pozadina, Open Sans, crno dugme) koji se bije sa tamnom temom.
- **Telefon je sada `type="tel"`.** Ranije je morao da bude `type="text"` zbog
  MailerLite validacije; sa njihovom skriptom je otišlo i to ograničenje.
- **Broj telefona se prevodi u internacionalni format** (`065…` → `+381651324124`),
  jer MailerLite prima samo takav zapis. Prevod radi `assets/js/prijava.js` da čovek
  odmah vidi šta šalje, a `api/_lib.js` ga radi ponovo na serveru — klijentu se ne veruje.
  Podrazumevana zemlja je u promenljivoj `POZIVNI`, na oba mesta.
- **Greške se prikazuju u samoj formi** (`#prijava-greska`), a polje koje je problem
  dobija klasu `ml-error`.
- **Ako se dodaje novo polje**, treba ga dodati na četiri mesta: markup u `index.html`,
  čitanje vrednosti u `prijava.js`, validacija u `api/prijava.js` i prosleđivanje u
  `api/_mailerlite.js`.

### Ako menjaš MailerLite nalog

Nema više ID-jeva forme razbacanih po `index.html`. Menja se samo `MAILERLITE_API_KEY`
i `MAILERLITE_GROUP_ID` u Vercel Environment Variables, pa **Redeploy**.

---

## Šta ostaje da se podesi u MailerLite panelu

1. **Grupa** — `MAILERLITE_GROUP_ID` mora da pokazuje na grupu „Vebinar 14.9."
2. **Custom polja** `referal_kod`, `referal_link` i `referal_tabela`. Bez njih
   referal linkovi ne mogu da uđu u mejl. Uputstvo je u
   [uputstvo-referal.md](uputstvo-referal.md), korak 4.
3. **Automation** — trigger „when subscriber joins group" →
   - odmah: potvrda prijave sa ličnim referal linkom.
     Gotov HTML: [mejlovi/dobrodoslica.html](mejlovi/dobrodoslica.html)
   - par dana pre vebinara: email sa Zoom linkom
   - dan pre vebinara: podsetnik
   - 1h pre: podsetnik
   - 5 min pre: „počinjemo"

   > Stranica `/hvala` i opt-in mejl ljudima kažu da Zoom link stiže **par dana
   > pred vebinar**. Ako promeniš raspored, promeni i taj tekst na oba mesta.
4. **Double opt-in** — trenutno je isključen i sistem računa da jeste: svaka prijava
   se odmah vodi kao potvrđena. Ako ga uključiš, referali će se i dalje brojati odmah
   dok se ne doda webhook — videti odeljak „Kolona `status`" u uputstvu za referale.
   Gotov šablon opt-in mejla, sa spiskom svega što uz njega mora da se promeni,
   stoji u [mejlovi/potvrda-prijave.html](mejlovi/potvrda-prijave.html).

   > Sam `status: "active"` koji šaljemo iz `api/_mailerlite.js` preskače potvrdu,
   > pa uključivanje toggle-a u MailerLite panelu bez izmene koda ništa ne menja.
5. **Test prijava** — proveri ceo lanac: forma → `/hvala` sa referal linkom →
   email sa Zoom linkom → upis u grupu.

---

## Posle prijave

Prijava više ne prikazuje poruku u samoj formi nego vodi na **`/hvala?k=TOKEN&novo=1`**,
gde čovek dobija:

- potvrdu da je mesto rezervisano i da Zoom link stiže par dana pred vebinar
- **Dodaj u Google kalendar** — otvara Google Calendar sa popunjenim terminom
- **Apple / Outlook (.ics)** — preuzima `assets/vebinar.ics`
- svoj lični referal link sa dugmadima za deljenje
- tabelu ko se prijavio preko njega

Ako se termin vebinara pomeri, promeni ga na četiri mesta: `assets/vebinar.ics`,
Google Calendar link u `index.html` **i** u `hvala.html`, i `VEBINAR_DATUM` u
`assets/js/main.js`.

---

## Ostali placeholderi na stranici

| Šta | Status |
|---|---|
| Fotografija Vladimira | ✅ ubačena (`assets/img/vladimir-stankovic.webp`) |
| Slika rezultata | ✅ ubačena (`assets/img/rezultat.jpeg`), sekcija je vidljiva |
| Forma za prijavu | ✅ povezana sa bazom i MailerLite API-jem |
| Referal sistem | ⏸ kod je gotov, čeka podešavanje po `uputstvo-referal.md` |
| Broj prijavljenih | `PRIJAVLJENO` u `assets/js/main.js` — upiši stvaran broj pa se prikazuje „Ostalo još X od 200 mesta" |
| Domen u SEO tagovima | ⏸ još uvek `vebinar.vladsdigital.com` |
