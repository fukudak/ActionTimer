"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";
const T0 = new Date(2026, 5, 10, 9, 0).getTime();

test("corrupt_storage_falls_back_to_new_empty_shape", () => {
  const app = loadApp({ now: T0 });
  app.storage.setItem("kichijitsu-timer-v1", "{{{");
  const restarted = loadApp({ now: T0, storage: app.storage });
  assert.equal(restarted.burningCards().length, 0);
  assert.equal(restarted.unexplodedCards().length, 0);
  restarted.ctx.addItem("canonical save");
  assert.deepEqual(restarted.readStorage().unexploded, []);
});

test("malformed_shapes_and_invalid_dates_are_ignored", () => {
  const app = loadApp({ now: T0, storage: { getItem: () => JSON.stringify({ pending: {}, unexploded: [{ id: 1 }, { id: "bad", title: "Date範囲外", createdAt: T0, failedAt: Number.MAX_VALUE }, { id: "ok", title: "正常", createdAt: T0, failedAt: T0 }] }), setItem() {} } });
  assert.equal(app.burningCards().length, 0);
  assert.equal(app.unexplodedCards().length, 1);
});

test("quota_banner_and_control_chars_recover", () => {
  const app = loadApp({ now: T0 });
  const original = app.storage.setItem;
  app.storage.setItem = () => { throw new Error("quota"); };
  app.submitAdd("保存失敗");
  assert.equal(app.doc._ids["save-error"].hidden, false);
  app.storage.setItem = original;
  app.submitAdd("保存復旧");
  assert.equal(app.doc._ids["save-error"].hidden, true);
  const title = "<img>\x00\x01";
  app.ctx.addItem(title);
  const restarted = loadApp({ now: T0 + 1, storage: app.storage });
  assert.equal(restarted.burningCards().some((card) => card.querySelector(".card-title").textContent === title), true);
});

test("two_tabs_last_write_wins", () => {
  const storage = createLocalStorage();
  const a = loadApp({ now: T0, storage }); const b = loadApp({ now: T0, storage });
  a.submitAdd("A"); b.submitAdd("B");
  assert.deepEqual(b.readStorage().pending.map((x) => x.title), ["B"]);
});

test("delete_confirm_uses_exact_text", () => {
  let message;
  const confirm = (text) => { message = text; return false; };
  const app = loadApp({ now: T0, confirm });
  app.storage.setItem("kichijitsu-timer-v1", JSON.stringify({ pending: [], unexploded: [{ id: "u", title: "危険な項目", createdAt: T0, failedAt: T0 }] }));
  const restarted = loadApp({ now: T0, storage: app.storage, confirm });
  restarted.unexplodedCards()[0].querySelector(".btn-delete").dispatch("click");
  assert.equal(message, "「危険な項目」を削除します。この操作は取り消せません。");
});
