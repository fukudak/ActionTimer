"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const cache = "/root/.hermes/profiles/dev/cache/images";
const read = (name) => readFileSync(new URL(name, root));
const pngSize = (buffer) => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

test("production icons are exact copies with required dimensions", () => {
  const pairs = [
    ["img_fa8e94591cbe.png", "icons/apple-touch-icon.png", [180, 180]],
    ["img_b575314412ec.png", "icons/icon-192.png", [192, 192]],
    ["img_af68b10af66b.png", "icons/icon-512.png", [512, 512]],
  ];
  for (const [sourceName, targetName, dimensions] of pairs) {
    const source = readFileSync(`${cache}/${sourceName}`);
    const target = read(targetName);
    assert.deepEqual(pngSize(target), dimensions, targetName);
    assert.equal(sha256(target), sha256(source), `${targetName} must exactly copy ${sourceName}`);
  }
  assert.equal(existsSync(new URL("icons/icon" + ".svg", root)), false);
});

test("manifest contains exactly the two PNG app icons", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", root), "utf8"));
  assert.deepEqual(manifest.icons, [
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ]);
  assert.equal(JSON.stringify(manifest).includes("maskable"), false);
});

test("HTML favicon contract uses the 192 PNG and Apple touch link only", () => {
  for (const file of ["index.html", "about.html"]) {
    const html = readFileSync(new URL(file, root), "utf8");
    assert.match(html, /<link rel="icon" href="icons\/icon-192\.png" type="image\/png" sizes="192x192">/);
    assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
    assert.doesNotMatch(html, new RegExp("icon" + "\\.svg"));
  }
});