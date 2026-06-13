"use strict";

// 更新時は必ずバージョンを上げること(CLAUDE.md Failure Modes 参照)
const CACHE_VERSION = "kichijitsu-v5";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 旧バージョンのキャッシュを削除する
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // キャッシュ優先、なければネットワーク。両方失敗したら日本語の503を返す
  event.respondWith(
    caches
      .match(event.request)
      .then((cached) => cached || fetch(event.request))
      .catch(() =>
        new Response(
          "オフラインのため読み込めません。接続を回復してから再読み込みしてください。",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        )
      )
  );
});
