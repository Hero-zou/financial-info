// Watchlist.tsx — 自选池模块（按「鳄鱼派」战法：60日线定方向 + 多头排列 + OBV黑马）
import React, { useEffect, useState } from 'react'
import { Header, CountUp } from './components'
import { cn } from '@/lib/utils'
import {
  addStocks,
  clearWatchlist,
  parseWatchlistText,
  removeStock,
  useWatchlist,
  useWatchRows,
  type WatchRow,
} from './watchlist-data'

const MAIN = 'mx-auto w-full max-w-[1200px] px-5 pb-16 pt-5'

const BTN_PRIMARY =
  'cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-button font-semibold text-primary-foreground transition-colors hover:bg-primary-hover'
const BTN_SECONDARY =
  'cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-button text-foreground transition-colors hover:border-border-hover hover:bg-accent'
const NUM = 'font-mono tabular-nums'

const SAMPLE = `600000 浦发银行
000001 平安银行
600519 贵州茅台
300750 宁德时代
601318 中国平安`

function fmtPrice(n: number | null): string {
  return n == null ? '—' : n.toFixed(2)
}
function fmtPct(n: number | null): string {
  if (n == null) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
function signClass(n: number | null): string {
  if (n == null) return 'text-muted-foreground'
  return n >= 0 ? 'text-up' : 'text-down'
}

type Tone = 'up' | 'down' | 'primary' | 'muted'
function rateTone(row: WatchRow): { label: string; tone: Tone } {
  if (row.bullish) return { label: '多头排列', tone: 'up' }
  if (row.topHorse) return { label: '头等马', tone: 'up' }
  if (row.darkHorse) return { label: '黑马·资金先行', tone: 'primary' }
  return { label: '观望', tone: 'muted' }
}
const TONE_CLS: Record<Tone, string> = {
  up: 'bg-up/10 text-up',
  down: 'bg-down/10 text-down',
  primary: 'bg-primary/15 text-highlight-foreground',
  muted: 'bg-muted text-muted-foreground',
}

/** 单只均线小格：现价在其上方标红（多），下方标绿（空） */
function MaCell({ label, ma, price }: { label: string; ma: number | null; price: number | null }) {
  const tone = ma == null || price == null ? 'text-muted-foreground' : price >= ma ? 'text-up' : 'text-down'
  return (
    <div className="rounded-lg border border-border bg-background px-2 py-1.5">
      <div className="text-caption text-muted-foreground">{label}</div>
      <div className={cn('text-body-sm font-semibold', NUM, tone)}>{fmtPrice(ma)}</div>
    </div>
  )
}

export function Watchlist({ navigate }: { navigate: (to: string) => void }) {
  const list = useWatchlist()
  const { rows, loading, refresh } = useWatchRows(list)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [updated, setUpdated] = useState('')
  const [showMethod, setShowMethod] = useState(false)

  useEffect(() => {
    if (!loading && rows.length) {
      const d = new Date()
      const p = (x: number) => String(x).padStart(2, '0')
      setUpdated(`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`)
    }
  }, [loading, rows])

  const importText = (t: string) => {
    const { stocks, bad } = parseWatchlistText(t)
    if (!stocks.length && !bad.length) {
      setMsg('没有可识别的股票代码')
      return
    }
    if (stocks.length) addStocks(stocks)
    setMsg(
      bad.length
        ? `已导入 ${stocks.length} 只；以下 ${bad.length} 行无法识别已跳过：${bad.slice(0, 5).join('、')}`
        : `已导入 ${stocks.length} 只`,
    )
    setText('')
  }

  const ready = rows.filter((r) => !r.loading && !r.error)
  // 行动三段分类
  const buyRows = ready.filter((r) => r.topHorse === true && r.above === true) // 可买入持有
  const watchRows = ready.filter(
    (r) => (r.topHorse === true && r.above !== true) || r.darkHorse === true,
  ) // 观察中（回踩等待 / 黑马候选）
  const removeRows = ready.filter(
    (r) =>
      !(
        (r.topHorse === true && r.above === true) ||
        (r.topHorse === true && r.above !== true) ||
        r.darkHorse === true
      ),
  ) // 建议移除（未达战法 / 资金弱）
  const topHorseN = ready.filter((r) => r.topHorse === true).length
  const bullishN = ready.filter((r) => r.bullish === true).length
  const darkHorseN = ready.filter((r) => r.darkHorse === true).length

  const removeMany = () => {
    removeRows.forEach((r) => removeStock(r.code))
    setMsg(`已移除 ${removeRows.length} 只「建议移除」标的`)
  }

  const ChipList = ({ rows, tone }: { rows: WatchRow[]; tone: 'up' | 'muted' }) => (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {rows.length === 0 && <span className="text-caption text-muted-foreground">暂无</span>}
      {rows.map((r) => (
        <span
          key={r.code}
          className={
            tone === 'up'
              ? 'rounded-full border border-up/30 bg-up/10 px-2 py-0.5 text-caption font-medium text-up'
              : 'rounded-full border border-border bg-card px-2 py-0.5 text-caption text-muted-foreground'
          }
        >
          {r.name}
        </span>
      ))}
    </div>
  )

  return (
    <>
      <Header active="watchlist" onNavigate={navigate} />
      <main className={MAIN}>
        <div className="mb-4">
          <h1 className="text-title-lg font-bold">自选池 · 鳄鱼战法监控</h1>
          <p className="mt-1.5 text-body-sm text-muted-foreground">
            按「像鳄鱼一样思考」体系分析：<b className="text-foreground">60 日线定方向</b>（头等马）、
            <b className="text-foreground">5/20/60 多头排列</b>为主升、<b className="text-foreground">OBV 定资金强弱</b>（黑马）、5 日线只做节奏。数据取自实时日 K。
          </p>
        </div>

        {/* 战法说明卡（可展开） */}
        <section className="fx-card relative mb-5 overflow-hidden rounded-xl p-4">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-border" />
          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-title-sm font-semibold">鳄鱼战法 · 三层框架</span>
            <span className="text-caption text-muted-foreground">{showMethod ? '收起 ▲' : '展开 ▼'}</span>
          </button>
          <div className="mt-2.5 flex flex-wrap gap-2 text-caption">
            <span className="rounded-full bg-highlight px-2.5 py-0.5 font-semibold text-highlight-foreground">
              环境层：涨停数达标 + 主动买盘为正
            </span>
            <span className="rounded-full bg-highlight px-2.5 py-0.5 font-semibold text-highlight-foreground">
              板块层：站上 60 日线 = 头等马
            </span>
            <span className="rounded-full bg-highlight px-2.5 py-0.5 font-semibold text-highlight-foreground">
              个股层：多头排列 + 回踩 5 日线
            </span>
          </div>
          {showMethod && (
            <ul className="mt-3 space-y-1.5 text-body-sm text-foreground/80">
              <li>· <b>头等马</b>：收盘价 &gt; 60 日线 且 60 日线向上（上升趋势，机构加仓触发位）。</li>
              <li>· <b>多头排列</b>：MA5 &gt; MA20 &gt; MA60 且三线向上（主升阶段，可上 5 日线战法）。</li>
              <li>· <b>黑马</b>：在 60 日线下方，但 OBV 上穿其均线（资金先行、趋势未确认）。</li>
              <li>· <b>5 日线节奏</b>：回踩不破低吸；收盘跌破减仓；连续两日收不回清仓。5 日线朝下直接放弃。</li>
              <li className="text-muted-foreground">· 鳄鱼内核：多数时间空仓等待（Freeze），只在趋势明确、位置合适时出手（Feed）。非投资建议。</li>
            </ul>
          )}
        </section>

        {/* 行动三段统计：可买入持有 / 观察中 / 建议移除 */}
        <section className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* 可买入持有 */}
          <div className="fx-card relative overflow-hidden rounded-xl border-l-4 border-up p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-title-sm font-semibold text-up">可买入持有</span>
              <span className={cn('text-3xl font-bold tabular-nums', NUM, 'text-up')}>
                <CountUp value={buyRows.length} />
              </span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">头等马 + 站上 5 日线（回踩买点区）</p>
            <ChipList rows={buyRows} tone="up" />
          </div>

          {/* 观察中 */}
          <div className="fx-card relative overflow-hidden rounded-xl border-l-4 border-primary p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-title-sm font-semibold text-highlight-foreground">观察中</span>
              <span className={cn('text-3xl font-bold tabular-nums', NUM, 'text-highlight-foreground')}>
                <CountUp value={watchRows.length} />
              </span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">黑马候选 / 回踩等待（60 日线未起，不进场）</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {watchRows.length === 0 && <span className="text-caption text-muted-foreground">暂无</span>}
              {watchRows.slice(0, 8).map((r) => (
                <span
                  key={r.code}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-caption text-highlight-foreground"
                >
                  {r.name}
                </span>
              ))}
              {watchRows.length > 8 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-caption text-muted-foreground">
                  等 {watchRows.length - 8} 只 ↓
                </span>
              )}
            </div>
          </div>

          {/* 建议移除 */}
          <div className="fx-card relative overflow-hidden rounded-xl border-l-4 border-destructive p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-title-sm font-semibold text-destructive">建议移除</span>
              <span className={cn('text-3xl font-bold tabular-nums', NUM, 'text-destructive')}>
                <CountUp value={removeRows.length} />
              </span>
            </div>
            <p className="mt-1 text-caption text-muted-foreground">
              未达战法 · 资金弱（判定于 {updated || '—'}）
            </p>
            <ChipList rows={removeRows} tone="muted" />
            {removeRows.length > 0 && (
              <button
                type="button"
                onClick={removeMany}
                className="mt-3 w-full cursor-pointer rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-button font-semibold text-destructive transition-colors hover:bg-destructive/20"
              >
                一键移除这 {removeRows.length} 只
              </button>
            )}
          </div>
        </section>

        {/* 元信息条：标的数 + 战法细分 + 刷新时间 */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-caption text-muted-foreground tabular-nums">
          <span>
            自选标的 <b className="font-semibold text-foreground">{list.length}</b> 只 · 头等马{' '}
            <b className="font-semibold text-up">{topHorseN}</b> · 多头排列{' '}
            <b className="font-semibold text-up">{bullishN}</b> · 黑马{' '}
            <b className="font-semibold text-highlight-foreground">{darkHorseN}</b>
          </span>
          <span>最后刷新 {updated || '—'}</span>
        </div>

        {/* 导入区 */}
        <section className="fx-card relative mb-5 overflow-hidden rounded-xl p-4">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-border" />
          <label className="mb-2 block text-title-sm font-semibold">导入自选池</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={'每行一个，可用逗号/空格/换行分隔，支持「代码 名称」\n例如：600000 浦发银行\n000001 平安银行'}
            className="w-full resize-y rounded-lg border border-input bg-background p-2.5 font-mono text-code text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => importText(text)} className={BTN_PRIMARY}>
              导入
            </button>
            <button type="button" onClick={() => setText(SAMPLE)} className={BTN_SECONDARY}>
              填入示例
            </button>
            {list.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearWatchlist()
                  setMsg('已清空自选池')
                }}
                className={BTN_SECONDARY}
              >
                清空自选池
              </button>
            )}
            <span className="text-caption text-muted-foreground">仅支持 A 股（自动补 sh/sz 前缀）</span>
          </div>
          {msg && <p className="mt-2 text-caption text-muted-foreground">{msg}</p>}
        </section>

        {/* 工具条 */}
        {list.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-button text-foreground transition-colors hover:border-border-hover hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? '刷新中…' : '刷新数据'}
            </button>
          </div>
        )}

        {/* 卡片网格 */}
        {list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted-foreground">
            <p className="mb-3 text-body-sm">自选池是空的</p>
            <button type="button" onClick={() => importText(SAMPLE)} className={BTN_PRIMARY}>
              一键导入示例自选池
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r, i) => (
              <WatchRowCard key={r.code} row={r} index={i} onRemove={() => removeStock(r.code)} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}

