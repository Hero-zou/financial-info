// components.tsx — 高科动效组件层（ClickHouse 黑黄高科，红涨绿跌）
// 头部导航 / 滚动行情条 / 大板块数据卡 / 分类菜单 / 卡片网格 / 迷你走势线 / 数字滚动
import React, { useEffect, useState, useMemo, type ReactNode } from 'react'
import { CATEGORIES, type NewsItem, type Quote, QUOTES, formatTime } from './api'
import { cn } from '@/lib/utils'
import { useTheme } from './theme-provider'

/** 站点主容器宽度：大板块布局，放宽至 1200px 版心 */
export const CONTAINER = 'mx-auto w-full max-w-[1200px] px-5'

function ThemeToggle() {
  const { toggle } = useTheme()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="切换明暗主题"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="dark:hidden">🌙</span>
      <span className="hidden dark:inline">☀️</span>
    </button>
  )
}

export function Header({
  active = 'home',
  onNavigate,
}: {
  active?: 'home' | 'watchlist' | 'tactic'
  onNavigate?: (to: string) => void
}) {
  const NavBtn = ({
    to,
    id,
    label,
  }: {
    to: string
    id: 'home' | 'watchlist' | 'tactic'
    label: string
  }) => (
    <button
      type="button"
      onClick={() => onNavigate?.(to)}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-nav-link transition-colors',
        active === id
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {label}
    </button>
  )

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className={cn(CONTAINER, 'flex h-16 items-center justify-between gap-3')}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="logo-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary font-extrabold leading-none text-primary-foreground">
            FI
          </span>
          <span className="logo-word">
            <span className="logo-fin">Financial</span>
            <span className="logo-info">Info</span>
          </span>
          <span className="hidden rounded-full bg-highlight px-2.5 py-[3px] text-caption font-semibold text-highlight-foreground sm:inline">
            实时聚合
          </span>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
            <NavBtn to="/" id="home" label="热讯" />
            <NavBtn to="/watchlist" id="watchlist" label="自选池" />
            <NavBtn to="/tactic" id="tactic" label="5日战法" />
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

export function QuoteTicker({ quotes = QUOTES }: { quotes?: Quote[] }) {
  const items = useMemo(() => [...quotes, ...quotes], [quotes])
  return (
    <div className="border-b border-border bg-card/50 backdrop-blur">
      <div className={cn(CONTAINER, 'flex items-center gap-3 py-2.5')}>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-caption font-semibold text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary fx-pulse" />
          实时
        </span>
        <div className="relative flex-1 overflow-hidden">
          <div className="fx-marquee flex w-max gap-7">
            {items.map((q, i) => (
              <div
                key={i}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap text-body-sm"
              >
                <span className="text-muted-foreground">{q.name}</span>
                <span className="font-mono tabular-nums text-foreground">{q.value}</span>
                <span
                  className={cn(
                    'font-mono font-semibold tabular-nums',
                    q.pct >= 0 ? 'text-up' : 'text-down',
                  )}
                >
                  {q.pct >= 0 ? '▲' : '▼'}
                  {Math.abs(q.pct).toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- 数字滚动（count-up） ---------- */
function useCountUp(target: number, dur = 900) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || !Number.isFinite(target)) {
      setV(target)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const e = 1 - Math.pow(1 - t, 3)
      setV(target * e)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, dur])
  return v
}

export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
}: {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
}) {
  const v = useCountUp(value)
  return (
    <>
      {prefix}
      {v.toFixed(decimals)}
      {suffix}
    </>
  )
}

/* ---------- 迷你走势线（确定性合成，仅作视觉装饰） ---------- */
function seededSeries(seed: string, up: boolean, n = 18): number[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0
  }
  const out: number[] = []
  let val = 50
  for (let i = 0; i < n; i++) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0
    const r = ((h >> 8) & 0xff) / 255 - 0.5
    val += (up ? 1 : -1) * Math.abs(r) * 20 + r * 9
    val = Math.max(8, Math.min(92, val))
    out.push(val)
  }
  out[out.length - 1] = up
    ? Math.min(92, out[out.length - 1] + 16)
    : Math.max(8, out[out.length - 1] - 16)
  return out
}

