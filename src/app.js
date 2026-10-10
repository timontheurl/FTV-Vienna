'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { seed } = require('./db');

// Event times are stored as Vienna wall-clock time (see src/db.js).
process.env.TZ = process.env.APP_TZ || 'Europe/Vienna';

// Points per placement for King/Queen of the Week. Index 0 = 1st place.
// Everyone who played but placed lower than the table still gets PARTICIPATION_POINTS.
const POINTS = [10, 8, 6, 5, 4, 3, 2];
const PARTICIPATION_POINTS = 1;

function pointsFor(placement) {
  return POINTS[placement - 1] ?? PARTICIPATION_POINTS;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// --- Validation helpers -----------------------------------------------------

function str(v, field, { max = 200, required = true } = {}) {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `Feld "${field}" fehlt.`);
  if (s.length > max) throw new HttpError(400, `Feld "${field}" ist zu lang (max. ${max} Zeichen).`);
  return s;
}

function email(v) {
  const s = str(v, 'E-Mail', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Bitte gib eine gültige E-Mail-Adresse an.');
  return s;
}

function int(v, field, { min = 0, max = 100000 } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Feld "${field}" ist ungültig.`);
  return n;
}

function datetime(v, field) {
  const s = str(v, field, { max: 16 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw new HttpError(400, `Feld "${field}" braucht das Format JJJJ-MM-TTTHH:MM.`);
  return s;
}

function date(v, field, required = true) {
  const s = str(v, field, { max: 10, required });
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `Feld "${field}" braucht das Format JJJJ-MM-TT.`);
  return s || null;
}

function url(v) {
  const s = str(v, 'Link', { max: 500, required: false });
  if (s && !/^https?:\/\//i.test(s)) throw new HttpError(400, 'Links müssen mit http:// oder https:// beginnen.');
  return s;
}

function nowLocalIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// --- App --------------------------------------------------------------------

function createApp({ db, adminPassword, publicDir, seedDemo = true }) {
  // Schema + demo content are set up lazily on the first request, which also
  // works for serverless cold starts. A failed attempt is retried next time.
  let ready = null;
  const ensureReady = () => (ready ??= (async () => {
    await db.migrate();
    if (seedDemo && (await seed(db))) console.log('Demo-Inhalte angelegt.');
  })().catch((err) => { ready = null; throw err; }));

  const routes = [];
  const route = (method, pattern, handler, { admin = false } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ method, re, keys, handler, admin });
  };

  const adminKey = Buffer.from(adminPassword);
  const isAdmin = (req) => {
    const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
    return given.length === adminKey.length && crypto.timingSafeEqual(given, adminKey);
  };

  // ---- Events (trainings + King/Queen Sundays) ----

  // Adds capacity info to events. One query for all registrations keeps
  // round trips to the (remote) database low.
  const withRegistrations = async (events) => {
    if (!events.length) return [];
    const ids = events.map((e) => e.id);
    const regs = await db.all(`SELECT event_id, name, category FROM registrations WHERE event_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
    return events.map((e) => eventRow(e, regs.filter((r) => r.event_id === e.id)));
  };

  const eventRow = (e, regs) => {
    const confirmed = regs.slice(0, e.capacity);
    return {
      ...e,
      registered: confirmed.length,
      waitlist: Math.max(0, regs.length - e.capacity),
      spotsLeft: Math.max(0, e.capacity - regs.length),
      // Only first names / initials are public.
      participants: confirmed.map((r) => ({ name: r.name, category: r.category })),
    };
  };

  const getEvent = async (id) => {
    const e = await db.get('SELECT * FROM events WHERE id = ?', id);
    if (!e) throw new HttpError(404, 'Termin nicht gefunden.');
    return e;
  };

  const eventWithRegistrations = async (id) => (await withRegistrations([await getEvent(id)]))[0];

  route('GET', '/api/events', async ({ query }) => {
    const where = [];
    const args = [];
    if (query.type) { where.push('type = ?'); args.push(query.type); }
    if (query.when === 'upcoming') { where.push("datetime(starts_at, '+' || duration || ' minutes') >= datetime(?)"); args.push(nowLocalIso()); }
    if (query.when === 'past') { where.push('starts_at < ?'); args.push(nowLocalIso()); }
    const order = query.when === 'past' ? 'DESC' : 'ASC';
    const limit = Math.min(Number(query.limit) || 100, 200);
    const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY starts_at ${order} LIMIT ${limit}`;
    return withRegistrations(await db.all(sql, ...args));
  });

  route('GET', '/api/events/:id', async ({ params }) => eventWithRegistrations(params.id));

  route('POST', '/api/events/:id/register', async ({ params, body }) => {
    const e = await getEvent(params.id);
    if (e.starts_at < nowLocalIso()) throw new HttpError(400, 'Dieser Termin liegt in der Vergangenheit.');
    const name = str(body.name, 'Name', { max: 60 });
    const mail = email(body.email);
    const note = str(body.note, 'Notiz', { max: 300, required: false });
    let category = null;
    if (e.type === 'kotw') {
      category = body.category;
      if (category !== 'king' && category !== 'queen') throw new HttpError(400, 'Bitte wähle King oder Queen.');
    }
    const code = crypto.randomBytes(6).toString('hex');
    try {
      await db.run('INSERT INTO registrations (event_id, name, email, category, note, cancel_code) VALUES (?, ?, ?, ?, ?, ?)',
        e.id, name, mail, category, note, code);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Mit dieser E-Mail bist du für diesen Termin schon angemeldet.');
      throw err;
    }
    const { n: position } = await db.get('SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND id <= (SELECT id FROM registrations WHERE cancel_code = ?)', e.id, code);
    return { status: 201, body: { ok: true, cancelCode: code, waitlist: position > e.capacity, event: await eventWithRegistrations(e.id) } };
  });

  route('POST', '/api/registrations/cancel', async ({ body }) => {
    const code = str(body.code, 'Stornocode', { max: 32 }).toLowerCase();
    const r = await db.get('SELECT * FROM registrations WHERE cancel_code = ?', code);
    if (!r) throw new HttpError(404, 'Kein Eintrag mit diesem Stornocode gefunden.');
    await db.run('DELETE FROM registrations WHERE id = ?', r.id);
    return { ok: true, event: await eventWithRegistrations(r.event_id) };
  });

  // ---- King/Queen of the Week: results + leaderboard ----

  route('GET', '/api/kotw/results', async ({ query }) => {
    const limit = Math.min(Number(query.limit) || 20, 100);
    const events = await db.all(`SELECT e.id, e.title, e.starts_at, e.location FROM events e
                               WHERE e.type = 'kotw' AND EXISTS (SELECT 1 FROM results r WHERE r.event_id = e.id)
                               ORDER BY e.starts_at DESC LIMIT ?`, limit);
    if (!events.length) return [];
    const ids = events.map((e) => e.id);
    const all = await db.all(`SELECT event_id, category, player, placement FROM results WHERE event_id IN (${ids.map(() => '?').join(',')}) ORDER BY placement`, ...ids);
    return events.map((e) => {
      const rows = all.filter((r) => r.event_id === e.id).map(({ event_id, ...r }) => ({ ...r, points: pointsFor(r.placement) }));
      return { ...e, king: rows.filter((r) => r.category === 'king'), queen: rows.filter((r) => r.category === 'queen') };
    });
  });

  route('GET', '/api/leaderboard', async ({ query }) => {
    const seasons = (await db.all(`SELECT DISTINCT substr(e.starts_at, 1, 4) AS y FROM results r JOIN events e ON e.id = r.event_id ORDER BY y DESC`)).map((r) => r.y);
    const season = /^\d{4}$/.test(query.season || '') ? query.season : seasons[0] || String(new Date().getFullYear());
    const rows = await db.all(`SELECT r.category, r.player, r.placement, e.starts_at FROM results r JOIN events e ON e.id = r.event_id
                             WHERE substr(e.starts_at, 1, 4) = ? ORDER BY e.starts_at`, season);
    const table = (category) => {
      const by = new Map();
      for (const r of rows.filter((x) => x.category === category)) {
        const key = r.player.trim().toLowerCase();
        const p = by.get(key) || { player: r.player.trim(), points: 0, played: 0, wins: 0, podiums: 0, best: Infinity, last: [] };
        p.points += pointsFor(r.placement);
        p.played += 1;
        if (r.placement === 1) p.wins += 1;
        if (r.placement <= 3) p.podiums += 1;
        p.best = Math.min(p.best, r.placement);
        p.last.push(r.placement);
        by.set(key, p);
      }
      const list = [...by.values()].map((p) => ({ ...p, last: p.last.slice(-5), avg: +(p.points / p.played).toFixed(2) }));
      list.sort((a, b) => b.points - a.points || b.wins - a.wins || a.best - b.best || a.player.localeCompare(b.player, 'de'));
      let rank = 0;
      list.forEach((p, i) => {
        const prev = list[i - 1];
        if (!prev || prev.points !== p.points || prev.wins !== p.wins || prev.best !== p.best) rank = i + 1;
        p.rank = rank;
      });
      return list;
    };
    const sundays = new Set(rows.map((r) => r.starts_at)).size;
    return { season, seasons, sundays, points: POINTS, participationPoints: PARTICIPATION_POINTS, king: table('king'), queen: table('queen') };
  });

  // ---- Tournaments, posts, contact ----

  route('GET', '/api/tournaments', async () => await db.all('SELECT * FROM tournaments ORDER BY starts_on'));

  route('GET', '/api/posts', async ({ query }) => {
    const limit = Math.min(Number(query.limit) || 50, 100);
    return await db.all('SELECT id, title, excerpt, tag, published_at FROM posts ORDER BY published_at DESC LIMIT ?', limit);
  });

  route('GET', '/api/posts/:id', async ({ params }) => {
    const p = await db.get('SELECT * FROM posts WHERE id = ?', params.id);
    if (!p) throw new HttpError(404, 'Beitrag nicht gefunden.');
    return p;
  });

  route('POST', '/api/messages', async ({ body }) => {
    if (body.website) return { status: 201, body: { ok: true } }; // honeypot
    await db.run('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)', str(body.name, 'Name', { max: 80 }), email(body.email),
      str(body.subject, 'Betreff', { max: 150, required: false }), str(body.message, 'Nachricht', { max: 4000 }));
    return { status: 201, body: { ok: true } };
  });

  // ---- Admin ----

  route('GET', '/api/admin/check', async () => ({ ok: true }), { admin: true });

  const eventFields = (b) => {
    if (b.type !== 'training' && b.type !== 'kotw') throw new HttpError(400, 'Typ muss "training" oder "kotw" sein.');
    return [b.type, str(b.title, 'Titel', { max: 120 }), datetime(b.starts_at, 'Beginn'), int(b.duration ?? 120, 'Dauer', { min: 15, max: 1440 }),
      str(b.location, 'Ort', { max: 200 }), str(b.level || 'Alle Level', 'Level', { max: 60 }), int(b.capacity ?? 16, 'Plätze', { min: 1, max: 500 }),
      str(b.description, 'Beschreibung', { max: 2000, required: false })];
  };

  route('POST', '/api/admin/events', async ({ body }) => {
    const repeat = int(body.repeat_weeks ?? 1, 'Wiederholungen', { min: 1, max: 26 });
    const f = eventFields(body);
    const sql = 'INSERT INTO events (type, title, starts_at, duration, location, level, capacity, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    const stmts = [];
    for (let w = 0; w < repeat; w++) {
      const d = new Date(f[2] + ':00Z');
      d.setUTCDate(d.getUTCDate() + 7 * w);
      stmts.push([sql, [f[0], f[1], d.toISOString().slice(0, 16), ...f.slice(3)]]);
    }
    const ids = (await db.batch(stmts)).map((r) => Number(r.lastInsertRowid));
    return { status: 201, body: { ok: true, ids } };
  }, { admin: true });

  route('PUT', '/api/admin/events/:id', async ({ params, body }) => {
    await getEvent(params.id);
    await db.run('UPDATE events SET type=?, title=?, starts_at=?, duration=?, location=?, level=?, capacity=?, description=? WHERE id=?', ...eventFields(body), params.id);
    return { ok: true };
  }, { admin: true });

  route('DELETE', '/api/admin/events/:id', async ({ params }) => {
    await getEvent(params.id);
    await db.batch([
      ['DELETE FROM registrations WHERE event_id = ?', [params.id]],
      ['DELETE FROM results WHERE event_id = ?', [params.id]],
      ['DELETE FROM events WHERE id = ?', [params.id]],
    ]);
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/admin/events/:id/registrations', async ({ params }) => {
    const e = await getEvent(params.id);
    return await db.all('SELECT id, name, email, category, note, created_at FROM registrations WHERE event_id = ? ORDER BY id', e.id)
      .map((r, i) => ({ ...r, waitlist: i >= e.capacity }));
  }, { admin: true });

  route('DELETE', '/api/admin/registrations/:id', async ({ params }) => {
    await db.run('DELETE FROM registrations WHERE id = ?', params.id);
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/admin/events/:id/results', async ({ params }) => {
    await getEvent(params.id);
    const rows = await db.all('SELECT category, player FROM results WHERE event_id = ? ORDER BY placement', params.id);
    return { king: rows.filter((r) => r.category === 'king').map((r) => r.player), queen: rows.filter((r) => r.category === 'queen').map((r) => r.player) };
  }, { admin: true });

  // Body: { king: ["1st", "2nd", ...], queen: [...] } — order defines placement.
  route('PUT', '/api/admin/events/:id/results', async ({ params, body }) => {
    const e = await getEvent(params.id);
    if (e.type !== 'kotw') throw new HttpError(400, 'Ergebnisse gibt es nur für King/Queen-Termine.');
    const clean = (list, label) => {
      if (!Array.isArray(list)) return [];
      const names = list.map((n) => str(n, label, { max: 60, required: false })).filter(Boolean);
      const seen = new Set();
      for (const n of names) {
        const k = n.toLowerCase();
        if (seen.has(k)) throw new HttpError(400, `"${n}" steht doppelt in der ${label}-Liste.`);
        seen.add(k);
      }
      return names;
    };
    const king = clean(body.king, 'King');
    const queen = clean(body.queen, 'Queen');
    const ins = 'INSERT INTO results (event_id, category, player, placement) VALUES (?, ?, ?, ?)';
    await db.batch([
      ['DELETE FROM results WHERE event_id = ?', [e.id]],
      ...king.map((n, i) => [ins, [e.id, 'king', n, i + 1]]),
      ...queen.map((n, i) => [ins, [e.id, 'queen', n, i + 1]]),
    ]);
    return { ok: true };
  }, { admin: true });

  const tournamentFields = (b) => [str(b.name, 'Name', { max: 150 }), date(b.starts_on, 'Datum'), date(b.ends_on, 'Enddatum', false),
    str(b.location, 'Ort', { max: 200 }), str(b.description, 'Beschreibung', { max: 3000, required: false }), url(b.link)];

  route('POST', '/api/admin/tournaments', async ({ body }) => {
    const r = await db.run('INSERT INTO tournaments (name, starts_on, ends_on, location, description, link) VALUES (?, ?, ?, ?, ?, ?)', ...tournamentFields(body));
    return { status: 201, body: { ok: true, id: Number(r.lastInsertRowid) } };
  }, { admin: true });

  route('PUT', '/api/admin/tournaments/:id', async ({ params, body }) => {
    await db.run('UPDATE tournaments SET name=?, starts_on=?, ends_on=?, location=?, description=?, link=? WHERE id=?', ...tournamentFields(body), params.id);
    return { ok: true };
  }, { admin: true });

  route('DELETE', '/api/admin/tournaments/:id', async ({ params }) => {
    await db.run('DELETE FROM tournaments WHERE id = ?', params.id);
    return { ok: true };
  }, { admin: true });

  const postFields = (b) => [str(b.title, 'Titel', { max: 150 }), str(b.excerpt, 'Kurzbeschreibung', { max: 300, required: false }),
    str(b.body, 'Text', { max: 20000 }), str(b.tag || 'News', 'Kategorie', { max: 40 })];

  route('POST', '/api/admin/posts', async ({ body }) => {
    const r = await db.run('INSERT INTO posts (title, excerpt, body, tag) VALUES (?, ?, ?, ?)', ...postFields(body));
    return { status: 201, body: { ok: true, id: Number(r.lastInsertRowid) } };
  }, { admin: true });

  route('PUT', '/api/admin/posts/:id', async ({ params, body }) => {
    await db.run('UPDATE posts SET title=?, excerpt=?, body=?, tag=? WHERE id=?', ...postFields(body), params.id);
    return { ok: true };
  }, { admin: true });

  route('DELETE', '/api/admin/posts/:id', async ({ params }) => {
    await db.run('DELETE FROM posts WHERE id = ?', params.id);
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/admin/messages', async () => await db.all('SELECT * FROM messages ORDER BY created_at DESC, id DESC'), { admin: true });

  route('DELETE', '/api/admin/messages/:id', async ({ params }) => {
    await db.run('DELETE FROM messages WHERE id = ?', params.id);
    return { ok: true };
  }, { admin: true });

  // ---- HTTP plumbing ----

  const send = (res, status, payload, headers = {}) => {
    const body = typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    // On Vercel the runtime has already parsed the body.
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        try { return resolve(req.body ? JSON.parse(req.body) : {}); } catch { return reject(new HttpError(400, 'Ungültiges JSON.')); }
      }
      return resolve(Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8') || '{}') : req.body || {});
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 100_000) { reject(new HttpError(413, 'Anfrage zu groß.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Ungültiges JSON.')); }
    });
    req.on('error', reject);
  });

  const serveStatic = (req, res, pathname) => {
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    if (!path.extname(rel)) rel += '.html'; // pretty URLs: /trainings -> trainings.html
    const file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(publicDir + path.sep)) return send(res, 403, { error: 'Forbidden' });
    fs.readFile(file, (err, data) => {
      if (err) {
        return fs.readFile(path.join(publicDir, '404.html'), (e2, page) =>
          send(res, 404, e2 ? 'Not found' : page, { 'Content-Type': 'text/html; charset=utf-8' }));
      }
      const ext = path.extname(file);
      send(res, 200, req.method === 'HEAD' ? '' : data, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
    });
  };

  return async function handler(req, res) {
    const u = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!u.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, u.pathname);
    }
    try {
      await ensureReady();
      const r = routes.find((x) => x.method === req.method && x.re.test(u.pathname));
      if (!r) throw new HttpError(404, 'Unbekannter Endpunkt.');
      if (r.admin && !isAdmin(req)) throw new HttpError(401, 'Admin-Passwort falsch oder fehlt.');
      const m = u.pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
      const out = await r.handler({ params, query: Object.fromEntries(u.searchParams), body: body && typeof body === 'object' ? body : {}, req });
      if (out && out.status && out.body) return send(res, out.status, out.body);
      return send(res, 200, out);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      return send(res, status, { error: status === 500 ? 'Interner Fehler.' : err.message });
    }
  };
}

module.exports = { createApp, pointsFor, POINTS };
