"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("..", import.meta.url);
const swSource = readFileSync(new URL("sw.js", root), "utf8");

const createServiceWorker = async ({ assets = {} } = {}) => {
  const cache = new Map(Object.entries(assets));
  const listeners = new Map();
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
    fetch: async () => {
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
    listeners.get("fetch")({
      request: {
        url: new URL(url, "https://example.test/").href,
        method: init.method ?? "GET",
        mode: init.mode ?? "cors",
      },
      respondWith(promise) {
        responsePromise = promise;
      },
    });
    return responsePromise;
  };

  return { dispatchFetch };
};

const cachedResponse = (body) => new Response(body, { status: 200 });

const cacheAssets = {
  "https://example.test/": cachedResponse("<main>吉日タイマー</main>"),
  "https://example.test/about.html": cachedResponse("<main>思い立ったことに72時間の区切りをつける</main>"),
  "https://example.test/index.html": cachedResponse("<main>吉日タイマー</main>"),
};

test("オフラインの/aboutナビゲーションはプリキャッシュ済みLPを返す", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const response = await dispatchFetch("/about", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("オフラインの/about/ナビゲーションもLPへ正規化する", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const response = await dispatchFetch("/about/", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /思い立ったことに72時間の区切りをつける/);
});

test("オフラインのルートナビゲーションはアプリを返す", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const response = await dispatchFetch("/", { mode: "navigate" });

  assert.equal(response.status, 200);
  assert.match(await response.text(), /吉日タイマー/);
});

test("同一origin以外のナビゲーションは既存の503契約を維持する", async () => {
  const { dispatchFetch } = await createServiceWorker({ assets: cacheAssets });

  const response = await dispatchFetch("https://other.example/about", { mode: "navigate" });

  assert.equal(response.status, 503);
});
