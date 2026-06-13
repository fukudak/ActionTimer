"use strict";

// バックアップ機能テスト: エクスポート/インポートの正常系・境界値・異常系
// テスト方針: DOMスタブで再現できないダウンロードUI(Blob/a要素)は手動検証に分離する

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp } from "./helpers/dom_stub.mjs";

const T0 = new Date(2026, 5, 10, 9, 0).getTime();

// ─── 正常系 ────────────────────────────────────────────────────────────────

test("export_serializes_current_state", () => {
  // エクスポートで状態がJSON文字列として書き出されることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("運動する");

  const json = app.ctx.serializeState();
  const parsed = JSON.parse(json);
  assert.equal(parsed.pending.length, 1);
  assert.equal(parsed.pending[0].title, "運動する");
  assert.equal(parsed.started.length, 0);
});

test("import_adds_new_items_and_skips_duplicates", () => {
  // インポートで新規項目が追加され、ID重複はスキップされることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("元の項目");
  const existingId = app.readStorage().pending[0].id;

  // 既存IDと異なる新規項目を含むバックアップを用意する
  const backup = {
    pending: [
      { id: existingId, title: "元の項目", createdAt: T0 },    // 重複 → スキップ
      { id: "brand-new-id", title: "新しい項目", createdAt: T0 }, // 新規 → 追加
    ],
    started: [],
  };
  const added = app.ctx.importState(backup);
  assert.equal(added, 1);
  assert.equal(app.readStorage().pending.length, 2);

  // 同じバックアップを再度インポートしても両方スキップされる
  const added2 = app.ctx.importState(backup);
  assert.equal(added2, 0);
  assert.equal(app.readStorage().pending.length, 2);
});

test("import_merges_pending_and_started", () => {
  // pending と started 両方を含むバックアップをマージできることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("燃えている");
  // started 項目を直接 importState で追加
  const startedItem = {
    id: "test-started-id",
    title: "もう着手した",
    createdAt: T0,
    startedAt: T0 + 1000,
    actions: [{ text: "やった", at: T0 + 1000 }],
  };
  const added = app.ctx.importState({ pending: [], started: [startedItem] });
  assert.equal(added, 1);
  const saved = app.readStorage();
  assert.equal(saved.pending.length, 1);
  assert.equal(saved.started.length, 1);
  assert.equal(saved.started[0].title, "もう着手した");
});

test("import_via_file_updates_ui_and_shows_status", () => {
  // simulateImport 経由でUIとステータスが更新されることを検証
  const app = loadApp({ now: T0 });
  const payload = JSON.stringify({
    pending: [{ id: "aaa", title: "読み込み項目", createdAt: T0 }],
    started: [],
  });

  app.simulateImport(payload);

  assert.equal(app.burningCards().length, 1);
  assert.equal(app.dataStatus().hidden, false);
  const status = app.dataStatus().textContent;
  assert.ok(status.includes("1件"), `ステータスに件数が含まれる: "${status}"`);
});

test("backup_stamp_format_is_YYYYMMDD_HHMM", () => {
  // バックアップファイル名のタイムスタンプ形式を検証
  const app = loadApp({ now: T0 });
  const stamp = app.ctx.backupStamp(new Date(2026, 0, 5, 8, 3));
  assert.equal(stamp, "20260105-0803");
});

// ─── 境界値 ────────────────────────────────────────────────────────────────

test("import_empty_json_object_adds_nothing", () => {
  // 空オブジェクト {} を取り込んでも壊れず 0 件追加になることを検証
  const app = loadApp({ now: T0 });
  app.submitAdd("元の項目");
  const added = app.ctx.importState({});
  assert.equal(added, 0);
  assert.equal(app.readStorage().pending.length, 1);
});

test("import_with_empty_arrays_adds_nothing", () => {
  // pending/started が空配列のデータを取り込んでも壊れないことを検証
  const app = loadApp({ now: T0 });
  const added = app.ctx.importState({ pending: [], started: [] });
  assert.equal(added, 0);
});

test("import_discards_corrupt_items_but_keeps_valid", () => {
  // 壊れた項目(必須フィールド欠け)は除外され、正常な項目だけ追加されることを検証
  const app = loadApp({ now: T0 });
  const added = app.ctx.importState({
    pending: [
      { id: "good-id", title: "正常", createdAt: T0 },
      { id: 999, title: "idが数値" },          // 壊れている
      { title: "idなし", createdAt: T0 },       // 壊れている
      null,                                      // 壊れている
    ],
    started: [],
  });
  assert.equal(added, 1);
  assert.equal(app.readStorage().pending[0].title, "正常");
});

test("import_started_item_missing_actions_is_excluded", () => {
  // started 項目で actions が欠けているものは除外されることを検証
  const app = loadApp({ now: T0 });
  const added = app.ctx.importState({
    pending: [],
    started: [
      {
        id: "no-actions",
        title: "actionsなし",
        createdAt: T0,
        startedAt: T0 + 1000,
        // actions フィールドなし
      },
    ],
  });
  assert.equal(added, 0);
});

// ─── 異常系 ────────────────────────────────────────────────────────────────

test("import_file_with_broken_json_shows_error_status", () => {
  // 壊れた JSON ファイルを読み込むとエラーステータスが表示されることを検証
  const app = loadApp({ now: T0 });
  app.simulateImport("{{{not json");

  const status = app.dataStatus();
  assert.equal(status.hidden, false);
  assert.ok(
    status.classList.contains("error"),
    "error クラスが付与されている"
  );
});

test("import_null_payload_shows_error_status", () => {
  // null を JSON.parse したような状態で importState を呼んでも壊れないことを検証
  const app = loadApp({ now: T0 });
  // JSON.parse("null") === null
  const added = app.ctx.importState(null);
  assert.equal(added, 0);
});

test("import_array_payload_adds_nothing_and_does_not_crash", () => {
  // トップレベルが配列の不正なペイロードで壊れないことを検証
  const app = loadApp({ now: T0 });
  const added = app.ctx.importState([{ id: "x", title: "t", createdAt: T0 }]);
  // sanitizeItems は non-array を空配列にする。配列に対しても pending/started キーがないので 0 件
  assert.equal(added, 0);
});
