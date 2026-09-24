// watchlist.ts — 自选池：A 股代码归一化、localStorage 持久化、日 K 拉取与 5 日线计算
// 数据源：腾讯 gtimg 日 K 接口（经 Vite 代理 /api/gtimg/kline，绕开浏览器 CORS）
import { useEffect, useState } from 'react'

export type Market = 'sh' | 'sz' | 'bj'

export interface WatchStock {
  code: string // 归一化完整代码，如 sh600000
  digits: string // 6 位数字
  market: Market
  name?: string // 用户可选填的备注名
}

export interface WatchRow extends WatchStock {
  name: string
  price: number | null // 现价（实时）
  pct: number | null // 当日涨跌幅 %
  ma5: number | null // 5 日线
  ma10: number | null // 10 日线
  ma20: number | null // 20 日线
  ma60: number | null // 60 日线（鳄鱼派定方向）
  ma60Up: boolean | null // 60 日线是否向上（斜率）
  bullish: boolean | null // 多头排列 MA5>MA20>MA60
  topHorse: boolean | null // 头等马：站上 60 日线 且 60 日线向上
  darkHorse: boolean | null // 黑马：60 日线下 但 OBV 上穿其均线（资金先行）
  obv: number | null // 能量潮
  obvMa: number | null // OBV 的 20 日均线
  obvUp: boolean | null // OBV 是否在均线上（资金流入）
  prevHigh: number | null // 前高压力位（区间内上一根之前的最高价）
  diffPct: number | null // (现价 - MA5) / MA5 * 100
  above: boolean | null // 现价是否站上 5 日线
  ma5Turn: boolean | null // 5 日线是否拐头向上
  signal: 'up' | 'down' | null // 今日上穿 / 跌破
  loading: boolean
  error: string | null
}

const LS_KEY = 'finhot_watchlist'

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** 归一化 A 股代码：支持 600000 / sh600000 / SH600000，自动补市场前缀 */
export function normalizeA(codeRaw: string): WatchStock | null {
  const s = codeRaw.trim().toLowerCase()
  if (!s) return null
  const prefixed = s.match(/^(sh|sz|bj)(\d{6})$/)
  if (prefixed) {
    return { code: prefixed[1] + prefixed[2], digits: prefixed[2], market: prefixed[1] as Market }
  }
  const pure = s.match(/^(\d{6})$/)
  if (pure) {
    const n = pure[1]
    let market: Market = 'sh'
    if (/^(6|9)/.test(n)) market = 'sh' // 沪市（含 688 科创）
    else if (/^(0|2|3)/.test(n)) market = 'sz' // 深市（含 300 创业板）
    else if (/^(4|8)/.test(n)) market = 'bj' // 北交所
    return { code: market + n, digits: n, market }
  }
  return null
}

/** 解析粘贴文本：逗号/空格/换行/分号分隔；支持「600000」「sh600000 浦发银行」「600000,浦发银行」 */
export function parseWatchlistText(text: string): { stocks: WatchStock[]; bad: string[] } {
  const stocks: WatchStock[] = []
  const bad: string[] = []
  const seen = new Set<string>()
  for (const seg of text.split(/[\n\r,，;；]+/)) {
    const line = seg.trim()
    if (!line) continue
    const parts = line.split(/\s+/)
    const codePart = parts[0]
    const namePart = parts.slice(1).join(' ').trim()
    const st = normalizeA(codePart)
    if (!st) {
      bad.push(line)
      continue
    }
    if (seen.has(st.code)) continue
    seen.add(st.code)
    stocks.push({ ...st, name: namePart || undefined })
  }
  return { stocks, bad }
}

export function loadWatchlist(): WatchStock[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((x) => x && typeof x.code === 'string')
  } catch {
    return []
  }
}

