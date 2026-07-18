/* logic.js - Επιχειρησιακοι κανονες. Καθαρες συναρτησεις, χωρις DOM και χωρις βαση.
   Ολες οι συναρτησεις παιρνουν δεδομενα ως ορισματα και επιστρεφουν αποτελεσμα,
   ωστε να δοκιμαζονται ανεξαρτητα. */

'use strict';

const Logic = (() => {

  /* Διαρκεια πακετου σε ημερες: κοινη για ολα τα πλανα */
  const PACKAGE_DAYS = 28;

  /* Αντιστοιχιση πλανου -> αριθμος συνεδριων */
  const PLAN_SESSIONS = {
    'daily': 1,   /* Ημερησιο */
    'x4': 4,      /* 4 φορες */
    'x8': 8       /* 8 φορες */
  };

  /* Ονοματα πλανων για εμφανιση */
  const PLAN_LABELS = {
    'daily': 'Ημερήσιο',
    'x4': '4 φορές',
    'x8': '8 φορές'
  };

  /* Ειδη μαθηματος ανα ραντεβου. Προεπιλογη: pilates.
     Παλιες εγγραφες χωρις classType αντιμετωπιζονται ως pilates. */
  const CLASS_TYPES = {
    pilates: 'Pilates',
    weights: 'Βάρη'
  };

  /* Ετικετα ειδους μαθηματος με ασφαλη προεπιλογη */
  function classLabel(classType) {
    return CLASS_TYPES[classType] || CLASS_TYPES.pilates;
  }

  /* ---- Τιμοκαταλογος πακετων (modular) ----
     Εγκεκριμενες τιμες ανα tier και αριθμο συνεδριων (1-16).
     Δεικτης πινακα = αριθμος συνεδριων (η θεση 0 δεν χρησιμοποιειται).
     ΟΛΕΣ οι αλλαγες τιμων γινονται ΜΟΝΟ εδω. */
  const PRICE_TABLE = {
    Classic: [null, 20, 40, 60, 80, 95, 110, 120, 130, 145, 160, 175, 195, 210, 225, 240, 255],
    Golden:  [null, 15, 30, 45, 60, 70, 80, 90, 100, 110, 125, 135, 150, 160, 170, 180, 190]
  };

  /* Τιμη πακετου απο τον καταλογο. Επιστρεφει null αν δεν υπαρχει συνδυασμος. */
  function packagePrice(tier, sessions) {
    const table = PRICE_TABLE[tier];
    return (table && table[sessions] != null) ? table[sessions] : null;
  }

  /* Καταστασεις ραντεβου που καταναλωνουν συνεδρια */
  const CONSUMING_STATUSES = ['present', 'charged_absence'];

  /* ---- Προγραμμα ζωνων (modular) ----
     ΟΛΕΣ οι αλλαγες ωραριου γινονται ΜΟΝΟ εδω. Το ημερολογιο, οι θεσεις
     και ο ελεγχος πληροτητας παραγονται αυτοματα απο αυτο το αντικειμενο. */

  /* Οι τυπικες ζωνες μιας ημερας */
  const DEFAULT_SLOTS = [
    { start: '17:40', durationMin: 50 },
    { start: '18:35', durationMin: 50 },
    { start: '19:30', durationMin: 50 },
    { start: '20:25', durationMin: 45 },
    { start: '21:15', durationMin: 45 }
  ];

  const SCHEDULE = {
    /* Μεγιστος αριθμος ατομων που γυμναζονται ταυτοχρονα */
    capacity: 2,
    /* Ζωνες ανα ημερα εβδομαδας: 0=Κυριακη, 1=Δευτερα, ... 6=Σαββατο.
       Καθε ημερα μπορει να παρει δικη της λιστα (η κενη [] για αργια). */
    weekdays: {
      0: DEFAULT_SLOTS,
      1: DEFAULT_SLOTS,
      2: DEFAULT_SLOTS,
      3: DEFAULT_SLOTS,
      4: DEFAULT_SLOTS,
      5: DEFAULT_SLOTS,
      6: DEFAULT_SLOTS
    }
  };

  /* Οι ζωνες μιας συγκεκριμενης ημερομηνιας 'YYYY-MM-DD' */
  function slotsForDate(dateISO) {
    const wd = new Date(dateISO + 'T00:00:00').getDay();
    return SCHEDULE.weekdays[wd] || [];
  }

  /* Ωρα ληξης ζωνης: 'HH:MM' + διαρκεια -> 'HH:MM' */
  function slotEnd(start, durationMin) {
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + durationMin;
    const pad = n => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  }

  /* Επιστρεφει true αν η κατασταση ραντεβου καταναλωνει συνεδρια */
  function consumesSession(status) {
    return CONSUMING_STATUSES.includes(status);
  }

  /* Υπολογιζει endDate = startDate + 28 ημερες. Δεχεται/επιστρεφει 'YYYY-MM-DD'.
     Χρηση UTC για να αποφευγονται σφαλματα απο αλλαγη θερινης ωρας. */
  function computeEndDate(startDate) {
    const d = new Date(startDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + PACKAGE_DAYS);
    return d.toISOString().slice(0, 10);
  }

  /* Πληθος καταναλωμενων συνεδριων ενος πακετου:
     ραντεβου χρεωμενα στο πακετο με status present η charged_absence */
  function packageUsed(pkg, appointments) {
    return appointments.filter(a =>
      a.packageId === pkg.id && consumesSession(a.status)
    ).length;
  }

  /* Υπολοιπο πακετου = συνολο συνεδριων - καταναλωμενες */
  function packageRemaining(pkg, appointments) {
    return pkg.sessions - packageUsed(pkg, appointments);
  }

  /* Κατασταση πακετου με βαση το υπολοιπο:
     depleted: <= 0, low: <= 2 (και > 0), ok: αλλιως */
  function packageState(pkg, appointments) {
    const rem = packageRemaining(pkg, appointments);
    if (rem <= 0) return 'depleted';
    if (rem <= 2) return 'low';
    return 'ok';
  }

  /* Ενεργο πακετο μελους: το πιο προσφατο (κατα startDate) με υπολοιπο > 0.
     Επιστρεφει null αν δεν υπαρχει. */
  function activePackage(memberId, packages, appointments) {
    const candidates = packages
      .filter(p => p.memberId === memberId)
      .filter(p => packageRemaining(p, appointments) > 0)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
    return candidates.length ? candidates[0] : null;
  }

  /* Ελεγχος χρονικης επικαλυψης δυο ραντεβου.
     Δυο διαστηματα [start, start+duration) επικαλυπτονται αν το καθενα
     ξεκινα πριν τελειωσει το αλλο. */
  function overlaps(a, b) {
    const aStart = Date.parse(a.start);
    const aEnd = aStart + a.durationMin * 60000;
    const bStart = Date.parse(b.start);
    const bEnd = bStart + b.durationMin * 60000;
    return aStart < bEnd && bStart < aEnd;
  }

  /* Πληθος αλλων μη-ακυρωμενων ραντεβου που επικαλυπτονται χρονικα
     με το δοσμενο (το ιδιο ραντεβου εξαιρειται κατα την επεξεργασια) */
  function countConcurrent(appt, allAppointments) {
    return allAppointments.filter(other =>
      other.id !== appt.id &&
      other.status !== 'cancelled' &&
      overlaps(appt, other)
    ).length;
  }

  /* Ελεγχος πληροτητας: συγκρουση οταν οι ταυτοχρονες θεσεις
     εχουν ηδη συμπληρωθει (capacity ατομα την ιδια ωρα) */
  function capacityConflict(appt, allAppointments) {
    return countConcurrent(appt, allAppointments) >= SCHEDULE.capacity;
  }

  /* Ταξινομηση πακετων για την οψη Πακετα:
     πρωτα οσα κοντευουν να εξαντληθουν (μικροτερο θετικο υπολοιπο),
     μετα τα υπολοιπα ενεργα, στο τελος τα εξαντλημενα.
     Ισοπαλια: νεοτερο startDate πρωτα. */
  function sortPackagesByPriority(packages, appointments) {
    return [...packages].sort((a, b) => {
      const remA = packageRemaining(a, appointments);
      const remB = packageRemaining(b, appointments);
      const depA = remA <= 0 ? 1 : 0;
      const depB = remB <= 0 ? 1 : 0;
      /* Εξαντλημενα στο τελος */
      if (depA !== depB) return depA - depB;
      /* Μικροτερο υπολοιπο πρωτα (μονο για ενεργα εχει νοημα) */
      if (!depA && remA !== remB) return remA - remB;
      /* Νεοτερο πακετο πρωτα */
      return b.startDate.localeCompare(a.startDate);
    });
  }

  /* Ημερες απο σημερα μεχρι την ημερομηνια (αρνητικο αν εχει περασει) */
  function daysUntil(dateISO, todayISO) {
    const a = new Date(todayISO + 'T00:00:00Z');
    const b = new Date(dateISO + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  /* Συνοψη μηνα ym = 'YYYY-MM':
     - revenue: εσοδα απο πληρωμενα πακετα με εναρξη στον μηνα
     - unpaidTotal/unpaidCount: ολα τα απληρωτα πακετα (ανεξαρτητα μηνα)
     - attendance: καταναλωμενες συνεδριες μεσα στον μηνα */
  function monthSummary(packages, appointments, ym) {
    const paidInMonth = packages.filter(p => p.paid && p.startDate.slice(0, 7) === ym);
    const unpaid = packages.filter(p => !p.paid);
    return {
      revenue: paidInMonth.reduce((s, p) => s + p.price, 0),
      unpaidTotal: unpaid.reduce((s, p) => s + p.price, 0),
      unpaidCount: unpaid.length,
      attendance: appointments.filter(a =>
        consumesSession(a.status) && a.start.slice(0, 7) === ym).length
    };
  }

  /* Μηνιαιος ισολογισμος για ολους τους μηνες με δραστηριοτητα,
     απο τον πιο προσφατο προς τον παλαιοτερο. Ανα μηνα:
     - revenue: εσοδα απο πληρωμενα πακετα με εναρξη στον μηνα
     - outstanding: απληρωτα πακετα με εναρξη στον μηνα
     - packagesSold: πληθος πακετων του μηνα
     - attendance: καταναλωμενες συνεδριες του μηνα */
  function monthlyBalances(packages, appointments) {
    const months = new Set();
    for (const p of packages) months.add(p.startDate.slice(0, 7));
    for (const a of appointments) {
      if (consumesSession(a.status)) months.add(a.start.slice(0, 7));
    }
    return [...months].sort().reverse().map(ym => {
      const pk = packages.filter(p => p.startDate.slice(0, 7) === ym);
      return {
        ym,
        revenue: pk.filter(p => p.paid).reduce((s, p) => s + p.price, 0),
        outstanding: pk.filter(p => !p.paid).reduce((s, p) => s + p.price, 0),
        packagesSold: pk.length,
        attendance: appointments.filter(a =>
          consumesSession(a.status) && a.start.slice(0, 7) === ym).length
      };
    });
  }

  /* Χρονολογικη ταξινομηση ραντεβου */
  function sortAppointmentsChrono(appointments) {
    return [...appointments].sort((a, b) => a.start.localeCompare(b.start));
  }

  return {
    PACKAGE_DAYS,
    PLAN_SESSIONS,
    PLAN_LABELS,
    SCHEDULE,
    PRICE_TABLE,
    packagePrice,
    CLASS_TYPES,
    classLabel,
    consumesSession,
    computeEndDate,
    packageUsed,
    packageRemaining,
    packageState,
    activePackage,
    overlaps,
    countConcurrent,
    capacityConflict,
    slotsForDate,
    slotEnd,
    daysUntil,
    monthSummary,
    monthlyBalances,
    sortPackagesByPriority,
    sortAppointmentsChrono
  };
})();

/* Εξαγωγη για πιθανη χρηση σε tests με Node (δεν επηρεαζει τον browser) */
if (typeof module !== 'undefined') module.exports = Logic;
