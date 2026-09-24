// tmp_analyze.mjs — 按鳄鱼派 5 日线战法分析截图中的 8 只自选股
// 战法层次: ①头等马(站上60日线+60日线向上) ②多头排列(MA5>MA20>MA60) ③OBV资金 ④5日线节奏
const NAMES = [
  ['昭衍新药', 'sh603127'],
  ['生益科技', 'sh600183'],
  ['天孚通信', 'sz300394'],
  ['好想你', 'sz002582'],
  ['金安国纪', 'sz002636'],
  ['烽火通信', 'sh600498'],
  ['哈药股份', 'sh600664'],
  ['天通股份', 'sh600330'],
]
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const f2 = (n) => (n == null ? '--' : n.toFixed(2))

// 用 smartbox 校正代码(名称→代码),失败则用上面的默认
async function resolveCode(name, fallback) {
  try {
    const r = await fetch(`https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(name)}&t=all`, { signal: AbortSignal.timeout(8000) })
    const buf = Buffer.from(await r.arrayBuffer())
    const text = new TextDecoder('gbk').decode(buf)
    const m = text.match(/v_hint="([^"]*)"/)
    if (m) {
      const first = m[1].split('^')[0] // 形如 sh603127~昭衍新药~GP-A~
      const code = first.split('~')[0]
      const nm = first.split('~')[1]
      if (code && nm && nm.includes(name.slice(0, 2))) return [nm, code]
    }
  } catch { /* 用 fallback */ }
  return [name, fallback]
}

async function analyze([name, code]) {
  const base = { name, code }
  try {
    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,80,qfq`
    const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()
    const node = j?.data?.[code]
    const rows = node?.qfqday || node?.day || []
    if (!Array.isArray(rows) || rows.length < 60) throw new Error('K线不足60根')
    // 字段: [date, open, close, high, low, volume]
    const closes = rows.map((r) => parseFloat(r[2]))
    const highs = rows.map((r) => parseFloat(r[3]))
    const vols = rows.map((r) => parseFloat(r[5]))

    const qt = node.qt?.[code]
    const rtPrice = qt ? parseFloat(qt[3]) : NaN
    const rtPrev = qt ? parseFloat(qt[4]) : NaN
    const price = Number.isFinite(rtPrice) && rtPrice > 0 ? rtPrice : closes[closes.length - 1]
    const prevClose = Number.isFinite(rtPrev) && rtPrev > 0 ? rtPrev : closes[closes.length - 2]
    const pct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : NaN

    const lastDate = String(rows[rows.length - 1][0]).replace(/-/g, '')
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const todayInKline = lastDate === ymd

    // 含今日实时价的序列(若今日K线未生成)
    const series = closes.slice()
    if (!todayInKline && Number.isFinite(price)) series.push(price)

    const ma5 = series.length >= 5 ? mean(series.slice(-5)) : null
    const ma10 = series.length >= 10 ? mean(series.slice(-10)) : null
    const ma20 = series.length >= 20 ? mean(series.slice(-20)) : null
    const ma60 = series.length >= 60 ? mean(series.slice(-60)) : null
    // 60日线向上: 当前MA60 vs 5根前的MA60
    const ma60Prev = series.length >= 65 ? mean(series.slice(-65, -5)) : null
    const ma60Up = ma60 != null && ma60Prev != null ? ma60 > ma60Prev : null

    const bullish = ma5 != null && ma20 != null && ma60 != null ? ma5 > ma20 && ma20 > ma60 : null
    const topHorse = ma60 != null && ma60Up != null ? price > ma60 && ma60Up : null
    const above5 = ma5 != null ? price >= ma5 : null

    // 昨日相对5日线(判断今日是否上穿/跌破)
    const closesOnly = closes.slice()
    const ma5Y = closesOnly.length >= 5 ? mean(closesOnly.slice(-5)) : null
    const prevPrice = closesOnly[closesOnly.length - 1]
    const prevAbove = ma5Y != null && prevPrice != null ? prevPrice >= ma5Y : null
    let cross = null // 'up' 上穿 | 'down' 跌破 | null
    if (above5 != null && prevAbove != null) {
      if (!prevAbove && above5) cross = 'up'
      else if (prevAbove && !above5) cross = 'down'
    }

    // OBV 与 OBV_MA20
    let obv = 0
    const obvArr = []
    for (let i = 0; i < closes.length; i++) {
      if (i > 0) {
        if (closes[i] > closes[i - 1]) obv += vols[i]
        else if (closes[i] < closes[i - 1]) obv -= vols[i]
      }
      obvArr.push(obv)
    }
    const obvMa20 = obvArr.length >= 20 ? mean(obvArr.slice(-20)) : null
    const obvUp = obvMa20 != null ? obvArr[obvArr.length - 1] >= obvMa20 : null
    const darkHorse = ma60 != null && ma60Up != null ? !topHorse && obvUp : false

    // 前高压力位(不含最新一根的区间最高)
    const prevHigh = highs.length >= 2 ? Math.max(...highs.slice(0, -1)) : null

    return { ...base, price, pct, ma5, ma10, ma20, ma60, ma60Up, bullish, topHorse, above5, cross, obvUp, darkHorse, prevHigh, error: null }
  } catch (e) {
    return { ...base, error: e.message || String(e) }
  }
}

const results = []
for (const item of NAMES) {
  const [nm, code] = await resolveCode(item[0], item[1])
  results.push(await analyze([nm, code]))
}

console.log('名称 | 现价 | 涨跌% | MA5 | MA10 | MA20 | MA60 | 60线上行 | 多头排列 | 站上5线 | 今日交叉 | OBV强 | 前高 | 距前高%')
for (const r of results) {
  if (r.error) { console.log(`${r.name} | ERROR: ${r.error}`); continue }
  const distHigh = r.prevHigh ? ((r.price - r.prevHigh) / r.prevHigh) * 100 : null
  console.log(
    [r.name, f2(r.price), (Number.isFinite(r.pct) ? r.pct.toFixed(2) : '--'), f2(r.ma5), f2(r.ma10), f2(r.ma20), f2(r.ma60),
      r.ma60Up ? '↑' : '↓', r.bullish ? '✓' : '✗', r.above5 ? '是' : '否',
      r.cross === 'up' ? '上穿' : r.cross === 'down' ? '跌破' : '—', r.obvUp ? '强' : '弱',
      f2(r.prevHigh), distHigh == null ? '--' : distHigh.toFixed(1) + '%',
    ].join(' | '),
  )
}
console.log('')
console.log('=== 战法判定 ===')
for (const r of results) {
  if (r.error) continue
  let verdict
  if (r.topHorse && r.above5) verdict = '✅ 符合：头等马+站上5日线（持有/回踩5线买点区）'
  else if (r.topHorse && !r.above5 && r.cross === 'down') verdict = '⚠️ 趋势在但今日跌破5日线（减仓信号，收复再接回）'
  else if (r.topHorse && !r.above5) verdict = '⚠️ 趋势在但价格在5日线下（等回踩企稳/收复5线）'
  else if (!r.topHorse && r.obvUp) verdict = '🕐 黑马候选：60日趋势未起，但OBV资金先行（观察，不进场）'
  else verdict = '❌ 不符合：60日线趋势未向上/价格在其下'
  console.log(`${r.name}: ${verdict}`)
}
