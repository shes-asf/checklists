// Service worker: deja la app disponible sin señal y envía la cola en segundo plano (Android/Chrome).
importScripts('config.js', 'db.js');
const VERSION = 'checklists-v1.1.0'; // misma versión que version.js
const ARCHIVOS = ['./', 'index.html', 'app.css', 'app.js', 'db.js', 'core.js', 'config.js', 'version.js', 'manifest.webmanifest', 'vendor/jspdf.umd.min.js', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // el backend nunca se cachea
  if (u.searchParams.has('nocache')) return; // consulta de la versión publicada: siempre va a la red
  e.respondWith(caches.open(VERSION).then(async c => {
    const enCache = await c.match(e.request, { ignoreSearch: true });
    const deRed = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return enCache || (await deRed) || new Response('Sin conexión', { status: 503 });
  }));
});
self.addEventListener('sync', e => { if (e.tag === 'cola') e.waitUntil(Cola.enviar()); });
