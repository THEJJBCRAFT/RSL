// Service Worker von Find Mein Soon: App-Oberflaeche offline aus dem Cache, Karten immer aus dem Netz.
importScripts("./version.js");
const CACHE_NAME = `find-mein-soon-${self.FMS_VERSION}`;
const SHELL = [
  "./",
  "./index.html",
  "./version.js",
  "./app.css",
  "./app.js",
  "./crypto.js",
  "./protocol.js",
  "./format.js",
  "./net.js",
  "./geo.js",
  "./map.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./vendor/leaflet/leaflet.css",
  "./vendor/leaflet/leaflet.js",
  "./vendor/mqtt/mqtt.min.js",
  "./vendor/qrcode/qrcode.js",
  "./vendor/leaflet/images/marker-icon.png",
  "./vendor/leaflet/images/marker-shadow.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache: "reload" umgeht den HTTP-Cache, damit nie eine alte Datei in einen neuen Cache wandert.
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Kartenkacheln und fremde Dienste (Broker, GitHub-API) gehen immer direkt ins Netz.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Nur echte App-Seiten merken, keine Fehlerseiten des Hosters.
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put("./index.html", copy));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Eigene Dateien: erst Cache (schnell, offline), dann im Hintergrund frisch holen. cache: "no-cache" prueft beim
  // Server nach (ETag), damit nach einem Update nicht Minuten lang alte Module aus dem HTTP-Cache kommen.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(cached => {
      const network = fetch(new Request(request, { cache: "no-cache" }))
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// Tipp auf eine Alarm-Benachrichtigung: App in den Vordergrund holen.
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      const client = list.find(item => "focus" in item);
      if (client) return client.focus();
      return self.clients.openWindow("./");
    })
  );
});
