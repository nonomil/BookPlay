---
status: DRAFT
updated: 2026-09-29T23:58:00+08:00
plan_version: v2
source_of_truth: ../solution.md
---

# 待办：拆开 proto-action.html

`prj/engine/proto-action.html` 约 2300 行，同时装着样式、五屏、纵深、刷怪、词判定和结算。

T01、T02 是局部文案和一条结算路径，不为此先拆文件。

触发：T04 或以后要新增第二套页面框架、资源加载器，而不能只改现有节点。拆的时候保留这个 html 为入口，一次只移出一块，并先证明第 1 集开战、落空、过关还在。
