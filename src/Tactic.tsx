// Tactic.tsx — 5日战法 · 统计优先版
// 结构：结论卡（4 KPI + 变动一行）→ 板块统计表 → 明细表（瘦列，默认★优先，行展开看全部）
// 数据源：/data/rank-data.json + /data/win-rate.json（构建期打包）
// 原则：红涨绿跌 · 已暴涨高风险票隔离不计入 · 数据非最新时明确提示
import React, { useEffect, useMemo, useState } from 'react'
import { Header, CountUp, CONTAINER } from './components'
import { cn } from '@/lib/utils'

const MAIN = 'mx-auto w-full max-w-[1200px] px-5 pb-16 pt-5'
const NUM = 'font-mono tabular-nums'

interface RankRow {
  code: string
  name: string
  price: number
  ytd: number | null
  chg?: number | null
  ma5?: number | null
  ma60?: number | null
  above5: boolean
  diff5: number | null
  topHorse: boolean
  bullish: boolean
  obvUp: boolean
  distHigh: number | null
  gain: number | null
  gainLabel: string
  industry: string
  score: number
  ext: number | null
  risk: string
  riskLabel: string
  pick: boolean
  watch: boolean
  volRatio: number | null
  volOut?: boolean
  prime?: boolean
  chase?: boolean
}
interface RankData {
  generated: string
  total: number
  ranked: RankRow[]
  primeChanges?: {
    date: string
    prevDate: string
    added: { code: string; name: string }[]
    removed: { code: string; name: string; reason: string }[]
  } | null
}
interface SectorStat {
  name: string
  n: number
  hold: number
  rate: number
}
interface WinRate {
  asOf: string
  valid: number
  holdCount: number
  failCount: number
  holdRate: number | null
  pickTotal: number
  pickHold: number
  pickRate: number | null
  retAvg: number | null
  failRetAvg: number | null
  sectors: SectorStat[]
}
interface Backtest {
  generated: string
  universe: number
  stocksFetched: number
  totalSignals: number
  sampled: number
  winRate: number | null
  avgRet: number | null
  medRet: number | null
  avgHold: number | null
  buckets: { label: string; n: number }[]
  best: { name: string; date: string; ret: number; hold: number } | null
  worst: { name: string; date: string; ret: number; hold: number } | null
  note: string
}

// ── 交易日历（前端轻量版，与 scripts/update.mjs 同步维护） ──
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-02',
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-04-06',
  '2026-05-01', '2026-05-04', '2026-05-05',
  '2026-06-19',
  '2026-09-25',
  '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
])
const pad = (n: number) => String(n).padStart(2, '0')
function beijingToday(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10)
}
function isTradingDay(dateStr: string): boolean {
  const w = new Date(dateStr + 'T12:00:00+08:00').getUTCDay()
  if (w === 0 || w === 6) return false
  return !HOLIDAYS_2026.has(dateStr)
}
function lastTradingDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00+08:00')
  for (let i = 0; i < 30; i++) {
    const s = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    if (isTradingDay(s)) return s
    d.setUTCDate(d.getUTCDate() - 1)
  }
  return dateStr
}
function freshness(dataDate: string): { stale: boolean; lastTD: string } {
  const lastTD = lastTradingDay(beijingToday())
  return { stale: dataDate < lastTD, lastTD }
}

const pctColor = (v: number | null | undefined) =>
  v == null ? 'text-muted-foreground' : v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted-foreground'
