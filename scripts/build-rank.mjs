// 合并全市场可买 + 自选可买，补行业板块，算强度分，按板块分组排序，出 Linear 暗色自包含 HTML
import fs from 'node:fs'

const NODE = process.argv[1]
const DIR = 'E:/AI Work/Financial Info'
const watch = JSON.parse(fs.readFileSync(DIR + '/watch48-result.json', 'utf8'))
const market = JSON.parse(fs.readFileSync(DIR + '/market459-result.json', 'utf8'))

const secid = (c) => { const m = c.slice(0, 2); const num = c.slice(2); return (m === 'sh' ? '1' : '0') + '.' + num }

// 1) 合并可买标的（去重）
const map = new Map()
for (const r of (watch.buy || [])) {
  map.set(r.code, { ...r, watch: true, gain: r.pct, gainLabel: '当日', chg: r.pct ?? r.chg ?? null })
}
for (const r of (market.buyable || [])) {
  if (map.has(r.code)) {
    const ex = map.get(r.code)
    map.set(r.code, { ...ex, ytd: r.ytd, gain: r.ytd, gainLabel: '年内', chg: r.chg ?? ex.chg ?? null, ma5: r.ma5, ma10: r.ma10, ma20: r.ma20, ma60: r.ma60, ma60Up: r.ma60Up, bullish: r.bullish, topHorse: r.topHorse, above5: r.above5, diff5: r.diff5, obvUp: r.obvUp, prevHigh: r.prevHigh, distHigh: r.distHigh, volRatio: r.volRatio })
  } else {
    map.set(r.code, { ...r, watch: false, gain: r.ytd, gainLabel: '年内' })
  }
}
const merged = [...map.values()]
console.log('merged buyable:', merged.length)

// 0.5) 排除科创板(sh688)与北证(bj) — 资金有限难参与、门槛/流动性限制
const isExcluded = (code) => /^sh688/.test(code) || /^bj/.test(code)
const before = merged.length
const list = merged.filter((r) => !isExcluded(r.code))
console.log('排除 科创板/北证:', before - list.length, '只；剩余', list.length)


// 2) 读取行业板块映射（由 fetch-industry.mjs 预抓取，避免现场限流）
let indMap = {}
try { indMap = JSON.parse(fs.readFileSync(DIR + '/industry-map.json', 'utf8')) } catch (e) { console.log('no industry-map.json, fallback 其他') }
for (const r of list) r.industry = indMap[r.code] || '其他'
console.log('industry loaded:', Object.keys(indMap).length, 'codes; sectors:', new Set(Object.values(indMap)).size)

