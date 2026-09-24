// api.ts — 类型定义、数据拉取、模拟行情、格式化
export interface NewsItem {
  id: string
  time: string
  source: string
  category: string
  heat: number
  title: string
  summary: string
  tags: string[]
  extraSources: string[]
  url?: string
}

export const CATEGORIES = ['A股', '港股', '美股', '央行', '外汇', '大宗', '债券', '加密', '宏观'] as const

export interface Quote {
  name: string
  value: string
  pct: number
}

// 模拟行情条（红涨绿跌），非新闻条目内容
export const QUOTES: Quote[] = [
  { name: '上证', value: '3128.45', pct: 1.52 },
  { name: '深成', value: '9876.12', pct: 2.03 },
  { name: '恒生', value: '18123.70', pct: 1.18 },
  { name: '纳指', value: '17890.30', pct: -0.42 },
  { name: '黄金', value: '2405.60', pct: 1.65 },
  { name: '美元', value: '104.12', pct: -0.31 },
]

export function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function fetchItems(): Promise<NewsItem[]> {
  const res = await fetch('/data/items.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`数据请求失败（HTTP ${res.status}），未找到 /data/items.json`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('数据格式异常：items.json 应为数组')
  return data as NewsItem[]
}

export async function fetchQuotes(): Promise<Quote[]> {
  const res = await fetch('/data/quotes.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`行情请求失败（HTTP ${res.status}）`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('行情格式异常：quotes.json 应为数组')
  return data as Quote[]
}

import { useEffect, useState } from 'react'

export function useItems() {
  const [state, setState] = useState<{
    items: NewsItem[]
    loading: boolean
    error: string | null
  }>({ items: [], loading: true, error: null })

  useEffect(() => {
    let alive = true
    fetchItems()
      .then((items) => {
        if (alive) setState({ items, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (alive) {
          const msg = e instanceof Error ? e.message : String(e)
          setState({ items: [], loading: false, error: msg })
        }
      })
    return () => {
      alive = false
    }
  }, [])

  return state
}

export function useQuotes(): Quote[] {
  const [quotes, setQuotes] = useState<Quote[]>(QUOTES)
  useEffect(() => {
    let alive = true
    fetchQuotes()
      .then((q) => {
        if (alive && q.length) setQuotes(q)
      })
      .catch(() => {
        /* 失败则保持 QUOTES 兜底 */
      })
    return () => {
      alive = false
    }
  }, [])
  return quotes
}
