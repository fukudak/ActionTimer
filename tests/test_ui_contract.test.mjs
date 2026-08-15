"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

test("production shell promotes the bright one-line Japanese UI", () => {
  const html = read("index.html");
  const css = read("style.css");
  assert.match(html, /theme-color" content="#fffaf0"/);
  assert.match(html, /<label for="add-input" class="sr-only">/);
  assert.match(html, /<button type="submit" class="btn-ignite">点火<\/button>/);
  assert.match(css, /--bg:\s*#f7f1e6/);
  assert.match(css, /480px/);
  assert.match(css, /@media screen and \(min-width: 320px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(css, /prefers-reduced-motion/);
});

test("production files exclude mock-only sorting and pagination features", () => {
  // 着手履歴・着手率・スワイプ編集/削除・履歴画面切替は本番採用済み。
  // ここではモック固有だった並び替え・複数ページ切替のみ引き続き除外する。
  for (const file of ["index.html", "style.css", "app.js"]) {
    const source = read(file);
    for (const token of ["sort-button", "history-pagination"]) {
      assert.equal(source.includes(token), false, `${file}: ${token}`);
    }
  }
});

test("history feature is present with title, elapsed time, and rate", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /<h2 id="history-heading" tabindex="-1">履歴<\/h2>/);
  assert.match(app, /state\.history\.unshift/);
  assert.match(app, /着手率/);
});

test("history screen is reached via a header button and a back button", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /id="history-toggle"/);
  assert.match(html, /id="history-back"/);
  assert.match(html, /id="view-now"/);
  assert.match(html, /id="view-history"/);
  assert.match(app, /showView/);
});

test("burning and unexploded rows expose swipe-to-edit and swipe-to-delete", () => {
  const css = read("style.css");
  const app = read("app.js");
  assert.match(css, /\.swipe-actions\s*\{/);
  assert.match(app, /startEditTitle/);
  assert.match(app, /deletePending/);
  assert.match(app, /initSwipeCell/);
});

test("about page describes the light Japanese presentation", () => {
  const about = read("about.html");
  assert.match(about, /#fffaf0/);
  assert.doesNotMatch(about, /ダークテーマ|漆黒の背景/);
  assert.match(about, /prefers-reduced-motion/);
});

test("burn edge is linear and progress names include the title", () => {
  const app = read("app.js");
  assert.match(app, /--burn-edge.*1 - progress/);
  assert.equal(app.includes("燃焼進行度: ${item.title}"), true);
});
