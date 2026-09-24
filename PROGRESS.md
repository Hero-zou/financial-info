# PROGRESS.md — 金融中文热点聚合站（全模拟数据跑通）

理解目标：仿 AI HOT 信息架构（多源聚合→规则加工→时间线展示），用全模拟数据把产品形态与数据管线跑通，以后接真源。
执行顺序：任务0 环境核对 → 任务1 数据管线（地基） → 任务2 前端页面 → 任务3 收尾文档。
技术栈（领导已拍）：Vite + React + TS 前端 + 纯 Node 脚本加工数据；全程不抓真实网络；摘要/标签/热度用规则实现，不接 LLM；仅本地运行。
UI 决策（建议，我采纳）：手写 CSS，不上 Tailwind/组件库，减少依赖踩坑。
让步顺序：管线真实生效且站能跑通 > 页面好看 > 条目数量多。
最大风险：npm 依赖安装与 TS 构建类型错误。已实测 node v22.22.2 且 npm registry 可达（PONG 913ms），走 Vite 架构，不降级。

## 完成状态（2026-08-03）
- 任务0：node v22.22.2(≥18) ✓；npm registry 可达 ✓ → 走 Vite 架构，不降级。
- 任务1 数据管线：build-data 输入 36 → 输出 32（合并 3 组同事件）；validate 退出码 0（七字段/ tags 非空/ extraSources≥3/ 无重复 id 全过）。
  - 反向验证：塞缺 title 脏数据 → validate 变红（退出码 1）并指向 id=n0037；删除后重跑全绿。脏数据已清除，种子 36 条全干净。
- 任务2 前端：npm run build 退出码 0；preview 下 curl 首页 / /items/n0001 / /data/items.json 三处均 200，且 /data/items.json 为 application/json（真实数据）、首页含站点名。
  - 反向验证：items.json 改名缺失 → /data/items.json 返回 text/html（SPA 兜底，非 JSON）→ 前端 fetch().json() 解析失败触发可见 ErrorBanner（非白屏、非假数据）；首页 HTML 无内嵌条目标题。恢复后三处复验 200 + JSON。
  - 死规矩核对：全中文界面 ✓；红涨绿跌（CSS --up 红 / --down 绿）✓；tag/cat/page 走 URL 参数、刷新不丢（History API + URLSearchParams 实现）✓；前端不写死条目内容、仅 fetch items.json ✓。
- 任务3：README 四条命令、PROGRESS/BLOCKED 已更新。
- 未擅自做的顺手活（搜索/暗色/真源/单测框架/降级分支）已写入 BLOCKED.md 待裁决。

## 采纳的「建议」决策记录
- 手写 CSS 不上 Tailwind/组件库：已验证构建通过且 preview 三处 200，样式返工未发生，采纳成立。
