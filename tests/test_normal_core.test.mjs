"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";

const LIMIT_MS = 72 * 60 * 60 * 1000;
const T0 = new Date(2026, 5, 10, 9, 0).getTime();

function pending(app, id = app.readStorage().pending[0].id) {
  return app.burningCards().find((card) => card.dataset.id === id);
}
function storage(data) {
  const s = createLocalStorage();
  s.setItem("kichijitsu-timer-v1", JSON.stringify(data));
  return s;
}

test("start_immediately_removes_and_records_history", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("歯医者を予約する");
  const card = pending(app);
  card.querySelector(".btn-start").dispatch("click");
  assert.equal(app.readStorage().pending.length, 0);
  assert.equal(app.readStorage().unexploded.length, 0);
  assert.equal(app.unexplodedCards().length, 0);
  assert.equal(app.readStorage().history.length, 1);
  assert.equal(app.readStorage().history[0].title, "歯医者を予約する");
  assert.equal(app.readStorage().history[0].startedAt, T0);
  assert.equal(app.historyCards().length, 1);
  assert.equal(app.doc._ids["ui-status"].textContent, "「歯医者を予約する」を着手しました。");
});

test("start_button_has_accessible_name_and_no_form", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("XSS <img>");
  const button = pending(app).querySelector(".btn-start");
  assert.equal(button.textContent, "着手");
  assert.equal(button.getAttribute("aria-label"), "「XSS <img>」を着手として消す");
  assert.equal(pending(app).querySelector(".start-form"), null);
});

test("start_at_or_after_deadline_moves_to_unexploded", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("期限項目");
  app.advance(LIMIT_MS);
  pending(app).querySelector(".btn-start").dispatch("click");
  const saved = app.readStorage();
  assert.equal(saved.pending.length, 0);
  assert.deepEqual(saved.unexploded, [{ id: saved.unexploded[0].id, title: "期限項目", createdAt: T0, failedAt: T0 + LIMIT_MS }]);
  assert.equal(app.unexplodedCards()[0].querySelector(".unexploded-note__title").textContent, "期限項目");
});

test("reignite_preserves_identity_and_resets_deadline", () => {
  const app = loadApp({ now: T0 + 5000, storage: storage({ pending: [], unexploded: [{ id: "u1", title: "再挑戦", createdAt: T0, failedAt: T0 + LIMIT_MS }] }) });
  app.unexplodedCards()[0].querySelector(".btn-reignite").dispatch("click");
  assert.deepEqual(app.readStorage(), { pending: [{ id: "u1", title: "再挑戦", createdAt: T0 + 5000 }], unexploded: [], history: [] });
  assert.equal(app.doc._ids["ui-status"].textContent, "「再挑戦」を再点火しました。新しい72時間が始まります。");
});

test("unexploded_delete_cancel_and_confirm", () => {
  let answer = false;
  const app = loadApp({ now: T0, confirm: () => answer, storage: storage({ pending: [], unexploded: [{ id: "u1", title: "消す候補", createdAt: T0, failedAt: T0 + LIMIT_MS }] }) });
  const button = app.unexplodedCards()[0].querySelector(".btn-delete");
  assert.equal(button.getAttribute("aria-label"), "「消す候補」を削除する");
  button.dispatch("click");
  assert.equal(app.readStorage().unexploded.length, 1);
  answer = true;
  button.dispatch("click");
  assert.equal(app.readStorage().unexploded.length, 0);
  assert.equal(app.doc._ids["ui-status"].textContent, "「消す候補」を削除しました。");
});

test("unknown_ids_are_safe_noops", () => {
  const app = loadApp({ now: T0 });
  app.ctx.startItem("missing");
  app.ctx.reigniteItem("missing");
  app.ctx.deleteUnexploded("missing");
  app.ctx.deletePending("missing");
  assert.equal(app.readStorage(), null);
});

test("pending_delete_cancel_and_confirm", () => {
  let answer = false;
  const app = loadApp({ now: T0, confirm: () => answer });
  app.submitAdd("消す候補");
  const button = pending(app).querySelector(".btn-delete");
  button.dispatch("click");
  assert.equal(app.readStorage().pending.length, 1);
  answer = true;
  button.dispatch("click");
  assert.equal(app.readStorage().pending.length, 0);
  assert.equal(app.doc._ids["ui-status"].textContent, "「消す候補」を削除しました。");
});

test("swipe_actions_are_delete_only", () => {
  const app = loadApp({
    now: T0,
    storage: storage({ pending: [{ id: "p1", title: "旧タイトル", createdAt: T0 }], unexploded: [{ id: "u1", title: "旧不発弾", createdAt: T0, failedAt: T0 }] }),
  });
  const pendingCard = pending(app, "p1");
  assert.equal(pendingCard.querySelector(".swipe-edit"), null);
  assert.notEqual(pendingCard.querySelector(".btn-delete"), null);

  const unexplodedCard = app.unexplodedCards()[0];
  assert.equal(unexplodedCard.querySelector(".swipe-edit"), null);
  assert.notEqual(unexplodedCard.querySelector(".btn-delete"), null);
});

test("xss_is_text_content", () => {
  const title = "<img src=x onerror=alert(1)>";
  const app = loadApp({ now: T0 });
  app.submitAdd(title);
  assert.equal(pending(app).querySelector(".card-title").textContent, title);
  assert.equal(pending(app).querySelector(".card-title").children.length, 0);
});

test("empty_notes_and_dom_ids_exist", () => {
  const app = loadApp({ now: T0 });
  assert.equal(app.doc._ids["unexploded-empty"].hidden, false);
  assert.equal(app.doc._ids["burning-heading"].tabIndex, -1);
  assert.equal(app.doc._ids["unexploded-heading"].tabIndex, -1);
});
