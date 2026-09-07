"use strict";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (name) => readFileSync(new URL(name, root), "utf8");

const forbidden = [
  "心理学の研究", "実行率が激減", "忘却が原因", "完全無料", "広告なし", "課金なし",
  "ネイティブ感覚", "🔔", "🔥", "📱", "🌫️", "📋", "🚫", "💣", "🔇", "🔒",
];

test("LP states the 72-hour product promise without unsupported claims", () => {
  const html = read("about.html");
  assert.match(html, /思い立ったことに72時間の区切りをつける/);
  assert.match(html, /72時間の行動タイマー/);
  assert.match(html, /思い立ったことに、72時間の火をつける。/);
  assert.match(html, /通知なし/);
  assert.match(html, /アカウント不要/);
  for (const token of forbidden) assert.equal(html.includes(token), false, token);
});

test("LP copy states the fixed deadline and input-free start flow", () => {
  const html = read("about.html");
  assert.match(html, /72時間は固定で、延長や一時停止はできません。/);
  assert.match(html, /残り時間を確認し、「着手」を押すだけ。理由やメモの追加入力はありません。/);
  assert.doesNotMatch(html, /72時間は固定。/);
  assert.doesNotMatch(html, /余計な操作はありません。/);
});

test("LP preview and explanations disclose examples, urgency, storage, and averages", () => {
  const html = read("about.html");
  assert.match(html, /※タイトルと残り時間は表示例です。/);
  assert.match(html, /残り時間の文字を赤く太字で表示します。/);
  assert.match(html, /登録内容と履歴は、あなたの端末内だけに保存。/);
  assert.match(html, /平均着手時間は、着手した各項目の点火から着手までの時間の平均です。/);
  assert.doesNotMatch(html, /あなたの端末だけで動く。/);
});

test("LP documents the real product flow and local-only boundaries", () => {
  const html = read("about.html");
  for (const token of [
    "歯医者を予約する", "残り 51時間24分", "着手", "左へスワイプして削除",
    "点火", "残り12時間未満", "点火日時", "着手日時", "再点火", "燃え尽きた",
    "平均18時間40分",
    "localStorage", "この端末・このブラウザ", "保存サーバーなし", "オフラインPWA",
    "アプリをオンラインで一度開き、キャッシュ完了後はオフラインでも開けます。",
    "端末間・ブラウザ間同期なし", "サイトデータ削除で登録・履歴は消失", "import/exportなし",
    "履歴全件クリア", "取り消せません",
  ]) assert.match(html, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), token);
});

test("LP has the accessible semantic shell and exact CTA labels", () => {
  const html = read("about.html");
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<nav\b/);
  assert.match(html, /<main\b/);
  assert.match(html, /<footer\b/);
  assert.match(html, /今すぐ点火する/);
  assert.match(html, /仕組みを見る/);
  assert.match(html, /吉日タイマーを開く/);
  assert.doesNotMatch(html, /72時間の法則/);
  assert.doesNotMatch(html, /<svg(?![^>]*aria-hidden="true")/);
});

test("LP uses canonical app and about routes for every navigation link", () => {
  const html = read("about.html");
  assert.match(html, /<a class="brand" href="\/about"[\s\S]*?吉日タイマー/);
  assert.deepEqual(
    [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[2].trim(), match[1]]).filter(([label]) => ["アプリを開く", "今すぐ点火する", "吉日タイマーを開く", "このページについて"].includes(label)),
    [
      ["アプリを開く", "/"],
      ["今すぐ点火する", "/"],
      ["吉日タイマーを開く", "/"],
      ["アプリを開く", "/"],
      ["このページについて", "/about"],
    ]
  );
  assert.doesNotMatch(html, /href="\.\/(?:index|about)\.html"/);
});

test("LP product preview presents the start control as a non-interactive visual", () => {
  const html = read("about.html");
  assert.doesNotMatch(html, /<button\b[^>]*\bmock-start\b/);
  assert.match(html, /<span\s+class="mock-start"\s+aria-hidden="true">着手<\/span>/);
});

test("LP visual contract uses the warm palette, restrained motion, and responsive constraints", () => {
  const html = read("about.html");
  for (const token of ["#F7F3EA", "#FFFCF7", "#EFE8DC", "#26231F", "#655F56", "#D8CFC1", "#A63E2B", "#873224", "#D96A2B", "#E3A329", "#7B2F21", "1120px", "640px", "72px", "120px", "44px", "prefers-reduced-motion"]) {
    assert.ok(html.toUpperCase().includes(token.toUpperCase()), token);
  }
  assert.doesNotMatch(html, /100svh|100vh/);
  assert.doesNotMatch(html, /backdrop-filter|feTurbulence|radial-gradient|linear-gradient/);
  assert.match(html, /animation-duration:\s*2\.4s|animation:\s*[^;]*2\.[4-9]s/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /全表示|opacity:\s*1/);
});

test("LP reveal contract has real section targets without hiding hero or primary CTA", () => {
  const html = read("about.html");
  const revealTargets = html.match(/<section\b[^>]*\bclass="[^"]*\breveal\b[^"]*"/g) ?? [];
  assert.ok(revealTargets.length >= 4, "主要セクションにreveal対象が4件以上必要");
  assert.match(html, /<section class="hero"/);
  assert.match(html, /<section class="cta"/);
  assert.doesNotMatch(html, /<section class="hero[^"]*\breveal/);
  assert.doesNotMatch(html, /<section class="cta[^"]*\breveal/);
});

test("LP reveal motion has observer, unsupported-browser, and reduced-motion contracts", () => {
  const html = read("about.html");
  assert.match(html, /const revealItems = document\.querySelectorAll\('\.reveal'\)/);
  assert.match(html, /const showAll = \(\) => revealItems\.forEach/);
  assert.match(html, /'IntersectionObserver' in window/);
  assert.match(html, /!window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(html, /else showAll\(\)/);
  assert.match(html, /\.reveal \{[^}]*opacity:\s*0[^}]*transform:\s*translateY\(12px\)[^}]*transition:\s*opacity 400ms ease, transform 400ms ease/s);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.reveal \{[^}]*opacity:\s*1[^}]*transform:\s*none/s);
});

test("service worker cache version advances for the LP release", () => {
  const sw = read("sw.js");
  assert.match(sw, /const CACHE_VERSION = "kichijitsu-v26";/);
});
