# FTV Vienna – Footvolley Wien

Vereins-Web-App für FTV Vienna:

- **Startseite** – links Training buchen, rechts King & Queen of the Week (nächster Sonntag + Top 3 der Rangliste)
- **Trainings** – alle Termine, Online-Anmeldung, automatische Warteliste, Absage per Stornocode
- **King & Queen of the Week** – Modus, Punktesystem, Anmeldung für die Sonntage (Kategorie King/Queen), letzte Ergebnisse
- **Rangliste** – Saison-Wertung mit Podest, getrennt nach Kings und Queens
- **Turniere**, **Blog** (Infoblog), **Kontakt** (Links + Kontaktformular)
- **Admin-Bereich** (`/admin`) – Termine anlegen (auch wöchentlich wiederholend), Teilnehmerlisten mit E-Mails,
  Sonntags-Ergebnisse eintragen, Turniere, Blogbeiträge, Nachrichten aus dem Kontaktformular

## Live stellen: Vercel + Turso (gratis)

Die Seiten liegen statisch in `public/`, die API läuft als Vercel-Funktion (`api/index.js`),
die Daten (Anmeldungen, Rangliste, Blog …) liegen in einer **Turso**-Datenbank (gehostetes SQLite).

### 1. Turso-Datenbank anlegen
1. Auf [turso.tech](https://turso.tech) mit GitHub anmelden (Free-Plan).
2. Im Dashboard **Create Database** → Name z. B. `ftv-vienna`, Region **Frankfurt** (nahe Wien).
3. In der Datenbank:
   - die **URL** kopieren (beginnt mit `libsql://…`)
   - **Create Token** (Lesen & Schreiben) → Token kopieren

   Tabellen musst du keine anlegen – das passiert automatisch beim ersten Aufruf.

### 2. Projekt auf Vercel importieren
1. Auf [vercel.com](https://vercel.com) mit GitHub anmelden (Hobby-Plan).
2. **Add New → Project** → Repository `FTV-Vienna` importieren.
3. Framework Preset: **Other** – Build-Einstellungen nicht ändern (kommen aus `vercel.json`).
4. Unter **Environment Variables** eintragen:

   | Name                  | Wert                                   |
   |-----------------------|----------------------------------------|
   | `TURSO_DATABASE_URL`  | die `libsql://…`-URL aus Schritt 1     |
   | `TURSO_AUTH_TOKEN`    | der Token aus Schritt 1                |
   | `ADMIN_PASSWORD`      | ein eigenes, sicheres Passwort         |
   | `SEED` (optional)     | `0`, wenn **keine** Demo-Inhalte angelegt werden sollen |

5. **Deploy** – fertig. Die Seite ist unter `https://<projekt>.vercel.app` erreichbar.
   Jeder Push auf den Hauptbranch geht automatisch live.

Eigene Domain (z. B. `ftv-vienna.at`): in Vercel unter **Settings → Domains** hinzufügen und
die angezeigten DNS-Einträge beim Domain-Anbieter setzen.

## Lokal starten

Voraussetzung: Node.js 22.

```bash
npm install
ADMIN_PASSWORD='geheim' npm start     # → http://localhost:3000
npm test
```

Ohne `TURSO_DATABASE_URL` nutzt die App lokal die Datei `data/ftv-vienna.db` – kein Account nötig.
Mit gesetzter `TURSO_DATABASE_URL` (+ `TURSO_AUTH_TOKEN`) arbeitet auch der lokale Server direkt auf der Live-Datenbank.

| Variable             | Standard               | Bedeutung                                         |
|----------------------|------------------------|---------------------------------------------------|
| `TURSO_DATABASE_URL` | lokale Datei           | `libsql://…` (Turso) oder `file:pfad/zur.db`      |
| `TURSO_AUTH_TOKEN`   | –                      | Token für Turso                                   |
| `ADMIN_PASSWORD`     | `ftv-admin` (nur lokal)| Passwort für `/admin` – auf Vercel Pflicht        |
| `SEED`               | `1`                    | `0` = keine Demo-Inhalte in leere DB einfügen     |
| `PORT`               | `3000`                 | nur lokaler Server                                |

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