// 3) 强度分
function strength(r) {
  let s = 0
  if (r.topHorse) s += 30          // 头等马：站上60日线 & MA60上行
  if (r.bullish) s += 22           // 多头排列
  if (r.above5) s += 8             // 站上5日线（节奏向上）
  if (r.obvUp) s += 12             // OBV资金上行（暗马确认）
  // 贴5日线紧密度：差越小越紧、节奏越强（diff5=0→12，≥12→0）
  const d5 = r.diff5 == null ? 99 : r.diff5
  s += Math.max(0, Math.min(12 - d5, 12))
  // 距前高：近高/突破=强，过远=弱
  const dh = r.distHigh
  let room = 6
  if (dh == null) room = 6
  else if (dh <= 0) room = 8
  else if (dh <= 10) room = 11
  else if (dh <= 20) room = 9
  else if (dh <= 35) room = 6
  else room = 3
  s += room
  // 离60日线延伸度（中期持有视角：适度延伸=健康趋势，过度延伸=暴涨后高风险→降分）
  const ext = r.ma60 ? (r.price / r.ma60 - 1) * 100 : 0
  let extScore = 2
  if (ext >= 20 && ext <= 50) extScore = 12       // 甜区：稳健中期趋势
  else if ((ext >= 10 && ext < 20) || (ext > 50 && ext <= 70)) extScore = 8
  else if ((ext >= 5 && ext < 10) || (ext > 70 && ext <= 90)) extScore = 4
  s += extScore
  return Math.round(Math.min(s, 100))
}
for (const r of list) {
  r.score = strength(r)
  r.ext = r.ma60 ? +((r.price / r.ma60 - 1) * 100).toFixed(1) : null   // 离60日线%
  const ext = r.ext == null ? 0 : r.ext
  const diff5 = r.diff5 == null ? 99 : r.diff5
  r.flags = [r.topHorse ? '头等马' : '', r.bullish ? '多头' : '', r.above5 ? '站5线' : '', r.obvUp ? '资金↑' : ''].filter(Boolean)
  // 追高提示：突破前高后已拉远 10%+（高位接力风险）；distHigh 为正=已突破前高，为负=仍在前高下方
  r.chase = (r.distHigh != null && r.distHigh > 10)
  r.isST = /ST/.test(r.name || '')
  // 风险档（中期持有视角）：已暴涨=过度延伸高危；偏高=需谨慎；适合中期=健康延伸+有缓冲
  if (ext > 60) { r.risk = 'high'; r.riskLabel = '已暴涨·高风险' }
  else if (ext >= 40 || diff5 < 2) { r.risk = 'mid'; r.riskLabel = '偏高·慎' }
  else { r.risk = 'low'; r.riskLabel = '适合中期' }
  // ★优先（资金有限先买这些）：中期持有级——强趋势、有缓冲、未过度延伸、不在最高尖
  r.pick = !r.isST && r.risk !== 'high' && r.score >= 80 && ext < 55 && diff5 >= 3 && (r.distHigh == null || (r.distHigh > -5 && r.distHigh < 28))
  // 高位放量·出货嫌疑：价格在高位（突破前高后已拉远>10% 或 离60线>45%）且 明显放量（量比≥1.8）
  const highPos = (r.distHigh != null && r.distHigh > 10) || ext > 45
  r.volRatio = r.volRatio == null ? null : r.volRatio
  r.volOut = !!(highPos && r.volRatio != null && r.volRatio >= 1.8)
  // 优质持有口径（顶部统计）：站上5日线 + 有上涨空间或刚突破打开空间(距前高≤+10%，含在前高下方) + 量能健康(非高位放量) + 非ST非隔离
  r.prime = r.above5 !== false && !r.volOut && !r.isST && r.risk !== 'high' && (r.distHigh == null || r.distHigh <= 10)
}

// 4) 排序：中期持有优先——先按风险档(适合中期>偏高·慎)，再按强度，剔除"已暴涨·高风险"档
const riskRank = (r) => r.risk === 'low' ? 0 : r.risk === 'mid' ? 1 : 2
const ranked = list.filter((r) => r.risk !== 'high').sort((a, b) => riskRank(a) - riskRank(b) || b.score - a.score || (b.gain || 0) - (a.gain || 0))
// 已暴涨·高风险 单独隔离展示（仅观察，不计入中期持有排序）
const overExt = list.filter((r) => r.risk === 'high').sort((a, b) => (b.ext || 0) - (a.ext || 0))
console.log('中期持有排序', ranked.length, '只；已暴涨隔离', overExt.length, '只')

