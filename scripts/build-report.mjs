// build-report.mjs — 合并自选池(44) + 全市场(年内>50%) 的 5 日战法结果 → 自包含 HTML 报告
import { readFileSync, writeFileSync } from 'fs'

const watch = JSON.parse(readFileSync('watch48-result.json', 'utf8'))
const market = JSON.parse(readFileSync('market459-result.json', 'utf8'))

const ts = new Date(market.generated).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const watchBuy = watch.buy || []
const watchSet = new Set((watch.results || []).map((r) => r.code))
// 全市场可买入清单
const buyable = (market.buyable || []).sort((a, b) => b.ytd - a.ytd)
const ytd50 = market.ytd50Count
// 全市场清单里同时也在自选池的
const inWatch = (code) => watchSet.has(code)

const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

// 自选池按分层排序
const tierOrder = { buy: 0, watch: 1, dark: 2, remove: 3 }
const watchRows = [...(watch.results || [])].sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9))
const TIER_LABEL = { buy: '可买入持有', watch: '观察', dark: '黑马候选', remove: '建议移除' }
const TIER_CLASS = { buy: 't-buy', watch: 't-watch', dark: 't-dark', remove: 't-remove' }

function pctCell(v, opts = {}) {
  if (v == null) return '<td class="muted">--</td>'
  const cls = v >= 0 ? 'up' : 'down'
  const sign = v > 0 ? '+' : ''
  return `<td class="${cls}">${sign}${v}%</td>`
}
function numCell(v) { return v == null ? '<td class="muted">--</td>' : `<td>${v}</td>` }
function boolCell(v, yes = '✓', no = '✗') { return `<td class="${v ? 'ok' : 'no'}">${v ? yes : no}</td>` }
function upDown(v) { return v == null ? '<td class="muted">--</td>' : `<td class="${v ? 'ok' : 'no'}">${v ? '↑' : '↓'}</td>` }

// ---- 自选池表格 ----
const watchTable = watchRows.map((r) => {
  if (r.error) return `<tr><td>${esc(r.name)}</td><td class="muted">${esc(r.code)}</td><td colspan="11" class="muted">取数失败: ${esc(r.error)}</td></tr>`
  const cls = TIER_CLASS[r.tier] || ''
  return `<tr class="${cls}">
    <td class="nm">${esc(r.name)}<span class="code">${esc(r.code)}</span></td>
    ${numCell(r.price)}
    ${pctCell(r.pct)}
    ${pctCell(r.diff5)}
    ${numCell(r.ma5)}${numCell(r.ma10)}${numCell(r.ma20)}${numCell(r.ma60)}
    ${upDown(r.ma60Up)}${boolCell(r.bullish)}${boolCell(r.above5, '是', '否')}
    ${numCell(r.prevHigh)}${pctCell(r.distHigh)}
    <td><span class="badge ${cls}">${TIER_LABEL[r.tier] || r.tier}</span></td>
  </tr>`
}).join('')

// ---- 全市场可买入清单 ----
const marketTable = buyable.map((r) => {
  const tag = inWatch(r.code) ? '<span class="tag-watch">自选</span>' : ''
  return `<tr>
    <td class="nm">${esc(r.name)}${tag}<span class="code">${esc(r.code)}</span></td>
    ${numCell(r.price)}
    ${pctCell(r.ytd)}
    ${pctCell(r.diff5)}
    ${boolCell(r.bullish)}
    ${numCell(r.prevHigh)}${pctCell(r.distHigh)}
  </tr>`
}).join('')

