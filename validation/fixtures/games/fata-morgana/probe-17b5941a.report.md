# 差分草稿报告：ファタモルガーナの館

- 游戏 key：`fata-morgana`（已有手写游戏差分 core/profiles/games/fata-morgana.cjs，草稿已并入其设置）
- exe：`fata_jp.exe` SHA-256 `17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42`（整个文件，显示 `17b5941a`）
- 引擎：`kirikiri`（manifest kirikiri）
- 回放：47 句台词行，2 个自检窗口，0 条 engine-draw 记录
- 结论：**读模式**，参数 `{"hideMethod":"read","positionSource":null,"effectFrames":null,"filters":"kernel"}`，cost 0
- 草稿未签名：签名用 tools/game-diff.cjs sign，下发格式和目录归 diff-layers

## 两层

- 版本层 `version-17b5941ae0fe1e46894c34e7f1c5bae9a2ef7cdc85fb490c52e305e2c84bde42.json`（key `17b5941a…`，指纹 exe）：这个 exe 没有版本层的键
- 游戏层 `game-fata-morgana.json`（key `b5724d2d…`，指纹 script/title）：按 主封包 `data.xp3` `b7831b34`、剧本指纹 `142ca8b7`、标题「ファタモルガーナの館」 认
- 游戏层覆盖的已知版本：`fata_jp.exe` `17b5941a`（本探针）；`fata_cn.exe` `7a81b36a`（同目录，未实测）；`fata_en.exe` `5d3ad108`（同目录，未实测）；手写游戏差分登记的程序名：fata.exe、fata_jp.exe、fata_cn.exe、fata_en.exe

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

## 绘制角色（engine-draw 上报）

没有记录

UI 项（按 role、id、文字去重）：0 个

## 剧本配对

阅读层画出的 13 句里 4 句在剧本里（31%）

## 台词替换数据

0 句（带游戏 ruby 0，带译文 0）

## 需要人看

- 没有隐藏组合过线，差分为读模式（原文留着、只显示译文）。超线：dropRate（有台词没有画到阅读层（漏句））
- 运行时样本里没有 engine-draw 记录（ToMe_CHARS role=…）：旧版探针，或这个引擎差分还没开 draw.roles；画字角色要等新探针
- 阅读层画出的台词只有 31% 能在剧本里找到（4/13）：可能是 OCR 句或特效帧
- 没有台词替换数据：探针剧本没带游戏 ruby，也没有汉化补丁译文（scripts/patch.json），内嵌替换只能等在线翻译

## 差分草稿 settings

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