// 4.2) 优质持有名单跟踪：每交易日记录名单、与上一交易日对比生成进出场变动
let primeLog = { dates: {}, changes: [] }
try { primeLog = JSON.parse(fs.readFileSync(DIR + '/prime-log.json', 'utf8')) } catch (e) {}
const todayKey = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10)
const prevDates = Object.keys(primeLog.dates).filter((d) => d !== todayKey).sort()
const prevDate = prevDates[prevDates.length - 1] || null
const prevSet = new Set(prevDate ? primeLog.dates[prevDate] || [] : [])
const curPrimeCodes = ranked.filter((r) => r.prime).map((r) => r.code)
const curSet = new Set(curPrimeCodes)
const stockByCode = new Map(list.map((r) => [r.code, r]))
const nameByCode = new Map([...list, ...overExt].map((r) => [r.code, r.name]))
const removedDetailed = [...prevSet].filter((c) => !curSet.has(c)).map((c) => {
  const r = stockByCode.get(c)
  let reason = '已跌出筛选池（破5日线/掉出候选）'
  if (r) {
    if (r.risk === 'high') reason = '离60线>60% · 暴涨隔离'
    else if (r.volOut) reason = `高位放量（量比${r.volRatio != null ? r.volRatio + 'x' : '?'}）`
    else if (r.above5 === false) reason = '跌破5日线'
    else if (r.distHigh != null && r.distHigh > 10) reason = `突破后拉太远（距前高+${r.distHigh}%）`
    else if (r.isST) reason = 'ST 风险'
    else reason = '不满足优质持有条件'
  }
  return { code: c, name: nameByCode.get(c) || c, reason }
})
const addedDetailed = ranked.filter((r) => r.prime && !prevSet.has(r.code)).map((r) => ({ code: r.code, name: r.name }))
let primeChanges = null
if (prevDate) {
  // 同日重复运行去重：替换当日已有的变动记录
  primeLog.changes = primeLog.changes.filter((c) => c.date !== todayKey)
  primeChanges = { date: todayKey, prevDate, added: addedDetailed, removed: removedDetailed }
  if (addedDetailed.length || removedDetailed.length) primeLog.changes.push(primeChanges)
}
primeLog.dates[todayKey] = curPrimeCodes
fs.writeFileSync(DIR + '/prime-log.json', JSON.stringify(primeLog, null, 2))
console.log('优质持有', curPrimeCodes.length, '只；较上期(' + (prevDate || '无') + ') 进', addedDetailed.length, '出', removedDetailed.length)


// 4.5) 读取昨日战法胜率（由 win-rate.mjs 预计算）
let wr = null
try { wr = JSON.parse(fs.readFileSync(DIR + '/win-rate.json', 'utf8')) } catch (e) {}

// 5) 按板块分组
const groups = new Map()
for (const r of ranked) {
  const g = r.industry || '其他'
  if (!groups.has(g)) groups.set(g, [])
  groups.get(g).push(r)
}
// 板块排序：按板块内最高强度降序（强板块在前）
const groupArr = [...groups.entries()].map(([name, rows]) => ({
  name, rows,
  maxScore: Math.max(...rows.map((r) => r.score)),
  avgScore: Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length),
  cnt: rows.length
})).sort((a, b) => b.maxScore - a.maxScore || b.cnt - a.cnt)

// 6) 渲染
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const genTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const lime = '#e4f222', red = '#eb5757', green = '#27a644', dim = '#8a8f98', line = '#23252a'

const THEAD = `<thead><tr><th class="rk">#</th><th>名称/代码</th><th class="num">现价</th><th class="num">涨幅</th><th class="num">强度</th><th>风险档</th><th>战法标记</th><th class="num">距前高</th><th class="num">5日线</th><th class="num">离60线</th></tr></thead>`

function rowHtml(r, i) {
  const cls = r.pick ? 'pick' : ''
  const scoreColor = r.score >= 90 ? lime : r.score >= 80 ? '#bfe000' : r.score >= 70 ? '#9bbf3a' : dim
  const riskColor = r.risk === 'high' ? '#eb5757' : r.risk === 'mid' ? '#e0a23a' : '#9bbf3a'
  const gainColor = (r.gain || 0) >= 0 ? red : green
  const dhTxt = r.distHigh == null ? '—' : (r.distHigh >= 0 ? '+' + r.distHigh.toFixed(1) + '%' : r.distHigh.toFixed(1) + '%')
  const dhColor = r.distHigh == null ? dim : r.distHigh <= 0 ? lime : r.distHigh <= 15 ? '#9bbf3a' : dim
  const extColor = r.ext == null ? dim : r.ext > 60 ? '#eb5757' : r.ext > 35 ? '#e0a23a' : '#9bbf3a'
  return `<tr class="${cls}">
    <td class="rk">${i + 1}</td>
    <td class="nm">${esc(r.name)}<span class="cd">${esc(r.code)}</span>${r.watch ? '<span class="wt">自选</span>' : ''}${r.isST ? '<span class="st">ST</span>' : ''}${r.pick ? '<span class="pk">★优先</span>' : ''}${r.chase ? '<span class="ch">追高</span>' : ''}</td>
    <td class="num">${r.price?.toFixed(2)}</td>
    <td class="num" style="color:${gainColor}">${(r.gain || 0) >= 0 ? '+' : ''}${(r.gain || 0).toFixed(1)}%</td>
    <td class="num" style="color:${scoreColor};font-weight:700">${r.score}</td>
    <td class="rk2" style="color:${riskColor}">${r.riskLabel}</td>
    <td class="flags">${r.flags.map((f) => `<span class="f">${f}</span>`).join('')}</td>
    <td class="num" style="color:${dhColor}">${dhTxt}</td>
    <td class="num">${r.ma5?.toFixed(2)}</td>
    <td class="num" style="color:${extColor}">${r.ext == null ? '—' : (r.ext >= 0 ? '+' : '') + r.ext + '%'}</td>
  </tr>`
}

