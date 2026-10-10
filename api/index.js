'use strict';

// Vercel Serverless Function: bedient alle /api/*-Routen (siehe vercel.json).
// Die Seiten unter public/ liefert Vercel direkt als statische Dateien aus.
const path = require('node:path');
const { open } = require('../src/db');
const { createApp } = require('../src/app');

const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, ADMIN_PASSWORD } = process.env;

let handler;
module.exports = (req, res) => {
  if (!TURSO_DATABASE_URL || !ADMIN_PASSWORD) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Server nicht konfiguriert: TURSO_DATABASE_URL und ADMIN_PASSWORD in Vercel setzen.' }));
  }
  handler ??= createApp({
    db: open({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN }),
    adminPassword: ADMIN_PASSWORD,
    publicDir: path.join(__dirname, '..', 'public'),
    seedDemo: process.env.SEED !== '0',
  });
  return handler(req, res);
};
