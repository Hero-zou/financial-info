// fetch-real.mjs — 真实数据源抓取：新浪财经滚动新闻 + 腾讯财经行情
// 输出与 build-data.mjs 同 schema 的 items.json + quotes.json，前端无需改动即可消费。
// 网络/接口失败时：新闻回退 seeds(mock)，行情回退占位「--」。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, 'public/data')
const ITEMS = resolve(OUT_DIR, 'items.json')
const QUOTES = resolve(OUT_DIR, 'quotes.json')

// 关键词 → 标签（与新浪正文/标题匹配）
const KEYWORD_TAGS = [
  [['降准', '降息', '货币政策', '央行', '美联储', 'fed'], '货币政策'],
  [['黄金', '原油', '铜', '大宗'], '大宗商品'],
  [['汇率', '人民币', '美元', '外汇'], '外汇'],
  [['比特币', '加密', 'eth', 'btc'], '加密货币'],
  [['a股', '上证', '深成', '沪深', '创业板'], 'A股'],
  [['港股', '恒生'], '港股'],
  [['美股', '纳指', '道指', '标普'], '美股'],
  [['债券', '国债', '收益率'], '债券'],
]
const SOURCE_WEIGHT = { 新浪财经: 1.0, 财联社: 1.0, 东方财富: 0.95 }
const CATEGORY_BY_TAG = {
  A股: 'A股', 港股: '港股', 美股: '美股', 货币政策: '央行',
  外汇: '外汇', 大宗商品: '大宗', 债券: '债券', 加密货币: '加密', 宏观: '宏观',
}

function deriveTags(title, body) {
  const text = `${title} ${body}`.toLowerCase()
  const tags = new Set()
  for (const [kws, tag] of KEYWORD_TAGS) {
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase())) { tags.add(tag); break }
    }
  }
  if (tags.size === 0) tags.add('宏观') // 兜底：保证非空
  return [...tags]
}
function categorize(tags) {
  for (const t of tags) if (CATEGORY_BY_TAG[t]) return CATEGORY_BY_TAG[t]
  return '宏观'
}

async function fetchNews() {
  const url =
    'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&num=50&version=1'
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`新浪 HTTP ${res.status}`)
  const j = await res.json()
  const list = j?.result?.data || []
  if (!list.length) throw new Error('新浪返回空数据')
  const now = Date.now()
  const items = list
    .map((d, i) => {
      const ctime = Number(d.ctime) || Math.floor(now / 1000)
      const time = new Date(ctime * 1000).toISOString()
      const hoursAgo = (now - ctime * 1000) / 3600000
      const weight = SOURCE_WEIGHT[d.media_name] ?? 0.9
      const heat = Math.round(weight * Math.exp(-hoursAgo / 24) * 100)
      const title = (d.title || '').trim()
      const body = (d.intro || d.summary || d.wapsummary || '').trim()
      const tags = deriveTags(title, body)
      return {
        id: `r${String(i + 1).padStart(4, '0')}`,
        time,
        source: d.media_name || '新浪财经',
        category: categorize(tags),
        heat,
        title,
        summary: body.slice(0, 80),
        tags,
        extraSources: [],
        eventKey: null,
        url: d.url || '',
      }
    })
    .filter((it) => it.title && it.summary)
  return items
}

const QUOTE_CODES = {
  s_sh000001: '上证指数',
  s_sz399001: '深证成指',
  s_sz399006: '创业板指',
  s_sh000300: '沪深300',
  s_hkHSI: '恒生指数',
  s_usIXIC: '纳斯达克',
}
async function fetchQuotes() {
  const q = Object.keys(QUOTE_CODES).join(',')
  const res = await fetch(`https://qt.gtimg.cn/q=${q}`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`gtimg HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const text = new TextDecoder('gbk').decode(buf)
  const out = []
  for (const line of text.split('\n')) {
    const m = line.trim().replace(/;$/, '').match(/^v_s_(\w+)="(.+)"$/)
    if (!m) continue
    const name = QUOTE_CODES['s_' + m[1]]
    if (!name) continue
    const f = m[2].split('~')
    const value = f[3] || ''
    const pct = parseFloat(f[5])
    if (!value || Number.isNaN(pct)) continue
    out.push({ name, value, pct: Math.round(pct * 100) / 100 })
  }
  if (!out.length) throw new Error('gtimg 解析为空')
  return out
}

function fallbackMock() {
  console.log('⚠️ 真实新闻获取失败，回退模拟数据（seeds）')
  execSync(`node ${resolve(__dirname, 'build-data.mjs')}`, {
    stdio: 'inherit',
    cwd: ROOT,
  })
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

  let news = null
  try {
    news = await fetchNews()
    console.log(`✓ 新浪新闻获取 ${news.length} 条`)
  } catch (e) {
    console.error('✗ 新闻获取失败:', e.message)
    fallbackMock()
    news = null
  }
  if (news) {
    const seen = new Set()
    const dedup = []
    for (const it of news) {
      if (seen.has(it.title)) continue
      seen.add(it.title)
      dedup.push(it)
    }
    writeFileSync(ITEMS, JSON.stringify(dedup, null, 2) + '\n', 'utf8')
    console.log(`→ items.json 写入 ${dedup.length} 条（已去重）`)
  }

  try {
    const q = await fetchQuotes()
    writeFileSync(QUOTES, JSON.stringify(q, null, 2) + '\n', 'utf8')
    console.log(`✓ 行情获取 ${q.length} 条 → quotes.json`)
  } catch (e) {
    console.error('✗ 行情获取失败，写占位兜底:', e.message)
    const fallback = Object.values(QUOTE_CODES).map((name) => ({
      name,
      value: '--',
      pct: 0,
    }))
    writeFileSync(QUOTES, JSON.stringify(fallback, null, 2) + '\n', 'utf8')
  }
}
main()
