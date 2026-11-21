# 差分草稿报告：千恋＊万花

- 游戏 key：`senren-banka`（已有手写游戏差分 core/profiles/games/senren-banka.cjs，草稿已并入其设置）
- exe：`SenrenBanka.exe` SHA-256 `fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3`（整个文件，显示 `fd37d708`）
- 引擎：`kirikiri`（manifest kirikiri）
- 回放：86 句台词行，4 个自检窗口，0 条 engine-draw 记录
- 结论：**隐藏重画**，参数 `{"hideMethod":"hide","positionSource":"engine","effectFrames":null,"filters":"kernel"}`，cost 0.141
- 草稿未签名：签名用 tools/game-diff.cjs sign，下发格式和目录归 diff-layers

## 两层

- 版本层 `version-fd37d708774f8f45fa32375ec067f58c04038e17fc1c4e5180e9eed9092434d3.json`（key `fd37d708…`，指纹 exe）：这个 exe 没有版本层的键
- 游戏层 `game-senren-banka.json`（key `0e804d57…`，指纹 script/title/steam）：按 主封包 `scn.xp3` `6b6b65d6`、剧本指纹 `c95c5afb`、Steam 1144400、标题「千恋＊万花」 认
- 游戏层覆盖的已知版本：`SenrenBanka.exe` `fd37d708`（本探针）；手写游戏差分登记的程序名：SenrenBanka.exe、SenrenBanka_chs.exe、Senren_chs.exe、Senren_jp.exe、senren.exe

## 自检指标（每个窗口取最差值）

| 指标 | 选中方案 | 最好的隐藏方案 | 阈值 | 状态 |
|---|---|---|---|---|
| hideVisible | 0.059 | 0.059 | ≤ 0.25 | 过 |
| dropRate | 0 | 0 | ≤ 0.15 | 过 |
| repeatRate | 0 | 0 | ≤ 0.1 | 过 |
| choiceMismatch | 0 | 0 | ≤ 1 | 过 |
| positionPx | 20 | 20 | ≤ max(96, 3×字高) | 过 |
| pairRate | 0.976 | 0.976 | ≥ 0.8 | 过 |

## 可调键离线搜索

| 键 | 各取值的最好结果 |
|---|---|
| positionSource | engine：过 cost 0.141 |
| effectFrames | null：过 cost 0.141；true：过 cost 0.141 |
| filters | kernel：过 cost 0.141；none：过 cost 0.141 |
| textBox | {"x":220,"y":488,"w":185,"h":250,"client":[1535,863]} |

## 绘制角色（engine-draw 上报）

没有记录

UI 项（按 role、id、文字去重）：0 个

## 剧本配对

阅读层画出的 19 句里 14 句在剧本里（74%）

## 台词替换数据

16 句（带游戏 ruby 1，带译文 16）

## 需要人看

- 运行时样本里没有 engine-draw 记录（ToMe_CHARS role=…）：旧版探针，或这个引擎差分还没开 draw.roles；画字角色要等新探针
- 阅读层画出的台词只有 74% 能在剧本里找到（14/19）：可能是 OCR 句或特效帧

## 差分草稿 settings

```json
{
 "placement": {
  "drawWhileBlanking": true,
  "translationGrowsDown": true
 },
 "calibrate": {
  "positionSource": "engine",
  "textBox": {
   "x": 220,
   "y": 488,
   "w": 185,
   "h": 250,
   "client": [
    1535,
    863
   ]
  },
  "hideMethod": "hide"
 },
 "hide": {
  "textEffectsRead": false
 }
}
```
