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

  /* ---- Inline SVG εικονιδια (γραμμικο στυλ, stroke currentColor) ----
     Ενσωματωμενα στον κωδικα: ιδια αποδοση παντου, μηδεν εξωτερικα αρχεια. */
  const ICONS = {
    edit: '<path d="M17 3l4 4L8 20l-5 1 1-5z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
    chevronRight: '<path d="M9 5l7 7-7 7"/>'
  };

  function icon(name) {
    return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${ICONS[name]}</svg>`;
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
    /* Εφαρμογη αποθηκευμενου ωραριου (αν υπαρχει) πριν απο καθε σχεδιαση */
    const settings = await Store.getAll('settings');
    Logic.setSchedule(settings.find(s => s.id === 'schedule'));
  }

  /* Επαναφορτωση και επανασχεδιαση μετα απο καθε αλλαγη */
  async function refresh() {
    await loadAll();
    render();
    /* Το pop της κουκκιδας παιζει μονο στην πρωτη αναπαρασταση */
    state.popDot = null;
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
      /* Η κουκκιδα του ραντεβου που μολις μαρκαριστηκε παιρνει animation pop */
      const pop = a.id === state.popDot ? ' pop' : '';
      dots += `<span class="dot ${a.status === 'charged_absence' ? 'absence' : 'used'}${pop}"></span>`;
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
            <button class="member-name" data-act="member-history" data-id="${m.id}">${esc(m.name)}</button>
            <div class="card-actions">
              <button class="icon-btn brand" data-act="book-member" data-id="${m.id}" aria-label="Νέο ραντεβού">${icon('plus')}</button>
              <button class="icon-btn" data-act="edit-member" data-id="${m.id}" aria-label="Επεξεργασία">${icon('edit')}</button>
              <button class="icon-btn danger" data-act="del-member" data-id="${m.id}" aria-label="Διαγραφή">${icon('trash')}</button>
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
              <button class="icon-btn" data-act="edit-package" data-id="${p.id}" aria-label="Επεξεργασία">${icon('edit')}</button>
              <button class="icon-btn danger" data-act="del-package" data-id="${p.id}" aria-label="Διαγραφή">${icon('trash')}</button>
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

  /* Πρωτη ημερα του μηνα, μετατοπισμενη κατα n μηνες */
  function addMonths(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const pad = x => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  }

  /* Ονομα μηνα για τιτλο, π.χ. 'Ιούλιος 2026' */
  function monthLabel(iso) {
    const names = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος',
      'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
    const d = new Date(iso + 'T00:00:00');
    return `${names[d.getMonth()]} ${d.getFullYear()}`;
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
        <button class="icon-btn" data-act="cal-prev" aria-label="Προηγούμενο">${icon('chevronLeft')}</button>
        <button class="btn small ghost" data-act="cal-today">Σήμερα</button>
        <div class="cal-mode">
          <button class="mode-btn ${state.calMode === 'day' ? 'active' : ''}" data-act="cal-mode" data-mode="day">Ημέρα</button>
          <button class="mode-btn ${state.calMode === 'week' ? 'active' : ''}" data-act="cal-mode" data-mode="week">Εβδ.</button>
          <button class="mode-btn ${state.calMode === 'month' ? 'active' : ''}" data-act="cal-mode" data-mode="month">Μήνας</button>
        </div>
        <button class="icon-btn" data-act="cal-next" aria-label="Επόμενο">${icon('chevronRight')}</button>
      </div>`;
    main().innerHTML = controls +
      (state.calMode === 'day' ? renderDayView()
        : state.calMode === 'week' ? renderWeekView()
        : renderMonthView());
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

  /* Οψη ημερας: ενιαιο χρονοδιαγραμμα απο τις ζωνες του προγραμματος
     ΚΑΙ τις εξτρα ωρες, ταξινομημενες ιεραρχικα κατα ωρα εναρξης. */
  function renderDayView() {
    const date = state.calDate;
    const template = Logic.slotsForDate(date);
    const appts = dayAppointments(date);
    const active = appts.filter(a => a.status !== 'cancelled');
    const cancelled = appts.filter(a => a.status === 'cancelled');
    const templateStarts = new Set(template.map(s => s.start));

    /* Εξτρα ωρες: απο ενεργα ραντεβου εκτος προεπιλεγμενων ζωνων */
    const customTimes = new Map();
    for (const a of active) {
      const t = a.start.slice(11, 16);
      if (!templateStarts.has(t) && !customTimes.has(t)) customTimes.set(t, a.durationMin);
    }
    /* Ενιαια λιστα ζωνων, χρονολογικα (η ιεραρχικη τοποθετηση) */
    const slots = [
      ...template.map(s => ({ ...s, custom: false })),
      ...[...customTimes].map(([s, d]) => ({ start: s, durationMin: d, custom: true }))
    ].sort((a, b) => a.start.localeCompare(b.start));

    let html = weekStripHTML();
    html += `<h2 class="cal-day-title">${dayLabel(date)}</h2>`;

    if (!slots.length) {
      html += emptyState('Χωρίς ζώνες αυτή την ημέρα.', 'Πρόσθεσε ώρα με το κουμπί παρακάτω.');
    }
    for (const slot of slots) {
      /* Ραντεβου της ζωνης: ιδια ωρα εναρξης */
      const seatAppts = active.filter(a => a.start.slice(11, 16) === slot.start);
      const freeSeats = Math.max(0, Logic.SCHEDULE.capacity - seatAppts.length);
      const slotTypes = [...new Set(seatAppts.map(a => a.classType || 'pilates'))];
      const slotClass = seatAppts.length ? slotTypes.map(t => Logic.classLabel(t)).join(' / ') : '';
      html += `
        <section class="slot-card${slot.custom ? ' custom' : ''}">
          <div class="slot-head">
            <span class="slot-time mono">${slot.start} – ${Logic.slotEnd(slot.start, slot.durationMin)}</span>
            ${slot.custom ? '<span class="class-tag">Έξτρα ώρα</span>' : ''}
            ${slotClass ? `<span class="class-tag ${slotTypes.length === 1 ? slotTypes[0] : ''}">${slotClass}</span>` : ''}
          </div>
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
                  data-date="${date}" data-time="${slot.start}" data-dur="${slot.durationMin}"
                  data-class="${slotTypes.length === 1 ? slotTypes[0] : ''}">
            + Κράτηση
          </button>`;
      }
      html += '</div></section>';
    }

    /* Προσθηκη μαθηματος σε ωρα εκτος προεπιλογων */
    html += `
      <button class="btn ghost add-custom" data-act="book-custom" data-date="${date}">
        + Ώρα εκτός προγράμματος
      </button>`;

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

  /* Οψη μηνα: πλεγμα ημερων με πληροτητα, tap -> οψη ημερας */
  function renderMonthView() {
    const short = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'];
    const today = todayISO();
    const ym = state.calDate.slice(0, 7);            /* τρεχων μηνας 'YYYY-MM' */
    const monthFirst = ym + '-01';
    const monthLastDay = addDays(addMonths(monthFirst, 1), -1);
    const cap = Logic.SCHEDULE.capacity;

    let html = `<h2 class="cal-day-title">${monthLabel(monthFirst)}</h2>`;
    html += '<div class="month-grid">';
    /* Κεφαλιδα ημερων εβδομαδας */
    for (const s of short) html += `<div class="mg-cell mg-head">${s}</div>`;

    /* Κελια: απο τη Δευτερα της εβδομαδας του 1ου μεχρι το τελος
       της εβδομαδας που περιεχει την τελευταια ημερα του μηνα */
    let date = weekStart(monthFirst);
    const end = addDays(weekStart(monthLastDay), 6);
    while (date <= end) {
      const inMonth = date.slice(0, 7) === ym;
      const booked = dayAppointments(date).filter(a => a.status !== 'cancelled').length;
      /* Συνολικες θεσεις ημερας = ζωνες x χωρητικοτητα */
      const totalSeats = Logic.slotsForDate(date).length * cap;
      const cls = !inMonth ? 'other'
        : booked === 0 ? 'empty'
        : (totalSeats > 0 && booked >= totalSeats) ? 'full' : 'part';
      html += `
        <button class="mg-cell mg-day ${cls} ${date === today ? 'today' : ''}"
                data-act="cal-cell" data-date="${date}">
          <span class="mg-num mono">${parseInt(date.slice(8, 10), 10)}</span>
          <span class="mg-count mono">${booked || ''}</span>
        </button>`;
      date = addDays(date, 1);
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
      <p class="sub mono">${fmtDateTime(appt.start)} · ${appt.durationMin}′ ·
        ${Logic.classLabel(appt.classType)}</p>
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

  /* Κενη κατασταση με το εικαστικο των dots (η υπογραφη της εφαρμογης) */
  function emptyState(title, hint) {
    return `<div class="empty">
      <svg class="empty-art" viewBox="0 0 120 32" aria-hidden="true">
        <circle cx="16" cy="16" r="10" fill="var(--brand)" opacity="0.9"/>
        <circle cx="46" cy="16" r="10" fill="var(--brand)" opacity="0.55"/>
        <circle cx="76" cy="16" r="10" fill="var(--brand)" opacity="0.25"/>
        <circle cx="106" cy="16" r="10" fill="none" stroke="var(--brand)" stroke-width="3"/>
      </svg>
      <p>${title}</p><p class="sub">${hint}</p></div>`;
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
        email: '',   /* το email δεν συλλεγεται πια (ελαχιστοποιηση δεδομενων) */
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

  /* Μορφοποιηση ευρω με ελληνικο δεκαδικο κομμα (π.χ. 16,25) */
  function fmtEuro(x) {
    return x.toFixed(2).replace('.', ',');
  }

  /* Κοινος επιλογεας πακετου: tabs tier + πλεγμα συνεδριων 1-16 + τιμη.
     Η τιμη υπολογιζεται αυτοματα απο τον καταλογο αλλα μενει επεξεργασιμη
     για κατ' εξαιρεση τιμολογηση. */
  function packagePickerHTML(tier, sessions, price) {
    const sessBtns = [...Array(16)].map((_, i) => {
      const n = i + 1;
      return `<button type="button" class="sess-btn ${n === sessions ? 'active' : ''}" data-sess="${n}">${n}</button>`;
    }).join('');
    return `
      <input type="hidden" name="tier" value="${tier}">
      <input type="hidden" name="sessions" value="${sessions}">
      <div class="seg">
        <button type="button" class="seg-btn ${tier === 'Classic' ? 'active' : ''}" data-tier="Classic">Classic</button>
        <button type="button" class="seg-btn ${tier === 'Golden' ? 'active' : ''}" data-tier="Golden">Golden</button>
      </div>
      <div class="sess-grid">${sessBtns}</div>
      <p class="price-line mono" data-role="price-display"></p>
      <label>Τιμή (€)
        <input name="price" type="number" min="0" step="0.01" required value="${price ?? ''}">
      </label>`;
  }

  /* Συνδεση συμπεριφορας του επιλογεα μεσα σε μια φορμα:
     - tap σε tier/συνεδριες ενημερωνει τα κρυφα inputs και ΞΑΝΑΥΠΟΛΟΓΙΖΕΙ την τιμη
     - χειροκινητη αλλαγη τιμης ενημερωνει μονο την ενδειξη ανα μαθημα */
  function wirePackagePicker(form) {
    const tierInput = form.querySelector('[name=tier]');
    const sessInput = form.querySelector('[name=sessions]');
    const priceInput = form.querySelector('[name=price]');
    const display = form.querySelector('[data-role=price-display]');

    /* Ενδειξη: "130 € (16,25 €/μάθημα)" απο την τρεχουσα τιμη */
    function updateDisplay() {
      const price = parseFloat(priceInput.value);
      const n = parseInt(sessInput.value, 10);
      display.textContent = (isFinite(price) && n > 0)
        ? `${fmtEuro(price)} € (${fmtEuro(price / n)} €/μάθημα)` : '';
    }
    /* Νεα επιλογη: τιμη απο τον καταλογο */
    function applyAutoPrice() {
      const p = Logic.packagePrice(tierInput.value, parseInt(sessInput.value, 10));
      if (p != null) priceInput.value = p;
      updateDisplay();
    }

    form.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
      form.querySelectorAll('.seg-btn').forEach(x => x.classList.toggle('active', x === b));
      tierInput.value = b.dataset.tier;
      applyAutoPrice();
    }));
    form.querySelectorAll('.sess-btn').forEach(b => b.addEventListener('click', () => {
      form.querySelectorAll('.sess-btn').forEach(x => x.classList.toggle('active', x === b));
      sessInput.value = b.dataset.sess;
      applyAutoPrice();
    }));
    priceInput.addEventListener('input', updateDisplay);

    updateDisplay();
  }

  /* -- Φορμα πακετου -- */
  function packageForm(existing) {
    if (!state.members.length) { toast('Πρόσθεσε πρώτα ένα μέλος'); return; }
    const start = existing?.startDate ?? todayISO();
    /* Προεπιλογες επιλογεα: υπαρχον πακετο η Golden 8 με τιμη καταλογου */
    const tier = existing?.tier ?? 'Golden';
    const sessions = existing?.sessions ?? 8;
    const price = existing?.price ?? Logic.packagePrice(tier, sessions);
    openSheet(`
      <h2>${existing ? 'Επεξεργασία πακέτου' : 'Νέο πακέτο'}</h2>
      <form id="f-package">
        <label>Μέλος
          <select name="memberId">${memberOptions(existing?.memberId)}</select>
        </label>
        ${packagePickerHTML(tier, sessions, price)}
        <label>Έναρξη<input name="startDate" type="date" required value="${start}"></label>
        <p class="sub">Λήξη (αυτόματα +28 ημέρες): <span class="mono" id="end-preview">${fmtDate(Logic.computeEndDate(start))}</span></p>
        <label class="check"><input name="paid" type="checkbox" ${existing?.paid ? 'checked' : ''}> Πληρωμένο</label>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="close-sheet">Άκυρο</button>
          <button type="submit" class="btn primary">Αποθήκευση</button>
        </div>
      </form>`);
    wirePackagePicker($('#f-package'));
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
        sessions: parseInt(f.get('sessions'), 10),
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
      : prefill ? (prefill.start || '') : '';
    const durVal = existing?.durationMin ?? prefill?.durationMin ?? 55;
    /* Ειδος μαθηματος: υπαρχον > κληρονομια απο τη ζωνη > προεπιλογη Pilates */
    const classVal = existing?.classType ?? prefill?.classType ?? 'pilates';
    openSheet(`
      <h2>${existing ? 'Επεξεργασία ραντεβού' : 'Νέο ραντεβού'}</h2>
      <form id="f-appt">
        <label>Μέλος
          <select name="memberId">${memberOptions(existing?.memberId ?? prefill?.memberId)}</select>
        </label>
        <label>Είδος μαθήματος
          <select name="classType">
            <option value="pilates" ${classVal === 'pilates' ? 'selected' : ''}>Pilates</option>
            <option value="weights" ${classVal === 'weights' ? 'selected' : ''}>Βάρη</option>
          </select>
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
        classType: f.get('classType'),
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
        ${packagePickerHTML('Golden', 8, Logic.packagePrice('Golden', 8))}
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" data-act="close-sheet">Άκυρο</button>
          <button type="submit" class="btn primary">Δημιουργία & χρέωση</button>
        </div>
      </form>`);
    wirePackagePicker($('#f-renew'));
    $('#f-renew').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const start = todayISO();
      /* Δημιουργια νεου πακετου με εναρξη σημερα */
      const pkg = await Store.put('packages', Store.newRecord({
        memberId: member.id,
        tier: f.get('tier'),
        sessions: parseInt(f.get('sessions'), 10),
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
      state.popDot = appt.id;
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

  /* ---- Κρυφη σελιδα: μηνιαιος ισολογισμος (tap στο λογοτυπο) ----
     Υπολογιζεται παντα ζωντανα απο τα δεδομενα, δεν αποθηκευεται ξεχωριστα. */
  function balanceSheet() {
    const rows = Logic.monthlyBalances(state.packages, state.appointments);
    const body = !rows.length
      ? '<p class="sub">Δεν υπάρχουν ακόμα δεδομένα.</p>'
      : rows.map(r => `
        <div class="bal-row">
          <div class="bal-month">${monthLabel(r.ym + '-01')}</div>
          <div class="bal-stats">
            <span class="bal-stat"><span class="bal-label">Έσοδα</span>
              <span class="mono">${r.revenue} €</span></span>
            <span class="bal-stat"><span class="bal-label">Απλήρωτα</span>
              <span class="mono ${r.outstanding ? 'warn-text' : ''}">${r.outstanding} €</span></span>
            <span class="bal-stat"><span class="bal-label">Πακέτα</span>
              <span class="mono">${r.packagesSold}</span></span>
            <span class="bal-stat"><span class="bal-label">Παρουσίες</span>
              <span class="mono">${r.attendance}</span></span>
          </div>
        </div>`).join('');
    openSheet(`
      <h2>Μηνιαίος ισολογισμός</h2>
      ${body}
      <div class="form-actions">
        <button class="btn ghost" data-act="close-sheet">Κλείσιμο</button>
      </div>`);
  }

  /* ---- Backup: Export / Import ---- */

  /* ---- Ιστορικο συνεδριων μελους (tap στο ονομα) ---- */
  function memberHistorySheet(m) {
    const pkgs = state.packages.filter(p => p.memberId === m.id)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    const upcoming = Logic.sortAppointmentsChrono(
      state.appointments.filter(a => a.memberId === m.id && a.status === 'scheduled'));
    let html = `<h2>${esc(m.name)}</h2>`;
    if (!pkgs.length && !upcoming.length) {
      html += '<p class="sub">Δεν υπάρχει ιστορικό ακόμα.</p>';
    }
    for (const p of pkgs) {
      const rem = Logic.packageRemaining(p, state.appointments);
      /* Χρεωμενες συνεδριες του πακετου, χρονολογικα */
      const consumed = Logic.sortAppointmentsChrono(
        state.appointments.filter(a => a.packageId === p.id && Logic.consumesSession(a.status)));
      html += `
        <div class="hist-pkg">
          <div class="pkg-line">
            <strong>${esc(p.tier)} ${p.sessions}</strong>
            <span class="mono sub">${fmtDate(p.startDate)} – ${fmtDate(p.endDate)}</span>
            <span class="mono">${p.price} €</span>
            <span class="badge ${p.paid ? 'paid' : 'unpaid'}">${p.paid ? 'Πληρωμένο' : 'Απλήρωτο'}</span>
          </div>
          ${punchDots(p)}
          ${consumed.map(a => `
            <div class="hist-row">
              <span class="mono">${fmtDateTime(a.start)}</span>
              <span class="sub">${Logic.classLabel(a.classType)}</span>
              <span class="chip ${a.status}">${statusLabel(a.status)}</span>
            </div>`).join('')}
          ${rem > 0 ? `<div class="sub mono">απομένουν ${rem}</div>` : ''}
        </div>`;
    }
    if (upcoming.length) {
      html += '<h2 class="cal-day-title">Προγραμματισμένα</h2>' + upcoming.map(a => `
        <div class="hist-row">
          <span class="mono">${fmtDateTime(a.start)}</span>
          <span class="sub">${Logic.classLabel(a.classType)}</span>
        </div>`).join('');
    }
    html += '<div class="form-actions"><button class="btn ghost" data-act="close-sheet">Κλείσιμο</button></div>';
    openSheet(html);
  }

  /* ---- Ρυθμισεις ωραριου (Φαση 2): επεξεργασια μεσα απο το UI ----
     Το προχειρο (schedDraft) αποθηκευεται στο store 'settings' μονο στο Save. */
  let schedDraft = null;
  let schedDay = 1;   /* επιλεγμενη ημερα: 1 = Δευτερα */

  function scheduleEditorSheet() {
    /* Βαθυ αντιγραφο του ενεργου προγραμματος για ακινδυνη επεξεργασια */
    schedDraft = JSON.parse(JSON.stringify({
      capacity: Logic.SCHEDULE.capacity,
      weekdays: Logic.SCHEDULE.weekdays
    }));
    schedDay = 1;
    renderScheduleEditor();
  }

  function renderScheduleEditor() {
    const names = ['Κυ', 'Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα'];
    const order = [1, 2, 3, 4, 5, 6, 0];   /* εμφανιση Δε..Κυ */
    const slots = (schedDraft.weekdays[schedDay] || []).slice()
      .sort((a, b) => a.start.localeCompare(b.start));
    openSheet(`
      <h2>Ωράριο ζωνών</h2>
      <label>Θέσεις ανά ζώνη (άτομα ταυτόχρονα)
        <input id="sched-capacity" type="number" min="1" max="10" value="${schedDraft.capacity}">
      </label>
      <div class="sess-grid sched-days">
        ${order.map(d => `<button type="button" class="sess-btn ${d === schedDay ? 'active' : ''}"
          data-act="sched-day" data-day="${d}">${names[d]}</button>`).join('')}
      </div>
      <div class="sched-slots">
        ${slots.length ? slots.map(s => `
          <div class="hist-row">
            <span class="mono">${s.start} – ${Logic.slotEnd(s.start, s.durationMin)}</span>
            <span class="sub mono">${s.durationMin}′</span>
            <button class="icon-btn danger" data-act="sched-del-slot" data-start="${s.start}"
              aria-label="Αφαίρεση">${icon('trash')}</button>
          </div>`).join('') : '<p class="sub">Καμία ζώνη αυτή την ημέρα.</p>'}
      </div>
      <div class="sched-add">
        <input id="sched-new-time" type="time" aria-label="Ώρα έναρξης">
        <input id="sched-new-dur" type="number" min="5" step="5" value="50" aria-label="Διάρκεια (λεπτά)">
        <button class="btn small primary" data-act="sched-add-slot">Προσθήκη</button>
      </div>
      <button class="btn ghost" data-act="sched-copy-all">Αντιγραφή της ημέρας σε όλες</button>
      <div class="form-actions">
        <button class="btn ghost" data-act="close-sheet">Άκυρο</button>
        <button class="btn primary" data-act="sched-save">Αποθήκευση</button>
      </div>`);
  }

  /* ---- Εκκαθαριση διαγραμμενων (tombstones) ---- */
  async function purgeSheet() {
    const ok = await confirmSheet(
      'Οριστική εκκαθάριση των διαγραμμένων εγγραφών, τοπικά και στον server; ' +
      'Για πλήρες αποτέλεσμα, εκτέλεσέ την και στη δεύτερη συσκευή.', 'Εκκαθάριση');
    if (!ok) return;
    const n = await Store.purgeDeleted(0);
    toast(`Εκκαθαρίστηκαν ${n} εγγραφές`);
  }

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
        <button class="btn ghost" data-act="schedule-editor">Ρυθμίσεις ωραρίου</button>
        <button class="btn ghost" data-act="purge">Εκκαθάριση διαγραμμένων</button>
        <button class="btn ghost danger-text" data-act="logout">Αποσύνδεση</button>
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
      case 'balance': balanceSheet(); break;
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
      case 'member-history': memberHistorySheet(state.members.find(m => m.id === id)); break;
      case 'book-custom':
        /* Εξτρα ωρα: προσυμπληρωμενη ημερα, ωρα προς επιλογη */
        appointmentForm(null, { start: `${btn.dataset.date}T12:00` });
        break;
      case 'schedule-editor': scheduleEditorSheet(); break;
      case 'logout':
        if (await confirmSheet('Αποσύνδεση από αυτή τη συσκευή; Τα τοπικά δεδομένα παραμένουν.', 'Αποσύνδεση')) {
          Store.signOut();
          location.reload();
        }
        break;
      case 'purge': purgeSheet(); break;
      case 'sched-day': schedDay = parseInt(btn.dataset.day, 10); renderScheduleEditor(); break;
      case 'sched-del-slot':
        schedDraft.weekdays[schedDay] = (schedDraft.weekdays[schedDay] || [])
          .filter(s => s.start !== btn.dataset.start);
        renderScheduleEditor();
        break;
      case 'sched-add-slot': {
        const t = $('#sched-new-time').value;
        const dur = parseInt($('#sched-new-dur').value, 10);
        if (!t || !(dur > 0)) break;
        /* Αντικατασταση τυχον ιδιας ωρας και ιεραρχικη ταξινομηση */
        const list = (schedDraft.weekdays[schedDay] || []).filter(s => s.start !== t);
        list.push({ start: t, durationMin: dur });
        list.sort((a, b) => a.start.localeCompare(b.start));
        schedDraft.weekdays[schedDay] = list;
        renderScheduleEditor();
        break;
      }
      case 'sched-copy-all':
        for (let d = 0; d <= 6; d++) {
          schedDraft.weekdays[d] = JSON.parse(JSON.stringify(schedDraft.weekdays[schedDay] || []));
        }
        toast('Αντιγράφηκε σε όλες τις ημέρες');
        break;
      case 'sched-save': {
        const existing = (await Store.getAll('settings')).find(s => s.id === 'schedule');
        const rec = existing
          ? { ...existing, capacity: schedDraft.capacity, weekdays: schedDraft.weekdays }
          : Store.newRecord({ id: 'schedule', capacity: schedDraft.capacity, weekdays: schedDraft.weekdays });
        await Store.put('settings', rec);
        Logic.setSchedule(rec);
        closeSheet();
        toast('Το ωράριο αποθηκεύτηκε');
        refresh();
        break;
      }
      case 'book-slot':
        appointmentForm(null, {
          start: `${btn.dataset.date}T${btn.dataset.time}`,
          durationMin: parseInt(btn.dataset.dur, 10),
          classType: btn.dataset.class || undefined
        });
        break;
      case 'cal-day': state.calDate = btn.dataset.date; render(); break;
      case 'cal-cell': state.calDate = btn.dataset.date; state.calMode = 'day'; render(); break;
      case 'cal-prev':
        state.calDate = state.calMode === 'month'
          ? addMonths(state.calDate, -1) : addDays(state.calDate, -7);
        render();
        break;
      case 'cal-next':
        state.calDate = state.calMode === 'month'
          ? addMonths(state.calDate, 1) : addDays(state.calDate, 7);
        render();
        break;
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
    /* Χωρητικοτητα στον editor ωραριου: αμεση ενημερωση του προχειρου */
    if (e.target.id === 'sched-capacity') {
      const v = parseInt(e.target.value, 10);
      if (v >= 1) schedDraft.capacity = v;
      return;
    }
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
      /* Σκουπα tombstones ανω των 30 ημερων (τοπικα + server) */
      Store.purgeDeleted(30);
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

  /* ---- Οθονη συνδεσης ---- */

  function showLogin() {
    $('#login-screen').hidden = false;
    $('#f-login').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const err = $('#login-error');
      err.hidden = true;
      try {
        await Store.signIn(f.get('email').trim(), f.get('password'));
        $('#login-screen').hidden = true;
        startApp();
      } catch (ex) {
        err.textContent = 'Αποτυχία σύνδεσης. Έλεγξε email και κωδικό.';
        err.hidden = false;
      }
    });
  }

  /* ---- Εκκινηση ---- */

  /* Κυριως εκκινηση μετα την ταυτοποιηση */
  async function startApp() {
    /* Πρωτα τα τοπικα δεδομενα στην οθονη, μετα συγχρονισμος στο παρασκηνιο */
    await refresh();
    registerServiceWorker();
    syncNow(true);
  }

  async function boot() {
    await Store.init();
    Store.authInit();
    setTopbarHeight();
    /* Χωρις αποθηκευμενη συνεδρια: οθονη login (μια φορα ανα συσκευη).
       Με συνεδρια (εστω ληγμενη offline): η εφαρμογη ανοιγει κανονικα
       και η ανανεωση του token γινεται στο πρωτο online sync. */
    if (Store.SYNC.enabled && !Store.hasSession()) {
      showLogin();
      return;
    }
    startApp();
  }

  boot();
})();
