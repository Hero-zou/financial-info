// backfill-chg.mjs — 给源数据补 chg（当日涨跌幅 = 现价/最新价 vs 前一交易日收盘）
// 回填目标：market459-result.json 的 buyable[]（watch48 自带 pct，无需回填）
// chg 与 volRatio 不同：不受盘中K线不完整影响（腾讯日K最后一根盘中即为实时价）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchChg(code) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,3,qfq`
  const j = await (await fetch(url, { signal: AbortSignal.timeout(15000) })).json()
  const node = j?.data?.[code]
  const rows = node?.qfqday || node?.day || []
  if (!Array.isArray(rows) || rows.length < 2) return null
  const last = parseFloat(rows[rows.length - 1][2])
  const prev = parseFloat(rows[rows.length - 2][2])
  if (!(last > 0 && prev > 0)) return null
  return +((last / prev - 1) * 100).toFixed(2)
}

const fp = path.join(DIR, 'market459-result.json')
const data = JSON.parse(fs.readFileSync(fp, 'utf8'))
const targets = (data.buyable || []).filter((r) => r && r.code && r.chg == null)
console.log(`待回填 ${targets.length} 只`)
let ok = 0, fail = 0
for (const r of targets) {
  try {
    r.chg = await fetchChg(r.code)
    if (r.chg != null) ok++; else fail++
  } catch (e) {
    r.chg = null; fail++
    process.stdout.write(`  ${r.code} ERR ${e.message}\n`)
  }
  await sleep(300)
}
fs.writeFileSync(fp, JSON.stringify(data, null, 2))
console.log(`成功 ${ok}，失败 ${fail}`)
