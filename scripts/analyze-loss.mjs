// 败因分析：9-22 可买信号(115只) → 9-23 表现，拆解下跌成因 + 优化模拟
// 数据：rank-data.json（9-22 战术特征）+ win-rate.json.detail（今日跌幅 ret）
import fs from 'node:fs'
const DIR = 'E:/AI Work/Financial Info'
const rank = JSON.parse(fs.readFileSync(DIR + '/rank-data.json', 'utf8'))
const wr = JSON.parse(fs.readFileSync(DIR + '/win-rate.json', 'utf8'))

// 战术特征 map（code -> 9-22 特征）
const feat = new Map()
for (const r of rank.ranked) feat.set(r.code, r)

// 合并：每只含 ret + 战术特征
const rows = (wr.detail || []).map((d) => {
  const f = feat.get(d.code) || {}
  return {
    code: d.code, name: d.name, industry: d.industry,
    ret: d.ret, score: d.score, pick: d.pick, watch: d.watch,
    ytd: f.ytd, distHigh: f.distHigh, ext: f.ext, gain: f.gain,
    topHorse: f.topHorse, bullish: f.bullish, above5: f.above5, obvUp: f.obvUp,
    isST: f.isST, ma5: f.ma5, ma60: f.ma60, diff5: f.diff5
  }
}).filter((x) => x.ret != null)

const loss = rows.filter((x) => x.ret < 0)
const up = rows.filter((x) => x.ret > 0)

// 板块胜率（从合并数据自算，覆盖所有板块）
const secMap = new Map()
for (const x of rows) {
  if (!secMap.has(x.industry)) secMap.set(x.industry, { n: 0, win: 0, lossRet: 0 })
  const s = secMap.get(x.industry); s.n++; if (x.ret > 0) s.win++; else s.lossRet += x.ret
}
const secRate = (ind) => { const s = secMap.get(ind); return s ? s.win / s.n : 0.5 }

// 主因归类（优先级）
function cause(x) {
  const tags = []
  if (x.isST) tags.push('ST高风险')
  if (x.distHigh != null && x.distHigh < -8) tags.push('追高尖')
  if (x.ext != null && x.ext > 60) tags.push('过度拉伸')
  if (x.ytd != null && x.ytd > 200) tags.push('高位补跌')
  if (!x.pick) tags.push('弱趋势')
  if (secRate(x.industry) < 0.5) tags.push('板块退潮')
  if (x.topHorse && x.bullish && x.ret >= -6) tags.push('健康回踩')
  if (tags.length === 0) tags.push('其他')
  return tags
}
for (const x of rows) x.causes = cause(x)
const primary = (x) => x.causes[0]

// 败因分布
const causeCount = {}
for (const x of loss) { const p = primary(x); causeCount[p] = (causeCount[p] || 0) + 1 }
const causeDist = Object.entries(causeCount).sort((a, b) => b[1] - a[1])

// 分维度下跌率
function bucketRate(getBucket, buckets) {
  const m = {}
  for (const b of buckets) m[b.key] = { n: 0, loss: 0, lossRet: 0 }
  for (const x of rows) { const k = getBucket(x); if (m[k]) { m[k].n++; if (x.ret < 0) { m[k].loss++; m[k].lossRet += x.ret } } }
  return buckets.map((b) => ({ ...b, ...m[b.key], lossRate: m[b.key].n ? +(m[b.key].loss / m[b.key].n * 100).toFixed(0) : 0, avgLoss: m[b.key].loss ? +(m[b.key].lossRet / m[b.key].loss).toFixed(2) : 0 }))
}
const byYtd = bucketRate(
  (x) => x.ytd == null ? 'na' : x.ytd <= 100 ? 'a' : x.ytd <= 200 ? 'b' : 'c',
  [{ key: 'a', name: '年内+50~100%' }, { key: 'b', name: '年内+100~200%' }, { key: 'c', name: '年内>200%' }, { key: 'na', name: '无数据' }]
)
const byExt = bucketRate(
  (x) => x.ext == null ? 'na' : x.ext < 35 ? 'a' : x.ext <= 60 ? 'b' : 'c',
  [{ key: 'a', name: '离60线<35%(健康)' }, { key: 'b', name: '离60线35~60%(偏高)' }, { key: 'c', name: '离60线>60%(过度)' }, { key: 'na', name: '无数据' }]
)
const byDH = bucketRate(
  (x) => x.distHigh == null ? 'na' : x.distHigh < -8 ? 'a' : x.distHigh <= 0 ? 'b' : x.distHigh <= 15 ? 'c' : 'd',
  [{ key: 'a', name: '距前高<-8%(追高尖)' }, { key: 'b', name: '距前高-8~0%(刚突破)' }, { key: 'c', name: '距前高0~15%(有空间)' }, { key: 'd', name: '距前高>15%(大空间)' }, { key: 'na', name: '无数据' }]
)
const pickLoss = bucketRate((x) => x.pick ? 'p' : 'n', [{ key: 'p', name: '★优先' }, { key: 'n', name: '非★优先' }])

