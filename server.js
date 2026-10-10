'use strict';

// Lokaler Server / klassisches Hosting. Auf Vercel übernimmt api/index.js.
const http = require('node:http');
const path = require('node:path');
const { open } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ftv-admin';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠  ADMIN_PASSWORD ist nicht gesetzt – Standardpasswort "ftv-admin" aktiv. Für den Live-Betrieb unbedingt ändern!');
}

// Ohne TURSO_DATABASE_URL wird lokal die Datei data/ftv-vienna.db verwendet.
const db = open({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const app = createApp({ db, adminPassword: ADMIN_PASSWORD, publicDir: path.join(__dirname, 'public'), seedDemo: process.env.SEED !== '0' });
http.createServer(app).listen(PORT, () => console.log(`FTV Vienna läuft auf http://localhost:${PORT}`));