function emit(list: WatchStock[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
  window.dispatchEvent(new Event('finhot-watchlist-change'))
}

export function saveWatchlist(list: WatchStock[]) {
  emit(list)
}

export function addStocks(incoming: WatchStock[]): WatchStock[] {
  const cur = loadWatchlist()
  const seen = new Set(cur.map((s) => s.code))
  const next = [...cur]
  for (const s of incoming) {
    if (seen.has(s.code)) continue
    seen.add(s.code)
    next.push(s)
  }
  emit(next)
  return next
}

export function removeStock(code: string): WatchStock[] {
  const next = loadWatchlist().filter((s) => s.code !== code)
  emit(next)
  return next
}

export function clearWatchlist(): WatchStock[] {
  emit([])
  return []
}

/** 拉取单只股票：日 K → 现价 / MA5 / 距 MA5% / 站上跌破 / 上穿下穿 */
export async function fetchKlineRow(stock: WatchStock): Promise<WatchRow> {
  const base: WatchRow = {
    ...stock,
    name: stock.name || stock.code,
    price: null,
    pct: null,
    ma5: null,
    ma10: null,
    ma20: null,
    ma60: null,
    ma60Up: null,
    bullish: null,
    topHorse: null,
    darkHorse: null,
    obv: null,
    obvMa: null,
    obvUp: null,
    prevHigh: null,
    diffPct: null,
    above: null,
    ma5Turn: null,
    signal: null,
    loading: false,
    error: null,
  }
  try {
    const url = `/api/gtimg/kline?param=${stock.code},day,,,80,qfq`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const j = await res.json()
    const node = j?.data?.[stock.code]
    if (!node) throw new Error('接口无该代码数据')
    const rows: unknown[] = node.qfqday || node.day || []
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('无 K 线数据')

    const rowArr = rows as string[][]
    const closes = rowArr.map((r) => parseFloat(r[2])).filter((n) => Number.isFinite(n))
    if (closes.length < 2) throw new Error('有效收盘价不足')

    // 最高价序列（r[3]），用于前高压力位；成交量序列（r[5]），用于 OBV
    const highs = rowArr.map((r) => parseFloat(r[3])).filter((n) => Number.isFinite(n))
    const vols = rowArr.map((r) => parseFloat(r[5])).filter((n) => Number.isFinite(n))

    const qt = node.qt?.[stock.code]
    const name: string = qt?.[1] || stock.name || stock.code
    const qtPrice = qt ? parseFloat(qt[3]) : NaN
    const qtPrev = qt ? parseFloat(qt[4]) : NaN
    const price = Number.isFinite(qtPrice) && qtPrice > 0 ? qtPrice : closes[closes.length - 1]
    const prevClose = Number.isFinite(qtPrev) && qtPrev > 0 ? qtPrev : closes[closes.length - 2]
    const pct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : null

    const lastDate = String(rowArr[rowArr.length - 1][0] || '').replace(/-/g, '')
    const todayInKline = lastDate === todayStr()

    // 构造含「今日实时价」的序列，算出各均线
    const series = closes.slice()
    if (!todayInKline && Number.isFinite(price)) series.push(price)
    const ma5 = series.length >= 5 ? mean(series.slice(-5)) : null
    const ma10 = series.length >= 10 ? mean(series.slice(-10)) : null
    const ma20 = series.length >= 20 ? mean(series.slice(-20)) : null
    const ma60 = series.length >= 60 ? mean(series.slice(-60)) : null

    // 60 日线斜率（与 5 根之前对比）—— 鳄鱼派「方向」判据
    let ma60Up: boolean | null = null
    if (closes.length >= 65) {
      const mNow = mean(closes.slice(-60))
      const mPrev = mean(closes.slice(-65, -5))
      ma60Up = mNow > mPrev
    }

    // OBV（能量潮）：涨加跌减，资金强弱代理
    const obvArr: number[] = []
    let obv = 0
    for (let i = 0; i < closes.length; i++) {
      if (i > 0) {
        if (closes[i] > closes[i - 1]) obv += vols[i] || 0
        else if (closes[i] < closes[i - 1]) obv -= vols[i] || 0
      }
      obvArr.push(obv)
    }
    const obvVal = obvArr.length ? obvArr[obvArr.length - 1] : null
    const obvMa = obvArr.length >= 20 ? mean(obvArr.slice(-20)) : null
    const obvUp = obvVal != null && obvMa != null ? obvVal >= obvMa : null

    // 前高压力位：区间内「上一根之前」的最高价（排除最新的那一根）
    let prevHigh: number | null = null
    if (highs.length >= 2) {
      const prior = highs.slice(0, -1)
      prevHigh = prior.length ? Math.max(...prior) : null
    }

    // 多头排列 / 头等马 / 黑马
    let bullish: boolean | null = null
    if (ma5 != null && ma20 != null && ma60 != null) bullish = ma5 > ma20 && ma20 > ma60
    let topHorse: boolean | null = null
    if (price != null && ma60 != null && ma60Up != null) topHorse = price > ma60 && ma60Up
    let darkHorse: boolean | null = null
    if (topHorse != null && price != null && ma60 != null && obvUp != null) {
      darkHorse = !topHorse && price <= ma60 && obvUp
    }

    // 昨日 MA5 与昨收（用于判断今日是否发生上穿/跌破、5 日线拐头）
    let ma5Prev: number | null = null
    let prevPrice: number | null = null
    if (todayInKline) {
      ma5Prev = closes.length >= 6 ? mean(closes.slice(-6, -1)) : null
      prevPrice = closes.length >= 2 ? closes[closes.length - 2] : null
    } else {
      ma5Prev = closes.length >= 5 ? mean(closes.slice(-5)) : null
      prevPrice = closes[closes.length - 1] ?? null
    }

    const above = ma5 != null ? price >= ma5 : null
    const prevAbove = ma5Prev != null && prevPrice != null ? prevPrice >= ma5Prev : null
    let signal: 'up' | 'down' | null = null
    if (above != null && prevAbove != null) {
      if (!prevAbove && above) signal = 'up'
      else if (prevAbove && !above) signal = 'down'
    }
    const ma5Turn = ma5 != null && ma5Prev != null ? ma5 > ma5Prev : null
    const diffPct = ma5 != null && ma5 > 0 ? ((price - ma5) / ma5) * 100 : null

    return {
      ...base,
      name,
      price,
      pct,
      ma5,
      ma10,
      ma20,
      ma60,
      ma60Up,
      bullish,
      topHorse,
      darkHorse,
      obv: obvVal,
      obvMa,
      obvUp,
      prevHigh,
      diffPct,
      above,
      ma5Turn,
      signal,
      loading: false,
      error: null,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ...base, loading: false, error: msg }
  }
}

/** 订阅自选池变化（跨组件/跨页同步） */
export function useWatchlist(): WatchStock[] {
  const [list, setList] = useState<WatchStock[]>(() => loadWatchlist())
  useEffect(() => {
    const onChange = () => setList(loadWatchlist())
    window.addEventListener('finhot-watchlist-change', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('finhot-watchlist-change', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return list
}

/** 并发拉取全部自选股行情 */
export function useWatchRows(stocks: WatchStock[]): { rows: WatchRow[]; loading: boolean; refresh: () => void } {
  const key = stocks.map((s) => s.code).join(',')
  const [rows, setRows] = useState<WatchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!stocks.length) {
      setRows([])
      return
    }
    let alive = true
    setLoading(true)
    setRows(stocks.map((s) => ({ ...s, name: s.name || s.code, price: null, pct: null, ma5: null, ma10: null, ma20: null, ma60: null, ma60Up: null, bullish: null, topHorse: null, darkHorse: null, obv: null, obvMa: null, obvUp: null, prevHigh: null, diffPct: null, above: null, ma5Turn: null, signal: null, loading: true, error: null })))
    Promise.all(stocks.map((s) => fetchKlineRow(s))).then((res) => {
      if (!alive) return
      setRows(res)
      setLoading(false)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  return { rows, loading, refresh: () => setTick((t) => t + 1) }
}