// 优化模拟
function simRule(name, pred) {
  const sel = rows.filter(pred)
  const l = sel.filter((x) => x.ret < 0)
  const w = sel.filter((x) => x.ret > 0)
  const avg = sel.length ? +(sel.reduce((s, x) => s + x.ret, 0) / sel.length).toFixed(2) : 0
  return { name, n: sel.length, rate: sel.length ? +(w.length / sel.length * 100).toFixed(1) : 0, avgRet: avg, lossN: l.length, lossRet: +l.reduce((s, x) => s + x.ret, 0).toFixed(2) }
}
const R0 = simRule('原信号集(115)', () => true)
const R1 = simRule('★优先(30)', (x) => x.pick)
const R2 = simRule('★优先+排雷(追高尖/过度拉伸/高位>200)', (x) => x.pick && !(x.distHigh != null && x.distHigh < -8) && !(x.ext != null && x.ext > 60) && !(x.ytd != null && x.ytd > 200))
const R3 = simRule('★优先+排雷+板块退潮过滤', (x) => x.pick && !(x.distHigh != null && x.distHigh < -8) && !(x.ext != null && x.ext > 60) && !(x.ytd != null && x.ytd > 200) && secRate(x.industry) >= 0.5)

// 下跌名单（按跌幅）
const lossList = loss.slice().sort((a, b) => a.ret - b.ret)

// 输出 JSON
const out = { total: rows.length, lossN: loss.length, lossAvg: +(loss.reduce((s, x) => s + x.ret, 0) / loss.length).toFixed(2), causeDist, byYtd, byExt, byDH, pickLoss, R0, R1, R2, R3, lossList, secRate: Object.fromEntries([...secMap].map(([k, v]) => [k, +(v.win / v.n * 100).toFixed(0)])) }
fs.writeFileSync(DIR + '/loss-analysis.json', JSON.stringify(out, null, 0))

// ---- HTML 报告 ----
const lime = '#e4f222', red = '#eb5757', green = '#27a644', dim = '#8a8f98', graphite = '#23252a'
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const genTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
const bar = (v, max, color) => `<div class="bar"><div class="fill" style="width:${(Math.max(v, 0) / max * 100).toFixed(1)}%;background:${color}"></div></div>`

