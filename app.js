  /* app.js - Στρωμα παρουσιασης. Rendering, events, φορμες.
   Χρησιμοποιει το Logic για κανονες και το Store για δεδομενα. */

'use strict';

(() => {

  /* ---- Κατασταση εφαρμογης στη μνημη ---- */
  const state = {
    view: 'members',            /* ενεργη οψη: members | packages | appointments */
    calDate: null,              /* επιλεγμενη ημερα ημερολογιου 'YYYY-MM-DD' */
    calMode: 'day',             /* ημερολογιο: day | week */
    memberQuery: '',            /* φιλτρο αναζητησης μελων */
    members: [],
    packages: [],
    appointments: []
  };

  /* Συντομευσεις DOM */
  const $ = sel => document.querySelector(sel);
  const main = () => $('#main');

  /* Προστασια απο HTML injection στα δεδομενα χρηστη */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---- Μορφοποιηση ημερομηνιων για εμφανιση ---- */

  /* 'YYYY-MM-DD' -> 'DD/MM/YY' */
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }

  /* ISO datetime -> 'DD/MM HH:MM' */
  function fmtDateTime(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ISO datetime -> 'HH:MM' (για καρτες κατω απο κεφαλιδα ημερας) */
  function fmtTime(iso) {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* Ετικετα κεφαλιδας ημερας: "Σημερα/Αυριο" οπου ταιριαζει, αλλιως ημερα εβδομαδας */
  function dayLabel(key) {
    const names = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
    const wd = names[new Date(key + 'T00:00:00').getDay()];
    const today = todayISO();
    /* Υπολογισμος αυριανης ημερομηνιας */
    const t = new Date(today + 'T00:00:00');
    t.setDate(t.getDate() + 1);
    const pad = n => String(n).padStart(2, '0');
    const tomorrow = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
    if (key === today) return `Σήμερα · ${wd} ${fmtDate(key)}`;
    if (key === tomorrow) return `Αύριο · ${wd} ${fmtDate(key)}`;
    return `${wd} ${fmtDate(key)}`;
  }

  /* Σημερινη ημερομηνια ως 'YYYY-MM-DD' (τοπικη ωρα) */
  function todayISO() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* ---- Φορτωμα ολων των δεδομενων απο το Store στη μνημη ---- */
  async function loadAll() {
    state.members = await Store.getAll('members');
    state.packages = await Store.getAll('packages');
    state.appointments = await Store.getAll('appointments');
  }

  /* Επαναφορτωση και επανασχεδιαση μετα απο καθε αλλαγη */
  async function refresh() {
    await loadAll();
    render();
  }

  /* Ονομα μελους απο id */
  function memberName(id) {
    const m = state.members.find(m => m.id === id);
    return m ? m.name : '(άγνωστο μέλος)';
  }

  /* ---- Toasts: συντομη επιβεβαιωση ενεργειας ---- */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    /* Αυτοματη εξαφανιση */
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  /* ---- Δικο μας confirm (αντι για το native), ως Promise<boolean> ---- */
  function confirmSheet(message, confirmLabel) {
    return new Promise(resolve => {
      openSheet(`
        <h2>Επιβεβαίωση</h2>
        <p>${message}</p>
        <div class="form-actions">
          <button class="btn ghost" id="c-no">Άκυρο</button>
          <button class="btn danger-solid" id="c-yes">${confirmLabel || 'Διαγραφή'}</button>
        </div>`);
      $('#c-no').addEventListener('click', () => { closeSheet(); resolve(false); });
      $('#c-yes').addEventListener('click', () => { closeSheet(); resolve(true); });
    });
  }

  /* ---- Bottom sheet (φορμες) ---- */

  function openSheet(html) {
    $('#sheet-content').innerHTML = html;
    $('#sheet-overlay').classList.add('open');
  }

  function closeSheet() {
    $('#sheet-overlay').classList.remove('open');
    $('#sheet-content').innerHTML = '';
  }

  /* Εμφανιση σφαλματος μεσα στην ανοιχτη φορμα */
  function showFormError(msg) {
    const box = $('#sheet-content .form-error');
    if (box) { box.textContent = msg; box.hidden = false; }
  }

  /* ---- Rendering οψεων ---- */

  function render() {
    /* Badge απληρωτων πακετων στο tab */
    const unpaidCount = state.packages.filter(p => !p.paid).length;
    const badge = $('#unpaid-badge');
    if (badge) {
      badge.hidden = !unpaidCount;
      badge.textContent = unpaidCount;
    }
    /* Ενεργο tab */
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === state.view));
    /* Τιτλος οψης */
    const titles = { members: 'Μέλη', packages: 'Πακέτα', appointments: 'Ραντεβού' };
    $('#view-title').textContent = titles[state.view];
    /* Περιεχομενο */
    if (state.view === 'members') renderMembers();
    else if (state.view === 'packages') renderPackages();
    else renderAppointments();
  }

  /* Κουκιδες punch-card: γεμισμενες = καταναλωμενες, κενες = υπολοιπο.
     Οι απουσιες-με-χρεωση ξεχωριζουν με δικο τους χρωμα. */
  function punchDots(pkg) {
    /* Καταναλωμενα ραντεβου του πακετου, χρονολογικα */
    const consumed = Logic.sortAppointmentsChrono(
      state.appointments.filter(a => a.packageId === pkg.id && Logic.consumesSession(a.status))
    );
    let dots = '';
    for (const a of consumed.slice(0, pkg.sessions)) {
      dots += `<span class="dot ${a.status === 'charged_absence' ? 'absence' : 'used'}"></span>`;
    }
    const remaining = Math.max(0, pkg.sessions - consumed.length);
    for (let i = 0; i < remaining; i++) dots += '<span class="dot free"></span>';
    return `<span class="dots">${dots}</span>`;
  }

  /* -- Οψη: Μελη -- */
  function renderMembers() {
    if (!state.members.length) {
      main().innerHTML = emptyState('Κανένα μέλος ακόμα.', 'Πάτα + για να προσθέσεις το πρώτο μέλος.');
      return;
    }
    /* Φιλτραρισμα με την αναζητηση (ονομα η τηλεφωνο) */
    const q = (state.memberQuery || '').toLowerCase().trim();
    const sorted = [...state.members]
      .sort((a, b) => a.name.localeCompare(b.name, 'el'))
      .filter(m => !q || m.name.toLowerCase().includes(q) || (m.phone || '').includes(q));

    const search = `<input id="member-search" class="search" type="search"
      placeholder="Αναζήτηση μέλους" value="${esc(state.memberQuery)}">`;

    const today = todayISO();
    const cards = sorted.map(m => {
      const pkg = Logic.activePackage(m.id, state.packages, state.appointments);
      let stateClass, statusHTML;
      if (pkg) {
        const rem = Logic.packageRemaining(pkg, state.appointments);
        const du = Logic.daysUntil(pkg.endDate, today);
        stateClass = Logic.packageState(pkg, state.appointments); /* ok | low */
        statusHTML = `
          <div class="pkg-line">
            <span>${esc(pkg.tier)} ${pkg.sessions}</span>
            <span class="mono">απομένουν ${rem}</span>
            <span class="badge ${pkg.paid ? 'paid' : 'unpaid'}">${pkg.paid ? 'Πληρωμένο' : 'Απλήρωτο'}</span>
          </div>
          ${punchDots(pkg)}
          <div class="pkg-line">
            <span class="mono sub">έως ${fmtDate(pkg.endDate)}</span>
            ${du < 0 ? '<span class="chip expired">Έληξε χρονικά</span>'
              : du <= 7 ? `<span class="mono sub warn-text">λήγει σε ${du} ημ.</span>` : ''}
          </div>`;
      } else {
        /* Υπαρχουν πακετα αλλα ολα εξαντλημενα, η δεν υπαρχει κανενα */
        const had = state.packages.some(p => p.memberId === m.id);
        stateClass = had ? 'depleted' : 'none';
        statusHTML = `<div class="pkg-line muted">${had ? 'Πακέτο εξαντλημένο' : 'Χωρίς πακέτο'}</div>`;
      }
      return `
        <article class="card state-${stateClass}" data-id="${m.id}">
          <div class="card-head">
            <h3>${esc(m.name)}</h3>
            <div class="card-actions">
              <button class="icon-btn brand" data-act="book-member" data-id="${m.id}" aria-label="Νέο ραντεβού">+</button>
              <button class="icon-btn" data-act="edit-member" data-id="${m.id}" aria-label="Επεξεργασία">✎</button>
              <button class="icon-btn danger" data-act="del-member" data-id="${m.id}" aria-label="Διαγραφή">✕</button>
            </div>
          </div>
          ${statusHTML}
          ${m.phone ? `<div class="sub mono">${esc(m.phone)}</div>` : ''}
          ${m.notes ? `<div class="sub">${esc(m.notes)}</div>` : ''}
        </article>`;
    }).join('');

    main().innerHTML = search +
      (cards || `<div class="empty"><p>Κανένα αποτέλεσμα για "${esc(state.memberQuery)}".</p></div>`);
  }

  /* -- Οψη: Πακετα -- */
  function renderPackages() {
    /* Συνοψη τρεχοντος μηνα: εσοδα, απληρωτα, παρουσιες */
    const ym = todayISO().slice(0, 7);
    const s = Logic.monthSummary(state.packages, state.appointments, ym);
    const summary = `
      <section class="summary-card">
        <div class="stat">
          <span class="stat-label">Έσοδα μήνα</span>
          <span class="stat-value mono">${s.revenue} €</span>
        </div>
        <div class="stat">
          <span class="stat-label">Απλήρωτα</span>
          <span class="stat-value mono ${s.unpaidCount ? 'warn-text' : ''}">${s.unpaidTotal} €</span>
        </div>
        <div class="stat">
          <span class="stat-label">Παρουσίες</span>
          <span class="stat-value mono">${s.attendance}</span>
        </div>
      </section>`;

    if (!state.packages.length) {
      main().innerHTML = summary + emptyState('Κανένα πακέτο ακόμα.', 'Πάτα + για να προσθέσεις πακέτο.');
      return;
    }
    const today = todayISO();
    const sorted = Logic.sortPackagesByPriority(state.packages, state.appointments);
    main().innerHTML = summary + sorted.map(p => {
      const rem = Logic.packageRemaining(p, state.appointments);
      const st = Logic.packageState(p, state.appointments);
      const du = Logic.daysUntil(p.endDate, today);
      /* Χρονικη ενδειξη: εληξε με αδιαθετες συνεδριες, η ληγει συντομα */
      const expiry = (du < 0 && rem > 0) ? '<span class="chip expired">Έληξε χρονικά</span>'
        : (du >= 0 && du <= 7 && rem > 0) ? `<span class="mono sub warn-text">λήγει σε ${du} ημ.</span>` : '';
      return `
        <article class="card state-${st}" data-id="${p.id}">
          <div class="card-head">
            <h3>${esc(memberName(p.memberId))}</h3>
            <div class="card-actions">
              <button class="icon-btn" data-act="edit-package" data-id="${p.id}" aria-label="Επεξεργασία">✎</button>
              <button class="icon-btn danger" data-act="del-package" data-id="${p.id}" aria-label="Διαγραφή">✕</button>
            </div>
          </div>
          <div class="pkg-line">
            <span>${esc(p.tier)} ${p.sessions}</span>
            <span class="mono">${rem}/${p.sessions}</span>
            <span class="mono">${p.price} €</span>
          </div>
          ${punchDots(p)}
          <div class="pkg-line">
            <span class="mono sub">${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</span>
            ${expiry}
            <button class="badge-btn ${p.paid ? 'paid' : 'unpaid'}" data-act="toggle-paid" data-id="${p.id}">
              ${p.paid ? 'Πληρωμένο' : 'Απλήρωτο'}
            </button>
          </div>
        </article>`;
    }).join('');
  }

  /* ---- Βοηθητικα ημερολογιου ---- */

  /* 'YYYY-MM-DD' + n ημερες -> 'YYYY-MM-DD' */
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    const pad = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* Δευτερα της εβδομαδας που περιεχει την ημερομηνια */
  function weekStart(iso) {
    const wd = new Date(iso + 'T00:00:00').getDay();
    return addDays(iso, -((wd + 6) % 7));
  }

  /* Μη-ακυρωμενα ραντεβου μιας ημερας */
  function dayAppointments(dateISO) {
    return state.appointments.filter(a => a.start.slice(0, 10) === dateISO);
  }

  /* -- Οψη: Ραντεβου (ημερολογιο) -- */
  function renderAppointments() {
    if (!state.calDate) state.calDate = todayISO();
    const controls = `
      <div class="cal-controls">
        <button class="icon-btn" data-act="cal-prev" aria-label="Προηγούμενη εβδομάδα">‹</button>
        <button class="btn small ghost" data-act="cal-today">Σήμερα</button>
        <div class="cal-mode">
          <button class="mode-btn ${state.calMode === 'day' ? 'active' : ''}" data-act="cal-mode" data-mode="day">Ημέρα</button>
          <button class="mode-btn ${state.calMode === 'week' ? 'active' : ''}" data-act="cal-mode" data-mode="week">Εβδομάδα</button>
        </div>
        <button class="icon-btn" data-act="cal-next" aria-label="Επόμενη εβδομάδα">›</button>
      </div>`;
    main().innerHTML = controls +
      (state.calMode === 'day' ? renderDayView() : renderWeekView());
  }

  /* Λωριδα εβδομαδας: 7 κουμπια ημερων με πληθος κρατησεων */
  function weekStripHTML() {
    const short = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
    const start = weekStart(state.calDate);
    const today = todayISO();
    let html = '<div class="week-strip">';
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const booked = dayAppointments(date).filter(a => a.status !== 'cancelled').length;
      html += `
        <button class="day-btn ${date === state.calDate ? 'selected' : ''} ${date === today ? 'today' : ''}"
                data-act="cal-day" data-date="${date}">
          <span class="dow">${short[i]}</span>
          <span class="dnum mono">${date.slice(8, 10)}</span>
          <span class="dcount mono">${booked || ''}</span>
        </button>`;
    }
    return html + '</div>';
  }

  /* Οψη ημερας: ζωνες του προγραμματος με θεσεις (capacity ανα ζωνη) */
  function renderDayView() {
    const date = state.calDate;
    const slots = Logic.slotsForDate(date);
    const appts = dayAppointments(date);
    const active = appts.filter(a => a.status !== 'cancelled');
    const cancelled = appts.filter(a => a.status === 'cancelled');
    const slotStarts = new Set(slots.map(s => s.start));
    /* Ραντεβου εκτος ζωνων: ενεργα που δεν ξεκινουν σε ωρα ζωνης */
    const offGrid = active.filter(a => !slotStarts.has(a.start.slice(11, 16)));

    let html = weekStripHTML();
    html += `<h2 class="cal-day-title">${dayLabel(date)}</h2>`;

    if (!slots.length) {
      html += `<div class="empty"><p>Χωρίς ζώνες αυτή την ημέρα.</p></div>`;
    }
    for (const slot of slots) {
      /* Ραντεβου της ζωνης: ιδια ωρα εναρξης */
      const seatAppts = active.filter(a => a.start.slice(11, 16) === slot.start);
      const freeSeats = Math.max(0, Logic.SCHEDULE.capacity - seatAppts.length);
      html += `
        <section class="slot-card">
          <div class="slot-time mono">${slot.start} – ${Logic.slotEnd(slot.start, slot.durationMin)}</div>
          <div class="seats">`;
      for (const a of seatAppts) {
        html += `
          <button class="seat filled st-${a.status}" data-act="seat" data-id="${a.id}">
            <span class="seat-name">${esc(memberName(a.memberId))}</span>
            <span class="chip ${a.status}">${statusLabel(a.status)}</span>
          </button>`;
      }
      for (let i = 0; i < freeSeats; i++) {
        html += `
          <button class="seat free" data-act="book-slot"
                  data-date="${date}" data-time="${slot.start}" data-dur="${slot.durationMin}">
            + Κράτηση
          </button>`;
      }
      html += '</div></section>';
    }

    /* Ενεργα ραντεβου εκτος προγραμματος ζωνων (π.χ. παλαιοτερα δεδομενα) */
    if (offGrid.length) {
      html += `<h2 class="cal-day-title">Εκτός ζωνών</h2>`;
      for (const a of offGrid) {
        html += `
          <button class="seat filled st-${a.status} offgrid" data-act="seat" data-id="${a.id}">
            <span class="mono">${fmtTime(a.start)}</span>
            <span class="seat-name">${esc(memberName(a.memberId))}</span>
            <span class="chip ${a.status}">${statusLabel(a.status)}</span>
          </button>`;
      }
    }

    /* Ακυρωμενα της ημερας, συμπτυγμενα */
    if (cancelled.length) {
      html += `<h2 class="cal-day-title">Ακυρωμένα</h2>`;
      for (const a of cancelled) {
        html += `
          <button class="seat filled st-cancelled" data-act="seat" data-id="${a.id}">
            <span class="mono">${fmtTime(a.start)}</span>
            <span class="seat-name">${esc(memberName(a.memberId))}</span>
          </button>`;
      }
    }
    return html;
  }

  /* Οψη εβδομαδας: πλεγμα πληροτητας ζωνες x ημερες, tap -> οψη ημερας */
  function renderWeekView() {
    const short = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
    const start = weekStart(state.calDate);
    const today = todayISO();
    const cap = Logic.SCHEDULE.capacity;
    /* Γραμμες πλεγματος: ενωση ωρων εναρξης ολης της εβδομαδας */
    const rowStarts = [...new Set(
      [...Array(7)].flatMap((_, i) => Logic.slotsForDate(addDays(start, i)).map(s => s.start))
    )].sort();

    let html = `<div class="week-grid" style="--cols:${7}">`;
    /* Κεφαλιδα: κενο + ημερες */
    html += '<div class="wg-cell wg-head"></div>';
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      html += `<div class="wg-cell wg-head ${date === today ? 'today' : ''}">
        ${short[i]}<br><span class="mono">${date.slice(8, 10)}</span></div>`;
    }
    /* Γραμμες ζωνων */
    for (const s of rowStarts) {
      html += `<div class="wg-cell wg-time mono">${s}</div>`;
      for (let i = 0; i < 7; i++) {
        const date = addDays(start, i);
        const hasSlot = Logic.slotsForDate(date).some(x => x.start === s);
        if (!hasSlot) {
          html += '<div class="wg-cell wg-off"></div>';
          continue;
        }
        const booked = dayAppointments(date)
          .filter(a => a.status !== 'cancelled' && a.start.slice(11, 16) === s).length;
        const cls = booked >= cap ? 'full' : booked > 0 ? 'part' : 'empty';
        html += `
          <button class="wg-cell wg-slot ${cls}" data-act="cal-cell" data-date="${date}">
            <span class="mono">${booked}/${cap}</span>
          </button>`;
      }
    }
    return html + '</div>';
  }

  /* Ετικετες κατασταστης ραντεβου */
  function statusLabel(status) {
    return {
      scheduled: 'Προγρ.',
      present: 'Παρών',
      charged_absence: 'Απουσία',
      cancelled: 'Ακυρωμένο'
    }[status];
  }

  /* Sheet ενεργειων για υπαρχον ραντεβου (tap σε θεση) */
  function seatSheet(appt) {
    const canMark = appt.status === 'scheduled';
    openSheet(`
      <h2>${esc(memberName(appt.memberId))}</h2>
      <p class="sub mono">${fmtDateTime(appt.start)} · ${appt.durationMin}′</p>
      ${appt.notes ? `<p class="sub">${esc(appt.notes)}</p>` : ''}
      <div class="form-actions column">
        ${canMark ? `
          <button class="btn ok" data-act="mark" data-status="present" data-id="${appt.id}">Παρών</button>
          <button class="btn warn" data-act="mark" data-status="charged_absence" data-id="${appt.id}">Απουσία με χρέωση</button>
          <button class="btn ghost" data-act="mark" data-status="cancelled" data-id="${appt.id}">Ακύρωση ραντεβού</button>` : ''}
        <button class="btn ghost" data-act="edit-appt" data-id="${appt.id}">Επεξεργασία</button>
        <button class="btn ghost danger-text" data-act="del-appt" data-id="${appt.id}">Διαγραφή</button>
      </div>`);
  }

  function emptyState(title, hint) {
    return `<div class="empty"><p>${title}</p><p class="sub">${hint}</p></div>`;
  }

  /* ---- Φορμες ---- */

  /* Επιλογες μελων για select */
  function memberOptions(selectedId) {
    return [...state.members]
      .sort((a, b) => a.name.localeCompare(b.name, 'el'))
      .map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc(m.name)}</option>`)
      .join('');
  }

  /* -- Φορμα μελους (νεο η επεξεργασια) -- */
  function memberForm(existing) {
    openSheet(`
      <h2>${existing ? 'Επεξεργασία μέλους' : 'Νέο μέλος'}</h2>
      <form id="f-member">
        <label>Όνομα *<input name="name" required value="${esc(existing?.name)}"></label>
        <label>Τηλέφωνο<input name="phone" type="tel" value="${esc(existing?.phone)}"></label>
        <label>Email<input name="email" type="email" value="${esc(existing?.email)}"></label>
        <label>Σημειώσεις<textarea name="notes" rows="2">${esc(existing?.notes)}</textarea></label>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="close-sheet">Άκυρο</button>
          <button type="submit" class="btn primary">Αποθήκευση</button>
        </div>
      </form>`);
    $('#f-member').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const fields = {
        name: f.get('name').trim(),
        phone: f.get('phone').trim(),
        email: f.get('email').trim(),
        notes: f.get('notes').trim()
      };
      if (!fields.name) { showFormError('Το όνομα είναι υποχρεωτικό.'); return; }
      if (existing) await Store.put('members', { ...existing, ...fields });
      else await Store.put('members', Store.newRecord(fields));
      closeSheet();
      toast('Το μέλος αποθηκεύτηκε');
      refresh();
    });
  }

  /* Κοινα πεδια πακετου: tier, plan, τιμη */
  function packageFieldsHTML(existing) {
    /* Προεπιλογη πλανου απο τον αριθμο συνεδριων του υπαρχοντος πακετου */
    const planOf = s => s === 1 ? 'daily' : s === 4 ? 'x4' : 'x8';
    const plan = existing ? planOf(existing.sessions) : 'x8';
    return `
      <label>Τύπος
        <select name="tier">
          <option ${existing?.tier === 'Classic' ? '' : 'selected'}>Golden</option>
          <option ${existing?.tier === 'Classic' ? 'selected' : ''}>Classic</option>
        </select>
      </label>
      <label>Πλάνο
        <select name="plan">
          <option value="daily" ${plan === 'daily' ? 'selected' : ''}>Ημερήσιο (1 συνεδρία)</option>
          <option value="x4" ${plan === 'x4' ? 'selected' : ''}>4 φορές (4 συνεδρίες)</option>
          <option value="x8" ${plan === 'x8' ? 'selected' : ''}>8 φορές (8 συνεδρίες)</option>
        </select>
      </label>
      <label>Τιμή (€)<input name="price" type="number" min="0" step="0.01" required value="${existing?.price ?? ''}"></label>`;
  }

  /* -- Φορμα πακετου -- */
  function packageForm(existing) {
    if (!state.members.length) { toast('Πρόσθεσε πρώτα ένα μέλος'); return; }
    const start = existing?.startDate ?? todayISO();
    openSheet(`
      <h2>${existing ? 'Επεξεργασία πακέτου' : 'Νέο πακέτο'}</h2>
      <form id="f-package">
        <label>Μέλος
          <select name="memberId">${memberOptions(existing?.memberId)}</select>
        </label>
        ${packageFieldsHTML(existing)}
        <label>Έναρξη<input name="startDate" type="date" required value="${start}"></label>
        <p class="sub">Λήξη (αυτόματα +28 ημέρες): <span class="mono" id="end-preview">${fmtDate(Logic.computeEndDate(start))}</span></p>
        <label class="check"><input name="paid" type="checkbox" ${existing?.paid ? 'checked' : ''}> Πληρωμένο</label>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="close-sheet">Άκυρο</button>
          <button type="submit" class="btn primary">Αποθήκευση</button>
        </div>
      </form>`);
    /* Ζωντανη ενημερωση της προεπισκοπησης ληξης */
    $('#f-package [name=startDate]').addEventListener('input', e => {
      if (e.target.value) $('#end-preview').textContent = fmtDate(Logic.computeEndDate(e.target.value));
    });
    $('#f-package').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const fields = {
        memberId: f.get('memberId'),
        tier: f.get('tier'),
        sessions: Logic.PLAN_SESSIONS[f.get('plan')],
        price: parseFloat(f.get('price')),
        startDate: f.get('startDate'),
        endDate: Logic.computeEndDate(f.get('startDate')),
        paid: f.get('paid') === 'on'
      };
      if (existing) await Store.put('packages', { ...existing, ...fields });
      else await Store.put('packages', Store.newRecord(fields));
      closeSheet();
      toast('Το πακέτο αποθηκεύτηκε');
      refresh();
    });
  }

  /* -- Φορμα ραντεβου --
     prefill: προαιρετικες προεπιλογες για νεο ραντεβου (κρατηση απο ζωνη) */
  function appointmentForm(existing, prefill) {
    if (!state.members.length) { toast('Πρόσθεσε πρώτα ένα μέλος'); return; }
    const startVal = existing ? existing.start.slice(0, 16)
      : prefill ? prefill.start : '';
    const durVal = existing?.durationMin ?? prefill?.durationMin ?? 55;
    openSheet(`
      <h2>${existing ? 'Επεξεργασία ραντεβού' : 'Νέο ραντεβού'}</h2>
      <form id="f-appt">
        <label>Μέλος
          <select name="memberId">${memberOptions(existing?.memberId ?? prefill?.memberId)}</select>
        </label>
        <label>Ημερομηνία & ώρα<input name="start" type="datetime-local" required value="${startVal}"></label>
        <label>Διάρκεια (λεπτά)<input name="durationMin" type="number" min="5" step="5" required value="${durVal}"></label>
        <label>Σημειώσεις<textarea name="notes" rows="2">${esc(existing?.notes)}</textarea></label>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="close-sheet">Άκυρο</button>
          <button type="submit" class="btn primary">Αποθήκευση</button>
        </div>
      </form>`);
    $('#f-appt').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const fields = {
        memberId: f.get('memberId'),
        start: f.get('start'),
        durationMin: parseInt(f.get('durationMin'), 10),
        notes: f.get('notes').trim()
      };
      /* Υποψηφιο ραντεβου για ελεγχο πληροτητας */
      const candidate = existing
        ? { ...existing, ...fields }
        : Store.newRecord({ ...fields, packageId: null, status: 'scheduled' });
      if (Logic.capacityConflict(candidate, state.appointments)) {
        showFormError(`Η ώρα είναι πλήρης: επιτρέπονται έως ${Logic.SCHEDULE.capacity} άτομα ταυτόχρονα.`);
        return;
      }
      await Store.put('appointments', candidate);
      closeSheet();
      toast('Το ραντεβού αποθηκεύτηκε');
      refresh();
    });
  }

  /* -- Ροη αυτοματης ανανεωσης: το ενεργο πακετο εξαντληθηκε -- */
  function renewalForm(member, apptId, status) {
    openSheet(`
      <h2>Πακέτο εξαντλημένο</h2>
      <p>Ο/η <strong>${esc(member.name)}</strong> δεν έχει ενεργό πακέτο.
         Με ποιο πακέτο συνεχίζει;</p>
      <form id="f-renew">
        ${packageFieldsHTML(null)}
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="close-sheet">Άκυρο</button>
          <button type="submit" class="btn primary">Δημιουργία & χρέωση</button>
        </div>
      </form>`);
    $('#f-renew').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const start = todayISO();
      /* Δημιουργια νεου πακετου με εναρξη σημερα */
      const pkg = await Store.put('packages', Store.newRecord({
        memberId: member.id,
        tier: f.get('tier'),
        sessions: Logic.PLAN_SESSIONS[f.get('plan')],
        price: parseFloat(f.get('price')),
        startDate: start,
        endDate: Logic.computeEndDate(start),
        paid: false
      }));
      /* Χρεωση της τρεχουσας παρουσιας στο νεο πακετο */
      const appt = await Store.get('appointments', apptId);
      await Store.put('appointments', { ...appt, status, packageId: pkg.id });
      closeSheet();
      toast('Νέο πακέτο δημιουργήθηκε και χρεώθηκε η παρουσία');
      refresh();
    });
  }

  /* ---- Μαρκαρισμα ραντεβου (Παρων / Απουσια με χρεωση / Ακυρωση) ---- */
  async function markAppointment(id, status) {
    const appt = state.appointments.find(a => a.id === id);
    if (!appt) return;
    /* Η ακυρωση δεν χρεωνει πακετο */
    if (status === 'cancelled') {
      await Store.put('appointments', { ...appt, status, packageId: null });
      toast('Το ραντεβού ακυρώθηκε');
      refresh();
      return;
    }
    /* Παρων / απουσια-με-χρεωση: χρεωση στο ενεργο πακετο */
    const pkg = Logic.activePackage(appt.memberId, state.packages, state.appointments);
    if (pkg) {
      await Store.put('appointments', { ...appt, status, packageId: pkg.id });
      const rem = Logic.packageRemaining(pkg, [...state.appointments.filter(a => a.id !== id),
        { ...appt, status, packageId: pkg.id }]);
      toast(status === 'present'
        ? `Παρουσία: απομένουν ${rem} συνεδρίες`
        : `Απουσία με χρέωση: απομένουν ${rem} συνεδρίες`);
      refresh();
    } else {
      /* Δεν υπαρχει ενεργο πακετο: ροη ανανεωσης αντι για μπλοκαρισμα */
      const member = state.members.find(m => m.id === appt.memberId);
      renewalForm(member, appt.id, status);
    }
  }

  /* ---- Backup: Export / Import ---- */

  function backupSheet() {
    const syncMsg = Store.SYNC.enabled
      ? 'Συγχρονισμός: ενεργός (Supabase).'
      : 'Συγχρονισμός: ανενεργός. Δες το README για ενεργοποίηση.';
    openSheet(`
      <h2>Αντίγραφα ασφαλείας</h2>
      <p class="sub">${syncMsg}</p>
      <div class="form-actions column">
        <button class="btn primary" data-act="export">Export σε JSON</button>
        <label class="btn ghost file-btn">Import από JSON
          <input type="file" id="import-file" accept="application/json" hidden>
        </label>
      </div>`);
    $('#import-file').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await confirmSheet('Το import θα αντικαταστήσει όλα τα τρέχοντα δεδομένα. Συνέχεια;', 'Αντικατάσταση');
      if (!ok) return;
      try {
        const data = JSON.parse(await file.text());
        await Store.importAll(data);
        closeSheet();
        toast('Τα δεδομένα εισήχθησαν');
        refresh();
      } catch {
        toast('Μη έγκυρο αρχείο JSON');
      }
    });
  }

  /* Κατεβασμα ολων των δεδομενων ως αρχειο JSON */
  async function doExport() {
    const data = await Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `powerfit-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Το backup κατέβηκε');
  }

  /* ---- Διαγραφες ---- */

  /* Διαγραφη μελους μαζι με τα πακετα και τα ραντεβου του */
  async function deleteMember(id) {
    const m = state.members.find(m => m.id === id);
    const pkgCount = state.packages.filter(p => p.memberId === id).length;
    const apptCount = state.appointments.filter(a => a.memberId === id).length;
    const ok = await confirmSheet(
      `Διαγραφή του/της <strong>${esc(m.name)}</strong>; ` +
      `Θα διαγραφούν και ${pkgCount} πακέτα και ${apptCount} ραντεβού.`);
    if (!ok) return;
    for (const p of state.packages.filter(p => p.memberId === id)) await Store.remove('packages', p.id);
    for (const a of state.appointments.filter(a => a.memberId === id)) await Store.remove('appointments', a.id);
    await Store.remove('members', id);
    toast('Το μέλος διαγράφηκε');
    refresh();
  }

  /* ---- Καθολικος χειρισμος events (event delegation) ---- */
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) {
      /* Κλικ στο σκοτεινο φοντο κλεινει το sheet */
      if (e.target.id === 'sheet-overlay') closeSheet();
      return;
    }
    const { act, id } = btn.dataset;
    switch (act) {
      case 'close-sheet': closeSheet(); break;
      case 'apply-update': applyUpdate(); break;
      case 'backup': backupSheet(); break;
      case 'export': doExport(); break;
      case 'edit-member': memberForm(state.members.find(m => m.id === id)); break;
      case 'del-member': deleteMember(id); break;
      case 'edit-package': packageForm(state.packages.find(p => p.id === id)); break;
      case 'del-package':
        if (await confirmSheet('Διαγραφή πακέτου;')) {
          await Store.remove('packages', id);
          toast('Το πακέτο διαγράφηκε');
          refresh();
        }
        break;
      case 'toggle-paid': {
        const p = state.packages.find(p => p.id === id);
        await Store.put('packages', { ...p, paid: !p.paid });
        /* Το p.paid ειναι η παλια τιμη: αν ηταν πληρωμενο, εγινε απληρωτο */
        toast(p.paid ? 'Σημειώθηκε ως απλήρωτο' : 'Σημειώθηκε ως πληρωμένο');
        refresh();
        break;
      }
      case 'edit-appt': appointmentForm(state.appointments.find(a => a.id === id)); break;
      case 'del-appt':
        closeSheet();
        if (await confirmSheet('Διαγραφή ραντεβού;')) {
          await Store.remove('appointments', id);
          toast('Το ραντεβού διαγράφηκε');
          refresh();
        }
        break;
      case 'mark': closeSheet(); markAppointment(id, btn.dataset.status); break;
      /* -- Ημερολογιο -- */
      case 'seat': seatSheet(state.appointments.find(a => a.id === id)); break;
      case 'book-member': appointmentForm(null, { memberId: id }); break;
      case 'book-slot':
        appointmentForm(null, {
          start: `${btn.dataset.date}T${btn.dataset.time}`,
          durationMin: parseInt(btn.dataset.dur, 10)
        });
        break;
      case 'cal-day': state.calDate = btn.dataset.date; render(); break;
      case 'cal-cell': state.calDate = btn.dataset.date; state.calMode = 'day'; render(); break;
      case 'cal-prev': state.calDate = addDays(state.calDate, -7); render(); break;
      case 'cal-next': state.calDate = addDays(state.calDate, 7); render(); break;
      case 'cal-today': state.calDate = todayISO(); render(); break;
      case 'cal-mode': state.calMode = btn.dataset.mode; render(); break;
      case 'fab': {
        /* Το + ανοιγει τη σωστη φορμα αναλογα με την ενεργη οψη */
        if (state.view === 'members') memberForm(null);
        else if (state.view === 'packages') packageForm(null);
        else appointmentForm(null);
        break;
      }
    }
  });

  /* Αναζητηση μελων: φιλτραρισμα ζωντανα, με διατηρηση του focus
     (η επανασχεδιαση αντικαθιστα το input, οποτε το ξαναεστιαζουμε) */
  document.addEventListener('input', e => {
    if (e.target.id !== 'member-search') return;
    state.memberQuery = e.target.value;
    renderMembers();
    const el = $('#member-search');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });

  /* Αλλαγη οψης απο το tab bar */
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => {
      state.view = t.dataset.view;
      /* Στην εισοδο στα Ραντεβου, το ημερολογιο ξεκινα απο σημερα */
      if (state.view === 'appointments') state.calDate = todayISO();
      render();
    }));

  /* ---- Συγχρονισμος με ενδειξη κατασταστης ---- */

  /* Ελαχιστο διαστημα μεταξυ pulls στο visibilitychange, ωστε το γρηγορο
     εναλλαξ εφαρμογων να μην πυροβολει συνεχομενα αιτηματα */
  const SYNC_MIN_INTERVAL_MS = 60000;
  let lastSyncAttempt = 0;

  /* Ενημερωση της μικρης ενδειξης στην κεφαλιδα */
  function setSyncStatus(text, cls) {
    const el = $('#sync-status');
    el.hidden = !text;
    el.textContent = text || '';
    el.className = 'sync-status mono' + (cls ? ' ' + cls : '');
  }

  /* Pull απο τον server και επανασχεδιαση. force=true αγνοει το throttle
     (χρηση στην εκκινηση). Δεν κανει τιποτα αν ο συγχρονισμος ειναι ανενεργος. */
  async function syncNow(force) {
    if (!Store.SYNC.enabled) return;
    const now = Date.now();
    if (!force && now - lastSyncAttempt < SYNC_MIN_INTERVAL_MS) return;
    lastSyncAttempt = now;
    setSyncStatus('Συγχρονισμός…');
    const ok = await Store.syncPull();
    if (ok) {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      setSyncStatus(`Συγχρ. ${pad(d.getHours())}:${pad(d.getMinutes())}`, 'ok');
      await refresh();
    } else {
      /* Αποτυχια (π.χ. offline): η εφαρμογη συνεχιζει με τα τοπικα δεδομενα */
      setSyncStatus('Χωρίς σύνδεση', 'off');
    }
  }

  /* ---- Ανιχνευση νεας εκδοσης (service worker updates) ---- */

  let swReg = null;          /* το registration, για ελεγχους ενημερωσης */
  let waitingWorker = null;  /* ο νεος worker που περιμενει ενεργοποιηση */
  let reloading = false;     /* προστασια απο διπλο reload */

  function showUpdateBanner(worker) {
    waitingWorker = worker;
    $('#update-banner').hidden = false;
  }

  /* Ο χρηστης πατησε "Ανανεωση": ο νεος worker ενεργοποιειται και
     στο controllerchange η σελιδα ξαναφορτωνει με τα νεα αρχεια */
  function applyUpdate() {
    if (waitingWorker) waitingWorker.postMessage('SKIP_WAITING');
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      swReg = await navigator.serviceWorker.register('sw.js');
    } catch {
      return;
    }
    /* Νεα εκδοση ηδη σε αναμονη (π.χ. απο προηγουμενο ανοιγμα) */
    if (swReg.waiting && navigator.serviceWorker.controller) {
      showUpdateBanner(swReg.waiting);
    }
    /* Νεα εκδοση εντοπιστηκε τωρα: περιμενε να ολοκληρωθει το κατεβασμα */
    swReg.addEventListener('updatefound', () => {
      const nw = swReg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        /* controller υπαρχει = δεν ειναι η πρωτη εγκατασταση, αρα ειναι update */
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(nw);
        }
      });
    });
    /* Μολις αναλαβει ο νεος worker, φορτωσε τη νεα εκδοση */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }

  /* Επαναφορα στο προσκηνιο: ελεγχος για νεα εκδοση + pull δεδομενων */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (swReg) swReg.update().catch(() => {});
    syncNow(false);
  });

  /* Υψος κεφαλιδας σε CSS μεταβλητη, ωστε οι sticky κεφαλιδες ημερων
     να κολλανε ακριβως κατω απο αυτην (το υψος αλλαζει με τα safe areas) */
  function setTopbarHeight() {
    const h = document.querySelector('.topbar').offsetHeight;
    document.documentElement.style.setProperty('--topbar-h', h + 'px');
  }
  window.addEventListener('resize', setTopbarHeight);

  /* ---- Εκκινηση ---- */
  async function boot() {
    await Store.init();
    setTopbarHeight();
    /* Πρωτα τα τοπικα δεδομενα στην οθονη, μετα συγχρονισμος στο παρασκηνιο */
    await refresh();
    registerServiceWorker();
    syncNow(true);
  }

  boot();
})();