const DEL_BTN =
  'cursor-pointer text-caption text-muted-foreground transition-colors hover:text-destructive'

/** 单只股票的鳄鱼战法分析卡 */
function WatchRowCard({ row, index, onRemove }: { row: WatchRow; index: number; onRemove: () => void }) {
  const rate = rateTone(row)
  const ma60Dir = row.ma60Up == null ? '—' : row.ma60Up ? '60日线 ↑' : '60日线 ↓'
  const obvBadge =
    row.darkHorse
      ? { label: '黑马·资金先行', tone: 'primary' as Tone }
      : row.obvUp == null
        ? { label: '—', tone: 'muted' as Tone }
        : row.obvUp
          ? { label: '资金流入', tone: 'up' as Tone }
          : { label: '资金流出', tone: 'down' as Tone }
  const rhythm =
    row.signal === 'up'
      ? { label: '↑ 弱转强', tone: 'up' as Tone }
      : row.signal === 'down'
        ? { label: '↓ 跌破', tone: 'down' as Tone }
        : row.above == null
          ? { label: '—', tone: 'muted' as Tone }
          : row.above
            ? row.ma5Turn
              ? { label: '站上·拐头↑', tone: 'up' as Tone }
              : { label: '站上 5日', tone: 'up' as Tone }
            : { label: '跌破 5日', tone: 'down' as Tone }

  if (row.loading) {
    return (
      <article className="fx-card flex flex-col rounded-xl p-4">
        <div className="font-medium">{row.name}</div>
        <div className="font-mono text-caption text-muted-foreground">{row.code}</div>
        <div className="mt-3 text-caption text-muted-foreground">加载中…</div>
      </article>
    )
  }
  if (row.error) {
    return (
      <article className="fx-card relative flex flex-col rounded-xl p-4">
        <span className="absolute inset-x-0 top-0 h-0.5 bg-destructive/50" />
        <div className="flex items-start justify-between">
          <div>
            <div className="font-medium">{row.name}</div>
            <div className="font-mono text-caption text-muted-foreground">{row.code}</div>
          </div>
          <button type="button" onClick={onRemove} className={DEL_BTN}>
            删除
          </button>
        </div>
        <p className="mt-3 text-caption text-destructive">取数失败：{row.error}</p>
      </article>
    )
  }

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 12) * 45}ms` }}
      className="fx-card fx-fade-up group relative flex flex-col overflow-hidden rounded-xl p-4"
    >
      <span className="absolute inset-x-0 top-0 h-0.5 bg-border transition-colors group-hover:bg-primary" />

      {/* 头部：名称 + 现价 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="font-mono text-caption text-muted-foreground">{row.code}</div>
        </div>
        <div className="text-right">
          <div className={cn('text-title-md font-bold', NUM)}>{fmtPrice(row.price)}</div>
          <div className={cn('text-caption font-semibold', NUM, signClass(row.pct))}>
            {row.pct == null ? '—' : `${row.pct >= 0 ? '▲' : '▼'} ${fmtPct(row.pct)}`}
          </div>
        </div>
      </div>

      {/* 评级 + 60日线方向 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2.5 py-0.5 text-caption font-semibold', TONE_CLS[rate.tone])}>
          {rate.label}
        </span>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-caption text-muted-foreground">
          {ma60Dir}
        </span>
      </div>

      {/* 均线四宫格 */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <MaCell label="MA5" ma={row.ma5} price={row.price} />
        <MaCell label="MA10" ma={row.ma10} price={row.price} />
        <MaCell label="MA20" ma={row.ma20} price={row.price} />
        <MaCell label="MA60" ma={row.ma60} price={row.price} />
      </div>

      {/* 距60日线 + 前高压力位 */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
        <div className="rounded-lg border border-border bg-background px-2 py-1.5">
          <span className="text-muted-foreground">距 60 日线 </span>
          <span className={cn('font-semibold', NUM, signClass(row.ma60 != null && row.price != null && row.ma60 > 0 ? ((row.price - row.ma60) / row.ma60) * 100 : null))}>
            {row.ma60 != null && row.price != null && row.ma60 > 0 ? fmtPct(((row.price - row.ma60) / row.ma60) * 100) : '—'}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-background px-2 py-1.5">
          <span className="text-muted-foreground">前高 </span>
          <span className={cn('font-semibold', NUM)}>{fmtPrice(row.prevHigh)}</span>
          {row.prevHigh != null && row.price != null && row.prevHigh > 0 ? (
            <span className={cn('ml-1', NUM, signClass((row.price - row.prevHigh) / row.prevHigh * 100))}>
              {row.price >= row.prevHigh ? '已突破' : `${(((row.price - row.prevHigh) / row.prevHigh) * 100).toFixed(1)}%`}
            </span>
          ) : null}
        </div>
      </div>

      {/* 资金(OBV) + 节奏(5日线) */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-caption font-semibold', TONE_CLS[obvBadge.tone])}>
          OBV · {obvBadge.label}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-caption font-semibold', TONE_CLS[rhythm.tone])}>
          5日线 · {rhythm.label}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
        <span className="text-caption text-muted-foreground">
          OBV {row.obv == null ? '—' : Math.round(row.obv).toLocaleString()}
        </span>
        <button type="button" onClick={onRemove} className={DEL_BTN}>
          删除
        </button>
      </div>
    </article>
  )
}
