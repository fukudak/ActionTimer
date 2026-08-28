"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (name) => readFileSync(new URL(name, root));
const pngSize = (buffer) => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

test("production icons have required dimensions and fixed identities", () => {
  const pairs = [
    ["icons/apple-touch-icon.png", [180, 180], "451aa254005915edb3ce0b6b19162261b2e4d97ea61797e49fe33b1b7f41ad99"],
    ["icons/icon-192.png", [192, 192], "f061683bcd4682c4f04ceec4fc2632d6146b642b83d72d22776852a1ae014719"],
    ["icons/icon-512.png", [512, 512], "fb51c51cae1cf9356095e42f276be2fa5c8dae95ff5e845a5372cf32e579c741"],
  ];
  for (const [targetName, dimensions, expectedSha256] of pairs) {
    const target = read(targetName);
    assert.deepEqual(pngSize(target), dimensions, targetName);
    assert.equal(sha256(target), expectedSha256, `${targetName} must keep its fixed identity`);
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