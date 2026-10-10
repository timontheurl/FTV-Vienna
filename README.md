# FTV Vienna – Footvolley Wien

Vereins-Web-App für FTV Vienna:

- **Startseite** – links Training buchen, rechts King & Queen of the Week (nächster Sonntag + Top 3 der Rangliste)
- **Trainings** – alle Termine, Online-Anmeldung, automatische Warteliste, Absage per Stornocode
- **King & Queen of the Week** – Modus, Punktesystem, Anmeldung für die Sonntage (Kategorie King/Queen), letzte Ergebnisse
- **Rangliste** – Saison-Wertung mit Podest, getrennt nach Kings und Queens
- **Turniere**, **Blog** (Infoblog), **Kontakt** (Links + Kontaktformular)
- **Admin-Bereich** (`/admin`) – Termine anlegen (auch wöchentlich wiederholend), Teilnehmerlisten mit E-Mails,
  Sonntags-Ergebnisse eintragen, Turniere, Blogbeiträge, Nachrichten aus dem Kontaktformular

## Starten

Voraussetzung: Node.js ≥ 22.5 (nutzt das eingebaute `node:sqlite`, keine weiteren Abhängigkeiten).

```bash
ADMIN_PASSWORD='dein-sicheres-passwort' npm start
# → http://localhost:3000
```

| Variable         | Standard                 | Bedeutung                                       |
|------------------|--------------------------|-------------------------------------------------|
| `PORT`           | `3000`                   | HTTP-Port                                       |
| `ADMIN_PASSWORD` | `ftv-admin`              | Passwort für `/admin` – **unbedingt setzen!**   |
| `DB_FILE`        | `data/ftv-vienna.db`     | SQLite-Datei (regelmäßig sichern)               |
| `SEED`           | `1`                      | `0` = keine Demo-Inhalte in leere DB einfügen   |

Tests: `npm test`

## Inhalte anpassen

- **Vereinsdaten** (Instagram, E-Mail, Telefon, WhatsApp, Standardort): `public/js/config.js`.
  Leere Felder werden auf der Website automatisch ausgeblendet.
- **Punkte pro Platzierung**: `POINTS` in `src/app.js` (aktuell 10-8-6-5-4-3-2, danach 1 Punkt).
- Bei einer leeren Datenbank werden **Demo-Inhalte** angelegt (Beispieltrainings, zwei Beispiel-Sonntage mit
  Ergebnissen, zwei Blogbeiträge). Alles im Admin-Bereich bearbeit- bzw. löschbar.

## Recherche-Stand

Online gefunden (Footvolley Austria / Eversports-Profil): Footvolley Austria fördert den Sport seit 2010, Sitz in
Graz, in Wien betreut vom Landesverband Footvolley Wien; Links zu footvolleyaustria.at, Facebook und Instagram
(@friendsoffootvolley). Ein eigener Instagram-Account, eine E-Mail-Adresse, der Trainingsort und die
Trainingszeiten von FTV Vienna waren **nicht** auffindbar – bitte in `public/js/config.js` bzw. im Admin-Bereich ergänzen.

## Hosting

Läuft überall, wo ein dauerhafter Node-Prozess mit beschreibbarem Speicher möglich ist (z. B. ein kleiner VPS,
Railway, Fly.io mit Volume, Render mit Disk). Die SQLite-Datei muss auf einem persistenten Laufwerk liegen.
