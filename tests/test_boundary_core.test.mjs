"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadApp, createLocalStorage } from "./helpers/dom_stub.mjs";

const LIMIT_MS = 72 * 60 * 60 * 1000;
const BURNOUT_ANIM_MS = 1600;
const T0 = new Date(2026, 5, 10, 9, 0).getTime();
function storage(data) { const s = createLocalStorage(); s.setItem("kichijitsu-timer-v1", JSON.stringify(data)); return s; }

test("exact_72h_moves_once_after_burnout", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("境界");
  app.advance(LIMIT_MS);
  app.ctx.tick();
  assert.equal(app.timeouts.length, 1);
  assert.equal(app.timeouts[0].ms, BURNOUT_ANIM_MS);
  app.flushTimeouts(); app.flushTimeouts();
  const item = app.readStorage().unexploded[0];
  assert.deepEqual(item, { id: item.id, title: "境界", createdAt: T0, failedAt: T0 + LIMIT_MS });
});

test("expired_pending_is_normalized_before_render_and_persisted", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [{ id: "x1", title: "過去", createdAt: T0 - LIMIT_MS - 1 }], unexploded: [] }) });
  assert.equal(app.burningCards().length, 0);
  assert.equal(app.unexplodedCards().length, 1);
  assert.equal(app.readStorage().unexploded[0].failedAt, T0 - 1);
});

test("legacy_started_is_discarded", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [], started: [{ id: "s", title: "旧", createdAt: T0, startedAt: T0, actions: [] }] }) });
  assert.deepEqual(app.readStorage(), { pending: [], unexploded: [], history: [] });
  assert.equal(app.readStorage().started, undefined);
});

test("legacy_top_level_actions_and_extra_keys_are_discarded", () => {
  const app = loadApp({
    now: T0,
    storage: storage({ pending: [], unexploded: [], actions: [{ text: "旧" }], extra: true }),
  });
  assert.deepEqual(app.readStorage(), { pending: [], unexploded: [], history: [] });
});

test("invalid_dates_and_duplicate_ids_are_removed", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [{ id: "same", title: "pending", createdAt: T0 }, { id: "bad", title: "bad", createdAt: Number.MAX_VALUE }], unexploded: [{ id: "same", title: "duplicate", createdAt: T0, failedAt: T0 }, { id: "ok", title: "valid", createdAt: T0, failedAt: Number.MAX_VALUE }] }) });
  assert.deepEqual(app.readStorage(), { pending: [{ id: "same", title: "pending", createdAt: T0 }], unexploded: [], history: [] });
});

test("unexploded_failed_at_is_canonicalized_to_fixed_72h", () => {
  const app = loadApp({
    now: T0,
    storage: storage({
      pending: [],
      unexploded: [{ id: "u", title: "不正日時", createdAt: T0 - LIMIT_MS, failedAt: T0 - 1 }],
    }),
  });
  assert.deepEqual(app.readStorage().unexploded, [
    { id: "u", title: "不正日時", createdAt: T0 - LIMIT_MS, failedAt: T0 },
  ]);
});

test("interval_stops_when_empty_and_restarts_once", async () => {
  const app = loadApp({ now: T0 });
  app.submitAdd("a");
  const card = app.burningCards()[0];
  card.querySelector(".btn-start").dispatch("click");
  await app.answerConfirm(true);
  assert.equal(app.intervals.length, 0);
  app.ctx.reigniteItem("missing");
  app.storage.setItem("kichijitsu-timer-v1", JSON.stringify({ pending: [], unexploded: [{ id: "u", title: "u", createdAt: T0, failedAt: T0 }] }));
  const restarted = loadApp({ now: T0, storage: app.storage });
  restarted.unexplodedCards()[0].querySelector(".btn-reignite").dispatch("click");
  assert.equal(restarted.intervals.length, 1);
  restarted.unexplodedCards()[0]?.querySelector(".btn-reignite")?.dispatch("click");
  assert.equal(restarted.intervals.length, 1);
});

test("remaining_boundaries_urgent_future_leap_and_mass_render", () => {
  const app = loadApp({ now: T0 });
  assert.equal(app.ctx.formatRemaining(0), "残り 0秒");
  assert.equal(app.ctx.formatRemaining(1000), "残り 1秒");
  assert.equal(app.ctx.formatRemaining(60000), "残り 1分0秒");
  assert.equal(app.ctx.formatRemaining(3600000), "残り 1時間0分");
  app.ctx.addItem("警告");
  app.advance(LIMIT_MS - 12 * 60 * 60 * 1000); app.ctx.tick();
  const card = app.burningCards()[0];
  assert.equal(card.querySelector(".remaining").classList.contains("urgent"), false);
  app.advance(1); app.ctx.tick();
  assert.equal(card.querySelector(".remaining").classList.contains("urgent"), true);
  assert.equal(app.ctx.formatDateTime(new Date(2024, 1, 29).getTime()), "2/29 00:00");
});

test("future_timestamp_is_full_and_1000_items_render", () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: `id-${i}`, title: `項目${i}`, createdAt: T0 - i * 1000 }));
  const app = loadApp({ now: T0, storage: storage({ pending: [{ id: "future", title: "未来", createdAt: T0 + 3600000 }, ...items], unexploded: [] }) });
  assert.equal(app.burningCards().length, 1001);
  assert.equal(app.burningCards()[0].querySelector(".burn-meter").value, 0);
});

test("input_boundaries_and_progress", () => {
  const app = loadApp({ now: T0 });
  app.submitAdd(""); app.submitAdd("   "); app.submitAdd("あ");
  app.ctx.addItem("あ".repeat(10000));
  assert.equal(app.burningCards().length, 2);
  const card = app.burningCards()[0];
  app.advance(LIMIT_MS / 2); app.ctx.tick();
  assert.equal(card.querySelector(".burn-meter").value, 0.5);
});

test("epoch_and_far_future_dates_do_not_crash", () => {
  const app = loadApp({ now: T0, storage: storage({ pending: [{ id: "epoch", title: "過去", createdAt: 0 }, { id: "future", title: "遠未来", createdAt: new Date(9999, 11, 31).getTime() }], unexploded: [] }) });
  assert.equal(app.burningCards().length, 1);
  assert.equal(app.unexplodedCards().length, 1);
});
