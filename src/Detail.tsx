// Detail.tsx — 条目详情页（大块文章 + 信源 chips，ClickHouse 黑黄高科）
import React from 'react'
import { useItems, useQuotes, formatTime } from './api'
import { Header, QuoteTicker, ErrorBanner } from './components'

const MAIN = 'mx-auto w-full max-w-[1200px] px-5 pb-16 pt-5'

export function Detail({
  id,
  navigate,
}: {
  id: string
  navigate: (to: string) => void
}) {
  const { items, loading, error } = useItems()
  const quotes = useQuotes()

  if (error) {
    return (
      <>
        <Header active="home" onNavigate={navigate} />
        <QuoteTicker quotes={quotes} />
        <main className={MAIN}>
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
        <main className={MAIN}>
          <div className="py-10 text-center text-body-sm text-muted-foreground">加载中…</div>
        </main>
      </>
    )
  }

  const item = items.find((it) => it.id === id)
  if (!item) {
    return (
      <>
        <Header active="home" onNavigate={navigate} />
        <QuoteTicker />
        <main className={MAIN}>
          <div
            className="my-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
            role="alert"
          >
            <strong className="text-title-sm text-destructive">未找到该条目</strong>
            <p className="my-2 font-mono text-code text-destructive">id={id}</p>
            <button
              type="button"
              className="cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-button text-foreground transition-colors hover:border-border-hover hover:bg-accent"
              onClick={() => navigate('/')}
            >
              返回首页
            </button>
          </div>
        </main>
      </>
    )
  }

  const related = [item.source, ...item.extraSources]

  return (
    <>
      <Header active="home" onNavigate={navigate} />
      <QuoteTicker />
      <main className={MAIN}>
        <button
          type="button"
          className="mb-3 cursor-pointer bg-transparent py-1.5 text-nav-link text-info transition-colors hover:underline"
          onClick={() => navigate('/')}
        >
          ← 返回
        </button>

        <article className="fx-card relative overflow-hidden rounded-xl p-6">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-muted-foreground">
            <span className="tabular-nums">{formatTime(item.time)}</span>
            <span>{item.source}</span>
            <span className="rounded-full bg-highlight px-2 py-0.5 font-semibold text-highlight-foreground">
              {item.category}
            </span>
            <span className="font-semibold tabular-nums text-foreground">热度 {item.heat}</span>
          </div>
          <h1 className="mb-3 text-title-lg font-bold leading-snug">{item.title}</h1>
          <p className="mb-3 text-body-md text-foreground/80">{item.summary}</p>
          {item.url ? (
            <p className="mb-3 text-caption text-muted-foreground">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info hover:underline"
              >
                查看原文来源 ↗
              </a>
            </p>
          ) : (
            <p className="mb-3 text-caption text-muted-foreground">
              （摘要由来源正文截取，去重后聚合展示）
            </p>
          )}
          <div className="mb-4 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span
                key={t}
                className="cursor-default rounded-full border border-border bg-muted px-2.5 py-0.5 text-caption text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-title-sm font-semibold">相关信源（{related.length}）</h3>
            <div className="flex flex-wrap gap-2">
              {related.map((s, i) => (
                <span
                  key={`${s}-${i}`}
                  className="rounded-lg border border-border bg-muted px-3 py-1.5 text-body-sm text-foreground/80"
                >
                  {s}
                  <span className="ml-1.5 text-caption text-muted-foreground">
                    {i === 0 ? '主源' : '合并'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </article>
      </main>
    </>
  )
}
