"use strict";

// 第2層: 境界値テスト(Boundary Testing)
// 文字列・時間・データ件数の境界での動作を検証する

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";

const LIMIT_MS = 72 * 60 * 60 * 1000;
const URGENT_THRESHOLD_MS = 12 * 60 * 60 * 1000;
const BURNOUT_ANIM_MS = 1600;
const T0 = new Date(2026, 5, 10, 9, 0).getTime();

// 指定のpending項目だけを持つストレージを作る
function storageWithPending(items) {
  const storage = createLocalStorage();
  storage.setItem(
    "kichijitsu-timer-v1",
    JSON.stringify({ pending: items, started: [] })
  );
  return storage;
}

// ---------- 文字列の境界 ----------

test("empty_title_is_rejected", () => {
  // 空文字列の登録が拒否されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("");
  assert.equal(app.burningCards().length, 0);
  assert.equal(app.readStorage(), null);
});

test("whitespace_only_title_is_rejected", () => {
  // 空白のみ("   ")の登録が拒否されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("   ");
  assert.equal(app.burningCards().length, 0);
});

test("newline_only_title_is_rejected", () => {
  // 改行のみ("\n\n\n")の登録が拒否されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("\n\n\n");
  assert.equal(app.burningCards().length, 0);
});

test("single_char_title_is_accepted", () => {
  // 1文字のタイトルが登録できることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("あ");
  assert.equal(app.burningCards().length, 1);
  assert.equal(app.readStorage().pending[0].title, "あ");
});

test("very_long_title_is_accepted_by_logic_layer", () => {
  // 10000文字のタイトルでもロジック層は壊れないことを検証
  // (画面上はinputのmaxlength=100で制限される。これはUI層の責務)
  const app = loadApp({ now: T0 });
  const long = "あ".repeat(10000);
  app.ctx.addItem(long);
  assert.equal(app.readStorage().pending[0].title.length, 10000);
  assert.equal(
    app.burningCards()[0].querySelector(".card-title").textContent,
    long
  );
});

test("action_text_at_maxlen_is_stored_fully", () => {
  // 最大長(200文字)の「やったこと」が欠けずに保存されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("対象");
  const id = app.readStorage().pending[0].id;
  const maxText = "や".repeat(200);
  app.ctx.startItem(id, maxText);
  assert.equal(app.readStorage().started[0].actions[0].text, maxText);
});

// ---------- 時間の境界 ----------

test("exactly_72h_elapsed_burns_out", () => {
  // ちょうど72時間経過(残り0)で燃え尽き処理が走ることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "境界", createdAt: T0 - LIMIT_MS },
    ]),
  });
  const card = app.burningCards()[0];
  assert.equal(card.querySelector(".remaining").textContent, "燃え尽きました");
  assert.equal(card.querySelector(".burn-meter").value, 1);
  assert.equal(card.style.getPropertyValue("--burn-progress"), "1");
  assert.equal(card.style.getPropertyValue("--burn-edge"), "0%");
  // 燃え尽きアニメーション時間(1600ms)後の削除が予約される
  assert.equal(app.timeouts.length, 1);
  assert.equal(app.timeouts[0].ms, BURNOUT_ANIM_MS);

  app.flushTimeouts();
  assert.equal(app.readStorage().pending.length, 0);
  assert.equal(app.burningCards().length, 0);
});

test("one_ms_before_72h_is_still_burning", () => {
  // 残り1ミリ秒ではまだ燃えていて、削除予約されないことを検証
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "境界", createdAt: T0 - LIMIT_MS + 1 },
    ]),
  });
  assert.notEqual(
    app.burningCards()[0].querySelector(".remaining").textContent,
    "燃え尽きました…"
  );
  assert.equal(app.timeouts.length, 0);
});

test("one_ms_after_72h_burns_out", () => {
  // 72時間+1ミリ秒で燃え尽きることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "境界", createdAt: T0 - LIMIT_MS - 1 },
    ]),
  });
  assert.equal(app.timeouts.length, 1);
});

