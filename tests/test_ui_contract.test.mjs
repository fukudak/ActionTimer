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

test("production files exclude mock-only product features", () => {
  for (const file of ["index.html", "style.css", "app.js"]) {
    const source = read(file);
    for (const token of ["totalRegistered", "completionRate", "averageTime", "pending-delete", "view-switch", "sort-button"]) {
      assert.equal(source.includes(token), false, `${file}: ${token}`);
    }
  }
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