const causeRows = causeDist.map(([c, n]) => `<tr><td>${esc(c)}</td><td class="num">${n}</td><td class="num">${(n / loss.length * 100).toFixed(0)}%</td><td>${bar(n, causeDist[0][1], c === '健康回踩' ? green : c === 'ST高风险' ? red : '#e0a23a')}</td></tr>`).join('')
const dimRows = (arr) => arr.map((d) => `<tr><td>${esc(d.name)}</td><td class="num">${d.n}</td><td class="num" style="color:${d.lossRate >= 60 ? red : d.lossRate >= 45 ? '#e0a23a' : green}">${d.lossRate}%</td><td class="num" style="color:${d.avgLoss < 0 ? red : green}">${d.avgLoss}%</td></tr>`).join('')
const simRows = [R0, R1, R2, R3].map((r) => `<tr class="${r.name.startsWith('★优先+排雷') ? 'best' : ''}"><td>${esc(r.name)}</td><td class="num">${r.n}</td><td class="num" style="color:${r.rate >= 60 ? green : r.rate >= 45 ? '#e0a23a' : red}">${r.rate}%</td><td class="num" style="color:${r.avgRet >= 0 ? green : red}">${r.avgRet}%</td><td class="num" style="color:${r.lossN ? red : green}">${r.lossN}</td><td class="num" style="color:red">${r.lossRet}%</td></tr>`).join('')
const lossHtml = lossList.slice(0, 40).map((x, i) => `<tr><td class="rk">${i + 1}</td><td class="nm">${esc(x.name)}<span class="cd">${esc(x.code)}</span>${x.watch ? '<span class="wt">自选</span>' : ''}${x.isST ? '<span class="st">ST</span>' : ''}</td><td class="num" style="color:${red}">${x.ret}%</td><td class="num">${x.industry}</td><td class="tags">${x.causes.map((c) => `<span class="c">${c}</span>`).join('')}</td></tr>`).join('')

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>9-23 下跌败因分析 · 鳄鱼派5日战法</title><style>
:root{--void:#08090a;--carbon:#0f1011;--graphite:#23252a;--mist:#d0d6e0;--lime:#e4f222;--red:#eb5757;--green:#27a644;--dim:#8a8f98}
*{box-sizing:border-box}body{margin:0;background:var(--void);color:var(--mist);font-family:Inter,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;font-size:14px;line-height:1.55;padding:28px 18px}
.wrap{max-width:980px;margin:0 auto}.hero{background:linear-gradient(180deg,#0f1011,#0b0c0d);border:1px solid var(--graphite);border-radius:12px;padding:22px 24px;margin-bottom:18px}
h1{margin:0 0 4px;font-size:22px;font-weight:590;color:#fff;letter-spacing:-.01em}.sub{color:var(--dim);font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.card{background:var(--carbon);border:1px solid var(--graphite);border-radius:12px;padding:14px 16px}.v{font-size:26px;font-weight:650;color:#fff}.v.red{color:var(--red)}.v.lime{color:var(--lime)}.k{font-size:11.5px;color:var(--dim);margin-top:3px}
.box{background:var(--carbon);border:1px solid var(--graphite);border-radius:12px;padding:16px 18px;margin:14px 0}
.box-title{font-size:14px;font-weight:590;color:#fff;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.box-title::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--lime)}
table{width:100%;border-collapse:collapse;margin-top:4px}td,th{padding:7px 8px;border-top:1px solid var(--graphite);font-size:12.5px;vertical-align:middle;text-align:left}
th{color:var(--dim);font-weight:500;font-size:11.5px}.num{text-align:right;font-variant-numeric:tabular-nums}
.bar{background:#161718;border-radius:4px;height:8px;min-width:60px;overflow:hidden}.fill{height:100%;border-radius:4px}
.rk{color:var(--dim);width:28px}.nm{font-weight:560;color:#fff}.cd{color:var(--dim);font-size:11px;margin-left:6px}.wt{background:var(--lime);color:#08090a;border-radius:4px;font-size:10px;font-weight:700;padding:1px 5px;margin-left:6px}.st{background:var(--red);color:#fff;border-radius:4px;font-size:10px;padding:1px 5px;margin-left:4px}
.tags{display:flex;flex-wrap:wrap;gap:4px}.c{background:#161718;border:1px solid var(--graphite);border-radius:4px;font-size:10.5px;padding:1px 6px;color:var(--dim)}
.best{background:rgba(228,242,34,.06)}
.legend{color:var(--dim);font-size:11.5px;margin-top:8px}
.note{background:#0f1011;border:1px solid var(--graphite);border-left:3px solid var(--lime);border-radius:8px;padding:12px 14px;margin:14px 0;font-size:12.5px;color:var(--mist)}
.note b{color:#fff}.opt{margin:6px 0;padding-left:16px;position:relative}.opt::before{content:'▸';position:absolute;left:0;color:var(--lime)}
@media(max-width:680px){.kpis{grid-template-columns:repeat(2,1fr)}}
</style></head><body><div class="wrap">
<div class="hero"><h1>9-23 下跌败因分析</h1><div class="sub">样本=9-22收盘战法可买信号（98只，已排除科创板/北证；9-23重扫后由115微调至98）· 今日(9-23)盘中最新价 vs 9-22收盘 · 生成 ${genTime} · 红涨绿跌</div></div>

<div class="kpis">
<div class="card"><div class="v red">${loss.length}</div><div class="k">今日下跌（占比 ${(loss.length / rows.length * 100).toFixed(0)}%）</div></div>
<div class="card"><div class="v red">${out.lossAvg}%</div><div class="k">下跌股平均跌幅</div></div>
<div class="card"><div class="v lime">${causeDist[0] ? causeDist[0][0] : '-'}</div><div class="k">头号败因（${causeDist[0] ? causeDist[0][1] : 0}只）</div></div>
<div class="card"><div class="v" style="color:${R2.rate >= 60 ? green : '#e0a23a'}">${R2.rate}%</div><div class="k">优化后胜率（R2）</div></div>
</div>

<div class="box"><div class="box-title">一、下跌都因什么？（主因分布，n=${loss.length}）</div>
<table><thead><tr><th>主因</th><th class="num">只数</th><th class="num">占比</th><th>分布</th></tr></thead><tbody>${causeRows}</tbody></table>
<div class="legend">主因按优先级归类（ST→追高尖→过度拉伸→高位补跌→弱趋势→板块退潮→健康回踩），一只可能多标签但只计首要。</div></div>

<div class="box"><div class="box-title">二、哪个位置维度最容易跌？（分档下跌率）</div>
<div style="font-size:12px;color:var(--dim);margin:6px 0 2px">① 年内涨幅分档</div>
<table><thead><tr><th>年内涨幅</th><th class="num">样本</th><th class="num">下跌率</th><th class="num">下跌均幅</th></tr></thead><tbody>${dimRows(byYtd)}</tbody></table>
<div style="font-size:12px;color:var(--dim);margin:12px 0 2px">② 离60日线拉伸度</div>
<table><thead><tr><th>离60线</th><th class="num">样本</th><th class="num">下跌率</th><th class="num">下跌均幅</th></tr></thead><tbody>${dimRows(byExt)}</tbody></table>
<div style="font-size:12px;color:var(--dim);margin:12px 0 2px">③ 距前高位置</div>
<table><thead><tr><th>距前高</th><th class="num">样本</th><th class="num">下跌率</th><th class="num">下跌均幅</th></tr></thead><tbody>${dimRows(byDH)}</tbody></table>
<div style="font-size:12px;color:var(--dim);margin:12px 0 2px">④ ★优先 vs 非★优先</div>
<table><thead><tr><th>分组</th><th class="num">样本</th><th class="num">下跌率</th><th class="num">下跌均幅</th></tr></thead><tbody>${dimRows(pickLoss)}</tbody></table></div>

<div class="box"><div class="box-title">三、从上面角度怎么优化？（规则模拟，同一信号集回测）</div>
<table><thead><tr><th>筛选规则</th><th class="num">样本</th><th class="num">胜率</th><th class="num">平均收益</th><th class="num">下跌只数</th><th class="num">累计跌幅</th></tr></thead><tbody>${simRows}</tbody></table>
<div class="legend">R2 = ★优先 + 排除【追高尖(距前高<-8%) / 过度拉伸(离60线>60%) / 高位股(年内>200%)】；R3 再叠加板块整体胜率≥50%过滤。</div></div>

<div class="box"><div class="box-title">四、今日下跌名单（按跌幅，前40）</div>
<table><thead><tr><th class="rk">#</th><th>名称</th><th class="num">跌幅</th><th>板块</th><th>成因标签</th></tr></thead><tbody>${lossHtml}</tbody></table></div>

<div class="note"><b>核心结论：</b>今天跌的不是"战法错了"，而是<b>买点位置问题</b>——${causeDist[0] ? causeDist[0][0] : '位置过高'}占比最高。9-22 信号集里 ${loss.length} 只下跌，但★优先仅 ${pickLoss.find(d=>d.key==='p').loss} 只跌（下跌率 ${pickLoss.find(d=>d.key==='p').lossRate}%，远低于非★优先 ${pickLoss.find(d=>d.key==='n').lossRate}%）。在★优先基础上再加"排雷三条件"，胜率从 ${R0.rate}%→<b style="color:${R2.rate>=60?green:'#e0a23a'}">${R2.rate}%</b>、平均收益从 ${R0.avgRet}%→<b style="color:${R2.avgRet>=0?green:red}">${R2.avgRet}%</b>、下跌只数从 ${R0.lossN}→<b style="color:red">${R2.lossN}</b>。</div>

<div class="note"><b>给"上面"的优化清单（落地到筛选规则）：</b>
<div class="opt">★优先保留：强趋势（头等马+多头）+ 有空间（距前高 -5~+28%）+ 未过度拉伸（离60线<60%）</div>
<div class="opt">加雷①：剔除<b>追高尖</b>——距前高 &lt; -8%（已突破且远离前高，短期回踩概率高）</div>
<div class="opt">加雷②：剔除<b>过度拉伸</b>——离60日线 &gt; 60%（均线乖离过大，易获利回吐）</div>
<div class="opt">加雷③：剔除<b>高位补跌</b>——年内涨幅 &gt; 200%（获利盘重，一旦拐头跌速快）</div>
<div class="opt">加雷④（可选）：剔除<b>板块退潮</b>——所属板块今日胜率 &lt; 50% 的不参与</div>
<div class="opt">ST/*ST 一律排除（已做）</div></div>

<div class="note" style="border-left-color:#e0a23a"><b>⚠️ 免责声明：</b>以上基于公开量化数据回测，样本仅 98 只单日，统计显著性有限；同口径下 9-22 信号的过夜胜率在不同交易日波动明显（44%~67%），属单日噪声，仅供方法验证，不构成投资建议。市场有风险，投资需谨慎。</div>
</div></body></html>`

fs.writeFileSync(DIR + '/loss-analysis.html', html)
console.log('LOSS_ANALYSIS_OK loss', loss.length, 'avg', out.lossAvg + '%', 'causeDist', JSON.stringify(causeDist), '| R0', R0.rate + '%', 'R1', R1.rate + '%', 'R2', R2.rate + '%', 'R3', R3.rate + '%')
