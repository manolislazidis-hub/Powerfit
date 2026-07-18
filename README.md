# Power Fit — Διαχείριση studio Pilates

Μικρή PWA για διαχείριση μελών, πακέτων συνδρομής (βάσει συνεδριών) και ραντεβού.
Καθαρά HTML/CSS/JS, χωρίς framework και χωρίς build step. Τα δεδομένα αποθηκεύονται
τοπικά σε IndexedDB και η εφαρμογή δουλεύει πλήρως offline.

## Αρχεία

| Αρχείο | Ρόλος |
|---|---|
| `logic.js` | Επιχειρησιακοί κανόνες (καθαρές συναρτήσεις, χωρίς DOM/βάση) |
| `store.js` | Πρόσβαση δεδομένων: IndexedDB + προαιρετικός συγχρονισμός Supabase |
| `app.js` | Παρουσίαση: rendering, events, φόρμες |
| `index.html`, `styles.css` | App shell και στυλ |
| `manifest.json`, `sw.js`, `icons/` | PWA: εγκατάσταση και offline cache |

## Τοπική δοκιμή

IndexedDB και service worker ΔΕΝ δουλεύουν με `file://`. Χρειάζεται τοπικός server:

```
cd powerfit
python3 -m http.server 8000
```

Άνοιξε `http://localhost:8000`.

## Deployment στο GitHub Pages (δωρεάν)

1. Φτιάξε νέο repository στο GitHub (π.χ. `powerfit`).
2. Ανέβασε όλα τα αρχεία στη ρίζα του repository (μαζί με τον φάκελο `icons/`).
3. Settings → Pages → Source: `Deploy from a branch`, branch `main`, folder `/ (root)`.
4. Μετά από 1-2 λεπτά η εφαρμογή είναι διαθέσιμη στο
   `https://<username>.github.io/powerfit/`.

Σημείωση: σε κάθε ενημέρωση αρχείων, αύξησε το `CACHE_NAME` στο `sw.js`
(π.χ. `powerfit-v2`) ώστε οι συσκευές να κατεβάσουν τη νέα έκδοση.

## Εγκατάσταση στο iPhone (Add to Home Screen)

1. Άνοιξε το URL της εφαρμογής στο **Safari**.
2. Πάτα το κουμπί **Κοινή χρήση** (τετράγωνο με βέλος).
3. Επίλεξε **Προσθήκη στην οθόνη Αφετηρίας** (Add to Home Screen).
4. Η εφαρμογή ανοίγει πλέον σαν αυτόνομη app, χωρίς μπάρα του Safari, και offline.

## Backup (Export / Import)

Από το κουμπί ⇅ πάνω δεξιά:

- **Export**: κατεβάζει όλα τα δεδομένα σε ένα αρχείο JSON.
- **Import**: φορτώνει τέτοιο αρχείο (αντικαθιστά όλα τα τρέχοντα δεδομένα, με επιβεβαίωση).

Το Export/Import είναι και ο χειροκίνητος τρόπος μεταφοράς δεδομένων μεταξύ
2 συσκευών, αν δεν ενεργοποιηθεί ο συγχρονισμός.

## Συγχρονισμός 2 συσκευών (Supabase, προαιρετικό)

Λογική: pull όλων των δεδομένων στο άνοιγμα της εφαρμογής, push σε κάθε αλλαγή,
επίλυση συγκρούσεων **last-write-wins** με βάση το πεδίο `updatedAt`.

### 1. Δημιουργία project

