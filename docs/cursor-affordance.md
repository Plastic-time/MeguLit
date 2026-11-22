# 页面光标

主窗口和 Reader 共享 `web/cursors.css`，使用暖白轮廓、深墨描边、金色小点缀的静态 24×24 SVG，字号和布局不受影响。图标不跟随鼠标运行 JS、不新增监听器、动画或计时器；不更改 Windows 系统光标

| 状态 | 热点 | 用途 |
|---|---|---|
| arrow | 3,3 | 普通界面和禁用控件 |
| pointer | 3,3 | 按钮、链接、真实可点击控件 |
| read | 3,3 | `.char-token`、`.tome-page-char` 等已存在点读目标，包含 ruby 子元素 |
| text | 12,12 | 输入框、可编辑内容、普通可选段落 |
| grab / grabbing | 11,11 | 游戏库墙、分支图、裁剪框、可拖标题、传火碑与现有拖动状态 |
| zoom-in / zoom-out | 10,10 | 已有显式缩放状态 |

每项 CSS 都有对应系统关键字回退；强制颜色模式使用系统光标。缩放、忙碌和方向 resize 等未替换状态继续由原组件或系统表达。原选区、`user-select`、点击与拖选逻辑完全不变

Reader 历史使用 backlog 生成的 `.char-token`；其注音/子 span 同样显示点读光标，搜索框仍为 text。主窗口 `historyHTML` 的普通 `.dialogue-source` 在本基线没有点读 handler，因此保持 text，不靠更换光标伪装新增功能

本轮按用户卡顿期约束，只作 SVG/XML、CSS 接线和源合同静态轻测；没有开启浏览器、实际游戏或构建。各 DPI、WebView2 真正命中热点、拖选/点读手感仍待店主验收，不能由静态测试替代

格式依据：[W3C CSS UI 的 cursor 合同](https://www.w3.org/TR/css-ui-4/#cursor)。该规范是工作草案；本实现只使用已有 SVG URL、整数热点和系统 fallback，不使用实验性指针 API。全部图标在本仓库绘制，没有导入第三方图标包
