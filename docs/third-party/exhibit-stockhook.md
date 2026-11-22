# ExHIBIT ordinary hook 来源

开工前十五分钟内完成 Luna/LunaTranslator、VNR/ITHVNR、Textractor 的固定来源核查
这些项目都已有同一组 resident printSub 符号，继续用现存 stock adapter 比增设另一条 runtime 更合适
本轮没有复制新 GPL 实现、引入第三方依赖或重写 hook，console 测试直接编译仓库原已保留的 Retouch.cpp
原有 GPL 代码、许可证和 notices 保持原位置，新增测试沿项目 GPL-3.0-or-later

| 来源 | 固定文件与版本 | 许可证、取舍 |
|---|---|---|
| [LunaTranslator Retouch.cpp](https://github.com/HIllya51/LunaTranslator/blob/7772ec7bb186bd3773bb534dcbc8655a4a364150/src/NativeImpl/LunaHook/LunaHook/engine32/Retouch.cpp) 与 [Retouch.h](https://github.com/HIllya51/LunaTranslator/blob/7772ec7bb186bd3773bb534dcbc8655a4a364150/src/NativeImpl/LunaHook/LunaHook/engine32/Retouch.h) | commit `7772ec7bb186bd3773bb534dcbc8655a4a364150`；cpp blob `0b730c31fabeec3224470992cb3b89c3fed67fab`，h blob `7e30066f2c46e6edef4e0a775d1a33e33470f3f4` | GPL-3.0，[LICENSE](https://github.com/HIllya51/LunaTranslator/blob/7772ec7bb186bd3773bb534dcbc8655a4a364150/LICENSE)；本机现存 adapter 与这些 blob 相同，复用原接口，不新增实现 |
| [VNR/ITHVNR engine.cc](https://github.com/mireado/ITHVNR/blob/d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c/vnr/vnrhook/src/engine/engine.cc) | commit `d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c`，InsertRetouch1Hook/2Hook/Hook；[match.cc](https://github.com/mireado/ITHVNR/blob/d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c/vnr/vnrhook/src/engine/match.cc) | [vnr/License.txt](https://github.com/mireado/ITHVNR/blob/d28a1ae6989f9ebb7a921c3b4b6e97b67e93f21c/vnr/License.txt) 为 GPLv3；只交叉核对两个导出和 resident 识别思路，不移植旧实现 |
| [Textractor engine.cc](https://github.com/Artikash/Textractor/blob/df5b830d1757a66aa162f8081e99d42c9bd50488/texthook/engine/engine.cc) | commit `df5b830d1757a66aa162f8081e99d42c9bd50488`，InsertRetouch1Hook/2Hook/Hook；[match32.cc](https://github.com/Artikash/Textractor/blob/df5b830d1757a66aa162f8081e99d42c9bd50488/texthook/engine/match32.cc) | GPL-3.0，[LICENSE](https://github.com/Artikash/Textractor/blob/df5b830d1757a66aa162f8081e99d42c9bd50488/LICENSE)；只核对普通 NewHook 路径，没有复制代码 |
| [MOONSTONE Love Sweets 下载页](https://www.moon-stone.jp/product/ms17/dl.html) | 已有完整官方体験版，下载部署收据由 sample-deployment owner 保管；本轮重新只读核实际 EXE/module/script SHA | 游戏资源专有；不下载、不修改、不删除、不执行或再分发样本；仓库 fixture 只含身份、公开导出符号和少量 loader/入口字节 |

本轮没有使用新的 GARbro/Textractor/VNR runtime，也没有将上游 split 当成经过本机认证的屏幕角色
