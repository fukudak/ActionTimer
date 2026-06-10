"use strict";

// 第1層: 正常系テスト(Happy Path)
// 想定通りの入力で、登録・着手・追記・永続化が正しく動くことを検証する

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/dom_stub.mjs";

const LIMIT_MS = 72 * 60 * 60 * 1000;
const T0 = new Date(2026, 5, 10, 9, 0).getTime();

// UI上で着手操作を行うヘルパ(ボタン→フォーム入力→送信)
function startViaUi(app, card, actionText) {
  card.querySelector(".btn-start").dispatch("click");
  const form = card.querySelector(".start-form");
  form.children[0].value = actionText;
  form.dispatch("submit");
}

test("standard_add_creates_burning_item", () => {
  // 標準的な入力で点火すると、燃えているリストに表示され保存されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("ブログ記事を書く");

  assert.equal(app.burningCards().length, 1);
  const card = app.burningCards()[0];
  assert.equal(card.querySelector(".card-title").textContent, "ブログ記事を書く");
  assert.equal(card.querySelector(".remaining").textContent, "残り 72時間0分");

  const saved = app.readStorage();
  assert.equal(saved.pending.length, 1);
  assert.equal(saved.pending[0].title, "ブログ記事を書く");
  assert.equal(saved.pending[0].createdAt, T0);
  // 入力欄は送信後にクリアされる
  assert.equal(app.doc._ids["add-input"].value, "");
});

test("fresh_start_without_saved_data_uses_defaults", () => {
  // 保存データなし(初回起動)で空の初期状態になることを検証(デフォルト動作)
  const app = loadApp({ now: T0 });
  assert.equal(app.burningCards().length, 0);
  assert.equal(app.startedCards().length, 0);
  // 両リストの空メッセージが表示される
  assert.equal(app.doc._ids["burning-empty"].hidden, false);
  assert.equal(app.doc._ids["started-empty"].hidden, false);
  // 操作前は何も保存されない
  assert.equal(app.readStorage(), null);
});

test("start_with_action_moves_item_to_started_list", () => {
  // 着手して「やったこと」を記入すると、始めたリストへ移動することを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("歯医者を予約する");
  app.advance(60 * 60 * 1000); // 1時間後に着手

  startViaUi(app, app.burningCards()[0], "電話で予約した");

  assert.equal(app.burningCards().length, 0);
  assert.equal(app.startedCards().length, 1);
  const saved = app.readStorage();
  assert.equal(saved.pending.length, 0);
  assert.equal(saved.started.length, 1);
  assert.equal(saved.started[0].startedAt, T0 + 60 * 60 * 1000);
  assert.deepEqual(saved.started[0].actions, [
    { text: "電話で予約した", at: T0 + 60 * 60 * 1000 },
  ]);
});

test("append_action_adds_to_log_in_order", () => {
  // 始めた項目への追記がログへ時系列順に積まれることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("本を読む");
  startViaUi(app, app.burningCards()[0], "1章を読んだ");

  app.advance(1000);
  const startedCard = app.startedCards()[0];
  const form = startedCard.querySelector(".start-form");
  form.children[0].value = "2章を読んだ";
  form.dispatch("submit");

  const actions = app.readStorage().started[0].actions;
  assert.equal(actions.length, 2);
  assert.equal(actions[0].text, "1章を読んだ");
  assert.equal(actions[1].text, "2章を読んだ");
  assert.equal(actions[1].at, T0 + 1000);
});

test("multiple_consecutive_adds_keep_order_and_stability", () => {
  // 複数項目を連続登録しても、登録順が保たれ安定して描画されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("1つ目");
  app.advance(1000);
  app.submitAdd("2つ目");
  app.advance(1000);
  app.submitAdd("3つ目");

  const titles = app
    .burningCards()
    .map((c) => c.querySelector(".card-title").textContent);
  assert.deepEqual(titles, ["1つ目", "2つ目", "3つ目"]);
  assert.equal(app.readStorage().pending.length, 3);
});

test("data_survives_restart", () => {
  // 再起動(別コンテキストで同じストレージを読込)後もデータが残ることを検証
  const app1 = loadApp({ now: T0 });
  app1.submitAdd("永続化テスト");
  startViaUi(app1, app1.burningCards()[0], "着手済み");
  app1.submitAdd("まだ燃えている");

  const app2 = loadApp({ now: T0 + 1000, storage: app1.storage });
  assert.equal(app2.burningCards().length, 1);
  assert.equal(
    app2.burningCards()[0].querySelector(".card-title").textContent,
    "まだ燃えている"
  );
  assert.equal(app2.startedCards().length, 1);
});

test("expire_removes_only_target_item", () => {
  // expireItemが対象の項目だけを消すことを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("残す");
  app.submitAdd("消す");
  const idToExpire = app.readStorage().pending[1].id;

  app.ctx.expireItem(idToExpire);

  const saved = app.readStorage();
  assert.equal(saved.pending.length, 1);
  assert.equal(saved.pending[0].title, "残す");
});

test("format_datetime_standard", () => {
  // 日時表示が「M/D HH:MM」形式(ゼロ埋め)になることを検証
  const app = loadApp({ now: T0 });
  const ts = new Date(2026, 5, 10, 9, 5).getTime();
  assert.equal(app.ctx.formatDateTime(ts), "6/10 09:05");
});

test("only_one_interval_timer_is_registered", () => {
  // リソース管理: 毎秒更新のintervalが1本だけ登録され、
  // 操作を繰り返しても増えない(タイマーリークしない)ことを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("a");
  app.submitAdd("b");
  startViaUi(app, app.burningCards()[0], "x");
  assert.equal(app.intervals.length, 1);
  assert.equal(app.intervals[0].ms, 1000);
});

test("full_fuse_at_ignition_and_remaining_decreases", () => {
  // 点火直後は線香が満タンで、時間経過で残りが減ることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("燃焼確認");
  const fuse = app.burningCards()[0].querySelector(".coil-fuse");
  assert.equal(fuse.attributes["stroke-dashoffset"], "0");

  app.advance(LIMIT_MS / 2); // 36時間経過 → ちょうど半分
  app.ctx.tick();
  assert.equal(fuse.attributes["stroke-dashoffset"], "-500");
  const ember = app.burningCards()[0].querySelector(".coil-ember");
  assert.equal(ember.attributes["transform"], "translate(500 0)");
});
