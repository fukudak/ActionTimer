# 吉日タイマー ドキュメント

「思い立ったが吉日」× 72時間の法則を可視化する個人用PWA。
プロジェクト全体の意図・不変条件・障害モードは [`../CLAUDE.md`](../CLAUDE.md) を参照。
このフォルダには、より詳細な判断の記録と検証手順を **テーマ別** にまとめる。

| 文書 | 内容 |
|------|------|
| [設計 — `design.md`](./design.md) | 技術構成(PWA / Vanilla JS / localStorage)を選んだ理由、却下した代替案、見直し条件 |
| [テスト — `testing.md`](./testing.md) | 自動テスト戦略(`node:test` + 自前DOMスタブ)と、実ブラウザ・実機でしか確認できない手動検証手順 |
| [運用 — `operations.md`](./operations.md) | ローカル配信手順、Service Worker キャッシュ更新規約 |
| [着せ替えカタログ — `cosmetic-iap-catalog.md`](./cosmetic-iap-catalog.md) | v1の有料配色。課金仕様の正本は pwa-billing-reference 側 |

> 過去はこれらを `docs/adr/`(ADR形式)と `docs/manual-verification.md` に分散して記録していたが、
> 設計 / テスト / 運用の3テーマに統合した。判断の根拠・却下案・見直し条件は各文書内に残してある。