test("urgent_color_threshold_at_exactly_12h", () => {
  // 残りちょうど12時間では警告色にならず、1ミリ秒切ると警告色になることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "境界", createdAt: T0 - (LIMIT_MS - URGENT_THRESHOLD_MS) },
    ]),
  });
  const remainingEl = app.burningCards()[0].querySelector(".remaining");
  assert.equal(remainingEl.classList.contains("urgent"), false);
  assert.equal(remainingEl.textContent, "残り 12時間0分");
  assert.equal(remainingEl.textContent.includes("期限間近"), false);
  assert.equal(app.burningCards()[0].style.getPropertyValue("--burn-edge"), "50%");

  app.advance(1);
  app.ctx.tick();
  assert.equal(remainingEl.classList.contains("urgent"), true);
  assert.equal(remainingEl.textContent, "残り 11時間59分");
  assert.ok(Math.abs(Number.parseFloat(app.burningCards()[0].style.getPropertyValue("--burn-edge")) - 50) < 0.000001);
});

test("format_remaining_at_unit_boundaries", () => {
  // 残り時間表示が秒/分/時間の単位境界で正しく切り替わることを検証
  const app = loadApp({ now: T0 });
  const f = app.ctx.formatRemaining;
  assert.equal(f(0), "残り 0秒");
  assert.equal(f(999), "残り 0秒");
  assert.equal(f(1000), "残り 1秒");
  assert.equal(f(59999), "残り 59秒");
  assert.equal(f(60000), "残り 1分0秒");
  assert.equal(f(3599999), "残り 59分59秒");
  assert.equal(f(3600000), "残り 1時間0分");
  assert.equal(f(LIMIT_MS), "残り 72時間0分");
});

test("future_created_at_clamps_fuse_to_full", () => {
  // createdAtが未来(端末時計の巻き戻し等)でも満タン表示でクラッシュしないことを検証
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "未来", createdAt: T0 + 3600 * 1000 },
    ]),
  });
  const card = app.burningCards()[0];
  assert.equal(card.querySelector(".burn-meter").value, 0);
  assert.equal(card.style.getPropertyValue("--burn-progress"), "0");
  assert.equal(card.style.getPropertyValue("--burn-edge"), "100%");
});

test("title_remains_present_throughout_burning", () => {
  for (const elapsedHours of [0, 36, 60, 71]) {
    const titleText = `${elapsedHours}時間目の行動`;
    const app = loadApp({
      now: T0,
      storage: storageWithPending([
        { id: "x1", title: titleText, createdAt: T0 - elapsedHours * 60 * 60 * 1000 },
      ]),
    });
    const card = app.burningCards()[0];
    const sticky = card.querySelector(".sticky-note");
    const title = card.querySelector(".sticky-note__title");
    const surface = card.querySelector(".sticky-note__surface");
    assert.equal(title.parent, sticky);
    assert.equal(surface.parent, sticky);
    assert.equal(title.textContent, titleText);
    assert.equal(surface.textContent, "");
  }
});

test("title_area_remains_at_least_40_percent_before_expiry", () => {
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "終盤", createdAt: T0 - 71 * 60 * 60 * 1000 },
    ]),
  });
  const card = app.burningCards()[0];
  assert.equal(card.querySelector(".burn-meter").value, 71 / 72);
  assert.equal(card.style.getPropertyValue("--burn-progress"), String(71 / 72));
  assert.ok(Math.abs(Number.parseFloat(card.style.getPropertyValue("--burn-edge")) - 40.833333333333336) < 0.000001);
});

test("epoch_created_at_burns_out_without_crash", () => {
  // createdAt=0(1970-01-01)の大過去でもクラッシュせず燃え尽きることを検証
  const app = loadApp({
    now: T0,
    storage: storageWithPending([{ id: "x1", title: "大過去", createdAt: 0 }]),
  });
  app.flushTimeouts();
  assert.equal(app.readStorage().pending.length, 0);
});

