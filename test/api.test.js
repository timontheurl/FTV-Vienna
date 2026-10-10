'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const { open, seed } = require('../src/db');
const { createApp } = require('../src/app');

async function start() {
  const db = open(':memory:');
  seed(db);
  const app = createApp({ db, adminPassword: 'secret', publicDir: path.join(__dirname, '..', 'public') });
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, admin) => {
    const res = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(admin ? { 'X-Admin-Key': 'secret' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  return { server, call, base };
}

test('registration, waitlist and cancellation', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());

  const created = await call('POST', '/api/admin/events', {
    type: 'training', title: 'Test', starts_at: '2099-01-01T18:00', duration: 90, location: 'Sand', capacity: 1,
  }, true);
  assert.strictEqual(created.status, 201);
  const id = created.body.ids[0];

  const a = await call('POST', `/api/events/${id}/register`, { name: 'Anna', email: 'anna@example.com' });
  assert.strictEqual(a.status, 201);
  assert.strictEqual(a.body.waitlist, false);

  const dup = await call('POST', `/api/events/${id}/register`, { name: 'Anna', email: 'ANNA@example.com' });
  assert.strictEqual(dup.status, 409);

  const b = await call('POST', `/api/events/${id}/register`, { name: 'Ben', email: 'ben@example.com' });
  assert.strictEqual(b.body.waitlist, true);

  let ev = await call('GET', `/api/events/${id}`);
  assert.deepStrictEqual([ev.body.registered, ev.body.waitlist, ev.body.spotsLeft], [1, 1, 0]);
  assert.strictEqual(ev.body.participants[0].email, undefined, 'emails must not be public');

  await call('POST', '/api/registrations/cancel', { code: a.body.cancelCode });
  ev = await call('GET', `/api/events/${id}`);
  assert.deepStrictEqual(ev.body.participants.map((p) => p.name), ['Ben'], 'waitlisted person moves up');

  const bad = await call('POST', `/api/events/${id}/register`, { name: 'X', email: 'nope' });
  assert.strictEqual(bad.status, 400);
});

test('kotw requires category and results feed the leaderboard', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());

  const { body } = await call('POST', '/api/admin/events', {
    type: 'kotw', title: 'Sunday', starts_at: '2031-06-01T14:00', location: 'Sand', capacity: 10,
  }, true);
  const id = body.ids[0];
  const noCat = await call('POST', `/api/events/${id}/register`, { name: 'Kim', email: 'kim@example.com' });
  assert.strictEqual(noCat.status, 400);

  const saved = await call('PUT', `/api/admin/events/${id}/results`, { king: ['Max', 'Leo', 'Tom'], queen: ['Eva'] }, true);
  assert.strictEqual(saved.status, 200);
  const dupe = await call('PUT', `/api/admin/events/${id}/results`, { king: ['Max', 'max'] }, true);
  assert.strictEqual(dupe.status, 400);

  const lb = await call('GET', '/api/leaderboard?season=2031');
  assert.strictEqual(lb.body.season, '2031');
  assert.deepStrictEqual(lb.body.king.map((p) => [p.player, p.points, p.rank]), [['Max', 10, 1], ['Leo', 8, 2], ['Tom', 6, 3]]);
  assert.strictEqual(lb.body.queen[0].wins, 1);
  assert.ok(lb.body.seasons.includes('2031'));
});

test('admin endpoints require the password', async (t) => {
  const { server, call } = await start();
  t.after(() => server.close());
  assert.strictEqual((await call('GET', '/api/admin/messages')).status, 401);
  assert.strictEqual((await call('POST', '/api/admin/posts', { title: 'x', body: 'y' })).status, 401);
  const p = await call('POST', '/api/admin/posts', { title: 'Hallo', body: 'Text' }, true);
  assert.strictEqual(p.status, 201);
  assert.strictEqual((await call('GET', `/api/posts/${p.body.id}`)).body.title, 'Hallo');
});

test('static pages and pretty URLs', async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  for (const p of ['/', '/trainings', '/king-queen', '/rangliste', '/turniere', '/blog', '/kontakt', '/admin', '/css/style.css']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
  }
  assert.strictEqual((await fetch(base + '/gibts-nicht')).status, 404);
  assert.notStrictEqual((await fetch(base + '/..%2fpackage.json')).status, 200);
});
