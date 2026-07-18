/* sw.js - Service worker. Κανει cache το app shell ωστε η εφαρμογη
   να ανοιγει και offline. Στρατηγικη: cache-first για τα αρχεια του shell.
   Σε καθε αλλαγη αρχειων: αυξησε το CACHE_NAME για να ανανεωθει το cache. */

const CACHE_NAME = 'powerfit-v3';

/* Ολα τα αρχεια του app shell */
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './logic.js',
  './store.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* Εγκατασταση: προφορτωση ολου του shell στο cache */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

/* Ενεργοποιηση: καθαρισμος παλιων εκδοσεων cache */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Fetch: cache-first για GET, με fallback στο δικτυο.
   Τα αιτηματα συγχρονισμου (Supabase) πανε παντα στο δικτυο. */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  /* Μονο same-origin αιτηματα εξυπηρετουνται απο το cache */
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
