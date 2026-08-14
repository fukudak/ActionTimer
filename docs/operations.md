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

## Cloudflare Workers 配信(Git 連携)

**状態:** Accepted

### 決定
本番は Cloudflare Workers(`kichijitsu-timer`)で配信する。
`main` への push で Workers Builds が自動デプロイする(Dashboard の Git 連携)。

### 公開 URL
https://kichijitsu-timer.fukudz-5dc.workers.dev

### Builds 設定(Dashboard: Worker → Settings → Builds)

| 項目 | 値 |
|------|-----|
| Git repository | `fukudak/ActionTimer` |
| Branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

`dist/` は gitignore のため、Builds では `npm run build` で配信物を組み立ててから `wrangler deploy` する。ビルドはLPの `about.html` もコピーする。
Worker 名は `wrangler.toml` の `name`(`kichijitsu-timer`)と一致させること。

### 手動デプロイ(ローカル)

```bash
npm run deploy
```

### 初回 Git 連携手順
1. [Workers Builds 設定](https://dash.cloudflare.com/5dccf45aed075e55d070dd7effb31f34/workers/services/view/kichijitsu-timer/settings) を開く
2. **Builds → Connect** で GitHub を認可し、`fukudak/ActionTimer` を接続する
3. 上記の Build / Deploy コマンドを設定して保存する
4. `main` に push すると自動デプロイされる

---

## Service Worker キャッシュ更新規約

**状態:** Accepted

### 背景
`sw.js` は Cache-First 戦略を採用しており、`CACHE_VERSION` を変えないと古いアセットが
ユーザーの手元に残り続ける。PNGアイコンを追加した際にこの運用を一度経験したため、規約として明文化する。

### 決定
配信物(HTML / CSS / JS / アイコン / manifest 等)を追加・変更するたびに、以下を **必ずセットで行う**。現在の明色一行UI昇格に伴う変更は、未リリースの `kichijitsu-v12` にまとめて反映する。次のリリースでは `CACHE_VERSION` を `v13` 以降へ上げる。

1. `sw.js` の `CACHE_VERSION` を新しい文字列に上げる(例: `kichijitsu-v5` → `kichijitsu-v6`)。
2. `sw.js` の `ASSETS` 配列に追加ファイルを漏れなく列挙する。

### 根拠
- `CACHE_VERSION` を上げることで `activate` イベント時に旧キャッシュが自動削除される。
- `ASSETS` に含めないファイルはオフライン時に503になる。
- この2点はセットであり、片方だけでは意味がない。

### チェックリスト(PRレビュー等で使用)
- [ ] 新規ファイルを `ASSETS` に追加したか
- [ ] `CACHE_VERSION` を前回と異なる値に変更したか
- [ ] `dist/about.html` がソースと一致するか
- [ ] `BURNOUT_ANIM_MS` 等アプリ定数の変更と無関係にバージョンを上げていないか

### 却下した代替案

| 代替案 | 却下理由 |
|--------|----------|
| Network-First | オフライン対応が崩れる |
| `no-cache` ヘッダで管理 | ホスティング設定不要のファイル配信前提に反する |
| workbox 等ライブラリ | 依存なし方針([設計](./design.md))に反する |

### 結果
- 配信物を変更するたびに手動で `CACHE_VERSION` を更新する作業が発生する(許容済み)。
- 2タブ同時操作時に旧SWと新SWが混在する過渡状態が1回のリロードまで残る
  (既知の制限。[テスト](./testing.md) 異常系#7で検証済み)。

### 見直し条件
- ビルド工程を導入したとき(workbox 等への移行を再検討)。
