"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, STORAGE_KEYS, createCosmeticStore, createFetchBillingClient, isLocalHost, resolveDefaultBaseUrl, createDefaultBillingClient, resolveDefaultStoreOrigin, storeProductUrl } from "../cosmetic-store.mjs";

function memoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), dump: () => Object.fromEntries(data) };
}

function makeStore(options = {}) {
  return createCosmeticStore({ storage: memoryStorage(), deviceId: "device-test", ...options });
}

test("catalog contains exactly two ActionTimer skins and no local price table", () => {
  assert.deepEqual(CATALOG.map(({ id, name }) => ({ id, name })), [
    { id: "actiontimer.skin.1", name: "朝焼け" },
    { id: "actiontimer.skin.2", name: "若葉" },
  ]);
  assert.equal("priceYen" in CATALOG[0], false);
  assert.equal("priceYen" in CATALOG[1], false);
});

test("try-on changes the active preview but is not persisted", () => {
  const storage = memoryStorage();
  const first = createCosmeticStore({ storage, deviceId: "device-test" });
  first.tryOn("actiontimer.skin.1");
  assert.equal(first.getSelectedSkin(), "actiontimer.skin.1");
  const second = createCosmeticStore({ storage, deviceId: "device-test" });
  assert.equal(second.getSelectedSkin(), "free-default");
  assert.equal(storage.getItem(STORAGE_KEYS.selectedSkin), null);
});

test("only an entitled skin can persist as selected", () => {
  const storage = memoryStorage();
  const store = createCosmeticStore({ storage, deviceId: "device-test" });
  store.selectSkin("actiontimer.skin.1");
  assert.equal(storage.getItem(STORAGE_KEYS.selectedSkin), null);
  store.applyEntitlements({ products: ["actiontimer.skin.1"] });
  store.selectSkin("actiontimer.skin.1");
  assert.equal(storage.getItem(STORAGE_KEYS.selectedSkin), "actiontimer.skin.1");
});

test("success URL alone does not unlock a skin", () => {
  const store = makeStore();
  const result = store.handleCheckoutReturn(new URL("https://example.test/?checkout=success&session_id=session-1"));
  assert.deepEqual(result, { success: true, sessionId: "session-1" });
  assert.deepEqual(store.getEntitlements(), []);
});

test("checkout return without a success status never confirms a purchase", () => {
  const store = makeStore();
  const result = store.handleCheckoutReturn(new URL("https://example.test/?checkout=cancel&session_id=session-1"));
  assert.deepEqual(result, { success: false, sessionId: null });
  assert.deepEqual(store.getEntitlements(), []);
});

test("purchase code is returned once only after matching entitlement", async () => {
  let calls = 0;
  const store = makeStore({ billingClient: { confirmPurchase: async () => { calls += 1; return { product: "actiontimer.skin.1", code: "ABCD-EFGH" }; } } });
  assert.equal(await store.confirmPurchaseCode("purchase-1", "actiontimer.skin.1"), null);
  store.applyEntitlements({ products: ["actiontimer.skin.1"] });
  assert.equal(await store.confirmPurchaseCode("purchase-1", "actiontimer.skin.1"), "ABCD-EFGH");
  assert.equal(await store.confirmPurchaseCode("purchase-1", "actiontimer.skin.1"), null);
  assert.equal(calls, 1);
});

test("products unlock and empty products expire cached entitlements", () => {
  const store = makeStore();
  store.applyEntitlements({ products: ["actiontimer.skin.2"] });
  assert.deepEqual(store.getEntitlements(), ["actiontimer.skin.2"]);
  store.applyEntitlements({ products: [] });
  assert.deepEqual(store.getEntitlements(), []);
});

test("refreshEntitlements pulls products from the injected billing client", async () => {
  let calledWith = null;
  const store = makeStore({
    billingClient: { getEntitlements: async (deviceId) => { calledWith = deviceId; return { products: ["actiontimer.skin.1"] }; } },
  });
  const result = await store.refreshEntitlements();
  assert.equal(calledWith, "device-test");
  assert.deepEqual(result, ["actiontimer.skin.1"]);
  assert.deepEqual(store.getEntitlements(), ["actiontimer.skin.1"]);
});

