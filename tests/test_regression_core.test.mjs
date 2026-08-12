"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";

const LIMIT_MS = 72 * 60 * 60 * 1000;
const T0 = new Date(2026, 5, 10, 9, 0).getTime();
function storage(data) { const s = createLocalStorage(); s.setItem("kichijitsu-timer-v1", JSON.stringify(data)); return s; }
function item(id, title = id, createdAt = T0) { return { id, title, createdAt }; }

test("title_validation_rejects_trimmed_empty_values", () => {
  const app = loadApp({ now: T0 });
  for (const value of ["", " ", "\n\t"]) app.submitAdd(value);
  assert.equal(app.burningCards().length, 0);
});

test("title_validation_accepts_single_and_long_values", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("A"); app.ctx.addItem("x".repeat(10000));
  assert.deepEqual(app.readStorage().pending.map((x) => x.title.length), [1, 10000]);
});

test("remaining_second_minute_hour_boundaries", () => {
  const app = loadApp({ now: T0 });
  const f = app.ctx.formatRemaining;
  assert.equal(f(999), "残り 0秒"); assert.equal(f(1000), "残り 1秒");
  assert.equal(f(59999), "残り 59秒"); assert.equal(f(60000), "残り 1分0秒");
  assert.equal(f(3599999), "残り 59分59秒"); assert.equal(f(3600000), "残り 1時間0分");
});

test("urgent_threshold_is_exclusive", () => {
  const app = loadApp({ now: T0 }); app.ctx.addItem("urgent");
  app.advance(LIMIT_MS - 12 * 60 * 60 * 1000); app.ctx.tick();
  const el = app.burningCards()[0].querySelector(".remaining");
  assert.equal(el.classList.contains("urgent"), false);
  app.advance(1); app.ctx.tick(); assert.equal(el.classList.contains("urgent"), true);
});

test("future_created_at_clamps_progress_to_zero", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [item("f", "未来", T0 + 3600000)], unexploded: [] }) });
  const card = app.burningCards()[0];
  assert.equal(card.querySelector(".burn-meter").value, 0);
  assert.equal(card.style.getPropertyValue("--burn-progress"), "0");
});

test("date_range_guard_rejects_max_value_created_at", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [item("bad", "bad", Number.MAX_VALUE), item("ok")], unexploded: [] }) });
  assert.deepEqual(app.burningCards().map((x) => x.dataset.id), ["ok"]);
});

test("date_range_guard_rejects_max_value_failed_at", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [], unexploded: [{ id: "bad", title: "bad", createdAt: T0, failedAt: Number.MAX_VALUE }] }) });
  assert.equal(app.unexplodedCards().length, 0);
});

test("failed_at_before_created_at_is_canonicalized", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [], unexploded: [{ id: "bad", title: "bad", createdAt: T0, failedAt: T0 - 1 }] }) });
  assert.deepEqual(app.readStorage().unexploded, [{ id: "bad", title: "bad", createdAt: T0, failedAt: T0 + LIMIT_MS }]);
});

test("leap_date_format_is_local_month_day_time", () => {
  const app = loadApp({ now: T0 });
  assert.equal(app.ctx.formatDateTime(new Date(2024, 1, 29, 0, 5).getTime()), "2/29 00:05");
});

test("one_thousand_items_render_in_storage_order", () => {
  const pending = Array.from({ length: 1000 }, (_, i) => item(`id-${i}`, `title-${i}`, T0));
  const app = loadApp({ now: T0, storage: storage({ pending, unexploded: [] }) });
  assert.equal(app.burningCards().length, 1000);
  assert.equal(app.burningCards()[999].querySelector(".card-title").textContent, "title-999");
});

test("malformed_top_level_shapes_render_empty", () => {
  for (const value of ["null", "42", "[]"]) {
    const app = loadApp({ now: T0, storage: (() => { const s = createLocalStorage(); s.setItem("kichijitsu-timer-v1", value); return s; })() });
    assert.equal(app.burningCards().length, 0); assert.equal(app.unexplodedCards().length, 0);
  }
});

test("malformed_pending_items_do_not_hide_valid_items", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [null, { id: 1 }, { id: "ok", title: "正常", createdAt: T0 }], unexploded: [] }) });
  assert.equal(app.burningCards()[0].querySelector(".card-title").textContent, "正常");
});

test("duplicate_ids_are_deduplicated_pending_first", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [item("same", "pending")], unexploded: [{ id: "same", title: "unexploded", createdAt: T0, failedAt: T0 }] }) });
  assert.deepEqual(app.readStorage().pending.map((x) => x.title), ["pending"]);
  assert.equal(app.unexplodedCards().length, 0);
});

test("unknown_reignite_and_delete_are_noops", () => {
  const app = loadApp({ now: T0 });
  app.ctx.reigniteItem("missing"); app.ctx.deleteUnexploded("missing");
  assert.equal(app.readStorage(), null);
});


test("quota_failure_keeps_ui_state_and_shows_banner", () => {
  const app = loadApp({ now: T0 }); app.storage.setItem = () => { throw new Error("quota"); };
  app.submitAdd("保存失敗");
  assert.equal(app.burningCards().length, 1); assert.equal(app.doc._ids["save-error"].hidden, false);
});

test("control_characters_round_trip_through_restart", () => {
  const app = loadApp({ now: T0 }); const title = "a\x00b\x01c"; app.ctx.addItem(title);
  const restarted = loadApp({ now: T0 + 1, storage: app.storage });
  assert.equal(restarted.readStorage().pending[0].title, title);
});

test("xss_payload_is_text_only", () => {
  const app = loadApp({ now: T0 }); const title = "<script>alert(1)</script>"; app.submitAdd(title);
  const el = app.burningCards()[0].querySelector(".card-title");
  assert.equal(el.textContent, title); assert.equal(el.children.length, 0);
});

test("two_tab_last_write_wins_is_documented_behavior", () => {
  const s = createLocalStorage(); const a = loadApp({ now: T0, storage: s }); const b = loadApp({ now: T0, storage: s });
  a.submitAdd("A"); b.submitAdd("B"); assert.deepEqual(b.readStorage().pending.map((x) => x.title), ["B"]);
});

test("timer_and_progress_update_without_duplicate_intervals", () => {
  const app = loadApp({ now: T0 }); app.submitAdd("timer"); app.submitAdd("timer2");
  assert.equal(app.intervals.length, 1); app.ctx.tick(); assert.equal(app.intervals.length, 1);
});

test("burnout_moves_item_to_unexploded_once", () => {
  const app = loadApp({ now: T0 }); app.submitAdd("燃え尽き"); app.advance(LIMIT_MS); app.ctx.tick();
  app.flushTimeouts(); app.flushTimeouts();
  assert.equal(app.readStorage().pending.length, 0); assert.equal(app.readStorage().unexploded.length, 1);
});

test("reignite_drops_failed_at_and_uses_now", () => {
  const app = loadApp({ now: T0 + 123, storage: storage({ pending: [], unexploded: [{ id: "u", title: "再点火", createdAt: T0, failedAt: T0 }] }) });
  app.unexplodedCards()[0].querySelector(".btn-reignite").dispatch("click");
  assert.deepEqual(app.readStorage().pending, [{ id: "u", title: "再点火", createdAt: T0 + 123 }]);
});
