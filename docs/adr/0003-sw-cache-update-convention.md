# ADR-003: Service Worker キャッシュ更新の運用規約

## Status
`Accepted`

## Context
`sw.js` は Cache-First 戦略を採用しており、`CACHE_VERSION` を変えないと古いアセットがユーザーの手元に残り続ける。フェーズ1でPNGアイコンを追加した際、この運用を一度経験したため規約として明文化する。

## Decision
配信物(HTML/CSS/JS/アイコン/manifest等)を追加・変更するたびに、以下を **必ずセットで行う**:

1. `sw.js` の `CACHE_VERSION` を新しい文字列に上げる(例: `kichijitsu-v4` → `kichijitsu-v5`)。
2. `sw.js` の `ASSETS` 配列に追加ファイルを漏れなく列挙する。

## Rationale
- `CACHE_VERSION` を上げることで `activate` イベント時に旧キャッシュが自動削除される。
- `ASSETS` に含めないファイルはオフライン時に503になる。
- この2点はセットであり、片方だけでは意味がない。

## チェックリスト(PRレビュー等で使用)
- [ ] 新規ファイルを `ASSETS` に追加したか
- [ ] `CACHE_VERSION` を前回と異なる値に変更したか
- [ ] `BURNOUT_ANIM_MS` 等アプリ定数の変更と無関係にバージョンを上げていないか

## Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|----------------------|
| Network-First | オフライン対応が崩れる |
| `no-cache` ヘッダで管理 | ホスティング設定不要のファイル配信前提に反する |
| workbox 等ライブラリ | 依存なし・ビルドなし方針(ADR-001)に反する |

## Consequences
- 配信物を変更するたびに手動で `CACHE_VERSION` を更新する作業が発生する(許容済み)。
- 2タブ同時操作時に旧SWと新SWが混在する過渡状態が1回のリロードまで残る(既知の制限、異常系#7で検証済み)。

## Revisit Conditions
- ビルド工程を導入したとき(workbox 等への移行を再検討)。
