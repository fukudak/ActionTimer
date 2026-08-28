"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const swSource = readFileSync(new URL("sw.js", root), "utf8");

const createServiceWorker = async ({ assets = {}, fetchImpl } = {}) => {
  const cache = new Map(Object.entries(assets));
  const listeners = new Map();
  const fetchCalls = [];
  const cacheStorage = {
    async open() {
      return {
        async addAll() {},
        async match(request) {
          return cache.get(new URL(request.url ?? request, "https://example.test/").href)?.clone();
        },
      };
    },
    async match(request) {
      return cache.get(new URL(request.url ?? request, "https://example.test/").href)?.clone();
    },
    async keys() {
      return ["kichijitsu-v24"];
    },
    async delete() {
      return true;
    },
  };
  const context = vm.createContext({
    URL,
    Request,
    Response,
    Promise,
    console,
    caches: cacheStorage,
    fetch: async (request) => {
      fetchCalls.push(request);
      if (fetchImpl) return fetchImpl(request);
      throw new Error("offline");
    },
    self: {
      location: new URL("https://example.test/"),
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      skipWaiting() {},
      clients: { claim: async () => {} },
    },
  });
  vm.runInContext(swSource, context);

  const dispatchFetch = async (url, init = {}) => {
    let responsePromise;
    let respondWithCalled = false;
    listeners.get("fetch")({
      request: {
        url: new URL(url, "https://example.test/").href,
        method: init.method ?? "GET",
        mode: init.mode ?? "cors",
      },
      respondWith(promise) {
        respondWithCalled = true;
        responsePromise = promise;
      },
    });
    return {
      response: responsePromise === undefined ? undefined : await responsePromise,
      respondWithCalled,
    };
  };

  return { dispatchFetch, fetchCalls };
};

const cachedResponse = (body, init = {}) => new Response(body, { status: 200, ...init });

const cacheAssets = {
  "https://example.test/": cachedResponse("<main>吉日タイマー</main>"),
  "https://example.test/about.html": cachedResponse("<main>思い立ったことに72時間の区切りをつける</main>"),
  "https://example.test/index.html": cachedResponse("<main>吉日タイマー</main>"),
  "https://example.test/app.js": cachedResponse("console.log('cached')"),
};

test("オフラインの/aboutナビゲーションはプリキャッシュ済みLPを返す", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const { response } = await dispatchFetch("/about", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("オフラインの/about/ナビゲーションもLPへ正規化する", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const { response } = await dispatchFetch("/about/", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("オフラインのルートナビゲーションはアプリを返す", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const { response } = await dispatchFetch("/", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /吉日タイマー/);
});

test("同一origin以外のナビゲーションは既存の503契約を維持する", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const { response } = await dispatchFetch("https://other.example/about", { mode: "navigate" });

  assert.equal(response.status, 503);
});

test("通常アセットのcache hitではfetchしない", async () => {
  const { dispatchFetch, fetchCalls } = await createServiceWorker({ assets: cacheAssets });

  const { response } = await dispatchFetch("/app.js");

  assert.equal(response.status, 200);
  assert.equal(fetchCalls.length, 0);
});

test("cache missではnetwork responseを返す", async () => {
  const networkResponse = new Response("network", { status: 201 });
  const { dispatchFetch, fetchCalls } = await createServiceWorker({
    fetchImpl: async () => networkResponse,
  });

  const { response } = await dispatchFetch("/uncached.js");

  assert.equal(response.status, 201);
  assert.equal(await response.text(), "network");
  assert.equal(fetchCalls.length, 1);
});

test("cache missとfetch失敗では503本文とContent-Typeを返す", async () => {
  const { dispatchFetch } = await createServiceWorker({
    fetchImpl: async () => { throw new Error("network down"); },
  });

  const { response } = await dispatchFetch("/uncached.js");

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.match(await response.text(), /^オフラインのため読み込めません。/);
});

test("GET以外ではrespondWithしない", async () => {
  const { dispatchFetch, fetchCalls } = await createServiceWorker({ assets: cacheAssets });

  const result = await dispatchFetch("/", { method: "POST" });

  assert.equal(result.respondWithCalled, false);
  assert.equal(result.response, undefined);
  assert.equal(fetchCalls.length, 0);
});

test("same-originの/about非navigateはリクエストを正規化しない", async () => {
  let requestedURL;
  const { dispatchFetch } = await createServiceWorker({
    assets: { "https://example.test/about.html": cachedResponse("cached about") },
    fetchImpl: async (request) => {
      requestedURL = request.url;
      return new Response("network about");
    },
  });

  const { response } = await dispatchFetch("/about");

  assert.equal(requestedURL, "https://example.test/about");
  assert.equal(await response.text(), "network about");
});

test("外部originのcached responseはそのまま返す", async () => {
  const external = cachedResponse("external", {
    status: 202,
    headers: { "X-Source": "cache" },
  });
  const { dispatchFetch, fetchCalls } = await createServiceWorker({
    assets: { "https://other.example/data": external },
  });

  const { response } = await dispatchFetch("https://other.example/data");

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("X-Source"), "cache");
  assert.equal(await response.text(), "external");
  assert.equal(fetchCalls.length, 0);
});
