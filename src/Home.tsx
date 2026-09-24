// Home.tsx — 大板块数据区 + 侧边分类菜单 + 卡片网格（高科动效）
import React, { useMemo } from 'react'
import { useItems, useQuotes, CATEGORIES, type NewsItem } from './api'
import { cn } from '@/lib/utils'
import {
  Header,
  QuoteTicker,
  StatBlock,
  CategoryNav,
  NewsCard,
  Pagination,
  ErrorBanner,
  CountUp,
} from './components'

const PAGE_SIZE = 18

export function Home({
  params,
  navigate,
}: {
  params: URLSearchParams
  navigate: (to: string) => void
}) {
  const { items, loading, error } = useItems()
  const quotes = useQuotes()
  const cat = params.get('cat') || ''
  const tag = params.get('tag') || ''
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1)

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of items) m[it.category] = (m[it.category] || 0) + 1
    return m
  }, [items])

  const topCat = useMemo(() => {
    let name = ''
    let n = -1
    for (const c of CATEGORIES) {
      const v = counts[c] || 0
      if (v > n) {
        n = v
        name = c
      }
    }
    return { name, count: n }
  }, [counts])

  const avgPct = useMemo(() => {
    if (!quotes.length) return 0
    return quotes.reduce((a, q) => a + q.pct, 0) / quotes.length
  }, [quotes])

  const filtered = useMemo(
    () =>
      items.filter((it: NewsItem) => {
        if (cat && it.category !== cat) return false
        if (tag && !it.tags.includes(tag)) return false
        return true
      }),
    [items, cat, tag],
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    const qs = next.toString()
    navigate(qs ? `/?${qs}` : '/')
  }

  if (error) {
    return (
      <>
        <Header active="home" onNavigate={navigate} />
        <QuoteTicker quotes={quotes} />
        <main className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-4">
          <ErrorBanner message={error} />
        </main>
      </>
    )
  }
  if (loading) {
    return (
      <>
        <Header active="home" onNavigate={navigate} />
        <QuoteTicker quotes={quotes} />
        <main className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-4">
          <div className="py-10 text-center text-body-sm text-muted-foreground">加载中…</div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header active="home" onNavigate={navigate} />
      <QuoteTicker />

      <main className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-5">
        {/* 大板块数据区 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatBlock
            label="聚合资讯"
            value={<CountUp value={items.length} />}
            sub="条 · 实时去重"
          />
          <StatBlock
            label="市场情绪"
            accent={avgPct >= 0 ? 'text-up' : 'text-down'}
            value={
              <>
                {avgPct >= 0 ? '+' : ''}
                <CountUp value={avgPct} decimals={2} suffix="%" />
              </>
            }
            sub={avgPct >= 0 ? '偏多 · 风险偏好回升' : '偏空 · 避险情绪占优'}
            sparkSeed="sentiment"
            sparkUp={avgPct >= 0}
          />
          <StatBlock
            label="最热板块"
            value={<span className="text-[34px]">{topCat.name || '—'}</span>}
            sub={`${topCat.count} 条在榜`}
          />
          <StatBlock
            label="实时指数"
            value={<CountUp value={quotes.length} />}
            sub="LIVE · 红涨绿跌"
            sparkSeed="idx"
            sparkUp
          />
        </section>

        {/* 今日市场信号 · 环境层（鳄鱼派阈值；演示模拟值） */}
        <MarketSignal />

        {/* 板块赛马（按 60 日线状态分类；演示模拟值） */}
        <SectorRace cats={CATEGORIES} counts={counts} />

        {/* 分类菜单 + 卡片网格 */}
        <div className="mt-6 flex flex-col gap-5 md:flex-row">
          <aside className="shrink-0 md:w-56 md:self-start md:sticky md:top-20">
            <div className="mb-2 text-caption-uppercase text-muted-foreground">分类布局</div>
            <CategoryNav
              cats={CATEGORIES}
              counts={counts}
              active={cat}
              onSelect={(c) => setParam('cat', c)}
            />
          </aside>

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-caption text-muted-foreground tabular-nums">
              <span>
                共 <b className="font-semibold text-foreground">{filtered.length}</b> 条
              </span>
              {cat && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight px-2.5 py-0.5 font-semibold text-highlight-foreground">
                  板块「{cat}」
                  <button
                    type="button"
                    onClick={() => setParam('cat', '')}
                    className="text-highlight-foreground/70 transition-colors hover:text-highlight-foreground"
                  >
                    ✕
                  </button>
                </span>
              )}
              {tag && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 font-semibold text-foreground">
                  标签「{tag}」
                  <button
                    type="button"
                    onClick={() => setParam('tag', '')}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>

            {pageItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted-foreground">
                <p className="text-body-sm">没有符合条件的条目</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pageItems.map((it, i) => (
                  <NewsCard
                    key={it.id}
                    item={it}
                    index={i}
                    onTag={(t) => setParam('tag', t)}
                    onOpen={(id) => navigate(`/items/${id}`)}
                  />
                ))}
              </div>
            )}

            <Pagination
              page={safePage}
              totalPages={totalPages}
              onPage={(p) => setParam('page', String(p))}
            />
          </div>
        </div>
      </main>
    </>
  )
}