test("refreshEntitlements with empty products clears cached entitlements and an unauthorized selected skin", async () => {
  const storage = memoryStorage();
  let products = ["actiontimer.skin.1"];
  const store = createCosmeticStore({ storage, deviceId: "device-test", billingClient: { getEntitlements: async () => ({ products }) } });
  await store.refreshEntitlements();
  store.selectSkin("actiontimer.skin.1");
  assert.equal(storage.getItem(STORAGE_KEYS.selectedSkin), "actiontimer.skin.1");
  products = [];
  await store.refreshEntitlements();
  assert.deepEqual(store.getEntitlements(), []);
  assert.equal(store.getSelectedSkin(), "free-default");
  assert.equal(storage.getItem(STORAGE_KEYS.selectedSkin), null);
});

test("refreshEntitlements without a configured billing client is a no-op", async () => {
  const store = makeStore();
  const result = await store.refreshEntitlements();
  assert.deepEqual(result, []);
});

test("device, entitlement, and selected-skin keys stay separate from timer data", () => {
  const storage = memoryStorage({ "kichijitsu-timer-v1": JSON.stringify({ pending: [], unexploded: [], history: [] }) });
  const store = createCosmeticStore({ storage, deviceId: "device-test" });
  assert.equal(store.getDeviceId(), "device-test");
  assert.notEqual(STORAGE_KEYS.deviceId, "kichijitsu-timer-v1");
  assert.notEqual(STORAGE_KEYS.entitlements, "kichijitsu-timer-v1");
  assert.notEqual(STORAGE_KEYS.selectedSkin, "kichijitsu-timer-v1");
  assert.equal(storage.getItem("kichijitsu-timer-v1"), JSON.stringify({ pending: [], unexploded: [], history: [] }));
});

test("billing checkout posts only offer_id and device_id with app_id ActionTimer", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ checkout_url: "https://checkout.test" }) }; }, "https://billing.test");
  await client.createCheckout("actiontimer.skin.1", "device-test");
  assert.equal(calls[0].url, "https://billing.test/v1/checkout");
  assert.deepEqual(JSON.parse(calls[0].init.body), { offer_id: "actiontimer.skin.1", device_id: "device-test" });
  assert.equal(calls[0].init.headers["X-App-Id"], "actiontimer");
});

test("billing client fetches the purchase code with GET, not POST", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ product: "actiontimer.skin.1", code: "ABCD-EFGH" }) }; }, "https://billing.test");
  await client.confirmPurchase("purchase-1", "device-test");
  assert.equal(calls[0].url, "https://billing.test/v1/purchases/purchase-1/code?device_id=device-test");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
});

test("billing client requests entitlements with app_id and device_id", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ products: [] }) }; }, "https://billing.test");
  await client.getEntitlements("device-test");
  assert.equal(calls[0].url, "https://billing.test/v1/entitlements?app_id=actiontimer&device_id=device-test");
});


test("billing client fetches checkout success by session_id", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ purchase_id: "purchase-1" }) }; }, "https://billing.test");
  await client.getCheckoutSuccess("session-1");
  assert.equal(calls[0].url, "https://billing.test/v1/checkout/success?session_id=session-1");
  assert.equal(calls[0].init, undefined);
});

test("restore posts the ActionTimer payload", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ products: ["actiontimer.skin.1"] }) }; }, "https://billing.test");
  await client.restore("device-test", "ABCD-EFGH");
  assert.equal(calls[0].url, "https://billing.test/v1/restore");
  assert.deepEqual(JSON.parse(calls[0].init.body), { app_id: "actiontimer", device_id: "device-test", code: "ABCD-EFGH" });
});

test("isLocalHost is true only for localhost and 127.0.0.1 hostnames", () => {
  assert.equal(isLocalHost({ hostname: "localhost" }), true);
  assert.equal(isLocalHost({ hostname: "127.0.0.1" }), true);
  assert.equal(isLocalHost({ hostname: "example.com" }), false);
  assert.equal(isLocalHost({ hostname: "" }), false);
  assert.equal(isLocalHost(undefined), false);
});

