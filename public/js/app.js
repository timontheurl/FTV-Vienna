/* Shared layout + helpers for all pages. Requires js/config.js loaded first. */
(function () {
  'use strict';
  const C = window.FTV;

  const ICONS = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    level: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 19V13M12 19V8M19 19V4"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.9.7 3 2.4 3.5 5.2"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7z"/></svg>',
    whistle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="14" r="6"/><path d="M13 9.5 21 6v4l-6 2.5"/><circle cx="9" cy="14" r="1.5" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 8h3V4h-3c-2.8 0-4.5 1.9-4.5 4.6V11H7v4h2.5v7h4v-7h3l.5-4h-3.5V8.8c0-.5.3-.8.5-.8z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.3L4 20z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 21h8M9 17h6"/></svg>',
  };

  const NAV = [
    ['/', 'Start'],
    ['/trainings', 'Trainings'],
    ['/king-queen', 'King & Queen'],
    ['/rangliste', 'Rangliste'],
    ['/turniere', 'Turniere'],
    ['/blog', 'Blog'],
    ['/kontakt', 'Kontakt'],
  ];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function currentPath() {
    let p = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
    if (p === '/beitrag') p = '/blog';
    return p || '/';
  }

  function header() {
    const here = currentPath();
    const links = NAV.map(([href, label]) => `<a href="${href}"${href === here ? ' class="active" aria-current="page"' : ''}>${label}</a>`).join('');
    return `
      <div class="wrap">
        <a class="brand" href="/" aria-label="${esc(C.name)} Startseite">
          <img src="/img/logo.svg" alt="" width="42" height="42">
          <span class="brand-text"><strong>${esc(C.name)}</strong><small>${esc(C.longName)}</small></span>
        </a>
        <button class="nav-toggle" aria-label="Menü öffnen" aria-expanded="false">${ICONS.menu}</button>
        <nav class="nav" id="nav">${links}<a class="btn btn--sm" href="/trainings">Training buchen</a></nav>
      </div>`;
  }

  function socialLinks() {
    const out = [];
    const ig = C.instagram || C.instagramAustria;
    if (ig) out.push(`<a href="${esc(ig)}" target="_blank" rel="noopener" aria-label="Instagram">${ICONS.instagram}</a>`);
    if (C.federation.facebook) out.push(`<a href="${esc(C.federation.facebook)}" target="_blank" rel="noopener" aria-label="Facebook Footvolley Austria">${ICONS.facebook}</a>`);
    if (C.email) out.push(`<a href="mailto:${esc(C.email)}" aria-label="E-Mail">${ICONS.mail}</a>`);
    if (C.whatsapp) out.push(`<a href="${esc(C.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${ICONS.chat}</a>`);
    return out.join('');
  }

  function footer() {
    const year = new Date().getFullYear();
    return `
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <a class="brand" href="/"><img src="/img/logo.svg" alt="" width="42" height="42"><span class="brand-text"><strong>${esc(C.name)}</strong><small>${esc(C.longName)}</small></span></a>
            <p class="muted" style="margin-top:14px;max-width:360px">${esc(C.tagline)}</p>
            <div class="socials">${socialLinks()}</div>
          </div>
          <div>
            <h4>Verein</h4>
            <ul>${NAV.slice(1).map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join('')}</ul>
          </div>
          <div>
            <h4>Verband</h4>
            <ul>
              <li><a href="${esc(C.federation.website)}" target="_blank" rel="noopener">${esc(C.federation.name)}</a></li>
              <li><a href="${esc(C.federation.facebook)}" target="_blank" rel="noopener">Facebook</a></li>
              <li><a href="${esc(C.federation.instagram)}" target="_blank" rel="noopener">Instagram Community</a></li>
              <li><a href="/admin">Admin-Bereich</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${year} ${esc(C.name)} · ${esc(C.longName)}</span>
          <span>Mitglied der Footvolley-Familie Österreich 🇦🇹</span>
        </div>
      </div>`;
  }

  // ---------- API ----------
  async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Fehler ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- Formatting ----------
  const parseLocal = (iso) => {
    const [d, t = '00:00'] = iso.split('T');
    const [y, m, day] = d.split('-').map(Number);
    const [hh, mm] = t.split(':').map(Number);
    return new Date(y, m - 1, day, hh, mm);
  };
  const fmt = {
    dow: (iso) => parseLocal(iso).toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', ''),
    day: (iso) => parseLocal(iso).getDate(),
    mon: (iso) => parseLocal(iso).toLocaleDateString('de-AT', { month: 'short' }).replace('.', ''),
    year: (iso) => parseLocal(iso).getFullYear(),
    long: (iso) => parseLocal(iso).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    date: (iso) => parseLocal(iso).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' }),
    time: (iso) => parseLocal(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }),
    timeRange: (iso, minutes) => {
      const s = parseLocal(iso);
      const e = new Date(s.getTime() + minutes * 60000);
      const t = (d) => d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
      return `${t(s)} – ${t(e)}`;
    },
  };

  function spotsBadge(e) {
    if (e.spotsLeft === 0) return `<span class="spots spots--full">Voll${e.waitlist ? ` · ${e.waitlist} Warteliste` : ' · Warteliste'}</span>`;
    const cls = e.spotsLeft <= 3 ? 'spots spots--low' : 'spots';
    return `<span class="${cls}">${e.spotsLeft} ${e.spotsLeft === 1 ? 'Platz' : 'Plätze'} frei</span>`;
  }

  function dateBadge(iso) {
    return `<div class="date-badge"><span class="dow">${fmt.dow(iso)}</span><span class="day">${fmt.day(iso)}</span><span class="mon">${fmt.mon(iso)}</span></div>`;
  }

  function eventItem(e) {
    return `
      <div class="event ${e.type === 'kotw' ? 'event--kotw' : ''}">
        ${dateBadge(e.starts_at)}
        <div>
          <div class="event-title">${esc(e.title)}</div>
          <div class="event-meta">
            <span>${ICONS.clock}${fmt.timeRange(e.starts_at, e.duration)}</span>
            <span>${ICONS.level}${esc(e.level)}</span>
          </div>
        </div>
        <div class="event-side">
          ${spotsBadge(e)}
          <button class="btn btn--sm ${e.type === 'kotw' ? 'btn--sand' : ''}" data-register="${e.id}">${e.spotsLeft ? 'Anmelden' : 'Warteliste'}</button>
        </div>
      </div>`;
  }

  // ---------- Registration modal ----------
  const eventCache = new Map();
  function remember(events) { events.forEach((e) => eventCache.set(String(e.id), e)); return events; }

  function ensureModal() {
    let m = document.getElementById('register-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'register-modal';
    m.className = 'modal-backdrop';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="modal"></div>';
    m.addEventListener('click', (ev) => { if (ev.target === m || ev.target.closest('.modal-close')) closeModal(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeModal(); });
    document.body.appendChild(m);
    return m;
  }
  function closeModal() {
    const m = document.getElementById('register-modal');
    if (m) m.classList.remove('open');
  }

  const saved = (() => { try { return JSON.parse(localStorage.getItem('ftv-me') || '{}'); } catch { return {}; } })();

  function openRegister(id, onDone) {
    const e = eventCache.get(String(id));
    if (!e) return;
    const m = ensureModal();
    const kotw = e.type === 'kotw';
    m.querySelector('.modal').innerHTML = `
      <div class="modal-head">
        <div><span class="eyebrow">${kotw ? 'King & Queen of the Week' : 'Training'}</span><h3>${e.spotsLeft ? 'Anmeldung' : 'Warteliste'}</h3></div>
        <button class="modal-close" aria-label="Schließen">×</button>
      </div>
      <div class="modal-event">
        <strong>${esc(e.title)}</strong>
        ${fmt.long(e.starts_at)} · ${fmt.timeRange(e.starts_at, e.duration)}<br>${esc(e.location)}
      </div>
      <form class="form" novalidate>
        ${kotw ? `<div class="choice" role="radiogroup" aria-label="Kategorie">
            <label><input type="radio" name="category" value="king" required><span>👑 King</span></label>
            <label><input type="radio" name="category" value="queen"><span>👸 Queen</span></label>
          </div>` : ''}
        <label>Name (wird in der Teilnehmerliste angezeigt)<input name="name" required maxlength="60" autocomplete="name" placeholder="z. B. Alex M." value="${esc(saved.name || '')}"></label>
        <label>E-Mail (nur für das Trainerteam sichtbar)<input name="email" type="email" required maxlength="200" autocomplete="email" placeholder="du@example.com" value="${esc(saved.email || '')}"></label>
        <label>Notiz (optional)<input name="note" maxlength="300" placeholder="z. B. komme 15 min später"></label>
        ${e.spotsLeft ? '' : '<div class="alert alert--info">Der Termin ist voll – du kommst auf die Warteliste und rückst automatisch nach, wenn jemand absagt.</div>'}
        <div class="form-msg"></div>
        <button class="btn" type="submit">${e.spotsLeft ? 'Verbindlich anmelden' : 'Auf die Warteliste'}</button>
      </form>`;
    const form = m.querySelector('form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = Object.fromEntries(new FormData(form));
      const msg = form.querySelector('.form-msg');
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await api(`/api/events/${e.id}/register`, { method: 'POST', body: fd });
        try { localStorage.setItem('ftv-me', JSON.stringify({ name: fd.name, email: fd.email })); } catch { /* ignore */ }
        m.querySelector('.modal').innerHTML = `
          <div class="modal-head"><div><span class="eyebrow">${r.waitlist ? 'Warteliste' : 'Bestätigt'}</span><h3>${r.waitlist ? 'Du stehst auf der Warteliste' : 'Du bist dabei! 🙌'}</h3></div><button class="modal-close" aria-label="Schließen">×</button></div>
          <div class="modal-event"><strong>${esc(e.title)}</strong>${fmt.long(e.starts_at)} · ${fmt.timeRange(e.starts_at, e.duration)}<br>${esc(e.location)}</div>
          <p>Dein Stornocode: <span class="code">${esc(r.cancelCode)}</span></p>
          <p class="muted">Notier ihn dir (Screenshot!). Falls du doch nicht kannst, sag damit auf der <a href="/trainings#absagen">Trainings-Seite</a> ab – so rückt jemand von der Warteliste nach.</p>
          <button class="btn btn--sand modal-close" style="width:auto;height:auto;border-radius:999px;font-size:.95rem">Alles klar</button>`;
        eventCache.set(String(e.id), r.event);
        if (onDone) onDone(r.event);
      } catch (err) {
        msg.innerHTML = `<div class="alert alert--err">${esc(err.message)}</div>`;
        btn.disabled = false;
      }
    });
    m.classList.add('open');
    setTimeout(() => form.querySelector('input:not([type=radio])')?.focus(), 50);
  }

  function bindRegisterButtons(root, onDone) {
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-register]');
      if (b) openRegister(b.dataset.register, onDone);
    });
  }

  function skeleton(n = 3) { return Array.from({ length: n }, () => '<div class="skeleton"></div>').join(''); }

  // ---------- Boot ----------
  function boot() {
    const h = document.querySelector('header.site-header');
    if (h) h.innerHTML = header();
    const f = document.querySelector('footer.site-footer');
    if (f) f.innerHTML = footer();
    const toggle = document.querySelector('.nav-toggle');
    if (toggle) toggle.addEventListener('click', () => {
      const nav = document.getElementById('nav');
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  boot();

  window.FTVApp = { api, esc, fmt, ICONS, eventItem, dateBadge, spotsBadge, remember, openRegister, bindRegisterButtons, skeleton, parseLocal };
})();
