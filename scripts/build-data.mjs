// build-data.mjs — 从 seeds/raw-items.json 生成 public/data/items.json
// 规则加工（写死，不接任何 LLM）：
//   tags  = 标题+正文 命中预设关键词表
//   heat  = 来源权重 × exp(-距今小时数/24) × 100 取整
//   summary = 正文前 80 字
//   同 eventKey 合并为一条，附 extraSources（其余信源名单）
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SEEDS = resolve(ROOT, 'seeds/raw-items.json')
const OUT_DIR = resolve(ROOT, 'public/data')
const OUT = resolve(OUT_DIR, 'items.json')

// 来源权重（模拟）
const SOURCE_WEIGHT = {
  '华尔街见闻': 1.0,
  '财联社': 1.0,
  '东方财富': 0.9,
  '金十数据': 0.95,
  '证券时报': 0.9,
  'Fed中文网': 0.85,
}

// 关键词 → 标签
const KEYWORD_TAGS = [
  [['降准', '降息', '货币政策', '央行', '美联储', 'fed'], '货币政策'],
  [['黄金'], '大宗商品'],
  [['原油', '铜', '大宗'], '大宗商品'],
  [['汇率', '人民币', '美元', '外汇'], '外汇'],
  [['比特币', '加密', 'eth', 'btc'], '加密货币'],
  [['a股', '上证', '深成', '沪深'], 'A股'],
  [['港股', '恒生'], '港股'],
  [['美股', '纳指', '道指', '标普'], '美股'],
  [['债券', '国债', '收益率'], '债券'],
]

function deriveTags(title, body, category) {
  const text = `${title} ${body}`.toLowerCase()
  const tags = new Set()
  for (const [kws, tag] of KEYWORD_TAGS) {
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase())) { tags.add(tag); break }
    }
  }
  // 兜底：未命中任何关键词时回退到分类，保证 tags 非空
  if (tags.size === 0 && category) tags.add(category)
  return [...tags]
}

const SEED_REQUIRED = ['title', 'source', 'hoursAgo', 'body', 'category']

function build() {
  const raw = JSON.parse(readFileSync(SEEDS, 'utf8'))
  // 种子必填字段校验：缺字段直接报红并指向具体条目，避免 NaN 时间崩溃
  raw.forEach((it, i) => {
    for (const f of SEED_REQUIRED) {
      if (it[f] === undefined || it[f] === null || it[f] === '')
        throw new Error(`种子条目 #${i} 缺少必填字段 "${f}"（${JSON.stringify(it).slice(0, 80)}）`)
    }
  })
  const now = Date.now()

  const processed = raw.map((it, i) => {
    const id = `n${String(i + 1).padStart(4, '0')}`
    const time = new Date(now - it.hoursAgo * 3600 * 1000).toISOString()
    const weight = SOURCE_WEIGHT[it.source] ?? 0.8
    const heat = Math.round(weight * Math.exp(-it.hoursAgo / 24) * 100)
    const summary = (it.body || '').slice(0, 80)
    const tags = deriveTags(it.title, it.body, it.category)
    return {
      id,
      time,
      source: it.source,
      category: it.category,
      heat,
      title: it.title,
      summary,
      tags,
      extraSources: [],
      eventKey: it.eventKey || null,
    }
  })

  // 同 eventKey 合并：主条取热度最高者，其余信源进入 extraSources
  const byKey = new Map()
  const singles = []
  for (const it of processed) {
    if (it.eventKey) {
      if (!byKey.has(it.eventKey)) byKey.set(it.eventKey, [])
      byKey.get(it.eventKey).push(it)
    } else {
      singles.push(it)
    }
  }
  const merged = []
  for (const [, group] of byKey) {
    const sorted = [...group].sort((a, b) => b.heat - a.heat)
    const primary = { ...sorted[0] }
    const extra = [...new Set(sorted.slice(1).map((g) => g.source))]
    primary.extraSources = extra
    merged.push(primary)
  }

  const items = [...singles, ...merged].sort(
    (a, b) => new Date(b.time) - new Date(a.time),
  )

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT, JSON.stringify(items, null, 2) + '\n', 'utf8')
  console.log(
    `build-data: 输入 ${raw.length} 条，输出 ${items.length} 条（合并 ${byKey.size} 组同事件），已写入 ${OUT}`,
  )
}

build()
