# Love Sweets 的 ordinary Retouch 链

真实样本已有成熟 ordinary hook，本轮没有新写运行时 hook
Love Sweets 体験版的 ExHIBIT/RLD 脚本交给 Retouch runtime 执行，WillPlus/AdvHD 的签名和 ABI 不适用
RLD v3 离线 reader 打不开，不妨碍 resident 的普通文本入口被 stock Luna 检测，二者应分别验收

## 精确样本与现有入口

| 文件 | 字节数 | SHA256 |
|---|---:|---|
| LoveSweets体験版.exe | 1249280 | `e06707c306487467ef0de1a065fa05a296e6e2f2bd4f192dfcc75a3e6e2b48c3` |
| resident.dll | 3379200 | `ed248db8db465fbec0db749b773063b1f3c9ef6f831924100e65a8f70f421eb6` |
| sc00.dll | 561152 | `eca01ff6e322f239d65f4713ebea373b3c08df8fff556f98c130b1ee9d3ddb21` |

INI 写游戏体験版 1.00、`scenario=sc00.dll`、`entry=start`，不能把游戏版本当 Retouch compiler 版本
固定清单另含 INI 和两个真实 RLD 的完整 SHA，见 `validation/fixtures/engine-sigs/exhibit-retouch-stock.json`
该文件只有身份信息、导出符号和少量入口/loader 字节，没有游戏脚本文字

- Retouch1 对应 resident 导出 `?printSub@RetouchPrintManager@@AAE_NPBDAAVUxPrintData@@K@Z`，本样本 RVA `0x4f850`
- Retouch2 对应 resident 导出 `?printSub@RetouchPrintManager@@AAEXPBDKAAH1@Z`，本样本 RVA `0x45770`

两者均为实际导出，非 forwarder，普通 adapter 都从第一个栈参数取 ANSI 字符串
Retouch1 使用原有自定义 callback，Retouch2 使用标准 `USING_STRING` 路径
同一 resident 还命中 stock RetouchHistory 签名一次，匹配 RVA `0x1c39e0`，其相对 call 指向 `0x1c3290`
现有 attach 会同时尝试这条历史路径，因此真实线程清单可能包含第三条 RetouchHistory，不能把它默认当当前正文
现有 `enginecollection32.cpp` 已包含并实例化 `Retouch`，无需新增注册
`Retouch.h` 的 detector 查已加载的 `resident.dll`，不会因为磁盘上存在同名 DLL 就成功

## 启动 loader 的静态证据

exe 默认路径在 RVA `0x45431` 压入 `resident.dll` 字符串地址，经 `0x4543c → 0x68410`、`0x68421 → 0x585b0`，到 `0x585c5` 的 `LoadLibraryExA` IAT 调用
字符串名可被配置分支覆盖，因此这些字节证明加载路径存在，不证明这次游戏进程已经走过它
sc00.dll 实际导出 `start`，RVA `0x1150`，并直接导入 resident 的 Retouch 执行接口
本机私有 CRT manifest、msvcp80/msvcr80、libeay32、libogg、libvorbis 都存在且 DLL 是 x86，系统 x86 d3d9/d3dx9_40 也存在
文件齐全仍不能代替 Windows loader 成功的证据

现有默认构建树的 Retouch.cpp/h 与本仓库保留源一致，并与本轮核查的 Luna 上游 git blob 完全相同
Luna 的 x86 CMake 用 `aux_source_directory("engine32" enginessrc)` 纳入该文件；MeguLit build 脚本复制引擎注册表，保留 stock Retouch
本机私有 `MeguLitHook32.dll` 读到两个导出名、Retouch1/2 名和 resident detector 字符串，SHA 为 `43024ab9a1e7a9c5ced06b1e68d3c880da0cc2bb23568db166a9052230567820`
这是既有部署物的只读存在核查，本轮没有编译或覆盖最终 Hook DLL，也没有向游戏注入

## ordinary 文本经过哪里

已有链为 `Retouch::attach_function → NewHook → TextHook::Send/TextOutput → Luna output callback → HookBridge.OnOutput/OutputFrame → hookSource → HookNative.sourcePage`
本轮核查了这些 owning source 的入口与接口，未修改 HookNative、Reader、bridge 或 owner 共享 JS
这条源路径没有调用 RLD 离线 reader，因此不能用离线 `parsedStrings=0` 判定普通 hook 不存在
也不能用源路径存在，声称真实 Reader 已收到了该游戏的正文

Retouch1 的 stock split 为 `0x10001`、`0x20002`、`0x30003`，用于区分线程
HookBridge 的 `EmbedTextPolicy.Role` 只直接接受 1..3，所以这些 split 不能在报告中升级为已认证的正文、姓名或选项角色
stock 自己也注明名字与文本有时会混合，本轮保留该行为，没有猜角色或改写 split

## 本轮验证

- `run-retouch-stock.cmd` 编译现有保留的 Retouch.cpp，Win32 模块发现与 NewHook 使用假的测试实现，42 个检查通过；覆盖模块未加载、两个导出、缺导出、单个 NewHook 拒绝、十次合成 callback 输入和第三条历史流
- `validation/exhibit-stockhook.test.cjs` 本机 6/6 通过，含精确文件 SHA、真实 PE 导出、loader 相对调用与 IAT、sc00 start、INI 和 RLD v3 头核查，另覆盖注册、source trace 与 draw 默认 off
- Node 语法检查通过；没有游戏、MinHook 实际安装、截图、DOM、翻页或译文 ACK 测试

运行局部检查时，先把 TEMP/TMP 放到 H 盘，再运行 `native\megulithook\selftest\run-retouch-stock.cmd`
给 `MEGULIT_EXHIBIT_SAMPLE` 设置完整 LoveSweets体験版目录，执行 `node --test validation/exhibit-stockhook.test.cjs`
没有该样本变量时，真实发布者文件测试明确 skip，其他五项源/合同检查照常执行；不能把 skip 当本机文件通过
没有新增 runtime 候选，所以没有新增私测 env、默认设置或 Seed；现有 draw.roles/embed/advhdInput 继续 off

## 用户前台待测与不足

本轮没有分配实机 slot，没有启动游戏，前台验收留给用户
通过 MeguLit 正常启动该体験版时，应在 hook 诊断中看到 Retouch 匹配、Retouch1 或 Retouch2 文本线程，并让至少十句真实日文进入 Reader
记录实际模块 SHA、线程名/线程选择、正文、姓名与选项表现，再检查点读、译文、隐藏、重复句和换页
两个入口都有字不代表两者都应同时当正文源，是否重复、选错历史或姓名线程需看真实 tape
当前 AutoSkip 名称规则没有直接排除 RetouchHistory，但这不证明已经选错；是否影响当前样本必须看实际线程选择和正文时间线

若只有通用 GDI 线程，先收目标进程的已加载模块和 hook-diagnostics.log，核 resident 是否在检测时已经加载
当前 HIJACK 不会持续轮询晚加载的 resident，已有重连流程可以重跑检测，但本轮没有证明正常启动需要该补救
只有实际加载/普通文本到 Reader 通过后才能写“可正常挂钩游玩”，角色/隐藏/双语/翻页仍须分别验收
root 串行整合并核最终产物，用户待测样本继续保留
