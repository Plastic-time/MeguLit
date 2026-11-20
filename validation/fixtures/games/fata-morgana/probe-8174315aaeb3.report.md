# 差分草稿报告：ファタモルガーナの館

- 游戏 key：`fata-morgana`（已有手写游戏差分 core/profiles/games/fata-morgana.cjs，草稿已并入其设置）
- exe：`fata_jp.exe` 哈希 `8174315aaeb3de028326cf907d95e73c2e935e2b5babf1aade38bdb86c5f51a1`（size + 首尾 1 MiB 的 sha256，同 services/probe-identity.cjs）
- 引擎：`kirikiri`（manifest kirikiri）
- 回放：47 句台词行，2 个自检窗口，207 次画字
- 结论：**读模式**，参数 `{"hideMethod":"read","positionSource":null,"effectFrames":null,"filters":"kernel"}`，cost 0

## 自检指标（每个窗口取最差值）

| 指标 | 选中方案 | 最好的隐藏方案 | 阈值 | 状态 |
|---|---|---|---|---|
| hideVisible | - | 0.25 | ≤ 0.25 | 无样本 |
| dropRate | - | 0.31 超线 | ≤ 0.15 | 无样本 |
| repeatRate | - | 0 | ≤ 0.1 | 无样本 |
| choiceMismatch | 0 | 1 | ≤ 1 | 过 |
| positionPx | - | - | ≤ max(96, 3×字高) | 无样本 |
| pairRate | - | 0.926 | ≥ 0.8 | 无样本 |

## 可调键离线搜索

| 键 | 各取值的最好结果 |
|---|---|
| positionSource | engine：不过 cost 3.593 (dropRate) |
| effectFrames | null：不过 cost 3.593 (dropRate)；true：不过 cost 5.027 (hideVisible) |
| filters | kernel：不过 cost 3.593 (dropRate)；none：不过 cost 3.593 (dropRate) |
| textBox | {"x":70,"y":488,"w":322,"h":51,"client":[804,604]} |

## 绘制角色

| 画字身份 | 角色 | 依据 | 次数 | 台词 | 候选/收下 | 剧本归属 | 样例 |
|---|---|---|---|---|---|---|---|
| hook:tTVPNativeBaseBitmap::DrawText | system | hook:tTVPNativeBaseBitmap::DrawText | 97 | - | 97/64 | 台词14 选项0 UI0 无83 | その瞬間、私は死体を見下ろしていた。 / ………自分……の自死……体…自だ…。自体だ分の死。体だ分の死。分体の死だ。体だ分 / 磔の場へと引きずられるその姿に…… |
| hook:Krkr2wcs | dialogue | hook:Krkr2wcs | 46 | 43 | 3/3 | 台词0 选项0 UI0 无3 | 暖炉 / 暖炉のぱちぱち / 選択肢 |
| hook:KiriKiri2 | dialogue | hook:KiriKiri2 | 42 | - | 42/22 | 台词12 选项0 UI0 无30 | その瞬間、私は死体を見下ろしていた。 / ……自分の死体だ。 / 磔の場へと引きずられるその姿に…… |
| hook:KiriKiri4 | dialogue | hook:KiriKiri4 | 13 | - | 13/10 | 台词10 选项0 UI0 无3 | 波間をたゆたう意識が、ぎい、ぎいと引き戻されていく。 / 呼吸をひとつする度に、指先に感覚が宿る。 / どこかで雨の音を聞いた。 |
| hook:ocr | 内核来源（OCR） | - | 4 | 4 | - | 台词0 选项0 UI0 无4 | 当作品には流血・暴力や精神的不安を煽る表現が含まれておりますまた、差別的な用語を / 当作品のプレイには、ヘッドホンやイヤホン等のご利用を心からお勧めさせていただきま / 館がある |
| hook:choice-capture | 内核来源（选项捕捉） | - | 3 | - | - | 台词2 选项0 UI0 无8 | やっと、お / 目覚めになら / れましたの |
| hook:KiriKiri1 | dialogue | hook:KiriKiri1 | 2 | - | 2/0 | 台词0 选项0 UI0 无2 | その瞬間、私は死体を見下ろしていた。……自分の死体だ。磔の場へと引きずられるその / その瞬間、私は死体を見下ろしていた。……自分の死体だ。磔の場へと引きずられるその |

## 剧本配对

阅读层画出的 15 句里 4 句在剧本里（27%）

## 需要人看

- 没有隐藏组合过线，差分为读模式（原文留着、只显示译文）。超线：dropRate（有台词没有画到阅读层（漏句））
- 选项是内核的选项捕捉（OCR/候选）找到的，运行时样本里没有引擎身份（KAG selectLink / link 层）：探针运行时样本需带上选项的调用方
- 阅读层画出的台词只有 27% 能在剧本里找到（4/15）：可能是 OCR 句或特效帧
- 内核选项捕捉从非 UI 画字收了候选：hook:tTVPNativeBaseBitmap::DrawText（system，64 条）、hook:Krkr2wcs（dialogue，3 条）、hook:KiriKiri2（dialogue，22 条）、hook:KiriKiri4（dialogue，10 条）；按角色只收 ui 画字可免去这类过滤

## 差分草稿

```json
{
 "calibrate": {
  "positionSource": null,
  "textBox": {
   "x": 70,
   "y": 488,
   "w": 322,
   "h": 51,
   "client": [
    804,
    604
   ]
  },
  "hideMethod": "read"
 },
 "hide": {
  "textEffectsRead": true
 }
}
```
