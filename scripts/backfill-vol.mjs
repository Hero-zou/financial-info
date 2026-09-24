// backfill-vol.mjs — 给源数据补 volRatio（量比 = 最近完整K线量 / 前5日均量）
// 回填目标：market459-result.json 的 buyable[] + watch48-result.json 的 buy[]
// （build-rank.mjs 从这两个源重建 rank-data.json，rank-data 本身只是输出）
// 盘中（北京时间<15:00）当日K线量不完整 → 剔除最后一根，用最近完整K线
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function intradayNow() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  return { today: s.slice(0, 10), intraday: s.slice(11, 16) < '15:00' }
}

async function fetchVolRatio(code) {
  const { today, intraday } = intradayNow()
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,12,qfq`
  const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()
  const node = j?.data?.[code]
  const rows = node?.qfqday || node?.day || []
  if (!Array.isArray(rows) || rows.length < 6) return null
  let bars = rows
  if (intraday && String(rows[rows.length - 1][0]) === today) bars = rows.slice(0, -1)
  if (bars.length < 6) return null
  const vols = bars.map((r) => parseFloat(r[5]))
  const prev5 = vols.slice(-6, -1)
  const mean5 = prev5.reduce((a, b) => a + b, 0) / prev5.length
  if (!(mean5 > 0)) return null
  return +(vols[vols.length - 1] / mean5).toFixed(2)
}

async function backfill(file, arrays) {
  const fp = path.join(DIR, file)
  let data
  try { data = JSON.parse(fs.readFileSync(fp, 'utf8')) } catch { return }
  const items = arrays.flatMap((k) => data[k] || [])
  const targets = items.filter((r) => r && r.code)
  console.log(`${file}: 待回填 ${targets.length} 只`)
  let ok = 0, fail = 0
  for (const r of targets) {
    if (r.volRatio != null) { ok++; continue } // 已有则跳过
    try {
      r.volRatio = await fetchVolRatio(r.code)
      if (r.volRatio != null) ok++; else fail++
    } catch (e) {
      r.volRatio = null; fail++
      process.stdout.write(`  ${r.code} ERR ${e.message}\n`)
    }
    await sleep(300)
  }
  fs.writeFileSync(fp, JSON.stringify(data, null, 2))
  console.log(`${file}: 成功 ${ok}，失败 ${fail}`)
}

await backfill('market459-result.json', ['buyable'])
await backfill('watch48-result.json', ['buy'])
console.log('回填完成')
