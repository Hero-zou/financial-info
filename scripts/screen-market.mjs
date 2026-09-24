// screen-market.mjs — 全市场 A 股(东财全量代码) 实时筛选:
//   ① 年内(2026)区间涨幅 > 50%  (≈用户已有的 459 只宇宙)
//   ② 对其跑鳄鱼派 5 日线战法, 标记"可买入持有"子集
// 数据源: 东财全量代码列表 + 腾讯 gtimg 日K(qfq, 250 根覆盖年初)
import { writeFileSync, readFileSync } from 'fs'

const NODE = '/c/Users/571/.workbuddy/binaries/node/versions/22.22.2-3/node.exe'
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const f2 = (n) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(2)))

function prefix(code) {
  if (/^(sh|sz|bj)/.test(code)) return code
  if (/^(6|9)/.test(code)) return 'sh' + code
  if (/^(0|2|3)/.test(code)) return 'sz' + code
  if (/^(4|8)/.test(code)) return 'bj' + code
  return code
}

async function fetchCodes() {
  const fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
  const out = []
  let pn = 1
  let total = null
  const pz = 100
  while (true) {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=${pz}&fs=${fs}&fields=f12,f14&_=${Date.now()}`
    const j = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json()
    if (total === null) total = j?.data?.total || 0
    const diff = j?.data?.diff
    let arr = []
    if (Array.isArray(diff)) arr = diff
    else if (diff && typeof diff === 'object') arr = Object.values(diff)
    const page = (arr || []).map((x) => ({ code: prefix(String(x.f12)), name: String(x.f14 || '') })).filter((x) => /^(sh|sz|bj)\d{6}$/.test(x.code))
    out.push(...page)
    if (page.length === 0 || (total && out.length >= total)) break
    pn++
  }
  return out
}

function tactic(closes, highs, vols, price) {
  const series = closes.slice()
  const ma5 = series.length >= 5 ? mean(series.slice(-5)) : null
  const ma10 = series.length >= 10 ? mean(series.slice(-10)) : null
  const ma20 = series.length >= 20 ? mean(series.slice(-20)) : null
  const ma60 = series.length >= 60 ? mean(series.slice(-60)) : null
  const ma60Prev = series.length >= 65 ? mean(series.slice(-65, -5)) : null
  const ma60Up = ma60 != null && ma60Prev != null ? ma60 > ma60Prev : null
  const bullish = ma5 != null && ma20 != null && ma60 != null ? ma5 > ma20 && ma20 > ma60 : null
  const topHorse = ma60 != null && ma60Up != null ? price > ma60 && ma60Up : null
  const above5 = ma5 != null ? price >= ma5 : null
  const diff5 = ma5 != null && ma5 > 0 ? ((price - ma5) / ma5) * 100 : null
  let obv = 0
  const obvArr = []
  for (let i = 0; i < closes.length; i++) {
    if (i > 0) { if (closes[i] > closes[i - 1]) obv += vols[i]; else if (closes[i] < closes[i - 1]) obv -= vols[i] }
    obvArr.push(obv)
  }
  const obvMa20 = obvArr.length >= 20 ? mean(obvArr.slice(-20)) : null
  const obvUp = obvMa20 != null ? obvArr[obvArr.length - 1] >= obvMa20 : null
  const prevHigh = highs.length >= 2 ? Math.max(...highs.slice(0, -1)) : null
  const distHigh = prevHigh ? ((price - prevHigh) / prevHigh) * 100 : null
  // 量比：最近完整K线量 / 前5日均量（高位放量识别用；盘中当日量不完整→剔除最后一根）
  const bjNow = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  const intraday = bjNow.slice(11, 16) < '15:00'
  const volBars = intraday ? vols.slice(0, -1) : vols
  const volPrev5 = volBars.length >= 6 ? mean(volBars.slice(-6, -1)) : null
  const volRatio = volPrev5 && volPrev5 > 0 ? volBars[volBars.length - 1] / volPrev5 : null
  return { ma5, ma10, ma20, ma60, ma60Up, bullish, topHorse, above5, diff5, obvUp, prevHigh, distHigh, volRatio }
}

async function analyze(stk) {
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${stk.code},day,,,250,qfq`
      const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()
      const node = j?.data?.[stk.code]
      const rows = node?.qfqday || node?.day || []
      if (!Array.isArray(rows) || rows.length < 60) return null
    const closes = rows.map((r) => parseFloat(r[2]))
    const highs = rows.map((r) => parseFloat(r[3]))
    const vols = rows.map((r) => parseFloat(r[5]))
    const qt = node.qt?.[stk.code]
    const price = qt && Number.isFinite(parseFloat(qt[3])) && parseFloat(qt[3]) > 0 ? parseFloat(qt[3]) : closes[closes.length - 1]
    // 年内(2026)区间涨幅: 找第一根日期>=2026-01-01 的收盘
    let yearOpen = null
    for (const r of rows) {
      const d = String(r[0]).replace(/-/g, '')
      if (d >= '20260101') { yearOpen = parseFloat(r[2]); break }
    }
    if (yearOpen == null || yearOpen <= 0) return null
    const ytd = (price / yearOpen - 1) * 100
    if (!(ytd > 50)) return null // 仅保留年内>50% 宇宙
    const t = tactic(closes, highs, vols, price)
    const buy = !!(t.topHorse && t.above5)
    // 当日涨跌幅：现价 vs 前一交易日收盘（盘中=实时涨跌，收盘后=当日涨跌）
    const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null
    const chg = prevClose && prevClose > 0 ? (price / prevClose - 1) * 100 : null
    return {
      code: stk.code, name: stk.name, price: f2(price), ytd: f2(ytd),
      chg: chg == null ? null : f2(chg),
      ma5: f2(t.ma5), ma10: f2(t.ma10), ma20: f2(t.ma20), ma60: f2(t.ma60),
      ma60Up: t.ma60Up, bullish: t.bullish, topHorse: t.topHorse, above5: t.above5,
      diff5: t.diff5 == null ? null : f2(t.diff5), obvUp: t.obvUp,
      prevHigh: f2(t.prevHigh), distHigh: t.distHigh == null ? null : f2(t.distHigh),
      volRatio: t.volRatio == null ? null : +t.volRatio.toFixed(2),
      buy,
    }
    } catch (e) { lastErr = e }
  }
  return null
}

