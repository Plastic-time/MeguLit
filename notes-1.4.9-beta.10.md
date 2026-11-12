本次 beta 把 beta 分支的修复合回主线，并加入：

- 新增：语法和假名练习答错时，火焰会从答错的位置向四周蔓延，两秒内烧尽（可在特效设置里单独关闭；系统开启「减少动态效果」时不播放）
- 新增：语法 N0 加入各地方言，共 9 个地区：关西、鹿儿岛、四国（土佐・伊予・讃岐・阿波）、冲绳（うちなーやまとぐち）、博多、名古屋、东北、北海道、广岛，每条都有例句、释义、地区标签和对应的标准语
- 新增：词典背景的漂浮字按熟练度上色：生词偏红，在学的词偏金，已掌握的词偏淡
- 新增：在词典里搜索后，和搜索词同字、同读音或意思相近的词会从搜索框飘进背景（只用本地词库和你自己收藏的单词）
- 优化：词典搜索框撞击顶栏时不再掉帧（去掉了逐帧的画布模糊、标题栏滤镜动画和混合模式）
- 优化：游戏库封面墙拖动和缩放更流畅（整面墙的 SVG 模糊改成 GPU 模糊，变卡时自动关闭；封面图层不再每次拖动都重建）
- 修复：游戏语言设成英文等非日文时，MeguLit 会用游戏自带的多语言剧本找回对应的日文句子（如 Doki Doki Literature Club Plus!（心跳文学部 Plus!））；找不到对应日文时会提示把游戏切回日文
- 修复：带配置启动器的 Steam 游戏（如 STEINS;GATE（命运石之门）、CHAOS;CHILD（混沌之子）、ダンガンロンパ（弹丸论破））从 MeguLit 启动时不再先弹出 Steam 的启动选项，也不会把配置程序当成游戏

仅在开发者本地测试过，可能还有没发现的问题，会持续跟进修复
---
This beta merges the beta branch's fixes back into main and adds:

- New: a wrong answer in the grammar and kana practice sets off a fire that spreads out from the answer and burns out within two seconds (can be turned off on its own in the effect settings; not played with reduced motion)
- New: grammar N0 now has regional dialects from 9 regions: Kansai, Kagoshima, Shikoku (Tosa, Iyo, Sanuki, Awa), Okinawa (Uchinaa-Yamatoguchi), Hakata, Nagoya, Tohoku, Hokkaido and Hiroshima, each with an example, meaning, region tag and the standard Japanese form
- New: the drifting glyphs behind the dictionary are coloured by how well you know them: new words red, words you are learning gold, known words pale
- New: after a dictionary search, words sharing a kanji, a reading or a close meaning with it drift out of the search box into the background (only from the local word list and your own saved words)
- Faster: the dictionary search box no longer drops frames when it hits the top bar (no per-frame canvas blur, title-bar filter animation or blend modes)
- Faster: dragging and zooming the library cover wall is smoother (the whole-wall SVG blur is now a GPU blur that turns itself off when frames run long; cover layers are no longer rebuilt on every drag)
- Fix: when a game is set to English or another non-Japanese language, MeguLit finds the matching Japanese line in the game's own multilingual script (e.g. Doki Doki Literature Club Plus!); when it cannot, it asks you to switch the game to Japanese
- Fix: Steam games with a configuration launcher (e.g. STEINS;GATE, CHAOS;CHILD, Danganronpa) no longer show Steam's launch-option chooser when started from MeguLit, and the configuration tool is never taken for the game

Only tested locally by the developer; there may be problems not found yet, and fixes will keep coming
