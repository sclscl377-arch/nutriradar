// NutriRadar Service Worker
// 版本號：更新後瀏覽器會重新安裝新版 SW
const CACHE_NAME = 'nutriradar-v3';

// 取得 SW 所在目錄路徑（相容本地伺服器 / 與 GitHub Pages /nutriradar/）
const BASE_PATH = self.registration.scope;

// 要預先快取的靜態資源（相對路徑）
const RELATIVE_ASSETS = [
  './',
  'index.html',
  'styles/main.css',
  'js/app.js',
  'js/data/preset_foods.js',
  'js/data/nutrition_glossary.js',
  'js/engine/ocr_engine.js',
  'js/engine/scoring_engine.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'manifest.json'
];

// ─── 安裝事件：預先快取靜態資源 ───────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing NutriRadar Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching assets based on scope:', BASE_PATH);
        const urlsToCache = RELATIVE_ASSETS.map(asset => new URL(asset, BASE_PATH).href);
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // 立即激活新版 SW
  );
});

// ─── 激活事件：清除舊版快取 ────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating NutriRadar Service Worker...');
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim()) // 接管所有頁面
  );
});

// ─── Fetch 攔截：快取優先策略（靜態資源）+ 網路優先（API）────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Gemini API 呼叫 → 永遠走網路（不快取）
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('generativelanguage')) {
    return; // 不攔截，直接讓瀏覽器處理
  }

  // CDN 外部資源（Chart.js 等）→ 網路優先，失敗時用快取
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 快取 CDN 資源
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 本地靜態資源 → 快取優先，快取無則網路
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request).then(response => {
          // 只快取成功回應
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          return response;
        });
      })
      .catch(() => {
        // 離線時顯示主頁（僅對 HTML 請求）
        if (event.request.destination === 'document') {
          return caches.match(new URL('./', BASE_PATH).href) || caches.match(new URL('index.html', BASE_PATH).href);
        }
      })
  );
});