const topRows = ranked.slice(0, 15).map(rowHtml).join('')
const groupHtml = groupArr.map((g) => {
  const rows = g.rows.map((r) => rowHtml(r, ranked.indexOf(r) + 1)).join('')
  return `<section class="grp">
    <div class="ghead"><span class="gname">${esc(g.name)}</span><span class="gmeta">${g.cnt}只 · 最高${g.maxScore}分 · 均${g.avgScore}</span></div>
    <table class="tbl">${THEAD}<tbody>${rows}</tbody></table>
  </section>`
}).join('')

const pickList = ranked.filter((r) => r.pick)
const pickHtml = pickList.map((r, i) => `<li><b>${esc(r.name)}</b> <span class="cd">${esc(r.code)}</span> · ${r.industry} · 强度${r.score}${r.watch ? ' · 自选' : ''}${r.isST ? ' · ST' : ''}</li>`).join('')

const winRateCard = wr ? `
<div class="card" style="border-color:#3a2f00">
  <div class="box-title" style="color:#e4f222">5日线战法 · 持有健康率（正确口径）</div>
  <div class="kpis">
    <div class="kpi"><div class="k">持有健康率（没破5日线）</div><div class="v lime">${wr.holdRate}%</div></div>
    <div class="kpi"><div class="k">跌破5日线（战法卖出）</div><div class="v" style="color:#eb5757">${wr.failCount} 只</div></div>
    <div class="kpi"><div class="k">真实均涨跌(9-22→今)</div><div class="v" style="color:${wr.retAvg >= 0 ? '#eb5757' : '#27a644'}">${wr.retAvg >= 0 ? '+' : ''}${wr.retAvg}%</div></div>
    <div class="kpi"><div class="k">强趋势子集健康率</div><div class="v lime">${wr.pickRate}%</div></div>
  </div>
  <div class="note">口径更正：<b style="color:#e4f222">跌破5日线=失败，没跌破=持有健康（算胜）</b>。旧版用「涨跌」误把"日内小回踩但仍站5日线"的健康持有算成亏损，已废除。信号集=当前可买 ${wr.total} 只（已排除科创板/北证），表现取 9-23 盘中最新价 vs 各自 MA5（数据 ${wr.asOf}）。强趋势子集 ${wr.pickTotal} 只中 <b style="color:#e4f222">${wr.pickHold} 只仍站5日线</b>（健康率 ${wr.pickRate}%）。跌破的 ${wr.failCount} 只：平均 ${wr.failRetAvg}%。最强板块：${wr.sectors.slice(0, 3).map((s) => s.name + ' ' + s.rate + '%(' + s.hold + '/' + s.n + ')').join('、')}。</div>
</div>` : ''