const pctText = (v: number | null | undefined) =>
  v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`

export function Tactic({ navigate }: { navigate: (to: string) => void }) {
  const [rank, setRank] = useState<RankData | null>(null)
  const [wr, setWr] = useState<WinRate | null>(null)
  const [bt, setBt] = useState<Backtest | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pick' | 'prime' | 'all'>('pick')

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/data/rank-data.json', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`rank-data.json 请求失败（HTTP ${r.status}）`)
        return r.json() as Promise<RankData>
      }),
      fetch('/data/win-rate.json', { cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error(`win-rate.json 请求失败（HTTP ${r.status}）`)
        return r.json() as Promise<WinRate>
      }),
      // 回测文件可能尚未生成 → 静默降级
      fetch('/data/backtest.json', { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<Backtest>) : null))
        .catch(() => null),
    ])
      .then(([rk, w, b]) => {
        if (alive) {
          setRank(rk)
          setWr(w)
          setBt(b)
        }
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [])

  const all = useMemo(() => rank?.ranked || [], [rank])
  const rows = useMemo(() => {
    if (filter === 'pick') return all.filter((r) => r.pick)
    if (filter === 'prime') return all.filter((r) => r.prime)
    return all
  }, [all, filter])

  const stats = useMemo(() => {
    const above5 = all.filter((r) => r.above5)
    return {
      total: all.length,
      above5: above5.length,
      prime: all.filter((r) => r.prime).length,
      volOut: all.filter((r) => r.volOut).length,
      pick: all.filter((r) => r.pick).length,
    }
  }, [all])

  // 板块统计：中期持有池全量按板块聚合（这是「统计」主体）
  const sectorStats = useMemo(() => {
    const m = new Map<string, RankRow[]>()
    for (const r of all) {
      if (!m.has(r.industry)) m.set(r.industry, [])
      m.get(r.industry)!.push(r)
    }
    const rateMap = new Map<string, SectorStat>()
    for (const s of wr?.sectors || []) rateMap.set(s.name, s)
    return [...m.entries()]
      .map(([name, list]) => ({
        name,
        n: list.length,
        prime: list.filter((r) => r.prime).length,
        pick: list.filter((r) => r.pick).length,
        avgScore: list.reduce((a, r) => a + r.score, 0) / list.length,
        avgDiff5: list.reduce((a, r) => a + (r.diff5 ?? 0), 0) / list.length,
        avgChg: list.reduce((a, r) => a + (r.chg ?? 0), 0) / list.length,
        top: [...list].sort((a, b) => b.score - a.score)[0],
        health: rateMap.get(name)?.rate ?? null,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
  }, [all, wr])

  const dataDate = rank?.generated ? rank.generated.slice(0, 10).replace(/\//g, '-') : ''
  const fresh = dataDate ? freshness(dataDate) : null
  const changes = rank?.primeChanges

  if (error) {
    return (
      <>
        <Header active="tactic" onNavigate={navigate} />
        <main className={MAIN}>
          <div className="fx-card rounded-xl border-l-4 border-destructive p-4">
            <p className="text-title-sm font-semibold text-destructive">战法数据加载失败</p>
            <p className="mt-1 text-body-sm text-muted-foreground">{error}</p>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <Header active="tactic" onNavigate={navigate} />
      <main className={MAIN}>
        {/* 标题区（压缩） */}
        <div className="mb-4">
          <h1 className="text-title-lg font-bold">
            5日战法 · <span className="text-highlight-foreground">中期趋势持有</span>
          </h1>
          <p className="mt-1 text-caption text-muted-foreground">
            数据时点 {rank?.generated || '…'} · 已排除科创板/北证 · 暴涨高风险票已隔离
            {fresh &&
              (fresh.stale ? (
                <span className="ml-2 rounded-full bg-highlight px-2 py-0.5 font-semibold text-highlight-foreground">
                  未更新至 {fresh.lastTD}（收盘后 npm run update）
                </span>
              ) : (
                <span className="ml-2 rounded-full border border-border px-2 py-0.5">已更新至 {fresh.lastTD}</span>
              ))}
          </p>
        </div>

        {/* ① 结论卡：4 个关键数字 + 变动一行 */}
        {rank && (
          <section className="fx-card relative mb-4 overflow-hidden rounded-xl p-4">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-highlight" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="优质持有" value={stats.prime} sub={`中期持有池 ${stats.total} 只`} tone="up" plain />
              <Kpi label="★优先" value={stats.pick} sub="资金有限先看这档" plain />
              <Kpi
                label="持有健康率"
                value={wr?.holdRate ?? null}
                unit="%"
                sub={wr ? `${wr.holdCount}/${wr.valid} 未破5日线` : undefined}
                tone="up"
              />
              <Kpi
                label="高位放量剔除"
                value={stats.volOut}
                sub="出货嫌疑 · 暂不推荐"
                tone={stats.volOut > 0 ? 'down' : undefined}
                plain
              />
            </div>
            {changes && (changes.added.length > 0 || changes.removed.length > 0) && (
              <p className="mt-3 border-t border-border pt-2.5 text-body-sm">
                <span className="text-caption text-muted-foreground">
                  {changes.prevDate} → {changes.date}：
                </span>
                {changes.removed.length > 0 && (
                  <span className="text-destructive">
                    移出 {changes.removed.map((x) => `${x.name}（${x.reason}）`).join('、')}
                  </span>
                )}
                {changes.added.length > 0 && (
                  <span className={changes.removed.length > 0 ? 'text-up' : ''}>
                    {changes.removed.length > 0 ? '；' : ''}新进 {changes.added.map((x) => x.name).join('、')}
                  </span>
                )}
              </p>
            )}
          </section>
        )}

        {/* ② 板块统计表 */}
        {rank && (
          <section className="fx-card mb-4 overflow-hidden rounded-xl">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
              <span className="text-title-sm font-semibold">板块统计</span>
              <span className="text-caption text-muted-foreground">
                {sectorStats.length} 个板块 · 按平均强度排序 · 优质=该板块内优质持有只数
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border text-caption text-muted-foreground">
                    <th className="px-3 py-2 font-medium">板块</th>
                    <th className="px-3 py-2 text-right font-medium">只数</th>
                    <th className="px-3 py-2 text-right font-medium">优质</th>
                    <th className="px-3 py-2 text-right font-medium">★</th>
                    <th className="px-3 py-2 text-right font-medium">平均强度</th>
                    <th className="px-3 py-2 text-right font-medium">今日</th>
                    <th className="px-3 py-2 text-right font-medium">平均贴5线</th>
                    <th className="px-3 py-2 text-right font-medium">体检健康</th>
                    <th className="px-3 py-2 font-medium">最强个股</th>
                  </tr>
                </thead>
                <tbody>
                  {sectorStats.map((s) => (
                    <tr key={s.name} className="border-b border-border/50 transition-colors hover:bg-accent/40">
                      <td className="px-3 py-2 font-semibold">{s.name}</td>
                      <td className={cn('px-3 py-2 text-right', NUM)}>{s.n}</td>
                      <td className={cn('px-3 py-2 text-right', NUM, s.prime > 0 ? 'text-highlight-foreground font-semibold' : 'text-muted-foreground')}>
                        {s.prime}
                      </td>
                      <td className={cn('px-3 py-2 text-right', NUM, s.pick > 0 ? 'text-up font-semibold' : 'text-muted-foreground')}>
                        {s.pick}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-bold', NUM, s.avgScore >= 90 ? 'text-up' : 'text-foreground')}>
                        {s.avgScore.toFixed(0)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold', NUM, pctColor(s.avgChg))}>{pctText(s.avgChg)}</td>
                      <td className={cn('px-3 py-2 text-right', NUM, pctColor(s.avgDiff5))}>{pctText(s.avgDiff5)}</td>
                      <td className={cn('px-3 py-2 text-right', NUM, s.health == null ? 'text-muted-foreground' : s.health >= 90 ? 'text-up' : s.health >= 70 ? 'text-foreground' : 'text-down')}>
                        {s.health == null ? '—' : `${s.health}%`}
                      </td>
                      <td className="px-3 py-2 text-caption text-muted-foreground">
                        {s.top.name} <span className={NUM}>{s.top.score}分</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ③ 明细表：默认★优先，瘦列 */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card/60 p-1">
            {(
              [
                ['pick', `★优先（${stats.pick}）`],
                ['prime', `优质持有（${stats.prime}）`],
                ['all', `全部（${stats.total}）`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-nav-link transition-colors',
                  filter === id
                    ? 'bg-highlight font-semibold text-highlight-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-caption text-muted-foreground">点击行展开详情</span>
        </div>
        {!rank ? (
          <div className="fx-card rounded-xl p-8 text-center text-body-sm text-muted-foreground">战法数据加载中…</div>
        ) : (
          <StockTable rows={rows} />
        )}

        {/* ④ 回测 vs 实际统计 */}
        <section className="fx-card relative mb-4 mt-4 overflow-hidden rounded-xl p-4">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-title-sm font-semibold">
              5日线战法 · <span className="text-highlight-foreground">回测 vs 实际统计</span>
            </span>
            <span className="text-caption text-muted-foreground">
              同一口径：买入=站上60日线且MA60向上+收盘≥5日线 · 卖出=收盘跌破5日线
            </span>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {/* 回测（历史随机抽样） */}
            <div className="rounded-lg border border-border bg-background/60 p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">历史回测</span>
                <span className="text-caption text-muted-foreground">随机抽样 · 近一年日K</span>
              </div>
              {bt ? (
                <>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <MiniStat label="回测胜率" value={bt.winRate} unit="%" sub="盈利>0 占比" tone="up" />
                    <MiniStat label="平均收益" value={bt.avgRet} unit="%" sub={`中位 ${bt.medRet ?? '—'}%`} signed tone={(bt.avgRet ?? 0) >= 0 ? 'up' : 'down'} />
                    <MiniStat label="平均持有" value={bt.avgHold} unit=" 天" sub={`${bt.stocksFetched} 只 · ${bt.sampled} 笔信号`} />
                  </div>
                  {/* 收益分布 */}
                  <div className="mt-3 space-y-1">
                    <div className="text-caption text-muted-foreground">单笔收益分布（{bt.sampled} 笔）</div>
                    {bt.buckets.map((b) => {
                      const max = Math.max(...bt.buckets.map((x) => x.n), 1)
                      const pos = b.label.includes('+') || b.label.startsWith('>')
                      return (
                        <div key={b.label} className="flex items-center gap-2">
                          <span className="w-14 shrink-0 text-right text-caption text-muted-foreground">{b.label}</span>
                          <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-muted/40">
                            <div
                              className={cn('h-full rounded-sm', pos ? 'bg-up/70' : 'bg-down/60')}
                              style={{ width: `${(b.n / max) * 100}%` }}
                            />
                          </div>
                          <span className={cn('w-8 shrink-0 text-caption tabular-nums', b.n > 0 ? (pos ? 'text-up' : 'text-down') : 'text-muted-foreground')}>
                            {b.n}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-2 text-caption text-muted-foreground">
                    最好一笔 <span className="text-up font-semibold">{bt.best?.name} +{bt.best?.ret}%</span>（{bt.best?.date} 进场，持 {bt.best?.hold} 天）
                     · 最差 <span className="text-down font-semibold">{bt.worst?.name} {bt.worst?.ret}%</span>（持 {bt.worst?.hold} 天）
                  </div>
                  <div className="mt-1.5 border-t border-border pt-1.5 text-caption text-muted-foreground/80">{bt.note}</div>
                </>
              ) : (
                <p className="mt-3 text-body-sm text-muted-foreground">回测数据生成中…（首次约 2 分钟）</p>
              )}
            </div>
            {/* 实际统计（当前组合） */}
            <div className="rounded-lg border border-border bg-background/60 p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">实际统计 · 当前组合</span>
                <span className="text-caption text-muted-foreground">{wr ? `体检 ${wr.asOf}` : ''}</span>
              </div>
              {wr ? (
                <>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <MiniStat label="持有健康率" value={wr.holdRate} unit="%" sub={`${wr.holdCount}/${wr.valid} 未破5日线`} tone="up" />
                    <MiniStat label="★优先健康率" value={wr.pickRate} unit="%" sub={`${wr.pickHold}/${wr.pickTotal} 健康`} tone="up" />
                    <MiniStat label="区间真实均涨跌" value={wr.retAvg} unit="%" sub="9-22收盘 → 今" signed tone={(wr.retAvg ?? 0) >= 0 ? 'up' : 'down'} />
                  </div>
                  <div className="mt-3 space-y-1.5 text-body-sm text-foreground/80">
                    <p>
                      <b>口径</b>：对当前符合战法的 {wr.valid} 只中期持有票做体检，<b>收盘跌破5日线 = 失败</b>，没跌破 = 持有健康；破线的 {wr.failCount} 只平均 {pctText(wr.failRetAvg)}。
                    </p>
                    <p className="text-caption text-muted-foreground">
                      回测衡量战法的长期历史期望，实际统计衡量当前提名组合的持有健康度——两者口径一致（破5日线离场），可直接对照。
                    </p>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-body-sm text-muted-foreground">体检数据加载中…</p>
              )}
            </div>
          </div>
        </section>

        {/* ⑤ 说明（压缩） */}
        <section className="fx-card mt-4 rounded-xl p-4 text-body-sm text-foreground/80">
          <p><b>优质持有</b> = 站上5日线 + 有上涨空间/刚突破（距前高 ≤+10%）+ 量能健康（高位放量≥1.8倍且已拉远的剔除）；<b>★优先</b> = 优质之上再卡强度≥80、离60线&lt;55%、贴5线≥3%。</p>
          <p className="mt-1.5 text-caption text-muted-foreground">
            风险档：适合中期（离60线&lt;40%）→ 偏高·慎（40–60%）→ 已暴涨·高风险（&gt;60%，隔离不计入）。离 60 日线 &gt;60% 的超买票（如闽东电力 -10% 跳空案例）不做推荐——「趋势还在」不等于「能买」。
            <br />
            基于公开量化数据，样本有限，不构成投资建议。
          </p>
        </section>
      </main>
    </>
  )
}

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
  signed,
  plain,
}: {
  label: string
  value: number | null
  unit?: string
  sub?: string
  tone?: 'up' | 'down' | 'neutral'
  signed?: boolean
  plain?: boolean
}) {
  const color = tone === 'up'
    ? 'text-up'
    : tone === 'down'
      ? 'text-destructive'
      : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-2xl font-bold tabular-nums', NUM, color)}>
        {value == null ? '—' : (
          <>
            {signed && value > 0 ? '+' : ''}
            <CountUp value={value} decimals={plain ? 0 : 1} />
            {unit}
          </>
        )}
      </div>
      {sub && <div className="mt-0.5 text-caption text-muted-foreground">{sub}</div>}
    </div>
  )
}

function MiniStat({
  label,
  value,
  unit,
  sub,
  tone,
  signed,
}: {
  label: string
  value: number | null
  unit?: string
  sub?: string
  tone?: 'up' | 'down'
  signed?: boolean
}) {
  const color = tone === 'up' ? 'text-up' : tone === 'down' ? 'text-destructive' : 'text-foreground'
  return (
    <div className="rounded-lg border border-border bg-card/60 p-2.5">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 text-xl font-bold tabular-nums', NUM, color)}>
        {value == null ? '—' : (
          <>
            {signed && value > 0 ? '+' : ''}
            <CountUp value={value} decimals={unit === ' 天' ? 1 : 1} />
            {unit}
          </>
        )}
      </div>
      {sub && <div className="mt-0.5 text-caption text-muted-foreground">{sub}</div>}
    </div>
  )
}

function RiskBadge({ label }: { label: string }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-caption font-medium whitespace-nowrap',
        label === '适合中期'
          ? 'bg-highlight font-semibold text-highlight-foreground'
          : 'border border-border text-muted-foreground',
      )}
    >
      {label}
    </span>
  )
}

function Check({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium',
        ok ? 'bg-highlight/15 text-highlight-foreground' : 'bg-destructive/15 text-destructive',
      )}
    >
      {ok ? '✓' : '✗'} {label}
      {note && <span className="font-normal opacity-75">{note}</span>}
    </span>
  )
}

function StockTable({ rows }: { rows: RankRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <div className="fx-card overflow-x-auto rounded-xl">
      <table className="w-full min-w-[640px] text-left text-body-sm">
        <thead>
          <tr className="border-b border-border text-caption text-muted-foreground">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">名称</th>
            <th className="px-3 py-2 font-medium">板块</th>
            <th className="px-3 py-2 text-right font-medium">现价</th>
            <th className="px-3 py-2 text-right font-medium">今日</th>
            <th className="px-3 py-2 text-right font-medium">强度</th>
            <th className="px-3 py-2 font-medium">风险档</th>
            <th className="px-3 py-2 text-right font-medium">贴5线</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <React.Fragment key={r.code}>
              <tr
                onClick={() => setExpanded((v) => (v === r.code ? null : r.code))}
                className="cursor-pointer border-b border-border/50 transition-colors hover:bg-accent/40"
              >
                <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold">
                    {r.name}
                    {r.pick && <span className="ml-1 text-up">★</span>}
                    {r.watch && <span className="ml-1.5 rounded bg-primary/15 px-1 text-caption text-highlight-foreground">自选</span>}
                    {r.volOut && (
                      <span className="ml-1.5 whitespace-nowrap rounded bg-destructive/15 px-1 py-0.5 font-semibold text-destructive">
                        高位放量⚠{r.volRatio != null ? ` ${r.volRatio.toFixed(1)}x` : ''}
                      </span>
                    )}
                  </div>
                  <div className={cn('text-caption text-muted-foreground', NUM)}>{r.code}</div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.industry}</td>
                <td className={cn('px-3 py-2 text-right', NUM)}>{r.price?.toFixed(2)}</td>
                <td className={cn('px-3 py-2 text-right font-semibold', NUM, pctColor(r.chg))}>{pctText(r.chg)}</td>
                <td className={cn('px-3 py-2 text-right font-bold', NUM, r.score >= 90 ? 'text-up' : 'text-foreground')}>
                  {r.score}
                </td>
                <td className="px-3 py-2"><RiskBadge label={r.riskLabel} /></td>
                <td className={cn('px-3 py-2 text-right', NUM, pctColor(r.diff5))}>{pctText(r.diff5)}</td>
              </tr>
              {expanded === r.code && (
                <tr className="border-b border-border/50 bg-accent/20">
                  <td colSpan={8} className="px-4 py-3">
                    <div className="text-caption font-semibold text-muted-foreground">优质持有判定（点击行收起）</div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Check ok={r.above5} label="站上5日线" note={r.diff5 != null ? `贴5线${pctText(r.diff5)}` : undefined} />
                      <Check
                        ok={r.distHigh == null || r.distHigh <= 10}
                        label="有空间/刚突破"
                        note={r.distHigh != null ? `距前高${pctText(r.distHigh)}${r.distHigh < 0 ? '(仍在下方)' : '(已突破)'}` : undefined}
                      />
                      <Check
                        ok={!r.volOut}
                        label="量能健康"
                        note={r.volOut ? `高位放量 ${r.volRatio?.toFixed(1)}x` : r.volRatio != null ? `量比 ${r.volRatio.toFixed(1)}x` : undefined}
                      />
                      <Check ok={r.risk !== 'high'} label={r.riskLabel} note={r.ext != null ? `离60线${pctText(r.ext)}` : undefined} />
                      <Check ok={!/ST/.test(r.name)} label="非ST" />
                    </div>
                    <div className={cn('mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted-foreground', NUM)}>
                      <span>现价 {r.price?.toFixed(2)}</span>
                      <span>今日 {pctText(r.chg)}</span>
                      {r.ma5 != null && <span>MA5 {r.ma5.toFixed(2)}</span>}
                      {r.ma60 != null && <span>MA60 {r.ma60.toFixed(2)}</span>}
                      <span>年内 {pctText(r.ytd)}</span>
                      <span>强度 {r.score}</span>
                      <span>
                        {[r.topHorse && '头等马', r.bullish && '多头', r.obvUp && '资金↑'].filter(Boolean).join(' · ') || '无标记'}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                暂无标的
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
