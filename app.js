/* app.js - Στρωμα παρουσιασης. Rendering, events, φορμες.
   Χρησιμοποιει το Logic για κανονες και το Store για δεδομενα. */

'use strict';

(() => {

  /* ---- Κατασταση εφαρμογης στη μνημη ---- */
  const state = {
    view: 'members',            /* ενεργη οψη: members | packages | appointments */
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
    const sorted = [...state.members].sort((a, b) => a.name.localeCompare(b.name, 'el'));
    main().innerHTML = sorted.map(m => {
      const pkg = Logic.activePackage(m.id, state.packages, state.appointments);
      let stateClass, statusHTML;
      if (pkg) {
        const rem = Logic.packageRemaining(pkg, state.appointments);
        stateClass = Logic.packageState(pkg, state.appointments); /* ok | low */
        statusHTML = `
          <div class="pkg-line">
            <span>${esc(pkg.tier)} ${pkg.sessions}</span>
            <span class="mono">απομένουν ${rem}</span>
            <span class="badge ${pkg.paid ? 'paid' : 'unpaid'}">${pkg.paid ? 'Πληρωμένο' : 'Απλήρωτο'}</span>
          </div>
          ${punchDots(pkg)}`;
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
              <button class="icon-btn" data-act="edit-member" data-id="${m.id}" aria-label="Επεξεργασία">✎</button>
              <button class="icon-btn danger" data-act="del-member" data-id="${m.id}" aria-label="Διαγραφή">✕</button>
            </div>
          </div>
          ${statusHTML}
          ${m.phone ? `<div class="sub mono">${esc(m.phone)}</div>` : ''}
          ${m.notes ? `<div class="sub">${esc(m.notes)}</div>` : ''}
        </article>`;
    }).join('');
  }

  /* -- Οψη: Πακετα -- */
  function renderPackages() {
    if (!state.packages.length) {
      main().innerHTML = emptyState('Κανένα πακέτο ακόμα.', 'Πάτα + για να προσθέσεις πακέτο.');
      return;
    }
    const sorted = Logic.sortPackagesByPriority(state.packages, state.appointments);
    main().innerHTML = sorted.map(p => {
      const rem = Logic.packageRemaining(p, state.appointments);
      const st = Logic.packageState(p, state.appointments);
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
            <button class="badge-btn ${p.paid ? 'paid' : 'unpaid'}" data-act="toggle-paid" data-id="${p.id}">
              ${p.paid ? 'Πληρωμένο' : 'Απλήρωτο'}
            </button>
          </div>
        </article>`;
    }).join('');
  }

  /* -- Οψη: Ραντεβου -- */
  function renderAppointments() {
    if (!state.appointments.length) {
      main().innerHTML = emptyState('Κανένα ραντεβού ακόμα.', 'Πάτα + για να κλείσεις ραντεβού.');
      return;
    }
    const labels = {
      scheduled: 'Προγραμματισμένο',
      present: 'Παρών',
      charged_absence: 'Απουσία με χρέωση',
      cancelled: 'Ακυρωμένο'
    };
    const sorted = Logic.sortAppointmentsChrono(state.appointments);
    main().innerHTML = sorted.map(a => `
      <article class="card appt-${a.status}" data-id="${a.id}">
        <div class="card-head">
          <h3>${esc(memberName(a.memberId))}</h3>
          <div class="card-actions">
            <button class="icon-btn" data-act="edit-appt" data-id="${a.id}" aria-label="Επεξεργασία">✎</button>
            <button class="icon-btn danger" data-act="del-appt" data-id="${a.id}" aria-label="Διαγραφή">✕</button>
          </div>
        </div>
        <div class="pkg-line">
          <span class="mono">${fmtDateTime(a.start)}</span>
          <span class="mono sub">${a.durationMin}′</span>
          <span class="chip ${a.status}">${labels[a.status]}</span>
        </div>
        ${a.notes ? `<div class="sub">${esc(a.notes)}</div>` : ''}
        ${a.status === 'scheduled' ? `
          <div class="appt-actions">
            <button class="btn small ok" data-act="mark" data-status="present" data-id="${a.id}">Παρών</button>
            <button class="btn small warn" data-act="mark" data-status="charged_absence" data-id="${a.id}">Απουσία με χρέωση</button>
            <button class="btn small ghost" data-act="mark" data-status="cancelled" data-id="${a.id}">Ακύρωση</button>
          </div>` : ''}
      </article>`).join('');
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
    if (!state.members.length) { alert('Πρόσθεσε πρώτα ένα μέλος.'); return; }
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
      refresh();
    });
  }

  /* -- Φορμα ραντεβου -- */
  function appointmentForm(existing) {
    if (!state.members.length) { alert('Πρόσθεσε πρώτα ένα μέλος.'); return; }
    /* Προεπιλογη: αυριο δεν χρειαζεται, απλα κενο για νεο */
    const startVal = existing ? existing.start.slice(0, 16) : '';
    openSheet(`
      <h2>${existing ? 'Επεξεργασία ραντεβού' : 'Νέο ραντεβού'}</h2>
      <form id="f-appt">
        <label>Μέλος
          <select name="memberId">${memberOptions(existing?.memberId)}</select>
        </label>
        <label>Ημερομηνία & ώρα<input name="start" type="datetime-local" required value="${startVal}"></label>
        <label>Διάρκεια (λεπτά)<input name="durationMin" type="number" min="5" step="5" required value="${existing?.durationMin ?? 55}"></label>
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
      /* Υποψηφιο ραντεβου για ελεγχο επικαλυψης */
      const candidate = existing
        ? { ...existing, ...fields }
        : Store.newRecord({ ...fields, packageId: null, status: 'scheduled' });
      const conflict = Logic.findConflict(candidate, state.appointments);
      if (conflict) {
        showFormError(`Επικάλυψη με ραντεβού: ${memberName(conflict.memberId)} στις ${fmtDateTime(conflict.start)}.`);
        return;
      }
      await Store.put('appointments', candidate);
      closeSheet();
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
      refresh();
      return;
    }
    /* Παρων / απουσια-με-χρεωση: χρεωση στο ενεργο πακετο */
    const pkg = Logic.activePackage(appt.memberId, state.packages, state.appointments);
    if (pkg) {
      await Store.put('appointments', { ...appt, status, packageId: pkg.id });
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
      if (!confirm('Το import θα αντικαταστήσει όλα τα τρέχοντα δεδομένα. Συνέχεια;')) return;
      try {
        const data = JSON.parse(await file.text());
        await Store.importAll(data);
        closeSheet();
        refresh();
      } catch {
        showFormError('Μη έγκυρο αρχείο JSON.');
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
  }

  /* ---- Διαγραφες ---- */

  /* Διαγραφη μελους μαζι με τα πακετα και τα ραντεβου του */
  async function deleteMember(id) {
    const m = state.members.find(m => m.id === id);
    if (!confirm(`Διαγραφή του/της "${m.name}" μαζί με πακέτα και ραντεβού;`)) return;
    for (const p of state.packages.filter(p => p.memberId === id)) await Store.remove('packages', p.id);
    for (const a of state.appointments.filter(a => a.memberId === id)) await Store.remove('appointments', a.id);
    await Store.remove('members', id);
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
      case 'backup': backupSheet(); break;
      case 'export': doExport(); break;
      case 'edit-member': memberForm(state.members.find(m => m.id === id)); break;
      case 'del-member': deleteMember(id); break;
      case 'edit-package': packageForm(state.packages.find(p => p.id === id)); break;
      case 'del-package':
        if (confirm('Διαγραφή πακέτου;')) { await Store.remove('packages', id); refresh(); }
        break;
      case 'toggle-paid': {
        const p = state.packages.find(p => p.id === id);
        await Store.put('packages', { ...p, paid: !p.paid });
        refresh();
        break;
      }
      case 'edit-appt': appointmentForm(state.appointments.find(a => a.id === id)); break;
      case 'del-appt':
        if (confirm('Διαγραφή ραντεβού;')) { await Store.remove('appointments', id); refresh(); }
        break;
      case 'mark': markAppointment(id, btn.dataset.status); break;
      case 'fab': {
        /* Το + ανοιγει τη σωστη φορμα αναλογα με την ενεργη οψη */
        if (state.view === 'members') memberForm(null);
        else if (state.view === 'packages') packageForm(null);
        else appointmentForm(null);
        break;
      }
    }
  });

  /* Αλλαγη οψης απο το tab bar */
  document.querySelectorAll('.tab').forEach(t =>
    t.addEventListener('click', () => { state.view = t.dataset.view; render(); }));

  /* ---- Εκκινηση ---- */
  async function boot() {
    await Store.init();
    /* Συγχρονισμος στο ανοιγμα (αν ειναι ενεργος), μετα φορτωμα και σχεδιαση */
    await Store.syncPull();
    await refresh();
    /* Καταχωρηση service worker για offline λειτουργια */
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  boot();
})();
