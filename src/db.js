'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');

// All event times are Vienna wall-clock times. Serverless hosts (Vercel) run in UTC,
// so pin the process time zone before any Date is created.
process.env.TZ = process.env.APP_TZ || 'Europe/Vienna';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK (type IN ('training', 'kotw')),
  title       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,             -- ISO local datetime, e.g. 2026-10-12T18:00
  duration    INTEGER NOT NULL DEFAULT 120,
  location    TEXT NOT NULL,
  level       TEXT NOT NULL DEFAULT 'Alle Level',
  capacity    INTEGER NOT NULL DEFAULT 16,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registrations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  category    TEXT,                      -- 'king' | 'queen' for kotw events
  note        TEXT NOT NULL DEFAULT '',
  cancel_code TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (event_id, email)
);

CREATE TABLE IF NOT EXISTS results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('king', 'queen')),
  player      TEXT NOT NULL,
  placement   INTEGER NOT NULL CHECK (placement >= 1),
  UNIQUE (event_id, category, player)
);

CREATE TABLE IF NOT EXISTS tournaments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  starts_on   TEXT NOT NULL,             -- YYYY-MM-DD
  ends_on     TEXT,
  location    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  link        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS posts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  excerpt     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  tag         TEXT NOT NULL DEFAULT 'News',
  published_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Thin async wrapper around libSQL. Works with a remote Turso database
// (libsql://…) as well as a local file (file:…) or ':memory:' for tests.
function open({ url, authToken } = {}) {
  url = url || 'file:' + path.join(__dirname, '..', 'data', 'ftv-vienna.db');
  if (url.startsWith('file:')) fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
  const client = createClient({ url, authToken });
  const exec = async (sql, args = []) => client.execute({ sql, args });
  return {
    client,
    all: async (sql, ...args) => (await exec(sql, args)).rows.map((r) => ({ ...r })),
    get: async (sql, ...args) => {
      const r = (await exec(sql, args)).rows[0];
      return r ? { ...r } : undefined;
    },
    run: async (sql, ...args) => {
      const r = await exec(sql, args);
      return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
    },
    // Runs statements atomically: [[sql, args], ...]
    batch: async (stmts) => client.batch(stmts.map(([sql, args = []]) => ({ sql, args })), 'write'),
    migrate: async () => client.executeMultiple('PRAGMA foreign_keys = ON;' + SCHEMA),
  };
}

// --- Demo content -----------------------------------------------------------
// Inserted only into an empty database so the site does not look blank on first
// start. Everything here can be edited or deleted in the admin area.

function pad(n) {
  return String(n).padStart(2, '0');
}

