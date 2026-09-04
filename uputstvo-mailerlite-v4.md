# MailerLite forma — stanje i održavanje

Forma je **ubačena i povezana** sa MailerLite nalogom `564683`, forma `197702876918711405`.
Ovaj dokument opisuje šta je već odrađeno u kodu i šta ostaje da se podesi u MailerLite panelu.

---

## Šta je odrađeno u kodu

| Šta | Gde |
|---|---|
| Embed forme (Ime, Prezime, Email, Telefon) | `index.html`, blok `MAILERLITE FORMA` |
| Stilizacija u temu stranice | `assets/css/style.css`, sekcija `MAILERLITE FORMA` |
| Poruka posle uspešne prijave + dugmad za kalendar | `index.html`, blok `ml-form-successBody` |
| Fajl za kalendar | `assets/vebinar.ics` |
| MailerLite skripte | dno `index.html` |

Detalji koje je korisno znati pri kasnijim izmenama:

- **MailerLite-ov CSS je namerno izbačen.** Originalni embed nosi ~600 linija svog CSS-a
  (bela pozadina, Open Sans, crno dugme) koji se bije sa tamnom temom. Zadržana je samo
  njihova struktura klasa (`ml-form-fieldRow`, `ml-field-group`, `ml-validate-required`…)
  jer se na nju oslanja njihov JavaScript za validaciju i slanje.
- **Polja su dobila prave `<label>` elemente**, a ne samo placeholder tekst.
- **Raspored:** Ime i Prezime dele red, Email i Telefon idu preko cele širine.
  To radi pravilo `.ml-form-fieldRow:nth-child(n+3) { grid-column: 1 / -1; }` — ako u
  MailerLite-u dodaš novo polje, proveri redosled.
- **Telefon** je prebačen na `type="tel"` radi numeričke tastature na telefonu.
- **Success callback** `ml_webform_success_45583611()` je napisan u čistom JS-u (bez jQuery
  zavisnosti): sakriva formu, prikazuje poruku, menja naslov kartice u „Vidimo se na vebinaru",
  sklanja bedž sa brojem mesta i skroluje do poruke.

### Ako napraviš novu formu u MailerLite-u

Promeni na četiri mesta u `index.html`:

1. `action` atribut na `<form>` (novi URL sa `.../jsonp/NALOG/forms/ID/subscribe`)
2. `id="mlb2-XXXX"` i klasu `ml-subscribe-form-XXXX`
3. ime funkcije `ml_webform_success_XXXX`
4. `fetch(".../takel")` URL na dnu

---

## Šta ostaje da se podesi u MailerLite panelu

1. **Grupa** — proveri da forma upisuje pretplatnike u grupu „Vebinar 14.9."
2. **Automation** — trigger „when subscriber joins group" →
   - odmah: email sa Zoom linkom
   - dan pre vebinara: podsetnik
   - 1h pre: podsetnik
   - 5 min pre: „počinjemo"
3. **Double opt-in** — ako je uključen, korisnik mora prvo da potvrdi email pre nego što
   dobije Zoom link. Za vebinar je obično **bolje isključiti** ga (Forms → Settings), inače
   deo ljudi nikad ne potvrdi i ostane bez linka.
4. **Test prijava** — prijavi se svojom adresom i proveri ceo lanac: poruka na stranici →
   email sa linkom → upis u grupu.

---

## Posle prijave (već implementirano na stranici)

Korisnik dobija zelenu karticu sa porukom da mu Zoom link stiže na email, napomenom da
snimka neće biti i dva dugmeta:

- **Dodaj u Google kalendar** — otvara Google Calendar sa popunjenim terminom
- **Apple / Outlook (.ics)** — preuzima `assets/vebinar.ics`

Ako se termin vebinara pomeri, promeni ga na tri mesta: `assets/vebinar.ics`,
Google Calendar link u `index.html` i `VEBINAR_DATUM` u `assets/js/main.js`.

---

## Ostali placeholderi na stranici

| Šta | Status |
|---|---|
| Fotografija Vladimira | ✅ ubačena (`assets/img/vladimir-stankovic.webp`) |
| Slika rezultata | ✅ ubačena (`assets/img/rezultat.jpeg`), sekcija je vidljiva |
| MailerLite forma | ✅ ubačena i stilizovana |
| Broj prijavljenih | `PRIJAVLJENO` u `assets/js/main.js` — upiši stvaran broj pa se prikazuje „Ostalo još X od 200 mesta" |
| Domen u SEO tagovima | ⏸ još uvek `vebinar.vladsdigital.com` |