// 并发池
async function pool(items, worker, size) {
  const out = []
  let i = 0
  const runners = Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++
      const r = await worker(items[idx]).catch(() => null)
      if (r) out.push(r)
    }
  })
  await Promise.all(runners)
  return out
}

const main = async () => {
  let codes = []
  try {
    codes = await fetchCodes()
  } catch (e) {
    // 东财 clist 被限流时的兜底：复用上次结果的候选宇宙（ytd50 ∪ buyable）
    console.warn(`⚠ 东财全量代码拉取失败（${e.message || e}），兜底复用上次 market459-result.json 的候选宇宙`)
    const prev = JSON.parse(readFileSync('market459-result.json', 'utf8'))
    const seen = new Map()
    for (const r of [...(prev.ytd50 || []), ...(prev.buyable || [])]) seen.set(r.code, { code: r.code, name: r.name })
    codes = [...seen.values()]
    console.warn(`  复用候选 ${codes.length} 只；今天新晋「年内+50%」的票会漏，东财恢复后建议全量重扫`)
  }
  console.log(`共 ${codes.length} 只, 开始逐只筛选(年内>50% + 5日战法)...`)
  const passed = await pool(codes, analyze, 18)
  const buyable = passed.filter((r) => r.buy)
  const byYtd = [...passed].sort((a, b) => b.ytd - a.ytd)
  const result = {
    generated: new Date().toISOString(),
    totalScanned: codes.length,
    ytd50Count: passed.length,
    buyableCount: buyable.length,
    ytd50: byYtd,
    buyable: [...buyable].sort((a, b) => b.ytd - a.ytd),
  }
  writeFileSync('market459-result.json', JSON.stringify(result, null, 2))
  console.log(`\n完成: 年内>50% 共 ${passed.length} 只; 其中符合5日战法(可买入持有) ${buyable.length} 只`)
  console.log('可买入持有清单:')
  buyable.slice(0, 60).forEach((r) => console.log(`  ${r.name}(${r.code}) 现价${r.price} 年内+${r.ytd}% 距5线${r.diff5 == null ? '--' : r.diff5 + '%'} MA60${r.ma60Up ? '↑' : '↓'} 多头${r.bullish ? '✓' : '✗'} 前高${r.prevHigh}(距${r.distHigh == null ? '--' : r.distHigh + '%'})`))
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
