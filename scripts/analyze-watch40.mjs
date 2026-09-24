// analyze-watch40.mjs — 通达信「长期观察」分组 40 只 → 鳄鱼派 5 日线战法判定
// 同时输出可直接粘贴进自选池「粘贴导入」的格式
const NAMES = [
  ['宏和科技', 'sh603256'],
  ['东山精密', 'sz002384'],
  ['本川智能', 'sz300946'],
  ['平安电工', 'sz001359'],
  ['菲利华', 'sz300395'],
  ['长飞光纤', 'sh601869'],
  ['莲花控股', 'sh600186'],
  ['三环集团', 'sz300408'],
  ['中天科技', 'sh600522'],
  ['天通股份', 'sh600330'],
  ['山东玻纤', 'sh605006'],
  ['中际旭创', 'sz300308'],
  ['光库科技', 'sz300620'],
  ['新易盛', 'sz300502'],
  ['洛阳钼业', 'sh603993'],
  ['富满微', 'sz300671'],
  ['英维克', 'sz002837'],
  ['长电科技', 'sh600584'],
  ['国际复材', 'sz301526'],
  ['工业富联', 'sh601138'],
  ['中国巨石', 'sh600176'],
  ['章源钨业', 'sz002378'],
  ['沪电股份', 'sz002463'],
  ['生益科技', 'sh600183'],
  ['天孚通信', 'sz300394'],
  ['风华高科', 'sz000636'],
  ['利通电子', 'sh603629'],
  ['鑫磊股份', 'sz301317'],
  ['华天科技', 'sz002185'],
  ['卧龙电驱', 'sh600580'],
  ['永鼎股份', 'sh600105'],
  ['有研新材', 'sh600206'],
  ['TCL科技', 'sz000100'],
  ['光迅科技', 'sz002281'],
  ['昭衍新药', 'sh603127'],
  ['火炬电子', 'sh603678'],
  ['胜宏科技', 'sz300476'],
  ['艾可蓝', 'sz300816'],
  ['中材科技', 'sz002080'],
  ['景旺电子', 'sh603228'],
]
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const f2 = (n) => (n == null ? '--' : n.toFixed(2))

async function resolveCode(name, fallback) {
  try {
    const r = await fetch(`https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(name)}&t=all`, { signal: AbortSignal.timeout(8000) })
    const buf = Buffer.from(await r.arrayBuffer())
    const text = new TextDecoder('gbk').decode(buf)
    const m = text.match(/v_hint="([^"]*)"/)
    if (m) {
      const first = m[1].split('^')[0]
      const code = first.split('~')[0]
      const nm = first.split('~')[1]
      if (code && nm && nm.includes(name.slice(0, 2))) return [nm, code]
    }
  } catch { /* fallback */ }
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

    const series = closes.slice()
    if (!todayInKline && Number.isFinite(price)) series.push(price)

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

    const ma5Y = closes.length >= 5 ? mean(closes.slice(-5)) : null
    const prevPrice = closes[closes.length - 1]
    const prevAbove = ma5Y != null && prevPrice != null ? prevPrice >= ma5Y : null
    let cross = null
    if (above5 != null && prevAbove != null) {
      if (!prevAbove && above5) cross = 'up'
      else if (prevAbove && !above5) cross = 'down'
    }

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
    const prevHigh = highs.length >= 2 ? Math.max(...highs.slice(0, -1)) : null
    return { ...base, price, pct, ma5, ma10, ma20, ma60, ma60Up, bullish, topHorse, above5, diff5, cross, obvUp, darkHorse, prevHigh, error: null }
  } catch (e) {
    return { ...base, error: e.message || String(e) }
  }
}

const results = []
for (const item of NAMES) {
  const [nm, code] = await resolveCode(item[0], item[1])
  results.push(await analyze([nm, code]))
}

console.log('=== 明细 ===')
console.log('名称 | 代码 | 现价 | 涨跌% | MA5 | 距5线% | MA10 | MA20 | MA60 | 60线 | 多头排列 | 站上5线 | 今日交叉 | OBV | 前高 | 距前高%')
for (const r of results) {
  if (r.error) { console.log(`${r.name} | ${r.code} | ERROR: ${r.error}`); continue }
  const distHigh = r.prevHigh ? ((r.price - r.prevHigh) / r.prevHigh) * 100 : null
  console.log(
    [r.name, r.code, f2(r.price), (Number.isFinite(r.pct) ? r.pct.toFixed(2) : '--'), f2(r.ma5),
      r.diff5 == null ? '--' : r.diff5.toFixed(1) + '%', f2(r.ma10), f2(r.ma20), f2(r.ma60),
      r.ma60Up ? '↑' : '↓', r.bullish ? '✓' : '✗', r.above5 ? '是' : '否',
      r.cross === 'up' ? '上穿' : r.cross === 'down' ? '跌破' : '—', r.obvUp ? '强' : '弱',
      f2(r.prevHigh), distHigh == null ? '--' : distHigh.toFixed(1) + '%',
    ].join(' | '),
  )
}

console.log('')
console.log('=== 战法分组 ===')
const groups = { ok: [], watch5: [], dark: [], no: [], err: [] }
for (const r of results) {
  if (r.error) { groups.err.push(r); continue }
  if (r.topHorse && r.above5) groups.ok.push(r)
  else if (r.topHorse) groups.watch5.push(r)
  else if (r.obvUp) groups.dark.push(r)
  else groups.no.push(r)
}
const line = (r) => {
  const distHigh = r.prevHigh ? `${(((r.price - r.prevHigh) / r.prevHigh) * 100).toFixed(1)}%` : '--'
  return `${r.name}(${f2(r.price)}, 5线${f2(r.ma5)}, 距5线${r.diff5 == null ? '--' : r.diff5.toFixed(1)}%, 前高${f2(r.prevHigh)}, 距前高${distHigh})`
}
console.log(`\n✅ 符合（头等马+站上5日线） ${groups.ok.length} 只:`)
groups.ok.forEach((r) => console.log('  ' + line(r)))
console.log(`\n⚠️ 头等马但价格在5日线下 ${groups.watch5.length} 只:`)
groups.watch5.forEach((r) => console.log('  ' + line(r) + (r.cross === 'down' ? ' ←今日刚跌破' : '')))
console.log(`\n🕐 黑马候选（趋势未起，OBV 资金先行） ${groups.dark.length} 只:`)
groups.dark.forEach((r) => console.log('  ' + line(r)))
console.log(`\n❌ 不符合 ${groups.no.length} 只:`)
groups.no.forEach((r) => console.log('  ' + line(r)))
if (groups.err.length) {
  console.log(`\n⚠️ 取数失败 ${groups.err.length} 只:`)
  groups.err.forEach((r) => console.log(`  ${r.name} ${r.code}: ${r.error}`))
}

console.log('')
console.log('=== 粘贴导入格式（自选池） ===')
console.log(results.map((r) => `${r.code} ${r.name}`).join('\n'))