export function Sparkline({
  seed,
  up,
  className,
}: {
  seed: string
  up: boolean
  className?: string
}) {
  const pts = useMemo(() => seededSeries(seed, up), [seed, up])
  const w = 100
  const hgt = 32
  const max = Math.max(...pts)
  const min = Math.min(...pts)
  const range = max - min || 1
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w
      const y = hgt - ((p - min) / range) * (hgt - 4) - 2
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  const color = up ? 'var(--up)' : 'var(--down)'
  return (
    <svg
      viewBox={`0 0 ${w} ${hgt}`}
      className={className}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ---------- 大板块数据卡 ---------- */
export function StatBlock({
  label,
  value,
  sub,
  accent,
  sparkSeed,
  sparkUp,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
  sparkSeed?: string
  sparkUp?: boolean
}) {
  return (
    <div className="fx-card group relative overflow-hidden rounded-xl p-4">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-border transition-colors group-hover:bg-primary" />
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {sparkSeed && (
          <Sparkline seed={sparkSeed} up={!!sparkUp} className="h-7 w-16 opacity-80" />
        )}
      </div>
      <div
        className={cn(
          'mt-2 font-mono text-[40px] font-bold leading-none tabular-nums',
          accent || 'text-foreground',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-caption text-muted-foreground">{sub}</div>}
    </div>
  )
}

/* ---------- 分类布局菜单 ---------- */
export function CategoryNav({
  cats,
  counts,
  active,
  onSelect,
}: {
  cats: readonly string[]
  counts: Record<string, number>
  active: string
  onSelect: (c: string) => void
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const rows = [
    { key: '', label: '全部', count: total },
    ...cats.map((c) => ({ key: c, label: c, count: counts[c] || 0 })),
  ]
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
      {rows.map((r) => {
        const isActive = active === r.key
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onSelect(r.key)}
            className={cn(
              'group flex shrink-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-body-sm transition-colors md:border-l-2 md:border-l-transparent',
              isActive
                ? 'border-primary bg-highlight font-semibold text-highlight-foreground md:border-l-primary'
                : 'text-foreground hover:border-border-hover hover:bg-accent',
            )}
          >
            <span className="whitespace-nowrap">{r.label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-caption font-semibold tabular-nums',
                isActive
                  ? 'bg-primary/15 text-highlight-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {r.count}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/* ---------- 新闻卡片（卡片网格 + 错落入场） ---------- */
export function NewsCard({
  item,
  onTag,
  onOpen,
  index = 0,
}: {
  item: NewsItem
  onTag: (t: string) => void
  onOpen: (id: string) => void
  index?: number
}) {
  return (
    <article
      onClick={() => onOpen(item.id)}
      style={{ animationDelay: `${Math.min(index, 14) * 55}ms` }}
      className="fx-card fx-fade-up group relative flex cursor-pointer flex-col overflow-hidden rounded-xl p-4"
    >
      <span className="absolute inset-x-0 top-0 h-0.5 bg-border transition-colors group-hover:bg-primary" />
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
        <span className="rounded-full bg-highlight px-2 py-0.5 font-semibold text-highlight-foreground">
          {item.category}
        </span>
        <span className="tabular-nums">{formatTime(item.time)}</span>
        <span>{item.source}</span>
        <span className="ml-auto font-semibold tabular-nums text-foreground">
          热度 {item.heat}
        </span>
      </div>
      <h2 className="mb-1.5 text-title-md font-bold leading-snug transition-colors group-hover:text-info">
        {item.title}
      </h2>
      <p className="mb-3 line-clamp-3 flex-1 text-body-sm text-foreground/70">{item.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {item.tags.slice(0, 4).map((t) => (
          <button
            key={t}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onTag(t)
            }}
            className="cursor-pointer rounded-full border border-border bg-muted px-2 py-0.5 text-caption text-muted-foreground transition-colors hover:border-primary hover:bg-highlight hover:text-highlight-foreground"
          >
            {t}
          </button>
        ))}
      </div>
    </article>
  )
}

export function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  if (totalPages <= 1) return null
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
  return (
    <nav className="mt-6 flex flex-wrap justify-center gap-1.5" aria-label="分页">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-body-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        上一页
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPage(p)}
          className={cn(
            'min-w-9 rounded-lg border px-3 py-1.5 text-body-sm tabular-nums transition-colors',
            p === page
              ? 'border-primary bg-primary font-semibold text-primary-foreground'
              : 'border-border bg-card hover:border-border-hover hover:bg-accent',
          )}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="rounded-lg border border-border bg-card px-3 py-1.5 text-body-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        下一页
      </button>
    </nav>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="my-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
      role="alert"
    >
      <strong className="text-title-sm text-destructive">⚠️ 数据加载失败</strong>
      <p className="my-2 font-mono text-code text-destructive">{message}</p>
      <p className="text-body-sm text-foreground/75">
        请确认已运行{' '}
        <code className="rounded-sm bg-destructive/10 px-1 font-mono text-caption">
          node scripts/fetch-real.mjs
        </code>{' '}
        （或{' '}
        <code className="rounded-sm bg-destructive/10 px-1 font-mono text-caption">npm run data:mock</code>
        ）生成{' '}
        <code className="rounded-sm bg-destructive/10 px-1 font-mono text-caption">
          public/data/items.json
        </code>
        ，并重新启动站点。
      </p>
    </div>
  )
}
