// analyze-watch48.mjs — 自选池(截图8 + 通达信40, 去重=44) 实时鳄鱼派 5 日线战法判定
// 数据源: 腾讯 gtimg 日K (web.ifzq.gtimg.cn) + 实时 qt 行情; 红涨绿跌本脚本仅算数
import { writeFileSync } from 'fs'

const NAMES = [
  // === 通达信「长期观察」40 只 ===
  ['宏和科技', 'sh603256'], ['东山精密', 'sz002384'], ['本川智能', 'sz300946'], ['平安电工', 'sz001359'],
  ['菲利华', 'sz300395'], ['长飞光纤', 'sh601869'], ['莲花控股', 'sh600186'], ['三环集团', 'sz300408'],
  ['中天科技', 'sh600522'], ['天通股份', 'sh600330'], ['山东玻纤', 'sh605006'], ['中际旭创', 'sz300308'],
  ['光库科技', 'sz300620'], ['新易盛', 'sz300502'], ['洛阳钼业', 'sh603993'], ['富满微', 'sz300671'],
  ['英维克', 'sz002837'], ['长电科技', 'sh600584'], ['国际复材', 'sz301526'], ['工业富联', 'sh601138'],
  ['中国巨石', 'sh600176'], ['章源钨业', 'sz002378'], ['沪电股份', 'sz002463'], ['生益科技', 'sh600183'],
  ['天孚通信', 'sz300394'], ['风华高科', 'sz000636'], ['利通电子', 'sh603629'], ['鑫磊股份', 'sz301317'],
  ['华天科技', 'sz002185'], ['卧龙电驱', 'sh600580'], ['永鼎股份', 'sh600105'], ['有研新材', 'sh600206'],
  ['TCL科技', 'sz000100'], ['光迅科技', 'sz002281'], ['昭衍新药', 'sh603127'], ['火炬电子', 'sh603678'],
  ['胜宏科技', 'sz300476'], ['艾可蓝', 'sz300816'], ['中材科技', 'sz002080'], ['景旺电子', 'sh603228'],
  // === 截图 8 只中不在上面 40 里的 4 只 ===
  ['好想你', 'sz002582'], ['金安国纪', 'sz002636'], ['烽火通信', 'sh600498'], ['哈药股份', 'sh600664'],
]

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const f2 = (n) => (n == null || !Number.isFinite(n) ? null : Number(n.toFixed(2)))

// 5 日线战法核心判定
function tactic(closes, highs, vols, price, prevClose) {
  const series = closes.slice()
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  // 这里 closes 已含当日(若存在); 用当日实时价无则取最后收盘
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
  // 昨日交叉
  const closesOnly = closes.slice()
  const ma5Y = closesOnly.length >= 5 ? mean(closesOnly.slice(-5)) : null
  const prevPrice = closesOnly[closesOnly.length - 1]
  const prevAbove = ma5Y != null && prevPrice != null ? prevPrice >= ma5Y : null
  let cross = null
  if (above5 != null && prevAbove != null) {
    if (!prevAbove && above5) cross = 'up'
    else if (prevAbove && !above5) cross = 'down'
  }
  // OBV
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
  const distHigh = prevHigh ? ((price - prevHigh) / prevHigh) * 100 : null
  return { ma5, ma10, ma20, ma60, ma60Up, bullish, topHorse, above5, diff5, cross, obvUp, darkHorse, prevHigh, distHigh }
}

async function analyze([name, code]) {
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
    const pct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null
    // 今日K线是否已生成 → 用实时价拼接序列
    const lastDate = String(rows[rows.length - 1][0]).replace(/-/g, '')
    const d = new Date()
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const series = closes.slice()
    if (lastDate !== ymd && Number.isFinite(price)) series.push(price)
    const t = tactic(series, highs, vols, price, prevClose)
    // 战法分层
    let tier, verdict
    if (t.topHorse && t.above5) { tier = 'buy'; verdict = '✅ 可买入持有：头等马(站上60日线+60日线上行)且站上5日线' }
    else if (t.topHorse && t.cross === 'down') { tier = 'watch'; verdict = '⚠️ 观察：趋势在但今日跌破5日线(减仓/等收复)' }
    else if (t.topHorse) { tier = 'watch'; verdict = '⚠️ 观察：头等马但价在5日线下(等回踩企稳)' }
    else if (t.darkHorse) { tier = 'dark'; verdict = '🕐 黑马候选：60日趋势未起但OBV资金先行(不进场)' }
    else { tier = 'remove'; verdict = '❌ 建议移除：60日线趋势未向上/价在其下' }
    return {
      name, code, price: f2(price), pct: pct == null ? null : f2(pct),
      ma5: f2(t.ma5), ma10: f2(t.ma10), ma20: f2(t.ma20), ma60: f2(t.ma60),
      ma60Up: t.ma60Up, bullish: t.bullish, topHorse: t.topHorse, above5: t.above5,
      diff5: t.diff5 == null ? null : f2(t.diff5), cross: t.cross, obvUp: t.obvUp,
      darkHorse: t.darkHorse, prevHigh: f2(t.prevHigh), distHigh: t.distHigh == null ? null : f2(t.distHigh),
      tier, verdict, error: null,
    }
  } catch (e) {
    return { name, code, error: e.message || String(e) }
  }
}

const results = []
for (const item of NAMES) results.push(await analyze(item))

const ok = results.filter((r) => !r.error)
const errs = results.filter((r) => r.error)
const buy = ok.filter((r) => r.tier === 'buy')
const watch = ok.filter((r) => r.tier === 'watch')
const dark = ok.filter((r) => r.tier === 'dark')
const remove = ok.filter((r) => r.tier === 'remove')

writeFileSync('watch48-result.json', JSON.stringify({ generated: new Date().toISOString(), results, buy, watch, dark, remove }, null, 2))

console.log(`\n=== 自选池 44 只 5 日线战法（数据时点 ${new Date().toLocaleString('zh-CN')}） ===`)
console.log(`可买入持有 ${buy.length} | 观察 ${watch.length} | 黑马候选 ${dark.length} | 建议移除 ${remove.length} | 失败 ${errs.length}\n`)
const show = (r) => `  ${r.name}(${r.code}) 现价${r.price} 距5线${r.diff5 == null ? '--' : r.diff5 + '%'} MA60${r.ma60Up ? '↑' : '↓'} 多头${r.bullish ? '✓' : '✗'} 站5线${r.above5 ? '是' : '否'} 前高${r.prevHigh}(距${r.distHigh == null ? '--' : r.distHigh + '%'})`
console.log('【可买入持有】')
buy.forEach((r) => console.log(show(r)))
console.log('\n【观察中(头等马但未站上5线)】')
watch.forEach((r) => console.log(show(r) + (r.cross === 'down' ? ' ←今日跌破' : '')))
console.log('\n【黑马候选(资金先行)】')
dark.forEach((r) => console.log(show(r)))
console.log('\n【建议移除】')
remove.forEach((r) => console.log(show(r)))
if (errs.length) { console.log('\n【取数失败】'); errs.forEach((r) => console.log(`  ${r.name} ${r.code}: ${r.error}`)) }
