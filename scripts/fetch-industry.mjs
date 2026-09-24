// 独立抓取 136 只可买标的的行业板块(f127)，带重试+低并发+退避，存 industry-map.json
import fs from 'node:fs'

const DIR = 'E:/AI Work/Financial Info'
const watch = JSON.parse(fs.readFileSync(DIR + '/watch48-result.json', 'utf8'))
const market = JSON.parse(fs.readFileSync(DIR + '/market459-result.json', 'utf8'))
const m = new Map()
for (const r of (watch.buy || [])) m.set(r.code, true)
for (const r of (market.buyable || [])) m.set(r.code, true)
const codes = [...m.keys()]
console.log('need industry for', codes.length)

const secid = (c) => { const x = c.slice(0, 2); const n = c.slice(2); return (x === 'sh' ? '1' : '0') + '.' + n }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getInd(code, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const url = `https://push2.eastmoney.com/api/qt/stock/get?ut=fa5fd1943c7b386f172d6893dbfba10b&invt=2&secid=${secid(code)}&fields=f127&_=${Date.now()}`
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 10000)
      const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, 'Referer': 'https://quote.eastmoney.com/' } })
      clearTimeout(t)
      const j = await res.json()
      const ind = j?.data?.f127
      if (ind) return ind
    } catch (e) { /* retry */ }
    await sleep(400 + Math.random() * 500)
  }
  return null
}

const map = {}
const CONC = 4
for (let i = 0; i < codes.length; i += CONC) {
  const batch = codes.slice(i, i + CONC)
  const res = await Promise.all(batch.map((c) => getInd(c)))
  batch.forEach((c, k) => { map[c] = res[k] || '其他' })
  console.log('progress', Math.min(i + CONC, codes.length), '/', codes.length, 'last:', batch[batch.length - 1], '=>', map[batch[batch.length - 1]])
  await sleep(250)
}
fs.writeFileSync(DIR + '/industry-map.json', JSON.stringify(map, null, 0))
const uniq = [...new Set(Object.values(map))]
console.log('DONE sectors:', uniq.length, '| 其他数量:', Object.values(map).filter((v) => v === '其他').length)
