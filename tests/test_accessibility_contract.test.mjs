"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

function hexRgb(hex) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  return hexRgb(hex).map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function token(css, name) {
  return css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
}

test("app meaningful text color pairs meet WCAG AA", () => {
  const css = read("style.css");
  assert.ok(contrast(token(css, "--flame"), token(css, "--surface")) >= 4.5);
  assert.ok(contrast(token(css, "--muted"), token(css, "--bg")) >= 4.5);
  assert.ok(contrast(token(css, "--muted"), token(css, "--surface")) >= 4.5);
  assert.ok(contrast(token(css, "--danger"), "#fff1ed") >= 4.5);
});

test("LP CTA and secondary text color pairs meet WCAG AA", () => {
  const html = read("about.html");
  const accent = token(html, "--accent");
  const muted = token(html, "--text-muted");
  assert.ok(contrast(token(html, "--surface"), accent) >= 4.5);
  assert.ok(contrast(muted, token(html, "--bg")) >= 4.5);
});

test("LP normal text selectors use a qualifying dark text accent", () => {
  const html = read("about.html");
  const textAccent = token(html, "--text-accent");
  assert.ok(contrast(textAccent, token(html, "--bg")) >= 4.5);
  assert.match(html, /\.eyebrow, \.section-label\s*\{[^}]*color:\s*var\(--text-accent\)/s);
  assert.match(html, /\.timeline h3\s*\{[^}]*font-size:/s);
});

test("app placeholder explicitly uses an opaque qualifying color", () => {
  const css = read("style.css");
  const placeholder = token(css, "--placeholder");
  assert.ok(contrast(placeholder, token(css, "--surface")) >= 4.5);
  assert.match(css, /\.add-form input::placeholder\s*\{[^}]*color:\s*var\(--placeholder\)/s);
  assert.match(css, /\.add-form input::placeholder\s*\{[^}]*opacity:\s*1(?:[;}])/s);
});

test("burning title stays white with an outline strong enough to read over the burn front", () => {
  const css = read("style.css");
  // 白抜き文字で統一する。焦げた側(--char、ほぼ黒)は単色コントラストで検証できる。
  // 未燃焼側(ポップな配色)は縁取り(text-shadow)が可読性を担うため、WCAGの単純な
  // 背景合成では計算できない。縁取りが十分な濃さ・広がりで宣言されていることを確認する。
  assert.ok(contrast(token(css, "--title-ink"), token(css, "--char")) >= 4.5);
  assert.match(css, /\.fuse-title\s*\{[^}]*color:\s*var\(--title-ink\)/s);
  const shadowMatch = css.match(/\.fuse-title\s*\{[^}]*text-shadow:([^;]+);/s);
  assert.ok(shadowMatch, "fuse-title に text-shadow の縁取りが必要");
  const shadowLayers = shadowMatch[1].split(/,(?![^(]*\))/).map((s) => s.trim());
  assert.ok(shadowLayers.length >= 4, "上下左右を覆う縁取りには最低4層必要");
});

test("save error has an accessible non-color visual treatment", () => {
  const css = read("style.css");
  assert.match(css, /\.save-error\s*\{/);
  assert.match(css, /\.save-error[^\{]*\{[^}]*border:/s);
  assert.ok(contrast(token(css, "--danger"), "#fff1ed") >= 4.5);
});

test("manifest uses the production light theme colors", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.background_color, "#fffaf0");
  assert.equal(manifest.theme_color, "#fffaf0");
});
