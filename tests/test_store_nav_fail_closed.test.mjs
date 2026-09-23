"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeCosmeticUI } from "../cosmetic-ui.mjs";
import { storeEntryUrl, storeProductUrl } from "../cosmetic-store.mjs";

class StubElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this._textContent = "";
    this.disabled = false;
    this.type = "";
    this.className = "";
  }
  get textContent() { return this._textContent; }
  set textContent(value) {
    this._textContent = String(value);
    if (this._textContent === "") this.children = [];
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
    ["store-link-slot", new StubElement("p")],
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

function storeControl(documentRef) {
  return documentRef.elements.get("store-link-slot").children[0];
}

test("empty store origin does not build a self-link", () => {
  assert.equal(storeEntryUrl({ origin: "" }), "");
  assert.equal(storeProductUrl("actiontimer.skin.1", { origin: "" }), "");
  assert.equal(storeEntryUrl({ origin: "http://127.0.0.1:5173" }), "http://127.0.0.1:5173/index.html?source_app=actiontimer");
});

test("public hostname shows no catalog and a disabled store link", async () => {
  const documentRef = makeDocument();
  const locationRef = { href: "https://kichijitsu.example/", hostname: "kichijitsu.example", assigned: null, assign(value) { this.assigned = value; } };
  const store = {
    getEntitlements: () => [],
    getSelectedSkin: () => "free-default",
    tryOn() {},
    selectSkin() {},
    handleCheckoutReturn: () => ({ success: false, sessionId: null }),
    refreshEntitlements: async () => [],
    checkout: async () => { throw new Error("in-app checkout"); },
  };
  const ui = initializeCosmeticUI({ documentRef, locationRef, historyRef: { replaceState() {} }, store });
  await ui.startupRefresh;
  const control = storeControl(documentRef);
  assert.equal(documentRef.elements.get("skin-catalog").children.length, 0);
  assert.equal(control.textContent, "ストアを開く");
  assert.equal(control.tagName, "BUTTON");
  assert.equal(control.disabled, true);
  assert.equal(Object.hasOwn(control, "href"), false);
  control.dispatch("click", { preventDefault() {} });
  assert.equal(locationRef.assigned, null);
});

test("configured store origin links to the store and lists only owned items", async () => {
  const documentRef = makeDocument();
  const locationRef = { href: "http://127.0.0.1/", hostname: "127.0.0.1", assigned: null, assign(value) { this.assigned = value; } };
  const store = {
    getEntitlements: () => ["actiontimer.skin.1"],
    getSelectedSkin: () => "free-default",
    tryOn() {},
    selectSkin() {},
    handleCheckoutReturn: () => ({ success: false, sessionId: null }),
    refreshEntitlements: async () => ["actiontimer.skin.1"],
  };
  const ui = initializeCosmeticUI({ documentRef, locationRef, historyRef: { replaceState() {} }, store });
  await ui.startupRefresh;
  const catalog = documentRef.elements.get("skin-catalog");
  const control = storeControl(documentRef);
  assert.equal(catalog.children.length, 1);
  assert.equal(catalog.children[0].children[1].textContent, "朝焼け");
  assert.equal(catalog.textContent.includes("若葉"), false);
  assert.equal(catalog.textContent.includes("試着"), false);
  assert.equal(control.tagName, "A");
  assert.equal(control.textContent, "ストアを開く");
  assert.equal(control.href, "http://127.0.0.1:5173/index.html?source_app=actiontimer");
});
