"use strict";

export const STORAGE_KEYS = Object.freeze({
  deviceId: "actiontimer-device-id",
  entitlements: "actiontimer-entitlements-v1",
  selectedSkin: "actiontimer-selected-skin-v1",
});

export const FREE_SKIN_ID = "free-default";
export const CATALOG = Object.freeze([
  Object.freeze({ id: "actiontimer.skin.1", name: "朝焼け", color: "#c54b37" }),
  Object.freeze({ id: "actiontimer.skin.2", name: "若葉", color: "#3c8064" }),
]);
const PRODUCT_IDS = new Set(CATALOG.map((product) => product.id));

function makeDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `device-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
function readProducts(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEYS.entitlements) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => PRODUCT_IDS.has(id)) : [];
  } catch { return []; }
}
function writeProducts(storage, products) { storage.setItem(STORAGE_KEYS.entitlements, JSON.stringify(products)); }

export function isLocalHost(locationRef) {
  const hostname = locationRef?.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function resolveDefaultBaseUrl(locationRef) {
  return isLocalHost(locationRef) ? "http://127.0.0.1:8787" : "";
}

export function resolveDefaultStoreOrigin(locationRef) {
  return isLocalHost(locationRef) ? "http://127.0.0.1:5173" : "";
}

export function storeProductUrl(offerId, { origin = "", sourceApp = "actiontimer" } = {}) {
  if (!PRODUCT_IDS.has(offerId)) return "";
  const query = `source_app=${encodeURIComponent(sourceApp)}`;
  const hash = `#/products/${encodeURIComponent(offerId)}`;
  if (!origin) return `index.html?${query}${hash}`;
  return `${String(origin).replace(/\/$/, "")}/index.html?${query}${hash}`;
}

export function createDefaultBillingClient(locationRef, fetchImpl = globalThis.fetch) {
  const baseUrl = resolveDefaultBaseUrl(locationRef);
  return baseUrl ? createFetchBillingClient(fetchImpl, baseUrl) : null;
}

export function createFetchBillingClient(fetchImpl = globalThis.fetch, baseUrl = resolveDefaultBaseUrl(typeof location !== "undefined" ? location : undefined)) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");
  if (!baseUrl) {
    return {
      async createCheckout() { return null; },
      async getEntitlements() { return null; },
      async getCheckoutSuccess() { return null; },
      async restore() { return null; },
      async confirmPurchase() { return null; },
      async fakeComplete() { return null; },
    };
  }
  return {
    async createCheckout(offerId, deviceId) {
      const response = await fetchImpl(`${baseUrl}/v1/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Id": "actiontimer" },
        body: JSON.stringify({ offer_id: offerId, device_id: deviceId }),
      });
      if (!response.ok) throw new Error(`checkout failed: ${response.status}`);
      return response.json();
    },
    async getEntitlements(deviceId) {
      const response = await fetchImpl(`${baseUrl}/v1/entitlements?app_id=actiontimer&device_id=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`entitlements failed: ${response.status}`);
      return response.json();
    },
    async getCheckoutSuccess(sessionId) {
      const response = await fetchImpl(`${baseUrl}/v1/checkout/success?session_id=${encodeURIComponent(sessionId)}`);
      if (!response.ok) throw new Error(`checkout success failed: ${response.status}`);
      return response.json();
    },
    async restore(deviceId, code) {
      const response = await fetchImpl(`${baseUrl}/v1/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Id": "actiontimer" },
        body: JSON.stringify({ app_id: "actiontimer", device_id: deviceId, code }),
      });
      if (!response.ok) throw new Error(`restore failed: ${response.status}`);
      return response.json();
    },
    async confirmPurchase(purchaseId, deviceId) {
      const response = await fetchImpl(`${baseUrl}/v1/purchases/${encodeURIComponent(purchaseId)}/code?device_id=${encodeURIComponent(deviceId)}`, { method: "GET" });
      if (!response.ok) throw new Error(`purchase confirmation failed: ${response.status}`);
      return response.json();
    },
    async fakeComplete(purchaseId, deviceId) {
      const response = await fetchImpl(`${baseUrl}/v1/fake/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-App-Id": "actiontimer" },
        body: JSON.stringify({ purchase_id: purchaseId, device_id: deviceId }),
      });
      if (!response.ok) throw new Error(`fake complete failed: ${response.status}`);
      return response.json();
    },
  };
}

