"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const swSource = readFileSync(new URL("sw.js", root), "utf8");

const cachedResponse = (body, init = {}) => new Response(body, { status: 200, ...init });

// Cloudflare本番は ./about.html への直接fetchを /about へ301 redirectする。
// このヘルパーはその「redirectedフラグとurlが元のrequestと異なるResponse」を模倣する。
const redirectedAboutResponse = (
  body = "<main>思い立ったことに72時間の区切りをつける</main>"
) => {
  const response = new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(response, "redirected", { value: true, configurable: true });
  Object.defineProperty(response, "url", {
    value: "https://example.test/about",
    configurable: true,
  });
  return response;
};

const defaultNetworkAssets = () => ({
  "https://example.test/": cachedResponse("<main>吉日タイマー</main>"),
  "https://example.test/index.html": cachedResponse("<main>吉日タイマー</main>"),
  "https://example.test/about.html": cachedResponse(
    "<main>思い立ったことに72時間の区切りをつける</main>"
  ),
  "https://example.test/style.css": cachedResponse("/* css */"),
  "https://example.test/app.js": cachedResponse("console.log('cached')"),
  "https://example.test/manifest.webmanifest": cachedResponse("{}"),
  "https://example.test/icons/apple-touch-icon.png": cachedResponse("icon"),
  "https://example.test/icons/icon-192.png": cachedResponse("icon"),
  "https://example.test/icons/icon-512.png": cachedResponse("icon"),
});