test("resolveDefaultBaseUrl defaults to the local fake worker only on localhost or 127.0.0.1", () => {
  assert.equal(resolveDefaultBaseUrl({ hostname: "localhost" }), "http://127.0.0.1:8787");
  assert.equal(resolveDefaultBaseUrl({ hostname: "127.0.0.1" }), "http://127.0.0.1:8787");
  assert.equal(resolveDefaultBaseUrl({ hostname: "actiontimer.example.com" }), "");
  assert.equal(resolveDefaultBaseUrl({ hostname: "" }), "");
  assert.equal(resolveDefaultBaseUrl(undefined), "");
});

test("createDefaultBillingClient is null off localhost so billing calls are skipped gracefully", () => {
  assert.equal(createDefaultBillingClient({ hostname: "actiontimer.example.com" }), null);
  assert.equal(createDefaultBillingClient({ hostname: "" }), null);
  assert.equal(createDefaultBillingClient(undefined), null);
});

test("createDefaultBillingClient on localhost targets the local fake worker", async () => {
  const calls = [];
  const fetchStub = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ checkout_url: "http://127.0.0.1:8787/checkout" }) }; };
  const client = createDefaultBillingClient({ hostname: "localhost" }, fetchStub);
  assert.notEqual(client, null);
  await client.createCheckout("actiontimer.skin.1", "device-test");
  assert.equal(calls[0].url, "http://127.0.0.1:8787/v1/checkout");
});

test("billing client posts fake complete with purchase_id and device_id", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ status: "completed" }) }; }, "https://billing.test");
  await client.fakeComplete("purchase-1", "device-test");
  assert.equal(calls[0].url, "https://billing.test/v1/fake/complete");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].init.body), { purchase_id: "purchase-1", device_id: "device-test" });
});

test("createFetchBillingClient with an empty base URL skips billing calls gracefully instead of fetching a relative path", async () => {
  const calls = [];
  const client = createFetchBillingClient(async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({}) }; }, "");
  assert.equal(await client.createCheckout("actiontimer.skin.1", "device-test"), null);
  assert.equal(await client.getEntitlements("device-test"), null);
  assert.equal(await client.getCheckoutSuccess("session-1"), null);
  assert.equal(await client.confirmPurchase("purchase-1", "device-test"), null);
  assert.equal(await client.restore("device-test", "ABCD-EFGH"), null);
  assert.equal(await client.fakeComplete("purchase-1", "device-test"), null);
  assert.deepEqual(calls, []);
});

test("store.fakeCompletePurchase is a graceful no-op without a configured billing client", async () => {
  const store = makeStore();
  assert.equal(await store.fakeCompletePurchase("purchase-1"), null);
});

test("store.fakeCompletePurchase delegates to the billing client with the device id", async () => {
  let calledWith = null;
  const store = makeStore({ billingClient: { fakeComplete: async (purchaseId, deviceId) => { calledWith = { purchaseId, deviceId }; return { status: "completed" }; } } });
  const result = await store.fakeCompletePurchase("purchase-1");
  assert.deepEqual(calledWith, { purchaseId: "purchase-1", deviceId: "device-test" });
  assert.deepEqual(result, { status: "completed" });
});

test("store product URLs keep source_app and offer id out of secrets", () => {
  const url = storeProductUrl("actiontimer.skin.1", { origin: "http://127.0.0.1:5173" });
  assert.equal(url, "http://127.0.0.1:5173/index.html?source_app=actiontimer#/products/actiontimer.skin.1");
  assert.equal(url.includes("device"), false);
  assert.equal(url.includes("token"), false);
  assert.equal(url.includes("code"), false);
  assert.equal(storeProductUrl("unknown.skin"), "");
  assert.equal(resolveDefaultStoreOrigin({ hostname: "localhost" }), "http://127.0.0.1:5173");
  assert.equal(resolveDefaultStoreOrigin({ hostname: "kichijitsu.example" }), "");
});
