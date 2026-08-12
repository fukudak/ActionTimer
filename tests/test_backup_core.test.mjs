"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";
const LIMIT_MS = 72 * 60 * 60 * 1000;
const T0 = new Date(2026, 5, 10, 9, 0).getTime();
function storage(data) { const s = createLocalStorage(); s.setItem("kichijitsu-timer-v1", JSON.stringify(data)); return s; }

test("export_is_new_shape_only", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [], started: [{ id: "old", title: "旧", createdAt: T0, startedAt: T0, actions: [] }], unexploded: [{ id: "u", title: "不発", createdAt: T0, failedAt: T0 + LIMIT_MS }] }) });
  const parsed = JSON.parse(app.ctx.serializeState());
  assert.deepEqual(Object.keys(parsed).sort(), ["pending", "unexploded"]);
  assert.equal(JSON.stringify(parsed).includes("started"), false);
});

test("export_button_downloads_canonical_json_and_reports_success", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("書き出し確認");
  app.clickExport();
  const exported = JSON.parse(app.ctx._getLastExportedText());
  const anchor = app.doc._created.find((element) => element.tagName === "A");
  assert.deepEqual(Object.keys(exported).sort(), ["pending", "unexploded"]);
  assert.equal(exported.pending[0].title, "書き出し確認");
  assert.equal(anchor.href, "blob:fake");
  assert.equal(anchor.download, "kichijitsu-backup-20260610-0900.json");
  assert.equal(anchor.clickCount, 1);
  assert.equal(app.dataStatus().hidden, false);
  assert.match(app.dataStatus().textContent, /書き出しました/);
});

test("import_migrates_old_and_new_and_skips_cross_list_duplicates", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [{ id: "current", title: "現在", createdAt: T0 }], unexploded: [] }) });
  const added = app.ctx.importState({ pending: [{ id: "current", title: "重複", createdAt: T0 }, { id: "p", title: "新規", createdAt: T0 }], started: [{ id: "old", title: "無視", createdAt: T0 }], unexploded: [{ id: "p", title: "同ID", createdAt: T0, failedAt: T0 }, { id: "u", title: "不発", createdAt: T0, failedAt: T0 + LIMIT_MS }] });
  assert.equal(added, 2);
  assert.deepEqual(app.readStorage().pending.map((x) => x.id), ["current", "p"]);
  assert.deepEqual(app.readStorage().unexploded.map((x) => x.id), ["u"]);
});

test("expired_imported_pending_becomes_unexploded", () => {
  const app = loadApp({ now: T0 });
  assert.equal(app.ctx.importState({ pending: [{ id: "late", title: "遅延", createdAt: T0 - LIMIT_MS }] }), 1);
  assert.deepEqual(app.readStorage().unexploded, [{ id: "late", title: "遅延", createdAt: T0 - LIMIT_MS, failedAt: T0 }]);
});

test("top_level_array_import_is_unsupported", () => {
  const app = loadApp({ now: T0 });
  app.simulateImport("[]");
  assert.equal(app.dataStatus().classList.contains("error"), true);
});