/* ---------- 今日市场信号 · 环境层（鳄鱼派阈值；演示模拟值） ---------- */
function MarketSignal() {
  // 演示用模拟值；真实接入需涨停池 / 成交额 / 涨跌家数 / 主动买卖盘接口
  const cells = [
    { label: '涨停数量', value: '72 家', pass: true, rule: '震荡市 > 60 及格' },
    { label: '成交额', value: '1.92 万亿', pass: true, rule: '≥ 1.8 万亿温热' },
    { label: '上涨 : 下跌', value: '1 : 2.3', pass: false, rule: '比值 < 1 偏空' },
    { label: '主动性买盘', value: '+1.2%', pass: true, rule: '> 0 买方积极' },
  ]
  return (
    <section className="fx-card relative mt-5 overflow-hidden rounded-xl p-4">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-border" />
      <div className="flex items-center justify-between">
        <span className="text-title-sm font-semibold">今日市场信号 · 环境层</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
          模拟值
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cells.map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-background px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted-foreground">{c.label}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-caption font-semibold',
                  c.pass ? 'bg-up/10 text-up' : 'bg-down/10 text-down',
                )}
              >
                {c.pass ? '及格' : '不及格'}
              </span>
            </div>
            <div className="mt-1 font-mono text-title-md font-bold tabular-nums">{c.value}</div>
            <div className="mt-0.5 text-caption text-muted-foreground">{c.rule}</div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-caption text-muted-foreground">
        鳄鱼派：环境不及格 → 顶级防御是空仓；及格 → 短线可打游击。本卡为演示模拟数据。
      </p>
    </section>
  )
}

/* ---------- 板块赛马（按 60 日线状态分类；演示模拟值） ---------- */
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
function SectorRace({ cats, counts }: { cats: readonly string[]; counts: Record<string, number> }) {
  const rows = cats.map((c) => {
    const h = hashStr(c)
    const mod = h % 3
    const status = mod === 0 ? '头等马' : mod === 1 ? '黑马' : '观察'
    const strength = 38 + (h % 58) // 38~95 的展示强度
    return { name: c, status, strength, count: counts[c] || 0 }
  })
  const toneOf = (s: string) =>
    s === '头等马'
      ? 'bg-up/10 text-up'
      : s === '黑马'
        ? 'bg-primary/15 text-highlight-foreground'
        : 'bg-muted text-muted-foreground'
  return (
    <section className="fx-card relative mt-4 overflow-hidden rounded-xl p-4">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-border" />
      <div className="flex items-center justify-between">
        <span className="text-title-sm font-semibold">板块赛马 · 60 日线状态</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
          模拟值
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className="rounded-lg border border-border bg-background px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="truncate text-body-sm font-medium">{r.name}</span>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-caption font-semibold', toneOf(r.status))}>
                {r.status}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full',
                  r.status === '头等马'
                    ? 'bg-up'
                    : r.status === '黑马'
                      ? 'bg-primary'
                      : 'bg-muted-foreground/50',
                )}
                style={{ width: `${r.strength}%` }}
              />
            </div>
            <div className="mt-1 text-caption text-muted-foreground">{r.count} 条在榜</div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-caption text-muted-foreground">
        鳄鱼派：日 K 在 60 日线上方 = 头等马（上升趋势）；60 日线下但 OBV 上穿 = 黑马（资金先行）。本卡为演示模拟数据。
      </p>
    </section>
  )
}