function localIso(d, hh, mm) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hh)}:${pad(mm)}`;
}

function nextWeekday(from, weekday) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7));
  return d;
}

function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

async function seed(db, now = new Date()) {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM events');
  if (n > 0) return false;
  const stmts = [];

  const EVENT = `INSERT INTO events (type, title, starts_at, duration, location, level, capacity, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  const insEvent = (...args) => stmts.push([EVENT, args]);
  const location = 'Beachplatz Wien (Ort im Admin-Bereich anpassen)';

  const tue = nextWeekday(now, 2);
  const thu = nextWeekday(now, 4);
  const sun = nextWeekday(now, 0);
  for (let w = 0; w < 4; w++) {
    insEvent('training', 'Footvolley Basics', localIso(addDays(tue, 7 * w), 18, 0), 120, location,
      'Einsteiger:innen', 12, 'Grundtechniken: Annahme mit Brust & Oberschenkel, Pass, Shark Attack für Anfänger. Ball wird gestellt.');
    insEvent('training', 'Footvolley Advanced', localIso(addDays(thu, 7 * w), 18, 30), 120, location,
      'Fortgeschrittene', 16, 'Spielformen, Angriff (Shark Attack, Pescoço), Block & Defense. Gutes Ballgefühl vorausgesetzt.');
    insEvent('kotw', 'Sunday King & Queen of the Week', localIso(addDays(sun, 7 * w), 14, 0), 240, location,
      'Alle Level', 32, 'Jeden Sonntag: Teams werden jede Runde neu gemischt, gezählt wird individuell. Die besten Spieler:innen holen Punkte für die Saison-Rangliste.');
  }

  // Two past Sundays with results so the leaderboard has something to show.
  const pastSundays = [addDays(sun, -14), addDays(sun, -7)];
  const kingResults = [
    ['Lukas M.', 'David K.', 'Marco S.', 'Felix R.', 'Jonas P.', 'Tobias W.'],
    ['David K.', 'Marco S.', 'Lukas M.', 'Jonas P.', 'Felix R.', 'Paul H.'],
  ];
  const queenResults = [
    ['Anna B.', 'Lena F.', 'Sophie G.', 'Marie T.'],
    ['Lena F.', 'Anna B.', 'Julia N.', 'Sophie G.'],
  ];
  const RESULT = `INSERT INTO results (event_id, category, player, placement)
                  VALUES ((SELECT MAX(id) FROM events), ?, ?, ?)`;
  pastSundays.forEach((d, i) => {
    insEvent('kotw', 'Sunday King & Queen of the Week', localIso(d, 14, 0), 240,
      location, 'Alle Level', 32, 'Demo-Ergebnis – im Admin-Bereich löschbar.');
    kingResults[i].forEach((p, idx) => stmts.push([RESULT, ['king', p, idx + 1]]));
    queenResults[i].forEach((p, idx) => stmts.push([RESULT, ['queen', p, idx + 1]]));
  });

  const TOURNAMENT = 'INSERT INTO tournaments (name, starts_on, ends_on, location, description, link) VALUES (?, ?, ?, ?, ?, ?)';
  stmts.push([TOURNAMENT, ['FTV Vienna Season Finale (Beispiel)', localIso(addDays(sun, 27), 0, 0).slice(0, 10), null, location,
      'Saisonabschluss mit 2-gegen-2-Turnier und Krönung von King & Queen of the Season. Beispiel-Eintrag – bitte im Admin-Bereich anpassen.', '']]);
  stmts.push([TOURNAMENT, ['Footvolley Austria – Turnierkalender', localIso(now, 0, 0).slice(0, 10), null, 'Österreich (v. a. Graz)',
      'Nationale und internationale Turniere organisiert Footvolley Austria – Termine findest du auf der Verbandsseite.', 'https://footvolleyaustria.at']]);

  const POST = 'INSERT INTO posts (title, excerpt, body, tag, published_at) VALUES (?, ?, ?, ?, ?)';
  const insPost = (...args) => stmts.push([POST, args]);
  insPost('Willkommen auf der neuen FTV-Vienna-Website',
    'Trainings buchen, Sonntags-Rangliste checken, News lesen – ab jetzt alles an einem Ort.',
    'Servus und willkommen! Ab sofort könnt ihr euch hier direkt für unsere Trainings anmelden – kein Herumschreiben in Gruppen mehr.\n\n' +
    'Jeden Sonntag spielen wir King & Queen of the Week. Die Ergebnisse tragen wir ein, und auf der Rangliste seht ihr, wer die Saison anführt.\n\n' +
    'Neuigkeiten, Turniere und Infos rund um Footvolley in Wien findet ihr im Blog. Folgt uns auch auf Instagram!',
    'Verein', `${localIso(addDays(now, -2), 10, 0).replace('T', ' ')}:00`);
  insPost('Was ist Footvolley eigentlich?',
    'Beachvolleyball-Feld, Fußball-Technik: Ein kurzer Überblick über unseren Sport.',
    'Footvolley (portugiesisch: Futevôlei) wurde 1965 in Rio de Janeiro erfunden. Gespielt wird auf einem Beachvolleyballfeld – aber ohne Hände. ' +
    'Erlaubt ist alles, was auch beim Fußball erlaubt ist: Fuß, Oberschenkel, Brust, Kopf und Schulter.\n\n' +
    'Jedes Team hat maximal drei Ballkontakte, gespielt wird klassischerweise 2 gegen 2. Typische Angriffe heißen Shark Attack (Fallrückzieher-artiger Schuss von oben) oder Pescoço (mit dem Nacken).\n\n' +
    'In Österreich wird Footvolley seit 2010 vom Verein Footvolley Austria gefördert, in Wien vom Landesverband Footvolley Wien. Komm einfach zu einem Basics-Training – Ballgefühl ist hilfreich, aber keine Voraussetzung.',
    'Wissen', `${localIso(addDays(now, -9), 10, 0).replace('T', ' ')}:00`);
  await db.batch(stmts);
  return true;
}

module.exports = { open, seed };