const pctBuy = ytd50 ? ((buyable.length / ytd50) * 100).toFixed(0) : '--'

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>5日战法 · 符合清单（自选 + 全市场）</title>
<style>
:root{--void:#08090a;--carbon:#0f1011;--graphite:#23252a;--line:#2a2d33;--txt:#e6e7ea;--muted:#8a8f98;--lime:#e4f222;--up:#eb5757;--down:#27a644;--amber:#f5a623;}
*{box-sizing:border-box;}
body{margin:0;background:var(--void);color:var(--txt);font-family:Inter,-apple-system,"Segoe UI",system-ui,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.5;}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px;}
header h1{font-size:24px;font-weight:700;margin:0 0 4px;letter-spacing:-.02em;}
.sub{color:var(--muted);font-size:13px;margin-bottom:24px;}
.cards{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:28px;}
.card{background:var(--carbon);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:170px;flex:1;}
.card .k{color:var(--muted);font-size:12px;margin-bottom:6px;}
.card .v{font-size:26px;font-weight:700;letter-spacing:-.02em;}
.card .v.lime{color:var(--lime);}
.card .v.up{color:var(--up);}
.card .d{color:var(--muted);font-size:11px;margin-top:4px;}
h2{font-size:17px;font-weight:700;margin:34px 0 12px;padding-left:10px;border-left:3px solid var(--lime);}
.note{background:var(--carbon);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--muted);font-size:12.5px;margin-bottom:16px;}
table{width:100%;border-collapse:collapse;background:var(--carbon);border:1px solid var(--line);border-radius:12px;overflow:hidden;}
thead th{background:#16181c;color:var(--muted);font-weight:600;font-size:12px;text-align:right;padding:10px 10px;white-space:nowrap;position:sticky;top:0;}
thead th:first-child{text-align:left;}
tbody td{padding:9px 10px;text-align:right;border-top:1px solid var(--line);white-space:nowrap;}
tbody td.nm{text-align:left;font-weight:600;}
.code{display:block;color:var(--muted);font-weight:400;font-size:11px;margin-top:1px;}
.up{color:var(--up);} .down{color:var(--down);} .muted{color:var(--muted);} .ok{color:var(--lime);} .no{color:var(--muted);}
tr.t-buy{box-shadow:inset 3px 0 0 var(--lime);}
tr.t-watch{box-shadow:inset 3px 0 0 var(--amber);}
.badge{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;}
.badge.t-buy{background:rgba(228,242,34,.14);color:var(--lime);}
.badge.t-watch{background:rgba(245,166,35,.16);color:var(--amber);}
.badge.t-dark{background:rgba(120,160,255,.14);color:#9db4ff;}
.badge.t-remove{background:rgba(235,87,87,.14);color:var(--up);}
.tag-watch{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;font-size:10px;font-weight:600;background:rgba(228,242,34,.16);color:var(--lime);}
.search{width:100%;max-width:320px;background:var(--carbon);border:1px solid var(--line);border-radius:8px;padding:8px 12px;color:var(--txt);font-size:13px;margin-bottom:12px;}
.disclaimer{margin-top:40px;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--carbon);color:var(--muted);font-size:12px;line-height:1.7;}
.foot{color:var(--muted);font-size:11px;margin-top:18px;}
</style></head>
<body><div class="wrap">
<header>
  <h1>5 日线战法 · 符合清单</h1>
  <div class="sub">范围：自选池（44 只）+ 全市场年内涨幅 &gt;50%（${ytd50} 只）｜ 数据时点：${ts}（A 股收盘）｜ 红涨绿跌</div>
</header>

<div class="cards">
  <div class="card"><div class="k">自选池 · 可买入持有</div><div class="v lime">${watchBuy.length}</div><div class="d">/ 共 ${watchRows.length} 只</div></div>
  <div class="card"><div class="k">全市场 · 可买入持有</div><div class="v lime">${buyable.length}</div><div class="d">年内&gt;50% 中符合战法</div></div>
  <div class="card"><div class="k">全市场年内&gt;50%</div><div class="v">${ytd50}</div><div class="d">占全部 A 股约 ${((ytd50 / market.totalScanned) * 100).toFixed(1)}%</div></div>
  <div class="card"><div class="k">强势占比</div><div class="v up">${pctBuy}%</div><div class="d">${buyable.length}/${ytd50} 仍处可买趋势</div></div>
</div>

<div class="note">
  战法规则（鳄鱼派 / 5 日线）：<b>头等马</b> = 站上 60 日线且 60 日线向上（定方向）；<b>可买入持有</b> = 头等马 且 现价站上 5 日线（MA5&gt;MA20&gt;MA60 为多头加分项）；<b>观察</b> = 头等马但价在 5 日线下（等回踩企稳/收复）；<b>黑马候选</b> = 60 日趋势未起但 OBV 资金先行（不进场）；<b>建议移除</b> = 60 日线趋势未向上或价在其下。
</div>

<h2>一、自选池 44 只 · 5 日线战法判定</h2>
<div class="note">含截图 8 只 + 通达信「长期观察」40 只（去重后 44）。可买入持有 ${watchBuy.length} 只：${watchBuy.map((r) => esc(r.name)).join('、') || '无'}。</div>
<table>
<thead><tr><th>名称 / 代码</th><th>现价</th><th>当日%</th><th>距5线%</th><th>MA5</th><th>MA10</th><th>MA20</th><th>MA60</th><th>60线</th><th>多头</th><th>站5线</th><th>前高</th><th>距前高%</th><th>分层</th></tr></thead>
<tbody>${watchTable}</tbody>
</table>

<h2>二、全市场年内&gt;50% 中 · 符合 5 日战法可买入（${buyable.length} 只）</h2>
<div class="note">从 ${ytd50} 只年内涨幅超 50% 的 A 股中，筛出「头等马 + 站上 5 日线」的可买入标的，按年内涨幅降序。带 <span class="tag-watch">自选</span> 者同时也在你的自选池。</div>
<input class="search" id="q" placeholder="筛选名称 / 代码…">
<table>
<thead><tr><th>名称 / 代码</th><th>现价</th><th>年内涨幅%</th><th>距5线%</th><th>多头排列</th><th>前高</th><th>距前高%</th></tr></thead>
<tbody id="mbody">${marketTable}</tbody>
</table>

<div class="disclaimer">
  <b>免责声明</b>：以上内容基于公开数据和量化分析，仅供参考，不构成投资建议。市场有风险，投资需谨慎。任何投资决策应结合个人风险承受能力、资金状况和投资目标独立判断，必要时咨询持牌专业机构。过往表现不预示未来收益。
</div>
<div class="foot">数据源：腾讯 gtimg 日 K（前复权，≤250 根）+ 东财全量代码列表（${market.totalScanned} 只）。年内涨幅 = 现价 / 2026 年首个交易日收盘 − 1。5 日战法指标由日 K 实时计算。生成于 ${ts}。</div>
</div>
<script>
const q=document.getElementById('q'),b=document.getElementById('mbody');
q&&q.addEventListener('input',()=>{const t=q.value.trim().toLowerCase();[...b.children].forEach(tr=>{const s=tr.textContent.toLowerCase();tr.style.display=!t||s.includes(t)?'':'none';});});
</script>
</body></html>`

writeFileSync('tactic-report.html', html)
console.log('written tactic-report.html  bytes=' + Buffer.byteLength(html))
