# 吉日タイマー(全体画面) — Material Design 3 案

- 作成日: 2026-08-13
- 対象プラットフォーム: Web(レスポンシブ、320px〜、PWA)
- 公式参考: https://m3.material.io/

## 1. コンセプト一行

Dynamic Color で「炎」の tonal palette を主役に据え、Expressive なモーションで導火線の緊迫感を演出する M3 案。

## 2. レイアウト

```
+--------------------------------------+
| Top App Bar (Small, center-aligned)   |
|   "吉日タイマー" + タグライン(caption) |
+--------------------------------------+
| TextField(Outlined)                   |
| "72時間以内に始めること"               |
| [FAB (Extended): 点火する]             |
+--------------------------------------+
| Title Medium "燃えている"              |
|  Card(Filled) burning task 1          |
|    Title / LinearProgressIndicator    |
|    残り時間 Label + Button(Filled Tonal)着手 |
|  Card(Filled, error-container tint) burning task 2(緊急) |
+--------------------------------------+
| Title Medium "不発弾"                  |
|  Card(Outlined) unexploded task       |
|    Chip "不発弾" + Button(Outlined)再点火 / Button(Text, error)削除 |
+--------------------------------------+
```

単一カラムのモバイルファースト。NavigationRail 等は使わず、画面全体を 1 本の縦スクロールにする(既存構成と同じ)。

## 3. コンポーネント選択

| 用途 | コンポーネント |
|------|---------------|
| ナビゲーション | Top App Bar(Small, center-aligned) |
| 主要アクション | FAB(Extended)「点火する」 |
| 入力 | TextField(Outlined) |
| データ表示 | Card(Filled / Outlined)、LinearProgressIndicator(燃焼メーター)、Chip(不発弾ステータス) |
| ダイアログ等 | 未使用(単一画面のため) |

## 4. Color トークン

- 背景: `surface` / `surface-container-low`
- 前景: `on-surface` / `on-surface-variant`
- アクセント: `primary` / `primary-container`(Source Color を燃える朱色系に設定し、tonal palette を炎の階調として展開)
- 状態: `error` / `error-container`(緊急な残り時間)、`tertiary` / `tertiary-container`(不発弾=灰の表現)

HEX は Source Color の起点のみプレースホルダーとして扱い、実運用は tonal palette 生成に委ねる。

## 5. Typography

| ロール | スケール / フォント |
|--------|---------------------|
| Display | 未使用(画面規模的に過剰) |
| Headline | Headline Small(アプリタイトル) |
| Title | Title Medium(セクション見出し・カードタイトル) |
| Body | Body Medium(タグライン・本文) |
| Label | Label Large(ボタン・Chip) |

フォント: Roboto Flex(和文は既存同様システムフォールバックを想定)。

## 6. Shape / Elevation / Materials

- Corner radius: Large(16)をカードに、Extra-large(28)を FAB に。
- Elevation: Level 1 Card + surface tint。緊急時は影を増やさず `error-container` の tonal 強調で表現。
- Material: 該当なし(M3 は tonal surface が主体)。

## 7. Motion / Interaction

- Easing: Emphasized Decelerate(カード進入)、Emphasized Accelerate(燃え尽き退出)。
- Duration: 燃え尽きは long(600ms)、通常のリスト更新は medium(300ms)。
- 主要インタラクション: LinearProgressIndicator は standard easing で滑らかに減少。FAB 押下時は Filled → 押し込みで elevation が沈む。

## 8. Accessibility

- タッチターゲット最小 48dp。
- コントラスト比 4.5:1(AA)以上。
- Dynamic Type 相当のフォントスケーリングに対応。

## 9. 強み・弱み(この画面での評価)

- **強み**: Dynamic Color で「炎の色」をアプリの Source Color に一元化でき、tonal palette が緊急度のグラデーション表現と相性が良い。FAB Extended の大胆な「点火する」ボタンは着火という物理動作の比喩と噛み合う。Material Web Components での実装が容易。
- **弱み / 懸念**: M3 のカードは「触れる紙」の物理感が強く平坦になりがちで、既存の「燃える付箋」演出(焼け跡・透け感・灰化)の表現力としては弱い。Android / Google 的な印象が強く、和風の世界観とは距離がある。
- **想定ユーザー反応**: 「はっきりして分かりやすいが、"燃えている"という情緒は薄れる」。

## 10. HTML/CSS モックアップ

実体は [`material-3.html`](./material-3.html) を参照。

```css
:root {
  --md-sys-color-primary: #c9491f;
  --md-sys-color-on-primary: #ffffff;
  --md-sys-color-primary-container: #ffdbc8;
  --md-sys-color-surface: #fffbf8;
  --md-sys-color-surface-container-low: #f7ede7;
  --md-sys-color-on-surface: #221a15;
  --md-sys-color-error: #ba1a1a;
  --md-sys-color-error-container: #ffdad6;
  --md-sys-color-tertiary: #6b5c3f;
  --md-sys-color-tertiary-container: #f4e0b8;
  color-scheme: light dark;
}
```
