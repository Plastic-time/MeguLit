# 差分草稿报告：MeguLit 見本

- 游戏 key：`rpgm-sample`
- exe：`Game.exe` SHA-256 `20a57cfa736d946ede4ccc91b5b158091c031e9a54869aecacdb52c6cfa35086`（整个文件，显示 `20a57cfa`）
- 引擎：`rpgmaker`（manifest RPG Maker MZ）
- 回放：8 句台词行，1 个自检窗口，37 条 engine-draw 记录
- 结论：**隐藏重画**，参数 `{"hideMethod":"hide","positionSource":null,"effectFrames":null,"filters":"kernel"}`，cost 0
- 草稿未签名：签名用 tools/game-diff.cjs sign，下发格式和目录归 diff-layers

## 自检指标（每个窗口取最差值）

| 指标 | 选中方案 | 最好的隐藏方案 | 阈值 | 状态 |
|---|---|---|---|---|
| hideVisible | - | - | ≤ 0.25 | 无样本 |
| dropRate | 0 | 0 | ≤ 0.15 | 过 |
| repeatRate | 0 | 0 | ≤ 0.1 | 过 |
| choiceMismatch | 0 | 0 | ≤ 1 | 过 |
| positionPx | - | - | ≤ max(96, 3×字高) | 无样本 |
| pairRate | - | - | ≥ 0.8 | 无样本 |

## 可调键离线搜索

| 键 | 各取值的最好结果 |
|---|---|
| positionSource | null：过 cost 0 |
| effectFrames | null：过 cost 0；true：过 cost 0 |
| filters | kernel：过 cost 0；none：过 cost 0 |
| textBox | 无引擎字框样本 |

## 绘制角色（engine-draw 上报）

| role | 处理 | 记录 | 去重后 | emb 0/1/2 | 隐藏 | 只有 box | 违规 | 剧本归属 | 样例 |
|---|---|---|---|---|---|---|---|---|---|
| menu | UI（旁注） | 17 | 14 | 17/0/0 | 0 | 6 | 0 | 台词0 选项0 UI14 无0 | ニューゲーム / コンティニュー / オプション |
| line | 台词（替换） | 8 | 8 | 0/8/0 | 0 | 0 | 0 | 台词8 选项0 UI0 无0 | むかしむかし、ある小さな村に / ひとりの旅人がやってきた。 / よく来たな、旅の者よ。 |
| name | 系统（旁注） | 6 | 2 | 6/0/0 | 0 | 0 | 0 | 台词0 选项0 UI0 无2 | 村長 / ミナ |
| system | 系统（旁注） | 3 | 3 | 3/0/0 | 0 | 0 | 0 | 台词0 选项0 UI0 无3 | はじまりの村 / 120 G / HPを50回復する。 |
| choice | UI（旁注） | 2 | 2 | 2/0/0 | 0 | 0 | 0 | 台词0 选项2 UI0 无0 | 引き受ける / 断る |
| button | UI（旁注） | 1 | 1 | 1/0/0 | 0 | 0 | 0 | 台词0 选项0 UI0 无1 | 閉じる |

UI 项（按 role、id、文字去重）：22 个

## 剧本配对

阅读层画出的 8 句里 8 句在剧本里（100%）

## 台词替换数据

0 句（带游戏 ruby 0，带译文 0）

## 需要人看

- 指标 hideVisible 没有样本（隐藏后扫描区仍能识别到日文原文），回放证明不了它
- 指标 positionPx 没有样本（画的日文位置和游戏原文位置偏差过大），回放证明不了它
- 指标 pairRate 没有样本（游戏原文和阅读层的句子对不上（配对率低）），回放证明不了它
- 没有台词替换数据：探针剧本没带游戏 ruby，也没有汉化补丁译文（scripts/patch.json），内嵌替换只能等在线翻译

## 差分草稿 settings

```json
{
 "calibrate": {
  "positionSource": null,
  "textBox": null,
  "hideMethod": "hide"
 },
 "hide": {
  "textEffectsRead": false
 }
}
```