// install/cache.addAll/cache.put/Response.redirectedの実挙動に忠実なフェイク。
// Cache本体はResponseオブジェクトをそのまま保持するのではなく、
// (status/headers/body/redirected/url) のレコードとして保存し、match()の都度
// 新しいResponseを組み立てて返す。これにより本物のCache APIと同様に
// 何度でも読み出せる一方、install時に保存されたredirected/urlフラグは
// 明示的にコピーしない限り消える(=sw.js側の再構築が本当に効いているかを検証できる)。
const createServiceWorker = async ({ network, fetchImpl } = {}) => {
  const networkAssets = { ...defaultNetworkAssets(), ...network };
  const store = new Map();
  const listeners = new Map();
  const fetchCalls = [];

  const resolveHref = (request) =>
    new URL(request.url ?? request, "https://example.test/").href;

  const doFetch = async (request) => {
    fetchCalls.push(request);
    const href = resolveHref(request);
    const asset = networkAssets[href];
    if (asset) return asset;
    if (fetchImpl) return fetchImpl(request);
    throw new Error("offline");
  };

  const toRecord = async (response) => ({
    status: response.status,
    statusText: response.statusText,
    headers: [...response.headers.entries()],
    body: await response.arrayBuffer(),
    redirected: response.redirected,
    url: response.url,
  });

  const fromRecord = (record) => {
    const response = new Response(record.body.slice(0), {
      status: record.status,
      statusText: record.statusText,
      headers: record.headers,
    });
    if (record.redirected) {
      Object.defineProperty(response, "redirected", { value: true, configurable: true });
    }
    if (record.url) {
      Object.defineProperty(response, "url", { value: record.url, configurable: true });
    }
    return response;
  };

  const cache = {
    async addAll(requests) {
      for (const req of requests) {
        const request = new Request(new URL(req, "https://example.test/"));
        const response = await doFetch(request);
        if (!response.ok) throw new Error(`addAll failed for ${req}`);
        store.set(resolveHref(request), await toRecord(response));
      }
    },
    async put(request, response) {
      store.set(resolveHref(request), await toRecord(response));
    },
    async match(request) {
      const record = store.get(resolveHref(request));
      return record ? fromRecord(record) : undefined;
    },
  };

  const cacheStorage = {
    async open() {
      return cache;
    },
    async match(request) {
      return cache.match(request);
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
    fetch: doFetch,
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

  let installError;
  await new Promise((resolve) => {
    listeners.get("install")({
      waitUntil(promise) {
        promise.then(resolve, (err) => {
          installError = err;
          resolve();
        });
      },
    });
  });

  // installで消費されたfetch呼び出しは、fetch event側の挙動検証から除外する。
  fetchCalls.length = 0;

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

  return { dispatchFetch, fetchCalls, installError, store };
};

test("オフラインの/aboutナビゲーションはプリキャッシュ済みLPを返す", async () => {
  const { dispatchFetch } = await createServiceWorker();

  const { response } = await dispatchFetch("/about", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("オフラインの/about/ナビゲーションもLPへ正規化する", async () => {
  const { dispatchFetch } = await createServiceWorker();

  const { response } = await dispatchFetch("/about/", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("オフラインのルートナビゲーションはアプリを返す", async () => {
  const { dispatchFetch } = await createServiceWorker();

  const { response } = await dispatchFetch("/", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /吉日タイマー/);
});

test("同一origin以外のナビゲーションは既存の503契約を維持する", async () => {
  const { dispatchFetch } = await createServiceWorker();

  const { response } = await dispatchFetch("https://other.example/about", { mode: "navigate" });

  assert.equal(response.status, 503);
});

test("通常アセットのcache hitではfetchしない", async () => {
  const { dispatchFetch, fetchCalls } = await createServiceWorker();

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
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });

  const { response } = await dispatchFetch("/uncached.js");

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.match(await response.text(), /^オフラインのため読み込めません。/);
});

test("GET以外ではrespondWithしない", async () => {
  const { dispatchFetch, fetchCalls } = await createServiceWorker();

  const result = await dispatchFetch("/", { method: "POST" });

  assert.equal(result.respondWithCalled, false);
  assert.equal(result.response, undefined);
  assert.equal(fetchCalls.length, 0);
});

test("同一originの/about非navigateは元のリクエストでnetwork fallbackする", async () => {
  let requestedURL;
  const { dispatchFetch } = await createServiceWorker({
    fetchImpl: async (request) => {
      requestedURL = request.url;
      return new Response("network about");
    },
  });

  const { response } = await dispatchFetch("/about?uncached");

  assert.equal(requestedURL, "https://example.test/about?uncached");
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "network about");
});

test("外部originのcache missはネットワークからそのまま返す", async () => {
  const external = cachedResponse("external", {
    status: 202,
    headers: { "X-Source": "cache" },
  });
  const { dispatchFetch, fetchCalls } = await createServiceWorker({
    network: { "https://other.example/data": external },
  });

  const { response } = await dispatchFetch("https://other.example/data");

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("X-Source"), "cache");
  assert.equal(await response.text(), "external");
  assert.equal(fetchCalls.length, 1);
});

test("本番Cloudflareのredirectを受けたLPはcanonical aliasとして非redirectで保存される", async () => {
  const { store } = await createServiceWorker({
    network: { "https://example.test/about.html": redirectedAboutResponse() },
  });

  const legacy = store.get("https://example.test/about.html");
  const canonical = store.get("https://example.test/about");
  assert.ok(legacy, "about.html entry must be cached");
  assert.ok(canonical, "canonical /about entry must be cached");
  assert.deepEqual(canonical, legacy);
  for (const entry of [legacy, canonical]) {
    assert.equal(entry.redirected, false);
    assert.equal(entry.url, "");
    assert.equal(entry.status, 200);
    assert.equal(entry.statusText, "");
    assert.equal(new TextDecoder().decode(entry.body), "<main>思い立ったことに72時間の区切りをつける</main>");
    const headers = new Headers(entry.headers);
    assert.equal(headers.get("Content-Type"), "text/html; charset=utf-8");
  }
});

test("redirectされたabout.html Responseでも/aboutナビゲーションはredirectedでない200本文を返す", async () => {
  const { dispatchFetch } = await createServiceWorker({
    network: { "https://example.test/about.html": redirectedAboutResponse() },
  });

  const { response } = await dispatchFetch("/about", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.equal(response.redirected, false);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("about.htmlの取得に失敗するとinstallはfail closedする", async () => {
  const { installError } = await createServiceWorker({
    network: { "https://example.test/about.html": undefined },
    fetchImpl: async (request) => {
      const href = request.url ?? request;
      if (href === "https://example.test/about.html") throw new Error("network down");
      throw new Error("offline");
    },
  });

  assert.ok(installError, "install must fail closed when about.html cannot be fetched");
});
