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

function numericToken(css, name) {
  return Number.parseFloat(css.match(new RegExp(`${name}:\\s*([0-9.]+)`))[1]);
}

function composite(foreground, background, alpha) {
  const fg = hexRgb(foreground);
  const bg = hexRgb(background);
  return `#${fg.map((channel, index) => Math.round((channel * alpha + bg[index] * (1 - alpha)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

test("app meaningful text color pairs meet WCAG AA", () => {
  const css = read("style.css");
  assert.ok(contrast(token(css, "--flame"), token(css, "--surface")) >= 4.5);
  assert.ok(contrast(token(css, "--ash"), token(css, "--surface-alt")) >= 4.5);
  assert.ok(contrast(token(css, "--muted"), token(css, "--bg")) >= 4.5);
  assert.ok(contrast(token(css, "--muted"), token(css, "--surface")) >= 4.5);
  assert.ok(contrast(token(css, "--danger"), "#fff1ed") >= 4.5);
});

test("LP CTA and secondary text color pairs meet WCAG AA", () => {
  const html = read("about.html");
  const accent = token(html, "--accent");
  const muted = token(html, "--text-muted");
  assert.ok(contrast("#fff8ee", accent) >= 4.5);
  assert.ok(contrast(muted, token(html, "--bg")) >= 4.5);
});

test("LP normal text selectors use a qualifying dark text accent", () => {
  const html = read("about.html");
  const textAccent = token(html, "--text-accent");
  assert.ok(contrast(textAccent, token(html, "--bg")) >= 4.5);
  assert.match(html, /\.hero__eyebrow\s*\{[^}]*color:\s*var\(--text-accent\)/s);
  assert.match(html, /\.section__label\s*\{[^}]*color:\s*var\(--text-accent\)/s);
  assert.match(html, /\.step__num\s*\{[^}]*color:\s*var\(--text-accent\)/s);
});

test("app placeholder explicitly uses an opaque qualifying color", () => {
  const css = read("style.css");
  const placeholder = token(css, "--placeholder");
  assert.ok(contrast(placeholder, token(css, "--surface")) >= 4.5);
  assert.match(css, /\.add-form input::placeholder\s*\{[^}]*color:\s*var\(--placeholder\)/s);
  assert.match(css, /\.add-form input::placeholder\s*\{[^}]*opacity:\s*1(?:[;}])/s);
});

test("burning title keeps a readable effective surface over burn front", () => {
  const css = read("style.css");
  const title = token(css, "--title-ink");
  const readingSurface = token(css, "--title-surface");
  const titleAlpha = numericToken(css, "--title-surface-alpha");
  const worstEffectiveBackground = ["#b6402b", "#f6d987"]
    .map((underlying) => composite(readingSurface, underlying, titleAlpha))
    .sort((a, b) => contrast(title, a) - contrast(title, b))[0];
  assert.match(css, /\.sticky-note__title\s*\{[^}]*background:\s*var\(--title-surface\)/s);
  assert.ok(contrast(title, worstEffectiveBackground) >= 4.5);
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
