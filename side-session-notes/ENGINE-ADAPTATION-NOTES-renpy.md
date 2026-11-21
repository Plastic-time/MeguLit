# Ren'Py 适配经验，2026-11-22

本条同时追加在本工作树被 gitignore 的 ENGINE-ADAPTATION-NOTES.md，保留此跟踪副本供总控整合

Ren'Py 8.4.0.25071206 的 `Layout.paragraph_glyphs` 保存排版前 glyph 对象，屏幕 `lines` 使用同一对象切片，但换行可能省掉 `SPLIT_INSTEAD` 空格
从原 glyph 顺序判断连续 BOTTOM 或前一个普通字符，再用 glyph identity 对到实际输出 rect 索引，避免同字误配或省略空格后误合两段底字
TOP/ALT 由 ruby enum 决定，不按 ascent 大小猜；缺对象映射、未知版本、RTL 或竖排不报 native ruby metadata
下标沿记录的码位序列计算，换行不计、空格保留，内嵌删空白后显式换算，不用 find 搜索底字
角色要有撤销快照，说话人转旁白时清旧名字，menu 的空 label 按实际 action 语义排除
producer 的新字段与共同 parser 必须一同整合，producer 自测不能替代消费者的协议回归
源码版本、许可、实测时间、七格边界与已知依赖失败见仓库根目录 result.md
