# ADR-002: テストはNode組み込みランナー + 自前DOMスタブで書く

## Status
`Accepted`

## Context
テスト方針(正常系/境界値/異常系の3層)に基づくテストコードが必要になった。方針のテンプレートはpytest形式だが、この環境のPython 3.9にはpytestが未導入で、アプリ本体はブラウザ前提のVanilla JS(ADR-001: 依存なし・ビルドなし)である。

## Decision
Node.js組み込みの `node:test` を使い、`vm` で隔離したコンテキストに最小限のDOMスタブを与えて `app.js` を直接読み込む方式でテストする。pytest形式の規約(3層のファイル分割・テスト名・日本語docstring)は命名規則として踏襲する。

## Rationale
- `node:test` / `node:assert` はNode本体に同梱で、npm依存ゼロ。ADR-001の「依存なし」方針と整合する
- 偽のDate/setTimeout/setIntervalを注入できるため、72時間経過や燃え尽きの瞬間を決定的にテストできる(実ブラウザでは不可能)
- app.jsを書き換えずそのまま読み込むので、テスト用の特別な構造をアプリ側に要求しない

## Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|----------------------|
| pytest + Playwright | pytest/Playwrightともに未導入で、導入コストと依存がnode:testより大きい |
| Jest + jsdom | npm依存とnode_modulesが発生し、ビルドなし方針に反する |
| ブラウザ上のテストページ | 自動実行・CI化ができず、時刻の偽装も困難 |

## Consequences
- DOMスタブは実DOMの完全な再現ではない(textContentの子要素クリア、innerHTMLの簡易パースなど必要分のみ)。スタブの忠実度に起因する見逃しは手動検証手順書(docs/manual-verification.md)で補完する
- 実ブラウザでしか起きない事象(Service Worker、プライベートモード、A2HS)は自動テストの対象外で、手動検証に分離した
- vmの別レルムで生成された配列は `assert.deepStrictEqual` でプロトタイプ不一致になるため、長さ・要素単位で検証する

## Revisit Conditions
- アプリにビルド工程やnpm依存を導入することになったとき(Vitest等を再検討)
- スタブと実DOMの乖離が原因の不具合が2回以上発生したとき(Playwright導入を再検討)
