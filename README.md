# 猫村财经热讯 — 金融中文热点聚合站（实时数据）

仿 AI HOT 信息架构（多源聚合 → 规则加工 → 时间线展示）的金融热点资讯聚合站。
**默认接入真实数据源**（新浪财经滚动新闻 + 腾讯财经实时行情），抓取失败时自动回退到内置模拟数据（seeds），保证本地永远能跑。

## 技术栈
- 前端：Vite + React + TypeScript，**手写 CSS**（不上 Tailwind / 组件库，减少依赖踩坑）
- 数据加工：纯 Node 脚本（`scripts/fetch-real.mjs` 真实抓取 + `scripts/build-data.mjs` 模拟兜底），规则实现，不接任何 LLM
- 路由：使用 History API 自实现，无第三方路由依赖
- 运行：仅本地运行，不部署上线

## 数据来源
- **新闻**：新浪财经滚动新闻（`feed.mix.sina.com.cn`，lid=2509 财经），归一化后按关键词打标签、按发布时间衰减算热度、同标题去重。
- **行情条**：腾讯财经 `qt.gtimg.cn` 实时报价，取 上证指数 / 深证成指 / 创业板指 / 沪深300 / 恒生指数 / 纳斯达克，**红涨绿跌**。
- **离线兜底**：任一接口不可达时，新闻回退 `seeds/raw-items.json`（mock），行情回退占位 `--`，站点不白屏。

## 四条命令（一条命令一个动作）

```bash
# 1) 装依赖（首次）
npm install

# 2) 抓取真实数据（写入 public/data/items.json + quotes.json）
npm run data
#   仅需要模拟数据 / 离线演示时用：
npm run data:mock

# 3) 起站
npm run dev            # 开发服务器 http://localhost:5173
#   或生产预览（先构建再预览）：
npm run build && npm run preview   # http://localhost:4173

# 4) 验收（数据管线判据，退出码 0 通过）
npm run validate
```

> 站点验收另需：构建后 `npm run preview`，确认以下三处均返回 200：
> `http://localhost:4173/`、`http://localhost:4173/items/<真实id>`、`http://localhost:4173/data/items.json`，
> 且首页 HTML 含站点名「猫村财经热讯」。

## 目录结构
```
seeds/raw-items.json         模拟原始条目（36 条，8 类 / 6 源 / 3 组同事件；离线兜底用）
scripts/fetch-real.mjs       真实抓取：新浪新闻 + 腾讯行情 → items.json + quotes.json
scripts/build-data.mjs       模拟加工脚本（兜底路径）：标签/热度/摘要/同事件合并
scripts/validate-data.mjs    数据判据（≥36 进 / ≥30 出 / 七字段 / tags 非空 / 合并 extraSources≥3 / 无重复 id）
public/data/items.json       生成产物（前端新闻唯一数据来源，fetch 获取）
public/data/quotes.json      生成产物（前端行情条数据来源，fetch 获取）
src/                         React 前端（首页时间线 + 详情页）
```

## 加工规则（写死，不接 LLM）
- **标签**：标题 + 正文命中预设关键词表（如 降准/美联储 → 货币政策，黄金/原油 → 大宗商品），未命中回退「宏观」
- **热度**：来源权重 × exp(-距今小时数/24) × 100，取整
- **摘要**：正文前 80 字
- **同事件合并**：相同 `eventKey` 合并为一条（mock 路径）；真实路径按同标题去重

## 前端要点
- 顶部站点名 + 实时行情条（上证/深成/创业板/沪深300/恒生/纳指），**红涨绿跌**；行情缺失时回退占位
- 类型下拉筛选 + 标签点击筛选 + 分页（每页 20 条）
- 筛选条件（`?tag=`、`?cat=`）与页码（`?page=`）写入 URL，刷新后状态不丢
- 点标题进入详情页，展示全字段、相关信源与「查看原文来源」外链
- 数据加载失败显示可见报错提示（非白屏、非假数据）

## 关键约束（来自需求文档）
- 前端不写死任何条目内容，数据只来自 `items.json` / `quotes.json`
- 摘要/标签/热度为规则实现，不接 LLM
- 依赖只装到项目内 `node_modules`，不全局安装
- 验收判据建好跑绿后不改阈值
