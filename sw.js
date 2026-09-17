// NutriRadar Service Worker
// 版本號：更新後瀏覽器會重新安裝新版 SW
const CACHE_NAME = 'nutriradar-v6';

// 取得 SW 所在目錄路徑（相容本地伺服器 / 與 GitHub Pages /nutriradar/）
const BASE_PATH = self.registration.scope;

// 要預先快取的靜態資源（相對路徑）
const RELATIVE_ASSETS = [
  './',
  'index.html',
  'styles/main.css?v=3.2',
  'js/app.js?v=3.2',
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
  console.log('[SW] Installing NutriRadar Service Worker v4...');
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

// ─── 激活事件：清除舊版快取並立即接管頁面 ──────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating NutriRadar Service Worker v4...');
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
      .then(() => self.clients.claim()) // 立即接管所有開啟中的頁面
  );
});

// ─── Fetch 攔截：核心代碼「網路優先」，圖片離線「快取優先」──────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. API 呼叫（Gemini 等）→ 永遠走網路
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('generativelanguage')) {
    return;
  }

  // 2. 外部 CDN 資源（Chart.js, Tesseract 等）→ 網路優先，離線退回快取
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. 靜態圖示與圖片（icons/*）→ 快取優先（節省流量）
  if (url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. 核心頁面與代碼（HTML、CSS、JS）→ 🌟 網路優先 (Network First)
  // 這樣每次使用者下拉重整或進入頁面，都會立即抓取最新發布的版本！
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const cloned = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, cloned));
        }
        return networkResponse;
      })
      .catch(() => {
        // 網路離線或連線失敗時，才從快取讀取
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.destination === 'document') {
            return caches.match(new URL('./', BASE_PATH).href) || caches.match(new URL('index.html', BASE_PATH).href);
          }
        });
      })
  );
});