const overExtCard = overExt.length ? `
<div class="card" style="border-color:#3a1414">
  <div class="box-title" style="color:#eb5757">已暴涨 · 高风险 · 不推荐追（仅观察，未计入上方中期持有排序）</div>
  <div class="note" style="color:#c9a0a0">以下标的仍符合5日战法（站60日线、多头排列、资金↑），但现价已较60日线过度延伸（&gt;60%），属"暴涨过后"高位加速段——单日跳空/回踩风险大，不适合中期持有建仓。例：闽东电力(sz000993, 离60线+67%) 9-23 开盘即 -10% 跌停。本档已从"中期持有排序"中剔除，仅供观察警戒。</div>
  <table class="tbl">${THEAD}<tbody>${overExt.map((r, i) => rowHtml(r, i + 1)).join('')}</tbody></table>
</div>` : ''

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>可买标的 · 强度排序（按板块）</title>
<style>
:root{--void:#08090a;--carbon:#0f1011;--graphite:#23252a;--lime:#e4f222;--dim:#8a8f98;--red:#eb5757;--green:#27a644;}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--void);color:#e6e8ea;font-family:-apple-system,'Inter',system-ui,'Segoe UI',sans-serif;font-size:13px;line-height:1.5;padding:28px 20px 60px}
.wrap{max-width:1080px;margin:0 auto}
h1{font-size:22px;font-weight:800;letter-spacing:-.3px}
h1 .ac{color:var(--lime)}
.sub{color:var(--dim);font-size:12px;margin:6px 0 18px}
.card{background:var(--carbon);border:1px solid var(--graphite);border-radius:12px;padding:18px 20px;margin:14px 0}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.kpi{flex:1;min-width:140px;background:var(--carbon);border:1px solid var(--graphite);border-radius:12px;padding:14px 16px}
.kpi .k{color:var(--dim);font-size:11px}
.kpi .v{font-size:24px;font-weight:800;margin-top:4px}
.kpi .v.lime{color:var(--lime)}
.box-title{font-size:13px;font-weight:700;color:#cfd2d6;margin:4px 0 10px;display:flex;align-items:center;gap:8px}
.box-title::before{content:'';width:8px;height:8px;border-radius:2px;background:var(--lime)}
.pick-list{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 18px}
.pick-list li{padding:6px 0;border-bottom:1px dashed var(--graphite);font-size:12.5px}
.cd{color:var(--dim);font-size:11px;margin-left:4px}
table{width:100%;border-collapse:collapse;margin-top:4px}
.tbl th{padding:8px 8px;font-size:11px;color:var(--dim);font-weight:600;text-align:left;border-bottom:1px solid var(--graphite);position:sticky;top:0;background:var(--carbon)}
.tbl th.num,.tbl td.num{text-align:right}
.tbl td{padding:7px 8px;border-top:1px solid var(--graphite);font-size:12.5px;vertical-align:middle}
.rk{color:var(--dim);width:30px;text-align:right;font-variant-numeric:tabular-nums}
.rk2{font-size:11px;font-weight:700;white-space:nowrap}
.nm{font-weight:600}
.nm .cd{display:inline-block;margin-left:5px}
.wt{background:var(--lime);color:#08090a;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px}
.st{background:#2b1414;color:#eb5757;border:1px solid #eb5757;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px}
.pk{background:#1d2b00;color:var(--lime);border:1px solid var(--lime);border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px}
.ch{background:#2b1414;color:var(--red);border-radius:4px;font-size:10px;padding:1px 5px;margin-left:6px}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.flags{white-space:nowrap}
.flags .f{display:inline-block;background:#16181b;border:1px solid var(--graphite);border-radius:4px;font-size:10.5px;color:#b9bdc4;padding:1px 6px;margin:1px 3px 1px 0}
tr.pick td{background:#10130b}
.grp{margin:16px 0;background:var(--carbon);border:1px solid var(--graphite);border-radius:12px;overflow:hidden}
.ghead{display:flex;justify-content:space-between;align-items:baseline;padding:11px 16px;background:#121417;border-bottom:1px solid var(--graphite)}
.gname{font-weight:800;font-size:14px}
.gname::before{content:'▍';color:var(--lime);margin-right:6px}
.gmeta{color:var(--dim);font-size:11.5px}
.legend{color:var(--dim);font-size:11.5px;margin:10px 0;display:flex;gap:16px;flex-wrap:wrap}
.legend b{color:#cfd2d6}
.note{color:var(--dim);font-size:11.5px;margin-top:14px;line-height:1.7;border-top:1px solid var(--graphite);padding-top:12px}
.note b{color:#cfd2d6}
</style></head><body><div class="wrap">
<h1>中期趋势持有 · <span class="ac">强度排序</span>（按板块）</h1>
<div class="sub">鳄鱼派 5 日线战法 · 数据时点 2026-09-23（盘中）· 生成 ${genTime} · 红涨绿跌 · <b style="color:#e0a23a">已排除科创板(sh688)与北证(bj)</b> · <b style="color:#eb5757">已暴涨·过度延伸(离60线&gt;60%)已隔离不计入排序</b></div>

<div class="kpis">
  <div class="kpi"><div class="k">中期持有候选</div><div class="v">${ranked.length}</div></div>
  <div class="kpi"><div class="k">覆盖板块</div><div class="v">${groupArr.length}</div></div>
  <div class="kpi"><div class="k">★优先（中期持有级）</div><div class="v lime">${pickList.length}</div></div>
  <div class="kpi"><div class="k">已暴涨隔离·不追</div><div class="v" style="color:#eb5757">${overExt.length}</div></div>
</div>

${winRateCard}
${overExtCard}
<div class="card">
  <div class="box-title">资金有限，先买这些（★优先 · 中期持有级 Top ${pickList.length}）</div>
  <ul class="pick-list">${pickHtml || '<li>无</li>'}</ul>
  <div class="note">★优先 = 强度分 ≥ 82 且现价距前高在 -8%~+22%（强趋势、资金确认、且不在最高尖追涨）。资金不多时优先从这堆里挑，单吊 1–3 只而非铺开。</div>
</div>

<div class="card">
  <div class="box-title">全局强度 Top 15</div>
  <table class="tbl">${THEAD}<tbody>${topRows}</tbody></table>
</div>

<div class="legend">
  <span><b>强度分</b> 0–100：头等马30 + 多头22 + 站5线8 + 资金↑12 + 贴5线紧度12 + 距前高11 + <b>离60线适度延伸</b>(甜区20-50%满分，过度延伸反而降分)</span>
  <span><b>风险档</b> <span style="color:#9bbf3a">适合中期</span>=健康延伸+有缓冲 · <span style="color:#e0a23a">偏高·慎</span>=偏离40-60%或贴线薄 · <span style="color:#eb5757">已暴涨·高风险</span>=离60线&gt;60%，隔离不推荐追</span>
  <span><b>离60线</b> <span style="color:#9bbf3a">绿</span>&lt;35% · <span style="color:#e0a23a">橙</span>35-60% · <span style="color:#eb5757">红</span>&gt;60%(过度延伸)</span>
  <span><b>距前高</b> 黄=已突破，绿=有空间</span>
  <span><b>追高</b> 现价已超前高(距前高≤-3%)</span>
</div>

<h1 style="font-size:17px;margin:22px 0 4px">按板块分组（强板块在前）</h1>
${groupHtml}

<div class="note">
  <b>排序目的：</b>本表只排<b style="color:#9bbf3a">适合中期持有</b>的标的——强趋势(站60日线/60日线向上/多头排列)、资金同步(OBV↑)、且有缓冲(距5日线≥3%、未过度延伸)。"暴涨过后"的过度延伸票(离60线&gt;60%)已被隔离到上方红框，<b>不计入排序、不推荐追</b>（例：闽东电力 9-23 开盘 -10% 跌停）。
  <br><b>强度分怎么读：</b>分越高=趋势越正。离60线延伸度改为"甜区给分"——<b>适度延伸(20-50%)满分，过度延伸(&gt;60%)反而降分</b>，避免把高位加速票排到前面；再用贴5日线紧度+距前高做微调。
  <br><b>风险档：</b><span style="color:#9bbf3a">适合中期</span>=健康延伸+缓冲足；<span style="color:#e0a23a">偏高·慎</span>=离60线40-60%或贴5日线过薄(缓冲&lt;2%)，可小仓试探；<span style="color:#eb5757">已暴涨·高风险</span>=离60线&gt;60%，高位加速、单日跳空风险大，隔离观察。
  <br><b>★优先</b> = 中期持有级：强度≥80 且离60线&lt;55% 且距5日线≥3% 且不在最高尖(距前高-5%~+28%)、非ST。资金不多从这堆挑 1–3 只，止损设于5日线下方。
  <br><b>风险提示：</b>量化结论仅供参考，不构成投资建议。市场有风险，投资需谨慎。
</div>
</div></body></html>`

fs.writeFileSync(DIR + '/tactic-rank.html', html)
fs.writeFileSync(DIR + '/rank-data.json', JSON.stringify({ generated: genTime, total: ranked.length, groups: groupArr.length, ranked, primeChanges }, null, 0))
console.log('REPORT_OK 板块数', groupArr.length, '优先', pickList.length)
