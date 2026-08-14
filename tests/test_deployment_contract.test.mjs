"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url);
const repo = new URL("..", import.meta.url).pathname;

test("build packages about.html and all service worker assets into an isolated dist", () => {
  const temp = mkdtempSync(join(tmpdir(), "actiontimer-build-"));
  try {
    execFileSync("npm", ["run", "build"], { cwd: repo, env: { ...process.env, ACTIONTIMER_DIST: temp }, stdio: "pipe" });
    assert.equal(existsSync(join(temp, "about.html")), true);
    assert.equal(readFileSync(join(temp, "about.html"), "utf8"), readFileSync(new URL("about.html", root), "utf8"));
    for (const asset of ["index.html", "style.css", "app.js", "sw.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-512.png", "icons/apple-touch-icon.png"]) {
      assert.equal(existsSync(join(temp, asset)), true, asset);
    }
    const wrangler = readFileSync(new URL("wrangler.toml", root), "utf8");
    assert.match(wrangler, /directory\s*=\s*"\.\/dist"/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("build preserves pre-existing content in a caller-provided output directory", () => {
  const temp = mkdtempSync(join(tmpdir(), "actiontimer-build-existing-"));
  const sentinel = join(temp, "sentinel.txt");
  try {
    writeFileSync(sentinel, "must survive");
    execFileSync("npm", ["run", "build"], { cwd: repo, env: { ...process.env, ACTIONTIMER_DIST: temp }, stdio: "pipe" });
    assert.equal(readFileSync(sentinel, "utf8"), "must survive");
    assert.equal(existsSync(join(temp, "index.html")), true);
    assert.equal(existsSync(join(temp, "about.html")), true);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
