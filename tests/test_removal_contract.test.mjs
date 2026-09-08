"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

test("backup UI and implementation are fully removed", () => {
  const inspectedFiles = [
    "index.html", "app.js", "style.css",
    "docs/README.md", "docs/design.md", "docs/operations.md", "docs/testing.md",
    "tests/helpers/dom_stub.mjs",
    "tests/test_normal_core.test.mjs", "tests/test_boundary_core.test.mjs",
    "tests/test_error_core.test.mjs", "tests/test_regression_core.test.mjs",
  ];
  const implementationTokens = [
    ["data", "heading"].join("-"), ["export", "btn"].join("-"), ["import", "btn"].join("-"), ["import", "input"].join("-"), ["data", "status"].join("-"),
    ["data", "section"].join("-"), ["data", "note"].join("-"), ["data", "actions"].join("-"), ["btn", "data"].join("-"), "serialize" + "State",
    "backup" + "Stamp", "export" + "Data", "import" + "State", "import" + "FromFile", "show" + "DataStatus",
    "Bl" + "ob", "File" + "Reader", "create" + "ObjectURL", "revoke" + "ObjectURL", "kichijitsu-" + "backup-",
  ];
  const productFiles = ["index.html", "app.js", "style.css", "tests/helpers/dom_stub.mjs", "tests/test_normal_core.test.mjs", "tests/test_boundary_core.test.mjs", "tests/test_error_core.test.mjs", "tests/test_regression_core.test.mjs"];
  for (const file of productFiles) {
    const source = read(file);
    for (const token of implementationTokens) assert.equal(source.includes(token), false, `${file}: ${token}`);
  }
  const documentationTokens = ["データの" + "保管", "書き" + "出す", "バック" + "アップ", "ダウンロード" + "UI"];
  for (const file of inspectedFiles) {
    const source = read(file);
    for (const token of documentationTokens) assert.equal(source.includes(token), false, `${file}: ${token}`);
  }
  const html = read("index.html");
  assert.equal(html.includes("読み" + "込む"), false, "index.html: 読み込む");
  assert.equal(html.includes("72h有限の明かり"), false, "index.html: 右上の縦札");
  assert.equal(read("style.css").includes(".seal"), false, "style.css: .seal");
  assert.equal(existsSync(new URL("test_backup_core.test.mjs", import.meta.url)), false);
  const app = read("app.js");
  assert.match(html, /id="save-error"/);
  assert.match(app, /kichijitsu-timer-v1/);
});

test("service worker cache version and PNG assets include the LP", () => {
  const sw = read("sw.js");
  assert.match(sw, /const CACHE_VERSION = "kichijitsu-v27";/);
  const block = sw.match(/const ASSETS = \[([\s\S]*?)\];/)?.[1] ?? "";
  const assets = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(assets, [
    "./", "./index.html", "./about.html", "./style.css", "./app.js", "./manifest.webmanifest",
    "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png",
  ]);
});
