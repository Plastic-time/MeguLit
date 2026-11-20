# 差分草稿报告：MeguLit 見本

- 游戏 key：`rpgm-sample`
- exe：`Game.exe` 哈希 `20a57cfa736d946ede4ccc91b5b158091c031e9a54869aecacdb52c6cfa35086`（size + 首尾 1 MiB 的 sha256，同 services/probe-identity.cjs）
- 引擎：`rpgmaker`（manifest RPG Maker MZ）
- 回放：8 句台词行，1 个自检窗口，48 次画字
- 结论：**隐藏重画**，参数 `{"hideMethod":"hide","positionSource":null,"effectFrames":null,"filters":"kernel"}`，cost 0

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

## 绘制角色

| 画字身份 | 角色 | 依据 | 次数 | 台词 | 候选/收下 | 剧本归属 | 样例 |
|---|---|---|---|---|---|---|---|
| class:Window_NameBox|class:Window_Base | name | class:Window_NameBox | 12 | - | - | 台词0 选项0 UI0 无12 | 村長 / ミナ |
| class:Window_MenuCommand|class:Window_Command|class:Window_Selectable|class:Window_Base | menu | class:Window_MenuCommand | 6 | - | - | 台词0 选项0 UI10 无0 | アイテム / スキル / 装備 |
| class:Window_TitleCommand|class:Window_Command|class:Window_Selectable|class:Window_Base | menu | class:Window_TitleCommand | 4 | - | - | 台词0 选项0 UI6 无0 | ニューゲーム / コンティニュー / オプション |
| class:Window_Message|class:Window_Base | line | class:Window_Message | 4 | 4 | - | 台词4 选项0 UI0 无0 | よく来たな、旅の者よ。 / この村は小さいが、良いところだ。 / ひとつ頼みを聞いてくれんか？ |
| class:Window_ShopCommand|class:Window_HorzCommand|class:Window_Command|class:Window_Selectable|class:Window_Base | menu | class:Window_ShopCommand | 4 | - | - | 台词0 选项0 UI6 无0 | 購入する / 売却する / やめる |
| class:Window_ShopBuy|class:Window_Selectable|class:Window_Base | menu | class:Window_ShopBuy | 4 | - | - | 台词0 选项0 UI6 无0 | ポーション / 薬草 / 毒消し |
| class:Window_ChoiceList|class:Window_Command|class:Window_Selectable|class:Window_Base | choice | class:Window_ChoiceList | 3 | - | - | 台词0 选项4 UI0 无0 | 引き受ける / 断る |
| class:Window_ScrollText|class:Window_Base | line | class:Window_ScrollText | 2 | 2 | - | 台词2 选项0 UI0 无0 | むかしむかし、ある小さな村に / ひとりの旅人がやってきた。 |
| class:Window_MapName|class:Window_Base | system | class:Window_MapName | 2 | - | - | 台词0 选项0 UI0 无2 | はじまりの村 |
| class:Window_Help|class:Window_Base | system | class:Window_Help | 2 | - | - | 台词0 选项0 UI0 无2 | HPを50回復する。 |
| class:Window_MessageEx|class:Window_Message|class:Window_Base | line | class:Window_Message | 2 | 2 | - | 台词2 选项0 UI0 无0 | お兄ちゃん、森は危ないよ。 / 薬草を持っていってね。 |
| class:Window_QuestLog | 内核默认 | - | 2 | - | - | 台词0 选项0 UI0 无2 | 北の森の調査 / 薬草あつめ |
| class:Window_Gold|class:Window_Base | system | class:Window_Gold | 1 | - | - | 台词0 选项0 UI0 无1 | 120 G |

## 剧本配对

阅读层画出的 8 句里 8 句在剧本里（100%）

## 需要人看

- 探针没有带 exe 的完整 SHA-256（manifest exe.sha256）：差分键缺失，不能签名发布；探针要补上完整哈希
- 指标 hideVisible 没有样本（隐藏后扫描区仍能识别到日文原文），回放证明不了它
- 指标 positionPx 没有样本（画的日文位置和游戏原文位置偏差过大），回放证明不了它
- 指标 pairRate 没有样本（游戏原文和阅读层的句子对不上（配对率低）），回放证明不了它
- 画字身份 class:Window_QuestLog 没有规则也推不出角色（2 次）：在引擎差分或游戏差分 draw.roleMap 里定

## 差分草稿

```json
{
 "calibrate": {
  "positionSource": null,
  "textBox": null,
  "hideMethod": "hide"
 },
 "hide": {
  "textEffectsRead": false
 },
 "draw": {
  "roleMap": {
   "class:Window_QuestLog": "system"
  }
 }
}
```
