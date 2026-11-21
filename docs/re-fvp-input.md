# FVP 原始追加输入诊断

本交付仅提供两个精确版本的原始字节追加事件，默认 `draw.fvpInput=false`，没有游戏 seed 或允许名单开启
它不是整页 setter、缓存重绘事件、正文提取支持或实机适配验收
现有 DrawSites/GDI 路径保持原状，诊断不输出 `ToMe_CHARS`、角色、屏幕坐标、隐藏或嵌入结果

## 六件套范围

| 项目 | 本次交付 | 尚缺的证据 |
| --- | --- | --- |
| 二进制与入口 | 下列两个 SHA、文件长度和各自唯一 RVA 同时校验，陌生版本拒绝安装 | 其它版本均未覆盖 |
| JS/native 签名 | `FvpDrawSig.h` 是同源定义，JS 从头文件读取，实际字节 fixture 含 caller 与缓存旁路 | 有限样本扫描不代表全局无误报 |
| 原生诊断 | 入口有界复制 NUL 结尾 bytes，最大 32768 字节，按 128 字节 hex 分块，记录 ECX、调用者 RVA 与 build | 编码、正文角色、页面身份、最终显示位置均未确认 |
| 控制与默认隔离 | version 层独立 `fvpInput`，roles=0 可诊断；false 不改变旧控制序列化；所有 root `The Seed` 含 versions 禁开 | 没有产品入口、seed 或自动启用 |
| 回归 | 实字节 JS/双架构签名、真 MinHook 的 x86 ret4 ABI、小型 fake engine；x64 no-op | 非游戏运行，未验证实际程序稳定性或视觉结果 |
| 运行验收清单 | 下面列出后续隐藏桌面所需对照 | 当前未做实机验收，不可据此开启游戏 |

| 本地样本 | 文件长度 | SHA-256 | 输入 RVA |
| --- | ---: | --- | --- |
| いろとりどりのヒカリ（五彩斑斓的曙光，本地汉化 exe） | 719360 | `1d0f37a6f22dc77780621982f5466d4e9e9d19e1b901f0ea4f8422b2e6a75b83` | `0x31bb0` |
| いろとりどりのヒカリ HD | 817664 | `adb556478ad608a3a0321f7d3b6e7e3c8394c648ca4758fea80e2ac0c683a492` | `0x33610` |

两个版本各自只有一个输入入口，不要求在同一个模块里找到两个版本的入口
运行时先检查文件长度与完整 SHA，再验证内存 PE 头、节界限、签名全镜像唯一和该版本预期 RVA
文件缺失、读取失败、长度异常、错 SHA、缺失/重复签名、错误 RVA 均不安装
Enable 失败会关闭观察、保留可能在途调用需要的 trampoline，并禁止再次安装，原函数继续 pass-through

## 实字节 ABI 与输入语义

两个入口都是 ECX=this、一个栈参数、callee `ret 4`
实际前导 `sub esp,0xc; push ebp; push esi; push edi` 共占 24 字节
两个 callee-cleaned helper 后 `[esp+0x1c]` 对应原入口 `[S0+4]`，并不是 EAX 文本输入或多参数的 AdvHD ABI
调用者明确 `push esi; mov ecx,ebp; call input`，两个地址分别属于已递归检查的 `0x43ac70` / `0x43ca90`

入口迭代 NUL 结尾原始 bytes，分类首字节并将一个或两个字节装入 word，追加至 this+0x574 的容器
容器 begin/end/capacity 位于 this+0x580/0x584/0x588，实际写入 `[end]` 并增加两个字节
末尾还追加 word `0x7e` 后调用 layout，不先清空整页向量
原来的参数槽在函数中被复用为当前 word 和 `0x7e`，所以诊断先复制 bytes，不在 original 返回后读参数
本地汉化样本不能证明日语编码，诊断保留 raw hex，不声称 UTF-16 或已确认 CP932

专用 gate 保存 GPR/flags、对齐 FXSAVE/FXRSTOR，观察时清 DF，随后恢复并 tail-jump 到 original
original 自己的返回值和 `ret 4` 语义不由诊断替代
小型真 MinHook fixture 让 original 覆盖参数槽、返回不透明 EAX，logger 改写 volatile GPR、flags、临时栈、XMM0/XMM7 和 x87
检查原函数看到的 ECX/参数/GPR/flags、返回后的寄存器、ESP、XMM 和 x87；同时覆盖空串、长串、边界 NUL、不可读/半可读地址、异常、真正递归 detour、off-on 和安装失败
logger 仍遵守 C 调用约定的栈平衡，测试不把无法返回的损坏 ESP 当作合法 logger 行为

## 缓存与角色的明确限制

上游命令把有符号索引限制在 0..31，通过 `[global+0x98+index*4]` 选择目标对象
这只能证明 32 个目标槽，不能把某个索引当作正文、姓名或选项
保留的 LunaHook FVP.cpp 也明确说 scenario/name/history 无法区分

`0x431cb0` / `0x433710` relayout 可以直接把已有 word 向量送给 layout，不再次调用原始追加入口
frame driver 迭代 32 个目标并调用 tick，tick 再调 flush
flush 从 this+0x520 CPU buffer 和脏矩形队列上传缓存像素，同样不需要新 input 或 layout
因此输入日志缺席不等于页面没有重绘，输入日志完整也不等于所有缓存重绘被捕获
this+0x5e8/0x5ea 是布局逻辑 pen；最终窗口变换、GPU draw、具体 COM 接口与屏幕坐标仍未证明
fixture 保留这些旁路，防止以后把原始追加诊断描述成全文渲染覆盖

## 验证方法与后续门槛

JS：`node --test --test-concurrency=2 validation/engine-draw-sig-fvp.test.cjs`
原生：`native/megulithook/selftest/run-fvp.cmd`，可选 `MEGULIT_FVP_SAMPLE` / `MEGULIT_FVP_HD_SAMPLE` 指定已拥有样本，仅读取哈希，不启动游戏
原生脚本也接入 MeguLitHook 的 selftest/run.cmd；该 native-builds entry 是 `ci:false`，普通 CI 仅覆盖 JS，不能声称普通 CI 已执行此 native gate

后续若要适配，应先在独占、隐藏桌面的两版本中记录至少 20 句、姓名、历史、选项、空串与长串的原日志及截图对照
分别证明追加/换页、已缓存文字重显、relayout/脏矩形 flush、不同目标槽与坐标变换的关系，并量测 hook on/off 的稳定性和性能
只有新的证据能支持正文路由、页面身份或渲染能力时才讨论下一层实现；本诊断 flag 不能作为这些能力的替代证明
