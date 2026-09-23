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
  assert.match(html, /class="app-version">ver\.1\.1\.2</);
  assert.equal(html.includes("購入コード"), false);
  assert.equal(html.includes("cosmetic-ui.mjs"), false);
  assert.match(css, /\.app-version/);
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

test("history feature is present with title, elapsed time, and started count", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /<h2 id="history-heading" tabindex="-1">履歴<\/h2>/);
  assert.match(app, /state\.history\.unshift/);
  assert.match(app, /着手件数/);
  assert.doesNotMatch(app, /着手率/);
});

test("start button requires confirmation before recording", () => {
  const html = read("index.html");
  const css = read("style.css");
  const app = read("app.js");
  assert.match(html, /<dialog id="confirm-dialog"/);
  assert.match(html, /id="confirm-dialog-message"/);
  assert.match(html, /id="confirm-dialog-ok"/);
  assert.match(html, /id="confirm-dialog-cancel"/);
  assert.match(app, /askConfirm\("着手した？"/);
  assert.match(app, /function askConfirm/);
  assert.doesNotMatch(app, /\bconfirm\s*\(/);
  assert.match(css, /\.app-dialog::backdrop/);
  assert.match(css, /\.app-dialog__cancel,\s*\.app-dialog__ok\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.app-dialog__ok--danger/);
});

test("history screen is reached and left via the same header toggle button", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /id="history-toggle"/);
  assert.doesNotMatch(html, /id="history-back"/);
  assert.match(html, /id="view-now"/);
  assert.match(html, /id="view-history"/);
  assert.match(app, /showView/);
  assert.match(app, /今に戻る/);
});

test("burning and unexploded rows expose swipe-to-delete only", () => {
  const css = read("style.css");
  const app = read("app.js");
  assert.match(css, /\.swipe-actions\s*\{/);
  assert.match(app, /deletePending/);
  assert.match(app, /deleteUnexploded/);
  assert.match(app, /initSwipeCell/);
  assert.doesNotMatch(app, /startEditTitle/);
});

test("history summary shows two equal stats in a row, and a clear button", () => {
  const html = read("index.html");
  const css = read("style.css");
  const app = read("app.js");
  assert.match(html, /id="history-clear"/);
  assert.match(css, /\.stat__value/);
  assert.doesNotMatch(css, /\.stat__sub/);
  assert.match(css, /\.history-summary\s*\{[^}]*display:flex[^}]*flex-direction:row/);
  assert.match(app, /clearHistory/);
  assert.match(app, /buildStat\(formatDuration\(avgMs\), "平均着手時間"\)/);
  assert.match(app, /buildStat\(\`\$\{state\.history\.length\}件\`, "着手件数"\)/);
  assert.doesNotMatch(app, /buildStatSub|stat__sub/);
  assert.match(app, /historySummaryEl\.append\(\s*buildStat\(formatDuration\(avgMs\), "平均着手時間"\),\s*buildStat\(\`\$\{state\.history\.length\}件\`, "着手件数"\)\s*,?\s*\)/s);
});

test("formatDuration always includes minutes for durations with hours", () => {
  const app = read("app.js");
  assert.match(app, /if \(h > 0\) return \`\$\{h\}時間\$\{m\}分\`;/);
  assert.doesNotMatch(app, /if \(h > 0\) return m > 0/);
});

test("about page describes the light Japanese presentation", () => {
  const about = read("about.html");
  assert.match(about, /#FFFCF7/i);
  assert.doesNotMatch(about, /ダークテーマ|漆黒の背景/);
  assert.match(about, /prefers-reduced-motion/);
});

test("burn edge is linear and progress names include the title", () => {
  const app = read("app.js");
  assert.match(app, /--burn-edge.*1 - progress/);
  assert.equal(app.includes("燃焼進行度: ${item.title}"), true);
});
