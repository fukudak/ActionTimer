# 吉日タイマー(全体画面) — Liquid Glass 案

- 作成日: 2026-08-13
- 対象プラットフォーム: Web(レスポンシブ、320px〜、PWA)。ネイティブなら iOS/iPadOS を想定。
- 公式参考: https://developer.apple.com/documentation/technologyoverviews/liquid-glass
  - **注記**: 2026-08-13 時点で WebFetch による公式ドキュメント本文の取得に失敗(JS 描画ページで本文が取得できなかった)。本案は `references/liquid-glass.md` のキャッシュ要約に基づく。具体的な API 名・トークン名・数値は公式未確認(Open Questions 参照)。

## 1. コンセプト一行

燃える付箋がガラス層の下で発光しているような透明感と specular highlight で、「炎の光そのもの」を演出する Liquid Glass 案。

## 2. レイアウト

```
+--------------------------------------+
| Large Title "吉日タイマー"             |
|   (glass ツールバー越しに表示)         |
+--------------------------------------+
| TextField(glass Material 背景)        |
| Button(borderedProminent)「点火する」  |
+--------------------------------------+
| Title2 "燃えている"                    |
|  List row(glass, tint=ember) task1    |
|    burn meter(発光グラデーション)       |
|    残り時間 Label + Button(bordered)着手|
|  List row(glass, tint=ember, 強め) task2(緊急) |
+--------------------------------------+
| Title2 "不発弾"                        |
|  List row(Thin glass, tint=ash) task  |
|    Button(plain)再点火 / Button(borderless, destructive)削除 |
+--------------------------------------+
```

背景は暗色ベース(墨色相当)を想定し、その上に glass 層のカードが浮く構成。既存アプリのダーク基調と親和性が高い。

## 3. コンポーネント選択

| 用途 | コンポーネント |
|------|---------------|
| ナビゲーション | NavigationStack(Large Title → スクロールで Inline Title) |
| 主要アクション | Button(borderedProminent)「点火する」 |
| 入力 | TextField(glass Material 背景) |
| データ表示 | List(glass Material の Row)、カスタム燃焼メーター |
| ダイアログ等 | 未使用 |

## 4. Color トークン

- 背景: `systemBackground` / `systemGroupedBackground`(暗色ベース)
- 前景: `Label` / `secondaryLabel`
- アクセント: Tint color(ember オレンジ系をアプリ全体の Tint に設定。控えめにコントロールへ適用)
- 状態: `systemRed`相当(緊急な残り時間)、`systemBrown`/`systemOrange`相当(不発弾=灰)

## 5. Typography

| ロール | スケール / フォント |
|--------|---------------------|
| Display | Large Title(アプリタイトル) |
| Title | Title 2(セクション見出し・カードタイトル) |
| Body | Body(タグライン) |
| Label / Caption | Footnote(残り時間・キャプション) |

フォント: SF Pro(和文は既存同様システムフォールバック)。Dynamic Type 必須。

## 6. Shape / Elevation / Materials

- Corner radius: squircle(連続曲率)、16〜28pt 相当。
- Depth: 影は控えめ。ブラー + 透過素材で「上のレイヤ」感を出す。縁に specular highlight(細い光)を入れる。
- Material: Regular Material(燃焼中カード)、Thin Material(不発弾=より薄く霞んだ扱いにし、"燃え尽きて灰化した"状態を素材の厚みで表現)。

## 7. Motion / Interaction

- Spring 物理(response/damping)でカードの出現・削除。
- 燃え尽きは matched geometry 的にしぼみながらフェード(液体的な変形)。
- Reduce Motion 設定時はフルアニメーションをフェードに置換。

## 8. Accessibility

- Dynamic Type 必須。
- Reduce Transparency 設定時は glass を不透明・高コントラストな背景に切り替える。
- Reduce Motion 設定時は spring を控えめなフェードに置換。
- VoiceOver: ガラスの装飾が読み上げ順序を乱さないよう、論理的な読み上げ順を明示的に定義する。

## 9. 強み・弱み(この画面での評価)

- **強み**: 半透明 + specular highlight は「燃えている光」そのものの表現と非常に相性が良く、既存の炎メタファーを直接的に強化できる。不発弾(灰)を Thin Material で「霞んだ」表現にすることで、既存の色褪せた不発弾演出と自然に一致する。PWA としてホーム画面に置く既存方針とも親和性が高い。
- **弱み / 懸念**: Web(非 Safari)での `backdrop-filter` 表現の実装コストとブラウザ差異(特に Android Chrome)。情報量が少ない画面では glass 装飾が「効果のための効果」になりやすく、HIG の「装飾目的の濫用はしない」という原則に反するリスクがある。具体的な API・トークン名は公式ドキュメント取得に失敗しており未確認。
- **想定ユーザー反応**: 「最も"かっこよく・燃えている"感に近いが、実装難度と一部端末での質感崩れが懸念される」。

## 10. HTML/CSS モックアップ

実体は [`liquid-glass.html`](./liquid-glass.html) を参照。`backdrop-filter: blur()` + 半透明色で近似実装。

```css
:root {
  --tint: #ff7a3d;
  --system-background: #0b0a09;
  --label: #f5efe8;
  --secondary-label: #b7a99b;
  color-scheme: dark light;
}
```
