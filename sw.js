"use strict";

// 更新時は必ずバージョンを上げること(CLAUDE.md Failure Modes 参照)
const CACHE_VERSION = "kichijitsu-v26";

const ASSETS = [
  "./",
  "./index.html",
  "./about.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const ABOUT_ASSET = "./about.html";
const ABOUT_CANONICAL = "./about";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(ASSETS.filter((asset) => asset !== ABOUT_ASSET));

      const aboutResponse = await fetch(new URL(ABOUT_ASSET, self.location));
      if (!aboutResponse.ok) throw new Error(`asset fetch failed: ${ABOUT_ASSET}`);
      const aboutBody = await aboutResponse.arrayBuffer();
      const buildAboutResponse = () => new Response(aboutBody, {
        status: aboutResponse.status,
        statusText: aboutResponse.statusText,
        headers: aboutResponse.headers,
      });
      await cache.put(new URL(ABOUT_ASSET, self.location), buildAboutResponse());
      await cache.put(new URL(ABOUT_CANONICAL, self.location), buildAboutResponse());
    })
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
  const requestURL = new URL(event.request.url);
  const isAboutNavigation =
    event.request.mode === "navigate" &&
    requestURL.origin === self.location.origin &&
    (requestURL.pathname === "/about" || requestURL.pathname === "/about/");
  const cacheRequest = isAboutNavigation
    ? new Request(new URL(ABOUT_CANONICAL, self.location))
    : event.request;
  event.respondWith(
    caches
      .match(cacheRequest)
      .then((cached) => cached || fetch(event.request))
      .catch(() =>
        new Response(
          "オフラインのため読み込めません。接続を回復してから再読み込みしてください。",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
        )
      )
  );
});
