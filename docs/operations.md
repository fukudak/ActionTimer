# 運用

ローカル配信手順と、Service Worker キャッシュ更新の運用規約をまとめる。
既知の負債・障害モードは [`../CLAUDE.md`](../CLAUDE.md) を参照。

## 配信(ローカル起動)

```bash
cd /path/to/ActionTimer
python3 -m http.server 8000
# ブラウザで http://localhost:8000 を開く
```

Service Worker は `file://` では動かないため、動作確認には必ず HTTP 配信を使う。

---

## Service Worker キャッシュ更新規約

**状態:** Accepted

### 背景
`sw.js` は Cache-First 戦略を採用しており、`CACHE_VERSION` を変えないと古いアセットが
ユーザーの手元に残り続ける。PNGアイコンを追加した際にこの運用を一度経験したため、規約として明文化する。

### 決定
配信物(HTML / CSS / JS / アイコン / manifest 等)を追加・変更するたびに、以下を **必ずセットで行う**:

1. `sw.js` の `CACHE_VERSION` を新しい文字列に上げる(例: `kichijitsu-v5` → `kichijitsu-v6`)。
2. `sw.js` の `ASSETS` 配列に追加ファイルを漏れなく列挙する。

### 根拠
- `CACHE_VERSION` を上げることで `activate` イベント時に旧キャッシュが自動削除される。
- `ASSETS` に含めないファイルはオフライン時に503になる。
- この2点はセットであり、片方だけでは意味がない。

### チェックリスト(PRレビュー等で使用)
- [ ] 新規ファイルを `ASSETS` に追加したか
- [ ] `CACHE_VERSION` を前回と異なる値に変更したか
- [ ] `BURNOUT_ANIM_MS` 等アプリ定数の変更と無関係にバージョンを上げていないか

### 却下した代替案

| 代替案 | 却下理由 |
|--------|----------|
| Network-First | オフライン対応が崩れる |
| `no-cache` ヘッダで管理 | ホスティング設定不要のファイル配信前提に反する |
| workbox 等ライブラリ | 依存なし・ビルドなし方針([設計](./design.md))に反する |

### 結果
- 配信物を変更するたびに手動で `CACHE_VERSION` を更新する作業が発生する(許容済み)。
- 2タブ同時操作時に旧SWと新SWが混在する過渡状態が1回のリロードまで残る
  (既知の制限。[テスト](./testing.md) 異常系#7で検証済み)。

### 見直し条件
- ビルド工程を導入したとき(workbox 等への移行を再検討)。
