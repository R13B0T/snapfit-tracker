// SnapFit Tracker — Service Worker
// Cache-first strategy for offline PWA support

const CACHE_NAME = "snapfit-v2";
const STATIC_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./gym-map.jpg"
];

const CDN_ASSETS = [
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap"
];

// Install — pre-cache local assets, attempt CDN assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache local assets (required)
      const localPromise = cache.addAll(
        STATIC_ASSETS.filter(url => {
          // gym-map.jpg is optional — don't fail install if missing
          if (url.includes("gym-map")) return false;
          return true;
        })
      );
      // Cache gym-map separately so it doesn't block install
      const mapPromise = cache.add("./gym-map.jpg").catch(() => {});
      // Cache CDN assets separately so they don't block install
      const cdnPromise = Promise.all(
        CDN_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
      return Promise.all([localPromise, mapPromise, cdnPromise]);
    }).then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for local/CDN, network-only for API calls
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // Never cache Anthropic API calls
  if (url.hostname === "api.anthropic.com") {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache successful GET responses
        if (!response || response.status !== 200 || event.request.method !== "GET") {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback — return index.html for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("Offline", { status: 503 });
      });
    })
  );
});
