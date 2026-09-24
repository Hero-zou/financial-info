// backtest.mjs — 5日线战法历史回测（随机抽样）
// 规则与实盘筛选同口径：
//   信号（买入条件）= topHorse（站上60日线且MA60向上）&& above5（收盘≥MA5）
//   买入 = 信号次日开盘价进场
//   卖出 = 持有期间任一收盘 < 当日MA5 → 当日收盘离场（跌破5日线即失败离场）
//   数据期末仍未破线 → 按最后收盘计（未平仓）
// 宇宙 = market459-result.json 的 ytd50（年内涨幅>50%强势股池），排除科创板(sh688)/北证(bj)/ST
// 随机抽样：股票池随机取 M 只 → 每只顺序模拟（不重叠持仓）→ 信号笔数随机抽 N 笔统计
// ⚠️ 偏差声明：宇宙本身是"年内已涨>50%"的强势股，回测结果天然偏乐观；未计手续费/滑点
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STOCK_SAMPLE = Number(process.env.STOCK_SAMPLE || 120) // 随机抽多少只股票
const SIGNAL_SAMPLE = Number(process.env.SIGNAL_SAMPLE || 400) // 统计用随机抽多少笔信号
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
const f2 = (v) => Math.round(v * 100) / 100

async function fetchBars(code) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,250,qfq`
  const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()
  const node = j?.data?.[code]
  const rows = node?.qfqday || node?.day || []
  if (!Array.isArray(rows) || rows.length < 70) return null
  return rows.map((r) => ({
    date: String(r[0]),
    open: parseFloat(r[1]),
    close: parseFloat(r[2]),
    high: parseFloat(r[3]),
  }))
}

// 单只股票顺序回测：非重叠持仓
function backtestStock(code, name, bars) {
  const closes = bars.map((b) => b.close)
  const n = bars.length
  const trades = []
  let i = 65 // 前65天预热均线
  while (i < n - 1) {
    const ma5 = mean(closes.slice(i - 4, i + 1))
    const ma20 = mean(closes.slice(i - 19, i + 1))
    const ma60 = mean(closes.slice(i - 59, i + 1))
    const ma60Prev = mean(closes.slice(i - 64, i - 4)) // 5天前的MA60
    const c = closes[i]
    const topHorse = c > ma60 && ma60 > ma60Prev
    const above5 = c >= ma5
    if (topHorse && above5 && bars[i + 1].open > 0) {
      // 次日开盘进场
      const entry = bars[i + 1].open
      let exitIdx = -1
      for (let d = i + 1; d < n; d++) {
        const m5 = mean(closes.slice(Math.max(0, d - 4), d + 1))
        if (closes[d] < m5) { exitIdx = d; break }
      }
      const exitAt = exitIdx >= 0 ? exitIdx : n - 1
      const exitPrice = closes[exitAt]
      trades.push({
        code, name,
        entryDate: bars[i + 1].date,
        exitDate: bars[exitAt].date,
        ret: (exitPrice / entry - 1) * 100,
        hold: exitAt - (i + 1) + 1,
        open_: exitIdx < 0, // 期末仍未破线
      })
      i = exitAt + 1 // 离场后从下一根继续找信号
    } else {
      i++
    }
  }
  return trades
}

// ── main ──
const m459 = JSON.parse(fs.readFileSync(path.join(DIR, 'market459-result.json'), 'utf8'))
const universe = (m459.ytd50 || []).filter(
  (r) => r && r.code && !/^sh688/.test(r.code) && !/^bj/.test(r.code) && !/ST/.test(r.name || ''),
)
const shuffled = [...universe].sort(() => Math.random() - 0.5)
const picks = shuffled.slice(0, STOCK_SAMPLE)
console.log(`宇宙 ${universe.length} 只（排除科创/北证/ST）→ 随机抽 ${picks.length} 只回测`)

let allTrades = []
let fetched = 0
for (const [k, s] of picks.entries()) {
  try {
    const bars = await fetchBars(s.code)
    if (bars) {
      fetched++
      allTrades.push(...backtestStock(s.code, s.name || s.code, bars))
    }
  } catch { /* 单只失败跳过 */ }
  if ((k + 1) % 20 === 0) console.log(`  进度 ${k + 1}/${picks.length}，已产生信号 ${allTrades.length} 笔`)
  await sleep(300)
}

// 随机抽 N 笔统计
const sampled = [...allTrades].sort(() => Math.random() - 0.5).slice(0, SIGNAL_SAMPLE)
const rets = sampled.map((t) => t.ret)
const wins = rets.filter((r) => r > 0)
const sorted = [...rets].sort((a, b) => a - b)
const med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
const edges = [-Infinity, -10, -5, 0, 5, 10, Infinity]
const labels = ['<-10%', '-10~-5%', '-5~0%', '0~+5%', '+5~+10%', '>+10%']
const buckets = labels.map((label, i) => ({
  label,
  n: rets.filter((r) => r > edges[i] && r <= edges[i + 1]).length,
}))
const byRet = [...sampled].sort((a, b) => b.ret - a.ret)
const winRate = rets.length ? +((wins.length / rets.length) * 100).toFixed(1) : null
const avgRet = rets.length ? +(rets.reduce((a, b) => a + b, 0) / rets.length).toFixed(2) : null
const avgHold = sampled.length ? +(sampled.reduce((a, t) => a + t.hold, 0) / sampled.length).toFixed(1) : null
const medRet = sorted.length ? +med.toFixed(2) : null

const out = {
  generated: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' '),
  universe: universe.length,
  stocksFetched: fetched,
  totalSignals: allTrades.length,
  sampled: sampled.length,
  winRate,
  avgRet,
  medRet,
  avgHold,
  buckets,
  best: byRet[0] ? { name: byRet[0].name, date: byRet[0].entryDate, ret: f2(byRet[0].ret), hold: byRet[0].hold } : null,
  worst: byRet.length ? { name: byRet[byRet.length - 1].name, date: byRet[byRet.length - 1].entryDate, ret: f2(byRet[byRet.length - 1].ret), hold: byRet[byRet.length - 1].hold } : null,
  note: '宇宙为年内涨幅>50%强势股（存在强势股偏差，结果偏乐观）；随机抽样；买入=信号次日开盘，卖出=收盘跌破5日线；未计手续费',
}
fs.writeFileSync(path.join(DIR, 'backtest.json'), JSON.stringify(out, null, 2))
console.log(`\n回测完成：${fetched} 只 / 信号 ${allTrades.length} 笔 / 抽样统计 ${sampled.length} 笔`)
console.log(`胜率 ${winRate}% | 均收益 ${avgRet}% | 中位数 ${medRet}% | 平均持有 ${avgHold} 天`)
console.log('分布:', buckets.map((b) => `${b.label}:${b.n}`).join('  '))
