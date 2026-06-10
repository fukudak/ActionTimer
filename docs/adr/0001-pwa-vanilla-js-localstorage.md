# ADR-001: PWA + Vanilla JS + localStorage を採用する

## Status
`Accepted`

## Context
72時間の法則に基づく「吉日タイマー」を新規開発する。登録した項目が72時間で燃え尽きる様子を可視化する、個人用の小さなアプリ。プラットフォーム選定が必要だった(ユーザー確認済み: PWA前提のWebアプリ、リマインド通知は不要)。

## Decision
ビルド工程なしの Vanilla JS 単一ページPWAとし、永続化は localStorage のみとする。

## Rationale
- 通知不要のため、ネイティブアプリ(Flutter)の主な利点が消える
- PWAならスマホのホーム画面に置けて、オフラインでも開ける
- 機能が小さく(登録・表示・移動の3操作)、フレームワークや外部依存は過剰
- サーバー・アカウント不要で、データは端末内で完結する

## Rejected Alternatives

| Alternative | Reason for Rejection |
|-------------|----------------------|
| Flutter (iOS/Android) | 通知不要のため利点が薄く、開発・ビルド・配布コストが過大 |
| React/Vue + ビルド工程 | 3操作のアプリに対して依存とビルドの維持コストが見合わない |
| IndexedDB | データ量が極小(数十件のテキスト)で localStorage で十分 |

## Consequences
- 端末・ブラウザをまたいだ同期はできない(許容済み)
- iOSホーム画面用PNGアイコンが未整備(Known Debtに記録)
- Service Worker更新時はキャッシュバージョン管理が必要

## Revisit Conditions
- リマインド通知が必要になったとき(Push対応のためサーバーかネイティブ化を再検討)
- 複数端末での同期が必要になったとき
