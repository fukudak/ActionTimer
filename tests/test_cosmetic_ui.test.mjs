"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeCosmeticUI } from "../cosmetic-ui.mjs";
import { createCosmeticStore } from "../cosmetic-store.mjs";

class StubElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = { setProperty: (key, value) => { this.style[key] = String(value); }, removeProperty: (key) => { delete this.style[key]; } };
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.type = "";
  }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); }
  setAttribute() {}
}

function makeDocument() {
  const elements = new Map([
    ["skin-store-status", new StubElement()],
    ["skin-catalog", new StubElement("ul")],
    ["skin-restore-form", new StubElement("form")],
    ["skin-restore-code", new StubElement("input")],
  ]);
  return {
    getElementById: (id) => elements.get(id) ?? null,
    createElement: (tag) => new StubElement(tag),
    documentElement: new StubElement("html"),
    elements,
  };
}

function makeLocation(query, host = "example.test") {
  const url = new URL(`https://${host}/${query}`);
  return { href: url.href, hostname: url.hostname, assigned: null, assign(value) { this.assigned = value; } };
}

function makeStore({ success = null, products = [] } = {}) {
  let entitlements = [];
  const calls = [];
  return {
    calls,
    getEntitlements: () => [...entitlements],
    getSelectedSkin: () => "free-default",
    tryOn() {},
    selectSkin() {},
    checkout: async () => null,
    refreshEntitlements: async () => { calls.push({ name: "refresh", products }); entitlements = [...products]; return entitlements; },
    handleCheckoutReturn: (url) => {
      const status = url.searchParams.get("checkout");
      const sessionId = url.searchParams.get("session_id");
      return status === "success" && sessionId ? { success: true, sessionId } : { success: false, sessionId: null };
    },
    confirmCheckoutSuccess: async (sessionId) => { calls.push({ name: "success", sessionId }); return success; },
    confirmPurchaseCode: async (purchaseId, productId) => {
      calls.push({ name: "code", purchaseId, productId, entitled: entitlements.includes(productId) });
      return entitlements.includes(productId) ? "ABCD-EFGH" : null;
    },
    restore: async () => null,
  };
}

function makeBillingStore({ success, products }) {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  const calls = [];
  const billingClient = {
    getEntitlements: async () => { calls.push({ name: "refresh" }); return { products }; },
    getCheckoutSuccess: async (sessionId) => { calls.push({ name: "success", sessionId }); return success; },
    confirmPurchase: async (purchaseId, deviceId) => { calls.push({ name: "code", purchaseId, deviceId }); return { code: "ABCD-EFGH" }; },
  };
  return { store: createCosmeticStore({ storage, deviceId: "device-test", billingClient }), calls };
}

async function launch(query, store, host = "example.test") {
  const documentRef = makeDocument();
  const locationRef = makeLocation(query, host);
  const historyRef = { replaceState: (...args) => { historyRef.args = args; } };
  const ui = initializeCosmeticUI({ documentRef, locationRef, historyRef, store });
  await Promise.all([ui.startupRefresh, ui.checkoutReturn]);
  return { documentRef, locationRef, historyRef };
}

function makeBuyStore({ purchaseId = "purchase-1", checkoutUrl = "https://checkout.test", code = "ABCD-EFGH" } = {}) {
  let entitlements = [];
  const calls = [];
  return {
    calls,
    getEntitlements: () => [...entitlements],
    getSelectedSkin: () => "free-default",
    tryOn() {},
    selectSkin() {},
    handleCheckoutReturn: () => ({ success: false, sessionId: null }),
    confirmCheckoutSuccess: async () => null,
    checkout: async (productId) => { calls.push({ name: "checkout", productId }); return { checkout_url: checkoutUrl, purchase_id: purchaseId }; },
    fakeCompletePurchase: async (id) => { calls.push({ name: "fakeComplete", purchaseId: id }); return { status: "completed" }; },
    refreshEntitlements: async () => { calls.push({ name: "refresh" }); entitlements = [purchaseId ? "actiontimer.skin.1" : null].filter(Boolean); return [...entitlements]; },
    confirmPurchaseCode: async (id, productId) => { calls.push({ name: "code", purchaseId: id, productId }); return code; },
    restore: async () => null,
  };
}

function findBuyButton(documentRef, index = 0) {
  const catalog = documentRef.elements.get("skin-catalog");
  const card = catalog.children[index];
  const actions = card.children[card.children.length - 1];
  return actions.children[1];
}

test("normal UI startup refreshes entitlements through the injected store", async () => {
  const store = makeStore({ products: ["actiontimer.skin.1"] });
  await launch("", store);
  assert.deepEqual(store.calls, [{ name: "refresh", products: ["actiontimer.skin.1"] }]);
});

test("checkout return uses session_id, refreshes products, then confirms the entitled product", async () => {
  const { store, calls } = makeBillingStore({ success: { purchase_id: "purchase-1", product: "actiontimer.skin.1" }, products: ["actiontimer.skin.1"] });
  await launch("?checkout=success&session_id=session-123", store);
  assert.deepEqual(calls, [
    { name: "refresh" },
    { name: "success", sessionId: "session-123" },
    { name: "refresh" },
    { name: "code", purchaseId: "purchase-1", deviceId: "device-test" },
  ]);
});

test("checkout success URL alone and a mismatched product never call the purchase code API", async () => {
  const urlOnly = makeBillingStore({ success: { purchase_id: "purchase-1", product: "actiontimer.skin.1" }, products: ["actiontimer.skin.1"] });
  await launch("?session_id=session-123", urlOnly.store);
  assert.deepEqual(urlOnly.calls, [{ name: "refresh" }]);

  const mismatch = makeBillingStore({ success: { purchase_id: "purchase-2", product: "actiontimer.skin.2" }, products: ["actiontimer.skin.1"] });
  await launch("?checkout=success&session_id=session-456", mismatch.store);
  assert.deepEqual(mismatch.calls, [
    { name: "refresh" },
    { name: "success", sessionId: "session-456" },
    { name: "refresh" },
  ]);
});

test("on localhost, buying calls checkout then fake complete then refresh then shows the code once, without redirecting", async () => {
  const store = makeBuyStore({ purchaseId: "purchase-1", code: "ABCD-EFGH" });
  const { documentRef, locationRef } = await launch("", store, "localhost");
  const status = documentRef.elements.get("skin-store-status");
  const buy = findBuyButton(documentRef, 0);
  buy.dispatch("click");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(store.calls.slice(-4), [
    { name: "checkout", productId: "actiontimer.skin.1" },
    { name: "fakeComplete", purchaseId: "purchase-1" },
    { name: "refresh" },
    { name: "code", purchaseId: "purchase-1", productId: "actiontimer.skin.1" },
  ]);
  assert.equal(locationRef.assigned, null);
  assert.match(status.textContent, /ABCD-EFGH/);
});

test("off localhost, buying redirects to the checkout URL and never fake-completes", async () => {
  const store = makeBuyStore({ purchaseId: "purchase-1", checkoutUrl: "https://checkout.test/session" });
  const { documentRef, locationRef } = await launch("", store, "example.test");
  const buy = findBuyButton(documentRef, 0);
  buy.dispatch("click");
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(locationRef.assigned, "https://checkout.test/session");
  assert.equal(store.calls.some((c) => c.name === "fakeComplete"), false);
});
