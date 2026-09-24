// 胜率重算（正确口径）：用腾讯日K 自行计算 MA，以「5日线位置」判定持有健康/失败
// 数据时点：信号集 = 当前可买 98 只（9-23 重扫）；表现 = 9-23 盘中最新价 vs 5日线
import fs from 'fs'

const rd = JSON.parse(fs.readFileSync('./rank-data.json', 'utf8'))
const list = rd.ranked // 98 只，已排除科创板/北证
console.log('信号集:', list.length)

function ma(rows, n) {
  const cl = rows.slice(-n).map((r) => Number(r[2]))
  if (cl.length < n) return null
  return cl.reduce((a, b) => a + b, 0) / n
}

async function getKline(code) {
  for (let i = 0; i < 3; i++) {
    try {
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,70,qfq`
      const j = await (await fetch(url, { signal: AbortSignal.timeout(12000) })).json()
      const node = j?.data?.[code]
      const rows = node?.qfqday || node?.day || []
      if (Array.isArray(rows) && rows.length >= 60) return rows
    } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  return null
}

const out = []
for (const r of list) {
  const rows = await getKline(r.code)
  if (!rows) { out.push({ code: r.code, name: r.name, industry: r.industry, score: r.score, pick: r.pick, watch: r.watch, ok: false }); continue }
  const cur = Number(rows[rows.length - 1][2])      // 9-23 最新（盘中）
  const prevClose = Number(rows[rows.length - 2][2]) // 9-22 收盘
  const d23 = rows[rows.length - 1][0]
  const ma5 = ma(rows, 5), ma10 = ma(rows, 10), ma20 = ma(rows, 20), ma60 = ma(rows, 60)
  const above5 = ma5 != null && cur > ma5
  const above60 = ma60 != null && cur > ma60
  const ret = prevClose ? +(((cur - prevClose) / prevClose) * 100).toFixed(2) : null
  out.push({
    code: r.code, name: r.name, industry: r.industry, score: r.score, pick: r.pick, watch: r.watch, ok: true,
    prevClose, cur, d23, ma5, ma10, ma20, ma60,
    above5, above10: ma10 != null && cur > ma10, above20: ma20 != null && cur > ma20, above60,
    ret, // 真实 9-22收盘 → 9-23盘中
  })
  const done = out.length
  if (done % 20 === 0) console.log('win-rate', done, '/', list.length)
  await new Promise((r) => setTimeout(r, 220))
}

const valid = out.filter((x) => x.ok)
const hold = valid.filter((x) => x.above5)        // 持有健康（没破5日线）
const fail = valid.filter((x) => !x.above5)        // 跌破5日线（战法卖出）
const holdRate = valid.length ? +((hold.length / valid.length) * 100).toFixed(1) : null

const pv = valid.filter((x) => x.pick)
const pHold = pv.filter((x) => x.above5)
const pickRate = pv.length ? +((pHold.length / pv.length) * 100).toFixed(1) : null

const retAvg = valid.length ? +(valid.reduce((a, x) => a + (x.ret || 0), 0) / valid.length).toFixed(2) : null
const failRetAvg = fail.length ? +(fail.reduce((a, x) => a + (x.ret || 0), 0) / fail.length).toFixed(2) : null

// 板块维度
const secMap = {}
for (const x of valid) {
  if (!secMap[x.industry]) secMap[x.industry] = { name: x.industry, n: 0, hold: 0 }
  secMap[x.industry].n++
  if (x.above5) secMap[x.industry].hold++
}
const sectors = Object.values(secMap)
  .map((s) => ({ name: s.name, n: s.n, hold: s.hold, rate: +((s.hold / s.n) * 100).toFixed(1) }))
  .sort((a, b) => b.rate - a.rate || b.n - a.n)

const top = [...valid].sort((a, b) => (b.ret || 0) - (a.ret || 0)).slice(0, 5)
const worst = [...valid].sort((a, b) => (a.ret || 0) - (b.ret || 0)).slice(0, 5)

const wr = {
  criteria: '跌破5日线=失败；没跌破=持有健康(胜)',
  asOf: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
  total: list.length, valid: valid.length,
  holdCount: hold.length, failCount: fail.length, holdRate,
  pickTotal: pv.length, pickHold: pHold.length, pickRate,
  retAvg, failRetAvg,
  sectors, top, worst,
  detail: out,
}
fs.writeFileSync('./win-rate.json', JSON.stringify(wr, null, 2))
console.log('OK 持有健康率', holdRate + '%', '(', hold.length, '健康 /', fail.length, '跌破)', '| ★优先健康率', pickRate + '%', '| 真实均涨跌', retAvg + '%')
