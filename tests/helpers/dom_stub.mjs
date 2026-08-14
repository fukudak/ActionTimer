"use strict";

// テスト用の最小DOMスタブ。
// app.jsはブラウザ前提のスクリプトなので、vmで隔離されたコンテキストに
// document / localStorage / タイマー等の偽物を与えて読み込む。
// 偽Dateで現在時刻を、捕捉したsetTimeout/setIntervalで時間経過を制御できる。

import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "app.js"
);

// className文字列を集合として操作する(本物のclassListの代替)
class FakeClassList {
  constructor(el) {
    this.el = el;
  }
  _set() {
    return new Set(this.el.className.split(/\s+/).filter(Boolean));
  }
  _save(s) {
    this.el.className = [...s].join(" ");
  }
  add(c) {
    const s = this._set();
    s.add(c);
    this._save(s);
  }
  remove(c) {
    const s = this._set();
    s.delete(c);
    this._save(s);
  }
  toggle(c, force) {
    const s = this._set();
    const on = force !== undefined ? force : !s.has(c);
    if (on) s.add(c);
    else s.delete(c);
    this._save(s);
    return on;
  }
  contains(c) {
    return this._set().has(c);
  }
}

export class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.className = "";
    this.dataset = {};
    this.attributes = {};
    this.style = {
      setProperty: (k, v) => { this.style[k] = String(v); },
      getPropertyValue: (k) => this.style[k] ?? "",
    };
    this.hidden = false;
    this._textContent = "";
    this.value = "";
    this.id = "";
    this.tabIndex = 0;
    this._listeners = {};
    this.classList = new FakeClassList(this);
  }

  setAttribute(k, v) {
    if (k === "class") this.className = String(v);
    else {
      this.attributes[k] = String(v);
      if (k === "tabindex") this.tabIndex = Number(v);
    }
  }

  getAttribute(k) {
    if (k === "class") return this.className;
    return k in this.attributes ? this.attributes[k] : null;
  }

  appendChild(c) {
    c.parent = this;
    this.children.push(c);
    return c;
  }

  append(...cs) {
    for (const c of cs) this.appendChild(c);
  }

  remove() {
    if (!this.parent) return;
    const i = this.parent.children.indexOf(this);
    if (i >= 0) this.parent.children.splice(i, 1);
    this.parent = null;
  }

  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }

  // テストからイベント発火を模倣する
  dispatch(type, event = {}) {
    event.preventDefault ||= () => {};
    for (const fn of this._listeners[type] || []) fn(event);
  }

  click() {
    this.dispatch("click");
  }

  focus() {}

  get textContent() {
    return this._textContent;
  }

  // 実DOMと同じく、textContentへの代入は既存の子要素を全て消す
  set textContent(v) {
    this._textContent = String(v);
    this.children = [];
  }


  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }

  querySelectorAll(sel) {
    const found = [];
    const matches = (el) =>
      sel.startsWith(".")
        ? el.classList.contains(sel.slice(1))
        : el.tagName === sel.toUpperCase();
    const walk = (el) => {
      for (const c of el.children) {
        if (matches(c)) found.push(c);
        walk(c);
      }
    };
    walk(this);
    return found;
  }

}

// index.htmlに存在するID要素を持つdocumentスタブを作る
function createDocument() {
  const ids = {};
  const created = [];
  const inputIds = new Set(["add-input"]);
  for (const id of [
    "burning-list",
    "unexploded-list",
    "history-list",
    "burning-empty",
    "unexploded-empty",
    "history-empty",
    "history-summary",
    "burning-heading",
    "unexploded-heading",
    "history-heading",
    "save-error",
    "add-form",
    "add-input",
    "ui-status",
  ]) {
    ids[id] = new FakeElement(inputIds.has(id) ? "input" : "div");
    if (id === "burning-heading" || id === "unexploded-heading" || id === "history-heading") ids[id].setAttribute("tabindex", "-1");
  }

  // 実DOM同様、appendChild自体はクリックを発火しない。
  const body = new FakeElement("body");

  return {
    getElementById: (id) => ids[id] ?? null,
    createElement: (tag) => {
      const element = new FakeElement(tag);
      created.push(element);
      return element;
    },
    createElementNS: (_ns, tag) => new FakeElement(tag),
    addEventListener() {},
    body,
    _ids: ids,
    _created: created,
  };
}

export function createLocalStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
    _map: map,
  };
}

// app.jsを隔離コンテキストへ読み込み、操作用ハンドルを返す。
// options.now: 起動時刻 / options.storage: 既存ストレージの再利用(再起動の模倣)
export function loadApp(options = {}) {
  const doc = createDocument();
  const storage = options.storage ?? createLocalStorage();
  let fakeNow = options.now ?? Date.now();
  const timeouts = [];
  const intervals = [];

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fakeNow]));
    }

    static now() {
      return fakeNow;
    }
  }


  const ctx = {
    document: doc,
    localStorage: storage,
    crypto: globalThis.crypto,
    // serviceWorkerプロパティ無し+非httpプロトコルでSW登録は実行されない
    navigator: {},
    location: { protocol: "test:" },
    console,
    Date: FakeDate,
    setTimeout: (fn, ms) => timeouts.push({ fn, ms }),
    setInterval: (fn, ms) => { const id = intervals.length + 1; intervals.push({ fn, ms, id }); return id; },
    clearInterval: (id) => {
      const idx = intervals.findIndex((i) => i.id === id);
      if (idx >= 0) intervals.splice(idx, 1);
    },
    confirm: options.confirm ?? (() => true),
  };

  vm.runInNewContext(readFileSync(APP_PATH, "utf8"), ctx, {
    filename: "app.js",
  });

  return {
    // 関数宣言はコンテキストのグローバルになるため、ctx経由で直接呼べる
    ctx,
    doc,
    storage,
    timeouts,
    intervals,
    setNow(t) {
      fakeNow = t;
    },
    advance(ms) {
      fakeNow += ms;
    },
    // 捕捉済みのsetTimeoutコールバックを全て実行する(燃え尽き処理の進行用)
    flushTimeouts() {
      const pending = timeouts.splice(0);
      for (const t of pending) t.fn();
    },
    // 保存済みデータをオブジェクトとして読む
    readStorage() {
      const raw = storage.getItem("kichijitsu-timer-v1");
      return raw === null ? null : JSON.parse(raw);
    },
    // UI操作ヘルパ: 登録フォームから点火する
    submitAdd(text) {
      doc._ids["add-input"].value = text;
      doc._ids["add-form"].dispatch("submit");
    },
    burningCards() {
      return doc._ids["burning-list"].children;
    },

    unexplodedCards() {
      return doc._ids["unexploded-list"].children;
    },

    historyCards() {
      return doc._ids["history-list"].children;
    },
  };
}
