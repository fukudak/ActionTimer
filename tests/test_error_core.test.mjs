"use strict";

// 第3層: 異常系テスト(Error & Edge Cases)
// 破損データ・保存失敗・不正操作・特殊文字での挙動を検証する

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";

const STORAGE_KEY = "kichijitsu-timer-v1";
const T0 = new Date(2026, 5, 10, 9, 0).getTime();

// 任意の生文字列をストレージへ仕込む
function storageWithRaw(raw) {
  const storage = createLocalStorage();
  storage.setItem(STORAGE_KEY, raw);
  return storage;
}

// ---------- 入力データ異常(破損したlocalStorage) ----------

test("invalid_json_falls_back_to_initial_state", () => {
  // 不正なJSON("{{{")でもクラッシュせず初期状態で起動することを検証
  const app = loadApp({ now: T0, storage: storageWithRaw("{{{") });
  assert.equal(app.burningCards().length, 0);
  assert.equal(app.startedCards().length, 0);
});

test("json_null_falls_back_to_initial_state", () => {
  // JSONとしては正しいがnullの場合に初期状態で起動することを検証
  const app = loadApp({ now: T0, storage: storageWithRaw("null") });
  assert.equal(app.burningCards().length, 0);
});

test("json_number_falls_back_to_initial_state", () => {
  // 型の不一致(オブジェクトではなく数値)でも初期状態で起動することを検証
  const app = loadApp({ now: T0, storage: storageWithRaw("42") });
  assert.equal(app.burningCards().length, 0);
});

test("pending_as_object_is_treated_as_empty", () => {
  // pendingがリストではなく辞書({})の場合に空扱いになることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithRaw(JSON.stringify({ pending: {}, started: {} })),
  });
  assert.equal(app.burningCards().length, 0);
  assert.equal(app.startedCards().length, 0);
});

test("corrupt_pending_items_are_excluded_but_valid_ones_survive", () => {
  // 型の壊れた項目だけ除外され、正常な項目は生き残ることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithRaw(
      JSON.stringify({
        pending: [
          { id: "ok", title: "正常", createdAt: T0 },
          null,
          { id: 123, title: "idが数値", createdAt: T0 },
          { id: "no-date", title: "createdAt欠落" },
          { id: "bad-title", title: null, createdAt: T0 },
          { id: "str-date", title: "日付が文字列", createdAt: "きのう" },
        ],
        started: [],
      })
    ),
  });
  assert.equal(app.burningCards().length, 1);
  assert.equal(
    app.burningCards()[0].querySelector(".card-title").textContent,
    "正常"
  );
});

test("corrupt_started_items_are_excluded", () => {
  // 着手済み項目のactions/startedAtが壊れている場合に除外されることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithRaw(
      JSON.stringify({
        pending: [],
        started: [
          { id: "ok", title: "正常", createdAt: T0, startedAt: T0, actions: [{ text: "やった", at: T0 }] },
          { id: "no-actions", title: "actions欠落", createdAt: T0, startedAt: T0 },
          { id: "bad-action", title: "actionsの中身が不正", createdAt: T0, startedAt: T0, actions: [{ text: 999, at: "いま" }] },
          { id: "no-started-at", title: "startedAt欠落", createdAt: T0, actions: [] },
        ],
      })
    ),
  });
  assert.equal(app.startedCards().length, 1);
  assert.equal(
    app.startedCards()[0].querySelector(".card-title").textContent,
    "正常"
  );
});

test("sanitize_items_handles_null_and_undefined", () => {
  // sanitizeItemsにnull/undefinedを渡しても空配列が返ることを検証
  // (vmレルム内のArrayとはプロトタイプが異なるため、長さで判定する)
  const app = loadApp({ now: T0 });
  assert.equal(app.ctx.sanitizeItems(null, false).length, 0);
  assert.equal(app.ctx.sanitizeItems(undefined, true).length, 0);
});

// ---------- 保存失敗(容量超過・プライベートモード相当) ----------

test("quota_error_shows_banner_and_recovers", () => {
  // 保存失敗で日本語バナーが表示され、保存が再び成功すると消えることを検証
  const app = loadApp({ now: T0 });
  const banner = app.doc._ids["save-error"];
  const originalSetItem = app.storage.setItem;

  // setItemを容量超過相当の例外に差し替える
  app.storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  app.submitAdd("保存できない項目");

  assert.equal(banner.hidden, false);
  assert.match(banner.textContent, /保存に失敗/);
  assert.match(banner.textContent, /空き容量/); // 対処方法が含まれる
  // メモリ上の状態は維持され、画面には表示されている
  assert.equal(app.burningCards().length, 1);

  // 保存が復旧したら、次の操作でバナーが消える
  app.storage.setItem = originalSetItem;
  app.submitAdd("保存できる項目");
  assert.equal(banner.hidden, true);
  assert.equal(app.readStorage().pending.length, 2);
});

// ---------- 不正な操作(存在しないID) ----------

test("start_with_unknown_id_is_a_safe_noop", () => {
  // 存在しないIDへの着手操作が何も壊さないことを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("無関係な項目");
  app.ctx.startItem("存在しないID", "やった");
  const saved = app.readStorage();
  assert.equal(saved.pending.length, 1);
  assert.equal(saved.started.length, 0);
});

test("append_with_unknown_id_is_a_safe_noop", () => {
  // 存在しないIDへの追記操作が何も壊さないことを検証
  const app = loadApp({ now: T0 });
  app.ctx.appendAction("存在しないID", "やった");
  assert.equal(app.startedCards().length, 0);
});

// ---------- 特殊文字・インジェクション ----------

test("html_in_title_is_not_interpreted", () => {
  // タイトルのHTMLが解釈されない(XSSにならない)ことを検証
  // textContent経由なら子要素は生成されず、文字列のまま保持される
  const app = loadApp({ now: T0 });
  const payload = '<img src=x onerror="alert(1)">';
  app.submitAdd(payload);
  const titleEl = app.burningCards()[0].querySelector(".card-title");
  assert.equal(titleEl.textContent, payload);
  assert.equal(titleEl.children.length, 0);
});

test("null_byte_and_control_chars_survive_roundtrip", () => {
  // NULLバイト・制御文字入りタイトルが保存→再起動後も壊れないことを検証
  const app1 = loadApp({ now: T0 });
  const title = "a\x00b\x01c\x1fd";
  app1.ctx.addItem(title);

  const app2 = loadApp({ now: T0 + 1000, storage: app1.storage });
  assert.equal(app2.readStorage().pending[0].title, title);
  assert.equal(app2.burningCards().length, 1);
});

// ---------- 並行・競合 ----------

test("two_tabs_last_write_wins", () => {
  // 2タブ同時操作では後から保存した側が勝つ(既知の制限)ことを検証
  // 同期機構は意図的に持たない(ADR-001)。挙動が変わったらこのテストで気づく
  const storage = createLocalStorage();
  const tabA = loadApp({ now: T0, storage });
  const tabB = loadApp({ now: T0, storage });

  tabA.submitAdd("タブAの項目");
  assert.equal(tabA.readStorage().pending.length, 1);

  tabB.submitAdd("タブBの項目");
  const titles = tabB.readStorage().pending.map((p) => p.title);
  assert.deepEqual(titles, ["タブBの項目"]); // タブAの項目は上書きで消える
});
