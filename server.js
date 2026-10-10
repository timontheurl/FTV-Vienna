'use strict';

const http = require('node:http');
const path = require('node:path');
const { open, seed } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'ftv-vienna.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ftv-admin';

if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠  ADMIN_PASSWORD ist nicht gesetzt – Standardpasswort "ftv-admin" aktiv. Für den Live-Betrieb unbedingt ändern!');
}

const db = open(DB_FILE);
if (process.env.SEED !== '0' && seed(db)) console.log('Demo-Inhalte angelegt.');

const app = createApp({ db, adminPassword: ADMIN_PASSWORD, publicDir: path.join(__dirname, 'public') });
http.createServer(app).listen(PORT, () => console.log(`FTV Vienna läuft auf http://localhost:${PORT}`));