1. Λογαριασμός στο [supabase.com](https://supabase.com) (free tier).
2. New project → όνομα π.χ. `powerfit` → περιοχή κοντά σου (π.χ. `eu-central-1`).
3. Από Project Settings → API κράτησε το **Project URL** και το **anon public key**.

### 2. SQL για τους πίνακες

Στο SQL Editor του Supabase τρέξε:

```sql
create table members (
  id text primary key,
  "createdAt" bigint,
  "updatedAt" bigint,
  name text,
  phone text,
  email text,
  notes text
);

create table packages (
  id text primary key,
  "createdAt" bigint,
  "updatedAt" bigint,
  "memberId" text,
  tier text,
  sessions integer,
  price numeric,
  "startDate" text,
  "endDate" text,
  paid boolean
);

create table appointments (
  id text primary key,
  "createdAt" bigint,
  "updatedAt" bigint,
  "memberId" text,
  "packageId" text,
  start text,
  "durationMin" integer,
  status text,
  notes text
);
```

Τα εισαγωγικά στα ονόματα στηλών είναι απαραίτητα για να διατηρηθεί το camelCase.

Αν το project δημιουργήθηκε με ενεργό Row Level Security (προεπιλογή), πρέπει είτε
να προστεθούν policies που επιτρέπουν select/insert/update/delete στον ρόλο `anon`,
είτε να απενεργοποιηθεί το RLS στους τρεις πίνακες:

```sql
alter table members disable row level security;
alter table packages disable row level security;
alter table appointments disable row level security;
```

### 3. Ενεργοποίηση στην εφαρμογή

Στο `store.js`, στην αρχή:

```js
const SYNC = {
  enabled: true,
  url: 'https://xxxx.supabase.co',   // Project URL
  anonKey: '...'                     // anon public key
};
```

Ανέβασε ξανά το αρχείο (και αύξησε το `CACHE_NAME` στο `sw.js`).

### Περιορισμοί που πρέπει να γνωρίζεις

- **Last-write-wins**: αν δύο συσκευές αλλάξουν την ίδια εγγραφή offline, κερδίζει
  όποια αποθήκευσε τελευταία (κατά `updatedAt`). Για προσωπική χρήση με 2 συσκευές
  είναι αποδεκτό.
- **Το anon key είναι δημόσιο**: όποιος έχει το URL και το key μπορεί να διαβάσει/γράψει
  τα δεδομένα. Για προσωπική χρήση είναι αποδεκτό ρίσκο, αλλά επειδή αποθηκεύονται
  στοιχεία πελατών (ονόματα, τηλέφωνα), σκέψου: (α) RLS με Supabase Auth για πραγματική
  προστασία, (β) υποχρεώσεις GDPR — ελαχιστοποίηση δεδομένων, δυνατότητα διαγραφής
  κατόπιν αιτήματος.
- **Παύση από αδράνεια**: κάποιες free βαθμίδες του Supabase παγώνουν το project μετά
  από ~1 εβδομάδα αδράνειας. Αρκεί ένα άνοιγμα της εφαρμογής (ή restart από το
  dashboard) για επανενεργοποίηση. Η εφαρμογή συνεχίζει να δουλεύει τοπικά ακόμα
  κι αν ο συγχρονισμός αποτύχει.
- **Διαγραφές**: η διαγραφή στέλνεται άμεσα στον server. Αν γίνει offline, η εγγραφή
  μπορεί να επανεμφανιστεί από το pull της άλλης συσκευής (δεν χρησιμοποιούνται
  tombstones). Σε αυτή την περίπτωση απλά διάγραψέ την ξανά όντας online.

## Επιχειρησιακοί κανόνες (σύνοψη)

- Συνεδρία καταναλώνεται μόνο από ραντεβού με status `present` ή `charged_absence`.
- Υπόλοιπο πακέτου = συνεδρίες − καταναλωμένες. Εξαντλημένο: ≤ 0. Κοντά στη λήξη: ≤ 2.
- Ενεργό πακέτο = το πιο πρόσφατο (κατά `startDate`) με υπόλοιπο > 0.
- Όταν μαρκάρεται παρουσία χωρίς ενεργό πακέτο, ανοίγει η ροή ανανέωσης:
  δημιουργείται νέο πακέτο (έναρξη σήμερα, λήξη +28 ημέρες) και η παρουσία
  χρεώνεται σε αυτό.
- Δύο μη-ακυρωμένα ραντεβού δεν επιτρέπεται να επικαλύπτονται χρονικά.
- `endDate` = `startDate` + 28 ημέρες, πάντα αυτόματα.