test("far_future_timestamp_renders_without_crash", () => {
  // 9999-12-31登録扱いの極端なタイムスタンプでも描画できることを検証
  const farFuture = new Date(9999, 11, 31).getTime();
  const app = loadApp({
    now: T0,
    storage: storageWithPending([
      { id: "x1", title: "遠未来", createdAt: farFuture },
    ]),
  });
  assert.equal(app.burningCards().length, 1);
});

test("finite_but_out_of_date_range_timestamps_are_excluded", () => {
  const storage = createLocalStorage();
  storage.setItem(
    "kichijitsu-timer-v1",
    JSON.stringify({
      pending: [
        { id: "bad-pending", title: "Date範囲外", createdAt: Number.MAX_VALUE },
        { id: "valid-pending", title: "有効", createdAt: T0 },
      ],
      started: [
        {
          id: "bad-started-at",
          title: "着手日時が範囲外",
          createdAt: T0,
          startedAt: Number.MAX_VALUE,
          actions: [{ text: "実行", at: T0 }],
        },
        {
          id: "bad-action-at",
          title: "行動日時が範囲外",
          createdAt: T0,
          startedAt: T0,
          actions: [{ text: "実行", at: Number.MAX_VALUE }],
        },
        {
          id: "valid-started",
          title: "有効な着手済み",
          createdAt: T0,
          startedAt: T0,
          actions: [{ text: "実行", at: T0 }],
        },
      ],
    })
  );

  const app = loadApp({ now: T0, storage });
  assert.deepEqual(app.burningCards().map((card) => card.dataset.id), ["valid-pending"]);
  assert.deepEqual(app.startedCards().map((card) => card.dataset.id), ["valid-started"]);
  assert.equal(app.burningCards().length, 1);
  assert.equal(app.startedCards().length, 1);

  // 次の正常な保存時には、sanitized stateだけが永続化される。
  app.submitAdd("追加項目");
  assert.deepEqual(app.readStorage().pending.map((it) => it.id).slice(0, 1), ["valid-pending"]);
  assert.deepEqual(app.readStorage().started.map((it) => it.id), ["valid-started"]);
});

test("leap_day_is_formatted_correctly", () => {
  // うるう日(2024-02-29)の日時表示が正しいことを検証
  const app = loadApp({ now: T0 });
  const ts = new Date(2024, 1, 29, 0, 0).getTime();
  assert.equal(app.ctx.formatDateTime(ts), "2/29 00:00");
});

// ---------- データ構造の境界 ----------

test("empty_lists_show_empty_notes", () => {
  // 空のリスト([])で空メッセージが出ることを検証
  const app = loadApp({ now: T0, storage: storageWithPending([]) });
  assert.equal(app.doc._ids["burning-empty"].hidden, false);
  assert.equal(app.doc._ids["started-empty"].hidden, false);
});

test("thousand_items_render_without_error", () => {
  // 大量(1000件)の項目でも描画が完走することを検証
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: `id-${i}`,
    title: `項目${i}`,
    createdAt: T0 - i * 1000,
  }));
  const app = loadApp({ now: T0, storage: storageWithPending(items) });
  assert.equal(app.burningCards().length, 1000);
});

test("started_item_with_empty_actions_renders", () => {
  // actionsが空配列([])の着手済み項目でも描画できることを検証
  const storage = createLocalStorage();
  storage.setItem(
    "kichijitsu-timer-v1",
    JSON.stringify({
      pending: [],
      started: [
        { id: "s1", title: "空ログ", createdAt: T0, startedAt: T0, actions: [] },
      ],
    })
  );
  const app = loadApp({ now: T0, storage });
  assert.equal(app.startedCards().length, 1);
  assert.equal(app.startedCards()[0].querySelectorAll(".action-log").length, 1);
});