export function createCosmeticStore({ storage = globalThis.localStorage, billingClient = null, deviceId } = {}) {
  if (!storage) throw new TypeError("storage is required");
  let currentDeviceId = deviceId || storage.getItem(STORAGE_KEYS.deviceId) || makeDeviceId();
  storage.setItem(STORAGE_KEYS.deviceId, currentDeviceId);
  let entitlements = readProducts(storage);
  let selected = storage.getItem(STORAGE_KEYS.selectedSkin);
  if (selected !== FREE_SKIN_ID && !PRODUCT_IDS.has(selected)) selected = FREE_SKIN_ID;
  if (selected !== FREE_SKIN_ID && !entitlements.includes(selected)) {
    selected = FREE_SKIN_ID;
    storage.removeItem(STORAGE_KEYS.selectedSkin);
  }
  let preview = null;
  const shownCodes = new Set();

  const api = {
    getDeviceId: () => currentDeviceId,
    getEntitlements: () => [...entitlements],
    getSelectedSkin: () => preview || selected,
    tryOn: (id) => { if (PRODUCT_IDS.has(id)) preview = id; return api.getSelectedSkin(); },
    selectSkin: (id) => {
      if (id === FREE_SKIN_ID) { preview = null; selected = FREE_SKIN_ID; storage.removeItem(STORAGE_KEYS.selectedSkin); return selected; }
      if (!entitlements.includes(id)) return api.tryOn(id);
      preview = null; selected = id; storage.setItem(STORAGE_KEYS.selectedSkin, id); return selected;
    },
    applyEntitlements: (response) => {
      entitlements = Array.isArray(response?.products) ? response.products.filter((id) => PRODUCT_IDS.has(id)) : [];
      writeProducts(storage, entitlements);
      if (selected !== FREE_SKIN_ID && !entitlements.includes(selected)) {
        selected = FREE_SKIN_ID;
        storage.removeItem(STORAGE_KEYS.selectedSkin);
      }
      return api.getEntitlements();
    },
    refreshEntitlements: async () => {
      if (!billingClient?.getEntitlements) return api.getEntitlements();
      const response = await billingClient.getEntitlements(currentDeviceId);
      return api.applyEntitlements(response);
    },
    handleCheckoutReturn: (url) => {
      const params = url?.searchParams;
      const status = params?.get ? params.get("checkout") : null;
      const sessionId = params?.get ? params.get("session_id") : null;
      if (status === "success" && sessionId) return { success: true, sessionId };
      return { success: false, sessionId: null };
    },
    confirmCheckoutSuccess: async (sessionId) => {
      if (!billingClient?.getCheckoutSuccess || !sessionId) return null;
      return billingClient.getCheckoutSuccess(sessionId);
    },
    checkout: (id) => {
      if (!billingClient?.createCheckout || !PRODUCT_IDS.has(id)) throw new Error("billing client is not configured");
      return billingClient.createCheckout(id, currentDeviceId);
    },
    fakeCompletePurchase: async (purchaseId) => {
      if (!billingClient?.fakeComplete) return null;
      return billingClient.fakeComplete(purchaseId, currentDeviceId);
    },
    confirmPurchaseCode: async (purchaseId, productId) => {
      if (!purchaseId || !productId || !entitlements.includes(productId) || shownCodes.has(purchaseId) || !billingClient?.confirmPurchase) return null;
      const result = await billingClient.confirmPurchase(purchaseId, currentDeviceId);
      shownCodes.add(purchaseId);
      return result?.code || null;
    },
    restore: async (code) => {
      if (!billingClient?.restore) return null;
      const response = await billingClient.restore(currentDeviceId, code);
      return api.applyEntitlements(response);
    },
  };
  return api;
}
