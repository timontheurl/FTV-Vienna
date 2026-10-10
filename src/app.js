'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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

function createApp({ db, adminPassword, publicDir }) {
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

  const eventRow = (e) => {
    const regs = db.prepare('SELECT name, category FROM registrations WHERE event_id = ? ORDER BY id').all(e.id);
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

  const getEvent = (id) => {
    const e = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!e) throw new HttpError(404, 'Termin nicht gefunden.');
    return e;
  };

  route('GET', '/api/events', ({ query }) => {
    const where = [];
    const args = [];
    if (query.type) { where.push('type = ?'); args.push(query.type); }
    if (query.when === 'upcoming') { where.push("datetime(starts_at, '+' || duration || ' minutes') >= datetime(?)"); args.push(nowLocalIso()); }
    if (query.when === 'past') { where.push('starts_at < ?'); args.push(nowLocalIso()); }
    const order = query.when === 'past' ? 'DESC' : 'ASC';
    const limit = Math.min(Number(query.limit) || 100, 200);
    const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY starts_at ${order} LIMIT ${limit}`;
    return db.prepare(sql).all(...args).map(eventRow);
  });

  route('GET', '/api/events/:id', ({ params }) => eventRow(getEvent(params.id)));

  route('POST', '/api/events/:id/register', ({ params, body }) => {
    const e = getEvent(params.id);
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
      db.prepare('INSERT INTO registrations (event_id, name, email, category, note, cancel_code) VALUES (?, ?, ?, ?, ?, ?)')
        .run(e.id, name, mail, category, note, code);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Mit dieser E-Mail bist du für diesen Termin schon angemeldet.');
      throw err;
    }
    const position = db.prepare('SELECT COUNT(*) AS n FROM registrations WHERE event_id = ? AND id <= (SELECT id FROM registrations WHERE cancel_code = ?)').get(e.id, code).n;
    return { status: 201, body: { ok: true, cancelCode: code, waitlist: position > e.capacity, event: eventRow(e) } };
  });

  route('POST', '/api/registrations/cancel', ({ body }) => {
    const code = str(body.code, 'Stornocode', { max: 32 }).toLowerCase();
    const r = db.prepare('SELECT * FROM registrations WHERE cancel_code = ?').get(code);
    if (!r) throw new HttpError(404, 'Kein Eintrag mit diesem Stornocode gefunden.');
    db.prepare('DELETE FROM registrations WHERE id = ?').run(r.id);
    return { ok: true, event: eventRow(getEvent(r.event_id)) };
  });

  // ---- King/Queen of the Week: results + leaderboard ----

  route('GET', '/api/kotw/results', ({ query }) => {
    const limit = Math.min(Number(query.limit) || 20, 100);
    const events = db.prepare(`SELECT e.id, e.title, e.starts_at, e.location FROM events e
                               WHERE e.type = 'kotw' AND EXISTS (SELECT 1 FROM results r WHERE r.event_id = e.id)
                               ORDER BY e.starts_at DESC LIMIT ?`).all(limit);
    const res = db.prepare('SELECT category, player, placement FROM results WHERE event_id = ? ORDER BY placement');
    return events.map((e) => {
      const rows = res.all(e.id).map((r) => ({ ...r, points: pointsFor(r.placement) }));
      return { ...e, king: rows.filter((r) => r.category === 'king'), queen: rows.filter((r) => r.category === 'queen') };
    });
  });

  route('GET', '/api/leaderboard', ({ query }) => {
    const seasons = db.prepare(`SELECT DISTINCT substr(e.starts_at, 1, 4) AS y FROM results r JOIN events e ON e.id = r.event_id ORDER BY y DESC`)
      .all().map((r) => r.y);
    const season = /^\d{4}$/.test(query.season || '') ? query.season : seasons[0] || String(new Date().getFullYear());
    const rows = db.prepare(`SELECT r.category, r.player, r.placement, e.starts_at FROM results r JOIN events e ON e.id = r.event_id
                             WHERE substr(e.starts_at, 1, 4) = ? ORDER BY e.starts_at`).all(season);
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

  route('GET', '/api/tournaments', () => db.prepare('SELECT * FROM tournaments ORDER BY starts_on').all());

  route('GET', '/api/posts', ({ query }) => {
    const limit = Math.min(Number(query.limit) || 50, 100);
    return db.prepare('SELECT id, title, excerpt, tag, published_at FROM posts ORDER BY published_at DESC LIMIT ?').all(limit);
  });

  route('GET', '/api/posts/:id', ({ params }) => {
    const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(params.id);
    if (!p) throw new HttpError(404, 'Beitrag nicht gefunden.');
    return p;
  });

  route('POST', '/api/messages', ({ body }) => {
    if (body.website) return { status: 201, body: { ok: true } }; // honeypot
    db.prepare('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)').run(
      str(body.name, 'Name', { max: 80 }), email(body.email),
      str(body.subject, 'Betreff', { max: 150, required: false }), str(body.message, 'Nachricht', { max: 4000 }));
    return { status: 201, body: { ok: true } };
  });

  // ---- Admin ----

  route('GET', '/api/admin/check', () => ({ ok: true }), { admin: true });

  const eventFields = (b) => {
    if (b.type !== 'training' && b.type !== 'kotw') throw new HttpError(400, 'Typ muss "training" oder "kotw" sein.');
    return [b.type, str(b.title, 'Titel', { max: 120 }), datetime(b.starts_at, 'Beginn'), int(b.duration ?? 120, 'Dauer', { min: 15, max: 1440 }),
      str(b.location, 'Ort', { max: 200 }), str(b.level || 'Alle Level', 'Level', { max: 60 }), int(b.capacity ?? 16, 'Plätze', { min: 1, max: 500 }),
      str(b.description, 'Beschreibung', { max: 2000, required: false })];
  };

  route('POST', '/api/admin/events', ({ body }) => {
    const repeat = int(body.repeat_weeks ?? 1, 'Wiederholungen', { min: 1, max: 26 });
    const f = eventFields(body);
    const ins = db.prepare('INSERT INTO events (type, title, starts_at, duration, location, level, capacity, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const ids = [];
    for (let w = 0; w < repeat; w++) {
      const d = new Date(f[2] + ':00Z');
      d.setUTCDate(d.getUTCDate() + 7 * w);
      ids.push(Number(ins.run(f[0], f[1], d.toISOString().slice(0, 16), ...f.slice(3)).lastInsertRowid));
    }
    return { status: 201, body: { ok: true, ids } };
  }, { admin: true });

  route('PUT', '/api/admin/events/:id', ({ params, body }) => {
    getEvent(params.id);
    db.prepare('UPDATE events SET type=?, title=?, starts_at=?, duration=?, location=?, level=?, capacity=?, description=? WHERE id=?')
      .run(...eventFields(body), params.id);
    return { ok: true };
  }, { admin: true });

  route('DELETE', '/api/admin/events/:id', ({ params }) => {
    getEvent(params.id);
    db.prepare('DELETE FROM events WHERE id = ?').run(params.id);
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/admin/events/:id/registrations', ({ params }) => {
    const e = getEvent(params.id);
    return db.prepare('SELECT id, name, email, category, note, created_at FROM registrations WHERE event_id = ? ORDER BY id').all(e.id)
      .map((r, i) => ({ ...r, waitlist: i >= e.capacity }));
  }, { admin: true });

  route('DELETE', '/api/admin/registrations/:id', ({ params }) => {
    db.prepare('DELETE FROM registrations WHERE id = ?').run(params.id);
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/admin/events/:id/results', ({ params }) => {
    getEvent(params.id);
    const rows = db.prepare('SELECT category, player FROM results WHERE event_id = ? ORDER BY placement').all(params.id);
    return { king: rows.filter((r) => r.category === 'king').map((r) => r.player), queen: rows.filter((r) => r.category === 'queen').map((r) => r.player) };
  }, { admin: true });

  // Body: { king: ["1st", "2nd", ...], queen: [...] } — order defines placement.
  route('PUT', '/api/admin/events/:id/results', ({ params, body }) => {
    const e = getEvent(params.id);
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
    const ins = db.prepare('INSERT INTO results (event_id, category, player, placement) VALUES (?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM results WHERE event_id = ?').run(e.id);
      king.forEach((n, i) => ins.run(e.id, 'king', n, i + 1));
      queen.forEach((n, i) => ins.run(e.id, 'queen', n, i + 1));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true };
  }, { admin: true });

  const tournamentFields = (b) => [str(b.name, 'Name', { max: 150 }), date(b.starts_on, 'Datum'), date(b.ends_on, 'Enddatum', false),
    str(b.location, 'Ort', { max: 200 }), str(b.description, 'Beschreibung', { max: 3000, required: false }), url(b.link)];

  route('POST', '/api/admin/tournaments', ({ body }) => {
    const r = db.prepare('INSERT INTO tournaments (name, starts_on, ends_on, location, description, link) VALUES (?, ?, ?, ?, ?, ?)').run(...tournamentFields(body));
    return { status: 201, body: { ok: true, id: Number(r.lastInsertRowid) } };
  }, { admin: true });

  route('PUT', '/api/admin/tournaments/:id', ({ params, body }) => {
    db.prepare('UPDATE tournaments SET name=?, starts_on=?, ends_on=?, location=?, description=?, link=? WHERE id=?').run(...tournamentFields(body), params.id);
    return { ok: true };
  }, { admin: true });

  route('DELETE', '/api/admin/tournaments/:id', ({ params }) => {
    db.prepare('DELETE FROM tournaments WHERE id = ?').run(params.id);
    return { ok: true };
  }, { admin: true });

  const postFields = (b) => [str(b.title, 'Titel', { max: 150 }), str(b.excerpt, 'Kurzbeschreibung', { max: 300, required: false }),
    str(b.body, 'Text', { max: 20000 }), str(b.tag || 'News', 'Kategorie', { max: 40 })];

  route('POST', '/api/admin/posts', ({ body }) => {
    const r = db.prepare('INSERT INTO posts (title, excerpt, body, tag) VALUES (?, ?, ?, ?)').run(...postFields(body));
    return { status: 201, body: { ok: true, id: Number(r.lastInsertRowid) } };
  }, { admin: true });

  route('PUT', '/api/admin/posts/:id', ({ params, body }) => {
    db.prepare('UPDATE posts SET title=?, excerpt=?, body=?, tag=? WHERE id=?').run(...postFields(body), params.id);
    return { ok: true };
  }, { admin: true });

  route('DELETE', '/api/admin/posts/:id', ({ params }) => {
    db.prepare('DELETE FROM posts WHERE id = ?').run(params.id);
    return { ok: true };
  }, { admin: true });

  route('GET', '/api/admin/messages', () => db.prepare('SELECT * FROM messages ORDER BY created_at DESC, id DESC').all(), { admin: true });

  route('DELETE', '/api/admin/messages/:id', ({ params }) => {
    db.prepare('DELETE FROM messages WHERE id = ?').run(params.id);
    return { ok: true };
  }, { admin: true });

  // ---- HTTP plumbing ----

  const send = (res, status, payload, headers = {}) => {
    const body = typeof payload === 'string' || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(body);
  };

  const readBody = (req) => new Promise((resolve, reject) => {
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
      const r = routes.find((x) => x.method === req.method && x.re.test(u.pathname));
      if (!r) throw new HttpError(404, 'Unbekannter Endpunkt.');
      if (r.admin && !isAdmin(req)) throw new HttpError(401, 'Admin-Passwort falsch oder fehlt.');
      const m = u.pathname.match(r.re);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'POST' || req.method === 'PUT' ? await readBody(req) : {};
      const out = r.handler({ params, query: Object.fromEntries(u.searchParams), body: body && typeof body === 'object' ? body : {}, req });
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
