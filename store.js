/* store.js - Στρωμα δεδομενων. Τοπικη αποθηκευση σε IndexedDB και
   προαιρετικος συγχρονισμος με Supabase (απενεργοποιημενος απο προεπιλογη).
   Δεν αγγιζει το DOM. */

'use strict';

const Store = (() => {

  /* ---- Ρυθμισεις συγχρονισμου (Supabase) ----
     Για ενεργοποιηση: enabled = true και συμπληρωση url + anonKey.
     Δες README.md για τη δημιουργια του project και το SQL των πινακων. */
  const SYNC = {
    enabled: true,
    url: 'https://pywbgbzkofoofbjeruac.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5d2JnYnprb2Zvb2ZiamVydWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjA4NzksImV4cCI6MjA5OTkzNjg3OX0.4Fmsux3mFvWvUou7u8LO45ej3LSojRSfF6GEqtVgeRk'
  };

  const DB_NAME = 'powerfit';
  const DB_VERSION = 1;
  /* Ονοματα object stores = ονοματα πινακων στο Supabase */
  const STORES = ['members', 'packages', 'appointments'];

  let db = null;

  /* ---- Ανοιγμα βασης και δημιουργια stores στην πρωτη εκτελεση ---- */
  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        for (const name of STORES) {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      req.onsuccess = () => { db = req.result; resolve(); };
      req.onerror = () => reject(req.error);
    });
  }

  /* Βοηθητικο: τυλιγει ενα IDBRequest σε Promise */
  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ---- Βασικες πραξεις CRUD ---- */

  /* Ολες οι εγγραφες ενος store, ΧΩΡΙΣ τις διαγραμμενες (tombstones).
     Αυτη χρησιμοποιει το UI. */
  async function getAll(storeName) {
    const all = await getAllRaw(storeName);
    return all.filter(r => !r.deleted);
  }

  /* Ολες οι εγγραφες μαζι με τα tombstones (χρηση απο sync και export) */
  function getAllRaw(storeName) {
    const tx = db.transaction(storeName, 'readonly');
    return promisify(tx.objectStore(storeName).getAll());
  }

  /* Μια εγγραφη με id */
  function get(storeName, id) {
    const tx = db.transaction(storeName, 'readonly');
    return promisify(tx.objectStore(storeName).get(id));
  }

  /* Αποθηκευση εγγραφης: ενημερωνει updatedAt και κανει push αν ο συγχρονισμος ειναι ενεργος */
  async function put(storeName, record) {
    record.updatedAt = Date.now();
    const tx = db.transaction(storeName, 'readwrite');
    await promisify(tx.objectStore(storeName).put(record));
    pushRecord(storeName, record); /* fire-and-forget */
    return record;
  }

  /* Αποθηκευση χωρις αλλαγη updatedAt (χρηση απο pull/import) */
  function putRaw(storeName, record) {
    const tx = db.transaction(storeName, 'readwrite');
    return promisify(tx.objectStore(storeName).put(record));
  }

  /* Διαγραφη ως tombstone (soft delete): η εγγραφη μαρκαρεται deleted
     αντι να σβηστει, ωστε η διαγραφη να συγχρονιζεται σωστα ως αλλαγη
     (last-write-wins) και να μην "αναστηνεται" απο αλλες συσκευες. */
  async function remove(storeName, id) {
    const record = await get(storeName, id);
    if (!record) return;
    await put(storeName, { ...record, deleted: true });
  }

  /* Αδειασμα ολων των stores (χρηση απο import) */
  async function clearAll() {
    for (const name of STORES) {
      const tx = db.transaction(name, 'readwrite');
      await promisify(tx.objectStore(name).clear());
    }
  }

  /* ---- Δημιουργια νεας εγγραφης με κοινα πεδια ---- */
  function newRecord(fields) {
    const now = Date.now();
    return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, ...fields };
  }

  /* ---- Export / Import ---- */

  /* Ολα τα δεδομενα σε ενα αντικειμενο για backup.
     Περιλαμβανει και τα tombstones, ωστε ενα import να μην αναστησει διαγραφες. */
  async function exportAll() {
    const data = {};
    for (const name of STORES) data[name] = await getAllRaw(name);
    return data;
  }

  /* Αντικατασταση ολων των δεδομενων απο backup */
  async function importAll(data) {
    await clearAll();
    for (const name of STORES) {
      const records = Array.isArray(data[name]) ? data[name] : [];
      for (const rec of records) await putRaw(name, rec);
    }
  }

  /* ---- Συγχρονισμος με Supabase (REST API) ---- */

  /* Κοινες κεφαλιδες για ολα τα αιτηματα */
  function syncHeaders() {
    return {
      'apikey': SYNC.anonKey,
      'Authorization': 'Bearer ' + SYNC.anonKey,
      'Content-Type': 'application/json'
    };
  }

  /* Push μιας εγγραφης (upsert κατα id). Σιωπηλη αποτυχια αν δεν υπαρχει δικτυο. */
  async function pushRecord(storeName, record) {
    if (!SYNC.enabled) return;
    try {
      await fetch(`${SYNC.url}/rest/v1/${storeName}?on_conflict=id`, {
        method: 'POST',
        headers: { ...syncHeaders(), 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify([record])
      });
    } catch (e) {
      /* Offline: το pull στο επομενο ανοιγμα με συνδεση θα καλυψει τη διαφορα
         μεσω του push των τοπικα νεοτερων εγγραφων */
      console.warn('Sync push failed:', e);
    }
  }

  /* Pull ολων στο ανοιγμα της εφαρμογης.
     Δουλευει πανω σε ΟΛΕΣ τις εγγραφες, μαζι με τα tombstones: μια διαγραφη
     ειναι απλως μια νεοτερη εκδοση της εγγραφης με deleted=true, οποτε
     το last-write-wins τη διαδιδει σωστα προς ολες τις συσκευες.
     - remote νεοτερο η αγνωστο τοπικα -> γραφεται τοπικα
     - local νεοτερο η αγνωστο απομακρυσμενα -> γινεται push
     Επιστρεφει true αν ολοκληρωθηκε, false αν απετυχε (π.χ. offline). */
  async function syncPull() {
    if (!SYNC.enabled) return false;
    try {
      for (const name of STORES) {
        const res = await fetch(`${SYNC.url}/rest/v1/${name}?select=*`, {
          headers: syncHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${name}`);
        const remote = await res.json();
        const local = await getAllRaw(name);
        const localById = new Map(local.map(r => [r.id, r]));
        const remoteById = new Map(remote.map(r => [r.id, r]));

        /* Ενσωματωση απομακρυσμενων εγγραφων που ειναι νεοτερες τοπικα */
        for (const rec of remote) {
          const loc = localById.get(rec.id);
          if (!loc || loc.updatedAt < rec.updatedAt) await putRaw(name, rec);
        }
        /* Push τοπικων εγγραφων που λειπουν η ειναι νεοτερες απομακρυσμενα */
        for (const rec of local) {
          const rem = remoteById.get(rec.id);
          if (!rem || rem.updatedAt < rec.updatedAt) await pushRecord(name, rec);
        }
      }
      return true;
    } catch (e) {
      console.warn('Sync pull failed:', e);
      return false;
    }
  }

  return {
    SYNC,
    init,
    getAll,
    get,
    put,
    remove,
    newRecord,
    exportAll,
    importAll,
    syncPull
  };
})();
