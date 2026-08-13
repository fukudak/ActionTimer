# 吉日タイマー(全体画面) — Fluent 2 案

- 作成日: 2026-08-13
- 対象プラットフォーム: Web(レスポンシブ、320px〜、PWA)
- 公式参考: https://fluent2.microsoft.design/

## 1. コンセプト一行

Acrylic / Mica の半透明レイヤーで「灰と煙」の質感を出し、Reveal で導火線に触れる緊張感を可視化する落ち着いた Fluent 案。

## 2. レイアウト

```
+--------------------------------------+
| Title bar(Mica ベース、シンプルタイトル)|
+--------------------------------------+
| Input + Button(Primary)「点火する」    |
+--------------------------------------+
| Text 500 "燃えている"                  |
|  Card(layer1, Acrylic) task1          |
|    ProgressBar(燃焼メーター)           |
|    Badge(danger) 残り時間 + Button(Subtle)着手 |
|  Card(layer1, Acrylic) task2(緊急)     |
+--------------------------------------+
| Text 500 "不発弾"                      |
|  Card(layer2) + Badge(warning)不発弾   |
|    Button(Subtle)再点火 / Button(Outline, danger)削除 |
+--------------------------------------+
```

CommandBar や NavigationView は使わず、Title bar + 縦積みの Card 群のみ。業務系コンポーネントを画面規模に合わせて最小限に絞る。

## 3. コンポーネント選択

| 用途 | コンポーネント |
|------|---------------|
| ナビゲーション | Title bar(シンプルタイトルのみ、CommandBar 不要) |
| 主要アクション | Button(Primary)「点火する」 |
| 入力 | Input |
| データ表示 | Card(layer1 / layer2)、ProgressBar(燃焼メーター)、Badge |
| ダイアログ等 | 未使用 |

## 4. Color トークン

- 背景: `colorNeutralBackground1`(Mica ベース、アプリ全体の基調)
- 前景: `colorNeutralForeground1` / `colorNeutralForeground2`
- アクセント: `colorBrandBackground` / `colorBrandForeground1`(Brand ramp を ember 色系に設定)
- 状態: `colorStatusDangerForeground1`(緊急な残り時間)、`colorStatusWarningForeground1`(不発弾)

## 5. Typography

| ロール | スケール / フォント |
|--------|---------------------|
| Display | 未使用 |
| Title | Text 500(アプリタイトル・セクション見出し) |
| Body | Text 400(カードタイトル)、Text 300(残り時間・キャプション) |
| Label / Caption | Text 200(Badge) |

フォント: Segoe UI Variable(和文は既存同様システムフォールバック)。

## 6. Shape / Elevation / Materials

- Corner radius: 控えめ(4 / 6 / 8)。M3 より小さく、業務 UI に馴染む密度感。
- Elevation: Background layer1(Mica)、Card layer1(Acrylic、燃焼中カード)、Card layer2(不発弾、より不透明で「燃え尽きた後」を表現)。Shadow 4 程度。
- Material: Acrylic(強いぼかし+透過、燃焼中カード)、Mica(弱いぼかし、背景全体)。

## 7. Motion / Interaction

- Curve: 進入 easeOut(150ms)、退出 easeIn(300ms)。
- 主要インタラクション: Reveal — カードにフォーカス/ホバーすると縁が光り、「導火線に触れた」質感を演出。燃え尽きは easeIn フェード + `colorNeutralForeground` disabled 化。
- モバイル(タッチ)では hover が無いため、Reveal は focus-visible 時の代替表現を用意する。

## 8. Accessibility

- WCAG AA(4.5:1)以上、AAA(7:1)推奨。
- High Contrast モード(`forced-colors`)への対応を標準装備として維持。
- Keyboard Navigation を優先度高く設計(Tab 順・フォーカスリング)。

## 9. 強み・弱み(この画面での評価)

- **強み**: Acrylic / Mica の半透明レイヤーが「煙にかすむ」「灰化していく」質感の表現に自然に馴染む。項目数が増えても業務 UI の底力で崩れにくい。High Contrast モード対応が標準装備で、既存の focus-visible / prefers-reduced-motion 方針と親和性が高い。
- **弱み / 懸念**: Windows / 業務系の印象が強く、既存の和風・情緒的な世界観とは温度差がある。Reveal のホバー演出はモバイル中心のこのアプリでは機能しにくい(タッチには hover が無い)。
- **想定ユーザー反応**: 「実務的で落ち着くが、"燃える"というエモーショナルな核が薄まる」。

## 10. HTML/CSS モックアップ

実体は [`fluent-2.html`](./fluent-2.html) を参照。

```css
:root {
  --colorBrandBackground: #b6421c;
  --colorBrandForeground1: #b6421c;
  --colorNeutralBackground1: #faf7f4;
  --colorNeutralForeground1: #1f1a16;
  --colorNeutralForeground2: #5c5049;
  --colorStatusDangerForeground1: #b3261e;
  --colorStatusWarningForeground1: #8a5a1f;
  color-scheme: light dark;
}
```
